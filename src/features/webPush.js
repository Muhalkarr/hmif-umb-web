/**
 * Web Push Client
 *
 * Menyediakan:
 * - initWebPush()       : daftar service worker + subscribe push
 * - unsubscribePush()   : unsubscribe dari push
 * - isPushSupported()   : cek dukungan browser
 * - isPushSubscribed()  : cek apakah sudah subscribe
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
};

/**
 * Cek apakah browser mendukung Service Worker dan Push API.
 */
export const isPushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/**
 * Ambil VAPID public key dari server.
 */
const getVapidPublicKey = async () => {
  const res = await fetch(`${API_BASE}/api/push/vapid-public-key`, { credentials: 'include' });
  if (!res.ok) throw new Error('Gagal mengambil VAPID public key');
  const { publicKey } = await res.json();
  return publicKey;
};

/**
 * Inisialisasi Web Push:
 * 1. Daftar Service Worker
 * 2. Minta izin notifikasi
 * 3. Subscribe ke push manager
 * 4. Kirim subscription ke server
 *
 * @param {object} options
 * @param {function} [options.onGranted]  – callback saat izin diberikan
 * @param {function} [options.onDenied]   – callback saat izin ditolak
 * @param {function} [options.onError]    – callback saat error
 * @returns {Promise<PushSubscription|null>}
 */
export const initWebPush = async ({ onGranted, onDenied, onError } = {}) => {
  if (!isPushSupported()) {
    console.warn('[WebPush] Browser tidak mendukung Web Push.');
    return null;
  }

  try {
    // Daftar Service Worker
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;

    // Cek permission
    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }

    if (permission === 'denied') {
      onDenied?.();
      return null;
    }

    if (permission !== 'granted') return null;

    // Cek apakah sudah subscribe
    const existingSub = await registration.pushManager.getSubscription();
    if (existingSub) {
      onGranted?.(existingSub);
      return existingSub;
    }

    // Subscribe baru
    const vapidPublicKey = await getVapidPublicKey();
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
    });

    // Kirim ke server
    const res = await fetch(`${API_BASE}/api/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ subscription: subscription.toJSON() })
    });

    if (!res.ok) throw new Error('Gagal menyimpan subscription ke server.');

    onGranted?.(subscription);
    return subscription;

  } catch (err) {
    console.error('[WebPush] initWebPush error:', err);
    onError?.(err);
    return null;
  }
};

/**
 * Cek apakah user sudah berlangganan push notifications.
 * @returns {Promise<boolean>}
 */
export const isPushSubscribed = async () => {
  if (!isPushSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration('/');
    if (!registration) return false;
    const sub = await registration.pushManager.getSubscription();
    return Boolean(sub);
  } catch {
    return false;
  }
};

/**
 * Batalkan langganan push.
 * @returns {Promise<boolean>}
 */
export const unsubscribePush = async () => {
  if (!isPushSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration('/');
    if (!registration) return false;
    const sub = await registration.pushManager.getSubscription();
    if (!sub) return false;

    const endpoint = sub.endpoint;
    await sub.unsubscribe();

    // Beritahu server
    await fetch(`${API_BASE}/api/push/subscribe`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ endpoint })
    });

    return true;
  } catch (err) {
    console.error('[WebPush] unsubscribePush error:', err);
    return false;
  }
};

/**
 * Render tombol toggle notifikasi di elemen target.
 * @param {string} targetSelector – CSS selector untuk container tombol
 */
export const renderPushToggle = async (targetSelector) => {
  const container = document.querySelector(targetSelector);
  if (!container || !isPushSupported()) return;

  const subscribed = await isPushSubscribed();

  const btn = document.createElement('button');
  btn.id = 'btn-push-toggle';
  btn.className = `btn-push-toggle ${subscribed ? 'btn-push-toggle--active' : ''}`;
  btn.setAttribute('aria-label', subscribed ? 'Nonaktifkan notifikasi' : 'Aktifkan notifikasi');
  btn.innerHTML = subscribed
    ? '🔔 Notifikasi Aktif'
    : '🔕 Aktifkan Notifikasi';

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    if (await isPushSubscribed()) {
      await unsubscribePush();
      btn.textContent = '🔕 Aktifkan Notifikasi';
      btn.classList.remove('btn-push-toggle--active');
      btn.setAttribute('aria-label', 'Aktifkan notifikasi');
    } else {
      await initWebPush({
        onGranted: () => {
          btn.textContent = '🔔 Notifikasi Aktif';
          btn.classList.add('btn-push-toggle--active');
          btn.setAttribute('aria-label', 'Nonaktifkan notifikasi');
        },
        onDenied: () => {
          btn.textContent = '🚫 Izin Ditolak';
        }
      });
    }
    btn.disabled = false;
  });

  container.appendChild(btn);
};
