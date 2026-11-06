import QRCode from 'qrcode';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[character]));

export const sendEventTicketEmail = async ({ email, name, event, ticket }, {
  apiKey = process.env.RESEND_API_KEY,
  from = process.env.EVENT_EMAIL_FROM,
  fetchImpl = fetch
} = {}) => {
  if (!apiKey || !from) return { sent: false, reason: 'not_configured' };
  try {
    const qrPayload = JSON.stringify({ type: 'hmif-event-ticket', id: ticket.id, token: ticket.token });
    const qrPng = await QRCode.toBuffer(qrPayload, { errorCorrectionLevel: 'M', margin: 1, width: 480 });
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        from,
        to: [email],
        subject: `E-Ticket ${event.title} // HMIF UMB`,
        html: `<p>Halo ${escapeHtml(name)}, pendaftaran Anda untuk <strong>${escapeHtml(event.title)}</strong> berhasil.</p><p>Tanggal event: ${escapeHtml(event.date)}</p><p>Tunjukkan QR ticket terlampir kepada petugas check-in. Tiket berlaku satu kali pada tanggal event.</p><p>ID tiket: ${escapeHtml(ticket.id)}</p>`,
        text: `Halo ${name}, pendaftaran ${event.title} berhasil. Tanggal event: ${event.date}. Tunjukkan QR ticket terlampir kepada petugas check-in. ID tiket: ${ticket.id}.`,
        attachments: [{ filename: `hmif-ticket-${ticket.id}.png`, content: qrPng.toString('base64') }]
      })
    });
    return response.ok
      ? { sent: true }
      : { sent: false, reason: 'provider_error' };
  } catch {
    return { sent: false, reason: 'provider_unavailable' };
  }
};