import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'hmif-api-test-'));
const adminPassword = 'test-admin-password-never-use-in-production';
const memberPassword = 'test-member-password-123';
const origin = 'http://localhost:5173';

process.env.NODE_ENV = 'development';
process.env.PORT = '0';
process.env.JWT_SECRET = randomBytes(48).toString('base64url');
process.env.FRONTEND_ORIGINS = origin;
process.env.ALLOW_PUBLIC_REGISTRATION = 'false';
process.env.INITIAL_ADMIN_NIM = 'test-admin';
process.env.INITIAL_ADMIN_PASSWORD = adminPassword;
process.env.DATABASE_FILE = path.join(temporaryDirectory, 'database.json');
process.env.ASSET_STORAGE_DIR = path.join(temporaryDirectory, 'assets');

const { server } = await import('./index.js');
const { db, getHmifCalendarDate } = await import('./db.js');
if (!server.listening) await once(server, 'listening');
const baseUrl = `http://127.0.0.1:${server.address().port}`;

test('event calendar dates are calculated in Asia/Jakarta', () => {
    assert.equal(getHmifCalendarDate(new Date('2026-10-04T16:59:59.999Z')), '2026-10-04');
    assert.equal(getHmifCalendarDate(new Date('2026-10-04T17:00:00.000Z')), '2026-10-05');
});

