
// ── HA Tools Server Persistence Helper ──
// Uses HA frontend/set_user_data for cross-device per-user persistence
// Falls back to localStorage for instant reads (cache), writes to both
window._haToolsPersistence = window._haToolsPersistence || {
  _cache: {},
  _hass: null,
  setHass(hass) { this._hass = hass; },

  async save(key, data) {
    const fullKey = 'ha-tools-' + key;
    // Always write localStorage as fast cache
    try { localStorage.setItem(fullKey, JSON.stringify(data)); } catch(e) {}
    // Write to HA server (cross-device)
    if (this._hass) {
      try {
        await this._hass.callWS({ type: 'frontend/set_user_data', key: fullKey, value: data });
      } catch(e) { console.warn('[HA Tools Persist] Server save error:', key, e); }
    }
    this._cache[fullKey] = data;
  },

  async load(key) {
    const fullKey = 'ha-tools-' + key;
    // 1. Memory cache (instant)
    if (this._cache[fullKey] !== undefined) return this._cache[fullKey];
    // 2. localStorage (fast, may be stale on other device)
    try {
      const raw = localStorage.getItem(fullKey);
      if (raw) {
        this._cache[fullKey] = JSON.parse(raw);
      }
    } catch(e) {}
    // 3. HA server (authoritative, cross-device) — async update
    if (this._hass) {
      try {
        const result = await this._hass.callWS({ type: 'frontend/get_user_data', key: fullKey });
        if (result && result.value !== undefined && result.value !== null) {
          this._cache[fullKey] = result.value;
          // Update localStorage cache
          try { localStorage.setItem(fullKey, JSON.stringify(result.value)); } catch(e) {}
          return result.value;
        }
      } catch(e) { console.warn('[HA Tools Persist] Server load error:', key, e); }
    }
    return this._cache[fullKey] || null;
  },

  // Synchronous read from cache/localStorage only (for initial render)
  loadSync(key) {
    const fullKey = 'ha-tools-' + key;
    if (this._cache[fullKey] !== undefined) return this._cache[fullKey];
    try {
      const raw = localStorage.getItem(fullKey);
      if (raw) {
        this._cache[fullKey] = JSON.parse(raw);
        return this._cache[fullKey];
      }
    } catch(e) {}
    return null;
  }
};

class HaFrigatePrivacy extends HTMLElement {
  constructor() {
    super();
    this._lang = (navigator.language || '').startsWith('pl') ? 'pl' : 'en';
    this.attachShadow({ mode: 'open' });
    this._lastRenderTime = 0;
    this._renderScheduled = false;
    this._firstHassRender = false;
    this._lastHtml = '';
    this._hass = null;
    this._config = {};
    this._activeTab = 'control';
    this._frigateRunning = null;
    this._cameras = [];
    this._selectedCameras = new Set();
    this._customMinutes = 30;
    this._privacyActive = false;
    this._privacyEndTime = null;
    this._privacyTimerInterval = null;
    this._schedules = [];
    this._scheduleForm = { enabled: true, days: [1,2,3,4,5], startHour: 18, startMin: 0, endHour: 20, endMin: 0, repeat: true, label: '' };
    this._editingScheduleIdx = null;
    this._history = [];
    // Notification settings
    this._notifyEnabled = true;
    this._notifyService = 'persistent_notification'; // or 'notify.mobile_app_xxx'
    this._notifyBeforeEndMin = 5;
    this._warningSent = false;
    this._privacyCameras = 'all'; // cameras string for active session
    this._privacyStartedMin = 0;
  }

  static getConfigElement() {
    return document.createElement('ha-frigate-privacy-editor');
  }

  static getStubConfig() {
    return {
      type: 'custom:ha-frigate-privacy',
      title: 'Frigate Privacy',
      frigate_addon_id: 'ccab4aaf_frigate',
      frigate_running_entity: 'binary_sensor.frigate_running',
      cameras: []
    };
  }

  _sanitize(str) {
    if (!str) return str;
    try { return decodeURIComponent(escape(str)); } catch(e) { return str; }
  }

  get _t() {
    const T = {
      pl: {
        title: 'Frigate Privacy',
        tabControl: 'Sterowanie',
        tabSchedule: 'Harmonogram',
        tabHistory: 'Historia',
        frigateStatus: 'Status Frigate',
        running: 'Dziala',
        stopped: 'Zatrzymany',
        unknown: 'Nieznany',
        selectCameras: 'Wybierz kamery',
        allCameras: 'Wszystkie kamery',
        quickPause: 'Szybka pauza',
        customDuration: 'Wlasny czas (min)',
        pauseFrigate: 'Wstrzymaj Frigate',
        resumeFrigate: 'Wznow Frigate',
        privacyActive: 'Tryb prywatnosci aktywny',
        remainingTime: 'Pozostaly czas',
        cancelPrivacy: 'Anuluj prywatnosc',
        scheduleTitle: 'Zaplanowane okna prywatnosci',
        addSchedule: 'Dodaj harmonogram',
        editSchedule: 'Edytuj harmonogram',
        saveSchedule: 'Zapisz',
        cancelEdit: 'Anuluj',
        deleteSchedule: 'Usun',
        days: ['Pn', 'Wt', 'Sr', 'Cz', 'Pt', 'So', 'Nd'],
        daysLong: ['Poniedzialek', 'Wtorek', 'Sroda', 'Czwartek', 'Piatek', 'Sobota', 'Niedziela'],
        from: 'Od',
        to: 'Do',
        repeat: 'Powtarzaj',
        oneTime: 'Jednorazowo',
        label: 'Etykieta',
        enabled: 'Wlaczony',
        disabled: 'Wylaczony',
        noSchedules: 'Brak zaplanowanych okien prywatnosci',
        historyTitle: 'Historia prywatnosci',
        noHistory: 'Brak historii',
        started: 'Uruchomiono',
        duration: 'Czas trwania',
        min: 'min',
        manualPause: 'Pauza reczna',
        scheduled: 'Zaplanowane',
        cancelled: 'Anulowano',
        completed: 'Zakonczone',
        errorCallScript: 'Blad wywolania skryptu prywatnosci',
        errorStopAddon: 'Blad zatrzymywania Frigate',
        errorStartAddon: 'Blad uruchamiania Frigate',
        noCamerasFound: 'Nie znaleziono kamer Frigate',
        privacyModeStarted: 'Tryb prywatnosci uruchomiony na',
        frigateResumed: 'Frigate wznowiony',
        tabSettings: 'Ustawienia',
        notifications: 'Powiadomienia',
        notifyEnabled: 'Wlacz powiadomienia',
        notifyService: 'Usluga powiadomien',
        notifyPersistent: 'Powiadomienia HA (persistent)',
        notifyMobile: 'Aplikacja mobilna',
        notifyBeforeEnd: 'Powiadom przed koncem (min)',
        extendTime: 'Wydluz czas',
        extendBy: 'Wydluz o',
        privacyEndingSoon: 'Prywatnosc konczy sie za',
        forCameras: 'dla kamer',
        allCamerasLabel: 'wszystkie kamery',
        notifExtendQuestion: 'Wydluz?',
        privacyExtended: 'Prywatnosc wydluzona o',
        scheduleReminder: 'Przypomnienie: zaplanowana prywatnosc',
        startsIn: 'zaczyna sie za',
        endsIn: 'konczy sie za',
      },
      en: {
        title: 'Frigate Privacy',
        tabControl: 'Control',
        tabSchedule: 'Schedule',
        tabHistory: 'History',
        frigateStatus: 'Frigate Status',
        running: 'Running',
        stopped: 'Stopped',
        unknown: 'Unknown',
        selectCameras: 'Select cameras',
        allCameras: 'All cameras',
        quickPause: 'Quick pause',
        customDuration: 'Custom duration (min)',
        pauseFrigate: 'Pause Frigate',
        resumeFrigate: 'Resume Frigate',
        privacyActive: 'Privacy mode active',
        remainingTime: 'Time remaining',
        cancelPrivacy: 'Cancel privacy',
        scheduleTitle: 'Scheduled privacy windows',
        addSchedule: 'Add schedule',
        editSchedule: 'Edit schedule',
        saveSchedule: 'Save',
        cancelEdit: 'Cancel',
        deleteSchedule: 'Delete',
        days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        daysLong: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        from: 'From',
        to: 'To',
        repeat: 'Repeat',
        oneTime: 'One-time',
        label: 'Label',
        enabled: 'Enabled',
        disabled: 'Disabled',
        noSchedules: 'No scheduled privacy windows',
        noHistory: 'No history',
        historyTitle: 'Privacy history',
        started: 'Started',
        duration: 'Duration',
        min: 'min',
        manualPause: 'Manual pause',
        scheduled: 'Scheduled',
        cancelled: 'Cancelled',
        completed: 'Completed',
        errorCallScript: 'Error calling privacy script',
        errorStopAddon: 'Error stopping Frigate',
        errorStartAddon: 'Error starting Frigate',
        noCamerasFound: 'No Frigate cameras found',
        privacyModeStarted: 'Privacy mode started for',
        frigateResumed: 'Frigate resumed',
        tabSettings: 'Settings',
        notifications: 'Notifications',
        notifyEnabled: 'Enable notifications',
        notifyService: 'Notification service',
        notifyPersistent: 'HA notifications (persistent)',
        notifyMobile: 'Mobile app',
        notifyBeforeEnd: 'Notify before end (min)',
        extendTime: 'Extend time',
        extendBy: 'Extend by',
        privacyEndingSoon: 'Privacy ending in',
        forCameras: 'for cameras',
        allCamerasLabel: 'all cameras',
        notifExtendQuestion: 'Extend?',
        privacyExtended: 'Privacy extended by',
        scheduleReminder: 'Reminder: scheduled privacy',
        startsIn: 'starts in',
        endsIn: 'ends in',
      }
    };
    return T[this._lang] || T.en;
  }

