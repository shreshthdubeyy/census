// ==========================================================================
// STATE MANAGEMENT & GLOBAL CONFIG
// ==========================================================================

// Secured direct Google Apps Script Web App Endpoint URL
const API_URL = "https://script.google.com/macros/s/AKfycbyf2VOpYhOvVaMeUSI405NbxIMNsT3dwJVGlEXZjoaa0fE895DupTyWsk86cVSSfhrc/exec";

// Global App State
const state = {
  currentView: 'new-entry',
  
  // Next IDs fetched directly from Google Sheets
  nextBhavanId: 'CN-0001',
  nextMakaanId: '0001',
  
  // New entry form current blocks
  newFormBlocks: [],
  
  // Search and Edit state
  searchQuery: '',
  searchResults: [], // Rows of Makaans currently loaded in edit panel
  deletedMakaanIds: [], // Track Makaans removed during editing
  newMakaansInEdit: [] // Track newly added Makaans in the edit form
};

// ==========================================================================
// INITIALIZATION & VIEW CONTROLLER
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  // Check browser session cache for existing authentication status
  const isAuthenticated = sessionStorage.getItem('census_authenticated') === 'true';
  if (isAuthenticated) {
    showDashboard();
  } else {
    showLogin();
  }
}

// Render Login Page Layout
function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('main-app-layout').style.display = 'none';
  
  const passwordInput = document.getElementById('login-password');
  passwordInput.value = "";
  setTimeout(() => passwordInput.focus(), 150);
}

// Render Authenticated Dashboard
function showDashboard() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('main-app-layout').style.display = 'block';
  
  // Trigger progressive database ID sync
  fetchNextIdState();
  
  // Reload icons inside dashboard header/tabs
  lucide.createIcons({
    nodeList: document.querySelectorAll('#main-app-layout [data-lucide]')
  });
}

// Handle Secure Server-Side Authentication (Password-Only)
async function handleLoginSubmit(event) {
  event.preventDefault();
  
  const passwordInput = document.getElementById('login-password');
  const submitBtn = event.target.querySelector('button[type="submit"]');
  const password = passwordInput.value;
  
  // Disable button and show loader spinner
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i data-lucide="loader" class="animate-spin"></i> Verifying...`;
  lucide.createIcons({
    nodeList: submitBtn.querySelectorAll('[data-lucide]')
  });
  
  try {
    const payload = {
      action: 'authenticate',
      password: password
    };
    
    // Fetch secure comparison result from Google cloud server-side
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    });
    
    const data = await response.json();
    
    if (data.success) {
      sessionStorage.setItem('census_authenticated', 'true');
      showToast("App Unlocked", "Welcome to the Census Registry system.", "success");
      showDashboard();
    } else {
      showToast("Access Denied", "Incorrect password. Please try again.", "error");
      passwordInput.focus();
    }
  } catch (err) {
    console.error("Authentication server error:", err);
    showToast("Connection Error", "Could not reach authentication server. Please check internet connection.", "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<i data-lucide="unlock"></i> Unlock Application`;
    lucide.createIcons({
      nodeList: submitBtn.querySelectorAll('[data-lucide]')
    });
    passwordInput.value = ""; // Always wipe password input for safety
  }
}

// Handle Session Logout / App Locking
function handleLogout() {
  sessionStorage.removeItem('census_authenticated');
  showToast("Application Locked", "Your active session was locked securely.", "success");
  showLogin();
}

// Switch between panels smoothly
function switchView(viewName) {
  state.currentView = viewName;
  
  // Adjust tabs active state
  document.getElementById('tab-new-entry').classList.toggle('active', viewName === 'new-entry');
  document.getElementById('tab-search-edit').classList.toggle('active', viewName === 'search-edit');
  
  // Adjust panels visibility
  document.getElementById('view-new-entry').classList.toggle('active', viewName === 'new-entry');
  document.getElementById('view-search-edit').classList.toggle('active', viewName === 'search-edit');
  
  // If moving to search view, refocus search
  if (viewName === 'search-edit') {
    setTimeout(() => document.getElementById('search-bhavan-query').focus(), 150);
  }
}

