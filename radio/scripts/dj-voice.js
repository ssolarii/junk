/** Installed browser speech. External providers must be configured separately. */
export class DJVoice extends EventTarget {
  constructor(player, options = {}) {
    super();
    this.player = player;
    this._synthesis = options.synthesis === undefined ? globalThis.speechSynthesis : options.synthesis;
    this._utteranceFactory = options.utteranceFactory || (text => new SpeechSynthesisUtterance(text));
    this._state = 'idle';
    this._message = '';
    this._generation = 0;
    this._disposed = false;
    this._voicesChanged = () => this._publish();
    this._synthesis?.addEventListener?.('voiceschanged', this._voicesChanged);
  }

  get voices() {
    return (this._synthesis?.getVoices?.() || []).map(voice => ({ voiceURI: voice.voiceURI, name: voice.name,
      lang: voice.lang, localService: voice.localService, default: voice.default }));
  }
  get snapshot() { return { state: this._state, provider: 'system', message: this._message, voices: this.voices }; }

  speak(text, options = {}) {
    if (this._disposed || this._state === 'listening') return Promise.resolve({ status: 'cancelled', provider: 'system' });
    this.stop();
    if (!this._synthesis?.speak || typeof text !== 'string' || !text.trim()) {
      this._state = 'unavailable'; this._message = 'Installed speech is unavailable. The DJ can still reply in text.';
      this._publish();
      return Promise.resolve({ status: 'unavailable', provider: 'system' });
    }
    const generation = ++this._generation;
    return new Promise(resolve => {
      this._finish = status => {
        if (generation !== this._generation) return;
        this._finish = null;
        this._restore();
        this._state = 'idle';
        this._message = status === 'error' ? 'Installed speech failed. The DJ reply remains available in text.' : '';
        this._publish(); resolve({ status, provider: 'system' });
      };
      try {
        const utterance = this._utteranceFactory(text.trim().slice(0, 5000));
        this._utterance = utterance;
        const voices = this._synthesis.getVoices?.() || [];
        const chosen = voices.find(voice => voice.voiceURI === options.voiceURI);
        if (chosen) utterance.voice = chosen;
        utterance.rate = this._level(options.rate, 1, 0.5, 2);
        utterance.volume = this._level(options.volume, 1);
        utterance.onend = () => { if (generation === this._generation) this._finish?.('ended'); };
        utterance.onerror = () => { if (generation === this._generation) this._finish?.('error'); };
        this._duck(this._level(options.ducking, 0.25));
        this._state = 'speaking'; this._message = 'Speaking with an installed voice.'; this._publish();
        this._synthesis.speak(utterance);
      } catch { this._finish?.('error'); }
    });
  }

  stop() {
    const listening = this._state === 'listening';
    // Resolve before invalidating; late browser callbacks are generation guarded.
    this._finish?.('cancelled');
    ++this._generation;
    this._utterance = null;
    try { this._synthesis?.cancel(); } catch { /* Always restore music. */ }
    if (listening) return;
    this._restore(); this._state = 'idle'; this._message = ''; this._publish();
  }
  interrupt() { this.stop(); }

  beginListening(options = {}) {
    if (this._disposed || this._state === 'listening') return;
    this.stop();
    this._duck(this._level(options.ducking, 0.15));
    this._state = 'listening'; this._message = 'Listening.'; this._publish();
  }

  endListening() {
    if (this._state !== 'listening') return;
    this._restore(); this._state = 'idle'; this._message = ''; this._publish();
  }
  dispose() { this.endListening(); this.stop(); this._disposed = true; this._synthesis?.removeEventListener?.('voiceschanged', this._voicesChanged); }

  _level(value, fallback, minimum = 0, maximum = 1) {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
  }
  _duck(value) {
    this._priorDucking = this.player.snapshot.ducking ?? 1;
    this.player.setDucking(value);
  }
  _restore() {
    if (this._priorDucking === undefined) return;
    const previous = this._priorDucking; this._priorDucking = undefined;
    this.player.setDucking(previous);
  }
  _publish() { this.dispatchEvent(new CustomEvent('change', { detail: this.snapshot })); }
}
