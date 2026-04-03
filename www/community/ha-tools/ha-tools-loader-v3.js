/**
 * HA Tools Panel - Dynamic Loader v3
 * Loads ha-tools-panel.js with cache-bust timestamp.
 * Loads Inter font globally (prevents FOUT in shadow DOM components).
 */
(function() {
  // Load Inter font globally — all components inherit via shadow DOM
  if (!document.querySelector('link[href*="fonts.googleapis.com/css2?family=Inter"]')) {
    const font = document.createElement('link');
    font.rel = 'stylesheet';
    font.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
    document.head.appendChild(font);
  }
  const BASE = '/local/community/ha-tools-panel/ha-tools-panel.js';
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = BASE + '?_=' + Date.now();
  script.onerror = () => console.error('[HA Tools Loader] Failed to load panel:', BASE);
  document.head.appendChild(script);
})();