import { test, expect, type Page } from '@playwright/test';

function markToursSeen() {
  for (const t of ['welcome', 'dashboard', 'council', 'agents', 'forge', 'memory', 'analytics', 'settings']) {
    localStorage.setItem('aic_tour_' + t, '1');
  }
}
async function waitForBoot(page: Page) {
  // the boot screen runs real checks, then shows the app
  await page.locator('#main-content').waitFor({ timeout: 30000 });
}

/** Scripted backend: every agent answers, votes agree, the chairman resolves. */
async function mockBackend(page: Page) {
  await page.route('**/api/health', r => r.fulfill({ json: { status: 'ok', version: 'e2e' } }));
  await page.route('**/api/models/**', r => r.fulfill({ json: { models: [] } }));
  await page.route('**/api/vote', r => r.fulfill({ json: { vote: 'agree', reasoning: 'Sound plan.' } }));
  await page.route('**/api/chat', async r => {
    const body = r.request().postDataJSON();
    const prompt: string = body.messages[body.messages.length - 1].content;
    const name = /You are ([A-Z]+),/.exec(body.messages[0].content)?.[1] ?? 'AGENT';
    const text = prompt.includes('You are chairing') ? '## Consensus\n- Ship the trial.\n## Next steps\n1. Build it.'
      : prompt.includes('draft ONE concrete decision') ? 'Ship a 14-day trial.'
        : `${name} thinks we should test it first.`;
    if (!body.stream) return r.fulfill({ json: { content: text } });
    const sse = text.split(' ').map(w => `data: ${JSON.stringify({ content: w + ' ' })}\n\n`).join('') + 'data: [DONE]\n\n';
    await r.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: sse });
  });
}

test.describe('AI Council - Core Flows', () => {
  test.beforeEach(async ({ page }) => {
    // The guided tour opens on first visit; these tests are about the screens.
    await page.addInitScript(markToursSeen);
    await page.goto('/');
    await waitForBoot(page);
  });

  test('loads dashboard and shows agents', async ({ page }) => {
    await expect(page.locator('text=DASHBOARD')).toBeVisible();
    // "AGENTS" also labels the sidebar nav item, and agent names/mode text
    // repeats in the sidebar footer ("v2.0.0 NEXUS") — scope to the page
    // content to get the dashboard's own elements.
    const main = page.locator('#main-content');
    await expect(main.getByText('AGENTS')).toBeVisible();
    // Should show 5 default agents
    await expect(main.getByText('APEX')).toBeVisible();
    await expect(main.getByText('NEXUS')).toBeVisible();
  });

  test('navigate to council room', async ({ page }) => {
    await page.click('text=COUNCIL ROOM');
    await expect(page.locator('text=COUNCIL ROOM')).toBeVisible();
    // Input should be present
    await expect(page.locator('textarea[placeholder*="Address the council"]')).toBeVisible();
  });

  test('send user message triggers agent responses', async ({ page }) => {
    await page.click('text=COUNCIL ROOM');
    await page.fill('textarea[placeholder*="Address the council"]', 'Test topic for debate');
    await page.press('textarea[placeholder*="Address the council"]', 'Enter');

    // Should show user message
    await expect(page.locator('text=Test topic for debate')).toBeVisible();
    // Should show thinking indicator for agents — every active agent gets
    // one, so just confirm at least one is up.
    await expect(page.locator('text=thinking...').first()).toBeVisible({ timeout: 5000 });
  });

  test('open forge panel', async ({ page }) => {
    await page.click('text=FORGE');
    // "FORGE" alone also matches the nav button and the commit button, and
    // "API" matches the sidebar's "API GATEWAY" status line — scope to the
    // page content for the panel's own heading and face tabs.
    const main = page.locator('#main-content');
    await expect(main.getByText('AGENT FORGE')).toBeVisible();
    await expect(main.getByText('API')).toBeVisible();
    await expect(main.getByText('MIND')).toBeVisible();
    await expect(main.getByText('CAPS')).toBeVisible();
  });

  test('settings page shows providers', async ({ page }) => {
    await page.click('text=SETTINGS');
    // "SETTINGS" also labels the sidebar nav item, and the page's own
    // subtitle ("Configure API providers…") contains a case-insensitive
    // substring match for "API PROVIDERS" — scope to content and require
    // an exact match for the section heading.
    await expect(page.locator('#main-content').getByText('SETTINGS')).toBeVisible();
    await expect(page.getByText('API PROVIDERS', { exact: true })).toBeVisible();
    await expect(page.locator('text=OpenAI')).toBeVisible();
    await expect(page.locator('text=Anthropic')).toBeVisible();
  });

  test('theme and responsive layout', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await waitForBoot(page);

    // Bottom nav should be visible on mobile. "Council" also appears in
    // dashboard copy ("AI Council Session", "ENTER COUNCIL"…), so scope
    // to the nav buttons by their accessible name.
    await expect(page.getByRole('button', { name: 'Navegar a Home' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Navegar a Council' })).toBeVisible();

    // Test desktop viewport
    await page.setViewportSize({ width: 1280, height: 720 });
    // Sidebar should be visible on desktop
    await expect(page.locator('text=DASHBOARD')).toBeVisible();
  });

  test('full meeting: debate, AI proposal, vote, chairman, export, reload', async ({ page }) => {
    await mockBackend(page);
    await page.reload();
    await waitForBoot(page);
    const main = page.locator('#main-content');
    await main.locator('[data-tour="new-meeting"]').first().click();
    await page.fill('textarea[placeholder="What should the council decide?"]', 'Trial or freemium?');
    await page.click('button:has-text("START MEETING")');
    await expect(main.getByText('APEX thinks we should test it first.')).toBeVisible({ timeout: 15000 });
    await expect(main.getByText('LYRA thinks we should test it first.')).toBeVisible({ timeout: 15000 });

    await page.click('[data-tour="vote"] >> visible=true');
    await page.click('button[title="An agent drafts a proposal from the debate"]');
    await expect(page.locator('input[placeholder="Decision to vote on..."]')).toHaveValue('Ship a 14-day trial.');
    await page.click('button:has-text("SUBMIT")');
    await expect(main.getByText('DECISION RECORDED')).toBeVisible({ timeout: 15000 });
    await expect(main.getByText('Sound plan.').first()).toBeVisible();

    await page.click('[data-tour="conclude"] >> visible=true');
    await expect(main.getByText('COUNCIL RESOLUTION')).toBeVisible({ timeout: 15000 });
    await expect(main.getByText('Ship the trial.')).toBeVisible();

    const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-tour="export"] >> visible=true')]);
    expect(download.suggestedFilename()).toMatch(/\.md$/);

    await page.reload();
    await waitForBoot(page);
    await page.click('[data-tour="nav-council"] >> visible=true');
    await expect(main.getByText('COUNCIL RESOLUTION')).toBeVisible();
  });

  test('guided tour opens on first visit and ? replays it', async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto('/');
    await expect(page.locator('.tour-card')).toBeVisible({ timeout: 30000 });
    await page.keyboard.press('Escape');
    await expect(page.locator('.tour-card')).toHaveCount(0);
    await page.click('[data-tour="help"] >> visible=true');
    await expect(page.locator('.tour-card')).toBeVisible();
    await page.close();
  });
});