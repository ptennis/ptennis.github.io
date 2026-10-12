// Kleine, onafhankelijke spelkern. Alleen de host roept step() aan (120 Hz).
// x = links/rechts, z = lengte van de baan, y = hoogte, alles in spelmeters.
export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const finite = (n, fallback) => (Number.isFinite(n) ? n : fallback);
export const SIDE = [1, -1];
export const RULES = {
  halfWidth: 4,
  halfLength: 10,
  net: 1.05,
  gravity: 9.8,
  target: 7,
};

export class TennisGame {
  constructor({
    mode = "solo",
    difficulty = "normal",
    random = Math.random,
  } = {}) {
    this.mode = mode;
    this.difficulty = difficulty;
    this.random = random;
    this.score = [0, 0];
    this.players = [
      { x: 0, z: 8.2, swing: 0 },
      { x: 0, z: -8.2, swing: 0 },
    ];
    this.time = 0;
    this.server = 0;
    this.phase = "serve";
    this.phaseTime = 0;
    this.message = "Speler 1 serveert";
    this.rally = 0;
    this.longestRally = 0;
    this.winner = null;
    this.event = { id: 0, type: "ready", slot: 0 };
    this.pending = [null, null];
    this.lastSwing = [-10, -10];
    this.resetBall();
  }
  resetBall() {
    this.ball = {
      x: this.players[this.server].x,
      z: SIDE[this.server] * 8.2,
      y: 1.35,
      vx: 0,
      vz: 0,
      vy: 0,
      last: this.server,
      bounces: 0,
      in: false,
    };
    this.pending = [null, null];
    this.rally = 0;
    this.aiAttempt = false;
  }
  emit(type, slot, text = "") {
    this.event = { id: this.event.id + 1, type, slot, text };
  }
  canHit(slot) {
    if (this.phase === "serve") return slot === this.server;
    if (this.phase !== "rally" || this.ball.last === slot) return false;
    const p = this.players[slot],
      b = this.ball;
    return (
      b.z * SIDE[slot] > 0 &&
      Math.abs(b.z - p.z) < 1.55 &&
      Math.abs(b.x - p.x) < 1.5 &&
      b.y > 0.12 &&
      b.y < 3.2
    );
  }
  swing(slot, input = {}) {
    if (![0, 1].includes(slot) || this.time - this.lastSwing[slot] < 0.28)
      return false;
    if (!["serve", "rally"].includes(this.phase)) return false;
    this.lastSwing[slot] = this.time;
    this.players[slot].swing = 0.3;
    const shot = {
      power: clamp(finite(input.power, 0.5), 0, 1),
      aim: clamp(finite(input.aim, 0), -1, 1),
      loft: clamp(finite(input.loft, 0), -1, 1),
    };
    if (this.canHit(slot)) {
      this.hit(slot, shot);
      return true;
    }
    // Korte invoerbuffer maakt een nét vroege zwaai speelbaar.
    if (this.phase === "rally" && this.ball.last !== slot)
      this.pending[slot] = { until: this.time + 0.16, shot };
    return false;
  }
  hit(slot, shot) {
    const b = this.ball;
    const wasServe = this.phase === "serve";
    const targetX = shot.aim * 4.45 * SIDE[slot];
    const targetZ = -SIDE[slot] * 6.3;
    const flight = 1.58 - 0.37 * shot.power;
    b.vx = (targetX - b.x) / flight;
    b.vz = (targetZ - b.z) / flight;
    b.vy =
      (0.14 - b.y + 0.5 * RULES.gravity * flight * flight) / flight +
      shot.loft * 1.45;
    b.last = slot;
    b.bounces = 0;
    b.in = false;
    this.phase = "rally";
    this.phaseTime = 0;
    this.pending = [null, null];
    this.aiAttempt = false;
    this.rally++;
    this.longestRally = Math.max(this.longestRally, this.rally);
    this.message = wasServe ? "Daar gaan we!" : "Mooie slag!";
    this.emit("hit", slot);
  }
  point(slot, reason) {
    if (this.phase !== "rally") return;
    this.score[slot]++;
    this.phaseTime = 0;
    this.pending = [null, null];
    if (
      this.score[slot] >= RULES.target &&
      this.score[slot] - this.score[1 - slot] >= 2
    ) {
      this.phase = "over";
      this.winner = slot;
      this.message = `Speler ${slot + 1} wint!`;
    } else {
      this.phase = "point";
      this.message = reason;
    }
    this.emit(this.phase === "over" ? "win" : "point", slot, reason);
  }
  step(dt) {
    this.time += dt;
    this.phaseTime += dt;
    for (let slot = 0; slot < 2; slot++) {
      const p = this.players[slot];
      p.swing = Math.max(0, p.swing - dt);
      let target = 0;
      if (
        this.phase === "rally" &&
        this.ball.last !== slot &&
        Math.abs(this.ball.vz) > 0.1
      ) {
        const future = Math.max(0, (p.z - this.ball.z) / this.ball.vz);
        target = clamp(this.ball.x + this.ball.vx * future, -3.85, 3.85);
      }
      const speed =
        slot === 1 && this.mode === "solo" && this.difficulty === "easy"
          ? 4.0
          : 6.8;
      p.x += clamp(target - p.x, -speed * dt, speed * dt);
    }
    if (this.phase === "point" && this.phaseTime > 2) {
      this.server = Math.floor((this.score[0] + this.score[1]) / 2) % 2;
      this.phase = "serve";
      this.phaseTime = 0;
      this.message = `Speler ${this.server + 1} serveert`;
      this.resetBall();
    }
    if (this.phase === "serve") {
      this.ball.x = this.players[this.server].x;
      if (this.mode === "solo" && this.server === 1 && this.phaseTime > 1.25)
        this.swing(1, this.aiShot());
      return;
    }
    if (this.phase !== "rally") return;

    const b = this.ball,
      oldZ = b.z,
      oldY = b.y;
    b.x += b.vx * dt;
    b.z += b.vz * dt;
    b.y += b.vy * dt - 0.5 * RULES.gravity * dt * dt;
    b.vy -= RULES.gravity * dt;
    if (oldZ * b.z < 0) {
      const crossing = Math.abs(oldZ) / (Math.abs(oldZ) + Math.abs(b.z));
      const height = oldY + (b.y - oldY) * crossing;
      if (height < RULES.net + 0.12) {
        this.point(1 - b.last, "In het net");
        return;
      }
    }
    if (b.y <= 0.14) {
      b.bounces++;
      const receivingSide = -SIDE[b.last];
      if (b.bounces === 1) {
        b.in =
          Math.abs(b.x) <= RULES.halfWidth + 0.06 &&
          Math.abs(b.z) <= RULES.halfLength + 0.06 &&
          b.z * receivingSide > 0;
        if (!b.in) {
          this.point(1 - b.last, "De bal is uit");
          return;
        }
        b.y = 0.14;
        b.vy = Math.abs(b.vy) * 0.72;
        this.emit("bounce", 1 - b.last);
      } else {
        this.point(b.last, "Twee keer gestuiterd");
        return;
      }
    }
    for (let slot = 0; slot < 2; slot++) {
      const input = this.pending[slot];
      if (input && input.until < this.time) this.pending[slot] = null;
      else if (input && this.canHit(slot)) this.hit(slot, input.shot);
    }
    if (
      this.mode === "solo" &&
      b.last === 0 &&
      !this.aiAttempt &&
      this.canHit(1) &&
      b.z < -7.6
    ) {
      this.aiAttempt = true;
      if (this.random() > (this.difficulty === "easy" ? 0.26 : 0.09))
        this.swing(1, this.aiShot());
    }
    if (Math.abs(b.z) > 13 || Math.abs(b.x) > 7)
      this.point(
        b.in ? b.last : 1 - b.last,
        b.in ? "Niet meer te halen" : "De bal is uit",
      );
  }
  aiShot() {
    return {
      power: this.difficulty === "easy" ? 0.3 : 0.6,
      aim: (this.random() - 0.5) * (this.difficulty === "easy" ? 0.95 : 1.5),
      loft: 0.1,
    };
  }
  snapshot() {
    return {
      mode: this.mode,
      phase: this.phase,
      phaseTime: this.phaseTime,
      time: this.time,
      score: [...this.score],
      server: this.server,
      message: this.message,
      winner: this.winner,
      players: this.players.map((p) => ({ ...p })),
      ball: { ...this.ball },
      rally: this.rally,
      longestRally: this.longestRally,
      event: { ...this.event },
      hittable: [this.canHit(0), this.canHit(1)],
    };
  }
}
