/* ==========================================================================
   HMIF UNIVERSITAS MAYASARI BAKTI - PRTS DATABASE ENGINE
   Relational JSON-backed Persistence Engine
   ========================================================================== */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import Sqlite from 'better-sqlite3';
import { DEFAULT_SITE_CONFIG, configReferencesAsset, withSiteDefaults } from './siteSchema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../data');
const LEGACY_DB_FILE = path.join(DATA_DIR, 'database.json');
const DEFAULT_DB_FILE = path.join(DATA_DIR, 'hmif.sqlite');
const DB_FILE = process.env.DATABASE_FILE ? path.resolve(process.env.DATABASE_FILE) : DEFAULT_DB_FILE;
const DB_REVISION = Symbol('dbRevision');

// Initial seed data
const getInitialSeed = () => {
  const adminNim = process.env.INITIAL_ADMIN_NIM;
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;
  if (!adminNim || !adminPassword || adminPassword.length < 16) {
    throw new Error('INITIAL_ADMIN_NIM dan INITIAL_ADMIN_PASSWORD (minimal 16 karakter) wajib diatur untuk database baru.');
  }
  const salt = bcrypt.genSaltSync(10);
  const adminPasswordHash = bcrypt.hashSync(adminPassword, salt);

  const seed = {
    security_version: 2,
    users: [
      {
        nim: String(adminNim),
        name: 'Administrator HMIF',
        email: `${adminNim}@localhost`,
        password_hash: adminPasswordHash,
        generation: String(new Date().getFullYear()),
        role: 'superadmin',
        membership_stage: 'Administrator',
        division: 'BPH',
        clearance_level: 0,
        role_title: 'Administrator',
        code_name: 'ADMIN',
        avatar_silhouette: '/assets/silhouette_male.jpg',
        session_version: 0,
        created_at: new Date().toISOString()
      }
    ],

    missions_proker: [
      {
        id: 'proker-1',
        title: 'Informatics Welcome & Orientation (IN-FLOW 2026)',
        division: 'PSDM',
        category: 'Kaderisasi',
        status: 'completed',
        date_start: '2026-10-10',
        date_end: '2026-10-12',
        target_participants: '120 Mahasiswa Baru Angkatan 2026',
        kpi_indicator: 'Tingkat partisipasi 98%, pembagian kakak asuh 100%',
        budget_allocated: 3500000,
        budget_spent: 3350000,
        lpj_notes: 'Acara berlangsung sukses di Aula Kampus UMB. Seluruh mahasiswa baru telah terdata dan mendapatkan bimbingan awal kurikulum.',
        created_at: '2026-09-01T00:00:00.000Z'
      },
      {
        id: 'proker-2',
        title: 'DevLab: Intensive Fullstack & Cloud Workshop',
        division: 'Litbang',
        category: 'Riset & Coding',
        status: 'active',
        date_start: '2026-10-24',
        date_end: '2026-11-15',
        target_participants: 'Seluruh Kader HMIF UMB & Mahasiswa Aktif',
        kpi_indicator: 'Output 25 prototype aplikasi web open-source siap hosting',
        budget_allocated: 4000000,
        budget_spent: 1800000,
        lpj_notes: 'Modul materi Git dan Docker telah selesai, minggu ini memasuki sesi perancangan REST API terdistribusi.',
        created_at: '2026-09-01T00:00:00.000Z'
      },
      {
        id: 'proker-3',
        title: 'Latihan Dasar Kepemimpinan Mahasiswa (LDKM) Informatika',
        division: 'PSDM',
        category: 'Kaderisasi Konstitusi',
        status: 'upcoming',
        date_start: '2026-11-28',
        date_end: '2026-11-29',
        target_participants: 'Calon Pengurus & Kader Angkatan 2026',
        kpi_indicator: 'Kelulusan 100% peserta dengan predikat Kader Terlatih AD/ART',
        budget_allocated: 6500000,
        budget_spent: 500000,
        lpj_notes: 'Penyusunan modul persidangan dan koordinasi villa konstitusi sedang difinalisasi oleh panitia.',
        created_at: '2026-09-01T00:00:00.000Z'
      },
      {
        id: 'proker-4',
        title: 'Informatics Hackathon & Innovation Summit (IHIS 2026)',
        division: 'Litbang',
        category: 'Kompetisi',
        status: 'upcoming',
        date_start: '2026-12-18',
        date_end: '2026-12-20',
        target_participants: 'Mahasiswa Informatika se-Priangan Timur',
        kpi_indicator: '30 tim peserta, 3 proposal prototipe Smart Campus siap inkubasi',
        budget_allocated: 8000000,
        budget_spent: 1200000,
        lpj_notes: 'Proposal sponsor industri teknologi sedang diajukan oleh Divisi Kominfo.',
        created_at: '2026-09-01T00:00:00.000Z'
      },
      {
        id: 'proker-5',
        title: 'Cyber Security & AI National Tech Talkshow',
        division: 'Kominfo',
        category: 'Seminar Publik',
        status: 'upcoming',
        date_start: '2027-01-16',
        date_end: '2027-01-16',
        target_participants: '300 Peserta Umum & Sivitas Akademika',
        kpi_indicator: '300 peserta daring/luring, liputan pers kampus',
        budget_allocated: 5000000,
        budget_spent: 0,
        lpj_notes: 'Dua pembicara praktisi cybersecurity nasional telah mengonfirmasi kehadiran.',
        created_at: '2026-09-01T00:00:00.000Z'
      },
      {
        id: 'proker-6',
        title: 'Musyawarah Besar (MUBES) & LPJ Kepengurusan HMIF',
        division: 'BPH',
        category: 'Permusyawaratan',
        status: 'upcoming',
        date_start: '2027-03-20',
        date_end: '2027-03-22',
        target_participants: 'Seluruh Anggota Biasa & Kader HMIF UMB',
        kpi_indicator: 'Korum sidang terpenuhi, LPJ diterima, regenerasi kepemimpinan mulus',
        budget_allocated: 4500000,
        budget_spent: 0,
        lpj_notes: 'Draft amandemen AD/ART dan evaluasi GBHO sedang dipersiapkan komisi perumus.',
        created_at: '2026-09-01T00:00:00.000Z'
      }
    ],

    academic_calendar: [
      {
        id: 'cal-1',
        date_str: '2026-09-15',
        title: 'Awal Periode KRS Semester Ganjil 2026/2027',
        type: 'academic',
        division: 'Akademik Kampus',
        location: 'Portal SIAKAD UMB',
        desc: 'Pengisian rencana studi online bagi seluruh mahasiswa Teknik Informatika.',
        integrated_with: 'BPH (Bimbingan Konsultasi KRS Maba)',
        is_exam_period: false
      },
      {
        id: 'cal-2',
        date_str: '2026-09-22',
        title: 'Kuliah Perdana Semester Ganjil 2026/2027',
        type: 'academic',
        division: 'Akademik Kampus',
        location: 'Gedung Rektorat & FTIK UMB',
        desc: 'Hari pertama perkuliahan tatap muka dan praktikum laboratorium.',
        integrated_with: 'Litbang (Pengecekan Kesiapan Lab Komputer)',
        is_exam_period: false
      },
      {
        id: 'cal-3',
        date_str: '2026-10-10',
        title: 'IN-FLOW 2026: Welcoming Maba Informatika',
        type: 'psdm',
        division: 'PSDM',
        location: 'Aula Utama Universitas Mayasari Bakti',
        desc: 'Pengenalan kultur prodi dan kaderisasi awal mahasiswa baru angkatan 2026.',
        integrated_with: 'Akademik UMB (Masa Bimbingan Mahasiswa)',
        is_exam_period: false
      },
      {
        id: 'cal-4',
        date_str: '2026-10-24',
        title: 'Kick-off DevLab Weekend Coding Workshop',
        type: 'litbang',
        division: 'Litbang',
        location: 'Lab Komputasi Cerdas Gedung B',
        desc: 'Sesi perdana pelatihan Fullstack Web & Git Version Control.',
        integrated_with: 'Akademik (Pengayaan Praktikum Pemrograman Web)',
        is_exam_period: false
      },
      {
        id: 'cal-5',
        date_str: '2026-11-09',
        title: 'Pekan Ujian Tengah Semester (UTS) Ganjil',
        type: 'academic',
        division: 'Akademik Kampus',
        location: 'Seluruh Ruang Kuliah FTIK',
        desc: 'Evaluasi tengah semester mata kuliah teori dan praktikum. Bebas dari kegiatan ormawa.',
        integrated_with: 'BPH (Sterilisasi Kegiatan Organisasi Masa Ujian)',
        is_exam_period: true
      },
      {
        id: 'cal-6',
        date_str: '2026-11-28',
        title: 'Latihan Dasar Kepemimpinan Mahasiswa (LDKM)',
        type: 'psdm',
        division: 'PSDM',
        location: 'Bumi Perkemahan / Villa Konstitusi UMB',
        desc: 'Kaderisasi formal landasan AD/ART & GBHO bagi kader baru.',
        integrated_with: 'BPH & Dosen Pembina Kemahasiswaan',
        is_exam_period: false
      },
      {
        id: 'cal-7',
        date_str: '2026-12-18',
        title: 'Informatics Hackathon 48-Hour Challenge',
        type: 'litbang',
        division: 'Litbang',
        location: 'Hall Co-Working Space Kampus UMB',
        desc: 'Kompetisi perancangan solusi digital Smart Campus.',
        integrated_with: 'Mitra Industri & FTIK UMB',
        is_exam_period: false
      },
      {
        id: 'cal-8',
        date_str: '2027-01-11',
        title: 'Ujian Akhir Semester (UAS) Ganjil',
        type: 'academic',
        division: 'Akademik Kampus',
        location: 'Kampus Universitas Mayasari Bakti',
        desc: 'Evaluasi akhir capaian pembelajaran semester ganjil.',
        integrated_with: 'BPH (Masa Tenang Organisasi)',
        is_exam_period: true
      },
      {
        id: 'cal-9',
        date_str: '2027-01-16',
        title: 'Cyber Security & AI National Tech Talkshow',
        type: 'kominfo',
        division: 'Kominfo',
        location: 'Auditorium UMB & Zoom Live',
        desc: 'Seminar nasional penutup semester ganjil.',
        integrated_with: 'Humas Kampus UMB',
        is_exam_period: false
      },
      {
        id: 'cal-10',
        date_str: '2027-03-20',
        title: 'Musyawarah Besar (MUBES) HMIF UMB',
        type: 'bph',
        division: 'BPH',
        location: 'Ruang Sidang Utama FTIK UMB',
        desc: 'Sidang pleno evaluasi AD/ART, GBHO, dan pemilihan Kahim baru.',
        integrated_with: 'DPM FTIK & Dewan Penasihat Organisasi',
        is_exam_period: false
      }
    ],

    aspirations: [
      {
        id: 'asp-1',
        sender_nim_or_anon: 'Mahasiswa Angkatan 2024',
        category: 'Fasilitas Lab Komputer',
        message: 'Mohon penambahan modul latihan pemrograman Python dan koneksi WiFi yang lebih stabil di Lab B gedung FTIK.',
        status: 'Ditindaklanjuti',
        bph_response: 'Aspirasi telah disampaikan kepada Kepala Lab dan Bagian Sarpras FTIK. Penambahan access point wifi dijadwalkan pertengahan Oktober.',
        responded_by: 'Ketua Himpunan (Arkan Raihan Pratama)',
        created_at: '2026-09-29T10:15:00.000Z'
      },
      {
        id: 'asp-2',
        sender_nim_or_anon: 'Anonim (Informatika)',
        category: 'Kurikulum & Perkuliahan',
        message: 'Sangat mengapresiasi workshop web dev kemarin, usul berikutnya adakan materi cloud computing AWS/GCP.',
        status: 'Diterima',
        bph_response: 'Terima kasih atas masukannya. Divisi Litbang telah memasukkan materi cloud ke kurikulum DevLab pekan ketiga.',
        responded_by: 'Wakil Ketua Himpunan',
        created_at: '2026-09-27T14:30:00.000Z'
      }
    ],

    financial_ledger: [
      {
        id: 'fin-1',
        date: '2026-09-05',
        type: 'INCOME',
        category: 'Dana Kemahasiswaan Kampus',
        description: 'Pencairan termin I dana operasional himpunan dari Rektorat UMB',
        amount: 15000000,
        division: 'BPH',
        recorded_by: 'Bendahara Umum (Rifka)'
      },
      {
        id: 'fin-2',
        date: '2026-09-12',
        type: 'INCOME',
        category: 'Iuran Kas Anggota',
        description: 'Iuran rutin kas pengurus periode September 2026',
        amount: 1250000,
        division: 'BPH',
        recorded_by: 'Bendahara Umum (Rifka)'
      },
      {
        id: 'fin-3',
        date: '2026-09-18',
        type: 'EXPENSE',
        category: 'Operasional Kesekretariatan',
        description: 'Pengadaan kertas F4, tinta printer, dan stempel dinas HMIF',
        amount: 450000,
        division: 'Sekretariat',
        recorded_by: 'Bendahara Umum (Rifka)'
      },
      {
        id: 'fin-4',
        date: '2026-10-09',
        type: 'EXPENSE',
        category: 'Proker IN-FLOW',
        description: 'Konsumsi dan banner penyambutan mahasiswa baru angkatan 2026',
        amount: 3350000,
        division: 'PSDM',
        recorded_by: 'Bendahara Umum (Rifka)'
      }
    ],

    cadet_evaluations: [],

    attendance_records: []
  };

  if (process.env.NODE_ENV === 'production') {
    for (const collection of ['missions_proker', 'academic_calendar', 'aspirations', 'financial_ledger', 'cadet_evaluations', 'attendance_records']) {
      seed[collection] = [];
    }
  }

  return seed;
};

