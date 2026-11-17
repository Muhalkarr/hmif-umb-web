import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const outputDirectory = path.resolve('dist');
const html = fs.readFileSync(path.join(outputDirectory, 'index.html'), 'utf8');
const entryPath = html.match(/<script[^>]+src="([^"]+\.js)"/)?.[1];
assert.ok(entryPath, 'Vite output must reference an application JavaScript entry');

const entryFile = path.join(outputDirectory, entryPath.replace(/^\/+/, ''));
const entrySize = fs.statSync(entryFile).size;
const limit = 500 * 1024;
console.log(`Initial JavaScript entry: ${(entrySize / 1024).toFixed(1)} KiB (limit: ${limit / 1024} KiB).`);
assert.ok(entrySize <= limit, `Initial JavaScript entry exceeds ${limit / 1024} KiB.`);
