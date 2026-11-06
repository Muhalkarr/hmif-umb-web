import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'hmif-portfolio-test-'));
const origin = 'http://localhost:5173';
process.env.NODE_ENV = 'development';
process.env.PORT = '0';
process.env.JWT_SECRET = randomBytes(48).toString('base64url');
process.env.FRONTEND_ORIGINS = origin;
process.env.ALLOW_PUBLIC_REGISTRATION = 'false';
process.env.INITIAL_ADMIN_NIM = 'portfolio-admin';
process.env.INITIAL_ADMIN_PASSWORD = 'portfolio-admin-password-test';
process.env.DATABASE_FILE = path.join(temporaryDirectory, 'database.sqlite');
process.env.ASSET_STORAGE_DIR = path.join(temporaryDirectory, 'assets');

const { server } = await import('./index.js');
const { db } = await import('./db.js');
if (!server.listening) await once(server, 'listening');
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const httpFetch = globalThis.fetch.bind(globalThis);

const request = (endpoint, { method = 'GET', cookie, body } = {}) => {
  const headers = { Origin: origin };
  if (cookie) headers.Cookie = cookie;
  if (body) headers['Content-Type'] = 'application/json';
  return httpFetch(`${baseUrl}${endpoint}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
};

const login = async (nim, password) => {
  const response = await request('/api/auth/login', { method: 'POST', body: { nim, password } });
  const payload = await response.json();
  return { response, payload, cookie: response.headers.get('set-cookie')?.split(';')[0] };
};

const createMember = async (adminCookie, nim, name) => request('/api/admin/users', {
  method: 'POST',
  cookie: adminCookie,
  body: { nim, name, password: 'member-portfolio-password-123', generation: '2026', division: 'Litbang' }
});

test('publishes reviewed articles and moderates project calls with owner-scoped applications', async () => {
  const admin = await login('portfolio-admin', 'portfolio-admin-password-test');
  assert.equal(admin.response.status, 200);
  const memberCreation = await createMember(admin.cookie, 'portfolio-author', 'Portfolio Author');
  assert.equal(memberCreation.status, 201);
  const member = await login('portfolio-author', 'member-portfolio-password-123');
  assert.equal(member.response.status, 200);
  const applicantCreation = await createMember(admin.cookie, 'portfolio-applicant', 'Portfolio Applicant');
  assert.equal(applicantCreation.status, 201);
  const applicant = await login('portfolio-applicant', 'member-portfolio-password-123');
  assert.equal(applicant.response.status, 200);
  const outsiderCreation = await createMember(admin.cookie, 'portfolio-outsider', 'Portfolio Outsider');
  assert.equal(outsiderCreation.status, 201);
  assert.equal((await request('/api/admin/users/portfolio-outsider', {
    method: 'PUT', cookie: admin.cookie, body: { clearance_level: 2, division: 'PSDM' }
  })).status, 200);
  const outsider = await login('portfolio-outsider', 'member-portfolio-password-123');
  assert.equal(outsider.response.status, 200);
  assert.equal((await request('/api/admin/tech-articles/review', { cookie: outsider.cookie })).status, 403);

  const articleResponse = await request('/api/tech-articles', {
    method: 'POST',
    cookie: member.cookie,
    body: {
      title: 'Menguji Model Edge AI',
      public_author_consent: true,
      category: 'Edge AI',
      summary: 'Catatan eksperimen deployment model kecil.',
      body: 'A'.repeat(320),
      tags: ['Edge AI', 'Model']
    }
  });
  assert.equal(articleResponse.status, 202);
  const articleId = (await articleResponse.json()).article.id;
  assert.equal((await request('/api/tech-articles/review', { cookie: member.cookie })).status, 404);
  assert.equal((await request('/api/admin/tech-articles/review', { cookie: member.cookie })).status, 403);
  const articleQueue = await request('/api/admin/tech-articles/review', { cookie: admin.cookie });
  assert.equal(articleQueue.status, 200);
  const reviewNote = 'Metode dan batasan eksperimen terdokumentasi.';
  const revisionRequest = await request(`/api/admin/tech-articles/${articleId}/review`, {
    method: 'PUT', cookie: admin.cookie, body: { status: 'needs_revision', note: reviewNote }
  });
  assert.equal(revisionRequest.status, 200);
  assert.equal((await (await request('/api/tech-articles')).json()).articles.length, 0);
  assert.equal((await request(`/api/tech-articles/${articleId}`, {
    method: 'PUT', cookie: applicant.cookie,
    body: { public_author_consent: true, title: 'Unauthorized edit', category: 'Edge AI', summary: 'Not owned.', body: 'A'.repeat(320) }
  })).status, 409);
  const resubmission = await request(`/api/tech-articles/${articleId}`, {
    method: 'PUT', cookie: member.cookie,
    body: {
      title: 'Menguji Model Edge AI', category: 'Edge AI',
      public_author_consent: true,
      summary: 'Catatan eksperimen deployment model kecil, beserta batas dan metode.',
      body: 'B'.repeat(340), tags: ['Edge AI', 'Model']
    }
  });
  assert.equal(resubmission.status, 202);
  const articleReview = await request(`/api/admin/tech-articles/${articleId}/review`, {
    method: 'PUT', cookie: admin.cookie, body: { status: 'published' }
  });
  assert.equal(articleReview.status, 200);
  const publicArticles = await (await request('/api/tech-articles')).json();
  assert.equal(publicArticles.articles[0].title, 'Menguji Model Edge AI');
  for (const privateField of ['author_account_id', 'reviewed_by_account_id', 'review_note', 'status']) {
    assert.equal(Object.hasOwn(publicArticles.articles[0], privateField), false);
  }
  const ownArticle = (await (await request('/api/tech-articles/mine', { cookie: member.cookie })).json()).articles[0];
  assert.deepEqual(ownArticle.history.map(({ action }) => action), ['submit', 'review', 'resubmit', 'review']);

  const callResponse = await request('/api/project-calls', {
    method: 'POST', cookie: member.cookie,
    body: {
      title: 'Tim Smart Campus', type: 'Hackathon', event_name: 'Hackathon UMB',
      description: 'Membangun prototipe layanan kampus.',
      public_owner_consent: true,
      roles: ['UI/UX Designer', 'Embedded Engineer'],
      deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      commitment: 'Akhir pekan'
    }
  });
  assert.equal(callResponse.status, 202);
  const callId = (await callResponse.json()).call.id;
  assert.equal((await (await request('/api/project-calls')).json()).calls.length, 0);
  assert.equal((await request('/api/admin/project-calls/review', { cookie: member.cookie })).status, 403);
  const callReview = await request(`/api/admin/project-calls/${callId}/review`, {
    method: 'PUT', cookie: admin.cookie, body: { status: 'published' }
  });
  assert.equal(callReview.status, 200);
  const publicCall = (await (await request('/api/project-calls')).json()).calls[0];
  assert.equal(publicCall.title, 'Tim Smart Campus');
  assert.equal(Object.hasOwn(publicCall, 'owner_account_id'), false);
  assert.equal(Object.hasOwn(publicCall, 'review_note'), false);

  const applicationResponse = await request(`/api/project-calls/${callId}/applications`, {
    method: 'POST', cookie: applicant.cookie,
    body: { role: 'UI/UX Designer', message: 'Saya siap melakukan riset pengguna dan prototipe.' }
  });
  assert.equal(applicationResponse.status, 201);
  const applicationId = (await applicationResponse.json()).application.id;
  assert.equal((await request(`/api/project-calls/${callId}/applications`, { cookie: applicant.cookie })).status, 403);
  assert.equal((await request(`/api/project-calls/${callId}/applications`, { cookie: member.cookie })).status, 200);
  const duplicateApplication = await request(`/api/project-calls/${callId}/applications`, {
    method: 'POST', cookie: applicant.cookie,
    body: { role: 'Embedded Engineer', message: 'Pengajuan duplikat.' }
  });
  assert.equal(duplicateApplication.status, 409);
  const accepted = await request(`/api/project-calls/${callId}/applications/${applicationId}`, {
    method: 'PUT', cookie: member.cookie, body: { status: 'accepted' }
  });
  assert.equal(accepted.status, 200);
  const myApplications = await (await request('/api/project-calls/mine', { cookie: applicant.cookie })).json();
  assert.equal(myApplications.applications[0].status, 'accepted');
  assert.equal((await request(`/api/project-calls/${callId}/close`, { method: 'PUT', cookie: member.cookie, body: {} })).status, 200);

  const projectResponse = await request('/api/admin/portal-records/project', {
    method: 'POST', cookie: admin.cookie,
    body: {
      title: 'Proyek link non-GitHub', author: 'Portfolio Author', category: 'Web',
      description: 'Proyek uji URL statistik.', repo_url: 'https://example.org/repository',
      video_url: 'https://youtu.be/dQw4w9WgXcQ', tags: []
    }
  });
  assert.equal(projectResponse.status, 201);
  const projectId = (await projectResponse.json()).record.id;
  for (const action of ['approve', 'publish']) {
    assert.equal((await request(`/api/admin/portal-records/project/${projectId}/review`, {
      method: 'PUT', cookie: admin.cookie, body: { action }
    })).status, 200);
  }
  const project = (await (await request('/api/showcase')).json()).projects[0];
  assert.equal(project.project_type, 'Lainnya');
  assert.equal(project.video_embed_url, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  assert.equal((await request(`/api/showcase/${projectId}/github`)).status, 404);

  const githubProjectResponse = await request('/api/admin/portal-records/project', {
    method: 'POST', cookie: admin.cookie,
    body: {
      title: 'Proyek GitHub Uji', author: 'Portfolio Author', category: 'Web',
      description: 'Repo publik untuk menguji statistik.', repo_url: 'https://github.com/octocat/Hello-World', tags: []
    }
  });
  assert.equal(githubProjectResponse.status, 201);
  const githubProjectId = (await githubProjectResponse.json()).record.id;
  for (const action of ['approve', 'publish']) {
    assert.equal((await request(`/api/admin/portal-records/project/${githubProjectId}/review`, {
      method: 'PUT', cookie: admin.cookie, body: { action }
    })).status, 200);
  }
  let upstreamRequestCount = 0;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    upstreamRequestCount += 1;
    const isCommitsRequest = String(url).endsWith('/commits?per_page=5');
    const payload = isCommitsRequest
      ? [{ sha: '123456789abcdef', commit: { message: 'Add project demo\nDetails', author: { name: 'Contributor', date: '2026-10-05T00:00:00Z' } } }]
      : { stargazers_count: 12, forks_count: 3, open_issues_count: 1, language: 'JavaScript', pushed_at: '2026-10-05T00:00:00Z' };
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const githubStats = await request(`/api/showcase/${githubProjectId}/github`);
    assert.equal(githubStats.status, 200);
    const stats = await githubStats.json();
    assert.equal(stats.stars, 12);
    assert.equal(stats.commits[0].message, 'Add project demo');
    assert.equal((await request(`/api/showcase/${githubProjectId}/github`)).status, 200);
    assert.equal(upstreamRequestCount, 2);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});