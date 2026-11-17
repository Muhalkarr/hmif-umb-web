import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { test, expect } from '@playwright/test';
import { createServer } from 'vite';

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'hmif-browser-e2e-'));
const adminNim = 'browser-e2e-admin';
const adminPassword = randomBytes(24).toString('base64url');
const memberNim = 'browser-e2e-member';
const memberPassword = randomBytes(24).toString('base64url');
const organizerNim = 'browser-e2e-organizer';
const organizerPassword = randomBytes(24).toString('base64url');
const frontendOrigin = 'http://127.0.0.1:5174';
let apiOrigin;
let adminCookie;
let adminCookieName;
let adminCookieValue;
let db;
let server;
let wsStatsService;
let vite;

test.beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '0';
  process.env.JWT_SECRET = randomBytes(48).toString('base64url');
  process.env.FRONTEND_ORIGINS = frontendOrigin;
  process.env.ALLOW_PUBLIC_REGISTRATION = 'false';
  process.env.INITIAL_ADMIN_NIM = adminNim;
  process.env.INITIAL_ADMIN_PASSWORD = adminPassword;
  process.env.DATABASE_FILE = path.join(temporaryDirectory, 'database.sqlite');
  process.env.ASSET_STORAGE_DIR = path.join(temporaryDirectory, 'assets');

  ({ server, wsStatsService } = await import('../server/index.js'));
  ({ db } = await import('../server/db.js'));
  if (!server.listening) await once(server, 'listening');
  apiOrigin = `http://127.0.0.1:${server.address().port}`;
  process.env.HMIF_API_TARGET = apiOrigin;

  vite = await createServer({
    configFile: path.resolve('vite.config.js'),
    server: { host: '127.0.0.1', port: 5174, strictPort: true }
  });
  await vite.listen();

  const loginResponse = await fetch(`${apiOrigin}/api/auth/login`, {
    method: 'POST',
    headers: { Origin: frontendOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ nim: adminNim, password: adminPassword })
  });
  const loginPayload = await loginResponse.json();
  adminCookie = loginResponse.headers.get('set-cookie')?.split(';')[0];
  assert.equal(loginResponse.status, 200, loginPayload.error || 'Synthetic admin login failed.');
  assert.ok(adminCookie, 'Admin login cookie missing.');
  [adminCookieName, adminCookieValue] = adminCookie.split('=');

  const createMemberResponse = await fetch(`${apiOrigin}/api/admin/users`, {
    method: 'POST',
    headers: {
      Origin: frontendOrigin,
      Cookie: adminCookie,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      nim: memberNim,
      name: 'Synthetic Browser Member',
      password: memberPassword,
      generation: '2026',
      division: 'Anggota'
    })
  });
  const memberPayload = await createMemberResponse.json();
  assert.equal(createMemberResponse.status, 201, memberPayload.error || 'Synthetic member creation failed.');
  const createOrganizerResponse = await fetch(`${apiOrigin}/api/admin/users`, {
    method: 'POST',
    headers: {
      Origin: frontendOrigin,
      Cookie: adminCookie,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      nim: organizerNim,
      name: 'Synthetic Browser Organizer',
      password: organizerPassword,
      generation: '2026',
      division: 'Sekretariat'
    })
  });
  const organizerPayload = await createOrganizerResponse.json();
  assert.equal(createOrganizerResponse.status, 201, organizerPayload.error || 'Synthetic organizer creation failed.');
  const permissionResponse = await fetch(`${apiOrigin}/api/admin/users/${organizerNim}/meeting-organizer`, {
    method: 'PUT',
    headers: { Origin: frontendOrigin, Cookie: adminCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: true })
  });
  assert.equal(permissionResponse.status, 200, 'Explicit meeting capability grant failed.');
});

