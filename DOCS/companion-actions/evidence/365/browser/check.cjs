// Real web app (next dev, 127.0.0.1:3164) against the disposable stack: the #365 edit
// draft and a clear edit command, by keyboard and pointer, at desktop and narrow width,
// in English and Arabic (RTL). Reads the database only through the user's JWT and the
// public action boundary. Model requests are blocked and counted (must stay 0).
const { createRequire } = require('node:module');
const req = createRequire('/tmp/unify-review-actions-361-web-r5-deno-candidate-9d05/package.json');
const { chromium } = req('playwright');
const { createClient } = req('@supabase/supabase-js');
const fs = require('node:fs');
const seed = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const OUT = process.argv[3];
const BASE = 'http://127.0.0.1:3164';
const API = process.env.ACTIONS_API_URL, ANON = process.env.ACTIONS_ANON_KEY;

function contrast(fg, bg) {
  const lum = c => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  return Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100;
}

(async () => {
  const result = { errors: [] };
  const db = createClient(API, ANON, { auth: { persistSession: false } });
  await db.auth.signInWithPassword({ email: seed.email, password: seed.password });
  const row = async () => (await db.from('custom_checklist_tasks').select('title, priority, revision').eq('id', seed.taskId).single()).data;
  const browser = await chromium.launch({ headless: true });
  const run = async (locale, viewport, fn) => {
    const ctx = await browser.newContext({ locale, viewport, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    // The app language, as its language control stores it (cookie and localStorage).
    const lang = locale.startsWith('ar') ? 'ar' : 'en';
    await ctx.addCookies([{ name: 'unify_lang', value: lang, url: BASE }]);
    await ctx.addInitScript(l => { try { localStorage.setItem('i18nextLng', l); localStorage.setItem('user_preferred_language', l); } catch {} }, lang);
    let modelRequests = 0; const actions = [];
    page.on('pageerror', e => result.errors.push(`${locale}: ${e.message}`));
    page.on('request', r => { if (r.url().endsWith('/api/companion/actions')) actions.push(JSON.parse(r.postData() || '{}').action); });
    await page.route('**/api/companion', route => { modelRequests++; return route.abort(); });
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    for (let i = 0; i < 5; i++) {
      await page.locator('input[type="email"]').fill(seed.email);
      await page.locator('input[type="password"]').fill(seed.password);
      if (await page.locator('button[type="submit"]').isEnabled()) break;
      await page.waitForTimeout(1000);
    }
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 30000 });
    // The app's "what's new" tour opens over every page on a first visit: dismiss it
    // as a user would (Skip), once per context.
    page.dismissTour = async () => {
      const skip = page.locator('div.fixed.inset-0').getByRole('button', { name: /^(Skip|تخطٍّ|تخطّي)$/ });
      await skip.first().waitFor({ timeout: 5000 }).then(() => skip.first().click()).catch(() => {});
    };
    const out = await fn(page, actions);
    out.modelRequests = modelRequests;
    out.actionCounts = Object.fromEntries([...new Set(actions)].map(a => [a, actions.filter(x => x === a).length]));
    await ctx.close();
    return out;
  };

  result.desktop = await run('en-CA', { width: 1280, height: 900 }, async (page) => {
    const r = {};
    await page.goto(`${BASE}/companion`);
    await page.dismissTour();
    await page.getByText('First week in Vancouver').first().click();
    const card = page.getByRole('article', { name: 'Suggested change: Get a phone plan' });
    await card.waitFor({ timeout: 30000 });
    r.cardText = (await card.innerText()).split('\n');
    const box = page.getByRole('textbox', { name: /message/i });
    await box.fill('My next question');
    const review = card.getByRole('button', { name: 'Review the suggested change to Get a phone plan' });
    await review.focus(); await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Review change' });
    await dialog.waitFor();
    await page.waitForTimeout(300);
    r.focusOnOpen = await page.evaluate(() => document.activeElement?.textContent);
    r.dialogText = (await dialog.innerText()).split('\n').filter(Boolean);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    r.focusAfterEscape = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    r.composerAfterEscape = await box.inputValue();
    await review.focus(); await page.keyboard.press('Enter');
    await dialog.waitFor();
    const approve = dialog.getByRole('button', { name: 'Save this change to Get a phone plan' });
    await page.waitForFunction(() => document.querySelector('button[aria-label="Save this change to Get a phone plan"]')?.getAttribute('aria-disabled') !== 'true', null, { timeout: 15000 });
    const style = await approve.evaluate(el => { const s = getComputedStyle(el); const rect = el.getBoundingClientRect(); return { color: s.color, bg: s.backgroundColor, w: Math.round(rect.width), h: Math.round(rect.height) }; });
    r.approveContrast = contrast(style.color, style.bg); r.approveSize = [style.w, style.h];
    const nowLine = dialog.getByText('Now: Do soon');
    const nowStyle = await nowLine.evaluate(el => { let n = el, bg = 'rgba(0, 0, 0, 0)'; while (n && (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent')) { bg = getComputedStyle(n).backgroundColor; n = n.parentElement; } return { color: getComputedStyle(el).color, bg }; });
    r.nowContrast = contrast(nowStyle.color, nowStyle.bg);
    const notNow = await dialog.getByRole('button', { name: 'Not now' }).boundingBox();
    r.notNowSize = [Math.round(notNow.width), Math.round(notNow.height)];
    const reviewBox = await review.boundingBox(); r.reviewSize = [Math.round(reviewBox.width), Math.round(reviewBox.height)];
    await approve.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
    await dialog.getByText('Changed in Checklist: Get a phone plan').waitFor({ timeout: 15000 });
    r.receipt = (await dialog.innerText()).split('\n').filter(l => l.includes('→') || l.startsWith('Changed'));
    r.rowAfterApprove = await row();
    await page.keyboard.press('Escape');
    r.composerAfterApprove = await box.inputValue();
    await card.getByText('Saved in Checklist').waitFor();

    // A clear command typed in the real composer (no model request).
    await box.fill('Rename task "Get a phone plan" to "Get a prepaid plan"');
    await box.press('Enter');
    const cmd = page.getByRole('article', { name: 'Changed in Checklist: Get a prepaid plan' });
    await cmd.waitFor({ timeout: 20000 });
    r.commandCard = (await cmd.innerText()).split('\n');
    r.rowAfterCommand = await row();
    await page.goto(`${BASE}/checklist`);
    await page.dismissTour();
    await page.getByText('Get a prepaid plan', { exact: true }).first().waitFor({ timeout: 20000 });
    r.checklistShowsRename = true;
    r.checklistShowsOldTitle = await page.getByText('Get a phone plan', { exact: true }).count();
    return r;
  });

  // The user's saved app language (what the profile language setting writes).
  result.languageSaved = (await db.from('user_onboarding_profiles').update({ preferred_language: 'ar' }).eq('id', seed.userId)).error ?? 'ok';
  result.narrowArabic = await run('ar', { width: 390, height: 844 }, async (page) => {
    const r = {};
    await page.goto(`${BASE}/companion`);
    await page.dismissTour();
    r.dir = await page.evaluate(() => document.documentElement.dir);
    r.lang = await page.evaluate(() => document.documentElement.lang);
    await page.waitForTimeout(1500);
    r.buttonsBefore = (await page.getByRole('button').evaluateAll(els => els.map(e => e.getAttribute('aria-label') || e.textContent.trim()).filter(Boolean))).slice(0, 25);
    await page.screenshot({ path: `${OUT}/narrow-arabic-start.png` });
    // Narrow: the conversation list opens from the chat header's menu control.
    const menu = page.getByRole('button', { name: 'المحادثات' });
    if (await menu.isVisible().catch(() => false)) await menu.click();
    else { console.log(JSON.stringify(r.buttonsBefore)); }
    await page.getByText('First week in Vancouver').first().click();
    const card = page.getByRole('article', { name: /تغيير مقترح/ });
    await card.waitFor({ timeout: 30000 });
    r.cardText = (await card.innerText()).split('\n');
    await card.getByRole('button').click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    await page.waitForTimeout(300);
    r.dialog = await dialog.evaluate(el => { const b = el.getBoundingClientRect(); return { left: Math.round(b.left), right: Math.round(b.right), overflow: el.scrollWidth > el.clientWidth, docOverflow: document.documentElement.scrollWidth > innerWidth }; });
    r.dialogText = (await dialog.innerText()).split('\n').filter(Boolean).slice(0, 14);
    await page.screenshot({ path: `${OUT}/narrow-arabic-review.png` });
    return r;
  });
  await browser.close();
  fs.writeFileSync(`${OUT}/browser-results.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
