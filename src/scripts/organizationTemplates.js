export function createOrganizationDraftTemplate({
  createId,
  startDate = new Date().toISOString().slice(0, 10),
  name = 'Struktur organisasi — sesuaikan periode'
}) {
  if (typeof createId !== 'function') throw new TypeError('Pembuat ID organisasi wajib tersedia.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new TypeError('Tanggal mulai draft harus berupa YYYY-MM-DD.');

  const unit = (unitName, code, description, order) => ({
    id: createId('unit'),
    parentUnitId: null,
    name: unitName,
    code,
    description,
    order
  });
  const executive = unit(
    'BPH Inti',
    'BPH-INTI',
    'Template draft tiga posisi inti; verifikasi naskah dan keputusan sebelum penetapan.',
    0
  );
  const units = [
    executive,
    unit('Badan Pengurus Departemen', 'BPD', 'Tambahkan departemen/biro sebagai unit turunan sesuai kebutuhan periode.', 1),
    unit('Dewan Perwakilan Anggota', 'DPA', 'Lembaga pengawasan sejajar dan independen dari BPH.', 2),
    unit('Koordinator Angkatan', 'ANGKATAN', 'Tambahkan unit atau posisi sesuai susunan angkatan yang berlaku.', 3),
    unit('Kepanitiaan Ad Hoc', 'AD-HOC', 'Tambahkan kepanitiaan sementara sesuai mandat dan masa tugas.', 4)
  ];
  const positions = [
    ['Ketua Himpunan', 'KETUA'],
    ['Sekretaris Jenderal', 'SEKJEN'],
    ['Bendahara Umum', 'BENDAHARA']
  ].map(([title, code], order) => ({
    id: createId('position'),
    unitId: executive.id,
    title,
    code,
    maxOccupants: 1,
    required: false,
    order
  }));

  return {
    id: createId('term'),
    name,
    startDate,
    endDate: null,
    status: 'draft',
    units,
    positions,
    assignments: []
  };
}
