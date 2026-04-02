class HaEncodingFixer extends HTMLElement {
  constructor() {
    super();
    this._lang = (navigator.language || '').startsWith('pl') ? 'pl' : 'en';
    this.attachShadow({ mode: 'open' });
    this._lastRenderTime = 0;
    this._renderScheduled = false;
    this._firstHassRender = false;
    this._lastHtml = '';
    this._hass = null;
    this._config = {};
    this._activeTab = 'scan';
    this._scanResults = [];
    this._scanning = false;
    this._scanProgress = 0;
    this._scanTotal = 0;
    this._fixLog = [];
    this._selectedIssues = new Set();
    this._lovelaceResources = null;
    this._lovelaceIssues = [];
    this._lovelaceScanning = false;
    this._entityIssues = [];
    this._entityScanning = false;
    this._yamlResults = null;
    this._yamlScanning = false;
  }

  static getConfigElement() {
    return document.createElement('ha-encoding-fixer-editor');
  }

  static getStubConfig() {
    return {
      type: 'custom:ha-encoding-fixer',
      title: 'Encoding Fixer'
    };
  }

  _sanitize(str) {
    if (!str) return str;
    try { return decodeURIComponent(escape(str)); } catch(e) { return str; }
  }

  get _t() {
    const T = {
      pl: {
        title: 'Encoding & Mojibake Fixer',
        tabScan: 'Skanuj encje',
        tabLovelace: 'Lovelace Resources',
        tabLog: 'Log napraw',
        scanEntities: 'Skanuj encje pod katem mojibake',
        scanning: 'Skanowanie...',
        scanComplete: 'Skanowanie zakonczone',
        noIssuesFound: 'Nie znaleziono problemow z kodowaniem',
        issuesFound: 'Znaleziono problemow',
        entityId: 'Entity ID',
        attribute: 'Atrybut',
        currentValue: 'Obecna wartosc',
        fixedValue: 'Poprawiona wartosc',
        fix: 'Napraw',
        fixSelected: 'Napraw zaznaczone',
        fixAll: 'Napraw wszystkie',
        selectAll: 'Zaznacz wszystkie',
        deselectAll: 'Odznacz wszystkie',
        lovelaceTitle: 'Lovelace Resources',
        lovelaceDesc: 'Sprawdz i napraw uszkodzone wpisy w lovelace_resources',
        scanLovelace: 'Skanuj lovelace_resources',
        lovelaceOk: 'Lovelace resources w porzadku',
        lovelaceIssuesFound: 'Znaleziono problemow w lovelace',
        resourceUrl: 'URL zasobu',
        resourceType: 'Typ',
        issue: 'Problem',
        bomDetected: 'BOM wykryty',
        invalidUtf8: 'Nieprawidlowe UTF-8',
        duplicateEntry: 'Zduplikowany wpis',
        brokenUrl: 'Uszkodzony URL',
        fixLovelace: 'Napraw lovelace_resources',
        backupFirst: 'Kopia zapasowa zostanie utworzona automatycznie',
        logTitle: 'Historia napraw',
        noLog: 'Brak historii napraw',
        timestamp: 'Czas',
        action: 'Akcja',
        result: 'Wynik',
        success: 'Sukces',
        failed: 'Blad',
        fixedEntity: 'Naprawiono encje',
        fixedLovelace: 'Naprawiono lovelace',
        mojibakePatterns: 'Wzorce mojibake',
        commonPatterns: 'Czeste wzorce blednego kodowania',
        original: 'Bledne',
        correct: 'Poprawne',
        testString: 'Testuj tekst',
        testInput: 'Wklej tekst do sprawdzenia...',
        testResult: 'Wynik dekodowania',
        noMojibake: 'Tekst wyglada poprawnie',
        mojibakeFound: 'Wykryto mojibake - poprawiona wersja ponizej',
        progress: 'Postep',
        errorFixing: 'Blad podczas naprawy',
        warningLovelace: 'Uwaga: edycja lovelace_resources moze wymagac restartu HA',
        bomExplain: 'BOM (Byte Order Mark) to 3 bajty EF BB BF na poczatku pliku. Moze powodowac bledy parsowania JS.',
        tabYaml: 'Skanuj pliki',
        yamlTitle: 'Skan plikow konfiguracyjnych',
        yamlDesc: 'Skanuje YAML, YML i skrypty Python w /config/ pod katem BOM, mojibake, emoji i bledow kodowania',
        scanYaml: 'Skanuj pliki',
        yamlScanning: 'Skanowanie plikow YAML na HA...',
        yamlOk: 'Pliki YAML w porzadku',
        yamlIssuesFound: 'problemow w plikach YAML',
        yamlFile: 'Plik',
        yamlLine: 'Linia',
        yamlIssue: 'Problem',
        yamlDetail: 'Szczegoly',
        yamlContext: 'Kontekst',
        yamlScannedFiles: 'Przeskanowanych plikow',
        yamlNeedsRestart: 'Uwaga: po dodaniu shell_command wymagany restart HA',
        yamlRunError: 'Blad wywolania skanera — sprawdz czy HA zostal zrestartowany po dodaniu shell_command',
        fixYamlFile: 'Napraw plik',
        fixYamlAll: 'Napraw wszystkie pliki',
        yamlFixing: 'Naprawianie...',
        yamlFixSuccess: 'Naprawiono',
        yamlFixError: 'Blad naprawy',
      },
      en: {
        title: 'Encoding & Mojibake Fixer',
        tabScan: 'Scan entities',
        tabLovelace: 'Lovelace Resources',
        tabLog: 'Fix log',
        scanEntities: 'Scan entities for mojibake',
        scanning: 'Scanning...',
        scanComplete: 'Scan complete',
        noIssuesFound: 'No encoding issues found',
        issuesFound: 'issues found',
        entityId: 'Entity ID',
        attribute: 'Attribute',
        currentValue: 'Current value',
        fixedValue: 'Fixed value',
        fix: 'Fix',
        fixSelected: 'Fix selected',
        fixAll: 'Fix all',
        selectAll: 'Select all',
        deselectAll: 'Deselect all',
        lovelaceTitle: 'Lovelace Resources',
        lovelaceDesc: 'Check and fix broken entries in lovelace_resources',
        scanLovelace: 'Scan lovelace_resources',
        lovelaceOk: 'Lovelace resources look good',
        lovelaceIssuesFound: 'lovelace issues found',
        resourceUrl: 'Resource URL',
        resourceType: 'Type',
        issue: 'Issue',
        bomDetected: 'BOM detected',
        invalidUtf8: 'Invalid UTF-8',
        duplicateEntry: 'Duplicate entry',
        brokenUrl: 'Broken URL',
        fixLovelace: 'Fix lovelace_resources',
        backupFirst: 'A backup will be created automatically',
        logTitle: 'Fix history',
        noLog: 'No fix history',
        timestamp: 'Time',
        action: 'Action',
        result: 'Result',
        success: 'Success',
        failed: 'Failed',
        fixedEntity: 'Fixed entity',
        fixedLovelace: 'Fixed lovelace',
        mojibakePatterns: 'Mojibake patterns',
        commonPatterns: 'Common encoding error patterns',
        original: 'Broken',
        correct: 'Correct',
        testString: 'Test text',
        testInput: 'Paste text to check...',
        testResult: 'Decode result',
        noMojibake: 'Text looks correct',
        mojibakeFound: 'Mojibake detected - corrected version below',
        progress: 'Progress',
        errorFixing: 'Error during fix',
        warningLovelace: 'Warning: editing lovelace_resources may require HA restart',
        bomExplain: 'BOM (Byte Order Mark) is 3 bytes EF BB BF at start of file. Can cause JS parse errors.',
        tabYaml: 'Scan files',
        yamlTitle: 'Config file scan',
        yamlDesc: 'Scans YAML, YML and Python scripts in /config/ for BOM, mojibake, emoji and encoding errors',
        scanYaml: 'Scan files',
        yamlScanning: 'Scanning YAML files on HA...',
        yamlOk: 'YAML files look good',
        yamlIssuesFound: 'issues in YAML files',
        yamlFile: 'File',
        yamlLine: 'Line',
        yamlIssue: 'Issue',
        yamlDetail: 'Details',
        yamlContext: 'Context',
        yamlScannedFiles: 'Files scanned',
        yamlNeedsRestart: 'Note: HA restart required after adding shell_command',
        yamlRunError: 'Error running scanner — check if HA was restarted after adding shell_command',
        fixYamlFile: 'Fix file',
        fixYamlAll: 'Fix all files',
        yamlFixing: 'Fixing...',
        yamlFixSuccess: 'Fixed',
        yamlFixError: 'Fix error',
      }
    };
    return T[this._lang] || T.en;
  }

  setConfig(config) {
    this._config = config;
    this._loadFixLog();
    this._updateUI();
  }

  set hass(hass) {
    if (hass?.language) this._lang = hass.language.startsWith('pl') ? 'pl' : 'en';
    this._hass = hass;
    if (!hass) return;
    const now = Date.now();
    if (!this._firstHassRender) {
      this._firstHassRender = true;
      this._updateUI();
      this._lastRenderTime = now;
      return;
    }
    if (now - (this._lastRenderTime || 0) < 5000) {
      if (!this._renderScheduled) {
        this._renderScheduled = true;
        setTimeout(() => {
          this._renderScheduled = false;
          this._updateUI();
          this._lastRenderTime = Date.now();
        }, 5000 - (now - (this._lastRenderTime || 0)));
      }
      return;
    }
    this._lastRenderTime = now;
    this._updateUI();
  }

  // --- Mojibake detection ---

  // Known Polish mojibake patterns (UTF-8 decoded as Latin-1/CP1252)
  static get MOJIBAKE_MAP() {
    return {
      // Polish
      '\u00C4\u0085': '\u0105', // ą
      '\u00C4\u0087': '\u0107', // ć
      '\u00C4\u0099': '\u0119', // ę
      '\u00C5\u0082': '\u0142', // ł
      '\u00C5\u0084': '\u0144', // ń
      '\u00C3\u00B3': '\u00F3', // ó
      '\u00C5\u009B': '\u015B', // ś
      '\u00C5\u00BA': '\u017A', // ź
      '\u00C5\u00BC': '\u017C', // ż
      '\u00C4\u0084': '\u0104', // Ą
      '\u00C4\u0086': '\u0106', // Ć
      '\u00C4\u0098': '\u0118', // Ę
      '\u00C5\u0081': '\u0141', // Ł
      '\u00C5\u0083': '\u0143', // Ń
      '\u00C3\u0093': '\u00D3', // Ó
      '\u00C5\u009A': '\u015A', // Ś
      '\u00C5\u00B9': '\u0179', // Ź
      '\u00C5\u00BB': '\u017B', // Ż
      // German
      '\u00C3\u00A4': '\u00E4', // ä
      '\u00C3\u00B6': '\u00F6', // ö
      '\u00C3\u00BC': '\u00FC', // ü
      '\u00C3\u009F': '\u00DF', // ß
      '\u00C3\u0084': '\u00C4', // Ä
      '\u00C3\u0096': '\u00D6', // Ö
      '\u00C3\u009C': '\u00DC', // Ü
      // French/Spanish
      '\u00C3\u00A9': '\u00E9', // é
      '\u00C3\u00A8': '\u00E8', // è
      '\u00C3\u00AA': '\u00EA', // ê
      '\u00C3\u00AB': '\u00EB', // ë
      '\u00C3\u00A0': '\u00E0', // à
      '\u00C3\u00A2': '\u00E2', // â
      '\u00C3\u00AE': '\u00EE', // î
      '\u00C3\u00B1': '\u00F1', // ñ
      '\u00C3\u00BA': '\u00FA', // ú
      // Common symbols
      '\u00C2\u00B0': '\u00B0', // ° (degree)
      '\u00C2\u00A3': '\u00A3', // £
      '\u00C2\u00A7': '\u00A7', // §
      '\u00C2\u00AB': '\u00AB', // «
      '\u00C2\u00BB': '\u00BB', // »
      '\u00C2\u00B2': '\u00B2', // ²
      '\u00C2\u00B3': '\u00B3', // ³
      '\u00C2\u00BD': '\u00BD', // ½
      '\u00E2\u0080\u0093': '\u2013', // – (en dash)
      '\u00E2\u0080\u0094': '\u2014', // — (em dash)
      '\u00E2\u0080\u009C': '\u201C', // " (left double quote)
      '\u00E2\u0080\u009D': '\u201D', // " (right double quote)
      '\u00E2\u0080\u0099': '\u2019', // ' (right single quote / apostrophe)
      '\u00E2\u0080\u00A6': '\u2026', // … (ellipsis)
      '\u00E2\u0080\u00A2': '\u2022', // • (bullet)
      // Emoji mojibake (4-byte UTF-8 misread as Latin-1)
      '\u00F0\u009F\u0094\u0092': '\uD83D\uDD12', // 🔒
      '\u00F0\u009F\u0094\u00A5': '\uD83D\uDD25', // 🔥
      '\u00F0\u009F\u0091\u008D': '\uD83D\uDC4D', // 👍
      '\u00F0\u009F\u0098\u008A': '\uD83D\uDE0A', // 😊
      '\u00F0\u009F\u008E\u00AF': '\uD83C\uDFAF', // 🎯
      '\u00F0\u009F\u009A\u0080': '\uD83D\uDE80', // 🚀
      '\u00F0\u009F\u0092\u00A1': '\uD83D\uDCA1', // 💡
      '\u00F0\u009F\u0094\u0094': '\uD83D\uDD14', // 🔔
      '\u00F0\u009F\u008F\u00A0': '\uD83C\uDFE0', // 🏠
      '\u00F0\u009F\u0094\u008C': '\uD83D\uDD0C', // 🔌
      '\u00F0\u009F\u0092\u00BB': '\uD83D\uDCBB', // 💻
    };
  }

  _detectMojibake(str) {
    if (!str || typeof str !== 'string') return null;
    let fixed = str;
    let hasMojibake = false;

    // Method 1: Try decodeURIComponent(escape(str))
    try {
      const decoded = decodeURIComponent(escape(str));
      if (decoded !== str) {
        return { original: str, fixed: decoded, method: 'escape-decode' };
      }
    } catch(e) { /* not double-encoded */ }

    // Method 2: Pattern replacement for known mojibake sequences
    for (const [bad, good] of Object.entries(HaEncodingFixer.MOJIBAKE_MAP)) {
      if (fixed.includes(bad)) {
        fixed = fixed.split(bad).join(good);
        hasMojibake = true;
      }
    }

    if (hasMojibake) {
      return { original: str, fixed: fixed, method: 'pattern-replace' };
    }

    // Method 3: Check for suspicious byte sequences (C3 xx, C4 xx, C5 xx in string)
    const suspiciousPattern = /[\u00C3\u00C4\u00C5][\u0080-\u00BF]/;
    if (suspiciousPattern.test(str)) {
      return { original: str, fixed: str, method: 'suspicious', uncertain: true };
    }

    return null;
  }

  _hasBOM(str) {
    return str && str.charCodeAt(0) === 0xFEFF;
  }

  // --- Scan entities ---
  async _scanEntities() {
    if (!this._hass || this._scanning) return;
    this._scanning = true;
    this._entityScanning = true;
    this._scanResults = [];
    this._scanProgress = 0;

    const allStates = Object.values(this._hass.states);
    this._scanTotal = allStates.length;
    this._updateUI();

    for (let i = 0; i < allStates.length; i++) {
      const entity = allStates[i];
      this._scanProgress = i + 1;

      // Check friendly_name
      const fname = entity.attributes?.friendly_name;
      if (fname) {
        const result = this._detectMojibake(fname);
        if (result && !result.uncertain) {
          this._scanResults.push({
            entity_id: entity.entity_id,
            attribute: 'friendly_name',
            ...result
          });
        }
      }

      // Check state value if string
      if (typeof entity.state === 'string' && entity.state.length > 1) {
        const result = this._detectMojibake(entity.state);
        if (result && !result.uncertain) {
          this._scanResults.push({
            entity_id: entity.entity_id,
            attribute: 'state',
            ...result
          });
        }
      }

      // Update UI every 200 entities
      if (i % 200 === 0) {
        this._updateUI();
        await new Promise(r => setTimeout(r, 0));
      }
    }

    this._scanning = false;
    this._entityScanning = false;
    this._updateUI();
  }

  // --- Scan lovelace_resources ---
  async _scanLovelace() {
    if (!this._hass || this._lovelaceScanning) return;
    this._lovelaceScanning = true;
    this._lovelaceIssues = [];
    this._updateUI();

    try {
      // Fetch lovelace resources via WS API
      const resources = await this._hass.callWS({ type: 'lovelace/resources' });
      this._lovelaceResources = resources;

      const seen = new Set();
      for (const res of resources) {
        const url = res.url || '';

        // Check for BOM in URL
        if (this._hasBOM(url)) {
          this._lovelaceIssues.push({
            id: res.id,
            url: url,
            type: res.type || 'module',
            issue: 'bom',
            fixedUrl: url.replace(/^\uFEFF/, '')
          });
        }

        // Check for duplicate URLs (ignoring query params)
        const baseUrl = url.split('?')[0];
        if (seen.has(baseUrl)) {
          this._lovelaceIssues.push({
            id: res.id,
            url: url,
            type: res.type || 'module',
            issue: 'duplicate',
            fixedUrl: null
          });
        }
        seen.add(baseUrl);

        // Check for mojibake in URL
        const mojibake = this._detectMojibake(url);
        if (mojibake && !mojibake.uncertain) {
          this._lovelaceIssues.push({
            id: res.id,
            url: url,
            type: res.type || 'module',
            issue: 'mojibake',
            fixedUrl: mojibake.fixed
          });
        }

        // Check for broken URL patterns
        if (url && !url.startsWith('/') && !url.startsWith('http')) {
          this._lovelaceIssues.push({
            id: res.id,
            url: url,
            type: res.type || 'module',
            issue: 'broken_url',
            fixedUrl: null
          });
        }
      }
    } catch(e) {
      console.warn('[Encoding Fixer] Error scanning lovelace:', e);
    }

    this._lovelaceScanning = false;
    this._updateUI();
  }

  // --- Backup ---
  _createBackup(type, items) {
    const backup = { ts: Date.now(), type, items: items.map(i => ({ ...i })) };
    try {
      const key = 'ha-encoding-fixer-backup';
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      existing.push(backup);
      if (existing.length > 20) existing.splice(0, existing.length - 20);
      localStorage.setItem(key, JSON.stringify(existing));
      console.log('[Encoding Fixer] Backup created:', type, items.length, 'items');
      return true;
    } catch(e) {
      console.warn('[Encoding Fixer] Backup failed:', e);
      return false;
    }
  }

  _getBackups() {
    try { return JSON.parse(localStorage.getItem('ha-encoding-fixer-backup') || '[]'); }
    catch(e) { return []; }
  }

  _showRestartHint() {
    const msg = this._lang === 'pl'
      ? '\u2705 Naprawy zastosowane. Zalecany restart HA (Ustawienia \u2192 System \u2192 Restart).'
      : '\u2705 Fixes applied. HA restart recommended (Settings \u2192 System \u2192 Restart).';
    this._showToast(msg, 'success');
  }

  // --- Fix actions ---
  async _fixEntityName(entityId, fixedName) {
    if (!this._hass) return;
    const t = this._t;
    const orig = this._scanResults.find(r => r.entity_id === entityId && r.attribute === 'friendly_name');
    if (orig) this._createBackup('entity', [{ entity_id: entityId, attribute: 'friendly_name', original: orig.original, fixed: fixedName }]);
    try {
      // Use entity registry to update friendly_name
      await this._hass.callWS({
        type: 'config/entity_registry/update',
        entity_id: entityId,
        name: fixedName
      });
      this._addFixLog('entity', entityId, 'success', fixedName);
      // Remove from results
      this._scanResults = this._scanResults.filter(r => !(r.entity_id === entityId && r.attribute === 'friendly_name'));
      this._selectedIssues.delete(entityId);
      this._updateUI();
    } catch(e) {
      console.warn('[Encoding Fixer]', e);
      this._addFixLog('entity', entityId, 'failed', e.message);
      this._showToast(t.errorFixing + ': ' + entityId, 'error');
    }
  }

  async _fixSelectedEntities() {
    const entitiesToFix = this._scanResults.filter(r =>
      this._selectedIssues.has(r.entity_id) && r.attribute === 'friendly_name' && r.fixed
    );
    if (!entitiesToFix.length) return;
    if (!confirm(this._lang === 'pl' ? 'Naprawic ' + entitiesToFix.length + ' zaznaczonych encji?\nKopia zapasowa zostanie utworzona automatycznie.' : 'Fix ' + entitiesToFix.length + ' selected entities?\nA backup will be created automatically.')) return;
    this._createBackup('entity-batch', entitiesToFix.map(r => ({ entity_id: r.entity_id, original: r.original, fixed: r.fixed })));
    for (const item of entitiesToFix) {
      await this._fixEntityName(item.entity_id, item.fixed);
      await new Promise(r => setTimeout(r, 300)); // Rate limit
    }
    this._showRestartHint();
  }

  async _fixAllEntities() {
    const entitiesToFix = this._scanResults.filter(r =>
      r.attribute === 'friendly_name' && r.fixed && r.fixed !== r.original
    );
    if (!entitiesToFix.length) return;
    if (!confirm(this._lang === 'pl' ? '\u26A0\uFE0F Naprawic WSZYSTKIE ' + entitiesToFix.length + ' encji?\nKopia zapasowa zostanie utworzona automatycznie.\nPo naprawie zalecany restart HA.' : '\u26A0\uFE0F Fix ALL ' + entitiesToFix.length + ' entities?\nA backup will be created.\nHA restart recommended after fix.')) return;
    this._createBackup('entity-all', entitiesToFix.map(r => ({ entity_id: r.entity_id, original: r.original, fixed: r.fixed })));
    for (const item of entitiesToFix) {
      await this._fixEntityName(item.entity_id, item.fixed);
      await new Promise(r => setTimeout(r, 300));
    }
    this._showRestartHint();
  }

  async _fixLovelaceResource(issue) {
    if (!this._hass || !issue.fixedUrl) return;
    const t = this._t;
    if (!confirm(this._lang === 'pl' ? 'Naprawic lovelace resource?\nURL: ' + issue.url + '\nNowy: ' + issue.fixedUrl + '\nKopia zapasowa zostanie utworzona.\nWymagany restart HA.' : 'Fix lovelace resource?\nURL: ' + issue.url + '\nNew: ' + issue.fixedUrl + '\nBackup will be created.\nHA restart required.')) return;
    this._createBackup('lovelace', [{ id: issue.id, url: issue.url, fixedUrl: issue.fixedUrl }]);
    try {
      await this._hass.callWS({
        type: 'lovelace/resources/update',
        resource_id: issue.id,
        url: issue.fixedUrl
      });
      this._addFixLog('lovelace', issue.url, 'success', issue.fixedUrl);
      this._lovelaceIssues = this._lovelaceIssues.filter(i => i.id !== issue.id);
      this._showRestartHint();
      this._updateUI();
    } catch(e) {
      console.warn('[Encoding Fixer]', e);
      this._addFixLog('lovelace', issue.url, 'failed', e.message);
      this._showToast(t.errorFixing, 'error');
    }
  }

  // --- Persistence ---
  _loadFixLog() {
    try {
      const raw = localStorage.getItem('ha-encoding-fixer-log');
      this._fixLog = raw ? JSON.parse(raw) : [];
    } catch(e) { this._fixLog = []; }
  }

  _saveFixLog() {
    try {
      if (this._fixLog.length > 100) this._fixLog = this._fixLog.slice(-100);
      localStorage.setItem('ha-encoding-fixer-log', JSON.stringify(this._fixLog));
    } catch(e) { /* ignore */ }
  }

  _addFixLog(type, target, result, detail) {
    this._fixLog.push({ ts: Date.now(), type, target, result, detail });
    this._saveFixLog();
  }

  _showToast(msg, type) {
    const toast = this.shadowRoot?.querySelector('.toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.className = 'toast toast-' + (type || 'info') + ' toast-show';
    setTimeout(() => { toast.className = 'toast'; }, 3000);
  }

  // --- Test tool ---
  _testDecode(input) {
    if (!input) return null;
    const result = this._detectMojibake(input);
    return result;
  }

  // --- UI ---
  _updateUI() {
    const html = this._buildHTML();
    if (html === this._lastHtml) return;
    this._lastHtml = html;
    this.shadowRoot.innerHTML = html;
    this._attachEvents();
  }

  _buildHTML() {
    const t = this._t;
    return `<style>${this._getCSS()}</style>
    <div class="container">
      <div class="header">
        <div class="header-left">
          <span class="header-icon">\uD83D\uDD27</span>
          <h2>${t.title}</h2>
        </div>
      </div>

      <div class="tabs">
        <button class="tab-btn ${this._activeTab === 'scan' ? 'active' : ''}" data-tab="scan">${t.tabScan}</button>
        <button class="tab-btn ${this._activeTab === 'yaml' ? 'active' : ''}" data-tab="yaml">${t.tabYaml}</button>
        <button class="tab-btn ${this._activeTab === 'lovelace' ? 'active' : ''}" data-tab="lovelace">${t.tabLovelace}</button>
        <button class="tab-btn ${this._activeTab === 'log' ? 'active' : ''}" data-tab="log">${t.tabLog}</button>
      </div>

      <div class="tab-content">
        ${this._activeTab === 'scan' ? this._buildScanTab() : ''}
        ${this._activeTab === 'yaml' ? this._buildYamlTab() : ''}
        ${this._activeTab === 'lovelace' ? this._buildLovelaceTab() : ''}
        ${this._activeTab === 'log' ? this._buildLogTab() : ''}
      </div>

      <div class="toast"></div>
    </div>`;
  }

  _buildScanTab() {
    const t = this._t;

    // Test tool
    const testSection = `
      <div class="section">
        <h3>\uD83E\uDDEA ${t.testString}</h3>
        <textarea class="test-input" placeholder="${t.testInput}" rows="2"></textarea>
        <div class="test-result"></div>
      </div>
    `;

    // Scan button + progress
    let scanStatus = '';
    if (this._scanning) {
      const pct = this._scanTotal > 0 ? Math.round((this._scanProgress / this._scanTotal) * 100) : 0;
      scanStatus = `
        <div class="scan-progress">
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
          <span class="progress-text">${t.scanning} ${this._scanProgress}/${this._scanTotal}</span>
        </div>`;
    }

    // Results
    let resultsHtml = '';
    if (!this._scanning && this._scanResults.length > 0) {
      const rows = this._scanResults.map((r, i) => {
        const selected = this._selectedIssues.has(r.entity_id);
        return `<div class="result-row">
          <label class="result-check">
            <input type="checkbox" data-select="${i}" ${selected ? 'checked' : ''} />
          </label>
          <div class="result-entity">${r.entity_id}</div>
          <div class="result-attr">${r.attribute}</div>
          <div class="result-original">${this._escapeHtml(r.original)}</div>
          <div class="result-arrow">\u2192</div>
          <div class="result-fixed">${this._escapeHtml(r.fixed)}</div>
          <button class="btn btn-sm btn-primary" data-fix="${i}">${t.fix}</button>
        </div>`;
      }).join('');

      resultsHtml = `
        <div class="section">
          <div class="results-header">
            <h3>${this._scanResults.length} ${t.issuesFound}</h3>
            <div class="results-actions">
              <button class="btn btn-sm btn-secondary" data-action="select-all">${t.selectAll}</button>
              <button class="btn btn-sm btn-secondary" data-action="deselect-all">${t.deselectAll}</button>
              <button class="btn btn-sm btn-primary" data-action="fix-selected" ${this._selectedIssues.size === 0 ? 'disabled' : ''}>${t.fixSelected} (${this._selectedIssues.size})</button>
              <button class="btn btn-sm btn-danger" data-action="fix-all">${t.fixAll}</button>
            </div>
          </div>
          <div class="results-list">${rows}</div>
        </div>`;
    } else if (!this._scanning && this._scanResults.length === 0 && this._scanTotal > 0) {
      resultsHtml = `<div class="section"><div class="empty-state">\u2705 ${t.noIssuesFound}</div></div>`;
    }

    // Common patterns reference
    const patterns = Object.entries(HaEncodingFixer.MOJIBAKE_MAP).slice(0, 9);
    const patternRows = patterns.map(([bad, good]) =>
      `<span class="pattern-bad">${this._escapeHtml(bad)}</span> \u2192 <span class="pattern-good">${good}</span>`
    ).join('<br>');

    return `
      ${testSection}

      <div class="section">
        <div class="scan-header">
          <h3>${t.scanEntities}</h3>
          <button class="btn btn-primary" data-action="scan-entities" ${this._scanning ? 'disabled' : ''}>${this._scanning ? t.scanning : t.scanEntities}</button>
        </div>
        ${scanStatus}
      </div>

      ${resultsHtml}

      <div class="section patterns-section">
        <h3>${t.mojibakePatterns}</h3>
        <p class="patterns-desc">${t.commonPatterns}</p>
        <div class="patterns-grid">${patternRows}</div>
      </div>
    `;
  }

  _buildLovelaceTab() {
    const t = this._t;

    let scanStatus = '';
    if (this._lovelaceScanning) {
      scanStatus = `<div class="scan-progress"><div class="spinner-small"></div> ${t.scanning}</div>`;
    }

    let issuesHtml = '';
    if (!this._lovelaceScanning && this._lovelaceIssues.length > 0) {
      const rows = this._lovelaceIssues.map((issue, i) => {
        const issueLabel = {
          'bom': t.bomDetected,
          'duplicate': t.duplicateEntry,
          'mojibake': 'Mojibake',
          'broken_url': t.brokenUrl
        }[issue.issue] || issue.issue;

        return `<div class="lovelace-row">
          <div class="lovelace-url">${this._escapeHtml(issue.url)}</div>
          <div class="lovelace-type">${issue.type}</div>
          <div class="lovelace-issue issue-${issue.issue}">${issueLabel}</div>
          ${issue.fixedUrl ? `<button class="btn btn-sm btn-primary" data-fix-lovelace="${i}">${t.fix}</button>` : '<span class="manual-fix">\u26A0\uFE0F</span>'}
        </div>`;
      }).join('');

      issuesHtml = `
        <div class="section">
          <h3>${this._lovelaceIssues.length} ${t.lovelaceIssuesFound}</h3>
          <div class="lovelace-list">${rows}</div>
          <div class="lovelace-warning">\u26A0\uFE0F ${t.warningLovelace}</div>
        </div>`;
    } else if (!this._lovelaceScanning && this._lovelaceIssues.length === 0 && this._lovelaceResources) {
      issuesHtml = `<div class="section"><div class="empty-state">\u2705 ${t.lovelaceOk}</div></div>`;
    }

    // BOM explanation
    const bomInfo = `
      <div class="section info-section">
        <h3>\u2139\uFE0F BOM (Byte Order Mark)</h3>
        <p>${t.bomExplain}</p>
        <div class="bom-visual">
          <code>EF BB BF</code> = <code>\\uFEFF</code>
        </div>
      </div>
    `;

    return `
      <div class="section">
        <div class="scan-header">
          <h3>${t.lovelaceTitle}</h3>
          <button class="btn btn-primary" data-action="scan-lovelace" ${this._lovelaceScanning ? 'disabled' : ''}>${t.scanLovelace}</button>
        </div>
        <p class="section-desc">${t.lovelaceDesc}</p>
        ${scanStatus}
      </div>

      ${issuesHtml}
      ${bomInfo}
    `;
  }

  _buildLogTab() {
    const t = this._t;
    if (this._fixLog.length === 0) {
      return `<div class="section"><div class="empty-state">${t.noLog}</div></div>`;
    }

    const rows = [...this._fixLog].reverse().slice(0, 50).map(entry => {
      const date = new Date(entry.ts);
      const dateStr = date.toLocaleString(this._lang === 'pl' ? 'pl-PL' : 'en-US', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
      });
      const typeIcon = entry.type === 'entity' ? '\uD83C\uDFF7\uFE0F' : '\uD83D\uDCC4';
      const resultClass = entry.result === 'success' ? 'log-success' : 'log-failed';
      return `<div class="log-row">
        <div class="log-date">${dateStr}</div>
        <div class="log-type">${typeIcon}</div>
        <div class="log-target">${this._escapeHtml(entry.target)}</div>
        <div class="log-result ${resultClass}">${entry.result === 'success' ? t.success : t.failed}</div>
        <div class="log-detail">${this._escapeHtml(entry.detail || '')}</div>
      </div>`;
    }).join('');

    return `
      <div class="section">
        <h3>${t.logTitle}</h3>
        <div class="log-list">${rows}</div>
      </div>
    `;
  }

  _escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  _attachEvents() {
    const sr = this.shadowRoot;
    if (!sr) return;

    // Tabs
    sr.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._activeTab = btn.dataset.tab;
        this._updateUI();
      });
    });

    // Scan entities
    const scanBtn = sr.querySelector('[data-action="scan-entities"]');
    if (scanBtn) scanBtn.addEventListener('click', () => this._scanEntities());

    // Scan lovelace
    const scanLov = sr.querySelector('[data-action="scan-lovelace"]');
    if (scanLov) scanLov.addEventListener('click', () => this._scanLovelace());

    // Config check (built-in, zero setup)
    const checkConfig = sr.querySelector('[data-action="check-config"]');
    if (checkConfig) checkConfig.addEventListener('click', () => this._checkConfig());

    // Deep YAML scan (requires shell_command setup)
    const scanDeep = sr.querySelector('[data-action="scan-yaml-deep"]');
    if (scanDeep) scanDeep.addEventListener('click', () => this._scanYamlDeep());

    // Fix individual YAML file
    sr.querySelectorAll('[data-fix-yaml]').forEach(btn => {
      btn.addEventListener('click', () => this._fixYamlFile(parseInt(btn.dataset.fixYaml)));
    });

    // Fix all YAML
    const fixYamlAll = sr.querySelector('[data-action="fix-yaml-all"]');
    if (fixYamlAll) fixYamlAll.addEventListener('click', () => this._fixYamlAll());

    // Test input
    const testInput = sr.querySelector('.test-input');
    if (testInput) {
      testInput.addEventListener('input', (e) => {
        const result = this._testDecode(e.target.value);
        const resultEl = sr.querySelector('.test-result');
        if (!resultEl) return;
        const t = this._t;
        if (!e.target.value) {
          resultEl.innerHTML = '';
        } else if (result && result.fixed !== result.original) {
          resultEl.innerHTML = `<div class="test-found">\u26A0\uFE0F ${t.mojibakeFound}:<br><strong>${this._escapeHtml(result.fixed)}</strong><br><small>${result.method}</small></div>`;
        } else {
          resultEl.innerHTML = `<div class="test-ok">\u2705 ${t.noMojibake}</div>`;
        }
      });
    }

    // Fix individual entity
    sr.querySelectorAll('[data-fix]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.fix);
        const item = this._scanResults[idx];
        if (item && item.attribute === 'friendly_name') {
          this._fixEntityName(item.entity_id, item.fixed);
        }
      });
    });

    // Fix lovelace
    sr.querySelectorAll('[data-fix-lovelace]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.fixLovelace);
        const issue = this._lovelaceIssues[idx];
        if (issue) this._fixLovelaceResource(issue);
      });
    });

    // Select/deselect checkboxes
    sr.querySelectorAll('[data-select]').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.select);
        const item = this._scanResults[idx];
        if (item) {
          if (e.target.checked) this._selectedIssues.add(item.entity_id);
          else this._selectedIssues.delete(item.entity_id);
          this._updateUI();
        }
      });
    });

    // Select all / deselect all
    const selectAll = sr.querySelector('[data-action="select-all"]');
    if (selectAll) {
      selectAll.addEventListener('click', () => {
        this._scanResults.forEach(r => this._selectedIssues.add(r.entity_id));
        this._updateUI();
      });
    }
    const deselectAll = sr.querySelector('[data-action="deselect-all"]');
    if (deselectAll) {
      deselectAll.addEventListener('click', () => {
        this._selectedIssues.clear();
        this._updateUI();
      });
    }

    // Fix selected / fix all
    const fixSelected = sr.querySelector('[data-action="fix-selected"]');
    if (fixSelected) fixSelected.addEventListener('click', () => this._fixSelectedEntities());
    const fixAll = sr.querySelector('[data-action="fix-all"]');
    if (fixAll) fixAll.addEventListener('click', () => this._fixAllEntities());
  }

  // --- File scan helpers ---
  _hasShellCommand(cmd) {
    return !!(this._hass?.services?.shell_command?.[cmd]);
  }

  // --- Config check (built-in, zero setup) ---
  async _checkConfig() {
    if (!this._hass || this._yamlScanning) return;
    this._yamlScanning = true;
    this._yamlResults = null;
    this._updateUI();

    try {
      const result = await this._hass.callApi('POST', 'config/core/check_config');
      const issues = [];
      if (result.result === 'invalid') {
        issues.push({
          file: 'configuration.yaml',
          line: 0,
          issue: 'config_error',
          detail: result.errors || 'Invalid configuration',
          fixable: false
        });
      }
      this._yamlResults = {
        timestamp: Math.floor(Date.now() / 1000),
        mode: 'config_check',
        scanned_files: 1,
        total_issues: issues.length,
        fixed_files: 0,
        issues: issues
      };
    } catch(e) {
      console.warn('[Encoding Fixer] Config check error:', e);
      this._yamlResults = { error: e.message, scanned_files: 0, total_issues: 0, issues: [] };
    }

    this._yamlScanning = false;
    this._updateUI();
  }

  // --- Deep file scan (requires shell_command setup) ---
  async _fixYamlFile(idx) {
    if (!this._hass || !this._yamlResults || !this._hasShellCommand('fix_encoding')) return;
    const t = this._t;
    const issue = this._yamlResults.issues[idx];
    if (!issue || (issue.issue !== 'bom' && issue.issue !== 'mojibake')) return;
    try {
      await this._hass.callService('shell_command', 'fix_encoding', {});
      await new Promise(r => setTimeout(r, 2000));
      this._showToast(t.yamlFixSuccess + ': ' + issue.file, 'success');
      this._addFixLog('yaml', issue.file, 'success', issue.issue);
      await this._scanYamlDeep();
    } catch(e) {
      console.warn('[Encoding Fixer] Fix error:', e);
      this._showToast(t.yamlFixError + ': ' + issue.file, 'error');
      this._addFixLog('yaml', issue.file, 'failed', e.message);
    }
  }

  async _fixYamlAll() {
    if (!this._hass || !this._yamlResults || !this._hasShellCommand('fix_encoding')) return;
    const t = this._t;
    try {
      await this._hass.callService('shell_command', 'fix_encoding', {});
      await new Promise(r => setTimeout(r, 3000));
      this._showToast(t.yamlFixSuccess, 'success');
      this._addFixLog('yaml', 'all fixable files', 'success', 'batch fix');
      await this._scanYamlDeep();
    } catch(e) {
      console.warn('[Encoding Fixer] Fix all error:', e);
      this._showToast(t.yamlFixError, 'error');
    }
  }

  async _scanYamlDeep() {
    if (!this._hass || this._yamlScanning) return;
    if (!this._hasShellCommand('scan_encoding')) {
      // Fall back to config check
      return this._checkConfig();
    }
    this._yamlScanning = true;
    this._yamlResults = null;
    this._updateUI();

    try {
      await this._hass.callService('shell_command', 'scan_encoding', {});
      await new Promise(r => setTimeout(r, 3000));
      const resp = await fetch('/local/encoding_scan_result.json?_=' + Date.now());
      if (resp.ok) {
        this._yamlResults = await resp.json();
      } else {
        throw new Error('HTTP ' + resp.status);
      }
    } catch(e) {
      console.warn('[Encoding Fixer] Deep scan error:', e);
      this._yamlResults = { error: e.message, scanned_files: 0, total_issues: 0, issues: [] };
    }

    this._yamlScanning = false;
    this._updateUI();
  }

  _buildYamlTab() {
    const t = this._t;
    const hasDeepScan = this._hasShellCommand('scan_encoding');
    const hasDeepFix = this._hasShellCommand('fix_encoding');

    let scanStatus = '';
    if (this._yamlScanning) {
      scanStatus = `<div class="scan-progress"><div class="spinner-small"></div> ${t.yamlScanning}</div>`;
    }

    let resultsHtml = '';
    if (!this._yamlScanning && this._yamlResults) {
      if (this._yamlResults.error) {
        resultsHtml = `<div class="section"><div class="empty-state" style="color:var(--bento-error)">\u26A0\uFE0F ${t.yamlRunError}<br><small>${this._escapeHtml(this._yamlResults.error)}</small></div></div>`;
        resultsHtml = `<div class="section"><div class="empty-state">\u2705 ${t.yamlOk}<br><small>${t.yamlScannedFiles}: ${this._yamlResults.scanned_files}</small></div></div>`;
      } else {
        const fixableIssues = this._yamlResults.issues.filter(i => i.issue === 'bom' || i.issue === 'mojibake');
        const rows = this._yamlResults.issues.map((issue, idx) => {
          const issueLabel = {
            'bom': 'BOM',
            'mojibake': 'Mojibake',
            'invalid_utf8': 'Invalid UTF-8',
            'null_byte': 'Null byte',
            'read_error': 'Read error'
          }[issue.issue] || issue.issue;
          const issueClass = issue.issue === 'bom' || issue.issue === 'mojibake' ? 'issue-bom' : 'issue-broken_url';
          const fixable = (issue.issue === 'bom' || issue.issue === 'mojibake') && hasDeepFix;
          return `<div class="yaml-row">
            <div class="yaml-file">${this._escapeHtml(issue.file)}</div>
            <div class="yaml-line">${issue.line > 0 ? ':' + issue.line : ''}</div>
            <div class="yaml-issue ${issueClass}">${issueLabel}</div>
            <div class="yaml-detail">${this._escapeHtml(issue.detail || '')}</div>
            ${issue.context ? `<div class="yaml-context"><code>${this._escapeHtml(issue.context)}</code></div>` : ''}
            ${fixable ? `<button class="btn btn-sm btn-primary" data-fix-yaml="${idx}">${t.fixYamlFile}</button>` : ''}
          </div>`;
        }).join('');

        resultsHtml = `
          <div class="section">
            <div class="results-header">
              <h3>${this._yamlResults.total_issues} ${t.yamlIssuesFound}</h3>
              ${fixableIssues.length > 0 ? `<button class="btn btn-sm btn-danger" data-action="fix-yaml-all">${t.fixYamlAll} (${fixableIssues.length})</button>` : ''}
            </div>
            <small style="color:var(--bento-text-secondary)">${t.yamlScannedFiles}: ${this._yamlResults.scanned_files}</small>
            <div class="yaml-list" style="margin-top:12px">${rows}</div>
          </div>`;
      }
    }

    // Setup guide for deep scan
    const setupGuide = !hasDeepScan ? `
      <div class="section info-section">
        <h3>\uD83D\uDD27 ${this._lang === 'pl' ? 'Zaawansowany skan plikow' : 'Advanced file scan'}</h3>
        <p style="font-size:13px;color:var(--bento-text-secondary);margin-bottom:12px;">
          ${this._lang === 'pl'
            ? 'Podstawowy skan (Sprawdz config) dziala bez konfiguracji. Aby uruchomic pelny skan BOM/mojibake wszystkich plikow YAML, dodaj do <code>configuration.yaml</code>:'
            : 'Basic scan (Check config) works without setup. To enable full BOM/mojibake scanning of all YAML files, add to <code>configuration.yaml</code>:'}
        </p>
        <div class="setup-code"><code>shell_command:
  scan_encoding: "python3 /config/python_scripts/encoding_scanner.py"
  fix_encoding: "python3 /config/python_scripts/encoding_scanner.py fix"</code></div>
        <p style="font-size:12px;color:var(--bento-text-secondary);margin-top:8px;">
          ${this._lang === 'pl'
            ? 'Skrypt <code>encoding_scanner.py</code> jest dolaczony w repozytorium ha-tools-panel. Skopiuj go do <code>/config/python_scripts/</code> i zrestartuj HA.'
            : 'The <code>encoding_scanner.py</code> script is included in the ha-tools-panel repository. Copy it to <code>/config/python_scripts/</code> and restart HA.'}
        </p>
      </div>
    ` : '';

    return `
      <div class="section">
        <div class="scan-header">
          <h3>${t.yamlTitle}</h3>
          <div class="scan-buttons">
            <button class="btn btn-primary" data-action="check-config" ${this._yamlScanning ? 'disabled' : ''}>
              ${this._lang === 'pl' ? 'Sprawdz config' : 'Check config'}
            </button>
            ${hasDeepScan ? `<button class="btn btn-primary" data-action="scan-yaml-deep" ${this._yamlScanning ? 'disabled' : ''}>
              ${this._lang === 'pl' ? 'Pelny skan BOM/mojibake' : 'Full BOM/mojibake scan'}
            </button>` : ''}
          </div>
        </div>
        <p class="section-desc">${t.yamlDesc}</p>
        ${scanStatus}
      </div>
      ${resultsHtml}
      ${setupGuide}
    `;
  }

  _getCSS() {
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
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

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
}

