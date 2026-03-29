class HaEnergyOptimizer extends HTMLElement {
  constructor() {
    super();
    this._lang = (navigator.language || '').startsWith('pl') ? 'pl' : 'en';
    this.attachShadow({ mode: 'open' });
    // --- Throttle fields ---
    this._lastRenderTime = 0;
    this._renderScheduled = false;
    this._firstHassRender = false;
    // --- Pagination ---
    this._currentPage = {};
    this._pageSize = 15;
    this._hass = null;
    this._config = null;
    this._currentTab = 'dashboard';
    this._energyData = [];
    this._weeklyData = [];
    this._recommendations = [];
    this._comparisonData = null;
    this._compareMode = 'week'; // 'week' | 'month'
    this._comparePeriod = 'w-w'; // 'w-w' | 'm-m' | 'y-y'
    this._longTermData = null; // daily totals for 13 months
    // --- Real data fields ---
    this._hasRealData = false;
    this._currentPowerW = 0;
    this._statsLoading = false;
    this._lastStatsFetch = 0;
    this._energySensorIds = [];    this._charts = {};
    this._chartJsLoaded = false;
    this._domBuilt = false;
  }
  disconnectedCallback() {
    this._destroyAllCharts();
  }

  static getConfigElement() {
    return document.createElement('ha-energy-optimizer-editor');
  }

  static getStubConfig() {
    return {
      type: 'custom:ha-energy-optimizer',
      title: 'Energy Optimizer',
      currency: 'PLN',
      peak_hours: { start: 6, end: 22 },
      entities: ['sensor.energy_total', 'sensor.energy_grid']
    };
  }

  setConfig(config) {
    this._config = config;
    this._domBuilt = false;
    this._generateFallbackData();
    this._generateRecommendations();
    this._generateComparisonData();
  }

  set hass(hass) {

    if (hass?.language) this._lang = hass.language.startsWith('pl') ? 'pl' : 'en';    this._hass = hass;
    if (!hass) return;
    const now = Date.now();
    if (!this._firstHassRender) {
      this._firstHassRender = true;
      this._updateEnergyData();
      this._fetchEnergyStats();
      this._render();
      this._lastRenderTime = now;
      return;
    }
    if (now - (this._lastRenderTime || 0) < 10000) {
      if (!this._renderScheduled) {
        this._renderScheduled = true;
        setTimeout(() => {
          this._renderScheduled = false;
          const newHash = Object.keys(hass.states).length + '_' + (hass.states['sun.sun'] ? hass.states['sun.sun'].state : '');
          if (newHash === this._lastStateHash) return;
          this._lastStateHash = newHash;
      this._updateEnergyData();
          this._render();
          this._lastRenderTime = Date.now();
        }, 5000 - (now - (this._lastRenderTime || 0)));
      }
      return;
    }
      this._updateEnergyData();
    this._render();
    this._lastRenderTime = now;
  }

  async _fetchEnergyStats() {
    if (!this._hass || !this._hass.callWS) return;
    if (this._statsLoading) return;
    this._statsLoading = true;

    try {
      // Step 1: Find all kWh statistic IDs
      const allStats = await this._hass.callWS({
        type: 'recorder/list_statistic_ids',
        statistic_type: 'sum'
      });
      const kwhIds = allStats
        .filter(s => s.statistics_unit_of_measurement === 'kWh')
        .filter(s => {
          const id = s.statistic_id;
          return !id.includes('_daily') && !id.includes('_weekly') && !id.includes('_monthly') && !id.includes('_last_') && !id.includes('_cost');
        })
        .map(s => s.statistic_id);

      if (kwhIds.length === 0) {
        this._statsLoading = false;
        this._hasRealData = false; this._recommendations = []; return; // No energy sensors
      }

      this._energySensorIds = kwhIds;

      // Step 2: Fetch 7 days of hourly statistics
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 3600000);
      const stats = await this._hass.callWS({
        type: 'recorder/statistics_during_period',
        start_time: weekAgo.toISOString(),
        end_time: now.toISOString(),
        statistic_ids: kwhIds,
        period: 'hour',
        types: ['change']
      });

      // Step 3: Aggregate all sensors into hourly totals for today (24h)
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const hourlyToday = new Array(24).fill(0);

      // Step 4: Aggregate into weekly data (7 days x 24 hours)
      const weeklyHourly = Array.from({length: 7}, () => new Array(24).fill(0));

      kwhIds.forEach(id => {
        const sensorData = stats[id] || [];
        // Check unit - convert Wh to kWh if needed
        const attrs = this._hass.states?.[id]?.attributes || {};
        const isWh = attrs.unit_of_measurement === 'Wh';
        sensorData.forEach(entry => {
          let change = Math.max(0, entry.change ?? 0); // ignore negative (meter resets)
          if (isWh) change /= 1000; // Wh → kWh
          const entryDate = new Date(entry.start);
          const hour = entryDate.getHours();

          // Today's data
          if (entryDate >= todayStart) {
            hourlyToday[hour] += change;
          }

          // Weekly data - find which day (0=oldest, 6=today)
          const dayDiff = Math.floor((now - entryDate) / 86400000);
          const dayIndex = 6 - dayDiff;
          if (dayIndex >= 0 && dayIndex < 7) {
            weeklyHourly[dayIndex][hour] += change;
          }
        });
      });

      this._energyData = hourlyToday;
      this._weeklyData = weeklyHourly;
      this._hasRealData = true;

      // Step 5: Fetch long-term daily data (13 months) for comparison modes
      try {
        const yearAgo = new Date(now.getTime() - 400 * 24 * 3600000);
        const longStats = await this._hass.callWS({
          type: 'recorder/statistics_during_period',
          start_time: yearAgo.toISOString(),
          end_time: now.toISOString(),
          statistic_ids: kwhIds,
          period: 'day',
          types: ['change']
        });
        // Aggregate into daily totals keyed by 'YYYY-MM-DD'
        const dailyMap = {};
        kwhIds.forEach(id => {
          const sensorData = longStats[id] || [];
          const attrs = this._hass.states?.[id]?.attributes || {};
          const isWh = attrs.unit_of_measurement === 'Wh';
          sensorData.forEach(entry => {
            let change = Math.max(0, entry.change ?? 0);
            if (isWh) change /= 1000;
            const d = new Date(entry.start);
            const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            dailyMap[key] = (dailyMap[key] || 0) + change;
          });
        });
        this._longTermData = dailyMap;
      } catch (e) {
        console.warn('Energy Optimizer: Long-term fetch failed:', e.message);
        this._longTermData = {};
      }

      // Recalculate dependent data
      this._generateRecommendations();
      this._generateComparisonData();
      // Update DOM in place (no full rebuild)
      if (this._domBuilt) {
        this._updateDomValues();
        this._showTab(this._currentTab);
      }

    } catch (err) {
      console.warn('Energy Optimizer: Failed to fetch stats, using demo fallback:', err.message);
      // Keep existing demo data as fallback
    }
    this._statsLoading = false;
  }

  _updateEnergyData() {
    if (!this._hass) return;
    // Update current power draw from power sensors
    const powerSensors = Object.entries(this._hass.states)
      .filter(([id, s]) => {
        const dc = s.attributes.device_class;
        const unit = s.attributes.unit_of_measurement;
        return (dc === 'power' || unit === 'W') && !isNaN(parseFloat(s.state));
      });
    this._currentPowerW = powerSensors.reduce((sum, [, s]) => sum + parseFloat(s.state), 0);

    // Fetch stats every 5 minutes (not on every hass update)
    const now = Date.now();
    if (!this._lastStatsFetch || (now - this._lastStatsFetch) > 300000) {
      this._lastStatsFetch = now;
      this._fetchEnergyStats();
    }
  }

  _generateFallbackData() {
    if (this._energyData && this._energyData.length > 0) return; // Use cached data
    // Generate 24-hour energy data
    const rng = this._seededRandom('energy-demo-data');
    this._energyData = [];
    const baseUsage = 0.5;
    for (let hour = 0; hour < 24; hour++) {
      let usage = baseUsage;
      if (hour >= 6 && hour <= 9) usage += 1.2; // Morning peak
      if (hour >= 18 && hour <= 21) usage += 1.8; // Evening peak
      if (hour >= 23 || hour <= 5) usage -= 0.3; // Night low
      usage += rng() * 0.3 - 0.15; // Random variation
      this._energyData.push(Math.max(0.1, usage));
    }

    // Generate weekly data (7 days x 24 hours)
    this._weeklyData = [];
    for (let day = 0; day < 7; day++) {
      const dayData = [];
      for (let hour = 0; hour < 24; hour++) {
        let usage = baseUsage;
        if (hour >= 6 && hour <= 9) usage += (day < 5 ? 1.2 : 0.8); // Weekday vs weekend
        if (hour >= 18 && hour <= 21) usage += (day < 5 ? 1.8 : 1.0);
        if (hour >= 23 || hour <= 5) usage -= 0.3;
        usage += rng() * 0.3 - 0.15;
        dayData.push(Math.max(0.1, usage));
      }
      this._weeklyData.push(dayData);
    }
  }

  _generateRecommendations() {
    if (!this._hasRealData) { this._recommendations = []; return; }
    const peakHourStart = this._config.peak_hours?.start || 6;
    const peakHourEnd = this._config.peak_hours?.end || 22;
    const avgPeakUsage = this._energyData.slice(peakHourStart, peakHourEnd).reduce((a, b) => a + b, 0) / (peakHourEnd - peakHourStart);
    const avgOffPeakUsage = this._energyData.slice(0, peakHourStart).concat(this._energyData.slice(peakHourEnd)).reduce((a, b) => a + b, 0) / (24 - (peakHourEnd - peakHourStart));

    this._recommendations = [
      {
        id: 1,
        icon: '🧺',
        title: `Shift laundry to off-peak hours`,
        description: `Your peak usage is ${peakHourStart}-${peakHourEnd}. Running laundry at night saves up to 30% on that load.`,
        savings: 12.5,
        difficulty: 'easy',
        impact: 'high'
      },
      {
        id: 2,
        icon: '🍽️',
        title: 'Use dishwasher in off-peak time',
        description: 'Schedule dishwasher runs for morning or late evening when rates are lower.',
        savings: 8.3,
        difficulty: 'easy',
        impact: 'medium'
      },
      {
        id: 3,
        icon: '🌡️',
        title: 'Optimize thermostat settings',
        description: `Reduce heating by 1Â°C during peak hours (${peakHourStart}-${peakHourEnd}) for consistent savings.`,
        savings: 15.0,
        difficulty: 'medium',
        impact: 'high'
      },
      {
        id: 4,
        icon: '💡',
        title: 'Replace with LED lighting',
        description: 'Your evening usage spikes significantly. LED bulbs reduce lighting energy by 75%.',
        savings: 6.2,
        difficulty: 'medium',
        impact: 'medium'
      },
      {
        id: 5,
        icon: '🔌',
        title: 'Reduce standby power consumption',
        description: 'Use smart power strips to eliminate phantom loads from devices in standby mode.',
        savings: 4.5,
        difficulty: 'easy',
        impact: 'low'
      }
    ];
  }

  // Helper: sum dailyMap values in date range [from, to)
  _sumRange(from, to) {
    const dm = this._longTermData || {};
    let sum = 0;
    const d = new Date(from);
    while (d < to) {
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      sum += dm[key] || 0;
      d.setDate(d.getDate() + 1);
    }
    return sum;
  }

  // Helper: get daily totals array in date range [from, to)
  _dailyRange(from, to) {
    const dm = this._longTermData || {};
    const result = [];
    const d = new Date(from);
    while (d < to) {
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      result.push(dm[key] || 0);
      d.setDate(d.getDate() + 1);
    }
    return result;
  }

  _generateComparisonData() {
    if (!this._energyData || this._energyData.length === 0) return;
    const rate = this._config.energy_price || this._config.peak_rate || 0.65;
    const currency = this._config.currency || 'PLN';
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // === Week-to-week ===
    const thisWeekStart = new Date(today); thisWeekStart.setDate(today.getDate() - today.getDay() + 1); // Monday
    if (thisWeekStart > today) thisWeekStart.setDate(thisWeekStart.getDate() - 7);
    const lastWeekStart = new Date(thisWeekStart); lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const thisWeekKwh = this._sumRange(thisWeekStart, today);
    const lastWeekKwh = this._sumRange(lastWeekStart, thisWeekStart);
    const thisWeekDaily = this._dailyRange(thisWeekStart, today);
    const lastWeekDaily = this._dailyRange(lastWeekStart, thisWeekStart);

    // === Month-to-month ===
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thisMonthKwh = this._sumRange(thisMonthStart, today);
    const lastMonthKwh = this._sumRange(lastMonthStart, thisMonthStart);
    const thisMonthDaily = this._dailyRange(thisMonthStart, today);
    const lastMonthDaily = this._dailyRange(lastMonthStart, thisMonthStart);

    // === Year-to-year (same month last year vs this year) ===
    const lastYearMonthStart = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    const lastYearMonthEnd = new Date(now.getFullYear() - 1, now.getMonth() + 1, 0);
    lastYearMonthEnd.setDate(lastYearMonthEnd.getDate() + 1); // exclusive end
    const lastYearMonthKwh = this._sumRange(lastYearMonthStart, lastYearMonthEnd);
    const lastYearMonthDaily = this._dailyRange(lastYearMonthStart, lastYearMonthEnd);

    // Monthly totals for last 12 months (for chart)
    const monthlyTotals = [];
    for (let i = 11; i >= 0; i--) {
      const ms = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const me = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const label = ms.toLocaleString('default', { month: 'short', year: '2-digit' });
      monthlyTotals.push({ label, kwh: this._sumRange(ms, me) });
    }

    // Weekly totals for last 8 weeks
    const weeklyTotals = [];
    for (let i = 7; i >= 0; i--) {
      const ws = new Date(thisWeekStart); ws.setDate(ws.getDate() - i * 7);
      const we = new Date(ws); we.setDate(we.getDate() + 7);
      const wn = ws.toLocaleDateString('default', { day: 'numeric', month: 'short' });
      weeklyTotals.push({ label: wn, kwh: this._sumRange(ws, we > now ? today : we) });
    }

    this._comparisonData = {
      rate, currency,
      // Week
      thisWeekKwh, lastWeekKwh, thisWeekDaily, lastWeekDaily,
      // Month
      thisMonthKwh, lastMonthKwh, thisMonthDaily, lastMonthDaily,
      // Year
      lastYearMonthKwh, lastYearMonthDaily, thisMonthLabel: now.toLocaleString('default', { month: 'long' }),
      // Aggregates
      monthlyTotals, weeklyTotals
    };
  }

  _renderCompareBody() {
    const c = this._comparisonData;
    if (!c) return '<div style="text-align:center;color:var(--t2);padding:40px">Ładowanie danych...</div>';
    const mode = this._comparePeriod;
    const r = c.rate;
    const cur = c.currency;

    let currentKwh, prevKwh, currentLabel, prevLabel, chartLabels, chartCurrent, chartPrev;

    if (mode === 'w-w') {
      currentKwh = c.thisWeekKwh; prevKwh = c.lastWeekKwh;
      currentLabel = 'Ten tydzień'; prevLabel = 'Poprzedni tydz.';
      const days = ['Pn','Wt','Śr','Cz','Pt','So','Nd'];
      chartLabels = days.slice(0, Math.max(c.thisWeekDaily.length, c.lastWeekDaily.length));
      chartCurrent = c.thisWeekDaily; chartPrev = c.lastWeekDaily;
    } else if (mode === 'm-m') {
      currentKwh = c.thisMonthKwh; prevKwh = c.lastMonthKwh;
      currentLabel = 'Ten miesiąc'; prevLabel = 'Poprzedni mies.';
      const maxLen = Math.max(c.thisMonthDaily.length, c.lastMonthDaily.length);
      chartLabels = Array.from({length: maxLen}, (_, i) => i + 1);
      chartCurrent = c.thisMonthDaily; chartPrev = c.lastMonthDaily;
    } else { // y-y
      currentKwh = c.thisMonthKwh; prevKwh = c.lastYearMonthKwh;
      currentLabel = `${c.thisMonthLabel} ${new Date().getFullYear()}`;
      prevLabel = `${c.thisMonthLabel} ${new Date().getFullYear() - 1}`;
      const maxLen = Math.max(c.thisMonthDaily.length, c.lastYearMonthDaily.length);
      chartLabels = Array.from({length: maxLen}, (_, i) => i + 1);
      chartCurrent = c.thisMonthDaily; chartPrev = c.lastYearMonthDaily;
    }

    const diff = prevKwh > 0 ? ((currentKwh - prevKwh) / prevKwh * 100) : 0;
    const isUp = currentKwh > prevKwh;
    const costDiff = (currentKwh - prevKwh) * r;

    return `
      <div class="comparison-grid">
        <div class="comparison-card">
          <div class="comparison-title">${currentLabel}</div>
          <div class="comparison-value">${currentKwh.toFixed(1)}</div>
          <div class="comparison-title">kWh • ${(currentKwh * r).toFixed(2)} ${cur}</div>
        </div>
        <div class="comparison-card">
          <div class="comparison-title">${prevLabel}</div>
          <div class="comparison-value">${prevKwh.toFixed(1)}</div>
          <div class="comparison-title">kWh • ${(prevKwh * r).toFixed(2)} ${cur}</div>
          <div class="change-indicator ${isUp ? 'change-up' : 'change-down'}">
            ${isUp ? '▲' : '▼'} ${Math.abs(diff).toFixed(1)}%
          </div>
        </div>
      </div>

      <div class="chart-container">
        <div class="chart-title">
          <span>${currentLabel} vs ${prevLabel}</span>
          <span style="font-size:12px;color:var(--t2);font-weight:400">kWh/dzień</span>
        </div>
        <canvas id="comparison-chart"></canvas>
      </div>

      <div class="stats-row">
        <div class="stat-item">
          <div class="stat-label">Różnica kosztów</div>
          <div class="stat-value" style="color:${isUp ? 'var(--er)' : 'var(--ok)'}">${costDiff >= 0 ? '+' : ''}${costDiff.toFixed(2)} ${cur}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Śr. dzienny koszt (teraz)</div>
          <div class="stat-value">${chartCurrent.length > 0 ? ((currentKwh / chartCurrent.length) * r).toFixed(2) : '—'} ${cur}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Śr. dzienny koszt (poprz.)</div>
          <div class="stat-value">${chartPrev.length > 0 ? ((prevKwh / chartPrev.length) * r).toFixed(2) : '—'} ${cur}</div>
        </div>
      </div>

      ${mode !== 'y-y' ? `
      <div class="chart-container" style="height:200px">
        <div class="chart-title">
          <span>${mode === 'w-w' ? 'Ostatnie 8 tygodni' : 'Ostatnie 12 miesięcy'}</span>
        </div>
        <canvas id="trend-bar-chart"></canvas>
      </div>` : ''}
    `;
  }

  _render() {
    const L = this._lang === 'pl';
    if (!this._domBuilt) {
      // First render: full DOM build
      this._destroyAllCharts();
      this.shadowRoot.innerHTML = this._getStyles() + this._getTemplate();
      this._setupEventListeners();
      this._renderCurrentTab();
      this._domBuilt = true;
    } else {
      // Subsequent renders: update values in place without rebuilding DOM
      this._updateDomValues();
      // Re-draw chart for current tab only
      this._showTab(this._currentTab);
    }
  }

  _updateDomValues() {
    const sr = this.shadowRoot;
    if (!sr) return;
    // Update summary cards
    const summaryValues = sr.querySelectorAll('.summary-value');
    if (summaryValues[0]) summaryValues[0].textContent = this._calculateTodayUsage().toFixed(2);
    if (summaryValues[1]) summaryValues[1].textContent = this._calculateTodayCost().toFixed(2);
    // 3rd card: either savings or peak hour
    if (summaryValues[2]) {
      const hasDualTariff = this._config.off_peak_rate && this._config.peak_rate !== this._config.off_peak_rate;
      summaryValues[2].textContent = hasDualTariff
        ? this._calculatePotentialSavings().toFixed(2)
        : this._getPeakHour() + ':00';
    }
    if (summaryValues[3]) summaryValues[3].textContent = this._calculateEfficiencyScore();
    // Update power draw
    const powerVal = sr.querySelector('.power-draw-value');
    if (powerVal) powerVal.textContent = (this._currentPowerW / 1000).toFixed(2);
    // Update data source badge
    const badge = sr.querySelector('.data-source-badge');
    if (badge) {
      badge.textContent = this._hasRealData
        ? `\u{1F4CA} Dane z ${(this._energySensorIds || []).length} sensor\u00F3w energii`
        : (this._statsLoading ? '\u23F3 Wczytywanie danych z recorder...' : '\u26A0\uFE0F Demo data \u2014 brak sensor\u00F3w kWh');
    }
    // Update comparison tab body
    if (this._comparisonData) {
      const cmpBody = sr.querySelector('#compare-body');
      if (cmpBody) cmpBody.innerHTML = this._renderCompareBody();
    }
    // Update pattern stats
    const statValues = sr.querySelectorAll('#patterns .stat-value');
    if (statValues[0]) statValues[0].textContent = this._energyData.reduce((a, b) => Math.max(a, b), 0).toFixed(2) + ' kWh';
    if (statValues[1]) statValues[1].textContent = (this._energyData.slice(0, this._config.peak_hours?.start || 6).reduce((a, b) => a + b, 0) / (this._config.peak_hours?.start || 6)).toFixed(2) + ' kWh/h';
    if (statValues[2]) statValues[2].textContent = this._calculatePeakRatio().toFixed(1) + ':1';
  }

  _getStyles() {
    return `
      <style>
        :host {
          --pr: #3B82F6; --pr-l: rgba(59,130,246,.1);
          --ok: #10B981; --ok-l: rgba(16,185,129,.1);
          --er: #EF4444; --er-l: rgba(239,68,68,.1);
          --wa: #F59E0B; --wa-l: rgba(245,158,11,.1);
          --bg: var(--primary-background-color, #F8FAFC); --ca: var(--card-background-color, #FFFFFF); --bo: var(--divider-color, #E2E8F0);
          --tx: var(--primary-text-color, #1E293B); --t2: var(--secondary-text-color, #64748B); --t3: var(--disabled-text-color, #94A3B8);
          --r1: 6px; --r2: 12px; --r3: 16px;
          --sh: 0 1px 3px rgba(0,0,0,.05);
          font-family: 'Inter', sans-serif;
        }
        @media (prefers-color-scheme: dark) {
          :host { --bg: #0f172a; --ca: #1e293b; --bo: #334155; --tx: #e2e8f0; --t2: #94a3b8; --t3: #475569; }
        }
        .card-container { background: var(--ca); border: 1px solid var(--bo); border-radius: var(--r3); padding: 20px; box-shadow: var(--sh); }
        .card-title { font-size: 17px; font-weight: 700; color: var(--tx); margin: 0 0 4px; }
        .data-source-badge { font-size: 11px; color: var(--t3); margin-bottom: 14px; }
        .tabs { display: flex; gap: 4px; border-bottom: 2px solid var(--bo); margin-bottom: 18px; overflow-x: auto; overflow-y: hidden; }
        .tab-button { padding: 8px 16px; border: none; background: transparent; cursor: pointer; font-size: 13px; font-weight: 500; color: var(--t2); border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all .2s; white-space: nowrap; font-family: 'Inter', sans-serif; border-radius: 0; }
        .tab-button:hover { color: var(--pr); background: var(--pr-l); }
        .tab-button.active { color: var(--pr); border-bottom-color: var(--pr); font-weight: 600; }
        .tab-content { display: none; }
        .tab-content.active { display: block; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin-bottom: 16px; }
        .summary-card { background: var(--bg); border: 1px solid var(--bo); border-radius: var(--r2); padding: 14px; text-align: center; }
        .summary-card.alt { border-left: 3px solid var(--pr); }
        .summary-card.warn { border-left: 3px solid var(--wa); }
        .summary-label { font-size: 11px; font-weight: 500; color: var(--t2); text-transform: uppercase; letter-spacing: .4px; }
        .summary-value { font-size: 24px; font-weight: 700; color: var(--tx); }
        .power-draw { text-align: center; padding: 14px; background: var(--bg); border: 1px solid var(--bo); border-radius: var(--r2); margin-bottom: 16px; }
        .power-draw-value { font-size: 28px; font-weight: 700; color: var(--pr); }
        .power-draw-unit { font-size: 11px; color: var(--t2); text-transform: uppercase; letter-spacing: .4px; }
        .chart-container { position: relative; height: 280px; background: var(--bg); border: 1px solid var(--bo); border-radius: var(--r2); padding: 14px; margin-bottom: 16px; }
        .chart-title { font-size: 13px; font-weight: 600; color: var(--tx); margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
        .chart-title span:last-child { font-size: 11px; color: var(--t2); font-weight: 400; }
        canvas { max-width: 100% !important; border: none !important; display: block !important; }
        .stats-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 16px; }
        .stat-item { background: var(--bg); border: 1px solid var(--bo); border-radius: var(--r2); padding: 14px; text-align: center; }
        .stat-label { font-size: 11px; font-weight: 500; color: var(--t2); text-transform: uppercase; letter-spacing: .4px; margin-bottom: 4px; }
        .stat-value { font-size: 18px; font-weight: 700; color: var(--tx); }
        .heatmap-legend { display: flex; gap: 16px; justify-content: center; margin-top: 10px; }
        .legend-item { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--t2); }
        .legend-color { width: 14px; height: 14px; border-radius: 3px; }
        .compare-mode-bar { display: flex; gap: 4px; margin-bottom: 16px; background: var(--bg); border: 1px solid var(--bo); border-radius: var(--r2); padding: 4px; }
        .compare-mode-btn { flex: 1; padding: 8px 10px; border: none; background: transparent; cursor: pointer; font-size: 12px; font-weight: 500; color: var(--t2); border-radius: 8px; transition: all .2s; font-family: 'Inter', sans-serif; white-space: nowrap; }
        .compare-mode-btn:hover { color: var(--pr); background: var(--pr-l); }
        .compare-mode-btn.active { color: #fff; background: var(--pr); font-weight: 600; box-shadow: 0 2px 6px rgba(59,130,246,.3); }
        .comparison-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
        .comparison-card { background: var(--bg); border: 1px solid var(--bo); border-radius: var(--r2); padding: 14px; text-align: center; }
        .comparison-title { font-size: 11px; font-weight: 500; color: var(--t2); text-transform: uppercase; letter-spacing: .4px; }
        .comparison-value { font-size: 24px; font-weight: 700; color: var(--tx); margin: 4px 0; }
        .change-indicator { font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 12px; }
        .change-up { color: var(--er); background: var(--er-l); }
        .change-down { color: var(--ok); background: var(--ok-l); }
        .change-up { color: var(--er); }
        .change-down { color: var(--ok); }
        .section-title { font-size: 13px; font-weight: 600; color: var(--t2); text-transform: uppercase; letter-spacing: .5px; margin: 16px 0 8px; }
        .recommendation { display: flex; align-items: flex-start; gap: 12px; padding: 12px; border: 1px solid var(--bo); border-radius: var(--r2); margin-bottom: 10px; transition: background .15s; }
        .recommendation:hover { background: var(--pr-l); }
        .recommendation.high { border-left: 3px solid var(--er); }
        .recommendation.medium { border-left: 3px solid var(--wa); }
        .recommendation.low { border-left: 3px solid var(--ok); }
        .rec-icon { font-size: 20px; flex-shrink: 0; }
        .rec-content { flex: 1; }
        .rec-title { font-size: 13px; font-weight: 600; color: var(--tx); margin-bottom: 4px; }
        .rec-description { font-size: 12px; color: var(--t2); line-height: 1.5; }
        .rec-footer { display: flex; gap: 8px; margin-top: 8px; }
        .savings-badge { display: inline-flex; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; background: var(--ok-l); color: var(--ok); }
        .difficulty-badge { display: inline-flex; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; background: var(--pr-l); color: var(--pr); text-transform: capitalize; }
        .pagination { display: flex; justify-content: center; align-items: center; gap: 8px; margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--bo); }
        .pagination-btn { padding: 6px 14px; border: 1.5px solid var(--bo); background: var(--ca); color: var(--tx); border-radius: var(--r1); cursor: pointer; font-size: 13px; font-weight: 500; font-family: 'Inter', sans-serif; transition: all .2s; }
        .pagination-btn:hover:not(:disabled) { background: var(--pr); color: #fff; border-color: var(--pr); }
        .pagination-btn:disabled { opacity: .4; cursor: not-allowed; }
        .pagination-info { font-size: 12px; color: var(--t2); }
        .page-size-select { padding: 5px 8px; border: 1.5px solid var(--bo); border-radius: var(--r1); font-size: 12px; font-family: 'Inter', sans-serif; background: var(--ca); color: var(--tx); }
        @media (max-width: 768px) {
          .tabs { flex-wrap: wrap; overflow-x: visible; gap: 2px; }
          .tab-button { padding: 6px 10px; font-size: 12px; }
          .card-container { padding: 14px; }
          .grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }
          .summary-value, .comparison-value { font-size: 18px; }
          .summary-label, .comparison-title { font-size: 10px; }
        }
        @media (max-width: 480px) {
          .tabs { gap: 1px; }
          .tab-button { padding: 5px 8px; font-size: 11px; }
          .summary-value, .comparison-value { font-size: 16px; }
        }
      </style>
    `;
  }

  _getTemplate() {
    return `
      <div class="card-container">
        <h2 class="card-title">${this._config.title || 'Energy Optimizer'}</h2>

        <div class="data-source-badge">
          ${this._hasRealData ? '\u{1F4CA} Dane z ' + (this._energySensorIds || []).length + ' sensor\u00F3w energii' : (this._statsLoading ? '\u23F3 Wczytywanie danych z recorder...' : '\u26A0\uFE0F Demo data \u2014 brak sensor\u00F3w kWh')}
        </div>

        <div class="tabs">
          <button class="tab-button active" data-tab="dashboard">Dashboard</button>
          <button class="tab-button" data-tab="patterns">Patterns</button>
          <button class="tab-button" data-tab="recommendations">Recommendations</button>
          <button class="tab-button" data-tab="compare">Compare</button>
        </div>

        <div id="dashboard" class="tab-content active">
          <div class="grid">
            <div class="summary-card">
              <span class="summary-label">Today's Usage</span>
              <div class="summary-value">${this._calculateTodayUsage().toFixed(2)}</div>
              <span class="summary-label">kWh</span>
            </div>
            <div class="summary-card alt">
              <span class="summary-label">Cost Estimate</span>
              <div class="summary-value">${this._calculateTodayCost().toFixed(2)}</div>
              <span class="summary-label">${this._config.currency || 'PLN'}${(this._config.off_peak_rate && this._config.peak_rate !== this._config.off_peak_rate) ? ' (dual-tariff)' : ''}</span>
            </div>
            ${(this._config.off_peak_rate && this._config.peak_rate !== this._config.off_peak_rate) ? `
            <div class="summary-card" style="border-left:3px solid var(--ok)">
              <span class="summary-label">Potential Savings</span>
              <div class="summary-value">${this._calculatePotentialSavings().toFixed(2)}</div>
              <span class="summary-label">${this._config.currency || 'PLN'}/day by shifting to off-peak</span>
            </div>` : `
            <div class="summary-card warn">
              <span class="summary-label">Peak Hour</span>
              <div class="summary-value">${this._getPeakHour()}:00</div>
              <span class="summary-label">Highest consumption</span>
            </div>`}
            <div class="summary-card">
              <span class="summary-label">Efficiency Score</span>
              <div class="summary-value">${this._calculateEfficiencyScore()}</div>
              <span class="summary-label">/ 100</span>
            </div>
          </div>

          <div class="power-draw">
            <div class="power-draw-unit">Current Power Draw</div>
            <div class="power-draw-value">${(this._currentPowerW / 1000).toFixed(2)}</div>
            <div class="power-draw-unit">kW</div>
          </div>

          <div class="chart-container">
            <div class="chart-title">
              <span>24-Hour Usage</span>
              <span style="font-size: 12px; color: var(--t2); font-weight: 400;">kWh by hour</span>
            </div>
            <canvas id="dashboard-chart"></canvas>
          </div>
        </div>

        <div id="patterns" class="tab-content">
          <div class="chart-container">
            <div class="chart-title">
              <span>Weekly Heat Map</span>
              <span style="font-size: 12px; color: var(--t2); font-weight: 400;">Energy intensity by day & hour</span>
            </div>
            <canvas id="heatmap-canvas"></canvas>
            <div class="heatmap-legend">
              <div class="legend-item">
                <div class="legend-color" style="background: #1e3a8a;"></div>
                <span>Low</span>
              </div>
              <div class="legend-item">
                <div class="legend-color" style="background: #3b82f6;"></div>
                <span>Moderate</span>
              </div>
              <div class="legend-item">
                <div class="legend-color" style="background: #fbbf24;"></div>
                <span>High</span>
              </div>
              <div class="legend-item">
                <div class="legend-color" style="background: #dc2626;"></div>
                <span>Peak</span>
              </div>
            </div>
          </div>

          <div class="stats-row">
            <div class="stat-item">
              <div class="stat-label">Peak Usage</div>
              <div class="stat-value">${(this._energyData.reduce((a, b) => Math.max(a, b))).toFixed(2)} kWh</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">Off-Peak Usage</div>
              <div class="stat-value">${(this._energyData.slice(0, this._config.peak_hours?.start || 6).reduce((a, b) => a + b, 0) / (this._config.peak_hours?.start || 6)).toFixed(2)} kWh/h</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">Ratio</div>
              <div class="stat-value">${this._calculatePeakRatio().toFixed(1)}:1</div>
            </div>
          </div>

          <div class="chart-container">
            <div class="chart-title">
              <span>7-Day Trend</span>
              <span style="font-size: 12px; color: var(--t2); font-weight: 400;">Daily consumption average</span>
            </div>
            <canvas id="trend-chart"></canvas>
          </div>

          <div class="chart-container">
            <div class="chart-title">
              <span>Day-of-Week Comparison</span>
              <span style="font-size: 12px; color: var(--t2); font-weight: 400;">Average daily usage</span>
            </div>
            <canvas id="weekday-chart"></canvas>
          </div>
        </div>

        <div id="recommendations" class="tab-content">
          <div id="recommendations-list"></div>
        </div>

        <div id="compare" class="tab-content">
          <div class="compare-mode-bar">
            <button class="compare-mode-btn ${this._comparePeriod === 'w-w' ? 'active' : ''}" data-cmp="w-w">Week vs Week</button>
            <button class="compare-mode-btn ${this._comparePeriod === 'm-m' ? 'active' : ''}" data-cmp="m-m">Month vs Month</button>
            <button class="compare-mode-btn ${this._comparePeriod === 'y-y' ? 'active' : ''}" data-cmp="y-y">Year vs Year</button>
          </div>
          <div id="compare-body">${this._renderCompareBody()}</div>
        </div>
      </div>
    `;
  }

  _setupEventListeners() {
    const sr = this.shadowRoot;
    sr.querySelectorAll('.tab-button').forEach(button => {
      button.addEventListener('click', (e) => {
        sr.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this._currentTab = e.target.dataset.tab;
        this._showTab(e.target.dataset.tab);
      });
    });
    // Comparison mode buttons (use delegation since body is rebuilt)
    sr.addEventListener('click', (e) => {
      const btn = e.target.closest('.compare-mode-btn');
      if (!btn) return;
      this._comparePeriod = btn.dataset.cmp;
      sr.querySelectorAll('.compare-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const body = sr.querySelector('#compare-body');
      if (body) body.innerHTML = this._renderCompareBody();
      this._drawComparisonChart().catch(() => {});
      this._drawTrendBarChart().catch(() => {});
    });
  }
  async _loadChartJS() {
    if (this._chartJsLoaded) {
      return window.Chart;
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js';
      script.async = true;
      script.onload = () => {
        this._chartJsLoaded = true;
        resolve(window.Chart);
      };
      script.onerror = () => {
        reject(new Error('Failed to load Chart.js'));
      };
      document.head.appendChild(script);
    });
  }

  _destroyChart(chartKey) {
    if (this._charts[chartKey]) {
      this._charts[chartKey].destroy();
      delete this._charts[chartKey];
    }
  }

  _destroyAllCharts() {
    Object.keys(this._charts).forEach(key => {
      this._destroyChart(key);
    });
  }

  _showTab(tabName) {
    const tabs = this.shadowRoot.querySelectorAll('.tab-content');
    tabs.forEach(tab => tab.classList.remove('active'));
    const tabEl = this.shadowRoot.getElementById(tabName);
    if (tabEl) {
      tabEl.classList.add('active');
    }

    // Draw charts after showing tab (needed for canvas sizing)
    setTimeout(() => {
      if (tabName === 'dashboard') {
        this._drawDashboardChart().catch(err => console.error('Dashboard chart error:', err));
      } else if (tabName === 'patterns') {
        this._drawHeatmap();
        this._drawTrendChart().catch(err => console.error('Trend chart error:', err));
        this._drawWeekdayChart().catch(err => console.error('Weekday chart error:', err));
      } else if (tabName === 'recommendations') {
        this._renderRecommendations();
      } else if (tabName === 'compare') {
        this._drawComparisonChart().catch(err => console.error('Comparison chart error:', err));
        this._drawTrendBarChart().catch(err => console.error('Trend bar chart error:', err));
      }
    }, 100);
  }

  _renderCurrentTab() {
    setTimeout(() => this._showTab('dashboard'), 100);
  }

  async _drawDashboardChart() {
    try {
      await this._loadChartJS();
      const canvas = this.shadowRoot.getElementById('dashboard-chart');
      if (!canvas) return;

      this._destroyChart('dashboard');

      const ctx = canvas.getContext('2d');
      const labels = Array.from({ length: 24 }, (_, i) => `${i}:00`);
      const data = this._energyData || Array(24).fill(0);

      const chartConfig = {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Energy Usage (kWh)',
            data: data,
            backgroundColor: data.map((val, hour) => {
              const isPeak = hour >= (this._config?.peak_hours?.start || 6) && hour < (this._config?.peak_hours?.end || 22);
              return isPeak ? 'rgba(59, 130, 246, 0.7)' : 'rgba(100, 200, 100, 0.7)';
            }),
            borderColor: data.map((val, hour) => {
              const isPeak = hour >= (this._config?.peak_hours?.start || 6) && hour < (this._config?.peak_hours?.end || 22);
              return isPeak ? 'rgb(59, 130, 246)' : 'rgb(100, 200, 100)';
            }),
            borderWidth: 1,
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: undefined,
          plugins: {
            legend: {
              display: true,
              position: 'top'
            },
            tooltip: {
              callbacks: {
                label: (context) => {
                  return `${context.formattedValue} kWh`;
                },
                title: (context) => {
                  return context[0].label;
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: 'Energy (kWh)'
              }
            },
            x: {
              title: {
                display: true,
                text: 'Hour of Day'
              }
            }
          }
        }
      };

      this._charts['dashboard'] = new window.Chart(ctx, chartConfig);
    } catch (error) {
      console.error('Error drawing dashboard chart:', error);
    }
  }
