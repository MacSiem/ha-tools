/**
 * HA Energy Email Card v2.0.0
 * Send daily/weekly/monthly energy usage reports as HTML email.
 * Integrates with energy_reports.yaml (SMTP notify + templates).
 * v2.0.0: Fixed sensor names (utility_meter.yaml alignment), added daily report,
 *         improved HTML emails with dark-header design, fixed total_energy comparison.
 *
 * Config:
 *   type: custom:ha-energy-email
 *   title: Energy Email Reports          (optional)
 *   recipient: your@email.com (optional, shown in UI)
 *   currency: PLN                         (optional, default PLN)
 *   energy_price: 0.65                    (optional PLN/kWh)
 */
class HAEnergyEmail extends HTMLElement {
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
  }

  set hass(hass) {

    if (hass?.language) this._lang = hass.language.startsWith('pl') ? 'pl' : 'en';    this._hass = hass;
    if (!hass) return;
    const now = Date.now();
    if (!this._firstRender) {
      this._firstRender = true;
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
      title: config.title || 'Energy Email Reports',
      recipient: config.recipient || '',
      currency: config.currency || 'PLN',
      energy_price: parseFloat(config.energy_price) || 0.65,
      ...config
    };
  }

  getCardSize() { return 4; }

  static getStubConfig() {
    return {
      title: 'Energy Email Reports',
      recipient: 'your@email.com',
      currency: 'PLN',
      energy_price: 0.65
    };
  }

  // ─── helpers ─────────────────────────────────────────────────────────────────

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

  _devices() {
    return this._attr('sensor.energy_report_devices', 'devices') || [];
  }

  _autoState(id) {
    const s = this._state(id, 'unknown');
    return s === 'on' ? '\u2705 Enabled' : s === 'off' ? '\u274C Disabled' : '\u2753 Unknown';
  }

  _autoStateClass(id) {
    const s = this._state(id, 'unknown');
    return s === 'on' ? 'auto-on' : s === 'off' ? 'auto-off' : 'auto-unknown';
  }

  // ─── main render ─────────────────────────────────────────────────────────────

  _render() {
    const L = this._lang === 'pl';
    this.shadowRoot.innerHTML = `
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
          :host {
            --bg: #0f172a; --ca: #1e293b; --bo: #334155;
            --tx: #e2e8f0; --t2: #94a3b8; --t3: #475569;
          }
        }
        .card { background: var(--ca); border: 1px solid var(--bo); border-radius: var(--r3); padding: 20px; box-shadow: var(--sh); }
        .header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
        .header-icon { font-size: 24px; }
        .header-title { font-size: 17px; font-weight: 700; color: var(--tx); }
        .header-sub { font-size: 12px; color: var(--t2); margin-top: 1px; }
        .tabs { display: flex; gap: 4px; border-bottom: 2px solid var(--bo); margin-bottom: 18px; overflow-x: auto; }
        .tab { padding: 8px 16px; border: none; background: transparent; cursor: pointer; font-size: 13px; font-weight: 500; color: var(--t2); border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all .2s; white-space: nowrap; font-family: 'Inter', sans-serif; border-radius: 0; }
        .tab:hover { color: var(--pr); background: var(--pr-l); }
        .tab.active { color: var(--pr); border-bottom-color: var(--pr); font-weight: 600; }
        .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
        .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 16px; }
        @media (max-width: 500px) { .grid3 { grid-template-columns: 1fr 1fr; } }
        .stat { background: var(--bg); border: 1px solid var(--bo); border-radius: var(--r2); padding: 14px; text-align: center; }
        .stat-val { font-size: 24px; font-weight: 700; color: var(--tx); }
        .stat-lbl { font-size: 11px; font-weight: 500; color: var(--t2); text-transform: uppercase; letter-spacing: .4px; margin-top: 2px; }
        .stat-sub { font-size: 11px; color: var(--t3); margin-top: 3px; }
        .section-title { font-size: 13px; font-weight: 600; color: var(--t2); text-transform: uppercase; letter-spacing: .5px; margin: 16px 0 8px; }
        .device-row { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: var(--r1); transition: background .15s; }
        .device-row:hover { background: var(--pr-l); }
        .device-name { flex: 1; font-size: 13px; color: var(--tx); }
        .device-val { font-size: 12px; font-weight: 600; color: var(--pr); min-width: 70px; text-align: right; }
        .device-bar-wrap { flex: 1; background: var(--bo); border-radius: 4px; height: 6px; overflow: hidden; }
        .device-bar { height: 100%; background: var(--pr); border-radius: 4px; transition: width .4s; }
        .schedule-card { border: 1px solid var(--bo); border-radius: var(--r2); padding: 14px; margin-bottom: 10px; }
        .schedule-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
        .schedule-name { font-size: 14px; font-weight: 600; color: var(--tx); }
        .badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .4px; }
        .badge-ok { background: var(--ok-l); color: var(--ok); }
        .badge-er { background: var(--er-l); color: var(--er); }
        .badge-wa { background: var(--wa-l); color: var(--wa); }
        .badge-pr { background: var(--pr-l); color: var(--pr); }
        .schedule-meta { font-size: 12px; color: var(--t2); }
        .schedule-meta span { margin-right: 12px; }
        .btn-row { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
        .btn { padding: 8px 16px; border-radius: var(--r1); border: 1.5px solid var(--bo); background: var(--ca); color: var(--tx); font-size: 13px; font-weight: 500; cursor: pointer; font-family: 'Inter', sans-serif; transition: all .2s; }
        .btn:hover { background: var(--bg); }
        .btn:disabled { opacity: .45; cursor: not-allowed; }
        .btn-primary { background: var(--pr) !important; color: #fff !important; border-color: var(--pr) !important; box-shadow: 0 2px 8px rgba(59,130,246,.3); }
        .btn-primary:hover { background: #2563EB !important; }
        .btn-ok { background: var(--ok) !important; color: #fff !important; border-color: var(--ok) !important; }
        .smtp-section { background: var(--bg, #f8fafc); border: 1px solid var(--bd, #e2e8f0); border-radius: 12px; padding: 16px; margin-bottom: 16px; }
.smtp-missing { border-color: #f59e0b40; background: #fef3c720; }
.smtp-header { display: flex; align-items: center; gap: 12px; }
.smtp-icon { font-size: 24px; }
.smtp-title { font-weight: 700; font-size: 14px; color: var(--t1, #1e293b); }
.smtp-detail { font-size: 12px; color: var(--t2, #64748b); margin-top: 2px; }
.smtp-detail code { background: var(--bd, #e2e8f0); padding: 1px 6px; border-radius: 4px; font-size: 11px; }
.smtp-actions { display: flex; align-items: center; gap: 10px; margin-top: 12px; flex-wrap: wrap; }
.smtp-guide { margin-top: 16px; }
.guide-title { font-weight: 700; font-size: 14px; margin-bottom: 12px; color: var(--t1, #1e293b); }
.guide-steps { display: flex; flex-direction: column; gap: 16px; }
.guide-step { display: flex; gap: 12px; }
.step-num { flex-shrink: 0; width: 28px; height: 28px; background: var(--primary, #3b82f6); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; }
.guide-step p { margin: 4px 0; font-size: 13px; color: var(--t2, #64748b); line-height: 1.5; }
.guide-step pre { background: #1e293b; color: #e2e8f0; padding: 12px; border-radius: 8px; font-size: 12px; overflow-x: auto; line-height: 1.6; white-space: pre; margin: 8px 0; }
.guide-step a { color: var(--primary, #3b82f6); text-decoration: none; }
.guide-step a:hover { text-decoration: underline; }
.guide-alt { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--bd, #e2e8f0); }
.smtp-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
.smtp-table th { background: var(--bd, #e2e8f0); padding: 6px 10px; text-align: left; font-weight: 600; }
.smtp-table td { padding: 6px 10px; border-bottom: 1px solid var(--bd, #e2e8f020); }
.smtp-table tr:hover td { background: var(--bd, #e2e8f020); }
.toast { display: none; position: fixed; bottom: 24px; right: 24px; z-index: 9999; background: #1e293b; color: #e2e8f0; padding: 12px 20px; border-radius: var(--r2); font-size: 13px; box-shadow: 0 8px 24px rgba(0,0,0,.3); max-width: 320px; }
        .toast.show { display: block; animation: slideUp .3s ease-out; }
        @keyframes slideUp { from { opacity:0; transform: translateY(12px); } to { opacity:1; transform: translateY(0); } }
        .preview-box { background: var(--bg); border: 1px solid var(--bo); border-radius: var(--r2); padding: 16px; font-size: 13px; color: var(--tx); max-height: 320px; overflow-y: auto; }
        .preview-box h3 { font-size: 15px; margin: 0 0 10px; }
        .preview-box h4 { font-size: 13px; margin: 14px 0 6px; color: var(--t2); }
        .preview-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .preview-table th { background: var(--bo); padding: 5px 8px; text-align: left; font-weight: 600; font-size: 11px; }
        .preview-table td { padding: 5px 8px; border-bottom: 1px solid var(--bo); }
        .preview-table tr:last-child td { border-bottom: none; }
        .trend-up { color: var(--er); }
        .trend-down { color: var(--ok); }
        .info-row { display: flex; gap: 6px; align-items: flex-start; padding: 10px; background: var(--pr-l); border-radius: var(--r1); margin-bottom: 12px; font-size: 12px; color: var(--tx); }
        .auto-on { color: var(--ok); }
        .auto-off { color: var(--er); }
        .auto-unknown { color: var(--wa); }
        .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(255,255,255,.3); border-top-color: #fff; border-radius: 50%; animation: spin .6s linear infinite; margin-right: 6px; vertical-align: middle; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .last-sent { font-size: 11px; color: var(--t3); margin-top: 4px; }
      
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

      <div class="card">
        <div class="header">
          <div class="header-icon">\u{1F4E7}</div>
          <div>
            <div class="header-title">${this._config.title}</div>
            <div class="header-sub">To: ${this._config.recipient} &nbsp;\u2022&nbsp; ${this._config.currency} ${this._config.energy_price}/kWh</div>
          </div>
        </div>

        <div class="tabs">
          <button class="tab ${this._activeTab === 'overview' ? 'active' : ''}" data-tab="overview">\u{1F4CA} Overview</button>
          <button class="tab ${this._activeTab === 'schedule' ? 'active' : ''}" data-tab="schedule">\u{1F4C5} Schedule</button>
          <button class="tab ${this._activeTab === 'preview' ? 'active' : ''}" data-tab="preview">\u{1F4CB} Preview</button>
          <button class="tab ${this._activeTab === 'send' ? 'active' : ''}" data-tab="send">\u{1F4E4} Send Now</button>
        </div>

        <div id="tab-content"></div>
      </div>
      <div class="toast" id="toast"></div>
    `;

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
  }

  _injectDiscovery() {
    if (customElements.get('ha-tools-panel')) return;
    const container = this.shadowRoot.querySelector('.card');
    if (!container) return;
    if (container.querySelector('ha-tools-discovery-banner')) return;
    const _inj = () => {
      if (window.HAToolsDiscovery) {
        window.HAToolsDiscovery.inject(container, 'energy-email', true);
      }
    };
    if (window.HAToolsDiscovery) { _inj(); return; }
    const s = document.createElement('script');
    s.src = '/local/community/ha-tools-panel/ha-tools-discovery.js?_=' + Date.now();
    s.async = true;
    s.onload = _inj;
    document.head.appendChild(s);
  }
  _renderTab() {
    const el = this.shadowRoot.getElementById('tab-content');
    if (!el) return;
    switch (this._activeTab) {
      case 'overview': el.innerHTML = this._tabOverview(); break;
      case 'schedule': el.innerHTML = this._tabSchedule(); this._attachScheduleEvents(); break;
      case 'preview':  el.innerHTML = this._tabPreview(); break;
      case 'send':     el.innerHTML = this._tabSend(); this._attachSendEvents(); break;
    }
  }

  _updateLiveData() {
    if (this._activeTab !== 'send') {
      this._renderTab();
    }
  }

  // ─── tabs ─────────────────────────────────────────────────────────────────────

  _tabOverview() {
    const devices = this._devices();
    const totalMonth = this._float(this._state('sensor.energy_total', '0'));
    const totalCostMonth = this._float(this._state('sensor.energy_total_cost', '0'));

    const devData = devices.map(d => ({
      name: d.name,
      month: this._float(this._state(d.energy_month, '0')),
      lastMonth: this._float(this._state(d.energy_last_month, '0')),
      cost: this._float(this._state(d.cost_month, '0')),
    })).sort((a, b) => b.month - a.month);

    const maxMonth = devData.length ? Math.max(...devData.map(x => x.month)) : 1;

    return `
      <div class="grid3">
        <div class="stat">
          <div class="stat-val" style="color:#F59E0B">${totalMonth.toFixed(1)}</div>
          <div class="stat-lbl">kWh This Month</div>
          <div class="stat-sub">${devData.length} devices</div>
        </div>
        <div class="stat">
          <div class="stat-val" style="color:#3B82F6">${totalCostMonth.toFixed(2)}</div>
          <div class="stat-lbl">${this._config.currency} Cost</div>
          <div class="stat-sub">@ ${this._config.energy_price}/kWh</div>
        </div>
        <div class="stat">
          <div class="stat-val" style="color:#10B981">${devData.length > 0 ? devData[0].name.split(' ').slice(0,2).join(' ') : '-'}</div>
          <div class="stat-lbl">Top Consumer</div>
          <div class="stat-sub">${devData.length > 0 ? devData[0].month.toFixed(1) + ' kWh' : ''}</div>
        </div>
      </div>

      <div class="section-title">\u26A1 Energy by Device (This Month)</div>
      ${devData.map(d => {
        const pct = maxMonth > 0 ? (d.month / maxMonth * 100) : 0;
        const diff = d.month - d.lastMonth;
        const diffStr = diff === 0 ? '' : `<span class="${diff > 0 ? 'trend-up' : 'trend-down'}">${diff > 0 ? '+' : ''}${diff.toFixed(1)} kWh</span>`;
        return `
          <div class="device-row">
            <div class="device-name">${d.name}</div>
            <div class="device-bar-wrap"><div class="device-bar" style="width:${pct}%"></div></div>
            <div class="device-val">${d.month.toFixed(1)} kWh</div>
            <div style="font-size:11px;color:var(--t2);min-width:60px;text-align:right">${diffStr}</div>
          </div>`;
      }).join('') || '<div style="padding:20px;text-align:center;color:var(--t2)">No device data available. Check energy_reports.yaml sensors.</div>'}
    `;
  }

  _tabSchedule() {
    const dailyId = 'automation.send_daily_energy_report';
    const weeklyId = 'automation.send_weekly_energy_report';
    const monthlyId = 'automation.send_monthly_energy_report';
    const dailyState = this._state(dailyId, 'unknown');
    const weeklyState = this._state(weeklyId, 'unknown');
    const monthlyState = this._state(monthlyId, 'unknown');

    const badge = (state) => {
      if (state === 'on') return '<span class="badge badge-ok">\u2705 Active</span>';
      if (state === 'off') return '<span class="badge badge-er">\u274C Disabled</span>';
      return '<span class="badge badge-wa">\u2753 Unknown</span>';
    };

    return `
      ${this._renderSmtpSection()}

      <div class="schedule-card">
        <div class="schedule-row">
          <div class="schedule-name">\u2600\uFE0F Daily Report</div>
          ${badge(dailyState)}
        </div>
        <div class="schedule-meta">
          <span>\u{1F552} Every day at 07:30</span>
          <span>\u{1F4E7} ${this._config.recipient}</span>
        </div>
        <div class="schedule-meta" style="margin-top:4px">
          <span>Subject: <i>Daily Energy Report &ndash; [date]</i></span>
        </div>
        <div class="btn-row">
          ${dailyState === 'on'
            ? `<button class="btn btn-ok" id="disable-daily">Disable</button>`
            : `<button class="btn btn-primary" id="enable-daily">Enable</button>`}
        </div>
      </div>

      <div class="schedule-card">
        <div class="schedule-row">
          <div class="schedule-name">\u{1F4C6} Weekly Report</div>
          ${badge(weeklyState)}
        </div>
        <div class="schedule-meta">
          <span>\u{1F552} Every Monday at 08:00</span>
          <span>\u{1F4E7} ${this._config.recipient}</span>
        </div>
        <div class="schedule-meta" style="margin-top:4px">
          <span>Subject: <i>Weekly Energy Report &ndash; [date]</i></span>
        </div>
        <div class="btn-row">
          ${weeklyState === 'on'
            ? `<button class="btn btn-ok" id="disable-weekly">Disable</button>`
            : `<button class="btn btn-primary" id="enable-weekly">Enable</button>`}
        </div>
      </div>

      <div class="schedule-card">
        <div class="schedule-row">
          <div class="schedule-name">\u{1F4C8} Monthly Report</div>
          ${badge(monthlyState)}
        </div>
        <div class="schedule-meta">
          <span>\u{1F552} 1st of every month at 08:00</span>
          <span>\u{1F4E7} ${this._config.recipient}</span>
        </div>
        <div class="schedule-meta" style="margin-top:4px">
          <span>Subject: <i>Monthly Energy Report &ndash; [date]</i></span>
        </div>
        <div class="btn-row">
          ${monthlyState === 'on'
            ? `<button class="btn btn-ok" id="disable-monthly">Disable</button>`
            : `<button class="btn btn-primary" id="enable-monthly">Enable</button>`}
        </div>
      </div>

      <div class="section-title">\u{1F4CB} Automation Details</div>
      <div class="schedule-meta" style="line-height:1.8">
        \u2022 Daily: Trigger = time 07:30, every day<br>
        \u2022 Weekly: Trigger = time 08:00, condition = <code>now().weekday() == 0</code><br>
        \u2022 Monthly: Trigger = time 08:00, condition = <code>now().day == 1</code><br>
        \u2022 Email content = HTML from sensors in <code>packages/energy_reports.yaml</code>
      </div>
      <div style="margin-top:12px;padding:12px 16px;background:rgba(59,130,246,0.08);border-left:3px solid var(--bento-primary,#3B82F6);border-radius:6px;font-size:13px;color:var(--tx,#555);">
        <strong>\u2139\uFE0F Note:</strong> Automatic sending depends on HA automations you create (e.g. <code>automation.send_daily_energy_report</code>).
        The times above are defaults — adjust triggers and conditions in your automation YAML.
        If automations don't exist yet, use the <b>Send Now</b> tab to send manually, or copy the YAML templates from the Setup tab.
      </div>
    `;
  }

  _tabPreview() {
    const devices = this._devices();
    const devData = devices.map(d => ({
      name: d.name,
      week: this._float(this._state(d.energy_week, '0')),
      lastWeek: this._float(this._state(d.energy_last_week, '0')),
      month: this._float(this._state(d.energy_month, '0')),
      lastMonth: this._float(this._state(d.energy_last_month, '0')),
      cost: this._float(this._state(d.cost_week, '0')),
    })).sort((a, b) => b.week - a.week);

    const totalWeekEnergy = devData.reduce((s, d) => s + d.week, 0);
    const totalLastWeek = devData.reduce((s, d) => s + d.lastWeek, 0);
    const totalWeekCost = devData.reduce((s, d) => s + d.cost, 0);
    const diffEnergy = totalWeekEnergy - totalLastWeek;

    const today = new Date().toISOString().split('T')[0];

    return `
      <div class="section-title">\u{1F4CB} Weekly Report Preview &mdash; ${today}</div>
      <div class="preview-box">
        <h3>\u26A1 Weekly Energy Report &ndash; ${today}</h3>
        <h4>Summary</h4>
        <ul style="margin:0;padding-left:18px;line-height:1.8;font-size:12px;">
          <li><b>Total energy:</b> ${totalWeekEnergy.toFixed(2)} kWh
            <span class="${diffEnergy > 0 ? 'trend-up' : 'trend-down'}">
              (${diffEnergy > 0 ? '+' : ''}${diffEnergy.toFixed(2)} kWh vs last week)
            </span>
          </li>
          <li><b>Total cost:</b> ${totalWeekCost.toFixed(2)} ${this._config.currency}</li>
          <li><b>Period:</b> Last 7 days &bull; ${devData.length} devices tracked</li>
        </ul>
        <h4>Per Device Comparison</h4>
        <table class="preview-table">
          <thead><tr>
            <th>Device</th><th>This Week (kWh)</th><th>Last Week</th><th>Change</th><th>Cost (${this._config.currency})</th>
          </tr></thead>
          <tbody>
            ${devData.map(d => {
              const diff = d.week - d.lastWeek;
              return `<tr>
                <td>${d.name}</td>
                <td>${d.week.toFixed(2)}</td>
                <td>${d.lastWeek.toFixed(2)}</td>
                <td class="${diff > 0 ? 'trend-up' : diff < 0 ? 'trend-down' : ''}">${diff > 0 ? '+' : ''}${diff.toFixed(2)}</td>
                <td>${d.cost.toFixed(2)}</td>
              </tr>`;
            }).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--t2)">No device data</td></tr>'}
          </tbody>
        </table>
        <div style="margin-top:12px;font-size:11px;color:var(--t2)">
          This is a preview of the email content. The actual email includes more detail and is sent via notify.email_report.
        </div>
      </div>
    `;
  }

  _tabSend() {
    return `
      <div class="info-row">
        \u{1F4E4}&nbsp; Manually trigger an energy report email. Calls <b>notify.email_report</b> directly from HA.
      </div>

      <div class="schedule-card">
        <div class="schedule-row">
          <div class="schedule-name">\u2600\uFE0F Send Daily Report Now</div>
          <span class="badge badge-pr">Manual</span>
        </div>
        <div class="schedule-meta">Uses the daily HTML template with today&apos;s energy data.</div>
        <div id="last-daily" class="last-sent">${this._lastSent.daily ? 'Last sent: ' + this._lastSent.daily : ''}</div>
        <div class="btn-row">
          <button class="btn btn-primary" id="send-daily" ${this._sending ? 'disabled' : ''}>
            ${this._sending ? '<span class="spinner"></span>Sending...' : '\u2600\uFE0F Send Daily'}
          </button>
        </div>
      </div>

      <div class="schedule-card">
        <div class="schedule-row">
          <div class="schedule-name">\u{1F4C6} Send Weekly Report Now</div>
          <span class="badge badge-pr">Manual</span>
        </div>
        <div class="schedule-meta">Uses the weekly HTML template with this week&apos;s data.</div>
        <div id="last-weekly" class="last-sent">${this._lastSent.weekly ? 'Last sent: ' + this._lastSent.weekly : ''}</div>
        <div class="btn-row">
          <button class="btn btn-primary" id="send-weekly" ${this._sending ? 'disabled' : ''}>
            ${this._sending ? '<span class="spinner"></span>Sending...' : '\u{1F4E4} Send Weekly'}
          </button>
        </div>
      </div>

      <div class="schedule-card">
        <div class="schedule-row">
          <div class="schedule-name">\u{1F4C8} Send Monthly Report Now</div>
          <span class="badge badge-pr">Manual</span>
        </div>
        <div class="schedule-meta">Uses the monthly HTML template with this month&apos;s data.</div>
        <div id="last-monthly" class="last-sent">${this._lastSent.monthly ? 'Last sent: ' + this._lastSent.monthly : ''}</div>
        <div class="btn-row">
          <button class="btn btn-primary" id="send-monthly" ${this._sending ? 'disabled' : ''}>
            ${this._sending ? '<span class="spinner"></span>Sending...' : '\u{1F4C8} Send Monthly'}
          </button>
        </div>
      </div>

      <div class="schedule-card">
        <div class="schedule-row">
          <div class="schedule-name">\u{1F4E7} Send Quick Summary</div>
          <span class="badge badge-ok">Instant</span>
        </div>
        <div class="schedule-meta">Sends a plain-text summary of current energy stats (no HTML template needed).</div>
        <div id="last-quick" class="last-sent">${this._lastSent.quick ? 'Last sent: ' + this._lastSent.quick : ''}</div>
        <div class="btn-row">
          <button class="btn btn-ok" id="send-quick" ${this._sending ? 'disabled' : ''}>
            \u26A1 Send Quick Summary
          </button>
        </div>
      </div>
    `;
  }

  _attachSendEvents() {
    const root = this.shadowRoot;

    // Send buttons
    const sendDaily = root.getElementById('send-daily');
    const sendWeekly = root.getElementById('send-weekly');
    const sendMonthly = root.getElementById('send-monthly');
    const sendQuick = root.getElementById('send-quick');

    if (sendDaily) sendDaily.addEventListener('click', () => this._sendReport('daily'));
    if (sendWeekly) sendWeekly.addEventListener('click', () => this._sendReport('weekly'));
    if (sendMonthly) sendMonthly.addEventListener('click', () => this._sendReport('monthly'));
    if (sendQuick) sendQuick.addEventListener('click', () => this._sendReport('quick'));
  }

  // Also attach schedule tab toggle events after render
  _attachScheduleEvents() {
    const root = this.shadowRoot;
    const enableDaily = root.getElementById('enable-daily');
    const disableDaily = root.getElementById('disable-daily');
    const enableWeekly = root.getElementById('enable-weekly');
    const disableWeekly = root.getElementById('disable-weekly');
    const enableMonthly = root.getElementById('enable-monthly');
    const disableMonthly = root.getElementById('disable-monthly');
    const btnSmtpTest = root.getElementById('btn-smtp-test');
    if (btnSmtpTest) {
      const smtp = this._detectSmtp();
      btnSmtpTest.addEventListener('click', () => this._testSmtp(smtp.defaultService));
    }
    // SMTP preset buttons
    root.querySelectorAll('.smtp-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const yamlEl = root.getElementById('smtp-yaml');
        if (yamlEl) yamlEl.textContent = this._smtpYaml(btn.dataset.preset);
        root.querySelectorAll('.smtp-preset-btn').forEach(b => b.style.fontWeight = 'normal');
        btn.style.fontWeight = '700';
      });
    });
    // Copy YAML button
    const btnCopy = root.getElementById('btn-copy-yaml');
    if (btnCopy) {
      btnCopy.addEventListener('click', () => {
        const yamlEl = root.getElementById('smtp-yaml');
        if (yamlEl) {
          navigator.clipboard.writeText(yamlEl.textContent).then(() => {
            btnCopy.textContent = '\u2705 Copied!';
            setTimeout(() => { btnCopy.textContent = '\uD83D\uDCCB Copy YAML'; }, 2000);
          }).catch(() => {
            const range = document.createRange();
            range.selectNodeContents(yamlEl);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            btnCopy.textContent = '\u2705 Selected \u2014 Ctrl+C';
            setTimeout(() => { btnCopy.textContent = '\uD83D\uDCCB Copy YAML'; }, 3000);
          });
        }
      });
    }
    if (enableDaily) enableDaily.addEventListener('click', () => this._toggleAuto('automation.send_daily_energy_report', true));
    if (disableDaily) disableDaily.addEventListener('click', () => this._toggleAuto('automation.send_daily_energy_report', false));
    if (enableWeekly) enableWeekly.addEventListener('click', () => this._toggleAuto('automation.send_weekly_energy_report', true));
    if (disableWeekly) disableWeekly.addEventListener('click', () => this._toggleAuto('automation.send_weekly_energy_report', false));
    if (enableMonthly) enableMonthly.addEventListener('click', () => this._toggleAuto('automation.send_monthly_energy_report', true));
    if (disableMonthly) disableMonthly.addEventListener('click', () => this._toggleAuto('automation.send_monthly_energy_report', false));
  }

  // ─── HA service calls ─────────────────────────────────────────────────────────

  async _toggleAuto(entity_id, enable) {
    if (!this._hass) return;
    const service = enable ? 'turn_on' : 'turn_off';
    try {
      await this._hass.callService('automation', service, { entity_id });
      this._showToast(`\u2705 Automation ${enable ? 'enabled' : 'disabled'}`);
      setTimeout(() => this._renderTab(), 800);
    } catch (e) {
      this._showToast('\u274C Error: ' + (e.message || 'Unknown error'));
    }
  }

  async _sendReport(type) {
    if (!this._hass || this._sending) return;
    this._sending = true;
    this._renderTab();
    this._attachSendEvents();

    try {
      const now = new Date().toLocaleString('pl-PL', { hour12: false });

      if (type === 'daily') {
        await this._hass.callService('automation', 'trigger', {
          entity_id: 'automation.send_daily_energy_report',
          skip_condition: true
        });
        this._lastSent.daily = now;
        this._showToast('\u2705 Daily report triggered!');
      } else if (type === 'quick') {
        const devices = this._devices();
        const lines = devices.map(d => {
          const val = this._float(this._state(d.energy_week, '0'));
          const cost = this._float(this._state(d.cost_week, '0'));
          return `${d.name}: ${val.toFixed(2)} kWh (${cost.toFixed(2)} PLN)`;
        }).join('\n');
        const total = devices.reduce((s, d) => s + this._float(this._state(d.energy_week, '0')), 0);
        const totalCost = devices.reduce((s, d) => s + this._float(this._state(d.cost_week, '0')), 0);
        const msg = `\u26A1 Energy Quick Summary\n${new Date().toISOString().split('T')[0]}\n\n` +
          `Total this week: ${total.toFixed(2)} kWh | ${totalCost.toFixed(2)} ${this._config.currency}\n\nPer device:\n${lines}`;
        const _svc = this._detectSmtp().defaultService; if (!_svc) throw new Error('No SMTP notify service found'); await this._hass.callService('notify', _svc, {
          title: `\u26A1 Energy Quick Summary \u2013 ${new Date().toISOString().split('T')[0]}`,
          message: msg
        });
        this._lastSent.quick = now;
        this._showToast('\u2705 Quick summary sent!');
      } else if (type === 'weekly') {
        await this._hass.callService('automation', 'trigger', {
          entity_id: 'automation.send_weekly_energy_report',
          skip_condition: true
        });
        this._lastSent.weekly = now;
        this._showToast('\u2705 Weekly report triggered!');
      } else if (type === 'monthly') {
        await this._hass.callService('automation', 'trigger', {
          entity_id: 'automation.send_monthly_energy_report',
          skip_condition: true
        });
        this._lastSent.monthly = now;
        this._showToast('\u2705 Monthly report triggered!');
      }
    } catch (e) {
      this._showToast('\u274C Error: ' + (e.message || 'Check HA logs'));
    } finally {
      this._sending = false;
      this._renderTab();
      this._attachSendEvents();
    }
  }


  // ── SMTP Detection & Setup ──────────────────────────────────────────

  _detectSmtp() {
    if (!this._hass || !this._hass.services || !this._hass.services.notify) {
      return { found: false, services: [], defaultService: null };
    }
    const notifyServices = this._hass.services.notify;
    const smtpCandidates = [];
    for (const [key, svc] of Object.entries(notifyServices)) {
      if (key === 'persistent_notification' || key === 'notify') continue;
      const fields = svc.fields || {};
      if (fields.message || fields.title) {
        smtpCandidates.push({ service: key, name: svc.name || key, description: svc.description || '', hasTitle: !!fields.title, hasTarget: !!fields.target });
      }
    }
    const emailServices = smtpCandidates.filter(s => /email|smtp|mail/i.test(s.service) || /email|smtp|mail/i.test(s.name));
    const defaultService = emailServices.length > 0 ? emailServices[0].service : (smtpCandidates.length > 0 ? smtpCandidates[0].service : null);
    return { found: smtpCandidates.length > 0, services: smtpCandidates, emailServices, defaultService };
  }

  _smtpYaml(preset) {
    const p = {
      gmail: { server: 'smtp.gmail.com', user: 'YOUR_EMAIL@gmail.com' },
      outlook: { server: 'smtp.office365.com', user: 'YOUR_EMAIL@outlook.com' },
      custom: { server: 'smtp.your-provider.com', user: 'your@email.com' },
    }[preset] || { server: 'smtp.gmail.com', user: 'YOUR_EMAIL@gmail.com' };
    return 'notify:\n  - name: "email_report"\n    platform: smtp\n    server: "' + p.server + '"\n    port: 587\n    encryption: starttls\n    username: "' + p.user + '"\n    password: "YOUR_APP_PASSWORD"\n    sender: "' + p.user + '"\n    sender_name: "Home Assistant"\n    recipient:\n      - "' + p.user + '"';
  }

  _renderSmtpSection() {
    const smtp = this._detectSmtp();
    if (smtp.found && smtp.defaultService) {
      const svcList = (smtp.emailServices.length > 0 ? smtp.emailServices : smtp.services.slice(0,3)).map(s => `<code>notify.${s.service}</code>`).join(', ');
      return `
        <div class="smtp-section">
          <div class="smtp-header">
            <div class="smtp-icon">\u2705</div>
            <div>
              <div class="smtp-title">SMTP Configured</div>
              <div class="smtp-detail">Available: ${svcList}</div>
              <div class="smtp-detail" style="margin-top:4px">Using: <code>notify.${smtp.defaultService}</code></div>
            </div>
          </div>
          <div class="smtp-actions">
            <button class="btn btn-primary" id="btn-smtp-test">\uD83D\uDCE7 Send Test Email</button>
          </div>
        </div>`;
    }
    const gmailYaml = this._smtpYaml('gmail');
    return `
      <div class="smtp-section smtp-missing">
        <div class="smtp-header">
          <div class="smtp-icon">\u26A0\uFE0F</div>
          <div>
            <div class="smtp-title">SMTP Not Configured</div>
            <div class="smtp-detail">No email notify service detected. Follow the guide below to set it up.</div>
          </div>
        </div>
        <div class="smtp-guide">
          <div class="guide-title">\uD83D\uDCDD Setup Guide</div>
          <div class="guide-steps">
            <div class="guide-step">
              <div class="step-num">1</div>
              <div>
                <p><b>Choose your email provider</b> and copy the YAML below into <code>configuration.yaml</code>:</p>
                <div style="display:flex;gap:6px;margin:8px 0;flex-wrap:wrap">
                  <button class="btn smtp-preset-btn" data-preset="gmail" style="font-size:12px">\uD83D\uDCE7 Gmail</button>
                  <button class="btn smtp-preset-btn" data-preset="outlook" style="font-size:12px">\uD83D\uDCE8 Outlook / M365</button>
                  <button class="btn smtp-preset-btn" data-preset="custom" style="font-size:12px">\u2699\uFE0F Custom SMTP</button>
                </div>
                <div id="smtp-yaml-block">
                  <pre id="smtp-yaml">${gmailYaml}</pre>
                  <button class="btn" id="btn-copy-yaml" style="margin-top:6px;font-size:12px">\uD83D\uDCCB Copy YAML</button>
                </div>
              </div>
            </div>
            <div class="guide-step">
              <div class="step-num">2</div>
              <div>
                <p><b>For Gmail</b> \u2014 use an <a href="https://myaccount.google.com/apppasswords" target="_blank">App Password</a> (not your regular password). Enable 2FA first.</p>
                <p><b>For Outlook/M365</b> \u2014 use an App Password from <a href="https://account.live.com/proofs/AppPassword" target="_blank">Microsoft Security</a>.</p>
              </div>
            </div>
            <div class="guide-step">
              <div class="step-num">3</div>
              <div>
                <p><b>Restart Home Assistant</b> after saving. Go to <a href="/developer-tools/yaml" target="_blank">Developer Tools \u2192 YAML</a> \u2192 <b>Check &amp; Restart</b>.</p>
              </div>
            </div>
            <div class="guide-step">
              <div class="step-num">4</div>
              <div>
                <p><b>Come back here</b> \u2014 the green status will appear automatically when the notify service is detected.</p>
              </div>
            </div>
          </div>
        </div>
        <div class="guide-alt">
          <div class="guide-title">\uD83D\uDCCA SMTP Provider Reference</div>
          <table class="smtp-table">
            <tr><th>Provider</th><th>Server</th><th>Port</th><th>Notes</th></tr>
            <tr><td>Gmail</td><td>smtp.gmail.com</td><td>587</td><td>App Password required</td></tr>
            <tr><td>Outlook / M365</td><td>smtp.office365.com</td><td>587</td><td>App Password required</td></tr>
            <tr><td>Yahoo</td><td>smtp.mail.yahoo.com</td><td>587</td><td>App Password</td></tr>
            <tr><td>Zoho</td><td>smtp.zoho.com</td><td>587</td><td>Less Secure / App Pwd</td></tr>
            <tr><td>Fastmail</td><td>smtp.fastmail.com</td><td>587</td><td>App Password</td></tr>
            <tr><td>SendGrid</td><td>smtp.sendgrid.net</td><td>587</td><td>API key as password</td></tr>
          </table>
        </div>
      </div>`;
  }

  async _testSmtp(service) {
    if (!this._hass || !service) { this._showToast('\u274C No SMTP service found'); return; }
    try {
      await this._hass.callService('notify', service, {
        title: '\u2705 HA Energy Email \u2014 Test',
        message: 'This is a test email from HA Tools Energy Email.\n\nIf you see this, your SMTP is working correctly!\n\nTimestamp: ' + new Date().toISOString(),
      });
      this._showToast('\u2705 Test email sent via notify.' + service);
    } catch (e) {
      this._showToast('\u274C SMTP test failed: ' + (e.message || 'Check HA logs'));
    }
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
window.customCards.push({
  type: 'ha-energy-email',
  name: 'Energy Email Reports',
  description: 'Send daily/weekly/monthly energy reports as HTML email',
  preview: true
});

