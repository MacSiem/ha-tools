# Plan audytu HA Tools — Gemma lokalnie w Ollama

**Data:** 2026-04-17
**Cel:** Samodzielny audyt 29 plików JS przez Gemma, skupiony na **tym, czego OpenAI audit (16.04.2026) nie sprawdził** — czyli HACS out-of-box, sensowność instrukcji, UI/UX, spójność między toolami. XSS/i18n już pokryte, nie powtarzamy.
**Lokalizacja wyników:** `audit-gemma/` (siostra `audit-openai/`)

---

## 1. Dlaczego ten audyt jest inny niż OpenAI

OpenAI audit (`audit-openai/REAL_ISSUES.md`) zidentyfikował 58 issues, głównie:
- Critical XSS (14) — innerHTML bez `_esc()`
- Quality (30) — empty catch, ARIA, hardcoded colors
- Info (14) — i18n gaps, inline styles

**Luki które Gemma ma wypełnić (ustalone z lessons learned + HACS hardening notes):**

1. **HACS out-of-box** — czy każdy tool działa po `hacs install` bez żadnej dodatkowej konfiguracji? OpenAI tego nie sprawdził. Obsidian `2026-04-14 HA Tools HACS Hardening.md` wskazuje że `ha-yaml-checker` miał hardcoded ścieżki, a `ha-vacuum-water-monitor` cichy failure przy braku configu. Phase 2 tego audytu nigdy nie została wykonana.
2. **Sensowność instrukcji** — czy README + inline help + komunikaty w UI faktycznie opisują to co tool robi? Czy wszystkie taby opisane w README istnieją w kodzie?
3. **UI/UX correctness** — czy `.card` wrapper wszędzie (nie `.container`), czy dark mode działa przez HA theme vars (nie `prefers-color-scheme`), czy tokens Bento (`--bento-radius-sm/md/lg` — **bez suffix nie istnieje**), czy responsive break 480px.
4. **Cross-tool consistency** — czy nazewnictwo event names, custom element names, config keys, settings keys, SMTP wiring jest spójne między toolami. Nikt nie auditował tego holistycznie.
5. **Dashboard compatibility** — czy każdy tool może być użyty zarówno w panel mode jak i jako `custom:ha-*` card (tak jak reklamuje README).

---

## 2. Zakres: 29 plików (22 tools + 7 infra)

**Tooling / infrastructure (7 plików — AUDYTOWANE):**
- `ha-tools-loader.js` — entry point HACS, loader wszystkich tools (potwierdzone w `hacs.json`: `"filename": "ha-tools-loader.js"`)
- `ha-tools-loader-v3.js` — prawdopodobnie dead code (nie w `hacs.json`, referencje tylko w CHANGELOG/SKIP listach), ale audit Gemma ma to potwierdzić — sekcja findings powinna zawierać "is this dead?"
- `ha-tools-stack.js` — custom card wrapping wszystkich tools
- `ha-tools-bento.js` — Bento CSS bundle (źródło prawdy dla `--bento-*` vars)
- `ha-tools-panel.js` — główny panel, settings, deep linking
- `ha-tools-discovery.js` — auto-discovery tools
- `ha-entity-renamer-temp.js` — prawdopodobnie dead/temp (nie w loader `allFiles[]`); Gemma ma to potwierdzić

**OUT OF SCOPE:**
- `ha-tools-loader.js.gz` — artefakt kompresji, nie źródło
- `bak_20260402_193824/*` — snapshot backup

**Tools (22 plików):**
ha-automation-analyzer, ha-baby-tracker, ha-backup-manager, ha-chore-tracker, ha-data-exporter, ha-device-health, ha-encoding-fixer, ha-energy-email, ha-energy-insights, ha-energy-optimizer, ha-entity-renamer, ha-frigate-privacy, ha-log-email, ha-network-map, ha-purge-cache, ha-security-check, ha-sentence-manager, ha-smart-reports, ha-storage-monitor, ha-trace-viewer, ha-vacuum-water-monitor, ha-yaml-checker

**Poza zakresem (ale czytane jako kontekst):**
- `README.md` — reference dla "czy instrukcje maja sens"
- `hacs.json` — reference dla "HACS readiness"
- `CHANGELOG.md` — reference dla "co jest udokumentowane"
- `audit-openai/REAL_ISSUES.md` — żeby Gemma nie dublowała OpenAI

