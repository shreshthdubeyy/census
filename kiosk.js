// ==========================================================================
// CENSUS KIOSK ENGINE - STANDALONE CONTROLLER
// ==========================================================================

const API_URL = "https://script.google.com/macros/s/AKfycbyf2VOpYhOvVaMeUSI405NbxIMNsT3dwJVGlEXZjoaa0fE895DupTyWsk86cVSSfhrc/exec";

// Kiosk Session State
const kioskState = {
  isAuthenticated: false,
  kioskRecords: [],
  kioskIndex: 0
};

document.addEventListener('DOMContentLoaded', () => {
  initKiosk();
});

// Check access tokens, parameters, and initialize
function initKiosk() {
  // 1. Check query parameter auto-authentication (?password=8004993085 or ?key=8004993085)
  const urlParams = new URLSearchParams(window.location.search);
  const paramPassword = urlParams.get('password') || urlParams.get('key');
  
  if (paramPassword) {
    sessionStorage.setItem('kiosk_session_password', paramPassword);
    kioskState.isAuthenticated = true;
    showKioskDashboard();
    return;
  }
  
  // 2. Check session memory
  const sessionPassword = sessionStorage.getItem('kiosk_session_password');
  if (sessionPassword) {
    kioskState.isAuthenticated = true;
    showKioskDashboard();
  } else {
    // Show password lock prompt
    document.getElementById('kiosk-login-screen').style.display = 'flex';
    document.getElementById('kiosk-app-layout').style.display = 'none';
    const pwdInput = document.getElementById('kiosk-password');
    if (pwdInput) setTimeout(() => pwdInput.focus(), 150);
  }
}

// Handle login form submission
async function handleKioskLogin(event) {
  event.preventDefault();
  
  const pwdInput = document.getElementById('kiosk-password');
  const submitBtn = event.target.querySelector('button[type="submit"]');
  const password = pwdInput.value.trim();
  
  if (!password) return;
  
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i data-lucide="loader" class="animate-spin" style="width: 18px; height: 18px;"></i> Verifying Access...`;
  lucide.createIcons({ nodeList: submitBtn.querySelectorAll('[data-lucide]') });
  
  try {
    const payload = {
      action: 'authenticate',
      password: password
    };
    
    const response = await fetch(API_URL, {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    
    const data = await response.json();
    
    if (data.success) {
      sessionStorage.setItem('kiosk_session_password', password);
      kioskState.isAuthenticated = true;
      showToast("Access Unlocked", "Kiosk presentation panel activated.", "success");
      showKioskDashboard();
    } else {
      showToast("Access Denied", "Incorrect password. Please try again.", "error");
      pwdInput.focus();
    }
  } catch (err) {
    console.error("Kiosk login server error:", err);
    showToast("Connection Error", "Unable to connect to sheets server.", "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<i data-lucide="unlock"></i> Unlock Kiosk Screen`;
    lucide.createIcons({ nodeList: submitBtn.querySelectorAll('[data-lucide]') });
    pwdInput.value = "";
  }
}

// Display kiosk dashboard and pre-fetch entire dataset
function showKioskDashboard() {
  document.getElementById('kiosk-login-screen').style.display = 'none';
  document.getElementById('kiosk-app-layout').style.display = 'block';
  
  // Reload icons in top header
  lucide.createIcons({ nodeList: document.querySelectorAll('#kiosk-app-layout [data-lucide]') });
  
  fetchKioskData();
}

// Fetch all entries from Google Sheets API
async function fetchKioskData() {
  document.getElementById('kiosk-placeholder').style.display = 'none';
  document.getElementById('kiosk-carousel-container').style.display = 'none';
  document.getElementById('kiosk-footer-bar').style.display = 'none';
  document.getElementById('kiosk-skeleton').style.display = 'block';
  
  const token = sessionStorage.getItem('kiosk_session_password');
  
  try {
    const response = await fetch(`${API_URL}?action=getAllRecords&password=${encodeURIComponent(token)}`, {
      credentials: 'omit'
    });
    const data = await response.json();
    
    document.getElementById('kiosk-skeleton').style.display = 'none';
    
    if (data.success && data.data && data.data.length > 0) {
      kioskState.kioskRecords = data.data;
      kioskState.kioskIndex = 0;
      
      document.getElementById('kiosk-carousel-container').style.display = 'flex';
      document.getElementById('kiosk-footer-bar').style.display = 'block';
      
      // Focus Makaan search query on load
      const searchInput = document.getElementById('kiosk-makaan-query');
      if (searchInput) {
        searchInput.value = "";
        setTimeout(() => searchInput.focus(), 150);
      }
      
      renderKioskCard();
    } else {
      showKioskPlaceholder();
    }
  } catch (err) {
    console.error("API error while loading kiosk data:", err);
    document.getElementById('kiosk-skeleton').style.display = 'none';
    showToast("Offline mode active", "Running carousel with offline fallback data.", "warning");
    
    loadOfflineMockData();
  }
}

