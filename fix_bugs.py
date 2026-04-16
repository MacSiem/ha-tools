#!/usr/bin/env python3
"""Apply specific bug fixes per file."""
from pathlib import Path
import subprocess

REPO = Path(r"C:\Users\macie\ha-tools-repo\www\community\ha-tools")

def check_syntax(filepath):
    result = subprocess.run(
        ['node', '-e', f'''
const vm = require("vm"); const fs = require("fs");
try {{
  new vm.Script(fs.readFileSync({repr(str(filepath))}, "utf8"));
  console.log("SYNTAX OK");
}} catch(e) {{ console.error("SYNTAX ERROR:", e.message); }}
'''],
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


# ============================================================
# ha-automation-analyzer.js - single-quote → backtick BUG
# ============================================================
print("\n=== ha-automation-analyzer.js ===")
fix_file("ha-automation-analyzer.js", [
    (
        "Fix noExecutionTimeData - single-quote to backtick",
        ": '<div class=\"chart-empty\">${this._t.noExecutionTimeData}</div>'}",
        ': `<div class="chart-empty">${this._t.noExecutionTimeData}</div>`}'
    ),
    (
        "Fix noTriggerData - single-quote to backtick",
        ": '<div class=\"chart-empty\">${this._t.noTriggerData}</div>'}",
        ': `<div class="chart-empty">${this._t.noTriggerData}</div>`}'
    ),
])

# ============================================================
# ha-log-email.js - this._update() → this._render()
# ============================================================
print("\n=== ha-log-email.js ===")
fix_file("ha-log-email.js", [
    (
        "Fix _testSmtp: this._update() → this._render() (line 298)",
        "    this._smtpTesting = true;\n    this._update();",
        "    this._smtpTesting = true;\n    this._render();"
    ),
    (
        "Fix _testSmtp: this._update() → this._render() (line 306)",
        "    this._smtpTesting = false;\n    this._update();",
        "    this._smtpTesting = false;\n    this._render();"
    ),
])

# ============================================================
# ha-entity-renamer.js - BUG: button label not interpolated
# ============================================================
print("\n=== ha-entity-renamer.js ===")
fix_file("ha-entity-renamer.js", [
    (
        "Fix button label: single-quote → backtick for ${t.queue}",
        ': \'<button class="btn btn-sm btn-outline" data-add-single="\' + e.entity_id + \'">+ ${t.queue}</button>\'',
        ': `<button class="btn btn-sm btn-outline" data-add-single="${e.entity_id}">+ ${t.queue}</button>`'
    ),
    (
        "Fix queue empty check: also check _deviceRenameQueue",
        "    if (!this._renameQueue.length) {",
        "    if (!this._renameQueue.length && !Object.keys(this._deviceRenameQueue || {}).length) {"
    ),
])

# ============================================================
# ha-frigate-privacy.js - setActiveTab calls non-existent _render()
# ============================================================
print("\n=== ha-frigate-privacy.js ===")
fix_file("ha-frigate-privacy.js", [
    (
        "Fix setActiveTab: this._render() → this._updateUI()",
        "  setActiveTab(tabId) {\n    this._activeTab = tabId;\n    this._render();\n  }",
        "  setActiveTab(tabId) {\n    this._activeTab = tabId;\n    this._updateUI();\n  }"
    ),
])

# ============================================================
# ha-smart-reports.js - orphaned } in CSS + _setupPaginationListeners never called
# ============================================================
print("\n=== ha-smart-reports.js ===")
# Read first to find the orphaned }
filepath_sr = REPO / "ha-smart-reports.js"
sr_content = filepath_sr.read_text(encoding='utf-8')
# Find and fix the orphaned CSS } (around line 497)
# The pattern is: after @media (max-width: 360px) closing }
# then some rules followed by orphaned }
# We need to read the actual content to find the exact string
# Let's look for the pattern
import re
# Find the orphaned }
# Pattern: a line that is just "}" after what seems like regular CSS rules
# Report says it's after @media (max-width: 360px) block at line 497
# Let's search for the specific pattern
lines = sr_content.split('\n')
for i, line in enumerate(lines, 1):
    if 490 <= i <= 502:
        print(f"  Line {i}: {repr(line)}")

print("\n=== ha-purge-cache.js ===")
# Check current dark mode status
filepath_pc = REPO / "ha-purge-cache.js"
pc_content = filepath_pc.read_text(encoding='utf-8')
dm_match = re.search(r'@media\s*\(prefers-color-scheme:\s*dark\)', pc_content)
if dm_match:
    # Find what's in the dark mode block
    dm_start = dm_match.start()
    dm_end = pc_content.find('\n}\n', dm_start) + 3
    dm_block = pc_content[dm_start:dm_end]
    print(f"  Dark mode block found:\n{dm_block[:300]}")
else:
    print("  No dark mode block found")

# Check for --bento-radius-md and .card CSS
card_matches = [(m.start(), pc_content[m.start():m.start()+200]) for m in re.finditer(r'\.card\s*\{', pc_content)]
print(f"  .card rules: {len(card_matches)}")
for pos, text in card_matches[:3]:
    line_num = pc_content[:pos].count('\n') + 1
    print(f"  Line ~{line_num}: {text[:100]}")
