// Read a PNG file and output its base64
// Usage: node to-base64.js <filename>
const fs = require('fs');
const path = require('path');
const file = process.argv[2];
if (!file) { console.error('Usage: node to-base64.js <file>'); process.exit(1); }
const fullPath = path.join(__dirname, file);
const buf = fs.readFileSync(fullPath);
console.log(buf.toString('base64'));
