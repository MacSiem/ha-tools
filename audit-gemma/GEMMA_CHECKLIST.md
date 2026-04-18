# GEMMA_CHECKLIST.md — audit areas A–H

Human-readable mirror of what `prompts/per_tool.txt` asks Gemma to check.
Used as context pack fodder AND as the QA reference after the audit finishes.

---

## A. HACS out-of-box readiness

The file must load cleanly for a user who just ran `hacs install HA Tools` — no manual
YAML, no extra resources, no Samba copying. This is what OpenAI's audit did **not**
check and what the Obsidian `2026-04-14 HA Tools HACS Hardening.md` note flagged as a
known blind spot.

- Tool loads without any required entry in `configuration.yaml`.
- All file paths are relative to `window.location.pathname`. Never hardcoded
  `/config/www/community/ha-tools/`, never `C:\Users\...`, never Samba `\\host\...`.
- Missing optional components (`ha_tools_email`, `frigate`, `roborock`, specific sensors)
  degrade gracefully with a friendly message — never silently fail, never throw.
- `customElements.get(name)` guard before `customElements.define(name, …)` — otherwise a
  re-load throws.
- Custom element name matches `ha-<tool>` (dash-separated, lowercase).
- If the tool accepts config, the editor element `ha-<tool>-editor` is also registered.

## B. Sensowność instrukcji / Instruction sanity

Does the README's promise match the code's reality?

- Every tab listed in the README for this tool exists in `render()`.
- "Features" bullets in README are actually implemented (not TODO / placeholder).
- Error messages are **specific** (`Config missing: energy_price`), not generic (`Error`).
- Inline help / tooltip / placeholder text reads like a real hint, not lorem ipsum.
- Options listed in README's config tables (`Card Type | Key Options`) are actually
  accepted by the card.
- "Guide" tabs (ha-yaml-checker, etc.) are complete and reference the right HA versions.

## C. UI/UX correctness

Not just accessibility — **does the tool look and behave like it should inside HA?**

- `.card` wrapper (Bento rule). `.container` is forbidden.
- CSS tokens: `--bento-radius-sm|-md|-lg`, `--bento-shadow-sm|-md|-lg`, `--bento-gap-*`.
  The bare `--bento-radius` does NOT exist.
- Dark mode via HA theme vars (`--card-background-color`, `--primary-text-color`,
  `--secondary-background-color`, …) — **never** `@media (prefers-color-scheme: dark)`.
- Responsive: at least one `@media (max-width: 480px)` breakpoint.
- Tabs: correct ARIA (`role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`)
  AND keyboard navigation (Left/Right arrow to change tabs, Home/End to jump).
- Empty / loading / error states have visual hierarchy (icon + text), not bare strings.
- Typeface: Inter (loaded globally by the loader) or Bento tokens — not hardcoded
  `sans-serif`.

## D. Tool-specific logic

Per-tool invariants live in `TOOL_SPECIFIC_CHECKS.md`. Examples: Roborock profile
coverage for vacuum-water-monitor, CSV escaping for trace-viewer batch export, timer
off-by-one for frigate-privacy.

## E. Deep linking & settings integration

README advertises `#<tool-id>/<tab-name>` deep links. The tool must hold up its end.

- `hashchange` listener that routes to the advertised tab.
- Settings use `frontend/set_user_data` / `frontend/get_user_data` where persistence
  across devices matters — not only `localStorage`.
- Reacts to `hass.language` change without a page reload.
- Respects `this._lang`, `this._theme` when hosted inside `ha-tools-panel.js`.

## F. Obsidian lessons watch-list

- UTF-8 without BOM. (`Get-Content` / `Set-Content` on Windows injects BOM → breaks HA.)
- No `async_register_agent` (deprecated). Relevant to `ha-sentence-manager`.
- No `.container` wrappers — `.card` only (see C).
- Hardcoded colors: >30 per tool = warning; >100 = tech debt. Prefer Bento tokens.
- No hardcoded `/config/www/community/ha-tools/`.
- No hardcoded dev IP `192.168.1.124` or Samba `\\192.168.1.124\config`.

## G. Overlap with OpenAI audit

Gemma must not duplicate OpenAI's 58 findings. For each:

- If Gemma agrees on the same line/issue → `CONFIRM: OpenAI line X — <one-line>`.
- If Gemma disagrees (line wrong, issue misread, false positive) → `DISPUTE: OpenAI
  line X — <reason>`.
- If Gemma finds an XSS/i18n/ARIA issue OpenAI missed → file as a normal new finding.

## H. Dead-code / scope check

Flag candidates for removal:

- Is the file referenced in `hacs.json`?
- Is it in `ha-tools-loader.js` `allFiles[]`?
- Is its custom element registered somewhere in `ha-tools-panel.js`?
- Does it have `-temp`, `-v2`, `-v3`, `-old` in its name? (Strong prior against keeping.)
- Is it duplicated by a non-suffixed file?

Known suspects: `ha-tools-loader-v3.js`, `ha-entity-renamer-temp.js`.
Gemma's job is to **confirm** their dead-code status, not assume it.

---

## Output requirements

- Every section A–H must appear in the per-tool output.
- Empty sections must read `OK — <what you checked>`, not be omitted.
- Every finding needs: line number, severity (Critical/Warning/Info), 1-line fix.
- SUMMARY section with totals, severity breakdown, top 3 priority fixes, and per-section
  confidence (H/M/L).
