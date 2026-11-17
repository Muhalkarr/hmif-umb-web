import { randomUUID } from 'node:crypto';

const mapPost = (row) => row ? {
    id: row.id,
    author_name: row.author_name,
    body: row.body,
    created_at: row.created_at,
    updated_at: row.updated_at,
    like_count: Number(row.like_count || 0),
    comment_count: Number(row.comment_count || 0),
    reacted_by_me: Boolean(row.reacted_by_me)
} : null;

const parseCursor = (cursor) => {
    if (!cursor) return null;
    try {
        const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
        if (typeof parsed.created_at !== 'string' || typeof parsed.id !== 'string'
            || Number.isNaN(Date.parse(parsed.created_at))) throw new Error();
        return parsed;
    } catch {
        throw new Error('Cursor feed tidak valid.');
    }
};

const makePostSelect = `SELECT p.id, p.author_account_id, p.author_name, p.body, p.created_at, p.updated_at,
  (SELECT COUNT(*) FROM social_reactions r WHERE r.post_id = p.id) AS like_count,
  (SELECT COUNT(*) FROM social_comments c WHERE c.post_id = p.id AND c.status = 'published') AS comment_count,
  EXISTS (SELECT 1 FROM social_reactions r WHERE r.post_id = p.id AND r.account_id = @account_id) AS reacted_by_me
  FROM social_posts p`;

