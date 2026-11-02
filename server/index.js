/* ==========================================================================
   HMIF UNIVERSITAS MAYASARI BAKTI - PRTS REST API SERVER
   Port: 3001
   ========================================================================== */

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import multer from 'multer';
import { db } from './db.js';
import { PAGE_BLOCKS, configReferencesAsset, validateSiteConfig } from './siteSchema.js';

const app = express();
const PORT = Number(process.env.PORT || 3001);
const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const ASSET_DIR = path.resolve(process.env.ASSET_STORAGE_DIR || path.join(SERVER_DIR, '../data/site-assets'));
const ASSET_TMP_DIR = path.join(ASSET_DIR, '.incoming');
fs.mkdirSync(ASSET_TMP_DIR, { recursive: true });
const JWT_SECRET = process.env.JWT_SECRET;
const COOKIE_NAME = 'prts_session';
const SESSION_MAX_AGE = 2 * 60 * 60 * 1000;
const isProduction = process.env.NODE_ENV === 'production';
const allowPublicRegistration = process.env.ALLOW_PUBLIC_REGISTRATION === 'true';
const allowedOrigins = new Set(
  (process.env.FRONTEND_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);

if (!JWT_SECRET || Buffer.byteLength(JWT_SECRET, 'utf8') < 32) {
  throw new Error('JWT_SECRET wajib diisi dengan minimal 32 byte acak.');
}
if (isProduction && !process.env.FRONTEND_ORIGINS) {
  throw new Error('FRONTEND_ORIGINS wajib diatur di production.');
}
if (isProduction && !process.env.ASSET_STORAGE_DIR) {
  throw new Error('ASSET_STORAGE_DIR wajib diarahkan ke volume aset production terpisah.');
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: 'Terlalu banyak percobaan. Coba lagi nanti.' })
});
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: 'Batas pendaftaran tercapai. Coba lagi nanti.' })
});
const aspirationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: 'Batas pengiriman aspirasi tercapai. Coba lagi nanti.' })
});
const assetUpload = multer({
  dest: ASSET_TMP_DIR,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const supportedMime = ['image/png', 'image/jpeg', 'image/webp', 'font/woff2', 'font/ttf', 'font/otf'];
    callback(supportedMime.includes(file.mimetype) ? null : new Error('Hanya gambar PNG/JPEG/WebP dan font WOFF2/TTF/OTF yang didukung.'), supportedMime.includes(file.mimetype));
  }
});

app.use(cors({
  origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)),
  credentials: true
}));
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());
app.use((req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  if (!req.get('origin') || !allowedOrigins.has(req.get('origin'))) {
    return res.status(403).json({ error: 'Origin tidak diizinkan.' });
  }
  next();
});

const setSessionCookie = (res, token) => {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_MAX_AGE
  });
};

// --------------------------------------------------------------------------
// AUTH & RBAC MIDDLEWARES
// --------------------------------------------------------------------------
const authenticateToken = (req, res, next) => {
  req.user = null;
  const token = req.cookies[COOKIE_NAME];
  if (!token) return next();

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.findUserByNIM(decoded.sub);
    if (!user || (user.session_version || 0) !== (decoded.ver || 0)) {
      res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: isProduction, sameSite: 'strict', path: '/' });
      return next();
    }
    const { password_hash, ...safeUser } = user;
    req.user = safeUser;
  } catch {
    res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: isProduction, sameSite: 'strict', path: '/' });
  }
  next();
};

const requireAuth = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Silakan masuk untuk melanjutkan.' });
  next();
};

const requireSuperadmin = (req, res, next) => {
  if (req.user?.role !== 'superadmin') {
    return res.status(req.user ? 403 : 401).json({ error: 'Akses superadmin diperlukan.' });
  }
  next();
};

const requireClearance = (minLevel) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Silakan masuk untuk melanjutkan.' });
    if (req.user.role === 'superadmin') return next();
    if (minLevel >= 4) return res.status(403).json({ error: 'Akses superadmin diperlukan.' });
    const userLevel = req.user.clearance_level;
    if (userLevel < minLevel) {
      return res.status(403).json({
        error: `ACCESS DENIED // PRTS SECURITY PROTOCOL: Diperlukan Clearance Level ${minLevel} atau lebih tinggi. Level Anda saat ini: Level ${userLevel}.`
      });
    }
    next();
  };
};

const validDate = (value) => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

