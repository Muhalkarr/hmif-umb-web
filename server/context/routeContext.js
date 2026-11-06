/* ==========================================================================
   PRTS Route Context — Dependency Assembly
   Mengumpulkan semua konstanta, service, middleware, upload handlers,
   dan helper validator agar server/index.js menjadi murni bootstrap.
   ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import rateLimit from 'express-rate-limit';

import { db, getHmifCalendarDate } from '../db.js';
import { configReferencesAsset, validateSiteConfig } from '../siteSchema.js';
import { rankTutorCandidates, validateAcademicResource, validateLearningPath, validatePreferredSlots } from '../academicFeatures.js';
import { generateOfficeLetterNumber, validateOfficeLetter } from '../officeDocuments.js';
import { sendEventTicketEmail } from '../eventDelivery.js';
import { createAuditService } from '../services/auditService.js';
import { createNotificationService } from '../services/notificationService.js';
import { createWebPushService } from '../services/webPushService.js';
import { createUserRepository } from '../repositories/userRepository.js';
import { createSiteRepository } from '../repositories/siteRepository.js';
import { createAcademicRepository } from '../repositories/academicRepository.js';
import { createAuthMiddleware } from '../middleware/auth.js';
import { normalizeCareerSpecializations } from '../careerFeatures.js';
import { normalizeYoutubeEmbedUrl } from '../portfolioFeatures.js';

// ─── Paths & Directories ─────────────────────────────────────────────────────
const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url.replace('/context/', '/')));
const ASSET_DIR = path.resolve(process.env.ASSET_STORAGE_DIR || path.join(SERVER_DIR, '../data/site-assets'));
const ASSET_TMP_DIR = path.join(ASSET_DIR, '.incoming');
const KNOWLEDGE_DIR = path.join(ASSET_DIR, 'knowledge');
const KNOWLEDGE_TMP_DIR = path.join(ASSET_TMP_DIR, 'knowledge');
const SOUNDTRACK_DIR = path.join(ASSET_DIR, 'soundtracks');
const SOUNDTRACK_TMP_DIR = path.join(ASSET_TMP_DIR, 'soundtracks');
const RECEIPT_DIR = path.join(ASSET_DIR, 'receipts');
const RECEIPT_TMP_DIR = path.join(ASSET_TMP_DIR, 'receipts');

fs.mkdirSync(ASSET_TMP_DIR, { recursive: true });
fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });
fs.mkdirSync(KNOWLEDGE_TMP_DIR, { recursive: true });
fs.mkdirSync(SOUNDTRACK_DIR, { recursive: true });
fs.mkdirSync(SOUNDTRACK_TMP_DIR, { recursive: true });
fs.mkdirSync(RECEIPT_DIR, { recursive: true });
fs.mkdirSync(RECEIPT_TMP_DIR, { recursive: true });

// ─── Auth Constants ───────────────────────────────────────────────────────────
export const JWT_SECRET = process.env.JWT_SECRET;
export const COOKIE_NAME = 'prts_session';
export const SESSION_MAX_AGE = 2 * 60 * 60 * 1000;
export const isProduction = process.env.NODE_ENV === 'production';
export const allowPublicRegistration = process.env.ALLOW_PUBLIC_REGISTRATION === 'true';

// ─── Encryption ───────────────────────────────────────────────────────────────
const EVENT_TICKET_ENCRYPTION_KEY = createHash('sha256')
  .update('hmif-event-ticket-encryption-v1:')
  .update(process.env.EVENT_TICKET_ENCRYPTION_KEY || JWT_SECRET)
  .digest();

export const ASPIRATION_ENCRYPTION_KEY = createHash('sha256')
  .update('hmif-aspiration-encryption-v1:')
  .update(process.env.ASPIRATION_ENCRYPTION_KEY || JWT_SECRET)
  .digest();

export const GITHUB_STATS_CACHE_MS = 15 * 60 * 1000;
export const githubStatsCache = new Map();

export const encryptEventTicketToken = (token) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', EVENT_TICKET_ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
};

export const decryptEventTicketToken = (value) => {
  if (typeof value !== 'string') return null;
  try {
    const [iv, authTag, ciphertext] = value.split('.');
    const decipher = createDecipheriv('aes-256-gcm', EVENT_TICKET_ENCRYPTION_KEY, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(authTag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
};

// ─── Cookie Helper ────────────────────────────────────────────────────────────
export const setSessionCookie = (res, token) => {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_MAX_AGE
  });
};

// ─── Rate Limiters ────────────────────────────────────────────────────────────
const makeLimiter = (windowMs, limit, message) => rateLimit({
  windowMs, limit,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: message })
});

export const authLimiter = makeLimiter(15 * 60 * 1000, 10, 'Terlalu banyak percobaan. Coba lagi nanti.');
export const registrationLimiter = makeLimiter(60 * 60 * 1000, 5, 'Batas pendaftaran tercapai. Coba lagi nanti.');
export const aspirationLimiter = makeLimiter(60 * 60 * 1000, 8, 'Batas pengiriman aspirasi tercapai. Coba lagi nanti.');
export const aspirationTrackingLimiter = makeLimiter(60 * 60 * 1000, 20, 'Batas pemeriksaan tiket tercapai. Coba lagi nanti.');
export const eventRegistrationLimiter = makeLimiter(60 * 60 * 1000, 8, 'Batas pendaftaran event tercapai. Coba lagi nanti.');
export const knowledgeDiscussionLimiter = makeLimiter(60 * 60 * 1000, 8, 'Batas pengiriman diskusi tercapai. Coba lagi nanti.');
export const githubStatsLimiter = makeLimiter(60 * 60 * 1000, 60, 'Batas permintaan statistik GitHub tercapai. Coba lagi nanti.');
export const tutoringRequestLimiter = makeLimiter(60 * 60 * 1000, 3, 'Batas permintaan Klinik Koding tercapai. Coba lagi nanti.');

// ─── Multer Upload Handlers ───────────────────────────────────────────────────
export const assetUpload = multer({
  dest: ASSET_TMP_DIR,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const supportedMime = ['image/png', 'image/jpeg', 'image/webp', 'font/woff2', 'font/ttf', 'font/otf'];
    callback(supportedMime.includes(file.mimetype) ? null : new Error('Hanya gambar PNG/JPEG/WebP dan font WOFF2/TTF/OTF yang didukung.'), supportedMime.includes(file.mimetype));
  }
});

export const knowledgeFileUpload = multer({
  dest: KNOWLEDGE_TMP_DIR,
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => callback(
    file.mimetype === 'application/pdf' ? null : new Error('Hanya dokumen PDF yang didukung.'),
    file.mimetype === 'application/pdf'
  )
});

export const soundtrackUpload = multer({
  dest: SOUNDTRACK_TMP_DIR,
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const supportedMime = ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/aac'];
    callback(supportedMime.includes(file.mimetype) ? null : new Error('Audio harus berformat MP3, M4A/MP4, WAV, OGG, atau AAC.'), supportedMime.includes(file.mimetype));
  }
});

const receiptMimeTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
export const receiptUpload = multer({
  dest: RECEIPT_TMP_DIR,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => callback(
    receiptMimeTypes.has(file.mimetype) ? null : new Error('Bukti belanja harus berupa PDF, JPEG, PNG, atau WebP.'),
    receiptMimeTypes.has(file.mimetype)
  )
});

export const receiptExtension = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

export const isValidReceiptFile = (buffer, mimeType) => {
  if (mimeType === 'application/pdf') return buffer.subarray(0, 5).toString() === '%PDF-';
  if (mimeType === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return mimeType === 'image/webp'
    && buffer.subarray(0, 4).toString() === 'RIFF'
    && buffer.subarray(8, 12).toString() === 'WEBP';
};

// ─── File Magic Helpers ───────────────────────────────────────────────────────
export const assetMagic = (buffer) => {
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

export const isPdfDocument = (buffer) => buffer.length >= 12
  && buffer.toString('ascii', 0, 5) === '%PDF-'
  && buffer.subarray(Math.max(0, buffer.length - 2048)).includes(Buffer.from('%%EOF'));

export const soundtrackMagic = (buffer, declaredMime) => {
  const hasMpegFrame = (offset) => buffer.length >= offset + 4
    && buffer[offset] === 0xff
    && (buffer[offset + 1] & 0xe0) === 0xe0
    && (buffer[offset + 1] & 0x06) !== 0
    && ((buffer[offset + 2] >> 4) & 0x0f) > 0
    && ((buffer[offset + 2] >> 4) & 0x0f) < 0x0f
    && ((buffer[offset + 2] >> 2) & 0x03) !== 0x03;
  const hasId3Tag = buffer.length >= 14 && buffer.toString('ascii', 0, 3) === 'ID3'
    && buffer[3] >= 2 && buffer[3] <= 4
    && (buffer[5] & 0xe0) === 0
    && [6, 7, 8, 9].every((index) => (buffer[index] & 0x80) === 0);
  if (declaredMime === 'audio/mpeg') {
    if (hasId3Tag) {
      const tagSize = (buffer[6] << 21) | (buffer[7] << 14) | (buffer[8] << 7) | buffer[9];
      return 10 + tagSize <= buffer.length && hasMpegFrame(10 + tagSize)
        ? { mime: 'audio/mpeg', ext: '.mp3' }
        : null;
    }
    return hasMpegFrame(0) ? { mime: 'audio/mpeg', ext: '.mp3' } : null;
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE') {
    return ['audio/wav', 'audio/x-wav'].includes(declaredMime) ? { mime: 'audio/wav', ext: '.wav' } : null;
  }
  if (buffer.length >= 4 && buffer.toString('ascii', 0, 4) === 'OggS') {
    return declaredMime === 'audio/ogg' ? { mime: 'audio/ogg', ext: '.ogg' } : null;
  }
  if (buffer.length >= 8 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    return declaredMime === 'audio/mp4' ? { mime: 'audio/mp4', ext: '.m4a' } : null;
  }
  if (buffer.length >= 7 && buffer[0] === 0xff && (buffer[1] & 0xf6) === 0xf0) {
    return declaredMime === 'audio/aac' ? { mime: 'audio/aac', ext: '.aac' } : null;
  }
  return null;
};

// ─── Domain Validators ────────────────────────────────────────────────────────
export const validDate = (value) => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export const validateProker = (data, partial = false) => {
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

export const normalizePortalUrl = (value, label, optional = true) => {
  if (optional && (value === undefined || value === null || value === '')) return '';
  if (typeof value !== 'string' || value.length > 2000) throw new Error(`${label} tidak valid.`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} harus berupa URL HTTPS.`);
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error(`${label} harus HTTPS dan tidak boleh memuat kredensial.`);
  return parsed.toString();
};

export const validatePortalRecord = (kind, data = {}) => {
  const text = (key, limit, required = false) => {
    const value = data[key] ?? '';
    if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) {
      throw new Error(`${key} wajib diisi dan maksimal ${limit} karakter.`);
    }
    return value.trim();
  };

  if (kind === 'project') {
    const tags = data.tags ?? [];
    if (!Array.isArray(tags) || tags.length > 12 || tags.some((tag) => typeof tag !== 'string' || tag.length > 40)) {
      throw new Error('Tag proyek maksimal 12 item dan 40 karakter per item.');
    }
    const projectTypes = ['Tugas Akhir', 'Kerja Praktik', 'Lomba', 'Riset mandiri', 'Aplikasi web', 'Aplikasi mobile', 'IoT', 'Edge AI', 'UI/UX', 'Lainnya'];
    const projectType = data.project_type || 'Lainnya';
    if (!projectTypes.includes(projectType)) throw new Error('Jenis proyek tidak valid.');
    const videoUrl = data.video_url || data.video_embed_url || '';
    return {
      title: text('title', 160, true),
      author: text('author', 120, true),
      category: text('category', 80, true),
      project_type: projectType,
      description: text('description', 1200, true),
      repo_url: normalizePortalUrl(data.repo_url, 'URL repositori'),
      demo_url: normalizePortalUrl(data.demo_url, 'URL demo'),
      video_url: normalizePortalUrl(videoUrl, 'URL video'),
      video_embed_url: normalizeYoutubeEmbedUrl(videoUrl),
      tags: [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))]
    };
  }
  if (kind === 'alumni') {
    const graduationYear = text('graduation_year', 4, true);
    if (!/^\d{4}$/.test(graduationYear) || Number(graduationYear) > new Date().getFullYear() + 10) {
      throw new Error('Tahun kelulusan alumni tidak valid.');
    }
    for (const field of ['mentorship_available', 'speaker_available', 'referral_available']) {
      if (data[field] !== undefined && typeof data[field] !== 'boolean') throw new Error(`Status ${field} alumni tidak valid.`);
    }
    return {
      name: text('name', 120, true),
      graduation_year: graduationYear,
      company: text('company', 120, true),
      position: text('position', 120, true),
      location: text('location', 120),
      city: text('city', 100),
      province: text('province', 100),
      specialization: text('specialization', 160, true),
      mentorship_available: data.mentorship_available === true,
      speaker_available: data.speaker_available === true,
      referral_available: data.referral_available === true,
      profile_url: normalizePortalUrl(data.profile_url, 'URL profil profesional')
    };
  }
  if (kind === 'job') {
    const workType = text('work_type', 40, true);
    if (!['Magang', 'Penuh waktu', 'Paruh waktu', 'Kontrak'].includes(workType)) {
      throw new Error('Jenis kesempatan kerja tidak valid.');
    }
    const deadline = text('deadline', 10, true);
    if (!validDate(deadline)) throw new Error('Tanggal tenggat lowongan tidak valid.');
    const specialization = text('specialization', 160, true);
    const specializations = normalizeCareerSpecializations(data.specializations, specialization);
    return {
      title: text('title', 160, true),
      employer: text('employer', 120, true),
      specialization,
      specializations,
      location: text('location', 120, true),
      work_type: workType,
      deadline,
      url: normalizePortalUrl(data.url, 'URL lowongan', false)
    };
  }
  throw new Error('Jenis konten portal tidak valid.');
};

export const validatePortalConsent = (kind, data) => {
  if (kind === 'alumni' && data.consent !== true) {
    throw new Error('Persetujuan alumni wajib dikonfirmasi sebelum profil diajukan.');
  }
};

export const validateOrganizationTask = (data, existing = null) => {
  const merged = { ...existing, ...data };
  const picAccountId = merged.pic_account_id || null;
  const assignedUser = picAccountId ? db.findUserById(picAccountId) : null;
  const picName = assignedUser?.name || merged.pic_name;
  if (typeof merged.title !== 'string' || !merged.title.trim() || merged.title.trim().length > 180
    || typeof merged.description !== 'string' || merged.description.length > 2000
    || typeof picName !== 'string' || !picName.trim() || picName.trim().length > 120
    || (picAccountId && (!assignedUser || assignedUser.role === 'superadmin'))
    || !['todo', 'in_progress', 'review', 'done'].includes(merged.status)
    || (picAccountId !== null && typeof picAccountId !== 'string')
    || (merged.due_date !== null && merged.due_date !== '' && !validDate(merged.due_date))
    || (merged.proker_id !== null && merged.proker_id !== '' && (typeof merged.proker_id !== 'string' || merged.proker_id.length > 64))) {
    throw new Error('Judul, deskripsi, PIC, status, tanggal tenggat, atau program kerja tidak valid.');
  }
  const prokerId = merged.proker_id || null;
  if (prokerId && !db.getAllProker().some((proker) => proker.id === prokerId)) {
    throw new Error('Program kerja yang dipilih tidak ditemukan.');
  }
  return {
    title: merged.title.trim(),
    description: merged.description.trim(),
    pic_name: picName.trim(),
    pic_account_id: picAccountId,
    status: merged.status,
    due_date: merged.due_date || null,
    proker_id: prokerId
  };
};

// ─── Services & Repositories ──────────────────────────────────────────────────
export const auditService = createAuditService(db);
export const notificationService = createNotificationService(db);
export const webPushService = createWebPushService(db);
export const userRepository = createUserRepository(db);
export const siteRepository = createSiteRepository(db);
export const academicRepository = createAcademicRepository(db);
export const auditAdminMutation = auditService.record.bind(auditService);
export const createUserNotification = notificationService.create.bind(notificationService);
export const { daysUntilDate } = notificationService;

// ─── WebSocket Service (init di index.js, di-expose ke context) ───────────────
// akan di-assign setelah wsStatsService dibuat di index.js
export let wsStatsService = null;
export const setWsStatsService = (service) => { wsStatsService = service; };

// ─── Auth Middleware (diinisialisasi setelah JWT_SECRET tervalidasi) ───────────
export const createAuthContext = () => createAuthMiddleware({
  db,
  jwt,
  jwtSecret: JWT_SECRET,
  cookieName: COOKIE_NAME,
  isProduction,
  setSessionCookie
});

// ─── Misc Helpers ─────────────────────────────────────────────────────────────
export const hasPermission = (user, level = 0) => user?.role === 'superadmin' || (user?.clearance_level || 0) >= level;
export const isAssetReferenced = (config, assetId) => configReferencesAsset(config, assetId);

// ─── routeContext Object ──────────────────────────────────────────────────────
/**
 * Merakit seluruh dependensi yang diperlukan oleh route handlers.
 * Dipanggil dari index.js setelah middleware auth dikonfigurasi.
 */
