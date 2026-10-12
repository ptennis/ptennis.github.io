import { isPhoneDevice } from "./device.js";

export function setupPWA(onChange) {
  let prompt = null,
    registration = null,
    reloading = false;
  const installed = () =>
    matchMedia("(display-mode: standalone)").matches ||
    navigator.standalone === true;
  const update = () =>
    onChange({
      canInstall: !!prompt,
      installed: installed(),
      updateAvailable: !!registration?.waiting,
    });
  document.querySelector('link[rel="manifest"]').href = isPhoneDevice()
    ? "./controller.webmanifest"
    : "./manifest.webmanifest";
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    prompt = event;
    update();
  });
  window.addEventListener("appinstalled", () => {
    prompt = null;
    update();
  });
  if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker
      .register("./sw.js", { updateViaCache: "none" })
      .then((reg) => {
        registration = reg;
        update();
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed") update();
          });
        });
      })
      .catch(() => {
        /* Online spelen blijft mogelijk zonder offline-cache. */
      });
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) location.reload();
    });
  }
  update();
  return {
    async install() {
      if (!prompt) return false;
      await prompt.prompt();
      await prompt.userChoice;
      prompt = null;
      update();
      return true;
    },
    applyUpdate() {
      if (!registration?.waiting) return;
      reloading = true;
      registration.waiting.postMessage({ type: "ACTIVATE_UPDATE" });
    },
  };
}
