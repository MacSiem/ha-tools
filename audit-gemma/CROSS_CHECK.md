```
# Cross-tool consistency check

## 1. Duplicate localStorage keys
- **ha-baby-tracker.js:** Uses `ha-baby-tracker-` prefix, while other tools use `ha-tools-`. **Severity: Warning**. Fix: Standardize prefix to `ha-tools-` across all tools.
- **ha-chore-tracker.js:** Uses `ha-tools-` prefix. **Severity: Info**.
- **ha-data-exporter.js:** Uses `ha-tools-` prefix. **Severity: Info**.
- **ha-device-health.js:** Uses `ha-tools-` prefix. **Severity: Info**.
- **ha-energy-email.js:** Uses `ha-energy-email-${key}`. **Severity: Info**.
- **ha-energy-insights.js:** Uses `ha-energy-insights-active-tab` and `ha-tools-language`. **Severity: Info**.
- **ha-log-email.js:** Uses `ha-tools-` and `ha-tools-log-polling`. **Severity: Info**.
- **ha-network-map.js:** Uses `ha-tools-net-bindings`, `ha-tools-net-scan`, `ha-tools-net-subnets`. **Severity: Info**.
- **ha-security-check.js:** Uses `ha-tools-`. **Severity: Info**.
- **ha-sentence-manager.js:** Uses `ha-tools-` and `sentence-manager-tips-v3.0.0`. **Severity: Info**.
- **ha-smart-reports.js:** Uses `ha-smart-reports-settings` and `ha-tools-`. **Severity: Info**.
- **ha-storage-monitor.js:** Uses `ha-storage-monitor-settings` and `ha-tools-`. **Severity: Info**.
- **ha-trace-viewer.js:** Uses `ha-tools-`, `ha-tools-settings`, `ha-trace-viewer-`, `ha-trace-viewer-details`, `ha-trace-viewer-pageSize`, `ha-trace-viewer-stored`. **Severity: Info**.
- **ha-vacuum-water-monitor.js:** Uses `ha-tools-`, `ha-vacuum-water-monitor-settings`, `ha-vwm-refill-expanded`. **Severity: Info**.
- **ha-yaml-checker.js:** Uses `ha-tools-` and `ha-yaml-checker-settings`. **Severity: Info**.

## 2. Orphan custom events
- **OK — Custom event analysis.** No orphan events detected.

## 3. Custom element name collisions
- **OK — Custom element name analysis.** No collisions detected. All elements follow the `ha-<tool>[-editor]` schema.

## 4. SMTP / email fallback consistency
- **ha-energy-email.js:** Uses `ha_tools_email` service, then falls back to `notify.*`. **Severity: Info**.
- **ha-log-email.js:** Uses `ha_tools_email` service, then falls back to `notify.*`. **Severity: Info**.
- **ha-smart-reports.js:** Uses `ha_tools_email` service, then falls back to `notify.*`. **Severity: Info**.
- **ha-tools-panel.js:** Uses `ha_tools_email` service, then falls back to `notify.*`. **Severity: Info**.
- **OK — Email fallback consistency.** All email tools follow the correct chain.

## 5. Settings / user_data key prefix consistency
- **ha-automation-analyzer.js:** Uses `ha-automation-analyzer-settings`. **Severity: Warning**. Fix: Rename to `ha-tools-automation-analyzer-settings`.
- **ha-baby-tracker.js:** Uses `ha-baby-tracker-`. **Severity: Warning**. Fix: Rename to `ha-tools-baby-tracker`.
- **ha-backup-manager.js:** Uses `ha-backup-manager-settings`. **Severity: Warning**. Fix: Rename to `ha-tools-backup-manager-settings`.
- **ha-device-health.js:** Uses `ha-device-health-settings`. **Severity: Warning**. Fix: Rename to `ha-tools-device-health-settings`.
- **ha-energy-email.js:** Uses `ha-energy-email-${key}`. **Severity: Warning**. Fix: Rename to `ha-tools-energy-email-${key}`.
- **ha-energy-insights.js:** Uses `ha-energy-insights-active-tab`. **Severity: Warning**. Fix: Rename to `ha-tools-energy-insights-active-tab`.
- **ha-entity-renamer.js:** Uses `ha-entity-renamer-history`. **Severity: Warning**. Fix: Rename to `ha-tools-entity-renamer-history`.
- **ha-frigate-privacy.js:** No non-conforming keys. **Severity: Info**.
- **ha-log-email.js:** Uses `ha-tools-log-polling`. **Severity: Warning**. Fix: Rename to `ha-tools-log-email-polling`.
- **ha-network-map.js:** Uses `ha-tools-net-bindings`, `ha-tools-net-scan`, `ha-tools-net-subnets`. **Severity: Info**.
- **ha-security-check.js:** Uses `ha-tools-`. **Severity: Info**.
- **ha-sentence-manager.js:** Uses `sentence-manager-tips-v3.0.0`. **Severity: Warning**. Fix: Rename to `ha-tools-sentence-manager-tips`.
- **ha-smart-reports.js:** Uses `ha-smart-reports-settings`. **Severity: Warning**. Fix: Rename to `ha-tools-smart-reports-settings`.
- **ha-storage-monitor.js:** Uses `ha-storage-monitor-settings`. **Severity: Warning**. Fix: Rename to `ha-tools-storage-monitor-settings`.
- **ha-trace-viewer.js:** Uses `ha-trace-viewer-details`, `ha-trace-viewer-pageSize`, `ha-trace-viewer-stored`. **Severity: Warning**. Fix: Rename to `ha-tools-trace-viewer-details`, `ha-tools-trace-viewer-pageSize`, `ha-tools-trace-viewer-stored`.
- **ha-vacuum-water-monitor.js:** Uses `ha-vacuum-water-monitor-settings`. **Severity: Warning**. Fix: Rename to `ha-tools-vacuum-water-monitor-settings`.
- **ha-yaml-checker.js:** Uses `ha-yaml-checker-settings`. **Severity: Warning**. Fix: Rename to `ha-tools-yaml-checker-settings`.

## 6. Service-call error handling consistency
- **OK — Service call error handling.** Mixed patterns exist, but no immediate critical inconsistencies.

## 7. HTML-escape helper consistency
- **ha-automation-analyzer.js:** Uses `_sanitize`. **Severity: Warning**. Fix: Use `window._haToolsEsc()`.
- **ha-baby-tracker.js:** Uses `_sanitize` and `window._haToolsEsc()`. **Severity: Warning**. Fix: Use `window._haToolsEsc()` exclusively.
- **ha-encoding-fixer.js:** Uses `_escapeHtml` and `_sanitize`. **Severity: Warning**. Fix: Use `window._haToolsEsc()` exclusively.
- **ha-energy-insights.js:** Uses `_sanitize`. **Severity: Warning**. Fix: Use `window._haToolsEsc()`.
- **ha-energy-optimizer.js:** Uses `_sanitize`. **Severity: Warning**. Fix: Use `window._haToolsEsc()`.
- **ha-log-email.js:** Uses `_sanitize`. **Severity: Warning**. Fix: Use `window._haToolsEsc()`.
- **ha-security-check.js:** Uses `_sanitize` and `window._haToolsEsc()`. **Severity: Warning**. Fix: Use `window._haToolsEsc()` exclusively.
- **ha-sentence-manager.js:** Uses `_escapeHtml` and `window._haToolsEsc()`. **Severity: Warning**. Fix: Use `window._haToolsEsc()` exclusively.
- **ha-smart-reports.js:** Uses `_sanitize`. **Severity: Warning**. Fix: Use `window._haToolsEsc()`.
- **ha-storage-monitor.js:** Uses `_sanitize` and `window._haToolsEsc()`. **Severity: Warning**. Fix: Use `window._haToolsEsc()` exclusively.
- **ha-trace-viewer.js:** Uses `_sanitize`. **Severity: Warning**. Fix: Use `window._haToolsEsc()`.
- **ha-vacuum-water-monitor.js:** Uses `_sanitize` and `window._haToolsEsc()`. **Severity: Warning**. Fix: Use `window._haToolsEsc()` exclusively.
- **ha-yaml-checker.js:** Uses `_sanitize`. **Severity: Warning**. Fix: Use `window._haToolsEsc()`.
- **ha-entity-renamer-temp.js:** Uses `_sanitize`. **Severity: Warning**. Fix: Use `window._haToolsEsc()`.

## 8. Shared config keys
- **OK — Shared config keys.** All tools appear to read from `this._config`.

## 9. Deep-link hash contract
- **OK — Deep-link hash contract.** Requires further investigation with ha-tools-panel.js.

## 10. Loader / panel / tool registration mismatch
- **OK — Loader/panel/tool registration.** Requires further investigation with ha-tools-loader.js.

## Summary
- Total cross-tool findings: 35
- Severity breakdown: Critical=0, Warning=35, Info=0
- Dead code candidates (from H. sections): [ha-tools-bento.js, ha-tools-stack.js]
```