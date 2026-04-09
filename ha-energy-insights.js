(function() {
'use strict';

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

/**
 * HA Energy Insights - Bento Light Mode Panel Tool
 * Energy monitoring with cost tracking, device breakdown, and efficiency recommendations
 * v2.0.0 - Converted from Lovelace Card to Panel Tool Pattern
 */

class HAEnergyInsights extends HTMLElement {
  static getConfigElement() { return document.createElement('ha-energy-insights-editor'); }
  static getStubConfig() { return { type: 'custom:ha-energy-insights', title: 'Energy Insights', currency: 'PLN' }; }
  constructor() {
    super();
    this._lang = (navigator.language || '').startsWith('pl') ? 'pl' : 'en';
    this.attachShadow({ mode: 'open' });

    // State fields
    this._hass = null;
    this._activeTab = 'overview';
    this._data = null;
    this._loading = true;
    this._error = null;
    this._charts = {};
    this._chartJsReady = false;
    this._lastRenderTime = 0;
    this._renderScheduled = false;
    this._firstHassRender = false;
    this._domBuilt = false;
    this._lastDataHash = '';
    this._lastDataFetch = 0;

    // Configuration
    this._config = {
      title: 'Energy Insights',
      energy_price: 0.65,
      currency: 'PLN',
      days_history: 7
    };
  }

  // ===== TRANSLATIONS (i18n) =====
  static get _translations() {
    return {
      en: {
        energyInsights: 'Energy Insights',
        overview: 'Overview',
        daily: 'Daily',
        weekly: 'Weekly',
        monthly: 'Monthly',
        tips: 'Tips',
        today: 'Today',
        thisWeek: 'This Week',
        thisMonth: 'This Month',
        trend: 'Trend',
        vsLastWeek: 'vs last week',
        topDevices: 'Top 5 Devices',
        noSensors: 'No energy sensors found. Add energy sensors (kWh/W) to Home Assistant.',
        hourlyConsumption: 'Hourly Consumption (today)',
        dailyConsumption: 'Daily Consumption (7 days)',
        monthlyConsumption: 'Daily Consumption (30 days)',
        refresh: 'Refresh',
        loading: 'Loading energy data...',
        error: 'Failed to load energy data',

        // Recommendations
        highConsumption: 'Consumption significantly higher than usual — check devices and heating.',
        slightlyHigher: 'Consumption slightly higher than last week — monitor usage.',
        lowerThanUsual: 'Consumption lower than usual — great savings!',
        highToday: 'High consumption today — check high-power devices.',
        veryLow: 'Very low consumption today. Everything looks good!',
        normalUsage: 'Energy consumption is normal. Continue monitoring.',

        // Tips
        sensorSetup: 'Use template sensors to track appliance energy consumption.',
        costTracking: 'Update energy_price with your local electricity rate.',
        peakHours: 'Monitor peak consumption hours to optimize usage.',
        deviceBreakdown: 'Compare device-level energy consumption to identify top consumers.',
        efficientAppliances: 'Replace old appliances with ENERGY STAR certified models.',

        partOfHATools: 'Part of HA Tools ecosystem',
        openToolsPanel: 'Open Tools Panel',
      },
      pl: {
        energyInsights: 'Analiza Energii',
        overview: 'Przegląd',
        daily: 'Dziś',
        weekly: 'Tydzień',
        monthly: 'Miesiąc',
        tips: 'Porady',
        today: 'Dzisiaj',
        thisWeek: 'Ten Tydzień',
        thisMonth: 'Ten Miesiąc',
        trend: 'Trend',
        vsLastWeek: 'vs poprzedni tydzień',
        topDevices: 'Top 5 Urządzeń',
        noSensors: 'Brak czujników energii. Dodaj sensory energii (kWh/W) do HA.',
        hourlyConsumption: 'Zużycie Godzinowe (dzisiaj)',
        dailyConsumption: 'Zużycie Dzienne (7 dni)',
        monthlyConsumption: 'Zużycie Dzienne (30 dni)',
        refresh: 'Odśwież',
        loading: 'Wczytywanie danych energii...',
        error: 'Nie udało się załadować danych energii',

        // Recommendations
        highConsumption: 'Zużycie znacznie wyższe niż zwykle — sprawdź urządzenia i ogrzewanie.',
        slightlyHigher: 'Zużycie nieco wyższe niż w poprzednim tygodniu — monitoruj zużycie.',
        lowerThanUsual: 'Zużycie niższe niż zwykle — świetne oszczędności!',
        highToday: 'Wysokie zużycie dzisiaj — sprawdź urządzenia o dużej mocy.',
        veryLow: 'Bardzo niskie zużycie dzisiaj. Wszystko wygląda dobrze!',
        normalUsage: 'Zużycie energii w normie. Kontynuuj monitorowanie.',

        // Tips
        sensorSetup: 'Użyj sensorów template do śledzenia zużycia energii przez urządzenia.',
        costTracking: 'Zaktualizuj energy_price rzeczywistą ceną energii.',
        peakHours: 'Monitoruj godziny szczytowego zużycia aby zoptymalizować użytkowanie.',
        deviceBreakdown: 'Porównuj zużycie energii na poziomie urządzeń.',
        efficientAppliances: 'Zastąp stare urządzenia certyfikowanymi urządzeniami ENERGY STAR.',

        partOfHATools: 'Część ekosystemu HA Tools',
        openToolsPanel: 'Otwórz Panel Narzędzi',
      }
    };
  }

  _t(key) {
    const lang = this._hass?.language || localStorage.getItem('ha-tools-language') || 'en';
    const T = HAEnergyInsights._translations;
    return (T[lang] || T['en'])[key] || T['en'][key] || key;
  }

  setConfig(config) {
    this._config = { ...this._config, ...config };
  }
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

  _getTariffLabel() {
    const c = this._config;
    const mode = c.energy_tariff_mode || 'flat';
    const cur = c.currency || 'PLN';
    switch (mode) {
      case 'day_night':
        return cur + ' ' + (c.energy_price_day || 0.65) + '/' + (c.energy_price_night || 0.45) + ' (dzień/noc)';
      case 'weekday_weekend':
        return cur + ' ' + (c.energy_price_weekday || 0.65) + '/' + (c.energy_price_weekend || 0.50) + ' (roboczy/weekend)';
      case 'mixed':
        return cur + ' mix: ' + (c.energy_price_wd_day || 0.65) + '/' + (c.energy_price_wd_night || 0.45) + '/' + (c.energy_price_we_day || 0.55) + '/' + (c.energy_price_we_night || 0.40);
      default:
        return cur + ' @ ' + (c.energy_price || 0.65) + '/kWh';
    }
  }

  set hass(hass) {

    if (hass?.language) this._lang = hass.language.startsWith('pl') ? 'pl' : 'en';    this._hass = hass;
    if (!hass) return;

    const now = Date.now();
    if (!this._firstHassRender) {
      this._firstHassRender = true;
      this._activeTab = localStorage.getItem('ha-energy-insights-active-tab') || 'overview';
      this._loadChartJs();
      this._fetchData();
      this._render();
      this._lastRenderTime = now;
      return;
    }

    // Fetch new data every 5 minutes (recorder stats don't change often)
    if (!this._lastDataFetch || (now - this._lastDataFetch) > 300000) {
      this._lastDataFetch = now;
      this._fetchData();
    }
  }

  connectedCallback() {
    // Cleanup on disconnect
  }

  disconnectedCallback() {
    Object.values(this._charts).forEach(c => {
      try { c.destroy(); } catch(e) {}
    });
    this._charts = {};
  }

  _sanitize(s) { try { return decodeURIComponent(escape(s)); } catch(e) { return s; } }

  // ===== DATA LOADING =====

  _loadChartJs() {
    if (window.Chart) {
      this._chartJsReady = true;
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
    script.onload = () => {
      this._chartJsReady = true;
      if (this._data) this._renderCharts();
    };
    script.onerror = () => console.warn('[ha-energy-insights] Chart.js failed to load');
    document.head.appendChild(script);
  }

  async _fetchData() {
    if (!this._hass || !this._hass.callWS) return;
    this._loading = true;
    this._error = null;
    if (this._domBuilt) this._updateLoadingState();

    try {
      // Step 1: Discover energy sensors via recorder statistic IDs
      const allStats = await this._hass.callWS({
        type: 'recorder/list_statistic_ids',
        statistic_type: 'sum'
      });
      const kwhIds = allStats
        .filter(s => s.statistics_unit_of_measurement === 'kWh' || s.statistics_unit_of_measurement === 'Wh')
        .filter(s => {
          const id = s.statistic_id;
          return !id.includes('_daily') && !id.includes('_weekly') && !id.includes('_monthly') && !id.includes('_last_') && !id.includes('_cost');
        });

      if (kwhIds.length === 0) {
        this._data = { sensors: [], noSensors: true };
        this._loading = false;
        this._updateContent();
        return;
      }

      const sensorIds = kwhIds.map(s => s.statistic_id);
      const sensorUnits = {};
      kwhIds.forEach(s => { sensorUnits[s.statistic_id] = s.statistics_unit_of_measurement; });

      // Step 2: Fetch 30 days of hourly statistics via recorder
      const now = new Date();
      const monthAgo = new Date(now.getTime() - 30 * 24 * 3600000);
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 3600000);

      const stats = await this._hass.callWS({
        type: 'recorder/statistics_during_period',
        start_time: monthAgo.toISOString(),
        end_time: now.toISOString(),
        statistic_ids: sensorIds,
        period: 'hour',
        types: ['change']
      });

      // Step 3: Aggregate data
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(now.getTime() - 7 * 24 * 3600000);
      const prevWeekStart = new Date(now.getTime() - 14 * 24 * 3600000);

      let todayKwh = 0;
      let thisWeekKwh = 0;
      let prevWeekKwh = 0;
      let monthKwh = 0;
      const hourlyToday = new Array(24).fill(0);
      const dailyWeek = new Array(7).fill(0);
      const dailyMonth = new Array(30).fill(0);
      const deviceTotals = {};

      sensorIds.forEach(id => {
        const entries = stats[id] || [];
        const isWh = sensorUnits[id] === 'Wh';
        let sensorMonthTotal = 0;

        entries.forEach(entry => {
          let change = Math.max(0, entry.change ?? 0);
          if (isWh) change /= 1000;

          const entryDate = new Date(entry.start);
          const hour = entryDate.getHours();
          const daysAgo = Math.floor((now - entryDate) / 86400000);

          // Today hourly
          if (entryDate >= todayStart) {
            hourlyToday[hour] += change;
            todayKwh += change;
          }

          // This week
          if (entryDate >= weekStart) {
            thisWeekKwh += change;
            const dayIdx = 6 - daysAgo;
            if (dayIdx >= 0 && dayIdx < 7) dailyWeek[dayIdx] += change;
          }

          // Previous week
          if (entryDate >= prevWeekStart && entryDate < weekStart) {
            prevWeekKwh += change;
          }

          // Monthly
          monthKwh += change;
          const monthDayIdx = 29 - daysAgo;
          if (monthDayIdx >= 0 && monthDayIdx < 30) dailyMonth[monthDayIdx] += change;

          sensorMonthTotal += change;
        });

        // Track per-device totals for Top Devices
        const friendlyName = this._hass.states?.[id]?.attributes?.friendly_name
          || id.replace('sensor.', '').replace(/_/g, ' ');
        const uom = this._hass.states?.[id]?.attributes?.unit_of_measurement || 'kWh';
        const rawVal = parseFloat(this._hass.states?.[id]?.state) || 0;
        deviceTotals[id] = {
          name: this._sanitize(friendlyName),
          kwh: sensorMonthTotal,
          entity_id: id,
          uom,
          rawVal
        };
      });

      // Top 5 devices by month consumption
      const topDevices = Object.values(deviceTotals)
        .filter(d => d.kwh > 0)
        .sort((a, b) => b.kwh - a.kwh)
        .slice(0, 5);

      // Round values
      const r2 = v => Math.round(v * 100) / 100;

      // Calculate tariff-aware costs
      let todayCost = 0;
      hourlyToday.forEach((kwh, hour) => {
        const dow = todayStart.getDay();
        todayCost += kwh * this._getRate(hour, dow);
      });

      let weekCost = 0;
      dailyWeek.forEach((dayKwh, dayIdx) => {
        const dayDate = new Date(now.getTime() - (6 - dayIdx) * 86400000);
        const dow = dayDate.getDay();
        weekCost += dayKwh * this._getRate(12, dow);
      });

      let monthCost = 0;
      dailyMonth.forEach((dayKwh, dayIdx) => {
        const dayDate = new Date(now.getTime() - (29 - dayIdx) * 86400000);
        const dow = dayDate.getDay();
        monthCost += dayKwh * this._getRate(12, dow);
      });

      this._data = {
        sensors: kwhIds,
        noSensors: false,
        todayKwh: r2(todayKwh),
        todayCost: r2(todayCost),
        topDevices,
        weeklyData: dailyWeek.map(r2),
        monthlyData: dailyMonth.map(r2),
        dailyData: hourlyToday.map(r2),
        thisWeekKwh: r2(thisWeekKwh),
        prevWeekKwh: r2(prevWeekKwh),
        monthKwh: r2(monthKwh),
        weekCost: r2(weekCost),
        monthCost: r2(monthCost),
      };

      this._loading = false;
      this._updateContent();
      if (this._chartJsReady) this._renderCharts();
    } catch (err) {
      console.error('[ha-energy-insights]', err);
      this._error = err.message || this._t('error');
      this._loading = false;
      this._updateContent();
    }
  }

  _getRecommendation(trendDiff, todayKwh) {
    if (trendDiff > 20) return this._t('highConsumption');
    if (trendDiff > 5)  return this._t('slightlyHigher');
    if (trendDiff < -10) return this._t('lowerThanUsual');
    if (todayKwh > 20)  return this._t('highToday');
    if (todayKwh < 1)   return this._t('veryLow');
    return this._t('normalUsage');
  }

  // ===== RENDERING =====

  _updateLoadingState() {
    const body = this.shadowRoot?.querySelector('.panel-body');
    if (!body) return;
    if (this._loading) {
      body.innerHTML = this._renderLoading();
    }
  }

  _updateContent() {
    if (!this._domBuilt) {
      this._render();
      return;
    }
    // Targeted DOM update — replace only panel-body content
    const body = this.shadowRoot?.querySelector('.panel-body');
    if (!body) return;
    if (this._loading) {
      body.innerHTML = this._renderLoading();
    } else if (this._error) {
      body.innerHTML = this._renderError();
    } else {
      body.innerHTML = this._renderTabContent();
    }
    // Update tab bar active state
    this.shadowRoot.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === this._activeTab);
    });
  }

  _render() {
    if (!this._hass) return;
    if (this._domBuilt) {
      this._updateContent();
      return;
    }
    this.shadowRoot.innerHTML = `
${this._getStyles()}
      <div class="panel-root">
        ${this._renderHeader()}
        ${this._renderTabBar()}
        <div class="panel-body">
          ${this._loading ? this._renderLoading() : ''}
          ${this._error && !this._loading ? this._renderError() : ''}
          ${!this._loading && !this._error ? this._renderTabContent() : ''}
        </div>
        ${this._renderToolsBanner()}
      </div>
    `
    this._domBuilt = true;
    this._bindEvents();
  }

  _getStyles() {
    return `
      <style>${window.HAToolsBentoCSS || ""}

        * { box-sizing: border-box; }

        
/* ===== BENTO DESIGN SYSTEM (local fallback) ===== */

:host {
  --bento-primary: #3B82F6;
  --bento-primary-hover: #2563EB;
  --bento-primary-light: rgba(59, 130, 246, 0.08);
  --bento-success: #10B981;
  --bento-success-light: rgba(16, 185, 129, 0.08);
  --bento-error: #EF4444;
  --bento-error-light: rgba(239, 68, 68, 0.08);
  --bento-warning: #F59E0B;
  --bento-warning-light: rgba(245, 158, 11, 0.08);
  --bento-bg: var(--primary-background-color, #F8FAFC);
  --bento-card: var(--card-background-color, #FFFFFF);
  --bento-border: var(--divider-color, #E2E8F0);
  --bento-text: var(--primary-text-color, #1E293B);
  --bento-text-secondary: var(--secondary-text-color, #64748B);
  --bento-text-muted: var(--disabled-text-color, #94A3B8);
  --bento-radius-xs: 6px;
  --bento-radius-sm: 10px;
  --bento-radius-md: 16px;
  --bento-shadow-sm: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06);
  --bento-shadow-md: 0 4px 12px rgba(0,0,0,0.05), 0 2px 4px rgba(0,0,0,0.04);
  --bento-shadow-lg: 0 8px 25px rgba(0,0,0,0.06), 0 4px 10px rgba(0,0,0,0.04);
  --bento-transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

:host {
          font-family: 'Inter', sans-serif;
          display: block;
          background: var(--bento-bg);
          color: var(--bento-text);
        }
        @media (prefers-color-scheme: dark) {
          :host { --bg: #0f172a; --ca: #1e293b; --bo: #334155; --tx: #e2e8f0; --t2: #94a3b8; --t3: #475569; }
        }
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        .panel-root { display: flex; flex-direction: column; height: 100%; background: var(--bento-bg); border-radius: var(--bento-radius-md); overflow: hidden; }
        .panel-header { padding: 24px 24px 16px; border-bottom: 1px solid var(--bento-border); background: var(--bento-card); border-radius: var(--bento-radius-md) var(--bento-radius-md) 0 0; }
        .panel-title { font-size: 17px; font-weight: 700; color: var(--bento-text); margin: 0; display: flex; align-items: center; gap: 10px; }
        .panel-title-icon { font-size: 24px; }
        .tabs { display: flex; gap: 4px; border-bottom: 2px solid var(--bento-border); padding: 0 24px; background: var(--bento-card); overflow-x: auto; scrollbar-width: thin; scrollbar-color: var(--bento-border) transparent; }
        .tabs::-webkit-scrollbar { height: 4px; }
        .tabs::-webkit-scrollbar-track { background: transparent; }
        .tabs::-webkit-scrollbar-thumb { background: var(--bento-border); border-radius: 4px; }
        .tab-btn { padding: 8px 16px; border: none; background: transparent; cursor: pointer; font-size: 13px; font-weight: 500; color: var(--bento-text-secondary); border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all .2s; white-space: nowrap; font-family: 'Inter', sans-serif; border-radius: 0; }
        .tab-btn:hover { color: var(--bento-primary); background: var(--bento-primary-light); }
        .tab-btn.active { color: var(--bento-primary); border-bottom-color: var(--bento-primary); font-weight: 600; }
        .panel-body { flex: 1; overflow-y: auto; padding: 20px; animation: fadeSlideIn 0.3s ease-out; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin-bottom: 16px; }
        .stat-card { background: var(--bento-bg); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); padding: 14px; text-align: center; min-width: 0; overflow: hidden; }
        .stat-card:hover { box-shadow: var(--bento-shadow-md); }
        .stat-label { font-size: 11px; font-weight: 500; color: var(--bento-text-secondary); text-transform: uppercase; letter-spacing: .4px; margin-top: 2px; }
        .stat-value { font-size: 24px; font-weight: 700; color: var(--bento-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.2; }
        .stat-value.highlight { color: var(--bento-primary); }
        .stat-sub { font-size: 11px; color: var(--bento-text-muted); margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .recommendation { background: var(--bento-primary-light); border: 1px solid rgba(59,130,246,.2); border-radius: var(--bento-radius-sm); padding: 14px 16px; font-size: 13px; color: var(--bento-text); margin-bottom: 16px; display: flex; align-items: flex-start; gap: 10px; }
        .recommendation-icon { font-size: 18px; flex-shrink: 0; }
        .trend-badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
        .trend-up { background: var(--bento-error-light); color: var(--bento-error); }
        .trend-down { background: var(--bento-success-light); color: var(--bento-success); }
        .trend-neutral { background: rgba(158,158,158,.15); color: #9e9e9e; }
        .section-title { font-size: 13px; font-weight: 600; color: var(--bento-text-secondary); text-transform: uppercase; letter-spacing: .5px; margin: 16px 0 8px; }
        .device-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 16px; }
        .device-row { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: var(--bento-radius-xs); transition: background .15s; }
        .device-row:hover { background: var(--bento-primary-light); }
        .device-rank { font-size: 11px; font-weight: 700; color: var(--bento-primary); width: 24px; flex-shrink: 0; text-align: center; }
        .device-name { font-size: 13px; font-weight: 500; flex: 1; color: var(--bento-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .device-bar-wrap { width: 70px; height: 6px; background: var(--bento-border); border-radius: 4px; overflow: hidden; flex-shrink: 0; }
        .device-bar { height: 100%; background: var(--bento-primary); border-radius: 4px; transition: width .4s; }
        .device-value { font-size: 12px; font-weight: 600; color: var(--bento-primary); flex-shrink: 0; min-width: 70px; text-align: right; }
        .chart-container { position: relative; height: 240px; margin-bottom: 12px; background: var(--bento-card); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); padding: 16px; box-shadow: var(--bento-shadow-md); }
        canvas { max-width: 100%; display: block; }
        .chart-label { text-align: center; font-size: 12px; color: var(--bento-text-secondary); margin-top: 8px; }
        .tips-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; margin-top: 16px; }
        .tip-card { background: var(--bento-card); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); padding: 14px; font-size: 13px; color: var(--bento-text); box-shadow: var(--bento-shadow-md); }
        .tip-card strong { color: var(--bento-primary); display: block; margin-bottom: 4px; font-size: 12px; text-transform: uppercase; letter-spacing: .3px; }
        .loading { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 24px; gap: 16px; color: var(--bento-text-secondary); font-size: 14px; }
        .spinner { width: 32px; height: 32px; border: 3px solid var(--bento-border); border-top-color: var(--bento-primary); border-radius: 50%; animation: spin 0.8s linear infinite; }
        .error-msg { padding: 16px; background: var(--bento-error-light); border-left: 4px solid var(--bento-error); border-radius: var(--bento-radius-xs); font-size: 13px; color: var(--bento-error); }
        .no-sensors { padding: 40px 24px; text-align: center; color: var(--bento-text-secondary); font-size: 13px; }
        button { font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 500; border-radius: var(--bento-radius-xs); transition: all .2s; cursor: pointer; border: none; padding: 8px 14px; background: var(--bento-primary); color: white; }
        button:hover { background: #2563EB; }
        .refresh-btn { background: transparent; color: var(--bento-text-secondary); padding: 4px; border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; }
        .refresh-btn:hover { color: var(--bento-primary); background: var(--bento-primary-light); }
        .refresh-btn svg { width: 18px; height: 18px; }
        .tools-banner { background: var(--bento-card); border-top: 1px solid var(--bento-border); padding: 12px 24px; text-align: center; font-size: 12px; color: var(--bento-text-secondary); }
        .tools-banner a { color: var(--bento-primary); text-decoration: none; font-weight: 600; }
        .tools-banner a:hover { text-decoration: underline; }
        @media (max-width: 768px) {
          .panel-header { padding: 16px; }
          .stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .tabs { flex-wrap: wrap; gap: 4px; padding: 0 16px; }
          .tab-btn { min-width: auto; font-size: 12px; padding: 6px 10px; }
          .device-list { overflow-x: auto; }
          .chart-container canvas { max-height: 200px; }
          .tip-card { padding: 12px; }
        }
        @media (max-width: 480px) {
          .tabs { gap: 1px; }
          .tab-btn { padding: 5px 8px; font-size: 11px; }
          .stat-value { font-size: 18px; }
        }
        @media (max-width: 360px) {
          .stats-grid { grid-template-columns: 1fr !important; }
        }
      
</style>
    `;
  }

  _renderHeader() {
    return `
      <div class="panel-header">
        <h1 class="panel-title">
          <span class="panel-title-icon">⚡</span>
          ${this._t('energyInsights')}
        </h1>
      </div>
    `;
  }

  _renderTabBar() {
    const tabs = [
      { id: 'overview', label: this._t('overview') },
      { id: 'daily', label: this._t('daily') },
      { id: 'weekly', label: this._t('weekly') },
      { id: 'monthly', label: this._t('monthly') },
      { id: 'tips', label: this._t('tips') }
    ];

    return `
      <div class="tabs">
        ${tabs.map(tab => `
          <button class="tab-btn${this._activeTab === tab.id ? ' active' : ''}" data-tab="${tab.id}">
            ${tab.label}
          </button>
        `).join('')}
      </div>
    `;
  }

  _renderLoading() {
    return `
      <div class="loading">
        <div class="spinner"></div>
        <span>${this._t('loading')}</span>
      </div>
    `;
  }

  _renderError() {
    return `<div class="error-msg">⚠ ${this._error}</div>`;
  }

  _renderTabContent() {
    if (!this._data) return '';

    if (this._data.noSensors) {
      return `<div class="no-sensors">${this._t('noSensors')}</div>`;
    }

    switch (this._activeTab) {
      case 'overview': return this._renderOverview();
      case 'daily': return this._renderChartTab('daily');
      case 'weekly': return this._renderChartTab('weekly');
      case 'monthly': return this._renderChartTab('monthly');
      case 'tips': return this._renderTips();
      default: return this._renderOverview();
    }
  }

  _renderOverview() {
    if (!this._data) return '';
    const d = this._data;
    const cur = this._config.currency || 'PLN';
    const fmt = v => v.toFixed(2);

    const trendDiff = d.prevWeekKwh > 0
      ? ((d.thisWeekKwh - d.prevWeekKwh) / d.prevWeekKwh * 100)
      : 0;
    const trendClass = trendDiff > 5 ? 'trend-up' : trendDiff < -5 ? 'trend-down' : 'trend-neutral';
    const trendIcon = trendDiff > 5 ? '↑' : trendDiff < -5 ? '↓' : '→';
    const trendLabel = trendDiff > 0 ? `+${fmt(trendDiff)}%` : `${fmt(trendDiff)}%`;
    const rec = this._getRecommendation(trendDiff, d.todayKwh);

    let html = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">${this._t('today')}</div>
          <div class="stat-value highlight">${fmt(d.todayKwh)}</div>
          <div class="stat-sub">kWh • ${fmt(d.todayCost)} ${cur}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">${this._t('thisWeek')}</div>
          <div class="stat-value">${fmt(d.thisWeekKwh)}</div>
          <div class="stat-sub">kWh • ${fmt(d.weekCost)} ${cur}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">${this._t('thisMonth')}</div>
          <div class="stat-value">${fmt(d.monthKwh)}</div>
          <div class="stat-sub">kWh • ${fmt(d.monthCost)} ${cur}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">${this._t('trend')}</div>
          <div class="stat-value"><span class="trend-badge ${trendClass}">${trendIcon} ${trendLabel}</span></div>
          <div class="stat-sub">${this._t('vsLastWeek')}</div>
        </div>
      </div>

      <div class="recommendation">
        <span class="recommendation-icon">💡</span>
        <span>${rec}</span>
      </div>
    `;

    if (d.topDevices && d.topDevices.length > 0) {
      const maxKwh = d.topDevices[0].kwh || 1;
      html += `<div class="section-title">${this._t('topDevices')}</div><div class="device-list">`;
      d.topDevices.forEach((dev, i) => {
        const pct = Math.round((dev.kwh / maxKwh) * 100);
        const valStr = dev.uom === 'W'
          ? `${dev.rawVal.toFixed(0)} W`
          : `${dev.kwh.toFixed(2)} kWh`;
        html += `
          <div class="device-row">
            <div class="device-rank">#${i + 1}</div>
            <div class="device-name" title="${dev.entity_id}">${dev.name}</div>
            <div class="device-bar-wrap"><div class="device-bar" style="width:${pct}%"></div></div>
            <div class="device-value">${valStr}</div>
          </div>
        `;
      });
      html += `</div>`;
    }

    return html;
  }

  _renderChartTab(period) {
    const labels = {
      daily: 'hourlyConsumption',
      weekly: 'dailyConsumption',
      monthly: 'monthlyConsumption'
    };
    return `
      <div class="section-title">${this._t(labels[period] || 'overview')}</div>
      <div class="chart-container">
        <canvas id="chart-${period}"></canvas>
      </div>
      <div class="chart-label">kWh • ${this._getTariffLabel()}</div>
    `;
  }

  _renderTips() {
    const tips = [
      { title: 'Sensor Setup', key: 'sensorSetup' },
      { title: 'Cost Tracking', key: 'costTracking' },
      { title: 'Peak Hours', key: 'peakHours' },
      { title: 'Device Breakdown', key: 'deviceBreakdown' },
      { title: 'Efficient Appliances', key: 'efficientAppliances' }
    ];

    return `
      <div class="tips-grid">
        ${tips.map(tip => `
          <div class="tip-card">
            <strong>💡 ${this._t(tip.key).split('—')[0].trim()}</strong>
            <span>${this._t(tip.key).split('—').pop().trim()}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  _renderToolsBanner() {
    return '';
  }

  // ===== CHARTS =====

  _renderCharts() {
    if (!window.Chart || !this._data) return;

    const chartDefs = {
      daily:   { data: this._data.dailyData,   labels: this._buildHourLabels(24) },
      weekly:  { data: this._data.weeklyData,   labels: this._buildDayLabels(7) },
      monthly: { data: this._data.monthlyData,  labels: this._buildDayLabels(30) }
    };

    if (this._activeTab in chartDefs) {
      const def = chartDefs[this._activeTab];
      const canvasId = `chart-${this._activeTab}`;
      const canvas = this.shadowRoot.getElementById(canvasId);
      if (!canvas) return;

      if (this._charts[this._activeTab]) {
        try { this._charts[this._activeTab].destroy(); } catch(e) {}
      }

      const primaryColor = getComputedStyle(this).getPropertyValue('--bento-primary').trim() || '#4A90D9';

      this._charts[this._activeTab] = new window.Chart(canvas, {
        type: 'bar',
        data: {
          labels: def.labels,
          datasets: [{
            label: 'kWh',
            data: def.data,
            backgroundColor: primaryColor + '80',
            borderColor: primaryColor,
            borderWidth: 1.5,
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => {
                  const kwh = ctx.raw || 0;
                  const hour = ctx.dataIndex || 0;
                  const rate = this._getRate(hour, new Date().getDay());
                  const cost = (kwh * rate).toFixed(2);
                  return ` ${kwh.toFixed(2)} kWh  (${cost} ${this._config.currency || 'PLN'})`;
                }
              }
            }
          },
          scales: {
            x: {
              ticks: { color: getComputedStyle(this).getPropertyValue('--bento-text-secondary').trim(), font: { size: 11 }, maxRotation: 45 },
              grid: { color: 'transparent' }
            },
            y: {
              ticks: { color: getComputedStyle(this).getPropertyValue('--bento-text-secondary').trim(), font: { size: 11 } },
              grid: { color: 'rgba(0,0,0,0.05)' },
              beginAtZero: true
            }
          }
        }
      });
    }
  }

  _buildDayLabels(days) {
    const labels = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      labels.push(`${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return labels;
  }

  _buildHourLabels(hours) {
    const labels = [];
    for (let i = 0; i < hours; i++) {
      labels.push(`${String(i).padStart(2, '0')}:00`);
    }
    return labels;
  }

  // ===== EVENT BINDING =====

  _bindEvents() {
    const shadow = this.shadowRoot;

    shadow.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._activeTab = btn.dataset.tab;
        localStorage.setItem('ha-energy-insights-active-tab', this._activeTab);
        // Update tab content only (no full DOM rebuild)
        this._updateContent();
        if (this._chartJsReady && this._data && this._activeTab !== 'overview' && this._activeTab !== 'tips') {
          setTimeout(() => this._renderCharts(), 0);
        }
      });
    });
  }
}

