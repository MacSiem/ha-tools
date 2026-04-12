// Download small JPEG from Kapture and output base64
const http = require('http');
const fs = require('fs');
const path = require('path');
const name = process.argv[2] || 'screenshot';
const tab = process.argv[3] || '1364941440';
const scale = process.argv[4] || '0.25';
const url = 'http://localhost:61822/tab/' + tab + '/screenshot/view?scale=' + scale + '&format=jpeg&quality=0.7';
http.get(url, (res) => {
  const c = [];
  res.on('data', d => c.push(d));
  res.on('end', () => {
    const b = Buffer.concat(c);
    if (res.statusCode !== 200) { console.error('HTTP ' + res.statusCode); return; }
    const f = path.join(__dirname, name + '.jpg');
    fs.writeFileSync(f, b);
    // Also write base64 to a .b64 file
    fs.writeFileSync(path.join(__dirname, name + '.b64'), b.toString('base64'));
    console.log(name + ': ' + b.length + ' bytes, b64: ' + b.toString('base64').length + ' chars');
  });
}).on('error', e => console.error(e.message));