test.afterAll(async () => {
  if (vite) await vite.close();
  if (wsStatsService) wsStatsService.close();
  if (server?.listening) {
    const closed = new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    server.closeAllConnections();
    server.closeIdleConnections();
    await closed;
  }
  if (db) db.close();
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

test('member and organizer can use Support Desk, LMS, and private meetings on mobile', async ({ page, browser }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(frontendOrigin);
  await page.locator('#auth-action-btn').click();
  await page.locator('#login-nim').fill(memberNim);
  await page.locator('#login-password').fill(memberPassword);
  await page.locator('#login-form button[type="submit"]').click();

  await expect(page.locator('#member-workspace')).toBeVisible();
  await expect(page.locator('#workspace-page-title')).toHaveText('Beranda');

  const memberServices = page.locator('#workspace-navigation [data-nav-state-key="section:hmif-services"]');
  if (!(await memberServices.evaluate((element) => element.open))) {
    await memberServices.locator(':scope > summary').click();
  }
  await page.locator('#workspace-navigation [data-workspace-view="dashboard-support"]').click();
  await page.locator('#workspace-content .workspace-ticket-new summary').click();
  await expect(page.locator('#workspace-content [data-support-create]')).toBeVisible();
  await page.locator('#workspace-content [data-support-create] [name="subject"]').fill('Browser E2E support request');
  await page.locator('#workspace-content [data-support-create] [name="message"]').fill('Synthetic request to verify the member support workflow.');
  const ticketCreated = page.waitForResponse((response) => response.request().method() === 'POST'
    && new URL(response.url()).pathname === '/api/support/tickets');
  await page.locator('#workspace-content [data-support-create] button[type="submit"]').click();
  const ticketResponse = await ticketCreated;
  expect(ticketResponse.status()).toBe(201);
  const { ticket } = await ticketResponse.json();
  await expect(page.locator('#workspace-content [data-support-ticket-id]')).toHaveAttribute('data-support-ticket-id', ticket.id);

  const memberAcademics = page.locator('#workspace-navigation [data-nav-state-key="group:academics"]');
  if (!(await memberAcademics.evaluate((element) => element.open))) {
    await memberAcademics.locator(':scope > summary').click();
  }
  await page.locator('#workspace-navigation [data-workspace-view="dashboard-lms"]').click();
  await expect(page.locator('#workspace-page-title')).toHaveText('Ruang Belajar');
  await expect(page.locator('#workspace-content .workspace-feature-hero')).toBeVisible();

  await page.locator('#workspace-navigation [data-workspace-view="meetings"]').click();
  await expect(page.locator('#workspace-content .workspace-meeting-hero h2')).toHaveText('Rapat & tindak lanjut');
  await expect(page.locator('#workspace-content [data-meeting-create]')).toHaveCount(0);
  await expect(page.locator('#member-workspace')).toBeVisible();
  console.log('Member Support Desk, LMS, and private meeting access verified.');

  const organizerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const organizerPage = await organizerContext.newPage();
  try {
    await organizerPage.goto(frontendOrigin);
    await organizerPage.locator('#auth-action-btn').click();
    await organizerPage.locator('#login-nim').fill(organizerNim);
    await organizerPage.locator('#login-password').fill(organizerPassword);
    await organizerPage.locator('#login-form button[type="submit"]').click();
    await expect(organizerPage.locator('#member-workspace')).toBeVisible();
    const organizerServices = organizerPage.locator('#workspace-navigation [data-nav-state-key="section:hmif-services"]');
    if (!(await organizerServices.evaluate((element) => element.open))) {
      await organizerServices.locator(':scope > summary').click();
    }
    await organizerPage.locator('#workspace-navigation [data-workspace-view="meetings"]').click();
    await organizerPage.locator('#workspace-content .workspace-meeting-create summary').click();
    await expect(organizerPage.locator('#workspace-content [data-meeting-create]')).toBeVisible();
    console.log('Organizer capability surfaced the meeting creation form.');

    const startsAt = new Date(Date.now() + 86400000);
    const endsAt = new Date(startsAt.getTime() + 3600000);
    const localDateTime = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const until = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);
    await organizerPage.locator('[data-meeting-create] [name="title"]').fill('Browser E2E recurring meeting');
    await organizerPage.locator('[data-meeting-create] [name="agenda"]').fill('Verify private meeting operations.');
    await organizerPage.locator('[data-meeting-create] [name="starts_at"]').fill(localDateTime(startsAt));
    await organizerPage.locator('[data-meeting-create] [name="ends_at"]').fill(localDateTime(endsAt));
    await organizerPage.locator('[data-meeting-create] [name="attendee_nims"]').fill(memberNim);
    await organizerPage.locator('[data-meeting-create] [name="frequency"]').selectOption('weekly');
    await organizerPage.locator('[data-meeting-create] [name="until"]').fill(until);
    await organizerPage.locator('[data-meeting-create] button[type="submit"]').click();
    await expect(organizerPage.locator('#workspace-content .workspace-meeting-card')).toHaveCount(3);
    console.log('Recurring meeting series created.');

    await organizerPage.locator('#workspace-content [data-meeting-open]').first().click();
    await expect(organizerPage.locator('#workspace-content [data-meeting-minutes]')).toBeVisible();
    await organizerPage.locator('#workspace-content [data-meeting-minutes] [name="minutes"]').fill('E2E minutes saved.');
    await organizerPage.locator('#workspace-content [data-meeting-minutes] [name="decisions"]').fill('Keep the next session scheduled.');
    await organizerPage.locator('#workspace-content [data-meeting-minutes] button[type="submit"]').click();
    await expect(organizerPage.locator('#workspace-content .workspace-meeting-minutes-text')).toHaveText('E2E minutes saved.');
    console.log('Organizer meeting minutes saved.');
  } finally {
    await organizerContext.close();
  }
});

test('public workspace modules keep the member dashboard shell and route', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(frontendOrigin);
  await page.locator('#auth-action-btn').click();
  await page.locator('#login-nim').fill(memberNim);
  await page.locator('#login-password').fill(memberPassword);
  await page.locator('#login-form button[type="submit"]').click();
  await expect(page.locator('#member-workspace')).toBeVisible();

  const serviceSection = page.locator('#workspace-navigation [data-nav-state-key="section:hmif-services"]');
  if (!(await serviceSection.evaluate((element) => element.open))) {
    await serviceSection.locator(':scope > summary').click();
  }
  const academicsGroup = page.locator('#workspace-navigation [data-nav-state-key="group:academics"]');
  if (!(await academicsGroup.evaluate((element) => element.open))) {
    await academicsGroup.locator(':scope > summary').click();
  }

  await page.locator('#workspace-navigation [data-workspace-view="knowledge"]').click();
  await expect(page).toHaveURL(/#workspace\/knowledge$/);
  await expect(page.locator('#workspace-content > #section-knowledge')).toBeVisible();
  await expect(page.locator('#workspace-content > #section-knowledge .tutoring-clinic')).toBeHidden();

  await page.locator('#workspace-navigation [data-workspace-view="tutoring"]').click();
  await expect(page).toHaveURL(/#workspace\/tutoring$/);
  await expect(page.locator('#workspace-content > .tutoring-clinic')).toBeVisible();
  await expect(page.locator('#workspace-content > #section-knowledge')).toHaveCount(0);

  for (const [view, tab] of [
    ['calendar', 'calendar'],
    ['inventory', 'inventory'],
    ['showcase', 'showcase'],
    ['career', 'career'],
    ['doctrine', 'doctrine']
  ]) {
    await page.locator(`#workspace-navigation [data-workspace-view="${view}"]`).click();
    await expect(page).toHaveURL(new RegExp(`#workspace/${view}$`));
    await expect(page.locator('#member-workspace')).toBeVisible();
    await expect(page.locator(`#workspace-content > #section-${tab}`)).toBeVisible();
  }

  if (!(await serviceSection.evaluate((element) => element.open))) {
    await serviceSection.locator(':scope > summary').click();
  }
  await page.locator('#workspace-navigation [data-workspace-view="calendar"]').click();
  await expect(page).toHaveURL(/#workspace\/calendar$/);
  await expect(page.locator('#workspace-content > #section-calendar')).toBeVisible();
  await page.locator('#workspace-navigation [data-workspace-view="dashboard-support"]').click();
  await expect(page.locator('#section-calendar').locator('xpath=..')).toHaveClass(/main-content/);
  await expect(page.locator('#member-workspace')).toBeVisible();
});

test('student demographic dashboard uses capability access and configured account columns', async ({ page, browser }) => {
  test.setTimeout(90_000);
  await page.context().addCookies([{
    name: adminCookieName,
    value: adminCookieValue,
    url: frontendOrigin
  }]);
  await page.goto(`${frontendOrigin}/#workspace/student-demographics`);
  await expect(page.locator('#workspace-page-title')).toHaveText('Statistik mahasiswa');
  await expect(page.locator('#workspace-content .student-demographics-dashboard')).toBeVisible();
  await expect(page.locator('#workspace-content')).toContainText('Distribusi clearance');
  await expect(page.locator('#workspace-content')).toContainText('Kelengkapan profil administratif');
  const accountTable = page.locator('#workspace-content .student-demographics-account-table');
  await expect(accountTable).toBeHidden();
  await expect(page.locator('#workspace-content .student-demographics-dashboard')).not.toContainText('Contoh sintetis');
  await expect(page.locator('#workspace-content .student-demographics-dashboard')).not.toContainText('DEMO-001');
  const accountTableToggle = page.locator('#workspace-content [data-student-demographics-table-toggle]');
  await expect(accountTableToggle).toHaveAttribute('aria-expanded', 'false');
  await accountTableToggle.click();
  await expect(accountTableToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(accountTable).toBeVisible();
  await expect(page.locator('#workspace-content .student-demographics-account-table')).toContainText(memberNim);
  const csvDownloadPromise = page.waitForEvent('download');
  await page.locator('#workspace-content [data-student-demographics-export]').click();
  const csvDownload = await csvDownloadPromise;
  expect(csvDownload.suggestedFilename()).toMatch(/^statistik-mahasiswa-agregat-\d{4}-\d{2}-\d{2}\.csv$/);
  const aggregateCsv = await csvDownload;
  const aggregateCsvContents = fs.readFileSync(await aggregateCsv.path(), 'utf8');
  expect(aggregateCsvContents).toContain('Statistik mahasiswa Informatika');
  expect(aggregateCsvContents).not.toContain(memberNim);
  expect(aggregateCsvContents).not.toContain('DEMO-001');
  const adminResult = await page.evaluate(async () => {
    const response = await fetch('/api/admin/student-demographics');
    return { status: response.status, data: await response.json() };
  });
  expect(adminResult.status).toBe(200);
  expect(adminResult.data.totalAccounts).toBeGreaterThanOrEqual(0);
  expect(adminResult.data.columns.map(({ id }) => id)).toContain('nim');
  expect(adminResult.data.accounts.some(({ nim }) => nim === memberNim)).toBe(true);
  expect(JSON.stringify(adminResult.data)).not.toContain('password_hash');
  expect(JSON.stringify(adminResult.data.accounts)).not.toContain('account_id');

  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  try {
    await memberPage.goto(frontendOrigin);
    await memberPage.locator('#auth-action-btn').click();
    await memberPage.locator('#login-nim').fill(memberNim);
    await memberPage.locator('#login-password').fill(memberPassword);
    await memberPage.locator('#login-form button[type="submit"]').click();
    await expect(memberPage.locator('#member-workspace')).toBeVisible();
    await expect(memberPage.locator('#workspace-navigation [data-workspace-view="student-demographics"]')).toHaveCount(0);
    const deniedStatus = await memberPage.evaluate(async () => (
      await fetch('/api/admin/student-demographics').then((response) => response.status)
    ));
    expect(deniedStatus).toBe(403);
  } finally {
    await memberContext.close();
  }
});

test('admin can publish a poll and a member can cast one vote and see its receipt', async ({ page, browser }) => {
  test.setTimeout(150_000);
  const pollTitle = `Browser E2E voting ${Date.now()}`;
  const startsAt = new Date().toISOString().slice(0, 10);
  const endsAt = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  await page.context().addCookies([{
    name: adminCookieName,
    value: adminCookieValue,
    url: frontendOrigin
  }]);
  await page.goto(`${frontendOrigin}/#workspace/voting`);
  await expect(page.locator('#member-workspace')).toBeVisible();
  await expect(page.locator('#workspace-page-title')).toHaveText('Pemungutan suara');
  await expect(page.locator('#workspace-content .workspace-voting')).toBeVisible();
  await page.locator('#workspace-content .voting-admin-create > summary').click();
  const pollForm = page.locator('#workspace-content [data-voting-poll-create]');
  await pollForm.locator('[name="title"]').fill(pollTitle);
  await pollForm.locator('[name="description"]').fill('Pemungutan suara sintetik untuk tes browser.');
  await pollForm.locator('[name="start_date"]').fill(startsAt);
  await pollForm.locator('[name="end_date"]').fill(endsAt);
  await pollForm.locator('button[type="submit"]').click();
  const pollCard = page.locator('#workspace-content [data-poll-id]').filter({ hasText: pollTitle });
  await expect(pollCard).toBeVisible();
  const pollId = await pollCard.getAttribute('data-poll-id');

  await pollCard.locator('.voting-admin-controls > summary').click();
  const candidateForm = pollCard.locator('[data-voting-candidate-create]');
  await candidateForm.locator('[name="candidate_number"]').fill('1');
  await candidateForm.locator('[name="candidate_name"]').fill('Synthetic Candidate');
  await candidateForm.locator('[name="vision_mission"]').fill('Visi untuk pengujian alur suara.');
  await candidateForm.locator('button[type="submit"]').click();
  await expect(page.locator('#workspace-content [data-voting-feedback]')).toHaveText('Kandidat berhasil ditambahkan.');
  await pollCard.locator('.voting-admin-controls > summary').click();
  const statusForm = pollCard.locator('[data-voting-poll-status]');
  await statusForm.locator('[name="status"]').selectOption('active');
  await statusForm.locator('button[type="submit"]').click();
  await expect(page.locator('#workspace-content [data-voting-feedback]')).toHaveText('Status pemilihan berhasil diperbarui.');

  const voterContext = await browser.newContext();
  const voterPage = await voterContext.newPage();
  try {
    await voterPage.goto(frontendOrigin);
    await voterPage.locator('#auth-action-btn').click();
    await voterPage.locator('#login-nim').fill(memberNim);
    await voterPage.locator('#login-password').fill(memberPassword);
    await voterPage.locator('#login-form button[type="submit"]').click();
    await expect(voterPage.locator('#member-workspace')).toBeVisible();
    await voterPage.goto(`${frontendOrigin}/#workspace/voting`);
    await voterPage.locator(`#workspace-content [data-poll-id="${pollId}"] [data-poll-open]`).click();

    const voteButton = voterPage.locator('#workspace-content [data-voting-cast-vote]');
    await expect(voteButton).toHaveText('BERI SUARA');
    const candidateId = await voteButton.getAttribute('data-voting-cast-vote');
    voterPage.once('dialog', (dialog) => dialog.accept());
    await voteButton.click();
    await expect(voterPage.locator('#workspace-content .vote-receipt')).toContainText('Suara Anda telah tercatat');
    await expect(voterPage.locator('#workspace-content .vote-receipt')).toContainText('ID tanda terima');
    await expect(voterPage.locator('#workspace-content [data-voting-cast-vote]')).toBeDisabled();
    await expect(voterPage.locator('#workspace-content .results-list')).toContainText('Synthetic Candidate');
    const duplicateVote = await voterPage.evaluate(async ({ selectedPollId, selectedCandidateId }) => {
      const response = await fetch(`/api/voting/polls/${selectedPollId}/vote`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate_id: selectedCandidateId })
      });
      return { status: response.status, data: await response.json() };
    }, { selectedPollId: pollId, selectedCandidateId: candidateId });
    expect(duplicateVote.status).toBe(400);
    expect(duplicateVote.data.error).toContain('sudah memberikan suara');
  } finally {
    await voterContext.close();
  }
});

test('operational console shows only the selected module on mobile', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.context().addCookies([{
    name: adminCookieName,
    value: adminCookieValue,
    url: frontendOrigin
  }]);
  await page.goto(`${frontendOrigin}/#workspace/operations`);

  const sections = page.locator('#workspace-content > .operations-module-section');
  const moduleButtons = page.locator('#workspace-operations-tablist [data-operations-target]');
  await expect(sections.first()).toBeVisible({ timeout: 15_000 });
  const idleTip = page.locator('#workspace-content > .operations-console-status--tip');
  await expect(idleTip).toContainText('TIP OPERASIONAL');
  await expect(idleTip.locator('.operations-console-tip')).toBeVisible();
  const moduleCount = await sections.count();
  expect(moduleCount).toBeGreaterThan(1);
  await expect(moduleButtons).toHaveCount(moduleCount);

  const verifyOnlySectionIsVisible = async (activeIndex) => {
    for (let index = 0; index < moduleCount; index += 1) {
      if (index === activeIndex) {
        await expect(sections.nth(index)).toBeVisible();
      } else {
        await expect(sections.nth(index)).toBeHidden();
      }
    }
    await expect(moduleButtons.nth(activeIndex)).toHaveAttribute('aria-current', 'location');
  };

  await verifyOnlySectionIsVisible(0);
  await moduleButtons.nth(1).click();
  await verifyOnlySectionIsVisible(1);
  await moduleButtons.nth(2).click();
  await verifyOnlySectionIsVisible(2);
});