// Robust offline simulation in case Google Sheets is slow/blocked
function loadOfflineMockData() {
  kioskState.kioskRecords = [
    {
      bhavanId: "CN-0001",
      makaanId: "0001",
      mukhiyaNaam: "Ramesh Kumar Sharma",
      mobileNo: "9876543210",
      seId: "SE-A9812",
      remarks: "Self-employed, lives with family of 4",
      membersCount: "4"
    },
    {
      bhavanId: "CN-0002",
      makaanId: "0002",
      mukhiyaNaam: "Sunita Devi",
      mobileNo: "9812345678",
      seId: "SE-C2341",
      remarks: "Primary school teacher",
      membersCount: "3"
    },
    {
      bhavanId: "CN-0003",
      makaanId: "0003",
      mukhiyaNaam: "",
      mobileNo: "-",
      seId: "-",
      remarks: "Gair Avasiya - Local Durga Mandir temple structure.",
      membersCount: "0"
    },
    {
      bhavanId: "CN-0004",
      makaanId: "0004",
      mukhiyaNaam: "Amit Verma",
      mobileNo: "9988776655",
      seId: "SE-X8712",
      remarks: "Rented accommodation, works at tech startup.",
      membersCount: "5"
    }
  ];
  kioskState.kioskIndex = 0;
  
  document.getElementById('kiosk-carousel-container').style.display = 'flex';
  document.getElementById('kiosk-footer-bar').style.display = 'block';
  
  const searchInput = document.getElementById('kiosk-makaan-query');
  if (searchInput) searchInput.value = "";
  
  renderKioskCard();
}

function showKioskPlaceholder() {
  document.getElementById('kiosk-placeholder').style.display = 'block';
  document.getElementById('kiosk-carousel-container').style.display = 'none';
  document.getElementById('kiosk-footer-bar').style.display = 'none';
}

// Generate the beautiful presentation card HTML
function renderKioskCard(direction = null) {
  if (kioskState.kioskRecords.length === 0) {
    showKioskPlaceholder();
    return;
  }
  
  const record = kioskState.kioskRecords[kioskState.kioskIndex];
  const container = document.getElementById('kiosk-card-wrapper');
  
  // Pad the Makaan ID e.g. "0005"
  let formattedMId = record.makaanId;
  const mNum = parseInt(record.makaanId, 10);
  if (!isNaN(mNum)) {
    formattedMId = padNumber(mNum, 4);
  }
  
  const isGair = !record.mukhiyaNaam || record.mukhiyaNaam.trim() === "" || (record.remarks && record.remarks.toLowerCase().includes("gair avasiya"));
  
  const cardHTML = `
    <div class="kiosk-card ${isGair ? 'gair-kiosk' : ''}" id="current-kiosk-card">
      <div>
        <div class="kiosk-badge-wrapper">
          <span class="kiosk-badge bhavan">
            <i data-lucide="clipboard-signature" style="width: 14px; height: 14px;"></i> Bhavan: ${record.bhavanId}
          </span>
          <span class="kiosk-badge makaan" style="${isGair ? 'background-color: var(--border-light); color: var(--text-muted); border-color: transparent;' : ''}">
            <i data-lucide="${isGair ? 'alert-triangle' : 'home'}" style="width: 14px; height: 14px;"></i> Makaan: ${formattedMId}
          </span>
          ${isGair ? `
            <span class="kiosk-badge gair">
              <i data-lucide="alert-triangle" style="width: 14px; height: 14px;"></i> Non-Residential
            </span>
          ` : ''}
        </div>
        
        <h1 class="kiosk-mukhiya-name ${isGair ? 'gair-name' : ''}">
          ${isGair ? (record.mukhiyaNaam || "Gair Avasiya (Non-Residential)") : record.mukhiyaNaam}
        </h1>
      </div>
      
      <div class="kiosk-detail-grid">
        <div class="kiosk-detail-item">
          <span class="kiosk-detail-label">Mobile Number</span>
          <span class="kiosk-detail-value">
            <i data-lucide="phone"></i> ${record.mobileNo || '-'}
          </span>
        </div>
        
        <div class="kiosk-detail-item">
          <span class="kiosk-detail-label">Family Members Count</span>
          <span class="kiosk-detail-value">
            <i data-lucide="users"></i> ${record.membersCount || '0'}
          </span>
        </div>
        
        <div class="kiosk-detail-item">
          <span class="kiosk-detail-label">SE ID (Socio-Economic ID)</span>
          <span class="kiosk-detail-value">
            <i data-lucide="hash"></i> ${record.seId || '-'}
          </span>
        </div>
        
        <div class="kiosk-detail-item span-full">
          <span class="kiosk-detail-label">Remarks / Description</span>
          <span class="kiosk-detail-value" style="font-size: 1.05rem; font-weight: 500;">
            <i data-lucide="info"></i> ${record.remarks || 'No remarks provided.'}
          </span>
        </div>
      </div>
    </div>
  `;
  
  const applyCardHTML = () => {
    container.innerHTML = cardHTML;
    lucide.createIcons({ nodeList: container.querySelectorAll('[data-lucide]') });
    
    // Update indicator
    const idxActive = kioskState.kioskIndex + 1;
    document.getElementById('kiosk-page-indicator').textContent = `Makaan ${idxActive} of ${kioskState.kioskRecords.length}`;
    
    // Toggle nav arrows disabled state
    const prevBtn = document.getElementById('kiosk-prev-btn');
    const nextBtn = document.getElementById('kiosk-next-btn');
    if (prevBtn) prevBtn.disabled = kioskState.kioskRecords.length <= 1;
    if (nextBtn) nextBtn.disabled = kioskState.kioskRecords.length <= 1;
  };
  
  const oldCard = document.getElementById('current-kiosk-card');
  if (oldCard && direction) {
    if (direction === 'next') {
      oldCard.classList.add('slide-out-left');
      setTimeout(() => {
        applyCardHTML();
        const newCard = document.getElementById('current-kiosk-card');
        if (newCard) {
          newCard.classList.add('slide-in-right');
          setTimeout(() => newCard.classList.remove('slide-in-right'), 250);
        }
      }, 200);
    } else if (direction === 'prev') {
      oldCard.classList.add('slide-out-right');
      setTimeout(() => {
        applyCardHTML();
        const newCard = document.getElementById('current-kiosk-card');
        if (newCard) {
          newCard.classList.add('slide-in-left');
          setTimeout(() => newCard.classList.remove('slide-in-left'), 250);
        }
      }, 200);
    }
  } else {
    applyCardHTML();
  }
}