// ==========================================================================
// ID GENERATION ENGINE
// ==========================================================================

async function fetchNextIdState() {
  try {
    const response = await fetch(`${API_URL}?action=getNextIds`);
    const data = await response.json();
    if (data.success) {
      state.nextBhavanId = data.nextBhavanId;
      state.nextMakaanId = data.nextMakaanId;
      renderNextIds();
    } else {
      throw new Error(data.error || "Failed to fetch IDs");
    }
  } catch (err) {
    console.error("API Error fetching next IDs:", err);
    showToast("Sync Error", "Could not connect to the census server. Please check internet connection.", "error");
  }
}

function renderNextIds() {
  document.getElementById('new-bhavan-id').textContent = state.nextBhavanId;
  document.getElementById('next-makaan-estimate').textContent = state.nextMakaanId;
  
  // Re-render blocks to ensure progressive starting numbers are accurate
  if (state.newFormBlocks.length === 0) {
    // Initialize with 1 default block if form is completely empty
    addMakaanBlock();
  } else {
    reindexNewFormMakaans();
  }
}

function pad(num, size) {
  let s = num + "";
  while (s.length < size) s = "0" + s;
  return s;
}

// ==========================================================================
// INTERACTIVE FORM GENERATION (NEW ENTRIES)
// ==========================================================================

function addMakaanBlock(initialData = null) {
  const container = document.getElementById('makaan-blocks-container');
  
  // Create a unique temporary index for identifying DOM blocks
  const blockIndex = Date.now() + Math.random().toString(36).substr(2, 5);
  
  const blockHTML = `
    <div class="makaan-block" id="makaan-block-${blockIndex}" data-block-id="${blockIndex}">
      <div class="makaan-block-header">
        <span class="makaan-title">
          <i data-lucide="home"></i> Makaan: <strong class="makaan-display-num">XXXX</strong>
        </span>
        <button type="button" class="remove-makaan-btn" onclick="removeMakaanBlock('${blockIndex}')" title="Remove Makaan Entry">
          <i data-lucide="trash-2"></i> Remove
        </button>
      </div>
      
      <div class="makaan-grid">
        <!-- Hidden Makaan Number Input -->
        <input type="hidden" class="makaan-number-hidden-input" name="makaanId">
        
        <!-- Mukhiya Naam -->
        <div class="input-container">
          <label class="input-label">Mukhiya ka Naam (Head of Family) <span>*</span></label>
          <input type="text" name="mukhiyaNaam" class="form-input" placeholder="Enter Full Name" required autocapitalize="words" autocomplete="name" oninput="validateField(this)">
        </div>
        
        <!-- Mobile Number -->
        <div class="input-container">
          <label class="input-label">Mobile No <span>*</span></label>
          <input type="tel" name="mobileNo" class="form-input" placeholder="e.g. 9876543210" required maxlength="10" inputmode="numeric" pattern="[0-9]{10}" oninput="formatMobileNumber(this); validateField(this);">
        </div>
        
        <!-- SE ID (Socio-Economic ID) - Standard Alphanumeric Optional Field -->
        <div class="input-container">
          <label class="input-label">SE ID (Socio-Economic ID)</label>
          <input type="text" name="seId" class="form-input" placeholder="Enter Socio-Economic ID (Optional)" autocapitalize="characters" autocomplete="off" autocorrect="off">
        </div>
        
        <!-- Remarks -->
        <div class="input-container">
          <label class="input-label">Remarks</label>
          <input type="text" name="remarks" class="form-input" placeholder="Add optional remarks">
        </div>
      </div>
    </div>
  `;
  
  container.insertAdjacentHTML('beforeend', blockHTML);
  lucide.createIcons({
    attrs: {
      "stroke-width": 2
    },
    nameAttr: "data-lucide",
    nodeList: container.querySelectorAll(`[id="makaan-block-${blockIndex}"] [data-lucide]`)
  });
  
  state.newFormBlocks.push(blockIndex);
  
  // Recalculate progressive Makaan IDs across all blocks
  reindexNewFormMakaans();
}

