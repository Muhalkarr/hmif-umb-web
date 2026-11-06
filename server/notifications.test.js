import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'hmif-notification-test-'));
const origin = 'http://localhost:5173';
const adminPassword = 'local-test-admin-password-2026';
const memberPassword = 'local-test-member-password-2026';
process.env.NODE_ENV = 'development';
process.env.PORT = '0';
process.env.JWT_SECRET = randomBytes(48).toString('base64url');
process.env.FRONTEND_ORIGINS = origin;
process.env.ALLOW_PUBLIC_REGISTRATION = 'false';
process.env.INITIAL_ADMIN_NIM = 'notification-admin';
process.env.INITIAL_ADMIN_PASSWORD = adminPassword;
process.env.DATABASE_FILE = path.join(temporaryDirectory, 'database.sqlite');
process.env.ASSET_STORAGE_DIR = path.join(temporaryDirectory, 'assets');

const { server } = await import('./index.js');
const { db } = await import('./db.js');
if (!server.listening) await once(server, 'listening');
const baseUrl = `http://127.0.0.1:${server.address().port}`;

const request = (endpoint, { method = 'GET', cookie, body, requestOrigin = origin } = {}) => {
  const headers = {};
  if (requestOrigin) headers.Origin = requestOrigin;
  if (cookie) headers.Cookie = cookie;
  if (body) headers['Content-Type'] = 'application/json';
  return fetch(`${baseUrl}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
};

const login = async (nim, password) => {
  const response = await request('/api/auth/login', { method: 'POST', body: { nim, password } });
  const payload = await response.json();
  return { response, payload, cookie: response.headers.get('set-cookie')?.split(';')[0] };
};

const createMember = async (adminCookie, nim, name) => {
  const response = await request('/api/admin/users', {
    method: 'POST',
    cookie: adminCookie,
    body: { nim, name, password: memberPassword, generation: '2026', division: 'Litbang' }
  });
  assert.equal(response.status, 201);
  const user = (await response.json()).user;
  const promoted = await request(`/api/admin/users/${nim}`, {
    method: 'PUT',
    cookie: adminCookie,
    body: { clearance_level: 2 }
  });
  assert.equal(promoted.status, 200);
  return { user, login: await login(nim, memberPassword) };
};

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

test('notifications are private, preference-controlled, and created for workflow changes and reminders', async () => {
  const adminLogin = await login('notification-admin', adminPassword);
  assert.equal(adminLogin.response.status, 200);
  const first = await createMember(adminLogin.cookie, 'notification-member-1', 'Notification Member One');
  const second = await createMember(adminLogin.cookie, 'notification-member-2', 'Notification Member Two');
  assert.equal((await request('/api/notifications')).status, 401);

  const initialPreferences = await request('/api/notifications', { cookie: first.login.cookie });
  assert.equal(initialPreferences.status, 200);
  assert.deepEqual((await initialPreferences.json()).preferences, {
    deadline: true,
    task: true,
    submission: true,
    tutoring: true,
    deadline_days: 3,
    tutoring_reminder_hours: 24
  });
  assert.equal((await request('/api/notification-preferences', {
    method: 'PUT', cookie: first.login.cookie, body: { deadline_days: 2 }
  })).status, 400);
  assert.equal((await request('/api/notification-preferences', {
    method: 'PUT', cookie: first.login.cookie, body: { deadline: true, injected: true }
  })).status, 400);
  assert.equal((await request('/api/notification-preferences', {
    method: 'PUT', cookie: first.login.cookie, body: {
      deadline: true, task: true, submission: true, tutoring: true,
      deadline_days: 3, tutoring_reminder_hours: 48
    }
  })).status, 200);

  const dueDate = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const deadlineResponse = await request('/api/calendar', {
    method: 'POST',
    cookie: adminLogin.cookie,
    body: {
      date_str: dueDate,
      title: 'Batas Pendaftaran Beasiswa QA',
      type: 'beasiswa',
      division: 'Akademik',
      registration_url: 'https://example.org/scholarship'
    }
  });
  assert.equal(deadlineResponse.status, 201);

  const taskResponse = await request('/api/tasks', {
    method: 'POST',
    cookie: adminLogin.cookie,
    body: {
      title: 'Menyiapkan materi peer review',
      description: 'Task notification integration check.',
      pic_account_id: first.user.account_id,
      due_date: dueDate
    }
  });
  assert.equal(taskResponse.status, 201);
  const task = (await taskResponse.json()).task;
  const changedTask = await request(`/api/tasks/${task.id}`, {
    method: 'PUT',
    cookie: first.login.cookie,
    body: { status: 'in_progress' }
  });
  assert.equal(changedTask.status, 200);

  const projectSubmission = await request('/api/portal-records/project', {
    method: 'POST',
    cookie: first.login.cookie,
    body: {
      title: 'Notification test project',
      author: 'Notification Member One',
      category: 'Web',
      description: 'Project used to validate status notifications.',
      repo_url: 'https://github.com/example/notification-project',
      demo_url: '',
      tags: ['test']
    }
  });
  assert.equal(projectSubmission.status, 202);
  const project = (await projectSubmission.json()).record;
  const revision = await request(`/api/admin/portal-records/project/${project.id}/review`, {
    method: 'PUT',
    cookie: adminLogin.cookie,
    body: { action: 'needs_revision', note: 'Tambahkan detail kontribusi.' }
  });
  assert.equal(revision.status, 200);

  const tutorProfile = await request('/api/tutoring/profile/mine', {
    method: 'PUT',
    cookie: second.login.cookie,
    body: {
      expertise: ['Algoritma'],
      availability: Array.from({ length: 7 }, (_, dayOfWeek) => ({
        dayOfWeek, start: '00:00', end: '23:59', mode: 'any'
      })),
      bio: 'Tutor uji notifikasi',
      active: true
    }
  });
  assert.equal(tutorProfile.status, 200);
  const tutoringSubmission = await request('/api/tutoring/requests', {
    method: 'POST',
    cookie: first.login.cookie,
    body: {
      course: 'Algoritma',
      topic: 'Graf',
      message: 'Perlu bantuan memahami graph traversal.',
      preferred_time: 'Sore'
    }
  });
  assert.equal(tutoringSubmission.status, 201);
  const tutoringRequest = (await tutoringSubmission.json()).request;
  const sessionDate = new Date();
  sessionDate.setDate(sessionDate.getDate() + 1);
  sessionDate.setHours(10, 0, 0, 0);
  const sessionAt = sessionDate.toISOString();
  const scheduled = await request(`/api/tutoring/requests/${tutoringRequest.id}/schedule`, {
    method: 'PUT',
    cookie: adminLogin.cookie,
    body: {
      tutor_account_id: second.user.account_id,
      session_at: sessionAt,
      mode: 'online',
      meeting_url: 'https://meet.google.com/qa-test-session'
    }
  });
  assert.equal(scheduled.status, 200);

  const firstNotificationsResponse = await request('/api/notifications', { cookie: first.login.cookie });
  assert.equal(firstNotificationsResponse.status, 200);
  const firstNotifications = await firstNotificationsResponse.json();
  const firstMessages = firstNotifications.notifications.map(({ title, message }) => `${title} ${message}`).join('\n');
  assert.match(firstMessages, /Tenggat yang semakin dekat|Tenggat semakin dekat|Tenggat tugas semakin dekat/);
  assert.ok(firstNotifications.notifications.some((notification) => notification.title === 'Tenggat semakin dekat' && notification.action_view === 'calendar'));
  assert.match(firstMessages, /Anda mendapat tugas organisasi/);
  assert.match(firstMessages, /memerlukan revisi/);
  assert.match(firstMessages, /Klinik Koding dijadwalkan/);
  assert.match(firstMessages, /Pengingat sesi Klinik Koding/);
  assert.ok(firstNotifications.unread_count >= 5);

  const adminNotificationsResponse = await request('/api/notifications', { cookie: adminLogin.cookie });
  assert.equal(adminNotificationsResponse.status, 200);
  const adminNotifications = await adminNotificationsResponse.json();
  assert.ok(adminNotifications.notifications.some(({ title, message }) => title === 'Status tugas diperbarui' && message.includes(task.title)));
  assert.equal(adminNotifications.notifications.some(({ message }) => message.includes(project.title)), false);

  const unreadId = firstNotifications.notifications.find(({ is_read }) => !is_read).id;
  assert.equal((await request(`/api/notifications/${unreadId}/read`, {
    method: 'PUT', cookie: second.login.cookie, body: {}
  })).status, 404);
  assert.equal((await request(`/api/notifications/${unreadId}/read`, {
    method: 'PUT', cookie: first.login.cookie, body: {}
  })).status, 200);
  assert.equal((await request('/api/notifications/read-all', {
    method: 'PUT', cookie: first.login.cookie, body: {}
  })).status, 200);
  const readNotifications = await (await request('/api/notifications', { cookie: first.login.cookie })).json();
  assert.equal(readNotifications.unread_count, 0);

  const savedPreferences = await request('/api/notification-preferences', {
    method: 'PUT', cookie: first.login.cookie, body: { deadline: false, tutoring_reminder_hours: 0 }
  });
  assert.equal(savedPreferences.status, 200);
  assert.equal((await savedPreferences.json()).preferences.deadline, false);
  const backup = await (await request('/api/admin/backup', { cookie: adminLogin.cookie })).json();
  assert.ok(backup.data.notifications.some(({ recipient_account_id }) => recipient_account_id === first.user.account_id));
  assert.ok(backup.data.notification_preferences.some(({ account_id }) => account_id === first.user.account_id));
});
