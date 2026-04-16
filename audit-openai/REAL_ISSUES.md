# HA Tools OpenAI Audit — Real Issues Report
**Date:** 2026-04-16  
**Audit Method:** OpenAI (3 passes) → consolidated with line-level verification  
**Language:** English

---

## Summary

Consolidated OpenAI audit across 22 tools identified **58 real issues** distributed across security, i18n, accessibility, and quality categories.

- **Critical (Security/XSS):** 14 issues
- **Warning (Quality/Robustness):** 30 issues
- **Info (Maintainability/Compliance):** 14 issues
- **False Positives:** 3 (automation-analyzer, smart-reports, yaml-checker)

---

## Critical Issues (XSS Vulnerabilities)

### ha-backup-manager.js
- **Lines 471, 1071** — Unescaped user data in innerHTML (backup names, config titles, error messages)
- **Severity:** Critical
- **Fix:** Apply `window._haToolsEsc()` to `this._config.title`, `backup.name`, `this._error` before innerHTML insertion; for input `value` attributes, escape quotes and special chars properly.

### ha-data-exporter.js
- **Line 313** — Unescaped config title in `<h2>` innerHTML
- **Line 503** — Unescaped snapshot history state in innerHTML
- **Line 636** — Unescaped config title in input value attribute
- **Severity:** Critical (3 instances)
- **Fix:** Escape `this._config.title` and `h.state` with `_esc()` before insertion; use property assignment instead of innerHTML for input values.

### ha-device-health.js
- **Line 552, 572, 617, 670, 720** — User/API data inserted into innerHTML without escaping (entity_id, state, error messages)
- **Severity:** Critical
- **Fix:** Apply `window._haToolsEsc()` to all user/API data interpolated into innerHTML templates.

### ha-entity-renamer.js
- **Lines 249, 378, 426, 466, 480** — Unsafe innerHTML with unescaped user/API data
- **Severity:** Critical
- **Fix:** Use `window._haToolsEsc()` on all user/API data before innerHTML insertion.

### ha-energy-email.js
- **Line 1030** — Editor input attribute injection (config title, currency, energy_price in input value attributes without escaping quotes)
- **Severity:** Critical
- **Fix:** Escape attribute values (replace `"` with `&quot;`) before inserting into input attributes.

### ha-purge-cache.js
- **Lines ~277, ~350** — Unescaped localStorage keys in .innerHTML and attributes (XSS vector via crafted keys)
- **Severity:** Critical
- **Fix:** Apply `window._haToolsEsc()` to all user-controllable strings, especially localStorage keys before insertion.

### ha-sentence-manager.js
- **Line 352** — config.title inserted into innerHTML without escaping
- **Line 726** — Intent names, categories, slot list values without escaping
- **Line 840** — Sentence responses and slot highlights without escaping
- **Line 1045** — Custom action user data without escaping
- **Severity:** Critical (4 instances)
- **Fix:** Escape all dynamic content (`s.response`, intent names, action fields) with `_esc()` before insertion.

### ha-yaml-checker.js
- **Lines 383, 388, 394, 417, 423, 564, 573** — Unescaped user/API data in innerHTML (weak `_sanitize()` is insufficient)
- **Severity:** Critical
- **Fix:** Replace `_sanitize()` with `window._haToolsEsc()` for proper HTML escaping.

---

## Warning Issues (Quality & Robustness)

### ha-baby-tracker.js
- **Line 361, 411, 540** — Hardcoded English alert strings not translated
- **Lines ~240, ~400, ~600, ~700+** — Hardcoded colors instead of Bento tokens
- **Lines ~260-400** — 40+ inline styles in template literals (maintainability)
- **Missing ARIA roles** on tabs/tab panels (accessibility)
- **Severity:** Warning (multiple issues)
- **Fix:** Use `_t` getter for translations; replace colors with Bento CSS variables; extract inline styles to CSS classes; add ARIA roles/attributes.

### ha-backup-manager.js
- **Lines 44, 56, 83, 133, 520** — Empty catch blocks silently swallowing errors
- **Missing ARIA roles** on tabs and buttons; no focus management
- **Severity:** Warning
- **Fix:** Add logging (`console.warn`) in catch blocks; implement ARIA roles (`tablist`, `tab`, `tabpanel`), aria-labels, keyboard navigation.

