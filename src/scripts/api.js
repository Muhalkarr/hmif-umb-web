/* ==========================================================================
   HMIF UNIVERSITAS MAYASARI BAKTI - PRTS API CLIENT
   Frontend-to-Backend Communication Layer
   ========================================================================== */

const API_BASE = '/api';

class PRTSApiClient {
  constructor() {
    this.currentUser = null;
    this.onConnectionChange = null;
  }

  setOnConnectionChange(listener) {
    this.onConnectionChange = listener;
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

  async checkHealth() {
    return await this._request('GET', '/health');
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
        this.onConnectionChange?.(true);
        return { ok: false, status: res.status, error: data.error || 'Terjadi kesalahan pada server PRTS.' };
      }
      this.onConnectionChange?.(true);
      return { ok: true, status: res.status, data };
    } catch (err) {
      console.error(`[PRTS API ERROR] ${method} ${endpoint}:`, err);
      this.onConnectionChange?.(false, 'Koneksi ke PRTS Server gagal. Pastikan backend aktif di port 3001.');
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

  async getSsoStatus() {
    return this._request('GET', '/auth/sso/status');
  }

  async linkSsoAccount(payload) {
    const result = await this._request('POST', '/auth/sso/link', payload);
    if (result.ok && result.data.user) {
      this.currentUser = result.data.user;
    }
    return result;
  }

  async getLinkedSso() {
    return this._request('GET', '/auth/sso/linked');
  }

  async unlinkSso(provider = 'google') {
    return this._request('POST', '/auth/sso/unlink', { provider });
  }

  async register(userData) {
    return await this._request('POST', '/auth/register', userData);
  }

  async refreshProfile() {
    const result = await this._request('GET', '/auth/me');
    this.currentUser = result.ok && result.data.authenticated ? result.data.user : null;
    return result;
  }

  async updateAccountProfile(profile) {
    return this._request('PUT', '/auth/profile', profile);
  }

  async uploadAccountAvatar(file) {
    const formData = new FormData();
    formData.append('avatar', file);
    try {
      const response = await fetch(`${API_BASE}/auth/profile/avatar`, {
        method: 'POST',
        credentials: 'same-origin',
        body: formData
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) this.clearSession();
        this.onConnectionChange?.(true);
        return { ok: false, status: response.status, error: data.error || 'Foto profil tidak dapat diunggah.' };
      }
      this.currentUser = data.user || this.currentUser;
      this.onConnectionChange?.(true);
      return { ok: true, status: response.status, data };
    } catch {
      this.onConnectionChange?.(false, 'Koneksi upload foto profil gagal.');
      return { ok: false, status: 0, error: 'Koneksi upload foto profil gagal.' };
    }
  }

  async changePassword(oldPassword, newPassword) {
    return this._request('PUT', '/auth/change-password', {
      old_password: oldPassword,
      new_password: newPassword
    });
  }

  async getNotifications() {
    return this._request('GET', '/notifications');
  }

  async updateNotificationPreferences(preferences) {
    return this._request('PUT', '/notification-preferences', preferences);
  }

  async markNotificationRead(id) {
    return this._request('PUT', `/notifications/${encodeURIComponent(id)}/read`, {});
  }

  async markAllNotificationsRead() {
    return this._request('PUT', '/notifications/read-all', {});
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

  async getOrganizationTasks() {
    return this._request('GET', '/tasks');
  }

  async getOfficeLetters(filters = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
    });
    return this._request('GET', `/office/letters${params.toString() ? `?${params.toString()}` : ''}`);
  }

  async createOfficeLetter(letter) {
    return this._request('POST', '/office/letters', letter);
  }

  async approveOfficeLetter(id, payload) {
    return this._request('PUT', `/office/letters/${encodeURIComponent(id)}/approve`, payload);
  }

  async getTaskAssignees() {
    return this._request('GET', '/task-assignees');
  }

  async createOrganizationTask(task) {
    return this._request('POST', '/tasks', task);
  }

