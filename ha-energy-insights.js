/**
 * HA Energy Insights - Bento Light Mode Panel Tool
 * Energy monitoring with cost tracking, device breakdown, and efficiency recommendations
 * v2.0.0 - Converted from Lovelace Card to Panel Tool Pattern
 */

class HAEnergyInsights extends HTMLElement {
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

    // Configuration
    this._config = {
      title: 'Energy Insights',
      energy_cost_per_kwh: 0.72,
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
        costTracking: 'Update energy_cost_per_kwh with your local electricity rate.',
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
        costTracking: 'Zaktualizuj energy_cost_per_kwh rzeczywistą ceną energii.',
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

  // ===== PANEL TOOL SETTER (no setConfig needed) =====
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

    // Throttle re-renders: update every 5 seconds max
    if (now - (this._lastRenderTime || 0) < 5000) {
      if (!this._renderScheduled) {
        this._renderScheduled = true;
        setTimeout(() => {
          this._renderScheduled = false;
          this._fetchData();
          this._render();
          this._lastRenderTime = Date.now();
        }, 5000 - (now - (this._lastRenderTime || 0)));
      }
      return;
    }

    this._fetchData();
    this._render();
    this._lastRenderTime = now;
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
    if (!this._hass) return;
    this._loading = true;
    this._error = null;
    this._updateContent();

    try {
      const states = await this._hass.callApi('GET', 'states');
      const energySensors = this._discoverEnergySensors(states);

      if (energySensors.length === 0) {
        this._data = { sensors: [], noSensors: true };
        this._loading = false;
        this._updateContent();
        return;
      }

      // Fetch history for trends
      const history = await this._fetchHistory();

      const todayStats = this._calcTodayStats(energySensors);
      const weeklyData = this._processHistory(history, 7);
      const monthlyData = this._processHistory(history, 30);
      const dailyData = this._buildDailyFromHistory(history);
      const prevWeekData = this._calcPrevWeek(history);

      this._data = {
        sensors: energySensors,
        todayKwh: todayStats.kwh,
        todayCost: todayStats.kwh * this._config.energy_cost_per_kwh,
        topDevices: this._getTopDevices(energySensors),
        weeklyData,
        monthlyData,
        dailyData,
        thisWeekKwh: weeklyData.reduce((s, v) => s + v, 0),
        prevWeekKwh: prevWeekData,
        monthKwh: monthlyData.reduce((s, v) => s + v, 0),
      };

      this._data.monthCost = this._data.monthKwh * this._config.energy_cost_per_kwh;
      this._data.weekCost = this._data.thisWeekKwh * this._config.energy_cost_per_kwh;

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

  async _fetchHistory() {
    try {
      const days = Math.max(this._config.days_history || 7, 30);
      const start = new Date();
      start.setDate(start.getDate() - days);
      const startStr = start.toISOString();
      return await this._hass.callApi('GET', `history/period/${startStr}?significant_changes_only=false`);
    } catch (e) {
      return [];
    }
  }

  _discoverEnergySensors(states) {
    if (!Array.isArray(states)) return [];
    return states.filter(s => {
      if (!s.entity_id.startsWith('sensor.')) return false;
      const uom = s.attributes?.unit_of_measurement;
      if (!uom) return false;
      const val = parseFloat(s.state);
      if (isNaN(val) || val < 0) return false;
      return uom === 'kWh' || uom === 'W' || uom === 'Wh';
    });
  }

  _calcTodayStats(sensors) {
    let kwh = 0;
    sensors.forEach(s => {
      const uom = s.attributes?.unit_of_measurement;
      const val = parseFloat(s.state) || 0;
      if (uom === 'kWh') kwh += val;
      else if (uom === 'Wh') kwh += val / 1000;
      else if (uom === 'W') kwh += (val * 1) / 1000;
    });
    return { kwh: Math.round(kwh * 100) / 100 };
  }

  _getTopDevices(sensors) {
    return sensors
      .map(s => {
        const uom = s.attributes?.unit_of_measurement;
        const val = parseFloat(s.state) || 0;
        let kwh = 0;
        if (uom === 'kWh') kwh = val;
        else if (uom === 'Wh') kwh = val / 1000;
        else if (uom === 'W') kwh = val / 1000;
        const name = s.attributes?.friendly_name || s.entity_id.replace('sensor.', '').replace(/_/g, ' ');
        return { name, kwh, entity_id: s.entity_id, uom, rawVal: val };
      })
      .filter(d => d.kwh > 0)
      .sort((a, b) => b.kwh - a.kwh)
      .slice(0, 5);
  }

  _processHistory(history, periods) {
    if (!Array.isArray(history)) return new Array(periods).fill(0);
    const result = new Array(periods).fill(0);
    const now = new Date();
    history.forEach(entityHistory => {
      if (!Array.isArray(entityHistory) || entityHistory.length === 0) return;
      const uom = entityHistory[0]?.attributes?.unit_of_measurement;
      if (!uom || (uom !== 'kWh' && uom !== 'Wh' && uom !== 'W')) return;
      // Group entries by period bucket
      const buckets = {};
      entityHistory.forEach(entry => {
        const val = parseFloat(entry.state);
        if (isNaN(val) || val < 0) return;
        let kwh = 0;
        if (uom === 'kWh') kwh = val;
        else if (uom === 'Wh') kwh = val / 1000;
        else if (uom === 'W') kwh = val / 1000;
        const date = new Date(entry.last_changed);
        const daysAgo = Math.floor((now - date) / 86400000);
        if (daysAgo >= 0 && daysAgo < periods) {
          const idx = periods - 1 - daysAgo;
          if (!buckets[idx]) buckets[idx] = [];
          buckets[idx].push(kwh);
        }
      });
      // Calculate consumption as delta (last - first) for each period
      Object.entries(buckets).forEach(([idx, vals]) => {
        if (vals.length >= 2) {
          const delta = vals[vals.length - 1] - vals[0];
          result[parseInt(idx)] += Math.max(0, delta);
        } else if (vals.length === 1) {
          // Single reading - cannot compute delta, skip
        }
      });
    });
    return result.map(v => Math.round(v * 100) / 100);
  }

  _buildDailyFromHistory(history) {
    return this._processHistory(history, 24);
  }

  _calcPrevWeek(history) {
    if (!Array.isArray(history)) return 0;
    let total = 0;
    const now = new Date();
    history.forEach(entityHistory => {
      if (!Array.isArray(entityHistory) || entityHistory.length === 0) return;
      const uom = entityHistory[0]?.attributes?.unit_of_measurement;
      if (!uom || (uom !== 'kWh' && uom !== 'Wh')) return;
      // Get first and last readings from previous week to compute delta
      let firstVal = null, lastVal = null;
      entityHistory.forEach(entry => {
        const val = parseFloat(entry.state);
        if (isNaN(val) || val < 0) return;
        const kwh = uom === 'kWh' ? val : val / 1000;
        const date = new Date(entry.last_changed);
        const daysAgo = Math.floor((now - date) / 86400000);
        if (daysAgo >= 7 && daysAgo < 14) {
          if (firstVal === null) firstVal = kwh;
          lastVal = kwh;
        }
      });
      if (firstVal !== null && lastVal !== null) {
        total += Math.max(0, lastVal - firstVal);
      }
    });
    return Math.round(total * 100) / 100;
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

  _updateContent() {
    this._render();
  }

  _render() {
    this.shadowRoot.innerHTML = `
      <style>
${this._getStyles()}
      
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
    `;
    this._bindEvents();
  }

  _getStyles() {
    return `
/* ===== BENTO LIGHT MODE DESIGN SYSTEM ===== */

:host {
  --bento-primary: #4A90D9;
  --bento-primary-hover: #2563EB;
  --bento-primary-light: rgba(74, 144, 217, 0.08);
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
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  display: block;
  background: var(--bento-bg);
  color: var(--bento-text);
}

@keyframes fadeSlideIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (prefers-color-scheme: dark) {
  :host {
    --bento-bg: #1a1a2e;
    --bento-card: #16213e;
    --bento-text: #e2e8f0;
    --bento-text-secondary: #94a3b8;
    --bento-border: #334155;
    --bento-success: #34d399;
    --bento-warning: #fbbf24;
    --bento-error: #f87171;
  }
}

.panel-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bento-bg);
}

.panel-header {
  padding: 24px 24px 16px;
  border-bottom: 1px solid var(--bento-border);
  background: var(--bento-card);
}

.panel-title {
  font-size: 28px;
  font-weight: 700;
  color: var(--bento-text);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.panel-title-icon {
  width: 32px;
  height: 32px;
  opacity: 0.9;
}

.tab-bar {
  display: flex;
  gap: 4px;
  border-bottom: 2px solid var(--bento-border);
  padding: 0 24px;
  background: var(--bento-card);
  overflow-x: auto;
  scrollbar-width: none;
}

.tab-bar::-webkit-scrollbar { display: none; }

.tab-btn {
  padding: 12px 18px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  font-family: 'Inter', sans-serif;
  color: var(--bento-text-secondary);
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: var(--bento-transition);
  white-space: nowrap;
  border-radius: 0;
}

.tab-btn:hover {
  color: var(--bento-primary);
  background: var(--bento-primary-light);
}

.tab-btn.active {
  color: var(--bento-primary);
  border-bottom-color: var(--bento-primary);
  background: rgba(74, 144, 217, 0.04);
  font-weight: 600;
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  animation: fadeSlideIn 0.3s ease-out;
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  margin-bottom: 28px;
}

.stat-card {
  background: var(--bento-card);
  border: 1px solid var(--bento-border);
  border-radius: var(--bento-radius-sm);
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-shadow: var(--bento-shadow-sm);
  transition: var(--bento-transition);
}

.stat-card:hover {
  box-shadow: var(--bento-shadow-md);
  transform: translateY(-2px);
}

.stat-label {
  font-size: 12px;
  color: var(--bento-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--bento-text);
  line-height: 1.2;
}

.stat-value.highlight {
  color: var(--bento-primary);
}

.stat-sub {
  font-size: 12px;
  color: var(--bento-text-secondary);
}

/* Recommendation box */
.recommendation {
  background: rgba(74, 144, 217, 0.08);
  border: 1px solid rgba(74, 144, 217, 0.2);
  border-radius: var(--bento-radius-sm);
  padding: 14px 16px;
  font-size: 13px;
  color: var(--bento-text);
  margin-bottom: 24px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.recommendation-icon {
  font-size: 18px;
  flex-shrink: 0;
}

/* Trend badge */
.trend-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
}

.trend-up { background: rgba(244,67,54,0.15); color: #f44336; }
.trend-down { background: rgba(76,175,80,0.15); color: #4caf50; }
.trend-neutral { background: rgba(158,158,158,0.15); color: #9e9e9e; }

/* Section title */
.section-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--bento-text-secondary);
  margin-top: 24px;
  margin-bottom: 14px;
}

/* Device list */
.device-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 24px;
}

.device-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--bento-card);
  border: 1px solid var(--bento-border);
  border-radius: var(--bento-radius-xs);
  transition: var(--bento-transition);
}

.device-row:hover {
  background: var(--bento-primary-light);
  border-color: var(--bento-primary);
}

.device-rank {
  font-size: 11px;
  font-weight: 700;
  color: var(--bento-primary);
  width: 24px;
  flex-shrink: 0;
  text-align: center;
}

.device-name {
  font-size: 13px;
  font-weight: 500;
  flex: 1;
  color: var(--bento-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-bar-wrap {
  width: 70px;
  height: 6px;
  background: var(--bento-border);
  border-radius: 3px;
  overflow: hidden;
  flex-shrink: 0;
}

.device-bar {
  height: 100%;
  background: var(--bento-primary);
  border-radius: 3px;
  transition: width 0.4s ease;
}

.device-value {
  font-size: 12px;
  font-weight: 600;
  color: var(--bento-primary);
  flex-shrink: 0;
  min-width: 70px;
  text-align: right;
}

/* Chart */
.chart-container {
  position: relative;
  height: 240px;
  margin-bottom: 12px;
  background: var(--bento-card);
  border: 1px solid var(--bento-border);
  border-radius: var(--bento-radius-sm);
  padding: 16px;
  box-shadow: var(--bento-shadow-sm);
}

canvas {
  max-width: 100% !important;
  height: auto !important;
  width: auto !important;
  border: none !important;
}

.chart-label {
  text-align: center;
  font-size: 12px;
  color: var(--bento-text-secondary);
  margin-top: 8px;
}

/* Tips section */
.tips-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 14px;
  margin-top: 16px;
}

.tip-card {
  background: var(--bento-card);
  border: 1px solid var(--bento-border);
  border-radius: var(--bento-radius-sm);
  padding: 14px;
  font-size: 13px;
  color: var(--bento-text);
  box-shadow: var(--bento-shadow-sm);
}

.tip-card strong {
  color: var(--bento-primary);
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

/* Loading state */
.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 24px;
  gap: 16px;
  color: var(--bento-text-secondary);
  font-size: 14px;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--bento-border);
  border-top-color: var(--bento-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* Error state */
.error-msg {
  padding: 16px;
  background: var(--bento-error-light);
  border-left: 4px solid var(--bento-error);
  border-radius: var(--bento-radius-xs);
  font-size: 13px;
  color: var(--bento-error);
}

/* No sensors */
.no-sensors {
  padding: 40px 24px;
  text-align: center;
  color: var(--bento-text-secondary);
  font-size: 13px;
}

/* Buttons */
button {
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 500;
  border-radius: var(--bento-radius-xs);
  transition: var(--bento-transition);
  cursor: pointer;
  border: none;
  padding: 8px 14px;
  background: var(--bento-primary);
  color: white;
}

button:hover {
  background: var(--bento-primary-hover);
}

.refresh-btn {
  background: transparent;
  color: var(--bento-text-secondary);
  padding: 4px;
  border-radius: 50%;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.refresh-btn:hover {
  color: var(--bento-primary);
  background: var(--bento-primary-light);
}

.refresh-btn svg {
  width: 18px;
  height: 18px;
}

/* Tools banner */
.tools-banner {
  background: var(--bento-card);
  border-top: 1px solid var(--bento-border);
  padding: 12px 24px;
  text-align: center;
  font-size: 12px;
  color: var(--bento-text-secondary);
}

.tools-banner a {
  color: var(--bento-primary);
  text-decoration: none;
  font-weight: 600;
}

.tools-banner a:hover {
  text-decoration: underline;
}
/* Mobile responsive */
@media (max-width: 768px) {
  .panel-header { padding: 16px; }
  .stats-grid, .metrics-grid, .summary-grid { grid-template-columns: 1fr !important; }
  .tabs { flex-wrap: wrap; gap: 4px; }
  .tab-btn { min-width: auto; font-size: 13px; padding: 8px 12px; }
  .device-list, .top-devices { overflow-x: auto; }
  .chart-container canvas { max-height: 200px; }
  .tip-card, .insight-card { padding: 12px; }
}
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
      <div class="tab-bar">
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
      <div class="chart-label">kWh • ${this._config.currency || 'PLN'} @ ${this._config.energy_cost_per_kwh}/kWh</div>
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
    return `
      <div class="tools-banner">
        <span>${this._t('partOfHATools')}</span> |
        <a href="/local/community/ha-tools-panel/ha-tools-panel.js">${this._t('openToolsPanel')}</a>
      </div>
    `;
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
                  const cost = (kwh * this._config.energy_cost_per_kwh).toFixed(2);
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
        this._render();
        if (this._chartJsReady && this._data && this._activeTab !== 'tips') {
          // Defer chart rendering to next frame
          setTimeout(() => this._renderCharts(), 0);
        }
        this._bindEvents();
      });
    });
  }
}

customElements.define('ha-energy-insights', HAEnergyInsights);
