const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[character]));

const meetingDate = (value) => new Date(value).toLocaleString('id-ID', {
  dateStyle: 'medium',
  timeStyle: 'short'
});

const localDateTimeValue = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const responseLabel = {
  invited: 'Menunggu jawaban',
  accepted: 'Akan hadir',
  declined: 'Tidak hadir',
  attended: 'Hadir',
  absent: 'Tidak hadir'
};

const renderMeetingCard = (meeting) => `
  <article class="workspace-course-card workspace-meeting-card">
    <span class="workspace-feature-kicker">${escapeHtml(responseLabel[meeting.my_response] || 'Undangan rapat')} // ${escapeHtml(meeting.location || 'Lokasi belum ditentukan')}</span>
    <h3>${escapeHtml(meeting.title)}</h3>
    <p>${meetingDate(meeting.starts_at)} — ${meetingDate(meeting.ends_at)}</p>
    <button type="button" class="btn-tactical" data-meeting-open="${escapeHtml(meeting.id)}">DETAIL RAPAT</button>
  </article>
`;

const recordingStatusLabel = (recording) => ({
  starting: 'Menyiapkan rekaman...',
  recording: 'Rapat sedang direkam',
  stopping: 'Menyelesaikan rekaman...',
  completed: 'Rekaman tersedia',
  failed: 'Rekaman gagal diproses',
  expired: 'Masa retensi rekaman berakhir'
}[recording?.status] || 'Belum ada rekaman');

