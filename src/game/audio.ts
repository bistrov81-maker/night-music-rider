import type { Mode, Note } from "./types";

export type Analysis = {
  envelope: Float32Array;
  smooth: Float32Array;
  distance: Float32Array;
  onsets: Float32Array;
  beat: number;
};

export function createAudioContext(): AudioContext {
  const extra = window as Window & { webkitAudioContext?: typeof AudioContext };
  const Ctor = window.AudioContext || extra.webkitAudioContext;
  if (!Ctor) throw new Error("Нет Web Audio");
  return new Ctor();
}

export async function analyseBuffer(
  buffer: AudioBuffer,
  onProgress: (ratio: number) => void,
): Promise<Analysis> {
  const hop = Math.max(1, Math.floor(buffer.sampleRate / 50));
  const ch = buffer.getChannelData(0);
  const right = buffer.getChannelData(buffer.numberOfChannels > 1 ? 1 : 0);
  const raw: number[] = [];
  for (let i = 0; i < ch.length; i += hop) {
    let energy = 0;
    let count = 0;
    const end = Math.min(i + hop, ch.length);
    for (let j = i; j < end; j += 4) {
      energy += (ch[j] * ch[j] + right[j] * right[j]) * 0.5;
      count++;
    }
    raw.push(Math.sqrt(energy / Math.max(1, count)));
    if (raw.length % 2500 === 0) {
      onProgress(i / ch.length);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  const sorted = raw.slice().sort((a, b) => a - b);
  const ref = sorted[Math.floor(sorted.length * 0.97)] || 1;
  const envelope = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) envelope[i] = Math.max(0, Math.min(1, raw[i] / ref));
  const pref = new Float64Array(envelope.length + 1);
  for (let i = 0; i < envelope.length; i++) pref[i + 1] = pref[i] + envelope[i];
  const smooth = new Float32Array(envelope.length);
  for (let i = 0; i < envelope.length; i++) {
    const a = Math.max(0, i - 25);
    const b = Math.min(envelope.length, i + 26);
    smooth[i] = (pref[b] - pref[a]) / (b - a);
  }
  const distance = new Float32Array(envelope.length);
  for (let i = 1; i < envelope.length; i++) {
    distance[i] = distance[i - 1] + (12 + envelope[i] * 13) / 50;
  }
  const flux = new Float32Array(envelope.length);
  for (let i = 1; i < envelope.length; i++) {
    const rise = envelope[i] - envelope[i - 1];
    flux[i] = rise > 0 ? rise : 0;
  }
  const ranked = Array.from(flux).sort((a, b) => a - b);
  const fref = ranked[Math.floor(ranked.length * 0.96)] || 1;
  const onsets = new Float32Array(flux.length);
  for (let i = 0; i < flux.length; i++) onsets[i] = Math.max(0, Math.min(1, flux[i] / fref));
  const beat = detectBeat(onsets);
  onProgress(1);
  return { envelope, smooth, distance, onsets, beat };
}

function detectBeat(onsets: Float32Array): number {
  const n = onsets.length;
  if (n < 180) return 0;
  const step = n > 24000 ? 2 : 1;
  const scores = new Float64Array(47);
  let bestLag = 0;
  let best = 0;
  let sum = 0;
  let lags = 0;
  for (let lag = 16; lag <= 46; lag++) {
    let score = 0;
    let weight = 0;
    for (let i = lag; i < n; i += step) {
      const a = onsets[i];
      if (a < 0.12) continue;
      score += a * onsets[i - lag];
      weight += a;
    }
    const norm = weight > 0 ? score / weight : 0;
    scores[lag] = norm;
    sum += norm;
    lags++;
    if (norm > best) {
      best = norm;
      bestLag = lag;
    }
  }
  const half = Math.round(bestLag / 2);
  if (half >= 16 && scores[half] > best * 0.86) {
    bestLag = half;
    best = scores[half];
  }
  const avg = sum / Math.max(1, lags);
  if (bestLag === 0 || best < avg * 1.32 || best < 0.08) return 0;
  return bestLag / 50;
}

function beatPhase(onsets: Float32Array, period: number): number {
  const frames = Math.max(8, Math.round(period * 50));
  const bins = 16;
  const hist = new Float64Array(bins);
  for (let i = 0; i < onsets.length; i++) {
    if (onsets[i] < 0.12) continue;
    hist[Math.floor(((i % frames) / frames) * bins)] += onsets[i];
  }
  let peak = 0;
  let best = 0;
  for (let i = 0; i < bins; i++) {
    if (hist[i] > peak) {
      peak = hist[i];
      best = i;
    }
  }
  return ((best + 0.5) / bins) * period;
}

export function makeDemoBuffer(ac: AudioContext): AudioBuffer {
  const sr = 22050;
  const dur = 64;
  const buffer = ac.createBuffer(2, sr * dur, sr);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  const beat = 60 / 128;
  const scale = [55, 55, 65.406, 49];
  let seed = 1;
  for (let i = 0; i < left.length; i++) {
    const t = i / sr;
    const p = t % beat;
    const step = Math.floor(t / (beat / 2));
    const note = scale[Math.floor(t / (beat * 8)) % 4];
    const kick = Math.sin(2 * Math.PI * (48 * p + 10 * (1 - Math.exp(-p * 35)))) * Math.exp(-p * 16);
    const hatTime = t % (beat / 2);
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    const noise = (seed >>> 0) / 2147483648 - 1;
    const hat = noise * Math.exp(-hatTime * 90) * 0.12;
    const snare = Math.floor(t / beat) % 2 ? noise * Math.exp(-p * 22) * 0.2 : 0;
    const freq = note * Math.pow(2, [0, 1, 1.58496, 2, 1, 2.58496, 2, 1.58496][step % 8]);
    const arp = Math.sin(2 * Math.PI * freq * t) * Math.exp(-hatTime * 9) * 0.16;
    const bass = Math.sin(2 * Math.PI * note * t) * 0.22 * (1 - Math.exp(-p * 25));
    const fade = Math.min(1, t / 2, (dur - t) / 3);
    const v = (kick * 0.5 + hat + snare + bass + arp) * fade;
    left[i] = v;
    right[i] = v * 0.96 + Math.sin(2 * Math.PI * freq * t + 0.3) * 0.025 * fade;
  }
  return buffer;
}

export function buildNotes(
  envelope: Float32Array,
  onsets: Float32Array,
  beat: number,
  mode: Mode,
  routeIndex: number,
  trackSense = 70,
): Note[] {
  if (mode === "free") return [];
  const notes: Note[] = [];
  const gap = { chill: 0.52, normal: 0.32, hard: 0.22 }[mode];
  const track = Math.max(0.2, trackSense / 70);
  const duration = envelope.length / 50;
  let prev = 1;
  let seed = 1234567 + routeIndex * 100003;
  for (let i = 0; i < onsets.length; i += 7) {
    seed = (Math.imul(seed, 31) + Math.round(onsets[i] * 1000)) | 0;
  }
  const rand = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  const push = (t: number, strong: boolean) => {
    if (rand() > 0.48) prev = Math.max(0, Math.min(2, prev + (rand() > 0.5 ? 1 : -1)));
    notes.push({ t, lane: prev, type: "gem" });
    if (mode !== "chill" && strong && rand() < (mode === "hard" ? 0.62 : 0.36)) {
      notes.push({ t, lane: (prev + 1 + Math.floor(rand() * 2)) % 3, type: "wall" });
    }
  };
  if (beat > 0.28 && beat < 1.05) {
    let phase = beatPhase(onsets, beat);
    if (phase < 1.15) phase += beat * Math.ceil((1.15 - phase) / beat);
    let last = 0;
    for (let t = phase; t < duration - 0.45; t += beat) {
      const i = Math.round(t * 50);
      let strength = 0;
      for (let k = -3; k <= 3; k++) strength = Math.max(strength, onsets[i + k] || 0);
      if (strength < (mode === "hard" ? 0.08 : 0.15) / track) continue;
      if (t - last < gap * 0.82) continue;
      push(t, strength > 0.42);
      last = t;
      if (mode === "hard") {
        const off = t + beat * 0.5;
        const oi = Math.round(off * 50);
        if ((onsets[oi] || 0) > 0.58 / track && off - last >= gap * 0.8 && rand() < 0.4) {
          push(off, false);
          last = off;
        }
      }
    }
  }
  if (notes.length < 8) {
    notes.length = 0;
    let last = 1.4;
    for (let i = 70; i < onsets.length - 4; i++) {
      const t = i / 50;
      const e = onsets[i];
      if (t - last < gap || e < 0.36 / track) continue;
      if (e < onsets[i - 1] || e < (onsets[i + 1] || 0)) continue;
      push(t, e > 0.62);
      last = t;
    }
  }
  notes.sort((a, b) => a.t - b.t || (a.type === "gem" ? -1 : 1));
  return notes;
}

export function sampleAt(data: Float32Array, t: number, fallback = 0): number {
  if (!data.length) return fallback;
  const i = Math.max(0, Math.min(data.length - 1, Math.floor(t * 50)));
  return data[i] || 0;
}

export function travelAlong(distance: Float32Array, t: number): number {
  if (!distance.length) return t * 16;
  const x = Math.max(0, Math.min(distance.length - 1, t * 50));
  const i = Math.floor(x);
  const next = i + 1 < distance.length ? distance[i + 1] : distance[i];
  return distance[i] + (next - distance[i]) * (x - i);
}