* { box-sizing: border-box; margin: 0; padding: 0; }

.container {
  max-width: 900px;
  margin: 0 auto;
  padding: 20px;
  color: var(--bento-text);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  padding: 16px 20px;
  background: var(--bento-card);
  border-radius: var(--bento-radius);
  box-shadow: var(--bento-shadow);
  border: 1px solid var(--bento-border);
}

.header-left { display: flex; align-items: center; gap: 10px; }
.header-icon { font-size: 24px; }
.header h2 { font-size: 18px; font-weight: 600; color: var(--bento-text); }

.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  background: var(--bento-card);
  padding: 4px;
  border-radius: var(--bento-radius-sm);
  border: 1px solid var(--bento-border);
}

.tab-btn {
  flex: 1;
  padding: 10px 16px;
  border: none;
  background: transparent;
  color: var(--bento-text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border-radius: var(--bento-radius-xs);
  transition: var(--bento-transition);
}

.tab-btn:hover { background: rgba(59,130,246,0.06); color: var(--bento-text); }
.tab-btn.active { background: var(--bento-primary); color: #fff; }

.section {
  background: var(--bento-card);
  border-radius: var(--bento-radius);
  padding: 16px 20px;
  margin-bottom: 12px;
  box-shadow: var(--bento-shadow);
  border: 1px solid var(--bento-border);
}

.section h3 { font-size: 14px; font-weight: 600; margin-bottom: 12px; color: var(--bento-text); }
.section-desc { font-size: 13px; color: var(--bento-text-secondary); margin-bottom: 12px; }

.scan-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.scan-header h3 { margin-bottom: 0; }

.scan-buttons { display: flex; gap: 6px; flex-wrap: wrap; }

.setup-code {
  padding: 12px;
  background: var(--bento-bg);
  border-radius: var(--bento-radius-xs);
  border: 1px solid var(--bento-border);
  overflow-x: auto;
}

.setup-code code {
  font-size: 12px;
  white-space: pre;
  color: var(--bento-text);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
}

/* Buttons */
.btn {
  padding: 10px 20px;
  border: none;
  border-radius: var(--bento-radius-sm);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: var(--bento-transition);
}

.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-sm { padding: 6px 12px; font-size: 12px; border-radius: var(--bento-radius-xs); }
.btn-primary { background: var(--bento-primary); color: #fff; }
.btn-primary:hover { background: var(--bento-primary-hover); }
.btn-secondary { background: var(--bento-bg); color: var(--bento-text); border: 1px solid var(--bento-border); }
.btn-danger { background: var(--bento-error); color: #fff; }

/* Progress */
.scan-progress {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}

.progress-bar {
  flex: 1;
  height: 6px;
  background: var(--bento-border);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--bento-primary);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.progress-text { font-size: 12px; color: var(--bento-text-secondary); white-space: nowrap; }

.spinner-small {
  width: 16px;
  height: 16px;
  border: 2px solid var(--bento-border);
  border-top-color: var(--bento-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* Test section */
.test-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--bento-border);
  border-radius: var(--bento-radius-xs);
  font-size: 13px;
  color: var(--bento-text);
  background: var(--bento-bg);
  resize: vertical;
  font-family: monospace;
}

.test-result { margin-top: 8px; }
.test-found { color: var(--bento-warning); font-size: 13px; padding: 8px; background: rgba(245,158,11,0.08); border-radius: var(--bento-radius-xs); }
.test-ok { color: var(--bento-success); font-size: 13px; padding: 8px; }

/* Results */
.results-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.results-header h3 { margin-bottom: 0; }
.results-actions { display: flex; gap: 6px; flex-wrap: wrap; }

.result-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--bento-border);
  font-size: 12px;
}

.result-row:last-child { border-bottom: none; }
.result-check { flex-shrink: 0; }
.result-check input { width: 16px; height: 16px; accent-color: var(--bento-primary); }
.result-entity { font-weight: 500; min-width: 200px; word-break: break-all; }
.result-attr { color: var(--bento-text-secondary); min-width: 80px; }
.result-original { color: var(--bento-error); font-family: monospace; max-width: 150px; overflow: hidden; text-overflow: ellipsis; }
.result-arrow { color: var(--bento-text-secondary); }
.result-fixed { color: var(--bento-success); font-family: monospace; max-width: 150px; overflow: hidden; text-overflow: ellipsis; }

/* Lovelace */
.lovelace-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--bento-border);
  font-size: 13px;
}

