import assert from 'node:assert/strict';
import test from 'node:test';
import { SiteStudio } from './siteStudio.js';
import { createOrganizationDraftTemplate } from './organizationTemplates.js';
import { REPOSITORY_UNIVERSITY_ORG_UNITS, validateSiteConfig, withSiteDefaults } from '../../server/siteSchema.js';
import { collectCampusMapForm, renderCampusMapPanel } from './siteStudioCampusMap.js';
import { collectUniversityOrganizationForm, renderUniversityOrganizationPanel } from './siteStudioHierarchies.js';
import { moveSiteMapNode, removeSiteMapGroup, renderSiteMapEditor } from './siteStudioSiteMap.js';

test('preserves the generic organization structure when collecting Site Studio settings', () => {
  const config = withSiteDefaults({});
  config.theme.dust = { density: 175, opacity: 225 };
  config.content.customPages = [{
    id: '123e4567-e89b-42d3-a456-426614174000',
    slug: 'halaman-awal',
    title: 'Halaman Awal',
    description: 'Deskripsi awal.',
    layout: 'default',
    visible: true,
    blocks: [{ type: 'text', title: 'Modul Awal', body: 'Isi awal.' }]
  }];
  config.content.sidebarOrder = [
    'dashboard',
    `custom-${config.content.customPages[0].id}`,
    ...config.content.sidebarOrder.filter((id) => id !== 'dashboard')
  ];
  config.content.data.organizationStructure = {
    people: [{ id: 'person-one', name: 'Member One', isPublic: true }],
    terms: [{
      id: 'term-one',
      name: 'Term One',
      startDate: '2026-01-01',
      endDate: null,
      status: 'active',
      units: [{ id: 'unit-one', parentUnitId: null, name: 'Independent Unit', code: '', description: '', order: 0 }],
      positions: [{ id: 'position-one', unitId: 'unit-one', title: 'Member', code: '', maxOccupants: 1, required: true, order: 0 }],
      assignments: []
    }]
  };
  const elements = new Proxy({}, {
    get: (_target, name) => {
      if (name === 'organization.person.0.name') return { value: 'Updated Member One' };
      if (name === 'organization.person.0.accountId') return { value: '123e4567-e89b-42d3-a456-426614174000' };
      if (name === 'organization.person.0.isPublic') return { checked: false };
      const customPageControls = {
        'customPage.0.title': { value: 'Halaman Diperbarui' },
        'customPage.0.slug': { value: 'halaman-diperbarui' },
        'customPage.0.description': { value: 'Deskripsi baru.' },
        'customPage.0.layout': { value: 'wide' },
        'customPage.0.visible': { checked: false },
        'customPage.0.block.0.type': { value: 'notice' },
        'customPage.0.block.0.title': { value: 'Perhatian' },
        'customPage.0.block.0.body': { value: 'Jadwal diperbarui.' },
        'customPage.0.block.0.tone': { value: 'warning' }
      };
      if (customPageControls[name]) return customPageControls[name];
      const groupTitleMatch = /^siteMapNode\.(.+)\.title$/.exec(name);
      if (groupTitleMatch) {
        return { value: config.content.siteMapNodes.find(({ id }) => id === groupTitleMatch[1])?.title || '' };
      }
      const siteMapParentMatch = /^siteMapParent\.(.+)$/.exec(name);
      if (siteMapParentMatch) {
        return { value: config.content.siteMapNodes.find(({ id }) => id === siteMapParentMatch[1])?.parentId || '' };
      }
      if (typeof name !== 'string' || name.startsWith('organization.') || name.startsWith('collection.')) return undefined;
      const value = ({
        'font.body': config.theme.fonts.body,
        'font.heading': config.theme.fonts.heading,
        'font.mono': config.theme.fonts.mono,
        typeScale: String(config.theme.typeScale),
        dustDensity: String(config.theme.dust.density),
        dustOpacity: String(config.theme.dust.opacity),
        shape: config.theme.shape,
        iconStyle: config.theme.iconStyle,
        backgroundMode: config.theme.background.mode,
        backgroundImage: config.theme.background.image,
        heroImage: config.theme.heroImage,
        contrast: config.theme.contrast
      })[name] ?? '';
      return { value, checked: name === 'motion' ? config.theme.motion : name.startsWith('visible.') };
    }
  });
  const paletteControls = [
    { name: 'color.dark.background', value: '#080a10' },
    { name: 'color.light.background', value: '#f1f0e9' },
    { name: 'color.light.accent', value: '#2c5f50' }
  ];
  const form = {
    elements,
    querySelectorAll: (selector) => {
      if (selector === '[name^="color."]') return paletteControls;
      if (selector === '[data-sidebar-order-item]') {
        return config.content.sidebarOrder.map((id) => ({ dataset: { sidebarOrderItem: id } }));
      }
      return [];
    }
  };
  const studio = new SiteStudio({}, {});
  studio.config = config;

  const collected = studio.collectConfig(form);
  assert.deepEqual(collected.theme.dust, config.theme.dust);
  assert.equal(collected.theme.colors.background, '#080a10');
  assert.equal(collected.theme.lightColors.background, '#f1f0e9');
  assert.equal(collected.theme.lightColors.accent, '#2c5f50');
  assert.deepEqual(collected.content.data.organizationStructure.people[0], {
    id: 'person-one',
    name: 'Updated Member One',
    accountId: '123e4567-e89b-42d3-a456-426614174000',
    isPublic: false
  });
  assert.deepEqual(collected.content.data.organizationStructure.terms, config.content.data.organizationStructure.terms);
  assert.deepEqual(collected.content.customPages, [{
    id: '123e4567-e89b-42d3-a456-426614174000',
    slug: 'halaman-diperbarui',
    title: 'Halaman Diperbarui',
    description: 'Deskripsi baru.',
    layout: 'wide',
    visible: false,
    blocks: [{ type: 'notice', title: 'Perhatian', body: 'Jadwal diperbarui.', tone: 'warning' }]
  }]);
  assert.deepEqual(collected.content.sidebarOrder, config.content.sidebarOrder);
  assert.equal(collected.content.siteMapNodes.find(({ id }) => id === 'vision').parentId, 'group-about');
  assert.ok(collected.content.siteMapNodes.some(({ id, type }) => id === `custom-${config.content.customPages[0].id}` && type === 'page'));
  assert.ok(collected.pages.some(({ id }) => id === 'cohort'));
  assert.ok(collected.pages.some(({ id }) => id === 'voting'));
});