const validateProker = (data, partial = false) => {
  const required = partial ? [] : ['title', 'division', 'date_start'];
  for (const key of required) {
    if (typeof data[key] !== 'string' || !data[key].trim()) return `Kolom ${key} wajib diisi.`;
  }
  for (const key of ['title', 'division', 'category', 'target_participants', 'kpi_indicator', 'lpj_notes']) {
    if (data[key] !== undefined && (typeof data[key] !== 'string' || data[key].length > (key === 'lpj_notes' ? 3000 : 500))) {
      return `Kolom ${key} tidak valid atau terlalu panjang.`;
    }
  }
  if (data.status !== undefined && !['upcoming', 'active', 'completed'].includes(data.status)) {
    return 'Status program kerja tidak valid.';
  }
  if (data.date_start !== undefined && !validDate(data.date_start)) return 'Tanggal mulai tidak valid.';
  if (data.date_end !== undefined && !validDate(data.date_end)) return 'Tanggal selesai tidak valid.';
  if (data.date_start && data.date_end && data.date_end < data.date_start) return 'Tanggal selesai tidak boleh sebelum tanggal mulai.';
  if (data.budget_allocated !== undefined && (!Number.isSafeInteger(Number(data.budget_allocated)) || Number(data.budget_allocated) < 0)) {
    return 'Anggaran harus berupa bilangan bulat positif.';
  }
  return null;
};

app.use(authenticateToken);

const hasPermission = (user, level = 0) => user?.role === 'superadmin' || (user?.clearance_level || 0) >= level;

const assetMagic = (buffer) => {
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    if (buffer.length < 33 || buffer.readUInt32BE(8) !== 13 || buffer.toString('ascii', 12, 16) !== 'IHDR') return null;
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    if (!width || !height || width > 8192 || height > 8192 || buffer.indexOf('IEND') < 0) return null;
    return { mime: 'image/png', kind: 'image', ext: '.png' };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9) {
    let offset = 2;
    while (offset + 4 < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (length < 2 || offset + 2 + length > buffer.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        const height = buffer.readUInt16BE(offset + 5);
        const width = buffer.readUInt16BE(offset + 7);
        if (width && height && width <= 8192 && height <= 8192) return { mime: 'image/jpeg', kind: 'image', ext: '.jpg' };
        break;
      }
      offset += 2 + length;
    }
    return null;
  }
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP' && buffer.readUInt32LE(4) === buffer.length - 8) {
    return { mime: 'image/webp', kind: 'image', ext: '.webp' };
  }
  if (buffer.toString('ascii', 0, 4) === 'wOF2') return { mime: 'font/woff2', kind: 'font', ext: '.woff2' };
  if (buffer.toString('ascii', 0, 4) === 'OTTO') return { mime: 'font/otf', kind: 'font', ext: '.otf' };
  if (buffer.subarray(0, 4).equals(Buffer.from([0x00, 0x01, 0x00, 0x00]))) return { mime: 'font/ttf', kind: 'font', ext: '.ttf' };
  return null;
};

const isAssetReferenced = (config, assetId) => configReferencesAsset(config, assetId);

const auditAdminMutation = (req, action, targetType, targetId, details = {}) => {
  db.insertAudit({ actorNim: req.user.nim, actorRole: req.user.role, action, targetType, targetId, details });
};

app.get('/api/site/config', (req, res) => {
  const state = db.getSiteState();
  if (req.query.preview === 'draft') {
    if (req.user?.role !== 'superadmin') return res.status(req.user ? 403 : 401).json({ error: 'Pratinjau draft hanya tersedia untuk superadmin.' });
    return res.json({ config: state.draft, revision_id: state.draftRevisionId, preview: true });
  }
  res.set('Cache-Control', 'no-store');
  res.json({ config: state.published, revision_id: state.publishedRevisionId, preview: false });
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
  if (!isAssetReferenced(published, asset.id) && req.user?.role !== 'superadmin') return res.status(404).end();
  const filePath = path.resolve(ASSET_DIR, asset.stored_name);
  if (!filePath.startsWith(`${ASSET_DIR}${path.sep}`) || !fs.existsSync(filePath)) return res.status(404).end();
  res.set({
    'Content-Type': asset.mime_type,
    'Content-Length': String(asset.size),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Content-Disposition': `inline; filename="${asset.stored_name}"`
  });
  res.sendFile(filePath);
});

app.delete('/api/site/assets/:id', requireSuperadmin, (req, res) => {
  const asset = db.getAsset(req.params.id);
  if (!asset) return res.status(404).json({ error: 'Aset tidak ditemukan.' });
  const site = db.getSiteState();
  if (isAssetReferenced(site.draft, asset.id) || isAssetReferenced(site.published, asset.id) || db.isAssetReferencedByRevision(asset.id)) {
    return res.status(409).json({ error: 'Aset masih digunakan oleh draft, publikasi, atau versi yang dapat dipulihkan.' });
  }
  const filePath = path.resolve(ASSET_DIR, asset.stored_name);
  db.deleteAsset(asset.id);
  if (filePath.startsWith(`${ASSET_DIR}${path.sep}`) && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  auditAdminMutation(req, 'asset.delete', 'asset', asset.id, { kind: asset.kind, sha256: asset.sha256 });
  res.json({ message: 'ASET DIHAPUS' });
});

app.get('/api/admin/audit', requireSuperadmin, (req, res) => {
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 100, 500));
  res.json({ entries: db.listAudit(limit) });
});

