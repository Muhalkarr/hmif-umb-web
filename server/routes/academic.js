/** Endpoint domain registerAcademicRoutes. */
export const registerAcademicRoutes = (app, context) => {
  const { db, requireAcademicCurator, requireAcademicModerator, requireSuperadmin, requireAuth, requireClearance, knowledgeFileUpload, multer, fs, path, KNOWLEDGE_DIR, isPdfDocument, randomUUID, createHash, validateAcademicResource, validateLearningPath, knowledgeDiscussionLimiter, tutoringRequestLimiter, validatePreferredSlots, rankTutorCandidates, getHmifCalendarDate, auditAdminMutation, createUserNotification } = context;

app.post('/api/knowledge/files', requireAcademicCurator, (req, res, next) => {
  knowledgeFileUpload.single('file')(req, res, (error) => {
    if (!error) return next();
    res.status(error instanceof multer.MulterError ? 413 : 400).json({ error: error.message });
  });
}, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Pilih satu dokumen PDF.' });
  const buffer = fs.readFileSync(req.file.path);
  if (!isPdfDocument(buffer)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Isi file bukan dokumen PDF yang valid.' });
  }

  const id = randomUUID();
  const storedName = `${id}.pdf`;
  const targetPath = path.join(KNOWLEDGE_DIR, storedName);
  try {
    fs.renameSync(req.file.path, targetPath);
    const file = db.addKnowledgeFile({
      stored_name: storedName,
      original_name: path.basename(req.file.originalname).replace(/[\r\n"\\]/g, '_').slice(0, 160),
      size: req.file.size,
      sha256: createHash('sha256').update(buffer).digest('hex'),
      uploaded_by: req.user.nim,
      uploaded_by_account_id: req.user.account_id
    });
    auditAdminMutation(req, 'knowledge.file_upload', 'knowledge_file', file.id, { size: file.size, sha256: file.sha256 });
    res.status(201).json({ file: { id: file.id, original_name: file.original_name, size: file.size, sha256: file.sha256 } });
  } catch {
    if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: 'Dokumen tidak dapat disimpan.' });
  }
});

app.get('/api/knowledge/files', requireAcademicCurator, (req, res) => {
  res.json({ files: db.listKnowledgeFiles(req.user.role === 'superadmin' ? null : req.user.account_id) });
});

app.delete('/api/knowledge/files/:id', requireAcademicCurator, (req, res) => {
  const file = db.getKnowledgeFile(req.params.id);
  if (!file) return res.status(404).json({ error: 'Dokumen akademik tidak ditemukan.' });
  if (req.user.role !== 'superadmin' && file.uploaded_by_account_id !== req.user.account_id) {
    return res.status(403).json({ error: 'Kurator hanya dapat menghapus PDF yang diunggah sendiri.' });
  }
  if (db.isKnowledgeFileReferenced(file.id)) {
    return res.status(409).json({ error: 'Dokumen masih digunakan oleh draft, publikasi, atau versi yang dapat dipulihkan.' });
  }
  const filePath = path.resolve(KNOWLEDGE_DIR, file.stored_name);
  if (!filePath.startsWith(`${KNOWLEDGE_DIR}${path.sep}`)) return res.status(400).json({ error: 'Lokasi dokumen tidak valid.' });
  db.deleteKnowledgeFile(file.id);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  auditAdminMutation(req, 'knowledge.file_delete', 'knowledge_file', file.id, { sha256: file.sha256 });
  res.json({ message: 'DOKUMEN AKADEMIK DIHAPUS' });
});

app.get('/api/academic/resources', (_req, res) => {
  res.json({ resources: db.getPublicAcademicRecords('resource').map(({ created_by_account_id, reviewed_by_account_id, ...resource }) => resource) });
});

app.get('/api/academic/resources/mine', requireAcademicCurator, (req, res) => {
  const records = db.listAcademicRecords('resource', req.user.role === 'superadmin' ? {} : { ownerAccountId: req.user.account_id });
  res.json({ resources: records });
});

