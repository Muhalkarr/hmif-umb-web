import assert from 'node:assert/strict';
import test from 'node:test';
import { CanvasDustEngine } from './canvasDust.js';

test('applies custom dust percentages above 100 within the supported cap', (context) => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  globalThis.window = {
    innerWidth: 1280,
    innerHeight: 720,
    matchMedia: () => ({ matches: false })
  };
  context.after(() => {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else delete globalThis.window;
  });

  const engine = Object.create(CanvasDustEngine.prototype);
  engine.baseDustQuantity = 40;
  engine.dustArr = [];
  engine.ctx = null;
  engine.setTheme('dark', false, { density: 175, opacity: 240 });

  assert.equal(engine.density, 175);
  assert.equal(engine.opacity, 240);
  assert.equal(engine.dustQuantity, 70);
  assert.equal(engine.dustArr.length, 70);
});
