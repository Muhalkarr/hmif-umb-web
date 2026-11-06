import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'hmif-career-test-'));
const origin = 'http://localhost:5173';
process.env.NODE_ENV = 'development';
process.env.PORT = '0';
process.env.JWT_SECRET = randomBytes(48).toString('base64url');
process.env.FRONTEND_ORIGINS = origin;
process.env.ALLOW_PUBLIC_REGISTRATION = 'false';
process.env.INITIAL_ADMIN_NIM = 'career-admin';
process.env.INITIAL_ADMIN_PASSWORD = 'career-admin-password-test';
process.env.DATABASE_FILE = path.join(temporaryDirectory, 'database.sqlite');
process.env.ASSET_STORAGE_DIR = path.join(temporaryDirectory, 'assets');

const { server } = await import('./index.js');
const { db } = await import('./db.js');
if (!server.listening) await once(server, 'listening');
const baseUrl = `http://127.0.0.1:${server.address().port}`;

const request = (endpoint, { method = 'GET', cookie, body } = {}) => {
  const headers = { Origin: origin };
  if (cookie) headers.Cookie = cookie;
  if (body) headers['Content-Type'] = 'application/json';
  return fetch(`${baseUrl}${endpoint}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
};

const login = async (nim, password) => {
  const response = await request('/api/auth/login', { method: 'POST', body: { nim, password } });
  const payload = await response.json();
  return { response, payload, cookie: response.headers.get('set-cookie')?.split(';')[0] };
};

const createMember = (cookie, nim, name) => request('/api/admin/users', {
  method: 'POST', cookie,
  body: { nim, name, password: 'career-member-password-123', generation: '2026', division: 'Anggota' }
});

test('filters curated jobs and manages consented alumni mentorship sessions', async () => {
  const admin = await login('career-admin', 'career-admin-password-test');
  assert.equal(admin.response.status, 200);
  assert.equal((await createMember(admin.cookie, 'career-mentor', 'Mentor Alumni')).status, 201);
  assert.equal((await createMember(admin.cookie, 'career-student', 'Mahasiswa Akhir')).status, 201);
  assert.equal((await createMember(admin.cookie, 'career-stranger', 'Anggota Lain')).status, 201);
  const mentor = await login('career-mentor', 'career-member-password-123');
  const student = await login('career-student', 'career-member-password-123');
  const stranger = await login('career-stranger', 'career-member-password-123');
  assert.equal(mentor.response.status, 200);
  assert.equal(student.response.status, 200);

  const alumniSubmission = await request('/api/portal-records/alumni', {
    method: 'POST', cookie: mentor.cookie,
    body: {
      name: 'Mentor Alumni', graduation_year: '2020', company: 'Perusahaan Uji', position: 'Software Engineer',
      location: 'Bandung', city: 'Bandung', province: 'Jawa Barat', specialization: 'Full-stack',
      mentorship_available: true, speaker_available: true, referral_available: true,
      profile_url: 'https://example.org/profile', consent: true
    }
  });
  assert.equal(alumniSubmission.status, 202);
  const alumniId = (await alumniSubmission.json()).record.id;
  for (const action of ['approve', 'publish']) {
    assert.equal((await request(`/api/admin/portal-records/alumni/${alumniId}/review`, {
      method: 'PUT', cookie: admin.cookie, body: { action }
    })).status, 200);
  }

  const job = await request('/api/admin/portal-records/job', {
    method: 'POST', cookie: admin.cookie,
    body: {
      title: 'AI Platform Engineer', employer: 'Mitra Uji', specialization: 'AI platform engineering',
      specializations: ['AI', 'Data'], location: 'Remote', work_type: 'Magang', deadline: '2026-12-31',
      url: 'https://example.org/careers/ai'
    }
  });
  assert.equal(job.status, 201);
  const jobRecord = (await job.json()).record;
  for (const action of ['approve', 'publish']) {
    assert.equal((await request(`/api/admin/portal-records/job/${jobRecord.id}/review`, {
      method: 'PUT', cookie: admin.cookie, body: { action }
    })).status, 200);
  }
  const filteredCareer = await (await request('/api/career?specialization=AI')).json();
  assert.equal(filteredCareer.opportunities.length, 1);
  assert.deepEqual(filteredCareer.opportunities[0].specializations, ['AI', 'Data']);
  assert.deepEqual(filteredCareer.alumni_distribution, { 'Jawa Barat': 1 });
  assert.equal(filteredCareer.alumni[0].referral_available, true);
  assert.equal((await request('/api/career?specialization=Exploit')).status, 400);

  const requestBody = {
    session_type: 'technical_interview',
    topic: 'Simulasi wawancara backend dan struktur data.',
    preferred_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    preferred_mode: 'online'
  };
  assert.equal((await request(`/api/career/alumni/${alumniId}/mentorship-requests`, {
    method: 'POST', cookie: mentor.cookie, body: requestBody
  })).status, 409);
  const booking = await request(`/api/career/alumni/${alumniId}/mentorship-requests`, {
    method: 'POST', cookie: student.cookie, body: requestBody
  });
  assert.equal(booking.status, 201);
  const bookingId = (await booking.json()).request.id;
  assert.equal((await request('/api/career/mentorship-requests/mine', { cookie: stranger.cookie })).status, 200);
  assert.equal((await request('/api/admin/career/mentorship-requests', { cookie: student.cookie })).status, 403);
  assert.equal((await request(`/api/career/mentorship-requests/${bookingId}`, {
    method: 'PUT', cookie: stranger.cookie, body: { status: 'confirmed', meeting_mode: 'online', meeting_url: 'https://meet.example.org/session' }
  })).status, 404);
  const confirmation = await request(`/api/career/mentorship-requests/${bookingId}`, {
    method: 'PUT', cookie: mentor.cookie,
    body: { status: 'confirmed', meeting_mode: 'online', meeting_url: 'https://meet.example.org/session', mentor_note: 'Sesi dikonfirmasi.' }
  });
  assert.equal(confirmation.status, 200);
  const studentRequests = (await (await request('/api/career/mentorship-requests/mine', { cookie: student.cookie })).json()).requests;
  assert.equal(studentRequests[0].status, 'confirmed');
  assert.equal(studentRequests[0].is_mentor, false);
  assert.equal(Object.hasOwn(studentRequests[0], 'mentor_account_id'), false);
  const mentorRequests = (await (await request('/api/career/mentorship-requests/mine', { cookie: mentor.cookie })).json()).requests;
  assert.equal(mentorRequests[0].is_mentor, true);
  assert.equal(Object.hasOwn(mentorRequests[0], 'student_account_id'), false);
  assert.equal(studentRequests[0].meeting_url, 'https://meet.example.org/session');
  assert.equal((await request('/api/admin/career/mentorship-requests', { cookie: admin.cookie })).status, 200);
  const completion = await request(`/api/career/mentorship-requests/${bookingId}`, {
    method: 'PUT', cookie: mentor.cookie, body: { status: 'completed' }
  });
  assert.equal(completion.status, 200);
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});