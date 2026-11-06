const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[character]));

const statusLabels = {
  draft: 'Draft',
  pending_review: 'Menunggu review',
  published: 'Terbit',
  rejected: 'Perlu perbaikan'
};

export class AcademicConsole {
  constructor(api) {
    this.api = api;
    this.resources = [];
    this.learningPaths = [];
    this.reviewQueue = { resources: [], learning_paths: [] };
    this.pendingDiscussions = [];
    this.files = [];
  }

  async open(container, isSuperadmin) {
    container.innerHTML = '<p role="status">Memuat workspace akademik...</p>';
    const requests = [
      this.api.getMyAcademicResources(),
      this.api.getMyAcademicLearningPaths(),
      this.api.getKnowledgeFiles(),
      this.api.getPendingKnowledgeDiscussions(),
      isSuperadmin ? this.api.getAcademicReviewQueue() : Promise.resolve(null)
    ];
    const [resourcesResult, pathsResult, filesResult, discussionsResult, reviewResult] = await Promise.all(requests);
    if (!container.isConnected || window.prtsApp.workspaceView !== 'academic') return;
    this.resources = resourcesResult.ok ? resourcesResult.data.resources || [] : [];
    this.learningPaths = pathsResult.ok ? pathsResult.data.learning_paths || [] : [];
    this.files = filesResult.ok ? filesResult.data.files || [] : [];
    this.pendingDiscussions = discussionsResult.ok ? discussionsResult.data.discussions || [] : [];
    this.reviewQueue = reviewResult?.ok ? reviewResult.data : { resources: [], learning_paths: [] };
    this.render(container, isSuperadmin, [resourcesResult, pathsResult, filesResult, discussionsResult, ...(reviewResult ? [reviewResult] : [])]);
  }

