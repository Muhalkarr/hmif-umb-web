/* ==========================================================================
   HMIF UNIVERSITAS MAYASARI BAKTI — E-VOTING ROUTES
   ========================================================================== */

export const registerVotingRoutes = (app, ctx) => {
  const { requireAuth, requireClearance, votingRepository, auditService } = ctx;

  // List all polls
  app.get('/api/voting/polls', (req, res) => {
    try {
      const includeDraft = req.user && req.user.clearance_level >= 3;
      const polls = votingRepository.listPolls(includeDraft);
      res.json({ polls });
    } catch (err) {
      res.status(500).json({ error: err.message || 'Gagal memuat daftar pemilihan.' });
    }
  });

  // Get specific poll details + user vote status + results if closed or voted
  app.get('/api/voting/polls/:id', (req, res) => {
    try {
      const poll = votingRepository.getPoll(req.params.id);
      if (!poll) {
        return res.status(404).json({ error: 'Pemilihan tidak ditemukan.' });
      }

      let userVote = null;
      let results = null;

      if (req.user) {
        userVote = votingRepository.getUserVote(poll.id, req.user.nim);
      }

      const isClosed = poll.status === 'closed';
      const hasVoted = Boolean(userVote);
      const isAdminOrBph = req.user && req.user.clearance_level >= 3;

      if (isClosed || hasVoted || isAdminOrBph) {
        results = votingRepository.getPollResults(poll.id);
      }

      res.json({
        poll,
        user_vote: userVote,
        results: results || (isClosed ? votingRepository.getPollResults(poll.id) : null)
      });
    } catch (err) {
      res.status(500).json({ error: err.message || 'Gagal memuat detail pemilihan.' });
    }
  });

  // Create poll (Clearance >= 3)
  app.post('/api/voting/polls', requireAuth, requireClearance(3), (req, res) => {
    try {
      const { title, description, start_date, end_date, status } = req.body;
      if (!title || !start_date || !end_date) {
        return res.status(400).json({ error: 'Judul, tanggal mulai, dan tanggal selesai wajib diisi.' });
      }

      const poll = votingRepository.createPoll({
        title,
        description,
        start_date,
        end_date,
        status: status || 'draft'
      }, req.user.nim);

      auditService?.record?.({
        actor_nim: req.user.nim,
        action: 'CREATE_POLL',
        target: poll.id,
        details: `Membuat pemilihan: ${title}`
      });

      res.status(201).json({ message: 'Pemilihan berhasil dibuat.', poll });
    } catch (err) {
      res.status(500).json({ error: err.message || 'Gagal membuat pemilihan.' });
    }
  });

  // Update poll (Clearance >= 3)
  app.put('/api/voting/polls/:id', requireAuth, requireClearance(3), (req, res) => {
    try {
      const poll = votingRepository.updatePoll(req.params.id, req.body);
      if (!poll) {
        return res.status(404).json({ error: 'Pemilihan tidak ditemukan.' });
      }

      auditService?.record?.({
        actor_nim: req.user.nim,
        action: 'UPDATE_POLL',
        target: poll.id,
        details: `Memperbarui pemilihan: ${poll.title}`
      });

      res.json({ message: 'Pemilihan berhasil diperbarui.', poll });
    } catch (err) {
      res.status(500).json({ error: err.message || 'Gagal memperbarui pemilihan.' });
    }
  });

  // Delete poll (Clearance >= 3)
  app.delete('/api/voting/polls/:id', requireAuth, requireClearance(3), (req, res) => {
    try {
      const poll = votingRepository.getPoll(req.params.id);
      if (!poll) {
        return res.status(404).json({ error: 'Pemilihan tidak ditemukan.' });
      }

      votingRepository.deletePoll(req.params.id);

      auditService?.record?.({
        actor_nim: req.user.nim,
        action: 'DELETE_POLL',
        target: req.params.id,
        details: `Menghapus pemilihan: ${poll.title}`
      });

      res.json({ message: 'Pemilihan berhasil dihapus.' });
    } catch (err) {
      res.status(500).json({ error: err.message || 'Gagal menghapus pemilihan.' });
    }
  });

  // Add candidate to poll (Clearance >= 3)
  app.post('/api/voting/polls/:id/candidates', requireAuth, requireClearance(3), (req, res) => {
    try {
      const poll = votingRepository.getPoll(req.params.id);
      if (!poll) {
        return res.status(404).json({ error: 'Pemilihan tidak ditemukan.' });
      }

      const { candidate_number, candidate_name, candidate_nim, vision_mission, image_url } = req.body;
      if (!candidate_name || !candidate_number) {
        return res.status(400).json({ error: 'Nomor urut dan nama kandidat wajib diisi.' });
      }

      const candidate = votingRepository.addCandidate(poll.id, {
        candidate_number,
        candidate_name,
        candidate_nim,
        vision_mission,
        image_url
      });

      res.status(201).json({ message: 'Kandidat berhasil ditambahkan.', candidate });
    } catch (err) {
      res.status(500).json({ error: err.message || 'Gagal menambahkan kandidat.' });
    }
  });

  // Delete candidate (Clearance >= 3)
  app.delete('/api/voting/candidates/:candidateId', requireAuth, requireClearance(3), (req, res) => {
    try {
      votingRepository.deleteCandidate(req.params.candidateId);
      res.json({ message: 'Kandidat berhasil dihapus.' });
    } catch (err) {
      res.status(500).json({ error: err.message || 'Gagal menghapus kandidat.' });
    }
  });

  // Cast vote (Requires auth, clearance >= 1)
  app.post('/api/voting/polls/:id/vote', requireAuth, (req, res) => {
    try {
      const { candidate_id } = req.body;
      if (!candidate_id) {
        return res.status(400).json({ error: 'Kandidat belum dipilih.' });
      }

      const receipt = votingRepository.castVote(req.params.id, req.user.nim, candidate_id);

      auditService?.record?.({
        actor_nim: req.user.nim,
        action: 'CAST_VOTE',
        target: req.params.id,
        details: `Memberikan suara pada pemilihan ID ${req.params.id}`
      });

      res.json({
        message: 'Suara (vote) Anda berhasil dicatat dan diamankan secara rahasia.',
        receipt,
        results: votingRepository.getPollResults(req.params.id)
      });
    } catch (err) {
      res.status(400).json({ error: err.message || 'Gagal memberikan suara.' });
    }
  });

  // Get poll results (Clearance >= 2 or if voted/closed)
  app.get('/api/voting/polls/:id/results', requireAuth, (req, res) => {
    try {
      const poll = votingRepository.getPoll(req.params.id);
      if (!poll) {
        return res.status(404).json({ error: 'Pemilihan tidak ditemukan.' });
      }

      const userVote = votingRepository.getUserVote(poll.id, req.user.nim);
      const isAdmin = req.user.clearance_level >= 2;

      if (poll.status !== 'closed' && !userVote && !isAdmin) {
        return res.status(403).json({ error: 'Hasil pemilihan belum dapat dilihat sebelum Anda memberikan suara atau pemilihan ditutup.' });
      }

      const results = votingRepository.getPollResults(poll.id);
      res.json({ results });
    } catch (err) {
      res.status(500).json({ error: err.message || 'Gagal memuat hasil pemilihan.' });
    }
  });
};
