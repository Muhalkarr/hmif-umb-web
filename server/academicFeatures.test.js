import assert from 'node:assert/strict';
import test from 'node:test';
import {
  rankTutorCandidates,
  validateAcademicResource,
  validateLearningPath,
  validatePreferredSlots
} from './academicFeatures.js';

test('validates academic resource sources and structured exam metadata', () => {
  const exam = validateAcademicResource({
    id: 'exam-algorithm-2026',
    title: 'Synthetic UTS Algoritma',
    course: 'Algoritma dan Pemrograman',
    semester: '1',
    lecturer: 'Dosen Fixture',
    academic_year: '2026/2027',
    exam_type: 'UTS',
    kind: 'exam',
    url: 'https://example.test/exam.pdf',
    tags: ['fixture', 'algoritma']
  });
  assert.equal(exam.exam_type, 'UTS');
  assert.throws(() => validateAcademicResource({ ...exam, url: 'http://example.test/exam.pdf' }), /HTTPS/);
  assert.throws(() => validateAcademicResource({ ...exam, url: '', file_id: 'missing' }), /PDF resource tidak ditemukan/);
});

test('validates ordered learning milestones and resource dependencies', () => {
  const path = validateLearningPath({
    id: 'path-frontend',
    title: 'Synthetic Front-end Path',
    track: 'Front-End',
    summary: 'Fixture learning path',
    estimated_hours: 24,
    milestones: [
      { id: 'html', title: 'HTML', resource_ids: ['html-resource'] },
      { id: 'css', title: 'CSS', resource_ids: ['css-resource'], prerequisite_ids: ['html'] }
    ]
  }, new Set(['html-resource', 'css-resource']));

  assert.deepEqual(path.milestones.map(({ order }) => order), [1, 2]);
  assert.deepEqual(path.milestones[1].prerequisite_ids, ['html']);
  assert.throws(() => validateLearningPath({
    id: 'path-invalid', title: 'Invalid', track: 'DevOps', milestones: [
      { id: 'first', title: 'First', resource_ids: ['missing'], prerequisite_ids: ['later'] }
    ]
  }), /resource yang tidak ditemukan/);
});

test('validates structured student time preferences', () => {
  assert.deepEqual(validatePreferredSlots([
    { date: '2026-10-12', start: '15:00', end: '16:00', mode: 'online' }
  ]), [{ date: '2026-10-12', start: '15:00', end: '16:00', mode: 'online' }]);
  assert.throws(() => validatePreferredSlots([
    { date: '2026-10-12', start: '16:00', end: '15:00', mode: 'online' }
  ]), /setelah waktu mulai/);
});

test('ranks tutor skill and time matches while excluding conflicting sessions', () => {
  const request = {
    course: 'Struktur Data',
    topic: 'Graph traversal',
    request_message: 'Bantuan algoritma graph',
    preferred_slots: [{ date: '2026-10-05', start: '15:00', end: '16:00', mode: 'online' }]
  };
  const tutors = [
    {
      account_id: 'tutor-matched', name: 'Tutor Matched', expertise: ['Graph Algorithms'],
      availability: [{ dayOfWeek: 1, start: '14:00', end: '17:00', mode: 'online' }]
    },
    {
      account_id: 'tutor-conflict', name: 'Tutor Conflict', expertise: ['Graph Algorithms'],
      availability: [{ dayOfWeek: 1, start: '14:00', end: '17:00', mode: 'online' }]
    },
    {
      account_id: 'tutor-time-only', name: 'Tutor Time Only', expertise: ['UI Design'],
      availability: [{ dayOfWeek: 1, start: '14:00', end: '17:00', mode: 'online' }]
    },
    {
      account_id: 'tutor-mode-mismatch', name: 'Tutor Mode Mismatch', expertise: ['Graph Algorithms'],
      availability: [{ dayOfWeek: 1, start: '14:00', end: '17:00', mode: 'offline' }]
    }
  ];
  const ranked = rankTutorCandidates(request, tutors, [{
    tutor_account_id: 'tutor-conflict',
    status: 'Dijadwalkan',
    session_at: '2026-10-05T08:30:00.000Z',
    duration_minutes: 60
  }]);

  assert.equal(ranked[0].account_id, 'tutor-matched');
  assert.deepEqual(ranked[0].matched_skills, ['Graph Algorithms']);
  assert.equal(ranked[0].matching_slots.length, 1);
  assert.equal(ranked.find(({ account_id }) => account_id === 'tutor-conflict').matching_slots.length, 0);
  assert.equal(ranked.find(({ account_id }) => account_id === 'tutor-mode-mismatch').matching_slots.length, 0);
  assert.ok(ranked[0].match_score > ranked.find(({ account_id }) => account_id === 'tutor-time-only').match_score);
});