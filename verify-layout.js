#!/usr/bin/env node
/**
 * verify-layout.js — Programmatic layout verification for HA Tools
 * Checks CSS for common layout bugs WITHOUT needing a browser.
 * Run after Claude Code finishes: node verify-layout.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = __dirname;
const issues = [];

function check(file, label, fn) {
  const filePath = path.join(DIR, file);
  if (!fs.existsSync(filePath)) { issues.push(`❌ ${file}: FILE NOT FOUND`); return; }
  const code = fs.readFileSync(filePath, 'utf8');
  try { fn(code, file); } catch(e) { issues.push(`❌ ${file} [${label}]: ${e.message}`); }
}

function hasPattern(code, regex, desc) { return regex.test(code); }

// ===== BUG 1: Encoding fixer excludes example paths =====
check('ha-encoding-fixer.js', 'Bug1-ExcludeExamples', (code) => {
  if (!(/example|test|demo/i.test(code) && /exclud|filter|skip|blacklist/i.test(code))) {
    issues.push('⚠️ ha-encoding-fixer.js [Bug1]: No example/test path exclusion logic found');
  }
});

// ===== BUG 2: Mojibake examples visible =====
check('ha-encoding-fixer.js', 'Bug2-MojibakeExamples', (code) => {
  if (!/<details|<summary/i.test(code)) {
    issues.push('⚠️ ha-encoding-fixer.js [Bug2]: No <details>/<summary> for mojibake examples');
  }
});

// ===== BUG 3: YAML tab spacing =====
check('ha-encoding-fixer.js', 'Bug3-Spacing', (code) => {
  // Just verify margin exists near yaml section
  if (!/margin-bottom.*?12px|margin-bottom.*?1[0-6]px/i.test(code)) {
    issues.push('⚠️ ha-encoding-fixer.js [Bug3]: Check spacing between description and buttons in yaml tab');
  }
});

// ===== BUG 8: Energy email pagination =====
check('ha-energy-email.js', 'Bug8-Pagination', (code) => {
  if (!/pagination|_devicePage|_devicesPerPage|\.slice\(/i.test(code)) {
    issues.push('⚠️ ha-energy-email.js [Bug8]: No pagination logic found');
  }
});

// ===== BUG 9: Energy email tab selector fix =====
check('ha-energy-email.js', 'Bug9-TabSelector', (code) => {
  // Should use .tab-btn, NOT .tab for querySelectorAll
  const badPattern = /querySelectorAll\s*\(\s*['"]\.tab['"]\s*\)/;
  if (badPattern.test(code)) {
    issues.push('❌ ha-energy-email.js [Bug9]: Still using querySelectorAll(\'.tab\') — should be \'.tab-btn\'');
  }
});

// ===== BUG 10: Energy insights 2-column =====
check('ha-energy-insights.js', 'Bug10-Grid', (code) => {
  if (!/grid-template-columns:\s*1fr\s+1fr|grid-template-columns:\s*repeat\(2|content-grid/i.test(code)) {
    issues.push('⚠️ ha-energy-insights.js [Bug10]: No 2-column grid found');
  }
});

// ===== BUG 11: Energy insights bento tokens =====
check('ha-energy-insights.js', 'Bug11-BentoTokens', (code) => {
  if (/--pr-l|--r1|--r2/.test(code)) {
    issues.push('⚠️ ha-energy-insights.js [Bug11]: Still uses custom CSS vars (--pr-l, --r1, --r2) instead of Bento tokens');
  }
});

// ===== BUG 14: Purge cache confirm =====
check('ha-purge-cache.js', 'Bug14-Confirm', (code) => {
  if (!/confirm|_showConfirm|confirm-overlay|confirm-dialog/i.test(code)) {
    issues.push('⚠️ ha-purge-cache.js [Bug14]: No confirm popup logic found');
  }
});

// ===== BUG 17: Data exporter checkbox consistency =====
check('ha-data-exporter.js', 'Bug17-Checkbox', (code) => {
  // Count unique checkbox class patterns
  const checkboxClasses = code.match(/class="[^"]*checkbox[^"]*"/gi) || [];
  const unique = [...new Set(checkboxClasses)];
  if (unique.length > 2) {
    issues.push(`⚠️ ha-data-exporter.js [Bug17]: ${unique.length} different checkbox class patterns found — should be consistent`);
  }
});

// ===== BUG 18: Overflow hidden on cards =====
['ha-sentence-manager.js', 'ha-baby-tracker.js'].forEach(f => {
  check(f, 'Bug18-Overflow', (code) => {
    if (!/overflow\s*:\s*hidden/i.test(code)) {
      issues.push(`⚠️ ${f} [Bug18]: No overflow:hidden on card container`);
    }
  });
});

// ===== BUG 19: Tab switch guard =====
['ha-chore-tracker.js', 'ha-baby-tracker.js'].forEach(f => {
  check(f, 'Bug19-TabGuard', (code) => {
    if (!/if\s*\(\s*!this\._hass\s*\)\s*return/i.test(code)) {
      issues.push(`⚠️ ${f} [Bug19]: No hass guard at top of _render()`);
    }
    if (!/if\s*\(\s*!this\.(activeTab|selectedTab|_activeTab)/i.test(code)) {
      issues.push(`⚠️ ${f} [Bug19]: No activeTab/selectedTab fallback guard`);
    }
  });
});

// ===== BUG 22: Backup compact mode =====
check('ha-backup-manager.js', 'Bug22-Compact', (code) => {
  if (!/compact|backup-row|table.*view|list.*view/i.test(code)) {
    issues.push('⚠️ ha-backup-manager.js [Bug22]: No compact/list view found');
  }
});

// ===== Syntax check all modified files =====
const toolFiles = fs.readdirSync(DIR).filter(f => f.startsWith('ha-') && f.endsWith('.js'));
toolFiles.forEach(f => {
  try {
    const code = fs.readFileSync(path.join(DIR, f), 'utf8');
    new vm.Script(code, { filename: f });
  } catch(e) {
    issues.push(`❌ ${f} [SYNTAX]: ${e.message}`);
  }
});

// ===== Report =====
console.log('\n=== HA Tools Layout Verification ===\n');
if (issues.length === 0) {
  console.log('✅ All checks passed! 0 issues found.\n');
} else {
  console.log(`Found ${issues.length} issue(s):\n`);
  issues.forEach(i => console.log(i));
  console.log('');
}
process.exit(issues.length > 0 ? 1 : 0);