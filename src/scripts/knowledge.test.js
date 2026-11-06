import assert from 'node:assert/strict';
import test from 'node:test';
import { filterKnowledgeResources, getKnowledgeLecturers } from './knowledge.js';

const resources = [
  {
    title: 'UTS Algoritma',
    course: 'Algoritma & Pemrograman',
    semester: '1',
    lecturer: 'Dr. Aulia',
    kind: 'exam',
    tags: ['algoritma']
  },
  {
    title: 'Modul Python',
    course: 'Algoritma & Pemrograman',
    semester: '1',
    lecturer: 'Dr. Aulia',
    kind: 'module',
    tags: ['python']
  },
  {
    title: 'Dasar Web',
    course: 'Pemrograman Web',
    semester: '3',
    lecturer: 'Dosen B',
    kind: 'module',
    tags: ['html']
  },
  {
    title: 'Panduan Umum',
    course: 'Umum',
    semester: 'Semua',
    kind: 'reference',
    tags: []
  }
];

test('lists distinct named lecturers in stable alphabetical order', () => {
  assert.deepEqual(getKnowledgeLecturers(resources), ['Dosen B', 'Dr. Aulia']);
});

test('filters by lecturer and composes with course, semester, type, and search', () => {
  assert.deepEqual(
    filterKnowledgeResources(resources, {
      lecturer: 'dr. aulia',
      course: 'Algoritma & Pemrograman',
      semester: '1',
      kind: 'exam',
      query: 'algoritma'
    }).map(({ title }) => title),
    ['UTS Algoritma']
  );
});

test('does not include resources without lecturer metadata in a lecturer filter', () => {
  assert.deepEqual(
    filterKnowledgeResources(resources, { lecturer: 'Dr. Aulia' }).map(({ title }) => title),
    ['UTS Algoritma', 'Modul Python']
  );
  assert.equal(filterKnowledgeResources(resources).length, resources.length);
});
