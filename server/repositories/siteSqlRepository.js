import { randomUUID } from 'node:crypto';
import { configReferencesAsset, withSiteDefaults } from '../siteSchema.js';

/** SQLite operations owned by Site Studio. */
export const createSiteSqlRepository = ({ sqlite, read, insertAudit }) => {
  const repo = {
  getSiteState() {
    const state = sqlite.prepare('SELECT draft_json, published_json, draft_revision_id, published_revision_id FROM site_state WHERE id = 1').get();
    return {
      draft: withSiteDefaults(JSON.parse(state.draft_json)),
      published: withSiteDefaults(JSON.parse(state.published_json)),
      draftRevisionId: state.draft_revision_id,
      publishedRevisionId: state.published_revision_id
    };
  },

  saveSiteDraft(config, actorNim, restoredFrom = null, expectedRevisionId = null) {
    const id = randomUUID();
    const timestamp = new Date().toISOString();
    const transaction = sqlite.transaction(() => {
      const current = sqlite.prepare('SELECT draft_revision_id FROM site_state WHERE id = 1').get();
      if (expectedRevisionId !== null && current.draft_revision_id !== expectedRevisionId) {
        const conflict = new Error('Draft berubah di sesi lain. Muat ulang sebelum menyimpan.');
        conflict.code = 'SITE_DRAFT_CONFLICT';
        throw conflict;
      }
      const version = (sqlite.prepare('SELECT COALESCE(MAX(version), 0) + 1 AS next FROM site_revisions').get().next);
      const previousPayload = sqlite.prepare('SELECT payload FROM site_revisions WHERE id = ?').get(current.draft_revision_id)?.payload;
      const previousConfig = previousPayload ? JSON.parse(previousPayload) : {};
      const changedAreas = ['theme', 'pages', 'content'].filter((area) => JSON.stringify(previousConfig[area]) !== JSON.stringify(config[area]));
      sqlite.prepare("UPDATE site_revisions SET status = 'archived' WHERE status = 'draft'").run();
      sqlite.prepare(`INSERT INTO site_revisions (id, version, status, payload, created_by, created_at, restored_from)
        VALUES (?, ?, 'draft', ?, ?, ?, ?)`)
        .run(id, version, JSON.stringify(config), actorNim, timestamp, restoredFrom);
      sqlite.prepare('UPDATE site_state SET draft_json = ?, draft_revision_id = ? WHERE id = 1')
        .run(JSON.stringify(config), id);
      insertAudit({ actorNim, actorRole: 'superadmin', action: restoredFrom ? 'site.restore_draft' : 'site.save_draft', targetType: 'site_config', targetId: id, details: { version, restoredFrom, changedAreas }, createdAt: timestamp });
      return { id, version, status: 'draft', created_at: timestamp, restored_from: restoredFrom };
    });
    return transaction();
  },

  publishSite(actorNim) {
    const timestamp = new Date().toISOString();
    const transaction = sqlite.transaction(() => {
      const state = sqlite.prepare('SELECT draft_json, draft_revision_id FROM site_state WHERE id = 1').get();
      if (!state.draft_revision_id) return null;
      sqlite.prepare("UPDATE site_revisions SET status = 'archived' WHERE status = 'published'").run();
      sqlite.prepare("UPDATE site_revisions SET status = 'published', published_at = ? WHERE id = ? AND status = 'draft'")
        .run(timestamp, state.draft_revision_id);
      sqlite.prepare('UPDATE site_state SET published_json = ?, published_revision_id = ? WHERE id = 1')
        .run(state.draft_json, state.draft_revision_id);
      insertAudit({ actorNim, actorRole: 'superadmin', action: 'site.publish', targetType: 'site_revision', targetId: state.draft_revision_id, details: {}, createdAt: timestamp });
      return { id: state.draft_revision_id, published_at: timestamp };
    });
    return transaction();
  },

  getSiteRevision(id) {
    const row = sqlite.prepare('SELECT id, version, status, payload, created_by, created_at, published_at, restored_from FROM site_revisions WHERE id = ?').get(id);
    if (!row) return null;
    return { ...row, payload: withSiteDefaults(JSON.parse(row.payload)) };
  },

  listSiteRevisions(limit = 30) {
    return sqlite.prepare('SELECT id, version, status, created_by, created_at, published_at, restored_from FROM site_revisions ORDER BY version DESC LIMIT ?').all(limit);
  },

  addAsset(asset) {
    const record = { id: randomUUID(), created_at: new Date().toISOString(), ...asset };
    sqlite.prepare(`INSERT INTO site_assets (id, stored_name, original_name, mime_type, kind, size, sha256, uploaded_by, created_at)
      VALUES (@id, @stored_name, @original_name, @mime_type, @kind, @size, @sha256, @uploaded_by, @created_at)`).run(record);
    return record;
  },
  getAsset(id) {
    return sqlite.prepare('SELECT * FROM site_assets WHERE id = ?').get(id) || null;
  },

  isAssetReferencedByRevision(id) {
    const revisions = sqlite.prepare('SELECT payload FROM site_revisions').all();
    return revisions.some(({ payload }) => {
      return configReferencesAsset(JSON.parse(payload), id);
    });
  },

  isAssetReferencedByUser(id) {
    const url = `/api/site/assets/${id}/file`;
    return read().users.some((user) => user.avatar_silhouette === url);
  },

  assetExists(id, kind) {
    if (!id) return false;
    if (kind === 'knowledge') return Boolean(sqlite.prepare('SELECT 1 FROM knowledge_files WHERE id = ?').get(id));
    return Boolean(sqlite.prepare('SELECT 1 FROM site_assets WHERE id = ? AND (? IS NULL OR kind = ?)').get(id, kind || null, kind || null));
  },

  listAssets() {
    return sqlite.prepare('SELECT id, original_name, mime_type, kind, size, sha256, uploaded_by, created_at FROM site_assets ORDER BY created_at DESC').all();
  },

  listSoundtracks(includeInactive = false) {
    const where = includeInactive ? '' : 'WHERE active = 1';
    return sqlite.prepare(`SELECT id, title, source_type, source_url, mime_type, size, sha256,
        active, sort_order, created_at
      FROM soundtracks ${where} ORDER BY sort_order, created_at, id`).all();
  },
  getSoundtrack(id) {
    return sqlite.prepare('SELECT * FROM soundtracks WHERE id = ?').get(id) || null;
  },

  addSoundtrack(track) {
    const record = {
      id: randomUUID(),
      active: 1,
      sort_order: sqlite.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM soundtracks').get().next,
      created_at: new Date().toISOString(),
      ...track
    };
    sqlite.prepare(`INSERT INTO soundtracks
      (id, title, source_type, source_url, stored_name, mime_type, size, sha256, uploaded_by, active, sort_order, created_at)
      VALUES (@id, @title, @source_type, @source_url, @stored_name, @mime_type, @size, @sha256, @uploaded_by, @active, @sort_order, @created_at)`).run(record);
    return record;
  },

  updateSoundtrack(id, updates) {
    const existing = repo.getSoundtrack(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates };
    sqlite.prepare('UPDATE soundtracks SET title = ?, active = ?, sort_order = ? WHERE id = ?')
      .run(updated.title, updated.active ? 1 : 0, updated.sort_order, id);
    return repo.getSoundtrack(id);
  },

  reorderSoundtracks(ids) {
    const currentIds = sqlite.prepare('SELECT id FROM soundtracks ORDER BY sort_order, created_at, id').all().map(({ id }) => id);
    if (ids.length !== currentIds.length || new Set(ids).size !== ids.length || ids.some((id) => !currentIds.includes(id))) return false;
    const update = sqlite.prepare('UPDATE soundtracks SET sort_order = ? WHERE id = ?');
    const reorder = sqlite.transaction((orderedIds) => {
      orderedIds.forEach((id, index) => update.run(index, id));
    });
    reorder.immediate(ids);
    return true;
  },

  deleteSoundtrack(id) {
    return sqlite.prepare('DELETE FROM soundtracks WHERE id = ? AND active = 0').run(id).changes > 0;
  },

  deleteAsset(id) {
    return sqlite.prepare('DELETE FROM site_assets WHERE id = ?').run(id).changes > 0;
  }
  };
  return repo;
};
