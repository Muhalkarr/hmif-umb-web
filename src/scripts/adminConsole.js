import QRCode from 'qrcode';
import { getOrganizationTaskMetrics } from './organizationMetrics.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[character]));

const formatDate = (value) => value ? new Date(value).toLocaleDateString('id-ID') : '-';
const getJakartaCalendarDate = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const date = Object.fromEntries(parts.filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, value]));
  return `${date.year}-${date.month}-${date.day}`;
};

export class AdminConsole {
  constructor(api, { openModal, closeModal, getContainer, refreshData }) {
    this.api = api;
    this.openModal = openModal;
    this.getContainer = getContainer;
    this.closeModal = () => {
      this.stopAllScanners();
      closeModal();
    };
    this.refreshData = refreshData;
    this.proker = [];
    this.tasks = [];
    this.taskAssignees = [];
    this.officeLetters = [];
    this.activeScanners = new Map();
  }

  async open() {
    if (!this.api.isSuperadmin && this.api.clearanceLevel < 2) return;

    const title = document.getElementById('prts-modal-title');
    const body = this.getContainer?.() || document.getElementById('prts-modal-content');
    if (!body || (!this.getContainer && !title)) return;

    if (!this.getContainer) title.textContent = 'PRTS // ADMIN CONSOLE';
    body.innerHTML = '<p class="auth-feedback" role="status">Memuat data dan izin akses...</p>';
    if (!this.getContainer) this.openModal();

    const requests = [
      this.api.getProkerList(),
      this.api.getOrganizationTasks(),
      this.api.getCalendarEvents(),
      this.api.getOfficeLetters(),
      this.api.getTutoringRequests(),
      this.api.getTutoringTutors(),
      this.api.getTaskAssignees()
    ];
    const hasCareerManagementAccess = this.api.isSuperadmin || this.api.clearanceLevel >= 2;
    if (hasCareerManagementAccess) requests.push(this.api.getCareerMentorshipRequests());
    const hasBphAccess = this.api.isSuperadmin || this.api.clearanceLevel >= 3;
    const hasKnowledgeModerationAccess = this.api.isSuperadmin || this.api.clearanceLevel >= 2;
    const portfolioUser = this.api.currentUser;
    const hasPortfolioReviewAccess = this.api.isSuperadmin
      || portfolioUser?.permissions?.includes('academic_curate')
      || portfolioUser?.permissions?.includes('portfolio_review')
      || (this.api.clearanceLevel >= 2 && /iptek|riset|research|litbang/i.test(`${portfolioUser?.division || ''} ${portfolioUser?.role_title || ''}`));
    if (hasBphAccess) requests.push(this.api.getAspirations(), this.api.getFinancialLedger());
    if (hasKnowledgeModerationAccess) requests.push(
      this.api.getPendingKnowledgeDiscussions()
    );
    if (hasPortfolioReviewAccess) requests.push(
      this.api.getPendingTechArticles(),
      this.api.getPendingProjectCalls()
    );
    if (this.api.isSuperadmin) requests.push(this.api.getAllUsers(), this.api.getAuditLogs(50).catch(() => ({ ok: true, data: { logs: [] } })));
    requests.push(this.api.getDelegations().catch(() => ({ ok: true, data: [] })));
    const results = await Promise.all(requests);
    let index = 0;
    const prokerResult = results[index++];
    const tasksResult = results[index++];
    const calendarResult = results[index++];
    const officeLettersResult = results[index++];
    const tutoringRequestsResult = results[index++];
    const tutoringTutorsResult = results[index++];
    const taskAssigneesResult = results[index++];
    const careerMentorshipResult = hasCareerManagementAccess ? results[index++] : null;
    const aspirationsResult = hasBphAccess ? results[index++] : null;
    const ledgerResult = hasBphAccess ? results[index++] : null;
    const knowledgeDiscussionsResult = hasKnowledgeModerationAccess ? results[index++] : null;
    const techArticlesResult = hasPortfolioReviewAccess ? results[index++] : null;
    const projectCallsResult = hasPortfolioReviewAccess ? results[index++] : null;
    const usersResult = this.api.isSuperadmin ? results[index++] : null;
    const auditLogsResult = this.api.isSuperadmin ? results[index++] : null;
    const delegationsResult = results[results.length - 1];

    this.proker = prokerResult.ok && Array.isArray(prokerResult.data) ? prokerResult.data : [];
    this.tasks = tasksResult.ok && Array.isArray(tasksResult.data?.tasks) ? tasksResult.data.tasks : [];
    this.taskAssignees = taskAssigneesResult.ok && Array.isArray(taskAssigneesResult.data?.users) ? taskAssigneesResult.data.users : [];
    this.officeLetters = officeLettersResult.ok && Array.isArray(officeLettersResult.data?.letters) ? officeLettersResult.data.letters : [];
    const calendar = calendarResult.ok && Array.isArray(calendarResult.data) ? calendarResult.data : [];
    const errors = results.filter((result) => !result.ok).map((result) => result.error);

    body.innerHTML = `
      <p class="auth-feedback" role="status">${errors.map(escapeHtml).join('<br>')}</p>
      ${this.renderTaskBoard()}
      ${hasPortfolioReviewAccess ? this.renderPortfolioReviewQueue(techArticlesResult, projectCallsResult) : ''}
      ${hasCareerManagementAccess ? this.renderCareerMentorshipQueue(careerMentorshipResult) : ''}
      ${this.renderOfficeDocuments()}
      <section class="admin-section">
        <h3>PROGRAM KERJA</h3>
        <div class="admin-record-list">${this.renderProkerList()}</div>
        <form id="admin-proker-form" class="admin-form">
          <input type="hidden" name="id" />
          <label class="form-label" for="admin-proker-title">NAMA PROGRAM</label>
          <input class="form-input" id="admin-proker-title" name="title" maxlength="180" required />
          <div class="admin-form-grid">
            <label class="form-group"><span class="form-label">DIVISI</span><input class="form-input" name="division" maxlength="80" required /></label>
            <label class="form-group"><span class="form-label">KATEGORI</span><input class="form-input" name="category" maxlength="80" /></label>
            <label class="form-group"><span class="form-label">STATUS</span><select class="form-select" name="status"><option value="upcoming">Rencana</option><option value="active">Berjalan</option><option value="completed">Selesai</option></select></label>
            <label class="form-group"><span class="form-label">MULAI</span><input class="form-input" name="date_start" type="date" required /></label>
            <label class="form-group"><span class="form-label">SELESAI</span><input class="form-input" name="date_end" type="date" required /></label>
            <label class="form-group"><span class="form-label">ANGGARAN</span><input class="form-input" name="budget_allocated" type="number" min="0" step="1000" /></label>
          </div>
          <label class="form-label" for="admin-proker-target">SASARAN</label>
          <input class="form-input" id="admin-proker-target" name="target_participants" maxlength="240" />
          <label class="form-label" for="admin-proker-kpi">INDIKATOR</label>
          <input class="form-input" id="admin-proker-kpi" name="kpi_indicator" maxlength="500" />
          <label class="form-label" for="admin-proker-notes">CATATAN</label>
          <textarea class="form-textarea" id="admin-proker-notes" name="lpj_notes" maxlength="3000"></textarea>
          <p class="auth-feedback" data-form-feedback="proker" role="status"></p>
          <button class="btn-tactical primary" type="submit">SIMPAN PROGRAM</button>
          <button class="btn-tactical" type="reset">BERSIHKAN FORM</button>
        </form>
      </section>
      <section class="admin-section">
        <h3>KALENDER KEGIATAN</h3>
        <div class="admin-record-list">${calendar.map((event) => `<p>${escapeHtml(event.date_str)} // ${escapeHtml(event.type).toUpperCase()} // ${escapeHtml(event.title)} // ${escapeHtml(event.division)}${event.registration_url ? ` // <a href="${escapeHtml(event.registration_url)}" target="_blank" rel="noopener noreferrer">PENDAFTARAN ↗</a>` : ''}</p>`).join('')}</div>
        <form id="admin-calendar-form" class="admin-form">
          <div class="admin-form-grid">
            <label class="form-group"><span class="form-label">TANGGAL / TENGGAT</span><input class="form-input" name="date_str" type="date" required /></label>
            <label class="form-group"><span class="form-label">JENIS</span><select class="form-select" name="type"><option value="proker">Program Kerja</option><option value="academic">Akademik</option><option value="psdm">PSDM</option><option value="litbang">Litbang</option><option value="beasiswa">Beasiswa</option><option value="kompetisi">Kompetisi</option></select></label>
          </div>
          <label class="form-label" for="admin-calendar-title">NAMA KEGIATAN / TENGGAT</label>
          <input class="form-input" id="admin-calendar-title" name="title" maxlength="180" required />
          <div class="admin-form-grid">
            <label class="form-group"><span class="form-label">DIVISI</span><input class="form-input" name="division" maxlength="80" required /></label>
            <label class="form-group"><span class="form-label">LOKASI</span><input class="form-input" name="location" maxlength="180" /></label>
          </div>
          <label class="form-label" for="admin-calendar-desc">KETERANGAN</label>
          <textarea class="form-textarea" id="admin-calendar-desc" name="desc" maxlength="3000"></textarea>
          <label class="form-group"><span class="form-label">TAUTAN PENDAFTARAN HTTPS (OPSIONAL)</span><input class="form-input" name="registration_url" type="url" maxlength="2000" /></label>
          <label class="studio-toggle" data-event-registration-toggle><input type="checkbox" name="registration_open" value="true" /> BUKA PENDAFTARAN PESERTA</label>
          <label class="form-group"><span class="form-label">KUOTA PESERTA</span><input class="form-input" name="capacity" type="number" min="1" max="10000" value="30" /></label>
          <p class="auth-feedback" data-form-feedback="calendar" role="status"></p>
          <button class="btn-tactical primary" type="submit">TAMBAH KE KALENDER</button>
        </form>
      </section>
      ${this.renderDelegations(delegationsResult)}
      ${this.renderAttendanceSessionOperations(calendar)}
      ${this.renderTutoringOperations(tutoringRequestsResult, tutoringTutorsResult)}
      ${this.renderEventRegistrationOperations(calendar)}
      ${hasKnowledgeModerationAccess ? this.renderKnowledgeDiscussionModeration(knowledgeDiscussionsResult) : ''}
      ${hasBphAccess ? this.renderBphSections(aspirationsResult, ledgerResult) : ''}
      ${this.api.isSuperadmin ? this.renderUsers(usersResult) : ''}
      ${this.api.isSuperadmin ? this.renderAuditLogsSection(auditLogsResult) : ''}
      ${this.api.isSuperadmin ? '<button class="btn-tactical primary" type="button" data-open-site-studio>BUKA SITE STUDIO</button>' : ''}
      <button class="btn-tactical" type="button" data-admin-close>TUTUP CONSOLE</button>
    `;

    this.renderOperationsNavigation(body);
    this.bindTaskForms(body);
    if (hasCareerManagementAccess) this.bindCareerMentorshipQueue(body);
    this.bindOfficeDocumentsForms(body);
    this.bindProkerForm(body);
    this.bindCalendarForm(body);
    this.bindAttendanceSessionForms(body);
    this.bindTutoringForms(body);
    this.bindEventRegistrationForms(body);
    if (hasKnowledgeModerationAccess) this.bindKnowledgeDiscussionModeration(body);
    if (hasPortfolioReviewAccess) this.bindPortfolioReviewQueue(body);
    if (hasBphAccess) this.bindBphForms(body, aspirationsResult);
    this.bindDelegationForms(body);
    if (this.api.isSuperadmin) {
      this.bindUserForms(body, usersResult);
      this.bindInterventionActions(body);
    }
    body.querySelector('[data-open-site-studio]')?.addEventListener('click', () => window.prtsApp.openSiteStudio());
    body.querySelector('[data-admin-close]').addEventListener('click', this.closeModal);
  }

  renderOperationsNavigation(container) {
    const modules = [...container.querySelectorAll(':scope > .admin-section')]
      .map((section, index) => {
        const heading = section.querySelector('h2, h3, h4');
        if (!heading) return null;
        section.classList.add('operations-module-section');
        if (!section.id) section.id = `operations-module-${index + 1}`;
        return {
          id: section.id,
          title: heading.textContent.trim().replace(/\s+\/\/.*/, '').replace(/\s+/g, ' ')
        };
      })
      .filter(Boolean);
    if (!modules.length) return;

    const navigation = document.createElement('nav');
    navigation.className = 'operations-module-nav';
    navigation.setAttribute('aria-label', 'Akses cepat modul operasional');
    navigation.innerHTML = modules.map(({ id, title }) => `
      <button type="button" data-operations-target="${escapeHtml(id)}" aria-controls="${escapeHtml(id)}">${escapeHtml(title)}</button>
    `).join('');
    navigation.querySelectorAll('[data-operations-target]').forEach((button) => {
      button.addEventListener('click', () => {
        const target = container.querySelector(`#${CSS.escape(button.dataset.operationsTarget)}`);
        target?.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
          block: 'start'
        });
      });
    });
    container.prepend(navigation);
  }

  renderProkerList() {
    if (!this.proker.length) return '<p>Data program kerja tidak tersedia.</p>';
    return this.proker.map((item) => `
      <div class="admin-record-row">
        <span>${escapeHtml(item.title)} <small>${escapeHtml(item.status)} // ${escapeHtml(item.division)}</small></span>
        <button class="btn-tactical" type="button" data-edit-proker="${escapeHtml(item.id)}">EDIT</button>
      </div>
    `).join('');
  }

  renderOfficeDocuments(letters = this.officeLetters) {
    const archive = letters.length ? letters.map((letter) => {
      const approvals = Array.isArray(letter.approvals) ? letter.approvals : [];
      const tags = Array.isArray(letter.tags) ? letter.tags : [];
      const approvalStatusMarkup = approvals.map((step) => `
        <span class="status-badge ${step.status === 'approved' ? 'ok' : step.status === 'rejected' ? 'danger' : 'muted'}">
          ${escapeHtml(step.step)}: ${escapeHtml(step.status)}
        </span>`).join(' ');
      return `
        <article class="admin-record-row" data-office-letter="${escapeHtml(letter.id)}">
          <div>
            <strong>${escapeHtml(letter.letter_number)} // ${escapeHtml(letter.subject)}</strong>
            <small>${escapeHtml(letter.type)} // ${escapeHtml(letter.division)} → ${escapeHtml(letter.target_division)} // ${escapeHtml(letter.status)}</small>
            <p>${escapeHtml(letter.body)}</p>
            <p><small>Tag: ${tags.length ? tags.map((tag) => escapeHtml(tag)).join(', ') : 'Tanpa tag'}</small></p>
            <div>${approvalStatusMarkup}</div>
          </div>
          <div class="admin-form-grid">
            ${approvals.map((step) => `
              <div class="form-group">
                <span class="form-label">${escapeHtml(step.step)}</span>
                <div>
                  <button class="btn-tactical" type="button" data-office-approve="${escapeHtml(letter.id)}" data-office-step="${escapeHtml(step.step)}" data-office-approved="true">SETUJUI</button>
                  <button class="btn-tactical" type="button" data-office-approve="${escapeHtml(letter.id)}" data-office-step="${escapeHtml(step.step)}" data-office-approved="false">TOLAK</button>
                </div>
              </div>
            `).join('')}
          </div>
        </article>
      `;
    }).join('') : '<p>Belum ada arsip surat yang ditangani.</p>';

    return `
      <section id="office-documents-panel" class="admin-section">
        <h3>E-OFFICE // SURAT MENYURAT</h3>
        <form id="admin-office-letter-form" class="admin-form">
          <div class="admin-form-grid">
            <label class="form-group"><span class="form-label">JENIS DOKUMEN</span>
              <select class="form-select" name="type">
                <option value="surat-keputusan">[01] Surat Keputusan (SK / SKB)</option>
                <option value="surat-mandat">[02] Surat Mandat / Delegasi / Tugas / Perintah</option>
                <option value="surat-pengawasan">[03] Memorandum / Surat Peringatan / Teguran / Protes</option>
                <option value="surat-perikatan">[04] MoU / PKS / Surat Perjanjian Kontrak</option>
                <option value="surat-pernyataan">[05] Surat Pernyataan / Berita Acara</option>
                <option value="surat-legalitas">[06] Surat Perizinan / Peminjaman / Surat Jalan</option>
                <option value="surat-undangan">[07] Surat Undangan / Pemberitahuan / Edaran</option>
                <option value="surat-pelayanan">[08] Surat Keterangan Aktif / Rekomendasi</option>
              </select>
            </label>
            <label class="form-group"><span class="form-label">JUDUL SURAT</span><input class="form-input" name="subject" maxlength="200" required /></label>
            <label class="form-group"><span class="form-label">DIVISI PENGIRIM</span><input class="form-input" name="division" maxlength="80" required /></label>
            <label class="form-group"><span class="form-label">DIVISI TUJUAN</span><input class="form-input" name="target_division" maxlength="80" required /></label>
            <label class="form-group"><span class="form-label">TAG (pisahkan koma)</span><input class="form-input" name="tags" maxlength="200" placeholder="internal, rapat, pengurus" /></label>
          </div>
          <label class="form-label" for="admin-office-body">ISI DRAFT</label>
          <textarea class="form-textarea" id="admin-office-body" name="body" maxlength="5000" required></textarea>
          <p class="auth-feedback" data-form-feedback="office" role="status"></p>
          <button class="btn-tactical primary" type="submit">BUAT DRAFT SURAT</button>
        </form>
        <form id="admin-office-search-form" class="admin-form">
          <div class="admin-form-grid">
            <label class="form-group"><span class="form-label">CARI ARSIP</span><input class="form-input" name="query" maxlength="200" placeholder="Kata kunci, nomor surat, tag" /></label>
            <label class="form-group"><span class="form-label">DIVISI</span><input class="form-input" name="division" maxlength="80" placeholder="PSDM / BPH" /></label>
            <label class="form-group"><span class="form-label">DARI TANGGAL</span><input class="form-input" name="date_from" type="date" /></label>
            <label class="form-group"><span class="form-label">SAMPAI TANGGAL</span><input class="form-input" name="date_to" type="date" /></label>
          </div>
          <button class="btn-tactical" type="submit">FILTER ARSIP</button>
        </form>
        <div class="admin-record-list">${archive}</div>
      </section>
    `;
  }

  bindOfficeDocumentsForms(body) {
    const createForm = body.querySelector('#admin-office-letter-form');
    const createFeedback = body.querySelector('[data-form-feedback="office"]');
    createForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(createForm));
      const result = await this.api.createOfficeLetter({
        type: payload.type,
        subject: payload.subject.trim(),
        division: payload.division.trim(),
        target_division: payload.target_division.trim(),
        tags: payload.tags ? payload.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : [],
        body: payload.body.trim()
      });
      createFeedback.textContent = result.ok ? 'DRAFT SURAT BERHASIL DIBUAT' : result.error;
      if (result.ok) {
        const officeLetters = await this.api.getOfficeLetters();
        this.officeLetters = officeLetters.ok && Array.isArray(officeLetters.data?.letters) ? officeLetters.data.letters : [];
        const section = body.querySelector('#office-documents-panel');
        if (section) section.innerHTML = this.renderOfficeDocuments().replace('<section id="office-documents-panel" class="admin-section">', '<section id="office-documents-panel" class="admin-section">');
        this.bindOfficeDocumentsForms(body);
      }
    });

    const searchForm = body.querySelector('#admin-office-search-form');
    searchForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(searchForm));
      const result = await this.api.getOfficeLetters({
        query: payload.query,
        division: payload.division,
        date_from: payload.date_from,
        date_to: payload.date_to
      });
      if (!result.ok) return;
      this.officeLetters = Array.isArray(result.data?.letters) ? result.data.letters : [];
      const section = body.querySelector('#office-documents-panel');
      if (section) section.innerHTML = this.renderOfficeDocuments().replace('<section id="office-documents-panel" class="admin-section">', '<section id="office-documents-panel" class="admin-section">');
      this.bindOfficeDocumentsForms(body);
    });

    body.querySelectorAll('[data-office-approve]').forEach((button) => {
      button.addEventListener('click', async () => {
        const note = window.prompt('Catatan persetujuan (opsional):', '') || '';
        const result = await this.api.approveOfficeLetter(button.dataset.officeApprove, {
          step: button.dataset.officeStep,
          approved: button.dataset.officeApproved === 'true',
          note
        });
        if (!result.ok) {
          const record = button.closest('[data-office-letter]');
          record.querySelector('.auth-feedback')?.replaceChildren(document.createTextNode(result.error));
          return;
        }
        const reload = await this.api.getOfficeLetters();
        this.officeLetters = reload.ok && Array.isArray(reload.data?.letters) ? reload.data.letters : [];
        const section = body.querySelector('#office-documents-panel');
        if (section) section.innerHTML = this.renderOfficeDocuments().replace('<section id="office-documents-panel" class="admin-section">', '<section id="office-documents-panel" class="admin-section">');
        this.bindOfficeDocumentsForms(body);
      });
    });
  }

  renderBphSections(aspirationsResult, ledgerResult) {
    const aspirations = aspirationsResult?.ok && Array.isArray(aspirationsResult.data) ? aspirationsResult.data : [];
    const ledger = ledgerResult?.ok ? ledgerResult.data : null;
    return `
      <section class="admin-section">
        <h3>ASPIRASI // ${aspirations.length}</h3>
        ${aspirations.map((item) => `
          <form class="admin-form admin-response-form" data-aspiration-id="${escapeHtml(item.id)}">
            <p>${escapeHtml(item.sender_nim_or_anon)} // ${escapeHtml(item.category)} // ${escapeHtml(item.status)}</p>
            <p>${escapeHtml(item.message)}</p>
            <label class="form-label" for="response-${escapeHtml(item.id)}">TANGGAPAN BPH</label>
            <textarea class="form-textarea" id="response-${escapeHtml(item.id)}" name="response" maxlength="3000" required>${escapeHtml(item.bph_response)}</textarea>
            <label class="form-label" for="status-${escapeHtml(item.id)}">STATUS</label>
            <select class="form-select" id="status-${escapeHtml(item.id)}" name="status">
              <option ${item.status === 'Diterima' ? 'selected' : ''}>Diterima</option>
              <option ${item.status === 'Dalam Investigasi' ? 'selected' : ''}>Dalam Investigasi</option>
              <option ${item.status === 'Ditindaklanjuti' ? 'selected' : ''}>Ditindaklanjuti</option>
              <option ${item.status === 'Dijadwalkan RDP DPA' ? 'selected' : ''}>Dijadwalkan RDP DPA</option>
              <option ${item.status === 'Selesai' ? 'selected' : ''}>Selesai</option>
            </select>
            <div class="rdp-scheduling-box" style="margin-top:0.75rem; padding:0.75rem; border:1px dashed #00e5ff; background:rgba(0, 229, 255, 0.05);">
              <span class="status-badge ${item.is_rdp_agenda ? 'ok' : 'muted'}">PASAL 41 ART // RDP DPA: ${item.is_rdp_agenda ? 'MASUK AGENDA DENGAR PENDAPAT' : 'BELUM MASUK AGENDA'}</span>
              <label class="studio-toggle" style="margin: 0.5rem 0;"><input type="checkbox" name="is_rdp_agenda" ${item.is_rdp_agenda ? 'checked' : ''} /> AGENDAKAN KE RAPAT DENGAR PENDAPAT DPA</label>
              <div class="admin-form-grid">
                <label class="form-group"><span class="form-label">TANGGAL RDP</span><input class="form-input" name="rdp_scheduled_at" type="datetime-local" value="${item.rdp_scheduled_at ? escapeHtml(item.rdp_scheduled_at) : ''}" /></label>
                <label class="form-group"><span class="form-label">NOTULENSI / CATATAN DPA</span><input class="form-input" name="rdp_notes" maxlength="500" value="${escapeHtml(item.rdp_notes || '')}" placeholder="Catatan hearing..." /></label>
              </div>
            </div>
            <p class="auth-feedback" role="status"></p>
            <button class="btn-tactical primary" type="submit">SIMPAN TANGGAPAN</button>
          </form>
        `).join('') || '<p>Belum ada aspirasi.</p>'}
      </section>
      <section class="admin-section">
        <h3>BUKU KAS // SALDO ${escapeHtml(ledger?.summary?.balance ?? 0)}</h3>
        <div class="admin-record-list">${(ledger?.transactions || []).slice(0, 12).map((item) => `
          <article class="admin-record-row">
            <span>${escapeHtml(item.date)} // ${escapeHtml(item.type)} // ${escapeHtml(item.description)} // ${escapeHtml(item.amount)}${item.receipt ? `<small>${escapeHtml(item.receipt.file_name)} // ${Math.ceil(item.receipt.size / 1024)} KB</small>` : '<small>Tanpa lampiran</small>'}</span>
            ${item.receipt ? `<button class="btn-tactical" type="button" data-ledger-receipt="${escapeHtml(item.receipt.id)}" data-ledger-mime="${escapeHtml(item.receipt.mime_type)}" data-ledger-name="${escapeHtml(item.receipt.file_name)}">BUKA BUKTI</button>` : ''}
          </article>`).join('')}</div>
        <form id="admin-ledger-form" class="admin-form">
          <div class="admin-form-grid">
            <label class="form-group"><span class="form-label">JENIS</span><select class="form-select" name="type" data-ledger-type><option value="INCOME">Pemasukan</option><option value="EXPENSE">Pengeluaran</option></select></label>
            <label class="form-group"><span class="form-label">NOMINAL</span><input class="form-input" name="amount" type="number" min="1" step="1000" required /></label>
            <label class="form-group"><span class="form-label">KATEGORI</span><input class="form-input" name="category" maxlength="80" /></label>
            <label class="form-group"><span class="form-label">DIVISI</span><input class="form-input" name="division" maxlength="80" /></label>
          </div>
          <label class="form-label" for="admin-ledger-description">KETERANGAN TRANSAKSI</label>
          <input class="form-input" id="admin-ledger-description" name="description" maxlength="240" required />
          <label class="form-group" data-ledger-receipt-field hidden><span class="form-label">BUKTI BELANJA // PDF, JPG, PNG, WEBP // MAKS. 10 MB</span><input class="form-input" name="receipt" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" /></label>
          <p class="auth-feedback" data-form-feedback="ledger" role="status"></p>
          <button class="btn-tactical primary" type="submit">CATAT TRANSAKSI</button>
        </form>
        <dialog class="ledger-receipt-dialog" aria-labelledby="ledger-receipt-title">
          <h3 id="ledger-receipt-title" data-ledger-receipt-title>BUKTI TRANSAKSI</h3>
          <div data-ledger-receipt-preview></div>
          <button class="btn-tactical" type="button" data-ledger-receipt-close>TUTUP</button>
        </dialog>
      </section>
    `;
  }

  renderUsers(usersResult) {
    const users = usersResult?.ok ? usersResult.data.users || [] : [];
    return `
      <section class="admin-section">
        <h3>PENGELOLAAN AKUN & INTERVENSI TEKNIS // ${users.length}</h3>
        <p style="font-size: 0.85rem; color: #a0aec0; margin-bottom: 1rem;">
          Wewenang Superadmin Level 4: Penyesuaian Role & Clearance, Intervensi Reset Password Darurat, serta Mode Dampingi Pengguna (Impersonasi) untuk bantuan teknis langsung.
        </p>
        <div class="admin-record-list">
          ${users.map((user) => `
            <article class="admin-record-row" style="flex-direction: column; align-items: flex-start; gap: 0.75rem; border-left: 3px solid ${user.role === 'superadmin' ? '#ffd700' : '#00e5ff'}; padding: 0.75rem; margin-bottom: 0.75rem;">
              <div style="display:flex; justify-content:space-between; width:100%; flex-wrap:wrap; gap:0.5rem; align-items:center;">
                <div>
                  <strong style="color:var(--ak-cyan);">${escapeHtml(user.name)}</strong> 
                  <span style="color:#a0aec0;">(${escapeHtml(user.nim)})</span>
                  <span class="status-badge ${user.role === 'superadmin' ? 'ok' : 'primary'}" style="margin-left:0.5rem;">
                    ${user.role === 'superadmin' ? 'SUPERADMIN (LVL 4)' : `CLEARANCE LEVEL ${user.clearance_level || 1}`}
                  </span>
                </div>
                <div style="font-size:0.85rem; color:#cbd5e1;">
                  <span>Divisi: ${escapeHtml(user.division || '-')}</span> | 
                  <span>Jabatan: ${escapeHtml(user.role_title || '-')}</span>
                </div>
              </div>

              <div style="display:flex; gap:0.5rem; flex-wrap:wrap; width:100%; align-items:center; border-top:1px dashed rgba(255,255,255,0.1); padding-top:0.5rem;">
                <!-- Form Update Role & Clearance -->
                <form class="admin-user-form admin-form" data-user-nim="${escapeHtml(user.nim)}" data-user-role="${escapeHtml(user.role || 'member')}" data-user-academic-curate="${Boolean(user.permissions?.includes('academic_curate'))}" style="flex:1; min-width:280px; margin:0; padding:0; background:none;">
                  <div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap;">
                    <label style="font-size:0.75rem; color:#a0aec0;">ROLE:
                      <select class="form-select" name="role" style="padding:0.25rem 0.5rem; font-size:0.8rem; width:auto; display:inline-block;">
                        <option value="member" ${(user.role || 'member') === 'member' ? 'selected' : ''}>MEMBER</option>
                        <option value="superadmin" ${user.role === 'superadmin' ? 'selected' : ''}>SUPERADMIN</option>
                      </select>
                    </label>

                    ${user.role !== 'superadmin' ? `
                      <label style="font-size:0.75rem; color:#a0aec0;">LVL:
                        <select class="form-select" name="clearance_level" style="padding:0.25rem 0.5rem; font-size:0.8rem; width:auto; display:inline-block;">
                          ${[1, 2, 3].map((level) => `<option value="${level}" ${user.clearance_level === level ? 'selected' : ''}>LEVEL ${level}</option>`).join('')}
                        </select>
                      </label>
                      <label class="studio-toggle" style="font-size:0.75rem; margin:0;"><input type="checkbox" name="academic_curate" ${user.permissions?.includes('academic_curate') ? 'checked' : ''} /> KURATOR</label>
                    ` : ''}

                    <button class="btn-tactical btn-small primary" type="submit" style="padding:0.25rem 0.6rem;">SIMPAN IZIN</button>
                  </div>
                  <p class="auth-feedback" role="status" style="margin:0.2rem 0 0; font-size:0.75rem;"></p>
                </form>

                <!-- Tombol Intervensi Teknis -->
                <div style="display:flex; gap:0.4rem; flex-wrap:wrap; align-items:center;">
                  <button class="btn-tactical btn-small" type="button" data-admin-action="impersonate" data-target-nim="${escapeHtml(user.nim)}" data-target-name="${escapeHtml(user.name)}" style="border-color:#00e5ff; color:#00e5ff;">
                    👁️ DAMPINGI PENGGUNA
                  </button>
                  <button class="btn-tactical btn-small" type="button" data-admin-action="reset-pwd" data-target-nim="${escapeHtml(user.nim)}" data-target-name="${escapeHtml(user.name)}" style="border-color:#ffb74d; color:#ffb74d;">
                    🔑 RESET PASSWORD
                  </button>
                </div>
              </div>
            </article>
          `).join('') || '<p>Data akun tidak tersedia.</p>'}
        </div>

        <form id="admin-create-user-form" class="admin-form" style="margin-top: 1.5rem; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 1rem;">
          <h4>BUAT AKUN ANGGOTA BARU</h4>
          <div class="admin-form-grid">
            <label class="form-group"><span class="form-label">NIM / ID</span><input class="form-input" name="nim" minlength="3" maxlength="32" required /></label>
            <label class="form-group"><span class="form-label">NAMA LENGKAP</span><input class="form-input" name="name" maxlength="120" required /></label>
            <label class="form-group"><span class="form-label">ANGKATAN</span><input class="form-input" name="generation" inputmode="numeric" pattern="\\d{4}" maxlength="4" /></label>
            <label class="form-group"><span class="form-label">DIVISI</span><input class="form-input" name="division" maxlength="80" /></label>
          </div>
          <label class="form-label" for="admin-new-user-password">PASSWORD SEMENTARA (MIN. 12 KARAKTER)</label>
          <input class="form-input" id="admin-new-user-password" name="password" type="password" minlength="12" autocomplete="new-password" required />
          <p class="auth-feedback" role="status"></p>
          <button class="btn-tactical primary" type="submit">BUAT AKUN LEVEL 1</button>
        </form>
      </section>
    `;
  }

  renderAuditLogsSection(auditLogsResult) {
    const logs = auditLogsResult?.ok && Array.isArray(auditLogsResult.data?.logs) ? auditLogsResult.data.logs : [];
    return `
      <section class="admin-section" style="border-top: 2px solid #00e5ff; margin-top: 2rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:1rem;">
          <div>
            <h3 style="margin:0;">PAPAN JEJAK AUDIT SISTEM (AUDIT TRAIL LOG) // ${logs.length} AKSI</h3>
            <p style="font-size:0.8rem; color:#a0aec0; margin:0.25rem 0 0;">
              Rekapitulasi otomatis intervensi administratif, modifikasi izin clearance, reset password darurat, dan audit kepengurusan.
            </p>
          </div>
        </div>

        <div class="admin-record-list" style="max-height: 420px; overflow-y: auto;">
          ${logs.map((log) => {
      const detailStr = log.details ? JSON.stringify(log.details) : '';
      return `
              <article class="admin-record-row" style="font-size:0.82rem; padding:0.5rem 0.75rem; border-left:3px solid #78909c; display:flex; flex-direction:column; gap:0.25rem;">
                <div style="display:flex; justify-content:space-between; width:100%; flex-wrap:wrap; gap:0.5rem;">
                  <span>
                    <strong style="color:#00e5ff;">[${escapeHtml(log.action)}]</strong> 
                    Target: ${escapeHtml(log.target_type)} #${escapeHtml(log.target_id)}
                  </span>
                  <small style="color:#90a4ae;">${new Date(log.created_at).toLocaleString('id-ID')}</small>
                </div>
                <div style="color:#cbd5e1;">
                  Aktor: <strong>${escapeHtml(log.actor_nim)}</strong> (${escapeHtml(log.actor_role)}) 
                  ${detailStr && detailStr !== '{}' ? `// <span style="font-family:monospace; color:#80deea;">${escapeHtml(detailStr)}</span>` : ''}
                </div>
              </article>
            `;
    }).join('') || '<p style="color:#a0aec0; font-size:0.85rem;">Belum ada catatan aktivitas pada audit trail.</p>'}
        </div>
      </section>
    `;
  }


  bindProkerForm(body) {
    const form = body.querySelector('#admin-proker-form');
    const feedback = body.querySelector('[data-form-feedback="proker"]');
    form.addEventListener('reset', () => {
      form.elements.id.value = '';
      feedback.textContent = '';
    });
    body.querySelectorAll('[data-edit-proker]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = this.proker.find((entry) => entry.id === button.dataset.editProker);
        if (!item) return;
        form.elements.id.value = item.id;
        form.elements.title.value = item.title || '';
        form.elements.division.value = item.division || '';
        form.elements.category.value = item.category || '';
        form.elements.status.value = item.status || 'upcoming';
        form.elements.date_start.value = item.date_start || '';
        form.elements.date_end.value = item.date_end || item.date_start || '';
        form.elements.budget_allocated.value = item.budget_allocated || 0;
        form.elements.target_participants.value = item.target_participants || '';
        form.elements.kpi_indicator.value = item.kpi_indicator || '';
        form.elements.lpj_notes.value = item.lpj_notes || '';
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form));
      const id = values.id;
      delete values.id;
      values.budget_allocated = Number(values.budget_allocated) || 0;
      const result = id ? await this.api.updateProker(id, values) : await this.api.createProker(values);
      feedback.textContent = result.ok ? 'PROGRAM TERSIMPAN' : result.error;
      if (result.ok) await this.refreshData();
    });
  }

  bindCalendarForm(body) {
    const form = body.querySelector('#admin-calendar-form');
    const feedback = body.querySelector('[data-form-feedback="calendar"]');
    const registrationToggle = form.querySelector('[data-event-registration-toggle]');
    const capacityField = form.elements.capacity.closest('.form-group');
    const updateRegistrationFields = () => {
      const externalDeadline = ['beasiswa', 'kompetisi'].includes(form.elements.type.value);
      registrationToggle.hidden = externalDeadline;
      registrationToggle.querySelector('input').disabled = externalDeadline;
      if (externalDeadline) registrationToggle.querySelector('input').checked = false;
      capacityField.hidden = externalDeadline;
    };
    form.elements.type.addEventListener('change', updateRegistrationFields);
    updateRegistrationFields();
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const eventData = Object.fromEntries(new FormData(form));
      eventData.registration_open = form.elements.registration_open.checked;
      eventData.capacity = Number(eventData.capacity) || 0;
      const result = await this.api.createCalendarEvent(eventData);
      feedback.textContent = result.ok ? 'AGENDA TERSIMPAN' : result.error;
      if (result.ok) await this.refreshData();
    });
  }

  renderEventRegistrationOperations(events) {
    if (!events.length) return '';
    return `
            <section class="admin-section">
              <h3>TICKETING, PRESENSI & SERTIFIKAT EVENT</h3>
              ${events.map((event) => `
                <article class="admin-record-row">
                  <span><strong>${escapeHtml(event.title)}</strong><small>${escapeHtml(event.date_str)} // ${event.registration_open ? `registrasi terbuka // kuota ${escapeHtml(event.capacity)}` : 'event internal / tanpa registrasi publik'}</small></span>
                  ${event.registration_open ? `<form class="admin-form event-check-in-form" data-check-in-event="${escapeHtml(event.id)}">
                    <label class="form-group"><span class="form-label">ID TIKET</span><input class="form-input" name="ticket_id" required /></label>
                    <label class="form-group"><span class="form-label">TOKEN QR</span><input class="form-input" name="ticket_token" required /></label>
                    <button class="btn-tactical" type="button" data-scan-ticket>PINDAI QR</button>
                    <button class="btn-tactical" type="button" data-stop-scan hidden>HENTIKAN KAMERA</button>
                    <video class="event-qr-scanner" data-ticket-scanner playsinline hidden aria-label="Pemindai QR tiket event"></video>
                    <button class="btn-tactical" type="submit">VALIDASI PRESENSI</button>
                    <p class="auth-feedback" role="status"></p>
                  </form>` : ''}
                  <button class="btn-tactical primary" type="button" data-issue-certificates="${escapeHtml(event.id)}">TERBITKAN SERTIFIKAT BAGI HADIRIN TERVERIFIKASI</button>
                  <p data-certificate-feedback="${escapeHtml(event.id)}" class="auth-feedback" role="status"></p>
                </article>
              `).join('')}
            </section>`;
  }

  renderDelegations(delegationsResult) {
    const delegations = delegationsResult?.ok && Array.isArray(delegationsResult.data) ? delegationsResult.data : [];
    return `
      <section class="admin-section">
        <h3>PASAL 57-58 ART // MANAJEMEN DELEGASI & MANDAT (${delegations.length})</h3>
        <p style="font-size: 0.85rem; color: #a0aec0; margin-bottom: 1rem;">
          Kewajiban Pengurus/Anggota: Mengantongi Surat Tugas/Mandat Resmi Kahim & Menyerahkan LPD selambat-lambatnya 7 hari kalender pasca kegiatan (Pasal 57 & 58 ART HMIF).
        </p>
        <div class="admin-record-list">
          ${delegations.map(del => {
      const isClawback = del.clawback_warning === 1 || del.clawback_warning === true;
      return `
              <article class="admin-record-row" style="flex-direction: column; align-items: flex-start; gap: 0.5rem; border-left: 3px solid ${isClawback ? '#ff5252' : '#00e5ff'}; padding: 0.75rem;">
                <div style="display:flex; justify-content:space-between; width:100%; flex-wrap:wrap; gap:0.5rem;">
                  <strong>${escapeHtml(del.event_name)} (${escapeHtml(del.event_category)})</strong>
                  <span class="status-badge ${del.status === 'Selesai' ? 'ok' : (del.status === 'Disetujui' ? 'primary' : (isClawback ? 'danger' : 'muted'))}">
                    STATUS: ${escapeHtml(del.status)} ${isClawback ? '⚠️ PERINGATAN CLAWBACK LPD' : ''}
                  </span>
                </div>
                <div style="font-size: 0.85rem; color: #cbd5e1;">
                  <span>Delegasi: ${escapeHtml(del.applicant_name)} (${escapeHtml(del.applicant_nim)})</span> | 
                  <span>Tujuan: ${escapeHtml(del.destination)}</span> | 
                  <span>Jadwal: ${formatDate(del.start_date)} s/d ${formatDate(del.end_date)}</span> | 
                  <span>Pendanaan: ${escapeHtml(del.funding_type)} (Disetujui: Rp ${Number(del.approved_budget || 0).toLocaleString('id-ID')})</span>
                </div>
                ${del.mandate_letter_number ? `<div style="font-size:0.85rem; color:#00e5ff;">NO. SURAT TUGAS/MANDAT: ${escapeHtml(del.mandate_letter_number)}</div>` : `<div style="font-size:0.85rem; color:#ffb74d;">Surat Tugas belum diterbitkan BPH/Kahim</div>`}
                ${del.lpd_submitted ? `
                  <div style="font-size: 0.8rem; background: rgba(0, 230, 118, 0.1); border-left: 2px solid #00e676; padding: 0.4rem 0.6rem; margin-top: 0.25rem; width:100%;">
                    <strong>LPD Diterima:</strong> ${escapeHtml(del.lpd_text)} <small style="color:#a0aec0;">(${formatDate(del.lpd_submitted_at)})</small>
                  </div>
                ` : (del.status === 'Disetujui' ? `
                  <div style="font-size: 0.8rem; color: ${isClawback ? '#ff5252' : '#ffb74d'};">
                    ${isClawback ? '⚠️ PERINGATAN PASAL 58 AYAT 4: Batas 7 hari terlewati. LPD belum diserahkan! Wajib pengembalian dana penuh.' : 'Menunggu penyerahan Laporan Pertanggungjawaban Delegasi (Maks. 7 hari pasca kegiatan).'}
                  </div>
                ` : '')}

                <form class="admin-delegation-update-form admin-form" data-delegation-id="${escapeHtml(del.id)}" style="margin-top: 0.5rem; width: 100%; background: rgba(255,255,255,0.02); padding: 0.5rem;">
                  <div class="admin-form-grid">
                    <label class="form-group"><span class="form-label">UPDATE STATUS</span>
                      <select class="form-select" name="status">
                        <option value="Diajukan" ${del.status === 'Diajukan' ? 'selected' : ''}>Diajukan</option>
                        <option value="Disetujui" ${del.status === 'Disetujui' ? 'selected' : ''}>Disetujui (Terbitkan Mandat)</option>
                        <option value="Ditolak" ${del.status === 'Ditolak' ? 'selected' : ''}>Ditolak</option>
                        <option value="Selesai" ${del.status === 'Selesai' ? 'selected' : ''}>Selesai (LPD Diterima)</option>
                      </select>
                    </label>
                    <label class="form-group"><span class="form-label">NO. SURAT TUGAS KAHIM</span>
                      <input class="form-input" name="mandate_letter_number" value="${escapeHtml(del.mandate_letter_number || '')}" placeholder="HMIF-ST/XX/2026" />
                    </label>
                    <label class="form-group"><span class="form-label">ANGGARAN DISETUJUI (RP)</span>
                      <input class="form-input" name="approved_budget" type="number" value="${Number(del.approved_budget || 0)}" min="0" step="50000" />
                    </label>
                    <label class="form-group"><span class="form-label">CLAWBACK WARNING (PASAL 58)</span>
                      <select class="form-select" name="clawback_warning">
                        <option value="0" ${!isClawback ? 'selected' : ''}>Normal / Aman</option>
                        <option value="1" ${isClawback ? 'selected' : ''}>AKTIFKAN PERINGATAN CLAWBACK</option>
                      </select>
                    </label>
                  </div>
                  <label class="form-group"><span class="form-label">CATATAN VERIFIKASI BPH / KAHIM</span>
                    <input class="form-input" name="notes" value="${escapeHtml(del.notes || '')}" placeholder="Catatan atau instruksi delegasi..." />
                  </label>
                  <p class="auth-feedback" role="status"></p>
                  <button class="btn-tactical primary" type="submit" style="margin-top: 0.25rem;">SIMPAN STATUS DELEGASI</button>
                </form>
              </article>
            `;
    }).join('') || '<p>Belum ada permohonan delegasi terdaftar.</p>'}
        </div>

        <form id="admin-delegation-create-form" class="admin-form" style="margin-top: 1.5rem; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 1rem;">
          <h4>AJUKAN PERMOHONAN DELEGASI BARU (PASAL 57 ART)</h4>
          <div class="admin-form-grid">
            <label class="form-group"><span class="form-label">NAMA KEGIATAN / LOMBA</span><input class="form-input" name="event_name" required placeholder="Contoh: Gemastik / Hackathon Nasional" /></label>
            <label class="form-group"><span class="form-label">KATEGORI EVENT</span>
              <select class="form-select" name="event_category">
                <option value="Kompetisi">Kompetisi / Lomba</option>
                <option value="Konferensi">Konferensi / Seminar Ilmiah</option>
                <option value="Forum Nasional">Forum Nasional / Muskerwil Permikomnas</option>
                <option value="Pelatihan">Pelatihan / Workshop</option>
              </select>
            </label>
            <label class="form-group"><span class="form-label">LOKASI TUJUAN</span><input class="form-input" name="destination" required placeholder="Dalam Kota / Bandung / Jakarta" /></label>
            <label class="form-group"><span class="form-label">JENIS PENDANAAN</span>
              <select class="form-select" name="funding_type">
                <option value="Mandiri">Mandiri (Surat Tugas Saja)</option>
                <option value="Subsidi Parsial">Subsidi Parsial Kas HMIF</option>
                <option value="Didanai Penuh HMIF">Didanai Penuh HMIF</option>
                <option value="Pengajuan Dana Rektorat/Fakultas">Rekomendasi Dana Fakultas/Rektorat</option>
              </select>
            </label>
            <label class="form-group"><span class="form-label">ESTIMASI ANGGARAN (RP)</span><input class="form-input" name="requested_budget" type="number" min="0" step="50000" value="0" /></label>
            <label class="form-group"><span class="form-label">TANGGAL MULAI</span><input class="form-input" name="start_date" type="date" required /></label>
            <label class="form-group"><span class="form-label">TANGGAL SELESAI</span><input class="form-input" name="end_date" type="date" required /></label>
          </div>
          <label class="form-group"><span class="form-label">DESKRIPSI / JUSTIFIKASI DELEGASI</span>
            <textarea class="form-textarea" name="notes" placeholder="Jelaskan tujuan dan relevansi delegasi dengan HMIF..."></textarea>
          </label>
          <p class="auth-feedback" data-form-feedback="delegation" role="status"></p>
          <button class="btn-tactical primary" type="submit">KIRIM PENGAJUAN DELEGASI</button>
        </form>
      </section>
    `;
  }


  renderAttendanceSessionOperations(events) {
    const todaysEvents = events.filter((event) => event.date_str === getJakartaCalendarDate());
    return `
      <section class="admin-section">
        <h3>PRESENSI ANGGOTA // QR + GEOFENCE</h3>
        ${todaysEvents.map((event) => `
          <form class="admin-form" data-attendance-session-form="${escapeHtml(event.id)}">
            <strong>${escapeHtml(event.title)} // ${escapeHtml(event.date_str)}</strong>
            <div class="admin-form-grid">
              <label class="form-group"><span class="form-label">LATITUDE VENUE</span><input class="form-input" name="latitude" type="number" min="-90" max="90" step="any" required /></label>
              <label class="form-group"><span class="form-label">LONGITUDE VENUE</span><input class="form-input" name="longitude" type="number" min="-180" max="180" step="any" required /></label>
              <label class="form-group"><span class="form-label">RADIUS GEOFENCE (M)</span><input class="form-input" name="radius_m" type="number" min="20" max="1000" step="10" value="50" required /></label>
              <label class="form-group"><span class="form-label">MASA AKTIF (MENIT)</span><input class="form-input" name="duration_minutes" type="number" min="5" max="180" step="5" value="30" required /></label>
            </div>
            <p class="auth-feedback" role="status"></p>
            <button class="btn-tactical primary" type="submit">TERBITKAN QR PRESENSI</button>
            <div data-attendance-session-result></div>
          </form>
        `).join('') || '<p>Tidak ada agenda yang berlangsung hari ini. Sesi presensi hanya dapat diterbitkan untuk agenda hari ini.</p>'}
      </section>`;
  }

  bindDelegationForms(body) {
    const createForm = body.querySelector('#admin-delegation-create-form');
    if (createForm) {
      createForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const feedback = createForm.querySelector('[data-form-feedback="delegation"]');
        const submitBtn = createForm.querySelector('button[type="submit"]');
        if (feedback) feedback.textContent = 'Mengirim pengajuan delegasi...';
        if (submitBtn) submitBtn.disabled = true;

        const formData = new FormData(createForm);
        const payload = {
          event_name: formData.get('event_name'),
          event_category: formData.get('event_category'),
          destination: formData.get('destination'),
          funding_type: formData.get('funding_type'),
          requested_budget: Number(formData.get('requested_budget')) || 0,
          start_date: formData.get('start_date'),
          end_date: formData.get('end_date'),
          notes: formData.get('notes') || ''
        };

        try {
          const res = await this.api.createDelegation(payload);
          if (res.ok) {
            if (feedback) {
              feedback.className = 'auth-feedback success';
              feedback.textContent = 'Permohonan delegasi berhasil diajukan!';
            }
            createForm.reset();
            setTimeout(() => this.open(), 900);
          } else {
            if (feedback) {
              feedback.className = 'auth-feedback error';
              feedback.textContent = res.error || 'Gagal mengajukan delegasi';
            }
          }
        } catch (err) {
          if (feedback) {
            feedback.className = 'auth-feedback error';
            feedback.textContent = err.message || 'Terjadi kesalahan sistem';
          }
        } finally {
          if (submitBtn) submitBtn.disabled = false;
        }
      });
    }

    body.querySelectorAll('.admin-delegation-update-form').forEach(form => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const delegationId = form.dataset.delegationId;
        const feedback = form.querySelector('.auth-feedback');
        const submitBtn = form.querySelector('button[type="submit"]');
        if (feedback) feedback.textContent = 'Menyimpan perubahan delegasi...';
        if (submitBtn) submitBtn.disabled = true;

        const formData = new FormData(form);
        const payload = {
          status: formData.get('status'),
          mandate_letter_number: formData.get('mandate_letter_number'),
          approved_budget: Number(formData.get('approved_budget')) || 0,
          clawback_warning: formData.get('clawback_warning') === '1',
          notes: formData.get('notes')
        };

        try {
          const res = await this.api.updateDelegation(delegationId, payload);
          if (res.ok) {
            if (feedback) {
              feedback.className = 'auth-feedback success';
              feedback.textContent = 'Status delegasi berhasil diperbarui!';
            }
            setTimeout(() => this.open(), 700);
          } else {
            if (feedback) {
              feedback.className = 'auth-feedback error';
              feedback.textContent = res.error || 'Gagal memperbarui status delegasi';
            }
          }
        } catch (err) {
          if (feedback) {
            feedback.className = 'auth-feedback error';
            feedback.textContent = err.message || 'Terjadi galat jaringan';
          }
        } finally {
          if (submitBtn) submitBtn.disabled = false;
        }
      });
    });
  }


  bindAttendanceSessionForms(body) {
    body.querySelectorAll('[data-attendance-session-form]').forEach((form) => form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const feedback = form.querySelector('[role="status"]');
      const resultContainer = form.querySelector('[data-attendance-session-result]');
      const result = await this.api.createAttendanceSession({
        event_id: form.dataset.attendanceSessionForm,
        latitude: Number(form.elements.latitude.value),
        longitude: Number(form.elements.longitude.value),
        radius_m: Number(form.elements.radius_m.value),
        duration_minutes: Number(form.elements.duration_minutes.value)
      });
      if (!result.ok) {
        feedback.textContent = result.error;
        resultContainer.replaceChildren();
        return;
      }

      try {
        const qrData = JSON.stringify({
          type: 'hmif-attendance-session',
          event_id: result.data.session.event_id,
          session_id: result.data.session.id,
          token: result.data.token
        });
        const qrImage = await QRCode.toDataURL(qrData, { errorCorrectionLevel: 'Q', margin: 1, width: 240 });
        resultContainer.innerHTML = `
          <figure class="attendance-session-qr">
            <img src="${qrImage}" alt="QR presensi ${escapeHtml(result.data.event.title)}" width="240" height="240" />
            <figcaption>Aktif sampai ${escapeHtml(new Date(result.data.session.expires_at).toLocaleTimeString('id-ID'))} // sesi baru akan membatalkan QR ini.</figcaption>
          </figure>`;
        feedback.textContent = `QR aktif untuk radius ${result.data.session.radius_m} meter.`;
      } catch {
        feedback.textContent = 'Sesi tercatat, tetapi QR tidak dapat dibuat. Terbitkan sesi baru dan coba lagi.';
        resultContainer.replaceChildren();
      }
    }));
  }

  renderTutoringOperations(requestsResult, tutorsResult) {
    const requests = requestsResult?.ok && Array.isArray(requestsResult.data?.requests) ? requestsResult.data.requests : [];
    const tutors = tutorsResult?.ok && Array.isArray(tutorsResult.data?.tutors) ? tutorsResult.data.tutors : [];
    const weekdays = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    const tutorAvailability = (tutor) => (tutor.availability || []).map((slot) => (
      `${weekdays[slot.dayOfWeek]} ${slot.start}-${slot.end} ${slot.mode}`
    )).join('; ');
    return `
        <section class="admin-section tutoring-admin-section">
          <h3>KLINIK KODING // ${requests.length} PERMINTAAN</h3>
          ${requests.map((request) => `
            <article class="admin-record-row tutoring-admin-record" data-tutoring-request="${escapeHtml(request.id)}">
              <div><strong>${escapeHtml(request.student_name)} // ${escapeHtml(request.course)}</strong><small>${escapeHtml(request.topic)} // waktu pilihan: ${escapeHtml(request.preferred_time)}</small><p>${escapeHtml(request.request_message)}</p></div>
              <p>Status: ${escapeHtml(request.status)}${request.tutor_name ? ` // Tutor: ${escapeHtml(request.tutor_name)}` : ''}</p>
              ${request.status === 'Diterima' ? `
                <form class="tutoring-schedule-form" data-tutoring-schedule="${escapeHtml(request.id)}">
                  <label class="form-group"><span class="form-label">TUTOR // REKOMENDASI KEAHLIAN & SLOT</span><select class="form-select" name="tutor_account_id" required><option value="">Pilih tutor</option>${(request.suggested_tutors?.length ? request.suggested_tutors : tutors).map((tutor) => `<option value="${escapeHtml(tutor.account_id)}">${escapeHtml(tutor.name)} // ${escapeHtml((tutor.matched_skills?.length ? tutor.matched_skills : tutor.expertise || []).join(', ') || tutor.division || tutor.role_title)} // ${tutor.matching_slots?.length ? escapeHtml(tutor.matching_slots.map((slot) => `${slot.date} ${slot.start}-${slot.end} ${slot.mode}`).join('; ')) : escapeHtml(tutorAvailability(tutor))}</option>`).join('')}</select></label>
                  <p class="tutoring-match-hint">${request.suggested_tutors?.length ? `Kecocokan teratas: ${escapeHtml(request.suggested_tutors[0].name)} // keahlian ${(request.suggested_tutors[0].matched_skills || []).join(', ')} // slot ${request.suggested_tutors[0].matching_slots.length} pilihan cocok; pengurus tetap mengonfirmasi jadwal.` : tutors.length ? 'Belum ada tutor yang cocok sekaligus pada keahlian dan slot pilihan. Daftar tutor aktif tersedia untuk pemeriksaan manual; server tetap memvalidasi slot.' : 'Belum ada profil tutor yang aktif. Minta anggota clearance 2+ mengisi keahlian dan ketersediaan.'}</p>
                  <label class="form-group"><span class="form-label">WAKTU SESI (WIB)</span><input class="form-input" type="datetime-local" name="session_at" required /></label>
                  <label class="form-group"><span class="form-label">DURASI SESI</span><select class="form-select" name="duration_minutes"><option value="30">30 menit</option><option value="45">45 menit</option><option value="60" selected>60 menit</option><option value="90">90 menit</option><option value="120">120 menit</option></select></label>
                  <label class="form-group"><span class="form-label">MODE SESI</span><select class="form-select" name="mode"><option value="online">Online</option><option value="offline">Tatap muka</option></select></label>
                  <label class="form-group" data-tutoring-online><span class="form-label">TAUTAN MEET HTTPS</span><input class="form-input" name="meeting_url" type="url" maxlength="500" /></label>
                  <label class="form-group" data-tutoring-offline hidden><span class="form-label">LOKASI</span><input class="form-input" name="location" maxlength="240" /></label>
                  <label class="form-group"><span class="form-label">CATATAN UNTUK ANGGOTA</span><textarea class="form-textarea" name="admin_note" maxlength="1000"></textarea></label>
                  <p class="auth-feedback" role="status"></p>
                  <button class="btn-tactical primary" type="submit" ${tutors.length ? '' : 'disabled'}>JADWALKAN SESI</button>
                  <button class="btn-tactical" type="button" data-tutoring-reject="${escapeHtml(request.id)}">TOLAK PERMINTAAN</button>
                </form>` : request.status === 'Dijadwalkan' ? `
                  <p>${escapeHtml(request.session_at || '')} // ${escapeHtml(request.mode || '')} // ${escapeHtml(request.meeting_url || request.location || '')}</p>
                  <button class="btn-tactical" type="button" data-tutoring-complete="${escapeHtml(request.id)}">TANDAI SELESAI</button>` : ''}
            </article>
          `).join('') || '<p>Belum ada permintaan Klinik Koding.</p>'}
        </section>`;
  }

  bindTutoringForms(body) {
    body.querySelectorAll('[data-tutoring-schedule]').forEach((form) => {
      const mode = form.elements.mode;
      const updateModeFields = () => {
        const online = mode.value === 'online';
        form.querySelector('[data-tutoring-online]').hidden = !online;
        form.querySelector('[data-tutoring-offline]').hidden = online;
        form.elements.meeting_url.required = online;
        form.elements.location.required = !online;
      };
      mode.addEventListener('change', updateModeFields);
      updateModeFields();
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const feedback = form.querySelector('[role="status"]');
        const result = await this.api.scheduleTutoringRequest(form.dataset.tutoringSchedule, {
          tutor_account_id: form.elements.tutor_account_id.value,
          session_at: new Date(`${form.elements.session_at.value}:00+07:00`).toISOString(),
          duration_minutes: Number(form.elements.duration_minutes.value),
          mode: mode.value,
          meeting_url: form.elements.meeting_url.value.trim(),
          location: form.elements.location.value.trim(),
          admin_note: form.elements.admin_note.value.trim()
        });
        feedback.textContent = result.ok ? 'SESI BERHASIL DIJADWALKAN' : result.error;
        if (result.ok) await this.open();
      });
    });
    body.querySelectorAll('[data-tutoring-reject]').forEach((button) => button.addEventListener('click', async () => {
      const note = window.prompt('Alasan penolakan (opsional):') || '';
      const result = await this.api.setTutoringRequestStatus(button.dataset.tutoringReject, 'Ditolak', note);
      if (result.ok) await this.open();
      else button.closest('[data-tutoring-request]').querySelector('[role="status"]')?.replaceChildren(document.createTextNode(result.error));
    }));
    body.querySelectorAll('[data-tutoring-complete]').forEach((button) => button.addEventListener('click', async () => {
      const result = await this.api.setTutoringRequestStatus(button.dataset.tutoringComplete, 'Selesai');
      if (result.ok) await this.open();
      else button.closest('[data-tutoring-request]').querySelector('[role="status"]')?.replaceChildren(document.createTextNode(result.error));
    }));
  }

  renderKnowledgeDiscussionModeration(result) {
    const discussions = result?.ok && Array.isArray(result.data?.discussions) ? result.data.discussions : [];
    return `
        <section class="admin-section">
          <h3>MODERASI DISKUSI SOAL // ${discussions.length}</h3>
          ${discussions.map((discussion) => `
            <article class="admin-record-row" data-discussion-review="${escapeHtml(discussion.id)}">
              <span><strong>${escapeHtml(discussion.author_name)}</strong><small>${escapeHtml(discussion.resource_id)} // ${escapeHtml(formatDate(discussion.created_at))}</small><p>${escapeHtml(discussion.message)}</p></span>
              <button class="btn-tactical primary" type="button" data-moderate-discussion="published" data-discussion-id="${escapeHtml(discussion.id)}">TERBITKAN</button>
              <button class="btn-tactical" type="button" data-moderate-discussion="rejected" data-discussion-id="${escapeHtml(discussion.id)}">TOLAK</button>
              <p class="auth-feedback" role="status"></p>
            </article>
          `).join('') || '<p>Tidak ada diskusi yang menunggu moderasi.</p>'}
        </section>`;
  }

  renderPortfolioReviewQueue(articlesResult, callsResult) {
    const articles = articlesResult?.ok && Array.isArray(articlesResult.data?.articles) ? articlesResult.data.articles : [];
    const calls = callsResult?.ok && Array.isArray(callsResult.data?.calls) ? callsResult.data.calls : [];
    return `
      <section class="admin-section portfolio-review-queue">
        <h3>PEER REVIEW // TECH JOURNAL & OPEN PROJECT</h3>
        <h4>ARTIKEL TEKNIS // ${articles.length}</h4>
        ${articles.map((article) => `
          <article class="admin-record-row" data-portfolio-review-row="article:${escapeHtml(article.id)}">
            <div><strong>${escapeHtml(article.payload.title)}</strong><small>${escapeHtml(article.author_name)} // ${escapeHtml(article.payload.category)}</small><p>${escapeHtml(article.payload.summary)}</p><p>${escapeHtml(article.payload.body)}</p></div>
            <div class="studio-actions">
              <label class="form-group"><span class="form-label">CATATAN PEER REVIEW</span><input class="form-input" maxlength="1000" data-portfolio-review-note /></label>
              <button class="btn-tactical primary" type="button" data-portfolio-review="article" data-portfolio-id="${escapeHtml(article.id)}" data-review-status="published">TERBITKAN</button>
              <button class="btn-tactical" type="button" data-portfolio-review="article" data-portfolio-id="${escapeHtml(article.id)}" data-review-status="needs_revision">MINTA REVISI</button>
              <button class="btn-tactical danger" type="button" data-portfolio-review="article" data-portfolio-id="${escapeHtml(article.id)}" data-review-status="rejected">TOLAK</button>
            </div>
          </article>`).join('') || '<p>Tidak ada artikel menunggu peer review.</p>'}
        <h4>OPEN PROJECT // ${calls.length}</h4>
        ${calls.map((call) => `
          <article class="admin-record-row" data-portfolio-review-row="call:${escapeHtml(call.id)}">
            <div><strong>${escapeHtml(call.payload.title)}</strong><small>${escapeHtml(call.owner_name)} // ${escapeHtml(call.payload.type)} // ${escapeHtml(call.payload.event_name)}</small><p>${escapeHtml(call.payload.description)}</p><p>Peran: ${call.payload.roles.map(escapeHtml).join(', ')} // tenggat ${escapeHtml(call.payload.deadline)}</p></div>
            <div class="studio-actions">
              <label class="form-group"><span class="form-label">CATATAN REVIEW</span><input class="form-input" maxlength="1000" data-portfolio-review-note /></label>
              <button class="btn-tactical primary" type="button" data-portfolio-review="call" data-portfolio-id="${escapeHtml(call.id)}" data-review-status="published">TERBITKAN</button>
              <button class="btn-tactical danger" type="button" data-portfolio-review="call" data-portfolio-id="${escapeHtml(call.id)}" data-review-status="rejected">TOLAK</button>
            </div>
          </article>`).join('') || '<p>Tidak ada open project menunggu review.</p>'}
      </section>`;
  }

  renderCareerMentorshipQueue(result) {
    const requests = result?.ok && Array.isArray(result.data?.requests) ? result.data.requests : [];
    const sessionLabels = {
      technical_interview: 'Simulasi technical interview',
      cv_review: 'Review CV / LinkedIn',
      code_review: 'Code review'
    };
    return `
      <section class="admin-section career-mentorship-admin-queue">
        <h3>MENTORSHIP HUB // ${requests.length} PERMINTAAN</h3>
        ${requests.map((request) => `
          <article class="admin-record-row" data-career-mentorship-admin="${escapeHtml(request.id)}">
            <div>
              <strong>${escapeHtml(sessionLabels[request.session_type] || request.session_type)} // ${escapeHtml(request.mentor_name)}</strong>
              <small>Mahasiswa: ${escapeHtml(request.student_name)} · ${escapeHtml(new Date(request.preferred_at).toLocaleString('id-ID'))} · pilihan ${escapeHtml(request.preferred_mode)} · ${escapeHtml(request.status)}</small>
              <p>${escapeHtml(request.topic)}</p>
              ${request.mentor_note ? `<p>Catatan: ${escapeHtml(request.mentor_note)}</p>` : ''}
              ${request.meeting_url ? `<p><a href="${escapeHtml(request.meeting_url)}" target="_blank" rel="noopener noreferrer">TAUTAN SESI ↗</a></p>` : ''}
              ${request.meeting_location ? `<p>Lokasi: ${escapeHtml(request.meeting_location)}</p>` : ''}
            </div>
            ${request.status === 'requested' ? `
              <form class="career-mentorship-admin-form" data-career-mentorship-admin-form="${escapeHtml(request.id)}">
                <label class="form-group"><span class="form-label">MODE</span><select class="form-select" name="meeting_mode"><option value="${escapeHtml(request.preferred_mode)}">${request.preferred_mode === 'online' ? 'Online' : 'Tatap muka'}</option><option value="${request.preferred_mode === 'online' ? 'offline' : 'online'}">${request.preferred_mode === 'online' ? 'Tatap muka' : 'Online'}</option></select></label>
                <label class="form-group" data-career-admin-online><span class="form-label">TAUTAN MEETING HTTPS</span><input class="form-input" name="meeting_url" type="url" maxlength="2000" /></label>
                <label class="form-group" data-career-admin-offline hidden><span class="form-label">LOKASI</span><input class="form-input" name="meeting_location" maxlength="240" /></label>
                <label class="form-group"><span class="form-label">CATATAN</span><input class="form-input" name="mentor_note" maxlength="1000" /></label>
                <p class="auth-feedback" role="status"></p>
                <button class="btn-tactical primary" type="submit">KONFIRMASI</button>
                <button class="btn-tactical" type="button" data-career-admin-status="declined" data-career-request-id="${escapeHtml(request.id)}">TOLAK</button>
              </form>` : request.status === 'confirmed' ? `<button class="btn-tactical primary" type="button" data-career-admin-status="completed" data-career-request-id="${escapeHtml(request.id)}">TANDAI SELESAI</button>` : ''}
          </article>`).join('') || '<p>Belum ada permintaan mentorship.</p>'}
      </section>`;
  }

  bindCareerMentorshipQueue(body) {
    body.querySelectorAll('[data-career-mentorship-admin-form]').forEach((form) => {
      const mode = form.elements.meeting_mode;
      const updateMode = () => {
        const online = mode.value === 'online';
        form.querySelector('[data-career-admin-online]').hidden = !online;
        form.querySelector('[data-career-admin-offline]').hidden = online;
        form.elements.meeting_url.required = online;
        form.elements.meeting_location.required = !online;
      };
      mode.addEventListener('change', updateMode);
      updateMode();
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const result = await this.api.updateCareerMentorshipRequest(form.dataset.careerMentorshipAdminForm, {
          status: 'confirmed',
          meeting_mode: mode.value,
          meeting_url: form.elements.meeting_url.value.trim(),
          meeting_location: form.elements.meeting_location.value.trim(),
          mentor_note: form.elements.mentor_note.value.trim()
        });
        if (!result.ok) {
          form.querySelector('[role="status"]').textContent = result.error;
          return;
        }
        await this.open();
      });
    });
    body.querySelectorAll('[data-career-admin-status]').forEach((button) => button.addEventListener('click', async () => {
      const result = await this.api.updateCareerMentorshipRequest(button.dataset.careerRequestId, { status: button.dataset.careerAdminStatus });
      if (!result.ok) {
        button.closest('[data-career-mentorship-admin]')?.querySelector('[role="status"]')?.replaceChildren(document.createTextNode(result.error));
        return;
      }
      await this.open();
    }));
  }

  bindPortfolioReviewQueue(body) {
    body.querySelectorAll('[data-portfolio-review]').forEach((button) => button.addEventListener('click', async () => {
      const row = button.closest('[data-portfolio-review-row]');
      const note = row.querySelector('[data-portfolio-review-note]').value.trim();
      const isArticle = button.dataset.portfolioReview === 'article';
      const result = isArticle
        ? await this.api.reviewTechArticle(button.dataset.portfolioId, button.dataset.reviewStatus, note)
        : await this.api.reviewProjectCall(button.dataset.portfolioId, button.dataset.reviewStatus, note);
      if (!result.ok) {
        row.querySelector('[data-portfolio-review-note]').setCustomValidity(result.error);
        row.querySelector('[data-portfolio-review-note]').reportValidity();
        return;
      }
      await this.open();
    }));
  }

  bindKnowledgeDiscussionModeration(body) {
    body.querySelectorAll('[data-moderate-discussion]').forEach((button) => button.addEventListener('click', async () => {
      const record = button.closest('[data-discussion-review]');
      const feedback = record.querySelector('[role="status"]');
      const result = await this.api.moderateKnowledgeDiscussion(button.dataset.discussionId, button.dataset.moderateDiscussion);
      if (!result.ok) {
        feedback.textContent = result.error;
        return;
      }
      feedback.textContent = result.data.discussion.status === 'published' ? 'DISKUSI DITERBITKAN' : 'DISKUSI DITOLAK';
      record.remove();
    }));
  }

  bindEventRegistrationForms(body) {
    body.querySelectorAll('[data-check-in-event]').forEach((form) => form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const feedback = form.querySelector('[role="status"]');
      const result = await this.api.checkInEvent(form.dataset.checkInEvent, form.elements.ticket_id.value.trim(), form.elements.ticket_token.value.trim());
      feedback.textContent = result.ok ? result.data.message : result.error;
      if (result.ok) form.reset();
    }));
    body.querySelectorAll('[data-check-in-event]').forEach((form) => form.querySelector('[data-scan-ticket]').addEventListener('click', () => this.scanEventTicket(form)));
    body.querySelectorAll('[data-check-in-event]').forEach((form) => form.querySelector('[data-stop-scan]').addEventListener('click', () => {
      const video = form.querySelector('[data-ticket-scanner]');
      this.stopScanner(video.srcObject, video);
      form.querySelector('[role="status"]').textContent = 'Pemindaian dibatalkan. Anda dapat mencoba lagi atau memasukkan tiket secara manual.';
    }));
    body.querySelectorAll('[data-issue-certificates]').forEach((button) => button.addEventListener('click', async () => {
      const result = await this.api.issueEventCertificates(button.dataset.issueCertificates);
      const feedback = body.querySelector(`[data-certificate-feedback="${button.dataset.issueCertificates}"]`);
      if (!result.ok) {
        feedback.textContent = result.error;
        return;
      }
      feedback.innerHTML = result.data.issued
        ? `${escapeHtml(String(result.data.issued))} sertifikat diterbitkan: ${result.data.certificate_ids.map((id) => `<a href="/verify/${encodeURIComponent(id)}" target="_blank" rel="noopener noreferrer">${escapeHtml(id)}</a>`).join(', ')}`
        : 'Belum ada peserta dengan presensi tervalidasi yang memerlukan sertifikat.';
    }));
  }

  async scanEventTicket(form) {
    const feedback = form.querySelector('[role="status"]');
    const video = form.querySelector('[data-ticket-scanner]');
    if (video.srcObject) this.stopScanner(video.srcObject, video);
    if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) {
      feedback.textContent = 'Pemindaian kamera tidak tersedia di browser ini. Masukkan ID tiket dan token secara manual.';
      return;
    }
    try {
      const detector = new BarcodeDetector({ formats: ['qr_code'] });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      this.activeScanners.set(stream, video);
      video.srcObject = stream;
      video.hidden = false;
      form.querySelector('[data-stop-scan]').hidden = false;
      await video.play();
      const scan = async () => {
        if (video.hidden || !stream.active) return;
        try {
          const [code] = await detector.detect(video);
          if (code) {
            const payload = JSON.parse(code.rawValue);
            if (payload.type !== 'hmif-event-ticket' || typeof payload.id !== 'string' || typeof payload.token !== 'string') {
              throw new Error('QR bukan tiket event HMIF yang valid.');
            }
            form.elements.ticket_id.value = payload.id;
            form.elements.ticket_token.value = payload.token;
            feedback.textContent = 'Tiket dipindai. Konfirmasikan presensi untuk menyelesaikan check-in.';
            this.stopScanner(stream, video);
            return;
          }
        } catch (error) {
          feedback.textContent = error.message || 'QR tidak dapat dibaca.';
          this.stopScanner(stream, video);
          return;
        }
        requestAnimationFrame(scan);
      };
      scan();
    } catch {
      feedback.textContent = 'Kamera tidak dapat dibuka. Periksa izin browser atau masukkan tiket secara manual.';
      this.stopScanner(video.srcObject, video);
    }
  }

  stopScanner(stream, video) {
    if (stream?.getTracks) {
      stream.getTracks().forEach((track) => track.stop());
      this.activeScanners.delete(stream);
    }
    if (video) {
      video.pause();
      video.srcObject = null;
      video.hidden = true;
      video.closest('[data-check-in-event]')?.querySelector('[data-stop-scan]')?.setAttribute('hidden', '');
    }
  }

  stopAllScanners() {
    this.activeScanners.forEach((video, stream) => this.stopScanner(stream, video));
  }

  bindBphForms(body, aspirationsResult) {
    body.querySelectorAll('.admin-response-form').forEach((form) => {
      const status = form.querySelector('[name="status"]');
      const aspiration = aspirationsResult.data.find((item) => item.id === form.dataset.aspirationId);
      if (aspiration) {
        const currentStatus = aspiration.status === 'Ditinjau' ? 'Dalam Investigasi' : aspiration.status;
        if ([...status.options].some((option) => option.value === currentStatus)) status.value = currentStatus;
      }
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const feedback = form.querySelector('[role="status"]');
        const result = await this.api.respondAspiration(form.dataset.aspirationId, form.elements.response.value.trim(), status.value);
        if (form.elements.is_rdp_agenda) {
          await this.api.setAspirationRdpAgenda(form.dataset.aspirationId, {
            is_rdp_agenda: form.elements.is_rdp_agenda.checked,
            rdp_notes: form.elements.rdp_notes.value.trim()
          });
        }
        feedback.textContent = result.ok ? 'TANGGAPAN TERSIMPAN' : result.error;
        if (result.ok) await this.refreshData();
      });
    });

    const ledgerForm = body.querySelector('#admin-ledger-form');
    const ledgerFeedback = body.querySelector('[data-form-feedback="ledger"]');
    const ledgerReceiptField = ledgerForm.querySelector('[data-ledger-receipt-field]');
    const updateReceiptRequirement = () => {
      const required = ledgerForm.elements.type.value === 'EXPENSE';
      ledgerReceiptField.hidden = !required;
      ledgerForm.elements.receipt.required = required;
    };
    ledgerForm.elements.type.addEventListener('change', updateReceiptRequirement);
    updateReceiptRequirement();
    ledgerForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(ledgerForm));
      const receiptFile = payload.receipt;
      delete payload.receipt;
      const result = await this.api.addTransaction(payload, receiptFile?.size ? receiptFile : null);
      ledgerFeedback.textContent = result.ok ? 'TRANSAKSI TERSIMPAN' : result.error;
      if (result.ok) await this.refreshData();
    });

    const receiptDialog = body.querySelector('.ledger-receipt-dialog');
    receiptDialog.querySelector('[data-ledger-receipt-close]').addEventListener('click', () => receiptDialog.close());
    body.querySelectorAll('[data-ledger-receipt]').forEach((button) => button.addEventListener('click', () => {
      const preview = receiptDialog.querySelector('[data-ledger-receipt-preview]');
      const source = `/api/ledger/receipts/${encodeURIComponent(button.dataset.ledgerReceipt)}`;
      receiptDialog.querySelector('[data-ledger-receipt-title]').textContent = button.dataset.ledgerName;
      preview.replaceChildren();
      if (button.dataset.ledgerMime === 'application/pdf') {
        const frame = document.createElement('iframe');
        frame.src = source;
        frame.title = `Bukti transaksi ${button.dataset.ledgerName}`;
        preview.append(frame);
      } else {
        const image = document.createElement('img');
        image.src = source;
        image.alt = `Bukti transaksi ${button.dataset.ledgerName}`;
        preview.append(image);
      }
      receiptDialog.showModal();
    }));
  }

  bindInterventionActions(body) {
    // Tombol Dampingi Pengguna (Impersonasi)
    body.querySelectorAll('[data-admin-action="impersonate"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const targetNim = btn.dataset.targetNim;
        const targetName = btn.dataset.targetName;
        const confirmMsg = `PERINGATAN INTERVENSI TEKNIS:\nApakah Anda yakin ingin masuk ke Mode Dampingi Pengguna untuk:\n${targetName} (${targetNim})?\n\nSesi Anda akan beralih melihat antarmuka persis dari sudut pandang akun tersebut.`;
        if (!confirm(confirmMsg)) return;

        const reason = prompt('Alasan Intervensi / Pendampingan Teknis:', 'Bantuan teknis kendala akses pengguna');
        btn.disabled = true;
        btn.textContent = 'Menghubungkan...';

        try {
          const res = await this.api.impersonateUser(targetNim, reason || 'Bantuan teknis langsung');
          if (res.ok) {
            alert(`BERHASIL TERHUBUNG // Sekarang masuk sebagai ${targetName}.`);
            window.location.reload();
          } else {
            alert(res.error || 'Gagal mengaktifkan mode impersonasi.');
            btn.disabled = false;
            btn.textContent = '👁️ DAMPINGI PENGGUNA';
          }
        } catch (err) {
          alert(err.message || 'Terjadi galat jaringan');
          btn.disabled = false;
          btn.textContent = '👁️ DAMPINGI PENGGUNA';
        }
      });
    });

    // Tombol Reset Password Darurat
    body.querySelectorAll('[data-admin-action="reset-pwd"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const targetNim = btn.dataset.targetNim;
        const targetName = btn.dataset.targetName;
        const newPwd = prompt(`INTERVENSI RESET PASSWORD DARURAT:\nMasukkan Password Baru Sementara untuk ${targetName} (${targetNim}):\n(Minimal 12 karakter)`, 'HMIF2026@' + targetNim);
        if (!newPwd) return;

        if (newPwd.length < 12) {
          alert('Password minimal 12 karakter.');
          return;
        }

        const reason = prompt('Alasan Reset Password (Dicatat ke Audit Trail):', 'Permintaan pemulihan akses oleh mahasiswa bersangkutan');
        btn.disabled = true;
        btn.textContent = 'Mereset...';

        try {
          const res = await this.api.resetUserPasswordAdmin(targetNim, newPwd, reason || 'Pemulihan akses');
          if (res.ok) {
            alert(`PASSWORD BERHASIL DIRESET!\nAkun: ${targetNim}\nPassword Baru: ${newPwd}\n\nSilakan sampaikan kredensial sementara ini kepada yang bersangkutan secara aman.`);
            await this.refreshData();
          } else {
            alert(res.error || 'Gagal mereset password.');
          }
        } catch (err) {
          alert(err.message || 'Terjadi kesalahan sistem.');
        } finally {
          btn.disabled = false;
          btn.textContent = '🔑 RESET PASSWORD';
        }
      });
    });
  }

  bindUserForms(body, usersResult) {
    body.querySelectorAll('.admin-user-form').forEach((form) => {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const feedback = form.querySelector('[role="status"]');
        const selectedRole = form.elements.role?.value;
        const result = selectedRole !== form.dataset.userRole
          ? await this.api.setUserRole(form.dataset.userNim, selectedRole)
          : form.elements.academic_curate && String(form.elements.academic_curate.checked) !== form.dataset.userAcademicCurate
            ? await this.api.setAcademicCurator(form.dataset.userNim, form.elements.academic_curate.checked)
            : await this.api.updateUserRole(form.dataset.userNim, {
              clearance_level: Number(form.elements.clearance_level?.value || 1)
            });
        feedback.textContent = result.ok ? 'IZIN DIPERBARUI' : result.error;
        if (result.ok) await this.refreshData();
      });
    });

    const createForm = body.querySelector('#admin-create-user-form');
    createForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const feedback = createForm.querySelector('[role="status"]');
      const result = await this.api.createUser(Object.fromEntries(new FormData(createForm)));
      feedback.textContent = result.ok ? 'AKUN DIBUAT DENGAN CLEARANCE LEVEL 1' : result.error;
      if (result.ok) await this.refreshData();
    });
  }

  renderTaskBoard() {
    const columns = [
      ['todo', 'TO-DO'],
      ['in_progress', 'IN PROGRESS'],
      ['review', 'UNDER REVIEW'],
      ['done', 'DONE']
    ];
    const metrics = getOrganizationTaskMetrics(this.tasks);
    const statusOptions = columns.map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
    return `
      <section class="admin-section">
        <h3>PELACAKAN TUGAS & PROGRAM KERJA // KANBAN</h3>
        <dl class="organization-task-kpis" aria-label="Indikator kinerja tugas">
          <div><dt>TOTAL TUGAS</dt><dd>${metrics.total}</dd></div>
          <div><dt>SELESAI</dt><dd>${metrics.counts.done} // ${metrics.completionRate}%</dd></div>
          <div><dt>DALAM PROGRES / REVIEW</dt><dd>${metrics.counts.in_progress + metrics.counts.review}</dd></div>
          <div><dt>TERLAMBAT</dt><dd>${metrics.overdue}</dd></div>
        </dl>
        <div class="organization-task-board">
          ${columns.map(([status, label]) => `
            <section class="organization-task-column" aria-label="${label}">
              <h4>${label} // ${metrics.counts[status]}</h4>
              ${(this.tasks.filter((task) => task.status === status).map((task) => `
                <article class="organization-task-card">
                  <strong>${escapeHtml(task.title)}</strong>
                  <p>${escapeHtml(task.description)}</p>
                  <small>PIC: ${escapeHtml(task.pic_name)}${task.proker_title ? ` // ${escapeHtml(task.proker_title)}` : ''}${task.due_date ? ` // Tenggat ${escapeHtml(formatDate(`${task.due_date}T00:00:00`))}` : ''}</small>
                  ${(task.status_history || []).length ? `<small class="organization-task-history">Riwayat status: ${(task.status_history || []).slice(0, 3).map((entry) => `${entry.old_status ? `${escapeHtml(entry.old_status)} → ` : ''}${escapeHtml(entry.new_status)} oleh ${escapeHtml(entry.actor_nim)}`).join(' · ')}</small>` : ''}
                  <div class="organization-task-status">
                    <select class="form-select" data-task-status="${escapeHtml(task.id)}">${statusOptions.replace(`value="${status}"`, `value="${status}" selected`)}</select>
                    <button class="btn-tactical" type="button" data-task-save="${escapeHtml(task.id)}">PINDAHKAN</button>
                  </div>
                  <p class="auth-feedback" data-task-feedback="${escapeHtml(task.id)}" role="status"></p>
                </article>`).join('')) || '<p>Belum ada tugas di kolom ini.</p>'}
            </section>`).join('')}
        </div>
        <form id="organization-task-form" class="admin-form">
          <h4>TAMBAH TUGAS</h4>
          <div class="admin-form-grid">
            <label class="form-group"><span class="form-label">JUDUL</span><input class="form-input" name="title" maxlength="180" required /></label>
            <label class="form-group"><span class="form-label">PIC // AKUN</span><select class="form-select" name="pic_account_id" required><option value="">Pilih penanggung jawab</option>${this.taskAssignees.map((user) => `<option value="${escapeHtml(user.account_id)}">${escapeHtml(user.name)} // ${escapeHtml(user.nim)}${user.division ? ` · ${escapeHtml(user.division)}` : ''}</option>`).join('')}</select></label>
            <label class="form-group"><span class="form-label">TENGGAT</span><input class="form-input" type="date" name="due_date" /></label>
            <label class="form-group"><span class="form-label">PROGRAM KERJA TERKAIT</span><select class="form-select" name="proker_id"><option value="">Tidak terkait</option>${this.proker.map((program) => `<option value="${escapeHtml(program.id)}">${escapeHtml(program.title)}</option>`).join('')}</select></label>
          </div>
          <label class="form-group"><span class="form-label">DESKRIPSI</span><textarea class="form-textarea" name="description" maxlength="2000"></textarea></label>
          <p class="auth-feedback" data-task-create-feedback role="status"></p>
          <button class="btn-tactical primary" type="submit">BUAT TUGAS</button>
        </form>
      </section>`;
  }

  bindTaskForms(body) {
    body.querySelector('#organization-task-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const feedback = form.querySelector('[data-task-create-feedback]');
      const payload = Object.fromEntries(new FormData(form));
      payload.due_date ||= null;
      payload.proker_id ||= null;
      const result = await this.api.createOrganizationTask(payload);
      feedback.textContent = result.ok ? 'TUGAS DITAMBAHKAN KE PAPAN.' : result.error;
      if (result.ok) await this.open();
    });
    body.querySelectorAll('[data-task-save]').forEach((button) => button.addEventListener('click', async () => {
      const id = button.dataset.taskSave;
      const feedback = body.querySelector(`[data-task-feedback="${id}"]`);
      const status = body.querySelector(`[data-task-status="${id}"]`).value;
      const result = await this.api.updateOrganizationTask(id, { status });
      if (!result.ok) {
        feedback.textContent = result.error;
        return;
      }
      await this.open();
    }));
  }
}