app.post('/api/academic/resources', requireAcademicCurator, (req, res) => {
  let resource;
  const fileExists = (id) => {
    const file = db.getKnowledgeFile(id);
    return Boolean(file && (req.user.role === 'superadmin' || file.uploaded_by_account_id === req.user.account_id));
  };
  try {
    resource = validateAcademicResource({ ...req.body, id: req.body?.id || randomUUID() }, {
      fileExists
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Resource akademik tidak valid.' });
  }
  const saved = db.saveAcademicDraft('resource', null, resource, req.user.account_id, req.user.role === 'superadmin');
  auditAdminMutation(req, 'academic.resource_create', 'academic_resource', resource.id, { kind: resource.kind });
  res.status(201).json({ resource: saved });
});

app.put('/api/academic/resources/:id', requireAcademicCurator, (req, res) => {
  const existing = db.getAcademicRecord('resource', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Resource akademik tidak ditemukan.' });
  let resource;
  const fileExists = (id) => {
    const file = db.getKnowledgeFile(id);
    return Boolean(file && (req.user.role === 'superadmin' || file.uploaded_by_account_id === req.user.account_id));
  };
  try {
    resource = validateAcademicResource({ ...req.body, id: req.params.id }, {
      fileExists
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Resource akademik tidak valid.' });
  }
  const saved = db.saveAcademicDraft('resource', req.params.id, resource, req.user.account_id, req.user.role === 'superadmin');
  if (saved?.error) return res.status(403).json({ error: saved.error });
  if (!saved) return res.status(409).json({ error: 'Resource tidak dapat diubah pada status saat ini.' });
  auditAdminMutation(req, 'academic.resource_update', 'academic_resource', resource.id, { kind: resource.kind });
  res.json({ resource: saved });
});

app.post('/api/academic/resources/:id/submit', requireAcademicCurator, (req, res) => {
  const submitted = db.submitAcademicRecord('resource', req.params.id, req.user.account_id, req.user.role === 'superadmin');
  if (!submitted) return res.status(409).json({ error: 'Resource tidak ditemukan atau tidak dapat diajukan.' });
  auditAdminMutation(req, 'academic.resource_submit', 'academic_resource', submitted.id, {});
  res.json({ resource: submitted });
});

app.get('/api/academic/learning-paths', (_req, res) => {
  res.json({ learning_paths: db.getPublicAcademicRecords('learning_path').map(({ created_by_account_id, reviewed_by_account_id, ...path }) => path) });
});

app.get('/api/academic/learning-paths/mine', requireAcademicCurator, (req, res) => {
  const records = db.listAcademicRecords('learning_path', req.user.role === 'superadmin' ? {} : { ownerAccountId: req.user.account_id });
  res.json({ learning_paths: records });
});

app.post('/api/academic/learning-paths', requireAcademicCurator, (req, res) => {
  let learningPath;
  try {
    const resources = new Set(db.listAcademicRecords('resource', { status: 'published' }).map(({ id }) => id));
    learningPath = validateLearningPath({ ...req.body, id: req.body?.id || randomUUID() }, resources);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Learning path tidak valid.' });
  }
  const saved = db.saveAcademicDraft('learning_path', null, learningPath, req.user.account_id, req.user.role === 'superadmin');
  auditAdminMutation(req, 'academic.learning_path_create', 'academic_learning_path', learningPath.id, { track: learningPath.track });
  res.status(201).json({ learning_path: saved });
});

app.put('/api/academic/learning-paths/:id', requireAcademicCurator, (req, res) => {
  const existing = db.getAcademicRecord('learning_path', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Learning path tidak ditemukan.' });
  let learningPath;
  try {
    const resources = new Set(db.listAcademicRecords('resource', { status: 'published' }).map(({ id }) => id));
    learningPath = validateLearningPath({ ...req.body, id: req.params.id }, resources);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Learning path tidak valid.' });
  }
  const saved = db.saveAcademicDraft('learning_path', req.params.id, learningPath, req.user.account_id, req.user.role === 'superadmin');
  if (saved?.error) return res.status(403).json({ error: saved.error });
  if (!saved) return res.status(409).json({ error: 'Learning path tidak dapat diubah pada status saat ini.' });
  auditAdminMutation(req, 'academic.learning_path_update', 'academic_learning_path', learningPath.id, { track: learningPath.track });
  res.json({ learning_path: saved });
});

app.post('/api/academic/learning-paths/:id/submit', requireAcademicCurator, (req, res) => {
  const submitted = db.submitAcademicRecord('learning_path', req.params.id, req.user.account_id, req.user.role === 'superadmin');
  if (!submitted) return res.status(409).json({ error: 'Learning path tidak ditemukan atau tidak dapat diajukan.' });
  auditAdminMutation(req, 'academic.learning_path_submit', 'academic_learning_path', submitted.id, {});
  res.json({ learning_path: submitted });
});

app.get('/api/admin/academic/review', requireSuperadmin, (_req, res) => {
  res.json({
    resources: db.listAcademicRecords('resource', { status: 'pending_review' }),
    learning_paths: db.listAcademicRecords('learning_path', { status: 'pending_review' })
  });
});

app.put('/api/admin/academic/:kind/:id/review', requireSuperadmin, (req, res) => {
  const kind = req.params.kind === 'resource' ? 'resource' : req.params.kind === 'learning-path' ? 'learning_path' : null;
  if (!kind) return res.status(404).json({ error: 'Jenis konten akademik tidak ditemukan.' });
  const { status, note = '' } = req.body || {};
  if (!['published', 'rejected'].includes(status) || typeof note !== 'string' || note.length > 1000) {
    return res.status(400).json({ error: 'Keputusan atau catatan review tidak valid.' });
  }
  const reviewed = db.reviewAcademicRecord(kind, req.params.id, status, req.user.account_id, note.trim());
  if (!reviewed) return res.status(409).json({ error: 'Konten tidak ditemukan atau tidak menunggu review.' });
  auditAdminMutation(req, `academic.${kind}.review`, `academic_${kind}`, reviewed.id, { status });
  res.json({ record: reviewed });
});

app.get('/api/knowledge/resources/:resourceId/discussions', (req, res) => {
  const legacyResource = db.getSiteState().published.content.data.knowledgeResources
    .find((item) => item.id === req.params.resourceId && item.published !== false && item.kind === 'exam');
  const academicResource = db.getPublicAcademicRecords('resource')
    .find((item) => item.id === req.params.resourceId && item.kind === 'exam');
  const resource = academicResource || legacyResource;
  if (!resource) return res.status(404).json({ error: 'Bank soal tidak ditemukan.' });
  res.json({ discussions: db.getKnowledgeDiscussions(resource.id, req.user?.account_id || null) });
});

app.post('/api/knowledge/resources/:resourceId/discussions', requireAuth, knowledgeDiscussionLimiter, (req, res) => {
  const legacyResource = db.getSiteState().published.content.data.knowledgeResources
    .find((item) => item.id === req.params.resourceId && item.published !== false && item.kind === 'exam');
  const academicResource = db.getPublicAcademicRecords('resource')
    .find((item) => item.id === req.params.resourceId && item.kind === 'exam');
  const resource = academicResource || legacyResource;
  if (!resource) return res.status(404).json({ error: 'Bank soal tidak ditemukan.' });
  const message = req.body?.message;
  if (typeof message !== 'string' || !message.trim() || message.length > 3000) {
    return res.status(400).json({ error: 'Isi diskusi wajib diisi dan maksimal 3000 karakter.' });
  }
  const parentId = req.body?.parent_id || null;
  const solutionType = req.body?.solution_type || (parentId ? 'answer' : 'discussion');
  if (!['discussion', 'question', 'answer', 'alternative'].includes(solutionType)
    || (!parentId && ['answer', 'alternative'].includes(solutionType))) {
    return res.status(400).json({ error: 'Jenis kontribusi diskusi tidak valid.' });
  }
  if (parentId) {
    const parent = db.getKnowledgeDiscussions(resource.id, req.user.account_id).find((entry) => entry.id === parentId);
    if (!parent || parent.status !== 'published') return res.status(400).json({ error: 'Balasan harus merujuk diskusi yang sudah terbit.' });
  }
  const discussion = db.createKnowledgeDiscussion({
    resourceId: resource.id,
    accountId: req.user.account_id,
    authorName: req.user.name,
    message: message.trim(),
    parentId,
    solutionType
  });
  res.status(202).json({ message: 'Diskusi dikirim dan menunggu moderasi.', discussion });
});

app.get('/api/admin/knowledge/discussions', requireAcademicModerator, (_req, res) => {
  res.json({ discussions: db.listPendingKnowledgeDiscussions() });
});

app.put('/api/admin/knowledge/discussions/:id/moderation', requireAcademicModerator, (req, res) => {
  const { status } = req.body || {};
  if (!['published', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Keputusan moderasi tidak valid.' });
  }
  const discussion = db.moderateKnowledgeDiscussion(req.params.id, status, req.user.account_id);
  if (!discussion) return res.status(404).json({ error: 'Diskusi tidak ditemukan atau sudah dimoderasi.' });
  auditAdminMutation(req, 'knowledge.discussion_moderate', 'knowledge_discussion', discussion.id, { resourceId: discussion.resource_id, status });
  res.json({ discussion });
});

app.put('/api/admin/knowledge/discussions/:id/solution', requireAcademicModerator, (req, res) => {
  const discussion = db.selectKnowledgeSolution(req.params.id, req.user);
  if (!discussion) return res.status(409).json({ error: 'Hanya jawaban atau alternatif yang sudah terbit dapat dipilih sebagai solusi.' });
  auditAdminMutation(req, 'knowledge.solution_select', 'knowledge_discussion', discussion.id, { resourceId: discussion.resource_id });
  res.json({ discussion });
});

app.post('/api/tutoring/requests', requireAuth, tutoringRequestLimiter, (req, res) => {
  const { course, topic, message } = req.body || {};
  if ([course, topic, message].some((value, index) => typeof value !== 'string' || !value.trim() || value.length > [120, 180, 2000][index])) {
    return res.status(400).json({ error: 'Mata kuliah, topik, dan kebutuhan wajib diisi dengan batas panjang yang valid.' });
  }
  let preferredSlots = [];
  try {
    if (req.body?.preferred_slots !== undefined) preferredSlots = validatePreferredSlots(req.body.preferred_slots);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Pilihan waktu tidak valid.' });
  }
  const preferredTime = typeof req.body?.preferred_time === 'string' ? req.body.preferred_time.trim() : '';
  if (preferredSlots.length === 0 && (!preferredTime || preferredTime.length > 500)) {
    return res.status(400).json({ error: 'Pilih slot waktu atau isi preferensi jadwal lama.' });
  }
  const request = db.createTutoringRequest({
    studentAccountId: req.user.account_id,
    studentName: req.user.name,
    course: course.trim(),
    topic: topic.trim(),
    message: message.trim(),
    preferredTime: preferredTime || preferredSlots.map((slot) => `${slot.date} ${slot.start}-${slot.end} ${slot.mode}`).join('; '),
    preferredSlots
  });
  const { student_account_id, ...safeRequest } = request;
  res.status(201).json({ request: safeRequest });
});

app.get('/api/tutoring/requests/mine', requireAuth, (req, res) => {
  res.json({ requests: db.getMyTutoringRequests(req.user.account_id) });
});

app.get('/api/tutoring/requests', requireClearance(2), (_req, res) => {
  const requests = db.listTutoringRequests().map((request) => ({
    ...request,
    suggested_tutors: db.getTutorMatches(request).slice(0, 5)
  }));
  res.json({ requests });
});

app.get('/api/tutoring/tutors', requireClearance(2), (_req, res) => {
  res.json({ tutors: db.getActiveTutorProfiles() });
});

app.get('/api/tutoring/profile/mine', requireClearance(2), (req, res) => {
  if (req.user.role === 'superadmin') return res.status(403).json({ error: 'Profil tutor hanya untuk anggota.' });
  res.json({ profile: db.getTutorProfile(req.user.account_id) });
});

app.put('/api/tutoring/profile/mine', requireClearance(2), (req, res) => {
  if (req.user.role === 'superadmin') return res.status(403).json({ error: 'Profil tutor hanya untuk anggota.' });
  const { expertise, availability, bio = '', active = true } = req.body || {};
  if (!Array.isArray(expertise) || expertise.length < 1 || expertise.length > 12
    || expertise.some((skill) => typeof skill !== 'string' || !skill.trim() || skill.length > 60)
    || !Array.isArray(availability) || availability.length < 1 || availability.length > 14
    || typeof bio !== 'string' || bio.length > 500 || typeof active !== 'boolean') {
    return res.status(400).json({ error: 'Keahlian, jadwal, bio, atau status profil tutor tidak valid.' });
  }
  const normalizedAvailability = [];
  for (const slot of availability) {
    if (!Number.isInteger(slot?.dayOfWeek) || slot.dayOfWeek < 0 || slot.dayOfWeek > 6
      || !/^\d{2}:\d{2}$/.test(slot.start || '') || !/^\d{2}:\d{2}$/.test(slot.end || '')
      || !['online', 'offline', 'any'].includes(slot.mode)) {
      return res.status(400).json({ error: 'Slot mingguan harus berisi hari, jam mulai/selesai, dan mode sesi yang valid.' });
    }
    const startMinutes = Number(slot.start.slice(0, 2)) * 60 + Number(slot.start.slice(3, 5));
    const endMinutes = Number(slot.end.slice(0, 2)) * 60 + Number(slot.end.slice(3, 5));
    if (startMinutes >= endMinutes || endMinutes > 1440 || slot.start.slice(0, 2) > '23' || slot.end.slice(0, 2) > '23'
      || slot.start.slice(3, 5) > '59' || slot.end.slice(3, 5) > '59') {
      return res.status(400).json({ error: 'Rentang waktu tutor tidak valid.' });
    }
    normalizedAvailability.push({ dayOfWeek: slot.dayOfWeek, start: slot.start, end: slot.end, mode: slot.mode });
  }
  const normalizedExpertise = [...new Set(expertise.map((skill) => skill.trim()))];
  const profile = db.saveTutorProfile(req.user.account_id, {
    expertise: normalizedExpertise,
    availability: normalizedAvailability,
    bio: bio.trim(),
    active
  });
  auditAdminMutation(req, 'tutoring.profile_update', 'tutor_profile', req.user.account_id, { active, skillCount: normalizedExpertise.length });
  res.json({ profile });
});

app.put('/api/tutoring/requests/:id/schedule', requireClearance(2), (req, res) => {
  const existing = db.getTutoringRequest(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Permintaan tidak ditemukan atau tidak lagi menunggu jadwal.' });
  const { tutor_account_id: tutorAccountId, session_at: sessionAt, mode, meeting_url: meetingUrl, location, admin_note: adminNote } = req.body || {};
  const durationMinutes = req.body?.duration_minutes ?? 30;
  const tutor = typeof tutorAccountId === 'string' ? db.findUserById(tutorAccountId) : null;
  if (!tutor || tutor.role === 'superadmin' || tutor.clearance_level < 2) {
    return res.status(400).json({ error: 'Tutor harus merupakan anggota dengan clearance level 2 atau lebih.' });
  }
  if (typeof sessionAt !== 'string' || Number.isNaN(Date.parse(sessionAt)) || (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test' && Date.parse(sessionAt) <= Date.now())) {
    return res.status(400).json({ error: 'Waktu sesi harus berupa waktu valid di masa mendatang.' });
  }
  if (!['online', 'offline'].includes(mode)) return res.status(400).json({ error: 'Mode sesi tidak valid.' });
  if (![30, 45, 60, 90, 120].includes(durationMinutes)) return res.status(400).json({ error: 'Durasi sesi tidak valid.' });
  if (mode === 'online') {
    try {
      if (new URL(meetingUrl).protocol !== 'https:') throw new Error();
    } catch {
      return res.status(400).json({ error: 'Sesi online memerlukan tautan HTTPS yang valid.' });
    }
  } else if (typeof location !== 'string' || !location.trim() || location.length > 240) {
    return res.status(400).json({ error: 'Lokasi sesi luring wajib diisi dan maksimal 240 karakter.' });
  }
  let preferredSlots = [];
  try {
    preferredSlots = JSON.parse(existing.preferred_slots_json || '[]');
  } catch {
    preferredSlots = [];
  }
  if (preferredSlots.length) {
    const sessionStart = Date.parse(sessionAt);
    const sessionEnd = sessionStart + durationMinutes * 60000;
    const matchesStudentSlot = preferredSlots.some((slot) => {
      if (slot.mode !== 'any' && slot.mode !== mode) return false;
      const preferredStart = Date.parse(`${slot.date}T${slot.start}:00+07:00`);
      const preferredEnd = Date.parse(`${slot.date}T${slot.end}:00+07:00`);
      return sessionStart >= preferredStart && sessionEnd <= preferredEnd;
    });
    if (!matchesStudentSlot) return res.status(409).json({ error: 'Jadwal sesi berada di luar slot pilihan mahasiswa.' });
  }
  if (!db.tutorAvailableAt(tutor.account_id, sessionAt, mode, durationMinutes)) {
    return res.status(409).json({ error: 'Tutor tidak menawarkan keahlian atau slot yang mencakup durasi sesi pada waktu dan mode yang dipilih.' });
  }
  if (db.tutorHasScheduleConflict(tutor.account_id, sessionAt, durationMinutes, req.params.id)) {
    return res.status(409).json({ error: 'Tutor sudah memiliki sesi lain pada rentang waktu tersebut.' });
  }
  if (typeof adminNote !== 'undefined' && (typeof adminNote !== 'string' || adminNote.length > 1000)) {
    return res.status(400).json({ error: 'Catatan pengurus maksimal 1000 karakter.' });
  }
  const scheduled = db.scheduleTutoringRequest(req.params.id, {
    status: 'Dijadwalkan',
    tutorAccountId: tutor.account_id,
    tutorName: tutor.name,
    sessionAt: new Date(sessionAt).toISOString(),
    durationMinutes,
    mode,
    meetingUrl: mode === 'online' ? meetingUrl.trim() : '',
    location: mode === 'offline' ? location.trim() : '',
    adminNote: adminNote?.trim() || ''
  });
  if (scheduled?.error) return res.status(409).json({ error: scheduled.error });
  if (!scheduled) return res.status(404).json({ error: 'Permintaan tidak ditemukan atau tidak lagi menunggu jadwal.' });
  auditAdminMutation(req, 'tutoring.schedule', 'tutoring_request', scheduled.id, { tutorAccountId: tutor.account_id, sessionAt: scheduled.session_at });
  createUserNotification(existing.student_account_id, 'tutoring', {
    title: 'Sesi Klinik Koding dijadwalkan',
    message: `${existing.course}: ${existing.topic} dijadwalkan ${new Date(scheduled.session_at).toLocaleString('id-ID')} bersama ${scheduled.tutor_name}.`,
    actionView: 'operations',
    dedupeKey: `tutoring:scheduled:${scheduled.id}:${scheduled.session_at}`
  });
  res.json({ request: scheduled });
});

app.put('/api/tutoring/requests/:id/status', requireClearance(2), (req, res) => {
  const { status, admin_note: adminNote } = req.body || {};
  if (!['Selesai', 'Ditolak'].includes(status) || (adminNote !== undefined && (typeof adminNote !== 'string' || adminNote.length > 1000))) {
    return res.status(400).json({ error: 'Status atau catatan permintaan tidak valid.' });
  }
  const existing = db.getTutoringRequest(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Permintaan tidak ditemukan atau statusnya tidak dapat diubah.' });
  const request = db.setTutoringRequestStatus(req.params.id, status, adminNote?.trim() || '');
  if (!request) return res.status(404).json({ error: 'Permintaan tidak ditemukan atau statusnya tidak dapat diubah.' });
  auditAdminMutation(req, 'tutoring.status_change', 'tutoring_request', request.id, { status });
  createUserNotification(existing.student_account_id, 'tutoring', {
    title: 'Status Klinik Koding diperbarui',
    message: `Permintaan sesi ${existing.course}: ${existing.topic} berstatus ${status}.`,
    actionView: 'operations',
    dedupeKey: `tutoring:status:${request.id}:${status}:${request.updated_at}`
  });
  res.json({ request });
});


};