  render(container, isSuperadmin, results) {
    const errors = results.filter((result) => !result.ok).map((result) => result.error);
    container.innerHTML = `
      <section class="workspace-section academic-curator">
        <div class="workspace-panel-heading">
          <div><span class="section-tag cyan">KURASI // PUSAT AKADEMIK</span><h2>Resource akademik</h2></div>
          <span class="workspace-panel-note">DRAFT → REVIEW → TERBIT</span>
        </div>
        ${errors.length ? `<p class="workspace-data-error" role="alert">${errors.map(escapeHtml).join('<br>')}</p>` : ''}
        <div class="admin-record-list">
          ${this.resources.map((resource) => `
            <article class="admin-record-row">
              <span><strong>${escapeHtml(resource.title)}</strong><small>${escapeHtml(resource.course || 'Umum')} · ${escapeHtml(resource.exam_type || resource.kind)} · ${escapeHtml(statusLabels[resource.status] || resource.status)}${resource.review_note ? ` · Catatan: ${escapeHtml(resource.review_note)}` : ''}</small></span>
              ${['draft', 'rejected'].includes(resource.status) ? `<button class="btn-tactical" type="button" data-academic-edit-resource="${escapeHtml(resource.id)}">UBAH</button><button class="btn-tactical primary" type="button" data-academic-submit-resource="${escapeHtml(resource.id)}">KIRIM REVIEW</button>` : ''}
            </article>`).join('') || '<p>Belum ada resource akademik.</p>'}
        </div>
        <h3 data-academic-resource-form-title>Tambah resource</h3>
        <form class="admin-form" data-academic-resource-form>
          <input type="hidden" name="id" />
          <div class="admin-form-grid">
            <label class="form-group"><span class="form-label">JUDUL</span><input class="form-input" name="title" maxlength="180" required /></label>
            <label class="form-group"><span class="form-label">JENIS</span><select class="form-select" name="kind"><option value="exam">Bank soal</option><option value="module">Modul</option><option value="cheatsheet">Cheat sheet</option><option value="reference">Referensi</option><option value="project">Repositori</option></select></label>
            <label class="form-group"><span class="form-label">MATA KULIAH</span><input class="form-input" name="course" maxlength="120" /></label>
            <label class="form-group"><span class="form-label">SEMESTER</span><input class="form-input" name="semester" maxlength="20" value="Semua" /></label>
            <label class="form-group"><span class="form-label">DOSEN PENGAMPU</span><input class="form-input" name="lecturer" maxlength="120" /></label>
            <label class="form-group"><span class="form-label">TAHUN AJARAN</span><input class="form-input" name="academic_year" maxlength="20" placeholder="2026/2027" /></label>
            <label class="form-group"><span class="form-label">JENIS EVALUASI</span><select class="form-select" name="exam_type"><option value="">Tidak ditentukan</option><option>UTS</option><option>UAS</option><option>Kuis</option><option>Latihan</option></select></label>
            <label class="form-group"><span class="form-label">PDF YANG DIUNGGAH</span><select class="form-select" name="file_id"><option value="">Pilih PDF atau isi URL</option>${this.files.map((file) => `<option value="${escapeHtml(file.id)}">${escapeHtml(file.original_name)}</option>`).join('')}</select></label>
          </div>
          <label class="form-group"><span class="form-label">URL HTTPS (OPSIONAL JIKA MEMILIH PDF)</span><input class="form-input" name="url" type="url" maxlength="2000" /></label>
          <label class="form-group"><span class="form-label">RINGKASAN</span><textarea class="form-textarea" name="summary" maxlength="1000"></textarea></label>
          <label class="form-group"><span class="form-label">TAG, PISAHKAN DENGAN KOMA</span><input class="form-input" name="tags" maxlength="480" /></label>
          <div class="studio-actions"><button class="btn-tactical primary" type="submit">SIMPAN DRAFT</button><button class="btn-tactical" type="reset">KOSONGKAN</button></div>
          <p class="auth-feedback" data-academic-resource-feedback role="status"></p>
        </form>
        <div class="admin-form-grid">
          <label class="form-group"><span class="form-label">UNGGAH PDF, MAKS. 20 MB</span><input class="form-input" type="file" accept="application/pdf" data-academic-file /></label>
          <button class="btn-tactical" type="button" data-academic-upload>UNGGAH PDF</button>
        </div>
      </section>
      <section class="workspace-section academic-learning-paths">
        <div class="workspace-panel-heading"><div><span class="section-tag gold">ROADMAP // LEARNING PATH</span><h2>Jalur belajar</h2></div></div>
        <div class="admin-record-list">
          ${this.learningPaths.map((path) => `
            <article class="admin-record-row"><span><strong>${escapeHtml(path.title)}</strong><small>${escapeHtml(path.track)} · ${escapeHtml(statusLabels[path.status] || path.status)} · ${(path.milestones || []).length} milestone${path.review_note ? ` · Catatan: ${escapeHtml(path.review_note)}` : ''}</small></span>
              ${['draft', 'rejected'].includes(path.status) ? `<button class="btn-tactical" type="button" data-academic-edit-path="${escapeHtml(path.id)}">UBAH</button><button class="btn-tactical primary" type="button" data-academic-submit-path="${escapeHtml(path.id)}">KIRIM REVIEW</button>` : ''}
            </article>`).join('') || '<p>Belum ada jalur belajar.</p>'}
        </div>
        <h3>Tambah jalur belajar</h3>
        <form class="admin-form" data-academic-path-form>
          <input type="hidden" name="id" />
          <div class="admin-form-grid">
            <label class="form-group"><span class="form-label">NAMA JALUR</span><input class="form-input" name="title" maxlength="160" required /></label>
            <label class="form-group"><span class="form-label">BIDANG KARIER</span><input class="form-input" name="track" maxlength="80" placeholder="Front-End, DevOps, Data Science/AI" required /></label>
            <label class="form-group"><span class="form-label">ESTIMASI JAM</span><input class="form-input" name="estimated_hours" type="number" min="0" max="2000" value="0" /></label>
          </div>
          <label class="form-group"><span class="form-label">RINGKASAN</span><textarea class="form-textarea" name="summary" maxlength="1000"></textarea></label>
          ${this.renderLearningPathMilestoneEditor()}
          <button class="btn-tactical primary" type="submit">SIMPAN JALUR SEBAGAI DRAFT</button>
          <p class="auth-feedback" data-academic-path-feedback role="status"></p>
        </form>
      </section>
      ${this.renderDiscussionQueue()}
      ${isSuperadmin ? this.renderReviewQueue() : ''}
    `;
    this.bindResourceForm(container);
    this.bindLearningPathForm(container);
    this.bindRecordActions(container);
  }

