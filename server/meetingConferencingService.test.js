import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import {
  createMeetingConferencingService,
  MeetingConferencingError
} from './services/meetingConferencingService.js';

const liveKitEnvironment = {
  NODE_ENV: 'test',
  MEETING_VIDEO_ENABLED: 'true',
  LIVEKIT_WS_URL: 'wss://livekit.example.test',
  LIVEKIT_API_KEY: 'test-api-key',
  LIVEKIT_API_SECRET: 'test-api-secret-that-is-never-returned'
};

test('LiveKit participant tokens are scoped to one room and expose no signing secret', async () => {
  const service = createMeetingConferencingService(liveKitEnvironment);
  const result = await service.issueJoinToken({
    meetingId: 'meeting-123',
    accountId: 'account-456',
    displayName: 'Test Participant'
  });
  const claims = jwt.decode(result.token);

  assert.equal(result.server_url, 'wss://livekit.example.test');
  assert.equal(result.room_name, 'hmif-meeting-meeting-123');
  assert.equal(claims.sub, 'account-456');
  assert.equal(claims.name, 'Test Participant');
  assert.equal(claims.video.room, result.room_name);
  assert.equal(claims.video.roomJoin, true);
  assert.equal(claims.video.canPublish, true);
  assert.equal(claims.video.canSubscribe, true);
  assert.equal(claims.video.canPublishData, false);
  assert.ok(!JSON.stringify(result).includes(liveKitEnvironment.LIVEKIT_API_SECRET));
});

test('video and recording capabilities fail closed until all configuration and policy gates are present', async () => {
  const service = createMeetingConferencingService({
    ...liveKitEnvironment,
    MEETING_RECORDING_ENABLED: 'true',
    MEETING_RECORDING_S3_BUCKET: 'private-recordings',
    MEETING_RECORDING_S3_ACCESS_KEY: 'test-access-key',
    MEETING_RECORDING_S3_SECRET_KEY: 'test-secret-key'
  });
  assert.deepEqual(service.capabilities(), {
    videoEnabled: true,
    videoProvider: 'livekit',
    recordingEnabled: false,
    recordingDisabledReason: 'policy_pending',
    googleMeetEnabled: false
  });
  assert.throws(
    () => createMeetingConferencingService({ LIVEKIT_API_KEY: 'partial' }),
    /must be configured together/
  );
  assert.throws(
    () => createMeetingConferencingService({ ...liveKitEnvironment, NODE_ENV: 'production', LIVEKIT_WS_URL: 'ws://livekit.example.test' }),
    /Production LiveKit endpoints must use WSS and HTTPS/
  );
  assert.throws(
    () => createMeetingConferencingService({
      ...liveKitEnvironment,
      NODE_ENV: 'production',
      MEETING_RECORDING_S3_BUCKET: 'private-recordings',
      MEETING_RECORDING_S3_ACCESS_KEY: 'test-access-key',
      MEETING_RECORDING_S3_SECRET_KEY: 'test-secret-key',
      MEETING_RECORDING_S3_ENDPOINT: 'http://storage.example.test'
    }),
    /MEETING_RECORDING_S3_ENDPOINT must use https:/
  );
});

test('disabled video requests return a controlled service-unavailable error', async () => {
  const service = createMeetingConferencingService({});
  assert.equal(service.capabilities().videoEnabled, false);
  await assert.rejects(
    () => service.issueJoinToken({ meetingId: 'meeting-123', accountId: 'account-456', displayName: 'Member' }),
    (error) => error instanceof MeetingConferencingError && error.status === 503
  );
});
