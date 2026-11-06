import { randomUUID } from 'node:crypto';

/**
 * SQLite operations for E-Voting (Polling, Candidates, and Secure Votes).
 */
export const createVotingSqlRepository = ({ sqlite }) => {
  const repo = {
    listPolls(includeDraft = false) {
      const where = includeDraft ? '' : "WHERE status != 'draft'";
      return sqlite.prepare(`
        SELECT id, title, description, start_date, end_date, status, created_by, created_at
        FROM voting_polls ${where}
        ORDER BY start_date DESC, created_at DESC
      `).all().map(poll => ({
        ...poll,
        candidates: repo.listCandidates(poll.id)
      }));
    },

    getPoll(id) {
      const poll = sqlite.prepare(`
        SELECT id, title, description, start_date, end_date, status, created_by, created_at
        FROM voting_polls WHERE id = ?
      `).get(id);
      if (!poll) return null;
      return {
        ...poll,
        candidates: repo.listCandidates(poll.id)
      };
    },

    createPoll(data, actorNim) {
      const id = `poll-${randomUUID()}`;
      const now = new Date().toISOString();
      const poll = {
        id,
        title: data.title,
        description: data.description || '',
        start_date: data.start_date,
        end_date: data.end_date,
        status: data.status || 'draft',
        created_by: actorNim,
        created_at: now
      };
      sqlite.prepare(`
        INSERT INTO voting_polls (id, title, description, start_date, end_date, status, created_by, created_at)
        VALUES (@id, @title, @description, @start_date, @end_date, @status, @created_by, @created_at)
      `).run(poll);
      return repo.getPoll(id);
    },

    updatePoll(id, updates) {
      const existing = repo.getPoll(id);
      if (!existing) return null;
      const updated = {
        title: updates.title ?? existing.title,
        description: updates.description ?? existing.description,
        start_date: updates.start_date ?? existing.start_date,
        end_date: updates.end_date ?? existing.end_date,
        status: updates.status ?? existing.status,
        id
      };
      sqlite.prepare(`
        UPDATE voting_polls
        SET title = @title, description = @description, start_date = @start_date, end_date = @end_date, status = @status
        WHERE id = @id
      `).run(updated);
      return repo.getPoll(id);
    },

    deletePoll(id) {
      const transaction = sqlite.transaction(() => {
        sqlite.prepare('DELETE FROM voting_votes WHERE poll_id = ?').run(id);
        sqlite.prepare('DELETE FROM voting_candidates WHERE poll_id = ?').run(id);
        sqlite.prepare('DELETE FROM voting_polls WHERE id = ?').run(id);
      });
      transaction.immediate();
      return true;
    },

    listCandidates(pollId) {
      return sqlite.prepare(`
        SELECT id, poll_id, candidate_number, candidate_name, candidate_nim, vision_mission, image_url, created_at
        FROM voting_candidates WHERE poll_id = ?
        ORDER BY candidate_number ASC
      `).all(pollId);
    },

    addCandidate(pollId, data) {
      const id = `cand-${randomUUID()}`;
      const now = new Date().toISOString();
      const candidate = {
        id,
        poll_id: pollId,
        candidate_number: Number(data.candidate_number) || 1,
        candidate_name: data.candidate_name,
        candidate_nim: data.candidate_nim || '',
        vision_mission: data.vision_mission || '',
        image_url: data.image_url || '/assets/silhouette_male.jpg',
        created_at: now
      };
      sqlite.prepare(`
        INSERT INTO voting_candidates (id, poll_id, candidate_number, candidate_name, candidate_nim, vision_mission, image_url, created_at)
        VALUES (@id, @poll_id, @candidate_number, @candidate_name, @candidate_nim, @vision_mission, @image_url, @created_at)
      `).run(candidate);
      return candidate;
    },

    deleteCandidate(candidateId) {
      sqlite.prepare('DELETE FROM voting_candidates WHERE id = ?').run(candidateId);
      return true;
    },

    getUserVote(pollId, voterNim) {
      return sqlite.prepare(`
        SELECT id, poll_id, voter_nim, candidate_id, voted_at
        FROM voting_votes WHERE poll_id = ? AND voter_nim = ?
      `).get(pollId, voterNim) || null;
    },

    castVote(pollId, voterNim, candidateId) {
      const existingVote = repo.getUserVote(pollId, voterNim);
      if (existingVote) {
        throw new Error('Anda sudah memberikan suara (vote) pada pemilihan ini.');
      }
      const poll = repo.getPoll(pollId);
      if (!poll || poll.status !== 'active') {
        throw new Error('Pemilihan tidak aktif atau belum dibuka.');
      }
      const candidate = sqlite.prepare('SELECT id FROM voting_candidates WHERE id = ? AND poll_id = ?').get(candidateId, pollId);
      if (!candidate) {
        throw new Error('Kandidat tidak valid.');
      }

      const voteId = `vote-${randomUUID()}`;
      const now = new Date().toISOString();
      sqlite.prepare(`
        INSERT INTO voting_votes (id, poll_id, voter_nim, candidate_id, voted_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(voteId, pollId, voterNim, candidateId, now);

      return { vote_id: voteId, voted_at: now };
    },

    getPollResults(pollId) {
      const candidates = repo.listCandidates(pollId);
      const voteCounts = sqlite.prepare(`
        SELECT candidate_id, COUNT(*) as vote_count
        FROM voting_votes WHERE poll_id = ?
        GROUP BY candidate_id
      `).all(pollId);

      const countMap = new Map(voteCounts.map(vc => [vc.candidate_id, vc.vote_count]));
      const totalVotes = voteCounts.reduce((acc, vc) => acc + vc.vote_count, 0);

      const results = candidates.map(cand => {
        const votes = countMap.get(cand.id) || 0;
        const percentage = totalVotes > 0 ? Number(((votes / totalVotes) * 100).toFixed(1)) : 0;
        return {
          ...cand,
          vote_count: votes,
          percentage
        };
      });

      return {
        poll_id: pollId,
        total_votes: totalVotes,
        results
      };
    }
  };

  return repo;
};
