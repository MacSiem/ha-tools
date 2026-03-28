/**
 * HA Vacuum Water Monitor v3.0.0
 * Lovelace card for tracking vacuum cleaner water levels, history, maintenance and stats
 * Supports Roborock, Dreame, iRobot, Ecovacs, and generic vacuums
 * Multi-device | Tab navigation | Brand profiles | Auto-discovery | Maintenance scheduler
 * v3.0.0 - 2026-03-24
 */

// Brand profiles - pre-filled sensor names per brand/model
const BRAND_PROFILES = {
  'roborock_s8_maxv_ultra': {
    label: 'Roborock S8 MaxV Ultra',
    icon: '\uD83E\uDDA4',
    water_total_ml: 3000,
    vacuum_entity: 'vacuum.roborock_s8_maxv_ultra',
    water_sensor: 'sensor.roborock_water_remaining',
    water_used_input: 'input_number.roborock_water_used_ml',
    dock_error_sensor: 'sensor.roborock_s8_maxv_ultra_dock_error',
    last_session_sensor: 'sensor.roborock_water_used_last_session_2',
    last_reset_entity: 'input_datetime.roborock_last_water_reset',
    main_brush_sensor: 'sensor.roborock_s8_maxv_ultra_main_brush_time_left',
    side_brush_sensor: 'sensor.roborock_s8_maxv_ultra_side_brush_time_left',
    filter_time_sensor: 'sensor.roborock_s8_maxv_ultra_filter_time_left',
    sensor_dirty_sensor: 'sensor.roborock_s8_maxv_ultra_sensor_time_left',
    dock_brush_sensor: 'sensor.roborock_s8_maxv_ultra_dock_maintenance_brush_time_left',
    dock_strainer_sensor: 'sensor.roborock_s8_maxv_ultra_dock_strainer_time_left',
    dock_clean_water_sensor: 'binary_sensor.roborock_s8_maxv_ultra_dock_clean_water_box',
    dock_dirty_water_sensor: 'binary_sensor.roborock_s8_maxv_ultra_dock_dirty_water_box',
    water_shortage_sensor: 'binary_sensor.roborock_s8_maxv_ultra_water_shortage',
    mop_attached_sensor: 'binary_sensor.roborock_s8_maxv_ultra_mop_attached',
    mop_drying_sensor: 'binary_sensor.roborock_s8_maxv_ultra_mop_drying',
    area_sensor: 'sensor.roborock_s8_maxv_ultra_cleaning_area',
    duration_sensor: 'sensor.roborock_s8_maxv_ultra_cleaning_duration',
    last_clean_start: 'sensor.roborock_s8_maxv_ultra_last_clean_start',
    last_clean_end: 'sensor.roborock_s8_maxv_ultra_last_clean_end',
    charge_sensor: 'sensor.roborock_s8_maxv_ultra_battery',
  },
  'roborock_q7': {
    label: 'Roborock Q7',
    icon: '\uD83E\uDDA4',
    water_total_ml: 200,
    vacuum_entity: 'vacuum.roborock_q7',
    main_brush_sensor: 'sensor.roborock_q7_main_brush_time_left',
    side_brush_sensor: 'sensor.roborock_q7_side_brush_time_left',
    filter_time_sensor: 'sensor.roborock_q7_filter_time_left',
    charge_sensor: 'sensor.roborock_q7_battery',
  },
  'dreame_l20_ultra': {
    label: 'Dreame L20 Ultra',
    icon: '\uD83E\uDD16',
    water_total_ml: 4000,
    vacuum_entity: 'vacuum.dreame_l20_ultra',
    charge_sensor: 'sensor.dreame_l20_ultra_battery',
  },
  'irobot_j7': {
    label: 'iRobot j7+',
    icon: '\uD83E\uDDA4',
    water_total_ml: 0,
    vacuum_entity: 'vacuum.irobot_j7',
    charge_sensor: 'sensor.irobot_j7_battery_level',
  },
  'ecovacs': {
    label: 'Ecovacs (generic)',
    icon: '\uD83E\uDD16',
    water_total_ml: 240,
    vacuum_entity: 'vacuum.ecovacs',
  },
  'generic': {
    label: 'Generic Vacuum',
    icon: '\uD83E\uDDA4',
    water_total_ml: 0,
  },
};

// Q1/Q2: Research-based calibration profiles per robot model
// Water usage (ml/m²) and cleaning efficiency data
const CALIBRATION_DATA = {
  'roborock_s8_maxv_ultra': {
    label: 'Roborock S8 MaxV Ultra',
    tank_ml: 350,
    water_per_m2: { low: 6.5, medium: 12, high: 18, max: 24 },
    avg_area_per_charge: 250,
    mop_type: 'VibraRise 3.0 dual spinning',
    notes: 'Auto mop lifting, self-cleaning dock, hot water wash',
  },
  'roborock_s7_maxv': {
    label: 'Roborock S7 MaxV',
    tank_ml: 300,
    water_per_m2: { low: 5, medium: 10, high: 15 },
    avg_area_per_charge: 200,
    mop_type: 'Sonic mopping',
    notes: 'ReactiveAI obstacle avoidance',
  },
  'roborock_q7': {
    label: 'Roborock Q7/Q7 Max',
    tank_ml: 350,
    water_per_m2: { low: 5, medium: 9, high: 14 },
    avg_area_per_charge: 180,
    mop_type: 'Gravity mop pad',
    notes: 'Budget friendly, no mop lift',
  },
  'dreame_l20_ultra': {
    label: 'Dreame L20 Ultra',
    tank_ml: 80,
    water_per_m2: { low: 5, medium: 10, high: 16, deep: 22 },
    avg_area_per_charge: 300,
    mop_type: 'MopExtend rotating dual pads',
    notes: 'Auto refill from dock (4L tank), hot air drying, mop extend for edges',
  },
  'dreame_l10s_ultra': {
    label: 'Dreame L10s Ultra',
    tank_ml: 80,
    water_per_m2: { low: 5, medium: 9, high: 14 },
    avg_area_per_charge: 210,
    mop_type: 'Rotating dual pads',
    notes: 'Auto refill from dock (3.2L tank)',
  },
  'ecovacs_x2_omni': {
    label: 'Ecovacs Deebot X2 Omni',
    tank_ml: 80,
    water_per_m2: { low: 5, medium: 11, high: 17 },
    avg_area_per_charge: 260,
    mop_type: 'Dual rotating OZMO Turbo 2.0',
    notes: 'Square design for corners, auto-refill dock (3.5L)',
  },
  'ecovacs_t20_omni': {
    label: 'Ecovacs Deebot T20 Omni',
    tank_ml: 80,
    water_per_m2: { low: 5, medium: 10, high: 15, deep: 20 },
    avg_area_per_charge: 240,
    mop_type: 'OZMO Turbo 2.0 rotating',
    notes: 'Hot water mop washing at 55°C',
  },
  'irobot_combo_j9': {
    label: 'iRobot Roomba Combo j9+',
    tank_ml: 210,
    water_per_m2: { low: 3, medium: 6, high: 10 },
    avg_area_per_charge: 150,
    mop_type: 'Retractable pad on top',
    notes: 'Auto mop retraction onto top, self-emptying bin',
  },
  'generic': {
    label: 'Generic / Unknown',
    tank_ml: 300,
    water_per_m2: { low: 5, medium: 10, high: 15 },
    avg_area_per_charge: 150,
    mop_type: 'Standard',
    notes: 'Default estimates — adjust based on your model',
  },
};


class HAVacuumWaterMonitor extends HTMLElement {
  constructor() {
    super();
    this._lang = (navigator.language || '').startsWith('pl') ? 'pl' : 'en';
    this.attachShadow({ mode: 'open' });
    this._hass = null;
    this._config = {};
    this._lastRenderTime = 0;
    this._renderScheduled = false;
    this._firstRender = true;
    this._activeTab = 'water';
    this._activeDeviceIdx = 0;
    this._maintenanceItems = []; // custom maintenance items from localStorage
  }

