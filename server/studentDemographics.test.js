import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildStudentAccountTable,
    DEFAULT_STUDENT_DEMOGRAPHIC_SETTINGS,
    summarizeStudentAccounts,
    validateStudentDemographicSettings,
    validateStudentDemographicValues
} from './studentDemographics.js';

const member = (index, overrides = {}) => ({
    account_id: `account-${index}`,
    nim: `nim-${index}`,
    name: `Mahasiswa ${index}`,
    email: `student-${index}@example.test`,
    role: 'member',
    clearance_level: 1,
    generation: '2024',
    division: 'Litbang',
    membership_stage: 'Anggota',
    ...overrides
});

test('student summary aggregates registered accounts without returning personal identifiers', () => {
    const summary = summarizeStudentAccounts([
        ...Array.from({ length: 5 }, (_, index) => member(index)),
        member(6, { clearance_level: 2, generation: '2025', division: 'Kominfo', membership_stage: 'Kader' }),
        { ...member('admin'), role: 'superadmin' }
    ]);

    assert.equal(summary.totalAccounts, 6);
    assert.deepEqual(summary.byGeneration, [
        { label: '2024', count: 5 },
        { label: 'Disembunyikan (<5)', count: 1 }
    ]);
    assert.deepEqual(summary.byClearance, [
        { label: 'Disembunyikan (<5)', count: 1 },
        { label: 'Level 1', count: 5 }
    ]);
    assert.deepEqual(summary.profileCompleteness, [{ label: 'Terisi', count: 6 }]);
    assert.deepEqual(summary.byDivision, [
        { label: 'Disembunyikan (<5)', count: 1 },
        { label: 'Litbang', count: 5 }
    ]);
    assert.doesNotMatch(JSON.stringify(summary), /Mahasiswa 0|nim-0|student-0@example\.test|account-0/);
});

test('empty or missing account input produces zeroed aggregate dimensions', () => {
    const summary = summarizeStudentAccounts(undefined);
    assert.equal(summary.totalAccounts, 0);
    assert.deepEqual(summary.byGeneration, []);
    assert.deepEqual(summary.byDivision, []);
    assert.deepEqual(summary.byMembershipStage, []);
    assert.deepEqual(summary.byClearance, []);
    assert.deepEqual(summary.profileCompleteness, []);
});

test('account table returns only configured columns and excludes superadmin accounts', () => {
    const user = member(1);
    const table = buildStudentAccountTable([
        user,
        { ...member('admin'), role: 'superadmin' }
    ], {
        visibleColumns: ['name', 'nim'],
        customColumns: [{ id: 'field-track', label: 'Peminatan', type: 'text', options: [], visible: true }]
    }, {
        [user.account_id]: { 'field-track': 'Backend' }
    });

    assert.deepEqual(table.columns.map(({ id }) => id), ['name', 'nim', 'field-track']);
    assert.deepEqual(table.accounts, [{ name: 'Mahasiswa 1', nim: 'nim-1', 'field-track': 'Backend' }]);
});

test('validates configurable custom-column definitions and typed values', () => {
    const settings = validateStudentDemographicSettings({
        visibleColumns: ['name', 'nim'],
        customColumns: [{
            id: 'field-stage',
            label: 'Tahap',
            type: 'single_select',
            options: ['Awal', 'Lanjut'],
            visible: true
        }, {
            id: 'field-active',
            label: 'Aktif',
            type: 'boolean',
            options: [],
            visible: false
        }]
    });
    assert.equal(settings.error, undefined);
    assert.deepEqual(validateStudentDemographicValues({
        'field-stage': 'Lanjut',
        'field-active': false
    }, settings.settings.customColumns), {
        values: { 'field-stage': 'Lanjut', 'field-active': false }
    });
    assert.match(validateStudentDemographicSettings({
        visibleColumns: ['password_hash'],
        customColumns: []
    }).error, /kolom akun standar/i);
    assert.match(validateStudentDemographicValues({
        'field-stage': 'Tidak tersedia'
    }, settings.settings.customColumns).error, /tipe datanya/i);
});

test('default account table columns match the fields authorized for display', () => {
    assert.deepEqual(DEFAULT_STUDENT_DEMOGRAPHIC_SETTINGS.visibleColumns, [
        'name', 'nim', 'email', 'generation', 'division', 'membership_stage',
        'clearance_level', 'role_title', 'code_name', 'created_at'
    ]);
});
