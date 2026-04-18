# HA Tools Gemma Audit — Real Issues Report
**Date:** 2026-04-18
**Audit Method:** Gemma via Ollama (local), per-tool + self-critique + cross-check + consolidation
**Model:** gemma3-audit:latest
**Language:** English (mixed PL/EN allowed in quotes from source)

---

## Summary
- Critical: 19 (was 21 — reclassified 2 "hardcoded color" findings as Warning; not security issues)
- Warning: 34 (was 33 — +1 from reclassification, ha-trace-viewer duplicate retained in Warning section)
- Info: 4
- Cross-tool issues: 1
- Dead-code candidates: [ha-tools-bento.js, ha-tools-stack.js]
- Total tokens: (filled in externally)

### Verification status (post-audit manual sweep, 2026-04-18)
All 19 Critical XSS findings verified and fixed. Additional XSS sites found during manual sweep (Gemma missed): ha-security-check.js line 1209, ha-smart-reports.js lines 512/663/664, ha-storage-monitor.js line 944, ha-automation-analyzer.js line 1587, ha-entity-renamer.js line 651, ha-log-email.js lines 611/851 (Gemma only flagged line 567). Files modified: 12. Gemma false-positive observations: line numbers frequently incorrect, sometimes pointing at CSS or comments; template-literal interpolation was not uniformly flagged.

---

## Critical Issues

### ha-backup-manager.js
- **Line 471** — Unescaped user data in innerHTML (backup names)
- **Severity:** Critical
- **Fix:** Apply `window._haToolsEsc()` before innerHTML insertion.
- **Line 1071** — Unescaped user data in innerHTML (config titles)
- **Severity:** Critical
- **Fix:** Apply `window._haToolsEsc()` before innerHTML insertion.

### ha-data-exporter.js
- **Line 313** — Unescaped config title in `<h2>` innerHTML
- **Severity:** Critical
- **Fix:** Escape with `_esc()` before insertion.
- **Line 503** — Unescaped snapshot history state in innerHTML
- **Severity:** Critical
- **Fix:** Use property assignment instead of innerHTML.
- **Line 636** — Unescaped config title in input value attribute
- **Severity:** Critical
- **Fix:** Escape attribute values before insertion.

### ha-device-health.js
- **Line 552** — User/API data inserted into innerHTML without escaping (entity_id)
- **Severity:** Critical
- **Fix:** Apply `window._haToolsEsc()` to all interpolated data.
- **Line 572** — User/API data inserted into innerHTML without escaping (state)
- **Severity:** Critical
- **Fix:** Apply `window._haToolsEsc()` to all interpolated data.
- **Line 617** — User/API data inserted into innerHTML without escaping
- **Severity:** Critical
- **Fix:** Apply `window._haToolsEsc()` to all interpolated data.
- **Line 670** — User/API data inserted into innerHTML without escaping
- **Severity:** Critical
- **Fix:** Apply `window._haToolsEsc()` to all interpolated data.
- **Line 720** — User/API data inserted into innerHTML without escaping
- **Severity:** Critical
- **Fix:** Apply `window._haToolsEsc()` to all interpolated data.

### ha-entity-renamer.js
- **Line 249** — Unsafe innerHTML with unescaped user data
- **Severity:** Critical
- **Fix:** Use `window._haToolsEsc()` before insertion.
- **Line 378** — Unsafe innerHTML with unescaped user data
- **Severity:** Critical
- **Fix:** Use `window._haToolsEsc()` before insertion.
- **Line 426** — Unsafe innerHTML with unescaped user data
- **Severity:** Critical
- **Fix:** Use `window._haToolsEsc()` before insertion.
- **Line 466** — Unsafe innerHTML with unescaped user data
- **Severity:** Critical
- **Fix:** Use `window._haToolsEsc()` before insertion.
- **Line 480** — Unsafe innerHTML with unescaped user data
- **Severity:** Critical
- **Fix:** Use `window._haToolsEsc()` before insertion.

### ha-energy-email.js
- **Line 1030** — Editor input attribute injection (config title, currency, energy_price in input value attributes without escaping quotes)
- **Severity:** Critical
- **Fix:** Escape attribute values before insertion.

### ha-purge-cache.js
- **Lines ~277, ~350** — Unescaped localStorage keys in innerHTML
- **Severity:** Critical
- **Fix:** Apply `window._haToolsEsc()` before insertion.

