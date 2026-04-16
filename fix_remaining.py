#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Fix remaining specific bugs."""
import sys, re, subprocess
sys.stdout.reconfigure(encoding='utf-8') if hasattr(sys.stdout, 'reconfigure') else None
from pathlib import Path

REPO = Path(r"C:\Users\macie\ha-tools-repo\www\community\ha-tools")

DARK_MODE_BENTO = """@media (prefers-color-scheme: dark) {
  :host {
    --bento-bg: var(--primary-background-color, #1a1a2e);
    --bento-card: var(--card-background-color, #16213e);
    --bento-text: var(--primary-text-color, #e2e8f0);
    --bento-text-secondary: var(--secondary-text-color, #94a3b8);
    --bento-border: var(--divider-color, #334155);
    --bento-shadow-sm: 0 1px 3px rgba(0,0,0,0.3);
    --bento-shadow-md: 0 4px 12px rgba(0,0,0,0.4);
  }
}"""

def check_syntax(filepath):
    r = subprocess.run(
        ['node', '-e', f'''const vm=require("vm"),fs=require("fs");
try{{new vm.Script(fs.readFileSync({repr(str(filepath))},"utf8"));console.log("SYNTAX OK");}}
catch(e){{console.error("SYNTAX ERROR:",e.message);}}'''],
        capture_output=True, text=True)
    return r.stdout.strip() or r.stderr.strip()

def save(filepath, content):
    filepath.write_text(content, encoding='utf-8')
    s = check_syntax(filepath)
    print(f"  [SAVED] {filepath.name} | {s}")

# ============================================================
# ha-smart-reports.js - orphaned } in CSS
# ============================================================
print("=== ha-smart-reports.js ===")
fp = REPO / "ha-smart-reports.js"
c = fp.read_text(encoding='utf-8')
orig = c

# The orphaned } is the line "        }" that appears between h3 rule and @media 480px
# Line 493-497:
#   .panels, .board { flex-direction: column; }
#   .column { min-width: unset; }
#   h2 { font-size: 18px; }
#   h3 { font-size: 15px; }
# }   ← orphaned
# @media (max-width: 480px) {
old_css = "          h3 { font-size: 15px; }\n        }\n        @media (max-width: 480px) {"
new_css = "          h3 { font-size: 15px; }\n        @media (max-width: 480px) {"
if old_css in c:
    c = c.replace(old_css, new_css)
    print("  [FIX] Removed orphaned } in CSS (line 497)")
else:
    print("  [SKIP] Orphaned } pattern not found - may have different whitespace")
    # Print context around h3 and @media 480px to debug
    idx = c.find("h3 { font-size: 15px;")
    if idx != -1:
        print(f"  Context: {repr(c[idx:idx+100])}")

# Fix .card using --bento-bg instead of --bento-card
if ".card { background: var(--bento-bg);" in c:
    c = c.replace(".card { background: var(--bento-bg);", ".card { background: var(--bento-card);")
    print("  [FIX] Fixed .card background: --bento-bg -> --bento-card")

if c != orig:
    save(fp, c)
else:
    print("  [NOCHANGE] ha-smart-reports.js")

# ============================================================
# ha-storage-monitor.js - tab-button CSS missing
# ============================================================
print("\n=== ha-storage-monitor.js ===")
fp = REPO / "ha-storage-monitor.js"
c = fp.read_text(encoding='utf-8')
orig = c

# Fix: add .tab-button to all .tab, .tab-btn, .tab-btn selectors
# (replace the duplicate .tab-btn with .tab-button)
c = c.replace('.tab, .tab-btn, .tab-btn {', '.tab, .tab-btn, .tab-button {')
if c != orig:
    print("  [FIX] Added .tab-button to CSS selectors (replaced duplicate .tab-btn)")
    save(fp, c)
else:
    print("  [NOCHANGE] ha-storage-monitor.js tab-button CSS")

# ============================================================
# ha-purge-cache.js - dark mode uses --pc-* instead of --bento-*
# ============================================================
print("\n=== ha-purge-cache.js ===")
fp = REPO / "ha-purge-cache.js"
c = fp.read_text(encoding='utf-8')
orig = c

# Find the dark mode block with --pc-* and replace with proper --bento-* block
old_dm = re.search(
    r'@media\s*\(prefers-color-scheme:\s*dark\)\s*\{[^}]*:host\s*\{[^}]*--pc-[^}]+\}[^}]*\}',
    c, re.DOTALL
)
if old_dm:
    # What comes after the block (e.g. .log-success etc.) should stay
    block_text = old_dm.group()
    # Find what's in the block besides the :host part
    host_match = re.search(r':host\s*\{[^}]+\}', block_text, re.DOTALL)
    if host_match:
        extra = block_text[host_match.end():].rstrip().rstrip('}').strip()
        # Build replacement: bento dark mode + any extra rules
        new_dm = DARK_MODE_BENTO
        if extra:
            # Add extra rules to the dark mode block
            new_dm = new_dm[:-1]  # remove closing }
            new_dm += '\n' + extra + '\n}'
        c = c[:old_dm.start()] + new_dm + c[old_dm.end():]
        print("  [FIX] Replaced dark mode --pc-* block with --bento-* tokens")
    else:
        print("  [SKIP] Could not parse dark mode block structure")
else:
    print("  [SKIP] --pc-* dark mode block not found")