---

## 3. Model i Ollama

**Rekomendacja:** `gemma3:27b` (preferowane) lub `gemma2:27b` fallback.
Powód:
- Gemma 3 27B ma natywny 128k context window → mieści największy plik (~40k tokens = `ha-sentence-manager.js`, `ha-vacuum-water-monitor.js`) razem z promptem, checklistą i fragmentami README w jednym wywołaniu.
- Gemma 2 27B ma tylko 8k context — musiałby chunkować pliki, co popsuje analizę cross-file references.

**Jeśli brak VRAM (27B wymaga ~16GB):** `gemma3:12b` jako kompromis — mniejsza jakość, ale wciąż 128k context.

**Setup:**
```bash
ollama pull gemma3:27b
ollama serve            # domyślnie :11434
# weryfikacja
ollama run gemma3:27b "say ok" --format json
```

**Parametry inference:**
- `temperature: 0.2` — deterministyczne wyniki, niska kreatywność (audyt to nie brainstorming)
- `num_ctx: 65536` — największe pliki mają ~40k tokens, plus context_pack ~35k tokens + prompt → potrzeba ≥75k. 64k jest minimum; jeśli dropout, podbić do 131072.
- `top_p: 0.9`
- **Uwaga:** sprawdź `ollama show gemma3:27b` żeby potwierdzić tag istnieje. Jeśli nie — fallback to `gemma2:27b-instruct-q4_K_M` (ale wymusi chunking plików >6k LOC, co popsuje analizę).

---

## 4. Struktura pipeline'u audytu

Skrypt `audit-gemma/run-audit.sh` (do napisania po zatwierdzeniu tego planu):

```
┌─────────────────────────────────────────────────────────────┐
│ 1. BOOTSTRAP (raz)                                          │
│    - Pull model, sprawdź Ollama up                          │
│    - Zbuduj context_pack.txt:                               │
│      * README.md (tab/feature claims)                       │
│      * hacs.json                                            │
│      * ha-tools-bento.js (źródło tokenów CSS)              │
│      * ha-tools-loader.js (lista tools, BASE path)          │
│      * audit-openai/REAL_ISSUES.md (żeby nie dublować)      │
│      * GEMMA_CHECKLIST.md (sekcja 5)                        │
│    - Cache: ~150KB, ~35k tokens                             │
├─────────────────────────────────────────────────────────────┤
│ 2. PER-TOOL PASS (22× + 7× infra = 29×)                     │
│    Dla każdego pliku X:                                     │
│    a) Wczytaj X + context_pack                              │
│    b) Wywołaj Gemma z promptem „audit-file"                 │
│    c) Zapisz raw output: audit-gemma/<tool>.raw.md          │
│    d) Drugi pass: „self-critique" — Gemma czyta własny      │
│       output i zaznacza pewność każdego findingu (H/M/L)   │
│    e) Zapisz: audit-gemma/<tool>.md (finalny per-tool)      │
├─────────────────────────────────────────────────────────────┤
│ 3. CROSS-CHECK PASS                                         │
│    Zbuduj cross_inputs.txt z ekstraktów z sekcji 2:         │
│    - custom element names (jeden per tool)                  │
│    - service calls (`hass.callService(...)`)               │
│    - WebSocket calls (`hass.callWS(...)`)                   │
│    - localStorage keys                                      │
│    - settings/config keys                                   │
│    - event names dispatchowane i nasłuchiwane               │
│    - SMTP config wiring                                     │
│    Jedno wywołanie Gemma z promptem „cross-check"           │
│    → audit-gemma/CROSS_CHECK.md                             │
├─────────────────────────────────────────────────────────────┤
│ 4. KONSOLIDACJA                                             │
│    Zbuduj REAL_ISSUES.md (jeden plik, priority-sorted)      │
│    Gemma czyta wszystkie `<tool>.md` + CROSS_CHECK.md       │
│    → audit-gemma/REAL_ISSUES.md                             │
│    Format: identyczny jak audit-openai, żeby porównywać    │
└─────────────────────────────────────────────────────────────┘
```