/** SQLite operations owned by the internal social feed. */
export const createSocialSqlRepository = ({ sqlite }) => ({
    listSocialPosts({ accountId, limit, cursor }) {
        const parsedCursor = parseCursor(cursor);
        const cursorClause = parsedCursor ? 'AND (p.created_at < @cursor_created_at OR (p.created_at = @cursor_created_at AND p.id < @cursor_id))' : '';
        const rows = sqlite.prepare(`${makePostSelect}
      WHERE p.status = 'published' ${cursorClause}
      ORDER BY p.created_at DESC, p.id DESC LIMIT @limit`).all({
            account_id: accountId,
            limit: limit + 1,
            ...(parsedCursor ? { cursor_created_at: parsedCursor.created_at, cursor_id: parsedCursor.id } : {})
        });
        const hasMore = rows.length > limit;
        const posts = rows.slice(0, limit).map(mapPost);
        const lastPost = posts.at(-1);
        return {
            posts,
            next_cursor: hasMore && lastPost
                ? Buffer.from(JSON.stringify({ created_at: lastPost.created_at, id: lastPost.id })).toString('base64url')
                : null
        };
    },

    getSocialPost(id, accountId) {
        return mapPost(sqlite.prepare(`${makePostSelect} WHERE p.id = ? AND p.status = 'published'`).get({ id, account_id: accountId }));
    },

    getSocialPostForAction(id) {
        return sqlite.prepare('SELECT id, author_account_id, status FROM social_posts WHERE id = ?').get(id) || null;
    },

    createSocialPost({ accountId, authorName, body }) {
        const post = {
            id: randomUUID(), account_id: accountId, author_name: authorName,
            body, status: 'published', created_at: new Date().toISOString()
        };
        sqlite.prepare(`INSERT INTO social_posts (id, author_account_id, author_name, body, status, created_at, updated_at)
      VALUES (@id, @account_id, @author_name, @body, @status, @created_at, @created_at)`).run(post);
        return this.getSocialPost(post.id, accountId);
    },

    updateSocialPost({ id, accountId, body }) {
        const updatedAt = new Date().toISOString();
        const result = sqlite.prepare(`UPDATE social_posts SET body = ?, updated_at = ?
      WHERE id = ? AND author_account_id = ? AND status = 'published'`).run(body, updatedAt, id, accountId);
        return result.changes ? this.getSocialPost(id, accountId) : null;
    },

    deleteSocialPost({ id, accountId, canModerate }) {
        const result = sqlite.prepare(`UPDATE social_posts SET status = 'deleted', updated_at = ?
      WHERE id = ? AND status = 'published' AND (author_account_id = ? OR ? = 1)`)
            .run(new Date().toISOString(), id, accountId, canModerate ? 1 : 0);
        return result.changes > 0;
    },

    listSocialComments(postId, accountId) {
        return sqlite.prepare(`SELECT id, parent_id, author_name, body, created_at,
      author_account_id = @account_id AS is_mine
      FROM social_comments WHERE post_id = @post_id AND status = 'published'
      ORDER BY created_at ASC, id ASC`).all({ post_id: postId, account_id: accountId })
            .map((comment) => ({ ...comment, is_mine: Boolean(comment.is_mine) }));
    },

    createSocialComment({ postId, accountId, authorName, parentId, body }) {
        const post = sqlite.prepare(`SELECT 1 FROM social_posts WHERE id = ? AND status = 'published'`).get(postId);
        if (!post) return { error: 'Post tidak ditemukan.' };
        if (parentId) {
            const parent = sqlite.prepare(`SELECT 1 FROM social_comments WHERE id = ? AND post_id = ?
        AND status = 'published' AND parent_id IS NULL`).get(parentId, postId);
            if (!parent) return { error: 'Balasan harus merujuk komentar utama yang masih tersedia.' };
        }
        const comment = {
            id: randomUUID(), post_id: postId, parent_id: parentId || null,
            account_id: accountId, author_name: authorName, body,
            status: 'published', created_at: new Date().toISOString()
        };
        sqlite.prepare(`INSERT INTO social_comments (id, post_id, parent_id, author_account_id, author_name, body, status, created_at)
      VALUES (@id, @post_id, @parent_id, @account_id, @author_name, @body, @status, @created_at)`).run(comment);
        return {
            id: comment.id,
            parent_id: comment.parent_id,
            author_name: comment.author_name,
            body: comment.body,
            created_at: comment.created_at,
            is_mine: true
        };
    },

    deleteSocialComment({ id, accountId, canModerate }) {
        const result = sqlite.prepare(`UPDATE social_comments SET status = 'deleted'
      WHERE id = ? AND status = 'published' AND (author_account_id = ? OR ? = 1)`)
            .run(id, accountId, canModerate ? 1 : 0);
        return result.changes > 0;
    },

    toggleSocialReaction({ postId, accountId }) {
        const transaction = sqlite.transaction(() => {
            const post = sqlite.prepare(`SELECT 1 FROM social_posts WHERE id = ? AND status = 'published'`).get(postId);
            if (!post) return null;
            const existing = sqlite.prepare('SELECT 1 FROM social_reactions WHERE post_id = ? AND account_id = ?').get(postId, accountId);
            if (existing) sqlite.prepare('DELETE FROM social_reactions WHERE post_id = ? AND account_id = ?').run(postId, accountId);
            else sqlite.prepare('INSERT INTO social_reactions (post_id, account_id, created_at) VALUES (?, ?, ?)')
                .run(postId, accountId, new Date().toISOString());
            return {
                reacted_by_me: !existing,
                like_count: sqlite.prepare('SELECT COUNT(*) AS count FROM social_reactions WHERE post_id = ?').get(postId).count
            };
        });
        return transaction.immediate();
    },

    createSocialReport({ postId, accountId, reporterName, reason }) {
        if (!sqlite.prepare(`SELECT 1 FROM social_posts WHERE id = ? AND status = 'published'`).get(postId)) return { error: 'Post tidak ditemukan.' };
        if (sqlite.prepare('SELECT 1 FROM social_reports WHERE post_id = ? AND reporter_account_id = ?').get(postId, accountId)) {
            return { error: 'Anda sudah melaporkan post ini.' };
        }
        const report = {
            id: randomUUID(), post_id: postId, reporter_account_id: accountId,
            reporter_name: reporterName, reason, status: 'open', created_at: new Date().toISOString()
        };
        sqlite.prepare(`INSERT INTO social_reports (id, post_id, reporter_account_id, reporter_name, reason, status, created_at)
      VALUES (@id, @post_id, @reporter_account_id, @reporter_name, @reason, @status, @created_at)`).run(report);
        return { report: { id: report.id, post_id: report.post_id, status: report.status, created_at: report.created_at } };
    },

    listOpenSocialReports() {
        return sqlite.prepare(`SELECT r.id, r.post_id, r.reporter_name, r.reason, r.created_at,
      p.author_name, p.body, p.status AS post_status
      FROM social_reports r JOIN social_posts p ON p.id = r.post_id
      WHERE r.status = 'open' ORDER BY r.created_at ASC`).all();
    },

    resolveSocialReport({ id, moderatorId, action, note }) {
        const transaction = sqlite.transaction(() => {
            const report = sqlite.prepare(`SELECT id, post_id, status FROM social_reports WHERE id = ?`).get(id);
            if (!report || report.status !== 'open') return null;
            const post = sqlite.prepare('SELECT status FROM social_posts WHERE id = ?').get(report.post_id);
            const timestamp = new Date().toISOString();
            if (action === 'hide' && post?.status === 'published') {
                sqlite.prepare(`UPDATE social_posts SET status = 'hidden', updated_at = ? WHERE id = ?`).run(timestamp, report.post_id);
            }
            const status = action === 'hide' ? 'resolved' : 'dismissed';
            sqlite.prepare(`UPDATE social_reports SET status = ?, resolved_by = ?, resolved_at = ?, resolution_note = ? WHERE id = ?`)
                .run(status, moderatorId, timestamp, note, id);
            sqlite.prepare(`INSERT INTO social_moderation_history (id, report_id, post_id, moderator_account_id, action, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
                .run(randomUUID(), id, report.post_id, moderatorId, action, note, timestamp);
            return { id, post_id: report.post_id, status, action };
        });
        return transaction.immediate();
    }
});