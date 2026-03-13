// content.js — injected into YouTube pages

let intervalId = null;
let resumeTimeoutId = null;
let intervalSeconds = 10;
let resumeSeconds = 5;
let autoResume = false;
let isEnabled = false;

function getVideo() {
  return document.querySelector('video');
}

function doResume() {
  const video = getVideo();
  if (!video || !video.paused) return;

  // Dispatch 'k' keydown on document — confirmed working on YouTube
  document.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'k',
    keyCode: 75,
    bubbles: true,
    cancelable: true
  }));
}

function startPauser(seconds, resume, resumeSecs) {
  stopPauser();
  intervalSeconds = seconds;
  autoResume = resume;
  resumeSeconds = resumeSecs;
  isEnabled = true;

  intervalId = setInterval(() => {
    const video = getVideo();
    if (video && !video.paused) {
      video.pause();

      if (autoResume) {
        if (resumeTimeoutId) clearTimeout(resumeTimeoutId);
        resumeTimeoutId = setTimeout(doResume, resumeSeconds * 1000);
      }
    }
  }, intervalSeconds * 1000);
}

function stopPauser() {
  if (intervalId !== null) { clearInterval(intervalId); intervalId = null; }
  if (resumeTimeoutId !== null) { clearTimeout(resumeTimeoutId); resumeTimeoutId = null; }
  isEnabled = false;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'START') {
    startPauser(msg.seconds, msg.autoResume, msg.resumeSeconds);
    sendResponse({ ok: true });
  } else if (msg.type === 'STOP') {
    stopPauser();
    sendResponse({ ok: true });
  } else if (msg.type === 'GET_STATUS') {
    sendResponse({ isEnabled, intervalSeconds, autoResume, resumeSeconds });
  }
  return true;
});

chrome.storage.local.get(['isEnabled', 'intervalSeconds', 'autoResume', 'resumeSeconds'], (data) => {
  if (data.isEnabled) {
    startPauser(data.intervalSeconds || 10, !!data.autoResume, data.resumeSeconds || 5);
  }
});
