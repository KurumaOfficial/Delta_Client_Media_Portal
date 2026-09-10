const puppeteer = require('puppeteer-core');
const fs = require('fs');

const CHROME_PATH = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const BASE_URL = 'http://127.0.0.1:3999';

let totalPassed = 0;
let totalFailed = 0;
const failures = [];

function assert(condition, message, details = "") {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    totalPassed++;
  } else {
    console.error(`  [FAIL] ${message} - ${details}`);
    totalFailed++;
    failures.push({ message, details });
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
  console.log("=================================================");
  console.log("VERIFYING 5 USER REQUIREMENTS");
  console.log("Browser:", CHROME_PATH);
  console.log("Target:", BASE_URL);
  console.log("=================================================\n");

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,950']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 950 });

  try {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync('./local.db');
    db.prepare("DELETE FROM v2_requests WHERE account_id = 2 AND kind = 'lot'").run();
  } catch (_) {}

  try {
    // ------------------------------------------------------------------
    // REQUIREMENT 1: "Роликов в неделю *" — ONLY NUMBERS WITH RED GLOW
    // ------------------------------------------------------------------
    console.log("--- REQ 1: 'Роликов в неделю *' Digits Only Validation ---");
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });

    // Open platform YouTube
    await page.$eval('#platformDrop .dropdown-head', el => el.click());
    await sleep(150);
    await page.$eval('#platformDrop .dropdown-item[data-value="youtube"]', el => el.click());
    await sleep(200);

    const videosInput = await page.$('#ytVideos');
    assert(!!videosInput, "Field #ytVideos exists");

    // Try typing non-digits: 'abc'
    await videosInput.focus();
    await page.keyboard.type('abc');
    await sleep(200);

    let videosVal = await page.$eval('#ytVideos', el => el.value);
    let videosHasError = await page.$eval('#ytVideos', el => el.classList.contains('videos-error'));
    let videosErrorVisible = await page.$eval('#ytVideosErrorText', el => !el.classList.contains('hidden'));
    let videosErrorText = await page.$eval('#ytVideosErrorMsg', el => el.textContent.trim());

    assert(videosVal === '', `Non-digit keys are blocked from entering #ytVideos (got "${videosVal}")`);
    assert(videosHasError, "#ytVideos glows red with class .videos-error on non-digit keypress");
    assert(videosErrorVisible, "Error message below #ytVideos becomes visible");
    assert(videosErrorText.includes("только цифры"), `Error text informs digits only: "${videosErrorText}"`);

    // Now type valid digits '5'
    await page.keyboard.type('5');
    await sleep(200);
    videosVal = await page.$eval('#ytVideos', el => el.value);
    videosHasError = await page.$eval('#ytVideos', el => el.classList.contains('videos-error'));
    assert(videosVal === '5', `Digits can be entered into #ytVideos (got "${videosVal}")`);
    assert(!videosHasError, "Entering valid digits clears .videos-error class");

    // ------------------------------------------------------------------
    // REQUIREMENT 2: REMOVE "не член? войти сейчас"
    // ------------------------------------------------------------------
    console.log("\n--- REQ 2: Removal of 'не член? войти сейчас' ---");
    await page.$eval('#cabinetBtn', el => el.click());
    await sleep(400);

    const authAltWrap = await page.$('.delta-auth-alt-wrap');
    const authApplyLink = await page.$('#authApplyLink');
    const authModalHTML = await page.$eval('#authModal', el => el.innerHTML);

    assert(!authAltWrap, ".delta-auth-alt-wrap does not exist in DOM");
    assert(!authApplyLink, "#authApplyLink does not exist in DOM");
    assert(!authModalHTML.includes("не член"), "Auth modal innerHTML does NOT contain 'не член'");
    assert(!authModalHTML.includes("войти сейчас"), "Auth modal innerHTML does NOT contain 'войти сейчас'");

    // Close auth modal
    await page.$eval('#authCloseBtn', el => el.click());
    await sleep(300);

    // ------------------------------------------------------------------
    // REQUIREMENT 5 (Part A): PUBLIC UID ONLY NUMBERS & RED GLOW
    // ------------------------------------------------------------------
    console.log("\n--- REQ 5 (Part A): Public UID Digits Only & Red Glow ---");
    const publicUid = await page.$('#mediaUid');
    await publicUid.focus();
    await page.keyboard.type('xyz');
    await sleep(200);

    let publicUidVal = await page.$eval('#mediaUid', el => el.value);
    let publicUidError = await page.$eval('#mediaUid', el => el.classList.contains('uid-error'));
    let publicUidErrorMsgVisible = await page.$eval('#uidErrorText', el => !el.classList.contains('hidden'));

    assert(publicUidVal === '', `Non-digits are blocked in public #mediaUid (got "${publicUidVal}")`);
    assert(publicUidError, "#mediaUid gets .uid-error red glowing animation on non-digit keypress");
    assert(publicUidErrorMsgVisible, "#uidErrorText becomes visible on non-digit keypress");

    await page.keyboard.type('123456');
    await sleep(200);
    publicUidVal = await page.$eval('#mediaUid', el => el.value);
    publicUidError = await page.$eval('#mediaUid', el => el.classList.contains('uid-error'));
    assert(publicUidVal === '123456', `Digits are accepted in public #mediaUid (got "${publicUidVal}")`);
    assert(!publicUidError, "Valid digits clear .uid-error");

    // ------------------------------------------------------------------
    // REQUIREMENT 5 (Part B): MODERATOR CABINET HWID UID ONLY NUMBERS
    // ------------------------------------------------------------------
    console.log("\n--- REQ 5 (Part B): Moderator HWID UID Digits Only ---");
    await page.$eval('#cabinetBtn', el => el.click());
    await sleep(400);
    await page.$eval('#authCode', el => el.value = '');
    await page.type('#authCode', 'DLT-DJBU8-ATBLT');
    await page.$eval('#authSubmit', el => el.click());
    await sleep(1800);

    const isCabinetActive = await page.$eval('#view-cabinet', el => el.classList.contains('active'));
    assert(isCabinetActive, "Moderator logged into cabinet");

    const hwidUid = await page.$('#hwidUid');
    assert(!!hwidUid, "HWID UID input #hwidUid exists");
    await hwidUid.focus();
    await page.keyboard.type('testUID');
    await sleep(200);

    let hwidVal = await page.$eval('#hwidUid', el => el.value);
    let hwidHasErr = await page.$eval('#hwidUid', el => el.classList.contains('uid-error'));
    let hwidErrVisible = await page.$eval('#hwidUidError', el => !el.classList.contains('hidden'));
    assert(hwidVal === '', `Non-digits blocked in #hwidUid (got "${hwidVal}")`);
    assert(hwidHasErr, "#hwidUid gets .uid-error on non-digits");
    assert(hwidErrVisible, "#hwidUidError displays error message");

    // Logout moderator
    await page.$eval('#cabinetLogout', el => el.click());
    await sleep(800);

    // ------------------------------------------------------------------
    // REQUIREMENT 3 & 4 & 5 (Part C): MEDIA CABINET (PAYOUT & LOT UID, COSMETICS, NOTIFICATIONS)
    // ------------------------------------------------------------------
    console.log("\n--- REQ 3, 4, 5 (Part C): Media Cabinet Tests ---");
    await page.$eval('#cabinetBtn', el => el.click());
    await sleep(400);
    await page.$eval('#authCode', el => el.value = '');
    await page.type('#authCode', 'DLT-4MHKC-88AWA');
    await page.$eval('#authSubmit', el => el.click());
    await sleep(1800);

    // REQ 4: Desktop notifications for Media
    const hasMediaWatcher = await page.evaluate(() => typeof window.startMediaNotificationsWatcher === "function");
    assert(hasMediaWatcher, "startMediaNotificationsWatcher is registered globally for media");

    const notifBarExists = await page.$('#cabinetNotifBar');
    assert(!!notifBarExists, "Cabinet notification banner container #cabinetNotifBar exists for media");

    // REQ 5: Media Payout UID
    await page.$eval('#cabinetTabs button[data-tab="payout"]', el => el.click());
    await sleep(400);
    const payoutUid = await page.$('#payoutUid');
    assert(!!payoutUid, "Payout UID input #payoutUid exists");
    await payoutUid.focus();
    await page.keyboard.type('letters');
    await sleep(200);

    let payoutVal = await page.$eval('#payoutUid', el => el.value);
    let payoutErr = await page.$eval('#payoutUid', el => el.classList.contains('uid-error'));
    let payoutErrVisible = await page.$eval('#payoutUidError', el => !el.classList.contains('hidden'));
    assert(payoutVal === '', `Non-digits blocked in #payoutUid (got "${payoutVal}")`);
    assert(payoutErr, "#payoutUid has .uid-error on non-digit input");
    assert(payoutErrVisible, "#payoutUidError visible");

    // REQ 3 & REQ 5: Media Lot UID & Cosmetics choice
    await page.$eval('#cabinetTabs button[data-tab="lot"]', el => el.click());
    await sleep(400);
    const lotUid = await page.$('#lotUid');
    assert(!!lotUid, "Lot UID input #lotUid exists");
    await lotUid.focus();
    await page.keyboard.type('badUid');
    await sleep(200);

    let lotUidVal = await page.$eval('#lotUid', el => el.value);
    let lotUidErr = await page.$eval('#lotUid', el => el.classList.contains('uid-error'));
    let lotUidErrVisible = await page.$eval('#lotUidError', el => !el.classList.contains('hidden'));
    assert(lotUidVal === '', `Non-digits blocked in #lotUid (got "${lotUidVal}")`);
    assert(lotUidErr, "#lotUid has .uid-error on non-digit input");
    assert(lotUidErrVisible, "#lotUidError visible");

    // Enter valid numeric UID
    await page.keyboard.type('889922');
    await sleep(150);

    // Click 'Косметика'
    console.log("  Testing 'Что хотите получить? *' -> 'Косметика' conditional field...");
    await page.$eval('#lotTypeChoice button[data-value="cosmetics"]', el => el.click());
    await sleep(200);

    const isCustomRowVisible = await page.$eval('#rowLotCustom', el => !el.classList.contains('hidden'));
    const customLabel = await page.$eval('#lotWantCustomLabel', el => el.textContent.trim());
    const customInput = await page.$('#lotWantCustom');
    const customPlaceholder = await page.$eval('#lotWantCustom', el => el.placeholder);
    const customRequired = await page.$eval('#lotWantCustom', el => el.required);

    assert(isCustomRowVisible, "#rowLotCustom appears when 'Косметика' is selected");
    assert(customLabel === "Какая косметика вам необходима? *", `Label changed to 'Какая косметика вам необходима? *' (got "${customLabel}")`);
    assert(customPlaceholder.includes("Укажите желаемую косметику"), `Placeholder is updated: "${customPlaceholder}"`);
    assert(customRequired === true, "#lotWantCustom has required = true");

    // Try submitting empty cosmetics -> rejected
    await page.$eval('#form-lot button[type="submit"]', el => el.click());
    await sleep(300);

    // Fill cosmetics and submit
    await page.type('#lotWantCustom', 'Крылья дракона и плащ');
    await page.$eval('#form-lot button[type="submit"]', el => el.click());
    await sleep(1500);

    const lotSubmitBtnText = await page.$eval('#form-lot button[type="submit"]', el => el.textContent.trim());
    assert(lotSubmitBtnText.includes("принята"), `Lot request with cosmetics accepted: "${lotSubmitBtnText}"`);

    // Verify in "Мои заявки" that the request was saved as "Косметика: Крылья дракона и плащ"
    await page.$eval('#cabinetTabs button[data-tab="my"]', el => el.click());
    await sleep(1000);
    const lastReqWant = await page.$eval('.request-item .grow div', el => el.textContent.trim());
    assert(lastReqWant.includes("Косметика: Крылья дракона и плащ"), `Stored request content verified in 'Мои заявки': "${lastReqWant}"`);

    // Logout
    await page.$eval('#cabinetLogout', el => el.click());
    await sleep(800);

    // ------------------------------------------------------------------
    // REQUIREMENT 5 (Part D): ADMIN BANS MODAL UID ONLY NUMBERS
    // ------------------------------------------------------------------
    console.log("\n--- REQ 5 (Part D): Admin Bans Modal UID Digits Only ---");
    await page.$eval('#cabinetBtn', el => el.click());
    await sleep(400);
    await page.$eval('#authCode', el => el.value = '');
    await page.type('#authCode', 'DELTA-ROOT-0001');
    await page.$eval('#authSubmit', el => el.click());
    await sleep(2000);

    await page.$eval('#adminSide .side-btn[data-cat="bans"]', el => el.click());
    await sleep(1000);

    // Open add ban modal
    await page.$eval('#openAddBanBtn', el => el.click());
    await sleep(400);

    const banUid = await page.$('#banModalUid');
    assert(!!banUid, "#banModalUid exists in Admin Bans modal");
    await banUid.focus();
    await page.keyboard.type('notDigits');
    await sleep(200);

    let banUidVal = await page.$eval('#banModalUid', el => el.value);
    let banUidErr = await page.$eval('#banModalUid', el => el.classList.contains('uid-error'));
    let banUidErrVisible = await page.$eval('#banModalUidError', el => !el.classList.contains('hidden'));

    assert(banUidVal === '', `Non-digits blocked in #banModalUid (got "${banUidVal}")`);
    assert(banUidErr, "#banModalUid has .uid-error on non-digits");
    assert(banUidErrVisible, "#banModalUidError visible in ban modal");

    await page.$eval('#banModalCloseBtn', el => el.click());
    await sleep(400);

  } catch (err) {
    console.error("Test execution failed with exception:", err);
    totalFailed++;
    failures.push({ message: "Fatal error", details: err.stack });
  } finally {
    await browser.close();
  }

  console.log("\n=================================================");
  console.log(`TEST SUMMARY: ${totalPassed} PASSED, ${totalFailed} FAILED`);
  if (failures.length > 0) {
    console.log("Failures:");
    failures.forEach((f, i) => console.log(` ${i + 1}) ${f.message}: ${f.details}`));
  }
  console.log("=================================================");
  process.exit(totalFailed === 0 ? 0 : 1);
})();
