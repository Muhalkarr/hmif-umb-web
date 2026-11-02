/**
 * E-Voting Frontend Module
 * HMIF UMB PRTS Tactical Terminal — Pemilihan Ketua Himpunan / Ketua Umum
 *
 * API References:
 * - GET  /api/voting/polls           → Daftar semua pemilihan
 * - GET  /api/voting/polls/:id       → Detail pemilihan + kandidat + status voting
 * - POST /api/voting/polls/:id/vote  → Kirim suara (candidate_id)
 */

const API_BASE = '/api/voting';

// ============================
// 1. Fetch Data
// ============================

/**
 * Mengambil daftar semua pemilihan (termasuk draft jika clearance >= 3)
 */
export async function fetchPolls(includeDraft = false) {
  const url = includeDraft
    ? `${API_BASE}/polls?includeDraft=true`
    : `${API_BASE}/polls`;
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error('Gagal memuat daftar pemilihan');
  return response.json();
}

/**
 * Mengambil detail satu pemilihan (kandidat, status voting, hasil)
 */
export async function fetchPoll(pollId) {
  const response = await fetch(`${API_BASE}/polls/${pollId}`, { credentials: 'include' });
  if (!response.ok) throw new Error('Pemilihan tidak ditemukan');
  return response.json();
}

/**
 * Mengirim suara ke kandidat yang dipilih
 * @param {string} pollId - ID pemilihan
 * @param {string} candidateId - ID kandidat yang dipilih
 */
export async function castVote(pollId, candidateId) {
  const response = await fetch(`${API_BASE}/polls/${pollId}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ candidate_id: candidateId })
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Gagal mengirim suara');
  }
  return response.json();
}

// ============================
// 2. Render Functions
// ============================

/**
 * Render daftar pemilihan ke dalam container
 * @param {HTMLElement} container - Elemen DOM target
 */
export async function renderPollList(container) {
  container.innerHTML = '<p>Memuat pemilihan...</p>';
  try {
    const polls = await fetchPolls();
    if (polls.length === 0) {
      container.innerHTML = '<p>Belum ada pemilihan yang dibuat.</p>';
      return;
    }
    container.innerHTML = polls.map(poll => `
      <article class="poll-card" data-poll-id="${poll.id}">
        <h3>${poll.title}</h3>
        <p>${poll.description || '—'}</p>
        <div class="poll-meta">
          <span>Tanggal: ${new Date(poll.start_date).toLocaleDateString('id-ID')} s/d ${new Date(poll.end_date).toLocaleDateString('id-ID')}</span>
          ${poll.status === 'active' ? '<span class="status-active">Sedang Berlangsung</span>' : ''}
        </div>
        <a href="/voting/polls/${poll.id}" class="poll-link">Lihat Detail & Pilih</a>
      </article>
    `).join('');
  } catch (err) {
    container.innerHTML = `<p style="color: #ff6b6b;">❌ ${err.message}</p>`;
  }
}

/**
 * Render halaman detail pemilihan (kandidat + voting)
 * @param {HTMLElement} container - Elemen DOM target
 * @param {string} pollId - ID pemilihan
 */
export async function renderPollDetail(container, pollId) {
  container.innerHTML = '<p>Memuat detail pemilihan...</p>';
  try {
    const { poll, user_vote, results } = await fetchPoll(pollId);

    // Status voting
    const isClosed = poll.status === 'closed';
    const hasVoted = Boolean(user_vote);
    const canVote = !hasVoted && !isClosed;

    // Render kandidat
    const candidatesHtml = (poll.candidates || []).map(candidate => {
      const voted = user_vote?.candidate_id === candidate.id;
      return `
        <article class="candidate-card ${voted ? 'voted' : ''}" data-candidate-id="${candidate.id}">
          <div class="candidate-img">
            <img src="${candidate.image_url || '/assets/silhouette_male.jpg'}"
                 alt="${candidate.candidate_name}"
                 onerror="this.onerror=null;this.src='/assets/silhouette_male.jpg'">
          </div>
          <div class="candidate-info">
            <h3>No. ${candidate.candidate_number} — ${candidate.candidate_name}</h3>
            <p>${candidate.vision_mission || '—'}</p>
          </div>
          <button class="vote-btn ${voted ? 'disabled' : ''}"
                  ${!canVote ? 'disabled' : ''}
                  data-candidate-id="${candidate.id}"
                  data-poll-id="${pollId}">
            ${voted ? 'Sudah Disukai!' : 'Beri Suara'}
          </button>
        </article>
      `;
    }).join('') || '<p>Tidak ada kandidat yang terdaftar.</p>';

    // Render hasil (jika boleh dilihat)
    let resultsHtml = '';
    if (canVote) {
      resultsHtml = '<p>Hasil akan tampil setelah Anda memberikan suara atau saat pemilihan ditutup.</p>';
    } else if (isClosed || hasVoted) {
      resultsHtml = `
        <h4>Hasil Akhir</h4>
        <ul class="results-list">
          ${Object.entries(results || {}).map(([candidateId, data]) => `
            <li>
              <strong>${data.votes} suara</strong> — ${data.candidate_name}
            </li>
          `).join('')}
        </ul>
      `;
    }

    container.innerHTML = `
      <section class="poll-header">
        <h2>${poll.title}</h2>
        <p>${poll.description || ''}</p>
        <div class="poll-info">
          <span>Tanggal: ${new Date(poll.start_date).toLocaleDateString('id-ID')} — ${new Date(poll.end_date).toLocaleDateString('id-ID')}</span>
          ${isClosed ? '<span class="status-closed">Ditutup</span>' : '<span class="status-active">Sedang Berlangsung</span>'}
        </div>
      </section>

      <section class="candidates-section">
        ${candidatesHtml}
      </section>

      ${user_vote ? `
        <div class="vote-receipt">
          <h4>✅ Terima kasih!</h4>
          <p>Suara Anda telah dicatat dan diamankan secara rahasia.</p>
          <p><strong>Receipt ID:</strong> ${user_vote.receipt_id || '—'}</p>
        </div>
      ` : ''}

      ${resultsHtml}
    `;
  } catch (err) {
    container.innerHTML = `<p style="color: #ff6b6b;">❌ ${err.message}</p>`;
  }
}

// ============================
// 3. Event Handlers
// ============================

/**
 * Menangani klik tombol "Beri Suara"
 */
export async function handleVoteClick(event) {
  const button = event.target;
  const candidateId = button.dataset.candidateId;
  const pollId = button.dataset.pollId;

  if (!candidateId || !pollId) return;

  // Tampilkan konfirmasi
  if (!confirm('Apakah Anda yakin ingin memberikan suara kepada kandidat ini?')) return;

  // Non-aktif tombol sementara
  button.disabled = true;
  button.textContent = 'Mengirim...';

  try {
    const receipt = await castVote(pollId, candidateId);
    // Tampilkan notifikasi sukses
    alert('Suara Anda berhasil dicatat!\nReceipt ID: ' + (receipt.receipt_id || '—'));
    // Refresh halaman atau tutup modal
    location.reload(); // atau tutup modal
  } catch (err) {
    // Kembalikan tombol state
    button.disabled = false;
    button.textContent = 'Beri Suara';
    alert('Gagal mengirim suara: ' + err.message);
  }
}

/**
 * Inisialisasi event listeners untuk halaman voting
 */
export function initVotingEvents() {
  // Event delegation untuk tombol vote
  document.body.addEventListener('click', (event) => {
    if (event.target.classList.contains('vote-btn')) {
      event.preventDefault();
      handleVoteClick(event);
    }
  });
}