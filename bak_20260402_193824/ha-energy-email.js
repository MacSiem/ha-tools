/**
 * HA Energy Email Card v4.0.0
 * Send daily/weekly/monthly energy usage reports as HTML email.
 * v4.0.0: HA-native persistent storage (input_text helpers) for cross-device sync.
 *         Auto-creation of report automations with configurable schedule.
 *         Auto-discovery of energy sensors and notify services.
 *         Falls back to manual config (sensor.energy_report_devices) if available.
 *
 * Config:
 *   type: custom:ha-energy-email
 *   title: Energy Email Reports          (optional)
 *   recipient: your@email.com            (optional, auto-detected from notify service)
 *   currency: PLN                        (optional, default PLN)
 *   energy_price: 0.65                   (optional PLN/kWh)
 *   notify_service: email_report         (optional, auto-detected)
 */
class HAEnergyEmail extends HTMLElement {
  static getConfigElement() { return document.createElement('ha-energy-email-editor'); }
  constructor() {
    super();
    this._lang = (navigator.language || '').startsWith('pl') ? 'pl' : 'en';
    this.attachShadow({ mode: 'open' });
    this._hass = null;
    this._config = {};
    this._activeTab = 'overview';
    this._lastSent = {};
    this._sending = false;
    this._firstRender = false;
    this._lastRenderTime = 0;
    this._renderScheduled = false;
    this._reportPeriod = 'week';
    this._overviewPeriod = 'total';
    this._discoveredDevices = null;
    this._detectedRecipient = null;
    this._detectedService = null;
    this._helpersChecked = false;
    this._helpersReady = false;
    this._discoveryDone = false;
    this._excludedDevices = new Set();
    // Default schedule times
    this._scheduleDefaults = { daily: '07:30', weekly_day: 'mon', weekly_time: '08:00', monthly_time: '08:00' };
  }

  _sanitize(str) {
    if (!str) return str;
    try { return decodeURIComponent(escape(str)); } catch(e) { return str; }
  }
  set hass(hass) {
    if (hass?.language) this._lang = hass.language.startsWith('pl') ? 'pl' : 'en';
    this._hass = hass;
    if (!hass) return;
    const now = Date.now();
    if (!this._firstRender) {
      this._firstRender = true;
      this._discoverAll();
      this._render();
      this._lastRenderTime = now;
      return;
    }
    if (now - this._lastRenderTime < 10000) {
      if (!this._renderScheduled) {
        this._renderScheduled = true;
        setTimeout(() => {
          this._renderScheduled = false;
          this._updateLiveData();
          this._lastRenderTime = Date.now();
        }, 5000);
      }
      return;
    }
    this._updateLiveData();
    this._lastRenderTime = now;
  }

  setConfig(config) {
    this._config = {
      ...config,
      title: config.title || 'Energy Email Reports',
      recipient: config.recipient || '',
      currency: config.currency || 'PLN',
      energy_price: parseFloat(config.energy_price) || 0.65,
      energy_tariff_mode: config.energy_tariff_mode || 'flat',
      energy_price_day: parseFloat(config.energy_price_day) || 0.65,
      energy_price_night: parseFloat(config.energy_price_night) || 0.45,
      energy_price_weekday: parseFloat(config.energy_price_weekday) || 0.65,
      energy_price_weekend: parseFloat(config.energy_price_weekend) || 0.50,
      energy_price_wd_day: parseFloat(config.energy_price_wd_day) || 0.65,
      energy_price_wd_night: parseFloat(config.energy_price_wd_night) || 0.45,
      energy_price_we_day: parseFloat(config.energy_price_we_day) || 0.55,
      energy_price_we_night: parseFloat(config.energy_price_we_night) || 0.40,
      energy_day_hour_start: parseInt(config.energy_day_hour_start) || 6,
      energy_night_hour_start: parseInt(config.energy_night_hour_start) || 22,
      notify_service: config.notify_service || '',
    };
  }

  getCardSize() { return 4; }

  _getRate(hour, dayOfWeek) {
    const c = this._config;
    const mode = c.energy_tariff_mode || 'flat';
    const dayStart = c.energy_day_hour_start || 6;
    const nightStart = c.energy_night_hour_start || 22;
    const isDay = (dayStart < nightStart) ? (hour >= dayStart && hour < nightStart) : (hour >= dayStart || hour < nightStart);
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
    switch (mode) {
      case 'day_night':
        return isDay ? (c.energy_price_day || 0.65) : (c.energy_price_night || 0.45);
      case 'weekday_weekend':
        return isWeekend ? (c.energy_price_weekend || 0.50) : (c.energy_price_weekday || 0.65);
      case 'mixed':
        if (isWeekend) return isDay ? (c.energy_price_we_day || 0.55) : (c.energy_price_we_night || 0.40);
        return isDay ? (c.energy_price_wd_day || 0.65) : (c.energy_price_wd_night || 0.45);
      default:
        return c.energy_price || 0.65;
    }
  }

  _getAvgRate() {
    const mode = this._config.energy_tariff_mode || 'flat';
    if (mode === 'flat') return this._config.energy_price || 0.65;
    let sum = 0;
    for (let dow = 0; dow < 7; dow++) {
      for (let h = 0; h < 24; h++) {
        sum += this._getRate(h, dow);
      }
    }
    return sum / 168;
  }

  _getTariffLabel() {
    const c = this._config;
    const mode = c.energy_tariff_mode || 'flat';
    const cur = c.currency || 'PLN';
    switch (mode) {
      case 'day_night': return (c.energy_price_day || 0.65) + '/' + (c.energy_price_night || 0.45) + ' ' + cur + '/kWh (dzień/noc)';
      case 'weekday_weekend': return (c.energy_price_weekday || 0.65) + '/' + (c.energy_price_weekend || 0.50) + ' ' + cur + '/kWh (roboczy/weekend)';
      case 'mixed': return 'mix: ' + (c.energy_price_wd_day || 0.65) + '/' + (c.energy_price_wd_night || 0.45) + '/' + (c.energy_price_we_day || 0.55) + '/' + (c.energy_price_we_night || 0.40) + ' ' + cur;
      default: return (c.energy_price || 0.65) + ' ' + cur + '/kWh';
    }
  }


  static getStubConfig() {
    return {
      title: 'Energy Email Reports',
      currency: 'PLN',
      energy_price: 0.65
    };
  }

  _state(entity_id, fallback = '0') {
    if (!this._hass) return fallback;
    const s = this._hass.states[entity_id];
    return s ? s.state : fallback;
  }

  _attr(entity_id, attr, fallback = null) {
    if (!this._hass) return fallback;
    const s = this._hass.states[entity_id];
    return s && s.attributes[attr] !== undefined ? s.attributes[attr] : fallback;
  }

  _float(v, fallback = 0) {
    const n = parseFloat(v);
    return isNaN(n) ? fallback : n;
  }

  _fmt(v, decimals = 2) {
    return this._float(v).toFixed(decimals);
  }

  // --- auto-discovery ---

  async _discoverAll() {
    await this._ensureHelpers();
    this._discoverEnergySensors();
    this._discoverNotifyService();
    this._discoveryDone = true;
    this._render();
    // Fetch recorder stats in background (for period views)
    this._fetchAllPeriodStats().then(() => {
      if (this._periodCache_day || this._periodCache_week || this._periodCache_month) this._render();
    }).catch(() => {});
  }

  _discoverEnergySensors() {
    if (!this._hass) return;
    const states = this._hass.states;
    const energySensors = [];
    for (const [entityId, state] of Object.entries(states)) {
      if (!entityId.startsWith('sensor.')) continue;
      const attrs = state.attributes || {};
      const dc = attrs.device_class;
      const uom = attrs.unit_of_measurement;
      const sc = attrs.state_class;
      const val = parseFloat(state.state);
      if (dc === 'energy' || ((uom === 'kWh' || uom === 'Wh') && (sc === 'total_increasing' || sc === 'total' || sc === 'measurement'))) {
        if (isNaN(val) || state.state === 'unavailable' || state.state === 'unknown') continue;
        energySensors.push({
          entity_id: entityId,
          friendly_name: attrs.friendly_name || entityId.replace('sensor.', '').replace(/_/g, ' '),
          value: uom === 'Wh' ? val / 1000 : val,
          unit: 'kWh',
          device_class: dc,
          state_class: sc,
          icon: attrs.icon || 'mdi:flash',
          last_updated: state.last_updated
        });
      }
    }
    const deviceMap = {};
    for (const sensor of energySensors) {
      const eid = sensor.entity_id.replace('sensor.', '');
      let deviceKey = eid
        .replace(/_energy_?.*$/i, '')
        .replace(/_power_?.*$/i, '')
        .replace(/_electricity_?.*$/i, '')
        .replace(/_daily$/i, '')
        .replace(/_weekly$/i, '')
        .replace(/_monthly$/i, '')
        .replace(/_total$/i, '')
        .replace(/_kwh$/i, '')
        .replace(/_consumption$/i, '');
      if (!deviceMap[deviceKey]) {
        deviceMap[deviceKey] = {
          key: deviceKey,
          name: sensor.friendly_name.replace(/\s*(energy|power|electricity|daily|weekly|monthly|total|kwh|consumption)\s*/gi, '').trim() || deviceKey.replace(/_/g, ' '),
          sensors: []
        };
      }
      deviceMap[deviceKey].sensors.push(sensor);
    }
    const devices = [];
    for (const [key, device] of Object.entries(deviceMap)) {
      const sorted = device.sensors.sort((a, b) => {
        const priority = { total_increasing: 3, total: 2, measurement: 1 };
        return (priority[b.state_class] || 0) - (priority[a.state_class] || 0) || b.value - a.value;
      });
      const best = sorted[0];
      if (best) {
        devices.push({
          key: key,
          name: device.name.charAt(0).toUpperCase() + device.name.slice(1),
          entity_id: best.entity_id,
          value_kwh: best.value,
          sensor_count: device.sensors.length,
          all_sensors: device.sensors
        });
      }
    }
    devices.sort((a, b) => b.value_kwh - a.value_kwh);
    this._discoveredDevices = devices;
  }

  // --- HA-native persistent storage via input_text helpers ---

  // Helper config: 'key' is our logical name, 'name' generates entity_id (HA slugifies name → entity_id)
  // e.g. name "Energy Email Recipient" → input_text.energy_email_recipient
  static get HELPERS() {
    return [
      { key: 'recipient', name: 'Energy Email Recipient', max: 255 },
      { key: 'service', name: 'Energy Email Service', max: 100 },
      { key: 'daily_time', name: 'Energy Email Daily Time', max: 5 },
      { key: 'weekly_time', name: 'Energy Email Weekly Time', max: 5 },
      { key: 'weekly_day', name: 'Energy Email Weekly Day', max: 3 },
      { key: 'monthly_time', name: 'Energy Email Monthly Time', max: 5 },
      { key: 'price', name: 'Energy Email Price', max: 10 },
      { key: 'excluded', name: 'Energy Email Excluded', max: 255 },
    ];
  }

  // Resolve helper key → entity_id by scanning hass.states for matching friendly_name
  _helperEntity(key) {
    const cfg = HAEnergyEmail.HELPERS.find(h => h.key === key);
    if (!cfg) return null;
    // First try exact slug match (name lowercased, spaces→underscores)
    const slug = cfg.name.toLowerCase().replace(/\s+/g, '_');
    const directEid = `input_text.${slug}`;
    if (this._hass?.states?.[directEid]) return directEid;
    // Fallback: scan all input_text entities for matching friendly_name
    if (this._hass?.states) {
      for (const [eid, state] of Object.entries(this._hass.states)) {
        if (eid.startsWith('input_text.energy_email') && state.attributes?.friendly_name === cfg.name) return eid;
      }
    }
    return directEid; // return expected eid even if not found yet
  }

  async _ensureHelpers() {
    if (this._helpersChecked) return;
    this._helpersChecked = true;
    // Use entity registry to check existence (hass.states may not have new helpers yet)
    let registeredIds = new Set();
    try {
      const entries = await this._hass.callWS({ type: 'config/entity_registry/list' });
      for (const e of entries) {
        if (e.entity_id.startsWith('input_text.energy_email')) registeredIds.add(e.entity_id);
      }
    } catch(e) { /* fallback to hass.states check */ }
    let created = 0;
    for (const h of HAEnergyEmail.HELPERS) {
      const slug = h.name.toLowerCase().replace(/\s+/g, '_');
      const eid = `input_text.${slug}`;
      if (registeredIds.has(eid) || this._hass.states[eid]) continue;
      try {
        await this._hass.callWS({ type: 'input_text/create', name: h.name, min: 0, max: h.max, initial: '', mode: 'text' });
        created++;
      } catch (e) {
        // May fail if already exists or no permission — that's ok
      }
    }
    // If we created helpers, wait for HA to register them in states
    if (created > 0) await new Promise(r => setTimeout(r, 1500));
    this._helpersReady = true;
    this._loadFromHelpers();
  }

