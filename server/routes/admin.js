/* ==========================================================================
   ADMIN ROUTES — Showcase, Career, Tech Articles, Project Calls,
                  Portal Records, Inventory, Cadets, Tasks, Office Letters,
                  Users, Audit, Knowledge Files, Backup, Stats
   ========================================================================== */
import { validateOfficeLetter, generateOfficeLetterNumber } from '../officeDocuments.js';
import {
  CAREER_SPECIALIZATIONS,
  filterCareerOpportunities,
  groupAlumniByProvince,
  normalizeCareerSpecializations,
  validateMentorshipRequest
} from '../careerFeatures.js';
import {
  extractGithubRepository,
  validateProjectCall,
  validateProjectCallApplication,
  validateTechArticle
} from '../portfolioFeatures.js';

export function registerAdminRoutes(app, ctx) {
  const {
    db, requireAuth, requireClearance, requireSuperadmin, auditAdminMutation,
    createUserNotification, githubStatsLimiter, githubStatsCache, GITHUB_STATS_CACHE_MS,
    validateOrganizationTask, validatePortalRecord, validatePortalConsent,
    normalizePortalUrl, requirePortfolioReviewer, isPortfolioReviewer,
    fs, path, KNOWLEDGE_DIR, RECEIPT_DIR, receiptExtension, receiptUpload,
    isValidReceiptFile, multer, randomUUID, createHash, isAssetReferenced,
    hasPermission, bcrypt, daysUntilDate, getHmifCalendarDate
  } = ctx;

  // ==========================================================================
  // SHOWCASE & CAREER
  // ==========================================================================

  app.get('/api/showcase', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({
      projects: db.listPortalRecords('project')
        .filter((r) => r.active && r.review_status === 'published')
        .map(({ id, payload, created_at }) => ({ id, ...payload, created_at }))
    });
  });

  app.get('/api/career', (req, res) => {
    const rawAlumni = db.listPortalRecords('alumni').filter((r) => r.active && r.review_status === 'published');
    const rawJobs = db.listPortalRecords('job').filter((r) => r.active && r.review_status === 'published');
    const { specialization, province, mode } = req.query;
    if (specialization && !CAREER_SPECIALIZATIONS.includes(specialization)) {
      return res.status(400).json({ error: 'Filter spesialisasi karier tidak valid.' });
    }
    const alumni = rawAlumni.map((r) => ({ id: r.id, ...r.payload }));
    const opportunities = rawJobs.map((r) => ({
      id: r.id,
      ...r.payload,
      specializations: normalizeCareerSpecializations(r.payload.specializations, r.payload.specialization)
    }));
    res.set('Cache-Control', 'no-store');
    res.json({
      alumni: province ? groupAlumniByProvince(alumni)[province] || [] : alumni,
      alumni_distribution: groupAlumniByProvince(alumni),
      opportunities: filterCareerOpportunities(opportunities, specialization),
      specializations: CAREER_SPECIALIZATIONS
    });
  });

  app.post('/api/career/alumni/:id/mentorship-requests', requireAuth, (req, res) => {
    const alumnus = db.getPortalRecord(req.params.id);
    if (!alumnus || alumnus.kind !== 'alumni' || !alumnus.active || alumnus.review_status !== 'published') {
      return res.status(404).json({ error: 'Alumni tidak ditemukan.' });
    }
    let validated;
    try { validated = validateMentorshipRequest(req.body || {}); }
    catch (e) { return res.status(400).json({ error: e.message }); }
    const created = db.createCareerMentorshipRequest(
      req.params.id,
      { accountId: req.user.account_id, name: req.user.name, nim: req.user.nim },
      validated
    );
    if (created.error) return res.status(409).json({ error: created.error });
    if (alumnus.submitter_account_id !== req.user.account_id) {
      createUserNotification(alumnus.submitter_account_id, 'submission', {
        title: 'Permintaan sesi mentorship masuk',
        message: `${req.user.name} meminta sesi ${validated.session_type?.replaceAll('_', ' ')}.`,
        actionView: 'home',
        dedupeKey: `career-mentorship:${created.id}:requested`
      });
    }
    res.status(201).json({ request: created });
  });

  app.get('/api/career/mentorship-requests/mine', requireAuth, (req, res) => {
    const requests = db.listCareerMentorshipRequests(req.user.account_id).map(
      ({ student_account_id, mentor_account_id, ...r }) => ({
        ...r, is_mentor: mentor_account_id === req.user.account_id
      })
    );
    res.json({ requests });
  });

  app.get('/api/admin/career/mentorship-requests', requireClearance(2), (_req, res) => {
    res.json({
      requests: db.listCareerMentorshipRequests().map(
        ({ student_account_id, mentor_account_id, ...r }) => r
      )
    });
  });

  app.put('/api/career/mentorship-requests/:id', requireAuth, (req, res) => {
    const { status, meeting_mode: meetingMode, meeting_url: meetingUrl = '', meeting_location: meetingLocation = '', mentor_note: mentorNote = '' } = req.body || {};
    if (!['confirmed', 'declined', 'completed'].includes(status)
      || typeof mentorNote !== 'string' || mentorNote.length > 1000
      || typeof meetingUrl !== 'string' || meetingUrl.length > 2000
      || typeof meetingLocation !== 'string' || meetingLocation.length > 240) {
      return res.status(400).json({ error: 'Status, catatan, atau detail sesi tidak valid.' });
    }
    const canManageAll = req.user.role === 'superadmin' || req.user.clearance_level >= 2;
    const details = { mentor_note: mentorNote.trim() };
    if (status === 'confirmed') {
      if (!['online', 'offline'].includes(meetingMode)) {
        return res.status(400).json({ error: 'Pilih mode sesi yang dikonfirmasi.' });
      }
      details.meeting_mode = meetingMode;
      if (meetingMode === 'online') {
        try { details.meeting_url = normalizePortalUrl(meetingUrl, 'Tautan sesi', false); }
        catch (e) { return res.status(400).json({ error: e.message }); }
        details.meeting_location = '';
      } else {
        if (!meetingLocation.trim()) return res.status(400).json({ error: 'Lokasi pertemuan wajib diisi.' });
        details.meeting_location = meetingLocation.trim();
        details.meeting_url = '';
      }
    }
    const updated = db.updateCareerMentorshipRequest(req.params.id, req.user.account_id, status, details, canManageAll);
    if (!updated) return res.status(404).json({ error: 'Permintaan tidak ditemukan atau Anda tidak berhak.' });
    const recipientId = updated.student_account_id === req.user.account_id ? null : updated.student_account_id;
    if (recipientId) {
      createUserNotification(recipientId, 'submission', {
        title: `Status sesi mentorship ${status === 'confirmed' ? 'dikonfirmasi' : status === 'declined' ? 'ditolak' : 'selesai'}`,
        message: `${updated.mentor_name} memperbarui sesi ${updated.session_type.replaceAll('_', ' ')}.`,
        actionView: 'home',
        dedupeKey: `career-mentorship:${updated.id}:${status}:${updated.updated_at}`
      });
    }
    auditAdminMutation(req, `career.mentorship.${status}`, 'career_mentorship_request', updated.id, { status });
    res.json({ request: updated });
  });

  // ==========================================================================
  // GITHUB STATS
  // ==========================================================================

  app.get('/api/showcase/:id/github', githubStatsLimiter, async (req, res) => {
    const record = db.getPortalRecord(req.params.id);
    if (!record || record.kind !== 'project' || !record.active || record.review_status !== 'published' || !record.payload.repo_url) {
      return res.status(404).json({ error: 'Statistik repositori tidak tersedia.' });
    }
    let repository;
    try { repository = extractGithubRepository(record.payload.repo_url); }
    catch { return res.status(404).json({ error: 'Proyek ini tidak menggunakan URL GitHub langsung.' }); }
    const cacheKey = `${repository.owner}/${repository.repo}`.toLowerCase();
    const cached = githubStatsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.set('Cache-Control', 'public, max-age=900');
      return res.json(cached.data);
    }
    try {
      const apiRoot = `https://api.github.com/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}`;
      const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'HMIF-UMB-Portfolio' };
      const [repoRes, commitsRes] = await Promise.all([
        fetch(apiRoot, { headers, signal: AbortSignal.timeout(5000) }),
        fetch(`${apiRoot}/commits?per_page=5`, { headers, signal: AbortSignal.timeout(5000) })
      ]);
      if (!repoRes.ok || !commitsRes.ok) {
        const s = repoRes.status === 403 || commitsRes.status === 403 ? 429 : 502;
        return res.status(s).json({ error: s === 429 ? 'Batas akses GitHub tercapai.' : 'Statistik GitHub tidak dapat dimuat.' });
      }
      const [repo, commits] = await Promise.all([repoRes.json(), commitsRes.json()]);
      if (!Array.isArray(commits)) return res.status(502).json({ error: 'Format commit GitHub tidak sesuai.' });
      const data = {
        repository: `${repository.owner}/${repository.repo}`,
        stars: Number(repo.stargazers_count) || 0,
        forks: Number(repo.forks_count) || 0,
        open_issues: Number(repo.open_issues_count) || 0,
        language: typeof repo.language === 'string' ? repo.language : '',
        pushed_at: repo.pushed_at || null,
        commits: commits.slice(0, 5).map((e) => ({
          sha: String(e.sha || '').slice(0, 7),
          message: String(e.commit?.message || '').split('\n')[0].slice(0, 180),
          author: String(e.commit?.author?.name || 'Kontributor').slice(0, 80),
          date: e.commit?.author?.date || null
        }))
      };
      githubStatsCache.set(cacheKey, { data, expiresAt: Date.now() + GITHUB_STATS_CACHE_MS });
      for (const [k, v] of githubStatsCache) if (v.expiresAt <= Date.now()) githubStatsCache.delete(k);
      if (githubStatsCache.size > 500) githubStatsCache.delete(githubStatsCache.keys().next().value);
      res.set('Cache-Control', 'public, max-age=900');
      res.json(data);
    } catch { res.status(502).json({ error: 'GitHub tidak merespons. Statistik dapat dicoba kembali nanti.' }); }
  });

  // ==========================================================================
  // TECH ARTICLES
  // ==========================================================================

  app.get('/api/tech-articles', (_req, res) => {
    res.json({ articles: db.listTechArticles().map(({ id, payload, author_name, created_at }) => ({ id, ...payload, author_name, created_at })) });
  });

  app.get('/api/tech-articles/mine', requireAuth, (req, res) => {
    res.json({ articles: db.listMyTechArticles(req.user.account_id) });
  });

  app.post('/api/tech-articles', requireAuth, (req, res) => {
    let payload;
    try { payload = validateTechArticle(req.body || {}); }
    catch (e) { return res.status(400).json({ error: e.message || 'Artikel tidak valid.' }); }
    const article = db.createTechArticle(req.user.account_id, req.user.name, payload);
    res.status(202).json({ message: 'Artikel dikirim untuk peer review.', article });
  });

  app.put('/api/tech-articles/:id', requireAuth, (req, res) => {
    let payload;
    try { payload = validateTechArticle(req.body || {}); }
    catch (e) { return res.status(400).json({ error: e.message || 'Artikel tidak valid.' }); }
    const article = db.resubmitTechArticle(req.params.id, req.user.account_id, payload);
    if (!article) return res.status(409).json({ error: 'Hanya artikel milik Anda yang diminta revisi dapat dikirim ulang.' });
    res.status(202).json({ message: 'Revisi artikel dikirim.', article });
  });

  app.get('/api/admin/tech-articles/review', requirePortfolioReviewer, (_req, res) => {
    res.json({ articles: db.listPendingTechArticles() });
  });

  app.put('/api/admin/tech-articles/:id/review', requirePortfolioReviewer, (req, res) => {
    const { status, note = '' } = req.body || {};
    if (!['published', 'needs_revision', 'rejected'].includes(status)
      || typeof note !== 'string' || note.length > 1000
      || (status === 'needs_revision' && !note.trim())) {
      return res.status(400).json({ error: 'Status review atau catatan revisi tidak valid.' });
    }
    const article = db.reviewTechArticle(req.params.id, status, note.trim(), req.user.account_id);
    if (!article) return res.status(409).json({ error: 'Artikel tidak lagi menunggu review.' });
    auditAdminMutation(req, `tech_article.${status}`, 'tech_article', article.id, { status });
    createUserNotification(article.author_account_id, 'submission', {
      title: 'Status artikel teknis berubah',
      message: `Artikel "${article.payload.title}" ${status === 'published' ? 'diterbitkan' : status === 'needs_revision' ? 'memerlukan revisi' : 'ditolak'}.${note ? ` Catatan: ${note.trim()}` : ''}`,
      actionView: 'home',
      dedupeKey: `tech-article:${article.id}:${status}:${article.updated_at}`
    });
    res.json({ article });
  });

  // ==========================================================================
  // PROJECT CALLS
  // ==========================================================================

  app.get('/api/project-calls', (_req, res) => {
    res.json({ calls: db.listProjectCalls().map(({ review_note, updated_at, ...call }) => call) });
  });

  app.get('/api/project-calls/mine', requireAuth, (req, res) => {
    res.json({ calls: db.listMyProjectCalls(req.user.account_id), applications: db.listMyProjectCallApplications(req.user.account_id) });
  });

  app.post('/api/project-calls', requireAuth, (req, res) => {
    let payload;
    try {
      payload = validateProjectCall(req.body || {});
      if (payload.deadline < getHmifCalendarDate()) throw new Error('Tenggat open project tidak boleh sudah lewat.');
    } catch (e) { return res.status(400).json({ error: e.message || 'Open project tidak valid.' }); }
    const call = db.createProjectCall(req.user.account_id, req.user.name, payload);
    res.status(202).json({ message: 'Open project dikirim untuk review.', call });
  });

  app.post('/api/project-calls/:id/applications', requireAuth, (req, res) => {
    const call = db.getProjectCall(req.params.id);
    if (!call) return res.status(404).json({ error: 'Open project tidak ditemukan.' });
    let payload;
    try { payload = validateProjectCallApplication(req.body || {}, JSON.parse(call.payload_json).roles); }
    catch (e) { return res.status(400).json({ error: e.message || 'Lamaran tidak valid.' }); }
    const application = db.createProjectCallApplication(call.id, req.user.account_id, req.user.name, payload);
    if (application.error) return res.status(409).json({ error: application.error });
    createUserNotification(call.owner_account_id, 'submission', {
      title: 'Anggota tertarik bergabung ke tim',
      message: `${req.user.name} melamar sebagai ${payload.role} untuk ${JSON.parse(call.payload_json).title}.`,
      actionView: 'home',
      dedupeKey: `project-call:application:${application.id}`
    });
    res.status(201).json({ application });
  });

  app.get('/api/project-calls/:id/applications', requireAuth, (req, res) => {
    const call = db.getProjectCall(req.params.id);
    if (!call) return res.status(404).json({ error: 'Open project tidak ditemukan.' });
    if (call.owner_account_id !== req.user.account_id && !isPortfolioReviewer(req.user)) {
      return res.status(403).json({ error: 'Hanya pemilik open project atau reviewer yang dapat melihat lamaran.' });
    }
    res.json({ applications: db.listProjectCallApplications(call.id) });
  });

  app.put('/api/project-calls/:id/applications/:applicationId', requireAuth, (req, res) => {
    const status = req.body?.status;
    if (!['accepted', 'declined'].includes(status)) return res.status(400).json({ error: 'Status lamaran tidak valid.' });
    const application = db.updateProjectCallApplication(req.params.applicationId, req.params.id, req.user.account_id, status);
    if (!application) return res.status(404).json({ error: 'Lamaran tidak ditemukan atau sudah diproses.' });
    const { applicant_account_id: applicantAccountId, ...safeApplication } = application;
    createUserNotification(applicantAccountId, 'submission', {
      title: `Status minat tim ${status === 'accepted' ? 'diterima' : 'diperbarui'}`,
      message: `Pemilik proyek telah ${status === 'accepted' ? 'menerima' : 'menolak'} minat Anda sebagai ${application.role}.`,
      actionView: 'home',
      dedupeKey: `project-call:application:${application.id}:${status}`
    });
    res.json({ application: safeApplication });
  });

  app.put('/api/project-calls/:id/close', requireAuth, (req, res) => {
    const call = db.closeProjectCall(req.params.id, req.user.account_id);
    if (!call) return res.status(409).json({ error: 'Hanya open project aktif milik Anda yang dapat ditutup.' });
    res.json({ call });
  });

  app.get('/api/admin/project-calls/review', requirePortfolioReviewer, (_req, res) => {
    res.json({ calls: db.listPendingProjectCalls() });
  });

  app.put('/api/admin/project-calls/:id/review', requirePortfolioReviewer, (req, res) => {
    const { status, note = '' } = req.body || {};
    if (!['published', 'rejected'].includes(status) || typeof note !== 'string' || note.length > 1000) {
      return res.status(400).json({ error: 'Keputusan review open project tidak valid.' });
    }
    const call = db.reviewProjectCall(req.params.id, status, note.trim(), req.user.account_id);
    if (!call) return res.status(409).json({ error: 'Open project tidak lagi menunggu review.' });
    auditAdminMutation(req, `project_call.${status}`, 'project_call', call.id, { status });
    createUserNotification(call.owner_account_id, 'submission', {
      title: 'Status open project berubah',
      message: `Open project "${call.title}" ${status === 'published' ? 'dipublikasikan' : 'ditolak'}.${note ? ` Catatan: ${note.trim()}` : ''}`,
      actionView: 'home',
      dedupeKey: `project-call:${call.id}:${status}:${call.updated_at}`
    });
    res.json({ call });
  });

  // ==========================================================================
  // PORTAL RECORDS (Project, Alumni, Job)
  // ==========================================================================

  app.get('/api/portal-records/mine', requireAuth, (req, res) => {
    res.json({ records: db.listMyPortalRecords(req.user.account_id) });
  });

  app.post('/api/portal-records/:kind', requireAuth, (req, res) => {
    let payload;
    try {
      validatePortalConsent(req.params.kind, req.body || {});
      payload = validatePortalRecord(req.params.kind, req.body || {});
    } catch (e) { return res.status(400).json({ error: e.message || 'Pengajuan konten tidak valid.' }); }
    const record = db.createPortalRecord(req.params.kind, payload, req.user.nim, {
      submitterAccountId: req.user.account_id,
      consentAt: req.params.kind === 'alumni' ? new Date().toISOString() : null
    });
    res.status(202).json({ message: 'Pengajuan diterima dan menunggu review.', record });
  });

  app.put('/api/portal-records/:kind/:id', requireAuth, (req, res) => {
    const existing = db.getPortalRecord(req.params.id);
    if (!existing || existing.kind !== req.params.kind || existing.submitter_account_id !== req.user.account_id) {
      return res.status(404).json({ error: 'Pengajuan konten tidak ditemukan.' });
    }
    if (existing.review_status !== 'needs_revision') {
      return res.status(409).json({ error: 'Pengajuan hanya dapat diperbarui setelah diminta revisi.' });
    }
    let payload;
    try {
      validatePortalConsent(req.params.kind, req.body || {});
      payload = validatePortalRecord(req.params.kind, req.body || {});
    } catch (e) { return res.status(400).json({ error: e.message || 'Pengajuan konten tidak valid.' }); }
    const record = db.resubmitPortalRecord(
      existing.id, req.user.account_id, req.user.nim, payload,
      req.params.kind === 'alumni' ? new Date().toISOString() : null
    );
    if (!record) return res.status(409).json({ error: 'Status pengajuan berubah. Muat ulang daftar pengajuan.' });
    res.status(202).json({ message: 'Revisi dikirim ulang dan menunggu review.', record });
  });

  app.get('/api/admin/portal-records/:kind', requireSuperadmin, (req, res) => {
    if (!['project', 'alumni', 'job'].includes(req.params.kind)) {
      return res.status(404).json({ error: 'Jenis konten portal tidak ditemukan.' });
    }
    const records = db.listPortalRecords(req.params.kind, true).map((record) => ({
      ...record, history: db.listPortalRecordHistory(record.id)
    }));
    res.json({ records });
  });

  app.post('/api/admin/portal-records/:kind', requireSuperadmin, (req, res) => {
    let payload;
    try {
      validatePortalConsent(req.params.kind, req.body || {});
      payload = validatePortalRecord(req.params.kind, req.body || {});
    } catch (e) { res.status(400).json({ error: e.message || 'Konten portal tidak valid.' }); return; }
    const record = db.createPortalRecord(req.params.kind, payload, req.user.nim, {
      consentAt: req.params.kind === 'alumni' ? new Date().toISOString() : null,
      actorAccountId: req.user.account_id
    });
    auditAdminMutation(req, 'portal_record.create', `portal_${req.params.kind}`, record.id, {});
    res.status(201).json({ record });
  });

  app.put('/api/admin/portal-records/:kind/:id/review', requireSuperadmin, (req, res) => {
    const existing = db.getPortalRecord(req.params.id);
    if (!existing || existing.kind !== req.params.kind) {
      return res.status(404).json({ error: 'Konten portal tidak ditemukan.' });
    }
    const { action, note = '' } = req.body || {};
    if (!['needs_revision', 'reject', 'approve', 'publish', 'archive'].includes(action)
      || typeof note !== 'string' || note.length > 1000
      || (action === 'needs_revision' && !note.trim())) {
      return res.status(400).json({ error: 'Keputusan review atau catatan revisi tidak valid.' });
    }
    if (action === 'publish' && existing.kind === 'alumni' && !existing.consent_at) {
      return res.status(409).json({ error: 'Profil alumni tidak dapat dipublikasikan tanpa persetujuan yang tercatat.' });
    }
    const record = db.reviewPortalRecord(existing.id, action, req.user.account_id, req.user.nim, note.trim());
    if (!record) return res.status(409).json({ error: 'Perubahan status tidak sesuai alur review saat ini.' });
    auditAdminMutation(req, `portal_record.${action}`, `portal_${existing.kind}`, record.id, {
      from: existing.review_status, to: record.review_status
    });
    const reviewStatusLabels = {
      needs_revision: 'memerlukan revisi', rejected: 'ditolak',
      approved: 'disetujui', published: 'telah dipublikasikan', archived: 'diarsipkan'
    };
    createUserNotification(existing.submitter_account_id, 'submission', {
      title: 'Status pengajuan konten berubah',
      message: `Pengajuan ${existing.kind} Anda ${reviewStatusLabels[record.review_status]}.`,
      actionView: 'home',
      dedupeKey: `submission:${record.id}:${record.review_status}:${record.updated_at}`
    });
    res.json({ record });
  });

  app.put('/api/admin/portal-records/:kind/:id', requireSuperadmin, (req, res) => {
    const existing = db.getPortalRecord(req.params.id);
    if (!existing || existing.kind !== req.params.kind) {
      return res.status(404).json({ error: 'Konten portal tidak ditemukan.' });
    }
    const { active } = req.body || {};
    if (active !== undefined && typeof active !== 'boolean') {
      return res.status(400).json({ error: 'Status publikasi harus berupa boolean.' });
    }
    if (active === true && existing.review_status !== 'published') {
      return res.status(409).json({ error: 'Konten harus melalui persetujuan review sebelum ditayangkan.' });
    }
    let payload = existing.payload;
    try {
      if (req.body?.payload !== undefined) payload = validatePortalRecord(existing.kind, req.body.payload);
    } catch (e) { res.status(400).json({ error: e.message || 'Konten portal tidak valid.' }); return; }
    const record = db.updatePortalRecord(existing.id, payload, active === undefined ? existing.active : active);
    auditAdminMutation(req, 'portal_record.update', `portal_${existing.kind}`, existing.id, {
      active: record.active, payload_updated: req.body?.payload !== undefined
    });
    res.json({ record });
  });

  app.delete('/api/admin/portal-records/:kind/:id', requireSuperadmin, (req, res) => {
    const record = db.getPortalRecord(req.params.id);
    if (!record || record.kind !== req.params.kind) {
      return res.status(404).json({ error: 'Konten portal tidak ditemukan.' });
    }
    if (!db.deletePortalRecord(record.id)) return res.status(500).json({ error: 'Konten portal tidak dapat dihapus.' });
    auditAdminMutation(req, 'portal_record.delete', `portal_${record.kind}`, record.id, {});
    res.json({ message: 'KONTEN PORTAL DIHAPUS' });
  });

  // ==========================================================================
  // INVENTORY
  // ==========================================================================

  app.get('/api/inventory/assets', (_req, res) => {
    res.json({ assets: db.listInventoryAssets() });
  });

  app.post('/api/admin/inventory/assets', requireClearance(2), (req, res) => {
    const { asset_tag: assetTag, name, category, description = '', location = '' } = req.body || {};
    if (typeof assetTag !== 'string' || !/^[A-Za-z0-9_-]{3,40}$/.test(assetTag)
      || typeof name !== 'string' || !name.trim() || name.length > 120
      || typeof category !== 'string' || !category.trim() || category.length > 80
      || typeof description !== 'string' || description.length > 500
      || typeof location !== 'string' || location.length > 160) {
      return res.status(400).json({ error: 'Kode, nama, kategori, deskripsi, atau lokasi aset tidak valid.' });
    }
    const asset = db.createInventoryAsset({
      assetTag, name: name.trim(), category: category.trim(),
      description: description.trim(), location: location.trim(),
      createdBy: req.user.account_id
    });
    if (asset.error) return res.status(409).json({ error: asset.error });
    auditAdminMutation(req, 'inventory.asset_create', 'inventory_asset', asset.id, { assetTag, category });
    res.status(201).json({ asset });
  });

  app.get('/api/inventory/loans/mine', requireAuth, (req, res) => {
    res.json({ loans: db.getMyInventoryLoans(req.user.account_id) });
  });

  app.post('/api/inventory/loans', requireAuth, (req, res) => {
    const { asset_id: assetId, purpose, due_at: dueAt } = req.body || {};
    const dueTimestamp = typeof dueAt === 'string' ? Date.parse(dueAt) : NaN;
    if (typeof assetId !== 'string' || typeof purpose !== 'string' || purpose.trim().length < 5 || purpose.length > 1000
      || Number.isNaN(dueTimestamp) || dueTimestamp <= Date.now() || dueTimestamp > Date.now() + 30 * 24 * 60 * 60 * 1000) {
      return res.status(400).json({ error: 'Aset, tujuan peminjaman, dan tenggat valid (maksimal 30 hari) wajib diisi.' });
    }
    const loan = db.requestInventoryLoan({
      assetId, accountId: req.user.account_id, borrowerName: req.user.name,
      purpose: purpose.trim(), dueAt: new Date(dueTimestamp).toISOString()
    });
    if (loan.error) return res.status(409).json({ error: loan.error });
    res.status(201).json({ loan });
  });

  app.get('/api/admin/inventory/loans', requireClearance(2), (_req, res) => {
    res.json({ loans: db.listInventoryLoans() });
  });

  app.put('/api/admin/inventory/loans/:id/status', requireClearance(2), (req, res) => {
    const { status, condition_note: conditionNote = '' } = req.body || {};
    if (!['Disetujui', 'Dipinjam', 'Dikembalikan', 'Ditolak', 'Rusak', 'Hilang'].includes(status)
      || typeof conditionNote !== 'string' || conditionNote.length > 500
      || (['Ditolak', 'Dikembalikan', 'Rusak', 'Hilang'].includes(status) && !conditionNote.trim())) {
      return res.status(400).json({ error: 'Status tidak valid. Penolakan dan penyelesaian pinjaman wajib disertai catatan.' });
    }
    const loan = db.updateInventoryLoan(req.params.id, status, req.user.account_id, conditionNote.trim());
    if (!loan) return res.status(409).json({ error: 'Status peminjaman tidak dapat diubah dari tahap saat ini.' });
    auditAdminMutation(req, 'inventory.loan_status', 'inventory_loan', loan.id, { status, conditionNote: conditionNote.trim() });
    res.json({ loan });
  });

  // ==========================================================================
  // KNOWLEDGE FILE SERVE
  // ==========================================================================

  app.get('/api/knowledge/files/:id', (req, res) => {
    const file = db.getKnowledgeFile(req.params.id);
    if (!file) return res.status(404).end();
    const published = db.getSiteState().published.content.data.knowledgeResources.some(
      (resource) => resource.fileId === file.id && resource.published !== false
    ) || db.getPublicAcademicRecords('resource').some((resource) => resource.file_id === file.id);
    if (!published && req.user?.role !== 'superadmin') return res.status(404).end();
    const filePath = path.resolve(KNOWLEDGE_DIR, file.stored_name);
    if (!filePath.startsWith(`${KNOWLEDGE_DIR}${path.sep}`) || !fs.existsSync(filePath)) return res.status(404).end();
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Length': String(file.size),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': published ? 'public, max-age=31536000, immutable' : 'private, no-store',
      'Content-Disposition': `attachment; filename="materi-${file.id}.pdf"`
    });
    res.sendFile(filePath);
  });

  // ==========================================================================
  // CADETS MANAGEMENT
  // ==========================================================================

  app.get('/api/cadets', requireClearance(2), (_req, res) => {
    res.json(db.getAllCadets());
  });

  app.put('/api/cadets/:nim/stage', requireClearance(3), (req, res) => {
    const { stage } = req.body;
    if (typeof stage !== 'string' || !stage.trim()) {
      return res.status(400).json({ error: 'Jenjang kaderisasi wajib diisi.' });
    }
    const updated = db.updateCadetStage(req.params.nim, stage.trim());
    if (!updated) return res.status(404).json({ error: 'Kader tidak ditemukan.' });
    auditAdminMutation(req, 'cadet.stage_update', 'user', updated.nim, { membership_stage: updated.membership_stage });
    res.json({ message: `JENJANG KADERISASI DIPERBARUI // STATUS: ${stage}`, cadet: updated });
  });

  app.post('/api/cadet/quiz-eval', requireAuth, (req, res) => {
    const { score } = req.body;
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      return res.status(400).json({ error: 'Nilai evaluasi harus antara 0 dan 100.' });
    }
    const saved = db.saveQuizEvaluation({
      account_id: req.user.account_id, nim: req.user.nim, score,
      rank_title: score >= 80 ? 'KADER MADYA' : score >= 60 ? 'KADER PRATAMA' : 'KADER MUDA',
      clearance_awarded: 0
    });
    res.json({ message: 'HASIL EVALUASI TERSIMPAN // SERTIFIKASI DIGITAL DITERBITKAN', evaluation: saved });
  });

  app.get('/api/cadets/:nim/kta', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Silakan masuk untuk melihat KTA.' });
    if (req.user.nim !== req.params.nim && req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'KTA hanya dapat dilihat pemilik atau administrator.' });
    }
    const user = db.findUserByNIM(req.params.nim);
    if (!user) return res.status(404).json({ error: 'Kader tidak ditemukan dalam database PRTS.' });
    const { password_hash, ...sanitized } = user;
    const qrPayload = JSON.stringify({
      nim: sanitized.nim, name: sanitized.name, division: sanitized.division,
      membership_stage: sanitized.membership_stage, clearance_level: sanitized.clearance_level,
      role_title: sanitized.role_title, code_name: sanitized.code_name,
      verified_at: new Date().toISOString(), issuer: 'PRTS-HMIF-UMB-CORE'
    });
    const evaluations = db.getCadetEvaluationsByAccountId(sanitized.account_id);
    const attendance = db.getCadetAttendanceByAccountId(sanitized.account_id);
    res.json({
      kta: {
        ...sanitized,
        kta_number: `KTA-HMIF-${sanitized.nim}-${sanitized.generation}`,
        qr_payload: qrPayload,
        issued_at: sanitized.created_at,
        valid_until: `${parseInt(sanitized.generation) + 4}-08-31`,
        evaluations, attendance_count: attendance.length
      }
    });
  });

  // ==========================================================================
  // ORGANIZATION TASKS
  // ==========================================================================

  app.get('/api/tasks', requireClearance(2), (_req, res) => {
    res.json({ tasks: db.listOrganizationTasks() });
  });

  app.get('/api/task-assignees', requireClearance(2), (_req, res) => {
    const users = db.read().users
      .filter((user) => user.role !== 'superadmin')
      .map(({ account_id, name, nim, division, clearance_level }) => ({ account_id, name, nim, division, clearance_level }));
    res.json({ users });
  });

  app.post('/api/tasks', requireClearance(2), (req, res) => {
    let task;
    try {
      task = validateOrganizationTask({
        ...req.body,
        description: req.body?.description ?? '',
        status: req.body?.status ?? 'todo',
        proker_id: req.body?.proker_id ?? null,
        due_date: req.body?.due_date ?? null
      });
    } catch (e) { return res.status(400).json({ error: e.message || 'Tugas tidak valid.' }); }
    const created = db.createOrganizationTask(task, req.user.nim);
    auditAdminMutation(req, 'task.create', 'organization_task', created.id, { status: created.status, prokerId: created.proker_id });
    if (created.pic_account_id && created.pic_account_id !== req.user.account_id) {
      createUserNotification(created.pic_account_id, 'task', {
        title: 'Anda mendapat tugas organisasi',
        message: `${created.title}${created.due_date ? ` — tenggat ${created.due_date}` : ''}.`,
        actionView: 'operations',
        dedupeKey: `task:assigned:${created.id}`
      });
    }
    res.status(201).json({ task: created });
  });

  app.put('/api/tasks/:id', requireClearance(2), (req, res) => {
    const existing = db.getOrganizationTask(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Tugas tidak ditemukan.' });
    let updates;
    try { updates = validateOrganizationTask(req.body || {}, existing); }
    catch (e) { return res.status(400).json({ error: e.message || 'Perubahan tugas tidak valid.' }); }
    const updated = db.updateOrganizationTask(existing.id, updates, req.user.nim);
    auditAdminMutation(req, 'task.update', 'organization_task', updated.id, { status: updated.status });
    if (existing.status !== updated.status) {
      const recipients = new Set([existing.pic_account_id]);
      recipients.add(db.findUserByNIM(existing.created_by)?.account_id);
      recipients.delete(null); recipients.delete(undefined); recipients.delete(req.user.account_id);
      for (const recipientAccountId of recipients) {
        createUserNotification(recipientAccountId, 'task', {
          title: 'Status tugas diperbarui',
          message: `${updated.title} berubah ke status ${updated.status}.`,
          actionView: 'operations',
          dedupeKey: `task:status:${updated.id}:${updated.updated_at}`
        });
      }
    }
    res.json({ task: updated });
  });

  // ==========================================================================
  // OFFICE LETTERS
  // ==========================================================================

  app.get('/api/office/letters', requireClearance(2), (req, res) => {
    const filters = {
      query: String(req.query.query || ''),
      division: String(req.query.division || ''),
      dateFrom: String(req.query.date_from || ''),
      dateTo: String(req.query.date_to || '')
    };
    res.json({ letters: db.listOfficeLetters(filters) });
  });

  app.post('/api/office/letters', requireClearance(2), (req, res) => {
    try {
      const draft = validateOfficeLetter({ ...req.body, tags: req.body?.tags || '' });
      const year = new Date().getFullYear();
      const serial = (db.sqlite.prepare('SELECT COUNT(*) AS count FROM office_letters WHERE type = ?').get(draft.type).count || 0) + 1;
      const letter = db.createOfficeLetter(
        { ...draft, letter_number: generateOfficeLetterNumber(draft.type, year, serial) },
        req.user
      );
      res.status(201).json({ message: 'Draft surat berhasil dibuat.', letter });
    } catch (e) { return res.status(400).json({ error: e.message || 'Draft surat tidak valid.' }); }
  });

  app.put('/api/office/letters/:id/approve', requireClearance(2), (req, res) => {
    const step = String(req.body?.step || '').trim();
    const approved = Boolean(req.body?.approved);
    const note = String(req.body?.note || '').trim();
    if (!step) return res.status(400).json({ error: 'Tahap persetujuan wajib dipilih.' });
    const result = db.approveOfficeLetter(req.params.id, step, approved, note, req.user);
    if (result?.error) return res.status(400).json({ error: result.error });
    res.json({ message: approved ? 'Persetujuan tersimpan.' : 'Persetujuan ditolak.', letter: result });
  });

  // ==========================================================================
  // USER MANAGEMENT
  // ==========================================================================

  app.get('/api/admin/users', requireClearance(4), (_req, res) => {
    const users = db.getAllCadets();
    res.json({ total: users.length, users });
  });

  app.post('/api/admin/users', requireClearance(4), async (req, res) => {
    const { nim, name, password, generation, division } = req.body;
    if (typeof nim !== 'string' || !/^[a-zA-Z0-9._-]{3,32}$/.test(nim)
      || typeof name !== 'string' || !name.trim() || name.length > 120
      || typeof password !== 'string' || password.length < 12 || password.length > 256
      || (generation !== undefined && generation !== '' && (typeof generation !== 'string' || !/^\d{4}$/.test(generation)))
      || (division !== undefined && (typeof division !== 'string' || division.length > 80))) {
      return res.status(400).json({ error: 'NIM, nama, password minimal 12 karakter, atau data anggota tidak valid.' });
    }
    const user = await db.createUser({
      nim, name: name.trim(), password, generation, division,
      membership_stage: 'Calon Kader', role_title: 'Kader Pratama', clearance_level: 1
    });
    if (user.error) return res.status(409).json({ error: user.error });
    db.insertAudit({ actorNim: req.user.nim, actorRole: req.user.role, action: 'user.create', targetType: 'user', targetId: user.nim, details: { role: user.role, clearance_level: user.clearance_level } });
    res.status(201).json({ message: 'Akun anggota dibuat dengan clearance level 1.', user });
  });

  app.put('/api/admin/users/:nim', requireClearance(4), (req, res) => {
    const { clearance_level, role_title, division, membership_stage, code_name } = req.body;
    const target = db.findUserByNIM(req.params.nim);
    if (!target) return res.status(404).json({ error: 'User tidak ditemukan.' });
    if (clearance_level !== undefined && (!Number.isInteger(clearance_level) || clearance_level < 1 || clearance_level > 3)) {
      return res.status(400).json({ error: 'Clearance anggota harus berupa bilangan bulat dari 1 sampai 3; gunakan role khusus untuk superadmin.' });
    }
    if (target.role === 'superadmin' && clearance_level !== undefined) {
      return res.status(400).json({ error: 'Clearance superadmin tidak dapat diubah sebagai angka.' });
    }
    for (const value of [role_title, division, membership_stage, code_name]) {
      if (value !== undefined && (typeof value !== 'string' || value.length > 120)) {
        return res.status(400).json({ error: 'Kolom profil harus berupa teks maksimal 120 karakter.' });
      }
    }
    const updated = db.updateUserAdmin(req.params.nim, { clearance_level, role_title, division, membership_stage, code_name }, req.user);
    if (!updated) return res.status(404).json({ error: 'User tidak ditemukan.' });
    res.json({ message: `PROFIL USER DIPERBARUI OLEH ADMIN // ${req.params.nim}`, user: updated });
  });

  app.put('/api/admin/users/:nim/academic-curator', requireSuperadmin, (req, res) => {
    if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({ error: 'Status kurator akademik harus boolean.' });
    const target = db.findUserByNIM(req.params.nim);
    if (!target) return res.status(404).json({ error: 'User tidak ditemukan.' });
    if (target.role === 'superadmin') return res.status(400).json({ error: 'Superadmin tidak memerlukan capability kurator akademik.' });
    const user = db.setAcademicCuratorPermission(req.params.nim, req.body.enabled, req.user);
    if (!user) return res.status(500).json({ error: 'Izin kurator akademik tidak dapat diperbarui.' });
    res.json({ message: 'CAPABILITY KURATOR AKADEMIK DIPERBARUI', user });
  });

  app.put('/api/admin/users/:nim/role', requireSuperadmin, (req, res) => {
    const { role } = req.body;
    if (!['member', 'superadmin'].includes(role)) return res.status(400).json({ error: 'Role tidak valid.' });
    const target = db.findUserByNIM(req.params.nim);
    if (!target) return res.status(404).json({ error: 'User tidak ditemukan.' });
    if (target.nim === req.user.nim && role !== 'superadmin') {
      return res.status(400).json({ error: 'Superadmin aktif tidak dapat menurunkan rolenya sendiri.' });
    }
    if (target.role === 'superadmin' && role !== 'superadmin' && db.getAdminCount() <= 1) {
      return res.status(409).json({ error: 'Setidaknya satu superadmin harus tetap aktif.' });
    }
    const updated = db.updateUserRole(req.params.nim, role, req.user);
    if (!updated) return res.status(500).json({ error: 'Role tidak dapat diperbarui.' });
    res.json({ message: 'ROLE DIPERBARUI', user: updated });
  });

  app.delete('/api/admin/users/:nim', requireClearance(4), (req, res) => {
    if (req.user.nim === req.params.nim) {
      return res.status(400).json({ error: 'Tidak dapat menghapus akun sendiri.' });
    }
    const target = db.findUserByNIM(req.params.nim);
    if (target && db.isAccountLinkedToSite(target.account_id)) {
      return res.status(409).json({ error: 'Akun masih tertaut pada profil angkatan. Lepas atau ganti relasi di Site Studio sebelum menghapus akun.' });
    }
    if (target?.role === 'superadmin' && db.getAdminCount() <= 1) {
      return res.status(409).json({ error: 'Setidaknya satu akun administrator harus tetap aktif.' });
    }
    const deleted = db.deleteUser(req.params.nim);
    if (!deleted) return res.status(404).json({ error: 'User tidak ditemukan.' });
    auditAdminMutation(req, 'user.delete', 'user', req.params.nim, {});
    res.json({ message: `USER ${req.params.nim} DIHAPUS DARI DATABASE PRTS`, nim: req.params.nim });
  });

  // ==========================================================================
  // AUDIT, BACKUP, STATS
  // ==========================================================================

  app.get('/api/admin/audit', requireSuperadmin, (req, res) => {
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 100, 500));
    res.json({ entries: db.listAudit(limit) });
  });

  app.get('/api/admin/backup', requireClearance(4), (req, res) => {
    const backup = db.getFullBackup();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="prts_backup_${timestamp}.json"`);
    res.json({
      backup_info: { generated_at: new Date().toISOString(), generated_by: req.user.name, system: 'PRTS HMIF UMB v4.2.0' },
      data: backup
    });
  });

  app.get('/api/admin/stats', requireClearance(4), (_req, res) => {
    res.json(db.getSystemStats());
  });
}
