// End-to-end checks of the planner as GitHub Pages serves it (see
// playwright.config.js). Runs against a local sub-path server by default,
// or a live deployment when E2E_BASE_URL is set.
const { test, expect } = require('@playwright/test');

// Fail on any console error, uncaught exception or broken request, and on any
// same-origin request outside the project sub-path (a root-absolute URL works
// on localhost:8000 but 404s on <owner>.github.io/<repo>/).
test.beforeEach(async ({ page, baseURL }) => {
  const base = new URL(baseURL);
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => problems.push('failed: ' + r.url()));
  page.on('response', (r) => { if (r.status() >= 400) problems.push(r.status() + ': ' + r.url()); });
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.origin === base.origin && !u.pathname.startsWith(base.pathname)) problems.push('outside base path: ' + r.url());
  });
  page.problems = problems;
});

test.afterEach(async ({ page }) => {
  expect(page.problems, 'console errors / broken requests').toEqual([]);
});

async function openTab(page, name) {
  await page.getByRole('tab', { name }).click();
  await expect(page.locator('#tab-' + name.toLowerCase())).toHaveClass(/active/);
}

test('loads the recommended design with every requirement met', async ({ page }) => {
  await page.goto('./');
  await expect(page).toHaveTitle(/SunPage/);
  await expect(page.locator('#statusText')).toHaveText('All requirements met');
  await expect(page.locator('#statusBadge')).toHaveClass(/ok/);
  await expect(page.locator('#kpis .kpi')).not.toHaveCount(0);
  await expect(page.locator('#controlPanel details.ctl-group')).toHaveCount(6);
  await expect(page.locator('#checklist li')).not.toHaveCount(0);
  await expect(page.locator('#sld svg')).toBeVisible();
  // Wires are drawn under the boxes so no line crosses a label.
  const order = await page.locator('#sld svg > *').evaluateAll((els) =>
    els.map((e) => (e.querySelector(':scope > polyline') ? 'wire' : e.classList.contains('part') ? 'part' : '')));
  expect(order.lastIndexOf('wire')).toBeLessThan(order.indexOf('part'));

  // The step list explains the drawing one step at a time.
  await expect(page.locator('.bp-steps button')).toHaveCount(6);
  await page.locator('.bp-steps button[data-step="2"]').click();
  await expect(page.locator('.blueprint')).toHaveClass(/focus/);
  await expect(page.locator('.blueprint .part.on').first()).toContainText('280Ah');
  await expect(page.locator('#designSummary')).toContainText('FlexBOSS21');
  // The page leads with the answer in one sentence.
  await expect(page.locator('#intro-overview')).toContainText('meet all 11 challenge requirements');
});

test('every tab renders its content', async ({ page }) => {
  await page.goto('./');

  await openTab(page, 'Energy');
  for (const id of ['dayChart', 'daySocChart', 'monthChart', 'socChart']) {
    await expect(page.locator('#' + id + ' svg')).toBeVisible();
  }
  await expect(page.locator('#autonomyTable table')).toBeVisible();

  await openTab(page, 'Generator');
  await expect(page.locator('#automation')).not.toBeEmpty();
  // The 20-year strategy comparison runs automatically on first visit.
  await expect(page.locator('#compareOut table')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('#compareOut')).toContainText('Forecast-aware');
  await expect(page.locator('#genYearChart svg')).toBeVisible();

  await openTab(page, 'Budget');
  await expect(page.locator('#budgetTable')).toContainText('Total installed cost');
  await expect(page.locator('#lifeChart svg')).toBeVisible();
  await expect(page.locator('#gridCompare')).toContainText('BC Hydro');

  await openTab(page, 'Assumptions');
  await expect(page.locator('#assumptions')).toContainText('Sources');
});

test('optimizer maps every design, and a square loads that design', async ({ page }) => {
  await page.goto('./');
  await openTab(page, 'Optimizer');
  const cells = page.locator('#heatmap .cell[data-ok]');
  await expect(cells.first()).toBeVisible({ timeout: 110000 });
  await expect(page.locator('#heatmap .mark-label')).not.toHaveCount(0);

  const pick = cells.first();
  const panels = await pick.getAttribute('data-col');
  const batteries = await pick.getAttribute('data-row');
  await pick.click();
  await expect(page.locator('#ctl-panels')).toHaveValue(panels);
  await expect(page.locator('#ctl-batteries')).toHaveValue(batteries);
});

