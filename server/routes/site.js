/** Endpoint domain registerSiteRoutes. */
export const registerSiteRoutes = (app, context) => {
  const { db, requireSuperadmin, fs, path, SOUNDTRACK_DIR, validateSiteConfig, assetUpload, multer, assetMagic, randomUUID, ASSET_DIR, createHash, auditAdminMutation, isAssetReferenced, soundtrackUpload, soundtrackMagic } = context;

app.get('/api/site/config', (req, res) => {
  const state = db.getSiteState();
  if (req.query.preview === 'draft') {
    if (req.user?.role !== 'superadmin') return res.status(req.user ? 403 : 401).json({ error: 'Pratinjau draft hanya tersedia untuk superadmin.' });
    return res.json({ config: state.draft, revision_id: state.draftRevisionId, preview: true });
  }
  const publicConfig = structuredClone(state.published);
  const siteData = publicConfig.content?.data || {};
  for (const operator of siteData.operators || []) delete operator.nim;
  for (const generation of siteData.generations || []) {
    for (const leader of Object.values(generation.leadership || {})) {
      delete leader.nim;
      delete leader.accountId;
    }
    for (const division of generation.divisions || []) {
      delete division.coordinatorNim;
      delete division.coordinatorAccountId;
      for (const member of division.members || []) {
        if (typeof member === 'string') continue;
        delete member.nim;
        delete member.accountId;
      }
    }
  }
  res.set('Cache-Control', 'no-store');
  res.json({ config: publicConfig, revision_id: state.publishedRevisionId, preview: false });
});

app.get('/api/soundtracks', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    tracks: db.listSoundtracks().map((track) => ({
      id: track.id,
      title: track.title,
      source_type: track.source_type,
      url: track.source_type === 'upload' ? `/api/soundtracks/${track.id}/file` : track.source_url
    }))
  });
});

app.get('/api/soundtracks/:id/file', (req, res) => {
  const track = db.getSoundtrack(req.params.id);
  if (!track || !track.active || track.source_type !== 'upload' || !track.stored_name) return res.status(404).end();
  const filePath = path.resolve(SOUNDTRACK_DIR, track.stored_name);
  if (!filePath.startsWith(`${SOUNDTRACK_DIR}${path.sep}`) || !fs.existsSync(filePath)) return res.status(404).end();
  res.set({
    'Content-Type': track.mime_type,
    'Content-Length': String(track.size),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
    'Content-Disposition': `inline; filename="${track.stored_name}"`
  });
  res.sendFile(filePath);
});

app.post('/api/site/validate', requireSuperadmin, (req, res) => {
  try {
    const config = validateSiteConfig(req.body.config, (id, kind) => db.assetExists(id, kind));
    res.json({ valid: true, config });
  } catch (error) {
    res.status(400).json({ valid: false, error: error.message || 'Konfigurasi situs tidak valid.' });
  }
});

app.put('/api/site/draft', requireSuperadmin, (req, res) => {
  try {
    if (typeof req.body.expected_revision_id !== 'string' || !/^[a-f0-9-]{36}$/.test(req.body.expected_revision_id)) {
      return res.status(428).json({ error: 'Muat versi draft terkini sebelum menyimpan.' });
    }
    const config = validateSiteConfig(req.body.config, (id, kind) => db.assetExists(id, kind));
    const revision = db.saveSiteDraft(config, req.user.nim, null, req.body.expected_revision_id ?? null);
    res.status(201).json({ message: 'DRAFT TERSIMPAN', revision, config });
  } catch (error) {
    if (error.code === 'SITE_DRAFT_CONFLICT') return res.status(409).json({ error: error.message });
    res.status(400).json({ error: error.message || 'Konfigurasi tidak valid.' });
  }
});

app.post('/api/site/publish', requireSuperadmin, (req, res) => {
  const revision = db.publishSite(req.user.nim);
  if (!revision) return res.status(409).json({ error: 'Tidak ada draft untuk dipublikasikan.' });
  res.json({ message: 'DRAFT DIPUBLIKASIKAN', revision });
});

app.get('/api/site/revisions', requireSuperadmin, (_req, res) => {
  res.json({ revisions: db.listSiteRevisions() });
});

app.post('/api/site/revisions/:id/restore', requireSuperadmin, (req, res) => {
  const revision = db.getSiteRevision(req.params.id);
  if (!revision) return res.status(404).json({ error: 'Versi tidak ditemukan.' });
  try {
    if (typeof req.body.expected_revision_id !== 'string' || !/^[a-f0-9-]{36}$/.test(req.body.expected_revision_id)) {
      return res.status(428).json({ error: 'Muat versi draft terkini sebelum memulihkan.' });
    }
    const config = validateSiteConfig(revision.payload, (id, kind) => db.assetExists(id, kind));
    const restored = db.saveSiteDraft(config, req.user.nim, revision.id, req.body.expected_revision_id);
    res.status(201).json({ message: 'VERSI DIPULIHKAN MENJADI DRAFT', revision: restored });
  } catch (error) {
    res.status(409).json({ error: error.message });
  }
});