  set hass(hass) {

    if (hass?.language) this._lang = hass.language.startsWith('pl') ? 'pl' : 'en';    this._hass = hass;
    if (!hass) return;
    const now = Date.now();
    if (!this._firstRender && now - this._lastRenderTime < 5000) {
      if (!this._renderScheduled) {
        this._renderScheduled = true;
        setTimeout(() => {
          this._renderScheduled = false;
          this._render();
          this._lastRenderTime = Date.now();
        }, 5000 - (now - this._lastRenderTime));
      }
      return;
    }
    this._firstRender = false;
    this._render();
    this._lastRenderTime = now;
  }

  setConfig(config) {
    if (!config) throw new Error('Configuration required');

    // Apply brand profile if specified
    let profile = {};
    if (config.brand_profile && BRAND_PROFILES[config.brand_profile]) {
      profile = { ...BRAND_PROFILES[config.brand_profile] };
    }

    this._config = {
      title: config.title || 'Vacuum Monitor',
      brand_profile: config.brand_profile || null,
      warning_threshold: config.warning_threshold || 20,
      critical_threshold: config.critical_threshold || 10,
      show_filter: config.show_filter !== false,
      show_session: config.show_session !== false,
      show_refill_button: config.show_refill_button !== false,
      show_consumables: config.show_consumables !== false,
      show_dock_status: config.show_dock_status !== false,
      show_history: config.show_history !== false,
      show_stats: config.show_stats !== false,
      default_tab: config.default_tab || 'water',
      // Merge profile + explicit config (explicit wins)
      ...profile,
      ...config,
    };

    this._activeTab = this._config.default_tab || 'water';
    this._loadMaintenanceItems();
  }

  getCardSize() { return 4; }

  _sanitize(s) { try { return decodeURIComponent(escape(s)); } catch(e) { return s; } }

  static getStubConfig() {
    return {
      title: 'Roborock S8 MaxV',
      brand_profile: 'roborock_s8_maxv_ultra',
      warning_threshold: 20,
      critical_threshold: 10,
    };
  }

  // ── PERSISTENCE ──────────────────────────────────────────────────────────

  _storageKey() {
    return 'ha-vwm-maintenance-' + (this._config.title || 'default').replace(/\s+/g, '_');
  }

  _loadMaintenanceItems() {
    try {
      const raw = localStorage.getItem(this._storageKey());
      this._maintenanceItems = raw ? JSON.parse(raw) : [];
    } catch { this._maintenanceItems = []; }
  }

  _saveMaintenanceItems() {
    try {
      localStorage.setItem(this._storageKey(), JSON.stringify(this._maintenanceItems));
    } catch {}
  }

  // ── HELPERS ───────────────────────────────────────────────────────────────

  _getStateValue(entityId) {
    if (!this._hass || !entityId) return null;
    const state = this._hass.states[entityId];
    return state ? state.state : null;
  }

  _getAttr(entityId, attr) {
    if (!this._hass || !entityId) return null;
    const state = this._hass.states[entityId];
    return state && state.attributes ? state.attributes[attr] : null;
  }

  _getDevices() {
    if (this._config.devices && Array.isArray(this._config.devices)) {
      return this._config.devices.map(d => {
        // Apply brand profile if each device specifies one
        if (d.brand_profile && BRAND_PROFILES[d.brand_profile]) {
          return { ...BRAND_PROFILES[d.brand_profile], ...d };
        }
        return d;
      });
    }
    // Single device mode
    const single = {};
    const keys = [
      'device_name','water_sensor','water_used_sensor','water_used_input','water_total_ml',
      'vacuum_entity','dock_error_sensor','filter_sensor','last_session_sensor',
      'last_reset_entity','main_brush_sensor','side_brush_sensor','filter_time_sensor',
      'sensor_dirty_sensor','dock_brush_sensor','dock_strainer_sensor',
      'dock_clean_water_sensor','dock_dirty_water_sensor','water_shortage_sensor',
      'mop_attached_sensor','mop_drying_sensor','area_sensor','duration_sensor',
      'last_clean_start','last_clean_end','charge_sensor','icon',
    ];
    keys.forEach(k => { if (this._config[k] != null) single[k] = this._config[k]; });
    if (Object.keys(single).length === 0) return [];
    single.name = single.device_name || this._config.device_name || 'Vacuum';
    return [single];
  }

  // Auto-discover vacuum entities from HA states
  _autoDiscoverVacuums() {
    if (!this._hass) return [];
    return Object.values(this._hass.states)
      .filter(s => s.entity_id.startsWith('vacuum.'))
      .map(s => ({
        entity_id: s.entity_id,
        name: (s.attributes && s.attributes.friendly_name) || s.entity_id,
        state: s.state,
        battery: s.attributes && s.attributes.battery_level,
      }));
  }

  _calcDeviceData(device) {
    const totalMl = device.water_total_ml || 0;
    let remainingL = null, percentRemaining = null, usedMl = null;

    if (totalMl > 0) {
      const waterSensorRaw = this._getStateValue(device.water_sensor);
      if (waterSensorRaw !== null && waterSensorRaw !== 'unavailable' && waterSensorRaw !== 'unknown') {
        remainingL = parseFloat(waterSensorRaw);
        usedMl = totalMl - (remainingL * 1000);
        percentRemaining = Math.max(0, Math.min(100, (remainingL * 1000 / totalMl) * 100));
      } else if (device.water_used_sensor || device.water_used_input) {
        const usedRaw = this._getStateValue(device.water_used_sensor || device.water_used_input);
        if (usedRaw !== null && usedRaw !== 'unavailable') {
          usedMl = parseFloat(usedRaw) || 0;
          remainingL = (totalMl - usedMl) / 1000;
          percentRemaining = Math.max(0, Math.min(100, (totalMl - usedMl) / totalMl * 100));
        }
      }
    }

    const dockErr = this._getStateValue(device.dock_error_sensor);
    const waterEmpty = dockErr === 'water_empty';
    const vacState = this._getStateValue(device.vacuum_entity);
    const isCleaning = vacState === 'cleaning';
    const charge = this._getStateValue(device.charge_sensor) ||
      this._getAttr(device.vacuum_entity, 'battery_level');

    let filterDays = null;
    const filterRaw = this._getStateValue(device.filter_sensor);
    if (filterRaw !== null && filterRaw !== 'unavailable') filterDays = parseFloat(filterRaw);

    let sessionMl = null;
    const sessionRaw = this._getStateValue(device.last_session_sensor);
    if (sessionRaw !== null && sessionRaw !== 'unavailable') sessionMl = parseFloat(sessionRaw);

    const lastReset = this._getStateValue(device.last_reset_entity);

    // Cleaning stats
    const areaCleaned = this._getStateValue(device.area_sensor);
    const durationSec = this._getStateValue(device.duration_sensor);
    const lastCleanStart = this._getStateValue(device.last_clean_start);
    const lastCleanEnd = this._getStateValue(device.last_clean_end);

    const _parseHours = (sensor) => {
      const raw = this._getStateValue(sensor);
      if (raw === null || raw === 'unavailable' || raw === 'unknown') return null;
      return parseFloat(raw);
    };

    const mainBrushH = _parseHours(device.main_brush_sensor);
    const sideBrushH = _parseHours(device.side_brush_sensor);
    const filterH = _parseHours(device.filter_time_sensor);
    const sensorH = _parseHours(device.sensor_dirty_sensor);
    const dockBrushH = _parseHours(device.dock_brush_sensor);
    const dockStrainerH = _parseHours(device.dock_strainer_sensor);

    const dockCleanWaterFull = this._getStateValue(device.dock_clean_water_sensor) === 'on';
    const dockDirtyWaterFull = this._getStateValue(device.dock_dirty_water_sensor) === 'on';
    const waterShortage = this._getStateValue(device.water_shortage_sensor) === 'on';
    const mopAttached = this._getStateValue(device.mop_attached_sensor) === 'on';
    const mopDrying = this._getStateValue(device.mop_drying_sensor) === 'on';

    return {
      totalMl, remainingL, percentRemaining, usedMl,
      waterEmpty, isCleaning, filterDays, sessionMl, lastReset, vacState, charge,
      mainBrushH, sideBrushH, filterH, sensorH, dockBrushH, dockStrainerH,
      dockCleanWaterFull, dockDirtyWaterFull, waterShortage, mopAttached, mopDrying,
      areaCleaned, durationSec, lastCleanStart, lastCleanEnd,
    };
  }