// --------------------------------------------------------------------------
// 1. AUTHENTICATION & CLEARANCE ROUTES
// --------------------------------------------------------------------------

// POST /api/auth/login
app.post('/api/auth/login', authLimiter, (req, res) => {
  const { nim, password } = req.body;
  if (typeof nim !== 'string' || typeof password !== 'string' || !nim.trim() || !password || password.length > 256) {
    return res.status(400).json({ error: 'NIM dan Password wajib diisi.' });
  }

  const user = db.findUserByNIM(nim);
  if (!user) {
    return res.status(401).json({ error: 'NIM tidak terdaftar dalam database PRTS.' });
  }

  const match = bcrypt.compareSync(password, user.password_hash);
  if (!match) {
    return res.status(401).json({ error: 'Kredensial tidak valid. Password salah.' });
  }

  const payload = { sub: user.nim, ver: user.session_version || 0 };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '2h' });
  const { password_hash, ...safeUser } = user;
  setSessionCookie(res, token);

  res.json({
    message: 'LOGIN BERHASIL // PRTS TERMINAL ACCESS GRANTED',
    user: safeUser
  });
});

// POST /api/auth/register (Pendaftaran Mahasiswa / Calon Kader)
app.post('/api/auth/register', registrationLimiter, (req, res) => {
  if (!allowPublicRegistration) {
    return res.status(403).json({ error: 'Pendaftaran publik sedang dinonaktifkan.' });
  }
  const { nim, name, password, generation, division } = req.body;
  if (typeof nim !== 'string' || !/^[a-zA-Z0-9._-]{3,32}$/.test(nim)
    || typeof name !== 'string' || !name.trim() || name.length > 120
    || typeof password !== 'string' || password.length < 12 || password.length > 256) {
    return res.status(400).json({ error: 'NIM, Nama Lengkap, dan password minimal 12 karakter wajib diisi.' });
  }

  const result = db.createUser({
    nim,
    name,
    password,
    generation: generation || '2026',
    division: division || 'Kader Mahasiswa',
    membership_stage: 'Calon Kader',
    clearance_level: 1,
    role_title: 'Kader Muda'
  });

  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  res.status(201).json({
    message: 'REGISTRASI BERHASIL // KADER TERDAFTAR DI PRTS CORE',
    user: result
  });
});

app.post('/api/auth/logout', (req, res) => {
  if (req.user && !db.invalidateSessions(req.user.nim)) {
    return res.status(500).json({ error: 'Sesi tidak dapat dicabut. Silakan coba lagi.' });
  }
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: isProduction, sameSite: 'strict', path: '/' });
  res.json({ message: 'SESI BERAKHIR' });
});

// GET /api/auth/me
app.get('/api/auth/me', (req, res) => {
  if (!req.user) {
    return res.json({
      authenticated: false,
      user: {
        name: 'Tamu Publik',
        clearance_level: 0,
        role_title: 'Public Guest'
      }
    });
  }

  res.json({
    authenticated: true,
    user: req.user
  });
});

// PUT /api/auth/change-password
app.put('/api/auth/change-password', requireClearance(1), (req, res) => {
  const { old_password, new_password } = req.body;
  if (!old_password || typeof new_password !== 'string' || new_password.length < 12) {
    return res.status(400).json({ error: 'Password baru minimal 12 karakter.' });
  }

  const user = db.findUserByNIM(req.user.nim);
  if (!user) {
    return res.status(404).json({ error: 'User tidak ditemukan.' });
  }

  if (!bcrypt.compareSync(old_password, user.password_hash)) {
    return res.status(401).json({ error: 'Password lama tidak cocok.' });
  }

  const updated = db.changePassword(req.user.nim, new_password);
  if (!updated) {
    return res.status(500).json({ error: 'Gagal mengubah password.' });
  }

  auditAdminMutation(req, 'user.password_change', 'user', req.user.nim, {});
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: isProduction, sameSite: 'strict', path: '/' });
  res.json({ message: 'PASSWORD BERHASIL DIUBAH // PRTS SECURITY UPDATED' });
});

// --------------------------------------------------------------------------
// 2. CADETS MANAGEMENT (PILAR 4)
// --------------------------------------------------------------------------

// GET /api/cadets (List Cadets)
app.get('/api/cadets', requireClearance(2), (req, res) => {
  const cadets = db.getAllCadets();
  res.json(cadets);
});

