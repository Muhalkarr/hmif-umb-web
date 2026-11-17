import assert from 'node:assert/strict';
import test from 'node:test';
import { getActiveTermPositionAccess, getPositionCapabilitiesForAccount } from './positionAccess.js';

const structure = {
    people: [{ id: 'person-a', name: 'Member A', accountId: 'account-a' }],
    terms: [{
        id: 'term-active',
        name: 'Active term',
        startDate: '2026-01-01',
        endDate: null,
        status: 'active',
        units: [{ id: 'unit-a', name: 'BPH' }],
        positions: [{ id: 'position-a', unitId: 'unit-a', title: 'Treasurer' }],
        assignments: [{
            id: 'assignment-a',
            personId: 'person-a',
            positionId: 'position-a',
            startDate: '2026-02-01',
            endDate: null,
            kind: 'substantive'
        }]
    }]
};

test('active position mapping grants capabilities to its current account holder', () => {
    const access = getActiveTermPositionAccess(structure, [{
        term_id: 'term-active',
        position_id: 'position-a',
        capability: 'finance.manage'
    }], '2026-03-01');

    assert.deepEqual(getPositionCapabilitiesForAccount(access, 'account-a'), ['finance.manage']);
    assert.deepEqual(getPositionCapabilitiesForAccount(access, 'other-account'), []);
});

test('position capabilities are not granted outside the active term or assignment dates', () => {
    const mapping = [{ term_id: 'term-active', position_id: 'position-a', capability: 'finance.manage' }];

    assert.deepEqual(getPositionCapabilitiesForAccount(
        getActiveTermPositionAccess(structure, mapping, '2025-12-31'),
        'account-a'
    ), []);
    assert.deepEqual(getPositionCapabilitiesForAccount(
        getActiveTermPositionAccess(structure, mapping, '2026-01-31'),
        'account-a'
    ), []);
    assert.deepEqual(getPositionCapabilitiesForAccount(
        getActiveTermPositionAccess(structure, [{ ...mapping[0], term_id: 'old-term' }], '2026-03-01'),
        'account-a'
    ), []);
});
