import { rng } from "./geometry";

/**
 * Background music. An original guzheng-style pentatonic score is rendered once with an
 * OfflineAudioContext (deterministic, so playback, seeking and exports always match).
 * A licensed recording placed at `public/music.mp3` replaces the generated score.
 */

const SR = 32000;
const BEAT = 60 / 72;
const LICENSED_TRACK = "/music.mp3";
// A 羽 (yu) pentatonic: A C D E G.
const SCALE = [45, 48, 50, 52, 55, 57, 60, 62, 64, 67, 69, 72, 74, 76];
// One melodic phrase per scene: [scale index (-1 = rest), beats].
const PHRASES: [number, number][][] = [
  [[8, 2], [7, 1], [8, 1], [10, 3], [-1, 1], [9, 1], [8, 1], [7, 2], [5, 4]],
  [[5, 1], [6, 1], [7, 2], [8, 1], [7, 1], [6, 2], [5, 1], [3, 1], [4, 2], [5, 4]],
  [[8, 1.5], [9, .5], [10, 2], [9, 1], [8, 1], [7, 2], [8, 1], [7, 1], [5, 2], [6, 4]],
  [[3, 1], [5, 1], [6, 2], [5, 1], [6, 1], [8, 2], [7, 1], [6, 1], [5, 1], [3, 1], [5, 4]],
  [[10, 1], [9, 1], [8, 1], [7, 1], [8, 2], [6, 2], [7, 1], [8, 1], [7, 1], [6, 1], [5, 4]],
  [[5, 2], [6, 1], [5, 1], [3, 2], [2, 1], [3, 1], [5, 1.5], [6, .5], [7, 2], [5, 4]],
  [[8, 1], [10, 1], [9, 2], [8, 1], [7, 1], [6, 2], [7, 1], [6, 1], [5, 1], [4, 1], [5, 4]],
  [[5, 1], [7, 1], [8, 2], [10, 2], [9, 1], [8, 1], [7, 2], [8, 1], [7, 1], [6, 1], [7, 1], [5, 6]],
];
// Pad voicing per scene: Am, F, Gsus, C, Dm7, Fmaj7, Em7, Am.
const CHORDS = [[45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 62], [48, 55, 60, 64], [50, 57, 60, 65], [41, 48, 57, 64], [40, 47, 55, 62], [45, 52, 57, 64]];

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
const TABLE = 2048;

/** Single-cycle wavetable from harmonic amplitudes (index 0 unused), normalised to ±1. */
function wavetable(harmonics: number[]) {
  const t = new Float32Array(TABLE + 1);
  let peak = 0;
  for (let i = 0; i <= TABLE; i++) {
    let s = 0;
    for (let k = 1; k < harmonics.length; k++) s += harmonics[k] * Math.sin(2 * Math.PI * k * i / TABLE);
    t[i] = s; peak = Math.max(peak, Math.abs(s));
  }
  return t.map(v => v / peak);
}

/** Dry stereo mix, synthesised sample by sample (far faster than thousands of audio nodes). */
class Mix {
  readonly length: number;
  constructor(readonly L: Float32Array, readonly R: Float32Array) { this.length = L.length; }

  /** Oscillator with an exponential decay (`tau` seconds), optional pitch slide and delayed vibrato. */
  voice(tab: Float32Array, t: number, f: number, amp: number, tau: number, len: number, pan: number, o: { slide?: boolean; vibrato?: boolean } = {}) {
    const i0 = Math.floor(t * SR), n = Math.min(this.length - i0, Math.floor(len * SR));
    const gl = Math.cos((pan + 1) * Math.PI / 4) * amp, gr = Math.sin((pan + 1) * Math.PI / 4) * amp;
    const decay = Math.exp(-1 / (tau * SR)), attack = Math.floor(.004 * SR), step = f * TABLE / SR, fade = Math.floor(.05 * SR);
    const modulated = o.slide || o.vibrato;
    let phase = 0, env = 1;
    for (let i = 0; i < n; i++) {
      let inc = step;
      if (modulated) {
        const s = i / SR;
        let cents = o.slide ? -200 * Math.exp(-Math.max(0, s - .04) / .05) : 0;
        if (o.vibrato) cents += 14 * Math.min(1, s / .9) * Math.sin(2 * Math.PI * 5.2 * s);
        inc *= Math.exp(cents * 5.776e-4);
      }
      phase += inc; if (phase >= TABLE) phase -= TABLE;
      const j = phase | 0, v = tab[j] + (tab[j + 1] - tab[j]) * (phase - j);
      const a = env * (i < attack ? i / attack : 1) * (i > n - fade ? (n - i) / fade : 1);
      env *= decay;
      this.L[i0 + i] += v * a * gl; this.R[i0 + i] += v * a * gr;
    }
  }

