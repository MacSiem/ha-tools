# Changelog

All notable changes to HA Tools Panel are documented here.

## [3.10.0] - 2026-04-25

### Security
- **`customElements.define` guards** added to `ha-tools-stack.js` and `ha-tools-discovery.js` (re-define would throw `QuotaExceededError` on double-load)
- **Discovery banner** now validates GitHub repo strings against `^[\w.-]+/[\w.-]+$` before rendering as `href`; falls back to plain `<span>` for malformed entries. All external links carry `rel="noopener noreferrer"`
- **XSS hardening**: device/entity/child/chore/vacuum names are now consistently routed through `_haToolsEsc` before HTML insertion across `ha-baby-tracker`, `ha-chore-tracker`, `ha-vacuum-water-monitor` (5 locations), and `ha-network-map` (table, detail view, SVG topology)
- **`ha-encoding-fixer`**: bearer token fetch to `/api/config` now skipped when no token is available (no more empty-bearer 401s)

### Privacy
- **Removed all external CDN dependencies**:
  - Chart.js v4.5.1 bundled locally to `vendor/chart.umd.min.js` (208 KB) — `ha-energy-optimizer`, `ha-energy-insights`, `ha-automation-analyzer`, `ha-backup-manager` no longer leak user IP to jsdelivr.net
  - Google Fonts (Inter) `<link>` removed from `ha-tools-loader.js`, `ha-tools-loader-v3.js` (since deleted), and `ha-sentence-manager.js`. Components keep `font-family: 'Inter', system-ui, ...` so users with Inter installed still see it; everyone else falls back to native system UI font
- **`ha-network-map`**: automatic network port scan on first load is **disabled**. Subnet detection still happens, but the scan itself (≈1016 fetch requests) now requires explicit user action via the existing "Scan All" button
- **Privacy export warnings**: `ha-baby-tracker` and `ha-data-exporter` show a confirmation dialog before producing a downloadable JSON/CSV with sensitive data (child names, feeding times, entity states/attributes)

### Repo Hygiene
- Deleted `bak_20260402_193824/` (26 stale legacy backups)
- Deleted `ha-tools-loader-v3.js` (legacy, superseded by `ha-tools-loader.js` v8)
- Deleted `ha-entity-renamer-temp.js` (orphan duplicate; its un-guarded `customElements.define` was a latent registration conflict)
- Moved `check_unguarded.js` (Node dev script) from repo root to `scripts/`

### Memory & Cleanup
- `ha-tools-discovery-banner` now defines `disconnectedCallback()` that clears `innerHTML` to drop click listeners

## [3.9.0] - 2026-04-12

### Added
- Sidebar search/filter — instant text search across all tools in the navigation panel
- Global XSS protection helper (`window._haToolsEsc`) — shared sanitizer singleton across all tools

### Changed
- Deduplicated `_haToolsPersistence` — replaced 61-line blocks with 2-line stubs in 20 tools (panel retains canonical implementation). Net reduction: ~1220 lines of duplicate code
- Deduplicated `_esc` XSS helper — tools reuse `window._haToolsEsc` from panel with standalone fallback

### Fixed
- **Frigate Privacy: Coral TPU stability** — removed `camera.turn_off/turn_on` calls that stopped the entire Frigate camera pipeline and could cause Google Coral USB TPU to be released. Removed `hassio.addon_start` on auto-resume that caused full addon restarts with USB race conditions. Privacy now only toggles Frigate switches (detect/recordings/snapshots/motion), keeping camera streams alive and Coral TPU continuously assigned
- XSS protection across 8 tools — user-controlled data (notes, labels, entity names, config titles) now escaped via `_esc()` before innerHTML insertion
- Memory leak in ha-trace-viewer — document click listener now properly cleaned up in `disconnectedCallback()`
- Memory leak in ha-baby-tracker — `_autoSaveTimer` interval cleared in `disconnectedCallback()`
- Removed dead `ha-tools-common.js` (gitignored, never loaded by any tool)

### Security
- Added `_esc()` sanitization for: baby-tracker (feeding amounts, notes, config titles), chore-tracker (entry names, assignees), data-exporter (entity names/states), frigate-privacy (camera labels), sentence-manager (slot names/types), vacuum-water-monitor (config title), panel (location name, error messages)

## [3.8.0] - 2026-04-05

