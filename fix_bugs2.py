#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Apply specific bug fixes per file (no unicode in print statements)."""
from pathlib import Path
import subprocess
import sys
import re

# Force UTF-8 output to avoid cp1250 issues
sys.stdout.reconfigure(encoding='utf-8') if hasattr(sys.stdout, 'reconfigure') else None

REPO = Path(r"C:\Users\macie\ha-tools-repo\www\community\ha-tools")

def check_syntax(filepath):
    result = subprocess.run(
        ['node', '-e', f'''const vm = require("vm"); const fs = require("fs");
try {{ new vm.Script(fs.readFileSync({repr(str(filepath))}, "utf8")); console.log("SYNTAX OK"); }}
catch(e) {{ console.error("SYNTAX ERROR:", e.message); }}'''],
        capture_output=True, text=True
    )
    return result.stdout.strip() or result.stderr.strip()

def fix_file(filename, fixes):
    filepath = REPO / filename
    content = filepath.read_text(encoding='utf-8')
    original = content
    for desc, old, new in fixes:
        if old in content:
            content = content.replace(old, new, 1)
            print(f"  [FIX] {desc}")
        else:
            print(f"  [SKIP] Not found: {desc}")
    if content != original:
        filepath.write_text(content, encoding='utf-8')
        syntax = check_syntax(filepath)
        print(f"  [SAVED] {filename} | {syntax}")
    else:
        print(f"  [NOCHANGE] {filename}")
    return content != original


print("=== ha-log-email.js ===")
fix_file("ha-log-email.js", [
    (
        "Fix _testSmtp: this._update() => this._render() (smtpTesting = true)",
        "    this._smtpTesting = true;\n    this._update();",
        "    this._smtpTesting = true;\n    this._render();"
    ),
    (
        "Fix _testSmtp: this._update() => this._render() (smtpTesting = false)",
        "    this._smtpTesting = false;\n    this._update();",
        "    this._smtpTesting = false;\n    this._render();"
    ),
])

print("\n=== ha-entity-renamer.js ===")
filepath_er = REPO / "ha-entity-renamer.js"
er_content = filepath_er.read_text(encoding='utf-8')
# Find the exact button line
bad_btn_line = None
for line in er_content.split('\n'):
    if 'data-add-single=' in line and '${t.queue}' in line and "'" in line:
        bad_btn_line = line
        break
if bad_btn_line:
    print(f"  Found bad button line: {repr(bad_btn_line[:80])}")

fix_file("ha-entity-renamer.js", [
    (
        "Fix button label: backtick for t.queue interpolation",
        "      : '<button class=\"btn btn-sm btn-outline\" data-add-single=\"' + e.entity_id + '\">+ ${t.queue}</button>'",
        '      : `<button class="btn btn-sm btn-outline" data-add-single="${e.entity_id}">+ ${t.queue}</button>`'
    ),
    (
        "Fix queue empty check: also check _deviceRenameQueue",
        "    if (!this._renameQueue.length) {",
        "    if (!this._renameQueue.length && !Object.keys(this._deviceRenameQueue || {}).length) {"
    ),
])

print("\n=== ha-frigate-privacy.js ===")
fix_file("ha-frigate-privacy.js", [
    (
        "Fix setActiveTab: this._render() => this._updateUI()",
        "  setActiveTab(tabId) {\n    this._activeTab = tabId;\n    this._render();\n  }",
        "  setActiveTab(tabId) {\n    this._activeTab = tabId;\n    this._updateUI();\n  }"
    ),
])

print("\n=== ha-smart-reports.js ===")
# Check the CSS around line 497
filepath_sr = REPO / "ha-smart-reports.js"
sr_content = filepath_sr.read_text(encoding='utf-8')
lines_sr = sr_content.split('\n')
print("  Lines 490-502:")
for i, line in enumerate(lines_sr[489:502], 490):
    print(f"    {i}: {repr(line)}")

print("\n=== ha-purge-cache.js ===")
filepath_pc = REPO / "ha-purge-cache.js"
pc_content = filepath_pc.read_text(encoding='utf-8')

# Check dark mode block
dm_match = re.search(r'@media\s*\(prefers-color-scheme:\s*dark\)', pc_content)
if dm_match:
    dm_start = dm_match.start()
    dm_block = pc_content[dm_start:dm_start+400]
    print(f"  Dark mode block: {dm_block[:300]}")
else:
    print("  No dark mode found - need to add")

# Check .card rule
for m in re.finditer(r'\.card\s*\{[^}]*\}', pc_content, re.DOTALL):
    ln = pc_content[:m.start()].count('\n') + 1
    block = m.group()[:150]
    print(f"  .card at line ~{ln}: {repr(block[:80])}")

print("\n=== ha-network-map.js ===")
filepath_nm = REPO / "ha-network-map.js"
nm_content = filepath_nm.read_text(encoding='utf-8')
has_dm = '@media (prefers-color-scheme: dark)' in nm_content
print(f"  Has dark mode: {has_dm}")
# Find insertion point: after :host block
host_match = re.search(r':host\s*\{', nm_content)
if host_match:
    print(f"  First :host at pos {host_match.start()}, line {nm_content[:host_match.start()].count(chr(10))+1}")
# Check where HAToolsBentoCSS is
bento_match = re.search(r'HAToolsBentoCSS', nm_content)
if bento_match:
    print(f"  HAToolsBentoCSS at pos {bento_match.start()}, line {nm_content[:bento_match.start()].count(chr(10))+1}")
