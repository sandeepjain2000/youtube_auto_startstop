// popup.js

// ============================================================
// EXISTING ELEMENTS  (unchanged)
// ============================================================
const secondsInput      = document.getElementById('seconds-input');
const toggleBtn         = document.getElementById('toggle-btn');
const statusBadge       = document.getElementById('status-badge');
const statusText        = document.getElementById('status-text');
const mainUI            = document.getElementById('main-ui');
const notYoutube        = document.getElementById('not-youtube');
const presetBtns        = document.querySelectorAll('.preset-btn');
const autoResumeToggle  = document.getElementById('auto-resume-toggle');
const resumeDurationWrap= document.getElementById('resume-duration-wrap');
const resumeInput       = document.getElementById('resume-input');

let isEnabled = false;

// Show/hide resume duration when toggle changes
autoResumeToggle.addEventListener('change', () => {
  resumeDurationWrap.style.display = autoResumeToggle.checked ? 'block' : 'none';
});

function setStatus(enabled, seconds, resume, resumeSecs) {
  isEnabled = enabled;
  if (enabled) {
    statusBadge.className  = 'status-badge on';
    const resumeStr        = resume ? ` · resume in ${resumeSecs}s` : '';
    statusText.textContent = `Every ${seconds}s${resumeStr}`;
    toggleBtn.textContent  = '■ Stop';
    toggleBtn.className    = 'toggle-btn stop';
  } else {
    statusBadge.className  = 'status-badge off';
    statusText.textContent = 'Inactive';
    toggleBtn.textContent  = '▶ Start';
    toggleBtn.className    = 'toggle-btn start';
  }
}

function syncPresets(val) {
  presetBtns.forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.val) === val);
  });
}

function getSeconds() {
  let val = parseInt(secondsInput.value, 10);
  if (isNaN(val) || val < 1) val = 1;
  if (val > 3600) val = 3600;
  secondsInput.value = val;
  return val;
}

function getResumeSeconds() {
  let val = parseInt(resumeInput.value, 10);
  if (isNaN(val) || val < 1) val = 1;
  if (val > 300) val = 300;
  resumeInput.value = val;
  return val;
}

// Pause interval buttons
document.getElementById('btn-minus').addEventListener('click', () => {
  let val = getSeconds();
  const step = val <= 10 ? 1 : val <= 60 ? 5 : 10;
  val = Math.max(1, val - step);
  secondsInput.value = val;
  syncPresets(val);
});

document.getElementById('btn-plus').addEventListener('click', () => {
  let val = getSeconds();
  const step = val < 10 ? 1 : val < 60 ? 5 : 10;
  val = Math.min(3600, val + step);
  secondsInput.value = val;
  syncPresets(val);
});

secondsInput.addEventListener('input', () => syncPresets(getSeconds()));

presetBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const val = parseInt(btn.dataset.val, 10);
    secondsInput.value = val;
    syncPresets(val);
  });
});

// Resume duration buttons
document.getElementById('resume-minus').addEventListener('click', () => {
  let val = getResumeSeconds();
  const step = val <= 10 ? 1 : 5;
  resumeInput.value = Math.max(1, val - step);
});

document.getElementById('resume-plus').addEventListener('click', () => {
  let val = getResumeSeconds();
  const step = val < 10 ? 1 : 5;
  resumeInput.value = Math.min(300, val + step);
});

// ============================================================
// SENTENCE PAUSE ELEMENTS  (new)
// ============================================================
const sentencePauseToggle  = document.getElementById('sentence-pause-toggle');
const sentenceSettings     = document.getElementById('sentence-settings');
const sentence1Input       = document.getElementById('sentence1-input');
const sentence2Input       = document.getElementById('sentence2-input');
const sentenceAutoResume   = document.getElementById('sentence-auto-resume');

// Show / hide sentence settings when master toggle changes
sentencePauseToggle.addEventListener('change', () => {
  sentenceSettings.style.display = sentencePauseToggle.checked ? 'block' : 'none';
});

// Helper: clamp a sentence-duration input (1 – 120 s)
function getSentenceSecs(input) {
  let val = parseInt(input.value, 10);
  if (isNaN(val) || val < 1) val = 1;
  if (val > 120) val = 120;
  input.value = val;
  return val;
}

// After-1st-sentence buttons
document.getElementById('s1-minus').addEventListener('click', () => {
  let val = getSentenceSecs(sentence1Input);
  sentence1Input.value = Math.max(1, val - 1);
});
document.getElementById('s1-plus').addEventListener('click', () => {
  let val = getSentenceSecs(sentence1Input);
  sentence1Input.value = Math.min(120, val + 1);
});