// PUT /api/cadets/:nim/stage (Promote Kader, Clearance Level >= 2)
app.put('/api/cadets/:nim/stage', requireClearance(3), (req, res) => {
  const { stage } = req.body;
  if (typeof stage !== 'string' || !stage.trim()) {
    return res.status(400).json({ error: 'Jenjang kaderisasi wajib diisi.' });
  }
  const updated = db.updateCadetStage(req.params.nim, stage.trim());
  if (!updated) {
    return res.status(404).json({ error: 'Kader tidak ditemukan.' });
  }
  auditAdminMutation(req, 'cadet.stage_update', 'user', updated.nim, { membership_stage: updated.membership_stage });
  res.json({
    message: `JENJANG KADERISASI DIPERBARUI // STATUS: ${stage}`,
    cadet: updated
  });
});

// POST /api/cadet/quiz-eval (Save Quiz Score & Rank)
app.post('/api/cadet/quiz-eval', requireAuth, (req, res) => {
  const { score } = req.body;
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    return res.status(400).json({ error: 'Nilai evaluasi harus antara 0 dan 100.' });
  }
  const saved = db.saveQuizEvaluation({
    nim: req.user.nim,
    score,
    rank_title: score >= 80 ? 'KADER MADYA' : score >= 60 ? 'KADER PRATAMA' : 'KADER MUDA',
    clearance_awarded: 0
  });
  res.json({
    message: 'HASIL EVALUASI TERSIMPAN // SERTIFIKASI DIGITAL DITERBITKAN',
    evaluation: saved
  });
});

// GET /api/cadets/:nim/kta (KTA Digital - Kartu Tanda Anggota)
app.get('/api/cadets/:nim/kta', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Silakan masuk untuk melihat KTA.' });
  if (req.user.nim !== req.params.nim && req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'KTA hanya dapat dilihat pemilik atau administrator.' });
  }
  const user = db.findUserByNIM(req.params.nim);
  if (!user) {
    return res.status(404).json({ error: 'Kader tidak ditemukan dalam database PRTS.' });
  }

  const { password_hash, ...sanitized } = user;

  // QR Code data payload (NIM + Name + Membership Stage)
  const qrPayload = JSON.stringify({
    nim: sanitized.nim,
    name: sanitized.name,
    division: sanitized.division,
    membership_stage: sanitized.membership_stage,
    clearance_level: sanitized.clearance_level,
    role_title: sanitized.role_title,
    code_name: sanitized.code_name,
    verified_at: new Date().toISOString(),
    issuer: 'PRTS-HMIF-UMB-CORE'
  });

  // Get evaluations for this cadet
  const evaluations = db.getCadetEvaluations(sanitized.nim);

  // Get attendance records
  const attendance = db.getCadetAttendance(sanitized.nim);

  res.json({
    kta: {
      ...sanitized,
      kta_number: `KTA-HMIF-${sanitized.nim}-${sanitized.generation}`,
      qr_payload: qrPayload,
      issued_at: sanitized.created_at,
      valid_until: `${parseInt(sanitized.generation) + 4}-08-31`,
      evaluations,
      attendance_count: attendance.length
    }
  });
});

// --------------------------------------------------------------------------
// 3. PROGRAM KERJA & LPJ GENERATOR (PILAR 5)
// --------------------------------------------------------------------------

// GET /api/proker
app.get('/api/proker', (req, res) => {
  const programs = db.getAllProker();
  if (req.user?.clearance_level >= 2) return res.json(programs);
  res.json(programs.map(({ budget_allocated, budget_spent, lpj_notes, ...publicProgram }) => publicProgram));
});

// POST /api/proker (Clearance Level >= 2)
app.post('/api/proker', requireClearance(2), (req, res) => {
  const validationError = validateProker(req.body);
  if (validationError) return res.status(400).json({ error: validationError });
  const newProker = db.createProker(req.body);
  auditAdminMutation(req, 'proker.create', 'proker', newProker.id, { division: newProker.division, status: newProker.status });
  res.status(201).json({
    message: 'MISI PROGRAM KERJA BERHASIL DIDAFTARKAN KE PRTS',
    proker: newProker
  });
});

// PUT /api/proker/:id (Clearance Level >= 2)
app.put('/api/proker/:id', requireClearance(2), (req, res) => {
  const allowedFields = [
    'title', 'division', 'category', 'status', 'date_start', 'date_end',
    'target_participants', 'kpi_indicator', 'lpj_notes', 'budget_allocated'
  ];
  const updates = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowedFields.includes(key)));
  const validationError = validateProker(updates, true);
  if (validationError) return res.status(400).json({ error: validationError });
  const updated = db.updateProker(req.params.id, updates);
  if (!updated) {
    return res.status(404).json({ error: 'Misi proker tidak ditemukan.' });
  }
  auditAdminMutation(req, 'proker.update', 'proker', updated.id, { fields: Object.keys(updates) });
  res.json({
    message: 'UPDATE MISI BERHASIL // TELEMETRI DIPERBARUI',
    proker: updated
  });
});