function removeMakaanBlock(blockIndex) {
  // Ensure at least one block remains
  if (state.newFormBlocks.length <= 1) {
    showToast("Invalid Action", "A Bhavan must have at least one Makaan/family record.", "warning");
    return;
  }
  
  const block = document.getElementById(`makaan-block-${blockIndex}`);
  if (block) {
    // Add slide-out fade animation before removing
    block.style.transform = "scale(0.95)";
    block.style.opacity = "0";
    setTimeout(() => {
      block.remove();
      state.newFormBlocks = state.newFormBlocks.filter(id => id !== blockIndex);
      reindexNewFormMakaans();
    }, 200);
  }
}

// Ensure Makaan numbering stays in exact progressive order
function reindexNewFormMakaans() {
  const container = document.getElementById('makaan-blocks-container');
  const blocks = container.querySelectorAll('.makaan-block');
  
  let currentMakaanNum = parseInt(state.nextMakaanId, 10);
  
  blocks.forEach((block, idx) => {
    const formattedId = pad(currentMakaanNum, 4);
    
    // Update display label
    block.querySelector('.makaan-display-num').textContent = formattedId;
    
    // Update hidden input value
    block.querySelector('.makaan-number-hidden-input').value = formattedId;
    
    currentMakaanNum++;
  });
  
  // Update Estimated Next Makaan at top
  const lastBlock = blocks[blocks.length - 1];
  if (lastBlock) {
    const lastBlockNum = parseInt(lastBlock.querySelector('.makaan-number-hidden-input').value, 10);
    document.getElementById('next-makaan-estimate').textContent = pad(lastBlockNum + 1, 4);
  }
}

// ==========================================================================
// FORM INPUT VALIDATORS & FORMATTERS
// ==========================================================================

function formatMobileNumber(input) {
  let cleanValue = input.value.replace(/\D/g, '');
  if (cleanValue.length > 10) {
    cleanValue = cleanValue.substring(0, 10);
  }
  input.value = cleanValue;
}

function validateField(input) {
  if (input.required && (!input.value || input.value.trim() === "")) {
    input.classList.add('invalid');
    return false;
  }
  
  if (input.name === "mobileNo") {
    if (input.value.length !== 10) {
      input.classList.add('invalid');
      return false;
    }
  }
  
  input.classList.remove('invalid');
  return true;
}

function validateForm(form) {
  const inputs = form.querySelectorAll('input[required]');
  let isValid = true;
  
  inputs.forEach(input => {
    const isFieldValid = validateField(input);
    if (!isFieldValid) {
      isValid = false;
    }
  });
  
  if (!isValid) {
    showToast("Validation Error", "Please fill in all required fields (*) with valid information.", "error");
  }
  
  return isValid;
}

// ==========================================================================
// SUBMIT NEW BHAVAN DETAILS (DIRECT LIVE SYNC)
// ==========================================================================

async function handleNewSubmit(event) {
  event.preventDefault();
  
  const form = document.getElementById('new-bhavan-form');
  if (!validateForm(form)) return;
  
  const submitBtn = document.getElementById('submit-new-btn');
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i data-lucide="loader" class="animate-spin"></i> Saving...`;
  lucide.createIcons({
    nodeList: submitBtn.querySelectorAll('[data-lucide]')
  });
  
  const container = document.getElementById('makaan-blocks-container');
  const blocks = container.querySelectorAll('.makaan-block');
  const entries = [];
  
  blocks.forEach(block => {
    entries.push({
      mukhiyaNaam: block.querySelector('[name="mukhiyaNaam"]').value.trim(),
      mobileNo: block.querySelector('[name="mobileNo"]').value.trim(),
      seId: block.querySelector('[name="seId"]').value.trim(), // Optional SE ID Manual Input
      remarks: block.querySelector('[name="remarks"]').value.trim()
    });
  });
  
  // Live Submission to Google Sheets Apps Script API
  try {
    const payload = {
      action: 'createEntry',
      entries: entries
    };
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8' // Crucial to avoid CORS OPTIONS pre-flight checks
      },
      body: JSON.stringify(payload)
    });
    
    const data = await response.json();
    
    if (data.success) {
      showToast("Sync Successful", `Created Bhavan ${data.bhavanId} with ${entries.length} records.`, "success");
      resetNewForm();
      fetchNextIdState();
    } else {
      throw new Error(data.error || "Backend failed to write row");
    }
  } catch (err) {
    console.error("API Post error:", err);
    showToast("Sync Failed", "Could not save details. Please check connection and try again.", "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<i data-lucide="save"></i> Submit Bhavan details`;
    lucide.createIcons({
      nodeList: submitBtn.querySelectorAll('[data-lucide]')
    });
  }
}