# Fix .card missing background/border/border-radius
old_card = re.search(r'\.card\s*\{\s*max-width:\s*900px;[^}]*\}', c, re.DOTALL)
if old_card:
    card_text = old_card.group()
    if 'background' not in card_text:
        new_card = card_text.rstrip('}').rstrip() + \
            '\n  background: var(--bento-card) !important;\n  border: 1px solid var(--bento-border) !important;\n  border-radius: var(--bento-radius-md) !important;\n  box-shadow: var(--bento-shadow-sm);\n}'
        c = c.replace(card_text, new_card)
        print("  [FIX] Added background/border/border-radius to .card")

if c != orig:
    save(fp, c)
else:
    print("  [NOCHANGE] ha-purge-cache.js")

# ============================================================
# ha-network-map.js - add dark mode (uses string concatenation CSS)
# ============================================================
print("\n=== ha-network-map.js ===")
fp = REPO / "ha-network-map.js"
c = fp.read_text(encoding='utf-8')
orig = c

if '@media (prefers-color-scheme: dark)' in c:
    print("  [SKIP] Already has dark mode")
else:
    # CSS is built by string concatenation, find a good insertion point
    # Add dark mode string after the .card rule
    card_css = "'.card { background: var(--bento-card);"
    if card_css in c:
        # Find the card rule's closing and add dark mode after
        card_pos = c.find(card_css)
        card_end = c.find("' +\n", card_pos)
        if card_end == -1:
            card_end = c.find("'\n", card_pos)
        if card_end != -1:
            # The dark mode as a JS string concatenation
            dm_str = """'@media (prefers-color-scheme: dark) { :host { --bento-bg: var(--primary-background-color, #1a1a2e); --bento-card: var(--card-background-color, #16213e); --bento-text: var(--primary-text-color, #e2e8f0); --bento-text-secondary: var(--secondary-text-color, #94a3b8); --bento-border: var(--divider-color, #334155); --bento-shadow-sm: 0 1px 3px rgba(0,0,0,0.3); } }' +"""
            # Insert after the card rule
            insert_after = c[card_pos:card_end + 4]
            new_str = insert_after + '\n    ' + dm_str
            c = c.replace(insert_after, new_str, 1)
            print("  [FIX] Added dark mode as string concat after .card rule")
        else:
            print("  [SKIP] Cannot find .card rule end in string concat CSS")
    else:
        print(f"  [SKIP] Cannot find .card CSS entry point")

if c != orig:
    save(fp, c)
else:
    print("  [NOCHANGE] ha-network-map.js")

# ============================================================
# ha-yaml-checker.js - static getter bug + hidden tab
# ============================================================
print("\n=== ha-yaml-checker.js ===")
fp = REPO / "ha-yaml-checker.js"
c = fp.read_text(encoding='utf-8')
orig = c

# Fix 1: file-scanner tab missing from tabs array
# Look for the tabs array definition
tabs_line = re.search(r"\['config-check',[^\]]+\]", c)
if tabs_line:
    old_tabs = tabs_line.group()
    print(f"  Found tabs array: {old_tabs[:80]}")
    if 'file-scanner' not in old_tabs:
        # Add file-scanner between entity-validator and paste-validate
        new_tabs = old_tabs.replace("'paste-validate'", "'file-scanner','paste-validate'")
        if new_tabs != old_tabs:
            c = c.replace(old_tabs, new_tabs)
            print("  [FIX] Added file-scanner to tabs array")
        else:
            print("  [SKIP] Could not add file-scanner to tabs array")
    else:
        print("  [OK] file-scanner already in tabs array")
else:
    print("  [SKIP] Tabs array not found")

# Fix 2: Add file-scanner case to _renderTabContent
fs_case_pattern = "case 'file-scanner':"
if fs_case_pattern not in c:
    # Find where to add it - after 'entity-validator' case
    old_ev_case = "case 'entity-validator': return this._renderEntityValidation();"
    if old_ev_case in c:
        new_ev_case = old_ev_case + "\n        case 'file-scanner': return this._renderFileScan();"
        c = c.replace(old_ev_case, new_ev_case)
        print("  [FIX] Added file-scanner case to _renderTabContent")
    else:
        print("  [SKIP] Could not find entity-validator case for insertion")
else:
    print("  [OK] file-scanner case already exists")

if c != orig:
    save(fp, c)
else:
    print("  [NOCHANGE] ha-yaml-checker.js")

# ============================================================
# ha-automation-analyzer.js - add dark mode :host override
# ============================================================
print("\n=== ha-automation-analyzer.js (dark mode :host) ===")
fp = REPO / "ha-automation-analyzer.js"
c = fp.read_text(encoding='utf-8')
orig = c

# The existing dark mode block is non-standard (doesn't override :host bento tokens)
# We need to add a :host override block
existing_dm = re.search(r'@media\s*\(prefers-color-scheme:\s*dark\)\s*\{', c)
if existing_dm:
    # Check if it has :host { --bento-card
    dm_pos = existing_dm.start()
    dm_to_check = c[dm_pos:dm_pos+500]
    if '--bento-card' in dm_to_check or '--bento-bg' in dm_to_check:
        print("  [OK] Dark mode already has --bento-* tokens")
    else:
        # Add a new :host dark mode block before the existing one
        c = c[:dm_pos] + DARK_MODE_BENTO + '\n' + c[dm_pos:]
        print("  [FIX] Added :host dark mode block before existing dark mode")

if c != orig:
    save(fp, c)
else:
    print("  [NOCHANGE] ha-automation-analyzer.js")

print("\n=== DONE ===")