// Carousel Nav controllers
function nextKioskCard() {
  if (kioskState.kioskRecords.length === 0) return;
  kioskState.kioskIndex = (kioskState.kioskIndex + 1) % kioskState.kioskRecords.length;
  renderKioskCard('next');
}

function prevKioskCard() {
  if (kioskState.kioskRecords.length === 0) return;
  kioskState.kioskIndex = (kioskState.kioskIndex - 1 + kioskState.kioskRecords.length) % kioskState.kioskRecords.length;
  renderKioskCard('prev');
}

// Look up Makaan IDs dynamically in real time
function handleKioskMakaanSearch(query) {
  const clean = query.trim();
  if (!clean) return;
  
  const idx = kioskState.kioskRecords.findIndex(r => {
    const mId = (r.makaanId || "").toString().trim();
    const isPadded = mId === clean;
    const isInt = parseInt(mId, 10) === parseInt(clean, 10);
    return isPadded || isInt;
  });
  
  if (idx !== -1 && idx !== kioskState.kioskIndex) {
    const dir = idx > kioskState.kioskIndex ? 'next' : 'prev';
    kioskState.kioskIndex = idx;
    renderKioskCard(dir);
  }
}

// Keyboard Bindings
window.addEventListener('keydown', (event) => {
  if (kioskState.isAuthenticated) {
    if (event.key === 'ArrowRight') {
      nextKioskCard();
    } else if (event.key === 'ArrowLeft') {
      prevKioskCard();
    }
  }
});

// Pad number (e.g. 5 -> "0005")
function padNumber(num, size) {
  let s = num + "";
  while (s.length < size) s = "0" + s;
  return s;
}

// Secure Lock Kiosk Screen
function lockKiosk() {
  sessionStorage.removeItem('kiosk_session_password');
  kioskState.isAuthenticated = false;
  kioskState.kioskRecords = [];
  
  // Wipe parameters to prevent reload relogin
  window.history.replaceState({}, document.title, window.location.pathname);
  
  document.getElementById('kiosk-login-screen').style.display = 'flex';
  document.getElementById('kiosk-app-layout').style.display = 'none';
  
  showToast("Terminal Locked", "The kiosk screen was locked securely.", "success");
}

// Toast System
function showToast(title, message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toastId = 'toast-' + Math.random().toString(36).substr(2, 5);
  
  let iconName = 'check';
  if (type === 'error') iconName = 'x-circle';
  if (type === 'warning') iconName = 'alert-triangle';
  
  const toastHTML = `
    <div class="toast toast-${type}" id="${toastId}">
      <div class="toast-icon">
        <i data-lucide="${iconName}"></i>
      </div>
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        <div class="toast-msg">${message}</div>
      </div>
      <button class="toast-close" onclick="closeToast('${toastId}')">
        <i data-lucide="x" style="width: 16px; height: 16px;"></i>
      </button>
    </div>
  `;
  
  container.insertAdjacentHTML('beforeend', toastHTML);
  lucide.createIcons({ nodeList: container.querySelectorAll(`#${toastId} [data-lucide]`) });
  
  setTimeout(() => closeToast(toastId), 5000);
}

function closeToast(toastId) {
  const toast = document.getElementById(toastId);
  if (toast) {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }
}