  _loadFromHelpers() {
    const s = this._hass?.states;
    if (!s) return;
    const read = (key) => {
      const eid = this._helperEntity(key);
      const val = s[eid]?.state;
      return (val && val !== 'unknown' && val !== '') ? val : '';
    };
    const recipient = read('recipient');
    const service = read('service');
    const dailyTime = read('daily_time');
    const weeklyTime = read('weekly_time');
    const weeklyDay = read('weekly_day');
    const monthlyTime = read('monthly_time');
    const price = read('price');
    if (recipient && recipient.includes('@')) this._detectedRecipient = recipient;
    if (service && service.length > 0) this._detectedService = service;
    if (/^\d{2}:\d{2}$/.test(dailyTime)) this._scheduleDefaults.daily = dailyTime;
    if (/^\d{2}:\d{2}$/.test(weeklyTime)) this._scheduleDefaults.weekly_time = weeklyTime;
    if (weeklyDay && weeklyDay.length >= 3) this._scheduleDefaults.weekly_day = weeklyDay;
    if (/^\d{2}:\d{2}$/.test(monthlyTime)) this._scheduleDefaults.monthly_time = monthlyTime;
    if (price && !isNaN(parseFloat(price)) && parseFloat(price) > 0) this._config.energy_price = parseFloat(price);
    const excluded = read('excluded');
    if (excluded) this._excludedDevices = new Set(excluded.split(',').map(s => s.trim()).filter(Boolean));
  }

  async _saveToHelper(key, value) {
    const eid = this._helperEntity(key);
    try {
      await this._hass.callService('input_text', 'set_value', { entity_id: eid, value: value || '' });
    } catch (e) {
      // Fallback to localStorage
      try { localStorage.setItem(`ha-energy-email-${key}`, value); } catch(e2) {}
    }
  }

  _readHelper(key) {
    const eid = this._helperEntity(key);
    const s = this._hass?.states?.[eid];
    if (s && s.state && s.state !== 'unknown' && s.state !== '') return s.state;
    // Fallback to localStorage
    try { return localStorage.getItem(`ha-energy-email-${key}`) || ''; } catch(e) { return ''; }
  }

  _discoverNotifyService() {
    if (!this._hass) return;
    const smtp = this._detectSmtp();
    // Restore saved service from HA helper
    const savedService = this._readHelper('service');
    if (savedService && smtp.services.find(s => s.service === savedService)) this._detectedService = savedService;
    if (!this._detectedService && smtp.found && smtp.defaultService) {
      this._detectedService = smtp.defaultService;
    }
    // Try to get SMTP recipient from HA helper first
    if (!this._config.recipient && !this._detectedRecipient) {
      const savedRecipient = this._readHelper('recipient');
      if (savedRecipient && savedRecipient.includes('@')) { this._detectedRecipient = savedRecipient; return; }
      // Scan for any input_text with email
      const states = this._hass.states;
      for (const [eid, state] of Object.entries(states)) {
        if (eid.includes('email') && eid.startsWith('input_text.') && eid !== this._helperEntity('recipient') && state.state.includes('@')) {
          this._detectedRecipient = state.state; break;
        }
      }
      // Try config_entries API
      if (!this._detectedRecipient && !this._configEntriesChecked) {
        this._configEntriesChecked = true;
        this._hass.callWS({ type: 'config_entries/get' }).then(entries => {
          const smtpEntry = entries.find(e => e.domain === 'smtp' || (e.domain === 'notify' && e.title && /smtp|email|mail/i.test(e.title)));
          if (smtpEntry && smtpEntry.data) {
            const r = smtpEntry.data.recipient || smtpEntry.data.recipient_email;
            if (r) { this._detectedRecipient = Array.isArray(r) ? r[0] : r; this._render(); }
          }
        }).catch(() => {});
      }
    }
  }

  _saveService(svc) {
    this._saveToHelper('service', svc);
    this._detectedService = svc;
    this._renderTab();
  }

  _getRecipient() {
    if (this._config.recipient) return this._config.recipient;
    if (this._detectedRecipient) return this._detectedRecipient;
    return '';
  }

  _saveRecipient(email) {
    this._saveToHelper('recipient', email);
    this._detectedRecipient = email;
    this._render();
  }

  _getNotifyService() {
    if (this._config.notify_service) return this._config.notify_service;
    if (this._detectedService) return this._detectedService;
    return null;
  }

  _devices() {
    const manual = this._attr('sensor.energy_report_devices', 'devices');
    if (manual && Array.isArray(manual) && manual.length > 0) {
      return manual;
    }
    return [];
  }

  _getOverviewDataForPeriod(period) {
    const manual = this._devices();
    if (manual.length === 0) return this._getOverviewData();
    if (period === 'total' || period === 'month') {
      return manual.map(d => ({
        name: d.name,
        month: this._float(this._state(period === 'total' ? (d.energy_month || d.energy_week) : d.energy_month, '0')),
        lastMonth: this._float(this._state(d.energy_last_month, '0')),
        cost: this._float(this._state(d.cost_month || d.cost_week, '0')),
        source: 'manual'
      })).sort((a, b) => b.month - a.month);
    }
    if (period === 'week') {
      return manual.map(d => ({
        name: d.name,
        month: this._float(this._state(d.energy_week, '0')),
        lastMonth: this._float(this._state(d.energy_last_week, '0')),
        cost: this._float(this._state(d.cost_week, '0')),
        source: 'manual'
      })).sort((a, b) => b.month - a.month);
    }
    if (period === 'day') {
      return manual.map(d => ({
        name: d.name,
        month: this._float(this._state(d.energy_day || d.energy_week, '0')),
        lastMonth: 0,
        cost: this._float(this._state(d.energy_day || d.energy_week, '0')) * this._getAvgRate(),
        source: 'manual'
      })).sort((a, b) => b.month - a.month);
    }
    return this._getOverviewData();
  }

  _getAutoDataForPeriod(period) {
    // Return cached recorder stats if available
    const cacheKey = `_periodCache_${period}`;
    if (this[cacheKey] && this[cacheKey].length > 0) return this._filterExcluded(this[cacheKey]).sort((a, b) => b.month - a.month);
    // Fallback: try suffix-based sensors
    if (!this._discoveredDevices) return [];
    const suffixMap = { day: /daily|_day|_24h/i, week: /weekly|_week|_7d/i, month: /monthly|_month|_30d/i };
    const regex = suffixMap[period];
    if (!regex) return [];
    const result = [];
    for (const dev of this._discoveredDevices) {
      if (!dev.all_sensors) continue;
      const match = dev.all_sensors.find(s => regex.test(s.entity_id) || regex.test(s.friendly_name));
      if (match) {
        result.push({
          name: dev.name, key: dev.key || dev.entity_id,
          month: match.value, lastMonth: 0,
          cost: match.value * this._getAvgRate(),
          entity_id: match.entity_id, source: 'auto'
        });
      }
    }
    return this._filterExcluded(result).sort((a, b) => b.month - a.month);
  }

  // Fetch energy consumption from HA recorder statistics (same as Energy Dashboard)
  async _fetchRecorderStats(period) {
    if (!this._hass || !this._discoveredDevices || this._discoveredDevices.length === 0) return;
    const now = new Date();
    const periodConfig = {
      day:   { hours: 24, statPeriod: 'hour' },
      week:  { hours: 168, statPeriod: 'day' },
      month: { hours: 720, statPeriod: 'day' }
    };
    const pc = periodConfig[period];
    if (!pc) return;
    const startTime = new Date(now.getTime() - pc.hours * 3600000);
    // Collect all total_increasing sensor entity_ids
    const sensorIds = [];
    const devMap = {};
    for (const dev of this._discoveredDevices) {
      // Pick the best total_increasing sensor per device
      const best = dev.all_sensors
        ? dev.all_sensors.find(s => s.state_class === 'total_increasing') || dev.all_sensors[0]
        : { entity_id: dev.entity_id };
      if (best && best.entity_id) {
        sensorIds.push(best.entity_id);
        devMap[best.entity_id] = dev;
      }
    }
    if (sensorIds.length === 0) return;
    try {
      const stats = await this._hass.callWS({
        type: 'recorder/statistics_during_period',
        start_time: startTime.toISOString(),
        end_time: now.toISOString(),
        statistic_ids: sensorIds,
        period: pc.statPeriod,
        types: ['change']
      });
      const result = [];
      for (const [entityId, dataPoints] of Object.entries(stats || {})) {
        const dev = devMap[entityId];
        if (!dev || !dataPoints || dataPoints.length === 0) continue;
        const totalChange = dataPoints.reduce((sum, dp) => sum + (dp.change || 0), 0);
        // Convert Wh to kWh if needed
        const attrs = this._hass.states?.[entityId]?.attributes || {};
        const kwh = attrs.unit_of_measurement === 'Wh' ? totalChange / 1000 : totalChange;
        if (kwh <= 0) continue;
        result.push({
          name: dev.name, key: dev.key || dev.entity_id,
          month: kwh, lastMonth: 0,
          cost: kwh * this._getAvgRate(),
          entity_id: entityId, source: 'auto'
        });
      }
      // Cache results
      this[`_periodCache_${period}`] = result;
      this[`_periodCacheTime_${period}`] = Date.now();
    } catch (e) {
      // recorder/statistics_during_period may not be available on older HA versions
      console.warn('Energy Email: recorder stats fetch failed:', e.message);
    }
  }

  // Fetch stats for all periods (called once during discovery)
  async _fetchAllPeriodStats() {
    await Promise.all([
      this._fetchRecorderStats('day'),
      this._fetchRecorderStats('week'),
      this._fetchRecorderStats('month')
    ]);
  }

  _filterExcluded(data) {
    if (!this._excludedDevices || this._excludedDevices.size === 0) return data;
    return data.filter(d => {
      const key = d.key || d.entity_id || d.name;
      return !this._excludedDevices.has(key);
    });
  }

  _getOverviewData() {
    const manual = this._devices();
    if (manual.length > 0) {
      return this._filterExcluded(manual.map(d => ({
        name: d.name, key: d.name,
        month: this._float(this._state(d.energy_month, '0')),
        lastMonth: this._float(this._state(d.energy_last_month, '0')),
        cost: this._float(this._state(d.cost_month, '0')),
        source: 'manual'
      }))).sort((a, b) => b.month - a.month);
    }
    if (this._discoveredDevices && this._discoveredDevices.length > 0) {
      return this._filterExcluded(this._discoveredDevices.map(d => ({
        name: d.name, key: d.key || d.entity_id,
        month: d.value_kwh,
        lastMonth: 0,
        cost: d.value_kwh * this._getAvgRate(),
        entity_id: d.entity_id,
        sensor_count: d.sensor_count,
        source: 'auto'
      }))).sort((a, b) => b.month - a.month);
    }
    return [];
  }

  _autoState(id) {
    const s = this._state(id, 'unknown');
    return s === 'on' ? '\u2705 Enabled' : s === 'off' ? '\u274C Disabled' : '\u2753 Unknown';
  }

  _autoStateClass(id) {
    const s = this._state(id, 'unknown');
    return s === 'on' ? 'auto-on' : s === 'off' ? 'auto-off' : 'auto-unknown';
  }

  // --- main render ---

