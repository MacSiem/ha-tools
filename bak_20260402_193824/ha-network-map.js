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
        noDevicesFound: 'No devices found. Add device_tracker entities to Home Assistant.',
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
        noDevicesFound: 'Nie znaleziono urz\u0105dze\u0144. Dodaj encje device_tracker do Home Assistant.',
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
    const css = this._css();
    const content = this.activeTab === 'list' ? this._listTab() : this._mapTab();
    const scanInfo = this._lastScanTime ? '<span style="font-size:11px;color:var(--btxt2);margin-left:auto;">Last scan: ' + new Date(this._lastScanTime).toLocaleTimeString() + '</span>' : '';
    const html = css + '<div class="card"><div class="card-header" style="display:flex;align-items:center;gap:12px;">\u{1F4E1} ' + this.title + scanInfo + '<button class="rb" id="rescanBtn">\u{1F504} ' + (this._lang === 'pl' ? 'Skanuj' : 'Rescan') + '</button></div><div class="tabs">' +
      '<button class="tab-btn ' + (this.activeTab === 'list' ? 'active' : '') + '" data-tab="list">' + this._t('listTab') + '</button>' +
      '<button class="tab-btn ' + (this.activeTab === 'map' ? 'active' : '') + '" data-tab="map">' + this._t('mapTab') + '</button>' +
      '</div>' + content + '</div>';
    if (this._lastHtml === html) return;
    this._lastHtml = html;
    this.shadowRoot.innerHTML = html;
    this._bindEvents();
  }
  _css() { return '<style>' + (window.HAToolsBentoCSS || "") + '\n' +
    ':host{--bp:#3B82F6;--bpl:rgba(59,130,246,0.08);--bs:#10B981;--bsl:rgba(16,185,129,0.08);--be:#EF4444;--bel:rgba(239,68,68,0.08);--bw:#F59E0B;--bwl:rgba(245,158,11,0.08);' +
    '--bbg:var(--primary-background-color,#F8FAFC);--bcard:var(--card-background-color,#FFF);--bbrd:var(--divider-color,#E2E8F0);' +
    '--btxt:var(--primary-text-color,#1E293B);--btxt2:var(--secondary-text-color,#64748B);--btxtm:var(--disabled-text-color,#94A3B8);' +
    '--brxs:6px;--brsm:10px;--brmd:16px;--bshsm:0 1px 3px rgba(0,0,0,.04),0 1px 2px rgba(0,0,0,.06);--bshmd:0 4px 12px rgba(0,0,0,.05),0 2px 4px rgba(0,0,0,.04);' +
    '--btr:all .2s cubic-bezier(.4,0,.2,1);font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif}' +
    '.card{background:var(--bcard);border:1px solid var(--bbrd);border-radius:var(--brmd);box-shadow:var(--bshsm);padding:20px;color:var(--btxt);font-family:Inter,-apple-system,sans-serif}' +
    '.card-header{font-size:20px;font-weight:600;color:var(--btxt);margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--bbrd)}' +
    '.tabs{display:flex;gap:4px;border-bottom:2px solid var(--bbrd);margin-bottom:20px;overflow-x:auto}' +
    '.tab-btn{padding:10px 18px;border:none;background:transparent;cursor:pointer;font-size:13px;font-weight:500;font-family:Inter,sans-serif;' +
    'color:var(--btxt2);border-bottom:2px solid transparent;margin-bottom:-2px;transition:var(--btr);white-space:nowrap;border-radius:0}' +
    '.tab-btn:hover{color:var(--bp);background:var(--bpl)}.tab-btn.active{color:var(--bp);border-bottom-color:var(--bp);font-weight:600}' +
    '.stats-bar{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:16px}' +
    '.stat-mini{background:var(--bbg);border:1px solid var(--bbrd);border-radius:var(--brsm);padding:12px;text-align:center;transition:var(--btr)}' +
    '.stat-mini:hover{box-shadow:var(--bshmd);transform:translateY(-1px)}' +
    '.stat-mini .sv{font-size:24px;font-weight:700;color:var(--btxt);line-height:1.2}' +
    '.stat-mini .sl{font-size:11px;font-weight:500;color:var(--btxt2);text-transform:uppercase;letter-spacing:.5px;margin-top:2px}' +
    '.stat-mini.so .sv{color:var(--bs)}.stat-mini.sa .sv{color:var(--bw)}.stat-mini.sf .sv{color:var(--be)}' +
    '.toolbar{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center}' +
    '.si{flex:1;min-width:150px;padding:8px 12px;border:1.5px solid var(--bbrd);border-radius:var(--brxs);font-size:13px;font-family:Inter,sans-serif;background:var(--bcard);color:var(--btxt);outline:none;transition:var(--btr)}' +
    '.si:focus{border-color:var(--bp);box-shadow:0 0 0 3px rgba(59,130,246,.1)}.si::placeholder{color:var(--btxtm)}' +
    '.fs{padding:8px 12px;border:1.5px solid var(--bbrd);border-radius:var(--brxs);font-size:13px;font-family:Inter,sans-serif;background:var(--bcard);color:var(--btxt);outline:none;min-width:0}.fs:focus{border-color:var(--bp)}' +
    '.tw{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:0 -4px;padding:0 4px}' +
    'table{width:100%;border-collapse:separate;border-spacing:0;font-family:Inter,sans-serif;min-width:600px}' +
    'th{background:var(--bbg);color:var(--btxt2);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;padding:10px 12px;text-align:left;border-bottom:2px solid var(--bbrd);cursor:pointer;user-select:none;white-space:nowrap}' +
    'th:hover{color:var(--bp)}' +
    'td{padding:10px 12px;border-bottom:1px solid var(--bbrd);color:var(--btxt);font-size:13px;white-space:nowrap}' +
    'tr:hover td{background:var(--bpl)}tr:last-child td{border-bottom:none}tr{cursor:pointer}' +
    '.di{font-size:16px;margin-right:4px;vertical-align:middle}.dn{font-weight:500}' +
    '.ds{font-size:11px;color:var(--btxtm);display:block;margin-top:1px}' +
    '.sb{display:inline-block;padding:3px 8px;border-radius:12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.3px}' +
    '.sh{background:var(--bsl);color:var(--bs)}.sa2{background:var(--bwl);color:var(--bw)}.su{background:rgba(148,163,184,.12);color:var(--btxtm)}.so2{background:var(--bel);color:var(--be)}.sz{background:var(--bpl);color:var(--bp)}' +
    '.mn{font-family:"SF Mono","Cascadia Code",monospace;font-size:12px;color:var(--btxt2)}' +
    '.dd{background:var(--bbg);border:1px solid var(--bbrd);padding:16px;border-radius:var(--brsm);margin-top:12px;animation:bf .2s ease-out}' +
    '@keyframes bf{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}' +
    '.dr{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--bbrd);gap:8px}' +
    '.dr:last-child{border-bottom:none}.dl{color:var(--btxt2);font-size:12px;font-weight:500;white-space:nowrap}.dv{color:var(--btxt);font-size:12px;text-align:right;word-break:break-all}' +
    '.dc{float:right;background:none;border:1px solid var(--bbrd);border-radius:var(--brxs);padding:4px 10px;cursor:pointer;color:var(--btxt2);font-size:12px}' +
    '.dc:hover{background:var(--bel);color:var(--be)}' +
    '.pg{display:flex;justify-content:center;align-items:center;gap:8px;margin-top:16px;padding:12px 0;border-top:1px solid var(--bbrd);flex-wrap:wrap}' +
    '.pb{padding:6px 12px;border:1.5px solid var(--bbrd);background:var(--bcard);color:var(--btxt);border-radius:var(--brxs);cursor:pointer;font-size:12px;font-weight:500;font-family:Inter,sans-serif;transition:var(--btr)}' +
    '.pb:hover:not(:disabled){background:var(--bp);color:#fff;border-color:var(--bp)}.pb:disabled{opacity:.4;cursor:not-allowed}' +
    '.pi2{font-size:12px;color:var(--btxt2);font-weight:500}' +
    '.mc{background:var(--bbg);border:1px solid var(--bbrd);border-radius:var(--brsm);padding:16px;text-align:center;position:relative;overflow:hidden}' +
    '.mc canvas{max-width:100%;display:block;margin:0 auto;border-radius:var(--brxs)}' +
    '.ml{display:flex;gap:16px;justify-content:center;flex-wrap:wrap;margin-top:12px;font-size:12px;color:var(--btxt2)}' +
    '.li{display:flex;align-items:center;gap:4px}.ld{width:10px;height:10px;border-radius:50%;display:inline-block}' +
    '.es{text-align:center;padding:40px 16px;color:var(--btxt2);font-size:14px}' +
    '::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--bbrd);border-radius:3px}' +
    '@media(max-width:600px){.card{padding:12px}.stats-bar{grid-template-columns:repeat(2,1fr);gap:6px}.stat-mini{padding:8px}' +
    '.stat-mini .sv{font-size:20px}.toolbar{flex-direction:column}.si{width:100%}table{min-width:500px}td,th{padding:8px 6px;font-size:12px}}' +
    '/* === DARK MODE === */ @media (prefers-color-scheme: dark) { :host { --bento-bg: var(--primary-background-color, #1a1a2e); --bento-card: var(--card-background-color, #16213e); --bento-border: var(--divider-color, #2a2a4a); --bento-text: var(--primary-text-color, #e0e0e0); --bento-text-secondary: var(--secondary-text-color, #a0a0b0); --bento-text-muted: var(--disabled-text-color, #6a6a7a); --bento-shadow-sm: 0 1px 3px rgba(0,0,0,0.3); --bento-shadow-md: 0 4px 12px rgba(0,0,0,0.4); --bento-primary-light: rgba(59,130,246,0.15); --bento-success-light: rgba(16,185,129,0.15); --bento-error-light: rgba(239,68,68,0.15); --bento-warning-light: rgba(245,158,11,0.15); color-scheme: dark !important; } .card, .card, .main-card, .exporter-card, .security-card, .reports-card, .storage-card, .chore-card, .cry-card, .backup-card, .network-card, .sentence-card, .energy-card, .panel-card { background: var(--bento-card) !important; color: var(--bento-text) !important; border-color: var(--bento-border) !important; } input, select, textarea { background: var(--bento-bg); color: var(--bento-text); border-color: var(--bento-border); } .stat, .stat-card, .summary-card, .metric-card, .kpi-card, .health-card { background: var(--bento-bg); border-color: var(--bento-border); } .tab-content, .section { color: var(--bento-text); } table th { background: var(--bento-bg); color: var(--bento-text-secondary); border-color: var(--bento-border); } table td { color: var(--bento-text); border-color: var(--bento-border); } tr:hover td { background: rgba(59,130,246,0.08); } .empty-state, .no-data { color: var(--bento-text-secondary); } .schedule-section, .settings-section, .detail-panel, .details, .device-detail { background: var(--bento-bg); border-color: var(--bento-border); } .addon-list, .content-item { background: rgba(255,255,255,0.05); } .chart-container { background: var(--bento-bg); border-color: var(--bento-border); } pre, code { background: #1e293b !important; color: #e2e8f0 !important; } } /* === MOBILE FIX */ @media(max-width:768px){.tabs{flex-wrap:wrap;overflow-x:visible;gap:2px}.tab,.tab-button,.tab-btn{padding:6px 10px;font-size:12px;white-space:nowrap}.card,.card{padding:14px}.stats,.stats-grid,.summary-grid,.stat-cards,.kpi-grid,.metrics-grid{grid-template-columns:repeat(2,1fr);gap:8px}.stat-val,.kpi-val,.metric-val{font-size:18px}.stat-lbl,.kpi-lbl,.metric-lbl{font-size:10px}.panels,.board{flex-direction:column}.column{min-width:unset}h2{font-size:18px}h3{font-size:15px}}@media(max-width:480px){.tabs{gap:1px}.tab,.tab-button,.tab-btn{padding:5px 8px;font-size:11px}.stats,.stats-grid,.summary-grid,.stat-cards,.kpi-grid,.metrics-grid{grid-template-columns:1fr 1fr}.stat-val,.kpi-val,.metric-val{font-size:16px}}' +
    '/* BENTO TAB OVERRIDE */.tabs,.tab-bar,.tab-nav,.tab-header{display:flex!important;gap:4px!important;border-bottom:2px solid var(--bento-border,var(--divider-color,#334155))!important;padding:0 4px!important;margin-bottom:20px!important;overflow-x:auto!important;flex-wrap:nowrap!important}.tab,.tab-btn,.tab-button,.dtab{padding:10px 18px!important;border:none!important;background:transparent!important;cursor:pointer!important;font-size:13px!important;font-weight:500!important;font-family:Inter,sans-serif!important;color:var(--bento-text-secondary,var(--secondary-text-color,#94A3B8))!important;border-bottom:2px solid transparent!important;margin-bottom:-2px!important;transition:all .2s cubic-bezier(.4,0,.2,1)!important;white-space:nowrap!important;border-radius:0!important;flex:none!important}.tab:hover,.tab-btn:hover,.tab-button:hover,.dtab:hover{color:var(--bento-primary,#3B82F6)!important;background:rgba(59,130,246,.08)!important}.tab.active,.tab-btn.active,.tab-button.active,.dtab.active{color:var(--bento-primary,#3B82F6)!important;border-bottom-color:var(--bento-primary,#3B82F6)!important;background:rgba(59,130,246,.04)!important;font-weight:600!important}.stat-card,.stat-item,.metric-card,.kpi-card{background:var(--bento-card,var(--card-background-color,#1E293B))!important;border:1px solid var(--bento-border,var(--divider-color,#334155))!important;border-radius:var(--bento-radius-sm,10px)!important;padding:16px!important;text-align:center!important}' +
    '.chart-container { max-height: 300px; overflow: hidden; position: relative; } .chart-container canvas { max-height: 250px; width: 100%; } canvas { max-height: 300px; } ' +
    '.rb{padding:6px 14px;border:1.5px solid var(--bbrd);border-radius:var(--brxs);background:var(--bcard);color:var(--btxt2);font-size:12px;font-weight:500;font-family:Inter,sans-serif;cursor:pointer;transition:var(--btr);white-space:nowrap}' +
    '.rb:hover{background:var(--bp);color:#fff;border-color:var(--bp)}' +
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
        statusBadge = '<span style="color:#94A3B8;font-weight:600">● Offline</span> <span style="font-size:10px;color:var(--btxt2)">(' + lastSeenDate.toLocaleString() + ')</span>';
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
    return '<div class="mc"><canvas id="nC" width="800" height="800"></canvas>' +
      '<div class="ml">' +
      '<span class="li"><span class="ld" style="background:#10B981"></span> ' + this._t('home') + '</span>' +
      '<span class="li"><span class="ld" style="background:#3B82F6"></span> ' + this._t('zone') + '</span>' +
      '<span class="li"><span class="ld" style="background:#F59E0B"></span> ' + this._t('away') + '</span>' +
      '<span class="li"><span class="ld" style="background:#EF4444"></span> ' + this._t('offline') + '</span>' +
      '<span class="li"><span class="ld" style="background:#94A3B8"></span> ' + this._t('unknown') + '</span>' +
      '</div></div><div id="mDD"></div>';
  }
  _drawMap(canvas) {
    const ctr = canvas.parentElement;
    const cw = ctr ? ctr.clientWidth - 32 : 700;
    const sz = Math.min(cw, 700);
    canvas.width = sz; canvas.height = sz;
    canvas.style.width = sz + 'px'; canvas.style.height = sz + 'px';
    const ctx = canvas.getContext('2d');
    const hs = getComputedStyle(this);
    const bg = hs.getPropertyValue('--bbg').trim() || '#F8FAFC';
    const tc = hs.getPropertyValue('--btxt').trim() || '#1E293B';
    const tc2 = hs.getPropertyValue('--btxt2').trim() || '#64748B';
    ctx.clearRect(0, 0, sz, sz); ctx.fillStyle = bg; ctx.fillRect(0, 0, sz, sz);
    const cx = sz / 2; const gwY = 40; const rtY = cx * 0.35;
    const cm = { home:'#10B981', zone:'#3B82F6', away:'#F59E0B', offline:'#EF4444', unknown:'#94A3B8' };
    // Gateway
    ctx.fillStyle = '#6366F1'; ctx.beginPath(); ctx.arc(cx, gwY, 18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 9px Inter,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('GW', cx, gwY);
    ctx.fillStyle = tc; ctx.font = '11px Inter,sans-serif'; ctx.fillText(this.gatewayIp, cx, gwY + 28);
    // Gateway -> Router line
    ctx.strokeStyle = '#6366F1'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(cx, gwY + 18); ctx.lineTo(cx, rtY - 20); ctx.stroke(); ctx.setLineDash([]);
    // Router
    ctx.fillStyle = '#3B82F6'; ctx.beginPath(); ctx.arc(cx, rtY, 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px Inter,sans-serif'; ctx.fillText('Router', cx, rtY);
    ctx.fillStyle = tc; ctx.font = '11px Inter,sans-serif'; ctx.fillText(this.routerIp, cx, rtY + 32);
    // Device area — grouped by status
    const dStartY = rtY + 55; const dEndY = sz - 20;
    const uH = dEndY - dStartY; const uW = sz - 60;
    const statusOrder = ['home', 'zone', 'away', 'unknown', 'offline'];
    const statusLabels = { home: '\u{1F7E2} Online', zone: '\u{1F535} Zone', away: '\u{1F7E1} Away', unknown: '\u26AA Unknown', offline: '\u{1F534} Offline' };
    const groups = {};
    statusOrder.forEach(s => { groups[s] = this.devices.filter(d => d.status === s); });

    // Calculate layout: each group gets a horizontal band
    const activeGroups = statusOrder.filter(s => groups[s].length > 0);
    const bandH = Math.min(uH / Math.max(activeGroups.length, 1), 120);
    let bandY = dStartY;
    const maxPerRow = Math.min(Math.floor(uW / 80), 10);
    this._cDevs = [];

    activeGroups.forEach((status, gi) => {
      const devs = groups[status].slice(0, 20); // max 20 per group
      const clr = cm[status] || '#94A3B8';

      // Group label
      ctx.fillStyle = clr + '20';
      ctx.fillRect(15, bandY - 2, sz - 30, bandH - 4);
      ctx.fillStyle = clr;
      ctx.font = 'bold 10px Inter,sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(statusLabels[status] + ' (' + groups[status].length + ')', 22, bandY + 2);

      // Devices in this group
      const cols = Math.min(devs.length, maxPerRow);
      const rows = Math.ceil(devs.length / cols);
      const cellW = (uW - 10) / cols;
      const cellH = Math.min((bandH - 20) / rows, 50);

      devs.forEach((d, i) => {
        const col = i % cols; const row = Math.floor(i / cols);
        const x = 35 + col * cellW + cellW / 2;
        const y = bandY + 16 + row * cellH + cellH / 2;

        // Connection line to router
        ctx.strokeStyle = clr + '18'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx, rtY + 22); ctx.lineTo(x, y); ctx.stroke();

        // Device dot
        ctx.fillStyle = clr;
        ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = bg; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.stroke();

        // Category icon
        ctx.fillStyle = '#fff'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(d.icon, x, y);

        // Name + IP
        ctx.fillStyle = tc; ctx.font = '9px Inter,sans-serif'; ctx.textBaseline = 'top';
        const lb = d.name.length > 14 ? d.name.substring(0, 12) + '\u2026' : d.name;
        ctx.fillText(lb, x, y + 11);
        if (d.ip) { ctx.fillStyle = tc2; ctx.font = '8px monospace'; ctx.fillText(d.ip, x, y + 22); }

        this._cDevs.push({ d, x, y, r: 12 });
      });

      bandY += bandH;
    });

    if (this.devices.length > 100) {
      ctx.fillStyle = tc2; ctx.font = '11px Inter,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText('+' + (this.devices.length - 100) + (this._lang === 'pl' ? ' wi\u0119cej...' : ' more...'), cx, sz - 5);
    }
  }
  _mapClick(e) {
    const c = e.target; const r = c.getBoundingClientRect();
    const sx = c.width / r.width; const sy = c.height / r.height;
    const x = (e.clientX - r.left) * sx; const y = (e.clientY - r.top) * sy;
    if (!this._cDevs) return;
    for (const it of this._cDevs) {
      if (Math.sqrt((x - it.x) ** 2 + (y - it.y) ** 2) <= it.r + 5) { this._showMapDetail(it.d); return; }
    }
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
    const cb = this.shadowRoot.querySelector('#cMD'); if (cb) cb.addEventListener('click', () => { el.innerHTML = ''; });
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
    if (this.activeTab === 'map') {
      setTimeout(() => {
        const cv = this.shadowRoot.querySelector('#nC');
        if (cv) { this._drawMap(cv); cv.addEventListener('click', e => this._mapClick(e)); }
      }, 50);
    }
  }
  static getConfigElement() { return document.createElement('ha-network-map-editor'); }
  static getStubConfig() { return { type: 'custom:ha-network-map', title: 'Network Map', router_ip: '192.168.1.1', gateway_ip: '192.168.0.1' }; }
}
customElements.define('ha-network-map', HaNetworkMap);
window.customCards = window.customCards || [];
window.customCards.push({ type: 'ha-network-map', name: 'Network Map', description: 'Network device list and topology map' });

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
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; padding:16px; font-family:var(--paper-font-body1_-_font-family, 'Roboto', sans-serif); }
        h3 { margin:0 0 16px; font-size:16px; font-weight:600; color:var(--primary-text-color,#1e293b); }
        input { outline:none; transition:border-color .2s; }
        input:focus { border-color:var(--primary-color,#3b82f6); }
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