// GET /api/proker/lpj-summary (LPJ Report Data for BPH)
app.get('/api/proker/lpj-summary', requireClearance(3), (req, res) => {
  const prokerList = db.getAllProker();
  const totalMissions = prokerList.length;
  const completedMissions = prokerList.filter((p) => p.status === 'completed').length;
  const activeMissions = prokerList.filter((p) => p.status === 'active').length;
  const upcomingMissions = prokerList.filter((p) => p.status === 'upcoming').length;

  const totalAllocated = prokerList.reduce((acc, p) => acc + (p.budget_allocated || 0), 0);
  const totalSpent = prokerList.reduce((acc, p) => acc + (p.budget_spent || 0), 0);
  const budgetEfficiency = totalAllocated > 0 ? Math.round((totalSpent / totalAllocated) * 100) : 0;

  // Division breakdown
  const divisionBreakdown = {};
  prokerList.forEach((p) => {
    if (!divisionBreakdown[p.division]) {
      divisionBreakdown[p.division] = { total: 0, completed: 0, allocated: 0, spent: 0 };
    }
    divisionBreakdown[p.division].total++;
    if (p.status === 'completed') divisionBreakdown[p.division].completed++;
    divisionBreakdown[p.division].allocated += (p.budget_allocated || 0);
    divisionBreakdown[p.division].spent += (p.budget_spent || 0);
  });

  res.json({
    period: 'Periode 2026/2027',
    kabinet: 'VANGUARD INOVASI',
    generated_at: new Date().toISOString(),
    metrics: {
      totalMissions,
      completedMissions,
      activeMissions,
      upcomingMissions,
      completionRate: totalMissions > 0 ? Math.round((completedMissions / totalMissions) * 100) : 0,
      totalAllocated,
      totalSpent,
      budgetEfficiency
    },
    divisionBreakdown,
    missions: prokerList
  });
});

// --------------------------------------------------------------------------
// 4. INTEGRATED ACADEMIC CALENDAR & CHRONO-SYNC (PILAR 3)
// --------------------------------------------------------------------------

// GET /api/calendar
app.get('/api/calendar', (req, res) => {
  res.json(db.getAllCalendarEvents());
});

// POST /api/calendar (Clearance Level >= 2)
app.post('/api/calendar', requireClearance(2), (req, res) => {
  const { date_str, title, division, location, desc } = req.body;
  if (!validDate(date_str) || typeof title !== 'string' || !title.trim() || title.length > 180) {
    return res.status(400).json({ error: 'Tanggal dan nama kegiatan yang valid wajib diisi.' });
  }
  if ([division, location, desc].some((value) => value !== undefined && (typeof value !== 'string' || value.length > 3000))) {
    return res.status(400).json({ error: 'Data kalender tidak valid atau terlalu panjang.' });
  }
  const event = db.createCalendarEvent(req.body);
  auditAdminMutation(req, 'calendar.create', 'calendar_event', event.id, { date: event.date_str, type: event.type });
  res.status(201).json({
    message: 'AGENDA BERHASIL DITAMBAHKAN KE KALENDER TERPADU',
    event
  });
});

// GET /api/calendar/clash-check (Clash Detector against Exam Weeks)
app.get('/api/calendar/clash-check', (req, res) => {
  const events = db.getAllCalendarEvents();
  const prokerList = db.getAllProker();

  const examPeriods = events.filter((e) => e.is_exam_period);
  const clashes = [];

  // Build exam date ranges (7-day window around exam date)
  const examRanges = examPeriods.map((exam) => {
    const examDate = new Date(exam.date_str);
    const rangeStart = new Date(examDate);
    rangeStart.setDate(rangeStart.getDate() - 3);
    const rangeEnd = new Date(examDate);
    rangeEnd.setDate(rangeEnd.getDate() + 7);
    return {
      exam,
      start: rangeStart.toISOString().split('T')[0],
      end: rangeEnd.toISOString().split('T')[0]
    };
  });

  prokerList.forEach((p) => {
    if (!p.date_start) return;

    examRanges.forEach(({ exam, start, end }) => {
      const prokerStart = p.date_start;
      const prokerEnd = p.date_end || p.date_start;

      // Check overlap
      if (prokerStart <= end && prokerEnd >= start) {
        clashes.push({
          proker_id: p.id,
          proker_title: p.title,
          proker_division: p.division,
          proker_dates: `${prokerStart} s/d ${prokerEnd}`,
          exam_name: exam.title,
          exam_date: exam.date_str,
          exam_window: `${start} s/d ${end}`,
          severity: prokerStart >= start && prokerStart <= exam.date_str ? 'CRITICAL' : 'HIGH',
          message: `PERINGATAN: Program kerja '${p.title}' (${p.division}) berada pada masa '${exam.title}' (${exam.date_str}). Berpotensi melanggar ketentuan masa tenang ujian!`
        });
      }
    });
  });

  res.json({
    status: clashes.length > 0 ? 'CLASH DETECTED' : 'CLEAR',
    total_clashes: clashes.length,
    checked_at: new Date().toISOString(),
    exam_periods: examPeriods.map((e) => ({ title: e.title, date: e.date_str })),
    clashes
  });
});

