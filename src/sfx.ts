/**
 * Tiny synthesized sound palette (Web Audio), so there are no third-party
 * audio files to license. Every sound also has an on-card caption.
 */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Call from any user gesture so the context is allowed to start. */
export function unlockAudio(): void {
  audio();
}

function tone(
  freq: number,
  start: number,
  duration: number,
  gain = 0.12,
  type: OscillatorType = 'sine',
): void {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + start;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

export const sfx = {
  tap(): void {
    tone(880, 0, 0.12, 0.08, 'triangle');
  },
  seed(): void {
    tone(523.25, 0, 0.25);
    tone(783.99, 0.08, 0.3);
  },
  drip(): void {
    const ac = audio();
    if (!ac) return;
    const f = 900 + Math.random() * 500;
    const t0 = ac.currentTime;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.frequency.setValueAtTime(f, t0);
    osc.frequency.exponentialRampToValueAtTime(f * 1.8, t0 + 0.08);
    g.gain.setValueAtTime(0.05, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
    osc.connect(g).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + 0.15);
  },
  breath(inhale: boolean): void {
    tone(inhale ? 329.63 : 246.94, 0, 1.2, 0.05);
  },
  stepDone(): void {
    tone(659.25, 0, 0.3);
    tone(987.77, 0.1, 0.4);
  },
  bloom(): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.12, 0.8, 0.09));
  },
};