.lovelace-row:last-child { border-bottom: none; }
.lovelace-url { flex: 1; font-family: monospace; font-size: 12px; word-break: break-all; }
.lovelace-type { color: var(--bento-text-secondary); min-width: 60px; font-size: 11px; }
.lovelace-issue { font-weight: 600; min-width: 100px; }
.issue-bom { color: var(--bento-error); }
.issue-duplicate { color: var(--bento-warning); }
.issue-mojibake { color: var(--bento-error); }
.issue-broken_url { color: var(--bento-error); }
.manual-fix { font-size: 16px; }
.lovelace-warning { margin-top: 12px; padding: 10px; background: rgba(245,158,11,0.08); border-radius: var(--bento-radius-xs); font-size: 12px; color: var(--bento-warning); }

/* Patterns */
.patterns-section { opacity: 0.8; }
.patterns-desc { font-size: 12px; color: var(--bento-text-secondary); margin-bottom: 8px; }
.patterns-grid { font-size: 13px; font-family: monospace; line-height: 1.8; }
.pattern-bad { color: var(--bento-error); background: rgba(239,68,68,0.06); padding: 1px 4px; border-radius: 3px; }
.pattern-good { color: var(--bento-success); background: rgba(16,185,129,0.06); padding: 1px 4px; border-radius: 3px; }

