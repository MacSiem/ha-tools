# TOOL_SPECIFIC_CHECKS.md — per-tool invariants (section D)

Each tool has 2–4 invariants a generic audit won't catch. Gemma should verify these
in section D of each report. If an invariant can't be verified from the source alone,
mark `line ref unverified` and move on — do not hallucinate.

---

## ha-automation-analyzer.js
- Large automation list (500+) must render via `requestIdleCallback` or virtualization
  — a synchronous loop over every automation blocks the panel.
- "Unused trigger" detection should differentiate between `disabled: true` and truly
  orphaned triggers.
- Prior audit called out a memory leak false-positive; re-verify whether event listeners
  are torn down in `disconnectedCallback`.

## ha-baby-tracker.js
- Feeding / sleep / diaper timestamps stored as ISO strings with timezone, not bare
  `Date.now()` (local-time confusion across daylight saving).
- Daily rollover: at midnight, the "today" counters reset — check the boundary.
- Data retention: is there an export before any wipe action?

## ha-backup-manager.js
- Backup filename pattern must be safe (no user input without escape).
- Delete action needs confirmation dialog.
- Size formatting handles multi-GB backups (not integer overflow on large numbers).

## ha-chore-tracker.js
- Recurring chores: next-due calculation handles month-end (Feb 30 nonsense).
- "Completed" state survives panel reload.
- Assigned-to field validated against actual HA persons/users.

## ha-data-exporter.js
- Export types (history, statistics, logbook) all hit the correct HA REST endpoint.
- Time range validator rejects end < start.
- CSV export: quotes, commas, newlines in entity friendly names are escaped.

## ha-device-health.js
- "Unavailable" vs "Unknown" distinction preserved — they are semantically different.
- Battery thresholds configurable (not hardcoded 20%).
- Refresh button debounced — no spam-click DoS on REST API.

## ha-encoding-fixer.js
- Detects CP1250 / CP1252 / UTF-8 with BOM correctly on Polish characters (ą, ę, ł, ż).
- Backup of original file before any overwrite.
- Fails loud if it cannot write (permissions, mounted volume).

## ha-energy-email.js
- SMTP chain: try `ha_tools_email` → fallback `notify.*` → friendly error.
- Recipient validated with an email regex (not just `.includes("@")`).
- Energy price / currency come from the same settings source as ha-energy-insights
  and ha-energy-optimizer (cross-tool consistency — flag if divergent).
- No SMTP password stored in state or localStorage.

## ha-energy-insights.js
- Daily / monthly / yearly aggregation uses statistics API, not history (scales).
- Currency formatting via `Intl.NumberFormat(hass.locale, {currency})`.
- Empty state when HA Energy isn't configured is explicit.

## ha-energy-optimizer.js
- Tariff window computation handles overnight tariffs (22:00–06:00 wraps midnight).
- Recommendations reference real entities (not placeholder `switch.example`).
- Shares energy_price/currency with ha-energy-email and ha-energy-insights.

## ha-entity-renamer.js
- Registry writes via `config/entity_registry/update` — correct WS command.
- Undo/history of renames retained at least for the current session.
- Bulk-rename with regex is sandboxed — no catastrophic backtracking on pathological input.
- No partial-apply: either all renames succeed in a batch or all roll back.

## ha-frigate-privacy.js
- Timer countdown is monotonic — no off-by-one at boundary.
- When Frigate isn't installed, shows "Frigate not detected" not a crash.
- Privacy mask toggle calls `frigate.set_privacy_mask` (or documented equivalent).

## ha-log-email.js
- Log size capped (tail N lines, not entire file) — otherwise SMTP will time out.
- Sensitive lines (tokens, passwords) redacted before email send.
- SMTP chain parity with ha-energy-email and ha-smart-reports.

## ha-network-map.js
- Topology discovery uses Unifi / Unifi-LAN sensors if present; falls back to ARP table
  scan only if the user opts in (privacy / noise).
- Node positions persisted per user (settings, not localStorage).

