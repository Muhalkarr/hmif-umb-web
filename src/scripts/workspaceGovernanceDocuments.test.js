import assert from 'node:assert/strict';
import test from 'node:test';
import { renderGovernanceDocumentsWorkspace } from './workspaceGovernanceDocuments.js';

const documents = [{
  bab: 'BAB I (AD)',
  title: 'NAMA ORGANISASI',
  pasalList: [{ pasal: 'Pasal 1 AD', heading: 'Pasal 1', content: '<script>teks</script>' }]
}];

test('member view escapes document text and keeps an active draft distinct from official text', () => {
  const html = renderGovernanceDocumentsWorkspace({
    official: {
      version: 1,
      documents,
      metadata: { title: 'Naskah resmi' }
    },
    draft: {
      id: 'draft-id',
      title: 'MUBES 2026',
      version: 2,
      revisionId: 'revision-id',
      updatedAt: '2026-01-01T00:00:00.000Z',
      documents
    },
    history: [],
    permissions: { canEdit: false, canRatify: false }
  });

  assert.match(html, /MUBES 2026/);
  assert.match(html, /NASKAH RESMI/);
  assert.match(html, /&lt;script&gt;teks&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>teks<\/script>/);
  assert.doesNotMatch(html, /data-governance-edit-form/);
});

test('editor view exposes article and chapter operations only to editors', () => {
  const html = renderGovernanceDocumentsWorkspace({
    official: { version: 1, documents, metadata: { title: 'Naskah resmi' } },
    draft: {
      id: 'draft-id',
      title: 'MUBES 2026',
      version: 1,
      revisionId: 'revision-id',
      updatedAt: '',
      documents
    },
    permissions: { canEdit: true, canRatify: true }
  });

  assert.match(html, /data-governance-edit-form/);
  assert.match(html, /data-governance-add-article="0"/);
  assert.match(html, /data-governance-add-chapter/);
  assert.match(html, /data-governance-ratify-form/);
  assert.match(html, /contenteditable="true"/);
  assert.match(html, /data-governance-command="bold"/);
  assert.match(html, /data-governance-image/);
  assert.doesNotMatch(html, /<textarea/);
});

test('legacy article paragraphs render their numbered and alphabetic clauses as lists', () => {
  const content = 'Pasal 5 Atribut 1. Atribut organisasi terdiri dari: 3 a. Bendera; b. Jaket. 2. Pengadaan diatur dalam ART. BAB I I I ASAS';
  const html = renderGovernanceDocumentsWorkspace({
    official: {
      version: 1,
      documents: [{
        bab: 'BAB II (AD)',
        title: 'ATRIBUT',
        pasalList: [{ pasal: 'Pasal 5 AD', heading: content, content }]
      }],
      metadata: { title: 'Naskah resmi' }
    },
    permissions: {}
  });

  assert.match(html, /Pasal 5 AD · Atribut/);
  assert.match(html, /<ol><li><p>Atribut organisasi terdiri dari:<\/p>/);
  assert.match(html, /<ol type="a"><li><p>Bendera;<\/p><\/li><li><p>Jaket\.<\/p><\/li><\/ol>/);
  assert.doesNotMatch(html, /BAB I I I|3 a\./);
});
