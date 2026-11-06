import { randomUUID } from 'node:crypto';

/**
 * SQLite & memory operations owned by Financial Ledger, Delegations, and Aspirations.
 */
export const createFinanceAndAspirationsSqlRepository = ({ sqlite, read, write }) => {
  const repo = {
    // ─── Financial Ledger ────────────────────────────────────────────────────
    getFinancialLedger() {
      const db = read();
      const transactions = db.financial_ledger;
      const totalIncome = transactions.filter((t) => t.type === 'INCOME').reduce((acc, t) => acc + Number(t.amount), 0);
      const totalExpense = transactions.filter((t) => t.type === 'EXPENSE').reduce((acc, t) => acc + Number(t.amount), 0);
      const balance = totalIncome - totalExpense;

      // Monthly breakdown
      const monthlyBreakdown = {};
      transactions.forEach((t) => {
        const month = t.date ? t.date.substring(0, 7) : 'unknown';
        if (!monthlyBreakdown[month]) {
          monthlyBreakdown[month] = { income: 0, expense: 0 };
        }
        if (t.type === 'INCOME') {
          monthlyBreakdown[month].income += Number(t.amount);
        } else {
          monthlyBreakdown[month].expense += Number(t.amount);
        }
      });

      // Category breakdown
      const categoryBreakdown = {};
      transactions.forEach((t) => {
        const cat = t.category || 'Lain-lain';
        if (!categoryBreakdown[cat]) {
          categoryBreakdown[cat] = { total: 0, count: 0, type: t.type };
        }
        categoryBreakdown[cat].total += Number(t.amount);
        categoryBreakdown[cat].count++;
      });

      return {
        summary: {
          totalIncome,
          totalExpense,
          balance,
          transactionCount: transactions.length
        },
        monthlyBreakdown,
        categoryBreakdown,
        transactions
      };
    },

    addFinancialTransaction(txData, receipt = null) {
      const db = read();
      const newTx = {
        id: `fin-${Date.now()}`,
        date: txData.date || new Date().toISOString().split('T')[0],
        type: txData.type, // 'INCOME' | 'EXPENSE'
        category: txData.category,
        description: txData.description,
        amount: Number(txData.amount) || 0,
        division: txData.division || 'BPH',
        recorded_by: txData.recorded_by || 'Bendahara Umum',
        receipt
      };
      db.financial_ledger.unshift(newTx);
      write(db);
      return newTx;
    },

    // ─── Delegations & Mandates (Pasal 57 ART) ───────────────────────────────
    getAllDelegations() {
      return sqlite.prepare('SELECT * FROM delegations ORDER BY created_at DESC').all();
    },

    getDelegationsByAccount(accountId) {
      return sqlite.prepare('SELECT * FROM delegations WHERE applicant_account_id = ? ORDER BY created_at DESC').all(accountId);
    },

    createDelegation(data) {
      const id = 'del-' + randomUUID();
      const timestamp = new Date().toISOString();
      sqlite.prepare('INSERT INTO delegations (id, applicant_account_id, applicant_nim, applicant_name, event_name, event_category, destination, start_date, end_date, funding_type, requested_budget, approved_budget, mandate_letter_number, status, lpd_submitted, lpd_text, lpd_submitted_at, clawback_warning, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(
          id,
          data.applicant_account_id,
          data.applicant_nim,
          data.applicant_name,
          data.event_name,
          data.event_category || 'Kompetisi',
          data.destination || 'Dalam Kota',
          data.start_date,
          data.end_date,
          data.funding_type || 'Mandiri',
          Number(data.requested_budget) || 0,
          Number(data.approved_budget) || 0,
          data.mandate_letter_number || '',
          data.status || 'Diajukan',
          0,
          '',
          null,
          0,
          data.notes || '',
          timestamp,
          timestamp
        );
      return sqlite.prepare('SELECT * FROM delegations WHERE id = ?').get(id);
    },

    updateDelegationStatus(id, updateData) {
      const timestamp = new Date().toISOString();
      const current = sqlite.prepare('SELECT * FROM delegations WHERE id = ?').get(id);
      if (!current) return null;
      const status = updateData.status !== undefined ? updateData.status : current.status;
      const mandateNum = updateData.mandate_letter_number !== undefined ? updateData.mandate_letter_number : current.mandate_letter_number;
      const approvedBudget = updateData.approved_budget !== undefined ? Number(updateData.approved_budget) : current.approved_budget;
      const notes = updateData.notes !== undefined ? updateData.notes : current.notes;
      const clawback = updateData.clawback_warning !== undefined ? (updateData.clawback_warning ? 1 : 0) : current.clawback_warning;
      sqlite.prepare('UPDATE delegations SET status = ?, mandate_letter_number = ?, approved_budget = ?, notes = ?, clawback_warning = ?, updated_at = ? WHERE id = ?')
        .run(status, mandateNum, approvedBudget, notes, clawback, timestamp, id);
      return sqlite.prepare('SELECT * FROM delegations WHERE id = ?').get(id);
    },

    submitDelegationLpd(id, lpdText) {
      const timestamp = new Date().toISOString();
      const current = sqlite.prepare('SELECT * FROM delegations WHERE id = ?').get(id);
      if (!current) return null;
      sqlite.prepare("UPDATE delegations SET lpd_submitted = 1, lpd_text = ?, lpd_submitted_at = ?, status = 'Selesai', clawback_warning = 0, updated_at = ? WHERE id = ?")
        .run(lpdText, timestamp, timestamp, id);
      return sqlite.prepare('SELECT * FROM delegations WHERE id = ?').get(id);
    },

    // ─── Aspirations & RDP Agenda ────────────────────────────────────────────
    getAllAspirations() {
      return sqlite.prepare(`SELECT id, sender_nim_or_anon, category, message, status, bph_response,
        responded_by, responded_at, created_at FROM aspirations ORDER BY created_at DESC`).all();
    },

    createAspiration(aspData) {
      const newAsp = {
        id: `asp-${randomUUID()}`,
        sender_nim_or_anon: aspData.sender || 'Anonim (Mahasiswa)',
        category: aspData.category || 'Umum',
        message: aspData.message,
        status: 'Diterima',
        bph_response: '',
        responded_by: '',
        responded_at: null,
        created_at: new Date().toISOString()
      };
      sqlite.prepare(`
        INSERT INTO aspirations (id, sender_nim_or_anon, category, message, status, bph_response, responded_by, responded_at, created_at, tracking_token_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        newAsp.id,
        newAsp.sender_nim_or_anon,
        newAsp.category,
        newAsp.message,
        newAsp.status,
        newAsp.bph_response,
        newAsp.responded_by,
        newAsp.responded_at,
        newAsp.created_at,
        aspData.trackingTokenHash || null
      );
      return newAsp;
    },

    encryptLegacyAspirationData(encryptText) {
      const rows = sqlite.prepare('SELECT id, message, bph_response FROM aspirations').all();
      const update = sqlite.prepare('UPDATE aspirations SET message = ?, bph_response = ? WHERE id = ?');
      const migrate = sqlite.transaction(() => {
        for (const row of rows) {
          const message = String(row.message || '');
          const response = String(row.bph_response || '');
          const encryptedMessage = message.startsWith('enc:v1:') ? message : encryptText(message);
          const encryptedResponse = response.startsWith('enc:v1:') ? response : encryptText(response);
          if (encryptedMessage !== message || encryptedResponse !== response) {
            update.run(encryptedMessage, encryptedResponse, row.id);
          }
        }
      });
      migrate.immediate();
    },

    getAspirationStatus(id, trackingTokenHash) {
      return sqlite.prepare(`SELECT id, category, status, bph_response, responded_at, created_at
        FROM aspirations WHERE id = ? AND tracking_token_hash = ?`).get(id, trackingTokenHash);
    },

    respondAspiration(id, responseText, newStatus = 'Ditindaklanjuti', responder = '') {
      const timestamp = new Date().toISOString();
      const result = sqlite.prepare(`
        UPDATE aspirations
        SET bph_response = ?, status = ?, responded_by = ?, responded_at = ?
        WHERE id = ?
      `).run(responseText, newStatus, responder, timestamp, id);
      if (!result.changes) return null;
      return sqlite.prepare(`SELECT id, sender_nim_or_anon, category, message, status, bph_response,
        responded_by, responded_at, created_at FROM aspirations WHERE id = ?`).get(id);
    },

    setAspirationRdpAgenda(id, rdpData) {
      const timestamp = new Date().toISOString();
      const isRdp = rdpData.is_rdp_agenda ? 1 : 0;
      const notes = rdpData.rdp_notes || '';
      const scheduledAt = rdpData.rdp_scheduled_at || null;
      const status = isRdp ? 'Dijadwalkan RDP DPA' : 'Ditindaklanjuti';
      sqlite.prepare('UPDATE aspirations SET is_rdp_agenda = ?, rdp_notes = ?, rdp_scheduled_at = ?, status = ? WHERE id = ?')
        .run(isRdp, notes, scheduledAt, status, id);
      return sqlite.prepare('SELECT * FROM aspirations WHERE id = ?').get(id);
    },

    getPublicRdpAgendas() {
      return sqlite.prepare(`SELECT id, category, status, rdp_notes, rdp_scheduled_at, created_at
        FROM aspirations WHERE is_rdp_agenda = 1 ORDER BY rdp_scheduled_at ASC, created_at DESC`).all();
    },

    // ─── Cadet Evaluations ───────────────────────────────────────────────────
    saveQuizEvaluation(evalData) {
      const db = read();
      const newEval = {
        id: `eval-${Date.now()}`,
        account_id: evalData.account_id || null,
        nim: evalData.nim,
        score: evalData.score,
        rank_title: evalData.rank_title,
        clearance_awarded: evalData.clearance_awarded,
        evaluated_at: new Date().toISOString()
      };
      db.cadet_evaluations.push(newEval);
      write(db);
      return newEval;
    },

    getCadetEvaluations(nim, findUserByNIM) {
      const user = findUserByNIM ? findUserByNIM(nim) : null;
      if (user) return repo.getCadetEvaluationsByAccountId(user.account_id);
      const db = read();
      return db.cadet_evaluations.filter((evaluation) => evaluation.nim === nim);
    },

    getCadetEvaluationsByAccountId(accountId) {
      const db = read();
      return db.cadet_evaluations.filter((evaluation) => evaluation.account_id === accountId);
    }
  };

  return repo;
};
