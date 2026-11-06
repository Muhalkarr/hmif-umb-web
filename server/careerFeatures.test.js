import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterCareerOpportunities,
  groupAlumniByProvince,
  normalizeCareerSpecializations,
  validateMentorshipRequest
} from './careerFeatures.js';

test('normalizes legacy job specialization into supported career filters', () => {
  assert.deepEqual(normalizeCareerSpecializations(undefined, 'Full-stack / Data Platform'), ['Full-stack', 'Data']);
  assert.deepEqual(normalizeCareerSpecializations(['AI', 'AI']), ['AI']);
  assert.throws(() => normalizeCareerSpecializations(['Blockchain']), /daftar bidang/);
});

test('filters opportunities by selected career specialization', () => {
  const jobs = [
    { title: 'Engineer', specializations: ['Full-stack', 'Data'] },
    { title: 'Analyst', specializations: ['Data'] }
  ];
  assert.deepEqual(filterCareerOpportunities(jobs, 'Data').map(({ title }) => title), ['Engineer', 'Analyst']);
  assert.deepEqual(filterCareerOpportunities(jobs, 'Mobile'), []);
});

test('groups alumni distribution by declared province without guessing from city text', () => {
  assert.deepEqual(groupAlumniByProvince([
    { province: 'Jawa Barat' }, { province: 'Jawa Barat' }, { location: 'Bandung' }
  ]), { 'Jawa Barat': 2, 'Belum dicantumkan': 1 });
});

test('validates career mentorship purpose and scheduling window', () => {
  const now = Date.parse('2026-10-05T00:00:00Z');
  const request = validateMentorshipRequest({
    session_type: 'cv_review',
    topic: 'Review CV untuk posisi software engineer.',
    preferred_mode: 'online',
    preferred_at: '2026-10-06T10:00:00+07:00'
  }, now);
  assert.equal(request.duration_minutes, 30);
  assert.equal(request.preferred_at, '2026-10-06T03:00:00.000Z');
  assert.throws(() => validateMentorshipRequest({ ...request, session_type: 'career_advice' }, now), /tidak valid/);
});