/* BOM info */
.info-section { opacity: 0.85; }
.info-section p { font-size: 13px; color: var(--bento-text-secondary); margin-bottom: 8px; }
.bom-visual { font-family: monospace; font-size: 14px; padding: 8px 12px; background: var(--bento-bg); border-radius: var(--bento-radius-xs); }
.bom-visual code { color: var(--bento-primary); font-weight: 600; }

/* Log */
.log-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--bento-border);
  font-size: 12px;
}

.log-row:last-child { border-bottom: none; }
.log-date { min-width: 100px; color: var(--bento-text-secondary); font-variant-numeric: tabular-nums; }
.log-type { font-size: 14px; }
.log-target { flex: 1; font-family: monospace; font-size: 11px; word-break: break-all; }
.log-result { min-width: 60px; font-weight: 600; }
.log-success { color: var(--bento-success); }
.log-failed { color: var(--bento-error); }
.log-detail { color: var(--bento-text-secondary); font-size: 11px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; }

/* YAML rows */
.yaml-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 0;
  border-bottom: 1px solid var(--bento-border);
  font-size: 13px;
  flex-wrap: wrap;
}

.yaml-row:last-child { border-bottom: none; }
.yaml-file { font-family: monospace; font-weight: 500; min-width: 180px; word-break: break-all; }
.yaml-line { color: var(--bento-text-secondary); min-width: 40px; font-family: monospace; }
.yaml-issue { font-weight: 600; min-width: 90px; }
.yaml-detail { color: var(--bento-text-secondary); font-size: 12px; flex: 1; }
.yaml-context { width: 100%; margin-top: 4px; }
.yaml-context code {
  display: block;
  padding: 6px 10px;
  background: var(--bento-bg);
  border-radius: var(--bento-radius-xs);
  font-size: 12px;
  color: var(--bento-text);
  overflow-x: auto;
  white-space: pre;
}