**Czas wykonania (estymat, Mac mini M4 Metal, 27B Q4_K_M, ~15–20 tok/s):**
- Per-tool pass: ~120–180s (większe pliki z self-critique dobiją 3–4 min)
- 29 plików × 150s ≈ **~70 min**
- Cross-check: ~3–5 min
- Konsolidacja: ~5–8 min
- **Łącznie realistycznie: 80–100 min.** Zakładaj 2h budżetu żeby się nie zdziwić.
- Przy `gemma3:12b` skróci się do ~35–45 min kosztem jakości.

---

## 5. Checklista audytu (do `GEMMA_CHECKLIST.md`)

Każdy per-tool pass sprawdza **8 obszarów**. Gemma ma wypełnić strukturę dla każdego.

### A. HACS out-of-box readiness (NOWY OBSZAR vs OpenAI)

- [ ] Czy tool ładuje się **bez** wymaganej konfiguracji w `configuration.yaml`?
- [ ] Czy wszystkie ścieżki plików są relative do `window.location.pathname` (nie hardcoded `/config/www/...`, nie `C:\Users\...`)?
- [ ] Czy tool gracefully degraduje gdy opcjonalne komponenty brakują (np. `ha_tools_email`, `frigate`, `roborock`)?
- [ ] Czy brak configu pokazuje friendly message, nie throw (lesson z `ha-vacuum-water-monitor` 2026-04-14)?
- [ ] Czy `customElements.get()` guard przed `define()`?
- [ ] Czy custom element name zgodny ze schematem `ha-<tool>` (dash-separated, lowercase)?
- [ ] Czy edytor komponentu (`ha-<tool>-editor`) też zarejestrowany, jeśli tool akceptuje config?

### B. Sensowność instrukcji (NOWY OBSZAR vs OpenAI)

- [ ] Czy wszystkie taby wymienione w README dla tego toola **istnieją** w kodzie (matchuje renderowane taby)?
- [ ] Czy "Features" z README są faktycznie zaimplementowane (nie są TODO / placeholder)?
- [ ] Czy komunikaty błędów użyte są **konkretne** (np. "Config missing: `energy_price`") a nie generic ("Error")?
- [ ] Czy inline help / tooltipy / placeholder text mają sens i nie są zlepkiem lorem ipsum?
- [ ] Czy tool akceptuje opcje udokumentowane w README (tabela `Card Type | Key Options`)?
- [ ] Jeśli tool ma "Guide" tab (ha-yaml-checker) — czy guide jest kompletny i aktualny?

### C. UI/UX correctness (NOWY vs OpenAI — OpenAI tylko ARIA)

- [ ] Czy **jest** `.card` wrapper (nie `.container`) — Bento reguła z Obsidian.
- [ ] Czy używa `--bento-*` tokens konsekwentnie (`--bento-radius-sm/md/lg`, `--bento-shadow-sm/md/lg`) — **nie `--bento-radius` sam!**
- [ ] Czy dark mode przez HA theme vars (`--card-background-color`, `--primary-text-color`), **nie** `@media (prefers-color-scheme: dark)`?
- [ ] Czy responsive media queries dla ≤480px są obecne?
- [ ] Czy tabs mają poprawne ARIA (`role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`) — overlap z OpenAI, ale tu sprawdzamy też **działanie klawiatury** (arrow keys)?
- [ ] Czy tooltip / empty state / loading state mają **sensowną wizualną hierarchię** (icon + text, nie goły string)?
- [ ] Czy fontem jest Inter (ładowany globalnie w loaderze) lub tokeny Bento, nie hardcoded `sans-serif`?

### D. Logika tool-specific (per-tool)

Dla każdego toola, Gemma sprawdza **2–3 tool-specific inwarianty** (załączone jako table). Przykłady:

- `ha-energy-email`: czy fallback do `notify.*` gdy brak `ha_tools_email`? Czy `recipient` walidowany jako email?
- `ha-vacuum-water-monitor`: czy 9 robot profili zaimplementowanych (Roborock, Dreame, Ecovacs, Xiaomi)?
- `ha-frigate-privacy`: czy timer countdown poprawnie liczy (off-by-one)?
- `ha-yaml-checker`: czy entity registry scan obsługuje ≥1700 entities bez blokowania UI (requestIdleCallback?)?
- `ha-trace-viewer`: czy batch export CSV escapuje przecinki / nowe linie?

(Pełna tabela w `TOOL_SPECIFIC_CHECKS.md` — do wygenerowania w kroku 6.)

### E. Deep linking i settings integration

