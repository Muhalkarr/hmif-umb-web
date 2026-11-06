import assert from 'node:assert/strict';
import test from 'node:test';
import { HMIF_DATA } from '../src/scripts/data.js';
import { configReferencesAsset, migrateLegacyBphRoleIds, validateSiteConfig, withSiteDefaults } from './siteSchema.js';

test('migrates legacy BPH titles to stable seat IDs once', () => {
    const config = withSiteDefaults({});
    config.content.data.operators = [
        { id: 'legacy-one', departmentId: 'bph', role: 'Ketua Himpunan (Kahim)' },
        { id: 'legacy-two', departmentId: 'bph', role: 'Wakil Ketua Himpunan' },
        { id: 'legacy-three', departmentId: 'bph', role: 'Sekretaris Umum' },
        { id: 'legacy-four', departmentId: 'bph', role: 'Bendahara Umum' }
    ];

    const migrated = migrateLegacyBphRoleIds(config);
    assert.deepEqual(migrated.content.data.operators.map((operator) => operator.bphRoleId), [
        'kahim', 'wakahim', 'sekum', 'bendum'
    ]);
    migrated.content.data.operators[0].role = 'Ketua Organisasi';
    assert.equal(migrateLegacyBphRoleIds(migrated).content.data.operators[0].bphRoleId, 'kahim');
});

test('provides default title and description for every configurable page', () => {
    const config = withSiteDefaults({});
    const pageIds = config.pages.map(({ id }) => id).filter((id) => id !== 'dashboard');
    for (const pageId of pageIds) {
        assert.equal(typeof config.content.sectionTitles[pageId], 'string', `${pageId} title`);
        assert.equal(typeof config.content.sectionDescriptions[pageId], 'string', `${pageId} description`);
    }
    assert.equal(config.content.sectionTitles.inventory, 'INVENTARIS & PEMINJAMAN ASET');
});

test('validates stable BPH seat IDs and rejects duplicate holders', () => {
    const config = withSiteDefaults({});
    assert.deepEqual(
        config.content.data.operators.filter((operator) => operator.bphRoleId).map((operator) => operator.bphRoleId).sort(),
        ['bendum', 'kahim', 'sekum', 'wakahim']
    );

    const duplicateSeat = structuredClone(config);
    duplicateSeat.content.data.operators.push({
        ...duplicateSeat.content.data.operators.find((operator) => operator.bphRoleId === 'kahim'),
        id: 'duplicate-kahim'
    });
    assert.throws(() => validateSiteConfig(duplicateSeat), /Setiap jabatan BPH hanya boleh memiliki satu pemegang/);

    const invalidSeat = structuredClone(config);
    invalidSeat.content.data.operators[0].bphRoleId = 'custom-seat';
    assert.throws(() => validateSiteConfig(invalidSeat), /ID jabatan BPH tidak valid/);
});

test('normalizes legacy departments with editable nested divisions', () => {
    const config = withSiteDefaults({});
    const department = config.content.data.departments[0];
    delete department.divisions;

    const normalized = validateSiteConfig(config);
    const divisions = normalized.content.data.departments[0].divisions;
    assert.deepEqual(divisions.map(({ name }) => name), ['Divisi 1', 'Divisi 2']);
    assert.notEqual(divisions[0].id, divisions[1].id);
    assert.ok(normalized.content.data.departments.every(({ divisions: items }) => items.length === 2));
    assert.equal(normalized.content.data.operators[0].division, config.content.data.operators[0].division);

    const flexible = structuredClone(config);
    flexible.content.data.departments[0].divisions = [];
    flexible.content.data.departments[1].divisions.push({
        id: 'extra-division', code: 'EXTRA', name: 'Divisi Tambahan', description: '', order: 3
    });
    const flexibleResult = validateSiteConfig(flexible);
    assert.equal(flexibleResult.content.data.departments[0].divisions.length, 0);
    assert.equal(flexibleResult.content.data.departments[1].divisions.length, 3);
});