## ha-purge-cache.js
- "Purge" actions have confirm dialogs.
- localStorage keys to purge are enumerated in a visible list — user sees what's being
  deleted before it happens.
- Does NOT purge `ha-tools-*` settings that other tools depend on without warning.

## ha-security-check.js
- Checklist items come from a versioned source (e.g. hardcoded list with `version: N`)
  — so updates to HA versions are tracked.
- "Open port" detection does not claim to scan the network from JS (that would be a lie).
- "2FA enabled?" reads the actual HA user flag, not guesses.

## ha-sentence-manager.js
- NO `async_register_agent` (deprecated in HA 2024.x).
- Intent name uniqueness validated before save.
- Slot types match HA's documented set (`entity`, `area`, `floor`, `device`, etc.).
- Large intent lists (500+) render efficiently.

## ha-smart-reports.js
- Report templates (weekly / monthly) render without SMTP — preview mode must work.
- SMTP chain parity with ha-energy-email, ha-log-email.
- PDF / HTML output correctly escapes user content.

## ha-storage-monitor.js
- Free / used / total come from HA's `system_info` websocket, not parsed from text.
- Thresholds configurable (default 80%/95%).
- Multi-disk setups (Supervised, OS with add-on disks) handled.

## ha-trace-viewer.js
- Trace download: CSV / JSON export escapes commas, quotes, newlines.
- Large traces (>5 MB) streamed, not loaded into memory.
- Step highlighting matches the actual step index — off-by-one tripwire.

## ha-vacuum-water-monitor.js
- Nine (+) robot profiles implemented: Roborock, Dreame, Ecovacs, Xiaomi, Viomi,
  Deebot, plus generics. Each has correct tank-full / filter-clogged thresholds.
- Missing config → explicit "Config missing: vacuum_entity" message (Obsidian lesson
  from 2026-04-14; previously failed silently).
- Water tank empty warning is visible before "water level critical".

## ha-yaml-checker.js
- KEY_FILES list is generic, not hardcoded to Maciej's setup (fixed 2026-04-14, verify
  it stayed fixed).
- Entity-registry scan with ≥1700 entities does not block UI (requestIdleCallback).
- Guide tab covers current HA YAML syntax (2024+).

## ha-tools-loader.js (infra)
- `allFiles[]` list must match the filenames in repo root. Missing = broken tool in
  panel. Extra = 404 at load time (`console.error`).
- Inter font loaded globally (prevents FOUT in shadow DOM).
- Cache bust via `?_=Date.now()` on script src.

## ha-tools-loader-v3.js (infra, suspected dead)
- If NOT referenced in `hacs.json` and NOT in any `<script src>`, mark as DEAD.
- Compare functionality vs `ha-tools-loader.js` — v3 appears to only load panel, lacks
  `allFiles[]` loading → would silently break HACS install if swapped in.

## ha-tools-stack.js (infra)
- `custom:ha-tools-stack` card type documented in README?
- Child card configuration validator present — rejects missing `type:` key.

## ha-tools-bento.js (infra)
- Source of truth for Bento tokens — audit that `--bento-radius-sm|-md|-lg` are all
  defined; no stale `--bento-radius` singular.
- Dark mode rules cover all tokens (no undefined when HA is in dark theme).

## ha-tools-panel.js (infra)
- Tab list matches the union of tools in `ha-tools-loader.js` `allFiles[]`.
- Deep-link routing: hashchange listener present.
- Settings persistence via `frontend/set_user_data`.
- Language toggle cascades to child tools (`this._lang` propagation).

## ha-tools-discovery.js (infra)
- Auto-discovery scans only HA's own services — no external network probes.
- Fallback when a sensor isn't present ≠ throwing.

## ha-entity-renamer-temp.js (infra, suspected dead)
- If this file duplicates `ha-entity-renamer.js` and is NOT in loader's `allFiles[]`,
  mark as DEAD / TEMP.
- If it has functionality not in the main file, that's a missed integration — flag it.
