import re

print("=" * 80)
print("MEMORY LEAK VERIFICATION - DETAILED ANALYSIS")
print("=" * 80)
print()

# ===== LEAK 1: ha-data-exporter.js =====
print("LEAK 1: ha-data-exporter.js")
print("-" * 80)

with open(r'C:\Users\macie\ha-tools-repo\ha-data-exporter.js', 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

# Find where _snapshotTimer is set to setInterval
setint_section = content[content.find('_startAutoSnapshot'):content.find('_startAutoSnapshot')+500]
print("setInterval call in _startAutoSnapshot():")
print(setint_section)
print()

# Find disconnectedCallback
disconn_section = content[content.find('disconnectedCallback'):content.find('disconnectedCallback')+300]
print("disconnectedCallback():")
print(disconn_section)
print()

if 'clearInterval' in disconn_section and '_snapshotTimer' in disconn_section:
    print("VERDICT: clearInterval IS properly called in disconnectedCallback")
elif '_stopAutoSnapshot' in disconn_section:
    print("VERDICT: disconnectedCallback calls _stopAutoSnapshot()")
    # Now check what _stopAutoSnapshot does
    stop_section = content[content.find('_stopAutoSnapshot'):content.find('_stopAutoSnapshot')+300]
    print("\n_stopAutoSnapshot implementation:")
    print(stop_section)
    if 'clearInterval' in stop_section:
        print("\nVERDICT: LEAK IS FIXED - clearInterval is in _stopAutoSnapshot")
    else:
        print("\nVERDICT: REAL LEAK - _stopAutoSnapshot does NOT call clearInterval")
else:
    print("VERDICT: REAL LEAK - disconnectedCallback does NOT clear _snapshotTimer")

print()
print()

# ===== LEAK 2: ha-trace-viewer.js =====
print("LEAK 2: ha-trace-viewer.js")
print("-" * 80)

with open(r'C:\Users\macie\ha-tools-repo\ha-trace-viewer.js', 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

# Find document.addEventListener
add_pos = content.find("document.addEventListener('click'")
if add_pos > -1:
    add_context = content[max(0, add_pos-100):min(len(content), add_pos+250)]
    print("document.addEventListener('click') context:")
    print(add_context)
    print()

# Find disconnectedCallback
disconn_pos = content.find('disconnectedCallback')
if disconn_pos > -1:
    disconn_section = content[disconn_pos:min(len(content), disconn_pos+400)]
    print("disconnectedCallback():")
    print(disconn_section)
    print()

if 'document.removeEventListener' in disconn_section:
    print("VERDICT: document.removeEventListener IS called in disconnectedCallback")
else:
    print("VERDICT: REAL LEAK - document.removeEventListener NOT in disconnectedCallback")
    print("The click listener added to document is never removed!")
