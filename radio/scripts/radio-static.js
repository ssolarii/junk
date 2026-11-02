/** Optional generated sound effects, isolated from station media and its graph. */
export class RadioStatic {
  constructor({ contextFactory, random = Math.random } = {}) {
    this._contextFactory = contextFactory || (() => {
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      return Context ? new Context() : null;
    });
    this._random = random;
    this._enabled = false;
    this._armed = false;
    this._disposed = false;
    this._armVersion = 0;
    this._context = null;
    this._buffer = null;
    this._active = null;
  }

  get enabled() { return this._enabled; }

  // Safe for preference restoration: no context creation, resume, or playback.
  setEnabled(enabled) {
    if (this._disposed) return;
    this._enabled = Boolean(enabled);
    if (!this._enabled) {
      this._armed = false;
      this._armVersion++;
      this.stop();
    }
  }

  // Call directly from a user gesture. A failure only disables this attempt.
  async arm() {
    if (!this._enabled || this._disposed) return false;
    const version = this._armVersion;
    try {
      this._context ||= this._contextFactory();
      if (!this._context || this._context.state === 'closed') return false;
      if (this._context.state !== 'running') await this._context.resume();
      if (this._disposed || !this._enabled || version !== this._armVersion) return false;
      this._armed = this._context.state === 'running';
      return this._armed;
    } catch {
      this._armed = false;
      return false;
    }
  }

  start() {
    if (this._active?.persistent && !this._active.stopping) return true;
    return this._play('tune', true);
  }

  burst(kind = 'tune') { return this._play(kind, false); }

  _play(kind, persistent) {
    if (!this._enabled || !this._armed || this._disposed || this._context?.state !== 'running') return false;
    // Retuning immediately releases the previous graph: rapid clicks cannot
    // accumulate sources, even when the audio clock or ended events are delayed.
    this._stop(true);
    const graph = { persistent };
    this._active = graph;
    try {
      const context = this._context;
      if (!this._buffer) {
        const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * .7), context.sampleRate);
        const samples = buffer.getChannelData(0);
        for (let index = 0; index < samples.length; index++) samples[index] = this._random() * 2 - 1;
        this._buffer = buffer;
      }
      graph.source = context.createBufferSource();
      graph.filter = context.createBiquadFilter();
      graph.gain = context.createGain();
      const now = context.currentTime;
      const duration = kind === 'failure' ? .62 : .3;
      const end = now + duration;
      graph.source.buffer = this._buffer;
      graph.source.loop = persistent;
      graph.filter.type = 'bandpass';
      graph.filter.frequency.setValueAtTime(kind === 'failure' ? 1100 : 1700, now);
      graph.filter.Q.setValueAtTime(.65, now);
      graph.gain.gain.setValueAtTime(0, now);
      graph.gain.gain.linearRampToValueAtTime(.025, now + .018);
      if (!persistent) {
        graph.gain.gain.setValueAtTime(.025, end - .06);
        graph.gain.gain.linearRampToValueAtTime(0, end);
      }
      graph.source.connect(graph.filter);
      graph.filter.connect(graph.gain);
      graph.gain.connect(context.destination);
      graph.source.onended = () => this._release(graph);
      graph.source.start(now);
      if (!persistent) graph.source.stop(end);
      return true;
    } catch {
      this._stop(true);
      return false;
    }
  }

  stop() { this._stop(false); }

  _stop(immediate) {
    const graph = this._active;
    if (!graph) return;
    graph.stopping = true;
    try {
      const now = this._context.currentTime;
      const gain = graph.gain?.gain;
      if (gain) {
        if (!immediate && typeof gain.cancelAndHoldAtTime === 'function') gain.cancelAndHoldAtTime(now);
        else {
          gain.cancelScheduledValues(now);
          gain.setValueAtTime(immediate ? 0 : gain.value, now);
        }
        if (!immediate) gain.linearRampToValueAtTime(0, now + .015);
      }
      graph.source?.stop(now + (immediate ? 0 : .016));
      if (immediate) this._release(graph);
    } catch {
      this._release(graph);
    }
  }

  _release(graph) {
    for (const node of [graph.source, graph.filter, graph.gain]) {
      try { node?.disconnect(); } catch { /* Optional audio cannot disrupt playback. */ }
    }
    if (graph.source) graph.source.onended = null;
    if (this._active === graph) this._active = null;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._enabled = false;
    this._armed = false;
    this._armVersion++;
    this._stop(true);
    try { this._context?.close()?.catch(() => {}); } catch { /* Already unavailable. */ }
    this._buffer = null;
    this._context = null;
  }
}