  setConfig(config) {
    this._config = config;
    this._loadSchedules();
    this._loadHistory();
    this._loadNotifySettings();
    this._loadPrivacyState();
    this._updateUI();
  }

  set hass(hass) {
    if (hass?.language) this._lang = hass.language.startsWith('pl') ? 'pl' : 'en';
    this._hass = hass;
    if (!hass) return;
    const now = Date.now();
    if (!this._firstHassRender) {
      this._firstHassRender = true;
      this._detectCameras();
      this._updateFrigateStatus();
      // Check HA timer entity — authoritative server-side state
      const timerState = hass.states['timer.frigate_privacy'];
      if (timerState) {
        if (timerState.state === 'active' && !this._privacyActive) {
          // Timer running on server but card doesn't know — sync state
          const finishes = new Date(timerState.attributes.finishes_at).getTime();
          if (finishes > Date.now()) {
            this._privacyActive = true;
            this._privacyEndTime = finishes;
            this._startCountdown();
          }
        } else if (timerState.state === 'idle' && this._privacyActive) {
          // Timer finished server-side — clean up card state
          this._privacyActive = false;
          this._privacyEndTime = null;
          this._savePrivacyState();
          if (this._privacyTimerInterval) { clearInterval(this._privacyTimerInterval); this._privacyTimerInterval = null; }
        }
      }
      // Check if privacy timer expired while page was away
      if (this._pendingAddonRestart) {
        this._pendingAddonRestart = false;
        const addonId = this._config.frigate_addon_id || 'ccab4aaf_frigate';
        hass.callService('hassio', 'addon_start', { addon: addonId }).then(() => {
          const t = this._t;
          this._sendNotification('\u25B6\uFE0F ' + t.frigateResumed + ' (auto)', t.forCameras + ': ' + (this._privacyCameras || 'all'));
          this._showToast(t.frigateResumed + ' (auto - timer expired)', 'success');
        }).catch(e => console.warn('[Frigate Privacy] Error auto-starting addon:', e));
      }
      // Also check persisted state in case _loadPrivacyState found active+expired
      if (this._privacyActive && this._privacyEndTime && Date.now() >= this._privacyEndTime) {
        this._privacyActive = false;
        this._privacyEndTime = null;
        this._savePrivacyState();
        const addonId = this._config.frigate_addon_id || 'ccab4aaf_frigate';
        hass.callService('hassio', 'addon_start', { addon: addonId }).then(() => {
          const t = this._t;
          this._sendNotification('\u25B6\uFE0F ' + t.frigateResumed + ' (auto)', t.forCameras + ': ' + (this._privacyCameras || 'all'));
        }).catch(e => console.warn('[Frigate Privacy] Error auto-starting addon:', e));
      }
      this._updateUI();
      this._lastRenderTime = now;
      return;
    }
    if (now - (this._lastRenderTime || 0) < 5000) {
      if (!this._renderScheduled) {
        this._renderScheduled = true;
        setTimeout(() => {
          this._renderScheduled = false;
          this._updateFrigateStatus();
          // Check if privacy timer expired (handles case where user navigated away and back)
          if (this._privacyActive && this._privacyEndTime && Date.now() >= this._privacyEndTime && !this._privacyTimerInterval) {
            this._privacyActive = false;
            this._privacyEndTime = null;
            this._savePrivacyState();
            const addonId = this._config?.frigate_addon_id || 'ccab4aaf_frigate';
            this._hass?.callService('hassio', 'addon_start', { addon: addonId }).then(() => {
              const t = this._t;
              this._sendNotification('\u25B6\uFE0F ' + t.frigateResumed + ' (auto)', t.forCameras + ': ' + (this._privacyCameras || 'all'));
            }).catch(e => console.warn('[Frigate Privacy] Error auto-starting addon:', e));
          }
          this._updateUI();
          this._lastRenderTime = Date.now();
        }, 5000 - (now - (this._lastRenderTime || 0)));
      }
      return;
    }
    this._lastRenderTime = now;
    this._updateFrigateStatus();
    this._updateUI();
  }

  disconnectedCallback() {
    if (this._privacyTimerInterval) {
      clearInterval(this._privacyTimerInterval);
      this._privacyTimerInterval = null;
    }
  }

  _updateFrigateStatus() {
    if (!this._hass) return;
    // 1. Check configured entity first
    const entity = this._config.frigate_running_entity || 'binary_sensor.frigate_running';
    const state = this._hass.states[entity];
    if (state) {
      this._frigateRunning = state.state === 'on';
      return;
    }
    // 2. Fallback: check common Frigate entity patterns
    const fallbacks = [
      'binary_sensor.frigate_running',
      'binary_sensor.frigate',
      'sensor.frigate_status'
    ];
    for (const fb of fallbacks) {
      const fbState = this._hass.states[fb];
      if (fbState) {
        this._frigateRunning = fbState.state === 'on' || fbState.state === 'running';
        return;
      }
    }
    // 3. Fallback: check if any Frigate cameras exist (by name, client_id attribute, or entity_picture)
    const hasFrigateCameras = Object.keys(this._hass.states).some(id => {
      if (!id.startsWith('camera.')) return false;
      const camState = this._hass.states[id];
      const attrs = camState.attributes || {};
      return (
        id.includes('frigate') ||
        (attrs.client_id || '').toLowerCase() === 'frigate' ||
        (attrs.entity_picture || '').includes('frigate')
      );
    });
    if (hasFrigateCameras) {
      this._frigateRunning = true;
      return;
    }
    // 4. Fallback: check addon state via supervisor API
    this._frigateRunning = null;
    this._checkAddonState();
  }

  async _checkAddonState() {
    try {
      const resp = await this._hass.callApi('GET', 'hassio/addons');
      if (resp && resp.data && resp.data.addons) {
        const frigateAddon = resp.data.addons.find(a =>
          (a.name || '').toLowerCase().includes('frigate') ||
          (a.slug || '').toLowerCase().includes('frigate')
        );
        if (frigateAddon) {
          this._frigateRunning = frigateAddon.state === 'started';
          this._updateUI();
          return;
        }
      }
    } catch (e) {
      // Supervisor API not available (e.g. non-supervised install)
    }
    this._frigateRunning = null;
    this._updateUI();
  }

