let currentTabId = null;

document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab.id;

  await loadSettings();

  document.getElementById('mode').addEventListener('change', (e) => {
    document.getElementById('movingOptions').style.display =
      e.target.value === 'moving' ? 'block' : 'none';
  });

  document.getElementById('apply').addEventListener('click', applySettings);
  document.getElementById('stop').addEventListener('click', stopSpoofing);
});

async function loadSettings() {
  const data = await chrome.storage.local.get(`tab_${currentTabId}`);
  const settings = data[`tab_${currentTabId}`];

  if (settings) {
    document.getElementById('lat').value = settings.lat;
    document.getElementById('lng').value = settings.lng;
    document.getElementById('mode').value = settings.mode;
    document.getElementById('bearing').value = settings.bearing;
    document.getElementById('speed').value = settings.speed;
    document.getElementById('accuracy').value = settings.accuracy;
    document.getElementById('heading').value = settings.heading;
    document.getElementById('gpsSpeed').value = settings.gpsSpeed;
    document.getElementById('randomize').checked = settings.randomize;
    document.getElementById('randomRange').value = settings.randomRange;

    document.getElementById('movingOptions').style.display =
      settings.mode === 'moving' ? 'block' : 'none';
  }
}

async function applySettings() {
  const settings = {
    lat: parseFloat(document.getElementById('lat').value),
    lng: parseFloat(document.getElementById('lng').value),
    mode: document.getElementById('mode').value,
    bearing: parseFloat(document.getElementById('bearing').value),
    speed: parseFloat(document.getElementById('speed').value),
    accuracy: parseFloat(document.getElementById('accuracy').value),
    heading: parseFloat(document.getElementById('heading').value),
    gpsSpeed: parseFloat(document.getElementById('gpsSpeed').value),
    randomize: document.getElementById('randomize').checked,
    randomRange: parseFloat(document.getElementById('randomRange').value),
    enabled: true
  };

  await chrome.storage.local.set({ [`tab_${currentTabId}`]: settings });

  await chrome.tabs.sendMessage(currentTabId, { action: 'start', settings });
}

async function stopSpoofing() {
  await chrome.storage.local.set({ [`tab_${currentTabId}`]: { enabled: false } });
  await chrome.tabs.sendMessage(currentTabId, { action: 'stop' });
}