test('validates unique organization division IDs and operator assignments', () => {
    const config = withSiteDefaults({});
    const department = config.content.data.departments[0];
    const operator = config.content.data.operators.find((item) => item.departmentId === department.id);
    operator.divisionId = department.divisions[0].id;
    assert.equal(validateSiteConfig(config).content.data.operators.find((item) => item.id === operator.id).divisionId, department.divisions[0].id);

    const duplicateDivision = structuredClone(config);
    duplicateDivision.content.data.departments[1].divisions[0].id = duplicateDivision.content.data.departments[0].divisions[0].id;
    assert.throws(() => validateSiteConfig(duplicateDivision), /ID divisi harus unik/);

    const wrongDepartment = structuredClone(config);
    wrongDepartment.content.data.operators.find((item) => item.id === operator.id).divisionId = wrongDepartment.content.data.departments[1].divisions[0].id;
    assert.throws(() => validateSiteConfig(wrongDepartment), /ID divisi pengurus .* tidak ditemukan/);
});

test('preserves editable department responsibilities and supplies them to legacy records', () => {
    const config = withSiteDefaults({});
    const department = config.content.data.departments[0];
    department.responsibilities = ['Menguji prototipe teknologi.', 'Menjaga dokumentasi proyek.'];
    assert.deepEqual(validateSiteConfig(config).content.data.departments[0].responsibilities, department.responsibilities);

    const legacy = structuredClone(config);
    delete legacy.content.data.departments[0].responsibilities;
    assert.deepEqual(
        validateSiteConfig(legacy).content.data.departments[0].responsibilities,
        HMIF_DATA.departments[0].responsibilities
    );
});

test('validates curated knowledge resources and rejects unsafe links', () => {
    const config = withSiteDefaults({});
    const normalized = validateSiteConfig(config);
    assert.equal(normalized.content.data.knowledgeResources.length, HMIF_DATA.knowledgeResources.length);
    assert.equal(normalized.content.data.knowledgeResources[0].lecturer, '');
    assert.equal(normalized.content.data.knowledgeResources[0].academicYear, '');
    assert.equal(normalized.content.data.knowledgeResources[0].examType, '');

    const examMetadata = structuredClone(config);
    Object.assign(examMetadata.content.data.knowledgeResources[0], {
        lecturer: 'Dosen Informatika',
        academicYear: '2026/2027',
        examType: 'UTS'
    });
    const normalizedExam = validateSiteConfig(examMetadata);
    assert.equal(normalizedExam.content.data.knowledgeResources[0].lecturer, 'Dosen Informatika');
    assert.equal(normalizedExam.content.data.knowledgeResources[0].academicYear, '2026/2027');
    assert.equal(normalizedExam.content.data.knowledgeResources[0].examType, 'UTS');

    const invalidExamType = structuredClone(examMetadata);
    invalidExamType.content.data.knowledgeResources[0].examType = 'Midterm';
    assert.throws(() => validateSiteConfig(invalidExamType), /jenis evaluasi tidak valid/);

    const unsafeLink = structuredClone(config);
    unsafeLink.content.data.knowledgeResources[0].url = 'javascript:alert(1)';
    assert.throws(() => validateSiteConfig(unsafeLink), /URL HTTPS/);

    const duplicateId = structuredClone(config);
    duplicateId.content.data.knowledgeResources[1].id = duplicateId.content.data.knowledgeResources[0].id;
    assert.throws(() => validateSiteConfig(duplicateId), /ID referensi akademik harus unik/);

    const pdfResource = structuredClone(config);
    const pdfId = '11111111-1111-4111-8111-111111111111';
    pdfResource.content.data.knowledgeResources[0].url = '';
    pdfResource.content.data.knowledgeResources[0].fileId = pdfId;
    assert.throws(() => validateSiteConfig(pdfResource), /PDF akademik yang terdaftar/);
    const validatedPdf = validateSiteConfig(pdfResource, (id, kind) => id === pdfId && kind === 'knowledge');
    assert.equal(validatedPdf.content.data.knowledgeResources[0].fileId, pdfId);

    const ambiguousSource = structuredClone(pdfResource);
    ambiguousSource.content.data.knowledgeResources[0].url = 'https://example.com/resource';
    assert.throws(() => validateSiteConfig(ambiguousSource, () => true), /tepat satu sumber/);

    const faq = structuredClone(config);
    faq.content.data.knowledgeResources.push({
        id: 'faq-krs', title: 'Bagaimana cara menyiapkan KRS?', course: 'KRS', semester: 'Semua',
        kind: 'faq', summary: 'Panduan KRS yang telah ditinjau oleh pengelola.\n'.repeat(100), url: '', fileId: '', tags: ['KRS'], published: true
    });
    assert.equal(validateSiteConfig(faq).content.data.knowledgeResources.at(-1).kind, 'faq');
    faq.content.data.knowledgeResources.at(-1).summary = '';
    assert.throws(() => validateSiteConfig(faq), /jawaban FAQ wajib diisi/);
});