function resetNewForm() {
  const container = document.getElementById('makaan-blocks-container');
  container.innerHTML = '';
  state.newFormBlocks = [];
  
  const submitBtn = document.getElementById('submit-new-btn');
  submitBtn.disabled = false;
  submitBtn.innerHTML = `<i data-lucide="save"></i> Submit Bhavan details`;
  
  addMakaanBlock(); // Re-add first blank block
}

// ==========================================================================
// SEARCH & EDIT MODULE (DIRECT LIVE SYNC)
// ==========================================================================

function handleSearchKeyPress(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    performBhavanSearch();
  }
}

async function performBhavanSearch() {
  const queryInput = document.getElementById('search-bhavan-query');
  const rawQuery = queryInput.value.trim();
  
  if (!rawQuery) {
    showToast("Search Error", "Please enter a valid Bhavan ID (e.g. CN-0001)", "warning");
    return;
  }
  
  // Uniform formatting of search queries (e.g., CN-1 -> CN-0001)
  let formattedQuery = rawQuery.toUpperCase();
  const digitMatch = rawQuery.match(/CN-(\d+)/i);
  if (digitMatch) {
    formattedQuery = "CN-" + pad(parseInt(digitMatch[1], 10), 4);
  } else if (!formattedQuery.startsWith("CN-") && !isNaN(parseInt(formattedQuery, 10))) {
    formattedQuery = "CN-" + pad(parseInt(formattedQuery, 10), 4);
  }
  
  queryInput.value = formattedQuery;
  state.searchQuery = formattedQuery;
  
  // Toggle states
  document.getElementById('search-placeholder').style.display = 'none';
  document.getElementById('edit-bhavan-form').style.display = 'none';
  document.getElementById('search-skeleton').style.display = 'flex';
  
  state.searchResults = [];
  state.deletedMakaanIds = [];
  state.newMakaansInEdit = [];
  
  try {
    const response = await fetch(`${API_URL}?action=getBhavanDetails&bhavanId=${encodeURIComponent(formattedQuery)}`);
    const data = await response.json();
    
    document.getElementById('search-skeleton').style.display = 'none';
    
    if (data.success && data.data.length > 0) {
      state.searchResults = data.data;
      renderEditForm();
    } else {
      showNoResults();
    }
  } catch (err) {
    console.error("API error while searching:", err);
    document.getElementById('search-skeleton').style.display = 'none';
    showToast("Network Error", "Could not connect to the spreadsheet server.", "error");
    showNoResults();
  }
}

function showNoResults() {
  document.getElementById('search-placeholder').style.display = 'block';
  document.getElementById('edit-bhavan-form').style.display = 'none';
  
  const placeholder = document.getElementById('search-placeholder');
  placeholder.querySelector('h3').textContent = "No Records Found";
  placeholder.querySelector('p').textContent = `No census records were found in the database matching Bhavan ID: ${state.searchQuery}.`;
}

function renderEditForm() {
  document.getElementById('search-placeholder').style.display = 'none';
  document.getElementById('edit-bhavan-form').style.display = 'block';
  
  // Set header details
  document.getElementById('edit-bhavan-id').textContent = state.searchQuery;
  document.getElementById('edit-families-count').textContent = state.searchResults.length;
  
  const container = document.getElementById('edit-makaan-blocks-container');
  container.innerHTML = '';
  
  state.searchResults.forEach((makaan, index) => {
    renderEditMakaanCard(makaan, index, container);
  });
}