const request = (endpoint, { method = 'GET', cookie, body, requestOrigin = origin } = {}) => {
    const headers = {};
    if (requestOrigin) headers.Origin = requestOrigin;
    if (cookie) headers.Cookie = cookie;
    if (body) headers['Content-Type'] = 'application/json';
    return fetch(`${baseUrl}${endpoint}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
    });
};

const upload = async (cookie, filename, mimeType, bytes) => {
    const form = new FormData();
    form.append('asset', new Blob([bytes], { type: mimeType }), filename);
    return fetch(`${baseUrl}/api/site/assets`, {
        method: 'POST',
        headers: { Origin: origin, Cookie: cookie },
        body: form
    });
};

const uploadKnowledgeFile = async (cookie, filename, mimeType, bytes) => {
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: mimeType }), filename);
    return fetch(`${baseUrl}/api/knowledge/files`, {
        method: 'POST',
        headers: { Origin: origin, Cookie: cookie },
        body: form
    });
};

const uploadReceipt = async (cookie, fields, filename, mimeType, bytes) => {
        const form = new FormData();
        Object.entries(fields).forEach(([key, value]) => form.append(key, String(value)));
        form.append('receipt', new Blob([bytes], { type: mimeType }), filename);
        return fetch(`${baseUrl}/api/ledger`, {
                method: 'POST',
                headers: { Origin: origin, Cookie: cookie },
                body: form
        });
};

const uploadSoundtrack = async (cookie, title, filename, mimeType, bytes) => {
    const form = new FormData();
    form.append('title', title);
    form.append('audio', new Blob([bytes], { type: mimeType }), filename);
    return fetch(`${baseUrl}/api/admin/soundtracks/upload`, {
        method: 'POST',
        headers: { Origin: origin, Cookie: cookie },
        body: form
    });
};

const uploadAvatar = async (cookie, filename, mimeType, bytes) => {
    const form = new FormData();
    form.append('avatar', new Blob([bytes], { type: mimeType }), filename);
    return fetch(`${baseUrl}/api/auth/profile/avatar`, {
        method: 'POST',
        headers: { Origin: origin, Cookie: cookie },
        body: form
    });
};

const login = async (nim, password) => {
    const response = await request('/api/auth/login', { method: 'POST', body: { nim, password } });
    const payload = await response.json();
    return {
        response,
        payload,
        cookie: response.headers.get('set-cookie')?.split(';')[0]
    };
};

test('session, clearance, CSRF, and secret-backed seed protections', async () => {
    try {
        const legacyDatabaseState = db.read();
        const legacyAdminNim = legacyDatabaseState.users[0].nim;
        delete legacyDatabaseState.users[0].account_id;
        legacyDatabaseState.cadet_evaluations.push({ id: 'legacy-eval', nim: legacyAdminNim, score: 77 });
        legacyDatabaseState.attendance_records.push({
            id: 'legacy-attendance', event_id: 'legacy-event', nim: legacyAdminNim, name: 'Administrator HMIF',
            division: 'BPH', scanned_at: new Date().toISOString(), created_at: new Date().toISOString()
        });
        db.write(legacyDatabaseState);
        db.migrateTransactionalTables();
        db.migratePermanentAccountIds();
        const migratedAdmin = db.findUserByNIM(legacyAdminNim);
        assert.match(migratedAdmin.account_id, /^[a-f0-9-]{36}$/);
        assert.ok(db.getCadetEvaluationsByAccountId(migratedAdmin.account_id).some((record) => record.id === 'legacy-eval'));
        assert.ok(db.getCadetAttendanceByAccountId(migratedAdmin.account_id).some((record) => record.id === 'legacy-attendance'));

        assert.equal((await request('/api/admin/users')).status, 401);
        assert.equal((await request('/api/admin/backup')).status, 401);
        assert.equal((await request('/api/ledger')).status, 401);
        assert.equal((await request('/api/auth/profile', { method: 'PUT', body: { name: 'Unauthorized' } })).status, 401);
        const publicProker = await request('/api/proker');
        assert.equal(publicProker.status, 200);
        const publicPrograms = await publicProker.json();
        assert.equal(Object.hasOwn(publicPrograms[0], 'budget_allocated'), false);
        assert.equal(Object.hasOwn(publicPrograms[0], 'lpj_notes'), false);

        assert.equal((await request('/api/auth/login', {
            method: 'POST',
            requestOrigin: 'https://untrusted.example',
            body: { nim: 'test-admin', password: adminPassword }
        })).status, 403);

        const adminLogin = await login('test-admin', adminPassword);
        assert.equal(adminLogin.response.status, 200);
        assert.equal(adminLogin.payload.user.role, 'superadmin');
        assert.equal(adminLogin.payload.user.clearance_level, 0);
        assert.equal(Object.hasOwn(adminLogin.payload, 'token'), false);
        assert.match(adminLogin.response.headers.get('set-cookie'), /HttpOnly/i);
        assert.match(adminLogin.response.headers.get('set-cookie'), /SameSite=Strict/i);
        const adminUsers = await request('/api/admin/users', { cookie: adminLogin.cookie });
        assert.equal(adminUsers.status, 200);
        assert.equal((await adminUsers.text()).includes('password_hash'), false);

        const initialSite = await request('/api/site/config');
        assert.equal(initialSite.status, 200);
        const initialSiteBody = await initialSite.json();
        assert.equal(typeof initialSiteBody.config.content.data.identity.name, 'string');
        assert.ok(Array.isArray(initialSiteBody.config.content.data.departments));
        assert.ok(initialSiteBody.config.content.data.departments.length > 0);
        assert.ok(initialSiteBody.config.content.data.departments.some((d) => d.code === 'LITBANG'));
        assert.ok(Array.isArray(initialSiteBody.config.content.data.operators));
        assert.ok(initialSiteBody.config.content.data.operators.some((op) => op.roleLevel === 'sekdep'));
        assert.ok(initialSiteBody.config.content.data.operators.some((op) => op.roleLevel === 'kadep'));
        assert.ok(Array.isArray(initialSiteBody.config.content.data.generations));
        assert.ok(initialSiteBody.config.content.data.generations.some((g) => g.year === '2024'));
        assert.ok(initialSiteBody.config.content.data.generations.find((g) => g.year === '2024')?.leadership?.ketua);
        assert.ok(initialSiteBody.config.content.data.operators.every((operator) => !Object.hasOwn(operator, 'nim')));
        const publicGeneration = initialSiteBody.config.content.data.generations.find((generation) => generation.year === '2024');
        assert.ok(Object.values(publicGeneration.leadership).every((leader) => !Object.hasOwn(leader, 'nim') && !Object.hasOwn(leader, 'accountId')));
        assert.ok(publicGeneration.divisions.every((division) => !Object.hasOwn(division, 'coordinatorNim')
            && !Object.hasOwn(division, 'coordinatorAccountId')
            && division.members.every((member) => typeof member === 'string' || (!Object.hasOwn(member, 'nim') && !Object.hasOwn(member, 'accountId')))));
        const initialAdminPreviewResponse = await request('/api/site/config?preview=draft', { cookie: adminLogin.cookie });
        assert.equal(initialAdminPreviewResponse.status, 200);
        const initialAdminPreview = await initialAdminPreviewResponse.json();
        assert.ok(initialAdminPreview.config.content.data.operators.every((operator) => typeof operator.nim === 'string'));
        assert.equal(Object.hasOwn(initialAdminPreview.config.content.data.generations.find((generation) => generation.year === '2024').leadership.ketua, 'nim'), true);
        assert.equal((await request('/api/site/config?preview=draft')).status, 401);
        assert.equal((await request('/api/site/assets')).status, 401);
        assert.equal((await request('/api/knowledge/files')).status, 401);
        assert.equal((await request('/api/admin/audit')).status, 401);
        assert.equal((await request('/api/admin/soundtracks')).status, 401);
        assert.equal((await request('/api/soundtracks')).status, 200);

        for (const type of ['beasiswa', 'kompetisi']) {
            const deadlineResponse = await request('/api/calendar', {
                method: 'POST',
                cookie: adminLogin.cookie,
                body: {
                    date_str: '2030-12-15',
                    title: `Deadline ${type}`,
                    type,
                    division: 'Akademik',
                    registration_url: `https://example.org/${type}`
                }
            });
            assert.equal(deadlineResponse.status, 201);
            const deadline = (await deadlineResponse.json()).event;
            assert.equal(deadline.type, type);
            assert.equal(deadline.registration_url, `https://example.org/${type}`);
            assert.ok((await (await request('/api/calendar')).json()).some(({ id }) => id === deadline.id));
        }
        assert.equal((await request('/api/calendar', {
            method: 'POST',
            cookie: adminLogin.cookie,
            body: {
                date_str: '2030-12-15',
                title: 'Unsafe scholarship link',
                type: 'beasiswa',
                division: 'Akademik',
                registration_url: 'http://example.org/scholarship'
            }
        })).status, 400);

        const rejectedAsset = await upload(adminLogin.cookie, 'fake.png', 'image/png', Buffer.from('<svg/onload=alert(1)>'));
        assert.equal(rejectedAsset.status, 400);
        const png = Buffer.alloc(45);
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0);
        png.writeUInt32BE(13, 8);
        png.write('IHDR', 12, 'ascii');
        png.writeUInt32BE(1, 16);
        png.writeUInt32BE(1, 20);
        png.writeUInt32BE(0, 33);
        png.write('IEND', 37, 'ascii');
        const uploadedAssetResponse = await upload(adminLogin.cookie, 'site-bg.png', 'image/png', png);
        assert.equal(uploadedAssetResponse.status, 201);
        const uploadedAsset = (await uploadedAssetResponse.json()).asset;
        assert.equal((await request('/api/site/assets', { cookie: adminLogin.cookie })).status, 200);
        const rejectedAudio = await uploadSoundtrack(adminLogin.cookie, 'Audio tidak valid', 'fake.mp3', 'audio/mpeg', Buffer.from('ID3HMIF test audio'));
        assert.equal(rejectedAudio.status, 400);
        const mp3Bytes = Buffer.alloc(24);
        mp3Bytes.write('ID3', 0, 'ascii');
        mp3Bytes[3] = 4;
        mp3Bytes.set([0xff, 0xfb, 0x90, 0x64], 10);
        const uploadedTrackResponse = await uploadSoundtrack(adminLogin.cookie, 'Tema HMIF', 'tema.mp3', 'audio/mpeg', mp3Bytes);
        assert.equal(uploadedTrackResponse.status, 201);
        const uploadedTrack = (await uploadedTrackResponse.json()).track;
        const publicTracksResponse = await request('/api/soundtracks');
        assert.equal(publicTracksResponse.status, 200);
        assert.equal((await publicTracksResponse.json()).tracks[0].url, `/api/soundtracks/${uploadedTrack.id}/file`);
        const audioFileResponse = await request(`/api/soundtracks/${uploadedTrack.id}/file`);
        assert.equal(audioFileResponse.status, 200);
        assert.equal(audioFileResponse.headers.get('content-type'), 'audio/mpeg');
        const invalidStreamLink = await request('/api/admin/soundtracks', {
            method: 'POST',
            cookie: adminLogin.cookie,
            body: { title: 'Unsafe link', url: 'http://example.com/audio.mp3' }
        });
        assert.equal(invalidStreamLink.status, 400);
        const linkedTrackResponse = await request('/api/admin/soundtracks', {
            method: 'POST',
            cookie: adminLogin.cookie,
            body: { title: 'Stream HMIF', url: 'https://media.example.org/music.mp3' }
        });
        assert.equal(linkedTrackResponse.status, 201);
        const linkedTrack = (await linkedTrackResponse.json()).track;
        const adminTrackList = await request('/api/admin/soundtracks', { cookie: adminLogin.cookie });
        const adminTrackPayload = await adminTrackList.json();
        const reorderedTracks = adminTrackPayload.tracks.map(({ id }) => id).reverse();
        assert.equal((await request('/api/admin/soundtracks/reorder', {
            method: 'POST',
            cookie: adminLogin.cookie,
            body: { track_ids: reorderedTracks }
        })).status, 200);
        const publicTrackOrder = await (await request('/api/soundtracks')).json();
        assert.equal(publicTrackOrder.tracks[0].id, linkedTrack.id);
        assert.equal((await request(`/api/admin/soundtracks/${linkedTrack.id}`, {
            method: 'DELETE',
            cookie: adminLogin.cookie
        })).status, 409);
        const disabledTrack = await request(`/api/admin/soundtracks/${linkedTrack.id}`, {
            method: 'PUT',
            cookie: adminLogin.cookie,
            body: { active: false }
        });
        assert.equal(disabledTrack.status, 200);
        const activeTracksResponse = await request('/api/soundtracks');
        const activeTracksPayload = await activeTracksResponse.json();
        assert.equal(activeTracksPayload.tracks.length, 1);
        assert.equal((await request(`/api/admin/soundtracks/${linkedTrack.id}`, {
            method: 'DELETE',
            cookie: adminLogin.cookie
        })).status, 200);
        assert.equal((await request(`/api/admin/soundtracks/${uploadedTrack.id}`, {
            method: 'PUT',
            cookie: adminLogin.cookie,
            body: { active: false }
        })).status, 200);
        assert.equal((await request(`/api/soundtracks/${uploadedTrack.id}/file`)).status, 404);
        assert.equal((await request('/api/tasks')).status, 401);
        const taskCreateResponse = await request('/api/tasks', {
            method: 'POST',
            cookie: adminLogin.cookie,
            body: {
                title: 'Review modul algoritma',
                description: 'Periksa solusi dan konsistensi materi.',
                pic_name: 'PIC Uji',
                status: 'todo',
                due_date: '2026-10-10',
                proker_id: db.getAllProker()[0].id
            }
        });
        assert.equal(taskCreateResponse.status, 201);
        const task = (await taskCreateResponse.json()).task;
        assert.equal((await request('/api/tasks', { cookie: adminLogin.cookie })).status, 200);
        const taskMoveResponse = await request(`/api/tasks/${task.id}`, {
            method: 'PUT',
            cookie: adminLogin.cookie,
            body: { status: 'review' }
        });
        assert.equal(taskMoveResponse.status, 200);
        assert.equal((await taskMoveResponse.json()).task.status, 'review');
        assert.equal((await request(`/api/tasks/${task.id}`, {
            method: 'PUT',
            cookie: adminLogin.cookie,
            body: { status: 'invalid' }
        })).status, 400);

        const projectResponse = await request('/api/admin/portal-records/project', {
            method: 'POST',
            cookie: adminLogin.cookie,
            body: {
                title: 'Proyek IoT Uji',
                author: 'Tim HMIF',
                category: 'IoT',
                description: 'Prototipe monitoring sensor.',
                repo_url: 'https://github.com/example/iot',
                demo_url: '',
                tags: ['IoT', 'Sensor']
            }
        });
        assert.equal(projectResponse.status, 201);
        const projectRecord = (await projectResponse.json()).record;
        assert.equal((await request('/api/showcase')).status, 200);
        assert.equal(projectRecord.review_status, 'pending_review');
        assert.equal((await (await request('/api/showcase')).json()).projects.some(({ id }) => id === projectRecord.id), false);
        for (const action of ['approve', 'publish']) {
            assert.equal((await request(`/api/admin/portal-records/project/${projectRecord.id}/review`, {
                method: 'PUT', cookie: adminLogin.cookie, body: { action }
            })).status, 200);
        }
        assert.equal((await (await request('/api/showcase')).json()).projects[0].title, 'Proyek IoT Uji');
        assert.equal((await request('/api/admin/portal-records/project', {
            method: 'POST',
            cookie: adminLogin.cookie,
            body: { title: 'Unsafe', author: 'Team', category: 'Web', description: 'Bad link', repo_url: 'javascript:alert(1)', tags: [] }
        })).status, 400);
        const alumniResponse = await request('/api/admin/portal-records/alumni', {
            method: 'POST',
            cookie: adminLogin.cookie,
            body: {
                name: 'Alumni Uji',
                graduation_year: '2022',
                company: 'Perusahaan Contoh',
                position: 'Software Engineer',
                location: 'Tasikmalaya',
                specialization: 'Backend',
                mentorship_available: true,
                profile_url: 'https://example.org/profile',
                consent: true
            }
        });
        assert.equal(alumniResponse.status, 201);
        const alumniRecord = (await alumniResponse.json()).record;
        assert.equal(alumniRecord.review_status, 'pending_review');
        for (const action of ['approve', 'publish']) {
            assert.equal((await request(`/api/admin/portal-records/alumni/${alumniRecord.id}/review`, {
                method: 'PUT', cookie: adminLogin.cookie, body: { action }
            })).status, 200);
        }
        const jobResponse = await request('/api/admin/portal-records/job', {
            method: 'POST',
            cookie: adminLogin.cookie,
            body: {
                title: 'Junior Developer',
                employer: 'Perusahaan Contoh',
                specialization: 'Backend',
                location: 'Remote',
                work_type: 'Magang',
                deadline: '2026-12-31',
                url: 'https://example.org/jobs/1'
            }
        });
        assert.equal(jobResponse.status, 201);
        const jobRecord = (await jobResponse.json()).record;
        for (const action of ['approve', 'publish']) {
            assert.equal((await request(`/api/admin/portal-records/job/${jobRecord.id}/review`, {
                method: 'PUT', cookie: adminLogin.cookie, body: { action }
            })).status, 200);
        }
        const publicCareer = await (await request('/api/career')).json();
        assert.equal(publicCareer.alumni[0].mentorship_available, true);
        assert.equal(publicCareer.opportunities[0].title, 'Junior Developer');
        for (const publicRecord of [...publicCareer.alumni, ...publicCareer.opportunities]) {
            for (const privateField of ['submitter_account_id', 'review_status', 'review_note', 'reviewer_nim', 'consent_at']) {
                assert.equal(Object.hasOwn(publicRecord, privateField), false);
            }
        }
        assert.equal((await request(`/api/admin/portal-records/project/${projectRecord.id}`, {
            method: 'PUT',
            cookie: adminLogin.cookie,
            body: { active: false }
        })).status, 200);
        assert.equal((await (await request('/api/showcase')).json()).projects.length, 0);

        const invalidPdf = await uploadKnowledgeFile(adminLogin.cookie, 'fake.pdf', 'application/pdf', Buffer.from('not a PDF document'));
        assert.equal(invalidPdf.status, 400);
        const validPdfBytes = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
        const uploadedPdfResponse = await uploadKnowledgeFile(adminLogin.cookie, 'module-test.pdf', 'application/pdf', validPdfBytes);
        assert.equal(uploadedPdfResponse.status, 201);
        const uploadedPdf = (await uploadedPdfResponse.json()).file;
        const backupResponse = await request('/api/admin/backup', { cookie: adminLogin.cookie });
        assert.equal(backupResponse.status, 200);
        const backup = await backupResponse.json();
        assert.ok(backup.data.knowledge_files.some((file) => file.id === uploadedPdf.id));
        const backedUpAlumni = backup.data.portal_records.find(({ id }) => id === alumniRecord.id);
        assert.equal(backedUpAlumni.review_status, 'published');
        assert.equal(backedUpAlumni.submitter_account_id, null);
        assert.ok(backedUpAlumni.consent_at);
        assert.ok(backup.data.portal_record_history.some(({ record_id: id, action }) => id === projectRecord.id && action === 'publish'));
        const hiddenPdfResponse = await uploadKnowledgeFile(adminLogin.cookie, 'hidden-module.pdf', 'application/pdf', validPdfBytes);
        assert.equal(hiddenPdfResponse.status, 201);
        const hiddenPdf = (await hiddenPdfResponse.json()).file;
        assert.equal((await request(`/api/knowledge/files/${uploadedPdf.id}`)).status, 404);
        assert.equal((await request(`/api/knowledge/files/${uploadedPdf.id}`, { cookie: adminLogin.cookie })).status, 200);

        const invalidSiteDraft = await request('/api/site/draft', {
            method: 'PUT',
            cookie: adminLogin.cookie,
            body: { config: { ...initialAdminPreview.config, theme: { ...initialAdminPreview.config.theme, colors: { ...initialAdminPreview.config.theme.colors, accent: 'red' } } }, expected_revision_id: initialSiteBody.revision_id }
        });
        assert.equal(invalidSiteDraft.status, 400);

        const draftConfig = structuredClone(initialAdminPreview.config);
        draftConfig.theme.colors.accent = '#22cc88';
        draftConfig.theme.background = {
            mode: 'image',
            image: `/api/site/assets/${uploadedAsset.id}/file`,
            assetId: uploadedAsset.id
        };
        draftConfig.content.data.identity.logo = `/api/site/assets/${uploadedAsset.id}/file`;
        draftConfig.content.heroLead = '<script>this remains text</script>';
        draftConfig.content.data.identity.abbreviation = 'HMIF TEST';
        draftConfig.content.data.knowledgeResources.push({
            id: 'kb-integration-pdf',
            title: 'Integration Test Module',
            course: 'Testing',
            semester: '1',
            kind: 'module',
            summary: 'A test PDF module.',
            url: '',
            fileId: uploadedPdf.id,
            tags: ['test'],
            published: true
        });
        draftConfig.content.data.knowledgeResources.push({
            id: 'kb-hidden-integration-pdf',
            title: 'Unpublished Integration Test Module',
            course: 'Testing',
            semester: '1',
            kind: 'module',
            summary: 'An unpublished test PDF module.',
            url: '',
            fileId: hiddenPdf.id,
            tags: ['test'],
            published: false
        });
        draftConfig.content.data.knowledgeResources.push({
            id: 'kb-exam-integration',
            title: 'Integration Test UTS',
            course: 'Algoritma dan Pemrograman',
            semester: '1',
            lecturer: 'Dosen Test',
            academicYear: '2026/2027',
            examType: 'UTS',
            kind: 'exam',
            summary: 'Bank soal untuk pengujian thread diskusi.',
            url: 'https://example.com/uts-algoritma.pdf',
            fileId: '',
            tags: ['algoritma', 'uts'],
            published: true
        });
        assert.equal((await request(`/api/knowledge/files/${uploadedPdf.id}`)).status, 404);
        assert.equal((await request(`/api/knowledge/files/${uploadedPdf.id}`, { cookie: adminLogin.cookie })).status, 200);
        draftConfig.content.data.operators[0].name = '<img src=x onerror=alert(1)>';
        draftConfig.content.data.operators.push({
            id: 'legacy-operator',
            name: 'Kader Uji Coba',
            codeName: 'TEST-LEGACY',
            role: 'Sekretaris Departemen Riset',
            division: 'Riset',
            rarity: 4,
            operatorClass: 'SPECIALIST',
            avatar: `/api/site/assets/${uploadedAsset.id}/file`,
            nim: '23040999',
            generation: '2023',
            specialty: 'Testing legacy roleLevel inference',
            stats: { leadership: 80, coding: 80, strategy: 80, integrity: 80 },
            quote: 'Testing legacy backward compatibility'
        });
        draftConfig.content.data.departments.push({
            id: 'dept-cyber',
            code: 'CYBER',
            name: 'Departemen Cyber Security',
            description: 'Divisi pengamanan sistem dan audit siber',
            order: 6,
            emblem: '/assets/faction/3.png',
            kadepTitle: 'Ketua Divisi Cyber',
            sekdepTitle: 'Sekretaris Divisi Cyber'
        });
        draftConfig.content.data.operators.push({
            id: 'kadep-cyber',
            departmentId: 'dept-cyber',
            roleLevel: 'kadep',
            name: 'Kadep Cyber Test',
            codeName: 'CYBER-CHIEF',
            role: 'Kepala Departemen Cyber Security',
            division: 'Departemen Cyber Security',
            rarity: 5,
            operatorClass: 'VANGUARD / LEADER',
            avatar: `/api/site/assets/${uploadedAsset.id}/file`,
            nim: '23040888',
            generation: '2023',
            specialty: 'Penetration testing and security audit',
            stats: { leadership: 90, coding: 92, strategy: 88, integrity: 95 },
            quote: 'Security is paramount.'
        });
        draftConfig.content.data.generations.push({
            id: 'gen-2026',
            year: '2026',
            name: 'Cybernetic Battalion',
            tagline: 'NEXT-GEN ARCHITECTURE',
            description: 'Batalion kader rekrutmen terbaru',
            status: 'INDUCTION',
            emblem: '/assets/faction/4.png',
            order: 5,
            socials: {
                instagram: 'https://instagram.com/hmif.2026',
                tiktok: '',
                whatsapp: '',
                linkedin: '',
                github: ''
            },
            leadership: {
                ketua: { title: 'Komandan Angkatan', name: 'Cadet Leader', nim: '26040001', avatar: '' },
                wakil: { title: 'Wakil Komandan', name: 'Cadet Vice', nim: '26040002', avatar: '' },
                sekretaris: { title: 'Sekretaris Angkatan', name: 'Cadet Scribe', nim: '26040003', avatar: '' },
                bendahara: { title: 'Bendahara Angkatan', name: 'Cadet Treasurer', nim: '26040004', avatar: '' }
            },
            divisions: [
                {
                    id: 'div-mikat',
                    name: 'Minat & Bakat',
                    coordinator: 'Coordinator Cadet',
                    coordinatorNim: '26040005',
                    members: ['Cadet Alpha', 'Cadet Beta']
                }
            ]
        });
        draftConfig.content.data.news[0].title = 'Published from a structured CMS collection';
        draftConfig.content.data.doctrine.adArt[0].title = 'Edited document title';
        [draftConfig.pages[0], draftConfig.pages[1]] = [draftConfig.pages[1], draftConfig.pages[0]];
        const savedDraft = await request('/api/site/draft', {
            method: 'PUT',
            cookie: adminLogin.cookie,
            body: { config: draftConfig, expected_revision_id: initialSiteBody.revision_id }
        });
        assert.equal(savedDraft.status, 201);
        const savedDraftBody = await savedDraft.json();
        assert.equal(savedDraftBody.revision.status, 'draft');
        assert.equal((await request('/api/site/draft', {
            method: 'PUT',
            cookie: adminLogin.cookie,
            body: { config: draftConfig, expected_revision_id: initialSiteBody.revision_id }
        })).status, 409);
        assert.equal((await (await request('/api/site/config')).json()).config.theme.colors.accent, initialSiteBody.config.theme.colors.accent);
        const draftPreview = await request('/api/site/config?preview=draft', { cookie: adminLogin.cookie });
        assert.equal(draftPreview.status, 200);
        const previewConfig = (await draftPreview.json()).config;
        assert.equal(previewConfig.content.heroLead, '<script>this remains text</script>');
        assert.equal(previewConfig.content.data.operators[0].name, '<img src=x onerror=alert(1)>');
        const legacyOp = previewConfig.content.data.operators.find((op) => op.id === 'legacy-operator');
        assert.ok(legacyOp);
        assert.equal(legacyOp.nim, '23040999');
        assert.equal(legacyOp.roleLevel, 'sekdep');
        const cyberDept = previewConfig.content.data.departments.find((d) => d.id === 'dept-cyber');
        assert.ok(cyberDept);
        assert.equal(cyberDept.code, 'CYBER');
        assert.equal(cyberDept.emblem, '/assets/faction/3.png');
        assert.equal(cyberDept.kadepTitle, 'Ketua Divisi Cyber');
        assert.equal(cyberDept.sekdepTitle, 'Sekretaris Divisi Cyber');
        const cyberKadep = previewConfig.content.data.operators.find((op) => op.id === 'kadep-cyber');
        assert.ok(cyberKadep);
        assert.equal(cyberKadep.roleLevel, 'kadep');
        assert.equal(cyberKadep.departmentId, 'dept-cyber');
        assert.equal(previewConfig.content.data.news[0].title, 'Published from a structured CMS collection');
        assert.equal(previewConfig.content.data.doctrine.adArt[0].title, 'Edited document title');
        assert.equal(previewConfig.pages[0].id, 'vision');
        const gen2026 = previewConfig.content.data.generations.find((g) => g.id === 'gen-2026');
        assert.ok(gen2026);
        assert.equal(gen2026.year, '2026');
        assert.equal(gen2026.leadership.ketua.title, 'Komandan Angkatan');
        assert.equal(gen2026.divisions.length, 1);
        assert.equal(gen2026.divisions[0].members[0], 'Cadet Alpha');

        const publicRegistration = await request('/api/auth/register', {
            method: 'POST',
            body: { nim: 'test-member', name: 'Test Member', password: memberPassword }
        });
        assert.equal(publicRegistration.status, 403);

        const createdUser = await request('/api/admin/users', {
            method: 'POST',
            cookie: adminLogin.cookie,
            body: { nim: 'test-member', name: 'Test Member', password: memberPassword, generation: '', division: '', clearance_level: 4 }
        });
        assert.equal(createdUser.status, 201);
        const createdUserBody = await createdUser.json();
        assert.equal(createdUserBody.user.role, 'member');
        assert.equal(createdUserBody.user.clearance_level, 1);
        const memberStatsResponse = await request('/api/admin/stats', { cookie: adminLogin.cookie });
        assert.equal(memberStatsResponse.status, 200);
        const memberStats = await memberStatsResponse.json();
        assert.deepEqual(memberStats.users.by_clearance, {
            'Level 1 (Kader)': 1,
            'Level 2 (Pengurus Divisi)': 0,
            'Level 3 (BPH & Kahim)': 0
        });
        assert.deepEqual(memberStats.users.by_role, { superadmin: 1, member: 1 });

        let memberLogin = await login('test-member', memberPassword);
        assert.equal(memberLogin.response.status, 200);
        assert.equal((await request('/api/admin/backup', { cookie: memberLogin.cookie })).status, 403);
        const accountId = createdUserBody.user.account_id;
        assert.match(accountId, /^[a-f0-9-]{36}$/);
        const loginClaims = JSON.parse(Buffer.from(memberLogin.cookie.split('.')[1], 'base64url').toString());
        assert.equal(loginClaims.sub, accountId);
        const legacySession = jwt.sign({ sub: 'test-member', ver: 0 }, process.env.JWT_SECRET);
        const migratedSessionResponse = await request('/api/auth/me', { cookie: `prts_session=${legacySession}` });
        assert.equal((await migratedSessionResponse.json()).user.account_id, accountId);
        const migratedSession = migratedSessionResponse.headers.get('set-cookie')?.split(';')[0];
        assert.equal(JSON.parse(Buffer.from(migratedSession.split('.')[1], 'base64url').toString()).sub, accountId);
        const projectSubmission = await request('/api/portal-records/project', {
            method: 'POST', cookie: memberLogin.cookie,
            body: {
                title: 'Peer-reviewed project',
                author: 'Test Member',
                category: 'Web',
                description: 'A project awaiting editorial review.',
                repo_url: 'https://github.com/example/project',
                demo_url: '',
                tags: ['test']
            }
        });
        assert.equal(projectSubmission.status, 202);
        const submittedProject = (await projectSubmission.json()).record;
        assert.equal(submittedProject.review_status, 'pending_review');
        assert.equal((await (await request('/api/showcase')).json()).projects.some(({ id }) => id === submittedProject.id), false);
        const adminProjectRecord = (await (await request('/api/admin/portal-records/project', { cookie: adminLogin.cookie })).json())
            .records.find(({ id }) => id === submittedProject.id);
        assert.equal(adminProjectRecord.history[0].action, 'submitted');
        const requestRevision = await request(`/api/admin/portal-records/project/${submittedProject.id}/review`, {
            method: 'PUT', cookie: adminLogin.cookie,
            body: { action: 'needs_revision', note: 'Tambahkan penjelasan kontribusi tim.' }
        });
        assert.equal(requestRevision.status, 200);
        assert.equal((await (await request('/api/portal-records/mine', { cookie: memberLogin.cookie })).json()).records[0].review_note, 'Tambahkan penjelasan kontribusi tim.');
        const resubmission = await request(`/api/portal-records/project/${submittedProject.id}`, {
            method: 'PUT', cookie: memberLogin.cookie,
            body: {
                title: 'Peer-reviewed project',
                author: 'Test Member',
                category: 'Web',
                description: 'Updated project awaiting a new review.',
                repo_url: 'https://github.com/example/project',
                demo_url: '',
                tags: ['test', 'revised']
            }
        });
        assert.equal(resubmission.status, 202);
        assert.equal((await resubmission.json()).record.review_status, 'pending_review');
        assert.equal((await request(`/api/admin/portal-records/project/${submittedProject.id}/review`, {
            method: 'PUT', cookie: adminLogin.cookie, body: { action: 'approve' }
        })).status, 200);
        const publishProject = await request(`/api/admin/portal-records/project/${submittedProject.id}/review`, {
            method: 'PUT', cookie: adminLogin.cookie, body: { action: 'publish' }
        });
        assert.equal(publishProject.status, 200);
        assert.ok((await (await request('/api/showcase')).json()).projects.some(({ id }) => id === submittedProject.id));
        const alumniPayload = {
            name: 'Test Alumni',
            graduation_year: '2020',
            company: 'Example Co.',
            position: 'Engineer',
            location: 'Tasikmalaya',
            specialization: 'Backend',
            mentorship_available: true,
            profile_url: 'https://example.com/profile'
        };
        assert.equal((await request('/api/portal-records/alumni', {
            method: 'POST', cookie: memberLogin.cookie, body: alumniPayload
        })).status, 400);
        const alumniSubmission = await request('/api/portal-records/alumni', {
            method: 'POST', cookie: memberLogin.cookie, body: { ...alumniPayload, consent: true }
        });
        assert.equal(alumniSubmission.status, 202);
        const submittedAlumni = (await alumniSubmission.json()).record;
        assert.ok(submittedAlumni.consent_at);
        assert.equal((await (await request('/api/career')).json()).alumni.some(({ id }) => id === submittedAlumni.id), false);
        assert.equal((await request(`/api/admin/portal-records/alumni/${submittedAlumni.id}/review`, {
            method: 'PUT', cookie: adminLogin.cookie, body: { action: 'approve' }
        })).status, 200);
        assert.equal((await request(`/api/admin/portal-records/alumni/${submittedAlumni.id}/review`, {
            method: 'PUT', cookie: adminLogin.cookie, body: { action: 'publish' }
        })).status, 200);
        assert.ok((await (await request('/api/career')).json()).alumni.some(({ id }) => id === submittedAlumni.id));
        assert.equal((await request(`/api/admin/portal-records/project/${submittedProject.id}/review`, {
            method: 'PUT', cookie: adminLogin.cookie, body: { action: 'archive' }
        })).status, 200);
        assert.equal((await (await request('/api/showcase')).json()).projects.some(({ id }) => id === submittedProject.id), false);
        assert.equal((await request('/api/tutoring/requests/mine')).status, 401);
        const tutoringSubmission = await request('/api/tutoring/requests', {
            method: 'POST', cookie: memberLogin.cookie,
            body: {
                course: 'Algoritma dan Pemrograman',
                topic: 'Binary search tree',
                message: 'Saya ingin memahami insert dan traversal.',
                preferred_time: 'Selasa setelah pukul 15.00'
            }
        });
        assert.equal(tutoringSubmission.status, 201);
        const tutoringRequest = (await tutoringSubmission.json()).request;
        assert.equal(tutoringRequest.status, 'Diterima');
        assert.equal(Object.hasOwn(tutoringRequest, 'student_account_id'), false);
        assert.equal((await (await request('/api/tutoring/requests/mine', { cookie: memberLogin.cookie })).json()).requests[0].id, tutoringRequest.id);
        assert.equal((await (await request('/api/tutoring/requests/mine', { cookie: adminLogin.cookie })).json()).requests.length, 0);
        assert.equal((await request('/api/tutoring/requests', { cookie: memberLogin.cookie })).status, 403);
        assert.equal((await request('/api/admin/users', { cookie: memberLogin.cookie })).status, 403);
        assert.equal((await request('/api/site/config?preview=draft', { cookie: memberLogin.cookie })).status, 403);
        assert.equal((await request('/api/site/draft', {
            method: 'PUT',
            cookie: memberLogin.cookie,
            body: { config: draftConfig, expected_revision_id: savedDraftBody.revision.id }
        })).status, 403);

        const numericEscalation = await request('/api/admin/users/test-member', {
            method: 'PUT',
            cookie: adminLogin.cookie,
            body: { clearance_level: 4 }
        });
        assert.equal(numericEscalation.status, 400);

        const roleElevation = await request('/api/admin/users/test-member/role', {
            method: 'PUT',
            cookie: adminLogin.cookie,
            body: { role: 'superadmin' }
        });
        assert.equal(roleElevation.status, 200);
        assert.equal((await roleElevation.json()).user.clearance_level, 0);
        const elevatedStats = await (await request('/api/admin/stats', { cookie: adminLogin.cookie })).json();
        assert.deepEqual(elevatedStats.users.by_role, { superadmin: 2 });
        assert.deepEqual(elevatedStats.users.by_clearance, {
            'Level 1 (Kader)': 0,
            'Level 2 (Pengurus Divisi)': 0,
            'Level 3 (BPH & Kahim)': 0
        });
        const elevatedLogin = await login('test-member', memberPassword);
        assert.equal(elevatedLogin.payload.user.role, 'superadmin');
        assert.equal((await request('/api/admin/users', { cookie: elevatedLogin.cookie })).status, 200);

        const roleDemotion = await request('/api/admin/users/test-member/role', {
            method: 'PUT',
            cookie: adminLogin.cookie,
            body: { role: 'member' }
        });
        assert.equal(roleDemotion.status, 200);
        const elevatedSession = await request('/api/auth/me', { cookie: elevatedLogin.cookie });
        assert.equal((await elevatedSession.json()).authenticated, false);
        memberLogin = await login('test-member', memberPassword);
        assert.equal(memberLogin.payload.user.role, 'member');

        assert.equal((await request('/api/site/publish', { method: 'POST', cookie: adminLogin.cookie, body: {} })).status, 200);
        const publishedSite = await request('/api/site/config');
        const publishedConfig = (await publishedSite.json()).config;
        const publicExamDiscussions = await request('/api/knowledge/resources/kb-exam-integration/discussions');
        assert.equal(publicExamDiscussions.status, 200);
        assert.deepEqual((await publicExamDiscussions.json()).discussions, []);
        assert.equal((await request('/api/knowledge/resources/kb-exam-integration/discussions', {
            method: 'POST', body: { message: 'Guest discussion' }
        })).status, 401);
        assert.equal((await request('/api/admin/knowledge/discussions', { cookie: memberLogin.cookie })).status, 403);
        const submittedDiscussion = await request('/api/knowledge/resources/kb-exam-integration/discussions', {
            method: 'POST', cookie: memberLogin.cookie,
            body: { message: '<script>alert(1)</script> Alternatif algoritma: gunakan binary search.' }
        });
        assert.equal(submittedDiscussion.status, 202);
        const pendingDiscussion = (await submittedDiscussion.json()).discussion;
        assert.equal(pendingDiscussion.status, 'pending');
        assert.equal(Object.hasOwn(pendingDiscussion, 'account_id'), false);
        assert.equal((await (await request('/api/knowledge/resources/kb-exam-integration/discussions')).json()).discussions.length, 0);
        const ownDiscussions = await request('/api/knowledge/resources/kb-exam-integration/discussions', { cookie: memberLogin.cookie });
        assert.equal((await ownDiscussions.json()).discussions[0].status, 'pending');
        const nonExamDiscussion = await request('/api/knowledge/resources/kb-integration-pdf/discussions', {
            method: 'POST', cookie: memberLogin.cookie,
            body: { message: 'This is not an exam resource.' }
        });
        assert.equal(nonExamDiscussion.status, 404);
        const moderationPromotion = await request('/api/admin/users/test-member', {
            method: 'PUT', cookie: adminLogin.cookie, body: { clearance_level: 2 }
        });
        assert.equal(moderationPromotion.status, 200);
        const taskAssigneesResponse = await request('/api/task-assignees', { cookie: memberLogin.cookie });
        assert.equal(taskAssigneesResponse.status, 200);
        assert.ok((await taskAssigneesResponse.json()).users.some(({ account_id }) => account_id === accountId));
        const taskResponse = await request('/api/tasks', {
            method: 'POST', cookie: memberLogin.cookie,
            body: {
                title: 'Account-linked task test',
                description: 'Validate accountable task assignment.',
                pic_account_id: accountId,
                due_date: '2030-02-01'
            }
        });
        assert.equal(taskResponse.status, 201);
        const createdTask = (await taskResponse.json()).task;
        assert.equal(createdTask.pic_account_id, accountId);
        const changedTask = await request(`/api/tasks/${createdTask.id}`, {
            method: 'PUT', cookie: memberLogin.cookie, body: { status: 'in_progress' }
        });
        assert.equal(changedTask.status, 200);
        const listedTask = (await (await request('/api/tasks', { cookie: memberLogin.cookie })).json()).tasks
            .find(({ id }) => id === createdTask.id);
        assert.equal(listedTask.pic_name, 'Test Member');
        assert.equal(listedTask.status_history[0].old_status, 'todo');
        assert.equal(listedTask.status_history[0].new_status, 'in_progress');
        assert.equal((await request('/api/tasks', {
            method: 'POST', cookie: memberLogin.cookie,
            body: { title: 'Invalid PIC account', description: '', pic_account_id: 'missing-account', pic_name: 'Unlinked PIC' }
        })).status, 400);
        assert.equal((await (await request('/api/tutoring/profile/mine', { cookie: memberLogin.cookie })).json()).profile, null);
        assert.equal((await request('/api/tutoring/profile/mine')).status, 401);
        const tutorProfileUpdate = await request('/api/tutoring/profile/mine', {
            method: 'PUT', cookie: memberLogin.cookie,
            body: {
                expertise: ['Binary Search', 'Struktur Data'],
                availability: [{ dayOfWeek: 2, start: '10:00', end: '11:00', mode: 'online' }],
                bio: 'Tutor algoritma dan struktur data.',
                active: true
            }
        });
        assert.equal(tutorProfileUpdate.status, 200);
        const tutorList = await request('/api/tutoring/tutors', { cookie: memberLogin.cookie });
        assert.equal(tutorList.status, 200);
        const testTutor = (await tutorList.json()).tutors.find(({ account_id: id }) => id === accountId);
        assert.ok(testTutor);
        assert.equal(Object.hasOwn(testTutor, 'nim'), false);
        assert.deepEqual(testTutor.expertise, ['Binary Search', 'Struktur Data']);
        const suggestedRequests = await request('/api/tutoring/requests', { cookie: memberLogin.cookie });
        const suggestedRequest = (await suggestedRequests.json()).requests.find(({ id }) => id === tutoringRequest.id);
        assert.ok(suggestedRequest.suggested_tutors.some(({ account_id: id, matched_skills: skills }) => id === accountId && skills.includes('Binary Search')));
        const outsideTutorAvailability = await request(`/api/tutoring/requests/${tutoringRequest.id}/schedule`, {
            method: 'PUT', cookie: memberLogin.cookie,
            body: {
                tutor_account_id: accountId,
                session_at: '2030-01-01T05:30:00.000Z',
                mode: 'online', meeting_url: 'https://meet.google.com/abc-defg-hij'
            }
        });
        assert.equal(outsideTutorAvailability.status, 409);
        const invalidTutoringSchedule = await request(`/api/tutoring/requests/${tutoringRequest.id}/schedule`, {
            method: 'PUT', cookie: memberLogin.cookie,
            body: {
                tutor_account_id: accountId,
                session_at: '2030-01-01T03:30:00.000Z',
                mode: 'online', meeting_url: 'http://meet.example.com'
            }
        });
        assert.equal(invalidTutoringSchedule.status, 400);
        const scheduledTutoring = await request(`/api/tutoring/requests/${tutoringRequest.id}/schedule`, {
            method: 'PUT', cookie: memberLogin.cookie,
            body: {
                tutor_account_id: accountId,
                session_at: '2030-01-01T03:30:00.000Z',
                mode: 'online', meeting_url: 'https://meet.google.com/abc-defg-hij',
                admin_note: 'Silakan siapkan contoh kode.'
            }
        });
        assert.equal(scheduledTutoring.status, 200);
        const privateTutoringSchedule = (await (await request('/api/tutoring/requests/mine', { cookie: memberLogin.cookie })).json()).requests[0];
        assert.equal(privateTutoringSchedule.status, 'Dijadwalkan');
        assert.equal(privateTutoringSchedule.meeting_url, 'https://meet.google.com/abc-defg-hij');
        assert.ok((await request('/api/admin/backup', { cookie: adminLogin.cookie })).status === 200);
        const completedTutoring = await request(`/api/tutoring/requests/${tutoringRequest.id}/status`, {
            method: 'PUT', cookie: memberLogin.cookie, body: { status: 'Selesai' }
        });
        assert.equal((await completedTutoring.json()).request.status, 'Selesai');
        const backupWithTutoring = await (await request('/api/admin/backup', { cookie: adminLogin.cookie })).json();
        assert.ok(backupWithTutoring.data.tutoring_requests.some(({ id }) => id === tutoringRequest.id));
        const backedUpSubmission = backupWithTutoring.data.portal_records.find(({ id }) => id === submittedAlumni.id);
        assert.equal(backedUpSubmission.submitter_account_id, accountId);
        assert.equal(backedUpSubmission.consent_at, submittedAlumni.consent_at);
        assert.ok(backupWithTutoring.data.portal_record_history.some(({ record_id: id, action }) => id === submittedAlumni.id && action === 'publish'));
        assert.ok(backupWithTutoring.data.organization_task_history.some(({ task_id: id, new_status: status }) => id === createdTask.id && status === 'in_progress'));
        const pendingQueue = await request('/api/admin/knowledge/discussions', { cookie: memberLogin.cookie });
        assert.equal(pendingQueue.status, 200);
        assert.equal((await pendingQueue.json()).discussions[0].id, pendingDiscussion.id);
        const moderatedDiscussion = await request(`/api/admin/knowledge/discussions/${pendingDiscussion.id}/moderation`, {
            method: 'PUT', cookie: memberLogin.cookie,
            body: { status: 'published' }
        });
        assert.equal(moderatedDiscussion.status, 200);
        assert.equal((await moderatedDiscussion.json()).discussion.status, 'published');
        const publishedDiscussions = await request('/api/knowledge/resources/kb-exam-integration/discussions');
        assert.equal(publishedDiscussions.status, 200);
        const publishedDiscussionBody = await publishedDiscussions.json();
        assert.equal(publishedDiscussionBody.discussions.length, 1);
        const visibleDiscussion = publishedDiscussionBody.discussions[0];
        assert.equal(visibleDiscussion.id, pendingDiscussion.id);
        assert.equal(Object.hasOwn(visibleDiscussion, 'account_id'), false);
        const backupWithDiscussion = await (await request('/api/admin/backup', { cookie: adminLogin.cookie })).json();
        assert.ok(backupWithDiscussion.data.knowledge_discussions.some(({ id }) => id === pendingDiscussion.id));
        const publishedPdfResponse = await request(`/api/knowledge/files/${uploadedPdf.id}`);
        assert.equal(publishedPdfResponse.status, 200);
        assert.equal(publishedPdfResponse.headers.get('content-type'), 'application/pdf');
        assert.match(publishedPdfResponse.headers.get('content-disposition'), /attachment/);
        assert.equal((await request(`/api/knowledge/files/${hiddenPdf.id}`)).status, 404);
        assert.equal((await request(`/api/knowledge/files/${uploadedPdf.id}`, { method: 'DELETE', cookie: adminLogin.cookie })).status, 409);
        assert.equal(publishedConfig.theme.colors.accent, '#22cc88');
        assert.equal(publishedConfig.theme.background.image, `/api/site/assets/${uploadedAsset.id}/file`);
        assert.equal(publishedConfig.content.data.identity.logo, `/api/site/assets/${uploadedAsset.id}/file`);
        assert.equal(publishedConfig.content.data.identity.abbreviation, 'HMIF TEST');
        assert.equal(publishedConfig.content.data.operators[0].name, '<img src=x onerror=alert(1)>');
        assert.equal((await request(uploadedAsset.url)).status, 200);
        assert.equal((await request(`/api/site/assets/${uploadedAsset.id}`, { method: 'DELETE', cookie: adminLogin.cookie })).status, 409);
        const restored = await request(`/api/site/revisions/${initialSiteBody.revision_id}/restore`, {
            method: 'POST',
            cookie: adminLogin.cookie,
            body: { expected_revision_id: savedDraftBody.revision.id }
        });
        assert.equal(restored.status, 201);
        const restoredConfig = (await (await request('/api/site/config?preview=draft', { cookie: adminLogin.cookie })).json()).config;
        assert.equal(restoredConfig.theme.colors.accent, initialSiteBody.config.theme.colors.accent);
        assert.equal(restoredConfig.content.data.identity.abbreviation, initialSiteBody.config.content.data.identity.abbreviation);
        assert.equal((await request('/api/site/publish', { method: 'POST', cookie: adminLogin.cookie, body: {} })).status, 200);
        assert.equal((await request(`/api/site/assets/${uploadedAsset.id}`, { method: 'DELETE', cookie: adminLogin.cookie })).status, 409);
        const audit = await request('/api/admin/audit', { cookie: adminLogin.cookie });
        assert.equal(audit.status, 200);
        const auditActions = (await audit.json()).entries.map((entry) => entry.action);
        assert.ok(auditActions.includes('site.publish'));
        assert.ok(auditActions.includes('site.restore_draft'));
        assert.ok(auditActions.includes('asset.upload'));
        assert.ok(auditActions.includes('user.role_change'));

        const promotion = await request('/api/admin/users/test-member', {
            method: 'PUT',
            cookie: adminLogin.cookie,
            body: { clearance_level: 3 }
        });
        assert.equal(promotion.status, 200);
        assert.equal((await request('/api/aspirations', { cookie: memberLogin.cookie })).status, 200);

        const createdProker = await request('/api/proker', {
            method: 'POST',
            cookie: memberLogin.cookie,
            body: {
                title: 'API integration test',
                division: 'Test',
                category: 'QA',
                status: 'upcoming',
                date_start: '2026-12-01',
                date_end: '2026-12-02',
                budget_allocated: 1000
            }
        });
        assert.equal(createdProker.status, 201);
        const proker = (await createdProker.json()).proker;
        const updatedProker = await request(`/api/proker/${proker.id}`, {
            method: 'PUT',
            cookie: memberLogin.cookie,
            body: { title: 'Updated API test', id: 'tampered', budget_spent: 999999 }
        });
        const updatedProkerBody = await updatedProker.json();
        assert.equal(updatedProker.status, 200);
        assert.equal(updatedProkerBody.proker.id, proker.id);
        assert.notEqual(updatedProkerBody.proker.budget_spent, 999999);
        assert.equal((await request('/api/proker', {
            method: 'POST',
            cookie: memberLogin.cookie,
            body: { title: 'Bad date', division: 'Test', date_start: 'not-a-date' }
        })).status, 400);

        const calendar = await request('/api/calendar', {
            method: 'POST',
            cookie: memberLogin.cookie,
            body: { date_str: getHmifCalendarDate(), title: 'API test event', division: 'Test', registration_open: true, capacity: 1 }
        });
        assert.equal(calendar.status, 201);
        const eventId = (await calendar.json()).event.id;
        const eventRegistration = await request(`/api/events/${eventId}/register`, {
            method: 'POST',
            body: { name: 'Guest Participant', email: 'guest@example.com' }
        });
        assert.equal(eventRegistration.status, 201);
        const eventRegistrationBody = await eventRegistration.json();
        const ticket = eventRegistrationBody.ticket;
        assert.match(ticket.token, /^[A-Za-z0-9_-]{40,50}$/);
        assert.equal(eventRegistrationBody.delivery.email_sent, false);
        const storedTicket = db.sqlite.prepare('SELECT ticket_token_hash, ticket_token_encrypted FROM event_registrations WHERE id = ?').get(ticket.id);
        assert.notEqual(storedTicket.ticket_token_hash, ticket.token);
        assert.notEqual(storedTicket.ticket_token_encrypted, ticket.token);
        const eventRegistrationPayload = await (async () => {
            const response = await request('/api/calendar', {
                method: 'POST', cookie: memberLogin.cookie,
                body: { date_str: getHmifCalendarDate(), title: 'Member ticket dashboard event', division: 'Test', registration_open: true, capacity: 2 }
            });
            assert.equal(response.status, 201);
            return response.json();
        })();
        const memberTicketEvent = eventRegistrationPayload.event;
        const memberTicketResponse = await request(`/api/events/${memberTicketEvent.id}/register`, {
            method: 'POST', cookie: memberLogin.cookie, body: {}
        });
        assert.equal(memberTicketResponse.status, 201);
        const memberTicketPayload = await memberTicketResponse.json();
        assert.equal(memberTicketPayload.delivery.dashboard_available, true);
        assert.equal(memberTicketPayload.delivery.email_sent, false);
        const memberTicketsResponse = await request('/api/events/tickets/mine', { cookie: memberLogin.cookie });
        assert.equal(memberTicketsResponse.status, 200);
        const dashboardTicket = (await memberTicketsResponse.json()).tickets.find(({ id }) => id === memberTicketPayload.ticket.id);
        assert.equal(dashboardTicket.token, memberTicketPayload.ticket.token);
        assert.equal(Object.hasOwn(dashboardTicket, 'email'), false);
        assert.equal(Object.hasOwn(dashboardTicket, 'ticket_token_encrypted'), false);
        assert.equal((await request(`/api/events/${eventId}/register`, {
            method: 'POST',
            body: { name: 'Duplicate Participant', email: 'GUEST@example.com' }
        })).status, 409);
        assert.equal((await request(`/api/events/${eventId}/register`, {
            method: 'POST',
            body: { name: 'Second Participant', email: 'second@example.com' }
        })).status, 409);
        assert.equal((await request(`/api/events/${eventId}/check-in`, {
            method: 'POST',
            body: { ticket_id: ticket.id, ticket_token: ticket.token }
        })).status, 401);
        assert.equal((await request(`/api/events/${eventId}/check-in`, {
            method: 'POST',
            cookie: memberLogin.cookie,
            body: { ticket_id: ticket.id, ticket_token: `${ticket.token}wrong` }
        })).status, 404);
        const certificatesBeforeCheckIn = await request(`/api/events/${eventId}/certificates/issue`, {
            method: 'POST', cookie: memberLogin.cookie, body: {}
        });
        assert.equal((await certificatesBeforeCheckIn.json()).issued, 0);

        const futureEvent = await request('/api/calendar', {
            method: 'POST',
            cookie: memberLogin.cookie,
            body: {
                date_str: getHmifCalendarDate(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)),
                title: 'Future test event',
                division: 'Test',
                registration_open: true,
                capacity: 1
            }
        });
        assert.equal(futureEvent.status, 201);
        const futureEventId = (await futureEvent.json()).event.id;
        const futureRegistration = await request(`/api/events/${futureEventId}/register`, {
            method: 'POST',
            body: { name: 'Future Participant', email: 'future@example.com' }
        });
        assert.equal(futureRegistration.status, 201);
        const futureTicket = (await futureRegistration.json()).ticket;
        const futureCheckIn = await request(`/api/events/${futureEventId}/check-in`, {
            method: 'POST',
            cookie: memberLogin.cookie,
            body: { ticket_id: futureTicket.id, ticket_token: futureTicket.token }
        });
        assert.equal(futureCheckIn.status, 409);
        assert.match((await futureCheckIn.json()).error, /tanggal event/);
        assert.equal((await request(`/api/events/${futureEventId}/check-in`, {
            method: 'POST',
            cookie: memberLogin.cookie,
            body: { ticket_id: ticket.id, ticket_token: ticket.token }
        })).status, 404);

        const checkIn = await request(`/api/events/${eventId}/check-in`, {
            method: 'POST', cookie: memberLogin.cookie,
            body: { ticket_id: ticket.id, ticket_token: ticket.token }
        });
        assert.equal(checkIn.status, 200);
        const committeeAccount = db.findUserByNIM('test-admin');
        const committeeAttendance = db.recordAttendance({
            account_id: committeeAccount.account_id,
            event_id: eventId,
            nim: committeeAccount.nim,
            name: committeeAccount.name,
            division: 'Panitia',
            scanned_at: new Date().toISOString()
        });
        assert.equal(committeeAttendance.event_id, eventId);
        const certificates = await request(`/api/events/${eventId}/certificates/issue`, {
            method: 'POST', cookie: memberLogin.cookie, body: {}
        });
        const issuedCertificates = await certificates.json();
        assert.equal(issuedCertificates.issued, 2);
        assert.equal((await request(`/api/events/${eventId}/check-in`, {
            method: 'POST',
            cookie: memberLogin.cookie,
            body: { ticket_id: ticket.id, ticket_token: ticket.token }
        })).status, 404);
        assert.equal((await (await request(`/api/events/${eventId}/certificates/issue`, {
            method: 'POST', cookie: memberLogin.cookie, body: {}
        })).json()).issued, 0);
        const verification = await request(`/api/certificates/${issuedCertificates.certificate_ids[0]}`);
        assert.equal(verification.status, 200);
        const verifiedCertificate = (await verification.json()).certificate;
        assert.equal(verifiedCertificate.participant_name, 'Guest Participant');
        assert.equal(Object.hasOwn(verifiedCertificate, 'email'), false);
        const committeeCertificate = await request(`/api/certificates/${issuedCertificates.certificate_ids[1]}`);
        assert.equal((await committeeCertificate.json()).certificate.recipient_type, 'Panitia/Anggota');
        assert.equal((await request('/api/certificates/not-a-certificate')).status, 404);
        const eventBackup = await (await request('/api/admin/backup', { cookie: adminLogin.cookie })).json();
        assert.ok(eventBackup.data.event_registrations.some(({ id }) => id === ticket.id));
        assert.equal(Object.hasOwn(eventBackup.data.event_registrations.find(({ id }) => id === ticket.id), 'ticket_token_encrypted'), false);
        assert.ok(eventBackup.data.event_certificates.some(({ id }) => id === issuedCertificates.certificate_ids[0]));
        assert.ok(eventBackup.data.attendance_certificates.some(({ id }) => id === issuedCertificates.certificate_ids[1]));

        const aspiration = await request('/api/aspirations', {
            method: 'POST',
            body: { sender: 'Spoofed public name', is_anonymous: true, category: 'Integration', message: 'A test aspiration' }
        });
        assert.equal(aspiration.status, 201);
        const aspirationPayload = await aspiration.json();
        const aspirationId = aspirationPayload.aspiration.id;
        assert.equal(aspirationPayload.aspiration.sender_nim_or_anon, 'Anonim (Mahasiswa)');
        assert.match(aspirationPayload.ticket.trackingToken, /^[A-Za-z0-9_-]{40,50}$/);
        assert.equal(Object.hasOwn(aspirationPayload.aspiration, 'tracking_token_hash'), false);
        const encryptedAspiration = db.sqlite.prepare('SELECT message FROM aspirations WHERE id = ?').get(aspirationId).message;
        assert.match(encryptedAspiration, /^enc:v1:/);
        assert.notEqual(encryptedAspiration, 'A test aspiration');
        const aspirationInbox = await request('/api/aspirations', { cookie: adminLogin.cookie });
        assert.equal(aspirationInbox.status, 200);
        assert.equal((await aspirationInbox.json()).find(({ id }) => id === aspirationId).message, 'A test aspiration');
        const missingNonAnonymousName = await request('/api/aspirations', {
            method: 'POST', body: { is_anonymous: false, category: 'Umum', message: 'Tanpa identitas.' }
        });
        assert.equal(missingNonAnonymousName.status, 400);
        const nonAnonymousAspiration = await request('/api/aspirations', {
            method: 'POST', cookie: memberLogin.cookie,
            body: { sender: 'Nama palsu', is_anonymous: false, category: 'Kurikulum', message: 'Mohon kejelasan jadwal.' }
        });
        assert.equal(nonAnonymousAspiration.status, 201);
        assert.equal((await nonAnonymousAspiration.json()).aspiration.sender_nim_or_anon, `${db.findUserByNIM('test-member').name} (test-member)`);
        const invalidTracking = await request(`/api/aspirations/${aspirationId}/track`, {
            method: 'POST',
            body: { tracking_token: 'invalid-tracking-token-which-is-long-enough' }
        });
        assert.equal(invalidTracking.status, 404);
        const validTracking = await request(`/api/aspirations/${aspirationId}/track`, {
            method: 'POST',
            body: { tracking_token: aspirationPayload.ticket.trackingToken }
        });
        assert.equal(validTracking.status, 200);
        assert.equal((await validTracking.json()).aspiration.status, 'Diterima');
        const responseToAspiration = await request(`/api/aspirations/${aspirationId}/respond`, {
            method: 'PUT',
            cookie: memberLogin.cookie,
            body: { response: 'Reviewed by test', status: 'Dalam Investigasi' }
        });
        assert.equal(responseToAspiration.status, 200);
        assert.equal(Object.hasOwn((await responseToAspiration.json()).aspiration, 'tracking_token_hash'), false);
        const updatedTracking = await request(`/api/aspirations/${aspirationId}/track`, {
            method: 'POST',
            body: { tracking_token: aspirationPayload.ticket.trackingToken }
        });
        assert.equal(updatedTracking.status, 200);
        assert.equal((await updatedTracking.json()).aspiration.bph_response, 'Reviewed by test');

        const health = await request('/api/health');
        assert.equal(health.status, 200);
        assert.equal((await health.json()).status, 'online');

        const transaction = await request('/api/ledger', {
            method: 'POST',
            cookie: memberLogin.cookie,
            body: { type: 'INCOME', amount: 1000, description: 'API test transaction' }
        });
        assert.equal(transaction.status, 201);
        const missingReceipt = await request('/api/ledger', {
            method: 'POST',
            cookie: adminLogin.cookie,
            body: { type: 'EXPENSE', amount: 5000, description: 'Expense without proof' }
        });
        assert.equal(missingReceipt.status, 400);
        const receiptUpload = await uploadReceipt(adminLogin.cookie, {
            type: 'EXPENSE', amount: 5000, description: 'Office supply purchase', division: 'BPH'
        }, 'receipt.pdf', 'application/pdf', Buffer.from('%PDF-1.4\nreceipt evidence'));
        assert.equal(receiptUpload.status, 201);
        const expenseTransaction = (await receiptUpload.json()).transaction;
        assert.equal(expenseTransaction.receipt.file_name, 'receipt.pdf');
        assert.equal(expenseTransaction.receipt.mime_type, 'application/pdf');
        const receiptDownload = await request(`/api/ledger/receipts/${expenseTransaction.receipt.id}`, { cookie: adminLogin.cookie });
        assert.equal(receiptDownload.status, 200);
        assert.match(receiptDownload.headers.get('content-type'), /application\/pdf/);
        assert.equal((await request(`/api/ledger/receipts/${expenseTransaction.receipt.id}`)).status, 401);
        const spoofedReceipt = await uploadReceipt(adminLogin.cookie, {
            type: 'EXPENSE', amount: 5000, description: 'Spoofed evidence', division: 'BPH'
        }, 'receipt.pdf', 'application/pdf', Buffer.from('not a PDF'));
        assert.equal(spoofedReceipt.status, 400);

        const attendanceSessionResponse = await request('/api/attendance/sessions', {
            method: 'POST',
            cookie: adminLogin.cookie,
            body: {
                event_id: eventId,
                latitude: -6.2,
                longitude: 106.8,
                radius_m: 100,
                duration_minutes: 30
            }
        });
        assert.equal(attendanceSessionResponse.status, 201);
        const attendanceSession = await attendanceSessionResponse.json();
        const qrPayload = {
            session_id: attendanceSession.session.id,
            session_token: attendanceSession.token
        };
        const outsideGeofence = await request('/api/attendance', {
            method: 'POST',
            cookie: memberLogin.cookie,
            body: {
                event_id: eventId,
                ...qrPayload,
                latitude: -6.3,
                longitude: 106.8,
                accuracy_m: 5
            }
        });
        assert.equal(outsideGeofence.status, 403);
        const attendance = await request('/api/attendance', {
            method: 'POST',
            cookie: memberLogin.cookie,
            body: {
                event_id: eventId,
                ...qrPayload,
                latitude: -6.2,
                longitude: 106.8,
                accuracy_m: 5
            }
        });
        assert.equal(attendance.status, 201);
        const attendanceDup = await request('/api/attendance', {
            method: 'POST',
            cookie: memberLogin.cookie,
            body: {
                event_id: eventId,
                ...qrPayload,
                latitude: -6.2,
                longitude: 106.8,
                accuracy_m: 5
            }
        });
        assert.equal(attendanceDup.status, 409);
        const attendanceList = await request(`/api/attendance/${eventId}`, { cookie: adminLogin.cookie });
        assert.equal(attendanceList.status, 200);
        assert.equal((await attendanceList.json()).total, 2);

        const assetResponse = await request('/api/admin/inventory/assets', {
            method: 'POST',
            cookie: adminLogin.cookie,
            body: { asset_tag: 'TEST-PROJ-01', name: 'Projector Test', category: 'Elektronik', location: 'Sekretariat' }
        });
        assert.equal(assetResponse.status, 201);
        const asset = (await assetResponse.json()).asset;
        const loanResponse = await request('/api/inventory/loans', {
            method: 'POST',
            cookie: memberLogin.cookie,
            body: {
                asset_id: asset.id,
                purpose: 'Presentasi program kerja internal',
                due_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
            }
        });
        assert.equal(loanResponse.status, 201);
        const loanId = (await loanResponse.json()).loan.id;
        assert.equal((await request(`/api/admin/inventory/loans/${loanId}/status`, {
            method: 'PUT', cookie: adminLogin.cookie, body: { status: 'Disetujui' }
        })).status, 200);
        assert.equal((await request(`/api/admin/inventory/loans/${loanId}/status`, {
            method: 'PUT', cookie: adminLogin.cookie, body: { status: 'Dipinjam' }
        })).status, 200);
        assert.equal((await request(`/api/admin/inventory/loans/${loanId}/status`, {
            method: 'PUT', cookie: adminLogin.cookie, body: { status: 'Dikembalikan' }
        })).status, 400);
        const loanReturn = await request(`/api/admin/inventory/loans/${loanId}/status`, {
            method: 'PUT', cookie: adminLogin.cookie,
            body: { status: 'Dikembalikan', condition_note: 'Diperiksa, unit kembali lengkap dan berfungsi.' }
        });
        assert.equal(loanReturn.status, 200);
        const loanList = await request('/api/admin/inventory/loans', { cookie: adminLogin.cookie });
        const loanRecord = (await loanList.json()).loans.find((loan) => loan.id === loanId);
        assert.equal(loanRecord.status, 'Dikembalikan');
        assert.equal(loanRecord.history.length, 4);
        assert.equal(loanRecord.history.at(-1).note, 'Diperiksa, unit kembali lengkap dan berfungsi.');

        const stageChange = await request('/api/cadets/test-member/stage', {
            method: 'PUT',
            cookie: memberLogin.cookie,
            body: { stage: 'Anggota Biasa', clearance_level: 4 }
        });
        assert.equal(stageChange.status, 200);
        const profile = await request('/api/auth/me', { cookie: memberLogin.cookie });
        assert.equal((await profile.json()).user.clearance_level, 3);
        const evaluation = await request('/api/cadet/quiz-eval', {
            method: 'POST',
            cookie: memberLogin.cookie,
            body: { score: 88 }
        });
        assert.equal(evaluation.status, 200);

        const demotion = await request('/api/admin/users/test-member', {
            method: 'PUT',
            cookie: adminLogin.cookie,
            body: { clearance_level: 1 }
        });
        assert.equal(demotion.status, 200);
        assert.equal((await request('/api/aspirations', { cookie: memberLogin.cookie })).status, 403);

        const passwordChange = await request('/api/auth/change-password', {
            method: 'PUT',
            cookie: memberLogin.cookie,
            body: { old_password: memberPassword, new_password: 'test-member-password-updated' }
        });
        assert.equal(passwordChange.status, 200);
        assert.match(passwordChange.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/i);
        const oldSession = await request('/api/auth/me', { cookie: memberLogin.cookie });
        assert.equal((await oldSession.json()).authenticated, false);

        const newLogin = await login('test-member', 'test-member-password-updated');
        assert.equal(newLogin.response.status, 200);
        const rejectedAvatar = await uploadAvatar(newLogin.cookie, 'fake-avatar.png', 'image/png', Buffer.from('<svg/onload=alert(1)>'));
        assert.equal(rejectedAvatar.status, 400);
        const uploadedAvatarResponse = await uploadAvatar(newLogin.cookie, 'member-avatar.png', 'image/png', png);
        assert.equal(uploadedAvatarResponse.status, 201);
        const uploadedAvatar = await uploadedAvatarResponse.json();
        assert.equal(uploadedAvatar.user.avatar_silhouette, uploadedAvatar.asset.url);
        const ownAvatarFile = await request(uploadedAvatar.asset.url, { cookie: newLogin.cookie });
        assert.equal(ownAvatarFile.status, 200);
        assert.equal((await request(uploadedAvatar.asset.url)).status, 404);
        assert.equal((await request(`/api/site/assets/${uploadedAvatar.asset.id}`, {
            method: 'DELETE',
            cookie: adminLogin.cookie
        })).status, 409);
        const secondActiveSession = await login('test-member', 'test-member-password-updated');
        assert.equal(secondActiveSession.response.status, 200);
        const invalidAvatar = await request('/api/auth/profile', {
            method: 'PUT',
            cookie: newLogin.cookie,
            body: { avatar: '/api/site/assets/not-an-asset/file' }
        });
        assert.equal(invalidAvatar.status, 400);
        const duplicateNim = await request('/api/auth/profile', {
            method: 'PUT',
            cookie: newLogin.cookie,
            body: { nim: 'TEST-ADMIN' }
        });
        assert.equal(duplicateNim.status, 409);

        const siteState = db.getSiteState();
        const linkedGeneration = siteState.draft.content.data.generations[0];
        linkedGeneration.leadership.ketua = {
            ...linkedGeneration.leadership.ketua,
            accountId,
            name: 'Test Member',
            nim: 'test-member'
        };
        linkedGeneration.divisions[0].coordinatorAccountId = accountId;
        linkedGeneration.divisions[0].coordinator = 'Test Member';
        linkedGeneration.divisions[0].coordinatorNim = 'test-member';
        const linkedDraft = db.saveSiteDraft(siteState.draft, 'test-admin', null, siteState.draftRevisionId);
        db.publishSite('test-admin');
        const linkedAccountDelete = await request('/api/admin/users/test-member', {
            method: 'DELETE',
            cookie: adminLogin.cookie
        });
        assert.equal(linkedAccountDelete.status, 409);

        const profileUpdate = await request('/api/auth/profile', {
            method: 'PUT',
            cookie: newLogin.cookie,
            body: {
                name: 'Renamed Member',
                nim: 'test-member-renamed',
                generation: '2026',
                avatar: '/assets/silhouette_female.jpg'
            }
        });
        assert.equal(profileUpdate.status, 200);
        const updatedProfile = await profileUpdate.json();
        assert.equal(updatedProfile.reauthenticate, true);
        assert.equal(updatedProfile.user.account_id, accountId);
        assert.equal(updatedProfile.user.clearance_level, 1);
        assert.match(profileUpdate.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/i);
        assert.equal((await (await request('/api/auth/me', { cookie: newLogin.cookie })).json()).authenticated, false);
        assert.equal((await (await request('/api/auth/me', { cookie: secondActiveSession.cookie })).json()).authenticated, false);
        assert.ok(db.getCadetAttendanceByAccountId(accountId).some((record) => record.event_id === eventId));
        assert.ok(db.getCadetEvaluationsByAccountId(accountId).some((record) => record.score === 88));
        for (const config of [db.getSiteState().draft, db.getSiteState().published]) {
            const generation = config.content.data.generations[0];
            assert.equal(generation.leadership.ketua.nim, 'test-member-renamed');
            assert.equal(generation.leadership.ketua.name, 'Renamed Member');
            assert.equal(generation.divisions[0].coordinatorNim, 'test-member-renamed');
        }
        assert.equal((await login('test-member', 'test-member-password-updated')).response.status, 401);
        assert.ok(db.listAudit(500).some((entry) => entry.action === 'user.profile_update' && entry.target_id === accountId));
        const renamedLogin = await login('test-member-renamed', 'test-member-password-updated');
        assert.equal(renamedLogin.response.status, 200);
        assert.equal(renamedLogin.payload.user.account_id, accountId);
        const renamedKta = await request('/api/cadets/test-member-renamed/kta', { cookie: renamedLogin.cookie });
        const renamedKtaPayload = (await renamedKta.json()).kta;
        assert.ok(renamedKtaPayload.evaluations.some((record) => record.score === 88));
        assert.ok(renamedKtaPayload.attendance_count >= 1);
        const logout = await request('/api/auth/logout', { method: 'POST', cookie: renamedLogin.cookie });
        assert.equal(logout.status, 200);
        assert.equal((await (await request('/api/auth/me', { cookie: renamedLogin.cookie })).json()).authenticated, false);
        assert.ok(linkedDraft.id);
    } finally {
        server.closeAllConnections();
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        db.close();
        fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
});
