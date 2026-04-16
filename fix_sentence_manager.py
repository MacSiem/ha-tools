#!/usr/bin/env python3
"""Fix ha-sentence-manager.js structural bugs:
1. Remove _sanitize literal text from HTML template in editor connectedCallback
2. Move _renderPagination, _paginateItems, _setupPaginationListeners, _seededRandom
   from HASentenceManagerEditor to HASentenceManager
"""
from pathlib import Path

FILE = Path(r"C:\Users\macie\ha-tools-repo\www\community\ha-tools\ha-sentence-manager.js")

content = FILE.read_text(encoding='utf-8')

# Fix 1: Remove _sanitize literal text from the HTML template string in connectedCallback
# The literal text that should NOT be in the HTML:
bad_sanitize = """  _sanitize(str) {
    if (!str) return str;
    try { return decodeURIComponent(escape(str)); } catch(e) { return str; }
  }
        """
good_sanitize = "        "

if bad_sanitize in content:
    content = content.replace(bad_sanitize, good_sanitize)
    print("[FIX] Removed _sanitize literal from HTML template")
else:
    print("[WARN] _sanitize literal not found in template - may already be fixed")

# Fix 2: Fix broken pagination render calls in _setupPaginationListeners
bad_render1 = "          this._render ? this._render() : (this.render ? this.render() : this.renderCard());\n        }"
good_render1 = "          this._render();\n        }"
if bad_render1 in content:
    content = content.replace(bad_render1, good_render1)
    print("[FIX] Fixed pagination render call (btn click)")

bad_render2 = "        this._render ? this._render() : (this.render ? this.render() : this.renderCard());\n      }"
good_render2 = "        this._render();\n      }"
if bad_render2 in content:
    content = content.replace(bad_render2, good_render2)
    print("[FIX] Fixed pagination render call (select change)")

# Fix 3: Move methods from HASentenceManagerEditor to HASentenceManager
# Find the block to move (pagination + seededRandom in editor)
import re

# The methods block in editor (between "// --- Pagination helper ---" and closing "}")
editor_methods_marker = """  // --- Pagination helper ---
  _renderPagination(tabName, totalItems) {"""

if editor_methods_marker in content:
    # Find start of the methods block
    start = content.find(editor_methods_marker)

    # Find the end: the last "}" before "if (!customElements.get('ha-sentence-manager-editor')"
    editor_define = "if (!customElements.get('ha-sentence-manager-editor'))"
    editor_define_pos = content.find(editor_define)

    # The methods block ends with the "}" on the line before the define
    # Find the closing "}" of editor class
    # It's the "}" followed by newlines then the customElements.define
    end_search = content.rfind('\n}\n\n' + editor_define[:20], start, editor_define_pos + 50)
    if end_search == -1:
        # Try alternative - find "}\n\nif (!customElements.get('ha-sentence-manager-editor')"
        end_search = content.rfind('\n}', start, editor_define_pos)

    methods_block = content[start:end_search + 1]  # includes the trailing \n}
    print(f"[DEBUG] Found methods block: {len(methods_block)} chars")

    # Extract just the methods (without the trailing "}" of the editor class)
    # The methods end at the last "}" that's part of _seededRandom
    # We want to extract from "// --- Pagination helper ---" to end of _seededRandom (before editor class closing })

    # Find where _seededRandom ends
    seeded_end_marker = "      return (h >>> 0) / 4294967296;\n    };\n  }\n\n}"
    seeded_pos = content.find(seeded_end_marker, start)
    if seeded_pos != -1:
        methods_to_move = content[start:seeded_pos + len(seeded_end_marker) - 1]  # exclude last "}"
        print(f"[DEBUG] Methods to move ({len(methods_to_move)} chars): {methods_to_move[:100]}...")

        # Remove from editor class
        content = content.replace("\n\n" + methods_to_move + "\n\n}", "\n\n}")
        print("[FIX] Removed methods from HASentenceManagerEditor")

        # Insert into HASentenceManager before setActiveTab
        insert_before = "  setActiveTab(tabId) {"
        # Convert methods to main class (already in right indentation)
        main_methods = "\n\n  // --- Pagination helpers (moved from editor) ---\n  _renderPagination"
        # Actually just insert the raw block before setActiveTab
        methods_with_newline = "\n\n" + methods_to_move
        # Remove "// --- Pagination helper ---\n" prefix and replace with main class version
        content = content.replace(insert_before, methods_to_move + "\n\n" + insert_before)
        print("[FIX] Added methods to HASentenceManager")
    else:
        print("[ERROR] Could not find _seededRandom end marker")
else:
    print("[INFO] Editor methods marker not found - may already be fixed")

FILE.write_text(content, encoding='utf-8')
print("\n[DONE] Wrote fixed ha-sentence-manager.js")

# Quick validation: check method counts
import subprocess
result = subprocess.run(
    ['node', '-e', 'const vm = require("vm"); const fs = require("fs"); try { new vm.Script(fs.readFileSync(String.raw`C:\\Users\\macie\\ha-tools-repo\\www\\community\\ha-tools\\ha-sentence-manager.js`, "utf8")); console.log("SYNTAX OK"); } catch(e) { console.error("SYNTAX ERROR:", e.message); }'],
    capture_output=True, text=True
)
print("Node syntax check:", result.stdout.strip() or result.stderr.strip())
