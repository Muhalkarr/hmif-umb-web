import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export const ASPIRATION_STATUSES = ['Diterima', 'Dalam Investigasi', 'Ditindaklanjuti', 'Selesai'];

export const encryptPrivateText = (value, key) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return `enc:v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${ciphertext.toString('base64url')}`;
};

export const decryptPrivateText = (value, key) => {
  if (typeof value !== 'string' || !value.startsWith('enc:v1:')) return value ?? '';
  const [, , iv, authTag, ciphertext] = value.split(':');
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(authTag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Pesan terenkripsi tidak dapat diverifikasi.');
  }
};

export const validateAspirationSubmission = (input = {}, user = null) => {
  const message = input.message;
  if (typeof message !== 'string' || !message.trim() || message.length > 5000) {
    throw new Error('Pesan aspirasi wajib diisi dan maksimal 5000 karakter.');
  }
  if (input.is_anonymous !== undefined && typeof input.is_anonymous !== 'boolean') {
    throw new Error('Pilihan mode pengiriman tidak valid.');
  }
  const isAnonymous = input.is_anonymous !== false;
  let sender = 'Anonim (Mahasiswa)';
  if (!isAnonymous) {
    if (user) sender = `${user.name} (${user.nim})`;
    else if (typeof input.sender === 'string' && input.sender.trim() && input.sender.length <= 120) sender = input.sender.trim();
    else throw new Error('Nama wajib diisi untuk pengiriman non-anonim.');
  }
  const category = typeof input.category === 'string' && input.category.trim()
    ? input.category.trim().slice(0, 120)
    : 'Umum';
  return { sender, category, message: message.trim(), is_anonymous: isAnonymous };
};