  _getStatus(data, cfg) {
    if (data.totalMl === 0) return { label: 'No Water', color: '#6b7280', icon: '\uD83E\uDDA4' };
    if (data.waterEmpty || data.waterShortage) return { label: 'EMPTY', color: '#ef4444', icon: '\u26A0\uFE0F' };
    if (data.percentRemaining === null) return { label: 'Unknown', color: '#6b7280', icon: '\u2753' };
    if (data.percentRemaining <= (cfg.critical_threshold || 10)) return { label: 'Critical', color: '#ef4444', icon: '\uD83D\uDEA8' };
    if (data.percentRemaining <= (cfg.warning_threshold || 20)) return { label: 'Low', color: '#f59e0b', icon: '\u26A0\uFE0F' };
    return { label: 'OK', color: '#22c55e', icon: '\u2705' };
  }

  _formatReset(dt) {
    if (!dt || dt === 'unknown') return 'Never';
    try {
      const d = new Date(dt);
      if (isNaN(d.getTime())) return dt;
      const now = new Date();
      const diffH = (now - d) / 3600000;
      if (diffH < 1) return 'Just now';
      if (diffH < 24) return Math.round(diffH) + 'h ago';
      return Math.round(diffH / 24) + ' days ago';
    } catch { return dt; }
  }

  _hoursToDisplay(hours) {
    if (hours === null) return null;
    if (hours < 0) return { text: 'Overdue', color: '#ef4444' };
    const h = Math.round(hours);
    if (h < 24) return { text: h + 'h', color: h < 5 ? '#ef4444' : '#f59e0b' };
    const d = Math.round(hours / 24);
    return { text: d + ' days', color: d < 3 ? '#ef4444' : d < 14 ? '#f59e0b' : '#22c55e' };
  }

  _formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return null;
    const sec = parseInt(seconds);
    const m = Math.floor(sec / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return h + 'h ' + (m % 60) + 'm';
    return m + 'm';
  }

  // ── GAUGE SVG ─────────────────────────────────────────────────────────────

  _buildGaugeSVG(percent, color, size = 110) {
    const r = 42, cx = 55, cy = 55;
    const circumference = 2 * Math.PI * r;
    const clampedPct = Math.max(0, Math.min(100, percent || 0));
    const dashOffset = circumference * (1 - clampedPct / 100);
    return `
      <svg width="${size}" height="${size}" viewBox="0 0 110 110">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="9"/>
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
          stroke="${color}" stroke-width="9"
          stroke-dasharray="${circumference}"
          stroke-dashoffset="${dashOffset}"
          stroke-linecap="round"
          transform="rotate(-90 ${cx} ${cy})"
          style="transition: stroke-dashoffset 0.6s ease; filter: drop-shadow(0 0 4px ${color})"/>
        <text x="${cx}" y="${cy - 3}" text-anchor="middle" fill="white" font-size="17" font-weight="700" font-family="Inter,sans-serif">
          ${percent !== null ? Math.round(clampedPct) + '%' : '--'}
        </text>
        <text x="${cx}" y="${cy + 13}" text-anchor="middle" fill="rgba(255,255,255,0.5)" font-size="9" font-family="Inter,sans-serif">remaining</text>
      </svg>`;
  }

  _buildBatteryBar(charge) {
    if (charge === null) return '';
    const pct = parseInt(charge) || 0;
    const color = pct < 20 ? '#ef4444' : pct < 40 ? '#f59e0b' : '#22c55e';
    return `<div class="battery-bar">
      <span class="battery-icon">\uD83D\uDD0B</span>
      <div class="battery-track"><div class="battery-fill" style="width:${pct}%;background:${color}"></div></div>
      <span class="battery-pct" style="color:${color}">${pct}%</span>
    </div>`;
  }

  // ── TAB: WATER ─────────────────────────────────────────────────────────────

  _buildWaterTab(device, data) {
    const cfg = this._config;
    const status = this._getStatus(data, cfg);
    const gaugeSvg = data.totalMl > 0 ? this._buildGaugeSVG(data.percentRemaining, status.color) : '';

    const remainingText = data.remainingL != null ? `${Number(data.remainingL).toFixed(2)} L` : '--';
    const usedText = data.usedMl != null ? `${(Number(data.usedMl) / 1000).toFixed(2)} L` : '--';

    const vacStateChip = data.vacState
      ? `<span class="chip ${data.isCleaning ? 'chip-active' : 'chip-idle'}">${data.isCleaning ? '\uD83E\uDDF9 Cleaning' : '\uD83D\uDECC Idle'}</span>`
      : '';

    let extraRows = '';
    if (cfg.show_session !== false && data.sessionMl != null && !isNaN(data.sessionMl)) {
      extraRows += `<div class="row"><span class="row-label">\uD83D\uDCA7 Last session</span><span class="row-val">${data.sessionMl} ml</span></div>`;
    }
    if (cfg.show_filter !== false && data.filterDays != null && !isNaN(data.filterDays)) {
      const filterColor = data.filterDays < 7 ? '#ef4444' : data.filterDays < 30 ? '#f59e0b' : '#22c55e';
      extraRows += `<div class="row"><span class="row-label">\uD83D\uDD0D Filter life</span><span class="row-val" style="color:${filterColor}">${(data.filterDays || 0).toFixed(0)} days</span></div>`;
    }
    if (data.lastReset) {
      extraRows += `<div class="row"><span class="row-label">\uD83D\uDD04 Last refill</span><span class="row-val">${this._formatReset(data.lastReset)}</span></div>`;
    }
    if (data.charge !== null && data.charge !== undefined) {
      extraRows += this._buildBatteryBar(data.charge);
    }

    const refillBtn = (cfg.show_refill_button !== false && device.water_used_input)
      ? `<button class="refill-btn" data-input="${device.water_used_input}" data-reset="${device.last_reset_entity || ''}">\uD83D\uDCA7 Refilled</button>` : '';

    const alertBanner = (data.waterEmpty || data.waterShortage)
      ? `<div class="alert-banner">\u26A0\uFE0F Water shortage! Please refill now.</div>`
      : (data.dockDirtyWaterFull ? `<div class="alert-banner alert-warn">\u26A0\uFE0F Dirty water box is full - empty it.</div>` : '')
        + (data.percentRemaining !== null && data.percentRemaining <= (cfg.critical_threshold || 10) && !data.waterEmpty
          ? `<div class="alert-banner alert-warn">\u26A0\uFE0F Water low (${Math.round(data.percentRemaining)}%) - refill soon.</div>` : '');

    const dockHtml = (cfg.show_dock_status !== false) ? this._buildDockSection(device, data) : '';
    // Q1/Q2: Calibration info based on brand profile
    let calibHtml = '';
    const profileKey = cfg.brand_profile || 'generic';
    const calib = typeof CALIBRATION_DATA !== 'undefined' ? CALIBRATION_DATA[profileKey] || CALIBRATION_DATA['generic'] : null;
    if (calib) {
      const levels = Object.entries(calib.water_per_m2).map(([k,v]) => `<span style="display:inline-block;padding:3px 10px;background:var(--bento-bg,#f0f4f8);border-radius:6px;margin:2px 4px;font-size:12px;"><b>${k}:</b> ${v} ml/m²</span>`).join('');
      const estArea = data.totalMl > 0 ? Math.round(data.totalMl / (calib.water_per_m2.medium || 10)) : calib.avg_area_per_charge;
      calibHtml = `
        <div style="margin-top:16px;padding:16px;background:var(--bento-bg,#f8fafc);border:1.5px solid var(--bento-border,#e2e8f0);border-radius:12px;">
          <div style="font-weight:700;font-size:14px;margin-bottom:8px;">📐 Calibration: ${calib.label}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">
            <div>🪣 Tank: <b>${calib.tank_ml} ml</b></div>
            <div>🧹 Mop: <b>${calib.mop_type}</b></div>
            <div>📏 Est. area/charge: <b>~${calib.avg_area_per_charge} m²</b></div>
            <div>📏 Est. area/tank: <b>~${estArea} m²</b> (medium)</div>
          </div>
          <div style="margin-top:10px;font-size:12px;"><b>Water usage per m²:</b> ${levels}</div>
          ${calib.notes ? '<div style="margin-top:8px;font-size:12px;color:var(--bento-text-secondary,#64748b);font-style:italic;">💡 ' + calib.notes + '</div>' : ''}
        </div>`;
    }


    const noWaterMode = !data.totalMl;

    return `
      <div class="tab-content">
        ${alertBanner}
        ${noWaterMode ? `<div class="no-water-note">\uD83D\uDCCC This device doesn't track water levels</div>` : `
        <div class="device-body">
          <div class="gauge-wrap">
            ${gaugeSvg}
            ${vacStateChip}
          </div>
          <div class="details">
            <div class="row"><span class="row-label">\uD83D\uDD30 Remaining</span><span class="row-val">${remainingText} / ${data.totalMl > 0 ? (data.totalMl / 1000).toFixed(1) : "--"} L</span></div>
            <div class="row"><span class="row-label">\uD83D\uDCA6 Used</span><span class="row-val">${usedText}</span></div>
            ${extraRows}
          </div>
        </div>
        ${refillBtn ? `<div class="refill-wrap">${refillBtn}</div>` : ''}`}
        ${noWaterMode && data.charge !== null ? `<div class="details">${this._buildBatteryBar(data.charge)}</div>` : ''}
        ${dockHtml}
        ${calibHtml}
      </div>`;
  }