test('keeps site map ordering and hierarchy independent from sidebar ordering', () => {
  const nodes = [
    { id: 'group-one', type: 'group', title: 'Kelompok Satu', parentId: '' },
    { id: 'page-one', type: 'page', parentId: 'group-one' },
    { id: 'page-two', type: 'page', parentId: 'group-one' },
    { id: 'group-two', type: 'group', title: 'Kelompok Dua', parentId: '' }
  ];
  assert.deepEqual(moveSiteMapNode(nodes, 'page-two', 'up').map(({ id }) => id), [
    'group-one', 'page-two', 'page-one', 'group-two'
  ]);
  assert.deepEqual(moveSiteMapNode(nodes, 'group-one', 'down').map(({ id }) => id), [
    'group-two', 'page-one', 'page-two', 'group-one'
  ]);
  assert.deepEqual(removeSiteMapGroup(nodes, 'group-one').map(({ id, parentId }) => [id, parentId]), [
    ['page-one', ''],
    ['page-two', ''],
    ['group-two', '']
  ]);
  const rendered = renderSiteMapEditor(nodes, new Map([['page-one', 'Halaman Satu']]));
  assert.match(rendered, /Induk peta untuk Halaman Satu/);
  assert.match(rendered, /Akar HMIF UMB/);
  assert.match(rendered, /Kelompok Satu/);
});

test('collects period-based university units and exposes the bounded repository sync option', () => {
  const organization = {
    structures: [{
      id: 'university-term-2026',
      name: 'Struktur awal',
      validFrom: '2026-01-01',
      validUntil: null,
      repositorySyncedAt: null,
      units: [{
        id: 'university-root',
        name: 'Universitas Contoh',
        kind: 'university',
        parentId: null,
        description: ''
      }, {
        id: 'faculty-unit',
        name: 'Fakultas Contoh',
        kind: 'faculty',
        parentId: 'university-root',
        description: 'Unit akademik.'
      }]
    }]
  };
  const values = {
    'universityStructure.0.name': 'Periode 2026-2030',
    'universityStructure.0.validFrom': '2026-01-01',
    'universityStructure.0.validUntil': '2029-12-31',
    'universityStructure.0.unit.0.name': 'Universitas Contoh',
    'universityStructure.0.unit.0.kind': 'university',
    'universityStructure.0.unit.0.parentId': '',
    'universityStructure.0.unit.0.description': '',
    'universityStructure.0.unit.1.name': 'Fakultas Contoh',
    'universityStructure.0.unit.1.kind': 'faculty',
    'universityStructure.0.unit.1.parentId': 'university-root',
    'universityStructure.0.unit.1.description': 'Fakultas teknik.'
  };
  const form = { elements: new Proxy({}, { get: (_target, name) => values[name] ? { value: values[name] } : undefined }) };
  const collected = collectUniversityOrganizationForm(form, organization);
  assert.equal(collected.structures[0].name, 'Periode 2026-2030');
  assert.equal(collected.structures[0].validUntil, '2029-12-31');
  assert.equal(collected.structures[0].units[1].parentId, 'university-root');
  assert.equal(collected.structures[0].units[1].description, 'Fakultas teknik.');
  assert.equal(REPOSITORY_UNIVERSITY_ORG_UNITS.length, 2);

  const panel = renderUniversityOrganizationPanel(organization);
  assert.match(panel, /data-university-sync="0"/);
  assert.match(panel, /Rektorat atau unit resmi lainnya/);
});

