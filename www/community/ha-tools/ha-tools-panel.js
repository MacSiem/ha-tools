/**
 * HA Tools Panel v2.2 — Auto-loading addons with progress notification
 * Author: MacSiem
 * Features: Auto-loads addon scripts, polls for customElements registration,
 *           shows loading progress bar, dynamically updates sidebar
 */

// ── Build version & auto-update detection ──
// Zmień BUILD_VERSION przy każdej aktualizacji kodu.
// Panel automatycznie wykryje nową wersję i pokaże toast z przyciskiem "Odśwież".
const HA_TOOLS_BUILD = '3.6.0';
const HA_TOOLS_BUILD_TS = '20260330-1200';

(function _checkVersion() {
  const KEY = 'ha-tools-build';
  // Just store current version, no toast (HA caching makes version detection unreliable)
  localStorage.setItem(KEY, HA_TOOLS_BUILD);
})();

class HAToolsPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass = null;
    this._rendered = false;
    this._activeView = 'home';
    this._activeToolId = null;
    this._collapsedGroups = new Set();
    this._cardInstance = null;
    this._settings = this._loadSettings();
    this._loadedCount = 0;
    this._loading = true;
    this._pollTimer = null;
    this._scriptLoadPromises = [];
  }

  disconnectedCallback() {
    if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
    if (this._autoRefreshTimer) { clearInterval(this._autoRefreshTimer); this._autoRefreshTimer = null; }
  }

  connectedCallback() {
    // When loaded via dynamic loader, HA may set properties (hass, panel, etc.)
    // as plain object props BEFORE the custom element class is defined.
    // After upgrade, the setters never fired — re-apply them now.
    for (const prop of ['hass', 'panel', 'narrow', 'route']) {
      if (this.hasOwnProperty(prop)) {
        const val = this[prop];
        delete this[prop];
        this[prop] = val;
      }
    }
  }

  // Map tool tags to their script paths (all in /local/community/ha-tools/)
  static get TOOL_SCRIPTS() {
    return {
      'ha-trace-viewer': '/local/community/ha-tools/ha-trace-viewer.js',
      'ha-device-health': '/local/community/ha-tools/ha-device-health.js',
      'ha-automation-analyzer': '/local/community/ha-tools/ha-automation-analyzer.js',
      'ha-backup-manager': '/local/community/ha-tools/ha-backup-manager.js',
      'ha-network-map': '/local/community/ha-tools/ha-network-map.js',
      'ha-smart-reports': '/local/community/ha-tools/ha-smart-reports.js',
      'ha-energy-optimizer': '/local/community/ha-tools/ha-energy-optimizer.js',
      'ha-sentence-manager': '/local/community/ha-tools/ha-sentence-manager.js',
      'ha-chore-tracker': '/local/community/ha-tools/ha-chore-tracker.js',
      'ha-baby-tracker': '/local/community/ha-tools/ha-baby-tracker.js',
      'ha-cry-analyzer': '/local/community/ha-tools/ha-cry-analyzer.js',
      'ha-data-exporter': '/local/community/ha-tools/ha-data-exporter.js',
      'ha-storage-monitor': '/local/community/ha-tools/ha-storage-monitor.js',
      'ha-security-check': '/local/community/ha-tools/ha-security-check.js',
      'ha-energy-email': '/local/community/ha-tools/ha-energy-email.js',
      'ha-vacuum-water-monitor': '/local/community/ha-tools/ha-vacuum-water-monitor.js',
      'ha-log-email': '/local/community/ha-tools/ha-log-email.js',
      'ha-yaml-checker': '/local/community/ha-tools/ha-yaml-checker.js',
      'ha-energy-insights': '/local/community/ha-tools/ha-energy-insights.js',
      'ha-purge-cache': '/local/community/ha-tools/ha-purge-cache.js',
    };
  }

  _loadAddonScripts() {
    // Always use Date.now() cache buster to avoid stale JS from HACS/browser cache
    const cb = Date.now();
    const scripts = HAToolsPanel.TOOL_SCRIPTS;
    for (const [tag, src] of Object.entries(scripts)) {
      if (customElements.get(tag)) continue; // already registered by HACS or previous load
      // Force-load with cache buster — do NOT check for existing script tags
      // because HACS may have loaded an older cached version that failed to register
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = src + '?_=' + cb;
      script.async = true;
      script.onerror = () => console.warn(`[HA Tools] Failed to load: ${src}`);
      document.head.appendChild(script);
    }
  }

  _startPolling() {
    let attempts = 0;
    const maxAttempts = 120; // 60 seconds max
    const poll = () => {
      const { available } = this._getToolStatus();
      const newCount = available.length;
      if (newCount !== this._loadedCount) {
        this._loadedCount = newCount;
        this._updateLoadingStatus();
        this._updateSidebar();
        if (this._activeView === 'home') this._showHome();
      }
      attempts++;
      if (newCount >= HAToolsPanel.TOOLS.length || attempts >= maxAttempts) {
        this._loading = false;
        this._updateLoadingStatus();
        this._updateSidebar();
        if (this._activeView === 'home') this._showHome();
        if (this._pollTimer) clearInterval(this._pollTimer);
        this._pollTimer = null;
        // Loading complete
        this._showUpdateToastIfNeeded();
        return;
      }
    };
    this._pollTimer = setInterval(poll, 500);
    // Run once immediately
    poll();
  }

  _showUpdateToastIfNeeded() {
    // Disabled: HA caching makes version detection unreliable, toast was showing false downgrades
  }

  _updateLoadingStatus() {
    const bar = this.shadowRoot?.querySelector('.loading-bar');
    if (!bar) return;
    const total = HAToolsPanel.TOOLS.length;
    if (this._loading) {
      bar.style.display = 'flex';
      bar.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.2);border-radius:10px;width:100%;">
          <div class="spinner" style="width:18px;height:18px;border-width:2px;flex-shrink:0;"></div>
          <span style="font-size:13px;font-weight:500;color:var(--bento-text);">\u0141adowanie... ${this._loadedCount}/${total}</span>
          <div class="loading-progress" style="flex:1;">
            <div class="loading-progress-fill" style="width:${(this._loadedCount / total) * 100}%"></div>
          </div>
        </div>
      `;
    } else {
      if (this._loadedCount >= total) {
        bar.innerHTML = `
          <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:10px;width:100%;">
            <span style="font-size:16px;">\u2705</span>
            <span style="flex:1;font-size:13px;font-weight:500;color:var(--bento-text);">${this._loadedCount}/${total} narz\u0119dzi gotowych</span>
            <button onclick="this.closest('.loading-bar').style.display='none'" style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--bento-text-secondary);padding:0 4px;">\u2715</button>
          </div>`;
        setTimeout(() => { bar.style.display = 'none'; }, 4000);
      } else {
        bar.innerHTML = `
          <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:10px;width:100%;">
            <span style="font-size:16px;">\u26A0\uFE0F</span>
            <span style="flex:1;font-size:13px;font-weight:500;color:var(--bento-text);">${this._loadedCount}/${total} narz\u0119dzi za\u0142adowanych</span>
            <button onclick="this.closest('.loading-bar').style.display='none'" style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--bento-text-secondary);padding:0 4px;">\u2715</button>
          </div>`;
        setTimeout(() => { bar.style.display = 'none'; }, 8000);
      }
    }
  }

  _updateSidebar() {
    const { available, unavailable } = this._getToolStatus();
    // Update badge
    const badge = this.shadowRoot?.querySelector('.nav-badge');
    if (badge) badge.textContent = `${available.length}/${HAToolsPanel.TOOLS.length}`;
    // Update tools count in section header
    const toolsSection = this.shadowRoot?.querySelector('.nav-section-tools');
    if (toolsSection) toolsSection.textContent = `Narzędzia (${available.length})`;
    // Update unavailable section header
    const unavailSection = this.shadowRoot?.querySelector('.nav-section-unavailable');
    if (unavailSection) {
      if (unavailable.length > 0) {
        unavailSection.textContent = `Niedostępne (${unavailable.length})`;
        unavailSection.style.display = '';
      } else {
        unavailSection.style.display = 'none';
      }
    }
    // Rebuild tool nav items
    const toolsContainer = this.shadowRoot?.querySelector('.nav-tools-list');
    const unavailContainer = this.shadowRoot?.querySelector('.nav-unavail-list');
    if (toolsContainer) {
      // Build grouped sidebar with collapse/expand
      const parents = available.filter(t => !t.group);
      const children = available.filter(t => t.group);
      let html = '';
      for (const t of parents) {
        const isActive = this._activeToolId === t.id;
        const myChildren = children.filter(c => c.group === t.id);
        const childActive = myChildren.some(c => this._activeToolId === c.id);
        const isCollapsed = this._collapsedGroups.has(t.id) && !childActive;
        const countBadge = myChildren.length ? `<span class="nav-group-count">${myChildren.length}</span>` : '';
        const chevron = myChildren.length ? `<span class="nav-expand${isCollapsed ? ' collapsed' : ''}">&#9662;</span>` : '';
        html += `<div class="nav-item${isActive || childActive ? ' active' : ''}${myChildren.length ? ' has-children' : ''}" data-tool="${t.id}" data-tag="${t.tag || ''}">
          <span class="nav-icon">${t.icon}</span>
          <span>${t.name}</span>
          ${countBadge}
          ${chevron}
        </div>`;
        if (myChildren.length) {
          html += `<div class="nav-group-children${isCollapsed ? ' collapsed' : ''}" data-group="${t.id}">`;
          for (const c of myChildren) {
            html += `<div class="nav-item child${this._activeToolId === c.id ? ' active' : ''}" data-tool="${c.id}" data-tag="${c.tag}">
              <span class="nav-icon">${c.icon}</span>
              <span>${c.name}</span>
            </div>`;
          }
          html += '</div>';
        }
      }
      toolsContainer.innerHTML = html;
      // Toggle collapse on parent click (expand chevron area)
      toolsContainer.querySelectorAll('.nav-item.has-children').forEach(item => {
        item.addEventListener('click', (e) => {
          const toolId = item.dataset.tool;
          // Only toggle children visibility, never navigate
          e.stopPropagation();
          const groupEl = toolsContainer.querySelector(`.nav-group-children[data-group="${toolId}"]`);
          if (groupEl) {
            const wasCollapsed = this._collapsedGroups.has(toolId);
            if (wasCollapsed) {
              this._collapsedGroups.delete(toolId);
              groupEl.classList.remove('collapsed');
              item.querySelector('.nav-expand')?.classList.remove('collapsed');
            } else {
              this._collapsedGroups.add(toolId);
              groupEl.classList.add('collapsed');
              item.querySelector('.nav-expand')?.classList.add('collapsed');
            }
          }
        });
      });
      // Click handler for child items
      toolsContainer.querySelectorAll('.nav-item.child').forEach(item => {
        item.addEventListener('click', () => {
          this._setActiveNav(item);
          this._loadTool(item.dataset.tool, item.dataset.tag);
        });
      });
      // Click handler for non-group items
      toolsContainer.querySelectorAll('.nav-item:not(.has-children):not(.child)').forEach(item => {
        item.addEventListener('click', () => {
          this._setActiveNav(item);
          this._loadTool(item.dataset.tool, item.dataset.tag);
        });
      });
    }
    if (unavailContainer) {
      if (unavailable.length > 0) {
        unavailContainer.innerHTML = unavailable.map(t => `
          <div class="nav-item unavailable" title="Nie zainstalowane">
            <span class="nav-icon">${t.icon}</span>
            <span>${t.name}</span>
          </div>
        `).join('');
        unavailContainer.style.display = '';
      } else {
        unavailContainer.innerHTML = '';
        unavailContainer.style.display = 'none';
      }
    }
  }

  static get TOOLS() {
    return [
      { id: 'advanced-tools', name: 'Advanced Tools', icon: '\u{1F527}', tag: null, desc: 'Zaawansowane narz\u0119dzia', category: 'debug' },
      { id: 'trace-viewer', group: 'advanced-tools', name: 'Trace Viewer', icon: '\u{1F9EC}', tag: 'ha-trace-viewer', desc: 'Przeglądaj i analizuj ślady automatyzacji', repo: 'MacSiem/ha-trace-viewer', category: 'debug' },
      { id: 'device-health', name: 'Device Health', icon: '\u{1F3E5}', tag: 'ha-device-health', desc: 'Monitoruj stan urządzeń, baterii i sieci', repo: 'MacSiem/ha-device-health', category: 'monitor' },
      { id: 'automation-analyzer', group: 'advanced-tools', name: 'Automation Analyzer', icon: '\u{1F4CA}', tag: 'ha-automation-analyzer', desc: 'Analizuj wydajność i problemy automatyzacji', repo: 'MacSiem/ha-automation-analyzer', category: 'debug' },
      { id: 'backup-manager', group: 'device-health', name: 'Backup Manager', icon: '\u{1F4BE}', tag: 'ha-backup-manager', desc: 'Zarządzaj kopiami zapasowymi', repo: 'MacSiem/ha-backup-manager', category: 'system' },
      { id: 'network-map', group: 'device-health', name: 'Network Map', icon: '\u{1F310}', tag: 'ha-network-map', desc: 'Wizualizuj mapę sieci urządzeń', repo: 'MacSiem/ha-network-map', category: 'monitor' },
      { id: 'smart-reports', name: 'Smart Reports & Energy', icon: '\u{1F4C8}', tag: 'ha-smart-reports', desc: 'Raporty i analiza energii', repo: 'MacSiem/ha-smart-reports', category: 'reports' },
      { id: 'energy-optimizer', group: 'smart-reports', name: 'Energy Optimizer', icon: '\u26A1', tag: 'ha-energy-optimizer', desc: 'Optymalizuj zużycie energii', repo: 'MacSiem/ha-energy-optimizer', category: 'monitor' },
      { id: 'sentence-manager', group: 'advanced-tools', name: 'Sentence Manager', icon: '\u{1F5E3}\uFE0F', tag: 'ha-sentence-manager', desc: 'Zarządzaj zdaniami głosowymi', repo: 'MacSiem/ha-sentence-manager', category: 'system' },
      { id: 'home-family', name: 'Home & Family', icon: '\u{1F3E1}', tag: null, desc: 'Dom i rodzina', category: 'life' },
      { id: 'chore-tracker', group: 'home-family', name: 'Chore Tracker', icon: '\u{1F3E0}', tag: 'ha-chore-tracker', desc: 'Śledzenie obowiązków domowych', repo: 'MacSiem/ha-chore-tracker', category: 'life' },
      { id: 'baby-tracker', group: 'home-family', name: 'Baby Tracker', icon: '\u{1F37C}', tag: 'ha-baby-tracker', desc: 'Śledzenie aktywności dziecka', repo: 'MacSiem/ha-baby-tracker', category: 'life' },
      { id: 'cry-analyzer', group: 'home-family', name: 'Cry Analyzer', icon: '\u{1F476}', tag: 'ha-cry-analyzer', desc: 'Analiza płaczu dziecka AI', repo: 'MacSiem/ha-cry-analyzer', category: 'life' },
      { id: 'data-exporter', group: 'advanced-tools', name: 'Data Exporter', icon: '\u{1F4E4}', tag: 'ha-data-exporter', desc: 'Eksportuj dane z Home Assistant', repo: 'MacSiem/ha-data-exporter', category: 'system' },
      { id: 'storage-monitor', group: 'device-health', name: 'Storage Monitor', icon: '\u{1F4BD}', tag: 'ha-storage-monitor', desc: 'Wizualizacja użycia dysku w stylu WinDirStat', repo: 'MacSiem/ha-storage-monitor', category: 'system' },
      { id: 'security-check', group: 'device-health', name: 'Security Check', icon: '\u{1F6E1}\uFE0F', tag: 'ha-security-check', desc: 'Audyt bezpieczeństwa Home Assistant', repo: 'MacSiem/ha-security-check', category: 'system' },
      { id: 'log-email', group: 'advanced-tools', name: 'Log Email', icon: '\uD83D\uDEA8', tag: 'ha-log-email', desc: 'Email digest b\u0142\u0119d\u00F3w i ostrze\u017Ce\u0144 HA', repo: 'MacSiem/ha-log-email', category: 'reports' },
      { id: 'purge-cache', group: 'advanced-tools', name: 'Purge Cache', icon: '\u{1F9F9}', tag: 'ha-purge-cache', desc: 'Wyczy\u015B\u0107 cache przegl\u0105darki i skrypt\u00F3w', repo: 'MacSiem/ha-tools-panel', category: 'system' },
      { id: 'yaml-checker', group: 'advanced-tools', name: 'YAML Checker', icon: '\uD83D\uDD0D', tag: 'ha-yaml-checker', desc: 'Walidator YAML: config check, encje, szablony', repo: 'MacSiem/ha-yaml-checker', category: 'debug' },
      { id: 'energy-insights', group: 'smart-reports', name: 'Energy Insights', icon: '\u26A1', tag: 'ha-energy-insights', desc: 'Dashboard energii: zu\u017Cycie, koszty, top urz\u0105dzenia, trendy', repo: 'MacSiem/ha-energy-insights', category: 'monitor' },
      { id: 'energy-email', group: 'smart-reports', name: 'Energy Email', icon: '\uD83D\uDCE7', tag: 'ha-energy-email', desc: 'Dzienne/tygodniowe/miesi\u0119czne raporty energii emailem', repo: 'MacSiem/ha-energy-email', category: 'reports' },
      { id: 'vacuum-water-monitor', group: 'home-family', name: 'Vacuum Water Monitor', icon: '\uD83E\uDDF9', tag: 'ha-vacuum-water-monitor', desc: 'Monitor poziomu wody i serwisu dla odkurzaczy (Roborock, Dreame)', repo: 'MacSiem/ha-vacuum-water-monitor', category: 'monitor' },
    ];
  }

  static get CATEGORIES() {
    return {
      monitor: { name: 'Monitoring', icon: '\u{1F4CB}' },
      debug: { name: 'Debugowanie', icon: '\u{1F527}' },
      system: { name: 'System', icon: '\u2699\uFE0F' },
      reports: { name: 'Raporty', icon: '\u{1F4C4}' },
      life: { name: 'Życie', icon: '\u{1F3E1}' },
    };
  }

  static get CSS() {
    return `


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
  --bento-radius: 16px;
  --bento-radius-sm: 10px;
  --bento-radius-xs: 6px;
  --bento-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02);
  --bento-shadow-md: 0 4px 12px rgba(0,0,0,0.06);
  --bento-transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: block;
  color-scheme: light dark;
}

/* Dark mode - detect HA dark theme via background luminance or prefers-color-scheme */
@media (prefers-color-scheme: dark) {
  :host {
    --bento-bg: #1a1a2e;
    --bento-card: #16213e;
    --bento-text: #e2e8f0;
    --bento-text-secondary: #94a3b8;
    --bento-border: #334155;
    --bento-shadow: 0 1px 3px rgba(0,0,0,0.3);
    --bento-shadow-md: 0 4px 12px rgba(0,0,0,0.4);
  }
  .donate-section {
    --donate-bg: linear-gradient(135deg, #2a1525 0%, #1e1530 50%, #251530 100%);
    --donate-border: #4a3555;
    --donate-heading: #f0c0d8;
    --donate-text: #d4a0b8;
    --donate-coffee-bg: #b8a100;
    --donate-coffee-text: #fff;
    --donate-coffee-border: #8a7a00;
    --donate-paypal-bg: #005a96;
    --donate-paypal-text: #e0f0ff;
    --donate-paypal-border: #004a7a;
    background: var(--donate-bg);
    border-color: var(--donate-border);
  }
  .donate-section h3 { color: var(--donate-heading, #f0c0d8); }
  .donate-section p { color: var(--donate-text, #d4a0b8); }
}

/* Dark mode: :host already uses HA CSS vars. @media dark handles browser dark. Removed :host-context override. */

* { box-sizing: border-box; }

@keyframes fadeSlideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes shimmer { to { background-position: -200% 0; } }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }

.panel {
  display: flex;
  height: 100vh;
  background: var(--bento-bg);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: var(--bento-text);
}

/* SIDEBAR */
.sidebar {
  width: 260px;
  background: var(--bento-card);
  border-right: 1px solid var(--bento-border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.sidebar-header {
  padding: 20px;
  font-size: 18px;
  font-weight: 700;
  color: var(--bento-text);
  border-bottom: 1px solid var(--bento-border);
  letter-spacing: -0.01em;
}

.sidebar-header .version {
  font-size: 11px;
  color: var(--bento-text-secondary);
  font-weight: 500;
  margin-left: 8px;
}

.sidebar-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.sidebar-scroll::-webkit-scrollbar { width: 4px; }
.sidebar-scroll::-webkit-scrollbar-track { background: transparent; }
.sidebar-scroll::-webkit-scrollbar-thumb { background: var(--bento-border); border-radius: 2px; }

.sidebar-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--bento-border);
  font-size: 11px;
  color: var(--bento-text-secondary);
}

/* NAV */
.nav-section {
  padding: 8px 12px 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--bento-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  margin: 2px 8px;
  border-radius: var(--bento-radius-sm);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: var(--bento-text-secondary);
  transition: var(--bento-transition);
  font-family: 'Inter', sans-serif;
}

.nav-item:hover {
  background: rgba(59, 130, 246, 0.06);
  color: var(--bento-text);
}

.nav-item.active {
  background: rgba(59, 130, 246, 0.1);
  color: var(--bento-primary);
  font-weight: 600;
}

.nav-item.unavailable {
  opacity: 0.4;
  cursor: not-allowed;
}

.nav-item .nav-icon {
  font-size: 16px;
  width: 20px;
  text-align: center;
}

.nav-item.child {
  padding-left: 32px !important;
  font-size: 12px;
  opacity: 0.85;
}
.nav-item.child .nav-icon { font-size: 12px; }
.nav-item.child:hover { opacity: 1; }
.nav-item.has-children { cursor: pointer; }
.nav-group-children {
  overflow: hidden;
  max-height: 500px;
  transition: max-height 0.25s ease, opacity 0.25s ease;
  opacity: 1;
}
.nav-group-children.collapsed {
  max-height: 0;
  opacity: 0;
  pointer-events: none;
}
.nav-expand {
  margin-left: auto;
  font-size: 16px;
  opacity: 0.7;
  transition: transform 0.25s ease;
  cursor: pointer;
  padding: 2px 4px;
}
.nav-expand.collapsed {
  transform: rotate(-90deg);
}
.nav-group-count {
  margin-left: auto;
  background: var(--bento-border, rgba(0,0,0,0.08));
  color: var(--bento-text-secondary, #888);
  font-size: 11px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 10px;
  min-width: 16px;
  text-align: center;
}
.nav-item .nav-badge {
  margin-left: auto;
  background: var(--bento-border);
  color: var(--bento-text-secondary);
  font-size: 10px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 10px;
}

/* MAIN AREA */
.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bento-bg);
}

.toolbar {
  display: flex;
  align-items: center;
  padding: 16px 24px;
  background: var(--bento-card);
  border-bottom: 1px solid var(--bento-border);
  gap: 12px;
}

.toolbar-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--bento-text);
  letter-spacing: -0.01em;
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.content::-webkit-scrollbar { width: 6px; }
.content::-webkit-scrollbar-track { background: transparent; }
.content::-webkit-scrollbar-thumb { background: var(--bento-border); border-radius: 3px; }

/* BUTTONS */
.btn {
  padding: 9px 16px; border: 1.5px solid var(--bento-border); background: var(--bento-card);
  color: var(--bento-text); border-radius: var(--bento-radius-sm); cursor: pointer;
  font-size: 13px; font-weight: 500; font-family: 'Inter', sans-serif; transition: var(--bento-transition);
}
.btn:hover { background: var(--bento-bg); border-color: var(--bento-primary); color: var(--bento-primary); }
.btn-primary { padding: 9px 16px; background: var(--bento-primary); color: white; border: 1.5px solid var(--bento-primary); border-radius: var(--bento-radius-sm); cursor: pointer; font-size: 13px; font-weight: 600; font-family: 'Inter', sans-serif; transition: var(--bento-transition); box-shadow: 0 2px 8px rgba(59, 130, 246, 0.25); }
.btn-primary:hover { background: var(--bento-primary-hover); transform: translateY(-1px); }
.btn-secondary { padding: 9px 16px; background: var(--bento-card); color: var(--bento-text); border: 1.5px solid var(--bento-border); border-radius: var(--bento-radius-sm); cursor: pointer; font-size: 13px; font-weight: 500; font-family: 'Inter', sans-serif; transition: var(--bento-transition); }
.btn-secondary:hover { border-color: var(--bento-primary); color: var(--bento-primary); }
.btn-sm { padding: 6px 12px; font-size: 12px; border-radius: var(--bento-radius-xs); }
.btn-icon { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border: 1.5px solid var(--bento-border); background: var(--bento-card); border-radius: var(--bento-radius-sm); cursor: pointer; transition: var(--bento-transition); font-size: 16px; padding: 0; }
.btn-icon:hover { border-color: var(--bento-primary); color: var(--bento-primary); background: rgba(59, 130, 246, 0.04); }
.toolbar-actions { display: flex; align-items: center; gap: 10px; margin-left: auto; }
.ar-toggle { display: flex; align-items: center; gap: 6px; cursor: pointer; user-select: none; }
.ar-toggle input { display: none; }
.ar-track { width: 34px; height: 18px; background: var(--bento-border); border-radius: 9px; position: relative; transition: 0.2s; }
.ar-thumb { position: absolute; width: 14px; height: 14px; background: white; border-radius: 50%; top: 2px; left: 2px; transition: 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.15); }
.ar-toggle input:checked ~ .ar-track { background: var(--bento-primary); }
.ar-toggle input:checked ~ .ar-track .ar-thumb { left: 18px; }
.ar-lbl { font-size: 11px; color: var(--bento-text-secondary); font-weight: 500; }
.ar-toggle input:checked ~ .ar-lbl { color: var(--bento-primary); }

/* UNINSTALLED / UNAVAILABLE TOOLS */
.uninstalled-list { display: flex; flex-direction: column; gap: 12px; }
.uninstalled-item {
  display: flex; align-items: center; gap: 12px; padding: 14px 16px;
  background: var(--bento-bg); border: 1.5px dashed var(--bento-border);
  border-radius: var(--bento-radius); transition: var(--bento-transition);
}
.uninstalled-item:hover { border-color: var(--bento-primary); background: rgba(59, 130, 246, 0.03); }
.ui-icon { font-size: 24px; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: var(--bento-card); border-radius: var(--bento-radius-sm); border: 1px solid var(--bento-border); flex-shrink: 0; }
.ui-name { font-size: 14px; font-weight: 600; color: var(--bento-text); min-width: 120px; }
.ui-desc { flex: 1; font-size: 12.5px; color: var(--bento-text-secondary); line-height: 1.4; }
.uninstalled-item.loading-item { opacity: 0.6; border-style: dotted; }
.uninstalled-item.loading-item .ui-desc { font-style: italic; }

/* SETTING SUBSECTIONS & ACTIONS */
.setting-subsection {
  font-size: 11px; font-weight: 700; color: var(--bento-text-secondary);
  text-transform: uppercase; letter-spacing: 0.06em;
  padding: 12px 20px 6px; border-top: 1px solid var(--bento-border);
  margin-top: 4px;
}
.trace-current-info {
  padding: 12px 20px; margin: 0; font-size: 13px; color: var(--bento-text);
  background: rgba(59,130,246,0.06); border-bottom: 1px solid var(--bento-border);
}
.trace-current-info .val { font-weight: 700; color: var(--bento-primary); }
.setting-action-row { padding: 12px 20px; border-top: 1px solid var(--bento-border); }
.btn-apply {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 16px; border: 1.5px solid var(--bento-primary); background: rgba(59,130,246,0.08);
  color: var(--bento-primary); border-radius: var(--bento-radius-sm); cursor: pointer;
  font-size: 13px; font-weight: 600; font-family: 'Inter', sans-serif; transition: var(--bento-transition);
}
.btn-apply:hover { background: var(--bento-primary); color: white; }
.status-msg { padding: 8px 16px; margin: 8px 20px; border-radius: var(--bento-radius-sm); font-size: 12px; display: none; }
.status-msg.visible { display: block; }
.status-msg.success { background: rgba(16,185,129,0.08); color: var(--bento-success); border: 1px solid var(--bento-success); }
.status-msg.error { background: rgba(239,68,68,0.08); color: var(--bento-error); border: 1px solid var(--bento-error); }
.status-msg.info { background: rgba(59,130,246,0.08); color: var(--bento-primary); border: 1px solid var(--bento-primary); }

.empty { text-align: center; padding: 48px 24px; color: var(--bento-text-secondary); font-size: 14px; }
.empty .big { font-size: 48px; margin-bottom: 12px; opacity: 0.5; }

/* HOME VIEW */
.home-view { animation: fadeSlideIn 0.4s ease-out; }
.home-section { margin-bottom: 32px; }
.home-section-title { font-size: 16px; font-weight: 600; color: var(--bento-text); margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
.home-section-title .count { background: var(--bento-border); color: var(--bento-text-secondary); font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; }
/* Home Hero */
.home-hero {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px;
  background: linear-gradient(135deg, var(--bento-primary-light) 0%, rgba(16, 185, 129, 0.06) 100%);
  border: 1.5px solid var(--bento-border);
  border-radius: var(--bento-radius);
  margin-bottom: 24px;
  gap: 20px;
  flex-wrap: wrap;
}
.hero-title { font-size: 22px; font-weight: 700; color: var(--bento-text); }
.hero-subtitle { font-size: 13px; color: var(--bento-text-secondary); margin-top: 4px; }
.hero-stats { display: flex; gap: 24px; }
.hero-stat { text-align: center; }
.hero-stat-num { display: block; font-size: 28px; font-weight: 700; color: var(--bento-primary); }
.hero-stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--bento-text-secondary); font-weight: 600; }
.groups-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.group-card { display: flex; align-items: center; gap: 12px; padding: 16px; background: var(--bento-card); border: 1.5px solid var(--bento-border); border-radius: var(--bento-radius); cursor: pointer; transition: var(--bento-transition); }
.group-card:hover { border-color: var(--bento-primary); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
.group-card-icon { font-size: 28px; }
.group-card-name { font-size: 14px; font-weight: 600; color: var(--bento-text); }
.group-card-count { font-size: 11px; color: var(--bento-text-secondary); }
.group-card-tools { font-size: 14px; margin-left: auto; opacity: 0.7; }
.group-card-wrapper { display: flex; flex-direction: column; }
.group-card-children { display: none; padding: 0 8px 8px; }
.group-card-wrapper.expanded .group-card-children { display: flex; flex-direction: column; gap: 4px; }
.group-card-wrapper.expanded .group-card { border-bottom-left-radius: 0; border-bottom-right-radius: 0; border-bottom: none; }
.group-card-children { background: var(--bento-card); border: 1.5px solid var(--bento-border); border-top: none; border-radius: 0 0 var(--bento-radius) var(--bento-radius); }
.group-child-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; cursor: pointer; border-radius: 8px; transition: background 0.15s; font-size: 13px; color: var(--bento-text); }
.group-child-item:hover { background: var(--bento-hover, rgba(0,0,0,0.04)); }
.group-child-item .gci-icon { font-size: 16px; width: 24px; text-align: center; flex-shrink: 0; }
.group-child-item .gci-name { font-weight: 500; }
.group-card-expand { margin-left: 8px; font-size: 12px; opacity: 0.5; transition: transform 0.2s; }
.group-card-wrapper.expanded .group-card-expand { transform: rotate(180deg); }
.tips-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; }
.tip-card { display: flex; gap: 12px; padding: 14px; background: var(--bento-card); border: 1.5px solid var(--bento-border); border-radius: var(--bento-radius); font-size: 12px; line-height: 1.5; color: var(--bento-text-secondary); }
.tip-icon { font-size: 22px; flex-shrink: 0; }
.tip-text strong { color: var(--bento-text); font-size: 13px; }
.changelog-card { background: var(--bento-card); border: 1.5px solid var(--bento-border); border-radius: var(--bento-radius); padding: 16px; }
.cl-item { padding: 6px 0; font-size: 13px; color: var(--bento-text); display: flex; align-items: center; gap: 8px; }
.cl-item + .cl-item { border-top: 1px solid var(--bento-border); }
.cl-tag { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.5px; flex-shrink: 0; }
.cl-tag.new { background: rgba(59, 130, 246, 0.1); color: #3B82F6; }
.cl-tag.fix { background: rgba(16, 185, 129, 0.1); color: #10B981; }
@media (max-width: 768px) {
  .home-hero { flex-direction: column; align-items: flex-start; }
  .groups-grid, .tips-grid { grid-template-columns: 1fr; }
}

.tools-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
.tool-card { background: var(--bento-card); border: 1px solid var(--bento-border); border-radius: var(--bento-radius); padding: 20px; cursor: pointer; transition: var(--bento-transition); animation: fadeSlideIn 0.4s ease-out; }
.tool-card:hover { border-color: var(--bento-primary); box-shadow: var(--bento-shadow-md); transform: translateY(-2px); }
.tool-card-header { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.tool-card-icon { font-size: 24px; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: rgba(59, 130, 246, 0.08); border-radius: var(--bento-radius-sm); }
.tool-card-name { font-size: 14px; font-weight: 600; color: var(--bento-text); }
.tool-card-desc { font-size: 12px; color: var(--bento-text-secondary); line-height: 1.5; margin-bottom: 10px; }
.tool-card-footer { display: flex; align-items: center; justify-content: space-between; }
.tool-card-category { font-size: 11px; font-weight: 500; color: var(--bento-text-secondary); }
.tool-card-status { font-size: 11px; font-style: italic; color: var(--bento-success); }

/* TOOL STATUS */
.tool-status { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
.tool-status.loaded { background: rgba(16, 185, 129, 0.1); color: #059669; }
.tool-status.error { background: rgba(239, 68, 68, 0.1); color: #DC2626; }
.tool-status.loading { background: rgba(59, 130, 246, 0.1); color: var(--bento-primary); }

/* SETTINGS */
.settings-view { animation: fadeSlideIn 0.4s ease-out; }
.settings-group { background: var(--bento-card); border: 1px solid var(--bento-border); border-radius: var(--bento-radius); margin-bottom: 16px; overflow: hidden; }
.settings-group-header {
  display: flex; justify-content: space-between; align-items: center; padding: 16px 20px;
  font-size: 15px; font-weight: 600; color: var(--bento-text); cursor: pointer;
  background: var(--bento-card); border-bottom: 1px solid var(--bento-border);
  transition: var(--bento-transition); user-select: none;
}
.settings-group-header:hover { background: rgba(59, 130, 246, 0.04); }
.settings-group-header .chevron { font-size: 12px; color: var(--bento-text-secondary); transition: transform 0.2s ease; }
.settings-group-header.collapsed .chevron { transform: rotate(-90deg); }
.settings-group-body { padding: 4px 0; }
.settings-group-body.hidden { display: none; }
.setting-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 20px; border-bottom: 1px solid var(--bento-border);
  transition: var(--bento-transition);
}
.setting-row:last-child { border-bottom: none; }
.setting-row:hover { background: rgba(59, 130, 246, 0.03); }
.setting-info { flex: 1; min-width: 0; margin-right: 16px; }
.setting-label { font-size: 13.5px; font-weight: 500; color: var(--bento-text); }
.setting-desc { font-size: 12px; color: var(--bento-text-secondary); margin-top: 3px; line-height: 1.4; }
.setting-control { flex-shrink: 0; }
.setting-select {
  padding: 8px 12px; border: 1.5px solid var(--bento-border); border-radius: var(--bento-radius-sm);
  background: var(--bento-card); color: var(--bento-text); font-size: 13px;
  font-family: 'Inter', sans-serif; cursor: pointer; transition: var(--bento-transition);
  outline: none; min-width: 120px;
}
.setting-select:focus { border-color: var(--bento-primary); box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
.setting-toggle { position: relative; display: inline-block; width: 44px; height: 24px; cursor: pointer; }
.setting-toggle input { opacity: 0; width: 0; height: 0; }
.setting-toggle .slider {
  position: absolute; top: 0; left: 0; right: 0; bottom: 0;
  background: var(--bento-border); border-radius: 12px; transition: 0.25s ease;
}
.setting-toggle .slider::before {
  content: ''; position: absolute; width: 20px; height: 20px;
  background: white; border-radius: 50%; top: 2px; left: 2px;
  transition: 0.25s ease; box-shadow: 0 1px 3px rgba(0,0,0,0.15);
}
.setting-toggle input:checked + .slider { background: var(--bento-primary); }
.setting-toggle input:checked + .slider::before { left: 22px; }
.settings-value { font-size: 13px; color: var(--bento-text-secondary); }

/* TOGGLE */
.toggle { width: 44px; height: 24px; background: var(--bento-border); border-radius: 12px; cursor: pointer; position: relative; transition: var(--bento-transition); border: none; padding: 0; }
.toggle.on { background: var(--bento-primary); }
.toggle::after { content: ''; position: absolute; width: 20px; height: 20px; background: white; border-radius: 50%; top: 2px; left: 2px; transition: var(--bento-transition); box-shadow: 0 1px 3px rgba(0,0,0,0.15); }
.toggle.on::after { left: 22px; }

/* LOADING */
.loading-view { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 48px; }
.spinner { width: 32px; height: 32px; border: 3px solid var(--bento-border); border-top: 3px solid var(--bento-primary); border-radius: 50%; animation: spin 0.8s linear infinite; }
.loading-text { margin-top: 16px; color: var(--bento-text-secondary); font-size: 14px; }

.skeleton { background: linear-gradient(90deg, var(--bento-border) 25%, rgba(226,232,240,0.5) 50%, var(--bento-border) 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: var(--bento-radius-xs); }

/* TOAST */
.toast { position: fixed; bottom: 24px; right: 24px; background: var(--bento-text); color: white; padding: 14px 20px; border-radius: var(--bento-radius-sm); font-size: 13px; font-weight: 500; box-shadow: var(--bento-shadow-md); z-index: 1000; animation: slideUp 0.3s ease-out; font-family: 'Inter', sans-serif; }
.toast.error { background: var(--bento-error); }
.toast.success { background: var(--bento-success); }

/* MOBILE SIDEBAR TOGGLE */
.sidebar-toggle {
  display: none;
  width: 36px; height: 36px;
  border: 1.5px solid var(--bento-border);
  background: var(--bento-card);
  border-radius: var(--bento-radius-sm);
  cursor: pointer;
  font-size: 18px;
  align-items: center; justify-content: center;
  color: var(--bento-text);
  transition: var(--bento-transition);
  flex-shrink: 0;
}
.sidebar-toggle:hover { background: var(--bento-bg); border-color: var(--bento-primary); }

.sidebar-overlay {
  display: none;
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.3);
  z-index: 99;
}

/* RESPONSIVE */
@media (max-width: 900px) {
  .tools-grid { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
  .content { padding: 16px; }
}

@media (max-width: 768px) {
  .sidebar-toggle { display: flex; }
  .panel { flex-direction: row; position: relative; }
  .sidebar {
    position: fixed; top: 0; left: 0; bottom: 0;
    width: 260px; z-index: 100;
    transform: translateX(-100%);
    transition: transform 0.25s ease;
    border-right: 1px solid var(--bento-border);
    box-shadow: none;
  }
  .sidebar.open {
    transform: translateX(0);
    box-shadow: 4px 0 20px rgba(0,0,0,0.15);
  }
  .sidebar-overlay.visible { display: block; }
  .sidebar-scroll {
    display: flex; flex-direction: column;
    overflow-y: auto; overflow-x: hidden;
    padding: 8px 0;
  }
  .nav-item { white-space: nowrap; margin: 2px 8px; }
  .tools-grid { grid-template-columns: 1fr; }
  .content { padding: 12px; }
  .toolbar { padding: 12px 16px; }
  .toolbar-title { font-size: 15px; }
  .home-section-title { font-size: 14px; }
  .tool-card { padding: 12px; }
  .donate-section { padding: 16px; flex-direction: column; text-align: center; }
  .donate-buttons { justify-content: center; }
}

@media (max-width: 480px) {
  .tools-grid { grid-template-columns: 1fr; gap: 8px; }
  .tool-card-title { font-size: 13px; }
  .tool-card-desc { font-size: 11px; }
  .content { padding: 8px; }
}

/* Donate Section - Bento Style */
.donate-section {
  margin-top: 32px;
  background: var(--donate-bg, linear-gradient(135deg, #fff5f5 0%, #fff0f6 50%, #f8f0ff 100%));
  border: 1px solid var(--donate-border, #fecdd3);
  border-radius: 16px;
  padding: 28px 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  flex-wrap: wrap;
}
.donate-section h3 {
  font-size: 17px;
  font-weight: 600;
  color: var(--donate-heading, #4c0519);
  margin: 0 0 6px 0;
}
.donate-section p {
  font-size: 13.5px;
  color: var(--donate-text, #6b1028);
  margin: 0;
  line-height: 1.5;
}
.donate-buttons {
  display: flex;
  gap: 12px;
  flex-shrink: 0;
}
.donate-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 10px;
  font-size: 13.5px;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}
.donate-btn.coffee {
  background: var(--donate-coffee-bg, #FFDD00);
  color: var(--donate-coffee-text, #000);
  border: 1px solid var(--donate-coffee-border, #e6c700);
}
.donate-btn.coffee:hover {
  background: #ffe534;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(255,221,0,0.4);
}
.donate-btn.paypal {
  background: var(--donate-paypal-bg, #0070ba);
  color: var(--donate-paypal-text, #fff);
  border: 1px solid var(--donate-paypal-border, #005ea6);
}
.donate-btn.paypal:hover {
  background: #0086e0;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0,112,186,0.4);
}


`;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._rendered) {
      this._rendered = true;
      this._render();
    }
    // Throttle hass propagation to child card (HA sends ~3 updates/sec)
    if (this._cardInstance) {
      const now = Date.now();
      if (!this._lastHassPropagation || (now - this._lastHassPropagation) > 5000) {
        this._lastHassPropagation = now;
        if (this._cardInstance.tagName.toLowerCase() === 'ha-cry-analyzer') {
          this._cardInstance.hassObj = hass;
        } else {
          this._cardInstance.hass = hass;
        }
      } else if (!this._hassPropScheduled) {
        this._hassPropScheduled = true;
        setTimeout(() => {
          this._hassPropScheduled = false;
          this._lastHassPropagation = Date.now();
          if (this._cardInstance) {
            if (this._cardInstance.tagName.toLowerCase() === 'ha-cry-analyzer') {
              this._cardInstance.hassObj = this._hass;
            } else {
              this._cardInstance.hass = this._hass;
            }
          }
        }, 5000);
      }
    }
  }

  set panel(panel) { this._config = panel?.config || {}; }
  set narrow(narrow) { this._narrow = narrow; }
  set route(route) { this._route = route; }

  _loadSettings() {
    try {
      const stored = localStorage.getItem('ha-tools-settings');
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  }

  _saveSettings() {
    try { localStorage.setItem('ha-tools-settings', JSON.stringify(this._settings)); } catch {}
  }

  _getSetting(key, defaultVal) {
    return this._settings[key] !== undefined ? this._settings[key] : defaultVal;
  }

  _setSetting(key, value) {
    this._settings[key] = value;
    this._saveSettings();
  }

  _getToolStatus() {
    const tools = HAToolsPanel.TOOLS;
    const available = tools.filter(t => !t.tag || customElements.get(t.tag));
    const unavailable = tools.filter(t => t.tag && !customElements.get(t.tag));
    return { tools, available, unavailable };
  }

  _render() {
    const { available, unavailable } = this._getToolStatus();
    this._loadedCount = available.length;

    this.shadowRoot.innerHTML = `
      <style>
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



${HAToolsPanel.CSS}
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
      <div class="panel ">
        <div class="sidebar">
          <div class="sidebar-header">
            <span>\u{1F6E0}\uFE0F</span> HA Tools
            <span class="version">v${HA_TOOLS_BUILD}</span>
          </div>
          <div class="sidebar-scroll">
            <div class="nav-item active" data-view="home">
              <span class="nav-icon">\u{1F3E0}</span>
              <span>Home</span>
              <span class="nav-badge">${available.length}/${HAToolsPanel.TOOLS.length}</span>
            </div>

            <div class="nav-section nav-section-tools">Narzędzia (${available.length})</div>
            <div class="nav-tools-list">
              ${(() => {
                const parents = available.filter(t => !t.group);
                const children = available.filter(t => t.group);
                let h = '';
                for (const t of parents) {
                  const myChildren = children.filter(c => c.group === t.id);
                  const chevron = myChildren.length ? '<span class="nav-expand">&#9662;</span>' : '';
                  h += `<div class="nav-item${myChildren.length ? ' has-children' : ''}" data-tool="${t.id}" data-tag="${t.tag || ''}">
                    <span class="nav-icon">${t.icon}</span>
                    <span>${t.name}</span>
                    ${chevron}
                  </div>`;
                  if (myChildren.length) {
                    h += `<div class="nav-group-children" data-group="${t.id}">`;
                    for (const c of myChildren) {
                      h += `<div class="nav-item child" data-tool="${c.id}" data-tag="${c.tag}">
                        <span class="nav-icon">${c.icon}</span>
                        <span>${c.name}</span>
                      </div>`;
                    }
                    h += '</div>';
                  }
                }
                return h;
              })()}
            </div>

            <div class="nav-section nav-section-unavailable" ${unavailable.length === 0 ? 'style="display:none"' : ''}>Niedostępne (${unavailable.length})</div>
            <div class="nav-unavail-list" ${unavailable.length === 0 ? 'style="display:none"' : ''}>
              ${unavailable.map(t => `
                <div class="nav-item unavailable" title="Nie zainstalowane">
                  <span class="nav-icon">${t.icon}</span>
                  <span>${t.name}</span>
                </div>
              `).join('')}
            </div>
          </div>
          <div class="sidebar-footer">
            <div class="nav-item" data-view="settings">
              <span class="nav-icon">\u2699\uFE0F</span>
              <span>Ustawienia</span>
            </div>
          </div>
        </div>
        <div class="sidebar-overlay" id="sidebarOverlay"></div>
        <div class="main">
          <div class="loading-bar" style="display:none"></div>
          <div class="toolbar">
            <button class="sidebar-toggle" id="sidebarToggle">&#9776;</button><div class="toolbar-title" id="title">\u{1F3E0} Home</div>
            <div class="toolbar-actions" id="toolbarActions" style="display:none">
              <button class="btn-icon" id="refreshBtn" title="Odśwież dane">&#x21bb;</button>
              <label class="ar-toggle" title="Auto-odświeżanie co 30s">
                <input type="checkbox" id="autoRefreshCb">
                <span class="ar-track"><span class="ar-thumb"></span></span>
                <span class="ar-lbl">Auto</span>
              </label>
            </div>
          </div>
          <div class="content" id="content"></div>
        </div>
      </div>
    `;

    this._bindNavigation();
    this._showHome();

    // Auto-load addon scripts and start polling for registration
    if (available.length < HAToolsPanel.TOOLS.length) {
      this._loading = true;
      this._updateLoadingStatus();
      this._loadAddonScripts();
      this._startPolling();
    } else {
      this._loading = false;
    }
  }

  _bindNavigation() {
    // Home and Settings navigation
    this.shadowRoot.querySelectorAll('.nav-item[data-view]').forEach(item => {
      item.addEventListener('click', () => {
        const view = item.dataset.view;
        this._setActiveNav(item);
        if (view === 'home') this._showHome();
        else if (view === 'settings') this._showSettings();
      });
    });

    // Tool navigation - skip group headers (they have empty data-tag)
    this.shadowRoot.querySelectorAll('.nav-item[data-tool]').forEach(item => {
      if (!item.dataset.tag) return;
      item.addEventListener('click', () => {
        this._setActiveNav(item);
        this._loadTool(item.dataset.tool, item.dataset.tag);
      });
    });

    // Sidebar toggle (mobile)
    const sidebarToggle = this.shadowRoot.getElementById('sidebarToggle');
    const sidebar = this.shadowRoot.querySelector('.sidebar');
    const overlay = this.shadowRoot.getElementById('sidebarOverlay');
    if (sidebarToggle) {
      sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('visible');
      });
      overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('visible');
      });
    }

    // Close sidebar on mobile when tool selected
    this.shadowRoot.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          sidebar.classList.remove('open');
          overlay.classList.remove('visible');
        }
      });
    });

    // Refresh button
    this.shadowRoot.getElementById('refreshBtn').addEventListener('click', () => {
      if (this._activeView === 'tool' && this._activeToolId) {
        const item = this.shadowRoot.querySelector(`.nav-item[data-tool="${this._activeToolId}"]`);
        if (item) this._loadTool(this._activeToolId, item.dataset.tag);
      }
    });

    // Auto-refresh toggle
    const arCb = this.shadowRoot.getElementById('autoRefreshCb');
    if (arCb) {
      arCb.checked = this._getSetting('autoRefresh', false);
      arCb.addEventListener('change', () => {
        this._setSetting('autoRefresh', arCb.checked);
        if (arCb.checked) this._startAutoRefresh();
        else this._stopAutoRefresh();
      });
    }
  }

  _startAutoRefresh() {
    if (this._autoRefreshTimer) clearInterval(this._autoRefreshTimer);
    this._autoRefreshTimer = setInterval(() => {
      if (this._activeView === 'tool' && this._activeToolId && this._cardInstance) {
        const item = this.shadowRoot.querySelector(`.nav-item[data-tool="${this._activeToolId}"]`);
        if (item) this._loadTool(this._activeToolId, item.dataset.tag);
      }
    }, 30000);
    const cb = this.shadowRoot ? this.shadowRoot.getElementById('autoRefreshCb') : null;
    if (cb) cb.checked = true;
  }

  _stopAutoRefresh() {
    if (this._autoRefreshTimer) { clearInterval(this._autoRefreshTimer); this._autoRefreshTimer = null; }
  }

  _setActiveNav(activeItem) {
    this.shadowRoot.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    activeItem.classList.add('active');
  }

  _showHome() {
    this._activeView = 'home';
    this._activeToolId = null;
    this._cardInstance = null;
    const title = this.shadowRoot.getElementById('title');
    title.textContent = '\u{1F3E0} Home';
    this.shadowRoot.getElementById('toolbarActions').style.display = 'none'; this._stopAutoRefresh();

    const { available, unavailable } = this._getToolStatus();
    const cats = HAToolsPanel.CATEGORIES;
    const tools = HAToolsPanel.TOOLS;
    const content = this.shadowRoot.getElementById('content');

    // Collect system info
    const haVersion = this._hass?.config?.version || '?';
    const haLocation = this._hass?.config?.location_name || 'Home';
    const entityCount = this._hass?.states ? Object.keys(this._hass.states).length : 0;
    const autoCount = this._hass?.states ? Object.keys(this._hass.states).filter(k => k.startsWith('automation.')).length : 0;
    const sensorCount = this._hass?.states ? Object.keys(this._hass.states).filter(k => k.startsWith('sensor.')).length : 0;

    // Group info
    const parents = tools.filter(t => !t.group && t.tag);
    const groupParents = tools.filter(t => !t.group && !t.tag);
    const children = tools.filter(t => t.group);
    const groupCount = groupParents.length + parents.filter(t => children.some(c => c.group === t.id)).length;

    // Build category stats
    const catStats = {};
    for (const t of available) {
      const cat = t.category || 'other';
      catStats[cat] = (catStats[cat] || 0) + 1;
    }

    content.innerHTML = `
      <div class="home-view">
        <!-- System Overview -->
        <div class="home-hero">
          <div class="hero-greeting">
            <div class="hero-title">\u{1F3E0} ${haLocation}</div>
            <div class="hero-subtitle">Home Assistant ${haVersion} \u2022 ${entityCount} encji \u2022 ${autoCount} automatyzacji</div>
          </div>
          <div class="hero-stats">
            <div class="hero-stat">
              <span class="hero-stat-num">${available.length}</span>
              <span class="hero-stat-label">Narz\u0119dzi</span>
            </div>
            <div class="hero-stat">
              <span class="hero-stat-num">${groupCount}</span>
              <span class="hero-stat-label">Grup</span>
            </div>
            <div class="hero-stat">
              <span class="hero-stat-num">${sensorCount}</span>
              <span class="hero-stat-label">Sensor\u00F3w</span>
            </div>
          </div>
        </div>

        <!-- Quick Access Groups -->
        <div class="home-section">
          <div class="home-section-title">\u{1F4CB} Grupy narz\u0119dzi</div>
          <div class="groups-grid">
            ${[...groupParents, ...parents.filter(t => children.some(c => c.group === t.id))].map(g => {
              const myChildren = children.filter(c => c.group === g.id);
              return `<div class="group-card-wrapper" data-group="${g.id}">
                <div class="group-card" data-tool="${g.id}">
                  <div class="group-card-icon">${g.icon}</div>
                  <div class="group-card-info">
                    <div class="group-card-name">${g.name}</div>
                    <div class="group-card-count">${myChildren.length} narz\u0119dzi</div>
                  </div>
                  <div class="group-card-tools">${myChildren.map(c => c.icon).join(' ')}</div>
                  <span class="group-card-expand">\u25BC</span>
                </div>
                <div class="group-card-children">
                  ${myChildren.map(c => `<div class="group-child-item" data-tool="${c.id}" data-tag="${c.tag}"><span class="gci-icon">${c.icon}</span><span class="gci-name">${c.name}</span></div>`).join('')}
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>



        <!-- Tips & Shortcuts -->
        <div class="home-section">
          <div class="home-section-title">\u{1F4A1} Wskaz\u00F3wki</div>
          <div class="tips-grid">
            <div class="tip-card">
              <div class="tip-icon">\u26A1</div>
              <div class="tip-text"><strong>Hard Reload</strong><br>Ctrl+Shift+R wymusza pobranie nowej wersji JS z serwera.</div>
            </div>
            <div class="tip-card">
              <div class="tip-icon">\u{1F9F9}</div>
              <div class="tip-text"><strong>Purge Cache</strong><br>U\u017Cyj narz\u0119dzia Purge Cache (Advanced Tools) aby wyczy\u015Bci\u0107 localStorage i cache.</div>
            </div>
            <div class="tip-card">
              <div class="tip-icon">\u{1F4BE}</div>
              <div class="tip-text"><strong>Backup</strong><br>Regularne backupy HA chroni\u0105 konfiguracj\u0119. Backup Manager poka\u017Ce dost\u0119pne kopie.</div>
            </div>
            <div class="tip-card">
              <div class="tip-icon">\u{1F50D}</div>
              <div class="tip-text"><strong>YAML Checker</strong><br>Przed restartem HA u\u017Cyj YAML Checker aby sprawdzi\u0107 poprawno\u015B\u0107 konfiguracji.</div>
            </div>
            <div class="tip-card">
              <div class="tip-icon">\u{1F4CA}</div>
              <div class="tip-text"><strong>Automatyzacje</strong><br>Automation Analyzer poka\u017Ce statystyki i problemy z automatyzacjami.</div>
            </div>
            <div class="tip-card">
              <div class="tip-icon">\u{1F6E1}\uFE0F</div>
              <div class="tip-text"><strong>Bezpiecze\u0144stwo</strong><br>Security Check audytuje konfiguracj\u0119 HA i wykrywa potencjalne zagro\u017Cenia.</div>
            </div>
          </div>
        </div>

        <!-- Changelog -->
        <div class="home-section">
          <div class="home-section-title">\u{1F4DD} Ostatnie zmiany <span class="count">v3.4.0</span></div>
          <div class="changelog-card">
            <div class="cl-item"><span class="cl-tag new">NEW</span> Purge Cache \u2014 narz\u0119dzie do czyszczenia cache przegl\u0105darki</div>
            <div class="cl-item"><span class="cl-tag new">NEW</span> Grupowanie narz\u0119dzi z animacj\u0105 collapse/expand</div>
            <div class="cl-item"><span class="cl-tag new">NEW</span> 4 grupy: Advanced Tools, Device Health, Smart Reports & Energy, Home & Family</div>
            <div class="cl-item"><span class="cl-tag fix">FIX</span> Wszystkie narz\u0119dzia w jednym katalogu ha-tools-panel/</div>
            <div class="cl-item"><span class="cl-tag fix">FIX</span> Naprawiony mojibake w YAML Checker (polskie znaki i emoji)</div>
            <div class="cl-item"><span class="cl-tag new">NEW</span> Przebudowany Home z informacjami systemowymi i wskaz\u00F3wkami</div>
          </div>
        </div>

        ${unavailable.length > 0 ? `
          <div class="home-section">
            <div class="home-section-title">
              ${this._loading ? '\u23F3' : '\u{1F4E6}'} ${this._loading ? '\u0141adowanie...' : 'Dost\u0119pne do instalacji'} <span class="count">(${unavailable.length})</span>
            </div>
            <div class="uninstalled-list">
              ${unavailable.map(t => `
                <div class="uninstalled-item">
                  <div class="ui-icon">${t.icon}</div>
                  <div class="ui-name">${t.name}</div>
                  <div class="ui-desc">${t.desc}</div>
                  <a class="btn btn-secondary btn-sm" href="https://github.com/${t.repo}" target="_blank" rel="noopener">GitHub</a>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Donate -->
        <div class="home-section">
          <div class="donate-section">
            <div class="donate-text">
              <h3>\u2764\uFE0F Wesprzyj rozw\u00F3j HA Tools</h3>
              <p>Je\u015Bli HA Tools u\u0142atwia Ci \u017Cycie z Home Assistant, rozwa\u017C wsparcie projektu. Ka\u017Cda kawa motywuje do dalszego rozwoju!</p>
            </div>
            <div class="donate-buttons">
              <a class="donate-btn coffee" href="https://buymeacoffee.com/macsiem" target="_blank" rel="noopener">\u2615 Buy Me a Coffee</a>
              <a class="donate-btn paypal" href="https://www.paypal.com/donate/?hosted_button_id=Y967H4PLRBN8W" target="_blank" rel="noopener">\u{1F4B3} PayPal</a>
            </div>
          </div>
        </div>
      </div>
    `;

    // Bind card clicks
    content.querySelectorAll('.tool-card[data-tool]').forEach(card => {
      card.addEventListener('click', () => {
        const toolId = card.dataset.tool;
        const tag = card.dataset.tag;
        const navItem = this.shadowRoot.querySelector(`.nav-item[data-tool="${toolId}"]`);
        if (navItem) {
          this._setActiveNav(navItem);
          this._loadTool(toolId, tag);
        }
      });
    });

    // Bind group card clicks — toggle expand to show child tools
    content.querySelectorAll('.group-card[data-tool]').forEach(card => {
      card.addEventListener('click', () => {
        const wrapper = card.closest('.group-card-wrapper');
        if (wrapper) wrapper.classList.toggle('expanded');
      });
    });

    // Bind child tool clicks in expanded groups — navigate to tool
    content.querySelectorAll('.group-child-item[data-tool]').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const toolId = item.dataset.tool;
        const tag = item.dataset.tag;
        const groupId = item.closest('.group-card-wrapper').dataset.group;
        // Expand group in sidebar
        this._collapsedGroups.delete(groupId);
        const groupEl = this.shadowRoot.querySelector(`.nav-group-children[data-group="${groupId}"]`);
        const chevron = this.shadowRoot.querySelector(`.nav-item[data-tool="${groupId}"] .nav-expand`);
        if (groupEl) groupEl.classList.remove('collapsed');
        if (chevron) chevron.classList.remove('collapsed');
        const navItem = this.shadowRoot.querySelector(`.nav-item[data-tool="${toolId}"]`);
        if (navItem) {
          this._setActiveNav(navItem);
          this._loadTool(toolId, tag);
        }
      });
    });

    // HACS install buttons
    content.querySelectorAll('.hacs-install').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const repo = btn.dataset.repo;
        const hacsUrl = `/hacs/repository/${repo.replace('/', '%2F')}`;
        window.open(hacsUrl, '_blank');
      });
    });
  }

  _showSettings() {
    this._activeView = 'settings';
    this._activeToolId = null;
    this._cardInstance = null;
    const title = this.shadowRoot.getElementById('title');
    title.textContent = '\u2699\uFE0F Ustawienia';
    this.shadowRoot.getElementById('toolbarActions').style.display = 'none'; this._stopAutoRefresh();

    const { available } = this._getToolStatus();
    const content = this.shadowRoot.getElementById('content');
    const lang = this._getSetting('language', 'pl');
    const defaultTool = this._getSetting('defaultTool', 'home');

    content.innerHTML = `
      <div class="settings-view">

        <!-- General Settings -->
        <div class="settings-group">
          <div class="settings-group-header" data-group="general">
            \u2699\uFE0F Ustawienia ogólne
            <span class="chevron">\u25BC</span>
          </div>
          <div class="settings-group-body" data-body="general">
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">Język</div>
                <div class="setting-desc">Język interfejsu panelu</div>
              </div>
              <div class="setting-control">
                <select class="setting-select" data-setting="language">
                  <option value="pl" ${lang === 'pl' ? 'selected' : ''}>Polski</option>
                  <option value="en" ${lang === 'en' ? 'selected' : ''}>English</option>
                </select>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">Domyślny widok</div>
                <div class="setting-desc">Co pokazać po otwarciu HA Tools</div>
              </div>
              <div class="setting-control">
                <select class="setting-select" data-setting="defaultTool">
                  <option value="home" ${defaultTool === 'home' ? 'selected' : ''}>Home</option>
                  ${available.map(t => `<option value="${t.id}" ${defaultTool === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}
                </select>
              </div>
            </div>
          </div>
        </div>

        <!-- Energy Settings -->
        <div class="settings-group">
          <div class="settings-group-header" data-group="energy">
            ⚡ Energia
            <span class="chevron">▼</span>
          </div>
          <div class="settings-group-body" data-body="energy">
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">Tryb taryfy</div>
                <div class="setting-desc">Sposób naliczania opłat za energię</div>
              </div>
              <div class="setting-control">
                <select class="setting-select" data-setting="energy_tariff_mode" id="energy-tariff-mode-select">
                  <option value="flat" ${this._getSetting('energy_tariff_mode', 'flat') === 'flat' ? 'selected' : ''}>Jedna stawka</option>
                  <option value="day_night" ${this._getSetting('energy_tariff_mode', 'flat') === 'day_night' ? 'selected' : ''}>Dzień / Noc</option>
                  <option value="weekday_weekend" ${this._getSetting('energy_tariff_mode', 'flat') === 'weekday_weekend' ? 'selected' : ''}>Dzień roboczy / Weekend</option>
                  <option value="mixed" ${this._getSetting('energy_tariff_mode', 'flat') === 'mixed' ? 'selected' : ''}>Mix (dzień/noc + roboczy/weekend)</option>
                </select>
              </div>
            </div>
            <div class="setting-row tariff-row tariff-flat" style="display:${this._getSetting('energy_tariff_mode', 'flat') === 'flat' ? '' : 'none'}">
              <div class="setting-info">
                <div class="setting-label">Stawka za energię</div>
                <div class="setting-desc">Jedna cena za 1 kWh</div>
              </div>
              <div class="setting-control">
                <input type="number" class="setting-input" data-setting="energy_price" value="${this._getSetting('energy_price', 0.65)}" step="0.01" min="0" style="width:80px;padding:6px 10px;border:1.5px solid var(--bento-border);border-radius:6px;font-size:13px;font-family:'Inter',sans-serif;background:var(--bento-card);color:var(--bento-text);">
                <span style="font-size:12px;color:var(--bento-text-secondary);margin-left:4px">PLN/kWh</span>
              </div>
            </div>
            <div class="setting-row tariff-row tariff-day_night" style="display:${this._getSetting('energy_tariff_mode', 'flat') === 'day_night' ? '' : 'none'}">
              <div class="setting-info">
                <div class="setting-label">Stawka dzienna</div>
                <div class="setting-desc">Cena za 1 kWh w godzinach dziennych</div>
              </div>
              <div class="setting-control">
                <input type="number" class="setting-input" data-setting="energy_price_day" value="${this._getSetting('energy_price_day', 0.65)}" step="0.01" min="0" style="width:80px;padding:6px 10px;border:1.5px solid var(--bento-border);border-radius:6px;font-size:13px;font-family:'Inter',sans-serif;background:var(--bento-card);color:var(--bento-text);">
                <span style="font-size:12px;color:var(--bento-text-secondary);margin-left:4px">PLN/kWh</span>
              </div>
            </div>
            <div class="setting-row tariff-row tariff-day_night" style="display:${this._getSetting('energy_tariff_mode', 'flat') === 'day_night' ? '' : 'none'}">
              <div class="setting-info">
                <div class="setting-label">Stawka nocna</div>
                <div class="setting-desc">Cena za 1 kWh w godzinach nocnych</div>
              </div>
              <div class="setting-control">
                <input type="number" class="setting-input" data-setting="energy_price_night" value="${this._getSetting('energy_price_night', 0.45)}" step="0.01" min="0" style="width:80px;padding:6px 10px;border:1.5px solid var(--bento-border);border-radius:6px;font-size:13px;font-family:'Inter',sans-serif;background:var(--bento-card);color:var(--bento-text);">
                <span style="font-size:12px;color:var(--bento-text-secondary);margin-left:4px">PLN/kWh</span>
              </div>
            </div>
            <div class="setting-row tariff-row tariff-weekday_weekend" style="display:${this._getSetting('energy_tariff_mode', 'flat') === 'weekday_weekend' ? '' : 'none'}">
              <div class="setting-info">
                <div class="setting-label">Stawka dzień roboczy</div>
                <div class="setting-desc">Cena za 1 kWh w dni robocze (Pn-Pt)</div>
              </div>
              <div class="setting-control">
                <input type="number" class="setting-input" data-setting="energy_price_weekday" value="${this._getSetting('energy_price_weekday', 0.65)}" step="0.01" min="0" style="width:80px;padding:6px 10px;border:1.5px solid var(--bento-border);border-radius:6px;font-size:13px;font-family:'Inter',sans-serif;background:var(--bento-card);color:var(--bento-text);">
                <span style="font-size:12px;color:var(--bento-text-secondary);margin-left:4px">PLN/kWh</span>
              </div>
            </div>
            <div class="setting-row tariff-row tariff-weekday_weekend" style="display:${this._getSetting('energy_tariff_mode', 'flat') === 'weekday_weekend' ? '' : 'none'}">
              <div class="setting-info">
                <div class="setting-label">Stawka weekend</div>
                <div class="setting-desc">Cena za 1 kWh w weekendy (So-Nd)</div>
              </div>
              <div class="setting-control">
                <input type="number" class="setting-input" data-setting="energy_price_weekend" value="${this._getSetting('energy_price_weekend', 0.50)}" step="0.01" min="0" style="width:80px;padding:6px 10px;border:1.5px solid var(--bento-border);border-radius:6px;font-size:13px;font-family:'Inter',sans-serif;background:var(--bento-card);color:var(--bento-text);">
                <span style="font-size:12px;color:var(--bento-text-secondary);margin-left:4px">PLN/kWh</span>
              </div>
            </div>
            <div class="setting-row tariff-row tariff-mixed" style="display:${this._getSetting('energy_tariff_mode', 'flat') === 'mixed' ? '' : 'none'}">
              <div class="setting-info">
                <div class="setting-label">Dzień roboczy — dzień</div>
                <div class="setting-desc">Pn-Pt, godziny dzienne</div>
              </div>
              <div class="setting-control">
                <input type="number" class="setting-input" data-setting="energy_price_wd_day" value="${this._getSetting('energy_price_wd_day', 0.65)}" step="0.01" min="0" style="width:80px;padding:6px 10px;border:1.5px solid var(--bento-border);border-radius:6px;font-size:13px;font-family:'Inter',sans-serif;background:var(--bento-card);color:var(--bento-text);">
                <span style="font-size:12px;color:var(--bento-text-secondary);margin-left:4px">PLN/kWh</span>
              </div>
            </div>
            <div class="setting-row tariff-row tariff-mixed" style="display:${this._getSetting('energy_tariff_mode', 'flat') === 'mixed' ? '' : 'none'}">
              <div class="setting-info">
                <div class="setting-label">Dzień roboczy — noc</div>
                <div class="setting-desc">Pn-Pt, godziny nocne</div>
              </div>
              <div class="setting-control">
                <input type="number" class="setting-input" data-setting="energy_price_wd_night" value="${this._getSetting('energy_price_wd_night', 0.45)}" step="0.01" min="0" style="width:80px;padding:6px 10px;border:1.5px solid var(--bento-border);border-radius:6px;font-size:13px;font-family:'Inter',sans-serif;background:var(--bento-card);color:var(--bento-text);">
                <span style="font-size:12px;color:var(--bento-text-secondary);margin-left:4px">PLN/kWh</span>
              </div>
            </div>
            <div class="setting-row tariff-row tariff-mixed" style="display:${this._getSetting('energy_tariff_mode', 'flat') === 'mixed' ? '' : 'none'}">
              <div class="setting-info">
                <div class="setting-label">Weekend — dzień</div>
                <div class="setting-desc">So-Nd, godziny dzienne</div>
              </div>
              <div class="setting-control">
                <input type="number" class="setting-input" data-setting="energy_price_we_day" value="${this._getSetting('energy_price_we_day', 0.55)}" step="0.01" min="0" style="width:80px;padding:6px 10px;border:1.5px solid var(--bento-border);border-radius:6px;font-size:13px;font-family:'Inter',sans-serif;background:var(--bento-card);color:var(--bento-text);">
                <span style="font-size:12px;color:var(--bento-text-secondary);margin-left:4px">PLN/kWh</span>
              </div>
            </div>
            <div class="setting-row tariff-row tariff-mixed" style="display:${this._getSetting('energy_tariff_mode', 'flat') === 'mixed' ? '' : 'none'}">
              <div class="setting-info">
                <div class="setting-label">Weekend — noc</div>
                <div class="setting-desc">So-Nd, godziny nocne</div>
              </div>
              <div class="setting-control">
                <input type="number" class="setting-input" data-setting="energy_price_we_night" value="${this._getSetting('energy_price_we_night', 0.40)}" step="0.01" min="0" style="width:80px;padding:6px 10px;border:1.5px solid var(--bento-border);border-radius:6px;font-size:13px;font-family:'Inter',sans-serif;background:var(--bento-card);color:var(--bento-text);">
                <span style="font-size:12px;color:var(--bento-text-secondary);margin-left:4px">PLN/kWh</span>
              </div>
            </div>
            <div class="setting-row tariff-row tariff-day_night tariff-mixed" style="display:${['day_night','mixed'].includes(this._getSetting('energy_tariff_mode', 'flat')) ? '' : 'none'}">
              <div class="setting-info">
                <div class="setting-label">Godziny dzienne</div>
                <div class="setting-desc">Przedział godzin taryfy dziennej (np. 6:00–22:00)</div>
              </div>
              <div class="setting-control" style="display:flex;align-items:center;gap:6px;">
                <input type="number" class="setting-input" data-setting="energy_day_hour_start" value="${this._getSetting('energy_day_hour_start', 6)}" step="1" min="0" max="23" style="width:55px;padding:6px 10px;border:1.5px solid var(--bento-border);border-radius:6px;font-size:13px;font-family:'Inter',sans-serif;background:var(--bento-card);color:var(--bento-text);">
                <span style="font-size:12px;color:var(--bento-text-secondary);">:00 —</span>
                <input type="number" class="setting-input" data-setting="energy_night_hour_start" value="${this._getSetting('energy_night_hour_start', 22)}" step="1" min="0" max="23" style="width:55px;padding:6px 10px;border:1.5px solid var(--bento-border);border-radius:6px;font-size:13px;font-family:'Inter',sans-serif;background:var(--bento-card);color:var(--bento-text);">
                <span style="font-size:12px;color:var(--bento-text-secondary);">:00</span>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">Waluta</div>
                <div class="setting-desc">Symbol waluty wyświetlany w raportach energii</div>
              </div>
              <div class="setting-control">
                <select class="setting-select" data-setting="energy_currency">
                  <option value="PLN" ${this._getSetting('energy_currency', 'PLN') === 'PLN' ? 'selected' : ''}>PLN</option>
                  <option value="EUR" ${this._getSetting('energy_currency', 'PLN') === 'EUR' ? 'selected' : ''}>EUR</option>
                  <option value="USD" ${this._getSetting('energy_currency', 'PLN') === 'USD' ? 'selected' : ''}>USD</option>
                  <option value="GBP" ${this._getSetting('energy_currency', 'PLN') === 'GBP' ? 'selected' : ''}>GBP</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <!-- Trace Viewer — Backend Settings -->
        <div class="settings-group">
          <div class="settings-group-header" data-group="trace-backend">
            \u{1F9EC} Trace Viewer — Przechowywanie
            <span class="chevron">\u25BC</span>
          </div>
          <div class="settings-group-body" data-body="trace-backend">
            <div class="trace-current-info">
              \u{1F4CA} Obecne ustawienie HA: <span class="val">stored_traces = 5</span> (domyślne per automatyzacja)
            </div>

            <div class="setting-subsection">Ilość traces</div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">Przechowuj N ostatnich traces</div>
                <div class="setting-desc">Ile trace'ów HA ma przechowywać na automatyzację (domyślnie 5). Zmiana dotyczy WSZYSTKICH automatyzacji.</div>
              </div>
              <div class="setting-control">
                <select class="setting-select" id="storedTracesCount">
                  <option value="5" ${this._getSetting('trace.storedCount', 20) == 5 ? 'selected' : ''}>5 (domyślne)</option>
                  <option value="10" ${this._getSetting('trace.storedCount', 20) == 10 ? 'selected' : ''}>10</option>
                  <option value="20" ${this._getSetting('trace.storedCount', 20) == 20 ? 'selected' : ''}>20</option>
                  <option value="50" ${this._getSetting('trace.storedCount', 20) == 50 ? 'selected' : ''}>50</option>
                  <option value="100" ${this._getSetting('trace.storedCount', 20) == 100 ? 'selected' : ''}>100</option>
                </select>
              </div>
            </div>

            <div class="setting-subsection">Filtr czasowy (frontend)</div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">Maksymalny wiek traces</div>
                <div class="setting-desc">Ukryj traces starsze niż wybrany okres (filtrowanie po stronie frontendu, nie usuwa danych z HA)</div>
              </div>
              <div class="setting-control">
                <select class="setting-select" data-setting="trace.maxAge" id="traceMaxAge">
                  <option value="0" ${this._getSetting('trace.maxAge', '0') == '0' ? 'selected' : ''}>Bez limitu</option>
                  <option value="3600" ${this._getSetting('trace.maxAge', '0') == '3600' ? 'selected' : ''}>1 godzina</option>
                  <option value="21600" ${this._getSetting('trace.maxAge', '0') == '21600' ? 'selected' : ''}>6 godzin</option>
                  <option value="43200" ${this._getSetting('trace.maxAge', '0') == '43200' ? 'selected' : ''}>12 godzin</option>
                  <option value="86400" ${this._getSetting('trace.maxAge', '0') == '86400' ? 'selected' : ''}>24 godziny</option>
                  <option value="604800" ${this._getSetting('trace.maxAge', '0') == '604800' ? 'selected' : ''}>7 dni</option>
                  <option value="2592000" ${this._getSetting('trace.maxAge', '0') == '2592000' ? 'selected' : ''}>30 dni</option>
                </select>
              </div>
            </div>

            <div class="setting-action-row">
              <button class="btn-apply" id="applyTracesBtn">\u{1F4BE} Zastosuj stored_traces do wszystkich automatyzacji</button>
            </div>
            <div style="padding: 0 var(--spacing-lg) var(--spacing-md);">
              <div class="status-msg" id="traceStatus"></div>
            </div>
          </div>
        </div>

        <!-- Per-addon settings -->
        ${available.map(t => {
          const prefix = t.id;
          const dashboardCard = this._getSetting(`${prefix}.dashboardCard`, true);
          const pageSize = this._getSetting(`${prefix}.pageSize`, 15);
          const isTraceViewer = prefix === 'trace-viewer';
          const isDataExporter = prefix === 'data-exporter';
          const snapEnabled = isDataExporter ? this._getSetting('data-exporter.snapshots.enabled', false) : false;
          const snapInterval = isDataExporter ? this._getSetting('data-exporter.snapshots.interval', 60) : 60;
          const snapMax = isDataExporter ? this._getSetting('data-exporter.snapshots.max', 50) : 50;
          return `
            <div class="settings-group">
              <div class="settings-group-header" data-group="${prefix}">
                ${t.icon} ${t.name}
                <span class="chevron">\u25BC</span>
              </div>
              <div class="settings-group-body" data-body="${prefix}">
                <div class="setting-subsection">Wy\u015Bwietlanie</div>
                <div class="setting-row">
                  <div class="setting-info">
                    <div class="setting-label">Pokazuj w dashboardzie</div>
                    <div class="setting-desc">Widoczność karty na stronie głównej</div>
                  </div>
                  <div class="setting-control">
                    <label class="setting-toggle">
                      <input type="checkbox" data-setting="${prefix}.dashboardCard" ${dashboardCard ? 'checked' : ''}>
                      <span class="slider"></span>
                    </label>
                  </div>
                </div>

                <div class="setting-subsection">Dzia\u0142anie</div>
                ${isTraceViewer ? `
                <div class="setting-row">
                  <div class="setting-info">
                    <div class="setting-label">Wpisów na stronę</div>
                    <div class="setting-desc">Ile traces/automatyzacji wyświetlać na jednej stronie</div>
                  </div>
                  <div class="setting-control">
                    <select class="setting-select" data-setting="${prefix}.pageSize">
                      <option value="10" ${pageSize == 10 ? 'selected' : ''}>10</option>
                      <option value="15" ${pageSize == 15 ? 'selected' : ''}>15</option>
                      <option value="25" ${pageSize == 25 ? 'selected' : ''}>25</option>
                      <option value="30" ${pageSize == 30 ? 'selected' : ''}>30</option>
                      <option value="50" ${pageSize == 50 ? 'selected' : ''}>50</option>
                      <option value="100" ${pageSize == 100 ? 'selected' : ''}>100</option>
                    </select>
                  </div>
                </div>
                ` : ''}
                ${isDataExporter ? `
                <div class="setting-subsection">Snapshoty</div>
                <div class="setting-row">
                  <div class="setting-info">
                    <div class="setting-label">Zbieranie snapshot\u00F3w</div>
                    <div class="setting-desc">Automatycznie zapisuj stany encji w localStorage</div>
                  </div>
                  <div class="setting-control">
                    <label class="setting-toggle">
                      <input type="checkbox" data-setting="data-exporter.snapshots.enabled" ${snapEnabled ? 'checked' : ''}>
                      <span class="slider"></span>
                    </label>
                  </div>
                </div>
                <div class="setting-row">
                  <div class="setting-info">
                    <div class="setting-label">Interwa\u0142 zbierania</div>
                    <div class="setting-desc">Co ile sekund zapisywa\u0107 snapshot</div>
                  </div>
                  <div class="setting-control">
                    <select class="setting-select" data-setting="data-exporter.snapshots.interval">
                      <option value="30" ${snapInterval == 30 ? 'selected' : ''}>30s</option>
                      <option value="60" ${snapInterval == 60 ? 'selected' : ''}>1 min</option>
                      <option value="300" ${snapInterval == 300 ? 'selected' : ''}>5 min</option>
                      <option value="900" ${snapInterval == 900 ? 'selected' : ''}>15 min</option>
                      <option value="3600" ${snapInterval == 3600 ? 'selected' : ''}>1h</option>
                    </select>
                  </div>
                </div>
                <div class="setting-row">
                  <div class="setting-info">
                    <div class="setting-label">Maksymalna ilo\u015B\u0107</div>
                    <div class="setting-desc">Ile snapshot\u00F3w przechowywa\u0107 w localStorage</div>
                  </div>
                  <div class="setting-control">
                    <select class="setting-select" data-setting="data-exporter.snapshots.max">
                      <option value="20" ${snapMax == 20 ? 'selected' : ''}>20</option>
                      <option value="50" ${snapMax == 50 ? 'selected' : ''}>50</option>
                      <option value="100" ${snapMax == 100 ? 'selected' : ''}>100</option>
                      <option value="200" ${snapMax == 200 ? 'selected' : ''}>200</option>
                    </select>
                  </div>
                </div>
                ` : ''}
              </div>
            </div>
          `;
        }).join('')}

      </div>
    `;

    // Bind settings controls
    content.querySelectorAll('.setting-select').forEach(select => {
      select.addEventListener('change', () => {
        this._setSetting(select.dataset.setting, select.value);
        if (select.dataset.setting === 'energy_tariff_mode') {
          const mode = select.value;
          content.querySelectorAll('.tariff-row').forEach(row => row.style.display = 'none');
          content.querySelectorAll('.tariff-' + mode).forEach(row => row.style.display = '');
          if (mode === 'day_night' || mode === 'mixed') {
            content.querySelectorAll('.tariff-row.tariff-day_night.tariff-mixed').forEach(row => row.style.display = '');
          }
        }
      });
    });

    content.querySelectorAll('.setting-input').forEach(input => {
      input.addEventListener('change', () => {
        const val = input.type === 'number' ? parseFloat(input.value) : input.value;
        this._setSetting(input.dataset.setting, val);
      });
    });

    content.querySelectorAll('.setting-toggle input').forEach(toggle => {
      toggle.addEventListener('change', () => {
        this._setSetting(toggle.dataset.setting, toggle.checked);
      });
    });

    // Collapsible groups
    content.querySelectorAll('.settings-group-header').forEach(header => {
      header.addEventListener('click', () => {
        const group = header.dataset.group;
        const body = content.querySelector(`.settings-group-body[data-body="${group}"]`);
        if (body) {
          body.classList.toggle('hidden');
          header.classList.toggle('collapsed');
        }
      });
    });

    // Trace storage — Apply button
    const applyBtn = content.querySelector('#applyTracesBtn');
    const traceStatus = content.querySelector('#traceStatus');
    const storedTracesSelect = content.querySelector('#storedTracesCount');
    if (applyBtn && storedTracesSelect) {
      applyBtn.addEventListener('click', async () => {
        const count = parseInt(storedTracesSelect.value);
        this._setSetting('trace.storedCount', count);
        applyBtn.disabled = true;
        applyBtn.textContent = '\u23F3 Stosowanie...';
        await this._applyStoredTraces(count, traceStatus);
        applyBtn.disabled = false;
        applyBtn.textContent = '\u{1F4BE} Zastosuj stored_traces do wszystkich automatyzacji';
      });
    }

    // Load current stored_traces value from first automation
    if (this._hass) {
      const infoEl = content.querySelector('.trace-current-info');
      this._loadCurrentStoredTraces(infoEl, storedTracesSelect);
    }
  }

  async _loadCurrentStoredTraces(infoEl, selectEl) {
    try {
      const automations = Object.values(this._hass.states)
        .filter(s => s.entity_id.startsWith('automation.'))
        .map(s => s.attributes.id)
        .filter(Boolean);
      if (automations.length === 0) return;

      // Sample first 5 automations to check their stored_traces
      const sample = automations.slice(0, 5);
      const values = [];
      for (const id of sample) {
        try {
          const config = await this._hass.callApi('GET', `config/automation/config/${id}`);
          values.push(config.stored_traces || 5);
        } catch { values.push(5); }
      }

      const unique = [...new Set(values)];
      const current = unique.length === 1 ? unique[0] : `${Math.min(...values)}-${Math.max(...values)}`;
      if (infoEl) {
        infoEl.innerHTML = `\u{1F4CA} Obecne ustawienie HA: <span class="val">stored_traces = ${current}</span> (sprawdzono ${sample.length} z ${automations.length} automatyzacji)`;
      }
      // Pre-select current value if all are the same
      if (unique.length === 1 && selectEl) {
        const opt = selectEl.querySelector(`option[value="${unique[0]}"]`);
        if (opt) opt.selected = true;
      }
    } catch (e) {
      console.warn('[HA Tools] Could not load stored_traces info:', e);
    }
  }

  async _applyStoredTraces(count, statusEl) {
    if (!this._hass) {
      statusEl.textContent = '\u274C Brak po\u0142\u0105czenia z Home Assistant';
      statusEl.className = 'status-msg visible error';
      return;
    }
    statusEl.textContent = '\u23F3 Pobieranie listy automatyzacji...';
    statusEl.className = 'status-msg visible info';

    try {
      // Get all automations with their unique IDs
      const automations = Object.values(this._hass.states)
        .filter(s => s.entity_id.startsWith('automation.'))
        .map(s => s.attributes.id)
        .filter(Boolean);

      let updated = 0;
      let skippedYaml = 0;
      let alreadySet = 0;
      let errors = 0;

      for (const id of automations) {
        const progress = updated + skippedYaml + alreadySet + errors + 1;
        statusEl.textContent = `\u23F3 Aktualizacja ${progress}/${automations.length}...`;
        try {
          // GET current config
          const config = await this._hass.callApi('GET', `config/automation/config/${id}`);

          // Check if already set to desired value
          if (config.stored_traces === count) {
            alreadySet++;
            continue;
          }

          // Update stored_traces and POST back
          config.stored_traces = count;
          await this._hass.callApi('PUT', `config/automation/config/${id}`, config);
          updated++;
        } catch (e) {
          // YAML automations can't be fetched/updated via API
          if (e.status_code === 404 || (e.message && e.message.includes('not found'))) {
            skippedYaml++;
          } else {
            errors++;
            console.warn(`[HA Tools] Failed to update stored_traces for ${id}:`, e);
          }
        }
      }

      let msg = `\u2705 stored_traces = ${count} zastosowane!<br>`;
      msg += `<small>\u{1F4CA} ${automations.length} automatyzacji: ${updated} zaktualizowanych`;
      if (alreadySet > 0) msg += `, ${alreadySet} ju\u017C ustawionych`;
      if (skippedYaml > 0) msg += `, ${skippedYaml} YAML (pomini\u0119te)`;
      if (errors > 0) msg += `, ${errors} b\u0142\u0119d\u00F3w`;
      msg += `</small>`;
      if (skippedYaml > 0) {
        msg += `<br><small style="opacity:0.8">\u{1F4DD} ${skippedYaml} automatyzacji YAML wymaga r\u0119cznej edycji: ustaw <code>stored_traces: ${count}</code> w configuration.yaml</small>`;
      }
      statusEl.innerHTML = msg;
      statusEl.className = 'status-msg visible success';
    } catch (e) {
      statusEl.textContent = `\u274C B\u0142\u0105d: ${e.message}`;
      statusEl.className = 'status-msg visible error';
    }
  }

  _navigateToSettings(section) {
    this._showSettings();
    // Set active nav to settings
    const settingsNav = this.shadowRoot.querySelector('.nav-item[data-view="settings"]');
    if (settingsNav) this._setActiveNav(settingsNav);
    // Expand and scroll to section after render
    setTimeout(() => {
      const content = this.shadowRoot.getElementById('content');
      if (!content || !section) return;
      const header = content.querySelector(`.settings-group-header[data-group="${section}"]`);
      const body = content.querySelector(`.settings-group-body[data-body="${section}"]`);
      if (header && body) {
        body.classList.remove('hidden');
        header.classList.remove('collapsed');
        header.scrollIntoView({ behavior: 'smooth', block: 'center' });
        header.style.background = 'rgba(59, 130, 246, 0.15)';
        setTimeout(() => { header.style.background = ''; }, 2000);
      }
    }, 200);
  }

  _loadTool(toolId, tag) {
    // Look up tag from TOOLS if not provided
    const tool = HAToolsPanel.TOOLS.find(t => t.id === toolId);
    if (!tag && tool) tag = tool.tag;
    if (!tag) { console.warn('[HA Tools] No tag for:', toolId); return; }
    this._activeView = 'tool';
    this._activeToolId = toolId;
    if (this._cardInstance) { try { this._cardInstance.remove(); } catch(e) {} }
    this._cardInstance = null;
    const displayName = tool ? tool.name : toolId;
    const displayIcon = tool ? tool.icon : '';
    const title = this.shadowRoot.getElementById('title');
    title.textContent = `${displayIcon} ${displayName}`;
    this.shadowRoot.getElementById('toolbarActions').style.display = '';
    // Sync auto-refresh checkbox with setting
    const arCb = this.shadowRoot.getElementById('autoRefreshCb');
    if (arCb) arCb.checked = this._getSetting('autoRefresh', false);

    const content = this.shadowRoot.getElementById('content');
    content.innerHTML = `<div class="empty"><div class="big">\u23F3</div><div>Ładowanie...</div></div>`;

    setTimeout(() => {
      try {
        content.innerHTML = '';
        const card = document.createElement(tag);

        if (typeof card.setConfig === 'function') {
          const cfg = { title: displayName, panel_mode: true };
          if (tag.includes('energy')) {
            cfg.energy_tariff_mode = this._getSetting('energy_tariff_mode', 'flat');
            cfg.energy_price = parseFloat(this._getSetting('energy_price', 0.65)) || 0.65;
            cfg.energy_price_day = parseFloat(this._getSetting('energy_price_day', 0.65)) || 0.65;
            cfg.energy_price_night = parseFloat(this._getSetting('energy_price_night', 0.45)) || 0.45;
            cfg.energy_price_weekday = parseFloat(this._getSetting('energy_price_weekday', 0.65)) || 0.65;
            cfg.energy_price_weekend = parseFloat(this._getSetting('energy_price_weekend', 0.50)) || 0.50;
            cfg.energy_price_wd_day = parseFloat(this._getSetting('energy_price_wd_day', 0.65)) || 0.65;
            cfg.energy_price_wd_night = parseFloat(this._getSetting('energy_price_wd_night', 0.45)) || 0.45;
            cfg.energy_price_we_day = parseFloat(this._getSetting('energy_price_we_day', 0.55)) || 0.55;
            cfg.energy_price_we_night = parseFloat(this._getSetting('energy_price_we_night', 0.40)) || 0.40;
            cfg.energy_day_hour_start = parseInt(this._getSetting('energy_day_hour_start', 6)) || 6;
            cfg.energy_night_hour_start = parseInt(this._getSetting('energy_night_hour_start', 22)) || 22;
            cfg.currency = this._getSetting('energy_currency', 'PLN');
          }
          card.setConfig(cfg);
        }

        if (tag === 'ha-cry-analyzer') {
          card.hassObj = this._hass;
        } else {
          card.hass = this._hass;
        }

        card.style.cssText = 'display:block; min-height:calc(100vh - 56px);';
        content.appendChild(card);
        this._cardInstance = card;
      } catch (e) {
        content.innerHTML = `<div class="empty"><div class="big">\u26A0\uFE0F</div><div>Błąd: ${e.message}</div></div>`;
      }
    }, 150);
  }
}

if (!customElements.get('ha-tools-panel')) { customElements.define('ha-tools-panel', HAToolsPanel); }
// HA Tools Panel registered

