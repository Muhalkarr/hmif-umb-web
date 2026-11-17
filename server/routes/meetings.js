const MAX_RECURRENCE_DAYS = 366;
const MAX_OCCURRENCES = MAX_RECURRENCE_DAYS;
const MAX_ATTENDEES = 100;
const isoTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

const isValidDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const normalized = new Date(Date.UTC(year, month - 1, day));
  return normalized.getUTCFullYear() === year && normalized.getUTCMonth() === month - 1 && normalized.getUTCDate() === day;
};

const isValidTimestamp = (value) => typeof value === 'string'
  && isoTimestamp.test(value)
  && isValidDate(value.slice(0, 10))
  && Number.isFinite(Date.parse(value));

const recurrenceDate = (start, frequency, interval, index) => {
  const date = new Date(start);
  if (frequency === 'daily') date.setUTCDate(date.getUTCDate() + interval * index);
  if (frequency === 'weekly') date.setUTCDate(date.getUTCDate() + 7 * interval * index);
  if (frequency === 'monthly') {
    const day = date.getUTCDate();
    const targetMonth = date.getUTCMonth() + interval * index;
    date.setUTCDate(1);
    date.setUTCMonth(targetMonth);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
  }
  return date;
};

const buildOccurrences = ({ startsAt, endsAt, recurrence }) => {
  if (!recurrence) return [{ startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString() }];
  const { frequency, interval, until } = recurrence;
  if (!['daily', 'weekly', 'monthly'].includes(frequency)
    || !Number.isInteger(interval) || interval < 1 || interval > 4
    || !isValidDate(until)
    || !Number.isFinite(Date.parse(`${until}T23:59:59Z`))) return null;

  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const recurrenceEnd = new Date(`${until}T23:59:59Z`);
  if (recurrenceEnd < start || recurrenceEnd.getTime() - start.getTime() > MAX_RECURRENCE_DAYS * 86400000) return null;
  const duration = end.getTime() - start.getTime();
  const occurrences = [];
  for (let index = 0; index < MAX_OCCURRENCES; index += 1) {
    const occurrenceStart = recurrenceDate(start, frequency, interval, index);
    if (occurrenceStart > recurrenceEnd) break;
    occurrences.push({
      startsAt: occurrenceStart.toISOString(),
      endsAt: new Date(occurrenceStart.getTime() + duration).toISOString()
    });
  }
  return occurrences.length ? occurrences : null;
};

const canOrganize = (user) => user?.role === 'superadmin'
  || user?.permissions?.includes('meeting_organize')
  || user?.position_capabilities?.includes('meeting_organize');

const canManageMeeting = (meeting, user) => meeting?.organizer_account_id === user?.account_id
  && canOrganize(user);

const isMeetingAttendee = (meeting, accountId) => meeting?.attendees
  ?.some(({ account_id: attendeeId }) => attendeeId === accountId);

const isValidExternalMeetingUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
};