### ha-chore-tracker.js
- **Lines ~180-210, 277, 310, 339** — Hardcoded UI strings lack translation
- **Lines 51-56, 62-67** — Empty catch blocks with localStorage errors
- **Severity:** Warning
- **Fix:** Extract strings into `_t` translation object; add error logging/fallback in catch blocks.

### ha-data-exporter.js
- **Line 471** — Unescaped `ent.domain` in table cell innerHTML
- **Lines 438, 471, 474, 480, 524** — Hardcoded English UI strings missing translation
- **Severity:** Warning
- **Fix:** Escape with `_esc()` before insertion; add strings to `_t` translation object.

### ha-device-health.js
- **Lines ~380, 579** — Entity/device names and IDs in HTML attributes without escaping
- **Lines ~583, 628, 678** — Untranslated "Show:" label
- **Lines 7, 91, 597** — Empty catch blocks
- **Severity:** Warning
- **Fix:** Escape all attribute values before insertion; add to `_t` translations; log errors in catch blocks.

### ha-encoding-fixer.js
- **Lines ~900, ~1080, ~1110, ~1170, ~1310** — Hardcoded colors in CSS instead of Bento tokens
- **Missing ARIA roles/attributes** on tabs and toast notifications
- **Severity:** Warning
- **Fix:** Replace hardcoded colors with Bento CSS variables; add ARIA roles and aria-live on toast elements.

### ha-energy-email.js
- **Lines ~380, 579** — Device names and entity IDs in HTML attributes without escaping
- **Lines 164, 171, 183, 253, 260, 269, 280, 287, 294, 301...** (many) — Empty catch blocks
- **Severity:** Warning (extensive error handling debt)
- **Fix:** Escape all attribute values; add `console.error()` logging in all catch blocks.

### ha-energy-insights.js
- **Line 269** — Unescaped entity_id in HTML attribute title
- **Lines 183, 266** — Weak `_sanitize()` of device names (should use proper escaping)
- **Line 277** — Unescaped error message in innerHTML
- **Line 300** — Unescaped config values (title, currency) in innerHTML
- **Severity:** Warning (4 instances)
- **Fix:** Replace `_sanitize()` with `window._haToolsEsc()`; escape all entity IDs and config values.

### ha-energy-optimizer.js
- **Lines 354, 470** — Hardcoded Polish strings without translation
- **Lines 60, 683** — Empty catch blocks
- **Severity:** Warning
- **Fix:** Extract strings into `_t` translation object; add error logging.

### ha-frigate-privacy.js
- **Lines ~324-1086** — Many empty catch blocks silently swallowing errors
- **Missing ARIA roles/labels** on tabs, camera cards, quick pause buttons (~1000-1150)
- **Severity:** Warning
- **Fix:** Add `console.error()` logging; implement ARIA roles and descriptive aria-labels.

### ha-log-email.js
- **Line 567** — User config title in shadowRoot.innerHTML without escaping
- **Line 640** — Editor inputs without escaping
- **Lines 324, 377** — Log messages and domains without escaping
- **Line 292** — SMTP error messages without escaping
- **Line 560** — Send status error messages without escaping
- **Severity:** Warning (5 instances)
- **Fix:** Apply `window._haToolsEsc()` to all user/config/error data before insertion.

### ha-network-map.js
- **Lines 899, 1046** — Unescaped user/device data in innerHTML
- **Lines 669, 1012** — Hardcoded English prompt strings not translated
- **Severity:** Warning (1 critical, documented separately above; 1 info)
- **Fix:** Apply `window._haToolsEsc()`; use `_t()` for prompts.

### ha-security-check.js
- **Lines ~108, ~155** — XSS in config title and error messages (documented as critical above)
- **Lines ~170-300** — Unsafe insertion of findings data without escaping (documented as critical above)
- **Lines ~85-~600** — Multiple empty catch blocks
- **Severity:** Warning
- **Fix:** Add `console.error()` logging in catch blocks; implement user-visible error feedback.

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
- **Lines 182, 220, 290, 784, 840** — Unescaped user/API data in multiple render functions
- **Line 1015** — Unescaped config title in input value attribute
- **Severity:** Warning (3 instances)
- **Fix:** Apply `window._haToolsEsc()` to all interpolated data; use safer property assignment for input values.

### ha-trace-viewer.js
- **Lines ~580-740** — Hardcoded colors for highlights/error states instead of Bento tokens
- **Lines ~570-830** — Minimal ARIA attributes on interactive elements (dropdowns, tabs, checkboxes)
- **Severity:** Warning
- **Fix:** Replace hardcoded colors with Bento CSS variables; add ARIA roles and states to all interactive elements.