test('suggestions: every tier passes, sets the sliders, and matches the budget', async ({ page }) => {
  await page.goto('./#suggestions');
  await expect(page.locator('#projectionFlow')).toContainText('Test every acceptable mix');
  await expect(page.locator('#projectionNote')).toContainText('include the modelled GST/PST, and exclude rebates');
  const tiers = page.locator('#tiers .tier');
  await expect(tiers.first()).toBeVisible({ timeout: 110000 });
  expect(await tiers.count()).toBeGreaterThanOrEqual(3);
  // Every tier meets all the requirements.
  const met = page.locator('#tierTable tr', { hasText: 'Requirements met' });
  await expect(met).toBeVisible();
  for (const cell of await met.locator('td.num').all()) await expect(cell).toHaveText('11 / 11');

  // Use tier 1: the sliders move to it and it becomes the design in use.
  const use = page.locator('#tiers .tier[data-tier="1"] button');
  const panels = await use.getAttribute('data-panels');
  const batteries = await use.getAttribute('data-batteries');
  const lifetime = (await page.locator('#tiers .tier[data-tier="1"] .tier-facts dd').first().textContent()).trim();
  await use.click();
  await expect(page.locator('#ctl-panels')).toHaveValue(panels);
  await expect(page.locator('#ctl-batteries')).toHaveValue(batteries);
  await expect(page.locator('#tiers .tier[data-tier="1"]')).toContainText('In use');
  await expect(page.locator('#ctl-panels ~ .ticks .tick.on')).toHaveCount(1);
  await expect(page.locator('#statusText')).toHaveText('All requirements met');

  // Its 25-year cost is the same number the Budget tab shows.
  await openTab(page, 'Budget');
  await expect(page.locator('#budgetKpis .kpi').nth(3).locator('.kpi-value')).toHaveText(lifetime);
});

test('a control change recomputes, persists across reload, and resets', async ({ page }) => {
  await page.goto('./');
  const total = page.locator('#kpis');
  const before = await total.textContent();

  await page.locator('#ctl-panels').fill('40');
  await expect(page.locator('#val-panels')).toHaveText('40');
  await expect(total).not.toHaveText(before);

  await page.reload();
  await expect(page.locator('#ctl-panels')).toHaveValue('40');

  await page.locator('#resetBtn').click();
  await expect(page.locator('#ctl-panels')).toHaveValue('92');
  await expect(total).toHaveText(before);
});

test('hash deep-links open a tab', async ({ page }) => {
  await page.goto('./#budget');
  await expect(page.locator('#tab-budget')).toHaveClass(/active/);
  await expect(page.locator('#budgetTable')).toContainText('Total installed cost');
});

test('budget exports as CSV', async ({ page }) => {
  await page.goto('./#budget');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#csvBtn').click()]);
  expect(download.suggestedFilename()).toBe('victoria-offgrid-budget.csv');
  const fs = require('fs');
  const csv = fs.readFileSync(await download.path(), 'utf8');
  expect(csv).toMatch(/^"Category","Item"/);
  expect(csv).toContain('Total installed cost');
});

