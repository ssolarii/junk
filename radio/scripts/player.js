/** Owns the media connection. UI code subscribes to complete change snapshots. */
export class Player extends EventTarget {
  constructor(stations, options = {}) {
    super();
    if (!Array.isArray(stations) || !stations.length) throw new TypeError('A station registry is required.');
    this.stations = stations;
    this._station = stations.find(station => station.id === options.initialId) || stations[0];
    this._track = null;
    this._lastStation = this._station;
    this._volume = 1;
    this._ducking = 1;
    this._muted = false;
    this._state = 'Idle';
    this._message = 'Choose Play to listen.';
    this._audioFactory = options.audioFactory || (() => new Audio());
    this._resolveTrack = options.resolveTrack || null;
    this._remoteSequence = 0;
    this._contextFactory = options.contextFactory || (() => {
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      return Context ? new Context() : null;
    });
    this._setTimeout = options.setTimeout || globalThis.setTimeout.bind(globalThis);
    this._clearTimeout = options.clearTimeout || globalThis.clearTimeout.bind(globalThis);
    this._connectionTimeout = options.connectionTimeout ?? 12000;
    this._bufferTimeout = options.bufferTimeout ?? 15000;
    this._retryDelays = options.retryDelays || [1000, 2000, 4000];
    this._token = 0;
    this._playCommand = 0;
    this._retry = 0;
    this._alternate = false;
    this._wanted = false;
    this._disposed = false;
    this._audio = null;
    this._listeners = [];
    this._context = null;
    this._source = null;
    this._analyser = null;
    this._analysis = false;
  }

  get snapshot() {
    return {
      station: this._station, state: this._state, message: this._message,
      analysis: this._analysis, analyser: this._analysis ? this._analyser : undefined,
      sourceKind: this._track ? 'track' : 'station', track: this._track,
      lastStation: this._lastStation, volume: this._volume, ducking: this._ducking, muted: this._muted,
      position: this._track ? (this._audio?.currentTime || 0) : null,
      duration: this._track ? (Number.isFinite(this._audio?.duration) ? this._audio.duration : this._track.duration || null) : null,
    };
  }

  select(id) {
    const station = this.stations.find(item => item.id === id);
    if (!station || this._disposed) return;
    this._cancelRemoteTrack();
    this._station = station;
    this._lastStation = station;
    this._track = null;
    this._retry = 0;
    this._alternate = false;
    this._wanted = true;
    this._prepareContext();
    this._attempt(station.streamUrl, true);
    return true;
  }

  selectTrack(track) {
    if (this._disposed || !track || typeof track.id !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(track.id)) return false;
    const url = `/api/dj/audio/${track.id}`;
    // Local-library IDs resolve only through the read-only same-origin route.
    if (track.url && track.url !== url) return false;
    this._cancelRemoteTrack();
    this._track = Object.freeze({ id: track.id, title: String(track.title || 'Untitled track').slice(0, 500),
      artist: String(track.artist || '').slice(0, 500), url,
      duration: Number.isFinite(track.duration) && track.duration > 0 ? track.duration : null });
    this._station = { id: this._track.id, name: this._track.title, genre: this._track.artist || 'Local library',
      city: 'Local library', country: '', streamUrl: url, kind: 'track' };
    this._retry = 0;
    this._alternate = false;
    this._wanted = true;
    this._prepareContext();
    if (this._resolveTrack) this._startRemoteTrack();
    else this._attempt(url, true);
    return true;
  }

  _cancelRemoteTrack() {
    ++this._remoteSequence;
    this._remoteAbort?.abort();this._remoteAbort=null;
    if (this._remoteResource) {
      this._release();
      this._remoteResource.release();this._remoteResource=null;
    }
  }

  _startRemoteTrack() {
    const sequence=++this._remoteSequence, abort=new AbortController();
    this._remoteAbort=abort;this._release();
    this._publish('Connecting','Preparing your track.');
    let pending;
    try { pending=this._resolveTrack(this._track.id,abort.signal); }
    catch { this._wanted=false;this._publish('Unavailable','Could not load the remote track.');return; }
    Promise.resolve(pending).then(resource=>{
      if(sequence!==this._remoteSequence||!this._wanted||this._disposed){resource?.release?.();return;}
      if(!resource||typeof resource.url!=='string'||!resource.url.startsWith('blob:')||typeof resource.release!=='function'){resource?.release?.();throw Error('Invalid track resource.');}
      this._remoteAbort=null;this._remoteResource=resource;this._station.streamUrl=resource.url;this._attempt(resource.url,true);
    }).catch(()=>{
      if(sequence!==this._remoteSequence||!this._wanted||this._disposed)return;
      this._remoteAbort=null;this._wanted=false;this._publish('Unavailable','Could not load the remote track.');
    });
  }