test('validates cohort operator references without inferring identity from NIM', () => {
    const config = withSiteDefaults({});
    const operator = config.content.data.operators[0];
    const generation = config.content.data.generations[0];
    const leader = generation.leadership.ketua;
    const coordinator = generation.divisions[0];

    leader.operatorId = operator.id;
    leader.nim = 'unrelated-nim';
    coordinator.coordinatorOperatorId = operator.id;

    const normalized = validateSiteConfig(config);
    const normalizedGeneration = normalized.content.data.generations[0];
    assert.equal(normalizedGeneration.leadership.ketua.operatorId, operator.id);
    assert.equal(normalizedGeneration.leadership.ketua.nim, 'unrelated-nim');
    assert.equal(normalizedGeneration.divisions[0].coordinatorOperatorId, operator.id);

    const danglingConfig = structuredClone(config);
    danglingConfig.content.data.generations[0].leadership.ketua.operatorId = 'missing-operator';
    assert.throws(() => validateSiteConfig(danglingConfig), /ID operator ketua Angkatan/);

    const danglingCoordinatorConfig = structuredClone(config);
    danglingCoordinatorConfig.content.data.generations[0].divisions[0].coordinatorOperatorId = 'missing-operator';
    assert.throws(() => validateSiteConfig(danglingCoordinatorConfig), /ID operator koordinator/);
});

test('preserves legacy cohort members and validates structured personnel profiles', () => {
    const config = withSiteDefaults({});
    const division = config.content.data.generations[0].divisions[0];
    division.coordinatorAvatar = '/assets/silhouette_female.jpg';
    division.members = [
        'Legacy Name',
        { id: 'person-1', name: 'New Member', nim: '24040101', avatar: '/assets/silhouette_male.jpg', operatorId: '' }
    ];

    const normalized = validateSiteConfig(config);
    const normalizedDivision = normalized.content.data.generations[0].divisions[0];
    assert.equal(normalizedDivision.members[0], 'Legacy Name');
    assert.deepEqual(normalizedDivision.members[1], {
        id: 'person-1',
        name: 'New Member',
        nim: '24040101',
        avatar: '/assets/silhouette_male.jpg',
        operatorId: ''
    });
    assert.equal(normalizedDivision.coordinatorAvatar, '/assets/silhouette_female.jpg');

    const danglingMemberLink = structuredClone(config);
    danglingMemberLink.content.data.generations[0].divisions[0].members[1].operatorId = 'missing-operator';
    assert.throws(() => validateSiteConfig(danglingMemberLink), /ID operator anggota/);
});

test('protects coordinator and personnel photos from asset deletion', () => {
    const config = withSiteDefaults({});
    const imageUrl = '/api/site/assets/11111111-1111-4111-8111-111111111111/file';
    const division = config.content.data.generations[0].divisions[0];
    division.coordinatorAvatar = imageUrl;
    assert.equal(configReferencesAsset(config, '11111111-1111-4111-8111-111111111111'), true);

    division.coordinatorAvatar = '';
    division.members = [{ id: 'member-photo', name: 'Photo Member', nim: '', avatar: imageUrl, operatorId: '' }];
    assert.equal(configReferencesAsset(config, '11111111-1111-4111-8111-111111111111'), true);
});

