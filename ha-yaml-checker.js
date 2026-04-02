/**
 * HA YAML Checker v3.0
 * Advanced YAML validator for Home Assistant configuration files.
 * Part of HA Tools Panel - Debug category
 * Author: Jeff (AI) for MacSiem
 *
 * v3.0 Features:
 *  - Tab 1: HA Config Check — trigger HA built-in validation
 *  - Tab 2: Entity Validator — scan automations for broken entity refs
 *  - Tab 3: File Scanner — status of key YAML files + HA system info
 *  - Tab 4: Paste & Validate — client-side YAML linting with HA-specific rules
 *  - Tab 5: Template Tester — test Jinja2 templates via HA template API
 *  - Tab 6: Common Issues — reference & gotchas
 */

class HAYamlChecker extends HTMLElement {
  constructor() {
    super();
    this._lang = (navigator.language || '').startsWith('pl') ? 'pl' : 'en';
    this.attachShadow({ mode: 'open' });
    this._hass = null;
    this._config = {};
    this._activeTab = 'config-check';
    this._checkResult = null;
    this._checkLoading = false;
    this._scanResult = null;
    this._scanLoading = false;
    this._pasteValue = '';
    this._pasteErrors = [];
    this._entityResult = null;
    this._entityLoading = false;
    this._templateValue = '{{ states("sun.sun") }}';
    this._templateResult = null;
    this._templateLoading = false;
    this._firstRender = false;
  }

  static get KEY_FILES() {
    return [
      { path: 'configuration.yaml', desc: 'G\u0142\u00F3wna konfiguracja HA', critical: true },
      { path: 'automations.yaml', desc: 'Automatyzacje', critical: true },
      { path: 'scripts.yaml', desc: 'Skrypty', critical: false },
      { path: 'scenes.yaml', desc: 'Sceny', critical: false },
      { path: 'utility_meter.yaml', desc: 'Liczniki', critical: false },
      { path: 'secrets.yaml', desc: 'Sekrety (wra\u017Cliwe dane)', critical: false },
      { path: 'packages/baby_all.yaml', desc: 'Baby Tracker', critical: false },
      { path: 'packages/energy_reports.yaml', desc: 'Energy Reports', critical: false },
      { path: 'packages/log_email.yaml', desc: 'Log Email', critical: false },
      { path: 'packages/cry_detection.yaml', desc: 'Cry Detection', critical: false },
      { path: 'packages/dishwasher.yaml', desc: 'Dishwasher', critical: false },
      { path: 'packages/domofon.yaml', desc: 'Domofon', critical: false },
      { path: 'packages/roborock.yaml', desc: 'Roborock', critical: false },
      { path: 'packages/power_calc.yaml', desc: 'Power Calc', critical: false },
    ];
  }