  _detectCameras() {
    if (!this._hass) return;
    // Use config cameras if provided
    if (this._config.cameras && this._config.cameras.length > 0) {
      this._cameras = this._config.cameras.map(c => {
        const entity = this._hass.states[c];
        return {
          entity_id: c,
          name: entity ? (entity.attributes.friendly_name || c) : c
        };
      });
      return;
    }
    // Auto-detect Frigate cameras
    this._cameras = Object.keys(this._hass.states)
      .filter(id => id.startsWith('camera.') && (
        id.includes('frigate') ||
        (this._hass.states[id].attributes.entity_picture || '').includes('frigate')
      ))
      .map(id => ({
        entity_id: id,
        name: this._hass.states[id].attributes.friendly_name || id
      }));
    // Fallback: known cameras from config
    if (this._cameras.length === 0) {
      this._cameras = [
        { entity_id: 'camera.cam_pt2_mainstream', name: 'Cam PT2 Mainstream' },
        { entity_id: 'camera.cam_pt2_mainstream_2', name: 'Cam PT2 Mainstream 2' }
      ];
    }
  }

  // --- Persistence via localStorage ---
  _storageKey(suffix) {
    return 'ha-frigate-privacy-' + suffix;
  }

  _loadSchedules() {
    try {
      const raw = localStorage.getItem(this._storageKey('schedules'));
      this._schedules = raw ? JSON.parse(raw) : [];
    } catch(e) { this._schedules = []; }
  }

  _saveSchedules() {
    try { localStorage.setItem(this._storageKey('schedules'), JSON.stringify(this._schedules)); } catch(e) {}
    if (window._haToolsPersistence && this._hass) {
      window._haToolsPersistence.setHass(this._hass);
      window._haToolsPersistence.save('frigate-privacy-schedules', this._schedules).catch(() => {});
    }
  }

  _loadHistory() {
    try {
      const raw = localStorage.getItem(this._storageKey('history'));
      this._history = raw ? JSON.parse(raw) : [];
    } catch(e) { this._history = []; }
  }

  _saveHistory() {
    // Keep max 50 entries
    if (this._history.length > 50) this._history = this._history.slice(-50);
    try { localStorage.setItem(this._storageKey('history'), JSON.stringify(this._history)); } catch(e) {}
    if (window._haToolsPersistence && this._hass) {
      window._haToolsPersistence.setHass(this._hass);
      window._haToolsPersistence.save('frigate-privacy-history', this._history).catch(() => {});
    }
  }

  _loadNotifySettings() {
    try {
      const raw = localStorage.getItem(this._storageKey('notify'));
      if (raw) {
        const s = JSON.parse(raw);
        this._notifyEnabled = s.enabled !== false;
        this._notifyService = s.service || 'persistent_notification';
        this._notifyBeforeEndMin = s.beforeEndMin || 5;
      }
    } catch(e) { /* defaults */ }
  }

  _saveNotifySettings() {
    const data = { enabled: this._notifyEnabled, service: this._notifyService, beforeEndMin: this._notifyBeforeEndMin };
    try { localStorage.setItem(this._storageKey('notify'), JSON.stringify(data)); } catch(e) {}
    if (window._haToolsPersistence && this._hass) {
      window._haToolsPersistence.setHass(this._hass);
      window._haToolsPersistence.save('frigate-privacy-notify', data).catch(() => {});
    }
  }

  _savePrivacyState() {
    const data = (this._privacyActive && this._privacyEndTime) ? {
      active: true,
      endTime: this._privacyEndTime,
      cameras: this._privacyCameras || 'all',
      startedMin: this._privacyStartedMin || 0,
      addonId: this._config?.frigate_addon_id || 'ccab4aaf_frigate'
    } : null;
    // Save to both localStorage (fast) and HA server (cross-device)
    try { localStorage.setItem(this._storageKey('active'), data ? JSON.stringify(data) : ''); } catch(e) {}
    if (window._haToolsPersistence && this._hass) {
      window._haToolsPersistence.setHass(this._hass);
      window._haToolsPersistence.save('frigate-privacy-active', data).catch(() => {});
    }
  }

  _loadPrivacyState() {
    // 1. Quick check from localStorage cache
    let s = null;
    try {
      const raw = localStorage.getItem(this._storageKey('active'));
      if (raw) s = JSON.parse(raw);
    } catch(e) {}

    // 2. Also try server-side data (async, will update later)
    if (window._haToolsPersistence && this._hass) {
      window._haToolsPersistence.setHass(this._hass);
      window._haToolsPersistence.load('frigate-privacy-active').then(serverData => {
        if (serverData && serverData.active && serverData.endTime) {
          // Server data is newer/authoritative — use it
          this._applyPrivacyState(serverData);
        }
      }).catch(() => {});
    }

    // 3. Apply localStorage data immediately (sync)
    if (s && s.active && s.endTime) {
      this._applyPrivacyState(s);
    }
  }

  _applyPrivacyState(s) {
    if (!s || !s.active || !s.endTime) return;

    if (Date.now() >= s.endTime) {
      // Timer already expired while we were away
      console.info('[Frigate Privacy] Timer expired while away, will restart addon...');
      this._privacyActive = false;
      this._privacyEndTime = null;
      this._privacyCameras = s.cameras || 'all';
      this._savePrivacyState(); // Clear persisted state
      // Defer addon restart until hass is available
      this._pendingAddonRestart = true;
      this._addHistoryEntry('auto-resumed', 0, s.cameras);
    } else if (!this._privacyActive) {
      // Timer still active — resume countdown
      console.info('[Frigate Privacy] Resuming privacy timer, ' +
        Math.ceil((s.endTime - Date.now()) / 60000) + ' min remaining');
      this._privacyActive = true;
      this._privacyEndTime = s.endTime;
      this._privacyCameras = s.cameras || 'all';
      this._privacyStartedMin = s.startedMin || 0;
      this._warningSent = false;
      this._startCountdown();
    }
  }



  async _sendNotification(title, message) {
    if (!this._notifyEnabled || !this._hass) return;
    try {
      if (this._notifyService === 'persistent_notification') {
        await this._hass.callService('persistent_notification', 'create', {
          title: title,
          message: message
        });
      } else {
        // Mobile app notify service (e.g. notify.mobile_app_iphone)
        const [domain, service] = this._notifyService.includes('.') ?
          this._notifyService.split('.', 2) : ['notify', this._notifyService];
        await this._hass.callService(domain, service, {
          title: title,
          message: message
        });
      }
    } catch(e) {
      console.warn('[Frigate Privacy] Notification error:', e);
    }
  }

  _getCameraLabel() {
    if (!this._privacyCameras || this._privacyCameras === 'all') {
      return this._t.allCamerasLabel;
    }
    return this._privacyCameras;
  }

  async _extendPrivacy(extraMinutes) {
    const t = this._t;
    if (!this._hass || !this._privacyActive) return;
    // Extend the end time
    this._privacyEndTime += extraMinutes * 60 * 1000;
    this._privacyStartedMin += extraMinutes;
    this._warningSent = false; // Reset so we get another warning
    this._savePrivacyState();
    this._addHistoryEntry('extended', extraMinutes, this._privacyCameras);
    this._showToast(t.privacyExtended + ' ' + extraMinutes + ' ' + t.min, 'success');
    // JS timer handles extension - addon is already stopped
    const remaining = Math.ceil((this._privacyEndTime - Date.now()) / 60000);
    this._sendNotification(
      '\uD83D\uDD12 ' + t.privacyExtended + ' ' + extraMinutes + t.min,
      t.forCameras + ': ' + this._getCameraLabel() + '. ' + t.remainingTime + ': ' + remaining + ' ' + t.min
    );
    this._updateUI();
  }

  _addHistoryEntry(type, minutes, cameras) {
    this._history.push({
      ts: Date.now(),
      type: type, // 'manual' | 'scheduled' | 'cancelled' | 'resumed'
      minutes: minutes,
      cameras: cameras || 'all'
    });
    this._saveHistory();
  }

