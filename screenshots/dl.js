const http = require('http');
const fs = require('fs');
const path = require('path');
const name = process.argv[2] || 'screenshot';
const tab = process.argv[3] || '1364941440';
const url = 'http://localhost:61822/tab/' + tab + '/screenshot/view?scale=0.8&format=png&quality=0.95';
http.get(url, (res) => {
  const c = [];
  res.on('data', d => c.push(d));
  res.on('end', () => {
    const b = Buffer.concat(c);
    if (res.statusCode !== 200) { console.log('Error: HTTP ' + res.statusCode); return; }
    fs.writeFileSync(path.join(__dirname, name + '.png'), b);
    console.log(name + '.png: ' + (b.length/1024).toFixed(0) + ' KB');
  });
}).on('error', e => console.error(e.message));