_drawHeatmap() {
    const canvas = this.shadowRoot.getElementById('heatmap-canvas');
    if (!canvas) return;

    this._fixCanvasSize(canvas);
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = rect.width * dpr;
    canvas.height = 200 * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = 200;
    const padding = 40;
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const cellWidth = (width - padding * 2) / 24;
    const cellHeight = (height - padding * 2) / 7;

    // Find min/max for color scaling
    const allValues = (this._weeklyData || []).flat();
    const minVal = allValues.length > 0 ? Math.min(...allValues) : 0;
    const maxVal = allValues.length > 0 ? Math.max(...allValues) : 1;
    const range = maxVal - minVal || 1;

    // Detect dark mode for text and border colors
    const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const textColor = isDark ? 'rgba(226, 232, 240, 0.85)' : 'rgba(0, 0, 0, 0.7)';

    // Helper to get color from value (blue to red gradient)
    const getColor = (val) => {
      const normalized = (val - minVal) / range;
      const hue = (1 - normalized) * 240; // 240 = blue, 0 = red
      return `hsl(${hue}, 70%, 50%)`;
    };

    // Draw cells
    (this._weeklyData || []).forEach((dayData, dayIndex) => {
      dayData.forEach((value, hourIndex) => {
        const x = padding + hourIndex * cellWidth;
        const y = padding + dayIndex * cellHeight;

        ctx.fillStyle = getColor(value);
        ctx.fillRect(x, y, cellWidth - 1, cellHeight - 1);

        // Draw cell border
        ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, cellWidth - 1, cellHeight - 1);
      });
    });

    // Day labels (Y-axis)
    ctx.fillStyle = textColor;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    days.forEach((day, i) => {
      const y = padding + (i + 0.5) * cellHeight;
      ctx.fillText(day, padding - 10, y);
    });

    // Hour labels (X-axis)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let h = 0; h < 24; h += 3) {
      const x = padding + (h + 0.5) * cellWidth;
      ctx.fillText(h + ':00', x, height - padding + 5);
    }

    // Legend
    ctx.fillStyle = textColor;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    const legendX = padding;
    const legendY = height - 15;
    ctx.fillText(`Min: ${minVal.toFixed(2)} kWh`, legendX, legendY);
    ctx.fillText(`Max: ${maxVal.toFixed(2)} kWh`, legendX + 120, legendY);
  }


  async _drawTrendChart() {
    try {
      await this._loadChartJS();
      const canvas = this.shadowRoot.getElementById('trend-chart');
      if (!canvas) return;

      this._destroyChart('trend');

      const ctx = canvas.getContext('2d');
      const dailyTotals = this._weeklyData?.map(day => (day || []).reduce((a, b) => a + b, 0)) || [0, 0, 0, 0, 0, 0, 0];
      const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

      const chartConfig = {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'Daily Total Usage (kWh)',
            data: dailyTotals,
            borderColor: 'rgb(59, 130, 246)',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointRadius: 5,
            pointBackgroundColor: 'rgb(59, 130, 246)',
            pointBorderColor: 'white',
            pointBorderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'top'
            },
            tooltip: {
              callbacks: {
                label: (context) => {
                  return `${context.formattedValue} kWh`;
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: 'Daily Total (kWh)'
              }
            },
            x: {
              title: {
                display: true,
                text: 'Day of Week'
              }
            }
          }
        }
      };

      this._charts['trend'] = new window.Chart(ctx, chartConfig);
    } catch (error) {
      console.error('Error drawing trend chart:', error);
    }
  }