### ha-yaml-checker.js
- **Lines 209, 220, 228** — Empty catch blocks silently swallowing errors
- **Severity:** Warning
- **Fix:** Add `console.warn()` or `console.debug()` logging in catch blocks.

---

## Info Issues (Maintainability & Compliance)

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
- **Fix:** Add "Show:" to `_translations`; use `_t('show')`.

### ha-encoding-fixer.js
- **Lines ~900, ~1080, ~1110, ~1170, ~1310** — Hardcoded colors in CSS
- **Severity:** Info
- **Fix:** Replace with Bento CSS tokens.

### ha-energy-optimizer.js
- **Lines 354, 470** — Hardcoded Polish strings
- **Severity:** Info
- **Fix:** Extract to `_t` translation object.

### ha-frigate-privacy.js
- **Lines ~700-800** — Hardcoded rgba colors for backgrounds/hover effects
- **Missing ARIA roles/labels** (minor accessibility improvements)
- **Severity:** Info
- **Fix:** Use Bento CSS variables; add ARIA attributes.

### ha-log-email.js
- **Line 567** — Tab labels ('Overview', 'Schedule') hardcoded in English
- **Lines 27, 130** — Empty catch blocks with comments suggested
- **Severity:** Info
- **Fix:** Localize tab labels using `_t` getter.

### ha-network-map.js
- **Lines 669, 1012** — Hardcoded English prompt strings
- **Line 170** — Orphaned localStorage setting `'ha-tools-net-scan'` (saved but never loaded)
- **Severity:** Info
- **Fix:** Use `_t()` for prompts; remove or implement loading for localStorage setting.

### ha-purge-cache.js
- **Lines ~682-695** — Editor component hardcoded English strings
- **Severity:** Info
- **Fix:** Use `_t` translations for all UI strings; respect `this._lang`.

### ha-security-check.js
- **Line ~350** — Incomplete bilingual support (hardcoded English in `_renderTips()`)
- **Severity:** Info
- **Fix:** Add Polish translations and use `_t` getter.

### ha-sentence-manager.js
- (No additional info-level issues beyond those listed above)

### ha-smart-reports.js
- (No info-level issues; accessibility warning listed above)

### ha-storage-monitor.js
- (No info-level issues; all issues listed above)

### ha-trace-viewer.js
- (No info-level issues; warning listed above)

### ha-yaml-checker.js
- (No info-level issues; critical/warning listed above)

---

## False Positives (Skipped)

### ha-automation-analyzer.js
- **Reported:** 1000+ lines of innerHTML usage as XSS
- **Reality:** Component uses `window._haToolsEsc()` for escaping; Shadow DOM pattern with safe lifecycle; Bento CSS design system applied correctly
- **Verdict:** FALSE POSITIVE

### ha-smart-reports.js
- **Reported:** Hardcoded semantic colors in chart rendering
- **Reality:** Colors correspond to semantic meanings consistent with Bento palette; dynamic/chart colors where tokens may not exist
- **Verdict:** FALSE POSITIVE

### ha-yaml-checker.js
- **Reported:** Missing `if (!this._hass)` guards in async methods
- **Reality:** Current usage acceptable; optional improvement only
- **Verdict:** FALSE POSITIVE

---

## Comparison: OpenAI vs. Gemma Audit Results

### What OpenAI Found That Gemma Missed

1. **Detailed Error Handling Issues:** OpenAI identified 30+ empty catch blocks across 15+ tools. Gemma only flagged generic "try/catch overhead" as tech debt.
2. **Hardcoded Colors & Bento Compliance:** OpenAI found 6 tools using hardcoded colors instead of Bento tokens. Gemma verified 9 tools with `.container` instead of `.card` (subset overlap but different scope).
3. **i18n Gaps:** OpenAI found hardcoded strings in 10+ tools (Polish, English). Gemma did not specifically audit i18n.
4. **Attribute-Level XSS:** OpenAI caught XSS in HTML attributes (e.g., `title`, `value`, `data-*`), especially in editor components. Gemma only counted innerHTML XSS.
5. **Input Value Attribute Injection:** OpenAI flagged input `value` attribute injection in 4 tools (ha-energy-email, ha-log-email, ha-storage-monitor). Gemma's innerHTML-only count missed this vector.

### What Gemma Found That OpenAI Missed

