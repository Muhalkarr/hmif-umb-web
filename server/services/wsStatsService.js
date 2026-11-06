/**
 * WebSocket Real-time Stats Service
 * Broadcast statistik dashboard secara real-time ke semua client yang terhubung.
 *
 * Statistik yang disiarkan:
 * - onlineUsers       : jumlah user sedang online (WS connection aktif)
 * - taskStats         : { total, todo, in_progress, done, overdue }
 * - eventAttendance   : jumlah peserta hadir di event aktif hari ini
 * - unreadNotifications: rata-rata notif belum dibaca (aggregated)
 * - serverTime        : timestamp server
 *
 * Event yang bisa dibroadcast:
 * - task:created, task:updated, task:deleted
 * - event:registered, event:checkin
 * - proker:created, proker:updated, proker:completed
 * - notification:created, notification:read
 * - resource:uploaded, resource:published
 */

import { WebSocketServer } from 'ws';

/**
 * Buat dan pasang WebSocket Stats Service ke HTTP server Express.
 * @param {import('http').Server} httpServer - server dari app.listen()
 * @param {object} db - instance database
 * @returns {{ broadcast, notifyUser, broadcastMutation, getOnlineCount }}
 */
export const createWsStatsService = (httpServer, db) => {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/stats' });

  // Map accountId → Set<WebSocket> agar bisa target per-user
  const userSockets = new Map();
  // Set semua socket aktif untuk broadcast
  const allSockets = new Set();

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const getOnlineCount = () => allSockets.size;

  const collectStats = () => {
    let taskStats = { total: 0, todo: 0, in_progress: 0, done: 0, overdue: 0 };
    let eventAttendance = 0;

    try {
      const tasks = db.getAllOrganizationTasks?.() || [];
      const today = new Date().toISOString().slice(0, 10);
      taskStats = tasks.reduce((acc, t) => {
        acc.total++;
        const status = t.status || 'todo';
        if (acc[status] !== undefined) acc[status]++;
        if (t.due_date && t.due_date < today && status !== 'done') acc.overdue++;
        return acc;
      }, { total: 0, todo: 0, in_progress: 0, done: 0, overdue: 0 });
    } catch { /* tabel mungkin belum ada */ }

    try {
      const attendances = db.getTodayAttendanceCount?.() || 0;
      eventAttendance = typeof attendances === 'number' ? attendances : 0;
    } catch { /* tabel mungkin belum ada */ }

    return {
      type: 'stats',
      onlineUsers: getOnlineCount(),
      taskStats,
      eventAttendance,
      serverTime: new Date().toISOString()
    };
  };

  /**
   * Kirim pesan JSON ke semua WebSocket yang terhubung.
   */
  const broadcast = (data) => {
    const message = JSON.stringify(data);
    for (const ws of allSockets) {
      if (ws.readyState === ws.OPEN) ws.send(message);
    }
  };

  /**
   * Broadcast event mutasi data dengan konteks clearance-aware.
   * Dipanggil setelah repository mutation selesai untuk memberi tahu client.
   *
   * Event types yang didukung:
   * - task:created, task:updated, task:deleted
   * - event:registered, event:checkin
   * - proker:created, proker:updated, proker:completed
   * - notification:created, notification:read
   * - resource:uploaded, resource:published
   * - user:profile_updated, user:role_changed
   *
   * @param {object} options
   * @param {string} options.eventType - tipe event (required)
   * @param {string} options.accountId - account ID target (jika null = broadcast ke semua)
   * @param {object} options.payload - data payload untuk client
   * @param {object} options.beforeState - state sebelum mutation (opsional, untuk audit)
   * @param {object} options.afterState - state sesudah mutation (opsional, untuk audit)
   */
  const broadcastMutation = ({ eventType, accountId = null, payload, beforeState, afterState }) => {
    const message = JSON.stringify({
      type: 'mutation',
      eventType,
      accountId,
      payload,
      ...(beforeState !== undefined && { beforeState }),
      ...(afterState !== undefined && { afterState })
    });

    // Jika accountId ditentukan, hanya kirim ke user tersebut
    if (accountId) {
      const sockets = userSockets.get(accountId);
      if (sockets) {
        for (const ws of sockets) {
          if (ws.readyState === ws.OPEN) ws.send(message);
        }
      }
    } else {
      // Broadcast ke semua socket aktif
      for (const ws of allSockets) {
        if (ws.readyState === ws.OPEN) ws.send(message);
      }
    }
  };

  /**
   * Kirim pesan khusus ke satu user berdasarkan accountId.
   */
  const notifyUser = (accountId, data) => {
    const sockets = userSockets.get(accountId);
    if (!sockets) return;
    const message = JSON.stringify(data);
    for (const ws of sockets) {
      if (ws.readyState === ws.OPEN) ws.send(message);
    }
  };

  // ─── Broadcast periodik (setiap 5 detik) ──────────────────────────────────
  const statsInterval = setInterval(() => {
    if (allSockets.size > 0) broadcast(collectStats());
  }, 5000);

  // ─── Connection handler ────────────────────────────────────────────────────
  wss.on('connection', (ws, req) => {
    allSockets.add(ws);

    // Ekstrak accountId dari query string ?accountId=xxx
    const url = new URL(req.url, 'http://localhost');
    const accountId = url.searchParams.get('accountId') || null;

    if (accountId) {
      if (!userSockets.has(accountId)) userSockets.set(accountId, new Set());
      userSockets.get(accountId).add(ws);
    }

    // Kirim stats awal segera setelah connect
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        type: 'connected',
        message: 'PRTS STATS CHANNEL ONLINE',
        ...collectStats()
      }));
    }

    // Broadcast update online count ke semua
    broadcast({ type: 'onlineUsers', onlineUsers: getOnlineCount() });

    ws.on('close', () => {
      allSockets.delete(ws);
      if (accountId) {
        const sockets = userSockets.get(accountId);
        if (sockets) {
          sockets.delete(ws);
          if (sockets.size === 0) userSockets.delete(accountId);
        }
      }
      broadcast({ type: 'onlineUsers', onlineUsers: getOnlineCount() });
    });

    ws.on('error', (err) => {
      console.error('[WsStats] WebSocket error:', err.message);
    });
  });

  const close = () => {
    clearInterval(statsInterval);
    for (const ws of allSockets) {
      try { ws.close(); } catch {}
    }
    allSockets.clear();
    userSockets.clear();
    wss.close();
  };

  // Bersihkan interval saat server ditutup
  wss.on('close', () => clearInterval(statsInterval));

  console.log('[WsStats] WebSocket Stats Service aktif di /ws/stats');
  return { broadcast, getOnlineCount, notifyUser, broadcastMutation, close };
};
