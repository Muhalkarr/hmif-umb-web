import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import Sqlite from 'better-sqlite3';
import express from 'express';
import { once } from 'node:events';
import {
  createGovernanceDocumentsSqlRepository,
  initializeGovernanceDocumentsSchema
} from './repositories/governanceDocumentsSqlRepository.js';
import { registerGovernanceDocumentsRoutes } from './routes/governanceDocuments.js';
import { CONSTITUTION_DOCUMENT_METADATA, FULL_CONSTITUTION_DATA } from '../src/scripts/constitutionData.js';
import { validateGovernanceDocuments } from './governanceDocuments.js';
import { renderGovernanceContentHtml } from '../shared/governanceDocumentContent.js';

const seedDocuments = [{
  bab: 'BAB I (AD)',
  title: 'Nama',
  pasalList: [{ pasal: 'Pasal 1 AD', heading: 'Pasal 1', content: 'Nama organisasi.' }]
}];
const metadata = { title: 'AD/ART/GBHO HMIF', sourceUrl: '/arsip.pdf', ratifiedYear: 2026 };

const closeServer = (server) => new Promise((resolve, reject) => {
  server.close((error) => error ? reject(error) : resolve());
  server.closeAllConnections();
});

test('governance document repository preserves draft revisions and ratifies atomically', () => {
  const sqlite = new Sqlite(':memory:');
  initializeGovernanceDocumentsSchema(sqlite);
  const audits = [];
  const repository = createGovernanceDocumentsSqlRepository({
    sqlite,
    insertAudit: (entry) => audits.push(entry)
  });

  const initial = repository.getGovernanceDocumentState(seedDocuments, metadata);
  assert.equal(initial.official.version, 1);
  assert.equal(initial.draft, null);

  const created = repository.createGovernanceDocumentDraft(
    'MUBES 2026', '123456789', 'member', 'Draf awal', seedDocuments, metadata
  );
  assert.equal(created.draft.version, 1);
  const changedDocuments = structuredClone(seedDocuments);
  changedDocuments[0].pasalList[0].content = 'Nama organisasi yang telah diamandemen.';
  const saved = repository.saveGovernanceDocumentDraft(
    created.draft.id, changedDocuments, created.draft.revisionId,
    '123456789', 'member', 'Ubah Pasal 1', seedDocuments, metadata
  );

  assert.equal(saved.draft.version, 2);
  assert.equal(repository.getGovernanceDocumentRevision(created.draft.revisionId).documents[0].pasalList[0].content, 'Nama organisasi.');
  assert.throws(() => repository.saveGovernanceDocumentDraft(
    created.draft.id, changedDocuments, created.draft.revisionId,
    '123456789', 'member', '', seedDocuments, metadata
  ), { code: 'GOVERNANCE_DOCUMENT_CONFLICT' });

  const ratified = repository.ratifyGovernanceDocumentDraft(
    saved.draft.id, saved.draft.revisionId, '987654321', 'member',
    'Disahkan MUBES 2026', metadata, seedDocuments
  );
  assert.equal(ratified.draft, null);
  assert.equal(ratified.official.version, 2);
  assert.equal(ratified.official.documents[0].pasalList[0].content, 'Nama organisasi yang telah diamandemen.');
  assert.equal(ratified.official.metadata.sourceUrl, null);
  assert.equal(ratified.official.metadata.archivedSourceUrl, '/arsip.pdf');
  assert.equal(repository.listGovernanceDocumentRevisions().length, 4);
  assert.deepEqual(audits.map(({ action }) => action), [
    'governance_document.draft_create',
    'governance_document.draft_update',
    'governance_document.ratify'
  ]);
  sqlite.close();
});

test('draft endpoints require both configured clearance and capability', async (t) => {
  const app = express();
  app.use(express.json());
  let user = { role: 'member', nim: '123456789', clearance_level: 3, permissions: [] };
  app.use((req, _res, next) => {
    req.user = user;
    next();
  });
  let draftExists = false;
  const official = {
    id: '00000000-0000-4000-8000-000000000001',
    version: 1,
    documents: seedDocuments,
    metadata,
    createdAt: '2026-01-01T00:00:00.000Z'
  };
  const db = {
    getGovernanceDocumentState: () => ({ official, draft: draftExists ? { id: 'draft' } : null }),
    createGovernanceDocumentDraft: () => {
      draftExists = true;
      return { official, draft: { id: 'draft' } };
    }
  };
  const siteDb = {
    getSiteState: () => ({
      published: {
        content: {
          governanceDocumentAccess: {
            edit: { clearance: 2, capability: 'constitution.edit' },
            ratify: { clearance: 3, capability: 'constitution.ratify' }
          }
        }
      }
    })
  };
  const requireAuth = (req, res, next) => req.user ? next() : res.status(401).json({ error: 'Auth diperlukan.' });
  const hasCapability = (candidate, capability) => candidate.permissions.includes(capability);
  registerGovernanceDocumentsRoutes(app, { db, siteDb, requireAuth, hasCapability });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => closeServer(server));
  const endpoint = `http://127.0.0.1:${server.address().port}/api/governance-documents/drafts`;
  const postDraft = () => fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'MUBES 2026' })
  });

  assert.equal((await postDraft()).status, 403);
  user = { ...user, clearance_level: 1, permissions: ['constitution.edit'] };
  assert.equal((await postDraft()).status, 403);
  user = { ...user, clearance_level: 2 };
  assert.equal((await postDraft()).status, 201);
  assert.equal((await postDraft()).status, 409);
});

