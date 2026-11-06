import assert from 'node:assert/strict';
import test from 'node:test';
import { getWorkspaceConfiguration } from './workspace.js';

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
