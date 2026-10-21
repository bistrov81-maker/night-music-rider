import {
  clamp,
  type EngineStyle,
  type Mode,
  type Paint,
  type QualityName,
  type Settings,
  type TrailStyle,
} from "./types";

const KEY = "night-music-rider-v5";

export const DEFAULT_SETTINGS: Settings = {
  routeIndex: 0,
  aircraftIndex: 0,
  paint: "auto",
  engineStyle: "plasma",
  trailStyle: "ribbon",
  quality: "auto",
  stableCamera: false,
  calm: false,
  touch: false,
  volume: 0.7,
  bassSense: 70,
  trackSense: 70,
  mode: "normal",
};

const PAINTS: Paint[] = ["auto", "178", "315", "32", "210", "125"];
const ENGINES: EngineStyle[] = ["plasma", "ion", "pulse"];
const TRAILS: TrailStyle[] = ["ribbon", "spark", "none"];
const QUALITIES: QualityName[] = ["auto", "low", "medium", "high"];
const MODES: Mode[] = ["chill", "normal", "hard", "free"];

function isInt(v: unknown, a: number, b: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= a && v <= b;
}

export function loadSettings(): Settings {
  const base: Settings = { ...DEFAULT_SETTINGS };
  try {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) base.calm = true;
    if (matchMedia("(any-pointer: coarse)").matches || navigator.maxTouchPoints > 0) base.touch = true;
  } catch {
    /* ignore */
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const g = JSON.parse(raw) as Partial<Settings> & { fxSense?: number };
    if (isInt(g.routeIndex, 0, 4)) base.routeIndex = g.routeIndex;
    if (isInt(g.aircraftIndex, 0, 4)) base.aircraftIndex = g.aircraftIndex;
    if (g.paint && PAINTS.includes(g.paint)) base.paint = g.paint;
    if (g.engineStyle && ENGINES.includes(g.engineStyle)) base.engineStyle = g.engineStyle;
    if (g.trailStyle && TRAILS.includes(g.trailStyle)) base.trailStyle = g.trailStyle;
    if (g.quality && QUALITIES.includes(g.quality)) base.quality = g.quality;
    if (typeof g.stableCamera === "boolean") base.stableCamera = g.stableCamera;
    if (typeof g.calm === "boolean") base.calm = g.calm;
    if (typeof g.touch === "boolean") base.touch = g.touch;
    if (typeof g.volume === "number") base.volume = clamp(g.volume, 0, 1);
    const legacy = typeof g.fxSense === "number" ? clamp(g.fxSense, 0, 100) : 70;
    base.bassSense = typeof g.bassSense === "number" ? clamp(g.bassSense, 0, 100) : legacy;
    base.trackSense = typeof g.trackSense === "number" ? clamp(g.trackSense, 0, 100) : legacy;
    if (g.mode && MODES.includes(g.mode)) base.mode = g.mode;
  } catch {
    /* ignore */
  }
  return base;
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}