  _buildDockSection(device, data) {
    const items = [];
    if (device.dock_clean_water_sensor) {
      items.push({ label: '\uD83D\uDCA7 Clean Water Box', value: data.dockCleanWaterFull ? 'Full' : 'OK', color: data.dockCleanWaterFull ? '#ef4444' : '#22c55e', icon: data.dockCleanWaterFull ? '\u26A0\uFE0F' : '\u2705' });
    }
    if (device.dock_dirty_water_sensor) {
      items.push({ label: '\uD83E\uDEA3 Dirty Water Box', value: data.dockDirtyWaterFull ? 'Full - Empty!' : 'OK', color: data.dockDirtyWaterFull ? '#ef4444' : '#22c55e', icon: data.dockDirtyWaterFull ? '\uD83D\uDEA8' : '\u2705' });
    }
    if (device.water_shortage_sensor) {
      items.push({ label: '\uD83D\uDD30 Water Shortage', value: data.waterShortage ? 'Shortage!' : 'Normal', color: data.waterShortage ? '#ef4444' : '#22c55e', icon: data.waterShortage ? '\u26A0\uFE0F' : '\u2705' });
    }
    if (device.mop_attached_sensor) {
      items.push({ label: '\uD83E\uDDF9 Mop Pad', value: data.mopAttached ? (data.mopDrying ? 'Drying...' : 'Attached') : 'Detached', color: data.mopAttached ? (data.mopDrying ? '#f59e0b' : '#22c55e') : '#6b7280', icon: data.mopAttached ? (data.mopDrying ? '\uD83C\uDF2C\uFE0F' : '\u2705') : '\u274C' });
    }
    if (items.length === 0) return '';
    return `<div class="section-block"><div class="section-title">\uD83C\uDFE0 Dock Status</div>
      ${items.map(item => `<div class="dock-row"><span class="row-label">${item.label}</span><span class="dock-val" style="color:${item.color}">${item.icon} ${item.value}</span></div>`).join('')}
    </div>`;
  }

  // ── TAB: MAINTENANCE ───────────────────────────────────────────────────────

  _buildMaintenanceTab(device, data) {
    // HA consumables from sensors
    const haItems = [
      { label: '\uD83E\uDDF9 Main Brush', hours: data.mainBrushH, key: 'main_brush' },
      { label: '\uD83D\uDCCD Side Brush', hours: data.sideBrushH, key: 'side_brush' },
      { label: '\uD83D\uDD0D Filter', hours: data.filterH, key: 'filter' },
      { label: '\uD83D\uDCA7 Sensor Cleaning', hours: data.sensorH, key: 'sensor' },
      { label: '\uD83D\uDD04 Dock Brush', hours: data.dockBrushH, key: 'dock_brush' },
      { label: '\uD83D\uDD17 Dock Strainer', hours: data.dockStrainerH, key: 'dock_strainer' },
    ].filter(i => i.hours !== null);

    const haRows = haItems.map(item => {
      const disp = this._hoursToDisplay(item.hours);
      if (!disp) return '';
      const barPct = Math.min(100, Math.max(0, item.hours > 0 ? Math.min(100, (item.hours / 200) * 100) : 0));
      return `<div class="consumable-row">
        <span class="con-label">${item.label}</span>
        <div class="con-bar-wrap"><div class="con-bar"><div class="con-bar-fill" style="background:${disp.color};opacity:0.7;width:${barPct}%"></div></div></div>
        <span class="con-val" style="color:${disp.color}">${disp.text}</span>
      </div>`;
    }).join('');

    // Custom maintenance items from localStorage
    const now = Date.now();
    const customRows = this._maintenanceItems.map((item, idx) => {
      const daysSince = item.lastDone ? Math.floor((now - item.lastDone) / 86400000) : null;
      const daysLeft = item.intervalDays && daysSince !== null ? item.intervalDays - daysSince : null;
      let color = '#22c55e', statusText = 'OK';
      if (daysLeft !== null) {
        if (daysLeft < 0) { color = '#ef4444'; statusText = `${Math.abs(daysLeft)}d overdue`; }
        else if (daysLeft < 7) { color = '#f59e0b'; statusText = `${daysLeft}d left`; }
        else { statusText = `${daysLeft}d left`; }
      } else if (daysSince !== null) {
        statusText = `${daysSince}d ago`;
        color = '#6b7280';
      }
      return `<div class="custom-maint-row" data-idx="${idx}">
        <span class="con-label">${item.icon || '\uD83D\uDD27'} ${this._sanitize(item.name)}</span>
        <span class="con-val" style="color:${color}">${statusText}</span>
        <button class="maint-done-btn" data-idx="${idx}" title="Mark as done today">\u2705</button>
        <button class="maint-del-btn" data-idx="${idx}" title="Delete">\uD83D\uDDD1\uFE0F</button>
      </div>`;
    }).join('');

    return `
      <div class="tab-content">
        ${haRows ? `<div class="section-block"><div class="section-title">\u23F1\uFE0F HA Consumables</div>${haRows}</div>` : ''}
        ${haItems.length === 0 && this._maintenanceItems.length === 0 ? '<div class="empty-state">No maintenance data available.<br>Add custom items below.</div>' : ''}
        ${this._maintenanceItems.length > 0 ? `<div class="section-block"><div class="section-title">\uD83D\uDCCB Custom Maintenance</div>${customRows}</div>` : ''}
        <div class="section-block">
          <div class="section-title">\u2795 Add Maintenance Item</div>
          <div class="add-maint-form">
            <input class="maint-input" id="maint-name" placeholder="Name (e.g. Clean sensors)" type="text"/>
            <input class="maint-input maint-days" id="maint-days" placeholder="Every N days" type="number" min="1" max="365"/>
            <select class="maint-input maint-icon" id="maint-icon">
              <option value="\uD83D\uDD27">\uD83D\uDD27 Wrench</option>
              <option value="\uD83E\uDDF9">\uD83E\uDDF9 Brush</option>
              <option value="\uD83D\uDCA7">\uD83D\uDCA7 Water</option>
              <option value="\uD83D\uDD0D">\uD83D\uDD0D Filter</option>
              <option value="\uD83D\uDCCB">\uD83D\uDCCB Task</option>
              <option value="\uD83E\uDEA3">\uD83E\uDEA3 Container</option>
            </select>
            <button class="maint-add-btn">\u2795 Add</button>
          </div>
        </div>
      </div>`;
  }

  // ── TAB: HISTORY ───────────────────────────────────────────────────────────

