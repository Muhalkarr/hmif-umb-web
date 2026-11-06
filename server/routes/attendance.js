/* ==========================================================================
   ATTENDANCE ROUTES — Presensi QR-Code (Pilar 4)
   ========================================================================== */
import { createHash, timingSafeEqual, randomBytes, randomUUID } from 'node:crypto';
import { distanceInMeters, isWithinGeofence } from '../attendance.js';

export function registerAttendanceRoutes(app, ctx) {
  const { db, requireAuth, requireClearance, auditAdminMutation, getHmifCalendarDate } = ctx;

  // POST /api/attendance/sessions — Buat sesi QR presensi (Clearance >= 2)
  app.post('/api/attendance/sessions', requireClearance(2), (req, res) => {
    const { event_id: eventId, latitude, longitude, radius_m: radiusMeters, duration_minutes: durationMinutes = 30 } = req.body || {};
    const event = db.getAllCalendarEvents().find((item) => item.id === eventId);
    if (!event || event.date_str !== getHmifCalendarDate()) {
      return res.status(400).json({ error: 'Sesi presensi hanya dapat dibuat untuk event hari ini.' });
    }
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
      || !Number.isFinite(radiusMeters) || radiusMeters < 10 || radiusMeters > 500
      || !Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 180) {
      return res.status(400).json({ error: 'Koordinat venue, radius (10-500 m), dan durasi (5-180 menit) wajib valid.' });
    }
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const session = db.createAttendanceSession({
      eventId,
      tokenHash,
      latitude,
      longitude,
      radiusMeters,
      durationMinutes,
      createdBy: req.user.nim
    });
    auditAdminMutation(req, 'attendance.session_create', 'attendance_session', session.id, { eventId, radiusMeters, expiresAt: session.expires_at });
    res.set('Cache-Control', 'no-store');
    res.status(201).json({ session, token, event: { id: event.id, title: event.title } });
  });

  // POST /api/attendance — Catat presensi via scan QR
  app.post('/api/attendance', requireAuth, (req, res) => {
    const { event_id: eventId, session_id: sessionId, session_token: sessionToken, latitude, longitude, accuracy_m: accuracy } = req.body || {};
    if (typeof eventId !== 'string' || typeof sessionId !== 'string'
      || typeof sessionToken !== 'string' || sessionToken.length < 32 || sessionToken.length > 128
      || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
      || !Number.isFinite(accuracy) || accuracy <= 0 || accuracy > 1000) {
      return res.status(400).json({ error: 'QR sesi dan koordinat GPS yang valid wajib disertakan.' });
    }
    const session = db.getAttendanceSession(sessionId, eventId);
    if (!session) return res.status(404).json({ error: 'Sesi QR tidak valid atau sudah diganti.' });
    const tokenHash = createHash('sha256').update(sessionToken).digest();
    const expectedHash = Buffer.from(session.token_hash, 'hex');
    if (tokenHash.length !== expectedHash.length || !timingSafeEqual(tokenHash, expectedHash))
      return res.status(404).json({ error: 'Sesi QR tidak valid atau sudah diganti.' });
    const now = Date.now();
    if (now < Date.parse(session.starts_at) || now > Date.parse(session.expires_at))
      return res.status(410).json({ error: 'Sesi presensi sudah dimulai atau kedaluwarsa.' });
    const participantLocation = { latitude, longitude, accuracy };
    const venue = { latitude: session.latitude, longitude: session.longitude };
    if (!isWithinGeofence(participantLocation, venue, session.radius_m))
      return res.status(403).json({ error: 'Lokasi berada di luar radius presensi atau akurasi GPS belum memadai.' });
    const nim = req.user.nim;
    const user = db.findUserByNIM(nim);
    if (!user) return res.status(404).json({ error: 'NIM tidak terdaftar.' });
    const record = db.recordAttendance({ account_id: user.account_id, event_id: eventId, session_id: sessionId, nim, name: user.name, division: user.division, latitude, longitude, accuracy_m: accuracy, scanned_at: new Date(now).toISOString() });
    if (record.error) return res.status(409).json({ error: record.error });
    res.status(201).json({ message: `PRESENSI TERCATAT // ${user.name} (${nim})`, attendance: record, distance_m: Math.round(distanceInMeters(participantLocation, venue)) });
  });

  // GET /api/attendance/:eventId — Daftar hadir event (Clearance >= 2)
  app.get('/api/attendance/:eventId', requireClearance(2), (req, res) => {
    const records = db.getAttendanceByEvent(req.params.eventId);
    res.json({ event_id: req.params.eventId, total: records.length, records });
  });
}