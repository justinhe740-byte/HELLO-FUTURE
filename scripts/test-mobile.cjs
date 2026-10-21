/* Development-only browser checks. No dependency is loaded by the website itself. */
const { chromium, webkit, devices } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const output = process.env.HELLO_FUTURE_TEST_OUTPUT || '/tmp/hello-future-mobile-results';
fs.mkdirSync(output, { recursive: true });
const results = [];
const errors = [];
const servers = [];
const openBrowsers = [];
function pass(engine, name) { results.push({ engine, name }); console.log('PASS', engine, name); }
async function screenshot(page, filename) { await page.screenshot({ path: path.join(output, filename), fullPage: true }); }
async function imageReady(page) {
  await page.waitForFunction(() => {
    const img = document.getElementById('fallback-image');
    return !document.getElementById('export-fallback').hidden && img.complete && img.naturalWidth === 1200;
  });
  assert.deepEqual(await page.locator('#fallback-image').evaluate(img => [img.naturalWidth, img.naturalHeight]), [1200, 1800]);
}
async function journey(page, planet = 0) {
  await page.locator('#skip-intro').tap();
  await page.locator('#begin').tap();
  await page.locator(`[data-planet="${planet}"]`).tap();
  await page.locator('#portal-continue').tap();
  for (const [name, value] of [['world', 2], ['hero', 1], ['power', 3]]) {
    await page.locator(`input[name="${name}"][value="${value}"] + .option-inner`).tap();
  }
  await page.locator('#create-world').tap();
  await page.waitForSelector('#result:not([hidden])');
  assert((await page.locator('#result-sub').textContent()).includes('City Among Stars'));
  assert((await page.locator('#result-sub').textContent()).includes('A Little Explorer'));
  assert.equal(await page.locator('#ability-name').textContent(), 'Make Plants Glow');
  await page.locator('#make-gift').tap();
  await page.locator('#baby-name').fill('小星星');
  await page.locator('#save-gift').tap();
  await imageReady(page);
}
(async () => {
  const html = fs.readFileSync(path.join(root, 'index.html'));
  const server = http.createServer((request, response) => {
    if (request.url === '/hello-future/' || request.url === '/hello-future/index.html') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end(html);
    } else if (request.url === '/favicon.ico') { response.writeHead(204); response.end(); }
    else { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); servers.push(server);
  const url = `http://127.0.0.1:${server.address().port}/hello-future/`;
  for (const engine of [chromium, webkit].filter(engine => !process.env.HELLO_FUTURE_ENGINE || engine.name() === process.env.HELLO_FUTURE_ENGINE)) {
    const name = engine.name();
    const launch = name === 'webkit' && process.env.WEBKIT_EXECUTABLE ? { executablePath: process.env.WEBKIT_EXECUTABLE } : name === 'chromium' && fs.existsSync('/usr/bin/chromium') ? { executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] } : {};
    const browser = await engine.launch({ headless: true, ...launch }); openBrowsers.push(browser);
    const version = browser.version();
    for (const agent of ['Safari', 'WeChat']) {
      const options = { ...devices['iPhone 13'], reducedMotion: 'reduce', acceptDownloads: true };
      if (agent === 'WeChat') options.userAgent += ' MicroMessenger/8.0.54';
      const context = await browser.newContext(options);
      const page = await context.newPage(); const downloads = []; const network = [];
      page.on('pageerror', error => errors.push({ engine: name, agent, message: error.message }));
      page.on('console', message => { if (message.type() === 'error') errors.push({ engine: name, agent, message: message.text(), location: message.location() }); });
      page.on('request', request => network.push(request.url()));
      page.on('download', download => downloads.push(download));
      // Remove APIs absent on older WebViews; the core PNG path must not need them.
      await page.addInitScript(() => {
        CanvasRenderingContext2D.prototype.roundRect = undefined;
        HTMLCanvasElement.prototype.toBlob = undefined;
        window.FileReader = undefined;
        URL.createObjectURL = undefined;
        delete HTMLElement.prototype.inert;
      });
      await page.goto(url); await context.setOffline(true);
      await journey(page);
      assert.equal(downloads.length, 0, 'iPhone/WeChat should stay on the inline PNG, not initiate a download');
      assert.equal(await page.locator('#saved-note').textContent(), '長按圖片儲存到相片');
      if (await page.evaluate(() => CSS.supports('-webkit-touch-callout', 'default'))) assert.equal(await page.locator('#fallback-image').evaluate(img => getComputedStyle(img).webkitTouchCallout), 'default');
      assert(await page.locator('#fallback-image').evaluate(img => img.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))));
      assert((await page.locator('#fallback-image').getAttribute('src')).startsWith('data:image/png;base64,'));
      const png = Buffer.from((await page.locator('#fallback-image').getAttribute('src')).split(',')[1], 'base64');
      assert.equal(png.readUInt32BE(16), 1200); assert.equal(png.readUInt32BE(20), 1800);
      fs.writeFileSync(path.join(output, `${name}-${agent}-gift.png`), png);
      pass(name, `${version} / ${agent} UA: full touch journey at DPR 3, no roundRect/toBlob/FileReader/Blob-URL/inert dependency; decoded 1200x1800 inline PNG`);
      const checked = await page.locator('input:checked').evaluateAll(inputs => inputs.map(input => input.name + ':' + input.value));
      await page.locator('#lang-en').tap(); await imageReady(page);
      assert.equal(await page.locator('#saved-note').textContent(), 'Press and hold the image to save it to Photos.');
      assert.equal(await page.locator('#baby-name').inputValue(), '小星星');
      assert.deepEqual(await page.locator('input:checked').evaluateAll(inputs => inputs.map(input => input.name + ':' + input.value)), checked);
      await page.locator('#lang-yue').tap(); await imageReady(page);
      assert.equal(await page.locator('#saved-note').textContent(), '長按圖片儲存到相片');
      pass(name, `${agent}: switching languages regenerates the displayed PNG and preserves choices/name`);
      await screenshot(page, `${name}-${agent}-gift-page.png`);
      // Touch all three planets and all options, retaining existing selections through orientation changes.
      await page.locator('#back-result').tap(); await page.locator('#back-create').tap(); await page.locator('#back-universe').tap();
      for (const planet of [0, 1, 2]) {
        await page.locator(`[data-planet="${planet}"]`).tap(); await page.locator('#portal-continue').tap();
        assert(await page.locator('#create').isVisible());
        for (const [group, count] of [['world', 5], ['hero', 4], ['power', 5]]) {
          for (let i = 0; i < count; i++) {
            await page.locator(`input[name="${group}"][value="${i}"] + .option-inner`).tap();
            assert(await page.locator(`input[name="${group}"][value="${i}"]`).isChecked());
          }
        }
        await page.locator('#back-universe').tap();
      }
      pass(name, `${agent}: all three planets and every radio choice respond to taps; back paths stay usable`);
      await page.locator('[data-planet="0"]').tap(); await page.locator('#portal-continue').tap();
      const selected = await page.locator('input:checked').evaluateAll(inputs => inputs.map(input => input.value));
      for (const [width, height] of [[320,568],[375,667],[390,844],[430,932],[844,390],[390,844]]) {
        await page.setViewportSize({ width, height });
        await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
        for (const screen of ['awakening','universe','create','result','gift']) {
          await page.evaluate(screen => navigate(screen, false), screen);
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: overflow ${screen} ${width}`);
        }
        assert.deepEqual(await page.locator('input:checked').evaluateAll(inputs => inputs.map(input => input.value)), selected);
      }
      pass(name, `${agent}: portrait/landscape and all five screens fit 320–844px without horizontal overflow or lost choices`);
      await page.evaluate(() => navigate('create', false));
      await page.evaluate(() => { for (let i = 0; i < 12; i++) document.getElementById('creation-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); });
      await page.waitForSelector('#result:not([hidden])'); assert.equal(await page.locator('#create-world').isDisabled(), false);
      assert.equal(await page.locator('#creation-form').getAttribute('aria-busy'), 'false');
      await page.locator('#make-gift').tap();
      // Deliberate encoder failure must unlock controls and allow a successful retry.
      await page.evaluate(() => { window.originalPNG = HTMLCanvasElement.prototype.toDataURL; HTMLCanvasElement.prototype.toDataURL = () => { throw new Error('Simulated encoder failure'); }; });
      await page.locator('#save-gift').tap(); await page.waitForSelector('#export-error:not([hidden])');
      assert.equal(await page.locator('#save-gift').isDisabled(), false); assert.equal(await page.locator('#baby-name').isDisabled(), false);
      await page.evaluate(() => { HTMLCanvasElement.prototype.toDataURL = window.originalPNG; });
      await page.locator('#save-gift').tap(); await imageReady(page);
      await page.evaluate(() => { window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })); window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
      await imageReady(page);
      pass(name, `${agent}: rapid repeated creation is guarded; PNG failure recovers; inline image survives persisted page hide/show`);
      assert.equal(network.filter(request => !request.startsWith(url)).length, 0, 'No external application resources');
      await context.close();
    }
    // Old dynamic-viewport fallback, unavailable audio, and minimum touch targets.
    const fallback = await browser.newContext({ ...devices['iPhone 13'], reducedMotion: 'reduce' });
    const fp = await fallback.newPage();
    await fp.addInitScript(() => {
      const native = CSS.supports.bind(CSS); CSS.supports = (...args) => args[0] === 'height' && args[1] === '100dvh' ? false : native(...args);
      window.AudioContext = window.webkitAudioContext = undefined;
    });
    await fp.goto(url);
    assert.equal(await fp.evaluate(() => document.documentElement.style.getPropertyValue('--app-height')), (await fp.evaluate(() => innerHeight)) + 'px');
    await fp.locator('#sound').tap(); await fp.locator('#skip-intro').tap(); await fp.locator('#begin').tap();
    const targets = await fp.locator('#sound, .languages button').evaluateAll(elements => elements.map(el => { const r = el.getBoundingClientRect(); return [r.width, r.height]; }));
    for (const [w, h] of targets) assert(w >= 44 && h >= 44);
    assert.equal(await fp.locator('#baby-name').evaluate(el => getComputedStyle(el).fontSize), '16px');
    pass(name, '100vh/innerHeight fallback, unavailable audio, 44px utility touch targets, and non-zooming 16px name input');
    if (name === 'chromium') {
      const session = await fallback.newCDPSession(fp);
      await session.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, bottom: 34, left: 0, right: 0 } });
      const inset = await fp.locator('.shell').evaluate(el => [getComputedStyle(el).paddingTop, getComputedStyle(el).paddingBottom]);
      assert.deepEqual(inset, ['59px', '34px']);
      await session.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, bottom: 21, left: 59, right: 59 } });
      await fp.setViewportSize({ width: 844, height: 390 });
      const horizontal = await fp.locator('.shell').evaluate(el => [parseFloat(getComputedStyle(el).paddingLeft), parseFloat(getComputedStyle(el).paddingRight)]);
      assert(horizontal.every(value => value >= 59));
      pass(name, 'Simulated notch 59px / home inset 34px and landscape side insets are applied');
    }
    await fallback.close();
    const animated = await browser.newContext({ ...devices['iPhone 13'], reducedMotion: 'no-preference' });
    const ap = await animated.newPage(); ap.on('pageerror', error => errors.push({engine:name, agent:'animated',message:error.message}));
    await ap.goto(url); assert(await ap.locator('#skip-intro').isVisible());
    await ap.waitForTimeout(6700); assert.equal(await ap.locator('.intro-content').evaluate(el => getComputedStyle(el).opacity), '1');
    await ap.locator('#begin').tap(); await ap.locator('[data-planet="2"]').tap();
    await ap.waitForSelector('#create:not([hidden])', {timeout:6000});
    await ap.locator('#create-world').tap(); assert(await ap.locator('#generating').isVisible());
    await ap.waitForSelector('#result:not([hidden])', {timeout:6000});
    pass(name, 'Non-reduced iPhone viewport: opening completes, planet transition auto-advances, generation animation releases navigation');
    await animated.close(); await browser.close(); openBrowsers.pop();
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ results, errors, realDevices: 'Not tested: physical iPhone Safari, physical WeChat iOS and OS Photos save menu.', hosting: 'Local HTTP Project Pages subpath; public GitHub HTTPS is not yet deployed.' }, null, 2));
  console.log('TOTAL', results.length, 'passed; no page/console errors. Real-device acceptance remains unverified.');
  await new Promise(resolve => server.close(resolve)); servers.pop();
})().catch(async error => {
  console.error(error); fs.writeFileSync(path.join(output, 'failure.txt'), String(error.stack || error));
  for (const browser of openBrowsers) await browser.close().catch(() => {});
  for (const server of servers) server.close();
  process.exitCode = 1;
});
