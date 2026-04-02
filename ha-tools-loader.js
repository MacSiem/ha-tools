/**
 * HA Tools Panel - Dynamic Loader v5
 * Loads ha-tools-panel.js + all individual tool JS files from ha-tools mono-repo.
 * Cache-bust timestamp ensures latest versions are always loaded.
 * Individual tool files register themselves with customElements + window.customCards,
 * making them available as standalone Lovelace cards in the HA dashboard UI editor.
 */
(function() {
  // Load Inter font globally — all components inherit via shadow DOM
  if (!document.querySelector('link[href*="fonts.googleapis.com/css2?family=Inter"]')) {
    const font = document.createElement('link');
    font.rel = 'stylesheet';
    font.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
    document.head.appendChild(font);
  }

  const BASE = '/local/community/ha-tools/';
  const bust = '?_=' + Date.now();

  // Load a JS file and return a promise
  function loadScript(file) {
    return new Promise(function(resolve, reject) {
      var s = document.createElement('script');
      s.type = 'text/javascript';
      s.src = BASE + file + bust;
      s.onload = resolve;
      s.onerror = function() { console.warn('[HA Tools Loader] Failed to load: ' + file); resolve(); };
      document.head.appendChild(s);
    });
  }

  // Load main panel first
  loadScript('ha-tools-panel.js').then(function() {
    // Then load all individual tool files (for standalone Lovelace card registration)
    var tools = [
      'ha-automation-analyzer.js',
      'ha-baby-tracker.js',
      'ha-backup-manager.js',
      'ha-chore-tracker.js',
      'ha-data-exporter.js',
      'ha-device-health.js',
      'ha-encoding-fixer.js',
      'ha-energy-email.js',
      'ha-energy-insights.js',
      'ha-energy-optimizer.js',
      'ha-entity-renamer.js',
      'ha-frigate-privacy.js',
      'ha-log-email.js',
      'ha-network-map.js',
      'ha-purge-cache.js',
      'ha-security-check.js',
      'ha-sentence-manager.js',
      'ha-smart-reports.js',
      'ha-storage-monitor.js',
      'ha-trace-viewer.js',
      'ha-vacuum-water-monitor.js',
      'ha-yaml-checker.js'
    ];

    // Load all tools in parallel
    Promise.all(tools.map(loadScript)).then(function() {
      console.info(
        '%c HA Tools %c v3.7.3 \u2014 ' + tools.length + ' cards registered ',
        'background:#3b82f6;color:#fff;font-weight:bold;padding:2px 6px;border-radius:4px 0 0 4px;',
        'background:#e0f2fe;color:#1e40af;font-weight:bold;padding:2px 6px;border-radius:0 4px 4px 0;'
      );
    });
  });
})();