- [ ] Czy tool nasłuchuje `hashchange` dla deep linking `#tool-id/tab-name` (jak README reklamuje)?
- [ ] Czy tool używa `frontend/set_user_data` / `frontend/get_user_data` dla settings, **nie** tylko localStorage?
- [ ] Czy reaguje na zmianę języka (`hass.language`) bez reloadu strony?
- [ ] Czy integruje się z settings panel (`ha-tools-panel.js`) poprawnie — respektuje `this._lang`, `this._theme`?

### F. Błędy zapamiętane z Obsidian lessons (watch-list)

- [ ] **Brak BOM w pliku** (UTF-8 clean) — Obsidian: "NEVER Get-Content/Set-Content"
- [ ] Brak `async_register_agent` (deprecated) — dotyczy `ha-sentence-manager`
- [ ] Brak `.container` zamiast `.card` (9 tools flagged w Gemma pierwszym audycie)
- [ ] Brak hardcoded colorów (>~30 per tool = warning; >~100 = tech debt)
- [ ] Brak hardcoded ścieżek `/config/www/community/ha-tools/`
- [ ] Brak hardcoded IP `192.168.1.124` lub Samba paths `\\192.168.1.124`

### G. Overlap z OpenAI (sanity check, nie duplikuj)

Gemma ma listę tematów **już pokrytych** przez OpenAI (z `REAL_ISSUES.md`). Jeśli Gemma znajdzie coś w tym obszarze:
- Jeśli zgadza się z OpenAI → pisze `CONFIRM: OpenAI line X — <jednozdaniowy komentarz>`
- Jeśli nie zgadza się → pisze `DISPUTE: OpenAI line X — powód`
- Jeśli znalazła **dodatkowy** XSS / i18n gap → normalny finding

To pozwala na meta-analizę: gdzie modele się zgadzają, gdzie różnią.

### H. Zero findings pass

Jeśli dla danego obszaru (A–F) nic nie znalazła, Gemma **musi** napisać `OK` + 1 zdanie uzasadnienia (co konkretnie sprawdziła). Puste sekcje = re-run.

---

## 6. Prompt template (per-tool audit)

Zapisać jako `audit-gemma/prompts/per_tool.txt`:

```
Jesteś senior code reviewerem Home Assistant custom cards. Audit file {FILENAME}.
Masz dostęp do context_pack (README, hacs.json, Bento CSS source, loader, OpenAI findings).

Twoje zadanie: wypełnij STRUKTURĘ (sekcje A–H z checklisty).
NIE powielaj ustaleń OpenAI chyba że CONFIRMujesz lub DISPUTEjesz.
Dla każdego findingu: podaj NUMER LINII, SEVERITY (Critical/Warning/Info), FIX w 1 zdaniu.
NIE halucynuj linii — jeśli nie jesteś pewien, napisz "line ~X".
Jeśli nie znalazłeś nic w sekcji → napisz "OK — <co sprawdziłeś>".

KONWENCJE (z Obsidian):
- Bento: `.card` wrapper obowiązkowy, NIE `.container`
- Tokens: `--bento-radius-sm/md/lg` (bez suffix NIE ISTNIEJE)
- Dark mode: HA theme vars, NIE `prefers-color-scheme`
- Ścieżki: relative do `window.location.pathname`, NIE hardcoded
- UTF-8 bez BOM obowiązkowe

Format wyjścia: markdown z sekcjami `## A. HACS`, `## B. Instructions`, itd.
Zakończ sekcją `## SUMMARY` z: total findings, severity breakdown, top 3 priorytet.

--- PLIK DO AUDYTU ---
{FILE_CONTENT}

--- CONTEXT PACK ---
{CONTEXT_PACK}
```

---

## 7. Cross-check pass (sekcja 3 pipeline'u)

**Prompt:** `audit-gemma/prompts/cross_check.txt`

```
Masz 27 raportów per-tool + ekstrakty:
- custom element names
- `hass.callService(domain, service, ...)` calls (gdzie/co/jakie parametry)
- `hass.callWS(...)` calls
- localStorage keys
- settings keys (get/set user data)
- Event names (dispatchEvent / addEventListener niestandardowe)
- SMTP wiring (`ha_tools_email` references)