  _render() {
    const L = this._lang === 'pl';
    const recipient = this._getRecipient();
    const service = this._getNotifyService();
    const recipientDisplay = recipient
      ? `To: ${recipient}`
      : (service ? `via notify.${service}` : (L ? 'Nie wykryto adresu email' : 'No email detected'));
    this.shadowRoot.innerHTML = `
      <style>${window.HAToolsBentoCSS || ""}

        :host {
          font-family: 'Inter', sans-serif;
        }
        @media (prefers-color-scheme: dark) {
          :host { --bg: #0f172a; --ca: #1e293b; --bo: #334155; --tx: #e2e8f0; --t2: #94a3b8; --t3: #475569; }
        }
        .card { background: var(--bento-card); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-md); padding: 20px; box-shadow: var(--bento-shadow-sm); }
        .header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
        .header-icon { font-size: 24px; }
        .header-title { font-size: 17px; font-weight: 700; color: var(--bento-text); }
        .header-sub { font-size: 12px; color: var(--bento-text-secondary); margin-top: 1px; }
        .tabs { display: flex; gap: 4px; border-bottom: 2px solid var(--bento-border); margin-bottom: 18px; overflow-x: auto; overflow-y: hidden; }
        .tab-btn { padding: 8px 16px; border: none; background: transparent; cursor: pointer; font-size: 13px; font-weight: 500; color: var(--bento-text-secondary); border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all .2s; white-space: nowrap; font-family: 'Inter', sans-serif; border-radius: 0; }
        .tab-btn:hover { color: var(--bento-primary); background: var(--bento-primary-light); }
        .tab-btn.active { color: var(--bento-primary); border-bottom-color: var(--bento-primary); font-weight: 600; }
        .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
        .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 16px; }
        @media (max-width: 500px) { .grid3 { grid-template-columns: 1fr 1fr; } }
        .stat { background: var(--bento-bg); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); padding: 14px; text-align: center; min-width: 0; overflow: hidden; }
        .stat-val { font-size: 24px; font-weight: 700; color: var(--bento-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .stat-lbl { font-size: 11px; font-weight: 500; color: var(--bento-text-secondary); text-transform: uppercase; letter-spacing: .4px; margin-top: 2px; }
        .stat-sub { font-size: 11px; color: var(--bento-text-muted); margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .section-title { font-size: 13px; font-weight: 600; color: var(--bento-text-secondary); text-transform: uppercase; letter-spacing: .5px; margin: 16px 0 8px; }
        .device-row { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: var(--bento-radius-xs); transition: background .15s; }
        .device-row:hover { background: var(--bento-primary-light); }
        .device-name { flex: 1; font-size: 13px; color: var(--bento-text); }
        .device-val { font-size: 12px; font-weight: 600; color: var(--bento-primary); min-width: 70px; text-align: right; }
        .device-bar-wrap { flex: 1; background: var(--bento-border); border-radius: 4px; height: 6px; overflow: hidden; }
        .device-bar { height: 100%; background: var(--bento-primary); border-radius: 4px; transition: width .4s; }
        .schedule-card { border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); padding: 14px; margin-bottom: 10px; }
        .schedule-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
        .schedule-name { font-size: 14px; font-weight: 600; color: var(--bento-text); }
        .badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .4px; }
        .badge-ok { background: var(--bento-success-light); color: var(--bento-success); }
        .badge-er { background: var(--bento-error-light); color: var(--bento-error); }
        .badge-wa { background: var(--bento-warning-light); color: var(--bento-warning); }
        .badge-pr { background: var(--bento-primary-light); color: var(--bento-primary); }
        .badge-auto { background: rgba(139,92,246,.1); color: #8B5CF6; }
        .schedule-meta { font-size: 12px; color: var(--bento-text-secondary); }
        .schedule-meta span { margin-right: 12px; }
        .btn-row { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
        .btn { padding: 8px 16px; border-radius: var(--bento-radius-xs); border: 1.5px solid var(--bento-border); background: var(--bento-card); color: var(--bento-text); font-size: 13px; font-weight: 500; cursor: pointer; font-family: 'Inter', sans-serif; transition: all .2s; }
        .btn:hover { background: var(--bento-bg); }
        .btn:disabled { opacity: .45; cursor: not-allowed; }
        .btn-primary { background: var(--bento-primary) !important; color: #fff !important; border-color: var(--bento-primary) !important; box-shadow: 0 2px 8px rgba(59,130,246,.3); }
        .btn-primary:hover { background: #2563EB !important; }
        .btn-ok { background: var(--bento-success) !important; color: #fff !important; border-color: var(--bento-success) !important; }
        .smtp-section { background: var(--bento-bg); border: 1px solid var(--bento-border); border-radius: 12px; padding: 16px; margin-bottom: 16px; }
        .smtp-missing { border-color: #f59e0b40; background: #fef3c720; }
        .smtp-header { display: flex; align-items: center; gap: 12px; }
        .smtp-icon { font-size: 24px; }
        .smtp-title { font-weight: 700; font-size: 14px; color: var(--t1, #1e293b); }
        .smtp-detail { font-size: 12px; color: var(--bento-text-secondary); margin-top: 2px; }
        .smtp-detail code { background: var(--bento-border); padding: 1px 6px; border-radius: 4px; font-size: 11px; }
        .smtp-actions { display: flex; align-items: center; gap: 10px; margin-top: 12px; flex-wrap: wrap; }
        .smtp-guide { margin-top: 16px; }
        .guide-title { font-weight: 700; font-size: 14px; margin-bottom: 12px; color: var(--t1, #1e293b); }
        .guide-steps { display: flex; flex-direction: column; gap: 16px; }
        .guide-step { display: flex; gap: 12px; }
        .step-num { flex-shrink: 0; width: 28px; height: 28px; background: var(--primary, #3b82f6); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; }
        .guide-step p { margin: 4px 0; font-size: 13px; color: var(--bento-text-secondary); line-height: 1.5; }
        .guide-step pre { background: #1e293b; color: #e2e8f0; padding: 12px; border-radius: 8px; font-size: 12px; overflow-x: auto; line-height: 1.6; white-space: pre; margin: 8px 0; }
        .guide-step a { color: var(--primary, #3b82f6); text-decoration: none; }
        .guide-step a:hover { text-decoration: underline; }
        .guide-alt { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--bento-border); }
        .smtp-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
        .smtp-table th { background: var(--bento-border); padding: 6px 10px; text-align: left; font-weight: 600; }
        .smtp-table td { padding: 6px 10px; border-bottom: 1px solid var(--bento-border); }
        .smtp-table tr:hover td { background: var(--bento-border); }
        .toast { display: none; position: fixed; bottom: 24px; right: 24px; z-index: 9999; background: #1e293b; color: #e2e8f0; padding: 12px 20px; border-radius: var(--bento-radius-sm); font-size: 13px; box-shadow: 0 8px 24px rgba(0,0,0,.3); max-width: 320px; }
        .toast.show { display: block; animation: slideUp .3s ease-out; }
        @keyframes slideUp { from { opacity:0; transform: translateY(12px); } to { opacity:1; transform: translateY(0); } }
        .preview-box { background: var(--bento-bg); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); padding: 16px; font-size: 13px; color: var(--bento-text); max-height: 320px; overflow-y: auto; }
        .preview-box h3 { font-size: 15px; margin: 0 0 10px; }
        .preview-box h4 { font-size: 13px; margin: 14px 0 6px; color: var(--bento-text-secondary); }
        .preview-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .preview-table th { background: var(--bento-border); padding: 5px 8px; text-align: left; font-weight: 600; font-size: 11px; }
        .preview-table td { padding: 5px 8px; border-bottom: 1px solid var(--bento-border); }
        .preview-table tr:last-child td { border-bottom: none; }
        .trend-up { color: var(--bento-error); }
        .trend-down { color: var(--bento-success); }
        .info-row { display: flex; gap: 6px; align-items: flex-start; padding: 10px; background: var(--bento-primary-light); border-radius: var(--bento-radius-xs); margin-bottom: 12px; font-size: 12px; color: var(--bento-text); }
        .info-warn { background: var(--bento-warning-light); }
        .auto-on { color: var(--bento-success); }
        .auto-off { color: var(--bento-error); }
        .auto-unknown { color: var(--bento-warning); }
        .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(255,255,255,.3); border-top-color: #fff; border-radius: 50%; animation: spin .6s linear infinite; margin-right: 6px; vertical-align: middle; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .last-sent { font-size: 11px; color: var(--bento-text-muted); margin-top: 4px; }
        .empty-state { text-align: center; padding: 32px 20px; }
        .empty-state .big { font-size: 40px; margin-bottom: 12px; }
        .empty-state .title { font-size: 15px; font-weight: 600; color: var(--bento-text); margin-bottom: 6px; }
        .empty-state .desc { font-size: 13px; color: var(--bento-text-secondary); line-height: 1.6; max-width: 400px; margin: 0 auto; }
        .source-badge { display: inline-flex; align-items: center; gap: 3px; padding: 1px 8px; border-radius: 10px; font-size: 10px; font-weight: 600; margin-left: 6px; }
        .source-auto { background: rgba(139,92,246,.1); color: #8B5CF6; }
        .email-setup { background: var(--bento-warning-light); border: 1px solid rgba(245,158,11,.3); border-radius: var(--bento-radius-sm); padding: 14px; margin-bottom: 16px; }
        .email-setup-title { font-size: 13px; font-weight: 600; color: var(--bento-text); margin-bottom: 8px; }
        .email-input-row { display: flex; gap: 8px; align-items: center; }
        .email-input { flex: 1; padding: 8px 12px; border: 1.5px solid var(--bento-border); border-radius: var(--bento-radius-xs); font-size: 13px; font-family: 'Inter', sans-serif; background: var(--bento-card); color: var(--bento-text); outline: none; }
        .email-input:focus { border-color: var(--bento-primary); box-shadow: 0 0 0 3px var(--bento-primary-light); }
        .svc-select-btn { transition: all .2s; }
        .svc-select-btn:not(.btn-primary):hover { background: var(--bento-primary-light) !important; }
        .email-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; padding: 8px 12px; background: var(--bento-success-light); border-radius: var(--bento-radius-xs); font-size: 12px; color: var(--bento-text); }
        .email-edit-btn { background: none; border: none; color: var(--bento-primary); cursor: pointer; font-size: 11px; padding: 2px 6px; font-family: 'Inter', sans-serif; }
        .email-edit-btn:hover { text-decoration: underline; }
        .source-manual { background: var(--bento-success-light); color: var(--bento-success); }
        .config-section { margin-bottom: 20px; }
        .config-section-title { font-size: 13px; font-weight: 700; color: var(--bento-text); margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }
        .device-toggle { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: var(--bento-radius-xs); transition: background .15s; }
        .device-toggle:hover { background: var(--bento-primary-light); }
        .device-toggle label { flex: 1; font-size: 13px; color: var(--bento-text); cursor: pointer; display: flex; align-items: center; gap: 8px; }
        .device-toggle .dt-val { font-size: 11px; color: var(--bento-text-secondary); min-width: 60px; text-align: right; }
        .toggle-switch { position: relative; width: 36px; height: 20px; flex-shrink: 0; }
        .toggle-switch input { opacity: 0; width: 0; height: 0; }
        .toggle-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background: var(--bento-border); border-radius: 20px; transition: .2s; }
        .toggle-slider::before { content: ''; position: absolute; height: 16px; width: 16px; left: 2px; bottom: 2px; background: #fff; border-radius: 50%; transition: .2s; }
        .toggle-switch input:checked + .toggle-slider { background: var(--bento-primary); }
        .toggle-switch input:checked + .toggle-slider::before { transform: translateX(16px); }
        .config-input-row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
        .config-input-row label { font-size: 12px; color: var(--bento-text-secondary); min-width: 80px; font-weight: 500; }
        .config-input { padding: 6px 10px; border: 1.5px solid var(--bento-border); border-radius: var(--bento-radius-xs); font-size: 13px; background: var(--bento-card); color: var(--bento-text); font-family: 'Inter', sans-serif; }
        .config-input:focus { border-color: var(--bento-primary); outline: none; box-shadow: 0 0 0 3px var(--bento-primary-light); }
        .device-count { font-size: 11px; color: var(--bento-text-muted); font-weight: 400; }
        @media (max-width: 768px) {
          .tabs { flex-wrap: wrap; overflow-x: visible; gap: 2px; }
          .tab-btn { padding: 6px 10px; font-size: 12px; white-space: nowrap; }
          .card { padding: 14px; }
          .grid3 { grid-template-columns: repeat(2, 1fr); gap: 8px; }
          .stat-val { font-size: 18px; }
          .stat-lbl { font-size: 10px; }
        }
        @media (max-width: 480px) {
          .tabs { gap: 1px; }
          .tab-btn { padding: 5px 8px; font-size: 11px; }
          .stat-val { font-size: 16px; }
        }
      

</style>

      <div class="card">
        <div class="header">
          <div class="header-icon">\u{1F4E7}</div>
          <div>
            <div class="header-title">${this._config.title}</div>
            <div class="header-sub">${recipientDisplay} \u00A0\u2022\u00A0 <span id="price-display" style="cursor:pointer;color:var(--bento-primary);border-bottom:1px dashed var(--bento-primary)" title="${L ? 'Kliknij aby zmieni\u0107' : 'Click to change'}">${this._config.currency} ${this._getTariffLabel()} \u270E</span></div>
          </div>
        </div>
        <div class="tabs">
          <button class="tab-btn ${this._activeTab === 'overview' ? 'active' : ''}" data-tab="overview">\u{1F4CA} Overview</button>
          <button class="tab-btn ${this._activeTab === 'schedule' ? 'active' : ''}" data-tab="schedule">\u{1F4C5} Schedule</button>
          <button class="tab-btn ${this._activeTab === 'preview' ? 'active' : ''}" data-tab="preview">\u{1F4CB} Preview</button>
          <button class="tab-btn ${this._activeTab === 'send' ? 'active' : ''}" data-tab="send">\u{1F4E4} Send Now</button>
          <button class="tab-btn ${this._activeTab === 'config' ? 'active' : ''}" data-tab="config">\u2699\uFE0F Config</button>
        </div>
        <div id="tab-content"></div>
      </div>
      <div class="toast" id="toast"></div>
    `
    this.shadowRoot.querySelectorAll('.tab').forEach(t => {
      t.addEventListener('click', () => {
        this._activeTab = t.dataset.tab;
        this.shadowRoot.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        this._renderTab();
      });
    });
    this._renderTab();
    this._injectDiscovery();
    this._bindEmailEvents();
    this._bindPriceEdit();
  }

