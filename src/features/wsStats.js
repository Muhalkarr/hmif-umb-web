/**
 * WebSocket Stats Client
 *
 * Menghubungkan ke /ws/stats dan menerima statistik real-time:
 * - onlineUsers    : jumlah user online
 * - taskStats      : { total, todo, in_progress, done, overdue }
 * - eventAttendance: jumlah hadir
 * - serverTime     : ISO timestamp
 *
 * Menyediakan:
 * - connectWsStats(accountId, handlers) : buka koneksi WS
 * - disconnectWsStats()                  : tutup koneksi
 */

const WS_BASE = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/^http/, 'ws')
  : 'ws://localhost:3001';

let socket = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 3000;

/**
 * @typedef {object} StatsHandlers
 * @property {function} [onStats]        - (stats) => void, dipanggil tiap update
 * @property {function} [onMutation]     - (mutation) => void, dipanggil tiap ada mutasi data real-time
 * @property {function} [onConnected]    - () => void
 * @property {function} [onDisconnected] - () => void
 * @property {function} [onError]        - (err) => void
 */

/**
 * Hubungkan ke WebSocket stats channel.
 * Auto-reconnect hingga MAX_RECONNECT_ATTEMPTS kali jika koneksi terputus.
 *
 * @param {string|null} accountId - account_id user yang login (optional, untuk targeting per-user)
 * @param {StatsHandlers} handlers
 */
export const connectWsStats = (accountId, handlers = {}) => {
  const { onStats, onMutation, onConnected, onDisconnected, onError } = handlers;

  if (socket && socket.readyState < 2) {
    // Sudah terhubung atau sedang menghubungkan
    return;
  }

  const url = accountId
    ? `${WS_BASE}/ws/stats?accountId=${encodeURIComponent(accountId)}`
    : `${WS_BASE}/ws/stats`;

  try {
    socket = new WebSocket(url);
  } catch (err) {
    onError?.(err);
    return;
  }

  socket.addEventListener('open', () => {
    reconnectAttempts = 0;
    clearTimeout(reconnectTimer);
    onConnected?.();
    console.debug('[WsStats] Terhubung ke PRTS Stats Channel');
  });

  socket.addEventListener('message', (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'mutation') {
        onMutation?.(data);
      } else {
        onStats?.(data);
      }
    } catch {
      // Abaikan pesan yang tidak valid
    }
  });

  socket.addEventListener('close', (event) => {
    onDisconnected?.();
    console.debug('[WsStats] Koneksi terputus:', event.code, event.reason);

    // Auto-reconnect jika bukan penutupan manual (code 1000)
    if (event.code !== 1000 && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      const delay = RECONNECT_DELAY_MS * reconnectAttempts;
      console.debug(`[WsStats] Mencoba reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) dalam ${delay}ms...`);
      reconnectTimer = setTimeout(() => {
        connectWsStats(accountId, handlers);
      }, delay);
    }
  });

  socket.addEventListener('error', (err) => {
    console.error('[WsStats] WebSocket error:', err);
    onError?.(err);
  });
};

/**
 * Tutup koneksi WebSocket secara manual (tanpa auto-reconnect).
 */
export const disconnectWsStats = () => {
  clearTimeout(reconnectTimer);
  reconnectAttempts = MAX_RECONNECT_ATTEMPTS; // Cegah auto-reconnect
  if (socket) {
    socket.close(1000, 'User navigated away');
    socket = null;
  }
};

/**
 * Render widget statistik real-time di elemen target.
 * Update otomatis setiap kali data baru diterima.
 *
 * @param {string} targetSelector - CSS selector container
 * @param {string|null} accountId
 */
export const renderStatsWidget = (targetSelector, accountId = null) => {
  const container = document.querySelector(targetSelector);
  if (!container) return;

  container.innerHTML = `
    <div class="stats-widget" role="status" aria-live="polite" aria-label="Statistik Real-time">
      <div class="stats-widget__header">
        <span class="stats-widget__dot stats-widget__dot--connecting"></span>
        <span class="stats-widget__title">PRTS Live Stats</span>
        <time class="stats-widget__time" id="stats-server-time">--:--:--</time>
      </div>
      <div class="stats-widget__grid">
        <div class="stats-widget__item">
          <span class="stats-widget__value" id="stat-online">—</span>
          <span class="stats-widget__label">Online</span>
        </div>
        <div class="stats-widget__item">
          <span class="stats-widget__value" id="stat-tasks-total">—</span>
          <span class="stats-widget__label">Tugas Total</span>
        </div>
        <div class="stats-widget__item stats-widget__item--warning">
          <span class="stats-widget__value" id="stat-tasks-overdue">—</span>
          <span class="stats-widget__label">Terlambat</span>
        </div>
        <div class="stats-widget__item">
          <span class="stats-widget__value" id="stat-attendance">—</span>
          <span class="stats-widget__label">Hadir Hari Ini</span>
        </div>
      </div>
    </div>
  `;

  const dot = container.querySelector('.stats-widget__dot');
  const update = (data) => {
    if (data.onlineUsers !== undefined) {
      const el = document.getElementById('stat-online');
      if (el) el.textContent = data.onlineUsers;
    }
    if (data.taskStats) {
      const total = document.getElementById('stat-tasks-total');
      const overdue = document.getElementById('stat-tasks-overdue');
      if (total) total.textContent = data.taskStats.total;
      if (overdue) overdue.textContent = data.taskStats.overdue;
    }
    if (data.eventAttendance !== undefined) {
      const el = document.getElementById('stat-attendance');
      if (el) el.textContent = data.eventAttendance;
    }
    if (data.serverTime) {
      const el = document.getElementById('stats-server-time');
      if (el) el.textContent = new Date(data.serverTime).toLocaleTimeString('id-ID');
    }
  };

  connectWsStats(accountId, {
    onConnected: () => {
      dot.className = 'stats-widget__dot stats-widget__dot--online';
      dot.title = 'Terhubung';
    },
    onDisconnected: () => {
      dot.className = 'stats-widget__dot stats-widget__dot--offline';
      dot.title = 'Terputus – mencoba sambung kembali...';
    },
    onStats: update
  });
};
