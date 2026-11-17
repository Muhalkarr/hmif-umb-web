import assert from 'node:assert/strict';
import test from 'node:test';
import { createMeetingRecordingLifecycle } from './services/meetingRecordingLifecycle.js';

test('recording lifecycle reconciles egress and deletes expired media with audit records', async () => {
  const activeRecording = {
    id: 'recording-active',
    meeting_id: 'meeting-active',
    egress_id: 'egress-1',
    status: 'stopping'
  };
  const expiredRecording = {
    id: 'recording-expired',
    meeting_id: 'meeting-expired',
    storage_key: 'hmif/meetings/meeting-expired/recording-expired.mp4'
  };
  const updates = [];
  const audits = [];
  const deletedKeys = [];
  const db = {
    listActiveMeetingRecordings: () => [activeRecording],
    listExpiredMeetingRecordings: () => [expiredRecording],
    updateMeetingRecordingStatus: (...args) => {
      updates.push(args);
      return { id: args[0], meeting_id: args[1] };
    },
    insertAudit: (entry) => audits.push(entry)
  };
  const conferencingService = {
    getRecordingStatus: async () => ({ status: 'completed', failureCode: '' }),
    deleteRecording: async (key) => deletedKeys.push(key)
  };

  await createMeetingRecordingLifecycle({
    db,
    conferencingService,
    logger: { error: assert.fail }
  }).run();

  assert.equal(updates[0][2], 'completed');
  assert.equal(updates[1][2], 'expired');
  assert.deepEqual(deletedKeys, [expiredRecording.storage_key]);
  assert.deepEqual(audits.map(({ action }) => action), [
    'meeting_recording_completed',
    'meeting_recording_expired'
  ]);
});

test('recording lifecycle keeps expired metadata retryable when object deletion fails', async () => {
  const expiredRecording = {
    id: 'recording-expired',
    meeting_id: 'meeting-expired',
    storage_key: 'hmif/meetings/meeting-expired/recording-expired.mp4'
  };
  const updates = [];
  const errors = [];
  const db = {
    listActiveMeetingRecordings: () => [],
    listExpiredMeetingRecordings: () => [expiredRecording],
    updateMeetingRecordingStatus: (...args) => {
      updates.push(args);
      return { id: args[0] };
    },
    insertAudit: assert.fail
  };
  const lifecycle = createMeetingRecordingLifecycle({
    db,
    conferencingService: {
      getRecordingStatus: assert.fail,
      deleteRecording: async () => { throw new Error('storage unavailable'); }
    },
    logger: { error: (...args) => errors.push(args) }
  });

  await lifecycle.run();

  assert.equal(updates.length, 0);
  assert.equal(errors.length, 1);
});