/* Empty state */
.empty-state { text-align: center; padding: 32px; color: var(--bento-text-secondary); font-size: 14px; }

/* Toast */
.toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%) translateY(100px);
  padding: 12px 24px;
  border-radius: var(--bento-radius-sm);
  font-size: 13px;
  font-weight: 500;
  z-index: 1000;
  opacity: 0;
  transition: all 0.3s ease;
  pointer-events: none;
}

.toast-show { transform: translateX(-50%) translateY(0); opacity: 1; }
.toast-success { background: var(--bento-success); color: #fff; }
.toast-error { background: var(--bento-error); color: #fff; }
.toast-info { background: var(--bento-primary); color: #fff; }

/* Responsive */
@media (max-width: 768px) {
  .container { padding: 12px; }
  .result-row { flex-wrap: wrap; }
  .result-entity { min-width: 100%; }
  .results-actions { width: 100%; }
  .scan-header { flex-direction: column; gap: 8px; align-items: flex-start; }
  .lovelace-row { flex-wrap: wrap; }
  .log-row { flex-wrap: wrap; }
}

@media (max-width: 480px) {
  .results-actions { flex-direction: column; }
  .results-actions .btn-sm { width: 100%; }
}
`;
  }
}

if (!customElements.get('ha-encoding-fixer')) {
  customElements.define('ha-encoding-fixer', HaEncodingFixer);
}
