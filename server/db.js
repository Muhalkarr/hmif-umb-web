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
import { createSiteSqlRepository } from './repositories/siteSqlRepository.js';
import { createAcademicSqlRepository } from './repositories/academicSqlRepository.js';
import { createUserSqlRepository } from './repositories/userSqlRepository.js';
import { createEventsSqlRepository } from './repositories/eventsSqlRepository.js';
import { createOperationsSqlRepository } from './repositories/operationsSqlRepository.js';
import { createInventorySqlRepository } from './repositories/inventorySqlRepository.js';
import { createFinanceAndAspirationsSqlRepository } from './repositories/financeAndAspirationsSqlRepository.js';
import { createPortalSqlRepository } from './repositories/portalSqlRepository.js';
import { loadInitialDatabaseSeed } from './databaseBootstrap.js';
import { rankTutorCandidates } from './academicFeatures.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../data');
const LEGACY_DB_FILE = path.join(DATA_DIR, 'database.json');
const DEFAULT_DB_FILE = path.join(DATA_DIR, 'hmif.sqlite');
const DB_FILE = process.env.DATABASE_FILE ? path.resolve(process.env.DATABASE_FILE) : DEFAULT_DB_FILE;
const DB_REVISION = Symbol('dbRevision');

export const getHmifCalendarDate = (instant = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(instant);
  const date = Object.fromEntries(parts.filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, value]));
  return `${date.year}-${date.month}-${date.day}`;
};

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
    // --- Badge Definitions ---
    badge_definitions: [
      {
        id: 'first_login',
        name: 'Login Pertama',
        description: 'Mengunjungi portal HMIF UMB untuk pertama kalinya',
        icon_url: '/assets/icons/badge-first-login.svg',
        rarity: 'common'
      },
      {
        id: 'profile_complete',
        name: 'Profil Lengkap',
        description: 'Memperbarui profil lengkap dengan foto dan info diri',
        icon_url: '/assets/icons/badge-profile-complete.svg',
        rarity: 'common'
      },
      {
        id: 'event_attended',
        name: 'Penghadiran Event',
        description: 'Mempesertaikan minimal 1 event organisasi HMIF',
        icon_url: '/assets/icons/badge-event-attended.svg',
        rarity: 'common'
      },
      {
        id: 'task_completed',
        name: 'Tugas Selesai',
        description: 'Memperbaiki status tugas dari todo ke done',
        icon_url: '/assets/icons/badge-task-completed.svg',
        rarity: 'common'
      },
      {
        id: 'kader_terlatih',
        name: 'Kader Terlatih AD/ART',
        description: 'Menyelesaikan modul kaderisasi AD/ART',
        icon_url: '/assets/icons/badge-kader-terlatih.svg',
        rarity: 'rare'
      },
      {
        id: 'hackathon_participant',
        name: 'Peserta Hackathon',
        description: 'Mengikuti event Hackathon & Innovation Summit',
        icon_url: '/assets/icons/badge-hackathon.svg',
        rarity: 'rare'
      },
      {
        id: 'super_contributor',
        name: 'Kontributor Super',
        description: 'Membuat kontribusi signifikan ke portal HMIF',
        icon_url: '/assets/icons/badge-super-contributor.svg',
        rarity: 'epic'
      },
      {
        id: 'legend_kader',
        name: 'Legenda Kader',
        description: 'Mencapai level maksimum dan collecting semua badge',
        icon_url: '/assets/icons/badge-legend-kader.svg',
        rarity: 'legendary'
      }
    ],
    users: [
      {
        account_id: randomUUID(),
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
    this.siteRepository = createSiteSqlRepository({
      sqlite: this.sqlite,
      read: this.read.bind(this),
      insertAudit: this.insertAudit.bind(this)
    });
    this.academicRepository = createAcademicSqlRepository({
      sqlite: this.sqlite,
      read: this.read.bind(this),
      write: this.write.bind(this),
      insertAudit: this.insertAudit.bind(this),
      findUserById: this.findUserById.bind(this)
    });
    this.userSqlRepository = createUserSqlRepository({
      sqlite: this.sqlite,
      read: this.read.bind(this),
      write: this.write.bind(this),
      insertAudit: this.insertAudit.bind(this)
    });
    this.eventsRepository = createEventsSqlRepository({
      sqlite: this.sqlite,
      read: this.read.bind(this),
      write: this.write.bind(this)
    });
    this.operationsRepository = createOperationsSqlRepository({
      sqlite: this.sqlite,
      read: this.read.bind(this),
      write: this.write.bind(this),
      findUserById: this.findUserById.bind(this)
    });
    this.inventoryRepository = createInventorySqlRepository({
      sqlite: this.sqlite
    });
    this.financeRepository = createFinanceAndAspirationsSqlRepository({
      sqlite: this.sqlite,
      read: this.read.bind(this),
      write: this.write.bind(this)
    });
    this.portalRepository = createPortalSqlRepository({
      sqlite: this.sqlite,
      getHmifCalendarDate
    });
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
      CREATE TABLE IF NOT EXISTS delegations (
  id TEXT PRIMARY KEY,
  applicant_account_id TEXT NOT NULL,
  applicant_nim TEXT NOT NULL,
  applicant_name TEXT NOT NULL,
  event_name TEXT NOT NULL,
  event_category TEXT NOT NULL DEFAULT 'Kompetisi',
  destination TEXT NOT NULL DEFAULT 'Dalam Kota',
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  funding_type TEXT NOT NULL DEFAULT 'Mandiri',
  requested_budget INTEGER NOT NULL DEFAULT 0,
  approved_budget INTEGER NOT NULL DEFAULT 0,
  mandate_letter_number TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Diajukan',
  lpd_submitted INTEGER NOT NULL DEFAULT 0,
  lpd_text TEXT DEFAULT '',
  lpd_submitted_at TEXT,
  clawback_warning INTEGER NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_delegations_applicant ON delegations(applicant_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delegations_status ON delegations(status);
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
        uploaded_by_account_id TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS soundtracks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        source_type TEXT NOT NULL CHECK (source_type IN ('upload', 'url')),
        source_url TEXT,
        stored_name TEXT UNIQUE,
        mime_type TEXT,
        size INTEGER,
        sha256 TEXT,
        uploaded_by TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        CHECK ((source_type = 'url' AND source_url IS NOT NULL AND stored_name IS NULL)
          OR (source_type = 'upload' AND source_url IS NULL AND stored_name IS NOT NULL))
      );
      CREATE INDEX IF NOT EXISTS idx_soundtracks_active_order ON soundtracks(active, sort_order, created_at);
      CREATE TABLE IF NOT EXISTS portal_records (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('project', 'alumni', 'job')),
        payload_json TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        created_by TEXT NOT NULL,
        submitter_account_id TEXT,
        review_status TEXT NOT NULL DEFAULT 'published',
        review_note TEXT NOT NULL DEFAULT '',
        reviewer_nim TEXT,
        reviewed_at TEXT,
        consent_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_portal_records_kind_active ON portal_records(kind, active, created_at DESC);
      CREATE TABLE IF NOT EXISTS portal_record_history (
        id TEXT PRIMARY KEY,
        record_id TEXT NOT NULL REFERENCES portal_records(id) ON DELETE CASCADE,
        actor_account_id TEXT,
        actor_nim TEXT NOT NULL,
        action TEXT NOT NULL,
        from_status TEXT,
        to_status TEXT,
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_portal_record_history_record ON portal_record_history(record_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS knowledge_files (
        id TEXT PRIMARY KEY,
        stored_name TEXT NOT NULL UNIQUE,
        original_name TEXT NOT NULL,
        size INTEGER NOT NULL CHECK (size > 0),
        sha256 TEXT NOT NULL,
        uploaded_by TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_knowledge_files_created_at ON knowledge_files(created_at DESC);
      CREATE TABLE IF NOT EXISTS knowledge_discussions (
        id TEXT PRIMARY KEY,
        resource_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        author_name TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'rejected')),
        created_at TEXT NOT NULL,
        moderated_at TEXT,
        moderated_by TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_knowledge_discussions_resource ON knowledge_discussions(resource_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_knowledge_discussions_status ON knowledge_discussions(status, created_at);
      CREATE TABLE IF NOT EXISTS academic_resources (
        id TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'published', 'rejected')),
        created_by_account_id TEXT NOT NULL,
        submitted_at TEXT,
        reviewed_by_account_id TEXT,
        reviewed_at TEXT,
        review_note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_academic_resources_status ON academic_resources(status, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_academic_resources_owner ON academic_resources(created_by_account_id, updated_at DESC);
      CREATE TABLE IF NOT EXISTS academic_resource_history (
        id TEXT PRIMARY KEY,
        resource_id TEXT NOT NULL REFERENCES academic_resources(id),
        actor_account_id TEXT NOT NULL,
        action TEXT NOT NULL,
        from_status TEXT,
        to_status TEXT,
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_academic_resource_history ON academic_resource_history(resource_id, created_at ASC);
      CREATE TABLE IF NOT EXISTS academic_learning_paths (
        id TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'published', 'rejected')),
        created_by_account_id TEXT NOT NULL,
        submitted_at TEXT,
        reviewed_by_account_id TEXT,
        reviewed_at TEXT,
        review_note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_academic_learning_paths_status ON academic_learning_paths(status, updated_at DESC);
      CREATE TABLE IF NOT EXISTS academic_learning_path_history (
        id TEXT PRIMARY KEY,
        learning_path_id TEXT NOT NULL REFERENCES academic_learning_paths(id),
        actor_account_id TEXT NOT NULL,
        action TEXT NOT NULL,
        from_status TEXT,
        to_status TEXT,
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_academic_learning_path_history ON academic_learning_path_history(learning_path_id, created_at ASC);
      CREATE TABLE IF NOT EXISTS tutoring_requests (
        id TEXT PRIMARY KEY,
        student_account_id TEXT NOT NULL,
        student_name TEXT NOT NULL,
        course TEXT NOT NULL,
        topic TEXT NOT NULL,
        request_message TEXT NOT NULL,
        preferred_time TEXT NOT NULL,
        preferred_slots_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'Diterima' CHECK (status IN ('Diterima', 'Dijadwalkan', 'Selesai', 'Ditolak')),
        tutor_account_id TEXT,
        tutor_name TEXT,
        session_at TEXT,
        duration_minutes INTEGER NOT NULL DEFAULT 60,
        mode TEXT CHECK (mode IN ('online', 'offline') OR mode IS NULL),
        meeting_url TEXT,
        location TEXT,
        admin_note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tutoring_requests_student ON tutoring_requests(student_account_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tutoring_requests_status ON tutoring_requests(status, created_at);
      CREATE TABLE IF NOT EXISTS organization_tasks (
        id TEXT PRIMARY KEY,
        proker_id TEXT,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'review', 'done')),
        pic_name TEXT NOT NULL,
        pic_account_id TEXT,
        due_date TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_organization_tasks_status_due ON organization_tasks(status, due_date);
      CREATE TABLE IF NOT EXISTS organization_task_history (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES organization_tasks(id) ON DELETE CASCADE,
        actor_nim TEXT NOT NULL,
        old_status TEXT,
        new_status TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_organization_task_history_task ON organization_task_history(task_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS office_letters (
        id TEXT PRIMARY KEY,
        letter_number TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        subject TEXT NOT NULL,
        division TEXT NOT NULL,
        target_division TEXT NOT NULL,
        body TEXT NOT NULL,
        tags_json TEXT NOT NULL DEFAULT '[]',
        approval_sequence_json TEXT NOT NULL DEFAULT '[]',
        approval_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('pending_approval', 'approved', 'rejected', 'draft')),
        current_stage INTEGER NOT NULL DEFAULT 0,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_office_letters_status ON office_letters(status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_office_letters_division ON office_letters(division, target_division, created_at DESC);
      CREATE TABLE IF NOT EXISTS inventory_assets (
        id TEXT PRIMARY KEY,
        asset_tag TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        location TEXT NOT NULL DEFAULT '',
        condition TEXT NOT NULL DEFAULT 'Baik' CHECK (condition IN ('Baik', 'Perlu Perbaikan', 'Rusak')),
        status TEXT NOT NULL DEFAULT 'Tersedia' CHECK (status IN ('Tersedia', 'Dipinjam', 'Rusak', 'Hilang')),
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_inventory_assets_status ON inventory_assets(status, category);
      CREATE TABLE IF NOT EXISTS inventory_loans (
        id TEXT PRIMARY KEY,
        asset_id TEXT NOT NULL REFERENCES inventory_assets(id),
        borrower_account_id TEXT NOT NULL,
        borrower_name TEXT NOT NULL,
        purpose TEXT NOT NULL,
        due_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Diajukan' CHECK (status IN ('Diajukan', 'Disetujui', 'Dipinjam', 'Dikembalikan', 'Ditolak', 'Rusak', 'Hilang')),
        requested_at TEXT NOT NULL,
        processed_by TEXT,
        checked_out_at TEXT,
        returned_at TEXT,
        condition_note TEXT NOT NULL DEFAULT ''
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_active_loan_asset ON inventory_loans(asset_id)
        WHERE status IN ('Diajukan', 'Disetujui', 'Dipinjam');
      CREATE INDEX IF NOT EXISTS idx_inventory_loans_borrower ON inventory_loans(borrower_account_id, requested_at DESC);
      CREATE INDEX IF NOT EXISTS idx_inventory_loans_status ON inventory_loans(status, requested_at);
      CREATE TABLE IF NOT EXISTS tutor_profiles (
        account_id TEXT PRIMARY KEY,
        expertise_json TEXT NOT NULL,
        availability_json TEXT NOT NULL,
        bio TEXT NOT NULL DEFAULT '',
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        updated_at TEXT NOT NULL
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
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        recipient_account_id TEXT NOT NULL,
        category TEXT NOT NULL CHECK (category IN ('deadline', 'task', 'submission', 'tutoring')),
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        action_view TEXT NOT NULL DEFAULT '',
        dedupe_key TEXT NOT NULL,
        created_at TEXT NOT NULL,
        read_at TEXT,
        UNIQUE (recipient_account_id, dedupe_key)
      );
      CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created
        ON notifications(recipient_account_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS notification_preferences (
        account_id TEXT PRIMARY KEY,
        preferences_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS site_revisions_created_at ON site_revisions(created_at DESC);

      CREATE TABLE IF NOT EXISTS attendance_records (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        session_id TEXT,
        account_id TEXT,
        nim TEXT NOT NULL,
        name TEXT NOT NULL,
        division TEXT,
        latitude REAL,
        longitude REAL,
        accuracy_m REAL,
        scanned_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_attendance_event_id ON attendance_records(event_id);
      CREATE INDEX IF NOT EXISTS idx_attendance_nim ON attendance_records(nim);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_event_nim ON attendance_records(event_id, nim);

      CREATE TABLE IF NOT EXISTS event_registrations (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        account_id TEXT,
        participant_name TEXT NOT NULL,
        email TEXT NOT NULL,
        ticket_token_hash TEXT NOT NULL,
        ticket_token_encrypted TEXT,
        checked_in_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_event_registration_email ON event_registrations(event_id, email COLLATE NOCASE);
      CREATE INDEX IF NOT EXISTS idx_event_registration_event ON event_registrations(event_id, created_at);

      CREATE TABLE IF NOT EXISTS event_certificates (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        registration_id TEXT NOT NULL UNIQUE,
        issued_at TEXT NOT NULL,
        revoked_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_event_certificates_event ON event_certificates(event_id);
      CREATE TABLE IF NOT EXISTS attendance_certificates (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        attendance_id TEXT NOT NULL UNIQUE REFERENCES attendance_records(id) ON DELETE CASCADE,
        issued_at TEXT NOT NULL,
        revoked_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_attendance_certificates_event ON attendance_certificates(event_id);

      CREATE TABLE IF NOT EXISTS aspirations (
        id TEXT PRIMARY KEY,
        sender_nim_or_anon TEXT NOT NULL,
        category TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Diterima',
        bph_response TEXT DEFAULT '',
        responded_by TEXT DEFAULT '',
        responded_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_aspirations_created_at ON aspirations(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_aspirations_sender ON aspirations(sender_nim_or_anon);

      -- Web Push Subscriptions (Feature: Push Notifications)
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        subscription_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(account_id, endpoint)
      );
      CREATE INDEX IF NOT EXISTS idx_push_subscriptions_account ON push_subscriptions(account_id);

      -- SSO Identities (Feature: Google OAuth2 SSO)
      CREATE TABLE IF NOT EXISTS user_sso_identities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id TEXT NOT NULL,
        provider TEXT NOT NULL CHECK (provider IN ('google')),
        provider_id TEXT NOT NULL,
        email TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(provider, provider_id)
      );
      CREATE INDEX IF NOT EXISTS idx_sso_identities_account ON user_sso_identities(account_id);
      CREATE INDEX IF NOT EXISTS idx_sso_identities_email ON user_sso_identities(provider, email);
    `);

    const currentState = this.sqlite.prepare('SELECT id FROM app_state WHERE id = 1').get();
    if (!currentState) {
      const { seed: initial } = loadInitialDatabaseSeed({
        environment: process.env.NODE_ENV,
        databaseFile: DB_FILE,
        defaultDatabaseFile: DEFAULT_DB_FILE,
        legacyDatabaseFile: LEGACY_DB_FILE,
        createSeed: getInitialSeed
      });
      initial.users = initial.users.map((user) => ({
        ...user,
        account_id: user.account_id || randomUUID(),
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
    this.migrateTransactionalTables();
    this.migrateWorkflowTables();
    this.migrateAcademicTables();
    this.migratePermanentAccountIds();
    this.migrateUncustomizedDefaultLogo();
  }

  migrateAcademicTables() {
    const addColumnIfMissing = (table, column, definition) => {
      const columns = this.sqlite.prepare(`PRAGMA table_info(${table})`).all();
      if (!columns.some((entry) => entry.name === column)) this.sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    };
    addColumnIfMissing('knowledge_discussions', 'parent_id', 'TEXT');
    addColumnIfMissing('knowledge_discussions', 'solution_type', "TEXT NOT NULL DEFAULT 'discussion'");
    addColumnIfMissing('knowledge_discussions', 'selected_solution', 'INTEGER NOT NULL DEFAULT 0 CHECK (selected_solution IN (0, 1))');
    addColumnIfMissing('knowledge_files', 'uploaded_by_account_id', 'TEXT');
    addColumnIfMissing('tutoring_requests', 'preferred_slots_json', "TEXT NOT NULL DEFAULT '[]'");
    addColumnIfMissing('tutoring_requests', 'duration_minutes', 'INTEGER NOT NULL DEFAULT 60');
    this.sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_knowledge_discussions_parent ON knowledge_discussions(parent_id, created_at);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_one_solution_per_resource
        ON knowledge_discussions(resource_id) WHERE selected_solution = 1;
      CREATE INDEX IF NOT EXISTS idx_tutoring_requests_tutor_schedule
        ON tutoring_requests(tutor_account_id, status, session_at);
    `);
  }

  migratePermanentAccountIds() {
    const data = this.read();
    let changed = false;
    const accountsByNim = new Map();
    const seenAccountIds = new Set();
    data.users = data.users.map((user) => {
      let accountId = user.account_id;
      if (!accountId || seenAccountIds.has(accountId)) {
        accountId = randomUUID();
        changed = true;
      }
      seenAccountIds.add(accountId);
      const updated = { ...user, account_id: accountId };
      const key = String(user.nim).toLowerCase();
      if (!accountsByNim.has(key)) accountsByNim.set(key, accountId);
      return updated;
    });
    const attendanceColumns = this.sqlite.prepare('PRAGMA table_info(attendance_records)').all();
    if (!attendanceColumns.some((column) => column.name === 'account_id')) {
      this.sqlite.exec('ALTER TABLE attendance_records ADD COLUMN account_id TEXT');
    }
    this.sqlite.exec('CREATE INDEX IF NOT EXISTS idx_attendance_account_id ON attendance_records(account_id)');
    const updateAttendance = this.sqlite.prepare('UPDATE attendance_records SET account_id = ? WHERE nim = ? AND account_id IS NULL');
    const backfill = this.sqlite.transaction(() => {
      for (const [nim, accountId] of accountsByNim) updateAttendance.run(accountId, nim);
      const rows = this.sqlite.prepare('SELECT id, nim FROM attendance_records WHERE account_id IS NULL').all();
      for (const row of rows) {
        const accountId = accountsByNim.get(String(row.nim).toLowerCase());
        if (accountId) this.sqlite.prepare('UPDATE attendance_records SET account_id = ? WHERE id = ?').run(accountId, row.id);
      }
    });
    backfill();

    if (Array.isArray(data.cadet_evaluations)) {
      let evaluationsChanged = false;
      data.cadet_evaluations = data.cadet_evaluations.map((evaluation) => {
        if (evaluation.account_id || !evaluation.nim) return evaluation;
        const accountId = accountsByNim.get(String(evaluation.nim).toLowerCase());
        if (!accountId) return evaluation;
        evaluationsChanged = true;
        return { ...evaluation, account_id: accountId };
      });
      changed ||= evaluationsChanged;
    }
    if (changed) this.write(data);
  }

  migrateTransactionalTables() {
    const aspirationColumns = this.sqlite.prepare('PRAGMA table_info(aspirations)').all();
    if (!aspirationColumns.some((column) => column.name === 'tracking_token_hash')) {
      this.sqlite.exec('ALTER TABLE aspirations ADD COLUMN tracking_token_hash TEXT');
    }
    if (!aspirationColumns.some((column) => column.name === 'is_rdp_agenda')) {
      this.sqlite.exec('ALTER TABLE aspirations ADD COLUMN is_rdp_agenda INTEGER NOT NULL DEFAULT 0');
    }
    if (!aspirationColumns.some((column) => column.name === 'rdp_notes')) {
      this.sqlite.exec("ALTER TABLE aspirations ADD COLUMN rdp_notes TEXT DEFAULT ''");
    }
    if (!aspirationColumns.some((column) => column.name === 'rdp_scheduled_at')) {
      this.sqlite.exec('ALTER TABLE aspirations ADD COLUMN rdp_scheduled_at TEXT');
    }

    const row = this.sqlite.prepare('SELECT payload FROM app_state WHERE id = 1').get();
    if (!row) return;
    try {
      const data = JSON.parse(row.payload);

      if (Array.isArray(data.aspirations) && data.aspirations.length > 0) {
        const insertAsp = this.sqlite.prepare(`
          INSERT OR IGNORE INTO aspirations (id, sender_nim_or_anon, category, message, status, bph_response, responded_by, responded_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const transaction = this.sqlite.transaction((list) => {
          for (const a of list) {
            insertAsp.run(
              a.id || `asp-${Date.now()}-${Math.random()}`,
              a.sender_nim_or_anon || a.sender || 'Anonim (Mahasiswa)',
              a.category || 'Umum',
              a.message || '',
              a.status || 'Diterima',
              a.bph_response || '',
              a.responded_by || '',
              a.responded_at || null,
              a.created_at || new Date().toISOString()
            );
          }
        });
        transaction(data.aspirations);
      }

      if (Array.isArray(data.attendance_records) && data.attendance_records.length > 0) {
        const insertAtt = this.sqlite.prepare(`
          INSERT OR IGNORE INTO attendance_records (id, event_id, nim, name, division, scanned_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        const transaction = this.sqlite.transaction((list) => {
          for (const att of list) {
            insertAtt.run(
              att.id || `att-${Date.now()}-${Math.random()}`,
              att.event_id,
              att.nim,
              att.name,
              att.division || '',
              att.scanned_at || new Date().toISOString(),
              att.created_at || att.scanned_at || new Date().toISOString()
            );
          }
        });
        transaction(data.attendance_records);
      }
    } catch (e) {
      console.error('[PRTS DB MIGRATION WARNING]', e.message);
    }
  }

  migrateWorkflowTables() {
    const addColumnIfMissing = (table, column, definition) => {
      const columns = this.sqlite.prepare(`PRAGMA table_info(${table})`).all();
      if (!columns.some((entry) => entry.name === column)) {
        this.sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      }
    };
    addColumnIfMissing('attendance_records', 'session_id', 'TEXT');
    addColumnIfMissing('attendance_records', 'latitude', 'REAL');
    addColumnIfMissing('attendance_records', 'longitude', 'REAL');
    addColumnIfMissing('attendance_records', 'accuracy_m', 'REAL');
    addColumnIfMissing('event_registrations', 'ticket_token_encrypted', 'TEXT');
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS tech_articles (
        id TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL,
        author_account_id TEXT NOT NULL,
        author_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'published', 'needs_revision', 'rejected')),
        review_note TEXT NOT NULL DEFAULT '',
        reviewed_by_account_id TEXT,
        reviewed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tech_articles_publication ON tech_articles(status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tech_articles_owner ON tech_articles(author_account_id, updated_at DESC);
      CREATE TABLE IF NOT EXISTS tech_article_history (
        id TEXT PRIMARY KEY,
        article_id TEXT NOT NULL REFERENCES tech_articles(id) ON DELETE CASCADE,
        actor_account_id TEXT NOT NULL,
        action TEXT NOT NULL,
        from_status TEXT,
        to_status TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tech_article_history_article ON tech_article_history(article_id, created_at ASC);
      CREATE TABLE IF NOT EXISTS project_calls (
        id TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL,
        owner_account_id TEXT NOT NULL,
        owner_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'published', 'rejected', 'closed')),
        review_note TEXT NOT NULL DEFAULT '',
        reviewed_by_account_id TEXT,
        reviewed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_project_calls_status ON project_calls(status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_project_calls_owner ON project_calls(owner_account_id, updated_at DESC);
      CREATE TABLE IF NOT EXISTS project_call_applications (
        id TEXT PRIMARY KEY,
        call_id TEXT NOT NULL REFERENCES project_calls(id) ON DELETE CASCADE,
        applicant_account_id TEXT NOT NULL,
        applicant_name TEXT NOT NULL,
        role TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (call_id, applicant_account_id)
      );
      CREATE INDEX IF NOT EXISTS idx_project_call_applications_applicant ON project_call_applications(applicant_account_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS career_mentorship_requests (
        id TEXT PRIMARY KEY,
        alumni_record_id TEXT NOT NULL REFERENCES portal_records(id) ON DELETE CASCADE,
        mentor_account_id TEXT,
        mentor_name TEXT NOT NULL,
        student_account_id TEXT NOT NULL,
        student_name TEXT NOT NULL,
        session_type TEXT NOT NULL CHECK (session_type IN ('technical_interview', 'cv_review', 'code_review')),
        topic TEXT NOT NULL,
        preferred_at TEXT NOT NULL,
        preferred_mode TEXT NOT NULL CHECK (preferred_mode IN ('online', 'offline')),
        duration_minutes INTEGER NOT NULL DEFAULT 30,
        status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'confirmed', 'declined', 'completed')),
        meeting_mode TEXT CHECK (meeting_mode IN ('online', 'offline') OR meeting_mode IS NULL),
        meeting_url TEXT NOT NULL DEFAULT '',
        meeting_location TEXT NOT NULL DEFAULT '',
        mentor_note TEXT NOT NULL DEFAULT '',
        confirmed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_career_mentorship_mentor ON career_mentorship_requests(mentor_account_id, status, preferred_at);
      CREATE INDEX IF NOT EXISTS idx_career_mentorship_student ON career_mentorship_requests(student_account_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS inventory_loan_history (
        id TEXT PRIMARY KEY,
        loan_id TEXT NOT NULL REFERENCES inventory_loans(id) ON DELETE CASCADE,
        actor_account_id TEXT,
        from_status TEXT,
        to_status TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_inventory_loan_history_loan ON inventory_loan_history(loan_id, created_at ASC);
      CREATE TABLE IF NOT EXISTS attendance_sessions (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        radius_m INTEGER NOT NULL,
        starts_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        revoked_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_attendance_sessions_active ON attendance_sessions(event_id, expires_at) WHERE revoked_at IS NULL;
    `);
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS office_letters (
        id TEXT PRIMARY KEY,
        letter_number TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        subject TEXT NOT NULL,
        division TEXT NOT NULL,
        target_division TEXT NOT NULL,
        body TEXT NOT NULL,
        tags_json TEXT NOT NULL DEFAULT '[]',
        approval_sequence_json TEXT NOT NULL DEFAULT '[]',
        approval_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('pending_approval', 'approved', 'rejected', 'draft')),
        current_stage INTEGER NOT NULL DEFAULT 0,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_office_letters_status ON office_letters(status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_office_letters_division ON office_letters(division, target_division, created_at DESC);
    `);
    addColumnIfMissing('portal_records', 'submitter_account_id', 'TEXT');
    addColumnIfMissing('portal_records', 'review_status', "TEXT NOT NULL DEFAULT 'published'");
    addColumnIfMissing('portal_records', 'review_note', "TEXT NOT NULL DEFAULT ''");
    addColumnIfMissing('portal_records', 'reviewer_nim', 'TEXT');
    addColumnIfMissing('portal_records', 'reviewed_at', 'TEXT');
    addColumnIfMissing('portal_records', 'consent_at', 'TEXT');
    addColumnIfMissing('organization_tasks', 'pic_account_id', 'TEXT');
    this.sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_portal_records_review ON portal_records(review_status, kind, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_portal_record_history_record ON portal_record_history(record_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_organization_tasks_pic_account ON organization_tasks(pic_account_id);
      CREATE INDEX IF NOT EXISTS idx_organization_task_history_task ON organization_task_history(task_id, created_at DESC);
    `);
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

  write(data, auditEntry = null, sideEffect = null) {
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
      if (sideEffect) sideEffect();
    });
    transaction();
    return true;
  }

  // --- Delegations & Mandates (Pasal 57 ART) ---
  getAllDelegations() {
    return this.financeRepository.getAllDelegations();
  }

  getDelegationsByAccount(accountId) {
    return this.financeRepository.getDelegationsByAccount(accountId);
  }

  createDelegation(data) {
    return this.financeRepository.createDelegation(data);
  }

  updateDelegationStatus(id, updateData) {
    return this.financeRepository.updateDelegationStatus(id, updateData);
  }

  submitDelegationLpd(id, lpdText) {
    return this.financeRepository.submitDelegationLpd(id, lpdText);
  }

  setAspirationRdpAgenda(id, rdpData) {
    return this.financeRepository.setAspirationRdpAgenda(id, rdpData);
  }

  getSiteState() {
    return this.siteRepository.getSiteState();
  }

  isAccountLinkedToSite(accountId) {
    const referencesAccount = (config) => (config?.content?.data?.generations || []).some((generation) => {
      return Object.values(generation.leadership || {}).some((leader) => leader.accountId === accountId)
        || (generation.divisions || []).some((division) => division.coordinatorAccountId === accountId
          || (division.members || []).some((member) => typeof member !== 'string' && member.accountId === accountId));
    });
    const state = this.getSiteState();
    if (referencesAccount(state.draft) || referencesAccount(state.published)) return true;
    return this.sqlite.prepare('SELECT payload FROM site_revisions').all()
      .some(({ payload }) => referencesAccount(JSON.parse(payload)));
  }

  saveSiteDraft(config, actorNim, restoredFrom = null, expectedRevisionId = null) {
    return this.siteRepository.saveSiteDraft(config, actorNim, restoredFrom, expectedRevisionId);
  }

  publishSite(actorNim) {
    return this.siteRepository.publishSite(actorNim);
  }

  getSiteRevision(id) {
    return this.siteRepository.getSiteRevision(id);
  }

  listSiteRevisions(limit = 30) {
    return this.siteRepository.listSiteRevisions(limit);
  }

  addAsset(asset) {
    return this.siteRepository.addAsset(asset);
  }

  getAsset(id) {
    return this.siteRepository.getAsset(id);
  }

  isAssetReferencedByRevision(id) {
    return this.siteRepository.isAssetReferencedByRevision(id);
  }

  isAssetReferencedByUser(id) {
    return this.siteRepository.isAssetReferencedByUser(id);
  }

  assetExists(id, kind) {
    return this.siteRepository.assetExists(id, kind);
  }

  listAssets() {
    return this.siteRepository.listAssets();
  }

  listSoundtracks(includeInactive = false) {
    return this.siteRepository.listSoundtracks(includeInactive);
  }

  getSoundtrack(id) {
    return this.siteRepository.getSoundtrack(id);
  }

  addSoundtrack(track) {
    return this.siteRepository.addSoundtrack(track);
  }

  updateSoundtrack(id, updates) {
    return this.siteRepository.updateSoundtrack(id, updates);
  }

  reorderSoundtracks(ids) {
    return this.siteRepository.reorderSoundtracks(ids);
  }

  deleteSoundtrack(id) {
    return this.siteRepository.deleteSoundtrack(id);
  }

  // --- Portal Records (Showcase, Career/Alumni) ---
  listPortalRecords(kind, includeInactive = false) {
    return this.portalRepository.listPortalRecords(kind, includeInactive);
  }

  getPortalRecord(id) {
    return this.portalRepository.getPortalRecord(id);
  }

  createPortalRecord(kind, payload, createdBy, options = {}) {
    return this.portalRepository.createPortalRecord(kind, payload, createdBy, options);
  }

  updatePortalRecord(id, payload, active) {
    return this.portalRepository.updatePortalRecord(id, payload, active);
  }

  resubmitPortalRecord(id, accountId, actorNim, payload, consentAt = null) {
    return this.portalRepository.resubmitPortalRecord(id, accountId, actorNim, payload, consentAt);
  }

  reviewPortalRecord(id, action, actorAccountId, actorNim, note = '') {
    return this.portalRepository.reviewPortalRecord(id, action, actorAccountId, actorNim, note);
  }

  listMyPortalRecords(accountId) {
    return this.portalRepository.listMyPortalRecords(accountId);
  }

  listPortalRecordHistory(recordId) {
    return this.portalRepository.listPortalRecordHistory(recordId);
  }

  insertPortalRecordHistory(recordId, actorAccountId, actorNim, action, fromStatus, toStatus, note) {
    return this.portalRepository.insertPortalRecordHistory(recordId, actorAccountId, actorNim, action, fromStatus, toStatus, note);
  }

  deletePortalRecord(id) {
    return this.portalRepository.deletePortalRecord(id);
  }

  // --- Career Mentorship ---
  createCareerMentorshipRequest(alumniRecordId, student, request) {
    return this.portalRepository.createCareerMentorshipRequest(alumniRecordId, student, request);
  }

  listCareerMentorshipRequests(accountId = null) {
    return this.portalRepository.listCareerMentorshipRequests(accountId);
  }

  getCareerMentorshipRequest(id) {
    return this.portalRepository.getCareerMentorshipRequest(id);
  }

  updateCareerMentorshipRequest(id, actorAccountId, status, details = {}, canManageAll = false) {
    return this.portalRepository.updateCareerMentorshipRequest(id, actorAccountId, status, details, canManageAll);
  }

  // --- Tech Articles ---
  createTechArticle(accountId, authorName, payload) {
    return this.portalRepository.createTechArticle(accountId, authorName, payload);
  }

  mapTechArticle(row, includeHistory = false) {
    return this.portalRepository.mapTechArticle(row, includeHistory);
  }

  listTechArticles(status = 'published') {
    return this.portalRepository.listTechArticles(status);
  }

  listMyTechArticles(accountId) {
    return this.portalRepository.listMyTechArticles(accountId);
  }

  listPendingTechArticles() {
    return this.portalRepository.listPendingTechArticles();
  }

  resubmitTechArticle(id, accountId, payload) {
    return this.portalRepository.resubmitTechArticle(id, accountId, payload);
  }

  reviewTechArticle(id, status, note, reviewerAccountId) {
    return this.portalRepository.reviewTechArticle(id, status, note, reviewerAccountId);
  }

  listTechArticleHistory(articleId) {
    return this.portalRepository.listTechArticleHistory(articleId);
  }

  insertTechArticleHistory(articleId, actorAccountId, action, fromStatus, toStatus, note) {
    return this.portalRepository.insertTechArticleHistory(articleId, actorAccountId, action, fromStatus, toStatus, note);
  }

  // --- Project Calls ---
  createProjectCall(accountId, ownerName, payload) {
    return this.portalRepository.createProjectCall(accountId, ownerName, payload);
  }

  mapProjectCall(row, includePrivate = false) {
    return this.portalRepository.mapProjectCall(row, includePrivate);
  }

  getProjectCall(id) {
    return this.portalRepository.getProjectCall(id);
  }

  listProjectCalls(status = 'published') {
    return this.portalRepository.listProjectCalls(status);
  }

  listMyProjectCalls(accountId) {
    return this.portalRepository.listMyProjectCalls(accountId);
  }

  listPendingProjectCalls() {
    return this.portalRepository.listPendingProjectCalls();
  }

  reviewProjectCall(id, status, note, reviewerAccountId) {
    return this.portalRepository.reviewProjectCall(id, status, note, reviewerAccountId);
  }

  closeProjectCall(id, ownerAccountId) {
    return this.portalRepository.closeProjectCall(id, ownerAccountId);
  }

  createProjectCallApplication(callId, accountId, applicantName, payload) {
    return this.portalRepository.createProjectCallApplication(callId, accountId, applicantName, payload);
  }

  listProjectCallApplications(callId) {
    return this.portalRepository.listProjectCallApplications(callId);
  }

  listMyProjectCallApplications(accountId) {
    return this.portalRepository.listMyProjectCallApplications(accountId);
  }

  updateProjectCallApplication(id, callId, ownerAccountId, status) {
    return this.portalRepository.updateProjectCallApplication(id, callId, ownerAccountId, status);
  }

  deleteAsset(id) {
    return this.siteRepository.deleteAsset(id);
  }

  addKnowledgeFile(file) {
    return this.academicRepository.addKnowledgeFile(...arguments);
  }

  getKnowledgeFile(id) {
    return this.academicRepository.getKnowledgeFile(...arguments);
  }

  listKnowledgeFiles(ownerAccountId = null) {
    return this.academicRepository.listKnowledgeFiles(...arguments);
  }

  deleteKnowledgeFile(id) {
    return this.academicRepository.deleteKnowledgeFile(...arguments);
  }

  isKnowledgeFileReferenced(id) {
    return this.academicRepository.isKnowledgeFileReferenced(...arguments);
  }

  createKnowledgeDiscussion({ resourceId, accountId, authorName, message, parentId = null, solutionType = 'discussion' }) {
    return this.academicRepository.createKnowledgeDiscussion(...arguments);
  }

  getKnowledgeDiscussions(resourceId, accountId = null) {
    return this.academicRepository.getKnowledgeDiscussions(...arguments);
  }

  listPendingKnowledgeDiscussions() {
    return this.academicRepository.listPendingKnowledgeDiscussions(...arguments);
  }

  moderateKnowledgeDiscussion(id, status, moderatorId) {
    return this.academicRepository.moderateKnowledgeDiscussion(...arguments);
  }

  selectKnowledgeSolution(id, moderator) {
    return this.academicRepository.selectKnowledgeSolution(...arguments);
  }

  getAcademicTableNames(kind) {
    if (kind === 'resource') return { table: 'academic_resources', history: 'academic_resource_history', foreignKey: 'resource_id' };
    if (kind === 'learning_path') return { table: 'academic_learning_paths', history: 'academic_learning_path_history', foreignKey: 'learning_path_id' };
    throw new Error('Jenis konten akademik tidak valid.');
  }

  mapAcademicRecord(row) {
    if (!row) return null;
    return {
      id: row.id,
      ...JSON.parse(row.payload_json),
      status: row.status,
      created_by_account_id: row.created_by_account_id,
      submitted_at: row.submitted_at,
      reviewed_by_account_id: row.reviewed_by_account_id,
      reviewed_at: row.reviewed_at,
      review_note: row.review_note,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  listAcademicRecords(kind, { status = null, ownerAccountId = null } = {}) {
    return this.academicRepository.listAcademicRecords(...arguments);
  }

  getAcademicRecord(kind, id) {
    return this.academicRepository.getAcademicRecord(...arguments);
  }

  getPublicAcademicRecords(kind) {
    return this.academicRepository.getPublicAcademicRecords(...arguments);
  }

  getAcademicRecordHistory(kind, id) {
    const { history, foreignKey } = this.getAcademicTableNames(kind);
    return this.sqlite.prepare(`SELECT id, actor_account_id, action, from_status, to_status, note, created_at
      FROM ${history} WHERE ${foreignKey} = ? ORDER BY created_at ASC`).all(id);
  }

  saveAcademicDraft(kind, id, payload, actorAccountId, canEditAny = false) {
    return this.academicRepository.saveAcademicDraft(...arguments);
  }

  submitAcademicRecord(kind, id, actorAccountId, canSubmitAny = false) {
    return this.academicRepository.submitAcademicRecord(...arguments);
  }

  reviewAcademicRecord(kind, id, status, reviewerAccountId, note = '') {
    return this.academicRepository.reviewAcademicRecord(...arguments);
  }

  createTutoringRequest(request) {
    return this.academicRepository.createTutoringRequest(...arguments);
  }

  getMyTutoringRequests(accountId) {
    return this.academicRepository.getMyTutoringRequests(...arguments);
  }

  getTutoringRequest(id) {
    return this.academicRepository.getTutoringRequest(...arguments);
  }

  listTutoringRequests() {
    return this.academicRepository.listTutoringRequests(...arguments);
  }

  saveTutorProfile(accountId, profile) {
    return this.academicRepository.saveTutorProfile(...arguments);
  }

  getTutorProfile(accountId) {
    return this.academicRepository.getTutorProfile(...arguments);
  }

  getActiveTutorProfiles() {
    return this.academicRepository.getActiveTutorProfiles(...arguments);
  }

  getTutorMatches(request) {
    return this.academicRepository.getTutorMatches(...arguments);
  }

  tutorAvailableAt(accountId, sessionAt, mode, durationMinutes = 60) {
    return this.academicRepository.tutorAvailableAt(...arguments);
  }

  tutorHasScheduleConflict(accountId, sessionAt, durationMinutes = 60, excludeRequestId = null) {
    return this.academicRepository.tutorHasScheduleConflict(...arguments);
  }

  createInventoryAsset(asset) {
    return this.inventoryRepository.createInventoryAsset(asset);
  }

  listInventoryAssets() {
    return this.inventoryRepository.listInventoryAssets();
  }

  requestInventoryLoan(params) {
    return this.inventoryRepository.requestInventoryLoan(params);
  }

  getMyInventoryLoans(accountId) {
    return this.inventoryRepository.getMyInventoryLoans(accountId);
  }

  listInventoryLoans() {
    return this.inventoryRepository.listInventoryLoans();
  }

  enrichInventoryLoan(loan) {
    return this.inventoryRepository.enrichInventoryLoan(loan);
  }

  listInventoryLoanHistory(loanId) {
    return this.inventoryRepository.listInventoryLoanHistory(loanId);
  }

  insertInventoryLoanHistory(loanId, actorAccountId, fromStatus, toStatus, note, createdAt) {
    return this.inventoryRepository.insertInventoryLoanHistory(loanId, actorAccountId, fromStatus, toStatus, note, createdAt);
  }

  updateInventoryLoan(id, status, processor, conditionNote = '') {
    return this.inventoryRepository.updateInventoryLoan(id, status, processor, conditionNote);
  }

  scheduleTutoringRequest(id, schedule) {
    return this.academicRepository.scheduleTutoringRequest(...arguments);
  }

  setTutoringRequestStatus(id, status, adminNote) {
    return this.academicRepository.setTutoringRequestStatus(...arguments);
  }

  getAuditLogs(limit = 50) {
    return this.sqlite.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?').all(limit).map(row => {
      let parsed = {};
      try { parsed = JSON.parse(row.details_json || '{}'); } catch (e) {}
      return {
        id: row.id,
        actor_nim: row.actor_nim,
        actor_role: row.actor_role,
        action: row.action,
        target_type: row.target_type,
        target_id: row.target_id,
        details: parsed,
        created_at: row.created_at
      };
    });
  }

  resetUserPasswordAdmin(nim, newPassword, actor = null) {
    return this.userSqlRepository.resetUserPasswordAdmin(nim, newPassword, actor);
  }

    insertAudit({ actorNim, actorRole, action, targetType, targetId, details, createdAt = new Date().toISOString() }) {
    this.sqlite.prepare(`INSERT INTO audit_log (id, actor_nim, actor_role, action, target_type, target_id, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(randomUUID(), actorNim, actorRole, action, targetType, targetId, JSON.stringify(details), createdAt);
  }

  getNotificationPreferences(accountId) {
    const row = this.sqlite.prepare('SELECT preferences_json FROM notification_preferences WHERE account_id = ?').get(accountId);
    const defaults = {
      deadline: true,
      task: true,
      submission: true,
      tutoring: true,
      deadline_days: 3,
      tutoring_reminder_hours: 24
    };
    return row ? { ...defaults, ...JSON.parse(row.preferences_json) } : defaults;
  }

  updateNotificationPreferences(accountId, preferences) {
    const updatedAt = new Date().toISOString();
    this.sqlite.prepare(`INSERT INTO notification_preferences (account_id, preferences_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET preferences_json = excluded.preferences_json, updated_at = excluded.updated_at`)
      .run(accountId, JSON.stringify(preferences), updatedAt);
    return this.getNotificationPreferences(accountId);
  }

  createNotification({ recipientAccountId, category, title, message, actionView = '', dedupeKey, createdAt = new Date().toISOString() }) {
    const id = randomUUID();
    const result = this.sqlite.prepare(`INSERT OR IGNORE INTO notifications
      (id, recipient_account_id, category, title, message, action_view, dedupe_key, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, recipientAccountId, category, title, message, actionView, dedupeKey, createdAt
    );
    return result.changes ? id : null;
  }

  listNotifications(accountId, limit = 100) {
    return this.sqlite.prepare(`SELECT id, category, title, message, action_view, created_at, read_at
      FROM notifications WHERE recipient_account_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`)
      .all(accountId, limit)
      .map((notification) => ({ ...notification, is_read: Boolean(notification.read_at) }));
  }

  getNotificationUnreadCount(accountId) {
    return this.sqlite.prepare('SELECT COUNT(*) AS count FROM notifications WHERE recipient_account_id = ? AND read_at IS NULL')
      .get(accountId).count;
  }

  markNotificationRead(accountId, id) {
    const result = this.sqlite.prepare(`UPDATE notifications SET read_at = ?
      WHERE recipient_account_id = ? AND id = ? AND read_at IS NULL`)
      .run(new Date().toISOString(), accountId, id);
    return result.changes > 0 || Boolean(this.sqlite.prepare(
      'SELECT id FROM notifications WHERE recipient_account_id = ? AND id = ? AND read_at IS NOT NULL'
    ).get(accountId, id));
  }

  markAllNotificationsRead(accountId) {
    return this.sqlite.prepare(`UPDATE notifications SET read_at = ?
      WHERE recipient_account_id = ? AND read_at IS NULL`)
      .run(new Date().toISOString(), accountId).changes;
  }

  listUpcomingAssignedTasks(accountId) {
    return this.sqlite.prepare(`SELECT id, title, due_date FROM organization_tasks
      WHERE pic_account_id = ? AND status != 'done' AND due_date IS NOT NULL`).all(accountId);
  }

  listUpcomingTutoringSessions(accountId) {
    return this.sqlite.prepare(`SELECT id, course, topic, session_at FROM tutoring_requests
      WHERE student_account_id = ? AND status = 'Dijadwalkan' AND session_at IS NOT NULL`).all(accountId);
  }

  listAudit(limit = 100) {
    return this.sqlite.prepare('SELECT id, actor_nim, actor_role, action, target_type, target_id, details_json, created_at FROM audit_log ORDER BY created_at DESC LIMIT ?')
      .all(limit)
      .map(({ details_json, ...entry }) => ({ ...entry, details: JSON.parse(details_json) }));
  }

  // --- Users & Cadets ---
  findUserByNIM(nim) {
    return this.userSqlRepository.findUserByNIM(nim);
  }

  findUserById(accountId) {
    return this.userSqlRepository.findUserById(accountId);
  }

  updateUserProfile(accountId, updates, actor) {
    return this.userSqlRepository.updateUserProfile(accountId, updates, actor);
  }

  getAllCadets() {
    return this.userSqlRepository.getAllCadets();
  }

  updateCadetStage(nim, newStage) {
    return this.userSqlRepository.updateCadetStage(nim, newStage);
  }

  async createUser(userData) {
    return this.userSqlRepository.createUser(userData);
  }

  async changePassword(nim, newPassword) {
    return this.userSqlRepository.changePassword(nim, newPassword);
  }

  invalidateSessions(nim) {
    return this.userSqlRepository.invalidateSessions(nim);
  }

  getAdminCount() {
    return this.userSqlRepository.getAdminCount();
  }

  updateUserAdmin(nim, updates, actor = null) {
    return this.userSqlRepository.updateUserAdmin(nim, updates, actor);
  }

  updateUserRole(nim, role, actor = null) {
    return this.userSqlRepository.updateUserRole(nim, role, actor);
  }

  setAcademicCuratorPermission(nim, enabled, actor) {
    return this.userSqlRepository.setAcademicCuratorPermission(nim, enabled, actor);
  }

  deleteUser(nim) {
    return this.userSqlRepository.deleteUser(nim);
  }

  // --- Program Kerja / Missions ---
  getAllProker() {
    return this.operationsRepository.getAllProker();
  }

  updateProker(id, updates) {
    return this.operationsRepository.updateProker(id, updates);
  }

  createProker(prokerData) {
    return this.operationsRepository.createProker(prokerData);
  }

  listOrganizationTasks() {
    return this.operationsRepository.listOrganizationTasks();
  }

  getOrganizationTask(id) {
    return this.operationsRepository.getOrganizationTask(id);
  }

  createOrganizationTask(task, actorNim) {
    return this.operationsRepository.createOrganizationTask(task, actorNim);
  }

  updateOrganizationTask(id, updates, actorNim) {
    return this.operationsRepository.updateOrganizationTask(id, updates, actorNim);
  }

  listOrganizationTaskHistory(taskId) {
    return this.operationsRepository.listOrganizationTaskHistory(taskId);
  }

  insertOrganizationTaskHistory(taskId, actorNim, oldStatus, newStatus, createdAt) {
    return this.operationsRepository.insertOrganizationTaskHistory(taskId, actorNim, oldStatus, newStatus, createdAt);
  }

  listOfficeLetters(filters = {}) {
    return this.operationsRepository.listOfficeLetters(filters);
  }

  createOfficeLetter(letter, actor) {
    return this.operationsRepository.createOfficeLetter(letter, actor);
  }

  approveOfficeLetter(letterId, stepName, approved, note, actor) {
    return this.operationsRepository.approveOfficeLetter(letterId, stepName, approved, note, actor);
  }

  // --- Calendar ---
  getAllCalendarEvents() {
    return this.read().academic_calendar;
  }

  createCalendarEvent(eventData) {
    const db = this.read();
    const newEvent = {
      id: `cal-${randomUUID()}`,
      date_str: eventData.date_str,
      title: eventData.title,
      type: eventData.type || 'proker',
      division: eventData.division || 'Umum',
      location: eventData.location || 'Kampus UMB',
      desc: eventData.desc || '',
      integrated_with: eventData.integrated_with || 'Divisi HMIF',
      registration_url: eventData.registration_url || '',
      is_exam_period: Boolean(eventData.is_exam_period),
      registration_open: Boolean(eventData.registration_open),
      capacity: eventData.registration_open ? Number(eventData.capacity) : null
    };
    db.academic_calendar.push(newEvent);
    this.write(db);
    return newEvent;
  }

  listMyEventTickets(accountId) {
    const events = new Map(this.getAllCalendarEvents().map((event) => [event.id, event]));
    return this.sqlite.prepare(`SELECT id, event_id, participant_name, ticket_token_encrypted, checked_in_at, created_at
      FROM event_registrations WHERE account_id = ? ORDER BY created_at DESC`).all(accountId)
      .map((registration) => ({
        ...registration,
        event: events.get(registration.event_id) ? {
          id: registration.event_id,
          title: events.get(registration.event_id).title,
          date: events.get(registration.event_id).date_str,
          location: events.get(registration.event_id).location || ''
        } : null
      }))
      .filter((registration) => registration.event);
  }

  storeMyEventTicketToken(registrationId, accountId, tokenHash, encryptedToken) {
    const result = this.sqlite.prepare(`UPDATE event_registrations SET ticket_token_hash = ?, ticket_token_encrypted = ?
      WHERE id = ? AND account_id = ? AND checked_in_at IS NULL`).run(tokenHash, encryptedToken, registrationId, accountId);
    return result.changes > 0;
  }

  registerEvent(eventId, registrationData) {
    const register = this.sqlite.transaction((data) => {
      const event = this.read().academic_calendar.find((item) => item.id === eventId);
      if (!event || !event.registration_open) return { error: 'Pendaftaran event tidak tersedia.' };
      if (event.date_str < getHmifCalendarDate()) return { error: 'Pendaftaran event telah ditutup.' };
      const existing = this.sqlite.prepare('SELECT id FROM event_registrations WHERE event_id = ? AND email = ? COLLATE NOCASE').get(eventId, data.email);
      if (existing) return { error: 'Email ini sudah terdaftar pada event tersebut.' };
      const currentCount = this.sqlite.prepare('SELECT COUNT(*) AS count FROM event_registrations WHERE event_id = ?').get(eventId).count;
      if (event.capacity && currentCount >= event.capacity) return { error: 'Kuota pendaftaran event telah terpenuhi.' };
      const registration = {
        id: `ticket-${randomUUID()}`,
        event_id: eventId,
        account_id: data.accountId || null,
        participant_name: data.name,
        email: data.email,
        ticket_token_hash: data.ticketTokenHash,
        ticket_token_encrypted: data.ticketTokenEncrypted || null,
        checked_in_at: null,
        created_at: new Date().toISOString()
      };
      this.sqlite.prepare(`INSERT INTO event_registrations
        (id, event_id, account_id, participant_name, email, ticket_token_hash, ticket_token_encrypted, checked_in_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        registration.id, registration.event_id, registration.account_id, registration.participant_name,
        registration.email, registration.ticket_token_hash, registration.ticket_token_encrypted, registration.checked_in_at, registration.created_at
      );
      return { registration, event };
    });
    return register.immediate(registrationData);
  }

  checkInEventRegistration(eventId, registrationId, ticketTokenHash, now = new Date()) {
    const event = this.read().academic_calendar.find((item) => item.id === eventId);
    if (!event) return null;
    const ticket = this.sqlite.prepare(`SELECT checked_in_at FROM event_registrations
      WHERE event_id = ? AND id = ? AND ticket_token_hash = ?`).get(eventId, registrationId, ticketTokenHash);
    if (!ticket || ticket.checked_in_at) return null;
    if (event.date_str !== getHmifCalendarDate(now)) {
      return { error: 'Presensi hanya dapat dicatat pada tanggal event (Asia/Jakarta).', status: 409 };
    }
    const checkedInAt = now.toISOString();
    const update = this.sqlite.prepare(`UPDATE event_registrations SET checked_in_at = ?
      WHERE event_id = ? AND id = ? AND ticket_token_hash = ? AND checked_in_at IS NULL`);
    const result = update.run(checkedInAt, eventId, registrationId, ticketTokenHash);
    if (!result.changes) return null;
    return this.sqlite.prepare('SELECT id, event_id, checked_in_at FROM event_registrations WHERE id = ?').get(registrationId);
  }

  issueEventCertificates(eventId) {
    const issue = this.sqlite.transaction(() => {
      const eligibleParticipants = this.sqlite.prepare(`SELECT id FROM event_registrations
        WHERE event_id = ? AND checked_in_at IS NOT NULL
        AND id NOT IN (SELECT registration_id FROM event_certificates WHERE revoked_at IS NULL)`).all(eventId);
      const eligibleMembers = this.sqlite.prepare(`SELECT id FROM attendance_records
        WHERE event_id = ? AND id NOT IN (SELECT attendance_id FROM attendance_certificates WHERE revoked_at IS NULL)`).all(eventId);
      const now = new Date().toISOString();
      const insertParticipant = this.sqlite.prepare(`INSERT INTO event_certificates (id, event_id, registration_id, issued_at, revoked_at)
        VALUES (?, ?, ?, ?, NULL)`);
      const insertMember = this.sqlite.prepare(`INSERT INTO attendance_certificates (id, event_id, attendance_id, issued_at, revoked_at)
        VALUES (?, ?, ?, ?, NULL)`);
      const certificateIds = eligibleParticipants.map(({ id }) => {
        const certificateId = randomUUID();
        insertParticipant.run(certificateId, eventId, id, now);
        return certificateId;
      });
      for (const { id } of eligibleMembers) {
        const certificateId = randomUUID();
        insertMember.run(certificateId, eventId, id, now);
        certificateIds.push(certificateId);
      }
      return certificateIds;
    });
    return issue.immediate();
  }

  getVerifiedCertificate(certificateId) {
    const participantCertificate = this.sqlite.prepare(`SELECT event_id, registration_id, issued_at FROM event_certificates
      WHERE id = ? AND revoked_at IS NULL`).get(certificateId);
    if (participantCertificate) {
      const registration = this.sqlite.prepare('SELECT participant_name FROM event_registrations WHERE id = ?').get(participantCertificate.registration_id);
      const event = this.read().academic_calendar.find((item) => item.id === participantCertificate.event_id);
      if (!registration || !event) return null;
      return {
        id: certificateId,
        participant_name: registration.participant_name,
        recipient_type: 'Peserta',
        event_title: event.title,
        event_date: event.date_str,
        issued_at: participantCertificate.issued_at
      };
    }

    const attendanceCertificate = this.sqlite.prepare(`SELECT event_id, attendance_id, issued_at FROM attendance_certificates
      WHERE id = ? AND revoked_at IS NULL`).get(certificateId);
    if (!attendanceCertificate) return null;
    const attendance = this.sqlite.prepare('SELECT name FROM attendance_records WHERE id = ?').get(attendanceCertificate.attendance_id);
    const event = this.read().academic_calendar.find((item) => item.id === attendanceCertificate.event_id);
    if (!attendance || !event) return null;
    return {
      id: certificateId,
      participant_name: attendance.name,
      recipient_type: 'Panitia/Anggota',
      event_title: event.title,
      event_date: event.date_str,
      issued_at: attendanceCertificate.issued_at
    };
  }

  // --- Aspirations ---
  getAllAspirations() {
    return this.financeRepository.getAllAspirations();
  }

  createAspiration(aspData) {
    return this.financeRepository.createAspiration(aspData);
  }

  encryptLegacyAspirationData(encryptText) {
    return this.financeRepository.encryptLegacyAspirationData(encryptText);
  }

  getAspirationStatus(id, trackingTokenHash) {
    return this.financeRepository.getAspirationStatus(id, trackingTokenHash);
  }

  respondAspiration(id, responseText, newStatus = 'Ditindaklanjuti', responder = '') {
    return this.financeRepository.respondAspiration(id, responseText, newStatus, responder);
  }

  getPublicRdpAgendas() {
    return this.financeRepository.getPublicRdpAgendas();
  }

  // --- Financial Ledger ---
  getFinancialLedger() {
    return this.financeRepository.getFinancialLedger();
  }

  addFinancialTransaction(txData, receipt = null) {
    return this.financeRepository.addFinancialTransaction(txData, receipt);
  }

  // --- Cadet Quiz & Evaluations ---
  saveQuizEvaluation(evalData) {
    return this.financeRepository.saveQuizEvaluation(evalData);
  }

  getCadetEvaluations(nim) {
    return this.financeRepository.getCadetEvaluations(nim, this.findUserByNIM.bind(this));
  }

  getCadetEvaluationsByAccountId(accountId) {
    return this.financeRepository.getCadetEvaluationsByAccountId(accountId);
  }

  // --- Attendance / Presensi ---
  createAttendanceSession(params) {
    return this.eventsRepository.createAttendanceSession(params);
  }

  getAttendanceSession(id, eventId) {
    return this.eventsRepository.getAttendanceSession(id, eventId);
  }

  recordAttendance(recordData) {
    return this.eventsRepository.recordAttendance(recordData);
  }

  getAttendanceByEvent(eventId) {
    return this.eventsRepository.getAttendanceByEvent(eventId);
  }

  getCadetAttendance(nim) {
    return this.eventsRepository.getCadetAttendance(nim, this.findUserByNIM.bind(this));
  }

  getCadetAttendanceByAccountId(accountId) {
    return this.eventsRepository.getCadetAttendanceByAccountId(accountId);
  }

  // --- Admin / System ---
  getFullBackup() {
    return {
      app_state: this.read(),
      aspirations: this.getAllAspirations(),
      attendance_records: this.sqlite.prepare('SELECT * FROM attendance_records ORDER BY created_at ASC').all(),
      attendance_sessions: this.sqlite.prepare(`SELECT id, event_id, latitude, longitude, radius_m, starts_at, expires_at, created_by, created_at, revoked_at
        FROM attendance_sessions ORDER BY created_at ASC`).all(),
      site_state: this.getSiteState(),
      site_revisions: this.sqlite.prepare('SELECT id, version, status, payload, created_by, created_at, published_at, restored_from FROM site_revisions ORDER BY version').all().map((row) => ({ ...row, payload: JSON.parse(row.payload) })),
      assets: this.listAssets(),
      soundtracks: this.sqlite.prepare('SELECT * FROM soundtracks ORDER BY sort_order, created_at').all(),
      portal_records: this.sqlite.prepare(`SELECT id, kind, payload_json, active, created_by, submitter_account_id,
        review_status, review_note, reviewer_nim, reviewed_at, consent_at, created_at, updated_at
        FROM portal_records ORDER BY kind, created_at`).all()
        .map((record) => ({ ...record, payload: JSON.parse(record.payload_json), active: Boolean(record.active) })),
      portal_record_history: this.sqlite.prepare('SELECT * FROM portal_record_history ORDER BY created_at ASC, id').all(),
      organization_tasks: this.sqlite.prepare('SELECT * FROM organization_tasks ORDER BY created_at ASC').all(),
      organization_task_history: this.sqlite.prepare('SELECT * FROM organization_task_history ORDER BY created_at ASC, id').all(),
      knowledge_files: this.listKnowledgeFiles(),
      academic_resources: this.sqlite.prepare('SELECT * FROM academic_resources ORDER BY created_at ASC').all()
        .map(({ payload_json, ...record }) => ({ ...record, payload: JSON.parse(payload_json) })),
      academic_resource_history: this.sqlite.prepare('SELECT * FROM academic_resource_history ORDER BY created_at ASC, id').all(),
      academic_learning_paths: this.sqlite.prepare('SELECT * FROM academic_learning_paths ORDER BY created_at ASC').all()
        .map(({ payload_json, ...record }) => ({ ...record, payload: JSON.parse(payload_json) })),
      academic_learning_path_history: this.sqlite.prepare('SELECT * FROM academic_learning_path_history ORDER BY created_at ASC, id').all(),
      tech_articles: this.sqlite.prepare('SELECT * FROM tech_articles ORDER BY created_at ASC').all()
        .map(({ payload_json, ...article }) => ({ ...article, payload: JSON.parse(payload_json) })),
      tech_article_history: this.sqlite.prepare('SELECT * FROM tech_article_history ORDER BY created_at ASC, id').all(),
      project_calls: this.sqlite.prepare('SELECT * FROM project_calls ORDER BY created_at ASC').all()
        .map(({ payload_json, ...call }) => ({ ...call, payload: JSON.parse(payload_json) })),
      project_call_applications: this.sqlite.prepare('SELECT * FROM project_call_applications ORDER BY created_at ASC').all(),
      knowledge_discussions: this.sqlite.prepare(`SELECT id, resource_id, parent_id, account_id, author_name, message,
        solution_type, selected_solution, status, created_at, moderated_at, moderated_by
        FROM knowledge_discussions ORDER BY created_at ASC`).all(),
      career_mentorship_requests: this.sqlite.prepare('SELECT * FROM career_mentorship_requests ORDER BY created_at ASC').all(),
      tutoring_requests: this.sqlite.prepare('SELECT * FROM tutoring_requests ORDER BY created_at ASC').all(),
      tutor_profiles: this.sqlite.prepare('SELECT * FROM tutor_profiles ORDER BY updated_at').all(),
      event_registrations: this.sqlite.prepare(`SELECT id, event_id, account_id, participant_name, email, ticket_token_hash, checked_in_at, created_at
        FROM event_registrations ORDER BY created_at ASC`).all(),
      event_certificates: this.sqlite.prepare('SELECT * FROM event_certificates ORDER BY issued_at ASC').all(),
      attendance_certificates: this.sqlite.prepare('SELECT * FROM attendance_certificates ORDER BY issued_at ASC').all(),
      notifications: this.sqlite.prepare('SELECT * FROM notifications ORDER BY created_at ASC, id').all(),
      notification_preferences: this.sqlite.prepare('SELECT * FROM notification_preferences ORDER BY account_id').all()
        .map(({ account_id, preferences_json, updated_at }) => ({ account_id, preferences: JSON.parse(preferences_json), updated_at })),
      inventory_assets: this.listInventoryAssets(),
      inventory_loans: this.sqlite.prepare('SELECT * FROM inventory_loans ORDER BY requested_at ASC').all(),
      inventory_loan_history: this.sqlite.prepare('SELECT * FROM inventory_loan_history ORDER BY created_at ASC, id').all(),
      audit_log: this.listAudit(5000)
    };
  }

  getSystemStats() {
    const db = this.read();
    const levelCounts = [0, 0, 0, 0, 0];
    const roleCounts = {};
    db.users.forEach((u) => {
      const role = u.role || 'member';
      roleCounts[role] = (roleCounts[role] || 0) + 1;
      if (role !== 'superadmin' && u.clearance_level >= 1 && u.clearance_level <= 3) {
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

    const aspTotal = this.sqlite.prepare('SELECT COUNT(*) as c FROM aspirations').get().c;
    const aspResponded = this.sqlite.prepare("SELECT COUNT(*) as c FROM aspirations WHERE status IN ('Ditindaklanjuti', 'Selesai')").get().c;
    const aspPending = this.sqlite.prepare("SELECT COUNT(*) as c FROM aspirations WHERE status IN ('Diterima', 'Dalam Investigasi')").get().c;
    const attTotal = this.sqlite.prepare('SELECT COUNT(*) as c FROM attendance_records').get().c;

    return {
      generated_at: new Date().toISOString(),
      users: {
        total: db.users.length,
        by_clearance: {
          'Level 1 (Kader)': levelCounts[1],
          'Level 2 (Pengurus Divisi)': levelCounts[2],
          'Level 3 (BPH & Kahim)': levelCounts[3]
        },
        by_role: roleCounts,
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
        total: aspTotal,
        responded: aspResponded,
        pending: aspPending
      },
      financial: {
        transactions: db.financial_ledger.length
      },
      evaluations: db.cadet_evaluations.length,
      attendance_records: attTotal
    };
  }

  // ─── Web Push Subscriptions ────────────────────────────────────────────────

  savePushSubscription(accountId, subscriptionJson) {
    return this.userSqlRepository.savePushSubscription(accountId, subscriptionJson);
  }

  getPushSubscriptions(accountId) {
    return this.userSqlRepository.getPushSubscriptions(accountId);
  }

  getAllPushSubscriptions() {
    return this.userSqlRepository.getAllPushSubscriptions();
  }

  deletePushSubscription(accountId, endpoint) {
    return this.userSqlRepository.deletePushSubscription(accountId, endpoint);
  }

  // ─── SSO / Google OAuth2 ───────────────────────────────────────────────────

  /**
   * Cari user berdasarkan email (cek di tabel users seed + sso_identities).
   */
  findUserByEmail(email) {
    return this.userSqlRepository.findUserByEmail(email);
  }

  /**
   * Cari user berdasarkan provider + provider_id (e.g., 'google', googleSub).
   */
  findUserBySsoId(provider, providerId) {
    return this.userSqlRepository.findUserBySsoId(provider, providerId);
  }

  /**
   * Simpan / perbarui SSO identity untuk user.
   */
  updateUserSsoInfo(provider, providerId, email, accountId) {
    return this.userSqlRepository.updateUserSsoInfo(provider, providerId, email, accountId);
  }

  /**
   * Ambil daftar identitas SSO milik user (account_id).
   */
  getUserSsoIdentities(accountId) {
    return this.userSqlRepository.getUserSsoIdentities(accountId);
  }

  /**
   * Putus tautan identitas SSO untuk user (account_id).
   */
  deleteUserSsoIdentity(accountId, provider = 'google') {
    return this.userSqlRepository.deleteUserSsoIdentity(accountId, provider);
  }

  // ─── Real-time Stats helpers ───────────────────────────────────────────────

  /**
   * Hitung jumlah kehadiran hari ini (untuk WebSocket stats).
   */
  getTodayAttendanceCount() {
    return this.eventsRepository.getTodayAttendanceCount();
  }

  /**
   * Ambil semua tugas organisasi (untuk WebSocket stats).
   */
  getAllOrganizationTasks() {
    return this.operationsRepository.getAllOrganizationTasks();
  }

  close() {
    this.sqlite.close();
  }
}

export const db = new Database();