test('attendance sidebar destinations show only their selected module', async ({ page }) => {
  await page.context().addCookies([{
    name: adminCookieName,
    value: adminCookieValue,
    url: frontendOrigin
  }]);

  await page.goto(`${frontendOrigin}/#workspace/attendance-checkin`);
  await expect(page.locator('#workspace-page-title')).toHaveText('Pindai kehadiran');
  await expect(page.locator('#workspace-content > .attendance-member-checkin')).toBeVisible();
  await expect(page.locator('#workspace-content > .workspace-welcome')).toHaveCount(0);
  await expect(page.locator('#workspace-content > .workspace-overview')).toHaveCount(0);
  await expect(page.locator('#workspace-content > .member-event-tickets')).toHaveCount(0);
  await expect(page.locator('#workspace-content > .member-delegations')).toHaveCount(0);

  await page.goto(`${frontendOrigin}/#workspace/attendance-tickets`);
  await expect(page.locator('#workspace-page-title')).toHaveText('Tiket acara');
  await expect(page.locator('#workspace-content > .member-event-tickets')).toBeVisible();
  await expect(page.locator('#workspace-content > .workspace-welcome')).toHaveCount(0);
  await expect(page.locator('#workspace-content > .attendance-member-checkin')).toHaveCount(0);
  await expect(page.locator('#workspace-content > .member-delegations')).toHaveCount(0);

  await page.goto(`${frontendOrigin}/#workspace/delegations`);
  await expect(page.locator('#workspace-page-title')).toHaveText('Delegasi & mandat');
  await expect(page.locator('#workspace-content > .member-delegations')).toBeVisible();
  await expect(page.locator('#workspace-content > .workspace-welcome')).toHaveCount(0);
  await expect(page.locator('#workspace-content > .workspace-overview')).toHaveCount(0);
  await expect(page.locator('#workspace-content > .attendance-member-checkin')).toHaveCount(0);
  await expect(page.locator('#workspace-content > .member-event-tickets')).toHaveCount(0);
});

