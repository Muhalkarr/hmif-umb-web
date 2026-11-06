const text = (value, label, maxLength, { required = false } = {}) => {
  if (typeof value !== 'string' || value.length > maxLength || (required && !value.trim())) {
    throw new Error(`${label} tidak valid.`);
  }
  return value.trim();
};

const identifier = (value, label) => {
  const id = text(value, label, 64, { required: true });
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error(`${label} tidak valid.`);
  return id;
};

const dateValue = (value, label) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} tidak valid.`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(`${label} tidak valid.`);
  return value;
};

const parseMinutes = (value, label) => {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error(`${label} tidak valid.`);
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
};

const normalizeSkill = (value) => String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('id-ID');

export function validateAcademicResource(input, { fileExists = () => false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Resource akademik tidak valid.');
  const id = identifier(input.id, 'ID resource');
  const title = text(input.title, 'Judul resource', 180, { required: true });
  const url = text(input.url ?? '', 'URL resource', 2000);
  const fileId = text(input.file_id ?? '', 'ID PDF', 64);
  if (Boolean(url) === Boolean(fileId)) throw new Error('Pilih tepat satu sumber: URL atau PDF.');
  if (url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('URL resource harus HTTPS yang valid.');
    }
    if (parsed.protocol !== 'https:') throw new Error('URL resource harus HTTPS yang valid.');
  }
  if (fileId && (!/^[a-f0-9-]{36}$/i.test(fileId) || !fileExists(fileId))) {
    throw new Error('PDF resource tidak ditemukan.');
  }
  const kind = input.kind;
  if (!['exam', 'module', 'cheatsheet', 'reference', 'project'].includes(kind)) throw new Error('Jenis resource tidak valid.');
  const examType = text(input.exam_type ?? '', 'Jenis evaluasi', 24);
  if (examType && !['UTS', 'UAS', 'Kuis', 'Latihan'].includes(examType)) throw new Error('Jenis evaluasi tidak valid.');
  if (kind === 'exam' && !examType) throw new Error('Bank soal harus memiliki jenis evaluasi.');
  const tags = input.tags ?? [];
  if (!Array.isArray(tags) || tags.length > 12) throw new Error('Tag resource tidak valid.');

  return {
    id,
    title,
    course: text(input.course ?? '', 'Mata kuliah', 120),
    semester: text(input.semester ?? 'Semua', 'Semester', 20),
    lecturer: text(input.lecturer ?? '', 'Dosen pengampu', 120),
    academic_year: text(input.academic_year ?? '', 'Tahun ajaran', 20),
    exam_type: examType,
    kind,
    summary: text(input.summary ?? '', 'Ringkasan', 1000),
    url,
    file_id: fileId,
    tags: tags.map((tag) => text(tag, 'Tag', 40, { required: true }))
  };
}

export function validateLearningPath(input, resourceIds = new Set()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Learning path tidak valid.');
  const id = identifier(input.id, 'ID learning path');
  const milestones = input.milestones;
  if (!Array.isArray(milestones) || milestones.length < 1 || milestones.length > 40) {
    throw new Error('Learning path harus memiliki 1 sampai 40 milestone.');
  }
  const milestoneIds = new Set();
  const normalizedMilestones = milestones.map((milestone, index) => {
    const milestoneId = identifier(milestone?.id, 'ID milestone');
    if (milestoneIds.has(milestoneId)) throw new Error('ID milestone harus unik.');
    milestoneIds.add(milestoneId);
    const resources = milestone.resource_ids ?? [];
    const prerequisites = milestone.prerequisite_ids ?? [];
    if (!Array.isArray(resources) || resources.length < 1 || resources.length > 20) {
      throw new Error(`Milestone ${milestoneId} harus menghubungkan minimal satu resource.`);
    }
    if (!Array.isArray(prerequisites) || prerequisites.length > 40) throw new Error(`Prasyarat milestone ${milestoneId} tidak valid.`);
    const resourceReferences = [...new Set(resources.map((resourceId) => identifier(resourceId, 'ID resource milestone')))];
    if (resourceReferences.some((resourceId) => !resourceIds.has(resourceId))) {
      throw new Error(`Milestone ${milestoneId} memiliki resource yang tidak ditemukan.`);
    }
    const prerequisiteReferences = [...new Set(prerequisites.map((prerequisiteId) => identifier(prerequisiteId, 'ID prasyarat')))];
    if (prerequisiteReferences.some((prerequisiteId) => !milestoneIds.has(prerequisiteId))) {
      throw new Error(`Prasyarat milestone ${milestoneId} harus menunjuk ke milestone sebelumnya.`);
    }
    return {
      id: milestoneId,
      title: text(milestone.title, 'Judul milestone', 160, { required: true }),
      description: text(milestone.description ?? '', 'Deskripsi milestone', 1000),
      order: index + 1,
      resource_ids: resourceReferences,
      prerequisite_ids: prerequisiteReferences
    };
  });

  return {
    id,
    title: text(input.title, 'Judul learning path', 160, { required: true }),
    track: text(input.track, 'Bidang karier', 80, { required: true }),
    summary: text(input.summary ?? '', 'Ringkasan learning path', 1000),
    estimated_hours: Number.isInteger(input.estimated_hours) && input.estimated_hours >= 0 && input.estimated_hours <= 2000
      ? input.estimated_hours
      : 0,
    milestones: normalizedMilestones
  };
}

export function validatePreferredSlots(slots) {
  if (!Array.isArray(slots) || slots.length < 1 || slots.length > 5) throw new Error('Pilih 1 sampai 5 slot waktu yang diinginkan.');
  return slots.map((slot) => {
    const date = dateValue(slot?.date, 'Tanggal pilihan');
    const start = parseMinutes(slot?.start, 'Waktu mulai');
    const end = parseMinutes(slot?.end, 'Waktu selesai');
    if (start >= end) throw new Error('Waktu selesai harus setelah waktu mulai.');
    if (!['online', 'offline', 'any'].includes(slot?.mode)) throw new Error('Mode pilihan sesi tidak valid.');
    return { date, start: slot.start, end: slot.end, mode: slot.mode };
  });
}

const overlaps = (firstStart, firstEnd, secondStart, secondEnd) => firstStart < secondEnd && secondStart < firstEnd;

export function rankTutorCandidates(request, tutors, scheduledSessions = []) {
  const preferredSlots = Array.isArray(request.preferred_slots) ? request.preferred_slots : [];
  const requestTerms = [request.course, request.topic, request.request_message]
    .join(' ').toLocaleLowerCase('id-ID').split(/[^\p{L}\p{N}+#.]+/u).filter((term) => term.length > 2);

  return tutors.map((tutor) => {
    const matchedSkills = (tutor.expertise || []).filter((skill) => {
      const normalizedSkill = normalizeSkill(skill);
      return normalizedSkill && requestTerms.some((term) => normalizedSkill.includes(term) || term.includes(normalizedSkill));
    });
    const matchingSlots = preferredSlots.filter((preferred) => {
      const date = dateValue(preferred.date, 'Tanggal pilihan');
      const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
      const preferredStart = parseMinutes(preferred.start, 'Waktu mulai');
      const preferredEnd = parseMinutes(preferred.end, 'Waktu selesai');
      const availability = (tutor.availability || []).some((slot) => {
        if (slot.dayOfWeek !== weekday || (slot.mode !== 'any' && preferred.mode !== 'any' && slot.mode !== preferred.mode)) return false;
        const slotStart = parseMinutes(slot.start, 'Jadwal tutor');
        const slotEnd = parseMinutes(slot.end, 'Jadwal tutor');
        return preferredStart >= slotStart && preferredEnd <= slotEnd;
      });
      if (!availability) return false;
      const preferredStartAt = Date.parse(`${date}T${preferred.start}:00+07:00`);
      const preferredEndAt = Date.parse(`${date}T${preferred.end}:00+07:00`);
      return !scheduledSessions.some((session) => session.tutor_account_id === tutor.account_id
        && session.status === 'Dijadwalkan'
        && session.session_at
        && overlaps(preferredStartAt, preferredEndAt, Date.parse(session.session_at), Date.parse(session.session_at) + (session.duration_minutes || 60) * 60000));
    });
    const skillsScore = matchedSkills.length;
    const scheduleScore = matchingSlots.length;
    return {
      ...tutor,
      matched_skills: matchedSkills,
      matching_slots: matchingSlots,
      skills_score: skillsScore,
      schedule_score: scheduleScore,
      match_score: skillsScore * 10 + scheduleScore * 5
    };
  }).sort((first, second) => second.match_score - first.match_score || first.name.localeCompare(second.name));
}