#!/usr/bin/env python3
"""Scan and fix /config/*.yaml for BOM, mojibake, and encoding issues.
Modes:
  scan (default) - scan only, write results to JSON
  fix            - backup + fix all fixable issues
Output: /config/www/encoding_scan_result.json
Called via shell_command from HA."""

import os, json, sys, glob, time, shutil

CONFIG_DIR = "/config"
OUTPUT_FILE = "/config/www/encoding_scan_result.json"

BOM = b'\xef\xbb\xbf'

# UTF-8 bytes misread as Latin-1/CP1252 => correct char
# Polish
MOJIBAKE_STR = {
    '\u00c4\u0085': '\u0105',  # ą
    '\u00c4\u0087': '\u0107',  # ć
    '\u00c4\u0099': '\u0119',  # ę
    '\u00c5\u0082': '\u0142',  # ł
    '\u00c5\u0084': '\u0144',  # ń
    '\u00c3\u00b3': '\u00f3',  # ó
    '\u00c5\u009b': '\u015b',  # ś
    '\u00c5\u00ba': '\u017a',  # ź
    '\u00c5\u00bc': '\u017c',  # ż
    '\u00c4\u0084': '\u0104',  # Ą
    '\u00c4\u0086': '\u0106',  # Ć
    '\u00c4\u0098': '\u0118',  # Ę
    '\u00c5\u0081': '\u0141',  # Ł
    '\u00c5\u0083': '\u0143',  # Ń
    '\u00c3\u0093': '\u00d3',  # Ó
    '\u00c5\u009a': '\u015a',  # Ś
    '\u00c5\u00b9': '\u0179',  # Ź
    '\u00c5\u00bb': '\u017b',  # Ż
    # German
    '\u00c3\u00a4': '\u00e4',  # ä
    '\u00c3\u00b6': '\u00f6',  # ö
    '\u00c3\u00bc': '\u00fc',  # ü
    '\u00c3\u009f': '\u00df',  # ß
    '\u00c3\u0084': '\u00c4',  # Ä
    '\u00c3\u0096': '\u00d6',  # Ö
    '\u00c3\u009c': '\u00dc',  # Ü
    # French / Spanish
    '\u00c3\u00a9': '\u00e9',  # é
    '\u00c3\u00a8': '\u00e8',  # è
    '\u00c3\u00aa': '\u00ea',  # ê
    '\u00c3\u00ab': '\u00eb',  # ë
    '\u00c3\u00a0': '\u00e0',  # à
    '\u00c3\u00a2': '\u00e2',  # â
    '\u00c3\u00ae': '\u00ee',  # î
    '\u00c3\u00b1': '\u00f1',  # ñ
    '\u00c3\u00ba': '\u00fa',  # ú
    # Symbols
    '\u00c2\u00b0': '\u00b0',  # °
    '\u00c2\u00a3': '\u00a3',  # £
    '\u00c2\u00a7': '\u00a7',  # §
    '\u00c2\u00ab': '\u00ab',  # «
    '\u00c2\u00bb': '\u00bb',  # »
    '\u00c2\u00b2': '\u00b2',  # ²
    '\u00c2\u00b3': '\u00b3',  # ³
    '\u00c2\u00bd': '\u00bd',  # ½
    # Typographic
    '\u00e2\u0080\u0093': '\u2013',  # – en dash
    '\u00e2\u0080\u0094': '\u2014',  # — em dash
    '\u00e2\u0080\u009c': '\u201c',  # "
    '\u00e2\u0080\u009d': '\u201d',  # "
    '\u00e2\u0080\u0099': '\u2019',  # '
    '\u00e2\u0080\u00a6': '\u2026',  # …
    '\u00e2\u0080\u00a2': '\u2022',  # •
}

# Emoji: 4-byte UTF-8 misread as Latin-1 creates 4 high chars
EMOJI_MOJIBAKE = {
    '\u00f0\u009f\u0094\u0092': '\U0001f512',  # 🔒
    '\u00f0\u009f\u0094\u00a5': '\U0001f525',  # 🔥
    '\u00f0\u009f\u0091\u008d': '\U0001f44d',  # 👍
    '\u00f0\u009f\u0098\u008a': '\U0001f60a',  # 😊
    '\u00f0\u009f\u008e\u00af': '\U0001f3af',  # 🎯
    '\u00f0\u009f\u009a\u0080': '\U0001f680',  # 🚀
    '\u00f0\u009f\u0092\u00a1': '\U0001f4a1',  # 💡
    '\u00f0\u009f\u0094\u0094': '\U0001f514',  # 🔔
    '\u00f0\u009f\u008f\u00a0': '\U0001f3e0',  # 🏠
    '\u00f0\u009f\u0094\u008c': '\U0001f50c',  # 🔌
    '\u00f0\u009f\u0092\u00bb': '\U0001f4bb',  # 💻
    '\u00f0\u009f\u008e\u00b5': '\U0001f3b5',  # 🎵
    '\u00f0\u009f\u009b\u00a1': '\U0001f6e1',  # 🛡
    '\u00f0\u009f\u0094\u008d': '\U0001f50d',  # 🔍
    '\u00f0\u009f\u0097\u0093': '\U0001f5d3',  # 🗓
    '\u00f0\u009f\u0097\u0082': '\U0001f5c2',  # 🗂
    '\u00f0\u009f\u009a\u00a8': '\U0001f6a8',  # 🚨
    '\u00f0\u009f\u00a7\u00b9': '\U0001f9f9',  # 🧹
    '\u00f0\u009f\u008d\u00bc': '\U0001f37c',  # 🍼
}

