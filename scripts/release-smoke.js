import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'hmif-release-smoke-'));
const origin = 'http://localhost:5173';
const adminNim = 'release-smoke-admin';
const adminPassword = randomBytes(24).toString('base64url');
let server;
let wsStatsService;
let db;

const assertResponse = async (endpoint, options = {}) => {
  const response = await fetch(`${baseUrl}${endpoint}`, options);
  const payload = await response.json();
  assert.equal(response.ok, true, `${endpoint} returned ${response.status}: ${payload.error || 'request failed'}`);
  return { response, payload };
};

const productionConfigurationGuard = () => {
  const env = Object.fromEntries(
    ['PATH', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP']
      .filter((name) => process.env[name])
      .map((name) => [name, process.env[name]])
  );
  Object.assign(env, {
    NODE_ENV: 'production',
    DATABASE_FILE: '',
    JWT_SECRET: randomBytes(48).toString('base64url')
  });
  const result = spawnSync(process.execPath, [
    '--input-type=module',
    '-e',
    "await import('./server/index.js')"
  ], {
    cwd: projectRoot,
    env,
    encoding: 'utf8',
    timeout: 20_000
  });

  assert.equal(result.error, undefined, 'production guard subprocess could not start');
  assert.notEqual(result.status, 0, 'production server accepted a missing DATABASE_FILE');
  assert.match(result.stderr, /DATABASE_FILE wajib diarahkan/);
};

let baseUrl;
try {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '0';
  process.env.JWT_SECRET = randomBytes(48).toString('base64url');
  process.env.FRONTEND_ORIGINS = origin;
  process.env.ALLOW_PUBLIC_REGISTRATION = 'false';
  process.env.INITIAL_ADMIN_NIM = adminNim;
  process.env.INITIAL_ADMIN_PASSWORD = adminPassword;
  process.env.DATABASE_FILE = path.join(temporaryDirectory, 'database.sqlite');
  process.env.ASSET_STORAGE_DIR = path.join(temporaryDirectory, 'assets');
  const { default: webpush } = await import('web-push');
  const vapidKeys = webpush.generateVAPIDKeys();
  process.env.VAPID_PUBLIC_KEY = vapidKeys.publicKey;
  process.env.VAPID_PRIVATE_KEY = vapidKeys.privateKey;
  for (const name of [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_CALLBACK_URL',
    'FRONTEND_SSO_SUCCESS',
    'FRONTEND_SSO_ERROR',
    'RESEND_API_KEY',
    'EVENT_EMAIL_FROM',
    'EVENT_TICKET_ENCRYPTION_KEY',
    'ASPIRATION_ENCRYPTION_KEY',
    'VAPID_CONTACT_EMAIL'
  ]) {
    delete process.env[name];
  }
  delete process.env.NODE_OPTIONS;

  ({ server, wsStatsService } = await import('../server/index.js'));
  ({ db } = await import('../server/db.js'));
  if (!server.listening) await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const health = await assertResponse('/api/health');
  assert.equal(health.payload.status, 'online');

  const site = await assertResponse('/api/site/config');
  assert.ok(site.payload.config);

  const { response: loginResponse, payload: loginPayload } = await assertResponse('/api/auth/login', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ nim: adminNim, password: adminPassword })
  });
  assert.equal(loginPayload.user.nim, adminNim);
  const cookie = loginResponse.headers.get('set-cookie')?.split(';')[0];
  assert.match(cookie || '', /^prts_session=/);

  const authenticated = { headers: { Cookie: cookie } };
  const session = await assertResponse('/api/auth/me', authenticated);
  assert.equal(session.payload.authenticated, true);

  const notifications = await assertResponse('/api/notifications', authenticated);
  assert.ok(Array.isArray(notifications.payload.notifications));
  assert.equal(Number.isInteger(notifications.payload.unread_count), true);
  assert.equal(notifications.payload.preferences.meeting, true);

  const tickets = await assertResponse('/api/support/tickets', authenticated);
  assert.ok(Array.isArray(tickets.payload.tickets));

  const enrollments = await assertResponse('/api/learning/enrollments/mine', authenticated);
  assert.ok(Array.isArray(enrollments.payload.enrollments));

  const meetings = await assertResponse('/api/meetings/mine', authenticated);
  assert.ok(Array.isArray(meetings.payload.meetings));

  productionConfigurationGuard();
  console.log('Release smoke checks passed: health, public config, admin login/session, notifications, support, learning, meetings, and production DB guard.');
} finally {
  if (wsStatsService) wsStatsService.close();
  if (server?.listening) {
    const closed = new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    server.closeAllConnections();
    server.closeIdleConnections();
    await closed;
  }
  db?.close();
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
