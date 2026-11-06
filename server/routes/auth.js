/** Endpoint domain registerAuthRoutes. */
export const registerAuthRoutes = (app, context) => {
  const { db, authLimiter, registrationLimiter, allowPublicRegistration, bcrypt, jwt, JWT_SECRET, setSessionCookie, COOKIE_NAME, isProduction, requireAuth, requireSuperadmin, requireClearance, fs, path, randomUUID, createHash, assetMagic, ASSET_DIR, assetUpload, multer, auditAdminMutation, createUserNotification, daysUntilDate } = context;

  // --------------------------------------------------------------------------
  // 1. AUTHENTICATION & CLEARANCE ROUTES
  // --------------------------------------------------------------------------

  // POST /api/auth/login
  app.post('/api/auth/login', authLimiter, async (req, res) => {
    const { nim, password } = req.body;
    if (typeof nim !== 'string' || typeof password !== 'string' || !nim.trim() || !password || password.length > 256) {
      return res.status(400).json({ error: 'NIM dan Password wajib diisi.' });
    }

    const user = db.findUserByNIM(nim);
    if (!user) {
      return res.status(401).json({ error: 'NIM tidak terdaftar dalam database PRTS.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Kredensial tidak valid. Password salah.' });
    }

    const payload = { sub: user.account_id, ver: user.session_version || 0 };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '2h' });
    const { password_hash, ...safeUser } = user;
    setSessionCookie(res, token);

    res.json({
      message: 'LOGIN BERHASIL // PRTS TERMINAL ACCESS GRANTED',
      user: safeUser
    });
  });

  // POST /api/auth/register (Pendaftaran Mahasiswa / Calon Kader)
  app.post('/api/auth/register', registrationLimiter, async (req, res) => {
    if (!allowPublicRegistration) {
      return res.status(403).json({ error: 'Pendaftaran publik sedang dinonaktifkan.' });
    }
    const { nim, name, password, generation, division } = req.body;
    if (typeof nim !== 'string' || !/^[a-zA-Z0-9._-]{3,32}$/.test(nim)
      || typeof name !== 'string' || !name.trim() || name.length > 120
      || typeof password !== 'string' || password.length < 12 || password.length > 256) {
      return res.status(400).json({ error: 'NIM, Nama Lengkap, dan password minimal 12 karakter wajib diisi.' });
    }

    const result = await db.createUser({
      nim,
      name,
      password,
      generation: generation || '2026',
      division: division || 'Kader Mahasiswa',
      membership_stage: 'Calon Kader',
      clearance_level: 1,
      role_title: 'Kader Muda'
    });

    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    res.status(201).json({
      message: 'REGISTRASI BERHASIL // KADER TERDAFTAR DI PRTS CORE',
      user: result
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    if (req.user && !db.invalidateSessions(req.user.nim)) {
      return res.status(500).json({ error: 'Sesi tidak dapat dicabut. Silakan coba lagi.' });
    }
    res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: isProduction, sameSite: 'strict', path: '/' });
    res.json({ message: 'SESI BERAKHIR' });
  });

  // GET /api/auth/me
  app.get('/api/auth/me', (req, res) => {
    if (!req.user) {
      return res.json({
        authenticated: false,
        user: {
          name: 'Tamu Publik',
          clearance_level: 0,
          role_title: 'Public Guest'
        }
      });
    }

    res.json({
      authenticated: true,
      user: req.user
    });
  });

  app.get('/api/notifications', requireAuth, (req, res) => {
    const accountId = req.user.account_id;
    const preferences = db.getNotificationPreferences(accountId);
    const now = new Date();

    if (preferences.deadline) {
      const reminderWindow = preferences.deadline_days;
      for (const event of db.getAllCalendarEvents()) {
        if (!['beasiswa', 'kompetisi'].includes(event.type)) continue;
        const daysRemaining = daysUntilDate(event.date_str);
        if (daysRemaining < 0 || daysRemaining > reminderWindow) continue;
        createUserNotification(accountId, 'deadline', {
          title: 'Tenggat semakin dekat',
          message: `${event.title} — ${daysRemaining === 0 ? 'hari ini' : `${daysRemaining} hari lagi`}.`,
          actionView: 'calendar',
          dedupeKey: `deadline:event:${event.id}:${event.date_str}`
        });
      }
      for (const task of db.listUpcomingAssignedTasks(accountId)) {
        const daysRemaining = daysUntilDate(task.due_date);
        if (daysRemaining < 0 || daysRemaining > reminderWindow) continue;
        createUserNotification(accountId, 'deadline', {
          title: 'Tenggat tugas semakin dekat',
          message: `${task.title} — ${daysRemaining === 0 ? 'hari ini' : `${daysRemaining} hari lagi`}.`,
          actionView: 'operations',
          dedupeKey: `deadline:task:${task.id}:${task.due_date}`
        });
      }
    }

    if (preferences.tutoring && preferences.tutoring_reminder_hours > 0) {
      for (const session of db.listUpcomingTutoringSessions(accountId)) {
        const sessionTime = Date.parse(session.session_at);
        const remaining = sessionTime - now.getTime();
        if (remaining < 0 || remaining > preferences.tutoring_reminder_hours * 3600000) continue;
        createUserNotification(accountId, 'tutoring', {
          title: 'Pengingat sesi Klinik Koding',
          message: `${session.course}: ${session.topic} dimulai ${new Date(session.session_at).toLocaleString('id-ID')}.`,
          actionView: 'operations',
          dedupeKey: `tutoring:reminder:${session.id}:${session.session_at}`
        });
      }
    }

    const notifications = db.listNotifications(accountId);
    res.set('Cache-Control', 'no-store');
    res.json({
      notifications,
      unread_count: db.getNotificationUnreadCount(accountId),
      preferences
    });
  });

  app.put('/api/notification-preferences', requireAuth, (req, res) => {
    const body = req.body || {};
    const booleanPreferences = ['deadline', 'task', 'submission', 'tutoring'];
    if (booleanPreferences.some((key) => body[key] !== undefined && typeof body[key] !== 'boolean')
      || (body.deadline_days !== undefined && ![1, 3, 7, 14, 30].includes(body.deadline_days))
      || (body.tutoring_reminder_hours !== undefined && ![0, 1, 24, 48].includes(body.tutoring_reminder_hours))
      || !Object.keys(body).some((key) => booleanPreferences.includes(key) || ['deadline_days', 'tutoring_reminder_hours'].includes(key))
      || Object.keys(body).some((key) => !booleanPreferences.includes(key) && !['deadline_days', 'tutoring_reminder_hours'].includes(key))) {
      return res.status(400).json({ error: 'Preferensi notifikasi tidak valid.' });
    }
    const preferences = db.updateNotificationPreferences(req.user.account_id, {
      ...db.getNotificationPreferences(req.user.account_id),
      ...body
    });
    res.json({ preferences });
  });

  app.put('/api/notifications/read-all', requireAuth, (req, res) => {
    const updated = db.markAllNotificationsRead(req.user.account_id);
    res.json({ updated, unread_count: 0 });
  });

  app.put('/api/notifications/:id/read', requireAuth, (req, res) => {
    if (!db.markNotificationRead(req.user.account_id, req.params.id)) {
      return res.status(404).json({ error: 'Notifikasi tidak ditemukan.' });
    }
    res.json({ message: 'Notifikasi ditandai telah dibaca.' });
  });

  app.put('/api/auth/profile', requireAuth, (req, res) => {
    const { name, nim, generation, avatar } = req.body;
    if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.length > 120)) {
      return res.status(400).json({ error: 'Nama lengkap wajib diisi dan maksimal 120 karakter.' });
    }
    if (nim !== undefined && (typeof nim !== 'string' || !/^[a-zA-Z0-9._-]{3,32}$/.test(nim.trim()))) {
      return res.status(400).json({ error: 'Format NIM tidak valid.' });
    }
    if (generation !== undefined && (typeof generation !== 'string' || generation.trim().length > 16
      || (generation.trim() && !/^[0-9A-Za-z_-]{1,16}$/.test(generation.trim())))) {
      return res.status(400).json({ error: 'Angkatan tidak valid.' });
    }
    if (avatar !== undefined) {
      const assetId = typeof avatar === 'string' ? /^\/api\/site\/assets\/([a-f0-9-]{36})\/file$/.exec(avatar)?.[1] : null;
      const builtinAvatar = typeof avatar === 'string' && /^\/assets\/[a-zA-Z0-9_./-]+$/.test(avatar) && !avatar.split('/').includes('..');
      if (!builtinAvatar && !(assetId && db.assetExists(assetId, 'image'))) {
        return res.status(400).json({ error: 'Foto profil harus memakai aset gambar terdaftar.' });
      }
    }
    if (![name, nim, generation, avatar].some((value) => value !== undefined)) {
      return res.status(400).json({ error: 'Tidak ada perubahan profil yang dikirim.' });
    }

    const updated = db.updateUserProfile(req.user.account_id, {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(nim !== undefined ? { nim: nim.trim() } : {}),
      ...(generation !== undefined ? { generation: generation.trim() } : {}),
      ...(avatar !== undefined ? { avatar_silhouette: avatar } : {})
    }, req.user);
    if (!updated) return res.status(404).json({ error: 'Akun tidak ditemukan.' });
    if (updated.error) return res.status(409).json({ error: updated.error });

    if (updated.session_version !== req.user.session_version) {
      res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: isProduction, sameSite: 'strict', path: '/' });
    }
    res.json({ message: 'PROFIL DIPERBARUI', user: updated, reauthenticate: updated.session_version !== req.user.session_version });
  });

  app.post('/api/auth/profile/avatar', requireAuth, (req, res, next) => {
    assetUpload.single('avatar')(req, res, (error) => {
      if (!error) return next();
      res.status(error instanceof multer.MulterError ? 413 : 400).json({ error: error.message });
    });
  }, (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Pilih satu foto profil untuk diunggah.' });
    const buffer = fs.readFileSync(req.file.path);
    const detected = assetMagic(buffer);
    if (!detected || detected.kind !== 'image' || detected.mime !== req.file.mimetype) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Isi file tidak sesuai dengan tipe gambar yang diizinkan.' });
    }

    const id = randomUUID();
    const storedName = `${id}${detected.ext}`;
    const targetPath = path.join(ASSET_DIR, storedName);
    let asset = null;
    let profileUpdated = false;
    try {
      fs.renameSync(req.file.path, targetPath);
      asset = db.addAsset({
        stored_name: storedName,
        original_name: path.basename(req.file.originalname).slice(0, 160),
        mime_type: detected.mime,
        kind: 'image',
        size: req.file.size,
        sha256: createHash('sha256').update(buffer).digest('hex'),
        uploaded_by: req.user.nim
      });
      const avatarUrl = `/api/site/assets/${asset.id}/file`;
      const updated = db.updateUserProfile(req.user.account_id, { avatar_silhouette: avatarUrl }, req.user);
      if (!updated || updated.error) {
        db.deleteAsset(asset.id);
        if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
        return res.status(updated?.error ? 409 : 404).json({ error: updated?.error || 'Akun tidak ditemukan.' });
      }
      profileUpdated = true;
      auditAdminMutation(req, 'user.avatar_upload', 'user', updated.account_id, { assetId: asset.id, mime_type: asset.mime_type, size: asset.size });
      res.status(201).json({ message: 'FOTO PROFIL DIPERBARUI', user: updated, asset: { ...asset, url: avatarUrl } });
    } catch {
      if (asset && !profileUpdated) db.deleteAsset(asset.id);
      if (!profileUpdated && fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      res.status(500).json({ error: 'Foto profil tidak dapat disimpan.' });
    }
  });

  // PUT /api/auth/change-password
  // PUT /api/admin/users/:nim/reset-password (Emergency Password Reset by Superadmin)
  app.put('/api/admin/users/:nim/reset-password', requireSuperadmin, async (req, res) => {
    const { new_password, reason } = req.body;
    if (!new_password || typeof new_password !== 'string' || new_password.length < 12) {
      return res.status(400).json({ error: 'Password baru minimal 12 karakter.' });
    }

    const updated = db.resetUserPasswordAdmin(req.params.nim, new_password, {
      nim: req.user.nim,
      role: req.user.role
    });

    if (!updated) {
      return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
    }

    auditAdminMutation(req, 'admin.password_reset', 'user', req.params.nim, {
      reason: reason || 'Intervensi Bantuan Teknis Superadmin',
      reset_by: req.user.nim
    });

    res.json({
      message: `PASSWORD PENGGUNA ${req.params.nim} BERHASIL DIRESET OLEH SUPERADMIN`,
      user: updated
    });
  });

  // POST /api/admin/impersonate (Superadmin Mode Dampingi Pengguna)
  app.post('/api/admin/impersonate', requireSuperadmin, (req, res) => {
    const { target_nim, reason } = req.body;
    if (!target_nim) {
      return res.status(400).json({ error: 'NIM target wajib disertakan.' });
    }

    const targetUser = db.findUserByNIM(target_nim);
    if (!targetUser) {
      return res.status(404).json({ error: 'Target pengguna tidak ditemukan.' });
    }

    // Buat impersonation token yang membawa identitas target namun bertanda impersonated_by
    const impersonatedPayload = {
      account_id: targetUser.account_id,
      nim: targetUser.nim,
      name: targetUser.name,
      role: targetUser.role,
      clearance_level: targetUser.clearance_level,
      permissions: targetUser.permissions || [],
      division: targetUser.division,
      role_title: targetUser.role_title,
      membership_stage: targetUser.membership_stage,
      impersonated_by: req.user.nim, // Jejak admin asli
      is_impersonated: true
    };

    const impersonationToken = signSessionToken(impersonatedPayload);

    // Catat ke Audit Trail
    auditAdminMutation(req, 'admin.impersonate_start', 'user', target_nim, {
      reason: reason || 'Bantuan Teknis Langsung (Dampingi Sesi Pengguna)',
      admin_nim: req.user.nim
    });

    res.cookie(COOKIE_NAME, impersonationToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      path: '/'
    });

    res.json({
      message: `MODE DAMPINGI PENGGUNA DIAKTIFKAN // MELIHAT SEBAGAI ${targetUser.name} (${targetUser.nim})`,
      user: impersonatedPayload
    });
  });

  // POST /api/admin/stop-impersonate (Kembali ke Sesi Asli Superadmin)
  app.post('/api/admin/stop-impersonate', requireAuth, (req, res) => {
    if (!req.user.is_impersonated || !req.user.impersonated_by) {
      return res.status(400).json({ error: 'Sesi saat ini bukan sesi pendampingan/impersonasi.' });
    }

    const adminUser = db.findUserByNIM(req.user.impersonated_by);
    if (!adminUser || adminUser.role !== 'superadmin') {
      return res.status(403).json({ error: 'Akun asal superadmin tidak valid.' });
    }

    const adminPayload = {
      account_id: adminUser.account_id,
      nim: adminUser.nim,
      name: adminUser.name,
      role: adminUser.role,
      clearance_level: adminUser.clearance_level,
      permissions: adminUser.permissions || [],
      division: adminUser.division,
      role_title: adminUser.role_title
    };

    const adminToken = signSessionToken(adminPayload);

    auditAdminMutation(req, 'admin.impersonate_end', 'user', req.user.nim, {
      admin_nim: adminUser.nim
    });

    res.cookie(COOKIE_NAME, adminToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      path: '/'
    });

    res.json({
      message: 'SESI PENDAMPINGAN SELESAI // KEMBALI KE SUPERADMIN PRTS',
      user: adminPayload
    });
  });

  // GET /api/admin/audit-logs (Papan Jejak Audit Intervensi Sistem)
  app.get('/api/admin/audit-logs', requireSuperadmin, (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 200);
    const logs = db.getAuditLogs(limit);
    res.json({ logs });
  });

  app.put('/api/auth/change-password', requireClearance(1), async (req, res) => {
    const { old_password, new_password } = req.body;
    if (!old_password || typeof new_password !== 'string' || new_password.length < 12) {
      return res.status(400).json({ error: 'Password baru minimal 12 karakter.' });
    }

    const user = db.findUserByNIM(req.user.nim);
    if (!user) {
      return res.status(404).json({ error: 'User tidak ditemukan.' });
    }

    const match = await bcrypt.compare(old_password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Password lama tidak cocok.' });
    }

    const updated = await db.changePassword(req.user.nim, new_password);
    if (!updated) {
      return res.status(500).json({ error: 'Gagal mengubah password.' });
    }

    auditAdminMutation(req, 'user.password_change', 'user', req.user.nim, {});
    res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: isProduction, sameSite: 'strict', path: '/' });
    res.json({ message: 'PASSWORD BERHASIL DIUBAH // PRTS SECURITY UPDATED' });
  });


};
