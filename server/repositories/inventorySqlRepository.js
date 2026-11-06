import { randomUUID } from 'node:crypto';

/**
 * SQLite operations owned by Inventory Assets and Loans.
 */
export const createInventorySqlRepository = ({ sqlite }) => {
  const repo = {
    createInventoryAsset(asset) {
      const timestamp = new Date().toISOString();
      const record = {
        id: randomUUID(),
        asset_tag: asset.assetTag,
        name: asset.name,
        category: asset.category,
        description: asset.description || '',
        location: asset.location || '',
        condition: 'Baik',
        status: 'Tersedia',
        created_by: asset.createdBy,
        created_at: timestamp,
        updated_at: timestamp
      };
      try {
        sqlite.prepare(`INSERT INTO inventory_assets
          (id, asset_tag, name, category, description, location, condition, status, created_by, created_at, updated_at)
          VALUES (@id, @asset_tag, @name, @category, @description, @location, @condition, @status, @created_by, @created_at, @updated_at)`).run(record);
        return record;
      } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return { error: 'Kode aset sudah digunakan.' };
        throw error;
      }
    },

    listInventoryAssets() {
      return sqlite.prepare(`SELECT assets.id, assets.asset_tag, assets.name, assets.category, assets.description,
          assets.location, assets.condition,
          CASE WHEN assets.status = 'Tersedia' AND EXISTS (
            SELECT 1 FROM inventory_loans AS loans WHERE loans.asset_id = assets.id AND loans.status IN ('Diajukan', 'Disetujui')
          ) THEN 'Diproses' ELSE assets.status END AS status
        FROM inventory_assets AS assets ORDER BY assets.category, assets.name`).all();
    },

    requestInventoryLoan({ assetId, accountId, borrowerName, purpose, dueAt }) {
      const request = sqlite.transaction(() => {
        const asset = sqlite.prepare('SELECT id, status FROM inventory_assets WHERE id = ?').get(assetId);
        if (!asset || asset.status !== 'Tersedia') return { error: 'Aset tidak tersedia untuk dipinjam.' };
        const loan = {
          id: randomUUID(),
          asset_id: assetId,
          borrower_account_id: accountId,
          borrower_name: borrowerName,
          purpose,
          due_at: dueAt,
          status: 'Diajukan',
          requested_at: new Date().toISOString(),
          processed_by: null,
          checked_out_at: null,
          returned_at: null,
          condition_note: ''
        };
        try {
          sqlite.prepare(`INSERT INTO inventory_loans
            (id, asset_id, borrower_account_id, borrower_name, purpose, due_at, status, requested_at, processed_by, checked_out_at, returned_at, condition_note)
            VALUES (@id, @asset_id, @borrower_account_id, @borrower_name, @purpose, @due_at, @status, @requested_at, @processed_by, @checked_out_at, @returned_at, @condition_note)`).run(loan);
          repo.insertInventoryLoanHistory(loan.id, accountId, null, loan.status, '');
        } catch (error) {
          if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return { error: 'Aset sudah memiliki permintaan/peminjaman aktif.' };
          throw error;
        }
        return loan;
      });
      return request.immediate();
    },

    getMyInventoryLoans(accountId) {
      return sqlite.prepare(`SELECT loans.id, loans.asset_id, assets.asset_tag, assets.name AS asset_name, assets.category,
          loans.purpose, loans.due_at, loans.status, loans.requested_at, loans.checked_out_at, loans.returned_at, loans.condition_note
        FROM inventory_loans AS loans JOIN inventory_assets AS assets ON assets.id = loans.asset_id
        WHERE loans.borrower_account_id = ? ORDER BY loans.requested_at DESC`).all(accountId)
        .map((loan) => repo.enrichInventoryLoan(loan));
    },

    listInventoryLoans() {
      return sqlite.prepare(`SELECT loans.id, loans.asset_id, assets.asset_tag, assets.name AS asset_name, assets.category,
          loans.borrower_name, loans.purpose, loans.due_at, loans.status, loans.requested_at, loans.checked_out_at, loans.returned_at, loans.condition_note
        FROM inventory_loans AS loans JOIN inventory_assets AS assets ON assets.id = loans.asset_id
        ORDER BY CASE loans.status WHEN 'Diajukan' THEN 0 ELSE 1 END, loans.requested_at ASC`).all()
        .map((loan) => repo.enrichInventoryLoan(loan));
    },

    enrichInventoryLoan(loan) {
      return {
        ...loan,
        is_overdue: loan.status === 'Dipinjam' && Date.parse(loan.due_at) < Date.now(),
        history: repo.listInventoryLoanHistory(loan.id)
      };
    },

    listInventoryLoanHistory(loanId) {
      return sqlite.prepare(`SELECT id, actor_account_id, from_status, to_status, note, created_at
        FROM inventory_loan_history WHERE loan_id = ? ORDER BY created_at ASC, id ASC`).all(loanId);
    },

    insertInventoryLoanHistory(loanId, actorAccountId, fromStatus, toStatus, note, createdAt = new Date().toISOString()) {
      sqlite.prepare(`INSERT INTO inventory_loan_history
        (id, loan_id, actor_account_id, from_status, to_status, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(randomUUID(), loanId, actorAccountId, fromStatus, toStatus, note, createdAt);
    },

    updateInventoryLoan(id, status, processor, conditionNote = '') {
      const update = sqlite.transaction(() => {
        const loan = sqlite.prepare('SELECT id, asset_id, status FROM inventory_loans WHERE id = ?').get(id);
        if (!loan) return null;
        if (['Ditolak', 'Dikembalikan', 'Rusak', 'Hilang'].includes(status) && !conditionNote.trim()) return null;
        const transitions = {
          Disetujui: ['Diajukan'],
          Dipinjam: ['Disetujui'],
          Dikembalikan: ['Dipinjam'],
          Ditolak: ['Diajukan'],
          Rusak: ['Dipinjam'],
          Hilang: ['Dipinjam']
        };
        if (!transitions[status]?.includes(loan.status)) return null;
        const timestamp = new Date().toISOString();
        sqlite.prepare(`UPDATE inventory_loans SET status = ?, processed_by = ?,
          checked_out_at = CASE WHEN ? = 'Dipinjam' THEN ? ELSE checked_out_at END,
          returned_at = CASE WHEN ? IN ('Dikembalikan', 'Rusak', 'Hilang') THEN ? ELSE returned_at END,
          condition_note = CASE WHEN ? != '' THEN ? ELSE condition_note END WHERE id = ?`)
          .run(status, processor, status, timestamp, status, timestamp, conditionNote, conditionNote, id);
        repo.insertInventoryLoanHistory(id, processor, loan.status, status, conditionNote, timestamp);
        if (status === 'Dipinjam') {
          sqlite.prepare(`UPDATE inventory_assets SET status = 'Dipinjam', updated_at = ? WHERE id = ?`).run(timestamp, loan.asset_id);
        } else if (status === 'Dikembalikan') {
          sqlite.prepare(`UPDATE inventory_assets SET status = 'Tersedia', condition = 'Baik', updated_at = ? WHERE id = ?`).run(timestamp, loan.asset_id);
        } else if (status === 'Rusak' || status === 'Hilang') {
          sqlite.prepare(`UPDATE inventory_assets SET status = ?, condition = ?, updated_at = ? WHERE id = ?`)
            .run(status, status, timestamp, loan.asset_id);
        }
        return sqlite.prepare(`SELECT loans.id, loans.asset_id, assets.asset_tag, assets.name AS asset_name,
            loans.borrower_name, loans.status, loans.due_at, loans.condition_note
          FROM inventory_loans AS loans JOIN inventory_assets AS assets ON assets.id = loans.asset_id WHERE loans.id = ?`).get(id);
      });
      return update.immediate();
    }
  };

  return repo;
};
