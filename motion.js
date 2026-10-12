import { clamp } from "./game.js";
const length = (v) => Math.hypot(v.x || 0, v.y || 0, v.z || 0);
const RAD = Math.PI / 180;
const multiply = (a, b) => ({
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
});

// DeviceOrientation is intrinsiek Z-X-Y, niet drie losse schermhoeken.
// Relatieve quaternions voorkomen sprongen bij alpha 359° → 0° en blijven
// onafhankelijk van portrait/landscape. Geen externe 3D-bibliotheek nodig.
export function orientationQuaternion({ alpha = 0, beta = 0, gamma = 0 }) {
  const axis = (key, degrees) => ({
    w: Math.cos(((degrees || 0) * RAD) / 2),
    x: 0,
    y: 0,
    z: 0,
    [key]: Math.sin(((degrees || 0) * RAD) / 2),
  });
  return multiply(
    multiply(axis("z", alpha), axis("x", beta)),
    axis("y", gamma),
  );
}

export function relativePose(orientation, baseline) {
  if (!orientation || !baseline) return { roll: 0, pitch: 0, yaw: 0 };
  const b = orientationQuaternion(baseline);
  const q = multiply(
    { w: b.w, x: -b.x, y: -b.y, z: -b.z },
    orientationQuaternion(orientation),
  );
  return {
    roll: clamp(
      Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z)) /
        RAD,
      -100,
      100,
    ),
    pitch: clamp(
      Math.atan2(2 * (q.w * q.x + q.y * q.z), 1 - 2 * (q.x * q.x + q.y * q.y)) /
        RAD,
      -80,
      80,
    ),
    yaw: Math.asin(clamp(2 * (q.w * q.y - q.z * q.x), -1, 1)) / RAD,
  };
}

// Hysterese: één slag per zwaai; pas na rust opnieuw activeren.
export class SwingDetector {
  constructor() {
    this.reset();
    this.sensitivity = 1;
  }
  reset() {
    this.armed = true;
    this.lastSwing = -1000;
    this.quietSince = null;
  }
  feed(sample, now) {
    const gyro = length(sample.rotation);
    const acceleration = length(sample.acceleration);
    const strength = Math.max(gyro / 180, acceleration / 9);
    const threshold = 1.1 / this.sensitivity;
    if (strength < threshold * 0.45) {
      this.quietSince ??= now;
      if (now - this.quietSince > 120) this.armed = true;
    } else this.quietSince = null;
    if (this.armed && strength > threshold && now - this.lastSwing > 450) {
      this.armed = false;
      this.lastSwing = now;
      return {
        power: clamp(0.25 + (strength - threshold) * 0.42, 0.2, 1),
        aim: sample.aim,
        loft: sample.loft,
      };
    }
    return null;
  }
}