const renderMeetingDetails = (meeting, user, capabilities) => {
  const accountId = user.account_id;
  const isOrganizer = meeting.organizer_account_id === accountId;
  const canManage = isOrganizer && (user.role === 'superadmin' || user.permissions?.includes('meeting_organize'));
  const attendee = meeting.attendees.find(({ account_id: attendeeId }) => attendeeId === accountId);
  const canJoinVideo = meeting.status === 'scheduled'
    && !['declined', 'absent'].includes(attendee?.response)
    && meeting.video_mode === 'livekit'
    && capabilities.videoEnabled;
  const recording = meeting.recording;
  const recordingActive = ['starting', 'recording', 'stopping'].includes(recording?.status);
  const canDownloadRecording = recording?.status === 'completed'
    && Date.parse(recording.expires_at) > Date.now();
  const externalMeetingLink = meeting.video_mode === 'external' && /^https:\/\//i.test(meeting.location)
    ? `<a class="btn-tactical primary" href="${escapeHtml(meeting.location)}" target="_blank" rel="noopener noreferrer">BUKA RAPAT ONLINE ↗</a>`
    : '';
  return `
    <section class="workspace-feature-panel workspace-meeting-detail">
      <button type="button" class="workspace-text-action" data-meeting-back>← KEMBALI KE DAFTAR RAPAT</button>
      <span class="workspace-feature-kicker">RAPAT HMIF // ${escapeHtml(responseLabel[meeting.my_response] || '')}</span>
      <h2>${escapeHtml(meeting.title)}</h2>
      <p><strong>Waktu:</strong> ${meetingDate(meeting.starts_at)} — ${meetingDate(meeting.ends_at)}</p>
      <p><strong>${meeting.video_mode === 'external' ? 'Tautan konferensi:' : 'Lokasi:'}</strong>
        ${meeting.video_mode === 'external' ? externalMeetingLink || 'Tautan tidak valid.' : escapeHtml(meeting.location || 'Belum ditentukan')}</p>
      ${meeting.video_mode === 'livekit' ? `<section class="workspace-meeting-video">
        <h3>Panggilan video bawaan</h3>
        ${canJoinVideo
          ? '<button type="button" class="btn-tactical primary" data-meeting-video-join>GABUNG PANGGILAN VIDEO</button>'
          : '<p class="workspace-feature-note">Panggilan video belum tersedia untuk rapat ini.</p>'}
        <p data-meeting-video-feedback role="status" aria-live="polite"></p>
        <div class="workspace-video-call" data-meeting-video-call hidden>
          <div class="workspace-video-call-toolbar" aria-label="Kontrol panggilan video">
            <button type="button" class="btn-tactical" data-video-microphone aria-pressed="false">NYALAKAN MIKROFON</button>
            <button type="button" class="btn-tactical" data-video-camera aria-pressed="false">NYALAKAN KAMERA</button>
            <button type="button" class="btn-tactical" data-video-screen-share aria-pressed="false">BAGIKAN LAYAR</button>
            <button type="button" class="btn-tactical danger" data-video-leave>KELUAR RAPAT</button>
          </div>
          <p data-video-call-status role="status" aria-live="polite">Menyiapkan panggilan...</p>
          <div class="workspace-video-media-grid" data-video-media-grid role="group" aria-label="Video peserta rapat"></div>
        </div>
        <div class="workspace-recording-status" data-recording-banner data-recording-status="${escapeHtml(recording?.status || 'none')}" role="status" aria-live="polite">
          <span data-recording-label>${escapeHtml(recordingStatusLabel(recording))}</span>
          <a data-recording-download ${canDownloadRecording ? '' : 'hidden'}
            href="/api/meetings/${encodeURIComponent(meeting.id)}/recordings/${encodeURIComponent(recording?.id || '')}/download">UNDUH REKAMAN</a>
        </div>
        ${canManage && capabilities.recordingEnabled && !recordingActive ? `<div class="workspace-recording-controls" data-recording-start-panel>
          <label><input type="checkbox" data-recording-notice />
            <span>Saya telah memberi tahu peserta bahwa rapat ini akan direkam.</span></label>
          <button type="button" class="btn-tactical danger" data-recording-start disabled>MULAI REKAM RAPAT</button>
          <p class="workspace-feature-note">Rekaman akan disimpan privat dan dihapus sesuai kebijakan retensi.</p>
        </div>` : ''}
        ${canManage && recordingActive ? '<button type="button" class="btn-tactical danger" data-recording-stop>HENTIKAN REKAMAN</button>' : ''}
        ${canManage && !capabilities.recordingEnabled
          ? `<p class="workspace-feature-note">${capabilities.recordingDisabledReason === 'policy_pending'
            ? 'Perekaman dinonaktifkan sampai kebijakan retensi disepakati.'
            : 'Perekaman belum dikonfigurasi.'}</p>`
          : ''}
      </section>` : ''}
      ${meeting.status === 'cancelled' ? '<p class="workspace-feature-error" role="status">Rapat ini telah dibatalkan.</p>' : ''}
      ${meeting.recurrence_rule ? `<p><strong>Rapat berulang:</strong> ${escapeHtml(meeting.recurrence_rule.frequency)}, setiap ${meeting.recurrence_rule.interval} interval hingga ${escapeHtml(meeting.recurrence_rule.until)}.</p>` : ''}
      <div class="workspace-meeting-agenda"><h3>Agenda</h3><p>${escapeHtml(meeting.agenda || 'Belum ada agenda.')}</p></div>
      ${!isOrganizer && meeting.status !== 'cancelled' && attendee?.response !== 'attended' && attendee?.response !== 'absent' ? `
        <div class="workspace-meeting-actions">
          <button type="button" class="btn-tactical primary" data-meeting-rsvp="accepted">KONFIRMASI HADIR</button>
          <button type="button" class="btn-tactical" data-meeting-rsvp="declined">TIDAK DAPAT HADIR</button>
        </div>` : ''}
      <p data-meeting-global-feedback role="status" aria-live="polite"></p>
      ${canManage && meeting.status !== 'cancelled' ? `<section class="workspace-meeting-schedule">
        <h3>Ubah jadwal atau batalkan</h3>
        <form class="workspace-feature-form" data-meeting-reschedule>
          <label>Mulai<input name="starts_at" type="datetime-local" value="${localDateTimeValue(meeting.starts_at)}" required /></label>
          <label>Selesai<input name="ends_at" type="datetime-local" value="${localDateTimeValue(meeting.ends_at)}" required /></label>
          <button type="submit" class="btn-tactical">JADWALKAN ULANG KEJADIAN INI</button>
        </form>
        <div class="workspace-meeting-actions">
          <button type="button" class="btn-tactical" data-meeting-cancel="occurrence">BATALKAN KEJADIAN INI</button>
          ${meeting.recurrence_rule ? '<button type="button" class="btn-tactical" data-meeting-cancel="series">BATALKAN SELURUH RANGKAIAN</button>' : ''}
        </div>
      </section>` : ''}
      ${isOrganizer ? `<section class="workspace-meeting-roster"><h3>Peserta & presensi</h3>
        <ul>${meeting.attendees.map((person) => `<li>
          <span>${escapeHtml(person.name || 'Peserta')} (${escapeHtml(person.nim || 'akun')} · ${escapeHtml(responseLabel[person.response] || '')})</span>
          ${canManage && person.account_id !== accountId ? `<span class="workspace-meeting-actions">
            <button type="button" class="btn-tactical" data-meeting-attendance="${escapeHtml(person.account_id)}" data-meeting-response="attended">HADIR</button>
            <button type="button" class="btn-tactical" data-meeting-attendance="${escapeHtml(person.account_id)}" data-meeting-response="absent">TIDAK HADIR</button>
          </span>` : ''}
        </li>`).join('')}</ul></section>` : ''}
      ${isOrganizer && !canManage ? '<p class="workspace-feature-note">Capability penyelenggara telah dicabut. Rapat ini hanya tersedia untuk dibaca.</p>' : ''}
      <section class="workspace-meeting-minutes">
        <h3>Notulensi & keputusan</h3>
        ${meeting.minutes ? `<p class="workspace-meeting-minutes-text">${escapeHtml(meeting.minutes)}</p>` : '<p>Notulensi belum tersedia.</p>'}
        ${meeting.decisions.length ? `<ul>${meeting.decisions.map((decision) => `<li>${escapeHtml(decision)}</li>`).join('')}</ul>` : ''}
        ${canManage ? `<form class="workspace-feature-form" data-meeting-minutes>
          <label>Catatan rapat<textarea name="minutes" rows="5" maxlength="12000">${escapeHtml(meeting.minutes)}</textarea></label>
          <label>Keputusan (satu per baris)<textarea name="decisions" rows="3" maxlength="3000">${escapeHtml(meeting.decisions.join('\n'))}</textarea></label>
          <button type="submit" class="btn-tactical primary">SIMPAN NOTULENSI</button><p data-meeting-feedback role="status"></p>
        </form>` : ''}
      </section>
      <section class="workspace-meeting-followups"><h3>Tindak lanjut</h3>
        ${meeting.actions.length ? `<ul>${meeting.actions.map((action) => `<li>
          <span>${escapeHtml(action.title)}${action.assignee_name ? ` · ${escapeHtml(action.assignee_name)} (${escapeHtml(action.assignee_nim)})` : ''}${action.due_date ? ` · tenggat ${escapeHtml(action.due_date)}` : ''}</span>
          <span>${escapeHtml(action.status.replace('_', ' '))}${canManage ? `<select data-meeting-action-status="${escapeHtml(action.id)}" aria-label="Status tindak lanjut"><option value="todo" ${action.status === 'todo' ? 'selected' : ''}>Belum dimulai</option><option value="in_progress" ${action.status === 'in_progress' ? 'selected' : ''}>Berjalan</option><option value="done" ${action.status === 'done' ? 'selected' : ''}>Selesai</option></select>` : ''}</span>
        </li>`).join('')}</ul>` : '<p>Belum ada tindak lanjut yang dicatat.</p>'}
        ${canManage ? `<form class="workspace-feature-form" data-meeting-action>
          <label>Tindak lanjut<input name="title" maxlength="240" required /></label>
          <label>Penanggung jawab (NIM peserta, opsional)<input name="assignee_nim" maxlength="80" /></label>
          <label>Tenggat<input name="due_date" type="date" /></label>
          <button type="submit" class="btn-tactical">TAMBAH TINDAK LANJUT</button><p data-meeting-feedback role="status"></p>
        </form>` : ''}
      </section>
      <section class="workspace-meeting-documents"><h3>Dokumentasi rapat</h3>
        ${meeting.documents.length ? `<ul>${meeting.documents.map((document) => `<li><a href="${escapeHtml(document.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(document.title)}</a></li>`).join('')}</ul>` : '<p>Belum ada tautan dokumentasi.</p>'}
        ${canManage ? `<form class="workspace-feature-form" data-meeting-document>
          <label>Nama dokumen<input name="title" maxlength="160" required /></label>
          <label>Tautan HTTPS<input name="url" type="url" inputmode="url" placeholder="https://" required /></label>
          <button type="submit" class="btn-tactical">TAMBAH DOKUMENTASI</button><p data-meeting-feedback role="status"></p>
        </form>
        <form class="workspace-feature-form" data-meeting-file>
          <label>Nama dokumen PDF<input name="title" maxlength="160" required /></label>
          <label>File PDF privat<input name="file" type="file" accept="application/pdf,.pdf" required /></label>
          <button type="submit" class="btn-tactical">UNGGAH PDF PRIVAT</button><p data-meeting-feedback role="status"></p>
        </form>` : ''}
      </section>
    </section>
  `;
};