  static get DEPRECATED_PATTERNS() {
    return [
      { pattern: /^\s*initial:\s*(on|off)\s*$/i, msg: 'Deprecated: initial on/off \u2014 uzyj true/false (HA 2021.12+)', severity: 'warning' },
      { pattern: /data_template:/, msg: 'Deprecated: data_template: \u2014 uzyj data: z template (HA 2021.12+)', severity: 'warning' },
      { pattern: /^\s*entity_namespace:/, msg: 'Usuniety: entity_namespace (HA 2022.x)', severity: 'error' },
      { pattern: /^\s*hide_entity:/, msg: 'Deprecated: hide_entity \u2014 uzyj entity_registry (HA 2021.x+)', severity: 'warning' },
      { pattern: /^\s*white_value:/, msg: 'Deprecated: white_value \u2014 uzyj white w color_mode (HA 2021.4+)', severity: 'warning' },
      { pattern: /for:\s*\d+$/, msg: 'Deprecated: for: N (integer) \u2014 uzyj for: "HH:MM:SS" lub {seconds: N}', severity: 'warning' },
      { pattern: /value_template:/, msg: 'Info: value_template: \u2014 rozwaz migracje do template sensors (HA 2021.12+)', severity: 'info' },
      { pattern: /^\s*platform:\s+mqtt$/, msg: 'Deprecated: platform: mqtt \u2014 uzyj mqtt: w configuration.yaml (HA 2022.6+)', severity: 'warning' },
      { pattern: /service:\s+homeassistant\.turn/, msg: 'Info: homeassistant.turn_on/off \u2014 mozesz uzywac domain-specific service', severity: 'info' },
      { pattern: /^\s*condition:\s+template$/, msg: 'Info: condition: template \u2014 rozwaz shorthand template conditions (HA 2023.x+)', severity: 'info' },
      { pattern: /^\s*automation:\s*$/, msg: 'Deprecated: automation: \u2192 automations: (HA 2024.4+)', severity: 'warning' },
      { pattern: /^\s*script:\s*$/, msg: 'Deprecated: script: \u2192 scripts: (HA 2024.4+)', severity: 'warning' },
      { pattern: /^\s*trigger:\s*$/, msg: 'Deprecated: trigger: \u2192 triggers: in automations (HA 2024.4+)', severity: 'warning' },
      { pattern: /^\s*condition:\s*$/, msg: 'Deprecated: condition: \u2192 conditions: in automations (HA 2024.4+)', severity: 'warning' },
      { pattern: /^\s*action:\s*$/, msg: 'Deprecated: action: \u2192 actions: in automations (HA 2024.4+)', severity: 'warning' },
      { pattern: /^\s*platform:\s+time\s*$/, msg: 'Deprecated: platform: time \u2192 time_pattern trigger (HA 2024.x+)', severity: 'warning' },
      { pattern: /^\s*(below|above):\s+['"]/, msg: 'Numeric trigger: below/above jako string \u2014 u\u017Cyj warto\u015Bci numerycznej', severity: 'warning' },
      { pattern: /^\s*entity:\s+\w/, msg: 'Deprecated: entity: \u2192 entity_id: w triggers (HA 2024.x+)', severity: 'warning' },
      { pattern: /^\s*platform:\s+template\s*$/, msg: 'Old format: platform: template \u2192 template: (HA 2021.12+)', severity: 'info' },
      { pattern: /count\(\)/, msg: 'Deprecated: count() \u2192 u\u017Cyj | count filter w Jinja2', severity: 'info' },
    ];
  }
  static get SERVICE_MAPPINGS() {
    return {
      'persistent_notification.create': { replacement: 'notify.persistent_notification', version: '2024.x', severity: 'warning' },
      'persistent_notification.dismiss': { replacement: 'notify.persistent_notification (dismiss)', version: '2024.x', severity: 'warning' },
      'homeassistant.turn_on': { note: 'Generic \u2014 rozwa\u017C domain-specific: light.turn_on, switch.turn_on itp.', severity: 'info' },
      'homeassistant.turn_off': { note: 'Generic \u2014 rozwa\u017C domain-specific: light.turn_off, switch.turn_off itp.', severity: 'info' },
      'homeassistant.toggle': { note: 'Generic \u2014 rozwa\u017C domain-specific: light.toggle, switch.toggle itp.', severity: 'info' },
      'climate.set_temperature': { note: 'Upewnij si\u0119 \u017Ce entity_id to climate.*, nie sensor.*', severity: 'info' },
      'notify.notify': { note: 'Generic notify \u2014 lepiej u\u017Cy\u0107 konkretnego serwisu: notify.mobile_app_*', severity: 'info' },
    };
  }
  static get JINJA2_FUNCTIONS() {
    return {
      functions: [
        'states','state_attr','is_state','is_state_attr','has_value','expand','device_attr',
        'area_name','area_id','area_entities','integration_entities','device_entities','device_id',
        'config_entry_id','utcnow','now','as_timestamp','as_datetime','as_timedelta','as_local',
        'strptime','relative_time','timedelta','today_at','max','min','log','sin','cos','tan',
        'sqrt','e','pi','float','int','iif','bool','set','list','dict','namespace','zip',
        'distance','closest','type_debug','slugify','urlencode',
      ],
      filters: [
        'float','int','round','abs','string','bool','list','set','timestamp_custom',
        'timestamp_local','timestamp_utc','as_timestamp','as_datetime','regex_match',
        'regex_replace','regex_findall','regex_findall_index','regex_search','slugify',
        'urlencode','lower','upper','title','capitalize','trim','replace','default',
        'first','last','length','count','sort','unique','join','map','select','reject',
        'selectattr','rejectattr','groupby','min','max','sum','average','median','log',
        'from_json','to_json','is_defined','is_number','has_value','contains',
        'base64_encode','base64_decode','ordinal','bitwise_and','bitwise_or','pack','unpack',
      ],
    };
  }
  static get DEVICE_CLASSES() {
    return {
      sensor: [
        'apparent_power','aqi','atmospheric_pressure','battery','carbon_dioxide','carbon_monoxide',
        'current','data_rate','data_size','date','distance','duration','energy','energy_storage',
        'enum','frequency','gas','humidity','illuminance','irradiance','moisture','monetary',
        'nitrogen_dioxide','nitrogen_monoxide','nitrous_oxide','ozone','ph','pm1','pm10','pm25',
        'power','power_factor','precipitation','precipitation_intensity','pressure','reactive_power',
        'signal_strength','sound_pressure','speed','sulphur_dioxide','temperature',
        'volatile_organic_compounds','volatile_organic_compounds_parts','voltage','volume',
        'volume_flow_rate','volume_storage','water','weight','wind_speed',
      ],
      binary_sensor: [
        'battery','battery_charging','carbon_monoxide','cold','connectivity','door','garage_door',
        'gas','heat','light','lock','moisture','motion','moving','occupancy','opening','plug',
        'power','presence','problem','running','safety','smoke','sound','tamper','update',
        'vibration','window',
      ],
      state_class: ['measurement','total','total_increasing'],
    };
  }
  static get COMMON_ISSUES() {
    return [
      {
        cat: 'Indentacja',
        items: [
          { title: 'Mieszanie spacji i tab\u00F3w', desc: 'YAML wymaga spacji \u2014 taby s\u0105 niedozwolone. U\u017Cyj 2 lub 4 spacji konsekwentnie w ca\u0142ym pliku.', severity: 'error' },
          { title: 'Z\u0142a g\u0142\u0119boko\u015B\u0107 indentacji', desc: 'Elementy listy (- ) musz\u0105 by\u0107 na tym samym poziomie. Klucze podrz\u0119dne musz\u0105 mie\u0107 wi\u0119ksze wci\u0119cie ni\u017C rodzic.', severity: 'warning' },
        ]
      },
      {
        cat: 'Ci\u0105gi tekstowe',
        items: [
          { title: 'Brak cudzys\u0142ow\u00F3w przy specjalnych znakach', desc: 'Je\u015Bli warto\u015B\u0107 zawiera : # & * ? | < > = ! zawij j\u0105 w cudzys\u0142owy. Np. name: "Sensor: Main"', severity: 'warning' },
          { title: 'Szablony z cudzys\u0142owami', desc: 'Szablony Jinja2 z apostrofami wewn\u0105trz: u\u017Cyj wewn\u0119trznych ", lub odwrotnie. Np. "{{ states(\'sensor.temp\') }}"', severity: 'warning' },
          { title: 'Wieloliniowy tekst', desc: 'Dla d\u0142ugich string\u00F3w u\u017Cyj | (literalny) lub > (sk\u0142adany).\nmessage: |\n  Linia 1\n  Linia 2', severity: 'info' },
        ]
      },
      {
        cat: 'Automatyzacje',
        items: [
          { title: 'Brak pola alias', desc: 'Ka\u017Cda automatyzacja powinna mie\u0107 unikalny alias \u2014 u\u0142atwia debugowanie w Trace Viewer.', severity: 'warning' },
          { title: 'Brak pola mode', desc: 'Domy\u015Blny mode to "single" \u2014 dodaj explicit dla jasno\u015Bci. Opcje: single, parallel, queued, restart.', severity: 'info' },
          { title: 'Duplikacja ID', desc: 'Ka\u017Cde id: musi by\u0107 unikalne w automations.yaml. Duplikaty powoduj\u0105 nadpisanie automatyzacji.', severity: 'error' },
        ]
      },
      {
        cat: 'Pakiety (packages)',
        items: [
          { title: 'Konflikty kluczy mi\u0119dzy plikami', desc: 'Pakiety s\u0105 merge\'owane. Je\u015Bli dwa pakiety definiuj\u0105 ten sam klucz, m\u0142odszy nadpisze starszy.', severity: 'warning' },
          { title: 'Brak namespace', desc: 'U\u017Cyj prefiksu np. input_boolean.baby_ a nie input_boolean bez prefiksu.', severity: 'info' },
        ]
      },
      {
        cat: 'Deprecated / Stara skladnia',
        items: [
          { title: 'data_template:', desc: 'Od HA 2021.12: uzyj data: z Jinja2 zamiast data_template:', severity: 'warning' },
          { title: 'trigger/condition/action (lp)', desc: 'Od HA 2024.4: uzyj triggers:/conditions:/actions: (l. mnoga)', severity: 'info' },
          { title: 'initial: on/off', desc: 'Uzyj true/false zamiast on/off', severity: 'warning' },
          { title: 'entity_namespace', desc: 'Usuniety z HA 2022.x', severity: 'error' },
        ]
      },
      {
        cat: 'Encje i szablony',
        items: [
          { title: 'Referencja do nieistniej\u0105cej encji', desc: 'entity_id wskazuj\u0105ce na nieistn. encj\u0119 nie powoduj\u0105 b\u0142\u0119du YAML, ale automatyzacja nie zadzia\u0142a. Sprawd\u017A nazwy w Dev Tools \u203A States.', severity: 'warning' },
          { title: 'Zawi\u0105zane zale\u017Cno\u015Bci w szablonach', desc: 'Szablon kt\u00F3ry odwo\u0142uje si\u0119 do encji kt\u00F3ra nie istnieje zwr\u00F3ci "unknown". Testuj szablony w Dev Tools \u203A Template.', severity: 'info' },
        ]
      },
    ];
  }

  set hass(hass) {

    if (hass?.language) this._lang = hass.language.startsWith('pl') ? 'pl' : 'en';    this._hass = hass;
    if (!hass) return;
    if (!this._firstRender) {
      this._firstRender = true;
      this._render();
    }
  }

  setConfig(config) {
    this._config = config || {};
  }

  getCardSize() { return 8; }

  _sanitize(s) { try { return decodeURIComponent(escape(s)); } catch(e) { return s; } }

  // ── HA Config Check ──────────────────────────────────────────────────────
  async _runConfigCheck() {
    if (this._checkLoading) return;
    this._checkLoading = true;
    this._checkResult = null;
    this._updateTab('config-check');

    try {
      const result = await this._hass.callApi('POST', 'config/core/check_config');
      // HA API returns errors/warnings as string or null, not array
      const rawErrors = result.errors;
      const rawWarnings = result.warnings;
      const parseMessages = (raw) => {
        if (!raw) return [];
        if (Array.isArray(raw)) return raw.map(e => typeof e === 'string' ? { message: e } : e);
        if (typeof raw === 'string') {
          // Split multi-line error string into individual messages
          return raw.split('\n').filter(l => l.trim()).map(line => {
            // Try to extract component and details
            const match = line.match(/^(?:Invalid config for \[(\w+)\]:?\s*)?(.+)/i);
            return { message: line, component: match ? match[1] : null, detail: match ? match[2] : line };
          });
        }
        return [{ message: JSON.stringify(raw) }];
      };
      this._checkResult = {
        ok: result.result === 'valid',
        errors: parseMessages(rawErrors),
        warnings: parseMessages(rawWarnings),
        raw: result,
        ts: new Date().toLocaleTimeString('pl-PL'),
      };
    } catch (e) {
      try {
        await this._hass.callService('homeassistant', 'check_config', {});
        this._checkResult = {
          ok: true,
          errors: [],
          warnings: [],
          ts: new Date().toLocaleTimeString('pl-PL'),
          note: 'Sprawdzenie przez service (bez szczeg\u00F3\u0142\u00F3w b\u0142\u0119d\u00F3w)',
        };
      } catch (e2) {
        this._checkResult = {
          ok: false,
          errors: [{ message: e.message || String(e) }],
          warnings: [],
          ts: new Date().toLocaleTimeString('pl-PL'),
          apiError: true,
        };
      }
    }
    this._checkLoading = false;
    this._updateTab('config-check');
  }

  // ── Entity Validator ─────────────────────────────────────────────────────
  async _runEntityValidation() {
    if (this._entityLoading) return;
    this._entityLoading = true;
    this._entityResult = null;
    this._updateTab('entity-validator');

    try {
      // Fetch all states (all entity IDs)
      const states = this._hass.states;
      const allEntityIds = new Set(Object.keys(states));

      // Fetch automations via REST
      let automations = [];
      try {
        automations = await this._hass.callApi('GET', 'config/automation/config');
        if (!Array.isArray(automations)) automations = [];
      } catch (e) {
        // Fallback: filter states for automation.*
        automations = Object.values(states)
          .filter(s => s.entity_id.startsWith('automation.'))
          .map(s => ({ id: s.entity_id, alias: s.attributes.friendly_name || s.entity_id }));
      }

      // Fetch scripts
      let scripts = [];
      try {
        scripts = await this._hass.callApi('GET', 'config/script/config');
        if (typeof scripts === 'object' && !Array.isArray(scripts)) {
          scripts = Object.entries(scripts).map(([id, cfg]) => ({ id, ...cfg }));
        }
      } catch (e) { /* ok */ }

      // Count domain stats
      const domainCounts = {};
      for (const id of allEntityIds) {
        const domain = id.split('.')[0];
        domainCounts[domain] = (domainCounts[domain] || 0) + 1;
      }

      // Find broken entity refs in automation triggers/conditions/actions
      const broken = [];
      const checked = [];
      const dupIds = [];

      const seenIds = {};
      for (const auto of automations) {
        // Check duplicate automation IDs
        const autoId = auto.id || auto.entity_id || '';
        if (autoId && seenIds[autoId]) {
          dupIds.push({ id: autoId, alias: auto.alias || autoId });
        } else if (autoId) {
          seenIds[autoId] = true;
        }

        // Extract entity refs from automation
        const text = JSON.stringify(auto);
        const entityMatches = text.match(/[a-z_]+\.[a-z0-9_]+/g) || [];
        const DOMAINS = ['light','switch','sensor','binary_sensor','input_boolean','input_number',
          'input_select','input_datetime','input_text','automation','script','scene','person',
          'device_tracker','media_player','climate','cover','fan','vacuum','camera','lock',
          'alarm_control_panel','weather','sun','zone','group','counter','timer','number',
          'select','button','text','event'];

        for (const ref of new Set(entityMatches)) {
          const domain = ref.split('.')[0];
          if (!DOMAINS.includes(domain)) continue;
          if (ref.includes('{{') || ref.includes('}}')) continue;
          if (!allEntityIds.has(ref)) {
            broken.push({
              entity: ref,
              in: auto.alias || auto.id || 'automation',
              type: 'automation',
            });
          } else {
            checked.push(ref);
          }
        }
      }

      // Check input_boolean, input_number, etc. references in scripts
      for (const scr of scripts) {
        const text = JSON.stringify(scr);
        const entityMatches = text.match(/[a-z_]+\.[a-z0-9_]+/g) || [];
        const DOMAINS = ['light','switch','sensor','binary_sensor','input_boolean','input_number','input_select'];
        for (const ref of new Set(entityMatches)) {
          const domain = ref.split('.')[0];
          if (!DOMAINS.includes(domain)) continue;
          if (!allEntityIds.has(ref)) {
            broken.push({
              entity: ref,
              in: scr.alias || scr.id || 'script',
              type: 'script',
            });
          }
        }
      }

      // Deduplicate broken
      const brokenMap = {};
      for (const b of broken) {
        const key = b.entity + '|' + b.in;
        if (!brokenMap[key]) brokenMap[key] = b;
      }
      const brokenUniq = Object.values(brokenMap);

      // FUNC-1: Check unavailable/unknown entities
      const problemStates = Object.entries(this._hass.states)
        .filter(([id, s]) => ['unavailable', 'unknown'].includes(s.state))
        .map(([id, s]) => ({ entity: id, state: s.state, name: s.attributes?.friendly_name || id }));

      // FUNC-1: Check entities without friendly_name
      const noFriendlyName = Object.entries(this._hass.states)
        .filter(([id, s]) => !s.attributes?.friendly_name)
        .map(([id]) => id)
        .slice(0, 50);

      // FUNC-1: Check automations without description
      const autoNoDesc = automations
        .filter(a => !a.description)
        .map(a => ({ id: a.id || a.entity_id || '?', alias: a.alias || '(brak alias)' }));

      // Enhanced: Check for scripts referenced in automations
      const scriptRefs = [];
      automations.forEach((auto) => {
        const autoStr = JSON.stringify(auto);
        const scripts_used = new Set();
        const scriptMatches = autoStr.match(/"service"\s*:\s*"script\.([a-z0-9_]+)"/gi) || [];
        scriptMatches.forEach(call => {
          const scriptId = call.match(/script\.([a-z0-9_]+)/i)[1];
          const scriptEntity = `script.${scriptId}`;
          if (!allEntityIds.has(scriptEntity) && !scripts_used.has(scriptId)) {
            scriptRefs.push({ auto: auto.alias || auto.id || '?', script: scriptEntity });
            scripts_used.add(scriptId);
          }
        });
      });

      // Enhanced: Check for scene references
      const sceneRefs = [];
      automations.forEach((auto) => {
        const autoStr = JSON.stringify(auto);
        const sceneMatches = autoStr.match(/"scene"\s*:\s*"([^"]+)"/gi) || [];
        sceneMatches.forEach(call => {
          const sceneId = call.match(/"([^"]+)"/)[1];
          if (sceneId.startsWith('scene.') && !allEntityIds.has(sceneId)) {
            sceneRefs.push({ auto: auto.alias || auto.id || '?', scene: sceneId });
          }
        });
      });

      // Enhanced: Check for input helper references
      const inputRefs = [];
      const inputTypes = ['input_boolean', 'input_number', 'input_select', 'input_text', 'input_datetime'];
      automations.forEach((auto) => {
        const autoStr = JSON.stringify(auto);
        inputTypes.forEach(inputType => {
          const regex = new RegExp(`"${inputType}\\.([a-z0-9_]+)"`, 'gi');
          let match;
          while ((match = regex.exec(autoStr)) !== null) {
            const fullId = `${inputType}.${match[1]}`;
            if (!allEntityIds.has(fullId)) {
              inputRefs.push({ auto: auto.alias || auto.id || '?', helper: fullId });
            }
          }
        });
      });

      this._entityResult = {
        totalEntities: allEntityIds.size,
        totalAutomations: automations.length,
        totalScripts: scripts.length,
        domainCounts,
        broken: brokenUniq,
        dupIds,
        problemStates,
        noFriendlyName,
        autoNoDesc,
        scriptRefs,
        sceneRefs,
        inputRefs,
        checkedCount: new Set(checked).size,
        ts: new Date().toLocaleTimeString('pl-PL'),
      };
    } catch (e) {
      this._entityResult = { error: e.message || String(e), ts: new Date().toLocaleTimeString('pl-PL') };
    }

    this._entityLoading = false;
    this._updateTab('entity-validator');
  }

