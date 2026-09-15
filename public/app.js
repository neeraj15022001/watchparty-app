/**
 * WatchParty Pro - High-Fidelity Client Engine
 * Core Modules:
 * 1. WebSocket Signaling & Room State Machine
 * 2. NTP Clock Synchronization (Cristian's Algorithm)
 * 3. High-Precision Video Player Sync (Smooth Rate Steering & Hard Seek)
 * 4. Local File Streaming & Path Loader (HTTP Range & Chunked Upload)
 * 5. WebRTC Peer-to-Peer Mesh (Voice & Video Chat)
 * 6. Web Audio API Smart Voice Ducking & Real-Time Waveform Visualizer
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
  let duckingEnabled = true;
  let duckingTimeout = null;
  let activeAudioAnalysers = [];

  // DOM Elements
  const roomDisplay = document.getElementById('room-display');
  const copyRoomBtn = document.getElementById('copy-room-btn');
  const userNameBadge = document.getElementById('user-name-badge');
  const mainVideo = document.getElementById('main-video');
  const overlayMsg = document.getElementById('overlay-msg');
  const overlayText = document.getElementById('overlay-text');
  const playPauseBtn = document.getElementById('play-pause-btn');
  const playIcon = document.getElementById('play-icon');
  const pauseIcon = document.getElementById('pause-icon');
  const muteBtn = document.getElementById('mute-btn');
  const volumeSlider = document.getElementById('volume-slider');
  const volumePercent = document.getElementById('volume-percent');
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
  const duckingStatusPill = document.getElementById('ducking-indicator');
  const duckingEnableToggle = document.getElementById('ducking-enable-toggle');
  const waveformCanvas = document.getElementById('ducking-waveform');
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
    roomDisplay.textContent = roomId;
    userNameBadge.textContent = myName.replace('User_', 'U');

    setupTabs();
    setupWebSocket();
    setupVideoPlayer();
    setupLocalFileEngine();
    setupWebRTC();
    setupDucking();
    setupChat();
    setupWaveformVisualizer();

    copyRoomBtn.addEventListener('click', () => {
      const shareUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
      navigator.clipboard.writeText(shareUrl).then(() => {
        const textSpan = copyRoomBtn.querySelector('span');
        if (textSpan) {
          const orig = textSpan.textContent;
          textSpan.textContent = 'Copied!';
          setTimeout(() => (textSpan.textContent = orig), 2000);
        }
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
    if (memberCount) memberCount.textContent = members.length;
  }

  // 2. Playback Synchronization Engine
  function setupVideoPlayer() {
    playPauseBtn.addEventListener('click', togglePlay);
    mainVideo.addEventListener('click', togglePlay);

    muteBtn.addEventListener('click', () => {
      mainVideo.muted = !mainVideo.muted;
      updateVolumeDisplay();
    });

    volumeSlider.addEventListener('input', (e) => {
      mainVideo.volume = parseFloat(e.target.value);
      mainVideo.muted = false;
      updateVolumeDisplay();
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
      updatePlayPauseIcons(true);
      if (isProgrammatic) return;
      showOverlay('Playing');
      broadcastSync('media_play');
    });

    mainVideo.addEventListener('pause', () => {
      updatePlayPauseIcons(false);
      if (isProgrammatic) return;
      showOverlay('Paused');
      broadcastSync('media_pause');
    });

    mainVideo.addEventListener('seeked', () => {
      if (isProgrammatic) return;
      broadcastSync('media_seek');
    });
  }

  function updatePlayPauseIcons(isPlaying) {
    if (playIcon && pauseIcon) {
      if (isPlaying) {
        playIcon.classList.add('hidden');
        pauseIcon.classList.remove('hidden');
      } else {
        playIcon.classList.remove('hidden');
        pauseIcon.classList.add('hidden');
      }
    }
  }

  function updateVolumeDisplay() {
    const vol = mainVideo.muted ? 0 : mainVideo.volume;
    if (volumePercent) {
      volumePercent.textContent = `${Math.round(vol * 100)}%`;
    }
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
      updatePlayPauseIcons(true);
    } else if (!state.is_playing && !mainVideo.paused) {
      mainVideo.pause();
      showOverlay('Paused');
      updatePlayPauseIcons(false);
    }

    setTimeout(() => {
      isProgrammatic = false;
    }, 120);
  }

  function updateSyncStatus(driftSec) {
    const driftMs = Math.round(driftSec * 1000);
    syncDriftLabel.textContent = `<${Math.max(20, driftMs)}ms Sync`;
    if (driftMs < 100) {
      syncStatus.style.color = '#4ade80';
      syncStatus.style.borderColor = 'rgba(34, 197, 94, 0.3)';
    } else if (driftMs < 500) {
      syncStatus.style.color = 'var(--status-warning)';
      syncStatus.style.borderColor = 'rgba(245, 158, 11, 0.3)';
    } else {
      syncStatus.style.color = 'var(--status-danger)';
      syncStatus.style.borderColor = 'rgba(239, 68, 68, 0.3)';
    }
  }

  function updateTimeDisplay() {
    timeDisplay.textContent = `${formatTime(mainVideo.currentTime)} / ${formatTime(mainVideo.duration || 0)}`;
  }

  function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const min = Math.floor((seconds % 3600) / 60);
    const sec = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }

  function showOverlay(text) {
    overlayText.textContent = text;
    overlayMsg.classList.remove('hidden');
    setTimeout(() => overlayMsg.classList.add('hidden'), 800);
  }

  // 3. Local File Engine (Chunked Streaming Upload & Local Path Loader)
  function setupLocalFileEngine() {
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
        video: { width: 320, height: 240, frameRate: 24 }
      });
      localVideo.srcObject = localStream;
      attachDuckingMonitor(localStream, 'local-video-card');
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
        toggleMicBtn.classList.toggle('muted', !audioTrack.enabled);
        const micText = toggleMicBtn.querySelector('span');
        if (micText) micText.textContent = audioTrack.enabled ? 'Mic' : 'Muted';
      }
    });

    toggleCamBtn.addEventListener('click', () => {
      if (!localStream) return;
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        toggleCamBtn.classList.toggle('active', videoTrack.enabled);
        toggleCamBtn.classList.toggle('muted', !videoTrack.enabled);
        const camText = toggleCamBtn.querySelector('span');
        if (camText) camText.textContent = videoTrack.enabled ? 'Cam' : 'Cam Off';
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
      attachDuckingMonitor(remoteStream, `peer-card-${targetId}`);
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

      const meta = document.createElement('div');
      meta.className = 'video-card-meta';
      meta.innerHTML = `
        <div class="user-info">
          <span class="meta-name">Friend_${peerId.slice(0, 4)}</span>
          <span class="meta-status" id="status-${peerId}">Active</span>
        </div>
        <div class="meta-mic-icon active" id="mic-icon-${peerId}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path></svg>
        </div>
      `;

      card.appendChild(vid);
      card.appendChild(meta);
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

  // 5. Web Audio Smart Voice Ducking & Visualizer
  function setupDucking() {
    duckingAmountSlider.addEventListener('input', (e) => {
      duckingAmount = parseFloat(e.target.value);
      duckingAmountLabel.textContent = `${Math.round(duckingAmount * 100)}%`;
    });

    if (duckingEnableToggle) {
      duckingEnableToggle.addEventListener('change', (e) => {
        duckingEnabled = e.target.checked;
        if (!duckingEnabled) {
          isDucking = false;
          duckingStatusPill.classList.remove('active');
        }
      });
    }
  }

  function attachDuckingMonitor(stream, cardId = null) {
    if (!audioCtx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioCtxClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    try {
      const sourceNode = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      sourceNode.connect(analyser);

      activeAudioAnalysers.push({ analyser, cardId });

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      function checkVocalActivity() {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;

        // Card glow for active speaker
        if (cardId) {
          const cardEl = document.getElementById(cardId);
          if (cardEl) {
            if (avg > 25) {
              cardEl.classList.add('active-speaker');
            } else {
              cardEl.classList.remove('active-speaker');
            }
          }
        }

        if (avg > 25 && duckingEnabled) {
          triggerDucking();
        }
        requestAnimationFrame(checkVocalActivity);
      }
      checkVocalActivity();
    } catch (err) {
      console.warn('[Audio] Could not attach ducking monitor:', err);
    }
  }

  function triggerDucking() {
    clearTimeout(duckingTimeout);
    if (!isDucking) {
      isDucking = true;
      duckingStatusPill.classList.add('active');
      const targetVolume = Math.max(0.1, mainVideo.volume * (1.0 - duckingAmount));
      smoothVolumeTransition(mainVideo.volume, targetVolume, 150);
    }

    duckingTimeout = setTimeout(() => {
      isDucking = false;
      duckingStatusPill.classList.remove('active');
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
      updateVolumeDisplay();
      if (currentStep >= steps) {
        mainVideo.volume = to;
        updateVolumeDisplay();
        clearInterval(timer);
      }
    }, stepTime);
  }

  function setupWaveformVisualizer() {
    if (!waveformCanvas) return;
    const ctx = waveformCanvas.getContext('2d');
    let angle = 0;

    function renderWave() {
      const width = waveformCanvas.width;
      const height = waveformCanvas.height;
      ctx.clearRect(0, 0, width, height);

      // Gradient stroke
      ctx.lineWidth = 2.5;
      const grad = ctx.createLinearGradient(0, 0, width, 0);
      grad.addColorStop(0, '#38bdf8');
      grad.addColorStop(0.5, '#818cf8');
      grad.addColorStop(1, '#c084fc');
      ctx.strokeStyle = grad;
      ctx.shadowColor = 'rgba(56, 189, 248, 0.45)';
      ctx.shadowBlur = 8;

      ctx.beginPath();

      // Check if any audio analyser has live energy
      let liveData = null;
      for (const item of activeAudioAnalysers) {
        const arr = new Uint8Array(item.analyser.frequencyBinCount);
        item.analyser.getByteFrequencyData(arr);
        let s = 0;
        for (let i = 0; i < arr.length; i++) s += arr[i];
        if (s / arr.length > 5) {
          liveData = arr;
          break;
        }
      }

      if (liveData) {
        const sliceWidth = width / liveData.length;
        let x = 0;
        for (let i = 0; i < liveData.length; i++) {
          const v = liveData[i] / 128.0;
          const y = (v * height) / 2;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
          x += sliceWidth;
        }
      } else {
        // Idle ambient sine wave
        angle += 0.04;
        const numPoints = 40;
        const dx = width / numPoints;
        for (let i = 0; i <= numPoints; i++) {
          const y = (height / 2) + Math.sin(angle + i * 0.35) * 5;
          if (i === 0) ctx.moveTo(i * dx, y);
          else ctx.lineTo(i * dx, y);
        }
      }

      ctx.stroke();
      requestAnimationFrame(renderWave);
    }
    renderWave();
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

    // Emoji reaction buttons
    document.querySelectorAll('.emoji-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        chatInput.value += btn.dataset.emoji;
        chatInput.focus();
      });
    });
  }

  function addChatMessage(sender, text, isMe) {
    const msgItem = document.createElement('div');
    msgItem.className = 'chat-message-item';

    const avatar = document.createElement('div');
    avatar.className = 'chat-sender-avatar';
    avatar.textContent = (sender || 'U').charAt(0).toUpperCase();

    const bubbleContent = document.createElement('div');
    bubbleContent.className = 'chat-bubble-content';

    const metaRow = document.createElement('div');
    metaRow.className = 'chat-meta-row';

    const senderName = document.createElement('span');
    senderName.className = 'chat-sender-name';
    senderName.textContent = isMe ? 'You' : sender;

    const timestamp = document.createElement('span');
    timestamp.className = 'chat-timestamp';
    const now = new Date();
    timestamp.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    metaRow.appendChild(senderName);
    metaRow.appendChild(timestamp);

    const textBubble = document.createElement('div');
    textBubble.className = 'chat-text-bubble';
    textBubble.textContent = text;

    bubbleContent.appendChild(metaRow);
    bubbleContent.appendChild(textBubble);

    msgItem.appendChild(avatar);
    msgItem.appendChild(bubbleContent);

    chatFeed.appendChild(msgItem);
    chatFeed.scrollTop = chatFeed.scrollHeight;
  }

  function addSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'chat-system-entry';
    div.innerHTML = `<span>${text}</span>`;
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
