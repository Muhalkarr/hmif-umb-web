/**
 * PRTS SSO Client Engine – Google OAuth 2.0 & Development Simulation
 *
 * Mengelola interaksi frontend untuk autentikasi Google SSO:
 * - initSso(): Menampilkan tombol tactical SSO di form login
 * - handleSsoReturn(): Mendeteksi kembalian redirect dari Google (sukses, error, link account)
 * - renderLinkAccountDialog(): Dialog penautan akun Google ke NIM HMIF
 * - renderMockSelectorDialog(): Dialog simulasi dev untuk pengujian lokal instan
 */

const API_BASE = '/api';

/**
 * Inisialisasi tombol SSO di dalam container yang ditentukan.
 * @param {HTMLElement} container - Elemen container tombol SSO di modal login
 * @param {object} options - Opsi callback & instance API
 */
export const initSso = async (container, options = {}) => {
  if (!container) return;

  try {
    const res = await fetch(`${API_BASE}/auth/sso/status`, { credentials: 'include' });
    if (!res.ok) return;

    const data = await res.json();
    if (!data.google) return;

    container.innerHTML = `
      <div class="sso-divider" role="separator" aria-label="Metode Autentikasi Alternatif">
        <span>// ATAU AUTENTIKASI ALTERNATIF //</span>
      </div>
      <button id="btn-sso-google" type="button" class="btn-sso btn-sso--google" aria-label="Masuk dengan Akun Google">
        <svg class="sso-google-icon" width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        </svg>
        <span class="sso-btn-label">MASUK DENGAN GOOGLE</span>
        ${data.dev_mock ? '<span class="sso-badge-dev" title="Mode simulasi lokal aktif">DEV SIMULATOR</span>' : ''}
      </button>
    `;

    const btn = container.querySelector('#btn-sso-google');
    if (btn) {
      btn.addEventListener('click', () => {
        sessionStorage.setItem('prts_sso_return_hash', window.location.hash || '#workspace/home');

        // Jika dev mock aktif, beri pilihan mock selector dialog atau direct mock
        if (data.dev_mock && typeof options.onOpenDevMock === 'function') {
          options.onOpenDevMock();
          return;
        }

        window.location.href = `${API_BASE}/auth/sso/google`;
      });
    }
  } catch (err) {
    console.debug('[PRTS SSO] SSO status check skipped:', err.message);
  }
};

/**
 * Memeriksa parameter URL kembalian setelah proses SSO.
 * @returns {object|null} Payload status kembalian SSO
 */
export const inspectSsoReturn = () => {
  const url = new URL(window.location.href);
  const params = url.searchParams;

  const isSuccess = params.get('sso_success') === '1';
  const isSelectMock = params.get('sso_select_mock') === '1';
  const isError = params.get('sso_error') === '1';
  const reason = params.get('reason');
  const prefillRaw = params.get('prefill');

  if (!isSuccess && !isError && !isSelectMock) return null;

  let prefill = null;
  if (prefillRaw) {
    try {
      prefill = JSON.parse(atob(prefillRaw.replace(/-/g, '+').replace(/_/g, '/')));
    } catch (e) {
      console.warn('[PRTS SSO] Gagal mendekode prefill data:', e);
    }
  }

  // Bersihkan parameter query dari URL address bar tanpa reload
  url.searchParams.delete('sso_success');
  url.searchParams.delete('sso_select_mock');
  url.searchParams.delete('sso_error');
  url.searchParams.delete('reason');
  url.searchParams.delete('prefill');
  window.history.replaceState({}, document.title, url.toString());

  if (isSuccess) {
    return { type: 'success' };
  }

  if (isSelectMock) {
    return { type: 'select_mock' };
  }

  if (isError) {
    const errorMap = {
      user_not_found: 'Akun Google Anda terverifikasi, tetapi belum ditautkan ke akun mahasiswa HMIF UMB.',
      invalid_state: 'Sesi permintaan SSO kedaluwarsa atau tidak valid. Silakan ulangi.',
      token_exchange_failed: 'Gagal bertukar token autentikasi dengan Google.',
      userinfo_failed: 'Gagal mengunduh profil Google pengguna.',
      not_configured: 'Google SSO belum dikonfigurasi di server.',
      server_error: 'Terjadi kendala internal server saat memproses login Google.'
    };

    return {
      type: 'error',
      reason: reason || 'unknown',
      message: errorMap[reason] || `Autentikasi Google gagal (${reason || 'unknown'}).`,
      prefill
    };
  }

  return null;
};