export function registerMeetingRoutes(app, {
  db,
  requireAuth,
  randomUUID,
  createUserNotification,
  meetingConferencingService,
  knowledgeFileUpload,
  multer,
  fs,
  path,
  MEETING_DOCUMENT_DIR,
  isPdfDocument,
  createHash
}) {
  const requireMeetingManager = (req, res, next) => {
    const meeting = db.getMeetingForAccount(req.params.id, req.user.account_id);
    if (!meeting) return res.status(404).json({ error: 'Rapat tidak ditemukan.' });
    if (!canManageMeeting(meeting, req.user)) return res.status(403).json({ error: 'Capability penyelenggara rapat diperlukan.' });
    req.meeting = meeting;
    next();
  };

  const respondConferencingError = (res, error, action, publicMessage) => {
    if (Number.isInteger(error?.status)) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error(`[MEETING ${action} ERROR]`, error);
    return res.status(502).json({ error: publicMessage });
  };

  const refreshRecordingState = async (meeting) => {
    const activeRecording = db.getLatestActiveMeetingRecording(meeting.id);
    if (!activeRecording?.egress_id) return activeRecording;
    const providerState = await meetingConferencingService.getRecordingStatus(activeRecording.egress_id);
    if (!providerState) {
      return db.updateMeetingRecordingStatus(activeRecording.id, meeting.id, 'failed', {
        stoppedAt: new Date().toISOString(),
        failureCode: 'provider_job_missing'
      });
    }
    if (providerState.status === 'unknown') throw new Error('The SFU returned an unrecognized recording status.');
    if (providerState.status !== activeRecording.status) {
      return db.updateMeetingRecordingStatus(activeRecording.id, meeting.id, providerState.status, {
        stoppedAt: ['completed', 'failed'].includes(providerState.status) ? new Date().toISOString() : null,
        failureCode: providerState.failureCode
      });
    }
    return activeRecording;
  };

  app.get('/api/meetings/mine', requireAuth, (req, res) => {
    res.json({ meetings: db.listMyMeetings(req.user.account_id) });
  });

  app.get('/api/meetings/capabilities', requireAuth, (_req, res) => {
    res.json(meetingConferencingService.capabilities());
  });

  app.post('/api/meetings', requireAuth, (req, res) => {
    if (!canOrganize(req.user)) return res.status(403).json({ error: 'Capability penyelenggara rapat diperlukan.' });
    const {
      title,
      agenda = '',
      location = '',
      video_mode: videoMode = 'in_person',
      starts_at: startsAt,
      ends_at: endsAt,
      recurrence = null
    } = req.body || {};
    if (typeof title !== 'string' || title.trim().length < 3 || title.trim().length > 160) {
      return res.status(400).json({ error: 'Judul rapat harus berisi 3 sampai 160 karakter.' });
    }
    if (typeof agenda !== 'string' || agenda.length > 4000 || typeof location !== 'string' || location.length > 240) {
      return res.status(400).json({ error: 'Agenda maksimal 4.000 karakter dan lokasi maksimal 240 karakter.' });
    }
    if (!['in_person', 'livekit', 'external'].includes(videoMode)) {
      return res.status(400).json({ error: 'Mode rapat tidak valid.' });
    }
    if (videoMode === 'livekit' && !meetingConferencingService.capabilities().videoEnabled) {
      return res.status(503).json({ error: 'Panggilan video bawaan belum dikonfigurasi.' });
    }
    if (videoMode === 'external' && !isValidExternalMeetingUrl(location.trim())) {
      return res.status(400).json({ error: 'Tautan konferensi harus berupa URL HTTPS tanpa kredensial.' });
    }
    if (!isValidTimestamp(startsAt) || !isValidTimestamp(endsAt)
      || Date.parse(endsAt) <= Date.parse(startsAt)
      || Date.parse(endsAt) - Date.parse(startsAt) > 24 * 60 * 60 * 1000) {
      return res.status(400).json({ error: 'Waktu rapat tidak valid atau durasinya melebihi 24 jam.' });
    }
    const occurrences = buildOccurrences({ startsAt, endsAt, recurrence });
    if (!occurrences) return res.status(400).json({ error: 'Aturan rapat berulang tidak valid atau melewati batas 12 bulan.' });
    const requestedAttendeeNims = req.body.attendee_nims;
    if (!Array.isArray(requestedAttendeeNims) || requestedAttendeeNims.length > MAX_ATTENDEES
      || requestedAttendeeNims.some((nim) => typeof nim !== 'string' || !nim.trim())) {
      return res.status(400).json({ error: `Daftar peserta harus berupa array dengan maksimal ${MAX_ATTENDEES} akun.` });
    }
    const invitedUsers = requestedAttendeeNims.map((nim) => db.findUserByNIM(nim.trim()));
    if (invitedUsers.some((user) => !user)) {
      return res.status(400).json({ error: 'Satu atau beberapa akun peserta tidak ditemukan.' });
    }
    const attendeeAccountIds = [...new Set([...invitedUsers.map(({ account_id: accountId }) => accountId), req.user.account_id])];

    const seriesId = randomUUID();
    const meetingOccurrences = occurrences.map((occurrence) => ({
      id: randomUUID(),
      title: title.trim(),
      agenda: agenda.trim(),
      location: location.trim(),
      videoMode,
      ...occurrence
    }));
    db.createMeetingOccurrences({
      seriesId,
      organizerAccountId: req.user.account_id,
      attendeeAccountIds,
      recurrenceRule: recurrence,
      occurrences: meetingOccurrences
    });
    db.insertAudit({
      actorNim: req.user.nim,
      actorRole: req.user.role,
      action: 'meeting.create',
      targetType: 'meeting_series',
      targetId: seriesId,
      details: { occurrence_count: meetingOccurrences.length, attendee_count: attendeeAccountIds.length }
    });
    attendeeAccountIds.filter((accountId) => accountId !== req.user.account_id).forEach((accountId) => {
      createUserNotification?.(accountId, 'meeting', {
        title: `Undangan rapat: ${title.trim()}`,
        message: 'Anda menerima undangan rapat HMIF. Buka workspace untuk melihat detailnya.',
        actionView: 'meetings',
        dedupeKey: `meeting-invitation:${seriesId}:${accountId}`
      });
    });
    res.status(201).json({
      meetings: db.listMyMeetings(req.user.account_id).filter(({ series_id: id }) => id === seriesId)
    });
  });

  app.get('/api/meetings/:id', requireAuth, (req, res) => {
    const meeting = db.getMeetingForAccount(req.params.id, req.user.account_id);
    if (!meeting) return res.status(404).json({ error: 'Rapat tidak ditemukan.' });
    res.json({ meeting });
  });

  app.get('/api/meetings/:id/video/status', requireAuth, async (req, res) => {
    let meeting = db.getMeetingForAccount(req.params.id, req.user.account_id);
    if (!meeting) return res.status(404).json({ error: 'Rapat tidak ditemukan.' });
    try {
      const activeRecording = await refreshRecordingState(meeting);
      if (activeRecording) meeting = db.getMeetingForAccount(req.params.id, req.user.account_id);
    } catch (error) {
      return respondConferencingError(res, error, 'RECORDING STATUS', 'Status rekaman tidak dapat diperbarui dari provider.');
    }
    const capabilities = meetingConferencingService.capabilities();
    res.json({
      video_enabled: capabilities.videoEnabled && meeting.video_mode === 'livekit' && meeting.status === 'scheduled',
      recording_enabled: capabilities.recordingEnabled && meeting.video_mode === 'livekit' && meeting.status === 'scheduled',
      recording_disabled_reason: capabilities.recordingDisabledReason,
      recording: meeting.recording
    });
  });

  app.post('/api/meetings/:id/video/token', requireAuth, async (req, res) => {
    const meeting = db.getMeetingForAccount(req.params.id, req.user.account_id);
    if (!meeting) return res.status(404).json({ error: 'Rapat tidak ditemukan.' });
    if (meeting.status !== 'scheduled' || ['declined', 'absent'].includes(meeting.my_response)) {
      return res.status(403).json({ error: 'Akun ini tidak dapat bergabung ke rapat tersebut.' });
    }
    if (meeting.video_mode !== 'livekit') {
      return res.status(409).json({ error: 'Rapat ini tidak menggunakan panggilan video bawaan.' });
    }
    try {
      const token = await meetingConferencingService.issueJoinToken({
        meetingId: meeting.id,
        accountId: req.user.account_id,
        displayName: req.user.name
      });
      res.json(token);
    } catch (error) {
      return respondConferencingError(res, error, 'VIDEO TOKEN', 'Token panggilan video tidak dapat dibuat.');
    }
  });

  app.post('/api/meetings/:id/recording/start', requireAuth, requireMeetingManager, async (req, res) => {
    if (req.meeting.status !== 'scheduled' || req.meeting.video_mode !== 'livekit') {
      return res.status(409).json({ error: 'Perekaman hanya tersedia untuk rapat video bawaan yang masih aktif.' });
    }
    if (req.body?.notice_confirmed !== true) {
      return res.status(400).json({ error: 'Konfirmasikan bahwa peserta telah diberi tahu sebelum mulai merekam.' });
    }
    const capabilities = meetingConferencingService.capabilities();
    if (!capabilities.recordingEnabled) {
      return res.status(503).json({ error: 'Perekaman belum aktif atau kebijakan retensinya belum disetujui.' });
    }
    const noticeConfirmedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + meetingConferencingService.recordingRetentionDays * 86400000).toISOString();
    const recording = db.createMeetingRecording({
      id: randomUUID(),
      meetingId: req.meeting.id,
      noticeConfirmedBy: req.user.account_id,
      noticeConfirmedAt,
      expiresAt
    });
    if (!recording) return res.status(409).json({ error: 'Rapat ini sudah memiliki perekaman aktif.' });
    let egress;
    try {
      egress = await meetingConferencingService.startRecording({
        meetingId: req.meeting.id,
        recordingId: recording.id
      });
      if (!egress.egressId || !egress.storageKey) throw new Error('The SFU did not return recording identifiers.');
      db.setMeetingRecordingStarted(recording.id, req.meeting.id, egress.egressId, egress.storageKey);
    } catch (error) {
      if (egress?.egressId) {
        try {
          await meetingConferencingService.stopRecording(egress.egressId);
        } catch (cleanupError) {
          console.error('[MEETING RECORDING START CLEANUP ERROR]', cleanupError);
        }
      }
      db.updateMeetingRecordingStatus(recording.id, req.meeting.id, 'failed', {
        stoppedAt: new Date().toISOString(),
        failureCode: 'provider_start_failed'
      });
      return respondConferencingError(res, error, 'RECORDING START', 'Perekaman tidak dapat dimulai.');
    }
    db.insertAudit({
      actorNim: req.user.nim,
      actorRole: req.user.role,
      action: 'meeting.recording_start',
      targetType: 'meeting_recording',
      targetId: recording.id,
      details: { meeting_id: req.meeting.id, notice_confirmed_at: noticeConfirmedAt }
    });
    req.meeting.attendees.forEach(({ account_id: accountId }) => {
      createUserNotification?.(accountId, 'meeting', {
        title: `Perekaman dimulai: ${req.meeting.title}`,
        message: 'Penyelenggara telah memberi pemberitahuan bahwa rapat ini sedang direkam.',
        actionView: 'meetings',
        dedupeKey: `meeting-recording-start:${recording.id}:${accountId}`
      });
    });
    res.status(201).json({ recording: db.getMeetingRecordingSummary(req.meeting.id) });
  });

  app.post('/api/meetings/:id/recording/stop', requireAuth, requireMeetingManager, async (req, res) => {
    const recording = db.getLatestActiveMeetingRecording(req.meeting.id);
    if (!recording || !recording.egress_id) {
      return res.status(404).json({ error: 'Tidak ada perekaman aktif untuk rapat ini.' });
    }
    if (recording.status === 'stopping') {
      return res.status(409).json({ error: 'Perekaman sedang dihentikan.' });
    }
    try {
      await meetingConferencingService.stopRecording(recording.egress_id);
      db.updateMeetingRecordingStatus(recording.id, req.meeting.id, 'stopping');
    } catch (error) {
      return respondConferencingError(res, error, 'RECORDING STOP', 'Perekaman tidak dapat dihentikan.');
    }
    db.insertAudit({
      actorNim: req.user.nim,
      actorRole: req.user.role,
      action: 'meeting.recording_stop',
      targetType: 'meeting_recording',
      targetId: recording.id,
      details: { meeting_id: req.meeting.id }
    });
    res.json({ recording: db.getMeetingRecordingSummary(req.meeting.id) });
  });

  app.get('/api/meetings/:id/recordings/:recordingId/download', requireAuth, async (req, res) => {
    const meeting = db.getMeetingForAccount(req.params.id, req.user.account_id);
    if (!meeting) return res.status(404).json({ error: 'Rekaman rapat tidak ditemukan.' });
    const recording = db.getMeetingRecording(req.params.id, req.params.recordingId);
    if (!recording || recording.status !== 'completed' || !recording.storage_key
      || Date.parse(recording.expires_at) <= Date.now()) {
      return res.status(404).json({ error: 'Rekaman rapat tidak ditemukan atau sudah kedaluwarsa.' });
    }
    try {
      const downloadUrl = await meetingConferencingService.createRecordingDownloadUrl(recording.storage_key);
      db.insertAudit({
        actorNim: req.user.nim,
        actorRole: req.user.role,
        action: 'meeting.recording_download',
        targetType: 'meeting_recording',
        targetId: recording.id,
        details: { meeting_id: req.params.id }
      });
      res.redirect(302, downloadUrl);
    } catch (error) {
      return respondConferencingError(res, error, 'RECORDING DOWNLOAD', 'Rekaman tidak dapat diakses.');
    }
  });

  app.put('/api/meetings/:id/rsvp', requireAuth, (req, res) => {
    if (!['accepted', 'declined'].includes(req.body?.response)) {
      return res.status(400).json({ error: 'Jawaban undangan tidak valid.' });
    }
    const existing = db.getMeetingForAccount(req.params.id, req.user.account_id);
    if (!existing) return res.status(404).json({ error: 'Undangan rapat tidak ditemukan.' });
    if (existing.status === 'cancelled') return res.status(409).json({ error: 'Rapat telah dibatalkan.' });
    const meeting = db.updateMeetingRsvp(req.params.id, req.user.account_id, req.body.response);
    if (!meeting) return res.status(404).json({ error: 'Undangan rapat tidak ditemukan.' });
    if (meeting.organizer_account_id !== req.user.account_id) {
      createUserNotification?.(meeting.organizer_account_id, 'meeting', {
        title: `Jawaban undangan: ${meeting.title}`,
        message: `${req.user.name} memperbarui jawaban undangan rapat.`,
        actionView: 'meetings',
        dedupeKey: `meeting-rsvp:${req.params.id}:${req.user.account_id}:${req.body.response}`
      });
    }
    res.json({ meeting });
  });

  app.put('/api/meetings/:id/schedule', requireAuth, requireMeetingManager, (req, res) => {
    const { starts_at: startsAt, ends_at: endsAt } = req.body || {};
    if (!isValidTimestamp(startsAt) || !isValidTimestamp(endsAt)
      || Date.parse(endsAt) <= Date.parse(startsAt)
      || Date.parse(endsAt) - Date.parse(startsAt) > 24 * 60 * 60 * 1000) {
      return res.status(400).json({ error: 'Waktu rapat tidak valid atau durasinya melebihi 24 jam.' });
    }
    if (!db.rescheduleMeeting(req.params.id, new Date(startsAt).toISOString(), new Date(endsAt).toISOString())) {
      return res.status(409).json({ error: 'Rapat tidak dapat dijadwalkan ulang karena sudah dibatalkan.' });
    }
    db.insertAudit({
      actorNim: req.user.nim,
      actorRole: req.user.role,
      action: 'meeting.reschedule',
      targetType: 'meeting',
      targetId: req.params.id,
      details: { starts_at: new Date(startsAt).toISOString(), ends_at: new Date(endsAt).toISOString() }
    });
    req.meeting.attendees.forEach(({ account_id: accountId }) => {
      if (accountId === req.user.account_id) return;
      createUserNotification?.(accountId, 'meeting', {
        title: `Jadwal rapat diperbarui: ${req.meeting.title}`,
        message: 'Waktu rapat berubah. Buka workspace untuk melihat jadwal terbaru.',
        actionView: 'meetings',
        dedupeKey: `meeting-reschedule:${req.params.id}:${startsAt}`
      });
    });
    res.json({ meeting: db.getMeetingForAccount(req.params.id, req.user.account_id) });
  });

  app.delete('/api/meetings/:id', requireAuth, requireMeetingManager, (req, res) => {
    const scope = req.body?.scope || 'occurrence';
    if (!['occurrence', 'series'].includes(scope)) {
      return res.status(400).json({ error: 'Cakupan pembatalan tidak valid.' });
    }
    let attendeeAccountIds;
    let cancelledCount;
    if (scope === 'series') {
      const result = db.cancelMeetingSeries(req.meeting.series_id, req.user.account_id);
      attendeeAccountIds = result.attendeeAccountIds;
      cancelledCount = result.changes;
    } else {
      attendeeAccountIds = req.meeting.attendees.map(({ account_id: accountId }) => accountId);
      cancelledCount = db.cancelMeetingOccurrence(req.params.id);
    }
    if (!cancelledCount) return res.status(409).json({ error: 'Rapat telah dibatalkan atau tidak dapat diubah.' });
    db.insertAudit({
      actorNim: req.user.nim,
      actorRole: req.user.role,
      action: scope === 'series' ? 'meeting.series_cancel' : 'meeting.cancel',
      targetType: scope === 'series' ? 'meeting_series' : 'meeting',
      targetId: scope === 'series' ? req.meeting.series_id : req.params.id,
      details: { cancelled_occurrences: cancelledCount }
    });
    [...new Set(attendeeAccountIds)].filter((accountId) => accountId !== req.user.account_id).forEach((accountId) => {
      createUserNotification?.(accountId, 'meeting', {
        title: `Rapat dibatalkan: ${req.meeting.title}`,
        message: scope === 'series' ? 'Seluruh rangkaian rapat ini dibatalkan.' : 'Kejadian rapat ini dibatalkan.',
        actionView: 'meetings',
        dedupeKey: `meeting-cancel:${scope}:${req.meeting.series_id}:${accountId}`
      });
    });
    res.json({ cancelled_occurrences: cancelledCount });
  });

  app.put('/api/meetings/:id/minutes', requireAuth, (req, res) => {
    const meeting = db.getMeetingForAccount(req.params.id, req.user.account_id);
    if (!meeting) return res.status(404).json({ error: 'Rapat tidak ditemukan.' });
    if (!canManageMeeting(meeting, req.user)) {
      return res.status(403).json({ error: 'Hanya penyelenggara yang dapat mengubah notulensi rapat.' });
    }
    const { minutes, decisions = [] } = req.body || {};
    if (typeof minutes !== 'string' || minutes.length > 12000 || !Array.isArray(decisions)
      || decisions.length > 30 || decisions.some((decision) => typeof decision !== 'string' || decision.length > 500)) {
      return res.status(400).json({ error: 'Notulensi atau daftar keputusan tidak valid.' });
    }
    if (!db.saveMeetingMinutes(req.params.id, { minutes: minutes.trim(), decisions: decisions.map((decision) => decision.trim()).filter(Boolean) })) {
      return res.status(500).json({ error: 'Notulensi rapat gagal disimpan.' });
    }
    db.insertAudit({
      actorNim: req.user.nim,
      actorRole: req.user.role,
      action: 'meeting.minutes_update',
      targetType: 'meeting',
      targetId: req.params.id,
      details: { decision_count: decisions.filter(Boolean).length }
    });
    res.json({ meeting: db.getMeetingForAccount(req.params.id, req.user.account_id) });
  });

  app.put('/api/meetings/:id/attendance', requireAuth, (req, res) => {
    const meeting = db.getMeetingForAccount(req.params.id, req.user.account_id);
    if (!meeting) return res.status(404).json({ error: 'Rapat tidak ditemukan.' });
    if (!canManageMeeting(meeting, req.user)) {
      return res.status(403).json({ error: 'Hanya penyelenggara yang dapat mencatat presensi.' });
    }
    const { account_id: accountId, response } = req.body || {};
    if (!['attended', 'absent'].includes(response) || !isMeetingAttendee(meeting, accountId)) {
      return res.status(400).json({ error: 'Peserta atau status presensi tidak valid.' });
    }
    const updated = db.markMeetingAttendance(req.params.id, accountId, response, req.user.account_id);
    if (!updated) return res.status(404).json({ error: 'Peserta rapat tidak ditemukan.' });
    db.insertAudit({
      actorNim: req.user.nim,
      actorRole: req.user.role,
      action: 'meeting.attendance_mark',
      targetType: 'meeting',
      targetId: req.params.id,
      details: { participant_account_id: accountId, response }
    });
    res.json({ meeting: db.getMeetingForAccount(req.params.id, req.user.account_id) });
  });

  app.post('/api/meetings/:id/actions', requireAuth, (req, res) => {
    const meeting = db.getMeetingForAccount(req.params.id, req.user.account_id);
    if (!meeting) return res.status(404).json({ error: 'Rapat tidak ditemukan.' });
    if (!canManageMeeting(meeting, req.user)) {
      return res.status(403).json({ error: 'Hanya penyelenggara yang dapat menetapkan tindak lanjut.' });
    }
    const { title, assignee_nim: assigneeNim = '', due_date: dueDate = null } = req.body || {};
    const assignee = assigneeNim ? db.findUserByNIM(assigneeNim.trim()) : null;
    const assigneeAccountId = assignee?.account_id || null;
    if (typeof title !== 'string' || title.trim().length < 3 || title.trim().length > 240
      || (dueDate !== null && !isValidDate(dueDate))
      || (assigneeNim && (!assignee || !isMeetingAttendee(meeting, assigneeAccountId)))) {
      return res.status(400).json({ error: 'Data tindak lanjut tidak valid; penanggung jawab harus peserta rapat.' });
    }
    const action = db.createMeetingAction({
      id: randomUUID(),
      meetingId: req.params.id,
      title: title.trim(),
      assigneeAccountId,
      dueDate,
      createdByAccountId: req.user.account_id
    });
    db.insertAudit({
      actorNim: req.user.nim,
      actorRole: req.user.role,
      action: 'meeting.action_create',
      targetType: 'meeting_action',
      targetId: action.id,
      details: { meeting_id: req.params.id, assignee_account_id: assigneeAccountId }
    });
    if (assigneeAccountId && assigneeAccountId !== req.user.account_id) {
      createUserNotification?.(assigneeAccountId, 'meeting', {
        title: `Tindak lanjut rapat: ${meeting.title}`,
        message: title.trim(),
        actionView: 'meetings',
        dedupeKey: `meeting-action:${action.id}`
      });
    }
    res.status(201).json({ action });
  });

  app.put('/api/meetings/:id/actions/:actionId', requireAuth, (req, res) => {
    const meeting = db.getMeetingForAccount(req.params.id, req.user.account_id);
    if (!meeting) return res.status(404).json({ error: 'Rapat tidak ditemukan.' });
    if (!canManageMeeting(meeting, req.user)) {
      return res.status(403).json({ error: 'Hanya penyelenggara yang dapat memperbarui tindak lanjut.' });
    }
    if (!['todo', 'in_progress', 'done'].includes(req.body?.status)) {
      return res.status(400).json({ error: 'Status tindak lanjut tidak valid.' });
    }
    const action = db.updateMeetingActionStatus(req.params.actionId, req.params.id, req.body.status);
    if (!action) return res.status(404).json({ error: 'Tindak lanjut tidak ditemukan.' });
    db.insertAudit({
      actorNim: req.user.nim,
      actorRole: req.user.role,
      action: 'meeting.action_update',
      targetType: 'meeting_action',
      targetId: action.id,
      details: { meeting_id: req.params.id, status: action.status }
    });
    res.json({ action });
  });

  app.post('/api/meetings/:id/documents', requireAuth, (req, res) => {
    const meeting = db.getMeetingForAccount(req.params.id, req.user.account_id);
    if (!meeting) return res.status(404).json({ error: 'Rapat tidak ditemukan.' });
    if (!canManageMeeting(meeting, req.user)) {
      return res.status(403).json({ error: 'Hanya penyelenggara yang dapat menambahkan dokumen rapat.' });
    }
    const { title, url } = req.body || {};
    let documentUrl;
    try {
      documentUrl = new URL(url);
    } catch {
      return res.status(400).json({ error: 'Tautan dokumen harus berupa URL HTTPS yang valid.' });
    }
    if (typeof title !== 'string' || title.trim().length < 2 || title.trim().length > 160
      || documentUrl.protocol !== 'https:' || documentUrl.username || documentUrl.password) {
      return res.status(400).json({ error: 'Judul atau tautan dokumen tidak valid; URL harus menggunakan HTTPS.' });
    }
    const document = db.addMeetingDocument({
      id: randomUUID(),
      meetingId: req.params.id,
      title: title.trim(),
      url: documentUrl.toString(),
      createdByAccountId: req.user.account_id
    });
    db.insertAudit({
      actorNim: req.user.nim,
      actorRole: req.user.role,
      action: 'meeting.document_add',
      targetType: 'meeting_document',
      targetId: document.id,
      details: { meeting_id: req.params.id }
    });
    res.status(201).json({ document });
  });

  app.post('/api/meetings/:id/documents/upload', requireAuth, requireMeetingManager, (req, res, next) => {
    knowledgeFileUpload.single('file')(req, res, (error) => {
      if (!error) return next();
      res.status(error instanceof multer.MulterError ? 413 : 400).json({ error: error.message });
    });
  }, (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Pilih satu dokumen PDF.' });
    const { title } = req.body || {};
    if (typeof title !== 'string' || title.trim().length < 2 || title.trim().length > 160) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Nama dokumen harus berisi 2 sampai 160 karakter.' });
    }
    let buffer;
    try {
      buffer = fs.readFileSync(req.file.path);
    } catch (error) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      console.error('[MEETING DOCUMENT READ ERROR]', error);
      return res.status(500).json({ error: 'Dokumen rapat tidak dapat dibaca.' });
    }
    if (!isPdfDocument(buffer)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Isi file bukan dokumen PDF yang valid.' });
    }
    const id = randomUUID();
    const storedName = `${id}.pdf`;
    const targetPath = path.join(MEETING_DOCUMENT_DIR, storedName);
    try {
      fs.renameSync(req.file.path, targetPath);
      const document = db.addMeetingDocument({
        id,
        meetingId: req.params.id,
        title: title.trim(),
        storedName,
        originalName: path.basename(req.file.originalname).replace(/[\r\n"\\]/g, '_').slice(0, 160),
        size: req.file.size,
        sha256: createHash('sha256').update(buffer).digest('hex'),
        createdByAccountId: req.user.account_id
      });
      db.insertAudit({
        actorNim: req.user.nim,
        actorRole: req.user.role,
        action: 'meeting.document_upload',
        targetType: 'meeting_document',
        targetId: document.id,
        details: { meeting_id: req.params.id, size: document.size, sha256: document.sha256 }
      });
      res.status(201).json({ document });
    } catch (error) {
      if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      console.error('[MEETING DOCUMENT UPLOAD ERROR]', error);
      res.status(500).json({ error: 'Dokumen rapat tidak dapat disimpan.' });
    }
  });

  app.get('/api/meetings/:id/documents/:documentId/download', requireAuth, (req, res) => {
    const meeting = db.getMeetingForAccount(req.params.id, req.user.account_id);
    if (!meeting) return res.status(404).json({ error: 'Dokumen rapat tidak ditemukan.' });
    const document = db.getMeetingDocument(req.params.id, req.params.documentId);
    if (!document?.stored_name || path.basename(document.stored_name) !== document.stored_name) {
      return res.status(404).json({ error: 'Dokumen rapat tidak ditemukan.' });
    }
    const filePath = path.join(MEETING_DOCUMENT_DIR, document.stored_name);
    res.download(filePath, document.original_name || 'dokumen-rapat.pdf', (error) => {
      if (error) {
        console.error('[MEETING DOCUMENT DOWNLOAD ERROR]', error);
        if (!res.headersSent) res.status(error.code === 'ENOENT' ? 404 : 500).json({ error: 'Dokumen rapat tidak dapat diunduh.' });
        return;
      }
      db.insertAudit({
        actorNim: req.user.nim,
        actorRole: req.user.role,
        action: 'meeting.document_download',
        targetType: 'meeting_document',
        targetId: document.id,
        details: { meeting_id: req.params.id }
      });
    });
  });
}