  _injectDiscovery() {
    if (customElements.get('ha-tools-panel')) return;
    const container = this.shadowRoot.querySelector('.card');
    if (!container) return;
    if (container.querySelector('ha-tools-discovery-banner')) return;
    const _inj = () => { if (window.HAToolsDiscovery) window.HAToolsDiscovery.inject(container, 'energy-email', true); };
    if (window.HAToolsDiscovery) { _inj(); return; }
    const s = document.createElement('script');
    s.src = '/local/community/ha-tools-panel/ha-tools-discovery.js?_=' + Date.now();
    s.async = true;
    s.onload = _inj;
    document.head.appendChild(s);
  }

  _bindEmailEvents() {
    const root = this.shadowRoot;
    const saveBtn = root.getElementById('email-save');
    const editBtn = root.getElementById('email-edit');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const input = root.getElementById('email-input');
        if (input && input.value && input.value.includes('@')) {
          this._saveRecipient(input.value.trim());
        }
      });
      const input = root.getElementById('email-input');
      if (input) {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && input.value && input.value.includes('@')) {
            this._saveRecipient(input.value.trim());
          }
        });
      }
    }
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        this._saveToHelper('recipient', '');
        this._detectedRecipient = null;
        this._render();
      });
    }
  }

  _bindPriceEdit() {
    const root = this.shadowRoot;
    const priceEl = root.getElementById('price-display');
    if (!priceEl) return;
    priceEl.addEventListener('click', (e) => {
      e.preventDefault();
      const L = this._lang === 'pl';
      const cur = this._getAvgRate();
      // Replace the price display with an inline input
      const container = priceEl.parentElement;
      const origHtml = container.innerHTML;
      const inputHtml = `<span style="display:inline-flex;align-items:center;gap:4px">
        <span>${this._config.currency}</span>
        <input type="number" id="price-input" value="${cur}" step="0.01" min="0" style="width:70px;padding:3px 6px;border:1.5px solid var(--bento-primary);border-radius:4px;font-size:12px;background:var(--bento-card);color:var(--bento-text);font-family:'Inter',sans-serif;text-align:center">
        <span>/kWh</span>
        <button id="price-save" class="btn btn-primary" style="padding:3px 10px;font-size:11px;margin:0">\u2714</button>
        <button id="price-cancel" class="btn" style="padding:3px 8px;font-size:11px;margin:0">\u2716</button>
      </span>`;
      // Find just the price part and replace
      const priceSpan = root.getElementById('price-display');
      priceSpan.outerHTML = inputHtml;
      const input = root.getElementById('price-input');
      const saveBtn = root.getElementById('price-save');
      const cancelBtn = root.getElementById('price-cancel');
      if (input) input.focus();
      const save = () => {
        const val = parseFloat(input.value);
        if (!isNaN(val) && val > 0) {
          this._config.energy_price = val;
          this._saveToHelper('price', String(val));
          this._render();
        }
      };
      if (saveBtn) saveBtn.addEventListener('click', save);
      if (cancelBtn) cancelBtn.addEventListener('click', () => this._render());
      if (input) input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') save();
        if (e.key === 'Escape') this._render();
      });
    });
  }

  _renderTab() {
    const el = this.shadowRoot.getElementById('tab-content');
    if (!el) return;
    switch (this._activeTab) {
      case 'overview': el.innerHTML = this._tabOverview(); this._attachOverviewEvents(); break;
      case 'schedule': el.innerHTML = this._tabSchedule(); this._attachScheduleEvents(); break;
      case 'preview':  el.innerHTML = this._tabPreview(); break;
      case 'send':     el.innerHTML = this._tabSend(); this._attachSendEvents(); break;
      case 'config':   el.innerHTML = this._tabConfig(); this._attachConfigEvents(); break;
    }
  }

  _updateLiveData() {
    if (this._activeTab !== 'send') {
      this._discoverEnergySensors();
      this._renderTab();
    }
  }

  _attachOverviewEvents() {
    this.shadowRoot.querySelectorAll('.overview-period-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = btn.dataset.period;
        this._overviewPeriod = p;
        // Refresh recorder stats if cache is older than 60s
        const cacheTime = this[`_periodCacheTime_${p}`] || 0;
        if (p !== 'total' && Date.now() - cacheTime > 60000) {
          this._fetchRecorderStats(p).then(() => this._renderTab()).catch(() => {});
        }
        this._renderTab();
      });
    });
  }

  _attachPeriodEvents() {
    this.shadowRoot.querySelectorAll('.period-btn').forEach(btn => {
      btn.addEventListener('click', () => { this._reportPeriod = btn.dataset.period; this._renderTab(); });
    });
  }

  // --- tabs ---

  _tabOverview() {
    const devData = this._getOverviewData();
    const isAuto = devData.length > 0 && devData[0].source === 'auto';
    const L = this._lang === 'pl';
    if (devData.length === 0 && !this._discoveryDone) {
      return `<div class="empty-state">
        <div class="big"><span class="spinner" style="width:32px;height:32px;border-width:3px;border-color:var(--bento-primary);border-top-color:transparent;"></span></div>
        <div class="title">${L ? 'Wyszukiwanie czujnik\u00F3w energii...' : 'Discovering energy sensors...'}</div>
        <div class="desc">${L
          ? 'Skanowanie urz\u0105dze\u0144 Home Assistant i konfiguracja ustawie\u0144. To potrwa chwil\u0119.'
          : 'Scanning Home Assistant devices and configuring settings. This will take a moment.'}</div>
      </div>`;
    }
    if (devData.length === 0) {
      return `<div class="empty-state">
        <div class="big">\u{1F50C}</div>
        <div class="title">${L ? 'Nie znaleziono czujnik\u00F3w energii' : 'No Energy Sensors Found'}</div>
        <div class="desc">${L
          ? 'Karta nie znalaz\u0142a \u017Cadnych czujnik\u00F3w energii w Home Assistant. Upewnij si\u0119, \u017Ce masz skonfigurowane urz\u0105dzenia z monitoringiem energii (np. Shelly, PZEM, smart plugi) lub dodaj je do HA Energy Dashboard.'
          : 'No energy sensors found in Home Assistant. Make sure you have energy monitoring devices configured (e.g., Shelly, PZEM, smart plugs) or add them to the HA Energy Dashboard.'}</div>
        <div style="margin-top:16px;"><a class="btn btn-primary" href="/config/energy" target="_blank">\u26A1 ${L ? 'Konfiguracja Energy' : 'Energy Config'}</a></div>
      </div>`;
    }
    const period = this._overviewPeriod || 'total';
    const periodLabels = {
      total: { lbl: 'Total', lblPl: '\u0141\u0105cznie', sub: '', subPl: '' },
      day:   { lbl: 'Today', lblPl: 'Dzisiaj', sub: 'Last 24h', subPl: 'Ostatnie 24h' },
      week:  { lbl: 'This Week', lblPl: 'Ten tydzie\u0144', sub: 'Last 7 days', subPl: 'Ostatnie 7 dni' },
      month: { lbl: 'This Month', lblPl: 'Ten miesi\u0105c', sub: 'Last 30 days', subPl: 'Ostatnie 30 dni' },
    };
    const pl = periodLabels[period];
    const periodLabel = L ? pl.lblPl : pl.lbl;
    let displayData;
    let periodNote = '';
    if (!isAuto && devData.length > 0 && devData[0].source === 'manual') {
      displayData = this._getOverviewDataForPeriod(period);
    } else if (isAuto && period !== 'total') {
      // Try to find period-specific sensors for auto-discovered devices
      try { displayData = this._getAutoDataForPeriod(period); } catch(e) { displayData = []; }
      const hasRealData = displayData.length > 0 && displayData.some(d => d.month > 0);
      if (!hasRealData) {
        displayData = devData;
        periodNote = L ? '(dane total \u2014 brak sensor\u00F3w per okres)' : '(total data \u2014 no per-period sensors)';
      }
    } else {
      displayData = devData;
    }
    const totalEnergy = displayData.reduce((s, d) => s + d.month, 0);
    const totalCost = isAuto ? totalEnergy * this._getAvgRate() : displayData.reduce((s, d) => s + d.cost, 0);
    const maxVal = Math.max(...displayData.map(x => x.month)) || 1;
    const periodBtns = ['day', 'week', 'month', 'total'].map(p => {
      const lb = p === 'total' ? (L ? 'Wszystko' : 'All') : p === 'day' ? '24h' : p === 'week' ? '7d' : '30d';
      return `<button class="overview-period-btn" data-period="${p}" style="padding:5px 12px;font-size:11px;border-radius:6px;cursor:pointer;border:1px solid var(--bento-border);background:${period === p ? 'var(--bento-primary)' : 'var(--bento-bg)'};color:${period === p ? '#fff' : 'var(--bento-text)'};font-weight:${period === p ? '600' : '400'};">${lb}</button>`;
    }).join('');
    return `
      ${isAuto ? `<div class="info-row">\u{1F50D}\u00A0 ${L ? 'Auto-discovery: znaleziono <b>' + displayData.length + '</b> urz\u0105dze\u0144 z czujnikami energii.' : 'Auto-discovery: found <b>' + displayData.length + '</b> devices with energy sensors.'} <span class="source-badge source-auto">AUTO</span>${periodNote ? `<br><span style="font-size:11px;color:var(--bento-warning)">${periodNote}</span>` : ''}</div>` : ''}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div class="section-title" style="margin:0;">\u{1F4CA} ${periodLabel}</div>
        <div style="display:flex;gap:4px;">${periodBtns}</div>
      </div>
      <div class="grid3">
        <div class="stat">
          <div class="stat-val" style="color:#F59E0B">${totalEnergy.toFixed(1)}</div>
          <div class="stat-lbl">kWh ${periodLabel}</div>
          <div class="stat-sub">${displayData.length} ${L ? 'urz\u0105dze\u0144' : 'devices'}</div>
        </div>
        <div class="stat">
          <div class="stat-val" style="color:#3B82F6">${totalCost.toFixed(2)}</div>
          <div class="stat-lbl">${this._config.currency} ${L ? 'Koszt' : 'Cost'}</div>
          <div class="stat-sub">@ ${this._getTariffLabel()}</div>
        </div>
        <div class="stat">
          <div class="stat-val" style="color:#10B981">${displayData.length > 0 ? displayData[0].name.split(' ').slice(0,2).join(' ') : '-'}</div>
          <div class="stat-lbl">${L ? 'Najwi\u0119ksze zu\u017Cycie' : 'Top Consumer'}</div>
          <div class="stat-sub">${displayData.length > 0 ? displayData[0].month.toFixed(1) + ' kWh' : ''}</div>
        </div>
      </div>
      <div class="section-title">\u26A1 ${L ? 'Zu\u017Cycie wg urz\u0105dzenia' : 'Energy by Device'}</div>
      ${displayData.map(d => {
        const pct = maxVal > 0 ? (d.month / maxVal * 100) : 0;
        const diff = d.month - d.lastMonth;
        const diffStr = d.lastMonth > 0 && diff !== 0 ? `<span class="${diff > 0 ? 'trend-up' : 'trend-down'}">${diff > 0 ? '+' : ''}${diff.toFixed(1)} kWh</span>` : '';
        const entityInfo = d.entity_id ? `<span style="font-size:10px;color:var(--bento-text-muted)" title="${d.entity_id}">${d.entity_id.split('.')[1].substring(0,20)}</span>` : '';
        return `<div class="device-row" title="${d.entity_id || d.name}">
          <div class="device-name">${d.name} ${entityInfo}</div>
          <div class="device-bar-wrap"><div class="device-bar" style="width:${pct}%"></div></div>
          <div class="device-val">${d.month.toFixed(1)} kWh</div>
          <div style="font-size:11px;color:var(--bento-text-secondary);min-width:60px;text-align:right">${diffStr}</div>
        </div>`;
      }).join('')}`;
  }

  _tabSchedule() {
    const L = this._lang === 'pl';
    const recipient = this._getRecipient();
    const service = this._getNotifyService();
    const dailyId = 'automation.send_daily_energy_report';
    const weeklyId = 'automation.send_weekly_energy_report';
    const monthlyId = 'automation.send_monthly_energy_report';
    const dailyState = this._state(dailyId, 'missing');
    const weeklyState = this._state(weeklyId, 'missing');
    const monthlyState = this._state(monthlyId, 'missing');
    const exists = (s) => s !== 'missing' && s !== 'unavailable';
    const badge = (state) => {
      if (state === 'on') return '<span class="badge badge-ok">\u2705 Active</span>';
      if (state === 'off') return '<span class="badge badge-er">\u274C Disabled</span>';
      return '<span class="badge badge-wa">\u2795 ' + (L ? 'Nie utworzony' : 'Not Created') + '</span>';
    };
    const recipientInfo = recipient ? `\u{1F4E7} ${recipient}` : (service ? `\u{1F4E7} via notify.${service}` : `\u{1F4E7} <i>${L ? 'Brak — ustaw email powy\u017Cej' : 'None — set email above'}</i>`);
    const sd = this._scheduleDefaults;
    const dayNames = L
      ? { mon: 'Poniedzia\u0142ek', tue: 'Wtorek', wed: '\u015Aroda', thu: 'Czwartek', fri: 'Pi\u0105tek', sat: 'Sobota', sun: 'Niedziela' }
      : { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
    const dayOptions = Object.entries(dayNames).map(([k, v]) => `<option value="${k}" ${sd.weekly_day === k ? 'selected' : ''}>${v}</option>`).join('');
    const weeklyDayLabel = dayNames[sd.weekly_day] || dayNames.mon;
    const scheduleCard = (icon, nameL, nameE, state, timeLabel, enableId, disableId, createId, timeInputId, timeValue, extraInputHtml) => {
      const name = L ? nameL : nameE;
      const ex = exists(state);
      return `<div class="schedule-card">
        <div class="schedule-row"><div class="schedule-name">${icon} ${name}</div>${badge(state)}</div>
        <div class="schedule-meta"><span>\u{1F552} ${timeLabel}</span><span>${recipientInfo}</span></div>
        <div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap">
          <label style="font-size:12px;color:var(--bento-text-secondary);font-weight:500">${L ? 'Godzina' : 'Time'}:</label>
          <input type="time" id="${timeInputId}" value="${timeValue}" style="padding:5px 10px;border:1.5px solid var(--bento-border);border-radius:var(--bento-radius-xs);font-size:13px;background:var(--bento-card);color:var(--bento-text);font-family:'Inter',sans-serif;">
          ${extraInputHtml || ''}
        </div>
        <div class="btn-row">
          ${ex ? (state === 'on'
            ? `<button class="btn btn-ok" id="${disableId}">${L ? 'Wy\u0142\u0105cz' : 'Disable'}</button><button class="btn" id="update-${createId}">\u{1F504} ${L ? 'Aktualizuj' : 'Update'}</button>`
            : `<button class="btn btn-primary" id="${enableId}">${L ? 'W\u0142\u0105cz' : 'Enable'}</button><button class="btn" id="update-${createId}">\u{1F504} ${L ? 'Aktualizuj' : 'Update'}</button>`)
            : `<button class="btn btn-primary" id="${createId}">\u2795 ${L ? 'Utw\u00F3rz automatyzacj\u0119' : 'Create Automation'}</button>`}
        </div>
      </div>`;
    };
    return `
      ${this._renderSmtpSection()}
      ${!recipient && !service ? `<div class="info-row info-warn">\u26A0\uFE0F\u00A0 ${L
        ? '<b>Brak adresu email.</b> Ustaw email w polu powy\u017Cej lub skonfiguruj serwis notify z SMTP.'
        : '<b>No email recipient.</b> Set email in the field above or configure an SMTP notify service.'}</div>` : ''}
      ${scheduleCard(
        '\u2600\uFE0F', 'Raport dzienny', 'Daily Report', dailyState,
        `${L ? 'Codziennie o' : 'Every day at'} ${sd.daily}`,
        'enable-daily', 'disable-daily', 'create-daily', 'time-daily', sd.daily, ''
      )}
      ${scheduleCard(
        '\u{1F4C6}', 'Raport tygodniowy', 'Weekly Report', weeklyState,
        `${weeklyDayLabel} ${L ? 'o' : 'at'} ${sd.weekly_time}`,
        'enable-weekly', 'disable-weekly', 'create-weekly', 'time-weekly', sd.weekly_time,
        `<label style="font-size:12px;color:var(--bento-text-secondary);font-weight:500;margin-left:8px">${L ? 'Dzie\u0144' : 'Day'}:</label>
         <select id="day-weekly" style="padding:5px 10px;border:1.5px solid var(--bento-border);border-radius:var(--bento-radius-xs);font-size:13px;background:var(--bento-card);color:var(--bento-text);font-family:'Inter',sans-serif">${dayOptions}</select>`
      )}
      ${scheduleCard(
        '\u{1F4C8}', 'Raport miesi\u0119czny', 'Monthly Report', monthlyState,
        `${L ? '1. dzie\u0144 miesi\u0105ca o' : '1st of month at'} ${sd.monthly_time}`,
        'enable-monthly', 'disable-monthly', 'create-monthly', 'time-monthly', sd.monthly_time, ''
      )}
      <div style="margin-top:12px;padding:12px 16px;background:rgba(59,130,246,0.08);border-left:3px solid var(--bento-primary,#3B82F6);border-radius:6px;font-size:13px;color:var(--bento-text);">
        <strong>\u2139\uFE0F ${L ? 'Info' : 'Info'}:</strong> ${L
          ? 'Ustawienia (email, serwis, godziny) s\u0105 zapisywane w Home Assistant i dzia\u0142aj\u0105 na ka\u017Cdym urz\u0105dzeniu.'
          : 'Settings (email, service, times) are stored in Home Assistant and work across all your devices.'}
      </div>`;
  }

  _tabPreview() {
    const L = this._lang === 'pl';
    if (!this._discoveryDone) {
      return `<div class="empty-state"><div class="big"><span class="spinner" style="width:32px;height:32px;border-width:3px;border-color:var(--bento-primary);border-top-color:transparent;"></span></div><div class="title">${L ? '\u0141adowanie danych...' : 'Loading data...'}</div></div>`;
    }
    const devices = this._devices();
    const autoDevices = this._discoveredDevices || [];
    const isAuto = devices.length === 0 && autoDevices.length > 0;
    const today = new Date().toISOString().split('T')[0];
    const recipient = this._getRecipient();
    const service = this._getNotifyService();
    const recipientLine = recipient || (service ? `notify.${service}` : '—');
    const periods = [
      { key: 'day', icon: '\u2600\uFE0F', titleL: 'Raport dzienny', titleE: 'Daily Report', rangeL: 'Ostatnie 24h', rangeE: 'Last 24h' },
      { key: 'week', icon: '\u{1F4C6}', titleL: 'Raport tygodniowy', titleE: 'Weekly Report', rangeL: 'Ostatnie 7 dni', rangeE: 'Last 7 days' },
      { key: 'month', icon: '\u{1F4C8}', titleL: 'Raport miesi\u0119czny', titleE: 'Monthly Report', rangeL: 'Ostatnie 30 dni', rangeE: 'Last 30 days' },
    ];
    const getDevData = (period) => {
      if (devices.length > 0) {
        return devices.map(d => {
          let current = 0, previous = 0, cost = 0;
          if (period === 'day') { current = this._float(this._state(d.energy_day || d.energy_week, '0')); cost = current * this._getAvgRate(); }
          else if (period === 'month') { current = this._float(this._state(d.energy_month, '0')); previous = this._float(this._state(d.energy_last_month, '0')); cost = this._float(this._state(d.cost_month || d.cost_week, '0')); }
          else { current = this._float(this._state(d.energy_week, '0')); previous = this._float(this._state(d.energy_last_week, '0')); cost = this._float(this._state(d.cost_week, '0')); }
          return { name: d.name, current, previous, cost };
        }).sort((a, b) => b.current - a.current);
      }
      try { var periodData = this._getAutoDataForPeriod(period); } catch(e) { var periodData = []; }
      if (periodData && periodData.length > 0 && periodData.some(d => d.month > 0)) {
        return periodData.map(d => ({ name: d.name, current: d.month, previous: d.lastMonth || 0, cost: d.cost || d.month * this._getAvgRate(), hasPeriod: true })).sort((a, b) => b.current - a.current);
      }
      return autoDevices.map(d => ({ name: d.name, current: d.value_kwh, previous: 0, cost: d.value_kwh * this._getAvgRate(), hasPeriod: false })).sort((a, b) => b.current - a.current);
    };
    const renderReport = (p) => {
      const title = L ? p.titleL : p.titleE;
      const range = L ? p.rangeL : p.rangeE;
      const devData = getDevData(p.key);
      const totalEnergy = devData.reduce((s, d) => s + d.current, 0);
      const totalCost = devData.reduce((s, d) => s + d.cost, 0);
      const top5 = devData.slice(0, 5);
      const isPeriodData = devData.length > 0 && devData[0].hasPeriod;
      const periodNote = !isPeriodData && isAuto ? `<div style="font-size:11px;color:var(--bento-text-secondary);margin-bottom:6px;font-style:italic">\u26A0 ${L ? 'Brak sensor\u00F3w dla tego okresu \u2014 pokazano dane total' : 'No period-specific sensors found \u2014 showing total data'}</div>` : '';
      return `<div class="preview-box" style="margin-bottom:14px">
        <h3 style="margin:0 0 8px">${p.icon} ${title} \u2013 ${today}</h3>
        ${periodNote}
        <div style="font-size:12px;color:var(--bento-text-secondary);margin-bottom:10px">\u{1F4E7} ${recipientLine} \u00A0\u2022\u00A0 ${range} \u00A0\u2022\u00A0 ${devData.length} ${L ? 'urz.' : 'dev.'}</div>
        <div style="display:flex;gap:16px;margin-bottom:10px;flex-wrap:wrap">
          <div><span style="font-size:18px;font-weight:700;color:#F59E0B">${totalEnergy.toFixed(1)}</span> <span style="font-size:11px;color:var(--bento-text-secondary)">kWh</span></div>
          <div><span style="font-size:18px;font-weight:700;color:#3B82F6">${totalCost.toFixed(2)}</span> <span style="font-size:11px;color:var(--bento-text-secondary)">${this._config.currency}</span></div>
        </div>
        <table class="preview-table">
          <thead><tr><th>${L ? 'Urz\u0105dzenie' : 'Device'}</th><th>kWh</th><th>${L ? 'Koszt' : 'Cost'} (${this._config.currency})</th></tr></thead>
          <tbody>${top5.map(d => `<tr><td>${d.name}</td><td>${d.current.toFixed(2)}</td><td>${d.cost.toFixed(2)}</td></tr>`).join('')}
          ${devData.length > 5 ? `<tr><td colspan="3" style="text-align:center;color:var(--bento-text-secondary);font-size:11px">+ ${devData.length - 5} ${L ? 'wi\u0119cej urz\u0105dze\u0144' : 'more devices'}...</td></tr>` : ''}</tbody>
        </table>
      </div>`;
    };
    return `
      ${isAuto ? `<div class="info-row">\u{1F50D}\u00A0 ${L ? 'Auto-discovery: dane z sensor\u00F3w total.' : 'Auto-discovery: showing total sensor data.'}</div>` : ''}
      <div class="section-title" style="margin-top:0">\u{1F4CB} ${L ? 'Podgl\u0105d raport\u00F3w email' : 'Email Report Previews'}</div>
      ${periods.map(p => renderReport(p)).join('')}
      <div style="font-size:11px;color:var(--bento-text-secondary);margin-top:4px">${L ? 'Podgl\u0105d tre\u015Bci emaila. Rzeczywisty email zawiera pe\u0142n\u0105 tabel\u0119 HTML.' : 'Preview of email content. Actual email contains full HTML table.'}</div>`;
  }

  _tabSend() {
    const L = this._lang === 'pl';
    const service = this._getNotifyService();
    return `
      <div class="info-row">\u{1F4E4}\u00A0 ${L ? 'R\u0119cznie wy\u015Blij raport energii via <b>notify.' + (service || 'email_report') + '</b>.' : 'Manually trigger an energy report via <b>notify.' + (service || 'email_report') + '</b>.'}</div>
      ${!service ? `<div class="info-row info-warn">\u26A0\uFE0F\u00A0 ${L ? '<b>Nie wykryto serwisu email.</b> Skonfiguruj SMTP w zak\u0142adce Schedule.' : '<b>No email service detected.</b> Configure SMTP in the Schedule tab.'}</div>` : ''}
      <div class="schedule-card">
        <div class="schedule-row"><div class="schedule-name">\u2600\uFE0F ${L ? 'Wy\u015Blij raport dzienny' : 'Send Daily Report Now'}</div><span class="badge badge-pr">Manual</span></div>
        <div id="last-daily" class="last-sent">${this._lastSent.daily ? 'Last sent: ' + this._lastSent.daily : ''}</div>
        <div class="btn-row"><button class="btn btn-primary" id="send-daily" ${this._sending ? 'disabled' : ''}>${this._sending ? '<span class="spinner"></span>Sending...' : '\u2600\uFE0F Send Daily'}</button></div>
      </div>
      <div class="schedule-card">
        <div class="schedule-row"><div class="schedule-name">\u{1F4C6} ${L ? 'Wy\u015Blij raport tygodniowy' : 'Send Weekly Report Now'}</div><span class="badge badge-pr">Manual</span></div>
        <div id="last-weekly" class="last-sent">${this._lastSent.weekly ? 'Last sent: ' + this._lastSent.weekly : ''}</div>
        <div class="btn-row"><button class="btn btn-primary" id="send-weekly" ${this._sending ? 'disabled' : ''}>${this._sending ? '<span class="spinner"></span>Sending...' : '\u{1F4E4} Send Weekly'}</button></div>
      </div>
      <div class="schedule-card">
        <div class="schedule-row"><div class="schedule-name">\u{1F4C8} ${L ? 'Wy\u015Blij raport miesi\u0119czny' : 'Send Monthly Report Now'}</div><span class="badge badge-pr">Manual</span></div>
        <div id="last-monthly" class="last-sent">${this._lastSent.monthly ? 'Last sent: ' + this._lastSent.monthly : ''}</div>
        <div class="btn-row"><button class="btn btn-primary" id="send-monthly" ${this._sending ? 'disabled' : ''}>${this._sending ? '<span class="spinner"></span>Sending...' : '\u{1F4C8} Send Monthly'}</button></div>
      </div>
      <div class="schedule-card">
        <div class="schedule-row"><div class="schedule-name">\u{1F4E7} ${L ? 'Szybkie podsumowanie' : 'Quick Summary'}</div><span class="badge badge-ok">Instant</span></div>
        <div class="schedule-meta">${L ? 'Tekstowe podsumowanie aktualnych danych energii.' : 'Plain-text summary of current energy stats.'}</div>
        <div id="last-quick" class="last-sent">${this._lastSent.quick ? 'Last sent: ' + this._lastSent.quick : ''}</div>
        <div class="btn-row"><button class="btn btn-ok" id="send-quick" ${this._sending || !service ? 'disabled' : ''}>\u26A1 ${L ? 'Wy\u015Blij' : 'Send Quick Summary'}</button></div>
      </div>`;
  }

  _attachSendEvents() {
    const root = this.shadowRoot;
    const sendDaily = root.getElementById('send-daily');
    const sendWeekly = root.getElementById('send-weekly');
    const sendMonthly = root.getElementById('send-monthly');
    const sendQuick = root.getElementById('send-quick');
    if (sendDaily) sendDaily.addEventListener('click', () => this._sendReport('daily'));
    if (sendWeekly) sendWeekly.addEventListener('click', () => this._sendReport('weekly'));
    if (sendMonthly) sendMonthly.addEventListener('click', () => this._sendReport('monthly'));
    if (sendQuick) sendQuick.addEventListener('click', () => this._sendReport('quick'));
  }

  _tabConfig() {
    const L = this._lang === 'pl';
    const allDevices = this._discoveredDevices || [];
    const manual = this._devices();
    const isAuto = manual.length === 0 && allDevices.length > 0;
    const devices = isAuto
      ? allDevices.map(d => ({ key: d.key || d.entity_id, name: d.name, value: d.value_kwh, entity_id: d.entity_id }))
      : manual.map(d => ({ key: d.name, name: d.name, value: this._float(this._state(d.energy_month || d.energy_week, '0')), entity_id: '' }));
    devices.sort((a, b) => a.name.localeCompare(b.name));
    const excluded = this._excludedDevices;
    const enabledCount = devices.filter(d => !excluded.has(d.key)).length;

    const recipient = this._getRecipient();
    const service = this._getNotifyService();
    const price = this._getAvgRate();
    const currency = this._config.currency || 'PLN';

    return `
      <div class="config-section">
        <div class="config-section-title">\u{1F4E7} ${L ? 'Ustawienia email' : 'Email Settings'}</div>
        <div class="config-input-row">
          <label>${L ? 'Odbiorca' : 'Recipient'}:</label>
          <input type="email" id="cfg-email" class="config-input" value="${recipient}" placeholder="your@email.com" style="flex:1">
          <button class="btn btn-primary" id="cfg-email-save" style="padding:6px 14px;font-size:12px">${L ? 'Zapisz' : 'Save'}</button>
        </div>
        <div class="config-input-row">
          <label>${L ? 'Stawka' : 'Price'}:</label>
          <input type="number" id="cfg-price" class="config-input" value="${price}" step="0.01" min="0" style="width:80px">
          <span style="font-size:12px;color:var(--bento-text-secondary)">${currency}/kWh</span>
          <button class="btn btn-primary" id="cfg-price-save" style="padding:6px 14px;font-size:12px">${L ? 'Zapisz' : 'Save'}</button>
        </div>
      </div>

      <div class="config-section">
        <div class="config-section-title">\u{1F50C} ${L ? 'Urz\u0105dzenia w raportach' : 'Devices in Reports'} <span class="device-count">(${enabledCount}/${devices.length} ${L ? 'aktywnych' : 'active'})</span></div>
        <div style="margin-bottom:10px;display:flex;gap:8px">
          <button class="btn" id="cfg-select-all" style="font-size:11px;padding:4px 12px">${L ? 'Zaznacz wszystkie' : 'Select All'}</button>
          <button class="btn" id="cfg-deselect-all" style="font-size:11px;padding:4px 12px">${L ? 'Odznacz wszystkie' : 'Deselect All'}</button>
        </div>
        <div style="max-height:350px;overflow-y:auto;border:1px solid var(--bento-border);border-radius:var(--bento-radius-sm);padding:4px">
          ${devices.map(d => {
            const checked = !excluded.has(d.key);
            return `<div class="device-toggle">
              <div class="toggle-switch">
                <input type="checkbox" id="dev-${d.key}" data-key="${d.key}" ${checked ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </div>
              <label for="dev-${d.key}">${d.name}</label>
              <div class="dt-val">${d.value.toFixed(1)} kWh</div>
            </div>`;
          }).join('')}
          ${devices.length === 0 ? `<div style="text-align:center;padding:20px;color:var(--bento-text-secondary);font-size:13px">${L ? 'Brak wykrytych urz\u0105dze\u0144' : 'No devices detected'}</div>` : ''}
        </div>
      </div>

      <div class="config-section">
        <div class="config-section-title">\u{1F4BE} ${L ? 'Zapis ustawie\u0144' : 'Storage Info'}</div>
        <div style="font-size:12px;color:var(--bento-text-secondary);line-height:1.8">
          ${this._helpersReady
            ? `\u2705 ${L ? 'Ustawienia zapisywane w Home Assistant (input_text helpers). Dzia\u0142a na ka\u017Cdym urz\u0105dzeniu.' : 'Settings stored in Home Assistant (input_text helpers). Works across all devices.'}`
            : `\u26A0\uFE0F ${L ? 'Helpery HA niedost\u0119pne. Ustawienia zapisywane lokalnie w przegl\u0105darce.' : 'HA helpers unavailable. Settings saved locally in browser.'}`}
        </div>
      </div>`;
  }

  _attachConfigEvents() {
    const root = this.shadowRoot;
    // Email save
    const emailSave = root.getElementById('cfg-email-save');
    if (emailSave) emailSave.addEventListener('click', () => {
      const input = root.getElementById('cfg-email');
      if (input && input.value && input.value.includes('@')) {
        this._saveRecipient(input.value.trim());
        this._showToast('\u2705 ' + (this._lang === 'pl' ? 'Email zapisany' : 'Email saved'));
      }
    });
    // Price save
    const priceSave = root.getElementById('cfg-price-save');
    if (priceSave) priceSave.addEventListener('click', () => {
      const input = root.getElementById('cfg-price');
      const val = parseFloat(input?.value);
      if (!isNaN(val) && val > 0) {
        this._config.energy_price = val;
        this._saveToHelper('price', String(val));
        this._showToast('\u2705 ' + (this._lang === 'pl' ? 'Stawka zapisana' : 'Price saved'));
        this._render();
      }
    });
    // Device toggles
    root.querySelectorAll('.device-toggle input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const key = cb.dataset.key;
        if (cb.checked) {
          this._excludedDevices.delete(key);
        } else {
          this._excludedDevices.add(key);
        }
        this._saveExcludedDevices();
        // Update count
        const countEl = root.querySelector('.device-count');
        if (countEl) {
          const total = root.querySelectorAll('.device-toggle input').length;
          const active = root.querySelectorAll('.device-toggle input:checked').length;
          const L = this._lang === 'pl';
          countEl.textContent = `(${active}/${total} ${L ? 'aktywnych' : 'active'})`;
        }
      });
    });
    // Select/Deselect all
    const selectAll = root.getElementById('cfg-select-all');
    const deselectAll = root.getElementById('cfg-deselect-all');
    if (selectAll) selectAll.addEventListener('click', () => {
      this._excludedDevices.clear();
      this._saveExcludedDevices();
      this._renderTab();
    });
    if (deselectAll) deselectAll.addEventListener('click', () => {
      root.querySelectorAll('.device-toggle input[type="checkbox"]').forEach(cb => {
        this._excludedDevices.add(cb.dataset.key);
      });
      this._saveExcludedDevices();
      this._renderTab();
    });
  }

  _saveExcludedDevices() {
    const list = [...this._excludedDevices].join(',');
    this._saveToHelper('excluded', list);
  }

  _attachScheduleEvents() {
    const root = this.shadowRoot;
    const btnSmtpTest = root.getElementById('btn-smtp-test');
    if (btnSmtpTest) { const svc = this._getNotifyService(); btnSmtpTest.addEventListener('click', () => this._testSmtp(svc)); }
    root.querySelectorAll('.svc-select-btn').forEach(btn => {
      btn.addEventListener('click', () => { this._saveService(btn.dataset.svc); });
    });
    root.querySelectorAll('.smtp-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const yamlEl = root.getElementById('smtp-yaml');
        if (yamlEl) yamlEl.textContent = this._smtpYaml(btn.dataset.preset);
        root.querySelectorAll('.smtp-preset-btn').forEach(b => b.style.fontWeight = 'normal');
        btn.style.fontWeight = '700';
      });
    });
    const btnCopy = root.getElementById('btn-copy-yaml');
    if (btnCopy) {
      btnCopy.addEventListener('click', () => {
        const yamlEl = root.getElementById('smtp-yaml');
        if (yamlEl) {
          navigator.clipboard.writeText(yamlEl.textContent).then(() => {
            btnCopy.textContent = '\u2705 Copied!';
            setTimeout(() => { btnCopy.textContent = '\uD83D\uDCCB Copy YAML'; }, 2000);
          }).catch(() => {
            const range = document.createRange(); range.selectNodeContents(yamlEl);
            const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
            btnCopy.textContent = '\u2705 Selected \u2014 Ctrl+C';
            setTimeout(() => { btnCopy.textContent = '\uD83D\uDCCB Copy YAML'; }, 3000);
          });
        }
      });
    }
    // Time inputs — save on change
    const timeInputs = [
      ['time-daily', 'daily_time', 'daily'],
      ['time-weekly', 'weekly_time', 'weekly_time'],
      ['time-monthly', 'monthly_time', 'monthly_time'],
    ];
    timeInputs.forEach(([id, helperKey, schedKey]) => {
      const input = root.getElementById(id);
      if (input) input.addEventListener('change', () => {
        this._scheduleDefaults[schedKey] = input.value;
        this._saveToHelper(helperKey, input.value);
        this._showToast('\u2705 ' + (this._lang === 'pl' ? 'Godzina zapisana' : 'Time saved'));
      });
    });
    const daySelect = root.getElementById('day-weekly');
    if (daySelect) daySelect.addEventListener('change', () => {
      this._scheduleDefaults.weekly_day = daySelect.value;
      this._saveToHelper('weekly_day', daySelect.value);
      this._showToast('\u2705 ' + (this._lang === 'pl' ? 'Dzie\u0144 zapisany' : 'Day saved'));
    });
    // Enable/disable existing automations
    const ids = [['enable-daily','disable-daily','automation.send_daily_energy_report'],['enable-weekly','disable-weekly','automation.send_weekly_energy_report'],['enable-monthly','disable-monthly','automation.send_monthly_energy_report']];
    ids.forEach(([en,dis,eid]) => {
      const eBtn = root.getElementById(en); const dBtn = root.getElementById(dis);
      if (eBtn) eBtn.addEventListener('click', () => this._toggleAuto(eid, true));
      if (dBtn) dBtn.addEventListener('click', () => this._toggleAuto(eid, false));
    });
    // Create automation buttons
    const createBtns = [
      ['create-daily', 'daily'],
      ['create-weekly', 'weekly'],
      ['create-monthly', 'monthly'],
    ];
    createBtns.forEach(([id, type]) => {
      const btn = root.getElementById(id);
      if (btn) btn.addEventListener('click', () => this._createAutomation(type));
    });
    // Update automation buttons
    const updateBtns = [
      ['update-create-daily', 'daily'],
      ['update-create-weekly', 'weekly'],
      ['update-create-monthly', 'monthly'],
    ];
    updateBtns.forEach(([id, type]) => {
      const btn = root.getElementById(id);
      if (btn) btn.addEventListener('click', () => this._createAutomation(type, true));
    });
  }

  // --- Automation creation ---

  async _createAutomation(type, update = false) {
    if (!this._hass) return;
    const service = this._getNotifyService();
    const recipient = this._getRecipient();
    if (!service) { this._showToast('\u274C ' + (this._lang === 'pl' ? 'Najpierw skonfiguruj SMTP' : 'Configure SMTP first')); return; }
    if (!recipient) { this._showToast('\u274C ' + (this._lang === 'pl' ? 'Najpierw ustaw adres email' : 'Set email address first')); return; }
    const sd = this._scheduleDefaults;
    const L = this._lang === 'pl';
    const [dailyH, dailyM] = sd.daily.split(':').map(Number);
    const [weeklyH, weeklyM] = sd.weekly_time.split(':').map(Number);
    const [monthlyH, monthlyM] = sd.monthly_time.split(':').map(Number);
    const dayMap = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 };
    const configs = {
      daily: {
        alias: 'Send Daily Energy Report',
        id: 'send_daily_energy_report',
        trigger: [{ platform: 'time', at: `${String(dailyH).padStart(2,'0')}:${String(dailyM).padStart(2,'0')}:00` }],
        description: 'Auto-created by HA Energy Email card'
      },
      weekly: {
        alias: 'Send Weekly Energy Report',
        id: 'send_weekly_energy_report',
        trigger: [{ platform: 'time', at: `${String(weeklyH).padStart(2,'0')}:${String(weeklyM).padStart(2,'0')}:00` }],
        condition: [{ condition: 'time', weekday: [['sun','mon','tue','wed','thu','fri','sat'][dayMap[sd.weekly_day] || 1]] }],
        description: 'Auto-created by HA Energy Email card'
      },
      monthly: {
        alias: 'Send Monthly Energy Report',
        id: 'send_monthly_energy_report',
        trigger: [{ platform: 'time', at: `${String(monthlyH).padStart(2,'0')}:${String(monthlyM).padStart(2,'0')}:00` }],
        condition: [{ condition: 'template', value_template: '{{ now().day == 1 }}' }],
        description: 'Auto-created by HA Energy Email card'
      }
    };
    const cfg = configs[type];
    if (!cfg) return;
    // Build email with actual sensor data via Jinja templates
    const price = this._getAvgRate();
    const currency = this._config.currency || 'PLN';
    const typeName = type.charAt(0).toUpperCase() + type.slice(1);
    const periodMap = { daily: 'day', weekly: 'week', monthly: 'month' };
    const periodKey = periodMap[type] || 'day';
    // Get sensor list: prefer period-specific sensors, fallback to total
    let sensorList = [];
    const periodData = this._getAutoDataForPeriod(periodKey);
    if (periodData && periodData.length > 0) {
      sensorList = periodData.map(d => ({ name: d.name, entity: d.entity_id }));
    } else {
      const autoDevs = this._discoveredDevices || [];
      const manualDevs = this._devices();
      if (manualDevs.length > 0) {
        const sensorKey = type === 'daily' ? 'energy_day' : type === 'weekly' ? 'energy_week' : 'energy_month';
        sensorList = manualDevs.map(d => ({ name: d.name, entity: d[sensorKey] || d.energy_week || d.energy_month })).filter(d => d.entity);
      } else {
        sensorList = autoDevs.map(d => ({ name: d.name, entity: d.entity_id }));
      }
    }
    // Build Jinja template for the email body
    const sensorLines = sensorList.map(s =>
      `{{ '${s.name}' }}: {{ states('${s.entity}') | float(0) | round(2) }} kWh = {{ (states('${s.entity}') | float(0) * ${price}) | round(2) }} ${currency}`
    ).join('\\n');
    const totalExpr = sensorList.map(s => `states('${s.entity}') | float(0)`).join(' + ');
    const totalCostExpr = `(${totalExpr}) * ${price}`;
    const periodLabel = type === 'daily' ? (L ? 'Wczoraj / ostatnie 24h' : 'Yesterday / Last 24h')
      : type === 'weekly' ? (L ? 'Ostatnie 7 dni' : 'Last 7 days')
      : (L ? 'Ostatni miesi\u0105c' : 'Last month');
    const emailMsg = [
      `\u26A1 Energy ${typeName} Report`,
      `{{ now().strftime('%Y-%m-%d %H:%M') }}`,
      `${L ? 'Okres' : 'Period'}: ${periodLabel}`,
      `${L ? 'Urz\u0105dze\u0144' : 'Devices'}: ${sensorList.length}`,
      ``,
      `${L ? '\u0141\u0105cznie' : 'Total'}: {{ (${totalExpr}) | round(2) }} kWh = {{ (${totalCostExpr}) | round(2) }} ${currency}`,
      ``,
      `${L ? 'Szczeg\u00F3\u0142y' : 'Details'}:`,
      sensorLines,
      ``,
      `---`,
      `Generated by HA Energy Email card | ${this._getTariffLabel()}`
    ].join('\\n');
    const action = [{
      service: `notify.${service}`,
      data: {
        title: `\u26A1 Energy ${typeName} Report \u2013 {{ now().strftime('%Y-%m-%d') }}`,
        message: emailMsg,
        target: recipient
      }
    }];
    try {
      if (update) {
        // Delete old automation first, then create new
        try { await this._hass.callService('automation', 'turn_off', { entity_id: `automation.${cfg.id}` }); } catch(e) {}
      }
      await this._hass.callWS({
        type: 'config/automation/config',
        automation_id: cfg.id,
        ...cfg,
        action: action,
        mode: 'single'
      });
      this._showToast(`\u2705 ${update ? (L ? 'Automatyzacja zaktualizowana' : 'Automation updated') : (L ? 'Automatyzacja utworzona' : 'Automation created')}!`);
      // Wait for HA to register the automation, then refresh
      setTimeout(() => this._renderTab(), 2000);
    } catch (e) {
      this._showToast('\u274C Error: ' + (e.message || 'Failed to create automation'));
    }
  }

  // --- HA service calls ---

  async _toggleAuto(entity_id, enable) {
    if (!this._hass) return;
    try {
      await this._hass.callService('automation', enable ? 'turn_on' : 'turn_off', { entity_id });
      this._showToast(`\u2705 Automation ${enable ? 'enabled' : 'disabled'}`);
      setTimeout(() => this._renderTab(), 800);
    } catch (e) { this._showToast('\u274C Error: ' + (e.message || 'Unknown error')); }
  }

  async _sendReport(type) {
    if (!this._hass || this._sending) return;
    this._sending = true;
    this._renderTab(); this._attachSendEvents();
    const L = this._lang === 'pl';
    const svc = this._getNotifyService();
    const recipient = this._getRecipient();
    const price = this._getAvgRate();
    const currency = this._config.currency || 'PLN';
    const dateStr = new Date().toISOString().split('T')[0];
    const nowStr = new Date().toLocaleString('pl-PL', { hour12: false });
    try {
      if (!svc) throw new Error(L ? 'Nie znaleziono serwisu email' : 'No email service found');
      // Get device data — fetch from recorder for period reports
      const periodMap = { daily: 'day', weekly: 'week', monthly: 'month', quick: 'week' };
      const periodKey = periodMap[type] || 'week';
      const periodLabels = {
        daily: L ? 'Ostatnie 24h' : 'Last 24 hours',
        weekly: L ? 'Ostatnie 7 dni' : 'Last 7 days',
        monthly: L ? 'Ostatnie 30 dni' : 'Last 30 days',
        quick: L ? 'Podsumowanie' : 'Summary'
      };
      // Fetch fresh recorder stats
      await this._fetchRecorderStats(periodKey);
      let devices = [];
      const cached = this[`_periodCache_${periodKey}`];
      if (cached && cached.length > 0) {
        devices = this._filterExcluded(cached).sort((a, b) => b.month - a.month);
      } else {
        // Fallback to total data
        const auto = this._discoveredDevices || [];
        const manual = this._devices();
        if (manual.length > 0) {
          devices = manual.map(d => ({ name: d.name, month: this._float(this._state(d.energy_month || d.energy_week, '0')), cost: this._float(this._state(d.cost_month || d.cost_week, '0')) }));
        } else {
          devices = this._filterExcluded(auto.map(d => ({ name: d.name, month: d.value_kwh, cost: d.value_kwh * price }))).sort((a, b) => b.month - a.month);
        }
      }
      if (devices.length === 0) throw new Error(L ? 'Brak danych o energii' : 'No energy data available');
      const totalKwh = devices.reduce((s, d) => s + (d.month || 0), 0);
      const totalCost = devices.reduce((s, d) => s + (d.cost || d.month * price), 0);
      const topDevice = devices[0];
      // Build HTML email
      const typeName = { daily: L ? 'Dzienny' : 'Daily', weekly: L ? 'Tygodniowy' : 'Weekly', monthly: L ? 'Miesi\u0119czny' : 'Monthly', quick: L ? 'Podsumowanie' : 'Summary' }[type] || type;
      const deviceRows = devices.map((d, i) => {
        const kwh = (d.month || 0).toFixed(2);
        const cost = (d.cost || d.month * price).toFixed(2);
        const pct = totalKwh > 0 ? ((d.month / totalKwh) * 100).toFixed(0) : 0;
        const bg = i % 2 === 0 ? '#f8fafc' : '#ffffff';
        return `<tr style="background:${bg}"><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:14px">${d.name}</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600">${kwh}</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;text-align:right">${cost}</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;text-align:right;color:#64748b">${pct}%</td></tr>`;
      }).join('');
      const html = `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
        <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:24px 28px;color:#fff">
          <h1 style="margin:0;font-size:22px;font-weight:700">\u26A1 ${L ? 'Raport energii' : 'Energy Report'} \u2014 ${typeName}</h1>
          <p style="margin:6px 0 0;opacity:.85;font-size:14px">${dateStr} \u2022 ${periodLabels[type]} \u2022 ${devices.length} ${L ? 'urz.' : 'dev.'}</p>
        </div>
        <div style="padding:20px 28px">
          <div style="display:flex;gap:16px;margin-bottom:20px">
            <div style="flex:1;background:#fef3c7;border-radius:10px;padding:16px;text-align:center">
              <div style="font-size:28px;font-weight:700;color:#d97706">${totalKwh.toFixed(1)}</div>
              <div style="font-size:12px;color:#92400e;margin-top:2px">kWh</div>
            </div>
            <div style="flex:1;background:#dbeafe;border-radius:10px;padding:16px;text-align:center">
              <div style="font-size:28px;font-weight:700;color:#1d4ed8">${totalCost.toFixed(2)}</div>
              <div style="font-size:12px;color:#1e40af;margin-top:2px">${currency}</div>
            </div>
            <div style="flex:1;background:#d1fae5;border-radius:10px;padding:16px;text-align:center">
              <div style="font-size:16px;font-weight:700;color:#047857">${topDevice ? topDevice.name.split(' ').slice(0,2).join(' ') : '-'}</div>
              <div style="font-size:12px;color:#065f46;margin-top:2px">${L ? 'Top' : 'Top'}: ${topDevice ? topDevice.month.toFixed(1) : 0} kWh</div>
            </div>
          </div>
          <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0">
            <thead><tr style="background:#f1f5f9">
              <th style="padding:10px 14px;text-align:left;font-size:12px;text-transform:uppercase;color:#64748b;letter-spacing:.5px">${L ? 'Urz\u0105dzenie' : 'Device'}</th>
              <th style="padding:10px 14px;text-align:right;font-size:12px;text-transform:uppercase;color:#64748b;letter-spacing:.5px">kWh</th>
              <th style="padding:10px 14px;text-align:right;font-size:12px;text-transform:uppercase;color:#64748b;letter-spacing:.5px">${currency}</th>
              <th style="padding:10px 14px;text-align:right;font-size:12px;text-transform:uppercase;color:#64748b;letter-spacing:.5px">%</th>
            </tr></thead>
            <tbody>${deviceRows}
            <tr style="background:#f1f5f9;font-weight:700">
              <td style="padding:12px 14px;font-size:14px">${L ? '\u0141\u0105cznie' : 'Total'}</td>
              <td style="padding:12px 14px;text-align:right">${totalKwh.toFixed(2)}</td>
              <td style="padding:12px 14px;text-align:right">${totalCost.toFixed(2)}</td>
              <td style="padding:12px 14px;text-align:right">100%</td>
            </tr></tbody>
          </table>
          <p style="margin:16px 0 0;font-size:11px;color:#94a3b8;text-align:center">${this._getTariffLabel()} \u2022 HA Energy Email Card</p>
        </div>
      </div>`;
      const title = `\u26A1 ${typeName} ${L ? 'raport energii' : 'Energy Report'} \u2013 ${dateStr}`;
      const plainText = `${typeName} ${L ? 'raport energii' : 'Energy Report'} - ${dateStr}\n${L ? 'Łącznie' : 'Total'}: ${totalKwh.toFixed(2)} kWh / ${totalCost.toFixed(2)} ${currency}\n${devices.map(d => `${d.name}: ${(d.month||0).toFixed(2)} kWh`).join('\n')}`;
      const svcData = { title, message: plainText, data: { html: html } };
      if (recipient) svcData.target = recipient;
      await this._hass.callService('notify', svc, svcData);
      this._lastSent[type] = nowStr;
      this._showToast(`\u2705 ${typeName} ${L ? 'wys\u0142any!' : 'sent!'}`);
    } catch (e) { this._showToast('\u274C Error: ' + (e.message || 'Check HA logs')); }
    finally { this._sending = false; this._renderTab(); this._attachSendEvents(); }
  }

  // --- SMTP Detection & Setup ---

  _detectSmtp() {
    if (!this._hass || !this._hass.services || !this._hass.services.notify) return { found: false, services: [], defaultService: null };
    const notifyServices = this._hass.services.notify;
    // Exclude known non-email services
    const nonEmailPatterns = /^(mobile_app_|google_assistant|alexa_media|lg_tv|persistent_notification$|notify$|send_message$|tts[_.]|rest[_.])/i;
    const emailPatterns = /email|smtp|mail/i;
    const emailServices = [];
    for (const [key, svc] of Object.entries(notifyServices)) {
      if (nonEmailPatterns.test(key)) continue;
      const fields = svc.fields || {};
      if (!(fields.message || fields.title)) continue;
      // Include if name/key matches email patterns, or if it has a 'target' field (SMTP-like)
      if (emailPatterns.test(key) || emailPatterns.test(svc.name || '') || fields.target) {
        emailServices.push({ service: key, name: svc.name || key, description: svc.description || '', hasTitle: !!fields.title, hasTarget: !!fields.target });
      }
    }
    const defaultService = emailServices.length > 0 ? emailServices[0].service : null;
    return { found: emailServices.length > 0, services: emailServices, defaultService };
  }

  _smtpYaml(preset) {
    const p = { gmail: { server: 'smtp.gmail.com', user: 'YOUR_EMAIL@gmail.com' }, outlook: { server: 'smtp.office365.com', user: 'YOUR_EMAIL@outlook.com' }, custom: { server: 'smtp.your-provider.com', user: 'your@email.com' } }[preset] || { server: 'smtp.gmail.com', user: 'YOUR_EMAIL@gmail.com' };
    return 'notify:\n  - name: "email_report"\n    platform: smtp\n    server: "' + p.server + '"\n    port: 587\n    encryption: starttls\n    username: "' + p.user + '"\n    password: "YOUR_APP_PASSWORD"\n    sender: "' + p.user + '"\n    sender_name: "Home Assistant"\n    recipient:\n      - "' + p.user + '"';
  }

  _renderSmtpSection() {
    const smtp = this._detectSmtp();
    const L = this._lang === 'pl';
    const currentService = this._getNotifyService();
    if (smtp.found && smtp.services.length > 0) {
      const svcList = smtp.services.map(s => `<code>notify.${s.service}</code>`).join(', ');
      const hasMultiple = smtp.services.length > 1;
      return `<div class="smtp-section">
        <div class="smtp-header"><div class="smtp-icon">\u2705</div><div>
          <div class="smtp-title">${L ? 'SMTP skonfigurowany' : 'SMTP Configured'}</div>
          <div class="smtp-detail">${L ? 'Dost\u0119pne' : 'Available'}: ${svcList}</div>
        </div></div>
        ${hasMultiple ? `<div style="margin-top:12px">
          <label style="font-size:12px;font-weight:600;color:var(--bento-text-secondary);display:block;margin-bottom:4px">${L ? 'Wybierz serwis do wysy\u0142ki' : 'Select notify service'}:</label>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            ${smtp.services.map(s => `<button class="btn svc-select-btn ${s.service === currentService ? 'btn-primary' : ''}" data-svc="${s.service}" style="font-size:12px;padding:6px 14px">notify.${s.service}</button>`).join('')}
          </div>
        </div>` : `<div class="smtp-detail" style="margin-top:8px">${L ? 'U\u017Cywany' : 'Using'}: <code>notify.${currentService || smtp.defaultService}</code></div>`}
        <div class="smtp-actions" style="margin-top:12px">
          <button class="btn btn-primary" id="btn-smtp-test">\uD83D\uDCE7 ${L ? 'Wy\u015Blij testowy email' : 'Send Test Email'}</button>
          <a class="btn" href="/config/integrations/dashboard" target="_blank" style="text-decoration:none">\u2699\uFE0F ${L ? 'Integracje' : 'Integrations'}</a>
        </div>
      </div>`;
    }
    const gmailYaml = this._smtpYaml('gmail');
    return `<div class="smtp-section smtp-missing">
      <div class="smtp-header"><div class="smtp-icon">\u26A0\uFE0F</div><div>
        <div class="smtp-title">${L ? 'SMTP nie skonfigurowany' : 'SMTP Not Configured'}</div>
        <div class="smtp-detail">${L ? 'Nie wykryto serwisu email.' : 'No email notify service detected.'}</div>
      </div></div>
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
        <a class="btn btn-primary" href="/config/integrations/dashboard/add?domain=smtp" target="_blank" style="text-decoration:none">\u26A1 ${L ? 'Dodaj integracj\u0119 SMTP' : 'Add SMTP Integration'}</a>
        <a class="btn" href="/config/integrations/dashboard" target="_blank" style="text-decoration:none">\u2699\uFE0F ${L ? 'Integracje' : 'Integrations'}</a>
      </div>
      <div class="smtp-guide">
        <div class="guide-title" style="margin-top:16px">\uD83D\uDCDD ${L ? 'Alternatywa: konfiguracja YAML' : 'Alternative: YAML config'}</div>
        <div class="guide-steps">
          <div class="guide-step"><div class="step-num">1</div><div>
            <p>${L ? 'Skopiuj YAML do' : 'Copy YAML into'} <code>configuration.yaml</code>:</p>
            <div style="display:flex;gap:6px;margin:8px 0;flex-wrap:wrap">
              <button class="btn smtp-preset-btn" data-preset="gmail" style="font-size:12px">\uD83D\uDCE7 Gmail</button>
              <button class="btn smtp-preset-btn" data-preset="outlook" style="font-size:12px">\uD83D\uDCE8 Outlook</button>
              <button class="btn smtp-preset-btn" data-preset="custom" style="font-size:12px">\u2699\uFE0F Custom</button>
            </div>
            <pre id="smtp-yaml">${gmailYaml}</pre>
            <button class="btn" id="btn-copy-yaml" style="margin-top:6px;font-size:12px">\uD83D\uDCCB Copy YAML</button>
          </div></div>
          <div class="guide-step"><div class="step-num">2</div><div>
            <p><b>Gmail</b>: <a href="https://myaccount.google.com/apppasswords" target="_blank">App Password</a>. <b>Outlook</b>: <a href="https://account.live.com/proofs/AppPassword" target="_blank">App Password</a>.</p>
          </div></div>
          <div class="guide-step"><div class="step-num">3</div><div>
            <p><a href="/developer-tools/yaml" target="_blank">Developer Tools \u2192 YAML</a> \u2192 Check & Restart.</p>
          </div></div>
        </div>
      </div>
    </div>`;
  }

  async _testSmtp(service) {
    if (!this._hass || !service) { this._showToast('\u274C No SMTP service found'); return; }
    try {
      await this._hass.callService('notify', service, { title: '\u2705 HA Energy Email \u2014 Test', message: 'Test email from HA Tools Energy Email.\n\nTimestamp: ' + new Date().toISOString() });
      this._showToast('\u2705 Test email sent via notify.' + service);
    } catch (e) { this._showToast('\u274C SMTP test failed: ' + (e.message || 'Check HA logs')); }
  }

  _showToast(msg) {
    const toast = this.shadowRoot.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
  }
}

