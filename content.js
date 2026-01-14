chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'start') {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('geolocation-spoof.js');
    script.onload = () => {
      window.postMessage({ action: 'start', settings: request.settings }, '*');
    };
    (document.head || document.documentElement).appendChild(script);
    sendResponse({ success: true });
  } else if (request.action === 'stop') {
    window.postMessage({ action: 'stop' }, '*');
    sendResponse({ success: true });
  } else if (request.action === 'update') {
    window.postMessage({ action: 'update', settings: request.settings }, '*');
    sendResponse({ success: true });
  }
});
