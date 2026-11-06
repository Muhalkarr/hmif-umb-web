import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';

/**
 * SQLite & memory operations owned by User Management & Authentication.
 */
export const createUserSqlRepository = ({ sqlite, read, write, insertAudit }) => {
  const repo = {
    findUserByNIM(nim) {
      if (!nim) return null;
      const db = read();
      return db.users.find((u) => u.nim.toLowerCase() === String(nim).toLowerCase()) || null;
    },

    findUserById(accountId) {
      if (!accountId) return null;
      const db = read();
      return db.users.find((user) => user.account_id === accountId) || null;
    },

    findUserByEmail(email) {
      if (!email) return null;
      const data = read();
      const fromUsers = data.users.find(
        (u) => typeof u.email === 'string' && u.email.toLowerCase() === email.toLowerCase()
      );
      if (fromUsers) {
        const { password_hash, ...safe } = fromUsers;
        return safe;
      }
      const ssoRow = sqlite.prepare(
        "SELECT account_id FROM user_sso_identities WHERE provider = 'google' AND email = ? LIMIT 1"
      ).get(email);
      if (!ssoRow) return null;
      return repo.findUserById(ssoRow.account_id);
    },

    findUserBySsoId(provider, providerId) {
      if (!provider || !providerId) return null;
      const row = sqlite.prepare(
        'SELECT account_id FROM user_sso_identities WHERE provider = ? AND provider_id = ? LIMIT 1'
      ).get(provider, String(providerId));
      if (!row) return null;
      return repo.findUserById(row.account_id);
    },

    updateUserSsoInfo(provider, providerId, email, accountId) {
      const now = new Date().toISOString();
      sqlite.prepare(`
        INSERT INTO user_sso_identities (account_id, provider, provider_id, email, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider, provider_id) DO UPDATE SET
          email = excluded.email,
          account_id = excluded.account_id,
          updated_at = excluded.updated_at
      `).run(accountId, provider, String(providerId), email, now, now);
    },

    getUserSsoIdentities(accountId) {
      if (!accountId) return [];
      return sqlite.prepare(
        'SELECT provider, email, created_at, updated_at FROM user_sso_identities WHERE account_id = ?'
      ).all(accountId);
    },

    deleteUserSsoIdentity(accountId, provider = 'google') {
      if (!accountId || !provider) return false;
      const res = sqlite.prepare(
        'DELETE FROM user_sso_identities WHERE account_id = ? AND provider = ?'
      ).run(accountId, provider);
      return res.changes > 0;
    },

    async createUser(userData) {
      if (typeof userData.password !== 'string' || userData.password.length < 12) {
        return { error: 'Password minimal 12 karakter.' };
      }
      const db = read();
      const existing = db.users.find((u) => u.nim.toLowerCase() === String(userData.nim).toLowerCase());
      if (existing) return { error: 'NIM sudah terdaftar' };

      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(userData.password, salt);

      const newUser = {
        account_id: randomUUID(),
        nim: String(userData.nim),
        name: userData.name,
        email: userData.email || `${userData.nim}@mayasaribakti.ac.id`,
        password_hash: hash,
        session_version: 0,
        role: userData.role === 'superadmin' ? 'superadmin' : 'member',
        generation: userData.generation || '2026',
        membership_stage: userData.membership_stage || 'Calon Kader',
        division: userData.division || 'Kader Mahasiswa',
        clearance_level: userData.role === 'superadmin' ? 0 : Math.min(userData.clearance_level !== undefined ? userData.clearance_level : 1, 3),
        role_title: userData.role_title || 'Kader Pratama',
        code_name: userData.code_name || `CADET-${String(userData.nim).slice(-3)}`,
        avatar_silhouette: '/assets/silhouette_male.jpg',
        created_at: new Date().toISOString()
      };

      db.users.push(newUser);
      write(db);
      const { password_hash: _, ...sanitized } = newUser;
      return sanitized;
    },

    async changePassword(nim, newPassword) {
      const db = read();
      const idx = db.users.findIndex((u) => u.nim.toLowerCase() === String(nim).toLowerCase());
      if (idx === -1) return false;

      const salt = await bcrypt.genSalt(10);
      db.users[idx].password_hash = await bcrypt.hash(newPassword, salt);
      db.users[idx].session_version = (db.users[idx].session_version || 0) + 1;
      return write(db);
    },

    resetUserPasswordAdmin(nim, newPassword, actor = null) {
      const data = read();
      const user = data.users.find((u) => u.nim.toLowerCase() === String(nim).toLowerCase());
      if (!user) return null;
      const salt = bcrypt.genSaltSync(10);
      user.password_hash = bcrypt.hashSync(newPassword, salt);
      user.session_version = (user.session_version || 0) + 1;
      user.must_change_password = false;
      user.updated_at = new Date().toISOString();

      write(data, actor ? {
        actorNim: actor.nim,
        actorRole: actor.role,
        action: 'user.password_reset_admin',
        targetType: 'user',
        targetId: user.nim,
        details: { resetBy: actor.nim, reason: 'Technical support / emergency intervention' }
      } : null);

      const { password_hash, ...safe } = user;
      return safe;
    },

    invalidateSessions(nim) {
      const db = read();
      const user = db.users.find((entry) => entry.nim.toLowerCase() === String(nim).toLowerCase());
      if (!user) return false;
      user.session_version = (user.session_version || 0) + 1;
      return write(db);
    },

    updateUserProfile(accountId, updates, actor) {
      const data = read();
      const index = data.users.findIndex((user) => user.account_id === accountId);
      if (index === -1) return null;
      const user = data.users[index];
      const newNim = updates.nim === undefined ? user.nim : String(updates.nim).trim();
      if (!/^[a-zA-Z0-9._-]{3,32}$/.test(newNim)) return { error: 'Format NIM tidak valid.' };
      if (data.users.some((candidate) => candidate.account_id !== accountId && candidate.nim.toLowerCase() === newNim.toLowerCase())) {
        return { error: 'NIM sudah digunakan akun lain.' };
      }

      const previousNim = user.nim;
      const previousProfile = {
        name: user.name,
        nim: user.nim,
        generation: user.generation,
        avatar_silhouette: user.avatar_silhouette
      };
      const fields = ['name', 'generation', 'avatar_silhouette'];
      for (const field of fields) {
        if (updates[field] !== undefined) user[field] = updates[field];
      }
      user.nim = newNim;
      const changedFields = ['name', 'nim', 'generation', 'avatar_silhouette']
        .filter((field) => user[field] !== previousProfile[field]);
      if (changedFields.length === 0) {
        const { password_hash, ...safeUser } = user;
        return safeUser;
      }
      if (newNim !== previousNim) user.session_version = (user.session_version || 0) + 1;

      const updateLinkedSiteProfiles = () => {
        const updateConfig = (config) => {
          let modified = false;
          for (const generation of config?.content?.data?.generations || []) {
            for (const leader of Object.values(generation.leadership || {})) {
              if (leader.accountId !== accountId) continue;
              leader.name = user.name;
              leader.nim = user.nim;
              leader.avatar = user.avatar_silhouette || '';
              modified = true;
            }
            for (const division of generation.divisions || []) {
              if (division.coordinatorAccountId !== accountId) continue;
              division.coordinator = user.name;
              division.coordinatorNim = user.nim;
              division.coordinatorAvatar = user.avatar_silhouette || '';
              modified = true;
            }
          }
          return modified;
        };
        const state = sqlite.prepare('SELECT draft_json, published_json FROM site_state WHERE id = 1').get();
        if (state) {
          for (const slot of ['draft', 'published']) {
            const config = JSON.parse(state[`${slot}_json`]);
            if (updateConfig(config)) {
              sqlite.prepare(`UPDATE site_state SET ${slot}_json = ? WHERE id = 1`).run(JSON.stringify(config));
            }
          }
        }
        const revisions = sqlite.prepare('SELECT id, payload FROM site_revisions').all();
        for (const revision of revisions) {
          const config = JSON.parse(revision.payload);
          if (updateConfig(config)) sqlite.prepare('UPDATE site_revisions SET payload = ? WHERE id = ?').run(JSON.stringify(config), revision.id);
        }
      };

      write(data, {
        actorNim: actor?.nim || previousNim,
        actorRole: actor?.role || user.role,
        action: 'user.profile_update',
        targetType: 'user',
        targetId: user.account_id,
        details: { fields: changedFields, previousNim, newNim }
      }, updateLinkedSiteProfiles);
      const { password_hash, ...safeUser } = user;
      return safeUser;
    },

    getAllCadets() {
      const db = read();
      return db.users.map(({ password_hash, ...u }) => u);
    },

    updateCadetStage(nim, newStage) {
      const db = read();
      const idx = db.users.findIndex((u) => u.nim.toLowerCase() === String(nim).toLowerCase());
      if (idx === -1) return null;

      db.users[idx].membership_stage = newStage;
      write(db);
      const { password_hash, ...sanitized } = db.users[idx];
      return sanitized;
    },

    getAdminCount() {
      return read().users.filter((user) => user.role === 'superadmin').length;
    },

    updateUserAdmin(nim, updates, actor = null) {
      const db = read();
      const idx = db.users.findIndex((u) => u.nim.toLowerCase() === String(nim).toLowerCase());
      if (idx === -1) return null;

      const allowed = ['clearance_level', 'role_title', 'division', 'membership_stage', 'code_name'];
      allowed.forEach((key) => {
        if (updates[key] !== undefined && updates[key] !== null) {
          db.users[idx][key] = updates[key];
        }
      });

      write(db, actor ? {
        actorNim: actor.nim,
        actorRole: actor.role,
        action: 'user.update',
        targetType: 'user',
        targetId: db.users[idx].nim,
        details: { fields: Object.keys(updates).filter((key) => updates[key] !== undefined && updates[key] !== null) }
      } : null);
      const { password_hash, ...sanitized } = db.users[idx];
      return sanitized;
    },

    updateUserRole(nim, role, actor = null) {
      if (!['member', 'superadmin'].includes(role)) return null;
      const data = read();
      const user = data.users.find((entry) => entry.nim.toLowerCase() === String(nim).toLowerCase());
      if (!user) return null;
      user.role = role;
      user.clearance_level = role === 'superadmin' ? 0 : Math.min(user.clearance_level || 1, 3);
      if (role === 'superadmin') user.permissions = (user.permissions || []).filter((permission) => permission !== 'academic_curate');
      user.session_version = (user.session_version || 0) + 1;
      if (!write(data, actor ? {
        actorNim: actor.nim,
        actorRole: actor.role,
        action: 'user.role_change',
        targetType: 'user',
        targetId: user.nim,
        details: { role }
      } : null)) return null;
      const { password_hash, ...safeUser } = user;
      return safeUser;
    },

    setAcademicCuratorPermission(nim, enabled, actor) {
      const data = read();
      const user = data.users.find((entry) => entry.nim.toLowerCase() === String(nim).toLowerCase());
      if (!user || user.role === 'superadmin') return null;
      const permissions = new Set(Array.isArray(user.permissions) ? user.permissions : []);
      if (enabled) permissions.add('academic_curate');
      else permissions.delete('academic_curate');
      user.permissions = [...permissions];
      if (!write(data, {
        actorNim: actor.nim,
        actorRole: actor.role,
        action: enabled ? 'academic.curator_grant' : 'academic.curator_revoke',
        targetType: 'user',
        targetId: user.account_id,
        details: { permission: 'academic_curate', enabled }
      })) return null;
      const { password_hash, ...safeUser } = user;
      return safeUser;
    },

    deleteUser(nim) {
      const db = read();
      const idx = db.users.findIndex((u) => u.nim.toLowerCase() === String(nim).toLowerCase());
      if (idx === -1) return false;

      const accountId = db.users[idx].account_id;
      db.users.splice(idx, 1);
      if (!write(db)) return false;
      sqlite.prepare('DELETE FROM notifications WHERE recipient_account_id = ?').run(accountId);
      sqlite.prepare('DELETE FROM notification_preferences WHERE account_id = ?').run(accountId);
      return true;
    },

    // ─── Push Notification Subscriptions ───────────────────────────────────
    savePushSubscription(accountId, subscriptionJson) {
      const endpoint = JSON.parse(subscriptionJson).endpoint;
      const now = new Date().toISOString();
      sqlite.prepare(`
        INSERT INTO push_subscriptions (account_id, endpoint, subscription_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(endpoint) DO UPDATE SET
          account_id = excluded.account_id,
          subscription_json = excluded.subscription_json,
          updated_at = excluded.updated_at
      `).run(accountId, endpoint, subscriptionJson, now, now);
    },

    getPushSubscriptions(accountId) {
      return sqlite.prepare('SELECT subscription_json FROM push_subscriptions WHERE account_id = ?')
        .all(accountId)
        .map((row) => JSON.parse(row.subscription_json));
    },

    getAllPushSubscriptions() {
      return sqlite.prepare('SELECT account_id, subscription_json FROM push_subscriptions')
        .all()
        .map((row) => ({ account_id: row.account_id, subscription: JSON.parse(row.subscription_json) }));
    },

    deletePushSubscription(accountId, endpoint) {
      if (endpoint) {
        return sqlite.prepare('DELETE FROM push_subscriptions WHERE account_id = ? AND endpoint = ?')
          .run(accountId, endpoint).changes > 0;
      }
      return sqlite.prepare('DELETE FROM push_subscriptions WHERE account_id = ?')
        .run(accountId).changes > 0;
    }
  };

  return repo;
};
