# 🔧 HA Tools Panel

> A comprehensive tools panel for Home Assistant with 22 integrated tools for monitoring, debugging, energy management, system administration and daily life.

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)
[![Version](https://img.shields.io/badge/version-3.7.0-blue.svg)](https://github.com/MacSiem/ha-tools-panel/releases)
[![HA Version](https://img.shields.io/badge/Home%20Assistant-2024.1%2B-brightgreen.svg)](https://www.home-assistant.io/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

## 📸 Screenshot

![HA Tools Panel](screenshot.png)

## 🛠️ Included Tools (22)

### 🔧 Advanced Tools (9)

| Tool | Description |
|------|-------------|
| 🧬 Trace Viewer | Browse and analyze automation traces with filtering, sorting, multi-select and batch export (JSON/CSV) |
| 📊 Automation Analyzer | Analyze automation performance, patterns and optimization opportunities |
| 🗣️ Sentence Manager | Manage HA voice commands (Assist sentences), custom actions with YAML generator, import/export |
| 📤 Data Exporter | Export entity data in JSON/CSV with snapshots and change tracking |
| 📋 Log Email | Email error logs with SMTP auto-detection, polling intervals (30s–5min), session history |
| 🧹 Purge Cache | Clean database, recorder cache, localStorage and browser cache |
| 🔍 YAML Checker | Validate YAML config, lint automations, detect deprecated syntax (10 patterns), entity reference scan |
| 🏷️ Entity Renamer | Bulk rename entities with live preview and automatic propagation to dashboards, automations, scripts |
| 🔧 Encoding Fixer | Detect and fix mojibake, BOM and encoding issues in entities, files and lovelace resources |

### 🏥 Device Health (5)

| Tool | Description |
|------|-------------|
| 💾 Backup Manager | Manage backups, scheduling, health monitoring with method badges |
| 🌐 Network Map | Visualize network topology and device connectivity (canvas-based map + list view) |
| 💽 Storage Monitor | Monitor disk usage, addon sizes, database growth and cleanup recommendations |
| 🛡️ Security Check | Audit security config with score grading (A–F), addon host_network checks, SSL/HTTPS, users, integrations |
| 🔒 Frigate Privacy | Pause Frigate cameras with quick-pause (15m/30m/1h/2h), scheduled privacy windows, history log |

### ⚡ Smart Reports & Energy (3)

| Tool | Description |
|------|-------------|
| ⚡ Energy Optimizer | Optimize energy consumption with tariff-aware peak/off-peak analysis, efficiency score, 24h usage chart |
| 📊 Energy Insights | Energy usage charts, trends, cost tracking with period selector (24h/7d/30d) |
| 📧 Energy Email | Automated energy reports via email with SMTP auto-detection and scheduling |

### 🏠 Home & Family (3)

| Tool | Description |
|------|-------------|
| 🏠 Chore Tracker | Track household chores, assign to family members, view stats and completion history |
| 🍼 Baby Tracker | Track feeding, sleep, diapers and growth with WHO percentile charts, multi-baby support |
| 🤖 Vacuum & Water Monitor | Robot vacuum tracking with 9 calibration profiles (Dreame, Roborock, Ecovacs, Xiaomi), water filter monitoring |

## ✨ Features

- **Bento Design System** — unified light/dark mode, consistent styling across all tools
- **Dynamic tool loading** — tools load on demand, panel auto-discovers available components
- **Shadow DOM isolation** — each tool runs in its own Shadow DOM for style isolation
- **Polish & English UI** — bilingual interface with proper UTF-8 support
- **No configuration required** — works out of the box after installation
- **HACS compatible** — install and update via HACS custom repository

## 📦 Installation

### HACS (Recommended)

1. Open **HACS** in your Home Assistant sidebar
2. Go to **Frontend** → click the three-dots menu → **Custom repositories**
3. Add: `https://github.com/MacSiem/ha-tools-panel` with category **Lovelace**
4. Click **Explore & Download Repositories**, search for **HA Tools Panel**, and download
5. Restart Home Assistant
6. Go to **Settings → Dashboards → Resources** and add:
   ```
   /hacsfiles/ha-tools-panel/ha-tools-loader.js
   ```

### Manual Installation

1. Download all JS files from the [latest release](https://github.com/MacSiem/ha-tools-panel/releases)
2. Copy all files to `config/www/community/ha-tools-panel/`
3. Add a resource in **Settings → Dashboards → Resources**:
   ```
   /local/community/ha-tools-panel/ha-tools-loader.js
   ```
4. Add a custom panel in `configuration.yaml`:
   ```yaml
   panel_custom:
     - name: ha-tools-panel
       sidebar_title: HA Tools
       sidebar_icon: mdi:tools
       url_path: ha-tools
       module_url: /local/community/ha-tools-panel/ha-tools-loader.js
   ```
5. Restart Home Assistant

## ⚙️ Configuration

No special configuration required after installation. The panel auto-discovers all tools and loads them dynamically.

### Requirements
- Home Assistant 2024.1 or newer
- HACS 1.6.0 or newer (for HACS installation)

## 📁 File Structure

```
ha-tools-panel/
├── ha-tools-loader.js          # Bootstrap loader (registered in lovelace_resources)
├── ha-tools-panel.js           # Main orchestrator (~116KB, 22 tools)
├── ha-tools-bento.js           # Bento Design System shared CSS
├── ha-tools-discovery.js       # New tool announcements banner
├── ha-trace-viewer.js          # Trace Viewer
├── ha-automation-analyzer.js   # Automation Analyzer
├── ha-sentence-manager.js      # Sentence Manager
├── ha-data-exporter.js         # Data Exporter
├── ha-log-email.js             # Log Email
├── ha-purge-cache.js           # Purge Cache
├── ha-yaml-checker.js          # YAML Checker
├── ha-entity-renamer.js        # Entity Renamer
├── ha-encoding-fixer.js        # Encoding Fixer
├── ha-backup-manager.js        # Backup Manager
├── ha-network-map.js           # Network Map
├── ha-storage-monitor.js       # Storage Monitor
├── ha-security-check.js        # Security Check
├── ha-frigate-privacy.js       # Frigate Privacy
├── ha-energy-optimizer.js      # Energy Optimizer
├── ha-energy-insights.js       # Energy Insights
├── ha-energy-email.js          # Energy Email
├── ha-smart-reports.js         # Smart Reports (group component)
├── ha-device-health.js         # Device Health (group component)
├── ha-chore-tracker.js         # Chore Tracker
├── ha-baby-tracker.js          # Baby Tracker
└── ha-vacuum-water-monitor.js  # Vacuum & Water Monitor
```

## 🔄 Changelog

See [CHANGELOG.md](CHANGELOG.md) for full version history.

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

## 👤 Author

Created by [MacSiem](https://github.com/MacSiem)
