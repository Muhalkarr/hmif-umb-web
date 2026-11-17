export const registerPositionAccessRoutes = (app, { db, requireSuperadmin, auditAdminMutation }) => {
    app.get('/api/admin/position-access', requireSuperadmin, (_req, res) => {
        res.set('Cache-Control', 'no-store');
        res.json(db.getActiveOrganizationPositionAccess());
    });

    app.put('/api/admin/position-access', requireSuperadmin, (req, res) => {
        const { term_id: termId, position_id: positionId, capabilities } = req.body || {};
        if (typeof termId !== 'string' || typeof positionId !== 'string' || !Array.isArray(capabilities)) {
            return res.status(400).json({ error: 'Periode, posisi, dan daftar capability wajib diisi.' });
        }
        const result = db.setOrganizationPositionCapabilities(termId, positionId, capabilities, req.user.nim);
        if (result?.error) return res.status(409).json({ error: result.error });
        auditAdminMutation(req, 'organization.position_capabilities_update', 'organization_position', positionId, {
            termId,
            capabilityCount: new Set(capabilities).size
        });
        res.json({ message: 'CAPABILITY POSISI DIPERBARUI', ...result });
    });
};
