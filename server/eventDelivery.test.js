import assert from 'node:assert/strict';
import test from 'node:test';
import { sendEventTicketEmail } from './eventDelivery.js';

const ticketData = {
  email: 'participant@example.org',
  name: 'Peserta Uji',
  event: { title: 'Workshop HMIF', date: '2026-10-05' },
  ticket: { id: 'ticket-123', token: 'private-ticket-token' }
};

test('keeps ticket registration available when email delivery is not configured', async () => {
  assert.deepEqual(await sendEventTicketEmail(ticketData, { apiKey: '', from: '' }), {
    sent: false,
    reason: 'not_configured'
  });
});

test('sends a QR ticket attachment through the configured email provider', async () => {
  let request;
  const delivery = await sendEventTicketEmail(ticketData, {
    apiKey: 'test-api-key',
    from: 'HMIF Events <events@example.org>',
    fetchImpl: async (url, options) => {
      request = { url, options, payload: JSON.parse(options.body) };
      return { ok: true };
    }
  });
  assert.deepEqual(delivery, { sent: true });
  assert.equal(request.url, 'https://api.resend.com/emails');
  assert.equal(request.payload.to[0], ticketData.email);
  assert.equal(request.payload.attachments[0].filename, 'hmif-ticket-ticket-123.png');
  assert.ok(Buffer.from(request.payload.attachments[0].content, 'base64').subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
});