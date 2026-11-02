import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
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
const { db } = await import('./db.js');
if (!server.listening) await once(server, 'listening');
const baseUrl = `http://127.0.0.1:${server.address().port}`;

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
        assert.equal((await request('/api/admin/users')).status, 401);
        assert.equal((await request('/api/ledger')).status, 401);
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
        assert.ok(Array.isArray(initialSiteBody.config.content.data.operators));
        assert.equal((await request('/api/site/config?preview=draft')).status, 401);
        assert.equal((await request('/api/site/assets')).status, 401);
        assert.equal((await request('/api/admin/audit')).status, 401);

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

        const invalidSiteDraft = await request('/api/site/draft', {
            method: 'PUT',
            cookie: adminLogin.cookie,
            body: { config: { ...initialSiteBody.config, theme: { ...initialSiteBody.config.theme, colors: { ...initialSiteBody.config.theme.colors, accent: 'red' } } }, expected_revision_id: initialSiteBody.revision_id }
        });
        assert.equal(invalidSiteDraft.status, 400);

        const draftConfig = structuredClone(initialSiteBody.config);
        draftConfig.theme.colors.accent = '#22cc88';
        draftConfig.theme.background = {
            mode: 'image',
            image: `/api/site/assets/${uploadedAsset.id}/file`,
            assetId: uploadedAsset.id
        };
        draftConfig.content.data.identity.logo = `/api/site/assets/${uploadedAsset.id}/file`;
        draftConfig.content.heroLead = '<script>this remains text</script>';
        draftConfig.content.data.identity.abbreviation = 'HMIF TEST';
        draftConfig.content.data.operators[0].name = '<img src=x onerror=alert(1)>';
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
        assert.equal(previewConfig.content.data.news[0].title, 'Published from a structured CMS collection');
        assert.equal(previewConfig.content.data.doctrine.adArt[0].title, 'Edited document title');
        assert.equal(previewConfig.pages[0].id, 'vision');

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

        let memberLogin = await login('test-member', memberPassword);
        assert.equal(memberLogin.response.status, 200);
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
            body: { date_str: '2026-12-03', title: 'API test event', division: 'Test' }
        });
        assert.equal(calendar.status, 201);

        const aspiration = await request('/api/aspirations', {
            method: 'POST',
            body: { sender: 'Test', category: 'Integration', message: 'A test aspiration' }
        });
        assert.equal(aspiration.status, 201);
        const aspirationId = (await aspiration.json()).aspiration.id;
        const responseToAspiration = await request(`/api/aspirations/${aspirationId}/respond`, {
            method: 'PUT',
            cookie: memberLogin.cookie,
            body: { response: 'Reviewed by test', status: 'Ditinjau' }
        });
        assert.equal(responseToAspiration.status, 200);

        const transaction = await request('/api/ledger', {
            method: 'POST',
            cookie: memberLogin.cookie,
            body: { type: 'INCOME', amount: 1000, description: 'API test transaction' }
        });
        assert.equal(transaction.status, 201);

        const stageChange = await request('/api/cadets/test-member/stage', {
            method: 'PUT',
            cookie: memberLogin.cookie,
            body: { stage: 'Anggota Biasa', clearance_level: 4 }
        });
        assert.equal(stageChange.status, 200);
        const profile = await request('/api/auth/me', { cookie: memberLogin.cookie });
        assert.equal((await profile.json()).user.clearance_level, 3);

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
        const logout = await request('/api/auth/logout', { method: 'POST', cookie: newLogin.cookie });
        assert.equal(logout.status, 200);
        assert.equal((await (await request('/api/auth/me', { cookie: newLogin.cookie })).json()).authenticated, false);
    } finally {
        server.closeAllConnections();
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        db.close();
        fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
});