  // ── File Scanner ─────────────────────────────────────────────────────────
  async _runFileScan() {
    if (this._scanLoading) return;
    this._scanLoading = true;
    this._scanResult = { files: [], ts: null };
    this._updateTab('file-scanner');

    try {
      const configInfo = await this._hass.callApi('GET', 'config');
      const entityReg = await this._hass.callApi('GET', 'config/entity_registry/list');
      const deviceReg = await this._hass.callApi('GET', 'config/device_registry/list');
      const areaReg = await this._hass.callApi('GET', 'config/area_registry/list');
      const haVersion = configInfo.version || '?';
      const entityCount = Array.isArray(entityReg) ? entityReg.length : '?';
      const deviceCount = Array.isArray(deviceReg) ? deviceReg.length : '?';
      const areaCount = Array.isArray(areaReg) ? areaReg.length : '?';

      // Try to get log tail for errors
      let logErrors = 0;
      let logWarnings = 0;
      try {
        const logs = await this._hass.callApi('GET', 'error_log');
        if (typeof logs === 'string') {
          logErrors = (logs.match(/ERROR/g) || []).length;
          logWarnings = (logs.match(/WARNING/g) || []).length;
        }
      } catch(e) { /* no log access */ }

      // Check uptime via recorder / system health
      let uptime = null;
      try {
        const sysHealth = await this._hass.callApi('GET', 'system_health');
        if (sysHealth && sysHealth.homeassistant && sysHealth.homeassistant.info) {
          uptime = sysHealth.homeassistant.info.run_as_root !== undefined
            ? null
            : sysHealth.homeassistant.info;
        }
      } catch(e) { /* no system_health */ }

      this._scanResult = {
        haVersion,
        entityCount,
        deviceCount,
        areaCount,
        logErrors,
        logWarnings,
        configDir: configInfo.config_dir || '?',
        components: configInfo.components ? configInfo.components.length : '?',
        unit: configInfo.unit_system ? configInfo.unit_system.length_unit || 'km' : '?',
        ts: new Date().toLocaleTimeString('pl-PL'),
        files: HAYamlChecker.KEY_FILES.map(f => ({ ...f, status: 'unknown' })),
      };
    } catch (e) {
      this._scanResult = {
        files: HAYamlChecker.KEY_FILES.map(f => ({ ...f, status: 'unknown' })),
        ts: new Date().toLocaleTimeString('pl-PL'),
        error: e.message,
      };
    }

    this._scanLoading = false;
    this._updateTab('file-scanner');
  }

