// Web Audio API synthesizer for ZAIKORA KITCHENS continuous Admin New Order Bell Alert ("Tring! Tring! Tring! Tring!")

let sharedAudioCtx: AudioContext | null = null;

function getAudioContextClass(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ||
    null
  );
}

export type AlertSoundState = 'uninitialized' | 'running' | 'blocked' | 'unsupported';

export function getAlertSoundState(): AlertSoundState {
  const Ctx = getAudioContextClass();
  if (!Ctx) return 'unsupported';
  if (!sharedAudioCtx) return 'uninitialized';
  return sharedAudioCtx.state === 'running' ? 'running' : 'blocked';
}

function ensureAudioContext(): AudioContext | null {
  const Ctx = getAudioContextClass();
  if (!Ctx) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new Ctx();
  }
  return sharedAudioCtx;
}

function scheduleBellBurst(ctx: AudioContext, startTime: number, durationSec: number) {
  // Dual-harmonic metallic telephone/service bell strike modulated rapidly for a clear "Tring!" cadence
  const freqs = [1180, 1568, 2360];
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, startTime);
  master.gain.exponentialRampToValueAtTime(0.32, startTime + 0.015);
  master.gain.setValueAtTime(0.32, Math.max(startTime + 0.02, startTime + durationSec - 0.05));
  master.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);

  // Tremolo LFO gives the classic mechanical "Tr-r-r-ring!" hammer-on-bell flutter
  const tremolo = ctx.createOscillator();
  const tremoloDepth = ctx.createGain();
  tremolo.frequency.setValueAtTime(28, startTime);
  tremoloDepth.gain.setValueAtTime(0.24, startTime);

  const carrierSum = ctx.createGain();
  carrierSum.gain.setValueAtTime(0.76, startTime);
  tremolo.connect(tremoloDepth);
  tremoloDepth.connect(carrierSum.gain);

  carrierSum.connect(master);
  master.connect(ctx.destination);

  const oscs: OscillatorNode[] = [];
  for (const f of freqs) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, startTime);
    const partialGain = ctx.createGain();
    partialGain.gain.setValueAtTime(f === 1180 ? 0.55 : f === 1568 ? 0.45 : 0.25, startTime);
    osc.connect(partialGain);
    partialGain.connect(carrierSum);
    osc.start(startTime);
    osc.stop(startTime + durationSec + 0.02);
    oscs.push(osc);
  }

  tremolo.start(startTime);
  tremolo.stop(startTime + durationSec + 0.02);
}

/**
 * Unlocks/resumes browser audio on explicit user gesture and plays a short single confirmation chime.
 * Returns true strictly if AudioContext is actively 'running'.
 */
export async function enableAlertAudio(): Promise<boolean> {
  const ctx = ensureAudioContext();
  if (!ctx) return false;
  try {
    if (ctx.state !== 'running') {
      await ctx.resume();
    }
    if ((ctx.state as string) !== 'running') {
      return false;
    }
    const now = ctx.currentTime + 0.01;
    scheduleBellBurst(ctx, now, 0.18);
    return true;
  } catch {
    return false;
  }
}

/**
 * Plays one "Tring! Tring! Tring! Tring!" bell sequence (~1.85s total).
 * Returns true only when AudioContext is genuinely running; returns false if autoplay is blocked.
 */
export async function playTringCycle(): Promise<boolean> {
  const ctx = ensureAudioContext();
  if (!ctx) return false;
  try {
    if (ctx.state !== 'running') {
      await ctx.resume();
    }
  } catch {
    return false;
  }

  if ((ctx.state as string) !== 'running') {
    return false;
  }

  const now = ctx.currentTime + 0.02;
  // Four crisp ringing bursts: "Tring! Tring! Tring! Tring!"
  scheduleBellBurst(ctx, now + 0.0, 0.28);
  scheduleBellBurst(ctx, now + 0.38, 0.28);
  scheduleBellBurst(ctx, now + 0.86, 0.28);
  scheduleBellBurst(ctx, now + 1.24, 0.34);
  return true;
}
