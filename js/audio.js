// Web Audio API synthesizer for medieval Honfoglalo sound effects

class SoundManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  playTone(freq, type = 'sine', duration = 0.15, delay = 0, gainVal = 0.15) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(gainVal, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playClick() {
    this.playTone(520, 'triangle', 0.06, 0, 0.12);
  }

  playClaim() {
    this.playTone(392, 'triangle', 0.12, 0, 0.16);
    this.playTone(523.25, 'triangle', 0.18, 0.09, 0.18);
  }

  playCastleBuild() {
    this.playTone(261.63, 'sawtooth', 0.14, 0, 0.12);
    this.playTone(329.63, 'sawtooth', 0.14, 0.1, 0.12);
    this.playTone(392.0, 'sawtooth', 0.14, 0.2, 0.14);
    this.playTone(523.25, 'triangle', 0.32, 0.3, 0.18);
  }

  playSwordClash() {
    this.playTone(880, 'sawtooth', 0.08, 0, 0.14);
    this.playTone(1320, 'square', 0.12, 0.05, 0.1);
    this.playTone(660, 'sawtooth', 0.15, 0.12, 0.12);
  }

  playCorrect() {
    this.playTone(523.25, 'sine', 0.12, 0, 0.18);
    this.playTone(659.25, 'sine', 0.12, 0.1, 0.18);
    this.playTone(783.99, 'triangle', 0.25, 0.2, 0.2);
  }

  playWrong() {
    this.playTone(220, 'sawtooth', 0.18, 0, 0.15);
    this.playTone(174.61, 'sawtooth', 0.28, 0.15, 0.15);
  }

  playTowerDestroy() {
    this.playTone(196, 'sawtooth', 0.18, 0, 0.2);
    this.playTone(146.83, 'sawtooth', 0.22, 0.12, 0.2);
    this.playTone(110, 'square', 0.35, 0.24, 0.22);
  }

  playVictoryFanfare() {
    const notes = [
      [392.0, 0, 0.15],
      [523.25, 0.15, 0.15],
      [659.25, 0.3, 0.15],
      [783.99, 0.45, 0.3],
      [659.25, 0.75, 0.15],
      [783.99, 0.9, 0.45]
    ];
    for (const [f, d, dur] of notes) {
      this.playTone(f, 'triangle', dur, d, 0.18);
    }
  }
}

export const sound = new SoundManager();