test('constitution source contains the AD, ART, and GBHO provisions used as the initial baseline', () => {
  assert.ok(FULL_CONSTITUTION_DATA.some(({ title }) => title.includes('HALUAN ORGANISASI')));
  assert.ok(FULL_CONSTITUTION_DATA.some(({ bab }) => bab.includes('(AD)')));
  assert.ok(FULL_CONSTITUTION_DATA.some(({ bab }) => bab.includes('(ART)')));
  assert.equal(CONSTITUTION_DOCUMENT_METADATA.sourceUrl, '/api/site/documents/constitution');
});

test('legacy article text is normalized into nested legal clauses without extraction artifacts', () => {
  const documents = validateGovernanceDocuments(FULL_CONSTITUTION_DATA);
  const article = documents
    .find(({ bab }) => bab === 'BAB II (AD)')
    .pasalList.find(({ pasal }) => pasal === 'Pasal 5 AD');
  const [mainList] = article.contentDocument.content;
  const nestedList = mainList.content[0].content[1];

  assert.equal(article.heading, 'Atribut');
  assert.equal(mainList.type, 'orderedList');
  assert.equal(mainList.content.length, 2);
  assert.equal(nestedList.type, 'orderedList');
  assert.equal(nestedList.attrs.type, 'lower-alpha');
  assert.equal(nestedList.content.length, 5);
  assert.doesNotMatch(article.content, /BAB I I I|3 a\./);
  assert.match(renderGovernanceContentHtml(article.contentDocument), /<ol type="a">/);
  assert.match(renderGovernanceContentHtml(article.contentDocument), /<li><p>Bendera Organisasi;<\/p><\/li>/);
});

test('legacy legal lists preserve nested roman clauses and their hierarchy', () => {
  const documents = validateGovernanceDocuments(FULL_CONSTITUTION_DATA);
  const article = documents
    .find(({ bab }) => bab === 'BAB I (ART)')
    .pasalList.find(({ pasal }) => pasal === 'Pasal 3 ART');
  const meetingArticle = documents
    .find(({ bab }) => bab === 'BAB VI (ART)')
    .pasalList.find(({ pasal }) => pasal === 'Pasal 36 ART');
  const diplomaticArticle = documents
    .find(({ bab }) => bab === 'BAB VIII (ART)')
    .pasalList.find(({ pasal }) => pasal === 'Pasal 54 ART');
  const disciplinaryArticle = documents
    .flatMap(({ pasalList }) => pasalList)
    .find(({ pasal }) => pasal === 'Pasal 51 ART');
  const [mainList] = article.contentDocument.content;
  const subitems = mainList.content[1].content[1];
  const romanItems = subitems.content[2].content[1];

  assert.equal(article.heading, 'Jaket Himpunan');
  assert.equal(mainList.content.length, 5);
  assert.equal(subitems.attrs.type, 'lower-alpha');
  assert.equal(subitems.content.length, 3);
  assert.equal(romanItems.attrs.type, 'lower-roman');
  assert.equal(romanItems.content.length, 4);
  assert.match(renderGovernanceContentHtml(article.contentDocument), /<ol type="i">/);
  assert.doesNotMatch(subitems.content[0].content[0].content[0].text, /\b17\b/);
  assert.equal(meetingArticle.heading, 'Musyawarah Besar MUBES');
  assert.ok(diplomaticArticle.contentDocument.content.some(({ type }) => type === 'orderedList'));
  assert.match(diplomaticArticle.content, /1\./);
  assert.equal(disciplinaryArticle.contentDocument.content[0].type, 'orderedList');
});

test('rich document validation allows formatting and uploaded images but rejects unsafe image URLs', () => {
  const richArticle = structuredClone(seedDocuments);
  richArticle[0].pasalList[0] = {
    pasal: 'Pasal 1 AD',
    heading: 'Nama Organisasi',
    contentDocument: {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Nama organisasi', marks: [{ type: 'bold' }] },
          {
            type: 'image',
            attrs: {
              src: '/api/site/assets/11111111-1111-4111-8111-111111111111/file',
              alt: 'Lambang HMIF',
              title: ''
            }
          }
        ]
      }]
    }
  };
  const validated = validateGovernanceDocuments(richArticle);

  assert.match(renderGovernanceContentHtml(validated[0].pasalList[0].contentDocument), /<strong>Nama organisasi<\/strong>/);
  assert.match(renderGovernanceContentHtml(validated[0].pasalList[0].contentDocument), /alt="Lambang HMIF"/);

  richArticle[0].pasalList[0].contentDocument.content[0].content[1].attrs.src = 'javascript:alert(1)';
  assert.throws(() => validateGovernanceDocuments(richArticle), /hanya boleh memuat gambar/);
});

