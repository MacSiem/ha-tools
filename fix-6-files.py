import os

FILES = [
    'ha-baby-tracker.js',
    'ha-chore-tracker.js',
    'ha-data-exporter.js',
    'ha-frigate-privacy.js',
    'ha-sentence-manager.js',
    'ha-vacuum-water-monitor.js'
]

ESC_OLD = """// XSS protection helper
const _esc = (s) => typeof s === 'string' ? s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]) : (s ?? '');"""

ESC_NEW = """// XSS protection helper (reuse global from panel, fallback for standalone)
const _esc = window._haToolsEsc || ((s) => typeof s === 'string' ? s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]) : (s ?? ''));"""

PERSIST_STUB = """// -- HA Tools Persistence (stub -- full impl in ha-tools-panel.js) --
window._haToolsPersistence = window._haToolsPersistence || { _cache: {}, _hass: null, setHass(h) { this._hass = h; }, async save(k, d) { try { localStorage.setItem('ha-tools-' + k, JSON.stringify(d)); } catch(e) {} }, async load(k) { try { const r = localStorage.getItem('ha-tools-' + k); return r ? JSON.parse(r) : null; } catch(e) { return null; } }, loadSync(k) { try { const r = localStorage.getItem('ha-tools-' + k); return r ? JSON.parse(r) : null; } catch(e) { return null; } } };
"""

for fname in FILES:
    with open(fname, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    content = ''.join(lines)

    # 1. Fix _esc
    content = content.replace(ESC_OLD, ESC_NEW)

    # 2. Find persistence block by line scanning
    new_lines = content.split('\n')
    start = None
    end = None
    brace_depth = 0
    in_block = False

    for i, line in enumerate(new_lines):
        if 'HA Tools Server Persistence Helper' in line:
            start = i
            continue
        if start is not None and not in_block and 'window._haToolsPersistence' in line:
            in_block = True
            brace_depth = line.count('{') - line.count('}')
            if brace_depth == 0:
                end = i
                break
            continue
        if in_block:
            brace_depth += line.count('{') - line.count('}')
            if brace_depth <= 0:
                end = i
                break

    if start is not None and end is not None:
        # Replace lines start..end with stub
        result_lines = new_lines[:start] + PERSIST_STUB.split('\n') + new_lines[end+1:]
        result = '\n'.join(result_lines)

        with open(fname, 'w', encoding='utf-8') as f:
            f.write(result)

        removed = end - start + 1
        print(f'OK: {fname} (_esc + persistence, -{removed} lines)')
    else:
        print(f'ERROR: {fname} - could not find persistence block')
