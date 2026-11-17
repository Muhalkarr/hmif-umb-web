import {
  AccessToken,
  EgressClient,
  EgressStatus,
  EncodedFileOutput,
  EncodedFileType,
  S3Upload
} from 'livekit-server-sdk';
import { DeleteObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const RECORDING_URL_TTL_SECONDS = 300;
const RECORDING_RETENTION_MAX_DAYS = 3650;

export class MeetingConferencingError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'MeetingConferencingError';
    this.status = status;
    this.code = code;
  }
}

const normalizeUrl = (value, protocols, label) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }
  if (!protocols.includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error(`${label} must use ${protocols.join(' or ')} without credentials or a fragment.`);
  }
  return url.toString().replace(/\/$/, '');
};

const readConfiguration = (env) => {
  const liveKitValues = [
    env.LIVEKIT_WS_URL || env.LIVEKIT_URL,
    env.LIVEKIT_API_KEY,
    env.LIVEKIT_API_SECRET
  ];
  const liveKitConfigured = liveKitValues.every(Boolean);
  const liveKitPartiallyConfigured = liveKitValues.some(Boolean) && !liveKitConfigured;
  if (liveKitPartiallyConfigured) {
    throw new Error('LIVEKIT_WS_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET must be configured together.');
  }

  const videoEnabled = env.MEETING_VIDEO_ENABLED === 'true' && liveKitConfigured;
  let liveKitWsUrl = '';
  let liveKitApiUrl = '';
  if (liveKitConfigured) {
    liveKitWsUrl = normalizeUrl(env.LIVEKIT_WS_URL || env.LIVEKIT_URL, ['wss:', 'ws:'], 'LIVEKIT_WS_URL');
    liveKitApiUrl = normalizeUrl(
      env.LIVEKIT_API_URL || liveKitWsUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:'),
      ['https:', 'http:'],
      'LIVEKIT_API_URL'
    );
    if (env.NODE_ENV === 'production' && (liveKitWsUrl.startsWith('ws:') || liveKitApiUrl.startsWith('http:'))) {
      throw new Error('Production LiveKit endpoints must use WSS and HTTPS.');
    }
  }

  const retentionDays = Number(env.MEETING_RECORDING_RETENTION_DAYS);
  const validRetention = Number.isInteger(retentionDays)
    && retentionDays >= 1
    && retentionDays <= RECORDING_RETENTION_MAX_DAYS;
  const s3Values = [
    env.MEETING_RECORDING_S3_BUCKET,
    env.MEETING_RECORDING_S3_ACCESS_KEY,
    env.MEETING_RECORDING_S3_SECRET_KEY
  ];
  const s3Configured = s3Values.every(Boolean);
  const s3PartiallyConfigured = s3Values.some(Boolean) && !s3Configured;
  if (s3PartiallyConfigured) {
    throw new Error('Recording S3 bucket, access key, and secret key must be configured together.');
  }
  const recordingS3Endpoint = env.MEETING_RECORDING_S3_ENDPOINT
    ? normalizeUrl(
      env.MEETING_RECORDING_S3_ENDPOINT,
      env.NODE_ENV === 'production' ? ['https:'] : ['https:', 'http:'],
      'MEETING_RECORDING_S3_ENDPOINT'
    )
    : '';
  const recordingEnabled = env.MEETING_RECORDING_ENABLED === 'true'
    && env.MEETING_RECORDING_POLICY_APPROVED === 'true'
    && videoEnabled
    && validRetention
    && s3Configured;

  return {
    videoEnabled,
    liveKitConfigured,
    recordingEnabled,
    liveKitWsUrl,
    liveKitApiUrl,
    liveKitApiKey: env.LIVEKIT_API_KEY || '',
    liveKitApiSecret: env.LIVEKIT_API_SECRET || '',
    recordingRetentionDays: validRetention ? retentionDays : null,
    recordingS3: s3Configured ? {
      bucket: env.MEETING_RECORDING_S3_BUCKET,
      accessKey: env.MEETING_RECORDING_S3_ACCESS_KEY,
      secretKey: env.MEETING_RECORDING_S3_SECRET_KEY,
      region: env.MEETING_RECORDING_S3_REGION || 'us-east-1',
      endpoint: recordingS3Endpoint,
      forcePathStyle: env.MEETING_RECORDING_S3_FORCE_PATH_STYLE === 'true'
    } : null,
    recordingDisabledReason: env.MEETING_RECORDING_ENABLED !== 'true'
      ? 'disabled'
      : env.MEETING_RECORDING_POLICY_APPROVED !== 'true' || !validRetention
        ? 'policy_pending'
        : !videoEnabled || !s3Configured
          ? 'provider_not_configured'
          : ''
  };
};