export class MotionRacket {
  constructor({ sample, swing, status }) {
    this.onSample = sample;
    this.onSwing = swing;
    this.onStatus = status;
    this.detector = new SwingDetector();
    this.active = false;
    this.calibrated = false;
    this.touch = false;
    this.orientation = null;
    this.baseline = null;
    this.gravity = null;
    this.lastSample = 0;
    this.lastSent = 0;
    this.energy = 0;
    this.onMotion = this.onMotion.bind(this);
    this.onOrientation = (e) => {
      if (Number.isFinite(e.beta) && Number.isFinite(e.gamma))
        this.orientation = { alpha: e.alpha, beta: e.beta, gamma: e.gamma };
    };
  }
  report(message = "") {
    this.onStatus?.({
      active: this.active,
      calibrated: this.calibrated,
      touch: this.touch,
      message,
      hasOrientation: !!this.orientation,
    });
  }
  async start() {
    if (!window.isSecureContext) {
      this.report("Open dit spel via HTTPS om de sensoren te gebruiken.");
      return;
    }
    if (!window.DeviceMotionEvent) {
      this.report(
        "Deze browser biedt geen bewegingssensoren. Je kunt wel tikbediening gebruiken.",
      );
      return;
    }
    try {
      // Beide verzoeken direct vanuit dezelfde klik, vóór de eerste await (iOS).
      const motionPermission =
        typeof DeviceMotionEvent.requestPermission === "function"
          ? DeviceMotionEvent.requestPermission()
          : Promise.resolve("granted");
      const orientationPermission =
        typeof window.DeviceOrientationEvent?.requestPermission === "function"
          ? DeviceOrientationEvent.requestPermission().catch(() => "denied")
          : Promise.resolve("granted");
      const [permission] = await Promise.all([
        motionPermission,
        orientationPermission,
      ]);
      if (permission !== "granted") {
        this.report(
          "Bewegingstoegang is geweigerd. Sta die toe in je browser, of kies tikbediening.",
        );
        return;
      }
      this.detach();
      this.active = true;
      this.touch = false;
      this.calibrated = false;
      this.lastSample = 0;
      this.gravity = null;
      this.orientation = null;
      this.baseline = null;
      window.addEventListener("devicemotion", this.onMotion);
      window.addEventListener("deviceorientation", this.onOrientation);
      this.report("Houd je telefoon stil en rechtop…");
      this.permissionTimer = setTimeout(() => {
        if (!this.lastSample)
          this.report(
            "Nog geen sensordata. Controleer bewegingstoegang of kies tikbediening.",
          );
        else this.calibrate();
      }, 1000);
      this.wake();
    } catch {
      this.report(
        "De browser kon bewegingstoegang niet openen. Probeer opnieuw of kies tikbediening.",
      );
    }
  }
  calibrate() {
    if (!this.active || this.touch) return;
    if (!this.lastSample || performance.now() - this.lastSample > 1600) {
      this.report(
        "Nog geen bewegingsdata ontvangen. Controleer de toestemming.",
      );
      return;
    }
    this.calibrated = false;
    this.report("Even stilhouden…");
    clearTimeout(this.calibrationTimer);
    this.calibrationTimer = setTimeout(() => {
      if (performance.now() - this.lastSample > 1600) {
        this.report("Bewegingsdata is onderbroken. Probeer opnieuw.");
        return;
      }
      this.baseline = this.orientation ? { ...this.orientation } : null;
      this.calibrated = true;
      this.detector.reset();
      this.report(
        this.orientation
          ? "Racket klaar. Kijk naar je laptop."
          : "Zwaaien werkt. Gebruik de richtingsschuif; deze browser geeft geen kantelhoek.",
      );
    }, 850);
  }
  onMotion(event) {
    const values = [
      ...Object.values(event.acceleration || {}),
      ...Object.values(event.rotationRate || {}),
      ...Object.values(event.accelerationIncludingGravity || {}),
    ];
    // Sensorproperties zijn in sommige browsers niet enumerable.
    const hasData = [
      event.acceleration?.x,
      event.accelerationIncludingGravity?.x,
      event.rotationRate?.alpha,
      ...values,
    ].some(Number.isFinite);
    if (!hasData || !this.active) return;
    const now = performance.now();
    this.lastSample = now;
    let acceleration;
    if (Number.isFinite(event.acceleration?.x)) {
      acceleration = {
        x: event.acceleration.x || 0,
        y: event.acceleration.y || 0,
        z: event.acceleration.z || 0,
      };
    } else {
      const raw = event.accelerationIncludingGravity || {};
      const v = { x: raw.x || 0, y: raw.y || 0, z: raw.z || 0 };
      this.gravity ??= { ...v };
      acceleration = {};
      for (const axis of ["x", "y", "z"]) {
        this.gravity[axis] += 0.08 * (v[axis] - this.gravity[axis]);
        acceleration[axis] = v[axis] - this.gravity[axis];
      }
    }
    const r = event.rotationRate || {};
    const orientation = this.orientation || { alpha: 0, beta: 0, gamma: 0 };
    const pose = this.baseline
      ? relativePose(this.orientation, this.baseline)
      : { roll: 0, pitch: 0, yaw: (this.manualAim || 0) * 45 };
    const sample = {
      acceleration,
      rotation: { x: r.beta || 0, y: r.gamma || 0, z: r.alpha || 0 },
      orientation,
      pose,
      aim: this.baseline
        ? clamp((pose.yaw + pose.roll * 0.55) / 45, -1, 1)
        : this.manualAim || 0,
      loft: this.baseline ? clamp(pose.pitch / 65, -0.65, 0.85) : 0,
    };
    this.energy = clamp(
      Math.max(length(sample.rotation) / 360, length(acceleration) / 22),
      0,
      1,
    );
    if (this.calibrated && !document.hidden) {
      const shot = this.detector.feed(sample, now);
      if (shot) this.onSwing?.(shot);
    }
    if (now - this.lastSent > 33) {
      this.lastSent = now;
      this.onSample?.({
        ...sample,
        energy: this.energy,
        calibrated: this.calibrated,
      });
    }
  }
  get ready() {
    return (
      !document.hidden &&
      this.active &&
      this.calibrated &&
      (this.touch ||
        (this.lastSample > 0 && performance.now() - this.lastSample < 1600))
    );
  }
  useTouch() {
    this.detach();
    this.active = true;
    this.touch = true;
    this.calibrated = true;
    this.report("Tikbediening actief. Richt met de schuif en tik op Sla.");
    this.wake();
  }
  async wake() {
    try {
      if (
        navigator.wakeLock &&
        !document.hidden &&
        (!this.wakeLock || this.wakeLock.released)
      )
        this.wakeLock = await navigator.wakeLock.request("screen");
    } catch {
      /* optionele browserfunctie */
    }
  }
  detach() {
    clearTimeout(this.permissionTimer);
    clearTimeout(this.calibrationTimer);
    window.removeEventListener("devicemotion", this.onMotion);
    window.removeEventListener("deviceorientation", this.onOrientation);
  }
  stop() {
    this.detach();
    this.active = false;
    this.calibrated = false;
    this.wakeLock?.release().catch(() => {});
  }
}
