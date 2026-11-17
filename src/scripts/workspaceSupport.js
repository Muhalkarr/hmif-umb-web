const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[character]));

const ticketStatus = (status) => ({
  open: 'Baru',
  in_progress: 'Ditangani',
  resolved: 'Selesai'
}[status] || status);

const renderTicketCard = (ticket) => `
  <button type="button" class="workspace-ticket-card" data-support-open="${escapeHtml(ticket.id)}">
    <span class="workspace-feature-kicker">${escapeHtml(ticket.category)} // ${escapeHtml(ticketStatus(ticket.status))}</span>
    <strong>${escapeHtml(ticket.subject)}</strong>
    <span>${escapeHtml(ticket.name)} · ${new Date(ticket.updated_at).toLocaleDateString('id-ID')}</span>
    <span class="workspace-ticket-id">#${escapeHtml(ticket.id.slice(0, 8).toUpperCase())}</span>
  </button>
`;

const renderTicketDetail = (detail, canManage) => {
  const { ticket, messages } = detail;
  return `
    <section class="workspace-feature-panel" data-support-ticket-id="${escapeHtml(ticket.id)}">
      <button type="button" class="workspace-text-action" data-support-back>← KEMBALI KE TIKET</button>
      <span class="workspace-feature-kicker">${escapeHtml(ticket.category)} // ${escapeHtml(ticketStatus(ticket.status))}</span>
      <h2>${escapeHtml(ticket.subject)}</h2>
      <p>Tiket #${escapeHtml(ticket.id.slice(0, 8).toUpperCase())} · dibuat ${new Date(ticket.created_at).toLocaleString('id-ID')}</p>
      <ol class="workspace-ticket-thread">${messages.map((message) => `
        <li><div><strong>${escapeHtml(message.author_name)}</strong><time>${new Date(message.created_at).toLocaleString('id-ID')}</time></div>
          <p>${escapeHtml(message.message)}</p></li>`).join('')}</ol>
      <form class="workspace-feature-form" data-support-reply>
        <label for="support-reply-message">Balas tiket</label>
        <textarea id="support-reply-message" name="message" rows="3" maxlength="2000" required></textarea>
        <button type="submit" class="btn-tactical primary">KIRIM BALASAN</button>
        <p data-support-feedback role="status" aria-live="polite"></p>
      </form>
      ${canManage ? `<label class="workspace-ticket-status">Status tiket
        <select data-support-status="${escapeHtml(ticket.id)}">
          ${['open', 'in_progress', 'resolved'].map((status) => `<option value="${status}" ${status === ticket.status ? 'selected' : ''}>${ticketStatus(status)}</option>`).join('')}
        </select>
      </label>` : ''}
    </section>
  `;
};

const renderTicketForm = () => `
  <details class="workspace-feature-panel workspace-ticket-new">
    <summary><strong>Buat tiket bantuan</strong><span>Jelaskan kendala agar tim dapat menindaklanjuti.</span></summary>
    <form class="workspace-feature-form" data-support-create>
      <label>Subjek<input name="subject" maxlength="160" required /></label>
      <label>Kategori<select name="category" required>
        <option value="akun">Akun & akses</option><option value="akademik">Akademik</option>
        <option value="teknis">Kendala teknis</option><option value="event">Event</option><option value="lainnya">Lainnya</option>
      </select></label>
      <label>Detail kendala<textarea name="message" rows="4" maxlength="2000" required></textarea></label>
      <button type="submit" class="btn-tactical primary">KIRIM TIKET</button>
      <p data-support-feedback role="status" aria-live="polite"></p>
    </form>
  </details>
`;

