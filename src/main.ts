import "./style.css";
import { Sky, type SkyRenderer } from "./engine/Sky";
import { Input } from "./engine/Input";
import type { Action } from "./engine/core";
import {
  readSettings,
  saveSettings,
  shareURL,
  type Settings,
} from "./settings";
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const settings = readSettings();
const sky = new Sky(settings);
let canvas = $<HTMLCanvasElement>("sky"),
  renderer: SkyRenderer,
  input: Input;
let paused = matchMedia("(prefers-reduced-motion: reduce)").matches;
let manualHidden = false,
  autoHidden = false,
  lastInteraction = performance.now(),
  lastFrame = 0,
  frames = 0,
  fps = 30,
  frameStart = performance.now(),
  ratio = 0.9,
  adapting = 0,
  recovering = false,
  ready = false;
let wakeLock: WakeLockSentinel | null = null,
  toastTimer = 0,
  request = 0;
const cursors = [...document.querySelectorAll<HTMLElement>("#cursors i")];
function toast(text: string) {
  $("toast").textContent = text;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(
    () => $("toast").classList.remove("show"),
    4200,
  );
}
function reveal() {
  manualHidden = false;
  autoHidden = false;
  document.body.classList.remove("immersed");
  lastInteraction = performance.now();
}
function hide() {
  if (
    !$<HTMLDialogElement>("about").open &&
    !$<HTMLDialogElement>("share-dialog").open
  ) {
    manualHidden = true;
    document.body.classList.add("immersed");
    toast("Just the sky. Press H or double-click to return.");
  }
}
function updatePause() {
  const b = $("pause");
  b.setAttribute("aria-label", paused ? "Resume sunset" : "Pause sunset");
  b.title = paused ? "Resume · Space" : "Pause · Space";
  b.innerHTML = paused
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7z"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>';
}
function resize() {
  sky.camera.aspect = innerWidth / innerHeight;
  sky.camera.updateProjectionMatrix();
  const desired =
    settings.quality === "high"
      ? Math.min(devicePixelRatio, 1.5)
      : settings.quality === "eco"
        ? 0.6
        : ratio;
  renderer?.resize(innerWidth, innerHeight, desired);
}
function refresh() {
  for (const key of [
    "density",
    "speed",
    "billow",
    "light",
    "exposure",
  ] as const) {
    const el = $<HTMLInputElement>(key);
    el.value = String(Math.round(settings[key] * 100));
    el.style.setProperty(
      "--value",
      `${((Number(el.value) - Number(el.min)) / (Number(el.max) - Number(el.min))) * 100}%`,
    );
    $(`${key}-value`).textContent =
      key === "speed"
        ? settings.speed === 0
          ? "Still"
          : settings.speed < 0.35
            ? "Unhurried"
            : settings.speed < 0.7
              ? "Gentle"
              : "Breezy"
        : key === "light"
          ? settings.light < 0.35
            ? "West"
            : settings.light > 0.65
              ? "East"
              : "Ahead"
          : `${el.value}%`;
  }
  $<HTMLSelectElement>("palette").value = settings.palette;
  $<HTMLSelectElement>("quality").value = settings.quality;
  $<HTMLInputElement>("evolve").checked = settings.evolve;
  $("story-name").textContent =
    $<HTMLSelectElement>("palette").selectedOptions[0].textContent;
}
function attachInput() {
  input = new Input(
    canvas,
    $<HTMLVideoElement>("camera-video"),
    $<HTMLCanvasElement>("tracking-preview"),
  );
  input.onStatus = () => {
    const button = $("camera-button");
    button.textContent = input.cameraBusy
      ? "Cancel"
      : input.cameraEnabled
        ? "Stop camera"
        : "Use camera";
    button.setAttribute("aria-pressed", String(input.cameraEnabled));
    $("tracking-status").textContent = input.status;
    $("camera-preview").hidden = !input.cameraEnabled;
    if (
      !input.cameraEnabled &&
      !input.cameraBusy &&
      !["Mouse & touch", "Camera off — mouse & touch ready"].includes(
        input.status,
      )
    )
      toast(input.status);
  };
  canvas.addEventListener("dblclick", () =>
    document.body.classList.contains("immersed") ? reveal() : hide(),
  );
  canvas.addEventListener("pointerdown", () => {
    document.body.classList.add("intro-done");
  });
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    cancelAnimationFrame(request);
    toast("Graphics paused. Restoring your sky…");
  });
  canvas.addEventListener("webglcontextrestored", () => {
    recover(false);
  });
}
async function recover(tryGPU: boolean) {
  if (recovering) return;
  recovering = true;
  cancelAnimationFrame(request);
  input?.dispose();
  renderer?.dispose();
  const replacement = canvas.cloneNode(false) as HTMLCanvasElement;
  canvas.replaceWith(replacement);
  canvas = replacement;
  try {
    await createRenderer(tryGPU);
    attachInput();
    resize();
    lastFrame = 0;
    request = requestAnimationFrame(tick);
    toast("Your sky is restored.");
  } catch (e) {
    fail(e);
  } finally {
    recovering = false;
  }
}
async function createRenderer(tryGPU = true) {
  let candidate: SkyRenderer | undefined;
  if (
    tryGPU &&
    new URLSearchParams(location.search).get("renderer") !== "webgl"
  ) {
    try {
      const { WebGPUSky } = await import("./engine/WebGPUSky");
      candidate = await WebGPUSky.create(canvas, () => {
        void recover(false);
      });
    } catch (e) {
      console.info("WebGPU unavailable; using WebGL.", String(e));
      const next = canvas.cloneNode(false) as HTMLCanvasElement;
      canvas.replaceWith(next);
      canvas = next;
    }
  }
  if (!candidate) {
    const { WebGLSky } = await import("./engine/WebGLSky");
    candidate = new WebGLSky(canvas, sky);
  }
  renderer = candidate;
  $("engine").textContent = renderer.kind;
}
function tick(now: number) {
  request = requestAnimationFrame(tick);
  if (document.hidden) return;
  const cap = settings.quality === "high" ? 60 : 30;
  if (lastFrame && now - lastFrame < 1000 / cap - 0.5) return;
  const dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.05) : 1 / 30;
  lastFrame = now;
  input.update(dt, sky.camera, "air");
  if (!paused) sky.update(dt, input.hands);
  else sky.update(0, []);
  for (let i = 0; i < 2; i++) {
    const h = input.hands[i],
      el = cursors[i];
    el.style.display = h ? "block" : "none";
    if (h) {
      el.style.left = `${(h.screen.x + 1) * 0.5 * innerWidth}px`;
      el.style.top = `${(1 - h.screen.y) * 0.5 * innerHeight}px`;
    }
  }
  renderer.render(sky);
  frames++;
  if (now - frameStart > 2000) {
    fps = Math.round((frames * 1000) / (now - frameStart));
    frames = 0;
    frameStart = now;
    if (settings.quality === "auto" && now - adapting > 6000) {
      const next =
        fps < 24
          ? Math.max(0.5, ratio - 0.1)
          : fps >= 29
            ? Math.min(Math.min(devicePixelRatio, 1.1), ratio + 0.05)
            : ratio;
      if (next !== ratio) {
        ratio = next;
        resize();
      }
      adapting = now;
    }
  }
  if (
    !manualHidden &&
    !autoHidden &&
    now - lastInteraction > 30000 &&
    $("panel").hidden &&
    !$<HTMLDialogElement>("about").open &&
    !$<HTMLDialogElement>("share-dialog").open &&
    !input.cameraEnabled
  ) {
    autoHidden = true;
    document.body.classList.add("immersed");
  }
}
function fail(error: unknown) {
  console.error(error);
  const loading = $("loading");
  loading.classList.remove("done");
  loading.replaceChildren();
  const title = document.createElement("p");
  title.textContent = "This sky needs a little more support.";
  const detail = document.createElement("small");
  detail.textContent =
    "Try a browser with WebGPU or WebGL 2 and hardware acceleration.";
  const button = document.createElement("button");
  button.textContent = "Try again";
  button.className = "error-reload";
  button.onclick = () => location.reload();
  loading.append(title, detail, button);
}
function openPanel(open: boolean) {
  $("panel").hidden = !open;
  $("atmosphere").setAttribute("aria-expanded", String(open));
  if (open) {
    document.body.classList.add("intro-done");
    $<HTMLSelectElement>("palette").focus();
  } else $("atmosphere").focus();
}
async function fullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else if (document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
    } else toast("Use your browser’s fullscreen or Add to Home Screen.");
  } catch {
    toast("Fullscreen is unavailable in this browser window.");
  }
}
async function keepAwake() {
  try {
    if (
      "wakeLock" in navigator &&
      document.fullscreenElement &&
      !document.hidden
    )
      wakeLock = await navigator.wakeLock.request("screen");
  } catch {
    /* Unsupported or low battery: keep rendering without a wake lock. */
  }
}
function wire() {
  for (const key of [
    "density",
    "speed",
    "billow",
    "light",
    "exposure",
  ] as const)
    $<HTMLInputElement>(key).addEventListener("input", (e) => {
      settings[key] = Number((e.target as HTMLInputElement).value) / 100;
      sky.revision++;
      refresh();
      saveSettings(settings);
    });
  for (const key of ["palette", "quality"] as const)
    $<HTMLSelectElement>(key).addEventListener("change", (e) => {
      Object.assign(settings, { [key]: (e.target as HTMLSelectElement).value });
      refresh();
      saveSettings(settings);
      resize();
    });
  $<HTMLInputElement>("evolve").onchange = (e) => {
    settings.evolve = (e.target as HTMLInputElement).checked;
    saveSettings(settings);
  };
  $("atmosphere").onclick = () => openPanel($("panel").hidden);
  $("close-panel").onclick = () => openPanel(false);
  $("camera-button").onclick = () => void input.toggleCamera();
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-action]"))
    b.onclick = () => {
      input.action = b.dataset.action as Action;
      for (const x of document.querySelectorAll("[data-action]"))
        x.setAttribute("aria-pressed", String(x === b));
    };
  $("hide").onclick = hide;
  $("pause").onclick = () => {
    paused = !paused;
    updatePause();
  };
  $("fullscreen").onclick = () => void fullscreen();
  $("reset").onclick = () => {
    settings.seed = Math.floor(Math.random() * 1000000);
    sky.reset();
    saveSettings(settings);
    toast("A new sky. A fresh beginning.");
  };
  $("capture").onclick = () => {
    renderer.render(sky);
    canvas.toBlob((blob) => {
      if (!blob) {
        toast("The picture could not be saved.");
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.download = `infinite-sunset-${Date.now()}.png`;
      a.href = url;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast("A little golden hour, saved.");
    }, "image/png");
  };
  $("share").onclick = () => {
    const dialog = $<HTMLDialogElement>("share-dialog");
    $<HTMLInputElement>("share-url").value = shareURL(settings);
    $("copy-status").textContent = "";
    dialog.showModal();
  };
  $("copy-link").onclick = async () => {
    try {
      await navigator.clipboard.writeText(
        $<HTMLInputElement>("share-url").value,
      );
      $("copy-status").textContent = "Link copied. Send someone a sunset.";
    } catch {
      $<HTMLInputElement>("share-url").select();
      $("copy-status").textContent =
        "Select and copy this link to share your sky.";
    }
  };
  $("about-button").onclick = () => $<HTMLDialogElement>("about").showModal();
  for (const dialog of document.querySelectorAll("dialog")) {
    dialog.querySelector<HTMLButtonElement>(".dialog-close")!.onclick = () =>
      dialog.close();
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) {
        const r = dialog.getBoundingClientRect();
        if (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        )
          dialog.close();
      }
    });
  }
  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", () => {
    lastInteraction = performance.now();
    if (autoHidden) reveal();
  });
  window.addEventListener("pointerdown", () => {
    lastInteraction = performance.now();
    if (autoHidden) reveal();
  });
  window.addEventListener("keydown", (e) => {
    lastInteraction = performance.now();
    if (e.key === "Escape") {
      reveal();
      openPanel(false);
      return;
    }
    if (e.key === "Tab" && document.body.classList.contains("immersed"))
      reveal();
    if (
      (e.target as HTMLElement).matches("input,select,textarea") ||
      document.querySelector("dialog[open]")
    )
      return;
    if (e.key === " ") {
      e.preventDefault();
      paused = !paused;
      updatePause();
    }
    if (e.key.toLowerCase() === "h")
      document.body.classList.contains("immersed") ? reveal() : hide();
    if (e.key.toLowerCase() === "f") void fullscreen();
  });
  document.addEventListener("fullscreenchange", () => {
    const full = !!document.fullscreenElement;
    $("fullscreen").setAttribute(
      "aria-label",
      full ? "Exit fullscreen" : "Enter fullscreen",
    );
    if (full) void keepAwake();
    else {
      void wakeLock?.release();
      wakeLock = null;
    }
    resize();
  });
  document.addEventListener("visibilitychange", () => {
    lastFrame = 0;
    if (!document.hidden) void keepAwake();
  });
  window.addEventListener("pagehide", (e) => {
    input.dispose();
    void wakeLock?.release();
    if (!e.persisted) {
      cancelAnimationFrame(request);
      renderer.dispose();
    }
  });
  setTimeout(() => document.body.classList.add("intro-done"), 18000);
}
async function start() {
  await createRenderer();
  attachInput();
  ratio = Math.min(devicePixelRatio, 0.9);
  resize();
  refresh();
  wire();
  updatePause();
  sky.update(1 / 30, []);
  renderer.render(sky);
  ready = true;
  $("loading").classList.add("done");
  if (paused)
    toast("Motion is paused to respect your reduced-motion preference.");
  request = requestAnimationFrame(tick);
}
Object.defineProperty(window, "infiniteSunset", {
  value: {
    snapshot: () => ({
      ready,
      renderer: renderer?.kind,
      paused,
      fps,
      pixelRatio: ratio,
      settings: { ...settings },
      hands: input?.hands.length ?? 0,
      camera: input?.cameraEnabled ?? false,
      ...sky.snapshot(),
    }),
  },
  writable: false,
});
start().catch(fail);
// Exported only as a type for browser test diagnostics.
export type SunsetSettings = Settings;
