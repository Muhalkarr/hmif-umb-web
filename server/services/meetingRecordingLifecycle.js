const SYSTEM_ACTOR = { actorNim: 'SYSTEM', actorRole: 'system' };
const DEFAULT_INTERVAL_MS = 60 * 1000;
const BATCH_SIZE = 100;

export const createMeetingRecordingLifecycle = ({
  db,
  conferencingService,
  intervalMs = DEFAULT_INTERVAL_MS,
  logger = console
}) => {
  let interval = null;
  let running = false;

  const recordSystemAudit = (action, recording, details) => {
    db.insertAudit({
      ...SYSTEM_ACTOR,
      action,
      targetType: 'meeting_recording',
      targetId: recording.id,
      details: { meeting_id: recording.meeting_id, ...details }
    });
  };

  const run = async () => {
    if (running) return;
    running = true;
    try {
      for (const recording of db.listActiveMeetingRecordings(BATCH_SIZE)) {
        try {
          const providerState = await conferencingService.getRecordingStatus(recording.egress_id);
          if (!providerState || !['recording', 'stopping', 'completed', 'failed'].includes(providerState.status)) {
            continue;
          }
          if (providerState.status === recording.status) continue;

          const updated = db.updateMeetingRecordingStatus(
            recording.id,
            recording.meeting_id,
            providerState.status,
            {
              stoppedAt: ['completed', 'failed'].includes(providerState.status) ? new Date().toISOString() : null,
              failureCode: providerState.failureCode || ''
            }
          );
          if (updated && ['completed', 'failed'].includes(providerState.status)) {
            recordSystemAudit(`meeting_recording_${providerState.status}`, recording, {
              failure_code: providerState.failureCode || ''
            });
          }
        } catch (error) {
          logger.error(`[MeetingRecordingLifecycle] Gagal menyinkronkan rekaman ${recording.id}:`, error);
        }
      }

      for (const recording of db.listExpiredMeetingRecordings(new Date().toISOString(), BATCH_SIZE)) {
        try {
          await conferencingService.deleteRecording(recording.storage_key);
          const updated = db.updateMeetingRecordingStatus(
            recording.id,
            recording.meeting_id,
            'expired'
          );
          if (updated) recordSystemAudit('meeting_recording_expired', recording, {});
        } catch (error) {
          logger.error(`[MeetingRecordingLifecycle] Gagal menghapus rekaman kedaluwarsa ${recording.id}:`, error);
        }
      }
    } finally {
      running = false;
    }
  };

  return {
    start() {
      if (interval) return;
      void run().catch((error) => {
        logger.error('[MeetingRecordingLifecycle] Siklus pemeliharaan gagal:', error);
      });
      interval = setInterval(() => {
        void run().catch((error) => {
          logger.error('[MeetingRecordingLifecycle] Siklus pemeliharaan gagal:', error);
        });
      }, intervalMs);
      interval.unref?.();
    },
    stop() {
      if (!interval) return;
      clearInterval(interval);
      interval = null;
    },
    run
  };
};
