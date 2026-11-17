import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSecurityNotice, selectSecurityNotice } from './emergencyNotice.js';

test('emergency notice accepts only known states and supplies safe defaults', () => {
  assert.equal(normalizeSecurityNotice({ status: 'unknown', message: 'x' }), null);
  assert.equal(normalizeSecurityNotice({ status: 'incident', message: '' }).message.includes('data pribadi'), true);
  assert.equal(normalizeSecurityNotice({ status: 'normal', message: 'ignored' }).message, '');
});

test('highest-priority notice is selected across local and independent feeds', () => {
  assert.equal(selectSecurityNotice(
    { status: 'normal' },
    { status: 'incident', message: 'Insiden sedang ditangani.' }
  ).status, 'incident');
  assert.equal(selectSecurityNotice(
    { status: 'incident' },
    { status: 'recovering' }
  ).status, 'incident');
});