ALL_MOJIBAKE = {**MOJIBAKE_STR, **EMOJI_MOJIBAKE}


def detect_mojibake(text):
    """Returns list of (bad, good, line, col) tuples."""
    hits = []
    for lineno, line in enumerate(text.splitlines(), 1):
        for bad, good in ALL_MOJIBAKE.items():
            pos = 0
            while True:
                idx = line.find(bad, pos)
                if idx < 0:
                    break
                context = line[max(0,idx-15):idx+len(bad)+15].strip()
                hits.append({
                    'line': lineno,
                    'col': idx,
                    'bad': bad,
                    'good': good,
                    'context': context
                })
                pos = idx + len(bad)
    return hits


def fix_text(text):
    """Replace all mojibake sequences in text."""
    for bad, good in ALL_MOJIBAKE.items():
        text = text.replace(bad, good)
    return text


def scan_file(filepath):
    """Scan a single file. Returns list of issues."""
    issues = []
    rel = os.path.relpath(filepath, CONFIG_DIR)
    try:
        raw = open(filepath, 'rb').read()
    except Exception as e:
        return [{'file': rel, 'line': 0, 'issue': 'read_error', 'detail': str(e)}]

    # BOM check
    has_bom = raw[:3] == BOM
    if has_bom:
        issues.append({'file': rel, 'line': 1, 'issue': 'bom',
                       'detail': 'BOM (EF BB BF) at start of file',
                       'fixable': True})

    # Try decode
    try:
        text = raw.decode('utf-8-sig')
    except UnicodeDecodeError as e:
        issues.append({'file': rel, 'line': 0, 'issue': 'invalid_utf8',
                       'detail': f'Cannot decode as UTF-8: {e}', 'fixable': False})
        return issues

    # Mojibake check
    hits = detect_mojibake(text)
    for h in hits:
        issues.append({
            'file': rel, 'line': h['line'], 'issue': 'mojibake',
            'detail': f'"{repr(h["bad"])}" should be "{h["good"]}"',
            'context': h['context'],
            'fixable': True
        })

    # Null bytes
    if b'\x00' in raw:
        pos = raw.index(b'\x00')
        issues.append({'file': rel, 'line': 0, 'issue': 'null_byte',
                       'detail': f'Null byte at offset {pos}', 'fixable': False})

    return issues


def fix_file(filepath, issues):
    """Fix BOM and mojibake in a single file. Creates .bak backup."""
    rel = os.path.relpath(filepath, CONFIG_DIR)
    fixed_anything = False

    raw = open(filepath, 'rb').read()

    # Remove BOM
    if raw[:3] == BOM:
        raw = raw[3:]
        fixed_anything = True

    # Decode and fix mojibake
    try:
        text = raw.decode('utf-8')
    except UnicodeDecodeError:
        return False

    new_text = fix_text(text)
    if new_text != text:
        fixed_anything = True

    if fixed_anything:
        # Backup
        bak_path = filepath + '.encoding-bak'
        if not os.path.exists(bak_path):
            shutil.copy2(filepath, bak_path)
        # Write fixed file (UTF-8, no BOM)
        with open(filepath, 'w', encoding='utf-8', newline='') as f:
            f.write(new_text)

    return fixed_anything


def collect_files():
    """Collect all scannable files."""
    patterns = [
        os.path.join(CONFIG_DIR, '*.yaml'),
        os.path.join(CONFIG_DIR, '*.yml'),
        os.path.join(CONFIG_DIR, 'packages', '**', '*.yaml'),
        os.path.join(CONFIG_DIR, 'packages', '**', '*.yml'),
        os.path.join(CONFIG_DIR, 'integrations', '**', '*.yaml'),
        os.path.join(CONFIG_DIR, 'integrations', '**', '*.yml'),
        os.path.join(CONFIG_DIR, 'python_scripts', '*.py'),
        os.path.join(CONFIG_DIR, 'www', '**', '*.js'),
    ]
    files = set()
    for pat in patterns:
        files.update(glob.glob(pat, recursive=True))
    # Important standalone files
    for f in ['secrets.yaml', 'known_devices.yaml', 'customize.yaml']:
        p = os.path.join(CONFIG_DIR, f)
        if os.path.exists(p):
            files.add(p)
    return sorted(files)


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'scan'
    files = collect_files()
    results = []
    scanned = 0
    fixed_count = 0

    for filepath in files:
        if not os.path.isfile(filepath):
            continue
        file_issues = scan_file(filepath)
        scanned += 1

        if mode == 'fix':
            fixable = [i for i in file_issues if i.get('fixable')]
            if fixable:
                ok = fix_file(filepath, fixable)
                if ok:
                    fixed_count += 1
                    # Re-scan after fix to show remaining issues
                    file_issues = scan_file(filepath)

        results.extend(file_issues)

    output = {
        'timestamp': int(time.time()),
        'mode': mode,
        'scanned_files': scanned,
        'total_issues': len(results),
        'fixed_files': fixed_count,
        'issues': results
    }
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"[{mode}] Scanned {scanned} files, {len(results)} issues, fixed {fixed_count} files -> {OUTPUT_FILE}")


if __name__ == '__main__':
    main()