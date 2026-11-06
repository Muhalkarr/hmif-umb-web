import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { loadInitialDatabaseSeed } from './databaseBootstrap.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const databaseModuleUrl = pathToFileURL(path.join(projectRoot, 'server', 'db.js')).href;
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'hmif-bootstrap-test-'));

test.after(() => {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

const runDatabase = (environment) => {
    const databaseDirectory = path.join(temporaryDirectory, environment);
    const databaseFile = path.join(databaseDirectory, 'database.sqlite');
    fs.mkdirSync(databaseDirectory, { recursive: true });
    const source = `
    import { db } from ${JSON.stringify(databaseModuleUrl)};
    try {
      const state = db.read();
      const collections = ['missions_proker', 'academic_calendar', 'aspirations', 'financial_ledger', 'cadet_evaluations', 'attendance_records'];
      console.log(JSON.stringify({
        users: state.users.map(({ nim, role, clearance_level }) => ({ nim, role, clearance_level })),
        collections: Object.fromEntries(collections.map((name) => [name, state[name].length]))
      }));
    } finally {
      db.close();
    }
  `;
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', source], {
        cwd: projectRoot,
        encoding: 'utf8',
        env: {
            ...process.env,
            NODE_ENV: environment,
            DATABASE_FILE: databaseFile,
            INITIAL_ADMIN_NIM: `bootstrap-${environment}`,
            INITIAL_ADMIN_PASSWORD: 'test-bootstrap-password-123'
        }
    });
    return JSON.parse(output.trim());
};

test('imports a legacy JSON seed only in development at the default database path', () => {
    const fixtureDirectory = path.join(temporaryDirectory, 'legacy-import');
    fs.mkdirSync(fixtureDirectory, { recursive: true });
    const defaultDatabaseFile = path.join(fixtureDirectory, 'hmif.sqlite');
    const legacyDatabaseFile = path.join(fixtureDirectory, 'database.json');
    fs.writeFileSync(legacyDatabaseFile, JSON.stringify({ security_version: 2, users: [{ nim: 'legacy-admin' }] }));
    let seedFactoryCalled = false;

    const result = loadInitialDatabaseSeed({
        environment: 'development',
        databaseFile: defaultDatabaseFile,
        defaultDatabaseFile,
        legacyDatabaseFile,
        createSeed: () => {
            seedFactoryCalled = true;
            return {};
        }
    });

    assert.equal(result.importedLegacy, true);
    assert.equal(result.seed.security_version, 3);
    assert.equal(result.seed.users[0].nim, 'legacy-admin');
    assert.equal(seedFactoryCalled, false);
});

test('uses the configured development admin seed for a new SQLite database', () => {
    const result = runDatabase('development');

    assert.deepEqual(result.users, [{
        nim: 'bootstrap-development',
        role: 'superadmin',
        clearance_level: 0
    }]);
    assert.ok(result.collections.missions_proker > 0);
    assert.ok(result.collections.academic_calendar > 0);
});

test('starts production with no operational sample records', () => {
    const result = runDatabase('production');

    assert.deepEqual(result.users, [{
        nim: 'bootstrap-production',
        role: 'superadmin',
        clearance_level: 0
    }]);
    assert.deepEqual(result.collections, {
        missions_proker: 0,
        academic_calendar: 0,
        aspirations: 0,
        financial_ledger: 0,
        cadet_evaluations: 0,
        attendance_records: 0
    });
});

test('does not import legacy JSON in production or from a custom development path', () => {
    const fixtureDirectory = path.join(temporaryDirectory, 'legacy-policy');
    fs.mkdirSync(fixtureDirectory, { recursive: true });
    const defaultDatabaseFile = path.join(fixtureDirectory, 'hmif.sqlite');
    const customDatabaseFile = path.join(fixtureDirectory, 'custom.sqlite');
    const legacyDatabaseFile = path.join(fixtureDirectory, 'database.json');
    fs.writeFileSync(legacyDatabaseFile, JSON.stringify({ users: [{ nim: 'legacy-admin' }] }));

    for (const [environment, databaseFile] of [
        ['production', defaultDatabaseFile],
        ['development', customDatabaseFile]
    ]) {
        const result = loadInitialDatabaseSeed({
            environment,
            databaseFile,
            defaultDatabaseFile,
            legacyDatabaseFile,
            createSeed: () => ({ users: [{ nim: `seed-${environment}` }] })
        });
        assert.equal(result.importedLegacy, false);
        assert.equal(result.seed.users[0].nim, `seed-${environment}`);
    }
});