import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractGithubRepository,
  normalizeYoutubeEmbedUrl,
  validateProjectCall,
  validateProjectCallApplication,
  validateTechArticle
} from './portfolioFeatures.js';

test('extracts only direct HTTPS GitHub owner/repository URLs', () => {
  assert.deepEqual(extractGithubRepository('https://github.com/hmif-umb/project-demo'), {
    owner: 'hmif-umb', repo: 'project-demo'
  });
  assert.throws(() => extractGithubRepository('https://example.org/hmif/project'), /GitHub/);
  assert.throws(() => extractGithubRepository('https://github.com/hmif/project/issues'), /GitHub/);
});

test('normalizes valid YouTube links to privacy-enhanced embeds', () => {
  assert.equal(normalizeYoutubeEmbedUrl('https://youtu.be/dQw4w9WgXcQ'), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  assert.throws(() => normalizeYoutubeEmbedUrl('https://video.example/watch/123'), /YouTube/);
});

test('requires a substantive technical article and normalizes its tags', () => {
  const article = validateTechArticle({
    title: 'Menguji Arsitektur Edge',
    public_author_consent: true,
    summary: 'Ringkasan analisis performa dan batas deployment.',
    category: 'Edge AI',
    body: 'A'.repeat(320),
    tags: ['Edge AI', '  Edge AI  '],
    source_url: 'https://example.org/paper'
  });
  assert.deepEqual(article.tags, ['Edge AI']);
  assert.throws(() => validateTechArticle({ public_author_consent: true, title: 'Pendek', summary: 'Ringkasan', category: 'Coding', body: 'singkat' }), /minimal 300/);
});

test('validates open-call roles and binds applications to advertised roles', () => {
  const call = validateProjectCall({
    title: 'Tim Hackathon Smart Campus',
    public_owner_consent: true,
    type: 'Hackathon',
    event_name: 'Hackathon UMB',
    description: 'Mencari rekan tim untuk membuat prototipe layanan kampus.',
    roles: ['UI/UX Designer', 'Embedded Engineer'],
    deadline: '2026-12-01',
    commitment: 'Akhir pekan'
  });
  assert.equal(call.roles.length, 2);
  assert.throws(() => validateProjectCallApplication({ role: 'Backend Engineer', message: 'Saya ingin bergabung.' }, call.roles), /tidak tersedia/);
  assert.equal(validateProjectCallApplication({ role: call.roles[0], message: 'Saya siap membantu riset pengguna.' }, call.roles).role, 'UI/UX Designer');
});