test('creates a configurable governance draft without people, assignments, or automatic authority', () => {
  let nextId = 0;
  const term = createOrganizationDraftTemplate({
    createId: (prefix) => `${prefix}-${++nextId}`,
    name: 'Template periode uji',
    startDate: '2026-01-01'
  });
  const config = withSiteDefaults({});
  config.content.data.organizationStructure.terms.push(term);
  const normalized = validateSiteConfig(config).content.data.organizationStructure;
  const [validatedTerm] = normalized.terms;
  const bph = validatedTerm.units.find(({ code }) => code === 'BPH-INTI');
  const bpd = validatedTerm.units.find(({ code }) => code === 'BPD');
  const dpa = validatedTerm.units.find(({ code }) => code === 'DPA');

  assert.equal(validatedTerm.status, 'draft');
  assert.equal(validatedTerm.positions.length, 3);
  assert.ok(validatedTerm.positions.every(({ unitId, required }) => unitId === bph.id && !required));
  assert.equal(bpd.parentUnitId, null);
  assert.equal(dpa.parentUnitId, null);
  assert.equal(validatedTerm.assignments.length, 0);
  assert.equal(normalized.people.length, 0);
});

test('Site Studio exposes the governance template as an editable draft action', () => {
  const studio = new SiteStudio({}, {});
  studio.config = withSiteDefaults({});
  studio.users = [];
  const panel = studio.renderOrganizationPanel();

  assert.match(panel, /data-org-template="hmif-governance"/);
  assert.match(panel, /tidak menetapkan kewenangan atau hak akses/);
});

test('Site Studio bulk access panel lists members but never superadmins', () => {
  const studio = new SiteStudio({}, {});
  studio.config = withSiteDefaults({});
  studio.users = [
    { account_id: 'member-account', nim: 'member-1', name: 'Anggota', role: 'member', clearance_level: 1 },
    { account_id: 'admin-account', nim: 'admin-1', name: 'Admin', role: 'superadmin', clearance_level: 0 }
  ];

  const panel = studio.renderAccountAccessPanel();
  assert.match(panel, /Akun superadmin dikecualikan/);
  assert.match(panel, /data-access-account="member-account"/);
  assert.doesNotMatch(panel, /data-access-account="admin-account"/);
  assert.match(panel, /name="accessClearance"/);
  assert.match(panel, /data-access-capability="finance\.manage"/);
});

test('Site Studio configures standard and typed custom account-table columns', () => {
  const studio = new SiteStudio({}, {});
  studio.config = withSiteDefaults({});
  studio.users = [{ account_id: 'member-account', nim: 'member-1', name: 'Anggota', role: 'member' }];
  studio.studentDemographicSettings = {
    visibleColumns: ['name', 'nim'],
    customColumns: [{
      id: 'field-track',
      label: 'Peminatan',
      type: 'single_select',
      options: ['Backend', 'Web'],
      visible: true
    }]
  };
  studio.studentDemographicValues = { 'member-account': { 'field-track': 'Backend' } };
  studio.selectedDemographicAccountId = 'member-account';

  const panel = studio.renderStudentDemographicsPanel();
  assert.match(panel, /data-demographic-standard-column="nim" checked/);
  assert.match(panel, /data-demographic-field="field-track"/);
  assert.match(panel, /name="studio-field-track"/);
  assert.match(panel, /value="Backend" selected/);
  assert.match(panel, /student_demographics\.view/);
});

test('renders custom pages as allowlisted module forms and escapes their content', () => {
  const studio = new SiteStudio({}, {});
  studio.config = withSiteDefaults({});
  studio.config.content.customPages = [{
    id: '123e4567-e89b-42d3-a456-426614174000',
    slug: 'tentang-kami',
    title: 'Tentang Kami',
    description: 'Profil organisasi.',
    layout: 'default',
    visible: true,
    blocks: [{ type: 'text', title: 'Profil', body: '<script>tidak dijalankan</script>' }]
  }];

  const panel = studio.renderCustomPagesPanel();
  assert.match(panel, /name="customPage\.0\.slug"/);
  assert.match(panel, /data-custom-block-type/);
  assert.match(panel, /&lt;script&gt;tidak dijalankan&lt;\/script&gt;/);
  assert.doesNotMatch(panel, /<script>tidak dijalankan<\/script>/);
});