  // --- Actions ---
  async _pauseFrigate(minutes) {
    const t = this._t;
    if (!this._hass) return;
    const addonId = this._config.frigate_addon_id || 'ccab4aaf_frigate';
    try {
      // Stop Frigate addon directly
      await this._hass.callService('hassio', 'addon_stop', { addon: addonId });
      this._privacyActive = true;
      this._privacyEndTime = Date.now() + (parseInt(minutes) * 60 * 1000);
      this._privacyCameras = this._selectedCameras.size > 0 ? [...this._selectedCameras].map(id => {
        const cam = this._cameras.find(c => c.entity_id === id);
        return cam ? cam.name : id;
      }).join(', ') : 'all';
      this._privacyStartedMin = parseInt(minutes);
      this._warningSent = false;
      this._addHistoryEntry('manual', minutes, this._privacyCameras);
      this._savePrivacyState();
      // Start HA server-side timer (survives page close, works across devices)
      try {
        const hrs = Math.floor(parseInt(minutes) / 60);
        const mins = parseInt(minutes) % 60;
        const dur = String(hrs).padStart(2,'0') + ':' + String(mins).padStart(2,'0') + ':00';
        await this._hass.callService('timer', 'start', { entity_id: 'timer.frigate_privacy', duration: dur });
      } catch(e) { console.warn('[Frigate Privacy] Could not start HA timer:', e); }
      this._startCountdown();
      this._showToast(t.privacyModeStarted + ' ' + minutes + ' ' + t.min, 'success');
      this._sendNotification(
        '\uD83D\uDD12 ' + t.privacyModeStarted + ' ' + minutes + ' ' + t.min,
        t.forCameras + ': ' + this._getCameraLabel()
      );
      this._updateUI();
    } catch(e) {
      console.warn('[Frigate Privacy]', e);
      this._showToast(t.errorStopAddon, 'error');
    }
  }

  async _resumeFrigate() {
    const t = this._t;
    if (!this._hass) return;
    const addonId = this._config.frigate_addon_id || 'ccab4aaf_frigate';
    try {
      // Start Frigate addon directly
      await this._hass.callService('hassio', 'addon_start', { addon: addonId });
      this._privacyActive = false;
      this._privacyEndTime = null;
      if (this._privacyTimerInterval) {
        clearInterval(this._privacyTimerInterval);
        this._privacyTimerInterval = null;
      }
      this._savePrivacyState();
      // Cancel HA server-side timer
      try {
        await this._hass.callService('timer', 'cancel', { entity_id: 'timer.frigate_privacy' });
      } catch(e) { console.warn('[Frigate Privacy] Could not cancel HA timer:', e); }
      this._addHistoryEntry('cancelled', 0);
      this._warningSent = false;
      this._showToast(t.frigateResumed, 'success');
      this._sendNotification('\u25B6\uFE0F ' + t.frigateResumed, t.forCameras + ': ' + this._getCameraLabel());
      this._updateUI();
    } catch(e) {
      console.warn('[Frigate Privacy]', e);
      this._showToast(t.errorStartAddon, 'error');
    }
  }

  _startCountdown() {
    if (this._privacyTimerInterval) clearInterval(this._privacyTimerInterval);
    this._privacyTimerInterval = setInterval(() => {
      if (!this._privacyEndTime || Date.now() >= this._privacyEndTime) {
        // Timer expired - auto-restart Frigate addon
        this._privacyActive = false;
        this._privacyEndTime = null;
        this._savePrivacyState(); // Clear persisted state
        clearInterval(this._privacyTimerInterval);
        this._privacyTimerInterval = null;
        this._warningSent = false;
        // Auto-start addon when timer expires
        if (this._hass) {
          const addonId = this._config.frigate_addon_id || 'ccab4aaf_frigate';
          this._hass.callService('hassio', 'addon_start', { addon: addonId }).catch(e => {
            console.warn('[Frigate Privacy] Error auto-starting addon on timer expiry:', e);
          });
          const t = this._t;
          this._sendNotification('\u25B6\uFE0F ' + t.frigateResumed, t.forCameras + ': ' + this._getCameraLabel());
        }
      } else {
        // Send warning notification before end
        const remainMs = this._privacyEndTime - Date.now();
        const warnMs = this._notifyBeforeEndMin * 60 * 1000;
        if (!this._warningSent && remainMs <= warnMs && remainMs > 0) {
          this._warningSent = true;
          const t = this._t;
          const mins = Math.ceil(remainMs / 60000);
          this._sendNotification(
            '\u23F3 ' + t.privacyEndingSoon + ' ' + mins + ' ' + t.min,
            t.forCameras + ': ' + this._getCameraLabel() + '. ' + t.notifExtendQuestion
          );
        }
      }
      this._updateCountdownDisplay();
    }, 1000);
  }

  _updateCountdownDisplay() {
    const el = this.shadowRoot?.querySelector('.countdown-value');
    if (!el) return;
    if (!this._privacyEndTime) {
      el.textContent = '--:--';
      return;
    }
    const remaining = Math.max(0, this._privacyEndTime - Date.now());
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    el.textContent = String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
    if (remaining <= 0) {
      this._privacyActive = false;
      this._updateUI();
    }
  }