// After-2nd-sentence buttons
document.getElementById('s2-minus').addEventListener('click', () => {
  let val = getSentenceSecs(sentence2Input);
  sentence2Input.value = Math.max(1, val - 1);
});
document.getElementById('s2-plus').addEventListener('click', () => {
  let val = getSentenceSecs(sentence2Input);
  sentence2Input.value = Math.min(120, val + 1);
});

// ============================================================
// START / STOP  (extended to include sentence params)
// ============================================================
toggleBtn.addEventListener('click', () => {
  const seconds    = getSeconds();
  const resume     = autoResumeToggle.checked;
  const resumeSecs = getResumeSeconds();

  // Sentence pause params
  const spEnabled  = sentencePauseToggle.checked;
  const s1Secs     = getSentenceSecs(sentence1Input);
  const s2Secs     = getSentenceSecs(sentence2Input);
  const spResume   = sentenceAutoResume.checked;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab) return;

    if (!isEnabled) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'START',
        // timer params (unchanged)
        seconds, autoResume: resume, resumeSeconds: resumeSecs,
        // sentence params (new)
        sentencePauseEnabled: spEnabled,
        sentence1PauseSecs:   s1Secs,
        sentence2PauseSecs:   s2Secs,
        sentenceAutoResume:   spResume
      }, () => {
        chrome.storage.local.set({
          isEnabled: true,
          intervalSeconds: seconds, autoResume: resume, resumeSeconds: resumeSecs,
          sentencePauseEnabled: spEnabled,
          sentence1PauseSecs: s1Secs,
          sentence2PauseSecs: s2Secs,
          sentenceAutoResume: spResume
        });
        setStatus(true, seconds, resume, resumeSecs);
      });
    } else {
      chrome.tabs.sendMessage(tab.id, { type: 'STOP' }, () => {
        chrome.storage.local.set({ isEnabled: false });
        setStatus(false, seconds, resume, resumeSecs);
      });
    }
  });
});

// ============================================================
// INIT: check YouTube tab + restore full state
// ============================================================
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  if (!tab || !tab.url || !tab.url.includes('youtube.com')) {
    mainUI.style.display   = 'none';
    notYoutube.style.display = 'block';
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: 'GET_STATUS' }, (resp) => {
    // Helper to apply all saved values to the UI
    function applyState(secs, resume, resumeSecs, spEnabled, s1, s2, spResume) {
      secondsInput.value            = secs;
      resumeInput.value             = resumeSecs;
      syncPresets(secs);
      autoResumeToggle.checked      = resume;
      resumeDurationWrap.style.display = resume ? 'block' : 'none';

      sentencePauseToggle.checked   = spEnabled;
      sentenceSettings.style.display = spEnabled ? 'block' : 'none';
      sentence1Input.value          = s1;
      sentence2Input.value          = s2;
      sentenceAutoResume.checked    = spResume;
    }

    if (chrome.runtime.lastError || !resp) {
      // Fall back to storage
      chrome.storage.local.get([
        'isEnabled', 'intervalSeconds', 'autoResume', 'resumeSeconds',
        'sentencePauseEnabled', 'sentence1PauseSecs', 'sentence2PauseSecs', 'sentenceAutoResume'
      ], (data) => {
        const secs      = data.intervalSeconds        || 10;
        const resumeSecs= data.resumeSeconds           || 5;
        const resume    = !!data.autoResume;
        const spEnabled = !!data.sentencePauseEnabled;
        const s1        = data.sentence1PauseSecs      ?? 2;
        const s2        = data.sentence2PauseSecs      ?? 4;
        const spResume  = !!data.sentenceAutoResume;
        applyState(secs, resume, resumeSecs, spEnabled, s1, s2, spResume);
        setStatus(!!data.isEnabled, secs, resume, resumeSecs);
      });
      return;
    }

    // Use live response from content script
    applyState(
      resp.intervalSeconds        || 10,
      !!resp.autoResume,
      resp.resumeSeconds          || 5,
      !!resp.sentencePauseEnabled,
      resp.sentence1PauseSecs     ?? 2,
      resp.sentence2PauseSecs     ?? 4,
      !!resp.sentenceAutoResume
    );
    setStatus(resp.isEnabled, resp.intervalSeconds || 10, !!resp.autoResume, resp.resumeSeconds || 5);
  });
});
