import re

print("=" * 80)
print("DETAILED MEMORY LEAK VERIFICATION")
print("=" * 80)
print()

# ===== LEAK 1: ha-data-exporter.js =====
print("LEAK 1: ha-data-exporter.js")
print("-" * 80)

with open(r'C:\Users\macie\ha-tools-repo\ha-data-exporter.js', 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

# Find setInterval with context
setint_pos = content.find('this._snapshotTimer')
if setint_pos > -1:
    # Find the actual setInterval assignment
    setint_line_start = content.rfind('\n', 0, setint_pos) + 1
    setint_line_end = content.find('\n', setint_pos)
    print("Line with this._snapshotTimer assignment:")
    print(content[setint_line_start:setint_line_end])
    print()
    
    # Find the setInterval call in _startAutoSnapshot
    start_match_pos = content.find('_startAutoSnapshot')
    if start_match_pos > -1:
        section = content[start_match_pos:start_match_pos+500]
        print("_startAutoSnapshot method:")
        print(section[:300])
        print()

# Find _stopAutoSnapshot
stop_match_pos = content.find('_stopAutoSnapshot')
if stop_match_pos > -1:
    section = content[stop_match_pos:stop_match_pos+200]
    print("_stopAutoSnapshot method:")
    print(section)
    print()

# Find disconnectedCallback
disconn_match_pos = content.find('disconnectedCallback')
if disconn_match_pos > -1:
    section = content[disconn_match_pos:disconn_match_pos+300]
    print("disconnectedCallback in ha-data-exporter.js:")
    print(section)
    
    # Check if clearInterval is called
    if 'clearInterval' in section:
        print("\n✓ clearInterval IS called in disconnectedCallback")
    else:
        print("\n✗ ISSUE: clearInterval NOT called in disconnectedCallback")
print()
print()

# ===== LEAK 2: ha-trace-viewer.js =====
print("LEAK 2: ha-trace-viewer.js")
print("-" * 80)

with open(r'C:\Users\macie\ha-tools-repo\ha-trace-viewer.js', 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

# Find document.addEventListener('click')
doc_add_pos = content.find("document.addEventListener('click'")
if doc_add_pos == -1:
    doc_add_pos = content.find('document.addEventListener("click"')
    
if doc_add_pos > -1:
    # Get context
    start_pos = max(0, doc_add_pos - 100)
    end_pos = min(len(content), doc_add_pos + 200)
    
    print("Context around document.addEventListener('click'):")
    print(content[start_pos:end_pos])
    print()

# Find disconnectedCallback
disconn_match_pos = content.find('disconnectedCallback')
if disconn_match_pos > -1:
    section = content[disconn_match_pos:disconn_match_pos+400]
    print("disconnectedCallback in ha-trace-viewer.js:")
    print(section)
    
    # Check if document.removeEventListener is called
    if 'document.removeEventListener' in section:
        print("\n✓ document.removeEventListener IS called in disconnectedCallback")
    else:
        print("\n✗ ISSUE: document.removeEventListener NOT called in disconnectedCallback")
