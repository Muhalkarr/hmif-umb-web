import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { decryptPrivateText, encryptPrivateText, validateAspirationSubmission } from './studentServices.js';

const key = randomBytes(32);

test('encrypts confidential helpdesk text and detects tampering', () => {
  const encrypted = encryptPrivateText('Keluhan fasilitas privat', key);
  assert.notEqual(encrypted, 'Keluhan fasilitas privat');
  assert.equal(decryptPrivateText(encrypted, key), 'Keluhan fasilitas privat');
  assert.throws(() => decryptPrivateText(`${encrypted.slice(0, -1)}x`, key), /terenkripsi/);
});

test('forces anonymous submissions to omit supplied identity', () => {
  const submission = validateAspirationSubmission({
    sender: 'Should Not Persist',
    is_anonymous: true,
    category: 'Fasilitas Lab',
    message: 'Mohon tindak lanjut fasilitas.'
  });
  assert.equal(submission.sender, 'Anonim (Mahasiswa)');
  assert.equal(submission.is_anonymous, true);
});

test('uses authenticated identity only when the member chooses non-anonymous mode', () => {
  const member = { name: 'Mahasiswa Uji', nim: '12345678' };
  assert.equal(validateAspirationSubmission({ is_anonymous: false, message: 'Saran.' }, member).sender, 'Mahasiswa Uji (12345678)');
  assert.throws(() => validateAspirationSubmission({ is_anonymous: false, message: 'Saran.' }), /Nama wajib/);
});