/**
 * SSO Routes – Google OAuth 2.0 & Development Mock Architecture
 *
 * Flow:
 * 1. GET  /api/auth/sso/status           → Cek kapabilitas SSO (configured vs dev_mock)
 * 2. GET  /api/auth/sso/google           → Redirect ke Google OAuth consent screen (atau mock handler di dev)
 * 3. GET  /api/auth/sso/google/callback  → Google OAuth code exchange, auto-login, atau redirect link prompt
 * 4. POST /api/auth/sso/link             → Tautkan akun Google yang belum dikenal dengan NIM & Password
 * 5. GET  /api/auth/sso/linked           → Ambil daftar SSO tertaut milik pengguna yang sedang login
 * 6. POST /api/auth/sso/unlink           → Lepas tautan Google SSO untuk akun yang sedang login
 */

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

/**
 * @param {import('express').Application} app
 * @param {object} context
 */
export const registerSsoRoutes = (app, context) => {
  const {
    db, jwt, JWT_SECRET, setSessionCookie, authLimiter, requireAuth, bcrypt, isProduction
  } = context;

  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL
    || 'http://localhost:3001/api/auth/sso/google/callback';
  const FRONTEND_SUCCESS = process.env.FRONTEND_SSO_SUCCESS
    || 'http://localhost:5173/?sso_success=1#workspace/home';
  const FRONTEND_ERROR = process.env.FRONTEND_SSO_ERROR
    || 'http://localhost:5173/?sso_error=1';

  const isConfigured = Boolean(CLIENT_ID && CLIENT_SECRET);
  const isDevMock = !isConfigured && !isProduction;

  // ─── Status endpoint (apakah SSO aktif?) ────────────────────────────────
  // GET /api/auth/sso/status
  app.get('/api/auth/sso/status', (_req, res) => {
    res.json({
      google: isConfigured || isDevMock,
      configured: isConfigured,
      dev_mock: isDevMock,
      providers: ['google']
    });
  });

  // ─── State store (in-memory, cukup untuk dev/single node) ────────────────
  const pendingStates = new Map(); // state → expiry timestamp
  const STATE_TTL_MS = 5 * 60 * 1000; // 5 menit

  const generateState = () => {
    const state = [...Array(24)].map(() => Math.random().toString(36)[2]).join('');
    pendingStates.set(state, Date.now() + STATE_TTL_MS);
    return state;
  };

  const validateState = (state) => {
    const expiry = pendingStates.get(state);
    if (!expiry || expiry < Date.now()) return false;
    pendingStates.delete(state);
    return true;
  };

  setInterval(() => {
    const now = Date.now();
    for (const [state, expiry] of pendingStates) {
      if (expiry < now) pendingStates.delete(state);
    }
  }, 60_000);

  // ─── Step 1: Redirect ke Google (atau Mock selector di Development) ────
  // GET /api/auth/sso/google
  app.get('/api/auth/sso/google', authLimiter, (req, res) => {
    // Mode Simulasi Development (jika OAuth client belum dikonfigurasi)
    if (isDevMock) {
      const mockNim = req.query.mock_nim;
      const mockUnlinked = req.query.mock_unlinked;

      if (mockNim) {
        const user = db.findUserByNIM(mockNim);
        if (user) {
          db.updateUserSsoInfo?.('google', `mock-sub-${user.nim}`, user.email || `${user.nim}@mayasaribakti.ac.id`, user.account_id);
          const payload = { sub: user.account_id, ver: user.session_version || 0 };
          const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '2h' });
          setSessionCookie(res, token);
          return res.redirect(FRONTEND_SUCCESS);
        }
      }

      if (mockUnlinked === 'true') {
        const prefill = Buffer.from(JSON.stringify({
          email: 'mahasiswa.baru2026@mayasaribakti.ac.id',
          name: 'Calon Mahasiswa Informatika',
          picture: '/assets/silhouette_male.jpg',
          googleId: `mock-google-id-${Date.now()}`
        })).toString('base64url');
        return res.redirect(`${FRONTEND_ERROR}&reason=user_not_found&prefill=${prefill}`);
      }

      // Default dev: buka antarmuka pemilih mock akun di SPA
      return res.redirect('http://localhost:5173/?sso_select_mock=1');
    }

    // Jika di production dan belum dikonfigurasi
    if (!isConfigured) {
      return res.status(503).json({ error: 'Google SSO belum dikonfigurasi. Hubungi administrator.' });
    }

    const state = generateState();
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: CALLBACK_URL,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'online',
      state
    });
    res.redirect(`${GOOGLE_AUTH_URL}?${params}`);
  });

  // ─── Step 2: Callback dari Google ────────────────────────────────────────
  // GET /api/auth/sso/google/callback
  app.get('/api/auth/sso/google/callback', authLimiter, async (req, res) => {
    if (!isConfigured && !isDevMock) {
      return res.redirect(`${FRONTEND_ERROR}&reason=not_configured`);
    }

    const { code, state, error } = req.query;

    if (error) {
      console.warn('[SSO] Google OAuth error:', error);
      return res.redirect(`${FRONTEND_ERROR}&reason=${encodeURIComponent(error)}`);
    }

    if (!code || !state || !validateState(state)) {
      return res.redirect(`${FRONTEND_ERROR}&reason=invalid_state`);
    }

    try {
      // Exchange authorization code → tokens
      const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: CALLBACK_URL,
          grant_type: 'authorization_code'
        })
      });

      if (!tokenRes.ok) {
        const body = await tokenRes.text();
        console.error('[SSO] Token exchange failed:', body);
        return res.redirect(`${FRONTEND_ERROR}&reason=token_exchange_failed`);
      }

      const tokens = await tokenRes.json();

      // Ambil profil user dari Google
      const infoRes = await fetch(GOOGLE_USERINFO_URL, {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
      });

      if (!infoRes.ok) {
        return res.redirect(`${FRONTEND_ERROR}&reason=userinfo_failed`);
      }

      const googleUser = await infoRes.json();
      const { email, name, picture, sub: googleId } = googleUser;

      if (!email) {
        return res.redirect(`${FRONTEND_ERROR}&reason=no_email`);
      }

      // ─── Cari user di database (melalui email atau SSO ID) ──────────────
      let user = db.findUserByEmail?.(email);

      if (!user && db.findUserBySsoId) {
        user = db.findUserBySsoId('google', googleId);
      }

      if (!user) {
        // User belum terdaftar / belum ditautkan ke NIM
        const prefill = Buffer.from(JSON.stringify({ email, name, picture, googleId }))
          .toString('base64url');
        return res.redirect(`${FRONTEND_ERROR}&reason=user_not_found&prefill=${prefill}`);
      }

      // Update / simpan identitas SSO jika belum tersimpan
      db.updateUserSsoInfo?.('google', googleId, email, user.account_id);

      // Terbitkan session token
      const payload = { sub: user.account_id, ver: user.session_version || 0 };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '2h' });
      setSessionCookie(res, token);

      console.info(`[SSO] Login berhasil via Google: ${user.nim} (${email})`);
      return res.redirect(FRONTEND_SUCCESS);

    } catch (err) {
      console.error('[SSO] Unexpected error in callback:', err);
      return res.redirect(`${FRONTEND_ERROR}&reason=server_error`);
    }
  });

  // ─── Step 3: Tautkan Akun Google dengan Akun HMIF Mahasiswa ───────────────
  // POST /api/auth/sso/link
  app.post('/api/auth/sso/link', authLimiter, async (req, res) => {
    const { nim, password, email, googleId } = req.body || {};

    if (!nim || !password || !email || !googleId) {
      return res.status(400).json({ error: 'NIM, password, email, dan Google ID wajib disertakan.' });
    }

    const user = db.findUserByNIM(nim);
    if (!user) {
      return res.status(401).json({ error: 'NIM tidak terdaftar dalam database HMIF PRTS.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Password akun HMIF tidak sesuai.' });
    }

    // Tautkan identitas SSO ke user
    db.updateUserSsoInfo?.('google', String(googleId), String(email).trim().toLowerCase(), user.account_id);

    // Otomatis terbitkan sesi login
    const payload = { sub: user.account_id, ver: user.session_version || 0 };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '2h' });
    setSessionCookie(res, token);

    const { password_hash, ...safeUser } = user;
    console.info(`[SSO] Berhasil menautkan akun Google (${email}) ke NIM ${user.nim}`);

    res.json({
      message: `Akun Google (${email}) berhasil ditautkan ke ${user.name} (${user.nim}).`,
      user: safeUser
    });
  });

  // ─── Step 4: Status SSO Tertaut untuk User Login ──────────────────────────
  // GET /api/auth/sso/linked
  app.get('/api/auth/sso/linked', requireAuth, (req, res) => {
    const identities = db.getUserSsoIdentities?.(req.user.account_id) || [];
    res.json({
      ok: true,
      identities
    });
  });

  // ─── Step 5: Lepas Tautan SSO ─────────────────────────────────────────────
  // POST /api/auth/sso/unlink
  app.post('/api/auth/sso/unlink', requireAuth, (req, res) => {
    const provider = req.body?.provider || 'google';
    const deleted = db.deleteUserSsoIdentity?.(req.user.account_id, provider);
    res.json({
      ok: true,
      message: deleted ? 'Tautan SSO berhasil dilepas.' : 'Tidak ada tautan SSO aktif.'
    });
  });

  console.log(`[SSO] Google OAuth2 terdaftar (configured: ${isConfigured}, dev_mock: ${isDevMock})`);
};