// GET /api/calendar/export-ics (RFC 5545 iCalendar Download)
app.get('/api/calendar/export-ics', (req, res) => {
  const events = db.getAllCalendarEvents();
  const { filter } = req.query; // Optional: 'academic', 'psdm', 'litbang', etc.

  const filtered = filter
    ? events.filter((e) => e.type === filter || e.division.toLowerCase().includes(filter.toLowerCase()))
    : events;

  let icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HMIF Universitas Mayasari Bakti//PRTS Chrono Calendar//ID',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Kalender Akademik & Proker HMIF UMB',
    'X-WR-TIMEZONE:Asia/Jakarta'
  ];

  filtered.forEach((ev) => {
    const dateFormatted = ev.date_str.replace(/-/g, '');
    const uid = `${ev.id}@hmif.mayasaribakti.ac.id`;
    const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    icsLines.push('BEGIN:VEVENT');
    icsLines.push(`UID:${uid}`);
    icsLines.push(`DTSTAMP:${now}`);
    icsLines.push(`DTSTART;VALUE=DATE:${dateFormatted}`);
    icsLines.push(`SUMMARY:[HMIF UMB] ${ev.title}`);
    icsLines.push(`DESCRIPTION:${(ev.desc || '').replace(/\n/g, '\\n')} | Divisi: ${ev.division} | Integrasi: ${ev.integrated_with || '-'}`);
    icsLines.push(`LOCATION:${ev.location || 'Kampus UMB'}`);
    icsLines.push(`CATEGORIES:${ev.type.toUpperCase()}`);
    icsLines.push('STATUS:CONFIRMED');
    icsLines.push('END:VEVENT');
  });

  icsLines.push('END:VCALENDAR');

  const icsContent = icsLines.join('\r\n');

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="kalender_hmif_umb${filter ? '_' + filter : ''}.ics"`);
  res.send(icsContent);
});

// --------------------------------------------------------------------------
// 5. ASPIRASI & FEEDBACK DISPATCH DESK (PILAR 1 & 2)
// --------------------------------------------------------------------------

// GET /api/aspirations
app.get('/api/aspirations', requireClearance(3), (req, res) => {
  res.json(db.getAllAspirations());
});

// POST /api/aspirations (Public / Kader)
app.post('/api/aspirations', aspirationLimiter, (req, res) => {
  const { sender, category, message } = req.body;
  if (typeof message !== 'string' || !message.trim() || message.length > 5000) {
    return res.status(400).json({ error: 'Pesan aspirasi wajib diisi dan maksimal 5000 karakter.' });
  }
  const senderInfo = req.user && req.user.clearance_level > 0
    ? `${req.user.name} (${req.user.nim})`
    : (sender || 'Anonim (Mahasiswa)');

  const safeSender = typeof senderInfo === 'string' ? senderInfo.slice(0, 120) : 'Anonim (Mahasiswa)';
  const safeCategory = typeof category === 'string' ? category.slice(0, 120) : 'Umum';
  const created = db.createAspiration({ sender: safeSender, category: safeCategory, message: message.trim() });
  res.status(201).json({
    message: 'TRANSMISI BERHASIL // ASPIRASI DITERIMA PRTS UMB',
    aspiration: created
  });
});

// PUT /api/aspirations/:id/respond (Clearance Level >= 3: BPH & Kahim)
app.put('/api/aspirations/:id/respond', requireClearance(3), (req, res) => {
  const { response, status } = req.body;
  if (typeof response !== 'string' || !response.trim() || response.length > 3000) {
    return res.status(400).json({ error: 'Tanggapan BPH wajib diisi dan maksimal 3000 karakter.' });
  }
  if (status !== undefined && !['Ditinjau', 'Ditindaklanjuti', 'Selesai'].includes(status)) {
    return res.status(400).json({ error: 'Status aspirasi tidak valid.' });
  }
  const responderInfo = req.user ? `${req.user.role_title} (${req.user.name})` : 'BPH HMIF';
  const updated = db.respondAspiration(req.params.id, response, status || 'Ditindaklanjuti', responderInfo);
  if (!updated) {
    return res.status(404).json({ error: 'Aspirasi tidak ditemukan.' });
  }
  auditAdminMutation(req, 'aspiration.respond', 'aspiration', updated.id, { status: updated.status });
  res.json({
    message: 'TANGGAPAN RESMI BPH BERHASIL DITERBITKAN',
    aspiration: updated
  });
});

// --------------------------------------------------------------------------
// 6. FINANCIAL TRANSPARENCY LEDGER (PILAR 5: BENDAHARA UMUM)
// --------------------------------------------------------------------------

// GET /api/ledger
app.get('/api/ledger', requireClearance(3), (req, res) => {
  res.json(db.getFinancialLedger());
});

// POST /api/ledger (Clearance Level >= 3: BPH / Bendum)
app.post('/api/ledger', requireClearance(3), (req, res) => {
  const { date, type, category, description, amount, division } = req.body;
  if (!['INCOME', 'EXPENSE'].includes(type) || !Number.isSafeInteger(Number(amount)) || Number(amount) <= 0
    || typeof description !== 'string' || !description.trim() || description.length > 240) {
    return res.status(400).json({ error: 'Jenis, nominal bilangan bulat, dan keterangan transaksi valid wajib diisi.' });
  }

  const newTx = db.addFinancialTransaction({
    date,
    type,
    category: category || 'Umum',
    description,
    amount,
    division,
    recorded_by: req.user ? `${req.user.role_title} (${req.user.name})` : 'Bendahara Umum'
  });
  auditAdminMutation(req, 'ledger.create', 'financial_transaction', newTx.id, { type: newTx.type, amount: newTx.amount, division: newTx.division });

  res.status(201).json({
    message: 'TRANSAKSI BERHASIL DIBUKUKAN KE BUKU KAS PRTS',
    transaction: newTx
  });
});

// --------------------------------------------------------------------------
// 7. ATTENDANCE / PRESENSI QR-CODE (PILAR 4)
// --------------------------------------------------------------------------

// POST /api/attendance (Record attendance via QR scan)
app.post('/api/attendance', requireAuth, (req, res) => {
  const { event_id } = req.body;
  if (!event_id) {
    return res.status(400).json({ error: 'Event ID wajib diisi.' });
  }

  const nim = req.user.nim;
  const user = db.findUserByNIM(nim);
  if (!user) {
    return res.status(404).json({ error: 'NIM tidak terdaftar.' });
  }

  const record = db.recordAttendance({
    event_id,
    nim,
    name: user.name,
    division: user.division,
    scanned_at: new Date().toISOString()
  });

  if (record.error) {
    return res.status(409).json({ error: record.error });
  }

  res.status(201).json({
    message: `PRESENSI TERCATAT // ${user.name} (${nim})`,
    attendance: record
  });
});

