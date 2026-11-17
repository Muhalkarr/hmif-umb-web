const API_BASE = '/api/voting';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
}[character]));

const request = async (endpoint, { method = 'GET', body } = {}) => {
    const response = await fetch(`${API_BASE}${endpoint}`, {
        method,
        credentials: 'same-origin',
        headers: body === undefined ? { Accept: 'application/json' } : {
            Accept: 'application/json',
            'Content-Type': 'application/json'
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Permintaan pemungutan suara gagal (HTTP ${response.status}).`);
    return data;
};

const dateLabel = (value) => {
    if (!value) return 'Tanggal belum ditentukan';
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.valueOf()) ? 'Tanggal belum ditentukan'
        : date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
};

const safeImageUrl = (value) => {
    const url = String(value || '').trim();
    if (url.startsWith('/') && !url.startsWith('//')) return escapeHtml(url);
    try {
        const parsed = new URL(url);
        return ['http:', 'https:'].includes(parsed.protocol) ? escapeHtml(parsed.href) : '/assets/silhouette_male.jpg';
    } catch {
        return '/assets/silhouette_male.jpg';
    }
};

export async function fetchPolls(includeDraft = false) {
    const data = await request(`/polls${includeDraft ? '?includeDraft=true' : ''}`);
    const polls = Array.isArray(data) ? data : data.polls;
    return Array.isArray(polls) ? polls : [];
}

export async function fetchPoll(pollId) {
    return request(`/polls/${encodeURIComponent(pollId)}`);
}

export async function castVote(pollId, candidateId) {
    return request(`/polls/${encodeURIComponent(pollId)}/vote`, {
        method: 'POST',
        body: { candidate_id: candidateId }
    });
}

export async function createPoll(poll) {
    return request('/polls', { method: 'POST', body: poll });
}

export async function updatePoll(pollId, updates) {
    return request(`/polls/${encodeURIComponent(pollId)}`, { method: 'PUT', body: updates });
}

export async function addCandidate(pollId, candidate) {
    return request(`/polls/${encodeURIComponent(pollId)}/candidates`, { method: 'POST', body: candidate });
}

const renderPollAdminControls = (poll) => `
  <details class="voting-admin-controls">
    <summary>Kelola status dan kandidat</summary>
    <form class="voting-admin-form" data-voting-poll-status data-poll-id="${escapeHtml(poll.id)}">
      <label class="form-group"><span class="form-label">STATUS PEMILIHAN</span>
        <select class="form-select" name="status">
          <option value="draft" ${poll.status === 'draft' ? 'selected' : ''}>Draft</option>
          <option value="active" ${poll.status === 'active' ? 'selected' : ''}>Aktif</option>
          <option value="closed" ${poll.status === 'closed' ? 'selected' : ''}>Ditutup</option>
        </select>
      </label>
      <button class="btn-tactical" type="submit">SIMPAN STATUS</button>
      <p class="auth-feedback" data-voting-form-feedback role="status"></p>
    </form>
    <form class="voting-admin-form" data-voting-candidate-create data-poll-id="${escapeHtml(poll.id)}">
      <h4>Tambah kandidat</h4>
      <div class="admin-form-grid">
        <label class="form-group"><span class="form-label">NOMOR URUT</span><input class="form-input" name="candidate_number" type="number" min="1" step="1" required></label>
        <label class="form-group"><span class="form-label">NAMA KANDIDAT</span><input class="form-input" name="candidate_name" maxlength="160" required></label>
        <label class="form-group"><span class="form-label">NIM (OPSIONAL)</span><input class="form-input" name="candidate_nim" maxlength="32"></label>
        <label class="form-group"><span class="form-label">URL FOTO (OPSIONAL)</span><input class="form-input" name="image_url" type="url" maxlength="2000"></label>
      </div>
      <label class="form-group"><span class="form-label">VISI & MISI</span><textarea class="form-textarea" name="vision_mission" maxlength="3000"></textarea></label>
      <button class="btn-tactical primary" type="submit">TAMBAH KANDIDAT</button>
      <p class="auth-feedback" data-voting-form-feedback role="status"></p>
    </form>
  </details>`;

const renderPollCard = (poll, canManage) => `
  <article class="poll-card" data-poll-id="${escapeHtml(poll.id)}">
    <h3>${escapeHtml(poll.title)}</h3>
    <p>${escapeHtml(poll.description || 'Tidak ada keterangan tambahan.')}</p>
    <div class="poll-meta">
      <span>${escapeHtml(dateLabel(poll.start_date))} — ${escapeHtml(dateLabel(poll.end_date))}</span>
      <span class="poll-status poll-status--${escapeHtml(poll.status)}">${poll.status === 'active' ? 'Sedang berlangsung' : poll.status === 'closed' ? 'Ditutup' : 'Draft'}</span>
      <span>${Array.isArray(poll.candidates) ? poll.candidates.length : 0} kandidat</span>
    </div>
    <button class="btn-tactical primary" type="button" data-poll-open="${escapeHtml(poll.id)}">LIHAT DETAIL & PILIH</button>
    ${canManage ? renderPollAdminControls(poll) : ''}
  </article>`;

const renderCreatePollForm = () => `
  <details class="voting-admin-create">
    <summary>Buat pemilihan baru</summary>
    <form class="voting-admin-form" data-voting-poll-create>
      <label class="form-group"><span class="form-label">JUDUL PEMILIHAN</span><input class="form-input" name="title" maxlength="180" required></label>
      <label class="form-group"><span class="form-label">KETERANGAN</span><textarea class="form-textarea" name="description" maxlength="3000"></textarea></label>
      <div class="admin-form-grid">
        <label class="form-group"><span class="form-label">MULAI</span><input class="form-input" name="start_date" type="date" required></label>
        <label class="form-group"><span class="form-label">SELESAI</span><input class="form-input" name="end_date" type="date" required></label>
      </div>
      <p class="form-help">Sebaiknya tambahkan seluruh kandidat sebelum mengaktifkan pemilihan.</p>
      <button class="btn-tactical primary" type="submit">BUAT PEMILIHAN</button>
      <p class="auth-feedback" data-voting-form-feedback role="status"></p>
    </form>
  </details>`;

const bindAdminForms = (container, canManage) => {
    if (!canManage) return;
    container.querySelector('[data-voting-poll-create]')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const feedback = form.querySelector('[data-voting-form-feedback]');
        const values = Object.fromEntries(new FormData(form));
        try {
            await createPoll({ ...values, status: 'draft' });
            await renderPollList(container, { canManage });
            container.querySelector('[data-voting-feedback]').textContent = 'Pemilihan berhasil dibuat. Tambahkan kandidat sebelum dibuka.';
        } catch (error) {
            feedback.textContent = error.message;
        }
    });

    container.querySelectorAll('[data-voting-poll-status]').forEach((form) => {
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const feedback = form.querySelector('[data-voting-form-feedback]');
            try {
                await updatePoll(form.dataset.pollId, { status: new FormData(form).get('status') });
                await renderPollList(container, { canManage });
                container.querySelector('[data-voting-feedback]').textContent = 'Status pemilihan berhasil diperbarui.';
            } catch (error) {
                feedback.textContent = error.message;
            }
        });
    });

    container.querySelectorAll('[data-voting-candidate-create]').forEach((form) => {
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const feedback = form.querySelector('[data-voting-form-feedback]');
            const values = Object.fromEntries(new FormData(form));
            values.candidate_number = Number(values.candidate_number);
            try {
                await addCandidate(form.dataset.pollId, values);
                await renderPollList(container, { canManage });
                container.querySelector('[data-voting-feedback]').textContent = 'Kandidat berhasil ditambahkan.';
            } catch (error) {
                feedback.textContent = error.message;
            }
        });
    });
};

export async function renderPollList(container, { canManage = false } = {}) {
    if (!container) return;
    container.dataset.votingCanManage = String(canManage);
    container.innerHTML = '<p class="workspace-feature-loading" role="status">Memuat daftar pemilihan...</p>';
    try {
        const polls = await fetchPolls(canManage);
        if (!container.isConnected) return;
        container.innerHTML = `
      <section class="workspace-voting" aria-labelledby="workspace-voting-title">
        <header class="workspace-voting-heading">
          <span class="section-tag cyan">SECURE VOTING TERMINAL</span>
          <h2 id="workspace-voting-title">Pemungutan suara</h2>
          <p>Pilih satu kandidat pada setiap pemilihan aktif. Suara tercatat secara rahasia.</p>
        </header>
        ${canManage ? renderCreatePollForm() : ''}
        <p class="workspace-voting-feedback" data-voting-feedback role="status" aria-live="polite"></p>
        <div class="poll-list" data-voting-poll-list>
          ${polls.length ? polls.map((poll) => renderPollCard(poll, canManage)).join('')
                : `<p class="workspace-voting-empty">${canManage ? 'Belum ada pemilihan. Buat pemilihan baru untuk menambahkan kandidat.' : 'Belum ada pemilihan yang tersedia.'}</p>`}
        </div>
      </section>`;

        container.querySelectorAll('[data-poll-open]').forEach((button) => {
            button.addEventListener('click', () => renderPollDetail(container, button.dataset.pollOpen, { canManage }));
        });
        bindAdminForms(container, canManage);
    } catch (error) {
        if (!container.isConnected) return;
        container.innerHTML = `<p class="workspace-data-error" role="alert">${escapeHtml(error.message)}</p>`;
    }
}

export async function renderPollDetail(container, pollId, { canManage = container?.dataset.votingCanManage === 'true' } = {}) {
    if (!container) return;
    container.innerHTML = '<p class="workspace-feature-loading" role="status">Memuat detail pemilihan...</p>';
    try {
        const { poll, user_vote: userVote, results } = await fetchPoll(pollId);
        if (!container.isConnected || !poll) return;
        const canVote = poll.status === 'active' && !userVote;
        const candidates = Array.isArray(poll.candidates) ? poll.candidates : [];
        const resultRows = Array.isArray(results?.results) ? results.results : [];
        const resultsMarkup = results
            ? `<section class="voting-results" aria-labelledby="voting-results-title"><h3 id="voting-results-title">Hasil sementara/akhir</h3>
          <p>${Number(results.total_votes || 0)} suara tercatat</p>
          <ol class="results-list">${resultRows.map((item) => `<li><span><strong>No. ${escapeHtml(item.candidate_number)} — ${escapeHtml(item.candidate_name)}</strong><small>${Number(item.percentage || 0)}%</small></span><b>${Number(item.vote_count || 0)} suara</b></li>`).join('')}</ol>
        </section>`
            : '<p class="workspace-voting-results-note">Hasil akan tersedia setelah Anda memilih atau pemilihan ditutup.</p>';
        container.innerHTML = `
      <section class="workspace-voting workspace-voting-detail" aria-labelledby="workspace-voting-detail-title">
        <button class="workspace-text-action" type="button" data-poll-back>← KEMBALI KE DAFTAR</button>
        <header class="workspace-voting-heading poll-header">
          <span class="section-tag cyan">PEMILIHAN // ${poll.status === 'active' ? 'BERLANGSUNG' : poll.status === 'closed' ? 'DITUTUP' : 'DRAFT'}</span>
          <h2 id="workspace-voting-detail-title">${escapeHtml(poll.title)}</h2>
          <p>${escapeHtml(poll.description || '')}</p>
          <div class="poll-info"><span>${escapeHtml(dateLabel(poll.start_date))} — ${escapeHtml(dateLabel(poll.end_date))}</span></div>
        </header>
        ${userVote ? `<div class="vote-receipt" role="status"><h3>Suara Anda telah tercatat</h3><p>Suara disimpan secara rahasia.</p><p><strong>ID tanda terima:</strong> ${escapeHtml(userVote.id || userVote.receipt_id || 'Tercatat')}</p></div>` : ''}
        <section class="candidates-section" aria-label="Daftar kandidat">
          ${candidates.length ? candidates.map((candidate) => {
            const selected = userVote?.candidate_id === candidate.id;
            return `<article class="candidate-card ${selected ? 'voted' : ''}" data-candidate-id="${escapeHtml(candidate.id)}">
              <img class="candidate-img" src="${safeImageUrl(candidate.image_url)}" alt="Foto ${escapeHtml(candidate.candidate_name)}" loading="lazy">
              <div class="candidate-info"><h3>No. ${escapeHtml(candidate.candidate_number)} — ${escapeHtml(candidate.candidate_name)}</h3><p>${escapeHtml(candidate.vision_mission || 'Visi dan misi belum dicantumkan.')}</p></div>
              <button class="vote-btn" type="button" data-voting-cast-vote="${escapeHtml(candidate.id)}" ${canVote ? '' : 'disabled'}>${selected ? 'PILIHAN ANDA' : canVote ? 'BERI SUARA' : userVote ? 'SUDAH MEMILIH' : 'PEMILIHAN TIDAK AKTIF'}</button>
            </article>`;
        }).join('') : '<p class="workspace-voting-empty">Belum ada kandidat dalam pemilihan ini.</p>'}
        </section>
        <p class="workspace-voting-feedback" data-vote-feedback role="status" aria-live="polite"></p>
        ${resultsMarkup}
      </section>`;

        container.querySelector('[data-poll-back]')?.addEventListener('click', () => renderPollList(container, { canManage }));
        container.querySelectorAll('[data-voting-cast-vote]').forEach((button) => {
            button.addEventListener('click', async () => {
                if (!window.confirm('Apakah Anda yakin ingin memberikan suara kepada kandidat ini? Pilihan tidak dapat diubah.')) return;
                button.disabled = true;
                const feedback = container.querySelector('[data-vote-feedback]');
                feedback.textContent = 'Mengirim suara...';
                try {
                    await castVote(poll.id, button.dataset.votingCastVote);
                    await renderPollDetail(container, poll.id, { canManage });
                    container.querySelector('[data-vote-feedback]').textContent = 'Suara berhasil dicatat.';
                } catch (error) {
                    button.disabled = false;
                    feedback.textContent = error.message;
                }
            });
        });
    } catch (error) {
        if (!container.isConnected) return;
        container.innerHTML = `<section class="workspace-voting"><button class="workspace-text-action" type="button" data-poll-back>← KEMBALI KE DAFTAR</button><p class="workspace-data-error" role="alert">${escapeHtml(error.message)}</p></section>`;
        container.querySelector('[data-poll-back]')?.addEventListener('click', () => renderPollList(container, { canManage }));
    }
}