app.get('/api/site/assets', requireSuperadmin, (_req, res) => {
  res.json({ assets: db.listAssets() });
});

app.post('/api/site/assets', requireSuperadmin, (req, res, next) => {
  assetUpload.single('asset')(req, res, (error) => {
    if (!error) return next();
    res.status(error instanceof multer.MulterError ? 413 : 400).json({ error: error.message });
  });
}, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Pilih satu gambar atau font untuk diunggah.' });
  const buffer = fs.readFileSync(req.file.path);
  const detected = assetMagic(buffer);
  if (!detected || detected.mime !== req.file.mimetype) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Isi file tidak sesuai dengan tipe gambar/font yang diizinkan.' });
  }

  const id = randomUUID();
  const storedName = `${id}${detected.ext}`;
  const targetPath = path.join(ASSET_DIR, storedName);
  try {
    fs.renameSync(req.file.path, targetPath);
    const asset = db.addAsset({
      stored_name: storedName,
      original_name: path.basename(req.file.originalname).slice(0, 160),
      mime_type: detected.mime,
      kind: detected.kind,
      size: req.file.size,
      sha256: createHash('sha256').update(buffer).digest('hex'),
      uploaded_by: req.user.nim
    });
    auditAdminMutation(req, 'asset.upload', 'asset', asset.id, { kind: asset.kind, mime_type: asset.mime_type, size: asset.size });
    res.status(201).json({ asset: { ...asset, url: `/api/site/assets/${asset.id}/file` } });
  } catch (error) {
    if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: 'Aset tidak dapat disimpan.' });
  }
});

app.get('/api/site/assets/:id/file', (req, res) => {
  const asset = db.getAsset(req.params.id);
  if (!asset) return res.status(404).end();
  const published = db.getSiteState().published;
  const publicReference = isAssetReferenced(published, asset.id);
  const ownAvatar = req.user?.avatar_silhouette === `/api/site/assets/${asset.id}/file`;
  if (!publicReference && !ownAvatar && req.user?.role !== 'superadmin') return res.status(404).end();
  const filePath = path.resolve(ASSET_DIR, asset.stored_name);
  if (!filePath.startsWith(`${ASSET_DIR}${path.sep}`) || !fs.existsSync(filePath)) return res.status(404).end();
  res.set({
    'Content-Type': asset.mime_type,
    'Content-Length': String(asset.size),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': publicReference ? 'public, max-age=31536000, immutable' : 'private, no-store',
    'Content-Disposition': `inline; filename="${asset.stored_name}"`
  });
  res.sendFile(filePath);
});

app.delete('/api/site/assets/:id', requireSuperadmin, (req, res) => {
  const asset = db.getAsset(req.params.id);
  if (!asset) return res.status(404).json({ error: 'Aset tidak ditemukan.' });
  const site = db.getSiteState();
  if (isAssetReferenced(site.draft, asset.id) || isAssetReferenced(site.published, asset.id)
    || db.isAssetReferencedByRevision(asset.id) || db.isAssetReferencedByUser(asset.id)) {
    return res.status(409).json({ error: 'Aset masih digunakan oleh draft, publikasi, atau versi yang dapat dipulihkan.' });
  }
  const filePath = path.resolve(ASSET_DIR, asset.stored_name);
  db.deleteAsset(asset.id);
  if (filePath.startsWith(`${ASSET_DIR}${path.sep}`) && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  auditAdminMutation(req, 'asset.delete', 'asset', asset.id, { kind: asset.kind, sha256: asset.sha256 });
  res.json({ message: 'ASET DIHAPUS' });
});

app.get('/api/admin/soundtracks', requireSuperadmin, (_req, res) => {
  res.json({ tracks: db.listSoundtracks(true) });
});

app.post('/api/admin/soundtracks', requireSuperadmin, (req, res) => {
  const { title, url } = req.body || {};
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 120 || typeof url !== 'string' || url.length > 2000) {
    return res.status(400).json({ error: 'Judul wajib diisi (maksimal 120 karakter) dan URL HTTPS wajib valid.' });
  }
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({ error: 'URL soundtrack harus berupa URL HTTPS yang valid.' });
  }
  if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password) {
    return res.status(400).json({ error: 'URL soundtrack harus HTTPS dan tidak boleh memuat kredensial.' });
  }
  const track = db.addSoundtrack({
    title: title.trim(),
    source_type: 'url',
    source_url: parsedUrl.toString(),
    stored_name: null,
    mime_type: null,
    size: null,
    sha256: null,
    uploaded_by: req.user.nim
  });
  auditAdminMutation(req, 'soundtrack.create_link', 'soundtrack', track.id, { source_type: 'url', host: parsedUrl.host });
  res.status(201).json({ track });
});