  setVolume(value) { return this._setLevel('_volume', value); }
  setDucking(value) { return this._setLevel('_ducking', value); }
  setMuted(value) {
    this._muted = Boolean(value);
    this._applyVolume(); this._publish();
  }

  _setLevel(key, value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return false;
    this[key] = Math.max(0, Math.min(1, value));
    this._applyVolume(key === '_ducking'); this._publish();
    return true;
  }

  _applyVolume(smooth = false) {
    if (this._volumeTimer !== undefined) this._clearTimeout(this._volumeTimer);
    this._volumeTimer = undefined;
    if (!this._audio) return;
    const level = this._volume * this._ducking;
    this._audio.muted = this._muted;
    if (this._gain) {
      this._audio.volume = 1;
      const parameter = this._gain.gain;
      if (parameter.setTargetAtTime) {
        parameter.cancelScheduledValues?.(this._context.currentTime);
        parameter.setTargetAtTime(level, this._context.currentTime, 0.035);
      } else parameter.value = level;
    } else if (smooth && Number.isFinite(this._audio.volume)) {
      const audio = this._audio, start = audio.volume; let step = 0;
      const fade = () => {
        if (this._audio !== audio || this._gain) return;
        step++; audio.volume = step === 5 ? level : start + (level - start) * step / 5;
        this._volumeTimer = step < 5 ? this._setTimeout(fade, 30) : undefined;
      };
      this._volumeTimer = this._setTimeout(fade, 30);
    } else this._audio.volume = level;
  }

  seek(seconds) {
    const duration = this.snapshot.duration;
    if (!this._track || !this._audio || !Number.isFinite(seconds) || !duration) return false;
    try { this._audio.currentTime = Math.max(0, Math.min(seconds, duration)); this._publish(); return true; }
    catch { return false; }
  }

  play() {
    if (this._disposed) return;
    if (this._wanted && this._state === 'Playing') return;
    this._wanted = true;
    this._prepareContext();
    if(this._resolveTrack&&this._track&&!this._remoteResource){this._startRemoteTrack();return;}
    if (this._audio && this._audio.src && this._state !== 'Unavailable') {
      if (this._track && this._state === 'Ended') this._audio.currentTime = 0;
      this._clearTimers();
      this._armConnection(this._token);
      this._playMedia(this._token);
    } else {
      // Explicit Play after a stopped failure is a fresh user attempt.
      this._retry = 0;
      this._alternate = false;
      this._attempt(this._station.streamUrl, true);
    }
  }

  pause() {
    if (this._disposed) return;
    this._wanted = false;
    if(this._remoteAbort){++this._remoteSequence;this._remoteAbort.abort();this._remoteAbort=null;}
    ++this._playCommand;
    this._clearTimers();
    this._audio?.pause();
    this._publish('Paused', 'Paused. Choose Play to listen.');
  }

  toggle() { this._wanted ? this.pause() : this.play(); }
  next() { this._step(1); }
  previous() { this._step(-1); }
  shuffle() {
    const choices = this.stations.filter(item => item.id !== this._station.id);
    if (choices.length) this.select(choices[Math.floor(Math.random() * choices.length)].id);
  }

  dispose() {
    this._wanted = false;
    this._disposed = true;
    this._cancelRemoteTrack();
    this._release();
    this._context?.removeEventListener?.('statechange', this._contextChanged);
    try { Promise.resolve(this._context?.close()).catch(() => {}); } catch { /* Playback cleanup is best effort. */ }
    this._context = null;
  }

  _step(direction) {
    const index = this.stations.findIndex(station => station.id === this._lastStation.id);
    this.select(this.stations[(index + direction + this.stations.length) % this.stations.length].id);
  }

  _publish(state = this._state, message = this._message) {
    this._state = state;
    this._message = message;
    this.dispatchEvent(new CustomEvent('change', { detail: this.snapshot }));
  }

