const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
}[character]));

const formatDate = (value) => value ? new Date(value).toLocaleDateString('id-ID') : '-';

export class AdminConsole {
    constructor(api, { openModal, closeModal, refreshData }) {
        this.api = api;
        this.openModal = openModal;
        this.closeModal = closeModal;
        this.refreshData = refreshData;
        this.proker = [];
    }

    async open() {
        if (!this.api.isSuperadmin && this.api.clearanceLevel < 2) return;

        const title = document.getElementById('prts-modal-title');
        const body = document.getElementById('prts-modal-content');
        if (!title || !body) return;

        title.textContent = 'PRTS // ADMIN CONSOLE';
        body.innerHTML = '<p class="auth-feedback" role="status">Memuat data dan izin akses...</p>';
        this.openModal();

        const requests = [this.api.getProkerList(), this.api.getCalendarEvents()];
        const hasBphAccess = this.api.isSuperadmin || this.api.clearanceLevel >= 3;
        if (hasBphAccess) requests.push(this.api.getAspirations(), this.api.getFinancialLedger());
        if (this.api.isSuperadmin) requests.push(this.api.getAllUsers());
        const results = await Promise.all(requests);
        let index = 0;
        const prokerResult = results[index++];
        const calendarResult = results[index++];
        const aspirationsResult = hasBphAccess ? results[index++] : null;
        const ledgerResult = hasBphAccess ? results[index++] : null;
        const usersResult = this.api.isSuperadmin ? results[index] : null;

        this.proker = prokerResult.ok && Array.isArray(prokerResult.data) ? prokerResult.data : [];
        const calendar = calendarResult.ok && Array.isArray(calendarResult.data) ? calendarResult.data : [];
        const errors = results.filter((result) => !result.ok).map((result) => result.error);

        body.innerHTML = `
      <p class="auth-feedback" role="status">${errors.map(escapeHtml).join('<br>')}</p>
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
        <div class="admin-record-list">${calendar.map((event) => `<p>${escapeHtml(event.date_str)} // ${escapeHtml(event.title)} // ${escapeHtml(event.division)}</p>`).join('')}</div>
        <form id="admin-calendar-form" class="admin-form">
          <div class="admin-form-grid">
            <label class="form-group"><span class="form-label">TANGGAL</span><input class="form-input" name="date_str" type="date" required /></label>
            <label class="form-group"><span class="form-label">JENIS</span><select class="form-select" name="type"><option value="proker">Program Kerja</option><option value="academic">Akademik</option><option value="psdm">PSDM</option><option value="litbang">Litbang</option></select></label>
          </div>
          <label class="form-label" for="admin-calendar-title">NAMA KEGIATAN</label>
          <input class="form-input" id="admin-calendar-title" name="title" maxlength="180" required />
          <div class="admin-form-grid">
            <label class="form-group"><span class="form-label">DIVISI</span><input class="form-input" name="division" maxlength="80" required /></label>
            <label class="form-group"><span class="form-label">LOKASI</span><input class="form-input" name="location" maxlength="180" /></label>
          </div>
          <label class="form-label" for="admin-calendar-desc">KETERANGAN</label>
          <textarea class="form-textarea" id="admin-calendar-desc" name="desc" maxlength="3000"></textarea>
          <p class="auth-feedback" data-form-feedback="calendar" role="status"></p>
          <button class="btn-tactical primary" type="submit">TAMBAH KE KALENDER</button>
        </form>
      </section>
      ${hasBphAccess ? this.renderBphSections(aspirationsResult, ledgerResult) : ''}
      ${this.api.isSuperadmin ? this.renderUsers(usersResult) : ''}
      ${this.api.isSuperadmin ? '<button class="btn-tactical primary" type="button" data-open-site-studio>BUKA SITE STUDIO</button>' : ''}
      <button class="btn-tactical" type="button" data-admin-close>TUTUP CONSOLE</button>
    `;

        this.bindProkerForm(body);
        this.bindCalendarForm(body);
        if (hasBphAccess) this.bindBphForms(body, aspirationsResult);
        if (this.api.isSuperadmin) this.bindUserForms(body, usersResult);
        body.querySelector('[data-open-site-studio]')?.addEventListener('click', () => window.prtsApp.openSiteStudio());
        body.querySelector('[data-admin-close]').addEventListener('click', this.closeModal);
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
            <select class="form-select" id="status-${escapeHtml(item.id)}" name="status"><option>Ditindaklanjuti</option><option>Selesai</option><option>Ditinjau</option></select>
            <p class="auth-feedback" role="status"></p>
            <button class="btn-tactical primary" type="submit">SIMPAN TANGGAPAN</button>
          </form>
        `).join('') || '<p>Belum ada aspirasi.</p>'}
      </section>
      <section class="admin-section">
        <h3>BUKU KAS // SALDO ${escapeHtml(ledger?.summary?.balance ?? 0)}</h3>
        <div class="admin-record-list">${(ledger?.transactions || []).slice(0, 12).map((item) => `<p>${escapeHtml(item.date)} // ${escapeHtml(item.type)} // ${escapeHtml(item.description)} // ${escapeHtml(item.amount)}</p>`).join('')}</div>
        <form id="admin-ledger-form" class="admin-form">
          <div class="admin-form-grid">
            <label class="form-group"><span class="form-label">JENIS</span><select class="form-select" name="type"><option value="INCOME">Pemasukan</option><option value="EXPENSE">Pengeluaran</option></select></label>
            <label class="form-group"><span class="form-label">NOMINAL</span><input class="form-input" name="amount" type="number" min="1" step="1000" required /></label>
            <label class="form-group"><span class="form-label">KATEGORI</span><input class="form-input" name="category" maxlength="80" /></label>
            <label class="form-group"><span class="form-label">DIVISI</span><input class="form-input" name="division" maxlength="80" /></label>
          </div>
          <label class="form-label" for="admin-ledger-description">KETERANGAN TRANSAKSI</label>
          <input class="form-input" id="admin-ledger-description" name="description" maxlength="240" required />
          <p class="auth-feedback" data-form-feedback="ledger" role="status"></p>
          <button class="btn-tactical primary" type="submit">CATAT TRANSAKSI</button>
        </form>
      </section>
    `;
    }

    renderUsers(usersResult) {
        const users = usersResult?.ok ? usersResult.data.users || [] : [];
        return `
      <section class="admin-section">
        <h3>PENGELOLAAN AKUN // ${users.length}</h3>
        ${users.map((user) => `
          <form class="admin-user-form admin-form" data-user-nim="${escapeHtml(user.nim)}" data-user-role="${escapeHtml(user.role || 'member')}">
            <p>${escapeHtml(user.name)} // ${escapeHtml(user.nim)} // ${escapeHtml(user.role || 'member')} // ${escapeHtml(user.role_title)}</p>
            <label class="form-label" for="role-${escapeHtml(user.nim)}">ROLE</label>
            <select class="form-select" id="role-${escapeHtml(user.nim)}" name="role"><option value="member" ${(user.role || 'member') === 'member' ? 'selected' : ''}>MEMBER</option><option value="superadmin" ${user.role === 'superadmin' ? 'selected' : ''}>SUPERADMIN</option></select>
            ${user.role === 'superadmin'
                ? '<p class="auth-feedback">CLEARANCE ANGKA TIDAK BERLAKU UNTUK SUPERADMIN</p>'
                : `<label class="form-label" for="clearance-${escapeHtml(user.nim)}">CLEARANCE ANGGOTA</label>
                   <select class="form-select" id="clearance-${escapeHtml(user.nim)}" name="clearance_level">
                     ${[1, 2, 3].map((level) => `<option value="${level}" ${user.clearance_level === level ? 'selected' : ''}>LEVEL ${level}</option>`).join('')}
                   </select>`}
            <p class="auth-feedback" role="status"></p>
            <button class="btn-tactical primary" type="submit">PERBARUI IZIN</button>
          </form>
        `).join('') || '<p>Data akun tidak tersedia.</p>'}
        <form id="admin-create-user-form" class="admin-form">
          <h4>BUAT AKUN ANGGOTA</h4>
          <div class="admin-form-grid">
            <label class="form-group"><span class="form-label">NIM / ID</span><input class="form-input" name="nim" minlength="3" maxlength="32" required /></label>
            <label class="form-group"><span class="form-label">NAMA</span><input class="form-input" name="name" maxlength="120" required /></label>
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
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const result = await this.api.createCalendarEvent(Object.fromEntries(new FormData(form)));
            feedback.textContent = result.ok ? 'AGENDA TERSIMPAN' : result.error;
            if (result.ok) await this.refreshData();
        });
    }

    bindBphForms(body, aspirationsResult) {
        body.querySelectorAll('.admin-response-form').forEach((form) => {
            const status = form.querySelector('[name="status"]');
            const aspiration = aspirationsResult.data.find((item) => item.id === form.dataset.aspirationId);
            if (aspiration && [...status.options].some((option) => option.value === aspiration.status)) status.value = aspiration.status;
            form.addEventListener('submit', async (event) => {
                event.preventDefault();
                const feedback = form.querySelector('[role="status"]');
                const result = await this.api.respondAspiration(form.dataset.aspirationId, form.elements.response.value.trim(), status.value);
                feedback.textContent = result.ok ? 'TANGGAPAN TERSIMPAN' : result.error;
                if (result.ok) await this.refreshData();
            });
        });

        const ledgerForm = body.querySelector('#admin-ledger-form');
        const ledgerFeedback = body.querySelector('[data-form-feedback="ledger"]');
        ledgerForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const result = await this.api.addTransaction(Object.fromEntries(new FormData(ledgerForm)));
            ledgerFeedback.textContent = result.ok ? 'TRANSAKSI TERSIMPAN' : result.error;
            if (result.ok) await this.refreshData();
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
}
