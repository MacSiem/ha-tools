#!/usr/bin/env python3
"""
Post-audit verifier: reads REAL_ISSUES.md, flags likely-false-positive findings.

Checks:
1. For Critical XSS findings: does the cited line actually contain ``innerHTML``,
   ``outerHTML``, ``insertAdjacentHTML``, or a template literal `${` interpolation?
   If not, flag as suspicious.
2. For "unescaped" findings: is the interpolated value already wrapped in `_esc(`
   or `_haToolsEsc(`? If so, flag as suspicious.
3. For hardcoded-color findings marked Critical: downgrade suggestion (color is
   cosmetic, not security).
4. For findings with "line ~X" fuzzy numbers: flag low confidence.

Usage:
  python3 audit-gemma/verify_findings.py audit-gemma/REAL_ISSUES.md

Prints a report to stdout; exits 0 regardless (informational).
"""
import os
import re
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FINDING_RE = re.compile(
    r'^- \*\*Lines?\s+~?([\d\s,~\-]+)\*\*\s+[—-]\s+(.+)$',
    re.MULTILINE,
)
HEADING_RE = re.compile(r'^### (\S+\.js)', re.MULTILINE)
SEVERITY_RE = re.compile(r'^- \*\*Severity:\*\*\s+(\S+)', re.MULTILINE)

COLOR_CRITICAL_TRIGGERS = [
    'hardcoded color', 'non-bento', 'hardcoded colour',
]


def parse_line_spec(spec: str):
    """Turn '44, 56, 83' or '44-56' or '~240, ~400' into list of int line numbers
    (best-effort; returns [] on inscrutable input)."""
    out = []
    for tok in spec.replace('~', '').replace(' ', '').split(','):
        if '-' in tok:
            try:
                a, b = tok.split('-', 1)
                out.append(int(a))
                out.append(int(b))
            except ValueError:
                continue
        else:
            try:
                out.append(int(tok))
            except ValueError:
                continue
    return out


def load_file(name: str):
    path = os.path.join(REPO_ROOT, name)
    if not os.path.exists(path):
        return None
    with open(path, 'rb') as f:
        data = f.read()
    return data.decode('utf-8', errors='replace').splitlines()


def verify(issues_md: str) -> list:
    warnings = []
    with open(issues_md, 'r', encoding='utf-8') as f:
        content = f.read()
    # Split by file heading
    blocks = re.split(r'(?=^### )', content, flags=re.MULTILINE)
    for blk in blocks:
        m_head = HEADING_RE.search(blk)
        if not m_head:
            continue
        fname = m_head.group(1)
        lines = load_file(fname)
        if lines is None:
            continue
        # Iterate findings
        for m in FINDING_RE.finditer(blk):
            line_spec, desc = m.group(1).strip(), m.group(2).strip()
            # Severity of this finding: look backward for nearest Severity: line
            # Simple heuristic: look at the text from this match until next finding
            tail = blk[m.end():m.end() + 200]
            sev_m = re.search(r'Severity:\*\*\s+(\S+)', tail)
            severity = sev_m.group(1) if sev_m else 'Unknown'
            # Parse lines
            line_nums = parse_line_spec(line_spec)
            is_fuzzy = '~' in line_spec or '-' in line_spec
            desc_lc = desc.lower()
            # Check 1: color issue tagged Critical
            if severity == 'Critical' and any(t in desc_lc for t in COLOR_CRITICAL_TRIGGERS):
                warnings.append(f"[{fname}] Lines {line_spec}: Critical color finding — downgrade to Warning.")
                continue
            # Check 2: fuzzy line numbers on Critical findings
            if severity == 'Critical' and is_fuzzy:
                warnings.append(f"[{fname}] Lines {line_spec} (fuzzy): Critical finding with imprecise lines — verify manually.")
            # Check 3: XSS findings must cite a line with innerHTML / outerHTML / template ${
            looks_xss = any(k in desc_lc for k in ['innerhtml', 'outerhtml', 'unescaped', 'escape', 'xss', 'insertadjacent'])
            if looks_xss and line_nums:
                hits = False
                already_escaped = True
                for ln in line_nums:
                    if 0 < ln <= len(lines):
                        text = lines[ln - 1]
                        if any(k in text for k in ['innerHTML', 'outerHTML', 'insertAdjacentHTML', '${']):
                            hits = True
                        if '${' in text:
                            # Check whether every ${...} is already escaped
                            for inner in re.findall(r'\$\{([^}]+)\}', text):
                                if '_esc(' not in inner and '_haToolsEsc(' not in inner:
                                    already_escaped = False
                                    break
                if not hits:
                    warnings.append(
                        f"[{fname}] Lines {line_spec}: Cited XSS site, but no innerHTML/outerHTML/insertAdjacentHTML/${{...}} at those lines — likely false positive."
                    )
                elif already_escaped:
                    warnings.append(
                        f"[{fname}] Lines {line_spec}: Cited XSS site, but all interpolations already wrapped in _esc()/_haToolsEsc() — likely false positive."
                    )
    return warnings


def main():
    if len(sys.argv) < 2:
        print('Usage: verify_findings.py <REAL_ISSUES.md>', file=sys.stderr)
        sys.exit(2)
    warnings = verify(sys.argv[1])
    if not warnings:
        print('verify_findings: no suspicious findings detected')
        return
    print(f'verify_findings: {len(warnings)} suspicious findings')
    for w in warnings:
        print('  - ' + w)


if __name__ == '__main__':
    main()
