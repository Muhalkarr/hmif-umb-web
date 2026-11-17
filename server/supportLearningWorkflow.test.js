import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import test from 'node:test';
import { randomBytes } from 'node:crypto';

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'hmif-support-learning-'));
const adminPassword = 'test-support-admin-password-123';
const memberPassword = 'test-support-member-password-123';
const otherPassword = 'test-support-other-password-123';
const staffPassword = 'test-support-staff-password-123';
const origin = 'http://localhost:5173';

process.env.NODE_ENV = 'development';
process.env.PORT = '0';
process.env.JWT_SECRET = randomBytes(48).toString('base64url');
process.env.FRONTEND_ORIGINS = origin;
process.env.ALLOW_PUBLIC_REGISTRATION = 'false';
process.env.INITIAL_ADMIN_NIM = 'support-admin';
process.env.INITIAL_ADMIN_PASSWORD = adminPassword;
process.env.DATABASE_FILE = path.join(temporaryDirectory, 'database.sqlite');
process.env.ASSET_STORAGE_DIR = path.join(temporaryDirectory, 'assets');

const { server, wsStatsService } = await import('./index.js');
const { db } = await import('./db.js');
if (!server.listening) await once(server, 'listening');
const baseUrl = `http://127.0.0.1:${server.address().port}`;

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