test('image asset references follow official publication and remain protected by revision history', () => {
  const sqlite = new Sqlite(':memory:');
  initializeGovernanceDocumentsSchema(sqlite);
  const repository = createGovernanceDocumentsSqlRepository({ sqlite, insertAudit: () => {} });
  const assetId = '11111111-1111-4111-8111-111111111111';
  const imageDocuments = structuredClone(seedDocuments);
  imageDocuments[0].pasalList[0] = {
    pasal: 'Pasal 1 AD',
    heading: '',
    content: 'Nama organisasi',
    contentDocument: {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Nama organisasi' },
          { type: 'image', attrs: { src: `/api/site/assets/${assetId}/file`, alt: 'Logo', title: '' } }
        ]
      }]
    }
  };
  repository.getGovernanceDocumentState(imageDocuments, metadata);
  assert.equal(repository.isAssetReferencedByOfficial(assetId), true);

  const draft = repository.createGovernanceDocumentDraft('MUBES 2026', '123456789', 'member', '', imageDocuments, metadata);
  const revisedDocuments = structuredClone(imageDocuments);
  revisedDocuments[0].pasalList[0].contentDocument = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nama organisasi diperbarui.' }] }]
  };
  revisedDocuments[0].pasalList[0].content = 'Nama organisasi diperbarui.';
  const saved = repository.saveGovernanceDocumentDraft(
    draft.draft.id, revisedDocuments, draft.draft.revisionId,
    '123456789', 'member', '', imageDocuments, metadata
  );
  const ratified = repository.ratifyGovernanceDocumentDraft(
    saved.draft.id, saved.draft.revisionId, '987654321', 'member',
    'Disahkan dalam MUBES', metadata, imageDocuments
  );

  assert.equal(ratified.official.documents[0].pasalList[0].contentDocument.content[0].content[0].text, 'Nama organisasi diperbarui.');
  assert.equal(repository.isAssetReferencedByOfficial(assetId), false);
  assert.equal(repository.isAssetReferencedByRevision(assetId), true);
  sqlite.close();
});

test('governance image uploads require edit access and store verified assets', async (t) => {
  const assetDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'hmif-governance-image-'));
  const temporaryFile = path.join(assetDirectory, 'incoming-image');
  const imageBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  fs.writeFileSync(temporaryFile, imageBuffer);
  t.after(() => fs.rmSync(assetDirectory, { recursive: true, force: true }));

  const app = express();
  let user = { role: 'member', nim: '123456789', clearance_level: 1, permissions: ['constitution.edit'] };
  app.use((req, _res, next) => {
    req.user = user;
    next();
  });
  let uploadMiddlewareCalled = false;
  const assetUpload = {
    single: () => (req, _res, next) => {
      uploadMiddlewareCalled = true;
      req.file = {
        path: temporaryFile,
        originalname: 'lambang.png',
        mimetype: 'image/png',
        size: imageBuffer.length
      };
      next();
    }
  };
  let storedAsset;
  const siteDb = {
    getSiteState: () => ({
      published: {
        content: {
          governanceDocumentAccess: {
            edit: { clearance: 2, capability: 'constitution.edit' },
            ratify: { clearance: 3, capability: 'constitution.ratify' }
          }
        }
      }
    }),
    addAsset: (asset) => {
      storedAsset = { id: '22222222-2222-4222-8222-222222222222', ...asset };
      return storedAsset;
    },
    deleteAsset: () => true
  };
  const requireAuth = (req, res, next) => req.user ? next() : res.status(401).end();
  registerGovernanceDocumentsRoutes(app, {
    db: {},
    siteDb,
    requireAuth,
    hasCapability: (candidate, capability) => candidate.permissions.includes(capability),
    assetUpload,
    multer: { MulterError: class MulterError extends Error {} },
    fs,
    path,
    assetMagic: (buffer) => buffer[0] === 0x89 ? { kind: 'image', mime: 'image/png', ext: '.png' } : null,
    randomUUID: () => '22222222-2222-4222-8222-222222222222',
    ASSET_DIR: assetDirectory,
    createHash,
    auditAdminMutation: () => {}
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => closeServer(server));
  const endpoint = `http://127.0.0.1:${server.address().port}/api/governance-documents/images`;

  const denied = await fetch(endpoint, { method: 'POST' });
  assert.equal(denied.status, 403);
  assert.equal(uploadMiddlewareCalled, false);

  user = { ...user, clearance_level: 2 };
  const uploaded = await fetch(endpoint, { method: 'POST' });
  const payload = await uploaded.json();
  assert.equal(uploaded.status, 201);
  assert.equal(payload.asset.url, '/api/site/assets/22222222-2222-4222-8222-222222222222/file');
  assert.equal(storedAsset.kind, 'image');
  assert.equal(fs.existsSync(path.join(assetDirectory, `${storedAsset.id}.png`)), true);
});
