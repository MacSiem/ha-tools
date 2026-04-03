/**
 * HA Tools Discovery v1.0.0
 * Shared discovery & recommendation library for MacSiem HA Tools ecosystem.
 * 
 * Usage:
 *   - Loaded automatically by ha-tools-panel
 *   - Can be loaded standalone by individual add-on cards
 *   - Provides <ha-tools-discovery-banner current="tool-id"> custom element
 * 
 * Author: MacSiem / Jeff
 */

(function () {
  'use strict';

  // === Tool Registry ===
  const HA_TOOLS_REGISTRY = [
    { id: 'trace-viewer',        name: 'Trace Viewer',        icon: '\u{1F9EC}', tag: 'ha-trace-viewer',        repo: 'MacSiem/ha-tools-panel',        category: 'debug',   desc: 'Analizuj \u015blady automatyzacji' },
    { id: 'device-health',       name: 'Device Health',       icon: '\u{1F3E5}', tag: 'ha-device-health',       repo: 'MacSiem/ha-device-health',       category: 'monitor', desc: 'Monitoruj stan urz\u0105dze\u0144 i baterii' },
    { id: 'automation-analyzer', name: 'Automation Analyzer', icon: '\u{1F4CA}', tag: 'ha-automation-analyzer', repo: 'MacSiem/ha-automation-analyzer', category: 'debug',   desc: 'Analizuj problemy automatyzacji' },
    { id: 'backup-manager',      name: 'Backup Manager',      icon: '\u{1F4BE}', tag: 'ha-backup-manager',      repo: 'MacSiem/ha-backup-manager',      category: 'system',  desc: 'Zarz\u0105dzaj kopiami zapasowymi' },
    { id: 'network-map',         name: 'Network Map',         icon: '\u{1F310}', tag: 'ha-network-map',         repo: 'MacSiem/ha-network-map',         category: 'monitor', desc: 'Mapa sieci urz\u0105dze\u0144' },
    { id: 'smart-reports',       name: 'Smart Reports',       icon: '\u{1F4C8}', tag: 'ha-smart-reports',       repo: 'MacSiem/ha-smart-reports',       category: 'reports', desc: 'Inteligentne raporty' },
    { id: 'energy-optimizer',    name: 'Energy Optimizer',    icon: '\u26A1',    tag: 'ha-energy-optimizer',    repo: 'MacSiem/ha-energy-optimizer',    category: 'monitor', desc: 'Optymalizuj zu\u017cycie energii', standalone: true },
    { id: 'sentence-manager',    name: 'Sentence Manager',    icon: '\u{1F5E3}\uFE0F', tag: 'ha-sentence-manager', repo: 'MacSiem/ha-sentence-manager', category: 'system',  desc: 'Zdania g\u0142osowe HA' },
    { id: 'chore-tracker',       name: 'Chore Tracker',       icon: '\u{1F3E0}', tag: 'ha-chore-tracker',       repo: 'MacSiem/ha-chore-tracker',       category: 'life',    desc: '\u015bledzenie obowi\u0105zk\u00f3w domowych' },
    { id: 'baby-tracker',        name: 'Baby Tracker',        icon: '\u{1F37C}', tag: 'ha-baby-tracker',        repo: 'MacSiem/ha-baby-tracker',        category: 'life',    desc: 'Aktywno\u015b\u0107 dziecka' },
    { id: 'cry-analyzer',        name: 'Cry Analyzer',        icon: '\u{1F476}', tag: 'ha-cry-analyzer',        repo: 'MacSiem/ha-cry-analyzer',        category: 'life',    desc: 'Analiza p\u0142aczu AI' },
    { id: 'data-exporter',       name: 'Data Exporter',       icon: '\u{1F4E4}', tag: 'ha-data-exporter',       repo: 'MacSiem/ha-data-exporter',       category: 'system',  desc: 'Eksportuj dane HA' },
    { id: 'storage-monitor',     name: 'Storage Monitor',     icon: '\u{1F4BD}', tag: 'ha-storage-monitor',     repo: 'MacSiem/ha-storage-monitor',     category: 'system',  desc: 'Wizualizacja u\u017cycia dysku' },
    { id: 'security-check',      name: 'Security Check',      icon: '\u{1F6E1}\uFE0F', tag: 'ha-security-check', repo: 'MacSiem/ha-security-check',   category: 'system',  desc: 'Audyt bezpiecze\u0144stwa HA' },
    { id: 'energy-email',        name: 'Energy Email',        icon: '\u{1F4E7}', tag: 'ha-energy-email',        repo: 'MacSiem/ha-energy-email',        category: 'reports', desc: 'Raporty energii emailem', standalone: true, related: ['energy-optimizer', 'smart-reports'] },
    { id: 'vacuum-water-monitor',name: 'Vacuum Water Monitor',icon: '\u{1F9F9}', tag: 'ha-vacuum-water-monitor',repo: 'MacSiem/ha-vacuum-water-monitor', category: 'monitor', desc: 'Monitor wody odkurzacza Roborock', standalone: true, related: ['device-health'] },
    { id: 'log-email',           name: 'Log Email',           icon: '\u{1F6A8}', tag: 'ha-log-email',           repo: 'MacSiem/ha-log-email',           category: 'reports', desc: 'Email digest b\u0142\u0119d\u00f3w HA', standalone: true, related: ['smart-reports', 'security-check'] },
    { id: 'yaml-checker',        name: 'YAML Checker',        icon: '\u{1F5C2}\uFE0F', tag: 'ha-yaml-checker',  repo: 'MacSiem/ha-yaml-checker',        category: 'debug',   desc: 'Walidacja YAML HA', standalone: true, related: ['trace-viewer', 'automation-analyzer'] },
    { id: 'energy-insights',      name: 'Energy Insights',      icon: '\u26A1', tag: 'ha-energy-insights',    repo: 'MacSiem/ha-energy-insights',    category: 'monitor', desc: 'Wykresy zu\u017cycia energii', standalone: true, related: ['energy-optimizer', 'energy-email'] },
    { id: 'ai-automation-builder', name: 'AI Automation Builder', icon: '\uD83E\uDD16', tag: 'ha-ai-automation-builder', repo: 'MacSiem/ha-ai-automation-builder', category: 'debug', desc: 'Tworzenie automatyzacji z AI', standalone: true, related: ['automation-analyzer', 'yaml-checker'] },
  ];

  // Expose globally
  window.HA_TOOLS_REGISTRY = HA_TOOLS_REGISTRY;

  // === Utility ===
  function getInstalledTools() {
    return HA_TOOLS_REGISTRY.filter(t => customElements.get(t.tag));
  }

  function getUninstalledTools() {
    return HA_TOOLS_REGISTRY.filter(t => !customElements.get(t.tag));
  }

  // === Banner Custom Element ===
  if (!customElements.get('ha-tools-discovery-banner')) {
    class HaToolsDiscoveryBanner extends HTMLElement {
      connectedCallback() {
        const currentId = this.getAttribute('current') || '';
        const compact = this.hasAttribute('compact');
        this._render(currentId, compact);
      }

      _render(currentId, compact) {
        const installed = getInstalledTools();
        const total = HA_TOOLS_REGISTRY.length;
        const installedCount = installed.length;
        const isPanelInstalled = customElements.get('ha-tools-panel');

        // Find current tool's related tools (not installed)
        const current = HA_TOOLS_REGISTRY.find(t => t.id === currentId);
        const relatedIds = current?.related || [];
        const relatedNotInstalled = HA_TOOLS_REGISTRY.filter(t =>
          relatedIds.includes(t.id) && !customElements.get(t.tag)
        );

        // Other uninstalled tools (excluding related + current)
        const otherUninstalled = HA_TOOLS_REGISTRY.filter(t =>
          t.id !== currentId && !relatedIds.includes(t.id) && !customElements.get(t.tag)
        ).slice(0, compact ? 3 : 6);

        const hasAnything = !isPanelInstalled || relatedNotInstalled.length > 0 || otherUninstalled.length > 0;
        if (!hasAnything) {
          this.style.display = 'none';
          return;
        }

        const css = `
          <style>
            .hatd-banner {
              border: 1px solid #334155;
              border-radius: 12px;
              background: rgba(59,130,246,0.04);
              padding: 14px 16px;
              margin-top: 16px;
              font-family: 'Inter', -apple-system, sans-serif;
            }
            .hatd-header {
              display: flex;
              align-items: center;
              gap: 10px;
              cursor: pointer;
              user-select: none;
            }
            .hatd-title {
              flex: 1;
              font-size: 13px;
              font-weight: 600;
              color: #3B82F6;
            }
            .hatd-count {
              font-size: 11px;
              background: rgba(59,130,246,0.12);
              color: #3B82F6;
              border-radius: 20px;
              padding: 2px 8px;
              font-weight: 600;
            }
            .hatd-toggle {
              font-size: 11px;
              color: #64748B;
              transition: transform 0.2s;
            }
            .hatd-toggle.open { transform: rotate(180deg); }
            .hatd-body { margin-top: 12px; }
            .hatd-section-label {
              font-size: 11px;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              color: #64748B;
              margin-bottom: 8px;
              margin-top: 12px;
            }
            .hatd-section-label:first-child { margin-top: 0; }
            .hatd-panel-row {
              display: flex;
              align-items: center;
              gap: 12px;
              background: rgba(59,130,246,0.06);
              border: 1px solid rgba(59,130,246,0.2);
              border-radius: 8px;
              padding: 10px 12px;
              margin-bottom: 8px;
            }
            .hatd-panel-icon { font-size: 22px; }
            .hatd-panel-text { flex: 1; }
            .hatd-panel-name { font-size: 13px; font-weight: 600; color: #1E293B; }
            .hatd-panel-desc { font-size: 11px; color: #64748B; }
            @media (prefers-color-scheme: dark) {
              .hatd-panel-name { color: #e2e8f0; }
            }
            @media (max-width: 768px) {
              .hatd-banner { padding: 10px 12px; margin-top: 12px; }
              .hatd-tools-grid { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 6px; }
              .hatd-panel-row { gap: 8px; padding: 8px 10px; }
            }
            @media (max-width: 480px) {
              .hatd-tools-grid { grid-template-columns: 1fr 1fr; gap: 4px; }
              .hatd-tool-chip { padding: 5px 8px; font-size: 11px; }
              .hatd-title { font-size: 12px; }
              .hatd-panel-icon { font-size: 18px; }
            }
            .hatd-tools-grid {
              display: grid;
              grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
              gap: 8px;
            }
            .hatd-tool-chip {
              display: flex;
              align-items: center;
              gap: 6px;
              background: rgba(255,255,255,0.03);
              border: 1px solid #334155;
              border-radius: 8px;
              padding: 7px 10px;
              font-size: 12px;
              color: #94a3b8;
              text-decoration: none;
              transition: all 0.15s;
            }
            .hatd-tool-chip:hover {
              border-color: #3B82F6;
              color: #3B82F6;
              background: rgba(59,130,246,0.07);
            }
            .hatd-tool-chip.related {
              border-color: rgba(245,158,11,0.4);
              color: #F59E0B;
              background: rgba(245,158,11,0.05);
            }
            .hatd-tool-chip.related:hover {
              border-color: #F59E0B;
              background: rgba(245,158,11,0.1);
            }
            .hatd-chip-icon { font-size: 14px; }
            .hatd-chip-name { flex: 1; font-weight: 500; }
            .hatd-install-btn {
              display: inline-flex;
              align-items: center;
              gap: 6px;
              background: #3B82F6;
              color: white;
              border: none;
              border-radius: 8px;
              padding: 8px 14px;
              font-size: 12px;
              font-weight: 600;
              cursor: pointer;
              text-decoration: none;
              white-space: nowrap;
              flex-shrink: 0;
            }
            .hatd-install-btn:hover { background: #2563EB; }
          </style>
        `;

        let body = '';

        // Panel section (if not installed)
        if (!isPanelInstalled) {
          body += `
            <div class="hatd-section-label">\u{1F4E6} Centrum narz\u0119dzi HA</div>
            <div class="hatd-panel-row">
              <div class="hatd-panel-icon">\u{1F3E0}</div>
              <div class="hatd-panel-text">
                <div class="hatd-panel-name">HA Tools Panel</div>
                <div class="hatd-panel-desc">Wszystkie ${total} narz\u0119dzia w jednym miejscu</div>
              </div>
              <a class="hatd-install-btn" href="https://github.com/MacSiem/ha-tools-panel" target="_blank">\u{1F4E5} HACS</a>
            </div>
          `;
        }

        // Related tools section
        if (relatedNotInstalled.length > 0) {
          body += `<div class="hatd-section-label">\u{1F517} Powi\u0105zane narz\u0119dzia</div><div class="hatd-tools-grid">`;
          relatedNotInstalled.forEach(t => {
            body += `
              <a class="hatd-tool-chip related" href="https://github.com/${t.repo}" target="_blank" rel="noopener">
                <span class="hatd-chip-icon">${t.icon}</span>
                <span class="hatd-chip-name">${t.name}</span>
              </a>`;
          });
          body += `</div>`;
        }

        // Other tools
        if (otherUninstalled.length > 0) {
          body += `<div class="hatd-section-label">\u{1F527} Inne dost\u0119pne narz\u0119dzia</div><div class="hatd-tools-grid">`;
          otherUninstalled.forEach(t => {
            body += `
              <a class="hatd-tool-chip" href="https://github.com/${t.repo}" target="_blank" rel="noopener">
                <span class="hatd-chip-icon">${t.icon}</span>
                <span class="hatd-chip-name">${t.name}</span>
              </a>`;
          });
          body += `</div>`;
        }

        const isOpen = !compact;
        this.innerHTML = css + `
          <div class="hatd-banner">
            <div class="hatd-header" id="_hatd_toggle">
              <span>\u{1F9E9}</span>
              <span class="hatd-title">Ekosystem HA Tools</span>
              <span class="hatd-count">${installedCount}/${total} zainstalowanych</span>
              <span class="hatd-toggle ${isOpen ? 'open' : ''}" id="_hatd_arrow">\u25BC</span>
            </div>
            <div class="hatd-body" id="_hatd_body" style="display:${isOpen ? 'block' : 'none'}">
              ${body}
            </div>
          </div>
        `;

        // Toggle
        const toggle = this.querySelector('#_hatd_toggle');
        const bodyEl = this.querySelector('#_hatd_body');
        const arrow = this.querySelector('#_hatd_arrow');
        if (toggle) {
          toggle.addEventListener('click', () => {
            const open = bodyEl.style.display !== 'none';
            bodyEl.style.display = open ? 'none' : 'block';
            arrow.classList.toggle('open', !open);
          });
        }
      }
    }
    customElements.define('ha-tools-discovery-banner', HaToolsDiscoveryBanner);
  }

  // === Helper function to inject discovery banner into shadow root ===
  window.HAToolsDiscovery = {
    registry: HA_TOOLS_REGISTRY,
    getInstalled: getInstalledTools,
    getUninstalled: getUninstalledTools,

    /**
     * Load discovery.js if not already loaded
     */
    load() {
      if (window._hatd_loaded) return Promise.resolve();
      return new Promise((resolve) => {
        window._hatd_loaded = true;
        resolve();
      });
    },

    /**
     * Inject discovery banner into a container element.
     * @param {Element} container - DOM element to append banner to
     * @param {string} currentToolId - current tool id (e.g. 'energy-optimizer')
     * @param {boolean} compact - compact mode
     */
    inject(container, currentToolId, compact = false) {
      if (!container) return;
      // Remove existing
      const existing = container.querySelector('ha-tools-discovery-banner');
      if (existing) existing.remove();
      const banner = document.createElement('ha-tools-discovery-banner');
      banner.setAttribute('current', currentToolId);
      if (compact) banner.setAttribute('compact', '');
      container.appendChild(banner);
    },

    /**
     * Load discovery script from /local/community/ha-tools-panel/ha-tools-discovery.js
     * and inject banner into a shadow root container.
     * Call from standalone add-ons.
     */
    ensureAndInject(shadowRoot, containerId, currentToolId, compact = false) {
      const inject = () => {
        const container = shadowRoot.getElementById(containerId);
        if (container) {
          window.HAToolsDiscovery.inject(container, currentToolId, compact);
        }
      };
      if (window.HAToolsDiscovery) {
        inject();
      }
    }
  };

  window._hatd_loaded = true;
  console.log('[HA Tools Discovery] v1.0.0 loaded - ' + HA_TOOLS_REGISTRY.length + ' tools in registry');
})();