Znajdź niespójności:
1. Czy dwa tooly używają TEGO SAMEGO localStorage key z różną semantyką?
2. Czy dwa tooly dispatchują event `<x>` a nikt nie słucha (orphan)?
3. Czy są overlapy w nazwach custom elementów?
4. Czy SMTP fallback jest spójny (wszystkie email tools używają tej samej ścieżki ha_tools_email → notify.*)?
5. Czy settings keys mają spójny prefix (`ha-tools-*` vs inne)?
6. Czy service calls mają spójne error handling (wszystkie catch lub wszystkie throw)?
7. Czy tooly używają tego samego helpera `_esc` / `_sanitize` (window._haToolsEsc) konsekwentnie?
8. Czy tooly z wspólnym settings (energy_price, currency) faktycznie czytają z tego samego source?
9. Czy deep linking `#tool-id` matchuje custom element names?
10. Czy każdy tool zarejestrowany w `ha-tools-loader.js` `allFiles[]` ma poprawny entry w `ha-tools-panel.js` tab list?

Format: markdown, issue-per-section, severity, affected tools.
```

---

## 8. Struktura output directory

```
audit-gemma/
├── run-audit.sh                    # orchestrator
├── prompts/
│   ├── per_tool.txt
│   ├── self_critique.txt
│   ├── cross_check.txt
│   └── consolidate.txt
├── context_pack.txt                # cache (regenerowany co run)
├── extracts/                       # maszynowe ekstrakty per tool
│   ├── ha-<tool>.element.txt
│   ├── ha-<tool>.services.json
│   └── ha-<tool>.storage.json
├── raw/                            # pierwszy pass, niezredagowane
│   └── ha-<tool>.raw.md
├── ha-<tool>.md                    # finalne per-tool (29 plików)
├── CROSS_CHECK.md                  # spójność między toolami
├── REAL_ISSUES.md                  # konsolidacja, priority-sorted
├── DIFF_VS_OPENAI.md               # co znalazła Gemma a OpenAI nie (i vice versa)
└── progress.json                   # status per pass, tokens, time
```

---

## 9. Konsolidacja (sekcja 4 pipeline'u)

Prompt dla ostatniego passa:

```
Masz 27 per-tool reports (markdown) + CROSS_CHECK.md.
Wygeneruj REAL_ISSUES.md w formacie identycznym do audit-openai/REAL_ISSUES.md:

# HA Tools Gemma Audit — Real Issues Report
**Date:** {TODAY}
**Method:** Gemma via Ollama (local), per-tool + cross-check + consolidation
**Model:** {MODEL}

## Summary
- Critical: X
- Warning: Y
- Info: Z
- Cross-tool issues: N
- Total tokens: M

## Critical Issues
### <tool>.js
- Line X — <one-line description>
- Severity: Critical
- Fix: <one line>

## Warning Issues
(...)

## Info Issues
(...)

## Cross-Tool Issues
### <category>
- Tools affected: [...]
- Severity: X
- Fix: <...>

## Comparison vs. OpenAI Audit
### What Gemma found that OpenAI missed
(...)
### What OpenAI found that Gemma missed
(...)
### Where they agree
(...)
### Where they disagree
(...)

