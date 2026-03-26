# 🔧 HA Tools Panel

> A comprehensive tools panel for Home Assistant with 15 integrated tools for monitoring, debugging, system management and daily life.

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)
[![Version](https://img.shields.io/badge/version-3.1.0-blue.svg)](https://github.com/MacSiem/ha-tools-panel/releases)
[![HA Version](https://img.shields.io/badge/Home%20Assistant-2023.1%2B-brightgreen.svg)](https://www.home-assistant.io/)

## 📸 Screenshot

![HA Tools Panel Screenshot](screenshot.png)

## 🛠️ Included Tools

| Tool | Description | Category |
|------|-------------|----------|
| 🧬 Trace Viewer | Browse and analyze automation traces | Debug |
| 🏥 Device Health | Monitor devices, batteries and network | Monitor |
| 📊 Automation Analyzer | Analyze automation performance | Debug |
| 💾 Backup Manager | Manage backups and scheduling | System |
| 🌐 Network Map | Visualize network topology | Monitor |
| 📈 Smart Reports | Generate intelligent reports | Reports |
| ⚡ Energy Optimizer | Optimize energy consumption | Monitor |
| 🗣️ Sentence Manager | Manage voice commands | System |
| 🏠 Chore Tracker | Track household chores | Life |
| 🍼 Baby Tracker | Track baby activities | Life |
| 👶 Cry Analyzer | AI baby cry analysis | Life |
| 📤 Data Exporter | Export entity data | System |
| 💽 Storage Monitor | Monitor storage usage | System |
| 🛡️ Security Check | Audit security config | System |

## 📦 Installation

### HACS (Recommended)

1. Open **HACS** in your Home Assistant sidebar
2. Go to **Frontend** → click the three-dots menu → **Custom repositories**
3. Add: `https://github.com/MacSiem/ha-tools-panel` with category **Lovelace**
4. Click **Explore & Download Repositories**, search for **HA Tools Panel**, and download
5. Restart Home Assistant
6. Go to **Settings → Dashboards → Resources** and add:
   ```
   /hacsfiles/ha-tools-panel/ha-tools-panel.js
   ```

### Manual Installation

1. Download `ha-tools-panel.js` from the [latest release](https://github.com/MacSiem/ha-tools-panel/releases)
2. Copy the file to `config/www/community/ha-tools-panel/ha-tools-panel.js`
3. Add a resource in **Settings → Dashboards → Resources**:
   ```
   /local/community/ha-tools-panel/ha-tools-panel.js
   ```
4. Add a custom panel in `configuration.yaml`:
   ```yaml
   panel_custom:
     - name: ha-tools-panel
       sidebar_title: Tools
       sidebar_icon: mdi:tools
       url_path: tools
       module_url: /local/community/ha-tools-panel/ha-tools-panel.js
   ```
5. Restart Home Assistant

## ⚙️ Configuration

No special configuration required after installation. The panel auto-discovers all tools and loads them dynamically.

### Requirements
- Home Assistant 2023.1 or newer
- HACS 1.6.0 or newer (for HACS installation)

## 🔄 Changelog

See [CHANGELOG.md](CHANGELOG.md) for full version history.

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

## 👤 Author

Created by [MacSiem](https://github.com/MacSiem)
