const noticeMessages = {
  investigating: 'Kami sedang memeriksa gangguan pada layanan. Hindari mengirim informasi sensitif melalui situs untuk sementara.',
  incident: 'Kami sedang menangani gangguan keamanan. Hindari mengirim data pribadi atau sensitif melalui situs. Ikuti pembaruan resmi.',
  recovering: 'Layanan sedang dipulihkan setelah gangguan. Beberapa fitur mungkin belum tersedia.'
};

const noticeStatuses = new Set(['normal', 'investigating', 'incident', 'recovering']);

export const registerSecurityNoticeRoutes = (app, { db, requireSuperadmin, auditAdminMutation }) => {
  app.get('/api/security/notice', (_req, res) => {
    const notice = db.getSecurityNotice();
    res.set('Cache-Control', 'no-store');
    res.json({
      status: notice.status,
      message: notice.message,
      updatedAt: notice.updatedAt
    });
  });

  app.put('/api/security/notice', requireSuperadmin, (req, res) => {
    const { status, message } = req.body || {};
    if (!noticeStatuses.has(status) || (message !== undefined && typeof message !== 'string')) {
      return res.status(400).json({ error: 'Status pengumuman keamanan tidak valid.' });
    }

    const safeMessage = status === 'normal'
      ? ''
      : (message?.trim() || noticeMessages[status]);
    if (safeMessage.length > 500) {
      return res.status(400).json({ error: 'Pesan pengumuman maksimal 500 karakter.' });
    }

    const notice = db.setSecurityNotice(status, safeMessage, req.user.nim);
    auditAdminMutation(req, 'security_notice.update', 'security_notice', 'public', {
      status,
      messageLength: safeMessage.length
    });
    res.set('Cache-Control', 'no-store');
    res.json({
      message: 'STATUS PENGUMUMAN KEAMANAN DIPERBARUI',
      notice: {
        status: notice.status,
        message: notice.message,
        updatedAt: notice.updatedAt
      }
    });
  });
};
