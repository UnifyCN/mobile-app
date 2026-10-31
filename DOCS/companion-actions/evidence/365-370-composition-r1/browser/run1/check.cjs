// #365 + #370 composition: the real web app (next dev, 127.0.0.1:3218) against the owned
// disposable stack unify-compose-details-370-r1. One conversation holds a #365 edit draft
// and a #370 detail draft; each opens its own review in the drawer by keyboard and Escape
// returns focus; a typed draft in the composer survives. Then a waiting-reason command and
// a remember command are typed in the real composer; each card names its own saved result;
// the saved-details drawer lists the detail. Reopened at 390 px. Model requests are blocked
// and counted (must stay 0). Reads the database only through the user's JWT.
const { createRequire } = require('node:module');
const req = createRequire('/tmp/unify-review-actions-361-web-r5-deno-base-9d05/package.json');
const { chromium } = req('playwright');
const { createClient } = req('@supabase/supabase-js');
const fs = require('node:fs');
const seed = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const OUT = process.argv[3];
const BASE = 'http://127.0.0.1:3218';
const API = process.env.ACTIONS_API_URL, ANON = process.env.ACTIONS_ANON_KEY;
if (API !== 'http://127.0.0.1:61751') throw new Error('refusing a non-owned stack');
const TASK = 'Get a phone plan';
const DETAIL = 'I can attend appointments on Fridays';

(async () => {
  const result = { errors: [], console: [] };
  const db = createClient(API, ANON, { auth: { persistSession: false } });
  await db.auth.signInWithPassword({ email: seed.email, password: seed.password });
  const row = async () => (await db.from('custom_checklist_tasks')
    .select('priority, progress_state, waiting_reason, revision').eq('id', seed.taskId).single()).data;
  const details = async () => ((await db.from('companion_saved_details').select('body, revision').order('created_at')).data ?? []);
  const browser = await chromium.launch({ headless: true });
  const run = async (name, ctxOpts, fn) => {
    const ctx = await browser.newContext({ locale: 'en-CA', reducedMotion: 'reduce', ...ctxOpts });
    const page = await ctx.newPage();
    await ctx.addCookies([{ name: 'unify_lang', value: 'en', url: BASE }]);
    await ctx.addInitScript(() => { try { localStorage.setItem('i18nextLng', 'en'); localStorage.setItem('user_preferred_language', 'en'); } catch {} });
    let modelRequests = 0; const actions = [];
    page.on('pageerror', e => result.errors.push(`${name}: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') result.console.push(`${name}: ${m.text().slice(0, 300)}`); });
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
    page.openConversation = async () => {
      await page.goto(`${BASE}/companion`);
      const skip = page.locator('div.fixed.inset-0').getByRole('button', { name: /^Skip$/ });
      await skip.first().waitFor({ timeout: 5000 }).then(() => skip.first().click()).catch(() => {});
      const menu = page.getByRole('button', { name: 'Conversations' });
      if (await menu.isVisible().catch(() => false)) await menu.click();
      await page.getByText('First week in Vancouver').first().click();
    };
    page.overflow = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    let out;
    try { out = await fn(page); } catch (e) {
      out = { failure: String(e.message).split('\n')[0] };
      out.articles = await page.getByRole('article').evaluateAll(els => els.map(e => e.getAttribute('aria-label'))).catch(() => []);
      await page.screenshot({ path: `${OUT}/${name}-failure.png` }).catch(() => {});
    }
    out.modelRequests = modelRequests;
    out.actionCounts = Object.fromEntries([...new Set(actions)].map(a => [a, actions.filter(x => x === a).length]));
    await ctx.close();
    return out;
  };
  const lines = async loc => (await loc.innerText()).split('\n').map(s => s.trim()).filter(Boolean);
  const activeLabel = page => page.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.trim());

  result.desktop = await run('desktop', { viewport: { width: 1280, height: 900 } }, async (page) => {
    const r = {};
    await page.openConversation();
    const box = page.getByRole('textbox', { name: /message/i });
    await box.fill('My next question');
    const editCard = page.getByRole('article', { name: `Suggested change: ${TASK}` });
    await editCard.waitFor({ timeout: 20000 });
    r.editDraftCard = await lines(editCard);
    const detailCard = page.getByRole('article', { name: 'Save a personal detail' });
    await detailCard.waitFor({ timeout: 20000 });
    r.detailDraftCard = await lines(detailCard);
    // Each review by keyboard: focus, Enter, the drawer names its own review; Escape back.
    for (const [key, card, name] of [['edit', editCard, `Review the suggested change to ${TASK}`],
      ['detail', detailCard, 'Review the suggested detail: I need an interpreter for appointments']]) {
      const review = card.getByRole('button', { name });
      await review.focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog');
      await dialog.waitFor({ timeout: 15000 });
      await page.waitForTimeout(400);
      r[`${key}DrawerTitle`] = await dialog.getByRole('heading').first().innerText();
      r[`${key}DrawerLines`] = (await lines(dialog)).slice(0, 8);
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
      r[`${key}FocusAfterEscape`] = await activeLabel(page);
    }
    r.composerAfterDrawers = await box.inputValue();
    r.rowBeforeCommands = await row();
    r.detailsBeforeCommands = await details();
    // Commands typed with the keyboard in the real composer.
    await box.fill('');
    await box.focus();
    await page.keyboard.type(`Mark task "${TASK}" as waiting: Appointment on Friday`);
    await page.keyboard.press('Enter');
    const waiting = page.getByRole('article', { name: `${TASK}: Not started → Waiting` });
    await waiting.waitFor({ timeout: 20000 });
    r.waitingCard = await lines(waiting);
    await box.focus();
    await page.keyboard.type(`Remember that ${DETAIL}`);
    await page.keyboard.press('Enter');
    const remembered = page.getByRole('article', { name: 'Saved details' });
    await remembered.getByText(`Saved: “${DETAIL}”.`).waitFor({ timeout: 20000 });
    r.rememberCard = await lines(remembered);
    r.rowAfterCommands = await row();
    r.detailsAfterCommands = await details();
    // The detail card opens the saved details.
    await remembered.getByRole('button', { name: 'View saved details' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ timeout: 15000 });
    await page.waitForTimeout(400);
    r.savedDetailsDrawer = (await lines(dialog)).slice(0, 12);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    r.docOverflow = await page.overflow();
    await page.screenshot({ path: `${OUT}/desktop-compose.png` });
    return r;
  });

  result.narrow390 = await run('narrow390', { viewport: { width: 390, height: 844 } }, async (page) => {
    const r = {};
    await page.openConversation();
    const waiting = page.getByRole('article', { name: /Waiting$/ }).first();
    await waiting.waitFor({ timeout: 20000 });
    r.articles = await page.getByRole('article').evaluateAll(els => els.map(e => e.getAttribute('aria-label')));
    const detail = page.getByRole('article', { name: 'Saved details' });
    await detail.scrollIntoViewIfNeeded();
    r.rememberCard = await lines(detail);
    r.boxes = await page.getByRole('article').evaluateAll(els => els.map(e => {
      const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right), e.scrollWidth > e.clientWidth];
    }));
    r.docOverflow = await page.overflow();
    await page.screenshot({ path: `${OUT}/narrow390-compose.png` });
    return r;
  });
  await browser.close();
  fs.writeFileSync(`${OUT}/browser-results.json`, JSON.stringify(result, null, 1));
  console.log(JSON.stringify(result, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
