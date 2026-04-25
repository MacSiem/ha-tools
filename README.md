# HA Tools

A comprehensive Home Assistant custom panel featuring 22 tools for automation, device health monitoring, energy management, and household tracking.

[![Home Assistant](https://img.shields.io/badge/Home%20Assistant-2024.1+-blue.svg?logo=homeassistant)](https://www.home-assistant.io/)
[![Tools](https://img.shields.io/badge/Tools-22-success.svg)](#features)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

![HA Tools](assets/ha-tools-banner.svg)

## Installation

### HACS (Recommended)

1. Add this repository as a custom repository in HACS:
   - Go to HACS > Settings > Custom repositories
   - Paste: `https://github.com/macsiem/ha-tools`
   - Category: **Plugin/Lovelace**

2. Install "HA Tools" from HACS

3. Add to your `configuration.yaml`:

```yaml
panel_custom:
  - name: ha-tools-panel
    sidebar_title: HA Tools
    sidebar_icon: mdi:toolbox
    url_path: ha-tools
    js_url: /local/community/ha-tools/ha-tools-loader.js
    embed_iframe: false
    config:
      default_tab: trace-viewer
```

4. Restart Home Assistant

### Manual Installation

1. Download the latest release
2. Extract to `config/www/community/ha-tools/`
3. Add the `panel_custom` configuration as shown above
4. Restart Home Assistant

## Using HA Tools

### Panel Mode (Recommended)

The full HA Tools panel includes all 22 tools with unified navigation, settings, and deep linking.

Navigate to **Settings > Devices & Services > Home Assistant Panel** and select **HA Tools**.

### Card Mode

Each tool is also available as a standalone Lovelace custom card. You can add individual tools to any dashboard without using the full panel.

#### Adding Cards via UI

1. Edit your dashboard
2. Click **Add Card** > **Manual**
3. Paste one of the examples below
4. Click **Save**

#### Adding Cards via YAML

Edit your dashboard's YAML directly:

```yaml
views:
  - title: Home
    cards:
      # Energy Email card
      - type: custom:ha-energy-email
        recipient: your@email.com
        currency: PLN

      # Device Health card
      - type: custom:ha-device-health

      # Energy Optimizer card
      - type: custom:ha-energy-optimizer
        currency: PLN

      # Log Email card
      - type: custom:ha-log-email
        email_recipient: your@email.com
```

#### Available Cards

All 22 tools can be used as standalone cards:

| Tool | Card Type | Key Options |
|------|-----------|------------|
| Trace Viewer | `custom:ha-trace-viewer` | — |
| Automation Analyzer | `custom:ha-automation-analyzer` | — |
| Sentence Manager | `custom:ha-sentence-manager` | — |
| Data Exporter | `custom:ha-data-exporter` | — |
| Log Email | `custom:ha-log-email` | `email_recipient` |
| Purge Cache | `custom:ha-purge-cache` | — |
| YAML Checker | `custom:ha-yaml-checker` | — |
| Entity Renamer | `custom:ha-entity-renamer` | — |
| Encoding Fixer | `custom:ha-encoding-fixer` | — |
| Device Health | `custom:ha-device-health` | — |
| Backup Manager | `custom:ha-backup-manager` | — |
| Network Map | `custom:ha-network-map` | — |
| Storage Monitor | `custom:ha-storage-monitor` | — |
| Security Check | `custom:ha-security-check` | — |
| Frigate Privacy | `custom:ha-frigate-privacy` | — |
| Chore Tracker | `custom:ha-chore-tracker` | — |
| Baby Tracker | `custom:ha-baby-tracker` | — |
| Vacuum Water Monitor | `custom:ha-vacuum-water-monitor` | — |
| Energy Optimizer | `custom:ha-energy-optimizer` | `currency` |
| Energy Insights | `custom:ha-energy-insights` | — |
| Energy Email | `custom:ha-energy-email` | `recipient`, `currency` |
| Smart Reports | `custom:ha-smart-reports` | — |

## Features

### Advanced Tools (9)

#### **Trace Viewer**
Powerful automation trace viewer with advanced filtering and batch export.

- **Tabs**: Timeline, JSON, Changes, Config, Related
- **Features**:
  - Multi-select traces for batch operations
  - Export to JSON/CSV format
  - Filter by status, result, or time range
  - Group automation traces by name
  - View complete trace hierarchy

#### **Automation Analyzer**
Deep-dive analysis of automation performance and health.

- **Tabs**: Overview, Performance, Optimization
- **Features**:
  - Automation health score (A–F grade)
  - Execution statistics (runs, errors, avg duration)
  - Error tracking and categorization
  - Trigger analysis and patterns
  - Performance recommendations

#### **Sentence Manager**
Manage Home Assistant Assist voice commands and custom sentences.

- **Tabs**: HA Sentences, Custom Sentences, Templates, Test
- **Features**:
  - Built-in HA sentence library
  - Custom sentence creation and editing
  - Template library for common patterns
  - Live testing with speech recognition
  - Voice command validation

#### **Data Exporter**
Export Home Assistant data for backup and analysis.

- **Features**:
  - Export devices/entities/states to CSV/JSON
  - Entity snapshots with timestamps
  - Domain filtering and selection
  - Attribute preservation

#### **Log Email**
Automated error and warning email digests.

- **Tabs**: Overview, Schedule, Preview, Send Now, History
- **Features**:
  - Error and warning log collection
  - Daily/weekly email scheduling via HA automations
  - Preview before sending
  - SMTP configuration via `ha_tools_email` component
  - Email history tracking

#### **Purge Cache**
Clear browser and Home Assistant storage.

- **Features**:
  - Clear localStorage
  - Clear sessionStorage
  - Unregister service workers
  - Clear browser cache storage
  - Force full reload

#### **YAML Checker**
Validate Home Assistant YAML configuration and templates.

- **Tabs**: Config, Entities, Paste, Template, Guide
- **Features**:
  - YAML syntax validation
  - Entity registry scanning
  - Paste-and-validate mode
  - Jinja2 template testing
  - Deprecated syntax detection

#### **Entity Renamer**
Bulk rename entities with propagation to dashboards and automations.

- **Tabs**: Devices, Queue, Log
- **Features**:
  - Rename with device/entity selection
  - Propagation to dashboards
  - Propagation to automations/scripts
  - Impact analysis (preview what changes)
  - Operation log and rollback info

#### **Encoding Fixer**
Detect and repair mojibake and encoding issues.

- **Tabs**: Scan, Lovelace, Entities, YAML, Restore
- **Features**:
  - Mojibake detection in entity names
  - BOM (Byte Order Mark) fixing
  - Lovelace resource scanning
  - Encoding repair in entity registry
  - Scan and restore history

---

### Device Health (6)

#### **Device Health**
Comprehensive device monitoring dashboard.

- **Tabs**: Devices, Batteries, Network, Alerts
- **Features**:
  - Monitor 1700+ devices
  - Battery level tracking with low-battery alerts
  - Device connectivity status (online/offline)
  - Uptime tracking
  - Real-time alerts and notifications

#### **Backup Manager**
Home Assistant backup management and health monitoring.

- **Tabs**: Backups, Health, Addons, Integrations
- **Features**:
  - Backup list with creation dates
  - Backup health scoring
  - Addon state tracking
  - Integration dependency monitoring
  - Backup method badges (USB, Cloud, etc.)

#### **Network Map**
Browser-based network visualization and topology mapping.

- **Tabs**: Devices, Topology, Subnets, Bindings
- **Features**:
  - Browser-based network device scanner
  - SVG topology visualization
  - Reachability detection (ping, port scan)
  - Subnet management and VLAN tracking
  - Entity binding to network devices

#### **Storage Monitor**
Disk usage visualization and analysis.

- **Tabs**: Overview, Addons/Integrations, Backups, Files/Folders, Cleanup
- **Features**:
  - Disk usage treemap (WinDirStat-style)
  - Directory breakdown by size
  - Addon and integration storage analysis
  - Backup storage tracking
  - Storage cleanup suggestions

#### **Security Check**
Home Assistant security audit and recommendations.

- **Tabs**: Overview, Findings, Addons/Integrations, Network, Users, Tips
- **Features**:
  - Security grade (A–F)
  - Vulnerability scanning
  - SSL/HTTPS status verification
  - Integration permission audit
  - User access review
  - Security recommendations and best practices

#### **Frigate Privacy**
Control Frigate camera recording and detection with privacy schedules.

- **Tabs**: Control, Schedule, History, Settings
- **Features**:
  - Camera pause/resume with live countdown
  - Quick preset timers (15m, 30m, 1h, 2h)
  - Privacy schedules (recurring windows)
  - Frigate integration support
  - History log of all pause/resume events

---

### Home & Family (3)

#### **Chore Tracker**
Household chore management with team assignment.

- **Tabs**: Board, List, History, Settings
- **Features**:
  - Kanban board view
  - Chore assignment to family members
  - Member color coding
  - History tracking
  - Customizable chore categories

#### **Baby Tracker**
Track feeding, sleep, diapers, and growth.

- **Tabs**: Feeding, Lactation, Diapers, Sleep, Growth, Config
- **Features**:
  - Breastfeeding timer (L/R tracking)
  - Bottle and formula feeding logs
  - Diaper change tracking
  - Sleep duration and patterns
  - WHO growth percentile charts
  - Multi-child support

#### **Vacuum Water Monitor**
Track water levels and maintenance for robot vacuum/mops.

- **Tabs**: Status, History, Maintenance, Settings
- **Features**:
  - Water level tracking
  - Multi-brand support (Roborock, Dreame, Ecovacs, Xiaomi)
  - Maintenance alerts and schedules
  - Usage history and trends
  - Brand-specific calibration profiles

---

### Smart Reports & Energy (3)

#### **Energy Optimizer**
Real-time energy dashboard with insights and recommendations.

- **Tabs**: Dashboard, Patterns, Recommendations, Compare
- **Features**:
  - Real-time power draw display
  - 24-hour usage chart
  - Weekly heatmap with peak/off-peak analysis
  - Cost estimation (tariff-aware)
  - Energy efficiency score
  - Multi-period comparison (yesterday, last week, etc.)

#### **Energy Insights**
Detailed energy analytics with breakdown by device.

- **Tabs**: Overview, Daily, Weekly, Monthly, Devices, Trends
- **Features**:
  - Energy usage analytics (24h, 7d, 30d periods)
  - Cost tracking and projections
  - Device-level breakdown
  - Trend analysis with Chart.js visualizations
  - Export to CSV/JSON

#### **Energy Email**
Automated energy reports via email.

- **Tabs**: Overview, Schedule, Preview, Send Now, Config
- **Features**:
  - Auto-discovery of 64 energy sensors
  - Daily/weekly/monthly report options
  - Email preview before sending
  - SMTP configuration via `ha_tools_email` component
  - Tariff-aware cost calculations
  - Multi-currency support

#### **Shared Energy Settings**

All energy tools share a single configuration accessed via HA Tools Settings > Energia:

- **Energy Price**: Tariff rate (PLN/kWh)
- **Currency**: Display currency (PLN, EUR, USD, etc.)

---

### Other

#### **Smart Reports**
Automated Home Assistant status reports.

- **Tabs**: Energy, Automations, Devices, System
- **Features**:
  - Combined status dashboard
  - Report generation and export
  - System health summary

---

---

## Settings

Access HA Tools settings via the gear icon in the top-right corner.

### General
- **Language**: Polish (PL) or English (EN) — auto-detected from HA language
- **Theme**: Light, Dark, or Auto (follows HA theme)
- **Default Tab**: Set the default tool when opening HA Tools panel

### Energia (Energy)
- **Energy Price**: Tariff rate (PLN/kWh) — used by all three energy tools
- **Currency**: Display currency for cost calculations

### Email/SMTP
- Centralized SMTP configuration via `ha_tools_email` component
- Used by: Log Email, Energy Email
- Fallback: If not configured, falls back to HA notify services

### Deep Linking

Navigate directly to specific tools and tabs using URL hash:

```
http://your-ha-url:8123/panel/ha-tools#trace-viewer/timeline
http://your-ha-url:8123/panel/ha-tools#energy-optimizer/dashboard
http://your-ha-url:8123/panel/ha-tools#device-health/batteries
```

Format: `#tool-id/tab-name`

---

## Architecture

HA Tools uses a modular, lazy-loaded architecture:

```
ha-tools-loader.js
  ├─ ha-tools-bento.js       (Shared Bento Design System CSS)
  └─ ha-tools-panel.js       (Main panel, sidebar, settings)
      ├─ ha-trace-viewer.js
      ├─ ha-automation-analyzer.js
      ├─ ha-sentence-manager.js
      ├─ ha-data-exporter.js
      ├─ ha-log-email.js
      ├─ ha-purge-cache.js
      ├─ ha-yaml-checker.js
      ├─ ha-entity-renamer.js
      ├─ ha-encoding-fixer.js
      ├─ ha-device-health.js
      ├─ ha-backup-manager.js
      ├─ ha-network-map.js
      ├─ ha-storage-monitor.js
      ├─ ha-security-check.js
      ├─ ha-frigate-privacy.js
      ├─ ha-chore-tracker.js
      ├─ ha-baby-tracker.js
      ├─ ha-vacuum-water-monitor.js
      ├─ ha-energy-optimizer.js
      ├─ ha-energy-insights.js
      ├─ ha-energy-email.js
      └─ ha-smart-reports.js
```

### Design Highlights

- **Bento Design System**: Unified CSS with custom properties for colors, spacing, and typography
- **Dark Mode**: Auto-detects HA theme preference (follows system or HA setting)
- **Responsive**: Mobile-optimized layout with media queries for narrow screens
- **Shadow DOM**: Isolated styling per tool prevents CSS conflicts
- **HTML Diffing**: Prevents flickering on re-renders
- **Chart.js v4**: Professional data visualization
- **Server-side Persistence**: Cross-device sync via HA `frontend/set_user_data`
- **Bilingual**: Polish (PL) and English (EN) with auto-detection
- **Lazy Loading**: Tools load on-demand when selected

---

## Changelog

### v3.10.0
- **SECURITY**: `customElements.define` guards on stack/discovery (no more `QuotaExceededError` on double-load); discovery banner validates GitHub `repo` strings; XSS hardening across baby/chore/vacuum/network-map (consistent `_haToolsEsc` usage)
- **PRIVACY**: All external CDN removed — Chart.js v4 bundled locally to `vendor/`, Google Fonts `<link>` dropped (system font fallback when Inter is not installed). Network-map auto-scan disabled by default — user must explicitly click "Scan All". Export confirmations added to baby-tracker and data-exporter
- **REPO**: Deleted legacy `bak_20260402_193824/`, `ha-tools-loader-v3.js`, `ha-entity-renamer-temp.js`. Moved `check_unguarded.js` to `scripts/`

### v3.9.0
- **FIX**: Frigate Privacy stability (Coral TPU race conditions resolved)
- **FIX**: XSS protection across 8 tools via shared `window._haToolsEsc`
- **FIX**: Memory leaks in trace-viewer and baby-tracker `disconnectedCallback()`

### v3.7.6
- **NEW**: Deep linking with `#tool-id/tab-name` URL hash navigation
- **NEW**: Network Map rewrite — browser-based network scan, SVG topology visualization, subnet management, entity binding
- **NEW**: Centralized SMTP configuration via `ha_tools_email` component
- **FIX**: Full i18n (Polish ↔ English) across all 22 tools
- **FIX**: Responsive CSS for narrow screens and mobile devices

### v3.7.0
- **NEW**: Encoding Fixer — detect and fix mojibake in entities, YAML files, and Lovelace resources
- **NEW**: Frigate Privacy — pause Frigate cameras with timer and privacy schedule
- **NEW**: Shared Bento Design System CSS (ha-tools-bento.js)
- **FIX**: Server-side settings persistence (cross-device sync)
- **FIX**: Improved dark mode consistency across all tools
- **COUNT**: 22 tools integrated in the panel

### v3.6.0
- **NEW**: 20 integrated tools (Energy Email, Energy Insights, Log Email, Purge Cache, YAML Checker, Entity Renamer, Vacuum & Water Monitor)
- **NEW**: XSS protection and sanitization
- **NEW**: Mojibake protection across all tools
- **FIX**: Full dark mode support for all tools
- **FIX**: Removed BOM (Byte Order Mark) from JS files

### v3.5.0
- **NEW**: Energy Optimizer with tariff-aware peak/off-peak analysis
- **NEW**: Energy Insights with period selector and cost tracking
- **NEW**: Energy Email with SMTP auto-detection
- **FIX**: Energy tools schedule and configuration

### v3.4.0
- **NEW**: YAML Checker, Log Email, Smart Reports
- **NEW**: Device Health with full dark mode
- **FIX**: Automation Analyzer and Network Map responsive design

### v3.3.0
- **NEW**: Vacuum & Water Monitor with 9 robot profiles
- **NEW**: Chore Tracker and Baby Tracker
- **NEW**: Sentence Manager with Custom Actions tab
- **FIX**: Backup Manager, Storage Monitor, and Security Check dark mode

### v3.2.0
- **NEW**: Security Check, Entity Renamer, Purge Cache, Data Exporter

### v3.1.0
- **NEW**: 15 integrated tools
- **NEW**: Bento Light Mode UI
- **NEW**: Auto-loading addon architecture

### v2.5.0
- **NEW**: Build version auto-update detection
- **NEW**: Toast notification system

### v2.3.0
- **NEW**: 14 integrated tools
- **NEW**: Bento Light Mode UI

### v1.0.0
- Initial release with core tools

---

## Author

**MacSiem**

---

## License

MIT License — see LICENSE file for details.

---

## Tips & Troubleshooting

### Cards not appearing in card picker?

Ensure HA Tools is installed via HACS and Home Assistant has been restarted. The custom card elements are registered automatically.

### Email tools not sending?

Configure the `ha_tools_email` component in `configuration.yaml`:

```yaml
ha_tools_email:
  smtp_host: smtp.gmail.com
  smtp_port: 587
  smtp_user: your@gmail.com
  smtp_password: !secret gmail_app_password
```

Or use Home Assistant's built-in `notify` service as fallback.

### Settings not persisting across devices?

Ensure your Home Assistant setup allows `frontend/set_user_data` API calls. Cloud-connected instances sync automatically.

### Mobile layout looks odd?

This is expected on very narrow screens. HA Tools is optimized for screens 480px and wider.

---

**Questions? Issues? Star the repository on GitHub!**