test('keeps preview active and reports failure when the published config cannot be restored', async () => {
  const studio = new SiteStudio({
    getSiteConfig: async () => ({ ok: false, error: 'Server tidak tersedia.' })
  }, {});
  studio.previewing = true;

  assert.equal(await studio.cancelPreview(), false);
  assert.equal(studio.previewing, true);
});

test('restores the published config before closing preview mode', async () => {
  let appliedConfig;
  let returnedToStudio = false;
  const config = withSiteDefaults({});
  const studio = new SiteStudio({
    getSiteConfig: async () => ({ ok: true, data: { config } })
  }, {
    applyConfig: async (value, options) => {
      appliedConfig = { value, options };
    },
    returnToStudio: () => {
      returnedToStudio = true;
    }
  });
  studio.previewing = true;

  assert.equal(await studio.cancelPreview(), true);
  assert.equal(studio.previewing, false);
  assert.deepEqual(appliedConfig, { value: config, options: { preview: false } });
  assert.equal(returnedToStudio, true);
});

test('collects editable campus map coordinates, floor scales, images, legends, and features', () => {
    const campusMap = {
      navigationLabel: 'Peta Kampus',
      summary: 'Lokasi dan fasilitas.',
      publicWidgetVisible: true,
      defaultZoom: 16,
      campuses: [{
        id: 'campus-one',
        name: 'Kampus Utama',
        address: '',
        latitude: -7.3,
        longitude: 108.2,
        buildings: [{
          id: 'building-one',
          name: 'Gedung A',
          description: '',
          latitude: null,
          longitude: null,
          floors: [{
            id: 'floor-one',
            name: 'Lantai 1',
            level: 0,
            widthMeters: 30,
            heightMeters: 20,
            scaleDenominator: 100,
            planImage: '/assets/floorplan.png',
            legend: [{ id: 'room', label: 'Ruang', color: '#426b66' }],
            features: [{
              id: 'room-101',
              kind: 'area',
              label: 'Ruang 101',
              description: 'Ruang kelas.',
              legendId: 'room',
              x: 10,
              y: 20,
              width: 120,
              height: 80,
              points: []
            }]
          }]
        }]
      }]
    };
    const values = {
      'campusMap.navigationLabel': { value: 'Atlas Kampus' },
      'campusMap.summary': { value: 'Cari gedung dan fasilitas.' },
      'campusMap.publicWidgetVisible': { checked: false },
      'campusMap.defaultZoom': { value: '18' },
      'campusMap.0.name': { value: 'Kampus Tasikmalaya' },
      'campusMap.0.latitude': { value: '-7.31' },
      'campusMap.0.0.0.widthMeters': { value: '42.5' },
      'campusMap.0.0.0.scaleDenominator': { value: '250' },
      'campusMap.0.0.0.planImage': { value: '/api/site/assets/123e4567-e89b-42d3-a456-426614174000/file' },
      'campusMap.0.0.0.legend.0.label': { value: 'Ruang belajar' },
      'campusMap.0.0.0.legend.0.color': { value: '#2c5f50' },
      'campusMap.0.0.0.features.0.label': { value: 'Lab Informatika' },
      'campusMap.0.0.0.features.0.legendId': { value: 'room' },
      'campusMap.0.0.0.features.0.x': { value: '25' },
      'campusMap.0.0.0.features.0.description': { value: 'Laboratorium.' }
    };
    const collected = collectCampusMapForm({ elements: values }, campusMap);
    assert.equal(collected.navigationLabel, 'Atlas Kampus');
    assert.equal(collected.publicWidgetVisible, false);
    assert.equal(collected.defaultZoom, 18);
    assert.equal(collected.campuses[0].name, 'Kampus Tasikmalaya');
    assert.equal(collected.campuses[0].latitude, -7.31);
    assert.equal(collected.campuses[0].buildings[0].floors[0].widthMeters, 42.5);
    assert.equal(collected.campuses[0].buildings[0].floors[0].scaleDenominator, 250);
    assert.equal(collected.campuses[0].buildings[0].floors[0].planImage, values['campusMap.0.0.0.planImage'].value);
    assert.equal(collected.campuses[0].buildings[0].floors[0].legend[0].color, '#2c5f50');
    assert.equal(collected.campuses[0].buildings[0].floors[0].features[0].x, 25);
    assert.match(renderCampusMapPanel(campusMap), /data-map-draw-kind="area"/);
    assert.match(renderCampusMapPanel(campusMap), /GAMBAR DENAH DASAR/);
});
