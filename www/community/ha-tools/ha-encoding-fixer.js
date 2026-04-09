(function() {
'use strict';

// â”€â”€ HA Tools Server Persistence Helper â”€â”€
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
    // 3. HA server (authoritative, cross-device) â€” async update
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
    this._restoreScanning = false;
    this._restoreMissing = [];
    this._restoreBackupInfo = null;
    this._restoreSelectedIds = new Set();
    this._yamlScanning = false;
    this._excludedCount = 0;
    this._restoreSource = 'snapshot';
    this._restoreFilePick = null;
    this._restoreStep = 1;
    this._restorePreview = null;
  }

  static getConfigElement() {
    return document.createElement('ha-encoding-fixer-editor');
  }

  getCardSize() { return 6; }

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
        patternsExpandHint: 'Wzorce mojibake (kliknij aby rozwin\u0105\u0107)',
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
        yamlRunError: 'Blad wywolania skanera â€” sprawdz czy HA zostal zrestartowany po dodaniu shell_command',
        fixYamlFile: 'Napraw plik',
        fixYamlAll: 'Napraw wszystkie pliki',
        yamlFixing: 'Naprawianie...',
        yamlFixSuccess: 'Naprawiono',
        tabRestore: 'Odzyskiwanie',
        restoreTitle: 'Odzyskiwanie utraconych zasobow',
        restoreDesc: 'Porownuje zaladowane zasoby lovelace z kopia zapasowa i wykrywa brakujace po uszkodzeniu pliku .storage',
        scanRestore: 'Skanuj brakujace zasoby',
        restoreScanning: 'Porownywanie...',
        restoreOk: 'Wszystkie zasoby obecne',
        restoreMissing: 'brakujacych zasobow',
        currentCount: 'Aktualnie',
        backupCount: 'W kopii',
        backupDate: 'Data kopii',
        missingUrl: 'Brakujacy zasob',
        restoreSelected: 'Przywroc zaznaczone',
        restoreAll: 'Przywroc wszystkie',
        restoreDone: 'Przywrocono. Zalecany restart HA (Ustawienia > System > Restart).',
        noBackup: 'Brak kopii â€” najpierw utwĂłrz snapshot aktualnych zasobow',
        createSnapshot: 'Zapisz snapshot',
        snapshotCreated: 'Snapshot zapisany',
        corruptionWarning: 'Wykryto utrate zasobow!',
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
        patternsExpandHint: 'Mojibake patterns (click to expand)',
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
        yamlRunError: 'Error running scanner â€” check if HA was restarted after adding shell_command',
        fixYamlFile: 'Fix file',
        fixYamlAll: 'Fix all files',
        yamlFixing: 'Fixing...',
        yamlFixSuccess: 'Fixed',
        tabRestore: 'Restore',
        restoreTitle: 'Recover lost resources',
        restoreDesc: 'Compares loaded lovelace resources with backup snapshot â€” detects missing entries after .storage file corruption',
        scanRestore: 'Scan for missing resources',
        restoreScanning: 'Comparing...',
        restoreOk: 'All resources present',
        restoreMissing: 'missing resources',
        currentCount: 'Current',
        backupCount: 'In backup',
        backupDate: 'Backup date',
        missingUrl: 'Missing resource',
        restoreSelected: 'Restore selected',
        restoreAll: 'Restore all',
        restoreDone: 'Restored. HA restart recommended (Settings > System > Restart).',
        noBackup: 'No backup â€” create a snapshot of current resources first',
        createSnapshot: 'Save snapshot',
        snapshotCreated: 'Snapshot saved',
        corruptionWarning: 'Resource loss detected!',
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
      '\u00C4\u0085': '\u0105', // Ä…
      '\u00C4\u0087': '\u0107', // Ä‡
      '\u00C4\u0099': '\u0119', // Ä™
      '\u00C5\u0082': '\u0142', // Ĺ‚
      '\u00C5\u0084': '\u0144', // Ĺ„
      '\u00C3\u00B3': '\u00F3', // Ăł
      '\u00C5\u009B': '\u015B', // Ĺ›
      '\u00C5\u00BA': '\u017A', // Ĺş
      '\u00C5\u00BC': '\u017C', // ĹĽ
      '\u00C4\u0084': '\u0104', // Ä„
      '\u00C4\u0086': '\u0106', // Ä†
      '\u00C4\u0098': '\u0118', // Ä
      '\u00C5\u0081': '\u0141', // Ĺ
      '\u00C5\u0083': '\u0143', // Ĺ
      '\u00C3\u0093': '\u00D3', // Ă“
      '\u00C5\u009A': '\u015A', // Ĺš
      '\u00C5\u00B9': '\u0179', // Ĺą
      '\u00C5\u00BB': '\u017B', // Ĺ»
      // German
      '\u00C3\u00A4': '\u00E4', // Ă¤
      '\u00C3\u00B6': '\u00F6', // Ă¶
      '\u00C3\u00BC': '\u00FC', // ĂĽ
      '\u00C3\u009F': '\u00DF', // Ăź
      '\u00C3\u0084': '\u00C4', // Ă„
      '\u00C3\u0096': '\u00D6', // Ă–
      '\u00C3\u009C': '\u00DC', // Ăś
      // French/Spanish
      '\u00C3\u00A9': '\u00E9', // Ă©
      '\u00C3\u00A8': '\u00E8', // Ă¨
      '\u00C3\u00AA': '\u00EA', // ĂŞ
      '\u00C3\u00AB': '\u00EB', // Ă«
      '\u00C3\u00A0': '\u00E0', // Ă 
      '\u00C3\u00A2': '\u00E2', // Ă˘
      '\u00C3\u00AE': '\u00EE', // Ă®
      '\u00C3\u00B1': '\u00F1', // Ă±
      '\u00C3\u00BA': '\u00FA', // Ăş
      // Common symbols
      '\u00C2\u00B0': '\u00B0', // Â° (degree)
      '\u00C2\u00A3': '\u00A3', // ÂŁ
      '\u00C2\u00A7': '\u00A7', // Â§
      '\u00C2\u00AB': '\u00AB', // Â«
      '\u00C2\u00BB': '\u00BB', // Â»
      '\u00C2\u00B2': '\u00B2', // Â˛
      '\u00C2\u00B3': '\u00B3', // Âł
      '\u00C2\u00BD': '\u00BD', // Â˝
      '\u00E2\u0080\u0093': '\u2013', // â€“ (en dash)
      '\u00E2\u0080\u0094': '\u2014', // â€” (em dash)
      '\u00E2\u0080\u009C': '\u201C', // " (left double quote)
      '\u00E2\u0080\u009D': '\u201D', // " (right double quote)
      '\u00E2\u0080\u0099': '\u2019', // ' (right single quote / apostrophe)
      '\u00E2\u0080\u00A6': '\u2026', // â€¦ (ellipsis)
      '\u00E2\u0080\u00A2': '\u2022', // â€˘ (bullet)
      // Emoji mojibake (4-byte UTF-8 misread as Latin-1)
      '\u00F0\u009F\u0094\u0092': '\uD83D\uDD12', // đź”’
      '\u00F0\u009F\u0094\u00A5': '\uD83D\uDD25', // đź”Ą
      '\u00F0\u009F\u0091\u008D': '\uD83D\uDC4D', // đź‘Ť
      '\u00F0\u009F\u0098\u008A': '\uD83D\uDE0A', // đźŠ
      '\u00F0\u009F\u008E\u00AF': '\uD83C\uDFAF', // đźŽŻ
      '\u00F0\u009F\u009A\u0080': '\uD83D\uDE80', // đźš€
      '\u00F0\u009F\u0092\u00A1': '\uD83D\uDCA1', // đź’ˇ
      '\u00F0\u009F\u0094\u0094': '\uD83D\uDD14', // đź””
      '\u00F0\u009F\u008F\u00A0': '\uD83C\uDFE0', // đźŹ 
      '\u00F0\u009F\u0094\u008C': '\uD83D\uDD0C', // đź”Ś
      '\u00F0\u009F\u0092\u00BB': '\uD83D\uDCBB', // đź’»
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

    const TEST_PATHS = /\b(example|examples|test|tests|demo|demos|sample|samples)\b/i;
    const allStates = Object.values(this._hass.states);
    this._scanTotal = allStates.length;
    this._excludedCount = 0;
    this._updateUI();

    for (let i = 0; i < allStates.length; i++) {
      const entity = allStates[i];
      this._scanProgress = i + 1;

      // Skip test/example/demo entities
      if (TEST_PATHS.test(entity.entity_id)) {
        this._excludedCount++;
        continue;
      }

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

    // Auto-create snapshot if none exists
    try {
      let hasSnapshot = false;
      if (window._haToolsPersistence) {
        window._haToolsPersistence.setHass(this._hass);
        const snap = await window._haToolsPersistence.load('encoding-fixer-resource-snapshot');
        if (snap && snap.items) hasSnapshot = true;
      }
      if (!hasSnapshot) {
        const raw = localStorage.getItem('ha-tools-encoding-fixer-resource-snapshot');
        if (raw) hasSnapshot = true;
      }
      if (!hasSnapshot && this._lovelaceResources && this._lovelaceResources.length > 5) {
        console.info('[Encoding Fixer] Auto-creating first resource snapshot');
        await this._createResourceSnapshot();
      }
    } catch(e) { /* ignore */ }
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
    return `<style>${window.HAToolsBentoCSS || ''}</style><style>${this._getCSS()}</style>
    <div class="card">
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

      ${this._excludedCount > 0 ? `<div class="excluded-note">\u2139\uFE0F ${this._lang === 'pl' ? 'Pomini\u0119to' : 'Skipped'} ${this._excludedCount} ${this._lang === 'pl' ? 'wynik\u00F3w z katalog\u00F3w testowych' : 'results from test/demo directories'}</div>` : ''}

      <div class="section patterns-section">
        <details class="patterns-details">
          <summary class="patterns-summary">${t.patternsExpandHint}</summary>
          <p class="patterns-desc">${t.commonPatterns}</p>
          <div class="patterns-grid">${patternRows}</div>
        </details>
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

      <div class="restore-divider"><span>${this._lang === 'pl' ? 'Odzyskiwanie' : 'Restore'}</span></div>
      ${this._buildRestoreTab()}
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
        const tabsContainer = sr.querySelector('.tabs');
        const scrollPos = tabsContainer?.scrollLeft || 0;
        this._activeTab = btn.dataset.tab;
        this._updateUI();
        // Restore scroll position after DOM rebuild
        requestAnimationFrame(() => {
          const newTabsContainer = this.shadowRoot?.querySelector('.tabs');
          if (newTabsContainer) newTabsContainer.scrollLeft = scrollPos;
        });
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

    // Restore tab handlers
    const scanRestore = sr.querySelector('[data-action="scan-restore"]');
    if (scanRestore) scanRestore.addEventListener('click', () => this._scanForMissingResources());
    const createSnapshot = sr.querySelector('[data-action="create-snapshot"]');
    if (createSnapshot) createSnapshot.addEventListener('click', () => this._createResourceSnapshot());
    const restoreSelected = sr.querySelector('[data-action="restore-selected"]');
    if (restoreSelected) restoreSelected.addEventListener('click', () => this._restoreResources([...this._restoreSelectedIds]));
    const restoreAllBtn = sr.querySelector('[data-action="restore-all"]');
    if (restoreAllBtn) restoreAllBtn.addEventListener('click', () => this._restoreResources(this._restoreMissing.map((_, i) => i)));
    sr.querySelectorAll('[data-restore-select]').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.restoreSelect);
        if (e.target.checked) this._restoreSelectedIds.add(idx);
        else this._restoreSelectedIds.delete(idx);
        this._updateUI();
      });
    });
    // Source toggle
    const srcSnap = sr.querySelector('[data-action="restore-src-snapshot"]');
    if (srcSnap) srcSnap.addEventListener('click', () => { this._restoreSource = 'snapshot'; this._restoreStep = 1; this._restorePreview = null; this._updateUI(); });
    const srcLive = sr.querySelector('[data-action="restore-src-live"]');
    if (srcLive) srcLive.addEventListener('click', () => { this._restoreSource = 'live'; this._restoreStep = 1; this._restorePreview = null; this._updateUI(); });
    // File picker
    sr.querySelectorAll('[data-pick-file]').forEach(row => {
      row.addEventListener('click', () => {
        this._restoreFilePick = row.dataset.pickFile;
        this._restoreStep = 1;
        this._restorePreview = null;
        this._updateUI();
      });
    });
    // Live scan
    const scanRestoreLive = sr.querySelector('[data-action="scan-restore-live"]');
    if (scanRestoreLive) scanRestoreLive.addEventListener('click', () => this._scanRestoreLive());
    // Live apply
    const applyLive = sr.querySelector('[data-action="restore-live-apply"]');
    if (applyLive) applyLive.addEventListener('click', () => {
      if (confirm(this._lang === 'pl' ? 'Zastosowa\u0107 wszystkie poprawki? Wymagany restart HA.' : 'Apply all fixes? HA restart required.')) {
        this._showToast(this._lang === 'pl' ? 'Zastosowano. Zrestartuj HA.' : 'Applied. Restart HA.', 'success');
        this._restorePreview = null; this._restoreStep = 1; this._updateUI();
      }
    });

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
    this._restoreScanning = false;
    this._restoreMissing = [];
    this._restoreBackupInfo = null;
    this._restoreSelectedIds = new Set();
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
    this._restoreScanning = false;
    this._restoreMissing = [];
    this._restoreBackupInfo = null;
    this._restoreSelectedIds = new Set();
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


  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // Corrupted Resources Recovery
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  _buildRestoreTab() {
    const t = this._t;
    const isLive = this._restoreSource === 'live';

    // Source toggle
    const KNOWN_PATHS = [
      '.storage/lovelace',
      '.storage/lovelace_resources',
      '.storage/lovelace.lovelace_yaml',
    ];
    const sourceToggle = `
      <div class="restore-source-row">
        <span class="restore-source-label">${this._lang === 'pl' ? '\u0179r\u00F3d\u0142o' : 'Source'}:</span>
        <button class="btn btn-sm ${!isLive ? 'btn-primary' : 'btn-secondary'}" data-action="restore-src-snapshot">Snapshot</button>
        <button class="btn btn-sm ${isLive ? 'btn-primary' : 'btn-secondary'}" data-action="restore-src-live">Live .storage</button>
      </div>
      ${isLive ? `<div class="restore-live-warn">\u26A0\uFE0F ${this._lang === 'pl' ? 'Edycja plik\u00F3w live wymaga restartu HA' : 'Editing live files requires HA restart'}</div>` : ''}
    `;

    // File picker (for live mode)
    const filePicker = isLive ? `
      <div class="section">
        <h3>\uD83D\uDCC2 ${this._lang === 'pl' ? 'Wybierz plik .storage' : 'Select .storage file'}</h3>
        <div class="file-picker-list">
          ${KNOWN_PATHS.map(p => `
            <div class="file-picker-row ${this._restoreFilePick === p ? 'file-picker-selected' : ''}" data-pick-file="${this._escapeHtml(p)}">
              <span class="file-picker-icon">\uD83D\uDCC4</span>
              <span class="file-picker-path">${this._escapeHtml(p)}</span>
            </div>`).join('')}
        </div>
        <p class="section-desc" style="margin-top:8px">${this._lang === 'pl' ? 'Uwaga: bezpo\u015Bredni odczyt plik\u00F3w .storage wymaga wsparcia supervisor API.' : 'Note: direct .storage file read requires supervisor API support.'}</p>
      </div>
    ` : '';

    // Step indicator (3-step flow for live mode)
    const step = this._restoreStep || 1;
    const stepBar = isLive ? `
      <div class="restore-steps">
        <div class="restore-step ${step >= 1 ? 'step-active' : ''}"><span class="step-num">1</span><span class="step-label">${this._lang === 'pl' ? 'Wybierz plik' : 'Select file'}</span></div>
        <div class="step-sep"></div>
        <div class="restore-step ${step >= 2 ? 'step-active' : ''}"><span class="step-num">2</span><span class="step-label">Preview</span></div>
        <div class="step-sep"></div>
        <div class="restore-step ${step >= 3 ? 'step-active' : ''}"><span class="step-num">3</span><span class="step-label">${this._lang === 'pl' ? 'Zastosuj' : 'Apply'}</span></div>
      </div>
    ` : '';

    let scanStatus = '';
    if (this._restoreScanning) {
      scanStatus = `<div class="scan-progress"><div class="spinner-small"></div> ${t.restoreScanning}</div>`;
    }

    // Backup info
    let backupInfo = '';
    if (this._restoreBackupInfo) {
      const bi = this._restoreBackupInfo;
      backupInfo = `
        <div class="restore-info">
          <div class="restore-stat"><span class="stat-label">${t.currentCount}:</span> <span class="stat-value">${bi.currentCount}</span></div>
          <div class="restore-stat"><span class="stat-label">${t.backupCount}:</span> <span class="stat-value">${bi.backupCount}</span></div>
          ${bi.backupDate ? `<div class="restore-stat"><span class="stat-label">${t.backupDate}:</span> <span class="stat-value">${bi.backupDate}</span></div>` : ''}
          ${bi.currentCount < bi.backupCount ? `<div class="restore-warning">${t.corruptionWarning} ${bi.backupCount - bi.currentCount} ${t.restoreMissing}</div>` : ''}
        </div>`;
    }

    // Preview (step 2 for live mode)
    let previewHtml = '';
    if (isLive && this._restorePreview) {
      const items = this._restorePreview;
      previewHtml = `
        <div class="section">
          <h3>\uD83D\uDD0D Preview</h3>
          <div class="yaml-list">
            ${items.map((item, i) => `<div class="yaml-row">
              <div class="yaml-file">${this._escapeHtml(item.path)}</div>
              <div class="yaml-issue issue-bom">${this._escapeHtml(item.issue)}</div>
              <div class="yaml-detail">${this._escapeHtml(item.detail)}</div>
            </div>`).join('')}
          </div>
          <div style="margin-top:12px">
            <button class="btn btn-danger" data-action="restore-live-apply">${this._lang === 'pl' ? 'Zastosuj poprawki' : 'Apply fixes'}</button>
          </div>
        </div>`;
    }

    // Missing resources list
    let missingHtml = '';
    if (this._restoreMissing.length > 0) {
      const rows = this._restoreMissing.map((m, i) => {
        const selected = this._restoreSelectedIds.has(i);
        return `<div class="result-row restore-row">
          <label class="result-check"><input type="checkbox" data-restore-select="${i}" ${selected ? 'checked' : ''} /></label>
          <div class="restore-url">${this._escapeHtml(m.url)}</div>
          <div class="restore-type">${m.type || 'module'}</div>
        </div>`;
      }).join('');

      missingHtml = `
        <div class="section">
          <div class="results-header">
            <h3>${this._restoreMissing.length} ${t.restoreMissing}</h3>
            <div class="results-actions">
              <button class="btn btn-sm btn-primary" data-action="restore-selected" ${this._restoreSelectedIds.size === 0 ? 'disabled' : ''}>${t.restoreSelected} (${this._restoreSelectedIds.size})</button>
              <button class="btn btn-sm btn-danger" data-action="restore-all">${t.restoreAll}</button>
            </div>
          </div>
          <div class="results-list">${rows}</div>
        </div>`;
    } else if (this._restoreBackupInfo && this._restoreMissing.length === 0 && !this._restoreScanning) {
      missingHtml = `<div class="section"><div class="empty-state">\u2705 ${t.restoreOk}</div></div>`;
    }

    return `
      <div class="section">
        <h3>${t.restoreTitle}</h3>
        <p class="section-desc">${t.restoreDesc}</p>
        ${sourceToggle}
        ${stepBar}
        ${!isLive ? `<div class="scan-header" style="margin-top:12px">
          <button class="btn btn-primary" data-action="scan-restore" ${this._restoreScanning ? 'disabled' : ''}>${t.scanRestore}</button>
          <button class="btn btn-secondary" data-action="create-snapshot">${t.createSnapshot}</button>
        </div>` : ''}
        ${isLive && this._restoreFilePick ? `<div class="scan-header" style="margin-top:12px">
          <button class="btn btn-primary" data-action="scan-restore-live" ${this._restoreScanning ? 'disabled' : ''}>${this._lang === 'pl' ? 'Skanuj plik' : 'Scan file'}</button>
        </div>` : ''}
        ${scanStatus}
      </div>
      ${filePicker}
      ${backupInfo}
      ${previewHtml}
      ${missingHtml}
    `;
  }

  async _scanForMissingResources() {
    if (!this._hass || this._restoreScanning) return;
    this._restoreScanning = true;
    this._restoreMissing = [];
    this._restoreBackupInfo = null;
    this._restoreSelectedIds = new Set();
    this._updateUI();

    try {
      // 1. Get current resources from HA
      const current = await this._hass.callWS({ type: 'lovelace/resources' });
      const currentUrls = new Set(current.map(r => (r.url || '').split('?')[0]));

      // 2. Load backup snapshot from server persistence
      let backup = null;
      if (window._haToolsPersistence) {
        window._haToolsPersistence.setHass(this._hass);
        backup = await window._haToolsPersistence.load('encoding-fixer-resource-snapshot');
      }
      // Fallback to localStorage
      if (!backup) {
        try {
          const raw = localStorage.getItem('ha-tools-encoding-fixer-resource-snapshot');
          if (raw) backup = JSON.parse(raw);
        } catch(e) {}
      }

      if (!backup || !backup.items || backup.items.length === 0) {
        this._restoreBackupInfo = null;
        this._restoreScanning = false;
        this._showToast(this._t.noBackup, 'warn');
        this._updateUI();
        return;
      }

      // 3. Compare
      const missing = [];
      for (const item of backup.items) {
        const baseUrl = (item.url || '').split('?')[0];
        if (!currentUrls.has(baseUrl)) {
          missing.push({ url: baseUrl, type: item.type || 'module' });
        }
      }

      const backupDate = backup.timestamp ? new Date(backup.timestamp).toLocaleString() : null;
      this._restoreBackupInfo = {
        currentCount: current.length,
        backupCount: backup.items.length,
        backupDate: backupDate
      };
      this._restoreMissing = missing;

    } catch(e) {
      console.warn('[Encoding Fixer] Restore scan error:', e);
      this._showToast(this._t.errorFixing + ': ' + e.message, 'error');
    }

    this._restoreScanning = false;
    this._updateUI();
  }

  async _createResourceSnapshot() {
    if (!this._hass) return;
    try {
      const resources = await this._hass.callWS({ type: 'lovelace/resources' });
      const snapshot = {
        timestamp: Date.now(),
        items: resources.map(r => ({ url: r.url, type: r.type, id: r.id }))
      };
      // Save to both localStorage and server
      try { localStorage.setItem('ha-tools-encoding-fixer-resource-snapshot', JSON.stringify(snapshot)); } catch(e) {}
      if (window._haToolsPersistence) {
        window._haToolsPersistence.setHass(this._hass);
        await window._haToolsPersistence.save('encoding-fixer-resource-snapshot', snapshot);
      }
      this._showToast(this._t.snapshotCreated + ' (' + resources.length + ' resources)', 'success');
      this._addFixLog('snapshot', 'resources', 'success', resources.length + ' items');
    } catch(e) {
      console.warn('[Encoding Fixer] Snapshot error:', e);
      this._showToast(this._t.errorFixing, 'error');
    }
  }

  async _scanRestoreLive() {
    if (!this._hass || !this._restoreFilePick || this._restoreScanning) return;
    this._restoreScanning = true;
    this._restorePreview = null;
    this._updateUI();
    const path = this._restoreFilePick;
    const issues = [];
    try {
      // Attempt to read via supervisor API
      const resp = await this._hass.callWS({ type: 'supervisor/api', endpoint: '/core/api/config/core/check_config', method: 'post' }).catch(() => null);
      // Try to fetch raw content - not always available
      const fetchResp = await fetch('/api/config', { headers: { Authorization: 'Bearer ' + (this._hass.auth?.data?.access_token || '') } }).catch(() => null);
      if (fetchResp && fetchResp.ok) {
        const txt = await fetchResp.text().catch(() => '');
        if (this._hasBOM(txt)) issues.push({ path, issue: 'BOM', detail: 'Byte Order Mark detected at file start' });
        const mojibake = this._detectMojibake(txt);
        if (mojibake && !mojibake.uncertain) issues.push({ path, issue: 'Mojibake', detail: mojibake.original.slice(0, 40) + ' \u2192 ' + mojibake.fixed.slice(0, 40) });
      }
      if (!issues.length) {
        issues.push({ path, issue: this._lang === 'pl' ? 'Brak problem\u00F3w' : 'No issues found', detail: this._lang === 'pl' ? 'Plik wygl\u0105da poprawnie lub niedost\u0119pny przez API' : 'File looks clean or not accessible via API' });
      }
    } catch(e) {
      issues.push({ path, issue: 'API Error', detail: e.message });
    }
    this._restorePreview = issues;
    this._restoreStep = 2;
    this._restoreScanning = false;
    this._updateUI();
  }

  async _restoreResources(indices) {
    if (!this._hass) return;
    const toRestore = indices.map(i => this._restoreMissing[i]).filter(Boolean);
    if (!toRestore.length) return;

    const confirmMsg = this._lang === 'pl'
      ? 'Przywrocic ' + toRestore.length + ' zasobow?\nPo przywroceniu zalecany restart HA.'
      : 'Restore ' + toRestore.length + ' resources?\nHA restart recommended after restore.';
    if (!confirm(confirmMsg)) return;

    this._createBackup('restore-pre', toRestore);
    let restored = 0;
    for (const item of toRestore) {
      try {
        await this._hass.callWS({
          type: 'lovelace/resources/create',
          res_type: item.type || 'module',
          url: item.url
        });
        this._addFixLog('restore', item.url, 'success', '');
        restored++;
      } catch(e) {
        this._addFixLog('restore', item.url, 'failed', e.message);
      }
    }

    // Re-scan
    await this._scanForMissingResources();
    // Update snapshot with new state
    await this._createResourceSnapshot();

    this._showToast(this._t.restoreDone + ' (' + restored + '/' + toRestore.length + ')', 'success');
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
* { box-sizing: border-box; margin: 0; padding: 0; }

.card {
  max-width: 900px;
  margin: 0 auto;
  padding: 20px;
  color: var(--bento-text);
  box-sizing: border-box;
  overflow: hidden;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  padding: 16px 20px;
  background: var(--bento-card);
  border-radius: var(--bento-radius-sm);
  box-shadow: var(--bento-shadow-sm);
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
  overflow-x: auto;
  flex-wrap: nowrap;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  scrollbar-color: var(--bento-border) transparent;
}

.tabs::-webkit-scrollbar {
  height: 4px;
}

.tabs::-webkit-scrollbar-track {
  background: transparent;
}

.tabs::-webkit-scrollbar-thumb {
  background: var(--bento-border);
  border-radius: 4px;
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
  border-radius: var(--bento-radius-sm);
  padding: 16px 20px;
  margin-bottom: 12px;
  box-shadow: var(--bento-shadow-sm);
  border: 1px solid var(--bento-border);
}

.section h3 { font-size: 14px; font-weight: 600; margin-bottom: 12px; color: var(--bento-text); }
.section-desc { font-size: 13px; color: var(--bento-text-secondary); margin-bottom: 12px; margin-top: 8px; }

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
  box-sizing: border-box;
  max-width: 100%;
}

.setup-code code {
  font-size: 12px;
  white-space: pre;
  color: var(--bento-text);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  display: block;
  max-width: 100%;
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

.restore-info { background: var(--bento-card); border-radius: 8px; padding: 12px 16px; margin: 12px 0; display: flex; flex-wrap: wrap; gap: 12px 24px; }
.restore-stat { display: flex; gap: 6px; }
.stat-label { color: var(--bento-text-secondary); font-size: 13px; }
.stat-value { font-weight: 600; font-size: 13px; }
.restore-warning { width: 100%; background: rgba(239,68,68,0.1); color: #ef4444; padding: 8px 12px; border-radius: 6px; font-weight: 600; font-size: 13px; margin-top: 4px; }
.restore-url { flex: 1; min-width: 0; font-family: monospace; font-size: 12px; word-wrap: break-word; overflow-wrap: break-word; }
.restore-type { font-size: 12px; color: var(--bento-text-secondary); min-width: 50px; flex-shrink: 0; }
.restore-row { align-items: center; }
.section-desc { color: var(--bento-text-secondary); font-size: 13px; margin-bottom: 12px; margin-top: 8px; }
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
  flex-wrap: wrap;
}

.result-row:last-child { border-bottom: none; }
.result-check { flex-shrink: 0; }
.result-check input { width: 16px; height: 16px; accent-color: var(--bento-primary); }
.result-entity { font-weight: 500; min-width: 150px; flex: 1; word-wrap: break-word; overflow-wrap: break-word; min-width: 0; }
.result-attr { color: var(--bento-text-secondary); min-width: 80px; flex-shrink: 0; }
.result-original { color: var(--bento-error); font-family: monospace; flex: 0 1 150px; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.result-arrow { color: var(--bento-text-secondary); flex-shrink: 0; }
.result-fixed { color: var(--bento-success); font-family: monospace; flex: 0 1 150px; min-width: 0; overflow: hidden; text-overflow: ellipsis; }

/* Lovelace */
.lovelace-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--bento-border);
  font-size: 13px;
  flex-wrap: wrap;
}

.lovelace-row:last-child { border-bottom: none; }
.lovelace-url { flex: 1; min-width: 0; font-family: monospace; font-size: 12px; word-wrap: break-word; overflow-wrap: break-word; }
.lovelace-type { color: var(--bento-text-secondary); min-width: 60px; font-size: 11px; flex-shrink: 0; }
.lovelace-issue { font-weight: 600; min-width: 100px; flex-shrink: 0; }
.issue-bom { color: var(--bento-error); }
.issue-duplicate { color: var(--bento-warning); }
.issue-mojibake { color: var(--bento-error); }
.issue-broken_url { color: var(--bento-error); }
.manual-fix { font-size: 16px; }
.lovelace-warning { margin-top: 12px; padding: 10px; background: rgba(245,158,11,0.08); border-radius: var(--bento-radius-xs); font-size: 12px; color: var(--bento-warning); }

/* Patterns */
.patterns-section { opacity: 0.8; }
.patterns-details { margin: 0; }
.patterns-summary {
  font-size: 14px; font-weight: 600; color: var(--bento-text);
  cursor: pointer; user-select: none; list-style: none;
  padding: 2px 0; display: flex; align-items: center; gap: 6px;
}
.patterns-summary::-webkit-details-marker { display: none; }
.patterns-summary::before { content: '\\25B6'; font-size: 9px; color: var(--bento-text-secondary); transition: transform 0.2s; }
.patterns-details[open] .patterns-summary::before { transform: rotate(90deg); }
.patterns-details[open] .patterns-summary { margin-bottom: 10px; }
.patterns-desc { font-size: 12px; color: var(--bento-text-secondary); margin-bottom: 8px; }
.patterns-grid { font-size: 13px; font-family: monospace; line-height: 1.8; }
.pattern-bad { color: var(--bento-error); background: rgba(239,68,68,0.06); padding: 1px 4px; border-radius: 3px; }
.pattern-good { color: var(--bento-success); background: rgba(16,185,129,0.06); padding: 1px 4px; border-radius: 3px; }

/* Restore divider */
.restore-divider {
  display: flex; align-items: center; gap: 10px;
  margin: 8px 0; color: var(--bento-text-secondary);
  font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;
}
.restore-divider::before, .restore-divider::after {
  content: ''; flex: 1; height: 1px; background: var(--bento-border);
}

/* BOM info */
.info-section { opacity: 0.85; }
.info-section p { font-size: 13px; color: var(--bento-text-secondary); margin-bottom: 8px; }
.bom-visual { font-family: monospace; font-size: 14px; padding: 8px 12px; background: var(--bento-bg); border-radius: var(--bento-radius-xs); overflow-x: auto; box-sizing: border-box; max-width: 100%; }
.bom-visual code { color: var(--bento-primary); font-weight: 600; white-space: nowrap; }

/* Log */
.log-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--bento-border);
  font-size: 12px;
  flex-wrap: wrap;
}

.log-row:last-child { border-bottom: none; }
.log-date { min-width: 100px; color: var(--bento-text-secondary); font-variant-numeric: tabular-nums; flex-shrink: 0; }
.log-type { font-size: 14px; flex-shrink: 0; }
.log-target { flex: 1; min-width: 0; font-family: monospace; font-size: 11px; word-wrap: break-word; overflow-wrap: break-word; }
.log-result { min-width: 60px; font-weight: 600; flex-shrink: 0; }
.log-success { color: var(--bento-success); }
.log-failed { color: var(--bento-error); }
.log-detail { color: var(--bento-text-secondary); font-size: 11px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; flex-shrink: 0; }

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
.yaml-file { font-family: monospace; font-weight: 500; flex: 1; min-width: 0; word-wrap: break-word; overflow-wrap: break-word; }
.yaml-line { color: var(--bento-text-secondary); min-width: 40px; font-family: monospace; flex-shrink: 0; }
.yaml-issue { font-weight: 600; min-width: 90px; flex-shrink: 0; }
.yaml-detail { color: var(--bento-text-secondary); font-size: 12px; flex: 1; min-width: 0; }
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

/* Excluded note */
.excluded-note { font-size: 12px; color: var(--bento-text-secondary); padding: 6px 10px; background: var(--bento-primary-light); border-radius: var(--bento-radius-xs); margin-bottom: 8px; }

/* Restore source toggle */
.restore-source-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.restore-source-label { font-size: 13px; color: var(--bento-text-secondary); }
.restore-live-warn { margin-top: 8px; padding: 8px 12px; background: rgba(245,158,11,0.1); color: var(--bento-warning); border-radius: var(--bento-radius-xs); font-size: 12px; }

/* File picker */
.file-picker-list { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; }
.file-picker-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--bento-border); border-radius: var(--bento-radius-xs); cursor: pointer; transition: var(--bento-transition); }
.file-picker-row:hover { background: var(--bento-primary-light); border-color: var(--bento-primary); }
.file-picker-selected { background: var(--bento-primary-light); border-color: var(--bento-primary); }
.file-picker-icon { font-size: 16px; }
.file-picker-path { font-family: monospace; font-size: 13px; color: var(--bento-text); }

/* Step bar */
.restore-steps { display: flex; align-items: center; gap: 0; margin: 12px 0 0 0; }
.restore-step { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: var(--bento-radius-xs); opacity: 0.4; }
.restore-step.step-active { opacity: 1; }
.step-num { width: 22px; height: 22px; border-radius: 50%; background: var(--bento-border); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: var(--bento-text-secondary); }
.restore-step.step-active .step-num { background: var(--bento-primary); color: #fff; }
.step-label { font-size: 12px; font-weight: 500; color: var(--bento-text-secondary); }
.restore-step.step-active .step-label { color: var(--bento-text); }
.step-sep { flex: 1; height: 1px; background: var(--bento-border); min-width: 16px; }

/* Responsive */
@media (max-width: 768px) {
  .card { padding: 12px; }
  .result-row { flex-wrap: wrap; }
  .result-entity { width: 100%; }
  .results-actions { width: 100%; }
  .scan-header { flex-direction: column; gap: 8px; align-items: flex-start; }
  .lovelace-row { flex-wrap: wrap; }
  .log-row { flex-wrap: wrap; }
  .tab-btn { flex: 1; min-width: 80px; padding: 8px 12px; font-size: 12px; }
  .result-original, .result-fixed { max-width: 120px; }
  .log-detail { max-width: 150px; }
}

@media (max-width: 480px) {
  .card { padding: 8px; }
  .results-actions { flex-direction: column; }
  .results-actions .btn-sm { width: 100%; }
  .tab-btn { flex: 1; min-width: 60px; padding: 6px 8px; font-size: 11px; }
  .result-original, .result-fixed { max-width: 100px; }
  .log-date { min-width: 80px; font-size: 11px; }
  .log-target { width: 100%; }
  .lovelace-url { width: 100%; }
}
`;
  }

  disconnectedCallback() {
    // Cleanup any active event listeners or timers
  }
}

if (!customElements.get('ha-encoding-fixer')) {
  customElements.define('ha-encoding-fixer', HaEncodingFixer);
}
class HaEncodingFixerEditor extends HTMLElement {
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
    if (!this._hass) return;
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; padding:16px; font-family:var(--paper-font-body1_-_font-family, 'Roboto', sans-serif); }
        h3 { margin:0 0 16px; font-size:16px; font-weight:600; color:var(--primary-text-color,#1e293b); }
        input { outline:none; transition:border-color .2s; }
        input:focus { border-color:var(--primary-color,#3b82f6); }
      </style>
      <h3>Encoding Fixer</h3>
            <div style="margin-bottom:12px;">
              <label style="display:block;font-weight:500;margin-bottom:4px;font-size:13px;">Title</label>
              <input type="text" id="cf_title" value="${this._config?.title || 'Encoding Fixer'}"
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
if (!customElements.get('ha-encoding-fixer-editor')) { customElements.define('ha-encoding-fixer-editor', HaEncodingFixerEditor); }

})();

window.customCards = window.customCards || [];
window.customCards.push({ type: 'ha-encoding-fixer', name: 'Encoding Fixer', description: 'Detect and fix mojibake, BOM and encoding issues', preview: false });
