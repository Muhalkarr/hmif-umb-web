/** Endpoint domain registerSocialRoutes. */
export const registerSocialRoutes = (app, context) => {
    const {
        db,
        requireAuth,
        requireClearance,
        socialPostLimiter,
        socialCommentLimiter,
        socialReportLimiter,
        auditAdminMutation
    } = context;
    const requireSocialModerator = requireClearance(2);
    const isModerator = (user) => user.role === 'superadmin' || user.clearance_level >= 2;
    const validateText = (value, maxLength, label) => {
        if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
            throw new Error(`${label} wajib diisi dan maksimal ${maxLength} karakter.`);
        }
        return value.trim();
    };

    app.get('/api/social/feed', requireAuth, (req, res) => {
        const rawLimit = req.query.limit === undefined ? 15 : Number(req.query.limit);
        if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 30) {
            return res.status(400).json({ error: 'Batas feed harus berupa angka 1-30.' });
        }
        if (req.query.cursor !== undefined && typeof req.query.cursor !== 'string') {
            return res.status(400).json({ error: 'Cursor feed tidak valid.' });
        }
        try {
            res.json(db.listSocialPosts({ accountId: req.user.account_id, limit: rawLimit, cursor: req.query.cursor || null }));
        } catch (error) {
            res.status(400).json({ error: error.message || 'Feed tidak dapat dimuat.' });
        }
    });

    app.post('/api/social/posts', requireAuth, socialPostLimiter, (req, res) => {
        try {
            const body = validateText(req.body?.body, 3000, 'Isi post');
            res.status(201).json({ post: db.createSocialPost({ accountId: req.user.account_id, authorName: req.user.name, body }) });
        } catch (error) {
            res.status(400).json({ error: error.message || 'Post tidak valid.' });
        }
    });

    app.put('/api/social/posts/:id', requireAuth, socialPostLimiter, (req, res) => {
        const post = db.getSocialPostForAction(req.params.id);
        if (!post || post.status === 'deleted') return res.status(404).json({ error: 'Post tidak ditemukan.' });
        if (post.author_account_id !== req.user.account_id) return res.status(403).json({ error: 'Anda hanya dapat mengubah post sendiri.' });
        if (post.status !== 'published') return res.status(409).json({ error: 'Post yang disembunyikan tidak dapat diedit.' });
        try {
            const body = validateText(req.body?.body, 3000, 'Isi post');
            const updated = db.updateSocialPost({ id: post.id, accountId: req.user.account_id, body });
            res.json({ post: updated });
        } catch (error) {
            res.status(400).json({ error: error.message || 'Post tidak valid.' });
        }
    });

    app.delete('/api/social/posts/:id', requireAuth, (req, res) => {
        const post = db.getSocialPostForAction(req.params.id);
        if (!post || post.status === 'deleted') return res.status(404).json({ error: 'Post tidak ditemukan.' });
        const moderator = isModerator(req.user);
        if (post.author_account_id !== req.user.account_id && !moderator) {
            return res.status(403).json({ error: 'Anda hanya dapat menghapus post sendiri.' });
        }
        if (post.status !== 'published') return res.status(409).json({ error: 'Post tidak lagi tersedia.' });
        if (!db.deleteSocialPost({ id: post.id, accountId: req.user.account_id, canModerate: moderator })) {
            return res.status(409).json({ error: 'Post berubah dan tidak dapat dihapus.' });
        }
        if (moderator && post.author_account_id !== req.user.account_id) {
            auditAdminMutation(req, 'social.post_hide', 'social_post', post.id, {});
        }
        res.json({ message: 'Post dihapus.' });
    });

    app.get('/api/social/posts/:id/comments', requireAuth, (req, res) => {
        if (!db.getSocialPost(req.params.id, req.user.account_id)) return res.status(404).json({ error: 'Post tidak ditemukan.' });
        res.json({ comments: db.listSocialComments(req.params.id, req.user.account_id) });
    });

    app.post('/api/social/posts/:id/comments', requireAuth, socialCommentLimiter, (req, res) => {
        if (!db.getSocialPost(req.params.id, req.user.account_id)) return res.status(404).json({ error: 'Post tidak ditemukan.' });
        let body;
        try {
            body = validateText(req.body?.body, 2000, 'Komentar');
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }
        const result = db.createSocialComment({
            postId: req.params.id,
            accountId: req.user.account_id,
            authorName: req.user.name,
            parentId: typeof req.body?.parent_id === 'string' ? req.body.parent_id : null,
            body
        });
        if (result.error) return res.status(400).json({ error: result.error });
        res.status(201).json({ comment: result });
    });

    app.delete('/api/social/comments/:id', requireAuth, (req, res) => {
        const moderator = isModerator(req.user);
        if (!db.deleteSocialComment({ id: req.params.id, accountId: req.user.account_id, canModerate: moderator })) {
            return res.status(404).json({ error: 'Komentar tidak ditemukan atau tidak dapat dihapus.' });
        }
        if (moderator) auditAdminMutation(req, 'social.comment_hide', 'social_comment', req.params.id, {});
        res.json({ message: 'Komentar dihapus.' });
    });

    app.post('/api/social/posts/:id/reaction', requireAuth, socialCommentLimiter, (req, res) => {
        const result = db.toggleSocialReaction({ postId: req.params.id, accountId: req.user.account_id });
        if (!result) return res.status(404).json({ error: 'Post tidak ditemukan.' });
        res.json(result);
    });

    app.post('/api/social/posts/:id/reports', requireAuth, socialReportLimiter, (req, res) => {
        let reason;
        try {
            reason = validateText(req.body?.reason, 500, 'Alasan laporan');
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }
        const result = db.createSocialReport({
            postId: req.params.id,
            accountId: req.user.account_id,
            reporterName: req.user.name,
            reason
        });
        if (result.error) return res.status(result.error.includes('sudah melaporkan') ? 409 : 404).json({ error: result.error });
        res.status(201).json(result);
    });

    app.get('/api/social/moderation/reports', requireSocialModerator, (_req, res) => {
        res.json({ reports: db.listOpenSocialReports() });
    });

    app.put('/api/social/moderation/reports/:id', requireSocialModerator, (req, res) => {
        const { action, note = '' } = req.body || {};
        if (!['hide', 'dismiss'].includes(action) || typeof note !== 'string' || note.length > 500) {
            return res.status(400).json({ error: 'Keputusan atau catatan moderasi tidak valid.' });
        }
        const result = db.resolveSocialReport({
            id: req.params.id,
            moderatorId: req.user.account_id,
            action,
            note: note.trim()
        });
        if (!result) return res.status(404).json({ error: 'Laporan tidak ditemukan atau sudah ditangani.' });
        auditAdminMutation(req, `social.report_${action}`, 'social_report', result.id, { postId: result.post_id });
        res.json({ report: result });
    });
};