// content.js — injected into YouTube pages

// ============================================================
// TIMER-BASED PAUSE  (existing — completely unchanged)
// ============================================================
let intervalId       = null;
let resumeTimeoutId  = null;
let intervalSeconds  = 10;
let resumeSeconds    = 5;
let autoResume       = false;
let isEnabled        = false;

function getVideo() {
  return document.querySelector('video');
}

function doResume() {
  const video = getVideo();
  if (!video || !video.paused) return;

  // video.play() is reliable from a content-script context after a
  // programmatic pause (e.g. from MutationObserver callbacks).
  // Fall back to the keyboard shortcut if play() is rejected.
  const playPromise = video.play();
  if (playPromise !== undefined) {
    playPromise.catch(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'k', keyCode: 75, bubbles: true, cancelable: true
      }));
    });
  }
}

function startPauser(seconds, resume, resumeSecs) {
  stopPauser();
  intervalSeconds = seconds;
  autoResume      = resume;
  resumeSeconds   = resumeSecs;
  isEnabled       = true;

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
  if (intervalId      !== null) { clearInterval(intervalId);     intervalId      = null; }
  if (resumeTimeoutId !== null) { clearTimeout(resumeTimeoutId); resumeTimeoutId = null; }
  isEnabled = false;
}

// ============================================================
// SENTENCE-BASED PAUSE  (new)
// ============================================================
let sentencePauseEnabled  = false;
let sentence1PauseSecs    = 2;   // pause duration after 1st sentence (for auto-resume)
let sentence2PauseSecs    = 4;   // pause duration after 2nd sentence (for auto-resume)
let sentenceAutoResume    = false;
let sentenceCount         = 0;   // 0 → next pause is "1st-sentence" (small)
                                  // 1 → next pause is "2nd-sentence" (bigger)

let sentenceResumeTimeoutId = null;
let captionObserver         = null;
let captionRetryId          = null;
let sentenceDebounceId      = null;
let lastCaptionText         = '';

// ---------- caption helpers ----------

function getCaptionText() {
  const segs = document.querySelectorAll('.ytp-caption-segment');
  return Array.from(segs).map(s => s.textContent).join(' ').trim();
}

function onSentenceCompleted() {
  const video = getVideo();
  if (!video || video.paused) return;   // already paused — skip

  video.pause();

  const pauseDuration = (sentenceCount === 0) ? sentence1PauseSecs : sentence2PauseSecs;
  sentenceCount = (sentenceCount + 1) % 2;

  if (sentenceAutoResume) {
    if (sentenceResumeTimeoutId) clearTimeout(sentenceResumeTimeoutId);
    sentenceResumeTimeoutId = setTimeout(doResume, pauseDuration * 1000);
  }
}

function onCaptionMutation() {
  const currentText = getCaptionText();
  if (currentText === lastCaptionText) return;

  const prevText    = lastCaptionText;
  lastCaptionText   = currentText;

  // Sentence boundary = previous caption ended with sentence punctuation
  // AND the caption has now changed (next sentence started / text cleared).
  // The tiny debounce absorbs rapid word-by-word DOM updates from YouTube.
  if (/[.!?]['"'\u2019\u201d]?\s*$/.test(prevText) && prevText.length > 0) {
    if (sentenceDebounceId) clearTimeout(sentenceDebounceId);
    sentenceDebounceId = setTimeout(onSentenceCompleted, 350);
  }
}

function connectCaptionObserver() {
  if (captionObserver) { captionObserver.disconnect(); captionObserver = null; }
  lastCaptionText = '';

  const container = document.querySelector('.ytp-caption-window-container');
  if (!container) return false;

  captionObserver = new MutationObserver(onCaptionMutation);
  captionObserver.observe(container, { childList: true, subtree: true, characterData: true });
  return true;
}

function startCaptionWatcher() {
  stopCaptionWatcher();
  sentenceCount   = 0;
  lastCaptionText = '';

  if (!connectCaptionObserver()) {
    // Caption container not in DOM yet — retry periodically
    captionRetryId = setInterval(() => {
      if (connectCaptionObserver()) {
        clearInterval(captionRetryId);
        captionRetryId = null;
      }
    }, 1500);
  }
}

function stopCaptionWatcher() {
  if (captionObserver)         { captionObserver.disconnect(); captionObserver = null; }
  if (captionRetryId !== null) { clearInterval(captionRetryId);  captionRetryId = null; }
  if (sentenceResumeTimeoutId !== null) { clearTimeout(sentenceResumeTimeoutId); sentenceResumeTimeoutId = null; }
  if (sentenceDebounceId      !== null) { clearTimeout(sentenceDebounceId);      sentenceDebounceId      = null; }
  lastCaptionText = '';
  sentenceCount   = 0;
}

// Re-connect after YouTube SPA navigation (new video loads)
document.addEventListener('yt-navigate-finish', () => {
  if (sentencePauseEnabled) {
    // Give the new player a moment to render
    setTimeout(startCaptionWatcher, 1500);
  }
});

// ============================================================
// MESSAGE HANDLING
// ============================================================
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  if (msg.type === 'START') {
    // --- timer params (unchanged) ---
    startPauser(msg.seconds, msg.autoResume, msg.resumeSeconds);

    // --- sentence params (new) ---
    sentencePauseEnabled = !!msg.sentencePauseEnabled;
    sentence1PauseSecs   = msg.sentence1PauseSecs  ?? 2;
    sentence2PauseSecs   = msg.sentence2PauseSecs  ?? 4;
    sentenceAutoResume   = !!msg.sentenceAutoResume;

    if (sentencePauseEnabled) {
      startCaptionWatcher();
    } else {
      stopCaptionWatcher();
    }
    sendResponse({ ok: true });

  } else if (msg.type === 'STOP') {
    stopPauser();
    stopCaptionWatcher();
    sentencePauseEnabled = false;
    sendResponse({ ok: true });

  } else if (msg.type === 'GET_STATUS') {
    sendResponse({
      isEnabled,
      intervalSeconds,
      autoResume,
      resumeSeconds,
      sentencePauseEnabled,
      sentence1PauseSecs,
      sentence2PauseSecs,
      sentenceAutoResume
    });
  }

  return true;
});

// ============================================================
// RESTORE STATE ON PAGE LOAD
// ============================================================
chrome.storage.local.get([
  'isEnabled', 'intervalSeconds', 'autoResume', 'resumeSeconds',
  'sentencePauseEnabled', 'sentence1PauseSecs', 'sentence2PauseSecs', 'sentenceAutoResume'
], (data) => {
  sentencePauseEnabled = !!data.sentencePauseEnabled;
  sentence1PauseSecs   = data.sentence1PauseSecs  ?? 2;
  sentence2PauseSecs   = data.sentence2PauseSecs  ?? 4;
  sentenceAutoResume   = !!data.sentenceAutoResume;

  if (data.isEnabled) {
    startPauser(data.intervalSeconds || 10, !!data.autoResume, data.resumeSeconds || 5);
    if (sentencePauseEnabled) startCaptionWatcher();
  }
});
