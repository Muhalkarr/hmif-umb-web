import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findWorkspaceNavigationEntry,
  getWorkspaceConfiguration,
  getWorkspaceNavigationEntries
} from './workspace.js';

const pageIds = (access) => getWorkspaceConfiguration(access).pages.map(({ id }) => id);

test('member dashboards include only member and account pages below clearance 2', () => {
  assert.deepEqual(pageIds({ clearanceLevel: 1 }), ['home', 'notifications', 'profile']);
  assert.equal(getWorkspaceConfiguration({ clearanceLevel: 1 }).dashboardName, 'Anggota');
});

test('operational dashboard is available to clearance 2 and BPH clearance is labeled separately', () => {
  assert.deepEqual(pageIds({ clearanceLevel: 2 }), ['home', 'notifications', 'profile', 'operations']);
  assert.equal(getWorkspaceConfiguration({ clearanceLevel: 2 }).dashboardName, 'Pengurus');
  assert.equal(getWorkspaceConfiguration({ clearanceLevel: 3 }).dashboardName, 'Pengurus BPH');
});

test('student demographic statistics require an explicit capability regardless of clearance', () => {
  const entries = (access) => new Map(getWorkspaceNavigationEntries(getWorkspaceConfiguration(access).sections)
    .map((entry) => [entry.id, entry]));
  assert.equal(entries({ clearanceLevel: 1 }).has('student-demographics'), false);
  assert.equal(entries({ clearanceLevel: 2 }).has('student-demographics'), false);
  assert.equal(entries({ clearanceLevel: 3 }).has('student-demographics'), false);
  assert.equal(entries({
    clearanceLevel: 1,
    positionCapabilities: ['student_demographics.view']
  }).get('student-demographics').workspaceView, 'student-demographics');
  assert.equal(entries({ isSuperadmin: true }).has('student-demographics'), true);
});

test('only superadmin receives the Site Studio page', () => {
  assert.deepEqual(pageIds({ isSuperadmin: true }), ['home', 'notifications', 'profile', 'academic', 'operations', 'studio']);
  assert.equal(getWorkspaceConfiguration({ isSuperadmin: true }).roleName, 'SUPERADMIN');
});

test('academic curator receives only the academic workspace capability below clearance 2', () => {
  const access = getWorkspaceConfiguration({ clearanceLevel: 1, permissions: ['academic_curate'] });
  assert.deepEqual(pageIds({ clearanceLevel: 1, permissions: ['academic_curate'] }), [
    'home', 'notifications', 'profile', 'academic'
  ]);
  assert.equal(access.canCurateAcademic, true);
  assert.equal(pageIds({ clearanceLevel: 1 }).includes('academic'), false);
});

test('workspace navigation contains one compact destination for each implemented service', () => {
  const { sections } = getWorkspaceConfiguration({ clearanceLevel: 1 });
  const labels = [];
  const visit = (items) => items.forEach((item) => {
    labels.push(item.label);
    visit(item.children || []);
  });
  sections.forEach(({ items }) => visit(items));

  assert.deepEqual(sections.map(({ id }) => id), ['dashboard', 'hmif-services']);
  for (const label of ['Beranda', 'Ruang Belajar', 'Support Desk', 'Kalender pendidikan', 'Rapat HMIF', 'Amandemen AD/ART/GBHO']) {
    assert.ok(labels.includes(label), `expected navigation to include ${label}`);
  }
  for (const label of ['Default', 'App', 'Analytics', 'CRM', 'Authentication', 'Course list', 'Student overview']) {
    assert.equal(labels.includes(label), false, `unused navigation should not include ${label}`);
  }
});

test('implemented catalog destinations keep navigable ids and restricted HMIF tools remain permission-gated', () => {
  const member = getWorkspaceConfiguration({ clearanceLevel: 1 });
  const pengurus = getWorkspaceConfiguration({ clearanceLevel: 2 });
  const dashboardItem = getWorkspaceNavigationEntries(member.sections).find(({ id }) => id === 'dashboard-lms');

  assert.equal(dashboardItem.id, 'dashboard-lms');
  assert.equal(findWorkspaceNavigationEntry(member.sections, dashboardItem.id).label, 'Ruang Belajar');
  assert.equal(findWorkspaceNavigationEntry(member.sections, 'catalog-dashboard-analytics'), undefined);
  assert.equal(findWorkspaceNavigationEntry(member.sections, 'academic'), undefined);
  assert.equal(findWorkspaceNavigationEntry(member.sections, 'operations'), undefined);
  assert.equal(findWorkspaceNavigationEntry(pengurus.sections, 'operations').label, 'Konsol operasional');
});

