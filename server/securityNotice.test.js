import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { once } from 'node:events';
import Sqlite from 'better-sqlite3';
import { createSiteSqlRepository } from './repositories/siteSqlRepository.js';
import { registerSecurityNoticeRoutes } from './routes/securityNotice.js';

const closeServer = (server) => new Promise((resolve, reject) => {
  server.close((error) => error ? reject(error) : resolve());
  server.closeAllConnections();
});

test('security notice repository persists its current public state', () => {
  const sqlite = new Sqlite(':memory:');
  sqlite.exec(`
    CREATE TABLE security_notice (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      status TEXT NOT NULL,
      message TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL
    );
    INSERT INTO security_notice VALUES (1, 'normal', '', '1970-01-01T00:00:00.000Z', 'system');
  `);
  const repository = createSiteSqlRepository({
    sqlite,
    read: () => ({}),
    insertAudit: () => {}
  });

  assert.equal(repository.getSecurityNotice().status, 'normal');
  const updated = repository.setSecurityNotice('incident', 'Gangguan sedang ditangani.', 'admin');
  assert.equal(updated.status, 'incident');
  assert.equal(updated.message, 'Gangguan sedang ditangani.');
  assert.equal(updated.updatedBy, 'admin');
  sqlite.close();
});

test('security notice is public to visitors and can only be changed by a superadmin', async (t) => {
  let actor = null;
  let notice = { status: 'normal', message: '', updatedAt: '2026-01-01T00:00:00.000Z' };
  const audits = [];
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = actor;
    next();
  });
  const requireSuperadmin = (req, res, next) => {
    if (req.user?.role !== 'superadmin') return res.status(req.user ? 403 : 401).json({ error: 'Akses superadmin diperlukan.' });
    next();
  };
  registerSecurityNoticeRoutes(app, {
    db: {
      getSecurityNotice: () => notice,
      setSecurityNotice: (status, message, updatedBy) => {
        notice = { status, message, updatedAt: '2026-01-02T00:00:00.000Z', updatedBy };
        return notice;
      }
    },
    requireSuperadmin,
    auditAdminMutation: (...entry) => audits.push(entry)
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => closeServer(server));
  const endpoint = `http://127.0.0.1:${server.address().port}/api/security/notice`;

  const publicResponse = await fetch(endpoint);
  assert.equal(publicResponse.status, 200);
  assert.equal(publicResponse.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await publicResponse.json(), {
    status: 'normal',
    message: '',
    updatedAt: '2026-01-01T00:00:00.000Z'
  });

  const unauthorized = await fetch(endpoint, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'incident' })
  });
  assert.equal(unauthorized.status, 401);

  actor = { role: 'superadmin', nim: '123456789' };
  const activated = await fetch(endpoint, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'incident' })
  });
  assert.equal(activated.status, 200);
  const activatedBody = await activated.json();
  assert.equal(activatedBody.notice.status, 'incident');
  assert.match(activatedBody.notice.message, /gangguan keamanan/i);
  assert.equal(audits.length, 1);
  assert.equal(audits[0][2], 'security_notice');

  const invalid = await fetch(endpoint, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'incident', message: 'x'.repeat(501) })
  });
  assert.equal(invalid.status, 400);
});
