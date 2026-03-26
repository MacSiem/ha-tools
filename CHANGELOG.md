# Changelog

All notable changes to HA Tools Panel are documented here.

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