customElements.define('ha-energy-email', HAEnergyEmail);
window.customCards = window.customCards || [];
window.customCards.push({ type: 'ha-energy-email', name: 'Energy Email Reports', description: 'Send energy reports via email. Auto-discovers energy sensors.', preview: true });

class HaEnergyEmailEditor extends HTMLElement {
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
      <h3>Energy Email Reports</h3>
            <div style="margin-bottom:12px;">
              <label style="display:block;font-weight:500;margin-bottom:4px;font-size:13px;">Title</label>
              <input type="text" id="cf_title" value="${this._config?.title || 'Energy Email Reports'}"
                style="width:100%;padding:8px 12px;border:1px solid var(--divider-color,#e2e8f0);border-radius:8px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#1e293b);font-size:14px;box-sizing:border-box;">
            </div>
            <div style="margin-bottom:12px;">
              <label style="display:block;font-weight:500;margin-bottom:4px;font-size:13px;">Currency</label>
              <input type="text" id="cf_currency" value="${this._config?.currency || 'PLN'}"
                style="width:100%;padding:8px 12px;border:1px solid var(--divider-color,#e2e8f0);border-radius:8px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#1e293b);font-size:14px;box-sizing:border-box;">
            </div>
            <div style="margin-bottom:12px;">
              <label style="display:block;font-weight:500;margin-bottom:4px;font-size:13px;">Energy price</label>
              <input type="text" id="cf_energy_price" value="${this._config?.energy_price || '0.65'}"
                style="width:100%;padding:8px 12px;border:1px solid var(--divider-color,#e2e8f0);border-radius:8px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#1e293b);font-size:14px;box-sizing:border-box;">
            </div>
    `;
        const f_title = this.shadowRoot.querySelector('#cf_title');
        if (f_title) f_title.addEventListener('input', (e) => {
          this._config = { ...this._config, title: e.target.value };
          this._dispatch();
        });
        const f_currency = this.shadowRoot.querySelector('#cf_currency');
        if (f_currency) f_currency.addEventListener('input', (e) => {
          this._config = { ...this._config, currency: e.target.value };
          this._dispatch();
        });
        const f_energy_price = this.shadowRoot.querySelector('#cf_energy_price');
        if (f_energy_price) f_energy_price.addEventListener('input', (e) => {
          this._config = { ...this._config, energy_price: e.target.value };
          this._dispatch();
        });
  }
  connectedCallback() { this._render(); }
}
if (!customElements.get('ha-energy-email-editor')) { customElements.define('ha-energy-email-editor', HaEnergyEmailEditor); }
