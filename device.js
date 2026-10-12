// Kies het apparaat één keer. Een smaller venster of een draaiende telefoon
// mag de lopende wedstrijd nooit naar een andere pagina verplaatsen.
export function isPhoneDevice(nav = navigator) {
  const ua = nav.userAgent || "";
  return (
    nav.userAgentData?.mobile === true ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(ua) ||
    (/Macintosh|MacIntel/i.test(ua + " " + nav.platform) &&
      nav.maxTouchPoints > 1)
  );
}

export function screenAngle() {
  const angle = screen.orientation?.angle ?? window.orientation;
  return Number.isFinite(angle)
    ? ((angle % 360) + 360) % 360
    : window.innerWidth > window.innerHeight
      ? 90
      : 0;
}

// Op browsers zonder lock() draait alleen de interface terug. De sensoren
// blijven in hun vaste apparaatassen werken; kalibratie blijft dus geldig.
export class PortraitGuard {
  constructor(onChange = () => {}) {
    this.active = false;
    this.onChange = onChange;
    this.sync = this.sync.bind(this);
    window.addEventListener("resize", this.sync);
    window.addEventListener("orientationchange", this.sync);
    screen.orientation?.addEventListener("change", this.sync);
    document.addEventListener("fullscreenchange", this.sync);
  }
  sync() {
    const angle = this.active ? screenAngle() : 0;
    const sideways = angle === 90 || angle === 270;
    const root = document.documentElement;
    root.style.setProperty("--phone-turn", `${-angle}deg`);
    root.style.setProperty(
      "--phone-width",
      `${sideways ? innerHeight : innerWidth}px`,
    );
    root.style.setProperty(
      "--phone-height",
      `${sideways ? innerWidth : innerHeight}px`,
    );
    root.classList.toggle("racket-mode", this.active);
    this.onChange({ locked: this.locked === true, angle });
  }
  async start() {
    this.active = true;
    this.sync();
    if (typeof screen.orientation?.lock !== "function") return;
    // Probeer eerst zonder fullscreen (geïnstalleerde PWA). Fullscreen is
    // alleen nodig op sommige browsers en wordt gestart vanuit de klik.
    const full = document.documentElement.requestFullscreen;
    if (
      !document.fullscreenElement &&
      !matchMedia("(display-mode: standalone)").matches &&
      full
    ) {
      try {
        await full.call(document.documentElement);
      } catch {
        /* CSS-opvang */
      }
    }
    try {
      await screen.orientation.lock("portrait-primary");
      this.locked = true;
    } catch {
      this.locked = false;
    }
    this.sync();
  }
  stop() {
    this.active = false;
    this.locked = false;
    try {
      screen.orientation?.unlock?.();
    } catch {
      /* optionele functie */
    }
    this.sync();
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }
}
