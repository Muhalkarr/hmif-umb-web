/**
 * Web Push Service (VAPID)
 * Mengelola subscription Web Push dan pengiriman notifikasi ke browser.
 * Gunakan web-push dengan VAPID keys yang di-generate otomatis bila belum ada.
 */

import webpush from 'web-push';

/**
 * Membuat dan menginisialisasi Web Push Service.
 * @param {object} db - Instance database
 * @returns {{ sendToUser, sendToAll, getVapidPublicKey, registerSubscription, removeSubscription }}
 */
export const createWebPushService = (db) => {
  // ─── VAPID Keys ────────────────────────────────────────────────────────────
  let vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  let vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

  if (!vapidPublicKey || !vapidPrivateKey) {
    const keys = webpush.generateVAPIDKeys();
    vapidPublicKey = keys.publicKey;
    vapidPrivateKey = keys.privateKey;
    console.warn('[WebPush] VAPID keys tidak ditemukan di env. Keys sementara di-generate:');
    console.warn(`[WebPush] VAPID_PUBLIC_KEY=${vapidPublicKey}`);
    console.warn(`[WebPush] VAPID_PRIVATE_KEY=${vapidPrivateKey}`);
    console.warn('[WebPush] Simpan keys di atas ke .env agar subscription tidak hilang saat restart!');
  }

  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_CONTACT_EMAIL || 'admin@hmif-umb.ac.id'}`,
    vapidPublicKey,
    vapidPrivateKey
  );

  // ─── Push Subscriptions (in-memory + SQLite) ───────────────────────────────
  /**
   * Simpan subscription ke database.
   * @param {string} accountId
   * @param {PushSubscription} subscription
   */
  const registerSubscription = (accountId, subscription) => {
    db.savePushSubscription(accountId, JSON.stringify(subscription));
  };

  /**
   * Hapus subscription dari database.
   * @param {string} accountId
   * @param {string} endpoint
   */
  const removeSubscription = (accountId, endpoint) => {
    db.deletePushSubscription(accountId, endpoint);
  };

  /**
   * Kirim Web Push ke satu user berdasarkan accountId.
   * @param {string} accountId
   * @param {object} payload - { title, body, icon?, badge?, url? }
   */
  const sendToUser = async (accountId, payload) => {
    const subscriptions = db.getPushSubscriptions(accountId);
    const results = await Promise.allSettled(
      subscriptions.map(async (row) => {
        try {
          const sub = JSON.parse(row.subscription_json);
          await webpush.sendNotification(sub, JSON.stringify(payload));
        } catch (err) {
          // Hapus subscription yang sudah tidak valid (410 Gone)
          if (err.statusCode === 410 || err.statusCode === 404) {
            const sub = JSON.parse(row.subscription_json);
            db.deletePushSubscription(accountId, sub.endpoint);
          }
          throw err;
        }
      })
    );
    return results;
  };

  /**
   * Broadcast push ke semua subscriber (misal: pengumuman global).
   * @param {object} payload
   */
  const sendToAll = async (payload) => {
    const subscriptions = db.getAllPushSubscriptions();
    const results = await Promise.allSettled(
      subscriptions.map(async (row) => {
        try {
          const sub = JSON.parse(row.subscription_json);
          await webpush.sendNotification(sub, JSON.stringify(payload));
        } catch (err) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            const sub = JSON.parse(row.subscription_json);
            db.deletePushSubscription(row.account_id, sub.endpoint);
          }
          throw err;
        }
      })
    );
    return results;
  };

  return {
    getVapidPublicKey: () => vapidPublicKey,
    registerSubscription,
    removeSubscription,
    sendToUser,
    sendToAll
  };
};
