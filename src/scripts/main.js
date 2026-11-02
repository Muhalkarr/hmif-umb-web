/* ==========================================================================
   HMIF UNIVERSITAS MAYASARI BAKTI - PRTS MAIN APPLICATION ENGINE
   ========================================================================== */

import { HMIF_DATA } from './data.js';
import { FULL_CONSTITUTION_DATA } from './constitutionData.js';
import { prtsApi } from './api.js';
import { AdminConsole } from './adminConsole.js';
import { AcademicConsole } from './academicConsole.js';
import { SiteStudio } from './siteStudio.js';
import { initVotingEvents, renderPollList, renderPollDetail } from './eVoting.js';
import { prtsSound } from './soundEffects.js';
import { CanvasDustEngine } from './canvasDust.js';
import { getCohortPosts, resolveCohortOperator } from './dualRole.js';
import { filterKnowledgeResources, getKnowledgeLecturers } from './knowledge.js';
import { getWorkspaceConfiguration } from './workspace.js';
import { resolveBackgroundImage } from '../../shared/siteSchema.js';
import { renderConnectionStatus } from '../features/system/connectionStatus.js';
import { initSso, inspectSsoReturn } from '../features/sso.js';
import QRCode from 'qrcode';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[character]));

const getJakartaDateParts = (instant = new Date()) => Object.fromEntries(
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(instant)
    .filter(({ type }) => type !== 'literal')
    .map(({ type, value }) => [type, Number(value)])
);