### Added
- Entity Renamer: YAML file propagation — automatically scan and update entity references in automations.yaml, frigate.yaml, packages/*.yaml when renaming entities with prefix changes
- Entity Renamer: Restart notification banner with one-click HA restart button after YAML files are updated
- Entity Renamer: `_hasYamlSupport()` check for graceful degradation — YAML features only activate when optional shell_command helper is configured
- Optional `scripts/entity_renamer_yaml.py` helper for YAML scanning and replacement (requires manual configuration of shell_commands in configuration.yaml)

### Fixed
- Entity Renamer: Core entity/device renaming works standalone via HACS without any extra configuration
- Entity Renamer: Fixed UTF-8 encoding issues with Polish characters in UI

## [3.7.0] - 2026-04-02

### Added
- Frigate Privacy tool — pause Frigate addon with quick-pause buttons (15m/30m/1h/2h/custom), live countdown, camera selector, scheduled recurring privacy windows, full history log. Self-contained: uses `hassio.addon_stop/start` directly (no script dependencies)
- Encoding & Mojibake Fixer tool — scan all entities for mojibake (Polish/UTF-8 double-encoding), test tool with live decode preview, lovelace_resources scanner (BOM, duplicates, broken URLs), one-click fix via entity registry and lovelace WS API, fix history log. Self-contained: `_hasShellCommand()` with `check_config` API fallback
- Entity Renamer tool — bulk rename entities with live preview and propagation to dashboards, automations, scripts
- 22 integrated tools total (was 20)

### Changed
- Bento Design System CSS unification — migrated custom abbreviated variables (`--pr`, `--bg`, `--ca`, `--bo`, `--tx`, `--t2`) to standard `--bento-*` variables across energy-optimizer (87 refs), energy-email (144 refs), entity-renamer
- Centralized dark mode — removed redundant 2098-char `@media (prefers-color-scheme: dark)` blocks from 9 tools (yaml-checker, chore-tracker, trace-viewer, storage-monitor, sentence-manager, data-exporter, automation-analyzer, baby-tracker, device-health), now handled by ha-tools-bento.js
- Unified tab styling — all tabbed tools use `.tab-btn` class consistently (fixed `.tab-button` in energy-optimizer)
- Extended ha-tools-bento.js dark mode from 6 vars to comprehensive block with shadows, light vars, color-scheme, UI selectors for cards/inputs/tables/stats/pre/code
- Version bump to v3.7.0
- Updated README with 22 tools and fresh screenshot

### Fixed
- Sentence Manager mojibake — fixed 25 occurrences of triple-encoded UTF-8 in Custom Actions tab (Polish text, emoji, em dashes). File: 119KB → 118KB
- ha-tools-panel.js badge not hiding when all tools loaded — added conditional `display:none` check
- Energy Email var replacement — fixed fallback patterns like `var(--bg, #f8fafc)` missed by simple string replace (used regex)
- Removed ha-cry-analyzer.js (replaced by baby-tracker)
- Synced all 22 tool JS files between repo and deployed HA instance

---

## [3.6.0] - 2026-04-02

### Added
- 20 integrated tools (was 15) — added Energy Email, Energy Insights, Log Email, Purge Cache, YAML Checker, Entity Renamer, Vacuum & Water Monitor
- G5: Mojibake protection (`_sanitize()` method) across 11 tools — safe display of Polish/UTF-8 characters from HA API
- G1: Full dark mode support for all 20+ components (`@media prefers-color-scheme: dark`)
- G6: Chart container height constraints to prevent page overflow
- Tools Discovery banner for new tool announcements
- Bento design system CSS shared module (ha-tools-bento.js)

### Changed
- G4: Unified tab styling — all tabbed tools now use `.tab-btn` class consistently
- Version bump to v3.6.0

### Fixed
- Removed BOM (Byte Order Mark) from ha-tools-panel.js — prevented potential parse errors
- Removed `@import url()` FOUT in ha-purge-cache.js — Inter font loaded via loader, not per-component
- Fixed ha-cry-analyzer.js trailing null bytes causing syntax error
- Synced repository with deployed HA version (repo was 17–58KB behind per file)

---

## [3.5.0] - 2026-03-29

### Added
- Energy Optimizer with tariff-aware peak/off-peak analysis
- Energy Insights with period selector (24h/7d/30d) and cost tracking
- Energy Email with SMTP auto-detection and schedule info

### Fixed
- Energy Email schedule tab — clear info that send timing depends on HA automations
- Energy Insights empty state with sensor configuration guide

---

## [3.4.0] - 2026-03-28

### Added
- YAML Checker with paste-and-validate, deprecated syntax detection (10 patterns), entity scan
- Log Email with SMTP status, error polling (30s–5min), session history
- Smart Reports encoding fix and real data (removed demo/mock data)
- Device Health with full dark mode and responsive layout

### Fixed
- Automation Analyzer dark mode and mobile responsiveness
- Network Map responsive breakpoints

---

## [3.3.0] - 2026-03-27

### Added
- Vacuum & Water Monitor with 9 robot calibration profiles (Dreame, Roborock, Ecovacs, Xiaomi)
- Chore Tracker with improved empty states and dark mode
- Cry Analyzer with empty state UX and dark mode
- Baby Tracker dark mode and Lovelace/voice control info section

### Changed
- Sentence Manager — added Custom Actions tab with YAML generator
- Backup Manager — full dark mode, mojibake fix, backup method badges, health chart constraints
- Storage Monitor — debounced updates, addon disk usage, flickering fix

---

## [3.2.0] - 2026-03-25

### Added
- Security Check — addon host_network audit, integration count, SSL/HTTPS status, Nabu Casa detection
- Entity Renamer — bulk rename with preview
- Purge Cache — database and recorder cleanup tool
- Data Exporter — improved pagination and export formats

### Fixed
- 40+ bugs from comprehensive audit (flickering, FOUT, encoding, rendering)
- BOM removed from 20 JS files in repository

---

## [3.1.0] - 2026-03-23

### Added
- 15 integrated tools (added Security Check tool)
- Bento Light Mode UI across all tools
- Auto-loading addon architecture with progress notification
- Build version detection with auto-refresh prompt
- Throttled hass updates (5s) to prevent UI lag

### Changed
- Major refactor to dynamic tool-loader architecture
- Improved sidebar navigation with dynamic tool registration
- Better error boundaries and fallback states

### Fixed
- Data Exporter blank window and pagination issues
- Cry Analyzer blank window and dual-loading bug
- Storage Monitor and Security Check readability
- Stable data persistence across tab switches

---

## [2.5.0] - 2026-03-18

### Added
- Build version auto-update detection
- Toast notification system for new versions
- HA Tools Loader v3 (ha-tools-loader-v3.js)

### Changed
- Improved loading progress bar
- CSS custom properties for theming

---

## [2.3.0] - 2026-03-17

### Added
- 14 integrated tools
- Bento Light Mode UI
- CSS custom properties for theming

### Fixed
- Multiple stability and rendering fixes across all tools

---

## [2.2.0] - 2026-03-15

### Added
- Auto-loading addons with progress notification
- Sidebar customization support

---

## [1.0.0] - Initial Release

- Basic HA Tools Panel with core tools
