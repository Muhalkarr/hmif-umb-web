/**
 * Web Push API Routes
 *
 * GET  /api/push/vapid-public-key   → kirim VAPID public key ke client untuk subscribe
 * POST /api/push/subscribe           → simpan PushSubscription dari browser
 * DELETE /api/push/subscribe         → hapus subscription (unsubscribe)
 * POST /api/push/test                → kirim test push ke user yang login (dev only)
 */

export const registerWebPushRoutes = (app, context) => {
  const { requireAuth, webPushService, isProduction } = context;

  // GET /api/push/vapid-public-key
  // Client butuh ini sebelum memanggil serviceWorkerRegistration.pushManager.subscribe()
  app.get('/api/push/vapid-public-key', (req, res) => {
    res.json({ publicKey: webPushService.getVapidPublicKey() });
  });

  // POST /api/push/subscribe
  // Body: { subscription: PushSubscriptionJSON }
  app.post('/api/push/subscribe', requireAuth, (req, res) => {
    const { subscription } = req.body || {};
    if (
      !subscription
      || typeof subscription.endpoint !== 'string'
      || !subscription.keys?.p256dh
      || !subscription.keys?.auth
    ) {
      return res.status(400).json({ error: 'Data subscription tidak valid.' });
    }

    webPushService.registerSubscription(req.user.account_id, subscription);
    res.status(201).json({ message: 'Subscription berhasil didaftarkan.' });
  });

  // DELETE /api/push/subscribe
  // Body: { endpoint: string }
  app.delete('/api/push/subscribe', requireAuth, (req, res) => {
    const { endpoint } = req.body || {};
    if (typeof endpoint !== 'string' || !endpoint) {
      return res.status(400).json({ error: 'Endpoint subscription wajib disertakan.' });
    }
    webPushService.removeSubscription(req.user.account_id, endpoint);
    res.json({ message: 'Subscription dihapus.' });
  });

  // POST /api/push/test  (hanya untuk development)
  app.post('/api/push/test', requireAuth, async (req, res) => {
    if (isProduction) return res.status(404).json({ error: 'Not found.' });

    const payload = {
      title: '🔔 PRTS Test Notification',
      body: `Halo ${req.user.name}! Push notification berfungsi dengan baik.`,
      icon: '/assets/images/prts-icon.png',
      badge: '/assets/images/prts-badge.png',
      url: '/'
    };

    try {
      await webPushService.sendToUser(req.user.account_id, payload);
      res.json({ message: 'Test push dikirim.' });
    } catch (err) {
      res.status(500).json({ error: 'Gagal mengirim test push.', detail: err.message });
    }
  });
};
