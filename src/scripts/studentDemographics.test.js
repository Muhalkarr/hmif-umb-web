import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStudentDemographicsCsv, renderCustomFieldInput, renderStudentDemographics } from './studentDemographics.js';

test('aggregate CSV contains report metadata and only aggregate rows', () => {
    const csv = buildStudentDemographicsCsv({
        source: 'Akun terdaftar',
        generatedAt: '2026-11-14T10:00:00.000Z',
        totalAccounts: 8,
        minimumCellSize: 5,
        byGeneration: [{ label: '2024', count: 8 }],
        byDivision: [{ label: 'Litbang', count: 8 }],
        byMembershipStage: [{ label: 'Anggota', count: 8 }],
        byClearance: [{ label: 'Level 1', count: 8 }],
        profileCompleteness: [{ label: 'Terisi', count: 8 }]
    });

    assert.ok(csv.startsWith('\uFEFF'));
    assert.match(csv, /2026-11-14T10:00:00\.000Z/);
    assert.match(csv, /"Angkatan","2024","8"/);
    assert.match(csv, /"Clearance","Level 1","8"/);
    assert.doesNotMatch(csv, /<table|Informasi akun/);
});

test('aggregate CSV neutralizes spreadsheet formula prefixes in category labels', () => {
    const csv = buildStudentDemographicsCsv({
        totalAccounts: 5,
        byDivision: [{ label: '=HYPERLINK("https://example.test")', count: 5 }]
    });

    assert.match(csv, /"Divisi","'=HYPERLINK\(""https:\/\/example\.test""\)","5"/);
});

test('student dashboard renders real configured columns and no synthetic records', () => {
    const html = renderStudentDemographics({
        totalAccounts: 1,
        minimumCellSize: 5,
        columns: [{ id: 'name', label: 'Nama', type: 'text' }, { id: 'nim', label: 'NIM', type: 'text' }],
        accounts: [{ name: '<Mahasiswa>', nim: 'NIM-1' }]
    });

    assert.match(html, /Informasi akun anggota/);
    assert.match(html, /data-student-demographics-table-toggle aria-expanded="false"/);
    assert.match(html, /id="student-demographics-account-table"[^>]*hidden/);
    assert.match(html, /&lt;Mahasiswa&gt;/);
    assert.doesNotMatch(html, /DATA DEMO|DEMO-\d|mock UI|synthetic/i);
});

test('custom profile controls escape labels and preserve typed selections', () => {
    const select = renderCustomFieldInput({
        id: 'field-track',
        label: '<Peminatan>',
        type: 'multi_select',
        options: ['Backend', 'Web']
    }, ['Web']);

    assert.match(select, /&lt;Peminatan&gt;/);
    assert.match(select, /value="Web" selected/);
    assert.doesNotMatch(select, /<Peminatan>/);
});
