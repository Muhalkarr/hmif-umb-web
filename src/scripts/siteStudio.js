import { BUILTIN_SITE_IMAGES, configReferencesAsset, DUST_PERCENT_MAX, migrateLegacyBphRoleIds, resolveBackgroundImage, uploadedAssetFileUrl, withSiteDefaults } from '../../server/siteSchema.js';
import { createOrganizationDraftTemplate } from './organizationTemplates.js';
import { POSITION_CAPABILITY_OPTIONS } from '../../shared/positionAccess.js';
import { DEFAULT_STUDENT_DEMOGRAPHIC_SETTINGS, STUDENT_ACCOUNT_COLUMNS, STUDENT_CUSTOM_FIELD_TYPES } from '../../server/studentDemographics.js';
import { collectCustomFieldValues, renderCustomFieldInput } from './studentDemographics.js';
import {
  collectCampusMapForm,
  bindCampusMapPanel,
  createBuildingDraft,
  createCampusDraft,
  createFloorDraft,
  renderCampusMapPanel
} from './siteStudioCampusMap.js';
import {
  bindUniversityOrganizationPanel,
  collectUniversityOrganizationForm,
  renderUniversityOrganizationPanel
} from './siteStudioHierarchies.js';
import {
  createSiteMapGroupDraft,
  moveSiteMapNode,
  removeSiteMapGroup,
  renderSiteMapEditor
} from './siteStudioSiteMap.js';

const FONT_OPTIONS = ['Inter', 'Rajdhani', 'Orbitron', 'BenderLight', 'Geometos', 'JetBrainsMono', 'system-ui'];
const FONT_PREVIEW_SAMPLES = {
  'font.body': 'Aa Bb Gg Rr 0123 — Contoh teks isi HMIF.',
  'font.heading': 'HMIF // INOVASI DIGITAL 2026',
  'font.mono': 'OPS-01 / STATUS: READY_123'
};
const SITE_COLOR_LABELS = {
  background: 'Latar',
  panel: 'Panel',
  accent: 'Aksen utama',
  accentAlt: 'Aksen kedua',
  danger: 'Status bahaya',
  success: 'Status sukses',
  info: 'Status informasi',
  text: 'Teks utama',
  textMuted: 'Teks sekunder',
  border: 'Garis'
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[character]));

const countOrganizationDivisions = (departments = []) => departments.reduce((total, department) => total + (department.divisions || []).length, 0);
const createOrganizationId = (prefix) => `${prefix}-${crypto.randomUUID().replaceAll('-', '')}`;

const labels = {
  dashboard: 'Dashboard',
  vision: 'Visi dan Misi',
  knowledge: 'Pusat Akademik',
  showcase: 'Karya Mahasiswa',
  career: 'Alumni dan Karier',
  squad: 'Struktur Pengurus',
  cohort: 'Batalion Angkatan',
  proker: 'Program Kerja',
  voting: 'E-Voting',
  inventory: 'Inventaris',
  calendar: 'Kalender',
  doctrine: 'Dokumen Organisasi',
  intel: 'Berita',
  commlink: 'Aspirasi dan Kontak',
  'campus-map': 'Peta Kampus',
  'site-map': 'Peta Navigasi Situs',
  'university-organization': 'Struktur Universitas'
};

const luminance = (hex) => {
  const channels = hex.slice(1).match(/.{2}/g).map((value) => parseInt(value, 16) / 255).map((value) => (
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  ));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};

const contrastRatio = (first, second) => {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
};

const getPaletteContrast = (colors) => {
  const text = contrastRatio(colors.text, colors.background);
  const secondary = contrastRatio(colors.textMuted, colors.background);
  const accents = [colors.accent, colors.accentAlt, colors.danger, colors.success, colors.info]
    .map((color) => contrastRatio(color, colors.background));
  return {
    text,
    secondary,
    accents,
    pass: text >= 4.5 && secondary >= 4.5 && accents.every((ratio) => ratio >= 3)
  };
};

export class SiteStudio {
  constructor(api, { openModal, closeModal, getContainer, getTabContainer, applyConfig, showPreview, returnToStudio }) {
    this.api = api;
    this.openModal = openModal;
    this.closeModal = closeModal;
    this.getContainer = getContainer;
    this.getTabContainer = getTabContainer;
    this.applyConfig = applyConfig;
    this.showPreview = showPreview || (() => { });
    this.returnToStudio = returnToStudio || (() => { });
    this.config = null;
    this.assets = [];
    this.soundtracks = [];
    this.soundtrackError = '';
    this.portalRecords = { project: [], alumni: [], job: [] };
    this.portalRecordsError = '';
    this.knowledgeFiles = [];
    this.revisions = [];
    this.audit = [];
    this.users = [];
    this.usersError = '';
    this.accessFeedback = '';
    this.studentDemographicSettings = structuredClone(DEFAULT_STUDENT_DEMOGRAPHIC_SETTINGS);
    this.studentDemographicSettingsError = '';
    this.studentDemographicSettingsFeedback = '';
    this.studentDemographicSettingsDirty = false;
    this.studentDemographicValues = {};
    this.studentDemographicValuesError = '';
    this.studentDemographicValuesFeedback = '';
    this.studentDemographicValuesDirty = false;
    this.selectedDemographicAccountId = '';
    this.securityNotice = { status: 'normal', message: '', updatedAt: '' };
    this.securityNoticeError = '';
    this.revisionId = null;
    this.activeTab = 'theme';
    this.previewing = false;
    this.editingDepartmentId = null;
    this.editingOperatorId = null;
    this.defaultDeptForNewOperator = null;
    this.editingGenerationId = null;
    this.editingGenDiv = null;
    this.editingGenLeader = null;
    this.editingGenMember = null;
    this.editingKnowledgeResourceId = null;
    this.selectedCampusMapFeatureId = '';
    this.campusMapDrawKind = '';
    this.campusMapDraftPoints = [];
    this.fontPreviewLoads = new Map();
  }

  async open() {
    if (!this.api.isSuperadmin) return;
    const title = document.getElementById('prts-modal-title');
    const body = this.getContainer?.() || document.getElementById('prts-modal-content');
    if (!body || (!this.getContainer && !title)) return;

    if (!this.getContainer) title.textContent = 'PRTS // SITE STUDIO';
    body.innerHTML = '<p class="auth-feedback" role="status">Memuat konfigurasi, aset, dan riwayat...</p>';
    if (!this.getContainer) this.openModal();

    const [siteResult, assetsResult, revisionsResult, auditResult, usersResult, knowledgeFilesResult, soundtracksResult, projectsResult, alumniResult, jobsResult, demographicsSettingsResult, demographicsValuesResult, securityNoticeResult] = await Promise.all([
      this.api.getSiteConfig({ preview: true }),
      this.api.getSiteAssets(),
      this.api.getSiteRevisions(),
      this.api.getAuditLog(30),
      this.api.getAllUsers(),
      this.api.getKnowledgeFiles(),
      this.api.getAdminSoundtracks(),
      this.api.getAdminPortalRecords('project'),
      this.api.getAdminPortalRecords('alumni'),
      this.api.getAdminPortalRecords('job'),
      this.api.getStudentDemographicSettings(),
      this.api.getStudentDemographicCustomValues(),
      this.api.getSecurityNotice()
    ]);
    if (!siteResult.ok) {
      body.innerHTML = `<p class="auth-feedback">${escapeHtml(siteResult.error)}</p>`;
      return;
    }

    this.config = migrateLegacyBphRoleIds(withSiteDefaults(structuredClone(siteResult.data.config)));
    this.revisionId = siteResult.data.revision_id;
    this.assets = assetsResult.ok ? assetsResult.data.assets : [];
    this.revisions = revisionsResult.ok ? revisionsResult.data.revisions : [];
    this.audit = auditResult.ok ? auditResult.data.entries : [];
    this.users = usersResult?.ok && Array.isArray(usersResult.data?.users) ? usersResult.data.users : [];
    this.usersError = usersResult?.ok ? '' : usersResult?.error || 'Daftar akun tidak dapat dimuat.';
    this.studentDemographicSettings = demographicsSettingsResult?.ok
      ? demographicsSettingsResult.data.settings
      : structuredClone(DEFAULT_STUDENT_DEMOGRAPHIC_SETTINGS);
    this.studentDemographicSettingsError = demographicsSettingsResult?.ok
      ? ''
      : demographicsSettingsResult?.error || 'Pengaturan kolom statistik tidak dapat dimuat.';
    this.studentDemographicSettingsDirty = false;
    this.studentDemographicValues = demographicsValuesResult?.ok ? demographicsValuesResult.data.values || {} : {};
    this.studentDemographicValuesError = demographicsValuesResult?.ok
      ? ''
      : demographicsValuesResult?.error || 'Nilai kolom kustom tidak dapat dimuat.';
    this.studentDemographicValuesDirty = false;
    this.securityNotice = securityNoticeResult?.ok
      ? securityNoticeResult.data
      : { status: 'normal', message: '', updatedAt: '' };
    this.securityNoticeError = securityNoticeResult?.ok
      ? ''
      : securityNoticeResult?.error || 'Status pengumuman keamanan tidak dapat dimuat.';
    const memberUsers = this.users.filter((user) => user.role !== 'superadmin');
    if (!memberUsers.some(({ account_id }) => account_id === this.selectedDemographicAccountId)) {
      this.selectedDemographicAccountId = memberUsers[0]?.account_id || '';
    }
    this.knowledgeFiles = knowledgeFilesResult?.ok && Array.isArray(knowledgeFilesResult.data?.files) ? knowledgeFilesResult.data.files : [];
    this.soundtracks = soundtracksResult?.ok && Array.isArray(soundtracksResult.data?.tracks) ? soundtracksResult.data.tracks : [];
    this.soundtrackError = soundtracksResult?.ok ? '' : soundtracksResult?.error || 'Katalog soundtrack gagal dimuat.';
    this.portalRecords = {
      project: projectsResult?.ok ? projectsResult.data.records || [] : [],
      alumni: alumniResult?.ok ? alumniResult.data.records || [] : [],
      job: jobsResult?.ok ? jobsResult.data.records || [] : []
    };
    this.portalRecordsError = [projectsResult, alumniResult, jobsResult].filter((result) => !result?.ok)
      .map((result) => result?.error || 'Katalog tidak dapat dimuat.').join(' ');
    this.render(body);
  }

