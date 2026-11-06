export const renderConnectionStatus = (online = true, message = null) => {
  const badge = document.getElementById('prts-status-badge');
  const text = document.getElementById('prts-status-text');
  if (!badge || !text) return;

  const sidebarStatus = document.getElementById('sidebar-status-text');
  if (sidebarStatus) sidebarStatus.textContent = online ? 'SYSTEM: ONLINE' : 'SYSTEM: OFFLINE';
  document.querySelector('.sidebar-status')?.classList.toggle('offline', !online);
  badge.classList.toggle('offline', !online);
  badge.setAttribute('title', online
    ? 'Koneksi ke PRTS API Server terhubung (Port 3001).'
    : 'Koneksi ke PRTS API Server terputus! Pastikan backend aktif (jalankan "npm run dev:api" di terminal).');
  text.textContent = message || (online ? 'SYSTEM: ONLINE' : 'SYSTEM: OFFLINE / DISCONNECTED');
};
