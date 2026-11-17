import assert from 'node:assert/strict';
import test from 'node:test';
import { renderMemberDashboard } from './workspaceDashboard.js';

const today = new Date('2027-01-10T12:00:00');
const defaultResults = {
  notificationsResult: { ok: true, data: { notifications: [], unread_count: 0 } },
  ticketsResult: { ok: true, data: { tickets: [] } },
  enrollmentsResult: { ok: true, data: { enrollments: [] } },
  pathsResult: { ok: true, data: { learning_paths: [] } },
  calendarResult: { ok: true, data: [] }
};

test('member dashboard distinguishes successful empty data from unavailable services', () => {
  const html = renderMemberDashboard({
    user: { name: 'Anggota Uji', membership_stage: 'Anggota' },
    roleName: 'ANGGOTA',
    today,
    ...defaultResults
  });

  assert.match(html, /Belum ada notifikasi baru/);
  assert.match(html, /Tidak ada tiket yang memerlukan tindak lanjut/);
  assert.match(html, /Belum mengikuti jalur belajar/);
  assert.match(html, /Belum ada agenda mendatang/);
  assert.doesNotMatch(html, /role="alert"/);
  assert.match(html, /Anggota Uji/);
});

test('member dashboard surfaces endpoint failures instead of showing success-shaped counts', () => {
  const html = renderMemberDashboard({
    user: { name: 'Anggota Uji' },
    roleName: 'ANGGOTA',
    today,
    ...defaultResults,
    notificationsResult: { ok: false, error: 'Notifikasi tidak tersedia' },
    ticketsResult: { ok: false, error: 'Support Desk tidak tersedia' }
  });

  assert.match(html, /role="alert">Notifikasi tidak tersedia/);
  assert.match(html, /role="alert">Support Desk tidak tersedia/);
  assert.doesNotMatch(html, /workspace-member-shortcuts/);
});

test('member dashboard shows only the current member services and upcoming agenda', () => {
  const html = renderMemberDashboard({
    user: { name: '<img src=x onerror=alert(1)>', membership_stage: 'Anggota' },
    roleName: 'ANGGOTA',
    today,
    ...defaultResults,
    notificationsResult: {
      ok: true,
      data: { unread_count: 1, notifications: [{ title: 'Pembaruan <akun>', message: 'Pesan aman', is_read: false }] }
    },
    ticketsResult: {
      ok: true,
      data: { tickets: [
        { id: 'my-ticket', subject: 'Akun bermasalah', category: 'akun', status: 'open', updated_at: '2027-01-09T12:00:00Z' }
      ] }
    },
    enrollmentsResult: { ok: true, data: { enrollments: [{ learning_path_id: 'web', completed_milestones: ['html'] }] } },
    pathsResult: {
      ok: true,
      data: { learning_paths: [{ id: 'web', title: 'Web Dasar', milestones: [{ id: 'html' }, { id: 'css' }] }] }
    },
    calendarResult: {
      ok: true,
      data: [
        { date_str: '2027-01-09', title: 'Agenda lampau' },
        { date_str: '2027-01-12', title: 'Rapat anggota', type: 'Rapat', location: 'Ruang HMIF' }
      ]
    }
  });

  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img src=x onerror=alert\(1\)>/);
  assert.match(html, /Pembaruan &lt;akun&gt;/);
  assert.match(html, /Akun bermasalah/);
  assert.match(html, /50%/);
  assert.match(html, /Rapat anggota/);
  assert.doesNotMatch(html, /Agenda lampau/);
  assert.match(html, /data-learning-path-id="web"/);
  assert.doesNotMatch(html, /workspace-member-shortcuts/);
});
