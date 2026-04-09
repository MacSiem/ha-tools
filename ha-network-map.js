(function() {
'use strict';

// ── HA Tools Server Persistence Helper ──
// Uses HA frontend/set_user_data for cross-device per-user persistence
// Falls back to localStorage for instant reads (cache), writes to both
window._haToolsPersistence = window._haToolsPersistence || {
  _cache: {},
  _hass: null,
  setHass(hass) { this._hass = hass; },

  async save(key, data) {
    const fullKey = 'ha-tools-' + key;
    // Always write localStorage as fast cache
    try { localStorage.setItem(fullKey, JSON.stringify(data)); } catch(e) {}
    // Write to HA server (cross-device)
    if (this._hass) {
      try {
        await this._hass.callWS({ type: 'frontend/set_user_data', key: fullKey, value: data });
      } catch(e) { console.warn('[HA Tools Persist] Server save error:', key, e); }
    }
    this._cache[fullKey] = data;
  },

  async load(key) {
    const fullKey = 'ha-tools-' + key;
    // 1. Memory cache (instant)
    if (this._cache[fullKey] !== undefined) return this._cache[fullKey];
    // 2. localStorage (fast, may be stale on other device)
    try {
      const raw = localStorage.getItem(fullKey);
      if (raw) {
        this._cache[fullKey] = JSON.parse(raw);
      }
    } catch(e) {}
    // 3. HA server (authoritative, cross-device) — async update
    if (this._hass) {
      try {
        const result = await this._hass.callWS({ type: 'frontend/get_user_data', key: fullKey });
        if (result && result.value !== undefined && result.value !== null) {
          this._cache[fullKey] = result.value;
          // Update localStorage cache
          try { localStorage.setItem(fullKey, JSON.stringify(result.value)); } catch(e) {}
          return result.value;
        }
      } catch(e) { console.warn('[HA Tools Persist] Server load error:', key, e); }
    }
    return this._cache[fullKey] || null;
  },

  // Synchronous read from cache/localStorage only (for initial render)
  loadSync(key) {
    const fullKey = 'ha-tools-' + key;
    if (this._cache[fullKey] !== undefined) return this._cache[fullKey];
    try {
      const raw = localStorage.getItem(fullKey);
      if (raw) {
        this._cache[fullKey] = JSON.parse(raw);
        return this._cache[fullKey];
      }
    } catch(e) {}
    return null;
  }
};

class HaNetworkMap extends HTMLElement {
  constructor() {
    super();
    this._lang = (navigator.language || '').startsWith('pl') ? 'pl' : 'en';
    this.attachShadow({ mode: 'open' });
    this._lastRenderTime = 0;
    this._renderScheduled = false;
    this._firstHassRender = false;
    this._currentPage = {};
    this._pageSize = 20;
    this.devices = [];
    this.filteredDevices = [];
    this.selectedDevice = null;
    this.activeTab = 'list';
    this.searchQuery = '';
    this.sortBy = 'name';
    this.sortDesc = false;
    this._deviceRegistry = [];
    this._registryLoaded = false;
    // --- HTML diffing ---
    this._lastHtml = '';
    this._lastScanTime = null;
  }
  _persistKey() { return 'ha-network-map-devices'; }
  _loadPersistedDevices() {
    try {
      const stored = localStorage.getItem(this._persistKey());
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  }
  _persistDevices(devices) {
    const map = {};
    devices.forEach(d => {
      const key = d.ip || d.mac || d.name;
      map[key] = {...d, last_seen: d.last_seen || new Date().toISOString()};
    });
    try { localStorage.setItem(this._persistKey(), JSON.stringify(map)); } catch {}
  }
  static get _translations() {
    return {
      en: {
        listTab: 'List', mapTab: 'Map',
        searchPlaceholder: 'Search devices...', deviceName: 'Device Name', category: 'Category',
        status: 'Status', ipAddress: 'IP Address', macAddress: 'MAC Address', lastSeen: 'Last Seen',
        noDevicesFound: 'No network devices found. Install Nmap, Ping, Shelly, ESPHome, or other device integrations to discover devices.',
        phone: 'Phone', tablet: 'Tablet', computer: 'Computer', media: 'Media',
        smartHome: 'Smart Home', wearable: 'Wearable', other: 'Other',
        home: 'HOME', away: 'AWAY', unknown: 'UNKNOWN', offline: 'OFFLINE', zone: 'ZONE',
        totalDevices: 'Total Devices', online: 'Online', awayLabel: 'Away', offlineLabel: 'Offline',
        deviceDetail: 'Device:', categoryDetail: 'Category:', statusDetail: 'Status:',
        ipDetail: 'IP:', macDetail: 'MAC:', lastSeenDetail: 'Last Seen:',
        router: 'Router', gateway: 'Gateway', manufacturer: 'Manufacturer', model: 'Model',
        connection: 'Connection', allCategories: 'All', filterCategory: 'Filter:',
      },
      pl: {
        listTab: 'Lista', mapTab: 'Mapa',
        searchPlaceholder: 'Szukaj urz\u0105dze\u0144...', deviceName: 'Nazwa urz\u0105dzenia', category: 'Kategoria',
        status: 'Stan', ipAddress: 'Adres IP', macAddress: 'Adres MAC', lastSeen: 'Ostatnio widoczne',
        noDevicesFound: 'Brak urz\u0105dze\u0144 sieciowych. Zainstaluj integracje Nmap, Ping, Shelly, ESPHome lub inne do automatycznego odkrywania urz\u0105dze\u0144.',
        phone: 'Telefon', tablet: 'Tablet', computer: 'Komputer', media: 'Media',
        smartHome: 'Inteligentny dom', wearable: 'Urz\u0105dzenie noszone', other: 'Inne',
        home: 'W DOMU', away: 'POZA DOMEM', unknown: 'NIEZNANY', offline: 'NIEDOST\u0118PNY', zone: 'STREFA',
        totalDevices: 'Razem urz\u0105dze\u0144', online: 'Online', awayLabel: 'Poza domem', offlineLabel: 'Offline',
        deviceDetail: 'Urz\u0105dzenie:', categoryDetail: 'Kategoria:', statusDetail: 'Stan:',
        ipDetail: 'IP:', macDetail: 'MAC:', lastSeenDetail: 'Ostatnio:',
        router: 'Router', gateway: 'Brama', manufacturer: 'Producent', model: 'Model',
        connection: 'Po\u0142\u0105czenie', allCategories: 'Wszystkie', filterCategory: 'Filtr:',
      }
    };
  }
  _t(key) {
    const lang = this._hass?.language || 'en';
    const T = HaNetworkMap._translations;
    return (T[lang] || T['en'])[key] || T['en'][key] || key;
  }
  setConfig(config) {
    this.config = config;
    this.title = config.title || 'Network Map';
    this.routerIp = config.router_ip || '192.168.1.1';
    this.gatewayIp = config.gateway_ip || '192.168.0.1';
  }
  set hass(hass) {

    if (hass?.language) this._lang = hass.language.startsWith('pl') ? 'pl' : 'en';    this._hass = hass;
    if (!hass) return;
    const now = Date.now();
    if (!this._firstHassRender) {
      this._firstHassRender = true;
      this._loadDeviceRegistry().then(() => { this.updateDevices(); this._lastScanTime = Date.now(); this._doRender(); });
      this._lastRenderTime = now;
      return;
    }
    if (now - (this._lastRenderTime || 0) < 5000) {
      if (!this._renderScheduled) {
        this._renderScheduled = true;
        setTimeout(() => {
          this._renderScheduled = false;
          this.updateDevices(); this._doRender();
          this._lastRenderTime = Date.now();
        }, 5000 - (now - (this._lastRenderTime || 0)));
      }
      return;
    }
    this.updateDevices(); this._doRender(); this._lastRenderTime = now;
  }
  async _loadDeviceRegistry() {
    if (this._registryLoaded || !this._hass) return;
    try {
      this._deviceRegistry = await this._hass.callWS({ type: 'config/device_registry/list' });
      this._registryLoaded = true;
    } catch (e) { console.warn('[ha-network-map] device registry load failed:', e); this._deviceRegistry = []; }
  }
  _sanitize(s) { try { return decodeURIComponent(escape(s)); } catch(e) { return s; } }
  _getRegistryInfo() {
    const lookup = {};
    (this._deviceRegistry || []).forEach(d => {
      const mac = d.connections?.find(c => c[0] === 'mac')?.[1] || null;
      const ipMatch = d.configuration_url ? d.configuration_url.match(/(\d+\.\d+\.\d+\.\d+)/) : null;
      const ip = ipMatch ? ipMatch[1] : null;
      if (mac || ip) {
        const name = this._sanitize(d.name_by_user || d.name || '').toLowerCase();
        lookup[name] = { mac, ip, manufacturer: d.manufacturer || null, model: d.model || null };
      }
    });
    return lookup;
  }
  updateDevices() {
    const states = this._hass.states; this.devices = []; const deviceMap = {};
    const regLookup = this._getRegistryInfo();
    Object.keys(states).forEach(eid => {
      if (!eid.startsWith('device_tracker.')) return;
      const st = states[eid]; const attr = st.attributes || {};
      const fname = this._sanitize(attr.friendly_name || eid.replace('device_tracker.', ''));
      const raw = (st.state || '').toLowerCase();
      let status = raw === 'home' ? 'home' : (raw === 'not_home' || raw === 'away') ? 'away' : raw === 'unavailable' ? 'offline' : raw === 'unknown' ? 'unknown' : 'zone';
      let ip = attr.ip || attr.ip_address || attr.local_ip || attr.host_ip || null;
      let mac = attr.mac || attr.mac_address || attr.host_mac || null;
      let mfr = null, mdl = null;
      const reg = regLookup[fname.toLowerCase()];
      if (reg) { if (!ip && reg.ip) ip = reg.ip; if (!mac && reg.mac) mac = reg.mac; mfr = reg.manufacturer; mdl = reg.model; }
      const dev = {
        id: eid, name: fname, status, rawState: st.state, ip: ip || '', mac: mac ? mac.toUpperCase() : '',
        sourceType: attr.source_type || 'unknown', hostName: attr.host_name || fname,
        lastSeen: st.last_changed || st.last_updated || '', icon: this._icon(fname, attr),
        category: this._cat(fname, attr), battery: attr.battery_level || attr.battery || null,
        hasGps: attr.latitude !== undefined && attr.longitude !== undefined,
        ssid: attr.essid || attr.ssid || attr.wifi_name || null,
        rssi: attr.rssi || attr.signal_strength || null,
        connType: attr.connection_type || attr.network_type || (attr.is_wired ? 'ethernet' : null),
        manufacturer: mfr, model: mdl, attributes: attr
      };
      this.devices.push(dev); deviceMap[fname.toLowerCase()] = dev;
    });
    (this._deviceRegistry || []).forEach(d => {
      const mac = d.connections?.find(c => c[0] === 'mac')?.[1] || null;
      const ipM = d.configuration_url ? d.configuration_url.match(/(\d+\.\d+\.\d+\.\d+)/) : null;
      const ip = ipM ? ipM[1] : null;
      if (!mac && !ip) return;
      const nm = this._sanitize(d.name_by_user || d.name || ''); const nk = nm.toLowerCase();
      if (deviceMap[nk]) {
        if (mac && !deviceMap[nk].mac) deviceMap[nk].mac = mac.toUpperCase();
        if (ip && !deviceMap[nk].ip) deviceMap[nk].ip = ip;
        if (d.manufacturer && !deviceMap[nk].manufacturer) deviceMap[nk].manufacturer = d.manufacturer;
        if (d.model && !deviceMap[nk].model) deviceMap[nk].model = d.model;
        return;
      }
      this.devices.push({
        id: 'reg_' + d.id, name: nm, status: 'unknown', rawState: 'unknown', ip: ip || '',
        mac: mac ? mac.toUpperCase() : '', sourceType: 'registry', hostName: nm, lastSeen: '',
        icon: this._icon(nm, { manufacturer: d.manufacturer, model: d.model }),
        category: this._cat(nm, { manufacturer: d.manufacturer, model: d.model }),
        battery: null, hasGps: false, ssid: null, rssi: null, connType: null,
        manufacturer: d.manufacturer || null, model: d.model || null, attributes: {}
      });
      deviceMap[nk] = this.devices[this.devices.length - 1];
    });
    // === HYBRID PERSISTENCE: Merge with persisted offline this.devices ===
    const persisted = this._loadPersistedDevices();
    const currentKeys = new Set(this.devices.map(d => d.ip || d.mac || d.name));
    
    // Add previously seen this.devices that are now offline
    Object.values(persisted).forEach(pd => {
      const key = pd.ip || pd.mac || pd.name;
      if (!currentKeys.has(key)) {
        this.devices.push({
          ...pd,
          status: 'offline',
          rawState: 'offline',
          last_seen: pd.last_seen || pd.lastSeen
        });
      }
    });
    
    // Update last_seen for online this.devices and preserve for offline
    this.devices.forEach(d => {
      if (d.status === 'home' || d.status === 'zone' || d.rawState === 'home') {
        d.last_seen = new Date().toISOString();
      } else if (!d.last_seen) {
        const key = d.ip || d.mac || d.name;
        if (persisted[key]) {
          d.last_seen = persisted[key].last_seen || persisted[key].lastSeen;
        }
      }
    });
    
    // Persist updated device list
    this._persistDevices(this.devices);
    this.devices = this.devices;
    this._filterSort();
  }
  _cat(name, attr) {
    const a = (name + ' ' + ((attr && attr.model) || '') + ' ' + ((attr && attr.manufacturer) || '')).toLowerCase();
    if (/phone|iphone|android|mobile|pixel|galaxy|oneplus|xiaomi|huawei|oppo|redmi|sm-[a-z]/.test(a)) return 'Phone';
    if (/tablet|ipad/.test(a)) return 'Tablet';
    if (/computer|laptop|pc|mac|desktop|thinkpad|macbook|imac|surface|dell|lenovo|hp |asus|lggram/.test(a)) return 'Computer';
    if (/raspberry|pi|rpi|server|nas|synology|qnap/.test(a)) return 'Server';
    if (/tv|media|kodi|plex|chromecast|roku|fire.?stick|apple.?tv|shield|sonos|denon|samsung.*tv|lg.*tv|play.?box|avr/.test(a)) return 'Media';
    if (/printer|brother|canon|epson|hp.?print/.test(a)) return 'Printer';
    if (/camera|doorbell|ring|nest|reolink|frigate|hikvision|dahua|cam-pt/.test(a)) return 'Camera';
    if (/router|gateway|access.?point|ap |mesh|wifi|ubiquiti|unifi|mikrotik|tp.?link|fritz/.test(a)) return 'Router';
    if (/switch|plug|socket|relay|shelly|sonoff|tasmota|zigbee|zwave|esp32|esp8266|tuya|ikea|meross/.test(a)) return 'Smart Home';
    if (/light|bulb|lamp|hue|tradfri|yeelight|wled|led.?strip/.test(a)) return 'Smart Home';
    if (/sensor|motion|temperature|humidity|thermostat|climate/.test(a)) return 'Smart Home';
    if (/watch|wearable|band|fitbit|garmin|oclean/.test(a)) return 'Wearable';
    if (/vacuum|roborock|dreame|roomba|robot/.test(a)) return 'Smart Home';
    if (/voice|echo|alexa|google.?home|homepod/.test(a)) return 'Smart Home';
    return 'Other';
  }
  _icon(name, attr) {
    const c = this._cat(name, attr);
    return ({ Phone:'\u{1F4F1}', Tablet:'\u{1F4F2}', Computer:'\u{1F4BB}', Server:'\u{1F5A5}\uFE0F',
      Media:'\u{1F4FA}', Printer:'\u{1F5A8}\uFE0F', Camera:'\u{1F4F7}', Router:'\u{1F4E1}',
      'Smart Home':'\u{1F3E0}', Wearable:'\u231A', Other:'\u{1F4E1}' })[c] || '\u{1F4E1}';
  }
  _filterSort() {
    let f = this.devices;
    if (this._catFilter && this._catFilter !== 'all') f = f.filter(d => d.category === this._catFilter);
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      f = f.filter(d => d.name.toLowerCase().includes(q) || d.category.toLowerCase().includes(q) ||
        (d.ip && d.ip.includes(q)) || (d.mac && d.mac.toLowerCase().includes(q)) ||
        (d.manufacturer && d.manufacturer.toLowerCase().includes(q)) || (d.model && d.model.toLowerCase().includes(q)));
    }
    this.filteredDevices = f;
    this.filteredDevices.sort((a, b) => {
      let av, bv;
      if (this.sortBy === 'status') {
        const so = { home:0, zone:1, away:2, unknown:3, offline:4 };
        av = so[a.status] ?? 5; bv = so[b.status] ?? 5;
      } else if (this.sortBy === 'category') { av = a.category; bv = b.category; }
      else if (this.sortBy === 'ip') {
        av = a.ip ? a.ip.split('.').map(n => n.padStart(3,'0')).join('.') : 'zzz';
        bv = b.ip ? b.ip.split('.').map(n => n.padStart(3,'0')).join('.') : 'zzz';
      } else { av = a.name; bv = b.name; }
      const r = av < bv ? -1 : av > bv ? 1 : 0;
      return this.sortDesc ? -r : r;
    });
  }
  _doRender() {
    if (!this._hass) return;
    const css = this._css();
    const content = this.activeTab === 'list' ? this._listTab() : this._mapTab();
    const scanInfo = this._lastScanTime ? '<span style="font-size:11px;color:var(--bento-text-secondary);">Last scan: ' + new Date(this._lastScanTime).toLocaleTimeString() + '</span>' : '';
    const html = css + '<div class="card"><div class="card-header-wrapper"><div class="card-header">\u{1F4E1} ' + this.title + '</div><div class="header-footer">' + scanInfo + '<button class="rb" id="rescanBtn">\u{1F504} ' + (this._lang === 'pl' ? 'Skanuj' : 'Rescan') + '</button></div></div><div class="tabs">' +
      '<button class="tab-btn ' + (this.activeTab === 'list' ? 'active' : '') + '" data-tab="list">' + this._t('listTab') + '</button>' +
      '<button class="tab-btn ' + (this.activeTab === 'map' ? 'active' : '') + '" data-tab="map">' + this._t('mapTab') + '</button>' +
      '</div>' + content + '</div>';
    if (this._lastHtml === html) return;
    this._lastHtml = html;
    this.shadowRoot.innerHTML = html;
    this._bindEvents();
  }
  _css() { return '<style>' + (window.HAToolsBentoCSS || "") + '\n' +
    '* { box-sizing: border-box; }' +
    ':host{--bp:var(--bento-primary);--bpl:var(--bento-primary-light);--bs:var(--bento-success);--bsl:var(--bento-success-light);--be:var(--bento-error);--bel:var(--bento-error-light);--bw:var(--bento-warning);--bwl:var(--bento-warning-light);' +
    '--bbg:var(--bento-bg);--bcard:var(--bento-card);--bbrd:var(--bento-border);' +
    '--btxt:var(--bento-text);--btxt2:var(--bento-text-secondary);--btxtm:var(--bento-text-muted);' +
    '--brxs:var(--bento-radius-xs);--brsm:var(--bento-radius-sm);--brmd:var(--bento-radius-md);--bshsm:var(--bento-shadow-sm);--bshmd:var(--bento-shadow-md);' +
    '--btr:var(--bento-transition);font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif}' +
    '.card{background:var(--bento-card);border:1px solid var(--bento-border);border-radius:var(--bento-radius-md);box-shadow:var(--bento-shadow-sm);padding:20px;color:var(--bento-text);font-family:Inter,-apple-system,sans-serif}' +
    '.card-header-wrapper{border-bottom:1px solid var(--bento-border);padding-bottom:12px;margin-bottom:16px}' +
    '.card-header{font-size:20px;font-weight:600;color:var(--bento-text);margin-bottom:12px;}' +
    '.header-footer{display:flex;gap:12px;align-items:center;flex-wrap:wrap}@media(max-width:480px){.header-footer{flex-direction:column;align-items:flex-start;width:100%}.rb{width:100%}}' +
    '.tabs{display:flex;gap:4px;border-bottom:2px solid var(--bento-border);margin-bottom:20px;overflow-x:auto}' +
    '.tab-btn{padding:10px 18px;border:none;background:transparent;cursor:pointer;font-size:13px;font-weight:500;font-family:Inter,sans-serif;' +
    'color:var(--bento-text-secondary);border-bottom:2px solid transparent;margin-bottom:-2px;transition:var(--btr);white-space:nowrap;border-radius:0}' +
    '.tab-btn:hover{color:var(--bento-primary);background:var(--bento-primary-light)}.tab-btn.active{color:var(--bento-primary);border-bottom-color:var(--bento-primary);font-weight:600}' +
    '.stats-bar{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:16px}' +
    '.stat-mini{background:var(--bento-bg);border:1px solid var(--bento-border);border-radius:var(--bento-radius-sm);padding:12px;text-align:center;transition:var(--btr)}' +
    '.stat-mini:hover{box-shadow:var(--bento-shadow-md);transform:translateY(-1px)}' +
    '.stat-mini .sv{font-size:24px;font-weight:700;color:var(--bento-text);line-height:1.2}' +
    '.stat-mini .sl{font-size:11px;font-weight:500;color:var(--bento-text-secondary);text-transform:uppercase;letter-spacing:.5px;margin-top:2px}' +
    '.stat-mini.so .sv{color:var(--bento-success)}.stat-mini.sa .sv{color:var(--bento-warning)}.stat-mini.sf .sv{color:var(--bento-error)}' +
    '.toolbar{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center}' +
    '.si{flex:1;min-width:150px;padding:8px 12px;border:1.5px solid var(--bento-border);border-radius:var(--bento-radius-xs);font-size:13px;font-family:Inter,sans-serif;background:var(--bento-card);color:var(--bento-text);outline:none;transition:var(--btr)}' +
    '.si:focus{border-color:var(--bento-primary);box-shadow:0 0 0 3px rgba(59,130,246,.1)}.si::placeholder{color:var(--bento-text-muted)}' +
    '.fs{padding:8px 12px;border:1.5px solid var(--bento-border);border-radius:var(--bento-radius-xs);font-size:13px;font-family:Inter,sans-serif;background:var(--bento-card);color:var(--bento-text);outline:none;min-width:0}.fs:focus{border-color:var(--bento-primary)}' +
    '.tw{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:0 -4px;padding:0 4px}' +
    'table{width:100%;border-collapse:separate;border-spacing:0;font-family:Inter,sans-serif;min-width:600px}' +
    'th{background:var(--bento-bg);color:var(--bento-text-secondary);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;padding:10px 12px;text-align:left;border-bottom:2px solid var(--bento-border);cursor:pointer;user-select:none;white-space:nowrap}' +
    'th:hover{color:var(--bento-primary)}' +
    'td{padding:10px 12px;border-bottom:1px solid var(--bento-border);color:var(--bento-text);font-size:13px;white-space:nowrap}' +
    'tr:hover td{background:var(--bento-primary-light)}tr:last-child td{border-bottom:none}tr{cursor:pointer}' +
    '.di{font-size:16px;margin-right:4px;vertical-align:middle}.dn{font-weight:500}' +
    '.ds{font-size:11px;color:var(--bento-text-muted);display:block;margin-top:1px}' +
    '.sb{display:inline-block;padding:3px 8px;border-radius:12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.3px}' +
    '.sh{background:var(--bento-success-light);color:var(--bento-success)}.sa2{background:var(--bento-warning-light);color:var(--bento-warning)}.su{background:rgba(148,163,184,.12);color:var(--bento-text-muted)}.so2{background:var(--bento-error-light);color:var(--bento-error)}.sz{background:var(--bento-primary-light);color:var(--bento-primary)}' +
    '.mn{font-family:"SF Mono","Cascadia Code",monospace;font-size:12px;color:var(--bento-text-secondary)}' +
    '.dd{background:var(--bento-bg);border:1px solid var(--bento-border);padding:16px;border-radius:var(--bento-radius-sm);margin-top:12px;animation:bf .2s ease-out}' +
    '@keyframes bf{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}' +
    '.dr{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--bento-border);gap:8px}' +
    '.dr:last-child{border-bottom:none}.dl{color:var(--bento-text-secondary);font-size:12px;font-weight:500;white-space:nowrap}.dv{color:var(--bento-text);font-size:12px;text-align:right;word-break:break-all}' +
    '.dc{float:right;background:none;border:1px solid var(--bento-border);border-radius:var(--bento-radius-xs);padding:4px 10px;cursor:pointer;color:var(--bento-text-secondary);font-size:12px}' +
    '.dc:hover{background:var(--bento-error-light);color:var(--bento-error)}' +
    '.pg{display:flex;justify-content:center;align-items:center;gap:8px;margin-top:16px;padding:12px 0;border-top:1px solid var(--bento-border);flex-wrap:wrap}' +
    '.pb{padding:6px 12px;border:1.5px solid var(--bento-border);background:var(--bento-card);color:var(--bento-text);border-radius:var(--bento-radius-xs);cursor:pointer;font-size:12px;font-weight:500;font-family:Inter,sans-serif;transition:var(--btr)}' +
    '.pb:hover:not(:disabled){background:var(--bento-primary);color:#fff;border-color:var(--bento-primary)}.pb:disabled{opacity:.4;cursor:not-allowed}' +
    '.pi2{font-size:12px;color:var(--bento-text-secondary);font-weight:500}' +
    '.tree-view{margin:0}' +
    '.tree-group{margin-bottom:8px;border:1px solid var(--bento-border);border-radius:var(--bento-radius-sm);overflow:hidden}' +
    '.tree-group-header{display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--bento-bg);cursor:pointer;user-select:none;transition:var(--btr)}' +
    '.tree-group-header:hover{background:rgba(59,130,246,.04)}' +
    '.tree-toggle{display:inline-block;width:16px;text-align:center;font-size:12px;color:var(--bento-text-secondary);transition:transform .2s}' +
    '.tree-toggle.collapsed{transform:rotate(-90deg)}' +
    '.tree-status-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}' +
    '.tree-status-label{font-weight:500;color:var(--bento-text);flex:1;font-size:13px}' +
    '.tree-group-items{display:flex;flex-direction:column;border-top:1px solid var(--bento-border);max-height:none;overflow:hidden;transition:max-height .3s}' +
    '.tree-group-items.collapsed{max-height:0;border-top:none}' +
    '.tree-item{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--bento-border);cursor:pointer;transition:var(--btr);font-size:12px}' +
    '.tree-item:last-child{border-bottom:none}' +
    '.tree-item:hover{background:rgba(59,130,246,.05)}' +
    '.tree-item-icon{font-size:16px;min-width:20px;text-align:center}' +
    '.tree-item-name{font-weight:500;color:var(--bento-text);min-width:120px;flex:1}' +
    '.tree-item-ip{color:var(--bento-text-secondary);font-family:"SF Mono","Cascadia Code",monospace;font-size:11px;min-width:100px;text-align:right}' +
    '.tree-item-mfg{color:var(--bento-text-muted);font-size:10px;min-width:80px;text-align:right}' +
    '@media(max-width:600px){.tree-item{flex-wrap:wrap;gap:4px;padding:8px}.tree-item-name{min-width:100%}.tree-item-ip{min-width:100%;text-align:left}.tree-item-mfg{min-width:100%;text-align:left}}' +
    '.es{text-align:center;padding:40px 16px;color:var(--bento-text-secondary);font-size:14px}' +
    '::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--bento-border);border-radius:3px}' +
    '@media(max-width:600px){.card{padding:12px}.stats-bar{grid-template-columns:repeat(2,1fr);gap:6px}.stat-mini{padding:8px}' +
    '.stat-mini .sv{font-size:20px}.toolbar{flex-direction:column}.si{width:100%}table{min-width:500px}td,th{padding:8px 6px;font-size:12px}}' +
    '/* === DARK MODE === */ @media (prefers-color-scheme: dark) { /* ===== BENTO DESIGN SYSTEM (local fallback) ===== */  :host { --bento-primary: #3B82F6; --bento-primary-hover: #2563EB; --bento-primary-light: rgba(59, 130, 246, 0.08); --bento-success: #10B981; --bento-success-light: rgba(16, 185, 129, 0.08); --bento-error: #EF4444; --bento-error-light: rgba(239, 68, 68, 0.08); --bento-warning: #F59E0B; --bento-warning-light: rgba(245, 158, 11, 0.08); --bento-bg: var(--primary-background-color, #F8FAFC); --bento-card: var(--card-background-color, #FFFFFF); --bento-border: var(--divider-color, #E2E8F0); --bento-text: var(--primary-text-color, #1E293B); --bento-text-secondary: var(--secondary-text-color, #64748B); --bento-text-muted: var(--disabled-text-color, #94A3B8); --bento-radius-xs: 6px; --bento-radius-sm: 10px; --bento-radius-md: 16px; --bento-shadow-sm: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06); --bento-shadow-md: 0 4px 12px rgba(0,0,0,0.05), 0 2px 4px rgba(0,0,0,0.04); --bento-shadow-lg: 0 8px 25px rgba(0,0,0,0.06), 0 4px 10px rgba(0,0,0,0.04); --bento-transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); }  :host { --bento-bg: var(--primary-background-color, #1a1a2e); --bento-card: var(--card-background-color, #16213e); --bento-border: var(--divider-color, #2a2a4a); --bento-text: var(--primary-text-color, #e0e0e0); --bento-text-secondary: var(--secondary-text-color, #a0a0b0); --bento-text-muted: var(--disabled-text-color, #6a6a7a); --bento-shadow-sm: 0 1px 3px rgba(0,0,0,0.3); --bento-shadow-md: 0 4px 12px rgba(0,0,0,0.4); --bento-primary-light: rgba(59,130,246,0.15); --bento-success-light: rgba(16,185,129,0.15); --bento-error-light: rgba(239,68,68,0.15); --bento-warning-light: rgba(245,158,11,0.15); color-scheme: dark !important; } .card, .card, .main-card, .exporter-card, .security-card, .reports-card, .storage-card, .chore-card, .cry-card, .backup-card, .network-card, .sentence-card, .energy-card, .panel-card { background: var(--bento-card) !important; color: var(--bento-text) !important; border-color: var(--bento-border) !important; } input, select, textarea { background: var(--bento-bg); color: var(--bento-text); border-color: var(--bento-border); } .stat, .stat-card, .summary-card, .metric-card, .kpi-card, .health-card { background: var(--bento-bg); border-color: var(--bento-border); } .tab-content, .section { color: var(--bento-text); } table th { background: var(--bento-bg); color: var(--bento-text-secondary); border-color: var(--bento-border); } table td { color: var(--bento-text); border-color: var(--bento-border); } tr:hover td { background: rgba(59,130,246,0.08); } .empty-state, .no-data { color: var(--bento-text-secondary); } .schedule-section, .settings-section, .detail-panel, .details, .device-detail { background: var(--bento-bg); border-color: var(--bento-border); } .addon-list, .content-item { background: rgba(255,255,255,0.05); } .chart-container { background: var(--bento-bg); border-color: var(--bento-border); } pre, code { background: #1e293b !important; color: #e2e8f0 !important; } } /* === MOBILE FIX */ @media(max-width:768px){.tabs{flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch;gap:2px}.tab,.tab-button,.tab-btn{padding:6px 10px;font-size:12px;white-space:nowrap}.card,.card{padding:14px}.stats,.stats-grid,.summary-grid,.stat-cards,.kpi-grid,.metrics-grid{grid-template-columns:repeat(2,1fr);gap:8px}.stat-val,.kpi-val,.metric-val{font-size:18px}.stat-lbl,.kpi-lbl,.metric-lbl{font-size:10px}.panels,.board{flex-direction:column}.column{min-width:unset}h2{font-size:18px}h3{font-size:15px}}@media(max-width:480px){.tabs{gap:1px}.tab,.tab-button,.tab-btn{padding:5px 8px;font-size:11px}.stats,.stats-grid,.summary-grid,.stat-cards,.kpi-grid,.metrics-grid{grid-template-columns:1fr 1fr}.stat-val,.kpi-val,.metric-val{font-size:16px}}' +
    '/* BENTO TAB OVERRIDE */.tabs,.tab-bar,.tab-nav,.tab-header{display:flex!important;gap:4px!important;border-bottom:2px solid var(--bento-border,var(--divider-color,#334155))!important;padding:0 4px!important;margin-bottom:20px!important;overflow-x:auto!important;flex-wrap:nowrap!important}.tab,.tab-btn,.tab-button,.dtab{padding:10px 18px!important;border:none!important;background:transparent!important;cursor:pointer!important;font-size:13px!important;font-weight:500!important;font-family:Inter,sans-serif!important;color:var(--bento-text-secondary,var(--secondary-text-color,#94A3B8))!important;border-bottom:2px solid transparent!important;margin-bottom:-2px!important;transition:all .2s cubic-bezier(.4,0,.2,1)!important;white-space:nowrap!important;border-radius:0!important;flex:none!important}.tab:hover,.tab-btn:hover,.tab-button:hover,.dtab:hover{color:var(--bento-primary,#3B82F6)!important;background:rgba(59,130,246,.08)!important}.tab.active,.tab-btn.active,.tab-button.active,.dtab.active{color:var(--bento-primary,#3B82F6)!important;border-bottom-color:var(--bento-primary,#3B82F6)!important;background:rgba(59,130,246,.04)!important;font-weight:600!important}.stat-card,.stat-item,.metric-card,.kpi-card{background:var(--bento-card,var(--card-background-color,#1E293B))!important;border:1px solid var(--bento-border,var(--divider-color,#334155))!important;border-radius:var(--bento-radius-sm,10px)!important;padding:16px!important;text-align:center!important}' +
    '.chart-container { max-height: 300px; overflow: hidden; position: relative; } .chart-container canvas { max-height: 250px; width: 100%; } canvas { max-height: 300px; } ' +
    '.rb{padding:6px 14px;border:1.5px solid var(--bento-border);border-radius:var(--bento-radius-xs);background:var(--bento-card);color:var(--bento-text-secondary);font-size:12px;font-weight:500;font-family:Inter,sans-serif;cursor:pointer;transition:var(--btr);white-space:nowrap}' +
    '.rb:hover{background:var(--bento-primary);color:#fff;border-color:var(--bento-primary)}' +
    '.rb.scanning{opacity:.6;pointer-events:none}' +
    '</style>'; }
  _listTab() {
    const total = this.devices.length;
    const on = this.devices.filter(d => d.status === 'home' || d.status === 'zone').length;
    const aw = this.devices.filter(d => d.status === 'away').length;
    const off = this.devices.filter(d => d.status === 'offline' || d.status === 'unknown').length;
    const cats = [...new Set(this.devices.map(d => d.category))].sort();
    let h = '<div class="stats-bar">' +
      '<div class="stat-mini"><div class="sv">' + total + '</div><div class="sl">' + this._t('totalDevices') + '</div></div>' +
      '<div class="stat-mini so"><div class="sv">' + on + '</div><div class="sl">' + this._t('online') + '</div></div>' +
      '<div class="stat-mini sa"><div class="sv">' + aw + '</div><div class="sl">' + this._t('awayLabel') + '</div></div>' +
      '<div class="stat-mini sf"><div class="sv">' + off + '</div><div class="sl">' + this._t('offlineLabel') + '</div></div></div>';
    if (!this.devices.length) return h + '<div class="es">' + this._t('noDevicesFound') + '</div>';
    const catOpts = cats.map(c => '<option value="' + c + '"' + (this._catFilter === c ? ' selected' : '') + '>' + c + '</option>').join('');
    if (this.selectedDevice) h += this._detailHtml(this.selectedDevice);
    h += '<div class="toolbar"><input type="text" class="si" id="sI" placeholder="' + this._t('searchPlaceholder') + '" value="' + (this.searchQuery || '') + '">' +
      '<select class="fs" id="cF"><option value="all">' + this._t('allCategories') + '</option>' + catOpts + '</select></div>';
    if (!this._currentPage['l']) this._currentPage['l'] = 1;
    const ps = this._pageSize; const tp = Math.max(1, Math.ceil(this.filteredDevices.length / ps));
    const pg = Math.min(this._currentPage['l'], tp); this._currentPage['l'] = pg;
    const items = this.filteredDevices.slice((pg - 1) * ps, pg * ps);
    const sa = (c) => this.sortBy === c ? (this.sortDesc ? ' \u25BC' : ' \u25B2') : '';
    let rows = '';
    items.forEach((d, i) => {
      const ipD = d.ip || '\u2014'; const macD = d.mac || '\u2014';
      const sL = d.status === 'zone' ? d.rawState : this._t(d.status);
      const sc = d.status === 'home' ? 'sh' : d.status === 'away' ? 'sa2' : d.status === 'offline' ? 'so2' : d.status === 'zone' ? 'sz' : 'su';
      const mfg = d.manufacturer ? '<span class="ds">' + d.manufacturer + (d.model ? ' ' + d.model : '') + '</span>' : '';
      const lastSeenTime = d.last_seen || d.lastSeen || null;
      const lastSeenText = lastSeenTime ? new Date(lastSeenTime).toLocaleString() : '\u2014';
      // Enhanced status badge for offline devices showing last_seen
      let statusBadge = '<span class="sb ' + sc + '">' + sL + '</span>';
      if (d.status === 'offline' && lastSeenTime) {
        const lastSeenDate = new Date(lastSeenTime);
        statusBadge = '<span style="color:#94A3B8;font-weight:600">● Offline</span> <span style="font-size:10px;color:var(--bento-text-secondary)">(' + lastSeenDate.toLocaleString() + ')</span>';
      }
      rows += '<tr data-i="' + i + '"><td><span class="di">' + d.icon + '</span><span class="dn">' + d.name + '</span>' + mfg + '</td>' +
        '<td>' + d.category + '</td><td>' + statusBadge + '</td>' +
        '<td class="mn">' + ipD + '</td><td class="mn">' + macD + '</td><td>' + lastSeenText + '</td></tr>';
    });
    h += '<div class="tw"><table><thead><tr>' +
      '<th data-s="name">' + this._t('deviceName') + sa('name') + '</th>' +
      '<th data-s="category">' + this._t('category') + sa('category') + '</th>' +
      '<th data-s="status">' + this._t('status') + sa('status') + '</th>' +
      '<th data-s="ip">' + this._t('ipAddress') + sa('ip') + '</th>' +
      '<th>' + this._t('macAddress') + '</th>' +
      '<th>' + this._t('lastSeen') + '</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
    if (tp > 1) h += '<div class="pg"><button class="pb" data-p="' + (pg-1) + '"' + (pg<=1?' disabled':'') + '>\u2039 Prev</button>' +
      '<span class="pi2">' + pg + ' / ' + tp + ' (' + this.filteredDevices.length + ')</span>' +
      '<button class="pb" data-p="' + (pg+1) + '"' + (pg>=tp?' disabled':'') + '>Next \u203A</button></div>';
    return h;
  }
  _detailHtml(d) {
    const sL = d.status === 'zone' ? d.rawState : this._t(d.status);
    let rows = [[this._t('deviceDetail'), d.icon + ' ' + d.name], [this._t('categoryDetail'), d.category],
      [this._t('statusDetail'), sL], [this._t('ipDetail'), d.ip || '\u2014'], [this._t('macDetail'), d.mac || '\u2014']];
    if (d.manufacturer) rows.push([this._t('manufacturer'), d.manufacturer + (d.model ? ' ' + d.model : '')]);
    if (d.battery !== null) rows.push(['\u{1F50B} Battery', d.battery + '%']);
    if (d.ssid) rows.push(['\u{1F4F6} WiFi', d.ssid]);
    if (d.rssi) rows.push(['\u{1F4E1} Signal', d.rssi + ' dBm']);
    if (d.connType) rows.push([this._t('connection'), d.connType]);
    const lastSeenTime = d.last_seen || d.lastSeen;
    if (lastSeenTime) rows.push([this._t('lastSeenDetail'), new Date(lastSeenTime).toLocaleString()]);
    const rh = rows.map(r => '<div class="dr"><span class="dl">' + r[0] + '</span><span class="dv">' + r[1] + '</span></div>').join('');
    return '<div class="dd" id="dD"><button class="dc" id="cD">\u2715 Zamknij</button><div style="clear:both"></div>' + rh + '</div>';
  }
  _mapTab() {
    if (!this.devices.length) return '<div class="es">' + this._t('noDevicesFound') + '</div>';
    // Group devices by status
    const groups = { home: [], zone: [], away: [], offline: [], unknown: [] };
    this.devices.forEach(d => {
      const status = d.status || 'unknown';
      if (groups[status]) groups[status].push(d);
      else groups[status] = [d];
    });
    const statusOrder = ['home', 'zone', 'away', 'offline', 'unknown'];
    const cm = { home:'#10B981', zone:'#3B82F6', away:'#F59E0B', offline:'#EF4444', unknown:'#94A3B8' };
    let html = '<div class="tree-view">';
    statusOrder.forEach(status => {
      if (!groups[status] || !groups[status].length) return;
      const label = this._t(status);
      const color = cm[status];
      html += '<div class="tree-group"><div class="tree-group-header" style="border-left: 3px solid ' + color + '">' +
        '<span class="tree-toggle" data-status="' + status + '">▼</span>' +
        '<span class="tree-status-dot" style="background:' + color + '"></span>' +
        '<span class="tree-status-label">' + label + ' (' + groups[status].length + ')</span></div>' +
        '<div class="tree-group-items" data-status="' + status + '">';
      groups[status].forEach(d => {
        const ipD = d.ip || '—';
        const mfg = d.manufacturer ? ' • ' + d.manufacturer : '';
        html += '<div class="tree-item" data-device-id="' + d.id + '">' +
          '<span class="tree-item-icon">' + d.icon + '</span>' +
          '<span class="tree-item-name">' + d.name + '</span>' +
          '<span class="tree-item-ip">' + ipD + '</span>' +
          '<span class="tree-item-mfg">' + mfg + '</span></div>';
      });
      html += '</div></div>';
    });
    html += '</div><div id="mDD"></div>';
    return html;
  }
  _showMapDetail(d) {
    const el = this.shadowRoot.querySelector('#mDD'); if (!el) return;
    const sL = d.status === 'zone' ? d.rawState : this._t(d.status);
    let rows = [[this._t('deviceDetail'), d.icon + ' ' + d.name], [this._t('categoryDetail'), d.category],
      [this._t('statusDetail'), sL], [this._t('ipDetail'), d.ip || '\u2014'], [this._t('macDetail'), d.mac || '\u2014']];
    if (d.manufacturer) rows.push([this._t('manufacturer'), d.manufacturer + (d.model ? ' ' + d.model : '')]);
    if (d.battery !== null) rows.push(['\u{1F50B} Battery', d.battery + '%']);
    if (d.ssid) rows.push(['\u{1F4F6} WiFi', d.ssid]);
    if (d.connType) rows.push([this._t('connection'), d.connType]);
    const rh = rows.map(r => '<div class="dr"><span class="dl">' + r[0] + '</span><span class="dv">' + r[1] + '</span></div>').join('');
    el.innerHTML = '<div class="dd"><button class="dc" id="cMD">\u2715</button><div style="clear:both"></div>' + rh + '</div>';
    const cb = this.shadowRoot.querySelector('#cMD'); if (cb) { cb.setAttribute('aria-label', 'Close'); cb.addEventListener('click', () => { el.innerHTML = ''; }); }
  }
  _bindEvents() {
    this.shadowRoot.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => { this.activeTab = b.dataset.tab; this._doRender(); }));
    const rescanBtn = this.shadowRoot.querySelector('#rescanBtn');
    if (rescanBtn) rescanBtn.addEventListener('click', () => {
      rescanBtn.classList.add('scanning');
      rescanBtn.textContent = '\u23F3 ' + (this._lang === 'pl' ? 'Skanowanie...' : 'Scanning...');
      this._registryLoaded = false;
      this._loadDeviceRegistry().then(() => {
        this.updateDevices();
        this._lastScanTime = Date.now();
        this._doRender();
      });
    });
    const si = this.shadowRoot.querySelector('#sI');
    if (si) si.addEventListener('input', e => {
      this.searchQuery = e.target.value; this._currentPage['l'] = 1; this._filterSort(); this._doRender();
      setTimeout(() => { const inp = this.shadowRoot.querySelector('#sI'); if (inp) { inp.focus(); inp.selectionStart = inp.selectionEnd = inp.value.length; } }, 0);
    });
    const cf = this.shadowRoot.querySelector('#cF');
    if (cf) cf.addEventListener('change', e => { this._catFilter = e.target.value === 'all' ? null : e.target.value; this._currentPage['l'] = 1; this._filterSort(); this._doRender(); });
    this.shadowRoot.querySelectorAll('th[data-s]').forEach(h => h.addEventListener('click', () => {
      const s = h.dataset.s; if (this.sortBy === s) this.sortDesc = !this.sortDesc; else { this.sortBy = s; this.sortDesc = false; }
      this._filterSort(); this._doRender();
    }));
    this.shadowRoot.querySelectorAll('tbody tr[data-i]').forEach(r => r.addEventListener('click', () => {
      const ps = ((this._currentPage['l'] || 1) - 1) * this._pageSize;
      this.selectedDevice = this.filteredDevices[ps + parseInt(r.dataset.i)]; this._doRender();
    }));
    const cd = this.shadowRoot.querySelector('#cD');
    if (cd) cd.addEventListener('click', () => { this.selectedDevice = null; this._doRender(); });
    this.shadowRoot.querySelectorAll('.pb:not([disabled])').forEach(b => b.addEventListener('click', () => {
      const p = parseInt(b.dataset.p); if (p > 0) { this._currentPage['l'] = p; this._doRender(); }
    }));
    // Tree view events (map tab)
    this.shadowRoot.querySelectorAll('.tree-group-header').forEach(h => h.addEventListener('click', () => {
      const status = h.querySelector('.tree-toggle').dataset.status;
      const toggle = h.querySelector('.tree-toggle');
      const items = this.shadowRoot.querySelector('.tree-group-items[data-status="' + status + '"]');
      if (items) {
        items.classList.toggle('collapsed');
        toggle.classList.toggle('collapsed');
      }
    }));
    this.shadowRoot.querySelectorAll('.tree-item').forEach(item => item.addEventListener('click', e => {
      e.stopPropagation();
      const devId = item.dataset.deviceId;
      const dev = this.devices.find(d => d.id === devId);
      if (dev) this._showMapDetail(dev);
    }));
  }
  static getConfigElement() { return document.createElement('ha-network-map-editor'); }
  getCardSize() { return 8; }

  static getStubConfig() { return { type: 'custom:ha-network-map', title: 'Network Map', router_ip: '192.168.1.1', gateway_ip: '192.168.0.1' }; }

  disconnectedCallback() {
    // Cleanup any active event listeners or timers
  }
}
if (!customElements.get('ha-network-map')) customElements.define('ha-network-map', HaNetworkMap);
class HaNetworkMapEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
  }
  setConfig(config) {
    this._config = { ...config };
    this._render();
  }
  _dispatch() {
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: this._config }, bubbles: true, composed: true }));
  }
  _render() {
    if (!this._hass) return;
    this.shadowRoot.innerHTML = `
      <style>
            :host { display:block; padding:16px; }
            h3 { margin:0 0 16px; font-size:15px; font-weight:600; color:var(--bento-text, var(--primary-text-color,#1e293b)); }
            input { outline:none; transition:border-color .2s; }
            input:focus { border-color:var(--bento-primary, var(--primary-color,#3b82f6)); }
        </style>
      <h3>Network Map</h3>
            <div style="margin-bottom:12px;">
              <label style="display:block;font-weight:500;margin-bottom:4px;font-size:13px;">Title</label>
              <input type="text" id="cf_title" value="${this._config?.title || 'Network Map'}"
                style="width:100%;padding:8px 12px;border:1px solid var(--divider-color,#e2e8f0);border-radius:8px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#1e293b);font-size:14px;box-sizing:border-box;">
            </div>
            <div style="margin-bottom:12px;">
              <label style="display:block;font-weight:500;margin-bottom:4px;font-size:13px;">Router IP</label>
              <input type="text" id="cf_router_ip" value="${this._config?.router_ip || '192.168.1.1'}"
                style="width:100%;padding:8px 12px;border:1px solid var(--divider-color,#e2e8f0);border-radius:8px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#1e293b);font-size:14px;box-sizing:border-box;">
            </div>
    `;
        const f_title = this.shadowRoot.querySelector('#cf_title');
        if (f_title) f_title.addEventListener('input', (e) => {
          this._config = { ...this._config, title: e.target.value };
          this._dispatch();
        });
        const f_router_ip = this.shadowRoot.querySelector('#cf_router_ip');
        if (f_router_ip) f_router_ip.addEventListener('input', (e) => {
          this._config = { ...this._config, router_ip: e.target.value };
          this._dispatch();
        });
  }
  connectedCallback() { this._render(); }
}
if (!customElements.get('ha-network-map-editor')) { customElements.define('ha-network-map-editor', HaNetworkMapEditor); }

})();

window.customCards = window.customCards || [];
window.customCards.push({ type: 'ha-network-map', name: 'Network Map', description: 'Network device list and topology map' });
