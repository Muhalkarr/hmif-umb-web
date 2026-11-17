/* ==========================================================================
   HMIF UNIVERSITAS MAYASARI BAKTI — E-VOTING ROUTES
   ========================================================================== */

export const registerVotingRoutes = (app, ctx) => {
  const { requireAuth, requireCapability, hasCapability, votingRepository, auditAdminMutation, validDate } = ctx;
  const canManagePolls = (user) => hasCapability(user, 'voting.manage');
  const validPollInput = ({ title, description = '', start_date, end_date }) => (
    typeof title === 'string' && title.trim().length > 0 && title.length <= 180
    && typeof description === 'string' && description.length <= 3000
    && validDate(start_date) && validDate(end_date) && end_date >= start_date
  );

  // List all polls
  app.get('/api/voting/polls', (req, res) => {
    try {
      const includeDraft = canManagePolls(req.user);
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
      if (poll.status === 'draft' && !canManagePolls(req.user)) {
        return res.status(404).json({ error: 'Pemilihan tidak ditemukan.' });
      }

      let userVote = null;
      let results = null;

      if (req.user) {
        userVote = votingRepository.getUserVote(poll.id, req.user.nim);
      }

      const isClosed = poll.status === 'closed';
      const hasVoted = Boolean(userVote);
      const canViewResults = hasCapability(req.user, 'voting.manage');

      if (isClosed || hasVoted || canViewResults) {
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

  // Create poll (voting.manage)
  app.post('/api/voting/polls', requireAuth, requireCapability('voting.manage'), (req, res) => {
    try {
      const { title, description = '', start_date, end_date } = req.body;
      if (!validPollInput({ title, description, start_date, end_date })) {
        return res.status(400).json({ error: 'Judul, keterangan, atau rentang tanggal pemilihan tidak valid.' });
      }

      const poll = votingRepository.createPoll({
        title: title.trim(),
        description: description.trim(),
        start_date,
        end_date,
        status: 'draft'
      }, req.user.nim);

      auditAdminMutation(req, 'voting.poll_create', 'voting_poll', poll.id, { title: poll.title });

      res.status(201).json({ message: 'Pemilihan berhasil dibuat.', poll });
    } catch (err) {
      res.status(500).json({ error: err.message || 'Gagal membuat pemilihan.' });
    }
  });

  // Update poll (voting.manage)
  app.put('/api/voting/polls/:id', requireAuth, requireCapability('voting.manage'), (req, res) => {
    try {
      const existing = votingRepository.getPoll(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Pemilihan tidak ditemukan.' });
      const updates = req.body || {};
      const candidate = {
        title: updates.title ?? existing.title,
        description: updates.description ?? existing.description,
        start_date: updates.start_date ?? existing.start_date,
        end_date: updates.end_date ?? existing.end_date
      };
      if (!validPollInput(candidate) || (updates.status !== undefined && !['draft', 'active', 'closed'].includes(updates.status))) {
        return res.status(400).json({ error: 'Perubahan pemilihan tidak valid.' });
      }
      const poll = votingRepository.updatePoll(req.params.id, updates);
      if (!poll) {
        return res.status(404).json({ error: 'Pemilihan tidak ditemukan.' });
      }

      auditAdminMutation(req, 'voting.poll_update', 'voting_poll', poll.id, { status: poll.status });

      res.json({ message: 'Pemilihan berhasil diperbarui.', poll });
    } catch (err) {
      res.status(500).json({ error: err.message || 'Gagal memperbarui pemilihan.' });
    }
  });

  // Delete poll (voting.manage)
  app.delete('/api/voting/polls/:id', requireAuth, requireCapability('voting.manage'), (req, res) => {
    try {
      const poll = votingRepository.getPoll(req.params.id);
      if (!poll) {
        return res.status(404).json({ error: 'Pemilihan tidak ditemukan.' });
      }

      votingRepository.deletePoll(req.params.id);

      auditAdminMutation(req, 'voting.poll_delete', 'voting_poll', req.params.id, { title: poll.title });

      res.json({ message: 'Pemilihan berhasil dihapus.' });
    } catch (err) {
      res.status(500).json({ error: err.message || 'Gagal menghapus pemilihan.' });
    }
  });

  // Add candidate to poll (voting.manage)
  app.post('/api/voting/polls/:id/candidates', requireAuth, requireCapability('voting.manage'), (req, res) => {
    try {
      const poll = votingRepository.getPoll(req.params.id);
      if (!poll) {
        return res.status(404).json({ error: 'Pemilihan tidak ditemukan.' });
      }

      if (poll.status !== 'draft') {
        return res.status(400).json({ error: 'Kandidat hanya dapat ditambahkan saat pemilihan masih berstatus draft.' });
      }
      const { candidate_number, candidate_name, candidate_nim = '', vision_mission = '', image_url = '' } = req.body;
      if (!Number.isInteger(Number(candidate_number)) || Number(candidate_number) < 1
        || typeof candidate_name !== 'string' || !candidate_name.trim() || candidate_name.length > 160
        || typeof candidate_nim !== 'string' || candidate_nim.length > 32
        || typeof vision_mission !== 'string' || vision_mission.length > 3000
        || typeof image_url !== 'string' || image_url.length > 2000) {
        return res.status(400).json({ error: 'Nomor urut atau data kandidat tidak valid.' });
      }

      const candidate = votingRepository.addCandidate(poll.id, {
        candidate_number: Number(candidate_number),
        candidate_name: candidate_name.trim(),
        candidate_nim,
        vision_mission,
        image_url
      });

      res.status(201).json({ message: 'Kandidat berhasil ditambahkan.', candidate });
    } catch (err) {
      res.status(500).json({ error: err.message || 'Gagal menambahkan kandidat.' });
    }
  });

  // Delete candidate (voting.manage)
  app.delete('/api/voting/candidates/:candidateId', requireAuth, requireCapability('voting.manage'), (req, res) => {
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

      auditAdminMutation(req, 'voting.cast', 'voting_poll', req.params.id, {});

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
      const canViewResults = hasCapability(req.user, 'voting.manage');

      if (poll.status !== 'closed' && !userVote && !canViewResults) {
        return res.status(403).json({ error: 'Hasil pemilihan belum dapat dilihat sebelum Anda memberikan suara atau pemilihan ditutup.' });
      }

      const results = votingRepository.getPollResults(poll.id);
      res.json({ results });
    } catch (err) {
      res.status(500).json({ error: err.message || 'Gagal memuat hasil pemilihan.' });
    }
  });
};
