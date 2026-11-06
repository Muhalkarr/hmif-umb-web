import { randomUUID } from 'node:crypto';

/**
 * SQLite operations for Portal Records (Showcase, Career/Alumni),
 * Mentorship Requests, Tech Articles, and Project Calls (Open Call/Projects).
 */
export const createPortalSqlRepository = ({ sqlite, getHmifCalendarDate }) => {
  const repo = {
    // ─── PORTAL RECORDS (Showcase, Career/Alumni) ───────────────────────────
    listPortalRecords(kind, includeInactive = false) {
      const where = includeInactive
        ? 'WHERE kind = ?'
        : "WHERE kind = ? AND active = 1 AND review_status = 'published'";
      return sqlite.prepare(`SELECT id, kind, payload_json, active, created_by, submitter_account_id,
          review_status, review_note, reviewer_nim, reviewed_at, consent_at, created_at, updated_at
        FROM portal_records ${where} ORDER BY created_at DESC, id`).all(kind)
        .map((record) => ({ ...record, payload: JSON.parse(record.payload_json), active: Boolean(record.active) }));
    },

    getPortalRecord(id) {
      const record = sqlite.prepare(`SELECT id, kind, payload_json, active, created_by, submitter_account_id,
        review_status, review_note, reviewer_nim, reviewed_at, consent_at, created_at, updated_at
        FROM portal_records WHERE id = ?`).get(id);
      return record ? { ...record, payload: JSON.parse(record.payload_json), active: Boolean(record.active) } : null;
    },

    createPortalRecord(kind, payload, createdBy, {
      submitterAccountId = null,
      consentAt = null,
      reviewStatus = 'pending_review',
      actorAccountId = submitterAccountId,
      action = 'submitted'
    } = {}) {
      const timestamp = new Date().toISOString();
      const record = {
        id: randomUUID(), kind, payload, active: 0, created_by: createdBy,
        submitter_account_id: submitterAccountId, review_status: reviewStatus, review_note: '',
        reviewer_nim: null, reviewed_at: null, consent_at: consentAt,
        created_at: timestamp, updated_at: timestamp
      };
      const transaction = sqlite.transaction(() => {
        sqlite.prepare(`INSERT INTO portal_records
          (id, kind, payload_json, active, created_by, submitter_account_id, review_status, review_note,
            reviewer_nim, reviewed_at, consent_at, created_at, updated_at)
          VALUES (@id, @kind, @payload_json, @active, @created_by, @submitter_account_id, @review_status, @review_note,
            @reviewer_nim, @reviewed_at, @consent_at, @created_at, @updated_at)`).run({
          ...record,
          payload_json: JSON.stringify(payload)
        });
        repo.insertPortalRecordHistory(record.id, actorAccountId, createdBy, action, null, reviewStatus, '');
      });
      transaction.immediate();
      return record;
    },

    updatePortalRecord(id, payload, active) {
      const existing = repo.getPortalRecord(id);
      if (!existing) return null;
      sqlite.prepare('UPDATE portal_records SET payload_json = ?, active = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(payload), active ? 1 : 0, new Date().toISOString(), id);
      return repo.getPortalRecord(id);
    },

    resubmitPortalRecord(id, accountId, actorNim, payload, consentAt = null) {
      const timestamp = new Date().toISOString();
      const transaction = sqlite.transaction(() => {
        const record = repo.getPortalRecord(id);
        if (!record || record.submitter_account_id !== accountId || record.review_status !== 'needs_revision') return null;
        sqlite.prepare(`UPDATE portal_records SET payload_json = ?, active = 0, review_status = 'pending_review',
          review_note = '', reviewer_nim = NULL, reviewed_at = NULL, consent_at = COALESCE(?, consent_at), updated_at = ?
          WHERE id = ?`).run(JSON.stringify(payload), consentAt, timestamp, id);
        repo.insertPortalRecordHistory(id, accountId, actorNim, 'resubmitted', 'needs_revision', 'pending_review', '');
        return repo.getPortalRecord(id);
      });
      return transaction.immediate();
    },

    reviewPortalRecord(id, action, actorAccountId, actorNim, note = '') {
      const transitions = {
        needs_revision: { from: ['pending_review'], to: 'needs_revision', active: 0 },
        reject: { from: ['pending_review'], to: 'rejected', active: 0 },
        approve: { from: ['pending_review'], to: 'approved', active: 0 },
        publish: { from: ['approved'], to: 'published', active: 1 },
        archive: { from: ['published'], to: 'archived', active: 0 }
      };
      const transition = transitions[action];
      if (!transition) return null;
      const transaction = sqlite.transaction(() => {
        const existing = repo.getPortalRecord(id);
        if (!existing || !transition.from.includes(existing.review_status)) return null;
        const timestamp = new Date().toISOString();
        sqlite.prepare(`UPDATE portal_records SET active = ?, review_status = ?, review_note = ?,
          reviewer_nim = ?, reviewed_at = ?, updated_at = ? WHERE id = ?`)
          .run(transition.active, transition.to, note, actorNim, timestamp, timestamp, id);
        repo.insertPortalRecordHistory(id, actorAccountId, actorNim, action, existing.review_status, transition.to, note);
        return repo.getPortalRecord(id);
      });
      return transaction.immediate();
    },

    listMyPortalRecords(accountId) {
      return sqlite.prepare(`SELECT id, kind, payload_json, active, created_by, submitter_account_id,
          review_status, review_note, reviewer_nim, reviewed_at, consent_at, created_at, updated_at
        FROM portal_records WHERE submitter_account_id = ? ORDER BY updated_at DESC, id`).all(accountId)
        .map((record) => ({ ...record, payload: JSON.parse(record.payload_json), active: Boolean(record.active) }));
    },

    listPortalRecordHistory(recordId) {
      return sqlite.prepare(`SELECT id, actor_nim, action, from_status, to_status, note, created_at
        FROM portal_record_history WHERE record_id = ? ORDER BY created_at DESC, id DESC`).all(recordId);
    },

    insertPortalRecordHistory(recordId, actorAccountId, actorNim, action, fromStatus, toStatus, note) {
      sqlite.prepare(`INSERT INTO portal_record_history
        (id, record_id, actor_account_id, actor_nim, action, from_status, to_status, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        randomUUID(), recordId, actorAccountId, actorNim, action, fromStatus, toStatus, note, new Date().toISOString()
      );
    },

    deletePortalRecord(id) {
      return sqlite.prepare('DELETE FROM portal_records WHERE id = ?').run(id).changes > 0;
    },

    // ─── CAREER MENTORSHIP REQUESTS ─────────────────────────────────────────
    createCareerMentorshipRequest(alumniRecordId, student, request) {
      const alumni = repo.getPortalRecord(alumniRecordId);
      if (!alumni || alumni.kind !== 'alumni' || !alumni.active || alumni.review_status !== 'published'
        || !alumni.payload.mentorship_available) return { error: 'Alumni ini belum membuka layanan mentorship.' };
      if (alumni.submitter_account_id === student.accountId) return { error: 'Anda tidak dapat meminta sesi mentorship kepada diri sendiri.' };
      const timestamp = new Date().toISOString();
      const record = {
        id: randomUUID(),
        alumni_record_id: alumni.id,
        mentor_account_id: alumni.submitter_account_id,
        mentor_name: alumni.payload.name,
        student_account_id: student.accountId,
        student_name: student.name,
        session_type: request.session_type,
        topic: request.topic,
        preferred_at: request.preferred_at,
        preferred_mode: request.preferred_mode,
        duration_minutes: request.duration_minutes,
        status: 'requested',
        meeting_mode: null,
        meeting_url: '',
        meeting_location: '',
        mentor_note: '',
        confirmed_at: null,
        created_at: timestamp,
        updated_at: timestamp
      };
      sqlite.prepare(`INSERT INTO career_mentorship_requests
        (id, alumni_record_id, mentor_account_id, mentor_name, student_account_id, student_name, session_type, topic, preferred_at,
          preferred_mode, duration_minutes, status, meeting_mode, meeting_url, meeting_location, mentor_note, confirmed_at, created_at, updated_at)
        VALUES (@id, @alumni_record_id, @mentor_account_id, @mentor_name, @student_account_id, @student_name, @session_type, @topic, @preferred_at,
          @preferred_mode, @duration_minutes, @status, @meeting_mode, @meeting_url, @meeting_location, @mentor_note, @confirmed_at, @created_at, @updated_at)`)
        .run(record);
      return record;
    },

    listCareerMentorshipRequests(accountId = null) {
      const rows = accountId
        ? sqlite.prepare(`SELECT * FROM career_mentorship_requests
            WHERE student_account_id = ? OR mentor_account_id = ? ORDER BY preferred_at ASC, created_at DESC`).all(accountId, accountId)
        : sqlite.prepare('SELECT * FROM career_mentorship_requests ORDER BY CASE status WHEN \'requested\' THEN 0 ELSE 1 END, preferred_at ASC').all();
      return rows;
    },

    getCareerMentorshipRequest(id) {
      return sqlite.prepare('SELECT * FROM career_mentorship_requests WHERE id = ?').get(id) || null;
    },

    updateCareerMentorshipRequest(id, actorAccountId, status, details = {}, canManageAll = false) {
      const update = sqlite.transaction(() => {
        const existing = repo.getCareerMentorshipRequest(id);
        if (!existing || (!canManageAll && existing.mentor_account_id !== actorAccountId)) return null;
        const transitions = {
          confirmed: ['requested'],
          declined: ['requested'],
          completed: ['confirmed']
        };
        if (!transitions[status]?.includes(existing.status)) return null;
        const timestamp = new Date().toISOString();
        sqlite.prepare(`UPDATE career_mentorship_requests SET status = ?, meeting_mode = ?, meeting_url = ?, meeting_location = ?,
          mentor_note = ?, confirmed_at = CASE WHEN ? = 'confirmed' THEN ? ELSE confirmed_at END, updated_at = ? WHERE id = ?`)
          .run(status, details.meeting_mode || existing.meeting_mode, details.meeting_url ?? existing.meeting_url,
            details.meeting_location ?? existing.meeting_location, details.mentor_note ?? existing.mentor_note,
            status, timestamp, timestamp, id);
        return repo.getCareerMentorshipRequest(id);
      });
      return update.immediate();
    },

    // ─── TECH ARTICLES ──────────────────────────────────────────────────────
    createTechArticle(accountId, authorName, payload) {
      const timestamp = new Date().toISOString();
      const article = {
        id: randomUUID(),
        payload_json: JSON.stringify(payload),
        author_account_id: accountId,
        author_name: authorName,
        status: 'pending_review',
        review_note: '',
        reviewed_by_account_id: null,
        reviewed_at: null,
        created_at: timestamp,
        updated_at: timestamp
      };
      const create = sqlite.transaction(() => {
        sqlite.prepare(`INSERT INTO tech_articles
          (id, payload_json, author_account_id, author_name, status, review_note, reviewed_by_account_id, reviewed_at, created_at, updated_at)
          VALUES (@id, @payload_json, @author_account_id, @author_name, @status, @review_note, @reviewed_by_account_id, @reviewed_at, @created_at, @updated_at)`)
          .run(article);
        repo.insertTechArticleHistory(article.id, accountId, 'submit', null, article.status, '');
      });
      create.immediate();
      return { ...article, payload };
    },

    mapTechArticle(row, includeHistory = false) {
      if (!row) return null;
      const article = { ...row, payload: JSON.parse(row.payload_json) };
      delete article.payload_json;
      if (includeHistory) article.history = repo.listTechArticleHistory(row.id);
      return article;
    },

    listTechArticles(status = 'published') {
      return sqlite.prepare('SELECT * FROM tech_articles WHERE status = ? ORDER BY created_at DESC, id').all(status)
        .map((row) => repo.mapTechArticle(row));
    },

    listMyTechArticles(accountId) {
      return sqlite.prepare('SELECT * FROM tech_articles WHERE author_account_id = ? ORDER BY updated_at DESC, id').all(accountId)
        .map((row) => repo.mapTechArticle(row, true));
    },

    listPendingTechArticles() {
      return sqlite.prepare("SELECT * FROM tech_articles WHERE status = 'pending_review' ORDER BY created_at ASC, id").all()
        .map((row) => repo.mapTechArticle(row, true));
    },

    resubmitTechArticle(id, accountId, payload) {
      const resubmit = sqlite.transaction(() => {
        const existing = sqlite.prepare("SELECT * FROM tech_articles WHERE id = ? AND author_account_id = ? AND status = 'needs_revision'").get(id, accountId);
        if (!existing) return null;
        const timestamp = new Date().toISOString();
        sqlite.prepare(`UPDATE tech_articles SET payload_json = ?, status = 'pending_review', review_note = '',
          reviewed_by_account_id = NULL, reviewed_at = NULL, updated_at = ? WHERE id = ?`)
          .run(JSON.stringify(payload), timestamp, id);
        repo.insertTechArticleHistory(id, accountId, 'resubmit', existing.status, 'pending_review', '');
        return repo.mapTechArticle(sqlite.prepare('SELECT * FROM tech_articles WHERE id = ?').get(id), true);
      });
      return resubmit.immediate();
    },

    reviewTechArticle(id, status, note, reviewerAccountId) {
      if (!['published', 'needs_revision', 'rejected'].includes(status)) return null;
      const review = sqlite.transaction(() => {
        const row = sqlite.prepare("SELECT * FROM tech_articles WHERE id = ? AND status = 'pending_review'").get(id);
        if (!row) return null;
        const timestamp = new Date().toISOString();
        sqlite.prepare(`UPDATE tech_articles SET status = ?, review_note = ?, reviewed_by_account_id = ?, reviewed_at = ?, updated_at = ? WHERE id = ?`)
          .run(status, note, reviewerAccountId, timestamp, timestamp, id);
        repo.insertTechArticleHistory(id, reviewerAccountId, 'review', row.status, status, note);
        return repo.mapTechArticle(sqlite.prepare('SELECT * FROM tech_articles WHERE id = ?').get(id), true);
      });
      return review.immediate();
    },

    listTechArticleHistory(articleId) {
      return sqlite.prepare('SELECT id, actor_account_id, action, from_status, to_status, note, created_at FROM tech_article_history WHERE article_id = ? ORDER BY created_at ASC, id').all(articleId);
    },

    insertTechArticleHistory(articleId, actorAccountId, action, fromStatus, toStatus, note) {
      sqlite.prepare(`INSERT INTO tech_article_history (id, article_id, actor_account_id, action, from_status, to_status, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(randomUUID(), articleId, actorAccountId, action, fromStatus, toStatus, note, new Date().toISOString());
    },

    // ─── PROJECT CALLS (Open Projects) ──────────────────────────────────────
    createProjectCall(accountId, ownerName, payload) {
      const timestamp = new Date().toISOString();
      const call = {
        id: randomUUID(),
        payload_json: JSON.stringify(payload),
        owner_account_id: accountId,
        owner_name: ownerName,
        status: 'pending_review',
        review_note: '',
        reviewed_by_account_id: null,
        reviewed_at: null,
        created_at: timestamp,
        updated_at: timestamp
      };
      sqlite.prepare(`INSERT INTO project_calls
        (id, payload_json, owner_account_id, owner_name, status, review_note, reviewed_by_account_id, reviewed_at, created_at, updated_at)
        VALUES (@id, @payload_json, @owner_account_id, @owner_name, @status, @review_note, @reviewed_by_account_id, @reviewed_at, @created_at, @updated_at)`)
        .run(call);
      return { ...call, payload };
    },

    mapProjectCall(row, includePrivate = false) {
      if (!row) return null;
      const payload = JSON.parse(row.payload_json);
      const publicCall = {
        id: row.id,
        ...payload,
        owner_name: row.owner_name,
        status: row.status,
        review_note: row.review_note,
        created_at: row.created_at,
        updated_at: row.updated_at,
        is_open: row.status === 'published' && payload.deadline >= getHmifCalendarDate(),
        application_count: sqlite.prepare('SELECT COUNT(*) AS count FROM project_call_applications WHERE call_id = ?').get(row.id).count
      };
      if (includePrivate) publicCall.owner_account_id = row.owner_account_id;
      return publicCall;
    },

    getProjectCall(id) {
      return sqlite.prepare('SELECT * FROM project_calls WHERE id = ?').get(id) || null;
    },

    listProjectCalls(status = 'published') {
      return sqlite.prepare('SELECT * FROM project_calls WHERE status = ? ORDER BY created_at DESC, id').all(status)
        .map((row) => repo.mapProjectCall(row));
    },

    listMyProjectCalls(accountId) {
      return sqlite.prepare('SELECT * FROM project_calls WHERE owner_account_id = ? ORDER BY updated_at DESC, id').all(accountId)
        .map((row) => ({
          ...repo.mapProjectCall(row, true),
          applications: repo.listProjectCallApplications(row.id)
        }));
    },

    listPendingProjectCalls() {
      return sqlite.prepare("SELECT * FROM project_calls WHERE status = 'pending_review' ORDER BY created_at ASC, id").all()
        .map((row) => repo.mapProjectCall(row, true));
    },

    reviewProjectCall(id, status, note, reviewerAccountId) {
      if (!['published', 'rejected'].includes(status)) return null;
      const result = sqlite.prepare(`UPDATE project_calls SET status = ?, review_note = ?, reviewed_by_account_id = ?, reviewed_at = ?, updated_at = ?
        WHERE id = ? AND status = 'pending_review'`).run(status, note, reviewerAccountId, new Date().toISOString(), new Date().toISOString(), id);
      return result.changes ? repo.mapProjectCall(repo.getProjectCall(id), true) : null;
    },

    closeProjectCall(id, ownerAccountId) {
      const result = sqlite.prepare(`UPDATE project_calls SET status = 'closed', updated_at = ?
        WHERE id = ? AND owner_account_id = ? AND status = 'published'`).run(new Date().toISOString(), id, ownerAccountId);
      return result.changes ? repo.mapProjectCall(repo.getProjectCall(id), true) : null;
    },

    createProjectCallApplication(callId, accountId, applicantName, payload) {
      const call = repo.getProjectCall(callId);
      if (!call || call.status !== 'published') return { error: 'Open project tidak tersedia.' };
      if (call.owner_account_id === accountId) return { error: 'Pemilik open project tidak dapat melamar ke timnya sendiri.' };
      const callPayload = JSON.parse(call.payload_json);
      if (callPayload.deadline < getHmifCalendarDate()) return { error: 'Tenggat open project sudah lewat.' };
      if (!callPayload.roles.includes(payload.role)) return { error: 'Peran yang dipilih tidak tersedia.' };
      const timestamp = new Date().toISOString();
      const application = {
        id: randomUUID(), call_id: callId, applicant_account_id: accountId, applicant_name: applicantName,
        role: payload.role, message: payload.message, status: 'pending', created_at: timestamp, updated_at: timestamp
      };
      try {
        sqlite.prepare(`INSERT INTO project_call_applications
          (id, call_id, applicant_account_id, applicant_name, role, message, status, created_at, updated_at)
          VALUES (@id, @call_id, @applicant_account_id, @applicant_name, @role, @message, @status, @created_at, @updated_at)`).run(application);
      } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return { error: 'Anda sudah mengirim minat pada open project ini.' };
        throw error;
      }
      return application;
    },

    listProjectCallApplications(callId) {
      return sqlite.prepare(`SELECT id, applicant_name, role, message, status, created_at, updated_at
        FROM project_call_applications WHERE call_id = ? ORDER BY created_at ASC, id`).all(callId);
    },

    listMyProjectCallApplications(accountId) {
      return sqlite.prepare(`SELECT applications.id, applications.call_id, applications.role, applications.message, applications.status,
          applications.created_at, calls.owner_name, calls.payload_json
        FROM project_call_applications AS applications JOIN project_calls AS calls ON calls.id = applications.call_id
        WHERE applications.applicant_account_id = ? ORDER BY applications.created_at DESC`).all(accountId)
        .map(({ payload_json, ...application }) => ({ ...application, call: JSON.parse(payload_json) }));
    },

    updateProjectCallApplication(id, callId, ownerAccountId, status) {
      if (!['accepted', 'declined'].includes(status)) return null;
      const result = sqlite.prepare(`UPDATE project_call_applications SET status = ?, updated_at = ?
        WHERE id = ? AND call_id = ? AND status = 'pending'
          AND EXISTS (SELECT 1 FROM project_calls WHERE id = ? AND owner_account_id = ? AND status = 'published')`)
        .run(status, new Date().toISOString(), id, callId, callId, ownerAccountId);
      return result.changes
        ? sqlite.prepare('SELECT id, applicant_account_id, applicant_name, role, message, status, created_at, updated_at FROM project_call_applications WHERE id = ?').get(id)
        : null;
    }
  };

  return repo;
};
