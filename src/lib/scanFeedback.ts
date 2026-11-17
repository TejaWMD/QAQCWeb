export function playScanBeep(success = true) {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = success ? 1000 : 220;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (success ? 0.12 : 0.25));
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + (success ? 0.13 : 0.26));
    }
    if (navigator.vibrate) {
      navigator.vibrate(success ? 60 : [100, 50, 100]);
    }
  } catch {
    // Ignore audio/vibration errors on restricted browsers
  }
}