// GET /api/attendance/:eventId
app.get('/api/attendance/:eventId', requireClearance(2), (req, res) => {
  const records = db.getAttendanceByEvent(req.params.eventId);
  res.json({
    event_id: req.params.eventId,
    total: records.length,
    records
  });
});

// --------------------------------------------------------------------------
// 8. ADMIN ROUTES (CLEARANCE LEVEL 4: WEBMASTER)
// --------------------------------------------------------------------------

// GET /api/admin/users (List all users)
app.get('/api/admin/users', requireClearance(4), (req, res) => {
  const users = db.getAllCadets();
  res.json({
    total: users.length,
    users
  });
});

app.post('/api/admin/users', requireClearance(4), (req, res) => {
  const { nim, name, password, generation, division } = req.body;
  if (typeof nim !== 'string' || !/^[a-zA-Z0-9._-]{3,32}$/.test(nim)
    || typeof name !== 'string' || !name.trim() || name.length > 120
    || typeof password !== 'string' || password.length < 12 || password.length > 256
    || (generation !== undefined && generation !== '' && (typeof generation !== 'string' || !/^\d{4}$/.test(generation)))
    || (division !== undefined && (typeof division !== 'string' || division.length > 80))) {
    return res.status(400).json({ error: 'NIM, nama, password minimal 12 karakter, atau data anggota tidak valid.' });
  }

  const user = db.createUser({
    nim,
    name: name.trim(),
    password,
    generation,
    division,
    membership_stage: 'Calon Kader',
    role_title: 'Kader Pratama',
    clearance_level: 1
  });
  if (user.error) return res.status(409).json({ error: user.error });
  db.insertAudit({ actorNim: req.user.nim, actorRole: req.user.role, action: 'user.create', targetType: 'user', targetId: user.nim, details: { role: user.role, clearance_level: user.clearance_level } });
  res.status(201).json({ message: 'Akun anggota dibuat dengan clearance level 1.', user });
});

