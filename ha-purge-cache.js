(function() {
'use strict';

/**
 * HA Purge Cache v1.0.0
 * Tool for clearing browser cache, localStorage, service workers,
 * and force-reloading HA Tools scripts.
 *
 * Part of HA Tools Panel — Advanced Tools group.
 */

class HAPurgeCache extends HTMLElement {
  static getConfigElement() { return document.createElement('ha-purge-cache-editor'); }
  getCardSize() { return 6; }

  static getStubConfig() { return { type: 'custom:ha-purge-cache', title: 'Purge Cache' }; }
  constructor() {
    super();
    this._lang = (navigator.language || '').startsWith('pl') ? 'pl' : 'en';
    this.attachShadow({ mode: 'open' });
    this._hass = null;
    this._stats = {};
    this._showConfirm = false;
    this._confirmAction = null;
  }

  _confirm(message, onConfirm) {
    const overlay = this.shadowRoot?.querySelector('#confirm-overlay');
    const msgEl = this.shadowRoot?.querySelector('#confirm-msg');
    if (!overlay || !msgEl) { if (confirm(message)) onConfirm(); return; }
    msgEl.textContent = message;
    overlay.style.display = 'flex';
    this._pendingConfirm = onConfirm;
  }

  get _t() {
    const T = {
      pl: {
        title: 'Wyczy\u015B\u0107 Cache',
        subtitle: 'Wyczy\u015B\u0107 cache przegl\u0105darki, Service Workers, localStorage i skrypty narz\u0119dzi.',
        warningTitle: '\u26A0\uFE0F Uwaga:',
        warningText: 'Czyszczenie <strong>localStorage</strong> spowoduje wylogowanie z HA i reset ustawie\u0144 panelu. <strong>Service Workers</strong> i <strong>Cache Storage</strong> s\u0105 bezpieczne \u2014 nie wp\u0142ywaj\u0105 na logowanie.',
        tipTitle: '\u{1F4A1} Jak korzysta\u0107?',
        tip1: '<strong>localStorage</strong> \u2014 ustawienia panelu, HACS, frontend HA. Po czyszczeniu trzeba si\u0119 ponownie zalogowa\u0107.',
        tip2: '<strong>sessionStorage</strong> \u2014 dane bie\u017C\u0105cej sesji. Bezpieczne do czyszczenia.',
        tip3: '<strong>Service Workers</strong> \u2014 cache\'uj\u0105 zasoby offline. Wyrejestrowanie wymusza pobieranie \u015Bwie\u017Cych plik\u00F3w.',
        tip4: '<strong>Cache Storage</strong> \u2014 API cache przegl\u0105darki. Usuni\u0119cie zwalnia miejsce.',
        tip5: '<strong>Prze\u0142aduj skrypty</strong> \u2014 wymusza ponowne pobranie wszystkich .js narz\u0119dzi z serwera.',
        tip6: '<strong>\u26A0\uFE0F Wyczy\u015B\u0107 WSZYSTKO</strong> \u2014 uruchamia wszystkie powy\u017Csze + hard reload. U\u017Cyj je\u015Bli narz\u0119dzia nie \u0142aduj\u0105 si\u0119 prawid\u0142owo.',
        btnPurgeLS: 'Wyczy\u015B\u0107 localStorage',
        btnPurgeLSDesc: 'Wylogowanie + reset ustawie\u0144 panelu',
        btnPurgeSS: 'Wyczy\u015B\u0107 sessionStorage',
        btnPurgeSSDesc: 'Dane sesji \u2014 bezpieczne, bez wylogowania',
        btnPurgeSW: 'Wyrejestruj Service Workers',
        btnPurgeSWDesc: 'Offline cache \u2014 bez wylogowania',
        btnPurgeCS: 'Usu\u0144 Cache Storage',
        btnPurgeCSDesc: 'Zwolni miejsce \u2014 bez wylogowania',
        btnReloadTools: 'Prze\u0142aduj skrypty narz\u0119dzi',
        btnReloadToolsDesc: 'Force fetch z cache: no-store',
        btnPurgeAll: 'Wyczy\u015B\u0107 WSZYSTKO',
        btnPurgeAllDesc: '\u26A0\uFE0F Wymaga ponownego logowania!',
        btnHardReload: 'Hard Reload',
        btnHardReloadDesc: 'Ctrl+Shift+R \u2014 pe\u0142ne prze\u0142adowanie',
        logHeader: 'Akcje',
        logReady: 'Purge Cache gotowy. Wybierz akcj\u0119.',
        lsKeysHeader: 'localStorage \u2014 klucze',
        statKeys: 'kluczy',
        statRegistered: 'zarejestrowanych',
        statCaches: 'cache\'y',
        statEntries: 'wpis\u00F3w',
        statScripts: 'skrypt\u00F3w',
        deleteKey: 'Usu\u0144 ten klucz',
        confirmLS: 'Wyczy\u015Bci\u0107 localStorage?\n\n\u26A0\uFE0F Utracone dane:\n\u2022 Token logowania \u2014 wymagane ponowne zalogowanie\n\u2022 Ustawienia panelu HA Tools\n\u2022 Preferencje HACS i frontendu\n\u2022 Zapami\u0119tane filtry i widoki\n\nCzy kontynuowa\u0107?',
        confirmSS: 'Wyczy\u015Bci\u0107 sessionStorage?\n\n\u{1F4CB} Utracone dane:\n\u2022 Dane bie\u017C\u0105cej sesji (formularze, stany tymczasowe)\n\u2022 Nie wymaga ponownego logowania\n\nCzy kontynuowa\u0107?',
        confirmSW: 'Wyrejestrowa\u0107 Service Workers?\n\n\u2699\uFE0F Efekt:\n\u2022 Usuni\u0119cie offline cache \u2014 zasoby b\u0119d\u0105 \u0142adowane z serwera\n\u2022 Nie wymaga ponownego logowania\n\u2022 Mo\u017Ce spowolni\u0107 pierwsze \u0142adowanie\n\nCzy kontynuowa\u0107?',
        confirmCS: 'Usun\u0105\u0107 Cache Storage?\n\n\u{1F4E6} Efekt:\n\u2022 Usuni\u0119cie cache API przegl\u0105darki\n\u2022 Nie wymaga ponownego logowania\n\u2022 Zwolni miejsce\n\nCzy kontynuowa\u0107?',
        confirmAll: '\u{1F9F9} Wyczy\u015Bci\u0107 WSZYSTKO?\n\n\u26A0\uFE0F UWAGA \u2014 zostan\u0105 usuni\u0119te:\n\u2022 localStorage (wymagane ponowne logowanie!)\n\u2022 sessionStorage\n\u2022 Service Workers\n\u2022 Cache Storage\n\u2022 Prze\u0142adowanie skrypt\u00F3w narz\u0119dzi\n\nPo czyszczeniu nast\u0105pi automatyczny hard reload.\n\nCzy kontynuowa\u0107?',
        confirmHardReload: 'Wykona\u0107 Hard Reload?\n\nStrona zostanie ca\u0142kowicie prze\u0142adowana.\nNiezapisane dane mog\u0105 zosta\u0107 utracone.\n\nCzy kontynuowa\u0107?',
        logLsCleared: (n) => `\u2705 localStorage wyczyszczony (${n} kluczy usuni\u0119tych)`,
        logLsFailed: (n) => `\u26A0\uFE0F localStorage nie zosta\u0142 w pe\u0142ni wyczyszczony (${n} kluczy pozosta\u0142o)`,
        logSsCleared: (n) => `\u2705 sessionStorage wyczyszczony (${n} kluczy usuni\u0119tych)`,
        logSsFailed: '\u26A0\uFE0F sessionStorage nie zosta\u0142 w pe\u0142ni wyczyszczony',
        logSwUnregistered: (n) => `\u2705 ${n} Service Worker(s) wyrejestrowanych`,
        logSwError: (msg) => `\u274C B\u0142\u0105d SW: ${msg}`,
        logCsDeleted: (n) => `\u2705 ${n} Cache Storage usuni\u0119tych`,
        logCsError: (msg) => `\u274C B\u0142\u0105d Cache: ${msg}`,
        logNoPanel: '\u274C Nie znaleziono HA Tools Panel',
        logToolsReloaded: (n, t) => `\u2705 Prze\u0142adowano ${n}/${t} skrypt\u00F3w narz\u0119dzi (cache: no-store)`,
        logPurgeStart: '\u{1F9F9} Rozpoczynam pe\u0142ne czyszczenie...',
        logPurgeDone: '\u{1F389} Gotowe! Zalecany hard reload (Ctrl+Shift+R)',
        logHardReload: '\u{1F504} Hard reload za 1s...',
      },
      en: {
        title: 'Purge Cache',
        subtitle: 'Clear browser cache, Service Workers, localStorage and tool scripts.',
        warningTitle: '\u26A0\uFE0F Warning:',
        warningText: 'Clearing <strong>localStorage</strong> will log you out of HA and reset panel settings. <strong>Service Workers</strong> and <strong>Cache Storage</strong> are safe \u2014 they do not affect login.',
        tipTitle: '\u{1F4A1} How to use?',
        tip1: '<strong>localStorage</strong> \u2014 panel settings, HACS, HA frontend. Clearing requires re-login.',
        tip2: '<strong>sessionStorage</strong> \u2014 current session data. Safe to clear.',
        tip3: '<strong>Service Workers</strong> \u2014 cache offline assets. Unregistering forces fresh file downloads.',
        tip4: '<strong>Cache Storage</strong> \u2014 browser cache API. Clearing frees up space.',
        tip5: '<strong>Reload scripts</strong> \u2014 force re-download of all tool .js files from server.',
        tip6: '<strong>\u26A0\uFE0F Clear EVERYTHING</strong> \u2014 runs all above + hard reload. Use if tools fail to load.',
        btnPurgeLS: 'Clear localStorage',
        btnPurgeLSDesc: 'Logout + reset panel settings',
        btnPurgeSS: 'Clear sessionStorage',
        btnPurgeSSDesc: 'Session data \u2014 safe, no logout',
        btnPurgeSW: 'Unregister Service Workers',
        btnPurgeSWDesc: 'Offline cache \u2014 no logout',
        btnPurgeCS: 'Delete Cache Storage',
        btnPurgeCSDesc: 'Frees space \u2014 no logout',
        btnReloadTools: 'Reload tool scripts',
        btnReloadToolsDesc: 'Force fetch with cache: no-store',
        btnPurgeAll: 'Clear EVERYTHING',
        btnPurgeAllDesc: '\u26A0\uFE0F Requires re-login!',
        btnHardReload: 'Hard Reload',
        btnHardReloadDesc: 'Ctrl+Shift+R \u2014 full page reload',
        logHeader: 'Actions',
        logReady: 'Purge Cache ready. Choose an action.',
        lsKeysHeader: 'localStorage \u2014 keys',
        statKeys: 'keys',
        statRegistered: 'registered',
        statCaches: 'caches',
        statEntries: 'entries',
        statScripts: 'scripts',
        deleteKey: 'Delete this key',
        confirmLS: 'Clear localStorage?\n\n\u26A0\uFE0F Data that will be lost:\n\u2022 Login token \u2014 re-login required\n\u2022 HA Tools panel settings\n\u2022 HACS and frontend preferences\n\u2022 Saved filters and views\n\nContinue?',
        confirmSS: 'Clear sessionStorage?\n\n\u{1F4CB} Data that will be lost:\n\u2022 Current session data (forms, temporary states)\n\u2022 No re-login required\n\nContinue?',
        confirmSW: 'Unregister Service Workers?\n\n\u2699\uFE0F Effect:\n\u2022 Removes offline cache \u2014 assets will load from server\n\u2022 No re-login required\n\u2022 May slow down first load\n\nContinue?',
        confirmCS: 'Delete Cache Storage?\n\n\u{1F4E6} Effect:\n\u2022 Removes browser cache API\n\u2022 No re-login required\n\u2022 Frees up space\n\nContinue?',
        confirmAll: '\u{1F9F9} Clear EVERYTHING?\n\n\u26A0\uFE0F WARNING \u2014 will be removed:\n\u2022 localStorage (re-login required!)\n\u2022 sessionStorage\n\u2022 Service Workers\n\u2022 Cache Storage\n\u2022 Tool script reload\n\nA hard reload will follow automatically.\n\nContinue?',
        confirmHardReload: 'Perform Hard Reload?\n\nThe page will be fully reloaded.\nUnsaved data may be lost.\n\nContinue?',
        logLsCleared: (n) => `\u2705 localStorage cleared (${n} keys deleted)`,
        logLsFailed: (n) => `\u26A0\uFE0F localStorage not fully cleared (${n} keys remain)`,
        logSsCleared: (n) => `\u2705 sessionStorage cleared (${n} keys deleted)`,
        logSsFailed: '\u26A0\uFE0F sessionStorage not fully cleared',
        logSwUnregistered: (n) => `\u2705 ${n} Service Worker(s) unregistered`,
        logSwError: (msg) => `\u274C SW error: ${msg}`,
        logCsDeleted: (n) => `\u2705 ${n} Cache Storage(s) deleted`,
        logCsError: (msg) => `\u274C Cache error: ${msg}`,
        logNoPanel: '\u274C HA Tools Panel not found',
        logToolsReloaded: (n, t) => `\u2705 Reloaded ${n}/${t} tool scripts (cache: no-store)`,
        logPurgeStart: '\u{1F9F9} Starting full purge...',
        logPurgeDone: '\u{1F389} Done! Hard reload recommended (Ctrl+Shift+R)',
        logHardReload: '\u{1F504} Hard reload in 1s...',
      }
    };
    return T[this._lang] || T.en;
  }

  set hass(val) {
    if (val?.language) this._lang = val.language.startsWith('pl') ? 'pl' : 'en';
    this._hass = val;
    if (!this._rendered) this._render();
  }

  connectedCallback() {
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

    // HA Tools scripts info (count registered ha-* custom elements)
    try {
      const registry = customElements;
      let toolCount = 0;
      // Count elements in customCards registry (HA Tools' discovery mechanism)
      if (window.customCards && Array.isArray(window.customCards)) {
        toolCount = window.customCards.filter(c => c.type && c.type.startsWith('ha-')).length;
      }
      // Fallback: if no customCards, count ha-* tags in DOM (rough estimate)
      if (toolCount === 0) {
        const allElements = document.querySelectorAll('[class*="ha-"]');
        toolCount = Math.max(window.customCards?.length || 0, 1);
      }
      stats.toolScripts = { count: toolCount || 0 };
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



  _sanitize(str) {
    if (!str) return str;
    try { return decodeURIComponent(escape(str)); } catch(e) { return str; }
  }

  _updateDisplay() {
    const root = this.shadowRoot;
    if (!root) return;

    const t = this._t;
    const s = this._stats;

    // Update stat cards
    const lsEl = root.querySelector('#stat-ls');
    if (lsEl && s.localStorage) {
      lsEl.innerHTML = `<span class="stat-num">${s.localStorage.count}</span> ${t.statKeys} <span class="stat-sub">(${s.localStorage.sizeKB} KB)</span>`;
    }

    const ssEl = root.querySelector('#stat-ss');
    if (ssEl && s.sessionStorage) {
      ssEl.innerHTML = `<span class="stat-num">${s.sessionStorage.count}</span> ${t.statKeys} <span class="stat-sub">(${s.sessionStorage.sizeKB} KB)</span>`;
    }

    const swEl = root.querySelector('#stat-sw');
    if (swEl && s.serviceWorkers) {
      swEl.innerHTML = `<span class="stat-num">${s.serviceWorkers.count}</span> ${t.statRegistered}`;
    }

    const csEl = root.querySelector('#stat-cs');
    if (csEl && s.cacheStorage) {
      const total = s.cacheStorage.caches.reduce((sum, c) => sum + c.entries, 0);
      csEl.innerHTML = `<span class="stat-num">${s.cacheStorage.count}</span> ${t.statCaches} <span class="stat-sub">(${total} ${t.statEntries})</span>`;
    }

    const tsEl = root.querySelector('#stat-ts');
    if (tsEl && s.toolScripts) {
      tsEl.innerHTML = `<span class="stat-num">${s.toolScripts.count}</span> ${t.statScripts}`;
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
    const t = this._t;

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
        <button class="btn-sm btn-danger" data-key="${k.key}" title="${t.deleteKey}">\u2715</button>
      </div>
    `).join('');

    container.querySelectorAll('.btn-danger[data-key]').forEach(btn => {
      btn.addEventListener('click', () => {
        localStorage.removeItem(btn.dataset.key);
        this._addLog(`${this._t.deleteKey}: ${btn.dataset.key}`, 'success');
        this._collectStats();
      });
    });
  }

  async _purgeLocalStorage() {
    const count = localStorage.length;
    localStorage.clear();
    if (localStorage.length > 0) {
      this._addLog(this._t.logLsFailed(localStorage.length), 'error');
    } else {
      this._addLog(this._t.logLsCleared(count), 'success');
    }
    await this._collectStats();
  }

  async _purgeSessionStorage() {
    const count = sessionStorage.length;
    sessionStorage.clear();
    if (sessionStorage.length > 0) {
      this._addLog(this._t.logSsFailed, 'error');
    } else {
      this._addLog(this._t.logSsCleared(count), 'success');
    }
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
      this._addLog(this._t.logSwUnregistered(count), 'success');
    } catch (e) {
      this._addLog(this._t.logSwError(e.message), 'error');
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
      this._addLog(this._t.logCsDeleted(count), 'success');
    } catch (e) {
      this._addLog(this._t.logCsError(e.message), 'error');
    }
    await this._collectStats();
  }

  async _forceReloadTools() {
    try {
      const panel = document.querySelector('ha-tools-panel');
      if (!panel || !panel.constructor.TOOL_SCRIPTS) {
        this._addLog(this._t.logNoPanel, 'error');
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
      this._addLog(this._t.logToolsReloaded(loaded, tags.length), 'success');
    } catch (e) {
      this._addLog(this._t.logCsError(e.message), 'error');
    }
  }

  async _purgeAll() {
    this._addLog(this._t.logPurgeStart, 'info');
    await this._purgeLocalStorage();
    await this._purgeSessionStorage();
    await this._purgeServiceWorkers();
    await this._purgeCacheStorage();
    await this._forceReloadTools();
    this._addLog(this._t.logPurgeDone, 'success');
  }

  _hardReload() {
    this._addLog(this._t.logHardReload, 'info');
    setTimeout(() => {
      location.reload(true);
    }, 1000);
  }

  _addLog(msg, type = 'info') {
    const logEl = this.shadowRoot?.querySelector('#action-log');
    if (!logEl) return;
    const time = new Date().toLocaleTimeString(this._lang === 'pl' ? 'pl-PL' : 'en-US');
    const typeClass = type === 'success' ? 'log-success' : type === 'error' ? 'log-error' : 'log-info';
    const entry = document.createElement('div');
    entry.className = `log-entry ${typeClass}`;
    entry.innerHTML = `<span class="log-time">${time}</span> ${msg}`;
    logEl.prepend(entry);
  }

  _render() {
    if (!this._hass) return;
    const t = this._t;
    this._rendered = true;
    this.shadowRoot.innerHTML = `
      <style>${window.HAToolsBentoCSS || ""}

        /* Inter font loaded by ha-tools-loader.js - no @import needed */

        
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
          display: block;
          font-family: 'Inter', sans-serif;
          color: var(--primary-text-color, #1a1a2e);
          --pc-primary: var(--bento-primary);
          --pc-primary-hover: var(--bento-primary-hover);
          --pc-danger: var(--bento-error);
          --pc-danger-hover: #DC2626;
          --pc-success: var(--bento-success);
          --pc-warning: var(--bento-warning);
          --pc-bg: var(--bento-card);
          --pc-border: var(--bento-border);
          --pc-text: var(--bento-text);
          --pc-text-sec: var(--bento-text-secondary);
          --pc-radius: var(--bento-radius-sm);
        }

        * { box-sizing: border-box; }
        .card { max-width: 900px; margin: 0 auto; padding: 16px; box-sizing: border-box; max-width: 100%; overflow: hidden; }
        h2 { font-size: 20px; font-weight: 700; margin: 0 0 4px; }
        .subtitle { color: var(--bento-text-secondary); font-size: 13px; margin-bottom: 20px; }
        .ha-ver { font-size: 12px; color: var(--bento-text-secondary); font-weight: 400; }

        /* Stats Grid */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
          gap: 12px;
          margin-bottom: 20px;
          box-sizing: border-box;
          max-width: 100%;
          overflow: hidden;
        }
        .stat-card {
          background: var(--bento-bg);
          border: 1.5px solid var(--bento-border);
          border-radius: var(--bento-radius-sm);
          padding: 14px;
          box-sizing: border-box;
          min-width: 0;
        }
        .stat-label { font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--bento-text-secondary); letter-spacing: 0.5px; margin-bottom: 6px; word-break: break-word; }
        .stat-value { font-size: 14px; font-weight: 500; word-break: break-word; overflow: hidden; }
        .stat-num { font-size: 22px; font-weight: 700; color: var(--bento-primary); }
        .stat-sub { font-size: 12px; color: var(--bento-text-secondary); }

        /* Actions */
        .actions-grid {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 20px;
          box-sizing: border-box;
          max-width: 100%;
          overflow: hidden;
        }
        .action-btn {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 16px;
          border: 1.5px solid var(--bento-border);
          border-radius: var(--bento-radius-sm);
          background: var(--bento-bg);
          cursor: pointer;
          font-family: 'Inter', sans-serif;
          font-size: 13px;
          font-weight: 500;
          color: var(--bento-text);
          transition: all 0.15s ease;
          box-sizing: border-box;
          min-width: 0;
          word-break: break-word;
          overflow: hidden;
        }
        .action-btn:hover { border-color: var(--bento-primary); background: rgba(59, 130, 246, 0.04); }
        .action-btn .action-icon { font-size: 20px; flex-shrink: 0; }
        .action-btn .action-label { line-height: 1.3; word-break: break-word; overflow: hidden; }
        .action-btn .action-desc { font-size: 11px; color: var(--bento-text-secondary); font-weight: 400; word-break: break-word; overflow: hidden; }

        .action-btn.danger { border-color: rgba(239, 68, 68, 0.3); }
        .action-btn.danger:hover { border-color: var(--bento-error); background: rgba(239, 68, 68, 0.04); }

        .action-btn.primary { border-color: var(--bento-primary); background: rgba(59, 130, 246, 0.06); }
        .action-btn.primary:hover { background: var(--bento-primary); color: white; }

        /* Log */
        .log-section {
          border: 1.5px solid var(--bento-border);
          border-radius: var(--bento-radius-sm);
          overflow: hidden;
          margin-bottom: 20px;
        }
        .log-header {
          padding: 10px 14px;
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--bento-text-secondary);
          border-bottom: 1px solid var(--bento-border);
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
          border: 1.5px solid var(--bento-border);
          border-radius: var(--bento-radius-sm);
          overflow: hidden;
        }
        .keys-header {
          padding: 10px 14px;
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--bento-text-secondary);
          border-bottom: 1px solid var(--bento-border);
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
        .key-size { font-weight: 600; color: var(--bento-text-secondary); min-width: 50px; text-align: right; }
        .btn-sm {
          padding: 2px 6px;
          border: 1px solid var(--bento-border);
          border-radius: 4px;
          background: var(--card-background-color, white);
          cursor: pointer;
          font-size: 10px;
          line-height: 1;
        }
        .btn-sm.btn-danger { color: var(--bento-error); border-color: rgba(239, 68, 68, 0.3); }
        .btn-sm.btn-danger:hover { background: var(--bento-error); color: white; }

        /* 2-column layout */
        .cache-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          box-sizing: border-box;
          max-width: 100%;
          overflow: hidden;
        }
        .cache-col {
          min-width: 0;
          box-sizing: border-box;
          overflow: hidden;
        }
        
        .tabs, .tab-bar { scrollbar-width: thin; scrollbar-color: var(--bento-border, #E2E8F0) transparent; }
        .tabs::-webkit-scrollbar, .tab-bar::-webkit-scrollbar { height: 4px; }
        .tabs::-webkit-scrollbar-track, .tab-bar::-webkit-scrollbar-track { background: transparent; }
        .tabs::-webkit-scrollbar-thumb, .tab-bar::-webkit-scrollbar-thumb { background: var(--bento-border, #E2E8F0); border-radius: 4px; }
@media (max-width: 768px) {
          .cache-grid { grid-template-columns: 1fr; gap: 12px; }
        }
        @media (max-width: 600px) {
          .cache-grid { grid-template-columns: 1fr; gap: 10px; }
          .stats-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }
          .stat-card { padding: 10px 8px; }
        }
        @media (max-width: 480px) {
          .cache-grid { grid-template-columns: 1fr; gap: 8px; }
          .stats-grid { grid-template-columns: 1fr; gap: 8px; }
          .stat-card { padding: 10px 8px; }
          .actions-grid { grid-template-columns: 1fr; gap: 8px; }
          .action-btn { padding: 12px 14px; font-size: 12px; }
        }
        @media (max-width: 360px) {
          .stats-grid { grid-template-columns: 1fr; gap: 6px; }
          .stat-card { padding: 8px 6px; }
          .action-btn { padding: 10px 12px; font-size: 11px; gap: 6px; }
          .action-btn .action-icon { font-size: 18px; }
        }

        /* Confirm overlay */
        .confirm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 999; display: none; align-items: center; justify-content: center; }
        .confirm-dialog { background: var(--bento-card); padding: 24px; border-radius: var(--bento-radius-md); max-width: 420px; width: 90%; box-shadow: var(--bento-shadow-lg); }
        .confirm-dialog h3 { margin: 0 0 12px; font-size: 16px; color: var(--bento-text); }
        .confirm-dialog p { margin: 0 0 20px; font-size: 13px; color: var(--bento-text-secondary); line-height: 1.6; white-space: pre-wrap; }
        .confirm-dialog-btns { display: flex; gap: 8px; justify-content: flex-end; }
        .btn-cancel { padding: 8px 18px; border: 1px solid var(--bento-border); border-radius: var(--bento-radius-xs); background: var(--bento-bg); color: var(--bento-text); font-size: 13px; cursor: pointer; }
        .btn-confirm-ok { padding: 8px 18px; border: none; border-radius: var(--bento-radius-xs); background: var(--bento-error); color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; }

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
          border-radius: var(--bento-radius-sm);
          padding: 14px 16px;
          margin-bottom: 16px;
          font-size: 13px;
          line-height: 1.6;
          position: relative;
        }
        .tip-banner-title { font-weight: 700; font-size: 14px; margin-bottom: 6px; color: var(--bento-primary); }
        .tip-banner ul { margin: 6px 0 0 16px; padding: 0; }
        .tip-banner li { margin-bottom: 3px; }
        .tip-banner .tip-dismiss {
          position: absolute; top: 8px; right: 10px;
          background: none; border: none; cursor: pointer;
          font-size: 16px; color: var(--bento-text-secondary); opacity: 0.6;
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
          .tabs { flex-wrap: nowrap; overflow-x: auto; -webkit-overflow-scrolling: touch; gap: 2px; }
          .tab, .tab-btn, .tab-btn { padding: 6px 10px; font-size: 12px; white-space: nowrap; }
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
          .tab, .tab-btn, .tab-btn { padding: 5px 8px; font-size: 11px; }
          .stats, .stats-grid, .summary-grid, .stat-cards, .kpi-grid, .metrics-grid { grid-template-columns: 1fr 1fr; }
          .stat-val, .kpi-val, .metric-val { font-size: 16px; }
        }
      

</style>

      <div class="card">
        <h2>\u{1F9F9} Purge Cache <span class="ha-ver">HA <span id="ha-version">...</span></span></h2>
        <div class="subtitle">${t.subtitle}</div>
        <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:10px;padding:12px 14px;margin:8px 0;font-size:12px;line-height:1.6;color:var(--bento-text,#1e293b)">
          <strong>${t.warningTitle}</strong> ${t.warningText}
        </div>

        <div class="tip-banner" id="tip-banner">
          <button class="tip-dismiss" id="tip-dismiss" aria-label="Dismiss">\u2715</button>
          <div class="tip-banner-title">${t.tipTitle}</div>
          <ul>
            <li>${t.tip1}</li>
            <li>${t.tip2}</li>
            <li>${t.tip3}</li>
            <li>${t.tip4}</li>
            <li>${t.tip5}</li>
            <li>${t.tip6}</li>
          </ul>
        </div>

        <div class="cache-grid">
          <div class="cache-col">
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

            <div class="keys-section">
              <div class="keys-header" id="keys-toggle">
                <span>${t.lsKeysHeader}</span>
                <span class="chevron">\u25BE</span>
              </div>
              <div id="ls-keys"></div>
            </div>
          </div>

          <div class="cache-col">
            <div class="actions-grid">
              <button class="action-btn" id="btn-purge-ls">
                <span class="action-icon">\u{1F5D1}\uFE0F</span>
                <div>
                  <div class="action-label">${t.btnPurgeLS}</div>
                  <div class="action-desc">${t.btnPurgeLSDesc}</div>
                </div>
              </button>
              <button class="action-btn" id="btn-purge-ss">
                <span class="action-icon">\u{1F4CB}</span>
                <div>
                  <div class="action-label">${t.btnPurgeSS}</div>
                  <div class="action-desc">${t.btnPurgeSSDesc}</div>
                </div>
              </button>
              <button class="action-btn" id="btn-purge-sw">
                <span class="action-icon">\u2699\uFE0F</span>
                <div>
                  <div class="action-label">${t.btnPurgeSW}</div>
                  <div class="action-desc">${t.btnPurgeSWDesc}</div>
                </div>
              </button>
              <button class="action-btn" id="btn-purge-cs">
                <span class="action-icon">\u{1F4E6}</span>
                <div>
                  <div class="action-label">${t.btnPurgeCS}</div>
                  <div class="action-desc">${t.btnPurgeCSDesc}</div>
                </div>
              </button>
              <button class="action-btn" id="btn-reload-tools">
                <span class="action-icon">\u{1F504}</span>
                <div>
                  <div class="action-label">${t.btnReloadTools}</div>
                  <div class="action-desc">${t.btnReloadToolsDesc}</div>
                </div>
              </button>
              <button class="action-btn danger" id="btn-purge-all">
                <span class="action-icon">\u{1F9F9}</span>
                <div>
                  <div class="action-label">${t.btnPurgeAll}</div>
                  <div class="action-desc">${t.btnPurgeAllDesc}</div>
                </div>
              </button>
              <button class="action-btn primary" id="btn-hard-reload">
                <span class="action-icon">\u26A1</span>
                <div>
                  <div class="action-label">${t.btnHardReload}</div>
                  <div class="action-desc">${t.btnHardReloadDesc}</div>
                </div>
              </button>
            </div>

            <div class="log-section">
              <div class="log-header">${t.logHeader}</div>
              <div id="action-log">
                <div class="log-entry log-info"><span class="log-time">${new Date().toLocaleTimeString(this._lang === 'pl' ? 'pl-PL' : 'en-US')}</span> ${t.logReady}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="confirm-overlay" id="confirm-overlay">
          <div class="confirm-dialog">
            <h3>${this._lang === 'pl' ? 'Potwierdzenie' : 'Confirm'}</h3>
            <p id="confirm-msg"></p>
            <div class="confirm-dialog-btns">
              <button class="btn-cancel" id="confirm-cancel">${this._lang === 'pl' ? 'Anuluj' : 'Cancel'}</button>
              <button class="btn-confirm-ok" id="confirm-ok">${this._lang === 'pl' ? 'Wyczy\u015B\u0107' : 'Confirm'}</button>
            </div>
          </div>
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

    // Confirm overlay wiring
    const overlay = this.shadowRoot.querySelector('#confirm-overlay');
    this.shadowRoot.querySelector('#confirm-cancel').addEventListener('click', () => { overlay.style.display = 'none'; this._pendingConfirm = null; });
    this.shadowRoot.querySelector('#confirm-ok').addEventListener('click', () => { overlay.style.display = 'none'; if (this._pendingConfirm) { this._pendingConfirm(); this._pendingConfirm = null; } });

    // Bind events (with custom confirmation for destructive actions)
    this.shadowRoot.querySelector('#btn-purge-ls').addEventListener('click', () => this._confirm(this._t.confirmLS, () => this._purgeLocalStorage()));
    this.shadowRoot.querySelector('#btn-purge-ss').addEventListener('click', () => this._confirm(this._t.confirmSS, () => this._purgeSessionStorage()));
    this.shadowRoot.querySelector('#btn-purge-sw').addEventListener('click', () => this._confirm(this._t.confirmSW, () => this._purgeServiceWorkers()));
    this.shadowRoot.querySelector('#btn-purge-cs').addEventListener('click', () => this._confirm(this._t.confirmCS, () => this._purgeCacheStorage()));
    this.shadowRoot.querySelector('#btn-reload-tools').addEventListener('click', () => this._forceReloadTools());
    this.shadowRoot.querySelector('#btn-purge-all').addEventListener('click', () => this._confirm(this._t.confirmAll, () => this._purgeAll()));
    this.shadowRoot.querySelector('#btn-hard-reload').addEventListener('click', () => this._confirm(this._t.confirmHardReload, () => this._hardReload()));

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

class HaPurgeCacheEditor extends HTMLElement {
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
      <h3>Purge Cache</h3>
            <div style="margin-bottom:12px;">
              <label style="display:block;font-weight:500;margin-bottom:4px;font-size:13px;">Title</label>
              <input type="text" id="cf_title" value="${this._config?.title || 'Purge Cache'}"
                style="width:100%;padding:8px 12px;border:1px solid var(--divider-color,#e2e8f0);border-radius:8px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#1e293b);font-size:14px;box-sizing:border-box;">
            </div>
    `;
        const f_title = this.shadowRoot.querySelector('#cf_title');
        if (f_title) f_title.addEventListener('input', (e) => {
          this._config = { ...this._config, title: e.target.value };
          this._dispatch();
        });
  }
  connectedCallback() { this._render(); }
}
if (!customElements.get('ha-purge-cache-editor')) { customElements.define('ha-purge-cache-editor', HaPurgeCacheEditor); }

})();

window.customCards = window.customCards || [];
window.customCards.push({ type: 'ha-purge-cache', name: 'Purge Cache', description: 'Clear browser cache and scripts', preview: false });
