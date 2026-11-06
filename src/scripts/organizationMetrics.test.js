import assert from 'node:assert/strict';
import test from 'node:test';
import { getOrganizationTaskMetrics } from './organizationMetrics.js';

test('calculates organization task KPIs without treating today as overdue', () => {
  const metrics = getOrganizationTaskMetrics([
    { status: 'todo', due_date: '2026-10-04' },
    { status: 'in_progress', due_date: '2026-10-05' },
    { status: 'review', due_date: null },
    { status: 'done', due_date: '2026-10-01' }
  ], new Date('2026-10-05T10:00:00'));

  assert.equal(metrics.total, 4);
  assert.equal(metrics.overdue, 1);
  assert.equal(metrics.completionRate, 25);
  assert.deepEqual(metrics.counts, { todo: 1, in_progress: 1, review: 1, done: 1 });
});

test('returns zeroed task KPIs for an empty board', () => {
  assert.deepEqual(getOrganizationTaskMetrics([], new Date('2026-10-05')), {
    total: 0,
    counts: { todo: 0, in_progress: 0, review: 0, done: 0 },
    overdue: 0,
    completionRate: 0
  });
});