class Database {
  constructor() {
    if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_FILE) {
      throw new Error('DATABASE_FILE wajib diarahkan ke database SQLite production terpisah.');
    }
    if (process.env.NODE_ENV === 'production' && DB_FILE.startsWith(`${path.resolve(DATA_DIR)}${path.sep}`)) {
      throw new Error('Database production wajib berada di volume persisten di luar workspace.');
    }
    if (process.env.NODE_ENV === 'production' && DB_FILE === path.resolve(LEGACY_DB_FILE)) {
      throw new Error('Database workspace dummy tidak boleh digunakan di production.');
    }
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    this.sqlite = new Sqlite(DB_FILE);
    this.sqlite.pragma('journal_mode = WAL');
    this.sqlite.pragma('foreign_keys = ON');
    this.sqlite.pragma('busy_timeout = 5000');
    this.initializeSchema();
  }

  initializeSchema() {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS app_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        payload TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS site_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        draft_json TEXT NOT NULL,
        published_json TEXT NOT NULL,
        draft_revision_id TEXT,
        published_revision_id TEXT
      );
      CREATE TABLE IF NOT EXISTS site_revisions (
        id TEXT PRIMARY KEY,
        version INTEGER NOT NULL UNIQUE,
        status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
        payload TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        published_at TEXT,
        restored_from TEXT REFERENCES site_revisions(id)
      );
      CREATE TABLE IF NOT EXISTS site_assets (
        id TEXT PRIMARY KEY,
        stored_name TEXT NOT NULL UNIQUE,
        original_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('image', 'font')),
        size INTEGER NOT NULL CHECK (size > 0),
        sha256 TEXT NOT NULL,
        uploaded_by TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        actor_nim TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        details_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS audit_log_created_at ON audit_log(created_at DESC);
      CREATE INDEX IF NOT EXISTS site_revisions_created_at ON site_revisions(created_at DESC);
    `);

    const currentState = this.sqlite.prepare('SELECT id FROM app_state WHERE id = 1').get();
    if (!currentState) {
      const canImportLegacy = process.env.NODE_ENV !== 'production'
        && DB_FILE === DEFAULT_DB_FILE
        && fs.existsSync(LEGACY_DB_FILE);
      let initial = canImportLegacy
        ? JSON.parse(fs.readFileSync(LEGACY_DB_FILE, 'utf8'))
        : getInitialSeed();
      if (canImportLegacy) {
        initial.security_version = 3;
      }
      initial.users = initial.users.map((user) => ({
        ...user,
        role: user.role || (user.clearance_level >= 4 ? 'superadmin' : 'member'),
        clearance_level: user.role === 'superadmin' || (!user.role && user.clearance_level >= 4) ? 0 : Math.min(user.clearance_level || 1, 3),
        session_version: user.session_version || 0
      }));
      initial.attendance_records ||= [];
      initial.cadet_evaluations ||= [];
      const timestamp = new Date().toISOString();
      const transaction = this.sqlite.transaction(() => {
        this.sqlite.prepare('INSERT INTO app_state (id, payload, revision, updated_at) VALUES (1, ?, 1, ?)')
          .run(JSON.stringify(initial), timestamp);
        const defaultSite = JSON.stringify(DEFAULT_SITE_CONFIG);
        const initialRevisionId = randomUUID();
        this.sqlite.prepare(`INSERT INTO site_revisions (id, version, status, payload, created_by, created_at, published_at)
          VALUES (?, 1, 'published', ?, 'system', ?, ?)`)
          .run(initialRevisionId, defaultSite, timestamp, timestamp);
        this.sqlite.prepare(`INSERT INTO site_state (id, draft_json, published_json, draft_revision_id, published_revision_id)
          VALUES (1, ?, ?, ?, ?)`)
          .run(defaultSite, defaultSite, initialRevisionId, initialRevisionId);
      });
      transaction();
    }
    this.migrateUncustomizedDefaultLogo();
  }

  migrateUncustomizedDefaultLogo() {
    const state = this.sqlite.prepare('SELECT draft_json, published_json, draft_revision_id, published_revision_id FROM site_state WHERE id = 1').get();
    for (const slot of ['draft', 'published']) {
      const revisionId = state[`${slot}_revision_id`];
      const revision = revisionId && this.sqlite.prepare('SELECT created_by FROM site_revisions WHERE id = ?').get(revisionId);
      if (revision?.created_by !== 'system') continue;
      const config = JSON.parse(state[`${slot}_json`]);
      if (config.content?.data?.identity?.logo !== '/assets/hmif_umb_logo.png') continue;
      config.content.data.identity.logo = '/assets/hmif_umb_logo.jpg';
      const serialized = JSON.stringify(config);
      this.sqlite.prepare(`UPDATE site_state SET ${slot}_json = ? WHERE id = 1`).run(serialized);
      this.sqlite.prepare('UPDATE site_revisions SET payload = ? WHERE id = ?').run(serialized, revisionId);
    }
  }

  read() {
    const row = this.sqlite.prepare('SELECT payload, revision FROM app_state WHERE id = 1').get();
    if (!row) throw new Error('Database aplikasi belum diinisialisasi.');
    const data = JSON.parse(row.payload);
    Object.defineProperty(data, DB_REVISION, { value: row.revision });
    return data;
  }

  write(data, auditEntry = null) {
    const timestamp = new Date().toISOString();
    const transaction = this.sqlite.transaction(() => {
      const result = this.sqlite.prepare('UPDATE app_state SET payload = ?, revision = revision + 1, updated_at = ? WHERE id = 1 AND revision = ?')
        .run(JSON.stringify(data), timestamp, data[DB_REVISION]);
      if (!result.changes) {
        const conflict = new Error('Data berubah bersamaan. Muat ulang lalu ulangi perubahan.');
        conflict.code = 'APP_STATE_CONFLICT';
        throw conflict;
      }
      if (auditEntry) this.insertAudit(auditEntry);
    });
    transaction();
    return true;
  }

  close() {
    this.sqlite.close();
  }

  getSiteState() {
    const state = this.sqlite.prepare('SELECT draft_json, published_json, draft_revision_id, published_revision_id FROM site_state WHERE id = 1').get();
    return {
      draft: withSiteDefaults(JSON.parse(state.draft_json)),
      published: withSiteDefaults(JSON.parse(state.published_json)),
      draftRevisionId: state.draft_revision_id,
      publishedRevisionId: state.published_revision_id
    };
  }

  saveSiteDraft(config, actorNim, restoredFrom = null, expectedRevisionId = null) {
    const id = randomUUID();
    const timestamp = new Date().toISOString();
    const transaction = this.sqlite.transaction(() => {
      const current = this.sqlite.prepare('SELECT draft_revision_id FROM site_state WHERE id = 1').get();
      if (expectedRevisionId !== null && current.draft_revision_id !== expectedRevisionId) {
        const conflict = new Error('Draft berubah di sesi lain. Muat ulang sebelum menyimpan.');
        conflict.code = 'SITE_DRAFT_CONFLICT';
        throw conflict;
      }
      const version = (this.sqlite.prepare('SELECT COALESCE(MAX(version), 0) + 1 AS next FROM site_revisions').get().next);
      const previousPayload = this.sqlite.prepare('SELECT payload FROM site_revisions WHERE id = ?').get(current.draft_revision_id)?.payload;
      const previousConfig = previousPayload ? JSON.parse(previousPayload) : {};
      const changedAreas = ['theme', 'pages', 'content'].filter((area) => JSON.stringify(previousConfig[area]) !== JSON.stringify(config[area]));
      this.sqlite.prepare("UPDATE site_revisions SET status = 'archived' WHERE status = 'draft'").run();
      this.sqlite.prepare(`INSERT INTO site_revisions (id, version, status, payload, created_by, created_at, restored_from)
        VALUES (?, ?, 'draft', ?, ?, ?, ?)`)
        .run(id, version, JSON.stringify(config), actorNim, timestamp, restoredFrom);
      this.sqlite.prepare('UPDATE site_state SET draft_json = ?, draft_revision_id = ? WHERE id = 1')
        .run(JSON.stringify(config), id);
      this.insertAudit({ actorNim, actorRole: 'superadmin', action: restoredFrom ? 'site.restore_draft' : 'site.save_draft', targetType: 'site_config', targetId: id, details: { version, restoredFrom, changedAreas }, createdAt: timestamp });
      return { id, version, status: 'draft', created_at: timestamp, restored_from: restoredFrom };
    });
    return transaction();
  }

  publishSite(actorNim) {
    const timestamp = new Date().toISOString();
    const transaction = this.sqlite.transaction(() => {
      const state = this.sqlite.prepare('SELECT draft_json, draft_revision_id FROM site_state WHERE id = 1').get();
      if (!state.draft_revision_id) return null;
      this.sqlite.prepare("UPDATE site_revisions SET status = 'archived' WHERE status = 'published'").run();
      this.sqlite.prepare("UPDATE site_revisions SET status = 'published', published_at = ? WHERE id = ? AND status = 'draft'")
        .run(timestamp, state.draft_revision_id);
      this.sqlite.prepare('UPDATE site_state SET published_json = ?, published_revision_id = ? WHERE id = 1')
        .run(state.draft_json, state.draft_revision_id);
      this.insertAudit({ actorNim, actorRole: 'superadmin', action: 'site.publish', targetType: 'site_revision', targetId: state.draft_revision_id, details: {}, createdAt: timestamp });
      return { id: state.draft_revision_id, published_at: timestamp };
    });
    return transaction();
  }

  getSiteRevision(id) {
    const row = this.sqlite.prepare('SELECT id, version, status, payload, created_by, created_at, published_at, restored_from FROM site_revisions WHERE id = ?').get(id);
    if (!row) return null;
    return { ...row, payload: withSiteDefaults(JSON.parse(row.payload)) };
  }

  listSiteRevisions(limit = 30) {
    return this.sqlite.prepare('SELECT id, version, status, created_by, created_at, published_at, restored_from FROM site_revisions ORDER BY version DESC LIMIT ?').all(limit);
  }

  addAsset(asset) {
    const record = { id: randomUUID(), created_at: new Date().toISOString(), ...asset };
    this.sqlite.prepare(`INSERT INTO site_assets (id, stored_name, original_name, mime_type, kind, size, sha256, uploaded_by, created_at)
      VALUES (@id, @stored_name, @original_name, @mime_type, @kind, @size, @sha256, @uploaded_by, @created_at)`).run(record);
    return record;
  }

  getAsset(id) {
    return this.sqlite.prepare('SELECT * FROM site_assets WHERE id = ?').get(id) || null;
  }

  isAssetReferencedByRevision(id) {
    const revisions = this.sqlite.prepare('SELECT payload FROM site_revisions').all();
    return revisions.some(({ payload }) => {
      return configReferencesAsset(JSON.parse(payload), id);
    });
  }

  assetExists(id, kind) {
    if (!id) return false;
    return Boolean(this.sqlite.prepare('SELECT 1 FROM site_assets WHERE id = ? AND (? IS NULL OR kind = ?)').get(id, kind || null, kind || null));
  }

  listAssets() {
    return this.sqlite.prepare('SELECT id, original_name, mime_type, kind, size, sha256, uploaded_by, created_at FROM site_assets ORDER BY created_at DESC').all();
  }

  deleteAsset(id) {
    return this.sqlite.prepare('DELETE FROM site_assets WHERE id = ?').run(id).changes > 0;
  }

  insertAudit({ actorNim, actorRole, action, targetType, targetId, details, createdAt = new Date().toISOString() }) {
    this.sqlite.prepare(`INSERT INTO audit_log (id, actor_nim, actor_role, action, target_type, target_id, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(randomUUID(), actorNim, actorRole, action, targetType, targetId, JSON.stringify(details), createdAt);
  }

  listAudit(limit = 100) {
    return this.sqlite.prepare('SELECT id, actor_nim, actor_role, action, target_type, target_id, details_json, created_at FROM audit_log ORDER BY created_at DESC LIMIT ?')
      .all(limit)
      .map(({ details_json, ...entry }) => ({ ...entry, details: JSON.parse(details_json) }));
  }

  // --- Users & Cadets ---
  findUserByNIM(nim) {
    const db = this.read();
    return db.users.find((u) => u.nim.toLowerCase() === String(nim).toLowerCase());
  }

  getAllCadets() {
    const db = this.read();
    // Return sanitized users (without password hash)
    return db.users.map(({ password_hash, ...u }) => u);
  }

  updateCadetStage(nim, newStage) {
    const db = this.read();
    const idx = db.users.findIndex((u) => u.nim.toLowerCase() === String(nim).toLowerCase());
    if (idx === -1) return null;

    db.users[idx].membership_stage = newStage;
    this.write(db);
    const { password_hash, ...sanitized } = db.users[idx];
    return sanitized;
  }

  createUser(userData) {
    if (typeof userData.password !== 'string' || userData.password.length < 12) {
      return { error: 'Password minimal 12 karakter.' };
    }
    const db = this.read();
    const existing = db.users.find((u) => u.nim.toLowerCase() === String(userData.nim).toLowerCase());
    if (existing) return { error: 'NIM sudah terdaftar' };

    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(userData.password, salt);

    const newUser = {
      nim: String(userData.nim),
      name: userData.name,
      email: userData.email || `${userData.nim}@mayasaribakti.ac.id`,
      password_hash: hash,
      session_version: 0,
      role: userData.role === 'superadmin' ? 'superadmin' : 'member',
      generation: userData.generation || '2026',
      membership_stage: userData.membership_stage || 'Calon Kader',
      division: userData.division || 'Kader Mahasiswa',
      clearance_level: userData.role === 'superadmin' ? 0 : Math.min(userData.clearance_level !== undefined ? userData.clearance_level : 1, 3),
      role_title: userData.role_title || 'Kader Pratama',
      code_name: userData.code_name || `CADET-${String(userData.nim).slice(-3)}`,
      avatar_silhouette: '/assets/silhouette_male.jpg',
      created_at: new Date().toISOString()
    };

    db.users.push(newUser);
    this.write(db);
    const { password_hash: _, ...sanitized } = newUser;
    return sanitized;
  }

  changePassword(nim, newPassword) {
    const db = this.read();
    const idx = db.users.findIndex((u) => u.nim.toLowerCase() === String(nim).toLowerCase());
    if (idx === -1) return false;

    const salt = bcrypt.genSaltSync(10);
    db.users[idx].password_hash = bcrypt.hashSync(newPassword, salt);
    db.users[idx].session_version = (db.users[idx].session_version || 0) + 1;
    return this.write(db);
  }

  invalidateSessions(nim) {
    const db = this.read();
    const user = db.users.find((entry) => entry.nim.toLowerCase() === String(nim).toLowerCase());
    if (!user) return false;
    user.session_version = (user.session_version || 0) + 1;
    return this.write(db);
  }

  getAdminCount() {
    return this.read().users.filter((user) => user.role === 'superadmin').length;
  }

  updateUserAdmin(nim, updates, actor = null) {
    const db = this.read();
    const idx = db.users.findIndex((u) => u.nim.toLowerCase() === String(nim).toLowerCase());
    if (idx === -1) return null;

    const allowed = ['clearance_level', 'role_title', 'division', 'membership_stage', 'code_name'];
    allowed.forEach((key) => {
      if (updates[key] !== undefined && updates[key] !== null) {
        db.users[idx][key] = updates[key];
      }
    });

    this.write(db, actor ? {
      actorNim: actor.nim,
      actorRole: actor.role,
      action: 'user.update',
      targetType: 'user',
      targetId: db.users[idx].nim,
      details: { fields: Object.keys(updates).filter((key) => updates[key] !== undefined && updates[key] !== null) }
    } : null);
    const { password_hash, ...sanitized } = db.users[idx];
    return sanitized;
  }

  updateUserRole(nim, role, actor = null) {
    if (!['member', 'superadmin'].includes(role)) return null;
    const data = this.read();
    const user = data.users.find((entry) => entry.nim.toLowerCase() === String(nim).toLowerCase());
    if (!user) return null;
    user.role = role;
    user.clearance_level = role === 'superadmin' ? 0 : Math.min(user.clearance_level || 1, 3);
    user.session_version = (user.session_version || 0) + 1;
    if (!this.write(data, actor ? {
      actorNim: actor.nim,
      actorRole: actor.role,
      action: 'user.role_change',
      targetType: 'user',
      targetId: user.nim,
      details: { role }
    } : null)) return null;
    const { password_hash, ...safeUser } = user;
    return safeUser;
  }

  deleteUser(nim) {
    const db = this.read();
    const idx = db.users.findIndex((u) => u.nim.toLowerCase() === String(nim).toLowerCase());
    if (idx === -1) return false;

    db.users.splice(idx, 1);
    return this.write(db);
  }

  // --- Program Kerja / Missions ---
  getAllProker() {
    return this.read().missions_proker;
  }

  updateProker(id, updates) {
    const db = this.read();
    const idx = db.missions_proker.findIndex((p) => p.id === id);
    if (idx === -1) return null;

    db.missions_proker[idx] = { ...db.missions_proker[idx], ...updates };
    this.write(db);
    return db.missions_proker[idx];
  }

  createProker(prokerData) {
    const db = this.read();
    const newProker = {
      id: `proker-${Date.now()}`,
      title: prokerData.title,
      division: prokerData.division,
      category: prokerData.category || 'Program Kerja',
      status: prokerData.status || 'upcoming',
      date_start: prokerData.date_start,
      date_end: prokerData.date_end,
      target_participants: prokerData.target_participants,
      kpi_indicator: prokerData.kpi_indicator,
      budget_allocated: Number(prokerData.budget_allocated) || 0,
      budget_spent: Number(prokerData.budget_spent) || 0,
      lpj_notes: prokerData.lpj_notes || '',
      created_at: new Date().toISOString()
    };
    db.missions_proker.push(newProker);
    this.write(db);
    return newProker;
  }

  // --- Calendar ---
  getAllCalendarEvents() {
    return this.read().academic_calendar;
  }

  createCalendarEvent(eventData) {
    const db = this.read();
    const newEvent = {
      id: `cal-${Date.now()}`,
      date_str: eventData.date_str,
      title: eventData.title,
      type: eventData.type || 'proker',
      division: eventData.division || 'Umum',
      location: eventData.location || 'Kampus UMB',
      desc: eventData.desc || '',
      integrated_with: eventData.integrated_with || 'Divisi HMIF',
      is_exam_period: Boolean(eventData.is_exam_period)
    };
    db.academic_calendar.push(newEvent);
    this.write(db);
    return newEvent;
  }

  // --- Aspirations ---
  getAllAspirations() {
    return this.read().aspirations;
  }

  createAspiration(aspData) {
    const db = this.read();
    const newAsp = {
      id: `asp-${Date.now()}`,
      sender_nim_or_anon: aspData.sender || 'Anonim (Mahasiswa)',
      category: aspData.category || 'Umum',
      message: aspData.message,
      status: 'Diterima',
      bph_response: '',
      responded_by: '',
      created_at: new Date().toISOString()
    };
    db.aspirations.unshift(newAsp);
    this.write(db);
    return newAsp;
  }

  respondAspiration(id, responseText, newStatus = 'Ditindaklanjuti', responder = '') {
    const db = this.read();
    const idx = db.aspirations.findIndex((a) => a.id === id);
    if (idx === -1) return null;

    db.aspirations[idx].bph_response = responseText;
    db.aspirations[idx].status = newStatus;
    db.aspirations[idx].responded_by = responder;
    db.aspirations[idx].responded_at = new Date().toISOString();
    this.write(db);
    return db.aspirations[idx];
  }

  // --- Financial Ledger ---
  getFinancialLedger() {
    const db = this.read();
    const transactions = db.financial_ledger;
    const totalIncome = transactions.filter((t) => t.type === 'INCOME').reduce((acc, t) => acc + Number(t.amount), 0);
    const totalExpense = transactions.filter((t) => t.type === 'EXPENSE').reduce((acc, t) => acc + Number(t.amount), 0);
    const balance = totalIncome - totalExpense;

    // Monthly breakdown
    const monthlyBreakdown = {};
    transactions.forEach((t) => {
      const month = t.date ? t.date.substring(0, 7) : 'unknown';
      if (!monthlyBreakdown[month]) {
        monthlyBreakdown[month] = { income: 0, expense: 0 };
      }
      if (t.type === 'INCOME') {
        monthlyBreakdown[month].income += Number(t.amount);
      } else {
        monthlyBreakdown[month].expense += Number(t.amount);
      }
    });

    // Category breakdown
    const categoryBreakdown = {};
    transactions.forEach((t) => {
      const cat = t.category || 'Lain-lain';
      if (!categoryBreakdown[cat]) {
        categoryBreakdown[cat] = { total: 0, count: 0, type: t.type };
      }
      categoryBreakdown[cat].total += Number(t.amount);
      categoryBreakdown[cat].count++;
    });

    return {
      summary: {
        totalIncome,
        totalExpense,
        balance,
        transactionCount: transactions.length
      },
      monthlyBreakdown,
      categoryBreakdown,
      transactions
    };
  }

  addFinancialTransaction(txData) {
    const db = this.read();
    const newTx = {
      id: `fin-${Date.now()}`,
      date: txData.date || new Date().toISOString().split('T')[0],
      type: txData.type, // 'INCOME' | 'EXPENSE'
      category: txData.category,
      description: txData.description,
      amount: Number(txData.amount) || 0,
      division: txData.division || 'BPH',
      recorded_by: txData.recorded_by || 'Bendahara Umum'
    };
    db.financial_ledger.unshift(newTx);
    this.write(db);
    return newTx;
  }

  // --- Cadet Quiz & Evaluations ---
  saveQuizEvaluation(evalData) {
    const db = this.read();
    const newEval = {
      id: `eval-${Date.now()}`,
      nim: evalData.nim,
      score: evalData.score,
      rank_title: evalData.rank_title,
      clearance_awarded: evalData.clearance_awarded,
      evaluated_at: new Date().toISOString()
    };
    db.cadet_evaluations.push(newEval);
    this.write(db);
    return newEval;
  }

  getCadetEvaluations(nim) {
    const db = this.read();
    return db.cadet_evaluations.filter((e) => e.nim === nim);
  }

  // --- Attendance / Presensi ---
  recordAttendance(recordData) {
    const db = this.read();

    // Check for duplicates
    const existing = db.attendance_records.find(
      (r) => r.event_id === recordData.event_id && r.nim === recordData.nim
    );
    if (existing) {
      return { error: `Presensi sudah tercatat untuk NIM ${recordData.nim} pada event ini.` };
    }

    const newRecord = {
      id: `att-${Date.now()}`,
      event_id: recordData.event_id,
      nim: recordData.nim,
      name: recordData.name,
      division: recordData.division,
      scanned_at: recordData.scanned_at || new Date().toISOString()
    };
    db.attendance_records.push(newRecord);
    this.write(db);
    return newRecord;
  }

  getAttendanceByEvent(eventId) {
    const db = this.read();
    return db.attendance_records.filter((r) => r.event_id === eventId);
  }

  getCadetAttendance(nim) {
    const db = this.read();
    return db.attendance_records.filter((r) => r.nim === nim);
  }

  // --- Admin / System ---
  getFullBackup() {
    return {
      app_state: this.read(),
      site_state: this.getSiteState(),
      site_revisions: this.sqlite.prepare('SELECT id, version, status, payload, created_by, created_at, published_at, restored_from FROM site_revisions ORDER BY version').all().map((row) => ({ ...row, payload: JSON.parse(row.payload) })),
      assets: this.listAssets(),
      audit_log: this.listAudit(5000)
    };
  }

  getSystemStats() {
    const db = this.read();
    const levelCounts = [0, 0, 0, 0, 0];
    db.users.forEach((u) => {
      if (u.role !== 'superadmin' && u.clearance_level >= 1 && u.clearance_level <= 3) {
        levelCounts[u.clearance_level]++;
      }
    });

    const stageCounts = {};
    db.users.forEach((u) => {
      const stage = u.membership_stage || 'Unknown';
      stageCounts[stage] = (stageCounts[stage] || 0) + 1;
    });

    const divisionCounts = {};
    db.users.forEach((u) => {
      const div = u.division || 'Unassigned';
      divisionCounts[div] = (divisionCounts[div] || 0) + 1;
    });

    return {
      generated_at: new Date().toISOString(),
      users: {
        total: db.users.length,
        by_clearance: {
          'Level 0 (Tamu)': levelCounts[0],
          'Level 1 (Kader)': levelCounts[1],
          'Level 2 (Pengurus Divisi)': levelCounts[2],
          'Level 3 (BPH & Kahim)': levelCounts[3],
          'Level 4 (Admin)': levelCounts[4]
        },
        by_stage: stageCounts,
        by_division: divisionCounts
      },
      proker: {
        total: db.missions_proker.length,
        completed: db.missions_proker.filter((p) => p.status === 'completed').length,
        active: db.missions_proker.filter((p) => p.status === 'active').length,
        upcoming: db.missions_proker.filter((p) => p.status === 'upcoming').length
      },
      calendar_events: db.academic_calendar.length,
      aspirations: {
        total: db.aspirations.length,
        responded: db.aspirations.filter((a) => a.status === 'Ditindaklanjuti').length,
        pending: db.aspirations.filter((a) => a.status === 'Diterima').length
      },
      financial: {
        transactions: db.financial_ledger.length
      },
      evaluations: db.cadet_evaluations.length,
      attendance_records: db.attendance_records.length
    };
  }
}

export const db = new Database();