export const createMeetingConferencingService = (env = process.env) => {
  const config = readConfiguration(env);
  let s3Client;

  const createEgressClient = () => {
    if (!config.liveKitConfigured) {
      throw new MeetingConferencingError(503, 'video_unavailable', 'Panggilan video belum dikonfigurasi.');
    }
    return new EgressClient(config.liveKitApiUrl, config.liveKitApiKey, config.liveKitApiSecret);
  };

  const createS3Client = () => {
    if (!config.recordingS3) {
      throw new MeetingConferencingError(503, 'recording_storage_unavailable', 'Penyimpanan rekaman belum dikonfigurasi.');
    }
    if (!s3Client) {
      s3Client = new S3Client({
        region: config.recordingS3.region,
        endpoint: config.recordingS3.endpoint || undefined,
        forcePathStyle: config.recordingS3.forcePathStyle,
        credentials: {
          accessKeyId: config.recordingS3.accessKey,
          secretAccessKey: config.recordingS3.secretKey
        }
      });
    }
    return s3Client;
  };

  const assertRecordingEnabled = () => {
    if (!config.recordingEnabled) {
      throw new MeetingConferencingError(503, 'recording_unavailable', 'Perekaman belum aktif atau kebijakan retensinya belum disetujui.');
    }
  };

  return {
    capabilities() {
      return {
        videoEnabled: config.videoEnabled,
        videoProvider: config.videoEnabled ? 'livekit' : null,
        recordingEnabled: config.recordingEnabled,
        recordingDisabledReason: config.recordingDisabledReason,
        googleMeetEnabled: false
      };
    },

    async issueJoinToken({ meetingId, accountId, displayName }) {
      if (!config.videoEnabled) {
        throw new MeetingConferencingError(503, 'video_unavailable', 'Panggilan video belum dikonfigurasi.');
      }
      const roomName = `hmif-meeting-${meetingId}`;
      const token = new AccessToken(config.liveKitApiKey, config.liveKitApiSecret, {
        identity: accountId,
        name: displayName,
        ttl: '10m'
      });
      token.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: true,
        canSubscribe: true,
        canPublishData: false
      });
      return {
        provider: 'livekit',
        server_url: config.liveKitWsUrl,
        room_name: roomName,
        token: await token.toJwt(),
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
      };
    },

    async startRecording({ meetingId, recordingId }) {
      assertRecordingEnabled();
      const storageKey = `hmif/meetings/${meetingId}/${recordingId}.mp4`;
      const output = new EncodedFileOutput({
        fileType: EncodedFileType.MP4,
        filepath: storageKey,
        output: {
          case: 's3',
          value: new S3Upload({
            accessKey: config.recordingS3.accessKey,
            secret: config.recordingS3.secretKey,
            bucket: config.recordingS3.bucket,
            region: config.recordingS3.region,
            endpoint: config.recordingS3.endpoint,
            forcePathStyle: config.recordingS3.forcePathStyle
          })
        }
      });
      const egress = await createEgressClient().startRoomCompositeEgress(
        `hmif-meeting-${meetingId}`,
        { file: output }
      );
      return { egressId: egress.egressId, storageKey };
    },

    async stopRecording(egressId) {
      return createEgressClient().stopEgress(egressId);
    },

    async getRecordingStatus(egressId) {
      const [egress] = await createEgressClient().listEgress({ egressId });
      if (!egress) return null;
      const status = egress.status === EgressStatus.EGRESS_ACTIVE || egress.status === EgressStatus.EGRESS_STARTING
        ? 'recording'
        : egress.status === EgressStatus.EGRESS_ENDING
          ? 'stopping'
          : egress.status === EgressStatus.EGRESS_COMPLETE || egress.status === EgressStatus.EGRESS_LIMIT_REACHED
            ? 'completed'
            : egress.status === EgressStatus.EGRESS_FAILED || egress.status === EgressStatus.EGRESS_ABORTED
              ? 'failed'
              : 'unknown';
      return {
        status,
        failureCode: status === 'failed' ? 'provider_failed' : ''
      };
    },

    async createRecordingDownloadUrl(storageKey) {
      if (!config.recordingS3) {
        throw new MeetingConferencingError(503, 'recording_storage_unavailable', 'Penyimpanan rekaman belum dikonfigurasi.');
      }
      const url = await getSignedUrl(
        createS3Client(),
        new GetObjectCommand({ Bucket: config.recordingS3.bucket, Key: storageKey }),
        { expiresIn: RECORDING_URL_TTL_SECONDS }
      );
      return url;
    },

    async deleteRecording(storageKey) {
      await createS3Client().send(new DeleteObjectCommand({
        Bucket: config.recordingS3.bucket,
        Key: storageKey
      }));
    },

    recordingRetentionDays: config.recordingRetentionDays
  };
};
