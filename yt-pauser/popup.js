// popup.js

const secondsInput = document.getElementById('seconds-input');
const toggleBtn = document.getElementById('toggle-btn');
const statusBadge = document.getElementById('status-badge');
const statusText = document.getElementById('status-text');
const mainUI = document.getElementById('main-ui');
const notYoutube = document.getElementById('not-youtube');
const presetBtns = document.querySelectorAll('.preset-btn');
const autoResumeToggle = document.getElementById('auto-resume-toggle');
const resumeDurationWrap = document.getElementById('resume-duration-wrap');
const resumeInput = document.getElementById('resume-input');

let isEnabled = false;

// Show/hide resume duration when toggle changes
autoResumeToggle.addEventListener('change', () => {
  resumeDurationWrap.style.display = autoResumeToggle.checked ? 'block' : 'none';
});

function setStatus(enabled, seconds, resume, resumeSecs) {
  isEnabled = enabled;
  if (enabled) {
    statusBadge.className = 'status-badge on';
    const resumeStr = resume ? ` · resume in ${resumeSecs}s` : '';
    statusText.textContent = `Every ${seconds}s${resumeStr}`;
    toggleBtn.textContent = '■ Stop';
    toggleBtn.className = 'toggle-btn stop';
  } else {
    statusBadge.className = 'status-badge off';
    statusText.textContent = 'Inactive';
    toggleBtn.textContent = '▶ Start';
    toggleBtn.className = 'toggle-btn start';
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

toggleBtn.addEventListener('click', () => {
  const seconds = getSeconds();
  const resume = autoResumeToggle.checked;
  const resumeSecs = getResumeSeconds();

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab) return;

    if (!isEnabled) {
      chrome.tabs.sendMessage(tab.id, { type: 'START', seconds, autoResume: resume, resumeSeconds: resumeSecs }, () => {
        chrome.storage.local.set({ isEnabled: true, intervalSeconds: seconds, autoResume: resume, resumeSeconds: resumeSecs });
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

// Init: check if on YouTube and restore state
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  if (!tab || !tab.url || !tab.url.includes('youtube.com')) {
    mainUI.style.display = 'none';
    notYoutube.style.display = 'block';
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: 'GET_STATUS' }, (resp) => {
    if (chrome.runtime.lastError || !resp) {
      chrome.storage.local.get(['isEnabled', 'intervalSeconds', 'autoResume', 'resumeSeconds'], (data) => {
        const secs = data.intervalSeconds || 10;
        const resumeSecs = data.resumeSeconds || 5;
        const resume = !!data.autoResume;
        secondsInput.value = secs;
        resumeInput.value = resumeSecs;
        syncPresets(secs);
        autoResumeToggle.checked = resume;
        resumeDurationWrap.style.display = resume ? 'block' : 'none';
        setStatus(!!data.isEnabled, secs, resume, resumeSecs);
      });
      return;
    }
    secondsInput.value = resp.intervalSeconds || 10;
    resumeInput.value = resp.resumeSeconds || 5;
    syncPresets(resp.intervalSeconds || 10);
    autoResumeToggle.checked = !!resp.autoResume;
    resumeDurationWrap.style.display = resp.autoResume ? 'block' : 'none';
    setStatus(resp.isEnabled, resp.intervalSeconds || 10, !!resp.autoResume, resp.resumeSeconds || 5);
  });
});
