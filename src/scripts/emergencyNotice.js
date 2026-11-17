const statusPriority = {
  normal: 0,
  recovering: 1,
  investigating: 2,
  incident: 3
};

const statusLabels = {
  investigating: 'PEMERIKSAAN GANGGUAN',
  incident: 'INSIDEN KEAMANAN SEDANG DITANGANI',
  recovering: 'PEMULIHAN LAYANAN'
};

const defaultMessages = {
  investigating: 'Kami sedang memeriksa gangguan pada layanan. Hindari mengirim informasi sensitif melalui situs untuk sementara.',
  incident: 'Kami sedang menangani gangguan keamanan. Hindari mengirim data pribadi atau sensitif melalui situs. Ikuti pembaruan resmi.',
  recovering: 'Layanan sedang dipulihkan setelah gangguan. Beberapa fitur mungkin belum tersedia.'
};

export const normalizeSecurityNotice = (value) => {
  if (!value || !Object.hasOwn(statusPriority, value.status)) return null;
  return {
    status: value.status,
    message: value.status === 'normal'
      ? ''
      : (typeof value.message === 'string' && value.message.trim()
        ? value.message.trim().slice(0, 500)
        : defaultMessages[value.status]),
    updatedAt: typeof (value.updatedAt || value.updated_at) === 'string'
      ? value.updatedAt || value.updated_at
      : ''
  };
};

export const selectSecurityNotice = (...notices) => notices
  .map(normalizeSecurityNotice)
  .filter(Boolean)
  .reduce((selected, notice) => {
    if (!selected || statusPriority[notice.status] >= statusPriority[selected.status]) return notice;
    return selected;
  }, null);

const getSafePageUrl = (value) => {
  if (!value) return '';
  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(url.hostname)
      ? url.toString()
      : '';
  } catch {
    return '';
  }
};

const fetchJson = async (url, credentials = 'omit') => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      credentials,
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
};

export const initEmergencyNotice = () => {
  const banner = document.getElementById('security-incident-notice');
  if (!banner) return;

  const feedUrl = import.meta.env?.VITE_SECURITY_STATUS_FEED_URL || '';
  const pageUrl = getSafePageUrl(import.meta.env?.VITE_SECURITY_STATUS_PAGE_URL || '');
  const localUrl = `${window.location.origin}/api/security/notice`;
  const label = banner.querySelector('[data-security-notice-label]');
  const message = banner.querySelector('[data-security-notice-message]');
  const link = banner.querySelector('[data-security-notice-link]');

  const updateStickyOffset = () => {
    document.documentElement.style.setProperty(
      '--security-notice-height',
      banner.hidden ? '0px' : `${banner.getBoundingClientRect().height}px`
    );
  };

  const refresh = async () => {
    const [localPayload, externalPayload] = await Promise.all([
      fetchJson(localUrl, 'same-origin'),
      feedUrl ? fetchJson(feedUrl) : Promise.resolve(null)
    ]);
    const notice = selectSecurityNotice(localPayload, externalPayload);
    if (!notice || notice.status === 'normal') {
      banner.hidden = true;
      document.body.classList.remove('has-security-notice');
      updateStickyOffset();
      return;
    }

    banner.dataset.status = notice.status;
    label.textContent = statusLabels[notice.status];
    message.textContent = notice.message;
    link.hidden = !pageUrl;
    if (pageUrl) link.href = pageUrl;
    banner.hidden = false;
    document.body.classList.add('has-security-notice');
    updateStickyOffset();
  };

  void refresh();
  window.addEventListener('security-notice-updated', refresh);
  window.setInterval(() => void refresh(), 60_000);
  window.addEventListener('resize', updateStickyOffset);
};