1. **Memory Leak False Positives Verification:** Gemma explicitly verified that all 5 tools flagged for "memory leaks" were false positives due to Shadow DOM garbage collection. OpenAI did not audit for this.
2. **Inline Styles Count:** Gemma enumerated inline styles by tool (e.g., ha-vacuum-water-monitor: 190, ha-energy-email: 91). OpenAI flagged inline styles as maintainability issue but did not quantify.
3. **XSS Severity Quantification:** Gemma graded each tool's XSS by unsafe count (e.g., ha-data-exporter: 6 unsafe). OpenAI listed lines but not aggregate count per tool.

### Where They Agree

1. **Critical XSS Issues:** Both identified 4 tools with confirmed critical XSS (ha-baby-tracker, ha-data-exporter, ha-sentence-manager, ha-encoding-fixer). OpenAI added 4 more (ha-backup-manager, ha-entity-renamer, ha-purge-cache, ha-yaml-checker).
2. **Accessibility Gaps:** Both flagged missing ARIA roles on tabs and interactive elements.
3. **Empty Catch Blocks:** Both identified widespread empty catch blocks as quality issue (Gemma: "defensive code," OpenAI: "warning").
4. **ha-vacuum-water-monitor Clean:** Both cleared this tool (no critical XSS, despite high inline style count).

### Where They Disagree

1. **Error Handling Severity:** Gemma classified try/catch as "tech debt, non-blocking." OpenAI classified empty catch blocks as "warning" (medium severity).
2. **Inline Styles Severity:** Gemma flagged ha-vacuum-water-monitor (190) as "poważny refaktor potrzebny" (severe refactor needed). OpenAI did not audit this tool's inline styles.
3. **XSS Line Count:** Gemma reported 4 unsafe instances in ha-encoding-fixer; OpenAI reported only 1 (difference in detection sensitivity or false positive on Gemma's side).
4. **False Positive Handling:** Gemma verified memory leaks were FP; OpenAI did not audit memory leaks at all.

---

## Priority Matrix

### P0 — Fix Immediately (Critical XSS)
1. **ha-backup-manager.js** — 2 critical XSS (lines 471, 1071)
2. **ha-data-exporter.js** — 3 critical XSS (lines 313, 503, 636)
3. **ha-device-health.js** — 1 critical XSS (line 552+)
4. **ha-entity-renamer.js** — 1 critical XSS (lines 249, 378, 426, 466, 480)
5. **ha-energy-email.js** — 1 critical XSS (line 1030)
6. **ha-purge-cache.js** — 1 critical XSS (lines ~277, ~350)
7. **ha-sentence-manager.js** — 4 critical XSS (lines 352, 726, 840, 1045)
8. **ha-yaml-checker.js** — 1 critical XSS (lines 383-573)

**Action:** Apply `window._haToolsEsc()` to all unescaped user/API/config data before innerHTML insertion and attribute values.

### P1 — Fix Soon (Quality Warnings)
1. **ha-log-email.js** — 5 warning XSS instances
2. **ha-storage-monitor.js** — 3 warning XSS instances
3. **ha-energy-email.js** — 3 warning XSS instances (+ error handling)
4. **ha-security-check.js** — 2 warning XSS instances (+ error handling)
5. **ha-energy-insights.js** — 4 warning XSS instances
6. **All 15+ tools** — Empty catch blocks (error logging)

**Action:** Add escaping and error logging; implement phased rollout by tool.

### P2 — Plan Refactor (Info Issues)
1. **ha-vacuum-water-monitor.js** — 190 inline styles
2. **ha-energy-email.js** — 91 inline styles
3. **ha-baby-tracker.js** — 80 inline styles
4. **ha-sentence-manager.js** — 77 inline styles + i18n
5. **ha-security-check.js** — 72 inline styles

**Action:** Extract inline styles to CSS classes; add Bento token compliance over next 2-3 sprints.

---

## Recommendations

1. **Security:** Create a global escaping utility patch (`window._haToolsEsc()` enforcement) and audit all innerHTML assignments.
2. **Error Handling:** Standardize error logging across all tools; add telemetry for failed operations.
3. **i18n:** Complete translation coverage for all tools; remove hardcoded English/Polish strings.
4. **Accessibility:** Add ARIA role templates to base component class; generate linter rule for missing roles.
5. **CSS Debt:** Migrate inline styles to CSS classes in upcoming refactor cycle; document Bento token requirements.