  async updateOrganizationTask(id, updates) {
    return this._request('PUT', `/tasks/${encodeURIComponent(id)}`, updates);
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

  async registerEvent(eventId, registration) {
    return this._request('POST', `/events/${encodeURIComponent(eventId)}/register`, registration);
  }

  async getMyEventTickets() {
    return this._request('GET', '/events/tickets/mine');
  }

  async checkInEvent(eventId, ticketId, ticketToken) {
    return this._request('POST', `/events/${encodeURIComponent(eventId)}/check-in`, {
      ticket_id: ticketId,
      ticket_token: ticketToken
    });
  }

  async issueEventCertificates(eventId) {
    return this._request('POST', `/events/${encodeURIComponent(eventId)}/certificates/issue`, {});
  }

  async verifyCertificate(certificateId) {
    return this._request('GET', `/certificates/${encodeURIComponent(certificateId)}`);
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

  async trackAspiration(id, trackingToken) {
    return await this._request('POST', `/aspirations/${encodeURIComponent(id)}/track`, {
      tracking_token: trackingToken
    });
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

  async addTransaction(txData, receiptFile = null) {
    if (!receiptFile) return await this._request('POST', '/ledger', txData);
    const formData = new FormData();
    Object.entries(txData).forEach(([key, value]) => formData.append(key, String(value ?? '')));
    formData.append('receipt', receiptFile);
    try {
      const response = await fetch(`${API_BASE}/ledger`, {
        method: 'POST',
        credentials: 'same-origin',
        body: formData
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) this.clearSession();
        this.onConnectionChange?.(true);
        return { ok: false, status: response.status, error: data.error || 'Transaksi tidak dapat disimpan.' };
      }
      this.onConnectionChange?.(true);
      return { ok: true, status: response.status, data };
    } catch (error) {
      console.error('[PRTS API ERROR] POST /ledger:', error);
      this.onConnectionChange?.(false, 'Koneksi upload bukti belanja gagal.');
      return { ok: false, status: 0, error: 'Koneksi upload bukti belanja gagal.' };
    }
  }

  // =========================================================================
  // 7. ADMIN (CLEARANCE 4) - USER MANAGEMENT
  // =========================================================================

  async getAllUsers() {
    return await this._request('GET', '/admin/users');
  }

  async getSystemStats() {
    return this._request('GET', '/admin/stats');
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

  async setAcademicCurator(nim, enabled) {
    return this._request('PUT', `/admin/users/${encodeURIComponent(nim)}/academic-curator`, { enabled });
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

  async getSoundtracks() {
    return this._request('GET', '/soundtracks');
  }

  async getShowcaseProjects() {
    return this._request('GET', '/showcase');
  }

  async getGithubProjectStats(projectId) {
    return this._request('GET', `/showcase/${encodeURIComponent(projectId)}/github`);
  }

  async getTechArticles() {
    return this._request('GET', '/tech-articles');
  }

  async getMyTechArticles() {
    return this._request('GET', '/tech-articles/mine');
  }

  async submitTechArticle(article) {
    return this._request('POST', '/tech-articles', article);
  }

  async resubmitTechArticle(id, article) {
    return this._request('PUT', `/tech-articles/${encodeURIComponent(id)}`, article);
  }

  async getPendingTechArticles() {
    return this._request('GET', '/admin/tech-articles/review');
  }

  async reviewTechArticle(id, status, note = '') {
    return this._request('PUT', `/admin/tech-articles/${encodeURIComponent(id)}/review`, { status, note });
  }

  async getProjectCalls() {
    return this._request('GET', '/project-calls');
  }

  async getMyProjectCalls() {
    return this._request('GET', '/project-calls/mine');
  }

  async createProjectCall(call) {
    return this._request('POST', '/project-calls', call);
  }

  async applyToProjectCall(id, application) {
    return this._request('POST', `/project-calls/${encodeURIComponent(id)}/applications`, application);
  }

  async updateProjectCallApplication(callId, applicationId, status) {
    return this._request('PUT', `/project-calls/${encodeURIComponent(callId)}/applications/${encodeURIComponent(applicationId)}`, { status });
  }

  async closeProjectCall(id) {
    return this._request('PUT', `/project-calls/${encodeURIComponent(id)}/close`, {});
  }

  async getPendingProjectCalls() {
    return this._request('GET', '/admin/project-calls/review');
  }

  async reviewProjectCall(id, status, note = '') {
    return this._request('PUT', `/admin/project-calls/${encodeURIComponent(id)}/review`, { status, note });
  }

  async getCareerDirectory(specialization = '') {
    const query = specialization ? `?specialization=${encodeURIComponent(specialization)}` : '';
    return this._request('GET', `/career${query}`);
  }

  async requestCareerMentorship(alumniId, request) {
    return this._request('POST', `/career/alumni/${encodeURIComponent(alumniId)}/mentorship-requests`, request);
  }

  async getMyCareerMentorshipRequests() {
    return this._request('GET', '/career/mentorship-requests/mine');
  }

  async getCareerMentorshipRequests() {
    return this._request('GET', '/admin/career/mentorship-requests');
  }

  async updateCareerMentorshipRequest(id, update) {
    return this._request('PUT', `/career/mentorship-requests/${encodeURIComponent(id)}`, update);
  }

  async getMyPortalRecords() {
    return this._request('GET', '/portal-records/mine');
  }

  async submitPortalRecord(kind, payload) {
    return this._request('POST', `/portal-records/${encodeURIComponent(kind)}`, payload);
  }

  async resubmitPortalRecord(kind, id, payload) {
    return this._request('PUT', `/portal-records/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`, payload);
  }

  async getAdminPortalRecords(kind) {
    return this._request('GET', `/admin/portal-records/${encodeURIComponent(kind)}`);
  }

  async createPortalRecord(kind, payload) {
    return this._request('POST', `/admin/portal-records/${encodeURIComponent(kind)}`, payload);
  }

  async updatePortalRecord(kind, id, updates) {
    return this._request('PUT', `/admin/portal-records/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`, updates);
  }

  async reviewPortalRecord(kind, id, action, note = '') {
    return this._request('PUT', `/admin/portal-records/${encodeURIComponent(kind)}/${encodeURIComponent(id)}/review`, { action, note });
  }

  async deletePortalRecord(kind, id) {
    return this._request('DELETE', `/admin/portal-records/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`);
  }

  async getAdminSoundtracks() {
    return this._request('GET', '/admin/soundtracks');
  }

  async addSoundtrackLink(title, url) {
    return this._request('POST', '/admin/soundtracks', { title, url });
  }

  async uploadSoundtrack(title, file) {
    const formData = new FormData();
    formData.append('title', title);
    formData.append('audio', file);
    try {
      const response = await fetch(`${API_BASE}/admin/soundtracks/upload`, {
        method: 'POST',
        credentials: 'same-origin',
        body: formData
      });
      const data = await response.json().catch(() => ({}));
      return response.ok
        ? { ok: true, status: response.status, data }
        : { ok: false, status: response.status, error: data.error || 'Soundtrack tidak dapat diunggah.' };
    } catch (error) {
      console.error('[PRTS API ERROR] POST /admin/soundtracks/upload:', error);
      return { ok: false, status: 0, error: 'Koneksi unggah soundtrack gagal.' };
    }
  }

  async updateSoundtrack(id, updates) {
    return this._request('PUT', `/admin/soundtracks/${encodeURIComponent(id)}`, updates);
  }

  async reorderSoundtracks(trackIds) {
    return this._request('POST', '/admin/soundtracks/reorder', { track_ids: trackIds });
  }

  async deleteSoundtrack(id) {
    return this._request('DELETE', `/admin/soundtracks/${encodeURIComponent(id)}`);
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

  async getKnowledgeFiles() {
    return this._request('GET', '/knowledge/files');
  }

  async uploadKnowledgeFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await fetch(`${API_BASE}/knowledge/files`, {
        method: 'POST',
        credentials: 'same-origin',
        body: formData
      });
      const data = await response.json().catch(() => ({}));
      return response.ok
        ? { ok: true, status: response.status, data }
        : { ok: false, status: response.status, error: data.error || 'Dokumen akademik tidak dapat diunggah.' };
    } catch {
      return { ok: false, status: 0, error: 'Koneksi upload dokumen akademik gagal.' };
    }
  }

  async deleteKnowledgeFile(id) {
    return this._request('DELETE', `/knowledge/files/${encodeURIComponent(id)}`);
  }

  async getKnowledgeDiscussions(resourceId) {
    return this._request('GET', `/knowledge/resources/${encodeURIComponent(resourceId)}/discussions`);
  }

  async submitKnowledgeDiscussion(resourceId, discussion) {
    return this._request('POST', `/knowledge/resources/${encodeURIComponent(resourceId)}/discussions`, discussion);
  }

  async selectKnowledgeSolution(id) {
    return this._request('PUT', `/admin/knowledge/discussions/${encodeURIComponent(id)}/solution`, {});
  }

  async getPendingKnowledgeDiscussions() {
    return this._request('GET', '/admin/knowledge/discussions');
  }

  async moderateKnowledgeDiscussion(id, status) {
    return this._request('PUT', `/admin/knowledge/discussions/${encodeURIComponent(id)}/moderation`, { status });
  }

  async getPublicAcademicResources() {
    return this._request('GET', '/academic/resources');
  }

  async getMyAcademicResources() {
    return this._request('GET', '/academic/resources/mine');
  }

  async createAcademicResource(resource) {
    return this._request('POST', '/academic/resources', resource);
  }

  async updateAcademicResource(id, resource) {
    return this._request('PUT', `/academic/resources/${encodeURIComponent(id)}`, resource);
  }

  async submitAcademicResource(id) {
    return this._request('POST', `/academic/resources/${encodeURIComponent(id)}/submit`, {});
  }

  async getPublicAcademicLearningPaths() {
    return this._request('GET', '/academic/learning-paths');
  }

  async getMyAcademicLearningPaths() {
    return this._request('GET', '/academic/learning-paths/mine');
  }

  async createAcademicLearningPath(learningPath) {
    return this._request('POST', '/academic/learning-paths', learningPath);
  }

  async updateAcademicLearningPath(id, learningPath) {
    return this._request('PUT', `/academic/learning-paths/${encodeURIComponent(id)}`, learningPath);
  }

  async submitAcademicLearningPath(id) {
    return this._request('POST', `/academic/learning-paths/${encodeURIComponent(id)}/submit`, {});
  }

  async getAcademicReviewQueue() {
    return this._request('GET', '/admin/academic/review');
  }

  async reviewAcademicContent(kind, id, status, note = '') {
    return this._request('PUT', `/admin/academic/${encodeURIComponent(kind)}/${encodeURIComponent(id)}/review`, { status, note });
  }

  async createTutoringRequest(request) {
    return this._request('POST', '/tutoring/requests', request);
  }

  async getMyTutoringRequests() {
    return this._request('GET', '/tutoring/requests/mine');
  }

  async getTutoringRequests() {
    return this._request('GET', '/tutoring/requests');
  }

  async getTutoringTutors() {
    return this._request('GET', '/tutoring/tutors');
  }

  async getMyTutorProfile() {
    return this._request('GET', '/tutoring/profile/mine');
  }

  async saveMyTutorProfile(profile) {
    return this._request('PUT', '/tutoring/profile/mine', profile);
  }

  async scheduleTutoringRequest(id, schedule) {
    return this._request('PUT', `/tutoring/requests/${encodeURIComponent(id)}/schedule`, schedule);
  }

  async setTutoringRequestStatus(id, status, adminNote = '') {
    return this._request('PUT', `/tutoring/requests/${encodeURIComponent(id)}/status`, { status, admin_note: adminNote });
  }

  async getInventoryAssets() {
    return this._request('GET', '/inventory/assets');
  }

  async createInventoryAsset(asset) {
    return this._request('POST', '/admin/inventory/assets', asset);
  }

  async requestInventoryLoan(loan) {
    return this._request('POST', '/inventory/loans', loan);
  }

  async getMyInventoryLoans() {
    return this._request('GET', '/inventory/loans/mine');
  }

  async getInventoryLoans() {
    return this._request('GET', '/admin/inventory/loans');
  }

  async updateInventoryLoan(id, status, conditionNote = '') {
    return this._request('PUT', `/admin/inventory/loans/${encodeURIComponent(id)}/status`, {
      status,
      condition_note: conditionNote
    });
  }

  async getAuditLog(limit = 100) {
    return this._request('GET', `/admin/audit?limit=${limit}`);
  }

  // =========================================================================
  // GOOGLE SSO OAUTH & LINKING
  // =========================================================================
  async getLinkedSso() {
    return this._request('GET', '/auth/sso/linked');
  }

  async linkSsoAccount(payload) {
    return this._request('POST', '/auth/sso/link', payload);
  }

  async unlinkSso(provider = 'google') {
    return this._request('POST', '/auth/sso/unlink', { provider });
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

  async submitAttendance(eventId, attendance) {
    return await this._request('POST', '/attendance', { event_id: eventId, ...attendance });
  }

  async createAttendanceSession(session) {
    return this._request('POST', '/attendance/sessions', session);
  }

  async getAttendanceRecords(eventId) {
    return await this._request('GET', `/attendance/${eventId}`);
  }

  // =========================================================================
  // 10. DELEGATIONS & RDP AGENDAS (Pasal 57 & 41 ART HMIF)
  // =========================================================================

  // =========================================================================
  // 11. SUPERADMIN INTERVENTION & AUDIT TRAIL
  // =========================================================================
  async resetUserPasswordAdmin(nim, newPassword, reason = '') {
    return await this._request('PUT', `/admin/users/${encodeURIComponent(nim)}/reset-password`, {
      new_password: newPassword,
      reason
    });
  }

  async impersonateUser(targetNim, reason = '') {
    return await this._request('POST', '/admin/impersonate', {
      target_nim: targetNim,
      reason
    });
  }

  async stopImpersonating() {
    return await this._request('POST', '/admin/stop-impersonate', {});
  }

  async getAuditLogs(limit = 100) {
    return await this._request('GET', `/admin/audit-logs?limit=${limit}`);
  }

  async getDelegations() {
    return await this._request('GET', '/delegations');
  }

  async createDelegation(data) {
    return await this._request('POST', '/delegations', data);
  }

  async updateDelegationStatus(id, data) {
    return await this._request('PUT', '/delegations/' + id + '/status', data);
  }

  async submitDelegationLpd(id, data) {
    return await this._request('POST', '/delegations/' + id + '/lpd', data);
  }

    async getPublicRdpAgendas() {
    return await this._request('GET', '/aspirations/rdp-agendas');
  }

  async setAspirationRdpAgenda(id, data) {
    return await this._request('PUT', '/aspirations/' + id + '/rdp-agenda', data);
  }
}

export const prtsApi = new PRTSApiClient();
