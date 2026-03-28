# HA Tools Panel — Backlog napraw

Repozytorium: `ha-tools-panel`
Deploy: Samba `\\192.168.1.124\config\www\community\ha-tools\`
Pliki: `*.js` — kazdy tool to osobny web component renderowany w Shadow DOM
Design system: zmienne CSS `--bento-*` z fallbackami na HA theme vars (`--primary-background-color`, `--card-background-color`, `--primary-text-color`, `--secondary-text-color`, `--divider-color`)
Ograniczenie: to HACS addon — nie wolno tworzyc/edytowac plikow na serwerze HA usera. Cala logika musi byc w JS, dane z HA WebSocket API.

---

## Wymagania globalne (dotyczy WSZYSTKICH 22 narzedzi)

### G1. Dark mode

Kazdy plik `ha-*.js` musi miec w `<style>` blok:
```css
@media (prefers-color-scheme: dark) {
  :host {
    --bento-bg: #1a1a2e;
    --bento-card: #16213e;
    --bento-text: #e2e8f0;
    --bento-text-secondary: #94a3b8;
    --bento-border: #334155;
    --bento-shadow: 0 1px 3px rgba(0,0,0,0.3);
    --bento-shadow-md: 0 4px 12px rgba(0,0,0,0.4);
  }
  /* + overridy specyficzne dla komponentow tego toola */
}
```

Stan obecny:
- PELNY dark mode (8/22): `ha-tools-panel`, `ha-security-check`, `ha-energy-email`, `ha-log-email`, `ha-purge-cache`, `ha-smart-reports`, `ha-energy-insights`, `ha-tools-discovery` — NIE RUSZAC
- CZESCIOWY (8/22 — maja `--bento-*` vars z HA fallback ale brak `@media dark`): `ha-backup-manager`, `ha-sentence-manager`, `ha-data-exporter`, `ha-baby-tracker`, `ha-chore-tracker`, `ha-cry-analyzer`, `ha-storage-monitor`, `ha-energy-optimizer` — DODAC blok `@media (prefers-color-scheme: dark)` z overridami `:host` i selektorow specyficznych
- SLABY (6/22 — brak `--bento-*`, brak `@media dark`): `ha-trace-viewer`, `ha-automation-analyzer`, `ha-device-health`, `ha-network-map`, `ha-vacuum-water-monitor`, `ha-yaml-checker` — DODAC zmienne `--bento-*` z HA fallbackami w `:host` ORAZ blok `@media (prefers-color-scheme: dark)`

### G2. Jezyk PL/EN

Kazdy tool musi:
1. Miec obiekt `_translations` z kluczami `pl` i `en` zawierajacy WSZYSTKIE stringi UI
2. Miec przelacznik jezyka (ikona flagi lub select PL/EN) w NAGLOWKU toola
3. Reagowac na `this._lang` i uzywa `this._t('klucz')` lub `this._translations[this._lang].klucz`
4. Domyslny jezyk: `pl`

Stan obecny:
- Maja przelacznik (4/22): `ha-tools-panel`, `ha-trace-viewer`, `ha-storage-monitor`, `ha-security-check` — NIE RUSZAC
- Maja teksty PL+EN ale BEZ przelacznika (9/22): `ha-automation-analyzer`, `ha-device-health`, `ha-sentence-manager`, `ha-network-map`, `ha-vacuum-water-monitor`, `ha-yaml-checker`, `ha-energy-insights`, `ha-log-email`, `ha-baby-tracker` — DODAC przelacznik jezyka
- Tylko EN (5/22): `ha-backup-manager`, `ha-chore-tracker`, `ha-cry-analyzer`, `ha-data-exporter`, `ha-purge-cache` — DODAC pelne tlumaczenie PL + przelacznik

### G3. Responsywnosc mobile

Kazdy tool musi miec breakpointy:
```css
@media (max-width: 768px) { /* tablet */ }
@media (max-width: 480px) { /* telefon */ }
```
Minimum: taby `flex-wrap: wrap`, gridy `grid-template-columns: 1fr`, padding/font-size zmniejszone, tabele scrollowalne.

### G4. Ujednolicony styl tabow (Advanced Tools)

Dotyczy: `ha-yaml-checker`, `ha-sentence-manager`, `ha-data-exporter`, `ha-trace-viewer`, `ha-automation-analyzer`, `ha-log-email`, `ha-purge-cache`

Problem: kazdy uzywa innego stylu nawigacji/tabow. Ujednolicic do JEDNEGO wzorca:
- Klasa `.tab-btn` z identycznym stylem we wszystkich toolach
- Aktywna zakladka: `.tab-btn.active`
- Layout: `display: flex; flex-wrap: wrap; gap: 4px;`
- Styl: `padding: 8px 16px; border-radius: 8px; border: 1px solid var(--bento-border); background: var(--bento-card); color: var(--bento-text); cursor: pointer; font-size: 13px;`
- Aktywny: `background: var(--bento-primary); color: white; border-color: var(--bento-primary);`

### G5. Kodowanie znakow

Dane z HA API moga zawierac polskie znaki UTF-8 ktore przegladarka zle dekoduje (mojibake). Przed wyswietleniem nazw backupow, encji, itp. zastosowac:
```js
try { name = decodeURIComponent(escape(name)); } catch(e) {}
```

### G6. Kontener wykresow

Kazdy kontener z `<canvas>` (Chart.js) lub elementem wykresowym musi miec:
```css
.chart-container { max-height: 300px; overflow: hidden; position: relative; }
.chart-container canvas { max-height: 250px; width: 100%; }
```
Zapobiega nieskonczonemu rozciaganiu sie strony.

---

## Naprawy per tool

---

### ha-backup-manager.js

[DONE] #### UI-1: Klikniecie backupu nie otwiera szczegolow
Naprawione: `_selectBackup()` toggleuje `_selectedBackup` i `_updateUI()` renderuje `backup-details` div z zawartością (HA config, database, addons, folders).

[DONE] #### UI-2: Puste pole na gorze pierwszej zakladki
Naprawione: struktura `_renderBackupsTab()` jest czysta — backup-controls + error-banner (warunkowy) + backups-list. Brak pustego elementu.

[DONE] #### UI-3: Wykres Health rozciaga strone
Naprawione: CSS `canvas { max-height: 200px; width: 100%; }` (linia 1190).

[DONE] #### UI-4: Mojibake — polskie znaki w nazwach
Naprawione: `_sanitizeName()` z `decodeURIComponent(escape(name))` (linia 251-254).

[DONE] #### UI-5: Brak dark mode
Naprawione: pełny `@media (prefers-color-scheme: dark)` blok (linia 1274) z override dla backup-item, health-card, content-item, addon-list, schedule-info, create-btn.

[DONE] #### FUNC-1: Brak informacji o metodzie backupu
Naprawione: badge `backup.location` w `_renderBackupsTab()` (linia 288) — Addon/Cloud/Local.

---

### ha-yaml-checker.js

[DONE] #### FUNC-1: Walidacja config i encji nie wylapuje problemow
Naprawione: dodano w `_scanEntities()`: unavailable/unknown entities (1578 znalezionych), encje bez friendly_name (50), automatyzacje bez description (183). Duplikaty ID były już wcześniej. Wyniki renderowane w `_renderEntityResult()` z osobnymi sekcjami.

[DONE] #### FUNC-2: Tool powinien byc lepszy niz wbudowany HA checker
Naprawione: Paste & Validate tab ma rozbudowany linting — tabs, duplikaty kluczy, unquoted colons, brak alias, Jinja2 syntax, trigger/condition/action format, deprecated patterns, best practices (entity_id casing, mode: single, delay format, secret detection). Severity: error/warning/info.

[DONE] #### FUNC-3: Deprecated syntax detection
Naprawione: 10 deprecated patterns w `DEPRECATED_PATTERNS` static getter (initial on/off, data_template, entity_namespace, hide_entity, white_value, for: integer, value_template, platform: mqtt, homeassistant.turn, condition: template). Plus trigger:/condition:/action: → triggers:/conditions:/actions: w paste validator.

---

### ha-log-email.js

[DONE] #### UI-1: Brak informacji o statusie SMTP
Naprawione: `_detectSmtp()`, `_testSmtp()`, `_renderSmtpSection()` — status badge, auto-detekcja notify services, przycisk "Testuj SMTP", guide z przykładami SMTP.

[DONE] #### FUNC-1: Brak feedbacku po nieudanej wysylce
Naprawione: `_sendEmailNow()` z try/catch, `_sendStatus` tracking (error/sending/success), wizualny feedback w UI.

[DONE] #### FUNC-2: Brak natychmiastowych powiadomien o bledach
Naprawione: dodano `_startPolling()/_stopPolling()/_pollForNewErrors()` — setInterval polling `system_log/list`, porównanie z baseline, `persistent_notification.create` przy nowym ERROR. Toggle + select interwału (30s/60s/2min/5min) w UI. Config w localStorage.

[DONE] #### FUNC-3: Brak przechowywania historii logow
Naprawione: `_logHistory` array z sessionStorage, max 24 snapshots FIFO, tabela historii w zakładce History.

---

### ha-smart-reports.js

[DONE] #### UI-1: Wykres wychodzi poza kontener
Naprawione: `.chart-container { height: 200px !important; }` (linia 420).

[DONE] #### UI-2: Problemy z kodowaniem znakow
Naprawione: `_sanitize()` z `decodeURIComponent(escape())` (linia 74-76), używane w renderach.

[DONE] #### FUNC-1: Dane demo zamiast prawdziwych
Naprawione: brak mock data w kodzie. Dodano empty state w `_renderEnergy()` gdy `sensors.length === 0` — komunikat "Brak danych energetycznych" + link do /config/energy.

---

### ha-storage-monitor.js

[DONE] #### UI-1: Flickering przy ladowaniu
Naprawione: `requestAnimationFrame` debounce w `_updateContent()` z RAF cancellation pattern.

[DONE] #### UI-2: Brak rozmiarow plikow i folderow
Naprawione: Supervisor API `/host/info` i `/os/info` dla disk_total/used/free. Bytes → MB konwersja.

[DONE] #### FUNC-1: Brak rozmiarow addonow
Naprawione: `/addons/{slug}/info` z `disk_usage` per addon, konwersja bytes → MB.

[DONE] #### FUNC-2: Podwojne odswiezanie
Naprawione: `_loading` flag guard na początku fetch, `_loading = false` w końcu, spinner w `_doUpdateContent()` gdy loading.

---

### ha-security-check.js

[DONE] #### FUNC-1: Brak danych o dodatkach, integracjach i sieci
Naprawione: addons z host_network check, integrations count z config.components, SSL/HTTPS status z external_url, Nabu Casa Cloud detection, external access reporting.

---

### ha-energy-insights.js

[DONE] #### FUNC-1: Wykresy bez danych — brak informacji co skonfigurowac
Naprawione: `noSensors` check → "Brak czujników energii" message PL/EN.

[DONE] #### FUNC-2: Dynamiczne stawki energetyczne
Naprawione: `energy_cost_per_kwh` config z cost tracking w chart labels.

---

### ha-energy-email.js

[DONE] #### UI-1: Brak informacji ze czas wysylki zalezy od automation
Naprawione: info-box w schedule tab z wyjaśnieniem zależności od HA automations, defaults, przykład YAML.

[DONE] #### FUNC-1: Zly czas wysylki
Naprawione: brak wbudowanego timera/schedulera. UI jasno komunikuje że wysyłka zależy od automation.

[DONE] #### FUNC-2: Brak zakresu dat
Naprawione: period selector 24h/7d/30d w Preview tab. Przyciski przełączają dane (day/week/month sensors). Kolumny tabeli i podsumowanie dynamiczne wg wybranego okresu.

---

### ha-automation-analyzer.js

[DONE] #### UI-1: Brak responsywnosci mobile
Naprawione: breakpointy 768px i 480px z flex-wrap, grid 1fr, zmniejszone padding/font-size.

[DONE] #### UI-2: Brak dark mode
Naprawione: pełne --bento-* vars z HA fallbackami + @media (prefers-color-scheme: dark) blok.

---

### ha-sentence-manager.js

[DONE] #### UI-1: Brak pelnego dark mode
Naprawione: @media (prefers-color-scheme: dark) blok z pełnymi overridami.

[DONE] #### FUNC-1: Custom Actions
Naprawione: zakładka "⚡ Custom Actions" z listą, formularzem tworzenia, generowaniem YAML.

[DONE] #### FUNC-2: Brak informacji o sterowaniu glosowym
Naprawione: sekcja Assist z konfiguracją (Settings > Voice assistants), test (Dev Tools > Assist), info o custom sentences.

---

### ha-baby-tracker.js

[DONE] #### UI-1: Layout mobile do weryfikacji
Naprawione: breakpointy 768px/480px obecne.

[DONE] #### UI-2: Brak dark mode
Naprawione: @media (prefers-color-scheme: dark) blok z pełnymi overridami.

[DONE] #### FUNC-1: Brak informacji o entity/kartach/glosie
Naprawione: sekcja "Karta Lovelace / Entity / Sterowanie głosowe" z przykładem YAML, info o entity, sterowanie głosem.

---

### ha-chore-tracker.js

[DONE] #### UI-1: Lepsze empty states
Naprawione: empty-state div z ikonami (📅, 📊), tekstem, CTA button, toggle visibility wg danych.

[DONE] #### UI-2: Brak dark mode
Naprawione: @media (prefers-color-scheme: dark) blok.

---

### ha-cry-analyzer.js

[DONE] #### UI-1: Lepsze empty states
Naprawione: empty state z 👶 ikoną, "No Cry Logs Yet", instrukcja, CTA "📝 Log First Cry" z `_showAddDialog()`.

[DONE] #### UI-2: Brak dark mode
Naprawione: @media (prefers-color-scheme: dark) blok.

---

### ha-vacuum-water-monitor.js

[DONE] #### UI-1: Brak dark mode
Naprawione: `@media (prefers-color-scheme: dark)` blok z pełnymi overridami `:host` variables.

[DONE] #### UI-2: Brak recznego wyboru entity
Naprawione: input `#manual-vacuum-entity` z przyciskiem "Dodaj" w Settings. Zapis wybranego entity do localStorage. Auto-discovery + manual fallback.