test('generator and cost settings update the budget totals', async ({ page }) => {
  await page.goto('./#budget');
  const installed = page.locator('#budgetKpis .kpi').first().locator('.kpi-value');
  const lifecycle = page.locator('#budgetKpis .kpi').nth(2).locator('.kpi-value');
  const installedBefore = await installed.textContent();
  const lifecycleBefore = await lifecycle.textContent();

  // Fuel is a running cost: it changes the lifecycle total, not installation.
  await page.locator('#controlPanel details.ctl-group').nth(3).evaluate((el) => { el.open = true; });
  await page.locator('#ctl-genCostPerKwh').fill('3');
  await expect(lifecycle).not.toHaveText(lifecycleBefore);
  await expect(installed).toHaveText(installedBefore);

  // Carbon pricing is a separate generator operating-cost input.
  const lifecycleAfterFuel = await lifecycle.textContent();
  await page.locator('#ctl-genCarbonPricePerKwh').fill('0.2');
  await expect(lifecycle).not.toHaveText(lifecycleAfterFuel);
  await expect(installed).toHaveText(installedBefore);

  // Electrician labour is an installed cost, so both totals must update.
  const lifecycleAfterCarbon = await lifecycle.textContent();
  await page.locator('#controlPanel details.ctl-group').nth(5).evaluate((el) => { el.open = true; });
  await page.locator('#ctl-electricianRate').fill('200');
  await expect(installed).not.toHaveText(installedBefore);
  await expect(lifecycle).not.toHaveText(lifecycleAfterCarbon);
});

test('in-browser unit test page passes', async ({ page }) => {
  await page.goto('./tests/index.html');
  const results = await page.waitForFunction(() => {
    const r = window.TestRunner && window.TestRunner.getResults();
    return r && r.total > 0 ? { total: r.total, failed: r.failed } : null;
  });
  const r = await results.jsonValue();
  expect(r.failed).toBe(0);
  expect(r.total).toBeGreaterThan(40);
});

test('every tab explains itself: an intro, and a caption on every chart', async ({ page }) => {
  await page.goto('./');
  for (const name of ['Overview', 'Suggestions', 'Energy', 'Generator', 'Optimizer', 'Budget', 'Assumptions', 'Layout']) {
    await page.getByRole('tab', { name }).click();
    const panel = page.locator('#tab-' + name.toLowerCase());
    await expect(panel.locator('.intro')).not.toBeEmpty();
    const uncaptioned = await panel.locator('.chart').evaluateAll((charts) => charts
      .filter((c) => !(c.closest('.card')?.querySelector('.caption')?.textContent.trim()))
      .map((c) => c.id));
    expect(uncaptioned, 'charts without a caption').toEqual([]);
  }
});

test('layout is an optional movable visual and does not change the budget', async ({ page }) => {
  await page.goto('./#layout');
  await expect(page.locator('#layoutSvg')).toBeVisible();
  await expect(page.locator('#layoutReadout')).toContainText('92 panels');
  const budgetBefore = await page.locator('#kpis').textContent();
  const box = await page.locator('.array-hit').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 20);
  await page.mouse.up();
  await expect(page.locator('#layoutSvg .layout-array')).toBeVisible();
  await expect(page.locator('#kpis')).toHaveText(budgetBefore);
  await expect(page.getByRole('tab', { name: 'Layout' })).toBeVisible();
});

test('settings read in plain units', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#val-genReplaceCost')).toHaveText('$3,500');
  await expect(page.locator('#val-omPerYear')).toHaveText('$300/yr');
  await expect(page.locator('#val-genReplaceAtEff')).toHaveText('70%');
  await expect(page.locator('#val-designLowC')).toHaveText('−16.0 °C');
});

test('tabs and the URL hash stay in sync', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('tab', { name: 'Energy' }).click();
  await expect(page).toHaveURL(/#energy$/);
  await expect(page.locator('#tab-energy')).toHaveClass(/active/);

  // In-page hash change (a link, or the back button) switches tabs too.
  await page.evaluate(() => { location.hash = 'assumptions'; });
  await expect(page.locator('#tab-assumptions')).toHaveClass(/active/);
  await page.goBack();
  await expect(page.locator('#tab-energy')).toHaveClass(/active/);

  // Unknown hashes fall back to the first tab.
  await page.goto('./#nope');
  await expect(page.locator('#tab-overview')).toHaveClass(/active/);
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('fits the screen and opens settings as a drawer', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#kpis .kpi').first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    const slider = page.locator('#ctl-panels');
    await expect(slider).not.toBeInViewport();
    await page.locator('#settingsBtn').click();
    await expect(slider).toBeInViewport();
    await page.locator('.content').click({ position: { x: 380, y: 400 } });
    await expect(slider).not.toBeInViewport();
  });
});