// PUT /api/admin/users/:nim (Update user clearance/role)
app.put('/api/admin/users/:nim', requireClearance(4), (req, res) => {
  const { clearance_level, role_title, division, membership_stage, code_name } = req.body;
  const target = db.findUserByNIM(req.params.nim);
  if (!target) return res.status(404).json({ error: 'User tidak ditemukan.' });
  if (clearance_level !== undefined && (!Number.isInteger(clearance_level) || clearance_level < 1 || clearance_level > 3)) {
    return res.status(400).json({ error: 'Clearance anggota harus berupa bilangan bulat dari 1 sampai 3; gunakan role khusus untuk superadmin.' });
  }
  if (target.role === 'superadmin' && clearance_level !== undefined) {
    return res.status(400).json({ error: 'Clearance superadmin tidak dapat diubah sebagai angka.' });
  }
  for (const value of [role_title, division, membership_stage, code_name]) {
    if (value !== undefined && (typeof value !== 'string' || value.length > 120)) {
      return res.status(400).json({ error: 'Kolom profil harus berupa teks maksimal 120 karakter.' });
    }
  }
  const updated = db.updateUserAdmin(req.params.nim, {
    clearance_level,
    role_title,
    division,
    membership_stage,
    code_name
  }, req.user);

  if (!updated) {
    return res.status(404).json({ error: 'User tidak ditemukan.' });
  }

  res.json({
    message: `PROFIL USER DIPERBARUI OLEH ADMIN // ${req.params.nim}`,
    user: updated
  });
});

app.put('/api/admin/users/:nim/role', requireSuperadmin, (req, res) => {
  const { role } = req.body;
  if (!['member', 'superadmin'].includes(role)) return res.status(400).json({ error: 'Role tidak valid.' });
  const target = db.findUserByNIM(req.params.nim);
  if (!target) return res.status(404).json({ error: 'User tidak ditemukan.' });
  if (target.nim === req.user.nim && role !== 'superadmin') return res.status(400).json({ error: 'Superadmin aktif tidak dapat menurunkan rolenya sendiri.' });
  if (target.role === 'superadmin' && role !== 'superadmin' && db.getAdminCount() <= 1) {
    return res.status(409).json({ error: 'Setidaknya satu superadmin harus tetap aktif.' });
  }
  const updated = db.updateUserRole(req.params.nim, role, req.user);
  if (!updated) return res.status(500).json({ error: 'Role tidak dapat diperbarui.' });
  res.json({ message: 'ROLE DIPERBARUI', user: updated });
});

// DELETE /api/admin/users/:nim (Remove user)
app.delete('/api/admin/users/:nim', requireClearance(4), (req, res) => {
  // Prevent self-deletion
  if (req.user.nim === req.params.nim) {
    return res.status(400).json({ error: 'Tidak dapat menghapus akun sendiri.' });
  }

  const target = db.findUserByNIM(req.params.nim);
  if (target?.role === 'superadmin' && db.getAdminCount() <= 1) {
    return res.status(409).json({ error: 'Setidaknya satu akun administrator harus tetap aktif.' });
  }

  const deleted = db.deleteUser(req.params.nim);
  if (!deleted) {
    return res.status(404).json({ error: 'User tidak ditemukan.' });
  }
  auditAdminMutation(req, 'user.delete', 'user', req.params.nim, {});

  res.json({
    message: `USER ${req.params.nim} DIHAPUS DARI DATABASE PRTS`,
    nim: req.params.nim
  });
});

// GET /api/admin/backup (Full system backup as JSON)
app.get('/api/admin/backup', requireClearance(4), (req, res) => {
  const backup = db.getFullBackup();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="prts_backup_${timestamp}.json"`);
  res.json({
    backup_info: {
      generated_at: new Date().toISOString(),
      generated_by: req.user.name,
      system: 'PRTS HMIF UMB v4.2.0'
    },
    data: backup
  });
});

// GET /api/admin/stats (System statistics dashboard)
app.get('/api/admin/stats', requireClearance(4), (req, res) => {
  const stats = db.getSystemStats();
  res.json(stats);
});

// --------------------------------------------------------------------------
// SERVER LISTEN
// --------------------------------------------------------------------------
export const server = app.listen(PORT, () => {
  console.log(`[PRTS API SERVER] Running on port http://localhost:${PORT}`);
  console.log(`[PRTS SECURITY] RBAC Clearance System Online. Ready for telemetries.`);
  console.log(`[PRTS MODULES] Auth | Cadets | Proker | Calendar | Aspirasi | Ledger | Attendance | Admin`);
});