### ha-sentence-manager.js
- **Line 352** — `config.title` inserted into innerHTML without escaping
- **Severity:** Critical
- **Fix:** Escape with `_esc()` before insertion.
- **Line 726** — Intent names, slot values without escaping
- **Severity:** Critical
- **Fix:** Escape with `_esc()` before insertion.
- **Line 840** — Sentence responses and slot highlights without escaping
- **Severity:** Critical
- **Fix:** Escape with `_esc()` before insertion.
- **Line 1045** — Custom action user data without escaping
- **Severity:** Critical
- **Fix:** Escape with `_esc()` before insertion.

### ha-yaml-checker.js
- **Lines 383, 388, 394, 417, 423, 564, 573** — Unescaped user/API data in innerHTML
- **Severity:** Critical
- **Fix:** Replace `_sanitize()` with `window._haToolsEsc()`.

### ha-log-email.js
- **Line 567** — User config title in shadowRoot.innerHTML without escaping
- **Severity:** Critical
- **Fix:** Apply `window._haToolsEsc()` before insertion.

### ha-network-map.js
- **Lines 899, 1046** — Unescaped user/device data in innerHTML
- **Severity:** Critical
- **Fix:** Apply `window._haToolsEsc()` before insertion.

### ha-vacuum-water-monitor.js
- **Lines ~352, ~726** - Unescaped data in innerHTML
- **Severity:** Critical
- **Fix:** Apply `window._haToolsEsc()` before insertion.

---

## Warning Issues

### ha-baby-tracker.js
- **Lines 361, 411, 540** — Hardcoded English alert strings not translated
- **Severity:** Warning
- **Fix:** Use `_t()` getter for translations.
- **Lines ~240, ~400, ~600, ~700+** — Hardcoded colors instead of Bento tokens
- **Severity:** Warning
- **Fix:** Replace colors with Bento CSS variables.
- **Lines ~260-400** — 40+ inline styles in template literals
- **Severity:** Warning
- **Fix:** Extract inline styles to CSS classes.
- **Missing ARIA roles** on tabs/tab panels
- **Severity:** Warning
- **Fix:** Add ARIA roles/attributes.

### ha-backup-manager.js
- **Lines 44, 56, 83, 133, 520** — Empty catch blocks silently swallowing errors
- **Severity:** Warning
- **Fix:** Add logging (`console.warn`) in catch blocks.
- **Missing ARIA roles** on tabs and buttons
- **Severity:** Warning
- **Fix:** Implement ARIA roles (`tablist`, `tab`, `tabpanel`), keyboard navigation.

### ha-chore-tracker.js
- **Lines ~180-210, 277, 310, 339** — Hardcoded UI strings lack translation
- **Severity:** Warning
- **Fix:** Extract strings into `_t` translation object.
- **Lines 51-56, 62-67** — Empty catch blocks with localStorage errors
- **Severity:** Warning
- **Fix:** Add error logging/fallback in catch blocks.

### ha-data-exporter.js
- **Line 471** — Unescaped `ent.domain` in table cell innerHTML
- **Severity:** Warning
- **Fix:** Escape with `_esc()` before insertion.
- **Lines 438, 471, 474, 480, 524** — Hardcoded English strings missing translation
- **Severity:** Warning
- **Fix:** Add to `_t` translation object.

### ha-device-health.js
- **Lines ~380, 579** — Entity/device names and IDs in HTML attributes without escaping
- **Severity:** Warning
- **Fix:** Escape all attribute values before insertion.
- **Lines ~583, 628, 678** — Untranslated "Show:" label
- **Severity:** Warning
- **Fix:** Add to `_t` translations.
- **Lines 7, 91, 597** — Empty catch blocks
- **Severity:** Warning
- **Fix:** Add `console.error()` logging in catch blocks.

### ha-energy-email.js
- **Lines ~380, 579** — Device names and entity IDs in HTML attributes without escaping
- **Severity:** Warning
- **Fix:** Escape all attribute values before insertion.
- **Lines 164, 171, 183, 253, 260, 269, 280, 287, 294, 301...** — Empty catch blocks
- **Severity:** Warning
- **Fix:** Add `console.error()` logging in all catch blocks.

### ha-energy-insights.js
- **Line 269** — Unescaped entity_id in HTML attribute title
- **Severity:** Warning
- **Fix:** Escape with `_esc()` before insertion.
- **Lines 183, 266** — Weak `_sanitize()` of device names
- **Severity:** Warning
- **Fix:** Use proper escaping.
- **Line 277** — Unescaped error message in innerHTML
- **Severity:** Warning
- **Fix:** Escape with `_esc()` before insertion.
- **Line 300** — Unescaped config values in innerHTML
- **Severity:** Warning
- **Fix:** Escape all values before insertion.

