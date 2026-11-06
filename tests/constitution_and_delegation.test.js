
import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../server/db.js';
import { FULL_CONSTITUTION_DATA } from '../src/scripts/constitutionData.js';

test('1. Constitution Data Integrity (AD/ART HMIF UMB)', () => {
  assert.equal(FULL_CONSTITUTION_DATA.length, 28, 'Total chapters must be exactly 28');
  let totalPasal = 0;
  FULL_CONSTITUTION_DATA.forEach(ch => {
    totalPasal += ch.pasalList.length;
  });
  assert.equal(totalPasal, 94, 'Total articles must be exactly 94 (33 AD + 61 ART)');

  // Verify Pasal 57 ART (Delegasi) — ada di BAB VIII (ART)
  const babDelegasi = FULL_CONSTITUTION_DATA.find(ch => ch.bab === 'BAB VIII (ART)');
  assert.ok(babDelegasi, 'BAB VIII (ART) must exist');
  const pasal57 = babDelegasi.pasalList.find(p => p.pasal.includes('57'));
  assert.ok(pasal57, 'Pasal 57 ART must exist in BAB VIII (ART)');
  assert.ok(
    (pasal57.content && pasal57.content.includes('Delegasi')) ||
    (pasal57.heading && pasal57.heading.includes('Delegasi')),
    'Pasal 57 must be about Delegasi'
  );

  // Verify Pasal 41 ART (DPA & RDP) — ada di BAB VI (ART)
  const babDpa = FULL_CONSTITUTION_DATA.find(ch => ch.bab === 'BAB VI (ART)');
  assert.ok(babDpa, 'BAB VI (ART) must exist');
  const pasal41 = babDpa.pasalList.find(p => p.pasal.includes('41'));
  assert.ok(pasal41, 'Pasal 41 ART must exist in BAB VI (ART)');
});

test('2. Database Delegations & Clawback Tracking (Pasal 57 ART)', () => {
  // Create sample delegation menggunakan skema aktual database
  const del = db.createDelegation({
    applicant_account_id: 'test-kader-uuid',
    applicant_nim: '2301001',
    applicant_name: 'Kader Test',
    event_name: 'Gemastik XVII 2026',
    event_category: 'Kompetisi',
    destination: 'Luar Kota',
    funding_type: 'Parsial',
    requested_budget: 500000,
    start_date: '2026-11-01',
    end_date: '2026-11-05',
    notes: '2301001 - Kader Test (Lead)'
  });

  assert.ok(del.id, 'Delegation ID must be generated');
  assert.equal(del.status, 'Diajukan');
  assert.equal(del.lpd_submitted, 0);

  // Approve delegation dan assign nomor surat tugas
  const approved = db.updateDelegationStatus(del.id, {
    status: 'Disetujui',
    mandate_letter_number: 'ST/HMIF-UMB/2026/DEL-001',
    notes: 'Disetujui oleh BPH'
  });
  assert.ok(approved, 'Updated delegation must be returned');
  assert.equal(approved.status, 'Disetujui');
  assert.equal(approved.mandate_letter_number, 'ST/HMIF-UMB/2026/DEL-001');

  // Submit LPD (Clawback policy fulfillment) — argumen kedua adalah string teks LPD
  const lpd = db.submitDelegationLpd(del.id, 'Juara 2 Divisi Software Development. Sharing session dijadwalkan 10 Nov 2026.');
  assert.ok(lpd, 'LPD must be returned after submission');
  assert.equal(lpd.lpd_submitted, 1);
  assert.ok(lpd.lpd_submitted_at, 'lpd_submitted_at must be set');
  assert.equal(lpd.status, 'Selesai');
});

test('3. Database RDP Hearing Agendas (Pasal 41 ART)', () => {
  // Submit sample aspiration menggunakan skema aktual
  const asp = db.createAspiration({
    sender: 'Mahasiswa Anonim',
    category: 'Fasilitas Lab',
    message: 'Perlu penambahan pendingin ruangan di Lab Komputer 2.',
    trackingTokenHash: null
  });
  assert.ok(asp.id);

  // Set RDP agenda
  const scheduled = db.setAspirationRdpAgenda(asp.id, {
    is_rdp_agenda: true,
    rdp_scheduled_at: '2026-11-15T14:00:00',
    rdp_notes: 'DPA mengundang KaLab dan BPH untuk verifikasi anggaran inventaris.'
  });
  assert.equal(scheduled.is_rdp_agenda, 1);
  assert.equal(scheduled.rdp_scheduled_at, '2026-11-15T14:00:00');

  // Fetch public RDP board
  const publicAgendas = db.getPublicRdpAgendas();
  assert.ok(Array.isArray(publicAgendas));
  assert.ok(publicAgendas.some(a => a.id === asp.id));
});
