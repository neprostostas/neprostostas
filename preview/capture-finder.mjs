import { chromium } from 'playwright';
import fs from 'fs';

const outRaw = '/tmp/finder-raw.png';
const scale = 4;
const cssRadius = 28;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1012, height: 900 },
  deviceScaleFactor: scale,
});

await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle' });

await page.addStyleTag({ content: `
  html, body {
    background: transparent !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  .chrome, .readme > *:not(.finder) { display: none !important; }
  .readme {
    max-width: none !important;
    margin: 0 !important;
    padding: 0 !important;
    background: transparent !important;
  }
  .finder {
    margin: 0 !important;
    width: 1012px !important;
    max-width: 1012px !important;
    box-shadow: none !important;
    /* no light border hairline in export */
    border: 0 !important;
    outline: none !important;
    border-radius: ${cssRadius}px !important;
    overflow: hidden !important;
    -webkit-backface-visibility: hidden;
    transform: translateZ(0);
  }
`});

await page.waitForSelector('.finder');
await page.waitForTimeout(500);
await page.evaluate(async () => {
  const imgs = [...document.querySelectorAll('.finder img')];
  await Promise.all(imgs.map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; })));
});
await page.waitForTimeout(300);

await page.locator('.finder').screenshot({
  path: outRaw,
  type: 'png',
  omitBackground: true,
});
console.log('raw', fs.statSync(outRaw).size);
await browser.close();