  // ── Template Tester ──────────────────────────────────────────────────────
  async _runTemplateTester() {
    const template = this._templateValue;
    if (!template.trim()) return;
    if (this._templateLoading) return;
    this._templateLoading = true;
    this._templateResult = null;
    this._updateTab('template-tester');

    try {
      const result = await this._hass.callApi('POST', 'template', { template });
      this._templateResult = { ok: true, value: result, ts: new Date().toLocaleTimeString('pl-PL') };
    } catch (e) {
      this._templateResult = { ok: false, error: e.message || String(e), ts: new Date().toLocaleTimeString('pl-PL') };
    }

    this._templateLoading = false;
    this._updateTab('template-tester');
  }

  // ── Paste & Validate ─────────────────────────────────────────────────────
  _validateYAML(text) {
    const errors = [];
    const warnings = [];
    const lines = text.split('\n');

    lines.forEach((line, i) => {
      if (/^\t/.test(line)) {
        errors.push({ line: i + 1, msg: 'Tab zamiast spacji — YAML nie obs\u0142uguje tab\u00F3w do wci\u0119cia', severity: 'error' });
      }
    });

    // Check duplicate root keys
    const rootKeys = {};
    lines.forEach((line, i) => {
      const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:/);
      if (match) {
        const key = match[1];
        if (rootKeys[key] !== undefined) {
          warnings.push({ line: i + 1, msg: `Duplikat klucza na poziomie g\u0142\u00F3wnym: "${key}" (pierwszy: linia ${rootKeys[key] + 1})`, severity: 'warning' });
        } else {
          rootKeys[key] = i;
        }
      }
    });