test('validates term-based organization structures with flexible units and appointments', () => {
    const config = withSiteDefaults({});
    config.content.data.organizationStructure = {
        people: [
            { id: 'person-a', name: 'Synthetic Person A', isPublic: true, nim: 'private-a' },
            { id: 'person-b', name: 'Synthetic Person B', isPublic: true },
            { id: 'person-c', name: 'Synthetic Person C', isPublic: false }
        ],
        terms: [{
            id: 'term-synthetic',
            name: 'Synthetic Organization Term',
            startDate: '2026-01-01',
            endDate: null,
            status: 'active',
            units: [
                { id: 'unit-root', parentUnitId: null, name: 'Executive Unit', code: 'EX', order: 1 },
                { id: 'unit-child', parentUnitId: 'unit-root', name: 'Research Unit', code: 'RES', order: 1 },
                { id: 'unit-nested', parentUnitId: 'unit-child', name: 'Applied Lab', code: 'LAB', order: 1 }
            ],
            positions: [
                { id: 'position-cochair', unitId: 'unit-root', title: 'Co-Chair', maxOccupants: 2, required: true, order: 1 },
                { id: 'position-secretary', unitId: 'unit-child', title: 'Secretary', maxOccupants: 1, required: true, order: 1 },
                { id: 'position-vacant', unitId: 'unit-nested', title: 'Lab Coordinator', maxOccupants: 1, required: false, order: 1 }
            ],
            assignments: [
                { id: 'assignment-chair-a', personId: 'person-a', positionId: 'position-cochair', startDate: '2026-01-01', endDate: null, kind: 'substantive' },
                { id: 'assignment-chair-b', personId: 'person-b', positionId: 'position-cochair', startDate: '2026-01-01', endDate: null, kind: 'substantive' },
                { id: 'assignment-acting-secretary', personId: 'person-a', positionId: 'position-secretary', startDate: '2026-02-01', endDate: null, kind: 'acting' }
            ]
        }]
    };

    const normalized = validateSiteConfig(config).content.data.organizationStructure;
    assert.equal(normalized.terms[0].units[2].parentUnitId, 'unit-child');
    assert.equal(normalized.terms[0].positions.find(({ id }) => id === 'position-cochair').maxOccupants, 2);
    assert.equal(normalized.terms[0].assignments.find(({ id }) => id === 'assignment-acting-secretary').kind, 'acting');
    assert.equal(normalized.terms[0].assignments.some(({ positionId }) => positionId === 'position-vacant'), false);
    assert.equal(Object.hasOwn(normalized.people[0], 'nim'), false);
    assert.equal(normalized.people[2].isPublic, false);
});

test('rejects invalid organization assignment references and overfilled positions', () => {
    const config = withSiteDefaults({});
    config.content.data.organizationStructure = {
        people: [{ id: 'person-a', name: 'Synthetic Person A' }],
        terms: [{
            id: 'term-synthetic',
            name: 'Synthetic Organization Term',
            startDate: '2026-01-01',
            endDate: '2026-12-31',
            status: 'active',
            units: [{ id: 'unit-root', parentUnitId: null, name: 'Executive Unit' }],
            positions: [{ id: 'position-chair', unitId: 'unit-root', title: 'Chair', maxOccupants: 1, required: true }],
            assignments: [{
                id: 'assignment-chair', personId: 'person-a', positionId: 'position-chair',
                startDate: '2026-01-01', endDate: null, kind: 'substantive'
            }]
        }]
    };

    const danglingPerson = structuredClone(config);
    danglingPerson.content.data.organizationStructure.terms[0].assignments[0].personId = 'missing-person';
    assert.throws(() => validateSiteConfig(danglingPerson), /ID person penugasan/);

    const overfilled = structuredClone(config);
    overfilled.content.data.organizationStructure.people.push({ id: 'person-b', name: 'Synthetic Person B' });
    overfilled.content.data.organizationStructure.terms[0].assignments.push({
        id: 'assignment-chair-b', personId: 'person-b', positionId: 'position-chair',
        startDate: '2026-03-01', endDate: null, kind: 'acting'
    });
    assert.throws(() => validateSiteConfig(overfilled), /melebihi kapasitas/);

    const cyclicUnits = structuredClone(config);
    cyclicUnits.content.data.organizationStructure.terms[0].units[0].parentUnitId = 'unit-root';
    assert.throws(() => validateSiteConfig(cyclicUnits), /siklus hierarki/);
});