  renderReviewQueue() {
    const records = [
      ...(this.reviewQueue.resources || []).map((record) => ({ ...record, recordType: 'resource' })),
      ...(this.reviewQueue.learning_paths || []).map((record) => ({ ...record, recordType: 'learning-path' }))
    ];
    return `
      <section class="workspace-section academic-review-queue">
        <div class="workspace-panel-heading"><div><span class="section-tag red">SUPERADMIN // MODERASI</span><h2>Antrean publikasi akademik</h2></div><span class="workspace-panel-note">${records.length} REVIEW</span></div>
        ${records.map((record) => `
          <article class="admin-record-row"><div><strong>${escapeHtml(record.title)}</strong><small>${escapeHtml(record.recordType)} · ${escapeHtml(record.course || record.track || '')}</small>
            <p>${escapeHtml(record.summary || '')}</p>
            ${record.recordType === 'learning-path' ? `<ol>${(record.milestones || []).map((step) => `<li>${escapeHtml(step.title)}</li>`).join('')}</ol>` : ''}
            <label class="form-group"><span class="form-label">CATATAN REVIEW</span><input class="form-input" data-academic-review-note="${escapeHtml(record.recordType)}:${escapeHtml(record.id)}" maxlength="1000" /></label>
          </div><div class="studio-actions"><button class="btn-tactical primary" type="button" data-academic-review="${escapeHtml(record.recordType)}:${escapeHtml(record.id)}" data-review-status="published">TERBITKAN</button><button class="btn-tactical danger" type="button" data-academic-review="${escapeHtml(record.recordType)}:${escapeHtml(record.id)}" data-review-status="rejected">MINTA PERBAIKAN</button></div></article>
        `).join('') || '<p>Tidak ada konten akademik yang menunggu review.</p>'}
      </section>`;
  }

  renderDiscussionQueue() {
    return `
      <section class="workspace-section academic-discussion-review">
        <div class="workspace-panel-heading"><div><span class="section-tag gold">MODERASI // AKADEMIK</span><h2>Antrean diskusi soal</h2></div><span class="workspace-panel-note">${this.pendingDiscussions.length} POST</span></div>
        ${this.pendingDiscussions.map((discussion) => `
          <article class="admin-record-row"><div><strong>${escapeHtml(discussion.author_name)} // ${escapeHtml(discussion.solution_type || 'discussion')}</strong><small>${escapeHtml(discussion.resource_id)}${discussion.parent_id ? ` · Balasan pada ${escapeHtml(discussion.parent_id)}` : ' · Thread utama'}</small><p>${escapeHtml(discussion.message)}</p></div>
            <div class="studio-actions"><button class="btn-tactical primary" type="button" data-academic-discussion-review="${escapeHtml(discussion.id)}" data-discussion-status="published">TERBITKAN</button><button class="btn-tactical danger" type="button" data-academic-discussion-review="${escapeHtml(discussion.id)}" data-discussion-status="rejected">TOLAK</button></div></article>
        `).join('') || '<p>Tidak ada diskusi yang menunggu moderasi.</p>'}
      </section>`;
  }

