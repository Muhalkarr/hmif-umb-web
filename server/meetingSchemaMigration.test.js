import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import Sqlite from 'better-sqlite3';

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'hmif-meeting-migration-'));
const databasePath = path.join(temporaryDirectory, 'database.sqlite');
const legacySqlite = new Sqlite(databasePath);
legacySqlite.exec(`CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  recipient_account_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('deadline', 'task', 'submission', 'tutoring')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  action_view TEXT NOT NULL DEFAULT '',
  dedupe_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT,
  UNIQUE (recipient_account_id, dedupe_key)
);
CREATE INDEX idx_notifications_recipient_created ON notifications(recipient_account_id, created_at DESC);
INSERT INTO notifications (id, recipient_account_id, category, title, message, dedupe_key, created_at)
VALUES ('legacy-notification', 'legacy-account', 'task', 'Task update', 'Existing notification', 'legacy-dedupe', '2026-01-01T00:00:00.000Z');`);
legacySqlite.close();

process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.JWT_SECRET = randomBytes(48).toString('base64url');
process.env.FRONTEND_ORIGINS = 'http://localhost:5173';
process.env.ALLOW_PUBLIC_REGISTRATION = 'false';
process.env.INITIAL_ADMIN_NIM = 'migration-admin';
process.env.INITIAL_ADMIN_PASSWORD = 'test-migration-admin-password-123';
process.env.DATABASE_FILE = databasePath;
process.env.ASSET_STORAGE_DIR = path.join(temporaryDirectory, 'assets');

const { server, wsStatsService } = await import('./index.js');
const { db } = await import('./db.js');
if (!server.listening) await once(server, 'listening');

test.after(async () => {
  wsStatsService.close();
  const serverClosed = new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  server.closeAllConnections();
  server.closeIdleConnections();
  await serverClosed;
  db.close();
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

test('meeting notification migration preserves existing notifications and permits the meeting category', () => {
  assert.equal(db.listNotifications('legacy-account').length, 1);
  const id = db.createNotification({
    recipientAccountId: 'legacy-account',
    category: 'meeting',
    title: 'Meeting invitation',
    message: 'A new meeting was scheduled.',
    dedupeKey: 'meeting-invitation'
  });
  assert.ok(id);
  assert.equal(db.listNotifications('legacy-account').length, 2);
});
