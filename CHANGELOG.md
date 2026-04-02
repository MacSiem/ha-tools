# Changelog

All notable changes to HA Tools Panel are documented here.

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