### ha-encoding-fixer.js
- **Line 11** — `@media (prefers-color-scheme: dark)` block (use HA theme variables)
- **Severity:** Warning
- **Fix:** Replace with HA theme variables.
- **Line 11** — Large number of custom properties (refactor)
- **Severity:** Warning
- **Fix:** Refactor to reduce technical debt.
- **Lines ~900, ~1080, ~1110, ~1170, ~1310** — Hardcoded colors in CSS (reclassified from Critical; cosmetic/theming issue, not security)
- **Severity:** Warning
- **Fix:** Replace with Bento CSS tokens.

### ha-frigate-privacy.js
- **Lines ~324-1086** — Many empty catch blocks
- **Missing ARIA roles/labels** on camera cards, quick pause buttons
- **Severity:** Warning
- **Fix:** Add `console.error()` logging; implement ARIA roles and descriptive aria-labels.

### ha-log-email.js
- **Line 567** — User config title in shadowRoot.innerHTML without escaping
- **Severity:** Warning
- **Fix:** Apply `window._haToolsEsc()` before insertion.
- **Lines 27, 130** — Empty catch blocks with comments suggested
- **Severity:** Warning
- **Fix:** Add error logging.

### ha-network-map.js
- **Lines 669, 1012** — Hardcoded English prompt strings
- **Severity:** Warning
- **Fix:** Use `_t()` for prompts.
- **Line 170** — Orphaned localStorage setting
- **Severity:** Warning
- **Fix:** Remove or implement loading for localStorage setting.

### ha-security-check.js
- **Lines ~108, ~155** — XSS in config title and error messages
- **Severity:** Warning
- **Fix:** Apply `window._haToolsEsc()` to all user/config/error data before insertion.

### ha-sentence-manager.js
- **Lines 183, 195, 209, 237, 243, 269, 275, 282, 288, 294, 300** — Empty catch blocks
- **Severity:** Warning
- **Fix:** Add error logging to all catch blocks.

### ha-smart-reports.js
- **Lines ~210 template** — Missing ARIA roles on tabs and controls
- **Severity:** Warning
- **Fix:** Add `role="tablist"`, `role="tab"`, `aria-selected` on tabs; associate labels with controls.

### ha-storage-monitor.js
- **Line 170** — Unescaped error message in innerHTML
- **Severity:** Warning
- **Fix:** Apply `window._haToolsEsc()` to all interpolated data.
- **Lines 182, 220, 290, 784, 840** — Unescaped user/API data
- **Severity:** Warning
- **Fix:** Apply `window._haToolsEsc()` to all interpolated data.

### ha-trace-viewer.js
- **Lines ~580-740** — Hardcoded colors for highlights/error states
- **Severity:** Warning
- **Fix:** Replace with Bento CSS tokens.
- **Lines ~570-830** — Minimal ARIA attributes on interactive elements
- **Severity:** Warning
- **Fix:** Add ARIA roles and states to all interactive elements.

### ha-vacuum-water-monitor.js
- **Lines ~352, ~726** — Unescaped data in innerHTML
- **Severity:** Warning
- **Fix:** Apply `window._haToolsEsc()` before insertion.

### ha-yaml-checker.js
- **Lines 209, 220, 228** — Empty catch blocks
- **Severity:** Warning
- **Fix:** Add `console.warn()` or `console.debug()` logging in catch blocks.

---

## Info Issues

### ha-baby-tracker.js
- **Lines ~260-400** — 40+ inline styles in template literals
- **Severity:** Info
- **Fix:** Move inline styles to CSS classes in component's style block.

### ha-data-exporter.js
- **Lines 438, 471, 474, 480, 524** — Hardcoded English strings missing translation
- **Severity:** Info
- **Fix:** Add to `_t` translation object.

### ha-device-health.js
- **Lines ~583, 628, 678** — Untranslated "Show:" label
- **Severity:** Info
- **Fix:** Add to `_t` translations; use `_t('show')`.

### ha-encoding-fixer.js
- **Line 1:** File name suggests temporary status
- **Severity:** Info
- **Fix:** Confirm file is still needed; rename if appropriate.
- **Line 1:** Hardcoded strings
- **Severity:** Info
- **Fix:** Localize strings.

### ha-energy-optimizer.js
- **Lines 354, 470** — Hardcoded Polish strings
- **Severity:** Info
- **Fix:** Extract to `_t` translation object.

### ha-frigate-privacy.js
- **Lines ~700-800** — Hardcoded rgba colors
- **Severity:** Info
- **Fix:** Use Bento tokens.

### ha-log-email.js
- **Line 567** — Tab labels hardcoded in English
- **Severity:** Info
- **Fix:** Localize tab labels using `_t` getter.
- **Lines 27, 130** — Empty catch blocks with comments suggested
- **Severity:** Info
- **Fix:** Add error logging.

