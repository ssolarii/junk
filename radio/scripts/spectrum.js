// Display scaling only: fixed -80..-20 dB window, with no automatic gain.
export function dbToLevel(db) {
  return Number.isFinite(db) ? Math.max(0, Math.min(1, (db + 80) / 60)) : 0;
}

export function smoothing(current, target, deltaMs, attackMs = 50, releaseMs = 320) {
  if (!(deltaMs > 0) || !Number.isFinite(deltaMs)) return current;
  const duration = target > current ? attackMs : releaseMs;
  return Math.max(0, Math.min(1, target + (current - target) * Math.exp(-deltaMs / duration)));
}

export function createBands({ sampleRate, fftSize = 2048, bandCount = 32, minHz = 50, maxHz = Math.min(16000, 0.45 * sampleRate) }) {
  if (!(sampleRate > 0) || !Number.isFinite(sampleRate) || !Number.isInteger(fftSize) || fftSize < 2 ||
      !Number.isInteger(bandCount) || bandCount < 1 || !(minHz > 0) || !(maxHz > minHz) || maxHz > sampleRate / 2) {
    throw new RangeError('Invalid spectrum band configuration');
  }
  const bands = new Array(bandCount);
  const ratio = maxHz / minHz;
  const binHz = sampleRate / fftSize;
  for (let i = 0; i < bandCount; i++) {
    const lowHz = minHz * ratio ** (i / bandCount);
    const highHz = i === bandCount - 1 ? maxHz : minHz * ratio ** ((i + 1) / bandCount);
    bands[i] = {
      lowHz, highHz, centerHz: Math.sqrt(lowHz * highHz),
      startBin: Math.min(fftSize / 2 - 1, Math.ceil(lowHz / binHz)),
      endBin: Math.min(fftSize / 2 - 1, Math.ceil(highHz / binHz) - 1),
    };
  }
  return bands;
}

export class SpectrumPipeline {
  constructor({ sampleRate, fftSize = 2048, bandCount = 32, minHz = 50, maxHz = Math.min(16000, 0.45 * sampleRate) }) {
    this.bands = createBands({ sampleRate, fftSize, bandCount, minHz, maxHz });
    this.levels = new Float32Array(bandCount);
    this.peaks = new Float32Array(bandCount);
    this.quiet = false;
    this._minHz = minHz;
    this._maxHz = maxHz;
    this._logRange = Math.log(maxHz / minHz);
    this._silenceMs = 0;
    this._elapsedMs = 0;
    this._holds = new Float64Array(bandCount);
    this._velocities = new Float64Array(bandCount);
    this._tilts = new Float64Array(bandCount);
    this._sampleBins = new Int32Array(bandCount).fill(-1);
    this._fractions = new Float64Array(bandCount);
    const binHz = sampleRate / fftSize;
    for (let i = 0; i < bandCount; i++) {
      const band = this.bands[i];
      // Fixed +3 dB/octave above 1 kHz makes existing treble energy legible.
      this._tilts[i] = Math.max(0, 3 * Math.log2(band.centerHz / 1000));
      if (band.highHz - band.lowHz < binHz || band.startBin > band.endBin) {
        const position = Math.min(fftSize / 2 - 1, band.centerHz / binHz);
        this._sampleBins[i] = Math.floor(position);
        this._fractions[i] = position - Math.floor(position);
      }
    }
  }

  getPosition(hz) {
    if (!(hz > this._minHz)) return 0;
    if (hz >= this._maxHz) return 1;
    return Math.log(hz / this._minHz) / this._logRange;
  }

  update(dbBins, deltaMs) {
    const elapsed = Number.isFinite(deltaMs) && deltaMs > 0 ? deltaMs : 0;
    this._elapsedMs += elapsed;
    let silent = true;
    for (let bin = 0; bin < dbBins.length; bin++) {
      if (Number.isFinite(dbBins[bin]) && dbBins[bin] >= -100) {
        silent = false;
        break;
      }
    }
    this._silenceMs = silent ? this._silenceMs + elapsed : 0;
    this.quiet = this._silenceMs >= 3000;
    const attack = Math.exp(-elapsed / 50);
    const release = Math.exp(-elapsed / 320);
    for (let i = 0; i < this.bands.length; i++) {
      const band = this.bands[i];
      const sampleBin = this._sampleBins[i];
      let db = -Infinity;
      if (sampleBin >= 0) {
        const left = dbBins[sampleBin];
        const right = dbBins[sampleBin + 1];
        const leftFinite = Number.isFinite(left);
        const rightFinite = Number.isFinite(right);
        // A silent neighbor is a floor, never a source of positive energy.
        // Both silent neighbors remain -Infinity, bypassing tilt entirely.
        if (leftFinite || rightFinite) {
          const low = leftFinite ? left : -120;
          const high = rightFinite ? right : -120;
          db = low + (high - low) * this._fractions[i];
        }
      } else {
        for (let bin = band.startBin; bin <= band.endBin && bin < dbBins.length; bin++) {
          const value = dbBins[bin];
          if (Number.isFinite(value) && value > db) db = value;
        }
      }
      const target = dbToLevel(db + this._tilts[i]);
      const previous = this.levels[i];
      const level = Math.max(0, Math.min(1, target + (previous - target) * (target > previous ? attack : release)));
      // Snap imperceptible tails to zero so a renderer can stop when settled.
      this.levels[i] = level < 0.0001 && target === 0 ? 0 : level;
      if (this.levels[i] >= this.peaks[i]) {
        this.peaks[i] = this.levels[i];
        this._holds[i] = 500;
        this._velocities[i] = 0;
      } else {
        const fallSeconds = Math.max(0, elapsed - this._holds[i]) / 1000;
        this._holds[i] = Math.max(0, this._holds[i] - elapsed);
        const velocity = this._velocities[i];
        this.peaks[i] = Math.max(this.levels[i], this.peaks[i] - velocity * fallSeconds - 0.9 * fallSeconds * fallSeconds);
        this._velocities[i] = velocity + 1.8 * fallSeconds;
      }
    }
    return this;
  }

  reset() {
    this.levels.fill(0);
    this.peaks.fill(0);
    this._holds.fill(0);
    this._velocities.fill(0);
    this._silenceMs = 0;
    this._elapsedMs = 0;
    this.quiet = false;
    return this;
  }
}
