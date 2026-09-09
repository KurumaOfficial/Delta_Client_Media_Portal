const puppeteer = require('puppeteer-core');
const fs = require('fs');

(async () => {
  const chromePath = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  console.log("Using browser at:", chromePath);
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:3999');
  const title = await page.title();
  console.log("Page title:", title);
  await browser.close();
  console.log("Browser launch test PASSED!");
})();
