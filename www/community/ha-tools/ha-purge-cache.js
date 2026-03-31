/**
 * HA Purge Cache v1.0.0
 * Tool for clearing browser cache, localStorage, service workers,
 * and force-reloading HA Tools scripts.
 *
 * Part of HA Tools Panel — Advanced Tools group.
 */

class HAPurgeCache extends HTMLElement {
  constructor() {
    super();
    this._lang = (navigator.language || '').startsWith('pl') ? 'pl' : 'en';
    this.attachShadow({ mode: 'open' });
    this._hass = null;
    this._stats = {};
  }

  set hass(val) {
    this._hass = val;
    if (!this._rendered) this._render();
  }

  connectedCallback() {
    const L = this._lang === 'pl';
    if (!this._rendered) this._render();
    this._collectStats();
  }

  async _collectStats() {
    const stats = {};

    // localStorage
    try {
      let lsSize = 0;
      let lsCount = localStorage.length;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        lsSize += (key.length + (localStorage.getItem(key) || '').length) * 2;
      }
      stats.localStorage = { count: lsCount, sizeKB: (lsSize / 1024).toFixed(1) };
    } catch (e) {
      stats.localStorage = { count: 0, sizeKB: '0', error: e.message };
    }

    // sessionStorage
    try {
      let ssSize = 0;
      let ssCount = sessionStorage.length;
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        ssSize += (key.length + (sessionStorage.getItem(key) || '').length) * 2;
      }
      stats.sessionStorage = { count: ssCount, sizeKB: (ssSize / 1024).toFixed(1) };
    } catch (e) {
      stats.sessionStorage = { count: 0, sizeKB: '0', error: e.message };
    }

    // Service Workers
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      stats.serviceWorkers = { count: regs.length, scopes: regs.map(r => r.scope) };
    } catch (e) {
      stats.serviceWorkers = { count: 0, scopes: [], error: e.message };
    }

    // Cache Storage API
    try {
      const names = await caches.keys();
      let totalSize = 0;
      const cacheDetails = [];
      for (const name of names) {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        cacheDetails.push({ name, entries: keys.length });
      }
      stats.cacheStorage = { count: names.length, caches: cacheDetails };
    } catch (e) {
      stats.cacheStorage = { count: 0, caches: [], error: e.message };
    }

    // HA Tools scripts info
    try {
      const panel = document.querySelector('ha-tools-panel');
      if (panel && panel.constructor.TOOL_SCRIPTS) {
        const scripts = panel.constructor.TOOL_SCRIPTS;
        stats.toolScripts = { count: Object.keys(scripts).length };
      }
    } catch (e) {
      stats.toolScripts = { count: 0 };
    }

    // HA Frontend version
    try {
      const haEl = document.querySelector('home-assistant');
      if (haEl && haEl.hass) {
        stats.haVersion = haEl.hass.config?.version || 'unknown';
      }
    } catch (e) {
      stats.haVersion = 'unknown';
    }

    this._stats = stats;
    this._updateDisplay();
  }

  _updateDisplay() {
    const root = this.shadowRoot;
    if (!root) return;

    const s = this._stats;

    // Update stat cards
    const lsEl = root.querySelector('#stat-ls');
    if (lsEl && s.localStorage) {
      lsEl.innerHTML = `<span class="stat-num">${s.localStorage.count}</span> kluczy <span class="stat-sub">(${s.localStorage.sizeKB} KB)</span>`;
    }

    const ssEl = root.querySelector('#stat-ss');
    if (ssEl && s.sessionStorage) {
      ssEl.innerHTML = `<span class="stat-num">${s.sessionStorage.count}</span> kluczy <span class="stat-sub">(${s.sessionStorage.sizeKB} KB)</span>`;
    }

    const swEl = root.querySelector('#stat-sw');
    if (swEl && s.serviceWorkers) {
      swEl.innerHTML = `<span class="stat-num">${s.serviceWorkers.count}</span> zarejestrowanych`;
    }

    const csEl = root.querySelector('#stat-cs');
    if (csEl && s.cacheStorage) {
      const total = s.cacheStorage.caches.reduce((sum, c) => sum + c.entries, 0);
      csEl.innerHTML = `<span class="stat-num">${s.cacheStorage.count}</span> cache'y <span class="stat-sub">(${total} wpisów)</span>`;
    }

    const tsEl = root.querySelector('#stat-ts');
    if (tsEl && s.toolScripts) {
      tsEl.innerHTML = `<span class="stat-num">${s.toolScripts.count}</span> skryptów`;
    }

    // HA version
    const verEl = root.querySelector('#ha-version');
    if (verEl && s.haVersion) {
      verEl.textContent = s.haVersion;
    }

    // localStorage keys detail
    this._renderLsKeys();
  }

  _renderLsKeys() {
    const container = this.shadowRoot?.querySelector('#ls-keys');
    if (!container) return;

    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const val = localStorage.getItem(key) || '';
      const sizeB = (key.length + val.length) * 2;
      keys.push({ key, sizeKB: (sizeB / 1024).toFixed(1), preview: val.substring(0, 60) });
    }
    keys.sort((a, b) => parseFloat(b.sizeKB) - parseFloat(a.sizeKB));

    container.innerHTML = keys.map(k => `
      <div class="key-row">
        <span class="key-name" title="${k.key}">${k.key.length > 40 ? k.key.substring(0, 37) + '...' : k.key}</span>
        <span class="key-size">${k.sizeKB} KB</span>
        <button class="btn-sm btn-danger" data-key="${k.key}" title="Usu\u0144 ten klucz">\u2715</button>
      </div>
    `).join('');

    container.querySelectorAll('.btn-danger[data-key]').forEach(btn => {
      btn.addEventListener('click', () => {
        localStorage.removeItem(btn.dataset.key);
        this._addLog(`Usuni\u0119to klucz: ${btn.dataset.key}`, 'success');
        this._collectStats();
      });
    });
  }

  async _purgeLocalStorage() {
    const count = localStorage.length;
    localStorage.clear();
    this._addLog(`\u2705 localStorage wyczyszczony (${count} kluczy)`, 'success');
    await this._collectStats();
  }

  async _purgeSessionStorage() {
    const count = sessionStorage.length;
    sessionStorage.clear();
    this._addLog(`\u2705 sessionStorage wyczyszczony (${count} kluczy)`, 'success');
    await this._collectStats();
  }

  async _purgeServiceWorkers() {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      let count = 0;
      for (const reg of regs) {
        await reg.unregister();
        count++;
      }
      this._addLog(`\u2705 ${count} Service Worker(s) wyrejestrowanych`, 'success');
    } catch (e) {
      this._addLog(`\u274C B\u0142\u0105d SW: ${e.message}`, 'error');
    }
    await this._collectStats();
  }

  async _purgeCacheStorage() {
    try {
      const names = await caches.keys();
      let count = 0;
      for (const name of names) {
        await caches.delete(name);
        count++;
      }
      this._addLog(`\u2705 ${count} Cache Storage usuni\u0119tych`, 'success');
    } catch (e) {
      this._addLog(`\u274C B\u0142\u0105d Cache: ${e.message}`, 'error');
    }
    await this._collectStats();
  }

  async _forceReloadTools() {
    try {
      const panel = document.querySelector('ha-tools-panel');
      if (!panel || !panel.constructor.TOOL_SCRIPTS) {
        this._addLog('\u274C Nie znaleziono HA Tools Panel', 'error');
        return;
      }
      const scripts = panel.constructor.TOOL_SCRIPTS;
      const tags = Object.keys(scripts);
      let loaded = 0;

      for (const tag of tags) {
        const url = scripts[tag] + '?_force=' + Date.now();
        try {
          const resp = await fetch(url, { cache: 'no-store' });
          if (resp.ok) loaded++;
        } catch (e) {
          // ignore individual failures
        }
      }
      this._addLog(`\u2705 Prze\u0142adowano ${loaded}/${tags.length} skrypt\u00F3w narz\u0119dzi (cache: no-store)`, 'success');
    } catch (e) {
      this._addLog(`\u274C B\u0142\u0105d: ${e.message}`, 'error');
    }
  }

  async _purgeAll() {
    this._addLog('\u{1F9F9} Rozpoczynam pe\u0142ne czyszczenie...', 'info');
    await this._purgeLocalStorage();
    await this._purgeSessionStorage();
    await this._purgeServiceWorkers();
    await this._purgeCacheStorage();
    await this._forceReloadTools();
    this._addLog('\u{1F389} Gotowe! Zalecany hard reload (Ctrl+Shift+R)', 'success');
  }

  _hardReload() {
    this._addLog('\u{1F504} Hard reload za 1s...', 'info');
    setTimeout(() => {
      location.reload(true);
    }, 1000);
  }

  _addLog(msg, type = 'info') {
    const logEl = this.shadowRoot?.querySelector('#action-log');
    if (!logEl) return;
    const time = new Date().toLocaleTimeString('pl-PL');
    const typeClass = type === 'success' ? 'log-success' : type === 'error' ? 'log-error' : 'log-info';
    const entry = document.createElement('div');
    entry.className = `log-entry ${typeClass}`;
    entry.innerHTML = `<span class="log-time">${time}</span> ${msg}`;
    logEl.prepend(entry);
  }

  _render() {
    this._rendered = true;
    this.shadowRoot.innerHTML = `
      <style>${window.HAToolsBentoCSS || ""}

        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

        :host {
          display: block;
          font-family: 'Inter', sans-serif;
          color: var(--primary-text-color, #1a1a2e);
          --pc-primary: #3B82F6;
          --pc-primary-hover: #2563EB;
          --pc-danger: #EF4444;
          --pc-danger-hover: #DC2626;
          --pc-success: #10B981;
          --pc-warning: #F59E0B;
          --pc-bg: var(--card-background-color, #ffffff);
          --pc-border: var(--divider-color, #e2e8f0);
          --pc-text: var(--primary-text-color, #1a1a2e);
          --pc-text-sec: var(--secondary-text-color, #64748b);
          --pc-radius: 12px;
        }

        .card { max-width: 900px; margin: 0 auto; padding: 16px; }
        h2 { font-size: 20px; font-weight: 700; margin: 0 0 4px; }
        .subtitle { color: var(--pc-text-sec); font-size: 13px; margin-bottom: 20px; }
        .ha-ver { font-size: 12px; color: var(--pc-text-sec); font-weight: 400; }

        /* Stats Grid */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 12px;
          margin-bottom: 20px;
        }
        .stat-card {
          background: var(--pc-bg);
          border: 1.5px solid var(--pc-border);
          border-radius: var(--pc-radius);
          padding: 14px;
        }
        .stat-label { font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--pc-text-sec); letter-spacing: 0.5px; margin-bottom: 6px; }
        .stat-value { font-size: 14px; font-weight: 500; }
        .stat-num { font-size: 22px; font-weight: 700; color: var(--pc-primary); }
        .stat-sub { font-size: 12px; color: var(--pc-text-sec); }

        /* Actions */
        .actions-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 10px;
          margin-bottom: 20px;
        }
        .action-btn {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 16px;
          border: 1.5px solid var(--pc-border);
          border-radius: var(--pc-radius);
          background: var(--pc-bg);
          cursor: pointer;
          font-family: 'Inter', sans-serif;
          font-size: 13px;
          font-weight: 500;
          color: var(--pc-text);
          transition: all 0.15s ease;
        }
        .action-btn:hover { border-color: var(--pc-primary); background: rgba(59, 130, 246, 0.04); }
        .action-btn .action-icon { font-size: 20px; }
        .action-btn .action-label { line-height: 1.3; }
        .action-btn .action-desc { font-size: 11px; color: var(--pc-text-sec); font-weight: 400; }

        .action-btn.danger { border-color: rgba(239, 68, 68, 0.3); }
        .action-btn.danger:hover { border-color: var(--pc-danger); background: rgba(239, 68, 68, 0.04); }

        .action-btn.primary { border-color: var(--pc-primary); background: rgba(59, 130, 246, 0.06); }
        .action-btn.primary:hover { background: var(--pc-primary); color: white; }

        /* Log */
        .log-section {
          border: 1.5px solid var(--pc-border);
          border-radius: var(--pc-radius);
          overflow: hidden;
          margin-bottom: 20px;
        }
        .log-header {
          padding: 10px 14px;
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--pc-text-sec);
          border-bottom: 1px solid var(--pc-border);
          background: rgba(0,0,0,0.02);
        }
        #action-log {
          max-height: 200px;
          overflow-y: auto;
          padding: 8px;
        }
        .log-entry {
          padding: 6px 10px;
          font-size: 12px;
          border-radius: 6px;
          margin-bottom: 4px;
        }
        .log-success { background: rgba(16, 185, 129, 0.08); color: #065f46; }
        .log-error { background: rgba(239, 68, 68, 0.08); color: #991b1b; }
        .log-info { background: rgba(59, 130, 246, 0.06); color: #1e40af; }
        .log-time { font-weight: 600; margin-right: 8px; opacity: 0.6; }

        /* LS Keys */
        .keys-section {
          border: 1.5px solid var(--pc-border);
          border-radius: var(--pc-radius);
          overflow: hidden;
        }
        .keys-header {
          padding: 10px 14px;
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--pc-text-sec);
          border-bottom: 1px solid var(--pc-border);
          background: rgba(0,0,0,0.02);
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
        }
        .keys-header .chevron { transition: transform 0.2s; }
        .keys-header.collapsed .chevron { transform: rotate(-90deg); }
        #ls-keys {
          max-height: 300px;
          overflow-y: auto;
          padding: 6px;
        }
        #ls-keys.hidden { display: none; }
        .key-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 8px;
          border-radius: 6px;
          font-size: 12px;
        }
        .key-row:hover { background: rgba(0,0,0,0.03); }
        .key-name { flex: 1; font-family: 'Menlo', 'Consolas', monospace; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .key-size { font-weight: 600; color: var(--pc-text-sec); min-width: 50px; text-align: right; }
        .btn-sm {
          padding: 2px 6px;
          border: 1px solid var(--pc-border);
          border-radius: 4px;
          background: var(--card-background-color, white);
          cursor: pointer;
          font-size: 10px;
          line-height: 1;
        }
        .btn-sm.btn-danger { color: var(--pc-danger); border-color: rgba(239, 68, 68, 0.3); }
        .btn-sm.btn-danger:hover { background: var(--pc-danger); color: white; }

        /* Dark mode */
        @media (prefers-color-scheme: dark) {
          :host {
            --pc-bg: #1e1e2e;
            --pc-border: #313244;
            --pc-text: #cdd6f4;
            --pc-text-sec: #6c7086;
          }
          .log-success { background: rgba(16, 185, 129, 0.12); color: #6ee7b7; }
          .log-error { background: rgba(239, 68, 68, 0.12); color: #fca5a5; }
          .log-info { background: rgba(59, 130, 246, 0.1); color: #93c5fd; }
          .btn-sm { background: #1e1e2e; }
          .key-row:hover { background: rgba(255,255,255,0.04); }
        }
        /* Tips banner */
        .tip-banner {
          background: linear-gradient(135deg, rgba(59,130,246,0.08), rgba(59,130,246,0.03));
          border: 1.5px solid rgba(59,130,246,0.2);
          border-radius: var(--pc-radius);
          padding: 14px 16px;
          margin-bottom: 16px;
          font-size: 13px;
          line-height: 1.6;
          position: relative;
        }
        .tip-banner-title { font-weight: 700; font-size: 14px; margin-bottom: 6px; color: var(--pc-primary); }
        .tip-banner ul { margin: 6px 0 0 16px; padding: 0; }
        .tip-banner li { margin-bottom: 3px; }
        .tip-banner .tip-dismiss {
          position: absolute; top: 8px; right: 10px;
          background: none; border: none; cursor: pointer;
          font-size: 16px; color: var(--pc-text-sec); opacity: 0.6;
        }
        .tip-banner .tip-dismiss:hover { opacity: 1; }
        .tip-banner.hidden { display: none; }
        /* Mobile responsive */
        @media (max-width: 768px) {
          .card { padding: 12px; }
          .header h2 { font-size: 18px; }
          .actions { flex-wrap: wrap; gap: 8px; }
          .actions button { min-width: 120px; flex: 1; font-size: 13px; }
          .result-grid { grid-template-columns: 1fr; }
          .keys-section { overflow-x: auto; }
          .warning-banner, .tip-banner { padding: 12px; font-size: 13px; }
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

      <div class="card">
        <h2>\u{1F9F9} Purge Cache <span class="ha-ver">HA <span id="ha-version">...</span></span></h2>
        <div class="subtitle">Wyczy\u015B\u0107 cache przegl\u0105darki, Service Workers, localStorage i skrypty narz\u0119dzi.</div>
        <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:10px;padding:12px 14px;margin:8px 0;font-size:12px;line-height:1.6;color:var(--bento-text,#1e293b)">
          <strong>\u26A0\uFE0F Uwaga:</strong> Czyszczenie <strong>localStorage</strong> spowoduje wylogowanie z HA i reset ustawie\u0144 panelu. 
          <strong>Service Workers</strong> i <strong>Cache Storage</strong> s\u0105 bezpieczne \u2014 nie wp\u0142ywaj\u0105 na logowanie.
        </div>

        <div class="tip-banner" id="tip-banner">
          <button class="tip-dismiss" id="tip-dismiss">\u2715</button>
          <div class="tip-banner-title">\u{1F4A1} Jak korzysta\u0107?</div>
          <ul>
            <li><strong>localStorage</strong> \u2014 ustawienia panelu, HACS, frontend HA. Po czyszczeniu trzeba si\u0119 ponownie zalogowa\u0107.</li>
            <li><strong>sessionStorage</strong> \u2014 dane bie\u017C\u0105cej sesji. Bezpieczne do czyszczenia.</li>
            <li><strong>Service Workers</strong> \u2014 cache'uj\u0105 zasoby offline. Wyrejestrowanie wymusza pobieranie \u015Bwie\u017Cych plik\u00F3w.</li>
            <li><strong>Cache Storage</strong> \u2014 API cache przegl\u0105darki. Usuni\u0119cie zwalnia miejsce.</li>
            <li><strong>Prze\u0142aduj skrypty</strong> \u2014 wymusza ponowne pobranie wszystkich .js narz\u0119dzi z serwera.</li>
            <li><strong>\u26A0\uFE0F Wyczy\u015B\u0107 WSZYSTKO</strong> \u2014 uruchamia wszystkie powy\u017Csze + hard reload. U\u017Cyj je\u015Bli narz\u0119dzia nie \u0142aduj\u0105 si\u0119 prawid\u0142owo.</li>
          </ul>
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">localStorage</div>
            <div class="stat-value" id="stat-ls">\u2022\u2022\u2022</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">sessionStorage</div>
            <div class="stat-value" id="stat-ss">\u2022\u2022\u2022</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Service Workers</div>
            <div class="stat-value" id="stat-sw">\u2022\u2022\u2022</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Cache Storage</div>
            <div class="stat-value" id="stat-cs">\u2022\u2022\u2022</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Tool Scripts</div>
            <div class="stat-value" id="stat-ts">\u2022\u2022\u2022</div>
          </div>
        </div>

        <div class="actions-grid">
          <button class="action-btn" id="btn-purge-ls">
            <span class="action-icon">\u{1F5D1}\uFE0F</span>
            <div>
              <div class="action-label">Wyczy\u015B\u0107 localStorage</div>
              <div class="action-desc">Ustawienia panelu, HACS, frontend</div>
            </div>
          </button>
          <button class="action-btn" id="btn-purge-ss">
            <span class="action-icon">\u{1F4CB}</span>
            <div>
              <div class="action-label">Wyczy\u015B\u0107 sessionStorage</div>
              <div class="action-desc">Dane sesji przegl\u0105darki</div>
            </div>
          </button>
          <button class="action-btn" id="btn-purge-sw">
            <span class="action-icon">\u2699\uFE0F</span>
            <div>
              <div class="action-label">Wyrejestruj Service Workers</div>
              <div class="action-desc">SW cache'uj\u0105ce zasoby</div>
            </div>
          </button>
          <button class="action-btn" id="btn-purge-cs">
            <span class="action-icon">\u{1F4E6}</span>
            <div>
              <div class="action-label">Usu\u0144 Cache Storage</div>
              <div class="action-desc">Wszystkie CacheStorage API</div>
            </div>
          </button>
          <button class="action-btn" id="btn-reload-tools">
            <span class="action-icon">\u{1F504}</span>
            <div>
              <div class="action-label">Prze\u0142aduj skrypty narz\u0119dzi</div>
              <div class="action-desc">Force fetch z cache: no-store</div>
            </div>
          </button>
          <button class="action-btn danger" id="btn-purge-all">
            <span class="action-icon">\u{1F9F9}</span>
            <div>
              <div class="action-label">Wyczy\u015B\u0107 WSZYSTKO</div>
              <div class="action-desc">Pe\u0142ny purge + reload skrypt\u00F3w</div>
            </div>
          </button>
          <button class="action-btn primary" id="btn-hard-reload">
            <span class="action-icon">\u26A1</span>
            <div>
              <div class="action-label">Hard Reload</div>
              <div class="action-desc">Ctrl+Shift+R \u2014 pe\u0142ne prze\u0142adowanie</div>
            </div>
          </button>
        </div>

        <div class="log-section">
          <div class="log-header">Akcje</div>
          <div id="action-log">
            <div class="log-entry log-info"><span class="log-time">${new Date().toLocaleTimeString('pl-PL')}</span> Purge Cache gotowy. Wybierz akcj\u0119.</div>
          </div>
        </div>

        <div class="keys-section">
          <div class="keys-header" id="keys-toggle">
            <span>localStorage \u2014 klucze</span>
            <span class="chevron">\u25BE</span>
          </div>
          <div id="ls-keys"></div>
        </div>
      </div>
    `

    // Tip banner dismiss
    const tipBanner = this.shadowRoot.querySelector('#tip-banner');
    const tipVersion = 'purge-cache-tips-v1.0.0';
    if (localStorage.getItem(tipVersion) === 'dismissed') {
      tipBanner.classList.add('hidden');
    }
    this.shadowRoot.querySelector('#tip-dismiss').addEventListener('click', (e) => {
      e.stopPropagation();
      tipBanner.classList.add('hidden');
      localStorage.setItem(tipVersion, 'dismissed');
    });

    // Bind events (with confirmation for destructive actions)
    this.shadowRoot.querySelector('#btn-purge-ls').addEventListener('click', () => {
      if (confirm('Wyczy\u015Bci\u0107 localStorage? Ustawienia panelu i logowanie zostan\u0105 zresetowane.')) this._purgeLocalStorage();
    });
    this.shadowRoot.querySelector('#btn-purge-ss').addEventListener('click', () => this._purgeSessionStorage());
    this.shadowRoot.querySelector('#btn-purge-sw').addEventListener('click', () => this._purgeServiceWorkers());
    this.shadowRoot.querySelector('#btn-purge-cs').addEventListener('click', () => this._purgeCacheStorage());
    this.shadowRoot.querySelector('#btn-reload-tools').addEventListener('click', () => this._forceReloadTools());
    this.shadowRoot.querySelector('#btn-purge-all').addEventListener('click', () => {
      if (confirm('Wyczy\u015Bci\u0107 WSZYSTKO? Obejmuje localStorage, sessionStorage, Service Workers, Cache Storage i prze\u0142adowanie skrypt\u00F3w.')) this._purgeAll();
    });
    this.shadowRoot.querySelector('#btn-hard-reload').addEventListener('click', () => this._hardReload());

    // Toggle LS keys
    const toggle = this.shadowRoot.querySelector('#keys-toggle');
    const keysDiv = this.shadowRoot.querySelector('#ls-keys');
    toggle.addEventListener('click', () => {
      toggle.classList.toggle('collapsed');
      keysDiv.classList.toggle('hidden');
    });
  }

  // HA Tools Panel discovery
  _injectDiscovery() {
    try {
      const ev = new CustomEvent('ha-tools-discovery', {
        bubbles: true, composed: true,
        detail: { tag: 'ha-purge-cache', name: 'Purge Cache', version: '1.0.0' }
      });
      this.dispatchEvent(ev);
    } catch (e) { /* ignore */ }
  }
}

if (!customElements.get('ha-purge-cache')) {
  customElements.define('ha-purge-cache', HAPurgeCache);
}
// HA Purge Cache registered
