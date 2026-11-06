import fs from 'fs';
import path from 'path';

export const loadInitialDatabaseSeed = ({
    environment,
    databaseFile,
    defaultDatabaseFile,
    legacyDatabaseFile,
    createSeed
}) => {
    const importedLegacy = environment !== 'production'
        && path.resolve(databaseFile) === path.resolve(defaultDatabaseFile)
        && fs.existsSync(legacyDatabaseFile);
    const seed = importedLegacy
        ? JSON.parse(fs.readFileSync(legacyDatabaseFile, 'utf8'))
        : createSeed();

    if (importedLegacy) seed.security_version = 3;
    return { seed, importedLegacy };
};