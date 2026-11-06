import assert from 'node:assert/strict';
import test from 'node:test';
import { getCohortPosts, resolveCohortOperator } from '../src/scripts/dualRole.js';
import { HMIF_DATA } from '../src/scripts/data.js';

test('resolves only explicit operator links independently of NIM', () => {
    const operators = [{ id: 'op-kominfo', nim: '24040123', name: 'Nadia' }];
    assert.equal(resolveCohortOperator(operators, 'op-kominfo'), operators[0]);
    assert.equal(resolveCohortOperator(operators, 'op-kominfo', '24040199'), operators[0]);
    assert.equal(resolveCohortOperator(operators, 'missing-operator'), null);
    assert.equal(resolveCohortOperator(operators, ''), null);
});

test('collects leadership and division coordinator cohort posts', () => {
    const operator = { id: 'op-kominfo', nim: '24040123' };
    const generations = [{
        year: '2024',
        leadership: {
            ketua: { operatorId: operator.id, nim: operator.nim },
            wakil: { nim: operator.nim }
        },
        divisions: [
            { name: 'Mikat', coordinatorOperatorId: operator.id, coordinatorNim: operator.nim },
            { name: 'Litbang', coordinatorOperatorId: operator.id, coordinatorNim: '24040199' }
        ]
    }];

    assert.deepEqual(getCohortPosts(generations, operator), [
        { year: '2024', title: 'Ketua Angkatan (Komti)' },
        { year: '2024', title: 'Koordinator Mikat' },
        { year: '2024', title: 'Koordinator Litbang' }
    ]);
});

test('browser fallback data contains no personal NIM values', () => {
    const nims = [
        ...(HMIF_DATA.operators || []).map((operator) => operator.nim),
        ...(HMIF_DATA.generations || []).flatMap((generation) => [
            ...Object.values(generation.leadership || {}).map((leader) => leader.nim),
            ...(generation.divisions || []).flatMap((division) => [
                division.coordinatorNim,
                ...(division.members || []).map((member) => typeof member === 'string' ? '' : member.nim)
            ])
        ])
    ];
    assert.ok(nims.every((nim) => nim === ''));
});