function renderEditMakaanCard(makaan, index, container) {
  const blockIndex = makaan.makaanId;
  const isDeleted = state.deletedMakaanIds.includes(blockIndex);
  
  // Enforce NNNN formatting (4-digit padding) for visual output
  const formattedMakaanId = pad(parseInt(makaan.makaanId, 10), 4);
  
  const cardHTML = `
    <div class="makaan-block" id="edit-makaan-block-${blockIndex}" style="${isDeleted ? 'opacity: 0.5; border-color: var(--color-error);' : ''}">
      <div class="makaan-block-header">
        <span class="makaan-title" style="background-color: hsl(195, 80%, 94%); color: var(--color-secondary);">
          <i data-lucide="home"></i> Makaan Sankhya: <strong>${formattedMakaanId}</strong>
        </span>
        
        ${isDeleted ? 
          `<button type="button" class="btn" style="min-height:30px; height:30px; padding:0 12px; background-color: var(--border-light); font-size:0.8rem; border-radius:15px;" onclick="restoreDeletedMakaan('${blockIndex}')">
            <i data-lucide="rotate-ccw"></i> Restore family
          </button>` : 
          `<button type="button" class="remove-makaan-btn" onclick="markMakaanForDeletion('${blockIndex}')" title="Delete Family Record">
            <i data-lucide="trash-2"></i> Delete
          </button>`
        }
      </div>
      
      <div class="makaan-grid" style="${isDeleted ? 'pointer-events: none;' : ''}">
        <input type="hidden" name="makaanId" value="${formattedMakaanId}">
        
        <!-- Mukhiya Naam -->
        <div class="input-container">
          <label class="input-label">Mukhiya ka Naam <span>*</span></label>
          <input type="text" name="mukhiyaNaam" class="form-input" placeholder="Enter Full Name" required value="${makaan.mukhiyaNaam || ''}" autocapitalize="words" autocomplete="name" oninput="validateField(this)">
        </div>
        
        <!-- Mobile Number -->
        <div class="input-container">
          <label class="input-label">Mobile No <span>*</span></label>
          <input type="tel" name="mobileNo" class="form-input" placeholder="10-digit number" required value="${makaan.mobileNo || ''}" maxlength="10" inputmode="numeric" pattern="[0-9]{10}" oninput="formatMobileNumber(this); validateField(this);">
        </div>
        
        <!-- Standard Optional SE ID Input Field -->
        <div class="input-container">
          <label class="input-label">SE ID (Socio-Economic ID)</label>
          <input type="text" name="seId" class="form-input" placeholder="Social Economic ID (Optional)" value="${makaan.seId || ''}" autocapitalize="characters" autocomplete="off" autocorrect="off">
        </div>
        
        <!-- Remarks -->
        <div class="input-container">
          <label class="input-label">Remarks</label>
          <input type="text" name="remarks" class="form-input" placeholder="Add optional remarks" value="${makaan.remarks || ''}">
        </div>
      </div>
    </div>
  `;
  
  container.insertAdjacentHTML('beforeend', cardHTML);
  lucide.createIcons({
    nodeList: container.querySelectorAll(`#edit-makaan-block-${blockIndex} [data-lucide]`)
  });
}

function markMakaanForDeletion(makaanId) {
  state.deletedMakaanIds.push(makaanId);
  showToast("Record Marked for Deletion", `Makaan ${makaanId} will be removed upon saving.`, "warning");
  renderEditForm();
}

function restoreDeletedMakaan(makaanId) {
  state.deletedMakaanIds = state.deletedMakaanIds.filter(id => id !== makaanId);
  showToast("Record Restored", `Makaan ${makaanId} restored to active list.`, "success");
  renderEditForm();
}

