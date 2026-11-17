import assert from 'node:assert/strict';
import test from 'node:test';
import { renderLearningWorkspace } from './workspaceLearning.js';
import { renderSupportWorkspace } from './workspaceSupport.js';

const resource = {
  id: 'resource-js',
  title: 'JavaScript dasar',
  file_id: '',
  url: 'https://example.com/javascript'
};

const learningPath = {
  id: 'front-end-basics',
  title: '<script>jalur aman</script>',
  track: 'Front End',
  summary: 'Belajar bertahap.',
  estimated_hours: 3,
  milestones: [
    { id: 'intro', order: 1, title: 'Pengenalan', description: 'Mulai di sini.', resource_ids: ['resource-js'], prerequisite_ids: [] },
    { id: 'practice', order: 2, title: 'Praktik', description: 'Lanjutkan latihan.', resource_ids: ['resource-js'], prerequisite_ids: ['intro'] }
  ]
};

test('course experience renders escaped course data, linked material, enrollment and prerequisite progress', () => {
  const catalog = renderLearningWorkspace({
    viewId: 'learning-course-grid',
    paths: [learningPath],
    resources: [resource],
    enrollments: [],
    selectedPathId: ''
  });
  assert.match(catalog, /&lt;script&gt;jalur aman&lt;\/script&gt;/);
  assert.doesNotMatch(catalog, /<script>jalur aman<\/script>/);
  assert.match(catalog, /data-learning-open="front-end-basics"/);

  const detail = renderLearningWorkspace({
    viewId: 'learning-course-details',
    paths: [learningPath],
    resources: [resource],
    enrollments: [{ learning_path_id: learningPath.id, completed_milestones: [] }],
    selectedPathId: learningPath.id
  });
  assert.match(detail, /href="https:\/\/example\.com\/javascript"/);
  assert.match(detail, /data-learning-complete="intro"/);
  assert.match(detail, /data-learning-complete="practice"[^>]*disabled/);
});

test('Support Desk renders member ticket creation, ticket table, and staff report data', () => {
  const ticket = {
    id: 'ticket-12345678',
    name: 'Anggota HMIF',
    subject: '<img src=x onerror=alert(1)>',
    category: 'teknis',
    status: 'open',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z'
  };
  const memberPage = renderSupportWorkspace({
    viewId: 'support-table',
    tickets: [ticket],
    detail: null,
    canManage: false
  });
  assert.match(memberPage, /data-support-create/);
  assert.match(memberPage, /data-support-open="ticket-12345678"/);
  assert.match(memberPage, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(memberPage, /<img src=x onerror=alert\(1\)>/);

  const report = renderSupportWorkspace({
    viewId: 'support-reports',
    tickets: [ticket],
    detail: null,
    canManage: true,
    report: { total: 8, by_status: { open: 4, in_progress: 2, resolved: 2 }, by_category: { teknis: 8 } }
  });
  assert.match(report, />8</);
  assert.match(report, />4</);
  assert.match(report, /teknis/);
});