export const buildRouteContext = (authMiddleware) => ({
  db,
  ...authMiddleware,
  fs,
  path,
  SOUNDTRACK_DIR,
  KNOWLEDGE_DIR,
  ASSET_DIR,
  RECEIPT_DIR,
  RECEIPT_TMP_DIR,
  receiptUpload,
  receiptExtension,
  isValidReceiptFile,
  validateSiteConfig,
  assetUpload,
  knowledgeFileUpload,
  soundtrackUpload,
  multer,
  assetMagic,
  soundtrackMagic,
  isPdfDocument,
  randomUUID,
  createHash,
  auditAdminMutation,
  isAssetReferenced,
  hasPermission,
  validateAcademicResource,
  validateLearningPath,
  knowledgeDiscussionLimiter,
  tutoringRequestLimiter,
  validatePreferredSlots,
  rankTutorCandidates,
  getHmifCalendarDate,
  authLimiter,
  registrationLimiter,
  aspirationLimiter,
  aspirationTrackingLimiter,
  eventRegistrationLimiter,
  githubStatsLimiter,
  allowPublicRegistration,
  bcrypt,
  jwt,
  JWT_SECRET,
  setSessionCookie,
  COOKIE_NAME,
  isProduction,
  createUserNotification,
  daysUntilDate,
  webPushService,
  validateProker,
  validatePortalRecord,
  validatePortalConsent,
  validateOrganizationTask,
  normalizePortalUrl,
  validDate,
  encryptEventTicketToken,
  decryptEventTicketToken,
  generateOfficeLetterNumber,
  validateOfficeLetter,
  ASPIRATION_ENCRYPTION_KEY,
  sendEventTicketEmail,
  githubStatsCache,
  GITHUB_STATS_CACHE_MS,
  wsStatsService
});

// Re-export db dan helpers yang diperlukan langsung oleh index.js
export { db, getHmifCalendarDate, bcrypt, jwt, randomUUID, createHash, fs, path };
