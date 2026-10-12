// WebRTC-transport. Alleen de nieuwkomer maakt een offer, zodat er geen glare is.
// ICE-candidates worden bewaard totdat de remote description is gezet.
import { signalingURL } from "./config.js";
const useful = (a, b) =>
  a.id !== b.id &&
  ((a.role === "laptop" && b.role === "laptop") ||
    (a.role !== b.role && a.slot === b.slot));

export function makeRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(
    crypto.getRandomValues(new Uint8Array(6)),
    (n) => alphabet[n % alphabet.length],
  ).join("");
}

export class RoomConnection {
  constructor(options, callbacks = {}) {
    const key = `pennis:${options.role}:${options.room || options.pair}`;
    let token = options.token;
    try {
      token ||= sessionStorage.getItem(key);
    } catch {}
    token ||= crypto.randomUUID();
    try {
      sessionStorage.setItem(key, token);
    } catch {}
    this.options = { ...options, token };
    this.callbacks = callbacks;
    this.peers = new Map();
    this.roster = [];
    this.me = null;
    this.ws = null;
    this.closed = false;
    this.attempts = 0;
    this.heartbeat = setInterval(() => this.tick(), 1000);
    this.connect();
  }

  connect() {
    if (this.closed) return;
    this.callbacks.status?.("Verbinden…");
    const url = signalingURL();
    for (const [key, value] of Object.entries(this.options))
      if (value != null) url.searchParams.set(key, String(value));
    const ws = (this.ws = new WebSocket(url));
    let chain = Promise.resolve();
    this.openTimeout = setTimeout(() => {
      if (ws.readyState < 2 && !this.me) ws.close();
    }, 12000);
    ws.onmessage = (event) => {
      // SDP en ICE moeten ook bij snelle berichtvolgorde sequentieel verwerkt worden.
      chain = chain
        .then(async () => {
          if (ws !== this.ws || this.closed) return;
          let msg;
          try {
            msg = JSON.parse(event.data);
          } catch {
            return;
          }
          await this.signal(msg);
        })
        .catch(() =>
          this.callbacks.status?.(
            "Directe verbinding lukt niet; Cloudflare wordt geprobeerd.",
          ),
        );
    };
    ws.onerror = () =>
      this.callbacks.status?.("Netwerk niet bereikbaar. Opnieuw verbinden…");
    ws.onclose = () => {
      if (ws !== this.ws || this.closed) return;
      clearTimeout(this.openTimeout);
      this.clearPeers();
      this.me = null;
      this.roster = [];
      this.callbacks.change?.();
      if (!this.closed) {
        this.callbacks.status?.("Verbinding onderbroken. Opnieuw verbinden…");
        this.retry = setTimeout(
          () => this.connect(),
          Math.min(1000 * 2 ** this.attempts++, 12000),
        );
      }
    };
  }

  async signal(msg) {
    if (msg.type === "error") {
      this.callbacks.error?.(msg.message);
      this.close();
      return;
    }
    if (msg.type === "init") {
      clearTimeout(this.openTimeout);
      this.attempts = 0;
      this.options.create = "0";
      this.me = msg.me;
      this.roster = [msg.me, ...msg.peers];
      this.callbacks.init?.(msg);
      for (const peer of msg.peers)
        if (useful(this.me, peer)) {
          const entry = this.makePeer(peer);
          if (!entry.pc) continue;
          this.attachChannel(
            entry,
            entry.pc.createDataChannel("events", { ordered: true }),
          );
          this.attachChannel(
            entry,
            entry.pc.createDataChannel("live", {
              ordered: false,
              maxRetransmits: 0,
            }),
          );
          try {
            await entry.pc.setLocalDescription(await entry.pc.createOffer());
            this.sendSignal({
              type: "offer",
              target: peer.id,
              sdp: entry.pc.localDescription,
            });
          } catch {
            entry.fallback = true;
          }
        }
      this.callbacks.status?.("Wedstrijd verbonden");
      this.callbacks.change?.();
      return;
    }
    if (msg.type === "roster") {
      this.roster = msg.peers;
      for (const peer of msg.peers)
        if (this.me && useful(this.me, peer)) this.makePeer(peer);
      for (const [id, peer] of this.peers)
        if (!msg.peers.some((p) => p.id === id)) {
          peer.pc?.close();
          this.peers.delete(id);
        }
      this.callbacks.change?.();
      return;
    }
    if (
      msg.type === "pong" ||
      !msg.sender ||
      !this.me ||
      !msg.peer ||
      !useful(this.me, msg.peer)
    )
      return;
    const peer = this.peers.get(msg.sender) || this.makePeer(msg.peer);
    if (msg.type === "relay") {
      this.receive(peer, msg.packet);
      return;
    }
    if (!peer.pc) return;
    if (msg.type === "offer") {
      await peer.pc.setRemoteDescription(msg.sdp);
      await this.flushIce(peer);
      await peer.pc.setLocalDescription(await peer.pc.createAnswer());
      this.sendSignal({
        type: "answer",
        target: peer.info.id,
        sdp: peer.pc.localDescription,
      });
    } else if (msg.type === "answer") {
      await peer.pc.setRemoteDescription(msg.sdp);
      await this.flushIce(peer);
    } else if (msg.type === "candidate" && msg.candidate) {
      if (peer.pc.remoteDescription) {
        try {
          await peer.pc.addIceCandidate(msg.candidate);
        } catch {
          /* ICE kan al vervangen zijn */
        }
      } else peer.ice.push(msg.candidate);
    }
  }

