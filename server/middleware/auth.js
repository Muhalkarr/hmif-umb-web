export const createAuthMiddleware = ({ db, jwt, jwtSecret, cookieName, isProduction, setSessionCookie }) => {
  const clearSessionCookie = (res) => res.clearCookie(cookieName, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/'
  });

  const authenticateToken = (req, res, next) => {
    req.user = null;
    const token = req.cookies[cookieName];
    if (!token) return next();

    try {
      const decoded = jwt.verify(token, jwtSecret);
      const user = db.findUserById(decoded.sub) || db.findUserByNIM(decoded.sub);
      if (!user || (user.session_version || 0) !== (decoded.ver || 0)) {
        clearSessionCookie(res);
        return next();
      }
      if (decoded.sub !== user.account_id) {
        setSessionCookie(res, jwt.sign({ sub: user.account_id, ver: user.session_version || 0 }, jwtSecret, { expiresIn: '2h' }));
      }
      const { password_hash, ...safeUser } = user;
      req.user = safeUser;
    } catch {
      clearSessionCookie(res);
    }
    next();
  };

  const requireAuth = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Silakan masuk untuk melanjutkan.' });
    next();
  };

  const requireSuperadmin = (req, res, next) => {
    if (req.user?.role !== 'superadmin') {
      return res.status(req.user ? 403 : 401).json({ error: 'Akses superadmin diperlukan.' });
    }
    next();
  };

  const hasAcademicCuratorAccess = (user) => user?.role === 'superadmin'
    || (Array.isArray(user?.permissions) && user.permissions.includes('academic_curate'));

  const requireAcademicCurator = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Silakan masuk untuk melanjutkan.' });
    if (!hasAcademicCuratorAccess(req.user)) return res.status(403).json({ error: 'Izin kurator akademik diperlukan.' });
    next();
  };

  const requireAcademicModerator = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Silakan masuk untuk melanjutkan.' });
    if (!hasAcademicCuratorAccess(req.user) && req.user.clearance_level < 2) {
      return res.status(403).json({ error: 'Izin moderator akademik diperlukan.' });
    }
    next();
  };

  const isPortfolioReviewer = (user) => user?.role === 'superadmin'
    || user?.permissions?.includes('academic_curate')
    || user?.permissions?.includes('portfolio_review')
    || (user?.clearance_level >= 2 && /iptek|riset|research|litbang/i.test(`${user.division || ''} ${user.role_title || ''}`));

  const requirePortfolioReviewer = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Silakan masuk untuk melanjutkan.' });
    if (!isPortfolioReviewer(req.user)) {
      return res.status(403).json({ error: 'Peer review hanya tersedia untuk kurator atau pengurus IPTEK/Riset.' });
    }
    next();
  };

  const requireClearance = (minLevel) => (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Silakan masuk untuk melanjutkan.' });
    if (req.user.role === 'superadmin') return next();
    if (minLevel >= 4) return res.status(403).json({ error: 'Akses superadmin diperlukan.' });
    const userLevel = req.user.clearance_level;
    if (userLevel < minLevel) {
      return res.status(403).json({
        error: `ACCESS DENIED // PRTS SECURITY PROTOCOL: Diperlukan Clearance Level ${minLevel} atau lebih tinggi. Level Anda saat ini: Level ${userLevel}.`
      });
    }
    next();
  };

  return { authenticateToken, requireAuth, requireSuperadmin, requireAcademicCurator, requireAcademicModerator, requirePortfolioReviewer, requireClearance, isPortfolioReviewer };
};