  _prepareContext() {
    // Called synchronously by user commands, never by reconnect timers.
    try {
      if (!this._context) {
        this._context = this._contextFactory();
        this._contextChanged = () => {
          if (this._wanted && this._source && this._context.state !== 'running') this._nativeFallback();
        };
        this._context?.addEventListener?.('statechange', this._contextChanged);
      }
      if (this._context?.state === 'suspended') {
        Promise.resolve(this._context.resume()).then(() => {
          if (this._wanted && this._state === 'Playing') this._attachAnalysis(this._token);
        }).catch(() => {
          if (this._wanted && this._source) this._nativeFallback();
        });
      } else if (this._source && this._context?.state !== 'running') {
        this._nativeFallback();
      }
    } catch {
      if (this._wanted && this._source) this._nativeFallback();
    }
  }

  _clearTimers() {
    for (const name of ['_connectTimer', '_bufferTimer', '_retryTimer']) {
      if (this[name] !== undefined) this._clearTimeout(this[name]);
      this[name] = undefined;
    }
  }

  _release() {
    ++this._token;
    ++this._playCommand;
    if (this._volumeTimer !== undefined) this._clearTimeout(this._volumeTimer);
    this._volumeTimer = undefined;
    this._clearTimers();
    const audio = this._audio;
    this._audio = null;
    for (const [name, listener] of this._listeners) audio?.removeEventListener(name, listener);
    this._listeners = [];
    try { this._source?.disconnect(); } catch { /* An optional graph must not block release. */ }
    try { this._analyser?.disconnect(); } catch { /* Optional analysis. */ }
    try { this._gain?.disconnect(); } catch { /* Optional gain. */ }
    this._gain = null;
    this._source = null;
    this._analyser = null;
    this._analysis = false;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
  }

  _current(token) { return token === this._token && this._wanted && !this._disposed; }

  _nativeFallback() {
    const position = this._track ? this._audio?.currentTime || 0 : 0;
    this._attempt(this._url, false, position);
  }

  _attempt(url, cors, position = 0) {
    this._release();
    if (!this._wanted || this._disposed) return;
    const token = this._token;
    this._url = url;
    this._cors = cors;
    let audio;
    try { audio = this._audioFactory(); } catch {
      this._wanted = false;
      this._publish('Unavailable', 'Audio is unavailable in this browser.');
      return;
    }
    this._audio = audio;
    this._applyVolume();
    audio.preload = 'none';
    if (cors) audio.crossOrigin = 'anonymous';
    else audio.removeAttribute('crossorigin');
    const listen = (name, fn) => {
      const guarded = () => { if (this._current(token)) fn(); };
      audio.addEventListener(name, guarded);
      this._listeners.push([name, guarded]);
    };
    if (this._track && position > 0) listen('loadedmetadata', () => {
      try { audio.currentTime = position; } catch { /* A changed local file may no longer be seekable. */ }
    });
    listen('loadstart', () => this._publish(this._retry || this._alternate ? 'Reconnecting' : 'Connecting',
      this._track ? 'Opening local track.' : this._alternate ? (this._station.fallbackStreamUrl ? 'Trying an alternate stream.' : 'Trying the Radio Garden alternate source.') : 'Connecting to the station.'));
    listen('playing', () => {
      this._clearTimers();
      this._retry = 0;
      this._publish('Playing', this._track ? 'Local track playing.' : this._alternate ? (this._station.fallbackStreamUrl ? 'Playing from an alternate stream.' : 'Playing from the Radio Garden alternate source.') : 'Live stream playing.');
      this._attachAnalysis(token);
    });
    for (const event of ['waiting', 'stalled']) listen(event, () => {
      if (this._state !== 'Playing' && this._state !== 'Buffering') return;
      this._publish('Buffering', 'Waiting for the station.');
      if (this._bufferTimer === undefined) this._bufferTimer = this._setTimeout(() => {
        if (this._current(token)) this._failed(token, false);
      }, this._bufferTimeout);
    });
    listen('pause', () => {
      // A controller pause clears _wanted first; an unexpected native pause still
      // reflects the actual media state, rather than claiming audio is playing.
      if (!audio.paused) return; // A queued pause may arrive after a newer play().
      if (this._track && audio.ended) return; // Native pause precedes the local completion event.
      this._wanted = false;
      this._clearTimers();
      this._publish('Paused', 'Paused. Choose Play to listen.');
    });
    listen('error', () => this._failed(token));
    listen('ended', () => {
      if (!this._track) return this._failed(token, false);
      this._wanted = false;
      ++this._playCommand;
      this._clearTimers();
      const completed = { ...this.snapshot, state: 'Ended', message: 'Local track ended.' };
      this._publish('Ended', completed.message);
      this.dispatchEvent(new CustomEvent('ended', { detail: completed }));
    });
    for (const event of ['timeupdate', 'durationchange']) listen(event, () => { if (this._track) this._publish(); });
    this._armConnection(token);
    audio.src = url;
    try { audio.load(); this._playMedia(token); } catch { this._failed(token); }
  }

