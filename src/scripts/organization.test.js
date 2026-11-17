import assert from 'node:assert/strict';
import test from 'node:test';
import { renderOrganizationStructure } from './organization.js';

const structure = {
  people: [
    { id: 'person-public', name: 'Public <Member>', isPublic: true },
    { id: 'person-private', name: 'Private Member', isPublic: false },
    { id: 'person-ordinary', name: 'Ordinary Member', isPublic: true }
  ],
  terms: [{
    id: 'term-active',
    name: 'Periode Aktif',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    status: 'active',
    units: [
      { id: 'unit-root', parentUnitId: null, name: 'Majelis', code: 'MUBES', description: '' },
      { id: 'unit-child', parentUnitId: 'unit-root', name: 'Unit Turunan', code: '', description: '' }
    ],
    positions: [
      { id: 'position-public', unitId: 'unit-root', title: 'Anggota', order: 0 },
      { id: 'position-private', unitId: 'unit-child', title: 'Sekretaris', order: 0 }
    ],
    assignments: [
      { id: 'assignment-public', positionId: 'position-public', personId: 'person-public', startDate: '2026-01-01', endDate: null, kind: 'substantive' },
      { id: 'assignment-private', positionId: 'position-private', personId: 'person-private', startDate: '2026-01-01', endDate: null, kind: 'acting' }
    ]
  }]
};

test('renders a public active-period organization chart without exposing private names', () => {
  const html = renderOrganizationStructure(structure, '2026-06-01');

  assert.match(html, /Periode Aktif/);
  assert.match(html, /Majelis/);
  assert.match(html, /Unit Turunan/);
  assert.match(html, /Public &lt;Member&gt;/);
  assert.match(html, /Anggota \/ personel tanpa jabatan aktif/i);
  assert.match(html, /Ordinary Member/);
  assert.match(html, /Pemegang tidak ditampilkan/);
  assert.doesNotMatch(html, /Private Member/);
});

test('marks positions without a current appointment and skips non-active periods', () => {
  const vacant = structuredClone(structure);
  vacant.terms[0].assignments = [];
  assert.match(renderOrganizationStructure(vacant, '2026-06-01'), /Belum ada penugasan aktif/);

  vacant.terms[0].status = 'archived';
  assert.equal(renderOrganizationStructure(vacant, '2026-06-01'), '');
});

test('renders a public ordinary-member directory without requiring office assignments', () => {
  const memberOnly = {
    people: [{ id: 'member-only', name: 'Regular Member', isPublic: true }],
    terms: [{
      id: 'term-members', name: 'Membership Term', startDate: '2026-01-01',
      endDate: null, status: 'active', units: [], positions: [], assignments: []
    }]
  };
  assert.match(renderOrganizationStructure(memberOnly, '2026-06-01'), /Regular Member/);
  assert.match(renderOrganizationStructure(memberOnly, '2026-06-01'), /Tanpa jabatan aktif/i);
});
