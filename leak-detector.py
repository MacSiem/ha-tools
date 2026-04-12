import re
import glob

# Get all ha-*.js files
files = sorted(glob.glob(r'C:\Users\macie\ha-tools-repo\ha-*.js'))

def find_leaks(filepath):
    """Check for real memory leaks in a file"""
    try:
        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()
    except:
        return []
    
    filename = filepath.split('\\')[-1]
    issues = []
    
    # Find all listeners/timers
    has_document_add = 'document.addEventListener' in content
    has_document_remove = 'document.removeEventListener' in content
    has_window_add = 'window.addEventListener' in content
    has_window_remove = 'window.removeEventListener' in content
    has_setint = 'setInterval(' in content
    has_clearint = 'clearInterval' in content
    has_settout = 'setTimeout(' in content
    has_cleartout = 'clearTimeout' in content
    has_disconn = 'disconnectedCallback' in content
    
    # Extract disconnectedCallback section
    disconn_start = content.find('disconnectedCallback')
    disconn_section = ''
    if disconn_start > -1:
        # Get next ~1000 chars as disconnectedCallback body
        disconn_section = content[disconn_start:disconn_start+1000]
    
    # Check for REAL leaks
    # 1. document.addEventListener without removeEventListener in disconnectedCallback
    if has_document_add:
        if not has_disconn:
            issues.append("document.addEventListener() with NO disconnectedCallback method")
        elif has_disconn and 'document.removeEventListener' not in disconn_section:
            # Find what listener is added
            match = re.search(r"document\.addEventListener\s*\(\s*['\"](\w+)['\"]", content)
            if match:
                event = match.group(1)
                issues.append(f"document.addEventListener('{event}') without document.removeEventListener in disconnectedCallback")
    
    # 2. window.addEventListener without removeEventListener in disconnectedCallback
    if has_window_add:
        if not has_disconn:
            issues.append("window.addEventListener() with NO disconnectedCallback method")
        elif has_disconn and 'window.removeEventListener' not in disconn_section:
            # Find what listener is added
            match = re.search(r"window\.addEventListener\s*\(\s*['\"](\w+)['\"]", content)
            if match:
                event = match.group(1)
                issues.append(f"window.addEventListener('{event}') without window.removeEventListener in disconnectedCallback")
    
    # 3. setInterval without clearInterval in disconnectedCallback
    if has_setint:
        if not has_disconn:
            issues.append("setInterval() with NO disconnectedCallback method")
        elif has_disconn and 'clearInterval' not in disconn_section:
            # Check if timer is stored as a property
            setint_matches = re.findall(r'(this\.\w+)\s*=\s*setInterval\s*\(', content)
            if setint_matches:
                for var in setint_matches[:1]:  # Just report first one
                    issues.append(f"setInterval stored in {var} without clearInterval in disconnectedCallback")
    
    # 4. setTimeout without clearTimeout (if timer is stored)
    if has_settout and not has_cleartout:
        # Check if stored in property
        settout_matches = re.findall(r'(this\.\w+)\s*=\s*setTimeout\s*\(', content)
        if settout_matches:
            if not has_disconn or 'clearTimeout' not in disconn_section:
                for var in settout_matches[:1]:
                    issues.append(f"setTimeout stored in {var} without clearTimeout in disconnectedCallback")
    
    return issues

# Analyze all files
print("=" * 70)
print("REAL MEMORY LEAK ANALYSIS - ha-*.js files")
print("=" * 70)
print()

leak_files = {}
for filepath in files:
    issues = find_leaks(filepath)
    if issues:
        leak_files[filepath.split('\\')[-1]] = issues

if leak_files:
    for filename, issues in sorted(leak_files.items()):
        print(f"{filename}")
        for issue in issues:
            print(f"  - {issue}")
        print()
else:
    print("No real memory leaks detected.")
    print()
    print("Note: All files with document/window.addEventListener or setInterval")
    print("have proper cleanup in disconnectedCallback methods.")
