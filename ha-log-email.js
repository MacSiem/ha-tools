/**
 * HA Log Email Card v1.0
 * Send periodic email summaries of HA errors and warnings.
 * Part of HA Tools Panel — Smart Reports
 * Author: Jeff (AI) for MacSiem
 */

class HALogEmail extends HTMLElement {
  constructor() {
    super();
    this._lang = (navigator.language || '').startsWith('pl') ? 'pl' : 'en';
    this.attachShadow({ mode: 'open' });
    this._hass = null;
    this._config = {};
    this._activeTab = 'overview';
    this._logData = null;
    this._logHistory = [];
    try { const saved = sessionStorage.getItem('ha-log-email-history'); if (saved) this._logHistory = JSON.parse(saved); } catch(e) {}
    this._maxHistory = 24;
    this._loading = false;
    this._firstRender = false;
    this._lastFetch = 0;
    this._sendStatus = null;
  }

  set hass(hass) {

    if (hass?.language) this._lang = hass.language.startsWith('pl') ? 'pl' : 'en';    this._hass = hass;
    if (!hass) return;
    if (!this._firstRender) {
      this._firstRender = true;
      this._fetchLogData();
      this._render();
    }
  }

  setConfig(config) {
    this._config = {
      title: config.title || 'Log Email Summary',
      email_recipient: config.email_recipient || '',
      show_errors: config.show_errors !== false,
      show_warnings: config.show_warnings !== false,
      max_entries: config.max_entries || 50,
      ...config
    };
  }

  getCardSize() { return 5; }

  static getStubConfig() {
    return {
      type: 'custom:ha-log-email',
      title: 'Log Email Summary',
      email_recipient: 'your@email.com'
    };
  }

  async _fetchLogData() {
    if (!this._hass) return;
    this._loading = true;
    this._render();
    try {
      const logs = await this._hass.callWS({ type: 'system_log/list' });
      if (Array.isArray(logs)) {
        const now = Date.now();
        const h24 = 24 * 60 * 60 * 1000;
        const recent = logs.filter(e => {
          const ts = e.timestamp ? e.timestamp * 1000 : 0;
          return (now - ts) < h24;
        });
        const errors = recent.filter(e => e.level === 'ERROR' || e.level === 'CRITICAL');
        const warnings = recent.filter(e => e.level === 'WARNING');
        const mapEntry = function(e) {
          return {
            message: Array.isArray(e.message) ? e.message.join(' ') : String(e.message || ''),
            domain: e.name || (Array.isArray(e.source) ? e.source[0] : 'unknown'),
            when: e.timestamp ? new Date(e.timestamp * 1000).toISOString() : '',
            count: e.count || 1,
            level: e.level
          };
        };
        this._logData = {
          errors: errors.slice(0, this._config.max_entries).map(mapEntry),
          warnings: warnings.slice(0, this._config.max_entries).map(mapEntry),
          total: recent.length,
          allLogs: logs.length,
          fetchedAt: new Date().toISOString()
        };
      }
    } catch (err) {
      console.warn('[ha-log-email] system_log/list failed:', err);
      this._logData = this._getLogFromSensor();
    }
    this._loading = false;
    this._lastFetch = Date.now();
    // D2: Save snapshot to history
    if (this._logData && this._logData.errors) {
      const snapshot = { ts: new Date().toISOString(), errors: this._logData.errors.length, warnings: this._logData.warnings.length, total: this._logData.total };
      this._logHistory.unshift(snapshot);
      if (this._logHistory.length > this._maxHistory) this._logHistory.pop();
      try { sessionStorage.setItem('ha-log-email-history', JSON.stringify(this._logHistory)); } catch(e) {}
    }
    this._render();
  }

    _getLogFromSensor() {
    if (!this._hass) return null;
    const sensor = this._hass.states['sensor.ha_log_summary'];
    if (!sensor) return {
      errors: [],
      warnings: [],
      total: 0,
      note: 'Sensor sensor.ha_log_summary not found. Install log_email.yaml package.',
      fetchedAt: new Date().toISOString()
    };
    const attrs = sensor.attributes || {};
    return {
      errors: attrs.errors || [],
      warnings: attrs.warnings || [],
      total: attrs.total || 0,
      lastUpdated: sensor.last_updated,
      fetchedAt: new Date().toISOString()
    };
  }

  // ── SMTP Detection & Verification ────────────────────────────────
  _detectSmtp() {
    if (!this._hass) return { found: false, services: [] };
    const notifyServices = this._hass.services?.notify || {};
    const emailServices = Object.keys(notifyServices).filter(s =>
      s.includes('email') || s.includes('smtp') || s.includes('mail') || s.includes('gmail') || s.includes('outlook')
    );
    return {
      found: emailServices.length > 0,
      services: emailServices,
      defaultService: emailServices.find(s => s === 'email_report') || emailServices[0] || null
    };
  }

