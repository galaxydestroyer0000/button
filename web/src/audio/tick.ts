let soundEnabled = false;
let audioCtx: AudioContext | null = null;

export function isSoundEnabled(): boolean {
  return soundEnabled;
}

export function setSoundEnabled(value: boolean): void {
  soundEnabled = value;
}

export function playTone(freq = 560, duration = 0.035, gain = 0.025): void {
  if (!soundEnabled) return;
  try {
    audioCtx ||= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.frequency.value = freq;
    osc.type = "square";
    g.gain.value = gain;
    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch {
    // AudioContext unavailable or blocked — sound is best-effort only.
  }
}
