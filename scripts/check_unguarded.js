const fs = require('fs');
const path = require('path');

const files = fs.readdirSync('.').filter(f => f.startsWith('ha-') && f.endsWith('.js'));

const apiPatterns = ['callWS', 'callService', 'callApi', 'await fetch'];

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check if line contains any API call pattern
    const hasApiCall = apiPatterns.some(p => line.includes(p));
    if (\!hasApiCall) continue;
    
    // Check surrounding context for try/catch
    let inTry = false;
    let inCatch = false;
    
    // Look backwards up to 30 lines for 'try {'
    for (let j = Math.max(0, i - 30); j < i; j++) {
      if (/\btry\s*\{/.test(lines[j])) {
        inTry = true;
        break;
      }
      // If we hit 'catch', stop looking
      if (/\}\s*catch/.test(lines[j])) {
        inTry = false;
        inCatch = true;
        break;
      }
    }
    
    // Look forward up to 5 lines for closing '}'
    if (inTry) {
      let braceCount = 1;
      for (let j = i; j < Math.min(lines.length, i + 20); j++) {
        const prevBraces = (lines[j].match(/\{/g) || []).length;
        const closeBraces = (lines[j].match(/\}/g) || []).length;
        braceCount += prevBraces - closeBraces;
        
        if (braceCount === 0 && /\}\s*catch/.test(lines[j])) {
          inTry = true;
          break;
        }
      }
    }
    
    if (\!inTry && \!inCatch && hasApiCall) {
      // Verify it's actually a call, not just a comment
      if (/^\s*\/\//.test(line)) continue;
      
      const callPattern = apiPatterns.find(p => line.includes(p));
      console.log(`${file}:${i+1} - ${callPattern}`);
      console.log(`  ${line.trim().substring(0, 80)}`);
      
      // Check if it's in an async function
      let isAsync = false;
      for (let j = Math.max(0, i - 10); j < i; j++) {
        if (/\basync\s+/.test(lines[j])) {
          isAsync = true;
          break;
        }
      }
      console.log(`  [async: ${isAsync}]`);
    }
  }
});