app.post('/api/admin/soundtracks/upload', requireSuperadmin, (req, res, next) => {
  soundtrackUpload.single('audio')(req, res, (error) => {
    if (!error) return next();
    res.status(error instanceof multer.MulterError ? 413 : 400).json({ error: error.message });
  });
}, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Pilih satu berkas audio.' });
  const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
  if (!title || title.length > 120) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Judul soundtrack wajib diisi dan maksimal 120 karakter.' });
  }
  const buffer = fs.readFileSync(req.file.path);
  const detected = soundtrackMagic(buffer, req.file.mimetype);
  if (!detected) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Isi berkas tidak sesuai dengan format audio yang diizinkan.' });
  }
  const storedName = `${randomUUID()}${detected.ext}`;
  const targetPath = path.join(SOUNDTRACK_DIR, storedName);
  try {
    fs.renameSync(req.file.path, targetPath);
    const track = db.addSoundtrack({
      title,
      source_type: 'upload',
      source_url: null,
      stored_name: storedName,
      mime_type: detected.mime,
      size: req.file.size,
      sha256: createHash('sha256').update(buffer).digest('hex'),
      uploaded_by: req.user.nim
    });
    auditAdminMutation(req, 'soundtrack.upload', 'soundtrack', track.id, { mime_type: track.mime_type, size: track.size, sha256: track.sha256 });
    res.status(201).json({ track });
  } catch (error) {
    console.error('[PRTS SOUNDTRACK UPLOAD ERROR]', error);
    if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: 'Soundtrack tidak dapat disimpan.' });
  }
});

app.post('/api/admin/soundtracks/reorder', requireSuperadmin, (req, res) => {
  const { track_ids: trackIds } = req.body || {};
  if (!Array.isArray(trackIds) || trackIds.length > 100
    || trackIds.some((id) => typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id))) {
    return res.status(400).json({ error: 'Urutan soundtrack tidak valid.' });
  }
  if (!db.reorderSoundtracks(trackIds)) {
    return res.status(409).json({ error: 'Katalog berubah. Muat ulang Site Studio lalu coba lagi.' });
  }
  auditAdminMutation(req, 'soundtrack.reorder', 'soundtrack_catalog', 'all', { count: trackIds.length });
  res.json({ tracks: db.listSoundtracks(true) });
});

app.put('/api/admin/soundtracks/:id', requireSuperadmin, (req, res) => {
  const { title, active, sort_order: sortOrder } = req.body || {};
  if ((title !== undefined && (typeof title !== 'string' || !title.trim() || title.trim().length > 120))
    || (active !== undefined && typeof active !== 'boolean')
    || (sortOrder !== undefined && (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 1000))) {
    return res.status(400).json({ error: 'Judul, status aktif, atau urutan soundtrack tidak valid.' });
  }
  const before = db.getSoundtrack(req.params.id);
  if (!before) return res.status(404).json({ error: 'Soundtrack tidak ditemukan.' });
  const track = db.updateSoundtrack(before.id, {
    ...(title !== undefined ? { title: title.trim() } : {}),
    ...(active !== undefined ? { active } : {}),
    ...(sortOrder !== undefined ? { sort_order: sortOrder } : {})
  });
  auditAdminMutation(req, 'soundtrack.update', 'soundtrack', track.id, {
    fields: Object.keys(req.body || {}).filter((field) => ['title', 'active', 'sort_order'].includes(field))
  });
  res.json({ track });
});

app.delete('/api/admin/soundtracks/:id', requireSuperadmin, (req, res) => {
  const track = db.getSoundtrack(req.params.id);
  if (!track) return res.status(404).json({ error: 'Soundtrack tidak ditemukan.' });
  if (track.active) return res.status(409).json({ error: 'Nonaktifkan soundtrack sebelum menghapusnya.' });
  if (!db.deleteSoundtrack(track.id)) return res.status(409).json({ error: 'Soundtrack tidak dapat dihapus.' });
  if (track.stored_name) {
    const filePath = path.resolve(SOUNDTRACK_DIR, track.stored_name);
    if (filePath.startsWith(`${SOUNDTRACK_DIR}${path.sep}`) && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  auditAdminMutation(req, 'soundtrack.delete', 'soundtrack', track.id, { source_type: track.source_type, sha256: track.sha256 });
  res.json({ message: 'SOUNDTRACK DIHAPUS' });
});


};
