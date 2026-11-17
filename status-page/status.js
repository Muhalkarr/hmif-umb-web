const labels = {
  normal: 'Layanan berjalan normal',
  investigating: 'Gangguan sedang diperiksa',
  incident: 'Gangguan keamanan sedang ditangani',
  recovering: 'Layanan sedang dipulihkan'
};

const defaults = {
  normal: 'Tidak ada gangguan yang diumumkan saat ini.',
  investigating: 'Tim sedang memeriksa gangguan pada layanan.',
  incident: 'Tim sedang menangani gangguan keamanan. Hindari mengirim data pribadi atau sensitif melalui situs.',
  recovering: 'Layanan sedang dipulihkan. Beberapa fitur mungkin belum tersedia.'
};

const card = document.getElementById('status-card');
const label = document.getElementById('label');
const message = document.getElementById('message');
const updated = document.getElementById('updated');

const refresh = async () => {
  try {
    const response = await fetch(`./status.json?ts=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Status feed unavailable');
    const data = await response.json();
    if (!Object.hasOwn(labels, data.status)) throw new Error('Invalid status');
    card.dataset.status = data.status;
    label.textContent = labels[data.status];
    message.textContent = typeof data.message === 'string' && data.message.trim()
      ? data.message.slice(0, 500)
      : defaults[data.status];
    const timestamp = Date.parse(data.updatedAt);
    updated.textContent = Number.isFinite(timestamp)
      ? `Pembaruan terakhir: ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(timestamp)} WIB`
      : 'Waktu pembaruan tidak tersedia.';
  } catch {
    card.dataset.status = 'investigating';
    label.textContent = 'Status belum dapat dimuat';
    message.textContent = 'Periksa kembali halaman ini beberapa saat lagi dan ikuti kanal resmi HMIF.';
    updated.textContent = '';
  }
};

void refresh();
window.setInterval(() => void refresh(), 60_000);