export const renderSupportWorkspace = ({ viewId, tickets, detail, canManage, report, error = '' }) => {
  if (detail) return renderTicketDetail(detail, canManage);

  const openCount = tickets.filter(({ status }) => status === 'open').length;
  const handlingCount = tickets.filter(({ status }) => status === 'in_progress').length;
  const resolvedCount = tickets.filter(({ status }) => status === 'resolved').length;
  const contacts = [
    ['Akademik', 'Pertanyaan materi belajar, learning path, dan Klinik Koding.', 'academic'],
    ['Teknologi Informasi', 'Kendala login, halaman, dan fungsionalitas portal.', 'technical'],
    ['Kepengurusan HMIF', 'Pertanyaan layanan dan kegiatan organisasi.', 'organization']
  ];
  const header = viewId === 'support-reports' ? 'Laporan layanan'
    : viewId === 'support-contacts' || viewId === 'support-contact-details' ? 'Kontak bantuan'
      : viewId === 'support-quick-links' ? 'Pintasan layanan'
        : viewId === 'support-tickets-preview' ? 'Tiket terbaru'
          : 'Pusat bantuan HMIF';

  if (viewId === 'support-contacts' || viewId === 'support-contact-details') {
    return `
      <section class="workspace-feature-hero workspace-support-hero">
        <span class="section-tag cyan">SUPPORT DESK // KONTAK</span><h2>${header}</h2>
        <p>Gunakan tiket agar kendala tercatat dan dapat dipantau. Informasi kontak menampilkan unit layanan, bukan data pribadi pengurus.</p>
      </section>
      <div class="workspace-support-grid">${contacts.map(([name, description, id]) => `
        <article class="workspace-course-card"><span class="workspace-feature-kicker">UNIT LAYANAN</span>
          <h3>${name}</h3><p>${description}</p>
          <button type="button" class="btn-tactical" data-support-contact="${id}">DETAIL UNIT</button>
        </article>`).join('')}</div>
      <section class="workspace-feature-panel"><h3>Saluran resmi</h3>
        <p>Ajukan pertanyaan melalui formulir tiket di halaman utama Support Desk. Balasan tim akan tersimpan di percakapan tiket Anda.</p>
        <p data-support-contact-notice role="status" aria-live="polite"></p>
        <button type="button" class="btn-tactical primary" data-workspace-view="dashboard-support">BUAT TIKET BANTUAN</button>
      </section>
    `;
  }

  if (viewId === 'support-quick-links') {
    return `
      <section class="workspace-feature-hero workspace-support-hero"><span class="section-tag cyan">SUPPORT DESK // NAVIGASI</span><h2>${header}</h2>
        <p>Akses layanan HMIF yang dapat membantu menyelesaikan kendala umum.</p></section>
      <div class="workspace-quick-links">
        <button type="button" data-workspace-view="profile"><strong>Akun & keamanan</strong><span>Periksa profil dan akses akun.</span></button>
        <button type="button" data-workspace-view="learning-course-list"><strong>Materi akademik</strong><span>Jelajahi jalur belajar dan sumber belajar.</span></button>
        <button type="button" data-workspace-view="learning-student-overview"><strong>Progres belajar</strong><span>Lanjutkan kursus yang Anda ikuti.</span></button>
      </div>
    `;
  }

  if (viewId === 'support-reports') {
    const reportByStatus = report?.by_status || {
      open: openCount,
      in_progress: handlingCount,
      resolved: resolvedCount
    };
    return `
      <section class="workspace-feature-hero workspace-support-hero"><span class="section-tag cyan">SUPPORT DESK // TELEMETRI</span><h2>${header}</h2>
        <p>${canManage ? 'Ringkasan tiket layanan yang dapat diakses tim pengurus.' : 'Ringkasan tiket bantuan milik Anda.'}</p>
        <div class="workspace-feature-stats">
          <div><span>TOTAL</span><strong>${report?.total ?? tickets.length}</strong></div><div><span>BARU</span><strong>${reportByStatus.open}</strong></div>
          <div><span>DITANGANI</span><strong>${reportByStatus.in_progress}</strong></div><div><span>SELESAI</span><strong>${reportByStatus.resolved}</strong></div>
        </div></section>
      ${report?.by_category ? `<section class="workspace-feature-panel"><h3>Menurut kategori</h3><div class="workspace-feature-stats">
        ${Object.entries(report.by_category).map(([category, count]) => `<div><span>${escapeHtml(category)}</span><strong>${count}</strong></div>`).join('')}
      </div></section>` : ''}
    `;
  }

  const list = viewId === 'support-cards' || viewId === 'support-tickets-preview'
    ? `<div class="workspace-support-grid">${tickets.slice(0, viewId === 'support-tickets-preview' ? 5 : tickets.length).map(renderTicketCard).join('')}</div>`
    : `<div class="workspace-support-table-wrap"><table class="workspace-support-table">
        <thead><tr><th>Tiket</th><th>Pemohon</th><th>Kategori</th><th>Status</th><th>Diperbarui</th></tr></thead>
        <tbody>${tickets.map((ticket) => `<tr data-support-row="${escapeHtml(ticket.id)}">
          <td><button type="button" class="workspace-text-action" data-support-open="${escapeHtml(ticket.id)}">${escapeHtml(ticket.subject)}</button><small>#${escapeHtml(ticket.id.slice(0, 8).toUpperCase())}</small></td>
          <td>${escapeHtml(ticket.name)}</td><td>${escapeHtml(ticket.category)}</td><td>${ticketStatus(ticket.status)}</td>
          <td>${new Date(ticket.updated_at).toLocaleDateString('id-ID')}</td></tr>`).join('')}</tbody>
      </table></div>`;

  return `
    <section class="workspace-feature-hero workspace-support-hero">
      <span class="section-tag cyan">SUPPORT DESK // HMIF UMB</span><h2>${header}</h2>
      <p>${canManage ? 'Kelola tiket anggota dan kirim pembaruan dalam satu percakapan.' : 'Buat laporan kendala dan pantau tindak lanjut dari tim HMIF.'}</p>
      <div class="workspace-feature-stats">
        <div><span>TOTAL TIKET</span><strong>${tickets.length}</strong></div>
        <div><span>BARU</span><strong>${openCount}</strong></div>
        <div><span>DITANGANI</span><strong>${handlingCount}</strong></div>
        <div><span>SELESAI</span><strong>${resolvedCount}</strong></div>
      </div>
    </section>
    ${error ? `<p class="workspace-feature-error" role="alert">${escapeHtml(error)}</p>` : ''}
    ${canManage ? '' : renderTicketForm()}
    <section class="workspace-feature-panel">
      <div class="workspace-panel-heading"><div><span class="section-tag gold">ANTREAN // ${tickets.length}</span><h2>${header === 'Tiket terbaru' ? 'Tiket terbaru' : 'Daftar tiket'}</h2></div></div>
      ${tickets.length ? list : '<p class="workspace-feature-empty">Belum ada tiket. Tiket bantuan yang Anda buat akan muncul di sini.</p>'}
    </section>
    ${canManage ? '<p class="workspace-feature-note">Akses pengelolaan dibatasi untuk pengurus clearance 2 ke atas.</p>' : ''}
  `;
};

