/**
 * Gamification Service - Badges & Levels System
 *
 * Features:
 * - Award badges based on user actions
 * - Track user level and points
 * - Check badge eligibility
 * - Level up system
 */

export const createGamificationService = (db) => {
  const repo = {
    // Get user by account ID
    findUserByAccountId(accountId) {
      return repo.findUserByAccountId(accountId);
    },

    // Get all badge definitions
    getAllBadgeDefinitions() {
      return sqlite.prepare('SELECT * FROM badge_definitions ORDER BY rarity DESC, id').all();
    },

    // Check if user has a specific badge
    hasBadge(user, badgeId) {
      return repo.hasBadge(user, badgeId);
    },

    // Get all badges for user
    getUserBadges(user) {
      return repo.getUserBadges(user);
    },

    // Check badge eligibility (simple criteria)
    checkBadgeEligibility(user, badgeId) {
      const badge = repo.getAllBadgeDefinitions().find(b => b.id === badgeId);
      if (!badge) return { eligible: false, reason: 'badge_not_found' };

      // Simple eligibility checks
      switch (badgeId) {
        case 'first_login':
          return { eligible: true, reason: 'first_login' };
        case 'profile_complete':
          return { eligible: user.avatar_silhouette && user.avatar_silhouette !== '/assets/silhouette_male.jpg',
                   reason: 'profile_complete' };
        case 'event_attended':
          // Check if user has attended at least 1 event
          return { eligible: true, reason: 'event_attended' }; // Simplified
        case 'task_completed':
          // Check if user has completed at least 1 task
          const tasks = sqlite.prepare('SELECT COUNT(*) as count FROM tasks WHERE status = "done" AND user_id = ?').get(user.account_id);
          return { eligible: tasks.count > 0, reason: 'task_completed' };
        case 'kader_terlatih':
          // Check if user completed kaderization modules
          return { eligible: true, reason: 'kader_terlatih' }; // Simplified
        case 'hackathon_participant':
          return { eligible: true, reason: 'hackathon_participant' }; // Simplified
        case 'legend_kader':
          return { eligible: true, reason: 'legend_kader' }; // Simplified
        default:
          return { eligible: false, reason: 'unknown_badge' };
      }
    },

    // Award a badge to user
    awardBadge(user, badgeId, reason = 'system_award') {
      // Check if already has this badge
      if (repo.hasBadge(user, badgeId)) {
        return { success: false, message: 'Badge already awarded' };
      }

      // Insert badge record
      sqlite.prepare(
        'INSERT INTO user_badges (user_account_id, badge_id, awarded_at, reason)'
      ).run(user.account_id, badgeId, new Date().toISOString(), reason);

      // Optional: Check level up
      const points = 10; // Award points for badge
      const userLevel = repo.getUserLevel(user.accountId);
      const newLevel = repo.checkLevelUp(userLevel.points + points);

      if (newLevel !== userLevel) {
        // Level up occurred
        repo.updateUserLevel(user.accountId, newLevel, newLevel.points);
        return { success: true, message: 'Badge awarded and level up!', level: newLevel };
      }

      return { success: true, message: 'Badge awarded', badge: repo.getUserBadges(user) };
    },

    // Get user level and points
    getUserLevel(accountId) {
      const user = repo.findUserByAccountId(accountId);
      if (!user) return { level: 1, points: 0, name: 'Tidak ada' };
      return {
        level: user.membership_stage.split('Level ')[1] || 1,
        points: user.points || 0,
        name: user.role_title || 'Anggota'
      };
    },

    // Check if user can level up
    checkLevelUp(currentPoints) {
      // Level thresholds (example)
      const levels = [
        { points: 0, level: 1, name: 'Cadet Baru' },
        { points: 100, level: 2, name: 'Kader Muda' },
        { points: 500, level: 3, name: 'Kader Muda Tinggi' },
        { points: 1500, level: 4, name: 'Kader Ternama' },
        { points: 5000, level: 5, name: 'Kader Senior' }
      ];

      for (const level of levels) {
        if (currentPoints >= level.points) {
          return { level: level.level, name: level.name, threshold: level.points };
        }
      }
      return { level: 1, name: 'Cadet Baru', threshold: 0 };
    },

    // Update user level and points
    updateUserLevel(accountId, newLevel, newPoints) {
      // Update user level
      repo.findUserByAccountId(accountId).membership_stage = `Level ${newLevel}`;
      // Update points
      repo.findUserByAccountId(accountId).points = newPoints;
      write(db);
      return { success: true };
    },

    // Get user level and points
    getUserLevel(accountId) {
      const user = repo.findUserByAccountId(accountId);
      if (!user) return { level: 1, points: 0, name: 'Tidak ada' };
      return {
        level: user.membership_stage.split('Level ')[1] || 1,
        points: user.points || 0,
        name: user.role_title || 'Anggota'
      };
    }
  };

  return repo;
};