const request = (endpoint, { method = 'GET', cookie, body, requestOrigin = origin } = {}) => {
  const headers = { Connection: 'close' };
  if (requestOrigin) headers.Origin = requestOrigin;
  if (cookie) headers.Cookie = cookie;
  if (body) headers['Content-Type'] = 'application/json';
  return fetch(`${baseUrl}${endpoint}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
};

const login = async (nim, password) => {
  const response = await request('/api/auth/login', { method: 'POST', body: { nim, password } });
  return { response, payload: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
};

test('support tickets enforce ownership and staff permissions; learning progress is persisted per member', async () => {
  const admin = await login('support-admin', adminPassword);
  assert.equal(admin.response.status, 200);

  const createUser = async (nim, name, password) => {
    const response = await request('/api/admin/users', {
      method: 'POST',
      cookie: admin.cookie,
      body: { nim, name, password, generation: '2026', division: 'Akademik' }
    });
    assert.equal(response.status, 201);
    return (await response.json()).user;
  };
  const member = await createUser('support-member', 'Synthetic Member', memberPassword);
  const other = await createUser('support-other', 'Synthetic Other', otherPassword);
  const staff = await createUser('support-staff', 'Synthetic Staff', staffPassword);
  assert.equal((await request('/api/admin/users/support-staff', {
    method: 'PUT', cookie: admin.cookie, body: { clearance_level: 2 }
  })).status, 200);
  assert.equal((await request('/api/admin/users/support-member/academic-curator', {
    method: 'PUT', cookie: admin.cookie, body: { enabled: true }
  })).status, 200);

  const memberSession = await login(member.nim, memberPassword);
  const otherSession = await login(other.nim, otherPassword);
  const staffSession = await login(staff.nim, staffPassword);
  assert.equal((await request('/api/support/tickets')).status, 401);
  assert.equal((await request('/api/support/reports', { cookie: memberSession.cookie })).status, 403);

  const createdTicket = await request('/api/support/tickets', {
    method: 'POST',
    cookie: memberSession.cookie,
    body: { subject: 'Tidak dapat membuka materi', category: 'akademik', message: 'Tautan materi memberikan pesan gagal.' }
  });
  assert.equal(createdTicket.status, 201);
  const ticket = (await createdTicket.json()).ticket;
  assert.equal(Object.hasOwn(ticket, 'account_id'), false);
  assert.equal((await request(`/api/support/tickets/${ticket.id}`, { cookie: otherSession.cookie })).status, 404);
  assert.equal((await (await request('/api/support/tickets', { cookie: otherSession.cookie })).json()).tickets.length, 0);
  assert.equal((await (await request('/api/support/tickets', { cookie: staffSession.cookie })).json()).tickets.length, 1);

  const staffReply = await request(`/api/support/tickets/${ticket.id}/messages`, {
    method: 'POST', cookie: staffSession.cookie, body: { message: 'Materi sudah diperiksa, silakan coba kembali.' }
  });
  assert.equal(staffReply.status, 201);
  assert.equal((await request(`/api/support/tickets/${ticket.id}/status`, {
    method: 'PUT', cookie: staffSession.cookie, body: { status: 'resolved' }
  })).status, 200);
  const memberReply = await request(`/api/support/tickets/${ticket.id}/messages`, {
    method: 'POST', cookie: memberSession.cookie, body: { message: 'Sudah bisa, terima kasih.' }
  });
  assert.equal(memberReply.status, 201);
  assert.equal((await memberReply.json()).ticket.status, 'open');

  const resource = await request('/api/academic/resources', {
    method: 'POST',
    cookie: memberSession.cookie,
    body: {
      id: 'support-learning-resource',
      title: 'Panduan JavaScript',
      course: 'Pemrograman Web',
      semester: 'Semua',
      kind: 'module',
      url: 'https://example.com/javascript',
      summary: 'Materi fixture untuk pengujian.',
      tags: ['fixture']
    }
  });
  assert.equal(resource.status, 201);
  assert.equal((await request('/api/academic/resources/support-learning-resource/submit', {
    method: 'POST', cookie: memberSession.cookie, body: {}
  })).status, 200);
  assert.equal((await request('/api/admin/academic/resource/support-learning-resource/review', {
    method: 'PUT', cookie: admin.cookie, body: { status: 'published', note: 'Fixture test' }
  })).status, 200);

  const learningPath = await request('/api/academic/learning-paths', {
    method: 'POST',
    cookie: memberSession.cookie,
    body: {
      id: 'support-learning-path',
      title: 'Dasar Pemrograman Web',
      track: 'Front End',
      summary: 'Jalur uji kursus dua tahap.',
      estimated_hours: 3,
      milestones: [
        { id: 'basics', title: 'Dasar JavaScript', resource_ids: ['support-learning-resource'], prerequisite_ids: [] },
        { id: 'advanced', title: 'Latihan lanjutan', resource_ids: ['support-learning-resource'], prerequisite_ids: ['basics'] }
      ]
    }
  });
  assert.equal(learningPath.status, 201);
  assert.equal((await request('/api/academic/learning-paths/support-learning-path/submit', {
    method: 'POST', cookie: memberSession.cookie, body: {}
  })).status, 200);
  assert.equal((await request('/api/admin/academic/learning-path/support-learning-path/review', {
    method: 'PUT', cookie: admin.cookie, body: { status: 'published', note: 'Fixture test' }
  })).status, 200);

  assert.equal((await request('/api/learning/paths/support-learning-path/milestones/basics/complete', {
    method: 'PUT', cookie: memberSession.cookie, body: {}
  })).status, 409);
  const enrollment = await request('/api/learning/paths/support-learning-path/enroll', {
    method: 'POST', cookie: memberSession.cookie, body: {}
  });
  assert.equal(enrollment.status, 201);
  assert.equal((await request('/api/learning/paths/support-learning-path/milestones/advanced/complete', {
    method: 'PUT', cookie: memberSession.cookie, body: {}
  })).status, 409);
  assert.equal((await request('/api/learning/paths/support-learning-path/milestones/basics/complete', {
    method: 'PUT', cookie: memberSession.cookie, body: {}
  })).status, 200);
  assert.equal((await request('/api/learning/paths/support-learning-path/milestones/advanced/complete', {
    method: 'PUT', cookie: memberSession.cookie, body: {}
  })).status, 200);
  const progress = (await (await request('/api/learning/enrollments/mine', { cookie: memberSession.cookie })).json()).enrollments;
  assert.deepEqual(progress[0].completed_milestones, ['basics', 'advanced']);
  assert.deepEqual((await (await request('/api/learning/enrollments/mine', { cookie: otherSession.cookie })).json()).enrollments, []);
});
