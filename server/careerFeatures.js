export const CAREER_SPECIALIZATIONS = [
  'Full-stack',
  'AI',
  'Mobile',
  'Cybersecurity',
  'IoT',
  'Data'
];

export const normalizeCareerSpecializations = (specializations, legacySpecialization = '') => {
  const requested = Array.isArray(specializations) ? specializations : [];
  if (requested.some((value) => typeof value !== 'string' || !CAREER_SPECIALIZATIONS.includes(value))) {
    throw new Error('Spesialisasi lowongan harus dipilih dari daftar bidang yang tersedia.');
  }
  if (requested.length) return [...new Set(requested)];
  const legacy = String(legacySpecialization || '').toLowerCase();
  return CAREER_SPECIALIZATIONS.filter((specialty) => legacy.includes(specialty.toLowerCase()));
};

export const filterCareerOpportunities = (opportunities, specialization = '') => {
  if (!specialization) return opportunities;
  if (!CAREER_SPECIALIZATIONS.includes(specialization)) return [];
  return opportunities.filter((job) => (job.specializations || []).includes(specialization));
};

export const groupAlumniByProvince = (alumni) => alumni.reduce((groups, person) => {
  const province = String(person.province || 'Belum dicantumkan').trim() || 'Belum dicantumkan';
  groups[province] = (groups[province] || 0) + 1;
  return groups;
}, {});

export const validateMentorshipRequest = (input = {}, now = Date.now()) => {
  const allowedTypes = ['technical_interview', 'cv_review', 'code_review'];
  if (!allowedTypes.includes(input.session_type)) throw new Error('Jenis sesi mentorship tidak valid.');
  const topic = typeof input.topic === 'string' ? input.topic.trim() : '';
  if (!topic || topic.length > 800) throw new Error('Tujuan sesi wajib diisi dan maksimal 800 karakter.');
  if (!['online', 'offline'].includes(input.preferred_mode)) throw new Error('Mode sesi mentorship tidak valid.');
  if (typeof input.preferred_at !== 'string' || Number.isNaN(Date.parse(input.preferred_at))) {
    throw new Error('Waktu sesi yang diusulkan tidak valid.');
  }
  const preferredAt = new Date(input.preferred_at);
  if (preferredAt.getTime() < now + 60 * 60 * 1000 || preferredAt.getTime() > now + 60 * 24 * 60 * 60 * 1000) {
    throw new Error('Jadwal harus setidaknya 1 jam dan maksimal 60 hari dari sekarang.');
  }
  return {
    session_type: input.session_type,
    topic,
    preferred_at: preferredAt.toISOString(),
    preferred_mode: input.preferred_mode,
    duration_minutes: 30
  };
};