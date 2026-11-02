/* ==========================================================================
   HMIF UNIVERSITAS MAYASARI BAKTI - PRTS API CLIENT
   Frontend-to-Backend Communication Layer
   ========================================================================== */

const API_BASE = '/api';

class PRTSApiClient {
  constructor() {
    this.currentUser = null;
  }

  clearSession() {
    this.currentUser = null;
  }

  get isAuthenticated() {
    return !!this.currentUser;
  }

  get isSuperadmin() {
    return this.currentUser?.role === 'superadmin';
  }

  get clearanceLevel() {
    return this.currentUser ? this.currentUser.clearance_level : 0;
  }

  get userDisplayName() {
    return this.currentUser ? this.currentUser.name : 'Tamu Publik';
  }

  get userRoleTitle() {
    return this.currentUser ? this.currentUser.role_title : 'Public Guest';
  }

  async _request(method, endpoint, body = null) {
    const headers = { Accept: 'application/json' };
    const opts = { method, headers, credentials: 'same-origin' };
    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, opts);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 401 && endpoint !== '/auth/me') this.clearSession();
        return { ok: false, status: res.status, error: data.error || 'Terjadi kesalahan pada server PRTS.' };
      }
      return { ok: true, status: res.status, data };
    } catch (err) {
      console.error(`[PRTS API ERROR] ${method} ${endpoint}:`, err);
      return { ok: false, status: 0, error: 'Koneksi ke PRTS Server gagal. Pastikan backend aktif di port 3001.' };
    }
  }

  // =========================================================================
  // 1. AUTHENTICATION & CLEARANCE (PILAR 1)
  // =========================================================================

  async login(nim, password) {
    const result = await this._request('POST', '/auth/login', { nim, password });
    if (result.ok) {
      this.currentUser = result.data.user;
    }
    return result;
  }

  async register(userData) {
    return await this._request('POST', '/auth/register', userData);
  }

  async refreshProfile() {
    const result = await this._request('GET', '/auth/me');
    this.currentUser = result.ok && result.data.authenticated ? result.data.user : null;
    return result;
  }

  async changePassword(oldPassword, newPassword) {
    return this._request('PUT', '/auth/change-password', {
      old_password: oldPassword,
      new_password: newPassword
    });
  }

  async logout() {
    const result = await this._request('POST', '/auth/logout');
    if (result.ok) this.clearSession();
    return result;
  }

  // =========================================================================
  // 2. CADETS MANAGEMENT (PILAR 4: KADERISASI)
  // =========================================================================

  async getCadets() {
    return await this._request('GET', '/cadets');
  }

  async promoteCadet(nim, stage, clearanceLevel) {
    return await this._request('PUT', `/cadets/${nim}/stage`, {
      stage,
      clearance_level: clearanceLevel
    });
  }

  async saveQuizEvaluation(evalData) {
    return await this._request('POST', '/cadet/quiz-eval', evalData);
  }

  // =========================================================================
  // 3. PROGRAM KERJA / MISSIONS (PILAR 5: TRANSPARANSI)
  // =========================================================================

  async getProkerList() {
    return await this._request('GET', '/proker');
  }

  async createProker(prokerData) {
    return await this._request('POST', '/proker', prokerData);
  }

  async updateProker(id, updates) {
    return await this._request('PUT', `/proker/${id}`, updates);
  }

  async getLPJSummary() {
    return await this._request('GET', '/proker/lpj-summary');
  }

  // =========================================================================
  // 4. CALENDAR & CHRONO-SYNC (PILAR 3)
  // =========================================================================

  async getCalendarEvents() {
    return await this._request('GET', '/calendar');
  }

  async createCalendarEvent(eventData) {
    return await this._request('POST', '/calendar', eventData);
  }

  async checkClashes() {
    return await this._request('GET', '/calendar/clash-check');
  }

  getICSExportUrl() {
    return `${API_BASE}/calendar/export-ics`;
  }

  // =========================================================================
  // 5. ASPIRASI & COMM-LINK
  // =========================================================================

  async getAspirations() {
    return await this._request('GET', '/aspirations');
  }

  async submitAspiration(aspirationData) {
    return await this._request('POST', '/aspirations', aspirationData);
  }

  async respondAspiration(id, response, status) {
    return await this._request('PUT', `/aspirations/${id}/respond`, {
      response,
      status
    });
  }

  // =========================================================================
  // 6. FINANCIAL LEDGER (PILAR 5: BENDAHARA)
  // =========================================================================

  async getFinancialLedger() {
    return await this._request('GET', '/ledger');
  }

  async addTransaction(txData) {
    return await this._request('POST', '/ledger', txData);
  }

  // =========================================================================
  // 7. ADMIN (CLEARANCE 4) - USER MANAGEMENT
  // =========================================================================

  async getAllUsers() {
    return await this._request('GET', '/admin/users');
  }

  async createUser(userData) {
    return await this._request('POST', '/admin/users', userData);
  }

  async updateUserRole(nim, updates) {
    return await this._request('PUT', `/admin/users/${nim}`, updates);
  }

  async setUserRole(nim, role) {
    return await this._request('PUT', `/admin/users/${nim}/role`, { role });
  }

  async deleteUser(nim) {
    return await this._request('DELETE', `/admin/users/${nim}`);
  }

  async getSystemBackup() {
    return await this._request('GET', '/admin/backup');
  }

  async getSiteConfig({ preview = false } = {}) {
    return this._request('GET', `/site/config${preview ? '?preview=draft' : ''}`);
  }

  async saveSiteDraft(config, expectedRevisionId) {
    return this._request('PUT', '/site/draft', { config, expected_revision_id: expectedRevisionId });
  }

  async validateSiteConfig(config) {
    return this._request('POST', '/site/validate', { config });
  }

  async publishSiteDraft() {
    return this._request('POST', '/site/publish', {});
  }

  async getSiteRevisions() {
    return this._request('GET', '/site/revisions');
  }

  async restoreSiteRevision(id, expectedRevisionId) {
    return this._request('POST', `/site/revisions/${id}/restore`, { expected_revision_id: expectedRevisionId });
  }

  async getSiteAssets() {
    return this._request('GET', '/site/assets');
  }

  async uploadSiteAsset(file) {
    const formData = new FormData();
    formData.append('asset', file);
    try {
      const response = await fetch('/api/site/assets', {
        method: 'POST',
        credentials: 'same-origin',
        body: formData
      });
      const data = await response.json().catch(() => ({}));
      return response.ok
        ? { ok: true, status: response.status, data }
        : { ok: false, status: response.status, error: data.error || 'Aset tidak dapat diunggah.' };
    } catch {
      return { ok: false, status: 0, error: 'Koneksi upload aset gagal.' };
    }
  }

  async deleteSiteAsset(id) {
    return this._request('DELETE', `/site/assets/${id}`);
  }

  async getAuditLog(limit = 100) {
    return this._request('GET', `/admin/audit?limit=${limit}`);
  }

  // =========================================================================
  // 8. KTA DIGITAL & QR-CODE
  // =========================================================================

  async getKTAData(nim) {
    return await this._request('GET', `/cadets/${nim || this.currentUser?.nim}/kta`);
  }

  // =========================================================================
  // 9. ATTENDANCE / PRESENSI
  // =========================================================================

  async submitAttendance(eventId, nim) {
    return await this._request('POST', '/attendance', { event_id: eventId, nim });
  }

  async getAttendanceRecords(eventId) {
    return await this._request('GET', `/attendance/${eventId}`);
  }
}

export const prtsApi = new PRTSApiClient();