async _drawWeekdayChart() {
    try {
      await this._loadChartJS();
      const canvas = this.shadowRoot.getElementById('weekday-chart');
      if (!canvas) return;

      this._destroyChart('weekday');

      const ctx = canvas.getContext('2d');
      const dailyTotals = this._weeklyData?.map(day => (day || []).reduce((a, b) => a + b, 0)) || [0, 0, 0, 0, 0, 0, 0];
      const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

      const chartConfig = {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Daily Total Usage (kWh)',
            data: dailyTotals,
            backgroundColor: [
              'rgba(100, 200, 100, 0.7)',
              'rgba(100, 200, 100, 0.7)',
              'rgba(100, 200, 100, 0.7)',
              'rgba(100, 200, 100, 0.7)',
              'rgba(100, 200, 100, 0.7)',
              'rgba(59, 130, 246, 0.7)',
              'rgba(59, 130, 246, 0.7)'
            ],
            borderColor: [
              'rgb(100, 200, 100)',
              'rgb(100, 200, 100)',
              'rgb(100, 200, 100)',
              'rgb(100, 200, 100)',
              'rgb(100, 200, 100)',
              'rgb(59, 130, 246)',
              'rgb(59, 130, 246)'
            ],
            borderWidth: 1,
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'top'
            },
            tooltip: {
              callbacks: {
                label: (context) => {
                  return `${context.formattedValue} kWh`;
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: 'Daily Total (kWh)'
              }
            },
            x: {
              title: {
                display: true,
                text: 'Day of Week'
              }
            }
          }
        }
      };

      this._charts['weekday'] = new window.Chart(ctx, chartConfig);
    } catch (error) {
      console.error('Error drawing weekday chart:', error);
    }
  }
