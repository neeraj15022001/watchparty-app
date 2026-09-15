/**
 * WatchParty Pro - High-Fidelity Client Engine
 * Core Modules:
 * 1. WebSocket Signaling & Room State Machine
 * 2. NTP Clock Synchronization (Cristian's Algorithm)
 * 3. High-Precision Video Player Sync (Smooth Rate Steering & Hard Seek)
 * 4. Local File Streaming & Path Loader (HTTP Range & Chunked Upload)
 * 5. WebRTC Peer-to-Peer Mesh (Voice & Video Chat)
 * 6. Web Audio API Smart Voice Ducking
 */

(function () {
  'use strict';

  // State
  const params = new URLSearchParams(window.location.search);
  const roomId = params.get('room') || 'cinema-room-1';
  let clientId = null;
  let hostId = null;
  let myName = 'User_' + Math.floor(1000 + Math.random() * 9000);

  let socket = null;
  let clockOffset = 0; // serverTime = localTime + clockOffset
  let rtt = 0;
  let isProgrammatic = false;

  // WebRTC Mesh State
  let localStream = null;
  const peerConnections = {}; // targetClientId -> RTCPeerConnection
  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  // Web Audio Ducking State
  let audioCtx = null;
  let duckingAmount = 0.4;
  let isDucking = false;
  let duckingTimeout = null;

  // DOM Elements
  const roomDisplay = document.getElementById('room-display');
  const copyRoomBtn = document.getElementById('copy-room-btn');
  const userNameBadge = document.getElementById('user-name-badge');
  const mainVideo = document.getElementById('main-video');
  const overlayMsg = document.getElementById('overlay-msg');
  const overlayText = document.getElementById('overlay-text');
  const playPauseBtn = document.getElementById('play-pause-btn');
  const muteBtn = document.getElementById('mute-btn');
  const volumeSlider = document.getElementById('volume-slider');
  const progressContainer = document.getElementById('progress-container');
  const currentProgress = document.getElementById('current-progress');
  const bufferedBar = document.getElementById('buffered-bar');
  const timeDisplay = document.getElementById('time-display');
  const syncDriftLabel = document.getElementById('sync-drift-label');
  const syncStatus = document.getElementById('sync-status');
  const playbackRateSelect = document.getElementById('playback-rate-select');
  const fullscreenBtn = document.getElementById('fullscreen-btn');
  const playerContainer = document.getElementById('player-container');
  const videoUrlInput = document.getElementById('video-url-input');
  const loadUrlBtn = document.getElementById('load-url-btn');
  const localFileInput = document.getElementById('local-file-input');
  const localPathInput = document.getElementById('local-path-input');
  const loadPathBtn = document.getElementById('load-path-btn');
  const selectedFileName = document.getElementById('selected-file-name');
  const uploadProgressContainer = document.getElementById('upload-progress-container');
  const uploadBar = document.getElementById('upload-bar');
  const uploadPercent = document.getElementById('upload-percent');
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  const duckingAmountSlider = document.getElementById('ducking-amount');
  const duckingAmountLabel = document.getElementById('ducking-amount-label');
  const duckingLed = document.getElementById('ducking-indicator');
  const memberCount = document.getElementById('member-count');
  const toggleMicBtn = document.getElementById('toggle-mic-btn');
  const toggleCamBtn = document.getElementById('toggle-cam-btn');
  const localVideo = document.getElementById('local-video');
  const videoGrid = document.getElementById('video-grid');
  const chatFeed = document.getElementById('chat-feed');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');

  // Initialize
  function init() {
    roomDisplay.textContent = `Room: ${roomId}`;
    userNameBadge.textContent = myName;

    setupTabs();
    setupWebSocket();
    setupVideoPlayer();
    setupLocalFileEngine();
    setupWebRTC();
    setupDucking();
    setupChat();

    copyRoomBtn.addEventListener('click', () => {
      const shareUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
      navigator.clipboard.writeText(shareUrl).then(() => {
        const orig = copyRoomBtn.textContent;
        copyRoomBtn.textContent = '✓ Copied!';
        setTimeout(() => (copyRoomBtn.textContent = orig), 2000);
      });
    });
  }

  // 1. WebSocket Signaling & Clock Sync
  function setupWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log('[WS] Connected to signaling server');
      sendClockSync();
      sendWS({
        action: 'join_room',
        room_id: roomId,
        name: myName
      });
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleServerMessage(msg);
      } catch (e) {
        console.error('[WS] Parse error:', e);
      }
    };

    socket.onclose = () => {
      console.warn('[WS] Disconnected, retrying in 2s...');
      setTimeout(setupWebSocket, 2000);
    };
  }

  function sendWS(data) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data));
    }
  }

  function sendClockSync() {
    sendWS({
      action: 'sync_clock',
      client_time: Date.now()
    });
  }

  function getServerTime() {
    return Date.now() + clockOffset;
  }

  function handleServerMessage(msg) {
    const type = msg.type;

    if (type === 'clock_sync_ack') {
      const now = Date.now();
      rtt = now - msg.client_send_time;
      const estimatedServerNow = msg.server_time + rtt / 2;
      clockOffset = estimatedServerNow - now;
      console.log(`[Clock] Skew: ${clockOffset}ms | RTT: ${rtt}ms`);
    } else if (type === 'room_joined') {
      clientId = msg.client_id;
      hostId = msg.host_id;
      updateMemberList(msg.members);
      if (msg.state && msg.state.source) {
        applyPlaybackState(msg.state, msg.server_time, true);
      }
    } else if (type === 'member_joined') {
      updateMemberList(msg.members);
      addSystemMessage(`${msg.name} joined the watch party.`);
      initiatePeerConnection(msg.client_id, true);
    } else if (type === 'member_left') {
      updateMemberList(msg.members);
      hostId = msg.host_id;
      addSystemMessage(`${msg.name} left the watch party.`);
      closePeerConnection(msg.client_id);
    } else if (type === 'playback_sync') {
      applyPlaybackState(msg, msg.server_time, false);
    } else if (type === 'webrtc_signal') {
      handlePeerSignal(msg.sender_id, msg.data);
    } else if (type === 'chat_broadcast') {
      addChatMessage(msg.sender_name, msg.text, msg.sender_id === clientId);
    }
  }

  function updateMemberList(members) {
    if (!members) return;
    memberCount.textContent = members.length;
  }

  // 2. Playback Synchronization Engine
  function setupVideoPlayer() {
    playPauseBtn.addEventListener('click', togglePlay);
    mainVideo.addEventListener('click', togglePlay);

    muteBtn.addEventListener('click', () => {
      mainVideo.muted = !mainVideo.muted;
      muteBtn.textContent = mainVideo.muted ? '🔇' : '🔊';
    });

    volumeSlider.addEventListener('input', (e) => {
      mainVideo.volume = parseFloat(e.target.value);
      mainVideo.muted = false;
      muteBtn.textContent = mainVideo.volume === 0 ? '🔇' : '🔊';
    });

    mainVideo.addEventListener('timeupdate', () => {
      updateTimeDisplay();
      if (!isSeeking) {
        const pct = (mainVideo.currentTime / (mainVideo.duration || 1)) * 100;
        currentProgress.style.width = `${pct}%`;
      }
    });

    mainVideo.addEventListener('progress', () => {
      if (mainVideo.buffered.length > 0 && mainVideo.duration) {
        const bufferedEnd = mainVideo.buffered.end(mainVideo.buffered.length - 1);
        bufferedBar.style.width = `${(bufferedEnd / mainVideo.duration) * 100}%`;
      }
    });

    let isSeeking = false;
    progressContainer.addEventListener('click', (e) => {
      const rect = progressContainer.getBoundingClientRect();
      const pos = (e.clientX - rect.left) / rect.width;
      const targetTime = pos * (mainVideo.duration || 0);
      seekVideo(targetTime);
    });

    playbackRateSelect.addEventListener('change', (e) => {
      mainVideo.playbackRate = parseFloat(e.target.value);
      broadcastSync('media_seek');
    });

    fullscreenBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        playerContainer.requestFullscreen().catch(err => console.error(err));
      } else {
        document.exitFullscreen();
      }
    });

    loadUrlBtn.addEventListener('click', () => {
      const url = videoUrlInput.value.trim();
      if (url) {
        loadMediaSource(url, 'url');
      }
    });

    mainVideo.addEventListener('play', () => {
      if (isProgrammatic) return;
      showOverlay('Playing');
      broadcastSync('media_play');
    });

    mainVideo.addEventListener('pause', () => {
      if (isProgrammatic) return;
      showOverlay('Paused');
      broadcastSync('media_pause');
    });

    mainVideo.addEventListener('seeked', () => {
      if (isProgrammatic) return;
      broadcastSync('media_seek');
    });
  }

  function togglePlay() {
    if (mainVideo.paused) {
      mainVideo.play();
    } else {
      mainVideo.pause();
    }
  }

  function seekVideo(time) {
    mainVideo.currentTime = time;
    broadcastSync('media_seek');
  }

  function loadMediaSource(src, type, label = '') {
    mainVideo.src = src;
    mainVideo.load();
    mainVideo.play().catch(() => {});
    broadcastSync('media_change_source', {
      source: src,
      source_type: type
    });
    addSystemMessage(`Now playing: ${label || src}`);
  }

  function broadcastSync(action, extra = {}) {
    sendWS({
      action: action,
      current_time: mainVideo.currentTime,
      is_playing: !mainVideo.paused,
      playback_rate: mainVideo.playbackRate,
      ...extra
    });
  }

  function applyPlaybackState(state, serverTime, isInitial = false) {
    isProgrammatic = true;

    // Load new source if changed
    if (state.source && mainVideo.src !== window.location.origin + state.source && mainVideo.src !== state.source) {
      mainVideo.src = state.source;
      mainVideo.load();
      if (videoUrlInput) videoUrlInput.value = state.source;
      addSystemMessage(`Loaded synced media: ${state.source.split('/').pop()}`);
    }

    const elapsedSinceUpdate = Math.max(0, (getServerTime() - serverTime) / 1000);
    const expectedTime = state.is_playing
      ? state.current_time + elapsedSinceUpdate * (state.playback_rate || 1.0)
      : state.current_time;

    const drift = Math.abs(mainVideo.currentTime - expectedTime);
    updateSyncStatus(drift);

    if (isInitial || drift > 1.2) {
      mainVideo.currentTime = expectedTime;
    } else if (drift > 0.15) {
      if (mainVideo.currentTime < expectedTime) {
        mainVideo.playbackRate = (state.playback_rate || 1.0) * 1.05;
      } else {
        mainVideo.playbackRate = (state.playback_rate || 1.0) * 0.95;
      }
      setTimeout(() => {
        mainVideo.playbackRate = state.playback_rate || 1.0;
      }, 800);
    }

    if (state.is_playing && mainVideo.paused) {
      mainVideo.play().catch(e => console.log('Autoplay deferred:', e));
      showOverlay('Playing');
    } else if (!state.is_playing && !mainVideo.paused) {
      mainVideo.pause();
      showOverlay('Paused');
    }

    setTimeout(() => {
      isProgrammatic = false;
    }, 120);
  }

  function updateSyncStatus(driftSec) {
    const driftMs = Math.round(driftSec * 1000);
    syncDriftLabel.textContent = `Drift: ${driftMs}ms`;
    if (driftMs < 100) {
      syncStatus.style.color = 'var(--success)';
    } else if (driftMs < 500) {
      syncStatus.style.color = 'var(--warning)';
    } else {
      syncStatus.style.color = 'var(--danger)';
    }
  }

  function updateTimeDisplay() {
    timeDisplay.textContent = `${formatTime(mainVideo.currentTime)} / ${formatTime(mainVideo.duration || 0)}`;
  }

  function formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }

  function showOverlay(text) {
    overlayText.textContent = text;
    overlayMsg.classList.remove('hidden');
    setTimeout(() => overlayMsg.classList.add('hidden'), 800);
  }

  // 3. Local File Engine (Chunked Streaming Upload & Local Path Loader)
  function setupLocalFileEngine() {
    // A. File Picker -> Streamed upload to server for instant multi-user range streaming
    localFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      selectedFileName.textContent = `Preparing: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)...`;
      uploadProgressContainer.classList.remove('hidden');
      uploadBar.style.width = '0%';
      uploadPercent.textContent = '0%';

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/upload?filename=${encodeURIComponent(file.name)}`, true);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');

      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) {
          const pct = Math.round((evt.loaded / evt.total) * 100);
          uploadBar.style.width = `${pct}%`;
          uploadPercent.textContent = `${pct}%`;
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          try {
            const res = JSON.parse(xhr.responseText);
            uploadBar.style.width = '100%';
            uploadPercent.textContent = 'Ready!';
            selectedFileName.textContent = `Streaming: ${res.filename} (Native 4K / Range Streamed)`;
            setTimeout(() => uploadProgressContainer.classList.add('hidden'), 1500);

            // Load media source locally and broadcast to all room peers
            loadMediaSource(res.url, 'url', res.filename);
          } catch (err) {
            selectedFileName.textContent = `Error parsing upload response`;
          }
        } else {
          selectedFileName.textContent = `Upload failed with status: ${xhr.status}`;
        }
      };

      xhr.onerror = () => {
        selectedFileName.textContent = `Upload connection failed`;
      };

      xhr.send(file);
    });

    // B. Direct Local Path Loader -> Instant symlink on the machine
    loadPathBtn.addEventListener('click', () => {
      const pathVal = localPathInput.value.trim();
      if (!pathVal) return;

      selectedFileName.textContent = `Linking local file: ${pathVal}...`;

      fetch('/api/load-local-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: pathVal })
      })
      .then(res => res.json())
      .then(data => {
        if (data.status === 'ok') {
          selectedFileName.textContent = `Streaming: ${data.filename} (${(data.size / (1024 * 1024)).toFixed(1)} MB)`;
          loadMediaSource(data.url, 'url', data.filename);
        } else {
          selectedFileName.textContent = `Error: ${data.message}`;
        }
      })
      .catch(err => {
        selectedFileName.textContent = `Error contacting local server: ${err}`;
      });
    });
  }

  // 4. WebRTC Voice & Video Mesh
  async function setupWebRTC() {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: { width: 320, height: 180, frameRate: 24 }
      });
      localVideo.srcObject = localStream;
    } catch (e) {
      console.warn('[WebRTC] Camera/Mic access denied or unavailable:', e);
      addSystemMessage('Microphone/Camera access not granted. Running in spectator mode.');
    }

    toggleMicBtn.addEventListener('click', () => {
      if (!localStream) return;
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        toggleMicBtn.classList.toggle('active', audioTrack.enabled);
        toggleMicBtn.textContent = audioTrack.enabled ? '🎤 Mic' : '🔇 Muted';
      }
    });

    toggleCamBtn.addEventListener('click', () => {
      if (!localStream) return;
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        toggleCamBtn.classList.toggle('active', videoTrack.enabled);
        toggleCamBtn.textContent = videoTrack.enabled ? '📹 Cam' : '🚫 Cam Off';
      }
    });
  }

  function createPeerConnection(targetId) {
    const pc = new RTCPeerConnection(rtcConfig);
    peerConnections[targetId] = pc;

    if (localStream) {
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sendWS({
          action: 'webrtc_signal',
          target_id: targetId,
          data: { candidate: e.candidate }
        });
      }
    };

    pc.ontrack = (e) => {
      const remoteStream = e.streams[0];
      attachRemoteStream(targetId, remoteStream);
      attachDuckingMonitor(remoteStream);
    };

    return pc;
  }

  async function initiatePeerConnection(targetId, isOfferer) {
    const pc = createPeerConnection(targetId);
    if (isOfferer) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendWS({
        action: 'webrtc_signal',
        target_id: targetId,
        data: { sdp: pc.localDescription }
      });
    }
  }

  async function handlePeerSignal(senderId, data) {
    let pc = peerConnections[senderId];
    if (!pc) {
      pc = createPeerConnection(senderId);
    }

    if (data.sdp) {
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      if (data.sdp.type === 'offer') {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendWS({
          action: 'webrtc_signal',
          target_id: senderId,
          data: { sdp: pc.localDescription }
        });
      }
    } else if (data.candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (err) {
        console.error('[WebRTC] Candidate error:', err);
      }
    }
  }

  function attachRemoteStream(peerId, stream) {
    let card = document.getElementById(`peer-card-${peerId}`);
    if (!card) {
      card = document.createElement('div');
      card.className = 'video-card';
      card.id = `peer-card-${peerId}`;

      const vid = document.createElement('video');
      vid.autoplay = true;
      vid.playsInline = true;
      vid.srcObject = stream;

      const badge = document.createElement('div');
      badge.className = 'stream-badge';
      badge.textContent = `Friend`;

      card.appendChild(vid);
      card.appendChild(badge);
      videoGrid.appendChild(card);
    }
  }

  function closePeerConnection(peerId) {
    if (peerConnections[peerId]) {
      peerConnections[peerId].close();
      delete peerConnections[peerId];
    }
    const card = document.getElementById(`peer-card-${peerId}`);
    if (card) card.remove();
  }

  // 5. Web Audio Smart Voice Ducking
  function setupDucking() {
    duckingAmountSlider.addEventListener('input', (e) => {
      duckingAmount = parseFloat(e.target.value);
      duckingAmountLabel.textContent = `${Math.round(duckingAmount * 100)}%`;
    });
  }

  function attachDuckingMonitor(stream) {
    if (!audioCtx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioCtxClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const sourceNode = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    sourceNode.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    function checkVocalActivity() {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avg = sum / dataArray.length;

      if (avg > 25) {
        triggerDucking();
      }
      requestAnimationFrame(checkVocalActivity);
    }
    checkVocalActivity();
  }

  function triggerDucking() {
    clearTimeout(duckingTimeout);
    if (!isDucking) {
      isDucking = true;
      duckingLed.classList.add('active');
      const targetVolume = Math.max(0.1, mainVideo.volume * (1.0 - duckingAmount));
      smoothVolumeTransition(mainVideo.volume, targetVolume, 150);
    }

    duckingTimeout = setTimeout(() => {
      isDucking = false;
      duckingLed.classList.remove('active');
      const baseVolume = parseFloat(volumeSlider.value);
      smoothVolumeTransition(mainVideo.volume, baseVolume, 300);
    }, 600);
  }

  function smoothVolumeTransition(from, to, durationMs) {
    const steps = 10;
    const stepTime = durationMs / steps;
    const delta = (to - from) / steps;
    let currentStep = 0;

    const timer = setInterval(() => {
      currentStep++;
      mainVideo.volume = Math.min(1.0, Math.max(0, mainVideo.volume + delta));
      if (currentStep >= steps) {
        mainVideo.volume = to;
        clearInterval(timer);
      }
    }, stepTime);
  }

  // 6. Chat System
  function setupChat() {
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = chatInput.value.trim();
      if (text) {
        sendWS({
          action: 'chat_message',
          text: text
        });
        chatInput.value = '';
      }
    });
  }

  function addChatMessage(sender, text, isMe) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message';

    const senderSpan = document.createElement('span');
    senderSpan.className = 'msg-sender';
    senderSpan.textContent = isMe ? 'You' : sender;

    const textSpan = document.createElement('span');
    textSpan.className = 'msg-text';
    textSpan.textContent = text;

    msgDiv.appendChild(senderSpan);
    msgDiv.appendChild(textSpan);
    chatFeed.appendChild(msgDiv);
    chatFeed.scrollTop = chatFeed.scrollHeight;
  }

  function addSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'system-message';
    div.textContent = text;
    chatFeed.appendChild(div);
    chatFeed.scrollTop = chatFeed.scrollHeight;
  }

  // UI Tabs
  function setupTabs() {
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        tabButtons.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.add('hidden'));

        btn.classList.add('active');
        const targetTab = document.getElementById(btn.dataset.tab);
        if (targetTab) targetTab.classList.remove('hidden');
      });
    });
  }

  window.addEventListener('DOMContentLoaded', init);
})();
