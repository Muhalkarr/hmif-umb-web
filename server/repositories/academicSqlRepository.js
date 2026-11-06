import { randomUUID } from 'node:crypto';
import { rankTutorCandidates } from '../academicFeatures.js';

const getAcademicTableNames = (kind) => {
  if (kind === 'resource') return { table: 'academic_resources', history: 'academic_resource_history', foreignKey: 'resource_id' };
  if (kind === 'learning_path') return { table: 'academic_learning_paths', history: 'academic_learning_path_history', foreignKey: 'learning_path_id' };
  throw new Error('Jenis konten akademik tidak valid.');
};

const mapAcademicRecord = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    ...JSON.parse(row.payload_json),
    status: row.status,
    created_by_account_id: row.created_by_account_id,
    submitted_at: row.submitted_at,
    reviewed_by_account_id: row.reviewed_by_account_id,
    reviewed_at: row.reviewed_at,
    review_note: row.review_note,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
};

/** SQLite operations owned by academic services. */
export const createAcademicSqlRepository = ({ sqlite, read, write, insertAudit, findUserById }) => {
  const repo = {
    addKnowledgeFile(file) {
      const record = { id: randomUUID(), created_at: new Date().toISOString(), ...file };
      sqlite.prepare(`INSERT INTO knowledge_files (id, stored_name, original_name, size, sha256, uploaded_by, uploaded_by_account_id, created_at)
      VALUES (@id, @stored_name, @original_name, @size, @sha256, @uploaded_by, @uploaded_by_account_id, @created_at)`).run(record);
      return record;
    },

    getKnowledgeFile(id) {
      return sqlite.prepare('SELECT * FROM knowledge_files WHERE id = ?').get(id) || null;
    },

    listKnowledgeFiles(ownerAccountId = null) {
      if (ownerAccountId) {
        return sqlite.prepare(`SELECT id, original_name, size, sha256, uploaded_by, uploaded_by_account_id, created_at
        FROM knowledge_files WHERE uploaded_by_account_id = ? ORDER BY created_at DESC`).all(ownerAccountId);
      }
      return sqlite.prepare('SELECT id, original_name, size, sha256, uploaded_by, uploaded_by_account_id, created_at FROM knowledge_files ORDER BY created_at DESC').all();
    },

    deleteKnowledgeFile(id) {
      return sqlite.prepare('DELETE FROM knowledge_files WHERE id = ?').run(id).changes > 0;
    },

    isKnowledgeFileReferenced(id) {
      if (sqlite.prepare('SELECT 1 FROM academic_resources WHERE json_extract(payload_json, \u0027$.file_id\u0027) = ? LIMIT 1').get(id)) return true;
      const state = sqlite.prepare('SELECT draft_json, published_json FROM site_state WHERE id = 1').get();
      const revisions = sqlite.prepare('SELECT payload FROM site_revisions').all();
      const configs = [state.draft_json, state.published_json, ...revisions.map(({ payload }) => payload)];
      return configs.some((serialized) => JSON.parse(serialized).content?.data?.knowledgeResources
        ?.some((resource) => resource.fileId === id));
    },

    createKnowledgeDiscussion({ resourceId, accountId, authorName, message, parentId = null, solutionType = 'discussion' }) {
      const discussion = {
        id: randomUUID(),
        resource_id: resourceId,
        parent_id: parentId,
        account_id: accountId,
        author_name: authorName,
        message,
        solution_type: solutionType,
        status: 'pending',
        selected_solution: 0,
        created_at: new Date().toISOString()
      };
      sqlite.prepare(`INSERT INTO knowledge_discussions
      (id, resource_id, parent_id, account_id, author_name, message, solution_type, status, selected_solution, created_at)
      VALUES (@id, @resource_id, @parent_id, @account_id, @author_name, @message, @solution_type, @status, @selected_solution, @created_at)`).run(discussion);
      const { account_id, ...publicRecord } = discussion;
      return publicRecord;
    },

    getKnowledgeDiscussions(resourceId, accountId = null) {
      const rows = accountId
        ? sqlite.prepare(`SELECT id, resource_id, parent_id, author_name, message, solution_type, selected_solution, status, created_at
          FROM knowledge_discussions WHERE resource_id = ? AND (status = 'published' OR account_id = ?)
          ORDER BY created_at ASC`).all(resourceId, accountId)
        : sqlite.prepare(`SELECT id, resource_id, parent_id, author_name, message, solution_type, selected_solution, status, created_at
          FROM knowledge_discussions WHERE resource_id = ? AND status = 'published'
          ORDER BY created_at ASC`).all(resourceId);
      return rows;
    },

    listPendingKnowledgeDiscussions() {
      return sqlite.prepare(`SELECT id, resource_id, parent_id, author_name, message, solution_type, status, created_at
      FROM knowledge_discussions WHERE status = 'pending' ORDER BY created_at ASC`).all();
    },

    moderateKnowledgeDiscussion(id, status, moderatorId) {
      const moderatedAt = new Date().toISOString();
      const result = sqlite.prepare(`UPDATE knowledge_discussions SET status = ?, moderated_at = ?, moderated_by = ?
      WHERE id = ? AND status = 'pending'`).run(status, moderatedAt, moderatorId, id);
      if (!result.changes) return null;
      return sqlite.prepare(`SELECT id, resource_id, parent_id, author_name, message, solution_type, selected_solution, status, created_at, moderated_at
      FROM knowledge_discussions WHERE id = ?`).get(id);
    },

    selectKnowledgeSolution(id, moderator) {
      const discussion = sqlite.prepare(`SELECT id, resource_id, solution_type, status
      FROM knowledge_discussions WHERE id = ?`).get(id);
      if (!discussion || discussion.status !== 'published' || !['answer', 'alternative'].includes(discussion.solution_type)) return null;
      const timestamp = new Date().toISOString();
      const transaction = sqlite.transaction(() => {
        sqlite.prepare('UPDATE knowledge_discussions SET selected_solution = 0 WHERE resource_id = ?')
          .run(discussion.resource_id);
        sqlite.prepare('UPDATE knowledge_discussions SET selected_solution = 1 WHERE id = ?').run(id);
        return sqlite.prepare(`SELECT id, resource_id, parent_id, author_name, message, solution_type, selected_solution, status, created_at, moderated_at
        FROM knowledge_discussions WHERE id = ?`).get(id);
      });
      return transaction.immediate();
    },

    listAcademicRecords(kind, { status = null, ownerAccountId = null } = {}) {
      const { table } = getAcademicTableNames(kind);
      const clauses = [];
      const params = [];
      if (status) {
        clauses.push('status = ?');
        params.push(status);
      }
      if (ownerAccountId) {
        clauses.push('created_by_account_id = ?');
        params.push(ownerAccountId);
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      return sqlite.prepare(`SELECT * FROM ${table} ${where} ORDER BY updated_at DESC`).all(...params)
        .map((row) => mapAcademicRecord(row));
    },

    getAcademicRecord(kind, id) {
      const { table } = getAcademicTableNames(kind);
      return mapAcademicRecord(sqlite.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id));
    },

    getPublicAcademicRecords(kind) {
      return repo.listAcademicRecords(kind, { status: 'published' });
    },

    saveAcademicDraft(kind, id, payload, actorAccountId, canEditAny = false) {
      const { table, history, foreignKey } = getAcademicTableNames(kind);
      const timestamp = new Date().toISOString();
      const existing = id ? sqlite.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) : null;
      if (id && !existing) return { error: 'Konten akademik tidak ditemukan.' };
      if (existing && !canEditAny && existing.created_by_account_id !== actorAccountId) {
        return { error: 'Anda hanya dapat mengubah draft akademik milik sendiri.' };
      }
      if (existing && !['draft', 'rejected'].includes(existing.status)) {
        return { error: 'Konten yang sedang ditinjau atau sudah terbit tidak dapat diedit.' };
      }

      const recordId = id || payload.id;
      const action = existing ? 'update' : 'create';
      const fromStatus = existing?.status || null;
      const transaction = sqlite.transaction(() => {
        if (existing) {
          sqlite.prepare(`UPDATE ${table} SET payload_json = ?, status = 'draft', submitted_at = NULL,
          reviewed_by_account_id = NULL, reviewed_at = NULL, review_note = '', updated_at = ? WHERE id = ?`)
            .run(JSON.stringify(payload), timestamp, recordId);
        } else {
          sqlite.prepare(`INSERT INTO ${table}
          (id, payload_json, status, created_by_account_id, created_at, updated_at)
          VALUES (?, ?, 'draft', ?, ?, ?)`)
            .run(recordId, JSON.stringify(payload), actorAccountId, timestamp, timestamp);
        }
        sqlite.prepare(`INSERT INTO ${history} (id, ${foreignKey}, actor_account_id, action, from_status, to_status, created_at)
        VALUES (?, ?, ?, ?, ?, 'draft', ?)`)
          .run(randomUUID(), recordId, actorAccountId, action, fromStatus, timestamp);
      });
      transaction();
      return repo.getAcademicRecord(kind, recordId);
    },

    submitAcademicRecord(kind, id, actorAccountId, canSubmitAny = false) {
      const { table, history, foreignKey } = getAcademicTableNames(kind);
      const existing = sqlite.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
      if (!existing || (!canSubmitAny && existing.created_by_account_id !== actorAccountId)
        || !['draft', 'rejected'].includes(existing.status)) return null;
      const timestamp = new Date().toISOString();
      const transaction = sqlite.transaction(() => {
        sqlite.prepare(`UPDATE ${table} SET status = 'pending_review', submitted_at = ?, review_note = '', updated_at = ? WHERE id = ?`)
          .run(timestamp, timestamp, id);
        sqlite.prepare(`INSERT INTO ${history} (id, ${foreignKey}, actor_account_id, action, from_status, to_status, created_at)
        VALUES (?, ?, ?, 'submit', ?, 'pending_review', ?)`)
          .run(randomUUID(), id, actorAccountId, existing.status, timestamp);
      });
      transaction();
      return repo.getAcademicRecord(kind, id);
    },

    reviewAcademicRecord(kind, id, status, reviewerAccountId, note = '') {
      if (!['published', 'rejected'].includes(status)) return null;
      const { table, history, foreignKey } = getAcademicTableNames(kind);
      const existing = sqlite.prepare(`SELECT * FROM ${table} WHERE id = ? AND status = 'pending_review'`).get(id);
      if (!existing) return null;
      const timestamp = new Date().toISOString();
      const transaction = sqlite.transaction(() => {
        sqlite.prepare(`UPDATE ${table} SET status = ?, reviewed_by_account_id = ?, reviewed_at = ?, review_note = ?, updated_at = ? WHERE id = ?`)
          .run(status, reviewerAccountId, timestamp, note, timestamp, id);
        sqlite.prepare(`INSERT INTO ${history} (id, ${foreignKey}, actor_account_id, action, from_status, to_status, note, created_at)
        VALUES (?, ?, ?, 'review', 'pending_review', ?, ?, ?)`)
          .run(randomUUID(), id, reviewerAccountId, status, note, timestamp);
      });
      transaction();
      return repo.getAcademicRecord(kind, id);
    },

    createTutoringRequest(request) {
      const timestamp = new Date().toISOString();
      const record = {
        id: randomUUID(),
        student_account_id: request.studentAccountId,
        student_name: request.studentName,
        course: request.course,
        topic: request.topic,
        request_message: request.message,
        preferred_time: request.preferredTime,
        preferred_slots_json: JSON.stringify(request.preferredSlots || []),
        status: 'Diterima',
        tutor_account_id: null,
        tutor_name: null,
        session_at: null,
        duration_minutes: 60,
        mode: null,
        meeting_url: null,
        location: null,
        admin_note: '',
        created_at: timestamp,
        updated_at: timestamp
      };
      sqlite.prepare(`INSERT INTO tutoring_requests
      (id, student_account_id, student_name, course, topic, request_message, preferred_time, preferred_slots_json, status,
       tutor_account_id, tutor_name, session_at, duration_minutes, mode, meeting_url, location, admin_note, created_at, updated_at)
      VALUES (@id, @student_account_id, @student_name, @course, @topic, @request_message, @preferred_time, @preferred_slots_json, @status,
       @tutor_account_id, @tutor_name, @session_at, @duration_minutes, @mode, @meeting_url, @location, @admin_note, @created_at, @updated_at)`).run(record);
      const { preferred_slots_json, ...safeRecord } = record;
      return { ...safeRecord, preferred_slots: JSON.parse(preferred_slots_json) };
    },

    getMyTutoringRequests(accountId) {
      return sqlite.prepare(`SELECT id, student_name, course, topic, request_message, preferred_time, preferred_slots_json, status,
        tutor_name, session_at, duration_minutes, mode, meeting_url, location, admin_note, created_at, updated_at
      FROM tutoring_requests WHERE student_account_id = ? ORDER BY created_at DESC`).all(accountId)
        .map(({ preferred_slots_json, ...request }) => ({ ...request, preferred_slots: JSON.parse(preferred_slots_json || '[]') }));
    },

    getTutoringRequest(id) {
      return sqlite.prepare('SELECT * FROM tutoring_requests WHERE id = ?').get(id) || null;
    },

    listTutoringRequests() {
      return sqlite.prepare(`SELECT id, student_name, course, topic, request_message, preferred_time, preferred_slots_json, status,
        tutor_account_id, tutor_name, session_at, duration_minutes, mode, meeting_url, location, admin_note, created_at, updated_at
      FROM tutoring_requests ORDER BY CASE status WHEN 'Diterima' THEN 0 ELSE 1 END, created_at ASC`).all()
        .map(({ preferred_slots_json, ...request }) => ({ ...request, preferred_slots: JSON.parse(preferred_slots_json || '[]') }));
    },

    saveTutorProfile(accountId, profile) {
      const record = {
        account_id: accountId,
        expertise_json: JSON.stringify(profile.expertise),
        availability_json: JSON.stringify(profile.availability),
        bio: profile.bio,
        active: profile.active ? 1 : 0,
        updated_at: new Date().toISOString()
      };
      sqlite.prepare(`INSERT INTO tutor_profiles (account_id, expertise_json, availability_json, bio, active, updated_at)
      VALUES (@account_id, @expertise_json, @availability_json, @bio, @active, @updated_at)
      ON CONFLICT(account_id) DO UPDATE SET expertise_json = excluded.expertise_json,
        availability_json = excluded.availability_json, bio = excluded.bio, active = excluded.active, updated_at = excluded.updated_at`).run(record);
      return repo.getTutorProfile(accountId);
    },
    getTutorProfile(accountId) {
      const profile = sqlite.prepare('SELECT * FROM tutor_profiles WHERE account_id = ?').get(accountId);
      if (!profile) return null;
      return {
        expertise: JSON.parse(profile.expertise_json),
        availability: JSON.parse(profile.availability_json),
        bio: profile.bio,
        active: Boolean(profile.active),
        updated_at: profile.updated_at
      };
    },
    getActiveTutorProfiles() {
      const usersById = new Map(read().users.map((user) => [user.account_id, user]));
      return sqlite.prepare('SELECT * FROM tutor_profiles WHERE active = 1 ORDER BY updated_at DESC').all()
        .map((profile) => {
          const user = usersById.get(profile.account_id);
          if (!user || user.role === 'superadmin' || user.clearance_level < 2) return null;
          return {
            account_id: profile.account_id,
            name: user.name,
            division: user.division || '',
            role_title: user.role_title || '',
            expertise: JSON.parse(profile.expertise_json),
            availability: JSON.parse(profile.availability_json),
            bio: profile.bio
          };
        }).filter(Boolean);
    },

    getTutorMatches(request) {
      const scheduledSessions = sqlite.prepare(`SELECT tutor_account_id, status, session_at, duration_minutes
      FROM tutoring_requests WHERE status = 'Dijadwalkan' AND session_at IS NOT NULL`).all();
      return rankTutorCandidates(request, repo.getActiveTutorProfiles(), scheduledSessions)
        .filter((tutor) => tutor.skills_score > 0
          && (!request.preferred_slots?.length || tutor.matching_slots.length > 0));
    },

    tutorAvailableAt(accountId, sessionAt, mode, durationMinutes = 60) {
      const profile = repo.getTutorProfile(accountId);
      if (!profile?.active) return false;
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Jakarta', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
      }).formatToParts(new Date(sessionAt));
      const part = (type) => parts.find((item) => item.type === type)?.value;
      const dayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(part('weekday'));
      const sessionMinute = Number(part('hour')) * 60 + Number(part('minute'));
      const sessionEndMinute = sessionMinute + durationMinutes;
      return profile.availability.some((slot) => slot.dayOfWeek === dayOfWeek
        && (slot.mode === 'any' || slot.mode === mode)
        && sessionMinute >= Number(slot.start.slice(0, 2)) * 60 + Number(slot.start.slice(3, 5))
        && sessionEndMinute <= Number(slot.end.slice(0, 2)) * 60 + Number(slot.end.slice(3, 5)));
    },
    tutorHasScheduleConflict(accountId, sessionAt, durationMinutes = 60, excludeRequestId = null) {
      const start = Date.parse(sessionAt);
      const end = start + durationMinutes * 60000;
      return sqlite.prepare(`SELECT id, session_at, duration_minutes FROM tutoring_requests
      WHERE tutor_account_id = ? AND status = 'Dijadwalkan' AND session_at IS NOT NULL AND id != COALESCE(?, '')`)
        .all(accountId, excludeRequestId)
        .some((session) => start < Date.parse(session.session_at) + (session.duration_minutes || 60) * 60000
          && Date.parse(session.session_at) < end);
    },

    scheduleTutoringRequest(id, schedule) {
      const updatedAt = new Date().toISOString();
      const durationMinutes = schedule.durationMinutes || 30;
      const update = sqlite.transaction(() => {
        if (repo.tutorHasScheduleConflict(schedule.tutorAccountId, schedule.sessionAt, durationMinutes, id)) {
          return { error: 'Tutor sudah memiliki sesi lain pada rentang waktu tersebut.' };
        }
        const result = sqlite.prepare(`UPDATE tutoring_requests SET status = ?, tutor_account_id = ?, tutor_name = ?,
          session_at = ?, duration_minutes = ?, mode = ?, meeting_url = ?, location = ?, admin_note = ?, updated_at = ?
        WHERE id = ? AND status IN ('Diterima', 'Dijadwalkan')`).run(
          schedule.status,
          schedule.tutorAccountId,
          schedule.tutorName,
          schedule.sessionAt,
          durationMinutes,
          schedule.mode,
          schedule.meetingUrl || '',
          schedule.location || '',
          schedule.adminNote || '',
          updatedAt,
          id
        );
        if (!result.changes) return null;
        return sqlite.prepare(`SELECT id, student_name, course, topic, status, tutor_name, session_at, duration_minutes, mode,
          meeting_url, location, admin_note, updated_at FROM tutoring_requests WHERE id = ?`).get(id);
      });
      return update.immediate();
    },

    setTutoringRequestStatus(id, status, adminNote) {
      const updatedAt = new Date().toISOString();
      const allowedPreviousStatus = status === 'Selesai' ? 'Dijadwalkan' : 'Diterima';
      const result = sqlite.prepare(`UPDATE tutoring_requests SET status = ?, admin_note = ?, updated_at = ?
      WHERE id = ? AND status = ?`).run(status, adminNote, updatedAt, id, allowedPreviousStatus);
      if (!result.changes) return null;
      return sqlite.prepare(`SELECT id, student_name, course, topic, status, tutor_name, session_at, mode,
        meeting_url, location, admin_note, updated_at FROM tutoring_requests WHERE id = ?`).get(id);
    }
  };
  return repo;
};