  makePeer(info) {
    if (this.peers.has(info.id)) return this.peers.get(info.id);
    const peer = {
      info,
      pc: null,
      ice: [],
      events: null,
      live: null,
      created: performance.now(),
      lastSeen: performance.now(),
      seq: { events: 0, live: 0 },
      received: { events: 0, live: 0 },
      rtt: null,
    };
    this.peers.set(info.id, peer);
    try {
      const pc = (peer.pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      }));
      pc.onicecandidate = (event) => {
        if (event.candidate)
          this.sendSignal({
            type: "candidate",
            target: info.id,
            candidate: event.candidate,
          });
      };
      pc.ondatachannel = (event) => this.attachChannel(peer, event.channel);
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") peer.fallback = true;
        this.callbacks.change?.();
      };
    } catch {
      peer.fallback = true;
    }
    return peer;
  }

  async flushIce(peer) {
    for (const candidate of peer.ice.splice(0)) {
      try {
        await peer.pc.addIceCandidate(candidate);
      } catch {}
    }
  }

  attachChannel(peer, channel) {
    if (!["events", "live"].includes(channel.label)) {
      channel.close();
      return;
    }
    peer[channel.label] = channel;
    channel.onopen = () => {
      peer.fallback = false;
      this.callbacks.change?.();
    };
    channel.onclose = () => this.callbacks.change?.();
    channel.onerror = () => {
      peer.fallback = true;
      this.callbacks.change?.();
    };
    channel.onmessage = (event) => {
      if (typeof event.data !== "string" || event.data.length > 32768) return;
      try {
        this.receive(peer, JSON.parse(event.data));
      } catch {}
    };
  }

  transport(peer) {
    if (!peer) return "connecting";
    if (!peer.fallback && peer.events?.readyState === "open") return "webrtc";
    // Meteen bruikbaar tijdens de WebRTC-handshake. Automatisch direct zodra
    // het datakanaal open is; geen zes seconden wachten op een racket.
    if (this.ws?.readyState === 1) return "relay";
    return "connecting";
  }
  connected(peer) {
    return (
      this.transport(peer) !== "connecting" &&
      performance.now() - peer.lastSeen < 5500
    );
  }
  find(role, slot) {
    return [...this.peers.values()].find(
      (p) => p.info.role === role && p.info.slot === slot,
    );
  }

  send(id, kind, body = {}, fast = false) {
    const peer = this.peers.get(id);
    if (!peer) return false;
    const stream = fast ? "live" : "events";
    const packet = { stream, seq: ++peer.seq[stream], kind, body };
    const channel = peer[stream];
    if (this.transport(peer) === "webrtc" && channel?.readyState === "open") {
      if (channel.bufferedAmount > 65536 && fast) return false;
      try {
        channel.send(JSON.stringify(packet));
        return true;
      } catch {
        peer.fallback = true;
      }
    }
    if (this.transport(peer) !== "connecting")
      return this.sendSignal({ type: "relay", target: id, packet });
    return false;
  }

  receive(peer, packet) {
    if (
      !packet ||
      !["events", "live"].includes(packet.stream) ||
      !Number.isSafeInteger(packet.seq)
    )
      return;
    if (packet.seq <= peer.received[packet.stream]) return;
    peer.received[packet.stream] = packet.seq;
    peer.lastSeen = performance.now();
    const body = packet.body;
    if (!body || typeof body !== "object") return;
    if (packet.kind === "_ping")
      this.send(peer.info.id, "_pong", { at: body.at });
    else if (packet.kind === "_pong") {
      if (Number.isFinite(body.at))
        peer.rtt = Math.round(performance.now() - body.at);
    } else this.callbacks.message?.(peer.info, packet.kind, body);
  }

  sendSignal(value) {
    if (this.ws?.readyState !== 1 || this.ws.bufferedAmount > 131072)
      return false;
    this.ws.send(JSON.stringify(value));
    return true;
  }
  tick() {
    if (this.closed) return;
    this.sendSignal({ type: "ping" });
    for (const peer of this.peers.values())
      this.send(peer.info.id, "_ping", { at: performance.now() });
    this.callbacks.change?.();
  }
  clearPeers() {
    for (const peer of this.peers.values()) peer.pc?.close();
    this.peers.clear();
  }
  close() {
    this.closed = true;
    this.callbacks = {};
    clearTimeout(this.retry);
    clearTimeout(this.openTimeout);
    clearInterval(this.heartbeat);
    this.clearPeers();
    this.ws?.close();
  }
}
