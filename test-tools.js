#!/usr/bin/env node
/**
 * HA Tools — Automated Test Harness
 * Verifies all tool JS files for common issues without needing a browser.
 * Usage: node test-tools.js [--fix-iife]
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = __dirname;
const TOOLS_DIR = REPO;
const FIX_IIFE = process.argv.includes('--fix-iife');

// Skip non-tool files
const SKIP = ['test-tools.js', 'ha-tools-bento.js', 'ha-tools-loader.js', 'ha-tools-loader-v3.js', 
              'ha-tools-panel.js', 'ha-tools-stack.js', 'ha-tools-discovery.js'];

const results = { pass: [], warn: [], fail: [] };

function log(level, tool, msg) {
  const icon = { pass: '\u2705', warn: '\u26A0\uFE0F', fail: '\u274C' }[level];
  console.log(`${icon} [${tool}] ${msg}`);
  results[level].push(`${tool}: ${msg}`);
}

// Get all tool JS files
const files = fs.readdirSync(TOOLS_DIR)
  .filter(f => f.startsWith('ha-') && f.endsWith('.js') && !SKIP.includes(f))
  .sort();

console.log(`\n========= HA Tools Test Harness =========`);
console.log(`Found ${files.length} tool files to check\n`);

for (const file of files) {
  const filePath = path.join(TOOLS_DIR, file);
  const code = fs.readFileSync(filePath, 'utf8');
  const toolName = file.replace('.js', '');

  // 1. SYNTAX CHECK — try to compile
  try {
    new vm.Script(code, { filename: file });
    log('pass', toolName, 'Syntax OK');
  } catch (e) {
    log('fail', toolName, `Syntax Error: ${e.message}`);
    continue; // Skip other checks if syntax fails
  }

  // 2. IIFE WRAPPER — class at top level = double-load crash
  const hasTopLevelClass = /^class\s+\w+/m.test(code);
  const hasIIFE = /^\s*\(function\s*\(\)\s*\{/m.test(code) || /^\s*\(\(\)\s*=>\s*\{/m.test(code);
  if (hasTopLevelClass && !hasIIFE) {
    log('warn', toolName, 'Top-level class without IIFE — will crash on double-load');
  } else {
    log('pass', toolName, 'IIFE/scope OK');
  }

  // 3. BENTO CSS import
  if (code.includes('HAToolsBentoCSS')) {
    log('pass', toolName, 'Bento CSS imported');
  } else {
    log('fail', toolName, 'Missing HAToolsBentoCSS import');
  }

  // 4. LANGUAGE DETECTION (PL/EN)
  const hasLangDetect = /navigator\.language|hass.*language|startsWith.*pl/i.test(code);
  const hasTranslations = /this\._t\b|this\._lang|_translations|TRANSLATIONS/i.test(code);
  if (hasLangDetect && hasTranslations) {
    log('pass', toolName, 'Language detection OK (PL/EN)');
  } else if (hasTranslations) {
    log('warn', toolName, 'Has translations but missing auto-detect');
  } else {
    log('warn', toolName, 'No language detection found');
  }

  // 5. customElements GUARD
  const tagMatch = code.match(/customElements\.define\(['"]([^'"]+)['"]/);
  if (tagMatch) {
    const tag = tagMatch[1];
    const hasGuard = code.includes(`customElements.get('${tag}')`) || code.includes(`customElements.get("${tag}")`);
    if (hasGuard) {
      log('pass', toolName, `customElements guard OK (${tag})`);
    } else {
      log('warn', toolName, `No customElements.get() guard for ${tag}`);
    }
  }

  // 6. customCards REGISTRATION
  if (code.includes('customCards') && code.includes('.push(')) {
    log('pass', toolName, 'customCards registration OK');
  } else {
    log('warn', toolName, 'Missing window.customCards registration');
  }

  // 7. OCTAL ESCAPE in template strings
  const octalMatch = code.match(/`[^`]*(?<!\\)\\[0-7][0-9A-Fa-f][^`]*`/);
  if (octalMatch) {
    log('fail', toolName, `Octal escape in template string — will crash`);
  }

  // 8. SHADOW DOM
  if (code.includes('attachShadow') || code.includes('shadowRoot')) {
    log('pass', toolName, 'Shadow DOM OK');
  } else {
    log('warn', toolName, 'No Shadow DOM — might leak styles');
  }

  // 9. HASS GUARD in render
  const renderMatch = code.match(/(?:render|renderCard|_render)\s*\(\s*\)\s*\{([^}]{0,200})/);
  if (renderMatch) {
    if (/if\s*\(\s*!this\._hass\s*\)\s*return/.test(renderMatch[1])) {
      log('pass', toolName, 'Hass guard in render OK');
    } else {
      log('warn', toolName, 'No hass guard (if (!this._hass) return) at top of render()');
    }
  }

  console.log(''); // separator
}

// SUMMARY
console.log('\n========= SUMMARY =========');
console.log(`\u2705 PASS: ${results.pass.length}`);
console.log(`\u26A0\uFE0F WARN: ${results.warn.length}`);
console.log(`\u274C FAIL: ${results.fail.length}`);

if (results.fail.length > 0) {
  console.log('\nFAILURES:');
  results.fail.forEach(f => console.log(`  \u274C ${f}`));
}
if (results.warn.length > 0) {
  console.log('\nWARNINGS:');
  results.warn.forEach(w => console.log(`  \u26A0\uFE0F ${w}`));
}

// Write results JSON
fs.writeFileSync(path.join(REPO, 'test-results.json'), JSON.stringify(results, null, 2));
console.log('\nResults saved to test-results.json');

process.exit(results.fail.length > 0 ? 1 : 0);
