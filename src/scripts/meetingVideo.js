export async function connectMeetingVideo(container, { server_url: serverUrl, token }, onStatus = () => {}) {
  const { Room, RoomEvent } = await import('livekit-client');
  const mediaGrid = container.querySelector('[data-video-media-grid]');
  const status = container.querySelector('[data-video-call-status]');
  const tracks = new Map();
  const room = new Room({ adaptiveStream: true, dynacast: true });
  let microphoneEnabled = false;
  let cameraEnabled = false;
  let screenShareEnabled = false;
  let closed = false;
  let removalObserver;

  const setStatus = (message) => {
    if (status) status.textContent = message;
    onStatus(message);
  };

  const addTrack = (track, participant, isLocal = false) => {
    if (!mediaGrid || tracks.has(track)) return;
    const tile = document.createElement('article');
    tile.className = `meeting-video-tile${isLocal ? ' is-local' : ''}`;
    const label = document.createElement('span');
    label.className = 'meeting-video-participant';
    label.textContent = participant.name || participant.identity || 'Peserta rapat';
    const media = track.attach();
    if (track.kind === 'video') {
      media.className = 'meeting-video-track';
      media.autoplay = true;
      media.playsInline = true;
      if (isLocal) media.muted = true;
    } else {
      media.className = 'meeting-audio-track';
      media.autoplay = true;
    }
    tile.append(media, label);
    mediaGrid.append(tile);
    tracks.set(track, { tile, media });
  };

  const removeTrack = (track) => {
    const entry = tracks.get(track);
    if (!entry) return;
    track.detach(entry.media);
    entry.tile.remove();
    tracks.delete(track);
  };

  const closeCall = () => {
    if (closed) return;
    closed = true;
    removalObserver?.disconnect();
    room.disconnect();
    container.hidden = true;
    mediaGrid?.replaceChildren();
    tracks.clear();
    onStatus('closed');
    container.dispatchEvent(new Event('meeting-video-closed', { bubbles: true }));
  };

  room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => addTrack(track, participant));
  room.on(RoomEvent.TrackUnsubscribed, removeTrack);
  room.on(RoomEvent.Disconnected, () => {
    if (closed) return;
    setStatus('Koneksi rapat terputus.');
    tracks.forEach(({ tile }) => tile.remove());
    tracks.clear();
  });
  room.on(RoomEvent.ConnectionStateChanged, (state) => {
    if (state === 'reconnecting') setStatus('Menyambungkan ulang ke rapat...');
    if (state === 'connected') setStatus('Terhubung ke rapat.');
  });

  try {
    await room.connect(serverUrl, token);
    setStatus('Terhubung. Meminta izin mikrofon dan kamera...');
    try {
      const publication = await room.localParticipant.setMicrophoneEnabled(true);
      microphoneEnabled = Boolean(publication);
      if (publication?.track) addTrack(publication.track, room.localParticipant, true);
    } catch {
      setStatus('Terhubung; izin mikrofon tidak diberikan. Kamera dapat diaktifkan terpisah.');
    }
    try {
      const publication = await room.localParticipant.setCameraEnabled(true);
      cameraEnabled = Boolean(publication);
      if (publication?.track) addTrack(publication.track, room.localParticipant, true);
    } catch {
      if (!microphoneEnabled) setStatus('Terhubung tanpa mikrofon/kamera. Periksa izin perangkat browser.');
    }

    const microphoneButton = container.querySelector('[data-video-microphone]');
    const cameraButton = container.querySelector('[data-video-camera]');
    const screenShareButton = container.querySelector('[data-video-screen-share]');
    const leaveButton = container.querySelector('[data-video-leave]');

    const updateButton = (button, enabled, onText, offText) => {
      if (!button) return;
      button.setAttribute('aria-pressed', String(enabled));
      button.textContent = enabled ? onText : offText;
    };

    const toggleMicrophone = async () => {
      microphoneEnabled = !microphoneEnabled;
      try {
        await room.localParticipant.setMicrophoneEnabled(microphoneEnabled);
        updateButton(microphoneButton, microphoneEnabled, 'MATIKAN MIKROFON', 'NYALAKAN MIKROFON');
      } catch {
        microphoneEnabled = !microphoneEnabled;
        setStatus('Mikrofon tidak dapat diubah. Periksa izin perangkat browser.');
      }
    };

    const toggleCamera = async () => {
      cameraEnabled = !cameraEnabled;
      try {
        const publication = await room.localParticipant.setCameraEnabled(cameraEnabled);
        if (publication?.track && cameraEnabled) addTrack(publication.track, room.localParticipant, true);
        if (!cameraEnabled) {
          room.localParticipant.videoTrackPublications.forEach((publicationEntry) => {
            if (publicationEntry.source === 'camera' && publicationEntry.track) removeTrack(publicationEntry.track);
          });
        }
        updateButton(cameraButton, cameraEnabled, 'MATIKAN KAMERA', 'NYALAKAN KAMERA');
      } catch {
        cameraEnabled = !cameraEnabled;
        setStatus('Kamera tidak dapat diubah. Periksa izin perangkat browser.');
      }
    };

    const toggleScreenShare = async () => {
      screenShareEnabled = !screenShareEnabled;
      try {
        const publication = await room.localParticipant.setScreenShareEnabled(screenShareEnabled);
        if (publication?.track && screenShareEnabled) addTrack(publication.track, room.localParticipant, true);
        updateButton(screenShareButton, screenShareEnabled, 'HENTIKAN BERBAGI LAYAR', 'BAGIKAN LAYAR');
      } catch {
        screenShareEnabled = !screenShareEnabled;
        setStatus('Berbagi layar tidak dapat dimulai.');
      }
    };

    microphoneButton?.addEventListener('click', toggleMicrophone);
    cameraButton?.addEventListener('click', toggleCamera);
    screenShareButton?.addEventListener('click', toggleScreenShare);
    leaveButton?.addEventListener('click', closeCall, { once: true });

    updateButton(microphoneButton, microphoneEnabled, 'MATIKAN MIKROFON', 'NYALAKAN MIKROFON');
    updateButton(cameraButton, cameraEnabled, 'MATIKAN KAMERA', 'NYALAKAN KAMERA');
    updateButton(screenShareButton, screenShareEnabled, 'HENTIKAN BERBAGI LAYAR', 'BAGIKAN LAYAR');
    container.hidden = false;
    removalObserver = new MutationObserver(() => {
      if (!container.isConnected) closeCall();
    });
    removalObserver.observe(document.body, { childList: true, subtree: true });

    return {
      room,
      disconnect: closeCall
    };
  } catch (error) {
    room.disconnect();
    throw error;
  }
}