  _buildHistoryTab(device, data) {
    const sessions = this._getSessionsFromStorage(device);

    // Show current session stats if cleaning
    let currentSession = '';
    if (data.isCleaning && data.areaCleaned) {
      currentSession = `<div class="current-session-card">
        <div class="cs-title">\uD83D\uDD04 Current session</div>
        <div class="cs-row"><span>\uD83D\uDDFA\uFE0F Area cleaned</span><span>${data.areaCleaned != null ? parseFloat(data.areaCleaned).toFixed(1) : '--'} m\u00B2</span></div>
        ${data.sessionMl ? `<div class="cs-row"><span>\uD83D\uDCA7 Water used</span><span>${data.sessionMl} ml</span></div>` : ''}
        ${data.durationSec ? `<div class="cs-row"><span>\u23F1\uFE0F Duration</span><span>${this._formatDuration(data.durationSec)}</span></div>` : ''}
      </div>`;
    }

    // Last session from HA sensors
    let lastSessionHtml = '';
    if (data.lastCleanEnd && data.lastCleanEnd !== 'unknown') {
      const endDate = new Date(data.lastCleanEnd);
      const daysAgo = Math.floor((Date.now() - endDate) / 86400000);
      const label = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : daysAgo + 'd ago';
      lastSessionHtml = `<div class="session-row">
        <div class="session-date">${label} <span class="session-time">${endDate.getHours()}:${String(endDate.getMinutes()).padStart(2,'0')}</span></div>
        <div class="session-stats">
          ${data.areaCleaned ? `<span class="session-stat">\uD83D\uDDFA\uFE0F ${data.areaCleaned != null ? parseFloat(data.areaCleaned).toFixed(0) : '--'} m\u00B2</span>` : ''}
          ${data.durationSec ? `<span class="session-stat">\u23F1\uFE0F ${this._formatDuration(data.durationSec)}</span>` : ''}
        </div>
      </div>`;
    }

    // Manual sessions from localStorage
    const manualRows = sessions.slice(0, 10).map(s => {
      const d = new Date(s.ts);
      const daysAgo = Math.floor((Date.now() - s.ts) / 86400000);
      const label = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : daysAgo + 'd ago';
      return `<div class="session-row">
        <div class="session-date">${label} <span class="session-time">${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}</span></div>
        <div class="session-stats">
          ${s.area ? `<span class="session-stat">\uD83D\uDDFA\uFE0F ${s.area} m\u00B2</span>` : ''}
          ${s.water ? `<span class="session-stat">\uD83D\uDCA7 ${s.water} ml</span>` : ''}
          ${s.duration ? `<span class="session-stat">\u23F1\uFE0F ${s.duration}</span>` : ''}
        </div>
      </div>`;
    }).join('');

    const noHistory = !lastSessionHtml && !manualRows && !data.isCleaning;

    return `
      <div class="tab-content">
        ${currentSession}
        ${lastSessionHtml ? `<div class="section-block"><div class="section-title">\uD83D\uDDD3\uFE0F Last Session (HA)</div>${lastSessionHtml}</div>` : ''}
        ${manualRows ? `<div class="section-block"><div class="section-title">\uD83D\uDCCA Logged Sessions</div>${manualRows}</div>` : ''}
        ${noHistory ? '<div class="empty-state">No session history available.<br>Start a cleaning to record sessions.</div>' : ''}
        <div class="section-block">
          <div class="section-title">\u270F\uFE0F Log Manual Session</div>
          <div class="add-maint-form">
            <input class="maint-input" id="hist-area" placeholder="Area m\u00B2" type="number" min="0"/>
            <input class="maint-input maint-days" id="hist-water" placeholder="Water ml" type="number" min="0"/>
            <input class="maint-input maint-days" id="hist-duration" placeholder="Duration (e.g. 45m)" type="text"/>
            <button class="maint-add-btn" id="hist-log-btn">\u2795 Log</button>
          </div>
        </div>
      </div>`;
  }