  bindResourceForm(container) {
    const form = container.querySelector('[data-academic-resource-form]');
    form.addEventListener('reset', () => {
      form.elements.id.value = '';
      form.elements.semester.value = 'Semua';
      container.querySelector('[data-academic-resource-form-title]').textContent = 'Tambah resource';
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const feedback = form.querySelector('[data-academic-resource-feedback]');
      const payload = {
        id: form.elements.id.value || undefined,
        title: form.elements.title.value.trim(),
        kind: form.elements.kind.value,
        course: form.elements.course.value.trim(),
        semester: form.elements.semester.value.trim() || 'Semua',
        lecturer: form.elements.lecturer.value.trim(),
        academic_year: form.elements.academic_year.value.trim(),
        exam_type: form.elements.exam_type.value,
        file_id: form.elements.file_id.value,
        url: form.elements.url.value.trim(),
        summary: form.elements.summary.value.trim(),
        tags: form.elements.tags.value.split(',').map((tag) => tag.trim()).filter(Boolean)
      };
      const result = payload.id
        ? await this.api.updateAcademicResource(payload.id, payload)
        : await this.api.createAcademicResource(payload);
      feedback.textContent = result.ok ? 'DRAFT RESOURCE TERSIMPAN.' : result.error;
      if (result.ok) await this.open(container, this.api.isSuperadmin);
    });
    container.querySelectorAll('[data-academic-edit-resource]').forEach((button) => button.addEventListener('click', () => {
      const resource = this.resources.find(({ id }) => id === button.dataset.academicEditResource);
      if (!resource) return;
      form.elements.id.value = resource.id;
      form.elements.title.value = resource.title || '';
      form.elements.kind.value = resource.kind || 'reference';
      form.elements.course.value = resource.course || '';
      form.elements.semester.value = resource.semester || 'Semua';
      form.elements.lecturer.value = resource.lecturer || '';
      form.elements.academic_year.value = resource.academic_year || '';
      form.elements.exam_type.value = resource.exam_type || '';
      form.elements.file_id.value = resource.file_id || '';
      form.elements.url.value = resource.url || '';
      form.elements.summary.value = resource.summary || '';
      form.elements.tags.value = (resource.tags || []).join(', ');
      container.querySelector('[data-academic-resource-form-title]').textContent = 'Ubah draft resource';
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    container.querySelector('[data-academic-upload]')?.addEventListener('click', async () => {
      const file = container.querySelector('[data-academic-file]').files?.[0];
      if (!file) return;
      const result = await this.api.uploadKnowledgeFile(file);
      if (!result.ok) {
        form.querySelector('[data-academic-resource-feedback]').textContent = result.error;
        return;
      }
      this.files.unshift(result.data.file);
      const option = new Option(result.data.file.original_name, result.data.file.id, true, true);
      form.elements.file_id.add(option);
      container.querySelector('[data-academic-file]').value = '';
      form.querySelector('[data-academic-resource-feedback]').textContent = 'PDF terunggah dan siap ditautkan ke draft.';
    });
  }

  renderLearningPathMilestoneEditor() {
    return `
      <div class="form-group">
        <span class="form-label">MILESTONE</span>
        <div class="academic-path-milestone-list" data-academic-path-milestones></div>
        <button class="btn-tactical" type="button" data-academic-path-add-milestone>+ TAMBAH MILESTONE</button>
      </div>
    `;
  }

  buildMilestoneRows(milestones = []) {
    const milestoneList = [];
    const previousIds = [];
    const safeMilestones = Array.isArray(milestones) && milestones.length ? milestones : [{ id: 'milestone-1', title: '', description: '', resource_ids: [], prerequisite_ids: [] }];
    safeMilestones.forEach((milestone, index) => {
      const milestoneId = milestone.id || `milestone-${index + 1}`;
      const resourceOptions = this.resources.map((resource) => `<option value="${escapeHtml(resource.id)}" ${Array.isArray(milestone.resource_ids) && milestone.resource_ids.includes(resource.id) ? 'selected' : ''}>${escapeHtml(resource.title || resource.id)}</option>`).join('');
      const prerequisiteOptions = previousIds.length
        ? previousIds.map((id) => `<option value="${escapeHtml(id)}" ${Array.isArray(milestone.prerequisite_ids) && milestone.prerequisite_ids.includes(id) ? 'selected' : ''}>${escapeHtml(id)}</option>`).join('')
        : '<option value="">Tidak ada prasyarat</option>';
      milestoneList.push(`
        <div class="academic-path-milestone-row" data-academic-milestone-row="${index}">
          <div class="admin-form-grid">
            <label class="form-group"><span class="form-label">ID MILESTONE</span><input class="form-input" data-milestone-id type="text" value="${escapeHtml(milestoneId)}" required /></label>
            <label class="form-group"><span class="form-label">JUDUL MILESTONE</span><input class="form-input" data-milestone-title type="text" value="${escapeHtml(milestone.title || '')}" required /></label>
          </div>
          <label class="form-group"><span class="form-label">DESKRIPSI</span><textarea class="form-textarea" data-milestone-description rows="2">${escapeHtml(milestone.description || '')}</textarea></label>
          <div class="admin-form-grid">
            <label class="form-group"><span class="form-label">RESOURCE TERKAIT</span><select class="form-select" multiple size="4" data-milestone-resource>${resourceOptions}</select></label>
            <label class="form-group"><span class="form-label">PRASYARAT</span><select class="form-select" multiple size="4" data-milestone-prerequisite>${prerequisiteOptions}</select></label>
          </div>
          <div class="studio-actions">
            <button class="btn-tactical danger" type="button" data-academic-path-remove-milestone="${index}">HAPUS</button>
          </div>
        </div>
      `);
      previousIds.push(milestoneId);
    });
    return milestoneList.join('');
  }

  getMilestoneRowValues(row) {
    const resourceSelect = row.querySelector('[data-milestone-resource]');
    const prerequisiteSelect = row.querySelector('[data-milestone-prerequisite]');
    return {
      id: row.querySelector('[data-milestone-id]')?.value.trim() || '',
      title: row.querySelector('[data-milestone-title]')?.value.trim() || '',
      description: row.querySelector('[data-milestone-description]')?.value.trim() || '',
      resource_ids: Array.from(resourceSelect?.selectedOptions || []).map((option) => option.value).filter(Boolean),
      prerequisite_ids: Array.from(prerequisiteSelect?.selectedOptions || []).map((option) => option.value).filter(Boolean)
    };
  }

  bindLearningPathForm(container) {
    const form = container.querySelector('[data-academic-path-form]');
    const milestoneList = form.querySelector('[data-academic-path-milestones]');

    const refreshMilestoneRows = () => {
      const rows = [...milestoneList.querySelectorAll('[data-academic-milestone-row]')].map((row) => this.getMilestoneRowValues(row));
      const rebuiltRows = this.buildMilestoneRows(rows);
      milestoneList.innerHTML = rebuiltRows;
    };

    const appendMilestoneRow = (milestone = {}) => {
      const rows = [...milestoneList.querySelectorAll('[data-academic-milestone-row]')].map((row) => this.getMilestoneRowValues(row));
      rows.push({ ...milestone, resource_ids: Array.isArray(milestone.resource_ids) ? milestone.resource_ids : [], prerequisite_ids: Array.isArray(milestone.prerequisite_ids) ? milestone.prerequisite_ids : [] });
      milestoneList.innerHTML = this.buildMilestoneRows(rows);
    };

    form.addEventListener('reset', () => {
      form.elements.id.value = '';
      milestoneList.innerHTML = this.buildMilestoneRows();
      form.querySelector('[data-academic-path-feedback]').textContent = '';
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const feedback = form.querySelector('[data-academic-path-feedback]');
      const milestoneRows = [...milestoneList.querySelectorAll('[data-academic-milestone-row]')];
      const milestones = milestoneRows.map((row) => this.getMilestoneRowValues(row)).filter((milestone) => milestone.id || milestone.title || milestone.resource_ids.length || milestone.prerequisite_ids.length);
      if (milestones.length < 1) {
        feedback.textContent = 'Minimal satu milestone harus ditambahkan.';
        return;
      }
      const invalidRow = milestones.find((milestone) => !milestone.id || !milestone.title || milestone.resource_ids.length < 1);
      if (invalidRow) {
        feedback.textContent = 'Setiap milestone membutuhkan ID, judul, dan minimal satu resource.';
        return;
      }
      const payload = {
        id: form.elements.id.value || undefined,
        title: form.elements.title.value.trim(),
        track: form.elements.track.value.trim(),
        estimated_hours: Number(form.elements.estimated_hours.value || 0),
        summary: form.elements.summary.value.trim(),
        milestones: milestones.map((milestone) => ({
          id: milestone.id,
          title: milestone.title,
          description: milestone.description,
          resource_ids: [...new Set(milestone.resource_ids)],
          prerequisite_ids: [...new Set(milestone.prerequisite_ids)]
        }))
      };
      const result = payload.id
        ? await this.api.updateAcademicLearningPath(payload.id, payload)
        : await this.api.createAcademicLearningPath(payload);
      feedback.textContent = result.ok ? 'DRAFT LEARNING PATH TERSIMPAN.' : result.error;
      if (result.ok) await this.open(container, this.api.isSuperadmin);
    });

    form.querySelector('[data-academic-path-add-milestone]')?.addEventListener('click', () => {
      appendMilestoneRow({ id: `milestone-${milestoneList.querySelectorAll('[data-academic-milestone-row]').length + 1}`, title: '', description: '', resource_ids: [], prerequisite_ids: [] });
    });

    milestoneList.addEventListener('click', (event) => {
      const removeButton = event.target.closest('[data-academic-path-remove-milestone]');
      if (!removeButton) return;
      const rows = [...milestoneList.querySelectorAll('[data-academic-milestone-row]')];
      const index = Number(removeButton.dataset.academicPathRemoveMilestone);
      if (!Number.isInteger(index) || index < 0 || index >= rows.length) return;
      rows.splice(index, 1);
      milestoneList.innerHTML = this.buildMilestoneRows(rows.map((row) => this.getMilestoneRowValues(row)));
    });

    milestoneList.addEventListener('change', () => {
      refreshMilestoneRows();
    });

    milestoneList.innerHTML = this.buildMilestoneRows();

    container.querySelectorAll('[data-academic-edit-path]').forEach((button) => button.addEventListener('click', () => {
      const path = this.learningPaths.find(({ id }) => id === button.dataset.academicEditPath);
      if (!path) return;
      form.elements.id.value = path.id;
      form.elements.title.value = path.title || '';
      form.elements.track.value = path.track || '';
      form.elements.estimated_hours.value = String(path.estimated_hours || 0);
      form.elements.summary.value = path.summary || '';
      milestoneList.innerHTML = this.buildMilestoneRows(path.milestones || []);
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }

  bindRecordActions(container) {
    container.querySelectorAll('[data-academic-discussion-review]').forEach((button) => button.addEventListener('click', async () => {
      const result = await this.api.moderateKnowledgeDiscussion(button.dataset.academicDiscussionReview, button.dataset.discussionStatus);
      if (!result.ok) button.closest('.admin-record-row').querySelector('small').textContent = result.error;
      else await this.open(container, this.api.isSuperadmin);
    }));
    container.querySelectorAll('[data-academic-submit-resource]').forEach((button) => button.addEventListener('click', async () => {
      const result = await this.api.submitAcademicResource(button.dataset.academicSubmitResource);
      if (!result.ok) button.closest('.admin-record-row').querySelector('small').textContent = result.error;
      else await this.open(container, this.api.isSuperadmin);
    }));
    container.querySelectorAll('[data-academic-submit-path]').forEach((button) => button.addEventListener('click', async () => {
      const result = await this.api.submitAcademicLearningPath(button.dataset.academicSubmitPath);
      if (!result.ok) button.closest('.admin-record-row').querySelector('small').textContent = result.error;
      else await this.open(container, this.api.isSuperadmin);
    }));
    container.querySelectorAll('[data-academic-review]').forEach((button) => button.addEventListener('click', async () => {
      const [kind, id] = button.dataset.academicReview.split(':');
      const noteInput = container.querySelector(`[data-academic-review-note="${CSS.escape(`${kind}:${id}`)}"]`);
      const result = await this.api.reviewAcademicContent(kind, id, button.dataset.reviewStatus, noteInput?.value || '');
      if (!result.ok) button.closest('.admin-record-row').querySelector('small').textContent = result.error;
      else await this.open(container, true);
    }));
  }
}