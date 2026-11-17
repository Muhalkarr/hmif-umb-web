/* ==========================================================================
   HMIF UNIVERSITAS MAYASARI BAKTI — PRTS REST API SERVER
   Bootstrap & Router Registrar
   Port: 3001
   ========================================================================== */

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

// ─── Context & Auth ──────────────────────────────────────────────────────────
import {
  buildRouteContext,
  createAuthContext,
  JWT_SECRET,
  isProduction,
  db,
  userRepository,
  siteRepository,
  governanceDocumentsRepository,
  academicRepository,
  socialRepository
} from './context/routeContext.js';

// ─── Route Registrars ─────────────────────────────────────────────────────────
import { registerHealthRoutes } from './routes/health.js';
import { registerSiteRoutes } from './routes/site.js';
import { registerSecurityNoticeRoutes } from './routes/securityNotice.js';
import { registerGovernanceDocumentsRoutes } from './routes/governanceDocuments.js';
import { registerAcademicRoutes } from './routes/academic.js';
import { registerSocialRoutes } from './routes/social.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerSsoRoutes } from './routes/sso.js';
import { registerWebPushRoutes } from './routes/webPush.js';
import { registerOperationsRoutes } from './routes/operations.js';
import { registerFinanceRoutes } from './routes/finance.js';
import { registerAttendanceRoutes } from './routes/attendance.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerSupportRoutes } from './routes/support.js';
import { registerLearningRoutes } from './routes/learning.js';
import { registerMeetingRoutes } from './routes/meetings.js';
import { registerVotingRoutes } from './routes/voting.js';
import { registerPositionAccessRoutes } from './routes/positionAccess.js';
import { registerStudentDemographicRoutes } from './routes/studentDemographics.js';

// ─── WebSocket Stats Service ──────────────────────────────────────────────────
import { createWsStatsService } from './services/wsStatsService.js';
import { createMeetingRecordingLifecycle } from './services/meetingRecordingLifecycle.js';
import { setWsStatsService } from './context/routeContext.js';

/* ==========================================================================
   STARTUP VALIDATION
   ========================================================================== */

if (!JWT_SECRET || Buffer.byteLength(JWT_SECRET, 'utf8') < 32) {
  throw new Error('JWT_SECRET wajib diisi dengan minimal 32 byte acak.');
}
if (isProduction && !process.env.FRONTEND_ORIGINS) {
  throw new Error('FRONTEND_ORIGINS wajib diatur di production.');
}
if (isProduction && !process.env.ASSET_STORAGE_DIR) {
  throw new Error('ASSET_STORAGE_DIR wajib diarahkan ke volume aset production terpisah.');
}
if (process.env.EVENT_TICKET_ENCRYPTION_KEY && Buffer.byteLength(process.env.EVENT_TICKET_ENCRYPTION_KEY, 'utf8') < 32) {
  throw new Error('EVENT_TICKET_ENCRYPTION_KEY harus memiliki minimal 32 byte.');
}
if (process.env.ASPIRATION_ENCRYPTION_KEY && Buffer.byteLength(process.env.ASPIRATION_ENCRYPTION_KEY, 'utf8') < 32) {
  throw new Error('ASPIRATION_ENCRYPTION_KEY harus memiliki minimal 32 byte.');
}

/* ==========================================================================
   EXPRESS APP SETUP
   ========================================================================== */

const app = express();
const PORT = Number(process.env.PORT || 3001);

const allowedOrigins = new Set(
  (process.env.FRONTEND_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)),
  credentials: true
}));

// ─── Body Parsers ─────────────────────────────────────────────────────────────
const standardJsonParser = express.json({ limit: '32kb' });
const siteConfigJsonParser = express.json({ limit: '64kb' });
const governanceDocumentJsonParser = express.json({ limit: '1mb' });
app.use((req, res, next) => {
  const isSiteConfigWrite = ['/api/site/validate', '/api/site/draft'].includes(req.path);
  const isGovernanceDocumentWrite = req.path.startsWith('/api/governance-documents/');
  (isGovernanceDocumentWrite ? governanceDocumentJsonParser : isSiteConfigWrite ? siteConfigJsonParser : standardJsonParser)(req, res, next);
});
app.use(cookieParser());

