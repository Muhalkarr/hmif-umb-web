import assert from 'node:assert/strict';
import test from 'node:test';
import { generateOfficeLetterNumber, getApprovalSequence, validateOfficeLetter } from './officeDocuments.js';

// ── Format: Kode.NomorUrut/HMIF-UMB/RomawiBulan/Tahun (ART Pasal 52 Ayat 3) ──
test('generates a letter number in the standard HMIF codification format', () => {
    // Kode 07 (Administrasi) - Surat Undangan, urutan ke-5, Oktober 2025
    assert.equal(generateOfficeLetterNumber('surat-undangan', 2025, 5, 10), '07.005/HMIF-UMB/X/2025');
    // Kode 01 (Produk Hukum) - Surat Keputusan, urutan ke-12, Maret 2026
    assert.equal(generateOfficeLetterNumber('surat-keputusan', 2026, 12, 3), '01.012/HMIF-UMB/III/2026');
    // Kode 02 (Kekuasaan) - Surat Mandat, urutan ke-1, Januari 2026
    assert.equal(generateOfficeLetterNumber('surat-mandat', 2026, 1, 1), '02.001/HMIF-UMB/I/2026');
    // Kode 08 (Pelayanan) - Surat Keterangan, urutan ke-3, Desember 2025
    assert.equal(generateOfficeLetterNumber('surat-pelayanan', 2025, 3, 12), '08.003/HMIF-UMB/XII/2025');
    // Tipe tidak dikenal → fallback ke kode 01
    assert.equal(generateOfficeLetterNumber('tidak-dikenal', 2026, 1, 6), '01.001/HMIF-UMB/VI/2026');
});

// ── Approval sequences (ART Pasal 52 Ayat 4) ──────────────────────────────────
test('returns the correct approval chain for each letter code', () => {
    // Kode 01 & 02: Otoritas Tunggal (Ketua Himpunan)
    assert.deepEqual(getApprovalSequence('surat-keputusan'), ['Ketua Himpunan']);
    assert.deepEqual(getApprovalSequence('surat-mandat'), ['Ketua Himpunan']);

    // Kode 03: Otoritas DPA
    assert.deepEqual(getApprovalSequence('surat-pengawasan'), ['Ketua DPA']);

    // Kode 04: Otoritas Finansial (Sekjen + Kahim + Bendahara)
    assert.deepEqual(getApprovalSequence('surat-perikatan'), ['Sekretaris Jenderal', 'Ketua Himpunan', 'Bendahara Umum']);

    // Kode 05, 06, 07, 08: Otoritas Kolektif (Sekjen + Kahim)
    assert.deepEqual(getApprovalSequence('surat-pernyataan'), ['Sekretaris Jenderal', 'Ketua Himpunan']);
    assert.deepEqual(getApprovalSequence('surat-legalitas'), ['Sekretaris Jenderal', 'Ketua Himpunan']);
    assert.deepEqual(getApprovalSequence('surat-undangan'), ['Sekretaris Jenderal', 'Ketua Himpunan']);
    assert.deepEqual(getApprovalSequence('surat-pelayanan'), ['Sekretaris Jenderal', 'Ketua Himpunan']);
});

// ── Validation ─────────────────────────────────────────────────────────────────
test('validates letter content and required metadata', () => {
    const result = validateOfficeLetter({
        type: 'surat-undangan',
        subject: 'Rapat Internal Program Kerja',
        division: 'PSDM',
        tags: ['rapat', 'internal'],
        body: 'Agenda rapat koordinasi internal pengurus.'
    });

    assert.equal(result.type, 'surat-undangan');
    assert.equal(result.subject, 'Rapat Internal Program Kerja');
    assert.deepEqual(result.tags, ['rapat', 'internal']);
    // Kode 07: Sekjen + Kahim
    assert.deepEqual(result.approval_sequence, ['Sekretaris Jenderal', 'Ketua Himpunan']);
});
