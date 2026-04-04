
// ── HA Tools Server Persistence Helper ──
// Uses HA frontend/set_user_data for cross-device per-user persistence
// Falls back to localStorage for instant reads (cache), writes to both
window._haToolsPersistence = window._haToolsPersistence || {
  _cache: {},
  _hass: null,
  setHass(hass) { this._hass = hass; },

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

class HAAutomationAnalyzer extends HTMLElement {
  constructor() {
    super();
    this._lang = (navigator.language || '').startsWith('pl') ? 'pl' : 'en';
    this.attachShadow({ mode: "open" });
    this.config = {};
    this._hass = null;
    this.currentTab = "overview";
    this.automationStats = new Map();
    this.automationHistory = new Map();
    this.automationTraces = new Map();
    this.executionTimes = [];
    this.triggerTypes = new Map();
    this.failedAutomations = new Map();
    this.disabledAutomations = [];
    this._charts = {};
    this._chartJsLoaded = false;
    this._isLoading = true;
    this._lastUpdated = null;
    this._apiCache = new Map();
    this._cacheTimestamps = new Map();
    this._cacheTTL = 60000;
    this._lastRenderTime = 0;
    this._renderScheduled = false;
    this._firstHassRender = false;
    this._loadingInProgress = false;
    this._traceNoticeDismissed = false;
    this._loadingPhase = "";
    this._filterText = "";
    this._sortBy = "lastTriggered";
    this._sortDir = "desc";
    this._timeRange = "all";
  }

  setConfig(config) {
    this.config = {
      title: "Automation Analyzer",
      show_disabled: true,
      ...config
    };
  }

  set hass(hass) {

    if (hass?.language) this._lang = hass.language.startsWith('pl') ? 'pl' : 'en';    this._hass = hass;
    if (!hass) return;
    const now = Date.now();
    if (!this._firstHassRender) {
      this._firstHassRender = true;
      this._loadAndRender();
      return;
    }
    // Respect auto-refresh toggle from HA Tools panel
    if (!this._isAutoRefreshEnabled()) return;
    if (now - (this._lastRenderTime || 0) < 30000) {
      if (!this._renderScheduled) {
        this._renderScheduled = true;
        setTimeout(() => {
          this._renderScheduled = false;
          if (this._isAutoRefreshEnabled()) this._loadAndRender();
        }, 30000 - (now - (this._lastRenderTime || 0)));
      }
      return;
    }
    this._loadAndRender();
  }

  get hass() { return this._hass; }

  _sanitize(s) { try { return decodeURIComponent(escape(s)); } catch(e) { return s; } }

  _isAutoRefreshEnabled() {
    try {
      let el = this;
      while (el) {
        if (el.tagName && el.tagName.toLowerCase() === "ha-tools-panel") {
          const cb = el.shadowRoot && el.shadowRoot.getElementById("autoRefreshCb");
          if (cb) return cb.checked;
        }
        const root = el.getRootNode ? el.getRootNode() : null;
        el = (root && root.host) ? root.host : el.parentNode;
        if (el === document || el === window || !el) break;
      }
      // Standalone Lovelace card - no ha-tools-panel, always refresh
      return true;
    } catch (e) { return true; }
  }

  async _loadAndRender() {
    if (this._loadingInProgress) return;
    this._loadingInProgress = true;
    this._isLoading = true;
    this.render(); // Show loading spinner immediately (fixes blank page)
    try {
      await this.updateAutomationData();
      this.render();
      this._lastRenderTime = Date.now();
    } finally {
      this._loadingInProgress = false;
    }
  }

  async _loadChartJS() {
    if (this._chartJsLoaded && window.Chart) return window.Chart;
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js";
      script.onload = () => { this._chartJsLoaded = true; resolve(window.Chart); };
      script.onerror = () => reject(new Error("Failed to load Chart.js"));
      document.head.appendChild(script);
    });
  }

  _getCachedData(key) {
    const timestamp = this._cacheTimestamps.get(key);
    if (timestamp && Date.now() - timestamp < this._cacheTTL) return this._apiCache.get(key);
    return null;
  }

  _setCachedData(key, data) {
    this._apiCache.set(key, data);
    this._cacheTimestamps.set(key, Date.now());
  }

  async _callAPI(method, path) {
    try {
      const cached = this._getCachedData(path);
      if (cached) return cached;
      const response = await this._hass.callApi(method, path);
      this._setCachedData(path, response);
      return response;
    } catch (error) {
      console.warn(`API call failed for ${path}:`, error);
      return null;
    }
  }

  async _getAllAutomationConfigs(automations) {
    // Method 1: WebSocket bulk (works in main frontend/dashboard)
    try {
      if (this._hass && this._hass.callWS) {
        const configs = await this._hass.callWS({ type: "config/automation/list" });
        if (configs && Array.isArray(configs) && configs.length > 0) return configs;
      }
    } catch (e) { /* WS not available in this context */ }

    // Method 2: Per-automation REST API (works in HA Tools panel)
    // Only fetch enabled automations to keep it fast
    if (automations && automations.length > 0) {
      const configs = [];
      const enabled = automations.filter(([, e]) => e.state === "on");
      const toFetch = enabled.slice(0, 60); // Limit to 60 to avoid overload
      const batchSize = 10;
      for (let i = 0; i < toFetch.length; i += batchSize) {
        const batch = toFetch.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map(([, entity]) => {
            const attrId = entity.attributes?.id;
            if (!attrId) return Promise.reject("no id");
            return this._callAPI("GET", `config/automation/config/${attrId}`);
          })
        );
        for (const r of results) {
          if (r.status === "fulfilled" && r.value && r.value.id) configs.push(r.value);
        }
      }
      if (configs.length > 0) return configs;
    }

    console.warn("Could not fetch automation configs");
    return [];
  }

  async _getAutomationTraces(automationId) {
    // Traces contain actual execution data - timing, errors, etc.
    // Use bulk traces if already fetched
    if (this._bulkTraces) {
      return this._bulkTraces.filter(t => t.item_id === automationId);
    }
    try {
      if (this._hass && this._hass.callWS) {
        const traces = await this._hass.callWS({
          type: "automation/trace/list",
          automation_id: automationId
        });
        if (traces && Array.isArray(traces)) return traces;
      }
    } catch (e) {
      // Trace API may not be available in all HA versions
    }
    return [];
  }

  async _getAllTracesBulk() {
    // Fetch ALL automation traces in one call using trace/list
    try {
      if (this._hass && this._hass.callWS) {
        const traces = await this._hass.callWS({ type: "trace/list", domain: "automation" });
        if (traces && Array.isArray(traces)) return traces;
      }
    } catch (e) { /* Not available */ }
    return null;
  }

  async _getAutomationHistory(entityId, days = 14) {
    try {
      const now = new Date();
      const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      const startStr = startDate.toISOString();
      const history = await this._callAPI(
        "GET",
        `history/period/${startStr}?filter_entity_id=${entityId}&minimal_response&no_attributes`
      );
      if (Array.isArray(history) && history.length > 0) return history[0] || [];
      return [];
    } catch (error) {
      console.warn(`Could not get history for ${entityId}:`, error);
      return [];
    }
  }

  _parseAutomationConfig(configObj) {
    if (!configObj) return { triggers: [], actions: [], conditions: [] };
    const triggerRaw = configObj.trigger || configObj.triggers;
    const actionRaw = configObj.action || configObj.actions;
    const conditionRaw = configObj.condition || configObj.conditions;
    const triggers = triggerRaw ? (Array.isArray(triggerRaw) ? triggerRaw : [triggerRaw]) : [];
    const actions = actionRaw ? (Array.isArray(actionRaw) ? actionRaw : [actionRaw]) : [];
    const conditions = conditionRaw ? (Array.isArray(conditionRaw) ? conditionRaw : [conditionRaw]) : [];
    return { triggers, actions, conditions };
  }

  _getTriggerTypes(triggers) {
    const types = new Set();
    triggers.forEach(trigger => {
      if (typeof trigger === "object") {
        const type = trigger.platform || trigger.trigger;
        if (type) types.add(type);
      }
    });
    return Array.from(types);
  }

  _calculateHealthScore() {
    if (this.automationStats.size === 0) return 0;
    const total = this.automationStats.size;
    const disabled = this.disabledAutomations.length;
    const failed = this.failedAutomations.size;
    const slow = Array.from(this.automationStats.values()).filter(a => typeof a.avgExecutionTime === "number" && a.avgExecutionTime > 800).length;
    const stale = Array.from(this.automationStats.values()).filter(a => {
      if (!a.lastTriggered || a.state === "off") return false;
      const daysSince = (Date.now() - a.lastTriggered.getTime()) / (1000 * 60 * 60 * 24);
      return daysSince > 30;
    }).length;
    let score = 100;
    score -= (disabled / total) * 15;
    score -= (failed / total) * 25;
    score -= (slow / total) * 10;
    score -= (stale / total) * 5;
    return Math.max(0, Math.round(score));
  }

  _extractTodayCount(history) {
    if (!history || history.length === 0) return 0;
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return history.filter(event => {
      const eventTime = new Date(event.last_changed);
      return eventTime >= startOfDay && event.state === "on";
    }).length;
  }

  _countTracesToday(traces) {
    if (!traces || traces.length === 0) return 0;
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return traces.filter(t => {
      const raw = (t.timestamp && typeof t.timestamp === "object") ? t.timestamp.start : t.timestamp;
      if (!raw) return false;
      const ts = new Date(raw);
      return ts >= startOfDay;
    }).length;
  }

  _analyzeTraces(traces) {
    // Extract execution times and error status from traces
    const result = { avgTime: "N/A", hasErrors: false, errorCount: 0, executionCount: traces.length, recentTimes: [] };
    if (!traces || traces.length === 0) return result;
    const durations = [];
    for (const trace of traces) {
      if (trace.state === "stopped" && trace.script_execution === "error") {
        result.hasErrors = true;
        result.errorCount++;
      }
      // Support both formats: trace/list (timestamp.start/finish) and automation/trace/list (timestamp + finished_at)
      let start = null, end = null;
      if (trace.timestamp && typeof trace.timestamp === "object" && trace.timestamp.start) {
        start = new Date(trace.timestamp.start).getTime();
        end = trace.timestamp.finish ? new Date(trace.timestamp.finish).getTime() : null;
      } else if (trace.timestamp) {
        start = new Date(trace.timestamp).getTime();
        end = trace.finished_at ? new Date(trace.finished_at).getTime() : null;
      }
      if (start && end) {
        const duration = end - start;
        if (duration >= 0 && duration < 300000) {
          durations.push(duration);
        }
      }
    }
    if (durations.length > 0) {
      result.avgTime = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
      result.recentTimes = durations.slice(-10);
    }
    return result;
  }

  async updateAutomationData() {
    if (!this._hass || !this._hass.states) { this._isLoading = false; return; }
    this._isLoading = true;
    this._loadingPhase = "Odczytywanie stan\u00f3w automatyzacji...";
    try {
      const automations = Object.entries(this._hass.states).filter(([id]) => id.startsWith("automation."));
      this.automationStats.clear();
      this.triggerTypes.clear();
      this.failedAutomations.clear();
      this.disabledAutomations = [];
      this.executionTimes = [];
      this.automationHistory.clear();
      this.automationTraces.clear();

      // --- Phase 1: Instant pass using hass states only (ZERO API calls) ---
      const automationMeta = [];
      for (const [id, entity] of automations) {
        const name = this._sanitize(entity.attributes?.friendly_name || id.replace("automation.", ""));
        const isDisabled = entity.state === "off";
        if (isDisabled && !this.config.show_disabled) continue;

        const internalId = entity.attributes?.id || id.replace("automation.", "");

        if (isDisabled) {
          this.disabledAutomations.push({ id, name, automationId: internalId });
        }

        const lastTriggered = entity.attributes?.last_triggered
          ? new Date(entity.attributes.last_triggered)
          : null;

        this.automationStats.set(id, {
          id, automationId: internalId, name,
          state: entity.state, lastTriggered,
          todayCount: 0, avgExecutionTime: "N/A",
          totalActions: 0, conditions: 0,
          triggerTypes: [], primaryTrigger: "unknown",
          isFailed: false, traceCount: 0, history: []
        });

        automationMeta.push({ id, entity, name, internalId, isDisabled, lastTriggered });
      }

      // Show basic stats immediately (no API calls made yet)
      this._isLoading = false;
      this._lastUpdated = new Date();
      this.render();

      // --- Phase 2: Fetch automation configs (enriches trigger types) ---
      this._loadingPhase = "Pobieranie konfiguracji automatyzacji...";
      this.render();
      const allConfigs = await this._getAllAutomationConfigs(automations);
      const configByEntityId = new Map();
      for (const [entityId, entity] of automations) {
        const attrId = entity.attributes?.id;
        if (attrId) {
          const found = allConfigs.find(c => c.id === attrId);
          if (found) { configByEntityId.set(entityId, found); continue; }
        }
        const friendlyName = entity.attributes?.friendly_name;
        if (friendlyName) {
          const found = allConfigs.find(c => c.alias === this._sanitize(friendlyName));
          if (found) { configByEntityId.set(entityId, found); continue; }
        }
        const slug = entityId.replace("automation.", "");
        const found = allConfigs.find(c => c.id === slug);
        if (found) { configByEntityId.set(entityId, found); }
      }

      // Enrich automationStats with config data
      this.triggerTypes.clear();
      for (const a of automationMeta) {
        const configObj = configByEntityId.get(a.id);
        const existing = this.automationStats.get(a.id);
        if (existing && configObj) {
          const parsed = this._parseAutomationConfig(configObj);
          const triggerTypesList = this._getTriggerTypes(parsed.triggers);
          existing.automationId = configObj.id || existing.automationId;
          existing.totalActions = parsed.actions.length;
          existing.conditions = parsed.conditions.length;
          existing.triggerTypes = triggerTypesList;
          existing.primaryTrigger = triggerTypesList[0] || "unknown";
          a.internalId = existing.automationId;
          triggerTypesList.forEach(type => {
            this.triggerTypes.set(type, (this.triggerTypes.get(type) || 0) + 1);
          });
        }
        a.configObj = configObj;
      }
      // Re-render with enriched config data
      this.render();

      // --- Phase 2b: Fetch traces ---
      this._loadingPhase = "Pobieranie tras wykonania...";
      this.render();
      const enabled = automationMeta.filter(a => !a.isDisabled);
      const batchSize = 15;
      // Try bulk trace fetch first (trace/list with domain=automation) - single WS call
      this._bulkTraces = await this._getAllTracesBulk();
      if (this._bulkTraces) {
        // Bulk succeeded - distribute traces to each automation
        for (const a of enabled) {
          const traces = this._bulkTraces.filter(t => t.item_id === a.internalId);
          this.automationTraces.set(a.id, traces);
          const traceAnalysis = this._analyzeTraces(traces);
          const todayTraceCount = this._countTracesToday(traces);
          const existing = this.automationStats.get(a.id);
          if (existing) {
            existing.todayCount = todayTraceCount;
            existing.traceCount = traces.length;
            if (traceAnalysis.avgTime !== "N/A") {
              existing.avgExecutionTime = traceAnalysis.avgTime;
              this.executionTimes.push(traceAnalysis.avgTime);
            }
            if (traceAnalysis.hasErrors) {
              existing.isFailed = true;
              this.failedAutomations.set(a.id, {
                name: a.name, automationId: a.internalId,
                reason: `${traceAnalysis.errorCount} b\u0142\u0105d(y) w ostatnich uruchomieniach`
              });
            }
          }
        }
      } else {
      // Fallback: per-automation trace fetch in batches
      for (let i = 0; i < enabled.length; i += batchSize) {
        const batch = enabled.slice(i, i + batchSize);
        const traceResults = await Promise.allSettled(
          batch.map(a => this._getAutomationTraces(a.internalId).then(traces => ({ ...a, traces })))
        );
        for (const r of traceResults) {
          if (r.status !== "fulfilled") continue;
          const { id, internalId, name, traces } = r.value;
          this.automationTraces.set(id, traces);
          const traceAnalysis = this._analyzeTraces(traces);
          const todayTraceCount = this._countTracesToday(traces);
          const existing = this.automationStats.get(id);
          if (existing) {
            existing.todayCount = todayTraceCount;
            existing.traceCount = traces.length;
            if (traceAnalysis.avgTime !== "N/A") {
              existing.avgExecutionTime = traceAnalysis.avgTime;
              this.executionTimes.push(traceAnalysis.avgTime);
            }
            if (traceAnalysis.hasErrors) {
              existing.isFailed = true;
              this.failedAutomations.set(id, {
                name, automationId: internalId,
                reason: `${traceAnalysis.errorCount} b\u0142\u0105d(y) w ostatnich uruchomieniach`
              });
            }
          }
        }
      }
      } // end else (fallback per-automation trace fetch)

      // --- Phase 3: Fetch history ---
      this._loadingPhase = "Pobieranie historii wykonania...";
      this.render();
      const recentActive = enabled
        .filter(a => a.lastTriggered)
        .sort((a, b) => b.lastTriggered.getTime() - a.lastTriggered.getTime())
        .slice(0, 30);
      for (let i = 0; i < recentActive.length; i += batchSize) {
        const batch = recentActive.slice(i, i + batchSize);
        const histResults = await Promise.allSettled(
          batch.map(a => this._getAutomationHistory(a.id).then(history => ({ ...a, history })))
        );
        for (const r of histResults) {
          if (r.status !== "fulfilled") continue;
          const { id, history } = r.value;
          this.automationHistory.set(id, history);
          const existing = this.automationStats.get(id);
          if (existing) {
            existing.history = history;
            if (existing.todayCount === 0) {
              existing.todayCount = this._extractTodayCount(history);
            }
            if (existing.avgExecutionTime === "N/A" && history.length > 0) {
              const durations = [];
              for (let j = 1; j < history.length; j++) {
                const prev = new Date(history[j - 1].last_changed);
                const curr = new Date(history[j].last_changed);
                const duration = curr - prev;
                if (duration < 5000 && duration > 0) durations.push(duration);
              }
              if (durations.length > 0) {
                existing.avgExecutionTime = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
                this.executionTimes.push(existing.avgExecutionTime);
              }
            }
          }
        }
      }
      this._loadingPhase = "";
      this._lastUpdated = new Date();
    } catch (err) {
      console.error("Error in updateAutomationData:", err);
    } finally {
      this._isLoading = false;
    }
  }

  getTopAutomations(count = 5) {
    const all = Array.from(this.automationStats.values()).filter(a => a.state === "on");
    // Primary sort: todayCount, secondary: traceCount, tertiary: most recently triggered
    return all.sort((a, b) => {
      if (b.todayCount !== a.todayCount) return b.todayCount - a.todayCount;
      if (b.traceCount !== a.traceCount) return b.traceCount - a.traceCount;
      const aTime = a.lastTriggered ? a.lastTriggered.getTime() : 0;
      const bTime = b.lastTriggered ? b.lastTriggered.getTime() : 0;
      return bTime - aTime;
    }).slice(0, count);
  }

  getRecentlyTriggered(count = 10) {
    return Array.from(this.automationStats.values())
      .filter(a => a.lastTriggered && a.state === "on")
      .sort((a, b) => b.lastTriggered.getTime() - a.lastTriggered.getTime())
      .slice(0, count);
  }

  getStaleAutomations(daysThreshold = 30) {
    const now = Date.now();
    return Array.from(this.automationStats.values())
      .filter(a => {
        if (a.state === "off") return false;
        if (!a.lastTriggered) return true;
        return (now - a.lastTriggered.getTime()) / (1000 * 60 * 60 * 24) > daysThreshold;
      })
      .sort((a, b) => {
        const aTime = a.lastTriggered ? a.lastTriggered.getTime() : 0;
        const bTime = b.lastTriggered ? b.lastTriggered.getTime() : 0;
        return aTime - bTime;
      }).slice(0, 10);
  }

  getExecutionDistribution() {
    const distribution = { "0-100ms": 0, "100-500ms": 0, "500-1s": 0, "1-5s": 0, "5s+": 0 };
    this.executionTimes.forEach(time => {
      if (time < 100) distribution["0-100ms"]++;
      else if (time < 500) distribution["100-500ms"]++;
      else if (time < 1000) distribution["500-1s"]++;
      else if (time < 5000) distribution["1-5s"]++;
      else distribution["5s+"]++;
    });
    return distribution;
  }

  getTriggerTypeData() {
    return Array.from(this.triggerTypes.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }

  getOptimizationData() {
    const slow = Array.from(this.automationStats.values())
      .filter(a => typeof a.avgExecutionTime === "number" && a.avgExecutionTime > 800)
      .sort((a, b) => b.avgExecutionTime - a.avgExecutionTime)
      .slice(0, 10);
    const failed = Array.from(this.failedAutomations.entries())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const disabled = this.disabledAutomations.slice(0, 15);
    const stale = this.getStaleAutomations();
    return { slow, failed, disabled, stale };
  }

  _getComputedColors() {
    const style = getComputedStyle(document.documentElement);
    return {
      primary: style.getPropertyValue("--primary-color").trim() || "#3B82F6",
      secondary: style.getPropertyValue("--secondary-text-color").trim() || "#64748b",
      error: style.getPropertyValue("--error-color").trim() || "#EF4444",
      success: style.getPropertyValue("--success-color").trim() || "#10B981",
      warning: style.getPropertyValue("--warning-color").trim() || "#F59E0B",
      textPrimary: style.getPropertyValue("--primary-text-color").trim() || "#1e293b",
      border: style.getPropertyValue("--divider-color").trim() || "#e0e0e0",
      cardBg: style.getPropertyValue("--card-background-color").trim() || "#ffffff",
      accent: style.getPropertyValue("--accent-color").trim() || "#3B82F6"
    };
  }

  _formatLastUpdated() {
    if (!this._lastUpdated) return "Nigdy";
    const diff = Date.now() - this._lastUpdated;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    if (seconds < 60) return `${seconds}s temu`;
    if (minutes < 60) return `${minutes}m temu`;
    return this._lastUpdated.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
  }

  _formatTimeSince(date) {
    if (!date) return "nigdy";
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    if (mins < 1) return "przed chwil\u0105";
    if (mins < 60) return `${mins}m temu`;
    if (hours < 24) return `${hours}h temu`;
    if (days < 7) return `${days}d temu`;
    return date.toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
  }

  _navigateToAutomation(automationId) {
    const path = `/config/automation/edit/${automationId}`;
    // Method 1: HA frontend navigate (works in dashboard cards)
    if (this._hass && typeof this._hass.navigate === "function") {
      this._hass.navigate(path);
      return;
    }
    // Method 2: Fire location-changed event (works in HA Tools panel)
    try {
      const event = new CustomEvent("location-changed", { detail: { replace: false } });
      window.history.pushState(null, "", path);
      window.dispatchEvent(event);
      return;
    } catch (e) {
      console.warn("pushState navigation failed:", e);
    }
    // Method 3: Direct URL change (last resort)
    window.location.href = path;
  }

  async _toggleAutomation(entityId, enable) {
    if (!this._hass) return;
    try {
      await this._hass.callService("automation", enable ? "turn_on" : "turn_off", {
        entity_id: entityId
      });
      // Refresh data after toggle
      setTimeout(() => this._loadAndRender(), 1000);
    } catch (e) {
      console.error("Failed to toggle automation:", e);
    }
  }

  render() {
    const styles = `
      
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
        --aa-font: var(--ha-font-family-body, var(--mdc-typography-body1-font-family, Roboto, Noto, sans-serif));
        --aa-radius: var(--bento-radius-sm);
        --aa-space-1: var(--ha-space-1, 4px);
        --aa-space-2: var(--ha-space-2, 8px);
        --aa-space-3: var(--ha-space-3, 12px);
        --aa-space-4: var(--ha-space-4, 16px);
        --aa-space-6: var(--ha-space-6, 24px);
        --aa-border: var(--bento-border);
        --aa-text: var(--bento-text);
        --aa-text2: var(--bento-text-secondary);
        --aa-bg: var(--bento-bg);
        --aa-card: var(--bento-card);
        --aa-primary: var(--bento-primary);
        --aa-success: var(--bento-success);
        --aa-warning: var(--bento-warning);
        --aa-danger: var(--bento-error);
        --aa-info: var(--info-color, var(--accent-color, #3B82F6));
        --aa-anim: var(--ha-animation-duration-normal, 250ms);
      }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      .card {
        padding: var(--aa-space-6);
        font-family: var(--aa-font);
        background: var(--bento-bg);
        color: var(--bento-text);
        min-height: 200px;
      }
      .header {
        margin-bottom: var(--aa-space-6);
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--aa-space-3);
      }
      .header-left { flex: 1; min-width: 200px; }
      h1 {
        font-size: 20px;
        font-weight: 600;
        margin-bottom: var(--aa-space-1);
        color: var(--bento-text);
      }
      .subtitle {
        font-size: 12px;
        color: var(--bento-text-secondary);
        display: flex;
        gap: var(--aa-space-2);
        align-items: center;
      }
      .loading-spinner {
        display: inline-block; width: 12px; height: 12px;
        border: 2px solid rgba(255,255,255,0.3); border-radius: 50%;
        border-top-color: white; animation: spin 0.8s linear infinite;
        margin-right: var(--aa-space-1);
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      .tabs {
        display: flex;
        gap: var(--aa-space-2);
        border-bottom: 2px solid var(--bento-border);
        margin-bottom: var(--aa-space-6);
        overflow-x: auto;
        flex-wrap: wrap;
      }
      .tab-btn {
        padding: var(--aa-space-3) var(--aa-space-4);
        border: none; background: none; cursor: pointer;
        font-size: 14px; font-weight: 500;
        font-family: var(--aa-font);
        color: var(--bento-text-secondary);
        border-bottom: 2px solid transparent;
        transition: all var(--aa-anim);
        border-radius: 4px 4px 0 0;
        white-space: nowrap;
      }
      .tab-btn.active {
        color: var(--bento-primary);
        border-bottom-color: var(--bento-primary);
        background: color-mix(in srgb, var(--bento-primary) 8%, transparent);
      }
      .tab-btn:hover {
        color: var(--bento-text);
        background: color-mix(in srgb, var(--bento-text) 4%, transparent);
      }
      .tab-content { display: none; }
      .tab-content.active { display: block; animation: fadeIn var(--aa-anim); }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      .card {
        background: var(--bento-card);
        border-radius: var(--bento-radius-sm);
        padding: var(--aa-space-4);
        border: 1px solid var(--bento-border);
        margin-bottom: var(--aa-space-4);
        box-shadow: 0 1px 3px rgba(0,0,0,0.06);
      }
      .card-title {
        font-size: 14px; font-weight: 600;
        margin-bottom: var(--aa-space-3);
        color: var(--bento-text);
      }
      .canvas-wrap { position: relative; height: 250px; margin-bottom: var(--aa-space-4); }
      canvas { width: 100% !important; }
      .stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
        gap: var(--aa-space-3);
        margin-top: var(--aa-space-4);
      }
      .stat {
        background: var(--bento-card);
        padding: var(--aa-space-3);
        border-radius: var(--bento-radius-sm);
        text-align: center;
        border: 1px solid var(--bento-border);
      }
      .stat-value { font-size: 22px; font-weight: 700; color: var(--bento-primary); }
      .stat-label { font-size: 11px; color: var(--bento-text-secondary); margin-top: 2px; }
      .health-row {
        display: flex; align-items: center; gap: var(--aa-space-3);
        margin-bottom: var(--aa-space-4);
      }
      .health-circle {
        width: 56px; height: 56px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-weight: 700; font-size: 20px; color: white; flex-shrink: 0;
      }
      .health-circle.excellent { background: var(--bento-success); }
      .health-circle.good { background: var(--bento-warning); }
      .health-circle.poor { background: var(--aa-danger); }
      .health-label { font-size: 12px; color: var(--bento-text-secondary); }
      .auto-list { display: flex; flex-direction: column; gap: 6px; }
      .auto-item {
        display: flex; align-items: center; gap: var(--aa-space-2);
        padding: 10px var(--aa-space-4);
        background: var(--bento-card);
        border: 1px solid var(--bento-border);
        border-radius: var(--bento-radius-sm);
        cursor: pointer;
        transition: all var(--aa-anim);
      }
      .auto-item:hover {
        border-color: var(--bento-primary);
        background: color-mix(in srgb, var(--bento-primary) 4%, var(--bento-card));
      }
      .auto-name {
        font-size: 13px; font-weight: 500; color: var(--bento-text);
        flex: 1; min-width: 0; overflow: hidden;
        text-overflow: ellipsis; white-space: nowrap;
      }
      .auto-meta { font-size: 11px; color: var(--bento-text-secondary); white-space: nowrap; }
      .badge {
        font-size: 11px; font-weight: 600;
        padding: 3px 8px; border-radius: 999px;
        flex-shrink: 0; white-space: nowrap;
      }
      .badge-warn { background: #fef3c7; color: #92400e; }
      .badge-error { background: #fee2e2; color: #991b1b; }
      .badge-info { background: #dbeafe; color: #1e40af; }
      .badge-ok { background: #d1fae5; color: #065f46; }
      .badge-stale { background: #f3e8ff; color: #6b21a8; }
      .auto-arrow { color: var(--bento-text-secondary); font-size: 14px; }
      .toggle-btn {
        padding: 3px 10px; border-radius: 4px; border: 1px solid var(--bento-border);
        background: var(--bento-card); color: var(--bento-primary);
        font-size: 11px; font-weight: 500; cursor: pointer;
        transition: all var(--aa-anim); flex-shrink: 0;
      }
      .toggle-btn:hover { background: var(--bento-primary); color: white; }
      .opt-summary {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
        gap: var(--aa-space-3);
        margin-bottom: var(--aa-space-6);
      }
      .opt-stat {
        padding: var(--aa-space-3);
        border-radius: var(--bento-radius-sm);
        text-align: center; border: 1px solid;
      }
      .opt-stat.warn { background: var(--aa-warn-bg, #fef3c7); border-color: var(--aa-warn-border, #fcd34d); }
      .opt-stat.error { background: var(--aa-error-bg, #fee2e2); border-color: var(--aa-error-border, #fca5a5); }
      .opt-stat.info { background: var(--aa-info-bg, #dbeafe); border-color: var(--aa-info-border, #93c5fd); }
      .opt-stat.stale { background: var(--aa-stale-bg, #f3e8ff); border-color: var(--aa-stale-border, #c4b5fd); }
      .opt-stat-value { font-size: 22px; font-weight: 700; }
      .opt-stat.warn .opt-stat-value { color: var(--aa-warn-text, #92400e); }
      .opt-stat.error .opt-stat-value { color: var(--aa-error-text, #991b1b); }
      .opt-stat.info .opt-stat-value { color: var(--aa-info-text, #1e40af); }
      .opt-stat.stale .opt-stat-value { color: var(--aa-stale-text, #6b21a8); }
      .opt-stat-label { font-size: 11px; color: var(--bento-text-secondary); margin-top: 2px; }
      .opt-section { margin-bottom: var(--aa-space-6); }
      .opt-section .card-title { margin-bottom: var(--aa-space-3); }
      .empty-state {
        text-align: center; padding: var(--aa-space-6) var(--aa-space-4);
        color: var(--bento-text-secondary); font-size: 13px;
        background: var(--bento-card); border: 1px solid var(--bento-border);
        border-radius: var(--bento-radius-sm);
      }
      .loading-state {
        text-align: center; padding: var(--aa-space-6);
        color: var(--bento-text-secondary);
      }
      .loading-state .loading-spinner {
        width: 24px; height: 24px;
        border-width: 3px; margin: 0 auto 12px;
        border-color: rgba(0,0,0,0.1); border-top-color: var(--bento-primary);
      }
      .chart-empty {
        display: flex; align-items: center; justify-content: center;
        height: 200px; color: var(--bento-text-secondary); font-size: 13px;
        border: 1px dashed var(--bento-border); border-radius: var(--bento-radius-sm);
      }
      .loading-toast {
        display: flex; align-items: center; gap: var(--aa-space-2);
        padding: var(--aa-space-2) var(--aa-space-4);
        background: color-mix(in srgb, var(--bento-primary) 10%, var(--bento-card));
        border: 1px solid color-mix(in srgb, var(--bento-primary) 30%, var(--bento-border));
        border-radius: var(--bento-radius-sm); margin-bottom: var(--aa-space-3);
        font-size: 12px; color: var(--bento-text-secondary); line-height: 1.4;
        animation: fadeIn var(--aa-anim);
      }
      .loading-toast .loading-spinner {
        border-color: color-mix(in srgb, var(--bento-primary) 20%, transparent);
        border-top-color: var(--bento-primary);
      }
      .trace-notice {
        display: flex; align-items: flex-start; gap: var(--aa-space-3);
        padding: var(--aa-space-3) var(--aa-space-4);
        background: color-mix(in srgb, var(--bento-primary) 8%, var(--bento-card));
        border: 1px solid color-mix(in srgb, var(--bento-primary) 25%, var(--bento-border));
        border-radius: var(--bento-radius-sm); margin-bottom: var(--aa-space-4);
        font-size: 13px; color: var(--bento-text); line-height: 1.5;
      }
      .trace-notice-icon { font-size: 18px; flex-shrink: 0; margin-top: 1px; }
      .trace-notice a {
        color: var(--bento-primary); text-decoration: underline;
        cursor: pointer; font-weight: 500;
      }
      .trace-notice a:hover { opacity: 0.8; }
      .trace-notice-dismiss {
        margin-left: auto; background: none; border: none;
        color: var(--bento-text-secondary); cursor: pointer; font-size: 16px;
        padding: 0 4px; line-height: 1; flex-shrink: 0;
      }
      .trace-notice-dismiss:hover { color: var(--bento-text); }
      .trace-notice-global {
        display: flex; align-items: flex-start; gap: var(--aa-space-3);
        padding: var(--aa-space-3) var(--aa-space-4);
        background: color-mix(in srgb, var(--bento-primary) 8%, var(--bento-card));
        border: 1px solid color-mix(in srgb, var(--bento-primary) 25%, var(--bento-border));
        border-radius: var(--bento-radius-sm); margin-bottom: var(--aa-space-4);
        font-size: 12px; color: var(--bento-text); line-height: 1.5;
      }
      .trace-notice-global .trace-notice-icon { font-size: 16px; flex-shrink: 0; margin-top: 1px; }
      .trace-notice-global a { color: var(--bento-primary); text-decoration: underline; cursor: pointer; font-weight: 500; }
      .trace-notice-global a:hover { opacity: 0.8; }
      .trace-notice-global .detail { color: var(--bento-text-secondary); font-size: 11px; margin-top: 2px; }
      .filter-bar {
        display: flex; flex-wrap: wrap; gap: var(--aa-space-2);
        margin-bottom: var(--aa-space-4); align-items: center;
      }
      .filter-bar input[type="text"] {
        flex: 1; min-width: 160px; padding: 7px 12px;
        border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm);
        background: var(--bento-card); color: var(--bento-text);
        font-size: 13px; font-family: var(--aa-font);
        outline: none; transition: border-color var(--aa-anim);
      }
      .filter-bar input[type="text"]:focus { border-color: var(--bento-primary); }
      .filter-bar input[type="text"]::placeholder { color: var(--bento-text-secondary); }
      .filter-bar select {
        padding: 7px 28px 7px 10px; border: 1px solid var(--bento-border);
        border-radius: var(--bento-radius-sm); background: var(--bento-card); color: var(--bento-text);
        font-size: 12px; font-family: var(--aa-font); cursor: pointer;
        appearance: none; -webkit-appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2364748b'/%3E%3C/svg%3E");
        background-repeat: no-repeat; background-position: right 8px center;
      }
      .filter-bar select:focus { border-color: var(--bento-primary); outline: none; }
      .filter-bar .sort-dir-btn {
        padding: 6px 8px; border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm);
        background: var(--bento-card); color: var(--bento-text-secondary); cursor: pointer;
        font-size: 14px; line-height: 1; transition: all var(--aa-anim);
      }
      .filter-bar .sort-dir-btn:hover { border-color: var(--bento-primary); color: var(--bento-primary); }
      .auto-list-full { display: flex; flex-direction: column; gap: 4px; max-height: 460px; overflow-y: auto; }
      .auto-list-full::-webkit-scrollbar { width: 4px; }
      .auto-list-full::-webkit-scrollbar-thumb { background: var(--bento-border); border-radius: 4px; }
      .auto-item-full {
        display: flex; align-items: center; gap: var(--aa-space-2);
        padding: 8px var(--aa-space-3);
        background: var(--bento-card); border: 1px solid var(--bento-border);
        border-radius: var(--bento-radius-sm); cursor: pointer;
        transition: all var(--aa-anim); font-size: 13px;
      }
      .auto-item-full:hover {
        border-color: var(--bento-primary);
        background: color-mix(in srgb, var(--bento-primary) 4%, var(--bento-card));
      }
      .auto-item-full .auto-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; color: var(--bento-text); }
      .auto-item-full .auto-detail { font-size: 11px; color: var(--bento-text-secondary); white-space: nowrap; min-width: 50px; text-align: right; }
      .auto-item-full .auto-state-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
      .auto-item-full .auto-state-dot.on { background: var(--bento-success); }
      .auto-item-full .auto-state-dot.off { background: var(--bento-text-secondary); opacity: 0.4; }
      .auto-item-full .auto-state-dot.error { background: var(--aa-danger); }
      .filter-results-count { font-size: 11px; color: var(--bento-text-secondary); padding: 2px 0; }
    `;

    const totalActive = Array.from(this.automationStats.values()).filter(a => a.state === "on").length;
    const stats = {
      total: this.automationStats.size,
      active: totalActive,
      disabled: this.disabledAutomations.length,
      failed: this.failedAutomations.size,
      avgTime: this.executionTimes.length > 0
        ? (this.executionTimes.reduce((a, b) => a + b, 0) / this.executionTimes.length).toFixed(0)
        : "N/A"
    };
    const healthScore = this._calculateHealthScore();
    const healthClass = healthScore >= 75 ? "excellent" : healthScore >= 50 ? "good" : "poor";
    const healthText = healthScore >= 75 ? "Doskona\u0142y" : healthScore >= 50 ? "Dobry" : "Wymaga poprawy";

    // --- OVERVIEW TAB ---
    // --- Filter and sort the full automation list ---
    const allAutos = Array.from(this.automationStats.values());
    let filteredAutos = allAutos;

    // Text filter
    if (this._filterText) {
      const q = this._filterText.toLowerCase();
      filteredAutos = filteredAutos.filter(a => a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q) || (a.primaryTrigger && a.primaryTrigger.toLowerCase().includes(q)));
    }

    // Time range filter
    if (this._timeRange !== "all") {
      const days = parseInt(this._timeRange, 10);
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      filteredAutos = filteredAutos.filter(a => a.lastTriggered && a.lastTriggered.getTime() >= cutoff);
    }

    // Sort
    const sortDir = this._sortDir === "asc" ? 1 : -1;
    filteredAutos.sort((a, b) => {
      switch (this._sortBy) {
        case "name": return sortDir * a.name.localeCompare(b.name, "pl");
        case "lastTriggered": {
          const at = a.lastTriggered ? a.lastTriggered.getTime() : 0;
          const bt = b.lastTriggered ? b.lastTriggered.getTime() : 0;
          return sortDir * (at - bt);
        }
        case "todayCount": return sortDir * ((a.todayCount || 0) - (b.todayCount || 0));
        case "avgTime": {
          const at = typeof a.avgExecutionTime === "number" ? a.avgExecutionTime : 99999;
          const bt = typeof b.avgExecutionTime === "number" ? b.avgExecutionTime : 99999;
          return sortDir * (at - bt);
        }
        case "state": return sortDir * a.state.localeCompare(b.state);
        default: return 0;
      }
    });

    let activeTabContent = '';

    // Only build content for the active tab
    if (this.currentTab === 'overview') {
      const filteredListHtml = filteredAutos.length > 0
        ? filteredAutos.map(a => {
            const stateClass = a.isFailed ? "error" : a.state === "on" ? "on" : "off";
            const timeStr = this._formatTimeSince(a.lastTriggered);
            const execStr = typeof a.avgExecutionTime === "number" ? `${a.avgExecutionTime}ms` : "";
            const countStr = a.todayCount > 0 ? `${a.todayCount}\u00d7` : "";
            return `<div class="auto-item-full" data-automation-id="${a.automationId}">
              <span class="auto-state-dot ${stateClass}"></span>
              <span class="auto-name" title="${a.name}">${a.name}</span>
              ${countStr ? `<span class="auto-detail" title="Dzisiejsze uruchomienia">${countStr}</span>` : ""}
              ${execStr ? `<span class="auto-detail" title="\u015Aredni czas">${execStr}</span>` : ""}
              <span class="auto-detail">${timeStr}</span>
            </div>`;
          }).join("")
        : `<div class="empty-state">Brak automatyzacji pasuj\u0105cych do filtr\u00f3w</div>`;

      activeTabContent = `
        <div class="health-row">
          <div class="health-circle ${healthClass}">${healthScore}</div>
          <div>
            <div class="card-title">Stan systemu automatyzacji</div>
            <div class="health-label">${healthText}</div>
          </div>
        </div>
        <div class="stats">
          <div class="stat">
            <div class="stat-value">${stats.total}</div>
            <div class="stat-label">\u0141\u0105cznie</div>
          </div>
          <div class="stat">
            <div class="stat-value">${stats.active}</div>
            <div class="stat-label">Aktywnych</div>
          </div>
          <div class="stat">
            <div class="stat-value">${stats.disabled}</div>
            <div class="stat-label">Wy\u0142\u0105czonych</div>
          </div>
          <div class="stat">
            <div class="stat-value">${stats.failed}</div>
            <div class="stat-label">B\u0142\u0119d\u00f3w</div>
          </div>
        </div>
        <div class="card" style="margin-top:var(--aa-space-4)">
          <h2 class="card-title">Automatyzacje</h2>
          <div class="filter-bar">
            <input type="text" id="aa-filter-input" placeholder="Szukaj automatyzacji\u2026" value="${this._filterText.replace(/"/g, "&quot;")}">
            <select id="aa-sort-select">
              <option value="lastTriggered" ${this._sortBy === "lastTriggered" ? "selected" : ""}>Ostatnie uruchomienie</option>
              <option value="name" ${this._sortBy === "name" ? "selected" : ""}>Nazwa</option>
              <option value="todayCount" ${this._sortBy === "todayCount" ? "selected" : ""}>Uruchomienia dzi\u015B</option>
              <option value="avgTime" ${this._sortBy === "avgTime" ? "selected" : ""}>Czas wykonania</option>
              <option value="state" ${this._sortBy === "state" ? "selected" : ""}>Stan</option>
            </select>
            <button class="sort-dir-btn" id="aa-sort-dir" title="${this._sortDir === "desc" ? "Malej\u0105co" : "Rosn\u0105co"}">${this._sortDir === "desc" ? "\u2193" : "\u2191"}</button>
            <select id="aa-time-range">
              <option value="all" ${this._timeRange === "all" ? "selected" : ""}>Ca\u0142y czas</option>
              <option value="1" ${this._timeRange === "1" ? "selected" : ""}>Dzi\u015B</option>
              <option value="7" ${this._timeRange === "7" ? "selected" : ""}>7 dni</option>
              <option value="14" ${this._timeRange === "14" ? "selected" : ""}>14 dni</option>
              <option value="30" ${this._timeRange === "30" ? "selected" : ""}>30 dni</option>
            </select>
          </div>
          <div class="filter-results-count">${filteredAutos.length} z ${allAutos.length} automatyzacji</div>
          <div class="auto-list-full">${filteredListHtml}</div>
        </div>
        <div class="card">
          <h2 class="card-title">Najaktywniejsze dzi\u015B</h2>
          <div class="canvas-wrap">
            <canvas id="top-automations-chart"></canvas>
          </div>
        </div>
      `;
    } else if (this.currentTab === 'performance') {
      const hasExecData = this.executionTimes.length > 0;
      const hasTriggerData = this.triggerTypes.size > 0;

      activeTabContent = `
        <div class="card">
          <h2 class="card-title">Rozk\u0142ad czas\u00f3w wykonania</h2>
          ${hasExecData
            ? '<div class="canvas-wrap"><canvas id="exec-dist-chart"></canvas></div>'
            : '<div class="chart-empty">Brak danych o czasach wykonania \u2014 zbyt ma\u0142o uruchomie\u0144 z pe\u0142nymi danymi</div>'}
        </div>
        <div class="card">
          <h2 class="card-title">Typy wyzwalaczy</h2>
          ${hasTriggerData
            ? '<div class="canvas-wrap"><canvas id="trigger-type-chart"></canvas></div>'
            : '<div class="chart-empty">Brak danych o wyzwalaczach \u2014 konfiguracja automatyzacji niedost\u0119pna</div>'}
        </div>
        <div class="card">
          <h2 class="card-title">Dzienne wykonania (14 dni)</h2>
          <div class="canvas-wrap"><canvas id="sparkline-chart"></canvas></div>
        </div>
        <div class="card">
          <h2 class="card-title">Statystyki</h2>
          <div class="stats">
            <div class="stat">
              <div class="stat-value">${stats.avgTime}${typeof stats.avgTime === "string" ? "" : "ms"}</div>
              <div class="stat-label">\u015Ar. czas</div>
            </div>
            <div class="stat">
              <div class="stat-value">${this.executionTimes.length}</div>
              <div class="stat-label">Z danymi o czasie</div>
            </div>
            <div class="stat">
              <div class="stat-value">${this.triggerTypes.size}</div>
              <div class="stat-label">Typ\u00f3w wyzwalaczy</div>
            </div>
          </div>
        </div>
      `;
    } else if (this.currentTab === 'optimization') {
      const optData = this.getOptimizationData();

      const slowItems = optData.slow.length > 0
        ? optData.slow.map(a => `
            <div class="auto-item" data-automation-id="${a.automationId}">
              <span class="auto-name" title="${a.name}">${a.name}</span>
              <span class="badge badge-warn">${Math.round(a.avgExecutionTime)}ms</span>
              <span class="auto-arrow">\u203A</span>
            </div>`).join("")
        : '<div class="empty-state">\u2705 Brak wolnych automatyzacji</div>';

      const failedItems = optData.failed.length > 0
        ? optData.failed.map(a => `
            <div class="auto-item" data-automation-id="${a.automationId}">
              <span class="auto-name" title="${a.name}">${a.name}</span>
              <span class="badge badge-error">${a.reason || "b\u0142\u0105d"}</span>
              <span class="auto-arrow">\u203A</span>
            </div>`).join("")
        : '<div class="empty-state">\u2705 Brak nieudanych automatyzacji</div>';

      const disabledItems = optData.disabled.length > 0
        ? optData.disabled.map(a => `
            <div class="auto-item" data-automation-id="${a.automationId}">
              <span class="auto-name" title="${a.name}">${a.name}</span>
              <span class="badge badge-info">wy\u0142\u0105czona</span>
              <button class="toggle-btn" data-entity-id="${a.id}" data-action="enable">W\u0142\u0105cz</button>
              <span class="auto-arrow">\u203A</span>
            </div>`).join("")
        : '<div class="empty-state">\u2705 Brak wy\u0142\u0105czonych automatyzacji</div>';

      const staleItems = optData.stale.length > 0
        ? optData.stale.map(a => `
            <div class="auto-item" data-automation-id="${a.automationId}">
              <span class="auto-name" title="${a.name}">${a.name}</span>
              <span class="badge badge-stale">${this._formatTimeSince(a.lastTriggered)}</span>
              <span class="auto-arrow">\u203A</span>
            </div>`).join("")
        : '<div class="empty-state">\u2705 Wszystkie automatyzacje by\u0142y ostatnio aktywne</div>';

      activeTabContent = `
        <div class="opt-summary">
          <div class="opt-stat warn">
            <div class="opt-stat-value">${optData.slow.length}</div>
            <div class="opt-stat-label">Wolnych (&gt;800ms)</div>
          </div>
          <div class="opt-stat error">
            <div class="opt-stat-value">${optData.failed.length}</div>
            <div class="opt-stat-label">Z b\u0142\u0119dami</div>
          </div>
          <div class="opt-stat info">
            <div class="opt-stat-value">${optData.disabled.length}</div>
            <div class="opt-stat-label">Wy\u0142\u0105czonych</div>
          </div>
          <div class="opt-stat stale">
            <div class="opt-stat-value">${optData.stale.length}</div>
            <div class="opt-stat-label">Nieaktywnych (&gt;30d)</div>
          </div>
        </div>
        <div class="opt-section">
          <h2 class="card-title">\u26A0\uFE0F Wolne automatyzacje (&gt;800ms)</h2>
          <div class="auto-list">${slowItems}</div>
        </div>
        <div class="opt-section">
          <h2 class="card-title">\u274C Automatyzacje z b\u0142\u0119dami</h2>
          <div class="auto-list">${failedItems}</div>
        </div>
        <div class="opt-section">
          <h2 class="card-title">\u23F8\uFE0F Wy\u0142\u0105czone automatyzacje</h2>
          <div class="auto-list">${disabledItems}</div>
        </div>
        <div class="opt-section">
          <h2 class="card-title">\uD83D\uDCA4 Nieaktywne automatyzacje (&gt;30 dni)</h2>
          <div class="auto-list">${staleItems}</div>
        </div>
      `;
    }

    const loadingContent = `
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <div>\u0141adowanie danych...</div>
      </div>
    `;

    const loadingToast = this._loadingPhase ? `
        <div class="loading-toast">
          <span class="loading-spinner"></span>
          <span>${this._loadingPhase}</span>
        </div>
      ` : "";

    // Show content even during loading (progressive rendering), with toast on top
    const hasData = this.automationStats.size > 0;
    const mainContent = (!hasData && this._isLoading)
      ? loadingContent
      : `
        ${loadingToast}
        <div class="tab-content active">${activeTabContent}</div>
      `;

    this.shadowRoot.innerHTML = `
      <style>${window.HAToolsBentoCSS || ""}
${styles}
/* === DARK MODE === */
@media (prefers-color-scheme: dark) {
  :host {
    --aa-warn-bg: rgba(245,158,11,0.15); --aa-warn-border: rgba(245,158,11,0.3); --aa-warn-text: #fbbf24;
    --aa-error-bg: rgba(239,68,68,0.15); --aa-error-border: rgba(239,68,68,0.3); --aa-error-text: #f87171;
    --aa-info-bg: rgba(59,130,246,0.15); --aa-info-border: rgba(59,130,246,0.3); --aa-info-text: #60a5fa;
    --aa-stale-bg: rgba(139,92,246,0.15); --aa-stale-border: rgba(139,92,246,0.3); --aa-stale-text: #a78bfa;
  }
  .badge-stale { background: rgba(139,92,246,0.15); color: #a78bfa; }
}

        /* === MOBILE FIX === */
        @media (max-width: 768px) {
          .tabs { flex-wrap: wrap; overflow-x: visible; gap: 2px; }
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
        <div class="header">
          <div class="header-left">
            <h1>${this.config.title}</h1>
            <p class="subtitle">
              <span>Ostatnia aktualizacja: ${this._formatLastUpdated()}</span>
              <span>\u2022</span>
              <span>${stats.total} automatyzacji</span>
            </p>
          </div>
        </div>
        ${!this._traceNoticeDismissed ? `
        <div class="trace-notice-global" id="trace-storage-notice">
          <span class="trace-notice-icon">\u{1f4a1}</span>
          <div>
            Domy\u015blnie HA przechowuje tylko <strong>5 ostatnich tras</strong> na automatyzacj\u0119.
            Trasy s\u0105 <strong>czyszczone po restarcie</strong> HA \u2014 po ponownym uruchomieniu wszystkie zapisane trace zostan\u0105 usuni\u0119te.
            Mo\u017cesz zwi\u0119kszy\u0107 limit w <a id="trace-viewer-link">Trace Viewer</a> (HA Tools \u2192 Ustawienia).
            <div class="detail">\u2139\uFE0F Aby zachowa\u0107 wi\u0119cej danych o wykonaniach, ustaw stored_traces w konfiguracji HA lub u\u017cyj sekcji ustawie\u0144 w Trace Viewer.</div>
          </div>
          <button class="trace-notice-dismiss" id="dismiss-trace-notice" title="Zamknij">\u00d7</button>
        </div>
        ` : ""}
        <div class="tabs">
          <button class="tab-btn ${this.currentTab === "overview" ? "active" : ""}" data-tab="overview">Przegl\u0105d</button>
          <button class="tab-btn ${this.currentTab === "performance" ? "active" : ""}" data-tab="performance">Wydajno\u015B\u0107</button>
          <button class="tab-btn ${this.currentTab === "optimization" ? "active" : ""}" data-tab="optimization">Optymalizacja</button>
        </div>
        ${mainContent}
      </div>
    `;

    this._setupEventListeners();
    if (!this._isLoading) {
      this._drawCharts();
    }
  }

  _setupEventListeners() {
    // Tab switching
    this.shadowRoot.querySelectorAll(".tab-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        this.currentTab = e.target.dataset.tab;
        this.render();
      });
    });

    // Click handlers for automation items (navigate to edit)
    this.shadowRoot.querySelectorAll(".auto-item").forEach(item => {
      item.addEventListener("click", (e) => {
        // Don't navigate if clicking the toggle button
        if (e.target.classList.contains("toggle-btn")) return;
        const automationId = item.dataset.automationId;
        if (automationId) this._navigateToAutomation(automationId);
      });
    });

    // Trace notice: dismiss + link
    const dismissBtn = this.shadowRoot.getElementById("dismiss-trace-notice");
    if (dismissBtn) {
      dismissBtn.addEventListener("click", () => {
        this._traceNoticeDismissed = true;
        const notice = this.shadowRoot.getElementById("trace-storage-notice");
        if (notice) notice.remove();
      });
    }
    const traceLink = this.shadowRoot.getElementById("trace-viewer-link");
    if (traceLink) {
      traceLink.addEventListener("click", () => {
        // Navigate to Trace Viewer inside HA Tools panel
        try {
          let el = this;
          while (el) {
            const root = el.getRootNode ? el.getRootNode() : null;
            el = (root && root.host) ? root.host : el.parentNode;
            if (el && el.tagName && el.tagName.toLowerCase() === "ha-tools-panel") {
              if (typeof el._loadTool === "function") {
                el._loadTool("trace-viewer", "ha-trace-viewer");
                // Also update sidebar highlight
                const navItems = el.shadowRoot ? el.shadowRoot.querySelectorAll(".nav-item") : [];
                navItems.forEach(item => {
                  if (item.dataset && item.dataset.tool === "trace-viewer") {
                    if (typeof el._setActiveNav === "function") el._setActiveNav(item);
                  }
                });
                return;
              }
            }
            if (el === document || el === window || !el) break;
          }
          // Fallback: navigate to /ha-tools
          const evt = new CustomEvent("location-changed", { detail: { replace: false } });
          window.history.pushState(null, "", "/ha-tools");
          window.dispatchEvent(evt);
        } catch (e) { window.location.href = "/ha-tools"; }
      });
    }

    // Filter, sort, time range controls
    const filterInput = this.shadowRoot.getElementById("aa-filter-input");
    if (filterInput) {
      filterInput.addEventListener("input", (e) => {
        this._filterText = e.target.value;
        this._rerenderContent();
      });
    }
    const sortSelect = this.shadowRoot.getElementById("aa-sort-select");
    if (sortSelect) {
      sortSelect.addEventListener("change", (e) => {
        this._sortBy = e.target.value;
        this._rerenderContent();
      });
    }
    const sortDirBtn = this.shadowRoot.getElementById("aa-sort-dir");
    if (sortDirBtn) {
      sortDirBtn.addEventListener("click", () => {
        this._sortDir = this._sortDir === "desc" ? "asc" : "desc";
        this._rerenderContent();
      });
    }
    const timeRange = this.shadowRoot.getElementById("aa-time-range");
    if (timeRange) {
      timeRange.addEventListener("change", (e) => {
        this._timeRange = e.target.value;
        this._rerenderContent();
      });
    }

    // Click handlers for full automation list items
    this.shadowRoot.querySelectorAll(".auto-item-full").forEach(item => {
      item.addEventListener("click", () => {
        const automationId = item.dataset.automationId;
        if (automationId) this._navigateToAutomation(automationId);
      });
    });

    // Toggle buttons for disabled automations
    this.shadowRoot.querySelectorAll(".toggle-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const entityId = btn.dataset.entityId;
        const action = btn.dataset.action;
        if (entityId) this._toggleAutomation(entityId, action === "enable");
      });
    });
  }

  _rerenderContent() {
    // Re-render without losing focus on filter input
    const hadFocus = this.shadowRoot.activeElement?.id === "aa-filter-input";
    const cursorPos = hadFocus ? this.shadowRoot.getElementById("aa-filter-input")?.selectionStart : null;
    this.render();
    if (hadFocus) {
      const input = this.shadowRoot.getElementById("aa-filter-input");
      if (input) {
        input.focus();
        if (cursorPos !== null) input.setSelectionRange(cursorPos, cursorPos);
      }
    }
  }

  async _drawCharts() {
    if (this._isLoading) return;
    if (this.currentTab === "optimization") return;
    try {
      await this._loadChartJS();
      if (this.currentTab === "overview") {
        this._drawTopAutomationsChart();
      } else if (this.currentTab === "performance") {
        if (this.executionTimes.length > 0) this._drawExecDistChart();
        if (this.triggerTypes.size > 0) this._drawTriggerTypeChart();
        this._drawSparklineChart();
      }
    } catch (e) {
      console.error("Failed to draw charts:", e);
    }
  }

  _destroyChart(key) {
    if (this._charts[key]) {
      this._charts[key].destroy();
      delete this._charts[key];
    }
  }

  _drawTopAutomationsChart() {
    const canvas = this.shadowRoot.getElementById("top-automations-chart");
    if (!canvas || !window.Chart) return;
    this._destroyChart("top-auto");

    const data = this.getTopAutomations(5);
    if (data.length === 0) return;

    // Show trace count if no today data
    const hasToday = data.some(a => a.todayCount > 0);
    const labels = data.map(a => a.name.length > 35 ? a.name.substring(0, 33) + "\u2026" : a.name);
    const values = hasToday ? data.map(a => a.todayCount) : data.map(a => a.traceCount);
    const chartLabel = hasToday ? "Dzi\u015B" : "Ostatnie uruchomienia";

    const colors = this._getComputedColors();
    this._charts["top-auto"] = new window.Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: chartLabel,
          data: values,
          backgroundColor: colors.primary,
          borderWidth: 0,
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(30,41,59,0.9)",
            titleColor: "#fff", bodyColor: "#fff",
            padding: 8, displayColors: false,
            callbacks: {
              title: (ctx) => data[ctx[0].dataIndex]?.name || "",
              label: (ctx) => `${chartLabel}: ${ctx.parsed.x}`
            }
          }
        },
        scales: {
          x: { display: true, beginAtZero: true, ticks: { color: colors.secondary, font: { size: 11 } }, grid: { display: false }, border: { display: false } },
          y: { display: true, ticks: { color: colors.secondary, font: { size: 12 } }, grid: { display: false }, border: { display: false } }
        }
      }
    });
  }

  _drawExecDistChart() {
    const canvas = this.shadowRoot.getElementById("exec-dist-chart");
    if (!canvas || !window.Chart) return;
    this._destroyChart("exec-dist");

    const distribution = this.getExecutionDistribution();
    const colors = this._getComputedColors();
    const barColors = ["#10B981", "#3B82F6", "#F59E0B", "#EF4444", "#991b1b"];

    this._charts["exec-dist"] = new window.Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: Object.keys(distribution),
        datasets: [{
          label: "Automatyzacje",
          data: Object.values(distribution),
          backgroundColor: barColors,
          borderWidth: 0,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: "rgba(30,41,59,0.9)", titleColor: "#fff", bodyColor: "#fff", padding: 8, displayColors: false }
        },
        scales: {
          y: { display: true, beginAtZero: true, ticks: { color: colors.secondary, font: { size: 11 }, stepSize: 1 }, grid: { color: "rgba(0,0,0,0.05)" }, border: { display: false } },
          x: { display: true, ticks: { color: colors.secondary, font: { size: 11 } }, grid: { display: false }, border: { display: false } }
        }
      }
    });
  }

  _drawTriggerTypeChart() {
    const canvas = this.shadowRoot.getElementById("trigger-type-chart");
    if (!canvas || !window.Chart) return;
    this._destroyChart("trigger-type");

    const data = this.getTriggerTypeData();
    if (data.length === 0) return;

    const palette = ["#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#EC4899","#0EA5E9","#14B8A6","#F97316"];
    const colors = this._getComputedColors();

    this._charts["trigger-type"] = new window.Chart(canvas.getContext("2d"), {
      type: "doughnut",
      data: {
        labels: data.map(d => d.type),
        datasets: [{
          data: data.map(d => d.count),
          backgroundColor: palette.slice(0, data.length),
          borderColor: colors.cardBg,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { color: colors.secondary, font: { size: 11 }, padding: 12, usePointStyle: true } },
          tooltip: { backgroundColor: "rgba(30,41,59,0.9)", titleColor: "#fff", bodyColor: "#fff", padding: 8, callbacks: { label: (ctx) => `${ctx.label}: ${ctx.parsed}` } }
        }
      }
    });
  }

  _drawSparklineChart() {
    const canvas = this.shadowRoot.getElementById("sparkline-chart");
    if (!canvas || !window.Chart) return;
    this._destroyChart("sparkline");

    const now = new Date();
    const dailyData = [];

    // Build 14-day data from traces + history
    for (let i = 13; i >= 0; i--) {
      const day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      let dayCount = 0;

      // Count from traces
      this.automationTraces.forEach(traces => {
        dayCount += traces.filter(t => {
          const raw = (t.timestamp && typeof t.timestamp === "object") ? t.timestamp.start : t.timestamp;
          if (!raw) return false;
          const ts = new Date(raw);
          return ts >= dayStart && ts < dayEnd;
        }).length;
      });

      // If no trace data, try history
      if (dayCount === 0) {
        this.automationHistory.forEach(history => {
          dayCount += history.filter(event => {
            const eventTime = new Date(event.last_changed);
            return eventTime >= dayStart && eventTime < dayEnd && event.state === "on";
          }).length;
        });
      }
      dailyData.push(dayCount);
    }

    const labels = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(now.getTime() - (13 - i) * 24 * 60 * 60 * 1000);
      return `${d.getDate()}.${d.getMonth() + 1}`;
    });

    const colors = this._getComputedColors();
    this._charts["sparkline"] = new window.Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Dzienne wykonania",
          data: dailyData,
          borderColor: colors.primary,
          backgroundColor: colors.primary + "18",
          borderWidth: 2,
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          pointBackgroundColor: colors.primary,
          pointBorderColor: colors.cardBg,
          pointBorderWidth: 2,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: "rgba(30,41,59,0.9)", titleColor: "#fff", bodyColor: "#fff", padding: 8, displayColors: false }
        },
        scales: {
          y: { display: true, beginAtZero: true, ticks: { color: colors.secondary, font: { size: 11 }, stepSize: 1 }, grid: { color: "rgba(0,0,0,0.04)" }, border: { display: false } },
          x: { display: true, ticks: { color: colors.secondary, font: { size: 10 } }, grid: { display: false }, border: { display: false } }
        }
      }
    });
  }

  static getConfigElement() {
    return document.createElement("ha-automation-analyzer-editor");
  }

  getCardSize() {
    return 8;
  }

  static getStubConfig() {
    return {
      type: "custom:ha-automation-analyzer",
      title: "Automation Analyzer",
      show_disabled: true
    };
  }
}

customElements.define("ha-automation-analyzer", HAAutomationAnalyzer);

window.customCards = window.customCards || [];
window.customCards.push({ type: 'ha-automation-analyzer', name: 'Automation Analyzer', description: 'Analyze automation performance, find issues and optimize', preview: false });

class HaAutomationAnalyzerEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
  }
  setConfig(config) {
    this._config = { ...config };
    // Load persisted UI state
    try {
      const _saved = localStorage.getItem('ha-automation-analyzer-settings');
      if (_saved) {
        const _s = JSON.parse(_saved);
        if (_s._activeTab) this._activeTab = _s._activeTab;
      }
    } catch(e) {}
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
      <h3>Automation Analyzer</h3>
            <div style="margin-bottom:12px;">
              <label style="display:block;font-weight:500;margin-bottom:4px;font-size:13px;">Title</label>
              <input type="text" id="cf_title" value="${this._config?.title || 'Automation Analyzer'}"
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
if (!customElements.get('ha-automation-analyzer-editor')) { customElements.define('ha-automation-analyzer-editor', HaAutomationAnalyzerEditor); }