  async _testSmtp(service) {
    if (!this._hass || !service) return;
    this._smtpTesting = true;
    this._update();
    try {
      await this._hass.callService('notify', service, {
        title: '\u2705 HA Tools Panel \u2014 SMTP Test (Log Email)',
        message: 'SMTP jest poprawnie skonfigurowany.\nTestowy email z Log Email.\nCzas: ' + new Date().toLocaleString('pl-PL')
      });
      this._smtpStatus = { ok: true, service, time: new Date().toLocaleTimeString('pl-PL') };
    } catch (e) {
      this._smtpStatus = { ok: false, service, error: e.message || 'Unknown error' };
    }
    this._smtpTesting = false;
    this._update();
  }

  _renderSmtpSection() {
    const smtp = this._detectSmtp();
    if (smtp.found) {
      const statusBadge = this._smtpStatus
        ? (this._smtpStatus.ok
          ? '<span class="badge-ok">\u2705 Test OK (' + this._smtpStatus.time + ')</span>'
          : '<span class="badge-er">\u274C ' + this._smtpStatus.error + '</span>')
        : '';
      return '<div class="smtp-section">' +
        '<div class="smtp-header">' +
          '<span class="smtp-icon">\u2709\uFE0F</span>' +
          '<div>' +
            '<div class="smtp-title">SMTP skonfigurowany</div>' +
            '<div class="smtp-sub">Serwis: <code>notify.' + smtp.defaultService + '</code>' +
            (smtp.services.length > 1 ? ' (+ ' + (smtp.services.length - 1) + ' wi\u0119cej)' : '') + '</div>' +
          '</div>' +
          '<span class="badge-ok" style="margin-left:auto">\u2705</span>' +
        '</div>' +
        '<div class="smtp-actions">' +
          '<button class="send-btn" id="btn-smtp-test" style="width:auto;padding:8px 16px" ' + (this._smtpTesting ? 'disabled' : '') + '>' +
            (this._smtpTesting ? '\u23F3 Wysy\u0142am...' : '\u{1F4E8} Wy\u015Blij test') +
          '</button>' +
          statusBadge +
        '</div>' +
      '</div>';
    }
    return '<div class="smtp-section smtp-missing">' +
      '<div class="smtp-header">' +
        '<span class="smtp-icon">\u26A0\uFE0F</span>' +
        '<div>' +
          '<div class="smtp-title">SMTP nie skonfigurowany</div>' +
          '<div class="smtp-sub">Wysy\u0142anie email\u00F3w nie b\u0119dzie dzia\u0142a\u0107 bez integracji SMTP</div>' +
        '</div>' +
        '<span class="badge-er" style="margin-left:auto">\u274C</span>' +
      '</div>' +
      '<div class="smtp-guide">' +
        '<p><strong>\u{1F4D6} Jak skonfigurowa\u0107?</strong></p>' +
        '<p>Dodaj do <code>configuration.yaml</code>:</p>' +
        '<pre style="background:#1e293b;color:#e2e8f0;padding:12px;border-radius:8px;font-size:12px;overflow-x:auto;line-height:1.6;white-space:pre;margin:8px 0">notify:\n  - name: email_report\n    platform: smtp\n    server: smtp.gmail.com\n    port: 587\n    encryption: starttls\n    username: twoj@gmail.com\n    password: !secret gmail_app_password\n    sender: twoj@gmail.com\n    recipient: odbiorca@email.com</pre>' +
        '<p>Dla Gmail: wygeneruj <b>App Password</b> na <a href="https://myaccount.google.com/apppasswords" target="_blank" style="color:#3b82f6">myaccount.google.com/apppasswords</a></p>' +
        '<p>Inne serwery: Outlook (<code>smtp.office365.com:587</code>), WP (<code>smtp.wp.pl:465</code>), Onet (<code>smtp.poczta.onet.pl:465</code>)</p>' +
        '<p>Po konfiguracji zrestartuj HA.</p>' +
      '</div>' +
    '</div>';
  }
  async _sendEmailNow(period) {
    if (!this._hass) return;
    const smtp = this._detectSmtp();
    if (!smtp.found || !smtp.defaultService) {
      this._sendStatus = { status: 'error', period, error: 'SMTP nie skonfigurowany. Przejdz do zakladki SMTP i skonfiguruj usluge notify (np. notify.smtp_gmail). Szczegoly w dokumentacji HA: https://www.home-assistant.io/integrations/smtp/' };
      this._render(); return;
    }
    this._sendStatus = { status: 'sending', period };
    this._render();
    try {
      const data = this._logData;
      const errors = data ? (data.errors || []) : [];
      const warnings = data ? (data.warnings || []) : [];
      const now = new Date().toLocaleString('pl-PL');
      const subject = period === 'daily'
        ? 'HA Log - Raport dzienny (' + now + ')'
        : 'HA Log - Raport tygodniowy (' + now + ')';
      var body = '<h2>' + subject + '</h2>';
      body += '<p>Errors: <strong>' + errors.length + '</strong> | Warnings: <strong>' + warnings.length + '</strong></p>';
      if (errors.length > 0) {
        body += '<h3 style="color:#ef4444">Errors</h3><ul>';
        errors.forEach(function(e) { body += '<li><b>' + (e.domain||'') + '</b>: ' + (e.message||'').substring(0,200) + ' (x' + (e.count||1) + ')</li>'; });
        body += '</ul>';
      }
      if (warnings.length > 0) {
        body += '<h3 style="color:#f59e0b">Warnings</h3><ul>';
        warnings.forEach(function(e) { body += '<li><b>' + (e.domain||'') + '</b>: ' + (e.message||'').substring(0,200) + ' (x' + (e.count||1) + ')</li>'; });
        body += '</ul>';
      }
      if (errors.length === 0 && warnings.length === 0) body += '<p style="color:#10b981">System czysty.</p>';
      body += '<hr><p style="font-size:11px;color:#999">HA Tools Log Email</p>';
      await this._hass.callService('notify', smtp.defaultService, { title: subject, message: body, data: { html: body } });
      this._sendStatus = { status: 'success', period, time: new Date().toLocaleTimeString('pl-PL') };
    } catch (err) {
      this._sendStatus = { status: 'error', period, error: (err.message || 'Unknown error') + ' — Sprawdz konfiguracje SMTP w configuration.yaml i przetestuj usluge notify w Narzedzia deweloperskie > Uslugi.' };
    }
    this._render();
  }

