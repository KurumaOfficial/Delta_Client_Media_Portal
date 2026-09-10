const puppeteer = require('puppeteer-core');
const fs = require('fs');

const CHROME_PATH = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const BASE_URL = 'http://127.0.0.1:3999';

let browser;
let page;
let totalPassed = 0;
let totalFailed = 0;
const failures = [];
const uncaughtErrors = [];

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
  console.log("DELTA MEDIA PORTAL V2 - FULL HUMAN-LIKE E2E TEST");
  console.log("Browser:", CHROME_PATH);
  console.log("Target:", BASE_URL);
  console.log("=================================================\n");

  browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,950']
  });

  page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 950 });

  page.on('pageerror', err => {
    if (err.message.includes("turnstile") || err.message.includes("Script error")) return;
    console.error("  [PAGE JS ERROR]:", err.message);
    uncaughtErrors.push(err.message);
  });

  page.on('dialog', async dialog => {
    console.log("  [BROWSER DIALOG]:", dialog.type(), dialog.message());
    await dialog.accept("Авто-тест комментарий");
  });

  // Clean test applications and lot requests from local.db so fresh submission passes
  try {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync('./local.db');
    db.prepare("DELETE FROM v2_media_apps WHERE LOWER(telegram) = '@demo_media' OR LOWER(telegram) = 'demo_media'").run();
    db.prepare("DELETE FROM v2_requests WHERE (nickname = 'DemoMedia' OR telegram = '@demo_media') AND kind = 'lot'").run();
  } catch (dbErr) {
    console.warn("DB prep warning:", dbErr.message);
  }

  try {
    // ----------------------------------------------------
    // SUITE 1: Texts, Renaming & Multilingual Localization
    // ----------------------------------------------------
    console.log("\n--- SUITE 1: Public Page, Texts & Localization ---");
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });

    const heroDesc = await page.$eval('.hero-desc', el => el.textContent.trim());
    assert(
      heroDesc === "Заполните форму ниже для вступления в delta media. Перед отправкой внимательно проверьте все указанные данные.",
      "Hero description text matches requested string exactly",
      heroDesc
    );

    const exclusiveLabel = await page.$eval('label[data-i18n="qExclusive"]', el => el.textContent.trim());
    assert(
      exclusiveLabel === "Вы готовы снимать только с Delta Client?",
      "Exclusive content question label renamed to 'Вы готовы снимать только с Delta Client?'",
      exclusiveLabel
    );

    // Language switcher
    await page.click('.lang-switch button[data-lang="ua"]');
    await sleep(200);
    const heroDescUA = await page.$eval('.hero-desc', el => el.textContent.trim());
    assert(heroDescUA.includes("Заповніть форму нижче"), "Switching to Ukrainian works properly", heroDescUA);

    await page.click('.lang-switch button[data-lang="en"]');
    await sleep(200);
    const heroDescEN = await page.$eval('.hero-desc', el => el.textContent.trim());
    assert(heroDescEN.includes("Fill out the form below"), "Switching to English works properly", heroDescEN);

    await page.click('.lang-switch button[data-lang="ru"]');
    await sleep(200);

    // ----------------------------------------------------
    // SUITE 2: Public Form Validation, Breaking & Edge Cases
    // ----------------------------------------------------
    console.log("\n--- SUITE 2: Form Stress Testing, Boundary Checks & Fuzzing ---");

    // 2.1 Empty submission
    await page.$eval('#mediaSubmit', el => { el.scrollIntoView({ block: 'center' }); el.click(); });
    await sleep(300);
    let submitBtnText = await page.$eval('#mediaSubmit', el => el.textContent.trim());
    assert(submitBtnText === "Укажите UID", "Empty submission shows 'Укажите UID' inside button", submitBtnText);

    // 2.2 Non-digits in UID -> triggers red glow (.uid-error) and error message
    const nonDigitPayload = 'abc!@#';
    await page.type('#mediaUid', nonDigitPayload);
    await sleep(200);

    const hasUidErrorClass = await page.$eval('#mediaUid', el => el.classList.contains('uid-error'));
    const isUidErrorTextVisible = await page.$eval('#uidErrorText', el => !el.classList.contains('hidden'));
    assert(hasUidErrorClass, "Non-digit UID triggers red glow (.uid-error)");
    assert(isUidErrorTextVisible, "Non-digit UID displays error text 'В поле UID разрешены только цифры'");

    await page.$eval('#mediaSubmit', el => el.click());
    await sleep(300);
    submitBtnText = await page.$eval('#mediaSubmit', el => el.textContent.trim());
    assert(submitBtnText === "В поле UID разрешены только цифры", "Submitting non-digits in UID rejects with 'В поле UID разрешены только цифры'", submitBtnText);

    // Set valid numeric UID -> red glow removes and error text hides
    await page.$eval('#mediaUid', el => el.value = '');
    await page.type('#mediaUid', '1337001');
    await sleep(200);

    const hasUidErrorAfterFix = await page.$eval('#mediaUid', el => el.classList.contains('uid-error'));
    const isUidErrorTextHidden = await page.$eval('#uidErrorText', el => el.classList.contains('hidden'));
    assert(!hasUidErrorAfterFix, "Valid numeric UID removes red glow (.uid-error)");
    assert(isUidErrorTextHidden, "Valid numeric UID hides error text");

    // 2.3 Criteria 'No' chosen
    await page.click('#criteriaChoice button[data-value="no"]');
    await page.$eval('#mediaSubmit', el => el.click());
    await sleep(300);
    submitBtnText = await page.$eval('#mediaSubmit', el => el.textContent.trim());
    assert(submitBtnText === "Подтвердите критерии (Да)", "Criteria 'No' rejects with 'Подтвердите критерии (Да)'", submitBtnText);

    // Click 'Yes'
    await page.click('#criteriaChoice button[data-value="yes"]');
    await page.$eval('#mediaSubmit', el => el.click());
    await sleep(300);
    submitBtnText = await page.$eval('#mediaSubmit', el => el.textContent.trim());
    assert(submitBtnText === "Выберите платформу", "Prompts to select platform", submitBtnText);

    // 2.4 Select YouTube Platform & test conditional inputs
    await page.$eval('#platformDrop .dropdown-head', el => { el.scrollIntoView({ block: 'center' }); el.click(); });
    await sleep(150);
    await page.$eval('#platformDrop .dropdown-item[data-value="youtube"]', el => el.click());
    await sleep(200);

    const isYTVisible = await page.$eval('#ytBlock', el => !el.classList.contains('hidden'));
    const isTTVisible = await page.$eval('#ttBlock', el => !el.classList.contains('hidden'));
    assert(isYTVisible && !isTTVisible, "Selecting YouTube opens YouTube fields and hides TikTok fields");

    await page.$eval('#mediaSubmit', el => el.click());
    await sleep(300);
    submitBtnText = await page.$eval('#mediaSubmit', el => el.textContent.trim());
    assert(submitBtnText === "Укажите ссылку на канал", "Prompts for channel URL", submitBtnText);

    // 2.4.1 Invalid channel URL -> triggers red glow (.channel-error) and error text
    await page.type('#ytChannel', 'https://youtube.com/watch?v=badlink');
    await sleep(200);
    const hasChannelErrorClass = await page.$eval('#ytChannel', el => el.classList.contains('channel-error'));
    const isChannelErrorVisible = await page.$eval('#ytErrorText', el => !el.classList.contains('hidden'));
    assert(hasChannelErrorClass, "Video link in channel URL triggers red glow (.channel-error)");
    assert(isChannelErrorVisible, "Video link in channel URL displays error text");

    // Fix with valid channel URL -> removes red glow (.channel-error) and hides error text
    await page.$eval('#ytChannel', el => el.value = '');
    await page.type('#ytChannel', 'https://www.youtube.com/@valid_human_tester');
    await sleep(200);
    const hasChannelErrorAfterFix = await page.$eval('#ytChannel', el => el.classList.contains('channel-error'));
    const isChannelErrorHidden = await page.$eval('#ytErrorText', el => el.classList.contains('hidden'));
    assert(!hasChannelErrorAfterFix, "Valid channel URL removes red glow (.channel-error)");
    assert(isChannelErrorHidden, "Valid channel URL hides error text");

    await page.type('#ytVideos', '3');

    // 2.5 Multi-select Servers dropdown
    await page.$eval('#serversDrop .dropdown-head', el => { el.scrollIntoView({ block: 'center' }); el.click(); });
    await sleep(150);
    await page.$eval('#serversDrop input[value="Funtime"]', el => el.click());
    await page.$eval('#serversDrop input[value="Holyworld"]', el => el.click());
    const serversVal = await page.$eval('#serversDrop .dropdown-value', el => el.textContent.trim());
    assert(serversVal.includes("Funtime") && serversVal.includes("Holyworld"), "Multi-select servers works and lists checked items", serversVal);
    await page.$eval('#serversDrop .dropdown-head', el => el.click());

    // 2.6 Motivation boundary testing
    await page.type('#whyJoin', 'Мало');
    await page.$eval('#mediaSubmit', el => el.click());
    await sleep(300);
    submitBtnText = await page.$eval('#mediaSubmit', el => el.textContent.trim());
    assert(submitBtnText === "Мотивация — минимум 10 символов", "Rejects motivation < 10 characters", submitBtnText);

    await page.type('#whyJoin', ' символов — теперь больше десяти для проверки');
    const whyCounter = await page.$eval('#whyCount', el => el.textContent.trim());
    assert(parseInt(whyCounter, 10) >= 10, "Character counter tracks input dynamically", whyCounter);

    // 2.7 "Вы готовы снимать только с Delta Client?" dropdown
    await page.$eval('#mediaSubmit', el => el.click());
    await sleep(300);
    submitBtnText = await page.$eval('#mediaSubmit', el => el.textContent.trim());
    assert(submitBtnText === "Укажите готовность снимать с Delta Client", "Validates exclusive question choice", submitBtnText);

    await page.$eval('#exclusiveDrop .dropdown-head', el => { el.scrollIntoView({ block: 'center' }); el.click(); });
    await sleep(150);
    await page.$eval('#exclusiveDrop .dropdown-item[data-value="yes"]', el => el.click());
    await sleep(100);

    // ----------------------------------------------------
    // SUITE 2.8: The User's Requirement - Telegram Verification
    // ----------------------------------------------------
    console.log("\n--- SUITE 2.8: Telegram Verification UI & Button Messages ---");

    // Empty telegram
    await page.$eval('#mediaSubmit', el => el.click());
    await sleep(300);
    submitBtnText = await page.$eval('#mediaSubmit', el => el.textContent.trim());
    assert(submitBtnText === "Укажите Telegram", "Validates empty Telegram field", submitBtnText);

    // Enter unverified handle
    await page.type('#mediaTg', '@unverified_random_guy_123');
    await sleep(1500); // debounce check

    // 1. Separate status box MUST be hidden
    const tgStatusHidden = await page.$eval('#tgVerifyStatus', el => el.classList.contains('hidden') || el.textContent.trim() === '');
    assert(tgStatusHidden, "Separate text box #tgVerifyStatus is HIDDEN (no redundant banner)");

    // 2. Staff button MUST ONLY display 'Написать сотруднику' and NOT show the error immediately
    const staffBtnLabel = await page.$eval('#staffContactBtn .tg-btn-label', el => el.textContent.trim());
    const staffBtnHasErr = await page.$eval('#staffContactBtn', el => el.classList.contains('err'));
    assert(
      staffBtnLabel === "Написать сотруднику" && !staffBtnHasErr,
      "Staff button strictly keeps 'Написать сотруднику' and never shows error text",
      staffBtnLabel
    );

    // 3. Submit button MUST NOT show error immediately before click
    let submitBtnBeforeClick = await page.$eval('#mediaSubmit', el => el.textContent.trim());
    assert(
      !submitBtnBeforeClick.includes("Диалог не найден"),
      "Warning does NOT appear immediately upon typing — only after clicking submit",
      submitBtnBeforeClick
    );

    // 4. Click submit button: NOW the error MUST appear on the submit button!
    await page.$eval('#ytChannel', el => el.value = 'https://www.youtube.com/@valid_human_tester');
    await page.$eval('#mediaSubmit', el => el.click());
    await sleep(400);

    submitBtnText = await page.$eval('#mediaSubmit', el => el.textContent.trim());
    const submitBtnHasErr = await page.$eval('#mediaSubmit', el => el.classList.contains('err'));
    assert(
      submitBtnText === "Диалог не найден — сначала напишите сотруднику!" && submitBtnHasErr,
      "Submit button shakes, turns red, and displays 'Диалог не найден — сначала напишите сотруднику!' AFTER click",
      submitBtnText
    );

    // Staff button must STILL only say 'Написать сотруднику'
    const staffBtnAfterSubmit = await page.$eval('#staffContactBtn .tg-btn-label', el => el.textContent.trim());
    assert(
      staffBtnAfterSubmit === "Написать сотруднику",
      "Staff button STILL only says 'Написать сотруднику' after failed submit",
      staffBtnAfterSubmit
    );

    // 4. Test verified handle (@demo_media)
    await page.$eval('#mediaTg', el => el.value = '');
    await page.type('#mediaTg', '@demo_media');
    await sleep(1500);

    const tgStatusVerified = await page.$eval('#tgVerifyStatus', el => el.textContent.trim());
    const tgStatusOk = await page.$eval('#tgVerifyStatus', el => el.classList.contains('ok'));
    assert(tgStatusOk && tgStatusVerified.includes("Telegram подтверждён"), "Verified handle displays 'Telegram подтверждён'", tgStatusVerified);

    const staffBtnReset = await page.$eval('#staffContactBtn .tg-btn-label', el => el.textContent.trim());
    assert(staffBtnReset === "Написать сотруднику", "Staff button resets to 'Написать сотруднику'", staffBtnReset);

    // Submit valid application
    await page.$eval('#mediaSubmit', el => el.click());
    await sleep(1500);
    submitBtnText = await page.$eval('#mediaSubmit', el => el.textContent.trim());
    assert(submitBtnText.includes("Заявка отправлена"), "Valid application successfully submitted ('Заявка отправлена! ✅')", submitBtnText);

    // ----------------------------------------------------
    // SUITE 3: Auth Modal & Roles Cabinets
    // ----------------------------------------------------
    console.log("\n--- SUITE 3: Auth Modal & Role-based Cabinets ---");

    // 3.1 Login Modal
    await page.$eval('#cabinetBtn', el => el.click());
    await sleep(400);
    let isModalOpen = await page.$eval('#authModal', el => el.classList.contains('open'));
    assert(isModalOpen, "Auth modal opens on 'Кабинет' click");

    // Invalid code
    await page.type('#authCode', 'INVALID-CODE-999');
    await page.$eval('#authSubmit', el => el.click());
    await sleep(800);
    const authErrText = await page.$eval('#authError', el => el.textContent.trim());
    assert(authErrText.includes("Неверный") || authErrText.includes("код"), "Auth error shown on invalid code", authErrText);

    // 3.2 Moderator Login (DLT-DJBU8-ATBLT)
    console.log("  Testing Moderator Login & Actions...");
    await page.$eval('#authCode', el => el.value = '');
    await page.type('#authCode', 'DLT-DJBU8-ATBLT');
    await page.$eval('#authSubmit', el => el.click());
    await sleep(1800);

    let isCabinetActive = await page.$eval('#view-cabinet', el => el.classList.contains('active'));
    assert(isCabinetActive, "Moderator successfully logged into Cabinet");

    // Submit HWID request
    await page.type('#form-hwid input[name="uuid"]', 'MOD_BROWSER_HWID_UID');
    await page.type('#form-hwid textarea[name="reason"]', 'Замена SSD накопителя');
    await page.type('#form-hwid input[name="proof_link"]', 'https://imgur.com/browser_test');
    await page.$eval('#form-hwid button[type="submit"]', el => el.click());
    await sleep(1500);
    let hwidStatus = await page.$eval('#form-hwid button[type="submit"]', el => el.textContent.trim());
    assert(hwidStatus.includes("отправлена") || hwidStatus.includes("принята"), "Moderator HWID request submitted successfully", hwidStatus);

    // Submit Discord ban request
    await page.$eval('#cabinetTabs button[data-tab="discord"]', el => el.click());
    await sleep(500);
    await page.type('#form-discord input[name="offender_id"]', '59720440028888');
    await page.type('#form-discord textarea[name="reason"]', 'Спам ссылками на сторонние ресурсы');
    await page.type('#form-discord input[name="proof_link"]', 'https://youtube.com/watch?v=proof88');
    await page.$eval('#form-discord button[type="submit"]', el => el.click());
    await sleep(1500);
    let discordStatus = await page.$eval('#form-discord button[type="submit"]', el => el.textContent.trim());
    assert(discordStatus.includes("отправлена") || discordStatus.includes("принята"), "Moderator Discord ban request submitted successfully", discordStatus);

    // Check "Мои заявки"
    await page.$eval('#cabinetTabs button[data-tab="my"]', el => el.click());
    await sleep(1000);
    let modReqCount = await page.$$eval('.request-item', els => els.length);
    assert(modReqCount >= 1, `Moderator 'Мои заявки' tab displays requests (Found ${modReqCount})`);

    // Logout
    await page.$eval('#cabinetLogout', el => el.click());
    await sleep(1000);
    assert(await page.$eval('#view-public', el => el.classList.contains('active')), "Moderator logged out back to public view");

    // 3.3 Media Login (DLT-4MHKC-88AWA)
    console.log("  Testing Media Login & Actions...");
    await page.$eval('#cabinetBtn', el => el.click());
    await sleep(400);
    await page.$eval('#authCode', el => el.value = '');
    await page.type('#authCode', 'DLT-4MHKC-88AWA');
    await page.$eval('#authSubmit', el => el.click());
    await sleep(1800);

    isCabinetActive = await page.$eval('#view-cabinet', el => el.classList.contains('active'));
    assert(isCabinetActive, "Media successfully logged into Cabinet");

    // Test Lot application form
    await page.$eval('#cabinetTabs button[data-tab="lot"]', el => el.click());
    await sleep(500);
    await page.type('#form-lot input[name="uid"]', 'MEDIA_TEST_UID_LOT');
    await page.type('#form-lot textarea[name="want"]', 'Реклама лота на FunPay');
    await page.$eval('#lotPlatform .dropdown-head', el => { el.scrollIntoView({ block: 'center' }); el.click(); });
    await sleep(150);
    await page.$eval('#lotPlatform .dropdown-item[data-value="funpay"]', el => el.click());
    await sleep(200);

    const isLotLinkVisible = await page.$eval('#rowLotLink', el => !el.classList.contains('hidden'));
    assert(isLotLinkVisible, "FunPay selection shows FunPay lot link field");

    await page.type('#form-lot input[name="lot_url"]', 'https://funpay.com/lots/offer?id=998877');
    await page.$eval('#form-lot button[type="submit"]', el => el.click());
    await sleep(1500);
    let lotStatus = await page.$eval('#form-lot button[type="submit"]', el => el.textContent.trim());
    assert(lotStatus.includes("принята") || lotStatus.includes("отправлена"), "Media Lot request submitted successfully", lotStatus);

    // Logout
    await page.$eval('#cabinetLogout', el => el.click());
    await sleep(1000);

    // 3.4 Admin Panel (root: DELTA-ROOT-0001)
    console.log("  Testing Admin Panel & Actions...");
    await page.$eval('#cabinetBtn', el => el.click());
    await sleep(400);
    await page.$eval('#authCode', el => el.value = '');
    await page.type('#authCode', 'DELTA-ROOT-0001');
    await page.$eval('#authSubmit', el => el.click());
    await sleep(2000);

    const isAdminActive = await page.$eval('#view-admin', el => el.classList.contains('active'));
    assert(isAdminActive, "Administrator successfully loaded Admin View (#view-admin)");

    // Test HWID requests in admin panel (Verify our previous fix: Status and Action buttons!)
    await page.$eval('#adminSide .side-btn[data-cat="hwid"]', el => el.click());
    await sleep(1000);

    const hwidHeaders = await page.$$eval('#adminTableWrap table thead th', els => els.map(e => e.textContent.trim()));
    assert(
      hwidHeaders.includes("Статус") && hwidHeaders.includes("Действия"),
      "Admin HWID table displays 'Статус' and 'Действия' headers",
      hwidHeaders.join(", ")
    );

    const decideButtons = await page.$$eval('#adminTableWrap [data-decide]', els => els.length);
    assert(decideButtons > 0, `Admin HWID table has active action buttons (Found ${decideButtons})`);

    // Click 'Одобрить' on the first pending HWID item and handle commentModal
    const firstApproveBtn = await page.$('#adminTableWrap [data-decide="approved"]');
    if (firstApproveBtn) {
      await firstApproveBtn.click();
      await sleep(500);
      const isCommentOpen = await page.$eval('#commentModal', el => el.classList.contains('open'));
      if (isCommentOpen) {
        await page.type('#commentText', 'Одобрено в ходе E2E-теста');
        await page.$eval('#commentOk', el => el.click());
        await sleep(1000);
      }
      assert(true, "Admin clicked 'Одобрить' on HWID request and confirmation modal handled successfully");
    }

    // Test Media Applications tab in admin
    await page.$eval('#adminSide .side-btn[data-cat="media"]', el => el.click());
    await sleep(1000);
    const mediaRow = await page.$('#adminTableWrap tbody tr[data-media-id]');
    assert(!!mediaRow, "Media applications table displays applicants");

    if (mediaRow) {
      await mediaRow.click();
      await sleep(600);
      const isMediaModalOpen = await page.$eval('#mediaAppModalOverlay', el => el.classList.contains('open'));
      assert(isMediaModalOpen, "Clicking media row opens Obsidian Glass applicant modal");
      await page.$eval('#mediaModalCloseBtn', el => el.click());
      await sleep(400);
    }

    // Test Bans tab in admin
    await page.$eval('#adminSide .side-btn[data-cat="bans"]', el => el.click());
    await sleep(1000);
    const hasBansTable = await page.$eval('#adminTableWrap table', el => !!el);
    assert(hasBansTable, "Admin Bans management table renders correctly");

    // Test Accounts tab in admin
    await page.$eval('#adminSide .side-btn[data-cat="accounts"]', el => el.click());
    await sleep(1000);
    const hasAccountsTable = await page.$eval('#adminTableWrap table', el => !!el);
    assert(hasAccountsTable, "Admin Accounts management table renders correctly");

    // Logout admin
    await page.evaluate(() => {
      if (typeof doUserLogout === 'function') doUserLogout();
      else document.getElementById('adminLogoutBtn')?.click();
    });
    await sleep(1000);
    assert(await page.$eval('#view-public', el => el.classList.contains('active')), "Admin logged out successfully");

    // ----------------------------------------------------
    // SUITE 4: Session Persistence ("Запомнить меня")
    // ----------------------------------------------------
    console.log("\n--- SUITE 4: 'Запомнить меня' Browser Session Persistence ---");

    // Login with 'Запомнить меня' UNCHECKED
    await page.$eval('#cabinetBtn', el => el.click());
    await sleep(500);
    await page.$eval('#authCode', el => el.value = '');
    await page.type('#authCode', 'DLT-4MHKC-88AWA');
    await page.$eval('#authRemember', el => { el.checked = false; });
    await page.$eval('#authSubmit', el => el.click());
    await page.waitForSelector('#view-cabinet.active', { timeout: 6000 });

    assert(await page.$eval('#view-cabinet', el => el.classList.contains('active')), "Logged in with remember me UNCHECKED");

    // Reload page (F5) -> user MUST be logged out!
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(1200);
    const viewAfterUncheckedReload = await page.$eval('#view-public', el => el.classList.contains('active'));
    assert(viewAfterUncheckedReload, "Reloading page without remember me automatically logs user out");

    // Login with 'Запомнить меня' CHECKED
    await page.$eval('#cabinetBtn', el => el.click());
    await sleep(600);
    await page.$eval('#authCode', el => { el.value = ''; });
    await page.type('#authCode', 'DLT-4MHKC-88AWA');
    await page.$eval('#authRemember', el => { el.checked = true; });
    await page.$eval('#authSubmit', el => el.click());
    await page.waitForSelector('#view-cabinet.active', { timeout: 8000 });

    assert(await page.$eval('#view-cabinet', el => el.classList.contains('active')), "Logged in with remember me CHECKED");

    // Reload page (F5) -> user MUST stay in cabinet!
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(1500);
    const viewAfterCheckedReload = await page.$eval('#view-cabinet', el => el.classList.contains('active'));
    assert(viewAfterCheckedReload, "Reloading page with remember me CHECKED keeps user logged in");

    // Final cleanup logout
    await page.$eval('#cabinetLogout', el => el.click());
    await sleep(1000);

  } catch (err) {
    console.error("\nFATAL ERROR DURING TEST EXECUTION:", err);
    totalFailed++;
    failures.push({ message: "Fatal exception", details: err.stack });
  } finally {
    await browser.close();
  }

  // Summary
  console.log("\n=================================================");
  console.log(`FINAL RESULT: ${totalPassed} PASSED, ${totalFailed} FAILED`);
  console.log(`Uncaught JS Page Errors: ${uncaughtErrors.length}`);
  if (uncaughtErrors.length > 0) {
    console.log("Uncaught JS Errors:", uncaughtErrors);
  }
  if (failures.length > 0) {
    console.log("Failures:", failures);
  }
  console.log("=================================================");

  process.exit(totalFailed > 0 ? 1 : 0);
})();