test('internal dashboard sidebar can be hidden and restored with responsive padded controls', async ({ page }) => {
  await page.context().addCookies([{
    name: adminCookieName,
    value: adminCookieValue,
    url: frontendOrigin
  }]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${frontendOrigin}/#workspace/operations`);

  const sidebar = page.locator('#workspace-sidebar');
  const toggle = page.locator('[data-workspace-sidebar-toggle]');
  await expect(sidebar).toBeVisible({ timeout: 15_000 });
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const padding = await page.locator('#workspace-page-title').evaluate((element) => getComputedStyle(element).padding);
  expect(padding).not.toBe('0px');
  const sidebarPadding = await sidebar.evaluate((element) => getComputedStyle(element).paddingInlineStart);
  expect(Number.parseFloat(sidebarPadding)).toBeGreaterThan(0);

  await toggle.click();
  await expect(sidebar).toBeHidden();
  await expect(sidebar).toHaveAttribute('aria-hidden', 'true');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(sidebar).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  await page.setViewportSize({ width: 390, height: 844 });
  await toggle.click();
  await expect(sidebar).toBeHidden();
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(sidebar).toBeVisible();
});

test('workspace navigation preserves expanded sections and its scroll position when changing pages', async ({ page }) => {
  await page.context().addCookies([{
    name: adminCookieName,
    value: adminCookieValue,
    url: frontendOrigin
  }]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${frontendOrigin}/#workspace/operations`);

  const navigation = page.locator('#workspace-navigation');
  const services = navigation.locator('.workspace-nav-section').filter({ hasText: 'Layanan HMIF' });
  await services.locator(':scope > summary').click();
  const profileLink = navigation.locator('[data-workspace-view="profile"]');
  await profileLink.scrollIntoViewIfNeeded();
  const scrollPosition = await navigation.evaluate((element) => element.scrollTop);
  expect(scrollPosition).toBeGreaterThan(0);

  await profileLink.click();
  await expect(page).toHaveURL(/#workspace\/profile$/);
  await expect(navigation.locator('[data-nav-state-key="group:operations"]')).toHaveJSProperty('open', true);
  await expect(services).toHaveJSProperty('open', true);
  await expect(profileLink).toBeInViewport();
  expect(await navigation.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
});

test('profile photo choices stay compact and update the preview', async ({ page }) => {
  await page.context().addCookies([{
    name: adminCookieName,
    value: adminCookieValue,
    url: frontendOrigin
  }]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${frontendOrigin}/#workspace/profile`);

  const avatarSelect = page.locator('#account-profile-avatar');
  const formBounds = await page.locator('#account-profile-form').boundingBox();
  const selectBounds = await avatarSelect.boundingBox();
  expect(formBounds).not.toBeNull();
  expect(selectBounds).not.toBeNull();
  expect(selectBounds.width).toBeLessThan(formBounds.width / 2);

  await avatarSelect.selectOption('/assets/silhouette_female.jpg');
  await expect(page.locator('#account-profile-avatar-preview')).toHaveAttribute('src', /silhouette_female\.jpg/);
});

test('Site Studio font selectors preview the selected typeface immediately', async ({ page }) => {
  test.setTimeout(150_000);
  await page.context().addCookies([{
    name: adminCookieName,
    value: adminCookieValue,
    url: frontendOrigin
  }]);
  await page.goto(`${frontendOrigin}/#workspace/studio`);
  await expect(page.locator('#workspace-content .site-studio')).toBeVisible({ timeout: 15_000 });

  for (const [fontRole, fontName] of [
    ['body', 'Rajdhani'],
    ['heading', 'Orbitron'],
    ['mono', 'Inter']
  ]) {
    const select = page.locator(`#site-studio-form [name="font.${fontRole}"]`);
    const preview = page.locator(`#site-studio-form [data-font-preview="font.${fontRole}"]`);
    await select.selectOption(fontName);
    await expect.poll(() => preview.evaluate((element) => element.style.fontFamily))
      .toContain(fontName);
    await expect(preview).toHaveAttribute('data-font-preview-state', 'ready');
  }
});

test('Site Studio previews component and theme choices and accepts custom dust percentages', async ({ page }) => {
  test.setTimeout(150_000);
  await page.context().addCookies([{
    name: adminCookieName,
    value: adminCookieValue,
    url: frontendOrigin
  }]);
  await page.goto(`${frontendOrigin}/#workspace/studio`);
  const form = page.locator('#site-studio-form');
  await expect(form).toBeVisible({ timeout: 15_000 });

  await expect(form.locator('[data-palette]')).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  const studioWidths = await page.locator('.site-studio').evaluate((studio) => ({
    content: studio.clientWidth,
    rendered: studio.scrollWidth
  }));
  expect(studioWidths.rendered).toBeLessThanOrEqual(studioWidths.content);
  const lightAccent = form.locator('[name="color.light.accent"]');
  await lightAccent.evaluate((input) => {
    input.value = '#2c5f50';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(form.locator('[data-palette-preview="light"] .studio-palette-sample'))
    .toHaveCSS('--sample-accent', '#2c5f50');

  const shapePreview = form.locator('[data-shape-preview]');
  await form.locator('[name="shape"]').selectOption('soft');
  await expect(shapePreview).toHaveAttribute('data-shape', 'soft');

  await form.locator('[name="font.body"]').selectOption('Rajdhani');
  const fontMeta = form.locator('[data-font-preview-meta="font.body"]');
  await expect(fontMeta).toContainText('Rajdhani');
  await expect.poll(() => fontMeta.evaluate((element) => element.style.fontFamily))
    .toContain('Rajdhani');
  await form.locator('[name="typeScale"]').evaluate((input) => {
    input.value = '20';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(fontMeta).toContainText('20px');

  await form.locator('[name="dustDensity"]').fill('175');
  await expect(form.locator('[data-dust-range="density"]')).toHaveValue('175');
  await expect(form.locator('[data-dust-output="density"]')).toHaveText('175%');
  await form.locator('[name="dustOpacity"]').fill('240');
  await expect(form.locator('[data-dust-range="opacity"]')).toHaveValue('240');
  await expect(form.locator('[data-dust-output="opacity"]')).toHaveText('240%');

  await page.locator('[data-studio-tab="pages"]').click();
  await page.locator('[data-studio-tab="theme"]').click();
  await expect(form.locator('[name="color.light.accent"]')).toHaveValue('#2c5f50');
  await expect(form.locator('[name="shape"]')).toHaveValue('soft');
  await expect(form.locator('[name="dustDensity"]')).toHaveValue('175');
  await expect(form.locator('[name="dustOpacity"]')).toHaveValue('240');

  await page.locator('[data-action="save"]').click();
  await expect(page.locator('[data-studio-feedback]')).toContainText('TERSIMPAN', { timeout: 15_000 });
  await page.reload();
  await expect(page.locator('#site-studio-form')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#site-studio-form [name="color.light.accent"]')).toHaveValue('#2c5f50');
  await expect(page.locator('#site-studio-form [name="shape"]')).toHaveValue('soft');
  await expect(page.locator('#site-studio-form [name="dustDensity"]')).toHaveValue('175');
  await expect(page.locator('#site-studio-form [name="dustOpacity"]')).toHaveValue('240');
});

test('Site Studio preview, save, publish, and close actions complete their workflows', async ({ page }) => {
  test.setTimeout(210_000);
  await page.context().addCookies([{
    name: adminCookieName,
    value: adminCookieValue,
    url: frontendOrigin
  }]);
  await page.goto(`${frontendOrigin}/#workspace/studio`);
  await expect(page.locator('#member-workspace')).toBeVisible();
  await expect(page.locator('#workspace-content .site-studio')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-action="cancel-preview"]')).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  const studioWidths = await page.locator('.site-studio').evaluate((studio) => ({
    content: studio.clientWidth,
    rendered: studio.scrollWidth,
  }));
  const studioTabWidths = await page.locator('#workspace-studio-tablist .studio-toolbar').evaluate((toolbar) => ({
    content: toolbar.clientWidth,
    rendered: toolbar.scrollWidth
  }));
  expect(studioWidths.rendered).toBeLessThanOrEqual(studioWidths.content);
  expect(studioTabWidths.rendered).toBeLessThanOrEqual(studioTabWidths.content);

  await page.locator('[data-action="preview"]').click();
  await expect(page.locator('#member-workspace')).toBeHidden();
  await expect(page.locator('#site-preview-banner [data-studio-return]')).toBeVisible();
  await expect(page).toHaveURL(/#workspace\/studio$/);
  await page.locator('#site-preview-banner [data-studio-return]').click();
  await expect(page.locator('#member-workspace')).toBeVisible();
  await expect(page.locator('[data-action="cancel-preview"]')).toBeEnabled();
  await expect(page.locator('[data-action="preview"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-action="preview"]')).toHaveText('PRATINJAU AKTIF');
  await expect(page.locator('[data-studio-state-label]')).toHaveText('PRATINJAU AKTIF // BELUM TERBIT');
  await page.locator('[data-action="cancel-preview"]').click();
  await expect(page.locator('#site-preview-banner')).toHaveCount(0);
  await expect(page.locator('[data-action="cancel-preview"]')).toBeDisabled();
  await expect(page.locator('[data-action="preview"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-studio-state-label]')).toHaveText('DRAFT SIAP DIEDIT');

  await page.locator('[data-studio-tab="pages"]').click();
  const sidebarRows = page.locator('#site-studio-form [data-sidebar-order-item]');
  await expect(sidebarRows).toHaveCount(17);
  const initialSidebarOrder = await sidebarRows.evaluateAll((rows) => rows.map((row) => row.dataset.sidebarOrderItem));
  expect(initialSidebarOrder).toContain('cohort');
  expect(initialSidebarOrder).toContain('voting');
  const heroLead = page.locator('#site-studio-form [name="heroLead"]');
  await heroLead.fill('Perubahan draft sementara yang akan direset.');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.locator('[data-action="reset"]').click();
  await expect(heroLead).toHaveValue('Perubahan draft sementara yang akan direset.');
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('[data-action="reset"]').click();
  await expect(heroLead).toHaveValue('Portal digital Himpunan Mahasiswa Informatika Universitas Mayasari Bakti.');
  await expect(page.locator('[data-studio-feedback]')).toContainText('DEFAULT DIMUAT KE DRAFT');
  await page.locator('#site-studio-form [data-move-sidebar-item="cohort"][data-direction="up"]').click();
  await page.locator('#site-studio-form [name="visible.voting"]').uncheck();
  const configuredSidebarOrder = await page.locator('#site-studio-form [data-sidebar-order-item]')
    .evaluateAll((rows) => rows.map((row) => row.dataset.sidebarOrderItem));
  expect(configuredSidebarOrder.indexOf('cohort')).toBeLessThan(configuredSidebarOrder.indexOf('squad'));
  await page.locator('[name="navigationParent.site-map"]').selectOption('dashboard');
  await page.locator('[name="navigationParent.university-organization"]').selectOption('site-map');
  await page.locator('[data-custom-page-add]').click();
  await page.locator('[name="customPage.0.title"]').fill('Tentang HMIF');
  await page.locator('[name="customPage.0.slug"]').fill('tentang-hmif');
  await page.locator('[name="customPage.0.description"]').fill('Profil organisasi HMIF.');
  await page.locator('[data-custom-block-type]').selectOption('notice');
  await page.locator('[name="customPage.0.block.0.title"]').fill('Informasi Penting');
  await page.locator('[name="customPage.0.block.0.tone"]').selectOption('warning');
  await page.locator('[name="customPage.0.block.0.body"]').fill('<script>window.customPageInjected = true</script>');
  const customPageNavId = await page.locator('#site-studio-form [data-sidebar-order-item^="custom-"]')
    .getAttribute('data-sidebar-order-item');
  await page.locator(`[name="navigationParent.${customPageNavId}"]`).selectOption('site-map');
  await heroLead.fill('Pratinjau dan publikasi Site Studio terverifikasi.');

  await page.locator('[data-studio-tab="map"]').click();
  await expect(page.locator('#studio-panel-map')).toBeVisible();
  await page.locator('[name="campusMap.navigationLabel"]').fill('Atlas HMIF');
  await page.locator('[name="campusMap.summary"]').fill('Peta lokasi, gedung, dan fasilitas kampus.');
  await page.locator('[data-map-add-campus]').click();
  await page.locator('[name="campusMap.0.name"]').fill('Kampus Utama');
  await page.locator('[name="campusMap.0.address"]').fill('Tasikmalaya');
  await page.locator('[name="campusMap.0.latitude"]').fill('-7.327');
  await page.locator('[name="campusMap.0.longitude"]').fill('108.22');
  await page.locator('[data-map-add-building="0"]').click();
  await page.locator('[name="campusMap.0.0.name"]').fill('Gedung FTIK');
  await page.locator('[data-map-add-floor="0.0"]').click();
  await page.locator('[name="campusMap.0.0.0.name"]').fill('Lantai Dasar');
  await page.locator('[name="campusMap.0.0.0.widthMeters"]').fill('36');
  await page.locator('[name="campusMap.0.0.0.scaleDenominator"]').fill('150');
  await page.locator('[data-map-add-legend="0.0.0"]').click();
  await page.locator('[name="campusMap.0.0.0.legend.0.label"]').fill('Fasilitas umum');
  await page.locator('[name="campusMap.0.0.0.legend.0.color"]').fill('#2c5f50');
  await page.locator('[data-map-draw-kind="marker"]').click();
  const mapCanvas = page.locator('[data-map-editor-canvas="0.0.0"] svg');
  await mapCanvas.click({ position: { x: 120, y: 80 } });
  await page.locator('[name="campusMap.0.0.0.features.0.label"]').fill('Sekretariat HMIF');
  await page.locator('[name="campusMap.0.0.0.features.0.description"]').fill('Pusat layanan dan informasi HMIF.');
  await expect(page.locator('[data-map-editor-feature-row]')).toHaveCount(1);
  await page.locator('[data-studio-tab="university"]').click();
  await page.locator('[data-university-structure-add]').click();
  await page.locator('[name="universityStructure.0.name"]').fill('Struktur Universitas 2026–2030');
  await page.locator('[name="universityStructure.0.validFrom"]').fill('2026-01-01');
  await page.locator('[name="universityStructure.0.validUntil"]').fill('2030-12-31');
  await page.locator('[data-university-sync="0"]').click();
  await expect(page.locator('.university-org-unit-editor')).toHaveCount(2);
  await page.locator('[data-university-unit-add="0"]').click();
  await page.locator('[name="universityStructure.0.unit.2.name"]').fill('Rektorat');
  await page.locator('[name="universityStructure.0.unit.2.kind"]').selectOption('rectorate');
  await page.locator('[name="universityStructure.0.unit.2.parentId"]').selectOption('repo-university');
  await page.locator('[data-university-sync="0"]').click();
  await expect(page.locator('.university-org-unit-editor')).toHaveCount(3);
  await expect(page.locator('[name="universityStructure.0.unit.2.name"]')).toHaveValue('Rektorat');
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.locator('[data-action="preview"]').click();
  const customPageNav = page.locator('#prts-nav [data-custom-page-nav]');
  await expect(customPageNav).toHaveCount(1);
  const customPageId = await customPageNav.getAttribute('data-custom-page-nav');
  const siteNavigationToggle = page.locator('#sidebar-toggle-btn');
  if (await siteNavigationToggle.getAttribute('aria-expanded') === 'false') {
    await siteNavigationToggle.click();
    await expect(siteNavigationToggle).toHaveAttribute('aria-expanded', 'true');
  }
  const publicSidebarOrder = await page.locator('#prts-nav .nav-link[data-tab]')
    .evaluateAll((links) => links.map((link) => link.dataset.tab));
  expect(publicSidebarOrder.indexOf('cohort')).toBeLessThan(publicSidebarOrder.indexOf('squad'));
  expect(publicSidebarOrder).toContain('campus-map');
  expect(publicSidebarOrder).toContain('site-map');
  expect(publicSidebarOrder).toContain('university-organization');
  await expect(page.locator('#prts-nav [data-tab="voting"]')).toBeHidden();
  await expect(page.locator('#prts-nav [data-tab="inventory"] .nav-idx')).toHaveText('09');
  await expect(page.locator('#sidebar-campus-map-summary')).toContainText('Kampus Utama');
  await page.locator('#prts-nav [data-tab="site-map"]').click();
  await expect(page.locator('#section-site-map')).toBeVisible();
  const siteMapRoot = page.locator('#site-navigation-map [data-site-map-route="site-map"]');
  const siteMapBranch = siteMapRoot.locator('xpath=ancestor::li[1]');
  await expect(siteMapBranch.locator('[data-site-map-route="university-organization"]')).toBeVisible();
  await expect(siteMapBranch.locator('[data-site-map-route^="custom-"]')).toBeVisible();
  await page.locator('#prts-nav [data-tab="university-organization"]').click();
  await expect(page.locator('#section-university-organization')).toBeVisible();
  await expect(page.locator('#university-organization-content')).toContainText('Rektorat');
  await expect(page.locator('#university-organization-content')).toContainText('Fakultas Teknik dan Ilmu Komputer');
  await page.locator('#prts-nav [data-tab="campus-map"]').click();
  await page.locator('[data-open-campus-map]').click();
  await expect(page.locator('#section-campus-map')).toBeVisible();
  await expect(page.locator('#campus-map-campus-count')).toHaveText('1');
  await expect(page.locator('#campus-map-building-count')).toHaveText('1');
  await expect(page.locator('#campus-map-outdoor .leaflet-control-attribution')).toContainText('OpenStreetMap', { timeout: 15_000 });
  await page.locator('[data-campus-map-layer="indoor"]').click();
  await expect(page.locator('#campus-map-floorplan svg')).toBeVisible();
  await page.locator('#campus-map-floorplan [data-map-feature]').click();
  await expect(page.locator('#campus-map-feature-details')).toContainText('Sekretariat HMIF');

  await customPageNav.click();
  const customPageSection = page.locator(`#section-custom-${customPageId}`);
  await expect(customPageSection).toBeVisible();
  await expect(customPageSection).toContainText('<script>window.customPageInjected = true</script>');
  await expect(customPageSection.locator('script')).toHaveCount(0);

  await page.locator('#site-preview-banner [data-studio-return]').click();
  await expect(page.locator('#member-workspace')).toBeVisible();
  await page.locator('[data-action="cancel-preview"]').click();
  await expect(page.locator('[data-action="cancel-preview"]')).toBeDisabled();
  await page.locator('[data-action="save"]').click();
  await expect(page.locator('[data-studio-feedback]')).toContainText('TERSIMPAN');
  await page.locator('[data-action="publish"]').click();
  await expect(page.locator('[data-studio-feedback]')).toContainText('DIPUBLIKASIKAN');

  await page.locator('[data-action="close"]').click();
  await expect(page).toHaveURL(/#workspace\/home$/);
  await expect(page.locator('#member-workspace')).toBeVisible();
});