// Add a brand new Makaan block *during* the editing of an existing Bhavan
async function addMakaanToEdit() {
  let nextIdStr = "";
  
  try {
    const response = await fetch(`${API_URL}?action=getNextIds`);
    const data = await response.json();
    if (data.success) {
      let maxM = parseInt(data.nextMakaanId, 10);
      state.newMakaansInEdit.forEach(m => {
        const mVal = parseInt(m.makaanId, 10);
        if (!isNaN(mVal) && mVal >= maxM) maxM = mVal + 1;
      });
      nextIdStr = pad(maxM, 4);
    } else {
      throw new Error(data.error);
    }
  } catch (err) {
    console.error(err);
    nextIdStr = pad(9999, 4); // Fallback standard
  }
  
  const newMakaan = {
    bhavanId: state.searchQuery,
    makaanId: nextIdStr,
    mukhiyaNaam: "",
    mobileNo: "",
    seId: "", // Empty default manual optional input
    remarks: "",
    isNew: true
  };
  
  state.searchResults.push(newMakaan);
  state.newMakaansInEdit.push(newMakaan);
  
  renderEditForm();
  
  setTimeout(() => {
    const el = document.getElementById(`edit-makaan-block-${nextIdStr}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.querySelector('[name="mukhiyaNaam"]').focus();
    }
  }, 100);
  
  showToast("New Family Block Added", `Makaan ID: ${nextIdStr} assigned as a progressive entry.`, "success");
}

// Submit updates back to Google Sheet
async function handleEditSubmit(event) {
  event.preventDefault();
  
  const form = document.getElementById('edit-bhavan-form');
  if (!validateForm(form)) return;
  
  const updateBtn = document.getElementById('update-btn');
  updateBtn.disabled = true;
  updateBtn.innerHTML = `<i data-lucide="loader" class="animate-spin"></i> Saving Updates...`;
  lucide.createIcons({
    nodeList: updateBtn.querySelectorAll('[data-lucide]')
  });
  
  const container = document.getElementById('edit-makaan-blocks-container');
  const cards = container.querySelectorAll('.makaan-block');
  const updatedEntries = [];
  
  cards.forEach(card => {
    const makaanId = card.querySelector('[name="makaanId"]').value;
    
    if (state.deletedMakaanIds.includes(makaanId)) {
      return; 
    }
    
    updatedEntries.push({
      makaanId: makaanId,
      mukhiyaNaam: card.querySelector('[name="mukhiyaNaam"]').value.trim(),
      mobileNo: card.querySelector('[name="mobileNo"]').value.trim(),
      seId: card.querySelector('[name="seId"]').value.trim(), // Manual optional SE ID
      remarks: card.querySelector('[name="remarks"]').value.trim()
    });
  });
  
  if (updatedEntries.length === 0) {
    showToast("Invalid Operation", "A Bhavan cannot be empty. Maintain at least one family record.", "error");
    updateBtn.disabled = false;
    updateBtn.innerHTML = `<i data-lucide="check-circle"></i> Save Updates`;
    lucide.createIcons({
      nodeList: updateBtn.querySelectorAll('[data-lucide]')
    });
    return;
  }
  
  try {
    const payload = {
      action: 'updateEntry',
      bhavanId: state.searchQuery,
      entries: updatedEntries
    };
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    });
    
    const data = await response.json();
    
    if (data.success) {
      showToast("Sync Successful", `Successfully updated Bhavan ${state.searchQuery} in Google Sheets.`, "success");
      performBhavanSearch();
      fetchNextIdState();
    } else {
      throw new Error(data.error || "Save failed on Google server");
    }
  } catch (err) {
    console.error("API Update Error:", err);
    showToast("Sync Failed", "Could not update record on the live Google Sheet.", "error");
  } finally {
    updateBtn.disabled = false;
    updateBtn.innerHTML = `<i data-lucide="check-circle"></i> Save Updates`;
    lucide.createIcons({
      nodeList: updateBtn.querySelectorAll('[data-lucide]')
    });
  }
}

// ==========================================================================
// TOAST NOTIFICATIONS ENGINE
// ==========================================================================

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
  
  lucide.createIcons({
    nodeList: container.querySelectorAll(`#${toastId} [data-lucide]`)
  });
  
  setTimeout(() => {
    closeToast(toastId);
  }, 5000);
}

function closeToast(toastId) {
  const toast = document.getElementById(toastId);
  if (toast) {
    toast.classList.add('removing');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }
}
