
// ── HA Tools Server Persistence Helper ──
// Uses HA frontend/set_user_data for cross-device per-user persistence
// Falls back to localStorage for instant reads (cache), writes to both
window._haToolsPersistence = window._haToolsPersistence || {
  _cache: {},
  _hass: null,
  setHass(hass) { this._hass = hass;
    if (window._haToolsPersistence) window._haToolsPersistence.setHass(hass); },

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
 * HA Storage Monitor - WinDirStat-like storage visualization for Home Assistant
 * Shows disk usage with treemap visualization, directory breakdown, and cleanup suggestions
 */
class HAStorageMonitor extends HTMLElement {
  static getConfigElement() { return document.createElement('ha-storage-monitor-editor'); }
  static getStubConfig() { return { type: 'custom:ha-storage-monitor', title: 'Storage Monitor' }; }
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    // --- Throttle fields ---
    this._lastRenderTime = 0;
    this._renderScheduled = false;
    this._firstHassRender = false;
    // --- Pagination ---
    this._currentPage = {};
    this._pageSize = 15;
    this._hass = null;
    this._config = {};
    this._activeTab = 'overview';
    this._storageData = null;
    this._loading = true;
    this._expandedPaths = new Set();
    this._sortBy = 'size';
    this._lang = (navigator.language || '').startsWith('pl') ? 'pl' : 'en';
    this._sortAsc = false;
    this._lastHtml = '';
    this._lastDataFetch = 0;
  }

  _sanitize(str) {
    if (!str) return str;
    try { return decodeURIComponent(escape(str)); } catch(e) { return str; }
  }
  set hass(hass) {
    this._hass = hass;
    if (hass?.language) this._lang = hass.language.startsWith('pl') ? 'pl' : 'en';
    if (!hass) return;
    const now = Date.now();
    if (!this._firstHassRender) {
      this._firstHassRender = true;
      this._loadStorageData();
      this._render();
      this._lastRenderTime = now;
      return;
    }
    // Storage data doesn't change often - only re-fetch every 2 minutes
    if (now - (this._lastDataFetch || 0) > 120000) {
      this._lastDataFetch = now;
      this._loadStorageData();
    }
    // Throttle render to 30s — storage info is static
    if (now - (this._lastRenderTime || 0) < 30000) {
      return; // Skip render entirely — no need to re-render static storage info
    }
    this._lastRenderTime = now;
  }

  setConfig(config) {
    this._config = { title: config.title || 'Storage Monitor', ...config };
    // Load persisted UI state
    try {
      const _saved = localStorage.getItem('ha-storage-monitor-settings');
      if (_saved) {
        const _s = JSON.parse(_saved);
        if (_s._activeTab) this._activeTab = _s._activeTab;
      }
    } catch(e) {}
  }

  async _loadStorageData() {
    if (!this._hass) return;
    this._loading = true;
    this._updateContent();

    try {
      // Get host info for disk usage (requires Supervisor - HA OS / Supervised)
      let hostInfo = null, osInfo = null;
      try { hostInfo = await this._hass.callWS({ type: 'supervisor/api', endpoint: '/host/info', method: 'get' }); } catch(e) {}
      try { osInfo = await this._hass.callWS({ type: 'supervisor/api', endpoint: '/os/info', method: 'get' }); } catch(e) {}
      if (!hostInfo) {
        this._storageData = { noSupervisor: true };
        this._loading = false;
        this._updateContent();
        return;
      }

      // Get addon info — try individual endpoints for size data
      let addons = [];
      try {
        const addonList = await this._hass.callWS({ type: 'supervisor/api', endpoint: '/addons', method: 'get' });
        addons = addonList?.addons || addonList?.data?.addons || [];
        // J3: Try to get detailed info for each addon (includes disk usage when available)
        const addonDetails = await Promise.allSettled(
          addons.filter(a => a.slug && a.state && a.state !== 'unknown').slice(0, 30).map(a =>
            this._hass.callWS({ type: 'supervisor/api', endpoint: '/addons/' + a.slug + '/info', method: 'get' })
              .then(info => ({ slug: a.slug, ...(info?.data || info || {}) }))
          )
        );
        const detailMap = {};
        addonDetails.forEach(r => {
          if (r.status === 'fulfilled' && r.value?.slug) {
            detailMap[r.value.slug] = r.value;
          }
        });
        addons = addons.map(a => {
          const detail = detailMap[a.slug];
          if (detail) {
            return { ...a, disk_usage: detail.disk_usage !== undefined ? detail.disk_usage : null, apparmor: detail.apparmor, auto_update: detail.auto_update };
          }
          return a;
        });
      } catch(e) { console.warn('[Storage] Could not fetch addons:', e); }

      // Get backup info (supervisor endpoint has size/size_bytes)
      let backups = [];
      try {
        const backupList = await this._hass.callWS({ type: 'supervisor/api', endpoint: '/backups', method: 'get' });
        backups = backupList?.backups || backupList?.data?.backups || [];
      } catch(e) { console.warn('[Storage] Could not fetch backups:', e); }

      // Recorder info — current HA recorder/info API does NOT expose db size
      // Available fields: backlog, db_in_default_location, max_backlog, migration_in_progress, migration_is_live, recording, thread_running
      let dbSize = 0;
      let recorderMeta = {};
      try {
        recorderMeta = await this._hass.callWS({ type: 'recorder/info' }) || {};
        // DB size unavailable from this endpoint — UI will show "N/A" when dbSize === 0
      } catch(e) { console.warn('[Storage] No recorder info:', e); }

      // API returns numbers directly (in GB), no .data wrapper
      const diskTotal = hostInfo?.disk_total || hostInfo?.data?.disk_total || 32;
      const diskUsed = hostInfo?.disk_used || hostInfo?.data?.disk_used || 10;
      const diskFree = hostInfo?.disk_free || hostInfo?.data?.disk_free || diskTotal - diskUsed;
      const hostname = hostInfo?.hostname || hostInfo?.data?.hostname || 'homeassistant';
      const os = hostInfo?.operating_system || hostInfo?.data?.operating_system || 'N/A';

      // Build storage breakdown
      // Addons: filter by state (started/stopped = installed), list API has no size
      const addonSizes = addons.filter(a => a.state && a.state !== 'unknown').map(a => {
        // disk_usage from supervisor can be in bytes or MB depending on version
        let sizeMB = 0.5; // default for unknown
        if (a.disk_usage !== null && a.disk_usage !== undefined) {
          sizeMB = a.disk_usage > 100000 ? a.disk_usage / (1024 * 1024) : a.disk_usage; // If > 100000, likely bytes; else likely MB
        }
        return {
        name: a.name || a.slug,
        slug: a.slug,
        size: sizeMB, // in MB
        icon: a.icon ? `/api/hassio/addons/${a.slug}/icon` : null,
        state: a.state,
        version: a.version
      };
      });

      // Backups: supervisor /backups returns size in MB and size_bytes
      const backupSizes = backups.map(b => ({
        name: b.name || b.slug,
        slug: b.slug,
        size: b.size || (b.size_bytes ? b.size_bytes / (1024 * 1024) : 0), // size is in MB from supervisor
        date: b.date,
        type: b.type,
        compressed: b.compressed
      })).sort((a, b) => b.size - a.size);

      const totalBackupsMB = backupSizes.reduce((s, b) => s + b.size, 0);
      const dbSizeMB = dbSize / (1024 * 1024); // from bytes to MB (if available)
      const usedMB = diskUsed * 1024; // diskUsed is in GB from host/info
      
      // Fetch integrations for storage estimation
      let integrations = [];
      try {
        const cfgEntries = await this._hass.callWS({ type: 'config_entries/list' });
        integrations = cfgEntries?.config_entries || cfgEntries?.data?.config_entries || [];
      } catch(e) { console.warn('[Storage] Could not fetch integrations:', e); }
      const intCount = integrations.length;
      const integrationEstimate = intCount * 0.1; // ~100KB per integration config storage estimate
      
      // Estimate HA Core + addons as used minus backups and DB
      const systemMB = Math.max(0, usedMB - totalBackupsMB - dbSizeMB);

      this._storageData = {
        diskTotal, diskUsed, diskFree,
        usedPercent: Math.round((diskUsed / diskTotal) * 100),
        categories: [
          { name: 'Backups', size: totalBackupsMB, color: '#9c27b0', icon: '\u{1F4BE}', items: backupSizes },
          { name: 'Database (Recorder)', size: dbSizeMB || Math.min(systemMB * 0.2, 2048), color: '#ff9800', icon: '\u{1F5C4}\uFE0F' },
          { name: 'Add-ons', size: addonSizes.reduce((s, a) => s + a.size, 0), color: '#4caf50', icon: '\u{1F9E9}', items: addonSizes },
          { name: 'Integrations', size: integrationEstimate, color: '#2196f3', icon: '\u{1F50C}', intCount: intCount },
          { name: 'System & Other', size: Math.max(systemMB - integrationEstimate, 100), color: '#607d8b', icon: '\u{1F5A5}' },
        ],
        addons: addonSizes,
        backups: backupSizes,
        integrations: integrations,
        dbSizeMB,
        addonCount: addonSizes.length,
        intCount: intCount,
        osVersion: osInfo?.version || osInfo?.data?.version || 'N/A',
        hostname: hostname
      };
    } catch (e) {
      console.error('[Storage Monitor] Error:', e);
      this._storageData = { error: e.message };
    }

    this._loading = false;
    this._updateContent();
  }

  _parseSizeGB(str) {
    if (!str) return 0;
    if (typeof str === 'number') return str;
    const n = parseFloat(str);
    if (str.includes('TB')) return n * 1024;
    if (str.includes('MB')) return n / 1024;
    return n;
  }

  _parseSizeMB(str) {
    if (!str) return 0;
    if (typeof str === 'number') return str;
    const n = parseFloat(str);
    if (str.includes('GB')) return n * 1024;
    if (str.includes('KB')) return n / 1024;
    return n;
  }

  _fmtSize(mb) {
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
    if (mb >= 1) return `${mb.toFixed(1)} MB`;
    return `${(mb * 1024).toFixed(0)} KB`;
  }

  _render() {
    const html = `
      <style>${window.HAToolsBentoCSS || ""}

/* ===== BENTO LIGHT MODE DESIGN SYSTEM ===== */

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
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

/* Card */
.card, .ha-card, ha-card, .main-card, .exporter-card, .security-card, .reports-card, .storage-card, .chore-card, .cry-card, .backup-card, .network-card, .sentence-card, .energy-card, .panel-card {
  background: var(--bento-card) !important;
  border: 1px solid var(--bento-border) !important;
  border-radius: var(--bento-radius-md) !important;
  box-shadow: var(--bento-shadow-sm) !important;
  font-family: 'Inter', sans-serif !important;
  color: var(--bento-text) !important;
  overflow: hidden;
  padding: 20px;
}

/* Headers */
.card-header, .header, .card-title, h1, h2, h3 {
  color: var(--bento-text) !important;
  font-family: 'Inter', sans-serif !important;
}
.card-header, .header {
  border-bottom: 1px solid var(--bento-border) !important;
  padding-bottom: 12px !important;
  margin-bottom: 16px !important;
}

/* Tabs */
.tabs, .tab-bar, .tab-nav, .tab-header {
  display: flex;
  gap: 4px;
  border-bottom: 2px solid var(--bento-border);
  padding: 0 4px;
  margin-bottom: 20px;
  overflow-x: auto;
}
.tab, .tab-btn, .tab-button {
  padding: 10px 18px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  font-family: 'Inter', sans-serif;
  color: var(--bento-text-secondary);
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: var(--bento-transition);
  white-space: nowrap;
  border-radius: 0;
}
.tab:hover, .tab-btn:hover, .tab-button:hover {
  color: var(--bento-primary);
  background: var(--bento-primary-light);
}
.tab.active, .tab-btn.active, .tab-button.active {
  color: var(--bento-primary);
  border-bottom-color: var(--bento-primary);
  background: rgba(59, 130, 246, 0.04);
  font-weight: 600;
}

/* Tab content */
.tab-content { display: none; }
.tab-content.active { display: block; animation: bentoFadeIn 0.3s ease-out; }
@keyframes bentoFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

/* Buttons */
button, .btn, .action-btn {
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 500;
  border-radius: var(--bento-radius-xs);
  transition: var(--bento-transition);
  cursor: pointer;
}
button.active, .btn.active, .btn-primary, .action-btn.active {
  background: var(--bento-primary) !important;
  color: white !important;
  border-color: var(--bento-primary) !important;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.25);
}

/* Status badges */
.badge, .status-badge, .tag, .chip {
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
  font-family: 'Inter', sans-serif;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.badge-success, .status-ok, .status-good { background: var(--bento-success-light); color: var(--bento-success); }
.badge-error, .status-error, .status-critical { background: var(--bento-error-light); color: var(--bento-error); }
.badge-warning, .status-warning { background: var(--bento-warning-light); color: var(--bento-warning); }
.badge-info, .status-info { background: var(--bento-primary-light); color: var(--bento-primary); }

/* Tables */
table { width: 100%; border-collapse: separate; border-spacing: 0; font-family: 'Inter', sans-serif; }
th { background: var(--bento-bg); color: var(--bento-text-secondary); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; padding: 10px 14px; text-align: left; border-bottom: 2px solid var(--bento-border); }
td { padding: 12px 14px; border-bottom: 1px solid var(--bento-border); color: var(--bento-text); font-size: 13px; }
tr:hover td { background: var(--bento-primary-light); }
tr:last-child td { border-bottom: none; }

/* Inputs & selects */
input, select, textarea {
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  padding: 8px 12px;
  border: 1.5px solid var(--bento-border);
  border-radius: var(--bento-radius-xs);
  background: var(--bento-card);
  color: var(--bento-text);
  transition: var(--bento-transition);
  outline: none;
}
input:focus, select:focus, textarea:focus {
  border-color: var(--bento-primary);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

/* Stat cards */
.stat-card, .stat, .metric-card, .stat-box, .overview-stat, .kpi-card {
  background: var(--bento-card);
  border: 1px solid var(--bento-border);
  border-radius: var(--bento-radius-sm);
  padding: 16px;
  transition: var(--bento-transition);
}
.stat-card:hover, .stat:hover, .metric-card:hover { box-shadow: var(--bento-shadow-md); transform: translateY(-1px); }
.stat-value, .metric-value, .stat-number { font-size: 28px; font-weight: 700; color: var(--bento-text); font-family: 'Inter', sans-serif; }
.stat-label, .metric-label, .stat-title { font-size: 12px; font-weight: 500; color: var(--bento-text-secondary); text-transform: uppercase; letter-spacing: 0.5px; }

/* Canvas override (prevent Bento CSS from distorting charts) */
canvas {
  max-width: 100% !important;
  height: auto !important;
  width: auto !important;
  border: none !important;
}

/* Pagination */
.pagination, .pag {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  margin-top: 20px;
  padding: 16px 0;
  border-top: 1px solid var(--bento-border);
}
.pagination-btn, .pag-btn {
  padding: 8px 14px;
  border: 1.5px solid var(--bento-border);
  background: var(--bento-card);
  color: var(--bento-text);
  border-radius: var(--bento-radius-xs);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  font-family: 'Inter', sans-serif;
  transition: var(--bento-transition);
}
.pagination-btn:hover:not(:disabled), .pag-btn:hover:not(:disabled) { background: var(--bento-primary); color: white; border-color: var(--bento-primary); }
.pagination-btn:disabled, .pag-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.pagination-info, .pag-info { font-size: 13px; color: var(--bento-text-secondary); font-weight: 500; padding: 0 8px; }
.page-size-select { padding: 6px 10px; border: 1.5px solid var(--bento-border); border-radius: var(--bento-radius-xs); font-size: 12px; font-family: 'Inter', sans-serif; }

/* Empty state */
.empty-state, .no-data, .no-results {
  text-align: center;
  padding: 48px 24px;
  color: var(--bento-text-secondary);
  font-size: 14px;
}

/* Scrollbar */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--bento-border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--bento-text-muted); }

/* ===== END BENTO LIGHT MODE ===== */

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
  color-scheme: light !important;
}
* { box-sizing: border-box; }

.card, .card-container, .reports-card, .export-card {
  background: var(--bento-card); border-radius: var(--bento-radius-sm); box-shadow: var(--bento-shadow-sm);
  padding: 28px; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: var(--bento-text); border: 1px solid var(--bento-border); animation: fadeSlideIn 0.4s ease-out;
}
.card-header { font-size: 20px; font-weight: 700; margin-bottom: 20px; color: var(--bento-text); letter-spacing: -0.01em; display: flex; justify-content: space-between; align-items: center; }
.card-header h2 { font-size: 20px; font-weight: 700; color: var(--bento-text); margin: 0; letter-spacing: -0.01em; }
.card-title, .title, .header-title, .pan-title { font-size: 20px; font-weight: 700; color: var(--bento-text); letter-spacing: -0.01em; }
.header, .topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.tabs { display: flex; gap: 4px; border-bottom: 2px solid var(--bento-border); margin-bottom: 24px; overflow-x: auto; padding-bottom: 0; }
.tab, .tab-btn, .tab-button { padding: 10px 20px; border: none; background: transparent; color: var(--bento-text-secondary); cursor: pointer; font-size: 14px; font-weight: 500; border-bottom: 2px solid transparent; transition: var(--bento-transition); white-space: nowrap; margin-bottom: -2px; border-radius: 8px 8px 0 0; font-family: 'Inter', sans-serif; }
.tab.active, .tab-btn.active, .tab-button.active { color: var(--bento-primary); border-bottom-color: var(--bento-primary); background: rgba(59, 130, 246, 0.04); }
.tab:hover, .tab-btn:hover, .tab-button:hover { color: var(--bento-primary); background: rgba(59, 130, 246, 0.04); }
.tab-icon { margin-right: 6px; }
.tab-content { display: none; }
.tab-content.active { display: block; animation: fadeSlideIn 0.3s ease-out; }

button, .btn, .btn-s { padding: 9px 16px; border: 1.5px solid var(--bento-border); background: var(--bento-card); color: var(--bento-text); border-radius: var(--bento-radius-sm); cursor: pointer; font-size: 13px; font-weight: 500; font-family: 'Inter', sans-serif; transition: var(--bento-transition); }
button:hover, .btn:hover, .btn-s:hover { background: var(--bento-bg); border-color: var(--bento-primary); color: var(--bento-primary); }
button.active, .btn.active, .btn-act { background: var(--bento-primary); color: white; border-color: var(--bento-primary); box-shadow: 0 2px 8px rgba(59, 130, 246, 0.25); }
.btn-primary { padding: 9px 16px; background: var(--bento-primary); color: white; border: 1.5px solid var(--bento-primary); border-radius: var(--bento-radius-sm); cursor: pointer; font-size: 13px; font-weight: 600; font-family: 'Inter', sans-serif; transition: var(--bento-transition); box-shadow: 0 2px 8px rgba(59, 130, 246, 0.25); }
.btn-primary:hover { background: var(--bento-primary-hover); border-color: var(--bento-primary-hover); box-shadow: 0 4px 12px rgba(59, 130, 246, 0.35); transform: translateY(-1px); }
.btn-secondary { padding: 9px 16px; background: var(--bento-card); color: var(--bento-text); border: 1.5px solid var(--bento-border); border-radius: var(--bento-radius-sm); cursor: pointer; font-size: 13px; font-weight: 500; font-family: 'Inter', sans-serif; transition: var(--bento-transition); }
.btn-secondary:hover { border-color: var(--bento-primary); color: var(--bento-primary); background: rgba(59, 130, 246, 0.04); }
.btn-danger { padding: 9px 16px; background: var(--bento-card); color: var(--bento-error); border: 1.5px solid var(--bento-error); border-radius: var(--bento-radius-sm); cursor: pointer; font-size: 13px; font-weight: 500; font-family: 'Inter', sans-serif; transition: var(--bento-transition); }
.btn-danger:hover { background: var(--bento-error); color: white; }
.btn-small { padding: 5px 12px; font-size: 12px; border: 1px solid var(--bento-border); background: var(--bento-card); color: var(--bento-text-secondary); border-radius: var(--bento-radius-xs); cursor: pointer; font-weight: 500; font-family: 'Inter', sans-serif; transition: var(--bento-transition); }
.btn-small:hover { border-color: var(--bento-primary); color: var(--bento-primary); background: rgba(59, 130, 246, 0.04); }

input[type="text"], input[type="number"], input[type="date"], input[type="time"], input[type="email"], input[type="search"], select, textarea, .search-input, .sinput, .sinput-sm, .alert-search-box, .period-select { padding: 9px 14px; border: 1.5px solid var(--bento-border); border-radius: var(--bento-radius-sm); font-size: 13px; background: var(--bento-card); color: var(--bento-text); font-family: 'Inter', sans-serif; transition: var(--bento-transition); outline: none; }
input[type="text"]:focus, input[type="number"]:focus, input[type="date"]:focus, input[type="time"]:focus, select:focus, textarea:focus, .search-input:focus, .sinput:focus, .sinput-sm:focus, .alert-search-box:focus, .period-select:focus { border-color: var(--bento-primary); box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }
input::placeholder, .search-input::placeholder, .sinput::placeholder, .sinput-sm::placeholder { color: var(--bento-text-secondary); opacity: 0.7; }
.form-group { margin-bottom: 16px; }
.form-group.full { grid-column: 1 / -1; }
.form-row { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
label, .cg label, .clbl { display: block; font-size: 12px; font-weight: 600; color: var(--bento-text-secondary); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.03em; }
.add-form { background: var(--bento-bg); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); padding: 20px; margin-bottom: 20px; }
textarea { min-height: 80px; resize: vertical; }

.stats, .stats-grid, .stats-container, .summary-grid, .network-stats, .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 20px; }
.stat, .stat-card, .summary-card, .network-stat, .metric-card, .kpi-card { background: var(--bento-bg); border-radius: var(--bento-radius-sm); padding: 16px; border: 1px solid var(--bento-border); transition: var(--bento-transition); text-align: center; }
.stat:hover, .stat-card:hover, .summary-card:hover, .network-stat:hover, .metric-card:hover { border-color: var(--bento-primary); box-shadow: var(--bento-shadow-md); transform: translateY(-1px); }
.stat-card.online { border-left: 3px solid var(--bento-success); }
.stat-card.offline { border-left: 3px solid var(--bento-error); }
.sv, .stat-value, .summary-value, .network-stat-value, .metric-value { font-size: 24px; font-weight: 700; color: var(--bento-primary); line-height: 1.2; }
.stat.ok .sv { color: var(--bento-success); }
.stat.err .sv { color: var(--bento-error); }
.sl, .stat-label, .summary-label, .network-stat-label, .metric-label { font-size: 12px; color: var(--bento-text-secondary); font-weight: 500; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.03em; }
.stat-trend { font-size: 12px; font-weight: 600; margin-top: 4px; }
.stat-trend.positive, .trend-up { color: var(--bento-success); }
.stat-trend.negative, .trend-down { color: var(--bento-error); }

.device-table, .entity-table, .table, .alert-table, .data-table, .backup-table, .history-table, .log-table { width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 16px; }
.device-table th, .entity-table th, .table th, .alert-table th, .data-table th, .backup-table th, table th { text-align: left; padding: 12px 16px; border-bottom: 2px solid var(--bento-border); font-weight: 600; color: var(--bento-text-secondary); background: var(--bento-bg); cursor: pointer; user-select: none; white-space: nowrap; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; transition: var(--bento-transition); font-family: 'Inter', sans-serif; }
.device-table th:first-child, .entity-table th:first-child, .table th:first-child, table th:first-child { border-radius: var(--bento-radius-xs) 0 0 0; }
.device-table th:last-child, .entity-table th:last-child, .table th:last-child, table th:last-child { border-radius: 0 var(--bento-radius-xs) 0 0; }
.device-table th:hover, .entity-table th:hover, .table th:hover, table th:hover { background: rgba(59, 130, 246, 0.06); color: var(--bento-primary); }
.device-table th.sorted, .entity-table th.sorted, .table th.sorted, table th.sorted { background: rgba(59, 130, 246, 0.08); color: var(--bento-primary); }
.device-table td, .entity-table td, .table td, .alert-table td, .data-table td, .backup-table td, table td { padding: 12px 16px; border-bottom: 1px solid var(--bento-border); color: var(--bento-text); font-size: 13px; font-family: 'Inter', sans-serif; }
.device-table tr:hover, .entity-table tr:hover, .table tbody tr:hover, .alert-table tr:hover, table tr:hover { background: rgba(59, 130, 246, 0.03); }
.table-container { overflow-x: auto; border-radius: var(--bento-radius-sm); border: 1px solid var(--bento-border); }
.sort-indicator { font-size: 10px; margin-left: 4px; color: var(--bento-primary); }

.status-badge, .severity-badge { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; letter-spacing: 0.02em; text-transform: uppercase; }
.status-online, .status-home, .status-active, .status-ok, .status-healthy, .status-running, .status-complete, .status-completed, .status-success, .badge-success { background: rgba(16, 185, 129, 0.1); color: #059669; }
.status-offline, .status-error, .status-failed, .status-critical, .severity-critical, .badge-error, .badge-danger { background: rgba(239, 68, 68, 0.1); color: #DC2626; }
.status-away, .status-warning, .severity-warning, .badge-warning { background: rgba(245, 158, 11, 0.1); color: #B45309; }
.status-unavailable, .status-unknown, .status-idle, .status-inactive, .status-stopped, .badge-neutral { background: rgba(100, 116, 139, 0.1); color: var(--bento-text-secondary); }
.status-zone, .severity-info, .badge-info { background: rgba(59, 130, 246, 0.1); color: var(--bento-primary); }

.alert-item { padding: 14px 18px; border-left: 4px solid var(--bento-border); border-radius: 0 var(--bento-radius-sm) var(--bento-radius-sm) 0; margin-bottom: 10px; background: var(--bento-bg); display: flex; justify-content: space-between; align-items: center; transition: var(--bento-transition); }
.alert-item:hover { box-shadow: var(--bento-shadow-sm); }
.alert-critical { border-color: var(--bento-error); background: rgba(239, 68, 68, 0.04); }
.alert-warning { border-color: var(--bento-warning); background: rgba(245, 158, 11, 0.04); }
.alert-info { border-color: var(--bento-primary); background: rgba(59, 130, 246, 0.04); }
.alert-text { flex: 1; }
.alert-type { font-weight: 600; font-size: 13px; margin-bottom: 4px; color: var(--bento-text); }
.alert-time { font-size: 12px; color: var(--bento-text-secondary); }
.alert-actions { display: flex; gap: 8px; }
.alert-dismiss { padding: 6px 12px; font-size: 12px; background: var(--bento-card); color: var(--bento-text-secondary); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-xs); cursor: pointer; font-weight: 500; transition: var(--bento-transition); }
.alert-dismiss:hover { background: var(--bento-error); color: white; border-color: var(--bento-error); }

.section { margin-bottom: 24px; }
.section h3, .section-title, .pan-head { font-size: 16px; font-weight: 600; color: var(--bento-text); margin-bottom: 12px; letter-spacing: -0.01em; }

.battery-grid, .grid, .items-grid, .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
.battery-card, .item-card, .chore-card, .entry-card, .backup-card { background: var(--bento-bg); border-radius: var(--bento-radius-sm); padding: 16px; border: 1px solid var(--bento-border); transition: var(--bento-transition); }
.battery-card:hover, .item-card:hover, .chore-card:hover, .entry-card:hover, .backup-card:hover { box-shadow: var(--bento-shadow-md); border-color: var(--bento-primary); transform: translateY(-1px); }
.chore-card.priority-high { border-left: 3px solid var(--bento-error); }
.chore-card.priority-medium { border-left: 3px solid var(--bento-warning); }
.chore-card.priority-low { border-left: 3px solid var(--bento-success); }
.chore-title, .entry-title, .item-title { font-weight: 600; font-size: 14px; color: var(--bento-text); margin-bottom: 6px; }
.chore-meta, .entry-meta, .item-meta { font-size: 12px; color: var(--bento-text-secondary); }
.chore-assignee { font-size: 12px; color: var(--bento-primary); font-weight: 500; }
.chore-actions, .item-actions, .entry-actions { display: flex; gap: 6px; margin-top: 10px; }

.battery-bar, .progress-bar, .bandwidth-bar-bg { width: 100%; height: 8px; background: var(--bento-border); border-radius: 4px; overflow: hidden; margin-top: 8px; }
.battery-fill, .progress-fill, .bandwidth-bar-fill { height: 100%; border-radius: 4px; transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1); background: var(--bento-success); }
.battery-fill.battery_critical { background: var(--bento-error) !important; }
.battery-fill.battery_warning { background: var(--bento-warning) !important; }
.battery-label, .bandwidth-label { font-size: 13px; color: var(--bento-text); font-weight: 500; display: flex; justify-content: space-between; align-items: center; }

.pagination, .pag { display: flex; justify-content: center; align-items: center; gap: 8px; margin-top: 20px; padding: 16px 0; border-top: 1px solid var(--bento-border); }
.pagination-btn, .pag-btn { padding: 8px 14px; border: 1.5px solid var(--bento-border); background: var(--bento-card); color: var(--bento-text); border-radius: var(--bento-radius-xs); cursor: pointer; font-size: 13px; font-weight: 500; font-family: 'Inter', sans-serif; transition: var(--bento-transition); }
.pagination-btn:hover:not(:disabled), .pag-btn:hover:not(:disabled) { background: var(--bento-primary); color: white; border-color: var(--bento-primary); }
.pagination-btn:disabled, .pag-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.pagination-info, .pag-info { font-size: 13px; color: var(--bento-text-secondary); font-weight: 500; padding: 0 8px; }
.page-size-selector, .pag-size { padding: 6px 10px; border: 1.5px solid var(--bento-border); border-radius: var(--bento-radius-xs); background: var(--bento-card); color: var(--bento-text); font-size: 13px; cursor: pointer; font-family: 'Inter', sans-serif; }

.col-main { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: var(--bento-text); }
.topbar-r { display: flex; gap: 8px; align-items: center; }
.panels { display: flex; gap: 12px; }
.pan-left, .pan-center, .pan-right { background: var(--bento-card); border-radius: var(--bento-radius-sm); border: 1px solid var(--bento-border); overflow: hidden; }
.cbar { display: flex; gap: 8px; align-items: center; padding: 12px; background: var(--bento-bg); border-bottom: 1px solid var(--bento-border); }
.cg { display: flex; gap: 8px; align-items: center; }
.cg-r { margin-left: auto; }

.dd { position: relative; }
.dd-menu { position: absolute; top: 100%; left: 0; background: var(--bento-card); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); box-shadow: var(--bento-shadow-md); min-width: 180px; z-index: 100; display: none; overflow: hidden; }
.dd.open .dd-menu { display: block; }
.dd-i { padding: 10px 16px; cursor: pointer; font-size: 13px; color: var(--bento-text); transition: var(--bento-transition); font-family: 'Inter', sans-serif; }
.dd-i:hover { background: rgba(59, 130, 246, 0.06); color: var(--bento-primary); }
.dd-div { border-top: 1px solid var(--bento-border); margin: 4px 0; }

.auto-item, .tr-item, .list-item, .automation-item { padding: 12px 16px; cursor: pointer; border-bottom: 1px solid var(--bento-border); display: flex; align-items: center; gap: 10px; transition: var(--bento-transition); font-family: 'Inter', sans-serif; }
.auto-item:hover, .tr-item:hover, .list-item:hover, .automation-item:hover { background: rgba(59, 130, 246, 0.04); }
.auto-item.sel, .tr-item.sel, .list-item.selected, .automation-item.selected { background: rgba(59, 130, 246, 0.08); border-left: 3px solid var(--bento-primary); }
.auto-item.error-item, .automation-item.error-item { border-left: 3px solid var(--bento-error); }
.auto-name { font-weight: 500; font-size: 13px; color: var(--bento-text); }
.auto-meta { font-size: 12px; color: var(--bento-text-secondary); }
.auto-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--bento-text-secondary); }
.auto-dot.s-running { background: var(--bento-success); }
.auto-dot.s-stopped { background: var(--bento-text-secondary); }
.auto-dot.s-error { background: var(--bento-error); }
.auto-count { font-size: 11px; color: var(--bento-text-secondary); margin-left: auto; }

.tgroup { border: 1px solid var(--bento-border); border-radius: var(--bento-radius-xs); margin-bottom: 8px; overflow: hidden; }
.tgroup-h { padding: 10px 14px; background: var(--bento-bg); display: flex; align-items: center; gap: 8px; cursor: pointer; transition: var(--bento-transition); font-family: 'Inter', sans-serif; }
.tgroup-h:hover { background: rgba(59, 130, 246, 0.06); }
.tg-tog { transition: transform 0.2s; font-size: 12px; color: var(--bento-text-secondary); }
.tgroup.collapsed .tg-tog { transform: rotate(-90deg); }
.tgroup.collapsed .tgroup-items { display: none; }
.tg-name { font-weight: 600; font-size: 13px; color: var(--bento-text); }
.tg-cnt { font-size: 11px; color: var(--bento-text-secondary); margin-left: auto; background: var(--bento-border); padding: 2px 8px; border-radius: 10px; }

.device-detail, .detail-panel, .details { background: var(--bento-bg); border-radius: var(--bento-radius-sm); padding: 16px; border: 1px solid var(--bento-border); }
.detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--bento-border); font-size: 13px; }
.detail-row:last-child { border-bottom: none; }
.detail-label { color: var(--bento-text-secondary); font-weight: 500; }
.detail-value { color: var(--bento-text); font-weight: 600; }

.board { display: flex; gap: 16px; overflow-x: auto; padding-bottom: 8px; }
.column { min-width: 260px; background: var(--bento-bg); border-radius: var(--bento-radius-sm); padding: 12px; border: 1px solid var(--bento-border); }
.column-header { font-weight: 600; font-size: 14px; color: var(--bento-text); margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; }
.column-count { background: var(--bento-border); color: var(--bento-text-secondary); font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; }

.schedule, .calendar { margin-top: 16px; }
.week-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-top: 16px; }
.week-header { padding: 8px; text-align: center; font-size: 12px; font-weight: 600; color: var(--bento-text-secondary); text-transform: uppercase; letter-spacing: 0.03em; border-radius: var(--bento-radius-xs); }
.week-cell { padding: 8px; text-align: center; font-size: 12px; background: var(--bento-bg); border: 1px solid var(--bento-border); cursor: pointer; transition: var(--bento-transition); border-radius: var(--bento-radius-xs); }
.week-cell:hover { border-color: var(--bento-primary); background: rgba(59, 130, 246, 0.04); }
.chore-item { padding: 8px 12px; border-bottom: 1px solid var(--bento-border); font-size: 13px; }

.leaderboard { background: var(--bento-bg); border-radius: var(--bento-radius-sm); border: 1px solid var(--bento-border); overflow: hidden; }
.leaderboard-row { display: flex; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--bento-border); gap: 12px; font-size: 13px; transition: var(--bento-transition); }
.leaderboard-row:last-child { border-bottom: none; }
.leaderboard-row:hover { background: rgba(59, 130, 246, 0.04); }
.rank { font-weight: 700; color: var(--bento-primary); font-size: 14px; min-width: 28px; }
.name { font-weight: 500; color: var(--bento-text); flex: 1; }
.streak { color: var(--bento-warning); font-weight: 600; }
.completion { color: var(--bento-success); font-weight: 600; }

.baby-selector { display: flex; gap: 8px; margin-bottom: 16px; }
.quick-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 20px; }
.quick-btn, .action-btn { padding: 10px 16px; border: 1.5px solid var(--bento-border); background: var(--bento-card); border-radius: var(--bento-radius-sm); cursor: pointer; font-size: 13px; font-weight: 500; font-family: 'Inter', sans-serif; transition: var(--bento-transition); display: flex; align-items: center; gap: 6px; color: var(--bento-text); }
.quick-btn:hover, .action-btn:hover { border-color: var(--bento-primary); color: var(--bento-primary); background: rgba(59, 130, 246, 0.04); }
.quick-btn.active, .action-btn.active { background: var(--bento-primary); color: white; border-color: var(--bento-primary); }
.timeline { position: relative; padding-left: 24px; }
.timeline-item { padding: 12px 0; border-bottom: 1px solid var(--bento-border); position: relative; }
.timeline-time { font-size: 12px; color: var(--bento-text-secondary); font-weight: 500; }
.timeline-content { font-size: 13px; color: var(--bento-text); margin-top: 4px; }

canvas, .canvas-container canvas { width: 100%; height: 200px; border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); margin-bottom: 16px; }
.canvas-container { position: relative; margin-bottom: 16px; }
.chart-container { background: var(--bento-bg); border-radius: var(--bento-radius-sm); padding: 16px; border: 1px solid var(--bento-border); margin-bottom: 16px; }

.empty, .empty-state { text-align: center; padding: 48px 24px; color: var(--bento-text-secondary); font-size: 14px; font-family: 'Inter', sans-serif; }
.empty-ico, .empty-icon { font-size: 48px; margin-bottom: 12px; opacity: 0.5; }
.spinner { width: 32px; height: 32px; border: 3px solid var(--bento-border); border-top: 3px solid var(--bento-primary); border-radius: 50%; animation: spin 0.8s linear infinite; margin: 24px auto; }

.search-box, .search-bar, .controls, .ctrls, .filter-bar { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; align-items: center; }
.control-group { display: flex; gap: 8px; align-items: center; }

.domain-group-header { margin-top: 20px; padding: 10px 16px; background: var(--bento-bg); border-radius: var(--bento-radius-xs); font-weight: 600; font-size: 14px; color: var(--bento-text); border: 1px solid var(--bento-border); }
.domain-group-header:first-child { margin-top: 0; }
.domain-group-count { font-weight: 500; color: var(--bento-text-secondary); font-size: 12px; margin-left: 8px; }

.automation-list, .list, .item-list { border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); overflow: hidden; }
.automation-name, .entity-name { font-weight: 500; font-size: 13px; color: var(--bento-text); }
.automation-id, .entity-id { font-size: 11px; color: var(--bento-text-secondary); }
.error-badge, .count-badge { background: var(--bento-error); color: white; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 10px; margin-left: 6px; }
.tab .error-badge { background: var(--bento-error); color: white; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 10px; margin-left: 6px; }

.health-score, .score { font-size: 48px; font-weight: 700; color: var(--bento-primary); text-align: center; margin: 16px 0; }
.emoji { font-size: 20px; line-height: 1; }
.device-icon { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; background: rgba(59, 130, 246, 0.08); border-radius: var(--bento-radius-xs); font-size: 16px; }

.recommendation-card, .tip-card, .suggestion-card { background: var(--bento-bg); border-radius: var(--bento-radius-sm); padding: 16px; border: 1px solid var(--bento-border); margin-bottom: 12px; transition: var(--bento-transition); }
.recommendation-card:hover, .tip-card:hover, .suggestion-card:hover { border-color: var(--bento-primary); box-shadow: var(--bento-shadow-md); }

.export-options, .options-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 20px; }
.export-option, .option-card { background: var(--bento-bg); border: 1.5px solid var(--bento-border); border-radius: var(--bento-radius-sm); padding: 16px; cursor: pointer; transition: var(--bento-transition); text-align: center; }
.export-option:hover, .option-card:hover { border-color: var(--bento-primary); background: rgba(59, 130, 246, 0.04); }
.export-option.selected, .option-card.selected { border-color: var(--bento-primary); background: rgba(59, 130, 246, 0.08); box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }

.storage-bar, .usage-bar { width: 100%; height: 24px; background: var(--bento-border); border-radius: var(--bento-radius-xs); overflow: hidden; margin-bottom: 12px; }
.storage-fill, .usage-fill { height: 100%; border-radius: var(--bento-radius-xs); transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1); background: var(--bento-primary); }

.check-item, .security-item { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--bento-border); transition: var(--bento-transition); }
.check-item:hover, .security-item:hover { background: rgba(59, 130, 246, 0.03); }
.check-icon { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 16px; }
.check-icon.pass { background: rgba(16, 185, 129, 0.1); }
.check-icon.fail { background: rgba(239, 68, 68, 0.1); }
.check-icon.warn { background: rgba(245, 158, 11, 0.1); }
.check-text, .security-text { flex: 1; }
.check-title { font-weight: 600; font-size: 13px; color: var(--bento-text); }
.check-desc { font-size: 12px; color: var(--bento-text-secondary); margin-top: 2px; }

.waveform { background: var(--bento-bg); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); padding: 16px; margin-bottom: 16px; }
.analysis-result, .result-card { background: var(--bento-bg); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); padding: 20px; text-align: center; margin-bottom: 16px; }
.confidence-bar { height: 8px; background: var(--bento-border); border-radius: 4px; overflow: hidden; margin-top: 8px; }
.confidence-fill { height: 100%; border-radius: 4px; background: var(--bento-primary); transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1); }

.sentence-item, .intent-item { padding: 12px 16px; border-bottom: 1px solid var(--bento-border); display: flex; justify-content: space-between; align-items: center; transition: var(--bento-transition); }
.sentence-item:hover, .intent-item:hover { background: rgba(59, 130, 246, 0.03); }
.sentence-text { font-size: 13px; color: var(--bento-text); font-family: 'Inter', sans-serif; }
.intent-badge { display: inline-flex; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; background: rgba(59, 130, 246, 0.1); color: var(--bento-primary); }

.backup-item, .backup-entry { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-bottom: 1px solid var(--bento-border); transition: var(--bento-transition); }
.backup-item:hover, .backup-entry:hover { background: rgba(59, 130, 246, 0.03); }
.backup-name { font-weight: 500; font-size: 14px; color: var(--bento-text); }
.backup-date, .backup-size { font-size: 12px; color: var(--bento-text-secondary); }

.report-section { background: var(--bento-bg); border-radius: var(--bento-radius-sm); padding: 20px; border: 1px solid var(--bento-border); margin-bottom: 16px; }
.insight-card { padding: 14px; border-left: 3px solid var(--bento-primary); background: rgba(59, 130, 246, 0.04); border-radius: 0 var(--bento-radius-xs) var(--bento-radius-xs) 0; margin-bottom: 10px; }

@keyframes fadeSlideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--bento-border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--bento-text-secondary); }

@media (max-width: 768px) {
  .card, .card-container, .reports-card, .export-card { padding: 16px; }
  .stats, .stats-grid, .summary-grid { grid-template-columns: repeat(2, 1fr); }
  .panels { flex-direction: column; }
  .board { flex-direction: column; }
  .column { min-width: unset; }
}

/* ===== STORAGE MONITOR SPECIFIC ===== */
.disk-gauge { display: flex; align-items: center; gap: 24px; margin-bottom: 20px; padding: 16px; background: var(--bento-bg); border-radius: var(--bento-radius-sm); border: 1px solid var(--bento-border); }
.gauge-ring { position: relative; width: 120px; height: 120px; flex-shrink: 0; }
.gauge-ring svg { width: 120px; height: 120px; transform: rotate(-90deg); }
.gauge-bg { fill: none; stroke: var(--bento-border); stroke-width: 8; }
.gauge-fill { fill: none; stroke-width: 8; stroke-linecap: round; transition: stroke-dasharray 0.8s cubic-bezier(0.4, 0, 0.2, 1); }
.gauge-text { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; }
.gauge-pct { font-size: 24px; font-weight: 700; color: var(--bento-text); font-family: 'Inter', sans-serif; line-height: 1.2; }
.gauge-label { font-size: 11px; color: var(--bento-text-secondary); text-transform: uppercase; letter-spacing: 0.5px; }
.gauge-info { flex: 1; }
.gi-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--bento-border); font-size: 13px; color: var(--bento-text-secondary); }
.gi-row:last-child { border-bottom: none; }
.gi-val { font-weight: 600; color: var(--bento-text); }

.treemap { display: flex; height: 32px; border-radius: var(--bento-radius-xs); overflow: hidden; margin-bottom: 16px; gap: 2px; }
.treemap-cell { display: flex; align-items: center; justify-content: center; color: white; font-size: 11px; font-weight: 600; text-shadow: 0 1px 2px rgba(0,0,0,0.3); min-width: 4px; border-radius: 3px; padding: 0 4px; white-space: nowrap; overflow: hidden; }

.cat-list { margin-bottom: 16px; }
.cat-item { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--bento-border); }
.cat-item:last-child { border-bottom: none; }
.cat-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.cat-icon { font-size: 18px; flex-shrink: 0; }
.cat-info { flex: 1; min-width: 0; }
.cat-name { font-size: 13px; font-weight: 500; color: var(--bento-text); }
.cat-size { font-size: 12px; color: var(--bento-text-secondary); }
.cat-bar { width: 80px; height: 6px; background: var(--bento-border); border-radius: 3px; overflow: hidden; flex-shrink: 0; }
.cat-bar-fill { height: 100%; border-radius: 3px; transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1); }

.size-bar { display: inline-block; height: 8px; border-radius: 4px; vertical-align: middle; }

.table-container { overflow-x: auto; margin-bottom: 16px; }

.suggestion { padding: 16px; background: var(--bento-bg); border-radius: var(--bento-radius-sm); border: 1px solid var(--bento-border); margin-bottom: 10px; }
.suggestion.crit { border-left: 3px solid var(--bento-error); background: var(--bento-error-light); }
.suggestion.warn { border-left: 3px solid var(--bento-warning); background: var(--bento-warning-light); }
.suggestion-title { font-weight: 600; font-size: 14px; color: var(--bento-text); margin-bottom: 4px; }
.suggestion-desc { font-size: 13px; color: var(--bento-text-secondary); }
.suggestion-savings { font-size: 12px; color: var(--bento-primary); font-weight: 500; margin-top: 6px; }

/* === DARK MODE === */

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
      <ha-card>
        <div class="storage-card">
          <div class="card-header">
            <h2>${this._config.title}</h2>
            <button class="refresh-btn" id="refreshBtn">\u{1F504} Refresh</button>
          </div>
          <div class="tabs">
            <button class="tab-button active" data-tab="overview">Overview</button>
            <button class="tab-button" data-tab="addons">Addons & Integrations</button>
            <button class="tab-button" data-tab="backups">Backups</button>
            <button class="tab-button" data-tab="files">Files & Folders</button>
            <button class="tab-button" data-tab="cleanup">Cleanup</button>
          </div>
          <div id="content"></div>
        </div>
      </ha-card>
    `;
    if (this._lastHtml === html) return;
    this._lastHtml = html;
    this.shadowRoot.innerHTML = html;

    // Tab handlers
    this.shadowRoot.querySelectorAll('.tab-button').forEach(btn => {
      btn.addEventListener('click', () => {
        this.shadowRoot.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._activeTab = btn.dataset.tab;
        this._updateContent();
      });
    });

    this.shadowRoot.getElementById('refreshBtn').addEventListener('click', () => this._loadStorageData());
  }

  _updateContent() {
    // J2 fix: debounce to prevent flickering
    if (this._updateContentRAF) cancelAnimationFrame(this._updateContentRAF);
    this._updateContentRAF = requestAnimationFrame(() => this._doUpdateContent());
  }

  _doUpdateContent() {
    const content = this.shadowRoot.getElementById('content');
    if (!content) return;

    if (this._loading) {
      content.innerHTML = '<div class="loading"><div class="spinner"></div>Loading storage info...</div>';
      return;
    }

    if (this._storageData?.noSupervisor) {
      const L = this._lang === 'pl';
      content.innerHTML = `<div style="text-align:center;padding:48px 24px;color:var(--bento-text-secondary,#64748B)">
        <div style="font-size:48px;margin-bottom:16px">\u{1F4E6}</div>
        <div style="font-size:18px;font-weight:600;color:var(--bento-text,#1E293B);margin-bottom:8px">${L ? 'Wymaga Home Assistant OS / Supervised' : 'Requires Home Assistant OS / Supervised'}</div>
        <div style="max-width:400px;margin:0 auto;line-height:1.5">${L ? 'Storage Monitor wymaga Supervisor API do odczytu informacji o dysku, dodatkach i kopiach zapasowych. Zainstaluj HA OS lub HA Supervised.' : 'Storage Monitor requires the Supervisor API to read disk, addon, and backup information. Install HA OS or HA Supervised.'}</div>
      </div>`;
      return;
    }
    if (!this._storageData || this._storageData.error) {
      content.innerHTML = `<div class="error">\u26A0\uFE0F ${this._storageData?.error || 'No data'}</div>`;
      return;
    }

    const d = this._storageData;
    if (this._activeTab === 'overview') content.innerHTML = this._renderOverview(d);
    else if (this._activeTab === 'addons') content.innerHTML = this._renderAddonsAndIntegrations(d);
    else if (this._activeTab === 'backups') content.innerHTML = this._renderBackups(d);
    else if (this._activeTab === 'files') content.innerHTML = this._renderFiles(d);
    else if (this._activeTab === 'cleanup') content.innerHTML = this._renderCleanup(d);

    this._attachContentEvents();
  }

  _renderOverview(d) {
    const circ = 2 * Math.PI * 40;
    const usedPct = d.usedPercent;
    const fillColor = usedPct > 90 ? '#f44336' : usedPct > 75 ? '#ff9800' : 'var(--bento-primary)';
    const totalMB = d.categories.reduce((s, c) => s + c.size, 0);

    return `
      <div class="disk-gauge">
        <div class="gauge-ring">
          <svg viewBox="0 0 100 100">
            <circle class="gauge-bg" cx="50" cy="50" r="40" />
            <circle class="gauge-fill" cx="50" cy="50" r="40" style="stroke:${fillColor};stroke-dasharray:${(usedPct/100)*circ} ${circ}" />
          </svg>
          <div class="gauge-text">
            <div class="gauge-pct">${usedPct}%</div>
            <div class="gauge-label">used</div>
          </div>
        </div>
        <div class="gauge-info">
          <div class="gi-row"><span>Total</span><span class="gi-val">${d.diskTotal.toFixed(1)} GB</span></div>
          <div class="gi-row"><span>Used</span><span class="gi-val">${d.diskUsed.toFixed(1)} GB</span></div>
          <div class="gi-row"><span>Free</span><span class="gi-val">${d.diskFree.toFixed(1)} GB</span></div>
          <div class="gi-row"><span>Host</span><span class="gi-val">${d.hostname}</span></div>
          <div class="gi-row"><span>OS</span><span class="gi-val">${d.osVersion}</span></div>
        </div>
      </div>

      <div class="treemap">
        ${d.categories.filter(c => c.size > 0).map(c => {
          const pct = Math.max(2, (c.size / totalMB) * 100);
          return `<div class="treemap-cell" style="flex:${pct};background:${c.color}" title="${c.name}: ${this._fmtSize(c.size)}">${c.icon} ${pct > 10 ? c.name.split(' ')[0] : ''}</div>`;
        }).join('')}
      </div>

      <div class="cat-list">
        ${d.categories.map(c => `
          <div class="cat-item">
            <div class="cat-dot" style="background:${c.color}"></div>
            <span class="cat-icon">${c.icon}</span>
            <div class="cat-info">
              <div class="cat-name">${c.name}${c.items ? ` (${c.items.length})` : ''}</div>
              <div class="cat-size">${this._fmtSize(c.size)}</div>
            </div>
            <div class="cat-bar"><div class="cat-bar-fill" style="width:${Math.min(100, (c.size / totalMB) * 100)}%;background:${c.color}"></div></div>
          </div>
        `).join('')}
      </div>
    `;
  }

  _renderAddons(d) { return this._renderAddonsAndIntegrations(d); }

  _renderAddonsAndIntegrations(d) {
    const L = this._lang === 'pl';
    const hasAnySizes = d.addons.some(a => a.size > 0);
    const sizeNote = hasAnySizes ? '' : `<div style="padding:8px 12px;background:rgba(59,130,246,0.06);border-radius:8px;margin-bottom:12px;font-size:12px;color:var(--bento-text-secondary,#64748b);">\u{1F4A1} ${L ? 'Rozmiary addon\u00F3w mog\u0105 nie by\u0107 dost\u0119pne na wszystkich instalacjach HA.' : 'Addon disk sizes may not be available on all HA installations.'}</div>`;
    const maxAddonSize = Math.max(...d.addons.map(a => a.size), 1);

    // Determine HACS integrations
    const hacsIntegrations = (d.integrations || []).filter(i => i.source === 'hacs' || i.source === 'custom');
    const coreIntegrations = (d.integrations || []).filter(i => i.source !== 'hacs' && i.source !== 'custom');

    const sortedAddons = [...d.addons].sort((a, b) => this._sortAsc ? a.size - b.size : b.size - a.size);
    const sortedInts = [...(d.integrations || [])].sort((a, b) => {
      const sa = a.source === 'hacs' || a.source === 'custom' ? 'HACS' : 'Core';
      const sb = b.source === 'hacs' || b.source === 'custom' ? 'HACS' : 'Core';
      return sa.localeCompare(sb);
    });

    return `
      ${sizeNote}
      <h3 style="margin:0 0 12px;font-size:15px;color:var(--bento-text,#1e293b);">\u{1F9E9} ${L ? 'Dodatki' : 'Add-ons'} (${d.addons.length})</h3>
      <div class="table-container">
        <table class="entity-table">
          <thead><tr>
            <th>${L ? 'Dodatek' : 'Addon'}</th>
            <th>${L ? 'Rozmiar' : 'Size'}</th>
            <th>Status</th>
            <th>${L ? 'Wersja' : 'Version'}</th>
            <th></th>
          </tr></thead>
          <tbody>
            ${sortedAddons.map(a => `
              <tr>
                <td title="${a.slug}">${a.name}</td>
                <td>${a.size < 1 ? '< 1 MB' : this._fmtSize(a.size)}</td>
                <td><span style="color:${a.state === 'started' ? '#4caf50' : '#9e9e9e'}">\u25CF ${a.state || 'stopped'}</span></td>
                <td>${a.version || '-'}</td>
                <td><span class="size-bar" style="width:${Math.max(4, (a.size / maxAddonSize) * 100)}px;background:#4caf50"></span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <h3 style="margin:24px 0 12px;font-size:15px;color:var(--bento-text,#1e293b);">\u{1F50C} ${L ? 'Integracje' : 'Integrations'} (${(d.integrations || []).length})</h3>
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
        <div style="padding:6px 12px;background:rgba(33,150,243,0.08);border-radius:8px;font-size:12px;color:var(--bento-text-secondary,#64748b);">\u{1F4E6} Core: ${coreIntegrations.length}</div>
        <div style="padding:6px 12px;background:rgba(255,152,0,0.08);border-radius:8px;font-size:12px;color:var(--bento-text-secondary,#64748b);">\u{1F3EA} HACS: ${hacsIntegrations.length}</div>
        <div style="padding:6px 12px;background:rgba(76,175,80,0.08);border-radius:8px;font-size:12px;color:var(--bento-text-secondary,#64748b);">\u{1F4CA} ${L ? 'Szacowany rozmiar' : 'Est. storage'}: ~${this._fmtSize((d.integrations || []).length * 0.1)}</div>
      </div>
      <div class="table-container">
        <table class="entity-table">
          <thead><tr>
            <th>${L ? 'Integracja' : 'Integration'}</th>
            <th>Domain</th>
            <th>${L ? '\u0179r\u00F3d\u0142o' : 'Source'}</th>
            <th>Status</th>
          </tr></thead>
          <tbody>
            ${sortedInts.slice(0, 60).map(i => {
              const isHacs = i.source === 'hacs' || i.source === 'custom';
              return `
              <tr>
                <td>${i.title || i.domain}</td>
                <td><code style="font-size:11px;background:rgba(0,0,0,0.05);padding:2px 6px;border-radius:4px;">${i.domain}</code></td>
                <td><span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:500;background:${isHacs ? 'rgba(255,152,0,0.1);color:#f57c00' : 'rgba(33,150,243,0.1);color:#1976d2'}">${isHacs ? '\u{1F3EA} HACS' : '\u{1F4E6} Core'}</span></td>
                <td><span style="color:${i.state === 'loaded' ? '#4caf50' : i.state === 'setup_error' ? '#f44336' : '#9e9e9e'}">\u25CF ${i.state || 'unknown'}</span></td>
              </tr>`;
            }).join('')}
            ${(d.integrations || []).length > 60 ? `<tr><td colspan="4" style="text-align:center;color:var(--bento-text-secondary,#64748b);font-size:12px;">... ${L ? 'i' : 'and'} ${(d.integrations || []).length - 60} ${L ? 'wi\u0119cej' : 'more'}</td></tr>` : ''}
          </tbody>
        </table>
      </div>
    `;
  }

  _renderBackups(d) {
    if (!d.backups.length) return '<div class="loading">No backups found</div>';
    const maxSize = Math.max(...d.backups.map(b => b.size), 1);
    return `
      <div class="table-container">
        <table class="entity-table">
          <thead><tr>
            <th>Backup</th>
            <th>Size</th>
            <th>Date</th>
            <th>Type</th>
            <th>Visualization</th>
          </tr></thead>
          <tbody>
            ${d.backups.map(b => `
              <tr>
                <td title="${b.slug}">${b.name}</td>
                <td>${this._fmtSize(b.size)}</td>
                <td>${b.date ? new Date(b.date).toLocaleDateString() : '-'}</td>
                <td>${b.type || 'full'}</td>
                <td><span class="size-bar" style="width:${Math.max(4, (b.size / maxSize) * 100)}px;background:#9c27b0"></span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  _renderIntegrations(d) {
    if (!d.integrations || !d.integrations.length) return '<div class="loading">No integrations found</div>';
    const intCount = d.integrations.length;
    return `
      <div class="table-container">
        <div style="padding:12px;background:rgba(33,150,243,0.06);border-radius:8px;margin-bottom:12px;font-size:12px;color:var(--bento-text-secondary,#64748b);">
          📊 ${intCount} integrations detected. Estimated storage: ~${this._fmtSize(intCount * 0.1)}
        </div>
        <table class="entity-table">
          <thead><tr>
            <th>Integration</th>
            <th>Domain</th>
            <th>Source</th>
          </tr></thead>
          <tbody>
            ${d.integrations.slice(0, 50).map(i => `
              <tr>
                <td>${i.title || i.domain}</td>
                <td><code style="font-size:11px;background:rgba(0,0,0,0.05);padding:2px 6px;border-radius:4px;">${i.domain}</code></td>
                <td>${i.source || 'user'}</td>
              </tr>
            `).join('')}
            ${d.integrations.length > 50 ? `<tr><td colspan="3" style="text-align:center;color:var(--bento-text-secondary,#64748b);font-size:12px;">... and ${d.integrations.length - 50} more</td></tr>` : ''}
          </tbody>
        </table>
      </div>
    `;
  }
  _renderFiles(d) {
    const L = this._lang === 'pl';
    if (!this._hass) return `<div class="loading">${L ? 'Brak dost\u0119pu do danych' : 'No data available'}</div>`;

    // Build a virtual directory tree from known data
    const entries = [];
    const totalMB = d.diskUsed * 1024; // GB to MB

    // Known directories with estimates
    const knownDirs = [
      { path: '/config/', name: 'config', size: Math.max(totalMB * 0.05, 50), type: 'dir', icon: '\u{1F4C1}', desc: L ? 'Konfiguracja HA' : 'HA Configuration' },
      { path: '/config/www/', name: 'www', size: Math.max(totalMB * 0.01, 10), type: 'dir', icon: '\u{1F310}', desc: L ? 'Pliki statyczne (karty, zasoby)' : 'Static files (cards, resources)' },
      { path: '/config/custom_components/', name: 'custom_components', size: (d.integrations || []).filter(i => i.source === 'hacs' || i.source === 'custom').length * 2, type: 'dir', icon: '\u{1F9E9}', desc: L ? 'Komponenty HACS' : 'HACS Components' },
      { path: '/config/.storage/', name: '.storage', size: Math.max(totalMB * 0.02, 20), type: 'dir', icon: '\u{1F5C4}\uFE0F', desc: L ? 'Wewn\u0119trzna baza HA' : 'HA Internal storage' },
      { path: '/backup/', name: 'backup', size: d.backups.reduce((s, b) => s + b.size, 0), type: 'dir', icon: '\u{1F4BE}', desc: L ? 'Kopie zapasowe' : 'Backups' },
      { path: '/addons/', name: 'addons', size: d.addons.reduce((s, a) => s + a.size, 0), type: 'dir', icon: '\u{1F4E6}', desc: L ? 'Dane addon\u00F3w' : 'Addon data' },
      { path: '/ssl/', name: 'ssl', size: 0.1, type: 'dir', icon: '\u{1F512}', desc: L ? 'Certyfikaty SSL' : 'SSL certificates' },
      { path: '/media/', name: 'media', size: Math.max(totalMB * 0.01, 5), type: 'dir', icon: '\u{1F3AC}', desc: L ? 'Pliki multimedialne' : 'Media files' },
      { path: '/share/', name: 'share', size: Math.max(totalMB * 0.005, 2), type: 'dir', icon: '\u{1F4C2}', desc: L ? 'Wsp\u00F3\u0142dzielone' : 'Shared folder' },
    ];

    // Add recorder DB as a file entry
    if (d.dbSizeMB > 0) {
      knownDirs.push({ path: '/config/home-assistant_v2.db', name: 'home-assistant_v2.db', size: d.dbSizeMB, type: 'file', icon: '\u{1F5C3}\uFE0F', desc: L ? 'Baza danych Recorder' : 'Recorder database' });
    }

    // Sort by sortBy
    const sortKey = this._sortBy;
    const sortAsc = this._sortAsc;
    const sorted = [...knownDirs].sort((a, b) => {
      if (sortKey === 'name') return sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      return sortAsc ? a.size - b.size : b.size - a.size;
    });

    const maxSize = Math.max(...sorted.map(e => e.size), 1);

    return `
      <div style="margin-bottom:12px;display:flex;gap:8px;align-items:center;">
        <span style="font-size:12px;color:var(--bento-text-secondary,#64748b);">${L ? 'Sortuj:' : 'Sort:'}</span>
        <button class="sort-btn" data-sort="size" style="padding:4px 10px;font-size:11px;border:1px solid var(--bento-border,#e2e8f0);border-radius:6px;background:${sortKey === 'size' ? 'var(--bento-primary-light,rgba(59,130,246,0.08))' : 'transparent'};color:var(--bento-text-secondary,#64748b);cursor:pointer;">${L ? 'Rozmiar' : 'Size'} ${sortKey === 'size' ? (sortAsc ? '\u2191' : '\u2193') : ''}</button>
        <button class="sort-btn" data-sort="name" style="padding:4px 10px;font-size:11px;border:1px solid var(--bento-border,#e2e8f0);border-radius:6px;background:${sortKey === 'name' ? 'var(--bento-primary-light,rgba(59,130,246,0.08))' : 'transparent'};color:var(--bento-text-secondary,#64748b);cursor:pointer;">${L ? 'Nazwa' : 'Name'} ${sortKey === 'name' ? (sortAsc ? '\u2191' : '\u2193') : ''}</button>
      </div>
      <div style="padding:8px 12px;background:rgba(59,130,246,0.06);border-radius:8px;margin-bottom:12px;font-size:12px;color:var(--bento-text-secondary,#64748b);">
        \u{1F4CA} ${L ? 'Szacowany rozk\u0142ad plik\u00F3w i folder\u00F3w. Rzeczywiste rozmiary mog\u0105 si\u0119 r\u00F3\u017Cni\u0107.' : 'Estimated file/folder breakdown. Actual sizes may vary.'}
        ${L ? 'Dysk:' : 'Disk:'} ${d.diskUsed.toFixed(1)} / ${d.diskTotal.toFixed(1)} GB (${d.usedPercent}%)
      </div>
      <div class="table-container">
        <table class="entity-table">
          <thead><tr>
            <th>${L ? 'Nazwa' : 'Name'}</th>
            <th>${L ? 'Rozmiar' : 'Size'}</th>
            <th>${L ? 'Opis' : 'Description'}</th>
            <th></th>
          </tr></thead>
          <tbody>
            ${sorted.map(e => `
              <tr>
                <td>${e.icon} <code style="font-size:12px;">${e.path}</code></td>
                <td style="white-space:nowrap;">${e.size < 1 ? '< 1 MB' : this._fmtSize(e.size)}</td>
                <td style="font-size:12px;color:var(--bento-text-secondary,#64748b);">${e.desc}</td>
                <td><span class="size-bar" style="width:${Math.max(4, (e.size / maxSize) * 100)}px;background:${e.type === 'file' ? '#ff9800' : '#3b82f6'}"></span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  _renderCleanup(d) {
    const suggestions = [];
    if (d.usedPercent > 80) {
      suggestions.push({ title: '\u26A0\uFE0F Disk usage above 80%', desc: `Your disk is ${d.usedPercent}% full. Consider freeing up space.`, savings: '', cls: d.usedPercent > 90 ? 'crit' : 'warn' });
    }
    if (d.backups.length > 5) {
      const oldBackups = d.backups.slice(3);
      const savings = oldBackups.reduce((s, b) => s + b.size, 0);
      suggestions.push({ title: '\u{1F4BE} Old backups can be removed', desc: `You have ${d.backups.length} backups. Keeping only the 3 most recent could free space.`, savings: `Potential savings: ${this._fmtSize(savings)}`, cls: '' });
    }
    if (d.dbSizeMB > 500) {
      suggestions.push({ title: '\u{1F5C4}\uFE0F Large database', desc: `Your recorder database is ${this._fmtSize(d.dbSizeMB)}. Consider reducing recorder history days or purging old data.`, savings: 'Tip: Set purge_keep_days in recorder config', cls: d.dbSizeMB > 2048 ? 'warn' : '' });
    }
    const stoppedAddons = d.addons.filter(a => a.state !== 'started' && a.size > 10);
    if (stoppedAddons.length > 0) {
      const savings = stoppedAddons.reduce((s, a) => s + a.size, 0);
      suggestions.push({ title: '\u{1F9E9} Stopped addons using storage', desc: `${stoppedAddons.length} stopped addon(s): ${stoppedAddons.map(a => a.name).join(', ')}`, savings: `Storage used: ${this._fmtSize(savings)}`, cls: '' });
    }
    if (suggestions.length === 0) {
      suggestions.push({ title: '\u2705 Storage looks healthy', desc: `Disk usage is at ${d.usedPercent}% with ${d.diskFree.toFixed(1)} GB free.`, savings: '', cls: '' });
    }

    return suggestions.map(s => `
      <div class="suggestion ${s.cls}">
        <div class="suggestion-title">${s.title}</div>
        <div class="suggestion-desc">${s.desc}</div>
        ${s.savings ? `<div class="suggestion-savings">${s.savings}</div>` : ''}
      </div>
    `).join('');
  }

  _attachContentEvents() {
    this.shadowRoot.querySelectorAll('.entity-table th').forEach(th => {
      th.addEventListener('click', () => {});
    });
    // Sort buttons for files tab
    this.shadowRoot.querySelectorAll('.sort-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const newSort = btn.dataset.sort;
        if (this._sortBy === newSort) {
          this._sortAsc = !this._sortAsc;
        } else {
          this._sortBy = newSort;
          this._sortAsc = newSort === 'name';
        }
        this._updateContent();
      });
    });
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
}

customElements.define('ha-storage-monitor', HAStorageMonitor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'ha-storage-monitor',
  name: 'Storage Monitor',
  description: 'WinDirStat-like storage visualization for Home Assistant',
  preview: true
});

console.info(
  '%c  HA-STORAGE-MONITOR  %c v1.0.0 ',
  'background: #4caf50; color: white; font-weight: bold; padding: 2px 6px; border-radius: 4px 0 0 4px;',
  'background: #e8f5e9; color: #4caf50; font-weight: bold; padding: 2px 6px; border-radius: 0 4px 4px 0;'
);

class HaStorageMonitorEditor extends HTMLElement {
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
      <h3>Storage Monitor</h3>
            <div style="margin-bottom:12px;">
              <label style="display:block;font-weight:500;margin-bottom:4px;font-size:13px;">Title</label>
              <input type="text" id="cf_title" value="${this._config?.title || 'Storage Monitor'}"
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
if (!customElements.get('ha-storage-monitor-editor')) { customElements.define('ha-storage-monitor-editor', HaStorageMonitorEditor); }
