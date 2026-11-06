import { randomUUID } from 'node:crypto';

/**
 * SQLite & memory operations owned by Operations, Missions (Proker), Task Board, and Office Letters.
 */
export const createOperationsSqlRepository = ({ sqlite, read, write, findUserById }) => {
  const repo = {
    // ─── Proker / Missions ───────────────────────────────────────────────────
    getAllProker() {
      return read().missions_proker;
    },

    updateProker(id, updates) {
      const db = read();
      const idx = db.missions_proker.findIndex((p) => p.id === id);
      if (idx === -1) return null;

      db.missions_proker[idx] = { ...db.missions_proker[idx], ...updates };
      write(db);
      return db.missions_proker[idx];
    },

    createProker(prokerData) {
      const db = read();
      const newProker = {
        id: `proker-${Date.now()}`,
        title: prokerData.title,
        division: prokerData.division,
        category: prokerData.category || 'Program Kerja',
        status: prokerData.status || 'upcoming',
        date_start: prokerData.date_start,
        date_end: prokerData.date_end,
        target_participants: prokerData.target_participants,
        kpi_indicator: prokerData.kpi_indicator,
        budget_allocated: Number(prokerData.budget_allocated) || 0,
        budget_spent: Number(prokerData.budget_spent) || 0,
        lpj_notes: prokerData.lpj_notes || '',
        created_at: new Date().toISOString()
      };
      db.missions_proker.push(newProker);
      write(db);
      return newProker;
    },

    // ─── Tasks & Task History ────────────────────────────────────────────────
    listOrganizationTasks() {
      const prokerTitles = new Map(repo.getAllProker().map(({ id, title }) => [id, title]));
      return sqlite.prepare(`SELECT * FROM organization_tasks
        ORDER BY CASE status WHEN 'todo' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'review' THEN 2 ELSE 3 END,
          due_date, created_at`).all().map((task) => ({
        ...task,
        pic_name: task.pic_account_id
          ? findUserById?.(task.pic_account_id)?.name || task.pic_name
          : task.pic_name,
        proker_title: task.proker_id ? prokerTitles.get(task.proker_id) || null : null,
        status_history: repo.listOrganizationTaskHistory(task.id)
      }));
    },

    getOrganizationTask(id) {
      return sqlite.prepare('SELECT * FROM organization_tasks WHERE id = ?').get(id) || null;
    },

    createOrganizationTask(task, actorNim) {
      const timestamp = new Date().toISOString();
      const record = {
        id: randomUUID(),
        proker_id: task.proker_id || null,
        title: task.title,
        description: task.description || '',
        status: task.status || 'todo',
        pic_name: task.pic_name,
        pic_account_id: task.pic_account_id || null,
        due_date: task.due_date || null,
        created_by: actorNim,
        created_at: timestamp,
        updated_at: timestamp
      };
      const transaction = sqlite.transaction(() => {
        sqlite.prepare(`INSERT INTO organization_tasks
          (id, proker_id, title, description, status, pic_name, pic_account_id, due_date, created_by, created_at, updated_at)
          VALUES (@id, @proker_id, @title, @description, @status, @pic_name, @pic_account_id, @due_date, @created_by, @created_at, @updated_at)`).run(record);
        repo.insertOrganizationTaskHistory(record.id, actorNim, null, record.status, timestamp);
      });
      transaction.immediate();
      return record;
    },

    updateOrganizationTask(id, updates, actorNim) {
      const transaction = sqlite.transaction(() => {
        const existing = sqlite.prepare('SELECT * FROM organization_tasks WHERE id = ?').get(id);
        if (!existing) return null;
        const updated = { ...existing, ...updates, updated_at: new Date().toISOString() };
        sqlite.prepare(`UPDATE organization_tasks SET proker_id = ?, title = ?, description = ?, status = ?,
          pic_name = ?, pic_account_id = ?, due_date = ?, updated_at = ? WHERE id = ?`)
          .run(updated.proker_id, updated.title, updated.description, updated.status, updated.pic_name,
            updated.pic_account_id, updated.due_date, updated.updated_at, id);
        if (existing.status !== updated.status) {
          repo.insertOrganizationTaskHistory(id, actorNim, existing.status, updated.status, updated.updated_at);
        }
        return { ...updated, status_history: repo.listOrganizationTaskHistory(id) };
      });
      return transaction.immediate();
    },

    listOrganizationTaskHistory(taskId) {
      return sqlite.prepare(`SELECT id, actor_nim, old_status, new_status, created_at
        FROM organization_task_history WHERE task_id = ? ORDER BY created_at DESC, id DESC`).all(taskId);
    },

    insertOrganizationTaskHistory(taskId, actorNim, oldStatus, newStatus, createdAt) {
      sqlite.prepare(`INSERT INTO organization_task_history
        (id, task_id, actor_nim, old_status, new_status, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`).run(randomUUID(), taskId, actorNim, oldStatus, newStatus, createdAt);
    },

    getAllOrganizationTasks() {
      return sqlite.prepare('SELECT id, status, due_date FROM organization_tasks').all();
    },

    // ─── Office Letters (E-Office) ───────────────────────────────────────────
    listOfficeLetters(filters = {}) {
      const { query = '', division = '', dateFrom = '', dateTo = '' } = filters;
      const conditions = [];
      const params = [];
      if (query) {
        conditions.push('(subject LIKE ? OR body LIKE ? OR letter_number LIKE ? OR tags_json LIKE ?)');
        const fuzz = `%${query}%`;
        params.push(fuzz, fuzz, fuzz, fuzz);
      }
      if (division) {
        conditions.push('(division = ? OR target_division = ?)');
        params.push(division, division);
      }
      if (dateFrom) {
        conditions.push('date(created_at) >= date(?)');
        params.push(dateFrom);
      }
      if (dateTo) {
        conditions.push('date(created_at) <= date(?)');
        params.push(dateTo);
      }

      const sql = `SELECT * FROM office_letters${conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''} ORDER BY created_at DESC`;
      return sqlite.prepare(sql).all(...params).map((row) => ({
        ...row,
        tags: JSON.parse(row.tags_json || '[]'),
        approval_sequence: JSON.parse(row.approval_sequence_json || '[]'),
        approvals: JSON.parse(row.approval_json || '[]')
      }));
    },

    createOfficeLetter(letter, actor) {
      const now = new Date().toISOString();
      const nextSequence = (sqlite.prepare('SELECT COUNT(*) AS count FROM office_letters WHERE type = ?').get(letter.type).count || 0) + 1;
      const number = `${letter.letter_number || `HMIF-${letter.type.toUpperCase().replace(/[^A-Z]/g, '')}-${new Date().getFullYear()}-${String(nextSequence).padStart(3, '0')}`}`;
      const approvalSequence = Array.isArray(letter.approval_sequence) && letter.approval_sequence.length
        ? letter.approval_sequence
        : ['Ketua Divisi', 'Sekretaris Umum', 'Ketua Himpunan', 'Pembina/Kaprodi'];
      const approvalSteps = approvalSequence.map((step, index) => ({
        step,
        status: index === 0 ? 'pending' : 'queued',
        approved_by: '',
        approved_at: '',
        note: ''
      }));
      const record = {
        id: randomUUID(),
        letter_number: number,
        type: letter.type,
        subject: letter.subject,
        division: letter.division,
        target_division: letter.target_division,
        body: letter.body,
        tags_json: JSON.stringify(letter.tags || []),
        approval_sequence_json: JSON.stringify(approvalSequence),
        approval_json: JSON.stringify(approvalSteps),
        status: 'pending_approval',
        current_stage: 0,
        created_by: actor?.nim || actor?.account_id || 'system',
        created_at: now,
        updated_at: now
      };
      sqlite.prepare(`INSERT INTO office_letters
        (id, letter_number, type, subject, division, target_division, body, tags_json, approval_sequence_json, approval_json, status, current_stage, created_by, created_at, updated_at)
        VALUES (@id, @letter_number, @type, @subject, @division, @target_division, @body, @tags_json, @approval_sequence_json, @approval_json, @status, @current_stage, @created_by, @created_at, @updated_at)`).run(record);
      return { ...record, tags: JSON.parse(record.tags_json), approvals: approvalSteps, approval_sequence: approvalSequence };
    },

    approveOfficeLetter(letterId, stepName, approved, note, actor) {
      const row = sqlite.prepare('SELECT * FROM office_letters WHERE id = ?').get(letterId);
      if (!row) return { error: 'Dokumen surat tidak ditemukan.' };
      const approvals = JSON.parse(row.approval_json || '[]');
      const index = approvals.findIndex((item) => item.step === stepName);
      if (index === -1) return { error: 'Tahap persetujuan tidak valid.' };
      if (approvals[index].status !== 'pending') return { error: 'Tahap persetujuan ini sudah diproses.' };

      approvals[index].status = approved ? 'approved' : 'rejected';
      approvals[index].approved_by = actor?.nim || actor?.account_id || 'system';
      approvals[index].approved_at = new Date().toISOString();
      approvals[index].note = note || '';

      const nextIndex = index + 1;
      if (!approved) {
        row.status = 'rejected';
        row.current_stage = index;
      } else if (nextIndex < approvals.length) {
        approvals[nextIndex].status = 'pending';
        row.status = 'pending_approval';
        row.current_stage = nextIndex;
      } else {
        row.status = 'approved';
        row.current_stage = approvals.length;
      }

      row.approval_json = JSON.stringify(approvals);
      row.updated_at = new Date().toISOString();
      sqlite.prepare(`UPDATE office_letters SET approval_json = ?, status = ?, current_stage = ?, updated_at = ? WHERE id = ?`)
        .run(row.approval_json, row.status, row.current_stage, row.updated_at, letterId);

      return {
        ...row,
        tags: JSON.parse(row.tags_json || '[]'),
        approvals: JSON.parse(row.approval_json || '[]'),
        approval_sequence: JSON.parse(row.approval_sequence_json || '[]')
      };
    }
  };

  return repo;
};
