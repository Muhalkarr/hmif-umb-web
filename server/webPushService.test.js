import assert from 'node:assert/strict';
import test from 'node:test';
import { createWebPushService } from './services/webPushService.js';

test('temporary VAPID private keys are never written to logs', () => {
  const previousPublicKey = process.env.VAPID_PUBLIC_KEY;
  const previousPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const warnings = [];
  const previousWarn = console.warn;
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  console.warn = (...values) => warnings.push(values.join(' '));

  try {
    createWebPushService({});
  } finally {
    console.warn = previousWarn;
    if (previousPublicKey === undefined) delete process.env.VAPID_PUBLIC_KEY;
    else process.env.VAPID_PUBLIC_KEY = previousPublicKey;
    if (previousPrivateKey === undefined) delete process.env.VAPID_PRIVATE_KEY;
    else process.env.VAPID_PRIVATE_KEY = previousPrivateKey;
  }

  assert.ok(warnings.some((warning) => warning.includes('tidak akan bertahan setelah restart')));
  assert.ok(warnings.every((warning) => !/VAPID_(?:PUBLIC|PRIVATE)_KEY=/.test(warning)));
});
