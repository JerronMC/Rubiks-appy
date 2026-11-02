export class TurnSound {
  constructor() {
    this.context = null;
    this.enabled = true;
    this.volume = 0.28;
  }

  configure({ enabled = this.enabled, volume = this.volume } = {}) {
    this.enabled = Boolean(enabled);
    this.volume = Math.max(0, Math.min(1, Number(volume) / 100));
  }

  async unlock() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return false;
    if (!this.context) this.context = new AudioContextClass();
    if (this.context.state === 'suspended') await this.context.resume();
    return true;
  }

  async play(move = '') {
    if (!this.enabled || this.volume <= 0) return;
    try {
      if (!await this.unlock()) return;
      const ctx = this.context;
      const now = ctx.currentTime;
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.setValueAtTime(1500, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.001, this.volume * 0.12), now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.105);
      filter.connect(gain); gain.connect(ctx.destination);
      const oscillator = ctx.createOscillator();
      oscillator.type = 'sine';
      const base = move.includes('2') ? 480 : 620;
      oscillator.frequency.setValueAtTime(base, now);
      oscillator.frequency.exponentialRampToValueAtTime(base * 0.72, now + 0.09);
      oscillator.connect(filter); oscillator.start(now); oscillator.stop(now + 0.11);
    } catch { /* Audio is optional; do not interrupt cube interaction. */ }
  }
}