  render(body) {
    const fontSelect = (name, current) => `
      <select class="form-select studio-font-picker" name="${name}" style="font-size:${this.config.theme.typeScale}px">
        ${FONT_OPTIONS.map((font) => `<option value="${font}" style="font-family:&quot;${font}&quot;,sans-serif;font-size:${this.config.theme.typeScale}px" ${current === font ? 'selected' : ''}>${font}</option>`).join('')}
        ${this.assets.filter((asset) => asset.kind === 'font').map((asset) => `<option value="asset:${escapeHtml(asset.id)}" style="font-family:&quot;HMIFAsset-${escapeHtml(asset.id)}&quot;,sans-serif;font-size:${this.config.theme.typeScale}px" ${current === `asset:${asset.id}` ? 'selected' : ''}>${escapeHtml(asset.original_name)}</option>`).join('')}
      </select>`;
    const paletteEditor = (mode, title, description, colors) => `
      <fieldset class="studio-palette" data-palette="${mode}">
        <legend>${title}</legend>
        <p class="studio-help">${description}</p>
        <div class="studio-palette-preview" data-palette-preview="${mode}">
          <div class="studio-palette-sample" style="--sample-background:${escapeHtml(colors.background)};--sample-panel:${escapeHtml(colors.panel)};--sample-accent:${escapeHtml(colors.accent)};--sample-text:${escapeHtml(colors.text)};--sample-border:${escapeHtml(colors.border)}">
            <span>PRTS // ${mode === 'dark' ? 'NIGHT' : 'DAY'} PROTOCOL</span>
            <strong>Pratinjau komponen</strong>
            <button type="button" disabled>AKSES PANEL</button>
          </div>
        </div>
        <div class="studio-color-grid">
          ${Object.entries(SITE_COLOR_LABELS).map(([key, label]) => `
            <label class="studio-color-field"><span>${label}</span><input type="color" name="color.${mode}.${key}" value="${escapeHtml(colors[key])}" /><code>${escapeHtml(colors[key])}</code></label>
          `).join('')}
        </div>
      </fieldset>`;
    const imageSelect = (name, current, builtins, { allowEmpty = false, emptyLabel = 'Tanpa gambar' } = {}) => {
      const uploaded = this.assets.filter((asset) => asset.kind === 'image').map((asset) => ({
        value: uploadedAssetFileUrl(asset.id),
        label: asset.original_name
      }));
      const options = [
        ...(allowEmpty ? [{ value: '', label: emptyLabel }] : []),
        ...builtins,
        ...uploaded
      ];
      if (current && !options.some((option) => option.value === current)) {
        options.push({ value: current, label: 'Gambar saat ini' });
      }
      return `<select class="form-select" name="${name}">${options.map((option) => `
              <option value="${escapeHtml(option.value)}" ${current === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
            </select>`;
    };
    const inlineImageSelect = (name, current, builtins) => {
      const select = imageSelect(name, current, builtins, { allowEmpty: true, emptyLabel: 'Tanpa foto' })
        .replace('<select class="form-select"', `<select class="form-select" data-image-preview-select="${escapeHtml(name)}"`);
      return `
      <div class="studio-inline-image-control">
        ${select}
        <img class="studio-inline-image-preview" data-image-preview="${escapeHtml(name)}" src="${escapeHtml(current || '/assets/silhouette_male.jpg')}" alt="Pratinjau foto" />
        <label class="btn-tactical studio-inline-upload-label">UNGGAH FOTO<input type="file" accept="image/png,image/jpeg,image/webp" data-inline-image-upload="${escapeHtml(name)}" /></label>
      </div>`;
    };
    const currentLogo = this.config.content.data.identity.logo || '';
    const currentBackground = resolveBackgroundImage(this.config.theme.background);
    const currentHero = this.config.theme.heroImage || '';
    const customPages = this.config.content.customPages || [];
    const pagesById = new Map(this.config.pages.map((page) => [page.id, page]));
    const customPagesByNavId = new Map(customPages.map((page, index) => [`custom-${page.id}`, { page, index }]));
    const sidebarOrder = this.config.content.sidebarOrder
      || [...this.config.pages.map(({ id }) => id), ...customPages.map(({ id }) => `custom-${id}`)];
    const sidebarLabels = new Map([
      ...this.config.pages.map((page) => [page.id, labels[page.id] || page.id]),
      ...customPages.map((page) => [`custom-${page.id}`, page.title])
    ]);
    const siteMapNodes = this.config.content.siteMapNodes || [];

    body.innerHTML = `
      <div class="site-studio">
      <header class="studio-heading">
        <div>
          <span class="section-tag cyan">PRTS // CONTENT OPERATIONS</span>
          <h2>Site Studio</h2>
          <p>Kelola tampilan, halaman, dan data portal HMIF dari satu ruang kerja.</p>
        </div>
        <div class="studio-draft-state" data-studio-state role="status" aria-live="polite">
          <span class="studio-state-indicator" aria-hidden="true"></span>
          <span data-studio-state-label>DRAFT SIAP DIEDIT</span>
        </div>
      </header>
      <div class="studio-toolbar" role="tablist" aria-label="Site Studio">
        <button id="studio-tab-theme" class="workspace-nav-link ${this.activeTab === 'theme' ? 'active' : ''}" type="button" role="tab" aria-selected="${this.activeTab === 'theme'}" aria-controls="studio-panel-theme" tabindex="${this.activeTab === 'theme' ? '0' : '-1'}" data-studio-tab="theme">Tema</button>
        <button id="studio-tab-pages" class="workspace-nav-link ${this.activeTab === 'pages' ? 'active' : ''}" type="button" role="tab" aria-selected="${this.activeTab === 'pages'}" aria-controls="studio-panel-pages" tabindex="${this.activeTab === 'pages' ? '0' : '-1'}" data-studio-tab="pages">Halaman & Konten</button>
        <button id="studio-tab-map" class="workspace-nav-link ${this.activeTab === 'map' ? 'active' : ''}" type="button" role="tab" aria-selected="${this.activeTab === 'map'}" aria-controls="studio-panel-map" tabindex="${this.activeTab === 'map' ? '0' : '-1'}" data-studio-tab="map">Peta Kampus</button>
        <button id="studio-tab-departments" class="workspace-nav-link ${this.activeTab === 'departments' ? 'active' : ''}" type="button" role="tab" aria-selected="${this.activeTab === 'departments'}" aria-controls="studio-panel-departments" tabindex="${this.activeTab === 'departments' ? '0' : '-1'}" data-studio-tab="departments">Struktur & Departemen</button>
        <button id="studio-tab-organization" class="workspace-nav-link ${this.activeTab === 'organization' ? 'active' : ''}" type="button" role="tab" aria-selected="${this.activeTab === 'organization'}" aria-controls="studio-panel-organization" tabindex="${this.activeTab === 'organization' ? '0' : '-1'}" data-studio-tab="organization">Hierarki Organisasi</button>
        <button id="studio-tab-university" class="workspace-nav-link ${this.activeTab === 'university' ? 'active' : ''}" type="button" role="tab" aria-selected="${this.activeTab === 'university'}" aria-controls="studio-panel-university" tabindex="${this.activeTab === 'university' ? '0' : '-1'}" data-studio-tab="university">Bagan Universitas</button>
        <button id="studio-tab-access" class="workspace-nav-link ${this.activeTab === 'access' ? 'active' : ''}" type="button" role="tab" aria-selected="${this.activeTab === 'access'}" aria-controls="studio-panel-access" tabindex="${this.activeTab === 'access' ? '0' : '-1'}" data-studio-tab="access">Akses Akun</button>
        <button id="studio-tab-demographics" class="workspace-nav-link ${this.activeTab === 'demographics' ? 'active' : ''}" type="button" role="tab" aria-selected="${this.activeTab === 'demographics'}" aria-controls="studio-panel-demographics" tabindex="${this.activeTab === 'demographics' ? '0' : '-1'}" data-studio-tab="demographics">Statistik Akun</button>
        <button id="studio-tab-collections" class="workspace-nav-link ${this.activeTab === 'collections' ? 'active' : ''}" type="button" role="tab" aria-selected="${this.activeTab === 'collections'}" aria-controls="studio-panel-collections" tabindex="${this.activeTab === 'collections' ? '0' : '-1'}" data-studio-tab="collections">Data Organisasi</button>
        <button id="studio-tab-assets" class="workspace-nav-link ${this.activeTab === 'assets' ? 'active' : ''}" type="button" role="tab" aria-selected="${this.activeTab === 'assets'}" aria-controls="studio-panel-assets" tabindex="${this.activeTab === 'assets' ? '0' : '-1'}" data-studio-tab="assets">Aset & Versi</button>
        <button id="studio-tab-security" class="workspace-nav-link ${this.activeTab === 'security' ? 'active' : ''}" type="button" role="tab" aria-selected="${this.activeTab === 'security'}" aria-controls="studio-panel-security" tabindex="${this.activeTab === 'security' ? '0' : '-1'}" data-studio-tab="security">Status Darurat</button>
      </div>
      <form id="site-studio-form" class="site-studio-form">
        <section id="studio-panel-theme" class="studio-panel" role="tabpanel" aria-labelledby="studio-tab-theme" tabindex="0" data-studio-panel="theme" ${this.activeTab !== 'theme' ? 'hidden' : ''}>
          <h3>IDENTITAS VISUAL</h3>
          <p class="studio-help">Ubah logo dan latar tanpa bingkai pemotong. Unggah gambar di tab Aset, lalu pilih di sini atau tekan tombol pada pustaka aset.</p>
          <div class="studio-visual-preview">
            ${currentLogo ? `<img src="${escapeHtml(currentLogo)}" alt="Pratinjau logo organisasi" data-logo-preview />` : '<span data-logo-preview-empty>Belum ada logo</span>'}
            <div>
              <strong>Logo organisasi</strong>
              <small>Ditampilkan utuh di bilah atas dan kartu terminal. PNG transparan disarankan.</small>
            </div>
          </div>
          <div class="admin-form-grid">
            <label class="form-group"><span class="form-label">LOGO ORGANISASI</span>${imageSelect('identity.logo', currentLogo, BUILTIN_SITE_IMAGES.logos, { allowEmpty: true, emptyLabel: 'Tanpa logo' })}</label>
            <label class="form-group"><span class="form-label">MODE LATAR SITUS</span><select class="form-select" name="backgroundMode"><option value="grid">Foto + overlay</option><option value="image">Foto penuh</option><option value="solid">Warna saja</option></select></label>
            <label class="form-group"><span class="form-label">GAMBAR LATAR SITUS</span>${imageSelect('backgroundImage', currentBackground, BUILTIN_SITE_IMAGES.backgrounds, { allowEmpty: true, emptyLabel: 'Tanpa foto' })}</label>
            <label class="form-group"><span class="form-label">GAMBAR HERO DASHBOARD</span>${imageSelect('heroImage', currentHero, BUILTIN_SITE_IMAGES.heroes, { allowEmpty: true, emptyLabel: 'Tanpa gambar hero' })}</label>
          </div>
          <h3>PALET WARNA</h3>
          <div class="studio-palette-grid">
            ${paletteEditor('dark', 'TEMA GELAP', 'Palet ini diterapkan saat tema gelap aktif.', this.config.theme.colors)}
            ${paletteEditor('light', 'TEMA CERAH', 'Palet ini diterapkan saat tema cerah aktif.', this.config.theme.lightColors)}
          </div>
          <h3>TIPOGRAFI DAN BENTUK</h3>
          <div class="admin-form-grid">
            <label class="form-group"><span class="form-label">FONT ISI</span>${fontSelect('font.body', this.config.theme.fonts.body)}<span class="studio-font-preview" data-font-preview="font.body">${FONT_PREVIEW_SAMPLES['font.body']}</span><small class="studio-font-preview-meta" data-font-preview-meta="font.body"></small></label>
            <label class="form-group"><span class="form-label">FONT JUDUL</span>${fontSelect('font.heading', this.config.theme.fonts.heading)}<span class="studio-font-preview" data-font-preview="font.heading">${FONT_PREVIEW_SAMPLES['font.heading']}</span><small class="studio-font-preview-meta" data-font-preview-meta="font.heading"></small></label>
            <label class="form-group"><span class="form-label">FONT MONOSPACE</span>${fontSelect('font.mono', this.config.theme.fonts.mono)}<span class="studio-font-preview" data-font-preview="font.mono">${FONT_PREVIEW_SAMPLES['font.mono']}</span><small class="studio-font-preview-meta" data-font-preview-meta="font.mono"></small></label>
            <label class="form-group"><span class="form-label">UKURAN DASAR</span><input class="form-input" name="typeScale" type="range" min="14" max="22" value="${this.config.theme.typeScale}" /><output data-scale-output>${this.config.theme.typeScale}px</output></label>
            <label class="form-group"><span class="form-label">BENTUK KOMPONEN</span><select class="form-select" name="shape"><option value="tactical">Tactical</option><option value="soft">Lembut</option><option value="square">Kotak</option></select><div class="studio-shape-preview" data-shape-preview><div class="studio-shape-sample"><span>HMIF // PANEL</span><strong>Contoh komponen</strong><small>Pratinjau bentuk yang dipilih.</small><button type="button" disabled>LIHAT DETAIL</button></div></div></label>
            <label class="form-group"><span class="form-label">GAYA IKON</span><select class="form-select" name="iconStyle"><option value="tactical">Tactical</option><option value="minimal">Minimal</option><option value="text">Teks</option></select></label>
            <label class="form-group"><span class="form-label">KONTRAS</span><select class="form-select" name="contrast"><option value="normal">Normal</option><option value="high">Tinggi</option></select></label>
          </div>
          <label class="studio-toggle"><input type="checkbox" name="motion" /> <span>Aktifkan animasi antarmuka</span></label>
          <h3>PARTIKEL LATAR</h3>
          <div class="studio-dust-grid">
            ${[['density', 'KEPADATAN DUST'], ['opacity', 'INTENSITAS DUST']].map(([key, label]) => {
              const value = this.config.theme.dust?.[key] ?? 100;
              const name = key === 'density' ? 'dustDensity' : 'dustOpacity';
              return `<label class="form-group studio-dust-field"><span class="form-label">${label}</span><input class="form-input studio-dust-range" type="range" min="10" max="${DUST_PERCENT_MAX}" step="1" value="${value}" data-dust-range="${key}" aria-label="${label} slider" /><span class="studio-dust-number"><input class="form-input" name="${name}" type="number" min="10" max="${DUST_PERCENT_MAX}" step="1" value="${value}" required aria-label="${label} dalam persen" /><span>%</span></span><output data-dust-output="${key}">${value}%</output></label>`;
            }).join('')}
          </div>
          <p class="studio-help">Rentang dapat diatur manual dari 10% hingga ${DUST_PERCENT_MAX}%. Kepadatan tinggi menambah partikel dan beban perangkat. Gerakan mengikuti pengaturan animasi dan reduced-motion perangkat.</p>
          <div class="studio-contrast" data-contrast-check role="status"></div>
        </section>
        <section id="studio-panel-pages" class="studio-panel" role="tabpanel" aria-labelledby="studio-tab-pages" tabindex="0" data-studio-panel="pages" ${this.activeTab !== 'pages' ? 'hidden' : ''}>
          <h3>NAVIGASI DAN VISIBILITAS HALAMAN</h3>
          <p class="studio-help">Urutan dan visibilitas di sini hanya mengatur menu sidebar. Susunan hierarki Peta Navigasi Situs dikelola terpisah di bawah ini.</p>
          <div class="studio-block-list">${sidebarOrder.map((id, index) => {
            const page = pagesById.get(id);
            const customPageEntry = customPagesByNavId.get(id);
            if (!page && !customPageEntry) return '';
            const customPage = customPageEntry?.page;
            const label = page ? labels[page.id] : customPage.title;
            const visibilityName = page ? `visible.${page.id}` : `customPage.${customPageEntry.index}.visible`;
            return `
            <div class="studio-block-row" data-sidebar-order-item="${escapeHtml(id)}">
              <span class="studio-block-number">${String(index + 1).padStart(2, '0')}</span>
              <strong>${escapeHtml(label)}</strong>
              <label class="studio-toggle"><input type="checkbox" name="${visibilityName}" ${(page ? page.visible : customPage.visible) ? 'checked' : ''} /> <span>Tampil</span></label>
              ${page
                ? `<select class="form-select" name="layout.${page.id}" aria-label="Tata letak ${labels[page.id]}"><option value="default" ${page.layout === 'default' ? 'selected' : ''}>Normal</option><option value="wide" ${page.layout === 'wide' ? 'selected' : ''}>Lebar</option><option value="compact" ${page.layout === 'compact' ? 'selected' : ''}>Ringkas</option></select>`
                : '<span class="studio-help">Halaman kustom</span>'}
              <button class="btn-tactical" type="button" data-move-sidebar-item="${escapeHtml(id)}" data-direction="up" ${index === 0 ? 'disabled' : ''} aria-label="Naikkan ${escapeHtml(label)}">↑</button>
              <button class="btn-tactical" type="button" data-move-sidebar-item="${escapeHtml(id)}" data-direction="down" ${index === sidebarOrder.length - 1 ? 'disabled' : ''} aria-label="Turunkan ${escapeHtml(label)}">↓</button>
            </div>`;
          }).join('')}</div>
          ${renderSiteMapEditor(siteMapNodes, sidebarLabels)}
          ${this.renderCustomPagesPanel()}
          <h3>KONTEN TEKS</h3>
          <label class="form-group"><span class="form-label">EYEBROW DASHBOARD</span><input class="form-input" name="heroEyebrow" maxlength="80" value="${escapeHtml(this.config.content.heroEyebrow)}" /></label>
          <label class="form-group"><span class="form-label">DESKRIPSI DASHBOARD</span><textarea class="form-textarea" name="heroLead" maxlength="500">${escapeHtml(this.config.content.heroLead)}</textarea></label>
          <div class="admin-form-grid">${this.config.content.heroActions.map((label, index) => `
            <label class="form-group"><span class="form-label">LABEL AKSI ${index + 1}</span><input class="form-input" name="heroAction.${index}" maxlength="80" value="${escapeHtml(label)}" /></label>
          `).join('')}</div>
          <div class="admin-form-grid">${Object.entries(this.config.content.statLabels).map(([key, label]) => `
            <label class="form-group"><span class="form-label">LABEL STATISTIK ${key}</span><input class="form-input" name="statLabel.${key}" maxlength="80" value="${escapeHtml(label)}" /></label>
          `).join('')}</div>
          <div class="admin-form-grid">${Object.entries(labels).filter(([id]) => id !== 'dashboard').map(([id, label]) => `
            <label class="form-group"><span class="form-label">DESKRIPSI ${label.toUpperCase()}</span><textarea class="form-textarea" name="description.${id}" maxlength="1000">${escapeHtml(this.config.content.sectionDescriptions[id])}</textarea></label>
          `).join('')}</div>
          <div class="admin-form-grid">${Object.entries(labels).filter(([id]) => id !== 'dashboard').map(([id, label]) => `
            <label class="form-group"><span class="form-label">JUDUL ${label.toUpperCase()}</span><input class="form-input" name="title.${id}" maxlength="80" value="${escapeHtml(this.config.content.sectionTitles[id])}" /></label>
          `).join('')}</div>
        </section>
        <section id="studio-panel-map" class="studio-panel" role="tabpanel" aria-labelledby="studio-tab-map" tabindex="0" data-studio-panel="map" ${this.activeTab !== 'map' ? 'hidden' : ''}>
          ${renderCampusMapPanel(this.config.content.data.campusMap || { navigationLabel: 'Peta Kampus', summary: '', publicWidgetVisible: true, defaultZoom: 17, campuses: [] }, this.assets, this.selectedCampusMapFeatureId)}
        </section>
        <section id="studio-panel-departments" class="studio-panel" role="tabpanel" aria-labelledby="studio-tab-departments" tabindex="0" data-studio-panel="departments" ${this.activeTab !== 'departments' ? 'hidden' : ''}>
          ${this.renderDepartmentsPanel(imageSelect, inlineImageSelect)}
        </section>
        <section id="studio-panel-organization" class="studio-panel" role="tabpanel" aria-labelledby="studio-tab-organization" tabindex="0" data-studio-panel="organization" ${this.activeTab !== 'organization' ? 'hidden' : ''}>
          ${this.renderOrganizationPanel()}
        </section>
        <section id="studio-panel-university" class="studio-panel" role="tabpanel" aria-labelledby="studio-tab-university" tabindex="0" data-studio-panel="university" ${this.activeTab !== 'university' ? 'hidden' : ''}>
          ${renderUniversityOrganizationPanel(this.config.content.data.universityOrganization || { structures: [] })}
        </section>
        <section id="studio-panel-access" class="studio-panel" role="tabpanel" aria-labelledby="studio-tab-access" tabindex="0" data-studio-panel="access" ${this.activeTab !== 'access' ? 'hidden' : ''}>
          ${this.renderAccountAccessPanel()}
        </section>
        <section id="studio-panel-demographics" class="studio-panel" role="tabpanel" aria-labelledby="studio-tab-demographics" tabindex="0" data-studio-panel="demographics" ${this.activeTab !== 'demographics' ? 'hidden' : ''}>
          ${this.renderStudentDemographicsPanel()}
        </section>
        <section id="studio-panel-collections" class="studio-panel" role="tabpanel" aria-labelledby="studio-tab-collections" tabindex="0" data-studio-panel="collections" ${this.activeTab !== 'collections' ? 'hidden' : ''}>
          <h3>IDENTITAS ORGANISASI</h3>
          <div class="admin-form-grid">
            ${[['name', 'NAMA'], ['abbreviation', 'SINGKATAN'], ['university', 'UNIVERSITAS'], ['faculty', 'FAKULTAS'], ['established', 'TAHUN BERDIRI'], ['location', 'LOKASI'], ['tagline', 'TAGLINE'], ['activeCadets', 'ANGGOTA AKTIF'], ['complianceRate', 'TINGKAT KEPATUHAN']].map(([key, label]) => `
              <label class="form-group"><span class="form-label">${label}</span><input class="form-input" name="identity.${key}" maxlength="160" value="${escapeHtml(this.config.content.data.identity[key])}" /></label>
            `).join('')}
            <label class="form-group"><span class="form-label">JUMLAH DIVISI</span><input class="form-input" type="number" name="identity.divisionsCount" min="0" max="1000" value="${this.config.content.data.identity.divisionsCount}" /></label>
            <label class="form-group"><span class="form-label">JUMLAH PROGRAM</span><input class="form-input" type="number" name="identity.prokerCount" min="0" max="1000" value="${this.config.content.data.identity.prokerCount}" /></label>
          </div>
          <h3>VISI, MISI, DAN SAMBUTAN</h3>
          <label class="form-group"><span class="form-label">VISI</span><textarea class="form-textarea" name="vision" maxlength="3000">${escapeHtml(this.config.content.data.visionMission.vision)}</textarea></label>
          <label class="form-group"><span class="form-label">MISI (SATU BUTIR PER BARIS)</span><textarea class="form-textarea" name="missions" maxlength="12000">${escapeHtml(this.config.content.data.visionMission.mission.join('\n'))}</textarea></label>
          <div class="admin-form-grid">${[['leaderName', 'NAMA KETUA'], ['role', 'JABATAN'], ['period', 'PERIODE'], ['operatorCode', 'KODE'], ['quote', 'SAMBUTAN']].map(([key, label]) => `
            <label class="form-group"><span class="form-label">${label}</span><textarea class="form-textarea" name="welcome.${key}" maxlength="${key === 'quote' ? 2000 : 160}">${escapeHtml(this.config.content.data.visionMission.sambutanKahim[key])}</textarea></label>
          `).join('')}</div>
          <h3>KOLEKSI LAINNYA</h3>
          <div class="studio-info-banner" style="margin-bottom: 1rem; padding: 0.75rem 1rem; background: rgba(0, 229, 255, 0.08); border: 1px solid var(--ak-cyan); color: var(--ak-text-primary); font-size: 0.8rem;">
            <strong>SISTEM ORGANISASI VISUAL:</strong> Departemen, Kadep, Sekdep, dan Staf kini dikelola secara visual melalui tab <strong>STRUKTUR & DEPARTEMEN</strong> tanpa perlu menyunting JSON manual.
          </div>
          <div class="studio-info-banner" style="margin-bottom: 1rem; padding: 0.75rem 1rem; background: rgba(255, 170, 0, 0.08); border: 1px solid var(--ak-gold); color: var(--ak-text-primary); font-size: 0.8rem;">
            <strong>AMANDEMEN KONSTITUSI & DOKTRIN:</strong> Naskah AD/ART, Garis Besar Haluan Organisasi (GBHO), alur tahapan kaderisasi, dan bank soal kuis kader dapat disunting atau diamandemen sewaktu-waktu melalui editor JSON terstruktur di bawah ini dan otomatis tersinkronisasi ke seluruh portal.
          </div>
          ${[
        ['news', 'BERITA'],
        ['doctrine', 'DOKTRIN KONSTITUSI (AD/ART, GBHO, ROADMAP & KUIS)']
      ].map(([key, label]) => `
            <label class="form-group"><span class="form-label">${label} // JSON TERSTRUKTUR</span><textarea class="form-textarea studio-json-editor" name="collection.${key}" rows="14" spellcheck="false">${escapeHtml(JSON.stringify(this.config.content.data[key] || [], null, 2))}</textarea></label>
          `).join('')}
          ${this.renderKnowledgeResourcesPanel()}
        </section>
        <section id="studio-panel-assets" class="studio-panel" role="tabpanel" aria-labelledby="studio-tab-assets" tabindex="0" data-studio-panel="assets" ${this.activeTab !== 'assets' ? 'hidden' : ''}>
          <h3>UNGGAH GAMBAR ATAU FONT</h3>
          <div id="studio-asset-form" class="admin-form">
            <input class="form-input" type="file" name="asset" accept="image/png,image/jpeg,image/webp,font/woff2,font/ttf,font/otf" required />
            <small>Maksimal 5 MB. Gambar PNG/JPEG/WebP; font WOFF2/TTF/OTF. SVG dan script tidak diterima.</small>
            <p class="auth-feedback" data-asset-feedback role="status"></p>
            <button class="btn-tactical primary" type="button" data-upload-asset>UNGGAH ASET</button>
          </div>
          <h3>KATALOG SOUNDTRACK PUBLIK</h3>
          <p>Tambahkan audio yang memiliki izin penggunaan. Unggahan MP3/M4A/WAV/OGG/AAC maksimal 20 MB, atau tautan streaming HTTPS.</p>
          ${this.soundtrackError ? `<p class="auth-feedback" role="alert">${escapeHtml(this.soundtrackError)}</p>` : ''}
          <div class="admin-form-grid" data-soundtrack-link-editor>
            <label class="form-group"><span class="form-label">JUDUL TRACK TAUTAN</span><input class="form-input" name="title" maxlength="120" required /></label>
            <label class="form-group"><span class="form-label">URL AUDIO HTTPS</span><input class="form-input" type="url" name="url" maxlength="2000" placeholder="https://.../track.mp3" required /></label>
            <button class="btn-tactical" type="button" data-soundtrack-add-link>DAFTARKAN TAUTAN</button>
          </div>
          <div class="admin-form-grid" data-soundtrack-upload-editor>
            <label class="form-group"><span class="form-label">JUDUL TRACK UNGGAHAN</span><input class="form-input" name="title" maxlength="120" required /></label>
            <label class="form-group"><span class="form-label">BERKAS AUDIO</span><input class="form-input" type="file" name="audio" accept="audio/mpeg,audio/mp4,audio/wav,audio/x-wav,audio/ogg,audio/aac" required /></label>
            <button class="btn-tactical primary" type="button" data-soundtrack-upload>UNGGAH AUDIO</button>
          </div>
          <p class="auth-feedback" data-soundtrack-feedback role="status" aria-live="polite"></p>
          <div class="admin-record-list" data-soundtrack-list>
            ${this.soundtracks.map((track, index) => `
              <div class="admin-record-row" data-soundtrack-row="${escapeHtml(track.id)}">
                <span><strong>${escapeHtml(track.title)}</strong><small>${track.source_type === 'upload' ? `${escapeHtml(track.mime_type)} // ${(track.size / 1024 / 1024).toFixed(2)} MB // SHA-256 ${escapeHtml((track.sha256 || '').slice(0, 12))}...` : escapeHtml(track.source_url)} // ${track.active ? 'AKTIF' : 'NONAKTIF'}</small></span>
                <button class="btn-tactical" type="button" data-soundtrack-move="up" data-soundtrack-id="${escapeHtml(track.id)}" ${index === 0 ? 'disabled' : ''}>NAIK</button>
                <button class="btn-tactical" type="button" data-soundtrack-move="down" data-soundtrack-id="${escapeHtml(track.id)}" ${index === this.soundtracks.length - 1 ? 'disabled' : ''}>TURUN</button>
                <button class="btn-tactical" type="button" data-soundtrack-toggle="${escapeHtml(track.id)}">${track.active ? 'NONAKTIFKAN' : 'AKTIFKAN'}</button>
                <button class="btn-tactical danger" type="button" data-soundtrack-delete="${escapeHtml(track.id)}" ${track.active ? 'disabled title="Nonaktifkan track sebelum menghapus"' : ''}>HAPUS</button>
              </div>
            `).join('') || '<p>Belum ada soundtrack. Pemutar publik tetap tersembunyi sampai track diaktifkan.</p>'}
          </div>
          ${this.renderPortalRecordsPanel()}
          <h3>PUSTAKA ASET</h3>
          <div class="studio-asset-grid">${this.assets.map((asset) => `
            <div class="studio-asset-row">
              ${asset.kind === 'image' ? `<img src="/api/site/assets/${asset.id}/file" alt="${escapeHtml(asset.original_name)}" />` : '<span class="studio-font-mark">Aa</span>'}
              <span><strong>${escapeHtml(asset.original_name)}</strong><small>${escapeHtml(asset.mime_type)} // ${(asset.size / 1024).toFixed(1)} KB</small></span>
              <button class="btn-tactical" type="button" data-use-logo="${asset.id}" ${asset.kind !== 'image' ? 'disabled' : ''}>JADIKAN LOGO</button>
              <button class="btn-tactical" type="button" data-use-background="${asset.id}" ${asset.kind !== 'image' ? 'disabled' : ''}>JADIKAN LATAR</button>
              <button class="btn-tactical" type="button" data-use-hero="${asset.id}" ${asset.kind !== 'image' ? 'disabled' : ''}>JADIKAN HERO</button>
              <button class="btn-tactical" type="button" data-delete-asset="${asset.id}">HAPUS</button>
            </div>
          `).join('') || '<p>Belum ada aset yang diunggah.</p>'}</div>
          <h3>VERSI DAN PEMULIHAN</h3>
          <div class="admin-record-list">${this.revisions.map((revision) => `
            <div class="admin-record-row studio-revision-row"><span>v${revision.version} // ${escapeHtml(revision.status)} // ${escapeHtml(new Date(revision.created_at).toLocaleString('id-ID'))}</span><button class="btn-tactical" type="button" data-restore-revision="${revision.id}">PULIHKAN KE DRAFT</button></div>
          `).join('') || '<p>Belum ada versi.</p>'}</div>
          <h3>LOG AKTIVITAS ADMIN</h3>
          <div class="admin-record-list">${this.audit.map((entry) => `<p>${escapeHtml(entry.created_at)} // ${escapeHtml(entry.actor_nim)} // ${escapeHtml(entry.action)} // ${escapeHtml(entry.target_id)}</p>`).join('') || '<p>Belum ada aktivitas.</p>'}</div>
        </section>
        <section id="studio-panel-security" class="studio-panel" role="tabpanel" aria-labelledby="studio-tab-security" tabindex="0" data-studio-panel="security" ${this.activeTab !== 'security' ? 'hidden' : ''}>
          <h3>PENGUMUMAN KEAMANAN PUBLIK</h3>
          <p class="studio-help">Pengumuman ditampilkan kepada semua pengunjung, termasuk yang belum masuk. Aktifkan secara manual setelah tim mengonfirmasi adanya gangguan; jangan cantumkan detail teknis, data pribadi, atau dugaan yang belum terverifikasi.</p>
          ${this.securityNoticeError ? `<p class="auth-feedback" role="alert">${escapeHtml(this.securityNoticeError)}</p>` : ''}
          <div class="admin-form-grid">
            <label class="form-group"><span class="form-label">STATUS LAYANAN</span>
              <select class="form-select" data-security-notice-status>
                <option value="normal" ${this.securityNotice.status === 'normal' ? 'selected' : ''}>Normal</option>
                <option value="investigating" ${this.securityNotice.status === 'investigating' ? 'selected' : ''}>Sedang diperiksa</option>
                <option value="incident" ${this.securityNotice.status === 'incident' ? 'selected' : ''}>Gangguan keamanan ditangani</option>
                <option value="recovering" ${this.securityNotice.status === 'recovering' ? 'selected' : ''}>Pemulihan layanan</option>
              </select>
            </label>
            <label class="form-group"><span class="form-label">PESAN PUBLIK (OPSIONAL)</span>
              <textarea class="form-textarea" data-security-notice-message maxlength="500" rows="3" placeholder="Jika kosong, pesan aman standar akan digunakan.">${escapeHtml(this.securityNotice.message)}</textarea>
            </label>
          </div>
          <div class="studio-security-notice-actions">
            <button class="btn-tactical danger" type="button" data-save-security-notice>TERBITKAN STATUS DARURAT</button>
            <span class="studio-help">Terakhir diperbarui: ${escapeHtml(this.securityNotice.updatedAt || 'belum pernah')}</span>
          </div>
          <p class="auth-feedback" data-security-notice-feedback role="status" aria-live="polite"></p>
          <div class="studio-info-banner">
            <strong>KANAL INDEPENDEN:</strong> Tombol ini mengubah status pada API utama, sehingga tidak tersedia saat server utama mati atau tidak tepercaya. Paket halaman status independen berada di folder <code>status-page</code>; deploy terpisah dan sambungkan feed-nya sesuai panduan sebelum mengandalkannya saat pemulihan.
          </div>
        </section>
        <p class="auth-feedback" data-studio-feedback role="status"></p>
        <div class="studio-actions" aria-label="Aksi Site Studio">
          <button class="btn-tactical" type="button" data-action="preview" aria-pressed="${this.previewing}">PRATINJAU</button>
          <button class="btn-tactical" type="button" data-action="cancel-preview" ${this.previewing ? '' : 'disabled'}>TUTUP PRATINJAU</button>
          <span class="studio-actions-spacer"></span>
          <button class="btn-tactical danger" type="button" data-action="reset">KEMBALI KE DEFAULT</button>
          <button class="btn-tactical" type="button" data-action="close">TUTUP STUDIO</button>
          <button class="btn-tactical primary" type="button" data-action="save">SIMPAN DRAFT</button>
          <button class="btn-tactical gold" type="button" data-action="publish">PUBLIKASIKAN</button>
        </div>
      </form>
      </div>
    `;

    const tabContainer = this.getTabContainer?.();
    const toolbar = body.querySelector('.studio-toolbar');
    if (tabContainer && toolbar) {
      tabContainer.replaceChildren(toolbar);
      tabContainer.hidden = false;
    }

    const form = body.querySelector('#site-studio-form');
    form.elements.shape.value = this.config.theme.shape;
    form.elements.iconStyle.value = this.config.theme.iconStyle;
    form.elements.backgroundMode.value = this.config.theme.background.mode;
    form.elements.backgroundImage.value = currentBackground;
    form.elements.contrast.value = this.config.theme.contrast;
    form.elements.motion.checked = this.config.theme.motion;
    form.elements.dustDensity.value = String(this.config.theme.dust?.density ?? 100);
    form.elements.dustOpacity.value = String(this.config.theme.dust?.opacity ?? 100);
    const shapePreview = form.querySelector('[data-shape-preview]');
    shapePreview.dataset.shape = form.elements.shape.value;
    form.elements.shape.addEventListener('change', () => {
      shapePreview.dataset.shape = form.elements.shape.value;
    });
    const updateFontSizePreview = () => {
      const size = `${form.elements.typeScale.value}px`;
      form.querySelectorAll('.studio-font-picker').forEach((select) => {
        select.style.fontSize = size;
        [...select.options].forEach((option) => {
          option.style.fontSize = size;
        });
      });
      form.querySelectorAll('.studio-font-preview').forEach((preview) => {
        preview.style.fontSize = size;
      });
      form.querySelectorAll('[data-font-preview-meta]').forEach((meta) => {
        const select = form.elements[meta.dataset.fontPreviewMeta];
        meta.textContent = `${select.selectedOptions[0]?.textContent.trim() || 'Font'} // ${size}`;
        meta.style.fontFamily = select.style.fontFamily;
        meta.style.fontSize = size;
      });
    };
    form.querySelectorAll('select[name^="font."]').forEach((select) => {
      const preview = form.querySelector(`[data-font-preview="${CSS.escape(select.name)}"]`);
      const updatePreview = async () => {
        const selectedFont = select.value;
        const sample = FONT_PREVIEW_SAMPLES[select.name];
        if (!preview || !sample) return;

        preview.textContent = sample;
        let family = selectedFont;
        if (selectedFont.startsWith('asset:')) {
          const assetId = /^asset:([a-f0-9-]{36})$/i.exec(selectedFont)?.[1];
          const asset = assetId && this.assets.find((item) => item.id === assetId && item.kind === 'font');
          if (!assetId || !asset) {
            preview.textContent = 'Font yang dipilih tidak tersedia.';
            preview.dataset.fontPreviewState = 'error';
            return;
          }

          family = `HMIFAsset-${assetId}`;
          if (!document.fonts.check(`16px "${family}"`)) {
            preview.dataset.fontPreviewState = 'loading';
            let fontLoad = this.fontPreviewLoads.get(assetId);
            if (!fontLoad) {
              fontLoad = new FontFace(family, `url("/api/site/assets/${assetId}/file")`)
                .load()
                .then((loadedFont) => {
                  document.fonts.add(loadedFont);
                  return family;
                });
              this.fontPreviewLoads.set(assetId, fontLoad);
            }
            try {
              await fontLoad;
            } catch {
              this.fontPreviewLoads.delete(assetId);
              if (select.value === selectedFont) {
                preview.textContent = `Pratinjau ${asset.original_name} gagal dimuat.`;
                preview.dataset.fontPreviewState = 'error';
              }
              return;
            }
          }
        } else if (!FONT_OPTIONS.includes(selectedFont)) {
          preview.textContent = 'Pilihan font tidak dikenal.';
          preview.dataset.fontPreviewState = 'error';
          return;
        }

        if (select.value !== selectedFont) return;
        const fallback = select.name === 'font.mono' ? 'monospace' : 'sans-serif';
        preview.style.fontFamily = `"${family}", ${fallback}`;
        select.style.fontFamily = `"${family}", ${fallback}`;
        preview.dataset.fontPreviewState = 'ready';
        updateFontSizePreview();
      };

      select.addEventListener('change', updatePreview);
      updatePreview();
    });
    updateFontSizePreview();
    const studioTabs = [...(tabContainer || body).querySelectorAll('[data-studio-tab]')];
    studioTabs.forEach((button, index) => {
      button.addEventListener('click', () => {
        if (this.activeTab === 'demographics' && this.studentDemographicValuesDirty
          && !window.confirm('Nilai akun belum disimpan. Tinggalkan perubahan tersebut?')) return;
        if (this.activeTab === 'demographics') {
          this.studentDemographicValuesDirty = false;
          this.studentDemographicSettings = this.collectStudentDemographicSettings(body);
        }
        const collected = this.tryCollectConfig(form, body);
        if (!collected) return;
        this.config = collected;
        this.activeTab = button.dataset.studioTab;
        this.render(body);
        document.getElementById(`studio-tab-${this.activeTab}`)?.focus();
      });
      button.addEventListener('keydown', (event) => {
        let nextIndex = index;
        if (event.key === 'ArrowRight') nextIndex = (index + 1) % studioTabs.length;
        else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + studioTabs.length) % studioTabs.length;
        else if (event.key === 'Home') nextIndex = 0;
        else if (event.key === 'End') nextIndex = studioTabs.length - 1;
        else return;

        event.preventDefault();
        studioTabs[nextIndex].focus();
        studioTabs[nextIndex].click();
      });
    });
    form.querySelector('[data-save-security-notice]')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      const feedback = form.querySelector('[data-security-notice-feedback]');
      button.disabled = true;
      const result = await this.api.updateSecurityNotice(
        form.querySelector('[data-security-notice-status]').value,
        form.querySelector('[data-security-notice-message]').value
      );
      button.disabled = false;
      if (!result.ok) {
        feedback.textContent = result.error;
        return;
      }
      this.securityNotice = result.data.notice;
      this.securityNoticeError = '';
      window.dispatchEvent(new CustomEvent('security-notice-updated'));
      feedback.textContent = result.data.notice.status === 'normal'
        ? 'PENGUMUMAN DARURAT DINONAKTIFKAN.'
        : 'PENGUMUMAN DIPUBLIKASIKAN UNTUK SELURUH PENGUNJUNG.';
    });
    form.querySelectorAll('input[type="color"][name^="color."]').forEach((input) => input.addEventListener('input', () => {
      input.nextElementSibling.textContent = input.value;
      const [, palette, key] = input.name.split('.');
      const sample = form.querySelector(`[data-palette-preview="${palette}"] .studio-palette-sample`);
      const sampleProperty = {
        background: 'background',
        panel: 'panel',
        accent: 'accent',
        text: 'text',
        border: 'border'
      }[key];
      if (sampleProperty) sample.style.setProperty(`--sample-${sampleProperty}`, input.value);
      this.updateContrast(form);
    }));
    form.elements['identity.logo'].addEventListener('change', () => {
      const preview = body.querySelector('[data-logo-preview]');
      const emptyPreview = body.querySelector('[data-logo-preview-empty]');
      const logo = form.elements['identity.logo'].value;
      if (logo && preview) preview.src = logo;
      else if (logo && emptyPreview) {
        const image = document.createElement('img');
        image.src = logo;
        image.alt = 'Pratinjau logo organisasi';
        image.dataset.logoPreview = '';
        emptyPreview.replaceWith(image);
      } else if (!logo && preview) {
        const empty = document.createElement('span');
        empty.textContent = 'Belum ada logo';
        empty.dataset.logoPreviewEmpty = '';
        preview.replaceWith(empty);
      }
    });
    form.elements.typeScale.addEventListener('input', () => {
      form.querySelector('[data-scale-output]').textContent = `${form.elements.typeScale.value}px`;
      updateFontSizePreview();
    });
    const bindDustControls = (key, inputName) => {
      const range = form.querySelector(`[data-dust-range="${key}"]`);
      const number = form.elements[inputName];
      const output = form.querySelector(`[data-dust-output="${key}"]`);
      const update = (fromRange) => {
        if (fromRange) number.value = range.value;
        else if (number.value !== '' && number.checkValidity()) range.value = number.value;
        output.textContent = number.value === '' ? '—' : `${number.value}%`;
      };
      range.addEventListener('input', () => update(true));
      number.addEventListener('input', () => update(false));
    };
    bindDustControls('density', 'dustDensity');
    bindDustControls('opacity', 'dustOpacity');
    form.querySelectorAll('.studio-font-picker').forEach((select) => {
      select.addEventListener('change', updateFontSizePreview);
    });
    bindCampusMapPanel(this, form, body);
    bindUniversityOrganizationPanel(this, form, body);
    form.querySelectorAll('[data-move-site-map-node]').forEach((button) => button.addEventListener('click', () => {
      const collected = this.tryCollectConfig(form, body);
      if (!collected) return;
      collected.content.siteMapNodes = moveSiteMapNode(
        collected.content.siteMapNodes,
        button.dataset.moveSiteMapNode,
        button.dataset.direction
      );
      this.config = collected;
      this.activeTab = 'pages';
      this.render(body);
    }));
    body.querySelector('[data-site-map-group-add]')?.addEventListener('click', () => {
      const collected = this.tryCollectConfig(form, body);
      if (!collected) return;
      const groupCount = collected.content.siteMapNodes.filter(({ type }) => type === 'group').length;
      if (groupCount >= 50) return this.feedback(body, 'BATAS 50 KELOMPOK PETA SITUS TERCAPAI.');
      collected.content.siteMapNodes.push(createSiteMapGroupDraft());
      this.config = collected;
      this.activeTab = 'pages';
      this.render(body);
      body.querySelector(`[name="siteMapNode.${collected.content.siteMapNodes[collected.content.siteMapNodes.length - 1].id}.title"]`)?.focus();
    });
    body.querySelectorAll('[data-site-map-group-delete]').forEach((button) => button.addEventListener('click', () => {
      const collected = this.tryCollectConfig(form, body);
      if (!collected) return;
      collected.content.siteMapNodes = removeSiteMapGroup(collected.content.siteMapNodes, button.dataset.siteMapGroupDelete);
      this.config = collected;
      this.activeTab = 'pages';
      this.render(body);
      this.feedback(body, 'KELOMPOK DIHAPUS; HALAMAN ANAK DIPINDAHKAN KE AKAR HMIF UMB.');
    }));
    form.querySelectorAll('[data-move-sidebar-item]').forEach((button) => button.addEventListener('click', () => {
      const collected = this.tryCollectConfig(form, body);
      if (!collected) return;
      this.config = collected;
      const current = this.config.content.sidebarOrder.findIndex((id) => id === button.dataset.moveSidebarItem);
      const next = button.dataset.direction === 'up' ? current - 1 : current + 1;
      if (current < 0 || next < 0 || next >= this.config.content.sidebarOrder.length) return;
      [this.config.content.sidebarOrder[current], this.config.content.sidebarOrder[next]] = [
        this.config.content.sidebarOrder[next],
        this.config.content.sidebarOrder[current]
      ];
      const pagesById = new Map(this.config.pages.map((page) => [page.id, page]));
      this.config.pages = this.config.content.sidebarOrder
        .filter((id) => pagesById.has(id))
        .map((id) => pagesById.get(id));
      const customPagesByNavId = new Map(this.config.content.customPages.map((page) => [`custom-${page.id}`, page]));
      this.config.content.customPages = this.config.content.sidebarOrder
        .filter((id) => customPagesByNavId.has(id))
        .map((id) => customPagesByNavId.get(id));
      this.render(body);
    }));
    body.querySelector('[data-custom-page-add]')?.addEventListener('click', () => {
      const collected = this.tryCollectConfig(form, body);
      if (!collected) return;
      const pages = collected.content.customPages;
      if (pages.length >= 20) return this.feedback(body, 'BATAS 20 HALAMAN KUSTOM TERCAPAI.');
      const usedSlugs = new Set(pages.map(({ slug }) => slug));
      let suffix = pages.length + 1;
      let slug = `halaman-baru-${suffix}`;
      while (usedSlugs.has(slug)) slug = `halaman-baru-${++suffix}`;
      const id = crypto.randomUUID();
      pages.push({
        id,
        slug,
        title: 'Halaman Baru',
        description: '',
        layout: 'default',
        visible: true,
        blocks: [{ type: 'text', title: 'Modul Teks', body: 'Tulis informasi yang ingin ditampilkan.' }]
      });
      collected.content.sidebarOrder.push(`custom-${id}`);
      collected.content.siteMapNodes.push({ id: `custom-${id}`, type: 'page', parentId: '' });
      this.config = collected;
      this.activeTab = 'pages';
      this.render(body);
      body.querySelector(`[name="customPage.${pages.length - 1}.title"]`)?.focus();
    });
    body.querySelectorAll('[data-custom-page-delete]').forEach((button) => button.addEventListener('click', () => {
      const collected = this.tryCollectConfig(form, body);
      if (!collected) return;
      const [removedPage] = collected.content.customPages.splice(Number(button.dataset.customPageDelete), 1);
      if (removedPage) {
        const removedId = `custom-${removedPage.id}`;
        collected.content.sidebarOrder = collected.content.sidebarOrder.filter((id) => id !== removedId);
        const removedNode = collected.content.siteMapNodes.find((node) => node.id === removedId);
        collected.content.siteMapNodes = collected.content.siteMapNodes
          .filter((node) => node.id !== removedId)
          .map((node) => node.parentId === removedId
            ? { ...node, parentId: removedNode?.parentId || '' }
            : node);
      }
      this.config = collected;
      this.activeTab = 'pages';
      this.render(body);
      this.feedback(body, 'HALAMAN DIHAPUS DARI DRAFT LOKAL.');
    }));
    body.querySelectorAll('[data-custom-block-add]').forEach((button) => button.addEventListener('click', () => {
      const collected = this.tryCollectConfig(form, body);
      if (!collected) return;
      const page = collected.content.customPages[Number(button.dataset.customBlockAdd)];
      if (!page || page.blocks.length >= 12) return;
      page.blocks.push({ type: 'text', title: 'Modul Baru', body: 'Tulis isi modul.' });
      this.config = collected;
      this.activeTab = 'pages';
      this.render(body);
    }));
    body.querySelectorAll('[data-custom-block-delete]').forEach((button) => button.addEventListener('click', () => {
      const collected = this.tryCollectConfig(form, body);
      if (!collected) return;
      const [pageIndex, blockIndex] = button.dataset.customBlockDelete.split('.').map(Number);
      const page = collected.content.customPages[pageIndex];
      if (!page || page.blocks.length <= 1) return;
      page.blocks.splice(blockIndex, 1);
      this.config = collected;
      this.activeTab = 'pages';
      this.render(body);
      this.feedback(body, 'MODUL DIHAPUS DARI DRAFT LOKAL.');
    }));
    body.querySelectorAll('[data-custom-block-type]').forEach((select) => select.addEventListener('change', () => {
      const collected = this.tryCollectConfig(form, body);
      if (!collected) return;
      this.config = collected;
      this.activeTab = 'pages';
      this.render(body);
    }));
    body.querySelector('[data-upload-asset]').addEventListener('click', (event) => this.uploadAsset(event, body));
    body.querySelector('[data-soundtrack-add-link]')?.addEventListener('click', async () => {
      const editor = body.querySelector('[data-soundtrack-link-editor]');
      const title = editor.querySelector('[name="title"]').value.trim();
      const url = editor.querySelector('[name="url"]').value.trim();
      const result = await this.api.addSoundtrackLink(title, url);
      if (!result.ok) return this.feedback(body, result.error);
      this.soundtracks.push(result.data.track);
      this.soundtracks.sort((first, second) => first.sort_order - second.sort_order);
      this.config = this.tryCollectConfig(form, body) || this.config;
      this.render(body);
      this.feedback(body, 'TAUTAN SOUNDTRACK DITAMBAHKAN KE KATALOG.');
    });
    body.querySelector('[data-soundtrack-upload]')?.addEventListener('click', async () => {
      const editor = body.querySelector('[data-soundtrack-upload-editor]');
      const file = editor.querySelector('[name="audio"]').files?.[0];
      const title = editor.querySelector('[name="title"]').value.trim();
      if (!title || !file) return this.feedback(body, 'ISI JUDUL DAN PILIH BERKAS AUDIO.');
      if (file.size > 20 * 1024 * 1024) return this.feedback(body, 'AUDIO MELEBIHI BATAS 20 MB.');
      const result = await this.api.uploadSoundtrack(title, file);
      if (!result.ok) return this.feedback(body, result.error);
      this.soundtracks.push(result.data.track);
      this.soundtracks.sort((first, second) => first.sort_order - second.sort_order);
      this.config = this.tryCollectConfig(form, body) || this.config;
      this.render(body);
      this.feedback(body, 'BERKAS AUDIO TERVERIFIKASI DAN DITAMBAHKAN KE KATALOG.');
    });
    body.querySelectorAll('[data-soundtrack-toggle]').forEach((button) => button.addEventListener('click', async () => {
      const track = this.soundtracks.find(({ id }) => id === button.dataset.soundtrackToggle);
      if (!track) return;
      const result = await this.api.updateSoundtrack(track.id, { active: !track.active });
      if (!result.ok) return this.feedback(body, result.error);
      Object.assign(track, result.data.track);
      this.config = this.tryCollectConfig(form, body) || this.config;
      this.render(body);
      this.feedback(body, `STATUS TRACK ${track.title} DIPERBARUI.`);
    }));
    body.querySelectorAll('[data-soundtrack-move]').forEach((button) => button.addEventListener('click', async () => {
      const index = this.soundtracks.findIndex(({ id }) => id === button.dataset.soundtrackId);
      const neighborIndex = index + (button.dataset.soundtrackMove === 'up' ? -1 : 1);
      if (index < 0 || neighborIndex < 0 || neighborIndex >= this.soundtracks.length) return;
      const reordered = [...this.soundtracks];
      [reordered[index], reordered[neighborIndex]] = [reordered[neighborIndex], reordered[index]];
      const result = await this.api.reorderSoundtracks(reordered.map(({ id }) => id));
      if (!result.ok) return this.feedback(body, result.error);
      this.soundtracks = result.data.tracks;
      this.config = this.tryCollectConfig(form, body) || this.config;
      this.render(body);
      this.feedback(body, 'URUTAN PLAYLIST DIPERBARUI.');
    }));
    body.querySelectorAll('[data-soundtrack-delete]').forEach((button) => button.addEventListener('click', async () => {
      const result = await this.api.deleteSoundtrack(button.dataset.soundtrackDelete);
      if (!result.ok) return this.feedback(body, result.error);
      this.soundtracks = this.soundtracks.filter(({ id }) => id !== button.dataset.soundtrackDelete);
      this.config = this.tryCollectConfig(form, body) || this.config;
      this.render(body);
      this.feedback(body, 'TRACK DAN BERKAS TERKAIT DIHAPUS.');
    }));
    body.querySelectorAll('[data-portal-create]').forEach((button) => button.addEventListener('click', async () => {
      const kind = button.dataset.portalCreate;
      const config = this.tryCollectConfig(form, body);
      if (!config) return;
      this.config = config;
      const editor = body.querySelector(`[data-portal-editor="${kind}"]`);
      const values = Object.fromEntries([...editor.querySelectorAll('input, select, textarea')]
        .map((input) => [input.name, input.type === 'checkbox' ? input.checked : input.value]));
      const payload = kind === 'project'
        ? { ...values, tags: String(values.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean) }
        : kind === 'alumni'
          ? {
            ...values,
            mentorship_available: editor.querySelector('[name="mentorship_available"]').checked,
            speaker_available: editor.querySelector('[name="speaker_available"]').checked,
            referral_available: editor.querySelector('[name="referral_available"]').checked
          }
          : kind === 'job'
            ? { ...values, specializations: [...editor.querySelectorAll('[name="specializations"]:checked')].map((input) => input.value) }
            : values;
      const result = await this.api.createPortalRecord(kind, payload);
      if (!result.ok) return this.feedback(body, result.error);
      this.portalRecords[kind].unshift(result.data.record);
      this.render(body);
      this.feedback(body, 'PENGAJUAN DITAMBAHKAN KE ANTREAN REVIEW.');
    }));
    body.querySelectorAll('[data-portal-review]').forEach((button) => button.addEventListener('click', async () => {
      const kind = button.dataset.portalKind;
      const record = this.portalRecords[kind]?.find(({ id }) => id === button.dataset.portalRecord);
      if (!record) return;
      const config = this.tryCollectConfig(form, body);
      if (!config) return;
      this.config = config;
      const note = body.querySelector(`[data-portal-review-note="${record.id}"]`)?.value.trim() || '';
      const result = await this.api.reviewPortalRecord(kind, record.id, button.dataset.portalReview, note);
      if (!result.ok) return this.feedback(body, result.error);
      const refreshed = await this.api.getAdminPortalRecords(kind);
      if (!refreshed.ok) return this.feedback(body, refreshed.error);
      this.portalRecords[kind] = refreshed.data.records;
      this.render(body);
      this.feedback(body, `STATUS REVIEW DIPERBARUI: ${result.data.record.review_status.toUpperCase()}.`);
    }));
    body.querySelectorAll('[data-portal-record-delete]').forEach((button) => button.addEventListener('click', async () => {
      const kind = button.dataset.portalKind;
      const config = this.tryCollectConfig(form, body);
      if (!config) return;
      this.config = config;
      const result = await this.api.deletePortalRecord(kind, button.dataset.portalRecordDelete);
      if (!result.ok) return this.feedback(body, result.error);
      this.portalRecords[kind] = this.portalRecords[kind].filter(({ id }) => id !== button.dataset.portalRecordDelete);
      this.render(body);
      this.feedback(body, 'KONTEN DIHAPUS.');
    }));
    body.querySelectorAll('[data-inline-image-upload]').forEach((input) => input.addEventListener('change', (event) => this.uploadInlineImage(event, body)));
    body.querySelectorAll('[data-image-preview-select]').forEach((select) => select.addEventListener('change', () => {
      const preview = body.querySelector(`[data-image-preview="${select.dataset.imagePreviewSelect}"]`);
      if (preview) preview.src = select.value || '/assets/silhouette_male.jpg';
    }));
    body.querySelectorAll('[data-use-logo]').forEach((button) => button.addEventListener('click', () => {
      form.elements['identity.logo'].value = uploadedAssetFileUrl(button.dataset.useLogo);
      this.activeTab = 'theme';
      this.config = this.tryCollectConfig(form, body);
      if (this.config) this.render(body);
    }));
    body.querySelectorAll('[data-use-background]').forEach((button) => button.addEventListener('click', () => {
      form.elements.backgroundMode.value = 'image';
      form.elements.backgroundImage.value = uploadedAssetFileUrl(button.dataset.useBackground);
      this.activeTab = 'theme';
      this.config = this.tryCollectConfig(form, body);
      if (this.config) this.render(body);
    }));
    body.querySelectorAll('[data-use-hero]').forEach((button) => button.addEventListener('click', () => {
      form.elements.heroImage.value = uploadedAssetFileUrl(button.dataset.useHero);
      this.activeTab = 'theme';
      this.config = this.tryCollectConfig(form, body);
      if (this.config) this.render(body);
    }));
    body.querySelectorAll('[data-delete-asset]').forEach((button) => button.addEventListener('click', () => this.deleteAsset(button.dataset.deleteAsset, body)));
    body.querySelectorAll('[data-restore-revision]').forEach((button) => button.addEventListener('click', () => this.restoreRevision(button.dataset.restoreRevision, body)));
    body.querySelectorAll('[data-knowledge-edit]').forEach((button) => button.addEventListener('click', () => {
      const collected = this.tryCollectConfig(form, body);
      if (!collected) return;
      this.config = collected;
      this.editingKnowledgeResourceId = button.dataset.knowledgeEdit;
      this.render(body);
    }));
    body.querySelectorAll('[data-knowledge-delete]').forEach((button) => button.addEventListener('click', () => {
      const collected = this.tryCollectConfig(form, body);
      if (!collected) return;
      this.config = collected;
      this.config.content.data.knowledgeResources = this.config.content.data.knowledgeResources.filter(({ id }) => id !== button.dataset.knowledgeDelete);
      this.editingKnowledgeResourceId = null;
      this.render(body);
      this.feedback(body, 'REFERENSI DIHAPUS DARI DRAFT. SIMPAN ATAU PUBLIKASIKAN UNTUK MENERAPKAN PERUBAHAN.');
    }));
    body.querySelectorAll('[data-knowledge-published]').forEach((input) => input.addEventListener('change', () => {
      const collected = this.tryCollectConfig(form, body);
      if (!collected) return;
      this.config = collected;
      const resource = this.config.content.data.knowledgeResources.find(({ id }) => id === input.dataset.knowledgePublished);
      if (!resource) return;
      resource.published = input.checked;
      this.render(body);
      this.feedback(body, 'STATUS PUBLIKASI DIPERBARUI DI DRAFT. SIMPAN ATAU PUBLIKASIKAN UNTUK MENERAPKAN PERUBAHAN.');
    }));
    body.querySelector('[data-upload-knowledge-file]')?.addEventListener('click', async () => {
      const input = body.querySelector('[data-knowledge-file-input]');
      const file = input.files?.[0];
      if (!file) return this.feedback(body, 'PILIH DOKUMEN PDF TERLEBIH DAHULU.');
      if (file.size > 20 * 1024 * 1024) return this.feedback(body, 'DOKUMEN MELEBIHI BATAS 20 MB.');
      if (file.type !== 'application/pdf') return this.feedback(body, 'HANYA DOKUMEN PDF YANG DIDUKUNG.');
      const result = await this.api.uploadKnowledgeFile(file);
      if (!result.ok) return this.feedback(body, result.error);
      const uploadedFile = result.data.file;
      this.knowledgeFiles.unshift(uploadedFile);
      const option = new Option(`${uploadedFile.original_name} // ${(uploadedFile.size / 1024).toFixed(1)} KB`, uploadedFile.id, true, true);
      body.querySelector('[name="fileId"]').add(option);
      input.value = '';
      this.feedback(body, `PDF ${uploadedFile.original_name} DIUNGGAH. LENGKAPI RESOURCE DAN SIMPAN SEBAGAI DRAFT.`);
    });
    body.querySelectorAll('[data-knowledge-file-delete]').forEach((button) => button.addEventListener('click', async () => {
      const result = await this.api.deleteKnowledgeFile(button.dataset.knowledgeFileDelete);
      if (!result.ok) return this.feedback(body, result.error);
      this.knowledgeFiles = this.knowledgeFiles.filter(({ id }) => id !== button.dataset.knowledgeFileDelete);
      body.querySelector(`[name="fileId"] option[value="${button.dataset.knowledgeFileDelete}"]`)?.remove();
      button.closest('[data-knowledge-file-row]')?.remove();
      this.feedback(body, 'DOKUMEN AKADEMIK DIHAPUS.');
    }));
    body.querySelector('[data-knowledge-save]')?.addEventListener('click', () => {
      const collected = this.tryCollectConfig(form, body);
      if (!collected) return;
      this.config = collected;
      const editor = body.querySelector('[data-knowledge-editor]');
      const value = (name) => editor.querySelector(`[name="${name}"]`).value.trim();
      const resource = {
        id: value('id'),
        title: value('title'),
        course: value('course'),
        semester: value('semester') || 'Semua',
        lecturer: value('lecturer'),
        academicYear: value('academicYear'),
        examType: value('examType'),
        kind: value('kind'),
        summary: value('summary'),
        url: value('url'),
        fileId: value('fileId'),
        tags: value('tags').split(',').map((tag) => tag.trim()).filter(Boolean),
        published: editor.querySelector('[name="published"]').checked
      };
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(resource.id)) return this.feedback(body, 'ID HARUS BERISI 1-64 HURUF, ANGKA, GARIS, ATAU GARIS BAWAH.');
      if (!resource.title) return this.feedback(body, 'JUDUL REFERENSI WAJIB DIISI.');
      if (Boolean(resource.url) === Boolean(resource.fileId)) return this.feedback(body, 'PILIH TEPAT SATU SUMBER: TAUTAN HTTPS ATAU PDF TERUNGGAH.');
      try {
        if (resource.url && new URL(resource.url).protocol !== 'https:') throw new Error();
      } catch {
        return this.feedback(body, 'URL REFERENSI HARUS MENGGUNAKAN HTTPS YANG VALID.');
      }
      const resources = this.config.content.data.knowledgeResources;
      const existingIndex = resources.findIndex(({ id }) => id === this.editingKnowledgeResourceId);
      if (resources.some(({ id }, index) => id === resource.id && index !== existingIndex)) return this.feedback(body, 'ID REFERENSI SUDAH DIGUNAKAN.');
      if (existingIndex >= 0) resources[existingIndex] = resource;
      else resources.push(resource);
      this.editingKnowledgeResourceId = null;
      this.render(body);
      this.feedback(body, 'REFERENSI DIPERBARUI DI DRAFT. SIMPAN ATAU PUBLIKASIKAN UNTUK MENERAPKAN PERUBAHAN.');
    });
    body.querySelector('[data-knowledge-cancel]')?.addEventListener('click', () => {
      const collected = this.tryCollectConfig(form, body);
      if (!collected) return;
      this.config = collected;
      this.editingKnowledgeResourceId = null;
      this.render(body);
    });

    this.bindDepartmentEvents(form, body);
    this.bindOrganizationEvents(form, body);
    const accountCheckboxes = [...body.querySelectorAll('[data-access-account]')];
    const updateAccountSelectionCount = () => {
      const selectedCount = accountCheckboxes.filter((input) => input.checked).length;
      const count = body.querySelector('[data-access-selection-count]');
      if (count) count.textContent = `${selectedCount} akun dipilih`;
    };
    accountCheckboxes.forEach((input) => input.addEventListener('change', updateAccountSelectionCount));
    body.querySelector('[data-access-select-all]')?.addEventListener('click', () => {
      accountCheckboxes.forEach((input) => { input.checked = true; });
      updateAccountSelectionCount();
    });
    body.querySelector('[data-access-clear-selection]')?.addEventListener('click', () => {
      accountCheckboxes.forEach((input) => { input.checked = false; });
      updateAccountSelectionCount();
    });
    body.querySelector('[data-access-bulk-save]')?.addEventListener('click', async (event) => {
      const selectedAccountIds = accountCheckboxes.filter((input) => input.checked).map((input) => input.dataset.accessAccount);
      if (!selectedAccountIds.length) return this.feedback(body, 'PILIH SETIDAKNYA SATU AKUN ANGGOTA.');
      if (selectedAccountIds.length > 500) return this.feedback(body, 'BATAS PERUBAHAN ADALAH 500 AKUN SEKALIGUS.');

      const clearanceValue = form.elements.accessClearance.value;
      const clearanceLevel = clearanceValue ? Number(clearanceValue) : undefined;
      const capabilities = [...body.querySelectorAll('[data-access-capability]:checked')]
        .map((input) => input.dataset.accessCapability);
      if (clearanceLevel === undefined && !capabilities.length) {
        return this.feedback(body, 'PILIH PERUBAHAN CLEARANCE ATAU MINIMAL SATU CAPABILITY.');
      }

      const collected = this.tryCollectConfig(form, body);
      if (!collected) return;
      this.config = collected;
      const capabilityAction = form.elements.accessCapabilityAction.value;
      const changes = [
        ...(clearanceLevel === undefined ? [] : [`clearance menjadi level ${clearanceLevel}`]),
        ...(capabilities.length ? [`${capabilityAction === 'grant' ? 'memberikan' : 'mencabut'} ${capabilities.length} capability`] : [])
      ].join(' dan ');
      if (!window.confirm(`Terapkan ${changes} kepada ${selectedAccountIds.length} akun terpilih?`)) return;

      const button = event.currentTarget;
      const feedback = body.querySelector('[data-access-feedback]');
      button.disabled = true;
      if (feedback) feedback.textContent = 'Menyimpan perubahan akses...';
      const result = await this.api.updateAccountAccessBulk({
        accountIds: selectedAccountIds,
        clearanceLevel,
        capabilities,
        capabilityAction
      });
      if (!result.ok) {
        if (feedback) feedback.textContent = result.error;
        button.disabled = false;
        return;
      }

      const usersResult = await this.api.getAllUsers();
      if (usersResult?.ok && Array.isArray(usersResult.data?.users)) {
        this.users = usersResult.data.users;
        this.usersError = '';
        this.accessFeedback = `${result.data.updated_count} akun diperbarui. Menu pengguna perlu dimuat ulang untuk menyegarkan tampilan.`;
      } else {
        this.usersError = usersResult?.error || 'Daftar akun tidak dapat dimuat ulang.';
        this.accessFeedback = `Perubahan berhasil diterapkan ke ${result.data.updated_count} akun, tetapi daftar akun gagal dimuat ulang: ${this.usersError}`;
      }
      this.activeTab = 'access';
      this.render(body);
    });
    body.querySelector('[data-demographic-field-add]')?.addEventListener('click', () => {
      if (this.studentDemographicSettingsError) return this.feedback(body, this.studentDemographicSettingsError);
      if (this.studentDemographicValuesDirty
        && !window.confirm('Nilai akun belum disimpan. Tinggalkan perubahan tersebut?')) return;
      this.studentDemographicValuesDirty = false;
      this.studentDemographicSettings = this.collectStudentDemographicSettings(body);
      if (this.studentDemographicSettings.customColumns.length >= 30) return this.feedback(body, 'BATAS 30 KOLOM KUSTOM TERCAPAI.');
      this.studentDemographicSettings.customColumns.push({
        id: `field-${crypto.randomUUID().replaceAll('-', '')}`,
        label: 'Kolom baru',
        type: 'text',
        options: [],
        visible: true
      });
      this.studentDemographicSettingsDirty = true;
      this.activeTab = 'demographics';
      this.render(body);
    });
    body.querySelectorAll('[data-demographic-field-type]').forEach((select) => select.addEventListener('change', () => {
      this.studentDemographicSettingsDirty = true;
      const fieldId = select.closest('[data-demographic-field]')?.dataset.demographicField;
      const options = fieldId && body.querySelector(`[data-demographic-options-for="${CSS.escape(fieldId)}"]`);
      if (options) options.hidden = !['single_select', 'multi_select'].includes(select.value);
      this.disableDemographicValueSave(body);
    }));
    body.querySelectorAll('[data-custom-field-value]').forEach((input) => {
      input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', () => {
        this.studentDemographicValuesDirty = true;
      });
    });
    body.querySelectorAll('[data-demographic-standard-column], [data-demographic-field-label], [data-demographic-field-options], [data-demographic-field-visible]')
      .forEach((input) => input.addEventListener(input.type === 'checkbox' ? 'change' : 'input', () => {
        this.studentDemographicSettingsDirty = true;
        this.disableDemographicValueSave(body);
      }));
    body.querySelectorAll('[data-demographic-field-remove]').forEach((button) => button.addEventListener('click', () => {
      const settings = this.collectStudentDemographicSettings(body);
      const field = settings.customColumns.find(({ id }) => id === button.dataset.demographicFieldRemove);
      if (!field) return;
      if (this.studentDemographicValuesDirty
        && !window.confirm('Nilai akun belum disimpan. Tinggalkan perubahan tersebut?')) return;
      this.studentDemographicValuesDirty = false;
      const hasValues = Object.values(this.studentDemographicValues)
        .some((accountValues) => accountValues[field.id] !== undefined);
      const warning = hasValues
        ? `Hapus kolom "${field.label}" dan seluruh nilainya dari akun? Tindakan ini berlaku setelah pengaturan disimpan.`
        : `Hapus kolom "${field.label}"?`;
      if (!window.confirm(warning)) return;
      settings.customColumns = settings.customColumns.filter(({ id }) => id !== field.id);
      this.studentDemographicSettings = settings;
      this.studentDemographicSettingsDirty = true;
      this.activeTab = 'demographics';
      this.render(body);
    }));
    body.querySelector('[data-demographic-settings-save]')?.addEventListener('click', async () => {
      if (this.studentDemographicSettingsError) return this.feedback(body, this.studentDemographicSettingsError);
      if (this.studentDemographicValuesDirty
        && !window.confirm('Nilai akun belum disimpan dan akan dibuang. Lanjutkan?')) return;
      this.studentDemographicValuesDirty = false;
      const settings = this.collectStudentDemographicSettings(body);
      const result = await this.api.updateStudentDemographicSettings(settings);
      const feedback = body.querySelector('[data-demographic-settings-feedback]');
      if (!result.ok) {
        this.studentDemographicSettingsFeedback = result.error;
        if (feedback) feedback.textContent = result.error;
        return;
      }
      const fieldIds = new Set(settings.customColumns.map(({ id }) => id));
      Object.keys(this.studentDemographicValues).forEach((accountId) => {
        Object.keys(this.studentDemographicValues[accountId]).forEach((fieldId) => {
          if (!fieldIds.has(fieldId)) delete this.studentDemographicValues[accountId][fieldId];
        });
      });
      this.studentDemographicSettings = result.data.settings;
      this.studentDemographicSettingsError = '';
      this.studentDemographicSettingsDirty = false;
      this.studentDemographicSettingsFeedback = 'Pengaturan kolom tersimpan. Perubahan terlihat pada tabel setelah pemuatan ulang.';
      this.activeTab = 'demographics';
      this.render(body);
    });
    body.querySelector('[data-demographic-account-select]')?.addEventListener('change', () => {
      if (this.studentDemographicValuesDirty
        && !window.confirm('Nilai akun belum disimpan. Tinggalkan perubahan tersebut?')) {
        body.querySelector('[data-demographic-account-select]').value = this.selectedDemographicAccountId;
        return;
      }
      this.studentDemographicValuesDirty = false;
      const collected = this.tryCollectConfig(form, body);
      if (!collected) return;
      this.config = collected;
      this.studentDemographicSettings = this.collectStudentDemographicSettings(body);
      this.selectedDemographicAccountId = body.querySelector('[data-demographic-account-select]').value;
      this.activeTab = 'demographics';
      this.render(body);
    });
    body.querySelector('[data-demographic-values-save]')?.addEventListener('click', async () => {
      if (this.studentDemographicValuesError) return this.feedback(body, this.studentDemographicValuesError);
      const accountId = body.querySelector('[data-demographic-account-select]')?.value;
      if (!accountId) return this.feedback(body, 'PILIH AKUN ANGGOTA.');
      const values = collectCustomFieldValues(body);
      const result = await this.api.updateStudentDemographicCustomValues(accountId, values);
      const feedback = body.querySelector('[data-demographic-values-feedback]');
      if (!result.ok) {
        this.studentDemographicValuesFeedback = result.error;
        if (feedback) feedback.textContent = result.error;
        return;
      }
      this.studentDemographicValues[accountId] = result.data.values || {};
      this.studentDemographicValuesError = '';
      this.studentDemographicValuesDirty = false;
      this.studentDemographicValuesFeedback = 'Nilai kolom kustom berhasil disimpan.';
      if (feedback) feedback.textContent = this.studentDemographicValuesFeedback;
    });

    body.querySelector('[data-action="preview"]').addEventListener('click', async () => {
      const collected = this.tryCollectConfig(form, body);
      if (!collected) return;
      this.setActionsBusy(body, true);
      this.feedback(body, 'MEMVALIDASI DRAFT UNTUK PRATINJAU...');
      try {
        const validation = await this.api.validateSiteConfig(collected);
        if (!validation.ok) {
          this.feedback(body, validation.error);
          return;
        }
        this.config = validation.data.config;
        await this.applyConfig(this.config, { preview: true });
        this.previewing = true;
        this.showPreview();
        this.feedback(body, 'PRATINJAU AKTIF. GUNAKAN TOMBOL KEMBALI KE STUDIO PADA PITA DI ATAS PORTAL.');
      } catch (error) {
        this.feedback(body, `PRATINJAU GAGAL DIBUKA: ${error.message || 'Terjadi kesalahan.'}`);
      } finally {
        this.setActionsBusy(body, false);
        this.updateActionState(body);
      }
    });
    body.querySelector('[data-action="cancel-preview"]').addEventListener('click', async () => {
      this.setActionsBusy(body, true);
      try {
        if (await this.cancelPreview(body)) {
          this.feedback(body, 'PRATINJAU DITUTUP. VERSI TERBIT DIPULIHKAN.');
        }
      } finally {
        this.setActionsBusy(body, false);
      }
    });
    body.querySelector('[data-action="save"]').addEventListener('click', async () => {
      this.setActionsBusy(body, true);
      try {
        await this.saveDraft(form, body);
      } finally {
        this.setActionsBusy(body, false);
      }
    });
    body.querySelector('[data-action="publish"]').addEventListener('click', async () => {
      this.setActionsBusy(body, true);
      try {
        const saved = await this.saveDraft(form, body);
        if (saved) await this.publish(body);
      } finally {
        this.setActionsBusy(body, false);
      }
    });
    body.querySelector('[data-action="reset"]').addEventListener('click', async () => {
      if (!window.confirm('Kembalikan seluruh konfigurasi ke default? Perubahan draft yang belum disimpan akan diganti.')) return;
      this.setActionsBusy(body, true);
      try {
        if (this.previewing && !await this.cancelPreview(body)) return;
        this.config = withSiteDefaults({});
        this.render(body);
        this.feedback(body, 'KONFIGURASI DEFAULT DIMUAT KE DRAFT. SIMPAN DRAFT UNTUK MENERAPKAN PERUBAHAN.');
      } finally {
        this.setActionsBusy(body, false);
      }
    });
    body.querySelector('[data-action="close"]').addEventListener('click', async () => {
      this.setActionsBusy(body, true);
      try {
        if (!await this.cancelPreview(body)) return;
        this.closeModal();
      } finally {
        this.setActionsBusy(body, false);
      }
    });
    this.updateContrast(form);
    this.updateActionState(body);
  }

  renderCustomPagesPanel() {
    const pages = this.config.content.customPages || [];
    return `
      <section class="studio-custom-pages" aria-labelledby="studio-custom-pages-title">
        <div class="studio-custom-pages-heading">
          <div>
            <h3 id="studio-custom-pages-title">HALAMAN KUSTOM // MODUL TERKURASI</h3>
            <p class="studio-help">Susun halaman dari modul teks dan callout yang tervalidasi. HTML, JavaScript, dan SQL bebas tidak dijalankan.</p>
          </div>
          <button class="btn-tactical primary" type="button" data-custom-page-add ${pages.length >= 20 ? 'disabled' : ''}>BUAT HALAMAN</button>
        </div>
        ${pages.map((page, pageIndex) => `
          <article class="studio-custom-page-card" data-custom-page-card>
            <header class="studio-custom-page-header">
              <strong>HALAMAN ${String(pageIndex + 1).padStart(2, '0')}</strong>
              <button class="btn-tactical danger" type="button" data-custom-page-delete="${pageIndex}">HAPUS HALAMAN</button>
            </header>
            <div class="admin-form-grid studio-custom-page-fields">
              <label class="form-group"><span class="form-label">JUDUL HALAMAN</span><input class="form-input" name="customPage.${pageIndex}.title" maxlength="80" value="${escapeHtml(page.title)}" required /></label>
              <label class="form-group"><span class="form-label">SLUG URL</span><input class="form-input" name="customPage.${pageIndex}.slug" maxlength="48" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value="${escapeHtml(page.slug)}" required /></label>
              <label class="form-group"><span class="form-label">DESKRIPSI</span><input class="form-input" name="customPage.${pageIndex}.description" maxlength="500" value="${escapeHtml(page.description)}" /></label>
              <label class="form-group"><span class="form-label">TATA LETAK</span><select class="form-select" name="customPage.${pageIndex}.layout">
                <option value="default" ${page.layout === 'default' ? 'selected' : ''}>Normal</option>
                <option value="wide" ${page.layout === 'wide' ? 'selected' : ''}>Lebar</option>
                <option value="compact" ${page.layout === 'compact' ? 'selected' : ''}>Ringkas</option>
              </select></label>
            </div>
            <div class="studio-custom-page-blocks">
              ${page.blocks.map((block, blockIndex) => `
                <section class="studio-custom-page-block">
                  <header class="studio-custom-page-header">
                    <strong>MODUL ${String(blockIndex + 1).padStart(2, '0')}</strong>
                    <button class="btn-tactical" type="button" data-custom-block-delete="${pageIndex}.${blockIndex}" ${page.blocks.length <= 1 ? 'disabled' : ''}>HAPUS MODUL</button>
                  </header>
                  <div class="admin-form-grid studio-custom-page-fields">
                    <label class="form-group"><span class="form-label">JENIS MODUL</span><select class="form-select" name="customPage.${pageIndex}.block.${blockIndex}.type" data-custom-block-type>
                      <option value="text" ${block.type === 'text' ? 'selected' : ''}>TEKS</option>
                      <option value="notice" ${block.type === 'notice' ? 'selected' : ''}>CALLOUT</option>
                    </select></label>
                    <label class="form-group"><span class="form-label">JUDUL MODUL</span><input class="form-input" name="customPage.${pageIndex}.block.${blockIndex}.title" maxlength="100" value="${escapeHtml(block.title)}" required /></label>
                    ${block.type === 'notice' ? `<label class="form-group"><span class="form-label">TONE CALLOUT</span><select class="form-select" name="customPage.${pageIndex}.block.${blockIndex}.tone">
                      <option value="info" ${block.tone === 'info' ? 'selected' : ''}>INFORMASI</option>
                      <option value="success" ${block.tone === 'success' ? 'selected' : ''}>SUKSES</option>
                      <option value="warning" ${block.tone === 'warning' ? 'selected' : ''}>PERINGATAN</option>
                    </select></label>` : ''}
                  </div>
                  <label class="form-group"><span class="form-label">ISI MODUL // TEKS BIASA</span><textarea class="form-textarea" name="customPage.${pageIndex}.block.${blockIndex}.body" maxlength="4000" required>${escapeHtml(block.body)}</textarea></label>
                </section>
              `).join('')}
            </div>
            <button class="btn-tactical" type="button" data-custom-block-add="${pageIndex}" ${page.blocks.length >= 12 ? 'disabled' : ''}>TAMBAH MODUL</button>
          </article>
        `).join('') || '<p class="studio-empty-state">Belum ada halaman kustom. Buat halaman untuk mulai menyusun modul.</p>'}
      </section>
    `;
  }

  setActionsBusy(body, busy) {
    body.querySelector('.site-studio')?.toggleAttribute('aria-busy', busy);
    body.querySelectorAll('.studio-actions [data-action]').forEach((button) => {
      button.disabled = busy || (button.dataset.action === 'cancel-preview' && !this.previewing)
        || (button.dataset.action === 'preview' && this.previewing);
    });
  }

  updateActionState(body) {
    if (!body) return;
    const previewButton = body.querySelector('[data-action="preview"]');
    const cancelButton = body.querySelector('[data-action="cancel-preview"]');
    const stateLabel = body.querySelector('[data-studio-state-label]');
    if (previewButton) {
      previewButton.setAttribute('aria-pressed', String(this.previewing));
      previewButton.textContent = this.previewing ? 'PRATINJAU AKTIF' : 'PRATINJAU';
    }
    if (cancelButton) cancelButton.disabled = !this.previewing;
    if (stateLabel) stateLabel.textContent = this.previewing ? 'PRATINJAU AKTIF // BELUM TERBIT' : 'DRAFT SIAP DIEDIT';
    body.querySelector('.site-studio')?.classList.toggle('is-previewing', this.previewing);
  }

  collectStudentDemographicSettings(body) {
    const visibleColumns = [...body.querySelectorAll('[data-demographic-standard-column]:checked')]
      .map((input) => input.dataset.demographicStandardColumn);
    const customColumns = [...body.querySelectorAll('[data-demographic-field]')].map((card) => {
      const type = card.querySelector('[data-demographic-field-type]').value;
      return {
        id: card.dataset.demographicField,
        label: card.querySelector('[data-demographic-field-label]').value.trim(),
        type,
        options: ['single_select', 'multi_select'].includes(type)
          ? card.querySelector('[data-demographic-field-options]').value.split('\n').map((option) => option.trim()).filter(Boolean)
          : [],
        visible: card.querySelector('[data-demographic-field-visible]').checked
      };
    });
    return { visibleColumns, customColumns };
  }

  disableDemographicValueSave(body) {
    const button = body.querySelector('[data-demographic-values-save]');
    if (button) button.disabled = Boolean(
      this.studentDemographicSettingsError
      || this.studentDemographicValuesError
      || this.studentDemographicSettingsDirty
    );
    if (this.studentDemographicSettingsDirty) {
      const feedback = body.querySelector('[data-demographic-values-feedback]');
      if (feedback) feedback.textContent = 'Simpan konfigurasi kolom terlebih dahulu sebelum menyimpan nilai akun.';
    }
  }

  renderStudentDemographicsPanel() {
    const settings = this.studentDemographicSettings;
    const members = this.users.filter((user) => user.role !== 'superadmin');
    const selectedAccount = members.find(({ account_id }) => account_id === this.selectedDemographicAccountId);
    const selectedValues = this.studentDemographicValues[this.selectedDemographicAccountId] || {};
    return `
      <h3>KOLOM TABEL INFORMASI AKUN</h3>
      <p class="studio-help">Tabel memuat akun anggota nyata dan hanya terlihat bagi pemegang capability <code>student_demographics.view</code>. NIM/email dan nilai kustom yang diaktifkan akan terlihat oleh pemegang capability tersebut. Jangan memasukkan data pribadi sensitif yang tidak diperlukan.</p>
      ${this.studentDemographicSettingsError ? `<p class="auth-feedback" role="alert">${escapeHtml(this.studentDemographicSettingsError)}</p>` : ''}
      ${this.studentDemographicValuesError ? `<p class="auth-feedback" role="alert">${escapeHtml(this.studentDemographicValuesError)}</p>` : ''}
      <section class="studio-organization-section studio-demographics-config">
        <h4>KOLOM AKUN STANDAR</h4>
        <div class="studio-demographics-column-list">
          ${STUDENT_ACCOUNT_COLUMNS.map((column) => `
            <label class="studio-access-account">
              <input type="checkbox" data-demographic-standard-column="${escapeHtml(column.id)}" ${settings.visibleColumns.includes(column.id) ? 'checked' : ''} />
              <span><strong>${escapeHtml(column.label)}</strong><small>${escapeHtml(column.id)}</small></span>
            </label>`).join('')}
        </div>
      </section>
      <section class="studio-organization-section studio-demographics-config">
        <div class="studio-organization-heading"><h4>KOLOM KUSTOM (${settings.customColumns.length}/30)</h4>
          <button class="btn-tactical" type="button" data-demographic-field-add ${settings.customColumns.length >= 30 || this.studentDemographicSettingsError ? 'disabled' : ''}>TAMBAH KOLOM KUSTOM</button>
        </div>
        <p class="studio-help">Nilai kolom kustom dapat diedit superadmin di sini dan anggota melalui Profil &amp; keamanan. Pilihan data divalidasi oleh server; teks/rumus/kode tidak dieksekusi.</p>
        ${settings.customColumns.map((field) => `
          <article class="studio-demographic-field" data-demographic-field="${escapeHtml(field.id)}">
            <div class="admin-form-grid">
              <label class="form-group"><span class="form-label">LABEL KOLOM</span><input class="form-input" data-demographic-field-label maxlength="80" value="${escapeHtml(field.label)}" required /></label>
              <label class="form-group"><span class="form-label">TIPE DATA</span><select class="form-select" data-demographic-field-type>
                ${STUDENT_CUSTOM_FIELD_TYPES.map((type) => `<option value="${type.id}" ${field.type === type.id ? 'selected' : ''}>${escapeHtml(type.label)}</option>`).join('')}
              </select></label>
              <label class="studio-toggle"><input type="checkbox" data-demographic-field-visible ${field.visible ? 'checked' : ''} /> TAMPILKAN DI TABEL</label>
            </div>
            <label class="form-group studio-demographic-field-options" data-demographic-options-for="${escapeHtml(field.id)}" ${['single_select', 'multi_select'].includes(field.type) ? '' : 'hidden'}>
              <span class="form-label">OPSI PILIHAN (SATU PER BARIS)</span>
              <textarea class="form-textarea" data-demographic-field-options maxlength="4096">${escapeHtml((field.options || []).join('\n'))}</textarea>
            </label>
            <button class="btn-tactical danger" type="button" data-demographic-field-remove="${escapeHtml(field.id)}">HAPUS KOLOM</button>
          </article>`).join('') || '<p class="empty-state">Belum ada kolom kustom.</p>'}
        <button class="btn-tactical primary" type="button" data-demographic-settings-save ${this.studentDemographicSettingsError ? 'disabled' : ''}>SIMPAN KOLOM STATISTIK</button>
        <p class="auth-feedback" data-demographic-settings-feedback role="status" aria-live="polite">${escapeHtml(this.studentDemographicSettingsFeedback)}</p>
      </section>
      <section class="studio-organization-section studio-demographics-config">
        <h4>NILAI KOLOM KUSTOM PER AKUN</h4>
        <p class="studio-help">Pilih akun untuk mengisi atau mengubah nilainya. Nilai dapat dilihat pemegang capability statistik mahasiswa bila kolomnya ditampilkan.</p>
        ${members.length ? `<label class="form-group"><span class="form-label">AKUN ANGGOTA</span><select class="form-select" data-demographic-account-select>
          ${members.map((user) => `<option value="${escapeHtml(user.account_id)}" ${user.account_id === selectedAccount?.account_id ? 'selected' : ''}>${escapeHtml(user.name)} // ${escapeHtml(user.nim)}</option>`).join('')}
        </select></label>` : '<p class="empty-state">Tidak ada akun anggota untuk dikelola.</p>'}
        ${selectedAccount && settings.customColumns.length ? `
          <div class="studio-demographic-values">
            ${settings.customColumns.map((field) => renderCustomFieldInput(field, selectedValues[field.id], { prefix: 'studio-' })).join('')}
          </div>
          <button class="btn-tactical primary" type="button" data-demographic-values-save ${this.studentDemographicValuesError || this.studentDemographicSettingsError || this.studentDemographicSettingsDirty ? 'disabled' : ''}>SIMPAN NILAI AKUN</button>
        ` : '<p class="empty-state">Buat kolom kustom terlebih dahulu untuk menambahkan nilainya.</p>'}
        <p class="auth-feedback" data-demographic-values-feedback role="status" aria-live="polite">${escapeHtml(this.studentDemographicValuesFeedback)}</p>
      </section>`;
  }

  renderAccountAccessPanel() {
    const members = this.users.filter((user) => user.role !== 'superadmin');
    const governanceAccess = this.config.content.governanceDocumentAccess;
    const governanceCapabilities = POSITION_CAPABILITY_OPTIONS.filter(({ id }) => id.startsWith('constitution.'));
    return `
      <h3>AKSES ANGGOTA // PENGELOLAAN MASSAL</h3>
      <p class="studio-help">Pilih satu atau beberapa akun anggota untuk mengubah clearance (level 1–3) dan/atau capability langsung. Capability langsung mengikuti akun dan tidak mengubah mapping posisi; mencabut capability langsung tidak mencabut capability yang masih didapat dari penugasan. Akun superadmin dikecualikan.</p>
      ${this.usersError ? `<p class="auth-feedback" role="alert">DAFTAR AKUN TIDAK TERSEDIA: ${escapeHtml(this.usersError)}</p>` : ''}
      <p class="auth-feedback" data-access-feedback role="status" aria-live="polite">${escapeHtml(this.accessFeedback)}</p>
      <section class="studio-organization-section studio-access-section">
        <h4>HAK AMANDEMEN AD/ART/GBHO</h4>
        <p class="studio-help">Penyuntingan dan pengesahan masing-masing mensyaratkan clearance <strong>dan</strong> capability. Superadmin selalu dapat mengelola. Aturan ini disimpan bersama draft Site Studio dan berlaku setelah dipublikasikan.</p>
        <div class="admin-form-grid">
          ${[
            ['edit', 'PENYUNTING DRAF'],
            ['ratify', 'PENGESAHAN & PUBLIKASI']
          ].map(([action, label]) => `
            <fieldset class="studio-access-capabilities">
              <legend>${label}</legend>
              <label class="form-group"><span class="form-label">CLEARANCE MINIMUM</span>
                <select class="form-select" name="governanceDocumentAccess.${action}.clearance">
                  ${[1, 2, 3].map((level) => `
                    <option value="${level}" ${governanceAccess[action].clearance === level ? 'selected' : ''}>Level ${level}</option>
                  `).join('')}
                </select>
              </label>
              <label class="form-group"><span class="form-label">CAPABILITY WAJIB</span>
                <select class="form-select" name="governanceDocumentAccess.${action}.capability">
                  ${governanceCapabilities.map((capability) => `
                    <option value="${escapeHtml(capability.id)}" ${governanceAccess[action].capability === capability.id ? 'selected' : ''}>${escapeHtml(capability.label)}</option>
                  `).join('')}
                </select>
              </label>
            </fieldset>
          `).join('')}
        </div>
        <p class="studio-help">Capability diberikan melalui bagian pengelolaan akun langsung atau pemetaan akses jabatan. Hak pengesahan dipisahkan dari hak menyunting secara default.</p>
      </section>
      <section class="studio-organization-section studio-access-section">
        <div class="studio-organization-heading">
          <h4>AKUN ANGGOTA (${members.length})</h4>
          <div class="studio-organization-actions">
            <button class="btn-tactical" type="button" data-access-select-all ${members.length ? '' : 'disabled'}>PILIH SEMUA ANGGOTA</button>
            <button class="btn-tactical" type="button" data-access-clear-selection ${members.length ? '' : 'disabled'}>HAPUS PILIHAN</button>
          </div>
        </div>
        <p class="studio-help" data-access-selection-count role="status">0 akun dipilih</p>
        <div class="studio-access-account-list">
          ${members.map((user) => {
            const directCapabilities = POSITION_CAPABILITY_OPTIONS
              .filter(({ id }) => user.permissions?.includes(id))
              .map(({ label }) => label);
            return `<label class="studio-access-account">
              <input type="checkbox" data-access-account="${escapeHtml(user.account_id)}" />
              <span><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.nim)} // Clearance ${user.clearance_level || 1}</small>
                <small>Capability langsung: ${directCapabilities.length ? escapeHtml(directCapabilities.join(', ')) : 'Tidak ada'}</small>
              </span>
            </label>`;
          }).join('') || '<p class="empty-state">Tidak ada akun anggota untuk dikelola.</p>'}
        </div>
      </section>
      <section class="studio-organization-section studio-access-section">
        <h4>PERUBAHAN UNTUK AKUN TERPILIH</h4>
        <div class="admin-form-grid">
          <label class="form-group"><span class="form-label">CLEARANCE</span>
            <select class="form-select" name="accessClearance">
              <option value="">Tidak mengubah clearance</option>
              <option value="1">Level 1 — Kader</option>
              <option value="2">Level 2 — Pengurus operasional</option>
              <option value="3">Level 3 — Pengurus BPH</option>
            </select>
          </label>
          <label class="form-group"><span class="form-label">TINDAKAN CAPABILITY LANGSUNG</span>
            <select class="form-select" name="accessCapabilityAction">
              <option value="grant">Berikan</option>
              <option value="revoke">Cabut</option>
            </select>
          </label>
        </div>
        <fieldset class="studio-access-capabilities">
          <legend>Capability yang diterapkan</legend>
          ${POSITION_CAPABILITY_OPTIONS.map((option) => `
            <label class="studio-access-account">
              <input type="checkbox" data-access-capability="${escapeHtml(option.id)}" />
              <span><strong>${escapeHtml(option.label)}</strong><small>${escapeHtml(option.description)}</small></span>
            </label>`).join('')}
        </fieldset>
        <p class="studio-help">Maksimal 500 akun per perubahan. Pastikan pilihan dan tindakan sudah benar; perubahan akses berlaku pada permintaan API berikutnya.</p>
        <button class="btn-tactical primary" type="button" data-access-bulk-save ${this.usersError || !members.length ? 'disabled' : ''}>TERAPKAN KE AKUN TERPILIH</button>
      </section>`;
  }

  renderOrganizationPanel() {
    const structure = this.config.content.data.organizationStructure || { people: [], terms: [] };
    const people = structure.people || [];
    const terms = structure.terms || [];
    const accountOptions = (selectedId) => `
      <option value="">Tanpa tautan akun</option>
      ${this.users.map((user) => `
        <option value="${escapeHtml(user.account_id)}" ${selectedId === user.account_id ? 'selected' : ''}>
          ${escapeHtml(user.name)} // ${escapeHtml(user.membership_stage || 'Status anggota belum ditetapkan')}
        </option>
      `).join('')}`;
    const field = (label, name, value, { type = 'text', maxLength = 120, required = false } = {}) => `
      <label class="form-group"><span class="form-label">${label}</span>
        <input class="form-input" name="${name}" type="${type}" value="${escapeHtml(value ?? '')}" ${maxLength ? `maxlength="${maxLength}"` : ''} ${required ? 'required' : ''} />
      </label>`;
    const select = (label, name, options) => `
      <label class="form-group"><span class="form-label">${label}</span><select class="form-select" name="${name}">${options}</select></label>`;
    const removeButton = (kind, id, termId = '') => `
      <button class="btn-tactical danger" type="button" data-org-remove="${kind}" data-org-id="${escapeHtml(id)}" ${termId ? `data-org-term-id="${escapeHtml(termId)}"` : ''}>HAPUS</button>`;

    return `
      <h3>STRUKTUR ORGANISASI BERDASARKAN PERIODE</h3>
      <p class="studio-help">Susun unit, posisi, dan penugasan secara fleksibel. Status keanggotaan tetap mengikuti akun dan tidak diturunkan dari jabatan. Jangan mengunci susunan BPH/DPA atau mengisi jabatan sebelum rujukan resmi diverifikasi. ID akun hanya untuk administrasi dan tidak diterbitkan ke publik.</p>
      ${this.usersError ? `<p class="auth-feedback" role="alert">TAUTAN AKUN TIDAK TERSEDIA: ${escapeHtml(this.usersError)} Personel tetap dapat dicatat tanpa tautan.</p>` : ''}
      <section class="studio-organization-section">
        <div class="studio-organization-heading"><h4>PERSONEL</h4><button class="btn-tactical" type="button" data-org-add="person">TAMBAH PERSONEL</button></div>
        ${people.length ? people.map((person, personIndex) => `
          <div class="studio-organization-record">
            <div class="studio-organization-record-heading"><strong>${escapeHtml(person.name || 'Personel baru')}</strong>${removeButton('person', person.id)}</div>
            <div class="admin-form-grid">
              ${field('NAMA TAMPIL', `organization.person.${personIndex}.name`, person.name, { required: true })}
              ${select('TAUTAN AKUN (OPSIONAL)', `organization.person.${personIndex}.accountId`, accountOptions(person.accountId))}
              <label class="studio-toggle"><input type="checkbox" name="organization.person.${personIndex}.isPublic" ${person.isPublic ? 'checked' : ''} /> TAMPILKAN NAMA DI BAGAN PUBLIK</label>
            </div>
          </div>
        `).join('') : '<p class="empty-state">Belum ada personel. Personel dapat ditautkan ke akun terdaftar atau dicatat tanpa tautan akun.</p>'}
      </section>
      <section class="studio-organization-section">
        <div class="studio-organization-heading"><h4>PERIODE DAN HIERARKI</h4><div class="studio-organization-actions">
          <button class="btn-tactical" type="button" data-org-add="term">TAMBAH PERIODE KOSONG</button>
          <button class="btn-tactical primary" type="button" data-org-template="hmif-governance">BUAT DRAFT BPH / BPD / DPA</button>
        </div></div>
        <p class="studio-help">Template hanya membuat unit dan posisi kosong pada periode draft. Personel, anggota biasa, struktur DPA, departemen, serta tanggal harus disesuaikan dan diverifikasi; template tidak menetapkan kewenangan atau hak akses.</p>
        ${terms.length ? terms.map((term, termIndex) => {
      const units = term.units || [];
      const positions = term.positions || [];
      const assignments = term.assignments || [];
      const unitOptions = (selectedId, includeEmpty = false) => `
            ${includeEmpty ? '<option value="">Tanpa induk — unit sejajar</option>' : ''}
            ${units.map((unit) => `<option value="${escapeHtml(unit.id)}" ${selectedId === unit.id ? 'selected' : ''}>${escapeHtml(unit.name)}</option>`).join('')}`;
      const descendantsOf = (unitId) => {
        const descendants = new Set();
        const collect = (parentId) => units.filter((unit) => unit.parentUnitId === parentId).forEach((unit) => {
          if (!descendants.has(unit.id)) {
            descendants.add(unit.id);
            collect(unit.id);
          }
        });
        collect(unitId);
        return descendants;
      };
      return `
            <div class="studio-organization-record" data-org-term="${escapeHtml(term.id)}">
              <div class="studio-organization-record-heading"><strong>${escapeHtml(term.name || 'Periode baru')}</strong>${removeButton('term', term.id)}</div>
              <div class="admin-form-grid">
                ${field('NAMA PERIODE', `organization.term.${termIndex}.name`, term.name, { required: true })}
                ${field('MULAI', `organization.term.${termIndex}.startDate`, term.startDate, { type: 'date', maxLength: 0, required: true })}
                ${field('AKHIR (OPSIONAL)', `organization.term.${termIndex}.endDate`, term.endDate, { type: 'date', maxLength: 0 })}
                ${select('STATUS', `organization.term.${termIndex}.status`, `
                  <option value="draft" ${term.status === 'draft' ? 'selected' : ''}>Draft</option>
                  <option value="active" ${term.status === 'active' ? 'selected' : ''}>Aktif</option>
                  <option value="archived" ${term.status === 'archived' ? 'selected' : ''}>Arsip</option>`)}
              </div>
              <div class="studio-organization-subsection">
                <div class="studio-organization-heading"><h5>UNIT / LEMBAGA (${units.length})</h5><button class="btn-tactical" type="button" data-org-add="unit" data-org-term-id="${escapeHtml(term.id)}">TAMBAH UNIT</button></div>
                ${units.length ? units.map((unit, unitIndex) => {
        const blockedParents = descendantsOf(unit.id);
        const parents = units.filter((parent) => parent.id !== unit.id && !blockedParents.has(parent.id));
        return `<div class="studio-organization-item">
                    <div class="admin-form-grid">
                      ${field('NAMA UNIT', `organization.unit.${termIndex}.${unitIndex}.name`, unit.name, { required: true })}
                      ${select('UNIT INDUK', `organization.unit.${termIndex}.${unitIndex}.parentUnitId`, `
                        <option value="">Tanpa induk — lembaga sejajar</option>
                        ${parents.map((parent) => `<option value="${escapeHtml(parent.id)}" ${unit.parentUnitId === parent.id ? 'selected' : ''}>${escapeHtml(parent.name)}</option>`).join('')}`)}
                      ${field('KODE', `organization.unit.${termIndex}.${unitIndex}.code`, unit.code, { maxLength: 32 })}
                      ${field('DESKRIPSI', `organization.unit.${termIndex}.${unitIndex}.description`, unit.description, { maxLength: 500 })}
                    </div>
                    ${removeButton('unit', unit.id, term.id)}
                  </div>`;
      }).join('') : '<p class="empty-state">Belum ada unit. Buat lembaga sebagai unit sejajar, lalu tambahkan unit turunan bila diperlukan.</p>'}
              </div>
              <div class="studio-organization-subsection">
                <div class="studio-organization-heading"><h5>POSISI (${positions.length})</h5><button class="btn-tactical" type="button" data-org-add="position" data-org-term-id="${escapeHtml(term.id)}" ${units.length ? '' : 'disabled'}>TAMBAH POSISI</button></div>
                ${positions.length ? positions.map((position, positionIndex) => `<div class="studio-organization-item">
                  <div class="admin-form-grid">
                    ${field('NAMA POSISI', `organization.position.${termIndex}.${positionIndex}.title`, position.title, { required: true })}
                    ${select('UNIT', `organization.position.${termIndex}.${positionIndex}.unitId`, unitOptions(position.unitId))}
                    ${field('KODE', `organization.position.${termIndex}.${positionIndex}.code`, position.code, { maxLength: 32 })}
                    <label class="form-group"><span class="form-label">KAPASITAS PEMEGANG</span><input class="form-input" name="organization.position.${termIndex}.${positionIndex}.maxOccupants" type="number" min="1" max="100" value="${position.maxOccupants || 1}" /></label>
                    <label class="studio-toggle"><input type="checkbox" name="organization.position.${termIndex}.${positionIndex}.required" ${position.required !== false ? 'checked' : ''} /> POSISI WAJIB</label>
                  </div>
                  ${removeButton('position', position.id, term.id)}
                </div>`).join('') : '<p class="empty-state">Belum ada posisi yang ditetapkan.</p>'}
              </div>
              <div class="studio-organization-subsection">
                <div class="studio-organization-heading"><h5>PENUGASAN (${assignments.length})</h5><button class="btn-tactical" type="button" data-org-add="assignment" data-org-term-id="${escapeHtml(term.id)}" ${people.length && positions.length ? '' : 'disabled'}>TAMBAH PENUGASAN</button></div>
                ${assignments.length ? assignments.map((assignment, assignmentIndex) => `<div class="studio-organization-item">
                  <div class="admin-form-grid">
                    ${select('PERSONEL', `organization.assignment.${termIndex}.${assignmentIndex}.personId`, people.map((person) => `<option value="${escapeHtml(person.id)}" ${assignment.personId === person.id ? 'selected' : ''}>${escapeHtml(person.name)}</option>`).join(''))}
                    ${select('POSISI', `organization.assignment.${termIndex}.${assignmentIndex}.positionId`, positions.map((position) => `<option value="${escapeHtml(position.id)}" ${assignment.positionId === position.id ? 'selected' : ''}>${escapeHtml(position.title)}</option>`).join(''))}
                    ${field('MULAI', `organization.assignment.${termIndex}.${assignmentIndex}.startDate`, assignment.startDate, { type: 'date', maxLength: 0, required: true })}
                    ${field('AKHIR (OPSIONAL)', `organization.assignment.${termIndex}.${assignmentIndex}.endDate`, assignment.endDate, { type: 'date', maxLength: 0 })}
                    ${select('JENIS', `organization.assignment.${termIndex}.${assignmentIndex}.kind`, `
                      <option value="substantive" ${assignment.kind === 'substantive' ? 'selected' : ''}>Substantif</option>
                      <option value="acting" ${assignment.kind === 'acting' ? 'selected' : ''}>Pelaksana tugas</option>`)}
                  </div>
                  ${removeButton('assignment', assignment.id, term.id)}
                </div>`).join('') : '<p class="empty-state">Belum ada penugasan. Posisi yang belum terisi tidak akan dianggap sebagai lowongan secara otomatis.</p>'}
              </div>
            </div>`;
    }).join('') : '<p class="empty-state">Belum ada periode. Struktur jabatan lama tidak dimigrasikan otomatis; tambahkan periode setelah susunan resminya diverifikasi.</p>'}
      </section>`;
  }

  bindOrganizationEvents(form, body) {
    const updateConfig = () => {
      const collected = this.tryCollectConfig(form, body);
      if (!collected) return false;
      this.config = collected;
      return true;
    };
    body.querySelectorAll('[data-org-template]').forEach((button) => button.addEventListener('click', () => {
      if (!updateConfig()) return;
      if (!window.confirm('Buat periode draft baru menggunakan template modular? Data personel dan penugasan tidak akan dibuat.')) return;
      const startDate = new Date().toISOString().slice(0, 10);
      this.config.content.data.organizationStructure.terms.push(createOrganizationDraftTemplate({
        createId: createOrganizationId,
        startDate
      }));
      this.render(body);
      this.feedback(body, 'TEMPLATE DRAFT DIBUAT. PERIKSA NAMA PERIODE DAN TANGGAL SEBELUM MENYIMPAN.');
    }));
    body.querySelectorAll('[data-org-add]').forEach((button) => button.addEventListener('click', () => {
      if (!updateConfig()) return;
      const kind = button.dataset.orgAdd;
      const term = this.config.content.data.organizationStructure.terms.find(({ id }) => id === button.dataset.orgTermId);
      const today = new Date().toISOString().slice(0, 10);
      if (kind === 'person') {
        this.config.content.data.organizationStructure.people.push({
          id: createOrganizationId('person'), name: '', isPublic: false
        });
      } else if (kind === 'term') {
        this.config.content.data.organizationStructure.terms.push({
          id: createOrganizationId('term'),
          name: '',
          startDate: today,
          endDate: null,
          status: 'draft',
          units: [],
          positions: [],
          assignments: []
        });
      } else if (term && kind === 'unit') {
        term.units.push({ id: createOrganizationId('unit'), parentUnitId: null, name: '', code: '', description: '', order: term.units.length });
      } else if (term && kind === 'position' && term.units.length) {
        term.positions.push({
          id: createOrganizationId('position'), unitId: term.units[0].id, title: '', code: '',
          maxOccupants: 1, required: true, order: term.positions.length
        });
      } else if (term && kind === 'assignment' && this.config.content.data.organizationStructure.people.length && term.positions.length) {
        term.assignments.push({
          id: createOrganizationId('assignment'),
          personId: this.config.content.data.organizationStructure.people[0].id,
          positionId: term.positions[0].id,
          startDate: term.startDate,
          endDate: null,
          kind: 'substantive'
        });
      }
      this.render(body);
    }));

    body.querySelectorAll('[data-org-remove]').forEach((button) => button.addEventListener('click', () => {
      const { orgRemove: kind, orgId: id, orgTermId: termId } = button.dataset;
      const prompts = {
        person: 'Hapus personel ini dan semua penugasannya?',
        term: 'Hapus periode ini beserta unit, posisi, dan seluruh penugasannya?',
        unit: 'Hapus unit ini?',
        position: 'Hapus posisi ini beserta seluruh penugasannya?',
        assignment: 'Hapus penugasan ini?'
      };
      if (!window.confirm(prompts[kind] || 'Hapus data ini?')) return;
      if (!updateConfig()) return;
      const structure = this.config.content.data.organizationStructure;
      const term = structure.terms.find(({ id: termKey }) => termKey === termId);
      if (kind === 'person') {
        structure.people = structure.people.filter((person) => person.id !== id);
        structure.terms.forEach((entry) => {
          entry.assignments = entry.assignments.filter((assignment) => assignment.personId !== id);
        });
      } else if (kind === 'term') {
        structure.terms = structure.terms.filter((entry) => entry.id !== id);
      } else if (term && kind === 'unit') {
        if (term.units.some((unit) => unit.parentUnitId === id) || term.positions.some((position) => position.unitId === id)) {
          return this.feedback(body, 'UNIT MASIH MEMILIKI UNIT TURUNAN ATAU POSISI. HAPUS KETERKAITAN TERSEBUT TERLEBIH DAHULU.');
        }
        term.units = term.units.filter((unit) => unit.id !== id);
      } else if (term && kind === 'position') {
        term.positions = term.positions.filter((position) => position.id !== id);
        term.assignments = term.assignments.filter((assignment) => assignment.positionId !== id);
      } else if (term && kind === 'assignment') {
        term.assignments = term.assignments.filter((assignment) => assignment.id !== id);
      }
      this.render(body);
    }));

    body.querySelectorAll('[name^="organization.person."][name$=".accountId"]').forEach((selectElement) => {
      selectElement.addEventListener('change', () => {
        const selectedUser = this.users.find(({ account_id: accountId }) => accountId === selectElement.value);
        const nameInput = selectElement.closest('.studio-organization-record')?.querySelector('[name$=".name"]');
        if (selectedUser && nameInput) nameInput.value = selectedUser.name;
      });
    });
  }

  renderPortalRecordsPanel() {
    const recordLabel = (kind, record) => kind === 'project'
      ? `${record.payload.title} // ${record.payload.author}`
      : kind === 'alumni'
        ? `${record.payload.name} // ${record.payload.graduation_year} // ${record.payload.company}`
        : `${record.payload.title} // ${record.payload.employer}`;
    const lists = Object.entries(this.portalRecords).map(([kind, records]) => `
      <h4>${kind === 'project' ? 'SHOWCASE PROYEK' : kind === 'alumni' ? 'DIREKTORI ALUMNI' : 'LOWONGAN & MAGANG'}</h4>
      <div class="admin-record-list">
        ${records.map((record) => `
          <div class="admin-record-row studio-portal-record-row" data-portal-record-row="${escapeHtml(record.id)}">
            <span><strong>${escapeHtml(recordLabel(kind, record))}</strong><small>${escapeHtml(record.review_status.toUpperCase())}${record.submitter_account_id ? ` // DIAJUKAN ${escapeHtml(record.created_by)}` : ''} // ${escapeHtml(record.updated_at || record.created_at)}</small>
              ${record.review_note ? `<small>CATATAN: ${escapeHtml(record.review_note)}</small>` : ''}
              ${(record.history || []).length ? `<small>RIWAYAT: ${(record.history || []).slice(0, 3).map((entry) => `${escapeHtml(entry.action)} · ${escapeHtml(entry.actor_nim)}`).join(' | ')}</small>` : ''}
            </span>
            ${record.review_status === 'pending_review' ? `
              <label class="form-group"><span class="form-label">CATATAN REVIEW / REVISI</span><input class="form-input" maxlength="1000" data-portal-review-note="${escapeHtml(record.id)}" /></label>
              <button class="btn-tactical" type="button" data-portal-review="needs_revision" data-portal-record="${escapeHtml(record.id)}" data-portal-kind="${kind}">MINTA REVISI</button>
              <button class="btn-tactical danger" type="button" data-portal-review="reject" data-portal-record="${escapeHtml(record.id)}" data-portal-kind="${kind}">TOLAK</button>
              <button class="btn-tactical primary" type="button" data-portal-review="approve" data-portal-record="${escapeHtml(record.id)}" data-portal-kind="${kind}">SETUJUI</button>
            ` : ''}
            ${record.review_status === 'approved' ? `<button class="btn-tactical primary" type="button" data-portal-review="publish" data-portal-record="${escapeHtml(record.id)}" data-portal-kind="${kind}">PUBLIKASIKAN</button>` : ''}
            ${record.review_status === 'published' ? `<button class="btn-tactical" type="button" data-portal-review="archive" data-portal-record="${escapeHtml(record.id)}" data-portal-kind="${kind}">ARSIPKAN</button>` : ''}
            <button class="btn-tactical danger" type="button" data-portal-record-delete="${escapeHtml(record.id)}" data-portal-kind="${kind}">HAPUS</button>
          </div>`).join('') || '<p>Belum ada konten.</p>'}
      </div>`).join('');

    return `
      <h3>PORTOFOLIO, ALUMNI & LOWONGAN</h3>
      <p>Publikasikan hanya karya dan profil yang telah mendapat persetujuan pemilik. Hindari memasukkan email atau nomor telepon pribadi.</p>
      ${this.portalRecordsError ? `<p class="auth-feedback" role="alert">${escapeHtml(this.portalRecordsError)}</p>` : ''}
      ${lists}
      <h4>TAMBAH KARYA MAHASISWA</h4>
      <div class="admin-form-grid" data-portal-editor="project">
        <label class="form-group"><span class="form-label">JUDUL PROYEK</span><input class="form-input" name="title" maxlength="160" required /></label>
        <label class="form-group"><span class="form-label">PEMILIK / TIM</span><input class="form-input" name="author" maxlength="120" required /></label>
        <label class="form-group"><span class="form-label">KATEGORI</span><input class="form-input" name="category" maxlength="80" placeholder="IoT, Web, AI, Riset..." required /></label>
        <label class="form-group"><span class="form-label">JENIS KARYA</span><select class="form-select" name="project_type"><option>Tugas Akhir</option><option>Kerja Praktik</option><option>Lomba</option><option>Riset mandiri</option><option>Aplikasi web</option><option>Aplikasi mobile</option><option>IoT</option><option>Edge AI</option><option>UI/UX</option><option selected>Lainnya</option></select></label>
        <label class="form-group"><span class="form-label">TAG (KOMA)</span><input class="form-input" name="tags" maxlength="480" /></label>
        <label class="form-group"><span class="form-label">URL REPOSITORI HTTPS</span><input class="form-input" name="repo_url" type="url" maxlength="2000" /></label>
        <label class="form-group"><span class="form-label">URL LIVE DEMO HTTPS</span><input class="form-input" name="demo_url" type="url" maxlength="2000" /></label>
        <label class="form-group"><span class="form-label">URL VIDEO YOUTUBE (OPSIONAL)</span><input class="form-input" name="video_url" type="url" maxlength="2000" /></label>
        <label class="form-group" style="grid-column:1/-1"><span class="form-label">RINGKASAN</span><textarea class="form-textarea" name="description" maxlength="1200" required></textarea></label>
        <button class="btn-tactical primary" type="button" data-portal-create="project">TAMBAH KARYA</button>
      </div>
      <h4>TAMBAH PROFIL ALUMNI (DENGAN PERSETUJUAN)</h4>
      <div class="admin-form-grid" data-portal-editor="alumni">
        <label class="form-group"><span class="form-label">NAMA</span><input class="form-input" name="name" maxlength="120" required /></label>
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
        <label class="studio-toggle"><input type="checkbox" name="consent" required /> SAYA MEMILIKI PERSETUJUAN TERTULIS ALUMNI UNTUK PUBLIKASI PROFIL</label>
        <button class="btn-tactical primary" type="button" data-portal-create="alumni">TAMBAH ALUMNI</button>
      </div>
      <h4>TAMBAH LOWONGAN / MAGANG</h4>
      <div class="admin-form-grid" data-portal-editor="job">
        <label class="form-group"><span class="form-label">POSISI</span><input class="form-input" name="title" maxlength="160" required /></label>
        <label class="form-group"><span class="form-label">PERUSAHAAN</span><input class="form-input" name="employer" maxlength="120" required /></label>
        <label class="form-group"><span class="form-label">SPESIALISASI RINGKAS</span><input class="form-input" name="specialization" maxlength="160" placeholder="Backend, aplikasi data, platform AI" required /></label>
        <fieldset class="career-specialization-options"><legend>FILTER BIDANG</legend>${['Full-stack', 'AI', 'Mobile', 'Cybersecurity', 'IoT', 'Data'].map((specialty) => `<label><input type="checkbox" name="specializations" value="${specialty}" /> ${specialty}</label>`).join('')}</fieldset>
        <label class="form-group"><span class="form-label">LOKASI</span><input class="form-input" name="location" maxlength="120" required /></label>
        <label class="form-group"><span class="form-label">JENIS</span><select class="form-select" name="work_type"><option>Magang</option><option>Penuh waktu</option><option>Paruh waktu</option><option>Kontrak</option></select></label>
        <label class="form-group"><span class="form-label">TENGGAT</span><input class="form-input" type="date" name="deadline" required /></label>
        <label class="form-group"><span class="form-label">URL PENDAFTARAN HTTPS</span><input class="form-input" type="url" name="url" maxlength="2000" required /></label>
        <button class="btn-tactical primary" type="button" data-portal-create="job">TAMBAH LOWONGAN</button>
      </div>`;
  }

  renderKnowledgeResourcesPanel() {
    const resources = this.config.content.data.knowledgeResources || [];
    const editing = resources.find(({ id }) => id === this.editingKnowledgeResourceId);
    const current = editing || { id: '', title: '', course: '', semester: 'Semua', lecturer: '', academicYear: '', examType: '', kind: 'reference', summary: '', url: '', fileId: '', tags: [], published: true };
    const kinds = [
      ['exam', 'Soal ujian'],
      ['module', 'Modul'],
      ['cheatsheet', 'Cheat sheet'],
      ['reference', 'Referensi'],
      ['learning_path', 'Learning path'],
      ['project', 'Proyek'],
      ['faq', 'FAQ mahasiswa']
    ];

    return `
      <section class="studio-knowledge-resources" aria-labelledby="studio-knowledge-heading">
        <h3 id="studio-knowledge-heading">REFERENSI AKADEMIK</h3>
        <p>Kelola materi melalui tautan HTTPS atau PDF berizin. FAQ dapat berisi jawaban langsung tanpa URL/PDF. PDF maksimal 20 MB.</p>
        <div class="admin-record-list">
          ${this.knowledgeFiles.map((file) => `
            <div class="admin-record-row studio-knowledge-file-row" data-knowledge-file-row>
              <span><strong>${escapeHtml(file.original_name)}</strong><small>${(file.size / 1024).toFixed(1)} KB // SHA-256 ${escapeHtml(file.sha256.slice(0, 12))}...</small></span>
              <button class="btn-tactical" type="button" data-knowledge-file-delete="${escapeHtml(file.id)}">HAPUS PDF</button>
            </div>
          `).join('') || '<p>Belum ada PDF akademik yang diunggah.</p>'}
        </div>
        <div class="admin-form-grid studio-knowledge-upload-grid">
          <label class="form-group"><span class="form-label">UNGGAH DOKUMEN PDF</span><input class="form-input" type="file" accept="application/pdf" data-knowledge-file-input /></label>
          <button class="btn-tactical" type="button" data-upload-knowledge-file>UNGGAH PDF</button>
        </div>
        <div class="admin-record-list">
          ${resources.map((resource) => `
            <article class="admin-record-row studio-knowledge-record-row">
              <span><strong>${escapeHtml(resource.title)}</strong><small>${escapeHtml(resource.course || 'Umum')} // Semester ${escapeHtml(resource.semester || 'Semua')}${resource.academicYear ? ` // ${escapeHtml(resource.academicYear)}` : ''}${resource.lecturer ? ` // ${escapeHtml(resource.lecturer)}` : ''}${resource.examType ? ` // ${escapeHtml(resource.examType)}` : ''} // ${escapeHtml(kinds.find(([kind]) => kind === resource.kind)?.[1] || resource.kind)} // ${resource.fileId ? 'PDF' : 'LINK'} // ${resource.published === false ? 'DRAFT' : 'DITAYANGKAN'}</small></span>
              <label class="studio-toggle"><input type="checkbox" data-knowledge-published="${escapeHtml(resource.id)}" ${resource.published === false ? '' : 'checked'} /> Publik</label>
              <button class="btn-tactical" type="button" data-knowledge-edit="${escapeHtml(resource.id)}">UBAH</button>
              <button class="btn-tactical" type="button" data-knowledge-delete="${escapeHtml(resource.id)}">HAPUS</button>
            </article>
          `).join('') || '<p>Belum ada referensi akademik.</p>'}
        </div>
        <h4>${editing ? 'UBAH REFERENSI' : 'TAMBAH REFERENSI'}</h4>
        <div class="admin-form-grid" data-knowledge-editor>
          <label class="form-group"><span class="form-label">ID UNIK</span><input class="form-input" name="id" maxlength="64" pattern="[A-Za-z0-9_-]+" value="${escapeHtml(current.id)}" /></label>
          <label class="form-group"><span class="form-label">JUDUL</span><input class="form-input" name="title" maxlength="180" value="${escapeHtml(current.title)}" /></label>
          <label class="form-group"><span class="form-label">MATA KULIAH</span><input class="form-input" name="course" maxlength="120" value="${escapeHtml(current.course)}" /></label>
          <label class="form-group"><span class="form-label">SEMESTER</span><input class="form-input" name="semester" maxlength="20" value="${escapeHtml(current.semester)}" /></label>
          <label class="form-group"><span class="form-label">DOSEN PENGAMPU</span><input class="form-input" name="lecturer" maxlength="120" value="${escapeHtml(current.lecturer || '')}" /></label>
          <label class="form-group"><span class="form-label">TAHUN AJARAN</span><input class="form-input" name="academicYear" maxlength="20" placeholder="2026/2027" value="${escapeHtml(current.academicYear || '')}" /></label>
          <label class="form-group"><span class="form-label">JENIS EVALUASI</span><select class="form-select" name="examType">${[['', 'Tidak ditentukan'], ['UTS', 'UTS'], ['UAS', 'UAS'], ['Kuis', 'Kuis'], ['Latihan', 'Latihan']].map(([value, label]) => `<option value="${value}" ${current.examType === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
          <label class="form-group"><span class="form-label">JENIS MATERI</span><select class="form-select" name="kind">${kinds.map(([kind, label]) => `<option value="${kind}" ${current.kind === kind ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
          <label class="form-group"><span class="form-label">URL HTTPS (KOSONGKAN JIKA MEMILIH PDF)</span><input class="form-input" type="url" name="url" maxlength="500" value="${escapeHtml(current.url)}" /></label>
          <label class="form-group"><span class="form-label">PDF TERUNGGAH (KOSONGKAN JIKA MEMILIH URL)</span><select class="form-select" name="fileId"><option value="">Tidak menggunakan PDF</option>${this.knowledgeFiles.map((file) => `<option value="${escapeHtml(file.id)}" ${current.fileId === file.id ? 'selected' : ''}>${escapeHtml(file.original_name)}</option>`).join('')}</select></label>
          <label class="form-group"><span class="form-label">${current.kind === 'faq' ? 'JAWABAN / LANGKAH PROSEDUR' : 'RINGKASAN'}</span><textarea class="form-textarea" name="summary" maxlength="${current.kind === 'faq' ? 5000 : 500}">${escapeHtml(current.summary)}</textarea></label>
          <label class="form-group"><span class="form-label">TAG (PISAHKAN DENGAN KOMA)</span><input class="form-input" name="tags" maxlength="500" value="${escapeHtml((current.tags || []).join(', '))}" /></label>
          <label class="studio-toggle"><input type="checkbox" name="published" ${current.published === false ? '' : 'checked'} /> Tampilkan di katalog publik</label>
        </div>
        <div class="studio-actions">
          <button class="btn-tactical primary" type="button" data-knowledge-save>${editing ? 'SIMPAN REFERENSI' : 'TAMBAH REFERENSI'}</button>
          ${editing ? '<button class="btn-tactical" type="button" data-knowledge-cancel>BATAL</button>' : ''}
        </div>
      </section>`;
  }

  renderDepartmentsPanel(imageSelect, inlineImageSelect) {
    const departments = Array.isArray(this.config.content.data.departments)
      ? [...this.config.content.data.departments].sort((a, b) => (a.order || 0) - (b.order || 0))
      : [];
    const generations = Array.isArray(this.config.content.data.generations)
      ? [...this.config.content.data.generations].sort((a, b) => (a.order || 0) - (b.order || 0))
      : [];
    const operators = Array.isArray(this.config.content.data.operators)
      ? this.config.content.data.operators
      : [];

    const totalDepts = departments.length;
    const totalOps = operators.length;
    const bphOps = operators.filter((op) => {
      const d = (op.departmentId || '').toLowerCase();
      const div = (op.division || '').toLowerCase();
      const lvl = (op.roleLevel || '').toLowerCase();
      return d === 'bph' || div === 'bph' || lvl.startsWith('bph');
    });

    // Helper: render candidate options for leadership dropdowns
    const renderCandidateOptions = (currentOpId, currentAccountId = '') => {
      let html = '<option value="">-- Tetapkan / Ganti Personel --</option>';
      html += '<option value="__CLEAR__">-- Kosongkan / Lepas Jabatan --</option>';

      html += '<optgroup label="Pengurus & Operator Saat Ini">';
      operators.forEach((op) => {
        const isSelected = op.id === currentOpId;
        html += `<option value="op:${escapeHtml(op.id)}" ${isSelected ? 'selected' : ''}>${escapeHtml(op.name)} (${escapeHtml(op.nim)}) [HMIF ACTIVE · ${escapeHtml(op.division || 'Umum')} - ${escapeHtml(op.role)}]</option>`;
      });
      html += '</optgroup>';

      const registeredCadets = this.users;
      if (registeredCadets.length > 0) {
        html += '<optgroup label="Kader / Mahasiswa Terdaftar (Database)">';
        registeredCadets.forEach((u) => {
          html += `<option value="user:${escapeHtml(u.nim)}" ${u.account_id === currentAccountId ? 'selected' : ''}>${escapeHtml(u.name)} (${escapeHtml(u.nim)}) [Angkatan ${escapeHtml(u.generation || '-')} - ${escapeHtml(u.membership_stage || 'Kader')}]</option>`;
        });
        html += '</optgroup>';
      }

      return html;
    };

    const renderCoordinatorOptions = (currentOpId, currentAccountId = '') => {
      let html = '<option value="">-- Kader / Isi Profil Manual --</option>';
      html += '<optgroup label="Operator HMIF Aktif">';
      operators.forEach((op) => {
        html += `<option value="op:${escapeHtml(op.id)}" ${op.id === currentOpId ? 'selected' : ''}>${escapeHtml(op.name)} (${escapeHtml(op.nim)}) · HMIF ACTIVE</option>`;
      });
      html += '</optgroup>';

      const registeredCadets = this.users;
      if (registeredCadets.length) {
        html += '<optgroup label="Kader Terdaftar">';
        registeredCadets.forEach((user) => {
          html += `<option value="user:${escapeHtml(user.nim)}" ${user.account_id === currentAccountId ? 'selected' : ''}>${escapeHtml(user.name)} (${escapeHtml(user.nim)}) · KADER</option>`;
        });
        html += '</optgroup>';
      }
      return html;
    };

    // Helper: render candidate options for adding staff (exclude members already in that department)
    const renderAddStaffOptions = (deptId) => {
      let html = '<option value="">-- Pilih Kader untuk Ditambahkan ke Staf --</option>';

      const currentDeptOpIds = new Set(
        operators.filter((o) => o.departmentId === deptId).map((o) => o.id)
      );

      html += '<optgroup label="Operator Lainnya (Belum di Departemen Ini)">';
      operators.filter((o) => !currentDeptOpIds.has(o.id)).forEach((op) => {
        html += `<option value="op:${escapeHtml(op.id)}">${escapeHtml(op.name)} (${escapeHtml(op.nim)}) [${escapeHtml(op.division || 'Umum')}]</option>`;
      });
      html += '</optgroup>';

      const opNims = new Set(operators.map((o) => String(o.nim)));
      const registeredCadets = this.users.filter((u) => !opNims.has(String(u.nim)));
      if (registeredCadets.length > 0) {
        html += '<optgroup label="Kader Terdaftar (Database)">';
        registeredCadets.forEach((u) => {
          html += `<option value="user:${escapeHtml(u.nim)}">${escapeHtml(u.name)} (${escapeHtml(u.nim)}) [Angkatan ${escapeHtml(u.generation || '-')}]</option>`;
        });
        html += '</optgroup>';
      }

      return html;
    };

    // Department Add/Edit Form Dialog Card
    let deptFormHtml = '';
    if (this.editingDepartmentId) {
      const isNew = this.editingDepartmentId === 'new';
      const targetDept = isNew
        ? { id: '', code: '', name: '', description: '', responsibilities: [], order: departments.length + 1, emblem: '/assets/faction/1.png', kadepTitle: 'Kepala Departemen', sekdepTitle: 'Sekretaris Departemen' }
        : (departments.find((d) => d.id === this.editingDepartmentId) || { id: '', code: '', name: '', description: '', responsibilities: [], order: 1, emblem: '', kadepTitle: 'Kepala Departemen', sekdepTitle: 'Sekretaris Departemen' });

      deptFormHtml = `
              <div class="studio-dialog-card" id="studio-dept-form">
                <h4>${isNew ? '+ TAMBAH DEPARTEMEN / DIVISI BARU' : `✎ EDIT DEPARTEMEN: ${escapeHtml(targetDept.name)}`}</h4>
                <div class="admin-form-grid">
                  <label class="form-group">
                    <span class="form-label">KODE SINGKAT (MISAL: LITBANG)</span>
                    <input class="form-input" id="dept-form-code" value="${escapeHtml(targetDept.code)}" maxlength="32" placeholder="LITBANG" required />
                  </label>
                  <label class="form-group">
                    <span class="form-label">ID SISTEM (HURUF KECIL, ANGKA, STRIP)</span>
                    <input class="form-input" id="dept-form-id" value="${escapeHtml(targetDept.id)}" maxlength="64" placeholder="dept-litbang" ${isNew ? '' : 'readonly'} required />
                  </label>
                  <label class="form-group" style="grid-column: 1 / -1;">
                    <span class="form-label">NAMA LENGKAP DEPARTEMEN / DIVISI</span>
                    <input class="form-input" id="dept-form-name" value="${escapeHtml(targetDept.name)}" maxlength="120" placeholder="Departemen Penelitian & Pengembangan" required />
                  </label>
                  <label class="form-group" style="grid-column: 1 / -1;">
                    <span class="form-label">DESKRIPSI OPERASIONAL</span>
                    <textarea class="form-textarea" id="dept-form-desc" maxlength="500" placeholder="Fokus riset, pengembangan inovasi dan teknologi...">${escapeHtml(targetDept.description || '')}</textarea>
                  </label>
                  <label class="form-group" style="grid-column: 1 / -1;">
                    <span class="form-label">TUGAS POKOK & FUNGSI (SATU POIN PER BARIS)</span>
                    <textarea class="form-textarea" id="dept-form-responsibilities" maxlength="2400" placeholder="Contoh: Merancang dan mengevaluasi program kerja departemen">${escapeHtml((targetDept.responsibilities || []).join('\n'))}</textarea>
                  </label>
                  <label class="form-group">
                    <span class="form-label">GELAR JABATAN KETUA (KADEP / KADIV)</span>
                    <input class="form-input" id="dept-form-kadeptitle" value="${escapeHtml(targetDept.kadepTitle || 'Kepala Departemen')}" maxlength="80" placeholder="Contoh: Kepala Departemen / Ketua Divisi" required />
                  </label>
                  <label class="form-group">
                    <span class="form-label">GELAR JABATAN SEKRETARIS (SEKDEP / SEKDIV)</span>
                    <input class="form-input" id="dept-form-sekdeptitle" value="${escapeHtml(targetDept.sekdepTitle || 'Sekretaris Departemen')}" maxlength="80" placeholder="Contoh: Sekretaris Departemen / Sekretaris Divisi" required />
                  </label>
                  <label class="form-group">
                    <span class="form-label">NOMOR URUT TAMPILAN</span>
                    <input class="form-input" id="dept-form-order" type="number" min="1" max="100" value="${targetDept.order || 1}" required />
                  </label>
                  <label class="form-group">
                    <span class="form-label">LOGO / EMBLEM DIVISI (FACTION)</span>
                    ${imageSelect('deptEmblem', targetDept.emblem || '', BUILTIN_SITE_IMAGES.factions, { allowEmpty: true, emptyLabel: '-- Tanpa Emblem (Kosongkan) --' })}
                  </label>
                  <div class="studio-emblem-preview-wrap" style="grid-column: 1 / -1;">
                    <div class="studio-emblem-preview-box">
                      <img id="dept-emblem-preview-img" src="${escapeHtml(targetDept.emblem || '')}" alt="Pratinjau Emblem" style="${targetDept.emblem ? '' : 'display: none;'}" />
                      <span id="dept-emblem-preview-none" style="${targetDept.emblem ? 'display: none;' : ''}">[TANPA EMBLEM]</span>
                    </div>
                    <div>
                      <strong style="color: var(--ak-cyan); font-family: var(--font-mono); font-size: 0.85rem;">PRATINJAU EMBLEM DIVISI (FACTION)</strong>
                      <small style="display: block; color: var(--ak-text-dim); margin-top: 0.2rem;">Pilih emblem taktis bawaan atau unggah logo kustom di tab Aset. Emblem dapat dikosongkan secara bebas.</small>
                    </div>
                  </div>
                </div>
                <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem;">
                  <button class="btn-tactical primary" type="button" data-save-department="${escapeHtml(targetDept.id || 'new')}">SIMPAN DEPARTEMEN</button>
                  <button class="btn-tactical" type="button" data-cancel-department>BATAL</button>
                </div>
              </div>
            `;
    }

    // Full Operator Profile Editor Dialog Card
    let opFormHtml = '';
    if (this.editingOperatorId) {
      const isNew = this.editingOperatorId === 'new';
      const targetOp = isNew
        ? {
          id: `op-${Date.now().toString(36)}`,
          name: '',
          nim: '',
          codeName: '',
          role: 'Staff Departemen',
          departmentId: this.defaultDeptForNewOperator || (departments[0]?.id || 'bph'),
          divisionId: departments.find((department) => department.id === this.defaultDeptForNewOperator)?.divisions?.[0]?.id || '',
          roleLevel: 'staff',
          bphRoleId: '',
          division: departments.find((d) => d.id === this.defaultDeptForNewOperator)?.name || 'BPH',
          operatorClass: 'SPECIALIST / CADET',
          rarity: 5,
          avatar: '/assets/silhouette_male.jpg',
          generation: String(new Date().getFullYear()),
          specialty: 'Department Cadre & Operational Management',
          stats: { leadership: 80, coding: 80, strategy: 80, integrity: 85 },
          quote: 'Siap mengemban amanah bagi kemajuan himpunan.'
        }
        : (operators.find((o) => o.id === this.editingOperatorId) || null);

      if (targetOp) {
        opFormHtml = `
                  <div class="studio-dialog-card operator-editor" id="studio-op-form">
                    <h4>${isNew ? '+ BUAT PROFIL OPERATOR BARU' : `✎ EDIT PROFIL: ${escapeHtml(targetOp.name)} (${escapeHtml(targetOp.codeName)})`}</h4>
                    <div class="admin-form-grid">
                      <label class="form-group">
                        <span class="form-label">NAMA LENGKAP</span>
                        <input class="form-input" id="op-form-name" value="${escapeHtml(targetOp.name)}" maxlength="120" required />
                      </label>
                      <label class="form-group">
                        <span class="form-label">NIM</span>
                        <input class="form-input" id="op-form-nim" value="${escapeHtml(targetOp.nim)}" maxlength="32" required />
                      </label>
                      <label class="form-group">
                        <span class="form-label">CODE NAME (TAKTIS)</span>
                        <input class="form-input" id="op-form-codename" value="${escapeHtml(targetOp.codeName)}" maxlength="64" placeholder="FALCON" required />
                      </label>
                      <label class="form-group">
                        <span class="form-label">JABATAN (ROLE TITLE)</span>
                        <input class="form-input" id="op-form-role" value="${escapeHtml(targetOp.role)}" maxlength="120" required />
                      </label>
                      <label class="form-group">
                        <span class="form-label">DEPARTEMEN / DIVISI</span>
                        <select class="form-select" id="op-form-dept">
                          <option value="bph" ${targetOp.departmentId === 'bph' ? 'selected' : ''}>BADAN PENGURUS HARIAN (BPH)</option>
                          ${departments.map((d) => `<option value="${escapeHtml(d.id)}" ${targetOp.departmentId === d.id ? 'selected' : ''}>${escapeHtml(d.name)} (${escapeHtml(d.code)})</option>`).join('')}
                          <option value="unassigned" ${targetOp.departmentId === 'unassigned' ? 'selected' : ''}>-- Belum Ditempatkan (Fungsionaris Bebas) --</option>
                        </select>
                      </label>
                      <label class="form-group">
                        <span class="form-label">PENEMPATAN DIVISI</span>
                        <select class="form-select" id="op-form-division" ${targetOp.departmentId === 'bph' || targetOp.departmentId === 'unassigned' ? 'disabled' : ''}>
                          <option value="">-- Belum ditentukan --</option>
                          ${departments.map((department) => `<optgroup label="${escapeHtml(department.name)}">${(department.divisions || []).map((division) => `<option value="${escapeHtml(division.id)}" data-department-id="${escapeHtml(department.id)}" ${targetOp.divisionId === division.id ? 'selected' : ''}>${escapeHtml(division.name)} (${escapeHtml(division.code || division.id)})</option>`).join('')}</optgroup>`).join('')}
                        </select>
                      </label>
                      <label class="form-group">
                        <span class="form-label">TINGKAT JABATAN (ROLE LEVEL)</span>
                        <select class="form-select" id="op-form-rolelevel">
                          <option value="kadep" ${targetOp.roleLevel === 'kadep' ? 'selected' : ''}>Kadep / Ketua Divisi</option>
                          <option value="sekdep" ${targetOp.roleLevel === 'sekdep' ? 'selected' : ''}>Sekdep / Sekretaris Divisi</option>
                          <option value="staff" ${targetOp.roleLevel === 'staff' ? 'selected' : ''}>Staff / Anggota Divisi</option>
                          <option value="bph_leader" ${targetOp.roleLevel === 'bph_leader' ? 'selected' : ''}>BPH Leader (Kahim / Wakahim)</option>
                          <option value="bph_executive" ${targetOp.roleLevel === 'bph_executive' ? 'selected' : ''}>BPH Executive (Sekum / Bendum)</option>
                        </select>
                      </label>
                      <label class="form-group">
                        <span class="form-label">ANGKATAN</span>
                        <input class="form-input" id="op-form-generation" value="${escapeHtml(targetOp.generation)}" maxlength="8" />
                      </label>
                      <label class="form-group">
                        <span class="form-label">KELAS OPERATOR</span>
                        <input class="form-input" id="op-form-class" value="${escapeHtml(targetOp.operatorClass)}" maxlength="100" placeholder="VANGUARD / LEADER" />
                      </label>
                      <label class="form-group">
                        <span class="form-label">BINTANG / RARITY (1 - 6)</span>
                        <select class="form-select" id="op-form-rarity">
                          ${[6, 5, 4, 3, 2, 1].map((r) => `<option value="${r}" ${targetOp.rarity === r ? 'selected' : ''}>${'★'.repeat(r)} (${r} Stars)</option>`).join('')}
                        </select>
                      </label>
                      <label class="form-group">
                        <span class="form-label">FOTO AVATAR</span>
                        ${imageSelect('opAvatar', targetOp.avatar, [
          { value: '/assets/silhouette_male.jpg', label: 'Siluet Pria Bawaan' },
          { value: '/assets/silhouette_female.jpg', label: 'Siluet Wanita Bawaan' }
        ])}
                      </label>
                    </div>
                    <label class="form-group" style="margin-top: 0.5rem;">
                      <span class="form-label">KOMPETENSI / SPESIALISASI</span>
                      <input class="form-input" id="op-form-specialty" value="${escapeHtml(targetOp.specialty || '')}" maxlength="300" />
                    </label>
                    <label class="form-group">
                      <span class="form-label">KUTIPAN / MOTTO (QUOTE)</span>
                      <textarea class="form-textarea" id="op-form-quote" maxlength="500">${escapeHtml(targetOp.quote || '')}</textarea>
                    </label>
                    <span class="form-label" style="margin-top: 0.75rem; display: block;">STATISTIK OPERATOR (0 - 100)</span>
                    <div class="admin-form-grid">
                      <label class="form-group">
                        <span class="form-label">LEADERSHIP: <output id="op-stat-val-leadership">${targetOp.stats?.leadership ?? 80}</output></span>
                        <input class="form-input" type="range" min="0" max="100" id="op-form-stat-leadership" value="${targetOp.stats?.leadership ?? 80}" />
                      </label>
                      <label class="form-group">
                        <span class="form-label">CODING & TECH: <output id="op-stat-val-coding">${targetOp.stats?.coding ?? 80}</output></span>
                        <input class="form-input" type="range" min="0" max="100" id="op-form-stat-coding" value="${targetOp.stats?.coding ?? 80}" />
                      </label>
                      <label class="form-group">
                        <span class="form-label">STRATEGY: <output id="op-stat-val-strategy">${targetOp.stats?.strategy ?? 80}</output></span>
                        <input class="form-input" type="range" min="0" max="100" id="op-form-stat-strategy" value="${targetOp.stats?.strategy ?? 80}" />
                      </label>
                      <label class="form-group">
                        <span class="form-label">INTEGRITY: <output id="op-stat-val-integrity">${targetOp.stats?.integrity ?? 85}</output></span>
                        <input class="form-input" type="range" min="0" max="100" id="op-form-stat-integrity" value="${targetOp.stats?.integrity ?? 85}" />
                      </label>
                    </div>
                    <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem; flex-wrap: wrap; align-items: center;">
                      <button class="btn-tactical primary" type="button" data-save-operator="${escapeHtml(targetOp.id)}">SIMPAN PROFIL</button>
                      <button class="btn-tactical" type="button" data-cancel-operator>BATAL</button>
                      ${!isNew ? `<button class="btn-tactical danger" type="button" data-delete-operator="${escapeHtml(targetOp.id)}" style="margin-left: auto;">🗑 HAPUS OPERATOR PERMANEN</button>` : ''}
                    </div>
                  </div>
                `;
      }
    }

    // Generation (Angkatan) Add/Edit Form Dialog Card
    let genFormHtml = '';
    if (this.editingGenerationId) {
      const isNew = this.editingGenerationId === 'new';
      const currentYear = String(new Date().getFullYear());
      const targetGen = isNew
        ? {
          id: `gen-${currentYear}`,
          year: currentYear,
          name: '',
          tagline: '',
          description: '',
          status: 'ACTIVE CADETS // 1ST YEAR',
          order: generations.length + 1,
          emblem: '/assets/faction/1.png',
          socials: { instagram: '', tiktok: '', whatsapp: '', linkedin: '', github: '' },
          leadership: {
            ketua: { title: 'Ketua Angkatan (Komti)', operatorId: '', name: '', nim: '', avatar: '/assets/silhouette_male.jpg' },
            wakil: { title: 'Wakil Ketua Angkatan', operatorId: '', name: '', nim: '', avatar: '/assets/silhouette_female.jpg' },
            sekretaris: { title: 'Sekretaris Angkatan', operatorId: '', name: '', nim: '', avatar: '/assets/silhouette_female.jpg' },
            bendahara: { title: 'Bendahara Angkatan', operatorId: '', name: '', nim: '', avatar: '/assets/silhouette_male.jpg' }
          },
          divisions: []
        }
        : (generations.find((g) => g.id === this.editingGenerationId) || null);

      if (targetGen) {
        const soc = targetGen.socials || {};
        genFormHtml = `
                  <div class="studio-dialog-card" id="studio-gen-form">
                    <h4>${isNew ? '+ TAMBAH BATALION ANGKATAN BARU' : `✎ EDIT ANGKATAN ${escapeHtml(targetGen.year)}: ${escapeHtml(targetGen.name)}`}</h4>
                    <div class="admin-form-grid">
                      <label class="form-group">
                        <span class="form-label">TAHUN ANGKATAN (MISAL: 2026)</span>
                        <input class="form-input" id="gen-form-year" value="${escapeHtml(targetGen.year)}" maxlength="16" placeholder="2026" required />
                      </label>
                      <label class="form-group">
                        <span class="form-label">ID SISTEM (HURUF KECIL & STRIP)</span>
                        <input class="form-input" id="gen-form-id" value="${escapeHtml(targetGen.id)}" maxlength="64" placeholder="gen-2026" ${isNew ? '' : 'readonly'} required />
                      </label>
                      <label class="form-group">
                        <span class="form-label">NAMA BATALION / SKUAD ANGKATAN</span>
                        <input class="form-input" id="gen-form-name" value="${escapeHtml(targetGen.name)}" maxlength="120" placeholder="QUANTUM BATTALION" required />
                      </label>
                      <label class="form-group">
                        <span class="form-label">STATUS CADETS // RESIMEN</span>
                        <input class="form-input" id="gen-form-status" value="${escapeHtml(targetGen.status || 'ACTIVE CADETS // 1ST YEAR')}" maxlength="100" placeholder="ACTIVE CADETS // 1ST YEAR" required />
                      </label>
                      <label class="form-group" style="grid-column: 1 / -1;">
                        <span class="form-label">SEMBOYAN / TAGLINE ANGKATAN</span>
                        <input class="form-input" id="gen-form-tagline" value="${escapeHtml(targetGen.tagline || '')}" maxlength="200" placeholder="Contoh: Precision Logic, Unstoppable Force" />
                      </label>
                      <label class="form-group" style="grid-column: 1 / -1;">
                        <span class="form-label">DESKRIPSI BATALION ANGKATAN</span>
                        <textarea class="form-textarea" id="gen-form-desc" maxlength="2000" placeholder="Fokus riset, kekeluargaan, kaderisasi...">${escapeHtml(targetGen.description || '')}</textarea>
                      </label>
                      <label class="form-group">
                        <span class="form-label">NOMOR URUT TAMPILAN</span>
                        <input class="form-input" id="gen-form-order" type="number" min="1" max="100" value="${targetGen.order || 1}" required />
                      </label>
                      <label class="form-group">
                        <span class="form-label">LOGO / EMBLEM ANGKATAN (FACTION)</span>
                        ${imageSelect('genEmblem', targetGen.emblem || '', BUILTIN_SITE_IMAGES.factions, { allowEmpty: true, emptyLabel: '-- Tanpa Emblem (Kosongkan) --' })}
                      </label>
                      <div class="studio-emblem-preview-wrap" style="grid-column: 1 / -1;">
                        <div class="studio-emblem-preview-box">
                          <img id="gen-emblem-preview-img" src="${escapeHtml(targetGen.emblem || '')}" alt="Pratinjau Emblem" style="${targetGen.emblem ? '' : 'display: none;'}" />
                          <span id="gen-emblem-preview-none" style="${targetGen.emblem ? 'display: none;' : ''}">[TANPA EMBLEM]</span>
                        </div>
                        <div>
                          <strong style="color: var(--ak-cyan); font-family: var(--font-mono); font-size: 0.85rem;">PRATINJAU EMBLEM ANGKATAN</strong>
                          <small style="display: block; color: var(--ak-text-dim); margin-top: 0.2rem;">Pilih emblem faksi Arknights bawaan atau gambar kustom dari pustaka aset.</small>
                        </div>
                      </div>
                    </div>

                    <h5 style="margin-top: 1rem; margin-bottom: 0.5rem; color: var(--ak-gold); font-family: var(--font-mono);">TAUTAN MEDIA SOSIAL RESMI ANGKATAN</h5>
                    <div class="admin-form-grid">
                      <label class="form-group">
                        <span class="form-label">INSTAGRAM (URL / HANDLE)</span>
                        <input class="form-input" id="gen-form-ig" value="${escapeHtml(soc.instagram || '')}" maxlength="250" placeholder="https://instagram.com/hmif24_umb" />
                      </label>
                      <label class="form-group">
                        <span class="form-label">TIKTOK (URL / HANDLE)</span>
                        <input class="form-input" id="gen-form-tt" value="${escapeHtml(soc.tiktok || '')}" maxlength="250" placeholder="https://tiktok.com/@algorithm24_umb" />
                      </label>
                      <label class="form-group">
                        <span class="form-label">WHATSAPP (LINK GRUP / KONTAK)</span>
                        <input class="form-input" id="gen-form-wa" value="${escapeHtml(soc.whatsapp || '')}" maxlength="250" placeholder="https://chat.whatsapp.com/..." />
                      </label>
                      <label class="form-group">
                        <span class="form-label">LINKEDIN (COMPANY / GRUP)</span>
                        <input class="form-input" id="gen-form-li" value="${escapeHtml(soc.linkedin || '')}" maxlength="250" placeholder="https://linkedin.com/company/..." />
                      </label>
                      <label class="form-group" style="grid-column: 1 / -1;">
                        <span class="form-label">GITHUB REPOSITORY ORGANISASI ANGKATAN</span>
                        <input class="form-input" id="gen-form-gh" value="${escapeHtml(soc.github || '')}" maxlength="250" placeholder="https://github.com/hmif24-umb" />
                      </label>
                    </div>

                    <div style="display: flex; gap: 0.5rem; margin-top: 1rem; flex-wrap: wrap; align-items: center;">
                      <button class="btn-tactical primary" type="button" data-save-generation="${escapeHtml(targetGen.id)}">SIMPAN BATALION ANGKATAN</button>
                      <button class="btn-tactical" type="button" data-cancel-generation>BATAL</button>
                      ${!isNew ? `<button class="btn-tactical danger" type="button" data-delete-generation="${escapeHtml(targetGen.id)}" style="margin-left: auto;">🗑 HAPUS ANGKATAN PERMANEN</button>` : ''}
                    </div>
                  </div>
                `;
      }
    }

    // Perangkat Divisi Angkatan Editor Form Dialog Card
    let genDivFormHtml = '';
    if (this.editingGenDiv) {
      const { genId, divIndex } = this.editingGenDiv;
      const targetGen = generations.find((g) => g.id === genId);
      if (targetGen) {
        const isNewDiv = divIndex < 0;
        const targetDiv = !isNewDiv && targetGen.divisions?.[divIndex]
          ? targetGen.divisions[divIndex]
          : { id: `div-perangkat-${Date.now().toString(36)}`, name: '', coordinator: '', coordinatorNim: '', coordinatorOperatorId: '', members: [] };
        const linkedCoordinator = operators.find((op) => op.id === targetDiv.coordinatorOperatorId);
        const coordinatorLinkConflict = Boolean(targetDiv.coordinatorOperatorId && !linkedCoordinator);

        genDivFormHtml = `
                  <div class="studio-dialog-card" id="studio-gen-div-form">
                    <h4>${isNewDiv ? `+ TAMBAH PERANGKAT DIVISI (ANGKATAN ${escapeHtml(targetGen.year)})` : `✎ EDIT PERANGKAT: ${escapeHtml(targetDiv.name)}`}</h4>
                    <div class="admin-form-grid">
                      <label class="form-group" style="grid-column: 1 / -1;">
                        <span class="form-label">NAMA PERANGKAT / DIVISI INTERNAL ANGKATAN</span>
                        <input class="form-input" id="gen-div-form-name" value="${escapeHtml(targetDiv.name)}" maxlength="120" placeholder="Contoh: Divisi Akademik & Tutorial Sejawat" required />
                      </label>
                      <label class="form-group" style="grid-column: 1 / -1;">
                        <span class="form-label">IDENTITAS KOORDINATOR</span>
                        <select class="form-select" id="gen-div-form-coordinator-candidate" data-current-operator-id="${escapeHtml(targetDiv.coordinatorOperatorId || '')}">${renderCoordinatorOptions(targetDiv.coordinatorOperatorId, targetDiv.coordinatorAccountId)}</select>
                      </label>
                      <label class="form-group">
                        <span class="form-label">ID SISTEM DIVISI</span>
                        <input class="form-input" id="gen-div-form-id" value="${escapeHtml(targetDiv.id)}" maxlength="64" placeholder="div-akademik-24" ${isNewDiv ? '' : 'readonly'} required />
                      </label>
                      <label class="form-group">
                        <span class="form-label">NAMA KOORDINATOR DIVISI</span>
                        <input class="form-input" id="gen-div-form-coord" value="${escapeHtml(targetDiv.coordinator || '')}" maxlength="120" placeholder="Nama Koordinator" required />
                      </label>
                      <label class="form-group">
                        <span class="form-label">NIM KOORDINATOR</span>
                        <input class="form-input" id="gen-div-form-coord-nim" value="${escapeHtml(targetDiv.coordinatorNim || '')}" maxlength="32" placeholder="NIM koordinator" />
                      </label>
                      <label class="form-group" style="grid-column: 1 / -1;">
                        <span class="form-label">FOTO KOORDINATOR</span>
                        ${inlineImageSelect('genDivCoordinatorAvatar', targetDiv.coordinatorAvatar || linkedCoordinator?.avatar || '/assets/silhouette_male.jpg', [
          { value: '/assets/silhouette_male.jpg', label: 'Siluet Pria Bawaan' },
          { value: '/assets/silhouette_female.jpg', label: 'Siluet Wanita Bawaan' }
        ])}
                      </label>
                      ${coordinatorLinkConflict ? '<div class="studio-link-warning" style="grid-column: 1 / -1;">Operator HMIF tertaut tidak ditemukan. Pilih operator yang valid atau gunakan profil manual.</div>' : ''}
                      <p class="studio-help" style="grid-column: 1 / -1;">Roster anggota dikelola sebagai profil terpisah pada daftar perangkat divisi.</p>
                    </div>
                    <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem;">
                      <button class="btn-tactical primary" type="button" data-save-gen-div="${escapeHtml(genId)}" data-div-index="${divIndex}">SIMPAN PERANGKAT DIVISI</button>
                      <button class="btn-tactical" type="button" data-cancel-gen-div>BATAL</button>
                    </div>
                  </div>
                `;
      }
    }

    // BPH Leader Boxes
    const kahimOp = bphOps.find((operator) => operator.bphRoleId === 'kahim');
    const wakahimOp = bphOps.find((operator) => operator.bphRoleId === 'wakahim');
    const sekumOp = bphOps.find((operator) => operator.bphRoleId === 'sekum');
    const bendumOp = bphOps.find((operator) => operator.bphRoleId === 'bendum');

    const renderBphLeaderBox = (title, op, roleKey) => `
          <div class="studio-leader-box">
            <div class="studio-leader-box-header">
              <span class="studio-role-tag">★ ${escapeHtml(title)}</span>
              <div class="studio-leader-box-tools">
                ${op ? `<button class="btn-tactical" type="button" data-edit-operator="${escapeHtml(op.id)}" title="Edit profil">EDIT</button>` : ''}
                ${op ? `<button class="btn-tactical danger" type="button" data-unassign-bph="${escapeHtml(roleKey)}" title="Lepas jabatan BPH">LEPAS</button>` : ''}
              </div>
            </div>
            ${op ? `
              <div class="studio-leader-profile">
                <img class="studio-avatar-thumb" src="${escapeHtml(op.avatar)}" alt="${escapeHtml(op.name)}" />
                <div class="studio-leader-info">
                  <strong>${escapeHtml(op.name)}</strong>
                  <small>NIM: ${escapeHtml(op.nim)} // ${escapeHtml(op.codeName)}</small>
                </div>
              </div>
            ` : `
              <div class="studio-empty-leader">[Belum Ditetapkan]</div>
            `}
            <select class="form-select studio-bph-select" data-assign-bph="${escapeHtml(roleKey)}">
              ${renderCandidateOptions(op?.id)}
            </select>
          </div>
        `;

    // Department Cards
    const renderDeptCard = (dept, index) => {
      const kadep = operators.find((o) => o.departmentId === dept.id && o.roleLevel === 'kadep')
        || operators.find((o) => o.departmentId === dept.id && (o.role.toLowerCase().includes('kepala') || o.role.toLowerCase().includes('kadep') || o.role.toLowerCase().includes('kadiv')));
      const sekdep = operators.find((o) => o.departmentId === dept.id && o.roleLevel === 'sekdep')
        || operators.find((o) => o.departmentId === dept.id && o !== kadep && (o.role.toLowerCase().includes('sekretaris') || o.role.toLowerCase().includes('sekdep') || o.role.toLowerCase().includes('sekdiv')));
      const staff = operators.filter((o) => o.departmentId === dept.id && o !== kadep && o !== sekdep);
      const kadepTitle = dept.kadepTitle || 'Kepala Departemen';
      const sekdepTitle = dept.sekdepTitle || 'Sekretaris Departemen';
      const divisions = Array.isArray(dept.divisions) ? [...dept.divisions].sort((a, b) => (a.order || 0) - (b.order || 0)) : [];
      const divisionManager = `
                <section class="studio-division-manager" aria-label="Divisi ${escapeHtml(dept.name)}">
                  <div class="studio-subhead-strip">DIVISI DI BAWAH ${escapeHtml(dept.code)}</div>
                  ${divisions.map((division, divisionIndex) => `
                    <div class="studio-division-row">
                      <span class="studio-division-order">${String(divisionIndex + 1).padStart(2, '0')}</span>
                      <label class="form-group"><span class="form-label">NAMA DIVISI</span><input class="form-input" data-division-name value="${escapeHtml(division.name)}" maxlength="120" /></label>
                      <label class="form-group"><span class="form-label">KODE</span><input class="form-input" data-division-code value="${escapeHtml(division.code || '')}" maxlength="32" /></label>
                      <label class="form-group"><span class="form-label">DESKRIPSI</span><input class="form-input" data-division-description value="${escapeHtml(division.description || '')}" maxlength="500" /></label>
                      <div class="studio-division-actions">
                        <button class="btn-tactical" type="button" data-move-division="${escapeHtml(division.id)}" data-dept="${escapeHtml(dept.id)}" data-direction="up" ${divisionIndex === 0 ? 'disabled' : ''} aria-label="Pindahkan divisi ke atas" title="Pindahkan ke atas">↑</button>
                        <button class="btn-tactical" type="button" data-move-division="${escapeHtml(division.id)}" data-dept="${escapeHtml(dept.id)}" data-direction="down" ${divisionIndex === divisions.length - 1 ? 'disabled' : ''} aria-label="Pindahkan divisi ke bawah" title="Pindahkan ke bawah">↓</button>
                        <button class="btn-tactical primary" type="button" data-save-division="${escapeHtml(division.id)}" data-dept="${escapeHtml(dept.id)}">SIMPAN</button>
                        <button class="btn-tactical danger" type="button" data-delete-division="${escapeHtml(division.id)}" data-dept="${escapeHtml(dept.id)}">HAPUS</button>
                      </div>
                    </div>
                  `).join('') || '<p class="studio-help">Belum ada divisi di departemen ini.</p>'}
                  <button class="btn-tactical" type="button" data-add-division="${escapeHtml(dept.id)}">+ TAMBAH DIVISI</button>
                </section>
      `;

      return `
              <div class="studio-dept-card" data-dept-id="${escapeHtml(dept.id)}">
                <div class="studio-dept-header">
                  <div class="studio-dept-title-wrap">
                    ${dept.emblem ? `<img class="studio-dept-emblem" src="${escapeHtml(dept.emblem)}" alt="Emblem ${escapeHtml(dept.code)}" />` : '<span class="studio-dept-no-emblem">[NO EMBLEM]</span>'}
                    <div class="studio-dept-title-info">
                      <span class="studio-dept-badge">#${String(index + 1).padStart(2, '0')} // ${escapeHtml(dept.code)}</span>
                      <span class="studio-dept-name">${escapeHtml(dept.name)}</span>
                    </div>
                  </div>
                  <div class="studio-dept-actions">
                    <button class="btn-tactical" type="button" data-move-dept="${escapeHtml(dept.id)}" data-direction="up" ${index === 0 ? 'disabled' : ''} title="Pindahkan ke atas">↑</button>
                    <button class="btn-tactical" type="button" data-move-dept="${escapeHtml(dept.id)}" data-direction="down" ${index === departments.length - 1 ? 'disabled' : ''} title="Pindahkan ke bawah">↓</button>
                    <button class="btn-tactical" type="button" data-edit-department="${escapeHtml(dept.id)}">EDIT</button>
                    <button class="btn-tactical danger" type="button" data-delete-department="${escapeHtml(dept.id)}">HAPUS</button>
                  </div>
                </div>
                <p class="studio-dept-desc">${escapeHtml(dept.description || 'Pusat operasional dan eksekusi program kerja divisi.')}</p>

                <div class="studio-leadership-grid">
                  <!-- KADEP BOX -->
                  <div class="studio-leader-box">
                    <div class="studio-leader-box-header">
                      <span class="studio-role-tag">★ ${escapeHtml(kadepTitle.toUpperCase())}</span>
                      <div class="studio-leader-box-tools">
                        <button class="btn-tactical" type="button" data-quick-title="kadep" data-dept="${escapeHtml(dept.id)}" title="Ubah gelar posisi ketua">✎ GELAR</button>
                        ${kadep ? `<button class="btn-tactical" type="button" data-unassign-role="kadep" data-dept="${escapeHtml(dept.id)}" title="Lepas jabatan ${escapeHtml(kadepTitle)}">LEPAS</button>` : ''}
                      </div>
                    </div>
                    ${kadep ? `
                      <div class="studio-leader-profile">
                        <img class="studio-avatar-thumb" src="${escapeHtml(kadep.avatar)}" alt="${escapeHtml(kadep.name)}" />
                        <div class="studio-leader-info">
                          <strong>${escapeHtml(kadep.name)}</strong>
                          <small>NIM: ${escapeHtml(kadep.nim)} // ${escapeHtml(kadep.codeName)}</small>
                        </div>
                      </div>
                    ` : `
                      <div class="studio-empty-leader">[Belum Ada ${escapeHtml(kadepTitle)} - Pilih dari Dropdown]</div>
                    `}
                    <select class="form-select" data-assign-role="kadep" data-dept="${escapeHtml(dept.id)}">
                      ${renderCandidateOptions(kadep?.id)}
                    </select>
                  </div>

                  <!-- SEKDEP BOX -->
                  <div class="studio-leader-box">
                    <div class="studio-leader-box-header">
                      <span class="studio-role-tag">★ ${escapeHtml(sekdepTitle.toUpperCase())}</span>
                      <div class="studio-leader-box-tools">
                        <button class="btn-tactical" type="button" data-quick-title="sekdep" data-dept="${escapeHtml(dept.id)}" title="Ubah gelar posisi sekretaris">✎ GELAR</button>
                        ${sekdep ? `<button class="btn-tactical" type="button" data-unassign-role="sekdep" data-dept="${escapeHtml(dept.id)}" title="Lepas jabatan ${escapeHtml(sekdepTitle)}">LEPAS</button>` : ''}
                      </div>
                    </div>
                    ${sekdep ? `
                      <div class="studio-leader-profile">
                        <img class="studio-avatar-thumb" src="${escapeHtml(sekdep.avatar)}" alt="${escapeHtml(sekdep.name)}" />
                        <div class="studio-leader-info">
                          <strong>${escapeHtml(sekdep.name)}</strong>
                          <small>NIM: ${escapeHtml(sekdep.nim)} // ${escapeHtml(sekdep.codeName)}</small>
                        </div>
                      </div>
                    ` : `
                      <div class="studio-empty-leader">[Belum Ada ${escapeHtml(sekdepTitle)} - Pilih dari Dropdown]</div>
                    `}
                    <select class="form-select" data-assign-role="sekdep" data-dept="${escapeHtml(dept.id)}">
                      ${renderCandidateOptions(sekdep?.id)}
                    </select>
                  </div>
                </div>

                <!-- STAFF SECTION -->
                <div class="studio-staff-section">
                  <div class="studio-staff-section-header">
                    <strong>STAFF & KADER OPERASIONAL (${staff.length} Personel)</strong>
                    <button class="btn-tactical" type="button" data-create-operator="${escapeHtml(dept.id)}">+ BUAT OPERATOR BARU</button>
                  </div>
                  ${staff.length > 0 ? `
                    <div class="studio-staff-list">
                      ${staff.map((s) => `
                        <div class="studio-staff-item">
                          <div class="studio-staff-item-info">
                            <img src="${escapeHtml(s.avatar)}" alt="${escapeHtml(s.name)}" />
                            <div>
                              <strong>${escapeHtml(s.name)}</strong>
                              <small>NIM: ${escapeHtml(s.nim)} // ${escapeHtml(s.role)}</small>

                            ${divisionManager}
                            </div>
                          </div>
                          <div class="studio-staff-item-actions">
                            <button class="btn-tactical" type="button" data-edit-operator="${escapeHtml(s.id)}" title="Edit profil">✎</button>
                            <button class="btn-tactical" type="button" data-remove-staff="${escapeHtml(s.id)}" title="Keluarkan dari departemen (pindah ke umum)">✕</button>
                            <button class="btn-tactical danger" type="button" data-delete-operator="${escapeHtml(s.id)}" title="Hapus profil operator permanen">🗑</button>
                          </div>
                        </div>
                      `).join('')}
                    </div>
                  ` : `
                    <p style="font-size: 0.76rem; color: var(--ak-text-dim); margin-bottom: 0.65rem;">Belum ada anggota staf di divisi ini.</p>
                  `}
                  <div class="studio-staff-add-bar">
                    <select class="form-select" data-add-staff-select="${escapeHtml(dept.id)}">
                      ${renderAddStaffOptions(dept.id)}
                    </select>
                    <button class="btn-tactical primary" type="button" data-add-staff-btn="${escapeHtml(dept.id)}">+ TAMBAH STAF</button>
                  </div>
                </div>
              </div>
            `;
    };

    // Generation Card Renderer
    const renderGenCard = (gen, index) => {
      const leadership = gen.leadership || {};
      const divisions = Array.isArray(gen.divisions) ? gen.divisions : [];
      const soc = gen.socials || {};

      const renderGenLeaderBox = (roleKey, defaultTitle) => {
        const leader = leadership[roleKey] || {};
        const title = leader.title || defaultTitle;
        const hasLeader = Boolean(leader.name);
        const linkedOperator = operators.find((op) => op.id === leader.operatorId);
        const linkConflict = Boolean(leader.operatorId && !linkedOperator);

        return `
                  <div class="studio-leader-box">
                    <div class="studio-leader-box-header">
                      <span class="studio-role-tag">★ ${escapeHtml(title.toUpperCase())}</span>
                      <div class="studio-leader-box-tools">
                        <button class="btn-tactical" type="button" data-quick-gen-title="${escapeHtml(roleKey)}" data-gen="${escapeHtml(gen.id)}" title="Ubah gelar posisi">✎ GELAR</button>
                        <button class="btn-tactical" type="button" data-edit-gen-leader-manual="${escapeHtml(roleKey)}" data-gen="${escapeHtml(gen.id)}" title="Sunting nama dan NIM manual">✎ DETAIL</button>
                        ${hasLeader ? `<button class="btn-tactical danger" type="button" data-unassign-gen-role="${escapeHtml(roleKey)}" data-gen="${escapeHtml(gen.id)}" title="Lepas jabatan">LEPAS</button>` : ''}
                      </div>
                    </div>
                    ${hasLeader ? `
                      <div class="studio-leader-profile">
                        <img class="studio-avatar-thumb" src="${escapeHtml(leader.avatar || '/assets/silhouette_male.jpg')}" alt="${escapeHtml(leader.name)}" />
                        <div class="studio-leader-info">
                          <strong>${escapeHtml(leader.name)}</strong>
                          <small>NIM: ${escapeHtml(leader.nim || '-')}</small>
                        </div>
                      </div>
                    ` : `
                      <div class="studio-empty-leader">[Belum Ditetapkan]</div>
                    `}
                    ${linkConflict ? '<div class="studio-link-warning">Operator HMIF tertaut tidak ditemukan. Pilih operator yang valid atau gunakan profil manual.</div>' : ''}
                    <select class="form-select" data-assign-gen-role="${escapeHtml(roleKey)}" data-gen="${escapeHtml(gen.id)}">
                      ${renderCandidateOptions(leader.operatorId, leader.accountId)}
                    </select>
                  </div>
                `;
      };

      const editLeader = this.editingGenLeader?.genId === gen.id ? this.editingGenLeader.roleKey : null;
      const editingLeader = editLeader ? leadership[editLeader] || {} : null;
      const leaderEditorHtml = editingLeader ? `
                <div class="studio-dialog-card" id="studio-gen-leader-form">
                  <h4>EDIT PROFIL PIMPINAN: ${escapeHtml(editingLeader.title || editLeader.toUpperCase())}</h4>
                  <div class="admin-form-grid">
                    <label class="form-group"><span class="form-label">NAMA PERSONEL</span><input class="form-input" id="gen-leader-form-name" value="${escapeHtml(editingLeader.name || '')}" maxlength="120" required /></label>
                    <label class="form-group"><span class="form-label">NIM</span><input class="form-input" id="gen-leader-form-nim" value="${escapeHtml(editingLeader.nim || '')}" maxlength="32" /></label>
                    <label class="form-group" style="grid-column: 1 / -1;"><span class="form-label">FOTO PIMPINAN</span>
                      ${inlineImageSelect('genLeaderAvatar', editingLeader.avatar || '/assets/silhouette_male.jpg', [
        { value: '/assets/silhouette_male.jpg', label: 'Siluet Pria Bawaan' },
        { value: '/assets/silhouette_female.jpg', label: 'Siluet Wanita Bawaan' }
      ])}
                    </label>
                  </div>
                  <div class="studio-form-actions">
                    <button class="btn-tactical primary" type="button" data-save-gen-leader> SIMPAN PROFIL </button>
                    <button class="btn-tactical" type="button" data-cancel-gen-leader>BATAL</button>
                  </div>
                </div>
              ` : '';

      const socialBadges = [
        soc.instagram ? `<span class="studio-soc-tag">IG</span>` : '',
        soc.tiktok ? `<span class="studio-soc-tag">TikTok</span>` : '',
        soc.whatsapp ? `<span class="studio-soc-tag">WA</span>` : '',
        soc.linkedin ? `<span class="studio-soc-tag">LinkedIn</span>` : '',
        soc.github ? `<span class="studio-soc-tag">GitHub</span>` : ''
      ].filter(Boolean).join(' ');

      return `
              <div class="studio-dept-card studio-gen-card" data-gen-id="${escapeHtml(gen.id)}">
                <div class="studio-dept-header">
                  <div class="studio-dept-title-wrap">
                    ${gen.emblem ? `<img class="studio-dept-emblem" src="${escapeHtml(gen.emblem)}" alt="Emblem Angkatan ${escapeHtml(gen.year)}" />` : '<span class="studio-dept-no-emblem">[NO EMBLEM]</span>'}
                    <div class="studio-dept-title-info">
                      <span class="studio-dept-badge cyan">#${String(index + 1).padStart(2, '0')} // ANGKATAN ${escapeHtml(gen.year)} // ${escapeHtml(gen.status || 'CADET CORPS')}</span>
                      <span class="studio-dept-name">${escapeHtml(gen.name)}</span>
                      ${gen.tagline ? `<small style="display: block; color: var(--ak-gold); font-size: 0.75rem;">"${escapeHtml(gen.tagline)}"</small>` : ''}
                    </div>
                  </div>
                  <div class="studio-dept-actions">
                    <button class="btn-tactical" type="button" data-move-gen="${escapeHtml(gen.id)}" data-direction="up" ${index === 0 ? 'disabled' : ''} title="Pindahkan ke atas">↑</button>
                    <button class="btn-tactical" type="button" data-move-gen="${escapeHtml(gen.id)}" data-direction="down" ${index === generations.length - 1 ? 'disabled' : ''} title="Pindahkan ke bawah">↓</button>
                    <button class="btn-tactical" type="button" data-edit-generation="${escapeHtml(gen.id)}">EDIT</button>
                    <button class="btn-tactical danger" type="button" data-delete-generation="${escapeHtml(gen.id)}">HAPUS</button>
                  </div>
                </div>

                <p class="studio-dept-desc">${escapeHtml(gen.description || 'Pusat pembinaan, persatuan, dan koordinasi angkatan di bawah naungan HMIF.')}</p>

                <div style="font-size: 0.75rem; color: var(--ak-text-dim); margin-bottom: 0.75rem;">
                  <strong style="color: var(--ak-cyan);">MEDIA SOSIAL:</strong> ${socialBadges || '<span style="color: var(--ak-text-dim);">[Belum diatur]</span>'}
                </div>

                <div class="studio-subhead-strip">
                  <span>PIMPINAN & PRESEDIUM ANGKATAN ${escapeHtml(gen.year)}</span>
                </div>

                <div class="studio-leadership-grid">
                  ${renderGenLeaderBox('ketua', 'Ketua Angkatan (Komti)')}
                  ${renderGenLeaderBox('wakil', 'Wakil Ketua Angkatan')}
                  ${renderGenLeaderBox('sekretaris', 'Sekretaris Angkatan')}
                  ${renderGenLeaderBox('bendahara', 'Bendahara Angkatan')}
                </div>
                ${leaderEditorHtml}

                <!-- PERANGKAT ANGKATAN SECTION -->
                <div class="studio-staff-section" style="margin-top: 1.25rem;">
                  <div class="studio-staff-section-header">
                    <strong>PERANGKAT DIVISI ANGKATAN (${divisions.length} Divisi)</strong>
                    <button class="btn-tactical cyan" type="button" data-add-gen-div="${escapeHtml(gen.id)}">+ TAMBAH PERANGKAT DIVISI</button>
                  </div>

                  ${divisions.length > 0 ? `
                    <div class="studio-divisions-list" style="display: flex; flex-direction: column; gap: 0.65rem; margin-bottom: 0.75rem;">
                      ${divisions.map((div, dIdx) => `
                        ${(() => {
          const editingMember = this.editingGenMember?.genId === gen.id && this.editingGenMember.divIndex === dIdx
            ? this.editingGenMember.memberIndex
            : null;
          const member = editingMember !== null && editingMember >= 0 ? div.members?.[editingMember] : null;
          const memberName = typeof member === 'string' ? member : member?.name || '';
          const memberAvatar = member && typeof member === 'object' ? member.avatar : '';
          const memberOperatorId = member && typeof member === 'object' ? member.operatorId : '';
          return `
                        <div class="studio-gen-div-row" style="background: rgba(14, 20, 31, 0.7); border: 1px solid var(--ak-border); padding: 0.75rem; clip-path: var(--clip-corner-top-right);">
                          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; flex-wrap: wrap;">
                            <div>
                              <strong style="color: var(--ak-cyan); font-size: 0.88rem;">${escapeHtml(div.name)}</strong>
                              <div style="font-size: 0.78rem; color: var(--ak-text-secondary); margin-top: 0.2rem;">
                                <span>Koordinator: <strong>${escapeHtml(div.coordinator || '-')}</strong> ${div.coordinatorNim ? `(${escapeHtml(div.coordinatorNim)})` : ''}</span>
                              </div>
                            </div>
                            <div style="display: flex; gap: 0.35rem;">
                              <button class="btn-tactical" type="button" data-edit-gen-div="${escapeHtml(gen.id)}" data-div-index="${dIdx}" title="Edit divisi">✎</button>
                              <button class="btn-tactical danger" type="button" data-delete-gen-div="${escapeHtml(gen.id)}" data-div-index="${dIdx}" title="Hapus divisi">🗑</button>
                            </div>
                          </div>

                          <div style="margin-top: 0.6rem; border-top: 1px dashed rgba(45, 62, 90, 0.4); padding-top: 0.5rem;">
                            <span style="font-size: 0.72rem; color: var(--ak-text-dim); font-family: var(--font-mono);">ANGGOTA (${(div.members || []).length}):</span>
                            <div class="cohort-member-chips" style="margin-top: 0.25rem;">
                              ${(div.members || []).map((entry, mIdx) => {
            const isLegacy = typeof entry === 'string';
            const member = isLegacy ? { name: entry, nim: '', avatar: '', operatorId: '' } : entry;
            const linkedOperator = operators.find((operator) => operator.id === member.operatorId);
            return `
                                <span class="cohort-member-chip studio-chip">
                                  ${member.avatar ? `<img src="${escapeHtml(member.avatar)}" alt="" />` : ''}
                                  <span>${escapeHtml(member.name)}${member.nim ? ` · ${escapeHtml(member.nim)}` : ''}${linkedOperator ? ` · HMIF ${escapeHtml(linkedOperator.role)}` : ''}</span>
                                  <button type="button" data-edit-gen-member="${escapeHtml(gen.id)}" data-div-index="${dIdx}" data-member-index="${mIdx}" title="Edit profil anggota">✎</button>
                                  <button type="button" data-remove-gen-member="${escapeHtml(gen.id)}" data-div-index="${dIdx}" data-member-index="${mIdx}" title="Hapus anggota">✕</button>
                                </span>
                              `;
          }).join('') || '<span style="font-size: 0.72rem; color: var(--ak-text-dim);">Belum ada anggota.</span>'}
                            </div>
                            <button class="btn-tactical" type="button" data-add-gen-member-btn="${escapeHtml(gen.id)}" data-div-index="${dIdx}">+ TAMBAH PROFIL ANGGOTA</button>
                            ${editingMember !== null ? `
                              <div class="studio-dialog-card studio-member-editor">
                                <h5>${editingMember < 0 ? 'TAMBAH PROFIL ANGGOTA' : 'EDIT PROFIL ANGGOTA'}</h5>
                                <div class="admin-form-grid">
                                  <label class="form-group"><span class="form-label">NAMA PERSONEL</span><input class="form-input" id="gen-member-form-name" value="${escapeHtml(memberName)}" maxlength="120" required /></label>
                                  <label class="form-group"><span class="form-label">NIM (OPSIONAL)</span><input class="form-input" id="gen-member-form-nim" value="${escapeHtml(member && typeof member === 'object' ? member.nim || '' : '')}" maxlength="32" /></label>
                                  <label class="form-group" style="grid-column: 1 / -1;"><span class="form-label">TAUTAN OPERATOR HMIF (OPSIONAL)</span>
                                    <select class="form-select" id="gen-member-form-operator"><option value="">PROFIL MANDIRI</option>${operators.map((operator) => `<option value="${escapeHtml(operator.id)}" ${memberOperatorId === operator.id ? 'selected' : ''}>${escapeHtml(operator.name)} (${escapeHtml(operator.nim)}) · ${escapeHtml(operator.role)}</option>`).join('')}</select>
                                  </label>
                                  <label class="form-group" style="grid-column: 1 / -1;"><span class="form-label">FOTO ANGGOTA</span>
                                    ${inlineImageSelect('genMemberAvatar', memberAvatar || '/assets/silhouette_male.jpg', [
            { value: '/assets/silhouette_male.jpg', label: 'Siluet Pria Bawaan' },
            { value: '/assets/silhouette_female.jpg', label: 'Siluet Wanita Bawaan' }
          ])}
                                  </label>
                                </div>
                                <div class="studio-form-actions"><button class="btn-tactical primary" type="button" data-save-gen-member>SIMPAN PROFIL</button><button class="btn-tactical" type="button" data-cancel-gen-member>BATAL</button></div>
                              </div>
                            ` : ''}
                          </div>
                        </div>
                          `;
        })()}
                      `).join('')}
                    </div>
                  ` : `
                    <p style="font-size: 0.76rem; color: var(--ak-text-dim); margin-bottom: 0.65rem;">Belum ada perangkat divisi internal angkatan yang terdaftar. Klik "+ TAMBAH PERANGKAT DIVISI" di atas.</p>
                  `}
                </div>
              </div>
            `;
    };

    return `
          <h3>STRUKTUR ORGANISASI & DEPARTEMEN</h3>
          <p class="studio-help">Kelola struktur departemen operasional, tetapkan Kepala Departemen (Kadep), Sekretaris Departemen (Sekdep), dan distribusikan staf secara visual melalui dropdown tanpa menyunting JSON manual.</p>

          <div class="studio-dept-stats">
            <div class="studio-stat-box">
              <span class="studio-stat-label">TOTAL DEPARTEMEN</span>
              <span class="studio-stat-val">${totalDepts} Divisi</span>
            </div>
            <div class="studio-stat-box">
              <span class="studio-stat-label">TOTAL PENGURUS & KADER</span>
              <span class="studio-stat-val">${totalOps} Personel</span>
            </div>
            <div class="studio-stat-box gold">
              <span class="studio-stat-label">BPH & PIMPINAN INTI</span>
              <span class="studio-stat-val">${bphOps.length} Personel</span>
            </div>
            <div class="studio-stat-box cyan">
              <span class="studio-stat-label">BATALION ANGKATAN</span>
              <span class="studio-stat-val">${generations.length} Batalion</span>
            </div>
          </div>

          <div style="display: flex; gap: 0.5rem; margin-bottom: 1.25rem; flex-wrap: wrap;">
            <button class="btn-tactical primary" type="button" data-action="new-department">+ TAMBAH DEPARTEMEN BARU</button>
            <button class="btn-tactical cyan" type="button" data-action="new-generation">+ TAMBAH BATALION ANGKATAN</button>
            <button class="btn-tactical" type="button" data-action="create-global-operator">+ DAFTARKAN OPERATOR BARU</button>
          </div>

          ${deptFormHtml}
          ${opFormHtml}
          ${genFormHtml}
          ${genDivFormHtml}

          <!-- BADAN PENGURUS HARIAN (BPH) SECTION -->
          <div class="studio-dept-card bph-card">
            <div class="studio-dept-header">
              <div class="studio-dept-title-wrap">
                <span class="studio-dept-badge gold">EXECUTIVE COUNCIL // BPH</span>
                <span class="studio-dept-name">BADAN PENGURUS HARIAN</span>
              </div>
            </div>
            <p class="studio-dept-desc">Pimpinan eksekutif tertinggi pemegang mandat konstitusi, penentu arah kebijakan strategis, integritas kepemimpinan, dan tata kelola himpunan.</p>
            <div class="studio-leadership-grid">
              ${renderBphLeaderBox('KETUA HIMPUNAN (KAHIM)', kahimOp, 'kahim')}
              ${renderBphLeaderBox('WAKIL KETUA HIMPUNAN', wakahimOp, 'wakahim')}
              ${renderBphLeaderBox('SEKRETARIS UMUM (SEKUM)', sekumOp, 'sekum')}
              ${renderBphLeaderBox('BENDAHARA UMUM (BENDUM)', bendumOp, 'bendum')}
            </div>
          </div>

          <!-- OPERATIONAL DEPARTMENTS SECTION -->
          <h3 style="margin-top: 1.5rem; margin-bottom: 0.75rem;">DEPARTEMEN & DIVISI OPERASIONAL</h3>
          ${departments.map(renderDeptCard).join('') || '<p>Belum ada departemen yang terdaftar. Klik "+ TAMBAH DEPARTEMEN BARU" di atas.</p>'}

          <!-- STRUKTUR & BATALION ANGKATAN SECTION -->
          <div class="studio-section-divider" style="margin-top: 2rem; margin-bottom: 1.5rem; border-top: 1px dashed var(--ak-border); padding-top: 1.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem;">
              <div>
                <h3 style="margin: 0; color: var(--ak-cyan);">STRUKTUR & BATALION ANGKATAN (COHORTS)</h3>
                <p class="studio-help" style="margin-top: 0.25rem;">Struktur kepengurusan angkatan di bawah naungan Himpunan. Kelola Ketua Angkatan (Komti), Wakil, Sekretaris, Bendahara, logo/emblem faksi, media sosial resmi, dan bagian-bagian perangkat divisi angkatan secara visual.</p>
              </div>
              <button class="btn-tactical cyan" type="button" data-action="new-generation">+ TAMBAH BATALION ANGKATAN</button>
            </div>

            <div class="studio-cohort-list">
              ${generations.map(renderGenCard).join('') || '<p class="empty-state">Belum ada Batalion Angkatan yang terdaftar. Klik "+ TAMBAH BATALION ANGKATAN" di atas.</p>'}
            </div>
          </div>
        `;
  }

  bindDepartmentEvents(form, body) {
    // Stats inputs in operator form
    const statSliders = [
      ['op-form-stat-leadership', 'op-stat-val-leadership'],
      ['op-form-stat-coding', 'op-stat-val-coding'],
      ['op-form-stat-strategy', 'op-stat-val-strategy'],
      ['op-form-stat-integrity', 'op-stat-val-integrity']
    ];
    statSliders.forEach(([sliderId, valId]) => {
      const slider = body.querySelector(`#${sliderId}`);
      const valEl = body.querySelector(`#${valId}`);
      if (slider && valEl) {
        slider.addEventListener('input', () => { valEl.textContent = slider.value; });
      }
    });
    body.querySelector('#op-form-dept')?.addEventListener('change', (event) => {
      const departmentId = event.currentTarget.value;
      const divisionSelect = body.querySelector('#op-form-division');
      if (!divisionSelect) return;
      const dept = (this.config.content.data.departments || []).find((item) => item.id === departmentId);
      divisionSelect.innerHTML = `<option value="">-- Belum ditentukan --</option>${(dept?.divisions || []).map((division) => `<option value="${escapeHtml(division.id)}">${escapeHtml(division.name)} (${escapeHtml(division.code || division.id)})</option>`).join('')}`;
      divisionSelect.disabled = !dept;
    });

    // 1. Action: New Department button
    body.querySelector('[data-action="new-department"]')?.addEventListener('click', () => {
      const collected = this.tryCollectConfig(form, body);
      if (collected) this.config = collected;
      this.editingDepartmentId = 'new';
      this.activeTab = 'departments';
      this.render(body);
      body.querySelector('#studio-dept-form')?.scrollIntoView({ behavior: 'smooth' });
    });

    // 2. Action: Cancel Department
    body.querySelector('[data-cancel-department]')?.addEventListener('click', () => {
      this.editingDepartmentId = null;
      this.render(body);
    });

    // Live Preview for Department Emblem Dropdown
    body.querySelector('[name="deptEmblem"]')?.addEventListener('change', (e) => {
      const val = e.target.value;
      const img = body.querySelector('#dept-emblem-preview-img');
      const none = body.querySelector('#dept-emblem-preview-none');
      if (img && none) {
        if (val) {
          img.src = val;
          img.style.display = 'block';
          none.style.display = 'none';
        } else {
          img.style.display = 'none';
          none.style.display = 'block';
        }
      }
    });

    // 3. Action: Save Department
    body.querySelector('[data-save-department]')?.addEventListener('click', (event) => {
      const isNew = event.currentTarget.dataset.saveDepartment === 'new';
      const codeInput = body.querySelector('#dept-form-code')?.value.trim().toUpperCase() || '';
      const rawIdInput = body.querySelector('#dept-form-id')?.value.trim() || '';
      const nameInput = body.querySelector('#dept-form-name')?.value.trim() || '';
      const descInput = body.querySelector('#dept-form-desc')?.value.trim() || '';
      const responsibilitiesInput = (body.querySelector('#dept-form-responsibilities')?.value || '').split(/\r?\n/).map((item) => item.trim()).filter(Boolean).slice(0, 12);
      const orderInput = parseInt(body.querySelector('#dept-form-order')?.value, 10) || 1;
      const emblemInput = body.querySelector('[name="deptEmblem"]')?.value || '';
      const kadepTitleInput = body.querySelector('#dept-form-kadeptitle')?.value.trim() || 'Kepala Departemen';
      const sekdepTitleInput = body.querySelector('#dept-form-sekdeptitle')?.value.trim() || 'Sekretaris Departemen';

      if (!codeInput) return this.feedback(body, 'KODE DEPARTEMEN WAJIB DIISI.');
      if (!nameInput) return this.feedback(body, 'NAMA DEPARTEMEN WAJIB DIISI.');

      const deptId = isNew
        ? (rawIdInput || `dept-${codeInput.toLowerCase().replace(/[^a-z0-9_-]/g, '')}`)
        : this.editingDepartmentId;

      if (!/^[a-zA-Z0-9_-]+$/.test(deptId)) {
        return this.feedback(body, 'ID DEPARTEMEN HANYA BOLEH BERISI HURUF, ANGKA, DAN STRIP.');
      }

      const departments = this.config.content.data.departments || [];

      // Uniqueness check for code and ID
      const conflictCode = departments.some((d) => d.code.toUpperCase() === codeInput && (isNew || d.id !== deptId));
      if (conflictCode) return this.feedback(body, `KODE DEPARTEMEN ${codeInput} SUDAH DIGUNAKAN.`);

      if (isNew) {
        const conflictId = departments.some((d) => d.id === deptId);
        if (conflictId) return this.feedback(body, `ID DEPARTEMEN ${deptId} SUDAH DIGUNAKAN.`);
        departments.push({
          id: deptId,
          code: codeInput,
          name: nameInput,
          description: descInput,
          responsibilities: responsibilitiesInput,
          order: orderInput,
          emblem: emblemInput,
          kadepTitle: kadepTitleInput,
          sekdepTitle: sekdepTitleInput,
          divisions: [1, 2].map((number) => ({
            id: `${deptId.slice(0, 52)}-div-${number}`,
            code: `DIV-${number}`,
            name: `Divisi ${number}`,
            description: '',
            order: number
          }))
        });
      } else {
        const target = departments.find((d) => d.id === deptId);
        if (target) {
          target.code = codeInput;
          target.name = nameInput;
          target.description = descInput;
          target.responsibilities = responsibilitiesInput;
          target.order = orderInput;
          target.emblem = emblemInput;
          target.kadepTitle = kadepTitleInput;
          target.sekdepTitle = sekdepTitleInput;

          // Update division names and leadership titles of assigned operators
          (this.config.content.data.operators || []).forEach((op) => {
            if (op.departmentId === deptId) {
              op.division = nameInput;
              if (op.roleLevel === 'kadep') {
                op.role = `${kadepTitleInput} ${nameInput}`;
              } else if (op.roleLevel === 'sekdep') {
                op.role = `${sekdepTitleInput} ${nameInput}`;
              }
            }
          });
        }
      }

      this.config.content.data.departments = departments;
      this.config.content.data.identity.divisionsCount = countOrganizationDivisions(departments);
      this.editingDepartmentId = null;
      this.activeTab = 'departments';
      this.render(body);
      this.feedback(body, `DEPARTEMEN ${nameInput} BERHASIL DISIMPAN.`);
    });

    // 4. Action: Edit Department
    body.querySelectorAll('[data-edit-department]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const collected = this.tryCollectConfig(form, body);
        if (collected) this.config = collected;
        this.editingDepartmentId = btn.dataset.editDepartment;
        this.activeTab = 'departments';
        this.render(body);
        body.querySelector('#studio-dept-form')?.scrollIntoView({ behavior: 'smooth' });
      });
    });

    // 5. Action: Delete Department
    body.querySelectorAll('[data-delete-department]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const deptId = btn.dataset.deleteDepartment;
        const departments = this.config.content.data.departments || [];
        const target = departments.find((d) => d.id === deptId);
        if (!target) return;

        if (!window.confirm(`Hapus departemen "${target.name}" (${target.code})?\nPersonel di dalamnya akan dipindahkan ke fungsionaris umum.`)) {
          return;
        }

        // Reassign member operators
        (this.config.content.data.operators || []).forEach((op) => {
          if (op.departmentId === deptId) {
            op.departmentId = 'unassigned';
            op.divisionId = '';
            op.roleLevel = 'staff';
            op.role = 'Kader HMIF';
            op.division = 'Staff Fungsionaris';
          }
        });

        this.config.content.data.departments = departments.filter((d) => d.id !== deptId);
        this.config.content.data.identity.divisionsCount = countOrganizationDivisions(this.config.content.data.departments);
        this.activeTab = 'departments';
        this.render(body);
        this.feedback(body, `DEPARTEMEN ${target.name} BERHASIL DIHAPUS.`);
      });
    });

    // 6. Action: Move Department Up / Down
    body.querySelectorAll('[data-move-dept]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const deptId = btn.dataset.moveDept;
        const direction = btn.dataset.direction;
        const departments = [...(this.config.content.data.departments || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
        const currentIdx = departments.findIndex((d) => d.id === deptId);
        if (currentIdx === -1) return;
        const targetIdx = direction === 'up' ? currentIdx - 1 : currentIdx + 1;
        if (targetIdx < 0 || targetIdx >= departments.length) return;

        [departments[currentIdx], departments[targetIdx]] = [departments[targetIdx], departments[currentIdx]];
        departments.forEach((d, idx) => { d.order = idx + 1; });
        this.config.content.data.departments = departments;
        this.activeTab = 'departments';
        this.render(body);
      });
    });

    body.querySelectorAll('[data-save-division]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const dept = (this.config.content.data.departments || []).find((item) => item.id === btn.dataset.dept);
        const division = dept?.divisions?.find((item) => item.id === btn.dataset.saveDivision);
        const row = btn.closest('.studio-division-row');
        if (!dept || !division || !row) return;
        const name = row.querySelector('[data-division-name]')?.value.trim() || '';
        const code = row.querySelector('[data-division-code]')?.value.trim().toUpperCase() || '';
        const description = row.querySelector('[data-division-description]')?.value.trim() || '';
        if (!name || !code) return this.feedback(body, 'NAMA DAN KODE DIVISI WAJIB DIISI.');
        if (dept.divisions.some((item) => item.id !== division.id && item.code.toUpperCase() === code)) {
          return this.feedback(body, `KODE DIVISI ${code} SUDAH DIGUNAKAN DI ${dept.code}.`);
        }
        division.name = name;
        division.code = code;
        division.description = description;
        (this.config.content.data.operators || []).forEach((operator) => {
          if (operator.divisionId === division.id) operator.division = name;
        });
        this.config.content.data.identity.divisionsCount = countOrganizationDivisions(this.config.content.data.departments);
        this.render(body);
        this.feedback(body, `DIVISI ${name} BERHASIL DISIMPAN.`);
      });
    });

    body.querySelectorAll('[data-add-division]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const dept = (this.config.content.data.departments || []).find((item) => item.id === btn.dataset.addDivision);
        if (!dept) return;
        dept.divisions ||= [];
        dept.divisions.push({
          id: `division-${Date.now().toString(36)}`,
          code: `DIV-${dept.divisions.length + 1}`,
          name: `Divisi ${dept.divisions.length + 1}`,
          description: '',
          order: dept.divisions.length + 1
        });
        this.config.content.data.identity.divisionsCount = countOrganizationDivisions(this.config.content.data.departments);
        this.render(body);
      });
    });

    body.querySelectorAll('[data-delete-division]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const dept = (this.config.content.data.departments || []).find((item) => item.id === btn.dataset.dept);
        const division = dept?.divisions?.find((item) => item.id === btn.dataset.deleteDivision);
        if (!dept || !division) return;
        const assigned = (this.config.content.data.operators || []).filter((operator) => operator.divisionId === division.id);
        if (!window.confirm(`Hapus divisi "${division.name}"? ${assigned.length} pengurus akan tetap di ${dept.name}, tetapi penempatan divisinya dikosongkan.`)) return;
        assigned.forEach((operator) => { operator.divisionId = ''; });
        dept.divisions = dept.divisions.filter((item) => item.id !== division.id);
        dept.divisions.forEach((item, index) => { item.order = index + 1; });
        this.config.content.data.identity.divisionsCount = countOrganizationDivisions(this.config.content.data.departments);
        this.render(body);
        this.feedback(body, `DIVISI ${division.name} BERHASIL DIHAPUS.`);
      });
    });

    body.querySelectorAll('[data-move-division]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const dept = (this.config.content.data.departments || []).find((item) => item.id === btn.dataset.dept);
        if (!dept) return;
        const divisions = [...(dept.divisions || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
        const currentIndex = divisions.findIndex((item) => item.id === btn.dataset.moveDivision);
        const targetIndex = currentIndex + (btn.dataset.direction === 'up' ? -1 : 1);
        if (currentIndex < 0 || targetIndex < 0 || targetIndex >= divisions.length) return;
        [divisions[currentIndex], divisions[targetIndex]] = [divisions[targetIndex], divisions[currentIndex]];
        divisions.forEach((item, index) => { item.order = index + 1; });
        dept.divisions = divisions;
        this.render(body);
      });
    });

    // 7. Action: Assign Kadep or Sekdep via dropdown
    body.querySelectorAll('[data-assign-role]').forEach((select) => {
      select.addEventListener('change', () => {
        const deptId = select.dataset.dept;
        const roleType = select.dataset.assignRole; // 'kadep' | 'sekdep'
        const val = select.value;
        if (!val) return;

        const dept = (this.config.content.data.departments || []).find((d) => d.id === deptId);
        if (!dept) return;

        const roleTitlePrefix = roleType === 'kadep'
          ? (dept.kadepTitle || 'Kepala Departemen')
          : (dept.sekdepTitle || 'Sekretaris Departemen');

        const operators = this.config.content.data.operators || [];

        // Demote old holder if exists
        const oldHolder = operators.find((o) => o.departmentId === deptId && o.roleLevel === roleType);
        if (oldHolder) {
          oldHolder.roleLevel = 'staff';
          oldHolder.role = `Staff ${dept.name}`;
        }

        if (val === '__CLEAR__') {
          this.activeTab = 'departments';
          this.render(body);
          return this.feedback(body, `JABATAN ${roleTitlePrefix.toUpperCase()} ${dept.name} DIKOSONGKAN.`);
        }

        if (val.startsWith('op:')) {
          const opId = val.slice(3);
          const op = operators.find((o) => o.id === opId);
          if (op) {
            op.departmentId = dept.id;
            op.divisionId = '';
            op.roleLevel = roleType;
            op.role = `${roleTitlePrefix} ${dept.name}`;
            op.division = dept.name;
          }
        } else if (val.startsWith('user:')) {
          const nim = val.slice(5);
          const user = this.users.find((u) => String(u.nim) === nim);
          if (user) {
            let op = operators.find((o) => String(o.nim) === nim);
            if (!op) {
              op = {
                id: `op-${nim.toLowerCase().replace(/[^a-z0-9_-]/g, '')}`,
                departmentId: dept.id,
                roleLevel: roleType,
                name: user.name,
                codeName: (user.code_name || user.name.split(' ')[0] || 'CHIEF').toUpperCase().replace(/[^A-Z0-9]/g, ''),
                role: `${roleTitlePrefix} ${dept.name}`,
                division: dept.name,
                rarity: 5,
                operatorClass: 'VANGUARD / LEADER',
                avatar: user.avatar_silhouette || '/assets/silhouette_male.jpg',
                nim: user.nim,
                generation: user.generation || String(new Date().getFullYear()),
                specialty: 'Department Leadership & Operations',
                stats: { leadership: 90, coding: 80, strategy: 85, integrity: 90 },
                quote: 'Mendedikasikan integritas dan kemampuan untuk kemajuan himpunan.'
              };
              operators.push(op);
            } else {
              op.departmentId = dept.id;
              op.divisionId = '';
              op.roleLevel = roleType;
              op.role = `${roleTitlePrefix} ${dept.name}`;
              op.division = dept.name;
            }
          }
        }

        this.config.content.data.operators = operators;
        this.activeTab = 'departments';
        this.render(body);
        this.feedback(body, `PENUGASAN ${roleTitlePrefix.toUpperCase()} UNTUK ${dept.name} DIPERBARUI.`);
      });
    });

    // 8. Action: Unassign role button
    body.querySelectorAll('[data-unassign-role]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const deptId = btn.dataset.dept;
        const roleType = btn.dataset.unassignRole;
        const dept = (this.config.content.data.departments || []).find((d) => d.id === deptId);
        const roleTitlePrefix = roleType === 'kadep'
          ? (dept?.kadepTitle || 'Kepala Departemen')
          : (dept?.sekdepTitle || 'Sekretaris Departemen');
        const operators = this.config.content.data.operators || [];
        const holder = operators.find((o) => o.departmentId === deptId && o.roleLevel === roleType);
        if (holder) {
          holder.roleLevel = 'staff';
          holder.role = dept ? `Staff ${dept.name}` : 'Staff';
        }
        this.config.content.data.operators = operators;
        this.activeTab = 'departments';
        this.render(body);
        this.feedback(body, `JABATAN ${roleTitlePrefix.toUpperCase()} BERHASIL DILEPAS.`);
      });
    });

    // 8b. Action: Quick Edit Leadership Title (Kadep / Sekdep)
    body.querySelectorAll('[data-quick-title]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const roleType = btn.dataset.quickTitle; // 'kadep' | 'sekdep'
        const deptId = btn.dataset.dept;
        const dept = (this.config.content.data.departments || []).find((d) => d.id === deptId);
        if (!dept) return;

        const currentTitle = roleType === 'kadep' ? (dept.kadepTitle || 'Kepala Departemen') : (dept.sekdepTitle || 'Sekretaris Departemen');
        const newTitle = window.prompt(`Kustomisasi Gelar Posisi ${roleType.toUpperCase()} untuk "${dept.name}":\n(Contoh: Ketua Divisi / Kepala Departemen / Koordinator Divisi / Sekretaris Divisi)`, currentTitle);
        if (newTitle === null) return;
        const trimmed = newTitle.trim();
        if (!trimmed) return this.feedback(body, 'GELAR POSISI TIDAK BOLEH KOSONG.');

        if (roleType === 'kadep') {
          dept.kadepTitle = trimmed;
        } else {
          dept.sekdepTitle = trimmed;
        }

        // Update assigned operator's role if exists
        const holder = (this.config.content.data.operators || []).find((o) => o.departmentId === deptId && o.roleLevel === roleType);
        if (holder) {
          holder.role = `${trimmed} ${dept.name}`;
        }

        this.activeTab = 'departments';
        this.render(body);
        this.feedback(body, `GELAR POSISI ${roleType.toUpperCase()} DIUBAH MENJADI "${trimmed}".`);
      });
    });

    // 8c. Action: Unassign BPH Role
    body.querySelectorAll('[data-unassign-bph]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const roleKey = btn.dataset.unassignBph;
        const operators = this.config.content.data.operators || [];
        const currentHolder = operators.find((operator) => operator.bphRoleId === roleKey);
        if (currentHolder) {
          currentHolder.bphRoleId = '';
          currentHolder.roleLevel = 'staff';
          currentHolder.role = 'Fungsionaris BPH';
        }
        this.activeTab = 'departments';
        this.render(body);
        this.feedback(body, 'JABATAN PIMPINAN BPH BERHASIL DILEPAS.');
      });
    });

    // 9. Action: Assign BPH Leaders
    body.querySelectorAll('[data-assign-bph]').forEach((select) => {
      select.addEventListener('change', () => {
        const roleKey = select.dataset.assignBph;
        const val = select.value;
        if (!val) return;

        const roleTitles = {
          kahim: { title: 'Ketua Himpunan (Kahim)', level: 'bph_leader' },
          wakahim: { title: 'Wakil Ketua Himpunan', level: 'bph_leader' },
          sekum: { title: 'Sekretaris Umum', level: 'bph_executive' },
          bendum: { title: 'Bendahara Umum', level: 'bph_executive' }
        };
        const config = roleTitles[roleKey] || { title: 'Pengurus Inti BPH', level: 'bph_executive' };
        const operators = this.config.content.data.operators || [];

        if (val === '__CLEAR__') {
          const currentHolder = operators.find((operator) => operator.bphRoleId === roleKey);
          if (currentHolder) {
            currentHolder.bphRoleId = '';
            currentHolder.roleLevel = 'staff';
            currentHolder.role = 'Fungsionaris BPH';
          }
          this.activeTab = 'departments';
          this.render(body);
          return this.feedback(body, `JABATAN ${config.title.toUpperCase()} DIKOSONGKAN.`);
        }

        let targetOp = null;
        if (val.startsWith('op:')) {
          targetOp = operators.find((o) => o.id === val.slice(3));
        } else if (val.startsWith('user:')) {
          const nim = val.slice(5);
          const user = this.users.find((u) => String(u.nim) === nim);
          if (user) {
            targetOp = operators.find((o) => String(o.nim) === nim);
            if (!targetOp) {
              targetOp = {
                id: `op-${nim.toLowerCase().replace(/[^a-z0-9_-]/g, '')}`,
                departmentId: 'bph',
                roleLevel: config.level,
                name: user.name,
                codeName: (user.code_name || user.name.split(' ')[0] || 'EXEC').toUpperCase().replace(/[^A-Z0-9]/g, ''),
                role: config.title,
                division: 'BPH',
                rarity: 6,
                operatorClass: 'VANGUARD / LEADER',
                avatar: user.avatar_silhouette || '/assets/silhouette_male.jpg',
                nim: user.nim,
                generation: user.generation || String(new Date().getFullYear()),
                specialty: 'High Command & Organizational Strategy',
                stats: { leadership: 95, coding: 85, strategy: 92, integrity: 95 },
                quote: 'Integritas dan kepemimpinan adalah napas perjuangan organisasi.'
              };
              operators.push(targetOp);
            }
          }
        }

        if (targetOp) {
          operators.forEach((operator) => {
            if (operator.bphRoleId === roleKey && operator.id !== targetOp.id) {
              operator.bphRoleId = '';
              operator.roleLevel = 'staff';
              operator.role = 'Fungsionaris BPH';
            }
          });
          targetOp.departmentId = 'bph';
          targetOp.divisionId = '';
          targetOp.roleLevel = config.level;
          targetOp.bphRoleId = roleKey;
          targetOp.role = config.title;
          targetOp.division = 'BPH';

          if (roleKey === 'kahim') {
            this.config.content.data.visionMission.sambutanKahim.leaderName = targetOp.name;
            this.config.content.data.visionMission.sambutanKahim.operatorCode = targetOp.codeName;
          }
        }

        this.config.content.data.operators = operators;
        this.activeTab = 'departments';
        this.render(body);
        this.feedback(body, `JABATAN ${config.title.toUpperCase()} TELAH DITETAPKAN.`);
      });
    });

    // 10. Action: Add Staff button
    body.querySelectorAll('[data-add-staff-btn]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const deptId = btn.dataset.addStaffBtn;
        const select = body.querySelector(`[data-add-staff-select="${deptId}"]`);
        const val = select?.value;
        if (!val) return this.feedback(body, 'PILIH KADER / MAHASISWA DARI DROPDOWN TERLEBIH DAHULU.');

        const dept = (this.config.content.data.departments || []).find((d) => d.id === deptId);
        if (!dept) return;

        const operators = this.config.content.data.operators || [];

        if (val.startsWith('op:')) {
          const op = operators.find((o) => o.id === val.slice(3));
          if (op) {
            op.departmentId = dept.id;
            op.divisionId = '';
            op.roleLevel = 'staff';
            op.role = `Staff ${dept.name}`;
            op.division = dept.name;
          }
        } else if (val.startsWith('user:')) {
          const nim = val.slice(5);
          const user = this.users.find((u) => String(u.nim) === nim);
          if (user) {
            let op = operators.find((o) => String(o.nim) === nim);
            if (!op) {
              op = {
                id: `op-${nim.toLowerCase().replace(/[^a-z0-9_-]/g, '')}`,
                departmentId: dept.id,
                divisionId: '',
                roleLevel: 'staff',
                name: user.name,
                codeName: (user.code_name || user.name.split(' ')[0] || 'CADET').toUpperCase().replace(/[^A-Z0-9]/g, ''),
                role: `Staff ${dept.name}`,
                division: dept.name,
                rarity: 5,
                operatorClass: 'SPECIALIST / CADET',
                avatar: user.avatar_silhouette || '/assets/silhouette_male.jpg',
                nim: user.nim,
                generation: user.generation || String(new Date().getFullYear()),
                specialty: 'Department Cadre & Operational Management',
                stats: { leadership: 78, coding: 82, strategy: 80, integrity: 88 },
                quote: 'Siap berkontribusi aktif dan menjalankan program kerja divisi.'
              };
              operators.push(op);
            } else {
              op.departmentId = dept.id;
              op.divisionId = '';
              op.roleLevel = 'staff';
              op.role = `Staff ${dept.name}`;
              op.division = dept.name;
            }
          }
        }

        this.config.content.data.operators = operators;
        this.activeTab = 'departments';
        this.render(body);
        this.feedback(body, `STAF BERHASIL DITAMBAHKAN KE ${dept.name}.`);
      });
    });

    // 11. Action: Remove Staff
    body.querySelectorAll('[data-remove-staff]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const opId = btn.dataset.removeStaff;
        const operators = this.config.content.data.operators || [];
        const op = operators.find((o) => o.id === opId);
        if (op) {
          op.departmentId = 'unassigned';
          op.divisionId = '';
          op.roleLevel = 'staff';
          op.role = 'Kader HMIF';
          op.division = 'Staff Fungsionaris';
        }
        this.config.content.data.operators = operators;
        this.activeTab = 'departments';
        this.render(body);
        this.feedback(body, `ANGGOTA STAF ${op ? op.name : ''} BERHASIL DILEPAS DARI DEPARTEMEN.`);
      });
    });

    // 12. Action: Create Operator (from dept or global)
    body.querySelectorAll('[data-create-operator], [data-action="create-global-operator"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const collected = this.tryCollectConfig(form, body);
        if (collected) this.config = collected;
        this.defaultDeptForNewOperator = btn.dataset.createOperator || null;
        this.editingOperatorId = 'new';
        this.activeTab = 'departments';
        this.render(body);
        body.querySelector('#studio-op-form')?.scrollIntoView({ behavior: 'smooth' });
      });
    });

    // 13. Action: Edit Operator
    body.querySelectorAll('[data-edit-operator]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const collected = this.tryCollectConfig(form, body);
        if (collected) this.config = collected;
        this.editingOperatorId = btn.dataset.editOperator;
        this.activeTab = 'departments';
        this.render(body);
        body.querySelector('#studio-op-form')?.scrollIntoView({ behavior: 'smooth' });
      });
    });

    // 14. Action: Cancel Operator form
    body.querySelector('[data-cancel-operator]')?.addEventListener('click', () => {
      this.editingOperatorId = null;
      this.render(body);
    });

    // 15. Action: Save Operator profile
    body.querySelector('[data-save-operator]')?.addEventListener('click', () => {
      const name = body.querySelector('#op-form-name')?.value.trim();
      const nim = body.querySelector('#op-form-nim')?.value.trim();
      const codeName = body.querySelector('#op-form-codename')?.value.trim().toUpperCase();
      const role = body.querySelector('#op-form-role')?.value.trim();
      const deptId = body.querySelector('#op-form-dept')?.value;
      const divisionId = body.querySelector('#op-form-division')?.value || '';
      const roleLevel = body.querySelector('#op-form-rolelevel')?.value;
      const generation = body.querySelector('#op-form-generation')?.value.trim() || '2024';
      const operatorClass = body.querySelector('#op-form-class')?.value.trim() || 'SPECIALIST';
      const rarity = parseInt(body.querySelector('#op-form-rarity')?.value, 10) || 5;
      const avatar = body.querySelector('[name="opAvatar"]')?.value || '/assets/silhouette_male.jpg';
      const specialty = body.querySelector('#op-form-specialty')?.value.trim() || '';
      const quote = body.querySelector('#op-form-quote')?.value.trim() || '';

      const stats = {
        leadership: parseInt(body.querySelector('#op-form-stat-leadership')?.value, 10) || 80,
        coding: parseInt(body.querySelector('#op-form-stat-coding')?.value, 10) || 80,
        strategy: parseInt(body.querySelector('#op-form-stat-strategy')?.value, 10) || 80,
        integrity: parseInt(body.querySelector('#op-form-stat-integrity')?.value, 10) || 85
      };

      if (!name) return this.feedback(body, 'NAMA OPERATOR WAJIB DIISI.');
      if (!nim) return this.feedback(body, 'NIM OPERATOR WAJIB DIISI.');
      if (!codeName) return this.feedback(body, 'CODE NAME OPERATOR WAJIB DIISI.');
      if (!role) return this.feedback(body, 'JABATAN OPERATOR WAJIB DIISI.');

      const operators = this.config.content.data.operators || [];
      const departments = this.config.content.data.departments || [];
      const dept = departments.find((d) => d.id === deptId);
      const division = dept?.divisions?.find((item) => item.id === divisionId);
      if (divisionId && !division) return this.feedback(body, 'PILIHAN DIVISI TIDAK SESUAI DENGAN DEPARTEMEN.');
      const divisionName = division?.name || (dept ? dept.name : (deptId === 'bph' ? 'BPH' : 'Staff Umum'));

      if (this.editingOperatorId === 'new') {
        const id = `op-${nim.toLowerCase().replace(/[^a-z0-9_-]/g, '')}`;
        if (operators.some((o) => o.id === id)) {
          return this.feedback(body, `OPERATOR DENGAN NIM ${nim} SUDAH TERDAFTAR.`);
        }
        operators.push({
          id,
          departmentId: deptId,
          divisionId,
          roleLevel,
          name,
          codeName,
          role,
          division: divisionName,
          rarity,
          operatorClass,
          avatar,
          nim,
          generation,
          specialty,
          stats,
          quote
        });
      } else {
        const target = operators.find((o) => o.id === this.editingOperatorId);
        if (target) {
          target.departmentId = deptId;
          target.divisionId = divisionId;
          target.roleLevel = roleLevel;
          if (deptId !== 'bph') target.bphRoleId = '';
          target.name = name;
          target.codeName = codeName;
          target.role = role;
          target.division = divisionName;
          target.rarity = rarity;
          target.operatorClass = operatorClass;
          target.avatar = avatar;
          target.nim = nim;
          target.generation = generation;
          target.specialty = specialty;
          target.stats = stats;
          target.quote = quote;
        }
      }

      this.config.content.data.operators = operators;
      this.editingOperatorId = null;
      this.activeTab = 'departments';
      this.render(body);
      this.feedback(body, `PROFIL OPERATOR ${name} BERHASIL DISIMPAN.`);
    });

    // 16. Action: Permanent Delete Operator
    body.querySelectorAll('[data-delete-operator]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const opId = btn.dataset.deleteOperator;
        const operators = this.config.content.data.operators || [];
        const target = operators.find((o) => o.id === opId);
        if (!target) return;

        const generations = this.config.content.data.generations || [];
        const linkedRoles = Boolean(target.bphRoleId) || generations.some((generation) => {
          const leaders = Object.values(generation.leadership || {});
          return leaders.some((leader) => leader.operatorId === opId)
            || (generation.divisions || []).some((division) => division.coordinatorOperatorId === opId
              || (division.members || []).some((member) => typeof member !== 'string' && member.operatorId === opId));
        });
        if (linkedRoles) return this.feedback(body, 'OPERATOR MASIH TERTAUT KE PROFIL ANGKATAN. LEPAS ATAU GANTI RELASI TERLEBIH DAHULU.');

        if (!window.confirm(`Hapus operator "${target.name}" (${target.codeName}) secara permanen dari basis data organisasi?`)) {
          return;
        }

        this.config.content.data.operators = operators.filter((o) => o.id !== opId);
        if (this.editingOperatorId === opId) {
          this.editingOperatorId = null;
        }
        this.activeTab = 'departments';
        this.render(body);
        this.feedback(body, `OPERATOR ${target.name} BERHASIL DIHAPUS PERMANEN.`);
      });
    });

    // ------------------------------------------------------------------
    // ANGKATAN (COHORT BATTALION) EVENT BINDINGS
    // ------------------------------------------------------------------

    // 17. Action: New Generation Button
    body.querySelector('[data-action="new-generation"]')?.addEventListener('click', () => {
      const collected = this.tryCollectConfig(form, body);
      if (collected) this.config = collected;
      this.editingGenerationId = 'new';
      this.activeTab = 'departments';
      this.render(body);
      body.querySelector('#studio-gen-form')?.scrollIntoView({ behavior: 'smooth' });
    });

    // 18. Action: Cancel Generation Form
    body.querySelector('[data-cancel-generation]')?.addEventListener('click', () => {
      this.editingGenerationId = null;
      this.render(body);
    });

    // 19. Action: Live Preview Generation Emblem
    body.querySelector('[name="genEmblem"]')?.addEventListener('change', (e) => {
      const val = e.target.value;
      const img = body.querySelector('#gen-emblem-preview-img');
      const none = body.querySelector('#gen-emblem-preview-none');
      if (img && none) {
        if (val) {
          img.src = val;
          img.style.display = 'block';
          none.style.display = 'none';
        } else {
          img.src = '';
          img.style.display = 'none';
          none.style.display = 'inline';
        }
      }
    });

    // 20. Action: Save Generation
    body.querySelector('[data-save-generation]')?.addEventListener('click', () => {
      const year = body.querySelector('#gen-form-year')?.value.trim();
      const id = body.querySelector('#gen-form-id')?.value.trim().toLowerCase();
      const name = body.querySelector('#gen-form-name')?.value.trim();
      const tagline = body.querySelector('#gen-form-tagline')?.value.trim() || '';
      const status = body.querySelector('#gen-form-status')?.value.trim() || 'ACTIVE CADETS // 1ST YEAR';
      const description = body.querySelector('#gen-form-desc')?.value.trim() || '';
      const order = parseInt(body.querySelector('#gen-form-order')?.value, 10) || 1;
      const emblem = body.querySelector('[name="genEmblem"]')?.value.trim() || '';

      const socials = {
        instagram: body.querySelector('#gen-form-ig')?.value.trim() || '',
        tiktok: body.querySelector('#gen-form-tt')?.value.trim() || '',
        whatsapp: body.querySelector('#gen-form-wa')?.value.trim() || '',
        linkedin: body.querySelector('#gen-form-li')?.value.trim() || '',
        github: body.querySelector('#gen-form-gh')?.value.trim() || ''
      };

      if (!year) return this.feedback(body, 'TAHUN ANGKATAN WAJIB DIISI.');
      if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) return this.feedback(body, 'ID ANGKATAN TIDAK VALID.');
      if (!name) return this.feedback(body, 'NAMA BATALION ANGKATAN WAJIB DIISI.');

      const generations = this.config.content.data.generations || [];

      if (this.editingGenerationId === 'new') {
        if (generations.some((g) => g.id === id)) {
          return this.feedback(body, `ANGKATAN DENGAN ID "${id}" SUDAH ADA.`);
        }
        generations.push({
          id,
          year,
          name,
          tagline,
          description,
          status,
          emblem,
          order,
          socials,
          leadership: {
            ketua: { title: 'Ketua Angkatan (Komti)', operatorId: '', name: '', nim: '', avatar: '/assets/silhouette_male.jpg' },
            wakil: { title: 'Wakil Ketua Angkatan', operatorId: '', name: '', nim: '', avatar: '/assets/silhouette_female.jpg' },
            sekretaris: { title: 'Sekretaris Angkatan', operatorId: '', name: '', nim: '', avatar: '/assets/silhouette_female.jpg' },
            bendahara: { title: 'Bendahara Angkatan', operatorId: '', name: '', nim: '', avatar: '/assets/silhouette_male.jpg' }
          },
          divisions: []
        });
      } else {
        const target = generations.find((g) => g.id === this.editingGenerationId);
        if (target) {
          target.year = year;
          target.name = name;
          target.tagline = tagline;
          target.description = description;
          target.status = status;
          target.emblem = emblem;
          target.order = order;
          target.socials = socials;
        }
      }

      this.config.content.data.generations = generations;
      this.editingGenerationId = null;
      this.activeTab = 'departments';
      this.render(body);
      this.feedback(body, `BATALION ANGKATAN ${name} BERHASIL DISIMPAN.`);
    });

    // 21. Action: Edit Generation
    body.querySelectorAll('[data-edit-generation]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const genId = btn.dataset.editGeneration;
        const collected = this.tryCollectConfig(form, body);
        if (collected) this.config = collected;
        this.editingGenerationId = genId;
        this.activeTab = 'departments';
        this.render(body);
        body.querySelector('#studio-gen-form')?.scrollIntoView({ behavior: 'smooth' });
      });
    });

    // 22. Action: Delete Generation
    body.querySelectorAll('[data-delete-generation]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const genId = btn.dataset.deleteGeneration;
        const generations = this.config.content.data.generations || [];
        const target = generations.find((g) => g.id === genId);
        if (!target) return;

        if (!window.confirm(`Hapus seluruh Batalion Angkatan ${target.year} ("${target.name}") secara permanen?`)) {
          return;
        }

        this.config.content.data.generations = generations.filter((g) => g.id !== genId);
        if (this.editingGenerationId === genId) this.editingGenerationId = null;
        this.activeTab = 'departments';
        this.render(body);
        this.feedback(body, `BATALION ANGKATAN ${target.name} BERHASIL DIHAPUS.`);
      });
    });

    // 23. Action: Move Generation Order Up / Down
    body.querySelectorAll('[data-move-gen]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const genId = btn.dataset.moveGen;
        const direction = btn.dataset.direction;
        const generations = [...(this.config.content.data.generations || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
        const index = generations.findIndex((g) => g.id === genId);
        if (index === -1) return;

        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= generations.length) return;

        const currentGen = generations[index];
        const otherGen = generations[targetIndex];
        const tempOrder = currentGen.order || (index + 1);
        currentGen.order = otherGen.order || (targetIndex + 1);
        otherGen.order = tempOrder;

        this.config.content.data.generations = generations;
        this.activeTab = 'departments';
        this.render(body);
        this.feedback(body, `URUTAN BATALION ANGKATAN BERHASIL DIPERBARUI.`);
      });
    });

    // 24. Action: Quick Title Edit for Cohort Leadership
    body.querySelectorAll('[data-quick-gen-title]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const roleKey = btn.dataset.quickGenTitle;
        const genId = btn.dataset.gen;
        const generations = this.config.content.data.generations || [];
        const gen = generations.find((g) => g.id === genId);
        if (!gen) return;

        gen.leadership = gen.leadership || {};
        const currentLeader = gen.leadership[roleKey] || {};
        const defaultTitle = roleKey === 'ketua' ? 'Ketua Angkatan (Komti)'
          : roleKey === 'wakil' ? 'Wakil Ketua Angkatan'
            : roleKey === 'sekretaris' ? 'Sekretaris Angkatan'
              : 'Bendahara Angkatan';
        const currentTitle = currentLeader.title || defaultTitle;

        const newTitle = window.prompt(`Masukkan gelar posisi jabatan ${roleKey.toUpperCase()} untuk Angkatan ${gen.year}:`, currentTitle);
        if (newTitle === null) return;
        const trimmed = newTitle.trim();
        if (!trimmed) return this.feedback(body, 'Gelar jabatan tidak boleh kosong.');

        currentLeader.title = trimmed;
        gen.leadership[roleKey] = currentLeader;
        this.config.content.data.generations = generations;
        this.activeTab = 'departments';
        this.render(body);
        this.feedback(body, `GELAR JABATAN DIPERBARUI MENJADI "${trimmed}".`);
      });
    });

    // 25. Action: Manual Edit Detail for Cohort Leader
    body.querySelectorAll('[data-edit-gen-leader-manual]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.editingGenLeader = { genId: btn.dataset.gen, roleKey: btn.dataset.editGenLeaderManual };
        this.render(body);
        body.querySelector('#studio-gen-leader-form')?.scrollIntoView({ behavior: 'smooth' });
      });
    });

    body.querySelector('[data-cancel-gen-leader]')?.addEventListener('click', () => {
      this.editingGenLeader = null;
      this.render(body);
    });

    body.querySelector('[data-save-gen-leader]')?.addEventListener('click', () => {
      const { genId, roleKey } = this.editingGenLeader || {};
      const generation = (this.config.content.data.generations || []).find((item) => item.id === genId);
      const name = body.querySelector('#gen-leader-form-name')?.value.trim();
      if (!generation || !name) return this.feedback(body, 'NAMA PIMPINAN WAJIB DIISI.');
      const leader = generation.leadership[roleKey];
      leader.operatorId = '';
      leader.accountId = '';
      leader.name = name;
      leader.nim = body.querySelector('#gen-leader-form-nim')?.value.trim() || '';
      leader.avatar = body.querySelector('[name="genLeaderAvatar"]')?.value || '';
      this.editingGenLeader = null;
      this.render(body);
      this.feedback(body, `PROFIL PIMPINAN ${roleKey.toUpperCase()} DIPERBARUI.`);
    });

    // 26. Action: Unassign Cohort Role
    body.querySelectorAll('[data-unassign-gen-role]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const roleKey = btn.dataset.unassignGenRole;
        const genId = btn.dataset.gen;
        const generations = this.config.content.data.generations || [];
        const gen = generations.find((g) => g.id === genId);
        if (!gen) return;

        gen.leadership = gen.leadership || {};
        if (gen.leadership[roleKey]) {
          gen.leadership[roleKey].operatorId = '';
          gen.leadership[roleKey].accountId = '';
          gen.leadership[roleKey].name = '';
          gen.leadership[roleKey].nim = '';
          gen.leadership[roleKey].avatar = '';
        }

        this.config.content.data.generations = generations;
        this.activeTab = 'departments';
        this.render(body);
        this.feedback(body, `JABATAN ${roleKey.toUpperCase()} ANGKATAN ${gen.year} BERHASIL DIKOSONGKAN.`);
      });
    });

    // 27. Action: Assign Cohort Role from Dropdown
    body.querySelectorAll('[data-assign-gen-role]').forEach((select) => {
      select.addEventListener('change', () => {
        const roleKey = select.dataset.assignGenRole;
        const genId = select.dataset.gen;
        const selectedVal = select.value;
        const generations = this.config.content.data.generations || [];
        const gen = generations.find((g) => g.id === genId);
        if (!gen) return;

        gen.leadership = gen.leadership || {};
        const leader = gen.leadership[roleKey] || {};

        if (selectedVal === '__CLEAR__') {
          leader.operatorId = '';
          leader.accountId = '';
          leader.name = '';
          leader.nim = '';
          leader.avatar = '';
        } else if (selectedVal.startsWith('op:')) {
          const opId = selectedVal.slice(3);
          const operators = this.config.content.data.operators || [];
          const op = operators.find((o) => o.id === opId);
          if (op) {
            leader.operatorId = op.id;
            leader.accountId = '';
            leader.name = op.name;
            leader.nim = op.nim;
            leader.avatar = op.avatar;
          }
        } else if (selectedVal.startsWith('user:')) {
          const nim = selectedVal.slice(5);
          const user = this.users.find((u) => String(u.nim) === String(nim));
          if (user) {
            leader.operatorId = '';
            leader.accountId = user.account_id || '';
            leader.name = user.name;
            leader.nim = user.nim;
            leader.avatar = user.avatar_silhouette || (roleKey === 'sekretaris' || roleKey === 'wakil' ? '/assets/silhouette_female.jpg' : '/assets/silhouette_male.jpg');
          }
        }

        gen.leadership[roleKey] = leader;
        this.config.content.data.generations = generations;
        this.activeTab = 'departments';
        this.render(body);
        this.feedback(body, `PENUGASAN ${roleKey.toUpperCase()} ANGKATAN ${gen.year} BERHASIL DIPERBARUI.`);
      });
    });

    // 28. Action: Add Perangkat Divisi Button
    body.querySelectorAll('[data-add-gen-div]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const genId = btn.dataset.addGenDiv;
        this.editingGenDiv = { genId, divIndex: -1 };
        this.activeTab = 'departments';
        this.render(body);
        body.querySelector('#studio-gen-div-form')?.scrollIntoView({ behavior: 'smooth' });
      });
    });

    // 29. Action: Edit Perangkat Divisi Button
    body.querySelectorAll('[data-edit-gen-div]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const genId = btn.dataset.editGenDiv;
        const divIndex = parseInt(btn.dataset.divIndex, 10);
        this.editingGenDiv = { genId, divIndex };
        this.activeTab = 'departments';
        this.render(body);
        body.querySelector('#studio-gen-div-form')?.scrollIntoView({ behavior: 'smooth' });
      });
    });

    // 30. Action: Cancel Perangkat Divisi Form
    body.querySelector('[data-cancel-gen-div]')?.addEventListener('click', () => {
      this.editingGenDiv = null;
      this.render(body);
    });

    body.querySelector('#gen-div-form-coordinator-candidate')?.addEventListener('change', (event) => {
      const value = event.currentTarget.value;
      let candidate = null;
      if (value.startsWith('op:')) candidate = (this.config.content.data.operators || []).find((op) => op.id === value.slice(3));
      if (value.startsWith('user:')) candidate = this.users.find((user) => String(user.nim) === value.slice(5));
      if (candidate) {
        if (value.startsWith('op:')) {
          const currentName = body.querySelector('#gen-div-form-coord').value.trim();
          const currentNim = body.querySelector('#gen-div-form-coord-nim').value.trim();
          if ((currentName && currentName !== candidate.name) || (currentNim && currentNim !== String(candidate.nim))) {
            const confirmed = window.confirm(`Tautkan ${candidate.name} (${candidate.nim}) sebagai koordinator? Profil koordinator saat ini akan diganti dengan profil Operator HMIF.`);
            if (!confirmed) {
              event.currentTarget.value = event.currentTarget.dataset.currentOperatorId
                ? `op:${event.currentTarget.dataset.currentOperatorId}`
                : '';
              return;
            }
          }
        }
        body.querySelector('#gen-div-form-coord').value = candidate.name;
        body.querySelector('#gen-div-form-coord-nim').value = candidate.nim;
        const avatar = value.startsWith('op:') ? candidate.avatar : candidate.avatar_silhouette;
        const avatarSelect = body.querySelector('[name="genDivCoordinatorAvatar"]');
        if (avatar && avatarSelect && [...avatarSelect.options].some((option) => option.value === avatar)) avatarSelect.value = avatar;
      }
    });

    // 31. Action: Save Perangkat Divisi Form
    body.querySelector('[data-save-gen-div]')?.addEventListener('click', () => {
      const genId = body.querySelector('[data-save-gen-div]').dataset.saveGenDiv;
      const divIndex = parseInt(body.querySelector('[data-save-gen-div]').dataset.divIndex, 10);

      const name = body.querySelector('#gen-div-form-name')?.value.trim();
      const id = body.querySelector('#gen-div-form-id')?.value.trim().toLowerCase();
      let coordinator = body.querySelector('#gen-div-form-coord')?.value.trim();
      let coordinatorNim = body.querySelector('#gen-div-form-coord-nim')?.value.trim() || '';
      const coordinatorCandidate = body.querySelector('#gen-div-form-coordinator-candidate')?.value || '';
      const coordinatorAvatar = body.querySelector('[name="genDivCoordinatorAvatar"]')?.value || '';

      if (!name) return this.feedback(body, 'NAMA PERANGKAT DIVISI WAJIB DIISI.');
      if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) return this.feedback(body, 'ID DIVISI TIDAK VALID.');
      if (!coordinator) return this.feedback(body, 'NAMA KOORDINATOR WAJIB DIISI.');

      const generations = this.config.content.data.generations || [];
      const gen = generations.find((g) => g.id === genId);
      if (!gen) return;

      let coordinatorOperatorId = '';
      let coordinatorAccountId = '';
      if (coordinatorCandidate.startsWith('op:')) {
        const operator = (this.config.content.data.operators || []).find((item) => item.id === coordinatorCandidate.slice(3));
        if (!operator) return this.feedback(body, 'OPERATOR HMIF TIDAK DITEMUKAN. PILIH ULANG IDENTITAS KOORDINATOR.');
        if ((coordinator !== operator.name || coordinatorNim !== String(operator.nim))
          && !window.confirm(`Tautkan ${operator.name} (${operator.nim}) sebagai koordinator? Profil koordinator saat ini akan diganti dengan profil Operator HMIF.`)) {
          return;
        }
        coordinator = operator.name;
        coordinatorNim = String(operator.nim);
        coordinatorOperatorId = operator.id;
      } else if (coordinatorCandidate.startsWith('user:')) {
        const user = this.users.find((item) => String(item.nim) === coordinatorCandidate.slice(5));
        if (!user) return this.feedback(body, 'KADER TIDAK DITEMUKAN. PILIH ULANG IDENTITAS KOORDINATOR.');
        coordinatorAccountId = user.account_id || '';
      }

      gen.divisions = Array.isArray(gen.divisions) ? gen.divisions : [];

      if (divIndex < 0) {
        gen.divisions.push({
          id,
          name,
          coordinator,
          coordinatorNim,
          coordinatorOperatorId,
          coordinatorAccountId,
          coordinatorAvatar,
          members: []
        });
      } else if (gen.divisions[divIndex]) {
        gen.divisions[divIndex].name = name;
        gen.divisions[divIndex].coordinator = coordinator;
        gen.divisions[divIndex].coordinatorNim = coordinatorNim;
        gen.divisions[divIndex].coordinatorOperatorId = coordinatorOperatorId;
        gen.divisions[divIndex].coordinatorAccountId = coordinatorAccountId;
        gen.divisions[divIndex].coordinatorAvatar = coordinatorAvatar;
      }

      this.config.content.data.generations = generations;
      this.editingGenDiv = null;
      this.activeTab = 'departments';
      this.render(body);
      this.feedback(body, `PERANGKAT DIVISI "${name}" ANGKATAN ${gen.year} BERHASIL DISIMPAN.`);
    });

    // 32. Action: Delete Perangkat Divisi
    body.querySelectorAll('[data-delete-gen-div]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const genId = btn.dataset.deleteGenDiv;
        const divIndex = parseInt(btn.dataset.divIndex, 10);
        const generations = this.config.content.data.generations || [];
        const gen = generations.find((g) => g.id === genId);
        if (!gen || !gen.divisions?.[divIndex]) return;

        const divName = gen.divisions[divIndex].name;
        if (!window.confirm(`Hapus perangkat divisi "${divName}" dari Angkatan ${gen.year}?`)) {
          return;
        }

        gen.divisions.splice(divIndex, 1);
        this.config.content.data.generations = generations;
        this.activeTab = 'departments';
        this.render(body);
        this.feedback(body, `PERANGKAT DIVISI "${divName}" BERHASIL DIHAPUS.`);
      });
    });

    // 33. Action: Add or edit structured member profile
    body.querySelectorAll('[data-add-gen-member-btn]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.editingGenMember = {
          genId: btn.dataset.addGenMemberBtn,
          divIndex: parseInt(btn.dataset.divIndex, 10),
          memberIndex: -1
        };
        this.render(body);
        body.querySelector('.studio-member-editor')?.scrollIntoView({ behavior: 'smooth' });
      });
    });

    body.querySelectorAll('[data-edit-gen-member]').forEach((btn) => btn.addEventListener('click', () => {
      this.editingGenMember = {
        genId: btn.dataset.editGenMember,
        divIndex: parseInt(btn.dataset.divIndex, 10),
        memberIndex: parseInt(btn.dataset.memberIndex, 10)
      };
      this.render(body);
      body.querySelector('.studio-member-editor')?.scrollIntoView({ behavior: 'smooth' });
    }));

    body.querySelector('#gen-member-form-operator')?.addEventListener('change', (event) => {
      const operator = (this.config.content.data.operators || []).find((item) => item.id === event.currentTarget.value);
      if (!operator) return;
      body.querySelector('#gen-member-form-name').value = operator.name;
      body.querySelector('#gen-member-form-nim').value = operator.nim;
      const avatarSelect = body.querySelector('[name="genMemberAvatar"]');
      if (avatarSelect && [...avatarSelect.options].some((option) => option.value === operator.avatar)) avatarSelect.value = operator.avatar;
    });

    body.querySelector('[data-cancel-gen-member]')?.addEventListener('click', () => {
      this.editingGenMember = null;
      this.render(body);
    });

    body.querySelector('[data-save-gen-member]')?.addEventListener('click', () => {
      const { genId, divIndex, memberIndex } = this.editingGenMember || {};
      const generation = (this.config.content.data.generations || []).find((item) => item.id === genId);
      const division = generation?.divisions?.[divIndex];
      const name = body.querySelector('#gen-member-form-name')?.value.trim();
      if (!division || !name) return this.feedback(body, 'NAMA ANGGOTA WAJIB DIISI.');
      const member = {
        id: memberIndex >= 0 && typeof division.members[memberIndex] === 'object'
          ? division.members[memberIndex].id
          : `person-${Date.now().toString(36)}`,
        name,
        nim: body.querySelector('#gen-member-form-nim')?.value.trim() || '',
        avatar: body.querySelector('[name="genMemberAvatar"]')?.value || '',
        operatorId: body.querySelector('#gen-member-form-operator')?.value || ''
      };
      division.members = Array.isArray(division.members) ? division.members : [];
      if (memberIndex < 0) division.members.push(member);
      else division.members[memberIndex] = member;
      this.editingGenMember = null;
      this.render(body);
      this.feedback(body, `PROFIL ANGGOTA "${name}" DISIMPAN.`);
    });

    // 34. Action: Remove Member from Perangkat Divisi
    body.querySelectorAll('[data-remove-gen-member]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const genId = btn.dataset.removeGenMember;
        const divIndex = parseInt(btn.dataset.divIndex, 10);
        const memberIndex = parseInt(btn.dataset.memberIndex, 10);

        const generations = this.config.content.data.generations || [];
        const gen = generations.find((g) => g.id === genId);
        if (!gen || !gen.divisions?.[divIndex]?.members) return;

        const member = gen.divisions[divIndex].members[memberIndex];
        if (typeof member === 'object' && member.operatorId) {
          return this.feedback(body, 'LEPAS TAUTAN OPERATOR HMIF DARI PROFIL ANGGOTA SEBELUM MENGHAPUS PERSONEL.');
        }
        const removedName = typeof member === 'string' ? member : member.name;
        gen.divisions[divIndex].members.splice(memberIndex, 1);

        this.config.content.data.generations = generations;
        this.activeTab = 'departments';
        this.render(body);
        this.feedback(body, `ANGGOTA "${removedName}" DIKELUARKAN DARI DIVISI.`);
      });
    });
  }

  collectConfig(form) {
    const config = structuredClone(this.config);
    for (const input of form.querySelectorAll('[name^="color."]')) {
      const [, palette, key] = input.name.split('.');
      config.theme[palette === 'light' ? 'lightColors' : 'colors'][key] = input.value;
    }
    config.theme.fonts = { body: form.elements['font.body'].value, heading: form.elements['font.heading'].value, mono: form.elements['font.mono'].value };
    config.theme.typeScale = Number(form.elements.typeScale.value);
    config.theme.shape = form.elements.shape.value;
    config.theme.iconStyle = form.elements.iconStyle.value;
    const backgroundImage = form.elements.backgroundImage.value;
    const backgroundAssetId = /^\/api\/site\/assets\/([a-f0-9-]{36})\/file$/.exec(backgroundImage)?.[1] || null;
    config.theme.background = {
      mode: form.elements.backgroundMode.value,
      image: backgroundImage,
      assetId: backgroundAssetId
    };
    config.theme.heroImage = form.elements.heroImage.value;
    config.theme.contrast = form.elements.contrast.value;
    config.theme.motion = form.elements.motion.checked;
    config.theme.dust = {
      density: Number(form.elements.dustDensity.value),
      opacity: Number(form.elements.dustOpacity.value)
    };
    config.pages = config.pages.map((page) => ({
      ...page,
      visible: form.elements[`visible.${page.id}`].checked,
      layout: form.elements[`layout.${page.id}`].value
    }));
    config.content.heroEyebrow = form.elements.heroEyebrow.value;
    config.content.heroLead = form.elements.heroLead.value;
    config.content.heroActions = config.content.heroActions.map((_, index) => form.elements[`heroAction.${index}`].value);
    config.content.statLabels = Object.fromEntries(Object.keys(config.content.statLabels).map((key) => [key, form.elements[`statLabel.${key}`].value]));
    config.content.sectionDescriptions = Object.fromEntries(Object.keys(config.content.sectionDescriptions).map((key) => [key, form.elements[`description.${key}`].value]));
    config.content.governanceDocumentAccess = Object.fromEntries(['edit', 'ratify'].map((action) => [
      action,
      {
        clearance: Number(form.elements[`governanceDocumentAccess.${action}.clearance`].value),
        capability: form.elements[`governanceDocumentAccess.${action}.capability`].value
      }
    ]));
    config.content.customPages = (this.config.content.customPages || []).map((page, pageIndex) => ({
      ...page,
      title: form.elements[`customPage.${pageIndex}.title`].value,
      slug: form.elements[`customPage.${pageIndex}.slug`].value,
      description: form.elements[`customPage.${pageIndex}.description`].value,
      layout: form.elements[`customPage.${pageIndex}.layout`].value,
      visible: form.elements[`customPage.${pageIndex}.visible`].checked,
      blocks: page.blocks.map((block, blockIndex) => {
        const type = form.elements[`customPage.${pageIndex}.block.${blockIndex}.type`].value;
        const nextBlock = {
          type,
          title: form.elements[`customPage.${pageIndex}.block.${blockIndex}.title`].value,
          body: form.elements[`customPage.${pageIndex}.block.${blockIndex}.body`].value
        };
        if (type === 'notice') {
          nextBlock.tone = form.elements[`customPage.${pageIndex}.block.${blockIndex}.tone`]?.value || 'info';
        }
        return nextBlock;
      })
    }));
    config.content.siteMapNodes = (this.config.content.siteMapNodes || []).map((node) => {
      if (node.type === 'group') {
        return {
          ...node,
          title: form.elements[`siteMapNode.${node.id}.title`]?.value ?? node.title
        };
      }
      return {
        ...node,
        parentId: form.elements[`siteMapParent.${node.id}`]?.value ?? node.parentId ?? ''
      };
    });
    const siteMapNodeIds = new Set(config.content.siteMapNodes.map(({ id }) => id));
    for (const page of config.content.customPages) {
      const id = `custom-${page.id}`;
      if (!siteMapNodeIds.has(id)) {
        config.content.siteMapNodes.push({ id, type: 'page', parentId: '' });
        siteMapNodeIds.add(id);
      }
    }
    config.content.sidebarOrder = [...form.querySelectorAll('[data-sidebar-order-item]')]
      .map((item) => item.dataset.sidebarOrderItem);
    const pagesById = new Map(config.pages.map((page) => [page.id, page]));
    config.pages = config.content.sidebarOrder
      .filter((id) => pagesById.has(id))
      .map((id) => pagesById.get(id));
    const customPagesByNavId = new Map(config.content.customPages.map((page) => [`custom-${page.id}`, page]));
    config.content.customPages = config.content.sidebarOrder
      .filter((id) => customPagesByNavId.has(id))
      .map((id) => customPagesByNavId.get(id));
    const identity = { ...config.content.data.identity };
    if (form.elements['identity.logo']) identity.logo = form.elements['identity.logo'].value;
    for (const key of Object.keys(identity)) {
      const field = form.elements[`identity.${key}`];
      if (field) identity[key] = key === 'divisionsCount' || key === 'prokerCount' ? Number(field.value) : field.value;
    }
    identity.divisionsCount = countOrganizationDivisions(this.config.content.data.departments || []);

    const welcome = Object.fromEntries(['leaderName', 'role', 'period', 'operatorCode', 'quote'].map((key) => [key, form.elements[`welcome.${key}`]?.value ?? '']));
    const collections = Object.fromEntries(['news', 'doctrine', 'knowledgeResources'].map((key) => {
      try {
        const element = form.elements[`collection.${key}`];
        if (!element) return [key, config.content.data[key] || []];
        return [key, JSON.parse(element.value)];
      } catch {
        throw new Error(`JSON koleksi ${key} tidak valid.`);
      }
    }));
    const organizationStructure = structuredClone(this.config.content.data.organizationStructure || { people: [], terms: [] });
    const readOrganizationFields = (records, prefix, fields) => records.forEach((record, index) => {
      for (const [field, type] of Object.entries(fields)) {
        const control = form.elements[`${prefix}.${index}.${field}`];
        if (!control) continue;
        if (type === 'checkbox') record[field] = control.checked;
        else if (type === 'number') record[field] = Number(control.value);
        else if (type === 'nullable') record[field] = control.value || null;
        else record[field] = control.value;
      }
    });
    readOrganizationFields(organizationStructure.people, 'organization.person', {
      name: 'text', accountId: 'nullable', isPublic: 'checkbox'
    });
    readOrganizationFields(organizationStructure.terms, 'organization.term', {
      name: 'text', startDate: 'text', endDate: 'nullable', status: 'text'
    });
    organizationStructure.terms.forEach((term, termIndex) => {
      readOrganizationFields(term.units, `organization.unit.${termIndex}`, {
        parentUnitId: 'nullable', name: 'text', code: 'text', description: 'text'
      });
      readOrganizationFields(term.positions, `organization.position.${termIndex}`, {
        unitId: 'text', title: 'text', code: 'text', maxOccupants: 'number', required: 'checkbox'
      });
      readOrganizationFields(term.assignments, `organization.assignment.${termIndex}`, {
        personId: 'text', positionId: 'text', startDate: 'text', endDate: 'nullable', kind: 'text'
      });
    });
    config.content.data = {
      identity,
      visionMission: {
        vision: form.elements.vision.value,
        mission: form.elements.missions.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
        sambutanKahim: welcome
      },
      departments: structuredClone(this.config.content.data.departments || []),
      organizationStructure,
      generations: structuredClone(this.config.content.data.generations || []),
      operators: structuredClone(this.config.content.data.operators || []),
      campusMap: collectCampusMapForm(form, config.content.data.campusMap || { navigationLabel: 'Peta Kampus', summary: '', publicWidgetVisible: true, defaultZoom: 17, campuses: [] }),
      universityOrganization: collectUniversityOrganizationForm(form, this.config.content.data.universityOrganization || { structures: [] }),
      ...collections
    };
    for (const page of config.pages) {
      if (page.id !== 'dashboard') config.content.sectionTitles[page.id] = form.elements[`title.${page.id}`].value;
    }
    return config;
  }

  tryCollectConfig(form, body) {
    try {
      return this.collectConfig(form);
    } catch (error) {
      this.feedback(body, error.message || 'Konten terstruktur tidak valid.');
      return null;
    }
  }

  updateContrast(form) {
    const readPalette = (mode) => Object.fromEntries(
      [...form.querySelectorAll(`[name^="color.${mode}."]`)]
        .map((input) => [input.name.slice(`color.${mode}.`.length), input.value])
    );
    const palettes = [
      ['GELAP', getPaletteContrast(readPalette('dark'))],
      ['CERAH', getPaletteContrast(readPalette('light'))]
    ];
    const status = form.querySelector('[data-contrast-check]');
    status.textContent = palettes.map(([label, contrast]) => (
      `${label} · TEKS ${contrast.text.toFixed(2)}:1 / SEKUNDER ${contrast.secondary.toFixed(2)}:1 / AKSEN-STATUS ${contrast.accents.map((ratio) => `${ratio.toFixed(2)}:1`).join(' · ')} ${contrast.pass ? 'OK' : 'RENDAH'}`
    )).join(' // ');
    status.dataset.pass = String(palettes.every(([, contrast]) => contrast.pass));
  }

  feedback(body, message) {
    const target = body?.querySelector('[data-studio-feedback]');
    if (target) target.textContent = message;
  }

  async saveDraft(form, body) {
    const collected = this.tryCollectConfig(form, body);
    if (!collected) return false;
    const invalidDustInput = [...form.querySelectorAll('[name="dustDensity"], [name="dustOpacity"]')]
      .find((input) => !input.checkValidity());
    if (invalidDustInput) {
      invalidDustInput.reportValidity();
      this.feedback(body, `NILAI DUST HARUS BERUPA BILANGAN BULAT 10–${DUST_PERCENT_MAX}%.`);
      return false;
    }
    this.config = collected;
    const darkContrast = getPaletteContrast(this.config.theme.colors);
    const lightContrast = getPaletteContrast(this.config.theme.lightColors);
    if (!darkContrast.pass || !lightContrast.pass) {
      this.feedback(body, 'PERIKSA KONTRAS PADA PALET GELAP DAN CERAH: TEKS MEMERLUKAN 4.5:1 DAN AKSEN/STATUS 3:1.');
      return false;
    }
    const result = await this.api.saveSiteDraft(this.config, this.revisionId);
    if (!result.ok) {
      if (result.status === 409) {
        const latest = await this.api.getSiteConfig({ preview: true });
        if (latest.ok) {
          this.pendingConflict = {
            localConfig: structuredClone(this.config),
            remoteConfig: latest.data.config,
            revisionId: latest.data.revision_id
          };
          this.feedback(body, 'DRAFT BERUBAH DI SESI LAIN. PILIH CARA PEMULIHAN SEBELUM MELANJUTKAN.');
          const actions = document.createElement('div');
          actions.className = 'studio-form-actions studio-conflict-actions';
          actions.innerHTML = `
            <button class="btn-tactical primary" type="button" data-conflict-resolution="local">PERTAHANKAN DRAFT SAYA</button>
            <button class="btn-tactical" type="button" data-conflict-resolution="remote">MUAT DRAFT TERBARU</button>`;
          body.querySelector('[data-studio-feedback]')?.after(actions);
          actions.querySelectorAll('[data-conflict-resolution]').forEach((button) => button.addEventListener('click', () => {
            this.resolveDraftConflict(button.dataset.conflictResolution, body);
          }));
          return false;
        }
      }
      this.feedback(body, result.error);
      return false;
    }
    this.revisionId = result.data.revision.id;
    this.feedback(body, `DRAFT v${result.data.revision.version} TERSIMPAN. PUBLIKASI BELUM BERUBAH.`);
    return true;
  }

  async publish(body) {
    const result = await this.api.publishSiteDraft();
    if (!result.ok) return this.feedback(body, result.error);
    this.previewing = false;
    const published = await this.api.getSiteConfig();
    await this.applyConfig(published.ok ? published.data.config : this.config, { preview: false });
    this.revisionId = result.data.revision?.id || this.revisionId;
    this.returnToStudio();
    this.updateActionState(body);
    this.feedback(body, published.ok
      ? 'PERUBAHAN DIPUBLIKASIKAN.'
      : `PERUBAHAN SUDAH DIPUBLIKASIKAN, NAMUN KONFIGURASI TERBIT GAGAL DIMUAT ULANG: ${published.error}`);
    return true;
  }

  async cancelPreview(body) {
    if (!this.previewing) {
      this.returnToStudio();
      this.updateActionState(body || this.getContainer?.());
      return true;
    }
    try {
      const published = await this.api.getSiteConfig();
      if (!published.ok) {
        this.feedback(body, `PRATINJAU MASIH AKTIF; VERSI TERBIT GAGAL DIMUAT: ${published.error}`);
        return false;
      }
      await this.applyConfig(published.data.config, { preview: false });
      this.previewing = false;
      this.returnToStudio();
      this.updateActionState(body || this.getContainer?.());
      return true;
    } catch (error) {
      console.error('[SITE STUDIO] Gagal memulihkan versi terbit:', error);
      this.feedback(body, `PRATINJAU MASIH AKTIF; PEMULIHAN GAGAL: ${error.message || 'Terjadi kesalahan.'}`);
      return false;
    }
  }

  async uploadAsset(event, body) {
    event.preventDefault();
    const form = body.querySelector('#studio-asset-form');
    const file = form.querySelector('[name="asset"]').files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return this.feedback(body, 'FILE MELEBIHI BATAS 5 MB.');
    const configForm = body.querySelector('#site-studio-form');
    const collected = this.tryCollectConfig(configForm, body);
    if (!collected) return;
    this.config = collected;
    const result = await this.api.uploadSiteAsset(file);
    if (!result.ok) return this.feedback(body, result.error);
    this.assets = [result.data.asset, ...this.assets.filter((asset) => asset.id !== result.data.asset.id)];
    this.render(body);
    this.feedback(body, `ASET ${result.data.asset.original_name} DIUNGGAH DAN SIAP DIGUNAKAN.`);
  }

  async uploadInlineImage(event, body) {
    const input = event.currentTarget;
    const file = input.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return this.feedback(body, 'FILE MELEBIHI BATAS 5 MB.');
    const configForm = body.querySelector('#site-studio-form');
    const collected = this.tryCollectConfig(configForm, body);
    if (!collected) return;
    this.config = collected;
    const result = await this.api.uploadSiteAsset(file);
    if (!result.ok) return this.feedback(body, result.error);

    const asset = result.data.asset;
    const imageSelectName = input.dataset.inlineImageUpload;
    const imageSelects = [...body.querySelectorAll('select[data-image-preview-select]')];
    for (const imageSelect of imageSelects) {
      if (![...imageSelect.options].some((option) => option.value === asset.url)) imageSelect.add(new Option(asset.original_name, asset.url));
      if (imageSelect.name === imageSelectName) {
        imageSelect.value = asset.url;
        imageSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    this.assets = [asset, ...this.assets.filter((entry) => entry.id !== asset.id)];
    input.value = '';
    this.feedback(body, `FOTO ${asset.original_name} DIUNGGAH DAN DIPILIH.`);
  }

  async deleteAsset(id, body) {
    const configForm = body.querySelector('#site-studio-form');
    const collected = this.tryCollectConfig(configForm, body);
    if (!collected) return;
    this.config = collected;
    if (configReferencesAsset(this.config, id)) {
      return this.feedback(body, 'FOTO DIGUNAKAN DRAFT LOKAL. GANTI ATAU LEPAS FOTO SEBELUM MENGHAPUS ASET.');
    }
    const result = await this.api.deleteSiteAsset(id);
    if (!result.ok) return this.feedback(body, result.error);
    this.assets = this.assets.filter((asset) => asset.id !== id);
    this.render(body);
    this.feedback(body, 'ASET DIHAPUS. DRAFT LOKAL TETAP DIPERTAHANKAN.');
  }

  resolveDraftConflict(source, body) {
    if (!this.pendingConflict) return;
    const conflict = this.pendingConflict;
    this.config = source === 'local' ? conflict.localConfig : conflict.remoteConfig;
    this.revisionId = conflict.revisionId;
    this.pendingConflict = null;
    this.render(body);
    this.feedback(body, source === 'local'
      ? 'DRAFT LOKAL DIPERTAHANKAN DI ATAS REVISI TERBARU. SIMPAN DRAFT UNTUK MENERAPKAN PERUBAHAN.'
      : 'DRAFT TERBARU DARI SERVER DIMUAT.');
  }

  async restoreRevision(id, body) {
    const result = await this.api.restoreSiteRevision(id, this.revisionId);
    if (!result.ok) return this.feedback(body, result.error);
    this.feedback(body, `VERSI DIPULIHKAN MENJADI DRAFT ${result.data.revision.id}.`);
    this.activeTab = 'assets';
    await this.open();
  }
}