### ha-network-map.js
- **Lines 669, 1012** — Hardcoded English prompt strings
- **Severity:** Info
- **Fix:** Use `_t()` for prompts.
- **Line 170** — Orphaned localStorage setting
- **Severity:** Info
- **Fix:** Remove or implement loading for localStorage setting.

### ha-purge-cache.js
- **Lines ~682-695** — Hardcoded strings
- **Severity:** Info
- **Fix:** Localize strings.

### ha-security-check.js
- **Line ~350** — Incomplete bilingual support
- **Severity:** Info
- **Fix:** Add Polish translations and use `_t` getter.

### ha-sentence-manager.js
- (No additional info-level issues)

### ha-smart-reports.js
- (No info-level issues)

### ha-storage-monitor.js
- (No info-level issues)

### ha-trace-viewer.js
- (No info-level issues)

### ha-vacuum-water-monitor.js
- (No info-level issues)

### ha-yaml-checker.js
- (No info-level issues)

---

## Cross-tool issues

### 1. Duplicate localStorage keys
- **ha-baby-tracker.js:** Uses `ha-baby-tracker-` prefix, while other tools use `ha-tools-`. **Severity: Warning**. Fix: Standardize prefix to `ha-tools-` across all tools.
- **ha-chore-tracker.js:** Uses `ha-tools-` prefix. **Severity: Info**.
- **ha-data-exporter.js:** Uses `ha-tools-` prefix. **Severity: Info**.
- **ha-device-health.js:** Uses `ha-tools-` prefix. **Severity: Info**.
- **ha-energy-email.js:** Uses `ha-energy-email-${key}`. **Severity: Warning**. Fix: Rename to `ha-tools-energy-email-${key}`.
- **ha-energy-insights.js:** Uses `ha-energy-insights-active-tab`. **Severity: Warning**. Fix: Rename to `ha-tools-energy-insights-active-tab`.
- **ha-entity-renamer.js:** Uses `ha-entity-renamer-history`. **Severity: Warning**. Fix: Rename to `ha-tools-entity-renamer-history`.
- **ha-log-email.js:** Uses `ha-tools-log-polling`. **Severity: Warning**. Fix: Rename to `ha-tools-log-email-polling`.
- **ha-network-map.js:** Uses `ha-tools-net-bindings`, `ha-tools-net-scan`, `ha-tools-net-subnets`. **Severity: Info**.
- **ha-security-check.js:** Uses `ha-tools-`. **Severity: Info**.
- **ha-sentence-manager.js:** Uses `sentence-manager-tips-v3.0.0`. **Severity: Warning**. Fix: Rename to `ha-tools-sentence-manager-tips`.
- **ha-smart-reports.js:** Uses `ha-smart-reports-settings`. **Severity: Warning**. Fix: Rename to `ha-tools-smart-reports-settings`.
- **ha-storage-monitor.js:** Uses `ha-storage-monitor-settings`. **Severity: Warning**. Fix: Rename to `ha-tools-storage-monitor-settings`.
- **ha-trace-viewer.js:** Uses `ha-trace-viewer-details`, `ha-trace-viewer-pageSize`, `ha-trace-viewer-stored`. **Severity: Warning**. Fix: Rename to `ha-tools-trace-viewer-details`, `ha-tools-trace-viewer-pageSize`, `ha-tools-trace-viewer-stored`.
- **ha-vacuum-water-monitor.js:** Uses `ha-vacuum-water-monitor-settings`. **Severity: Warning**. Fix: Rename to `ha-tools-vacuum-water-monitor-settings`.
- **ha-yaml-checker.js:** Uses `ha-yaml-checker-settings`. **Severity: Warning**. Fix: Rename to `ha-tools-yaml-checker-settings`.

### 2. Orphan custom events
- **OK**

### 3. Custom element name collisions
- **OK**

### 4. SMTP / email fallback consistency
- **ha-energy-email.js:** Uses `ha_tools_email` service, then falls back to `notify.*`. **Severity: Info**.
- **ha-log-email.js:** Uses `ha_tools_email` service, then falls back to `notify.*`. **Severity: Info**.
- **ha-smart-reports.js:** Uses `ha_tools_email` service, then falls back to `notify.*`. **Severity: Info**.
- **ha-tools-panel.js:** Uses `ha_tools_email` service, then falls back to `notify.*`. **Severity: Info**.

### 5. Settings / user_data key prefix consistency
- **OK**

### 6. Service-call error handling consistency
- **OK**

### 7. HTML-escape helper consistency
- **OK**

### 8. Shared config keys
- **OK**

### 9. Deep-link hash contract
- **OK**

### 10. Loader / panel / tool registration mismatch
- **OK**
