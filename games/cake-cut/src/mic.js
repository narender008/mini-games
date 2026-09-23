// Blowing into the microphone, only when the player turns it on. The sound
// is measured on this device, frame by frame, and never recorded, stored or
// sent anywhere. The stream is stopped as soon as it is not needed.
export class Mic {
  constructor(audio) {
    this.audio = audio;
    this.stream = null;
    this.floor = 0.01;
    this.level = 0;
  }

  static available() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.isSecureContext);
  }

  get on() {
    return !!this.stream;
  }

  async start() {
    this.audio.unlock();
    const ctx = this.audio.ctx;
    if (!ctx) throw new Error('no audio');
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    this.source = ctx.createMediaStreamSource(this.stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.3;
    this.source.connect(this.analyser);
    this.bins = new Uint8Array(this.analyser.frequencyBinCount);
    this.floor = 0.02;
    this.level = 0;
  }

  stop() {
    if (this.source) this.source.disconnect();
    if (this.stream) for (const t of this.stream.getTracks()) t.stop();
    this.stream = null;
    this.source = null;
    this.analyser = null;
    this.level = 0;
  }

  // Breath is loud, broadband noise weighted to the low end. Returns 0..1.
  read(dt) {
    if (!this.analyser) return 0;
    this.analyser.getByteFrequencyData(this.bins);
    const hz = this.audio.ctx.sampleRate / 2 / this.bins.length;
    let sum = 0;
    let n = 0;
    for (let i = Math.floor(80 / hz); i < Math.min(this.bins.length, Math.floor(1500 / hz)); i++) {
      sum += this.bins[i] / 255;
      n++;
    }
    const e = n ? sum / n : 0;
    // follow the room's quiet level slowly, so a noisy room is not a gale
    if (e < this.floor * 1.4) this.floor += (e - this.floor) * Math.min(1, dt * 0.8);
    else this.floor += (e - this.floor) * Math.min(1, dt * 0.05);
    const k = Math.max(0, Math.min(1, (e - this.floor - 0.06) / 0.22));
    this.level += (k - this.level) * Math.min(1, dt * 12);
    return this.level;
  }
}
