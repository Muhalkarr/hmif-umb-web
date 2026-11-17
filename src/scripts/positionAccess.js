import { POSITION_CAPABILITY_OPTIONS } from '../../shared/positionAccess.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
}[character]));

export const renderPositionAccessWorkspace = (access = {}) => {
    if (!access.term) {
        return `
      <section class="workspace-feature-hero position-access-page">
        <span class="section-tag gold">SUPERADMIN // MAPPING PRIVAT</span>
        <h2>Akses jabatan</h2>
        <p>Belum ada periode organisasi terbit yang berstatus aktif dan berlaku hari ini. Terbitkan periode serta penugasan akun terlebih dahulu di Site Studio.</p>
      </section>`;
    }

    return `
    <div class="position-access-page">
      <section class="workspace-feature-hero">
        <span class="section-tag gold">SUPERADMIN // MAPPING PRIVAT</span>
        <h2>Akses jabatan</h2>
        <p>Capability dipetakan per posisi untuk periode terbit yang aktif. Hak hanya berlaku kepada akun yang memiliki penugasan aktif dan berhenti saat penugasan atau periode berakhir.</p>
        <div class="workspace-feature-stats">
          <div><span>PERIODE AKTIF</span><strong>${escapeHtml(access.term.name)}</strong></div>
          <div><span>BERLAKU</span><strong>${escapeHtml(access.term.startDate)}${access.term.endDate ? ` — ${escapeHtml(access.term.endDate)}` : ' — tanpa tanggal akhir'}</strong></div>
        </div>
        <p class="workspace-feature-note">Capability sensitif hanya diberikan kepada pemegang penugasan aktif pada posisi ini. Clearance dasar tetap berlaku untuk operasional umum, tetapi tidak menggantikan capability ini. Mapping tidak memberikan akses superadmin atau menaikkan clearance.</p>
      </section>
      <section class="position-access-list" aria-label="Mapping capability posisi">
        ${(access.positions || []).map((position) => `
          <article class="position-access-card" data-position-access-card="${escapeHtml(position.id)}">
            <header><span class="workspace-feature-kicker">${escapeHtml(position.unitName)}</span><h3>${escapeHtml(position.title)}</h3></header>
            <p class="position-access-holders"><strong>Pemegang aktif:</strong> ${position.holders?.length
            ? position.holders.map((holder) => `${escapeHtml(holder.name)}${holder.assignmentKind === 'acting' ? ' (PLT)' : ''} · ${escapeHtml(holder.startDate)}${holder.endDate ? `—${escapeHtml(holder.endDate)}` : ''}`).join('; ')
            : 'Belum ada penugasan akun aktif. Mapping akan berlaku setelah akun ditautkan dan penugasannya efektif.'}</p>
            <fieldset><legend>Capability posisi</legend>
              ${POSITION_CAPABILITY_OPTIONS.map((option) => `
                <label class="position-access-option">
                  <input type="checkbox" data-position-capability="${escapeHtml(option.id)}" ${position.capabilities?.includes(option.id) ? 'checked' : ''} />
                  <span><strong>${escapeHtml(option.label)}</strong><small>${escapeHtml(option.description)}</small></span>
                </label>`).join('')}
            </fieldset>
            <div class="position-access-actions">
              <button type="button" class="btn-tactical primary" data-position-access-save="${escapeHtml(position.id)}">SIMPAN MAPPING</button>
              <p data-position-access-feedback role="status" aria-live="polite"></p>
            </div>
          </article>`).join('') || '<p class="workspace-empty-state">Periode aktif belum memiliki posisi.</p>'}
      </section>
    </div>`;
};

export function bindPositionAccessWorkspace(container, api, access, refresh) {
    container.querySelectorAll('[data-position-access-save]').forEach((button) => {
        button.addEventListener('click', async () => {
            const card = button.closest('[data-position-access-card]');
            const feedback = card?.querySelector('[data-position-access-feedback]');
            const checkboxes = [...(card?.querySelectorAll('[data-position-capability]') || [])];
            const capabilities = checkboxes.filter((input) => input.checked).map((input) => input.dataset.positionCapability);
            button.disabled = true;
            if (feedback) feedback.textContent = 'Menyimpan mapping...';
            const result = await api.updatePositionCapabilities(access.term.id, button.dataset.positionAccessSave, capabilities);
            if (!result.ok) {
                if (feedback) feedback.textContent = result.error;
                button.disabled = false;
                return;
            }
            if (feedback) feedback.textContent = 'Mapping tersimpan. Backend menerapkan akses pada request berikutnya; muat ulang halaman pengguna untuk memperbarui menu.';
            await refresh();
        });
    });
}
