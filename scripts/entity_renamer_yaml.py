#!/usr/bin/env python3
"""
Entity Renamer YAML Helper
Scans and replaces entity references in HA config YAML files.
Used by ha-entity-renamer tool via shell_command.
"""
import sys, os, json, shutil
from datetime import datetime

CONFIG_DIR = '/config'
OUTPUT_DIR = '/config/www'
SKIP_DIRS = {'.storage', 'custom_components', 'deps', '.git', 'tts',
             'backups', 'www', '__pycache__', '.cloud', 'blueprints',
             'node_modules', '.venv'}


def scan(search_terms_csv):
    """Scan YAML files for entity references. Write results to JSON."""
    terms = [t.strip() for t in search_terms_csv.split(',') if t.strip()]
    results = {}

    for root, dirs, files in os.walk(CONFIG_DIR):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for fname in files:
            if not fname.endswith(('.yaml', '.yml')):
                continue
            fpath = os.path.join(root, fname)
            rel = os.path.relpath(fpath, CONFIG_DIR)
            try:
                with open(fpath, 'r', encoding='utf-8') as f:
                    lines = f.readlines()
                file_matches = {}
                for term in terms:
                    matched_lines = []
                    for i, line in enumerate(lines):
                        if term in line:
                            matched_lines.append({
                                'line': i + 1,
                                'text': line.rstrip()[:200]
                            })
                    if matched_lines:
                        file_matches[term] = {
                            'count': len(matched_lines),
                            'lines': matched_lines[:15]
                        }
                if file_matches:
                    results[rel] = file_matches
            except Exception:
                pass

    output = {
        'timestamp': datetime.now().isoformat(),
        'terms': terms,
        'files': results,
        'total_files': len(results),
        'total_matches': sum(
            sum(m['count'] for m in f.values())
            for f in results.values()
        )
    }

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    out_path = os.path.join(OUTPUT_DIR, 'entity_renamer_scan.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(json.dumps({'status': 'ok', 'files': len(results)}))


def replace(file_path, old_id, new_id):
    """Replace entity references in a YAML file. Creates backup first."""
    fpath = os.path.join(CONFIG_DIR, file_path)

    if not os.path.exists(fpath):
        result = {'status': 'error', 'file': file_path,
                  'error': f'File not found: {file_path}'}
    else:
        try:
            ts = datetime.now().strftime('%Y%m%d_%H%M%S')
            backup_path = fpath + f'.renamer_bak_{ts}'
            shutil.copy2(fpath, backup_path)

            with open(fpath, 'r', encoding='utf-8') as f:
                content = f.read()

            count = content.count(old_id)
            new_content = content.replace(old_id, new_id)

            with open(fpath, 'w', encoding='utf-8') as f:
                f.write(new_content)

            result = {
                'status': 'ok',
                'file': file_path,
                'old_id': old_id,
                'new_id': new_id,
                'replacements': count,
                'backup': os.path.relpath(backup_path, CONFIG_DIR)
            }
        except Exception as e:
            result = {'status': 'error', 'file': file_path, 'error': str(e)}

    results_path = os.path.join(OUTPUT_DIR, 'entity_renamer_result.json')
    results_list = []
    if os.path.exists(results_path):
        try:
            with open(results_path, 'r', encoding='utf-8') as f:
                results_list = json.load(f)
            if not isinstance(results_list, list):
                results_list = []
        except Exception:
            results_list = []
    results_list.append(result)
    with open(results_path, 'w', encoding='utf-8') as f:
        json.dump(results_list, f, ensure_ascii=False, indent=2)

    print(json.dumps(result))


def clear_results():
    """Clear previous result files."""
    for fname in ['entity_renamer_scan.json', 'entity_renamer_result.json']:
        fpath = os.path.join(OUTPUT_DIR, fname)
        if os.path.exists(fpath):
            os.remove(fpath)
    print(json.dumps({'status': 'ok', 'cleared': True}))


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Usage: scan <terms> | replace <file> <old> <new> | clear'}))
        sys.exit(1)

    mode = sys.argv[1]
    if mode == 'scan' and len(sys.argv) >= 3:
        scan(sys.argv[2])
    elif mode == 'replace' and len(sys.argv) >= 5:
        replace(sys.argv[2], sys.argv[3], sys.argv[4])
    elif mode == 'clear':
        clear_results()
    else:
        print(json.dumps({'error': f'Unknown mode or missing args: {mode}'}))
        sys.exit(1)
