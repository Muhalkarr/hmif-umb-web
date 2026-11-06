/* ==========================================================================
   OPERATIONS ROUTES — Program Kerja, Kalender/Event, Delegasi, Aspirasi
   ========================================================================== */

import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { decryptPrivateText, encryptPrivateText, validateAspirationSubmission, ASPIRATION_STATUSES } from '../studentServices.js';

export function registerOperationsRoutes(app, ctx) {
  const {
    db, requireAuth, requireClearance, requireSuperadmin, authenticateToken,
    auditAdminMutation, createUserNotification, eventRegistrationLimiter,
    aspirationLimiter, aspirationTrackingLimiter, ASPIRATION_ENCRYPTION_KEY,
    encryptEventTicketToken, decryptEventTicketToken
  } = ctx;

  // --- PROGRAM KERJA ---
  app.get('/api/proker', (req, res) => {
    const programs = db.getAllProker();
    if (req.user?.clearance_level >= 2) return res.json(programs);
    res.json(programs.map(({ budget_allocated, budget_spent, lpj_notes, ...pub }) => pub));
  });

  app.post('/api/proker', requireClearance(2), async (req, res) => {
    const validationError = ctx.validateProker ? ctx.validateProker(req.body) : null;
    if (validationError) return res.status(400).json({ error: validationError });
    const newProker = db.createProker(req.body);
    auditAdminMutation(req, 'proker.create', 'proker', newProker.id, { division: newProker.division, status: newProker.status });
    // Broadcast real-time update ke semua client
    ctx.wsStatsService?.broadcastMutation({
      eventType: 'proker:created',
      accountId: req.user?.account_id,
      payload: { prokerId: newProker.id, title: newProker.title, division: newProker.division },
      afterState: { prokerId: newProker.id, title: newProker.title, status: newProker.status }
    });
    res.status(201).json({
      message: 'MISI PROGRAM KERJA BERHASIL DIDAFTARKAN KE PRTS',
      proker: newProker
    });
  });

  app.put('/api/proker/:id', requireClearance(2), async (req, res) => {
    const allowedFields = [
      'title', 'division', 'category', 'status', 'date_start', 'date_end',
      'target_participants', 'kpi_indicator', 'lpj_notes', 'budget_allocated'
    ];
    const updates = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => allowedFields.includes(key)));
    const validationError = ctx.validateProker ? ctx.validateProker(updates, true) : null;
    if (validationError) return res.status(400).json({ error: validationError });
    const updated = db.updateProker(req.params.id, updates);
    if (!updated) {
      return res.status(404).json({ error: 'Misi proker tidak ditemukan.' });
    }
    auditAdminMutation(req, 'proker.update', 'proker', updated.id, { fields: Object.keys(updates) });
    // Broadcast real-time update
    ctx.wsStatsService?.broadcastMutation({
      eventType: 'proker:updated',
      accountId: req.user?.account_id,
      payload: { prokerId: updated.id, title: updated.title, fields: Object.keys(updates) },
      afterState: { prokerId: updated.id, title: updated.title, status: updated.status }
    });
    res.json({
      message: 'UPDATE MISI BERHASIL // TELEMETRI DIPERBARUI',
      proker: updated
    });
  });

  app.get('/api/proker/lpj-summary', requireClearance(3), (req, res) => {
    const prokerList = db.getAllProker();
    const completed = prokerList.filter((p) => p.status === 'Selesai');
    const totalBudget = prokerList.reduce((s, p) => s + (p.budget_allocated || 0), 0);
    const totalSpent = prokerList.reduce((s, p) => s + (p.budget_spent || 0), 0);
    const divisionSummary = {};
    prokerList.forEach((p) => {
      if (!divisionSummary[p.division]) divisionSummary[p.division] = { total: 0, completed: 0, budget_allocated: 0, budget_spent: 0 };
      divisionSummary[p.division].total++;
      if (p.status === 'Selesai') divisionSummary[p.division].completed++;
      divisionSummary[p.division].budget_allocated += p.budget_allocated || 0;
      divisionSummary[p.division].budget_spent += p.budget_spent || 0;
    });
    res.json({
      summary: {
        total_proker: prokerList.length, completed_proker: completed.length,
        completion_rate: prokerList.length ? Math.round((completed.length / prokerList.length) * 100) : 0,
        total_budget_allocated: totalBudget, total_budget_spent: totalSpent,
        budget_efficiency: totalBudget ? Math.round((totalSpent / totalBudget) * 100) : 0
      },
      division_summary: divisionSummary,
      programs: prokerList.map((p) => ({ ...p, lpj_status: p.status === 'Selesai' ? (p.lpj_notes ? 'LPJ Lengkap' : 'LPJ Belum Diisi') : 'Belum Selesai' }))
    });
  });

  // --- KALENDER & EVENT ---
  app.get('/api/calendar', (req, res) => {
    res.json(db.getAllCalendarEvents());
  });

  // POST /api/calendar (Clearance Level >= 2)
  app.post('/api/calendar', requireClearance(2), (req, res) => {
    const { date_str, title, division, location, desc } = req.body;
    const registrationOpen = req.body.registration_open === true || req.body.registration_open === 'true';
    const capacity = Number(req.body.capacity);
    if (!ctx.validDate(date_str) || typeof title !== 'string' || !title.trim() || title.length > 180) {
      return res.status(400).json({ error: 'Tanggal dan nama kegiatan yang valid wajib diisi.' });
    }
    if ([division, location, desc, req.body.type].some((value) => value !== undefined && (typeof value !== 'string' || value.length > 3000))
      || (req.body.type !== undefined && !['proker', 'academic', 'psdm', 'litbang', 'beasiswa', 'kompetisi'].includes(req.body.type))) {
      return res.status(400).json({ error: 'Data kalender tidak valid atau terlalu panjang.' });
    }
    if (registrationOpen && (!Number.isInteger(capacity) || capacity < 1 || capacity > 10000)) {
      return res.status(400).json({ error: 'Kuota pendaftaran harus berupa angka antara 1 dan 10000.' });
    }
    let registrationUrl = '';
    try {
      registrationUrl = ctx.normalizePortalUrl(req.body.registration_url, 'URL pendaftaran');
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    const event = db.createCalendarEvent({
      ...req.body,
      registration_url: registrationUrl,
      registration_open: registrationOpen,
      capacity
    });
    auditAdminMutation(req, 'calendar.create', 'calendar_event', event.id, { date: event.date_str, type: event.type });
    res.status(201).json({
      message: 'AGENDA BERHASIL DITAMBAHKAN KE KALENDER TERPADU',
      event
    });
  });

  app.post('/api/events/:eventId/register', eventRegistrationLimiter, async (req, res) => {
    const event = db.getAllCalendarEvents().find((item) => item.id === req.params.eventId);
    if (!event || !event.registration_open) return res.status(404).json({ error: 'Pendaftaran event tidak tersedia.' });

    const member = req.user ? db.findUserByNIM(req.user.nim) : null;
    const name = member ? member.name : (typeof req.body?.name === 'string' ? req.body.name.trim() : '');
    const email = (typeof req.body?.email === 'string' ? req.body.email : member?.email || '').trim().toLowerCase();
    if (!name || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return res.status(400).json({ error: 'Nama dan email yang valid wajib diisi untuk pendaftaran event.' });
    }

    const { randomBytes } = await import('node:crypto');
    const { createHash } = await import('node:crypto');
    const ticketToken = randomBytes(32).toString('base64url');
    const ticketTokenHash = createHash('sha256').update(ticketToken).digest('hex');
    const result = db.registerEvent(req.params.eventId, {
      accountId: member?.account_id,
      name,
      email,
      ticketTokenHash,
      ticketTokenEncrypted: encryptEventTicketToken(ticketToken)
    });
    if (result.error) return res.status(409).json({ error: result.error });
    const emailDelivery = await ctx.sendEventTicketEmail?.({
      email,
      name,
      event: { title: event.title, date: event.date_str },
      ticket: { id: result.registration.id, token: ticketToken }
    }) || { sent: false };
    // Broadcast event registration
    ctx.wsStatsService?.broadcastMutation({
      eventType: 'event:registered',
      accountId: member?.account_id,
      payload: { eventId: event.id, eventTitle: event.title, registrationId: result.registration.id }
    });
    res.set('Cache-Control', 'no-store');
    res.status(201).json({
      ticket: { id: result.registration.id, token: ticketToken },
      event: { id: event.id, title: event.title, date: event.date_str },
      delivery: {
        email_sent: emailDelivery.sent,
        email_reason: emailDelivery.reason || '',
        dashboard_available: Boolean(member)
      }
    });
  });

  app.get('/api/events/tickets/mine', requireAuth, (req, res) => {
    const tickets = db.listMyEventTickets(req.user.account_id).map((ticket) => {
      let token = ticket.checked_in_at ? '' : decryptEventTicketToken(ticket.ticket_token_encrypted);
      if (!ticket.checked_in_at && !token) {
        token = randomBytes(32).toString('base64url');
        const tokenHash = createHash('sha256').update(token).digest('hex');
        if (!db.storeMyEventTicketToken(ticket.id, req.user.account_id, tokenHash, encryptEventTicketToken(token))) token = '';
      }
      return {
        id: ticket.id,
        event_id: ticket.event_id,
        participant_name: ticket.participant_name,
        checked_in_at: ticket.checked_in_at,
        created_at: ticket.created_at,
        event: ticket.event,
        token: token || ''
      };
    });
    res.set('Cache-Control', 'no-store');
    res.json({ tickets });
  });

  app.post('/api/events/:eventId/check-in', requireClearance(2), async (req, res) => {
    const { ticket_id: ticketId, ticket_token: ticketToken } = req.body || {};
    if (typeof ticketId !== 'string' || typeof ticketToken !== 'string' || ticketToken.length < 32 || ticketToken.length > 128) {
      return res.status(400).json({ error: 'Tiket dan kode QR yang valid wajib diberikan.' });
    }
    const tokenHash = ctx.createHash('sha256').update(ticketToken).digest('hex');
    const checkedIn = db.checkInEventRegistration(req.params.eventId, ticketId, tokenHash);
    if (checkedIn?.error) return res.status(checkedIn.status).json({ error: checkedIn.error });
    if (!checkedIn) return res.status(404).json({ error: 'Tiket tidak valid atau sudah digunakan.' });
    auditAdminMutation(req, 'event.check_in', 'event_registration', checkedIn.id, { eventId: req.params.eventId });
    // Broadcast check-in
    ctx.wsStatsService?.broadcastMutation({
      eventType: 'event:checkin',
      accountId: req.user?.account_id,
      payload: { eventId: req.params.eventId, registrationId: checkedIn.id, checkedInAt: checkedIn.checked_in_at }
    });
    res.json({ message: 'PRESENSI PESERTA TERVERIFIKASI', checked_in_at: checkedIn.checked_in_at });
  });

  app.post('/api/events/:eventId/certificates/issue', requireClearance(2), (req, res) => {
    const event = db.getAllCalendarEvents().find((item) => item.id === req.params.eventId);
    if (!event) return res.status(404).json({ error: 'Event tidak ditemukan.' });
    const certificateIds = db.issueEventCertificates(req.params.eventId);
    auditAdminMutation(req, 'event.certificates.issue', 'calendar_event', event.id, { issuedCount: certificateIds.length });
    res.json({ issued: certificateIds.length, certificate_ids: certificateIds });
  });

  app.get('/api/certificates/:certificateId', (req, res) => {
    const certificate = db.getVerifiedCertificate(req.params.certificateId);
    if (!certificate) return res.status(404).json({ error: 'Sertifikat tidak ditemukan atau tidak berlaku.' });
    res.set('Cache-Control', 'no-store');
    res.json({ certificate });
  });

  app.get('/api/calendar/clash-check', (req, res) => {
    const events = db.getAllCalendarEvents();
    const prokerList = db.getAllProker();
    const examPeriods = events.filter((e) => e.is_exam_period);
    const clashes = [];
    const examRanges = examPeriods.map((exam) => { const examDate = new Date(exam.date_str); const rs = new Date(examDate); rs.setDate(rs.getDate() - 3); const re = new Date(examDate); re.setDate(re.getDate() + 7); return { exam, start: rs.toISOString().split('T')[0], end: re.toISOString().split('T')[0] }; });
    prokerList.forEach((p) => { if (!p.date_start) return; examRanges.forEach(({ exam, start, end }) => { const ps = p.date_start; const pe = p.date_end || p.date_start; if (ps <= end && pe >= start) clashes.push({ proker_id: p.id, proker_title: p.title, proker_division: p.division, proker_dates: `${ps} s/d ${pe}`, exam_name: exam.title, exam_date: exam.date_str, exam_window: `${start} s/d ${end}`, severity: ps >= start && ps <= exam.date_str ? 'CRITICAL' : 'HIGH', message: `PERINGATAN: Proker '${p.title}' (${p.division}) bertabrakan dengan '${exam.title}'.` }); }); });
    res.json({ status: clashes.length > 0 ? 'CLASH DETECTED' : 'CLEAR', total_clashes: clashes.length, checked_at: new Date().toISOString(), exam_periods: examPeriods.map((e) => ({ title: e.title, date: e.date_str })), clashes });
  });

  app.get('/api/calendar/export-ics', (req, res) => {
    const events = db.getAllCalendarEvents();
    const { filter } = req.query;
    const filtered = filter ? events.filter((e) => e.type === filter || e.division.toLowerCase().includes(filter.toLowerCase())) : events;
    const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//HMIF Universitas Mayasari Bakti//PRTS Chrono Calendar//ID','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:Kalender Akademik & Proker HMIF UMB','X-WR-TIMEZONE:Asia/Jakarta'];
    filtered.forEach((ev) => { const now = new Date().toISOString().replace(/[-:]/g,'').split('.')[0]+'Z'; lines.push('BEGIN:VEVENT',`UID:${ev.id}@hmif.mayasaribakti.ac.id`,`DTSTAMP:${now}`,`DTSTART;VALUE=DATE:${ev.date_str.replace(/-/g,'')}`,`SUMMARY:[HMIF UMB] ${ev.title}`,`DESCRIPTION:${(ev.desc||'').replace(/\n/g,'\\n')} | Divisi: ${ev.division}`,`LOCATION:${ev.location||'Kampus UMB'}`,`CATEGORIES:${ev.type.toUpperCase()}`,'STATUS:CONFIRMED','END:VEVENT'); });
    lines.push('END:VCALENDAR');
    res.setHeader('Content-Type','text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition',`attachment; filename="kalender_hmif_umb${filter?'_'+filter:''}.ics"`);
    res.send(lines.join('\r\n'));
  });

  // --- DELEGASI ---
  app.get('/api/delegations', authenticateToken, (req, res) => {
    if (req.user.clearance_level >= 3 || req.user.role === 'superadmin') return res.json(db.getAllDelegations());
    res.json(db.getDelegationsByAccount(req.user.account_id));
  });

  app.post('/api/delegations', authenticateToken, (req, res) => {
    const { event_name, event_category, destination, start_date, end_date, funding_type, requested_budget, notes } = req.body;
    if (!event_name || !start_date || !end_date) return res.status(400).json({ error: 'Nama kegiatan, tanggal mulai, dan tanggal selesai wajib diisi.' });
    const delegation = db.createDelegation({ applicant_account_id: req.user.account_id, applicant_nim: req.user.nim, applicant_name: req.user.name, event_name, event_category, destination, start_date, end_date, funding_type, requested_budget, notes });
    res.status(201).json(delegation);
  });

  app.put('/api/delegations/:id/status', requireClearance(3), (req, res) => {
    const { status, mandate_letter_number, approved_budget, notes, clawback_warning } = req.body;
    const updated = db.updateDelegationStatus(req.params.id, { status, mandate_letter_number, approved_budget, notes, clawback_warning });
    if (!updated) return res.status(404).json({ error: 'Delegasi tidak ditemukan.' });
    res.json(updated);
  });

  app.post('/api/delegations/:id/lpd', authenticateToken, (req, res) => {
    const { lpd_text } = req.body;
    if (!lpd_text || lpd_text.trim().length < 10) return res.status(400).json({ error: 'LPD wajib diisi minimal 10 karakter.' });
    const updated = db.submitDelegationLpd(req.params.id, lpd_text.trim());
    if (!updated) return res.status(404).json({ error: 'Delegasi tidak ditemukan.' });
    res.json(updated);
  });

  // --- ASPIRASI ---
  app.get('/api/aspirations/rdp-agendas', (_req, res) => {
    try { res.json({ ok: true, data: db.getPublicRdpAgendas() }); } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.put('/api/aspirations/:id/rdp-agenda', requireClearance(3), (req, res) => {
    const { is_rdp_agenda, rdp_notes, rdp_scheduled_at } = req.body;
    const updated = db.setAspirationRdpAgenda(req.params.id, { is_rdp_agenda, rdp_notes, rdp_scheduled_at });
    if (!updated) return res.status(404).json({ error: 'Aspirasi tidak ditemukan.' });
    res.json(updated);
  });

  // GET /api/aspirations
  app.get('/api/aspirations', requireClearance(3), (req, res) => {
    const aspirations = db.getAllAspirations().map((aspiration) => ({
      ...aspiration,
      message: decryptPrivateText(aspiration.message, ASPIRATION_ENCRYPTION_KEY),
      bph_response: decryptPrivateText(aspiration.bph_response, ASPIRATION_ENCRYPTION_KEY)
    }));
    res.set('Cache-Control', 'no-store');
    res.json(aspirations);
  });

  // POST /api/aspirations (Public / Kader)
  app.post('/api/aspirations', aspirationLimiter, (req, res) => {
    let submission;
    try {
      submission = validateAspirationSubmission(req.body || {}, req.user);
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Pesan aspirasi tidak valid.' });
    }
    const trackingToken = randomBytes(32).toString('base64url');
    const trackingTokenHash = createHash('sha256').update(trackingToken).digest('hex');
    const created = db.createAspiration({
      sender: submission.sender,
      category: submission.category,
      message: encryptPrivateText(submission.message, ASPIRATION_ENCRYPTION_KEY),
      trackingTokenHash
    });
    res.status(201).json({
      message: 'TRANSMISI BERHASIL // ASPIRASI DITERIMA PRTS UMB',
      aspiration: { ...created, message: submission.message, is_anonymous: submission.is_anonymous },
      ticket: { id: created.id, trackingToken }
    });
  });

  // POST /api/aspirations/:id/track (Private ticket access)
  app.post('/api/aspirations/:id/track', aspirationTrackingLimiter, (req, res) => {
    const token = req.body?.tracking_token;
    if (typeof token !== 'string' || token.length < 32 || token.length > 128) {
      return res.status(404).json({ error: 'Tiket atau kode pelacakan tidak valid.' });
    }
    const tokenHash = ctx.createHash('sha256').update(token).digest('hex');
    const status = db.getAspirationStatus(req.params.id, tokenHash);
    if (!status) return res.status(404).json({ error: 'Tiket atau kode pelacakan tidak valid.' });
    res.set('Cache-Control', 'no-store');
    res.json({ aspiration: { ...status, bph_response: decryptPrivateText(status.bph_response, ASPIRATION_ENCRYPTION_KEY) } });
  });

  // PUT /api/aspirations/:id/respond (Clearance Level >= 3: BPH & Kahim)
  app.put('/api/aspirations/:id/respond', requireClearance(3), (req, res) => {
    const { response, status } = req.body || {};
    if (typeof response !== 'string' || !response.trim() || response.length > 3000) {
      return res.status(400).json({ error: 'Tanggapan BPH wajib diisi dan maksimal 3000 karakter.' });
    }
    if (status !== undefined && !ASPIRATION_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Status aspirasi tidak valid.' });
    }
    const responderInfo = req.user ? `${req.user.role_title} (${req.user.name})` : 'BPH HMIF';
    const encryptedResponse = encryptPrivateText(response.trim(), ASPIRATION_ENCRYPTION_KEY);
    const updated = db.respondAspiration(req.params.id, encryptedResponse, status || 'Ditindaklanjuti', responderInfo);
    if (!updated) {
      return res.status(404).json({ error: 'Aspirasi tidak ditemukan.' });
    }
    res.json({
      message: 'TANGGAPAN BPH TERSIMPAN // STATUS DIUPDATE',
      aspiration: { ...updated, bph_response: response.trim() }
    });
  });
}