    // Check unquoted colons in values
    lines.forEach((line, i) => {
      if (line.trim().startsWith('#')) return;
      const valueMatch = line.match(/^[\s-]*[a-zA-Z_][^:]*:\s+(.+)$/);
      if (valueMatch) {
        const val = valueMatch[1].trim();
        if (!val.startsWith('"') && !val.startsWith("'") && !val.startsWith('{') && !val.startsWith('[') && !val.startsWith('|') && !val.startsWith('>')) {
          if (/[^{]:/.test(val)) {
            warnings.push({ line: i + 1, msg: `Mo\u017Cliwy problem: warto\u015B\u0107 zawiera ":" bez cudzys\u0142ow\u00F3w: ${val.substring(0, 60)}`, severity: 'warning' });
          }
        }
      }
    });

    // Check HA automations specific: missing alias
    const hasAutomation = lines.some(l => /^- (id:|alias:)/.test(l.trim()));
    if (hasAutomation) {
      let inBlock = false;
      let hasAlias = false;
      let blockStart = -1;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('- id:') || line.startsWith('- alias:')) {
          if (inBlock && !hasAlias) {
            warnings.push({ line: blockStart + 1, msg: 'Automatyzacja bez pola alias \u2014 dodaj alias dla lepszego debugowania', severity: 'warning' });
          }
          inBlock = true;
          hasAlias = line.startsWith('- alias:');
          blockStart = i;
        } else if (inBlock) {
          if (line.startsWith('alias:')) hasAlias = true;
          if (line.startsWith('- ') && !line.startsWith('- id:') && !line.startsWith('- alias:') && !line.startsWith('- trigger') && !line.startsWith('- condition') && !line.startsWith('- action')) {
            // Might be start of another automation
          }
        }
      }
    }

    // Check Jinja2 template syntax (basic)
    lines.forEach((line, i) => {
      const templateMatches = line.match(/\{\{[^}]*\}\}/g) || [];
      for (const tmpl of templateMatches) {
        if ((tmpl.match(/\{\{/g) || []).length !== (tmpl.match(/\}\}/g) || []).length) {
          errors.push({ line: i + 1, msg: `Niezamkni\u0119ty szablon Jinja2: ${tmpl.substring(0, 50)}`, severity: 'error' });
        }
      }
    });

    // ── Check for include directives ──────────────────────────────────
    const includePattern = /(!include(?:_dir)?(?:_merge_)?(?:named|list)?\s+)([^\s#]+)/;
    lines.forEach((line, i) => {
      const match = line.match(includePattern);
      if (match) {
        warnings.push({
          line: i + 1,
          msg: `Include: ${match[1].trim()} referenced file "${match[2]}" — verify path relative to config/`,
          severity: 'info'
        });
      }
    });

    // Check for common HA mistakes: trigger: instead of triggers:
    lines.forEach((line, i) => {
      const t = line.trim();
      if (t === 'trigger:') warnings.push({ line: i + 1, msg: 'HA 2024.4+: u\u017Cyj "triggers:" zamiast "trigger:" (starszy format)', severity: 'info' });
      if (t === 'condition:') warnings.push({ line: i + 1, msg: 'HA 2024.4+: u\u017Cyj "conditions:" zamiast "condition:" (starszy format)', severity: 'info' });
      if (t === 'action:') warnings.push({ line: i + 1, msg: 'HA 2024.4+: u\u017Cyj "actions:" zamiast "action:" (starszy format)', severity: 'info' });
    });

    // Deprecated syntax (F4)
    if (typeof HAYamlChecker !== 'undefined' && HAYamlChecker.DEPRECATED_PATTERNS) {
      HAYamlChecker.DEPRECATED_PATTERNS.forEach(dp => {
        lines.forEach((line, i) => {
          if (line.trim().startsWith('#')) return;
          if (dp.pattern.test(line)) {
            warnings.push({ line: i + 1, msg: dp.msg, severity: dp.severity });
          }
        });
      });
    }
    // Best practice lint (F3)
    lines.forEach((line, i) => {
      const t = line.trim();
      if (/entity_id:\s*\w+\.\w*[A-Z]/.test(t)) warnings.push({ line: i + 1, msg: 'Konwencja: entity_id lowercase_snake_case', severity: 'info' });
      if (t === 'mode: single') warnings.push({ line: i + 1, msg: '"mode: single" jest domyslny \u2014 mozna pominac', severity: 'info' });
         if (/delay:\s*['"]\d+['"]/.test(t)) warnings.push({ line: i + 1, msg: 'Best practice: delay z seconds/milliseconds (np. delay: {seconds: 5})', severity: 'info' });
         if (/secret|password|api_key|token/i.test(t) && !/!secret/.test(t) && !t.trim().startsWith('#')) warnings.push({ line: i + 1, msg: 'Security: potencjalny sekret bez !secret — uzyj secrets.yaml', severity: 'warning' });
    });

    // ── Check for deprecated/renamed services ──────────────────────────────
    const servicePattern = /service:\s*["']?([a-z_]+\.[a-z_]+)["']?/i;
    lines.forEach((line, i) => {
      if (line.trim().startsWith('#')) return;
      const match = line.match(servicePattern);
      if (match) {
        const service = match[1].toLowerCase();
        const mapping = HAYamlChecker.SERVICE_MAPPINGS?.[service];
        if (mapping) {
          if (mapping.replacement) {
            warnings.push({ line: i + 1, msg: 'Service renamed: ' + service + ' \u2192 ' + mapping.replacement + ' (HA ' + mapping.version + ')', severity: mapping.severity || 'warning' });
          } else if (mapping.note) {
            warnings.push({ line: i + 1, msg: mapping.note, severity: mapping.severity || 'info' });
          }
        }
      }
      if (/brightness:\s*(\d+)/.test(line)) {
        const bm = line.match(/brightness:\s*(\d+)/);
        if (bm && parseInt(bm[1]) > 100) {
          warnings.push({ line: i + 1, msg: 'brightness: ' + bm[1] + ' (0-255) \u2014 rozwa\u017C brightness_pct: 0-100', severity: 'info' });
        }
      }
    });

    // ── Check Jinja2 functions and filters ────────────────────────────────
    const j2f = HAYamlChecker.JINJA2_FUNCTIONS;
    if (j2f) {
      const allFuncs = new Set(j2f.functions);
      const allFilters = new Set(j2f.filters);
      const builtinJinja = new Set(['range','loop','caller','cycler','joiner','undefined','true','false','none','lipsum']);
      lines.forEach((line, i) => {
        if (line.trim().startsWith('#')) return;
        const tplBlocks = line.match(/\{\{[^}]*\}\}/g) || [];
        for (const block of tplBlocks) {
          if (/states\.[a-z_]+\.[a-z0-9_]+/.test(block)) {
            warnings.push({ line: i + 1, msg: 'Stary zapis: states.domain.entity \u2192 u\u017Cyj states("domain.entity")', severity: 'warning' });
          }
          const unquotedArgs = block.match(/(?:states|is_state|state_attr|has_value)\(\s*([a-z_]+\.[a-z0-9_]+)\s*[,)]/g);
          if (unquotedArgs) {
            for (const ua of unquotedArgs) {
              if (!/['"]/.test(ua)) {
                warnings.push({ line: i + 1, msg: 'Brak cudzys\u0142ow\u00F3w w argumencie: ' + ua.trim(), severity: 'warning' });
              }
            }
          }
          const funcCalls = block.match(/([a-z_]\w*)\s*\(/g) || [];
          for (const fc of funcCalls) {
            const name = fc.replace(/\s*\($/, '');
            if (!allFuncs.has(name) && !builtinJinja.has(name) && !allFilters.has(name)) {
              if (/^[a-z_]{2,}$/.test(name) && !['not','and','or','in','is','if','else','elif','for','set','end','macro','block','extends','include','import','from','as','with','without'].includes(name)) {
                warnings.push({ line: i + 1, msg: 'Nieznana funkcja szablonu: "' + name + '"', severity: 'warning' });
              }
            }
          }
        }
        const filterMatches = line.match(/\|\s*([a-z_]\w*)/g) || [];
        for (const fm of filterMatches) {
          const filterName = fm.replace(/^\|\s*/, '');
          if (filterName && !allFilters.has(filterName) && !allFuncs.has(filterName) && !builtinJinja.has(filterName)) {
            if (/^[a-z_]{2,}$/.test(filterName) && !['not','and','or','in','is','if','else','elif','for','set','end'].includes(filterName)) {
              warnings.push({ line: i + 1, msg: 'Nieznany filtr: "' + filterName + '"', severity: 'warning' });
            }
          }
        }
      });
    }

    // ── Sensor/template configuration validation ──────────────────────────
    lines.forEach((line, i) => {
      if (line.trim().startsWith('#')) return;
      const stateClassMatch = line.match(/state_class:\s*["']?(\w+)["']?/);
      if (stateClassMatch) {
        const dc = HAYamlChecker.DEVICE_CLASSES;
        if (dc && dc.state_class && !dc.state_class.includes(stateClassMatch[1].toLowerCase())) {
          warnings.push({ line: i + 1, msg: 'Nieprawid\u0142owy state_class: "' + stateClassMatch[1] + '" \u2014 dozwolone: ' + dc.state_class.join(', '), severity: 'warning' });
        }
      }
      const devClassMatch = line.match(/device_class:\s*["']?(\w+)["']?/);
      if (devClassMatch) {
        const dc = HAYamlChecker.DEVICE_CLASSES;
        if (dc) {
          const allClasses = [...(dc.sensor || []), ...(dc.binary_sensor || [])];
          if (allClasses.length && !allClasses.includes(devClassMatch[1].toLowerCase())) {
            warnings.push({ line: i + 1, msg: 'Nieznany device_class: "' + devClassMatch[1] + '"', severity: 'warning' });
          }
        }
      }
      if (/^\s*value_template:/.test(line) && !/^\s*#/.test(line)) {
        const nearby = lines.slice(Math.max(0, i - 5), Math.min(lines.length, i + 15)).join(' ');
        if (!/availability_template:|availability:/.test(nearby)) {
          warnings.push({ line: i + 1, msg: 'Best practice: dodaj availability_template przy value_template', severity: 'info' });
        }
      }
    });

    // ── Jinja2 control flow validation ────────────────────────────────────
    const ifStack = [];
    const forStack = [];
    lines.forEach((line, i) => {
      const t = line.trim();
      if (/{%-?\s*if\s+/.test(t) && !/{%-?\s*elif\s+/.test(t)) ifStack.push({ line: i + 1, txt: t.substring(0, 40) });
      if (/{%-?\s*endif\s*-?%}/.test(t)) {
        if (ifStack.length === 0) errors.push({ line: i + 1, msg: '{% endif %} bez otwieraj\u0105cego {% if %}', severity: 'error' });
        else ifStack.pop();
      }
      if (/{%-?\s*for\s+/.test(t)) forStack.push({ line: i + 1, txt: t.substring(0, 40) });
      if (/{%-?\s*endfor\s*-?%}/.test(t)) {
        if (forStack.length === 0) errors.push({ line: i + 1, msg: '{% endfor %} bez otwieraj\u0105cego {% for %}', severity: 'error' });
        else forStack.pop();
      }
      if (/{%-?\s*set\s+/.test(t) && !/{%-?\s*set\s+\w+\s*=/.test(t) && !/{%-?\s*set\s+\w+\s*%}/.test(t)) {
        warnings.push({ line: i + 1, msg: 'Sprawd\u017A sk\u0142adni\u0119 {% set %}', severity: 'warning' });
      }
    });
    ifStack.forEach(b => errors.push({ line: b.line, msg: 'Niezamkni\u0119ty {% if %}: ' + b.txt + '...', severity: 'error' }));
    forStack.forEach(b => errors.push({ line: b.line, msg: 'Niezamkni\u0119ty {% for %}: ' + b.txt + '...', severity: 'error' }));

    return { errors, warnings, lineCount: lines.length };
  }

  // ── Render ───────────────────────────────────────────────────────────────
  _render() {
    this.shadowRoot.innerHTML = `<style>${window.HAToolsBentoCSS || ""}
${this._css()}
/* === DARK MODE === */

        /* === MOBILE FIX === */
        @media (max-width: 768px) {
          .tabs { flex-wrap: wrap; overflow-x: visible; gap: 2px; }
          .tab, .tab-btn, .tab-btn { padding: 6px 10px; font-size: 12px; white-space: nowrap; }
          .card, .card-container { padding: 14px; }
          .stats, .stats-grid, .summary-grid, .stat-cards, .kpi-grid, .metrics-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }
          .stat-val, .kpi-val, .metric-val { font-size: 18px; }
          .stat-lbl, .kpi-lbl, .metric-lbl { font-size: 10px; }
          .panels, .board { flex-direction: column; }
          .column { min-width: unset; }
          h2 { font-size: 18px; }
          h3 { font-size: 15px; }
        }
        @media (max-width: 480px) {
          .tabs { gap: 1px; }
          .tab, .tab-btn, .tab-btn { padding: 5px 8px; font-size: 11px; }
          .stats, .stats-grid, .summary-grid, .stat-cards, .kpi-grid, .metrics-grid { grid-template-columns: 1fr 1fr; }
          .stat-val, .kpi-val, .metric-val { font-size: 16px; }
        }

</style>${this._html()}`
    this._attachEvents();
    this._injectDiscovery();
  }
  _html() {
    return `
      <div class="card">
        <div class="card-header">
          <span class="card-title-icon">🔍</span>
          <h2>YAML Checker</h2>
          <span class="version-badge">v3.0</span>
        </div>
        <div class="tabs" id="tabs">
          ${['config-check','entity-validator','paste-validate','template-tester','common-issues'].map(t => `
            <button class="tab-btn${t===this._activeTab?' active':''}" data-tab="${t}">
              ${{
                'config-check': '✅ Config',
                'entity-validator': '🔗 Encje',
                'file-scanner': '📁 Pliki',
                'paste-validate': '📝 Paste',
                'template-tester': '🧪 Template',
                'common-issues': '📖 Poradnik',
              }[t]}
            </button>
          `).join('')}
        </div>
        <div id="tab-content">${this._renderTabContent()}</div>
      </div>
    `;
  }

  _renderTabContent() {
    switch (this._activeTab) {
      case 'config-check': return this._renderConfigCheck();
      case 'entity-validator': return this._renderEntityValidator();
      case 'paste-validate': return this._renderPasteValidate();
      case 'template-tester': return this._renderTemplateTester();
      case 'common-issues': return this._renderCommonIssues();
      default: return '';
    }
  }

  _renderConfigCheck() {
    const r = this._checkResult;
    return `
      <div class="tab-pane active" data-tab="config-check">
        <div class="info-box">
          <span class="info-icon">ℹ️</span>
          <div>Uruchamia wbudowany walidator HA (<code>homeassistant.check_config</code>). Wykrywa b\u0142\u0119dy sk\u0142adni YAML oraz nieprawid\u0142owe klucze konfiguracji.</div>
        </div>
        ${this._checkLoading ? '<div class="loading-wrap"><div class="spinner"></div> Sprawdzanie konfiguracji HA...</div>' : ''}
        ${!this._checkLoading && !r ? '<div class="empty-hint">Kliknij przycisk, aby sprawdzi\u0107 konfiguracj\u0119</div>' : ''}
        ${!this._checkLoading && r ? this._renderCheckResult(r) : ''}
        <div style="margin-top:16px;">
          <button class="btn btn-primary" id="btn-check">✅ Sprawdź konfigurację HA</button>
        </div>
      </div>
    `;
  }

  _renderCheckResult(r) {
    const cls = r.ok ? 'success' : 'error';
    const icon = r.ok ? '✅' : '❌';
    const label = r.ok ? 'Konfiguracja poprawna' : 'Znaleziono błędy';
    return `
      <div class="result-header ${cls}">
        <span class="result-icon">${icon}</span>
        <div>
          <strong>${label}</strong>
          <small>${r.ts}${r.note ? ' · ' + r.note : ''}</small>
        </div>
      </div>
      ${r.errors.length ? `<div class="issue-section"><h3>Błędy (${r.errors.length})</h3>
        ${r.errors.map(e => `<div class="issue-item error"><span class="issue-icon">\u274C</span><div>${e.component ? '<strong>[' + e.component + ']</strong> ' : ''}${e.detail || e.message || JSON.stringify(e)}</div></div>`).join('')}
      </div>` : ''}
      ${r.warnings.length ? `<div class="issue-section"><h3>Ostrzeżenia (${r.warnings.length})</h3>
        ${r.warnings.map(w => `<div class="issue-item warning"><span class="issue-icon">⚠️</span><div>${w.message || JSON.stringify(w)}</div></div>`).join('')}
      </div>` : ''}
      ${r.ok && !r.errors.length && !r.warnings.length ? '<div class="all-good">✅ Wszystko w porządku!</div>' : ''}
    `;
  }

  _renderEntityValidator() {
    const r = this._entityResult;
    return `
      <div class="tab-pane active" data-tab="entity-validator">
        <div class="info-box">
          <span class="info-icon">🔗</span>
          <div>Skanuje automatyzacje i skrypty w poszukiwaniu referencji do nieistniej\u0105cych encji. Pomaga znale\u017A\u0107 "zepsute" entity_id po zmianie nazwy urz\u0105dzenia.</div>
        </div>
        ${this._entityLoading ? '<div class="loading-wrap"><div class="spinner"></div> Analizowanie encji...</div>' : ''}
        ${!this._entityLoading && !r ? '<div class="empty-hint">Kliknij przycisk, aby przeskanowa\u0107 encje</div>' : ''}
        ${!this._entityLoading && r && r.error ? `<div class="error-box">❌ B\u0142\u0105d: ${r.error}</div>` : ''}
        ${!this._entityLoading && r && !r.error ? this._renderEntityResult(r) : ''}
        <div style="margin-top:16px;">
          <button class="btn btn-primary" id="btn-entity">🔗 Sprawdź encje</button>
        </div>
      </div>
    `;
  }

  _renderEntityResult(r) {
    const topDomains = Object.entries(r.domainCounts)
      .sort((a,b) => b[1]-a[1]).slice(0,6);
    return `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${r.totalEntities}</div>
          <div class="stat-label">Encji w HA</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${r.totalAutomations}</div>
          <div class="stat-label">Automatyzacji</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${r.totalScripts}</div>
          <div class="stat-label">Skrypt\u00F3w</div>
        </div>
        <div class="stat-card ${r.broken.length ? 'stat-error' : ''}">
          <div class="stat-value ${r.broken.length ? 'error-val' : ''}">${r.broken.length}</div>
          <div class="stat-label">Uszkodz. ref.</div>
        </div>
      </div>
      ${r.dupIds.length ? `
        <div class="issue-section">
          <h3>⚠️ Duplikaty ID automatyzacji (${r.dupIds.length})</h3>
          ${r.dupIds.map(d => `<div class="issue-item warning"><span class="issue-icon">⚠️</span><div><strong>${d.id}</strong> — ${this._sanitize(d.alias)}</div></div>`).join('')}
        </div>
      ` : ''}
      ${r.broken.length ? `
        <div class="issue-section">
          <h3>❌ Uszkodzone referencje (${r.broken.length})</h3>
          ${r.broken.map(b => `<div class="issue-item error"><span class="issue-icon">❌</span><div><strong>${b.entity}</strong> <span style="color:var(--text-secondary);font-size:11px;">w ${b.type}: ${b.in}</span></div></div>`).join('')}
        </div>
      ` : '<div class="all-good">✅ Brak uszkodzonych referencji!</div>'}
      ${r.problemStates?.length ? `
        <div class="issue-section">
          <h3>⚠️ Encje unavailable/unknown (${r.problemStates.length})</h3>
          ${r.problemStates.slice(0, 30).map(p => `<div class="issue-item warning"><span class="issue-icon">⚠️</span><div><strong>${p.entity}</strong> — ${this._sanitize(p.name)} <span class="badge ${p.state === 'unavailable' ? 'error' : 'warning'}">${p.state}</span></div></div>`).join('')}
          ${r.problemStates.length > 30 ? `<div style="padding:8px;color:var(--bento-text-secondary);font-size:12px;">...i ${r.problemStates.length - 30} więcej</div>` : ''}
        </div>
      ` : ''}
      ${r.autoNoDesc?.length ? `
        <div class="issue-section">
          <h3>ℹ️ Automatyzacje bez opisu (${r.autoNoDesc.length})</h3>
          ${r.autoNoDesc.slice(0, 20).map(a => `<div class="issue-item info"><span class="issue-icon">ℹ️</span><div><strong>${this._sanitize(a.alias)}</strong> <span style="color:var(--bento-text-secondary);font-size:11px;">ID: ${a.id}</span></div></div>`).join('')}
          ${r.autoNoDesc.length > 20 ? `<div style="padding:8px;color:var(--bento-text-secondary);font-size:12px;">...i ${r.autoNoDesc.length - 20} więcej</div>` : ''}
        </div>
      ` : ''}
      ${r.noFriendlyName?.length ? `
        <div class="issue-section">
          <h3>ℹ️ Encje bez friendly_name (${r.noFriendlyName.length})</h3>
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">
            ${r.noFriendlyName.map(e => `<span class="badge warning" style="font-size:11px;">${e}</span>`).join('')}
          </div>
        </div>
      ` : ''}
      <div style="margin-top:12px;">
        <div class="file-list-header">Top domeny</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">
          ${topDomains.map(([d,n]) => `<span class="badge info">${d}: ${n}</span>`).join('')}
        </div>
      </div>
    `;
  }

  _renderFileScan() {
    const r = this._scanResult;
    return `
      <div class="tab-pane active" data-tab="file-scanner">
        <div class="info-box">
          <span class="info-icon">📁</span>
          <div>Informacje o systemie HA: wersja, ilo\u015B\u0107 encji, urz\u0105dze\u0144, obszar\u00F3w i komponent\u00F3w.</div>
        </div>
        ${this._scanLoading ? '<div class="loading-wrap"><div class="spinner"></div> Pobieranie informacji o systemie...</div>' : ''}
        ${!this._scanLoading && !r ? '<div class="empty-hint">Kliknij przycisk, aby pobra\u0107 info</div>' : ''}
        ${!this._scanLoading && r ? this._renderScanResult(r) : ''}
        <div style="margin-top:16px;">
          <button class="btn btn-primary" id="btn-scan">📁 Skanuj system</button>
        </div>
      </div>
    `;
  }

  _renderScanResult(r) {
    return `
      ${r.error ? `<div class="error-box">⚠️ Cz\u0119\u015Bciowy b\u0142\u0105d: ${r.error}</div>` : ''}
      ${r.haVersion ? `
        <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);">
          <div class="stat-card"><div class="stat-value">${r.haVersion}</div><div class="stat-label">HA Version</div></div>
          <div class="stat-card"><div class="stat-value">${r.entityCount}</div><div class="stat-label">Encji</div></div>
          <div class="stat-card"><div class="stat-value">${r.deviceCount}</div><div class="stat-label">Urz\u0105dze\u0144</div></div>
          <div class="stat-card"><div class="stat-value">${r.areaCount}</div><div class="stat-label">Obszar\u00F3w</div></div>
          <div class="stat-card"><div class="stat-value">${r.components}</div><div class="stat-label">Komponent\u00F3w</div></div>
          <div class="stat-card ${r.logErrors > 0 ? 'stat-error' : ''}">
            <div class="stat-value ${r.logErrors > 0 ? 'error-val' : ''}">${r.logErrors}</div>
            <div class="stat-label">B\u0142\u0119d\u00F3w w logu</div>
          </div>
        </div>
        ${r.configDir ? `<div class="note-box">📁 Katalog konfiguracji: <code>${r.configDir}</code></div>` : ''}
        ${r.logWarnings > 0 ? `<div class="note-box">⚠️ Ostrze\u017Ce\u0144 w logu: ${r.logWarnings}</div>` : ''}
      ` : ''}
      <div class="file-list-header" style="margin-top:12px;">Pliki konfiguracji (status nieznany — HA API nie udost\u0119pnia zawarto\u015Bci plik\u00F3w)</div>
      <div class="file-list">
        ${r.files.map(f => `
          <div class="file-item">
            <span class="file-icon">📔</span>
            <div class="file-info">
              <div class="file-path">${f.path}${f.critical ? '<span class="badge critical">krytyczny</span>' : ''}</div>
              <div class="file-desc">${f.desc}</div>
            </div>
            <span class="file-status-icon" title="Nieznany (HA API nie zwraca listy plik\u00F3w YAML)">\u2753</span>
          </div>
        `).join('')}
      </div>
      <div class="note-box" style="margin-top:12px;">💡 Aby sprawdzi\u0107 zawarto\u015B\u0107 plik\u00F3w u\u017Cyj: <strong>Paste &amp; Validate</strong> lub <strong>HA File Editor</strong> addon.</div>
    `;
  }

  _renderPasteValidate() {
    const { errors = [], warnings = [], lineCount = 0 } = this._pasteErrors || {};
    return `
      <div class="tab-pane active" data-tab="paste-validate">
        <div class="paste-wrap">
          <div class="paste-toolbar">
            <span class="paste-label">📝 Wklej YAML do sprawdzenia</span>
            <button class="btn btn-sm" id="btn-clear-paste">Wyczyść</button>
          </div>
          <textarea class="yaml-textarea" id="yaml-input" placeholder="# Wklej tutaj zawartość pliku YAML...\nautomation:\n  - alias: Test\n    trigger:\n      - platform: state\n        entity_id: light.salon">${this._pasteValue}</textarea>
          <button class="btn btn-primary" id="btn-validate">🔍 Waliduj YAML</button>
          ${this._pasteErrors && (errors.length || warnings.length) ? `
            <div class="paste-results">
              <div class="result-header ${errors.length ? 'error' : 'warning'}">
                <span class="result-icon">${errors.length ? '❌' : '⚠️'}</span>
                <div>
                  <strong>${errors.length} b\u0142\u0119d\u00F3w, ${warnings.length} ostrze\u017Ce\u0144</strong>
                  <small>${lineCount} linii | walidacja kliencka</small>
                </div>
              </div>
              ${[...errors, ...warnings].map(e => `
                <div class="issue-item ${e.severity}">
                  <span class="issue-icon">${e.severity === 'error' ? '❌' : e.severity === 'warning' ? '⚠️' : 'ℹ️'}</span>
                  <div><small style="color:var(--text-secondary)">Linia ${e.line}:</small> ${e.msg}</div>
                </div>
              `).join('')}
            </div>
          ` : ''}
          ${this._pasteErrors && !errors.length && !warnings.length && this._pasteValue ? '<div class="all-good">✅ Brak wykrytych problem\u00F3w!</div>' : ''}
        </div>
      </div>
    `;
  }

  _renderTemplateTester() {
    const r = this._templateResult;
    return `
      <div class="tab-pane active" data-tab="template-tester">
        <div class="info-box">
          <span class="info-icon">🧪</span>
          <div>Testuj szablony Jinja2 bezpo\u015Brednio przez HA API. To samo co Dev Tools \u203A Template, ale wbudowane w kart\u0119.</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div>
            <div class="paste-label" style="margin-bottom:6px;">Szablon Jinja2</div>
            <textarea class="yaml-textarea" id="template-input" style="min-height:120px;" placeholder="{{ states('sun.sun') }}">${this._templateValue}</textarea>
          </div>
          ${this._templateLoading ? '<div class="loading-wrap"><div class="spinner"></div> Wykonywanie szablonu...</div>' : ''}
          ${!this._templateLoading && r ? `
            <div class="result-header ${r.ok ? 'success' : 'error'}">
              <span class="result-icon">${r.ok ? '✅' : '❌'}</span>
              <div>
                <strong>${r.ok ? 'Wynik' : 'B\u0142\u0105d'}</strong>
                <small>${r.ts}</small>
              </div>
            </div>
            ${r.ok ? `<div style="background:rgba(0,0,0,0.04);border:1px solid var(--border);border-radius:8px;padding:12px;font-family:monospace;font-size:13px;word-break:break-all;">${String(r.value)}</div>` : ''}
            ${!r.ok ? `<div class="error-box">${r.error}</div>` : ''}
          ` : ''}
          <div style="display:flex;gap:8px;align-items:center;">
            <button class="btn btn-primary" id="btn-template">▶️ Wykonaj template</button>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              ${[
                ['{{ states("sun.sun") }}', '☀️ sun'],
                ['{{ now().strftime("%H:%M") }}', '🕐 czas'],
                ['{{ state_attr("sun.sun","elevation") | round(1) }}', '📐 atrybut'],
                ['{{ is_state("binary_sensor.motion","on") }}', '🔍 is_state'],
              ].map(([t,l]) => `<button class="btn btn-sm template-example" data-tpl="${t.replace(/"/g,'&quot;')}">${l}</button>`).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  _renderCommonIssues() {
    return `
      <div class="tab-pane active" data-tab="common-issues">
        ${HAYamlChecker.COMMON_ISSUES.map(cat => `
          <div class="issue-category">
            <h3>${cat.cat}</h3>
            ${cat.items.map(item => `
              <div class="common-item ${item.severity}">
                <div class="common-item-header">
                  <span>${item.severity === 'error' ? '❌' : item.severity === 'warning' ? '⚠️' : 'ℹ️'}</span>
                  <strong>${item.title}</strong>
                  <span class="badge ${item.severity}">${item.severity}</span>
                </div>
                <div class="common-item-desc">${item.desc.replace(/\n/g,'<br>')}</div>
              </div>
            `).join('')}
          </div>
        `).join('')}
      </div>
    `;
  }

  _updateTab(tab) {
    if (!this.shadowRoot) return;
    const content = this.shadowRoot.getElementById('tab-content');
    if (!content) { this._render(); return; }
    this._activeTab = tab;
    // Update tab buttons
    this.shadowRoot.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    content.innerHTML = this._renderTabContent();
    this._attachEventListeners();
  }

  _attachEvents() {
    this.shadowRoot.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => this._updateTab(btn.dataset.tab));
    });
    this._attachEventListeners();
  }

  _attachEventListeners() {
    const $ = id => this.shadowRoot.getElementById(id);
    const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };

    on('btn-check', 'click', () => this._runConfigCheck());
    on('btn-entity', 'click', () => this._runEntityValidation());
    on('btn-scan', 'click', () => this._runFileScan());
    on('btn-validate', 'click', () => {
      const ta = this.shadowRoot.getElementById('yaml-input');
      if (ta) {
        this._pasteValue = ta.value;
        this._pasteErrors = this._validateYAML(ta.value);
        this._updateTab('paste-validate');
      }
    });
    on('btn-clear-paste', 'click', () => {
      this._pasteValue = '';
      this._pasteErrors = null;
      this._updateTab('paste-validate');
    });
    on('btn-template', 'click', () => {
      const ta = this.shadowRoot.getElementById('template-input');
      if (ta) { this._templateValue = ta.value; this._runTemplateTester(); }
    });

    // Template examples
    this.shadowRoot.querySelectorAll('.template-example').forEach(btn => {
      btn.addEventListener('click', () => {
        this._templateValue = btn.dataset.tpl;
        this._templateResult = null;
        this._updateTab('template-tester');
      });
    });

    // Live textarea tracking
    const yamlTA = this.shadowRoot.getElementById('yaml-input');
    if (yamlTA) yamlTA.addEventListener('input', e => { this._pasteValue = e.target.value; });
    const tmplTA = this.shadowRoot.getElementById('template-input');
    if (tmplTA) tmplTA.addEventListener('input', e => { this._templateValue = e.target.value; });
  }

  _css() {
    return `
      :host {
        --primary: var(--primary-color, #3b82f6);
        --success: var(--success-color, #10b981);
        --warning: var(--warning-color, #f59e0b);
        --error: var(--error-color, #ef4444);
        --bg: var(--card-background-color, #fff);
        --text: var(--primary-text-color, #1e293b);
        --text-secondary: var(--secondary-text-color, #64748b);
        --border: var(--divider-color, #e2e8f0);
        --radius: 12px;
        display: block;
      }
      .card { background: var(--bg); border-radius: var(--radius); overflow: hidden; font-family: 'Inter', -apple-system, sans-serif; color: var(--text); }
      .card-header { display: flex; align-items: center; gap: 10px; padding: 16px 20px 12px; border-bottom: 1px solid var(--border); }
      .card-title-icon { font-size: 22px; }
      .card-header h2 { margin: 0; font-size: 16px; font-weight: 700; flex: 1; }
      .version-badge { font-size: 11px; background: rgba(59,130,246,0.1); color: var(--primary); border: 1px solid rgba(59,130,246,0.3); border-radius: 20px; padding: 2px 8px; font-weight: 600; }
      .tabs { display: flex; gap: 0; border-bottom: 1px solid var(--border); overflow-x: auto; scrollbar-width: none; }
      .tabs::-webkit-scrollbar { display: none; }
      .tab-btn { flex: 1; min-width: fit-content; padding: 10px 10px; border: none; background: none; cursor: pointer; font-size: 11px; font-weight: 600; color: var(--text-secondary); border-bottom: 2px solid transparent; transition: all 0.2s; white-space: nowrap; }
      .tab-btn:hover { color: var(--text); background: rgba(0,0,0,0.03); }
      .tab-btn.active { color: var(--primary); border-bottom-color: var(--primary); }
      .tab-pane { padding: 16px 20px; }
      .paste-wrap { display: flex; flex-direction: column; gap: 12px; }
      .paste-toolbar { display: flex; align-items: center; justify-content: space-between; }
      .paste-label { font-size: 13px; font-weight: 600; }
      .yaml-textarea { width: 100%; min-height: 180px; font-family: 'Fira Code','Consolas',monospace; font-size: 12px; padding: 12px; border: 1px solid var(--border); border-radius: 8px; background: rgba(0,0,0,0.02); color: var(--text); resize: vertical; box-sizing: border-box; outline: none; line-height: 1.6; }
      .yaml-textarea:focus { border-color: var(--primary); }
      .loading-wrap { display: flex; align-items: center; gap: 12px; padding: 20px; justify-content: center; color: var(--text-secondary); font-size: 14px; }
      .spinner { width: 20px; height: 20px; border: 2px solid var(--border); border-top-color: var(--primary); border-radius: 50%; animation: spin 0.8s linear infinite; flex-shrink: 0; }
      @keyframes spin { to { transform: rotate(360deg); } }
      .info-box { display: flex; gap: 12px; align-items: flex-start; padding: 14px; background: rgba(59,130,246,0.06); border: 1px solid rgba(59,130,246,0.2); border-radius: 10px; margin-bottom: 14px; font-size: 13px; line-height: 1.5; }
      .info-icon { font-size: 20px; flex-shrink: 0; }
      .info-box code { background: rgba(0,0,0,0.07); padding: 1px 5px; border-radius: 4px; font-size: 11px; }
      .note-box { padding: 10px 14px; background: rgba(59,130,246,0.06); border: 1px solid rgba(59,130,246,0.2); border-radius: 8px; font-size: 12px; color: var(--text-secondary); margin: 8px 0; }
      .btn { padding: 10px 18px; border: none; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.2s; display: inline-flex; align-items: center; gap: 6px; }
      .btn-primary { background: var(--primary); color: white; }
      .btn-primary:hover { opacity: 0.9; }
      .btn-sm { padding: 5px 10px; font-size: 12px; background: rgba(0,0,0,0.05); color: var(--text); border-radius: 6px; border: none; cursor: pointer; }
      .btn-sm:hover { background: rgba(0,0,0,0.1); }
      .result-header { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 10px; margin-bottom: 12px; }
      .result-header.success { background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.25); }
      .result-header.error { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.25); }
      .result-header.warning { background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.25); }
      .result-icon { font-size: 22px; }
      .result-header div { flex: 1; }
      .result-header strong { display: block; font-size: 14px; }
      .result-header small { color: var(--text-secondary); font-size: 12px; }
      .issue-section { margin: 10px 0; }
      .issue-section h3 { font-size: 13px; margin: 0 0 8px 0; color: var(--text-secondary); }
      .issue-item { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: 8px; margin-bottom: 6px; font-size: 13px; line-height: 1.5; }
      .issue-item.error { background: rgba(239,68,68,0.06); border-left: 3px solid var(--error); }
      .issue-item.warning { background: rgba(245,158,11,0.06); border-left: 3px solid var(--warning); }
      .issue-item.info { background: rgba(59,130,246,0.06); border-left: 3px solid var(--primary); }
      .issue-icon { flex-shrink: 0; font-size: 14px; margin-top: 1px; }
      .all-good { text-align: center; padding: 20px; font-size: 15px; color: var(--success); font-weight: 600; }
      .error-box { padding: 10px 14px; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.25); border-radius: 8px; font-size: 12px; margin-top: 10px; }
      .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
      .stat-card { background: rgba(59,130,246,0.05); border: 1px solid rgba(59,130,246,0.15); border-radius: 10px; padding: 12px; text-align: center; }
      .stat-card.stat-error { background: rgba(239,68,68,0.05); border-color: rgba(239,68,68,0.25); }
      .stat-value { font-size: 22px; font-weight: 700; color: var(--primary); }
      .stat-value.error-val { color: var(--error); }
      .stat-label { font-size: 11px; color: var(--text-secondary); margin-top: 2px; }
      .empty-hint { text-align: center; color: var(--text-secondary); font-size: 13px; padding: 20px; }
      .file-list-header { font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
      .file-list { display: flex; flex-direction: column; gap: 6px; }
      .file-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: rgba(0,0,0,0.02); border: 1px solid var(--border); border-radius: 8px; }
      .file-icon { font-size: 16px; flex-shrink: 0; }
      .file-info { flex: 1; }
      .file-path { font-size: 13px; font-weight: 600; font-family: monospace; }
      .file-desc { font-size: 11px; color: var(--text-secondary); margin-top: 2px; }
      .file-status-icon { font-size: 14px; flex-shrink: 0; }
      .badge { display: inline-block; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 10px; margin-left: 6px; vertical-align: middle; }
      .badge.critical,.badge.error { background: rgba(239,68,68,0.15); color: var(--error); }
      .badge.warning { background: rgba(245,158,11,0.15); color: var(--warning); }
      .badge.info { background: rgba(59,130,246,0.15); color: var(--primary); }
      .issue-category { margin-bottom: 20px; }
      .issue-category h3 { font-size: 14px; font-weight: 700; margin: 0 0 10px 0; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
      .common-item { margin-bottom: 10px; border-radius: 10px; overflow: hidden; border: 1px solid var(--border); }
      .common-item.error { border-left: 3px solid var(--error); }
      .common-item.warning { border-left: 3px solid var(--warning); }
      .common-item.info { border-left: 3px solid var(--primary); }
      .common-item-header { display: flex; align-items: center; gap: 8px; padding: 10px 14px 6px; font-size: 13px; }
      .common-item-header strong { flex: 1; }
      .common-item-desc { padding: 0 14px 10px; font-size: 12px; color: var(--text-secondary); line-height: 1.6; }
      .paste-results { display: flex; flex-direction: column; gap: 6px; }
    `;
  }

  _injectDiscovery() {
    if (customElements.get('ha-tools-panel')) return;
    const container = this.shadowRoot.querySelector('.card');
    if (!container) return;
    if (container.querySelector('ha-tools-discovery-banner')) return;
    const _inj = () => {
      if (window.HAToolsDiscovery) {
        window.HAToolsDiscovery.inject(container, 'yaml-checker', true);
      }
    };
    if (window.HAToolsDiscovery) { _inj(); return; }
    const s = document.createElement('script');
    s.src = '/local/community/ha-tools-panel/ha-tools-discovery.js?_=' + Date.now();
    s.async = true;
    s.onload = _inj;
    document.head.appendChild(s);
  }
}

customElements.define('ha-yaml-checker', HAYamlChecker);

