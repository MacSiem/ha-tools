import re, os

SKIP = {'ha-tools-panel.js', 'ha-tools-bento.js', 'ha-tools-loader.js', 'ha-tools-loader-v3.js',
        'ha-tools-discovery.js', 'ha-tools-stack.js', 'ha-tools-common.js', 'ha-entity-renamer-temp.js'}

files = sorted([f for f in os.listdir('.') if f.startswith('ha-') and f.endswith('.js') and f not in SKIP])

# Match the persistence helper block: from comment through closing };
PERSIST_PATTERN = re.compile(
    r'// .{0,10}HA Tools Server Persistence Helper.{0,10}\n'
    r'// Uses HA frontend/set_user_data.*?\n'
    r'// Falls back to localStorage.*?\n'
    r'window\._haToolsPersistence = window\._haToolsPersistence \|\| \{.*?\n\};\n',
    re.DOTALL
)

STUB = (
    "// -- HA Tools Persistence (stub -- full impl in ha-tools-panel.js) --\n"
    "window._haToolsPersistence = window._haToolsPersistence || "
    "{ _cache: {}, _hass: null, setHass(h) { this._hass = h; }, "
    "async save(k, d) { try { localStorage.setItem('ha-tools-' + k, JSON.stringify(d)); } catch(e) {} }, "
    "async load(k) { try { const r = localStorage.getItem('ha-tools-' + k); return r ? JSON.parse(r) : null; } catch(e) { return null; } }, "
    "loadSync(k) { try { const r = localStorage.getItem('ha-tools-' + k); return r ? JSON.parse(r) : null; } catch(e) { return null; } } };\n"
)

changed = 0
for fname in files:
    with open(fname, 'r', encoding='utf-8') as f:
        content = f.read()

    if 'window._haToolsPersistence = window._haToolsPersistence ||' not in content:
        continue

    match = PERSIST_PATTERN.search(content)
    if not match:
        print(f'SKIP (no regex match): {fname}')
        continue

    old_block = match.group(0)
    old_lines = old_block.count('\n')

    new_content = content[:match.start()] + STUB + content[match.end():]

    if new_content == content:
        print(f'NO CHANGE: {fname}')
        continue

    with open(fname, 'w', encoding='utf-8') as f:
        f.write(new_content)
    saved_lines = old_lines - STUB.count('\n')
    print(f'OK: {fname} (-{saved_lines} lines)')
    changed += 1

print(f'\nTotal: {changed} files updated')
