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
  const hasPasswordToken = sessionStorage.getItem('census_session_password') !== null;
  
  if (isAuthenticated && hasPasswordToken) {
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
      credentials: 'omit',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    });
    
    const data = await response.json();
    
    if (data.success) {
      // Store both authentication flag and password token inside active session memory
      sessionStorage.setItem('census_authenticated', 'true');
      sessionStorage.setItem('census_session_password', password);
      
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
  sessionStorage.removeItem('census_session_password');
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
  const token = sessionStorage.getItem('census_session_password');
  if (!token) return;
  
  try {
    // Digitally sign the GET request with the password token
    const response = await fetch(`${API_URL}?action=getNextIds&password=${encodeURIComponent(token)}`, {
      credentials: 'omit'
    });
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
    showToast("Sync Error", "Could not connect to the census server. Running in offline fallback.", "error");
    
    // Proactive Bug Fallback 1: If server is slow or offline, render forms with estimated values so worker can still type
    state.nextBhavanId = 'CN-0001';
    state.nextMakaanId = '0001';
    renderNextIds();
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
  
  const isGair = document.getElementById('new-gair-avasiya').checked;
  const token = sessionStorage.getItem('census_session_password');
  
  // Live Submission to Google Sheets Apps Script API
  try {
    // Digitally sign the POST request with the password token
    const payload = {
      action: 'createEntry',
      password: token,
      isGairAvasiya: isGair,
      entries: entries
    };
    
    const response = await fetch(API_URL, {
      method: 'POST',
      credentials: 'omit',
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

// Toggle dynamic validations for Gair Avasiya (New Form)
function toggleNewGairAvasiya(checkbox) {
  const isChecked = checkbox.checked;
  const container = document.getElementById('makaan-blocks-container');
  const addBtn = document.querySelector('#view-new-entry .btn-outline');
  
  if (isChecked) {
    // 1. Keep only the first block, remove others
    const blocks = container.querySelectorAll('.makaan-block');
    for (let i = 1; i < blocks.length; i++) {
      blocks[i].remove();
    }
    state.newFormBlocks = [state.newFormBlocks[0]];
    
    // 2. Hide "Add Makaan" button
    if (addBtn) addBtn.style.display = 'none';
    
    // 3. Adjust styles & required validators
    const firstBlock = container.querySelector('.makaan-block');
    if (firstBlock) {
      firstBlock.classList.add('disabled-gair');
      
      // Let it keep its progressive Makaan ID
      const currentIdStr = pad(parseInt(state.nextMakaanId, 10), 4);
      firstBlock.querySelector('.makaan-display-num').textContent = currentIdStr;
      firstBlock.querySelector('.makaan-number-hidden-input').value = currentIdStr;
      
      const requiredInputs = firstBlock.querySelectorAll('[required]');
      requiredInputs.forEach(input => {
        input.removeAttribute('required');
        input.classList.remove('invalid');
      });
      
      firstBlock.querySelectorAll('.input-label span').forEach(s => s.style.display = 'none');
      
      const remarksInput = firstBlock.querySelector('[name="remarks"]');
      if (remarksInput && !remarksInput.value.trim()) {
        remarksInput.value = "Gair Avasiya";
      }
    }
    // Update estimate at the top to display the next progressive number after this one
    const nextEst = pad(parseInt(state.nextMakaanId, 10) + 1, 4);
    document.getElementById('next-makaan-estimate').textContent = nextEst;
  } else {
    // Restore standard form states
    if (addBtn) addBtn.style.display = 'inline-flex';
    
    const firstBlock = container.querySelector('.makaan-block');
    if (firstBlock) {
      firstBlock.classList.remove('disabled-gair');
      
      const mukhiya = firstBlock.querySelector('[name="mukhiyaNaam"]');
      const mobile = firstBlock.querySelector('[name="mobileNo"]');
      if (mukhiya) mukhiya.setAttribute('required', 'true');
      if (mobile) mobile.setAttribute('required', 'true');
      
      firstBlock.querySelectorAll('.input-label span').forEach(s => s.style.display = 'inline');
      
      const remarksInput = firstBlock.querySelector('[name="remarks"]');
      if (remarksInput && remarksInput.value === "Gair Avasiya") {
        remarksInput.value = "";
      }
    }
    reindexNewFormMakaans();
  }
}

// Toggle dynamic validations for Gair Avasiya (Edit Form)
function toggleEditGairAvasiya(checkbox) {
  const isChecked = checkbox.checked;
  const container = document.getElementById('edit-makaan-blocks-container');
  const addBtn = document.querySelector('#view-search-edit .btn-outline');
  
  if (isChecked) {
    const blocks = container.querySelectorAll('.makaan-block');
    if (blocks.length > 1) {
      showToast("Blocks Marked For Removal", "Non-residential structures can only have one main block. Secondary families will be removed.", "warning");
      blocks.forEach((block, idx) => {
        if (idx > 0) {
          const mId = block.id.replace('edit-makaan-block-', '');
          if (!state.deletedMakaanIds.includes(mId)) {
            state.deletedMakaanIds.push(mId);
          }
        }
      });
    }
    if (addBtn) addBtn.style.display = 'none';
    renderEditForm();
  } else {
    if (addBtn) addBtn.style.display = 'inline-flex';
    renderEditForm();
  }
}

function resetNewForm() {
  const container = document.getElementById('makaan-blocks-container');
  container.innerHTML = '';
  state.newFormBlocks = [];
  
  const gairCheckbox = document.getElementById('new-gair-avasiya');
  if (gairCheckbox) {
    gairCheckbox.checked = false;
  }
  
  const addBtn = document.querySelector('#view-new-entry .btn-outline');
  if (addBtn) {
    addBtn.style.display = 'inline-flex';
  }
  
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

// Clear search results and reset view
function clearSearchResults() {
  document.getElementById('search-results-container').style.display = 'none';
  document.getElementById('edit-bhavan-form').style.display = 'none';
  document.getElementById('search-placeholder').style.display = 'block';
  
  const queryInput = document.getElementById('search-bhavan-query');
  queryInput.value = '';
  queryInput.focus();
}

// Load a specific Bhavan ID details directly into the edit panel
async function loadBhavanForEditing(bhavanId) {
  document.getElementById('search-results-container').style.display = 'none';
  document.getElementById('edit-bhavan-form').style.display = 'none';
  document.getElementById('search-skeleton').style.display = 'flex';
  
  state.searchQuery = bhavanId;
  state.searchResults = [];
  state.deletedMakaanIds = [];
  state.newMakaansInEdit = [];
  
  const token = sessionStorage.getItem('census_session_password');
  
  try {
    const response = await fetch(`${API_URL}?action=getBhavanDetails&bhavanId=${encodeURIComponent(bhavanId)}&password=${encodeURIComponent(token)}`, {
      credentials: 'omit'
    });
    const data = await response.json();
    
    document.getElementById('search-skeleton').style.display = 'none';
    
    if (data.success && data.data.length > 0) {
      state.searchResults = data.data;
      renderEditForm();
    } else {
      showNoResultsForQuery(bhavanId);
    }
  } catch (err) {
    console.error("API error while loading Bhavan:", err);
    document.getElementById('search-skeleton').style.display = 'none';
    showToast("Network Error", "Could not connect to the spreadsheet server.", "error");
    showNoResultsForQuery(bhavanId);
  }
}

// Perform high-fidelity universal search
async function performBhavanSearch() {
  const queryInput = document.getElementById('search-bhavan-query');
  const rawQuery = queryInput.value.trim();
  
  if (!rawQuery) {
    showToast("Search Error", "Please enter a search query (Bhavan ID, name, or phone)", "warning");
    return;
  }
  
  // Format query strictly if it matches CN-NNNN format for direct lookup
  let processedQuery = rawQuery;
  const digitMatch = rawQuery.match(/CN-(\d+)/i);
  if (digitMatch) {
    processedQuery = "CN-" + pad(parseInt(digitMatch[1], 10), 4);
    queryInput.value = processedQuery;
  } else if (!isNaN(parseInt(rawQuery, 10)) && rawQuery.length <= 4) {
    processedQuery = "CN-" + pad(parseInt(rawQuery, 10), 4);
    queryInput.value = processedQuery;
  }
  
  // Toggle states
  document.getElementById('search-placeholder').style.display = 'none';
  document.getElementById('edit-bhavan-form').style.display = 'none';
  document.getElementById('search-results-container').style.display = 'none';
  document.getElementById('search-skeleton').style.display = 'flex';
  
  state.searchResults = [];
  state.deletedMakaanIds = [];
  state.newMakaansInEdit = [];
  
  const token = sessionStorage.getItem('census_session_password');
  
  try {
    const response = await fetch(`${API_URL}?action=universalSearch&query=${encodeURIComponent(processedQuery)}&password=${encodeURIComponent(token)}`, {
      credentials: 'omit'
    });
    const data = await response.json();
    
    document.getElementById('search-skeleton').style.display = 'none';
    
    if (data.success && data.data && data.data.length > 0) {
      const records = data.data;
      const uniqueBhavans = [...new Set(records.map(r => r.bhavanId.toString().toUpperCase().trim()))];
      
      if (uniqueBhavans.length === 1) {
        // Direct Redirection: Load edit panel immediately if matches only span 1 Bhavan
        const matchedBhavanId = uniqueBhavans[0];
        showToast("Bhavan Loaded", `Displaying records for Bhavan ${matchedBhavanId}.`, "success");
        queryInput.value = matchedBhavanId;
        loadBhavanForEditing(matchedBhavanId);
      } else {
        // Multi-Match View: Display beautiful grouped card results list
        renderSearchResultsList(records);
      }
    } else {
      showNoResultsForQuery(rawQuery);
    }
  } catch (err) {
    console.error("API search error:", err);
    document.getElementById('search-skeleton').style.display = 'none';
    showToast("Network Error", "Could not connect to the database server.", "error");
    showNoResultsForQuery(rawQuery);
  }
}

// Render search results matching cards list
function renderSearchResultsList(records) {
  document.getElementById('search-placeholder').style.display = 'none';
  document.getElementById('edit-bhavan-form').style.display = 'none';
  
  const container = document.getElementById('search-results-container');
  const list = document.getElementById('search-results-list');
  const countSpan = document.getElementById('search-results-count');
  
  list.innerHTML = '';
  countSpan.textContent = records.length;
  
  records.forEach(record => {
    const isGair = !record.mukhiyaNaam || record.mukhiyaNaam.trim() === "" || (record.remarks && record.remarks.toLowerCase().includes("gair avasiya"));
    const makaanNum = parseInt(record.makaanId, 10);
    const formattedMakaanId = isNaN(makaanNum) ? record.makaanId : pad(makaanNum, 4);
    
    const cardHTML = `
      <div class="search-result-card" onclick="loadBhavanForEditing('${record.bhavanId}')">
        <div class="search-result-info">
          <div class="search-result-meta">
            <span class="search-result-badge bhavan">
              <i data-lucide="clipboard-signature" style="width: 12px; height: 12px;"></i> Bhavan: ${record.bhavanId}
            </span>
            <span class="search-result-badge makaan" style="${isGair ? 'background-color: var(--border-light); color: var(--text-muted);' : ''}">
              <i data-lucide="${isGair ? 'alert-triangle' : 'home'}" style="width: 12px; height: 12px;"></i> Makaan: ${formattedMakaanId} ${isGair ? ' (Gair Avasiya)' : ''}
            </span>
          </div>
          <div class="search-result-name">${isGair ? (record.mukhiyaNaam ? `${record.mukhiyaNaam} (Gair Avasiya)` : 'Gair Avasiya (Non-Residential)') : (record.mukhiyaNaam || 'N/A')}</div>
          <div class="search-result-details">
            <div class="search-result-detail-item">
              <i data-lucide="phone" style="width: 12px; height: 12px;"></i> ${record.mobileNo || 'N/A'}
            </div>
            ${record.seId ? `
              <div class="search-result-detail-item">
                <i data-lucide="hash" style="width: 12px; height: 12px;"></i> SE ID: ${record.seId}
              </div>
            ` : ''}
          </div>
        </div>
        <div class="search-result-action">
          <button type="button" class="btn btn-secondary">
            <i data-lucide="file-edit" style="width: 14px; height: 14px;"></i> Edit
          </button>
        </div>
      </div>
    `;
    list.insertAdjacentHTML('beforeend', cardHTML);
  });
  
  // Render Lucide Icons inside matching result cards
  lucide.createIcons({
    nodeList: list.querySelectorAll('[data-lucide]')
  });
  
  container.style.display = 'block';
}

function showNoResultsForQuery(query) {
  document.getElementById('search-results-container').style.display = 'none';
  document.getElementById('edit-bhavan-form').style.display = 'none';
  
  const placeholder = document.getElementById('search-placeholder');
  placeholder.style.display = 'block';
  
  placeholder.querySelector('h3').textContent = "No Records Found";
  placeholder.querySelector('p').textContent = `No census records matching "${query}" were found in the registry. Try another name, mobile number, or Bhavan ID.`;
}

function renderEditForm() {
  document.getElementById('search-placeholder').style.display = 'none';
  document.getElementById('edit-bhavan-form').style.display = 'block';
  
  // Set header details
  document.getElementById('edit-bhavan-id').textContent = state.searchQuery;
  
  // Check Gair Avasiya checkbox status
  const gairCheckbox = document.getElementById('edit-gair-avasiya');
  const loadedIsGair = state.searchResults.length > 0 && 
                       ((!state.searchResults[0].mukhiyaNaam || state.searchResults[0].mukhiyaNaam.trim() === "") || 
                        (state.searchResults[0].remarks && state.searchResults[0].remarks.toLowerCase().includes("gair avasiya")));
  const isGair = gairCheckbox ? gairCheckbox.checked : loadedIsGair;
  
  if (gairCheckbox) {
    gairCheckbox.checked = isGair;
  }
  
  document.getElementById('edit-families-count').textContent = isGair ? "0" : state.searchResults.length;
  
  const container = document.getElementById('edit-makaan-blocks-container');
  container.innerHTML = '';
  
  const addBtn = document.querySelector('#view-search-edit .btn-outline');
  if (addBtn) {
    addBtn.style.display = isGair ? 'none' : 'inline-flex';
  }
  
  if (isGair) {
    const baseMakaan = state.searchResults[0] || { makaanId: "", mukhiyaNaam: "", mobileNo: "", seId: "", remarks: "Gair Avasiya" };
    const makaanNum = parseInt(baseMakaan.makaanId, 10);
    const formattedMakaanId = isNaN(makaanNum) ? baseMakaan.makaanId : pad(makaanNum, 4);
    
    const cardHTML = `
      <div class="makaan-block disabled-gair" id="edit-makaan-block-${formattedMakaanId}">
        <div class="makaan-block-header">
          <span class="makaan-title" style="background-color: var(--color-primary-light); color: var(--color-primary);">
            <i data-lucide="home"></i> Makaan: <strong>${formattedMakaanId || '-'} (Non-Residential)</strong>
          </span>
        </div>
        
        <div class="makaan-grid">
          <input type="hidden" name="makaanId" value="${formattedMakaanId}">
          
          <!-- Mukhiya Naam -->
          <div class="input-container">
            <label class="input-label">Mukhiya ka Naam (Head of Family)</label>
            <input type="text" name="mukhiyaNaam" class="form-input" placeholder="Enter Full Name (Optional)" value="${baseMakaan.mukhiyaNaam || ''}" autocapitalize="words" autocomplete="name" oninput="validateField(this)">
          </div>
          
          <!-- Mobile Number -->
          <div class="input-container">
            <label class="input-label">Mobile No</label>
            <input type="tel" name="mobileNo" class="form-input" placeholder="10-digit number (Optional)" value="${baseMakaan.mobileNo || ''}" maxlength="10" inputmode="numeric" pattern="[0-9]{10}" oninput="formatMobileNumber(this); validateField(this);">
          </div>
          
          <!-- Standard Optional SE ID Input Field -->
          <div class="input-container">
            <label class="input-label">SE ID (Socio-Economic ID)</label>
            <input type="text" name="seId" class="form-input" placeholder="Social Economic ID (Optional)" value="${baseMakaan.seId || ''}" autocapitalize="characters" autocomplete="off" autocorrect="off">
          </div>
          
          <!-- Remarks -->
          <div class="input-container">
            <label class="input-label">Remarks</label>
            <input type="text" name="remarks" class="form-input" placeholder="Add optional remarks" value="${baseMakaan.remarks || 'Gair Avasiya'}">
          </div>
        </div>
      </div>
    `;
    
    container.insertAdjacentHTML('beforeend', cardHTML);
    lucide.createIcons({
      nodeList: container.querySelectorAll(`#edit-makaan-block-${formattedMakaanId} [data-lucide]`)
    });
  } else {
    state.searchResults.forEach((makaan, index) => {
      // Clean '-' if converting from Gair Avasiya
      if (makaan.makaanId === "-") {
        makaan.makaanId = "";
      }
      renderEditMakaanCard(makaan, index, container);
    });
  }
}

function renderEditMakaanCard(makaan, index, container) {
  const blockIndex = makaan.makaanId;
  const isDeleted = state.deletedMakaanIds.includes(blockIndex);
  
  // Proactive Bug Fallback 2: Handle NaN parsing safely in case of empty or corrupted spreadsheet rows
  const makaanNum = parseInt(makaan.makaanId, 10);
  const formattedMakaanId = isNaN(makaanNum) ? makaan.makaanId : pad(makaanNum, 4);
  
  const cardHTML = `
    <div class="makaan-block" id="edit-makaan-block-${blockIndex}" style="${isDeleted ? 'opacity: 0.5; border-color: var(--color-error);' : ''}">
      <div class="makaan-block-header">
        <span class="makaan-title" style="background-color: hsl(195, 80%, 94%); color: var(--color-secondary);">
          <i data-lucide="home"></i> Makaan: <strong>${formattedMakaanId}</strong>
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
  const token = sessionStorage.getItem('census_session_password');
  
  try {
    const response = await fetch(`${API_URL}?action=getNextIds&password=${encodeURIComponent(token)}`, {
      credentials: 'omit'
    });
    const data = await response.json();
    if (data.success) {
      let maxM = parseInt(data.nextMakaanId, 10) || 1;
      state.newMakaansInEdit.forEach(m => {
        const mVal = parseInt(m.makaanId, 10);
        if (!isNaN(mVal) && mVal >= maxM) maxM = mVal + 1;
      });
      nextIdStr = pad(maxM, 4);
    } else {
      throw new Error(data.error);
    }
  } catch (err) {
    console.error("API error while getting progressive edit index, falling back to local relative count:", err);
    
    // Proactive Bug Fallback 3: If API fails during edit additions, scan screen-visible cards to calculate progressive Makaan index safely
    let maxM = 1;
    state.searchResults.forEach(m => {
      const mVal = parseInt(m.makaanId, 10);
      if (!isNaN(mVal) && mVal >= maxM) maxM = mVal + 1;
    });
    nextIdStr = pad(maxM, 4);
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
  const isGair = document.getElementById('edit-gair-avasiya').checked;
  
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
  
  if (updatedEntries.length === 0 && !isGair) {
    showToast("Invalid Operation", "A Bhavan cannot be empty. Maintain at least one family record.", "error");
    updateBtn.disabled = false;
    updateBtn.innerHTML = `<i data-lucide="check-circle"></i> Save Updates`;
    lucide.createIcons({
      nodeList: updateBtn.querySelectorAll('[data-lucide]')
    });
    return;
  }
  
  const token = sessionStorage.getItem('census_session_password');
  
  try {
    // Digitally sign the update POST request with the password token
    const payload = {
      action: 'updateEntry',
      password: token,
      bhavanId: state.searchQuery,
      isGairAvasiya: isGair,
      entries: updatedEntries
    };
    
    const response = await fetch(API_URL, {
      method: 'POST',
      credentials: 'omit',
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
