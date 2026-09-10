const puppeteer = require('../frontend_test/node_modules/puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const HTML_PATH = path.resolve(__dirname, 'banner.html');
const ROOT_OUTPUT = path.resolve(__dirname, '../../social-preview.png');
const STATIC_OUTPUT = path.resolve(__dirname, '../../web/static/img/social-preview.png');

(async () => {
  console.log('====================================================');
  console.log('DELTA MEDIA PORTAL - GITHUB SOCIAL PREVIEW GENERATOR');
  console.log('Browser:', CHROME_PATH);
  console.log('Source HTML:', HTML_PATH);
  console.log('Target Dimensions: 1280 x 640 px');
  console.log('====================================================\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--font-render-hinting=none',
      '--enable-font-antialiasing',
      '--force-device-scale-factor=1'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({
    width: 1280,
    height: 640,
    deviceScaleFactor: 1
  });

  console.log('Loading banner template...');
  await page.goto(`file://${HTML_PATH}`, { waitUntil: 'networkidle0' });

  // Wait for Google Fonts to be ready
  await page.evaluate(async () => {
    if (document.fonts) {
      await document.fonts.ready;
    }
  });

  // Small delay to ensure all CSS gradients, filters and SVG shadows are painted
  await new Promise((r) => setTimeout(r, 600));

  console.log('Capturing social preview screenshot at 1280x640px...');
  await page.screenshot({
    path: ROOT_OUTPUT,
    clip: { x: 0, y: 0, width: 1280, height: 640 },
    type: 'png'
  });

  // Also save a copy to web/static/img/
  fs.copyFileSync(ROOT_OUTPUT, STATIC_OUTPUT);

  const stats = fs.statSync(ROOT_OUTPUT);
  console.log(`\nSUCCESS! Social preview banner generated:`);
  console.log(`- Path 1: ${ROOT_OUTPUT} (${(stats.size / 1024).toFixed(1)} KB)`);
  console.log(`- Path 2: ${STATIC_OUTPUT}`);
  console.log(`\nReady to be uploaded to GitHub Settings -> General -> Social preview.`);

  await browser.close();
})();
