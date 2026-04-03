/**
 * HA Tools Panel - Dynamic Loader v6
 * Loads ha-tools-panel.js + all individual tool JS files.
 * All tools are loaded in parallel for speed, each independently.
 * Cache-bust timestamp ensures latest versions are always loaded.
 */
(function() {
  // Load Inter font globally
  if (!document.querySelector('link[href*="fonts.googleapis.com/css2?family=Inter"]')) {
    var font = document.createElement('link');
    font.rel = 'stylesheet';
    font.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
    document.head.appendChild(font);
  }

  var BASE = '/local/community/ha-tools/';
  var bust = '?_=' + Date.now();

  function loadScript(file) {
    return new Promise(function(resolve) {
      var s = document.createElement('script');
      s.type = 'text/javascript';
      s.src = BASE + file + bust;
      s.onload = function() { resolve(file); };
      s.onerror = function() { console.warn('[HA Tools] Failed: ' + file); resolve(null); };
      document.head.appendChild(s);
    });
  }

  // Load panel + all tools in parallel (no dependency chain)
  var allFiles = [
    'ha-tools-panel.js',
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

  Promise.all(allFiles.map(loadScript)).then(function(results) {
    var loaded = results.filter(Boolean).length;
    console.info(
      '%c HA Tools %c v3.7.6 \u2014 ' + loaded + '/' + allFiles.length + ' loaded ',
      'background:#3b82f6;color:#fff;font-weight:bold;padding:2px 6px;border-radius:4px 0 0 4px;',
      'background:#e0f2fe;color:#1e40af;font-weight:bold;padding:2px 6px;border-radius:0 4px 4px 0;'
    );
  });
})();