  /** Sustained tone: fades in over `rise`, holds, then fades out linearly until `t1 + release`. */
  drone(tab: Float32Array, t0: number, t1: number, release: number, f: number, amp: number, pan: number) {
    const i0 = Math.floor(t0 * SR), i1 = Math.floor(t1 * SR), iEnd = Math.min(this.length, Math.floor((t1 + release) * SR)), rise = 3 * SR;
    const gl = Math.cos((pan + 1) * Math.PI / 4) * amp, gr = Math.sin((pan + 1) * Math.PI / 4) * amp, step = f * TABLE / SR;
    let phase = 0;
    for (let i = i0; i < iEnd; i++) {
      phase += step; if (phase >= TABLE) phase -= TABLE;
      const j = phase | 0, v = tab[j] + (tab[j + 1] - tab[j]) * (phase - j);
      const a = Math.min(1, (i - i0) / rise) * (i > i1 ? 1 - (i - i1) / (iEnd - i1) : 1);
      this.L[i] += v * a * gl; this.R[i] += v * a * gr;
    }
  }
}

const BRIGHT = wavetable([0, 1, .7, .5, .42, .3, .24, .18, .13, .1, .07, .05, .035, .025]);
const MELLOW = wavetable([0, 1, .32, .12, .05, .02]);
const SOFT = wavetable([0, 1, .12, .06]);

/** Guzheng-like pluck: a bright attack that fades quickly over a mellow body that keeps ringing. */
function pluck(mix: Mix, t: number, midi: number, vel: number, len: number, pan: number, o: { vibrato?: boolean; slide?: boolean } = {}) {
  const f = hz(midi);
  mix.voice(BRIGHT, t, f, vel * .5, .12, Math.min(len, 1.2), pan, o);
  mix.voice(MELLOW, t, f, vel * .6, len / 5, len, pan, o);
}

function pad(mix: Mix, chord: number[], t0: number, t1: number, release: number) {
  chord.forEach((m, j) => {
    mix.drone(SOFT, t0, t1, release, hz(m) * 1.004, .03, -.4 + j * .25);
    mix.drone(SOFT, t0, t1, release, hz(m) * .996, .03, .4 - j * .25);
  });
}

function noiseBuffer(ctx: BaseAudioContext, seconds: number, seed: number, decay = 0) {
  const r = rng(seed), len = Math.floor(seconds * ctx.sampleRate), buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (r() * 2 - 1) * (decay ? Math.pow(1 - i / len, decay) : 1);
  }
  return buf;
}

/** Soft sand hiss for the palm sweep that opens each new scene. */
function whoosh(ctx: BaseAudioContext, out: AudioNode, noise: AudioBuffer, t: number) {
  const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noise; bp.type = "bandpass"; bp.Q.value = .8;
  bp.frequency.setValueAtTime(700, t); bp.frequency.linearRampToValueAtTime(2200, t + 3);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.05, t + 1.2); g.gain.linearRampToValueAtTime(0, t + 3.2);
  src.connect(bp).connect(g).connect(out); src.start(t); src.stop(t + 3.3);
}

