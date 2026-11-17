/** Member support tickets and restricted staff queue. */
export function registerSupportRoutes(app, { db, requireAuth, requireClearance, randomUUID, auditAdminMutation }) {
  const canManage = (user) => user.role === 'superadmin' || user.clearance_level >= 2;

  app.get('/api/support/tickets', requireAuth, (req, res) => {
    res.json({ tickets: db.listSupportTickets(canManage(req.user) ? null : req.user.account_id) });
  });

  app.post('/api/support/tickets', requireAuth, (req, res) => {
    const { subject, category, message } = req.body || {};
    if (typeof subject !== 'string' || !subject.trim() || subject.trim().length > 160) {
      return res.status(400).json({ error: 'Subjek tiket wajib diisi (maksimal 160 karakter).' });
    }
    if (!['akun', 'akademik', 'teknis', 'event', 'lainnya'].includes(category)) {
      return res.status(400).json({ error: 'Kategori tiket tidak valid.' });
    }
    if (typeof message !== 'string' || !message.trim() || message.trim().length > 2000) {
      return res.status(400).json({ error: 'Detail tiket wajib diisi (maksimal 2.000 karakter).' });
    }
    const result = db.createSupportTicket({
      id: randomUUID(),
      accountId: req.user.account_id,
      name: req.user.name,
      subject: subject.trim(),
      category,
      message: message.trim()
    });
    res.status(201).json(result);
  });

  app.get('/api/support/tickets/:id', requireAuth, (req, res) => {
    const result = db.getSupportTicket(req.params.id, canManage(req.user) ? null : req.user.account_id);
    if (!result) return res.status(404).json({ error: 'Tiket tidak ditemukan.' });
    res.json(result);
  });

  app.post('/api/support/tickets/:id/messages', requireAuth, (req, res) => {
    const isStaff = canManage(req.user);
    const existing = db.getSupportTicket(req.params.id, isStaff ? null : req.user.account_id);
    if (!existing) return res.status(404).json({ error: 'Tiket tidak ditemukan.' });
    const message = req.body?.message;
    if (typeof message !== 'string' || !message.trim() || message.trim().length > 2000) {
      return res.status(400).json({ error: 'Balasan wajib diisi (maksimal 2.000 karakter).' });
    }
    const updated = db.addSupportTicketMessage({
      id: req.params.id,
      accountId: req.user.account_id,
      authorName: req.user.name,
      message: message.trim(),
      isStaff
    });
    if (isStaff) auditAdminMutation(req, 'support.ticket_reply', 'support_ticket', req.params.id, {});
    res.status(201).json(updated);
  });

  app.put('/api/support/tickets/:id/status', requireClearance(2), (req, res) => {
    const { status } = req.body || {};
    if (!['open', 'in_progress', 'resolved'].includes(status)) {
      return res.status(400).json({ error: 'Status tiket tidak valid.' });
    }
    const result = db.updateSupportTicketStatus(req.params.id, status);
    if (!result) return res.status(404).json({ error: 'Tiket tidak ditemukan.' });
    auditAdminMutation(req, 'support.ticket_status', 'support_ticket', req.params.id, { status });
    res.json(result);
  });

  app.get('/api/support/reports', requireClearance(2), (_req, res) => {
    const tickets = db.listSupportTickets();
    res.json({
      total: tickets.length,
      by_status: Object.fromEntries(['open', 'in_progress', 'resolved'].map((status) => [
        status, tickets.filter((ticket) => ticket.status === status).length
      ])),
      by_category: Object.fromEntries(['akun', 'akademik', 'teknis', 'event', 'lainnya'].map((category) => [
        category, tickets.filter((ticket) => ticket.category === category).length
      ]))
    });
  });
}
