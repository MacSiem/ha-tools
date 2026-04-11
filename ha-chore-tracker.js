(function() {
'use strict';

// XSS protection helper (reuse global from panel, fallback for standalone)
const _esc = window._haToolsEsc || ((s) => typeof s === 'string' ? s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]) : (s ?? ''));

// -- HA Tools Persistence (stub -- full impl in ha-tools-panel.js) --
window._haToolsPersistence = window._haToolsPersistence || { _cache: {}, _hass: null, setHass(h) { this._hass = h; }, async save(k, d) { try { localStorage.setItem('ha-tools-' + k, JSON.stringify(d)); } catch(e) {} }, async load(k) { try { const r = localStorage.getItem('ha-tools-' + k); return r ? JSON.parse(r) : null; } catch(e) { return null; } }, loadSync(k) { try { const r = localStorage.getItem('ha-tools-' + k); return r ? JSON.parse(r) : null; } catch(e) { return null; } } };


class HaChoreTracker extends HTMLElement {
  static getConfigElement() {
    return document.createElement('ha-chore-tracker-editor');
  }

  getCardSize() { return 6; }

  static getStubConfig() {
    return {
      type: 'custom:ha-chore-tracker',
      title: 'Chore Tracker',
      members: [
        { name: 'Person 1', color: '#4CAF50' },
        { name: 'Person 2', color: '#2196F3' }
      ]
    };
  }

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
    this.chores = [];
    this.activeTab = 'board';
    this.config = {};
    this.hass = null;
    this._dataLoaded = false;
    this._lastHtml = '';
  }

  _storageKey() {
    return 'ha-chore-tracker-' + (this.config.storage_key || 'default');
  }

  _membersKey() {
    return 'ha-chore-tracker-members-' + (this.config.storage_key || 'default');
  }

  _loadMembers() {
    try {
      const stored = localStorage.getItem(this._membersKey());
      return stored ? JSON.parse(stored) : null;
    } catch (e) { return null; }
  }

  _saveMembers() {
    try {
      localStorage.setItem(this._membersKey(), JSON.stringify(this.members));
    } catch (e) { }
  }

  _saveData() {
    try {
      localStorage.setItem(this._storageKey(), JSON.stringify(this.chores));
    } catch(e) { /* storage full or unavailable */ }
  }

  _loadData() {
    if (this._dataLoaded) return;
    try {
      const saved = localStorage.getItem(this._storageKey());
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.chores = parsed.map(c => ({
            ...c,
            lastCompleted: c.lastCompleted ? new Date(c.lastCompleted) : null
          }));
        }
      }
    } catch(e) { /* parse error */ }
    this._dataLoaded = true;
  }


  get _t() {
    const T = {
      pl: {
        title: 'Tracker Obowiązków',
        loading: 'Wczytywanie...',
        noData: 'Brak danych',
        error: 'Błąd',
        refresh: 'Odśwież',
        save: 'Zapisz',
        cancel: 'Anuluj',
        delete: 'Usu\u0144',
        locale: 'pl-PL',
      },
      en: {
        title: 'Chore Tracker',
        loading: 'Loading...',
        noData: 'No data',
        error: 'Error',
        refresh: 'Refresh',
        save: 'Save',
        cancel: 'Cancel',
        delete: 'Delete',
        locale: 'en-US',
      },
    };
    return T[this._lang] || T.en;
  }

  setConfig(config) {
    if (!config) return;
    this.config = config;
    const storedMembers = this._loadMembers();
    this.members = storedMembers || config.members || [{ name: 'Person 1', color: '#4CAF50' }];
    this._loadData();
    this.render();
  }

  _sanitize(str) {
    if (!str) return str;
    try { return decodeURIComponent(escape(str)); } catch(e) { return str; }
  }
  set hass(hass) {

    if (hass?.language) this._lang = hass.language.startsWith('pl') ? 'pl' : 'en';    this._hass = hass;
    if (!hass) return;
    const now = Date.now();
    if (!this._firstHassRender) {
      this._firstHassRender = true;
      this.render();
      this._lastRenderTime = now;
      return;
    }
    if (now - (this._lastRenderTime || 0) < 5000) {
      if (!this._renderScheduled) {
        this._renderScheduled = true;
        setTimeout(() => {
          this._renderScheduled = false;
          this.render();
          this._lastRenderTime = Date.now();
        }, 5000 - (now - (this._lastRenderTime || 0)));
      }
      return;
    }
    this.render();
    this._lastRenderTime = now;
  }

  get hass() {
    return this._hass;
  }
  _addMember() {
    const colors = ['#4CAF50','#2196F3','#FF9800','#E91E63','#9C27B0','#00BCD4','#FF5722','#795548'];
    const color = colors[this.members.length % colors.length];
    this.members.push({name: 'Osoba ' + (this.members.length + 1), color: color});
    this._saveMembers();
    this.render();
  }

  _removeMember(idx) {
    if (this.members.length <= 1) return;
    const removedName = this.members[idx].name;
    this.members.splice(idx, 1);
    this.chores.forEach(c => { if (c.assignee === removedName) c.assignee = this.members[0].name; });
    this._saveData();
    this._saveMembers();
    this.render();
  }

  _saveMemberNames() {
    const inputs = this.shadowRoot.querySelectorAll('.member-name-input');
    inputs.forEach(input => {
      const idx = parseInt(input.dataset.memberIdx);
      if (this.members[idx]) {
        const oldName = this.members[idx].name;
        const newName = input.value.trim() || ('Osoba ' + (idx + 1));
        if (oldName !== newName) {
          this.chores.forEach(c => { if (c.assignee === oldName) c.assignee = newName; });
          this.members[idx].name = newName;
        }
      }
    });
    this._saveMembers();
    this._saveData();
    this.render();
  }

  _checkRecurringReset() {
    const now = new Date();
    let changed = false;
    this.chores.forEach(chore => {
      if (chore.status !== 'done' || !chore.lastCompleted) return;
      const last = new Date(chore.lastCompleted);
      let shouldReset = false;
      
      if (chore.frequency === 'daily') {
        shouldReset = now.toDateString() !== last.toDateString();
      } else if (chore.frequency === 'every_2_days') {
        shouldReset = (now - last) / (1000*60*60*24) >= 2;
      } else if (chore.frequency === 'every_3_days') {
        shouldReset = (now - last) / (1000*60*60*24) >= 3;
      } else if (chore.frequency === 'weekly') {
        const diffDays = (now - last) / (1000*60*60*24);
        shouldReset = diffDays >= 7;
      } else if (chore.frequency === 'biweekly') {
        const diffDays = (now - last) / (1000*60*60*24);
        shouldReset = diffDays >= 14;
      } else if (chore.frequency === 'monthly') {
        shouldReset = (now.getMonth() !== last.getMonth()) || (now.getFullYear() !== last.getFullYear());
      } else if (chore.frequency === 'once') {
        shouldReset = false;
      }
      
      if (shouldReset) {
        chore.status = 'todo';
        changed = true;
      }
    });
    if (changed) this._saveData();
  }

  render() {
    if (!this._hass) return;
    if (!this.activeTab) this.activeTab = 'board';
    this._checkRecurringReset();
    const L = this._lang === 'pl';
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
  overflow: visible;
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

        * {
          box-sizing: border-box;
        }

        :host {
          --primary-color: var(--bento-card);
          --text-color: var(--bento-text);
          --secondary-text: var(--bento-text-secondary);
          --border-color: var(--bento-border);
          --ha-card-border-radius: 12px;
        }

        .card {
          background: var(--primary-color);
          color: var(--text-color);
          border-radius: var(--ha-card-border-radius);
          padding: 16px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 2px solid var(--border-color);
        }

        .title {
          font-size: 20px;
          font-weight: 600;
          margin: 0;
        }

        .tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
          border-bottom: 1px solid var(--border-color);
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }

        .tab-btn {
          padding: 8px 16px;
          background: none;
          border: none;
          color: var(--secondary-text);
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          border-bottom: 3px solid transparent;
          transition: all 0.3s ease;
        }

        .tab-btn.active {
          color: var(--text-color);
          border-bottom-color: var(--primary-color-rgb, #3498db);
        }

        .tab-btn:hover {
          color: var(--text-color);
        }

        .tab-content {
          display: none;
        }

        .tab-content.active {
          display: block;
        }

        /* Board View */
        .board {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 16px;
        }

        .column {
          background: var(--ha-card-background, #f5f5f5);
          border-radius: 8px;
          padding: 12px;
          min-height: 80px;
        }

        .column-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
          font-weight: 600;
          font-size: 14px;
          color: var(--text-color);
        }

        .column-count {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          background: var(--border-color);
          border-radius: 50%;
          font-size: 12px;
          font-weight: bold;
        }

        .chore-card {
          background: white;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          padding: 12px;
          margin-bottom: 10px;
          cursor: grab;
          transition: all 0.2s ease;
          border-left: 4px solid var(--border-color);
        }

        .chore-card:hover {
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .chore-card.priority-high {
          border-left-color: #ff5252;
        }

        .chore-card.priority-medium {
          border-left-color: #ffa726;
        }

        .chore-card.priority-low {
          border-left-color: #66bb6a;
        }

        .chore-title {
          font-weight: 600;
          margin: 0 0 6px 0;
          font-size: 14px;
        }

        .chore-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 12px;
          color: var(--secondary-text);
          margin-top: 8px;
        }

        .chore-assignee {
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 12px;
          color: white;
          font-weight: 500;
        }

        .chore-actions {
          display: flex;
          gap: 4px;
          margin-top: 8px;
        }

        .btn-small {
          padding: 4px 8px;
          font-size: 11px;
          border: 1px solid var(--border-color);
          background: none;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .btn-small:hover {
          background: var(--border-color);
        }

        /* Add Form */
        .add-form {
          background: var(--ha-card-background, #f9f9f9);
          padding: 16px;
          border-radius: 8px;
          margin-bottom: 16px;
        }

        .form-group {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 12px;
        }

        @media (max-width: 360px) {
          .form-group { grid-template-columns: 1fr; }
        }

        .form-group.full {
          grid-column: 1 / -1;
        }

        label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          margin-bottom: 4px;
          color: var(--text-color);
        }

        input[type="text"],
        input[type="number"],
        select {
          width: 100%;
          box-sizing: border-box;
          padding: 8px;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          font-size: 13px;
          background: white;
          color: var(--text-color);
        }

        input[type="text"]:focus,
        input[type="number"]:focus,
        select:focus {
          outline: none;
          border-color: #3498db;
          box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.1);
        }

        .btn-primary {
          grid-column: 1 / -1;
          padding: 10px 16px;
          background: #3498db;
          color: white;
          border: none;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .btn-primary:hover {
          background: #2980b9;
        }

        /* Schedule View */
        .schedule {
          overflow-x: auto;
        }

        .week-grid {
          display: grid;
          grid-template-columns: 120px repeat(7, 1fr);
          gap: 1px;
          background: var(--border-color);
          border-radius: 8px;
          overflow: hidden;
        }

        .week-cell {
          background: white;
          padding: 12px;
          min-height: 100px;
          font-size: 12px;
        }

        .week-header {
          background: var(--ha-card-background, #f5f5f5);
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .chore-item {
          background: #e3f2fd;
          padding: 4px 6px;
          border-radius: 3px;
          margin-bottom: 4px;
          font-size: 11px;
          color: #1976d2;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* Stats View */
        .stats-container {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          margin-bottom: 20px;
        }

        .stat-card {
          background: var(--ha-card-background, #f5f5f5);
          padding: 16px;
          border-radius: 8px;
          text-align: center;
        }

        .stat-value {
          font-size: 28px;
          font-weight: bold;
          color: #3498db;
          margin: 8px 0;
        }

        .stat-label {
          font-size: 12px;
          color: var(--secondary-text);
          font-weight: 500;
        }

        .leaderboard {
          background: white;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          overflow: hidden;
        }

        .leaderboard-row {
          display: grid;
          grid-template-columns: 40px 1fr auto auto;
          align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid var(--border-color);
          font-size: 13px;
        }

        .leaderboard-row:last-child {
          border-bottom: none;
        }

        .rank {
          font-weight: bold;
          font-size: 16px;
        }

        .name {
          font-weight: 500;
        }

        .streak {
          color: #ff9800;
          font-weight: 600;
        }

        .completion {
          color: #66bb6a;
          font-weight: 600;
        }

        .empty-state {
          text-align: center;
          padding: 40px 20px;
          color: var(--secondary-text);
        }

        .emoji {
          margin-right: 4px;
        }
      
/* === Modern Bento Light Mode === */

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

/* === DARK MODE === */

        /* === MOBILE FIX === */
        @media (max-width: 768px) {
          .tabs { flex-wrap: nowrap; overflow-x: auto; -webkit-overflow-scrolling: touch; gap: 2px; }
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
        <div class="card-header">
          <h2 class="title">🏠 ${this.config.title || 'Chore Tracker'}</h2>
        </div>

        <div class="tabs">
          <button class="tab-btn ${this.activeTab === 'board' ? 'active' : ''}" data-tab="board">📋 Board</button>
          <button class="tab-btn ${this.activeTab === 'schedule' ? 'active' : ''}" data-tab="schedule">📅 Schedule</button>
          <button class="tab-btn ${this.activeTab === 'stats' ? 'active' : ''}" data-tab="stats">🏆 Stats</button>
          <button class="tab-btn ${this.activeTab === 'settings' ? 'active' : ''}" data-tab="settings">⚙️ Ustawienia</button>
        </div>

        <!-- Board Tab -->
        <div class="tab-content${this.activeTab === 'board' ? ' active' : ''}" id="board-tab" style="display:${this.activeTab === 'board' ? 'block' : 'none'}">
          <div class="add-form">
            <div class="form-group full">
              <label>Chore Name</label>
              <input type="text" id="chore-name" placeholder="Enter chore name">
            </div>

            <div class="form-group">
              <div>
                <label>Assignee</label>
                <select id="chore-assignee">
                  ${this.members.map(m => `<option value="${_esc(m.name)}">${_esc(m.name)}</option>`).join('')}
                </select>
              </div>
              <div>
                <label>Room/Area</label>
                <select id="chore-room">
                  <option value="Kitchen">🍳 Kitchen</option>
                  <option value="Bathroom">🚿 Bathroom</option>
                  <option value="Bedroom">🛏️ Bedroom</option>
                  <option value="Living">🛋️ Living Room</option>
                  <option value="Yard">🌳 Yard</option>
                  <option value="General">📌 General</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <div>
                <label>Frequency</label>
                <select id="chore-frequency">
                  <option value="daily">Codziennie</option>
            <option value="every_2_days">Co 2 dni</option>
            <option value="every_3_days">Co 3 dni</option>
            <option value="weekly">Co tydzień</option>
            <option value="biweekly">Co 2 tygodnie</option>
            <option value="monthly">Co miesiąc</option>
            <option value="once">Jednorazowe</option>
                </select>
              </div>
              <div>
                <label>Priority</label>
                <select id="chore-priority">
                  <option value="low">Low 🟢</option>
                  <option value="medium">Medium 🟡</option>
                  <option value="high">High 🔴</option>
                </select>
              </div>
            </div>

            <button class="btn-primary" id="add-btn">➕ Add Chore</button>
          </div>

          <div class="board" id="board">
            <div class="column" data-status="todo">
              <div class="column-header">
                <span>\uD83D\uDCDD To Do</span>
                <div class="column-count">0</div>
              </div>
            </div>
            <div class="column" data-status="in-progress">
              <div class="column-header">
                <span>\u23F3 In Progress</span>
                <div class="column-count">0</div>
              </div>
            </div>
            <div class="column" data-status="done">
              <div class="column-header">
                <span>\u2705 Done</span>
                <div class="column-count">0</div>
              </div>
            </div>
          </div>
          <div id="empty-board" class="empty-state" style="display:none;">
            <div class="empty-icon">\uD83D\uDCCB</div>
            <h3 style="margin:8px 0 4px;font-size:16px;color:var(--bento-text,#333);">${L ? 'Brak zada\u0144' : 'No chores yet'}</h3>
            <p style="margin:0 0 16px;max-width:280px;">${L ? 'Dodaj pierwsze zadanie u\u017Cywaj\u0105c formularza powy\u017Cej.' : 'Add your first chore using the form above.'}</p>
          </div>
        </div>

        <!-- Schedule Tab -->
        <div class="tab-content${this.activeTab === 'schedule' ? ' active' : ''}" id="schedule-tab" style="display:${this.activeTab === 'schedule' ? 'block' : 'none'}">
          <div class="schedule" id="schedule"></div>
          <div id="empty-schedule" class="empty-state" style="display:none;">
            <div class="empty-icon">📅</div>
            <h3 style="margin:8px 0 4px;font-size:16px;color:var(--bento-text,#333);">No Schedule Yet</h3>
            <p style="margin:0 0 16px;max-width:280px;">Add chores with assigned days to see your weekly schedule here.</p>
          </div>
        </div>

        <!-- Stats Tab -->
        <div class="tab-content${this.activeTab === 'stats' ? ' active' : ''}" id="stats-tab" style="display:${this.activeTab === 'stats' ? 'block' : 'none'}">
          <div class="stats-container" id="stats-container"></div>
          <div class="leaderboard" id="leaderboard"></div>
          <div id="empty-stats" class="empty-state" style="display:none;">
            <div class="empty-icon">📊</div>
            <h3 style="margin:8px 0 4px;font-size:16px;color:var(--bento-text,#333);">No Stats Yet</h3>
            <p style="margin:0 0 16px;max-width:280px;">Complete some chores and check back — your productivity stats will appear here.</p>
          </div>
        </div>

        <!-- Settings Tab -->
        <div class="tab-content${this.activeTab === 'settings' ? ' active' : ''}" id="settings-tab" style="display:${this.activeTab === 'settings' ? 'block' : 'none'}">
          <div style="padding:20px;">
            <h3 style="margin:0 0 16px;font-size:16px;color:var(--bento-text,#333);">⚙️ ${this._lang === 'pl' ? 'Ustawienia' : 'Settings'}</h3>
            <div class="empty-state">
              <div class="empty-icon">🔧</div>
              <p style="margin:8px 0;color:var(--bento-text-secondary,#64748b);">${this._lang === 'pl' ? 'Ustawienia będą dostępne wkrótce' : 'Settings coming soon'}</p>
            </div>
          </div>
        </div>
      </div>
    `;

    if (this._lastHtml === html) return;
    this._lastHtml = html;
    this.shadowRoot.innerHTML = html;

    this.setupEventListeners();
    this.updateBoard();
  }

  setupEventListeners() {
    // Tab switching
    this.shadowRoot.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
    });

    // Add chore (only exists on board tab)
    this.shadowRoot.getElementById('add-btn')?.addEventListener('click', () => this.addChore());

    // Board column clicks
    this.shadowRoot.querySelectorAll('.column').forEach(col => {
      col.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-small')) {
          const action = e.target.dataset.action;
          const choreId = e.target.closest('.chore-card').dataset.id;
          if (action === 'next') this.moveChore(choreId, 'next');
          if (action === 'prev') this.moveChore(choreId, 'prev');
          if (action === 'delete') this.deleteChore(choreId);
        }
      });
    });
  }

  switchTab(tabName) {
    if (!tabName) return;
    this.activeTab = tabName;
    // Toggle tab buttons
    this.shadowRoot.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    // Toggle tab content visibility
    ['board', 'schedule', 'stats', 'settings'].forEach(t => {
      const el = this.shadowRoot.getElementById(t + '-tab');
      if (el) {
        el.style.display = t === tabName ? 'block' : 'none';
        el.classList.toggle('active', t === tabName);
      }
    });
    // Refresh data for visible tab
    if (tabName === 'board') this.updateBoard();
    if (tabName === 'schedule') this.updateSchedule();
    if (tabName === 'stats') this.updateStats();
  }

  addChore() {
    const name = this.shadowRoot.getElementById('chore-name').value.trim();
    const assignee = this.shadowRoot.getElementById('chore-assignee').value;
    const room = this.shadowRoot.getElementById('chore-room').value;
    const frequency = this.shadowRoot.getElementById('chore-frequency').value;
    const priority = this.shadowRoot.getElementById('chore-priority').value;

    if (!name) return;

    const chore = {
      id: Date.now(),
      name,
      assignee,
      room,
      frequency,
      priority,
      status: 'todo',
      completedCount: 0,
      lastCompleted: null,
      streak: 0
    };

    this.chores.push(chore);
    this._saveData();
    this.shadowRoot.getElementById('chore-name').value = '';
    this.updateBoard();
  }

  moveChore(choreId, direction) {
    const chore = this.chores.find(c => c.id == choreId);
    if (!chore) return;

    const statuses = ['todo', 'in-progress', 'done'];
    const currentIndex = statuses.indexOf(chore.status);

    if (direction === 'next' && currentIndex < statuses.length - 1) {
      chore.status = statuses[currentIndex + 1];
      if (chore.status === 'done') {
        chore.completedCount++;
        chore.lastCompleted = new Date();
        chore.streak++;
      }
    } else if (direction === 'prev' && currentIndex > 0) {
      chore.status = statuses[currentIndex - 1];
    }

    this._saveData();
    this.updateBoard();
  }

  deleteChore(choreId) {
    this.chores = this.chores.filter(c => c.id != choreId);
    this._saveData();
    this.updateBoard();
  }

  updateBoard() {
    const statuses = ['todo', 'in-progress', 'done'];

    statuses.forEach(status => {
      const column = this.shadowRoot.querySelector(`[data-status="${status}"]`);
      const choreCards = this.chores.filter(c => c.status === status);

      const cardsHtml = choreCards.map(chore => `
        <div class="chore-card priority-${chore.priority}" data-id="${chore.id}">
          <h3 class="chore-title">${_esc(chore.name)}</h3>
          <div class="chore-meta">
            <span class="chore-assignee" style="background-color: ${this.getMemberColor(chore.assignee)}">${_esc(chore.assignee)}</span>
            <span>${this.getRoomEmoji(chore.room)}</span>
          </div>
          <div style="font-size: 11px; color: var(--secondary-text); margin-top: 6px;">
            ${this.getFrequencyLabel(chore.frequency)} • ${chore.priority.charAt(0).toUpperCase() + chore.priority.slice(1)}
          </div>
          <div class="chore-actions">
            ${status !== 'done' ? `<button class="btn-small" data-action="next">Next →</button>` : ''}
            ${status !== 'todo' ? `<button class="btn-small" data-action="prev">← Back</button>` : ''}
            <button class="btn-small" data-action="delete" aria-label="${this._t.delete}">🗑️</button>
          </div>
        </div>
      `).join('');

      const countEl = column.querySelector('.column-count');
      countEl.textContent = choreCards.length;

      const existingCards = column.querySelectorAll('.chore-card');
      existingCards.forEach(card => card.remove());

      column.insertAdjacentHTML('beforeend', cardsHtml);
    });
    // Toggle empty state
    const emptyBoard = this.shadowRoot.getElementById('empty-board');
    const boardEl = this.shadowRoot.getElementById('board');
    if (emptyBoard) emptyBoard.style.display = this.chores.length === 0 ? 'block' : 'none';
    if (boardEl) boardEl.style.display = this.chores.length === 0 ? 'none' : 'grid';
  }

  updateSchedule() {
    const scheduleEl = this.shadowRoot.getElementById('schedule');
    const emptyEl = this.shadowRoot.getElementById('empty-schedule');

    if (this.chores.length === 0) {
      scheduleEl.style.display = 'none';
      emptyEl.style.display = 'block';
      return;
    }

    scheduleEl.style.display = 'block';
    emptyEl.style.display = 'none';

    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    let html = '<div class="week-grid">';

    html += '<div class="week-cell week-header">Chore</div>';
    days.forEach(day => {
      html += `<div class="week-cell week-header">${day}</div>`;
    });

    this.chores.forEach(chore => {
      html += `<div class="week-cell"><strong>${_esc(chore.name)}</strong></div>`;
      days.forEach((_, index) => {
        const show = this.isChoreOnDay(chore, index);
        html += `<div class="week-cell">${show ? `<div class="chore-item">${chore.room}</div>` : ''}</div>`;
      });
    });

    html += '</div>';
    scheduleEl.innerHTML = html;
  }

  isChoreOnDay(chore, dayIndex) {
    if (chore.frequency === 'daily') return true;
    if (chore.frequency === 'weekly') return dayIndex === 0;
    if (chore.frequency === 'biweekly') return dayIndex === 0;
    if (chore.frequency === 'monthly') return dayIndex === 0;
    return false;
  }

  updateStats() {
    const statsEl = this.shadowRoot.getElementById('stats-container');
    const leaderboardEl = this.shadowRoot.getElementById('leaderboard');
    const emptyEl = this.shadowRoot.getElementById('empty-stats');

    const completedChores = this.chores.filter(c => c.completedCount > 0).length;
    const totalChores = this.chores.length;
    const overallCompletion = totalChores > 0 ? Math.round((completedChores / totalChores) * 100) : 0;

    const memberStats = {};
    this.members.forEach(m => {
      const memberChores = this.chores.filter(c => c.assignee === m.name);
      const completedByMember = memberChores.reduce((sum, c) => sum + c.completedCount, 0);
      const totalByMember = memberChores.length;
      const maxStreak = memberChores.length > 0 ? Math.max(...memberChores.map(c => c.streak)) : 0;

      memberStats[m.name] = {
        completed: completedByMember,
        total: totalByMember,
        streak: maxStreak
      };
    });

    const sortedMembers = Object.entries(memberStats).sort((a, b) => b[1].completed - a[1].completed);

    statsEl.innerHTML = `
      <div class="stat-card">
        <div class="stat-label">📋 Total Chores</div>
        <div class="stat-value">${totalChores}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">✅ Completed</div>
        <div class="stat-value">${completedChores}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">📊 Completion Rate</div>
        <div class="stat-value">${overallCompletion}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">👥 Active Members</div>
        <div class="stat-value">${this.members.length}</div>
      </div>
    `;

    if (sortedMembers.length === 0) {
      leaderboardEl.style.display = 'none';
      emptyEl.style.display = 'block';
      return;
    }

    leaderboardEl.style.display = 'block';
    emptyEl.style.display = 'none';

    leaderboardEl.innerHTML = sortedMembers.map((entry, index) => `
      <div class="leaderboard-row">
        <div class="rank">#${index + 1}</div>
        <div class="name">${_esc(entry[0])}</div>
        <div class="completion">${entry[1].completed} done</div>
        <div class="streak">🔥 ${entry[1].streak}</div>
      </div>
    `).join('');
  }

  getMemberColor(memberName) {
    const member = this.members.find(m => m.name === memberName);
    return member ? member.color : '#999999';
  }

  getRoomEmoji(room) {
    const emojis = {
      'Kitchen': '🍳',
      'Bathroom': '🚿',
      'Bedroom': '🛏️',
      'Living': '🛋️',
      'Yard': '🌳',
      'General': '📌'
    };
    return emojis[room] || '📌';
  }

  getFrequencyLabel(freq) {
    const labels = {
      'daily': 'Daily',
      'weekly': 'Weekly',
      'biweekly': 'Bi-weekly',
      'monthly': 'Monthly'
    };
    return labels[freq] || freq;
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

  disconnectedCallback() {
    // Clear render scheduling flag to prevent orphaned setTimeout calls
    this._renderScheduled = false;
  }

}

if (!customElements.get('ha-chore-tracker')) customElements.define('ha-chore-tracker', HaChoreTracker);

class HaChoreTrackerEditor extends HTMLElement {
  constructor() {
    super();
    this