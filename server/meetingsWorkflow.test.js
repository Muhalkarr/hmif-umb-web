import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'hmif-meetings-'));
const adminPassword = 'test-meetings-admin-password-123';
const organizerPassword = 'test-meetings-organizer-password-123';
const memberPassword = 'test-meetings-member-password-123';
const outsiderPassword = 'test-meetings-outsider-password-123';
const origin = 'http://localhost:5173';

process.env.NODE_ENV = 'development';
process.env.PORT = '0';
process.env.JWT_SECRET = randomBytes(48).toString('base64url');
process.env.FRONTEND_ORIGINS = origin;
process.env.ALLOW_PUBLIC_REGISTRATION = 'false';
process.env.INITIAL_ADMIN_NIM = 'meetings-admin';
process.env.INITIAL_ADMIN_PASSWORD = adminPassword;
process.env.DATABASE_FILE = path.join(temporaryDirectory, 'database.sqlite');
process.env.ASSET_STORAGE_DIR = path.join(temporaryDirectory, 'assets');
process.env.MEETING_VIDEO_ENABLED = 'true';
process.env.LIVEKIT_WS_URL = 'wss://livekit.example.test';
process.env.LIVEKIT_API_KEY = 'test-livekit-key';
process.env.LIVEKIT_API_SECRET = 'test-livekit-secret-that-is-never-returned';

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