  _showToast(msg, type) {
    const toast = this.shadowRoot?.querySelector('.toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.className = 'toast toast-' + (type || 'info') + ' toast-show';
    setTimeout(() => { toast.className = 'toast'; }, 3000);
  }

  // --- Schedule management ---
  _resetScheduleForm() {
    this._scheduleForm = { enabled: true, days: [1,2,3,4,5], startHour: 18, startMin: 0, endHour: 20, endMin: 0, repeat: true, label: '' };
    this._editingScheduleIdx = null;
  }

  _saveScheduleFromForm() {
    const f = this._scheduleForm;
    const schedule = {
      enabled: f.enabled,
      days: [...f.days],
      startHour: parseInt(f.startHour),
      startMin: parseInt(f.startMin),
      endHour: parseInt(f.endHour),
      endMin: parseInt(f.endMin),
      repeat: f.repeat,
      label: f.label || ''
    };
    if (this._editingScheduleIdx !== null) {
      this._schedules[this._editingScheduleIdx] = schedule;
    } else {
      this._schedules.push(schedule);
    }
    this._saveSchedules();
    this._resetScheduleForm();
    this._updateUI();
  }

  _deleteSchedule(idx) {
    this._schedules.splice(idx, 1);
    this._saveSchedules();
    this._updateUI();
  }

  _editSchedule(idx) {
    const s = this._schedules[idx];
    this._scheduleForm = { ...s, days: [...s.days] };
    this._editingScheduleIdx = idx;
    this._activeTab = 'schedule';
    this._updateUI();
    // Scroll to form
    setTimeout(() => {
      const form = this.shadowRoot?.querySelector('.schedule-form');
      if (form) form.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }

  _toggleScheduleEnabled(idx) {
    this._schedules[idx].enabled = !this._schedules[idx].enabled;
    this._saveSchedules();
    this._updateUI();
  }

  // --- UI ---
  _updateUI() {
    const t = this._t;
    const html = this._buildHTML();
    if (html === this._lastHtml) return;
    this._lastHtml = html;
    this.shadowRoot.innerHTML = html;
    this._attachEvents();
    if (this._privacyActive) this._updateCountdownDisplay();
  }

  _buildHTML() {
    const t = this._t;
    return `<style>${this._getCSS()}</style>
    <div class="container">
      <div class="header">
        <div class="header-left">
          <span class="header-icon">\uD83D\uDD12</span>
          <h2>${t.title}</h2>
        </div>
        <div class="status-badge ${this._frigateRunning === true ? 'status-running' : this._frigateRunning === false ? 'status-stopped' : 'status-unknown'}">
          <span class="status-dot"></span>
          ${this._frigateRunning === true ? t.running : this._frigateRunning === false ? t.stopped : t.unknown}
        </div>
      </div>

      <div class="tabs">
        <button class="tab-btn ${this._activeTab === 'control' ? 'active' : ''}" data-tab="control">${t.tabControl}</button>
        <button class="tab-btn ${this._activeTab === 'schedule' ? 'active' : ''}" data-tab="schedule">${t.tabSchedule}</button>
        <button class="tab-btn ${this._activeTab === 'history' ? 'active' : ''}" data-tab="history">${t.tabHistory}</button>
        <button class="tab-btn ${this._activeTab === 'settings' ? 'active' : ''}" data-tab="settings">${t.tabSettings}</button>
      </div>

      <div class="tab-content">
        ${this._activeTab === 'control' ? this._buildControlTab() : ''}
        ${this._activeTab === 'schedule' ? this._buildScheduleTab() : ''}
        ${this._activeTab === 'history' ? this._buildHistoryTab() : ''}
        ${this._activeTab === 'settings' ? this._buildSettingsTab() : ''}
      </div>

      <div class="toast"></div>
    </div>`;
  }

  _buildControlTab() {
    const t = this._t;

    // Privacy active banner
    let privacyBanner = '';
    if (this._privacyActive) {
      const camLabel = this._getCameraLabel();
      privacyBanner = `
        <div class="privacy-active-banner">
          <div class="privacy-icon">\uD83D\uDD12</div>
          <div class="privacy-info">
            <div class="privacy-label">${t.privacyActive}</div>
            <div class="privacy-cameras-label">${t.forCameras}: ${camLabel}</div>
            <div class="countdown">
              <span class="countdown-label">${t.remainingTime}:</span>
              <span class="countdown-value">--:--</span>
            </div>
          </div>
          <div class="privacy-banner-actions">
            <div class="extend-row">
              <span class="extend-label">${t.extendBy}:</span>
              <button class="btn btn-extend" data-extend="15">+15m</button>
              <button class="btn btn-extend" data-extend="30">+30m</button>
              <button class="btn btn-extend" data-extend="60">+1h</button>
            </div>
            <button class="btn btn-danger btn-cancel" data-action="resume">${t.cancelPrivacy}</button>
          </div>
        </div>`;
    }

    // Camera selector
    const cameraCards = this._cameras.map(cam => {
      const selected = this._selectedCameras.has(cam.entity_id);
      const state = this._hass?.states[cam.entity_id];
      const statusIcon = state?.state === 'idle' || state?.state === 'streaming' ? '\uD83D\uDFE2' : '\u26AA';
      return `<div class="camera-card ${selected ? 'selected' : ''}" data-camera="${cam.entity_id}">
        <span class="camera-status">${statusIcon}</span>
        <span class="camera-name">${this._sanitize(cam.name)}</span>
        <span class="camera-check">${selected ? '\u2713' : ''}</span>
      </div>`;
    }).join('');

    const allSelected = this._selectedCameras.size === 0;

    // Quick pause buttons
    const quickButtons = [15, 30, 60, 120].map(m => {
      const label = m >= 60 ? (m / 60) + 'h' : m + 'min';
      return `<button class="btn btn-quick" data-minutes="${m}">${label}</button>`;
    }).join('');

    return `
      ${privacyBanner}

      <div class="section">
        <h3>${t.selectCameras}</h3>
        <div class="camera-grid">
          <div class="camera-card all-cameras ${allSelected ? 'selected' : ''}" data-camera="__all__">
            <span class="camera-status">\uD83C\uDFA5</span>
            <span class="camera-name">${t.allCameras}</span>
            <span class="camera-check">${allSelected ? '\u2713' : ''}</span>
          </div>
          ${cameraCards}
        </div>
      </div>

      <div class="section">
        <h3>${t.quickPause}</h3>
        <div class="quick-buttons">
          ${quickButtons}
        </div>
      </div>

      <div class="section">
        <h3>${t.customDuration}</h3>
        <div class="custom-pause">
          <input type="number" class="input-minutes" min="1" max="1440" value="${this._customMinutes}" />
          <span class="input-suffix">${t.min}</span>
          <button class="btn btn-primary btn-pause" data-action="pause-custom" ${this._privacyActive ? 'disabled' : ''}>
            ${t.pauseFrigate}
          </button>
        </div>
      </div>

      ${!this._privacyActive && this._frigateRunning === false ? `
      <div class="section">
        <button class="btn btn-success btn-full" data-action="resume">${t.resumeFrigate}</button>
      </div>
      ` : ''}
    `;
  }

  _buildScheduleTab() {
    const t = this._t;
    const isEditing = this._editingScheduleIdx !== null;

    // Schedule list
    let scheduleList = '';
    if (this._schedules.length === 0) {
      scheduleList = `<div class="empty-state">${t.noSchedules}</div>`;
    } else {
      scheduleList = this._schedules.map((s, i) => {
        const dayLabels = s.days.sort().map(d => t.days[d - 1]).join(', ');
        const timeRange = String(s.startHour).padStart(2, '0') + ':' + String(s.startMin).padStart(2, '0')
          + ' - ' + String(s.endHour).padStart(2, '0') + ':' + String(s.endMin).padStart(2, '0');
        return `<div class="schedule-item ${s.enabled ? '' : 'disabled'}">
          <div class="schedule-main">
            <div class="schedule-label">${s.label || (s.repeat ? t.repeat : t.oneTime)}</div>
            <div class="schedule-time">${timeRange}</div>
            <div class="schedule-days">${dayLabels}</div>
          </div>
          <div class="schedule-actions">
            <button class="btn-icon" data-schedule-toggle="${i}" title="${s.enabled ? t.enabled : t.disabled}">
              ${s.enabled ? '\uD83D\uDFE2' : '\u26AA'}
            </button>
            <button class="btn-icon" data-schedule-edit="${i}" title="${t.editSchedule}">\u270F\uFE0F</button>
            <button class="btn-icon btn-icon-danger" data-schedule-delete="${i}" title="${t.deleteSchedule}">\uD83D\uDDD1\uFE0F</button>
          </div>
        </div>`;
      }).join('');
    }

    // Schedule form
    const f = this._scheduleForm;
    const dayButtons = [1,2,3,4,5,6,7].map(d => {
      const active = f.days.includes(d);
      return `<button class="day-btn ${active ? 'active' : ''}" data-day="${d}">${t.days[d-1]}</button>`;
    }).join('');

    return `
      <div class="section">
        <h3>${t.scheduleTitle}</h3>
        ${scheduleList}
      </div>

      <div class="section schedule-form">
        <h3>${isEditing ? t.editSchedule : t.addSchedule}</h3>

        <div class="form-row">
          <label>${t.label}</label>
          <input type="text" class="input-label" value="${f.label}" placeholder="${this._lang === 'pl' ? 'np. Wieczorna prywatnosc' : 'e.g. Evening privacy'}" />
        </div>

        <div class="form-row">
          <label>${t.days[0]} - ${t.days[6]}</label>
          <div class="day-selector">${dayButtons}</div>
        </div>

        <div class="form-row time-row">
          <div class="time-group">
            <label>${t.from}</label>
            <input type="number" class="input-time input-start-hour" min="0" max="23" value="${f.startHour}" />
            <span>:</span>
            <input type="number" class="input-time input-start-min" min="0" max="59" step="5" value="${String(f.startMin).padStart(2, '0')}" />
          </div>
          <div class="time-group">
            <label>${t.to}</label>
            <input type="number" class="input-time input-end-hour" min="0" max="23" value="${f.endHour}" />
            <span>:</span>
            <input type="number" class="input-time input-end-min" min="0" max="59" step="5" value="${String(f.endMin).padStart(2, '0')}" />
          </div>
        </div>

        <div class="form-row">
          <label class="toggle-row">
            <input type="checkbox" class="input-repeat" ${f.repeat ? 'checked' : ''} />
            <span>${t.repeat}</span>
          </label>
        </div>

        <div class="form-buttons">
          <button class="btn btn-primary" data-action="save-schedule">${t.saveSchedule}</button>
          ${isEditing ? `<button class="btn btn-secondary" data-action="cancel-edit">${t.cancelEdit}</button>` : ''}
        </div>
      </div>
    `;
  }

  _buildHistoryTab() {
    const t = this._t;
    if (this._history.length === 0) {
      return `<div class="empty-state">${t.noHistory}</div>`;
    }

    const rows = [...this._history].reverse().slice(0, 30).map(h => {
      const date = new Date(h.ts);
      const dateStr = date.toLocaleDateString(this._lang === 'pl' ? 'pl-PL' : 'en-US', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
      });
      let typeLabel = '';
      let typeClass = '';
      switch (h.type) {
        case 'manual': typeLabel = t.manualPause; typeClass = 'type-manual'; break;
        case 'scheduled': typeLabel = t.scheduled; typeClass = 'type-scheduled'; break;
        case 'cancelled': typeLabel = t.cancelled; typeClass = 'type-cancelled'; break;
        default: typeLabel = t.completed; typeClass = 'type-completed';
      }
      return `<div class="history-row">
        <div class="history-date">${dateStr}</div>
        <div class="history-type ${typeClass}">${typeLabel}</div>
        <div class="history-duration">${h.minutes ? h.minutes + ' ' + t.min : '-'}</div>
        <div class="history-cameras">${h.cameras || 'all'}</div>
      </div>`;
    }).join('');

    return `
      <div class="section">
        <h3>${t.historyTitle}</h3>
        <div class="history-table">
          ${rows}
        </div>
      </div>
    `;
  }

  _buildSettingsTab() {
    const t = this._t;
    // Detect available notify services
    const notifyServices = this._hass ? Object.keys(this._hass.services.notify || {}).map(s => 'notify.' + s) : [];

    const serviceOptions = [
      `<option value="persistent_notification" ${this._notifyService === 'persistent_notification' ? 'selected' : ''}>${t.notifyPersistent}</option>`
    ];
    for (const svc of notifyServices) {
      const label = svc.replace('notify.', '').replace(/_/g, ' ');
      serviceOptions.push(`<option value="${svc}" ${this._notifyService === svc ? 'selected' : ''}>${label}</option>`);
    }

    return `
      <div class="section">
        <h3>\uD83D\uDD14 ${t.notifications}</h3>

        <div class="form-row">
          <label class="toggle-row">
            <input type="checkbox" class="input-notify-enabled" ${this._notifyEnabled ? 'checked' : ''} />
            <span>${t.notifyEnabled}</span>
          </label>
        </div>

        <div class="form-row">
          <label>${t.notifyService}</label>
          <select class="input-notify-service setting-select">
            ${serviceOptions.join('')}
          </select>
        </div>

        <div class="form-row">
          <label>${t.notifyBeforeEnd}</label>
          <div class="inline-input">
            <input type="number" class="input-time input-notify-before" min="1" max="30" value="${this._notifyBeforeEndMin}" />
            <span>${t.min}</span>
          </div>
        </div>

        <div class="notify-info">
          <p>\uD83D\uDD14 ${this._lang === 'pl'
            ? 'Powiadomienia beda wysylane: przy starcie prywatnosci, ' + this._notifyBeforeEndMin + ' min przed koncem (z informacja o kamerach), przy anulowaniu i przy wydluzeniu czasu.'
            : 'Notifications will be sent: on privacy start, ' + this._notifyBeforeEndMin + ' min before end (with camera info), on cancel, and on time extension.'
          }</p>
        </div>
      </div>

      <div class="section">
        <h3>\uD83D\uDCCB ${this._lang === 'pl' ? 'Integracja z Dashboard' : 'Dashboard Integration'}</h3>
        <p style="margin-bottom:12px;color:var(--bento-text-secondary);font-size:0.92em;">
          ${this._lang === 'pl'
            ? 'Mozesz dodac Frigate Privacy jako karte w swoim dashboard lub jako przycisk w Bubble Card.'
            : 'You can add Frigate Privacy as a card in your dashboard or as a Bubble Card button.'}
        </p>

        <div class="code-block">
          <div class="code-label">${this._lang === 'pl' ? 'Karta Lovelace (manual YAML)' : 'Lovelace Card (manual YAML)'}</div>
          <pre style="background:var(--bento-card);padding:10px;border-radius:6px;font-size:0.85em;overflow-x:auto;color:var(--bento-text);">type: custom:ha-frigate-privacy
# ${this._lang === 'pl' ? 'Opcjonalna konfiguracja:' : 'Optional config:'}
frigate_running_entity: binary_sensor.frigate_running
cameras:
  - camera.frigate_salon
  - camera.frigate_front
default_duration: 30</pre>
        </div>

        <div class="code-block" style="margin-top:12px;">
          <div class="code-label">Bubble Card - ${this._lang === 'pl' ? 'Przycisk nawigacji' : 'Navigation button'}</div>
          <pre style="background:var(--bento-card);padding:10px;border-radius:6px;font-size:0.85em;overflow-x:auto;color:var(--bento-text);">type: custom:bubble-card
card_type: button
name: Frigate Privacy
icon: mdi:camera-off
tap_action:
  action: navigate
  navigation_path: /ha-tools-panel
# ${this._lang === 'pl' ? 'Lub uzyj input_boolean do sterowania:' : 'Or use input_boolean for control:'}
# entity: input_boolean.frigate_privacy_mode</pre>
        </div>

        <div class="code-block" style="margin-top:12px;">
          <div class="code-label">${this._lang === 'pl' ? 'Automatyzacja z input_boolean' : 'Automation with input_boolean'}</div>
          <pre style="background:var(--bento-card);padding:10px;border-radius:6px;font-size:0.85em;overflow-x:auto;color:var(--bento-text);">automation:
  - alias: "Frigate Privacy Toggle"
    trigger:
      - platform: state
        entity_id: input_boolean.frigate_privacy_mode
        to: "on"
    action:
      - service: mqtt.publish
        data:
          topic: frigate/clips/set
          payload: "OFF"
      - service: mqtt.publish
        data:
          topic: frigate/detect/set
          payload: "OFF"
      - delay: "01:00:00"
      - service: input_boolean.turn_off
        target:
          entity_id: input_boolean.frigate_privacy_mode</pre>
        </div>
      </div>
    `;
  }

  _attachEvents() {
    const sr = this.shadowRoot;
    if (!sr) return;

    // Tabs
    sr.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._activeTab = btn.dataset.tab;
        this._updateUI();
      });
    });

    // Camera selection
    sr.querySelectorAll('.camera-card').forEach(card => {
      card.addEventListener('click', () => {
        const camId = card.dataset.camera;
        if (camId === '__all__') {
          this._selectedCameras.clear();
        } else {
          if (this._selectedCameras.has(camId)) {
            this._selectedCameras.delete(camId);
          } else {
            this._selectedCameras.add(camId);
          }
        }
        this._updateUI();
      });
    });

    // Quick pause buttons
    sr.querySelectorAll('.btn-quick').forEach(btn => {
      btn.addEventListener('click', () => {
        this._pauseFrigate(parseInt(btn.dataset.minutes));
      });
    });

    // Custom pause
    const pauseCustom = sr.querySelector('[data-action="pause-custom"]');
    if (pauseCustom) {
      pauseCustom.addEventListener('click', () => {
        const input = sr.querySelector('.input-minutes');
        const mins = parseInt(input?.value) || 30;
        this._customMinutes = mins;
        this._pauseFrigate(mins);
      });
    }

    // Resume / Cancel
    sr.querySelectorAll('[data-action="resume"]').forEach(btn => {
      btn.addEventListener('click', () => this._resumeFrigate());
    });

    // Extend buttons
    sr.querySelectorAll('[data-extend]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._extendPrivacy(parseInt(btn.dataset.extend));
      });
    });

    // Minutes input update
    const minutesInput = sr.querySelector('.input-minutes');
    if (minutesInput) {
      minutesInput.addEventListener('change', (e) => {
        this._customMinutes = parseInt(e.target.value) || 30;
      });
    }

    // Schedule form inputs
    const labelInput = sr.querySelector('.input-label');
    if (labelInput) {
      labelInput.addEventListener('input', (e) => { this._scheduleForm.label = e.target.value; });
    }

    sr.querySelectorAll('.day-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const day = parseInt(btn.dataset.day);
        const idx = this._scheduleForm.days.indexOf(day);
        if (idx >= 0) {
          this._scheduleForm.days.splice(idx, 1);
        } else {
          this._scheduleForm.days.push(day);
        }
        this._updateUI();
      });
    });

    const startHour = sr.querySelector('.input-start-hour');
    const startMin = sr.querySelector('.input-start-min');
    const endHour = sr.querySelector('.input-end-hour');
    const endMin = sr.querySelector('.input-end-min');
    if (startHour) startHour.addEventListener('change', (e) => { this._scheduleForm.startHour = parseInt(e.target.value); });
    if (startMin) startMin.addEventListener('change', (e) => { this._scheduleForm.startMin = parseInt(e.target.value); });
    if (endHour) endHour.addEventListener('change', (e) => { this._scheduleForm.endHour = parseInt(e.target.value); });
    if (endMin) endMin.addEventListener('change', (e) => { this._scheduleForm.endMin = parseInt(e.target.value); });

    const repeatInput = sr.querySelector('.input-repeat');
    if (repeatInput) {
      repeatInput.addEventListener('change', (e) => { this._scheduleForm.repeat = e.target.checked; });
    }

    // Save schedule
    const saveBtn = sr.querySelector('[data-action="save-schedule"]');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this._saveScheduleFromForm());
    }

    const cancelBtn = sr.querySelector('[data-action="cancel-edit"]');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        this._resetScheduleForm();
        this._updateUI();
      });
    }

    // Schedule item actions
    sr.querySelectorAll('[data-schedule-toggle]').forEach(btn => {
      btn.addEventListener('click', () => this._toggleScheduleEnabled(parseInt(btn.dataset.scheduleToggle)));
    });
    sr.querySelectorAll('[data-schedule-edit]').forEach(btn => {
      btn.addEventListener('click', () => this._editSchedule(parseInt(btn.dataset.scheduleEdit)));
    });
    sr.querySelectorAll('[data-schedule-delete]').forEach(btn => {
      btn.addEventListener('click', () => this._deleteSchedule(parseInt(btn.dataset.scheduleDelete)));
    });

    // Settings: notification toggle
    const notifyEnabledCb = sr.querySelector('.input-notify-enabled');
    if (notifyEnabledCb) {
      notifyEnabledCb.addEventListener('change', (e) => {
        this._notifyEnabled = e.target.checked;
        this._saveNotifySettings();
      });
    }

    // Settings: notify service
    const notifyServiceSel = sr.querySelector('.input-notify-service');
    if (notifyServiceSel) {
      notifyServiceSel.addEventListener('change', (e) => {
        this._notifyService = e.target.value;
        this._saveNotifySettings();
      });
    }

    // Settings: notify before end
    const notifyBeforeInput = sr.querySelector('.input-notify-before');
    if (notifyBeforeInput) {
      notifyBeforeInput.addEventListener('change', (e) => {
        this._notifyBeforeEndMin = parseInt(e.target.value) || 5;
        this._saveNotifySettings();
      });
    }
  }

  _getCSS() {
    return `
:host {
  --bento-bg: var(--primary-background-color, #F8FAFC);
  --bento-card: var(--card-background-color, #FFFFFF);
  --bento-primary: #3B82F6;
  --bento-primary-hover: #2563EB;
  --bento-text: var(--primary-text-color, #1E293B);
  --bento-text-secondary: var(--secondary-text-color, #64748B);
  --bento-border: var(--divider-color, #E2E8F0);
  --bento-success: #10B981;
  --bento-warning: #F59E0B;
  --bento-error: #EF4444;
  --bento-radius-sm: 16px;
  --bento-radius-sm: 10px;
  --bento-radius-xs: 6px;
  --bento-shadow-sm: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02);
  --bento-shadow-md: 0 4px 12px rgba(0,0,0,0.06);
  --bento-transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: block;
  color-scheme: light dark;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

@media (prefers-color-scheme: dark) {
  :host {
    --bento-bg: var(--primary-background-color, #1a1a2e);
    --bento-card: var(--card-background-color, #16213e);
    --bento-text: var(--primary-text-color, #e2e8f0);
    --bento-text-secondary: var(--secondary-text-color, #94a3b8);
    --bento-border: var(--divider-color, #334155);
    --bento-shadow-sm: 0 1px 3px rgba(0,0,0,0.3);
    --bento-shadow-md: 0 4px 12px rgba(0,0,0,0.4);
  }
}

* { box-sizing: border-box; margin: 0; padding: 0; }

.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  color: var(--bento-text);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  padding: 16px 20px;
  background: var(--bento-card);
  border-radius: var(--bento-radius-sm);
  box-shadow: var(--bento-shadow-sm);
  border: 1px solid var(--bento-border);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-icon { font-size: 24px; }

.header h2 {
  font-size: 18px;
  font-weight: 600;
  color: var(--bento-text);
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.status-running { background: rgba(16,185,129,0.12); color: #10B981; }
.status-running .status-dot { background: #10B981; }
.status-stopped { background: rgba(239,68,68,0.12); color: #EF4444; }
.status-stopped .status-dot { background: #EF4444; }
.status-unknown { background: rgba(148,163,184,0.12); color: #94a3b8; }
.status-unknown .status-dot { background: #94a3b8; }

/* Tabs */
.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  background: var(--bento-card);
  padding: 4px;
  border-radius: var(--bento-radius-sm);
  border: 1px solid var(--bento-border);
}

.tab-btn {
  flex: 1;
  padding: 10px 16px;
  border: none;
  background: transparent;
  color: var(--bento-text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border-radius: var(--bento-radius-xs);
  transition: var(--bento-transition);
}

.tab-btn:hover { background: rgba(59,130,246,0.06); color: var(--bento-text); }
.tab-btn.active { background: var(--bento-primary); color: #fff; }

/* Sections */
.section {
  background: var(--bento-card);
  border-radius: var(--bento-radius-sm);
  padding: 16px 20px;
  margin-bottom: 12px;
  box-shadow: var(--bento-shadow-sm);
  border: 1px solid var(--bento-border);
}

.section h3 {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--bento-text);
}

/* Privacy active banner */
.privacy-active-banner {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  background: linear-gradient(135deg, rgba(239,68,68,0.08), rgba(239,68,68,0.15));
  border: 1px solid rgba(239,68,68,0.25);
  border-radius: var(--bento-radius-sm);
  margin-bottom: 12px;
}

.privacy-icon { font-size: 32px; }

.privacy-info { flex: 1; }

.privacy-label {
  font-size: 15px;
  font-weight: 600;
  color: var(--bento-error);
  margin-bottom: 2px;
}

.privacy-cameras-label {
  font-size: 12px;
  color: var(--bento-text-secondary);
  margin-bottom: 4px;
}

.privacy-banner-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-end;
}

.extend-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.extend-label {
  font-size: 11px;
  color: var(--bento-text-secondary);
  margin-right: 4px;
}

.btn-extend {
  padding: 5px 10px;
  border: 1px solid rgba(59,130,246,0.3);
  border-radius: var(--bento-radius-xs);
  background: rgba(59,130,246,0.08);
  color: var(--bento-primary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: var(--bento-transition);
}

.btn-extend:hover {
  background: rgba(59,130,246,0.15);
  border-color: var(--bento-primary);
}

.countdown { display: flex; align-items: center; gap: 8px; }
.countdown-label { font-size: 12px; color: var(--bento-text-secondary); }
.countdown-value {
  font-size: 24px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--bento-error);
  letter-spacing: 1px;
}

/* Camera grid */
.camera-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 8px;
}

.camera-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: var(--bento-radius-sm);
  border: 2px solid var(--bento-border);
  cursor: pointer;
  transition: var(--bento-transition);
  background: var(--bento-bg);
}

.camera-card:hover {
  border-color: var(--bento-primary);
  background: rgba(59,130,246,0.04);
}

.camera-card.selected {
  border-color: var(--bento-primary);
  background: rgba(59,130,246,0.08);
}

.camera-status { font-size: 14px; }
.camera-name { font-size: 13px; flex: 1; font-weight: 500; }
.camera-check { font-size: 14px; color: var(--bento-primary); font-weight: 700; }

/* Quick buttons */
.quick-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: var(--bento-radius-sm);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: var(--bento-transition);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-quick {
  padding: 10px 20px;
  border: 2px solid var(--bento-border);
  border-radius: var(--bento-radius-sm);
  background: var(--bento-bg);
  color: var(--bento-text);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: var(--bento-transition);
  min-width: 70px;
}

.btn-quick:hover {
  border-color: var(--bento-primary);
  background: rgba(59,130,246,0.06);
  color: var(--bento-primary);
}

.btn-primary { background: var(--bento-primary); color: #fff; }
.btn-primary:hover { background: var(--bento-primary-hover); }
.btn-success { background: var(--bento-success); color: #fff; }
.btn-success:hover { background: #059669; }
.btn-danger { background: var(--bento-error); color: #fff; }
.btn-danger:hover { background: #dc2626; }
.btn-secondary { background: var(--bento-bg); color: var(--bento-text); border: 1px solid var(--bento-border); }
.btn-secondary:hover { background: var(--bento-border); }
.btn-full { width: 100%; }

/* Custom pause */
.custom-pause {
  display: flex;
  align-items: center;
  gap: 8px;
}

.input-minutes {
  width: 80px;
  padding: 10px 12px;
  border: 1px solid var(--bento-border);
  border-radius: var(--bento-radius-xs);
  font-size: 14px;
  font-weight: 600;
  color: var(--bento-text);
  background: var(--bento-bg);
  text-align: center;
}

.input-suffix {
  font-size: 13px;
  color: var(--bento-text-secondary);
  margin-right: 8px;
}

/* Schedule items */
.schedule-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid var(--bento-border);
}

.schedule-item:last-child { border-bottom: none; }

.schedule-item.disabled { opacity: 0.5; }

.schedule-main { flex: 1; }

.schedule-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--bento-text);
  margin-bottom: 2px;
}

.schedule-time {
  font-size: 13px;
  color: var(--bento-primary);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.schedule-days {
  font-size: 12px;
  color: var(--bento-text-secondary);
  margin-top: 2px;
}

.schedule-actions {
  display: flex;
  gap: 4px;
}

.btn-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: var(--bento-radius-xs);
  font-size: 16px;
  transition: var(--bento-transition);
}

.btn-icon:hover { background: rgba(59,130,246,0.08); }
.btn-icon-danger:hover { background: rgba(239,68,68,0.08); }

/* Schedule form */
.schedule-form { margin-top: 12px; }

.form-row {
  margin-bottom: 12px;
}

.form-row label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--bento-text-secondary);
  margin-bottom: 6px;
}

.input-label {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--bento-border);
  border-radius: var(--bento-radius-xs);
  font-size: 13px;
  color: var(--bento-text);
  background: var(--bento-bg);
}

.day-selector {
  display: flex;
  gap: 4px;
}

.day-btn {
  width: 40px;
  height: 36px;
  border: 2px solid var(--bento-border);
  border-radius: var(--bento-radius-xs);
  background: var(--bento-bg);
  color: var(--bento-text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: var(--bento-transition);
}

.day-btn:hover { border-color: var(--bento-primary); }
.day-btn.active {
  background: var(--bento-primary);
  color: #fff;
  border-color: var(--bento-primary);
}

.time-row {
  display: flex;
  gap: 20px;
}

.time-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.time-group label {
  margin-bottom: 0;
  margin-right: 6px;
}

.time-group span {
  font-weight: 700;
  color: var(--bento-text-secondary);
}

.input-time {
  width: 52px;
  padding: 8px;
  border: 1px solid var(--bento-border);
  border-radius: var(--bento-radius-xs);
  font-size: 14px;
  font-weight: 600;
  color: var(--bento-text);
  background: var(--bento-bg);
  text-align: center;
}

.toggle-row {
  display: flex !important;
  align-items: center;
  gap: 8px;
  flex-direction: row !important;
  cursor: pointer;
}

.toggle-row input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: var(--bento-primary);
}

.toggle-row span {
  font-size: 13px;
  color: var(--bento-text);
}

.form-buttons {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

/* History */
.history-table {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.history-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--bento-border);
  font-size: 13px;
}

.history-row:last-child { border-bottom: none; }

.history-date { color: var(--bento-text-secondary); min-width: 120px; font-variant-numeric: tabular-nums; }
.history-type { font-weight: 600; min-width: 100px; }
.history-duration { min-width: 60px; color: var(--bento-text-secondary); }
.history-cameras { flex: 1; color: var(--bento-text-secondary); font-size: 12px; }

.type-manual { color: var(--bento-primary); }
.type-scheduled { color: var(--bento-success); }
.type-cancelled { color: var(--bento-warning); }
.type-completed { color: var(--bento-text-secondary); }

/* Settings */
.setting-select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--bento-border);
  border-radius: var(--bento-radius-xs);
  font-size: 13px;
  color: var(--bento-text);
  background: var(--bento-bg);
}

.inline-input {
  display: flex;
  align-items: center;
  gap: 8px;
}

.inline-input span {
  font-size: 13px;
  color: var(--bento-text-secondary);
}

.notify-info {
  margin-top: 16px;
  padding: 12px;
  background: rgba(59,130,246,0.05);
  border-radius: var(--bento-radius-xs);
  border: 1px solid rgba(59,130,246,0.1);
}

.notify-info p {
  font-size: 12px;
  color: var(--bento-text-secondary);
  line-height: 1.5;
}

/* Empty state */
.empty-state {
  text-align: center;
  padding: 32px;
  color: var(--bento-text-secondary);
  font-size: 14px;
}

/* Toast */
.toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%) translateY(100px);
  padding: 12px 24px;
  border-radius: var(--bento-radius-sm);
  font-size: 13px;
  font-weight: 500;
  z-index: 1000;
  opacity: 0;
  transition: all 0.3s ease;
  pointer-events: none;
}

.toast-show {
  transform: translateX(-50%) translateY(0);
  opacity: 1;
}

.toast-success { background: var(--bento-success); color: #fff; }
.toast-error { background: var(--bento-error); color: #fff; }
.toast-info { background: var(--bento-primary); color: #fff; }

/* Responsive */
@media (max-width: 768px) {
  .container { padding: 12px; }
  .camera-grid { grid-template-columns: 1fr 1fr; }
  .time-row { flex-direction: column; gap: 8px; }
  .header { flex-direction: column; gap: 10px; align-items: flex-start; }
  .privacy-active-banner { flex-direction: column; text-align: center; }
  .privacy-banner-actions { align-items: stretch; }
  .extend-row { justify-content: center; }
  .history-row { flex-wrap: wrap; }
  .day-btn { width: 36px; height: 32px; font-size: 11px; }
}

@media (max-width: 480px) {
  .camera-grid { grid-template-columns: 1fr; }
  .quick-buttons { flex-direction: column; }
  .btn-quick { width: 100%; }
  .custom-pause { flex-direction: column; align-items: stretch; }
  .custom-pause .input-minutes { width: 100%; }
}
`;
  }
}