export function renderMeetingWorkspace({
  meetings,
  selectedMeeting,
  user,
  canOrganize,
  conferencingCapabilities = {},
  error = ''
}) {
  if (selectedMeeting) return renderMeetingDetails(selectedMeeting, user, conferencingCapabilities);
  return `
    <section class="workspace-feature-hero workspace-meeting-hero">
      <span class="section-tag cyan">TATA KELOLA HMIF // RAPAT INTERNAL</span>
      <h2>Rapat & tindak lanjut</h2>
      <p>Jadwal, undangan, jawaban kehadiran, presensi, notulensi, keputusan, dan dokumentasi rapat hanya terlihat bagi peserta yang diundang.</p>
    </section>
    ${error ? `<p class="workspace-member-card-state is-error" role="alert">${escapeHtml(error)}</p>` : ''}
    ${canOrganize ? `<details class="workspace-feature-panel workspace-meeting-create">
      <summary><strong>Jadwalkan rapat</strong><span>Capability penyelenggara rapat diperlukan untuk membuat undangan.</span></summary>
      <form class="workspace-feature-form" data-meeting-create>
        <label>Judul rapat<input name="title" minlength="3" maxlength="160" required /></label>
        <label>Agenda<textarea name="agenda" rows="3" maxlength="4000"></textarea></label>
        <label>Mode rapat<select name="video_mode" data-meeting-video-mode>
          <option value="in_person">Tatap muka</option>
          <option value="livekit" ${conferencingCapabilities.videoEnabled ? '' : 'disabled'}>Panggilan video bawaan${conferencingCapabilities.videoEnabled ? '' : ' (belum dikonfigurasi)'}</option>
          <option value="external">Tautan konferensi eksternal</option>
          <option value="google_meet" disabled>Google Meet otomatis (belum dikonfigurasi)</option>
        </select></label>
        <label data-meeting-location-label>Lokasi rapat<input name="location" data-meeting-location maxlength="240" placeholder="Ruang rapat" /></label>
        <div class="workspace-meeting-form-grid">
          <label>Mulai<input name="starts_at" type="datetime-local" required /></label>
          <label>Selesai<input name="ends_at" type="datetime-local" required /></label>
        </div>
        <label>Undang peserta<input name="attendee_nims" maxlength="8000" placeholder="NIM peserta, dipisahkan koma" />
          <small>Organizer otomatis disertakan sebagai peserta.</small></label>
        <label>Pengulangan<select name="frequency"><option value="">Tidak berulang</option><option value="weekly">Mingguan</option><option value="daily">Harian</option><option value="monthly">Bulanan</option></select></label>
        <div class="workspace-meeting-form-grid"><label>Interval<input name="interval" type="number" min="1" max="4" value="1" /></label>
          <label>Berulang hingga<input name="until" type="date" /></label></div>
        <button type="submit" class="btn-tactical primary">BUAT UNDANGAN RAPAT</button><p data-meeting-feedback role="status"></p>
      </form>
    </details>` : ''}
    <section class="workspace-meeting-list" aria-label="Rapat saya">
      <div class="workspace-panel-heading"><div><span class="section-tag gold">JADWAL & UNDANGAN</span><h2>Rapat saya</h2></div>
        <span class="workspace-panel-note">${meetings.length} RAPAT</span></div>
      ${meetings.length ? meetings.map(renderMeetingCard).join('') : '<p class="workspace-feature-panel">Belum ada undangan rapat.</p>'}
    </section>
  `;
}