test('meeting workflows enforce explicit organizer capabilities and isolate invited attendees', async () => {
  const admin = await login('meetings-admin', adminPassword);
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
  const organizer = await createUser('meetings-organizer', 'Synthetic Organizer', organizerPassword);
  const member = await createUser('meetings-member', 'Synthetic Member', memberPassword);
  const outsider = await createUser('meetings-outsider', 'Synthetic Outsider', outsiderPassword);
  assert.equal((await request('/api/admin/users/meetings-outsider', {
    method: 'PUT',
    cookie: admin.cookie,
    body: { clearance_level: 3 }
  })).status, 200);

  assert.equal((await request('/api/admin/users/meetings-organizer/meeting-organizer', {
    method: 'PUT', cookie: admin.cookie, body: { enabled: true }
  })).status, 200);
  const organizerLogin = await login(organizer.nim, organizerPassword);
  const memberLogin = await login(member.nim, memberPassword);

  const startsAt = new Date(Date.now() + 86400000).toISOString();
  const endsAt = new Date(Date.parse(startsAt) + 3600000).toISOString();
  const meetingBody = {
    title: 'Rapat Koordinasi Synthetic',
    agenda: 'Evaluasi program kerja.',
    location: 'Ruang rapat HMIF',
    video_mode: 'livekit',
    starts_at: startsAt,
    ends_at: endsAt,
    attendee_nims: [member.nim],
    recurrence: { frequency: 'weekly', interval: 1, until: new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10) }
  };

  assert.equal((await request('/api/meetings', { method: 'POST', cookie: memberLogin.cookie, body: meetingBody })).status, 403);
  const outsiderLogin = await login(outsider.nim, outsiderPassword);
  assert.equal((await request('/api/meetings', { method: 'POST', cookie: outsiderLogin.cookie, body: meetingBody })).status, 403);
  assert.equal((await request('/api/meetings', {
    method: 'POST',
    cookie: organizerLogin.cookie,
    body: { ...meetingBody, recurrence: { frequency: 'weekly', interval: 1, until: '2026-02-30' } }
  })).status, 400);
  const createdResponse = await request('/api/meetings', { method: 'POST', cookie: organizerLogin.cookie, body: meetingBody });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.equal(created.meetings.length, 3);
  const meetingId = created.meetings[0].id;
  assert.equal(created.meetings[0].video_mode, 'livekit');
  assert.equal(created.meetings[0].attendees.length, 2);
  const conferencingCapabilities = await (await request('/api/meetings/capabilities', {
    cookie: memberLogin.cookie
  })).json();
  assert.equal(conferencingCapabilities.videoEnabled, true);
  assert.equal(conferencingCapabilities.recordingEnabled, false);
  const joinResponse = await request(`/api/meetings/${meetingId}/video/token`, { method: 'POST', cookie: memberLogin.cookie, body: {} });
  assert.equal(joinResponse.status, 200, await joinResponse.clone().text());
  const joinToken = await joinResponse.json();
  const tokenClaims = jwt.decode(joinToken.token);
  assert.equal(tokenClaims.sub, member.account_id);
  assert.equal(tokenClaims.video.room, `hmif-meeting-${meetingId}`);
  assert.equal((await request(`/api/meetings/${meetingId}/video/token`, {
    method: 'POST',
    cookie: outsiderLogin.cookie,
    body: {}
  })).status, 404);
  assert.equal((await request(`/api/meetings/${meetingId}/recording/start`, {
    method: 'POST',
    cookie: organizerLogin.cookie,
    body: { notice_confirmed: true }
  })).status, 503);
  assert.equal((await request('/api/meetings', {
    method: 'POST',
    cookie: organizerLogin.cookie,
    body: { ...meetingBody, video_mode: 'external', location: 'http://insecure.example.test/meeting' }
  })).status, 400);
  const publicCalendar = await request('/api/calendar');
  assert.equal((await publicCalendar.json()).some(({ title }) => title === meetingBody.title), false);
  const memberNotifications = await (await request('/api/notifications', { cookie: memberLogin.cookie })).json();
  assert.equal(
    memberNotifications.notifications.some(({ title }) => title === `Undangan rapat: ${meetingBody.title}`),
    true,
    'invited members should receive an in-app notification'
  );

  const memberMeetingsResponse = await request('/api/meetings/mine', { cookie: memberLogin.cookie });
  const memberMeetings = (await memberMeetingsResponse.json()).meetings;
  assert.equal(memberMeetings.length, 3);
  assert.deepEqual(memberMeetings[0].attendees.map(({ account_id }) => account_id), [member.account_id]);
  assert.equal((await request('/api/meetings/mine', { cookie: outsiderLogin.cookie })).status, 200);
  assert.equal((await (await request('/api/meetings/mine', { cookie: outsiderLogin.cookie })).json()).meetings.length, 0);
  assert.equal((await request(`/api/meetings/${meetingId}`, { cookie: outsiderLogin.cookie })).status, 404);

  assert.equal((await request(`/api/meetings/${meetingId}/rsvp`, {
    method: 'PUT', cookie: memberLogin.cookie, body: { response: 'accepted' }
  })).status, 200);
  assert.equal((await request(`/api/meetings/${meetingId}/minutes`, {
    method: 'PUT', cookie: memberLogin.cookie, body: { minutes: 'Catatan tidak sah.', decisions: [] }
  })).status, 403);
  assert.equal((await request(`/api/meetings/${meetingId}/minutes`, {
    method: 'PUT',
    cookie: organizerLogin.cookie,
    body: { minutes: 'Rapat membahas evaluasi program kerja.', decisions: ['Jadwalkan evaluasi lanjutan.'] }
  })).status, 200);
  assert.equal((await request(`/api/meetings/${meetingId}/attendance`, {
    method: 'PUT', cookie: organizerLogin.cookie, body: { account_id: member.account_id, response: 'attended' }
  })).status, 200);

  const actionResponse = await request(`/api/meetings/${meetingId}/actions`, {
    method: 'POST',
    cookie: organizerLogin.cookie,
    body: { title: 'Menyiapkan bahan evaluasi', assignee_nim: member.nim, due_date: '2026-12-01' }
  });
  assert.equal(actionResponse.status, 201);
  assert.equal((await request(`/api/meetings/${meetingId}/documents`, {
    method: 'POST',
    cookie: organizerLogin.cookie,
    body: { title: 'Notulensi rapat', url: 'http://example.org/minutes' }
  })).status, 400);
  assert.equal((await request(`/api/meetings/${meetingId}/documents`, {
    method: 'POST',
    cookie: organizerLogin.cookie,
    body: { title: 'Dokumen agenda', url: 'https://example.org/agenda' }
  })).status, 201);
  const documentForm = new FormData();
  documentForm.set('title', 'Lampiran rapat');
  documentForm.set('file', new Blob(['%PDF-1.4\nSynthetic meeting attachment\n%%EOF'], { type: 'application/pdf' }), 'agenda.pdf');
  const uploadedDocumentResponse = await fetch(`${baseUrl}/api/meetings/${meetingId}/documents/upload`, {
    method: 'POST',
    headers: { Origin: origin, Cookie: organizerLogin.cookie, Connection: 'close' },
    body: documentForm
  });
  assert.equal(uploadedDocumentResponse.status, 201, (await uploadedDocumentResponse.clone().json()).error);
  const uploadedDocument = (await uploadedDocumentResponse.json()).document;
  assert.equal((await request(uploadedDocument.url, { cookie: outsiderLogin.cookie })).status, 404);
  const downloadedDocument = await request(uploadedDocument.url, { cookie: memberLogin.cookie });
  assert.equal(downloadedDocument.status, 200);
  assert.match(await downloadedDocument.text(), /Synthetic meeting attachment/);
  const memberDetail = await (await request(`/api/meetings/${meetingId}`, { cookie: memberLogin.cookie })).json();
  assert.match(memberDetail.meeting.minutes, /evaluasi program kerja/);
  assert.equal(memberDetail.meeting.actions.length, 1);
  assert.equal(memberDetail.meeting.documents.length, 2);
  const revisedStart = new Date(Date.parse(meetingBody.starts_at) + 3600000).toISOString();
  const revisedEnd = new Date(Date.parse(meetingBody.ends_at) + 3600000).toISOString();
  assert.equal((await request(`/api/meetings/${meetingId}/schedule`, {
    method: 'PUT',
    cookie: organizerLogin.cookie,
    body: { starts_at: revisedStart, ends_at: revisedEnd }
  })).status, 200);
  const rescheduledMeeting = await request(`/api/meetings/${meetingId}`, { cookie: memberLogin.cookie });
  assert.equal((await rescheduledMeeting.json()).meeting.starts_at, revisedStart);
  assert.equal((await request(`/api/meetings/${meetingId}`, {
    method: 'DELETE', cookie: organizerLogin.cookie, body: { scope: 'occurrence' }
  })).status, 200);
  assert.equal((await request(`/api/meetings/${meetingId}/rsvp`, {
    method: 'PUT', cookie: memberLogin.cookie, body: { response: 'declined' }
  })).status, 409);
  assert.equal((await request(`/api/meetings/${meetingId}`, {
    method: 'DELETE', cookie: organizerLogin.cookie, body: { scope: 'series' }
  })).status, 200);
  assert.equal((await request('/api/admin/users/meetings-organizer/meeting-organizer', {
    method: 'PUT', cookie: admin.cookie, body: { enabled: false }
  })).status, 200);
  assert.equal((await request(`/api/meetings/${meetingId}/minutes`, {
    method: 'PUT',
    cookie: organizerLogin.cookie,
    body: { minutes: 'Tidak dapat mengubah tanpa capability.', decisions: [] }
  })).status, 403);
});
