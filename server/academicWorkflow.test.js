import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import test from 'node:test';
import { randomBytes } from 'node:crypto';

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'hmif-academic-workflow-'));
const adminPassword = 'test-academic-admin-password-123';
const curatorPassword = 'test-academic-curator-password-123';
const moderatorPassword = 'test-academic-moderator-password-123';
const origin = 'http://localhost:5173';

process.env.NODE_ENV = 'development';
process.env.PORT = '0';
process.env.JWT_SECRET = randomBytes(48).toString('base64url');
process.env.FRONTEND_ORIGINS = origin;
process.env.ALLOW_PUBLIC_REGISTRATION = 'false';
process.env.INITIAL_ADMIN_NIM = 'academic-admin';
process.env.INITIAL_ADMIN_PASSWORD = adminPassword;
process.env.DATABASE_FILE = path.join(temporaryDirectory, 'database.sqlite');
process.env.ASSET_STORAGE_DIR = path.join(temporaryDirectory, 'assets');

const { server } = await import('./index.js');
const { db } = await import('./db.js');
if (!server.listening) await once(server, 'listening');
const baseUrl = `http://127.0.0.1:${server.address().port}`;

test.after(async () => {
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  db.close();
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

const request = (endpoint, { method = 'GET', cookie, body, requestOrigin = origin } = {}) => {
  const headers = {};
  if (requestOrigin) headers.Origin = requestOrigin;
  if (cookie) headers.Cookie = cookie;
  if (body) headers['Content-Type'] = 'application/json';
  return fetch(`${baseUrl}${endpoint}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
};

const login = async (nim, password) => {
  const response = await request('/api/auth/login', { method: 'POST', body: { nim, password } });
  return { response, payload: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
};

test('academic curator access, resource review, threaded solutions, and learning paths', async () => {
  const adminLogin = await login('academic-admin', adminPassword);
  assert.equal(adminLogin.response.status, 200);
  const createAccount = async (nim, name, password) => {
    const response = await request('/api/admin/users', {
      method: 'POST', cookie: adminLogin.cookie,
      body: { nim, name, password, generation: '2026', division: 'Akademik' }
    });
    assert.equal(response.status, 201);
    return (await response.json()).user;
  };
  const curator = await createAccount('academic-curator', 'Synthetic Curator', curatorPassword);
  const moderator = await createAccount('academic-moderator', 'Synthetic Moderator', moderatorPassword);
  const member = await createAccount('academic-member', 'Synthetic Member', 'test-academic-member-password-123');
  assert.equal((await request('/api/admin/users/academic-curator/academic-curator', {
    method: 'PUT', cookie: adminLogin.cookie, body: { enabled: true }
  })).status, 200);
  assert.equal((await request('/api/admin/users/academic-curator/academic-curator', {
    method: 'PUT', cookie: adminLogin.cookie, body: { enabled: false }
  })).status, 200);
  assert.equal((await request('/api/admin/users/academic-curator/academic-curator', {
    method: 'PUT', cookie: adminLogin.cookie, body: { enabled: true }
  })).status, 200);
  const moderatorUpdate = await request('/api/admin/users/academic-moderator', {
    method: 'PUT', cookie: adminLogin.cookie, body: { clearance_level: 2 }
  });
  assert.equal(moderatorUpdate.status, 200);
  const curatorLogin = await login(curator.nim, curatorPassword);
  const moderatorLogin = await login(moderator.nim, moderatorPassword);
  const memberLogin = await login(member.nim, 'test-academic-member-password-123');
  assert.equal(curatorLogin.response.status, 200);
  assert.equal(curatorLogin.payload.user.permissions.includes('academic_curate'), true);
  assert.equal(curatorLogin.payload.user.clearance_level, 1);
  assert.equal((await request('/api/site/draft', { method: 'PUT', cookie: curatorLogin.cookie, body: {} })).status, 403);
  assert.equal((await request('/api/admin/users', { cookie: curatorLogin.cookie })).status, 403);
  assert.equal((await request('/api/admin/academic/review', { cookie: curatorLogin.cookie })).status, 403);
  assert.equal((await request('/api/knowledge/files', { cookie: memberLogin.cookie })).status, 403);
  assert.equal((await request('/api/academic/resources/mine', { cookie: memberLogin.cookie })).status, 403);
  assert.equal((await request('/api/knowledge/files', { method: 'POST', cookie: memberLogin.cookie, body: {} })).status, 403);

  const academicFile = new FormData();
  academicFile.append('file', new Blob([Buffer.from('%PDF-1.4 synthetic fixture\n%%EOF')], { type: 'application/pdf' }), 'fixture.pdf');
  const uploadResponse = await fetch(`${baseUrl}/api/knowledge/files`, {
    method: 'POST', headers: { Origin: origin, Cookie: curatorLogin.cookie }, body: academicFile
  });
  assert.equal(uploadResponse.status, 201);
  const uploadedFile = (await uploadResponse.json()).file;
  const resourceResponse = await request('/api/academic/resources', {
    method: 'POST', cookie: curatorLogin.cookie,
    body: {
      id: 'fixture-exam-2026', title: 'Synthetic UTS Algorithms', course: 'Algoritma', semester: '1',
      lecturer: 'Dosen Fixture', academic_year: '2026/2027', exam_type: 'UTS', kind: 'exam',
      file_id: uploadedFile.id, summary: 'Materi uji sintetis.', tags: ['fixture']
    }
  });
  assert.equal(resourceResponse.status, 201, await resourceResponse.clone().text());
  const resourcesBeforeReview = await (await request('/api/academic/resources')).json();
  assert.deepEqual(resourcesBeforeReview.resources, []);
  const submittedResource = await request('/api/academic/resources/fixture-exam-2026/submit', {
    method: 'POST', cookie: curatorLogin.cookie, body: {}
  });
  assert.equal((await submittedResource.json()).resource.status, 'pending_review');
  assert.equal((await (await request('/api/academic/resources')).json()).resources.length, 0);
  const publishedResource = await request('/api/admin/academic/resource/fixture-exam-2026/review', {
    method: 'PUT', cookie: adminLogin.cookie, body: { status: 'published', note: 'Fixture test approval' }
  });
  assert.equal((await publishedResource.json()).record.status, 'published');
  assert.equal((await (await request(`/api/knowledge/files/${uploadedFile.id}`)).arrayBuffer()).byteLength, Buffer.byteLength('%PDF-1.4 synthetic fixture\n%%EOF'));

  const rootPost = await request('/api/knowledge/resources/fixture-exam-2026/discussions', {
    method: 'POST', cookie: curatorLogin.cookie,
    body: { message: 'Soal fixture: apakah traversal BFS?', solution_type: 'question' }
  });
  assert.equal(rootPost.status, 202);
  const rootPostBody = (await rootPost.json()).discussion;
  assert.equal(rootPostBody.solution_type, 'question');
  const curatorDiscussionQueue = await (await request('/api/admin/knowledge/discussions', { cookie: curatorLogin.cookie })).json();
  assert.ok(curatorDiscussionQueue.discussions.some(({ id }) => id === rootPostBody.id));
  assert.equal((await request(`/api/knowledge/resources/fixture-exam-2026/discussions`)).status, 200);
  assert.equal((await request('/api/knowledge/resources/fixture-exam-2026/discussions', {
    method: 'POST', cookie: moderatorLogin.cookie,
    body: { parent_id: 'missing-parent', message: 'Jawaban sebelum moderasi', solution_type: 'answer' }
  })).status, 400);
  assert.equal((await request(`/api/admin/knowledge/discussions/${rootPostBody.id}/moderation`, {
    method: 'PUT', cookie: moderatorLogin.cookie, body: { status: 'published' }
  })).status, 200);
  const reply = await request('/api/knowledge/resources/fixture-exam-2026/discussions', {
    method: 'POST', cookie: moderatorLogin.cookie,
    body: { parent_id: rootPostBody.id, message: 'Solusi BFS fixture.', solution_type: 'answer' }
  });
  assert.equal(reply.status, 202);
  const replyBody = (await reply.json()).discussion;
  assert.equal((await request(`/api/admin/knowledge/discussions/${replyBody.id}/moderation`, {
    method: 'PUT', cookie: moderatorLogin.cookie, body: { status: 'published' }
  })).status, 200);
  assert.equal((await request(`/api/admin/knowledge/discussions/${replyBody.id}/solution`, {
    method: 'PUT', cookie: moderatorLogin.cookie, body: {}
  })).status, 200);
  const publishedThread = (await (await request('/api/knowledge/resources/fixture-exam-2026/discussions')).json()).discussions;
  assert.equal(publishedThread.find(({ id }) => id === replyBody.id).parent_id, rootPostBody.id);
  assert.equal(publishedThread.find(({ id }) => id === replyBody.id).selected_solution, 1);

  const learningPath = await request('/api/academic/learning-paths', {
    method: 'POST', cookie: curatorLogin.cookie,
    body: {
      id: 'fixture-path-front-end', title: 'Synthetic Front-end Path', track: 'Front-End',
      milestones: [{ id: 'html', title: 'HTML Dasar', resource_ids: ['fixture-exam-2026'], prerequisite_ids: [] }]
    }
  });
  assert.equal(learningPath.status, 201);
  assert.equal((await request('/api/academic/learning-paths/fixture-path-front-end/submit', {
    method: 'POST', cookie: curatorLogin.cookie, body: {}
  })).status, 200);
  const publishedPath = await request('/api/admin/academic/learning-path/fixture-path-front-end/review', {
    method: 'PUT', cookie: adminLogin.cookie, body: { status: 'published' }
  });
  assert.equal((await publishedPath.json()).record.status, 'published');
  const publicPath = await (await request('/api/academic/learning-paths')).json();
  assert.equal(publicPath.learning_paths[0].milestones[0].resource_ids[0], 'fixture-exam-2026');
  const backup = await (await request('/api/admin/backup', { cookie: adminLogin.cookie })).json();
  assert.ok(backup.data.academic_resources.some(({ id }) => id === 'fixture-exam-2026'));
  assert.ok(backup.data.academic_learning_paths.some(({ id }) => id === 'fixture-path-front-end'));
  assert.ok(backup.data.knowledge_discussions.some(({ id, selected_solution }) => id === replyBody.id && selected_solution === 1));

  const tutorProfile = await request('/api/tutoring/profile/mine', {
    method: 'PUT', cookie: moderatorLogin.cookie,
    body: {
      expertise: ['Graph Algorithms'],
      availability: [{ dayOfWeek: 1, start: '14:00', end: '18:00', mode: 'online' }],
      bio: 'Tutor fixture', active: true
    }
  });
  assert.equal(tutorProfile.status, 200);
  const tutoringRequestBody = {
    course: 'Algoritma',
    topic: 'Graph traversal',
    message: 'Membutuhkan bantuan graph algorithms.',
    preferred_slots: [{ date: '2026-10-12', start: '15:00', end: '16:00', mode: 'online' }]
  };
  const firstRequest = await request('/api/tutoring/requests', {
    method: 'POST', cookie: curatorLogin.cookie, body: tutoringRequestBody
  });
  assert.equal(firstRequest.status, 201);
  const firstTutoringRequest = (await firstRequest.json()).request;
  assert.deepEqual(firstTutoringRequest.preferred_slots, tutoringRequestBody.preferred_slots);
  const firstMatches = await (await request('/api/tutoring/requests', { cookie: moderatorLogin.cookie })).json();
  assert.equal(firstMatches.requests.find(({ id }) => id === firstTutoringRequest.id).suggested_tutors[0].account_id, moderator.account_id);
  const sessionAt = '2026-10-12T08:00:00.000Z';
  assert.equal((await request(`/api/tutoring/requests/${firstTutoringRequest.id}/schedule`, {
    method: 'PUT', cookie: moderatorLogin.cookie,
    body: { tutor_account_id: moderator.account_id, session_at: '2026-10-12T10:00:00.000Z', duration_minutes: 60, mode: 'online', meeting_url: 'https://meet.google.com/outside-student-slot' }
  })).status, 409);
  const firstBooking = await request(`/api/tutoring/requests/${firstTutoringRequest.id}/schedule`, {
    method: 'PUT', cookie: moderatorLogin.cookie,
    body: { tutor_account_id: moderator.account_id, session_at: sessionAt, duration_minutes: 60, mode: 'online', meeting_url: 'https://meet.google.com/synthetic-session' }
  });
  assert.equal(firstBooking.status, 200);

  const secondRequest = await request('/api/tutoring/requests', {
    method: 'POST', cookie: curatorLogin.cookie, body: tutoringRequestBody
  });
  assert.equal(secondRequest.status, 201);
  const secondTutoringRequest = (await secondRequest.json()).request;
  const secondMatches = await (await request('/api/tutoring/requests', { cookie: moderatorLogin.cookie })).json();
  assert.equal(secondMatches.requests.find(({ id }) => id === secondTutoringRequest.id).suggested_tutors.length, 0);
  assert.equal((await request(`/api/tutoring/requests/${secondTutoringRequest.id}/schedule`, {
    method: 'PUT', cookie: moderatorLogin.cookie,
    body: { tutor_account_id: moderator.account_id, session_at: sessionAt, duration_minutes: 60, mode: 'online', meeting_url: 'https://meet.google.com/synthetic-session-2' }
  })).status, 409);

  const curatorFiles = await (await request('/api/knowledge/files', { cookie: curatorLogin.cookie })).json();
  assert.ok(curatorFiles.files.some(({ id }) => id === uploadedFile.id));
  assert.equal((await request(`/api/knowledge/files/${uploadedFile.id}`, { method: 'DELETE', cookie: moderatorLogin.cookie })).status, 403);
  assert.equal((await request(`/api/knowledge/files/${uploadedFile.id}`, { method: 'DELETE', cookie: curatorLogin.cookie })).status, 409);
  const audit = await (await request('/api/admin/audit', { cookie: adminLogin.cookie })).json();
  assert.ok(audit.entries.some(({ action }) => action === 'academic.curator_grant'));
  assert.ok(audit.entries.some(({ action }) => action === 'academic.resource_submit'));
  assert.equal((await request('/api/admin/users/academic-curator/academic-curator', {
    method: 'PUT', cookie: adminLogin.cookie, body: { enabled: false }
  })).status, 200);
  assert.equal((await request('/api/academic/resources/mine', { cookie: curatorLogin.cookie })).status, 403);
});