const getJakartaCalendarDate = () => {
  const { year, month, day } = getJakartaDateParts();
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const getLocalDateTimeInputValue = (instant) => {
  const local = new Date(instant.getTime() - instant.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const getSoundtrackPreference = (key) => {
  try {
    return localStorage.getItem(`prts-soundtrack-${key}`);
  } catch (error) {
    console.warn('[PRTS SOUNDTRACK] Preferensi audio tidak dapat dibaca:', error);
    return null;
  }
};
const setSoundtrackPreference = (key, value) => {
  try {
    localStorage.setItem(`prts-soundtrack-${key}`, value);
  } catch (error) {
    console.warn('[PRTS SOUNDTRACK] Preferensi audio tidak dapat disimpan:', error);
  }
};

class PRTSApplication {
  constructor() {
    this.api = prtsApi;
    this.siteStudio = new SiteStudio(this.api, {
      openModal: () => { },
      closeModal: () => this.openWorkspace('home'),
      getContainer: () => document.getElementById('workspace-content'),
      applyConfig: (config, options) => this.applySiteConfig(config, options)
    });
    this.adminConsole = new AdminConsole(this.api, {
      openModal: () => { },
      closeModal: () => this.openWorkspace('home'),
      getContainer: () => document.getElementById('workspace-content'),
      refreshData: async () => {
        await this.syncApiData();
        await this.adminConsole.open();
      }
    });
    this.academicConsole = new AcademicConsole(this.api);
    initVotingEvents();
    this.currentTab = 'dashboard';
    const todayInJakarta = getJakartaDateParts();
    this.currentCalendarMonth = todayInJakarta.month;
    this.currentCalendarYear = todayInJakarta.year;
    this.currentCalFilter = 'all';
    this.currentQuizAnswers = {};
    this.currentOperatorFilter = 'all';
    this.selectedDepartmentId = '';
    this.selectedDivisionId = '';
    this.workspaceView = 'home';
    this.modalReturnFocus = null;
    this.modalPreviousOverflow = '';
    this.aspirasiLog = this.loadAspirasi();
    this.publicOpportunities = [];
    this.academicResources = [];
    this.academicLearningPaths = [];
    this.myPortalRecords = [];
    this.portalSubmissionFeedback = {};
    this.portalSubmissionError = '';
    this.attendanceStream = null;
    this.attendanceScanFrame = 0;
    this.certificateRoute = /^\/verify\/([a-f0-9-]{36})\/?$/i.exec(window.location.pathname)?.[1] || null;

    this.init();
    if (!this.certificateRoute) this.syncApiData();
  }

  init() {
    if (this.certificateRoute) {
      this.renderCertificateVerification(this.certificateRoute);
      return;
    }

    // 1. Initialize canvas dust background
    this.dustEngine = new CanvasDustEngine('canvas-dust');

    // 2. Real-time telemetry clock
    this.initClock();

    // 3. Setup Navigation & Audio
    this.setupAudioAndNavigation();

    // 4. Setup Backend Connectivity Monitoring
    this.api.setOnConnectionChange((online, errorMsg) => {
      this.updateSystemStatus(online, online ? 'SYSTEM: ONLINE' : 'SYSTEM: OFFLINE / DISCONNECTED');
    });

    setInterval(() => {
      this.api.checkHealth();
    }, 30000);

    // 5. Render initial modules
    this.renderHeroAndVisiMisi();
    this.renderOperatorFilters('all');
    this.renderOperators('all');
    this.renderCohortBattalions();
    this.renderProker('all');
    this.renderCalendar(this.currentCalendarMonth, this.currentCalendarYear);
    this.renderInventory();
    this.renderDoctrine();
    this.renderNews();
    this.renderKnowledgeResources();
    this.renderTutoringClinic();
    this.renderAspirasiHistory();
    this.renderRdpTransparencyBoard();

    // 6. Setup Event Listeners
    this.setupEventListeners();

    // 7. Check SSO Callback or Simulation Query
    const ssoReturn = inspectSsoReturn();
    if (ssoReturn) {
      if (ssoReturn.type === 'success') {
        this.syncApiData().then(() => {
          this.openWorkspace('home');
          prtsSound.playAccess();
        });
      } else if (ssoReturn.type === 'select_mock') {
        this.openDevMockSsoDialog();
      } else if (ssoReturn.type === 'error') {
        if (ssoReturn.reason === 'user_not_found' && ssoReturn.prefill) {
          this.openLinkAccountDialog(ssoReturn.prefill);
        } else {
          this.openLoginDialog(ssoReturn.message);
        }
      }
    }

    console.log('[PRTS ENGINE] System initialized. Verifying server session.');
  }

  updateSystemStatus(online = true, message = null) {
    renderConnectionStatus(online, message);
  }

  async syncApiData() {
    const authResult = await this.api.refreshProfile();
    if (!authResult.ok && authResult.status === 0) {
      this.updateSystemStatus(false, 'SYSTEM: OFFLINE / DISCONNECTED');
    } else {
      this.updateSystemStatus(true, 'SYSTEM: ONLINE');
    }
    this.renderAuthState();
    this.renderTutoringClinic();
    this.renderInventory();

    const [siteResult, prokerResult, calendarResult, academicResourcesResult, learningPathsResult] = await Promise.all([
      this.api.getSiteConfig(),
      this.api.getProkerList(),
      this.api.getCalendarEvents(),
      this.api.getPublicAcademicResources(),
      this.api.getPublicAcademicLearningPaths()
    ]);

    if (siteResult.ok) this.applySiteConfig(siteResult.data.config, { preview: false });
    this.academicResources = academicResourcesResult.ok ? academicResourcesResult.data.resources || [] : [];
    this.academicLearningPaths = learningPathsResult.ok ? learningPathsResult.data.learning_paths || [] : [];
    this.renderKnowledgeResources();

    if (prokerResult.ok && Array.isArray(prokerResult.data)) {
      HMIF_DATA.proker = prokerResult.data.map((item) => ({
        ...item,
        desc: item.lpj_notes || '',
        date: item.date_end && item.date_end !== item.date_start
          ? `${item.date_start} - ${item.date_end}`
          : item.date_start || '',
        target: item.target_participants || '',
        kpi: item.kpi_indicator || ''
      }));
      this.renderProker();
    }

    if (calendarResult.ok && Array.isArray(calendarResult.data)) {
      HMIF_DATA.calendarSchedule = calendarResult.data.map((item) => ({
        ...item,
        date: item.date_str,
        integratedWith: item.integrated_with || ''
      }));
      this.renderCalendar(this.currentCalendarMonth, this.currentCalendarYear);
      this.renderDashboardOverview();
    }

    await this.syncPortalRecords();

    if (this.api.isSuperadmin || this.api.clearanceLevel >= 3) {
      const aspirationsResult = await this.api.getAspirations();
      if (aspirationsResult.ok && Array.isArray(aspirationsResult.data)) {
        this.aspirasiLog = aspirationsResult.data.map((item) => ({
          sender: item.sender_nim_or_anon,
          category: item.category,
          message: item.message,
          date: new Date(item.created_at).toLocaleDateString('id-ID')
        }));
        this.renderAspirasiHistory();
      }
    }

    if (this.api.isAuthenticated && window.location.hash.startsWith('#workspace/')) {
      await this.openWorkspace(window.location.hash.slice('#workspace/'.length), { fromHistory: true });
    } else if (!this.api.isAuthenticated && window.location.hash.startsWith('#workspace/')) {
      this.switchTab('dashboard', { replace: true, focus: false, scroll: false });
    }
  }

  async openSiteStudio() {
    return this.openWorkspace('studio');
  }

  async applySiteConfig(config, { preview = false } = {}) {
    if (!config) return;
    const siteData = config.content?.data || {};
    HMIF_DATA.identity = { ...HMIF_DATA.identity, ...(siteData.identity || {}), logo: siteData.identity?.logo ?? HMIF_DATA.identity.logo ?? '/assets/hmif_umb_logo.png' };
    HMIF_DATA.visionMission = siteData.visionMission || HMIF_DATA.visionMission;
    HMIF_DATA.departments = Array.isArray(siteData.departments) ? siteData.departments : (HMIF_DATA.departments || []);
    HMIF_DATA.knowledgeResources = Array.isArray(siteData.knowledgeResources) ? siteData.knowledgeResources : (HMIF_DATA.knowledgeResources || []);
    HMIF_DATA.generations = Array.isArray(siteData.generations) ? siteData.generations : (HMIF_DATA.generations || []);
    HMIF_DATA.operators = Array.isArray(siteData.operators) ? siteData.operators : HMIF_DATA.operators;
    HMIF_DATA.news = Array.isArray(siteData.news) ? siteData.news : HMIF_DATA.news;
    HMIF_DATA.doctrine = siteData.doctrine || HMIF_DATA.doctrine;
    const siteContent = {
      heroActions: ['JELAJAHI PROGRAM KERJA', 'KALENDER PENDIDIKAN', 'PEDOMAN KADERISASI'],
      statLabels: { activeCadets: 'Kader Aktif', divisionsCount: 'Divisi Operasional', prokerCount: 'Misi Program Kerja', complianceRate: 'Kepatuhan AD/ART' },
      sectionTitles: {},
      sectionDescriptions: {},
      ...(config.content || {})
    };
    const brandTitle = document.querySelector('.prts-brand-title');
    if (brandTitle) brandTitle.textContent = HMIF_DATA.identity.abbreviation;
    const brandLogo = document.querySelector('.prts-brand-logo');
    if (brandLogo) {
      brandLogo.alt = HMIF_DATA.identity.name;
      brandLogo.hidden = !HMIF_DATA.identity.logo;
      if (HMIF_DATA.identity.logo) brandLogo.src = HMIF_DATA.identity.logo;
    }
    const terminalEmblem = document.querySelector('.terminal-emblem');
    if (terminalEmblem) {
      terminalEmblem.alt = HMIF_DATA.identity.name;
      terminalEmblem.hidden = !HMIF_DATA.identity.logo;
      if (HMIF_DATA.identity.logo) terminalEmblem.src = HMIF_DATA.identity.logo;
    }
    document.title = `${HMIF_DATA.identity.name} // PRTS Tactical Terminal`;
    const description = document.querySelector('meta[name="description"]');
    if (description) description.content = `${HMIF_DATA.identity.name} ${HMIF_DATA.identity.university}. ${HMIF_DATA.identity.tagline}`;
    const setText = (selector, value) => {
      const element = document.querySelector(selector);
      if (element) element.textContent = String(value ?? '');
    };
    setText('#terminal-id-label', `ORGANIZATION PROFILE // ${HMIF_DATA.identity.abbreviation}`);
    setText('#terminal-organization', `${HMIF_DATA.identity.abbreviation} // ${HMIF_DATA.identity.faculty}`);
    setText('#terminal-cabinet', HMIF_DATA.visionMission.sambutanKahim.period);
    setText('#terminal-leader', HMIF_DATA.visionMission.sambutanKahim.leaderName);
    setText('#terminal-tagline', HMIF_DATA.identity.tagline);
    setText('#sambutan-quote-text', `"${HMIF_DATA.visionMission.sambutanKahim.quote}"`);
    setText('.sambutan-author span', `— ${HMIF_DATA.visionMission.sambutanKahim.role} (${HMIF_DATA.visionMission.sambutanKahim.operatorCode})`);
    setText('#hero-stat-active', HMIF_DATA.identity.activeCadets);
    setText('#hero-stat-divisions', HMIF_DATA.identity.divisionsCount);
    setText('#hero-stat-proker', HMIF_DATA.identity.prokerCount);
    setText('#hero-stat-compliance', HMIF_DATA.identity.complianceRate);
    setText('#hero-stat-label-active', siteContent.statLabels.activeCadets);
    setText('#hero-stat-label-divisions', siteContent.statLabels.divisionsCount);
    setText('#hero-stat-label-proker', siteContent.statLabels.prokerCount);
    setText('#hero-stat-label-compliance', siteContent.statLabels.complianceRate);
    ['proker', 'calendar', 'doctrine'].forEach((id, index) => setText(`#hero-action-${id}`, siteContent.heroActions[index]));
    setText('#section-vision .section-desc', siteContent.sectionDescriptions.vision);
    setText('#section-knowledge .section-desc', siteContent.sectionDescriptions.knowledge);
    setText('#section-showcase .section-desc', siteContent.sectionDescriptions.showcase);
    setText('#section-career .section-desc', siteContent.sectionDescriptions.career);
    setText('#section-squad .section-desc', siteContent.sectionDescriptions.squad);
    setText('#section-proker .section-desc', siteContent.sectionDescriptions.proker);
    setText('#section-calendar .section-desc', siteContent.sectionDescriptions.calendar);
    setText('#section-doctrine .section-desc', siteContent.sectionDescriptions.doctrine);
    setText('#section-intel .section-desc', siteContent.sectionDescriptions.intel);
    setText('#section-commlink .section-desc', siteContent.sectionDescriptions.commlink);
    const heroTitle = document.querySelector('.hero-title');
    if (heroTitle) {
      const firstLine = document.createTextNode('HIMPUNAN MAHASISWA');
      const lineBreakOne = document.createElement('br');
      const programName = document.createElement('span');
      programName.className = 'glow-cyan';
      programName.textContent = HMIF_DATA.identity.name.replace(/^Himpunan Mahasiswa\s*/i, '');
      const lineBreakTwo = document.createElement('br');
      const universityName = document.createElement('span');
      universityName.className = 'glow-gold';
      universityName.textContent = HMIF_DATA.identity.university;
      heroTitle.replaceChildren(firstLine, lineBreakOne, programName, lineBreakTwo, universityName);
    }
    const root = document.documentElement;
    const colors = config.theme.colors;
    const variables = {
      '--ak-bg-abyss': colors.background,
      '--ak-bg-panel': colors.panel,
      '--ak-cyan': colors.accent,
      '--ak-cyan-border': colors.accent,
      '--ak-border-active': colors.accent,
      '--ak-cyan-deep': `color-mix(in srgb, ${colors.accent} 65%, black)`,
      '--ak-cyan-glow': `color-mix(in srgb, ${colors.accent} 45%, transparent)`,
      '--ak-cyan-subtle': `color-mix(in srgb, ${colors.accent} 12%, transparent)`,
      '--ak-gold': colors.accentAlt,
      '--ak-gold-amber': `color-mix(in srgb, ${colors.accentAlt} 70%, black)`,
      '--ak-gold-glow': `color-mix(in srgb, ${colors.accentAlt} 40%, transparent)`,
      '--ak-gold-subtle': `color-mix(in srgb, ${colors.accentAlt} 12%, transparent)`,
      '--ak-red': colors.danger,
      '--ak-red-glow': `color-mix(in srgb, ${colors.danger} 40%, transparent)`,
      '--ak-red-subtle': `color-mix(in srgb, ${colors.danger} 15%, transparent)`,
      '--ak-green': colors.success,
      '--ak-green-glow': `color-mix(in srgb, ${colors.success} 35%, transparent)`,
      '--ak-purple': colors.info,
      '--ak-purple-subtle': `color-mix(in srgb, ${colors.info} 15%, transparent)`,
      '--ak-bg-dark': `color-mix(in srgb, ${colors.panel} 72%, ${colors.background})`,
      '--ak-bg-card': `color-mix(in srgb, ${colors.panel} 84%, ${colors.background})`,
      '--ak-bg-elevated': `color-mix(in srgb, ${colors.panel} 92%, ${colors.background})`,
      '--ak-bg-glass': `color-mix(in srgb, ${colors.panel} 85%, transparent)`,
      '--ak-text-primary': colors.text,
      '--ak-text-secondary': config.theme.contrast === 'high' ? '#f4f6f8' : colors.textMuted,
      '--ak-text-dim': config.theme.contrast === 'high' ? '#dce2e8' : `color-mix(in srgb, ${colors.textMuted} 65%, ${colors.background})`,
      '--ak-border': config.theme.contrast === 'high' ? '#8c9bab' : colors.border,
      '--ak-border-bright': config.theme.contrast === 'high' ? '#d3dce5' : `color-mix(in srgb, ${colors.border} 65%, ${colors.textMuted})`,
      '--site-type-scale': `${config.theme.typeScale}px`,
      '--grid-pattern': `linear-gradient(to right, color-mix(in srgb, ${colors.accent} 5%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, ${colors.accent} 5%, transparent) 1px, transparent 1px)`,
      '--hazard-stripes': `repeating-linear-gradient(-45deg, ${colors.accentAlt}, ${colors.accentAlt} 10px, ${colors.panel} 10px, ${colors.panel} 20px)`,
      '--hazard-subtle': `repeating-linear-gradient(-45deg, color-mix(in srgb, ${colors.accentAlt} 18%, transparent), color-mix(in srgb, ${colors.accentAlt} 18%, transparent) 8px, transparent 8px, transparent 16px)`
    };
    for (const [name, value] of Object.entries(variables)) root.style.setProperty(name, value);

    const fontFamily = async (font) => {
      if (!font.startsWith('asset:')) return font;
      const assetId = font.slice(6);
      const family = `HMIFAsset-${assetId}`;
      if (!document.fonts.check(`16px "${family}"`)) {
        const face = new FontFace(family, `url("/api/site/assets/${assetId}/file")`);
        await face.load();
        document.fonts.add(face);
      }
      return family;
    };
    const [bodyFont, headingFont, monoFont] = await Promise.all([
      fontFamily(config.theme.fonts.body),
      fontFamily(config.theme.fonts.heading),
      fontFamily(config.theme.fonts.mono)
    ]);
    root.style.setProperty('--font-body', `"${bodyFont}", sans-serif`);
    root.style.setProperty('--font-title', `"${headingFont}", sans-serif`);
    root.style.setProperty('--font-mono', `"${monoFont}", monospace`);
    const appContent = document.querySelector('.app-content');
    if (appContent) appContent.dataset.shape = config.theme.shape;
    root.dataset.iconStyle = config.theme.iconStyle;
    root.dataset.contrast = config.theme.contrast;
    root.dataset.motion = config.theme.motion ? 'on' : 'off';

    const background = document.querySelector('.global-bg-wrapper');
    if (background) {
      const photoUrl = resolveBackgroundImage(config.theme.background);
      const veil = `linear-gradient(color-mix(in srgb, ${colors.background} 88%, transparent), color-mix(in srgb, ${colors.background} 96%, transparent))`;
      const radial = `radial-gradient(circle at 50% 0%, color-mix(in srgb, ${colors.accent} 8%, transparent) 0%, transparent 60%)`;
      background.style.backgroundColor = colors.background;
      background.style.backgroundRepeat = 'no-repeat';
      background.style.backgroundPosition = 'center';
      background.style.backgroundAttachment = 'fixed';
      if (config.theme.background.mode === 'solid' || !photoUrl) {
        background.style.backgroundImage = config.theme.background.mode === 'grid' ? `${radial}, var(--grid-pattern)` : radial;
        background.style.backgroundSize = config.theme.background.mode === 'grid' ? '100% 100%, 40px 40px' : '100% 100%';
      } else {
        background.style.backgroundImage = `${radial}, ${veil}, url("${photoUrl}")`;
        background.style.backgroundSize = '100% 100%, 100% 100%, cover';
      }
    }
    const heroOverlay = document.querySelector('.hero-bg-overlay');
    if (heroOverlay) {
      heroOverlay.style.backgroundImage = config.theme.heroImage ? `url("${config.theme.heroImage}")` : 'none';
    }

    const main = document.querySelector('.main-content');
    const sections = new Map(config.pages.map((block) => [block.id, block]));
    const orderedSections = config.pages
      .map((block) => document.getElementById(`section-${block.id}`))
      .filter(Boolean);
    if (main && orderedSections.length) {
      const anchor = orderedSections[0];
      orderedSections.forEach((section) => main.append(section));
      for (const section of orderedSections) {
        const block = sections.get(section.id.slice('section-'.length));
        section.dataset.siteVisible = String(block.visible);
        section.hidden = !block.visible;
        section.inert = !block.visible;
        section.dataset.layout = block.layout;
      }
      if (anchor.parentElement !== main) main.append(anchor);
    }

    const nav = document.querySelector('.prts-nav');
    if (nav) {
      for (const block of config.pages) {
        const navButton = nav.querySelector(`.nav-link[data-tab="${block.id}"]`);
        if (navButton) nav.append(navButton);
      }
      const squadNav = nav.querySelector('.nav-link[data-tab="squad"]');
      const cohortNav = nav.querySelector('.nav-link[data-tab="cohort"]');
      if (squadNav && cohortNav) squadNav.after(cohortNav);
    }

    for (const block of config.pages) {
      const section = document.getElementById(`section-${block.id}`);
      if (section && block.id !== 'dashboard' && block.id !== 'vision') {
        const heading = section.querySelector('.section-title');
        if (heading && typeof siteContent.sectionTitles[block.id] === 'string') heading.textContent = siteContent.sectionTitles[block.id];
      }
      const nav = document.querySelector(`.nav-link[data-tab="${block.id}"]`);
      if (nav) nav.hidden = !block.visible;
      document.querySelectorAll(`[data-directory-tab="${block.id}"]`).forEach((link) => { link.hidden = !block.visible; });
    }
    const visionHeading = document.querySelector('#section-vision .section-title');
    if (visionHeading && typeof siteContent.sectionTitles.vision === 'string') visionHeading.textContent = siteContent.sectionTitles.vision;
    const eyebrow = document.querySelector('.hero-intel-tag');
    if (eyebrow && typeof siteContent.heroEyebrow === 'string') eyebrow.textContent = siteContent.heroEyebrow;
    const heroLead = document.querySelector('.hero-lead');
    if (heroLead && typeof siteContent.heroLead === 'string') heroLead.textContent = siteContent.heroLead;

    this.renderHeroAndVisiMisi();
    this.renderOperatorFilters(this.currentOperatorFilter || 'all');
    this.renderOperators(this.currentOperatorFilter || 'all');
    this.renderSidebarDepartments();
    this.renderCohortBattalions();
    this.renderDoctrine();
    this.renderNews();
    this.renderKnowledgeResources();
    if (!window.location.hash.startsWith('#workspace/')) {
      const route = this.readRouteFromHash();
      this.switchTab(route.tabId, { departmentId: route.departmentId, divisionId: route.divisionId, replace: true, focus: false, scroll: false });
    }

    let previewBanner = document.getElementById('site-preview-banner');
    if (preview && !previewBanner) {
      previewBanner = document.createElement('div');
      previewBanner.id = 'site-preview-banner';
      previewBanner.className = 'site-preview-banner';
      previewBanner.setAttribute('role', 'status');
      previewBanner.textContent = 'PRATINJAU DRAFT // HANYA TERLIHAT DI SESI SUPERADMIN';
      document.querySelector('.app-content')?.prepend(previewBanner);
    } else if (!preview && previewBanner) {
      previewBanner.remove();
    }
  }

  renderAuthState() {
    const button = document.getElementById('auth-action-btn');
    if (!button) return;

    const user = this.api.currentUser;
    button.textContent = user ? 'DASHBOARD ANGGOTA' : 'AKSES KHUSUS';
    button.title = user
      ? `${user.name} // ${this.api.isSuperadmin ? 'SUPERADMIN' : `CLEARANCE ${user.clearance_level}`}`
      : 'Masuk dengan akun terdaftar';
    button.setAttribute('aria-label', button.title);
    const logoutButton = document.getElementById('logout-action-btn');
    if (logoutButton) logoutButton.hidden = !user;
    // Impersonation Banner Indicator
    let impBanner = document.getElementById('prts-impersonation-banner');
    if (user && user.is_impersonated) {
      if (!impBanner) {
        impBanner = document.createElement('div');
        impBanner.id = 'prts-impersonation-banner';
        impBanner.style.cssText = 'position:fixed; top:0; left:0; right:0; z-index:999999; background:linear-gradient(90deg, #ff8f00, #ff6f00); color:#000; font-weight:bold; font-size:0.85rem; padding:0.4rem 1rem; display:flex; justify-content:space-between; align-items:center; box-shadow:0 2px 10px rgba(0,0,0,0.5); font-family:monospace;';
        document.body.prepend(impBanner);
      }
      impBanner.innerHTML = `
        <span>⚠️ MODE DAMPINGI PENGGUNA (IMPERSONATION) // Anda melihat website sebagai: <strong>${escapeHtml(user.name)} (${escapeHtml(user.nim)})</strong> [Didampingi Admin: ${escapeHtml(user.impersonated_by)}]</span>
        <button id="btn-stop-impersonate" style="background:#000; color:#fff; border:1px solid #ffcc80; padding:0.25rem 0.75rem; font-size:0.75rem; cursor:pointer; font-weight:bold; border-radius:2px;">
          KEMBALI KE SUPERADMIN ➔
        </button>
      `;
      const stopBtn = impBanner.querySelector('#btn-stop-impersonate');
      if (stopBtn) {
        stopBtn.addEventListener('click', async () => {
          stopBtn.disabled = true;
          stopBtn.textContent = 'Memulihkan sesi...';
          const res = await this.api.stopImpersonating();
          if (res.ok) {
            alert('Sesi pendampingan selesai. Kembali ke akses Superadmin.');
            window.location.reload();
          } else {
            alert(res.error || 'Gagal mengakhiri sesi impersonasi.');
            stopBtn.disabled = false;
          }
        });
      }
    } else if (impBanner) {
      impBanner.remove();
    }

    const clearanceRibbon = document.getElementById('clearance-ribbon');
    if (clearanceRibbon) {
      clearanceRibbon.textContent = user
        ? this.api.isSuperadmin ? `SECURITY: SUPERADMIN // ${user.role_title}` : `SECURITY: CLEARANCE LEVEL ${user.clearance_level} // ${user.role_title}`
        : 'SECURITY: PUBLIC ACCESS';
    }
  }

  openWorkspace(view = 'home', { fromHistory = false } = {}) {
    this.stopAttendanceScanner();
    if (!this.api.isAuthenticated) {
      this.openLoginDialog();
      return;
    }

    const workspace = document.getElementById('member-workspace');
    const portal = document.querySelector('.app-content');
    const content = document.getElementById('workspace-content');
    const navigation = document.getElementById('workspace-navigation');
    const profile = document.getElementById('workspace-profile-summary');
    const title = document.getElementById('workspace-page-title');
    if (!workspace || !portal || !content || !navigation || !profile || !title) return;

    const user = this.api.currentUser;
    const isSuperadmin = this.api.isSuperadmin;
    const access = getWorkspaceConfiguration({
      isSuperadmin,
      clearanceLevel: this.api.clearanceLevel,
      permissions: user.permissions || []
    });
    const { clearance, roleName, dashboardName, pages } = access;
    const canOperate = pages.some(({ id }) => id === 'operations');
    const allowedView = pages.some((page) => page.id === view) ? view : 'home';
    const workspaceAudience = isSuperadmin
      ? 'RUANG ADMINISTRATOR'
      : clearance >= 2 ? 'RUANG PENGURUS' : 'RUANG ANGGOTA';
    const pageTitles = {
      home: 'Beranda',
      notifications: 'Notifikasi',
      profile: 'Profil & keamanan',
      operations: 'Operasional organisasi',
      academic: 'Pusat Akademik',
      studio: 'Site Studio'
    };
    this.workspaceView = allowedView;
    portal.hidden = true;
    workspace.hidden = false;
    workspace.dataset.clearance = isSuperadmin ? 'superadmin' : String(clearance);
    workspace.setAttribute('aria-label', `Dashboard ${dashboardName} HMIF`);
    navigation.setAttribute('aria-label', `Navigasi dashboard ${dashboardName.toLowerCase()}`);
    workspace.querySelectorAll('[data-workspace-audience]').forEach((label) => {
      label.textContent = workspaceAudience;
    });
    profile.innerHTML = `
      <img src="${escapeHtml(user.avatar_silhouette || '/assets/silhouette_male.jpg')}" alt="" />
      <strong>${escapeHtml(user.name)}</strong>
      <span>${escapeHtml(user.role_title || dashboardName)}</span>
      <small>${escapeHtml(roleName)} // ${escapeHtml(user.division || 'HMIF UMB')}</small>
    `;
    navigation.innerHTML = pages.map((page) => `
      <button type="button" class="workspace-nav-link ${page.id === allowedView ? 'active' : ''}" data-workspace-view="${page.id}" ${page.id === allowedView ? 'aria-current="page"' : ''}>
        <span>${escapeHtml(page.label)}</span><span aria-hidden="true">›</span>
      </button>
    `).join('');
    title.textContent = pageTitles[allowedView];
    navigation.querySelectorAll('[data-workspace-view]').forEach((button) => {
      button.addEventListener('click', () => this.openWorkspace(button.dataset.workspaceView));
    });
    workspace.querySelectorAll('[data-workspace-public]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        this.closeWorkspace();
      });
    });
    workspace.querySelector('[data-workspace-profile]')?.addEventListener('click', () => this.openWorkspace('profile'));

    if (!fromHistory && window.location.hash !== `#workspace/${allowedView}`) {
      window.history.pushState({ workspaceView: allowedView }, '', `#workspace/${allowedView}`);
    }

    if (allowedView === 'home') {
      if (isSuperadmin) {
        content.innerHTML = `
        <section class="workspace-dashboard-hero" aria-labelledby="workspace-welcome-title">
          <div class="workspace-dashboard-hero-copy">
            <span class="section-tag cyan">HMIF UMB // PUSAT KENDALI</span>
            <h2 id="workspace-welcome-title">Selamat datang, ${escapeHtml(user.name)}.</h2>
            <p>Ikhtisar pengelolaan portal, aktivitas organisasi, dan layanan digital HMIF.</p>
            <div class="workspace-dashboard-actions">
              <button type="button" class="btn-tactical primary" data-workspace-view="studio">BUKA SITE STUDIO</button>
              <button type="button" class="btn-tactical" data-workspace-view="operations">LIHAT OPERASIONAL</button>
            </div>
          </div>
          <div class="workspace-dashboard-health" data-dashboard-health role="status">MEMUAT DATA PORTAL...</div>
        </section>
        <section class="workspace-dashboard-metrics" aria-label="Ringkasan portal" data-dashboard-metrics>
          <p role="status">Memuat ringkasan portal...</p>
        </section>
        <section class="workspace-dashboard-panel workspace-system-statistics" aria-labelledby="workspace-system-stats-title">
          <div class="workspace-panel-heading">
            <div><span class="section-tag cyan">DATA ADMINISTRATIF</span><h2 id="workspace-system-stats-title">Statistik organisasi</h2></div>
            <span class="workspace-panel-note">API // ADMIN</span>
          </div>
          <div class="workspace-system-stats-grid" data-dashboard-system-stats role="status">Memuat statistik organisasi...</div>
        </section>
        <div class="workspace-dashboard-grid">
          <section class="workspace-dashboard-panel" aria-labelledby="workspace-activity-title">
            <div class="workspace-panel-heading">
              <div><span class="section-tag cyan">TELEMETRI</span><h2 id="workspace-activity-title">Aktivitas terbaru</h2></div>
              <span class="workspace-panel-note">AUDIT</span>
            </div>
            <ol class="workspace-activity-list" data-dashboard-activity><li role="status">Memuat audit terbaru...</li></ol>
          </section>
          <section class="workspace-dashboard-panel" aria-labelledby="workspace-agenda-title">
            <div class="workspace-panel-heading">
              <div><span class="section-tag gold">KALENDER & TENGGAT</span><h2 id="workspace-agenda-title">Agenda dan tenggat</h2></div>
              <span class="workspace-panel-note">14 HARI</span>
            </div>
            <ol class="workspace-agenda-list" data-dashboard-agenda><li role="status">Memuat agenda...</li></ol>
            <button type="button" class="workspace-text-action" data-workspace-view="operations">BUKA PENGELOLAAN AGENDA <span aria-hidden="true">→</span></button>
          </section>
        </div>
        <section class="workspace-section workspace-service-section" aria-labelledby="workspace-services-title">
          <div class="workspace-panel-heading">
            <div><span class="section-tag cyan">MODUL ADMINISTRATOR</span><h2 id="workspace-services-title">Layanan dalam kendali Anda</h2></div>
            <span class="workspace-panel-note">MODUL</span>
          </div>
          <div class="workspace-service-grid">
            ${[
            { title: 'Site Studio', description: 'Tema, halaman, media, playlist, dan konten portal.', status: 'PENGELOLAAN SITUS', destination: 'studio', tone: 'cyan' },
            { title: 'Operasional organisasi', description: 'Program kerja, tugas, agenda, dan layanan anggota.', status: 'OPERASIONAL', destination: 'operations', tone: 'green' },
            { title: 'Showcase & karier', description: 'Tinjau karya, profil alumni, serta kesempatan kerja.', status: 'KURASI KONTEN', destination: 'studio', tone: 'gold' }
          ].map((service) => `
              <button type="button" class="workspace-service-item workspace-tone-${escapeHtml(service.tone)}" data-workspace-view="${escapeHtml(service.destination)}">
                <span class="workspace-service-status">${escapeHtml(service.status)}</span>
                <strong>${escapeHtml(service.title)}</strong>
                <span>${escapeHtml(service.description)}</span>
                <span class="workspace-service-link">BUKA MODUL <span aria-hidden="true">↗</span></span>
              </button>
            `).join('')}
          </div>
        </section>
      `;
        this.loadSuperadminDashboard(content);
      } else {
        content.innerHTML = `
        <section class="workspace-welcome" aria-labelledby="workspace-welcome-title">
          <span class="section-tag cyan">HMIF UMB // RUANG KERJA DIGITAL</span>
          <h2 id="workspace-welcome-title">Selamat datang, ${escapeHtml(user.name)}.</h2>
          <p>Dashboard ${escapeHtml(dashboardName)} Anda menampilkan layanan berdasarkan tingkat akses yang diberikan.</p>
        </section>
        <section class="workspace-overview" aria-label="Ringkasan akun">
          <div><span>STATUS AKUN</span><strong>AKTIF</strong></div>
          <div><span>TINGKAT AKSES</span><strong>${escapeHtml(roleName)}</strong></div>
          <div><span>JABATAN</span><strong>${escapeHtml(user.role_title || 'Anggota HMIF')}</strong></div>
        </section>
        <section class="workspace-section">
          <h2>AKSES CEPAT</h2>
          <div class="workspace-quick-links">
            <button type="button" data-workspace-view="profile"><strong>Profil & keamanan</strong><span>Perbarui profil, foto, dan kata sandi akun.</span></button>
            ${canOperate ? '<button type="button" data-workspace-view="operations"><strong>Operasional organisasi</strong><span>Kelola program, agenda, Klinik Koding, dan modul sesuai clearance.</span></button>' : ''}
            ${isSuperadmin ? '<button type="button" data-workspace-view="studio"><strong>Site Studio</strong><span>Kelola tampilan, konten, struktur, aset, dan versi situs.</span></button>' : ''}
            <button type="button" data-workspace-public><strong>Jelajahi portal publik</strong><span>Kembali ke informasi dan layanan publik HMIF.</span></button>
          </div>
        </section>
      `;
      }
      this.renderAttendanceCheckIn(content);
      this.renderMyEventTickets(content);
      this.renderMyDelegations(content);
      content.querySelectorAll('[data-workspace-view]').forEach((button) => button.addEventListener('click', () => this.openWorkspace(button.dataset.workspaceView)));
      content.querySelectorAll('[data-workspace-public]').forEach((button) => button.addEventListener('click', () => this.closeWorkspace()));
    } else if (allowedView === 'notifications') {
      this.renderWorkspaceNotifications(content);
    } else if (allowedView === 'profile') {
      this.openAccountDialog();
    } else if (allowedView === 'operations') {
      this.adminConsole.open();
    } else if (allowedView === 'academic') {
      this.academicConsole.open(content, isSuperadmin);
    } else if (allowedView === 'studio') {
      this.siteStudio.open();
    }
  }

  renderAttendanceCheckIn(content) {
    content.insertAdjacentHTML('beforeend', `
      <section class="workspace-section attendance-member-checkin" aria-labelledby="attendance-member-title">
        <div class="workspace-panel-heading">
          <div><span class="section-tag cyan">PRESENSI EVENT // GPS</span><h2 id="attendance-member-title">Check-in anggota</h2></div>
        </div>
        <p>QR presensi berlaku terbatas. Kamera dan lokasi hanya digunakan untuk memvalidasi check-in event.</p>
        <div class="attendance-member-actions">
          <button class="btn-tactical primary" type="button" data-attendance-scan>MULAI SCAN QR</button>
          <button class="btn-tactical" type="button" data-attendance-stop hidden>HENTIKAN SCAN</button>
        </div>
        <video class="event-qr-scanner" data-attendance-video playsinline hidden aria-label="Pemindai QR presensi anggota"></video>
        <p class="auth-feedback" data-attendance-feedback role="status"></p>
      </section>
    `);
    const scannerSection = content.querySelector('.attendance-member-checkin');
    const video = scannerSection.querySelector('[data-attendance-video]');
    const feedback = scannerSection.querySelector('[data-attendance-feedback]');
    const stopButton = scannerSection.querySelector('[data-attendance-stop]');
    scannerSection.querySelector('[data-attendance-scan]').addEventListener('click', async () => {
      if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) {
        feedback.textContent = 'Pemindai QR tidak tersedia di browser ini.';
        return;
      }
      try {
        const detector = new BarcodeDetector({ formats: ['qr_code'] });
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        this.attendanceStream = stream;
        video.srcObject = stream;
        video.hidden = false;
        stopButton.hidden = false;
        await video.play();
        feedback.textContent = 'Arahkan kamera ke QR sesi presensi pengurus.';
        const scan = async () => {
          if (this.attendanceStream !== stream || !stream.active) return;
          try {
            const [code] = await detector.detect(video);
            if (code) {
              const payload = JSON.parse(code.rawValue);
              if (payload.type !== 'hmif-attendance-session'
                || typeof payload.event_id !== 'string'
                || typeof payload.session_id !== 'string'
                || typeof payload.token !== 'string') {
                throw new Error('QR bukan sesi presensi HMIF yang valid.');
              }
              this.stopAttendanceScanner();
              feedback.textContent = 'QR terbaca. Meminta lokasi perangkat...';
              if (!navigator.geolocation) {
                feedback.textContent = 'Lokasi perangkat tidak tersedia; presensi tidak dapat dicatat.';
                return;
              }
              navigator.geolocation.getCurrentPosition(async (position) => {
                const result = await this.api.submitAttendance(payload.event_id, {
                  session_id: payload.session_id,
                  session_token: payload.token,
                  latitude: position.coords.latitude,
                  longitude: position.coords.longitude,
                  accuracy_m: position.coords.accuracy
                });
                feedback.textContent = result.ok
                  ? `${result.data.message} // jarak ${result.data.distance_m} m`
                  : result.error;
              }, () => {
                feedback.textContent = 'Lokasi tidak dapat diverifikasi. Aktifkan izin lokasi dan coba kembali.';
              }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
              return;
            }
          } catch (error) {
            feedback.textContent = error.message || 'QR tidak dapat dibaca.';
            this.stopAttendanceScanner();
            return;
          }
          this.attendanceScanFrame = requestAnimationFrame(scan);
        };
        scan();
      } catch {
        feedback.textContent = 'Kamera tidak dapat dibuka. Periksa izin browser.';
        this.stopAttendanceScanner();
      }
    });
    stopButton.addEventListener('click', () => {
      this.stopAttendanceScanner();
      feedback.textContent = 'Pemindaian dihentikan.';
    });
  }

  stopAttendanceScanner() {
    if (this.attendanceScanFrame) cancelAnimationFrame(this.attendanceScanFrame);
    this.attendanceScanFrame = 0;
    this.attendanceStream?.getTracks().forEach((track) => track.stop());
    this.attendanceStream = null;
    const video = document.querySelector('[data-attendance-video]');
    if (video) {
      video.pause();
      video.srcObject = null;
      video.hidden = true;
      const stopButton = video.closest('.attendance-member-checkin')?.querySelector('[data-attendance-stop]');
      if (stopButton) stopButton.hidden = true;
    }
  }

  async renderMyEventTickets(content) {
    const section = document.createElement('section');
    section.className = 'workspace-section member-event-tickets';
    section.setAttribute('aria-labelledby', 'member-event-tickets-title');
    section.innerHTML = `
      <div class="workspace-panel-heading"><div><span class="section-tag gold">EVENT // E-TICKET</span><h2 id="member-event-tickets-title">Tiket event saya</h2></div></div>
      <p class="auth-feedback" data-member-ticket-feedback role="status">Memuat tiket event...</p>
      <div class="member-event-ticket-list"></div>`;
    content.append(section);
    const feedback = section.querySelector('[data-member-ticket-feedback]');
    const list = section.querySelector('.member-event-ticket-list');
    const result = await this.api.getMyEventTickets();
    if (!content.isConnected || this.workspaceView !== 'home') return;
    if (!result.ok || !Array.isArray(result.data?.tickets)) {
      feedback.textContent = result.error || 'Tiket event belum dapat dimuat.';
      return;
    }
    const tickets = result.data.tickets;
    feedback.textContent = tickets.length ? `${tickets.length} tiket terhubung dengan akun ini.` : 'Belum ada tiket event untuk akun ini.';
    list.innerHTML = await Promise.all(tickets.map(async (ticket) => {
      let qrImage = '';
      if (!ticket.checked_in_at && ticket.token) {
        try {
          qrImage = await QRCode.toDataURL(JSON.stringify({ type: 'hmif-event-ticket', id: ticket.id, token: ticket.token }), {
            errorCorrectionLevel: 'M', margin: 1, width: 220
          });
        } catch {
          qrImage = '';
        }
      }
      return `
        <article class="member-event-ticket">
          <div><strong>${escapeHtml(ticket.event.title)}</strong><p>${escapeHtml(ticket.event.date)} // ${escapeHtml(ticket.event.location || 'Lokasi akan diumumkan')}</p><small>ID ${escapeHtml(ticket.id)}</small></div>
          ${ticket.checked_in_at
          ? `<p class="event-ticket-checked-in">CHECK-IN TERCATAT // ${escapeHtml(new Date(ticket.checked_in_at).toLocaleString('id-ID'))}</p>`
          : qrImage
            ? `<img src="${qrImage}" alt="QR tiket ${escapeHtml(ticket.event.title)}" width="180" height="180" /><a class="btn-tactical" href="${qrImage}" download="hmif-ticket-${escapeHtml(ticket.id)}.png">UNDUH QR</a>`
            : '<p class="auth-feedback" role="alert">QR tiket tidak tersedia. Muat ulang dashboard untuk mencoba kembali.</p>'}
        </article>`;
    })).then((items) => items.join(''));
  }


  async renderMyDelegations(content) {
    const section = document.createElement('section');
    section.className = 'workspace-section member-delegations';
    section.setAttribute('aria-labelledby', 'member-delegations-title');
    section.innerHTML = `
      <div class="workspace-panel-heading">
        <div>
          <span class="section-tag cyan">PASAL 57 ART // MANDAT RESMI</span>
          <h2 id="member-delegations-title">Delegasi & Tugas Organisasi</h2>
        </div>
        <button class="btn-tactical primary btn-small" type="button" data-member-new-delegation>+ AJUKAN MANDAT DELEGASI</button>
      </div>

      <div style="border-left: 3px solid #ff9100; padding: 0.6rem 0.8rem; margin: 0.75rem 0 1rem 0; background: rgba(255,145,0,0.08); font-size: 0.8rem;">
        <strong>KETENTUAN PASAL 57 ART (CLAWBACK POLICY):</strong> Mahasiswa delegasi HMIF UMB wajib menyerahkan Laporan Pertanggungjawaban Delegasi (LPD) dan menyelenggarakan Sharing Session kader maksimal 7 hari kalender pasca kegiatan. Ketidakpatuhan mewajibkan pengembalian dana 100% serta larangan delegasi 1 periode kepengurusan.
      </div>

      <div class="member-delegation-form-container" style="display:none; margin-bottom: 1.5rem; background: rgba(0,0,0,0.3); border: 1px solid var(--ak-cyan); padding: 1rem;">
        <h3 style="margin-top:0; font-size: 1rem; color: var(--ak-cyan);">FORMULIR PENGAJUAN MANDAT DELEGASI (PASAL 57 ART)</h3>
        <form id="member-delegation-form" class="admin-form">
          <div class="admin-form-grid">
            <label class="form-group"><span class="form-label">NAMA KEGIATAN / LOMBA</span><input class="form-input" name="event_name" required maxlength="180" placeholder="e.g. Gemastik / Hackathon / Rakorwil" /></label>
            <label class="form-group"><span class="form-label">INSTANSI PENYELENGGARA</span><input class="form-input" name="organizer" required maxlength="180" placeholder="e.g. Kemendikbud / BEM / Kampus Mitra" /></label>
            <label class="form-group"><span class="form-label">SKALA TINGKAT</span>
              <select class="form-select" name="level">
                <option value="LOKAL">Lokal / Kampus</option>
                <option value="REGIONAL">Regional (Jabar / Priangan Timur)</option>
                <option value="NASIONAL" selected>Nasional</option>
                <option value="INTERNASIONAL">Internasional</option>
              </select>
            </label>
            <label class="form-group"><span class="form-label">BANTUAN DANA DIAJUKAN</span>
              <select class="form-select" name="funding_type">
                <option value="MANDIRI">Mandiri (Surat Tugas Saja / Biaya Mandiri)</option>
                <option value="PARSIAL" selected>Parsial (Bantuan Subsidi Pendaftaran/Transport)</option>
                <option value="PENUH">Penuh (Didanai Kas HMIF)</option>
              </select>
            </label>
          </div>
          <div class="admin-form-grid">
            <label class="form-group"><span class="form-label">TANGGAL MULAI</span><input class="form-input" name="start_date" type="date" required /></label>
            <label class="form-group"><span class="form-label">TANGGAL SELESAI</span><input class="form-input" name="end_date" type="date" required /></label>
            <label class="form-group"><span class="form-label">ESTIMASI DANA (RP)</span><input class="form-input" name="funding_amount" type="number" min="0" step="5000" value="0" /></label>
          </div>
          <label class="form-label">DAFTAR NAMA & NIM ANGGOTA DELEGASI</label>
          <textarea class="form-textarea" name="delegates_list" rows="2" placeholder="Tuliskan NIM, Nama, dan Peran (e.g. 230101 - Ahmad [Ketua Tim])" required></textarea>
          <div style="display:flex; gap:0.5rem; align-items:center; margin-top:0.75rem;">
            <button class="btn-tactical primary" type="submit">KIRIM PENGAJUAN MANDAT</button>
            <button class="btn-tactical" type="button" data-member-cancel-delegation>BATAL</button>
          </div>
          <p class="auth-feedback" data-member-delegation-feedback role="status"></p>
        </form>
      </div>

      <div class="member-delegation-list" data-member-delegation-list>
        <p role="status">Memuat data delegasi Anda...</p>
      </div>`;
    content.append(section);

    const toggleBtn = section.querySelector('[data-member-new-delegation]');
    const formContainer = section.querySelector('.member-delegation-form-container');
    const cancelBtn = section.querySelector('[data-member-cancel-delegation]');
    const form = section.querySelector('#member-delegation-form');
    const feedback = section.querySelector('[data-member-delegation-feedback]');
    const listContainer = section.querySelector('[data-member-delegation-list]');

    toggleBtn.addEventListener('click', () => {
      formContainer.style.display = formContainer.style.display === 'none' ? 'block' : 'none';
    });
    cancelBtn.addEventListener('click', () => {
      formContainer.style.display = 'none';
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      feedback.textContent = 'Mengirimkan permohonan mandat delegasi...';
      const formData = new FormData(form);
      const payload = {
        event_name: formData.get('event_name'),
        organizer: formData.get('organizer'),
        level: formData.get('level'),
        funding_type: formData.get('funding_type'),
        funding_amount: Number(formData.get('funding_amount') || 0),
        start_date: formData.get('start_date'),
        end_date: formData.get('end_date'),
        delegates_list: formData.get('delegates_list')
      };
      const res = await this.api.createDelegation(payload);
      if (!res.ok) {
        feedback.textContent = res.error || 'Gagal mengirim pengajuan.';
        return;
      }
      feedback.textContent = 'Pengajuan delegasi berhasil dikirim! Menunggu verifikasi BPH/Ketua HMIF.';
      form.reset();
      formContainer.style.display = 'none';
      await loadDelegations();
    });

    const loadDelegations = async () => {
      const res = await this.api.getDelegations();
      if (!res.ok || !Array.isArray(res.data)) {
        listContainer.innerHTML = '<p class="auth-feedback">Belum dapat memuat status delegasi.</p>';
        return;
      }
      const myDels = res.data;
      if (!myDels.length) {
        listContainer.innerHTML = '<p style="color:var(--ak-text-dim); font-size:0.85rem;">Anda belum memiliki riwayat pengajuan delegasi.</p>';
        return;
      }
      listContainer.innerHTML = myDels.map((del) => `
        <article class="admin-record-row" style="flex-direction:column; align-items:flex-start; margin-bottom:0.75rem; border-left:3px solid ${del.status === 'APPROVED' ? 'var(--ak-cyan)' : del.status === 'REJECTED' ? '#ff5252' : '#ffb300'};">
          <div style="display:flex; justify-content:space-between; width:100%; align-items:center; flex-wrap:wrap; gap:0.5rem;">
            <strong>${escapeHtml(del.event_name)} <span class="status-badge ${del.status === 'APPROVED' ? 'ok' : del.status === 'REJECTED' ? 'danger' : 'muted'}">${escapeHtml(del.status)}</span></strong>
            <small style="color:var(--ak-text-dim);">${escapeHtml(del.level)} // ${escapeHtml(del.funding_type)} // Rp ${Number(del.funding_amount).toLocaleString('id-ID')}</small>
          </div>
          <div style="font-size:0.85rem; color:var(--ak-text-secondary); width:100%;">
            <p style="margin:0.25rem 0;"><strong>Penyelenggara:</strong> ${escapeHtml(del.organizer)} | <strong>Jadwal:</strong> ${escapeHtml(del.start_date)} s/d ${escapeHtml(del.end_date)}</p>
            <p style="margin:0.25rem 0;"><strong>Peserta:</strong> ${escapeHtml(del.delegates_list)}</p>
            ${del.surat_tugas_ref ? `
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; margin:0.35rem 0;">
              <span style="color:var(--ak-cyan);"><strong>No. Surat Tugas:</strong> ${escapeHtml(del.surat_tugas_ref)}</span>
              <button class="btn-tactical btn-small" type="button" data-print-mandate="${escapeHtml(del.id)}">CETAK SURAT TUGAS RESMI ↗</button>
            </div>` : ''}
            ${del.lpd_submitted ? `<p style="margin:0.25rem 0; color:#4caf50;">✓ LPD & Dokumen Telah Diserahkan (${escapeHtml(del.lpd_submitted_at || '')})</p>` : `<p style="margin:0.25rem 0; color:#ff9800;">! Kewajiban LPD: Serahkan maksimal 7 hari pasca acara.</p>`}
          </div>
          ${del.status === 'APPROVED' && !del.lpd_submitted ? `
            <div style="margin-top:0.5rem;">
              <button class="btn-tactical btn-small" type="button" data-member-submit-lpd="${escapeHtml(del.id)}">SUBMIT LPD & SHARING SESSION</button>
            </div>
          ` : ''}
        </article>
      `).join('');

      listContainer.querySelectorAll('[data-print-mandate]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.printMandate;
          const del = myDels.find((d) => d.id === id);
          if (del) this.openDelegationMandatPrint(del);
        });
      });

      listContainer.querySelectorAll('[data-member-submit-lpd]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.memberSubmitLpd;
          const summary = prompt('Ringkasan Pencapaian / Hasil Kegiatan Delegasi:', 'Partisipasi dan perolehan capaian perlombaan...');
          if (!summary) return;
          const sharingDate = prompt('Rencana Tanggal Sharing Session Kader HMIF (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
          const result = await this.api.submitDelegationLpd(id, {
            lpd_summary: summary,
            sharing_session_scheduled_at: sharingDate || null
          });
          if (result.ok) {
            alert('Laporan Pertanggungjawaban Delegasi (LPD) berhasil diserahkan! Status Clawback aman.');
            await loadDelegations();
          } else {
            alert(result.error || 'Gagal menyimpan LPD.');
          }
        });
      });
    };

    await loadDelegations();
  }

  async openDelegationMandatPrint(del) {
    const qrImage = await QRCode.toDataURL(window.location.origin + '/#doctrine', { errorCorrectionLevel: 'M', margin: 1, width: 140 });
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Pop-up browser terblokir. Izinkan pop-up untuk mencetak Surat Tugas Resmi.');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="UTF-8">
        <title>Surat Tugas Delegasi // ${escapeHtml(del.surat_tugas_ref || 'HMIF-UMB')}</title>
        <style>
          @page { size: A4; margin: 20mm; }
          body { font-family: "Times New Roman", Times, serif; color: #000; line-height: 1.5; margin: 0; padding: 20px; }
          .kop { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px double #000; padding-bottom: 12px; margin-bottom: 24px; }
          .kop img { width: 85px; height: 85px; object-fit: contain; }
          .kop-text { text-align: center; flex: 1; }
          .kop-text h2 { margin: 0; font-size: 16pt; text-transform: uppercase; letter-spacing: 0.5px; }
          .kop-text h3 { margin: 2px 0; font-size: 14pt; }
          .kop-text p { margin: 0; font-size: 9pt; font-style: italic; }
          .title-section { text-align: center; margin-bottom: 24px; }
          .title-section h4 { margin: 0; font-size: 13pt; text-decoration: underline; letter-spacing: 1px; text-transform: uppercase; }
          .title-section span { font-size: 10pt; font-weight: bold; }
          .content-block { font-size: 11pt; text-align: justify; margin-bottom: 16px; }
          .content-table { width: 100%; border-collapse: collapse; margin: 12px 0 16px 0; font-size: 11pt; }
          .content-table td { padding: 4px 6px; vertical-align: top; }
          .content-table td:first-child { width: 28%; font-weight: bold; }
          .footer-section { margin-top: 40px; display: flex; justify-content: space-between; page-break-inside: avoid; }
          .signature-box { width: 220px; text-align: center; font-size: 11pt; }
          .signature-space { height: 75px; display: flex; align-items: center; justify-content: center; }
          .signature-qr { width: 70px; height: 70px; }
          .notice-box { margin-top: 30px; border: 1px dashed #444; padding: 8px 12px; font-size: 8.5pt; font-family: sans-serif; background: #fafafa; }
          @media print {
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom: 20px; background: #e0f2fe; padding: 10px 15px; border: 1px solid #0284c7; display: flex; justify-content: space-between; align-items: center;">
          <strong style="font-family: sans-serif; color: #0369a1;">DOKUMEN RESMI HMIF UMB // PASAL 57 ART</strong>
          <button onclick="window.print()" style="padding: 8px 18px; background: #0284c7; color: white; border: none; font-weight: bold; cursor: pointer; border-radius: 4px;">CETAK / SIMPAN PDF</button>
        </div>

        <div class="kop">
          <img src="/assets/hmif_umb_logo.png" alt="Logo HMIF UMB" onerror="this.src='/assets/hmif_umb_logo.jpg'" />
          <div class="kop-text">
            <h2>Himpunan Mahasiswa Informatika</h2>
            <h3>Universitas Mayasari Bakti</h3>
            <p>Sekretariat: Kampus Universitas Mayasari Bakti, Kota Tasikmalaya, Jawa Barat</p>
            <p>Surel: hmif@mayasaribakti.ac.id | Laman Resmi: hmif.mayasaribakti.ac.id</p>
          </div>
        </div>

        <div class="title-section">
          <h4>SURAT TUGAS MANDAT DELEGASI</h4>
          <span>Nomor: ${escapeHtml(del.surat_tugas_ref || 'ST/HMIF-UMB/2026/001')}</span>
        </div>

        <div class="content-block">
          Berdasarkan ketentuan Anggaran Rumah Tangga (ART) HMIF Universitas Mayasari Bakti Bab X Pasal 57 mengenai Prosedur Delegasi Kegiatan, Pengurus Badan Pengurus Harian (BPH) HMIF UMB dengan ini memberikan mandat dan tugas resmi kepada mahasiswa yang tercantum di bawah ini:
        </div>

        <table class="content-table">
          <tr>
            <td>Nama Kegiatan</td>
            <td>: <strong>${escapeHtml(del.event_name)}</strong></td>
          </tr>
          <tr>
            <td>Penyelenggara</td>
            <td>: ${escapeHtml(del.organizer)}</td>
          </tr>
          <tr>
            <td>Skala Kegiatan</td>
            <td>: Tingkat ${escapeHtml(del.level)}</td>
          </tr>
          <tr>
            <td>Waktu Pelaksanaan</td>
            <td>: ${escapeHtml(del.start_date)} s/d ${escapeHtml(del.end_date)}</td>
          </tr>
          <tr>
            <td>Skema Pendanaan</td>
            <td>: ${escapeHtml(del.funding_type)} (Rp ${Number(del.funding_amount).toLocaleString('id-ID')})</td>
          </tr>
          <tr>
            <td>Peserta Delegasi</td>
            <td>: ${escapeHtml(del.delegates_list)}</td>
          </tr>
        </table>

        <div class="content-block">
          Untuk menjalankan amanah, mengharumkan almamater Universitas Mayasari Bakti, dan menjunjung tinggi kode etik serta sportivitas organisasi selama berlangsungnya kegiatan tersebut.
        </div>

        <div class="footer-section">
          <div class="signature-box" style="text-align:left;">
            <p style="margin:0 0 5px 0;">Verifikasi Sistem PRTS:</p>
            <img class="signature-qr" src="${qrImage}" alt="QR Validasi" />
            <p style="margin:5px 0 0 0; font-size:7.5pt; color:#555;">ID: ${escapeHtml(del.id)}</p>
          </div>
          <div class="signature-box">
            <p style="margin:0 0 5px 0;">Tasikmalaya, ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            <p style="margin:0; font-weight:bold;">Pengurus HMIF UMB</p>
            <div class="signature-space">
              <span style="border-bottom:1px solid #777; font-style:italic; font-size:9pt; color:#444;">[ Dokumen Bertanda Tangan Digital ]</span>
            </div>
            <p style="margin:0; font-weight:bold; text-decoration:underline;">Ketua Himpunan HMIF</p>
            <p style="margin:0; font-size:9.5pt;">Universitas Mayasari Bakti</p>
          </div>
        </div>

        <div class="notice-box">
          <strong>PERINGATAN PASAL 57 ART (CLAWBACK POLICY):</strong><br />
          Penerima delegasi wajib menyerahkan Laporan Pertanggungjawaban Delegasi (LPD) dan menyelenggarakan Sharing Session bagi kader paling lambat 7 (tujuh) hari kalender setelah kegiatan selesai. Kelalaian mewajibkan pengembalian penuh dana subsidi organisasi dan larangan mengikuti delegasi selama 1 (satu) periode kepengurusan.
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
  }



  async renderWorkspaceNotifications(content) {
    content.innerHTML = `
      <section class="workspace-notifications" aria-labelledby="workspace-notifications-title">
        <div class="workspace-panel-heading">
          <div><span class="section-tag cyan">RUANG KERJA // PEMBERITAHUAN</span><h2 id="workspace-notifications-title">Notifikasi</h2></div>
          <button type="button" class="btn-tactical" data-notifications-read-all>TANDAI SEMUA DIBACA</button>
        </div>
        <p class="workspace-notification-feedback" data-notification-feedback role="status">Memuat notifikasi...</p>
        <ol class="workspace-notification-list" data-notification-list></ol>
      </section>
      <section class="workspace-section workspace-notification-settings" aria-labelledby="workspace-notification-settings-title">
        <div class="workspace-panel-heading">
          <div><span class="section-tag gold">PREFERENSI AKUN</span><h2 id="workspace-notification-settings-title">Pengaturan notifikasi</h2></div>
        </div>
        <form class="workspace-notification-form" data-notification-preferences>
          <label><input type="checkbox" name="deadline" /><span>Pengingat tenggat beasiswa, kompetisi, dan tugas yang ditugaskan kepada saya</span></label>
          <label><input type="checkbox" name="task" /><span>Perubahan status tugas organisasi</span></label>
          <label><input type="checkbox" name="submission" /><span>Perubahan status pengajuan konten saya</span></label>
          <label><input type="checkbox" name="tutoring" /><span>Jadwal dan perubahan sesi Klinik Koding</span></label>
          <label class="workspace-notification-select"><span>Ingatkan tenggat dalam jangka waktu</span>
            <select name="deadline_days" class="form-input">
              <option value="1">1 hari</option><option value="3">3 hari</option><option value="7">7 hari</option><option value="14">14 hari</option><option value="30">30 hari</option>
            </select>
          </label>
          <label class="workspace-notification-select"><span>Pengingat sesi sebelum dimulai</span>
            <select name="tutoring_reminder_hours" class="form-input">
              <option value="0">Nonaktif</option><option value="1">1 jam</option><option value="24">24 jam</option><option value="48">48 jam</option>
            </select>
          </label>
          <button type="submit" class="btn-tactical primary">SIMPAN PREFERENSI</button>
          <p class="workspace-notification-feedback" data-notification-preference-feedback role="status"></p>
        </form>
      </section>
    `;

    const list = content.querySelector('[data-notification-list]');
    const feedback = content.querySelector('[data-notification-feedback]');
    const preferenceFeedback = content.querySelector('[data-notification-preference-feedback]');
    const form = content.querySelector('[data-notification-preferences]');
    const result = await this.api.getNotifications();
    if (!content.isConnected || this.workspaceView !== 'notifications') return;
    if (!result.ok || !Array.isArray(result.data?.notifications) || !result.data?.preferences) {
      feedback.textContent = result.error || 'Data notifikasi dari server tidak sesuai.';
      return;
    }

    const { notifications, preferences } = result.data;
    form.elements.deadline.checked = preferences.deadline;
    form.elements.task.checked = preferences.task;
    form.elements.submission.checked = preferences.submission;
    form.elements.tutoring.checked = preferences.tutoring;
    form.elements.deadline_days.value = String(preferences.deadline_days);
    form.elements.tutoring_reminder_hours.value = String(preferences.tutoring_reminder_hours);
    feedback.textContent = `${result.data.unread_count} belum dibaca`;
    list.innerHTML = notifications.length ? notifications.map((notification) => `
      <li class="workspace-notification-item ${notification.is_read ? 'is-read' : 'is-unread'}" data-notification-id="${escapeHtml(notification.id)}">
        <div>
          <span class="workspace-notification-category">${escapeHtml(notification.category.toUpperCase())} · ${escapeHtml(new Date(notification.created_at).toLocaleString('id-ID'))}</span>
          <strong>${escapeHtml(notification.title)}</strong>
          <p>${escapeHtml(notification.message)}</p>
        </div>
        <div class="workspace-notification-actions">
          ${notification.action_view ? `<button type="button" class="btn-tactical" data-notification-view="${escapeHtml(notification.action_view)}">BUKA</button>` : ''}
          ${notification.is_read ? '<span class="workspace-notification-read">DIBACA</span>' : '<button type="button" class="btn-tactical primary" data-notification-read>TANDAI DIBACA</button>'}
        </div>
      </li>
    `).join('') : '<li class="workspace-notification-empty">Belum ada notifikasi. Pengingat baru akan muncul sesuai preferensi akun Anda.</li>';

    list.querySelectorAll('[data-notification-read]').forEach((button) => button.addEventListener('click', async () => {
      const row = button.closest('[data-notification-id]');
      const update = await this.api.markNotificationRead(row.dataset.notificationId);
      if (!update.ok) {
        feedback.textContent = update.error;
        return;
      }
      await this.renderWorkspaceNotifications(content);
    }));
    content.querySelector('[data-notifications-read-all]').addEventListener('click', async () => {
      const update = await this.api.markAllNotificationsRead();
      if (!update.ok) {
        feedback.textContent = update.error;
        return;
      }
      await this.renderWorkspaceNotifications(content);
    });
    list.querySelectorAll('[data-notification-view]').forEach((button) => button.addEventListener('click', async () => {
      const row = button.closest('[data-notification-id]');
      if (!row.classList.contains('is-read')) {
        const update = await this.api.markNotificationRead(row.dataset.notificationId);
        if (!update.ok) {
          feedback.textContent = update.error;
          return;
        }
      }
      if (button.dataset.notificationView === 'calendar') {
        this.closeWorkspace();
        this.switchTab('calendar');
      } else {
        this.openWorkspace(button.dataset.notificationView);
      }
    }));
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      preferenceFeedback.textContent = 'Menyimpan preferensi...';
      const update = await this.api.updateNotificationPreferences({
        deadline: form.elements.deadline.checked,
        task: form.elements.task.checked,
        submission: form.elements.submission.checked,
        tutoring: form.elements.tutoring.checked,
        deadline_days: Number(form.elements.deadline_days.value),
        tutoring_reminder_hours: Number(form.elements.tutoring_reminder_hours.value)
      });
      preferenceFeedback.textContent = update.ok ? 'Preferensi notifikasi tersimpan.' : update.error;
    });
  }

  async loadSuperadminDashboard(content) {
    const metrics = content.querySelector('[data-dashboard-metrics]');
    const activity = content.querySelector('[data-dashboard-activity]');
    const agenda = content.querySelector('[data-dashboard-agenda]');
    const health = content.querySelector('[data-dashboard-health]');
    const systemStatsContainer = content.querySelector('[data-dashboard-system-stats]');
    if (!metrics || !activity || !agenda || !health || !systemStatsContainer) return;

    const requests = await Promise.all([
      this.api.getAllUsers(),
      this.api.getAdminPortalRecords('project'),
      this.api.getAdminPortalRecords('alumni'),
      this.api.getAdminPortalRecords('job'),
      this.api.getOrganizationTasks(),
      this.api.getCalendarEvents(),
      this.api.getAuditLog(8),
      this.api.getPendingKnowledgeDiscussions(),
      this.api.getTutoringRequests(),
      this.api.getSystemStats()
    ]);
    if (!content.isConnected || this.workspaceView !== 'home') return;

    const [usersResult, projectResult, alumniResult, jobsResult, tasksResult, calendarResult, auditResult, discussionsResult, tutoringResult, systemStatsResult] = requests;
    const extractArray = (result, select) => {
      if (!result.ok) return null;
      const value = select(result.data || {});
      return Array.isArray(value) ? value : null;
    };
    const users = extractArray(usersResult, (data) => data.users);
    const projects = extractArray(projectResult, (data) => data.records);
    const alumni = extractArray(alumniResult, (data) => data.records);
    const jobs = extractArray(jobsResult, (data) => data.records);
    const tasks = extractArray(tasksResult, (data) => data.tasks);
    const events = extractArray(calendarResult, (data) => data);
    const auditEntries = extractArray(auditResult, (data) => data.entries);
    const discussions = extractArray(discussionsResult, (data) => data.discussions);
    const tutoring = extractArray(tutoringResult, (data) => data.requests);
    const systemStats = systemStatsResult.ok && systemStatsResult.data?.users
      ? systemStatsResult.data
      : null;
    const records = [...(projects || []), ...(alumni || []), ...(jobs || [])];
    const dataCollections = [users, projects, alumni, jobs, tasks, events, auditEntries, discussions, tutoring, systemStats];
    const unavailableCollections = dataCollections.filter((collection) => collection === null).length;
    const sourceError = (result, collection) => result.ok
      ? (collection === null ? 'Format data dari server tidak sesuai' : '')
      : result.error;
    const maybeCount = (items) => items === null ? '—' : String(items.length);
    const missingRecordCollection = [projects, alumni, jobs].some((items) => items === null);
    const pendingReview = records.filter((record) => ['pending', 'pending_review', 'needs_revision'].includes(record.review_status)).length;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lastDay = new Date(today);
    lastDay.setDate(lastDay.getDate() + 14);
    const upcomingJobs = (jobs || [])
      .filter((record) => record.review_status === 'published' && record.active && record.payload?.deadline)
      .map((record) => ({
        title: record.payload.title,
        date_str: record.payload.deadline,
        location: record.payload.employer,
        type: 'LOWONGAN',
        registration_url: record.payload.url
      }));
    const upcomingEvents = [...(events || []), ...upcomingJobs].filter((event) => {
      const date = new Date(`${event.date_str}T00:00:00`);
      return !Number.isNaN(date.valueOf()) && date >= today && date <= lastDay;
    }).sort((first, second) => first.date_str.localeCompare(second.date_str));
    const openTasks = (tasks || []).filter((task) => task.status !== 'done');
    const overdueTasks = openTasks.filter((task) => task.due_date && new Date(`${task.due_date}T00:00:00`) < today);
    const metricsData = [
      { label: 'AKUN TERDAFTAR', value: users === null ? '—' : maybeCount(users), detail: users === null ? sourceError(usersResult, users) : 'Akun pada direktori organisasi', tone: 'cyan' },
      { label: 'MENUNGGU REVIEW', value: missingRecordCollection ? '—' : String(pendingReview), detail: missingRecordCollection ? 'Data kurasi belum tersedia' : 'Pengajuan konten yang menunggu', tone: 'gold' },
      { label: 'TUGAS BELUM SELESAI', value: tasks === null ? '—' : String(openTasks.length), detail: tasks === null ? sourceError(tasksResult, tasks) : `${overdueTasks.length} melewati tenggat`, tone: 'green' },
      { label: 'AGENDA & TENGGAT 14 HARI', value: events === null || jobs === null ? '—' : String(upcomingEvents.length), detail: events === null ? sourceError(calendarResult, events) : jobs === null ? sourceError(jobsResult, jobs) : 'Event, beasiswa, kompetisi, dan lowongan', tone: 'violet' }
    ];
    metrics.innerHTML = metricsData.map((metric) => `
      <article class="workspace-metric workspace-tone-${metric.tone}">
        <span>${escapeHtml(metric.label)}</span><strong>${escapeHtml(metric.value)}</strong><small>${escapeHtml(metric.detail)}</small>
      </article>
    `).join('');

    if (!systemStats) {
      const error = systemStatsResult.ok ? 'Format statistik dari server tidak sesuai' : systemStatsResult.error;
      systemStatsContainer.innerHTML = `<p class="workspace-data-error" role="alert">${escapeHtml(error)}</p>`;
    } else {
      const count = (value) => Number.isFinite(value) ? String(value) : '—';
      const rows = (entries) => entries.map(([label, value]) => `
        <div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(count(value))}</dd></div>
      `).join('');
      const group = (title, entries) => `
        <section class="workspace-system-stat-group">
          <h3>${escapeHtml(title)}</h3>
          <dl class="workspace-system-stat-list">${rows(entries)}</dl>
        </section>
      `;
      const byRole = Object.entries(systemStats.users.by_role || {})
        .sort(([first], [second]) => first.localeCompare(second))
        .map(([role, value]) => [role.replaceAll('_', ' ').toUpperCase(), value]);
      const byClearance = Object.entries(systemStats.users.by_clearance || {});
      const byStage = Object.entries(systemStats.users.by_stage || {})
        .sort(([first], [second]) => first.localeCompare(second));
      const byDivision = Object.entries(systemStats.users.by_division || {})
        .sort(([first], [second]) => first.localeCompare(second));
      const groups = [
        group('AKUN & AKSES', [['TOTAL AKUN', systemStats.users.total], ...byRole, ...byClearance]),
        group('KEANGGOTAAN', [...byStage, ...byDivision]),
        group('PROGRAM & AGENDA', [
          ['TOTAL PROGRAM KERJA', systemStats.proker?.total],
          ['SELESAI', systemStats.proker?.completed],
          ['AKTIF', systemStats.proker?.active],
          ['MENDATANG', systemStats.proker?.upcoming],
          ['AGENDA KALENDER', systemStats.calendar_events]
        ]),
        group('LAYANAN & ADMINISTRASI', [
          ['TOTAL ASPIRASI', systemStats.aspirations?.total],
          ['DITINDAKLANJUTI', systemStats.aspirations?.responded],
          ['MENUNGGU TINDAK LANJUT', systemStats.aspirations?.pending],
          ['PRESENSI', systemStats.attendance_records],
          ['TRANSAKSI KAS', systemStats.financial?.transactions],
          ['EVALUASI KADER', systemStats.evaluations]
        ])
      ];
      systemStatsContainer.innerHTML = groups.join('');
    }

    const openDiscussionCount = discussions?.length || 0;
    const openTutoringCount = tutoring?.filter((request) => request.status === 'Diterima').length || 0;
    health.innerHTML = unavailableCollections
      ? `<span class="workspace-health-dot is-warning" aria-hidden="true"></span><div><strong>DATA SEBAGIAN TERSEDIA</strong><small>${unavailableCollections} sumber data gagal dimuat</small></div><span class="workspace-health-code">${openDiscussionCount + openTutoringCount} antrean akademik</span>`
      : `<span class="workspace-health-dot" aria-hidden="true"></span><div><strong>DATA PORTAL TERKINI</strong><small>${records.length} konten · ${openDiscussionCount + openTutoringCount} antrean akademik</small></div><span class="workspace-health-code">${users?.length || 0} akun terdaftar</span>`;
    health.setAttribute('aria-label', unavailableCollections
      ? `${unavailableCollections} sumber data dashboard gagal dimuat`
      : 'Dashboard dimuat dari data tersimpan');

    if (auditEntries === null) {
      activity.innerHTML = `<li class="workspace-data-error" role="alert">${escapeHtml(sourceError(auditResult, auditEntries))}</li>`;
    } else if (!auditEntries?.length) {
      activity.innerHTML = '<li class="workspace-empty-state">Belum ada aktivitas yang tercatat.</li>';
    } else {
      activity.innerHTML = auditEntries.slice(0, 6).map((entry) => {
        const createdAt = new Date(entry.created_at);
        const dateText = Number.isNaN(createdAt.valueOf())
          ? entry.created_at
          : createdAt.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
        const action = String(entry.action || 'aktivitas').replace(/[._]/g, ' ').toUpperCase();
        return `<li class="workspace-activity-item"><span class="workspace-activity-mark" aria-hidden="true"></span><div><small>${escapeHtml(action)}</small><strong>${escapeHtml(entry.target_type || 'sistem')}${entry.target_id ? ` // ${escapeHtml(entry.target_id)}` : ''}</strong><span>${escapeHtml(entry.actor_nim || 'Sistem')} · ${escapeHtml(dateText)}</span></div></li>`;
      }).join('');
    }

    if (events === null) {
      agenda.innerHTML = `<li class="workspace-data-error" role="alert">${escapeHtml(sourceError(calendarResult, events))}</li>`;
    } else if (!upcomingEvents.length) {
      agenda.innerHTML = '<li class="workspace-empty-state">Tidak ada agenda dalam 14 hari ke depan.</li>';
    } else {
      agenda.innerHTML = upcomingEvents.slice(0, 4).map((event) => {
        const date = new Date(`${event.date_str}T00:00:00`);
        const dateLabel = date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }).toUpperCase();
        return `<li class="workspace-agenda-item"><time datetime="${escapeHtml(event.date_str)}">${escapeHtml(dateLabel)}</time><div><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(event.location || event.division || 'Lokasi belum ditentukan')}</span></div><small>${escapeHtml(event.type || 'AGENDA')}</small>${event.registration_url ? `<a href="${escapeHtml(event.registration_url)}" target="_blank" rel="noopener noreferrer" aria-label="Buka pendaftaran ${escapeHtml(event.title)}">↗</a>` : ''}</li>`;
      }).join('');
    }
  }

  closeWorkspace() {
    const workspace = document.getElementById('member-workspace');
    const portal = document.querySelector('.app-content');
    if (workspace) workspace.hidden = true;
    if (portal) portal.hidden = false;
    this.switchTab('dashboard', { replace: true, focus: false, scroll: false });
  }

  openLoginDialog(initialFeedback = '') {
    const modalTitle = document.getElementById('prts-modal-title');
    const modalBody = document.getElementById('prts-modal-content');
    if (!modalTitle || !modalBody) return;

    modalTitle.textContent = 'PRTS ACCESS // AUTENTIKASI';
    modalBody.innerHTML = `
      <form id="login-form" novalidate>
        <div class="form-group">
          <label class="form-label" for="login-nim">NIM / ID PENGGUNA</label>
          <input class="form-input" id="login-nim" name="nim" autocomplete="username" autofocus required />
        </div>
        <div class="form-group">
          <label class="form-label" for="login-password">PASSWORD</label>
          <input class="form-input" id="login-password" name="password" type="password" autocomplete="current-password" required />
        </div>
        <p id="login-feedback" class="auth-feedback" role="status" aria-live="polite">${escapeHtml(initialFeedback)}</p>
        <button class="btn-tactical primary" type="submit">MASUK KE TERMINAL</button>
      </form>
      <div id="sso-buttons" class="sso-container"></div>
    `;
    this.openModal();

    initSso(document.getElementById('sso-buttons'), {
      onOpenDevMock: () => this.openDevMockSsoDialog()
    });

    document.getElementById('login-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const feedback = document.getElementById('login-feedback');
      const submitButton = form.querySelector('[type="submit"]');
      submitButton.disabled = true;
      feedback.textContent = 'Memverifikasi kredensial...';

      const result = await this.api.login(form.elements.nim.value.trim(), form.elements.password.value);
      if (!result.ok) {
        feedback.textContent = result.error;
        submitButton.disabled = false;
        return;
      }

      await this.syncApiData();
      this.closeModal();
      this.openWorkspace('home');
      prtsSound.playAccess();
    });
  }

  openDevMockSsoDialog() {
    const modalTitle = document.getElementById('prts-modal-title');
    const modalBody = document.getElementById('prts-modal-content');
    if (!modalTitle || !modalBody) return;

    modalTitle.textContent = 'PRTS ACCESS // SIMULASI GOOGLE SSO (DEV MODE)';
    modalBody.innerHTML = `
      <div class="sso-mock-wrapper">
        <div class="sso-mock-banner">
          <span class="section-tag gold">SIMULASI LOKAL</span>
          <p>Fitur ini aktif otomatis saat <code>GOOGLE_CLIENT_ID</code> belum dipasang di <code>.env</code>. Pilih akun mahasiswa/operator untuk login instan satu klik:</p>
        </div>
        <div class="sso-mock-grid">
          <button type="button" class="sso-mock-item" data-mock-nim="22040101">
            <div class="sso-mock-info">
              <span class="sso-mock-name">Arkan Raihan Pratama</span>
              <span class="sso-mock-role">Ketua Himpunan (Kahim) // NIM: 22040101</span>
            </div>
            <span class="badge-tactical cyan">CLEARANCE 3</span>
          </button>
          <button type="button" class="sso-mock-item" data-mock-nim="22040140">
            <div class="sso-mock-info">
              <span class="sso-mock-name">Fauzan Akbar Rabbani</span>
              <span class="sso-mock-role">Kepala Divisi Litbang // NIM: 22040140</span>
            </div>
            <span class="badge-tactical cyan">CLEARANCE 2</span>
          </button>
          <button type="button" class="sso-mock-item" data-mock-nim="23040122">
            <div class="sso-mock-info">
              <span class="sso-mock-name">Rifka Nur Syifa</span>
              <span class="sso-mock-role">Bendahara Umum // NIM: 23040122</span>
            </div>
            <span class="badge-tactical cyan">CLEARANCE 3</span>
          </button>
          <button type="button" class="sso-mock-item" data-mock-nim="26040188">
            <div class="sso-mock-info">
              <span class="sso-mock-name">Ahmad Faiz Rahmatullah</span>
              <span class="sso-mock-role">Kader Pratama // NIM: 26040188</span>
            </div>
            <span class="badge-tactical green">CLEARANCE 1</span>
          </button>
          <button type="button" class="sso-mock-item" data-mock-nim="admin">
            <div class="sso-mock-info">
              <span class="sso-mock-name">PRTS Terminal Administrator</span>
              <span class="sso-mock-role">Webmaster Overseer // ID: admin</span>
            </div>
            <span class="badge-tactical red">SUPERADMIN</span>
          </button>
          <button type="button" class="sso-mock-item unlinked" data-mock-unlinked="true">
            <div class="sso-mock-info">
              <span class="sso-mock-name">Simulasi Akun Google Belum Tertaut</span>
              <span class="sso-mock-role">Uji coba alur penautan NIM &amp; Password</span>
            </div>
            <span class="badge-tactical gold">FLOW LINK</span>
          </button>
        </div>
        <button type="button" class="btn-tactical" id="btn-back-to-login" style="margin-top: 0.5rem;">KEMBALI KE FORM LOGIN</button>
      </div>
    `;
    this.openModal();

    modalBody.querySelectorAll('[data-mock-nim]').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.location.href = `/api/auth/sso/google?mock_nim=${encodeURIComponent(btn.dataset.mockNim)}`;
      });
    });

    modalBody.querySelector('[data-mock-unlinked]')?.addEventListener('click', () => {
      window.location.href = '/api/auth/sso/google?mock_unlinked=true';
    });

    modalBody.querySelector('#btn-back-to-login')?.addEventListener('click', () => {
      this.openLoginDialog();
    });
  }

  openLinkAccountDialog(prefill = {}) {
    const modalTitle = document.getElementById('prts-modal-title');
    const modalBody = document.getElementById('prts-modal-content');
    if (!modalTitle || !modalBody) return;

    modalTitle.textContent = 'PRTS ACCESS // TAUTKAN AKUN GOOGLE';
    modalBody.innerHTML = `
      <div class="sso-link-wrapper">
        <div class="sso-link-notice">
          <div class="sso-link-header">
            <span class="section-tag cyan">GOOGLE OAUTH2</span>
            <strong>${escapeHtml(prefill.email || 'Akun Google Terverifikasi')}</strong>
          </div>
          <p>Akun Google Anda berhasil diverifikasi, namun belum terhubung dengan NIM mahasiswa di sistem HMIF UMB PRTS. Masukkan NIM dan password akun HMIF Anda untuk menautkannya secara permanen:</p>
        </div>
        <form id="sso-link-form" novalidate>
          <div class="form-group">
            <label class="form-label" for="link-nim">NIM MAHASISWA</label>
            <input class="form-input" id="link-nim" name="nim" autocomplete="username" autofocus required placeholder="Contoh: 22040101" />
          </div>
          <div class="form-group">
            <label class="form-label" for="link-password">PASSWORD AKUN HMIF</label>
            <input class="form-input" id="link-password" name="password" type="password" autocomplete="current-password" required />
          </div>
          <p id="link-feedback" class="auth-feedback" role="status" aria-live="polite"></p>
          <div style="display:flex; gap:0.75rem; flex-wrap:wrap;">
            <button class="btn-tactical primary" type="submit">TAUTKAN AKUN &amp; MASUK</button>
            <button class="btn-tactical" type="button" id="btn-cancel-link">BATAL</button>
          </div>
        </form>
      </div>
    `;
    this.openModal();

    modalBody.querySelector('#btn-cancel-link')?.addEventListener('click', () => {
      this.openLoginDialog();
    });

    modalBody.querySelector('#sso-link-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const feedback = document.getElementById('link-feedback');
      const submitBtn = form.querySelector('[type="submit"]');
      submitBtn.disabled = true;
      feedback.textContent = 'Menautkan akun ke database PRTS...';

      const nim = form.elements.nim.value.trim();
      const password = form.elements.password.value;

      const result = await this.api.linkSsoAccount({
        nim,
        password,
        email: prefill.email,
        googleId: prefill.googleId
      });

      if (!result.ok) {
        feedback.textContent = result.error || 'Gagal menautkan akun.';
        submitBtn.disabled = false;
        return;
      }

      await this.syncApiData();
      this.closeModal();
      this.openWorkspace('home');
      prtsSound.playAccess();
    });
  }

  openAccountDialog() {
    const user = this.api.currentUser;
    if (!user) return;
    const inWorkspace = !document.getElementById('member-workspace')?.hidden;
    const title = document.getElementById('prts-modal-title');
    const body = inWorkspace
      ? document.getElementById('workspace-content')
      : document.getElementById('prts-modal-content');
    if (!body || (!inWorkspace && !title)) return;

    if (!inWorkspace) title.textContent = 'PRTS ACCESS // PROFIL AKUN';
    const currentAvatar = user.avatar_silhouette || '/assets/silhouette_male.jpg';
    body.innerHTML = `
      <form id="account-profile-form" class="admin-form">
        <label class="form-label" for="account-profile-name">NAMA LENGKAP</label>
        <input class="form-input" id="account-profile-name" name="name" maxlength="120" value="${escapeHtml(user.name)}" required />
        <label class="form-label" for="account-profile-nim">NIM LOGIN</label>
        <input class="form-input" id="account-profile-nim" name="nim" maxlength="32" value="${escapeHtml(user.nim)}" required />
        <label class="form-label" for="account-profile-generation">ANGKATAN</label>
        <input class="form-input" id="account-profile-generation" name="generation" maxlength="16" value="${escapeHtml(user.generation || '')}" />
        <span class="form-label">FOTO PROFIL</span>
        <div class="account-avatar-editor">
          <img id="account-profile-avatar-preview" class="account-avatar-preview" src="${escapeHtml(currentAvatar)}" alt="Pratinjau foto profil ${escapeHtml(user.name)}" />
          <div class="account-avatar-controls">
            <select class="form-select" id="account-profile-avatar" name="avatar" aria-label="Pilih foto profil">
              <option value="/assets/silhouette_male.jpg" ${currentAvatar === '/assets/silhouette_male.jpg' ? 'selected' : ''}>Siluet Pria</option>
              <option value="/assets/silhouette_female.jpg" ${currentAvatar === '/assets/silhouette_female.jpg' ? 'selected' : ''}>Siluet Wanita</option>
              ${currentAvatar !== '/assets/silhouette_male.jpg' && currentAvatar !== '/assets/silhouette_female.jpg' ? `<option value="${escapeHtml(currentAvatar)}" selected>Foto saat ini</option>` : ''}
            </select>
            <input class="account-avatar-file" id="account-profile-avatar-file" name="avatarFile" type="file" accept="image/png,image/jpeg,image/webp" />
            <label class="btn-tactical account-avatar-upload" for="account-profile-avatar-file">UNGGAH FOTO</label>
          </div>
        </div>
        <p class="auth-feedback" role="status" aria-live="polite"></p>
        <button class="btn-tactical primary" type="submit">SIMPAN PROFIL</button>
      </form>
      <p>${escapeHtml(user.role_title)} // ${escapeHtml(user.division)} // CLEARANCE ${escapeHtml(user.clearance_level)}</p>
      <form id="password-change-form" class="admin-form">
        <label class="form-label" for="old-password">PASSWORD SAAT INI</label>
        <input class="form-input" id="old-password" name="old_password" type="password" autocomplete="current-password" required />
        <label class="form-label" for="new-password">PASSWORD BARU (MIN. 12 KARAKTER)</label>
        <input class="form-input" id="new-password" name="new_password" type="password" minlength="12" autocomplete="new-password" required />
        <p class="auth-feedback" role="status"></p>
        <button class="btn-tactical primary" type="submit">GANTI PASSWORD</button>
      </form>
    `;
    if (!inWorkspace) this.openModal();
    const avatarSelect = body.querySelector('#account-profile-avatar');
    const avatarPreview = body.querySelector('#account-profile-avatar-preview');
    avatarSelect.addEventListener('change', () => {
      avatarPreview.src = avatarSelect.value;
    });
    body.querySelector('#account-profile-avatar-file').addEventListener('change', async (event) => {
      const fileInput = event.currentTarget;
      const file = fileInput.files[0];
      if (!file) return;
      const feedback = body.querySelector('#account-profile-form [role="status"]');
      if (file.size > 5 * 1024 * 1024) {
        feedback.textContent = 'FILE MELEBIHI BATAS 5 MB.';
        fileInput.value = '';
        return;
      }
      feedback.textContent = 'MENGUNGGAH FOTO PROFIL...';
      const submitButton = body.querySelector('#account-profile-form [type="submit"]');
      const uploadButton = body.querySelector('.account-avatar-upload');
      fileInput.disabled = true;
      submitButton.disabled = true;
      uploadButton.setAttribute('aria-disabled', 'true');
      const result = await this.api.uploadAccountAvatar(file);
      fileInput.disabled = false;
      submitButton.disabled = false;
      uploadButton.removeAttribute('aria-disabled');
      fileInput.value = '';
      if (!result.ok) {
        feedback.textContent = result.error;
        return;
      }
      const uploadedAvatar = result.data.user.avatar_silhouette;
      if (![...avatarSelect.options].some((option) => option.value === uploadedAvatar)) {
        avatarSelect.add(new Option(file.name, uploadedAvatar));
      }
      avatarSelect.value = uploadedAvatar;
      avatarPreview.src = uploadedAvatar;
      avatarPreview.alt = `Pratinjau foto profil ${result.data.user.name}`;
      this.renderAuthState();
      feedback.textContent = 'FOTO PROFIL BERHASIL DIUNGGAH DAN DISIMPAN.';
    });
    body.querySelector('#account-profile-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const feedback = form.querySelector('[role="status"]');
      const result = await this.api.updateAccountProfile({
        name: form.elements.name.value.trim(),
        nim: form.elements.nim.value.trim(),
        generation: form.elements.generation.value.trim(),
        avatar: form.elements.avatar.value
      });
      if (!result.ok) {
        feedback.textContent = result.error;
        return;
      }
      if (result.data.reauthenticate) {
        this.api.clearSession();
        this.renderAuthState();
        feedback.textContent = 'PROFIL DIPERBARUI. NIM LOGIN BERUBAH; SILAKAN MASUK KEMBALI.';
        return;
      }
      this.api.currentUser = result.data.user;
      this.renderAuthState();
      feedback.textContent = 'PROFIL BERHASIL DIPERBARUI.';
    });
    body.querySelector('#password-change-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const feedback = form.querySelector('[role="status"]');
      const result = await this.api.changePassword(form.elements.old_password.value, form.elements.new_password.value);
      feedback.textContent = result.ok ? 'PASSWORD BERHASIL DIUBAH. SILAKAN MASUK KEMBALI.' : result.error;
      if (result.ok) {
        this.api.clearSession();
        this.renderAuthState();
      }
    });

    // Google SSO Linked Identities Management Section
    const ssoSectionContainer = document.createElement('div');
    ssoSectionContainer.className = 'account-sso-section';
    ssoSectionContainer.innerHTML = `
      <div class="sso-divider" role="separator" aria-label="Autentikasi Eksternal SSO">
        <span>// INTEGRASI GOOGLE SSO //</span>
      </div>
      <div id="account-sso-status-content" style="margin-top: 1rem;">
        <p class="form-hint" style="color: var(--ak-text-dim);">Memeriksa status tautan Google SSO...</p>
      </div>
    `;
    body.appendChild(ssoSectionContainer);

    this.api.getLinkedSso().then(res => {
      const statusContainer = body.querySelector('#account-sso-status-content');
      if (!statusContainer) return;
      if (!res.ok) {
        statusContainer.innerHTML = `<p class="form-hint" style="color: var(--ak-gold);">Gagal memuat status SSO.</p>`;
        return;
      }
      const identities = res.identities || [];
      const googleIdentity = identities.find(i => i.provider === 'google');

      if (googleIdentity) {
        statusContainer.innerHTML = `
          <div class="sso-linked-card" style="display: flex; justify-content: space-between; align-items: center; background: rgba(0, 229, 255, 0.05); border: 1px solid var(--ak-cyan); padding: 0.75rem 1rem;">
            <div>
              <strong style="color: var(--ak-cyan); display: block;">TERTAUT KE GOOGLE</strong>
              <span style="font-size: 0.85rem; color: var(--ak-text);">${escapeHtml(googleIdentity.email)}</span>
              <span style="font-size: 0.75rem; color: var(--ak-text-dim); display: block;">Sejak: ${new Date(googleIdentity.created_at).toLocaleDateString('id-ID')}</span>
            </div>
            <button type="button" id="btn-unlink-google" class="btn-tactical" style="font-size: 0.75rem; padding: 0.35rem 0.75rem; border-color: var(--ak-gold); color: var(--ak-gold);">LEPAS TAUTAN</button>
          </div>
        `;
        statusContainer.querySelector('#btn-unlink-google')?.addEventListener('click', async () => {
          if (!confirm('Apakah Anda yakin ingin melepas tautan akun Google ini?')) return;
          const unlinkRes = await this.api.unlinkSso('google');
          if (unlinkRes.ok) {
            this.openAccountDialog();
          } else {
            alert(unlinkRes.error || 'Gagal melepas tautan.');
          }
        });
      } else {
        statusContainer.innerHTML = `
          <div class="sso-unlinked-card" style="display: flex; justify-content: space-between; align-items: center; background: rgba(255, 255, 255, 0.02); border: 1px dashed var(--ak-border); padding: 0.75rem 1rem;">
            <div>
              <strong style="color: var(--ak-text-dim); display: block;">BELUM DITAUTKAN KE GOOGLE</strong>
              <span style="font-size: 0.85rem; color: var(--ak-text-dim);">Hubungkan akun Google Anda untuk login 1-klik yang aman.</span>
            </div>
            <button type="button" id="btn-link-google-now" class="btn-tactical primary" style="font-size: 0.75rem; padding: 0.35rem 0.75rem;">TAUTKAN SEKARANG</button>
          </div>
        `;
        statusContainer.querySelector('#btn-link-google-now')?.addEventListener('click', () => {
          window.location.href = '/api/auth/sso/google';
        });
      }
    }).catch(err => {
      console.debug('[PRTS SSO] Failed to load linked SSO status:', err);
    });
  }

  // ------------------------------------------------------------------------
  // CLOCK & TELEMETRY
  // ------------------------------------------------------------------------
  initClock() {
    const clockEl = document.getElementById('prts-clock-display');
    const updateTime = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      if (clockEl) {
        clockEl.textContent = `${hours}:${minutes}:${seconds} WIB`;
      }
    };
    updateTime();
    setInterval(updateTime, 1000);
  }

  // ------------------------------------------------------------------------
  // AUDIO & NAVIGATION
  // ------------------------------------------------------------------------
  setupAudioAndNavigation() {
    this.setupSoundtrackPlayer();
    // Audio toggle button
    const soundToggle = document.getElementById('sound-toggle-btn');
    if (soundToggle) {
      soundToggle.addEventListener('click', () => {
        const isEnabled = prtsSound.toggle();
        soundToggle.innerHTML = isEnabled
          ? `<span>🔊</span> AUDIO: ON`
          : `<span>🔇</span> AUDIO: MUTE`;
        soundToggle.setAttribute('aria-pressed', String(isEnabled));
        soundToggle.setAttribute('aria-label', `${isEnabled ? 'Matikan' : 'Nyalakan'} efek suara taktis`);
        if (isEnabled) prtsSound.playClick();
      });
    }

    // Attach sound to all tactical buttons
    document.addEventListener('mouseover', (e) => {
      if (e.target.closest('button, .nav-link, .operator-card, .filter-btn, .cal-cell, .doc-accordion-header, .news-card, .cohort-card, .cohort-social-btn, [data-view-cadets]')) {
        prtsSound.playHover();
      }
    });

    document.addEventListener('click', (e) => {
      if (e.target.closest('button, .nav-link, .filter-btn, .cal-cell, .quiz-option-btn, .cohort-social-btn, [data-view-cadets]')) {
        prtsSound.playClick();
      }
    });

    document.querySelector('.prts-brand')?.addEventListener('click', (event) => {
      event.preventDefault();
      this.switchTab('dashboard');
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && document.querySelector('.app-content.sidebar-open')) this.closeSidebar();
    });

    // Navigation links
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetTab = link.getAttribute('data-tab');
        this.switchTab(targetTab);
        this.closeSidebarOnMobile();
        prtsSound.playAccess();
      });
    });

    document.getElementById('sidebar-toggle-btn')?.addEventListener('click', () => this.toggleSidebar());
    document.getElementById('sidebar-dismiss')?.addEventListener('click', () => this.closeSidebar());
    document.querySelectorAll('[data-directory-tab]').forEach((link) => link.addEventListener('click', (event) => {
      event.preventDefault();
      this.switchTab(link.dataset.directoryTab);
    }));
    document.querySelectorAll('[data-dashboard-route]').forEach((button) => button.addEventListener('click', () => {
      this.switchTab(button.dataset.dashboardRoute);
      this.closeSidebarOnMobile();
    }));
    document.querySelector('#knowledge-search')?.addEventListener('input', () => this.renderKnowledgeResources());
    document.getElementById('tutoring-login-button')?.addEventListener('click', () => document.getElementById('auth-action-btn')?.click());
    document.getElementById('tutoring-request-form')?.addEventListener('submit', (event) => this.submitTutoringRequest(event));
    document.getElementById('tutoring-profile-form')?.addEventListener('submit', (event) => this.saveTutorProfile(event));
    ['knowledge-course-filter', 'knowledge-semester-filter', 'knowledge-lecturer-filter', 'knowledge-kind-filter'].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', () => this.renderKnowledgeResources());
    });
    const handleRouteChange = () => {
      const workspaceRoute = /^#workspace\/([a-z-]+)$/.exec(window.location.hash);
      if (workspaceRoute) {
        if (this.api.isAuthenticated) this.openWorkspace(workspaceRoute[1], { fromHistory: true });
        return;
      }
      if (!document.getElementById('member-workspace')?.hidden) {
        document.getElementById('member-workspace').hidden = true;
        document.querySelector('.app-content').hidden = false;
      }
      const route = this.readRouteFromHash();
      this.switchTab(route.tabId, { departmentId: route.departmentId, divisionId: route.divisionId, fromHistory: true });
    };
    window.addEventListener('hashchange', handleRouteChange);
    window.addEventListener('popstate', handleRouteChange);
    this.renderSidebarDepartments();
    this.syncSidebarState();
    window.addEventListener('resize', () => this.syncSidebarState());

    if (!window.location.hash.startsWith('#workspace/')) {
      const route = this.readRouteFromHash();
      this.switchTab(route.tabId, { departmentId: route.departmentId, divisionId: route.divisionId, replace: true, focus: false, scroll: false });
    }
  }

  async setupSoundtrackPlayer() {
    const player = document.getElementById('soundtrack-player');
    const audio = document.getElementById('soundtrack-audio');
    const trackSelect = document.getElementById('soundtrack-track-select');
    const playButton = document.getElementById('soundtrack-play-toggle');
    const muteButton = document.getElementById('soundtrack-mute-toggle');
    const volumeSlider = document.getElementById('soundtrack-volume');
    const status = document.getElementById('soundtrack-status');
    const hideButton = document.getElementById('soundtrack-hide');
    const reopenButton = document.getElementById('soundtrack-reopen');
    if (!player || !audio || !trackSelect || !playButton || !muteButton || !volumeSlider || !status || !hideButton || !reopenButton) return;

    const storedVolume = Number(getSoundtrackPreference('volume'));
    const volume = Number.isFinite(storedVolume) && storedVolume >= 0 && storedVolume <= 1 ? storedVolume : 0.35;
    const storedMuted = getSoundtrackPreference('muted') === 'true';
    const storedTrack = getSoundtrackPreference('track') || '';
    audio.volume = volume;
    audio.muted = storedMuted;
    volumeSlider.value = String(volume);
    muteButton.setAttribute('aria-pressed', String(storedMuted));
    muteButton.textContent = storedMuted ? 'AKTIFKAN AUDIO' : 'SENYAP';

    const result = await this.api.getSoundtracks();
    if (!result.ok) {
      player.hidden = true;
      console.error('[PRTS SOUNDTRACK] Katalog gagal dimuat:', result.error);
      return;
    }
    const tracks = Array.isArray(result.data?.tracks) ? result.data.tracks : [];
    if (!tracks.length) {
      player.hidden = true;
      reopenButton.hidden = true;
      return;
    }
    const setPlayerVisibility = (visible) => {
      player.hidden = !visible;
      reopenButton.hidden = visible;
      reopenButton.setAttribute('aria-expanded', String(visible));
      setSoundtrackPreference('player-hidden', String(!visible));
    };
    setPlayerVisibility(getSoundtrackPreference('player-hidden') === 'true' ? false : true);
    hideButton.addEventListener('click', () => {
      setPlayerVisibility(false);
      reopenButton.focus();
    });
    reopenButton.addEventListener('click', () => {
      setPlayerVisibility(true);
      hideButton.focus();
    });
    trackSelect.replaceChildren(...tracks.map((track) => new Option(track.title, track.id)));
    trackSelect.value = tracks.some(({ id }) => id === storedTrack) ? storedTrack : tracks[0].id;

    const currentTrack = () => tracks.find(({ id }) => id === trackSelect.value);
    const setTrackSource = () => {
      const track = currentTrack();
      if (!track) return false;
      const source = new URL(track.url, window.location.origin);
      if (audio.src !== source.href) audio.src = source.href;
      setSoundtrackPreference('track', track.id);
      status.textContent = track.title;
      return true;
    };
    const setPlaybackState = () => {
      const playing = !audio.paused;
      playButton.textContent = playing ? 'JEDA' : 'PUTAR';
      playButton.setAttribute('aria-pressed', String(playing));
    };
    trackSelect.addEventListener('change', async () => {
      const resume = !audio.paused;
      audio.pause();
      if (!setTrackSource()) return;
      if (resume) {
        try {
          await audio.play();
        } catch (error) {
          status.textContent = `Pemutaran gagal: ${error.message || 'sumber tidak dapat diakses.'}`;
        }
      }
    });
    playButton.addEventListener('click', async () => {
      if (audio.paused) {
        if (!setTrackSource()) return;
        try {
          await audio.play();
        } catch (error) {
          status.textContent = `Pemutaran gagal: ${error.message || 'sumber tidak dapat diakses.'}`;
        }
      } else {
        audio.pause();
      }
      setPlaybackState();
    });
    muteButton.addEventListener('click', () => {
      audio.muted = !audio.muted;
      setSoundtrackPreference('muted', String(audio.muted));
      muteButton.textContent = audio.muted ? 'AKTIFKAN AUDIO' : 'SENYAP';
      muteButton.setAttribute('aria-pressed', String(audio.muted));
    });
    volumeSlider.addEventListener('input', () => {
      audio.volume = Number(volumeSlider.value);
      setSoundtrackPreference('volume', String(audio.volume));
    });
    audio.addEventListener('play', setPlaybackState);
    audio.addEventListener('pause', setPlaybackState);
    audio.addEventListener('error', () => {
      status.textContent = 'Audio gagal dimuat. Periksa tautan atau format track.';
      setPlaybackState();
    });
    setTrackSource();
    audio.pause();
    setPlaybackState();
  }

  readRouteFromHash() {
    const [rawTabId = '', query = ''] = window.location.hash.slice(1).split('?');
    const tabId = document.getElementById(`section-${rawTabId}`) ? rawTabId : 'dashboard';
    const departmentId = new URLSearchParams(query).get('department') || '';
    const divisionId = new URLSearchParams(query).get('division') || '';
    return { tabId, departmentId, divisionId };
  }

  switchTab(tabId, { departmentId, divisionId = '', fromHistory = false, replace = false, focus = true, scroll = true, restoreOrganizationFocus = false } = {}) {
    let targetTabId = tabId;
    let targetSection = document.getElementById(`section-${targetTabId}`);
    const validDepartmentIds = new Set((HMIF_DATA.departments || []).map((department) => department.id));
    if (targetTabId === 'department' && !validDepartmentIds.has(departmentId)) {
      targetTabId = 'squad';
      targetSection = document.getElementById('section-squad');
      departmentId = '';
      divisionId = '';
    }
    if (!targetSection || targetSection.dataset.siteVisible === 'false') {
      targetTabId = 'dashboard';
      targetSection = document.getElementById('section-dashboard');
    }
    if (!targetSection || targetSection.dataset.siteVisible === 'false') {
      targetSection = [...document.querySelectorAll('.main-content > section')].find((section) => section.dataset.siteVisible !== 'false');
      targetTabId = targetSection?.id.replace(/^section-/, '') || '';
    }
    if (!targetSection) return;

    const previousTab = this.currentTab;
    if (departmentId === undefined) departmentId = targetTabId === 'squad' || targetTabId === 'department' ? this.selectedDepartmentId : '';
    this.selectedDepartmentId = targetTabId === 'department'
      ? validDepartmentIds.has(departmentId) ? departmentId : ''
      : targetTabId === 'squad'
        ? departmentId === 'bph' || validDepartmentIds.has(departmentId) ? departmentId : ''
        : '';
    const selectedDepartment = (HMIF_DATA.departments || []).find((department) => department.id === this.selectedDepartmentId);
    this.selectedDivisionId = selectedDepartment?.divisions?.some((division) => division.id === divisionId) ? divisionId : '';
    this.currentTab = targetTabId;

    const routeQuery = new URLSearchParams();
    if (targetTabId === 'department' && this.selectedDepartmentId) routeQuery.set('department', this.selectedDepartmentId);
    else if (targetTabId === 'squad' && this.selectedDepartmentId) routeQuery.set('department', this.selectedDepartmentId);
    if (this.selectedDivisionId && (targetTabId === 'squad' || targetTabId === 'department')) routeQuery.set('division', this.selectedDivisionId);
    const routeHash = `#${targetTabId}${routeQuery.size ? `?${routeQuery}` : ''}`;
    if (!fromHistory && window.location.hash !== routeHash) {
      if (replace) window.history.replaceState({ tabId: targetTabId }, '', routeHash);
      else window.history.pushState({ tabId: targetTabId }, '', routeHash);
    }

    document.querySelectorAll('.main-content > section').forEach((section) => {
      const isVisible = section === targetSection && section.dataset.siteVisible !== 'false';
      section.hidden = !isVisible;
      section.inert = !isVisible;
      section.setAttribute('aria-hidden', String(!isVisible));
    });

    // Update nav active state
    const activeNavTab = targetTabId === 'department' ? 'squad' : targetTabId;
    document.querySelectorAll('.nav-link').forEach((link) => {
      link.classList.toggle('active', link.getAttribute('data-tab') === activeNavTab);
      if (link.getAttribute('data-tab') === activeNavTab) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });

    if (targetTabId === 'squad') {
      this.currentOperatorFilter = this.selectedDepartmentId || 'all';
      this.renderOperatorFilters(this.currentOperatorFilter);
      this.renderOperators('all');
    }
    if (targetTabId === 'department') this.renderDepartmentPage(this.selectedDepartmentId, this.selectedDivisionId);
    if (targetTabId === 'voting') {
      renderPollList(document.getElementById('poll-list-container'));
    }
    this.renderSidebarDepartments();

    const pageTitle = (targetTabId === 'department' ? document.querySelector('#department-page-content h1')?.textContent.trim() : '')
      || targetSection.querySelector('.section-title')?.textContent.trim()
      || targetSection.querySelector('.hero-title')?.textContent.trim()
      || HMIF_DATA.identity.abbreviation;
    document.title = `${pageTitle} // ${HMIF_DATA.identity.abbreviation}`;

    if (focus) {
      targetSection.setAttribute('tabindex', '-1');
      targetSection.focus({ preventScroll: true });
    }
    if (scroll) window.scrollTo({ top: 0, behavior: focus ? 'smooth' : 'auto' });
    if (scroll && targetTabId === 'squad' && this.selectedDepartmentId && this.selectedDepartmentId !== 'bph') {
      requestAnimationFrame(() => {
        const selectedNode = [...document.querySelectorAll('[data-dept-id]')]
          .find((node) => node.dataset.deptId === this.selectedDepartmentId);
        selectedNode?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
    if (scroll && targetTabId === 'department' && this.selectedDivisionId) {
      requestAnimationFrame(() => document.querySelector(`[data-department-division="${CSS.escape(this.selectedDivisionId)}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
    if (restoreOrganizationFocus && targetTabId === 'squad') {
      const nodes = [...document.querySelectorAll('[data-org-select]')];
      const selectedNode = this.selectedDivisionId
        ? nodes.find((node) => node.dataset.orgSelect === 'division' && node.dataset.divisionId === this.selectedDivisionId)
        : this.selectedDepartmentId === 'bph'
          ? nodes.find((node) => node.dataset.orgSelect === 'bph')
          : nodes.find((node) => node.dataset.orgSelect === 'department' && node.dataset.deptId === this.selectedDepartmentId);
      selectedNode?.focus({ preventScroll: true });
    }
    if (targetTabId !== previousTab) this.closeSidebarOnMobile();
  }

  toggleSidebar() {
    const app = document.querySelector('.app-content');
    const toggle = document.getElementById('sidebar-toggle-btn');
    if (!app || !toggle) return;
    const mobile = window.matchMedia('(max-width: 900px)').matches;
    const className = mobile ? 'sidebar-open' : 'sidebar-collapsed';
    const isOpen = app.classList.toggle(className);
    this.syncSidebarState();
    if (isOpen && mobile) document.querySelector('#prts-sidebar .nav-link:not([hidden])')?.focus();
    else if (mobile) toggle.focus();
  }

  closeSidebar({ restoreFocus = true } = {}) {
    const app = document.querySelector('.app-content');
    const toggle = document.getElementById('sidebar-toggle-btn');
    app?.classList.remove('sidebar-open');
    this.syncSidebarState();
    if (restoreFocus) toggle?.focus();
  }

  closeSidebarOnMobile() {
    if (window.matchMedia('(max-width: 900px)').matches) this.closeSidebar({ restoreFocus: false });
  }

  syncSidebarState() {
    const app = document.querySelector('.app-content');
    const sidebar = document.getElementById('prts-sidebar');
    const toggle = document.getElementById('sidebar-toggle-btn');
    const dismiss = document.getElementById('sidebar-dismiss');
    if (!app || !sidebar || !toggle) return;
    const mobile = window.matchMedia('(max-width: 900px)').matches;
    if (mobile) app.classList.remove('sidebar-collapsed');
    else app.classList.remove('sidebar-open');
    const expanded = mobile ? app.classList.contains('sidebar-open') : !app.classList.contains('sidebar-collapsed');
    sidebar.inert = !expanded;
    sidebar.setAttribute('aria-hidden', String(!expanded));
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.setAttribute('aria-label', expanded ? 'Tutup navigasi' : 'Buka navigasi');
    toggle.title = expanded ? 'Tutup navigasi' : 'Buka navigasi';
    if (dismiss) dismiss.hidden = !mobile || !expanded;
  }

  renderSidebarDepartments() {
    const container = document.getElementById('sidebar-departments');
    const departments = [...(HMIF_DATA.departments || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
    const divisionLinks = [
      { id: 'bph', label: 'BPH / PIMPINAN INTI' },
      ...departments.map((department) => ({ id: department.id, label: `${department.code} · ${department.name}` }))
    ];
    if (container) {
      container.innerHTML = divisionLinks.map(({ id, label }) => {
        const selected = (this.currentTab === 'squad' || this.currentTab === 'department')
          && (this.selectedDepartmentId === id || (id === 'bph' && !this.selectedDepartmentId && !this.selectedDivisionId));
        return `<button class="sidebar-dept-link ${selected ? 'active' : ''}" type="button" data-directory-filter="${escapeHtml(id)}" ${selected ? 'aria-current="location"' : ''}>${escapeHtml(label)}</button>`;
      }).join('');
    }
    const footerList = document.getElementById('footer-department-links');
    if (footerList) {
      footerList.innerHTML = divisionLinks.map(({ id, label }) => `<li><a href="${id === 'bph' ? '#squad' : `#department?department=${encodeURIComponent(id)}`}" data-directory-filter="${escapeHtml(id)}">&gt; ${escapeHtml(label)}</a></li>`).join('');
    }
    document.querySelectorAll('[data-directory-filter]').forEach((link) => link.addEventListener('click', (event) => {
      event.preventDefault();
      const filter = link.dataset.directoryFilter;
      if (filter === 'bph') this.switchTab('squad', { departmentId: 'bph' });
      else this.switchTab('department', { departmentId: filter });
      this.closeSidebarOnMobile();
    }));
  }

  // ------------------------------------------------------------------------
  // HERO & VISI MISI
  // ------------------------------------------------------------------------
  renderHeroAndVisiMisi() {
    const { identity, visionMission } = HMIF_DATA;

    // Update Sambutan Kahim preview
    const sambutanText = document.getElementById('sambutan-quote-text');
    if (sambutanText) {
      sambutanText.textContent = `"${visionMission.sambutanKahim.quote}"`;
    }

    // Visi text
    const visiEl = document.getElementById('visi-content-text');
    if (visiEl) {
      visiEl.textContent = visionMission.vision;
    }

    // Misi list
    const misiListEl = document.getElementById('misi-content-list');
    if (misiListEl) {
      misiListEl.innerHTML = visionMission.mission
        .map((m, idx) => `
          <li class="misi-item">
            <span class="misi-num">${idx + 1}</span>
            <span>${escapeHtml(m)}</span>
          </li>
        `)
        .join('');
    }
    this.renderDashboardOverview();
  }

  renderDashboardOverview() {
    const container = document.getElementById('dashboard-agenda-list');
    if (!container) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming = (HMIF_DATA.calendarSchedule || [])
      .map((event) => ({ ...event, parsedDate: new Date(`${event.date}T00:00:00`) }))
      .filter((event) => !Number.isNaN(event.parsedDate.getTime()) && event.parsedDate >= today)
      .sort((first, second) => first.parsedDate - second.parsedDate)
      .slice(0, 3);

    container.innerHTML = upcoming.length
      ? upcoming.map((event) => `
        <article class="dashboard-agenda-item">
          <time datetime="${escapeHtml(event.date)}">${escapeHtml(event.parsedDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }))}</time>
          <div><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(event.division || event.type || 'Agenda HMIF')}</span></div>
        </article>
      `).join('')
      : '<p class="dashboard-agenda-empty">Belum ada agenda mendatang.</p>';

    const deadlineContainer = document.getElementById('dashboard-deadline-list');
    if (!deadlineContainer) return;
    const deadlineLimit = new Date(today);
    deadlineLimit.setDate(deadlineLimit.getDate() + 14);
    const eventDeadlines = (HMIF_DATA.calendarSchedule || [])
      .map((event) => ({
        type: event.type || 'event',
        title: event.title,
        date: event.date,
        detail: event.registration_open ? 'Pendaftaran event' : event.type === 'beasiswa' ? 'Tenggat beasiswa' : event.type === 'kompetisi' ? 'Tenggat kompetisi' : 'Agenda kegiatan',
        url: event.registration_url
      }));
    const jobDeadlines = this.publicOpportunities.map((job) => ({
      type: 'job',
      title: job.title,
      date: job.deadline,
      detail: `${job.employer} // ${job.work_type}`,
      url: job.url
    }));
    const deadlines = [...eventDeadlines, ...jobDeadlines]
      .map((entry) => ({ ...entry, parsedDate: new Date(`${entry.date}T00:00:00`) }))
      .filter((entry) => !Number.isNaN(entry.parsedDate.getTime()) && entry.parsedDate >= today && entry.parsedDate <= deadlineLimit)
      .sort((first, second) => first.parsedDate - second.parsedDate)
      .slice(0, 6);
    deadlineContainer.innerHTML = deadlines.length ? deadlines.map((entry) => `
      <article class="dashboard-agenda-item">
        <time datetime="${escapeHtml(entry.date)}">${escapeHtml(entry.parsedDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }))}</time>
        <div><strong>${escapeHtml(entry.title)}</strong><span>${escapeHtml(entry.detail)}</span></div>
        ${entry.url ? `<a class="dashboard-link" href="${escapeHtml(entry.url)}" target="_blank" rel="noopener noreferrer" aria-label="Buka ${escapeHtml(entry.title)}">↗</a>` : ''}
      </article>
    `).join('') : '<p class="dashboard-agenda-empty">Tidak ada agenda atau tenggat dalam 14 hari ke depan.</p>';
  }

  renderKnowledgeResources() {
    const container = document.getElementById('knowledge-resources-grid');
    if (!container) return;
    const curatedResources = (this.academicResources || []).map((resource) => ({
      ...resource,
      examType: resource.exam_type,
      academicYear: resource.academic_year,
      fileId: resource.file_id,
      demoFixture: false
    }));
    const curatedIds = new Set(curatedResources.map(({ id }) => id));
    const demoResources = (HMIF_DATA.knowledgeResources || [])
      .filter((resource) => resource.published !== false && !curatedIds.has(resource.id))
      .map((resource) => ({ ...resource, demoFixture: true }));
    const resources = [...curatedResources, ...demoResources];
    const search = document.getElementById('knowledge-search');
    const courseFilter = document.getElementById('knowledge-course-filter');
    const semesterFilter = document.getElementById('knowledge-semester-filter');
    const lecturerFilter = document.getElementById('knowledge-lecturer-filter');
    const kindFilter = document.getElementById('knowledge-kind-filter');
    const refillOptions = (select, values, label) => {
      if (!select) return;
      const previousValue = select.value || 'all';
      select.innerHTML = `<option value="all">${label}</option>${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('')}`;
      select.value = values.includes(previousValue) ? previousValue : 'all';
    };
    refillOptions(courseFilter, [...new Set(resources.map((resource) => resource.course).filter(Boolean))].sort((a, b) => a.localeCompare(b)), 'Semua mata kuliah');
    refillOptions(semesterFilter, [...new Set(resources.map((resource) => resource.semester).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id', { numeric: true })), 'Semua semester');
    refillOptions(lecturerFilter, getKnowledgeLecturers(resources), 'Semua dosen');
    const matches = filterKnowledgeResources(resources, {
      query: search?.value,
      course: courseFilter?.value,
      semester: semesterFilter?.value,
      lecturer: lecturerFilter?.value,
      kind: kindFilter?.value
    });
    const labels = {
      exam: 'BANK SOAL', module: 'MODUL', cheatsheet: 'CHEAT SHEET',
      reference: 'DOKUMENTASI', learning_path: 'LEARNING PATH', project: 'REPOSITORI', faq: 'FAQ MAHASISWA'
    };
    const count = document.getElementById('knowledge-result-count');
    if (count) count.textContent = `${matches.length} REFERENSI // ${resources.length} TERSEDIA`;
    container.innerHTML = matches.length
      ? matches.map((resource) => `
        <article class="knowledge-resource-card">
          <div class="knowledge-resource-meta"><span>${escapeHtml(resource.examType || labels[resource.kind] || 'REFERENSI')}</span><span>${resource.demoFixture ? 'FIXTURE DEMO' : 'TERKURASI'} · SEMESTER ${escapeHtml(resource.semester || 'Semua')}</span></div>
          ${resource.kind === 'faq'
          ? `<details class="student-faq-item"><summary>${escapeHtml(resource.title)}</summary><div class="knowledge-resource-summary">${escapeHtml(resource.summary).replace(/\r?\n/g, '<br>')}</div><small>${escapeHtml(resource.course || 'Prosedur kampus')} // Panduan terkurasi</small></details>`
          : `<h3>${escapeHtml(resource.title)}</h3><p class="knowledge-resource-course">${escapeHtml(resource.course || 'Umum')}${resource.lecturer ? ` // Dosen: ${escapeHtml(resource.lecturer)}` : ''}${resource.academicYear ? ` // ${escapeHtml(resource.academicYear)}` : ''}</p><p class="knowledge-resource-summary">${escapeHtml(resource.summary || '')}</p>`}
          <div class="knowledge-resource-tags">${(resource.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>
          ${resource.kind === 'faq' ? '' : `<a class="knowledge-resource-link" href="${resource.fileId ? `/api/knowledge/files/${encodeURIComponent(resource.fileId)}` : escapeHtml(resource.url)}" ${resource.fileId ? 'download' : 'target="_blank" rel="noopener noreferrer"'}>${resource.fileId ? 'UNDUH MATERI PDF' : 'BUKA REFERENSI'} <span aria-hidden="true">↗</span></a>`}
          ${resource.kind === 'exam' ? `
            <button class="btn-tactical knowledge-discussion-toggle" type="button" data-knowledge-discussion="${escapeHtml(resource.id)}" aria-expanded="false">DISKUSI SOAL</button>
            <section class="knowledge-discussion-panel" data-knowledge-discussion-panel hidden aria-label="Diskusi ${escapeHtml(resource.title)}">
              <div data-knowledge-discussion-posts></div>
              ${this.api.isAuthenticated
            ? `<form data-knowledge-discussion-form><input type="hidden" name="parent_id" /><label class="form-group"><span class="form-label">JENIS KONTRIBUSI</span><select class="form-select" name="solution_type"><option value="discussion">Diskusi</option><option value="question">Pertanyaan</option><option value="answer">Jawaban</option><option value="alternative">Alternatif algoritma</option></select></label><label class="form-group"><span class="form-label">TAMBAH PEMBAHASAN</span><textarea class="form-textarea" name="message" maxlength="3000" required></textarea></label><button class="btn-tactical" type="submit">KIRIM UNTUK MODERASI</button><p class="auth-feedback" data-discussion-feedback role="status"></p></form>`
            : '<p>Masuk dengan akun anggota untuk mengirim pembahasan. Komentar baru ditinjau sebelum tampil.</p>'}
            </section>` : ''}
        </article>
      `).join('')
      : `<p class="knowledge-empty-state">${kindFilter?.value === 'exam' ? 'Belum ada bank soal yang dikurasi.' : kindFilter?.value === 'faq' ? 'Belum ada FAQ administrasi yang dikurasi pengelola.' : 'Tidak ada referensi yang cocok dengan filter ini.'}</p>`;
    container.querySelectorAll('[data-knowledge-discussion]').forEach((button) => button.addEventListener('click', async () => {
      const panel = button.nextElementSibling;
      const isOpening = panel.hidden;
      panel.hidden = !isOpening;
      button.setAttribute('aria-expanded', String(isOpening));
      if (isOpening) await this.loadKnowledgeDiscussion(button.dataset.knowledgeDiscussion, panel);
    }));
    this.renderAcademicLearningPaths();
  }

  renderAcademicLearningPaths() {
    const container = document.getElementById('academic-learning-paths');
    if (!container) return;
    const paths = this.academicLearningPaths || [];
    const resourcesById = new Map((this.academicResources || []).map((resource) => [resource.id, resource]));
    container.innerHTML = paths.length ? paths.map((path) => `
      <article class="academic-learning-path">
        <header><span class="section-tag gold">${escapeHtml(path.track)}</span><h3>${escapeHtml(path.title)}</h3><p>${escapeHtml(path.summary || '')}</p></header>
        <ol>${(path.milestones || []).map((milestone) => `
          <li><strong>${escapeHtml(milestone.title)}</strong>${milestone.description ? `<p>${escapeHtml(milestone.description)}</p>` : ''}
            <div>${(milestone.resource_ids || []).map((id) => {
      const resource = resourcesById.get(id);
      if (!resource) return '';
      const href = resource.file_id ? `/api/knowledge/files/${encodeURIComponent(resource.file_id)}` : resource.url;
      return href ? `<a href="${escapeHtml(href)}" ${resource.file_id ? 'download' : 'target="_blank" rel="noopener noreferrer"'}>${escapeHtml(resource.title)} ↗</a>` : `<span>${escapeHtml(resource.title)}</span>`;
    }).join('')}</div>
            ${milestone.prerequisite_ids?.length ? `<small>Prasyarat: ${milestone.prerequisite_ids.map(escapeHtml).join(', ')}</small>` : ''}
          </li>`).join('')}</ol>
      </article>`).join('') : '<p class="knowledge-empty-state">Belum ada learning path yang dipublikasikan.</p>';
  }

  async syncPortalRecords() {
    const requests = [
      this.api.getShowcaseProjects(),
      this.api.getCareerDirectory(),
      this.api.getTechArticles(),
      this.api.getProjectCalls()
    ];
    if (this.api.isAuthenticated) requests.push(
      this.api.getMyPortalRecords(),
      this.api.getMyTechArticles(),
      this.api.getMyProjectCalls(),
      this.api.getMyCareerMentorshipRequests()
    );
    const results = await Promise.all(requests);
    const [projectsResult, careerResult, articlesResult, callsResult] = results;
    const [mineResult, mineArticlesResult, mineCallsResult, mentorshipResult] = this.api.isAuthenticated ? results.slice(4) : [null, null, null, null];
    this.myPortalRecords = mineResult?.ok && Array.isArray(mineResult.data?.records) ? mineResult.data.records : [];
    this.portalSubmissionError = mineResult && !mineResult.ok ? mineResult.error : '';
    this.myTechArticles = mineArticlesResult?.ok && Array.isArray(mineArticlesResult.data?.articles) ? mineArticlesResult.data.articles : [];
    this.myProjectCalls = mineCallsResult?.ok && Array.isArray(mineCallsResult.data?.calls) ? mineCallsResult.data.calls : [];
    this.myProjectCallApplications = mineCallsResult?.ok && Array.isArray(mineCallsResult.data?.applications) ? mineCallsResult.data.applications : [];
    this.myCareerMentorshipRequests = mentorshipResult?.ok && Array.isArray(mentorshipResult.data?.requests) ? mentorshipResult.data.requests : [];
    const projectList = document.getElementById('showcase-projects');
    if (projectList) {
      projectList.innerHTML = projectsResult.ok
        ? (projectsResult.data.projects || []).map((project) => `
          <article class="portal-record">
            <div class="knowledge-resource-meta"><span>${escapeHtml(project.category)}</span><span>${escapeHtml(project.author)}</span></div>
            <span class="section-tag gold">${escapeHtml(project.project_type || 'Proyek mahasiswa')}</span>
            <h3>${escapeHtml(project.title)}</h3>
            <p>${escapeHtml(project.description)}</p>
            <div class="knowledge-resource-tags">${(project.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>
            <div class="portal-record-links">
              ${project.repo_url ? `<a class="btn-tactical" href="${escapeHtml(project.repo_url)}" target="_blank" rel="noopener noreferrer">REPOSITORI</a>` : ''}
              ${project.demo_url ? `<a class="btn-tactical primary" href="${escapeHtml(project.demo_url)}" target="_blank" rel="noopener noreferrer">LIVE DEMO</a>` : ''}
              ${project.repo_url?.startsWith('https://github.com/') ? `<button class="btn-tactical" type="button" data-github-stats="${escapeHtml(project.id)}">STATISTIK GITHUB</button>` : ''}
            </div>
            ${project.video_embed_url ? `<div class="showcase-video"><iframe src="${escapeHtml(project.video_embed_url)}" title="Video showcase ${escapeHtml(project.title)}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>` : ''}
            <div class="showcase-github-stats" data-github-stats-result="${escapeHtml(project.id)}" role="status"></div>
          </article>`).join('') || '<p>Belum ada karya yang dipublikasikan.</p>'
        : `<p class="auth-feedback" role="status">${escapeHtml(projectsResult.error)}</p>`;
    }
    if (projectList) {
      this.renderPortalSubmissionSection('project', projectList);
      projectList.querySelectorAll('[data-github-stats]').forEach((button) => button.addEventListener('click', async () => {
        const target = projectList.querySelector(`[data-github-stats-result="${button.dataset.githubStats}"]`);
        target.textContent = 'Memuat statistik GitHub...';
        const stats = await this.api.getGithubProjectStats(button.dataset.githubStats);
        if (!stats.ok) {
          target.textContent = stats.error;
          return;
        }
        target.innerHTML = `<p>${escapeHtml(stats.data.repository)} // ${escapeHtml(stats.data.language || 'Bahasa belum terdeteksi')} // ${stats.data.stars} stars // ${stats.data.forks} forks // ${stats.data.open_issues} issue terbuka</p>
          <h4>Commit terbaru</h4><ol>${stats.data.commits.map((commit) => `<li><strong>${escapeHtml(commit.message)}</strong><small>${escapeHtml(commit.author)} · ${escapeHtml(commit.date ? new Date(commit.date).toLocaleDateString('id-ID') : '')}</small></li>`).join('') || '<li>Belum ada commit publik.</li>'}</ol>`;
      }));
    }
    const articleList = document.getElementById('tech-articles');
    this.renderTechArticles(articleList, articlesResult);
    const projectCallList = document.getElementById('project-call-board');
    this.renderProjectCalls(projectCallList, callsResult);
    const alumniList = document.getElementById('alumni-directory');
    const opportunitiesList = document.getElementById('career-opportunities');
    if (careerResult.ok) {
      const alumni = careerResult.data.alumni || [];
      const opportunities = careerResult.data.opportunities || [];
      this.careerAlumni = alumni;
      this.careerOpportunities = opportunities;
      this.publicOpportunities = opportunities;
      this.renderDashboardOverview();
      this.renderAlumniDistribution(document.getElementById('alumni-distribution-map'), careerResult.data.alumni_distribution || {});
      if (alumniList) this.renderCareerAlumni(alumniList);
      if (opportunitiesList) this.renderCareerOpportunities(opportunitiesList, opportunities);
      const specializationFilter = document.getElementById('career-specialization-filter');
      if (specializationFilter) specializationFilter.onchange = async () => {
        const filterFeedback = document.getElementById('career-filter-feedback');
        filterFeedback.textContent = 'Memuat lowongan...';
        const filtered = await this.api.getCareerDirectory(specializationFilter.value);
        if (!filtered.ok) {
          filterFeedback.textContent = filtered.error;
          return;
        }
        filterFeedback.textContent = specializationFilter.value ? `${filtered.data.opportunities.length} lowongan cocok.` : '';
        this.renderCareerOpportunities(opportunitiesList, filtered.data.opportunities || []);
      };
    } else {
      if (alumniList) alumniList.innerHTML = `<p class="auth-feedback" role="status">${escapeHtml(careerResult.error)}</p>`;
      if (opportunitiesList) opportunitiesList.innerHTML = '';
    }
    if (alumniList) this.renderPortalSubmissionSection('alumni', alumniList);
    if (opportunitiesList) this.renderPortalSubmissionSection('job', opportunitiesList);
    this.renderCareerMentorshipRequests(document.getElementById('career-mentorship-requests'));
  }

  renderAlumniDistribution(container, distribution) {
    if (!container) return;
    const regions = Object.entries(distribution).sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]));
    const maximum = Math.max(1, ...regions.map(([, count]) => count));
    container.innerHTML = regions.length ? regions.map(([province, count]) => `
      <button class="alumni-distribution-region" type="button" data-alumni-province="${escapeHtml(province)}" aria-label="Filter alumni di ${escapeHtml(province)}, ${count} orang">
        <span>${escapeHtml(province)}</span><strong>${count}</strong>
        <span class="alumni-distribution-track" aria-hidden="true"><span style="width:${Math.round(count / maximum * 100)}%"></span></span>
      </button>`).join('') : '<p>Belum ada data provinsi yang dicantumkan alumni.</p>';
    container.querySelectorAll('[data-alumni-province]').forEach((button) => button.addEventListener('click', () => {
      const province = button.dataset.alumniProvince;
      const filtered = this.careerAlumni.filter((person) => (person.province || 'Belum dicantumkan') === province);
      this.renderCareerAlumni(document.getElementById('alumni-directory'), filtered);
      this.renderPortalSubmissionSection('alumni', document.getElementById('alumni-directory'));
      container.querySelectorAll('[data-alumni-province]').forEach((region) => region.setAttribute('aria-pressed', String(region === button)));
    }));
  }

  renderCareerAlumni(container, alumni = this.careerAlumni || []) {
    if (!container) return;
    container.innerHTML = alumni.length ? alumni.map((person) => `
      <article class="portal-record career-alumni-card" data-career-alumni="${escapeHtml(person.id)}">
        <span class="section-tag gold">ANGKATAN ${escapeHtml(person.graduation_year)}</span>
        <h3>${escapeHtml(person.name)}</h3>
        <p>${escapeHtml(person.position)} // ${escapeHtml(person.company)}</p>
        <p>${escapeHtml(person.specialization)}${person.city || person.province ? ` // ${escapeHtml([person.city, person.province].filter(Boolean).join(', '))}` : person.location ? ` // ${escapeHtml(person.location)}` : ''}</p>
        <div class="career-availability-tags">
          ${person.mentorship_available ? '<span class="career-mentor-badge">MENTOR</span>' : ''}
          ${person.speaker_available ? '<span>PEMBICARA</span>' : ''}
          ${person.referral_available ? '<span>REFERRAL</span>' : ''}
        </div>
        ${person.profile_url ? `<p><a href="${escapeHtml(person.profile_url)}" target="_blank" rel="noopener noreferrer">PROFIL PROFESIONAL ↗</a></p>` : ''}
        ${person.mentorship_available ? this.api.isAuthenticated ? `
          <form class="admin-form career-mentorship-request-form" data-career-mentorship-request="${escapeHtml(person.id)}">
            <label class="form-group"><span class="form-label">JENIS SESI</span><select class="form-select" name="session_type"><option value="technical_interview">Simulasi technical interview</option><option value="cv_review">Review CV / LinkedIn</option><option value="code_review">Code review</option></select></label>
            <label class="form-group"><span class="form-label">WAKTU YANG DIUSULKAN</span><input class="form-input" type="datetime-local" name="preferred_at" min="${getLocalDateTimeInputValue(new Date(Date.now() + 60 * 60 * 1000))}" required /></label>
            <label class="form-group"><span class="form-label">MODE</span><select class="form-select" name="preferred_mode"><option value="online">Online</option><option value="offline">Tatap muka</option></select></label>
            <label class="form-group"><span class="form-label">TUJUAN SESI</span><textarea class="form-textarea" name="topic" maxlength="800" required></textarea></label>
            <p class="auth-feedback" role="status"></p>
            <button class="btn-tactical primary" type="submit">MINTA SESI 30 MENIT</button>
          </form>
        ` : '<button class="btn-tactical" type="button" data-career-login>MASUK UNTUK MINTA MENTORSHIP</button>' : ''}
      </article>`).join('') : '<p>Tidak ada profil alumni pada filter lokasi ini.</p>';
    container.querySelectorAll('[data-career-login]').forEach((button) => button.addEventListener('click', () => document.getElementById('auth-action-btn')?.click()));
    container.querySelectorAll('[data-career-mentorship-request]').forEach((form) => form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const result = await this.api.requestCareerMentorship(form.dataset.careerMentorshipRequest, {
        session_type: form.elements.session_type.value,
        preferred_at: new Date(form.elements.preferred_at.value).toISOString(),
        preferred_mode: form.elements.preferred_mode.value,
        topic: form.elements.topic.value.trim()
      });
      if (!result.ok) {
        form.querySelector('[role="status"]').textContent = result.error;
        return;
      }
      await this.syncPortalRecords();
    }));
  }

  renderCareerOpportunities(container, opportunities) {
    if (!container) return;
    container.innerHTML = opportunities.length ? opportunities.map((job) => {
      const expired = job.deadline < getJakartaCalendarDate();
      return `<article class="portal-record">
        <span class="section-tag ${expired ? '' : 'gold'}">${expired ? 'TENGGAT BERAKHIR' : escapeHtml(job.work_type)}</span>
        <h3>${escapeHtml(job.title)}</h3>
        <p>${escapeHtml(job.employer)} // ${escapeHtml(job.specialization)}</p>
        <p>${escapeHtml(job.location)} // Tenggat ${escapeHtml(new Date(`${job.deadline}T00:00:00`).toLocaleDateString('id-ID'))}</p>
        <div class="knowledge-resource-tags">${(job.specializations || []).map((specialization) => `<span>${escapeHtml(specialization)}</span>`).join('')}</div>
        ${expired ? '' : `<a class="btn-tactical primary" href="${escapeHtml(job.url)}" target="_blank" rel="noopener noreferrer">DETAIL LOWONGAN ↗</a>`}
      </article>`;
    }).join('') : '<p>Tidak ada lowongan yang cocok dengan filter ini.</p>';
  }

  renderCareerMentorshipRequests(container) {
    if (!container) return;
    const requests = this.myCareerMentorshipRequests || [];
    const labels = {
      technical_interview: 'Simulasi technical interview',
      cv_review: 'Review CV / LinkedIn',
      code_review: 'Code review'
    };
    container.innerHTML = requests.length ? requests.map((request) => {
      const isMentor = request.is_mentor === true;
      return `
        <article class="career-mentorship-request" data-career-mentorship-session="${escapeHtml(request.id)}">
          <div><strong>${escapeHtml(labels[request.session_type] || request.session_type)} // ${escapeHtml(isMentor ? request.student_name : request.mentor_name)}</strong>
            <p>${escapeHtml(request.topic)}</p>
            <small>${escapeHtml(new Date(request.preferred_at).toLocaleString('id-ID'))} // ${escapeHtml(request.preferred_mode)} // ${escapeHtml(request.status)}</small>
            ${request.meeting_url ? `<p><a href="${escapeHtml(request.meeting_url)}" target="_blank" rel="noopener noreferrer">BUKA SESI ONLINE ↗</a></p>` : ''}
            ${request.meeting_location ? `<p>${escapeHtml(request.meeting_location)}</p>` : ''}
          </div>
          ${isMentor && request.status === 'requested' ? `
            <form class="career-mentorship-confirm-form" data-career-mentorship-confirm="${escapeHtml(request.id)}">
              <label class="form-group"><span class="form-label">MODE SESI</span><select class="form-select" name="meeting_mode"><option value="${escapeHtml(request.preferred_mode)}">${request.preferred_mode === 'online' ? 'Online' : 'Tatap muka'}</option><option value="${request.preferred_mode === 'online' ? 'offline' : 'online'}">${request.preferred_mode === 'online' ? 'Tatap muka' : 'Online'}</option></select></label>
              <label class="form-group" data-career-online-field><span class="form-label">TAUTAN HTTPS</span><input class="form-input" name="meeting_url" type="url" maxlength="2000" /></label>
              <label class="form-group" data-career-offline-field hidden><span class="form-label">LOKASI</span><input class="form-input" name="meeting_location" maxlength="240" /></label>
              <label class="form-group"><span class="form-label">CATATAN</span><input class="form-input" name="mentor_note" maxlength="1000" /></label>
              <p class="auth-feedback" role="status"></p>
              <button class="btn-tactical primary" type="submit">KONFIRMASI SESI</button>
              <button class="btn-tactical" type="button" data-career-mentorship-decline="${escapeHtml(request.id)}">TOLAK</button>
            </form>` : ''}
          ${isMentor && request.status === 'confirmed' ? `<button class="btn-tactical primary" type="button" data-career-mentorship-complete="${escapeHtml(request.id)}">TANDAI SELESAI</button>` : ''}
        </article>`;
    }).join('') : this.api.isAuthenticated
      ? '<p>Belum ada sesi mentorship yang terkait dengan akun Anda.</p>'
      : '<p>Masuk untuk meminta sesi mentor atau melihat booking yang terkait dengan akun Anda.</p>';
    container.querySelectorAll('[data-career-mentorship-confirm]').forEach((form) => {
      const mode = form.elements.meeting_mode;
      const updateMode = () => {
        const online = mode.value === 'online';
        form.querySelector('[data-career-online-field]').hidden = !online;
        form.querySelector('[data-career-offline-field]').hidden = online;
        form.elements.meeting_url.required = online;
        form.elements.meeting_location.required = !online;
      };
      mode.addEventListener('change', updateMode);
      updateMode();
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const result = await this.api.updateCareerMentorshipRequest(form.dataset.careerMentorshipConfirm, {
          status: 'confirmed',
          meeting_mode: mode.value,
          meeting_url: form.elements.meeting_url.value.trim(),
          meeting_location: form.elements.meeting_location.value.trim(),
          mentor_note: form.elements.mentor_note.value.trim()
        });
        if (!result.ok) form.querySelector('[role="status"]').textContent = result.error;
        else await this.syncPortalRecords();
      });
    });
    container.querySelectorAll('[data-career-mentorship-decline]').forEach((button) => button.addEventListener('click', async () => {
      const result = await this.api.updateCareerMentorshipRequest(button.dataset.careerMentorshipDecline, { status: 'declined' });
      if (!result.ok) button.closest('[data-career-mentorship-session]').querySelector('[role="status"]').textContent = result.error;
      else await this.syncPortalRecords();
    }));
    container.querySelectorAll('[data-career-mentorship-complete]').forEach((button) => button.addEventListener('click', async () => {
      const result = await this.api.updateCareerMentorshipRequest(button.dataset.careerMentorshipComplete, { status: 'completed' });
      if (!result.ok) return;
      await this.syncPortalRecords();
    }));
  }

  renderTechArticles(container, result) {
    if (!container) return;
    const articles = result?.ok && Array.isArray(result.data?.articles) ? result.data.articles : [];
    const statusLabels = { pending_review: 'Menunggu peer review', needs_revision: 'Perlu revisi', published: 'Terbit', rejected: 'Ditolak' };
    container.innerHTML = articles.length ? articles.map((article) => `
      <article class="portal-record tech-article-card">
        <div class="knowledge-resource-meta"><span>${escapeHtml(article.payload.category)}</span><span>${escapeHtml(article.author_name)}</span></div>
        <h3>${escapeHtml(article.payload.title)}</h3>
        <p>${escapeHtml(article.payload.summary)}</p>
        <div class="knowledge-resource-tags">${(article.payload.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>
        <details><summary>BACA ARTIKEL</summary><div class="tech-article-body">${escapeHtml(article.payload.body).replace(/\r?\n/g, '<br>')}</div></details>
        ${article.payload.source_url ? `<a href="${escapeHtml(article.payload.source_url)}" target="_blank" rel="noopener noreferrer">REFERENSI EKSTERNAL ↗</a>` : ''}
      </article>`).join('') : result?.ok
      ? '<p>Belum ada artikel teknis yang lolos peer review.</p>'
      : `<p class="auth-feedback" role="status">${escapeHtml(result?.error || 'Artikel belum dapat dimuat.')}</p>`;

    const ownedArticles = this.myTechArticles || [];
    const submissions = document.createElement('section');
    submissions.className = 'portfolio-submission-section';
    submissions.innerHTML = `
      <h4>KIRIM ARTIKEL UNTUK PEER REVIEW</h4>
      ${this.api.isAuthenticated ? `
        <div class="admin-record-list">${ownedArticles.map((article) => `
          <article class="admin-record-row"><span><strong>${escapeHtml(article.payload.title)}</strong><small>${escapeHtml(statusLabels[article.status] || article.status)}${article.review_note ? ` // Catatan: ${escapeHtml(article.review_note)}` : ''}</small></span>
            ${article.status === 'needs_revision' ? `<button class="btn-tactical" type="button" data-edit-tech-article="${escapeHtml(article.id)}">EDIT REVISI</button>` : ''}
          </article>
        `).join('') || '<p>Artikel yang Anda kirim akan muncul di sini.</p>'}</div>
        <form class="admin-form" data-tech-article-submit>
          <input type="hidden" name="article_id" />
          <h4 data-tech-article-form-title>ARTIKEL BARU</h4>
          <div class="admin-form-grid">
            <label class="form-group"><span class="form-label">JUDUL</span><input class="form-input" name="title" maxlength="160" required /></label>
            <label class="form-group"><span class="form-label">BIDANG</span><input class="form-input" name="category" maxlength="80" placeholder="Arsitektur, keamanan, Edge AI" required /></label>
            <label class="form-group"><span class="form-label">TAG (PISAH KOMA)</span><input class="form-input" name="tags" maxlength="320" /></label>
            <label class="form-group"><span class="form-label">REFERENSI HTTPS (OPSIONAL)</span><input class="form-input" name="source_url" type="url" maxlength="2000" /></label>
          </div>
          <label class="form-group"><span class="form-label">RINGKASAN</span><textarea class="form-textarea" name="summary" maxlength="500" required></textarea></label>
          <label class="form-group"><span class="form-label">ISI ARTIKEL // MIN. 300 KARAKTER</span><textarea class="form-textarea" name="body" maxlength="12000" minlength="300" required></textarea></label>
          <label class="studio-toggle"><input type="checkbox" name="public_author_consent" required /> SAYA SETUJU NAMA PENULIS DAN ARTIKEL DITAMPILKAN SECARA PUBLIK</label>
          <p class="auth-feedback" data-tech-article-feedback role="status"></p>
          <button class="btn-tactical primary" type="submit" data-tech-article-submit-label>KIRIM PEER REVIEW</button>
        </form>
      ` : '<p>Masuk dengan akun anggota untuk menulis artikel.</p><button class="btn-tactical" type="button" data-tech-article-login>MASUK KE AKUN</button>'}
    `;
    container.append(submissions);
    submissions.querySelector('[data-tech-article-login]')?.addEventListener('click', () => document.getElementById('auth-action-btn')?.click());
    submissions.querySelectorAll('[data-edit-tech-article]').forEach((button) => button.addEventListener('click', () => {
      const article = ownedArticles.find(({ id }) => id === button.dataset.editTechArticle);
      const form = submissions.querySelector('[data-tech-article-submit]');
      if (!article || !form) return;
      form.elements.article_id.value = article.id;
      form.elements.title.value = article.payload.title;
      form.elements.category.value = article.payload.category;
      form.elements.tags.value = (article.payload.tags || []).join(', ');
      form.elements.source_url.value = article.payload.source_url || '';
      form.elements.summary.value = article.payload.summary;
      form.elements.body.value = article.payload.body;
      form.elements.public_author_consent.checked = true;
      submissions.querySelector('[data-tech-article-form-title]').textContent = 'REVISI ARTIKEL';
      submissions.querySelector('[data-tech-article-submit-label]').textContent = 'KIRIM ULANG PEER REVIEW';
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    submissions.querySelector('[data-tech-article-submit]')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const values = Object.fromEntries(new FormData(form));
      const articleId = values.article_id;
      const payload = {
        title: values.title.trim(),
        category: values.category.trim(),
        summary: values.summary.trim(),
        body: values.body.trim(),
        source_url: values.source_url.trim(),
        public_author_consent: form.elements.public_author_consent.checked,
        tags: values.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
      };
      const response = articleId
        ? await this.api.resubmitTechArticle(articleId, payload)
        : await this.api.submitTechArticle(payload);
      if (!response.ok) {
        form.querySelector('[data-tech-article-feedback]').textContent = response.error;
        return;
      }
      await this.syncPortalRecords();
    });
  }

  renderProjectCalls(container, result) {
    if (!container) return;
    const calls = result?.ok && Array.isArray(result.data?.calls) ? result.data.calls : [];
    const ownCalls = this.myProjectCalls || [];
    const applications = this.myProjectCallApplications || [];
    const ownCallsById = new Map(ownCalls.map((call) => [call.id, call]));
    const callCards = calls.map((call) => {
      const ownedCall = ownCallsById.get(call.id);
      const alreadyApplied = applications.some((application) => application.call_id === call.id);
      return `
        <article class="portal-record project-call-card" data-project-call="${escapeHtml(call.id)}">
          <div class="knowledge-resource-meta"><span>${escapeHtml(call.type)}</span><span>${escapeHtml(call.owner_name)}</span></div>
          <h3>${escapeHtml(call.title)}</h3>
          <p>${escapeHtml(call.event_name)} // Tenggat ${escapeHtml(new Date(`${call.deadline}T00:00:00`).toLocaleDateString('id-ID'))}</p>
          <p>${escapeHtml(call.description)}</p>
          <div class="knowledge-resource-tags">${call.roles.map((role) => `<span>${escapeHtml(role)}</span>`).join('')}</div>
          <p>Komitmen: ${escapeHtml(call.commitment || 'Belum ditentukan')} // ${call.application_count} peminat</p>
          ${ownedCall ? `
            <section class="project-call-applications"><h4>MINAT BERGABUNG</h4>
              ${ownedCall.applications.map((application) => `
                <article class="admin-record-row"><span><strong>${escapeHtml(application.applicant_name)} // ${escapeHtml(application.role)}</strong><small>${escapeHtml(application.status)} · ${escapeHtml(application.message)}</small></span>
                  ${application.status === 'pending' ? `<button class="btn-tactical primary" type="button" data-call-application-status="accepted" data-call-id="${escapeHtml(call.id)}" data-application-id="${escapeHtml(application.id)}">TERIMA</button><button class="btn-tactical" type="button" data-call-application-status="declined" data-call-id="${escapeHtml(call.id)}" data-application-id="${escapeHtml(application.id)}">TOLAK</button>` : ''}
                </article>`).join('') || '<p>Belum ada anggota yang mengajukan minat.</p>'}
            </section>
            <button class="btn-tactical" type="button" data-close-project-call="${escapeHtml(call.id)}">TUTUP OPEN PROJECT</button>
          ` : call.is_open && this.api.isAuthenticated && !alreadyApplied ? `
            <form class="admin-form" data-project-call-apply="${escapeHtml(call.id)}">
              <label class="form-group"><span class="form-label">PERAN YANG DIMINATI</span><select class="form-select" name="role" required>${call.roles.map((role) => `<option value="${escapeHtml(role)}">${escapeHtml(role)}</option>`).join('')}</select></label>
              <label class="form-group"><span class="form-label">PESAN SINGKAT</span><textarea class="form-textarea" name="message" maxlength="800" required></textarea></label>
              <p class="auth-feedback" role="status"></p>
              <button class="btn-tactical primary" type="submit">AJUKAN MINAT</button>
            </form>
          ` : call.is_open && !this.api.isAuthenticated
          ? '<p>Masuk dengan akun anggota untuk mengajukan minat.</p><button class="btn-tactical" type="button" data-project-call-login>MASUK KE AKUN</button>'
          : `<p>${call.is_open ? alreadyApplied ? 'Minat Anda sudah dikirim.' : '' : 'Pendaftaran ditutup.'}</p>`}
        </article>`;
    }).join('');

    const formMarkup = this.api.isAuthenticated ? `
      <form class="admin-form" data-project-call-create>
        <h4>CARI REKAN PROYEK / LOMBA</h4>
        <div class="admin-form-grid">
          <label class="form-group"><span class="form-label">JUDUL PENCARIAN TIM</span><input class="form-input" name="title" maxlength="160" required /></label>
          <label class="form-group"><span class="form-label">JENIS KEGIATAN</span><select class="form-select" name="type"><option>Gemastik</option><option>PKM</option><option>Hackathon</option><option>Lomba lainnya</option><option>Proyek komersial</option><option>Riset</option></select></label>
          <label class="form-group"><span class="form-label">NAMA LOMBA / PROYEK</span><input class="form-input" name="event_name" maxlength="120" required /></label>
          <label class="form-group"><span class="form-label">PERAN DICARI (PISAH KOMA)</span><input class="form-input" name="roles" maxlength="480" placeholder="UI/UX Designer, Embedded Engineer" required /></label>
          <label class="form-group"><span class="form-label">TENGGAT</span><input class="form-input" name="deadline" type="date" min="${getJakartaCalendarDate()}" required /></label>
          <label class="form-group"><span class="form-label">KOMITMEN WAKTU</span><input class="form-input" name="commitment" maxlength="120" placeholder="Akhir pekan, 4 jam/minggu" /></label>
        </div>
        <label class="form-group"><span class="form-label">DESKRIPSI</span><textarea class="form-textarea" name="description" maxlength="1200" required></textarea></label>
        <label class="studio-toggle"><input type="checkbox" name="public_owner_consent" required /> SAYA SETUJU NAMA PEMILIK DAN PENGUMUMAN TIM DITAMPILKAN SECARA PUBLIK</label>
        <p class="auth-feedback" data-project-call-feedback role="status"></p>
        <button class="btn-tactical primary" type="submit">KIRIM UNTUK REVIEW</button>
      </form>
    ` : '<p>Masuk dengan akun anggota untuk memasang pencarian tim.</p><button class="btn-tactical" type="button" data-project-call-login>MASUK KE AKUN</button>';
    const myApplications = applications.length ? `
      <section class="project-call-my-applications"><h4>MINAT YANG SAYA KIRIM</h4>
        ${applications.map((application) => `<article class="admin-record-row"><span><strong>${escapeHtml(application.call.title)} // ${escapeHtml(application.role)}</strong><small>${escapeHtml(application.owner_name)} · ${escapeHtml(application.status)}</small></span></article>`).join('')}
      </section>` : '';
    const privateCalls = ownCalls.filter((call) => call.status !== 'published' || !calls.some(({ id }) => id === call.id));
    const privateCallsMarkup = privateCalls.map((call) => `
      <article class="admin-record-row"><span><strong>${escapeHtml(call.title)}</strong><small>${escapeHtml(call.status)}${call.review_note ? ` // ${escapeHtml(call.review_note)}` : ''}</small></span></article>
    `).join('');
    container.innerHTML = `${callCards || (result?.ok ? '<p>Belum ada open project yang aktif.</p>' : `<p class="auth-feedback" role="status">${escapeHtml(result?.error || 'Open project belum dapat dimuat.')}</p>`)}
      ${myApplications}${privateCallsMarkup ? `<section><h4>PENGAJUAN OPEN PROJECT SAYA</h4>${privateCallsMarkup}</section>` : ''}${formMarkup}`;

    container.querySelectorAll('[data-project-call-login]').forEach((button) => button.addEventListener('click', () => document.getElementById('auth-action-btn')?.click()));
    container.querySelectorAll('[data-project-call-apply]').forEach((form) => form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const response = await this.api.applyToProjectCall(form.dataset.projectCallApply, {
        role: form.elements.role.value,
        message: form.elements.message.value.trim()
      });
      if (!response.ok) {
        form.querySelector('[role="status"]').textContent = response.error;
        return;
      }
      await this.syncPortalRecords();
    }));
    container.querySelectorAll('[data-project-call-create]').forEach((form) => form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form));
      const response = await this.api.createProjectCall({
        ...values,
        public_owner_consent: form.elements.public_owner_consent.checked,
        title: values.title.trim(),
        event_name: values.event_name.trim(),
        description: values.description.trim(),
        roles: values.roles.split(',').map((role) => role.trim()).filter(Boolean),
        commitment: values.commitment.trim()
      });
      if (!response.ok) {
        form.querySelector('[data-project-call-feedback]').textContent = response.error;
        return;
      }
      await this.syncPortalRecords();
    }));
    container.querySelectorAll('[data-call-application-status]').forEach((button) => button.addEventListener('click', async () => {
      const response = await this.api.updateProjectCallApplication(button.dataset.callId, button.dataset.applicationId, button.dataset.callApplicationStatus);
      if (!response.ok) {
        button.closest('.admin-record-row').querySelector('small').textContent = response.error;
        return;
      }
      await this.syncPortalRecords();
    }));
    container.querySelectorAll('[data-close-project-call]').forEach((button) => button.addEventListener('click', async () => {
      const response = await this.api.closeProjectCall(button.dataset.closeProjectCall);
      if (!response.ok) {
        button.textContent = response.error;
        return;
      }
      await this.syncPortalRecords();
    }));
  }

  renderPortalSubmissionSection(kind, container) {
    container.querySelector(`[data-portal-submission-section="${kind}"]`)?.remove();
    const titles = { project: 'AJUKAN KARYA', alumni: 'AJUKAN PROFIL ALUMNI', job: 'AJUKAN LOWONGAN / MAGANG' };
    const forms = {
      project: `
        <label class="form-group"><span class="form-label">JUDUL PROYEK</span><input class="form-input" name="title" maxlength="160" required /></label>
        <label class="form-group"><span class="form-label">PEMILIK / TIM</span><input class="form-input" name="author" maxlength="120" required /></label>
        <label class="form-group"><span class="form-label">KATEGORI</span><input class="form-input" name="category" maxlength="80" required /></label>
        <label class="form-group"><span class="form-label">JENIS KARYA</span><select class="form-select" name="project_type"><option>Tugas Akhir</option><option>Kerja Praktik</option><option>Lomba</option><option>Riset mandiri</option><option>Aplikasi web</option><option>Aplikasi mobile</option><option>IoT</option><option>Edge AI</option><option>UI/UX</option><option selected>Lainnya</option></select></label>
        <label class="form-group"><span class="form-label">TAG (KOMA)</span><input class="form-input" name="tags" maxlength="480" /></label>
        <label class="form-group"><span class="form-label">URL REPOSITORI HTTPS</span><input class="form-input" name="repo_url" type="url" maxlength="2000" /></label>
        <label class="form-group"><span class="form-label">URL LIVE DEMO HTTPS</span><input class="form-input" name="demo_url" type="url" maxlength="2000" /></label>
        <label class="form-group"><span class="form-label">URL VIDEO YOUTUBE (OPSIONAL)</span><input class="form-input" name="video_url" type="url" maxlength="2000" /></label>
        <label class="form-group"><span class="form-label">RINGKASAN</span><textarea class="form-textarea" name="description" maxlength="1200" required></textarea></label>`,
      alumni: `
        <label class="form-group"><span class="form-label">NAMA ALUMNI</span><input class="form-input" name="name" maxlength="120" required /></label>
        <label class="form-group"><span class="form-label">TAHUN LULUS</span><input class="form-input" name="graduation_year" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required /></label>
        <label class="form-group"><span class="form-label">PERUSAHAAN</span><input class="form-input" name="company" maxlength="120" required /></label>
        <label class="form-group"><span class="form-label">POSISI</span><input class="form-input" name="position" maxlength="120" required /></label>
        <label class="form-group"><span class="form-label">DOMISILI</span><input class="form-input" name="location" maxlength="120" /></label>
        <label class="form-group"><span class="form-label">KOTA</span><input class="form-input" name="city" maxlength="100" /></label>
        <label class="form-group"><span class="form-label">PROVINSI</span><input class="form-input" name="province" maxlength="100" placeholder="Jawa Barat" /></label>
        <label class="form-group"><span class="form-label">SPESIALISASI</span><input class="form-input" name="specialization" maxlength="160" required /></label>
        <label class="form-group"><span class="form-label">URL PROFIL PROFESIONAL HTTPS</span><input class="form-input" name="profile_url" type="url" maxlength="2000" /></label>
        <label class="studio-toggle"><input type="checkbox" name="mentorship_available" /> BERSEDIA MENJADI MENTOR</label>
        <label class="studio-toggle"><input type="checkbox" name="speaker_available" /> BERSEDIA MENJADI PEMBICARA</label>
        <label class="studio-toggle"><input type="checkbox" name="referral_available" /> BERSEDIA MEMBERI REFERRAL</label>
        <label class="studio-toggle"><input type="checkbox" name="consent" required /> SAYA MEMILIKI PERSETUJUAN ALUMNI UNTUK PUBLIKASI</label>`,
      job: `
        <label class="form-group"><span class="form-label">POSISI</span><input class="form-input" name="title" maxlength="160" required /></label>
        <label class="form-group"><span class="form-label">PERUSAHAAN</span><input class="form-input" name="employer" maxlength="120" required /></label>
        <label class="form-group"><span class="form-label">SPESIALISASI RINGKAS</span><input class="form-input" name="specialization" maxlength="160" placeholder="Backend, aplikasi data, platform AI" required /></label>
        <fieldset class="career-specialization-options"><legend>FILTER BIDANG</legend>${['Full-stack', 'AI', 'Mobile', 'Cybersecurity', 'IoT', 'Data'].map((specialty) => `<label><input type="checkbox" name="specializations" value="${specialty}" /> ${specialty}</label>`).join('')}</fieldset>
        <label class="form-group"><span class="form-label">LOKASI</span><input class="form-input" name="location" maxlength="120" required /></label>
        <label class="form-group"><span class="form-label">JENIS</span><select class="form-select" name="work_type"><option>Magang</option><option>Penuh waktu</option><option>Paruh waktu</option><option>Kontrak</option></select></label>
        <label class="form-group"><span class="form-label">TENGGAT</span><input class="form-input" type="date" name="deadline" required /></label>
        <label class="form-group"><span class="form-label">URL PENDAFTARAN HTTPS</span><input class="form-input" type="url" name="url" maxlength="2000" required /></label>`
    };
    const ownedRecords = this.myPortalRecords.filter((record) => record.kind === kind);
    const statusLabels = {
      pending_review: 'Menunggu review',
      needs_revision: 'Perlu revisi',
      approved: 'Disetujui, menunggu publikasi',
      published: 'Dipublikasikan',
      rejected: 'Ditolak',
      archived: 'Diarsipkan'
    };
    const loggedIn = this.api.isAuthenticated;
    container.insertAdjacentHTML('beforeend', `
      <section class="portal-submission-section" data-portal-submission-section="${kind}" aria-label="${titles[kind]}">
        <h3>${titles[kind]}</h3>
        ${loggedIn ? `
          <p>Pengajuan ditinjau pengelola sebelum ditampilkan ke publik.</p>
          ${this.portalSubmissionError ? `<p class="auth-feedback" role="alert">${escapeHtml(this.portalSubmissionError)}</p>` : ''}
          <div class="admin-record-list portal-submission-records">
            ${ownedRecords.map((record) => `
              <article class="admin-record-row">
                <span><strong>${escapeHtml(record.payload.title || record.payload.name || record.payload.employer)}</strong>
                  <small>${escapeHtml(statusLabels[record.review_status] || record.review_status)}</small>
                  ${record.review_note ? `<small>Catatan review: ${escapeHtml(record.review_note)}</small>` : ''}
                </span>
                ${record.review_status === 'needs_revision' ? `<button class="btn-tactical" type="button" data-portal-resubmit="${escapeHtml(record.id)}" data-portal-kind="${kind}">EDIT & KIRIM REVISI</button>` : ''}
              </article>`).join('') || '<p>Pengajuan Anda akan tercatat di sini.</p>'}
          </div>
          <form class="admin-form portal-submission-form" data-portal-submission="${kind}">
            <input type="hidden" name="record_id" />
            <div class="admin-form-grid">${forms[kind]}</div>
            <p class="auth-feedback" data-portal-submission-feedback role="status">${escapeHtml(this.portalSubmissionFeedback[kind] || '')}</p>
            <button class="btn-tactical primary" type="submit">${this.portalSubmissionFeedback[kind] === 'Kirim revisi untuk ditinjau.' ? 'KIRIM REVISI' : 'KIRIM PENGAJUAN'}</button>
          </form>
        ` : '<p>Masuk dengan akun anggota untuk mengirim dan melacak pengajuan.</p><button class="btn-tactical" type="button" data-portal-submission-login>MASUK KE AKUN</button>'}
      </section>
    `);
    const section = container.querySelector(`[data-portal-submission-section="${kind}"]`);
    section.querySelector('[data-portal-submission-login]')?.addEventListener('click', () => document.getElementById('auth-action-btn')?.click());
    const form = section.querySelector(`[data-portal-submission="${kind}"]`);
    if (form) {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(form));
        const recordId = values.record_id;
        delete values.record_id;
        if (kind === 'project') values.tags = String(values.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean);
        if (kind === 'alumni') {
          values.mentorship_available = form.elements.mentorship_available.checked;
          values.speaker_available = form.elements.speaker_available.checked;
          values.referral_available = form.elements.referral_available.checked;
          values.consent = form.elements.consent.checked;
        }
        if (kind === 'job') values.specializations = [...form.querySelectorAll('[name="specializations"]:checked')].map((input) => input.value);
        const result = recordId
          ? await this.api.resubmitPortalRecord(kind, recordId, values)
          : await this.api.submitPortalRecord(kind, values);
        if (!result.ok) {
          form.querySelector('[data-portal-submission-feedback]').textContent = result.error;
          return;
        }
        this.portalSubmissionFeedback[kind] = recordId ? 'Kirim revisi untuk ditinjau.' : 'Pengajuan dikirim untuk ditinjau.';
        const mine = await this.api.getMyPortalRecords();
        if (!mine.ok) {
          form.querySelector('[data-portal-submission-feedback]').textContent = mine.error;
          return;
        }
        this.myPortalRecords = mine.data.records;
        this.renderPortalSubmissionSection(kind, container);
      });
      section.querySelectorAll('[data-portal-resubmit]').forEach((button) => button.addEventListener('click', () => {
        const record = this.myPortalRecords.find(({ id }) => id === button.dataset.portalResubmit);
        if (!record) return;
        form.elements.record_id.value = record.id;
        Object.entries(record.payload).forEach(([name, value]) => {
          if (kind === 'job' && name === 'specializations') {
            form.querySelectorAll('[name="specializations"]').forEach((input) => { input.checked = value.includes(input.value); });
            return;
          }
          const field = form.elements[name];
          if (!field) return;
          if (field.type === 'checkbox') field.checked = Boolean(value);
          else field.value = Array.isArray(value) ? value.join(', ') : value;
        });
        if (kind === 'alumni') form.elements.consent.checked = true;
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }));
    }
  }

  async renderTutoringClinic() {
    const form = document.getElementById('tutoring-request-form');
    const loginButton = document.getElementById('tutoring-login-button');
    const list = document.getElementById('tutoring-request-list');
    const tutorProfileSection = document.getElementById('tutoring-tutor-profile');
    if (!form || !loginButton || !list || !tutorProfileSection) return;
    const authenticated = this.api.isAuthenticated;
    const canOfferTutoring = authenticated && !this.api.isSuperadmin && this.api.clearanceLevel >= 2;
    form.hidden = !authenticated;
    loginButton.hidden = authenticated;
    tutorProfileSection.hidden = !canOfferTutoring;
    if (!authenticated) {
      list.textContent = 'Masuk untuk melihat status permintaan Klinik Koding Anda.';
      return;
    }

    if (canOfferTutoring) {
      const profileResult = await this.api.getMyTutorProfile();
      if (profileResult.ok && profileResult.data.profile) {
        const profile = profileResult.data.profile;
        const profileForm = tutorProfileSection.querySelector('#tutoring-profile-form');
        const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        profileForm.elements.expertise.value = profile.expertise.join(', ');
        profileForm.elements.availability.value = profile.availability
          .map((slot) => `${days[slot.dayOfWeek]}, ${slot.start}, ${slot.end}, ${slot.mode}`).join('\n');
        profileForm.elements.bio.value = profile.bio;
        profileForm.elements.active.checked = profile.active;
      }
    }

    list.textContent = 'Memuat permintaan sesi...';
    const result = await this.api.getMyTutoringRequests();
    if (!result.ok) {
      list.textContent = result.error;
      return;
    }
    list.innerHTML = result.data.requests.length
      ? result.data.requests.map((request) => `
        <article class="tutoring-request-card">
          <div><strong>${escapeHtml(request.course)} // ${escapeHtml(request.topic)}</strong><span>${escapeHtml(request.status)} // Diajukan ${escapeHtml(new Date(request.created_at).toLocaleDateString('id-ID'))}</span></div>
          <p>${escapeHtml(request.request_message)}</p>
          <p>Waktu pilihan: ${escapeHtml(request.preferred_time)}</p>
          ${request.status === 'Dijadwalkan' ? `
            <p>Tutor: ${escapeHtml(request.tutor_name || 'Tutor HMIF')} // ${escapeHtml(new Date(request.session_at).toLocaleString('id-ID'))}</p>
            ${request.mode === 'online'
            ? `<a href="${escapeHtml(request.meeting_url)}" target="_blank" rel="noopener noreferrer">BUKA TAUTAN SESI</a>`
            : `<p>Lokasi: ${escapeHtml(request.location)}</p>`}
          ` : ''}
          ${request.admin_note ? `<p>Catatan pengurus: ${escapeHtml(request.admin_note)}</p>` : ''}
        </article>`).join('')
      : '<p>Belum ada permintaan sesi.</p>';
  }

  async renderInventory() {
    const assetsGrid = document.getElementById('inventory-assets-grid');
    const adminControls = document.getElementById('inventory-admin-controls');
    const loansList = document.getElementById('inventory-loans-list');
    if (!assetsGrid || !adminControls || !loansList) return;
    const authenticated = this.api.isAuthenticated;
    const canManage = authenticated && (this.api.isSuperadmin || this.api.clearanceLevel >= 2);
    const [assetsResult, myLoansResult, adminLoansResult] = await Promise.all([
      this.api.getInventoryAssets(),
      authenticated ? this.api.getMyInventoryLoans() : Promise.resolve(null),
      canManage ? this.api.getInventoryLoans() : Promise.resolve(null)
    ]);
    if (!assetsResult.ok) {
      assetsGrid.textContent = assetsResult.error;
      return;
    }
    const assets = assetsResult.data.assets || [];
    const myLoans = myLoansResult?.ok ? myLoansResult.data.loans || [] : [];
    const loans = canManage && adminLoansResult?.ok ? adminLoansResult.data.loans || [] : myLoans;
    const activeAssetIds = new Set(myLoans.filter((loan) => ['Diajukan', 'Disetujui', 'Dipinjam'].includes(loan.status)).map((loan) => loan.asset_id));
    const canBorrow = authenticated;
    assetsGrid.innerHTML = assets.length ? assets.map((asset) => `
      <article class="inventory-asset-card">
        <div class="inventory-asset-meta"><span>${escapeHtml(asset.category)}</span><span>${escapeHtml(asset.status)}</span></div>
        <h3>${escapeHtml(asset.name)}</h3>
        <p>${escapeHtml(asset.asset_tag)} // ${escapeHtml(asset.location || 'Lokasi belum dicatat')}</p>
        <p>${escapeHtml(asset.description || '')}</p>
        <p>Kondisi: ${escapeHtml(asset.condition)}</p>
        ${asset.status === 'Tersedia' && !activeAssetIds.has(asset.id)
        ? canBorrow
          ? `<form class="inventory-loan-request-form" data-inventory-loan="${escapeHtml(asset.id)}"><label class="form-group"><span class="form-label">TUJUAN PEMINJAMAN</span><textarea class="form-textarea" name="purpose" maxlength="1000" required></textarea></label><label class="form-group"><span class="form-label">TENGGAT PENGEMBALIAN</span><input class="form-input" type="date" name="due_at" min="${new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}" required /></label><button class="btn-tactical primary" type="submit">AJUKAN PEMINJAMAN</button><p class="auth-feedback" role="status"></p></form>`
          : '<p>Masuk untuk mengajukan peminjaman.</p>'
        : ''}
      </article>`).join('') : '<p>Belum ada aset yang terdaftar.</p>';

    adminControls.hidden = !canManage;
    adminControls.innerHTML = canManage ? `
      <h3>KELOLA INVENTARIS</h3>
      <form id="inventory-create-asset-form" class="inventory-create-form">
        <div class="admin-form-grid">
          <label class="form-group"><span class="form-label">KODE ASET</span><input class="form-input" name="asset_tag" maxlength="40" pattern="[A-Za-z0-9_-]{3,40}" required /></label>
          <label class="form-group"><span class="form-label">NAMA BARANG</span><input class="form-input" name="name" maxlength="120" required /></label>
          <label class="form-group"><span class="form-label">KATEGORI</span><input class="form-input" name="category" maxlength="80" required /></label>
          <label class="form-group"><span class="form-label">LOKASI</span><input class="form-input" name="location" maxlength="160" /></label>
        </div>
        <label class="form-group"><span class="form-label">DESKRIPSI</span><textarea class="form-textarea" name="description" maxlength="500"></textarea></label>
        <button class="btn-tactical primary" type="submit">TAMBAH ASET</button>
        <p class="auth-feedback" role="status"></p>
      </form>` : '';

    loansList.innerHTML = loans.length ? loans.map((loan) => `
      <article class="inventory-loan-card" data-inventory-loan-card="${escapeHtml(loan.id)}">
        <div><strong>${escapeHtml(loan.asset_tag)} // ${escapeHtml(loan.asset_name)}</strong><span>${escapeHtml(loan.status)} // ${escapeHtml(loan.borrower_name || 'Permintaan Anda')}</span></div>
        <p>${escapeHtml(loan.purpose || '')} // Tenggat ${escapeHtml(new Date(loan.due_at).toLocaleDateString('id-ID'))}</p>
        ${loan.is_overdue ? '<p class="inventory-loan-overdue" role="status">TERLAMBAT // BARANG BELUM DIKEMBALIKAN</p>' : ''}
        ${loan.condition_note ? `<p>Catatan kondisi: ${escapeHtml(loan.condition_note)}</p>` : ''}
        ${(loan.history || []).length ? `<ol class="inventory-loan-history">${loan.history.map((entry) => `<li><strong>${escapeHtml(entry.from_status || 'Mulai')} → ${escapeHtml(entry.to_status)}</strong><span>${escapeHtml(new Date(entry.created_at).toLocaleString('id-ID'))}${entry.note ? ` // ${escapeHtml(entry.note)}` : ''}</span></li>`).join('')}</ol>` : ''}
        ${canManage ? `
          <div class="inventory-loan-actions">
            ${loan.status === 'Diajukan' ? `<button class="btn-tactical primary" data-inventory-status="Disetujui" data-loan-id="${escapeHtml(loan.id)}">SETUJUI</button><button class="btn-tactical" data-inventory-status="Ditolak" data-loan-id="${escapeHtml(loan.id)}">TOLAK</button>` : ''}
            ${loan.status === 'Disetujui' ? `<button class="btn-tactical primary" data-inventory-status="Dipinjam" data-loan-id="${escapeHtml(loan.id)}">CATAT CHECK-OUT</button>` : ''}
            ${loan.status === 'Dipinjam' ? `<button class="btn-tactical primary" data-inventory-status="Dikembalikan" data-loan-id="${escapeHtml(loan.id)}">TERIMA & CATAT KONDISI</button><button class="btn-tactical" data-inventory-status="Rusak" data-loan-id="${escapeHtml(loan.id)}">RUSAK</button><button class="btn-tactical" data-inventory-status="Hilang" data-loan-id="${escapeHtml(loan.id)}">HILANG</button>` : ''}
          </div>
          <p class="auth-feedback" role="status"></p>` : ''}
      </article>`).join('') : '<p>Belum ada permintaan peminjaman.</p>';

    assetsGrid.querySelectorAll('[data-inventory-loan]').forEach((form) => form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const feedback = form.querySelector('[role="status"]');
      const result = await this.api.requestInventoryLoan({
        asset_id: form.dataset.inventoryLoan,
        purpose: form.elements.purpose.value.trim(),
        due_at: new Date(`${form.elements.due_at.value}T12:00:00.000Z`).toISOString()
      });
      if (!result.ok) {
        feedback.textContent = result.error;
        return;
      }
      await this.renderInventory();
    }));
    adminControls.querySelector('#inventory-create-asset-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const feedback = form.querySelector('[role="status"]');
      const values = Object.fromEntries(new FormData(form));
      const result = await this.api.createInventoryAsset(values);
      if (!result.ok) {
        feedback.textContent = result.error;
        return;
      }
      await this.renderInventory();
    });
    loansList.querySelectorAll('[data-inventory-status]').forEach((button) => button.addEventListener('click', async () => {
      const noteRequired = ['Ditolak', 'Dikembalikan', 'Rusak', 'Hilang'].includes(button.dataset.inventoryStatus);
      const promptLabel = button.dataset.inventoryStatus === 'Ditolak'
        ? 'Alasan penolakan:'
        : button.dataset.inventoryStatus === 'Dikembalikan'
          ? 'Catatan pemeriksaan kondisi barang saat diterima kembali:'
          : `Catatan untuk status ${button.dataset.inventoryStatus}:`;
      const conditionNote = noteRequired
        ? window.prompt(promptLabel) || ''
        : '';
      if (noteRequired && !conditionNote.trim()) return;
      const result = await this.api.updateInventoryLoan(button.dataset.loanId, button.dataset.inventoryStatus, conditionNote);
      if (!result.ok) {
        button.closest('[data-inventory-loan-card]')?.querySelector('[role="status"]')?.replaceChildren(document.createTextNode(result.error));
        return;
      }
      await this.renderInventory();
    }));
  }

  async submitTutoringRequest(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const feedback = form.querySelector('[data-tutoring-feedback]');
    const preferredSlots = [...form.querySelectorAll('[data-tutoring-preferred-slot]')].flatMap((row) => {
      const date = row.elements.preferred_date.value;
      const start = row.elements.preferred_start.value;
      const end = row.elements.preferred_end.value;
      if (!date && !start && !end) return [];
      return [{ date, start, end, mode: row.elements.preferred_mode.value }];
    });
    const result = await this.api.createTutoringRequest({
      course: form.elements.course.value.trim(),
      topic: form.elements.topic.value.trim(),
      message: form.elements.message.value.trim(),
      preferred_slots: preferredSlots
    });
    if (!result.ok) {
      feedback.textContent = result.error;
      return;
    }
    form.reset();
    feedback.textContent = 'Permintaan diterima. Pengurus akan menindaklanjuti jadwal secara privat.';
    await this.renderTutoringClinic();
  }

  async saveTutorProfile(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const feedback = form.querySelector('[data-tutor-profile-feedback]');
    const weekdays = new Map(['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'].map((day, index) => [day.toLowerCase(), index]));
    const availability = form.elements.availability.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const [day, start, end, mode] = line.split(',').map((part) => part.trim());
      return { dayOfWeek: weekdays.get(day?.toLowerCase()), start, end, mode };
    });
    if (!availability.length || availability.some((slot) => !Number.isInteger(slot.dayOfWeek) || !slot.start || !slot.end || !slot.mode)) {
      feedback.textContent = 'ISI SETIAP SLOT: HARI, JAM MULAI, JAM SELESAI, MODE. Contoh: Senin, 15:00, 17:00, online';
      return;
    }
    const expertise = [...new Set(form.elements.expertise.value.split(',').map((skill) => skill.trim()).filter(Boolean))];
    const result = await this.api.saveMyTutorProfile({
      expertise,
      availability,
      bio: form.elements.bio.value.trim(),
      active: form.elements.active.checked
    });
    feedback.textContent = result.ok ? 'PROFIL TUTOR TERSIMPAN.' : result.error;
  }

  async loadKnowledgeDiscussion(resourceId, panel) {
    const posts = panel.querySelector('[data-knowledge-discussion-posts]');
    posts.textContent = 'Memuat diskusi...';
    const result = await this.api.getKnowledgeDiscussions(resourceId);
    if (!result.ok) {
      posts.textContent = result.error;
      return;
    }
    const discussions = result.data.discussions || [];
    const children = new Map();
    discussions.forEach((discussion) => {
      const key = discussion.parent_id || '';
      if (!children.has(key)) children.set(key, []);
      children.get(key).push(discussion);
    });
    const labels = { discussion: 'DISKUSI', question: 'PERTANYAAN', answer: 'JAWABAN', alternative: 'ALTERNATIF ALGORITMA' };
    const renderPost = (discussion, depth = 0) => `
      <article class="knowledge-discussion-post" data-discussion-post="${escapeHtml(discussion.id)}" style="--discussion-depth:${Math.min(depth, 4)}">
        <p><strong>${escapeHtml(discussion.author_name)}</strong> // ${escapeHtml(labels[discussion.solution_type] || 'DISKUSI')} // ${escapeHtml(new Date(discussion.created_at).toLocaleDateString('id-ID'))}${discussion.status === 'pending' ? ' // MENUNGGU MODERASI' : ''}${discussion.selected_solution ? ' // SOLUSI TERPILIH' : ''}</p>
        <p>${escapeHtml(discussion.message)}</p>
        ${discussion.status === 'published' && this.api.isAuthenticated ? `<button type="button" class="workspace-text-action" data-discussion-reply="${escapeHtml(discussion.id)}">BALAS</button>` : ''}
        ${discussion.status === 'published' && ['answer', 'alternative'].includes(discussion.solution_type) && (this.api.isSuperadmin || this.api.clearanceLevel >= 2 || this.api.currentUser?.permissions?.includes('academic_curate')) && !discussion.selected_solution ? `<button type="button" class="workspace-text-action" data-select-solution="${escapeHtml(discussion.id)}">TANDAI SOLUSI TERPILIH</button>` : ''}
        ${(children.get(discussion.id) || []).map((child) => renderPost(child, depth + 1)).join('')}
      </article>`;
    posts.innerHTML = discussions.length
      ? (children.get('') || []).map((discussion) => renderPost(discussion)).join('')
      : '<p>Belum ada pembahasan yang diterbitkan.</p>';
    const form = panel.querySelector('[data-knowledge-discussion-form]');
    if (form && !form.dataset.bound) {
      form.dataset.bound = 'true';
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const feedback = form.querySelector('[data-discussion-feedback]');
        const submission = await this.api.submitKnowledgeDiscussion(resourceId, {
          message: form.elements.message.value.trim(),
          parent_id: form.elements.parent_id.value || null,
          solution_type: form.elements.solution_type.value
        });
        if (!submission.ok) {
          feedback.textContent = submission.error;
          return;
        }
        form.reset();
        feedback.textContent = submission.data.message;
        await this.loadKnowledgeDiscussion(resourceId, panel);
      });
    }
    posts.querySelectorAll('[data-discussion-reply]').forEach((button) => button.addEventListener('click', () => {
      if (!form) return;
      form.elements.parent_id.value = button.dataset.discussionReply;
      form.elements.solution_type.value = 'answer';
      form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      form.elements.message.focus();
    }));
    posts.querySelectorAll('[data-select-solution]').forEach((button) => button.addEventListener('click', async () => {
      const selected = await this.api.selectKnowledgeSolution(button.dataset.selectSolution);
      if (!selected.ok) {
        button.textContent = selected.error;
        return;
      }
      await this.loadKnowledgeDiscussion(resourceId, panel);
    }));
  }

  // ------------------------------------------------------------------------
  // OPERATOR SQUAD (STRUKTUR ORGANISASI & DEPARTEMEN HIERARKIS)
  // ------------------------------------------------------------------------
  getCohortPosts(op) {
    return getCohortPosts(HMIF_DATA.generations, op);
  }

  getCohortOperator(operatorId) {
    return resolveCohortOperator(HMIF_DATA.operators || [], operatorId);
  }

  renderDualDeployment(op, cohortYear = null) {
    const posts = this.getCohortPosts(op).filter((post) => cohortYear === null || String(post.year) === String(cohortYear));
    if (!posts.length) return '';
    return `
      <section class="dual-deployment-panel">
        <div class="dual-deployment-heading">DUAL-DEPLOYMENT TELEMETRY</div>
        <div class="dual-deployment-grid">
          <div><span>PRIMARY POST // HMIF</span><strong>${escapeHtml(op.role)} · ${escapeHtml(op.division || 'BPH')}</strong></div>
          <div><span>COHORT POST</span><strong>${posts.map((post) => `${escapeHtml(post.title)} · ${escapeHtml(post.year)}`).join('<br>')}</strong></div>
        </div>
      </section>
    `;
  }

  renderOperatorFilters(activeFilter = this.currentOperatorFilter || 'all') {
    const container = document.getElementById('operator-filters-container') || document.querySelector('.operator-filters');
    if (!container) return;

    this.currentOperatorFilter = activeFilter;
    const departments = Array.isArray(HMIF_DATA.departments) ? HMIF_DATA.departments : [];
    const sortedDepts = [...departments].sort((a, b) => (a.order || 0) - (b.order || 0));

    const filterButtons = [
      { id: 'all', label: 'SEMUA OPERATOR' },
      { id: 'bph', label: 'BPH (PIMPINAN INTI)' },
      { id: 'dual', label: 'DUAL ASSIGNMENT' },
      ...sortedDepts.map((d) => ({
        id: d.id,
        label: `DEPT ${d.code}`
      }))
    ];

    container.innerHTML = filterButtons
      .map((f) => `
        <button class="filter-btn ${f.id === this.currentOperatorFilter ? 'active' : ''}" data-filter="${escapeHtml(f.id)}">
          ${escapeHtml(f.label)}
        </button>
      `)
      .join('');

    container.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const filter = btn.getAttribute('data-filter');
        const isDepartment = departments.some((department) => department.id === filter);
        if (filter === 'dual') {
          this.switchTab('squad', { departmentId: '', divisionId: '' });
          this.currentOperatorFilter = 'dual';
          this.renderOperatorFilters('dual');
          this.renderOperators('dual');
        } else {
          this.switchTab('squad', { departmentId: filter === 'bph' ? 'bph' : isDepartment ? filter : '' });
        }
      });
    });
  }

  renderOperatorCard(op, customBadge = '') {
    const stars = '★'.repeat(op.rarity || 5);
    const badgeText = customBadge
      || (op.roleLevel === 'kadep' ? '★ KADEP // CHIEF'
        : op.roleLevel === 'sekdep' ? '★ SEKDEP // SCRIBE'
          : op.roleLevel === 'bph_leader' ? 'COMMAND CORE // BPH'
            : op.roleLevel === 'bph_executive' ? 'EXECUTIVE // BPH'
              : `${op.division || 'STAFF'} // DEPT`);

    const cardClass = [
      'operator-card',
      op.roleLevel === 'kadep' ? 'kadep-card' : '',
      op.roleLevel === 'sekdep' ? 'sekdep-card' : '',
      op.roleLevel?.startsWith('bph') ? 'bph-card' : ''
    ].filter(Boolean).join(' ');
    const cohortPosts = this.getCohortPosts(op);

    return `
      <div class="${cardClass}" data-op-id="${escapeHtml(op.id)}">
        <div class="operator-card-header">
          <img src="${escapeHtml(op.avatar)}" alt="${escapeHtml(op.name)}" class="operator-portrait" />
          <div class="operator-rarity-strip">
            <span class="star-icon">${stars}</span>
          </div>
          <div class="operator-class-badge">${escapeHtml(op.operatorClass)}</div>
        </div>
        <div class="operator-info-body">
          <div class="operator-division-tag">${escapeHtml(badgeText)}</div>
          <h3 class="operator-name">${escapeHtml(op.name)}</h3>
          <div class="operator-role">${escapeHtml(op.role)} (${escapeHtml(op.codeName)})</div>
          ${cohortPosts.length ? `<div class="dual-role-badges">${cohortPosts.map((post) => `<span class="dual-role-badge">ANGKATAN ${escapeHtml(post.year)} · ${escapeHtml(post.title)}</span>`).join('')}</div>` : ''}

          <div class="operator-stats">
            <div class="stat-row">
              <span class="stat-name">LEADERSHIP</span>
              <div class="stat-bar-track">
                <div class="stat-bar-fill gold" style="width: ${op.stats?.leadership ?? 80}%"></div>
              </div>
            </div>
            <div class="stat-row">
              <span class="stat-name">CODING & TECH</span>
              <div class="stat-bar-track">
                <div class="stat-bar-fill" style="width: ${op.stats?.coding ?? 80}%"></div>
              </div>
            </div>
            <div class="stat-row">
              <span class="stat-name">STRATEGY</span>
              <div class="stat-bar-track">
                <div class="stat-bar-fill" style="width: ${op.stats?.strategy ?? 80}%"></div>
              </div>
            </div>
          </div>

          <div class="operator-card-footer">
            <span class="detail-link">INTEL FILE &gt;&gt;</span>
          </div>
        </div>
      </div>
    `;
  }

  renderBphGroup(bphOperators) {
    return `
      <button class="department-group-block bph-group org-node org-bph-node org-selectable-node ${!this.selectedDepartmentId && !this.selectedDivisionId || this.selectedDepartmentId === 'bph' ? 'selected' : ''}" type="button" data-org-select="bph" aria-pressed="${!this.selectedDepartmentId && !this.selectedDivisionId || this.selectedDepartmentId === 'bph'}">
          <img class="dept-faction-emblem bph-emblem" src="${escapeHtml(HMIF_DATA.identity.logo || '/assets/hmif_umb_logo.png')}" alt="BPH Core Emblem" />
          <span class="department-group-header-text">
            <span class="department-group-tag">EXECUTIVE COUNCIL // STRATEGIC CORE</span>
            <span class="department-group-title">BADAN PENGURUS HARIAN (BPH)</span>
            <span class="department-group-desc">Pimpinan inti organisasi pemegang mandat konstitusi, penentu arah kebijakan strategis, integritas kepemimpinan, dan tata kelola himpunan.</span>
          </span>
          <span class="org-node-count">${bphOperators.length} PENGURUS</span>
      </button>
    `;
  }

  renderDepartmentGroup(dept, deptOps, index) {
    const divisions = Array.isArray(dept.divisions) ? [...dept.divisions].sort((a, b) => (a.order || 0) - (b.order || 0)) : [];
    const selected = this.selectedDepartmentId === dept.id || divisions.some((division) => division.id === this.selectedDivisionId);
    const divisionNodes = divisions.map((division) => `
          <button class="org-division-node org-selectable-node ${this.selectedDivisionId === division.id ? 'selected' : ''}" type="button" data-org-select="division" data-dept-id="${escapeHtml(dept.id)}" data-division-id="${escapeHtml(division.id)}" aria-pressed="${this.selectedDivisionId === division.id}">
            <span class="org-node-kicker">DIVISI ${escapeHtml(division.code || division.id)}</span>
            <span class="org-node-title">${escapeHtml(division.name)}</span>
            <span class="org-node-count">${(deptOps || []).filter((operator) => operator.divisionId === division.id).length} PENGURUS</span>
          </button>
        `).join('');

    return `
      <details class="department-group-block org-node org-department ${selected ? 'selected' : ''}" data-dept-id="${escapeHtml(dept.id)}" ${selected ? 'open' : ''}>
        <summary class="department-group-header org-node-summary" data-org-select="department" data-dept-id="${escapeHtml(dept.id)}">
          ${dept.emblem ? `<img class="dept-faction-emblem" src="${escapeHtml(dept.emblem)}" alt="Emblem ${escapeHtml(dept.code)}" />` : ''}
          <span class="department-group-header-text">
            <span class="department-group-tag">DEPARTEMEN ${escapeHtml(dept.code)} // SECTOR 0${index + 1}</span>
            <span class="department-group-title">${escapeHtml(dept.name)}</span>
            <span class="department-group-desc">${escapeHtml(dept.description || 'Pusat koordinasi dan pelaksanaan program kerja.')}</span>
          </span>
          <span class="org-expand-indicator" aria-hidden="true">⌄</span>
        </summary>
        <div class="org-department-content">
          <div class="org-division-branches">${divisionNodes || '<p class="dept-empty-notice">Belum ada divisi dalam departemen ini.</p>'}</div>
        </div>
      </details>
    `;
  }

  renderOperators(divisionFilter = 'all') {
    const container = document.getElementById('operators-grid-container');
    if (!container) return;

    this.currentOperatorFilter = divisionFilter;
    const allOps = Array.isArray(HMIF_DATA.operators) ? HMIF_DATA.operators : [];
    const departments = Array.isArray(HMIF_DATA.departments) ? HMIF_DATA.departments : [];
    const sortedDepts = [...departments].sort((a, b) => (a.order || 0) - (b.order || 0));

    const isBphOp = (op) => {
      const depId = (op.departmentId || '').toLowerCase();
      const div = (op.division || '').toLowerCase();
      const lvl = (op.roleLevel || '').toLowerCase();
      return depId === 'bph' || div === 'bph' || lvl.startsWith('bph');
    };

    const opBelongsToDept = (op, dept) => {
      if (isBphOp(op)) return false;
      if (op.departmentId && op.departmentId === dept.id) return true;
      const divLower = (op.division || '').toLowerCase();
      const codeLower = (dept.code || '').toLowerCase();
      const nameLower = (dept.name || '').toLowerCase();
      const idLower = (dept.id || '').toLowerCase();
      return divLower === codeLower || divLower === idLower || nameLower.includes(divLower) || idLower.includes(divLower);
    };

    const bphOps = allOps.filter(isBphOp);
    if (divisionFilter.toLowerCase() === 'dual') {
      const dualOps = allOps.filter((op) => this.getCohortPosts(op).length > 0);
      container.innerHTML = dualOps.length
        ? `<div class="department-group-block"><div class="department-group-header"><div class="department-group-tag">CROSS-ASSIGNMENT // COHORT LIAISON</div><h3 class="department-group-title">OPERATOR DENGAN JABATAN ANGKATAN</h3></div><div class="operators-grid">${dualOps.map((op) => this.renderOperatorCard(op)).join('')}</div></div>`
        : '<p class="empty-state" style="padding: 2rem; text-align: center; font-family: var(--font-mono); color: var(--ak-text-dim);">Belum ada operator dengan tautan jabatan angkatan yang terverifikasi.</p>';
      container.querySelectorAll('.operator-card').forEach((card) => {
        this.bindOperatorCard(card);
      });
      return;
    }

    let html = '';
    const normFilter = divisionFilter.toLowerCase();

    if (normFilter === 'bph') {
      html += this.renderBphGroup(bphOps);
    }

    if (normFilter === 'all') {
      const departmentHtml = sortedDepts.map((dept, index) => {
        const deptOps = allOps.filter((op) => opBelongsToDept(op, dept));
        return this.renderDepartmentGroup(dept, deptOps, index);
      }).join('');

      // Any remaining operator not in BPH or in listed departments
      const accountedOps = new Set([
        ...bphOps,
        ...sortedDepts.flatMap((dept) => allOps.filter((op) => opBelongsToDept(op, dept)))
      ]);
      const orphanOps = allOps.filter((op) => !accountedOps.has(op));
      let orphanHtml = '';
      if (orphanOps.length > 0) {
        orphanHtml = `
          <div class="department-group-block">
            <div class="department-group-header">
              <div class="department-group-tag">PERSONEL LAINNYA // AD-HOC</div>
              <h3 class="department-group-title">ANGGOTA DAN FUNGSIONARIS LAINNYA</h3>
            </div>
            <div class="operators-grid">
              ${orphanOps.map((op) => this.renderOperatorCard(op)).join('')}
            </div>
          </div>
        `;
      }
      html = `
        <div class="org-chart">
          <div class="org-chart-tree">
            <div class="org-chart-root">${this.renderBphGroup(bphOps)}</div>
            <div class="org-chart-branches">${departmentHtml || '<p class="empty-state">Belum ada departemen.</p>'}</div>
            ${orphanHtml}
          </div>
          <aside id="org-node-detail" class="org-detail-panel" aria-live="polite" aria-label="Detail struktur terpilih"></aside>
        </div>
      `;
    } else if (normFilter !== 'bph') {
      // Find matching department by ID or Code or Name
      const matchedDeptIndex = sortedDepts.findIndex((d) => (
        d.id.toLowerCase() === normFilter
        || d.code.toLowerCase() === normFilter
        || d.name.toLowerCase().includes(normFilter)
      ));

      if (matchedDeptIndex !== -1) {
        const dept = sortedDepts[matchedDeptIndex];
        const deptOps = allOps.filter((op) => opBelongsToDept(op, dept));
        html += this.renderDepartmentGroup(dept, deptOps, matchedDeptIndex);
      } else {
        // Fallback for custom division string
        const fallbackOps = allOps.filter((op) => (op.division || '').toLowerCase() === normFilter);
        if (fallbackOps.length > 0) {
          html += `
            <div class="department-group-block">
              <div class="department-group-header">
                <div class="department-group-tag">DIVISI // ${escapeHtml(divisionFilter.toUpperCase())}</div>
                <h3 class="department-group-title">${escapeHtml(divisionFilter)}</h3>
              </div>
              <div class="operators-grid">
                ${fallbackOps.map((op) => this.renderOperatorCard(op)).join('')}
              </div>
            </div>
          `;
        } else {
          html = `<p class="empty-state" style="padding: 2rem; text-align: center; font-family: var(--font-mono); color: var(--ak-text-dim);">Tidak ada operator yang ditemukan untuk filter "${escapeHtml(divisionFilter)}".</p>`;
        }
      }
    }

    container.innerHTML = html;

    container.querySelectorAll('.operator-card').forEach((card) => this.bindOperatorCard(card));
    container.querySelectorAll('[data-org-select]').forEach((node) => {
      node.addEventListener('click', () => {
        const type = node.dataset.orgSelect;
        const departmentId = type === 'bph' ? 'bph' : node.dataset.deptId;
        const divisionId = type === 'division' ? node.dataset.divisionId : '';
        if (type === 'bph') this.switchTab('squad', { departmentId, focus: false, scroll: false, restoreOrganizationFocus: true });
        else this.switchTab('department', { departmentId, divisionId, focus: false, scroll: false });
      });
    });
    if (normFilter === 'all') this.renderOrganizationDetail(bphOps, sortedDepts);
  }

  renderOrganizationDetail(bphOperators, departments) {
    const panel = document.getElementById('org-node-detail');
    if (!panel) return;

    const operators = Array.isArray(HMIF_DATA.operators) ? HMIF_DATA.operators : [];
    let title = 'BADAN PENGURUS HARIAN (BPH)';
    let label = 'STRUKTUR ORGANISASI';
    let description = 'Pimpinan inti organisasi dan akar struktur kepengurusan.';
    let assignedOperators = bphOperators;
    let selectedDivision = null;
    let department = null;

    if (this.selectedDivisionId) {
      department = departments.find((item) => item.id === this.selectedDepartmentId);
      selectedDivision = department?.divisions?.find((item) => item.id === this.selectedDivisionId) || null;
      if (selectedDivision) {
        title = selectedDivision.name;
        label = `DIVISI ${selectedDivision.code || selectedDivision.id} // ${department.code}`;
        description = selectedDivision.description || `Divisi di bawah ${department.name}.`;
        assignedOperators = operators.filter((operator) => operator.departmentId === department.id && (
          operator.divisionId === selectedDivision.id
          || (!operator.divisionId && String(operator.division || '').toLowerCase() === selectedDivision.name.toLowerCase())
        ));
      }
    } else if (this.selectedDepartmentId && this.selectedDepartmentId !== 'bph') {
      department = departments.find((item) => item.id === this.selectedDepartmentId);
      if (department) {
        title = department.name;
        label = `DEPARTEMEN ${department.code}`;
        description = department.description || 'Pusat koordinasi dan pelaksanaan program kerja.';
        assignedOperators = operators.filter((operator) => operator.departmentId === department.id);
      }
    }

    const sortedOperators = [...assignedOperators].sort((first, second) => {
      const order = { bph_leader: 1, bph_executive: 2, kadep: 3, sekdep: 4, staff: 5 };
      return (order[first.roleLevel] || 9) - (order[second.roleLevel] || 9);
    });
    const detailBadges = selectedDivision
      ? new Map(sortedOperators.map((operator) => [operator.id, `${selectedDivision.code || selectedDivision.name} // ${operator.roleLevel === 'staff' ? 'ANGGOTA' : operator.role}`]))
      : new Map();

    panel.innerHTML = `
      <div class="org-detail-heading">
        <span class="department-group-tag">${escapeHtml(label)}</span>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(description)}</p>
        ${department ? `<div class="org-detail-meta"><span>${department.divisions?.length || 0} DIVISI</span><span>${sortedOperators.length} PENGURUS</span></div>` : `<div class="org-detail-meta"><span>${sortedOperators.length} PENGURUS</span></div>`}
      </div>
      ${sortedOperators.length
        ? `<div class="org-detail-operators">${sortedOperators.map((operator) => this.renderOperatorCard(operator, detailBadges.get(operator.id) || '')).join('')}</div>`
        : '<p class="dept-empty-notice">Belum ada pengurus yang ditempatkan pada bagian ini.</p>'}
    `;
    panel.querySelectorAll('.operator-card').forEach((card) => this.bindOperatorCard(card));
  }

  renderDepartmentPage(departmentId, selectedDivisionId = '') {
    const container = document.getElementById('department-page-content');
    if (!container) return;
    const department = (HMIF_DATA.departments || []).find((item) => item.id === departmentId);
    if (!department) {
      container.innerHTML = '<p class="empty-state">Departemen tidak ditemukan.</p>';
      return;
    }

    const operators = (HMIF_DATA.operators || []).filter((operator) => operator.departmentId === department.id);
    const divisions = Array.isArray(department.divisions)
      ? [...department.divisions].sort((first, second) => (first.order || 0) - (second.order || 0))
      : [];
    const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const departmentAliases = [department.code, department.name, department.name.replace(/^departemen\s+/i, ''), department.id];
    const departmentDivisionIds = new Set(divisions.map((division) => division.id));
    const matchesAliases = (value, aliases) => {
      const normalizedValue = normalize(value);
      return Boolean(normalizedValue) && aliases.some((alias) => {
        const normalizedAlias = normalize(alias);
        return normalizedAlias && (normalizedValue === normalizedAlias || normalizedValue.includes(normalizedAlias));
      });
    };
    const matchesDivision = (item, division) => item.divisionId === division.id
      || [item.division, item.type, item.integratedWith].some((value) => matchesAliases(value, [division.id, division.code, division.name]));
    const departmentPrograms = (HMIF_DATA.proker || []).filter((program) => (
      program.departmentId === department.id
      || departmentDivisionIds.has(program.divisionId)
      || matchesAliases(program.division, departmentAliases)
    ));
    const allEvents = HMIF_DATA.calendarSchedule || [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const departmentEvents = allEvents.filter((event) => (
      matchesAliases(event.division, departmentAliases)
      || matchesAliases(event.type, departmentAliases)
      || matchesAliases(event.integratedWith, departmentAliases)
    )).filter((event) => {
      const date = new Date(`${event.date || event.date_str}T00:00:00`);
      return !Number.isNaN(date.getTime()) && date >= today;
    }).sort((first, second) => String(first.date).localeCompare(String(second.date)));

    const programStatus = (status) => ({
      active: ['active', 'IN PROGRESS'],
      completed: ['completed', 'SELESAI'],
      upcoming: ['upcoming', 'MENDATANG']
    }[status] || ['upcoming', status || 'MENDATANG']);
    const renderPrograms = (programs) => programs.length
      ? `<div class="department-program-list">${programs.map((program) => {
        const [statusClass, statusLabel] = programStatus(program.status);
        return `
          <article class="department-program-item">
            <div class="department-item-meta"><span>${escapeHtml(program.category || 'PROGRAM KERJA')}</span><span class="department-status ${escapeHtml(statusClass)}">${escapeHtml(statusLabel)}</span></div>
            <h4>${escapeHtml(program.title)}</h4>
            <p>${escapeHtml(program.desc || program.description || '')}</p>
            <div class="department-program-facts"><span>JADWAL <strong>${escapeHtml(program.date || program.date_start || 'Belum ditentukan')}</strong></span><span>INDIKATOR <strong>${escapeHtml(program.kpi || program.kpi_indicator || 'Belum ditentukan')}</strong></span></div>
          </article>
        `;
      }).join('')}</div>`
      : '<p class="department-empty-line">Belum ada program kerja yang ditautkan ke bagian ini.</p>';
    const renderEvents = (events) => events.length
      ? `<div class="department-event-list">${events.map((event) => `
        <article class="department-event-item">
          <time datetime="${escapeHtml(event.date || event.date_str)}">${escapeHtml(new Date(`${event.date || event.date_str}T00:00:00`).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }))}</time>
          <div><h4>${escapeHtml(event.title)}</h4><p>${escapeHtml(event.desc || event.description || '')}</p><span>${escapeHtml(event.location || event.integratedWith || event.division || '')}</span></div>
        </article>
      `).join('')}</div>`
      : '<p class="department-empty-line">Belum ada agenda mendatang yang ditautkan ke bagian ini.</p>';

    const assignedProgramIds = new Set();
    const assignedDivisionOperatorIds = new Set();
    const departmentLeadership = operators.filter((operator) => ['kadep', 'sekdep'].includes(operator.roleLevel)
      || /kepala departemen|kadep|sekretaris departemen|sekdep/i.test(operator.role || ''));
    const divisionMarkup = divisions.map((division) => {
      const divisionAliases = [division.id, division.code, division.name];
      const divisionOperators = operators.filter((operator) => {
        const belongs = !departmentLeadership.includes(operator) && (operator.divisionId === division.id
          || (!operator.divisionId && matchesAliases(operator.division, divisionAliases)));
        if (belongs) assignedDivisionOperatorIds.add(operator.id);
        return belongs;
      });
      const divisionPrograms = departmentPrograms.filter((program) => program.divisionId === division.id
        || matchesAliases(program.division, divisionAliases));
      divisionPrograms.forEach((program) => assignedProgramIds.add(program.id));
      const divisionEvents = departmentEvents.filter((event) => matchesDivision(event, division));
      const isSelected = selectedDivisionId === division.id;
      return `
        <article class="department-division-detail ${isSelected ? 'selected' : ''}" data-department-division="${escapeHtml(division.id)}">
          <header class="department-division-heading">
            <div><span class="section-tag">${escapeHtml(division.code || division.id)}</span><h3>${escapeHtml(division.name)}</h3></div>
            <span class="department-division-count">${divisionOperators.length} PENGURUS</span>
          </header>
          <p class="department-division-duty">${escapeHtml(division.description || 'Tugas divisi ditetapkan dan dievaluasi melalui program kerja departemen.')}</p>
          <div class="department-division-roster">
            ${divisionOperators.length
          ? divisionOperators.map((operator) => this.renderOperatorCard(operator)).join('')
          : '<p class="department-empty-line">Belum ada pengurus yang ditempatkan di divisi ini.</p>'}
          </div>
          <div class="department-work-columns">
            <section><h4>PROGRAM KERJA DIVISI</h4>${renderPrograms(divisionPrograms)}</section>
            <section><h4>AGENDA DIVISI</h4>${renderEvents(divisionEvents)}</section>
          </div>
        </article>
      `;
    }).join('');
    const departmentLevelPrograms = departmentPrograms.filter((program) => !assignedProgramIds.has(program.id));
    const departmentUnassignedOperators = operators.filter((operator) => (
      !departmentLeadership.includes(operator) && !assignedDivisionOperatorIds.has(operator.id)
    ));

    container.innerHTML = `
      <button class="department-back-link" type="button" data-back-hierarchy>← KEMBALI KE HIERARKI PENGURUS</button>
      <header class="department-page-heading">
        ${department.emblem ? `<img src="${escapeHtml(department.emblem)}" alt="Emblem ${escapeHtml(department.code)}" />` : ''}
        <div><span class="section-tag gold">DEPARTEMEN ${escapeHtml(department.code)}</span><h1>${escapeHtml(department.name)}</h1><p>${escapeHtml(department.description || '')}</p></div>
      </header>
      <div class="department-page-metrics"><span>${divisions.length} <small>DIVISI</small></span><span>${operators.length} <small>PENGURUS</small></span><span>${departmentPrograms.length} <small>PROGRAM KERJA</small></span><span>${departmentEvents.length} <small>AGENDA MENDATANG</small></span></div>
      <section class="department-page-section">
        <header class="department-page-section-heading"><span class="section-tag">MANDAT ORGANISASI</span><h2>TUGAS POKOK & FUNGSI</h2></header>
        <ul class="department-duty-list">${(department.responsibilities?.length ? department.responsibilities : [department.description || 'Tugas dan fungsi departemen ditetapkan melalui program kerja organisasi.']).map((duty) => `<li>${escapeHtml(duty)}</li>`).join('')}</ul>
      </section>
      <section class="department-page-section">
        <header class="department-page-section-heading"><span class="section-tag">STRUKTUR PIMPINAN</span><h2>KADEP & SEKDEP</h2></header>
        <div class="department-leadership-roster">${departmentLeadership.length
        ? departmentLeadership.map((operator) => this.renderOperatorCard(operator)).join('')
        : '<p class="department-empty-line">Pimpinan departemen belum ditetapkan.</p>'}</div>
        ${departmentUnassignedOperators.length ? `<div class="department-general-roster"><h3>PENGURUS BELUM DITEMPATKAN PADA DIVISI</h3><div class="department-leadership-roster">${departmentUnassignedOperators.map((operator) => this.renderOperatorCard(operator)).join('')}</div></div>` : ''}
      </section>
      <section class="department-page-section">
        <header class="department-page-section-heading"><span class="section-tag gold">STRUKTUR INTERNAL</span><h2>DIVISI & TANGGUNG JAWAB</h2></header>
        <div class="department-divisions-list">${divisionMarkup || '<p class="department-empty-line">Belum ada divisi pada departemen ini.</p>'}</div>
      </section>
      <section class="department-page-section">
        <header class="department-page-section-heading"><span class="section-tag red">KOORDINASI DEPARTEMEN</span><h2>PROGRAM & AGENDA DEPARTEMEN</h2></header>
        <div class="department-work-columns">
          <section><h3>PROGRAM KERJA DEPARTEMEN</h3>${renderPrograms(departmentLevelPrograms)}</section>
          <section><h3>AGENDA TERKAIT</h3>${renderEvents(departmentEvents.filter((event) => !divisions.some((division) => matchesDivision(event, division))))}</section>
        </div>
      </section>
    `;
    container.querySelectorAll('.operator-card').forEach((card) => this.bindOperatorCard(card));
    container.querySelector('[data-back-hierarchy]')?.addEventListener('click', () => {
      this.switchTab('squad', { departmentId: department.id, divisionId: selectedDivisionId });
    });
  }

  bindOperatorCard(card) {
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Buka profil ${card.querySelector('.operator-name')?.textContent || 'pengurus'}`);
    const openProfile = () => this.openOperatorModal(card.getAttribute('data-op-id'));
    card.addEventListener('click', openProfile);
    card.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openProfile();
    });
  }

  openOperatorModal(opId) {
    const op = HMIF_DATA.operators.find((o) => o.id === opId);
    if (!op) return;

    const modalBody = document.getElementById('prts-modal-content');
    const modalTitle = document.getElementById('prts-modal-title');
    if (!modalBody || !modalTitle) return;

    modalTitle.textContent = `OPERATOR FILE // ${op.codeName} - ${op.name}`;
    modalBody.innerHTML = `
      <div style="display: grid; grid-template-columns: 200px 1fr; gap: 1.5rem; align-items: start;">
        <div style="border: 1px solid var(--ak-cyan); clip-path: var(--clip-corner-top-right); overflow: hidden; background: #000;">
          <img src="${escapeHtml(op.avatar)}" alt="${escapeHtml(op.name)}" style="width: 100%; height: 240px; object-fit: cover;" />
          <div style="padding: 0.5rem; background: rgba(0, 229, 255, 0.1); font-family: var(--font-mono); font-size: 0.72rem; text-align: center; color: var(--ak-cyan);">
            CODE: ${escapeHtml(op.codeName)} // ${'★'.repeat(op.rarity)}
          </div>
        </div>

        <div>
          <div style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--ak-gold); margin-bottom: 0.25rem;">
            ${escapeHtml(op.division)} // ${escapeHtml(op.operatorClass)} ${op.roleLevel === 'kadep' ? '// [KEPALA DEPARTEMEN]' : op.roleLevel === 'sekdep' ? '// [SEKRETARIS DEPARTEMEN]' : op.roleLevel?.startsWith('bph') ? '// [PIMPINAN BPH]' : ''}
          </div>
          <h2 style="font-family: var(--font-title); font-size: 1.6rem; color: #fff; margin-bottom: 0.5rem;">${escapeHtml(op.name)}</h2>
          <div style="font-family: var(--font-mono); font-size: 0.85rem; color: var(--ak-text-secondary); margin-bottom: 1.25rem;">
            Jabatan: <strong style="color: var(--ak-cyan);">${escapeHtml(op.role)}</strong> | Angkatan: ${escapeHtml(op.generation)}
          </div>

          <div style="background: rgba(14, 20, 31, 0.8); border: 1px solid var(--ak-border); padding: 1rem; margin-bottom: 1.25rem;">
            <div style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--ak-text-dim); margin-bottom: 0.35rem;">KOMPETENSI / SPECIALTY:</div>
            <div style="color: var(--ak-text-primary); font-size: 0.92rem;">${escapeHtml(op.specialty)}</div>
          </div>

          <div style="background: rgba(255, 222, 0, 0.08); border-left: 3px solid var(--ak-gold); padding: 0.85rem; margin-bottom: 1.5rem; font-style: italic; color: var(--ak-text-secondary); font-size: 0.9rem;">
            "${escapeHtml(op.quote)}"
          </div>

          ${this.renderDualDeployment(op)}

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; font-family: var(--font-mono); font-size: 0.75rem;">
            <div style="background: rgba(18, 24, 36, 0.6); padding: 0.5rem; border: 1px solid var(--ak-border);">
              Leadership Index: <strong style="color: var(--ak-gold);">${op.stats.leadership}/100</strong>
            </div>
            <div style="background: rgba(18, 24, 36, 0.6); padding: 0.5rem; border: 1px solid var(--ak-border);">
              Tech / Code Skill: <strong style="color: var(--ak-cyan);">${op.stats.coding}/100</strong>
            </div>
            <div style="background: rgba(18, 24, 36, 0.6); padding: 0.5rem; border: 1px solid var(--ak-border);">
              Strategy & Tactics: <strong style="color: var(--ak-cyan);">${op.stats.strategy}/100</strong>
            </div>
            <div style="background: rgba(18, 24, 36, 0.6); padding: 0.5rem; border: 1px solid var(--ak-border);">
              Constitutional Integrity: <strong style="color: var(--ak-green);">${op.stats.integrity}/100</strong>
            </div>
          </div>
        </div>
      </div>
    `;

    this.openModal();
  }

  // ------------------------------------------------------------------------
  // STRUKTUR & BATALION ANGKATAN (COHORT BATTALIONS)
  // ------------------------------------------------------------------------
  renderCohortBattalions() {
    const container = document.getElementById('cohort-roster-container');
    if (!container) return;

    const rawGens = Array.isArray(HMIF_DATA.generations) ? HMIF_DATA.generations : [];
    const generations = [...rawGens].sort((a, b) => (a.order || 0) - (b.order || 0));

    if (generations.length === 0) {
      container.innerHTML = `
        <div class="empty-state-card" style="padding: 2.5rem; text-align: center; border: 1px dashed var(--ak-border); background: var(--ak-bg-card);">
          <span style="font-family: var(--font-mono); color: var(--ak-cyan); font-size: 0.9rem;">[DATABASE BELUM MEMUAT STRUKTUR ANGKATAN]</span>
          <p style="font-size: 0.85rem; color: var(--ak-text-secondary); margin-top: 0.5rem;">Pengurus dapat mengkonfigurasi dan menambahkan Batalion Angkatan melalui Site Studio.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = generations.map((gen) => {
      // Socials pills
      const soc = gen.socials || {};
      const socialLinks = [
        soc.instagram ? `<a href="${escapeHtml(soc.instagram)}" target="_blank" rel="noopener noreferrer" class="cohort-social-btn ig" title="Instagram Resmi Angkatan ${escapeHtml(gen.year)}">📸 <span>@INSTAGRAM</span></a>` : '',
        soc.tiktok ? `<a href="${escapeHtml(soc.tiktok)}" target="_blank" rel="noopener noreferrer" class="cohort-social-btn tt" title="TikTok Resmi Angkatan ${escapeHtml(gen.year)}">🎵 <span>TIKTOK</span></a>` : '',
        soc.whatsapp ? `<a href="${escapeHtml(soc.whatsapp)}" target="_blank" rel="noopener noreferrer" class="cohort-social-btn wa" title="Grup WhatsApp Angkatan ${escapeHtml(gen.year)}">💬 <span>WHATSAPP</span></a>` : '',
        soc.linkedin ? `<a href="${escapeHtml(soc.linkedin)}" target="_blank" rel="noopener noreferrer" class="cohort-social-btn li" title="LinkedIn Angkatan ${escapeHtml(gen.year)}">💼 <span>LINKEDIN</span></a>` : '',
        soc.github ? `<a href="${escapeHtml(soc.github)}" target="_blank" rel="noopener noreferrer" class="cohort-social-btn gh" title="GitHub Repository Angkatan ${escapeHtml(gen.year)}">🐙 <span>GITHUB</span></a>` : ''
      ].filter(Boolean).join('');

      // Leadership cards
      const leadership = gen.leadership || {};
      const roles = [
        { key: 'ketua', defaultTitle: 'Ketua Angkatan (Komti)', icon: '👑', isPrimary: true },
        { key: 'wakil', defaultTitle: 'Wakil Ketua Angkatan', icon: '⚔️', isPrimary: true },
        { key: 'sekretaris', defaultTitle: 'Sekretaris Angkatan', icon: '📜', isPrimary: false },
        { key: 'bendahara', defaultTitle: 'Bendahara Angkatan', icon: '💎', isPrimary: false }
      ];

      const leaderCards = roles.map(({ key, defaultTitle, icon, isPrimary }) => {
        const item = leadership[key] || {};
        const title = item.title || defaultTitle;
        const dualOperator = this.getCohortOperator(item.operatorId);
        const name = dualOperator?.name || item.name || 'Belum Ditetapkan';
        const dualBadge = dualOperator ? `<span class="dual-role-badge">HMIF: ${escapeHtml(dualOperator.role)} · ${escapeHtml(dualOperator.division || 'BPH')}</span>` : '';
        const avatar = dualOperator?.avatar || item.avatar || (key === 'sekretaris' || key === 'wakil' ? '/assets/silhouette_female.jpg' : '/assets/silhouette_male.jpg');

        return `
          <div class="cohort-leader-card ${isPrimary ? 'primary-leader' : ''}">
            <div class="cohort-leader-avatar-wrap">
              <img src="${escapeHtml(avatar)}" alt="${escapeHtml(name)}" class="cohort-leader-avatar" />
              <span class="cohort-leader-icon">${icon}</span>
            </div>
            <div class="cohort-leader-details">
              <span class="cohort-leader-badge">${escapeHtml(title)}</span>
              <strong class="cohort-leader-name">${escapeHtml(name)}</strong>
              ${dualBadge}
            </div>
          </div>
        `;
      }).join('');

      // Perangkat Angkatan (Divisions)
      const divisions = Array.isArray(gen.divisions) ? gen.divisions : [];
      const divisionsHtml = divisions.length > 0 ? `
        <div class="cohort-divisions-section">
          <div class="cohort-divisions-header">
            <span class="section-tag cyan" style="margin: 0; font-size: 0.72rem;">PERANGKAT ANGKATAN</span>
            <span class="cohort-divisions-title">${divisions.length} DIVISI INTERNAL ANGKATAN ${escapeHtml(gen.year)}</span>
          </div>
          <div class="cohort-divisions-grid">
            ${divisions.map((div) => `
              <div class="cohort-division-item">
                <div class="cohort-div-top">
                  <span class="cohort-div-name">${escapeHtml(div.name)}</span>
                </div>
                <div class="cohort-div-coord">
                  <span class="coord-label">KOORDINATOR:</span>
                  ${(this.getCohortOperator(div.coordinatorOperatorId)?.avatar || div.coordinatorAvatar) ? `<img class="cohort-person-avatar" src="${escapeHtml(this.getCohortOperator(div.coordinatorOperatorId)?.avatar || div.coordinatorAvatar)}" alt="" />` : ''}
                  <span class="coord-val">${escapeHtml(this.getCohortOperator(div.coordinatorOperatorId)?.name || div.coordinator || '-')}</span>
                  ${this.getCohortOperator(div.coordinatorOperatorId) ? `<span class="dual-role-badge">HMIF: ${escapeHtml(this.getCohortOperator(div.coordinatorOperatorId).role)} · ${escapeHtml(this.getCohortOperator(div.coordinatorOperatorId).division || 'BPH')}</span>` : ''}
                </div>
                ${Array.isArray(div.members) && div.members.length > 0 ? `
                  <div class="cohort-div-members">
                    <span class="members-label">ANGGOTA (${div.members.length}):</span>
                    <div class="cohort-member-chips">
                      ${div.members.map((entry) => {
        const member = typeof entry === 'string' ? { name: entry } : entry;
        const operator = this.getCohortOperator(member.operatorId);
        const name = operator?.name || member.name || '';
        const avatar = member.avatar || operator?.avatar;
        return `<span class="cohort-member-chip">${avatar ? `<img class="cohort-person-avatar" src="${escapeHtml(avatar)}" alt="" />` : ''}${escapeHtml(name)}</span>`;
      }).join('')}
                    </div>
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      ` : '';

      return `
        <article class="cohort-card" data-cohort-year="${escapeHtml(gen.year)}" id="cohort-${escapeHtml(gen.id)}">
          <div class="cohort-card-inner">
            <div class="cohort-banner">
              <div class="cohort-emblem-wrap">
                ${gen.emblem ? `<img src="${escapeHtml(gen.emblem)}" alt="Emblem Angkatan ${escapeHtml(gen.year)}" class="cohort-emblem-img" />` : '<div class="cohort-no-emblem"><span>✦</span></div>'}
              </div>
              <div class="cohort-info-header">
                <div class="cohort-badge-row">
                  <span class="cohort-year-pill">ANGKATAN ${escapeHtml(gen.year)}</span>
                  <span class="cohort-status-pill">${escapeHtml(gen.status || 'CADET CORPS')}</span>
                </div>
                <h3 class="cohort-battalion-name">${escapeHtml(gen.name)}</h3>
                ${gen.tagline ? `<p class="cohort-tagline">"${escapeHtml(gen.tagline)}"</p>` : ''}
                <p class="cohort-desc">${escapeHtml(gen.description || '')}</p>
                ${socialLinks ? `<div class="cohort-social-pills">${socialLinks}</div>` : ''}
              </div>
            </div>

            <div class="cohort-body">
              <div class="cohort-leadership-wrap">
                <div class="cohort-subhead">
                  <span class="subhead-tag">LEADERSHIP CADRE</span>
                  <h4>PIMPINAN & PRESEDIUM ANGKATAN ${escapeHtml(gen.year)}</h4>
                </div>
                <div class="cohort-leadership-grid">
                  ${leaderCards}
                </div>
              </div>

              ${divisionsHtml}

              <div class="cohort-footer-bar">
                <div class="cohort-footer-meta">
                  <span class="hazard-strip-sm"></span>
                  <span>BATALION REGIMENT // CLASS OF ${escapeHtml(gen.year)} // HMIF-UMB</span>
                </div>
                <button class="btn-tactical cyan" type="button" data-view-cadets="${escapeHtml(gen.year)}">
                  <span>📁</span> LIHAT DOSSIER KADER ANGKATAN ${escapeHtml(gen.year)}
                </button>
              </div>
            </div>
          </div>
        </article>
      `;
    }).join('');

    // Attach click events to "LIHAT DOSSIER KADER ANGKATAN"
    container.querySelectorAll('[data-view-cadets]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const year = btn.getAttribute('data-view-cadets');
        this.openCohortCadetsModal(year);
      });
    });
  }

  async openCohortCadetsModal(year) {
    const title = document.getElementById('prts-modal-title');
    const content = document.getElementById('prts-modal-content');
    if (!title || !content) return;

    const gen = (HMIF_DATA.generations || []).find((g) => String(g.year) === String(year)) || {
      year,
      name: `ANGKATAN ${year}`,
      status: 'CADET CORPS',
      tagline: ''
    };

    title.textContent = `DOSSIER KADER // BATALION ANGKATAN ${year}`;
    content.innerHTML = `
      <div style="padding: 2rem; text-align: center; font-family: var(--font-mono);">
        <span class="status-dot"></span> Mengakses berkas dossier kader angkatan ${escapeHtml(year)}...
      </div>
    `;
    this.openModal();

    // Query cadets from database
    let cadets = [];
    try {
      const result = await this.api.getCadets();
      if (result.ok && Array.isArray(result.data?.cadets)) {
        cadets = result.data.cadets;
      }
    } catch (e) {
      console.warn('Could not fetch cadets API:', e);
    }

    // Filter cadets matching year
    const matchedCadets = cadets.filter((c) => String(c.generation) === String(year) || String(c.nim || '').startsWith(String(year).slice(2)));

    // Also find operators matching year
    const allOperators = HMIF_DATA.operators || [];
    const linkedOperators = allOperators.filter((op) => this.getCohortPosts(op).some((post) => String(post.year) === String(year)));
    const cohortOperators = allOperators.filter((op) => String(op.generation) === String(year) || String(op.nim || '').startsWith(String(year).slice(2)));
    const operators = [...new Map([...cohortOperators, ...linkedOperators].map((op) => [op.id, op])).values()];
    const dossierCadets = matchedCadets.filter((cadet) => !operators.some((op) => (
      String(op.nim || '') === String(cadet.nim || '')
      && String(op.name || '').trim().toLowerCase() === String(cadet.name || '').trim().toLowerCase()
    )));
    const dualOperators = linkedOperators;

    // Leadership & Devices from gen
    const leadership = gen.leadership || {};
    const divisions = Array.isArray(gen.divisions) ? gen.divisions : [];

    content.innerHTML = `
      <div class="cohort-dossier-modal">
        <div class="cohort-dossier-header">
          <div class="cohort-dossier-badges">
            <span class="cohort-year-pill">ANGKATAN ${escapeHtml(year)}</span>
            <span class="cohort-status-pill">${escapeHtml(gen.status || 'CADET CORPS')}</span>
            <span class="section-tag gold" style="margin: 0;">${dossierCadets.length > 0 ? `${dossierCadets.length} KADER TERDAFTAR` : 'DOSSIER TAKTIS'}</span>
          </div>
          <h3 class="cohort-dossier-title">${escapeHtml(gen.name)}</h3>
          ${gen.tagline ? `<p class="cohort-dossier-tagline">"${escapeHtml(gen.tagline)}"</p>` : ''}
          <p class="cohort-dossier-desc">${escapeHtml(gen.description || '')}</p>
        </div>

        <div class="cohort-dossier-tabs">
          <div class="cohort-subhead" style="margin-bottom: 0.75rem;">
            <span class="subhead-tag">PIMPINAN & PRESEDIUM ANGKATAN</span>
            <h4 style="color: var(--ak-cyan); font-size: 0.95rem; margin: 0;">STRUKTUR INTI BATALION ${escapeHtml(year)}</h4>
          </div>
          <div class="cohort-leadership-grid" style="margin-bottom: 1.5rem;">
            ${[
        { role: 'Ketua Angkatan (Komti)', data: leadership.ketua },
        { role: 'Wakil Ketua Angkatan', data: leadership.wakil },
        { role: 'Sekretaris Angkatan', data: leadership.sekretaris },
        { role: 'Bendahara Angkatan', data: leadership.bendahara }
      ].map(({ role, data }) => `
              <div class="cohort-leader-card">
                <div class="cohort-leader-avatar-wrap">
                    <img src="${escapeHtml(this.getCohortOperator(data?.operatorId)?.avatar || data?.avatar || '/assets/silhouette_male.jpg')}" alt="${escapeHtml(data?.name || role)}" class="cohort-leader-avatar" />
                </div>
                <div class="cohort-leader-details">
                  <span class="cohort-leader-badge">${escapeHtml(data?.title || role)}</span>
                  <strong class="cohort-leader-name">${escapeHtml(this.getCohortOperator(data?.operatorId)?.name || data?.name || 'Belum Ditetapkan')}</strong>
                  ${this.getCohortOperator(data?.operatorId) ? `<span class="dual-role-badge">HMIF: ${escapeHtml(this.getCohortOperator(data.operatorId).role)} · ${escapeHtml(this.getCohortOperator(data.operatorId).division || 'BPH')}</span>` : ''}
                </div>
              </div>
            `).join('')}
          </div>

          ${divisions.length > 0 ? `
            <div class="cohort-subhead" style="margin-bottom: 0.75rem;">
              <span class="subhead-tag">BAGIAN PERANGKAT ANGKATAN</span>
              <h4 style="color: var(--ak-gold); font-size: 0.95rem; margin: 0;">DIVISI INTERNAL & ANGGOTA</h4>
            </div>
            <div class="cohort-divisions-grid" style="margin-bottom: 1.5rem;">
              ${divisions.map((d) => `
                <div class="cohort-division-item">
                  <div class="cohort-div-top">
                    <span class="cohort-div-name">${escapeHtml(d.name)}</span>
                  </div>
                  <div class="cohort-div-coord">
                    <span class="coord-label">KOORDINATOR:</span>
                    ${(this.getCohortOperator(d.coordinatorOperatorId)?.avatar || d.coordinatorAvatar) ? `<img class="cohort-person-avatar" src="${escapeHtml(this.getCohortOperator(d.coordinatorOperatorId)?.avatar || d.coordinatorAvatar)}" alt="" />` : ''}
                    <span class="coord-val">${escapeHtml(this.getCohortOperator(d.coordinatorOperatorId)?.name || d.coordinator || '-')}</span>
                    ${this.getCohortOperator(d.coordinatorOperatorId) ? `<span class="dual-role-badge">HMIF: ${escapeHtml(this.getCohortOperator(d.coordinatorOperatorId).role)} · ${escapeHtml(this.getCohortOperator(d.coordinatorOperatorId).division || 'BPH')}</span>` : ''}
                  </div>
                  ${Array.isArray(d.members) && d.members.length > 0 ? `
                    <div class="cohort-div-members">
                      <span class="members-label">ANGGOTA (${d.members.length}):</span>
                      <div class="cohort-member-chips">
                        ${d.members.map((entry) => {
        const member = typeof entry === 'string' ? { name: entry } : entry;
        const operator = this.getCohortOperator(member.operatorId);
        const name = operator?.name || member.name || '';
        const avatar = member.avatar || operator?.avatar;
        return `<span class="cohort-member-chip">${avatar ? `<img class="cohort-person-avatar" src="${escapeHtml(avatar)}" alt="" />` : ''}${escapeHtml(name)}</span>`;
      }).join('')}
                      </div>
                    </div>
                  ` : ''}
                </div>
              `).join('')}
            </div>
          ` : ''}

          <div class="cohort-subhead" style="margin-bottom: 0.75rem;">
            <span class="subhead-tag">OPERATOR HMIF ASAL ANGKATAN</span>
            <h4 style="color: var(--ak-text-primary); font-size: 0.95rem; margin: 0;">PENGURUS AKTIF HIMPUNAN (${operators.length} Personel)</h4>
          </div>
          ${operators.length > 0 ? `
            <div class="cohort-operators-roster" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.75rem; margin-bottom: 1.5rem;">
              ${operators.map((op) => `
                <div class="cohort-op-chip" style="background: rgba(14, 20, 31, 0.7); border: 1px solid var(--ak-border); padding: 0.75rem; display: flex; gap: 0.65rem; align-items: center;">
                  <img src="${escapeHtml(op.avatar)}" alt="${escapeHtml(op.name)}" style="width: 42px; height: 42px; object-fit: cover; border: 1px solid var(--ak-cyan-border);" />
                  <div style="font-size: 0.8rem; overflow: hidden;">
                    <strong style="display: block; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; color: var(--ak-text-primary);">${escapeHtml(op.name)}</strong>
                    <small style="font-family: var(--font-mono); color: var(--ak-cyan); display: block;">${escapeHtml(op.role)}</small>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : '<p style="font-size: 0.8rem; color: var(--ak-text-dim); margin-bottom: 1.25rem;">Tidak ada fungsionaris HMIF yang berasal dari angkatan ini.</p>'}

          ${dualOperators.length ? `<section class="dual-deployment-dossier"><div class="dual-deployment-heading">DUAL-DEPLOYMENT TELEMETRY // ANGKATAN ${escapeHtml(year)}</div>${dualOperators.map((op) => this.renderDualDeployment(op, year)).join('')}</section>` : ''}

          ${dossierCadets.length > 0 ? `
            <div class="cohort-subhead" style="margin-bottom: 0.75rem;">
              <span class="subhead-tag">KADER TERDAFTAR DI DATABASE</span>
              <h4 style="color: var(--ak-text-primary); font-size: 0.95rem; margin: 0;">STATUS KADERISASI & CLEARANCE (${dossierCadets.length} Mahasiswa)</h4>
            </div>
            <div style="max-height: 240px; overflow-y: auto; border: 1px solid var(--ak-border); background: rgba(8, 12, 18, 0.6); padding: 0.5rem;">
              <table style="width: 100%; border-collapse: collapse; font-family: var(--font-mono); font-size: 0.75rem; text-align: left;">
                <thead>
                  <tr style="border-bottom: 1px solid var(--ak-border); color: var(--ak-text-dim);">
                    <th style="padding: 0.4rem;">NIM</th>
                    <th style="padding: 0.4rem;">NAMA MAHASISWA</th>
                    <th style="padding: 0.4rem;">TAHAP KADER</th>
                    <th style="padding: 0.4rem;">CLEARANCE</th>
                  </tr>
                </thead>
                <tbody>
                  ${dossierCadets.map((c) => `
                    <tr style="border-bottom: 1px solid rgba(45, 62, 90, 0.2);">
                      <td style="padding: 0.4rem; color: var(--ak-cyan);">${escapeHtml(c.nim)}</td>
                      <td style="padding: 0.4rem; font-weight: bold; color: var(--ak-text-primary);">${escapeHtml(c.name)}</td>
                      <td style="padding: 0.4rem; color: var(--ak-gold);">${escapeHtml(c.membership_stage || 'Kader')}</td>
                      <td style="padding: 0.4rem; color: var(--ak-text-secondary);">LVL ${escapeHtml(c.clearance_level ?? 1)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  // ------------------------------------------------------------------------
  // PROGRAM KERJA (MISSION MATRIX)
  // ------------------------------------------------------------------------
  renderProker(statusFilter = 'all') {
    const container = document.getElementById('proker-grid-container');
    if (!container) return;

    const filtered = statusFilter === 'all'
      ? HMIF_DATA.proker
      : HMIF_DATA.proker.filter((p) => p.status === statusFilter);

    container.innerHTML = filtered
      .map((p) => {
        let badgeClass = 'upcoming';
        let badgeText = 'UPCOMING';
        if (p.status === 'completed') {
          badgeClass = 'completed';
          badgeText = 'COMPLETED';
        } else if (p.status === 'active') {
          badgeClass = 'active';
          badgeText = 'IN PROGRESS';
        }

        return `
          <div class="proker-card">
            <div>
              <div class="proker-header">
                <span class="proker-division">DIVISI ${escapeHtml(p.division)} // ${escapeHtml(p.category)}</span>
                <span class="status-badge ${escapeHtml(badgeClass)}">${escapeHtml(badgeText)}</span>
              </div>
              <h3 class="proker-title">${escapeHtml(p.title)}</h3>
              <p class="proker-desc">${escapeHtml(p.desc)}</p>
            </div>

            <div>
              <div class="proker-meta-box">
                <div class="row">
                  <span class="k">Jadwal Misi:</span>
                  <span class="v">${escapeHtml(p.date)}</span>
                </div>
                <div class="row">
                  <span class="k">Sasaran:</span>
                  <span class="v">${escapeHtml(p.target)}</span>
                </div>
                <div class="row">
                  <span class="k">Indikator KPI:</span>
                  <span class="v" style="color: var(--ak-cyan);">${escapeHtml(p.kpi)}</span>
                </div>
              </div>

              <button class="btn-tactical" style="width: 100%; justify-content: center;" onclick="window.prtsApp.openProkerDetail('${p.id}')">
                DETAIL MISI &gt;&gt;
              </button>
            </div>
          </div>
        `;
      })
      .join('');
  }

  openProkerDetail(prokerId) {
    const p = HMIF_DATA.proker.find((item) => item.id === prokerId);
    if (!p) return;

    const modalBody = document.getElementById('prts-modal-content');
    const modalTitle = document.getElementById('prts-modal-title');
    if (!modalBody || !modalTitle) return;

    modalTitle.textContent = `MISSION BRIEF // ${p.title}`;
    modalBody.innerHTML = `
      <div style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--ak-gold); margin-bottom: 0.5rem;">
        KODE MISI: ${escapeHtml(p.id.toUpperCase())} // DIVISI ${escapeHtml(p.division)} // ${escapeHtml(p.category)}
      </div>
      <h2 style="font-family: var(--font-title); font-size: 1.5rem; color: var(--ak-text-primary); margin-bottom: 1rem;">
        ${escapeHtml(p.title)}
      </h2>
      <p style="color: var(--ak-text-secondary); line-height: 1.7; margin-bottom: 1.5rem; font-size: 0.95rem;">
        ${escapeHtml(p.desc)}
      </p>

      <div style="background: rgba(14, 20, 31, 0.8); border: 1px solid var(--ak-border); padding: 1.25rem; clip-path: var(--clip-corner-top-right); margin-bottom: 1.5rem; font-family: var(--font-mono); font-size: 0.85rem; display: flex; flex-direction: column; gap: 0.6rem;">
        <div><strong>Status Operasional:</strong> <span class="status-badge ${escapeHtml(p.status)}" style="margin-left: 0.5rem;">${escapeHtml(p.status.toUpperCase())}</span></div>
        <div><strong>Waktu Pelaksanaan:</strong> <span style="color: var(--ak-cyan);">${escapeHtml(p.date)}</span></div>
        <div><strong>Target Partisipan:</strong> <span>${escapeHtml(p.target)}</span></div>
        <div><strong>Key Performance Indicator (KPI):</strong> <span style="color: var(--ak-gold);">${escapeHtml(p.kpi)}</span></div>
      </div>

      <div style="background: rgba(0, 229, 255, 0.08); border-left: 3px solid var(--ak-cyan); padding: 1rem; font-family: var(--font-mono); font-size: 0.8rem; color: var(--ak-text-secondary);">
        PRTS PROTOCOL: Terintegrasi dengan Kalender Pendidikan Kampus Universitas Mayasari Bakti & AD/ART Bab IV perihal Garis-Garis Besar Haluan Organisasi (GBHO).
      </div>
    `;

    this.openModal();
  }

  // ------------------------------------------------------------------------
  // INTEGRATED ACADEMIC CALENDAR & DEPARTMENT PROKER
  // ------------------------------------------------------------------------
  renderCalendar(month, year) {
    const monthNames = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];

    const monthDisplay = document.getElementById('cal-month-display');
    if (monthDisplay) {
      monthDisplay.textContent = `${monthNames[month - 1]} ${year}`;
    }

    const grid = document.getElementById('calendar-days-grid');
    if (!grid) return;

    // Days in current month & first day weekday
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDayIndex = new Date(year, month - 1, 1).getDay(); // 0 = Sunday

    // Headers
    const daysOfWeek = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    let gridHtml = daysOfWeek
      .map((d) => `<div class="cal-day-header">${d}</div>`)
      .join('');

    // Blank cells before first day
    for (let i = 0; i < firstDayIndex; i++) {
      gridHtml += `<div class="cal-cell other-month"></div>`;
    }

    // Days
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayEvents = HMIF_DATA.calendarSchedule.filter((e) => e.date === dateStr);

      const filteredEvents = this.currentCalFilter === 'all'
        ? dayEvents
        : dayEvents.filter((e) => e.division.toLowerCase().includes(this.currentCalFilter.toLowerCase()) || (this.currentCalFilter === 'academic' && e.type === 'academic'));

      const today = getJakartaDateParts();
      const isToday = day === today.day && month === today.month && year === today.year;

      const dateLabel = new Intl.DateTimeFormat('id-ID', { dateStyle: 'full' }).format(new Date(year, month - 1, day));
      const eventLabel = filteredEvents.length
        ? `, ${filteredEvents.length} agenda: ${filteredEvents.map((event) => event.title).join('; ')}`
        : '';

      gridHtml += `
        <button type="button" class="cal-cell ${isToday ? 'today' : ''}" data-date="${dateStr}" aria-label="${escapeHtml(`${dateLabel}${eventLabel}`)}" aria-pressed="false" ${isToday ? 'aria-current="date"' : ''} onclick="window.prtsApp.selectCalendarDate('${dateStr}')">
          <span class="cal-day-num">${day}</span>
          <span class="cal-events-indicators">
            ${filteredEvents
          .map(
            (ev) => `
                <span class="cal-event-pill ${escapeHtml(ev.type)}" title="${escapeHtml(ev.title)}">
                  ${escapeHtml(ev.title)}
                </span>
              `
          )
          .join('')}
          </span>
        </button>
      `;
    }

    grid.innerHTML = gridHtml;

    // Select default active date for sidebar
    const today = getJakartaDateParts();
    const selectedDay = year === today.year && month === today.month ? today.day : 10;
    const defaultDate = `${year}-${String(month).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
    this.selectCalendarDate(defaultDate);
  }

  selectCalendarDate(dateStr) {
    const panel = document.getElementById('calendar-selected-day-events');
    const bannerDate = document.getElementById('active-date-display');
    if (!panel || !bannerDate) return;

    bannerDate.textContent = dateStr;
    document.querySelectorAll('#calendar-days-grid [data-date]').forEach((cell) => {
      const selected = cell.dataset.date === dateStr;
      cell.setAttribute('aria-pressed', String(selected));
      cell.classList.toggle('selected', selected);
    });

    const events = HMIF_DATA.calendarSchedule.filter((e) => e.date === dateStr);

    if (events.length === 0) {
      panel.innerHTML = `
        <div style="padding: 2rem 1rem; text-align: center; color: var(--ak-text-dim); font-family: var(--font-mono); font-size: 0.85rem;">
          <div style="font-size: 1.5rem; margin-bottom: 0.5rem; opacity: 0.5;">📅</div>
          TIDAK ADA AGENDA KHUSUS PADA TANGGAL INI.<br/>
          (Kegiatan perkuliahan reguler berjalan normal)
        </div>
      `;
      return;
    }

    panel.innerHTML = events
      .map((ev) => `
        <div class="event-item-card">
          <div class="event-header">
            <span class="event-type-badge ${ev.type}" style="border: 1px solid; color: inherit;">
              ${escapeHtml(ev.type.toUpperCase())} // ${escapeHtml(ev.division)}
            </span>
          </div>
          <h4 class="event-item-title">${escapeHtml(ev.title)}</h4>
          <p style="font-size: 0.82rem; color: var(--ak-text-secondary); margin-bottom: 0.65rem;">
            ${escapeHtml(ev.desc)}
          </p>
          <div class="event-meta">
            <span>📍 <strong>Lokasi:</strong> ${escapeHtml(ev.location)}</span>
            <span>🔗 <strong>Integrasi:</strong> ${escapeHtml(ev.integratedWith)}</span>
          </div>
          ${ev.registration_url ? `<a class="knowledge-resource-link" href="${escapeHtml(ev.registration_url)}" target="_blank" rel="noopener noreferrer">BUKA TAUTAN PENDAFTARAN <span aria-hidden="true">↗</span></a>` : ''}
          ${ev.registration_open ? `
            <form class="event-registration-form" data-register-event="${escapeHtml(ev.id)}">
              ${this.api.isAuthenticated ? '' : `
                <label class="form-group"><span class="form-label">NAMA PESERTA</span><input class="form-input" name="name" maxlength="120" required /></label>
              `}
              <label class="form-group"><span class="form-label">EMAIL KONTAK</span><input class="form-input" name="email" type="email" maxlength="254" value="${escapeHtml(this.api.currentUser?.email || '')}" required /></label>
              <button class="btn-tactical primary" type="submit">DAFTAR EVENT</button>
              <p class="auth-feedback" data-registration-feedback role="status"></p>
              <div class="event-ticket-result" data-ticket-result></div>
            </form>` : ''}
        </div>
      `)
      .join('');

    panel.querySelectorAll('[data-register-event]').forEach((form) => form.addEventListener('submit', (event) => {
      this.registerEvent(form.dataset.registerEvent, form, event);
    }));
  }

  async registerEvent(eventId, form, event) {
    event.preventDefault();
    const feedback = form.querySelector('[data-registration-feedback]');
    const guestData = {
      email: form.elements.email.value.trim(),
      ...(this.api.isAuthenticated ? {} : { name: form.elements.name.value.trim() })
    };
    feedback.textContent = 'Memproses pendaftaran...';
    const result = await this.api.registerEvent(eventId, guestData);
    if (!result.ok) {
      feedback.textContent = result.error;
      return;
    }

    const { id, token } = result.data.ticket;
    const deliveryMessage = result.data.delivery?.email_sent
      ? 'Salinan tiket QR dikirim ke email Anda.'
      : result.data.delivery?.dashboard_available
        ? 'Tiket dapat dibuka kembali dari dashboard akun Anda.'
        : 'Tiket hanya tersedia di sesi ini. Unduh atau simpan QR sekarang.';
    const qrPayload = JSON.stringify({ type: 'hmif-event-ticket', id, token });
    let qrImage = '';
    let qrError = '';
    try {
      qrImage = await QRCode.toDataURL(qrPayload, { errorCorrectionLevel: 'M', margin: 1, width: 240 });
    } catch (error) {
      qrError = error instanceof Error ? error.message : 'Kesalahan tidak diketahui';
    }
    const ticketResult = form.querySelector('[data-ticket-result]');
    ticketResult.innerHTML = `
      <article class="event-ticket-card">
        <p>Pendaftaran ${escapeHtml(result.data.event.title)} berhasil.</p>
        <strong>TANGGAL EVENT // ${escapeHtml(result.data.event.date)}</strong>
        <p>${escapeHtml(deliveryMessage)} Check-in berlaku satu kali pada tanggal event.</p>
        ${qrImage
        ? `<img src="${qrImage}" alt="QR tiket event ${escapeHtml(result.data.event.title)}" width="240" height="240" />
            <a class="btn-tactical primary" href="${qrImage}" download="hmif-event-ticket-${escapeHtml(id)}.png">UNDUH QR TIKET</a>`
        : `<p class="auth-feedback" role="alert">QR tidak dapat dibuat (${escapeHtml(qrError)}). Simpan ID dan kode privat berikut, lalu tunjukkan kepada petugas untuk input manual.</p>`}
        <p>ID tiket: <code>${escapeHtml(id)}</code></p>
        <p>Kode privat: <code>${escapeHtml(token)}</code></p>
      </article>`;
    feedback.textContent = result.data.delivery?.email_sent
      ? 'PENDAFTARAN BERHASIL. E-TICKET JUGA DIKIRIM KE EMAIL.'
      : 'PENDAFTARAN BERHASIL. E-TICKET SIAP DIUNDUH ATAU DIBUKA DARI DASHBOARD.';
  }

  async renderCertificateVerification(certificateId) {
    document.body.innerHTML = '<main class="certificate-page"><p role="status">Memverifikasi sertifikat...</p></main>';
    const result = await this.api.verifyCertificate(certificateId);
    if (!result.ok) {
      document.body.innerHTML = `<main class="certificate-page"><h1>Sertifikat tidak valid</h1><p>${escapeHtml(result.error)}</p></main>`;
      return;
    }
    const certificate = result.data.certificate;
    const qrImage = await QRCode.toDataURL(window.location.href, { errorCorrectionLevel: 'M', margin: 1, width: 180 });
    document.body.innerHTML = `
      <main class="certificate-page">
        <article class="certificate-sheet">
          <p class="certificate-kicker">UNIVERSITAS MAYASARI BAKTI // HMIF</p>
          <h1>Sertifikat Keikutsertaan</h1>
          <p class="certificate-copy">${escapeHtml(certificate.recipient_type || 'Peserta')}</p>
          <p class="certificate-copy">Diberikan kepada</p>
          <h2>${escapeHtml(certificate.participant_name)}</h2>
          <p class="certificate-copy">atas partisipasi pada</p>
          <h3>${escapeHtml(certificate.event_title)}</h3>
          <p class="certificate-copy">Tanggal kegiatan: ${escapeHtml(certificate.event_date)}<br />Diterbitkan: ${escapeHtml(new Date(certificate.issued_at).toLocaleDateString('id-ID'))}</p>
          <img src="${qrImage}" alt="QR untuk verifikasi sertifikat" width="180" height="180" />
          <p class="certificate-id">ID VERIFIKASI // ${escapeHtml(certificate.id)}</p>
          <p role="status">Sertifikat valid dan tercatat.</p>
          <button class="btn-tactical" type="button" data-print-certificate>CETAK / SIMPAN PDF</button>
        </article>
      </main>`;
    document.querySelector('[data-print-certificate]').addEventListener('click', () => window.print());
  }

  // ------------------------------------------------------------------------
  // DOCTRINE: AD/ART, GBHO & CADET APTITUDE QUIZ
  // ------------------------------------------------------------------------
  renderDoctrine() {
    const accordion = document.getElementById('adart-accordion-container');
    if (!accordion) return;

    const constList = Array.isArray(FULL_CONSTITUTION_DATA) && FULL_CONSTITUTION_DATA.length > 0 ? FULL_CONSTITUTION_DATA : HMIF_DATA.doctrine.adArt;
    accordion.innerHTML = `
      <div style="margin-bottom: 1.25rem; display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap;">
        <input type="text" id="constitution-search-input" placeholder="Cari pasal atau kata kunci (misal: Delegasi, KTA, DPA, MABIM, Anggaran, Sanksi)..." style="flex: 1; min-width: 260px; background: rgba(0,0,0,0.5); border: 1px solid var(--ak-cyan); color: #fff; padding: 0.65rem 1rem; font-family: var(--font-mono); font-size: 0.85rem;" />
        <span class="badge" style="background: rgba(0, 217, 255, 0.15); color: var(--ak-cyan); border: 1px solid var(--ak-cyan); padding: 0.5rem 0.8rem; font-family: var(--font-mono); font-size: 0.75rem;">94 PASAL LENGKAP (33 AD + 61 ART)</span>
      </div>
      <div class="constitution-quick-filters" style="margin-bottom: 1.5rem; display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center;">
        <span style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--ak-text-dim); margin-right: 0.25rem;">NAVIGASI CEPAT:</span>
        <button type="button" class="btn-tactical btn-small active" data-const-filter="ALL" style="padding: 0.3rem 0.65rem; font-size: 0.75rem;">SEMUA BAB (28)</button>
        <button type="button" class="btn-tactical btn-small" data-const-filter="AD" style="padding: 0.3rem 0.65rem; font-size: 0.75rem;">ANGGARAN DASAR (AD)</button>
        <button type="button" class="btn-tactical btn-small" data-const-filter="ART" style="padding: 0.3rem 0.65rem; font-size: 0.75rem;">ANGGARAN RUMAH TANGGA (ART)</button>
        <button type="button" class="btn-tactical btn-small" data-const-filter="KEANGGOTAAN" style="padding: 0.3rem 0.65rem; font-size: 0.75rem;">KEANGGOTAAN & KADERISASI</button>
        <button type="button" class="btn-tactical btn-small" data-const-filter="KEUANGAN" style="padding: 0.3rem 0.65rem; font-size: 0.75rem;">KEUANGAN & ASET</button>
        <button type="button" class="btn-tactical btn-small" data-const-filter="DELEGASI" style="padding: 0.3rem 0.65rem; font-size: 0.75rem;">DELEGASI & DISIPLIN</button>
        <div style="margin-left: auto; display: flex; gap: 0.5rem;">
          <button type="button" class="btn-tactical btn-small" id="btn-const-expand-all" style="padding: 0.3rem 0.65rem; font-size: 0.75rem;">[ + BUKA SEMUA ]</button>
          <button type="button" class="btn-tactical btn-small" id="btn-const-collapse-all" style="padding: 0.3rem 0.65rem; font-size: 0.75rem;">[ - TUTUP SEMUA ]</button>
        </div>
      </div>
      <div id="constitution-articles-list">
        ${constList
        .map((item, idx) => `
            <div class="doc-accordion-item ${idx === 0 ? 'open' : ''}" id="doc-item-${idx}">
              <div class="doc-accordion-header" onclick="window.prtsApp.toggleAccordion(${idx})">
                <div class="doc-title-left">
                  <span class="doc-bab-tag">${escapeHtml(item.bab)}</span>
                  <span class="doc-bab-title">${escapeHtml(item.title)}</span>
                </div>
                <span style="font-family: var(--font-mono); color: var(--ak-cyan); font-weight: bold;">[ + / - ]</span>
              </div>
              <div class="doc-accordion-body">
                ${item.pasalList
            .map(
              (p) => `
                      <div class="pasal-block">
                        <div class="pasal-title">${escapeHtml(p.pasal)}</div>
                        <div class="pasal-content" style="line-height: 1.6; white-space: pre-line;">${escapeHtml(p.content)}</div>
                      </div>
                    `
            )
            .join('')}
              </div>
            </div>
          `)
        .join('')}
      </div>`;

    const searchInput = document.getElementById('constitution-search-input');
    const filterButtons = document.querySelectorAll('[data-const-filter]');
    let activeFilter = 'ALL';

    const applyConstitutionFilters = () => {
      const query = (searchInput?.value || '').toLowerCase().trim();
      const items = document.querySelectorAll('.doc-accordion-item');
      items.forEach((item) => {
        const text = item.textContent.toLowerCase();
        const babTag = item.querySelector('.doc-bab-tag')?.textContent || '';

        let matchesCategory = true;
        if (activeFilter === 'AD') matchesCategory = babTag.includes('(AD)');
        else if (activeFilter === 'ART') matchesCategory = babTag.includes('(ART)');
        else if (activeFilter === 'KEANGGOTAAN') matchesCategory = text.includes('anggota') || text.includes('kader') || text.includes('mabim');
        else if (activeFilter === 'KEUANGAN') matchesCategory = text.includes('keuangan') || text.includes('harta') || text.includes('anggaran') || text.includes('kas');
        else if (activeFilter === 'DELEGASI') matchesCategory = text.includes('delegasi') || text.includes('sanksi') || text.includes('disiplin') || text.includes('dpa');

        const matchesQuery = !query || text.includes(query);
        if (matchesCategory && matchesQuery) {
          item.style.display = 'block';
          if (query) item.classList.add('open');
        } else {
          item.style.display = 'none';
        }
      });
    };

    if (searchInput) {
      searchInput.addEventListener('input', applyConstitutionFilters);
    }

    filterButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        filterButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        activeFilter = btn.dataset.constFilter;
        applyConstitutionFilters();
      });
    });

    document.getElementById('btn-const-expand-all')?.addEventListener('click', () => {
      document.querySelectorAll('.doc-accordion-item').forEach((item) => item.classList.add('open'));
    });

    document.getElementById('btn-const-collapse-all')?.addEventListener('click', () => {
      document.querySelectorAll('.doc-accordion-item').forEach((item) => item.classList.remove('open'));
    });

    // Roadmap Kaderisasi
    const roadmapContainer = document.getElementById('cadet-roadmap-container');
    if (roadmapContainer) {
      roadmapContainer.innerHTML = HMIF_DATA.doctrine.cadetRoadmap
        .map(
          (step, idx) => `
          <div class="step-card ${idx < 2 ? 'active-step' : ''}">
            <div class="step-number">TAHAP 0${step.step} // CADET PIPELINE</div>
            <h4 class="step-title">${escapeHtml(step.title)}</h4>
            <p class="step-desc">${escapeHtml(step.desc)}</p>
          </div>
        `
        )
        .join('');
    }

    // Render Quiz
    this.renderCadetQuiz();
  }

  toggleAccordion(index) {
    const item = document.getElementById(`doc-item-${index}`);
    if (item) {
      item.classList.toggle('open');
    }
  }

  renderCadetQuiz() {
    const container = document.getElementById('cadet-quiz-content');
    if (!container) return;

    const quizList = HMIF_DATA.doctrine.cadetQuiz;

    container.innerHTML = quizList
      .map((q, qIdx) => `
        <div class="quiz-question-box" id="quiz-q-${q.id}">
          <div class="quiz-q-num">MODUL KADERISASI SOAL 0${qIdx + 1} / 0${quizList.length}</div>
          <div class="quiz-q-text">${escapeHtml(q.question)}</div>
        </div>

        <div class="quiz-options" id="quiz-opts-${q.id}">
          ${q.options
          .map(
            (opt, optIdx) => `
              <button 
                type="button" 
                class="quiz-option-btn" 
                data-qid="${q.id}" 
                data-optidx="${optIdx}"
                onclick="window.prtsApp.selectQuizOption(${q.id}, ${optIdx})"
              >
                <span class="opt-letter">${String.fromCharCode(65 + optIdx)}</span>
                <span>${escapeHtml(opt)}</span>
              </button>
            `
          )
          .join('')}
        </div>
      `)
      .join('');
  }

  selectQuizOption(qId, optIdx) {
    this.currentQuizAnswers[qId] = optIdx;

    const optsContainer = document.getElementById(`quiz-opts-${qId}`);
    if (optsContainer) {
      optsContainer.querySelectorAll('.quiz-option-btn').forEach((btn) => {
        const btnIdx = parseInt(btn.getAttribute('data-optidx'), 10);
        btn.classList.toggle('selected', btnIdx === optIdx);
      });
    }
  }

  async submitCadetQuiz() {
    const quizList = HMIF_DATA.doctrine.cadetQuiz;
    const answeredCount = Object.keys(this.currentQuizAnswers).length;

    if (answeredCount < quizList.length) {
      alert(`Harap lengkapi semua ${quizList.length} soal evaluasi kader sebelum mengirim evaluasi!`);
      return;
    }

    let correctCount = 0;
    quizList.forEach((q) => {
      const selected = this.currentQuizAnswers[q.id];
      const optsContainer = document.getElementById(`quiz-opts-${q.id}`);

      if (optsContainer) {
        optsContainer.querySelectorAll('.quiz-option-btn').forEach((btn) => {
          const btnIdx = parseInt(btn.getAttribute('data-optidx'), 10);
          btn.disabled = true;
          if (btnIdx === q.correctIndex) {
            btn.classList.add('correct');
          } else if (btnIdx === selected && selected !== q.correctIndex) {
            btn.classList.add('wrong');
          }
        });
      }

      if (selected === q.correctIndex) {
        correctCount++;
      }
    });

    const score = Math.round((correctCount / quizList.length) * 100);
    prtsSound.playSuccess();

    let saveStatus = 'Hasil latihan tidak disimpan. Masuk untuk merekamnya.';
    if (this.api.isAuthenticated) {
      const saved = await this.api.saveQuizEvaluation({ score });
      saveStatus = saved.ok ? 'Hasil latihan tersimpan. Nilai ini tidak mengubah hak akses.' : saved.error;
    }

    let rankTitle = 'KADER MUDA / RECRUIT';
    if (score === 100) {
      rankTitle = 'KADER UTAMA / ELITE OPERATOR';
    } else if (score >= 80) {
      rankTitle = 'KADER MADYA / SENIOR CADET';
    } else if (score >= 60) {
      rankTitle = 'KADER PRATAMA / CADET';
    }

    const modalBody = document.getElementById('prts-modal-content');
    const modalTitle = document.getElementById('prts-modal-title');
    if (modalBody && modalTitle) {
      modalTitle.innerHTML = `EVALUASI DOKTRIN KADER // PRTS RESULT`;
      modalBody.innerHTML = `
        <div style="text-align: center; padding: 1.5rem 0;">
          <div style="font-family: var(--font-mono); font-size: 0.85rem; color: var(--ak-gold); margin-bottom: 0.5rem;">
            PRTS CONSTITUTION APTITUDE CERTIFICATION
          </div>
          <div style="font-family: var(--font-title); font-size: 3rem; color: var(--ak-cyan); font-weight: 700; text-shadow: 0 0 20px var(--ak-cyan-glow);">
            ${score} / 100
          </div>
          <div style="font-family: var(--font-mono); font-size: 1.1rem; color: var(--ak-text-primary); margin: 0.5rem 0;">
            Predikat: <strong style="color: var(--ak-gold);">${rankTitle}</strong>
          </div>
          <div style="display: inline-block; padding: 0.35rem 1rem; background: rgba(0, 229, 255, 0.15); border: 1px solid var(--ak-cyan); clip-path: var(--clip-badge); font-family: var(--font-mono); font-size: 0.78rem; color: var(--ak-cyan); margin-bottom: 1.5rem;">
            HAK AKSES TIDAK BERUBAH
          </div>

          <p style="color: var(--ak-text-secondary); max-width: 500px; margin: 0 auto 1.5rem; font-size: 0.92rem; line-height: 1.6;">
            ${score >= 80
          ? 'Selamat! Anda telah memahami asas, landasan AD/ART, dan Garis-Garis Besar Haluan Organisasi HMIF Universitas Mayasari Bakti dengan sangat baik.'
          : 'Evaluasi telah direkam. Disarankan untuk menelaah kembali Bab & Pasal AD/ART serta pedoman kaderisasi untuk memperdalam integritas keorganisasian.'}
          </p>

          <p role="status" style="color: var(--ak-text-dim); font-size: 0.8rem; margin-bottom: 1rem;">${escapeHtml(saveStatus)}</p>

          <button class="btn-tactical primary" onclick="window.prtsApp.closeModal()">
            TUTUP HASIL
          </button>
        </div>
      `;
      this.openModal();
    }
  }

  // ------------------------------------------------------------------------
  // INTEL & NEWS
  // ------------------------------------------------------------------------
  renderNews() {
    const container = document.getElementById('news-grid-container');
    if (!container) return;

    container.innerHTML = HMIF_DATA.news
      .map((item) => `
        <div class="news-card" onclick="window.prtsApp.openNewsDetail('${escapeHtml(item.id)}')">
          <div class="news-thumb-wrap">
            <img src="${escapeHtml(item.thumbnail)}" alt="${escapeHtml(item.title)}" class="news-thumb" />
            <span class="news-tag">${escapeHtml(item.category)}</span>
          </div>
          <div class="news-content">
            <div class="news-date">${escapeHtml(item.date)} // OLEH: ${escapeHtml(item.author)}</div>
            <h3 class="news-title">${escapeHtml(item.title)}</h3>
            <p class="news-excerpt">${escapeHtml(item.excerpt)}</p>
            <span class="btn-tactical" style="padding: 0.35rem 0.75rem; font-size: 0.72rem;">
              BACA DOKUMEN &gt;&gt;
            </span>
          </div>
        </div>
      `)
      .join('');
  }

  openNewsDetail(newsId) {
    const item = HMIF_DATA.news.find((n) => n.id === newsId);
    if (!item) return;

    const modalBody = document.getElementById('prts-modal-content');
    const modalTitle = document.getElementById('prts-modal-title');
    if (!modalBody || !modalTitle) return;

    modalTitle.textContent = `INTEL REPORT // ${item.title}`;
    modalBody.innerHTML = `
      <div style="margin-bottom: 1rem; border: 1px solid var(--ak-border); overflow: hidden; clip-path: var(--clip-corner-top-right);">
        <img src="${escapeHtml(item.thumbnail)}" alt="${escapeHtml(item.title)}" style="width: 100%; height: 260px; object-fit: cover;" />
      </div>
      <div style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--ak-cyan); margin-bottom: 0.5rem;">
        ${escapeHtml(item.date)} // KATEGORI: ${escapeHtml(item.category)} // DOKUMENTASI RESMI HMIF UMB
      </div>
      <h2 style="font-family: var(--font-title); font-size: 1.5rem; color: var(--ak-text-primary); margin-bottom: 1rem;">
        ${escapeHtml(item.title)}
      </h2>
      <p style="color: var(--ak-text-secondary); line-height: 1.8; font-size: 0.95rem; margin-bottom: 1.5rem;">
        ${escapeHtml(item.content)}
      </p>
      <div style="background: rgba(14, 20, 31, 0.7); border: 1px solid var(--ak-border); padding: 0.75rem; font-family: var(--font-mono); font-size: 0.75rem; color: var(--ak-text-dim);">
        ARUS INFORMASI RESMI // DIVISI KOMUNIKASI & INFORMASI HMIF UNIVERSITAS MAYASARI BAKTI
      </div>
    `;

    this.openModal();
  }

  // ------------------------------------------------------------------------
  // COMM-LINK & ASPIRASI MAHASISWA
  // ------------------------------------------------------------------------
  loadAspirasi() {
    try {
      localStorage.removeItem('hmif_aspirasi_log');
    } catch {
      // Storage may be unavailable; server-side ticket tracking remains available.
    }
    return [];
  }


  async renderRdpTransparencyBoard() {
    let board = document.getElementById('rdp-transparency-board');
    const container = document.getElementById('aspirasi-history-list')?.parentElement;
    if (!container) return;

    if (!board) {
      board = document.createElement('div');
      board.id = 'rdp-transparency-board';
      board.style.marginTop = '2rem';
      board.style.borderTop = '1px solid var(--ak-border)';
      board.style.paddingTop = '1.5rem';
      container.append(board);
    }

    board.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; margin-bottom:1rem; gap:0.5rem;">
        <div>
          <span class="badge" style="background:rgba(0, 229, 255, 0.15); color:var(--ak-cyan); border:1px solid var(--ak-cyan); font-family:var(--font-mono); font-size:0.75rem;">PASAL 41 ART // TRANSPARANSI LEGISLATIF</span>
          <h3 style="margin:0.35rem 0 0 0; font-size:1.1rem; color:#fff;">PAPAN AGENDA RDP (RAPAT DENGAR PENDAPAT DPA)</h3>
        </div>
        <span style="font-family:var(--font-mono); font-size:0.75rem; color:var(--ak-text-dim);">DPA HMIF UMB</span>
      </div>
      <p style="font-size:0.85rem; color:var(--ak-text-secondary); margin-bottom:1rem; line-height:1.5;">
        Daftar aspirasi mahasiswa yang resmi dinaikkan ke forum Rapat Dengar Pendapat (RDP) Dewan Perwakilan Anggota (DPA) bersama BPH. Identitas pengirim dirahasiakan sepenuhnya.
      </p>
      <div id="rdp-agenda-cards-list">
        <p style="font-size:0.85rem; color:var(--ak-text-dim); font-family:var(--font-mono);">Memeriksa jadwal sidang RDP...</p>
      </div>
    `;

    const cardsContainer = board.querySelector('#rdp-agenda-cards-list');
    try {
      const res = await this.api.getPublicRdpAgendas();
      if (!res.ok || !Array.isArray(res.data) || !res.data.length) {
        cardsContainer.innerHTML = `
          <div style="background:rgba(14, 20, 31, 0.5); border:1px dashed var(--ak-border); padding:1rem; font-family:var(--font-mono); font-size:0.82rem; color:var(--ak-text-dim);">
            Saat ini belum ada sidang RDP DPA yang dijadwalkan. Seluruh aspirasi baru sedang dalam tahap verifikasi tim BPH.
          </div>
        `;
        return;
      }

      cardsContainer.innerHTML = res.data.map((item) => `
        <div style="background:rgba(14, 20, 31, 0.85); border-left:3px solid var(--ak-cyan); border-top:1px solid var(--ak-border); border-right:1px solid var(--ak-border); border-bottom:1px solid var(--ak-border); padding:1rem; margin-bottom:0.85rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.4rem;">
            <span style="font-family:var(--font-mono); font-size:0.75rem; color:var(--ak-cyan); font-weight:bold;">TOPIK: ${escapeHtml(item.category)}</span>
            <span class="status-badge ok" style="font-size:0.7rem;">${item.rdp_scheduled_at ? 'DIJADWALKAN: ' + escapeHtml(new Date(item.rdp_scheduled_at).toLocaleString('id-ID')) : 'AGENDA RDP SIDANG DPA'}</span>
          </div>
          <p style="font-size:0.88rem; color:var(--ak-text-secondary); line-height:1.5; margin:0.35rem 0 0.6rem 0;">
            Topik ini telah dimasukkan ke agenda RDP. Detail pengaduan dan identitas pelapor tetap privat.
          </p>
          ${item.rdp_notes ? `
            <div style="background:rgba(0, 229, 255, 0.05); border:1px dashed rgba(0, 229, 255, 0.3); padding:0.5rem 0.75rem; font-size:0.8rem; color:var(--ak-cyan); font-family:var(--font-mono);">
              <strong>NOTULENSI / FOKUS HEARING DPA:</strong> ${escapeHtml(item.rdp_notes)}
            </div>
          ` : ''}
        </div>
      `).join('');
    } catch {
      cardsContainer.innerHTML = '<p class="auth-feedback">Gagal memuat papan transparansi RDP.</p>';
    }
  }

  renderAspirasiHistory() {
    const container = document.getElementById('aspirasi-history-list');
    if (!container) return;

    if (this.aspirasiLog.length === 0) {
      container.innerHTML = `
        <div style="color: var(--ak-text-dim); font-size: 0.82rem; font-family: var(--font-mono);">
          Isi pesan tidak disimpan di browser. Gunakan ID tiket dan kode privat untuk memeriksa tindak lanjut.
        </div>
      `;
      return;
    }

    container.innerHTML = this.aspirasiLog
      .map(
        (item) => `
        <div style="background: rgba(14, 20, 31, 0.7); border: 1px solid var(--ak-border); padding: 0.9rem; margin-bottom: 0.75rem; clip-path: var(--clip-corner-top-right);">
          <div style="display: flex; justify-content: space-between; font-family: var(--font-mono); font-size: 0.72rem; color: var(--ak-cyan); margin-bottom: 0.3rem;">
            <span>${escapeHtml(item.sender)}</span>
              <span style="color: var(--ak-text-dim);">${escapeHtml(item.date)}</span>
          </div>
          <div style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--ak-gold); margin-bottom: 0.4rem;">
            [TOPIK: ${escapeHtml(item.category)}]
          </div>
          <p style="font-size: 0.85rem; color: var(--ak-text-secondary); line-height: 1.4;">
            "${escapeHtml(item.message)}"
          </p>
        </div>
      `
      )
      .join('');
  }

  async submitAspirasi(e) {
    e.preventDefault();
    const isAnonymous = document.querySelector('[name="asp-anonymous"]:checked')?.value !== 'false';
    const sender = document.getElementById('asp-sender').value.trim();
    const category = document.getElementById('asp-category').value;
    const message = document.getElementById('asp-message').value.trim();
    const feedback = document.getElementById('aspirasi-submit-feedback');

    if (!message) {
      feedback.textContent = 'Mohon tuliskan pesan aspirasi atau saran Anda.';
      return;
    }

    const result = await this.api.submitAspiration({ sender, is_anonymous: isAnonymous, category, message });
    if (!result.ok) {
      feedback.textContent = result.error;
      return;
    }

    const ticket = result.data.ticket;
    document.getElementById('aspirasi-form').reset();
    document.querySelectorAll('[name="asp-anonymous"]').forEach((radio) => { radio.checked = radio.value === 'true'; });
    document.querySelector('[data-aspiration-sender]').hidden = true;
    document.getElementById('asp-sender').required = false;
    feedback.textContent = 'Aspirasi terenkripsi dan diterima. Simpan ID tiket serta kode privat untuk pelacakan.';
    const ticketResult = document.getElementById('aspirasi-ticket-result');
    ticketResult.replaceChildren();
    const ticketHeading = document.createElement('strong');
    ticketHeading.textContent = 'SIMPAN KODE PELACAKAN INI. KODE HANYA DITAMPILKAN SEKALI.';
    const ticketId = document.createElement('p');
    ticketId.textContent = `Ticket ID: ${ticket.id}`;
    const trackingToken = document.createElement('p');
    trackingToken.textContent = `Kode privat: ${ticket.trackingToken}`;
    ticketResult.append(ticketHeading, ticketId, trackingToken);
    ticketResult.hidden = false;
    prtsSound.playAccess();

    ticketResult.focus();
  }

  async trackAspirasi(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const resultElement = document.getElementById('aspirasi-track-result');
    resultElement.textContent = 'Memeriksa tiket...';
    const result = await this.api.trackAspiration(form.elements.ticketId.value.trim(), form.elements.trackingToken.value.trim());
    if (!result.ok) {
      resultElement.textContent = result.error;
      return;
    }
    const aspiration = result.data.aspiration;
    resultElement.textContent = `Status: ${aspiration.status}${aspiration.bph_response ? ` // Tanggapan: ${aspiration.bph_response}` : ''}`;
  }

  // ------------------------------------------------------------------------
  // MODAL CONTROLS
  // ------------------------------------------------------------------------
  openModal() {
    const backdrop = document.getElementById('prts-modal-backdrop');
    if (!backdrop) return;
    if (!backdrop.classList.contains('active')) {
      this.modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      this.modalPreviousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    backdrop.inert = false;
    backdrop.setAttribute('aria-hidden', 'false');
    backdrop.classList.add('active');
    requestAnimationFrame(() => {
      if (!backdrop.classList.contains('active')) return;
      const firstFocusable = backdrop.querySelector('[autofocus]') || backdrop.querySelector('.modal-close-btn');
      (firstFocusable || backdrop.querySelector('.prts-modal')).focus();
    });
  }

  closeModal() {
    void this.siteStudio.cancelPreview();
    const backdrop = document.getElementById('prts-modal-backdrop');
    if (backdrop) {
      backdrop.classList.remove('active');
      backdrop.inert = true;
      backdrop.setAttribute('aria-hidden', 'true');
    }
    document.body.style.overflow = this.modalPreviousOverflow;
    const returnFocus = this.modalReturnFocus;
    this.modalReturnFocus = null;
    if (returnFocus?.isConnected && typeof returnFocus.focus === 'function') returnFocus.focus();
  }

  // ------------------------------------------------------------------------
  // SETUP EVENT LISTENERS
  // ------------------------------------------------------------------------
  setupEventListeners() {
    // Modal Close
    const closeBtn = document.getElementById('prts-modal-close');
    const backdrop = document.getElementById('prts-modal-backdrop');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeModal());
    }
    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) this.closeModal();
      });
    }
    document.addEventListener('keydown', (event) => {
      if (!backdrop?.classList.contains('active')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        this.closeModal();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = [...backdrop.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter((element) => element.getClientRects().length && !element.closest('[hidden]'));
      if (!focusable.length) {
        event.preventDefault();
        backdrop.querySelector('.prts-modal')?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !backdrop.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !backdrop.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    });

    const authButton = document.getElementById('auth-action-btn');
    if (authButton) {
      authButton.addEventListener('click', async () => {
        if (!this.api.isAuthenticated) {
          this.openLoginDialog();
          return;
        }
        this.openWorkspace('home');
      });
    }

    const logoutButton = document.getElementById('logout-action-btn');
    if (logoutButton) {
      logoutButton.addEventListener('click', async () => {
        const result = await this.api.logout();
        if (!result.ok) {
          alert(result.error);
          return;
        }
        this.aspirasiLog = this.loadAspirasi();
        this.renderAspirasiHistory();
        this.renderAuthState();
        this.renderTutoringClinic();
        this.closeWorkspace();
      });
    }

    // Operator filters are dynamically initialized and managed via renderOperatorFilters()

    // E-Voting refresh button
    const eVotingRefreshBtn = document.getElementById('eVoting-refresh-btn');
    if (eVotingRefreshBtn) {
      eVotingRefreshBtn.addEventListener('click', () => {
        renderPollList(document.getElementById('poll-list-container'));
      });
    }

    // Initial render if landing on voting tab
    const initialTab = window.location.hash.slice(1).split('?')[0];
    if (initialTab === 'voting') {
      renderPollList(document.getElementById('poll-list-container'));
    }

    // Proker filter buttons
    document.querySelectorAll('.proker-filters .filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.proker-filters .filter-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const filter = btn.getAttribute('data-filter');
        this.renderProker(filter);
      });
    });

    // Calendar filter buttons
    document.querySelectorAll('.calendar-filter-bar .cal-filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.calendar-filter-bar .cal-filter-btn').forEach((b) => {
          b.classList.remove('active');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        this.currentCalFilter = btn.getAttribute('data-cal-filter');
        this.renderCalendar(this.currentCalendarMonth, this.currentCalendarYear);
      });
    });

    // Calendar month nav
    const prevMonthBtn = document.getElementById('cal-prev-month');
    const nextMonthBtn = document.getElementById('cal-next-month');
    if (prevMonthBtn) {
      prevMonthBtn.addEventListener('click', () => {
        this.currentCalendarMonth--;
        if (this.currentCalendarMonth < 1) {
          this.currentCalendarMonth = 12;
          this.currentCalendarYear--;
        }
        this.renderCalendar(this.currentCalendarMonth, this.currentCalendarYear);
      });
    }
    if (nextMonthBtn) {
      nextMonthBtn.addEventListener('click', () => {
        this.currentCalendarMonth++;
        if (this.currentCalendarMonth > 12) {
          this.currentCalendarMonth = 1;
          this.currentCalendarYear++;
        }
        this.renderCalendar(this.currentCalendarMonth, this.currentCalendarYear);
      });
    }

    // Doctrine section tab buttons
    document.querySelectorAll('.doctrine-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.doctrine-tab-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const targetView = btn.getAttribute('data-doc-view');

        const adartSection = document.getElementById('doctrine-adart-view');
        const roadmapSection = document.getElementById('doctrine-roadmap-view');
        const quizSection = document.getElementById('doctrine-quiz-view');

        if (adartSection) adartSection.style.display = targetView === 'adart' ? 'block' : 'none';
        if (roadmapSection) roadmapSection.style.display = targetView === 'roadmap' ? 'block' : 'none';
        if (quizSection) quizSection.style.display = targetView === 'quiz' ? 'block' : 'none';
      });
    });

    // Quiz submit button
    const submitQuizBtn = document.getElementById('submit-cadet-quiz-btn');
    if (submitQuizBtn) {
      submitQuizBtn.addEventListener('click', () => this.submitCadetQuiz());
    }

    // Aspirasi form submit
    const aspForm = document.getElementById('aspirasi-form');
    if (aspForm) {
      const senderField = aspForm.querySelector('[data-aspiration-sender]');
      const senderInput = aspForm.querySelector('#asp-sender');
      const updateIdentityMode = () => {
        const anonymous = aspForm.querySelector('[name="asp-anonymous"]:checked')?.value !== 'false';
        senderField.hidden = anonymous;
        senderInput.required = !anonymous;
        if (anonymous) senderInput.value = '';
      };
      aspForm.querySelectorAll('[name="asp-anonymous"]').forEach((radio) => radio.addEventListener('change', updateIdentityMode));
      updateIdentityMode();
      aspForm.addEventListener('submit', (e) => this.submitAspirasi(e));
    }
    const aspirationTrackForm = document.getElementById('aspirasi-track-form');
    if (aspirationTrackForm) {
      aspirationTrackForm.addEventListener('submit', (e) => this.trackAspirasi(e));
    }
  }
}

// Instantiate and expose globally
window.addEventListener('DOMContentLoaded', () => {
  window.prtsApp = new PRTSApplication();
});