// ─── Origin Guard (write methods) ────────────────────────────────────────────
app.use((req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  if (!req.get('origin') || !allowedOrigins.has(req.get('origin'))) {
    return res.status(403).json({ error: 'Origin tidak diizinkan.' });
  }
  next();
});

/* ==========================================================================
   AUTH MIDDLEWARE — inisialisasi setelah validasi JWT_SECRET
   ========================================================================== */

const authMiddleware = createAuthContext();
const {
  authenticateToken,
  requireAuth,
  requireSuperadmin,
  requireAcademicCurator,
  requireAcademicModerator,
  requirePortfolioReviewer,
  requireClearance,
  isPortfolioReviewer
} = authMiddleware;

// Pasang global authenticateToken (mengisi req.user bila token valid)
app.use(authenticateToken);
app.use((req, _res, next) => {
  if (req.user) {
    req.user = {
      ...req.user,
      position_capabilities: db.getPositionCapabilitiesForAccount(req.user.account_id)
    };
  }
  next();
});

/* ==========================================================================
   ROUTE CONTEXT — assembles all shared deps for domain routers
   ========================================================================== */

const ctx = buildRouteContext(authMiddleware);

/* ==========================================================================
   ROUTE REGISTRATION
   ========================================================================== */

// Health check (no auth required)
registerHealthRoutes(app, { version: '4.2.0' });

// Site & Asset Management
registerSiteRoutes(app, { ...ctx, db: siteRepository });
registerSecurityNoticeRoutes(app, { ...ctx, db: siteRepository });
registerGovernanceDocumentsRoutes(app, { ...ctx, db: governanceDocumentsRepository, siteDb: siteRepository });

// Academic — Knowledge Base, Tutoring, Learning Paths
registerAcademicRoutes(app, { ...ctx, db: academicRepository });
registerSocialRoutes(app, { ...ctx, db: socialRepository });
registerSupportRoutes(app, ctx);
registerLearningRoutes(app, ctx);
registerMeetingRoutes(app, ctx);
registerVotingRoutes(app, ctx);
registerPositionAccessRoutes(app, ctx);
registerStudentDemographicRoutes(app, ctx);

// Auth — Login, Register, Profile, Notifications, Password
registerAuthRoutes(app, { ...ctx, db: userRepository });

// SSO — Google / GitHub OAuth
registerSsoRoutes(app, ctx);

// WebPush — Subscription Management
registerWebPushRoutes(app, ctx);

// Operations — Proker, Calendar/Event, Delegasi, Aspirasi, Showcase, Career, Tasks, Office Letters
registerOperationsRoutes(app, ctx);

// Finance — Ledger & Receipts
registerFinanceRoutes(app, ctx);

// Attendance — QR Presensi
registerAttendanceRoutes(app, ctx);

// Admin — Portal Records, Inventory, Users, Tech Articles, Project Calls, Backup, Stats
registerAdminRoutes(app, ctx);

/* ==========================================================================
   SERVER LISTEN
   ========================================================================== */

export const server = app.listen(PORT, () => {
  console.log(`[PRTS API SERVER] Running on port http://localhost:${PORT}`);
  console.log(`[PRTS SECURITY] RBAC Clearance System Online. Ready for telemetries.`);
  console.log(`[PRTS MODULES] Auth | SSO | Site | Academic | E-Voting | Operations | Finance | Attendance | Admin | WebPush | WsStats`);
});

// ─── WebSocket Stats (attach setelah listen agar httpServer siap) ─────────────
export const wsStatsService = createWsStatsService(server, db);
setWsStatsService(wsStatsService);
const meetingRecordingLifecycle = createMeetingRecordingLifecycle({
  db,
  conferencingService: ctx.meetingConferencingService
});
server.on('listening', () => meetingRecordingLifecycle.start());
server.on('close', () => {
  meetingRecordingLifecycle.stop();
  if (wsStatsService?.close) wsStatsService.close();
});
