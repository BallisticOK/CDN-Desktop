// Renders the app icon to PNG using an offscreen Electron window: `npx electron scripts/make-icon.cjs`
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const html = `<canvas id="c" width="512" height="512"></canvas><script>
const c = document.getElementById('c').getContext('2d');
const g = c.createLinearGradient(0, 0, 512, 512); g.addColorStop(0, '#8b6cff'); g.addColorStop(1, '#22c3ee');
const r = 116; c.beginPath(); c.moveTo(r, 16); c.arcTo(496, 16, 496, 496, r); c.arcTo(496, 496, 16, 496, r); c.arcTo(16, 496, 16, 16, r); c.arcTo(16, 16, 496, 16, r); c.closePath();
c.fillStyle = g; c.fill();
const s = c.createLinearGradient(0, 16, 0, 260); s.addColorStop(0, 'rgba(255,255,255,0.28)'); s.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = s; c.fill();
c.fillStyle = '#fff'; c.shadowColor = 'rgba(20,10,60,0.35)'; c.shadowBlur = 24; c.shadowOffsetY = 8;
c.beginPath(); [[196, 270, 76], [272, 222, 96], [340, 276, 70]].forEach(([x, y, rr]) => { c.moveTo(x + rr, y); c.arc(x, y, rr, 0, Math.PI * 2); }); c.rect(196, 270, 144, 76); c.fill();
c.shadowColor = 'transparent'; c.strokeStyle = '#6d4dff'; c.lineWidth = 26; c.lineCap = 'round'; c.lineJoin = 'round';
c.beginPath(); c.moveTo(270, 318); c.lineTo(270, 236); c.moveTo(234, 270); c.lineTo(270, 234); c.lineTo(306, 270); c.stroke();
document.title = 'ready';
</script>`;
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, width: 512, height: 512, webPreferences: { offscreen: true } });
  await w.loadURL('data:text/html,' + encodeURIComponent(html));
  const url = await w.webContents.executeJavaScript("document.getElementById('c').toDataURL('image/png')");
  const buf = Buffer.from(url.split(',')[1], 'base64');
  for (const p of ['build/icon.png', 'electron/icon.png']) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf); }
  console.log('icon written', buf.length);
  app.quit();
});
