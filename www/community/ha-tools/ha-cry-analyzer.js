﻿class HaCryAnalyzer extends HTMLElement {
  setConfig(config) {
    this.config = config;
    this.title = config.title || "Baby Cry Analyzer";
    this.soundSensor = config.sound_sensor;
  }

  set hass(hass) {

    if (hass?.language) this._lang = hass.language.startsWith('pl') ? 'pl' : 'en';    this.hassObj = hass;
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

  connectedCallback() {
    // Auto-refresh data from backend
    if (!this._refreshTimer) {
      this._refreshTimer = setInterval(() => this._loadData(), 30000);
    }
    if (this.hassObj && (!this.shadowRoot.innerHTML || this.shadowRoot.innerHTML.length < 100)) {
      this._firstHassRender = false;
      this.hass = this.hassObj;
    }
  }

  disconnectedCallback() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
  }

  constructor() {
    super();
    this._lang = (navigator.language || '').startsWith('pl') ? 'pl' : 'en';
    this.attachShadow({ mode: "open" });
    // --- Throttle fields ---
    this._lastRenderTime = 0;
    this._renderScheduled = false;
    this._firstHassRender = false;
    // --- Pagination ---
    this._currentPage = {};
    this._pageSize = 15;
    this.cryLog = [];
    this._loadData();
    this.currentTab = "log";
    this.showAddForm = false;
    this.formData = {
      category: "unknown",
      intensity: 3,
      duration: 5,
      notes: ""
    };
    this.hasUpdated = false;
  }

  // --- Backend data (AppDaemon cry_analyzer writes to JSON) ---
  _storageKey() { return 'ha-cry-analyzer-data'; }
  _saveData() {
    // Manual entries saved to localStorage as fallback
    try { localStorage.setItem(this._storageKey(), JSON.stringify(this.cryLog.filter(e => e.method === 'manual'))); }
    catch (e) { console.warn('Cry Analyzer: save failed', e); }
  }
  _loadData() {
    // Load ML results from backend JSON
    fetch('/local/community/ha-tools/cry_analyzer_log.json?_=' + Date.now())
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        // Merge with any manual entries from localStorage
        let manual = [];
        try {
          const raw = localStorage.getItem(this._storageKey());
          if (raw) manual = JSON.parse(raw);
        } catch(e) {}
        this.cryLog = [...data, ...manual].sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
        if (this.hassObj) this.render();
      })
      .catch(() => {
        // Fallback to localStorage only
        try {
          const raw = localStorage.getItem(this._storageKey());
          if (raw) this.cryLog = JSON.parse(raw);
        } catch(e) {}
      });
  }
  _getLiveStatus() {
    if (!this.hassObj) return null;
    const h = this.hassObj;
    const type = h.states['input_select.cry_analyzer_last_type'];
    const time = h.states['input_text.cry_analyzer_last_time'];
    const cam = h.states['input_text.cry_analyzer_last_camera'];
    const conf = h.states['input_number.cry_analyzer_confidence'];
    const method = h.states['input_text.cry_analyzer_method'];
    const count = h.states['counter.cry_analyzer_today'];
    if (!type) return null;
    return {
      cry_type: type.state,
      last_time: time ? time.state : '',
      camera: cam ? cam.state : '',
      confidence: conf ? parseFloat(conf.state) : 0,
      method: method ? method.state : '',
      today_count: count ? parseInt(count.state) : 0,
    };
  }


  _timeAgo(isoString) {
    if (!isoString) return 'N/A';
    const diff = (Date.now() - new Date(isoString).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.round(diff / 60) + 'm ago';
    if (diff < 86400) return Math.round(diff / 3600) + 'h ago';
    return Math.round(diff / 86400) + 'd ago';
  }
  getCategories() {
    return ["hungry", "tired", "pain", "discomfort", "gassy", "unknown"];
  }

  addCryLog() {
    const now = new Date();
    const entry = {
      id: Date.now(),
      timestamp: now.toISOString(),
      category: this.formData.category,
      intensity: parseInt(this.formData.intensity),
      duration: parseInt(this.formData.duration),
      notes: this.formData.notes
    };
    entry.cry_type = entry.category;
    entry.method = 'manual';
    entry.confidence = 1.0;
    this.cryLog.push(entry);
    // Fire HA event for manual entry
    if (this.hassObj) {
      try {
        this.hassObj.callService('input_select', 'select_option', {
          entity_id: 'input_select.cry_analyzer_last_type',
          option: entry.category
        });
      } catch(e) {}
    }
    this._saveData();
    this.formData = { category: "unknown", intensity: 3, duration: 5, notes: "" };
    this.showAddForm = false;
    this.render();
  }

  deleteCryLog(id) {
    this.cryLog = this.cryLog.filter(entry => entry.id !== id);
    this._saveData();
    this.render();
  }

  exportToJSON() {
    const dataStr = JSON.stringify(this.cryLog, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cry-log-${new Date().toISOString().split("T")[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  analyzePatterns() {
    if (this.cryLog.length === 0) {
      return { hourly: [], topCategories: [], avgDuration: 0, totalCries: 0 };
    }

    // Hourly frequency
    const hourlyData = new Array(24).fill(0);
    this.cryLog.forEach(entry => {
      const hour = new Date(entry.timestamp).getHours();
      hourlyData[hour]++;
    });

    // Top categories
    const categoryCount = {};
    this.getCategories().forEach(cat => categoryCount[cat] = 0);
    this.cryLog.forEach(entry => {
      categoryCount[entry.cry_type || entry.category]++;
    });
    const topCategories = Object.entries(categoryCount)
      .sort((a, b) => b[1] - a[1])
      .filter(([_, count]) => count > 0);

    // Average duration
    const avgDuration = this.cryLog.length > 0
      ? Math.round(this.cryLog.reduce((sum, e) => sum + e.duration, 0) / this.cryLog.length)
      : 0;

    return {
      hourly: hourlyData,
      topCategories,
      avgDuration,
      totalCries: this.cryLog.length
    };
  }

  generateTips() {
    const analysis = this.analyzePatterns();
    const tips = [];

    if (analysis.totalCries === 0) {
      return ["Start logging cry episodes to see personalized tips"];
    }

    // Peak hour analysis
    let peakHour = -1;
    let peakCount = 0;
    analysis.hourly.forEach((count, hour) => {
      if (count > peakCount) {
        peakCount = count;
        peakHour = hour;
      }
    });

    if (peakHour >= 17 && peakHour <= 20) {
      tips.push("🌆 Most cries happen in evening (5-8 PM) - this may be the 'witching hour'. Consider extra soothing time.");
    } else if (peakHour >= 21 || peakHour < 6) {
      tips.push("🌙 Peak crying times are at night. Review sleep patterns and feeding schedule.");
    }

    // Category analysis
    if (analysis.topCategories.length > 0) {
      const topCategory = analysis.topCategories[0][0];
      if (topCategory === "hungry") {
        tips.push("🍼 Hunger is the most common cry. Consider more frequent feeding sessions.");
      } else if (topCategory === "tired") {
        tips.push("😴 Fatigue causes most cries. Review sleep duration and nap times.");
      } else if (topCategory === "pain") {
        tips.push("⚠️ Pain-related cries detected. Monitor for signs of discomfort or illness.");
      }
    }

    // Duration analysis
    if (analysis.avgDuration > 15) {
      tips.push("⏱️ Average cry duration is long. Try different soothing techniques.");
    }

    if (tips.length === 0) {
      tips.push("✓ Varied cry patterns detected. Continue regular monitoring.");
    }

    return tips;
  }

  renderHourlyChart() {
    const analysis = this.analyzePatterns();
    const max = Math.max(...analysis.hourly, 1);

    const hours = Array.from({ length: 24 }, (_, i) => i);
    const chartBars = hours.map((hour, idx) => {
      const count = analysis.hourly[idx];
      const height = Math.max(count / max * 100, 2);
      const label = hour.toString().padStart(2, "0") + ":00";
      return `
        <div class="chart-bar-container">
          <div class="chart-bar" style="height: ${height}%"></div>
          <span class="chart-label">${label}</span>
        </div>
      `;
    }).join("");

    return `<div class="hourly-chart">${chartBars}</div>`;
  }

  renderPieChart() {
    const analysis = this.analyzePatterns();
    if (analysis.topCategories.length === 0) return "<p>No data yet</p>";

    const total = analysis.topCategories.reduce((sum, [_, count]) => sum + count, 0);
    const colors = {
      hungry: "#FFB6C1",
      tired: "#B0E0E6",
      pain: "#FFB6B6",
      discomfort: "#F0E68C",
      bored: "#DDA0DD",
      unknown: "#D3D3D3"
    };

    let slices = "";
    let currentAngle = 0;
    analysis.topCategories.forEach(([category, count]) => {
      const percentage = count / total;
      const angle = percentage * 360;
      const color = colors[category] || "#ccc";
      slices += `<div class="pie-slice" style="--angle: ${currentAngle}deg; --slice-angle: ${angle}deg; background: ${color};" title="${category}: ${count}"></div>`;
      currentAngle += angle;
    });

    const legend = analysis.topCategories.map(([cat, count]) =>
      `<div class="legend-item"><span class="legend-color" style="background: ${colors[cat]}"></span>${cat}: ${count}</div>`
    ).join("");

    return `<div class="pie-container"><div class="pie">${slices}</div></div><div class="pie-legend">${legend}</div>`;
  }

  renderLogTab() {
    const entries = [...this.cryLog].reverse();

    return `
      <div class="tab-content active">
        ${(() => {
          const live = this._getLiveStatus();
          if (!live) return '';
          const ago = live.last_time ? this._timeAgo(live.last_time) : 'N/A';
          return `<div class="live-status" style="background:var(--bento-primary-light);border:1px solid var(--bento-primary);border-radius:var(--bento-radius-sm);padding:16px;margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <h3 style="margin:0;font-size:15px;">Live Status</h3>
              <span style="font-size:12px;color:var(--bento-text-secondary);">Today: ${live.today_count} cries</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
              <div style="text-align:center;padding:8px;background:var(--bento-card);border-radius:8px;">
                <div style="font-size:18px;font-weight:700;text-transform:capitalize;">${live.cry_type}</div>
                <div style="font-size:11px;color:var(--bento-text-secondary);">Last Type</div>
              </div>
              <div style="text-align:center;padding:8px;background:var(--bento-card);border-radius:8px;">
                <div style="font-size:18px;font-weight:700;">${Math.round(live.confidence * 100)}%</div>
                <div style="font-size:11px;color:var(--bento-text-secondary);">Confidence</div>
              </div>
              <div style="text-align:center;padding:8px;background:var(--bento-card);border-radius:8px;">
                <div style="font-size:14px;font-weight:600;">${ago}</div>
                <div style="font-size:11px;color:var(--bento-text-secondary);">${live.camera}</div>
              </div>
            </div>
            <div style="margin-top:8px;font-size:11px;color:var(--bento-text-muted);text-align:right;">Method: ${live.method}</div>
          </div>`;
        })()}
        <div class="log-header">
          <h3>Cry Episodes (${this.cryLog.length})</h3>
          <button class="btn btn-primary" data-action="toggle-form">
            ${this.showAddForm ? "Cancel" : "+ Log Cry"}
          </button>
        </div>

        ${this.showAddForm ? `
          <div class="form-card">
            <h4>Log a Cry Episode</h4>
            <div class="form-group">
              <label>Category</label>
              <select class="form-select" @change="${(e) => { this.formData.category = e.target.value; }}">
                ${this.getCategories().map(cat =>
                  `<option value="${cat}" ${this.formData.category === cat ? "selected" : ""}>${cat}</option>`
                ).join("")}
              </select>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Intensity (1-5)</label>
                <input type="range" min="1" max="5" class="form-range"
                  value="${this.formData.intensity}"
                  @change="${(e) => { this.formData.intensity = e.target.value; this.render(); }}">
                <span class="intensity-display">${this.formData.intensity}</span>
              </div>
              <div class="form-group">
                <label>Duration (min)</label>
                <input type="number" min="1" max="60" class="form-input"
                  value="${this.formData.duration}"
                  @change="${(e) => { this.formData.duration = e.target.value; }}">
              </div>
            </div>
            <div class="form-group">
              <label>Notes</label>
              <textarea class="form-textarea" placeholder="Any observations..."
                @change="${(e) => { this.formData.notes = e.target.value; }}"></textarea>
            </div>
            <button class="btn btn-success" data-action="save-entry">Save Entry</button>
          </div>
        ` : ""}

        <div class="log-list">
          ${entries.length === 0 ? `<div class="empty-state"><div class="empty-icon">👶</div><h3 style="margin:8px 0 4px;font-size:16px;color:var(--bento-text,#333);">No Cry Logs Yet</h3><p style="margin:0 auto 16px;max-width:280px;text-align:center;">Start tracking cries to build pattern analysis and discover insights about your baby's routine.</p><button class="btn-primary" onclick="this.getRootNode().host._showAddDialog()">📝 Log First Cry</button></div>` : entries.map(entry => `
            <div class="log-entry">
              <div class="entry-header">
                <span class="entry-time">${new Date(entry.timestamp).toLocaleString()}</span>
                <span class="entry-category" data-category="${entry.cry_type || entry.category}">${entry.cry_type || entry.category}</span>
              </div>
              <div class="entry-details">
                ${entry.confidence !== undefined
                  ? `<span>Confidence: ${Math.round(entry.confidence * 100)}%</span>`
                  : `<span>Intensity: ${"★".repeat(entry.intensity || 0)}${"☆".repeat(5 - (entry.intensity || 0))}</span>`
                }
                ${entry.camera ? `<span>Camera: ${entry.camera}</span>` : ''}
                ${entry.duration ? `<span>Duration: ${entry.duration} min</span>` : ''}
                ${entry.method ? `<span style="font-size:10px;color:var(--bento-text-muted);">via ${entry.method}</span>` : ''}
              </div>
              ${entry.audio_features && entry.audio_features.estimated_pitch_hz ? `<div style="font-size:11px;color:var(--bento-text-secondary);margin-top:4px;">Pitch: ${entry.audio_features.estimated_pitch_hz}Hz | Energy: ${entry.audio_features.rms_energy} ${entry.audio_features.is_rhythmic ? '| Rhythmic' : ''}</div>` : ''}
              ${entry.notes ? `<p class="entry-notes">${entry.notes}</p>` : ""}
              <button class="btn btn-small btn-danger" data-action="delete" data-id="${entry.id}">Delete</button>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  renderAnalysisTab() {
    const analysis = this.analyzePatterns();
    return `
      <div class="tab-content active">
        <h3>Pattern Analysis</h3>

        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">${analysis.totalCries}</div>
            <div class="stat-label">Total Cries</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${analysis.avgDuration}</div>
            <div class="stat-label">Avg Duration (min)</div>
          </div>
        </div>

        <div class="chart-section">
          <h4>Cries by Hour of Day</h4>
          ${this.renderHourlyChart()}
        </div>

        <div class="chart-section">
          <h4>Cry Categories</h4>
          ${this.renderPieChart()}
        </div>
      </div>
    `;
  }

  renderInsightsTab() {
    const tips = this.generateTips();
    return `
      <div class="tab-content active">
        <h3>Insights & Tips</h3>
        <div class="tips-container">
          ${tips.map(tip => `<div class="tip-card">${tip}</div>`).join("")}
        </div>
      </div>
    `;
  }

  render() {
    const L = this._lang === 'pl';
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
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* Scrollbar */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--bento-border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--bento-text-muted); }

/* ===== END BENTO LIGHT MODE ===== */

        :host {
          --primary-color: #FFB6C1;
          --secondary-color: #87CEEB;
          --bg-color: var(--ha-card-background, #fff);
          --text-color: var(--ha-primary-text-color, #212121);
          --border-color: var(--ha-border-color, #e0e0e0);
        }

        .card {
          background: var(--bg-color);
          color: var(--text-color);
          border-radius: 12px;
          padding: 16px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .card-title {
          font-size: 20px;
          font-weight: 600;
          margin-bottom: 16px;
          color: var(--text-color);
        }

        .tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
          border-bottom: 2px solid var(--border-color);
        }

        .tab-button {
          padding: 12px 16px;
          background: none;
          border: none;
          cursor: pointer;
          color: var(--text-color);
          font-weight: 500;
          border-bottom: 3px solid transparent;
          transition: all 0.3s;
        }

        .tab-button.active {
          color: var(--primary-color);
          border-bottom-color: var(--primary-color);
        }

        .tab-button:hover {
          opacity: 0.8;
        }

        .tab-content {
          animation: fadeIn 0.3s;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .log-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .form-card {
          background: rgba(255, 182, 193, 0.1);
          padding: 16px;
          border-radius: 8px;
          margin-bottom: 16px;
          border: 1px solid var(--border-color);
        }

        .form-group {
          margin-bottom: 12px;
        }

        .form-group label {
          display: block;
          font-weight: 500;
          margin-bottom: 6px;
          font-size: 14px;
        }

        .form-select, .form-input, .form-range, .form-textarea {
          width: 100%;
          padding: 8px;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          background: var(--bg-color);
          color: var(--text-color);
          font-family: inherit;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .intensity-display {
          display: inline-block;
          margin-left: 8px;
          font-weight: 600;
          color: var(--primary-color);
        }

        .form-textarea {
          resize: vertical;
          min-height: 80px;
        }

        .btn {
          padding: 10px 16px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.2s;
        }

        .btn-primary {
          background: var(--primary-color);
          color: white;
        }

        .btn-primary:hover {
          opacity: 0.9;
          box-shadow: 0 2px 8px rgba(255, 182, 193, 0.3);
        }

        .btn-success {
          background: #90EE90;
          color: white;
        }

        .btn-danger {
          background: #FFB6B6;
          color: white;
        }

        .btn-small {
          padding: 6px 12px;
          font-size: 12px;
        }

        .log-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .log-entry {
          background: rgba(255, 182, 193, 0.05);
          padding: 12px;
          border-radius: 8px;
          border-left: 4px solid var(--primary-color);
        }

        .entry-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .entry-time {
          font-size: 12px;
          color: var(--secondary-color);
          font-weight: 600;
        }

        .entry-category {
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
          background: var(--primary-color);
          color: white;
        }

        .entry-category[data-category="tired"] {
          background: var(--secondary-color);
        }

        .entry-category[data-category="pain"] {
          background: #FFB6B6;
        }

        .entry-category[data-category="discomfort"] {
          background: #F0E68C;
        }

        .entry-category[data-category="bored"] {
          background: #DDA0DD;
        }

        .entry-details {
          display: flex;
          gap: 16px;
          font-size: 13px;
          margin-bottom: 8px;
        }

        .entry-notes {
          font-size: 13px;
          font-style: italic;
          margin: 8px 0;
          padding: 8px;
          background: rgba(0, 0, 0, 0.03);
          border-radius: 4px;
        }

        .empty-state {
          text-align: center;
          color: var(--border-color);
          padding: 32px 16px;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 24px;
        }

        .stat-card {
          background: linear-gradient(135deg, rgba(255, 182, 193, 0.2), rgba(135, 206, 235, 0.2));
          padding: 16px;
          border-radius: 8px;
          text-align: center;
          border: 1px solid var(--border-color);
        }

        .stat-value {
          font-size: 28px;
          font-weight: 700;
          color: var(--primary-color);
        }

        .stat-label {
          font-size: 12px;
          margin-top: 4px;
          color: var(--text-color);
          opacity: 0.7;
        }

        .chart-section {
          margin-bottom: 24px;
        }

        .chart-section h4 {
          margin-bottom: 12px;
        }

        .hourly-chart {
          display: flex;
          align-items: flex-end;
          gap: 2px;
          height: 120px;
          padding: 12px;
          background: rgba(255, 182, 193, 0.05);
          border-radius: 8px;
          overflow-x: auto;
        }

        .chart-bar-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          flex: 1;
          min-width: 30px;
        }

        .chart-bar {
          width: 100%;
          background: linear-gradient(180deg, var(--primary-color), rgba(255, 182, 193, 0.5));
          border-radius: 4px 4px 0 0;
          transition: all 0.2s;
          min-height: 4px;
        }

        .chart-bar:hover {
          opacity: 0.8;
        }

        .chart-label {
          font-size: 10px;
          margin-top: 4px;
          transform: rotate(45deg);
          transform-origin: left;
          width: 100%;
          text-align: center;
        }

        .pie-container {
          display: flex;
          justify-content: center;
          margin-bottom: 16px;
        }

        .pie {
          width: 120px;
          height: 120px;
          border-radius: 50%;
          position: relative;
          background: conic-gradient(#FFB6C1 0deg 90deg, #87CEEB 90deg 180deg, #FFB6B6 180deg 270deg, #DDA0DD 270deg 360deg);
        }

        .pie-legend {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
        }

        .legend-color {
          width: 16px;
          height: 16px;
          border-radius: 4px;
        }

        .tips-container {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .tip-card {
          background: linear-gradient(135deg, rgba(255, 182, 193, 0.15), rgba(135, 206, 235, 0.15));
          padding: 16px;
          border-radius: 8px;
          border-left: 4px solid var(--secondary-color);
          line-height: 1.6;
        }

        @media (max-width: 600px) {
          .form-row {
            grid-template-columns: 1fr;
          }

          .stats-grid {
            grid-template-columns: 1fr;
          }

          .log-header {
            flex-direction: column;
            gap: 12px;
          }

          .btn {
            width: 100%;
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

.card, .card-container, .reports-card, .export-card {
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
    --bento-primary-light: rgba(59,130,246,0.15);
    --bento-success-light: rgba(16,185,129,0.15);
    --bento-error-light: rgba(239,68,68,0.15);
    --bento-warning-light: rgba(245,158,11,0.15);
    color-scheme: dark !important;
  }
  .card, .card-container, .main-card, .exporter-card, .security-card, .reports-card, .storage-card, .chore-card, .cry-card, .backup-card, .network-card, .sentence-card, .energy-card, .panel-card {
    background: var(--bento-card) !important; color: var(--bento-text) !important; border-color: var(--bento-border) !important;
  }
  input, select, textarea { background: var(--bento-bg); color: var(--bento-text); border-color: var(--bento-border); }
  .stat, .stat-card, .summary-card, .metric-card, .kpi-card, .health-card { background: var(--bento-bg); border-color: var(--bento-border); }
  .tab-content, .section { color: var(--bento-text); }
  table th { background: var(--bento-bg); color: var(--bento-text-secondary); border-color: var(--bento-border); }
  table td { color: var(--bento-text); border-color: var(--bento-border); }
  tr:hover td { background: rgba(59,130,246,0.08); }
  .empty-state, .no-data { color: var(--bento-text-secondary); }
  .schedule-section, .settings-section, .detail-panel, .details, .device-detail { background: var(--bento-bg); border-color: var(--bento-border); }
  .addon-list, .content-item { background: rgba(255,255,255,0.05); }
  .chart-container { background: var(--bento-bg); border-color: var(--bento-border); }
  pre, code { background: #1e293b !important; color: #e2e8f0 !important; }
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
        <div class="card-title">${this.title}</div>

        <div class="tabs">
          <button class="tab-button ${this.currentTab === "log" ? "active" : ""}"
            data-tab="log">Log</button>
          <button class="tab-button ${this.currentTab === "analysis" ? "active" : ""}"
            data-tab="analysis">Analysis</button>
          <button class="tab-button ${this.currentTab === "insights" ? "active" : ""}"
            data-tab="insights">Insights</button>
          <button class="tab-button ${this.currentTab === "config" ? "active" : ""}"
            data-tab="config">Config</button>
        </div>

        ${this.currentTab === "log" ? this.renderLogTab() : ""}
        ${this.currentTab === "analysis" ? this.renderAnalysisTab() : ""}
        ${this.currentTab === "insights" ? this.renderInsightsTab() : ""}
        ${this.currentTab === "config" ? this.renderConfigTab() : ""}

        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border-color); text-align: center;">
          <button class="btn btn-primary" data-action="export">Export to JSON</button>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }


  // --- Configuration ---
  _getConfig() {
    const defaults = { cameras: ['sonoff_cam_2','sonoff_cam_3'], min_confidence: 0.4, cooldown: 30, notifications: true };
    try { const raw = localStorage.getItem('ha-cry-analyzer-config'); if (raw) return { ...defaults, ...JSON.parse(raw) }; } catch(e) {}
    return defaults;
  }
  _saveConfig(cfg) {
    try { localStorage.setItem('ha-cry-analyzer-config', JSON.stringify(cfg)); } catch(e) {}
  }

  renderConfigTab() {
    const cfg = this._getConfig();
    const live = this._getLiveStatus();
    const L = this._lang === 'pl';
    const cameras = [
      { id: 'sonoff_cam_2', name: 'Sonoff Cam 2 (Nursery)' },
      { id: 'sonoff_cam_3', name: 'Sonoff Cam 3 (Bedroom)' }
    ];

    return `
      <div class="tab-content active">
        <div style="display:grid;gap:20px;">

          <div style="background:var(--bento-card);border:1px solid var(--bento-border);border-radius:var(--bento-radius-sm);padding:20px;">
            <h3 style="margin:0 0 16px 0;font-size:15px;">${L ? 'Status Detekcji' : 'Detection Status'}</h3>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div style="padding:12px;background:var(--bento-success-light);border-radius:8px;text-align:center;">
                <div style="font-size:24px;">&#x1f3a4;</div>
                <div style="font-size:13px;font-weight:600;margin-top:4px;">Frigate Audio</div>
                <div style="font-size:11px;color:var(--bento-text-secondary);">${L ? 'Aktywne - crying' : 'Active - crying'}</div>
              </div>
              <div style="padding:12px;background:${live && live.cry_type !== 'unknown' ? 'var(--bento-warning-light)' : 'var(--bento-primary-light)'};border-radius:8px;text-align:center;">
                <div style="font-size:24px;">&#x1f9e0;</div>
                <div style="font-size:13px;font-weight:600;margin-top:4px;">ML Analyzer</div>
                <div style="font-size:11px;color:var(--bento-text-secondary);">${live ? (L ? 'Dzisiaj: ' : 'Today: ') + live.today_count + (L ? ' wykryc' : ' detections') : (L ? 'Oczekiwanie' : 'Waiting')}</div>
              </div>
            </div>
          </div>

          <div style="background:var(--bento-card);border:1px solid var(--bento-border);border-radius:var(--bento-radius-sm);padding:20px;">
            <h3 style="margin:0 0 16px 0;font-size:15px;">&#x1f4f7; ${L ? 'Kamery do Monitorowania' : 'Monitored Cameras'}</h3>
            <div style="display:grid;gap:10px;">
              ${cameras.map(c => `
                <label style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--bento-bg);border-radius:8px;cursor:pointer;border:1px solid var(--bento-border);">
                  <input type="checkbox" class="config-camera" data-camera="${c.id}"
                    ${cfg.cameras.includes(c.id) ? 'checked' : ''}
                    style="width:18px;height:18px;accent-color:var(--bento-primary);">
                  <div>
                    <div style="font-size:13px;font-weight:600;">${c.name}</div>
                    <div style="font-size:11px;color:var(--bento-text-secondary);">binary_sensor.${c.id}_sound</div>
                  </div>
                </label>
              `).join('')}
            </div>
          </div>

          <div style="background:var(--bento-card);border:1px solid var(--bento-border);border-radius:var(--bento-radius-sm);padding:20px;">
            <h3 style="margin:0 0 16px 0;font-size:15px;">&#x1f50a; ${L ? 'Czulosc Detekcji' : 'Detection Sensitivity'}</h3>
            <div style="margin-bottom:16px;">
              <label style="font-size:12px;font-weight:500;color:var(--bento-text-secondary);display:block;margin-bottom:6px;">
                ${L ? 'Minimalny prog pewnosci' : 'Min confidence threshold'}: <strong class="conf-val">${Math.round(cfg.min_confidence * 100)}%</strong>
              </label>
              <input type="range" class="config-confidence" min="10" max="90" value="${Math.round(cfg.min_confidence * 100)}"
                style="width:100%;accent-color:var(--bento-primary);">
              <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--bento-text-muted);margin-top:4px;">
                <span>${L ? 'Czuly (wiecej wykryc)' : 'Sensitive (more detections)'}</span>
                <span>${L ? 'Precyzyjny (mniej falsz.)' : 'Precise (fewer false pos.)'}</span>
              </div>
            </div>
            <div>
              <label style="font-size:12px;font-weight:500;color:var(--bento-text-secondary);display:block;margin-bottom:6px;">
                ${L ? 'Cooldown miedzy zdarzeniami' : 'Cooldown between events'}: <strong class="cool-val">${cfg.cooldown}s</strong>
              </label>
              <input type="range" class="config-cooldown" min="10" max="120" step="5" value="${cfg.cooldown}"
                style="width:100%;accent-color:var(--bento-primary);">
              <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--bento-text-muted);margin-top:4px;">
                <span>10s</span>
                <span>120s</span>
              </div>
            </div>
          </div>

          <div style="background:var(--bento-card);border:1px solid var(--bento-border);border-radius:var(--bento-radius-sm);padding:20px;">
            <h3 style="margin:0 0 16px 0;font-size:15px;">&#x1f514; ${L ? 'Powiadomienia' : 'Notifications'}</h3>
            <label style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--bento-bg);border-radius:8px;cursor:pointer;border:1px solid var(--bento-border);">
              <input type="checkbox" class="config-notify" ${cfg.notifications ? 'checked' : ''}
                style="width:18px;height:18px;accent-color:var(--bento-primary);">
              <div>
                <div style="font-size:13px;font-weight:600;">${L ? 'Powiadomienia HA o detekcji' : 'HA notifications on detection'}</div>
                <div style="font-size:11px;color:var(--bento-text-secondary);">${L ? 'Powiadomienie gdy pewnosc > prog' : 'Notify when confidence > threshold'}</div>
              </div>
            </label>
          </div>

          <div style="background:var(--bento-card);border:1px solid var(--bento-border);border-radius:var(--bento-radius-sm);padding:20px;">
            <h3 style="margin:0 0 12px 0;font-size:15px;">&#x2139;&#xfe0f; ${L ? 'Jak to dziala' : 'How it works'}</h3>
            <div style="font-size:12px;color:var(--bento-text-secondary);line-height:1.6;">
              <p style="margin:0 0 8px 0;">${L
                ? 'Frigate wykrywa dzwiek placzu na kamerach z mikrofonem. AppDaemon pobiera klip audio i analizuje go za pomoca ekstrakcji cech (pitch, energia, rytm) oraz opcjonalnie modelu YAMNet.'
                : 'Frigate detects crying sounds on cameras with microphones. AppDaemon downloads the audio clip and analyzes it using feature extraction (pitch, energy, rhythm) and optionally the YAMNet model.'}</p>
              <p style="margin:0;">${L
                ? 'Klasyfikacja opiera sie na bazie donateacry-corpus: glodny (wysoki pitch, regularny), zmeczony (niski pitch, nieregularny), bol (bardzo wysoki pitch), dyskomfort, gazy.'
                : 'Classification is based on the donateacry-corpus database: hungry (high pitch, regular), tired (low pitch, irregular), pain (very high pitch), discomfort, gassy.'}</p>
            </div>
          </div>

          <button class="btn btn-primary" data-action="save-config"
            style="padding:12px 24px;font-size:14px;font-weight:600;width:100%;border:none;color:white;background:var(--bento-primary);border-radius:var(--bento-radius-sm);cursor:pointer;">
            ${L ? 'Zapisz Konfiguracje' : 'Save Configuration'}
          </button>
          <div class="config-saved-msg" style="display:none;text-align:center;color:var(--bento-success);font-size:13px;font-weight:500;padding:8px;">
            ${L ? 'Konfiguracja zapisana' : 'Configuration saved'} &#x2713;
          </div>

        </div>
      </div>
    `;
  }

  attachEventListeners() {
    // Tab switching
    this.shadowRoot.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => { this.currentTab = btn.dataset.tab; this.render(); });
    });
    // Toggle form
    const toggleBtn = this.shadowRoot.querySelector('[data-action="toggle-form"]');
    if (toggleBtn) toggleBtn.addEventListener('click', () => { this.showAddForm = !this.showAddForm; this.render(); });
    // Save entry
    const saveBtn = this.shadowRoot.querySelector('[data-action="save-entry"]');
    if (saveBtn) saveBtn.addEventListener('click', () => this.addCryLog());
    // Delete buttons
    this.shadowRoot.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', () => this.deleteCryLog(parseInt(btn.dataset.id)));
    });
    // Export
    const exportBtn = this.shadowRoot.querySelector('[data-action="export"]');
    if (exportBtn) exportBtn.addEventListener('click', () => this.exportToJSON());
    // Form inputs
    this.shadowRoot.querySelectorAll('select').forEach(s => s.addEventListener('change', (e) => { this.formData.category = e.target.value; }));
    this.shadowRoot.querySelectorAll("input[type='range']").forEach(r => r.addEventListener('input', (e) => { this.formData.intensity = e.target.value; this.render(); }));
    this.shadowRoot.querySelectorAll("input[type='number']").forEach(n => n.addEventListener('change', (e) => { this.formData.duration = e.target.value; }));
    this.shadowRoot.querySelectorAll('textarea').forEach(t => t.addEventListener('change', (e) => { this.formData.notes = e.target.value; }));
    // Config tab listeners
    this.shadowRoot.querySelectorAll('.config-camera').forEach(cb => {
      cb.addEventListener('change', () => {
        const cfg = this._getConfig();
        const cam = cb.dataset.camera;
        if (cb.checked && !cfg.cameras.includes(cam)) cfg.cameras.push(cam);
        else cfg.cameras = cfg.cameras.filter(c => c !== cam);
        this._saveConfig(cfg);
      });
    });
    const confSlider = this.shadowRoot.querySelector('.config-confidence');
    if (confSlider) confSlider.addEventListener('input', (e) => {
      const cfg = this._getConfig();
      cfg.min_confidence = parseInt(e.target.value) / 100;
      this._saveConfig(cfg);
      const lbl = this.shadowRoot.querySelector('.conf-val');
      if (lbl) lbl.textContent = e.target.value + '%';
    });
    const coolSlider = this.shadowRoot.querySelector('.config-cooldown');
    if (coolSlider) coolSlider.addEventListener('input', (e) => {
      const cfg = this._getConfig();
      cfg.cooldown = parseInt(e.target.value);
      this._saveConfig(cfg);
      const lbl = this.shadowRoot.querySelector('.cool-val');
      if (lbl) lbl.textContent = e.target.value + 's';
    });
    const notifyCb = this.shadowRoot.querySelector('.config-notify');
    if (notifyCb) notifyCb.addEventListener('change', () => {
      const cfg = this._getConfig();
      cfg.notifications = notifyCb.checked;
      this._saveConfig(cfg);
    });
    const saveConfigBtn = this.shadowRoot.querySelector('[data-action="save-config"]');
    if (saveConfigBtn) saveConfigBtn.addEventListener('click', () => {
      const cfg = this._getConfig();
      if (this.hassObj) {
        try {
          this.hassObj.callService('automation', cfg.notifications ? 'turn_on' : 'turn_off', {
            entity_id: 'automation.cry_analyzer_notify'
          });
        } catch(e) {}
      }
      const msg = this.shadowRoot.querySelector('.config-saved-msg');
      if (msg) { msg.style.display = 'block'; setTimeout(() => { msg.style.display = 'none'; }, 3000); }
    });
    // Pagination
    if (typeof this._setupPaginationListeners === 'function') this._setupPaginationListeners();

  }

  static getConfigElement() {
    return document.createElement("ha-cry-analyzer-editor");
  }

  static getStubConfig() {
    return {
      type: "custom:ha-cry-analyzer",
      title: "Baby Cry Analyzer",
      sound_sensor: "binary_sensor.nursery_sound"
    };
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

if (!customElements.get("ha-cry-analyzer")) { customElements.define("ha-cry-analyzer", HaCryAnalyzer); }
