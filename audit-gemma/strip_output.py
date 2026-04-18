#!/usr/bin/env python3
"""Strip Gemma's model-preamble and code-fence wrappers from audit outputs.

Gemma often emits:

    Okay, this is a massive undertaking! Here's the consolidated document...

    ```markdown
    # HA Tools Gemma Audit — ...
    ...
    ```

    Explanation of the Code and Changes:
    *   Consolidated Findings: ...
    To use this document:
    1.  Review Carefully ...

We want to keep only the markdown report itself. Heuristic:

1. Skip everything before the first top-level `# ` heading.
2. If the report is wrapped in ```` ``` ```` / ``` ```markdown ``` ```, strip that fence.
3. Stop at the closing ``` ``` ``` or at a trailing model-chatter block
   (heuristic: run of non-markdown paragraphs after the last `---` divider,
   or any line matching /^(Explanation|To use this|This is a .* undertaking)/).

Usage:
    strip_output.py <infile> [<outfile>]   # writes outfile or overwrites infile

If only infile is given, a .bak is created alongside.
"""
import re
import sys
from pathlib import Path


PREAMBLE_STOP = re.compile(r"^#\s+\S")  # first real heading
FENCE_OPEN = re.compile(r"^```(?:markdown)?\s*$")
FENCE_CLOSE = re.compile(r"^```\s*$")
POSTAMBLE_MARKERS = re.compile(
    r"^(\s*\*\s*)?"
    r"("
    r"Explanation of the Code|"
    r"To use this document|"
    r"This (?:is a|was a) (?:massive|substantial) undertaking|"
    r"Good luck!|"
    r"Let me know if you have any questions|"
    r"\*\*(?:IMPORTANT\s+)?NOTES?\b[^*]*\*\*|"  # **IMPORTANT NOTES AND CAVEATS:**
    r"\*\*CAVEATS?\b[^*]*\*\*|"
    r"I've (?:tried|attempted)"
    r")",
    re.IGNORECASE,
)


def strip(text: str) -> str:
    lines = text.splitlines()
    n = len(lines)

    # --- 1. Find first heading; drop preamble ---
    start = 0
    for i, line in enumerate(lines):
        if PREAMBLE_STOP.match(line):
            start = i
            break
        # Gemma sometimes wraps with ```markdown BEFORE the heading.
        if FENCE_OPEN.match(line):
            # look ahead for heading inside fence
            for j in range(i + 1, min(i + 6, n)):
                if PREAMBLE_STOP.match(lines[j]):
                    start = j
                    break
            if start:
                break

    # --- 2. Find end: closing fence OR postamble marker ---
    end = n
    for i in range(start, n):
        if FENCE_CLOSE.match(lines[i]):
            end = i
            break
        if POSTAMBLE_MARKERS.match(lines[i]):
            # cut here; but if there's a preceding `---` divider, use that
            cut = i
            for j in range(i - 1, max(i - 10, start), -1):
                if lines[j].strip() == "---":
                    cut = j
                    break
            end = cut
            break

    cleaned = "\n".join(lines[start:end]).rstrip() + "\n"
    return cleaned


def main() -> int:
    if len(sys.argv) < 2 or len(sys.argv) > 3:
        print(__doc__, file=sys.stderr)
        return 2

    infile = Path(sys.argv[1])
    raw = infile.read_text(encoding="utf-8")
    cleaned = strip(raw)

    if len(sys.argv) == 3:
        Path(sys.argv[2]).write_text(cleaned, encoding="utf-8")
    else:
        bak = infile.with_suffix(infile.suffix + ".bak")
        if not bak.exists():
            bak.write_text(raw, encoding="utf-8")
        infile.write_text(cleaned, encoding="utf-8")

    # Brief diff summary
    orig_lines = raw.count("\n")
    new_lines = cleaned.count("\n")
    print(f"stripped {orig_lines - new_lines} lines ({orig_lines} -> {new_lines})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