  _getSessionsFromStorage(device) {
    try {
      const key = 'ha-vwm-sessions-' + (device.name || 'default').replace(/\s+/g, '_');
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  _saveSession(device, session) {
    try {
      const key = 'ha-vwm-sessions-' + (device.name || 'default').replace(/\s+/g, '_');
      const sessions = this._getSessionsFromStorage(device);
      sessions.unshift({ ...session, ts: Date.now() });
      localStorage.setItem(key, JSON.stringify(sessions.slice(0, 50)));
    } catch {}
  }

  // ── TAB: STATS ─────────────────────────────────────────────────────────────

  _buildStatsTab(devices) {
    // Summary across all devices
    const rows = devices.map(device => {
      const data = this._calcDeviceData(device);
      const status = this._getStatus(data, this._config);
      const pct = data.percentRemaining !== null ? Math.round(data.percentRemaining) : null;
      return `<div class="stats-row">
        <span class="stats-device">${device.icon || '\uD83E\uDDA4'} ${this._sanitize(device.name || 'Vacuum')}</span>
        <span class="stats-status" style="color:${status.color}">${status.icon} ${status.label}</span>
        <span class="stats-pct" style="color:${status.color}">${pct !== null ? pct + '%' : '--'}</span>
      </div>`;
    }).join('');

    // Discovered vacuums not in config
    const discovered = this._autoDiscoverVacuums();
    const configuredIds = devices.map(d => d.vacuum_entity).filter(Boolean);
    const undiscovered = discovered.filter(v => !configuredIds.includes(v.entity_id));

    const discoveredHtml = undiscovered.length > 0 ? `
      <div class="section-block">
        <div class="section-title">\uD83D\uDD0E Discovered Vacuums (not configured)</div>
        ${undiscovered.map(v => `<div class="disc-row">
          <span class="disc-name">\uD83E\uDDA4 ${this._sanitize(v.name)}</span>
          <span class="disc-id">${v.entity_id}</span>
          <span class="disc-state" style="color:${v.state === 'cleaning' ? '#22c55e' : '#6b7280'}">${v.state}</span>
          ${v.battery ? `<span class="disc-bat">\uD83D\uDD0B ${v.battery}%</span>` : ''}
        </div>`).join('')}
      </div>` : '';

    return `
      <div class="tab-content">
        ${devices.length > 1 ? `<div class="section-block"><div class="section-title">\uD83D\uDCCA All Devices</div>${rows}</div>` : ''}
        ${devices.length > 0 ? this._buildWeeklyStats(devices) : ''}
        ${discoveredHtml}
        <div class="section-block" style="margin-top:12px">
          <div class="section-title">Reczne dodanie odkurzacza</div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px">
            <input type="text" id="manual-vacuum-entity" placeholder="vacuum.roborock_s7" style="flex:1;min-width:200px;padding:8px 12px;border:1.5px solid var(--bento-border,#e2e8f0);border-radius:8px;font-size:13px;background:var(--bento-card,#fff);color:var(--bento-text,#1e293b)">
            <button class="btn-primary" id="btn-add-manual-vacuum" style="padding:8px 16px;white-space:nowrap">+ Dodaj</button>
          </div>
          <p style="margin:6px 0 0;font-size:11px;color:var(--bento-text-secondary,#64748B)">Wpisz entity_id odkurzacza jesli auto-discover go nie znalazl</p>
        </div>
        ${devices.length === 0 ? '<div class="empty-state">No devices configured.<br>Add device config or use brand_profile.</div>' : ''}
      </div>`;
  }

  _buildWeeklyStats(devices) {
    // Weekly summary from local storage sessions
    const allSessions = [];
    devices.forEach(d => {
      const sessions = this._getSessionsFromStorage(d);
      sessions.forEach(s => allSessions.push({ ...s, device: d.name }));
    });

    const weekAgo = Date.now() - 7 * 86400000;
    const thisWeek = allSessions.filter(s => s.ts > weekAgo);
    const totalArea = thisWeek.reduce((sum, s) => sum + (parseFloat(s.area) || 0), 0);
    const totalWater = thisWeek.reduce((sum, s) => sum + (parseFloat(s.water) || 0), 0);
    const totalSessions = thisWeek.length;

    return `<div class="section-block">
      <div class="section-title">\uD83D\uDCC5 This Week (logged)</div>
      <div class="stats-grid">
        <div class="stat-box"><div class="stat-num">${totalSessions}</div><div class="stat-label">sessions</div></div>
        <div class="stat-box"><div class="stat-num">${(totalArea || 0).toFixed(0)}</div><div class="stat-label">m\u00B2 cleaned</div></div>
        <div class="stat-box"><div class="stat-num">${((totalWater || 0) / 1000).toFixed(1)}</div><div class="stat-label">L water</div></div>
      </div>
    </div>`;
  }

  // ── MULTI-DEVICE TABS ──────────────────────────────────────────────────────

  _buildDeviceTabs(devices) {
    if (devices.length <= 1) return '';
    return `<div class="device-tabs">
      ${devices.map((d, i) => `<button class="dtab ${i === this._activeDeviceIdx ? 'dtab-active' : ''}" data-didx="${i}">${d.icon || '\uD83E\uDDA4'} ${this._sanitize(d.name || 'Device ' + (i+1))}</button>`).join('')}
    </div>`;
  }

  // ── MAIN RENDER ───────────────────────────────────────────────────────────

  _render() {
   try {
    const devices = this._getDevices();
    const device = devices[this._activeDeviceIdx] || devices[0] || {};
    const data = Object.keys(device).length ? this._calcDeviceData(device) : {};

    const cfg = this._config;
    const status = data.vacState !== undefined ? this._getStatus(data, cfg) : { label: '--', color: '#6b7280', icon: '' };

    // Tabs definition
    const tabs = [
      { id: 'water', icon: '\uD83D\uDCA7', label: 'Water' },
      { id: 'maintenance', icon: '\uD83D\uDD27', label: 'Maint.' },
      { id: 'history', icon: '\uD83D\uDDD3\uFE0F', label: 'History' },
      { id: 'stats', icon: '\uD83D\uDCCA', label: 'Stats' },
    ];

    const tabNav = `<div class="tab-nav">
      ${tabs.map(t => `<button class="tab-btn ${this._activeTab === t.id ? 'tab-active' : ''}" data-tab="${t.id}">${t.icon} ${t.label}</button>`).join('')}
    </div>`;

    const deviceHeader = devices.length > 0 ? `
      <div class="device-header">
        <div class="device-name">${device.icon || '\uD83E\uDDA4'} ${this._sanitize(device.name || 'Vacuum')}</div>
        ${data.vacState !== undefined ? `<div class="status-badge" style="background:${status.color}20;color:${status.color};border:1px solid ${status.color}40">${status.icon} ${status.label}</div>` : ''}
      </div>` : '';

    let tabContent = '';
    if (this._activeTab === 'water') tabContent = this._buildWaterTab(device, data);
    else if (this._activeTab === 'maintenance') tabContent = this._buildMaintenanceTab(device, data);
    else if (this._activeTab === 'history') tabContent = this._buildHistoryTab(device, data);
    else if (this._activeTab === 'stats') tabContent = this._buildStatsTab(devices);

    const deviceTabsHtml = this._buildDeviceTabs(devices);

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; font-family: Inter, sans-serif; }
        .card { background: #1a1a2e; border-radius: 16px; padding: 16px; color: white; }
        .card-title { font-size: 15px; font-weight: 700; color: rgba(255,255,255,0.75); margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
        .device-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .device-name { font-weight: 600; font-size: 14px; }
        .status-badge { font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 20px; letter-spacing: 0.3px; }
        /* Device tabs */
        .device-tabs { display: flex; gap: 6px; margin-bottom: 10px; flex-wrap: wrap; }
        .dtab { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.5); border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; padding: 4px 12px; font-size: 12px; cursor: pointer; font-family: Inter, sans-serif; transition: all 0.2s; }
        .dtab-active { background: rgba(99,102,241,0.2); color: #818cf8; border-color: rgba(99,102,241,0.4); }
        /* Tab navigation */
        .tab-nav { display: flex; gap: 2px; margin-bottom: 14px; background: rgba(255,255,255,0.05); border-radius: 10px; padding: 3px; }
        .tab-btn { flex: 1; background: transparent; color: rgba(255,255,255,0.4); border: none; border-radius: 8px; padding: 7px 4px; font-size: 11px; font-weight: 600; cursor: pointer; font-family: Inter, sans-serif; transition: all 0.2s; }
        .tab-active { background: rgba(255,255,255,0.1); color: white; }
        /* Content */
        .tab-content { animation: fadeIn 0.2s ease; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        .device-body { display: flex; align-items: center; gap: 16px; }
        .gauge-wrap { display: flex; flex-direction: column; align-items: center; gap: 6px; flex-shrink: 0; }
        .details { flex: 1; display: flex; flex-direction: column; gap: 6px; }
        .row { display: flex; justify-content: space-between; align-items: center; font-size: 12px; }
        .row-label { color: rgba(255,255,255,0.5); }
        .row-val { font-weight: 600; color: rgba(255,255,255,0.9); }
        .chip { font-size: 10px; padding: 2px 8px; border-radius: 12px; font-weight: 500; }
        .chip-active { background: rgba(34,197,94,0.15); color: #22c55e; border: 1px solid rgba(34,197,94,0.3); animation: pulse 1.5s infinite; }
        .chip-idle { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.4); border: 1px solid rgba(255,255,255,0.12); }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
        .refill-wrap { margin-top: 12px; text-align: right; }
        .refill-btn { background: rgba(59,130,246,0.15); color: #60a5fa; border: 1px solid rgba(59,130,246,0.3); border-radius: 8px; padding: 7px 16px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; font-family: Inter, sans-serif; }
        .refill-btn:hover { background: rgba(59,130,246,0.25); }
        .alert-banner { background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3); color: #fca5a5; border-radius: 8px; padding: 8px 12px; font-size: 12px; font-weight: 500; margin-bottom: 10px; }
        .alert-warn { background: rgba(245,158,11,0.15); border-color: rgba(245,158,11,0.3); color: #fcd34d; }
        .no-water-note { color: rgba(255,255,255,0.4); font-size: 12px; text-align: center; padding: 12px 0; }
        /* Sections */
        .section-block { margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.08); }
        .section-title { font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 8px; }
        /* Dock */
        .dock-row { display: flex; justify-content: space-between; align-items: center; font-size: 12px; padding: 3px 0; }
        .dock-val { font-weight: 600; font-size: 12px; }
        /* Consumables */
        .consumable-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
        .con-label { font-size: 11px; color: rgba(255,255,255,0.5); width: 100px; flex-shrink: 0; }
        .con-bar-wrap { flex: 1; }
        .con-bar { height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden; }
        .con-bar-fill { height: 100%; border-radius: 2px; transition: width 0.4s ease; }
        .con-val { font-size: 11px; font-weight: 600; width: 55px; text-align: right; flex-shrink: 0; }
        /* Custom maintenance */
        .custom-maint-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 12px; }
        .custom-maint-row .con-label { flex: 1; width: auto; }
        .maint-done-btn, .maint-del-btn { background: none; border: none; cursor: pointer; font-size: 14px; padding: 2px; }
        /* Add form */
        .add-maint-form { display: flex; gap: 6px; flex-wrap: wrap; }
        .maint-input { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: white; padding: 6px 10px; font-size: 12px; font-family: Inter, sans-serif; flex: 1; min-width: 80px; }
        .maint-days, .maint-icon { max-width: 100px; }
        .maint-input::placeholder { color: rgba(255,255,255,0.3); }
        .maint-add-btn { background: rgba(34,197,94,0.15); color: #22c55e; border: 1px solid rgba(34,197,94,0.3); border-radius: 6px; padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: Inter, sans-serif; white-space: nowrap; }
        /* History */
        .current-session-card { background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.2); border-radius: 10px; padding: 10px 14px; margin-bottom: 10px; }
        .cs-title { font-size: 12px; font-weight: 700; color: #22c55e; margin-bottom: 6px; }
        .cs-row { display: flex; justify-content: space-between; font-size: 12px; padding: 2px 0; color: rgba(255,255,255,0.7); }
        .session-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 12px; }
        .session-date { color: rgba(255,255,255,0.7); font-weight: 500; }
        .session-time { color: rgba(255,255,255,0.4); font-size: 11px; }
        .session-stats { display: flex; gap: 8px; }
        .session-stat { background: rgba(255,255,255,0.07); border-radius: 10px; padding: 2px 8px; font-size: 11px; color: rgba(255,255,255,0.6); }
        /* Stats */
        .stats-row { display: flex; align-items: center; gap: 8px; padding: 5px 0; font-size: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .stats-device { flex: 1; font-weight: 500; }
        .stats-status { font-size: 11px; }
        .stats-pct { font-weight: 700; font-size: 13px; width: 35px; text-align: right; }
        .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 8px; }
        .stat-box { background: rgba(255,255,255,0.05); border-radius: 10px; padding: 10px; text-align: center; }
        .stat-num { font-size: 20px; font-weight: 700; color: white; }
        .stat-label { font-size: 10px; color: rgba(255,255,255,0.4); margin-top: 2px; }
        /* Discovered */
        .disc-row { display: flex; align-items: center; gap: 8px; padding: 5px 0; font-size: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); flex-wrap: wrap; }
        .disc-name { font-weight: 500; }
        .disc-id { color: rgba(255,255,255,0.35); font-size: 10px; font-family: monospace; flex: 1; }
        .disc-state { font-size: 11px; font-weight: 600; }
        .disc-bat { font-size: 11px; color: rgba(255,255,255,0.5); }
        /* Battery */
        .battery-bar { display: flex; align-items: center; gap: 6px; font-size: 12px; padding: 2px 0; }
        .battery-icon { flex-shrink: 0; }
        .battery-track { flex: 1; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden; }
        .battery-fill { height: 100%; border-radius: 3px; transition: width 0.4s; }
        .battery-pct { font-weight: 700; font-size: 12px; width: 35px; text-align: right; }
        /* Empty */
        .empty-state { text-align: center; color: rgba(255,255,255,0.3); padding: 20px; font-size: 13px; line-height: 1.5; }

/* Tips banner */
.tip-banner {
  background: linear-gradient(135deg, rgba(59,130,246,0.08), rgba(59,130,246,0.03));
  border: 1.5px solid rgba(59,130,246,0.2);
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 16px;
  font-size: 13px;
  line-height: 1.6;
  position: relative;
}
.tip-banner-title { font-weight: 700; font-size: 14px; margin-bottom: 6px; color: #3B82F6; }
.tip-banner ul { margin: 6px 0 0 16px; padding: 0; }
.tip-banner li { margin-bottom: 3px; }
.tip-banner .tip-dismiss {
  position: absolute; top: 8px; right: 10px;
  background: none; border: none; cursor: pointer;
  font-size: 16px; color: var(--secondary-text-color, #888); opacity: 0.6;
}
.tip-banner .tip-dismiss:hover { opacity: 1; }
.tip-banner.hidden { display: none; }

      
/* === DARK MODE === */
@media (prefers-color-scheme: dark) {
  :host {
    --bento-bg: var(--primary-background-color, #1a1a2e);
    --bento-card: var(--card-background-color, #16213e);
    --bento-border: var(--divider-color, #2a2a4a);
    --bento-text: var(--primary-text-color, #e0e0e0);
    --bento-text-secondary: var(--secondary-text-color, #a0a0b0);
    --bento-text-muted: var(--disabled-text-color, #6a6a7a);
    --bento-shadow-sm: 0 1px 3px rgba(0,0,0,0.3);
    --bento-shadow-md: 0 4px 12px rgba(0,0,0,0.4);
    --bento-primary-light: rgba(59,130,246,0.15);
    --bento-success-light: rgba(16,185,129,0.15);
    --bento-error-light: rgba(239,68,68,0.15);
    --bento-warning-light: rgba(245,158,11,0.15);
    color-scheme: dark !important;
  }
  .card, .card-container, .main-card, .exporter-card, .security-card, .reports-card, .storage-card, .chore-card, .cry-card, .backup-card, .network-card, .sentence-card, .energy-card, .panel-card {
    background: var(--bento-card) !important; color: var(--bento-text) !important; border-color: var(--bento-border) !important;
  }
  input, select, textarea { background: var(--bento-bg); color: var(--bento-text); border-color: var(--bento-border); }
  .stat, .stat-card, .summary-card, .metric-card, .kpi-card, .health-card { background: var(--bento-bg); border-color: var(--bento-border); }
  .tab-content, .section { color: var(--bento-text); }
  table th { background: var(--bento-bg); color: var(--bento-text-secondary); border-color: var(--bento-border); }
  table td { color: var(--bento-text); border-color: var(--bento-border); }
  tr:hover td { background: rgba(59,130,246,0.08); }
  .empty-state, .no-data { color: var(--bento-text-secondary); }
  .schedule-section, .settings-section, .detail-panel, .details, .device-detail { background: var(--bento-bg); border-color: var(--bento-border); }
  .addon-list, .content-item { background: rgba(255,255,255,0.05); }
  .chart-container { background: var(--bento-bg); border-color: var(--bento-border); }
  pre, code { background: #1e293b !important; color: #e2e8f0 !important; }
}
</style>
      <div class="card">
        <div class="card-title">${this._config.title}</div>
        <div class="tip-banner" id="tip-banner">
          <button class="tip-dismiss" id="tip-dismiss">\u2715</button>
          <div class="tip-banner-title">\u{1F4A1} Konfiguracja</div>
          <ul>
            <li><strong>Brand Profile</strong> \u2014 wybierz profil (Roborock, Dreame, iRobot, Ecovacs) aby automatycznie wype\u0142ni\u0107 nazwy sensor\u00F3w.</li>
            <li><strong>Wymagane encje:</strong> vacuum.*, sensor/binary_sensor dla wody, input_number do \u015Bledzenia zu\u017Cycia.</li>
            <li><strong>Multi-device</strong> \u2014 dodaj wiele odkurzaczy w config (tablica <code>devices</code>).</li>
            <li><strong>Zak\u0142adki:</strong> Water (poziom wody), Consumables (szczotki, filtry), Stats (statystyki sprz\u0105tania), History (historia sesji).</li>
            <li><strong>Refill</strong> \u2014 resetuje licznik zu\u017Cycia wody po uzupe\u0142nieniu zbiornika.</li>
          </ul>
        </div>
        ${deviceTabsHtml}
        ${deviceHeader}
        ${tabNav}
        ${tabContent}
      </div>`;

    this._attachListeners(devices, device);
   } catch(err) {
    // Show error with tip banner
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; font-family: 'Inter', sans-serif; color: var(--primary-text-color, #1a1a2e); }
        .err-container { max-width: 700px; margin: 30px auto; padding: 20px; }
        .err-card { background: rgba(239,68,68,0.05); border: 1.5px solid rgba(239,68,68,0.2); border-radius: 12px; padding: 20px; margin-bottom: 20px; text-align: center; }
        .err-icon { font-size: 48px; margin-bottom: 10px; }
        .err-msg { font-size: 13px; color: #888; margin-top: 8px; font-family: monospace; }
        .tip-banner { background: linear-gradient(135deg, rgba(59,130,246,0.08), rgba(59,130,246,0.03)); border: 1.5px solid rgba(59,130,246,0.2); border-radius: 12px; padding: 14px 16px; font-size: 13px; line-height: 1.6; }
        .tip-banner-title { font-weight: 700; font-size: 14px; margin-bottom: 6px; color: #3B82F6; }
        .tip-banner ul { margin: 6px 0 0 16px; padding: 0; }
        .tip-banner li { margin-bottom: 3px; }
      
/* === DARK MODE === */
@media (prefers-color-scheme: dark) {
  :host {
    --bento-bg: var(--primary-background-color, #1a1a2e);
    --bento-card: var(--card-background-color, #16213e);
    --bento-border: var(--divider-color, #2a2a4a);
    --bento-text: var(--primary-text-color, #e0e0e0);
    --bento-text-secondary: var(--secondary-text-color, #a0a0b0);
    --bento-text-muted: var(--disabled-text-color, #6a6a7a);
    --bento-shadow-sm: 0 1px 3px rgba(0,0,0,0.3);
    --bento-shadow-md: 0 4px 12px rgba(0,0,0,0.4);
    --bento-primary-light: rgba(59,130,246,0.15);
    --bento-success-light: rgba(16,185,129,0.15);
    --bento-error-light: rgba(239,68,68,0.15);
    --bento-warning-light: rgba(245,158,11,0.15);
    color-scheme: dark !important;
  }
  .card, .card-container, .main-card, .exporter-card, .security-card, .reports-card, .storage-card, .chore-card, .cry-card, .backup-card, .network-card, .sentence-card, .energy-card, .panel-card {
    background: var(--bento-card) !important; color: var(--bento-text) !important; border-color: var(--bento-border) !important;
  }
  input, select, textarea { background: var(--bento-bg); color: var(--bento-text); border-color: var(--bento-border); }
  .stat, .stat-card, .summary-card, .metric-card, .kpi-card, .health-card { background: var(--bento-bg); border-color: var(--bento-border); }
  .tab-content, .section { color: var(--bento-text); }
  table th { background: var(--bento-bg); color: var(--bento-text-secondary); border-color: var(--bento-border); }
  table td { color: var(--bento-text); border-color: var(--bento-border); }
  tr:hover td { background: rgba(59,130,246,0.08); }
  .empty-state, .no-data { color: var(--bento-text-secondary); }
  .schedule-section, .settings-section, .detail-panel, .details, .device-detail { background: var(--bento-bg); border-color: var(--bento-border); }
  .addon-list, .content-item { background: rgba(255,255,255,0.05); }
  .chart-container { background: var(--bento-bg); border-color: var(--bento-border); }
  pre, code { background: #1e293b !important; color: #e2e8f0 !important; }
}

        /* === MOBILE FIX === */
        @media (max-width: 768px) {
          .tabs { flex-wrap: wrap; overflow-x: visible; gap: 2px; }
          .tab, .tab-button, .tab-btn { padding: 6px 10px; font-size: 12px; white-space: nowrap; }
          .card, .card-container { padding: 14px; }
          .stats, .stats-grid, .summary-grid, .stat-cards, .kpi-grid, .metrics-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }
          .stat-val, .kpi-val, .metric-val { font-size: 18px; }
          .stat-lbl, .kpi-lbl, .metric-lbl { font-size: 10px; }
          .panels, .board { flex-direction: column; }
          .column { min-width: unset; }
          h2 { font-size: 18px; }
          h3 { font-size: 15px; }
        }
        @media (max-width: 480px) {
          .tabs { gap: 1px; }
          .tab, .tab-button, .tab-btn { padding: 5px 8px; font-size: 11px; }
          .stats, .stats-grid, .summary-grid, .stat-cards, .kpi-grid, .metrics-grid { grid-template-columns: 1fr 1fr; }
          .stat-val, .kpi-val, .metric-val { font-size: 16px; }
        }
      </style>
      <div class="err-container">
        <div class="err-card">
          <div class="err-icon">\u26A0\uFE0F</div>
          <div><strong>B\u0142\u0105d:</strong> ${err.message}</div>
          <div class="err-msg">Brakuj\u0105ce encje lub sensory nie s\u0105 dost\u0119pne.</div>
        </div>
        <div class="tip-banner">
          <div class="tip-banner-title">\u{1F4A1} Konfiguracja</div>
          <ul>
            <li><strong>Brand Profile</strong> \u2014 wybierz profil (Roborock, Dreame, iRobot, Ecovacs) aby automatycznie wype\u0142ni\u0107 nazwy sensor\u00F3w.</li>
            <li><strong>Wymagane encje:</strong> vacuum.*, sensor/binary_sensor dla wody, input_number do \u015Bledzenia zu\u017Cycia.</li>
            <li><strong>Multi-device</strong> \u2014 dodaj wiele odkurzaczy w config (tablica <code>devices</code>).</li>
            <li><strong>Zak\u0142adki:</strong> Water (poziom wody), Consumables (szczotki, filtry), Stats (statystyki sprz\u0105tania), History (historia sesji).</li>
            <li><strong>Refill</strong> \u2014 resetuje licznik zu\u017Cycia wody po uzupe\u0142nieniu zbiornika.</li>
          </ul>
        </div>
      </div>`;
    console.warn('[VacuumWaterMonitor] Render error:', err);
   }
  }

  _attachListeners(devices, device) {
    const sr = this.shadowRoot;
    // Tip banner dismiss
    const _tipB = this.shadowRoot.querySelector('#tip-banner');
    if (_tipB) {
      const _tipV = 'vacuum-water-monitor-tips-v3.0.0';
      if (localStorage.getItem(_tipV) === 'dismissed') {
        _tipB.classList.add('hidden');
      }
      const _tipDismiss = this.shadowRoot.querySelector('#tip-dismiss');
      if (_tipDismiss) {
        _tipDismiss.addEventListener('click', (e) => {
          e.stopPropagation();
          _tipB.classList.add('hidden');
          localStorage.setItem(_tipV, 'dismissed');
        });
      }
    }

    // Refill button
    sr.querySelectorAll('.refill-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const inputId = btn.dataset.input;
        const resetId = btn.dataset.reset;
        if (inputId && this._hass) {
          try {
            await this._hass.callService('input_number', 'set_value', { entity_id: inputId, value: 0 });
            if (resetId) {
              const now = new Date();
              const pad = n => String(n).padStart(2, '0');
              const dt = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
              await this._hass.callService('input_datetime', 'set_datetime', { entity_id: resetId, datetime: dt });
            }
            btn.textContent = '\u2705 Done!'; btn.style.color = '#22c55e';
            setTimeout(() => { btn.textContent = '\uD83D\uDCA7 Refilled'; btn.style.color = '#60a5fa'; }, 2000);
          } catch (e) {
            console.error('[ha-vacuum-water-monitor] Service call failed:', e);
            btn.textContent = '\u274C B\u0142\u0105d!'; btn.style.color = '#ef4444';
            setTimeout(() => { btn.textContent = '\uD83D\uDCA7 Refilled'; btn.style.color = '#60a5fa'; }, 3000);
          }
        }
      });
    });

    // Tab navigation
    sr.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._activeTab = btn.dataset.tab;
        this._render();
      });
    });

    // Device tabs
    sr.querySelectorAll('.dtab').forEach(btn => {
      btn.addEventListener('click', () => {
        this._activeDeviceIdx = parseInt(btn.dataset.didx) || 0;
        this._render();
      });
    });

    // Maintenance: add item
    const maintAddBtn = sr.querySelector('.maint-add-btn');
    if (maintAddBtn) {
      maintAddBtn.addEventListener('click', () => {
        const name = (sr.querySelector('#maint-name') || {}).value || '';
        const days = parseInt((sr.querySelector('#maint-days') || {}).value) || null;
        const icon = (sr.querySelector('#maint-icon') || {}).value || '\uD83D\uDD27';
        if (!name.trim()) return;
        this._maintenanceItems.push({ name: name.trim(), intervalDays: days, icon, lastDone: null });
        this._saveMaintenanceItems();
        this._render();
      });
    }

    // Maintenance: mark done
    sr.querySelectorAll('.maint-done-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        if (this._maintenanceItems[idx]) {
          this._maintenanceItems[idx].lastDone = Date.now();
          this._saveMaintenanceItems();
          this._render();
        }
      });
    });

    // Maintenance: delete
    sr.querySelectorAll('.maint-del-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        this._maintenanceItems.splice(idx, 1);
        this._saveMaintenanceItems();
        this._render();
      });
    });

    // History: log manual session
    const histLogBtn = sr.querySelector('#hist-log-btn');
    if (histLogBtn) {
      histLogBtn.addEventListener('click', () => {
        const area = (sr.querySelector('#hist-area') || {}).value || '';
        const water = (sr.querySelector('#hist-water') || {}).value || '';
        const duration = (sr.querySelector('#hist-duration') || {}).value || '';
        if (!area && !water && !duration) return;
        this._saveSession(device, { area, water, duration });
        this._render();
      });
    }

    // Discovery injection
    this._injectDiscovery();
  }

  _injectDiscovery() {
    if (customElements.get('ha-tools-panel')) return;
    const container = this.shadowRoot.firstElementChild;
    if (!container) return;
    if (container.querySelector('ha-tools-discovery-banner')) return;
    const _inj = () => { if (window.HAToolsDiscovery) window.HAToolsDiscovery.inject(container, 'vacuum-water-monitor', true); };
    if (window.HAToolsDiscovery) { _inj(); return; }
    const s = document.createElement('script');
    s.src = '/local/community/ha-tools-panel/ha-tools-discovery.js?_=' + Date.now();
    s.async = true; s.onload = _inj;
    document.head.appendChild(s);
  }
}

customElements.define('ha-vacuum-water-monitor', HAVacuumWaterMonitor);
window.customCards = window.customCards || [];
if (!window.customCards.find(c => c.type === 'ha-vacuum-water-monitor')) {
  window.customCards.push({
    type: 'ha-vacuum-water-monitor',
    name: 'Vacuum Water Monitor',
    description: 'Track water levels, maintenance schedule, cleaning history, and stats for robot vacuums. Multi-device, brand profiles, auto-discovery.',
    preview: true,
  });
}