test('workspace sidebar has unique item ids and only one link to each account destination', () => {
  const { sections } = getWorkspaceConfiguration({ clearanceLevel: 1, permissions: ['academic_curate'] });
  const entries = getWorkspaceNavigationEntries(sections);
  const ids = entries.map(({ id }) => id);

  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['notifications', 'profile', 'academic']) {
    assert.equal(entries.filter((entry) => entry.id === id).length, 1, `${id} must appear once`);
  }
});

test('implemented sidebar links are routed once and unfinished modules cannot be opened', () => {
  const { sections } = getWorkspaceConfiguration({ clearanceLevel: 1 });
  const entries = getWorkspaceNavigationEntries(sections);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));

  assert.equal(byId.get('home').workspaceView, 'home');
  assert.equal(byId.get('knowledge').workspaceView, 'public-feature');
  assert.equal(byId.get('knowledge').publicTab, 'knowledge');
  assert.equal(byId.get('tutoring').publicTab, 'knowledge');
  assert.equal(byId.get('tutoring').publicAnchor, 'tutoring-clinic-heading');
  assert.equal(byId.get('voting').workspaceView, 'voting');
  assert.equal(byId.get('voting').publicTab, undefined);
  assert.equal(findWorkspaceNavigationEntry(sections, 'app-calendar').publicTab, 'calendar');
  for (const [id, tab] of [
    ['tutoring', 'knowledge'],
    ['inventory', 'inventory'],
    ['calendar', 'calendar'],
    ['showcase', 'showcase'],
    ['career', 'career'],
    ['doctrine', 'doctrine']
  ]) {
    assert.equal(byId.get(id).publicTab, tab, `${id} must retain its existing feature`);
    assert.equal(byId.get(id).status, 'available');
  }
  assert.equal(byId.get('governance-documents').workspaceView, 'governance-documents');
  assert.equal(byId.get('attendance-checkin').workspaceView, 'attendance-checkin');
  assert.equal(byId.get('attendance-tickets').workspaceView, 'attendance-tickets');
  assert.equal(byId.get('notifications').status, 'available');
  assert.equal(byId.has('catalog-dashboard-analytics'), false);
  assert.equal(entries.some(({ status }) => status === 'planned'), false);
  assert.equal(findWorkspaceNavigationEntry(sections, 'operations'), undefined);
});

test('LMS route aliases resolve to one canonical menu item while preserving course workflows', () => {
  const memberSections = getWorkspaceConfiguration({ clearanceLevel: 1 }).sections;
  const curatorSections = getWorkspaceConfiguration({
    clearanceLevel: 1,
    permissions: ['academic_curate']
  }).sections;
  const memberEntries = new Map(getWorkspaceNavigationEntries(memberSections).map((entry) => [entry.id, entry]));

  assert.equal(memberEntries.get('dashboard-lms').workspaceView, 'learning');
  for (const id of ['learning-course', 'learning-course-list', 'learning-course-grid', 'learning-course-details']) {
    const route = findWorkspaceNavigationEntry(memberSections, id);
    assert.equal(route.workspaceView, 'learning');
    assert.equal(route.menuId, 'dashboard-lms');
  }
  assert.equal(findWorkspaceNavigationEntry(memberSections, 'learning-student-overview').workspaceView, 'learning');
  assert.equal(findWorkspaceNavigationEntry(memberSections, 'learning-trainer-profile').publicAnchor, 'tutoring-clinic-heading');
  assert.equal(findWorkspaceNavigationEntry(memberSections, 'learning-course-create'), undefined);
  assert.equal(findWorkspaceNavigationEntry(curatorSections, 'learning-course-create').workspaceView, 'academic');
});

test('Support Desk route aliases open the single implemented ticket workspace', () => {
  const sections = getWorkspaceConfiguration({ clearanceLevel: 1 }).sections;
  const memberEntries = new Map(getWorkspaceNavigationEntries(sections).map((entry) => [entry.id, entry]));
  assert.equal(memberEntries.get('dashboard-support').workspaceView, 'support');
  for (const id of [
    'support-table', 'support-cards', 'support-contacts', 'support-contact-details',
    'support-tickets-preview', 'support-quick-links', 'support-reports'
  ]) {
    const route = findWorkspaceNavigationEntry(sections, id);
    assert.equal(route.workspaceView, 'support', `${id} must open Support Desk`);
    assert.equal(route.menuId, 'dashboard-support');
  }
});

test('meeting workspace is available to members without granting organizer capability', () => {
  const memberEntries = new Map(getWorkspaceNavigationEntries(getWorkspaceConfiguration({ clearanceLevel: 1 }).sections)
    .map((entry) => [entry.id, entry]));
  assert.equal(memberEntries.get('meetings').workspaceView, 'meetings');
  assert.equal(memberEntries.get('meetings').status, 'available');
  assert.equal(getWorkspaceConfiguration({ clearanceLevel: 1 }).pages.some(({ id }) => id === 'operations'), false);
});