  _armConnection(token) {
    if (this._connectTimer !== undefined) this._clearTimeout(this._connectTimer);
    this._connectTimer = this._setTimeout(() => {
      if (this._current(token)) this._failed(token);
    }, this._connectionTimeout);
  }

  _playMedia(token) {
    const command = ++this._playCommand;
    try {
      Promise.resolve(this._audio.play()).catch(error => {
        if (!this._current(token) || command !== this._playCommand) return;
        if (error?.name === 'NotAllowedError') {
          this._wanted = false;
          this._clearTimers();
          this._audio.pause();
          this._publish('Paused', 'Choose Play to allow this station to start.');
        } else this._failed(token);
      });
    } catch (error) {
      if (error?.name === 'NotAllowedError') {
        this._wanted = false;
        this._clearTimers();
        this._publish('Paused', 'Choose Play to allow this station to start.');
      } else this._failed(token);
    }
  }

  _failed(token, allowCorsFallback = true) {
    if (!this._current(token)) return;
    if (this._track) {
      this._release(); this._wanted = false;
      this._publish('Unavailable', 'This local file is unavailable or cannot be played. Choose another track.');
      this.dispatchEvent(new CustomEvent('trackerror', { detail: this.snapshot }));
      return;
    }
    const url = this._url;
    // A rejected source can try the station's own alternative before more retries.
    if (!this._alternate && this._station.fallbackStreamUrl && this._audio?.error?.code === 4) {
      this._release();
      this._alternate = true;
      this._retry = this._retryDelays.length;
      this._publish('Reconnecting', 'Trying an alternate stream.');
      this._attempt(this._station.fallbackStreamUrl, true);
      return;
    }
    if (allowCorsFallback && this._cors && !this._source) {
      this._attempt(url, false);
      return;
    }
    this._release();
    const nextToken = this._token;
    if (this._retry < this._retryDelays.length) {
      const delay = this._retryDelays[this._retry++];
      this._publish('Reconnecting', 'The station stopped responding. Reconnecting.');
      this._retryTimer = this._setTimeout(() => {
        if (this._current(nextToken)) this._attempt(url, true);
      }, delay);
    } else if (!this._alternate && (this._station.fallbackStreamUrl || this._station.radioGardenId)) {
      this._alternate = true;
      this._publish('Reconnecting', this._station.fallbackStreamUrl ? 'Trying an alternate stream.' : 'Trying the Radio Garden alternate source.');
      this._retryTimer = this._setTimeout(() => {
        if (this._current(nextToken)) this._attempt(
          this._station.fallbackStreamUrl || `https://radio.garden/api/ara/content/listen/${this._station.radioGardenId}/channel.mp3`, true);
      }, 0);
    } else {
      this._wanted = false;
      this._publish('Unavailable', "This station isn't responding. Choose Play to retry, or pick another station.");
    }
  }

  _attachAnalysis(token) {
    if (!this._current(token) || !this._cors || !this._context || this._context.state !== 'running' || this._source) return;
    let analyser;
    try {
      analyser = this._context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.78;
    } catch { return; } // Native playback has not been touched.
    try {
      this._source = this._context.createMediaElementSource(this._audio);
      // Audible output is independent of the optional analyser branch.
      if (this._context.createGain) {
        this._gain = this._context.createGain();
        this._source.connect(this._gain);
        this._gain.connect(this._context.destination);
        this._applyVolume();
      } else this._source.connect(this._context.destination);
    } catch {
      try { analyser.disconnect(); } catch { /* Optional analysis. */ }
      this._nativeFallback(); // A bound element cannot return to native routing.
      return;
    }
    try {
      this._source.connect(analyser);
      this._analyser = analyser;
      this._analysis = true;
    } catch {
      try { analyser.disconnect(); } catch { /* Audible destination stays connected. */ }
    }
    this._publish();
  }
}
