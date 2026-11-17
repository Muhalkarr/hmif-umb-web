import {
  GovernanceDocumentValidationError,
  validateGovernanceDocuments,
  validateGovernanceDocumentNote,
  validateGovernanceDocumentTitle
} from '../governanceDocuments.js';
import { CONSTITUTION_DOCUMENT_METADATA, FULL_CONSTITUTION_DATA } from '../../src/scripts/constitutionData.js';

const isUuid = (value) => typeof value === 'string' && /^[a-f0-9-]{36}$/i.test(value);

const state = (db) => db.getGovernanceDocumentState(FULL_CONSTITUTION_DATA, CONSTITUTION_DOCUMENT_METADATA);

const canAccess = (user, access, hasCapability) => user?.role === 'superadmin'
  || ((user?.clearance_level || 0) >= access.clearance && hasCapability(user, access.capability));

const accessError = (action, access) => `Untuk ${action} diperlukan clearance level ${access.clearance} dan capability ${access.capability}.`;

const sendRouteError = (res, error) => {
  if (error?.code === 'GOVERNANCE_DOCUMENT_CONFLICT') return res.status(409).json({ error: error.message });
  if (error instanceof GovernanceDocumentValidationError) return res.status(400).json({ error: error.message });
  throw error;
};

export const registerGovernanceDocumentsRoutes = (app, {
  db,
  siteDb,
  requireAuth,
  hasCapability,
  assetUpload,
  multer,
  fs,
  path,
  assetMagic,
  randomUUID,
  ASSET_DIR,
  createHash,
  auditAdminMutation
}) => {
  app.get('/api/governance-documents/official', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    const { official } = state(db);
    res.json({
      revision_id: official.id,
      version: official.version,
      documents: official.documents,
      metadata: official.metadata,
      published_at: official.createdAt
    });
  });

  app.get('/api/governance-documents', requireAuth, (req, res) => {
    res.set('Cache-Control', 'no-store');
    const access = siteDb.getSiteState().published.content.governanceDocumentAccess;
    const current = state(db);
    res.json({
      ...current,
      history: db.listGovernanceDocumentRevisions(50),
      permissions: {
        canEdit: canAccess(req.user, access.edit, hasCapability),
        canRatify: canAccess(req.user, access.ratify, hasCapability)
      }
    });
  });

  app.post('/api/governance-documents/images', requireAuth, (req, res, next) => {
    const access = siteDb.getSiteState().published.content.governanceDocumentAccess.edit;
    if (!canAccess(req.user, access, hasCapability)) {
      return res.status(403).json({ error: accessError('mengunggah gambar dokumen', access) });
    }
    assetUpload.single('asset')(req, res, (error) => {
      if (!error) return next();
      return res.status(error instanceof multer.MulterError ? 413 : 400).json({ error: error.message });
    });
  }, (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Pilih satu gambar PNG, JPEG, atau WebP.' });
    const buffer = fs.readFileSync(req.file.path);
    const detected = assetMagic(buffer);
    if (!detected || detected.kind !== 'image' || detected.mime !== req.file.mimetype) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Isi file tidak sesuai dengan tipe gambar yang diizinkan.' });
    }

    const id = randomUUID();
    const storedName = `${id}${detected.ext}`;
    const targetPath = path.join(ASSET_DIR, storedName);
    let asset;
    try {
      fs.renameSync(req.file.path, targetPath);
      asset = siteDb.addAsset({
        stored_name: storedName,
        original_name: path.basename(req.file.originalname).slice(0, 160),
        mime_type: detected.mime,
        kind: detected.kind,
        size: req.file.size,
        sha256: createHash('sha256').update(buffer).digest('hex'),
        uploaded_by: req.user.nim
      });
      auditAdminMutation(req, 'governance_document.image_upload', 'asset', asset.id, {
        mime_type: asset.mime_type,
        size: asset.size
      });
      return res.status(201).json({ asset: { ...asset, url: `/api/site/assets/${asset.id}/file` } });
    } catch {
      if (asset) siteDb.deleteAsset(asset.id);
      if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(500).json({ error: 'Gambar dokumen tidak dapat disimpan.' });
    }
  });

  app.get('/api/governance-documents/versions/:id', requireAuth, (req, res) => {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'ID versi tidak valid.' });
    const revision = db.getGovernanceDocumentRevision(req.params.id);
    if (!revision) return res.status(404).json({ error: 'Versi dokumen tidak ditemukan.' });
    res.set('Cache-Control', 'no-store');
    res.json({ revision });
  });

  app.post('/api/governance-documents/drafts', requireAuth, (req, res) => {
    const access = siteDb.getSiteState().published.content.governanceDocumentAccess.edit;
    if (!canAccess(req.user, access, hasCapability)) {
      return res.status(403).json({ error: accessError('membuat atau menyunting draf', access) });
    }
    try {
      const title = validateGovernanceDocumentTitle(req.body?.title);
      const changeNote = validateGovernanceDocumentNote(req.body?.change_note);
      const current = state(db);
      if (current.draft) return res.status(409).json({ error: 'Sudah ada draf MUBES aktif.' });
      const result = db.createGovernanceDocumentDraft(
        title, req.user.nim, req.user.role, changeNote, FULL_CONSTITUTION_DATA, CONSTITUTION_DOCUMENT_METADATA
      );
      return res.status(201).json(result);
    } catch (error) {
      return sendRouteError(res, error);
    }
  });

  app.put('/api/governance-documents/drafts/:id', requireAuth, (req, res) => {
    const access = siteDb.getSiteState().published.content.governanceDocumentAccess.edit;
    if (!canAccess(req.user, access, hasCapability)) {
      return res.status(403).json({ error: accessError('menyunting draf', access) });
    }
    if (!isUuid(req.params.id) || !isUuid(req.body?.expected_revision_id)) {
      return res.status(400).json({ error: 'ID draf dan revisi yang diharapkan wajib valid.' });
    }
    try {
      const documents = validateGovernanceDocuments(req.body?.documents);
      const changeNote = validateGovernanceDocumentNote(req.body?.change_note);
      return res.json(db.saveGovernanceDocumentDraft(
        req.params.id, documents, req.body.expected_revision_id,
        req.user.nim, req.user.role, changeNote, FULL_CONSTITUTION_DATA, CONSTITUTION_DOCUMENT_METADATA
      ));
    } catch (error) {
      return sendRouteError(res, error);
    }
  });

  app.post('/api/governance-documents/drafts/:id/ratify', requireAuth, (req, res) => {
    const access = siteDb.getSiteState().published.content.governanceDocumentAccess.ratify;
    if (!canAccess(req.user, access, hasCapability)) {
      return res.status(403).json({ error: accessError('mengesahkan dan memublikasikan naskah', access) });
    }
    if (!isUuid(req.params.id) || !isUuid(req.body?.expected_revision_id)) {
      return res.status(400).json({ error: 'ID draf dan revisi yang diharapkan wajib valid.' });
    }
    try {
      const ratificationNote = validateGovernanceDocumentNote(req.body?.ratification_note, 'Catatan pengesahan');
      if (ratificationNote.length < 5) throw new GovernanceDocumentValidationError('Catatan pengesahan minimal 5 karakter.');
      return res.json(db.ratifyGovernanceDocumentDraft(
        req.params.id, req.body.expected_revision_id, req.user.nim, req.user.role,
        ratificationNote, CONSTITUTION_DOCUMENT_METADATA, FULL_CONSTITUTION_DATA
      ));
    } catch (error) {
      return sendRouteError(res, error);
    }
  });

  app.post('/api/governance-documents/drafts/:id/withdraw', requireAuth, (req, res) => {
    const access = siteDb.getSiteState().published.content.governanceDocumentAccess.edit;
    if (!canAccess(req.user, access, hasCapability)) {
      return res.status(403).json({ error: accessError('menarik draf', access) });
    }
    if (!isUuid(req.params.id) || !isUuid(req.body?.expected_revision_id)) {
      return res.status(400).json({ error: 'ID draf dan revisi yang diharapkan wajib valid.' });
    }
    try {
      return res.json(db.withdrawGovernanceDocumentDraft(
        req.params.id, req.body.expected_revision_id, req.user.nim, req.user.role,
        FULL_CONSTITUTION_DATA, CONSTITUTION_DOCUMENT_METADATA
      ));
    } catch (error) {
      return sendRouteError(res, error);
    }
  });
};