export function bindMeetingWorkspace(container, api, {
  user,
  refresh,
  selectMeeting
}) {
  const meetingId = user.selectedMeetingId;
  const videoCall = container.querySelector('[data-meeting-video-call]');
  const videoJoinButton = container.querySelector('[data-meeting-video-join]');
  const videoFeedback = container.querySelector('[data-meeting-video-feedback]');
  const recordingLabel = container.querySelector('[data-recording-label]');
  const recordingBanner = container.querySelector('[data-recording-banner]');
  const recordingDownload = container.querySelector('[data-recording-download]');
  const recordingStartPanel = container.querySelector('[data-recording-start-panel]');
  const recordingStopButton = container.querySelector('[data-recording-stop]');
  let recordingStatusPoll;
  let videoConnection;

  const updateRecordingStatus = (recording) => {
    if (recordingLabel) recordingLabel.textContent = recordingStatusLabel(recording);
    if (recordingBanner) recordingBanner.dataset.recordingStatus = recording?.status || 'none';
    const active = ['starting', 'recording', 'stopping'].includes(recording?.status);
    if (recordingStartPanel) recordingStartPanel.hidden = active;
    if (recordingStopButton) recordingStopButton.hidden = !active;
    if (recordingDownload) {
      const available = recording?.status === 'completed' && Date.parse(recording.expires_at) > Date.now();
      recordingDownload.hidden = !available;
      if (available) {
        recordingDownload.href = `/api/meetings/${encodeURIComponent(meetingId)}/recordings/${encodeURIComponent(recording.id)}/download`;
      }
    }
  };

  const refreshRecordingStatus = async () => {
    const result = await api.getMeetingVideoStatus(meetingId);
    if (!result.ok) {
      if (videoFeedback) videoFeedback.textContent = result.error;
      return;
    }
    updateRecordingStatus(result.data.recording);
  };

  videoJoinButton?.addEventListener('click', async () => {
    videoJoinButton.disabled = true;
    if (videoFeedback) videoFeedback.textContent = 'Meminta akses panggilan video...';
    const tokenResult = await api.getMeetingVideoToken(meetingId);
    if (!tokenResult.ok) {
      if (videoFeedback) videoFeedback.textContent = tokenResult.error;
      videoJoinButton.disabled = false;
      return;
    }
    try {
      const { connectMeetingVideo } = await import('./meetingVideo.js');
      videoJoinButton.hidden = true;
      videoCall.hidden = false;
      videoConnection = await connectMeetingVideo(videoCall, tokenResult.data, (message) => {
        if (message !== 'closed') return;
        videoConnection = null;
        window.clearInterval(recordingStatusPoll);
        recordingStatusPoll = null;
        videoJoinButton.hidden = false;
        videoJoinButton.disabled = false;
      });
      await refreshRecordingStatus();
      recordingStatusPoll = window.setInterval(refreshRecordingStatus, 5000);
    } catch (error) {
      console.error('[MEETING VIDEO JOIN ERROR]', error);
      videoCall.hidden = true;
      videoJoinButton.hidden = false;
      videoJoinButton.disabled = false;
      if (videoFeedback) videoFeedback.textContent = 'Panggilan gagal dimulai. Periksa koneksi atau izin perangkat, lalu coba lagi.';
    }
  });

  const recordingNotice = container.querySelector('[data-recording-notice]');
  const recordingStartButton = container.querySelector('[data-recording-start]');
  recordingNotice?.addEventListener('change', () => {
    if (recordingStartButton) recordingStartButton.disabled = !recordingNotice.checked;
  });
  recordingStartButton?.addEventListener('click', async () => {
    if (!recordingNotice.checked) return;
    recordingStartButton.disabled = true;
    if (videoFeedback) videoFeedback.textContent = 'Memulai perekaman setelah pemberitahuan...';
    const result = await api.startMeetingRecording(meetingId, true);
    if (!result.ok) {
      if (videoFeedback) videoFeedback.textContent = result.error;
      recordingStartButton.disabled = false;
      return;
    }
    updateRecordingStatus(result.data.recording);
    if (videoFeedback) videoFeedback.textContent = 'Perekaman dimulai; peserta telah menerima pemberitahuan.';
  });
  recordingStopButton?.addEventListener('click', async () => {
    recordingStopButton.disabled = true;
    const result = await api.stopMeetingRecording(meetingId);
    if (!result.ok) {
      if (videoFeedback) videoFeedback.textContent = result.error;
      recordingStopButton.disabled = false;
      return;
    }
    updateRecordingStatus(result.data.recording);
    if (videoFeedback) videoFeedback.textContent = 'Perekaman sedang diselesaikan.';
  });

  const createForm = container.querySelector('[data-meeting-create]');
  const videoModeSelect = createForm?.querySelector('[data-meeting-video-mode]');
  const locationInput = createForm?.querySelector('[data-meeting-location]');
  const locationLabel = createForm?.querySelector('[data-meeting-location-label]');
  const updateLocationField = () => {
    if (!videoModeSelect || !locationInput || !locationLabel) return;
    const isExternal = videoModeSelect.value === 'external';
    locationInput.type = isExternal ? 'url' : 'text';
    locationInput.required = isExternal;
    locationInput.placeholder = isExternal ? 'https://...' : 'Ruang rapat (opsional)';
    locationLabel.firstChild.textContent = isExternal ? 'Tautan konferensi HTTPS' : 'Lokasi rapat';
  };
  videoModeSelect?.addEventListener('change', updateLocationField);
  updateLocationField();

  const reportError = (message) => {
    const feedback = container.querySelector('[data-meeting-global-feedback]');
    if (feedback) feedback.textContent = message;
  };
  container.querySelectorAll('[data-meeting-open]').forEach((button) => button.addEventListener('click', () => selectMeeting(button.dataset.meetingOpen)));
  container.querySelector('[data-meeting-back]')?.addEventListener('click', () => selectMeeting(''));
  container.querySelectorAll('[data-meeting-rsvp]').forEach((button) => button.addEventListener('click', async () => {
    const result = await api.respondToMeeting(user.selectedMeetingId, button.dataset.meetingRsvp);
    if (!result.ok) return reportError(result.error);
    await refresh();
  }));
  container.querySelectorAll('[data-meeting-attendance]').forEach((button) => button.addEventListener('click', async () => {
    const result = await api.markMeetingAttendance(user.selectedMeetingId, button.dataset.meetingAttendance, button.dataset.meetingResponse);
    if (!result.ok) return reportError(result.error);
    await refresh();
  }));
  container.querySelectorAll('[data-meeting-cancel]').forEach((button) => button.addEventListener('click', async () => {
    const scope = button.dataset.meetingCancel;
    const prompt = scope === 'series' ? 'Batalkan seluruh rangkaian rapat ini?' : 'Batalkan kejadian rapat ini?';
    if (!window.confirm(prompt)) return;
    const result = await api.cancelMeeting(user.selectedMeetingId, scope);
    if (!result.ok) return reportError(result.error);
    await refresh();
  }));
  container.querySelector('[data-meeting-reschedule]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const startsAt = new Date(values.starts_at);
    const endsAt = new Date(values.ends_at);
    if (!Number.isFinite(startsAt.valueOf()) || !Number.isFinite(endsAt.valueOf())) {
      return reportError('Waktu rapat tidak valid.');
    }
    const result = await api.rescheduleMeeting(user.selectedMeetingId, startsAt.toISOString(), endsAt.toISOString());
    if (!result.ok) return reportError(result.error);
    await refresh();
  });
  container.querySelector('[data-meeting-create]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const feedback = form.querySelector('[data-meeting-feedback]');
    const values = Object.fromEntries(new FormData(form));
    const recurrence = values.frequency ? {
      frequency: values.frequency,
      interval: Number(values.interval),
      until: values.until
    } : null;
    const startsAt = new Date(values.starts_at);
    const endsAt = new Date(values.ends_at);
    if (!Number.isFinite(startsAt.valueOf()) || !Number.isFinite(endsAt.valueOf())) {
      feedback.textContent = 'Waktu rapat tidak valid.';
      return;
    }
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    const result = await api.createMeeting({
      title: values.title,
      agenda: values.agenda,
      location: values.location,
      video_mode: values.video_mode,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      attendee_nims: values.attendee_nims.split(/[,\s]+/).filter(Boolean),
      recurrence
    });
    if (!result.ok) {
      submitButton.disabled = false;
      feedback.textContent = result.error;
      return;
    }
    feedback.textContent = 'Undangan rapat berhasil dibuat.';
    await refresh();
  });
  container.querySelector('[data-meeting-minutes]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const result = await api.saveMeetingMinutes(user.selectedMeetingId, values.minutes, values.decisions.split('\n'));
    if (!result.ok) return reportError(result.error);
    await refresh();
  });
  container.querySelector('[data-meeting-action]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const result = await api.createMeetingAction(user.selectedMeetingId, {
      title: values.title,
      assignee_nim: values.assignee_nim || '',
      due_date: values.due_date || null
    });
    if (!result.ok) return reportError(result.error);
    await refresh();
  });
  container.querySelectorAll('[data-meeting-action-status]').forEach((select) => select.addEventListener('change', async () => {
    const result = await api.updateMeetingAction(user.selectedMeetingId, select.dataset.meetingActionStatus, select.value);
    if (!result.ok) return reportError(result.error);
    await refresh();
  }));
  container.querySelector('[data-meeting-document]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const result = await api.addMeetingDocument(user.selectedMeetingId, values);
    if (!result.ok) return reportError(result.error);
    await refresh();
  });
  container.querySelector('[data-meeting-file]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const feedback = form.querySelector('[data-meeting-feedback]');
    const values = new FormData(form);
    const result = await api.uploadMeetingDocument(user.selectedMeetingId, values.get('title'), values.get('file'));
    if (!result.ok) {
      feedback.textContent = result.error;
      return;
    }
    await refresh();
  });
}
