# HA Tools Audit — Zweryfikowane Wyniki
Data: 2026-04-16
Audyt: Gemma 3 4B (3 passy) → weryfikacja: Sonnet + grep

---

## KRYTYCZNE: XSS (4 potwierdzone, 1 false positive)

| Tool | innerHTML | z escape | bez escape | Status |
|------|-----------|----------|------------|--------|
| ha-baby-tracker.js | 13 | 9 safe | **4 unsafe** | ✅ POTWIERDZONE |
| ha-data-exporter.js | 12 | 6 safe | **6 unsafe** | ✅ POTWIERDZONE |
| ha-encoding-fixer.js | 5 | 4 safe | **1 unsafe** | ✅ POTWIERDZONE (mniejsze niż Gemma twierdziła) |
| ha-sentence-manager.js | 13 | 11 safe | **2 unsafe** | ✅ POTWIERDZONE |
| ha-vacuum-water-monitor.js | 7 | 7 safe | 0 unsafe | ❌ FALSE POSITIVE |

### Szczegóły XSS:
- **ha-data-exporter.js** (najgorszy, 6 unsafe): niezescapowane entity_id w title attr, attribute values z JSON.stringify, err.message, ch.state z API
- **ha-baby-tracker.js** (4 unsafe): f.type, f.linkedId, d.type, typeLabels bez escape
- **ha-sentence-manager.js** (2 unsafe): slotName z prompt() → innerHTML (linia 632!), intent/sentence/response w wynikach testów
- **ha-encoding-fixer.js** (1 unsafe): result.method bez escape

---

## MEMORY LEAKS: WSZYSTKIE FALSE POSITIVE ❌

| Tool | addEventListener | removeEventListener | Werdykt |
|------|-----------------|---------------------|---------|
| ha-backup-manager.js | 9 | 0 | ❌ FALSE POSITIVE — listenery na elementach shadowRoot, GC przy re-render |
| ha-chore-tracker.js | 6 | 0 | ❌ FALSE POSITIVE — j.w. |
| ha-encoding-fixer.js | 32 | 0 | ❌ FALSE POSITIVE — j.w. |
| ha-log-email.js | 10 | 0 | ❌ FALSE POSITIVE — j.w. + setInterval poprawnie czyszczony w disconnectedCallback |
| ha-sentence-manager.js | 33 | 0 | ❌ FALSE POSITIVE — j.w. |

**Powód:** Wszystkie 5 tooli używa wzorca: `shadowRoot.innerHTML = html` → attach listenery → stare elementy + listenery → GC. To standardowy, bezpieczny pattern dla Shadow DOM.

---

## INLINE STYLES (potwierdzone, ale severity = warning nie critical)

Top offenders (inline `style="..."` w template literals):

| Tool | Inline styles | Ocena |
|------|--------------|-------|
| ha-vacuum-water-monitor.js | **190** | Poważny refaktor potrzebny |
| ha-energy-email.js | **91** | Duży refaktor |
| ha-baby-tracker.js | **80** | Duży refaktor |
| ha-sentence-manager.js | **77** | Duży refaktor |
| ha-security-check.js | **72** | Duży refaktor |
| ha-log-email.js | **67** | Średni refaktor |
| ha-storage-monitor.js | **37** | Mały refaktor |
| ha-backup-manager.js | **33** | Mały refaktor |
| ha-network-map.js | **31** | Mały refaktor |

Mało (OK): ha-purge-cache (4), ha-automation-analyzer (4), ha-energy-insights (7), ha-trace-viewer (12)

---

## .container vs .card (Bento compliance)

Powinny używać `.card` zamiast `.container` per Bento design system:

| Tool | .container użyć |
|------|----------------|
| ha-energy-optimizer.js | **6** |
| ha-storage-monitor.js | **5** |
| ha-security-check.js | **4** |
| ha-sentence-manager.js | **3** |
| ha-data-exporter.js | **2** |
| ha-smart-reports.js | **2** |
| ha-chore-tracker.js | 1 |
| ha-energy-insights.js | 1 |
| ha-vacuum-water-monitor.js | 1 |

---

## TRY/CATCH (context — nie zawsze problem)

Ratio try/catch do API calls > 4 sugeruje nadmiar:

| Tool | try/catch | API calls | Ratio | Ocena |
|------|-----------|-----------|-------|-------|
| ha-yaml-checker.js | 15 | 1 | **15.0** | Dużo, ale tool robi parsowanie YAML/Jinja — uzasadnione |
| ha-network-map.js | 8 | 1 | **8.0** | Canvas rendering — prawdopodobnie OK |
| ha-vacuum-water-monitor.js | 22 | 3 | **7.3** | Przesada |
| ha-trace-viewer.js | 21 | 4 | **5.2** | Przesada |
| ha-automation-analyzer.js | 17 | 4 | **4.2** | Graniczny |
| ha-energy-optimizer.js | 13 | 3 | **4.3** | Graniczny |

Większość try/catch jest defensywna (error states, parsing) — nie bug, ale tech debt.

---

## PODSUMOWANIE PRIORYTETÓW

### P0 — Naprawić ASAP (XSS):
1. **ha-data-exporter.js** — 6 niezescapowanych innerHTML
2. **ha-baby-tracker.js** — 4 niezescapowane innerHTML
3. **ha-sentence-manager.js** — 2 unsafe (w tym prompt() → innerHTML!)
4. **ha-encoding-fixer.js** — 1 niezescapowany innerHTML

### P1 — Refaktor (inline styles → CSS classes):
1. ha-vacuum-water-monitor.js (190)
2. ha-energy-email.js (91)
3. ha-baby-tracker.js (80)

### P2 — Bento compliance (.container → .card):
1. ha-energy-optimizer.js (6)
2. ha-storage-monitor.js (5)
3. ha-security-check.js (4)

### P3 — Tech debt (try/catch cleanup):
- Niski priorytet, defensywny kod nie boli