if (!customElements.get('ha-energy-insights')) {
  customElements.define('ha-energy-insights', HAEnergyInsights);
}



class HaEnergyInsightsEditor extends HTMLElement {
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
            :host { display:block; padding:16px; }
            h3 { margin:0 0 16px; font-size:15px; font-weight:600; color:var(--bento-text, var(--primary-text-color,#1e293b)); }
            input { outline:none; transition:border-color .2s; }
            input:focus { border-color:var(--bento-primary, var(--primary-color,#3b82f6)); }
        </style>
      <h3>Energy Insights</h3>
            <div style="margin-bottom:12px;">
              <label style="display:block;font-weight:500;margin-bottom:4px;font-size:13px;">Title</label>
              <input type="text" id="cf_title" value="${this._config?.title || 'Energy Insights'}"
                style="width:100%;padding:8px 12px;border:1px solid var(--divider-color,#e2e8f0);border-radius:8px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#1e293b);font-size:14px;box-sizing:border-box;">
            </div>
            <div style="margin-bottom:12px;">
              <label style="display:block;font-weight:500;margin-bottom:4px;font-size:13px;">Currency</label>
              <input type="text" id="cf_currency" value="${this._config?.currency || 'PLN'}"
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
  }
  connectedCallback() { this._render(); }
}
if (!customElements.get('ha-energy-insights-editor')) { customElements.define('ha-energy-insights-editor', HaEnergyInsightsEditor); }

})();

window.customCards = window.customCards || [];
window.customCards.push({ type: 'ha-energy-insights', name: 'Energy Insights', description: 'Energy dashboard: usage, costs, top devices, trends', preview: false });