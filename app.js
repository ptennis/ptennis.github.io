import { TennisGame, clamp } from "./game.js";
import { CourtRenderer } from "./court.js";
import { RoomConnection, makeRoomCode } from "./network.js";
import { MotionRacket } from "./motion.js";
import { isPhoneDevice, PortraitGuard } from "./device.js";
import { setupPWA } from "./pwa.js";

if (!window.Vue) {
  document.querySelector("#loading").textContent =
    "Vue kon niet laden. Voer eerst npm install uit en herlaad de pagina.";
  throw new Error("Vue ontbreekt");
}
const { createApp, reactive, toRefs, computed, watch, nextTick } = Vue;

createApp({
  setup() {
    const preview = new TennisGame();
    const hash = new URLSearchParams(location.hash.slice(1));
    const query = new URLSearchParams(location.search);
    const isPhone =
      hash.has("racket") ||
      hash.has("phone") ||
      query.has("controller") ||
      (!query.has("desktop") && isPhoneDevice());
    const ui = reactive({
      page: isPhone ? "join-phone" : "home",
      isPhone,
      pairCode: "",
      joinPair: "",
      settingsOpen: false,
      joinOpen: false,
      showPairing: false,
      installHelp: false,
      screenLocked: false,
      online: navigator.onLine !== false,
      countdown: 0,
      pwa: { canInstall: false, installed: false, updateAvailable: false },
      pose: { roll: 0, pitch: 0, yaw: 0 },
      busy: false,
      error: "",
      joinCode: "",
      joinPin: "",
      mode: "solo",
      slot: 0,
      roomCode: "",
      phonePin: "",
      phoneUrl: "",
      qrSvg: "",
      keyboard: false,
      demo: false,
      difficulty: "normal",
      sound: true,
      copied: false,
      ownLinked: false,
      ownReady: false,
      opponentReady: false,
      canStart: false,
      connectionText: "",
      transport: "Verbinden…",
      latency: null,
      manualPause: false,
      paused: false,
      pauseReason: "",
      pauseTitle: "Even wachten",
      state: preview.snapshot(),
      motionStatus: {
        active: false,
        calibrated: false,
        touch: false,
        message: "",
        hasOrientation: false,
      },
      energy: 0,
      motionAim: 0,
      sensitivity: 1,
      touchAim: 0,
      phoneFlash: false,
      padState: {
        started: false,
        phase: "serve",
        serve: false,
        hittable: false,
        ownScore: 0,
        otherScore: 0,
        paused: false,
      },
    });
    let room = null,
      engine = null,
      renderer = null,
      audio = null;
    let matchId = 0,
      lastEvent = 0,
      lastPhoneFeedback = "";
    let ownPresence = { ready: false, at: 0 },
      otherPresence = { ready: false, at: 0, paused: false };
    let lastFrame = performance.now(),
      accumulator = 0,
      lastBroadcast = 0,
      lastUI = 0,
      lastSnapshot = 0;
    let remotePaused = true,
      remotePauseReason = "",
      previousRemote = null,
      remoteAt = 0;
    const keys = new Set();
    let lobbyDeadline = 0,
      visualSwingUntil = 0,
      lastMotionAt = 0;
    const portrait = new PortraitGuard(({ locked }) => {
      ui.screenLocked = locked;
    });
    const pwa = setupPWA((state) => {
      ui.pwa = state;
    });
    const racket = new MotionRacket({
      status: (value) => {
        ui.motionStatus = value;
        heartbeat();
      },
      sample: (sample) => {
        ui.energy = sample.energy;
        ui.motionAim = sample.aim;
        ui.pose = sample.pose;
        lastMotionAt = performance.now();
        const laptop = room?.find("laptop", ui.slot);
        if (laptop) room.send(laptop.info.id, "motion", sample, true);
      },
      swing: (shot) => sendPhoneSwing(shot),
    });

    function enableAudio() {
      if (!audio) {
        try {
          audio = new (window.AudioContext || window.webkitAudioContext)();
        } catch {}
      }
      audio?.resume().catch(() => {});
    }
    function beep(type) {
      if (!ui.sound || !audio || audio.state !== "running") return;
      const frequency = { hit: 680, bounce: 240, point: 880, win: 1100 }[type];
      if (!frequency) return;
      const oscillator = audio.createOscillator(),
        gain = audio.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(
        frequency * 0.56,
        audio.currentTime + 0.12,
      );
      gain.gain.setValueAtTime(0.065, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.17);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + 0.18);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    }

    function connect(options) {
      if (!ui.online) {
        ui.error = "Je bent offline. De toetsenborddemo werkt wel.";
        return;
      }
      ui.busy = true;
      ui.error = "";
      ownPresence = { ready: false, at: 0 };
      otherPresence = { ready: false, at: 0, paused: false };
      ui.connectionText = "Wedstrijd verbinden…";
      room?.close();
      room = new RoomConnection(options, {
        status: (value) => {
          ui.connectionText = value;
        },
        error: (message) => {
          ui.error = message;
          ui.busy = false;
        },
        change: refreshConnections,
        init: (msg) => {
          ui.busy = false;
          ui.slot = msg.me.slot;
          ui.mode = msg.mode;
          ui.roomCode = msg.room || options.room || "";
          ui.joinOpen = false;
          if (msg.me.role === "phone") {
            ui.page = "phone";
            ui.isPhone = true;
          } else {
            if (ui.page !== "play") ui.page = "lobby";
            ui.phonePin = msg.pin;
            ui.pairCode = msg.pairCode || "";
            const url = new URL("./", location.href);
            url.hash = new URLSearchParams(
              msg.pairCode
                ? { racket: msg.pairCode }
                : { phone: "1", room: options.room, pin: msg.pin },
            ).toString();
            ui.phoneUrl = url.href;
            if (window.qrcode) {
              const qr = qrcode(0, "M");
              qr.addData(url.href);
              qr.make();
              ui.qrSvg = qr.createSvgTag({
                cellSize: 5,
                margin: 12,
                scalable: true,
              });
            }
          }
          heartbeat();
        },
        message: onMessage,
      });
    }
    function createRoom(mode) {
      enableAudio();
      ui.mode = mode;
      ui.demo = false;
      ui.keyboard = false;
      connect({ room: makeRoomCode(), role: "laptop", mode, create: "1" });
    }
    function normalizedCode() {
      return ui.joinCode.toUpperCase().replace(/[^A-Z2-9]/g, "");
    }
    function joinLaptop() {
      const code = normalizedCode();
      if (code.length !== 6) {
        ui.error = "Vul de wedstrijdcode van 6 tekens in.";
        return;
      }
      enableAudio();
      ui.demo = false;
      ui.keyboard = false;
      connect({ room: code, role: "laptop" });
    }
    function joinPhone() {
      const pair = ui.joinPair.toUpperCase().replace(/[^A-Z2-9]/g, "");
      if (pair.length === 6) {
        connect({ pair, role: "phone" });
        return;
      }
      // Oude QR-links blijven werken na een upgrade van de frontend.
      const code = normalizedCode(),
        pin = ui.joinPin.replace(/\D/g, "");
      if (code.length === 6 && pin.length === 6) {
        connect({ room: code, role: "phone", pin });
        return;
      }
      ui.error =
        "Vul de racketcode van 6 tekens in, of scan de QR op je laptop.";
    }

    function refreshConnections() {
      const now = performance.now();
      if (ui.demo) {
        ui.ownReady = ui.keyboard;
        ui.opponentReady = true;
        ui.canStart = ui.keyboard;
        ui.transport = "Lokale demo";
        return;
      }
      const phoneMode = ui.page === "phone";
      const own = room?.find(phoneMode ? "laptop" : "phone", ui.slot);
      ui.ownLinked = !!(own && room.connected(own));
      ui.ownReady =
        !document.hidden &&
        (ui.keyboard ||
          (ui.ownLinked && ownPresence.ready && now - ownPresence.at < 2200));
      const other = room?.find("laptop", 1 - ui.slot);
      ui.opponentReady =
        ui.mode === "solo" ||
        !!(
          other &&
          room.connected(other) &&
          otherPresence.ready &&
          now - otherPresence.at < 2200
        );
      ui.canStart = ui.ownReady && ui.opponentReady;
      const relevant = [own, other].filter(Boolean);
      if (relevant.some((p) => room.transport(p) === "relay"))
        ui.transport = "Cloudflare";
      else if (
        relevant.length &&
        relevant.every((p) => room.transport(p) === "webrtc")
      )
        ui.transport = "WebRTC";
      else ui.transport = "Verbinden…";
      const rtts = relevant.map((p) => p.rtt).filter(Number.isFinite);
      ui.latency = rtts.length ? Math.max(...rtts) : null;
    }
    function updatePause() {
      if (ui.page !== "play") return;
      let reason = "";
      if (ui.slot === 1)
        reason =
          performance.now() - lastSnapshot > 2200
            ? "De verbinding met laptop 1 is onderbroken. De wedstrijd wacht."
            : remotePaused
              ? remotePauseReason
              : "";
      else if (ui.manualPause)
        reason = "Neem je tijd. Klik op Verder spelen zodra je klaar bent.";
      else if (document.hidden)
        reason = "Breng het spel op laptop 1 weer in beeld.";
      else if (!ui.ownReady)
        reason = ui.keyboard
          ? "Activeer je toetsenbord om verder te spelen."
          : "Activeer je racket op de telefoon en houd dat scherm open.";
      else if (!ui.opponentReady)
        reason =
          "Je tegenstander koppelt het racket opnieuw of heeft het scherm gesloten.";
      else if (ui.mode === "multi" && otherPresence.paused)
        reason =
          "Je tegenstander heeft gepauzeerd en kan de wedstrijd weer hervatten.";
      if (ui.slot === 1 && ui.manualPause)
        reason =
          "Jij hebt gepauzeerd. Klik op Verder spelen als je klaar bent.";
      ui.paused = !!reason;
      ui.pauseReason = reason;
      ui.pauseTitle = ui.manualPause ? "Even op adem." : "We wachten op je.";
    }
    function heartbeat() {
      refreshConnections();
      updatePause();
      if (
        ui.page === "lobby" &&
        ui.slot === 0 &&
        ui.canStart &&
        !ui.settingsOpen
      ) {
        lobbyDeadline ||= performance.now() + 3000;
        ui.countdown = Math.max(
          1,
          Math.ceil((lobbyDeadline - performance.now()) / 1000),
        );
        if (performance.now() >= lobbyDeadline) {
          lobbyDeadline = 0;
          ui.countdown = 0;
          startMatch();
        }
      } else {
        lobbyDeadline = 0;
        ui.countdown = 0;
      }
      if (!room?.me) return;
      if (ui.page === "phone") {
        const laptop = room.find("laptop", ui.slot);
        if (laptop)
          room.send(laptop.info.id, "controller", {
            ready: racket.ready,
            touch: racket.touch,
          });
        if (laptop && racket.touch)
          room.send(
            laptop.info.id,
            "motion",
            {
              pose: ui.pose,
              aim: ui.touchAim,
              energy: 0,
            },
            true,
          );
        return;
      }
      const other = room.find("laptop", 1 - ui.slot);
      if (other)
        room.send(other.info.id, "presence", {
          ready: ui.ownReady,
          paused: ui.manualPause,
        });
      const phone = room.find("phone", ui.slot);
      if (phone) {
        const s = engine?.snapshot() || ui.state;
        room.send(
          phone.info.id,
          "pad-state",
          {
            started: ui.page === "play",
            phase: s.phase,
            serve: s.server === ui.slot,
            hittable: s.hittable[ui.slot],
            paused: ui.paused,
            ownScore: s.score[ui.slot],
            otherScore: s.score[1 - ui.slot],
          },
          true,
        );
      }
    }

    function validShot(body) {
      return ["power", "aim", "loft"].every((k) => Number.isFinite(body[k]));
    }
    function validState(s) {
      return (
        s &&
        ["serve", "rally", "point", "over"].includes(s.phase) &&
        Array.isArray(s.score) &&
        s.score.length === 2 &&
        s.score.every(Number.isFinite) &&
        Array.isArray(s.players) &&
        s.players.length === 2 &&
        s.players.every((p) =>
          ["x", "z", "swing"].every((k) => Number.isFinite(p?.[k])),
        ) &&
        s.ball &&
        ["x", "y", "z", "vx", "vy", "vz"].every((k) =>
          Number.isFinite(s.ball[k]),
        ) &&
        Array.isArray(s.hittable) &&
        s.hittable.length === 2 &&
        s.event &&
        Number.isSafeInteger(s.event.id) &&
        Number.isFinite(s.time)
      );
    }
    function onMessage(peer, kind, body) {
      const now = performance.now();
      if (ui.page === "phone") {
        if (peer.role !== "laptop" || peer.slot !== ui.slot) return;
        if (
          kind === "pad-state" &&
          Number.isFinite(body.ownScore) &&
          Number.isFinite(body.otherScore)
        )
          ui.padState = body;
        if (kind === "feedback") {
          const id = `${body.match}:${body.id}`;
          if (id === lastPhoneFeedback) return;
          lastPhoneFeedback = id;
          if (
            body.slot === ui.slot &&
            ["hit", "point", "win"].includes(body.type)
          ) {
            navigator.vibrate?.(body.type === "hit" ? 25 : [40, 35, 40]);
            ui.phoneFlash = true;
            setTimeout(() => {
              ui.phoneFlash = false;
            }, 160);
          }
        }
        return;
      }
      if (peer.role === "phone" && peer.slot === ui.slot) {
        if (kind === "controller") {
          ownPresence = { ready: body.ready === true, at: now };
          refreshConnections();
        }
        if (kind === "motion") {
          // Ruwe accelerometer-, gyroscoop- en oriëntatiedata komen hier op de eigen laptop aan.
          // Voor debuggen: zet een breakpoint op deze regel.
          if (Number.isFinite(body.energy))
            ui.energy = clamp(body.energy, 0, 1);
          if (Number.isFinite(body.aim)) ui.motionAim = clamp(body.aim, -1, 1);
          if (
            body.pose &&
            ["roll", "pitch", "yaw"].every((k) => Number.isFinite(body.pose[k]))
          ) {
            ui.pose = Object.fromEntries(
              ["roll", "pitch", "yaw"].map((k) => [
                k,
                clamp(body.pose[k], -100, 100),
              ]),
            );
            lastMotionAt = now;
          }
        }
        if (kind === "swing" && validShot(body) && !ui.keyboard)
          localSwing(body);
      }
      if (peer.role !== "laptop") return;
      if (kind === "presence") {
        otherPresence = {
          ready: body.ready === true,
          paused: body.paused === true,
          at: now,
        };
        refreshConnections();
      }
      if (
        ui.slot === 0 &&
        peer.slot === 1 &&
        kind === "swing" &&
        validShot(body) &&
        !ui.paused &&
        ui.page === "play"
      )
        engine?.swing(1, body);
      if (
        ui.slot === 1 &&
        peer.slot === 0 &&
        kind === "match" &&
        validState(body.state)
      ) {
        if (body.match !== matchId) {
          matchId = body.match;
          lastEvent = 0;
          previousRemote = null;
        } else previousRemote = ui.state;
        ui.state = body.state;
        lastSnapshot = remoteAt = now;
        remotePaused = !!body.paused;
        remotePauseReason = String(body.reason || "Wachten op laptop 1.");
        if (body.started) ui.page = "play";
        updatePause();
        if (body.state.event.id > lastEvent) handleEvent(body.state.event);
      }
      if (
        ui.slot === 1 &&
        peer.slot === 0 &&
        kind === "event" &&
        body.id > lastEvent &&
        body.match === matchId
      )
        handleEvent(body);
    }
    function handleEvent(event) {
      lastEvent = event.id;
      beep(event.type);
      const phone = room?.find("phone", ui.slot);
      if (phone)
        room.send(phone.info.id, "feedback", { ...event, match: matchId });
      if (ui.slot === 0) {
        const other = room?.find("laptop", 1);
        if (other)
          room.send(other.info.id, "event", { ...event, match: matchId });
      }
    }
    function localSwing(shot) {
      visualSwingUntil = performance.now() + 300;
      updatePause();
      if (ui.page !== "play" || ui.paused) return;
      if (ui.slot === 0) engine?.swing(0, shot);
      else {
        const host = room?.find("laptop", 0);
        if (host) room.send(host.info.id, "swing", shot);
      }
    }
    function sendPhoneSwing(shot) {
      const laptop = room?.find("laptop", ui.slot);
      if (laptop && racket.ready) room.send(laptop.info.id, "swing", shot);
    }
    function touchSwing() {
      ui.energy = 0.6;
      sendPhoneSwing({ power: 0.6, aim: ui.touchAim, loft: 0 });
    }
    function startMatch() {
      refreshConnections();
      if (!ui.canStart || ui.slot !== 0) return;
      enableAudio();
      document.activeElement?.blur();
      ui.manualPause = false;
      ui.showPairing = false;
      ui.settingsOpen = false;
      engine = new TennisGame({ mode: ui.mode, difficulty: ui.difficulty });
      matchId++;
      lastEvent = 0;
      accumulator = 0;
      ui.state = engine.snapshot();
      ui.page = "play";
      updatePause();
      broadcast(true);
      heartbeat();
    }
    function startDemo() {
      room?.close();
      room = null;
      ui.slot = 0;
      ui.mode = "solo";
      ui.demo = true;
      ui.keyboard = true;
      ui.difficulty = "easy";
      refreshConnections();
      startMatch();
    }
    function togglePause() {
      enableAudio();
      ui.manualPause = !ui.manualPause;
      heartbeat();
      broadcast(true);
    }
    function broadcast(reliable = false) {
      if (ui.slot !== 0 || !room?.me || room.me.role !== "laptop") return;
      const other = room.find("laptop", 1);
      if (other)
        room.send(
          other.info.id,
          "match",
          {
            match: matchId,
            started: !!engine,
            state: engine?.snapshot() || preview.snapshot(),
            paused: ui.paused,
            reason: ui.pauseReason,
          },
          !reliable,
        );
    }
    async function copy(value) {
      try {
        await navigator.clipboard.writeText(value);
        ui.copied = true;
        setTimeout(() => {
          ui.copied = false;
        }, 1800);
      } catch {
        ui.error =
          "Kopiëren lukt hier niet. Je kunt de getoonde codes handmatig overnemen.";
      }
    }
    function enableMotion() {
      const activation = racket.start();
      portrait.start();
      activation.then(() => {
        if (!racket.active) portrait.stop();
      });
    }
    function calibrate() {
      racket.calibrate();
    }
    function useTouch() {
      racket.useTouch();
      portrait.start();
      ui.settingsOpen = false;
    }
    function setSensitivity() {
      racket.detector.sensitivity = ui.sensitivity;
    }
    function setManualAim() {
      racket.manualAim = ui.touchAim;
      ui.pose = { roll: 0, pitch: 0, yaw: ui.touchAim * 45 };
      const laptop = room?.find("laptop", ui.slot);
      if (laptop)
        room.send(
          laptop.info.id,
          "motion",
          { pose: ui.pose, aim: ui.touchAim, energy: 0 },
          true,
        );
    }
    function leaveGame() {
      room?.close();
      room = null;
      engine = null;
      racket.stop();
      portrait.stop();
      ui.page = ui.isPhone ? "join-phone" : "home";
      ui.busy = false;
      ui.error = "";
      ui.demo = false;
      ui.keyboard = false;
      ui.settingsOpen = false;
      ui.showPairing = false;
      ui.joinOpen = false;
      ui.ownLinked = false;
      ui.ownReady = false;
      ui.manualPause = false;
      ui.paused = false;
      ui.joinPair = "";
      ui.joinCode = "";
      ui.joinPin = "";
      ui.motionStatus = {
        active: false,
        calibrated: false,
        touch: false,
        message: "",
        hasOrientation: false,
      };
      ui.pose = { roll: 0, pitch: 0, yaw: 0 };
      lastMotionAt = 0;
      ui.state = preview.snapshot();
      history.replaceState(null, "", location.pathname + location.search);
    }
    async function installApp() {
      if (!(await pwa.install())) ui.installHelp = true;
    }
    function fullScreen() {
      if (document.fullscreenElement)
        document.exitFullscreen?.().catch(() => {});
      else document.documentElement.requestFullscreen?.().catch(() => {});
    }
    watch(
      () => ui.settingsOpen,
      (open) => {
        if (open && ui.page === "play") {
          ui.manualPause = true;
          heartbeat();
        }
      },
    );
    watch(
      () => ui.joinOpen,
      (open) => {
        if (open)
          nextTick(() => document.querySelector("#match-code")?.focus());
      },
    );
    document.addEventListener("keydown", (event) => {
      if (event.code === "Escape") {
        ui.settingsOpen = false;
        ui.joinOpen = false;
        ui.showPairing = false;
      }
    });
    window.addEventListener("online", () => {
      ui.online = true;
    });
    window.addEventListener("offline", () => {
      ui.online = false;
    });
    watch(
      () => ui.keyboard,
      () => {
        document.activeElement?.blur();
        heartbeat();
      },
    );

    const phoneHeadline = computed(() =>
      !ui.ownLinked
        ? "Even verbinden."
        : !ui.motionStatus.calibrated
          ? "Jij bent het racket."
          : !ui.padState.started
            ? "Racket klaar."
            : ui.padState.paused
              ? "Even wachten."
              : ui.padState.phase === "over"
                ? "Goed gespeeld!"
                : ui.padState.hittable
                  ? ui.padState.phase === "serve"
                    ? "Jij serveert."
                    : "Sla maar!"
                  : "Blijf in de rally.",
    );
    const phoneHint = computed(() =>
      !ui.motionStatus.calibrated
        ? "Activeer je sensoren. Houd je telefoon rechtop en even stil."
        : !ui.padState.started
          ? "Kijk naar je laptop. Daar start de wedstrijd."
          : ui.padState.paused
            ? "Kijk op je laptop om verder te spelen."
            : ui.padState.phase === "serve" && ui.padState.serve
              ? "Een kleine zwaai en de bal is in het spel."
              : "Kijk naar je laptop en zwaai als de bal bij je is.",
    );

    function frame(now) {
      const dt = Math.min((now - lastFrame) / 1000, 0.08);
      lastFrame = now;
      if (ui.page === "play" && ui.slot === 0 && engine) {
        updatePause();
        if (!ui.paused && engine.phase !== "over") {
          accumulator += dt;
          while (accumulator >= 1 / 120) {
            engine.step(1 / 120);
            accumulator -= 1 / 120;
          }
        } else accumulator = 0;
        if (engine.event.id > lastEvent) handleEvent(engine.event);
      }
      if (now - lastUI > 50) {
        if (engine) ui.state = engine.snapshot();
        lastUI = now;
      }
      if (now - lastBroadcast > 40) {
        broadcast();
        lastBroadcast = now;
      }
      const canvas = document.querySelector("#game-court");
      if (canvas) {
        if (renderer?.canvas !== canvas) renderer = new CourtRenderer(canvas);
        let shown = engine?.snapshot() || ui.state;
        if (ui.page === "home") {
          shown = preview.snapshot();
          shown.ball.x = -1.1 + Math.sin(now / 1800) * 0.2;
          shown.ball.z = 7.3;
          shown.ball.y = 1.65 + Math.sin(now / 1400) * 0.12;
        } else if (ui.slot === 1 && previousRemote && !ui.paused) {
          const alpha = clamp((now - remoteAt) / 45, 0, 1);
          shown = {
            ...ui.state,
            ball: { ...ui.state.ball },
            players: ui.state.players.map((p) => ({ ...p })),
          };
          for (const axis of ["x", "y", "z"])
            shown.ball[axis] =
              previousRemote.ball[axis] +
              (ui.state.ball[axis] - previousRemote.ball[axis]) * alpha;
          shown.players.forEach((p, i) => {
            p.x =
              previousRemote.players[i].x +
              (ui.state.players[i].x - previousRemote.players[i].x) * alpha;
          });
        }
        renderer.draw(
          shown,
          ui.slot,
          ui.page === "home" || ui.page === "lobby",
          {
            pose: ui.keyboard || now - lastMotionAt < 2000 ? ui.pose : undefined,
            swing: Math.max(0, (visualSwingUntil - now) / 1000),
          },
        );
      }
      requestAnimationFrame(frame);
    }
    setInterval(heartbeat, 250);
    requestAnimationFrame(frame);
    window.addEventListener("keydown", (event) => {
      if (
        event.target.closest("input,select,textarea,button") ||
        event.target.isContentEditable
      )
        return;
      if (!ui.keyboard || ui.page !== "play") return;
      if (["Space", "ArrowLeft", "ArrowRight", "ArrowUp"].includes(event.code))
        event.preventDefault();
      keys.add(event.code);
      ui.pose = {
        roll: 0,
        yaw:
          (keys.has("ArrowRight") ? 30 : 0) - (keys.has("ArrowLeft") ? 30 : 0),
        pitch: keys.has("ArrowUp") ? 30 : 0,
      };
      lastMotionAt = performance.now();
      if (event.code === "Space" && !event.repeat) {
        enableAudio();
        localSwing({
          power: 0.6,
          aim:
            (keys.has("ArrowRight") ? 0.65 : 0) -
            (keys.has("ArrowLeft") ? 0.65 : 0),
          loft: keys.has("ArrowUp") ? 0.65 : 0,
        });
      }
      if (event.code === "KeyP" && !event.repeat) togglePause();
    });
    window.addEventListener("keyup", (event) => {
      keys.delete(event.code);
      if (ui.keyboard) ui.pose = { roll: 0, pitch: 0, yaw: 0 };
    });
    document.addEventListener("pointermove", (event) => {
      if (
        !ui.keyboard ||
        ui.page !== "play" ||
        event.target.id !== "game-court"
      )
        return;
      ui.motionAim = clamp((event.clientX / innerWidth - 0.5) * 1.7, -1, 1);
      ui.pose = { roll: 0, pitch: 0, yaw: ui.motionAim * 45 };
      lastMotionAt = performance.now();
    });
    document.addEventListener("pointerdown", (event) => {
      if (
        ui.keyboard &&
        ui.page === "play" &&
        event.target.id === "game-court"
      ) {
        enableAudio();
        localSwing({ power: 0.6, aim: ui.motionAim, loft: 0 });
      }
    });
    window.addEventListener("blur", () => keys.clear());
    document.addEventListener("visibilitychange", () => {
      keys.clear();
      heartbeat();
      broadcast(true);
      if (!document.hidden && racket.active) racket.wake();
    });
    window.addEventListener("pagehide", () => {
      racket.stop();
      portrait.stop();
      room?.close();
    });
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) location.reload();
    });
    const params = new URLSearchParams(location.hash.slice(1));
    if (params.has("racket")) {
      ui.joinPair = params.get("racket") || "";
      setTimeout(joinPhone, 0);
    } else if (params.has("phone")) {
      ui.page = "join-phone";
      ui.joinCode = params.get("room") || "";
      ui.joinPin = params.get("pin") || "";
      if (ui.joinCode && ui.joinPin) setTimeout(joinPhone, 0);
    } else if (params.has("join")) {
      ui.joinCode = params.get("join") || "";
      ui.joinOpen = true;
    }
    document.querySelector("#loading").remove();
    return {
      ...toRefs(ui),
      leaveGame,
      installApp,
      fullScreen,
      applyUpdate: () => pwa.applyUpdate(),
      racketStyle: computed(() => ({
        transform: `perspective(700px) rotateZ(${ui.pose.roll + ui.pose.yaw * 0.42}deg) rotateY(${ui.pose.yaw}deg) rotateX(${-ui.pose.pitch}deg)`,
      })),
      phoneHeadline,
      phoneHint,
      createRoom,
      joinLaptop,
      joinPhone,
      startDemo,
      startMatch,
      togglePause,
      copy,
      enableAudio,
      enableMotion,
      calibrate,
      useTouch,
      setSensitivity,
      setManualAim,
      touchSwing,
    };
  },
}).mount("#app");
