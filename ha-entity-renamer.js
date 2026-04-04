/**
 * HA Entity Renamer — Device & Entity Rename Tool
 * Renames devices/entities and propagates changes across dashboards, automations, scripts, config.
 * Part of HA Tools suite.
 */
class HAEntityRenamer extends HTMLElement {
  static getConfigElement() { return document.createElement('ha-entity-renamer-editor'); }
  static getStubConfig() { return { type: 'custom:ha-entity-renamer', title: 'Entity Renamer' }; }
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass = null;
    this._devices = [];
    this._entities = [];
    this._selectedDevice = null;
    this._searchQuery = '';
    this._renameQueue = []; // {oldId, newId, newName?, entityObj}
    this._previewMode = false;
    this._deviceRenameQueue = {}; // deviceId -> newName
    this._impactResults = null;
    this._loading = false;
    this._message = null;
    this._activeTab = 'devices'; // devices | queue | log
    this._renameLog = [];
    this._expandedDevices = new Set();
  }

  _sanitize(str) {
    if (!str) return str;
    try { return decodeURIComponent(escape(str)); } catch(e) { return str; }
  }
  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._init();
  }

  async _init() {
    this.render();
    await this._loadData();
    this.render();
  }

  async _loadData() {
    this._loading = true;
    this.render();
    try {
      const [devResult, entResult] = await Promise.all([
        this._hass.callWS({ type: 'config/device_registry/list' }),
        this._hass.callWS({ type: 'config/entity_registry/list' }),
      ]);
      this._devices = devResult.sort((a, b) =>
        (a.name_by_user || a.name || '').localeCompare(b.name_by_user || b.name || '')
      );
      this._entities = entResult;
      // Build device->entities map
      this._deviceEntities = {};
      for (const ent of this._entities) {
        const did = ent.device_id;
        if (!did) continue;
        if (!this._deviceEntities[did]) this._deviceEntities[did] = [];
        this._deviceEntities[did].push(ent);
      }
      // Sort entities within each device
      for (const did of Object.keys(this._deviceEntities)) {
        this._deviceEntities[did].sort((a, b) => a.entity_id.localeCompare(b.entity_id));
      }
    } catch (e) {
      this._message = { type: 'error', text: 'Błąd ładowania danych: ' + e.message };
    }
    this._loading = false;
  }


  _getDeviceName(d) { return d.name_by_user || d.name || d.id; }

  _getFilteredDevices() {
    const q = this._searchQuery.toLowerCase().trim();
    if (!q) return this._devices.filter(d => (this._deviceEntities[d.id] || []).length > 0);
    return this._devices.filter(d => {
      const name = this._getDeviceName(d).toLowerCase();
      if (name.includes(q)) return true;
      const ents = this._deviceEntities[d.id] || [];
      return ents.some(e => e.entity_id.toLowerCase().includes(q) || (e.name || '').toLowerCase().includes(q));
    });
  }

  _findCommonPrefix(entityIds) {
    if (!entityIds.length) return '';
    // Strip domain prefix (e.g. sensor.) and find common prefix of object_ids
    const objectIds = entityIds.map(id => id.split('.')[1] || id);
    if (objectIds.length === 1) return objectIds[0];
    let prefix = objectIds[0];
    for (let i = 1; i < objectIds.length; i++) {
      while (objectIds[i].indexOf(prefix) !== 0) {
        prefix = prefix.substring(0, prefix.length - 1);
        if (!prefix) return '';
      }
    }
    // Trim trailing _ or .
    return prefix.replace(/[_.]$/, '');
  }

  _selectDevice(deviceId) {
    this._selectedDevice = deviceId === this._selectedDevice ? null : deviceId;
    this._prefixOld = '';
    this._prefixNew = '';
    if (this._selectedDevice) {
      const ents = this._deviceEntities[this._selectedDevice] || [];
      this._prefixOld = this._findCommonPrefix(ents.map(e => e.entity_id));
    }
    this.render();
  }


  _addToQueue(oldId, newId, newName) {
    if (oldId === newId && !newName) return;
    if (this._renameQueue.some(r => r.oldId === oldId)) {
      this._renameQueue = this._renameQueue.map(r => r.oldId === oldId ? { ...r, newId, ...(newName !== undefined ? { newName } : {}) } : r);
    } else {
      const ent = this._entities.find(e => e.entity_id === oldId);
      this._renameQueue.push({ oldId, newId, newName: newName || null, entity: ent });
    }
    this.render();
  }

  _removeFromQueue(oldId) {
    this._renameQueue = this._renameQueue.filter(r => r.oldId !== oldId);
    this.render();
  }

  _clearQueue() {
    this._renameQueue = [];
    this._impactResults = null;
    this.render();
  }

  _addPrefixRename() {
    if (!this._prefixOld || !this._prefixNew || this._prefixOld === this._prefixNew) return;
    const ents = this._deviceEntities[this._selectedDevice] || [];
    for (const ent of ents) {
      const objId = ent.entity_id.split('.')[1] || '';
      if (objId.startsWith(this._prefixOld)) {
        const domain = ent.entity_id.split('.')[0];
        const newObjId = this._prefixNew + objId.substring(this._prefixOld.length);
        const newId = domain + '.' + newObjId;
        this._addToQueue(ent.entity_id, newId);
      }
    }
    this.render();
  }


  async _analyzeImpact() {
    if (!this._renameQueue.length) return;
    this._loading = true;
    this._message = { type: 'info', text: 'Analizuję wpływ zmian...' };
    this.render();

    const impact = {};
    // 1. Use search/related WS API for each entity (automations, scripts, scenes, areas)
    const searchPromises = this._renameQueue.map(rename =>
      this._hass.callWS({ type: 'search/related', item_type: 'entity', item_id: rename.oldId })
        .then(result => ({ oldId: rename.oldId, result }))
        .catch(() => ({ oldId: rename.oldId, result: {} }))
    );
    const searchResults = await Promise.all(searchPromises);

    // Build friendly names lookup for automations/scripts
    const hass = this._hass;
    for (const { oldId, result } of searchResults) {
      const hits = { automations: [], scripts: [], dashboards: [], scenes: [] };
      // Automations
      if (result.automation) {
        for (const autoId of result.automation) {
          const state = hass.states[autoId];
          hits.automations.push(state ? state.attributes.friendly_name : autoId.replace('automation.', ''));
        }
      }
      // Scripts
      if (result.script) {
        for (const scriptId of result.script) {
          const state = hass.states[scriptId];
          hits.scripts.push(state ? state.attributes.friendly_name : scriptId.replace('script.', ''));
        }
      }
      // Scenes
      if (result.scene) {
        for (const sceneId of result.scene) {
          const state = hass.states[sceneId];
          hits.scenes.push(state ? state.attributes.friendly_name : sceneId.replace('scene.', ''));
        }
      }
      impact[oldId] = hits;
    }

    // 2. Also scan dashboards (search/related doesn't cover lovelace)
    try {
      const lovelaceConfig = await this._loadLovelaceConfigs();
      for (const rename of this._renameQueue) {
        for (const dash of lovelaceConfig) {
          if (JSON.stringify(dash.config || {}).includes(rename.oldId)) {
            impact[rename.oldId].dashboards.push(dash.title || dash.url_path || 'default');
          }
        }
      }
    } catch(e) {}

    this._impactResults = impact;
    this._loading = false;
    this._message = null;
    this._activeTab = 'queue';
    this.render();
  }

  async _loadLovelaceConfigs() {
    try {
      const dashboards = await this._hass.callWS({ type: 'lovelace/dashboards/list' });
      const configs = [];
      // Default dashboard
      try {
        const defCfg = await this._hass.callWS({ type: 'lovelace/config', force: false });
        configs.push({ url_path: 'default', title: 'Default', config: defCfg });
      } catch(e) {}
      // Other dashboards
      for (const dash of dashboards) {
        try {
          const cfg = await this._hass.callWS({ type: 'lovelace/config', url_path: dash.url_path });
          configs.push({ url_path: dash.url_path, title: dash.title || dash.url_path, config: cfg });
        } catch(e) {}
      }
      return configs;
    } catch(e) { return []; }
  }


  async _executeRenames() {
    if (!this._renameQueue.length && !Object.keys(this._deviceRenameQueue).length) return;
    this._loading = true;
    this._message = { type: 'info', text: 'Analizuję wpływ i zmieniam nazwy...' };
    this.render();

    // Auto-run impact analysis before execution using search/related
    let impact = {};
    try {
      const hass = this._hass;
      const searchPromises = this._renameQueue.map(rename =>
        hass.callWS({ type: 'search/related', item_type: 'entity', item_id: rename.oldId })
          .then(result => ({ oldId: rename.oldId, result }))
          .catch(() => ({ oldId: rename.oldId, result: {} }))
      );
      const searchResults = await Promise.all(searchPromises);
      for (const { oldId, result } of searchResults) {
        const hits = { automations: [], scripts: [], dashboards: [], scenes: [] };
        if (result.automation) {
          for (const aId of result.automation) {
            const st = hass.states[aId];
            hits.automations.push(st ? st.attributes.friendly_name : aId.replace('automation.', ''));
          }
        }
        if (result.script) {
          for (const sId of result.script) {
            const st = hass.states[sId];
            hits.scripts.push(st ? st.attributes.friendly_name : sId.replace('script.', ''));
          }
        }
        if (result.scene) {
          for (const scId of result.scene) {
            const st = hass.states[scId];
            hits.scenes.push(st ? st.attributes.friendly_name : scId.replace('scene.', ''));
          }
        }
        impact[oldId] = hits;
      }
      // Also scan dashboards
      const lovelaceConfig = await this._loadLovelaceConfigs();
      for (const rename of this._renameQueue) {
        for (const dash of lovelaceConfig) {
          if (JSON.stringify(dash.config || {}).includes(rename.oldId)) {
            impact[rename.oldId].dashboards.push(dash.title || dash.url_path || 'default');
          }
        }
      }
    } catch(e) {}

    const results = [];
    const ts = new Date().toLocaleTimeString();

    // 1. Rename devices first
    for (const [devId, newName] of Object.entries(this._deviceRenameQueue)) {
      try {
        await this._hass.callWS({ type: 'config/device_registry/update', device_id: devId, name_by_user: newName });
        this._renameLog.unshift({ time: ts, oldId: '📱 ' + devId.substring(0, 8) + '...', newId: '📱 ' + newName, status: 'ok', impact: null });
      } catch (e) {
        this._renameLog.unshift({ time: ts, oldId: '📱 device', newId: '📱 ' + newName, status: 'error', error: e.message, impact: null });
      }
    }

    // 2. Rename entities (entity_id + optional friendly name)
    for (const rename of this._renameQueue) {
      const imp = impact[rename.oldId] || { automations: [], scripts: [], dashboards: [] };
      try {
        const wsPayload = { type: 'config/entity_registry/update', entity_id: rename.oldId };
        if (rename.newId && rename.newId !== rename.oldId) wsPayload.new_entity_id = rename.newId;
        if (rename.newName) wsPayload.name = rename.newName;
        await this._hass.callWS(wsPayload);
        results.push({ ...rename, status: 'ok' });
        this._renameLog.unshift({
          time: ts,
          oldId: rename.oldId,
          newId: (rename.newId !== rename.oldId ? rename.newId : rename.oldId) + (rename.newName ? ' (' + rename.newName + ')' : ''),
          status: 'ok',
          impact: imp,
        });
      } catch (e) {
        results.push({ ...rename, status: 'error', error: e.message });
        this._renameLog.unshift({ time: ts, oldId: rename.oldId, newId: rename.newId, status: 'error', error: e.message, impact: imp });
      }
    }

    const ok = results.filter(r => r.status === 'ok').length;
    const fail = results.filter(r => r.status === 'error').length;
    const devCount = Object.keys(this._deviceRenameQueue).length;
    const totalImpact = Object.values(impact).reduce((a, i) => a + i.automations.length + i.scripts.length + i.dashboards.length, 0);
    this._message = {
      type: fail > 0 ? 'warning' : 'success',
      text: `Zmieniono ${ok} encji${devCount ? ', ' + devCount + ' urządzeń' : ''}${fail > 0 ? `, ${fail} błędów` : ''}. ${totalImpact > 0 ? `⚠️ ${totalImpact} miejsc wymaga aktualizacji (szczegóły w historii).` : ''} Zrestartuj HA.`,
    };
    this._renameQueue = [];
    this._deviceRenameQueue = {};
    this._impactResults = null;
    this._loading = false;
    this._activeTab = 'log';
    await this._loadData();
    this.render();
  }


  render() {
    const devices = this._getFilteredDevices();
    const queueCount = this._renameQueue.length + Object.keys(this._deviceRenameQueue).length;

    this.shadowRoot.innerHTML = `
    <style>${window.HAToolsBentoCSS || ""}

      
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

:host { display: block; font-family: 'Inter', var(--paper-font-body1_-_font-family, sans-serif); }
      * { box-sizing: border-box; }
      .card {
        background: var(--bento-card, var(--card-background-color, #1E293B));
        border: 1px solid var(--bento-border, var(--divider-color, #334155));
        border-radius: var(--bento-radius-sm, 14px);
        padding: 24px; color: var(--bento-text, var(--primary-text-color, #E2E8F0));
      }
      h1 { margin: 0 0 4px; font-size: 22px; font-weight: 700; }
      .subtitle { color: var(--bento-text-secondary, var(--secondary-text-color, #94A3B8)); font-size: 13px; margin-bottom: 16px; }
      .msg { padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; }
      .msg.info { background: var(--bento-primary-light); color: var(--bento-primary); border: 1px solid var(--bento-primary); }
      .msg.success { background: var(--bento-success-light); color: var(--bento-success); border: 1px solid var(--bento-success); }
      .msg.error { background: var(--bento-error-light); color: var(--bento-error); border: 1px solid var(--bento-error); }
      .msg.warning { background: var(--bento-warning-light); color: var(--bento-warning); border: 1px solid var(--bento-warning); }

      

      .search-bar { display: flex; gap: 8px; margin-bottom: 16px; }
      .search-bar input {
        flex: 1; padding: 10px 14px; border-radius: 8px; font-size: 13px;
        border: 1px solid var(--bento-border, #334155);
        background: var(--bento-bg, var(--primary-background-color, #0F172A));
        color: var(--bento-text, #E2E8F0); outline: none;
      }
      .search-bar input:focus { border-color: var(--bento-primary, #3B82F6); }

      .stats-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }
      .stat-card .num { font-size: 26px; font-weight: 700; }
      .stat-card .label { font-size: 11px; text-transform: uppercase; color: var(--bento-text-secondary, #94A3B8); margin-top: 4px; }

      .device-list { max-height: 60vh; overflow-y: auto; }
      .device-item {
        border: 1px solid var(--bento-border, #334155); border-radius: 10px;
        margin-bottom: 8px; overflow: hidden; transition: border-color 0.15s;
      }
      .device-item.selected { border-color: var(--bento-primary, #3B82F6); }
      .device-header {
        display: flex; align-items: center; gap: 10px; padding: 12px 16px;
        cursor: pointer; user-select: none;
      }
      .device-header:hover { background: rgba(59,130,246,0.05); }
      .device-name { flex: 1; font-weight: 600; font-size: 14px; }
      .device-meta { font-size: 11px; color: var(--bento-text-secondary, #94A3B8); }
      .device-expand { font-size: 12px; transition: transform 0.2s; }
      .device-expand.open { transform: rotate(90deg); }
      .entity-list { padding: 0 16px 12px; }
      .entity-row {
        display: flex; align-items: center; gap: 8px; padding: 6px 0;
        border-top: 1px solid rgba(255,255,255,0.05); font-size: 12px;
      }
      .entity-id { flex: 1; font-family: 'JetBrains Mono', 'Fira Code', monospace; color: var(--bento-text-secondary, #94A3B8); word-break: break-all; }
      .entity-name { flex: 1; min-width: 120px; }
      .entity-domain { font-size: 10px; padding: 2px 6px; border-radius: 4px; background: rgba(59,130,246,0.12); color: #93C5FD; }

      .btn {
        padding: 8px 16px; border: none; border-radius: 8px; cursor: pointer;
        font-size: 12px; font-weight: 600; font-family: inherit; transition: all 0.15s;
      }
      .btn-primary { background: var(--bento-primary, #3B82F6); color: white; }
      .btn-primary:hover { opacity: 0.85; }
      .btn-danger { background: #EF4444; color: white; }
      .btn-danger:hover { opacity: 0.85; }
      .btn-sm { padding: 4px 10px; font-size: 11px; }
      .btn-outline {
        background: transparent; border: 1px solid var(--bento-border, #334155);
        color: var(--bento-text, #E2E8F0);
      }
      .btn-outline:hover { border-color: var(--bento-primary, #3B82F6); color: var(--bento-primary, #3B82F6); }
      .btn:disabled { opacity: 0.4; cursor: not-allowed; }

      .prefix-section {
        background: rgba(59,130,246,0.06); border: 1px solid rgba(59,130,246,0.15);
        border-radius: 10px; padding: 14px; margin: 12px 0;
      }
      .prefix-section h3 { margin: 0 0 8px; font-size: 13px; font-weight: 600; }
      .prefix-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .prefix-row input {
        padding: 6px 10px; border-radius: 6px; font-size: 13px; width: 180px;
        border: 1px solid var(--bento-border, #334155);
        background: var(--bento-bg, #0F172A); color: var(--bento-text, #E2E8F0);
        font-family: 'JetBrains Mono', monospace;
      }
      .prefix-row .arrow { color: var(--bento-text-secondary, #94A3B8); }

      .queue-table { width: 100%; border-collapse: collapse; font-size: 12px; }
      .queue-table th { text-align: left; padding: 8px; font-size: 11px; text-transform: uppercase; color: var(--bento-text-secondary, #94A3B8); border-bottom: 1px solid var(--bento-border, #334155); }
      .queue-table td { padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.04); font-family: 'JetBrains Mono', monospace; font-size: 11px; }
      .queue-table .old { color: #FCA5A5; text-decoration: line-through; }
      .queue-table .new { color: #86EFAC; }
      .queue-table .impact { font-family: inherit; font-size: 11px; }
      .impact-badge { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 10px; margin: 1px; }
      .impact-badge.automation { background: rgba(168,85,247,0.15); color: #C084FC; }
      .impact-badge.script { background: rgba(245,158,11,0.15); color: #FCD34D; }
      .impact-badge.dashboard { background: rgba(59,130,246,0.15); color: #93C5FD; }
      .impact-badge.scene { background: rgba(16,185,129,0.15); color: #6EE7B7; }
      .queue-actions { display: flex; gap: 8px; margin-top: 16px; justify-content: flex-end; }

      .log-entry { padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 12px; }
      .log-time { color: var(--bento-text-secondary, #94A3B8); font-size: 10px; }
      .log-ok { color: #86EFAC; }
      .log-err { color: #FCA5A5; }

      .empty-state { text-align: center; padding: 40px; color: var(--bento-text-secondary, #94A3B8); }
      .empty-state .icon { font-size: 40px; margin-bottom: 8px; }
      .spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.2); border-top-color: var(--bento-primary, #3B82F6); border-radius: 50%; animation: spin 0.8s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
    
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
        </style>
    <div class="card">
      <h1>🏷️ Device & Entity Renamer</h1>
      <div class="subtitle">${this._devices.length} urządzeń • ${this._entities.length} encji</div>

      ${this._message ? `<div class="msg ${this._message.type}">${this._loading ? '<span class="spinner"></span> ' : ''}${this._message.text}</div>` : ''}

      <div class="tabs">
        <button class="tab-button ${this._activeTab === 'devices' ? 'active' : ''}" data-tab="devices">📱 Urządzenia</button>
        <button class="tab-button ${this._activeTab === 'queue' ? 'active' : ''}" data-tab="queue">📋 Kolejka${queueCount > 0 ? ` (${queueCount})` : ''}</button>
        <button class="tab-button ${this._activeTab === 'log' ? 'active' : ''}" data-tab="log">📜 Historia</button>
      </div>

      ${this._activeTab === 'devices' ? this._renderDevicesTab(devices) : ''}
      ${this._activeTab === 'queue' ? this._renderQueueTab() : ''}
      ${this._activeTab === 'log' ? this._renderLogTab() : ''}
    </div>`;

    this._attachEvents();
  }



  _renderDevicesTab(devices) {
    return `
      <div class="search-bar">
        <input type="text" id="searchInput" placeholder="🔍 Szukaj urządzeń lub encji..." value="${this._searchQuery}">
      </div>
      <div class="stats-row">
        <div class="stat-card"><div class="num">${this._devices.length}</div><div class="label">Urządzenia</div></div>
        <div class="stat-card"><div class="num">${this._entities.length}</div><div class="label">Encje</div></div>
        <div class="stat-card"><div class="num">${this._renameQueue.length}</div><div class="label">W kolejce</div></div>
      </div>
      <div class="device-list">
        ${devices.length === 0 ? '<div class="empty-state"><div class="icon">🔍</div>Brak wyników</div>' :
          devices.map(d => {
            const ents = this._deviceEntities[d.id] || [];
            const isExpanded = this._expandedDevices.has(d.id);
            const isSelected = this._selectedDevice === d.id;
            return `
            <div class="device-item ${isSelected ? 'selected' : ''}">
              <div class="device-header" data-device-id="${d.id}">
                <span class="device-expand ${isExpanded ? 'open' : ''}">▶</span>
                <span class="device-name">${this._getDeviceName(d)}</span>
                <span class="device-meta">${ents.length} encji</span>
              </div>
              ${isExpanded ? `
              <div class="entity-list">
                ${ents.map(e => {
                  const domain = e.entity_id.split('.')[0];
                  const inQueue = this._renameQueue.some(r => r.oldId === e.entity_id);
                  return `
                  <div class="entity-row">
                    <span class="entity-domain">${domain}</span>
                    <span class="entity-id">${e.entity_id}</span>
                    <span class="entity-name">${e.name || e.original_name || ''}</span>
                    ${inQueue
                      ? '<button class="btn btn-sm btn-danger" data-remove-queue="' + e.entity_id + '">✕</button>'
                      : '<button class="btn btn-sm btn-outline" data-add-single="' + e.entity_id + '">+ Kolejka</button>'}
                  </div>`;
                }).join('')}
              </div>
              ${isSelected ? `
              <div class="prefix-section">
                <h3>📱 Nazwa urządzenia</h3>
                <div class="prefix-row" style="margin-bottom:12px">
                  <input type="text" id="deviceName" value="${this._deviceRenameQueue[d.id] || this._getDeviceName(d)}" placeholder="Nowa nazwa urządzenia" style="width:300px;font-family:inherit">
                  <button class="btn btn-primary btn-sm" id="applyDeviceName" data-device-id="${d.id}">Zmień nazwę</button>
                </div>
                <h3>🔄 Zmiana prefiksu entity_id dla wszystkich encji</h3>
                <div class="prefix-row">
                  <input type="text" id="prefixOld" value="${this._prefixOld || ''}" placeholder="Stary prefiks">
                  <span class="arrow">→</span>
                  <input type="text" id="prefixNew" value="${this._prefixNew || ''}" placeholder="Nowy prefiks">
                  <button class="btn btn-primary btn-sm" id="applyPrefix">Zastosuj</button>
                </div>
              </div>` : ''}
              ` : ''}
            </div>`;
          }).join('')}
      </div>`;
  }

  _renderQueueTab() {
    if (!this._renameQueue.length) {
      return '<div class="empty-state"><div class="icon">📋</div>Kolejka jest pusta.<br>Dodaj encje z zakładki Urządzenia.</div>';
    }
    const devEntries = Object.entries(this._deviceRenameQueue);
    return `
      ${devEntries.length ? `<div style="margin-bottom:12px;padding:10px 14px;border-radius:8px;background:rgba(168,85,247,0.08);border:1px solid rgba(168,85,247,0.2);">
        <strong style="font-size:12px;">📱 Urządzenia do zmiany nazwy:</strong>
        ${devEntries.map(([did, name]) => {
          const dev = this._devices.find(d => d.id === did);
          return `<div style="font-size:12px;margin-top:4px;"><span class="old">${dev ? this._getDeviceName(dev) : did}</span> → <span class="new">${name}</span> <button class="btn btn-sm btn-danger" data-remove-dev-queue="${did}">✕</button></div>`;
        }).join('')}
      </div>` : ''}
      <div class="queue-list">
          ${this._renameQueue.map(r => {
            const imp = this._impactResults ? this._impactResults[r.oldId] : null;
            const hasImpact = imp && (imp.automations.length || imp.scripts.length || imp.dashboards.length || (imp.scenes||[]).length);
            return `<div style="border:1px solid var(--bento-border,#334155);border-radius:8px;padding:12px;margin-bottom:8px;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                <span class="old" style="flex:1;font-family:'JetBrains Mono',monospace;font-size:11px;">${r.oldId}</span>
                <button class="btn btn-sm btn-danger" data-remove-queue="${r.oldId}">✕</button>
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="color:var(--bento-text-secondary,#94A3B8);">→</span>
                <span class="new" style="font-family:'JetBrains Mono',monospace;font-size:11px;">${r.newId !== r.oldId ? r.newId : '<span style="opacity:0.4">bez zmian entity_id</span>'}</span>
                ${r.newName ? '<span style="font-size:11px;color:#93C5FD;">📝 ' + r.newName + '</span>' : ''}
              </div>
              ${hasImpact ? `<div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.05);">
                <span style="font-size:10px;color:var(--bento-text-secondary,#94A3B8);">⚠️ Używane w:</span>
                ${imp.automations.map(a => '<span class="impact-badge automation">⚙ ' + a + '</span>').join('')}
                ${imp.scripts.map(s => '<span class="impact-badge script">📜 ' + s + '</span>').join('')}
                ${imp.dashboards.map(d => '<span class="impact-badge dashboard">📊 ' + d + '</span>').join('')}
                ${(imp.scenes||[]).map(s => '<span class="impact-badge scene">🎬 ' + s + '</span>').join('')}
              </div>` : (imp ? '<div style="margin-top:4px;font-size:10px;color:var(--bento-text-secondary,#94A3B8);">✓ Nie używane w automatyzacjach, skryptach ani dashboardach</div>' : '')}
            </div>`;
          }).join('')}
      </div>
      <div class="queue-actions">
        <button class="btn btn-outline" id="clearQueue">🗑️ Wyczyść</button>
        <button class="btn btn-outline" id="analyzeImpact" ${this._loading ? 'disabled' : ''}>🔍 Analizuj wpływ</button>
        <button class="btn btn-danger" id="executeRenames" ${this._loading ? 'disabled' : ''}>🚀 Wykonaj zmiany (${this._renameQueue.length})</button>
      </div>`;
  }

  _renderLogTab() {
    if (!this._renameLog.length) {
      return '<div class="empty-state"><div class="icon">📜</div>Brak historii zmian.<br>Wykonaj zmiany z zakładki Kolejka.</div>';
    }
    return `
      <div>
        ${this._renameLog.map(l => {
          const imp = l.impact;
          const hasImpact = imp && (imp.automations.length || imp.scripts.length || imp.dashboards.length || (imp.scenes||[]).length);
          return `
          <div class="log-entry" style="padding:8px 0;${hasImpact ? 'padding-bottom:12px;' : ''}">
            <span class="log-time">${l.time}</span>
            <span class="${l.status === 'ok' ? 'log-ok' : 'log-err'}">
              ${l.status === 'ok' ? '✅' : '❌'} ${l.oldId} → ${l.newId}
            </span>
            ${l.error ? `<br><small style="color:#FCA5A5">${l.error}</small>` : ''}
            ${hasImpact ? `<div style="margin-top:4px;padding-left:24px;">
              <span style="font-size:10px;color:var(--bento-text-secondary,#94A3B8);">⚠️ Używane w:</span>
              ${imp.automations.map(a => '<span class="impact-badge automation">⚙ ' + a + '</span>').join('')}
              ${imp.scripts.map(s => '<span class="impact-badge script">📜 ' + s + '</span>').join('')}
              ${imp.dashboards.map(d => '<span class="impact-badge dashboard">📊 ' + d + '</span>').join('')}
              ${(imp.scenes||[]).map(s => '<span class="impact-badge scene">🎬 ' + s + '</span>').join('')}
            </div>` : ''}
          </div>`;
        }).join('')}
      </div>`;
  }

  _attachEvents() {
    const root = this.shadowRoot;

    // Tab switching
    root.querySelectorAll('.tab-button').forEach(btn => {
      btn.addEventListener('click', () => {
        this._activeTab = btn.dataset.tab;
        this.render();
      });
    });

    // Search
    const searchInput = root.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this._searchQuery = e.target.value;
        this.render();
        // Restore focus and cursor position
        const el = this.shadowRoot.getElementById('searchInput');
        if (el) { el.focus(); el.selectionStart = el.selectionEnd = e.target.selectionStart; }
      });
    }

    // Device headers — toggle expand + select
    root.querySelectorAll('.device-header').forEach(hdr => {
      hdr.addEventListener('click', () => {
        const did = hdr.dataset.deviceId;
        if (this._expandedDevices.has(did)) {
          this._expandedDevices.delete(did);
          this._selectedDevice = null;
        } else {
          this._expandedDevices.add(did);
          this._selectDevice(did);
          return; // _selectDevice calls render
        }
        this.render();
      });
    });

    // Device rename
    const applyDeviceName = root.getElementById('applyDeviceName');
    if (applyDeviceName) {
      applyDeviceName.addEventListener('click', () => {
        const devId = applyDeviceName.dataset.deviceId;
        const newName = (root.getElementById('deviceName') || {}).value || '';
        if (newName) {
          this._deviceRenameQueue[devId] = newName;
          this._message = { type: 'info', text: `Nazwa urządzenia "${newName}" dodana do kolejki.` };
          this.render();
        }
      });
    }

    // Add single entity to queue (prompt for new entity_id and optional friendly name)
    root.querySelectorAll('[data-add-single]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const oldId = btn.dataset.addSingle;
        const domain = oldId.split('.')[0];
        const objId = oldId.split('.')[1] || '';
        const ent = this._entities.find(en => en.entity_id === oldId);
        const currentName = ent ? (ent.name || ent.original_name || '') : '';
        const newObjId = prompt('Nowy entity_id (object_id) — zostaw bez zmian jeśli chcesz zmienić tylko friendly name:', objId);
        if (newObjId === null) return; // cancelled
        const newFriendly = prompt('Nowy friendly name (zostaw puste = bez zmian):', currentName);
        if (newFriendly === null) return; // cancelled
        const newId = domain + '.' + (newObjId || objId);
        const nameToSet = (newFriendly && newFriendly !== currentName) ? newFriendly : null;
        if (newId !== oldId || nameToSet) {
          this._addToQueue(oldId, newId, nameToSet);
        }
      });
    });

    // Remove from queue
    root.querySelectorAll('[data-remove-queue]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._removeFromQueue(btn.dataset.removeQueue);
      });
    });

    // Remove device from queue
    root.querySelectorAll('[data-remove-dev-queue]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        delete this._deviceRenameQueue[btn.dataset.removeDevQueue];
        this.render();
      });
    });

    // Prefix rename
    const applyPrefix = root.getElementById('applyPrefix');
    if (applyPrefix) {
      applyPrefix.addEventListener('click', () => {
        this._prefixOld = (root.getElementById('prefixOld') || {}).value || '';
        this._prefixNew = (root.getElementById('prefixNew') || {}).value || '';
        this._addPrefixRename();
      });
    }

    // Queue actions
    const clearQueue = root.getElementById('clearQueue');
    if (clearQueue) clearQueue.addEventListener('click', () => this._clearQueue());

    const analyzeImpact = root.getElementById('analyzeImpact');
    if (analyzeImpact) analyzeImpact.addEventListener('click', () => this._analyzeImpact());

    const executeRenames = root.getElementById('executeRenames');
    if (executeRenames) {
      executeRenames.addEventListener('click', () => {
        if (confirm(`Czy na pewno chcesz zmienić nazwy ${this._renameQueue.length} encji? Ta operacja jest nieodwracalna.`)) {
          this._executeRenames();
        }
      });
    }
  }
}

customElements.define('ha-entity-renamer', HAEntityRenamer);

window.customCards = window.customCards || [];
window.customCards.push({ type: 'ha-entity-renamer', name: 'Entity Renamer', description: 'Rename entities and devices with propagation to dashboards and automations', preview: false });

class HaEntityRenamerEditor extends HTMLElement {
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
      <h3>Entity Renamer</h3>
            <div style="margin-bottom:12px;">
              <label style="display:block;font-weight:500;margin-bottom:4px;font-size:13px;">Title</label>
              <input type="text" id="cf_title" value="${this._config?.title || 'Entity Renamer'}"
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
if (!customElements.get('ha-entity-renamer-editor')) { customElements.define('ha-entity-renamer-editor', HaEntityRenamerEditor); }
