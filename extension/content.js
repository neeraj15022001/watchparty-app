/**
 * WatchParty Pro - OTT Player Content Script
 * Injected into Netflix, YouTube, and Prime Video tabs.
 * Hooks into the native player DOM, intercepts play/pause/seek,
 * and maintains sub-150ms synchronization via the WebSocket server.
 */

(function () {
  'use strict';

  let ws = null;
  let isProgrammatic = false;
  let currentRoom = 'cinema-room-1';
  let serverHost = 'localhost:8080';
  let syncEnabled = true;

  // Retrieve saved config from chrome.storage
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['room_id', 'server_host', 'sync_enabled'], (items) => {
      if (items.room_id) currentRoom = items.room_id;
      if (items.server_host) serverHost = items.server_host;
      if (typeof items.sync_enabled !== 'undefined') syncEnabled = items.sync_enabled;
      init();
    });
  } else {
    init();
  }

  function init() {
    createFloatingHUD();
    connectSignaling();
    observeVideoPlayer();
  }

  // 1. Floating In-Page Status HUD
  let hudEl = null;
  function createFloatingHUD() {
    if (document.getElementById('watchparty-hud')) return;
    hudEl = document.createElement('div');
    hudEl.id = 'watchparty-hud';
    hudEl.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9999999;
      background: rgba(15, 17, 25, 0.9);
      backdrop-filter: blur(8px);
      border: 1px solid #272a3d;
      color: #f8fafc;
      padding: 10px 14px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 10px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.5);
    `;
    hudEl.innerHTML = `
      <span id="wp-dot" style="width:8px;height:8px;border-radius:50%;background:#ef4444;display:inline-block;"></span>
      <span id="wp-status" style="font-weight:600;">WatchParty: Connecting...</span>
      <span style="color:#94a3b8;font-size:11px;">[Room: ${currentRoom}]</span>
    `;
    document.body.appendChild(hudEl);
  }

  function updateHUD(statusText, color) {
    const dot = document.getElementById('wp-dot');
    const status = document.getElementById('wp-status');
    if (dot && status) {
      dot.style.background = color;
      status.textContent = statusText;
    }
  }

  // 2. WebSocket Signaling Connection
  function connectSignaling() {
    const wsUrl = `ws://${serverHost}/ws`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[WatchParty Ext] Connected to room server');
      updateHUD('WatchParty: In Sync (4K/Native)', '#10b981');
      ws.send(JSON.stringify({
        action: 'join_room',
        room_id: currentRoom,
        name: 'OTT_Viewer_' + Math.floor(100 + Math.random() * 900)
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'playback_sync') {
          handleIncomingSync(msg);
        }
      } catch (err) {
        console.error('[WatchParty Ext] Parse error:', err);
      }
    };

    ws.onclose = () => {
      updateHUD('WatchParty: Disconnected', '#ef4444');
      setTimeout(connectSignaling, 3000);
    };
  }

  // 3. Player Hook & Observer
  let hookedVideo = null;
  function observeVideoPlayer() {
    const checkInterval = setInterval(() => {
      const video = document.querySelector('video');
      if (video && video !== hookedVideo) {
        hookedVideo = video;
        attachPlayerListeners(video);
      }
    }, 1500);
  }

  function attachPlayerListeners(video) {
    console.log('[WatchParty Ext] Video element hooked successfully:', video);

    video.addEventListener('play', () => {
      if (isProgrammatic || !syncEnabled) return;
      broadcastSync('media_play', video);
    });

    video.addEventListener('pause', () => {
      if (isProgrammatic || !syncEnabled) return;
      broadcastSync('media_pause', video);
    });

    video.addEventListener('seeked', () => {
      if (isProgrammatic || !syncEnabled) return;
      broadcastSync('media_seek', video);
    });
  }

  function broadcastSync(action, video) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        action: action,
        current_time: video.currentTime,
        is_playing: !video.paused,
        playback_rate: video.playbackRate,
        source: window.location.href,
        source_type: 'ott'
      }));
    }
  }

  function handleIncomingSync(msg) {
    if (!hookedVideo || !syncEnabled) return;
    isProgrammatic = true;

    const targetTime = msg.current_time;
    const drift = Math.abs(hookedVideo.currentTime - targetTime);

    // Apply drift correction
    if (drift > 1.0) {
      hookedVideo.currentTime = targetTime;
    } else if (drift > 0.15) {
      hookedVideo.playbackRate = hookedVideo.currentTime < targetTime ? 1.04 : 0.96;
      setTimeout(() => {
        if (hookedVideo) hookedVideo.playbackRate = msg.playback_rate || 1.0;
      }, 600);
    }

    if (msg.is_playing && hookedVideo.paused) {
      hookedVideo.play().catch(() => {});
    } else if (!msg.is_playing && !hookedVideo.paused) {
      hookedVideo.pause();
    }

    setTimeout(() => {
      isProgrammatic = false;
    }, 150);
  }
})();
