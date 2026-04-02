class HaBackupManager extends HTMLElement {
  constructor() {
    super();
    this._lang = (navigator.language || '').startsWith('pl') ? 'pl' : 'en';
    this.attachShadow({ mode: 'open' });
    // --- Throttle fields ---
    this._lastRenderTime = 0;
    this._renderScheduled = false;
    this._firstHassRender = false;
    // --- HTML diffing ---
    this._lastHtml = '';
    // --- Pagination ---
    this._currentPage = {};
    this._pageSize = 15;
    this._hass = null;
    this._config = {};
    this._backups = [];
    this._selectedBackup = null;
    this._activeTab = 'backups';
    this._healthData = {
      lastBackupDate: null,
      totalSize: 0,
      backupCount: 0,
      weeklyData: [0, 0, 0, 0],
    };
    this._loading = false;
    this._error = null;
    this._isDemoData = false;
    this._charts = {};
  }

  static getConfigElement() {
    return document.createElement('ha-backup-manager-editor');
  }

  static getStubConfig() {
    return {
      title: 'Backup Manager',
      warn_after_days: 3,
      max_backups: 10,
    }
  }
  async _loadChartJS() {
    if (window.Chart) return;
    
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js';
      script.onload = () => resolve(window.Chart);
      document.head.appendChild(script);
    });
  }

  setConfig(config) {
    this._config = config;
    this._updateUI();
  }

  set hass(hass) {

    if (hass?.language) this._lang = hass.language.startsWith('pl') ? 'pl' : 'en';    this._hass = hass;
    if (!hass) return;
    const now = Date.now();
    if (!this._firstHassRender) {
      this._firstHassRender = true;
      this._fetchBackups();
      this._updateUI();
      this._lastRenderTime = now;
      return;
    }
    if (now - (this._lastRenderTime || 0) < 5000) {
      if (!this._renderScheduled) {
        this._renderScheduled = true;
        setTimeout(() => {
          this._renderScheduled = false;
      this._fetchBackups();
          this._updateUI();
          this._lastRenderTime = Date.now();
        }, 5000 - (now - (this._lastRenderTime || 0)));
      }
      return;
    }
      this._fetchBackups();
    this._updateUI();
    this._lastRenderTime = now;
  }

  async _fetchBackups() {
    if (!this._hass) return;

    this._loading = true;
    this._error = null;

    try {
      // Use supervisor/api /backups which includes size and size_bytes
      let backupList = [];
      try {
        const svResult = await this._hass.callWS({ type: 'supervisor/api', endpoint: '/backups', method: 'get' });
        backupList = svResult?.backups || svResult?.data?.backups || [];
      } catch(svErr) {
        // Fallback to backup/info (no size data)
        const biResult = await this._hass.callWS({ type: 'backup/info' });
        backupList = biResult?.backups || [];
      }
      if (backupList.length > 0) {
        this._backups = backupList.sort((a, b) =>
          new Date(b.date || 0) - new Date(a.date || 0)
        );
        this._isDemoData = false;
        this._charts = {};
        this._error = null;
        this._calculateHealthData();
      }
    } catch (e) {
      console.warn('Backup Manager: API call failed:', e.message);
      this._error = 'Nie uda\u0142o si\u0119 pobra\u0107 backup\u00F3w: ' + (e.message || 'Unknown error');
      // Only use demo data if we have nothing at all
      if (this._backups.length === 0) {
        this._backups = this._getDemoBackups();
        this._isDemoData = true;
      }
      this._calculateHealthData();
    }

    this._loading = false;
    this._updateUI();
  }

  _getDemoBackups() {
    const now = new Date();
    return [
      {
        slug: 'demo_backup_001',
        name: 'Daily Backup',
        date: new Date(now.getTime() - 86400000).toISOString(),
        type: 'full',
        size: 1024 * 1024 * 250,
        is_protected: true,
        compressed: true,
        includes: {
          homeassistant: true,
          database: true,
          addons: ['mosquitto', 'zwave-js-ui'],
          folders: ['automations', 'scripts', 'scenes'],
        },
      },
      {
        slug: 'demo_backup_002',
        name: 'Weekly Backup',
        date: new Date(now.getTime() - 7 * 86400000).toISOString(),
        type: 'full',
        size: 1024 * 1024 * 280,
        is_protected: false,
        compressed: true,
        includes: {
          homeassistant: true,
          database: true,
          addons: ['mosquitto', 'zwave-js-ui', 'esphome'],
          folders: ['automations', 'scripts', 'scenes'],
        },
      },
      {
        slug: 'demo_backup_003',
        name: 'Partial Backup',
        date: new Date(now.getTime() - 14 * 86400000).toISOString(),
        type: 'partial',
        size: 1024 * 1024 * 120,
        is_protected: false,
        compressed: true,
        includes: {
          homeassistant: true,
          database: false,
          addons: [],
          folders: ['automations', 'scripts'],
        },
      },
    ];
  }

  _calculateHealthData() {
    if (this._backups.length === 0) {
      this._healthData.lastBackupDate = null;
      this._healthData.totalSize = 0;
      this._healthData.backupCount = 0;
      this._healthData.weeklyData = [0, 0, 0, 0];
      return;
    }

    this._healthData.lastBackupDate = new Date(this._backups[0].date);
    this._healthData.totalSize = this._backups.reduce((sum, b) => sum + (b.size || 0), 0);
    this._healthData.backupCount = this._backups.length;

    const now = new Date();
    this._healthData.weeklyData = [0, 0, 0, 0];

    this._backups.forEach(backup => {
      const backupDate = new Date(backup.date);
      const weekDiff = Math.floor((now - backupDate) / (7 * 86400000));
      if (weekDiff < 4) {
        this._healthData.weeklyData[3 - weekDiff]++;
      }
    });
  }

  _getTimeSinceBackup() {
    if (!this._healthData.lastBackupDate) return null;
    const hours = Math.floor((Date.now() - this._healthData.lastBackupDate) / 3600000);
    const days = Math.floor(hours / 24);
    return { days, hours };
  }

  _formatMB(mb) {
    if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
    return `${mb.toFixed(1)} MB`;
  }

  _formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  _formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  async _createBackup(isFullBackup) {
    try {
      const password = isFullBackup ? '' : '';
      await this._hass.callService('backup', 'create', {
        backup_type: isFullBackup ? 'full' : 'partial',
      });
      this._fetchBackups();
    } catch (e) {
      this._error = `Failed to create backup: ${e.message}`;
      this._updateUI();
    }
  }


  _sanitizeName(name) {
    if (!name) return 'Backup';
    try { return decodeURIComponent(escape(name)); } catch(e) { return name; }
  }

  _selectBackup(backup) {
    this._selectedBackup = this._selectedBackup?.slug === backup.slug ? null : backup;
    this._updateUI();
  }

  _renderBackupsTab() {
    const L = this._lang === 'pl';
    return `
      <div class="tab-content active">
        <div class="backup-controls">
          <button class="create-btn full-backup" data-backup-type="full">
            <span class="icon">⊕</span> ${L ? "Pe\u0142ny backup" : "Create Full Backup"}
          </button>
          <button class="create-btn partial-backup" data-backup-type="partial">
            <span class="icon">⊕</span> ${L ? "Cz\u0119\u015Bciowy backup" : "Create Partial Backup"}
          </button>
        </div>

        ${this._error ? `<div class="error-banner">${this._error}</div>` : ''}

        <div class="backups-list">
          ${this._backups.length === 0
            ? '<div class="empty-state">No backups available</div>'
            : this._backups.map((backup) => `
              <div class="backup-item ${this._selectedBackup?.slug === backup.slug ? 'selected' : ''}"
                   data-slug="${backup.slug}">
                <div class="backup-header">
                  <div class="backup-info">
                    <h3>${this._sanitizeName(backup.name)}</h3>
                    <span class="backup-type ${backup.type}">${backup.type}</span>
                    ${backup.is_protected ? '<span class="badge protected">🔒 Protected</span>' : ''}
                  
                    ${backup.location ? `<span class="badge method">${backup.location === 'addon' ? 'Addon' : (backup.location === 'cloud' ? 'Cloud' : 'Local')}</span>` : ''}</div>
                  <div class="backup-meta">
                    <span class="date">${this._formatDate(backup.date)}</span>
                    <span class="size">${backup.size_bytes ? this._formatBytes(backup.size_bytes) : (backup.size ? this._formatMB(backup.size) : '?')}</span>
                  </div>
                </div>
                ${this._selectedBackup?.slug === backup.slug ? `
                  <div class="backup-details">
                    <h4>Backup Contents:</h4>
                    <div class="contents-grid">
                      ${(backup.includes?.homeassistant || backup.homeassistant_included || backup.content?.homeassistant) ? '<span class="content-item">\u{1F4CB} Home Assistant Config</span>' : ''}
                      ${(backup.includes?.database || backup.database_included) ? '<span class="content-item">\u{1F4BE} Database</span>' : ''}
                      ${(backup.includes?.addons?.length > 0 || backup.addons?.length > 0) ? `<span class="content-item">\u{1F9E9} ${(backup.includes?.addons || backup.addons || []).length} Add-ons</span>` : ''}
                      ${(backup.includes?.folders?.length > 0 || backup.folders?.length > 0) ? `<span class="content-item">\u{1F4C1} ${(backup.includes?.folders || backup.folders || []).length} Folders</span>` : ''}
                    </div>
                    ${backup.includes?.addons?.length > 0 ? `
                      <div class="addon-list">
                        <strong>Add-ons:</strong>
                        ${backup.includes.addons.map(a => `<span>${a}</span>`).join('')}
                      </div>
                    ` : ''}
                  </div>
                ` : ''}
              </div>
            `).join('')}
        </div>
      </div>
    `;
  }

  _renderHealthTab() {
    const timeSince = this._getTimeSinceBackup();
    const warnDays = this._config.warn_after_days || 3;
    const daysStatus = !timeSince ? 'error' : timeSince.days > warnDays ? 'warning' : 'good';

    return `
      <div class="tab-content active">
        <div class="health-grid">
          <div class="health-card">
            <h3>Last Backup</h3>
            <div class="health-value ${daysStatus}">
              ${!timeSince ? 'Never' : `${timeSince.days}d ${timeSince.hours % 24}h ago`}
            </div>
            <p class="health-label">Status: ${daysStatus === 'good' ? '✓ Healthy' : daysStatus === 'warning' ? '⚠ Warning' : '✗ No backups'}</p>
          </div>

          <div class="health-card">
            <h3>Total Backups</h3>
            <div class="health-value">${this._healthData.backupCount}</div>
            <p class="health-label">Max allowed: ${this._config.max_backups || 10}</p>
          </div>

          <div class="health-card">
            <h3>Storage Used</h3>
            <div class="health-value">${this._formatBytes(this._healthData.totalSize)}</div>
            <p class="health-label">Compressed backups</p>
          </div>

          <div class="health-card">
            <h3>Backup Frequency</h3>
            <canvas id="frequency-chart" width="300" height="150"></canvas>
            <p class="health-label">Last 4 weeks</p>
          </div>
        </div>

        <div class="schedule-section">
          <h3>Automatic Backups</h3>
          <p>Check Home Assistant Settings > System > Backups for automatic backup schedule.</p>
          <div class="schedule-info">
            <span>Current setting: Home Assistant Default Schedule</span>
          </div>
        </div>
      </div>
    `;
  }

  _renderSettingsTab() {
    return `
      <div class="tab-content active">
        <div class="settings-section">
          <h3>Backup Configuration</h3>
          <div class="setting-item">
            <label>Warning After (days)</label>
            <p>Alert when backup is older than: ${this._config.warn_after_days || 3} days</p>
          </div>
          <div class="setting-item">
            <label>Maximum Backups</label>
            <p>Keep up to: ${this._config.max_backups || 10} backups</p>
          </div>
        </div>

        <div class="settings-section">
          <h3>Storage Management</h3>
          <p>Use Home Assistant Settings > System > Backups to manage backup retention and automatic cleanup.</p>
        </div>

        <div class="settings-section">
          <h3>Security</h3>
          <p>Backups are stored in: ${this._hass?.config?.config_dir || '/config/backups'}</p>
          <p>Ensure this location is properly backed up to external storage.</p>
        </div>
      </div>
    `;
  }

  _updateUI() {
    const L = this._lang === 'pl';
    const tabContent = {
      backups: () => this._renderBackupsTab(),
      health: () => this._renderHealthTab(),
      settings: () => this._renderSettingsTab(),
    };

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
          --primary-color: var(--primary-color, #2196F3);
          --error-color: var(--error-color, #F44336);
          --warning-color: var(--warning-color, #FF9800);
          --success-color: var(--success-color, #4CAF50);
          --background-color: var(--card-background-color, #fff);
          --text-color: var(--primary-text-color, #212121);
          --secondary-text: var(--secondary-text-color, #727272);
          --border-color: var(--divider-color, #e0e0e0);
          --dark-mode: ${this._hass?.themes?.darkMode ? 'true' : 'false'};
        }

        .card {
          background: var(--background-color);
          border-radius: 8px;
          padding: 16px;
          color: var(--text-color);
        }

        .card-title {
          font-size: 20px;
          font-weight: 500;
          margin: 0 0 16px 0;
          padding: 0;
        }

        .tabs {
          display: flex;
          gap: 8px;
          border-bottom: 1px solid var(--border-color);
          margin: 0 -16px 16px -16px;
          padding: 0 16px;
        }

        .tab-btn {
          background: none;
          border: none;
          padding: 12px 16px;
          cursor: pointer;
          color: var(--secondary-text);
          font-size: 14px;
          font-weight: 500;
          border-bottom: 3px solid transparent;
          transition: all 0.2s ease;
        }

        .tab-btn.active {
          color: var(--primary-color);
          border-bottom-color: var(--primary-color);
        }

        .tab-btn:hover {
          color: var(--text-color);
        }

        .tab-content {
          animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .backup-controls {
          display: flex;
          gap: 12px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }

        .create-btn {
          padding: 12px 16px;
          border: none;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s ease;
        }

        .full-backup {
          background: var(--success-color);
          color: white;
        }

        .full-backup:hover {
          opacity: 0.9;
          box-shadow: 0 2px 8px rgba(76, 175, 80, 0.3);
        }

        .partial-backup {
          background: var(--primary-color);
          color: white;
        }

        .partial-backup:hover {
          opacity: 0.9;
          box-shadow: 0 2px 8px rgba(33, 150, 243, 0.3);
        }

        .create-btn .icon {
          font-size: 16px;
        }

        .error-banner {
          background: var(--error-color);
          color: white;
          padding: 12px 16px;
          border-radius: 6px;
          margin-bottom: 16px;
          font-size: 14px;
        }

        .backups-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .backup-item {
          border: 1px solid var(--border-color);
          border-radius: 6px;
          padding: 16px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .backup-item:hover {
          border-color: var(--primary-color);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .backup-item.selected {
          border-color: var(--primary-color);
          background: rgba(33, 150, 243, 0.05);
        }

        .backup-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
        }

        .backup-info {
          flex: 1;
          min-width: 0;
        }

        .backup-info h3 {
          margin: 0 0 8px 0;
          font-size: 16px;
        }

        .badge.method {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 10px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
          background: rgba(100, 116, 139, 0.15);
          color: #64748B;
        }

        .badge.protected {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 10px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
          background: rgba(76, 175, 80, 0.15);
          color: #4caf50;
        }

        .backup-type {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 600;
        }

        .backup-type.full {
          background: rgba(76, 175, 80, 0.2);
          color: var(--success-color);
        }

        .backup-type.partial {
          background: rgba(255, 152, 0, 0.2);
          color: var(--warning-color);
        }

        .badge {
          display: inline-block;
          padding: 2px 8px;
          margin-left: 8px;
          border-radius: 4px;
          font-size: 12px;
          background: rgba(33, 150, 243, 0.2);
          color: var(--primary-color);
        }

        .backup-meta {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 4px;
          min-width: 150px;
        }

        .date, .size {
          font-size: 13px;
          color: var(--secondary-text);
        }

        .backup-details {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid var(--border-color);
        }

        .backup-details h4 {
          margin: 0 0 12px 0;
          font-size: 14px;
          color: var(--secondary-text);
        }

        .contents-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 8px;
          margin-bottom: 12px;
        }

        .content-item {
          padding: 8px 12px;
          background: rgba(33, 150, 243, 0.1);
          border-radius: 4px;
          font-size: 13px;
        }

        .addon-list {
          margin-top: 8px;
          padding: 8px;
          background: rgba(0, 0, 0, 0.02);
          border-radius: 4px;
          font-size: 12px;
        }

        .addon-list span {
          display: inline-block;
          margin-right: 8px;
          margin-top: 4px;
          padding: 2px 6px;
          background: var(--border-color);
          border-radius: 3px;
        }

        .empty-state {
          text-align: center;
          padding: 40px 20px;
          color: var(--secondary-text);
          font-size: 14px;
        }

        .health-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }

        .health-card {
          border: 1px solid var(--border-color);
          border-radius: 6px;
          padding: 16px;
        }

        .health-card canvas { max-height: 150px; display: block; }
        .health-card h3 {
          margin: 0 0 12px 0;
          font-size: 14px;
          color: var(--secondary-text);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .health-value {
          font-size: 32px;
          font-weight: 600;
          margin: 8px 0;
        }

        .health-value.good {
          color: var(--success-color);
        }

        .health-value.warning {
          color: var(--warning-color);
        }

        .health-value.error {
          color: var(--error-color);
        }

        .health-label {
          margin: 8px 0 0 0;
          font-size: 13px;
          color: var(--secondary-text);
        }

        .schedule-section, .settings-section {
          margin-bottom: 24px;
          padding: 16px;
          border: 1px solid var(--border-color);
          border-radius: 6px;
        }

        .schedule-section h3, .settings-section h3 {
          margin: 0 0 12px 0;
          font-size: 16px;
        }

        .schedule-info {
          background: rgba(33, 150, 243, 0.05);
          padding: 12px;
          border-radius: 4px;
          margin-top: 12px;
          font-size: 13px;
        }

        .setting-item {
          margin-bottom: 12px;
        }

        .setting-item label {
          display: block;
          font-weight: 500;
          margin-bottom: 4px;
        }

        .setting-item p {
          margin: 0;
          font-size: 14px;
          color: var(--secondary-text);
        }

        @media (max-width: 600px) {
          .backup-header {
            flex-direction: column;
          }

          .backup-meta {
            align-items: flex-start;
          }

          .health-grid {
            grid-template-columns: 1fr;
          }

          .contents-grid {
            grid-template-columns: 1fr;
          }
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
  --bento-radius: 16px;
  --bento-radius-sm: 10px;
  --bento-radius-xs: 6px;
  --bento-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02);
  --bento-shadow-md: 0 4px 12px rgba(0,0,0,0.06);
  --bento-transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: block;
  color-scheme: light !important;
}
* { box-sizing: border-box; }

.card, .card, .reports-card, .export-card {
  background: var(--bento-card); border-radius: var(--bento-radius); box-shadow: var(--bento-shadow);
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
.alert-item:hover { box-shadow: var(--bento-shadow); }
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

canvas, .canvas-container canvas { width: 100%; height: 200px; max-height: 200px; border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); margin-bottom: 16px; }
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
  .card, .card, .reports-card, .export-card { padding: 16px; }
  .stats, .stats-grid, .summary-grid { grid-template-columns: repeat(2, 1fr); }
  .panels { flex-direction: column; }
  .board { flex-direction: column; }
  .column { min-width: unset; }
}


/* === DARK MODE (H6 fix) === */
@media (prefers-color-scheme: dark) {
  :host {
    --bento-bg: var(--primary-background-color, #1a1a2e);
    --bento-card: var(--card-background-color, #16213e);
    --bento-border: var(--divider-color, #2a2a4a);
    --bento-text: var(--primary-text-color, #e0e0e0);
    --bento-text-secondary: var(--secondary-text-color, #a0a0b0);
    --bento-text-muted: var(--disabled-text-color, #6a6a7a);
    --bento-shadow-sm: 0 1px 3px rgba(0,0,0,0.3);
    --bento-shadow-md: 0 4px 12px rgba(0,0,0,0.4);
    color-scheme: dark !important;
  }
  .card { background: var(--bento-card); color: var(--bento-text); }
  .backup-item { border-color: var(--bento-border); }
  .backup-item:hover { border-color: var(--bento-primary); box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
  .backup-item.selected { background: rgba(59,130,246,0.12); }
  .health-card, .schedule-section, .settings-section { border-color: var(--bento-border); background: var(--bento-bg); }
  .content-item { background: rgba(59,130,246,0.15); color: var(--bento-text); }
  .addon-list { background: rgba(255,255,255,0.05); }
  .schedule-info { background: rgba(59,130,246,0.1); }
  .create-btn.full-backup { background: #059669; }
  .create-btn.partial-backup { background: #2563EB; }
}

        /* === MOBILE FIX === */
        @media (max-width: 768px) {
          .tabs { flex-wrap: wrap; overflow-x: visible; gap: 2px; }
          .tab, .tab-button, .tab-btn { padding: 6px 10px; font-size: 12px; white-space: nowrap; }
          .card, .card { padding: 14px; }
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
        <h1 class="card-title">${this._config.title || 'Backup Manager'}</h1>

        <div class="tabs">
          <button class="tab-btn ${this._activeTab === 'backups' ? 'active' : ''}"
                  data-tab="backups">
            ${L ? 'Kopie zapasowe' : 'Backups'}
          </button>
          <button class="tab-btn ${this._activeTab === 'health' ? 'active' : ''}"
                  data-tab="health">
            ${L ? 'Zdrowie' : 'Health'}
          </button>
          <button class="tab-btn ${this._activeTab === 'settings' ? 'active' : ''}"
                  data-tab="settings">
            ${L ? 'Ustawienia' : 'Settings'}
          </button>
        </div>

        ${tabContent[this._activeTab]()}
      </div>
    `;

    if (this._lastHtml === html) return;
    this._lastHtml = html;
    this.shadowRoot.innerHTML = html;

    this._attachEventListeners();

    if (this._activeTab === 'health') {
        this._loadChartJS().then(() => {
          setTimeout(() => this._drawFrequencyChart(), 100);
        });
      }
  }

  _switchTab(tab) {
    this._activeTab = tab;
    this._updateUI();
  }

  _drawFrequencyChart() {
    const canvas = this.shadowRoot?.getElementById('frequency-chart');
    if (!canvas) return;

    // Destroy existing chart if it exists
    if (this._charts['frequency']) {
      this._charts['frequency'].destroy();
    }

    const ctx = canvas.getContext('2d');
    const labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
    const maxValue = Math.max(...this._healthData.weeklyData, 5);

    this._charts['frequency'] = new window.Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Backups',
          data: this._healthData.weeklyData,
          backgroundColor: '#3B82F6',
          borderColor: '#3B82F6',
          borderRadius: 4,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'x',
        scales: {
          y: {
            beginAtZero: true,
            max: maxValue,
            grid: {
              color: 'rgba(0, 0, 0, 0.05)',
            },
          },
          x: {
            grid: {
              display: false,
            },
          },
        },
        plugins: {
          legend: {
            display: false,
          },
        },
      },
    });
  }

  _attachEventListeners() {
    // Tab button listeners
    this.shadowRoot?.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => this._switchTab(btn.getAttribute('data-tab')));
    });
    // Backup item click (H1 fix)
    this.shadowRoot?.querySelectorAll('.backup-item[data-slug]').forEach(item => {
      item.addEventListener('click', () => {
        const slug = item.getAttribute('data-slug');
        const backup = this._backups.find(b => b.slug === slug);
        if (backup) this._selectBackup(backup);
      });
    });
    // Create backup buttons
    this.shadowRoot?.querySelectorAll('.create-btn[data-backup-type]').forEach(btn => {
      btn.addEventListener('click', () => this._createBackup(btn.getAttribute('data-backup-type') === 'full'));
    });
    // Pagination
    this._setupPaginationListeners();
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

if (!customElements.get('ha-backup-manager')) { customElements.define('ha-backup-manager', HaBackupManager); };
