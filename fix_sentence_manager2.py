#!/usr/bin/env python3
"""Remove pagination/seededRandom methods from HASentenceManagerEditor (they're in wrong class)."""
from pathlib import Path
import subprocess

FILE = Path(r"C:\Users\macie\ha-tools-repo\www\community\ha-tools\ha-sentence-manager.js")
content = FILE.read_text(encoding='utf-8')

# Find the editor class
editor_start = content.find('\nclass HASentenceManagerEditor extends HTMLElement {')
if editor_start == -1:
    print("[ERROR] Could not find HASentenceManagerEditor class")
    exit(1)

editor_define = "if (!customElements.get('ha-sentence-manager-editor'))"
editor_define_pos = content.find(editor_define)

# Get the editor class body
editor_body = content[editor_start:editor_define_pos]
print(f"[DEBUG] Editor class body length: {len(editor_body)}")
print(f"[DEBUG] Editor class body end (last 200):\n{editor_body[-200:]}")

# The methods to remove from the editor class:
# "  // --- Pagination helper ---\n  _renderPagination..." all the way to last "  }\n\n}"
pagination_marker = "  // --- Pagination helper ---\n"
pagination_start = editor_body.find(pagination_marker)
if pagination_start == -1:
    print("[WARN] Pagination marker not found in editor class body")
    # Try without the comment
    pagination_marker = "  _renderPagination("
    pagination_start = editor_body.find(pagination_marker)

if pagination_start == -1:
    print("[ERROR] Cannot find pagination methods in editor")
else:
    # The methods end right before "}" at the end of editor class body (2 chars before "\n}")
    # editor_body ends with "  }\n\n}" - the last "}" is the class closing
    # Find the end of last method (_seededRandom)
    seeded_end = "      return (h >>> 0) / 4294967296;\n    };\n  }\n"
    seeded_pos = editor_body.find(seeded_end, pagination_start)
    if seeded_pos == -1:
        print("[ERROR] Cannot find end of _seededRandom in editor body")
    else:
        # Remove from pagination_start to end of seededRandom
        remove_start_in_editor = pagination_start
        remove_end_in_editor = seeded_pos + len(seeded_end)

        # What we're removing:
        removed = editor_body[remove_start_in_editor:remove_end_in_editor]
        print(f"[DEBUG] Removing {len(removed)} chars from editor class")

        # Build new editor body without these methods
        new_editor_body = editor_body[:remove_start_in_editor] + editor_body[remove_end_in_editor:]

        # Replace in full content
        new_content = content[:editor_start] + new_editor_body + content[editor_define_pos:]

        FILE.write_text(new_content, encoding='utf-8')
        print("[FIX] Removed pagination/seededRandom from HASentenceManagerEditor")

# Syntax check
result = subprocess.run(
    ['node', '-e', r'''
const vm = require("vm"); const fs = require("fs");
try {
  new vm.Script(fs.readFileSync("C:\\Users\\macie\\ha-tools-repo\\www\\community\\ha-tools\\ha-sentence-manager.js", "utf8"));
  console.log("SYNTAX OK");
} catch(e) { console.error("SYNTAX ERROR:", e.message); }
'''],
    capture_output=True, text=True
)
print("Node syntax check:", result.stdout.strip() or result.stderr.strip())

# Verify methods count
result2 = subprocess.run(
    ['node', '-e', r'''
const fs = require("fs");
const c = fs.readFileSync("C:\\Users\\macie\\ha-tools-repo\\www\\community\\ha-tools\\ha-sentence-manager.js", "utf8");
const rp = (c.match(/_renderPagination/g) || []).length;
const pi = (c.match(/_paginateItems/g) || []).length;
const sr = (c.match(/_seededRandom/g) || []).length;
console.log("_renderPagination occurrences:", rp, "(should be 1)");
console.log("_paginateItems occurrences:", pi, "(should be 1)");
console.log("_seededRandom occurrences:", sr, "(should be 1)");
'''],
    capture_output=True, text=True
)
print(result2.stdout.strip())