if (!customElements.get('ha-frigate-privacy')) {
  customElements.define('ha-frigate-privacy', HaFrigatePrivacy);
}
window.customCards = window.customCards || [];
window.customCards.push({ type: 'ha-frigate-privacy', name: 'Frigate Privacy', description: 'Pause Frigate cameras with timer and privacy schedule', preview: false });

class HaFrigatePrivacyEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
  }
  setConfig(config) {
    this._config = { ...config };
    this._render();
  }
  _dispatch() {
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: this._config }, bubbles: true, composed: true }));
  }
  _render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; padding:16px; font-family:var(--paper-font-body1_-_font-family, 'Roboto', sans-serif); }
        h3 { margin:0 0 16px; font-size:16px; font-weight:600; color:var(--primary-text-color,#1e293b); }
        input { outline:none; transition:border-color .2s; }
        input:focus { border-color:var(--primary-color,#3b82f6); }
      </style>
      <h3>Frigate Privacy</h3>
            <div style="margin-bottom:12px;">
              <label style="display:block;font-weight:500;margin-bottom:4px;font-size:13px;">Title</label>
              <input type="text" id="cf_title" value="${this._config?.title || 'Frigate Privacy'}"
                style="width:100%;padding:8px 12px;border:1px solid var(--divider-color,#e2e8f0);border-radius:8px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#1e293b);font-size:14px;box-sizing:border-box;">
            </div>
            <div style="margin-bottom:12px;">
              <label style="display:block;font-weight:500;margin-bottom:4px;font-size:13px;">Frigate addon ID</label>
              <input type="text" id="cf_frigate_addon_id" value="${this._config?.frigate_addon_id || 'ccab4aaf_frigate'}"
                style="width:100%;padding:8px 12px;border:1px solid var(--divider-color,#e2e8f0);border-radius:8px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#1e293b);font-size:14px;box-sizing:border-box;">
            </div>
    `;
        const f_title = this.shadowRoot.querySelector('#cf_title');
        if (f_title) f_title.addEventListener('input', (e) => {
          this._config = { ...this._config, title: e.target.value };
          this._dispatch();
        });
        const f_frigate_addon_id = this.shadowRoot.querySelector('#cf_frigate_addon_id');
        if (f_frigate_addon_id) f_frigate_addon_id.addEventListener('input', (e) => {
          this._config = { ...this._config, frigate_addon_id: e.target.value };
          this._dispatch();
        });
  }
  connectedCallback() { this._render(); }
}
if (!customElements.get('ha-frigate-privacy-editor')) { customElements.define('ha-frigate-privacy-editor', HaFrigatePrivacyEditor); }