function compose(duration: number, starts: number[]): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * SR), SR);
  const master = ctx.createGain(), comp = ctx.createDynamicsCompressor(), bus = ctx.createGain(), dry = ctx.createGain(), wet = ctx.createGain(), verb = ctx.createConvolver();
  master.gain.setValueAtTime(0, 0); master.gain.linearRampToValueAtTime(1.4, 2.5);
  master.gain.setValueAtTime(1.4, duration - 5); master.gain.linearRampToValueAtTime(0, duration - .2);
  comp.threshold.value = -18; comp.ratio.value = 3;
  master.connect(comp).connect(ctx.destination);
  verb.buffer = noiseBuffer(ctx, 3.8, 7, 2.8);
  dry.gain.value = .8; wet.gain.value = .45;
  bus.connect(dry).connect(master); bus.connect(verb).connect(wet).connect(master);
  const hiss = noiseBuffer(ctx, 3.5, 3), r = rng(88), dryMix = ctx.createBuffer(2, ctx.length, SR);
  const mix = new Mix(dryMix.getChannelData(0), dryMix.getChannelData(1));

  starts.forEach((start, i) => {
    const last = i === starts.length - 1, end = last ? duration : starts[i + 1], chord = CHORDS[i % CHORDS.length];
    pad(mix, chord, start, end, last ? 0 : 2.5);
    if (i > 0) whoosh(ctx, bus, hiss, start);
    for (let t = start + BEAT * .5, k = 0; t < end - BEAT; t += BEAT * 2, k++) {
      if (k % 2 === 0) pluck(mix, t, chord[0] - 12, .28, 4, -.2);
      const notes = chord.map(m => m + 12);
      if (k % 2) notes.reverse();
      notes.forEach((m, j) => pluck(mix, t + j * .07, m, .11, 2.4, (k % 2 ? .5 : -.5) + j * (k % 2 ? -.3 : .3)));
    }
    let t = start + BEAT;
    for (const [deg, beats] of PHRASES[i % PHRASES.length]) {
      const long = beats >= 2;
      if (deg >= 0) pluck(mix, t, SCALE[deg] + 12, .5, beats * BEAT + 1.6, .1, { vibrato: long, slide: long && r() < .5 });
      t += beats * BEAT;
    }
  });
  const src = ctx.createBufferSource();
  src.buffer = dryMix; src.connect(bus); src.start(0);
  return ctx.startRendering();
}

async function loadTrack(): Promise<AudioBuffer | null> {
  try {
    const res = await fetch(LICENSED_TRACK);
    if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("audio/")) return null;
    return await new OfflineAudioContext(2, 1, 44100).decodeAudioData(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export class Music {
  readonly ready: Promise<AudioBuffer>;
  private buffer: AudioBuffer | null = null;
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private origin = 0;
  private isMuted = false;

  constructor(duration: number, sceneStarts: number[]) {
    this.ready = loadTrack().then(track => track ?? compose(duration, sceneStarts)).then(buffer => (this.buffer = buffer));
  }

  /** Creates/resumes the AudioContext; call from a user gesture (autoplay policy). */
  async unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.out = this.ctx.createGain(); this.out.gain.value = this.isMuted ? 0 : 1; this.out.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  get muted() { return this.isMuted; }
  set muted(value: boolean) {
    this.isMuted = value;
    if (this.out && this.ctx) this.out.gain.setTargetAtTime(value ? 0 : 1, this.ctx.currentTime, .05);
  }

  /** Starts playback at `time` seconds. No-op until the score is ready and audio is unlocked. */
  play(time: number) {
    this.stop();
    const ctx = this.ctx, buffer = this.buffer;
    if (!ctx || !buffer || ctx.state !== "running" || time >= buffer.duration) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer; src.connect(this.out!); src.start(0, Math.max(0, time));
    this.origin = ctx.currentTime - Math.max(0, time);
    this.source = src;
  }

  stop() {
    this.source?.stop(); this.source?.disconnect(); this.source = null;
  }

  /** Current playback position from the audio clock, or null when not audibly playing. */
  position() {
    if (!this.source || !this.ctx || this.ctx.state !== "running") return null;
    const p = this.ctx.currentTime - this.origin;
    return p < this.buffer!.duration ? p : null;
  }

  /** A silent-to-speakers copy of the score for MediaRecorder, with its own clock. */
  exportTrack() {
    const ctx = this.ctx, buffer = this.buffer;
    if (!ctx || !buffer) return null;
    const dest = ctx.createMediaStreamDestination(), src = ctx.createBufferSource(), t0 = ctx.currentTime + .1;
    src.buffer = buffer; src.connect(dest); src.start(t0);
    return { track: dest.stream.getAudioTracks()[0], clock: () => Math.max(0, ctx.currentTime - t0), stop: () => src.stop() };
  }

  /** 16-bit PCM WAV of the whole score, base64-encoded (used by the MP4 export script). */
  async wavBase64() {
    const b = await this.ready, ch = b.numberOfChannels, n = b.length, bytes = new Uint8Array(44 + n * ch * 2), v = new DataView(bytes.buffer);
    const text = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    text(0, "RIFF"); v.setUint32(4, 36 + n * ch * 2, true); text(8, "WAVE"); text(12, "fmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true); v.setUint32(24, b.sampleRate, true);
    v.setUint32(28, b.sampleRate * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
    text(36, "data"); v.setUint32(40, n * ch * 2, true);
    const data = Array.from({ length: ch }, (_, c) => b.getChannelData(c));
    for (let i = 0, o = 44; i < n; i++) for (let c = 0; c < ch; c++, o += 2) v.setInt16(o, Math.max(-1, Math.min(1, data[c][i])) * 32767, true);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }
}
