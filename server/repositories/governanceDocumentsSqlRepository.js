import { randomUUID } from 'node:crypto';
import { validateGovernanceDocuments } from '../governanceDocuments.js';
import { governanceDocumentAssetIds } from '../../shared/governanceDocumentContent.js';

export const initializeGovernanceDocumentsSchema = (sqlite) => {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS governance_document_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      official_revision_id TEXT NOT NULL,
      active_draft_id TEXT
    );
    CREATE TABLE IF NOT EXISTS governance_document_drafts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'ratified', 'withdrawn')),
      official_base_revision_id TEXT NOT NULL,
      current_revision_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      ratified_by TEXT,
      ratified_at TEXT,
      withdrawn_by TEXT,
      withdrawn_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_governance_document_one_active_draft
      ON governance_document_drafts(status) WHERE status = 'active';
    CREATE TABLE IF NOT EXISTS governance_document_revisions (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('official', 'draft')),
      draft_id TEXT REFERENCES governance_document_drafts(id),
      title TEXT NOT NULL,
      version INTEGER NOT NULL CHECK (version > 0),
      payload_json TEXT NOT NULL,
      metadata_json TEXT,
      parent_revision_id TEXT REFERENCES governance_document_revisions(id),
      change_note TEXT NOT NULL DEFAULT '',
      author_nim TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_governance_document_revisions_draft
      ON governance_document_revisions(draft_id, version DESC);
    CREATE INDEX IF NOT EXISTS idx_governance_document_revisions_created
      ON governance_document_revisions(created_at DESC);
    CREATE TABLE IF NOT EXISTS governance_document_asset_references (
      asset_id TEXT NOT NULL,
      revision_id TEXT NOT NULL REFERENCES governance_document_revisions(id),
      PRIMARY KEY (asset_id, revision_id)
    );
    CREATE INDEX IF NOT EXISTS idx_governance_document_asset_references_revision
      ON governance_document_asset_references(revision_id);
  `);
};

const parseRevision = (row) => row ? ({
  id: row.id,
  kind: row.kind,
  draftId: row.draft_id || null,
  title: row.title,
  version: row.version,
  documents: validateGovernanceDocuments(JSON.parse(row.payload_json)),
  metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null,
  parentRevisionId: row.parent_revision_id || null,
  changeNote: row.change_note,
  authorNim: row.author_nim,
  createdAt: row.created_at
}) : null;

const conflict = (message) => Object.assign(new Error(message), { code: 'GOVERNANCE_DOCUMENT_CONFLICT' });

export const createGovernanceDocumentsSqlRepository = ({ sqlite, insertAudit }) => {
  const storeAssetReferences = (revisionId, documents) => {
    const insertAssetReference = sqlite.prepare(`INSERT OR IGNORE INTO governance_document_asset_references
      (asset_id, revision_id) VALUES (?, ?)`);
    for (const assetId of governanceDocumentAssetIds(documents)) insertAssetReference.run(assetId, revisionId);
  };
  const getRevision = (id) => parseRevision(sqlite.prepare(`
    SELECT id, kind, draft_id, title, version, payload_json, metadata_json,
      parent_revision_id, change_note, author_nim, created_at
    FROM governance_document_revisions WHERE id = ?
  `).get(id));

  const ensureSeed = (documents, metadata) => {
    let state = sqlite.prepare('SELECT official_revision_id, active_draft_id FROM governance_document_state WHERE id = 1').get();
    if (state) return state;
    const timestamp = new Date().toISOString();
    const revisionId = randomUUID();
    const seed = sqlite.transaction(() => {
      state = sqlite.prepare('SELECT official_revision_id, active_draft_id FROM governance_document_state WHERE id = 1').get();
      if (state) return state;
      const seedDocuments = validateGovernanceDocuments(documents);
      sqlite.prepare(`INSERT INTO governance_document_revisions
        (id, kind, draft_id, title, version, payload_json, metadata_json, parent_revision_id, change_note, author_nim, created_at)
        VALUES (?, 'official', NULL, ?, 1, ?, ?, NULL, ?, 'system', ?)`)
      .run(revisionId, metadata.title, JSON.stringify(seedDocuments), JSON.stringify(metadata), 'Naskah resmi awal dari sumber repository.', timestamp);
      storeAssetReferences(revisionId, seedDocuments);
      sqlite.prepare(`INSERT INTO governance_document_state (id, official_revision_id, active_draft_id)
        VALUES (1, ?, NULL)`).run(revisionId);
      return { official_revision_id: revisionId, active_draft_id: null };
    });
    return seed();
  };

  return Object.freeze({
    isAssetReferencedByRevision(assetId) {
      return Boolean(sqlite.prepare('SELECT 1 FROM governance_document_asset_references WHERE asset_id = ? LIMIT 1').get(assetId));
    },

    isAssetReferencedByOfficial(assetId) {
      return Boolean(sqlite.prepare(`SELECT 1 FROM governance_document_asset_references assets
        JOIN governance_document_state state ON state.official_revision_id = assets.revision_id
        WHERE assets.asset_id = ? LIMIT 1`).get(assetId));
    },

    getGovernanceDocumentState(documents, metadata) {
      const state = ensureSeed(documents, metadata);
      const official = getRevision(state.official_revision_id);
      const draftRow = state.active_draft_id
        ? sqlite.prepare('SELECT * FROM governance_document_drafts WHERE id = ? AND status = ?').get(state.active_draft_id, 'active')
        : null;
      const draftRevision = draftRow ? getRevision(draftRow.current_revision_id) : null;
      return {
        official,
        draft: draftRow && draftRevision ? {
          id: draftRow.id,
          title: draftRow.title,
          status: draftRow.status,
          baseOfficialRevisionId: draftRow.official_base_revision_id,
          revisionId: draftRevision.id,
          version: draftRevision.version,
          documents: draftRevision.documents,
          createdBy: draftRow.created_by,
          createdAt: draftRow.created_at,
          updatedBy: draftRow.updated_by,
          updatedAt: draftRow.updated_at,
          changeNote: draftRevision.changeNote
        } : null
      };
    },

    listGovernanceDocumentRevisions(limit = 50) {
      return sqlite.prepare(`SELECT r.id, r.kind, r.draft_id, r.title, r.version, r.parent_revision_id,
          r.change_note, r.author_nim, r.created_at, d.status AS draft_status
        FROM governance_document_revisions r
        LEFT JOIN governance_document_drafts d ON d.id = r.draft_id
        ORDER BY r.created_at DESC, r.version DESC LIMIT ?`).all(Math.max(1, Math.min(100, limit)));
    },

    getGovernanceDocumentRevision(id) {
      return getRevision(id);
    },

    createGovernanceDocumentDraft(title, actorNim, actorRole, changeNote, documents, metadata) {
      const timestamp = new Date().toISOString();
      const draftId = randomUUID();
      const revisionId = randomUUID();
      const transaction = sqlite.transaction(() => {
        const state = ensureSeed(documents, metadata);
        if (state.active_draft_id) throw conflict('Sudah ada draf MUBES aktif. Selesaikan atau tarik draf tersebut terlebih dahulu.');
        const official = getRevision(state.official_revision_id);
        const officialPayload = JSON.stringify(official.documents);
        const created = sqlite.prepare(`INSERT INTO governance_document_drafts
          (id, title, status, official_base_revision_id, current_revision_id, created_by, created_at, updated_by, updated_at)
          VALUES (?, ?, 'active', ?, ?, ?, ?, ?, ?)`);
        created.run(draftId, title, official.id, revisionId, actorNim, timestamp, actorNim, timestamp);
        sqlite.prepare(`INSERT INTO governance_document_revisions
          (id, kind, draft_id, title, version, payload_json, metadata_json, parent_revision_id, change_note, author_nim, created_at)
          VALUES (?, 'draft', ?, ?, 1, ?, NULL, ?, ?, ?, ?)`)
          .run(revisionId, draftId, title, officialPayload, official.id, changeNote, actorNim, timestamp);
        storeAssetReferences(revisionId, official.documents);
        sqlite.prepare('UPDATE governance_document_state SET active_draft_id = ? WHERE id = 1').run(draftId);
        insertAudit({
          actorNim, actorRole, action: 'governance_document.draft_create',
          targetType: 'governance_document_draft', targetId: draftId,
          details: { title, revisionId }, createdAt: timestamp
        });
      });
      transaction();
      return this.getGovernanceDocumentState(documents, metadata);
    },

    saveGovernanceDocumentDraft(draftId, documents, expectedRevisionId, actorNim, actorRole, changeNote, seedDocuments, seedMetadata) {
      const timestamp = new Date().toISOString();
      const revisionId = randomUUID();
      const normalizedDocuments = validateGovernanceDocuments(documents);
      const transaction = sqlite.transaction(() => {
        ensureSeed(seedDocuments, seedMetadata);
        const draft = sqlite.prepare('SELECT * FROM governance_document_drafts WHERE id = ? AND status = ?').get(draftId, 'active');
        if (!draft) throw conflict('Draf MUBES tidak aktif atau sudah ditutup.');
        if (draft.current_revision_id !== expectedRevisionId) throw conflict('Draf berubah di sesi lain. Muat ulang sebelum menyimpan.');
        const previous = getRevision(draft.current_revision_id);
        const nextVersion = previous.version + 1;
        sqlite.prepare(`INSERT INTO governance_document_revisions
          (id, kind, draft_id, title, version, payload_json, metadata_json, parent_revision_id, change_note, author_nim, created_at)
          VALUES (?, 'draft', ?, ?, ?, ?, NULL, ?, ?, ?, ?)`)
          .run(revisionId, draftId, draft.title, nextVersion, JSON.stringify(normalizedDocuments), previous.id, changeNote, actorNim, timestamp);
        storeAssetReferences(revisionId, normalizedDocuments);
        sqlite.prepare(`UPDATE governance_document_drafts
          SET current_revision_id = ?, updated_by = ?, updated_at = ? WHERE id = ?`)
          .run(revisionId, actorNim, timestamp, draftId);
        insertAudit({
          actorNim, actorRole, action: 'governance_document.draft_update',
          targetType: 'governance_document_draft', targetId: draftId,
          details: { revisionId, version: nextVersion }, createdAt: timestamp
        });
      });
      transaction();
      return this.getGovernanceDocumentState(seedDocuments, seedMetadata);
    },

    ratifyGovernanceDocumentDraft(draftId, expectedRevisionId, actorNim, actorRole, ratificationNote, metadata, seedDocuments) {
      const timestamp = new Date().toISOString();
      const revisionId = randomUUID();
      const transaction = sqlite.transaction(() => {
        const state = sqlite.prepare('SELECT official_revision_id, active_draft_id FROM governance_document_state WHERE id = 1').get();
        const draft = sqlite.prepare('SELECT * FROM governance_document_drafts WHERE id = ? AND status = ?').get(draftId, 'active');
        if (!state || !draft || state.active_draft_id !== draftId) throw conflict('Draf MUBES tidak aktif atau sudah ditutup.');
        if (draft.current_revision_id !== expectedRevisionId) throw conflict('Draf berubah di sesi lain. Muat ulang sebelum mengesahkan.');
        const currentOfficial = getRevision(state.official_revision_id);
        const currentDraft = getRevision(draft.current_revision_id);
        const nextVersion = currentOfficial.version + 1;
        const publishedMetadata = {
          ...metadata,
          archivedSourceUrl: metadata.sourceUrl,
          sourceUrl: null,
          status: 'Disahkan melalui MUBES',
          ratifiedAt: timestamp,
          ratifiedYear: Number(timestamp.slice(0, 4))
        };
        sqlite.prepare(`INSERT INTO governance_document_revisions
          (id, kind, draft_id, title, version, payload_json, metadata_json, parent_revision_id, change_note, author_nim, created_at)
          VALUES (?, 'official', NULL, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(revisionId, metadata.title, nextVersion, JSON.stringify(currentDraft.documents),
            JSON.stringify(publishedMetadata), currentOfficial.id, ratificationNote, actorNim, timestamp);
        storeAssetReferences(revisionId, currentDraft.documents);
        sqlite.prepare(`UPDATE governance_document_drafts
          SET status = 'ratified', ratified_by = ?, ratified_at = ?, updated_by = ?, updated_at = ?
          WHERE id = ?`).run(actorNim, timestamp, actorNim, timestamp, draftId);
        sqlite.prepare('UPDATE governance_document_state SET official_revision_id = ?, active_draft_id = NULL WHERE id = 1')
          .run(revisionId);
        insertAudit({
          actorNim, actorRole, action: 'governance_document.ratify',
          targetType: 'governance_document_revision', targetId: revisionId,
          details: { draftId, version: nextVersion }, createdAt: timestamp
        });
      });
      transaction();
      return this.getGovernanceDocumentState(seedDocuments, metadata);
    },

    withdrawGovernanceDocumentDraft(draftId, expectedRevisionId, actorNim, actorRole, seedDocuments, seedMetadata) {
      const timestamp = new Date().toISOString();
      const transaction = sqlite.transaction(() => {
        ensureSeed(seedDocuments, seedMetadata);
        const draft = sqlite.prepare('SELECT * FROM governance_document_drafts WHERE id = ? AND status = ?').get(draftId, 'active');
        if (!draft) throw conflict('Draf MUBES tidak aktif atau sudah ditutup.');
        if (draft.current_revision_id !== expectedRevisionId) throw conflict('Draf berubah di sesi lain. Muat ulang sebelum menarik draf.');
        sqlite.prepare(`UPDATE governance_document_drafts
          SET status = 'withdrawn', withdrawn_by = ?, withdrawn_at = ?, updated_by = ?, updated_at = ?
          WHERE id = ?`).run(actorNim, timestamp, actorNim, timestamp, draftId);
        sqlite.prepare('UPDATE governance_document_state SET active_draft_id = NULL WHERE id = 1').run();
        insertAudit({
          actorNim, actorRole, action: 'governance_document.draft_withdraw',
          targetType: 'governance_document_draft', targetId: draftId, details: {}, createdAt: timestamp
        });
      });
      transaction();
      return this.getGovernanceDocumentState(seedDocuments, seedMetadata);
    }
  });
};
