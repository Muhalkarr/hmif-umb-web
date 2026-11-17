const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[character]));

const requestState = (result, hasData, label) => {
  if (!result?.ok) return { state: 'error', text: result?.error || `${label} belum dapat dimuat.` };
  if (!hasData) return { state: 'empty', text: `Belum ada ${label.toLowerCase()}.` };
  return { state: 'ready', text: '' };
};

const dateLabel = (dateValue) => {
  const date = new Date(`${dateValue}T00:00:00`);
  return Number.isNaN(date.valueOf())
    ? 'Tanggal belum ditentukan'
    : date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
};

export function renderMemberDashboard({ user, roleName, notificationsResult, ticketsResult, enrollmentsResult, pathsResult, calendarResult, today = new Date() }) {
  const notifications = notificationsResult?.ok ? notificationsResult.data?.notifications : null;
  const notificationState = requestState(notificationsResult, Array.isArray(notifications), 'Notifikasi');
  const tickets = ticketsResult?.ok ? ticketsResult.data?.tickets : null;
  const ticketState = requestState(ticketsResult, Array.isArray(tickets), 'Tiket bantuan');
  const enrollments = enrollmentsResult?.ok ? enrollmentsResult.data?.enrollments : null;
  const paths = pathsResult?.ok ? pathsResult.data?.learning_paths : null;
  const learningState = requestState(
    enrollmentsResult?.ok ? pathsResult : enrollmentsResult,
    Array.isArray(enrollments) && Array.isArray(paths),
    'Progres belajar'
  );
  const calendarEvents = calendarResult?.ok && Array.isArray(calendarResult.data)
    ? calendarResult.data
      .filter((event) => {
        const eventDate = new Date(`${event.date_str}T00:00:00`);
        const day = new Date(today);
        day.setHours(0, 0, 0, 0);
        return !Number.isNaN(eventDate.valueOf()) && eventDate >= day;
      })
      .sort((first, second) => first.date_str.localeCompare(second.date_str))
      .slice(0, 3)
    : null;
  const calendarState = requestState(calendarResult, Array.isArray(calendarEvents), 'Agenda mendatang');
  const pathById = new Map((paths || []).map((path) => [path.id, path]));
  const currentLearning = (enrollments || []).map((enrollment) => {
    const path = pathById.get(enrollment.learning_path_id);
    if (!path) return null;
    const total = path.milestones?.length || 0;
    const completed = enrollment.completed_milestones?.length || 0;
    return { path, total, completed, progress: total ? Math.min(100, Math.round((completed / total) * 100)) : 0 };
  }).filter(Boolean).sort((first, second) => first.progress - second.progress);
  const activeTickets = (tickets || []).filter(({ status }) => status !== 'resolved');
  const membershipStage = user?.membership_stage || 'Belum tercatat';
  const displayName = user?.name || 'Anggota HMIF';
  const stateMarkup = ({ state, text }) => `
    <p class="workspace-member-card-state is-${state}" ${state === 'error' ? 'role="alert"' : 'hidden'}>${escapeHtml(text)}</p>`;

  return `
    <section class="workspace-member-hero" aria-labelledby="workspace-member-title">
      <div class="workspace-member-hero-copy">
        <span class="section-tag cyan">HMIF UMB // RUANG ANGGOTA</span>
        <p class="workspace-member-eyebrow">${escapeHtml(today.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' }))}</p>
        <h2 id="workspace-member-title">Halo, ${escapeHtml(displayName)}.</h2>
        <p>Temukan pembaruan dan lanjutkan aktivitas organisasi Anda dari satu tempat.</p>
      </div>
      <div class="workspace-member-identity" aria-label="Ringkasan keanggotaan">
        <span>STATUS KEANGGOTAAN</span><strong>${escapeHtml(membershipStage)}</strong>
        <small>${escapeHtml(roleName || 'Akun anggota')}</small>
      </div>
    </section>
    <div class="workspace-member-dashboard-grid">
      <section class="workspace-member-card workspace-member-learning" aria-labelledby="workspace-member-learning-title">
        <div class="workspace-panel-heading"><div><span class="section-tag green">LANGKAH BERIKUTNYA</span><h2 id="workspace-member-learning-title">Perjalanan belajar</h2></div>
          <button type="button" class="workspace-text-action" data-workspace-view="learning-student-overview">SEMUA PROGRES →</button></div>
        ${stateMarkup(learningState)}
        ${learningState.state === 'ready'
          ? currentLearning.length
            ? `<div class="workspace-member-progress-list">${currentLearning.slice(0, 2).map(({ path, total, completed, progress }) => `
              <button type="button" class="workspace-member-progress" data-workspace-view="learning-course-details" data-learning-path-id="${escapeHtml(path.id)}">
                <span><strong>${escapeHtml(path.title)}</strong><small>${completed} dari ${total} tahap selesai</small></span>
                <span class="workspace-member-progress-value">${progress}%</span>
                <span class="workspace-member-progress-track" aria-hidden="true"><i style="width:${progress}%"></i></span>
              </button>`).join('')}`
            : '<p class="workspace-member-card-state is-empty">Belum mengikuti jalur belajar. Jelajahi katalog untuk memilih materi pertama.</p>'
          : ''}
        <button type="button" class="btn-tactical" data-workspace-view="learning-course-list">JELAJAHI KATALOG</button>
      </section>
      <section class="workspace-member-card" aria-labelledby="workspace-member-tickets-title">
        <div class="workspace-panel-heading"><div><span class="section-tag gold">DUKUNGAN HMIF</span><h2 id="workspace-member-tickets-title">Tiket bantuan</h2></div>
          <button type="button" class="workspace-text-action" data-workspace-view="support-table">BUKA →</button></div>
        ${stateMarkup(ticketState)}
        ${ticketState.state === 'ready'
          ? activeTickets.length
            ? `<ul class="workspace-member-ticket-list">${activeTickets.slice(0, 3).map((ticket) => `
              <li><span><strong>${escapeHtml(ticket.subject)}</strong><small>${escapeHtml(ticket.category)} · ${ticket.status === 'in_progress' ? 'Ditangani' : 'Menunggu'} · ${escapeHtml(dateLabel(ticket.updated_at?.slice(0, 10) || ''))}</small></span>
                <span class="workspace-member-ticket-status">${ticket.status === 'in_progress' ? 'PROSES' : 'BARU'}</span></li>`).join('')}</ul>`
            : '<p class="workspace-member-card-state is-empty">Tidak ada tiket yang memerlukan tindak lanjut.</p>'
          : ''}
        <button type="button" class="btn-tactical" data-workspace-view="dashboard-support">BUAT TIKET</button>
      </section>
      <section class="workspace-member-card workspace-member-agenda" aria-labelledby="workspace-member-agenda-title">
        <div class="workspace-panel-heading"><div><span class="section-tag cyan">WAKTU TERDEKAT</span><h2 id="workspace-member-agenda-title">Agenda dan tenggat</h2></div>
          <button type="button" class="workspace-text-action" data-workspace-view="app-calendar">KALENDER →</button></div>
        ${stateMarkup(calendarState)}
        ${calendarState.state === 'ready'
          ? calendarEvents.length
            ? `<ol class="workspace-member-agenda-list">${calendarEvents.map((event) => `
              <li><time datetime="${escapeHtml(event.date_str)}">${escapeHtml(dateLabel(event.date_str))}</time>
                <span><strong>${escapeHtml(event.title)}</strong><small>${escapeHtml(event.type || 'Agenda')} · ${escapeHtml(event.location || event.division || 'Lokasi belum ditentukan')}</small></span></li>`).join('')}</ol>`
            : '<p class="workspace-member-card-state is-empty">Belum ada agenda mendatang.</p>'
          : ''}
      </section>
      <section class="workspace-member-card workspace-member-notifications" aria-labelledby="workspace-member-notification-title">
        <div class="workspace-panel-heading"><div><span class="section-tag violet">PEMBARUAN AKUN</span><h2 id="workspace-member-notification-title">Notifikasi terbaru</h2></div>
          <button type="button" class="workspace-text-action" data-workspace-view="notifications">SEMUA →</button></div>
        ${stateMarkup(notificationState)}
        ${notificationState.state === 'ready'
          ? notifications.length
            ? `<ul class="workspace-member-notification-list">${notifications.slice(0, 3).map((notification) => `
              <li class="${notification.is_read ? '' : 'is-unread'}"><span class="workspace-member-notification-mark" aria-hidden="true"></span>
                <span><strong>${escapeHtml(notification.title)}</strong><small>${escapeHtml(notification.message)}</small></span></li>`).join('')}</ul>`
            : '<p class="workspace-member-card-state is-empty">Belum ada notifikasi baru.</p>'
          : ''}
      </section>
    </div>
    <section class="workspace-member-footer">
      <div><span class="section-tag cyan">AKUN & KEAMANAN</span><strong>Pastikan informasi akun Anda tetap tepat.</strong></div>
      <button type="button" class="btn-tactical" data-workspace-view="profile">BUKA PROFIL</button>
    </section>
  `;
}
