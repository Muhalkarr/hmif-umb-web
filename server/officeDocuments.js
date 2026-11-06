/* ==========================================================================
   HMIF UMB - SISTEM KODIFIKASI SURAT (ART Pasal 52)
   Format Penomoran: Kode.NomorUrut/HMIF-UMB/RomawiBulan/Tahun
   Contoh: 02.005/HMIF-UMB/X/2025

   CATATAN PEMELIHARAAN:
   Daftar tipe surat, kode, dan rantai persetujuan di bawah ini mengikuti
   Anggaran Rumah Tangga (ART) HMIF UMB, khususnya Pasal 52 tentang
   Persuratan. Apabila terjadi amandemen konstitusi HMIF di masa depan,
   perbarui objek OFFICE_LETTER_TYPES dan fungsi-fungsi di bawah sesuai
   kebijakan baru Peraturan Organisasi (PO).
   ========================================================================== */

/**
 * Sistem Kodifikasi Surat HMIF UMB.
 *
 * Hierarki kode surat berdasarkan tingkat otoritas (ART Pasal 52 Ayat 2):
 *  01 – Produk Hukum  : SK, SKB
 *  02 – Kekuasaan     : Surat Perintah, Surat Mandat, Surat Delegasi, Surat Tugas
 *  03 – Pengawasan    : Memorandum, SP (SP1/SP2/SP3), Surat Teguran, Surat Protes
 *  04 – Perikatan     : MoU, PKS, Surat Perjanjian Kontrak
 *  05 – Pernyataan    : Surat Pernyataan (Kesediaan/Kesanggupan), Berita Acara
 *  06 – Legalitas     : Surat Perizinan, Peminjaman, Surat Jalan
 *  07 – Administrasi  : Surat Undangan, Surat Pemberitahuan/Edaran
 *  08 – Pelayanan     : Surat Keterangan Aktif, Surat Rekomendasi
 *
 * Regulasi tanda tangan (ART Pasal 52 Ayat 4):
 *  - Otoritas Tunggal (Ketua Himpunan)        : Kode 01, 02, serta SP (kode 03)
 *  - Otoritas Kolektif (Sekjen + Ketua)        : Kode 05, 06, 07, 08
 *  - Otoritas DPA (Ketua DPA, tanpa Kahim)     : Memorandum & Ketetapan DPA (kode 03)
 *  - Otoritas Finansial (+ Bendahara)          : Kode 04 (MoU/PKS yang melibatkan uang)
 *  - Kode 09–99: Kode cadangan, diatur lebih lanjut dalam Peraturan Organisasi (PO).
 */
export const OFFICE_LETTER_TYPES = {
    // ── Kode 01: Produk Hukum ──────────────────────────────────────────────
    'surat-keputusan': {
        label: 'Surat Keputusan (SK / SKB)',
        code: '01',
        category: 'Produk Hukum',
        approvalSequence: ['Ketua Himpunan']
    },

    // ── Kode 02: Kekuasaan ────────────────────────────────────────────────
    'surat-mandat': {
        label: 'Surat Mandat / Delegasi / Tugas / Perintah',
        code: '02',
        category: 'Kekuasaan',
        approvalSequence: ['Ketua Himpunan']
    },

    // ── Kode 03: Pengawasan ───────────────────────────────────────────────
    'surat-pengawasan': {
        label: 'Memorandum / Surat Peringatan / Teguran / Protes',
        code: '03',
        category: 'Pengawasan',
        approvalSequence: ['Ketua DPA']
    },

    // ── Kode 04: Perikatan ────────────────────────────────────────────────
    'surat-perikatan': {
        label: 'MoU / PKS / Surat Perjanjian Kontrak',
        code: '04',
        category: 'Perikatan',
        approvalSequence: ['Sekretaris Jenderal', 'Ketua Himpunan', 'Bendahara Umum']
    },

    // ── Kode 05: Pernyataan ───────────────────────────────────────────────
    'surat-pernyataan': {
        label: 'Surat Pernyataan / Berita Acara',
        code: '05',
        category: 'Pernyataan',
        approvalSequence: ['Sekretaris Jenderal', 'Ketua Himpunan']
    },

    // ── Kode 06: Legalitas ────────────────────────────────────────────────
    'surat-legalitas': {
        label: 'Surat Perizinan / Peminjaman / Surat Jalan',
        code: '06',
        category: 'Legalitas',
        approvalSequence: ['Sekretaris Jenderal', 'Ketua Himpunan']
    },

    // ── Kode 07: Administrasi ─────────────────────────────────────────────
    'surat-undangan': {
        label: 'Surat Undangan / Pemberitahuan / Edaran',
        code: '07',
        category: 'Administrasi',
        approvalSequence: ['Sekretaris Jenderal', 'Ketua Himpunan']
    },

    // ── Kode 08: Pelayanan ────────────────────────────────────────────────
    'surat-pelayanan': {
        label: 'Surat Keterangan Aktif / Rekomendasi',
        code: '08',
        category: 'Pelayanan',
        approvalSequence: ['Sekretaris Jenderal', 'Ketua Himpunan']
    }
};

/** Angka Romawi untuk bulan (1–12). */
const ROMAN_MONTHS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

const normalizeType = (type) => {
    const value = String(type || '').trim().toLowerCase();
    if (OFFICE_LETTER_TYPES[value]) return value;
    return 'surat-keputusan';
};

export const getApprovalSequence = (type) =>
    OFFICE_LETTER_TYPES[normalizeType(type)]?.approvalSequence || ['Sekretaris Jenderal', 'Ketua Himpunan'];

/**
 * Membuat nomor surat resmi HMIF UMB sesuai format ART Pasal 52 Ayat 3:
 *   Kode.NomorUrut/HMIF-UMB/RomawiBulan/Tahun
 *
 * @param {string} type       - Kunci tipe surat (lihat OFFICE_LETTER_TYPES)
 * @param {number} [year]     - Tahun (default: tahun berjalan)
 * @param {number} [sequence] - Nomor urut (default: 1)
 * @param {number} [month]    - Bulan 1–12 (default: bulan berjalan)
 * @returns {string} Contoh: "02.005/HMIF-UMB/X/2025"
 */
export const generateOfficeLetterNumber = (type, year = new Date().getFullYear(), sequence = 1, month = new Date().getMonth() + 1) => {
    const normalizedType = normalizeType(type);
    const code = OFFICE_LETTER_TYPES[normalizedType]?.code || '01';
    const romanMonth = ROMAN_MONTHS[Math.max(1, Math.min(12, month)) - 1] || 'I';
    return `${code}.${String(sequence).padStart(3, '0')}/HMIF-UMB/${romanMonth}/${year}`;
};

export const validateOfficeLetter = (input = {}) => {
    const type = normalizeType(input.type);
    const subject = String(input.subject || '').trim();
    const division = String(input.division || '').trim();
    const targetDivision = String(input.target_division || input.targetDivision || division || 'Umum').trim();
    const body = String(input.body || '').trim();
    const tags = Array.isArray(input.tags)
        ? input.tags.map((tag) => String(tag).trim()).filter(Boolean)
        : String(input.tags || '')
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean);

    if (!subject) throw new Error('Judul surat wajib diisi.');
    if (!division) throw new Error('Divisi pengirim wajib diisi.');
    if (!body) throw new Error('Isi surat wajib diisi.');

    return {
        type,
        subject,
        division,
        target_division: targetDivision,
        tags,
        body,
        approval_sequence: getApprovalSequence(type)
    };
};
