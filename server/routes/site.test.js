import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { registerSiteRoutes } from './site.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pdfPath = path.join(projectRoot, 'Draft Amandemen AD & ART + GBHO.pdf');
const passThrough = (_req, _res, next) => next();
const emptyUpload = { single: () => passThrough };
const closeServer = (server) => new Promise((resolve, reject) => {
  server.close((error) => error ? reject(error) : resolve());
  server.closeAllConnections();
});

const createSiteRouteServer = async (constitutionPath) => {
  const app = express();
  registerSiteRoutes(app, {
    db: {},
    requireSuperadmin: passThrough,
    fs,
    path,
    CONSTITUTION_DOCUMENT_PATH: constitutionPath,
    SOUNDTRACK_DIR: projectRoot,
    ASSET_DIR: projectRoot,
    validateSiteConfig: () => ({}),
    assetUpload: emptyUpload,
    soundtrackUpload: emptyUpload,
    multer: { MulterError: class MulterError extends Error {} },
    assetMagic: () => null,
    soundtrackMagic: () => null,
    randomUUID: () => 'test-id',
    createHash: () => ({ update: () => ({ digest: () => 'test-hash' }) }),
    auditAdminMutation: () => {},
    isAssetReferenced: () => false
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server;
};

test('serves the ratified constitution PDF from its fixed source path', async (t) => {
  const server = await createSiteRouteServer(pdfPath);
  t.after(() => closeServer(server));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/site/documents/constitution`);
  const body = Buffer.from(await response.arrayBuffer());

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/pdf/);
  assert.match(response.headers.get('content-disposition'), /HMIF-UMB-AD-ART-GBHO-Resmi-2026\.pdf/);
  assert.equal(body.subarray(0, 5).toString(), '%PDF-');
});

test('reports an unavailable official constitution PDF explicitly', async (t) => {
  const server = await createSiteRouteServer(path.join(projectRoot, 'missing-constitution.pdf'));
  t.after(() => closeServer(server));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/site/documents/constitution`);

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'Naskah resmi AD/ART dan GBHO tidak tersedia.' });
});