## Priority Matrix
P0 / P1 / P2 (jak OpenAI)
```

---

## 10. Weryfikacja po zakończeniu (QA)

Po wygenerowaniu raportu, **przed** przyjęciem wyników, run manual sanity:

1. **Sampling:** losowo wybierz 3 findings i zweryfikuj line numbers w kodzie (Gemma halucynuje numery linii częściej niż OpenAI).
2. **False positive check:** compare z `audit-openai/REAL_ISSUES.md` sekcja "False Positives" — czy Gemma powtórzyła te same błędy (ha-automation-analyzer memory leak etc.)?
3. **Coverage check:** czy raport ma sekcje A–H dla każdego z 29 plików? Braki = re-run tego toola.
4. **Cross-check quality:** czy CROSS_CHECK.md ma ≥5 realnych findings, czy to placeholder?

---

## 11. Rozstrzygnięte decyzje (2026-04-17)

**Kolejność: Gemma najpierw, decyzje o dead code / test-tools.js po audycie.**

1. **`ha-tools-loader-v3.js`** — nie blokuje audytu. **Włączamy do scope'u jako infra** żeby Gemma sama potwierdziła że to dead code (jej finding będzie cennym confirm'em mojej analizy). Po audycie usuwamy.
2. **`bak_20260402_193824/`** — OUT OF SCOPE.
3. **`run-audit.sh` — LOCAL ONLY, NIE commitować**. Skrypt ląduje w `audit-gemma/` + `.gitignore` entries: `audit-gemma/run-audit.sh`, `prompts/`, `context_pack.txt`, `extracts/`, `raw/`. Wyniki (`*.md`, `REAL_ISSUES.md`, `CROSS_CHECK.md`, `DIFF_VS_OPENAI.md`, `progress.json`) mogą być commitowane jak w `audit-openai/`.
4. **`test-tools.js` — SKIP jako context (na razie)**. Plik jest na Windows, nie Mac. Nie blokujemy audytu — Gemma dostanie README jako reference. Jeśli po audycie zobaczymy że warto — druga iteracja z `test-results.txt` jako kontekstem.

---

## 12. Definicja sukcesu

Audyt jest **zakończony sukcesem** jeśli:

- 29 plików `ha-<tool>.md` istnieje, każdy z sekcjami A–H
- Żadna sekcja nie jest pusta (każda albo ma finding, albo explicit "OK — <co sprawdziłeś>")
- `CROSS_CHECK.md` zawiera ≥5 findings między toolami
- `REAL_ISSUES.md` ma format identyczny do OpenAI, sortowany po severity
- `DIFF_VS_OPENAI.md` pokazuje co najmniej 3 findings których OpenAI nie miał (w obszarach A/B/C — HACS/instrukcje/UI)
- Sanity sampling 3 findings potwierdza że line numbers są realne (nie hallucinated)
- `progress.json` ma total_tokens + per-pass breakdown (dla porównania z OpenAI 1.24M)

---

## 13. Następne kroki — Gemma najpierw

**Gemma leci od razu. Dead code decisions i test-tools integration — PO audycie.**

### Krok 1: Bootstrap (5 min, automat)
1. Sprawdzić że Ollama żyje: `curl -s http://localhost:11434/api/tags`
2. `ollama pull gemma3:27b` (jeśli brak) → fallback `gemma3:12b`
3. `ollama show gemma3:27b` — verify
4. Utworzyć `audit-gemma/` ze strukturą z sekcji 8

### Krok 2: Build artefakty (10 min, ja piszę)
5. `audit-gemma/run-audit.sh` — orchestrator (bash + curl do Ollama API, JSON parsing w `jq` lub Python)
6. `audit-gemma/prompts/per_tool.txt`, `self_critique.txt`, `cross_check.txt`, `consolidate.txt`
7. `audit-gemma/GEMMA_CHECKLIST.md` — pełna lista A–H z sekcji 5
8. `audit-gemma/TOOL_SPECIFIC_CHECKS.md` — 22 tool-specific inwarianty (sekcja D)
9. Ekstraktor (Python lub bash+grep) dla cross-check inputs (custom elements, callService, callWS, localStorage, eventów)
10. `.gitignore` update (pierwsza linia: `audit-gemma/run-audit.sh`, `audit-gemma/prompts/`, `audit-gemma/context_pack.txt`, `audit-gemma/extracts/`, `audit-gemma/raw/`)

### Krok 3: Odpalenie (80–100 min, Ollama pracuje)
11. `./audit-gemma/run-audit.sh --model gemma3:27b --num-ctx 65536`
12. Monitor przez `tail -f audit-gemma/progress.json` + `tail -f audit-gemma/run.log`
13. Jeśli któryś tool crashuje (OOM / timeout) → re-run tylko tego toola z `--only <tool>`

### Krok 4: QA po audycie (15 min, manual)
14. Sampling 3 random findings → verify line numbers w kodzie
15. Compare z `audit-openai/REAL_ISSUES.md` sekcja "False Positives" — czy Gemma powtórzyła te same błędy?
16. Coverage check — 29 `<tool>.md` plików, każdy z sekcjami A–H
17. Prezentacja `REAL_ISSUES.md` + `DIFF_VS_OPENAI.md`

### Krok 5: Decyzje PO audycie (na podstawie findings)
18. Usunąć `ha-tools-loader-v3.js` i `ha-entity-renamer-temp.js` jeśli Gemma potwierdziła dead code
19. Druga iteracja z `test-tools.js` output jako kontekst (jeśli findings sugerują że warto)
20. Fix pipeline dla Critical/P0 findings