    _getScheduleState(entityId) {
    if (!this._hass || !this._hass.states[entityId]) return 'unknown';
    return this._hass.states[entityId].state;
  }

  async _toggleAutomation(entityId) {
    if (!this._hass) return;
    try {
      const state = this._getScheduleState(entityId);
      await this._hass.callService('automation',
        state === 'on' ? 'turn_off' : 'turn_on',
        { entity_id: entityId }
      );
      setTimeout(() => this._render(), 500);
    } catch (e) {
      console.error('[ha-log-email] Toggle automation failed:', e);
    }
  }

  _buildEmailPreview() {
    const data = this._logData;
    if (!data) return '<p style="color:var(--bento-text-secondary)">No log data loaded yet. Click refresh.</p>';

    const errors = data.errors || [];
    const warnings = data.warnings || [];
    const date = new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' });

    return `
      <div style="font-family:Arial,sans-serif;background:#1a1a2e;color:#e2e8f0;padding:16px;border-radius:8px;font-size:13px;max-height:300px;overflow-y:auto">
        <h3 style="margin:0 0 8px;color:#3b82f6">\uD83D\uDEA8 Home Assistant Log Summary</h3>
        <p style="margin:0 0 8px;color:#94a3b8">Generated: ${date}</p>
        
        <div style="margin-bottom:12px">
          <h4 style="color:#ef4444;margin:0 0 6px">\u274C Errors (${errors.length})</h4>
          ${errors.length === 0 ? '<p style="color:#10b981">\u2705 No errors in last 24h</p>' :
            errors.slice(0, 10).map(e => `
              <div style="background:#2d1b1b;border-left:3px solid #ef4444;padding:6px 8px;margin-bottom:4px;border-radius:0 4px 4px 0">
                <span style="color:#94a3b8;font-size:11px">${e.when ? new Date(e.when).toLocaleTimeString('pl-PL') : ''}</span>
                ${e.domain ? `<span style="color:#f87171;font-size:11px"> [${e.domain}]</span>` : ''}
                <div style="margin-top:2px">${(e.message || '').substring(0, 120)}${(e.message || '').length > 120 ? '...' : ''}</div>
              </div>
            `).join('') + (errors.length > 10 ? `<p style="color:#94a3b8;font-size:11px">...and ${errors.length - 10} more</p>` : '')
          }
        </div>
        
        <div>
          <h4 style="color:#f59e0b;margin:0 0 6px">\u26A0\uFE0F Warnings (${warnings.length})</h4>
          ${warnings.length === 0 ? '<p style="color:#10b981">\u2705 No warnings in last 24h</p>' :
            warnings.slice(0, 10).map(e => `
              <div style="background:#2d2410;border-left:3px solid #f59e0b;padding:6px 8px;margin-bottom:4px;border-radius:0 4px 4px 0">
                <span style="color:#94a3b8;font-size:11px">${e.when ? new Date(e.when).toLocaleTimeString('pl-PL') : ''}</span>
                ${e.domain ? `<span style="color:#fbbf24;font-size:11px"> [${e.domain}]</span>` : ''}
                <div style="margin-top:2px">${(e.message || '').substring(0, 120)}${(e.message || '').length > 120 ? '...' : ''}</div>
              </div>
            `).join('') + (warnings.length > 10 ? `<p style="color:#94a3b8;font-size:11px">...and ${warnings.length - 10} more</p>` : '')
          }
        </div>
      </div>
    `;
  }

