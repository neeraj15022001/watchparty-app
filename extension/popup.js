document.addEventListener('DOMContentLoaded', () => {
  const roomIdInput = document.getElementById('room-id');
  const serverHostInput = document.getElementById('server-host');
  const syncEnabledInput = document.getElementById('sync-enabled');
  const saveBtn = document.getElementById('save-btn');
  const statusMsg = document.getElementById('status-msg');

  if (chrome && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['room_id', 'server_host', 'sync_enabled'], (items) => {
      if (items.room_id) roomIdInput.value = items.room_id;
      if (items.server_host) serverHostInput.value = items.server_host;
      if (typeof items.sync_enabled !== 'undefined') syncEnabledInput.checked = items.sync_enabled;
    });
  }

  saveBtn.addEventListener('click', () => {
    const config = {
      room_id: roomIdInput.value.trim() || 'cinema-room-1',
      server_host: serverHostInput.value.trim() || 'localhost:8080',
      sync_enabled: syncEnabledInput.checked
    };

    if (chrome && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set(config, () => {
        statusMsg.textContent = 'Settings saved! Reload streaming tab.';
        setTimeout(() => (statusMsg.textContent = ''), 3000);
      });
    } else {
      statusMsg.textContent = 'Saved!';
    }
  });
});
