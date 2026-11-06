import { randomUUID } from 'node:crypto';
import { getHmifCalendarDate } from '../db.js';

/**
 * SQLite & memory operations owned by Events, Calendar, Ticketing, and Certificates.
 */
export const createEventsSqlRepository = ({ sqlite, read, write }) => {
  const repo = {
    getAllCalendarEvents() {
      return read().academic_calendar;
    },

    createCalendarEvent(eventData) {
      const db = read();
      const newEvent = {
        id: `cal-${randomUUID()}`,
        date_str: eventData.date_str,
        title: eventData.title,
        type: eventData.type || 'proker',
        division: eventData.division || 'Umum',
        location: eventData.location || 'Kampus UMB',
        desc: eventData.desc || '',
        integrated_with: eventData.integrated_with || 'Divisi HMIF',
        registration_url: eventData.registration_url || '',
        is_exam_period: Boolean(eventData.is_exam_period),
        registration_open: Boolean(eventData.registration_open),
        capacity: eventData.registration_open ? Number(eventData.capacity) : null
      };
      db.academic_calendar.push(newEvent);
      write(db);
      return newEvent;
    },

    listMyEventTickets(accountId) {
      const events = new Map(repo.getAllCalendarEvents().map((event) => [event.id, event]));
      return sqlite.prepare(`SELECT id, event_id, participant_name, ticket_token_encrypted, checked_in_at, created_at
        FROM event_registrations WHERE account_id = ? ORDER BY created_at DESC`).all(accountId)
        .map((registration) => ({
          ...registration,
          event: events.get(registration.event_id) ? {
            id: registration.event_id,
            title: events.get(registration.event_id).title,
            date: events.get(registration.event_id).date_str,
            location: events.get(registration.event_id).location || ''
          } : null
        }))
        .filter((registration) => registration.event);
    },

    storeMyEventTicketToken(registrationId, accountId, tokenHash, encryptedToken) {
      const result = sqlite.prepare(`UPDATE event_registrations SET ticket_token_hash = ?, ticket_token_encrypted = ?
        WHERE id = ? AND account_id = ? AND checked_in_at IS NULL`).run(tokenHash, encryptedToken, registrationId, accountId);
      return result.changes > 0;
    },

    registerEvent(eventId, registrationData) {
      const register = sqlite.transaction((data) => {
        const event = read().academic_calendar.find((item) => item.id === eventId);
        if (!event || !event.registration_open) return { error: 'Pendaftaran event tidak tersedia.' };
        if (event.date_str < getHmifCalendarDate()) return { error: 'Pendaftaran event telah ditutup.' };
        const existing = sqlite.prepare('SELECT id FROM event_registrations WHERE event_id = ? AND email = ? COLLATE NOCASE').get(eventId, data.email);
        if (existing) return { error: 'Email ini sudah terdaftar pada event tersebut.' };
        const currentCount = sqlite.prepare('SELECT COUNT(*) AS count FROM event_registrations WHERE event_id = ?').get(eventId).count;
        if (event.capacity && currentCount >= event.capacity) return { error: 'Kuota pendaftaran event telah terpenuhi.' };
        const registration = {
          id: `ticket-${randomUUID()}`,
          event_id: eventId,
          account_id: data.accountId || null,
          participant_name: data.name,
          email: data.email,
          ticket_token_hash: data.ticketTokenHash,
          ticket_token_encrypted: data.ticketTokenEncrypted || null,
          checked_in_at: null,
          created_at: new Date().toISOString()
        };
        sqlite.prepare(`INSERT INTO event_registrations
          (id, event_id, account_id, participant_name, email, ticket_token_hash, ticket_token_encrypted, checked_in_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          registration.id, registration.event_id, registration.account_id, registration.participant_name,
          registration.email, registration.ticket_token_hash, registration.ticket_token_encrypted, registration.checked_in_at, registration.created_at
        );
        return { registration, event };
      });
      return register.immediate(registrationData);
    },

    checkInEventRegistration(eventId, registrationId, ticketTokenHash, now = new Date()) {
      const event = read().academic_calendar.find((item) => item.id === eventId);
      if (!event) return null;
      const ticket = sqlite.prepare(`SELECT checked_in_at FROM event_registrations
        WHERE event_id = ? AND id = ? AND ticket_token_hash = ?`).get(eventId, registrationId, ticketTokenHash);
      if (!ticket || ticket.checked_in_at) return null;
      if (event.date_str !== getHmifCalendarDate(now)) {
        return { error: 'Presensi hanya dapat dicatat pada tanggal event (Asia/Jakarta).', status: 409 };
      }
      const checkedInAt = now.toISOString();
      const update = sqlite.prepare(`UPDATE event_registrations SET checked_in_at = ?
        WHERE event_id = ? AND id = ? AND ticket_token_hash = ? AND checked_in_at IS NULL`);
      const result = update.run(checkedInAt, eventId, registrationId, ticketTokenHash);
      if (!result.changes) return null;
      return sqlite.prepare('SELECT id, event_id, checked_in_at FROM event_registrations WHERE id = ?').get(registrationId);
    },

    issueEventCertificates(eventId) {
      const issue = sqlite.transaction(() => {
        const eligibleParticipants = sqlite.prepare(`SELECT id FROM event_registrations
          WHERE event_id = ? AND checked_in_at IS NOT NULL
          AND id NOT IN (SELECT registration_id FROM event_certificates WHERE revoked_at IS NULL)`).all(eventId);
        const eligibleMembers = sqlite.prepare(`SELECT id FROM attendance_records
          WHERE event_id = ? AND id NOT IN (SELECT attendance_id FROM attendance_certificates WHERE revoked_at IS NULL)`).all(eventId);
        const now = new Date().toISOString();
        const insertParticipant = sqlite.prepare(`INSERT INTO event_certificates (id, event_id, registration_id, issued_at, revoked_at)
          VALUES (?, ?, ?, ?, NULL)`);
        const insertMember = sqlite.prepare(`INSERT INTO attendance_certificates (id, event_id, attendance_id, issued_at, revoked_at)
          VALUES (?, ?, ?, ?, NULL)`);
        const certificateIds = eligibleParticipants.map(({ id }) => {
          const certificateId = randomUUID();
          insertParticipant.run(certificateId, eventId, id, now);
          return certificateId;
        });
        for (const { id } of eligibleMembers) {
          const certificateId = randomUUID();
          insertMember.run(certificateId, eventId, id, now);
          certificateIds.push(certificateId);
        }
        return certificateIds;
      });
      return issue.immediate();
    },

    getVerifiedCertificate(certificateId) {
      const participantCertificate = sqlite.prepare(`SELECT event_id, registration_id, issued_at FROM event_certificates
        WHERE id = ? AND revoked_at IS NULL`).get(certificateId);
      if (participantCertificate) {
        const registration = sqlite.prepare('SELECT participant_name FROM event_registrations WHERE id = ?').get(participantCertificate.registration_id);
        const event = read().academic_calendar.find((item) => item.id === participantCertificate.event_id);
        if (!registration || !event) return null;
        return {
          id: certificateId,
          participant_name: registration.participant_name,
          recipient_type: 'Peserta',
          event_title: event.title,
          event_date: event.date_str,
          issued_at: participantCertificate.issued_at
        };
      }

      const attendanceCertificate = sqlite.prepare(`SELECT event_id, attendance_id, issued_at FROM attendance_certificates
        WHERE id = ? AND revoked_at IS NULL`).get(certificateId);
      if (!attendanceCertificate) return null;
      const attendance = sqlite.prepare('SELECT name FROM attendance_records WHERE id = ?').get(attendanceCertificate.attendance_id);
      const event = read().academic_calendar.find((item) => item.id === attendanceCertificate.event_id);
      if (!attendance || !event) return null;
      return {
        id: certificateId,
        participant_name: attendance.name,
        recipient_type: 'Panitia/Anggota',
        event_title: event.title,
        event_date: event.date_str,
        issued_at: attendanceCertificate.issued_at
      };
    },

    // ─── Attendance / Presensi ────────────────────────────────────────────────
    createAttendanceSession({ eventId, tokenHash, latitude, longitude, radiusMeters, durationMinutes, createdBy }) {
      const now = new Date();
      const record = {
        id: randomUUID(),
        event_id: eventId,
        token_hash: tokenHash,
        latitude,
        longitude,
        radius_m: radiusMeters,
        starts_at: now.toISOString(),
        expires_at: new Date(now.getTime() + durationMinutes * 60000).toISOString(),
        created_by: createdBy,
        created_at: now.toISOString(),
        revoked_at: null
      };
      const create = sqlite.transaction(() => {
        sqlite.prepare('UPDATE attendance_sessions SET revoked_at = ? WHERE event_id = ? AND revoked_at IS NULL')
          .run(record.created_at, eventId);
        sqlite.prepare(`INSERT INTO attendance_sessions
          (id, event_id, token_hash, latitude, longitude, radius_m, starts_at, expires_at, created_by, created_at, revoked_at)
          VALUES (@id, @event_id, @token_hash, @latitude, @longitude, @radius_m, @starts_at, @expires_at, @created_by, @created_at, @revoked_at)`)
          .run(record);
      });
      create.immediate();
      const { token_hash, ...safeRecord } = record;
      return safeRecord;
    },

    getAttendanceSession(id, eventId) {
      return sqlite.prepare('SELECT * FROM attendance_sessions WHERE id = ? AND event_id = ? AND revoked_at IS NULL').get(id, eventId) || null;
    },

    recordAttendance(recordData) {
      const existing = recordData.account_id
        ? sqlite.prepare('SELECT id FROM attendance_records WHERE event_id = ? AND account_id = ?').get(recordData.event_id, recordData.account_id)
        : sqlite.prepare('SELECT id FROM attendance_records WHERE event_id = ? AND nim = ?').get(recordData.event_id, recordData.nim);
      if (existing) {
        return { error: `Presensi sudah tercatat untuk NIM ${recordData.nim} pada event ini.` };
      }

      const newRecord = {
        id: randomUUID(),
        event_id: recordData.event_id,
        session_id: recordData.session_id || null,
        account_id: recordData.account_id || null,
        nim: recordData.nim,
        name: recordData.name,
        division: recordData.division || '',
        latitude: recordData.latitude ?? null,
        longitude: recordData.longitude ?? null,
        accuracy_m: recordData.accuracy_m ?? null,
        scanned_at: recordData.scanned_at || new Date().toISOString(),
        created_at: new Date().toISOString()
      };
      sqlite.prepare(`
        INSERT INTO attendance_records (id, event_id, session_id, account_id, nim, name, division, latitude, longitude, accuracy_m, scanned_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        newRecord.id,
        newRecord.event_id,
        newRecord.session_id,
        newRecord.account_id,
        newRecord.nim,
        newRecord.name,
        newRecord.division,
        newRecord.latitude,
        newRecord.longitude,
        newRecord.accuracy_m,
        newRecord.scanned_at,
        newRecord.created_at
      );
      return newRecord;
    },

    getAttendanceByEvent(eventId) {
      return sqlite.prepare(
        'SELECT * FROM attendance_records WHERE event_id = ? ORDER BY scanned_at ASC'
      ).all(eventId);
    },

    getCadetAttendance(nim, findUserByNIM) {
      const user = findUserByNIM ? findUserByNIM(nim) : null;
      if (user) return repo.getCadetAttendanceByAccountId(user.account_id);
      return sqlite.prepare(
        'SELECT * FROM attendance_records WHERE nim = ? ORDER BY scanned_at ASC'
      ).all(nim);
    },

    getCadetAttendanceByAccountId(accountId) {
      return sqlite.prepare('SELECT * FROM attendance_records WHERE account_id = ? ORDER BY scanned_at ASC').all(accountId);
    },

    getTodayAttendanceCount() {
      const today = getHmifCalendarDate();
      const row = sqlite.prepare(
        "SELECT COUNT(*) as c FROM attendance_records WHERE date(created_at) = ?"
      ).get(today);
      return row?.c ?? 0;
    }
  };

  return repo;
};
