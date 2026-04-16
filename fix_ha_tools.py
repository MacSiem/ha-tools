#!/usr/bin/env python3
"""
Bulk fix script for HA Tools - applies dark mode, card CSS, and common fixes across all JS files.
TIER 0 approach - zero LLM cost.
"""
import re
import os
import sys
from pathlib import Path

REPO = Path(r"C:\Users\macie\ha-tools-repo\www\community\ha-tools")

DARK_MODE_BLOCK = """
@media (prefers-color-scheme: dark) {
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

# Files to process - list of (filename, fixes_to_apply)
FILES = [
    # (filename, [list of fixes])
    "ha-automation-analyzer.js",
    "ha-baby-tracker.js",
    "ha-backup-manager.js",
    "ha-chore-tracker.js",
    "ha-data-exporter.js",
    "ha-device-health.js",
    "ha-encoding-fixer.js",
    "ha-energy-email.js",
    "ha-energy-insights.js",
    "ha-energy-optimizer.js",
    "ha-entity-renamer.js",
    "ha-frigate-privacy.js",
    "ha-log-email.js",
    "ha-network-map.js",
    "ha-purge-cache.js",
    "ha-security-check.js",
    "ha-sentence-manager.js",
    "ha-smart-reports.js",
    "ha-storage-monitor.js",
    "ha-trace-viewer.js",
    "ha-vacuum-water-monitor.js",
    "ha-yaml-checker.js",
]


def fix_color_scheme(content):
    """Fix color-scheme: light !important -> color-scheme: light dark"""
    fixed = content.replace(
        'color-scheme: light !important;',
        'color-scheme: light dark;'
    )
    return fixed


def has_correct_dark_mode(content):
    """Check if file has correct dark mode with --bento-* tokens"""
    dm_match = re.search(
        r'@media\s*\(prefers-color-scheme:\s*dark\).*?:host\s*\{([^}]*)\}',
        content, re.DOTALL
    )
    if not dm_match:
        return False
    inner = dm_match.group(1)
    # Check if it uses --bento-* tokens (not old --bg/--ca/etc)
    return '--bento-card' in inner or '--bento-bg' in inner


def fix_wrong_dark_mode_tokens(content, filename):
    """Replace dark mode blocks that use old tokens (--bg, --ca, etc.) with correct --bento-* ones"""
    # Pattern: @media (prefers-color-scheme: dark) { :host { --bg/--ca/--tx/etc } }
    # These appear in energy-email, energy-insights, energy-optimizer, purge-cache
    old_dark_mode_patterns = [
        # Pattern from energy-email / energy-insights / energy-optimizer
        r'@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:host\s*\{\s*--bg:[^}]+--ca:[^}]+\}\s*\}',
        # Pattern from purge-cache (--pc-* vars)
        r'@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:host\s*\{[^}]*--pc-[^}]+\}\s*\}',
    ]

    result = content
    for pattern in old_dark_mode_patterns:
        m = re.search(pattern, result, re.DOTALL)
        if m:
            result = result[:m.start()] + DARK_MODE_BLOCK + result[m.end():]
            print(f"  [FIX] Replaced broken dark mode block in {filename}")
            return result
    return result


def fix_missing_dark_mode(content, filename):
    """Add dark mode block if completely missing"""
    if '@media (prefers-color-scheme: dark)' in content:
        return content

    # Find a good insertion point - after the :host block or after HAToolsBentoCSS import
    # Strategy: insert before the closing </style> or before first non-host CSS rule
    # We insert after the last :host {} block in the style section

    # Find insertion point: after the last occurrence of closing brace of :host block
    # This is tricky - let's find it by locating the HAToolsBentoCSS line and the style content

    # Simpler: find the comment marker or a known pattern
    if '/* === DARK MODE ===' in content:
        # Replace the empty dark mode comment with the actual block
        result = content.replace(
            '/* === DARK MODE ===',
            DARK_MODE_BLOCK + '\n/* === DARK MODE ADDED - old comment below ===',
            1  # only first occurrence
        )
        print(f"  [FIX] Added dark mode block at comment marker in {filename}")
        return result

    # Find the :host block and insert dark mode after it
    # Look for the pattern after HAToolsBentoCSS import line

    # Strategy: find bento CSS style block start and insert dark mode before the first .card rule
    # Find 'window.HAToolsBentoCSS' in CSS template literals
    match = re.search(r'\$\{window\.HAToolsBentoCSS[^}]*\}', content)
    if not match:
        print(f"  [SKIP] Cannot find insertion point for dark mode in {filename}")
        return content

    # Find the first :host block after this point
    pos = match.end()
    host_match = re.search(r'(:host\s*\{[^}]*\})', content[pos:], re.DOTALL)
    if not host_match:
        print(f"  [SKIP] Cannot find :host block for dark mode insertion in {filename}")
        return content

    # Insert dark mode after the :host block
    host_end = pos + host_match.end()
    result = content[:host_end] + '\n' + DARK_MODE_BLOCK + content[host_end:]
    print(f"  [FIX] Added dark mode block after :host in {filename}")
    return result


def fix_dark_mode(content, filename):
    """Main function to fix dark mode issues"""
    # Step 1: Fix wrong tokens
    if has_correct_dark_mode(content):
        # Already has correct dark mode - check for color-scheme issue
        result = fix_color_scheme(content)
        if result != content:
            print(f"  [FIX] Fixed color-scheme: light !important in {filename}")
        return result

    # Step 2: Check for broken dark mode (wrong tokens) and replace
    result = fix_wrong_dark_mode_tokens(content, filename)
    if result != content:
        return fix_color_scheme(result)

    # Step 3: Missing dark mode - add it
    result = fix_missing_dark_mode(content, filename)
    return fix_color_scheme(result)


def fix_bento_radius_sm_duplicate(content, filename):
    """Fix duplicate --bento-radius-sm: 16px followed by --bento-radius-sm: 10px"""
    # Remove the first (wrong) occurrence when followed by the correct one
    # Pattern: --bento-radius-sm: 16px;\n  --bento-radius-sm: 10px;
    old = '--bento-radius-sm: 16px;\n    --bento-radius-sm: 10px;'
    new = '--bento-radius-sm: 10px;'
    if old in content:
        result = content.replace(old, new)
        print(f"  [FIX] Removed duplicate --bento-radius-sm: 16px in {filename}")
        return result

    # Also try with 2-space indent
    old2 = '--bento-radius-sm: 16px;\n  --bento-radius-sm: 10px;'
    new2 = '--bento-radius-sm: 10px;'
    if old2 in content:
        result = content.replace(old2, new2)
        print(f"  [FIX] Removed duplicate --bento-radius-sm: 16px (2sp) in {filename}")
        return result

    return content


def process_file(filename):
    """Process a single file applying all applicable fixes"""
    filepath = REPO / filename
    if not filepath.exists():
        print(f"[ERROR] File not found: {filepath}")
        return False

    content = filepath.read_text(encoding='utf-8')
    original = content

    print(f"\nProcessing: {filename}")

    # Apply fixes
    content = fix_dark_mode(content, filename)
    content = fix_bento_radius_sm_duplicate(content, filename)

    if content != original:
        filepath.write_text(content, encoding='utf-8')
        print(f"  [SAVED] {filename}")
        return True
    else:
        print(f"  [NOCHANGE] {filename}")
        return False


def main():
    changed = []
    unchanged = []
    errors = []

    for filename in FILES:
        try:
            if process_file(filename):
                changed.append(filename)
            else:
                unchanged.append(filename)
        except Exception as e:
            print(f"[ERROR] {filename}: {e}")
            errors.append((filename, str(e)))

    print(f"\n{'='*60}")
    print(f"SUMMARY: {len(changed)} changed, {len(unchanged)} unchanged, {len(errors)} errors")
    print(f"Changed: {', '.join(changed)}")
    if errors:
        print(f"Errors: {errors}")

    return 0


if __name__ == '__main__':
    sys.exit(main())