[DONE] #### FUNC-1: Profile robotow z kalibracjami
Naprawione: `CALIBRATION_DATA` obiekt z 9 profilami (Dreame L10 Pro, L20 Ultra, Roborock S7/S8/Q Revo, Ecovacs X1/T20, Xiaomi X10+, generic). Każdy profil: water_per_m2 per intensity level, tank_ml, avg_area_per_charge, label.

[DONE] #### FUNC-2: Research-based calibration data
Naprawione: dane kalibracyjne w `CALIBRATION_DATA` — ml/m² per mopping intensity (low/medium/high/max/deep), pojemność zbiornika, szacowany zasięg. UI renderuje calibration card z poziomami i estymacją powierzchni.

---

## Zasady techniczne przy naprawach

1. **BOM**: NIGDY nie zapisywac plikow z BOM (Byte Order Mark). Uzywac UTF-8 bez BOM.
2. **Shadow DOM**: wszystkie style musza byc w `<style>` wewnatrz shadow root. Zewnetrzne CSS nie dzialaja.
3. **HA theme**: uzywac `var(--primary-background-color)` itp. jako fallbacki w `--bento-*` vars.
4. **Supervisor API**: `callWS({ type: 'supervisor/api' })` dziala TYLKO na HA OS/Supervised. Zawsze opakowac w `try/catch` z fallbackiem.
5. **Brak dostepu do filesystem usera**: to HACS addon — nie wolno zakladac dostepu do plikow config. Dane tylko z WebSocket API.
6. **localStorage**: dozwolone do zapisu preferencji usera (jezyk, wybrany profil robota, historia logow). Klucze z prefixem `ha-tools-`.
7. **Kolejnosc napraw**: najpierw G1-G6 (globalne), potem bugi per tool od gory dokumentu.
