import {
    buildStudentAccountTable,
    DEFAULT_STUDENT_DEMOGRAPHIC_SETTINGS,
    summarizeStudentAccounts,
    validateStudentDemographicSettings,
    validateStudentDemographicValues
} from '../studentDemographics.js';

export const registerStudentDemographicRoutes = (app, {
    db,
    requireAuth,
    requireSuperadmin,
    requireCapability,
    auditAdminMutation
}) => {
    app.get('/api/admin/student-demographics', requireCapability('student_demographics.view'), (req, res) => {
        const users = db.read()?.users || [];
        const settings = db.getStudentDemographicSettings();
        const values = db.getStudentDemographicCustomValues();
        const hasVisibleCustomColumns = settings.customColumns.some(({ visible }) => visible);
        const tableSettings = req.user.role === 'superadmin'
            && settings.visibleColumns.length === 0
            && !hasVisibleCustomColumns
            ? { ...settings, visibleColumns: DEFAULT_STUDENT_DEMOGRAPHIC_SETTINGS.visibleColumns }
            : settings;
        res.set('Cache-Control', 'no-store');
        res.json({
            ...summarizeStudentAccounts(users),
            ...buildStudentAccountTable(users, tableSettings, values)
        });
    });

    app.get('/api/admin/student-demographics/settings', requireSuperadmin, (_req, res) => {
        res.set('Cache-Control', 'no-store');
        res.json({ settings: db.getStudentDemographicSettings() });
    });

    app.put('/api/admin/student-demographics/settings', requireSuperadmin, (req, res) => {
        const validation = validateStudentDemographicSettings(req.body?.settings);
        if (validation.error) return res.status(400).json({ error: validation.error });
        const result = db.setStudentDemographicSettings(validation.settings, req.user.nim);
        if (result?.error) return res.status(409).json({ error: result.error });
        auditAdminMutation(req, 'student_demographics.settings_update', 'student_demographics', 'columns', {
            visibleColumnCount: validation.settings.visibleColumns.length,
            customColumnCount: validation.settings.customColumns.length
        });
        res.json({ message: 'PENGATURAN KOLOM STATISTIK DIPERBARUI', ...result });
    });

    app.get('/api/admin/student-demographics/custom-values', requireSuperadmin, (_req, res) => {
        const accounts = (db.read()?.users || [])
            .filter((user) => user && user.role !== 'superadmin')
            .map(({ account_id, name, nim }) => ({ account_id, name, nim }));
        res.set('Cache-Control', 'no-store');
        res.json({
            accounts,
            values: db.getStudentDemographicCustomValues()
        });
    });

    app.put('/api/admin/student-demographics/custom-values/:accountId', requireSuperadmin, (req, res) => {
        const account = db.findUserById(req.params.accountId);
        if (!account || account.role === 'superadmin') {
            return res.status(404).json({ error: 'Akun anggota tidak ditemukan.' });
        }
        const settings = db.getStudentDemographicSettings();
        const validation = validateStudentDemographicValues(req.body?.values, settings.customColumns);
        if (validation.error) return res.status(400).json({ error: validation.error });
        const values = db.setStudentDemographicCustomValues(account.account_id, validation.values, req.user);
        res.json({ message: 'NILAI KOLOM KUSTOM DISIMPAN', values });
    });

    app.get('/api/student-demographics/profile-fields', requireAuth, (req, res) => {
        const settings = db.getStudentDemographicSettings();
        const values = db.getStudentDemographicCustomValues(req.user.account_id)[req.user.account_id] || {};
        res.set('Cache-Control', 'no-store');
        res.json({ fields: settings.customColumns, values });
    });

    app.put('/api/student-demographics/profile-fields', requireAuth, (req, res) => {
        const settings = db.getStudentDemographicSettings();
        const validation = validateStudentDemographicValues(req.body?.values, settings.customColumns);
        if (validation.error) return res.status(400).json({ error: validation.error });
        const values = db.setStudentDemographicCustomValues(req.user.account_id, validation.values, req.user);
        res.json({ message: 'PROFIL KOLOM KUSTOM DIPERBARUI', values });
    });
};