export const bindSupportWorkspace = (content, api, { refresh, openTicket, canManage }) => {
  content.querySelectorAll('[data-support-open]').forEach((button) => {
    button.addEventListener('click', () => openTicket(button.dataset.supportOpen));
  });
  content.querySelector('[data-support-back]')?.addEventListener('click', () => openTicket(''));
  content.querySelector('[data-support-create]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const data = Object.fromEntries(new FormData(form));
    button.disabled = true;
    const result = await api.createSupportTicket(data);
    if (!result.ok) {
      button.disabled = false;
      form.querySelector('[data-support-feedback]').textContent = result.error;
      return;
    }
    openTicket(result.data.ticket.id);
  });
  content.querySelector('[data-support-reply]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    const ticketId = content.querySelector('[data-support-ticket-id]')?.dataset.supportTicketId;
    const result = await api.replyToSupportTicket(ticketId, new FormData(form).get('message'));
    if (!result.ok) {
      button.disabled = false;
      form.querySelector('[data-support-feedback]').textContent = result.error;
      return;
    }
    refresh();
  });
  content.querySelector('[data-support-status]')?.addEventListener('change', async (event) => {
    const select = event.currentTarget;
    select.disabled = true;
    const result = await api.updateSupportTicketStatus(select.dataset.supportStatus, select.value);
    if (!result.ok) {
      select.disabled = false;
      content.querySelector('[data-support-feedback]')?.replaceChildren(document.createTextNode(result.error));
      return;
    }
    refresh();
  });
  content.querySelectorAll('[data-support-contact]').forEach((button) => {
    button.addEventListener('click', () => {
      const notice = content.querySelector('[data-support-contact-notice]');
      if (notice) notice.textContent = `${button.dataset.supportContact}: gunakan formulir tiket untuk menghubungi unit ini.`;
    });
  });
};
