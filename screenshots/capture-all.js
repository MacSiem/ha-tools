const http = require('http');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const TAB = '1364941440';
const BOUNCE = 'http://192.168.1.124:8123/energy';

const TOOLS = [
  ['v39-home', 'http://192.168.1.124:8123/ha-tools'],
  ['v39-energy-optimizer', 'http://192.168.1.124:8123/ha-tools#energy-optimizer'],
  ['v39-trace-viewer', 'http://192.168.1.124:8123/ha-tools#trace-viewer'],
  ['v39-frigate-privacy', 'http://192.168.1.124:8123/ha-tools#frigate-privacy'],
  ['v39-security-check', 'http://192.168.1.124:8123/ha-tools#security-check'],
  ['v39-network-map', 'http://192.168.1.124:8123/ha-tools#network-map'],
  ['v39-storage-monitor', 'http://192.168.1.124:8123/ha-tools#storage-monitor'],
  ['v39-baby-tracker', 'http://192.168.1.124:8123/ha-tools#baby-tracker'],
  ['v39-sentence-manager', 'http://192.168.1.124:8123/ha-tools#sentence-manager'],
  ['v39-settings', 'http://192.168.1.124:8123/ha-tools#settings'],
  ['v39-backup-manager', 'http://192.168.1.124:8123/ha-tools#backup-manager'],
  ['v39-ha-dashboard', 'http://192.168.1.124:8123/home'],
];
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

function kapGet(path) {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:61822' + path, (res) => {
      const c = [];
      res.on('data', d => c.push(d));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(c) }));
    }).on('error', reject);
  });
}

async function navigate(url) {
  const encoded = encodeURIComponent(url);
  const r = await kapGet('/tab/' + TAB + '/navigate?url=' + encoded);
  return JSON.parse(r.body.toString());
}

async function screenshot(name) {
  const r = await kapGet('/tab/' + TAB + '/screenshot/view?scale=0.35&format=jpeg&quality=0.7');
  if (r.status !== 200) { console.log('  SKIP ' + name + ' (HTTP ' + r.status + ')'); return; }
  fs.writeFileSync(path.join(DIR, name + '-small.jpg'), r.body);
  fs.writeFileSync(path.join(DIR, name + '.b64'), r.body.toString('base64'));
  console.log('  OK ' + name + ' (' + r.body.length + ' bytes, ' + r.body.toString('base64').length + ' b64)');
}

async function main() {
  for (const [name, url] of TOOLS) {
    console.log('>> ' + name);
    // Bounce to energy first
    await kapGet('/tab/' + TAB + '/navigate?url=' + encodeURIComponent(BOUNCE));
    await wait(2000);
    // Navigate to tool
    await kapGet('/tab/' + TAB + '/navigate?url=' + encodeURIComponent(url));
    await wait(4000);
    // Screenshot
    await screenshot(name);
  }
  console.log('\\nAll done!');
}

main().catch(e => console.error(e));
