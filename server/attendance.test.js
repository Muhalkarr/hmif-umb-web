import assert from 'node:assert/strict';
import test from 'node:test';
import { distanceInMeters, isWithinGeofence } from './attendance.js';

test('validates attendance inside the radius using GPS accuracy conservatively', () => {
  const venue = { latitude: -6.2, longitude: 106.8 };
  assert.equal(distanceInMeters(venue, venue), 0);
  assert.equal(isWithinGeofence({ latitude: -6.2, longitude: 106.8, accuracy: 5 }, venue, 30), true);
  assert.equal(isWithinGeofence({ latitude: -6.2, longitude: 106.8, accuracy: 40 }, venue, 30), false);
  assert.equal(isWithinGeofence({ latitude: -6.201, longitude: 106.8, accuracy: 5 }, venue, 30), false);
});

test('rejects malformed geolocation values', () => {
  assert.equal(isWithinGeofence({ latitude: NaN, longitude: 1, accuracy: 5 }, { latitude: 0, longitude: 0 }, 50), false);
});