async _drawComparisonChart() {
    try {
      await this._loadChartJS();
      const canvas = this.shadowRoot.getElementById('comparison-chart');
      if (!canvas) return;
      this._destroyChart('comparison');
      const ctx = canvas.getContext('2d');
      const c = this._comparisonData;
      if (!c) return;
      const mode = this._comparePeriod;

      let currentData, prevData, currentLabel, prevLabel, xLabels;
      if (mode === 'w-w') {
        currentData = c.thisWeekDaily; prevData = c.lastWeekDaily;
        currentLabel = 'Ten tydzień'; prevLabel = 'Poprzedni tydz.';
        xLabels = ['Pn','Wt','Śr','Cz','Pt','So','Nd'].slice(0, Math.max(currentData.length, prevData.length));
      } else if (mode === 'm-m') {
        currentData = c.thisMonthDaily; prevData = c.lastMonthDaily;
        currentLabel = 'Ten miesiąc'; prevLabel = 'Poprzedni mies.';
        xLabels = Array.from({length: Math.max(currentData.length, prevData.length)}, (_, i) => i + 1);
      } else {
        currentData = c.thisMonthDaily; prevData = c.lastYearMonthDaily;
        currentLabel = `${c.thisMonthLabel} ${new Date().getFullYear()}`;
        prevLabel = `${c.thisMonthLabel} ${new Date().getFullYear() - 1}`;
        xLabels = Array.from({length: Math.max(currentData.length, prevData.length)}, (_, i) => i + 1);
      }

      this._charts['comparison'] = new window.Chart(ctx, {
        type: 'bar',
        data: {
          labels: xLabels,
          datasets: [
            { label: currentLabel, data: currentData, backgroundColor: 'rgba(59,130,246,.7)', borderColor: '#3B82F6', borderWidth: 1, borderRadius: 4 },
            { label: prevLabel, data: prevData, backgroundColor: 'rgba(148,163,184,.5)', borderColor: '#94A3B8', borderWidth: 1, borderRadius: 4 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: true, position: 'top' }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${parseFloat(c.formattedValue).toFixed(2)} kWh` } } },
          scales: { y: { beginAtZero: true, title: { display: true, text: 'kWh' } }, x: { title: { display: true, text: mode === 'w-w' ? 'Dzień tygodnia' : 'Dzień miesiąca' } } }
        }
      });
    } catch (error) {
      console.error('Error drawing comparison chart:', error);
    }
  }

  async _drawTrendBarChart() {
    try {
      await this._loadChartJS();
      const canvas = this.shadowRoot.getElementById('trend-bar-chart');
      if (!canvas) return;
      this._destroyChart('trendBar');
      const ctx = canvas.getContext('2d');
      const c = this._comparisonData;
      if (!c) return;
      const mode = this._comparePeriod;

      const data = mode === 'w-w' ? c.weeklyTotals : c.monthlyTotals;
      if (!data || data.length === 0) return;

      const labels = data.map(d => d.label);
      const values = data.map(d => d.kwh);
      const colors = values.map((_, i) => i === values.length - 1 ? 'rgba(59,130,246,.8)' : 'rgba(148,163,184,.5)');

      this._charts['trendBar'] = new window.Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{ label: 'kWh', data: values, backgroundColor: colors, borderRadius: 4, borderSkipped: false }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${parseFloat(c.formattedValue).toFixed(1)} kWh` } } },
          scales: { y: { beginAtZero: true }, x: {} }
        }
      });
    } catch (error) {
      console.error('Error drawing trend bar chart:', error);
    }
  }


  _renderRecommendations() {
    const container = this.shadowRoot.getElementById('recommendations-list');
    container.innerHTML = this._recommendations.map(rec => `
      <div class="recommendation ${rec.impact}">
        <div class="rec-icon">${rec.icon}</div>
        <div class="rec-content">
          <div class="rec-title">${rec.title}</div>
          <div class="rec-description">${rec.description}</div>
          <div class="rec-footer">
            <div class="savings-badge">Save ~${rec.savings}${this._config.currency || 'PLN'}/mo</div>
            <div class="difficulty-badge">${rec.difficulty}</div>
          </div>
        </div>
      </div>
    `).join('');
  }

  _calculateTodayUsage() {
    return this._energyData.reduce((a, b) => a + b, 0);
  }

  _calculateTodayCost() {
    const peakRate = this._config.energy_price || this._config.peak_rate || 0.65;
    const offPeakRate = this._config.off_peak_rate || peakRate;
    const peakStart = this._config.peak_hours?.start || 6;
    const peakEnd = this._config.peak_hours?.end || 22;
    let cost = 0;
    this._energyData.forEach((kwh, hour) => {
      const rate = (hour >= peakStart && hour < peakEnd) ? peakRate : offPeakRate;
      cost += kwh * rate;
    });
    return cost;
  }

  _calculatePotentialSavings() {
    const peakRate = this._config.peak_rate || this._config.energy_price || 0.65;
    const offPeakRate = this._config.off_peak_rate || peakRate;
    if (peakRate === offPeakRate) return 0;
    const peakStart = this._config.peak_hours?.start || 6;
    const peakEnd = this._config.peak_hours?.end || 22;
    let savings = 0;
    this._energyData.forEach((kwh, hour) => {
      if (hour >= peakStart && hour < peakEnd) {
        savings += kwh * (peakRate - offPeakRate) * 0.3;
      }
    });
    return savings;
  }

  _getPeakHour() {
    return this._energyData.indexOf(Math.max(...this._energyData));
  }

  _calculateEfficiencyScore() {
    const peakRatio = this._calculatePeakRatio();
    const baseScore = 100;
    const peakPenalty = Math.min(30, peakRatio * 5);
    return Math.max(30, baseScore - peakPenalty).toFixed(0);
  }

  _calculatePeakRatio() {
    const peakStart = this._config.peak_hours?.start || 6;
    const peakEnd = this._config.peak_hours?.end || 22;
    const peakUsage = this._energyData.slice(peakStart, peakEnd).reduce((a, b) => a + b, 0) / (peakEnd - peakStart);
    const offPeakUsage = this._energyData.slice(0, peakStart).concat(this._energyData.slice(peakEnd)).reduce((a, b) => a + b, 0) / (24 - (peakEnd - peakStart));
    return peakUsage / offPeakUsage;
  }
  // --- Pagination helper ---
  _renderPagination(tabName, totalItems) {
    if (!this._currentPage[tabName]) this._currentPage[tabName] = 1;
    const pageSize = this._pageSize;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const page = Math.min(this._currentPage[tabName], totalPages);
    this._currentPage[tabName] = page;
    return `
      <div class="pagination">
        <button class="pagination-btn" data-page-tab="${tabName}" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>&#8249; Prev</button>
        <span class="pagination-info">${page} / ${totalPages} (${totalItems})</span>
        <button class="pagination-btn" data-page-tab="${tabName}" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>Next &#8250;</button>
        <select class="page-size-select" data-page-tab="${tabName}" data-action="page-size">
          ${[10,15,25,50].map(s => `<option value="${s}" ${s === pageSize ? 'selected' : ''}>${s}/page</option>`).join('')}
        </select>
      </div>`;
  }

  _paginateItems(items, tabName) {
    if (!this._currentPage[tabName]) this._currentPage[tabName] = 1;
    const start = (this._currentPage[tabName] - 1) * this._pageSize;
    return items.slice(start, start + this._pageSize);
  }

  _setupPaginationListeners() {
    if (!this.shadowRoot) return;
    this.shadowRoot.querySelectorAll('.pagination-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.target.dataset.pageTab;
        const page = parseInt(e.target.dataset.page);
        if (tab && page > 0) {
          this._currentPage[tab] = page;
          this._render ? this._render() : (this.render ? this.render() : this.renderCard());
        }
      });
    });
    this.shadowRoot.querySelectorAll('.page-size-select').forEach(sel => {
      sel.addEventListener('change', (e) => {
        this._pageSize = parseInt(e.target.value);
        // Reset all pages to 1
        Object.keys(this._currentPage).forEach(k => this._currentPage[k] = 1);
        this._render ? this._render() : (this.render ? this.render() : this.renderCard());
      });
    });
  }
  // --- Seeded random for stable data ---
  _seededRandom(seed) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
      h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
    }
    return () => {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };
  }
  // --- Canvas size fix for Bento CSS ---
  _fixCanvasSize(canvas) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }
  }



}

if (!customElements.get('ha-energy-optimizer')) { customElements.define('ha-energy-optimizer', HaEnergyOptimizer); }