  _render() {
    const data = this._logData;
    const errors = data ? (data.errors || []) : [];
    const warnings = data ? (data.warnings || []) : [];
    const totalErrors = errors.length;
    const totalWarnings = warnings.length;
    const statusColor = totalErrors > 0 ? '#ef4444' : totalWarnings > 5 ? '#f59e0b' : '#10b981';
    const statusLabel = totalErrors > 0 ? `${totalErrors} error${totalErrors > 1 ? 's' : ''}` :
                        totalWarnings > 0 ? `${totalWarnings} warning${totalWarnings > 1 ? 's' : ''}` : 'Clean';

    const dailyAuto = 'unavailable';
    const weeklyAuto = 'unavailable';

    const tabs = [
      { id: 'overview', label: 'Overview', icon: '\uD83D\uDCCA' },
      { id: 'schedule', label: 'Schedule', icon: '\uD83D\uDCC5' },
      { id: 'preview', label: 'Preview', icon: '\uD83D\uDC41\uFE0F' },
      { id: 'send', label: 'Send Now', icon: '\uD83D\uDCE7' },
      { id: 'history', label: 'History', icon: '\uD83D\uDCDC' }
    ];

    const sendStatusHTML = this._sendStatus ? (() => {
      const s = this._sendStatus;
      if (s.status === 'sending') return `<div class="send-status sending">\u23F3 Sending ${s.period} log email...</div>`;
      if (s.status === 'success') return `<div class="send-status success">\u2705 ${s.period} log email sent at ${s.time}</div>`;
      if (s.status === 'error') return `<div class="send-status error">\u274C Send failed: ${s.error}</div>`;
      return '';
    })() : '';

    const smtpHtml = this._renderSmtpSection();
    let tabContent = '';

    if (this._activeTab === 'overview') {
      tabContent = `
        <div class="overview-grid">
          <div class="stat-card ${totalErrors > 0 ? 'stat-error' : 'stat-ok'}">
            <div class="stat-icon">\u274C</div>
            <div class="stat-value">${totalErrors}</div>
            <div class="stat-label">Errors (24h)</div>
          </div>
          <div class="stat-card ${totalWarnings > 5 ? 'stat-warn' : 'stat-ok'}">
            <div class="stat-icon">\u26A0\uFE0F</div>
            <div class="stat-value">${totalWarnings}</div>
            <div class="stat-label">Warnings (24h)</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">\uD83D\uDCDD</div>
            <div class="stat-value">${data ? (data.total || totalErrors + totalWarnings) : '—'}</div>
            <div class="stat-label">Total entries</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">\uD83D\uDFE2</div>
            <div class="stat-value" style="color:${statusColor}">${statusLabel}</div>
            <div class="stat-label">Status</div>
          </div>
        </div>

        <div class="section-header">
          <span>Recent Errors</span>
          <button class="refresh-btn" id="btn-refresh">\uD83D\uDD04 Refresh</button>
        </div>
        ${this._loading ? '<div class="loading-bar"></div>' : ''}
        ${errors.length === 0 && !this._loading ?
          '<div class="empty-state">\u2705 No errors found in logbook for last 24h</div>' :
          errors.slice(0, 5).map(e => `
            <div class="log-entry error-entry">
              <span class="log-time">${e.when ? new Date(e.when).toLocaleTimeString('pl-PL') : 'unknown'}</span>
              <span class="log-domain error-domain">${e.domain || 'unknown'}</span>
              <span class="log-msg">${(e.message || '').substring(0, 100)}${(e.message || '').length > 100 ? '…' : ''}</span>
            </div>
          `).join('')
        }

        <div class="section-header" style="margin-top:12px">Recent Warnings</div>
        ${warnings.length === 0 && !this._loading ?
          '<div class="empty-state">\u2705 No warnings found in last 24h</div>' :
          warnings.slice(0, 3).map(e => `
            <div class="log-entry warn-entry">
              <span class="log-time">${e.when ? new Date(e.when).toLocaleTimeString('pl-PL') : 'unknown'}</span>
              <span class="log-domain warn-domain">${e.domain || 'unknown'}</span>
              <span class="log-msg">${(e.message || '').substring(0, 100)}${(e.message || '').length > 100 ? '…' : ''}</span>
            </div>
          `).join('')
        }

        ${data && data.fetchedAt ? `<div class="last-updated">Last fetched: ${new Date(data.fetchedAt).toLocaleTimeString('pl-PL')}</div>` : ''}
        ${data && data.note ? `<div class="info-note">\u2139\uFE0F ${data.note}</div>` : ''}
      `;
    } else if (this._activeTab === 'schedule') {
      tabContent = `
        <div class="schedule-grid">
          <div class="schedule-card">
            <div class="schedule-title">\uD83D\uDDD3\uFE0F Daily Report</div>
            <div class="schedule-desc">Every day at 07:00 — errors + warnings summary</div>
            <div class="schedule-row">
              <span class="schedule-status ${dailyAuto === 'on' ? 'status-on' : 'status-off'}">
                ${dailyAuto === 'on' ? '\uD83D\uDFE2 Active' : '\u26AB Disabled'}
              </span>
              <button class="toggle-btn" id="btn-daily-toggle">
                ${dailyAuto === 'on' ? 'Disable' : 'Enable'}
              </button>
            </div>
          </div>

          <div class="schedule-card">
            <div class="schedule-title">\uD83D\uDCC6 Weekly Report</div>
            <div class="schedule-desc">Every Monday at 07:30 — full week log digest</div>
            <div class="schedule-row">
              <span class="schedule-status ${weeklyAuto === 'on' ? 'status-on' : 'status-off'}">
                ${weeklyAuto === 'on' ? '\uD83D\uDFE2 Active' : '\u26AB Disabled'}
              </span>
              <button class="toggle-btn" id="btn-weekly-toggle">
                ${weeklyAuto === 'on' ? 'Disable' : 'Enable'}
              </button>
            </div>
          </div>
        </div>

        <div class="section-header">Recipient</div>
        <div class="info-card">
          <span>\uD83D\uDCE7 ${this._config.email_recipient}</span>
        </div>

        <div class="section-header">Setup Instructions</div>
        <div class="info-card setup-steps">
          <p>\uD83D\uDCCC Add to your HA <code>configuration.yaml</code>:</p>
          <pre>homeassistant:
  packages: !include_dir_named packages</pre>
          <p>\uD83D\uDCCC Copy <code>log_email.yaml</code> to your <code>packages/</code> folder</p>
          <p>\uD83D\uDCCC Restart Home Assistant</p>
          <p>\uD83D\uDCCC Go to <b>Send Now</b> tab to test</p>
        </div>
      `;
    } else if (this._activeTab === 'preview') {
      tabContent = `
        <div class="section-header">
          <span>Email Preview</span>
          <button class="refresh-btn" id="btn-refresh-preview">\uD83D\uDD04 Refresh Data</button>
        </div>
        ${this._loading ? '<div class="loading-bar"></div>' : ''}
        ${this._buildEmailPreview()}
        ${data ? `<div class="last-updated">Based on data from: ${new Date(data.fetchedAt).toLocaleTimeString('pl-PL')}</div>` : ''}
      `;
    } else if (this._activeTab === 'send') {
      tabContent = `
        <div class="send-grid">
          <div class="send-card">
            <div class="send-icon">\uD83D\uDCC5</div>
            <div class="send-title">Daily Summary</div>
            <div class="send-desc">Errors + warnings from last 24 hours</div>
            <div class="send-counts">
              <span class="count-badge error-badge">${totalErrors} errors</span>
              <span class="count-badge warn-badge">${totalWarnings} warnings</span>
            </div>
            <button class="send-btn" id="btn-send-daily">Send Daily Email</button>
          </div>
          <div class="send-card">
            <div class="send-icon">\uD83D\uDCC6</div>
            <div class="send-title">Weekly Digest</div>
            <div class="send-desc">Full week log summary</div>
            <div class="send-counts">
              <span class="count-badge info-badge">7 days</span>
            </div>
            <button class="send-btn" id="btn-send-weekly">Send Weekly Email</button>
          </div>
        </div>
        ${sendStatusHTML}
        <div class="section-header" style="margin-top:16px">Recipient</div>
        <div class="info-card">\uD83D\uDCE7 ${this._config.email_recipient}</div>
        <div class="info-note" style="margin-top:8px">
          \u2139\uFE0F Wysy\u0142a email bezpo\u015Brednio przez wykryty serwis SMTP (notify). Nie wymaga osobnych automatyzacji.
        </div>

        <div class="section-header" style="margin-top:20px">Instant Error Notification</div>
        <div class="info-card" style="padding:16px">
          <p style="margin:0 0 8px 0;font-weight:600;font-size:13px">Automatyczne powiadomienia przy nowym bledzie</p>
          <p style="margin:0 0 12px 0;font-size:12px;color:var(--text2)">
            Skopiuj ponizszq automatyzacje do <code>automations.yaml</code> aby otrzymywac natychmiastowy email/powiadomienie przy kazdym nowym ERROR w system_log.
          </p>
          <details style="margin-top:8px">
            <summary style="cursor:pointer;font-weight:600;font-size:12px;color:var(--primary)">Pokaz YAML automatyzacji</summary>
            <pre style="background:#1e293b;color:#e2e8f0;padding:12px;border-radius:8px;font-size:11px;overflow-x:auto;line-height:1.5;margin-top:8px">alias: "Log Email - Instant Error Alert"
description: "Wyslij powiadomienie przy nowym bledzie w system_log"
trigger:
  - platform: event
    event_type: system_log_event
    event_data:
      level: ERROR
condition:
  - condition: template
    value_template: >
      {{ (as_timestamp(now()) - as_timestamp(
        state_attr('automation.log_email_instant_error_alert','last_triggered')
        | default(0))) > 300 }}
action:
  - service: persistent_notification.create
    data:
      title: "HA Error Detected"
      message: "{{ trigger.event.data.message[:200] }}"
      notification_id: "log_error_{{ now().timestamp()|int }}"
mode: queued
max: 3</pre>
          </details>
        </div>
      `;
    }

    if (this._activeTab === 'history') {
      tabContent = this._renderHistory();
    }

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          --bg: var(--primary-background-color, #F8FAFC); --card: var(--card-background-color, #FFFFFF); --border: var(--divider-color, #E2E8F0);
          --text: var(--primary-text-color, #1E293B); --text2: var(--secondary-text-color, #64748B); --text3: var(--disabled-text-color, #94A3B8);
          --primary: #3B82F6; --success: #10B981; --error: #EF4444;
          --warning: #F59E0B; --radius: 12px; --radius-sm: 8px;
          display: block; font-family: Inter, sans-serif;
          color-scheme: light dark;
        }
        @media (prefers-color-scheme: dark) {
          :host {
            --bg: #0f172a; --card: #1e293b; --border: #334155;
            --text: #f1f5f9; --text2: #94a3b8; --text3: #64748b;
          }
        }
        * { box-sizing: border-box; }
        .card { background: var(--card); border-radius: var(--radius); overflow: hidden; }
        .header { padding: 16px 20px 0; display: flex; align-items: center; gap: 10px; }
        .header-icon { font-size: 22px; }
        .header-title { font-size: 16px; font-weight: 700; color: var(--text); }
        .header-badge { margin-left: auto; background: var(--border); color: var(--text2); font-size: 11px; padding: 3px 8px; border-radius: 20px; font-weight: 500; }
        .tabs { display: flex; border-bottom: 1px solid var(--border); margin-top: 12px; }
        .tab { flex: 1; padding: 10px 4px; font-size: 12px; font-weight: 600; text-align: center; cursor: pointer; color: var(--text2); border: none; background: none; transition: all .2s; }
        .tab:hover { color: var(--primary); }
        .tab.active { color: var(--primary); border-bottom: 2px solid var(--primary); margin-bottom: -1px; }
        .content { padding: 16px; }

        .overview-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
        .stat-card { background: var(--bg); border-radius: var(--radius-sm); padding: 14px; text-align: center; border: 1px solid var(--border); }
        .stat-card.stat-error { border-color: #ef444440; background: #ef444408; }
        .stat-card.stat-warn { border-color: #f59e0b40; background: #f59e0b08; }
        .stat-card.stat-ok { border-color: #10b98140; background: #10b98108; }
        .stat-icon { font-size: 20px; margin-bottom: 4px; }
        .stat-value { font-size: 22px; font-weight: 700; color: var(--text); }
        .stat-label { font-size: 11px; color: var(--text2); margin-top: 2px; }

        .section-header { display: flex; align-items: center; justify-content: space-between; font-size: 12px; font-weight: 600; color: var(--text2); text-transform: uppercase; letter-spacing: .5px; margin: 12px 0 8px; }
        .loading-bar { height: 3px; background: linear-gradient(90deg, var(--primary), transparent); border-radius: 2px; animation: load 1s infinite; margin-bottom: 8px; }
        @keyframes load { 0%{background-position:0} 100%{background-position:200px} }

        .log-entry { display: flex; align-items: flex-start; gap: 6px; padding: 8px; border-radius: var(--radius-sm); margin-bottom: 4px; font-size: 12px; }
        .error-entry { background: #ef444408; border: 1px solid #ef444420; }
        .warn-entry { background: #f59e0b08; border: 1px solid #f59e0b20; }
        .log-time { color: var(--text3); min-width: 50px; flex-shrink: 0; }
        .log-domain { font-weight: 600; min-width: 70px; flex-shrink: 0; }
        .error-domain { color: #ef4444; }
        .warn-domain { color: #f59e0b; }
        .log-msg { color: var(--text2); flex: 1; word-break: break-word; }
        .empty-state { text-align: center; color: var(--text2); padding: 16px; font-size: 13px; background: var(--bg); border-radius: var(--radius-sm); }
        .last-updated { font-size: 11px; color: var(--text3); text-align: right; margin-top: 8px; }
        .info-note { font-size: 12px; color: var(--text2); background: var(--bg); border-radius: var(--radius-sm); padding: 8px 10px; border-left: 3px solid var(--primary); margin-top: 8px; }

        .refresh-btn { background: var(--border); border: none; border-radius: 6px; padding: 4px 10px; font-size: 11px; color: var(--text2); cursor: pointer; font-weight: 500; }
        .refresh-btn:hover { background: var(--primary); color: white; }

        .schedule-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .schedule-card { background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 14px; }
        .schedule-title { font-weight: 600; color: var(--text); margin-bottom: 4px; }
        .schedule-desc { font-size: 12px; color: var(--text2); margin-bottom: 10px; }
        .schedule-row { display: flex; align-items: center; justify-content: space-between; }
        .schedule-status { font-size: 12px; font-weight: 600; }
        .status-on { color: #10b981; }
        .status-off { color: var(--text3); }
        .toggle-btn { background: var(--primary); border: none; border-radius: 6px; padding: 5px 12px; font-size: 12px; color: white; cursor: pointer; font-weight: 500; }
        .toggle-btn:hover { opacity: .85; }
        .info-card { background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 12px; font-size: 13px; color: var(--text2); }
        .setup-steps { line-height: 1.8; }
        .setup-steps p { margin: 6px 0; }
        .setup-steps pre { background: var(--card); border: 1px solid var(--border); border-radius: 4px; padding: 8px; font-size: 12px; color: var(--primary); margin: 4px 0; overflow-x: auto; }
        code { background: var(--border); padding: 1px 4px; border-radius: 3px; font-size: 12px; }

        .smtp-section { background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 14px; margin-bottom: 14px; }
    .smtp-missing { border-color: #f59e0b40; background: #fef3c710; }
    .smtp-header { display: flex; align-items: center; gap: 10px; }
    .smtp-icon { font-size: 22px; }
    .smtp-title { font-weight: 700; font-size: 13px; color: var(--text); }
    .smtp-sub { font-size: 11px; color: var(--text2); margin-top: 2px; }
    .smtp-sub code { background: var(--border); padding: 1px 5px; border-radius: 4px; font-size: 10px; }
    .smtp-actions { display: flex; align-items: center; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
    .smtp-guide { margin-top: 12px; font-size: 12px; line-height: 1.6; color: var(--text2); }
    .smtp-guide p { margin: 6px 0; }
    .smtp-guide code { background: var(--border); padding: 1px 5px; border-radius: 3px; font-size: 11px; }
    .badge-ok { color: #10b981; font-size: 12px; font-weight: 600; }
    .badge-er { color: #ef4444; font-size: 12px; font-weight: 600; }
    .send-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .send-card { background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 16px; text-align: center; }
        .send-icon { font-size: 28px; margin-bottom: 6px; }
        .send-title { font-weight: 700; color: var(--text); margin-bottom: 4px; }
        .send-desc { font-size: 12px; color: var(--text2); margin-bottom: 10px; }
        .send-counts { display: flex; gap: 6px; justify-content: center; margin-bottom: 12px; flex-wrap: wrap; }
        .count-badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 20px; }
        .error-badge { background: #ef444420; color: #ef4444; }
        .warn-badge { background: #f59e0b20; color: #f59e0b; }
        .info-badge { background: #3b82f620; color: #3b82f6; }
        .send-btn { width: 100%; background: var(--primary); color: white; border: none; border-radius: 8px; padding: 10px; font-size: 13px; font-weight: 600; cursor: pointer; transition: .2s; }
        .send-btn:hover { background: #2563eb; transform: translateY(-1px); }
        .send-btn:active { transform: translateY(0); }
        .send-status { padding: 10px 14px; border-radius: var(--radius-sm); margin-top: 12px; font-size: 13px; font-weight: 500; text-align: center; }
        .send-status.sending { background: #3b82f620; color: #3b82f6; }
        .send-status.success { background: #10b98120; color: #10b981; }
        .send-status.error { background: #ef444420; color: #ef4444; }
      
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

      <ha-card class="card">
        <div class="header">
          <span class="header-icon">\uD83D\uDEA8</span>
          <span class="header-title">${this._config.title || 'Log Email Summary'}</span>
          <span class="header-badge" style="background:${totalErrors > 0 ? '#ef444420' : '#10b98120'};color:${totalErrors > 0 ? '#ef4444' : '#10b981'}">${statusLabel}</span>
        </div>

        <div class="tabs">
          ${tabs.map(t => `
            <button class="tab ${this._activeTab === t.id ? 'active' : ''}" data-tab="${t.id}">
              ${t.icon} ${t.label}
            </button>
          `).join('')}
        </div>

        <div class="content">
          ${tabContent}
        </div>
      </ha-card>
    `;

    // Bind events
    this.shadowRoot.querySelectorAll('.tab').forEach(el => {
      el.addEventListener('click', (e) => {
        this._activeTab = e.currentTarget.dataset.tab;
        this._render();
      });
    });

    const btnRefresh = this.shadowRoot.getElementById('btn-refresh');
    if (btnRefresh) btnRefresh.addEventListener('click', () => this._fetchLogData());

    const btnRefreshPreview = this.shadowRoot.getElementById('btn-refresh-preview');
    if (btnRefreshPreview) btnRefreshPreview.addEventListener('click', () => this._fetchLogData());

    // Daily/weekly schedule removed - using direct SMTP

    

    const btnSmtpTest = this.shadowRoot.getElementById('btn-smtp-test');
    if (btnSmtpTest) {
      const smtp = this._detectSmtp();
      btnSmtpTest.addEventListener('click', () => this._testSmtp(smtp.defaultService));
    }
    const btnSendDaily = this.shadowRoot.getElementById('btn-send-daily');
    if (btnSendDaily) btnSendDaily.addEventListener('click', () => this._sendEmailNow('daily'));

    const btnSendWeekly = this.shadowRoot.getElementById('btn-send-weekly');
    if (btnSendWeekly) btnSendWeekly.addEventListener('click', () => this._sendEmailNow('weekly'));
    this._injectDiscovery();
  }

  _injectDiscovery() {
    if (customElements.get('ha-tools-panel')) return;
    const container = this.shadowRoot.querySelector('.card') || this.shadowRoot.querySelector('ha-card');
    if (!container) return;
    if (container.querySelector('ha-tools-discovery-banner')) return;
    const _inj = () => {
      if (window.HAToolsDiscovery) {
        window.HAToolsDiscovery.inject(container, 'log-email', true);
      }
    };
    if (window.HAToolsDiscovery) { _inj(); return; }
    const s = document.createElement('script');
    s.src = '/local/community/ha-tools-panel/ha-tools-discovery.js?_=' + Date.now();
    s.async = true;
    s.onload = _inj;
    document.head.appendChild(s);
  }

  _renderHistory() {
    if (!this._logHistory || this._logHistory.length === 0) {
      return '<div class="empty-state"><div style="font-size:48px;opacity:0.5;margin-bottom:12px;">📜</div><h3 style="margin:8px 0 4px;">No History Yet</h3><p>Log snapshots are saved each time data is fetched. History persists during the browser session.</p></div>';
    }
    let html = '<div class="section-title">📊 Log Fetch History (last ' + this._logHistory.length + ' snapshots)</div>';
    html += '<table style="width:100%;border-collapse:collapse;font-size:13px;">';
    html += '<thead><tr><th style="text-align:left;padding:8px;border-bottom:2px solid var(--bento-border,#e2e8f0);">Time</th><th style="text-align:center;padding:8px;border-bottom:2px solid var(--bento-border,#e2e8f0);">Errors</th><th style="text-align:center;padding:8px;border-bottom:2px solid var(--bento-border,#e2e8f0);">Warnings</th><th style="text-align:center;padding:8px;border-bottom:2px solid var(--bento-border,#e2e8f0);">Total</th></tr></thead><tbody>';
    this._logHistory.forEach(s => {
      const dt = new Date(s.ts);
      const time = dt.toLocaleTimeString() + ' ' + dt.toLocaleDateString();
      const errColor = s.errors > 0 ? 'var(--bento-error,#ef4444)' : 'var(--bento-success,#22c55e)';
      html += '<tr><td style="padding:6px 8px;border-bottom:1px solid var(--bento-border,#e2e8f0);">' + time + '</td>';
      html += '<td style="text-align:center;padding:6px 8px;border-bottom:1px solid var(--bento-border,#e2e8f0);color:' + errColor + ';font-weight:600;">' + s.errors + '</td>';
      html += '<td style="text-align:center;padding:6px 8px;border-bottom:1px solid var(--bento-border,#e2e8f0);color:var(--bento-warning,#f59e0b);font-weight:600;">' + s.warnings + '</td>';
      html += '<td style="text-align:center;padding:6px 8px;border-bottom:1px solid var(--bento-border,#e2e8f0);">' + s.total + '</td></tr>';
    });
    html += '</tbody></table>';
    html += '<div style="margin-top:12px;padding:10px;background:rgba(59,130,246,0.06);border-radius:8px;font-size:12px;color:var(--bento-text-secondary,#64748b);">💡 History is stored in browser sessionStorage and resets when the tab is closed. Each automatic/manual refresh adds a snapshot.</div>';
    return html;
  }
}

customElements.define('ha-log-email', HALogEmail);
window.customElements.whenDefined('ha-log-email').then(() => {
  console.log('[ha-log-email] v1.0 registered');
});

