// Safe Lucide helper fallback
if (typeof lucide === 'undefined') {
  window.lucide = {
    createIcons: () => console.warn("Lucide icons library not loaded yet.")
  };
}

// Helper to clean parenthetical role suffixes from user names
function cleanName(name) {
  if (!name) return '';
  return name.replace(/\s*\((CEO|Sales|Manager|Admin|Sales\s*Agent)\)/gi, '').trim();
}

// API Configuration
const API_BASE = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1') ? 'http://localhost:5000' : window.location.origin;

function getAuthHeaders() {
  const token = localStorage.getItem('crm_jwt_token');
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : ''
  };
}

// Global fetch interceptor to handle session revocation / deactivation (401/403 errors)
const originalFetch = window.fetch;
window.fetch = async function(...args) {
  const response = await originalFetch(...args);
  if (response.status === 401 || response.status === 403) {
    const url = args[0] || '';
    if (typeof url === 'string' && !url.includes('/api/auth/login') && !url.includes('/api/auth/verify-otp')) {
      console.warn("Session revoked by backend. Logging out...");
      localStorage.removeItem('crm_logged_in');
      localStorage.removeItem('crm_current_user');
      localStorage.removeItem('crm_actual_user');
      localStorage.removeItem('crm_jwt_token');
      
      alert("Your session has expired, company workspace has been deactivated, or your account was deleted. You will be logged out.");
      window.location.reload();
    }
  }
  return response;
};

// CRM State
let leads = [];
let platformTutorials = [];
let companyInfo = null;
let invoices = [];
let activeTab = 'dashboard';
let currentUser = null; // Loaded after authentication

let connectedGoogleAccount = localStorage.getItem('connected_google_account') || null;

function showGoogleClientIdModal(callback) {
  const overlayId = 'googleClientIdModalOverlay';
  let modalOverlay = document.getElementById(overlayId);
  if (!modalOverlay) {
    modalOverlay = document.createElement('div');
    modalOverlay.id = overlayId;
    modalOverlay.className = 'modal-overlay';
    modalOverlay.style.zIndex = '100010';
    modalOverlay.style.display = 'none';
    modalOverlay.style.alignItems = 'center';
    modalOverlay.style.justifyContent = 'center';
    modalOverlay.style.position = 'fixed';
    modalOverlay.style.top = '0';
    modalOverlay.style.left = '0';
    modalOverlay.style.width = '100%';
    modalOverlay.style.height = '100%';
    modalOverlay.style.background = 'rgba(0,0,0,0.85)';
    document.body.appendChild(modalOverlay);
  }

  const savedClientId = localStorage.getItem('google_client_id') || '';

  modalOverlay.innerHTML = `
    <div class="settings-card" style="width: 500px; max-width: 95%; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 12px; padding: 1.5rem; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); color: var(--text-primary); font-family: 'Outfit', sans-serif;">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem; margin-bottom: 1rem;">
        <h3 style="font-size: 1rem; font-weight: 700; color: var(--text-primary); margin: 0; display: flex; align-items: center; gap: 0.5rem; font-family: 'Outfit';">
          <i data-lucide="settings" style="color: var(--accent-blue); width: 20px; height: 20px;"></i> Google Integration Settings
        </h3>
        <button id="clientIdCloseBtn" style="background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 4px;">
          <i data-lucide="x" style="width: 18px; height: 18px;"></i>
        </button>
      </div>

      <div style="display: flex; flex-direction: column; gap: 1rem;">
        <p style="font-size: 0.78rem; color: var(--text-secondary); line-height: 1.4; margin: 0;">
          To connect real Google accounts and call the Google Calendar / Google Meet APIs, you must supply your <strong>Google OAuth Client ID</strong> from the Google Cloud Console.
        </p>

        <div style="background: rgba(59, 130, 246, 0.05); padding: 0.75rem; border-radius: 6px; border: 1px solid rgba(59, 130, 246, 0.2); font-size: 0.74rem; line-height: 1.4; color: var(--text-primary);">
          <div style="font-weight: 700; margin-bottom: 0.35rem; color: var(--accent-blue);">How to obtain in 1 minute:</div>
          1. Go to the <a href="https://console.cloud.google.com/apis/credentials" target="_blank" style="color: var(--accent-blue); text-decoration: underline;">Google Cloud Console Credentials Screen</a>.<br>
          2. Click <strong>+ Create Credentials</strong> and select <strong>OAuth client ID</strong>.<br>
          3. Set the application type to <strong>Web application</strong>.<br>
          4. Under <strong>Authorized JavaScript origins</strong>, add your current URL origin: 
             <code style="background: rgba(0,0,0,0.3); padding: 1px 4px; border-radius: 3px; font-family: monospace;">${window.location.origin}</code><br>
          5. Copy the generated Client ID and paste it below!
        </div>

        <div>
          <label style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 0.35rem;">Google OAuth Client ID</label>
          <input type="text" id="googleClientIdInput" class="form-control" placeholder="123456-abcde.apps.googleusercontent.com" value="${savedClientId}" style="font-size: 0.78rem; background: var(--bg-primary); width: 100%;">
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1.5rem; border-top: 1px solid var(--border-color); padding-top: 1rem;">
        <button id="clientIdCancelBtn" class="btn-secondary" style="font-size: 0.8rem; padding: 0.45rem 1rem;">Cancel</button>
        <button id="clientIdSaveBtn" class="btn-primary" style="font-size: 0.8rem; padding: 0.45rem 1rem; background: var(--accent-blue); border-color: var(--accent-blue);">Save & Authorize</button>
      </div>
    </div>
  `;
  
  lucide.createIcons();

  document.getElementById('clientIdCloseBtn').onclick = () => {
    modalOverlay.classList.remove('active');
    modalOverlay.style.display = 'none';
  };
  document.getElementById('clientIdCancelBtn').onclick = () => {
    modalOverlay.classList.remove('active');
    modalOverlay.style.display = 'none';
  };
  document.getElementById('clientIdSaveBtn').onclick = () => {
    const inputVal = document.getElementById('googleClientIdInput').value.trim();
    if (!inputVal) {
      showAppNotification("Error", "Please enter a valid Google OAuth Client ID", "warning");
      return;
    }
    localStorage.setItem('google_client_id', inputVal);
    modalOverlay.classList.remove('active');
    modalOverlay.style.display = 'none';
    
    triggerRealGoogleAuth(callback);
  };

  modalOverlay.style.display = 'flex';
  modalOverlay.classList.add('active');
}

function triggerRealGoogleAuth(callback) {
  const clientId = localStorage.getItem('google_client_id') || '';
  if (!clientId) {
    showGoogleClientIdModal(callback);
    return;
  }

  try {
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events',
      callback: async (resp) => {
        if (resp.error) {
          showAppNotification("Auth Error", resp.error, "danger");
          return;
        }
        if (resp.access_token) {
          localStorage.setItem('google_access_token', resp.access_token);
          
          try {
            const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { 'Authorization': `Bearer ${resp.access_token}` }
            });
            if (infoRes.ok) {
              const userInfo = await infoRes.json();
              connectedGoogleAccount = userInfo.email;
              localStorage.setItem('connected_google_account', userInfo.email);
              showAppNotification("Google Auth Success", `Connected as ${userInfo.email}`, "success");
            } else {
              connectedGoogleAccount = 'google-user@gmail.com';
              localStorage.setItem('connected_google_account', 'google-user@gmail.com');
            }
          } catch (e) {
            connectedGoogleAccount = 'google-user@gmail.com';
            localStorage.setItem('connected_google_account', 'google-user@gmail.com');
          }
          if (callback) callback(connectedGoogleAccount);
        }
      },
    });
    tokenClient.requestAccessToken({ prompt: 'consent' });
  } catch (err) {
    console.error("GSI library error:", err);
    showAppAlert("Google Library Error", "Google Authentication SDK could not be loaded. Please ensure you are online and check browser blockers.");
  }
}

function triggerGoogleAuthFlow(callback) {
  triggerRealGoogleAuth(callback);
}

function openGoogleCalendarInNewTab(title, dateVal, timeVal, meetLink, candidateEmail, coInterviewersList, description) {
  let startStr = '';
  let endStr = '';
  
  if (dateVal) {
    const timeStr = timeVal || '10:00';
    try {
      const dateObj = new Date(`${dateVal}T${timeStr}:00`);
      if (!isNaN(dateObj.getTime())) {
        const pad = (num) => String(num).padStart(2, '0');
        const y = dateObj.getFullYear();
        const m = pad(dateObj.getMonth() + 1);
        const d = pad(dateObj.getDate());
        const hh = pad(dateObj.getHours());
        const mm = pad(dateObj.getMinutes());
        const ss = pad(dateObj.getSeconds());
        
        startStr = `${y}${m}${d}T${hh}${mm}${ss}`;
        
        const endObj = new Date(dateObj.getTime() + 60 * 60 * 1000);
        const ey = endObj.getFullYear();
        const em = pad(endObj.getMonth() + 1);
        const ed = pad(endObj.getDate());
        const ehh = pad(endObj.getHours());
        const emm = pad(endObj.getMinutes());
        const ess = pad(endObj.getSeconds());
        
        endStr = `${ey}${em}${ed}T${ehh}${emm}${ess}`;
      }
    } catch(e) {}
  }
  
  if (!startStr) {
    const now = new Date();
    const pad = (num) => String(num).padStart(2, '0');
    startStr = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}T100000`;
    endStr = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}T110000`;
  }
  
  const datesParam = `${startStr}/${endStr}`;
  const attendees = [candidateEmail, ...coInterviewersList].filter(Boolean).join(',');
  
  let detailsText = description || '';
  if (meetLink) {
    detailsText += `\n\nGoogle Meet: ${meetLink}`;
  }
  
  const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${datesParam}&details=${encodeURIComponent(detailsText)}&add=${encodeURIComponent(attendees)}&sf=true`;
  
  window.open(gcalUrl, '_blank');
}


function togglePasswordVisibility(inputId, eyeId) {
  const input = document.getElementById(inputId);
  let eye = document.getElementById(eyeId);
  if (input) {
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    
    if (eye) {
      const newIconName = isPassword ? 'eye-off' : 'eye';
      const newI = document.createElement('i');
      newI.id = eyeId;
      newI.setAttribute('data-lucide', newIconName);
      newI.style.cssText = 'width: 18px; height: 18px;';
      eye.parentNode.replaceChild(newI, eye);
      if (window.lucide) {
        window.lucide.createIcons();
      }
    }
  }
}

function mapStatusToIndustryStage(status, stages) {
  if (!status) return stages[0];
  if (stages.includes(status)) return status;
  
  const lowerStatus = status.toLowerCase();
  const lowerStages = stages.map(s => s.toLowerCase());
  const index = lowerStages.indexOf(lowerStatus);
  if (index !== -1) return stages[index];

  if (lowerStatus === 'new') return stages[0];
  if (lowerStatus === 'contacted') return stages[1];
  if (lowerStatus === 'inprogress') return stages[2];
  if (lowerStatus === 'won') return stages[3];
  if (lowerStatus === 'lost') return stages[4];

  return stages[0];
}

function formatLeadTimestamp(isoString) {
  if (!isoString) return 'N/A';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
  } catch (e) {
    return isoString;
  }
}

function updateIndustryDropdowns() {
  const activeIndustry = (companyInfo && companyInfo.industry) || (currentUser && currentUser.industry) || "Real Estate CRM Software";
  const profile = INDUSTRY_PROFILES[activeIndustry];
  const stages = (profile && profile.stages) ? profile.stages : ['new', 'contacted', 'inprogress', 'won', 'lost'];

  const getStageLabel = (st) => {
    if (st === 'new') return 'New Lead';
    if (st === 'contacted') return 'Contacted';
    if (st === 'inprogress') return 'In Progress';
    if (st === 'won') return 'Working with them (won)';
    if (st === 'lost') return 'Rejected (lost)';
    return st;
  };

  // 1. Update Leads Directory Filter Dropdown (#filterStatus)
  const filterStatus = document.getElementById('filterStatus');
  if (filterStatus) {
    const currentVal = filterStatus.value;
    filterStatus.innerHTML = '<option value="all">All Statuses</option>';
    stages.forEach(stage => {
      filterStatus.innerHTML += `<option value="${stage}">${getStageLabel(stage)}</option>`;
    });
    if (stages.includes(currentVal)) {
      filterStatus.value = currentVal;
    } else {
      filterStatus.value = 'all';
    }
  }

  // 2. Update Add/Edit Lead Modal Status Dropdown (#leadStatus)
  const leadStatus = document.getElementById('leadStatus');
  if (leadStatus) {
    const currentVal = leadStatus.value;
    leadStatus.innerHTML = '';
    stages.forEach(stage => {
      leadStatus.innerHTML += `<option value="${stage}">${getStageLabel(stage)}</option>`;
    });
    if (stages.includes(currentVal)) {
      leadStatus.value = currentVal;
    } else {
      leadStatus.value = stages[0];
    }
  }
}

// Onboarding Walkthrough Tour state
let currentTourStep = 0;
const tourSteps = [
  {
    title: "Welcome to NeoGenCode CRM!",
    text: "This is your multi-tenant SaaS hub. Let's orient you to the system in 1 minute. Click Next to tour the main dashboard metrics!"
  },
  {
    title: "Analytics Dashboard Overview",
    text: "At a glance, monitor lead volume trends, conversion funnels, and your sales closures leaderboard. You can collapse this overview section for more screen space!"
  },
  {
    title: "Interactive Leads Directory",
    text: "View, edit, search, and manage leads. Normal agents can request deletion, while managers approve them to maintain clean data rosters."
  },
  {
    title: "Sales Pipeline & Kanban Boards",
    text: "Manage and move deals smoothly by dragging cards across columns to advance their conversion statuses."
  },
  {
    title: "Campaign Dispatcher Settings",
    text: "Schedule automated WhatsApp template drafts and AI email responses to engage with leads instantly on creation."
  }
];

// SaaS multi-tenant state
let companies = JSON.parse(localStorage.getItem('crm_companies')) || [
  { id: 'tenant-abc', name: 'ABC Technologies', status: 'Active', plan: 'Enterprise', memberLimit: 50, createdDate: '2026-06-01' },
  { id: 'tenant-xyz', name: 'XYZ Pvt Ltd', status: 'Active', plan: 'Starter', memberLimit: 5, createdDate: '2026-06-15' },
  { id: 'tenant-google', name: 'Google', status: 'Active', plan: 'Enterprise', memberLimit: 50, createdDate: '2026-06-20' }
];

let deleteRequests = JSON.parse(localStorage.getItem('crm_delete_requests')) || [];
let activeTenantId = localStorage.getItem('saas_active_tenant_id') || 'all';
let speechRecognition = null;
let isRecording = false;

const INDUSTRY_PROFILES = {
  "Recruitment CRM Software": {
    label: "Recruitment CRM",
    stages: ["new", "contacted", "inprogress", "won", "lost"],
    fields: []
  },
  "Loan DSA Software CRM": {
    label: "Loan DSA CRM",
    stages: ["new", "contacted", "inprogress", "won", "lost"],
    stageLabels: {
      "new": "New Loan Inquiry",
      "contacted": "Docs Collected",
      "inprogress": "Bank Underwriting",
      "won": "Sanctioned & Disbursed",
      "lost": "Rejected / Cancelled"
    },
    fields: [
      { id: "loanType", label: "Loan Category", placeholder: "Home, Personal, Business, LAP", type: "select", options: ["Personal Loan", "Home Loan", "Business Loan", "Loan Against Property (LAP)", "Auto / Car Loan", "Education Loan"] },
      { id: "loanAmt", label: "Required Loan Amount (₹)", placeholder: "e.g. 2,500,000 or 25 Lakhs", type: "text" },
      { id: "loanIncome", label: "Applicant Monthly Income (₹)", placeholder: "e.g. 85,000", type: "text" },
      { id: "cibilScore", label: "CIBIL / Credit Score", placeholder: "Select CIBIL Range", type: "select", options: ["750+ (Excellent)", "700 - 749 (Good)", "650 - 699 (Fair)", "Below 650 (Poor)"] },
      { id: "loanBank", label: "Target Partner Bank / NBFC", placeholder: "e.g. HDFC Bank, ICICI Bank", type: "select", options: ["HDFC Bank", "ICICI Bank", "State Bank of India (SBI)", "Axis Bank", "Kotak Mahindra Bank", "Bajaj Finserv", "Tata Capital", "L&T Finance", "Other NBFC"] },
      { id: "payoutPercent", label: "DSA Commission / Payout %", placeholder: "e.g. 1.8%", type: "text" }
    ]
  },
  "Loan DSA CRM Software": {
    label: "Loan DSA CRM",
    stages: ["new", "contacted", "inprogress", "won", "lost"],
    stageLabels: {
      "new": "New Loan Inquiry",
      "contacted": "Docs Collected",
      "inprogress": "Bank Underwriting",
      "won": "Sanctioned & Disbursed",
      "lost": "Rejected / Cancelled"
    },
    fields: [
      { id: "loanType", label: "Loan Category", placeholder: "Home, Personal, Business, LAP", type: "select", options: ["Personal Loan", "Home Loan", "Business Loan", "Loan Against Property (LAP)", "Auto / Car Loan", "Education Loan"] },
      { id: "loanAmt", label: "Required Loan Amount (₹)", placeholder: "e.g. 2,500,000 or 25 Lakhs", type: "text" },
      { id: "loanIncome", label: "Applicant Monthly Income (₹)", placeholder: "e.g. 85,000", type: "text" },
      { id: "cibilScore", label: "CIBIL / Credit Score", placeholder: "Select CIBIL Range", type: "select", options: ["750+ (Excellent)", "700 - 749 (Good)", "650 - 699 (Fair)", "Below 650 (Poor)"] },
      { id: "loanBank", label: "Target Partner Bank / NBFC", placeholder: "e.g. HDFC Bank, ICICI Bank", type: "select", options: ["HDFC Bank", "ICICI Bank", "State Bank of India (SBI)", "Axis Bank", "Kotak Mahindra Bank", "Bajaj Finserv", "Tata Capital", "L&T Finance", "Other NBFC"] },
      { id: "payoutPercent", label: "DSA Commission / Payout %", placeholder: "e.g. 1.8%", type: "text" }
    ]
  },
  "Real Estate CRM Software": {
    label: "Real Estate",
    stages: ["Inquiry", "Site Visit Scheduled", "Negotiation", "Closed Won", "Lost"],
    fields: [
      { id: "propType", label: "Property Type", placeholder: "e.g. 3BHK Apartment, Villa", type: "text" },
      { id: "propBudget", label: "Property Budget", placeholder: "e.g. 75L - 1C", type: "text" },
      { id: "propLoc", label: "Preferred Location", placeholder: "e.g. Sector 62, Noida", type: "text" }
    ]
  },
  "Education CRM Software": {
    label: "Education",
    stages: ["Inquiry", "Counseling", "Document Verification", "Fees Paid", "Enrollment Closed"],
    fields: [
      { id: "eduCourse", label: "Selected Course", placeholder: "e.g. B.Tech CS, MBA", type: "text" },
      { id: "eduIntake", label: "Academic Intake", placeholder: "e.g. Fall 2026", type: "text" },
      { id: "eduQual", label: "Last Qualification", placeholder: "e.g. Class 12", type: "text" }
    ]
  },
  "Loan DSA CRM Software": {
    label: "Loan DSA",
    stages: ["Application Filed", "Documents Collected", "Credit Underwriting", "Approved", "Disbursed"],
    fields: [
      { id: "loanAmt", label: "Loan Amount", placeholder: "e.g. 25 Lakhs", type: "text" },
      { id: "loanType", label: "Loan Type", placeholder: "e.g. Home, Personal, Business", type: "text" },
      { id: "loanIncome", label: "Monthly Income", placeholder: "e.g. 80,000", type: "text" },
      { id: "loanBank", label: "Partner Bank", placeholder: "e.g. HDFC Bank, ICICI Bank", type: "text" }
    ]
  },
  "Travel CRM Software": {
    label: "Travel & Tourism",
    stages: ["Inquiry", "Package Shared", "Booking Confirmed", "Visa Processing", "Trip Completed"],
    fields: [
      { id: "travelDest", label: "Destination", placeholder: "e.g. Maldives, Europe Tour", type: "text" },
      { id: "travelDate", label: "Travel Date", placeholder: "e.g. 2026-10-15", type: "date" },
      { id: "travelGuests", label: "Group Size", placeholder: "e.g. 4 Adults", type: "text" }
    ]
  },
  "Healthcare CRM Software": {
    label: "Healthcare",
    stages: ["Appointment Inquiry", "Slot Confirmed", "Consultation Completed", "Treatment Plan Active", "Discharged"],
    fields: [
      { id: "healthDept", label: "Department", placeholder: "e.g. Cardiology, Orthopedics", type: "text" },
      { id: "healthDoc", label: "Preferred Doctor", placeholder: "e.g. Dr. Sharma", type: "text" },
      { id: "healthDate", label: "Appointment Date", placeholder: "e.g. 2026-07-25", type: "date" }
    ]
  },
  "CRM for Startups": {
    label: "Startup / Fundraising",
    stages: ["Intro Meeting", "Due Diligence", "Term Sheet Issued", "Legal Review", "Closed Round"],
    fields: [
      { id: "startupDeck", label: "Pitch Deck Link", placeholder: "e.g. https://docsend.com/...", type: "text" },
      { id: "startupStage", label: "Funding Stage", placeholder: "e.g. Seed, Series A", type: "text" },
      { id: "startupVal", label: "Target Valuation", placeholder: "e.g. $10 Million", type: "text" }
    ]
  },
  "Call Center CRM": {
    label: "Call Center",
    stages: ["Unreached", "Call Scheduled", "Follow-up Needed", "Interested", "DNC (Do Not Call)"],
    fields: [
      { id: "callCampaign", label: "Campaign Name", placeholder: "e.g. Q3 Insurances Outreach", type: "text" },
      { id: "callDisp", label: "Last Call Disposition", placeholder: "e.g. Answered - Interested", type: "text" }
    ]
  },
  "Debt Collection Software": {
    label: "Debt Collection",
    stages: ["Assigned", "Debtor Contacted", "Settlement Offered", "Payment Plan Active", "Paid in Full"],
    fields: [
      { id: "debtAmt", label: "Delinquent Amount", placeholder: "e.g. 1.2 Lakhs", type: "text" },
      { id: "debtOffer", label: "Settlement Offer", placeholder: "e.g. 85,000", type: "text" },
      { id: "debtPayDate", label: "Next Payment Date", placeholder: "e.g. 2026-08-01", type: "date" }
    ]
  },
  "Manufacturing CRM": {
    label: "Manufacturing",
    stages: ["RFQ Received", "Quote Dispatched", "Order Confirmed", "Production Started", "Shipped"],
    fields: [
      { id: "mfgQty", label: "Required Quantity", placeholder: "e.g. 5000 Units", type: "text" },
      { id: "mfgProduct", label: "Product Model", placeholder: "e.g. Steel Pipe Grade-A", type: "text" },
      { id: "mfgLoc", label: "Warehouse Location", placeholder: "e.g. Plant-3 Delhi", type: "text" }
    ]
  },
  "Retail CRM": {
    label: "Retail Walk-ins",
    stages: ["Walk-in", "Product Demo", "Cart Abandoned", "Purchase Completed", "Feedback Submitted"],
    fields: [
      { id: "retailCat", label: "Product Category", placeholder: "e.g. Electronics, Fashion", type: "text" },
      { id: "retailLoyalty", label: "Loyalty Tier", placeholder: "e.g. Gold, Platinum", type: "text" }
    ]
  }
};

// Field dictation state variables
let activeFieldRecognition = null;
let activeFieldId = null;
let datePatterns = {};

// Mock Data to populate on first load if localStorage is empty
const MOCK_LEADS = [
  {
    id: 'lead-1',
    name: 'David Chen',
    designation: 'VP of Technology at ByteFlow',
    phone: '+1 555-0142',
    email: 'dchen@byteflow.io',
    source: 'LinkedIn',
    status: 'inprogress',
    lastFollowUp: getRelativeDateString(-2), // 2 days ago
    nextFollowUp: getRelativeDateString(0),  // Today! (Triggers reminder)
    foundBy: 'Alice Smith',
    summary: 'Interested in core database upgrades.',
    assignedAgent: 'Sarah',
    organization: 'Company A',
    createdDate: getRelativeDateString(-5)
  },
  {
    id: 'lead-2',
    name: 'Sarah Jenkins',
    designation: 'Product Manager at CloudScale',
    phone: '+1 555-0189',
    email: 'sarah.j@cloudscale.com',
    source: 'Website',
    status: 'new',
    lastFollowUp: getRelativeDateString(0), // Today
    nextFollowUp: getRelativeDateString(1),  // Tomorrow
    foundBy: 'Bob Jones',
    summary: 'Needs pricing info for enterprise tier.',
    assignedAgent: 'Sarah',
    organization: 'Company A',
    createdDate: getRelativeDateString(-2)
  },
  {
    id: 'lead-3',
    name: 'Robert Martinez',
    designation: 'Director of Procurement',
    phone: '+1 555-0231',
    email: 'r.martinez@apexcorp.com',
    source: 'Referral',
    status: 'won',
    lastFollowUp: getRelativeDateString(-5),
    nextFollowUp: getRelativeDateString(14), // 2 weeks from now
    foundBy: 'Alice Smith',
    summary: 'Signed SLA. Upgraded from basic tier.',
    assignedAgent: 'Sarah',
    organization: 'Company A',
    createdDate: getRelativeDateString(-15)
  },
  {
    id: 'lead-4',
    name: 'Elena Rostova',
    designation: 'Elena Rostova',
    phone: '+1 555-0312',
    email: 'elena@rostov-solutions.eu',
    source: 'Cold Call',
    status: 'lost',
    lastFollowUp: getRelativeDateString(-10),
    nextFollowUp: getRelativeDateString(30),
    foundBy: 'Charlie Brown',
    summary: 'No budget for this quarter. Try again next year.',
    assignedAgent: 'John Doe',
    organization: 'Company A',
    createdDate: getRelativeDateString(-10)
  }
];

// Helper to calculate relative date strings
function getRelativeDateString(daysOffset) {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().split('T')[0];
}

// Format date nicely for human reading (e.g. "Jun 27, 2026")
function formatDateNice(dateStr) {
  if (!dateStr) return 'N/A';
  const options = { month: 'short', day: 'numeric', year: 'numeric' };
  return new Date(dateStr).toLocaleDateString('en-US', options);
}

// Document Ready Setup
document.addEventListener('DOMContentLoaded', () => {
  // Load theme preference
  const savedTheme = localStorage.getItem('crm_theme') || 'dark';
  if (savedTheme === 'light') {
    document.body.classList.add('light-theme');
  }

  // Real-time phone number sanitization
  const enforcePhoneFormatting = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        el.value = el.value.replace(/[^0-9+]/g, '');
      });
    }
  };
  enforcePhoneFormatting('leadPhone');
  enforcePhoneFormatting('candPhone');
  enforcePhoneFormatting('leadCandPhone');

  // Load data from LocalStorage or initialize with Mock Data
  const savedLeads = localStorage.getItem('leads_data');
  if (savedLeads) {
    leads = JSON.parse(savedLeads);
    leads.forEach(l => {
      if (!l.organization) l.organization = 'Company A';
    });
  } else {
    leads = [...MOCK_LEADS];
    saveLeadsToStorage();
  }
  
  // Asynchronously connect remote Turso Cloud DB
  initRemoteDatabase();

  // Initialize date patterns dictionary dynamically based on weekday index
  datePatterns = {
    'yesterday': -1,
    'today': 0,
    'tomorrow': 1,
    'next week': 7,
    'in two days': 2,
    'in three days': 3,
    'next monday': getDaysUntilWeekday(1),
    'next tuesday': getDaysUntilWeekday(2),
    'next wednesday': getDaysUntilWeekday(3),
    'next thursday': getDaysUntilWeekday(4),
    'next friday': getDaysUntilWeekday(5),
    'next saturday': getDaysUntilWeekday(6),
    'next sunday': getDaysUntilWeekday(0),
  };

  // Load Saved Google Sheet settings URL
  const savedSheetsUrl = localStorage.getItem('google_sheets_url');
  if (savedSheetsUrl && document.getElementById('googleWebAppUrl')) {
    document.getElementById('googleWebAppUrl').value = savedSheetsUrl;
  }

  // Load Saved Turso credentials
  if (document.getElementById('tursoUrl')) {
    document.getElementById('tursoUrl').value = localStorage.getItem('turso_url') || '';
    document.getElementById('tursoToken').value = localStorage.getItem('turso_token') || '';
  }

  // Load Sync Storage Target selection
  const savedTarget = localStorage.getItem('sync_storage_target') || 'sheets';
  const targetDropdown = document.getElementById('syncStorageTarget');
  if (targetDropdown) {
    targetDropdown.value = savedTarget;
    updateSyncButtonLabel(savedTarget);
  }

  // Load Saved WhatsApp notification configs
  if (document.getElementById('welcomeMessageTemplate')) {
    document.getElementById('welcomeMessageTemplate').value = localStorage.getItem('welcome_message_template') || 'Hello {name}! Welcome to our company. How can we help you today?';
    document.getElementById('notifyOnNewLead').checked = localStorage.getItem('notify_on_new_lead') === 'true';
    document.getElementById('notifyOnFollowUp').checked = localStorage.getItem('notify_on_follow_up') === 'true';
  }

  // Load Saved Meta tokens
  if (document.getElementById('metaAccessToken')) {
    document.getElementById('metaAccessToken').value = localStorage.getItem('meta_access_token') || '';
    document.getElementById('metaPhoneNumberId').value = localStorage.getItem('meta_phone_number_id') || '';
    document.getElementById('metaTemplateName').value = localStorage.getItem('meta_template_name') || '';
    document.getElementById('metaLanguageCode').value = localStorage.getItem('meta_language_code') || 'en_US';
  }

  // Initialize Speech Recognition
  initSpeechRecognition();

  // Set theme toggle icon correctly before createIcons
  const toggleIcon = document.getElementById('theme-toggle-icon');
  if (toggleIcon) {
    if (document.body.classList.contains('light-theme')) {
      toggleIcon.setAttribute('data-lucide', 'moon');
      toggleIcon.style.color = 'var(--accent-blue)';
    } else {
      toggleIcon.setAttribute('data-lucide', 'sun');
      toggleIcon.style.color = 'var(--accent-purple)';
    }
  }

  // Auth gate session check
  const params = new URLSearchParams(window.location.search);
  const resetToken = params.get('reset_token');
  const resetEmail = params.get('email');
  
  if (resetToken && resetEmail) {
    document.getElementById('appContainer').style.display = 'none';
    document.getElementById('loginPageOverlay').style.display = 'none';
    document.getElementById('forgotPasswordResetOverlay').style.display = 'flex';
    document.getElementById('resetEmailLabel').innerText = `Resetting password for ${resetEmail}`;
    window.resettingEmail = resetEmail;
  } else {
    const isLoggedIn = localStorage.getItem('crm_logged_in') === 'true';
    const savedUser = localStorage.getItem('crm_current_user');
    
    if (isLoggedIn && savedUser) {
      currentUser = JSON.parse(savedUser);
      if (!localStorage.getItem('crm_actual_user')) {
        localStorage.setItem('crm_actual_user', savedUser);
      }
      
      // Force password reset if flagged
      if (currentUser.passwordChanged === false) {
        document.getElementById('appContainer').style.display = 'none';
        document.getElementById('loginPageOverlay').style.display = 'flex'; // Render background login first
        document.getElementById('passwordResetOverlay').style.display = 'flex';
      } else {
        document.getElementById('loginPageOverlay').style.display = 'none';
        document.getElementById('appContainer').style.display = 'flex';
        initializeApplication();
      }
    } else {
      document.getElementById('appContainer').style.display = 'none';
      document.getElementById('loginPageOverlay').style.display = 'flex';
    }
  }

  // Ensure Lucide icons are rendered for login page overlay elements initially
  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
  }

  // Dynamic login background parallax shifting on mouse move
  const orbsWrapper = document.getElementById('loginOrbsWrapper');
  if (orbsWrapper) {
    document.addEventListener('mousemove', (e) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 50; // -25px to 25px
      const y = (e.clientY / window.innerHeight - 0.5) * 50; // -25px to 25px
      orbsWrapper.style.transform = `translate(${x}px, ${y}px)`;
    });
  }
});

// Initialize core layouts
function initializeApplication() {
  populateAgentDropdowns();
  renderTeamMembers();
  renderSalesLeaderboard();
  applyUserRoleUIVisibility();
  populateFoundByFilter();
  renderDashboard();
  
  // Restore saved active tab on page reload
  const savedTab = localStorage.getItem('crm_active_tab');
  if (savedTab && savedTab !== 'dashboard') {
    switchTab(savedTab);
  } else {
    switchTab('dashboard');
  }

  setupLeadsScrollListener();
  applyFilters();
  checkFollowUpReminders(true);
  
  // Asynchronously synchronize remote database pipeline
  initRemoteDatabase();

  // Set current user switcher dropdown value is now dynamically handled inside applyUserRoleUIVisibility()

  // Update company branding header name
  updateCompanyBrandingHeader();

  // Update sidebar profile card details
  updateUserProfileDisplay();

  // Load dashboard collapse setting
  const dashboardCollapsed = localStorage.getItem('dashboard_collapsed') === 'true';
  applyDashboardCollapseState(dashboardCollapsed);

  lucide.createIcons();

  // Trigger tour if onboarding is incomplete
  const tourFinished = localStorage.getItem('crm_onboarding_completed') === 'true';
  if (!tourFinished) {
    startOnboardingTour();
  }
}

// Helper to get human-friendly display role mapping
function getUserDisplayRole(user) {
  if (!user) return 'Agent';
  if (user.role === 'Super Admin') return 'Super Admin';
  // Check if they are the actual company CEO
  if (user.ceoEmail && user.email && user.email.toLowerCase() === user.ceoEmail.toLowerCase()) {
    return 'CEO';
  }
  return user.role || 'Agent';
}

// Update sidebar profile card and greeting title details
function updateUserProfileDisplay() {
  if (currentUser) {
    const userEmailEl = document.getElementById('userProfileEmail');
    const userRoleEl = document.getElementById('userProfileRole');
    const userInitialEl = document.getElementById('userProfileInitial');
    const greetingEl = document.getElementById('greeting-title');
    
    const displayRole = getUserDisplayRole(currentUser);
    
    if (userEmailEl) userEmailEl.innerText = currentUser.email || '';
    if (userRoleEl) userRoleEl.innerText = displayRole;
    if (userInitialEl && currentUser.email) {
      userInitialEl.innerText = currentUser.email.charAt(0).toUpperCase();
    }
    if (greetingEl) {
      const nameOrEmail = currentUser.name || currentUser.email || 'Agent';
      const cleaned = cleanName(nameOrEmail);
      if (cleaned.toLowerCase().includes('ceo') || cleaned.toLowerCase().includes('super admin') || cleaned.toLowerCase().includes(displayRole.toLowerCase())) {
        greetingEl.innerText = `Welcome back, ${cleaned}`;
      } else {
        greetingEl.innerText = `Welcome back, ${cleaned} (${displayRole})`;
      }
    }
  }
}

// Local Caching helpers (fallback and offline caching)
function saveLeadsToStorage() {
  localStorage.setItem('leads_data', JSON.stringify(leads));
}

function saveAgentsToStorage() {
  localStorage.setItem('crm_agents', JSON.stringify(agents));
}

function saveCompaniesToStorage() {
  localStorage.setItem('crm_companies', JSON.stringify(companies));
}

function saveDeleteRequestsToStorage() {
  localStorage.setItem('crm_delete_requests', JSON.stringify(deleteRequests));
}

// ----------------------------------------------------
// TAB NAVIGATION LOGIC
// ----------------------------------------------------
let cachedViews = {};

function showComponentLoader(container, titleText = "NeoGenCode CRM | Syncing Data...") {
  if (!container) return;
  container.innerHTML = `
    <div class="neogencode-loader-container">
      <div style="position: relative; width: 64px; height: 64px; margin-bottom: 1.25rem;">
        <div style="position: absolute; inset: -8px; border-radius: 50%; border: 3px solid transparent; border-top-color: var(--accent-blue); border-right-color: var(--accent-purple); animation: spinLoaderRing 1.2s linear infinite;"></div>
        <div style="width: 64px; height: 64px; border-radius: 16px; background: linear-gradient(135deg, var(--accent-blue) 0%, var(--accent-purple) 100%); display: flex; align-items: center; justify-content: center; color: #FFF; font-weight: 800; font-size: 1.5rem; box-shadow: var(--shadow-glow);">
          N
        </div>
      </div>
      <h4 style="font-family: 'Outfit', sans-serif; font-size: 1.1rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.35rem;">NeoGenCode CRM</h4>
      <p style="font-size: 0.82rem; color: var(--text-secondary); margin-bottom: 1rem;">${titleText}</p>
      <div style="width: 140px; height: 4px; background: var(--border-color); border-radius: 2px; overflow: hidden;">
        <div style="width: 60%; height: 100%; background: linear-gradient(90deg, var(--accent-blue), var(--accent-purple)); border-radius: 2px; animation: loaderBarAnim 1.5s ease-in-out infinite;"></div>
      </div>
    </div>
  `;
}

function calculateAtsScore(job, candidate) {
  if (!candidate) return 50;

  // If job is not passed directly, try finding the job by candidate.jobId
  if (!job || (!job.title && !job.requirements && !job.description)) {
    if (candidate.jobId) {
      job = recruitmentJobs.find(j => String(j.id) === String(candidate.jobId));
    }
  }
  if (!job || (!job.title && !job.requirements && !job.description)) {
    if (recruitmentJobs.length > 0) job = recruitmentJobs[0];
  }

  if (!job || (!job.title && !job.requirements && !job.description)) {
    return 60;
  }

  const stopWords = new Set([
    "the", "and", "for", "with", "this", "that", "job", "role", "year", "years", "experience",
    "team", "work", "looking", "candidate", "must", "have", "ability", "strong", "knowledge",
    "working", "skills", "required", "preferred", "good", "great", "excellent", "position",
    "to", "of", "in", "a", "an", "is", "or", "on", "as", "be", "at", "by", "are", "from",
    "with", "will", "your", "our", "all", "any", "about", "developer", "engineer"
  ]);

  const jobText = (
    (job.title || '') + " " + 
    (job.department || '') + " " + 
    (job.requirements || '') + " " + 
    (job.description || '') + " " +
    (job.skills || '')
  ).toLowerCase();

  let candText = (
    (candidate.name || '') + " " + 
    (candidate.title || '') + " " + 
    (candidate.notes || '') + " " + 
    (candidate.cover_note || '') + " " +
    (candidate.skills || '') + " " +
    (candidate.experience || '')
  ).toLowerCase();

  if (candidate.details) {
    try {
      const parsed = typeof candidate.details === 'string' ? JSON.parse(candidate.details) : candidate.details;
      if (parsed.skills) candText += " " + String(parsed.skills).toLowerCase();
      if (parsed.experience) candText += " " + String(parsed.experience).toLowerCase();
      if (parsed.summary) candText += " " + String(parsed.summary).toLowerCase();
      if (parsed.resume_text) candText += " " + String(parsed.resume_text).toLowerCase();
    } catch(e) {}
  }

  const getKeywords = (txt) => {
    return Array.from(new Set(
      txt.replace(/[^a-z0-9+#\.\s]/g, ' ')
         .split(/\s+/)
         .filter(w => w.length >= 2 && !stopWords.has(w))
    ));
  };
  
  const jobKeywords = getKeywords(jobText);
  const candKeywords = new Set(getKeywords(candText));

  if (jobKeywords.length === 0) return 60;

  let matches = 0;
  jobKeywords.forEach(kw => {
    if (candKeywords.has(kw)) {
      matches += 1;
    } else {
      for (const cKw of candKeywords) {
        if (cKw.includes(kw) || kw.includes(cKw)) {
          matches += 0.6;
          break;
        }
      }
    }
  });

  const rawMatchPct = (matches / jobKeywords.length) * 100;
  const finalScore = Math.round(Math.min(96, Math.max(25, rawMatchPct * 1.3)));
  return finalScore;
}

async function switchTab(tabName) {
  activeTab = tabName;
  localStorage.setItem('crm_active_tab', tabName);
  
  if (typeof stopSignalsScraping === 'function') {
    stopSignalsScraping(true);
  }
  
  // Close mobile sidebar on tab switch
  if (window.innerWidth <= 868) {
    const sidebar = document.querySelector('.sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (sidebar) sidebar.classList.remove('sidebar-open');
    if (backdrop) backdrop.classList.remove('active');
  }
  
  // Update active navigation item in sidebar
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });
  
  const activeNavItem = document.getElementById(`nav-${tabName}`);
  if (activeNavItem) activeNavItem.classList.add('active');

  // Adjust display headers or titles depending on the view
  const titleEl = document.getElementById('directory-title');
  const metricsSection = document.getElementById('metricsSection');
  const directoryContainer = document.getElementById('directoryViewContainer');
  const outreachContainer = document.getElementById('outreachViewContainer');
  const pipelineContainer = document.getElementById('pipelineViewContainer');
  const teamContainer = document.getElementById('teamViewContainer');
  const saasContainer = document.getElementById('saasViewContainer');
  const billingContainer = document.getElementById('billingViewContainer');
  const referralsContainer = document.getElementById('referralsViewContainer');
  const recruitmentContainer = document.getElementById('recruitmentViewContainer');
  const myClientsContainer = document.getElementById('myClientsViewContainer');
  const signalsContainer = document.getElementById('signalsViewContainer');
  const interviewsContainer = document.getElementById('interviewsViewContainer');
  const talentDbContainer = document.getElementById('talentDbViewContainer');
  const tutorialsContainer = document.getElementById('tutorialsViewContainer');
  const loanCalculatorContainer = document.getElementById('loanCalculatorViewContainer');
  const loanPayoutsContainer = document.getElementById('loanPayoutsViewContainer');
  const cibilCheckContainer = document.getElementById('cibilCheckViewContainer');
  
  // Hide all initially
  if (metricsSection) metricsSection.style.display = 'none';
  if (directoryContainer) directoryContainer.style.display = 'none';
  if (outreachContainer) outreachContainer.style.display = 'none';
  if (pipelineContainer) pipelineContainer.style.display = 'none';
  if (teamContainer) teamContainer.style.display = 'none';
  if (saasContainer) saasContainer.style.display = 'none';
  if (billingContainer) billingContainer.style.display = 'none';
  if (referralsContainer) referralsContainer.style.display = 'none';
  if (recruitmentContainer) recruitmentContainer.style.display = 'none';
  if (myClientsContainer) myClientsContainer.style.display = 'none';
  if (signalsContainer) signalsContainer.style.display = 'none';
  if (interviewsContainer) interviewsContainer.style.display = 'none';
  if (talentDbContainer) talentDbContainer.style.display = 'none';
  if (tutorialsContainer) tutorialsContainer.style.display = 'none';
  if (loanCalculatorContainer) loanCalculatorContainer.style.display = 'none';
  if (loanPayoutsContainer) loanPayoutsContainer.style.display = 'none';
  if (cibilCheckContainer) cibilCheckContainer.style.display = 'none';
  
  if (tabName === 'outreach') {
    if (outreachContainer) outreachContainer.style.display = 'block';
    renderOutreachQueue();
  } else if (tabName === 'pipeline') {
    if (pipelineContainer) pipelineContainer.style.display = 'block';
    renderKanbanBoard();
  } else if (tabName === 'team') {
    if (teamContainer) teamContainer.style.display = 'block';
    renderTeamMembers();
  } else if (tabName === 'recruitment') {
    if (recruitmentContainer) recruitmentContainer.style.display = 'block';
    if (typeof renderRecruitmentJobs === 'function') renderRecruitmentJobs();
    fetchAndRenderRecruitment();
  } else if (tabName === 'saas') {
    if (saasContainer) saasContainer.style.display = 'block';
    renderSaasTenants();
  } else if (tabName === 'billing') {
    if (billingContainer) billingContainer.style.display = 'block';
    fetchAndRenderInvoices();
  } else if (tabName === 'referrals') {
    if (referralsContainer) referralsContainer.style.display = 'block';
    renderReferralView();
  } else if (tabName === 'my-clients') {
    if (myClientsContainer) myClientsContainer.style.display = 'block';
    if (typeof renderClientsKanban === 'function') renderClientsKanban();
    ensureRecruitmentDataLoaded();
  } else if (tabName === 'signals') {
    if (signalsContainer) signalsContainer.style.display = 'block';
    if (typeof renderHiringTodos === 'function') renderHiringTodos();
    ensureRecruitmentDataLoaded();
  } else if (tabName === 'interviews') {
    if (interviewsContainer) interviewsContainer.style.display = 'block';
    if (typeof renderUpcomingInterviews === 'function') renderUpcomingInterviews();
    ensureRecruitmentDataLoaded();
  } else if (tabName === 'talent-db') {
    if (talentDbContainer) talentDbContainer.style.display = 'block';
    if (typeof initTalentDbView === 'function') initTalentDbView();
    ensureRecruitmentDataLoaded();
  } else if (tabName === 'tutorials') {
    if (tutorialsContainer) tutorialsContainer.style.display = 'block';
    renderTutorials();
  } else if (tabName === 'loan-calculator') {
    if (loanCalculatorContainer) loanCalculatorContainer.style.display = 'block';
    updateLoanCalc();
  } else if (tabName === 'loan-payouts') {
    if (loanPayoutsContainer) loanPayoutsContainer.style.display = 'block';
    renderLoanPayouts();
  } else if (tabName === 'cibil-check') {
    if (cibilCheckContainer) cibilCheckContainer.style.display = 'block';
    calculateCibilHealth();
  } else {
    if (directoryContainer) directoryContainer.style.display = 'block';
    
    // Clear search and other filters on tab switch
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    const filterFoundBy = document.getElementById('filterFoundBy');
    if (filterFoundBy) filterFoundBy.value = 'all';
    const filterDateRange = document.getElementById('filterDateRange');
    if (filterDateRange) filterDateRange.value = 'all';
    const filterSource = document.getElementById('filterSource');
    if (filterSource) filterSource.value = 'all';
    const sortField = document.getElementById('sortField');
    if (sortField) sortField.value = 'createdDateDesc';

    if (tabName === 'dashboard') {
      if (metricsSection) metricsSection.style.display = 'grid';
      if (titleEl) titleEl.innerText = 'Leads Directory';
      document.getElementById('filterStatus').value = 'all';
    } else if (tabName === 'leads') {
      if (titleEl) titleEl.innerText = 'All Leads Directory';
      document.getElementById('filterStatus').value = 'all';
    } else if (tabName === 'reminders') {
      if (titleEl) titleEl.innerText = 'Due Follow-ups Today';
      document.getElementById('filterStatus').value = 'all';
    }
    applyFilters();
  }
}

// ----------------------------------------------------
// METRICS & DASHBOARD
// ----------------------------------------------------
function renderDashboard() {
  const scopedLeads = getScopedLeads();
  const totalLeads = scopedLeads.length;
  
  // Calculate follow-ups due today
  const todayStr = new Date().toISOString().split('T')[0];
  const followUpsToday = scopedLeads.filter(l => l.nextFollowUp === todayStr && l.status !== 'won' && l.status !== 'lost').length;

  // Calculate day-range counts
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const getLeadsAddedInDays = (daysLimit) => {
    return scopedLeads.filter(l => {
      if (!l.createdDate) return false;
      const created = new Date(l.createdDate);
      created.setHours(0, 0, 0, 0);
      const diffMs = today.getTime() - created.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= daysLimit;
    }).length;
  };

  const addedToday = getLeadsAddedInDays(0);
  const added3Days = getLeadsAddedInDays(3);
  const added7Days = getLeadsAddedInDays(7);
  const added30Days = getLeadsAddedInDays(30);

  document.getElementById('metric-total').innerText = totalLeads;
  document.getElementById('metric-reminders').innerText = followUpsToday;
  document.getElementById('metric-added-today').innerText = addedToday;
  document.getElementById('metric-added-3days').innerText = added3Days;
  document.getElementById('metric-added-7days').innerText = added7Days;
  document.getElementById('metric-added-30days').innerText = added30Days;

  // Update notification count badge
  const alertBadge = document.getElementById('alert-badge-count');
  if (followUpsToday > 0) {
    alertBadge.innerText = followUpsToday;
    alertBadge.style.display = 'flex';
  } else {
    alertBadge.style.display = 'none';
  }

  // Draw Dashboard Progress Bar Charts
  const createProgressBarHtml = (label, count, total, colorVal) => {
    const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
    return `
      <div class="progress-bar-wrapper" style="width: 100%;">
        <div style="display: flex; justify-content: space-between; font-size: 0.78rem; margin-bottom: 0.25rem;">
          <span style="font-weight: 500; color: var(--text-secondary);">${label}</span>
          <span style="font-weight: 600; color: var(--text-primary);">${count} <span style="color: var(--text-muted); font-weight: 400; font-size: 0.72rem;">(${percentage}%)</span></span>
        </div>
        <div style="background: var(--progress-track-bg, rgba(255,255,255,0.06)); border: 1px solid var(--border-color); height: 8px; border-radius: 4px; overflow: hidden; width: 100%; box-sizing: border-box;">
          <div style="background: ${colorVal}; width: ${percentage}%; height: 100%; border-radius: 3px; transition: width 0.8s ease;"></div>
        </div>
      </div>
    `;
  };

  const statusContainer = document.getElementById('analyticsStatusBars');
  if (statusContainer) {
    const activeIndustry = (companyInfo && companyInfo.industry) || (currentUser && currentUser.industry) || "Real Estate CRM Software";
    const profile = INDUSTRY_PROFILES[activeIndustry];
    const stages = (profile && profile.stages) ? profile.stages : ['new', 'contacted', 'inprogress', 'won', 'lost'];
    const standardColors = ['#38BDF8', '#C084FC', '#FBBF24', '#34D399', '#F87171'];
    
    let html = '';
    stages.forEach((stage, idx) => {
      const count = scopedLeads.filter(l => {
        const mapped = mapStatusToIndustryStage(l.status, stages);
        return mapped === stage;
      }).length;
      const colorVal = standardColors[idx] || '#A855F7';
      html += createProgressBarHtml(stage, count, totalLeads, colorVal);
    });
    statusContainer.innerHTML = html;
  }

  const sourceContainer = document.getElementById('analyticsSourceBars');
  if (sourceContainer) {
    const sources = ['linkedin', 'website', 'referral', 'email', 'cold call', 'other'];
    const colors = {
      'linkedin': '#0EA5E9',
      'website': '#38BDF8',
      'referral': '#A855F7',
      'email': '#C084FC',
      'cold call': '#FBBF24',
      'other': '#64748B'
    };
    const labels = {
      'linkedin': 'LinkedIn Outreach',
      'website': 'Company Website',
      'referral': 'Referrals / Word of Mouth',
      'email': 'Email Campaigns',
      'cold call': 'Cold Dialing',
      'other': 'Other Sources'
    };
    
    let html = '';
    sources.forEach(source => {
      const count = scopedLeads.filter(l => (l.source || '').toLowerCase() === source).length;
      html += createProgressBarHtml(labels[source], count, totalLeads, colors[source]);
    });
    sourceContainer.innerHTML = html;
  }
  
  // Re-tally and draw sales leaderboard stats
  renderSalesLeaderboard();
}

// ----------------------------------------------------
// LEADS RENDERING & LIST
// ----------------------------------------------------
function renderLeadsList(filteredLeads = leadsDirectoryList) {
  const tbody = document.getElementById('leadsTableBody');
  const emptyState = document.getElementById('emptyState');
  const table = document.getElementById('leadsTable');
  
  tbody.innerHTML = '';
  
  // Reset bulk actions select all checkbox and toolbar state
  const selectAllCb = document.getElementById('selectAllDirectory');
  if (selectAllCb) selectAllCb.checked = false;
  const toolbar = document.getElementById('directoryBulkActionBar');
  if (toolbar) toolbar.classList.add('hidden');

  if (filteredLeads.length === 0) {
    table.style.display = 'none';
    emptyState.style.display = 'flex';
    return;
  }
  
  table.style.display = 'table';
  emptyState.style.display = 'none';
  
  const todayStr = new Date().toISOString().split('T')[0];

  filteredLeads.forEach((lead, index) => {
    const row = document.createElement('tr');
    
    // Status Badge classes
    const statusClass = `status-badge ${lead.status}`;
    
    // Check next follow up date conditions
    let followUpClass = 'date-highlight';
    let followUpIcon = 'calendar';
    
    if (lead.status !== 'won' && lead.status !== 'lost') {
      if (lead.nextFollowUp === todayStr) {
        followUpClass += ' due-today';
        followUpIcon = 'clock';
      } else if (lead.nextFollowUp < todayStr) {
        followUpClass += ' overdue';
        followUpIcon = 'alert-triangle';
      }
    }

    row.innerHTML = `
      <td style="text-align: center;">
        <input type="checkbox" class="directory-row-select" data-id="${lead.id}" onchange="updateDirectoryBulkToolbar()" style="width: 16px; height: 16px; accent-color: var(--accent-purple); cursor: pointer;">
      </td>
      <td style="text-align: center; font-weight: 600; color: var(--text-secondary);" data-col="sno">${index + 1}</td>
      <td data-col="info">
        <div class="lead-info-cell">
          <div style="display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap;">
            <span class="lead-name">${escapeHTML(lead.name)}</span>
            ${(lead.company || lead.organization) ? `<span style="font-size: 0.7rem; font-weight: 600; color: var(--accent-purple); background: rgba(168, 85, 247, 0.08); border: 1px solid rgba(168, 85, 247, 0.2); padding: 1px 6px; border-radius: 4px; display: inline-flex; align-items: center; gap: 3px;"><i data-lucide="building-2" style="width: 11px; height: 11px;"></i> ${escapeHTML(lead.company || lead.organization)}</span>` : ''}
          </div>
          <span class="lead-designation">${escapeHTML(lead.designation || 'No Designation')}</span>
          <div class="lead-meta-row">
            ${lead.foundBy ? `<span class="lead-finder-label">Finder: ${escapeHTML(lead.foundBy)}</span>` : ''}
            ${lead.summary ? `<span class="lead-summary-badge"><i data-lucide="notebook-tabs"></i> Notes<span class="lead-tooltip-content">${escapeHTML(parseLeadSummary(lead.summary).notes || 'No notes added.')}</span></span>` : ''}
            ${lead.assignedAgent ? `<span class="lead-finder-label" style="background-color: rgba(168, 85, 247, 0.08); border-color: rgba(168, 85, 247, 0.2); color: var(--accent-purple);"><i data-lucide="user" style="width: 10px; height: 10px; margin-right: 2px;"></i> ${escapeHTML(lead.assignedAgent)}</span>` : '<span class="lead-finder-label" style="background-color: rgba(239, 68, 68, 0.04); border-color: rgba(239, 68, 68, 0.15); color: #EF4444;"><i data-lucide="user-x" style="width: 10px; height: 10px; margin-right: 2px;"></i> Unassigned</span>'}
            ${lead.createdDate ? `<span class="lead-finder-label" style="background-color: rgba(59, 130, 246, 0.08); border-color: rgba(59, 130, 246, 0.2); color: var(--accent-blue);"><i data-lucide="calendar" style="width: 10px; height: 10px; margin-right: 2.5px;"></i> ${formatLeadTimestamp(lead.createdDate)}</span>` : ''}
          </div>
        </div>
      </td>
      <td data-col="contact">
        <div class="lead-contact-info">
          ${lead.email ? `
            <div class="lead-contact-item">
              <span title="${escapeHTML(lead.email)}">${escapeHTML(lead.email)}</span>
              <a href="mailto:${encodeURIComponent(lead.email)}" class="outreach-action-btn" title="Email ${escapeHTML(lead.name)}">
                <i data-lucide="mail"></i>
              </a>
            </div>` : ''}
          ${lead.phone ? `
            <div class="lead-contact-item">
              <span>${escapeHTML(lead.phone)}</span>
              <a href="#" onclick="initiateMobileCall('${lead.id}'); return false;" class="outreach-action-btn" title="Call ${escapeHTML(lead.name)} (Syncs to Mobile)">
                <i data-lucide="phone"></i>
              </a>
              <a href="#" onclick="sendQuickWhatsApp('${lead.id}'); return false;" class="outreach-action-btn" title="1-Click WhatsApp to ${escapeHTML(lead.name)}" style="color: #25D366; border-color: rgba(37, 211, 102, 0.2); background: rgba(37, 211, 102, 0.04); margin-left: 0.25rem; display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0;">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style="display: block;"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.513 2.262 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.625 1.451 5.403.002 9.803-4.394 9.806-9.794.002-2.615-1.017-5.074-2.871-6.931C16.356 2.024 13.9 1.003 11.285 1.003c-5.412 0-9.818 4.402-9.822 9.802-.002 1.702.437 3.364 1.272 4.8l-.997 3.637 3.73-.978zm11.567-5.282c-.313-.156-1.854-.915-2.131-1.015-.277-.1-.478-.15-.678.15-.2.3-.777.98-.952 1.18-.176.2-.351.224-.664.068-1.127-.565-1.957-.962-2.736-2.298-.2-.35-.2-.575.05-.724.113-.062.313-.362.438-.5.125-.138.2-.238.313-.45.112-.213.056-.4-.028-.563-.084-.162-.678-1.638-.93-2.238-.243-.587-.492-.513-.678-.522-.175-.008-.375-.01-.575-.01-.2 0-.525.075-.8.375-.276.3-1.05 1.026-1.05 2.5 0 1.475 1.075 2.9 1.225 3.1.15.2 2.11 3.22 5.11 4.52 1.637.7 2.68.837 3.61.7.94-.14 1.854-.76 2.115-1.46.262-.7.262-1.3.184-1.426-.079-.12-.284-.19-.597-.346z"/></svg>
              </a>
            </div>` : ''}
          ${!lead.email && !lead.phone ? '<span class="lead-contact-item text-muted">No Contact info</span>' : ''}
        </div>
      </td>
      <td data-col="source">
        <span class="lead-contact-item">
          <i data-lucide="globe" style="width:13px; height:13px; color:var(--text-muted); margin-right:4px;"></i>
          ${escapeHTML(lead.source || 'Other')}
          ${lead.postUrl ? `<a href="${escapeHTML(lead.postUrl)}" target="_blank" class="outreach-action-btn" title="View Source Post / Profile" style="margin-left: 6px; padding: 2px 4px; display: inline-flex;"><i data-lucide="external-link" style="width:12px; height:12px;"></i></a>` : ''}
        </span>
      </td>
      <td data-col="status">
        <span class="${statusClass}">${lead.status === 'inprogress' ? 'In Progress' : (lead.status === 'new' ? 'New Lead' : (lead.status === 'contacted' ? 'Contacted' : (lead.status === 'won' ? 'Working with them (won)' : (lead.status === 'lost' ? 'Rejected (lost)' : lead.status))))}</span>
      </td>
      <td data-col="last_manual">
        <span class="lead-contact-item">
          <i data-lucide="calendar-check" style="width:13px; height:13px; color:var(--text-muted); margin-right:4px;"></i>
          ${formatDateNice(lead.lastFollowUp)}
        </span>
      </td>
      <td data-col="next_manual">
        <span class="${followUpClass}">
          <i data-lucide="${followUpIcon}" style="width:14px; height:14px;"></i>
          ${formatDateNice(lead.nextFollowUp)}
        </span>
      </td>
      <td data-col="last_auto">
        <span class="lead-contact-item">
          <i data-lucide="radio" style="width:13px; height:13px; color:var(--text-muted); margin-right:4px;"></i>
          ${lead.lastOutreachTimestamp ? escapeHTML(lead.lastOutreachTimestamp) : 'Never'}
        </span>
      </td>
      <td data-col="next_auto">
        <span class="lead-contact-item">
          <i data-lucide="calendar" style="width:13px; height:13px; color:var(--text-muted); margin-right:4px;"></i>
          ${lead.nextAutoFollowUp ? formatDateNice(lead.nextAutoFollowUp) : 'None'}
        </span>
      </td>
      <td data-col="actions">
        <div class="actions-cell-wrapper">
          <button class="btn-icon edit" onclick="editLead('${lead.id}')" title="Edit Lead">
            <i data-lucide="edit-3"></i>
          </button>
          <button class="btn-icon delete" onclick="deleteLead('${lead.id}')" title="${currentUser.role === 'Sales Agent' ? 'Request Lead Deletion' : 'Delete Lead'}">
            <i data-lucide="${currentUser.role === 'Sales Agent' ? 'shield-alert' : 'trash-2'}" style="${currentUser.role === 'Sales Agent' ? 'color: #F59E0B;' : ''}"></i>
          </button>
        </div>
      </td>
    `;
    
    tbody.appendChild(row);
  });
  
  // Apply hidden columns
  applyColumnVisibility();

  // Re-instantiate icons
  lucide.createIcons();
}

function toggleColumnSelectorDropdown() {
  const dropdown = document.getElementById('columnSelectorDropdown');
  if (dropdown) dropdown.classList.toggle('hidden');
}

function toggleColumnVisibility(colName, isVisible) {
  let settings = {};
  try {
    settings = JSON.parse(localStorage.getItem('crm_col_visibility') || '{}');
  } catch (e) {}
  
  settings[colName] = isVisible;
  localStorage.setItem('crm_col_visibility', JSON.stringify(settings));
  applyColumnVisibility();
}

function applyColumnVisibility() {
  let settings = {};
  try {
    settings = JSON.parse(localStorage.getItem('crm_col_visibility') || '{}');
  } catch (e) {}

  const checkboxes = document.querySelectorAll('#columnSelectorDropdown input[type="checkbox"]');
  checkboxes.forEach(cb => {
    const colName = cb.getAttribute('data-col');
    if (settings[colName] !== undefined) {
      cb.checked = settings[colName];
    } else {
      cb.checked = true;
    }
  });

  const columns = ['sno', 'info', 'contact', 'source', 'status', 'last_manual', 'next_manual', 'last_auto', 'next_auto', 'actions'];
  columns.forEach(colName => {
    const isVisible = settings[colName] !== false;
    const elements = document.querySelectorAll(`[data-col="${colName}"]`);
    elements.forEach(el => {
      if (isVisible) {
        el.classList.remove('col-hidden');
      } else {
        el.classList.add('col-hidden');
      }
    });
  });
}

// Helper to escape HTML characters
function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// ----------------------------------------------------
// SEARCH, FILTER & SORT ENGINE
// ----------------------------------------------------
function setupLeadsScrollListener() {
  const container = document.querySelector('.leads-table-container');
  if (container) {
    if (container.dataset.listenerBound) return;
    container.dataset.listenerBound = 'true';
    
    container.addEventListener('scroll', () => {
      const isNearBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 50;
      const isNearRight = container.scrollLeft + container.clientWidth >= container.scrollWidth - 50;
      
      const hasVerticalScrollbar = container.scrollHeight > container.clientHeight;
      const triggerLoad = isNearBottom || (!hasVerticalScrollbar && isNearRight);
      
      if (triggerLoad) {
        if (leadsHasMore && !leadsLoading) {
          leadsPage++;
          applyFilters(true);
        }
      }
    });
  }
}

function checkLeadsScrollFill() {
  setTimeout(() => {
    const container = document.querySelector('.leads-table-container');
    if (container && leadsHasMore && !leadsLoading) {
      // Check if container is visible
      if (container.offsetHeight > 0) {
        const hasVerticalScrollbar = container.scrollHeight > container.clientHeight;
        if (!hasVerticalScrollbar) {
          leadsPage++;
          applyFilters(true);
        }
      }
    }
  }, 400);
}

// ----------------------------------------------------
// SEARCH, FILTER & SORT ENGINE
// ----------------------------------------------------
let leadsPage = 1;
const leadsLimit = 10;
let leadsHasMore = true;
let leadsLoading = false;
let leadsDirectoryList = [];
let unfilteredLeadsList = [];
let searchDebounceTimeout = null;

async function applyFilters(loadMore = false) {
  if (leadsLoading) return;
  if (loadMore && !leadsHasMore) return;

  leadsLoading = true;
  
  if (!loadMore) {
    leadsPage = 1;
    leadsHasMore = true;
    leadsDirectoryList = [];
    
    // Show premium loader on initial render
    const tbody = document.getElementById('leadsTableBody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; padding: 2rem; color: var(--text-secondary);"><div style="display:inline-flex; align-items:center; gap:0.5rem; justify-content:center;"><i data-lucide="loader-2" class="animate-spin" style="width: 16px; height: 16px;"></i> Loading leads...</div></td></tr>`;
      lucide.createIcons();
    }
  } else {
    const tbody = document.getElementById('leadsTableBody');
    if (tbody && !document.getElementById('leadsTableLoadMoreSpinner')) {
      const loaderRow = document.createElement('tr');
      loaderRow.id = 'leadsTableLoadMoreSpinner';
      loaderRow.innerHTML = `<td colspan="11" style="text-align: center; padding: 1rem; color: var(--text-secondary); background: rgba(255,255,255,0.01);"><div style="display:inline-flex; align-items:center; gap:0.5rem; justify-content:center;"><i data-lucide="loader-2" class="animate-spin" style="width: 16px; height: 16px;"></i> Loading more leads...</div></td>`;
      tbody.appendChild(loaderRow);
      lucide.createIcons();
    }
  }

  const searchInput = document.getElementById('searchInput');
  const filterStatus = document.getElementById('filterStatus');
  const filterSource = document.getElementById('filterSource');
  const filterFoundBy = document.getElementById('filterFoundBy');
  const filterDateRange = document.getElementById('filterDateRange');
  const sortField = document.getElementById('sortField');

  const searchQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const statusFilter = filterStatus ? filterStatus.value : 'all';
  const sourceFilter = filterSource ? filterSource.value : 'all';
  const foundByFilter = filterFoundBy ? filterFoundBy.value : 'all';
  const dateRangeFilter = filterDateRange ? filterDateRange.value : 'all';
  const sortBy = sortField ? sortField.value : 'createdDateDesc';

  try {
    const offset = (leadsPage - 1) * leadsLimit;
    const params = new URLSearchParams({
      limit: leadsLimit,
      offset: offset,
      search: searchQuery,
      status: statusFilter,
      isFollowupsDue: activeTab === 'reminders' ? 'true' : 'false',
      source: sourceFilter,
      foundBy: foundByFilter,
      dateRange: dateRangeFilter,
      sortBy: sortBy
    });

    if (activeTenantId !== 'all') {
      params.append('tenantId', activeTenantId);
    }

    const res = await fetch(`${API_BASE}/api/leads?${params.toString()}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error("Failed to fetch leads");

    const pageData = await res.json();
    
    if (pageData.length < leadsLimit) {
      leadsHasMore = false;
    }

    if (loadMore) {
      leadsDirectoryList = leadsDirectoryList.concat(pageData);
    } else {
      leadsDirectoryList = pageData;
    }

    if (!searchQuery) {
      unfilteredLeadsList = [...leadsDirectoryList];
    }

    // Attach scroll listener once
    setupLeadsScrollListener();

    renderLeadsList(leadsDirectoryList);
    checkLeadsScrollFill();
  } catch (err) {
    console.error("Filter error:", err);
  } finally {
    leadsLoading = false;
  }
}

function handleSearch() {
  const searchInput = document.getElementById('searchInput');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  
  if (!query) {
    leadsDirectoryList = [...unfilteredLeadsList];
    renderLeadsList(leadsDirectoryList);
    return;
  }
  
  const localMatches = unfilteredLeadsList.filter(l => 
    (l.name && l.name.toLowerCase().includes(query)) ||
    (l.designation && l.designation.toLowerCase().includes(query)) ||
    (l.email && l.email.toLowerCase().includes(query)) ||
    (l.phone && l.phone.toLowerCase().includes(query)) ||
    (l.source && l.source.toLowerCase().includes(query))
  );
  
  if (localMatches.length > 0) {
    renderLeadsList(localMatches);
  } else {
    clearTimeout(searchDebounceTimeout);
    searchDebounceTimeout = setTimeout(() => {
      applyFilters();
    }, 300);
  }
}

// ----------------------------------------------------
// REMINDERS & NOTIFICATION ALERTS
// ----------------------------------------------------
function checkFollowUpReminders(showToasts = false) {
  const todayStr = new Date().toISOString().split('T')[0];
  
  const scopedLeads = getScopedLeads();
  const dueLeads = scopedLeads.filter(lead => 
    lead.nextFollowUp === todayStr && 
    lead.status !== 'won' && 
    lead.status !== 'lost'
  );

  renderDashboard();

  if (dueLeads.length > 0 && showToasts) {
    if (dueLeads.length === 1) {
      showAppNotification(
        'Follow-up Reminder',
        `You have a scheduled outreach due today with ${dueLeads[0].name} (${dueLeads[0].designation || 'Lead'}).`,
        'warning'
      );
    } else {
      showAppNotification(
        'Pending Follow-ups',
        `You have ${dueLeads.length} follow-ups pending today. Please check the follow-up tab.`,
        'warning'
      );
    }

    // Attempt browser notification
    triggerBrowserNotification(dueLeads.length);
    
    // Dispatch WhatsApp follow-up summaries to agent phone
    notifyAgentOnFollowUps();
  }

  if (showToasts) {
    // 1. Scan Candidate Interview Scheduled Dates
    if (typeof recruitmentCandidates !== 'undefined') {
      recruitmentCandidates.forEach(cand => {
        if (cand.details) {
          try {
            const parsed = typeof cand.details === 'string' ? JSON.parse(cand.details) : cand.details;
            if (parsed.interview_date === todayStr) {
              showAppNotification(
                'Interview Scheduled Today',
                `Candidate ${cand.name} is scheduled for an interview today. Inform both candidate and client.`,
                'warning'
              );
            }
          } catch(e) {}
        }
      });
    }

    // 2. Scan Pending Invoices
    const targetTenantId = currentUser ? (currentUser.role === 'Super Admin' ? activeTenantId : currentUser.tenantId) : 'all';
    const activeInvoices = typeof invoices !== 'undefined' ? invoices.filter(inv => inv.status === 'Unpaid' && (targetTenantId === 'all' || inv.tenantId === targetTenantId)) : [];
    if (activeInvoices.length > 0) {
      showAppNotification(
        'Pending Invoices Alert',
        `You have ${activeInvoices.length} unpaid / pending GST invoices requiring client follow-up.`,
        'danger'
      );
    }
  }
}

// App Toast Notifications creator
function showAppNotification(title, msg, type = 'success') {
  const container = document.getElementById('notificationContainer');
  const alertId = `alert-${Date.now()}`;

  let icon = 'info';
  if (type === 'warning') icon = 'clock';
  if (type === 'danger') icon = 'alert-octagon';
  if (type === 'success') icon = 'check-circle';

  const alertCard = document.createElement('div');
  alertCard.className = `app-alert ${type}`;
  alertCard.id = alertId;
  alertCard.innerHTML = `
    <div class="alert-icon">
      <i data-lucide="${icon}"></i>
    </div>
    <div class="alert-content">
      <div class="alert-title">${escapeHTML(title)}</div>
      <div class="alert-msg">${escapeHTML(msg)}</div>
    </div>
    <button class="alert-close" onclick="closeNotification('${alertId}')">
      <i data-lucide="x" style="width:14px; height:14px;"></i>
    </button>
  `;

  container.appendChild(alertCard);
  lucide.createIcons();

  // Auto-dismiss after 6 seconds
  setTimeout(() => {
    closeNotification(alertId);
  }, 6000);
}

function closeNotification(id) {
  const alertCard = document.getElementById(id);
  if (alertCard) {
    alertCard.style.opacity = '0';
    alertCard.style.transform = 'translateX(100%)';
    setTimeout(() => {
      alertCard.remove();
    }, 300);
  }
}

// Browser System Notifications Trigger
function triggerBrowserNotification(count) {
  if (!("Notification" in window)) return;

  if (Notification.permission === "granted") {
    new Notification("Neogencode CRM Reminders", {
      body: `You have ${count} pending follow-up outreach tasks scheduled for today!`,
      icon: "https://unpkg.com/lucide-static/icons/activity.svg"
    });
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then(permission => {
      if (permission === "granted") {
        new Notification("Neogencode CRM Reminders", {
          body: `You have ${count} pending follow-up outreach tasks scheduled for today!`,
          icon: "https://unpkg.com/lucide-static/icons/activity.svg"
        });
      }
    });
  }
}

// ----------------------------------------------------
// FORM ACTIONS (ADD / EDIT)
// ----------------------------------------------------
// ----------------------------------------------------
// FORM ACTIONS (ADD / EDIT)
// ----------------------------------------------------
function openLeadModal(leadIdToEdit = null, startVoiceImmediately = false) {
  const modal = document.getElementById('leadModalOverlay');
  const form = document.getElementById('leadForm');
  const title = document.getElementById('modalTitle');
  
  form.reset();
  
  // Reset Voice Panel UI
  const box = document.getElementById('voiceTranscriptBox');
  if (box) {
    box.value = '';
    box.classList.add('transcript-placeholder');
  }
  
  abortSpeechRecognition();
  
  // Set defaults for new leads
  document.getElementById('leadLastFollowUp').value = getRelativeDateString(0); // Default to today's date
  document.getElementById('leadNextFollowUp').value = getRelativeDateString(1); // Default to tomorrow
  document.getElementById('leadStatus').value = 'new';
  document.getElementById('leadSource').value = 'Website';
  document.getElementById('leadSourceCustom').value = '';
  document.getElementById('leadSourceCustomContainer').classList.add('hidden');
  if (document.getElementById('leadPostUrl')) {
    document.getElementById('leadPostUrl').value = '';
  }
  if (document.getElementById('leadFoundBy')) {
    document.getElementById('leadFoundBy').value = '';
  }
  document.getElementById('leadSummary').value = '';
  document.getElementById('leadId').value = '';
  if (document.getElementById('leadIsPermanent')) {
    document.getElementById('leadIsPermanent').checked = false;
  }
  document.getElementById('leadAutoWhatsApp').checked = true;
  document.getElementById('leadAutoEmail').checked = true;
  document.getElementById('leadAutoAiCall').checked = false;
  document.getElementById('leadAutoOutreachEnabled').checked = false;
  document.getElementById('leadReminderText').value = '';
  const isSuperAdmin = currentUser ? currentUser.role === 'Super Admin' : false;
  const isCEO = currentUser ? (currentUser.ceoEmail && currentUser.email.toLowerCase() === currentUser.ceoEmail.toLowerCase()) : false;
  const hasReassignLeadPermission = currentUser ? (currentUser.permissions && currentUser.permissions.reassignLead === true) : false;

  const assignedSelect = document.getElementById('leadAssignedAgent');
  if (assignedSelect) {
    assignedSelect.value = (!leadIdToEdit && currentUser && currentUser.role !== 'Super Admin') ? currentUser.name : '';
    if (isSuperAdmin || isCEO || hasReassignLeadPermission) {
      assignedSelect.disabled = false;
    } else {
      assignedSelect.disabled = true;
    }
  }
  toggleAutoOutreachDetails();

  if (leadIdToEdit) {
    const lead = leads.find(l => l.id === leadIdToEdit);
    if (lead) {
      const isCEO = currentUser.role === 'Super Admin' || currentUser.role === 'Manager' || currentUser.role === 'Admin' || (currentUser.ceoEmail && currentUser.email && currentUser.email.toLowerCase() === currentUser.ceoEmail.toLowerCase());
      const userPerms = (currentUser && currentUser.permissions) ? (typeof currentUser.permissions === 'string' ? JSON.parse(currentUser.permissions) : currentUser.permissions) : {};

      // Check editOtherLeads permission
      const isOtherLead = lead.assignedAgent && currentUser.name && lead.assignedAgent.toLowerCase().trim() !== currentUser.name.toLowerCase().trim();
      if (isOtherLead && !isCEO && !userPerms.editOtherLeads) {
        showAppNotification('Access Denied', 'You do not have permission to edit leads assigned to other team members.', 'danger');
        return;
      }

      // Check editWon permission
      const isWon = lead.status === 'won' || lead.status === 'Working with them (won)';
      if (isWon && !isCEO && !userPerms.editWon && !userPerms.editWonClients) {
        showAppNotification('Access Denied', 'You do not have permission to edit won clients.', 'danger');
        return;
      }

      title.innerText = 'Edit Lead Details';
      document.getElementById('leadId').value = lead.id;
      document.getElementById('leadName').value = lead.name;
      if (document.getElementById('leadCompany')) {
        document.getElementById('leadCompany').value = lead.company || lead.organization || '';
      }
      document.getElementById('leadDesignation').value = lead.designation || '';
      document.getElementById('leadPhone').value = lead.phone || '';
      document.getElementById('leadEmail').value = lead.email || '';

      const btnHistory = document.getElementById('btnLeadHistory');
      if (btnHistory) {
        btnHistory.style.display = 'inline-flex';
      }
      document.getElementById('leadStatus').value = lead.status;
      document.getElementById('leadLastFollowUp').value = lead.lastFollowUp || '';
      document.getElementById('leadNextFollowUp').value = lead.nextFollowUp || '';
      if (document.getElementById('leadFoundBy')) {
        document.getElementById('leadFoundBy').value = lead.foundBy || '';
      }
      const { notes } = parseLeadSummary(lead.summary);
      document.getElementById('leadSummary').value = notes;
      if (document.getElementById('leadPostUrl')) {
        document.getElementById('leadPostUrl').value = lead.postUrl || '';
      }
      if (document.getElementById('leadIsPermanent')) {
        document.getElementById('leadIsPermanent').checked = lead.isPermanent === 1;
      }
      document.getElementById('leadAutoWhatsApp').checked = lead.autoWhatsApp !== false;
      document.getElementById('leadAutoEmail').checked = lead.autoEmail !== false;
      document.getElementById('leadAutoAiCall').checked = lead.autoAiCall === true;
      document.getElementById('leadAutoOutreachEnabled').checked = lead.autoOutreachEnabled === true;
      document.getElementById('leadReminderText').value = lead.reminderText || '';
      if (document.getElementById('leadAssignedAgent')) {
        document.getElementById('leadAssignedAgent').value = lead.assignedAgent || '';
      }
      toggleAutoOutreachDetails();

      // Check if source is one of the dropdown options
      const sourceSelect = document.getElementById('leadSource');
      const isCustomSource = !Array.from(sourceSelect.options).some(opt => opt.value.toLowerCase() === (lead.source || '').toLowerCase());
      if (isCustomSource && lead.source) {
        sourceSelect.value = 'Other';
        document.getElementById('leadSourceCustom').value = lead.source;
        document.getElementById('leadSourceCustomContainer').classList.remove('hidden');
      } else {
        sourceSelect.value = lead.source || 'Website';
        document.getElementById('leadSourceCustom').value = '';
        document.getElementById('leadSourceCustomContainer').classList.add('hidden');
      }
      renderDynamicLeadFields(lead);
    }
  } else {
    title.innerText = 'Add New Lead';
    const btnHistory = document.getElementById('btnLeadHistory');
    if (btnHistory) {
      btnHistory.style.display = 'none';
    }
    renderDynamicLeadFields(null);
  }

  // Permissions check for lead type (Client vs Candidate)
  const userPerms = (currentUser && currentUser.permissions) ? (typeof currentUser.permissions === 'string' ? JSON.parse(currentUser.permissions) : currentUser.permissions) : {};
  const isSuperAdminUser = currentUser && currentUser.role === 'Super Admin';
  const isCEOUser = currentUser && (currentUser.ceoEmail && currentUser.email.toLowerCase() === currentUser.ceoEmail.toLowerCase());
  const isAdminUser = currentUser && (currentUser.role === 'Manager' || currentUser.role === 'Admin');

  let currentIndustry = (companyInfo && companyInfo.industry) || (currentUser && currentUser.industry) || '';
  const isRecruitmentCRM = currentIndustry.toLowerCase().includes('recruitment');
  const isLoanDsaCRM = currentIndustry.toLowerCase().includes('loan dsa') || currentIndustry.toLowerCase().includes('loan');

  const canAddClient = isSuperAdminUser || isCEOUser || isAdminUser || userPerms.addLeadClient !== false;
  const canAddCandidate = isRecruitmentCRM && (isSuperAdminUser || isCEOUser || isAdminUser || userPerms.addLeadCandidate !== false);

  const leadTypeContainer = document.getElementById('leadTypeContainer');
  const leadTypeSelect = document.getElementById('leadTypeSelect');
  if (leadTypeContainer && leadTypeSelect) {
    if (isRecruitmentCRM && !leadIdToEdit && canAddClient && canAddCandidate) {
      leadTypeContainer.style.display = 'block';
      leadTypeSelect.value = 'client';
    } else {
      leadTypeContainer.style.display = 'none';
      leadTypeSelect.value = 'client';
    }
    handleLeadTypeChange();
  }

  // Dynamic Designation / Employment label based on Industry
  const leadDesigLabel = document.querySelector('label[for="leadDesignation"]');
  const leadDesigInput = document.getElementById('leadDesignation');
  if (leadDesigLabel && leadDesigInput) {
    if (isLoanDsaCRM) {
      leadDesigLabel.textContent = "Employment / Occupation Status";
      leadDesigInput.placeholder = "e.g. Salaried / Business Owner";
    } else if (isRecruitmentCRM) {
      leadDesigLabel.textContent = "Designation";
      leadDesigInput.placeholder = "e.g. CTO / Product Manager";
    } else {
      leadDesigLabel.textContent = "Designation / Role";
      leadDesigInput.placeholder = "e.g. Manager / Executive";
    }
  }

  modal.classList.add('active');
  lucide.createIcons();

  // If triggered via Voice Record button, start listening automatically after transition
  if (startVoiceImmediately) {
    setTimeout(() => {
      startSpeechRecognition();
    }, 400);
  }
}

function handleLeadTypeChange() {
  const select = document.getElementById('leadTypeSelect');
  const type = select ? select.value : 'client';
  
  const candFields = document.getElementById('leadCandidateFieldsContainer');
  const jobContainer = document.getElementById('leadCandidateJobContainer');
  const customFields = document.getElementById('leadCustomFieldsWrapper');
  const nextFollowUp = document.getElementById('leadNextFollowUp');
  
  // Client only form fields
  const clientOnlyFields = [
    'leadStatus', 'leadSource', 'leadLastFollowUp', 
    'leadAutoOutreachEnabled', 'leadSummary'
  ];
  
  if (type === 'candidate') {
    if (candFields) candFields.style.display = 'grid';
    if (jobContainer) jobContainer.style.display = 'block';
    if (customFields) customFields.style.display = 'none';
    if (nextFollowUp) nextFollowUp.removeAttribute('required');
    if (document.getElementById('leadCandidateSaveDbContainer')) {
      document.getElementById('leadCandidateSaveDbContainer').style.display = 'flex';
    }
    
    // Hide client-only fields
    clientOnlyFields.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        const grp = el.closest('.form-group') || el;
        grp.style.display = 'none';
      }
    });
    
    populateLeadCandidateJobs();
    
    // Handle resume file input disabled/enabled based on plan
    const activePlan = (companyInfo && companyInfo.plan) || (currentUser && currentUser.plan) || 'Free';
    const isPaid = activePlan.toLowerCase() !== 'free';
    const leadCandResume = document.getElementById('leadCandResume');
    const leadCandResumeStatus = document.getElementById('leadCandResumeUploadStatus');
    if (leadCandResume && leadCandResumeStatus) {
      if (isPaid) {
        leadCandResume.disabled = false;
        leadCandResumeStatus.innerHTML = '<span style="color: #34D399;">Upload PDF or Word resume (Max 2MB)</span>';
      } else {
        leadCandResume.disabled = true;
        leadCandResumeStatus.innerHTML = '<span style="color: #F87171;">Resume upload is disabled on the Free tier. Upgrade to Starter or Enterprise to enable.</span>';
      }
    }
  } else {
    if (candFields) candFields.style.display = 'none';
    if (jobContainer) jobContainer.style.display = 'none';
    if (customFields) customFields.style.display = 'grid';
    if (nextFollowUp) nextFollowUp.setAttribute('required', 'true');
    if (document.getElementById('leadCandidateSaveDbContainer')) {
      document.getElementById('leadCandidateSaveDbContainer').style.display = 'none';
    }
    
    // Show client-only fields
    clientOnlyFields.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        const grp = el.closest('.form-group') || el;
        grp.style.display = 'block';
      }
    });
  }
}

function populateLeadCandidateJobs() {
  const select = document.getElementById('leadCandidateJobSelect');
  if (!select) return;
  
  // Filter open jobs
  const openJobs = recruitmentJobs.filter(j => j.status === 'open');
  let html = '<option value="">-- Save in Talent Pool Only --</option>';
  html += openJobs.map(job => `<option value="${job.id}">${escapeHTML(job.title)} (${escapeHTML(job.department || 'General')})</option>`).join('');
  select.innerHTML = html;
}

function closeLeadModal() {
  document.getElementById('leadModalOverlay').classList.remove('active');
  abortSpeechRecognition();
}

function parseLeadSummary(summary) {
  let notes = summary || '';
  let customFields = {};
  if (summary && summary.startsWith('{')) {
    try {
      const parsed = JSON.parse(summary);
      notes = parsed.notes || '';
      customFields = parsed.customFields || {};
    } catch (e) {}
  }
  return { notes, customFields };
}

function renderDynamicLeadFields(lead = null) {
  const container = document.getElementById('leadCustomFieldsWrapper');
  if (!container) return;

  const activeIndustry = (companyInfo && companyInfo.industry) || (currentUser && currentUser.industry) || "Real Estate CRM Software";
  const profile = INDUSTRY_PROFILES[activeIndustry];

  if (!profile || !profile.fields || profile.fields.length === 0) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  // Parse existing custom fields if saved in summary
  let customVals = {};
  if (lead && lead.summary) {
    const { customFields } = parseLeadSummary(lead.summary);
    customVals = customFields;
  }

  container.innerHTML = '';
  profile.fields.forEach(field => {
    const val = customVals[field.id] || '';
    const fieldHtml = `
      <div class="form-group">
        <label for="custom_field_${field.id}">${field.label}</label>
        <div class="input-with-action">
          <input type="${field.type}" id="custom_field_${field.id}" class="form-control custom-industry-field" data-field-id="${field.id}" placeholder="${field.placeholder}" value="${val}">
          <button type="button" class="btn-input-voice" onclick="toggleFieldVoice('custom_field_${field.id}')" title="Speak ${field.label}">
            <i data-lucide="mic"></i>
          </button>
        </div>
      </div>
    `;
    container.insertAdjacentHTML('beforeend', fieldHtml);
  });

  container.style.display = 'grid';
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

function toggleCustomSourceInput() {
  const source = document.getElementById('leadSource').value;
  const container = document.getElementById('leadSourceCustomContainer');
  const customInput = document.getElementById('leadSourceCustom');
  
  if (source === 'Other') {
    container.classList.remove('hidden');
    customInput.setAttribute('required', 'required');
  } else {
    container.classList.add('hidden');
    customInput.removeAttribute('required');
    customInput.value = '';
  }
}

async function saveLead(event) {
  event.preventDefault();

  const id = document.getElementById('leadId').value;
  const name = document.getElementById('leadName').value.trim();
  const company = document.getElementById('leadCompany') ? document.getElementById('leadCompany').value.trim() : '';
  const designation = document.getElementById('leadDesignation').value.trim();
  const phone = document.getElementById('leadPhone').value.trim();
  const email = document.getElementById('leadEmail').value.trim();

  if (!name) {
    showAppNotification('Validation Error', 'Lead name is required.', 'danger');
    return;
  }

  const leadTypeSelect = document.getElementById('leadTypeSelect');
  const isCandidate = leadTypeSelect && leadTypeSelect.value === 'candidate';

  if (isCandidate) {
    const selectedJobId = document.getElementById('leadCandidateJobSelect').value;
    
    const current_ctc = document.getElementById('leadCandCurrentCtc').value.trim();
    const expected_ctc = document.getElementById('leadCandExpectedCtc').value.trim();
    const notice_period = document.getElementById('leadCandNoticePeriod').value.trim();
    const skills = document.getElementById('leadCandSkills').value.trim();
    const notes = document.getElementById('leadCandNotes').value.trim();

    let resumeBase64 = null;
    let resumeName = null;
    const resumeFile = document.getElementById('leadCandResume') ? document.getElementById('leadCandResume').files[0] : null;
    if (resumeFile) {
      try {
        resumeBase64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = (e) => reject(e);
          reader.readAsDataURL(resumeFile);
        });
        resumeName = resumeFile.name;
      } catch(err) {
        showAppNotification('Error', 'Failed to read resume file.', 'warning');
        return;
      }
    }

    const summaryObj = { 
      current_ctc, 
      expected_ctc, 
      notice_period, 
      skills, 
      notes,
      resume_base64: resumeBase64,
      resume_name: resumeName
    };
    
    let hrAgent = '';
    const hrAgents = agents.filter(a => a.role === 'HR');
    if (hrAgents.length > 0) {
      hrAgent = hrAgents[0].name;
    } else if (currentUser) {
      hrAgent = currentUser.name;
    }

    const payload = {
      jobId: selectedJobId,
      name,
      email,
      phone,
      assignedRecruiter: hrAgent,
      status: 'applied',
      details: JSON.stringify(summaryObj)
    };

    try {
      showGlobalLoading("Saving candidate details...");
      const res = await fetch(`${API_BASE}/api/candidates`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save candidate');
      }


      showAppNotification('Success', 'Candidate lead added to Recruitment CRM successfully.', 'success');
      closeLeadModal();
      
      await initRemoteDatabase();
      await fetchAndRenderRecruitment();
    } catch (err) {
      showAppNotification('Error', err.message, 'danger');
    } finally {
      hideGlobalLoading();
    }
    return;
  }

  if (!email && !phone) {
    showAppNotification('Validation Error', 'At least one contact detail (Email or Phone number) is compulsory.', 'danger');
    return;
  }

  if (phone) {
    const phoneClean = phone.replace(/[^0-9+]/g, '');
    if (phoneClean.length < 10 || phoneClean.length > 15) {
      showAppNotification('Validation Error', 'Phone number must be between 10 and 15 digits.', 'danger');
      return;
    }
  }

  // Duplicate lead check before saving
  if (!id) {
    const cleanPhoneDigits = phone ? phone.replace(/\D/g, '') : '';
    const cleanEmailVal = email ? email.toLowerCase().trim() : '';

    const existingLead = leads.find(l => {
      const matchEmail = cleanEmailVal && l.email && l.email.toLowerCase().trim() === cleanEmailVal;
      const matchPhone = cleanPhoneDigits && l.phone && l.phone.replace(/\D/g, '') === cleanPhoneDigits;
      return matchEmail || matchPhone;
    });

    if (existingLead) {
      const matchType = (existingLead.phone && existingLead.phone.replace(/\D/g, '') === cleanPhoneDigits) ? `Phone Number (${phone})` : `Email Address (${email})`;
      showAppConfirm(
        "⚠️ Duplicate Lead Warning",
        `A lead with this ${matchType} already exists in your CRM under the name "${existingLead.name}" (Assigned to: ${existingLead.assignedAgent || 'Unassigned'}). Do you still want to proceed and save this duplicate record?`,
        async () => {
          await executeSaveLeadData({
            name, company, designation, phone, email, source, status, lastFollowUp, nextFollowUp, foundBy, summary: summaryPayload, postUrl, assignedAgent, isPermanent
          }, id);
        }
      );
      return;
    }
  }
  const rawSource = document.getElementById('leadSource').value;
  const customSource = document.getElementById('leadSourceCustom').value.trim();
  const source = (rawSource === 'Other' && customSource) ? customSource : rawSource;
  const status = document.getElementById('leadStatus').value;
  const lastFollowUp = document.getElementById('leadLastFollowUp').value;
  const nextFollowUp = document.getElementById('leadNextFollowUp').value;
  const foundByEl = document.getElementById('leadFoundBy');
  const foundBy = foundByEl ? foundByEl.value.trim() : '';
  const summary = document.getElementById('leadSummary').value.trim();
  const autoWhatsApp = document.getElementById('leadAutoWhatsApp').checked;
  const autoEmail = document.getElementById('leadAutoEmail').checked;
  const autoAiCall = document.getElementById('leadAutoAiCall').checked;
  const autoOutreachEnabled = document.getElementById('leadAutoOutreachEnabled').checked;
  const reminderText = document.getElementById('leadReminderText').value.trim();
  const assignedAgent = document.getElementById('leadAssignedAgent') ? document.getElementById('leadAssignedAgent').value : '';
  const postUrl = document.getElementById('leadPostUrl') ? document.getElementById('leadPostUrl').value.trim() : '';
  const isPermanent = document.getElementById('leadIsPermanent') ? (document.getElementById('leadIsPermanent').checked ? 1 : 0) : 0;

  // Collect dynamic industry custom fields
  const customFields = {};
  document.querySelectorAll('.custom-industry-field').forEach(input => {
    const fieldId = input.getAttribute('data-field-id');
    customFields[fieldId] = input.value.trim();
  });

  const summaryPayload = JSON.stringify({
    notes: summary,
    customFields: customFields
  });

  const leadData = {
    name,
    company,
    designation,
    phone,
    email,
    source,
    status,
    lastFollowUp,
    nextFollowUp,
    foundBy,
    summary: summaryPayload,
    postUrl,
    assignedAgent,
    isPermanent
  };

  try {
    showGlobalLoading("Saving lead details...");
    let response;
    if (id) {
      // Edit existing lead
      response = await fetch(`${API_BASE}/api/leads/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(leadData)
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to update lead");
      }
      const isWonStatus = status === 'won' || (status && status.toLowerCase().includes('won')) || status === 'Working with them (won)';
      if (isWonStatus) {
        showAppNotification('Client Lead Updated', `Client lead "${company || name}" updated. Please start job posting for them!`, 'info');
      } else {
        showAppNotification('Lead Updated', `${name}'s data has been updated.`, 'success');
      }
    } else {
      // Add new lead
      response = await fetch(`${API_BASE}/api/leads`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(leadData)
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to create lead");
      }
      const isWonStatus = status === 'won' || (status && status.toLowerCase().includes('won')) || status === 'Working with them (won)';
      if (isWonStatus) {
        showAppNotification('Client Lead Added', `Client lead "${company || name}" added. Please start job posting for them!`, 'success');
      } else {
        showAppNotification('Lead Added', `${name} has been added to directory.`, 'success');
      }
    }

    // Refresh data from API
    await initRemoteDatabase();
    closeLeadModal();
  } catch (err) {
    showAppNotification('Save Failed', err.message, 'danger');
  } finally {
    hideGlobalLoading();
  }
}

function editLead(id) {
  openLeadModal(id);
}

let pendingDeleteLeadId = null;

async function deleteLead(id) {
  const lead = leads.find(l => l.id === id);
  if (!lead) return;

  // Ensure job listings are loaded to check live job posts
  if (typeof ensureRecruitmentDataLoaded === 'function') {
    await ensureRecruitmentDataLoaded();
  }

  const clientName = (lead.company || lead.name || '').trim();
  const clientNameLower = clientName.toLowerCase();

  // Check if any job post is active / live for this client
  const activeJobsForClient = recruitmentJobs.filter(j => {
    if (j.status === 'closed') return false;
    if (j.clientId && String(j.clientId) === String(lead.id)) return true;
    if (clientNameLower) {
      const jobComp = (j.company || j.client_name || '').trim().toLowerCase();
      if (jobComp === clientNameLower) return true;
    }
    return false;
  });

  if (activeJobsForClient.length > 0) {
    pendingDeleteLeadId = id;
    showClientDeleteWarningModal(lead, activeJobsForClient);
    return;
  }

  await continueLeadDeletionFlow(lead);
}

function showClientDeleteWarningModal(lead, activeJobs) {
  const modal = document.getElementById('clientDeleteWarningModalOverlay');
  const textElem = document.getElementById('clientDeleteWarningText');
  const listElem = document.getElementById('clientDeleteJobsList');
  const checkbox = document.getElementById('clientDeleteConfirmCheckbox');
  const btn = document.getElementById('confirmDeleteClientModalBtn');

  if (!modal || !textElem || !listElem || !checkbox || !btn) {
    if (!confirm(`Warning: Already ${activeJobs.length} live job post(s) exist for client "${lead.company || lead.name}". Are you sure you want to delete this client?`)) {
      return;
    }
    continueLeadDeletionFlow(lead);
    return;
  }

  const clientDisplayName = escapeHTML(lead.company || lead.name || 'Selected Client');
  textElem.innerHTML = `Already job is posted with this client (<strong>${clientDisplayName}</strong>). Do you really want to delete it?`;

  listElem.innerHTML = activeJobs.map(j => `
    <li><strong>${escapeHTML(j.title)}</strong> <span style="font-size: 0.72rem; color: var(--text-muted); font-family: monospace;">(ID: ${escapeHTML(j.id)})</span></li>
  `).join('');

  checkbox.checked = false;
  btn.disabled = true;
  btn.style.opacity = '0.5';
  btn.style.cursor = 'not-allowed';

  modal.classList.add('active');
  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
  }
}

function closeClientDeleteWarningModal() {
  const modal = document.getElementById('clientDeleteWarningModalOverlay');
  if (modal) modal.classList.remove('active');
  pendingDeleteLeadId = null;
}

function onClientDeleteCheckboxChanged() {
  const checkbox = document.getElementById('clientDeleteConfirmCheckbox');
  const btn = document.getElementById('confirmDeleteClientModalBtn');
  if (!checkbox || !btn) return;

  if (checkbox.checked) {
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
  } else {
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.style.cursor = 'not-allowed';
  }
}

async function proceedWithConfirmedClientDeletion() {
  if (!pendingDeleteLeadId) return;
  const leadId = pendingDeleteLeadId;
  closeClientDeleteWarningModal();
  
  const lead = leads.find(l => l.id === leadId);
  if (lead) {
    await continueLeadDeletionFlow(lead);
  }
}

async function continueLeadDeletionFlow(lead) {
  const isAgent = currentUser.role === 'Sales Agent';
  
  if (isAgent) {
    showAppPrompt(
      "Request Deletion",
      `Enter reason for requesting deletion of "${lead.name}":`,
      "",
      async (reason) => {
        if (!reason || !reason.trim()) {
          showAppNotification('Error', 'Deletion reason is required.', 'danger');
          return;
        }
        await executeDeleteLead(lead.id, reason);
      }
    );
  } else if (currentUser.role === 'Super Admin') {
    showAppConfirm(
      "Confirm Deletion",
      `Are you sure you want to delete lead "${lead.name}"?`,
      async () => {
        await executeDeleteLead(lead.id, "");
      }
    );
  } else {
    showAppPrompt(
      "Enter Security PIN",
      `Enter security PIN to delete lead "${lead.name}":`,
      "",
      async (pin) => {
        const expectedPin = (companyInfo && companyInfo.deleteLeadPin) ? companyInfo.deleteLeadPin : '0000';
        if (pin !== expectedPin) {
          showAppNotification('Access Denied', 'Incorrect PIN. Deletion cancelled.', 'danger');
          return;
        }
        await executeDeleteLead(lead.id, "");
      }
    );
  }
}

async function executeDeleteLead(id, reason) {
  try {
    showGlobalLoading("Processing lead deletion...");
    const response = await fetch(`${API_BASE}/api/leads/${id}?reason=${encodeURIComponent(reason || '')}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || "Failed to delete lead");
    }

    const data = await response.json();
    if (data.deleted) {
      showAppNotification('Lead Deleted', 'Lead permanently removed from directory.', 'danger');
    } else {
      showAppNotification('Request Submitted', 'Lead deletion request submitted for approval.', 'info');
    }

    // Refresh all data & views across the entire CRM immediately!
    await initRemoteDatabase();
    await fetchAndRenderRecruitment();
    await fetchAllRecruitmentCandidates();
    
    if (typeof renderLeads === 'function') renderLeads();
    if (typeof renderSalesPipeline === 'function') renderSalesPipeline();
    if (typeof renderClientsKanban === 'function') renderClientsKanban();
    if (typeof populateRecruitmentFilters === 'function') populateRecruitmentFilters();
    if (typeof renderRecruitmentJobs === 'function') renderRecruitmentJobs();
    if (typeof renderCandidatePipeline === 'function') renderCandidatePipeline();
    if (typeof updateRecruitmentKPIs === 'function') updateRecruitmentKPIs();
  } catch (err) {
    showAppNotification('Error', err.message, 'danger');
  } finally {
    hideGlobalLoading();
  }
}

// ----------------------------------------------------
// GOOGLE SHEETS SYNC & CRM SETTINGS
// ----------------------------------------------------
let isSettingsUnlocked = false;

function toggleEmailProvider(val) {
  const isGmail = val === 'gmail';
  const gmailAlert = document.getElementById('gmailHelperAlert');
  const hostGroup = document.getElementById('smtpHostGroup');
  const portGroup = document.getElementById('smtpPortGroup');
  const secureGroup = document.getElementById('smtpSecureGroup');
  const userLabel = document.getElementById('smtpUserLabel');
  const userField = document.getElementById('smtpUser');
  const passLabel = document.getElementById('smtpPassLabel');
  const passField = document.getElementById('smtpPass');

  if (gmailAlert) gmailAlert.style.display = isGmail ? 'block' : 'none';
  if (hostGroup) hostGroup.style.display = isGmail ? 'none' : 'block';
  if (portGroup) portGroup.style.display = isGmail ? 'none' : 'block';
  if (secureGroup) secureGroup.style.display = isGmail ? 'none' : 'flex';
  
  if (userLabel && userField && passLabel && passField) {
    userLabel.innerText = isGmail ? 'Gmail Email Address' : 'SMTP Username / Email';
    userField.placeholder = isGmail ? 'e.g. name@gmail.com' : 'e.g. user@company.com';
    
    passLabel.innerText = isGmail ? 'Gmail App Password' : 'SMTP Password';
    passField.placeholder = isGmail ? '•••• •••• •••• ••••' : '••••••••';
  }
}

function openSettingsModal() {
  const modal = document.getElementById('settingsModalOverlay');
  if (modal) {
    fetchStorageStatus();
    // Generate and populate Extension Connection Token immediately
    const tokenInput = document.getElementById('extensionConnToken');
    if (tokenInput) {
      tokenInput.value = getExtensionToken();
    }
    
    // Reset passcode fields
    document.getElementById('securityPinInput').value = '';
    document.getElementById('pinErrorMessage').classList.add('hidden');
    
    if (typeof fetchAndRenderSystemHealthTerminal === 'function') {
      fetchAndRenderSystemHealthTerminal();
    }
    
    // Check unlock state
    if (isSettingsUnlocked) {
      document.getElementById('settingsPinContainer').classList.add('hidden');
      document.getElementById('settingsConfigContainer').classList.remove('hidden');
      document.getElementById('btnSaveSettings').classList.remove('hidden');
    } else {
      document.getElementById('settingsPinContainer').classList.remove('hidden');
      document.getElementById('settingsConfigContainer').classList.add('hidden');
      document.getElementById('btnSaveSettings').classList.add('hidden');
    }
    
    const url = localStorage.getItem('google_sheets_url') || '';
    document.getElementById('googleWebAppUrl').value = url;
    document.getElementById('metaAccessToken').value = localStorage.getItem('meta_access_token') || '';
    document.getElementById('metaPhoneNumberId').value = localStorage.getItem('meta_phone_number_id') || '';
    document.getElementById('metaTemplateName').value = localStorage.getItem('meta_template_name') || '';
    document.getElementById('metaLanguageCode').value = localStorage.getItem('meta_language_code') || 'en_US';
    
    // Reset SMTP values in UI
    document.getElementById('smtpProviderSelect').value = 'gmail';
    document.getElementById('smtpHost').value = 'smtp.gmail.com';
    document.getElementById('smtpPort').value = '465';
    document.getElementById('smtpUser').value = '';
    document.getElementById('smtpPass').value = '';
    document.getElementById('smtpSecure').checked = true;
    toggleEmailProvider('gmail');

    // Fetch live SMTP values dynamically from backend
    fetch(`${API_BASE}/api/companies/my-settings`, {
      method: 'GET',
      headers: getAuthHeaders()
    })
    .then(res => {
      if (!res.ok) throw new Error("Could not load backend SMTP settings");
      return res.json();
    })
    .then(data => {
      if (data.smtpHost) {
        document.getElementById('smtpHost').value = data.smtpHost || 'smtp.gmail.com';
        document.getElementById('smtpPort').value = data.smtpPort || '465';
        document.getElementById('smtpUser').value = data.smtpUser || '';
        document.getElementById('smtpPass').value = data.smtpPass || '';
        document.getElementById('smtpSecure').checked = data.smtpSecure !== 'false';
        
        const provider = (data.smtpHost.indexOf('gmail') !== -1) ? 'gmail' : 'custom';
        document.getElementById('smtpProviderSelect').value = provider;
        toggleEmailProvider(provider);
      }
    })
    .catch(err => console.log("Note: Loading SMTP settings from backend failed."));

    // Load Bland AI values
    document.getElementById('blandAiKey').value = localStorage.getItem('bland_ai_key') || '';
    document.getElementById('blandVoiceId').value = localStorage.getItem('bland_voice_id') || 'baseline';

    if (document.getElementById('tursoUrl')) {
      document.getElementById('tursoUrl').value = localStorage.getItem('turso_url') || '';
      document.getElementById('tursoToken').value = localStorage.getItem('turso_token') || '';
    }
    
    if (document.getElementById('welcomeMessageTemplate')) {
      document.getElementById('welcomeMessageTemplate').value = localStorage.getItem('welcome_message_template') || 'Hello {name}! Welcome to our company. How can we help you today?';
      document.getElementById('notifyOnNewLead').checked = localStorage.getItem('notify_on_new_lead') === 'true';
      document.getElementById('notifyOnFollowUp').checked = localStorage.getItem('notify_on_follow_up') === 'true';
    }

    const isCEO = currentUser && currentUser.ceoEmail && currentUser.email.toLowerCase() === currentUser.ceoEmail.toLowerCase();
    const isSuperAdmin = currentUser && currentUser.role === 'Super Admin';
    const passcodesCard = document.getElementById('settingsPasscodesCard');
    if (passcodesCard) {
      if (isCEO || isSuperAdmin) {
        passcodesCard.style.display = 'block';
        document.getElementById('settingDeleteLeadPin').value = (companyInfo && companyInfo.deleteLeadPin) ? companyInfo.deleteLeadPin : '0000';
        document.getElementById('settingSyncSettingsPin').value = (companyInfo && companyInfo.syncSettingsPin) ? companyInfo.syncSettingsPin : '0000';
      } else {
        passcodesCard.style.display = 'none';
      }
    }
    
    modal.classList.add('active');
  }
}

function verifySecurityPin() {
  const pinInput = document.getElementById('securityPinInput');
  const errorMsg = document.getElementById('pinErrorMessage');
  const pin = pinInput.value.trim();
  
  const expectedPin = (companyInfo && companyInfo.syncSettingsPin) ? companyInfo.syncSettingsPin : '0000';
  if (currentUser.role === 'Super Admin' || pin === expectedPin) {
    isSettingsUnlocked = true;
    errorMsg.classList.add('hidden');
    
    // Reveal configuration inputs
    document.getElementById('settingsPinContainer').classList.add('hidden');
    document.getElementById('settingsConfigContainer').classList.remove('hidden');
    document.getElementById('btnSaveSettings').classList.remove('hidden');
    
    // Prepopulate EmailJS fields
    if (document.getElementById('emailjsServiceId')) {
      document.getElementById('emailjsServiceId').value = localStorage.getItem('emailjs_service_id') || '';
      document.getElementById('emailjsTemplateId').value = localStorage.getItem('emailjs_template_id') || '';
      document.getElementById('emailjsPublicKey').value = localStorage.getItem('emailjs_public_key') || '';
    }
    
    // Prepopulate Extension Connection Token & Webhook URLs
    if (document.getElementById('extensionConnToken')) {
      document.getElementById('extensionConnToken').value = getExtensionToken();
    }
    const tenantId = currentUser ? currentUser.tenantId : 'tenant';
    if (document.getElementById('webhookIngestUrl')) {
      document.getElementById('webhookIngestUrl').value = `${window.location.origin}/api/webhooks/leads/${tenantId}`;
      document.getElementById('webhookMetaUrl').value = `${window.location.origin}/api/webhooks/meta`;
    }
    
    showAppNotification('Access Granted', 'Google Sheet settings unlocked.', 'success');
  } else {
    errorMsg.classList.remove('hidden');
    pinInput.value = '';
    pinInput.focus();
    showAppNotification('Access Denied', 'Incorrect Security PIN.', 'danger');
  }
}

function closeSettingsModal() {
  const modal = document.getElementById('settingsModalOverlay');
  if (modal) modal.classList.remove('active');
}

async function saveSettings(event) {
  event.preventDefault();
  const url = document.getElementById('googleWebAppUrl').value.trim();
  localStorage.setItem('google_sheets_url', url);
  
  if (document.getElementById('tursoUrl')) {
    localStorage.setItem('turso_url', document.getElementById('tursoUrl').value.trim());
    localStorage.setItem('turso_token', document.getElementById('tursoToken').value.trim());
  }

  localStorage.setItem('meta_access_token', document.getElementById('metaAccessToken').value.trim());
  localStorage.setItem('meta_phone_number_id', document.getElementById('metaPhoneNumberId').value.trim());
  localStorage.setItem('meta_template_name', document.getElementById('metaTemplateName').value.trim());
  localStorage.setItem('meta_language_code', document.getElementById('metaLanguageCode').value.trim() || 'en_US');
  
  localStorage.setItem('welcome_message_template', document.getElementById('welcomeMessageTemplate').value.trim());
  localStorage.setItem('notify_on_new_lead', document.getElementById('notifyOnNewLead').checked);
  localStorage.setItem('notify_on_follow_up', document.getElementById('notifyOnFollowUp').checked);
  
  if (document.getElementById('emailjsServiceId')) {
    localStorage.setItem('emailjs_service_id', document.getElementById('emailjsServiceId').value.trim());
    localStorage.setItem('emailjs_template_id', document.getElementById('emailjsTemplateId').value.trim());
    localStorage.setItem('emailjs_public_key', document.getElementById('emailjsPublicKey').value.trim());
  }

  const smtpProvider = document.getElementById('smtpProviderSelect').value;
  const smtpHost = document.getElementById('smtpHost').value.trim() || 'smtp.gmail.com';
  const smtpPort = document.getElementById('smtpPort').value.trim() || '465';
  const smtpUser = document.getElementById('smtpUser').value.trim();
  const smtpPass = document.getElementById('smtpPass').value.trim();
  const smtpSecure = document.getElementById('smtpSecure').checked;
  const blandKey = document.getElementById('blandAiKey').value.trim();
  const blandVoice = document.getElementById('blandVoiceId').value.trim();

  localStorage.setItem('smtp_provider', smtpProvider);
  localStorage.setItem('smtp_host', smtpHost);
  localStorage.setItem('smtp_port', smtpPort);
  localStorage.setItem('smtp_secure', smtpSecure);
  localStorage.setItem('bland_ai_key', blandKey);
  localStorage.setItem('bland_voice_id', blandVoice);

  if (currentUser) {
    try {
      showGlobalLoading("Saving settings and syncing credentials...");
      const isCEO = currentUser && currentUser.ceoEmail && currentUser.email.toLowerCase() === currentUser.ceoEmail.toLowerCase();
      const isSuperAdmin = currentUser && currentUser.role === 'Super Admin';
      if (isCEO || isSuperAdmin) {
        const deleteLeadPin = document.getElementById('settingDeleteLeadPin').value.trim();
        const syncSettingsPin = document.getElementById('settingSyncSettingsPin').value.trim();
        
        const pinRes = await fetch(`${API_BASE}/api/companies/my-company/settings`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            deleteLeadPin,
            syncSettingsPin
          })
        });
        if (pinRes.ok) {
          console.log("PIN settings saved successfully.");
          const infoRes = await fetch(`${API_BASE}/api/companies/info`, { headers: getAuthHeaders() });
          if (infoRes.ok) {
            companyInfo = await infoRes.json();
          }
        }
      }

      const settingsRes = await fetch(`${API_BASE}/api/companies/my-settings`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          smtpHost,
          smtpPort,
          smtpUser,
          smtpPass,
          smtpSecure: smtpSecure ? 'true' : 'false'
        })
      });
      if (!settingsRes.ok) throw new Error("Backend save failed");
      console.log("Successfully synchronized SMTP settings with backend agent record.");
      showAppNotification('Settings Saved', 'Sync configurations and API credentials saved.', 'success');
      closeSettingsModal();
    } catch (err) {
      console.error("Error saving SMTP settings to backend:", err);
      showAppNotification('Save Failed', 'Could not synchronize settings with backend server: ' + err.message, 'danger');
    } finally {
      hideGlobalLoading();
    }
  } else {
    showAppNotification('Settings Saved', 'Local sync configurations saved.', 'success');
    closeSettingsModal();
  }
}

function syncToGoogleSheets() {
  const url = localStorage.getItem('google_sheets_url');
  
  if (!url) {
    showAppNotification('Sync Failed', 'Please configure your Google Sheet URL in Settings first.', 'danger');
    openSettingsModal();
    return;
  }

  showAppNotification('Syncing...', 'Uploading leads directory to Google Sheets...', 'success');

  fetch(url, {
    method: 'POST',
    mode: 'no-cors',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(leads)
  })
  .then(() => {
    showAppNotification('Sync Successful', 'Google Sheet has been updated with all current leads.', 'success');
  })
  .catch(error => {
    console.error('Sheets Sync Error:', error);
    showAppNotification('Sync Error', 'Could not establish connection to the Google Web App script.', 'danger');
  });
}

// ----------------------------------------------------
// AUTO-OUTREACH REMINDER CAMPAIGN ENGINE
// ----------------------------------------------------
const sleep = ms => new Promise(res => setTimeout(res, ms));

function renderOutreachQueue() {
  const tbody = document.getElementById('outreachTableBody');
  const table = document.getElementById('outreachTable');
  const emptyState = document.getElementById('outreachEmptyState');
  
  if (!tbody) return;
  tbody.innerHTML = '';
  
  const todayStr = new Date().toISOString().split('T')[0];
  const filterType = document.getElementById('outreachQueueFilter') ? document.getElementById('outreachQueueFilter').value : 'due';
  
  let targetLeads = [];
  if (filterType === 'due') {
    targetLeads = leads.filter(l => ['inprogress', 'contacted', 'new'].includes(l.status) && l.nextFollowUp <= todayStr);
  } else if (filterType === 'due_auto') {
    targetLeads = leads.filter(l => ['inprogress', 'contacted', 'new'].includes(l.status) && l.nextFollowUp <= todayStr && l.autoOutreachEnabled === true);
  } else if (filterType === 'active') {
    targetLeads = leads.filter(l => ['inprogress', 'contacted', 'new'].includes(l.status));
  } else {
    targetLeads = [...leads];
  }
  
  document.getElementById('outreach-metric-due').innerText = targetLeads.length;
  
  if (targetLeads.length === 0) {
    table.style.display = 'none';
    emptyState.style.display = 'flex';
    return;
  }
  
  table.style.display = 'table';
  emptyState.style.display = 'none';
  
  targetLeads.forEach((lead, index) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td style="text-align: center;">
        <input type="checkbox" class="outreach-row-select" data-id="${lead.id}" style="width: 16px; height: 16px; accent-color: var(--accent-purple); cursor: pointer;">
      </td>
      <td style="text-align: center; font-weight: 600; color: var(--text-secondary);">${index + 1}</td>
      <td>
        <div class="lead-info-cell">
          <span class="lead-name">${escapeHTML(lead.name)}</span>
          <span class="lead-designation">${escapeHTML(lead.designation || 'No Designation')}</span>
          <div style="display: flex; align-items: center; gap: 0.35rem; margin-top: 0.25rem; flex-wrap: wrap;">
            <div id="reminder-preview-${lead.id}" class="lead-reminder-text-preview" style="font-size: 0.72rem; color: var(--accent-purple); font-style: italic; font-weight: 500;">
              "${escapeHTML(lead.reminderText || 'Default Template Message')}"
            </div>
            <button type="button" id="edit-reminder-btn-${lead.id}" class="btn-icon" onclick="editReminderInline('${lead.id}')" title="Edit message" style="padding: 0.1rem 0.2rem; background: transparent; border: none; color: var(--text-secondary); cursor: pointer; transition: color var(--transition-fast);">
              <i data-lucide="edit-2" style="width: 10px; height: 10px;"></i>
            </button>
          </div>
        </div>
      </td>
      <td style="text-align: center;">
        <input type="checkbox" id="queue-wa-${lead.id}" ${lead.autoWhatsApp !== false ? 'checked' : ''} style="width: 16px; height: 16px; accent-color: var(--accent-purple);">
      </td>
      <td style="text-align: center;">
        <input type="checkbox" id="queue-email-${lead.id}" ${lead.autoEmail !== false ? 'checked' : ''} style="width: 16px; height: 16px; accent-color: var(--accent-purple);">
      </td>
      <td style="text-align: center;">
        <input type="checkbox" id="queue-call-${lead.id}" ${lead.autoAiCall === true ? 'checked' : ''} style="width: 16px; height: 16px; accent-color: var(--accent-purple);">
      </td>
      <td>
        <span id="queue-status-${lead.id}" class="status-badge" style="background: rgba(255,255,255,0.05); color: var(--text-secondary);">Pending</span>
      </td>
      <td style="text-align: center;">
        <div style="display: flex; justify-content: center; gap: 0.35rem;">
          <button class="btn-secondary" onclick="window.launchFreeAiCallModal('${lead.id}'); setTimeout(() => window.startFreeAiCallSpeech('${escapeHTML(lead.name)}'), 300);" title="Launch AI Call for ${escapeHTML(lead.name)}" style="font-size: 0.7rem; padding: 0.25rem 0.55rem; border-color: rgba(52, 211, 153, 0.4); color: #34D399; background: rgba(52, 211, 153, 0.08); display: inline-flex; align-items: center; gap: 0.25rem; border-radius: 6px;">
            <i data-lucide="phone-call" style="width: 12px; height: 12px;"></i> AI Call
          </button>
          <button class="btn-icon" onclick="runIndividualOutreach('${lead.id}')" title="Trigger Outreach for ${escapeHTML(lead.name)}" style="background: rgba(192, 132, 252, 0.1); border-color: rgba(192, 132, 252, 0.2); color: var(--accent-purple); padding: 0.35rem 0.5rem; border-radius: 6px;">
            <i data-lucide="send" style="width: 13px; height: 13px;"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(row);
  });
  lucide.createIcons();
}

let abortCampaign = false;

function stopOutreachCampaign() {
  abortCampaign = true;
  showAppNotification('Stopping...', 'Campaign abort requested.', 'warning');
}

function toggleAllOutreachLeads(isChecked) {
  const rowCheckboxes = document.querySelectorAll('.outreach-row-select');
  rowCheckboxes.forEach(cb => cb.checked = isChecked);
}

async function runOutreachCampaign() {
  const isPaidMode = document.getElementById('campaignDispatchMode') ? (document.getElementById('campaignDispatchMode').value === 'paid') : false;
  if (isPaidMode) {
    const hasPaidPermission = currentUser.role === 'Super Admin' || (currentUser.permissions && currentUser.permissions.paidApiMode === true);
    if (!hasPaidPermission) {
      showAppNotification('Access Denied', 'Paid API Mode is not enabled for your account. Please contact your Super Admin.', 'danger');
      return;
    }
  }

  const checkedCheckboxes = Array.from(document.querySelectorAll('.outreach-row-select:checked'));
  
  if (checkedCheckboxes.length === 0) {
    showAppNotification('No Selection', 'Please check/select the leads you wish to run the campaign on first.', 'warning');
    return;
  }
  
  const selectedIds = checkedCheckboxes.map(cb => cb.getAttribute('data-id'));
  const targetLeads = leads.filter(l => selectedIds.includes(l.id));

  // Intercept campaign dispatches with active email queues to launch composer step
  const emailLeads = targetLeads.filter(lead => {
    const emailChecked = document.getElementById(`queue-email-${lead.id}`) ? document.getElementById(`queue-email-${lead.id}`).checked : (lead.autoEmail !== false);
    return emailChecked && lead.email;
  });

  if (emailLeads.length > 0) {
    openEmailDraftModal(emailLeads, isPaidMode);
    return;
  }
  
  const todayStr = new Date().toISOString().split('T')[0];
  abortCampaign = false;
  let outreachErrorOccurred = false;
  
  const btn = document.getElementById('btnStartCampaign');
  btn.disabled = true;
  btn.innerHTML = '<i class="spinner-border spinner-border-sm" style="margin-right: 4px;"></i>Campaign running...';
  
  const progressContainer = document.getElementById('campaignProgressContainer');
  const progressBar = document.getElementById('campaignProgressBar');
  const consoleLog = document.getElementById('outreachConsoleLog');
  
  progressContainer.style.display = 'block';
  progressBar.style.width = '0%';
  
  const writeLog = (text, type = 'info') => {
    const line = document.createElement('div');
    line.className = `outreach-log-line ${type}`;
    line.innerText = `[${new Date().toLocaleTimeString()}] ${text}`;
    consoleLog.appendChild(line);
    consoleLog.scrollTop = consoleLog.scrollHeight;
  };
  
  writeLog('Auto-Outreach campaign launched. Initializing channels...', 'info');
  let dispatched = 0;
  
  document.getElementById('btnStopCampaign').style.display = 'inline-block';
  showAppNotification('Campaign Started', 'Processing outreach queue...', 'info');

  for (let i = 0; i < targetLeads.length; i++) {
    if (abortCampaign) {
      writeLog('Campaign aborted by user.', 'danger');
      showAppNotification('Campaign Stopped', 'Automated campaign has been stopped.', 'warning');
      break;
    }

    const lead = targetLeads[i];
    const rowStatus = document.getElementById(`queue-status-${lead.id}`);
    if (rowStatus) {
      rowStatus.innerText = 'Processing...';
      rowStatus.style.background = 'rgba(14, 165, 233, 0.15)';
      rowStatus.style.color = 'var(--accent-blue)';
    }
    
    const waChecked = document.getElementById(`queue-wa-${lead.id}`).checked;
    const emailChecked = document.getElementById(`queue-email-${lead.id}`).checked;
    const callChecked = document.getElementById(`queue-call-${lead.id}`).checked;
    
    writeLog(`Processing outreach for ${lead.name}...`, 'info');
    await sleep(600);
    
    const isPaidMode = document.getElementById('campaignDispatchMode') ? (document.getElementById('campaignDispatchMode').value === 'paid') : false;
    let triggers = [];
    
    if (waChecked && lead.phone) {
      if (isPaidMode) {
        writeLog(` -> Dispatching Meta Cloud API template request to ${lead.phone}...`, 'info');
        try {
          await sendMetaWhatsAppAPI(lead);
          writeLog(`    [Meta API] Direct API dispatch completed successfully.`, 'success');
          triggers.push('WhatsApp');
        } catch (err) {
          writeLog(`    [Meta API Error] ${err.message}`, 'danger');
          outreachErrorOccurred = true;
        }
      } else {
        writeLog(` -> Opening Click-to-Chat redirect window to ${lead.phone}...`, 'success');
        const waText = lead.reminderText || "Hi, this is a polite reminder regarding our scheduled follow-up. Let us know a convenient time to talk.";
        window.open(`https://wa.me/${lead.phone.replace(/\D/g, '')}?text=${encodeURIComponent(waText)}`, '_blank');
        triggers.push('WhatsApp');
      }
      await sleep(800);
    }
    
    if (emailChecked && lead.email) {
      if (isPaidMode) {
        writeLog(` -> Dispatching background Email API payload to ${lead.email}...`, 'info');
        try {
          const emailText = lead.reminderText || "Hi, this is a polite reminder regarding our scheduled follow-up. Let us know a convenient time to talk.";
          const emailRes = await fetch(`${API_BASE}/api/outreach/send-email`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
              to: lead.email,
              subject: "Follow-up Reminder",
              body: emailText,
              tenantId: lead.tenantId
            })
          });
          if (!emailRes.ok) {
            const errData = await emailRes.json();
            throw new Error(errData.error || "Email dispatch endpoint failed");
          }
          writeLog(`    [Email API] Direct SMTP background dispatch completed successfully.`, 'success');
          triggers.push('Email');
        } catch (err) {
          writeLog(`    [Email API Error] ${err.message}`, 'danger');
          outreachErrorOccurred = true;
        }
      } else {
        writeLog(` -> Opening Gmail Compose window to ${lead.email}...`, 'success');
        const emailText = lead.reminderText || "Hi, this is a polite reminder regarding our scheduled follow-up. Let us know a convenient time to talk.";
        window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(lead.email)}&su=${encodeURIComponent("Follow-up Reminder")}&body=${encodeURIComponent(emailText)}`, '_blank');
        triggers.push('Email');
      }
      await sleep(800);
    }
    
    if (callChecked && lead.phone) {
      writeLog(` -> Launching Free AI Voice Calling Studio for ${lead.phone}...`, 'info');
      try {
        await triggerBlandAiCall(lead);
        writeLog(`    [AI Call Studio] AI Voice Calling Studio active for ${lead.name}.`, 'success');
        triggers.push('AI Call');
      } catch(err) {
        writeLog(`    [AI Call Error] ${err.message}`, 'danger');
      }
      await sleep(1000);
    }
    
    // Webhook Sync Hook (ONLY in Paid Mode!)
    if (isPaidMode) {
      const webhookUrl = localStorage.getItem('google_sheets_url');
      if (webhookUrl && triggers.length > 0) {
        try {
          await fetch(webhookUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event: 'auto_outreach',
              lead: lead,
              channels: triggers,
              timestamp: new Date().toISOString()
            })
          });
          writeLog(` -> Outreach webhook payload sent successfully.`, 'success');
        } catch (e) {
          writeLog(` -> Webhook sync failed: ${e.message}`, 'danger');
        }
      }
    }
    
    if (rowStatus) {
      rowStatus.innerText = 'Dispatched';
      rowStatus.style.background = 'rgba(52, 211, 153, 0.15)';
      rowStatus.style.color = '#34D399';
    }
    
    // Reschedule date to 3 days apart (for automation follow up only)
    lead.lastOutreachTimestamp = new Date().toLocaleString('en-US', {month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute:'2-digit'});
    lead.nextAutoFollowUp = getRelativeDateString(3);
    lead.status = 'contacted';
    
    dispatched++;
    progressBar.style.width = `${Math.round((dispatched / targetLeads.length) * 100)}%`;
    
    document.getElementById('outreach-metric-sent').innerText = dispatched;
    
    // Safety rate-limit delay
    if (i < targetLeads.length - 1 && !abortCampaign) {
      writeLog('Waiting 2 seconds to avoid rate-limiting bans...', 'info');
      await sleep(2000);
    }
    await sleep(500);
  }
  
  saveLeadsToStorage();
  
  if (!abortCampaign) {
    if (outreachErrorOccurred) {
      writeLog('Campaign finished with errors. Some direct dispatches failed. Check logs.', 'danger');
      showAppNotification('Campaign Complete with Errors', 'Dispatched with API errors. Check terminal logs.', 'warning');
    } else {
      writeLog('Campaign finished successfully! All auto follow-ups rolled over by 3 days.', 'success');
      showAppNotification('Campaign Finished', 'Selected leads processed successfully.', 'success');
    }
  }
  
  await sleep(1000);
  btn.disabled = false;
  btn.innerHTML = '<i data-lucide="play-circle" style="width: 18px; height: 18px; margin-right: 4px;"></i><span>Launch Automation Campaign</span>';
  document.getElementById('btnStopCampaign').style.display = 'none';
  lucide.createIcons();
  
  renderDashboard();
  renderOutreachQueue();
}

function populateFoundByFilter() {
  const filter = document.getElementById('filterFoundBy');
  if (!filter) return;
  
  const currentSelection = filter.value;
  const finders = [...new Set(getScopedLeads().map(l => l.foundBy).filter(name => name && name.trim()))];
  
  filter.innerHTML = '<option value="all">All Lead Finders</option>';
  
  finders.sort().forEach(finder => {
    const opt = document.createElement('option');
    opt.value = finder.toLowerCase();
    opt.innerText = finder;
    filter.appendChild(opt);
  });
  
  if (currentSelection && Array.from(filter.options).some(o => o.value === currentSelection)) {
    filter.value = currentSelection;
  }
}

// ----------------------------------------------------
// VOICE ASSISTANT & SPEECH RECOGNITION (UNIFIED)
// ----------------------------------------------------
let parsedResultTemp = {};

function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    console.warn("Speech recognition is not supported in this browser.");
    const status = document.getElementById('voiceStatusText');
    if (status) status.innerText = "Mic dictation not supported in this browser. Use Chrome/Edge/Safari.";
    const btn = document.getElementById('voiceRecordToggle');
    if (btn) btn.disabled = true;
    return;
  }

  speechRecognition = new SpeechRecognition();
  speechRecognition.continuous = true;
  speechRecognition.interimResults = true;
  speechRecognition.lang = 'en-US';

  speechRecognition.onstart = () => {
    isRecording = true;
    startRecordingUI();
  };

  speechRecognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
    if (event.error === 'not-allowed') {
      showAppNotification("Microphone Denied", "Please enable microphone permission in your browser address bar.", 'danger');
    } else {
      showAppNotification("Voice Capture Error", `Error: ${event.error}`, 'danger');
    }
    isRecording = false;
    stopRecordingUI();
  };

  speechRecognition.onend = () => {
    isRecording = false;
    stopRecordingUI();
  };

  speechRecognition.onresult = (event) => {
    let fullTranscript = '';
    for (let i = 0; i < event.results.length; ++i) {
      fullTranscript += event.results[i][0].transcript;
    }

    if (fullTranscript) {
      const box = document.getElementById('voiceTranscriptBox');
      if (box) {
        box.value = fullTranscript;
        box.classList.remove('transcript-placeholder');
      }
      
      // Perform Natural Language Parsing in Real Time on the full cumulative text!
      parseSpeechText(fullTranscript);
    }
  };
}

function startSpeechRecognition() {
  if (!speechRecognition) {
    initSpeechRecognition();
  }
  if (!speechRecognition) return;

  if (!isRecording) {
    try {
      speechRecognition.start();
    } catch (e) {
      console.error(e);
    }
  }
}

function stopSpeechRecognition() {
  if (speechRecognition && isRecording) {
    speechRecognition.stop();
  }
}

function abortSpeechRecognition() {
  if (speechRecognition) {
    speechRecognition.abort();
    isRecording = false;
    stopRecordingUI();
  }
}

function toggleSpeechRecognition() {
  if (isRecording) {
    stopSpeechRecognition();
  } else {
    startSpeechRecognition();
  }
}

function startRecordingUI() {
  const container = document.getElementById('voiceRecordingRow');
  const status = document.getElementById('voiceStatusText');
  const mic = document.getElementById('voiceMicIcon');

  if (container) container.classList.add('recording');
  if (status) status.innerText = "Listening... Speak lead details";
  if (mic) {
    mic.setAttribute('data-lucide', 'square'); // stop square icon
    lucide.createIcons();
  }
}

function stopRecordingUI() {
  const container = document.getElementById('voiceRecordingRow');
  const status = document.getElementById('voiceStatusText');
  const mic = document.getElementById('voiceMicIcon');

  if (container) container.classList.remove('recording');
  if (status) status.innerText = "Click microphone to speak";
  if (mic) {
    mic.setAttribute('data-lucide', 'mic'); // microphone icon
    lucide.createIcons();
  }
}

function resetVoiceParser() {
  parsedResultTemp = {
    name: '',
    designation: '',
    phone: '',
    email: '',
    source: 'Website',
    status: 'new',
    lastFollowUp: '',
    nextFollowUp: getRelativeDateString(1),
    foundBy: '',
    summary: ''
  };

  const box = document.getElementById('voiceTranscriptBox');
  if (box) {
    box.value = '';
    box.classList.add('transcript-placeholder');
  }
}

// ----------------------------------------------------
// FIELD-LEVEL VOICE DICTATION LOGIC
// ----------------------------------------------------
function toggleFieldVoice(fieldId) {
  // 1. If currently recording continuous speech, stop it first
  abortSpeechRecognition();

  // 2. If already recording this exact field, stop it
  if (activeFieldId === fieldId) {
    if (activeFieldRecognition) {
      activeFieldRecognition.stop();
    }
    return;
  }

  // 3. If another field is currently recording, abort it
  if (activeFieldRecognition) {
    activeFieldRecognition.abort();
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showAppNotification("Speech Recognition Not Supported", "Mic dictation is not supported in this browser.", "danger");
    return;
  }

  const inputEl = document.getElementById(fieldId);
  const btn = inputEl.nextElementSibling; // the .btn-input-voice button

  activeFieldId = fieldId;
  activeFieldRecognition = new SpeechRecognition();
  activeFieldRecognition.continuous = false; // Stop immediately after user pauses speaking
  activeFieldRecognition.interimResults = true;
  activeFieldRecognition.lang = 'en-US';

  activeFieldRecognition.onstart = () => {
    btn.classList.add('listening');
    btn.innerHTML = `<i data-lucide="mic-off"></i>`;
    lucide.createIcons();
    showAppNotification("Listening...", `Dictate value for active field.`, "success");
  };

  activeFieldRecognition.onresult = (event) => {
    let transcript = '';
    for (let i = 0; i < event.results.length; ++i) {
      transcript += event.results[i][0].transcript;
    }
    if (transcript) {
      let cleanedVal = transcript.trim();
      
      // Field Specific Formatters
      if (fieldId === 'leadName' || fieldId === 'leadDesignation' || fieldId === 'leadFoundBy' || fieldId === 'leadSourceCustom') {
        cleanedVal = capitalizeWords(cleanedVal);
      } else if (fieldId === 'leadPhone') {
        cleanedVal = cleanedVal.replace(/[^\d\s\+-]/g, '');
      } else if (fieldId === 'leadEmail') {
        cleanedVal = cleanedVal.toLowerCase()
                               .replace(/\s/g, '')
                               .replace(/\(at\)|\[at\]|\bat\b/g, '@')
                               .replace(/\(dot\)|\[dot\]|\bdot\b/g, '.');
      } else if (fieldId === 'leadLastFollowUp' || fieldId === 'leadNextFollowUp') {
        const valLower = cleanedVal.toLowerCase();
        if (datePatterns[valLower] !== undefined) {
          cleanedVal = getRelativeDateString(datePatterns[valLower]);
        } else {
          const inDaysMatch = valLower.match(/in\s+(\d+)\s+days/);
          if (inDaysMatch) {
            cleanedVal = getRelativeDateString(parseInt(inDaysMatch[1]));
          } else {
            const parsed = parseExactDate(cleanedVal);
            if (parsed) cleanedVal = parsed;
          }
        }
      } else if (fieldId === 'leadSource') {
        const sources = {
          'linkedin': 'LinkedIn',
          'website': 'Website',
          'web': 'Website',
          'referral': 'Referral',
          'referred': 'Referral',
          'email': 'Email Campaign',
          'campaign': 'Email Campaign',
          'cold': 'Cold Call',
          'call': 'Cold Call',
          'other': 'Other'
        };
        for (const [key, value] of Object.entries(sources)) {
          if (new RegExp(`\\b${key}\\b`, 'i').test(cleanedVal)) {
            cleanedVal = value;
            break;
          }
        }
      } else if (fieldId === 'leadStatus') {
        const statuses = {
          'new': 'new',
          'contacted': 'contacted',
          'in progress': 'inprogress',
          'progress': 'inprogress',
          'won': 'won',
          'win': 'won',
          'lost': 'lost',
          'lose': 'lost'
        };
        for (const [key, value] of Object.entries(statuses)) {
          if (new RegExp(`\\b${key}\\b`, 'i').test(cleanedVal)) {
            cleanedVal = value;
            break;
          }
        }
      }

      inputEl.value = cleanedVal;
      
      // Auto-toggle custom input if Lead Source is selected by voice
      if (fieldId === 'leadSource') {
        toggleCustomSourceInput();
      }
    }
  };

  activeFieldRecognition.onerror = (e) => {
    console.error("Field speech recognition error:", e.error);
    cleanupFieldVoice();
  };

  activeFieldRecognition.onend = () => {
    cleanupFieldVoice();
  };

  try {
    activeFieldRecognition.start();
  } catch (e) {
    console.error(e);
  }
}

function cleanupFieldVoice() {
  if (activeFieldId) {
    const inputEl = document.getElementById(activeFieldId);
    if (inputEl) {
      const btn = inputEl.nextElementSibling;
      if (btn) {
        btn.classList.remove('listening');
        btn.innerHTML = `<i data-lucide="mic"></i>`;
        lucide.createIcons();
      }
    }
  }
  activeFieldRecognition = null;
  activeFieldId = null;
}

// ----------------------------------------------------
// SMART NLP PARSER ENGINE (PURE JS)
// ----------------------------------------------------
function parseSpeechText(text) {
  // Reset temp results
  parsedResultTemp = {
    name: '',
    designation: '',
    phone: '',
    email: '',
    source: 'Website',
    status: 'new',
    lastFollowUp: '',
    nextFollowUp: getRelativeDateString(1),
    foundBy: '',
    summary: '',
    autoWhatsApp: true,
    autoEmail: true,
    autoAiCall: false
  };

  const cleanText = text.replace(/,/g, ' ').replace(/\s+/g, ' ');
  
  // 1. Parse Email: regex match
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const emailMatch = cleanText.match(emailRegex);
  if (emailMatch) {
    parsedResultTemp.email = emailMatch[0].trim();
  }

  // 2. Parse Phone Number: look for blocks of digits (typically 7-15 digits) after "phone" or just general digit strings
  const phoneMatch = cleanText.match(/(?:phone|mobile|number|call)\s*(?:is|at|of)?\s*(\+?[\d\s-]{7,15})/i);
  if (phoneMatch) {
    parsedResultTemp.phone = phoneMatch[1].replace(/\s/g, '').trim();
  } else {
    // Fallback: look for any 10-digit number block if "phone" keyword not explicitly matched
    const generalPhoneMatch = cleanText.match(/\b(?:\+?\d{1,3}[- ]?)?\d{10}\b/);
    if (generalPhoneMatch) {
      parsedResultTemp.phone = generalPhoneMatch[0].replace(/\s/g, '').trim();
    }
  }

  // Strip phone and email out of text for source/status matching to prevent false positives
  let sourceText = cleanText;
  if (parsedResultTemp.email) {
    sourceText = sourceText.replace(new RegExp(`(?:email\\s+)?${escapeRegExp(parsedResultTemp.email)}`, 'gi'), '');
  }
  if (parsedResultTemp.phone) {
    // Escape phone characters for regex safety
    sourceText = sourceText.replace(new RegExp(`(?:phone|mobile|number|call)?\\s*${escapeRegExp(parsedResultTemp.phone)}`, 'gi'), '');
    // Also try matching original phone string in case spaces were removed
    const rawPhoneDigits = phoneMatch ? phoneMatch[1] : '';
    if (rawPhoneDigits) {
      sourceText = sourceText.replace(new RegExp(`(?:phone|mobile|number|call)?\\s*${escapeRegExp(rawPhoneDigits.trim())}`, 'gi'), '');
    }
  }

  // 3. Parse Source: check for sources keywords
  const sources = {
    'linkedin': 'LinkedIn',
    'website': 'Website',
    'web': 'Website',
    'referral': 'Referral',
    'referred': 'Referral',
    'email': 'Email Campaign',
    'campaign': 'Email Campaign',
    'cold': 'Cold Call',
    'call': 'Cold Call'
  };
  
  for (const [key, value] of Object.entries(sources)) {
    const rx = new RegExp(`\\b${key}\\b`, 'i');
    if (rx.test(sourceText)) {
      parsedResultTemp.source = value;
      break;
    }
  }

  // 4. Parse Status: check status keywords (won, lost, inprogress checked first)
  const statuses = {
    'won': 'won',
    'win': 'won',
    'lost': 'lost',
    'lose': 'lost',
    'in progress': 'inprogress',
    'progress': 'inprogress',
    'contacted': 'contacted',
    'new': 'new'
  };

  for (const [key, value] of Object.entries(statuses)) {
    const rx = new RegExp(`\\b${key}\\b`, 'i');
    if (rx.test(sourceText)) {
      parsedResultTemp.status = value;
      break;
    }
  }

  // 5. Parse Name:
  // Usually starts after "lead", "name", "client", "contact"
  // E.g. "add lead Jane Cooper", "client John Doe", "name is Alice"
  const nameMatch = cleanText.match(/(?:lead|name(?: is)?|client|contact(?: named)?)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/);
  if (nameMatch) {
    parsedResultTemp.name = nameMatch[1].trim();
  } else {
    // Secondary fallback: find the first sequence of two capitalized words
    const capWordsMatch = cleanText.match(/\b([A-Z][a-zA-Z]+)\s+([A-Z][a-zA-Z]+)\b/);
    if (capWordsMatch) {
      parsedResultTemp.name = `${capWordsMatch[1]} ${capWordsMatch[2]}`.trim();
    } else {
      // Tertiary fallback: just take the words after "add" or "new"
      const addMatch = cleanText.match(/(?:add|new)\s+([a-zA-Z\s]+?)(?=\s+(?:designation|at|company|role|phone|email|source|status|last|next|$))/i);
      if (addMatch && addMatch[1].trim().split(/\s+/).length <= 3) {
        parsedResultTemp.name = capitalizeWords(addMatch[1].trim());
      }
    }
  }

  // 6. Parse Designation:
  // Matches "designation [role]" or "role [role]" or "working as [role]" or "as a [role]"
  const designMatch = cleanText.match(/(?:designation|role|title|working as|as a)\s+([a-zA-Z\s]+?)(?=\s+(?:phone|email|source|status|last|next|follow|$))/i);
  if (designMatch) {
    parsedResultTemp.designation = capitalizeWords(designMatch[1].trim());
  } else {
    // Check if company keyword "at [Company]" is present
    const atCompanyMatch = cleanText.match(/\bat\s+([A-Z][a-zA-Z]+)/);
    if (atCompanyMatch && parsedResultTemp.name) {
      // E.g. "CEO at Google" -> if name is parsed as John, and Google matches, let's look for "CEO"
      const textBeforeAt = cleanText.substring(0, cleanText.indexOf(atCompanyMatch[0])).trim();
      const words = textBeforeAt.split(/\s+/);
      const lastWord = words[words.length - 1];
      if (lastWord && lastWord[0] === lastWord[0].toUpperCase() && lastWord.toLowerCase() !== parsedResultTemp.name.split(/\s+/)[0].toLowerCase()) {
        parsedResultTemp.designation = `${lastWord} at ${atCompanyMatch[1]}`;
      }
    }
  }

  // 7. Parse Dates: relative follow-up descriptors
  // Scans for "next follow up tomorrow", "last follow up yesterday"
  const dateCaptureGroup = `(today|tomorrow|yesterday|next week|next monday|next tuesday|next wednesday|next thursday|next friday|in \\d+ days|in [a-z]+ days|[\\d/.-]+)`;

  // Check last follow up
  const lastFollowUpMatch = cleanText.match(new RegExp(`last\\s*(?:follow\\s*up)?\\s*(?:was|on)?\\s*${dateCaptureGroup}`, 'i'));
  if (lastFollowUpMatch) {
    const val = lastFollowUpMatch[1].toLowerCase();
    if (datePatterns[val] !== undefined) {
      parsedResultTemp.lastFollowUp = getRelativeDateString(datePatterns[val]);
    } else {
      const inDaysMatch = val.match(/in\s+(\d+)\s+days/);
      if (inDaysMatch) {
        parsedResultTemp.lastFollowUp = getRelativeDateString(parseInt(inDaysMatch[1]));
      } else {
        const parsedDate = parseExactDate(lastFollowUpMatch[1]);
        if (parsedDate) parsedResultTemp.lastFollowUp = parsedDate;
      }
    }
  }

  // Check next follow up
  const nextFollowUpMatch = cleanText.match(new RegExp(`next\\s*(?:follow\\s*up)?\\s*(?:is|on)?\\s*${dateCaptureGroup}`, 'i'));
  if (nextFollowUpMatch) {
    const val = nextFollowUpMatch[1].toLowerCase();
    if (datePatterns[val] !== undefined) {
      parsedResultTemp.nextFollowUp = getRelativeDateString(datePatterns[val]);
    } else {
      const inDaysMatch = val.match(/in\s+(\d+)\s+days/);
      if (inDaysMatch) {
        parsedResultTemp.nextFollowUp = getRelativeDateString(parseInt(inDaysMatch[1]));
      } else {
        const parsedDate = parseExactDate(nextFollowUpMatch[1]);
        if (parsedDate) parsedResultTemp.nextFollowUp = parsedDate;
      }
    }
  }

  // 8. Parse Finder (Found By)
  const foundByMatch = cleanText.match(/(?:found\s*by|finder|finder\s*is|by)\s+([a-zA-Z\s]+?)(?=\s+(?:phone|email|designation|source|status|last|next|summary|notes|opportunities|details|$))/i);
  if (foundByMatch) {
    parsedResultTemp.foundBy = capitalizeWords(foundByMatch[1].trim());
  }

  // 9. Parse Summary / Notes
  const summaryMatch = cleanText.match(/(?:summary|notes|note|opportunities|details)\s*(?:is|are)?\s+(.+)$/i);
  if (summaryMatch) {
    parsedResultTemp.summary = summaryMatch[1].trim();
  }

  // 10. Parse Auto Outreach Reminder Toggles
  if (/disable\s+auto\s+whatsapp/i.test(cleanText)) {
    parsedResultTemp.autoWhatsApp = false;
  } else if (/enable\s+auto\s+whatsapp|auto\s+whatsapp/i.test(cleanText)) {
    parsedResultTemp.autoWhatsApp = true;
  }
  
  if (/disable\s+auto\s+email/i.test(cleanText)) {
    parsedResultTemp.autoEmail = false;
  } else if (/enable\s+auto\s+email|auto\s+email/i.test(cleanText)) {
    parsedResultTemp.autoEmail = true;
  }
  
  if (/disable\s+(?:ai\s+calling|ai\s+call)/i.test(cleanText)) {
    parsedResultTemp.autoAiCall = false;
  } else if (/enable\s+(?:ai\s+calling|ai\s+call)|ai\s+calling|ai\s+call/i.test(cleanText)) {
    parsedResultTemp.autoAiCall = true;
  }

  updateFormFieldsFromVoice(parsedResultTemp);
}

// ----------------------------------------------------
// DYNAMIC INJECTION TO INPUTS WITH FOCUS PROTECTION
// ----------------------------------------------------
function updateFormFieldsFromVoice(parsed) {
  updateFieldIfActive('leadName', parsed.name);
  updateFieldIfActive('leadDesignation', parsed.designation);
  updateFieldIfActive('leadPhone', parsed.phone);
  updateFieldIfActive('leadEmail', parsed.email);
  
  updateSelectFieldIfActive('leadSource', parsed.source);
  updateSelectFieldIfActive('leadStatus', parsed.status);
  
  updateFieldIfActive('leadLastFollowUp', parsed.lastFollowUp);
  updateFieldIfActive('leadNextFollowUp', parsed.nextFollowUp);
  
  updateFieldIfActive('leadFoundBy', parsed.foundBy);
  updateFieldIfActive('leadSummary', parsed.summary);
  
  // Update checkboxes
  if (parsed.autoWhatsApp !== undefined) {
    const el = document.getElementById('leadAutoWhatsApp');
    if (el) el.checked = parsed.autoWhatsApp;
  }
  if (parsed.autoEmail !== undefined) {
    const el = document.getElementById('leadAutoEmail');
    if (el) el.checked = parsed.autoEmail;
  }
  if (parsed.autoAiCall !== undefined) {
    const el = document.getElementById('leadAutoAiCall');
    if (el) el.checked = parsed.autoAiCall;
  }
}

function updateFieldIfActive(elementId, value) {
  const el = document.getElementById(elementId);
  // Only update if element exists, value is present, and user is NOT currently focusing on it to type
  if (el && value && document.activeElement !== el) {
    el.value = value;
  }
}

function updateSelectFieldIfActive(elementId, value) {
  const el = document.getElementById(elementId);
  if (el && value && document.activeElement !== el) {
    for (let i = 0; i < el.options.length; i++) {
      if (el.options[i].value.toLowerCase() === value.toLowerCase() || el.options[i].text.toLowerCase() === value.toLowerCase()) {
        el.selectedIndex = i;
        break;
      }
    }
  }
}

// Regex escape helper
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Capitalize helper
function capitalizeWords(str) {
  return str.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.substring(1)).join(' ');
}

// Days till next weekday helper
function getDaysUntilWeekday(targetDayIndex) {
  const today = new Date();
  const currentDayIndex = today.getDay();
  let daysToAdd = targetDayIndex - currentDayIndex;
  if (daysToAdd <= 0) {
    daysToAdd += 7; // Next week's day
  }
  return daysToAdd;
}

// Try parsing exact dates from strings like "2026-06-30" or "06/30/2026"
function parseExactDate(str) {
  try {
    const parsed = Date.parse(str);
    if (!isNaN(parsed)) {
      return new Date(parsed).toISOString().split('T')[0];
    }
  } catch (e) {
    console.error("Exact date parsing failed for:", str);
  }
  return null;
}

// ----------------------------------------------------
// BULK CSV DRAG AND DROP HANDLERS
// ----------------------------------------------------
function toggleBulkImportSection() {
  const el = document.getElementById('bulkImportSection');
  if (el) {
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
  }
}

function triggerFileInput() {
  const el = document.getElementById('csvFileInput');
  if (el) el.click();
}

function handleDragOver(e) {
  e.preventDefault();
  const zone = document.getElementById('dragDropZone');
  if (zone) zone.classList.add('dragover');
}

function handleDragLeave(e) {
  e.preventDefault();
  const zone = document.getElementById('dragDropZone');
  if (zone) zone.classList.remove('dragover');
}

function handleDrop(e) {
  e.preventDefault();
  const zone = document.getElementById('dragDropZone');
  if (zone) zone.classList.remove('dragover');
  
  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
    processCSVFile(e.dataTransfer.files[0]);
  }
}

function handleFileSelect(e) {
  if (e.target.files && e.target.files[0]) {
    processCSVFile(e.target.files[0]);
  }
}

function processCSVFile(file) {
  if (!file.name.endsWith('.csv')) {
    showAppNotification('Invalid File Type', 'Please drop a valid .csv lead sheet.', 'danger');
    return;
  }
  
  const reader = new FileReader();
  reader.onload = function(evt) {
    parseCSVLeads(evt.target.result);
  };
  reader.readAsText(file);
}

function parseCSVLeads(csvText) {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim());
  if (lines.length <= 1) {
    showAppNotification('Import Failed', 'CSV sheet has no data rows.', 'danger');
    return;
  }
  
  // Parse header row
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());
  
  let newLeadsCount = 0;
  
  for (let i = 1; i < lines.length; i++) {
    const row = [];
    let insideQuote = false;
    let entries = [];
    let currentEntry = '';
    
    const line = lines[i];
    for (let charIndex = 0; charIndex < line.length; charIndex++) {
      const c = line[charIndex];
      if (c === '"') {
        insideQuote = !insideQuote;
      } else if (c === ',' && !insideQuote) {
        entries.push(currentEntry.trim());
        currentEntry = '';
      } else {
        currentEntry += c;
      }
    }
    entries.push(currentEntry.trim());
    
    // Map fields
    const name = entries[headers.indexOf('name')] || entries[0] || 'Unknown Import';
    const designation = entries[headers.indexOf('designation')] || entries[1] || '';
    const phone = entries[headers.indexOf('phone')] || entries[2] || '';
    const email = entries[headers.indexOf('email')] || entries[3] || '';
    const source = entries[headers.indexOf('source')] || entries[4] || 'Website';
    const status = entries[headers.indexOf('status')] || entries[5] || 'new';
    const lastFollowUp = entries[headers.indexOf('last follow up')] || entries[headers.indexOf('lastfollowup')] || entries[6] || getRelativeDateString(0);
    const nextFollowUp = entries[headers.indexOf('next follow up')] || entries[headers.indexOf('nextfollowup')] || entries[7] || getRelativeDateString(1);
    const foundBy = entries[headers.indexOf('found by')] || entries[headers.indexOf('foundby')] || entries[8] || '';
    const summary = entries[headers.indexOf('summary')] || entries[9] || '';
    
    const autoOutreach = entries[headers.indexOf('auto outreach')] || entries[headers.indexOf('autooutreach')] || 'true';
    const autoWhatsApp = entries[headers.indexOf('whatsapp')] !== -1 ? entries[headers.indexOf('whatsapp')] === 'true' : true;
    const autoEmail = entries[headers.indexOf('email')] !== -1 ? entries[headers.indexOf('email')] === 'true' : true;
    
    const newLead = {
      id: 'lead-' + (Date.now() + i),
      name,
      designation,
      phone,
      email,
      source,
      status: status.toLowerCase(),
      lastFollowUp,
      nextFollowUp,
      foundBy,
      summary,
      autoOutreachEnabled: autoOutreach === 'true',
      autoWhatsApp,
      autoEmail,
      autoAiCall: false,
      createdDate: getRelativeDateString(0)
    };
    
    leads.unshift(newLead);
    newLeadsCount++;
  }
  
  saveLeadsToStorage();
  showAppNotification('Import Complete', `Successfully imported ${newLeadsCount} leads.`, 'success');
  
  document.getElementById('bulkImportSection').style.display = 'none';
  renderDashboard();
  applyFilters();
}

function toggleAutoOutreachDetails() {
  const master = document.getElementById('leadAutoOutreachEnabled').checked;
  const container = document.getElementById('autoOutreachDetails');
  if (container) {
    if (master) {
      container.classList.remove('hidden');
    } else {
      container.classList.add('hidden');
    }
  }
}

async function enhanceReminderText() {
  const textarea = document.getElementById('leadReminderText');
  const enhanceSpan = document.getElementById('enhanceTextSpan');
  const btn = document.getElementById('btnEnhanceReminder');
  
  const rawText = textarea.value.trim();
  if (!rawText) {
    showAppNotification('Enhance Failed', 'Please write a draft reminder message first.', 'danger');
    return;
  }
  
  btn.disabled = true;
  enhanceSpan.innerText = 'AI Enhancing...';
  
  await sleep(1200); // Simulate AI response delay
  
  let enhanced = `Dear client, this is a polite reminder regarding our scheduled follow-up. Let us know a convenient time to speak.`;
  
  if (/price|cost|quote|discount/i.test(rawText)) {
    enhanced = `Dear Lead, this is a friendly follow-up regarding our discussion to review pricing options and project scopes. Let us know a convenient time to talk.`;
  } else if (/call|talk|discuss|phone/i.test(rawText)) {
    enhanced = `Hello! I would like to schedule a brief call to catch up on our latest project proposal. Looking forward to your response.`;
  } else if (/meet|meeting|schedule/i.test(rawText)) {
    enhanced = `Hi, checking in to coordinate calendar openings for our upcoming sync. Please feel free to share your availability.`;
  } else {
    enhanced = `Hello! Follow-up reminder: "${rawText}". We look forward to connecting with you shortly. Best regards.`;
  }
  
  textarea.value = enhanced;
  btn.disabled = false;
  enhanceSpan.innerText = 'AI Enhance Phrasing';
  showAppNotification('AI Enhanced', 'Message template enhanced professionally.', 'success');
}

// ----------------------------------------------------
// INDIVIDUAL USER OUTREACH DISPATCHER
// ----------------------------------------------------
async function runIndividualOutreach(leadId) {
  const isPaidMode = document.getElementById('campaignDispatchMode') ? (document.getElementById('campaignDispatchMode').value === 'paid') : false;
  if (isPaidMode) {
    const hasPaidPermission = currentUser.role === 'Super Admin' || (currentUser.permissions && currentUser.permissions.paidApiMode === true);
    if (!hasPaidPermission) {
      showAppNotification('Access Denied', 'Paid API Mode is not enabled for your account. Please contact your Super Admin.', 'danger');
      return;
    }
  }

  const lead = leads.find(l => l.id === leadId);
  if (!lead) {
    showAppNotification('Outreach Failed', 'Lead data not found.', 'danger');
    return;
  }
  
  const consoleLog = document.getElementById('outreachConsoleLog');
  const writeLog = (text, type = 'info') => {
    const line = document.createElement('div');
    line.className = `outreach-log-line ${type}`;
    line.innerText = `[${new Date().toLocaleTimeString()}] ${text}`;
    if (consoleLog) {
      consoleLog.appendChild(line);
      consoleLog.scrollTop = consoleLog.scrollHeight;
    }
  };
  
  // Read checkbox states from table queue if visible
  const waChecked = document.getElementById(`queue-wa-${lead.id}`) ? document.getElementById(`queue-wa-${lead.id}`).checked : (lead.autoWhatsApp !== false);
  const emailChecked = document.getElementById(`queue-email-${lead.id}`) ? document.getElementById(`queue-email-${lead.id}`).checked : (lead.autoEmail !== false);
  const callChecked = document.getElementById(`queue-call-${lead.id}`) ? document.getElementById(`queue-call-${lead.id}`).checked : (lead.autoAiCall === true);

  // If email channel is active, redirect to the composer wizard
  if (emailChecked && lead.email) {
    openEmailDraftModal([lead], isPaidMode);
    return;
  }
  
  const todayStr = new Date().toISOString().split('T')[0];
  writeLog(`Initializing individual outreach for ${lead.name}...`, 'info');
  await sleep(600);
  
  let triggers = [];
  let dispatchFailed = false;
  
  if (waChecked && lead.phone) {
    if (isPaidMode) {
      writeLog(` -> Dispatching Meta Cloud API template request to ${lead.phone}...`, 'info');
      try {
        await sendMetaWhatsAppAPI(lead);
        writeLog(`    [Meta API] Direct API dispatch completed successfully.`, 'success');
        triggers.push('WhatsApp');
      } catch (err) {
        writeLog(`    [Meta API Error] ${err.message}`, 'danger');
        dispatchFailed = true;
      }
    } else {
      writeLog(` -> Opening Click-to-Chat redirect window to ${lead.phone}...`, 'success');
      const waText = lead.reminderText || "Hi, this is a polite reminder regarding our scheduled follow-up. Let us know a convenient time to talk.";
      window.open(`https://wa.me/${lead.phone.replace(/\D/g, '')}?text=${encodeURIComponent(waText)}`, '_blank');
      triggers.push('WhatsApp');
    }
    await sleep(800);
  }
  
  if (emailChecked && lead.email) {
    if (isPaidMode) {
      writeLog(` -> Dispatching background Email API payload to ${lead.email}...`, 'info');
      try {
        const emailText = lead.reminderText || "Hi, this is a polite reminder regarding our scheduled follow-up. Let us know a convenient time to talk.";
        const emailRes = await fetch(`${API_BASE}/api/outreach/send-email`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            to: lead.email,
            subject: "Follow-up Reminder",
            body: emailText,
            tenantId: lead.tenantId
          })
        });
        if (!emailRes.ok) {
          const errData = await emailRes.json();
          throw new Error(errData.error || "Email dispatch endpoint failed");
        }
        writeLog(`    [Email API] Direct SMTP background dispatch completed successfully.`, 'success');
        triggers.push('Email');
      } catch (err) {
        writeLog(`    [Email API Error] ${err.message}`, 'danger');
        dispatchFailed = true;
      }
    } else {
      writeLog(` -> Opening Gmail Compose window to ${lead.email}...`, 'success');
      const emailText = lead.reminderText || "Hi, this is a polite reminder regarding our scheduled follow-up. Let us know a convenient time to talk.";
      window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(lead.email)}&su=${encodeURIComponent("Follow-up Reminder")}&body=${encodeURIComponent(emailText)}`, '_blank');
      triggers.push('Email');
    }
    await sleep(800);
  }
  
  if (callChecked && lead.phone) {
    writeLog(` -> Launching Free AI Voice Calling Studio for ${lead.phone}...`, 'info');
    try {
      await triggerBlandAiCall(lead);
      writeLog(`    [AI Call Studio] AI Voice Calling Studio active for ${lead.name}.`, 'success');
      triggers.push('AI Call');
    } catch(err) {
      writeLog(`    [AI Call Error] ${err.message}`, 'danger');
      dispatchFailed = true;
    }
    await sleep(1000);
  }
  
  // Webhook Sync Hook (ONLY in Paid Mode!)
  if (isPaidMode) {
    const webhookUrl = localStorage.getItem('google_sheets_url');
    if (webhookUrl && triggers.length > 0) {
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'auto_outreach',
            lead: lead,
            channels: triggers,
            timestamp: new Date().toISOString()
          })
        });
        writeLog(` -> Outreach webhook payload sent successfully.`, 'success');
      } catch (e) {
        writeLog(` -> Webhook sync failed: ${e.message}`, 'danger');
      }
    }
  }
  
  const rowStatus = document.getElementById(`queue-status-${lead.id}`);
  if (rowStatus) {
    rowStatus.innerText = 'Dispatched';
    rowStatus.style.background = 'rgba(52, 211, 153, 0.15)';
    rowStatus.style.color = '#34D399';
  }
  
  // Reschedule date to 3 days apart (for automation follow up only)
  lead.lastOutreachTimestamp = new Date().toLocaleString('en-US', {month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute:'2-digit'});
  lead.nextAutoFollowUp = getRelativeDateString(3);
  lead.status = 'contacted';
  lead.lastOutreachTimestamp = new Date().toLocaleString('en-US', {month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute:'2-digit'});
  
  saveLeadsToStorage();
  writeLog(`Individual outreach completed for ${lead.name}. Dates rolled over.`, 'success');
  if (dispatchFailed) {
    showAppNotification('Outreach Warning', `Direct dispatch to ${lead.name} failed. Check terminal logs.`, 'warning');
  } else {
    showAppNotification('Outreach Sent', `Automated outreach dispatched to ${lead.name}.`, 'success');
  }
  
  renderDashboard();
  renderOutreachQueue();
}

async function sendMetaWhatsAppAPI(lead) {
  const token = localStorage.getItem('meta_access_token');
  const phoneId = localStorage.getItem('meta_phone_number_id');
  const template = localStorage.getItem('meta_template_name');
  const lang = localStorage.getItem('meta_language_code') || 'en_US';
  
  if (!token || !phoneId || !template) {
    throw new Error("Missing Meta Credentials (Token, Phone Number ID, or Template Name) in Settings.");
  }
  
  const url = `https://graph.facebook.com/v19.0/${phoneId}/messages`;
  const formattedPhone = lead.phone.replace(/\D/g, '');
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: formattedPhone,
      type: "template",
      template: {
        name: template,
        language: { code: lang },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: lead.name },
              { type: "text", text: lead.reminderText || "Just a reminder checking in." }
            ]
          }
        ]
      }
    })
  });
  
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ? data.error.message : "HTTP Error communicating with Meta APIs.");
  }
  return data;
}

async function triggerBlandAiCall(lead) {
  const blandKey = localStorage.getItem('bland_ai_key');
  const blandVoice = localStorage.getItem('bland_voice_id') || 'baseline';
  const phone = lead.phone ? lead.phone.replace(/\D/g, '') : '';
  
  if (!phone) {
    throw new Error("Lead has no registered phone number.");
  }

  if (blandKey) {
    try {
      const res = await fetch('https://api.bland.ai/v1/calls', {
        method: 'POST',
        headers: {
          'authorization': blandKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phone_number: '+' + phone,
          task: `You are an AI assistant for NeoGenCode CRM calling ${lead.name}. Script: ${lead.reminderText || 'Checking in on our scheduled follow-up.'}`,
          voice: blandVoice,
          record: true
        })
      });
      if (!res.ok) throw new Error(await res.text());
      return await res.json();
    } catch(err) {
      console.warn("Bland.ai API call failed, falling back to free browser AI voice studio:", err);
      window.launchFreeAiCallModal(lead);
      return { status: 'free_ai_call_launched' };
    }
  } else {
    // 100% FREE Browser AI Voice Studio
    window.launchFreeAiCallModal(lead);
    setTimeout(() => {
      window.startFreeAiCallSpeech(lead.name);
    }, 400);
    return { status: 'free_ai_call_launched' };
  }
}

let currentSpeechUtterance = null;
let currentSpeechRecognition = null;

window.launchFreeAiCallModal = function(leadIdOrObj) {
  let lead = typeof leadIdOrObj === 'object' ? leadIdOrObj : (leads.find(l => String(l.id) === String(leadIdOrObj)) || recruitmentCandidates.find(c => String(c.id) === String(leadIdOrObj)));
  if (!lead) {
    showAppNotification("Error", "Lead/Candidate details not found.", "warning");
    return;
  }
  
  const overlayId = 'freeAiCallModalOverlay';
  let modalOverlay = document.getElementById(overlayId);
  if (!modalOverlay) {
    modalOverlay = document.createElement('div');
    modalOverlay.id = overlayId;
    modalOverlay.className = 'modal-overlay';
    modalOverlay.style.zIndex = '100005';
    modalOverlay.style.display = 'none';
    modalOverlay.style.alignItems = 'center';
    modalOverlay.style.justifyContent = 'center';
    modalOverlay.style.position = 'fixed';
    modalOverlay.style.top = '0';
    modalOverlay.style.left = '0';
    modalOverlay.style.width = '100%';
    modalOverlay.style.height = '100%';
    modalOverlay.style.background = 'rgba(0,0,0,0.7)';
    document.body.appendChild(modalOverlay);
  }
  
  const phoneFormatted = lead.phone ? lead.phone.replace(/\D/g, '') : '';
  const scriptText = lead.reminderText || `Hi ${lead.name}, this is NeoGenCode AI assistant calling regarding ${lead.company || 'our services'}. We wanted to check if you have a few minutes to discuss next steps?`;

  modalOverlay.innerHTML = `
    <div class="settings-card" style="width: 520px; max-width: 95%; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 14px; padding: 1.5rem; box-shadow: 0 20px 30px rgba(0,0,0,0.6); display: flex; flex-direction: column; gap: 1.2rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem;">
        <h3 style="font-size: 1.05rem; font-weight: 700; color: var(--text-primary); margin: 0; display: flex; align-items: center; gap: 0.5rem; font-family: 'Outfit';">
          <i data-lucide="phone-call" style="color: #34D399; width: 22px; height: 22px;"></i> Free AI Voice Calling Studio
        </h3>
        <button onclick="window.stopFreeAiCallSpeech(); document.getElementById('${overlayId}').style.display='none';" style="background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 4px;">
          <i data-lucide="x" style="width: 20px; height: 20px;"></i>
        </button>
      </div>

      <!-- Lead Summary Header -->
      <div style="background: rgba(52, 211, 153, 0.06); border: 1px solid rgba(52, 211, 153, 0.2); padding: 0.75rem 1rem; border-radius: 10px; display: flex; align-items: center; justify-content: space-between;">
        <div>
          <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-primary);">${escapeHTML(lead.name)}</div>
          <div style="font-size: 0.78rem; color: var(--text-muted); font-weight: 500;">Phone: ${escapeHTML(lead.phone || 'No phone registered')} | Company: ${escapeHTML(lead.company || 'N/A')}</div>
        </div>
        <span id="aiCallStatusBadge" class="badge" style="background: rgba(52, 211, 153, 0.2); color: #34D399; font-size: 0.72rem; padding: 0.35rem 0.65rem;">Ready</span>
      </div>

      <!-- AI Call Script -->
      <div>
        <label style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700; display: block; margin-bottom: 0.35rem;">Personalized AI Call Speech Script</label>
        <textarea id="aiCallScriptText" class="form-control" style="font-size: 0.8rem; min-height: 80px; background: var(--bg-primary); line-height: 1.4;">${escapeHTML(scriptText)}</textarea>
      </div>

      <!-- Live Voice Call Audio Visualizer & Transcript -->
      <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 10px; padding: 0.85rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <span style="font-size: 0.72rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Live Audio & Speech Transcript</span>
          <div id="aiCallWaveform" style="display: flex; gap: 3px; align-items: center; height: 16px;">
            <span style="width: 3px; height: 6px; background: #34D399; border-radius: 2px;"></span>
            <span style="width: 3px; height: 12px; background: #34D399; border-radius: 2px;"></span>
            <span style="width: 3px; height: 16px; background: #34D399; border-radius: 2px;"></span>
            <span style="width: 3px; height: 8px; background: #34D399; border-radius: 2px;"></span>
          </div>
        </div>
        <div id="aiCallTranscriptLog" style="font-size: 0.78rem; font-family: monospace; color: var(--text-secondary); max-height: 110px; overflow-y: auto; line-height: 1.4; white-space: pre-wrap;">
[System Ready] Click 'Start AI Voice Call' to initiate natural AI voice playback and microphone speech recognition.
        </div>
      </div>

      <!-- Dialing & Audio Options -->
      <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; flex-wrap: wrap; border-top: 1px solid var(--border-color); padding-top: 0.85rem;">
        <div style="display: flex; gap: 0.4rem;">
          ${phoneFormatted ? `<a href="tel:+${phoneFormatted}" class="btn-secondary" style="font-size: 0.75rem; padding: 0.4rem 0.75rem; text-decoration: none; display: inline-flex; align-items: center; gap: 0.3rem;" title="Dial directly via phone/Facetime/Skype">
            <i data-lucide="phone" style="width: 13px; height: 13px; color: var(--accent-blue);"></i> Direct Call
          </a>` : ''}
          ${phoneFormatted ? `<a href="https://wa.me/${phoneFormatted}" target="_blank" class="btn-secondary" style="font-size: 0.75rem; padding: 0.4rem 0.75rem; text-decoration: none; display: inline-flex; align-items: center; gap: 0.3rem;" title="Open WhatsApp Call">
            <i data-lucide="message-square" style="width: 13px; height: 13px; color: #25D366;"></i> WhatsApp
          </a>` : ''}
        </div>

        <div style="display: flex; gap: 0.5rem;">
          <button id="btnStopAiCall" onclick="window.stopFreeAiCallSpeech()" class="btn-secondary" style="font-size: 0.78rem; padding: 0.45rem 0.85rem; color: #EF4444; border-color: rgba(239, 68, 68, 0.4); display: none;">
            <i data-lucide="square" style="width: 13px; height: 13px;"></i> End Call
          </button>
          <button id="btnStartAiCall" onclick="window.startFreeAiCallSpeech('${escapeHTML(lead.name)}')" class="btn-primary" style="font-size: 0.78rem; padding: 0.45rem 1rem; background: #10B981; border-color: #10B981; display: inline-flex; align-items: center; gap: 0.35rem;">
            <i data-lucide="volume-2" style="width: 14px; height: 14px;"></i> Start AI Voice Call
          </button>
        </div>
      </div>
    </div>
  `;
  
  modalOverlay.style.display = 'flex';
  lucide.createIcons();
};

window.startFreeAiCallSpeech = function(leadName) {
  const textInput = document.getElementById('aiCallScriptText');
  const text = textInput ? textInput.value : `Hi ${leadName}, this is NeoGenCode AI assistant calling.`;
  const transcriptLog = document.getElementById('aiCallTranscriptLog');
  const statusBadge = document.getElementById('aiCallStatusBadge');
  const btnStart = document.getElementById('btnStartAiCall');
  const btnStop = document.getElementById('btnStopAiCall');

  if (!('speechSynthesis' in window)) {
    showAppNotification("Speech Not Supported", "Your browser does not support Web Speech Synthesis.", "warning");
    return;
  }

  window.stopFreeAiCallSpeech();

  if (statusBadge) {
    statusBadge.innerText = 'Calling...';
    statusBadge.style.background = 'rgba(16, 185, 129, 0.25)';
    statusBadge.style.color = '#10B981';
  }

  if (btnStart) btnStart.style.display = 'none';
  if (btnStop) btnStop.style.display = 'inline-flex';

  if (transcriptLog) {
    transcriptLog.innerText = `[${new Date().toLocaleTimeString()}] 📞 Dialing ${leadName}...\n[${new Date().toLocaleTimeString()}] 🤖 AI Assistant Speaking:\n"${text}"\n`;
  }

  const synth = window.speechSynthesis;
  if (synth.speaking || synth.pending) {
    synth.cancel();
  }

  currentSpeechUtterance = new SpeechSynthesisUtterance(text);
  currentSpeechUtterance.rate = 0.95;
  currentSpeechUtterance.pitch = 1.0;
  currentSpeechUtterance.lang = 'en-US';

  let voices = synth.getVoices();
  const applyVoice = (vList) => {
    const naturalVoice = vList.find(v => (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Karen') || v.name.includes('Daniel')) && v.lang.startsWith('en')) || vList[0];
    if (naturalVoice) currentSpeechUtterance.voice = naturalVoice;
  };

  if (!voices || voices.length === 0) {
    synth.onvoiceschanged = () => {
      applyVoice(synth.getVoices());
    };
  } else {
    applyVoice(voices);
  }

  currentSpeechUtterance.onend = function() {
    if (transcriptLog) {
      transcriptLog.innerText += `\n[${new Date().toLocaleTimeString()}] 🤖 AI Statement Completed. Listening for response...`;
    }
    if (statusBadge) {
      statusBadge.innerText = 'Listening...';
      statusBadge.style.background = 'rgba(59, 130, 246, 0.2)';
      statusBadge.style.color = '#60A5FA';
    }

    window.startSpeechRecognitionForCall();
  };

  currentSpeechUtterance.onerror = function(e) {
    console.error("SpeechSynthesis error:", e);
    if (statusBadge) {
      statusBadge.innerText = 'Call Ended';
      statusBadge.style.background = 'rgba(239, 68, 68, 0.2)';
      statusBadge.style.color = '#EF4444';
    }
    if (btnStart) btnStart.style.display = 'inline-flex';
    if (btnStop) btnStop.style.display = 'none';
  };

  synth.speak(currentSpeechUtterance);
};

window.stopFreeAiCallSpeech = function() {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  if (currentSpeechRecognition) {
    try { currentSpeechRecognition.stop(); } catch(e) {}
    currentSpeechRecognition = null;
  }
  const statusBadge = document.getElementById('aiCallStatusBadge');
  const btnStart = document.getElementById('btnStartAiCall');
  const btnStop = document.getElementById('btnStopAiCall');
  if (statusBadge) {
    statusBadge.innerText = 'Ended';
    statusBadge.style.background = 'rgba(255,255,255,0.08)';
    statusBadge.style.color = 'var(--text-muted)';
  }
  if (btnStart) btnStart.style.display = 'inline-flex';
  if (btnStop) btnStop.style.display = 'none';
};

window.startSpeechRecognitionForCall = function() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  try {
    currentSpeechRecognition = new SpeechRecognition();
    currentSpeechRecognition.continuous = false;
    currentSpeechRecognition.interimResults = false;
    currentSpeechRecognition.lang = 'en-US';

    currentSpeechRecognition.onresult = function(event) {
      const userText = event.results[0][0].transcript;
      const transcriptLog = document.getElementById('aiCallTranscriptLog');
      if (transcriptLog) {
        transcriptLog.innerText += `\n[${new Date().toLocaleTimeString()}] 👤 Recipient Spoke:\n"${userText}"\n`;
        transcriptLog.innerText += `\n[${new Date().toLocaleTimeString()}] 🤖 AI Assistant: "Thank you! Response logged in CRM."`;
        transcriptLog.scrollTop = transcriptLog.scrollHeight;
      }
    };

    currentSpeechRecognition.start();
  } catch(e) {
    console.error("Speech recognition error:", e);
  }
};

function editReminderInline(leadId) {
  const previewDiv = document.getElementById(`reminder-preview-${leadId}`);
  const editBtn = document.getElementById(`edit-reminder-btn-${leadId}`);
  const lead = leads.find(l => l.id === leadId);
  if (!previewDiv || !lead) return;
  
  const currentText = lead.reminderText || "Just a reminder checking in.";
  
  // Replace preview div with inline text editor elements
  previewDiv.innerHTML = `
    <div style="display: flex; gap: 0.35rem; width: 100%; margin-top: 0.15rem; max-width: 250px; align-items: center;">
      <textarea id="inline-reminder-input-${leadId}" class="form-control" rows="2" style="font-size: 0.72rem; padding: 0.25rem; height: auto; background-color: rgba(15,23,42,0.6); color: var(--text-primary); border-color: rgba(192, 132, 252, 0.4);">${currentText}</textarea>
      <div style="display: flex; flex-direction: column; gap: 0.2rem;">
        <button type="button" class="btn-primary" onclick="saveReminderInline('${leadId}')" style="padding: 0.2rem 0.35rem; font-size: 0.65rem; border-radius: 4px; display: flex; align-items: center; justify-content: center; height: 20px; width: 20px;" title="Save Message">
          <i data-lucide="check" style="width: 10px; height: 10px;"></i>
        </button>
        <button type="button" class="btn-secondary" onclick="renderOutreachQueue()" style="padding: 0.2rem 0.35rem; font-size: 0.65rem; border-radius: 4px; display: flex; align-items: center; justify-content: center; height: 20px; width: 20px;" title="Cancel">
          <i data-lucide="x" style="width: 10px; height: 10px;"></i>
        </button>
      </div>
    </div>
  `;
  
  if (editBtn) editBtn.style.display = 'none';
  lucide.createIcons();
}

function saveReminderInline(leadId) {
  const input = document.getElementById(`inline-reminder-input-${leadId}`);
  const lead = leads.find(l => l.id === leadId);
  if (input && lead) {
    lead.reminderText = input.value.trim();
    saveLeadsToStorage();
    showAppNotification('Message Updated', 'Custom reminder message template updated.', 'success');
  }
  renderOutreachQueue();
}

// ----------------------------------------------------
// DIRECTORY LEADS MULTI-SELECT & BULK ACTIONS
// ----------------------------------------------------
function toggleAllDirectoryLeads(isChecked) {
  const rowCheckboxes = document.querySelectorAll('.directory-row-select');
  rowCheckboxes.forEach(cb => cb.checked = isChecked);
  updateDirectoryBulkToolbar();
}

function updateDirectoryBulkToolbar() {
  const checkedCheckboxes = document.querySelectorAll('.directory-row-select:checked');
  const toolbar = document.getElementById('directoryBulkActionBar');
  const countSpan = document.getElementById('selectedLeadsCount');
  
  if (toolbar && countSpan) {
    if (checkedCheckboxes.length > 0) {
      toolbar.classList.remove('hidden');
      countSpan.innerText = checkedCheckboxes.length;
    } else {
      toolbar.classList.add('hidden');
    }
  }
}

function triggerBulkDelete() {
  const checkedCheckboxes = Array.from(document.querySelectorAll('.directory-row-select:checked'));
  if (checkedCheckboxes.length === 0) return;
  
  showAppPrompt(
    "Enter Security PIN",
    `Enter security PIN to delete ${checkedCheckboxes.length} selected leads:`,
    "",
    (pin) => {
      const expectedPin = (companyInfo && companyInfo.deleteLeadPin) ? companyInfo.deleteLeadPin : '0000';
      if (pin !== expectedPin) {
        showAppNotification('Access Denied', 'Incorrect PIN. Deletion cancelled.', 'danger');
        return;
      }
      
      const idsToDelete = checkedCheckboxes.map(cb => cb.getAttribute('data-id'));
      leads = leads.filter(l => !idsToDelete.includes(l.id));
      saveLeadsToStorage();
      showAppNotification('Leads Deleted', `Successfully deleted ${idsToDelete.length} leads.`, 'danger');
      
      // Reset select all checkbox in header
      const selectAllCb = document.getElementById('selectAllDirectory');
      if (selectAllCb) selectAllCb.checked = false;
      
      renderDashboard();
      applyFilters();
      
      // Auto-sync
      if (localStorage.getItem('google_sheets_url')) {
        syncToGoogleSheets();
      }
    }
  );
}

function openBroadcastModal(type) {
  const modal = document.getElementById('broadcastModalOverlay');
  const title = document.getElementById('broadcastModalTitle');
  const label = document.getElementById('broadcastMessageLabel');
  const text = document.getElementById('broadcastMessageText');
  const typeInput = document.getElementById('broadcastType');
  
  if (modal && title && label && text && typeInput) {
    typeInput.value = type;
    text.value = '';
    if (type === 'whatsapp') {
      title.innerText = 'Send Bulk WhatsApp Broadcast';
      label.innerText = 'Compose WhatsApp Message (Supports any language)';
      text.placeholder = 'Type your broadcast message (e.g. Wishing you a happy festival season!)...';
    } else {
      title.innerText = 'Send Bulk Email Broadcast';
      label.innerText = 'Compose Email Message (Supports any language)';
      text.placeholder = 'Type your email body (e.g. Dear client, wishing you and your team a happy holiday!)...';
    }
    modal.classList.add('active');
  }
}

function closeBroadcastModal() {
  const modal = document.getElementById('broadcastModalOverlay');
  if (modal) modal.classList.remove('active');
}

async function executeBulkBroadcast(event) {
  event.preventDefault();
  const type = document.getElementById('broadcastType').value;
  const msgText = document.getElementById('broadcastMessageText').value.trim();
  
  const checkedCheckboxes = Array.from(document.querySelectorAll('.directory-row-select:checked'));
  if (checkedCheckboxes.length === 0) {
    showAppNotification('No Selection', 'Please select leads to broadcast to.', 'warning');
    return;
  }
  
  const selectedIds = checkedCheckboxes.map(cb => cb.getAttribute('data-id'));
  const targetLeads = leads.filter(l => selectedIds.includes(l.id));
  
  closeBroadcastModal();
  showAppNotification('Broadcast Started', `Sending to ${targetLeads.length} leads...`, 'info');
  
  const isPaidMode = document.getElementById('campaignDispatchMode') ? (document.getElementById('campaignDispatchMode').value === 'paid') : false;
  
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < targetLeads.length; i++) {
    const lead = targetLeads[i];
    let triggered = false;
    
    if (type === 'whatsapp' && lead.phone) {
      if (isPaidMode) {
        try {
          const originalReminder = lead.reminderText;
          lead.reminderText = msgText;
          await sendMetaWhatsAppAPI(lead);
          lead.reminderText = originalReminder;
          successCount++;
          triggered = true;
        } catch (err) {
          console.error(err);
          failCount++;
        }
      } else {
        window.open(`https://wa.me/${lead.phone.replace(/\D/g, '')}?text=${encodeURIComponent(msgText)}`, '_blank');
        successCount++;
        triggered = true;
      }
    } else if (type === 'email' && lead.email) {
      if (isPaidMode) {
        const webhookUrl = localStorage.getItem('google_sheets_url');
        if (webhookUrl) {
          try {
            await fetch(webhookUrl, {
              method: 'POST',
              mode: 'no-cors',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                event: 'auto_outreach',
                lead: { ...lead, reminderText: msgText },
                channels: ['Email'],
                timestamp: new Date().toISOString()
              })
            });
            successCount++;
            triggered = true;
          } catch (err) {
            failCount++;
          }
        } else {
          failCount++;
        }
      } else {
        window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(lead.email)}&su=${encodeURIComponent("Greetings")}&body=${encodeURIComponent(msgText)}`, '_blank');
        successCount++;
        triggered = true;
      }
    }
    
    if (triggered) {
      lead.lastOutreachTimestamp = new Date().toLocaleString('en-US', {month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute:'2-digit'});
      lead.nextAutoFollowUp = getRelativeDateString(3);
    }
    
    await sleep(800);
  }
  
  saveLeadsToStorage();
  
  if (failCount > 0) {
    showAppNotification('Broadcast Finished', `Dispatched successfully to ${successCount} leads. ${failCount} failed.`, 'warning');
  } else {
    showAppNotification('Broadcast Complete', `Broadcast successfully sent to all ${successCount} leads!`, 'success');
  }
  
  const selectAllCb = document.getElementById('selectAllDirectory');
  if (selectAllCb) selectAllCb.checked = false;
  toggleAllDirectoryLeads(false);
  
  renderDashboard();
  applyFilters();
}

function toggleTheme() {
  const isLight = document.body.classList.toggle('light-theme');
  const icon = document.getElementById('theme-toggle-icon');
  
  if (isLight) {
    localStorage.setItem('crm_theme', 'light');
    if (icon) {
      icon.setAttribute('data-lucide', 'moon');
      icon.style.color = 'var(--accent-blue)';
    }
  } else {
    localStorage.setItem('crm_theme', 'dark');
    if (icon) {
      icon.setAttribute('data-lucide', 'sun');
      icon.style.color = 'var(--accent-purple)';
    }
  }
  lucide.createIcons();
}

async function initiateMobileCall(leadId) {
  const lead = leads.find(l => l.id === leadId);
  if (!lead || !lead.phone) return;
  
  showAppNotification('Syncing Call...', `Sending call command to Mobile Companion App for ${lead.name}`, 'info');

  try {
    const res = await fetch(`${API_BASE}/api/call-sync/dispatch`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        leadId: lead.id,
        leadName: lead.name,
        phone: lead.phone
      })
    });

    if (res.ok) {
      showAppNotification('📲 Call Dispatched', `Call command sent to your logged-in Mobile Companion App! Phone will dial ${lead.name} (${lead.phone}).`, 'success');
      
      lead.lastOutreachTimestamp = new Date().toLocaleString('en-US', {month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute:'2-digit'});
      saveLeadsToStorage();
      renderLeadsList();
    } else {
      window.open(`tel:${lead.phone.replace(/\D/g, '')}`, '_self');
    }
  } catch (e) {
    console.error('Call Dispatch Error:', e);
    window.open(`tel:${lead.phone.replace(/\D/g, '')}`, '_self');
  }
}

// ==========================================================================
// TELECRM UPGRADES: TEAM, KANBAN PIPELINE, & LEADERBOARD LOGIC
// ==========================================================================

// Active Agents State
let agents = JSON.parse(localStorage.getItem('crm_agents')) || [
  { id: 'agent-admin-a', name: 'Alex (CEO)', email: 'alex@abc.com', whatsapp: '+919876543210', tenantId: 'tenant-abc', password: '1234', role: 'Manager' },
  { id: 'agent-sarah-a', name: 'Sarah (Sales)', email: 'sarah@abc.com', whatsapp: '+919988776655', tenantId: 'tenant-abc', password: '1234', role: 'Sales Agent' },
  { id: 'agent-admin-b', name: 'Bob (CEO)', email: 'bob@xyz.com', whatsapp: '+919876540000', tenantId: 'tenant-xyz', password: '1234', role: 'Manager' }
];

// Populate Agent selection elements on startup or list updates
function populateAgentDropdowns() {
  const formSelect = document.getElementById('leadAssignedAgent');
  const bulkSelect = document.getElementById('bulkAgentSelect');
  
  const targetTenantId = currentUser.role === 'Super Admin' ? activeTenantId : currentUser.tenantId;
  const filteredAgents = targetTenantId === 'all' ? agents : agents.filter(a => a.tenantId === targetTenantId);
  
  if (formSelect) {
    // Retain first default option
    formSelect.innerHTML = '<option value="">Unassigned</option>';
    filteredAgents.forEach(agent => {
      formSelect.innerHTML += `<option value="${agent.name}">${agent.name}</option>`;
    });
  }
  
  if (bulkSelect) {
    bulkSelect.innerHTML = '<option value="">Assign Agent...</option>';
    filteredAgents.forEach(agent => {
      bulkSelect.innerHTML += `<option value="${agent.name}">${agent.name}</option>`;
    });
  }

  // Populate Agent Organization dropdown
  const orgSelect = document.getElementById('agentOrganization');
  if (orgSelect) {
    orgSelect.innerHTML = '';
    if (currentUser.role === 'Super Admin') {
      companies.forEach(c => {
        orgSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`;
      });
      if (activeTenantId !== 'all') {
        orgSelect.value = activeTenantId;
      }
    } else {
      const orgName = currentUser.organization || 'Company A';
      orgSelect.innerHTML = `<option value="${currentUser.tenantId}">${orgName}</option>`;
      orgSelect.value = currentUser.tenantId;
    }
  }
}

// Add/Save Agents
async function handleAgentSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('agentName').value.trim();
  const email = document.getElementById('agentEmail').value.trim();
  const whatsapp = document.getElementById('agentWhatsapp').value.trim();
  const role = document.getElementById('agentRole').value;
  
  const tenantId = document.getElementById('agentOrganization').value;
  const password = document.getElementById('agentPassword') ? document.getElementById('agentPassword').value.trim() : '1234';
  
  if (!name || !email || !whatsapp) {
    showAppNotification('Validation Error', 'Name, Email, and WhatsApp number are required.', 'warning');
    return;
  }

  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,}$/;
  if (!passwordRegex.test(password)) {
    showAppNotification('Validation Error', 'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character.', 'warning');
    return;
  }

  const cleanWhatsapp = whatsapp.replace(/[^0-9+]/g, '');
  if (cleanWhatsapp.length < 10 || cleanWhatsapp.length > 15) {
    showAppNotification('Validation Error', 'WhatsApp number must be between 10 and 15 digits.', 'warning');
    return;
  }

  const isSuperAdmin = currentUser.role === 'Super Admin';
  const isCEO = currentUser.ceoEmail && currentUser.email.toLowerCase() === currentUser.ceoEmail.toLowerCase();
  const hasAddAgentPermission = currentUser.permissions && currentUser.permissions.addAgent === true;
  
  if (!isSuperAdmin && !isCEO && !hasAddAgentPermission) {
    showAppAlert("Access Restricted", "You do not have permission to register new agents.");
    return;
  }
  
  // Plan limits check
  const currentAgentsCount = agents.filter(a => a.tenantId === tenantId).length;
  let limit = 5;
  if (isSuperAdmin) {
    const activeCompany = companies.find(c => c.id === tenantId);
    if (activeCompany) {
      if (activeCompany.memberLimit !== undefined && activeCompany.memberLimit !== null) {
        limit = Number(activeCompany.memberLimit);
      } else if (activeCompany.plan === 'Free') {
        limit = 2;
      } else if (activeCompany.plan === 'Starter') {
        limit = 5;
      } else if (activeCompany.plan === 'Enterprise') {
        limit = 50;
      }
    }
  } else {
    if (currentUser.memberLimit !== undefined && currentUser.memberLimit !== null) {
      limit = Number(currentUser.memberLimit);
    } else if (currentUser.plan === 'Free') {
      limit = 2;
    } else if (currentUser.plan === 'Starter') {
      limit = 5;
    } else if (currentUser.plan === 'Enterprise') {
      limit = 50;
    }
  }
  
  if (!isSuperAdmin && currentAgentsCount >= limit) {
    showAppAlert(
      "Limit Reached",
      "Please upgrade your plan or connect with neogencode super admin team: info@neogencode.com"
    );
    return;
  }

  const agentData = {
    name,
    email,
    whatsapp,
    role,
    password,
    tenantId,
    permissions: {
      linkedinExtractor: true,
      whatsappApi: true,
      deleteUser: role === 'Manager',
      viewAllLeads: document.getElementById('permViewAllLeads').checked,
      addLeadClient: document.getElementById('permAddLeadClient').checked,
      addLeadCandidate: document.getElementById('permAddLeadCandidate').checked,
      addJobPost: document.getElementById('permAddJobPost').checked,
      paidApiMode: false,
      addAgent: false,
      hideDashboard: document.getElementById('permHideDashboard').checked,
      hideLeads: document.getElementById('permHideLeads').checked,
      hidePipeline: document.getElementById('permHidePipeline').checked,
      hideReminders: document.getElementById('permHideReminders').checked,
      hideOutreach: document.getElementById('permHideOutreach').checked,
      hideClients: document.getElementById('permHideClients').checked,
      hideSignals: document.getElementById('permHideSignals').checked,
      hideRecruitment: document.getElementById('permHideRecruitment').checked,
      hideInterviews: document.getElementById('permHideInterviews').checked,
      hideTeam: document.getElementById('permHideTeam').checked,
      hideBilling: document.getElementById('permHideBilling').checked,
      hideSettings: document.getElementById('permHideSettings').checked
    }
  };
  
  try {
    showGlobalLoading("Registering new team member...");
    const response = await fetch(`${API_BASE}/api/agents`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(agentData)
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || "Failed to register agent");
    }

    showAppNotification('Agent Registered', `${name} has been added to the sales team.`, 'success');
    await initRemoteDatabase();
  } catch (err) {
    showAppNotification('Registration Failed', err.message, 'danger');
  } finally {
    const form = document.getElementById('agentForm');
    if (form) {
      form.reset();
      const orgInput = document.getElementById('agentOrganization');
      if (orgInput) {
        if (currentUser.role === 'Super Admin') {
          orgInput.value = tenantId;
        } else {
          orgInput.value = currentUser.tenantId;
        }
      }
    }
    hideGlobalLoading();
  }
}

// Delete Agent
async function deleteAgent(agentId) {
  const canDelete = currentUser.role === 'Super Admin' || 
                    (currentUser.permissions ? currentUser.permissions.deleteUser : true);
  if (!canDelete) {
    showAppNotification('Access Denied', 'You do not have permission to delete team members.', 'danger');
    return;
  }

  const agent = agents.find(a => a.id === agentId);
  if (!agent) return;
  
  showAppConfirm(
    "Remove Agent",
    `Are you sure you want to remove agent "${agent.name}"?`,
    async () => {
      try {
        showGlobalLoading("Removing agent from active roster...");
        const response = await fetch(`${API_BASE}/api/agents/${agentId}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || "Failed to delete agent");
        }

        showAppNotification('Agent Removed', 'Sales agent removed from active rosters.', 'warning');
        await initRemoteDatabase();
      } catch (err) {
        showAppNotification('Error', err.message, 'danger');
      } finally {
        hideGlobalLoading();
      }
    }
  );
}

// Edit Team Member Modals & Submission
function openEditAgentModal(agentId) {
  const agent = agents.find(a => a.id === agentId);
  if (!agent) return;

  document.getElementById('editAgentId').value = agent.id;
  document.getElementById('editAgentName').value = cleanName(agent.name);
  document.getElementById('editAgentEmail').value = agent.email;
  document.getElementById('editAgentWhatsapp').value = agent.whatsapp || '';
  document.getElementById('editAgentRole').value = agent.role || 'Sales Agent';

  const perms = typeof agent.permissions === 'string' ? JSON.parse(agent.permissions) : (agent.permissions || {});
  if (document.getElementById('editPermViewAllLeads')) document.getElementById('editPermViewAllLeads').checked = perms.viewAllLeads !== false;
  if (document.getElementById('editPermEditOtherLeads')) document.getElementById('editPermEditOtherLeads').checked = perms.editOtherLeads === true;
  if (document.getElementById('editPermViewWonClients')) document.getElementById('editPermViewWonClients').checked = perms.viewWonClients !== false;
  if (document.getElementById('editPermEditWonClients')) document.getElementById('editPermEditWonClients').checked = perms.editWonClients === true;
  if (document.getElementById('editPermViewTeam')) document.getElementById('editPermViewTeam').checked = perms.viewTeam !== false;
  if (document.getElementById('editPermViewMyClients')) document.getElementById('editPermViewMyClients').checked = perms.viewMyClients !== false;
  if (document.getElementById('editPermDeleteTalentPool')) document.getElementById('editPermDeleteTalentPool').checked = perms.deleteTalentPool === true;
  if (document.getElementById('editPermHideTeam')) document.getElementById('editPermHideTeam').checked = perms.hideTeam === true;
  if (document.getElementById('editPermHideBilling')) document.getElementById('editPermHideBilling').checked = perms.hideBilling === true;
  if (document.getElementById('editPermHideSync')) document.getElementById('editPermHideSync').checked = perms.hideSync === true;

  const modal = document.getElementById('editAgentModal');
  if (modal) {
    modal.style.display = 'flex';
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons();
    }
  }
}

function closeEditAgentModal() {
  const modal = document.getElementById('editAgentModal');
  if (modal) modal.style.display = 'none';
}

async function handleEditAgentSubmit(e) {
  e.preventDefault();

  const id = document.getElementById('editAgentId').value;
  const name = document.getElementById('editAgentName').value.trim();
  const email = document.getElementById('editAgentEmail').value.trim();
  const whatsapp = document.getElementById('editAgentWhatsapp').value.trim();
  const role = document.getElementById('editAgentRole').value;

  if (!name || !email || !whatsapp) return;

  const agent = agents.find(a => a.id === id);
  const currentPerms = agent ? (typeof agent.permissions === 'string' ? JSON.parse(agent.permissions) : (agent.permissions || {})) : {};
  const perms = {
    ...currentPerms,
    viewAllLeads: document.getElementById('editPermViewAllLeads') ? document.getElementById('editPermViewAllLeads').checked : true,
    editOtherLeads: document.getElementById('editPermEditOtherLeads') ? document.getElementById('editPermEditOtherLeads').checked : false,
    viewWonClients: document.getElementById('editPermViewWonClients') ? document.getElementById('editPermViewWonClients').checked : true,
    editWonClients: document.getElementById('editPermEditWonClients') ? document.getElementById('editPermEditWonClients').checked : false,
    viewTeam: document.getElementById('editPermViewTeam') ? document.getElementById('editPermViewTeam').checked : true,
    viewMyClients: document.getElementById('editPermViewMyClients') ? document.getElementById('editPermViewMyClients').checked : true,
    deleteTalentPool: document.getElementById('editPermDeleteTalentPool') ? document.getElementById('editPermDeleteTalentPool').checked : false,
    hideTeam: document.getElementById('editPermHideTeam') ? document.getElementById('editPermHideTeam').checked : false,
    hideBilling: document.getElementById('editPermHideBilling') ? document.getElementById('editPermHideBilling').checked : false,
    hideSync: document.getElementById('editPermHideSync') ? document.getElementById('editPermHideSync').checked : false
  };

  try {
    showGlobalLoading("Saving team member details...");
    const response = await fetch(`${API_BASE}/api/agents/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ name, email, whatsapp, role, permissions: perms })
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || "Failed to update agent");
    }

    closeEditAgentModal();
    showAppNotification('Agent Updated', `${name}'s profile has been updated.`, 'success');
    await initRemoteDatabase();
  } catch (err) {
    showAppNotification('Edit Failed', err.message, 'danger');
  } finally {
    hideGlobalLoading();
  }
}

// Render Team list
function toggleHierarchyNode(el) {
  const children = el.nextElementSibling;
  if (children && children.classList.contains('hierarchy-children')) {
    children.classList.toggle('hidden');
    el.classList.toggle('expanded');
  }
}
function toggleAgentPermission(agentId, permissionKey, isChecked) {
  const agent = agents.find(a => a.id === agentId);
  if (!agent) return;
  
  const isCeo = agent.email && agent.ceoEmail && agent.email.toLowerCase() === agent.ceoEmail.toLowerCase();
  if (!agent.permissions) {
    agent.permissions = {
      linkedinExtractor: true,
      whatsappApi: true,
      deleteUser: agent.role === 'Manager',
      viewAllLeads: agent.role !== 'Sales Agent',
      paidApiMode: false,
      addAgent: isCeo,
      reassignLead: isCeo,
      createInvoice: isCeo,
      deleteClientLead: isCeo
    };
  } else {
    if (typeof agent.permissions === 'string') {
      try { agent.permissions = JSON.parse(agent.permissions); } catch (e) {}
    }
    if (agent.permissions.paidApiMode === undefined) agent.permissions.paidApiMode = false;
    if (agent.permissions.addAgent === undefined) agent.permissions.addAgent = isCeo;
    if (agent.permissions.reassignLead === undefined) agent.permissions.reassignLead = isCeo;
    if (agent.permissions.createInvoice === undefined) agent.permissions.createInvoice = isCeo;
    if (agent.permissions.deleteClientLead === undefined) agent.permissions.deleteClientLead = isCeo;
  }
  
  agent.permissions[permissionKey] = isChecked;
  saveAgentsToStorage();
  
  showGlobalLoading("Updating agent permissions...");
  fetch(`${API_BASE}/api/agents/${agentId}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify({ permissions: agent.permissions })
  })
  .then(res => {
    if (!res.ok) throw new Error("Backend update failed");
    showAppNotification('Permissions Updated', `Updated ${agent.name}'s permissions in cloud workspace.`, 'success');
  })
  .catch(err => {
    console.error("Agent permissions sync error:", err);
    showAppNotification('Sync Failed', 'Failed to synchronize permission changes with database.', 'danger');
  })
  .finally(() => {
    hideGlobalLoading();
  });

  renderTeamMembers();
}

function renderTeamMembers() {
  const treeContainer = document.getElementById('teamHierarchyTree');
  if (!treeContainer) return;
  
  treeContainer.innerHTML = '';
  
  const currentIndustry = (companyInfo && companyInfo.industry) || (currentUser && currentUser.industry) || '';
  const isRecruitmentCRM = currentIndustry.toLowerCase().includes('recruitment');
  
  const ensurePermissions = (agent) => {
    const isCeo = agent.email && agent.ceoEmail && agent.email.toLowerCase() === agent.ceoEmail.toLowerCase();
    if (!agent.permissions) {
      agent.permissions = {
        linkedinExtractor: true,
        whatsappApi: true,
        deleteUser: agent.role === 'Manager',
        viewAllLeads: agent.role !== 'Sales Agent',
        paidApiMode: false,
        addAgent: isCeo,
        reassignLead: isCeo,
        createInvoice: isCeo,
        deleteClientLead: isCeo,
        hideDashboard: false,
        hideLeads: false,
        hidePipeline: false,
        hideReminders: false,
        hideOutreach: false,
        hideClients: false,
        hideSignals: false,
        hideRecruitment: false,
        hideInterviews: false,
        hideTeam: false,
        hideBilling: false,
        hideSettings: false
      };
    } else {
      if (typeof agent.permissions === 'string') {
        try { agent.permissions = JSON.parse(agent.permissions); } catch (e) {}
      }
      if (agent.permissions.paidApiMode === undefined) agent.permissions.paidApiMode = false;
      if (agent.permissions.addAgent === undefined) agent.permissions.addAgent = isCeo;
      if (agent.permissions.reassignLead === undefined) agent.permissions.reassignLead = isCeo;
      if (agent.permissions.createInvoice === undefined) agent.permissions.createInvoice = isCeo;
      if (agent.permissions.deleteClientLead === undefined) agent.permissions.deleteClientLead = isCeo;
      if (agent.permissions.hideDashboard === undefined) agent.permissions.hideDashboard = false;
      if (agent.permissions.hideLeads === undefined) agent.permissions.hideLeads = false;
      if (agent.permissions.hidePipeline === undefined) agent.permissions.hidePipeline = false;
      if (agent.permissions.hideReminders === undefined) agent.permissions.hideReminders = false;
      if (agent.permissions.hideOutreach === undefined) agent.permissions.hideOutreach = false;
      if (agent.permissions.hideClients === undefined) agent.permissions.hideClients = false;
      if (agent.permissions.hideSignals === undefined) agent.permissions.hideSignals = false;
      if (agent.permissions.hideRecruitment === undefined) agent.permissions.hideRecruitment = false;
      if (agent.permissions.hideInterviews === undefined) agent.permissions.hideInterviews = false;
      if (agent.permissions.hideTeam === undefined) agent.permissions.hideTeam = false;
      if (agent.permissions.hideBilling === undefined) agent.permissions.hideBilling = false;
      if (agent.permissions.hideSettings === undefined) agent.permissions.hideSettings = false;
    }
    return agent.permissions;
  };  
  const isSuperAdmin = currentUser.role === 'Super Admin';
  const targetTenantId = isSuperAdmin ? activeTenantId : currentUser.tenantId;

  let filteredAgents = agents;
  if (teamSearchQuery) {
    filteredAgents = agents.filter(a => {
      const nameMatch = (a.name || '').toLowerCase().includes(teamSearchQuery);
      const emailMatch = (a.email || '').toLowerCase().includes(teamSearchQuery);
      const phoneMatch = (a.whatsapp || '').toLowerCase().includes(teamSearchQuery);
      const roleMatch = (a.role || '').toLowerCase().includes(teamSearchQuery);
      return nameMatch || emailMatch || phoneMatch || roleMatch;
    });
  }

  // 1. Super Admin View (Tree: Companies -> CEO/Owner -> Other Members)
  if (isSuperAdmin) {
    const targetCompanies = targetTenantId === 'all' 
      ? companies 
      : companies.filter(c => c.id === targetTenantId);
      
    if (targetCompanies.length === 0) {
      treeContainer.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 2rem 0;">No active tenant companies registered.</div>';
      return;
    }
    
    targetCompanies.forEach(company => {
      const companyAgents = filteredAgents.filter(a => a.tenantId === company.id);
      // Find CEO/Owner (by email match)
      const ceoAgents = companyAgents.filter(a => company.ceoEmail && a.email.toLowerCase() === company.ceoEmail.toLowerCase());
      const otherAgents = companyAgents.filter(a => !ceoAgents.some(ceo => ceo.id === a.id));
      
      const companyNode = document.createElement('div');
      companyNode.className = 'hierarchy-node company-node';
      companyNode.onclick = () => toggleHierarchyNode(companyNode);
      companyNode.innerHTML = `
        <i data-lucide="chevron-right" class="node-arrow"></i>
        <i data-lucide="building" class="node-icon"></i>
        <span class="node-name">${company.name}</span>
        <span class="node-badge" style="margin-left: 0.5rem;">${companyAgents.length} Members</span>
      `;
      
      const companyChildren = document.createElement('div');
      companyChildren.className = 'hierarchy-children hidden';
      
      // Render CEOs
      ceoAgents.forEach(ceo => {
        const perm = ensurePermissions(ceo);
        const ceoNode = document.createElement('div');
        ceoNode.className = 'hierarchy-node admin-node';
        ceoNode.onclick = () => toggleHierarchyNode(ceoNode);
        
        ceoNode.innerHTML = `
          <i data-lucide="chevron-right" class="node-arrow"></i>
          <i data-lucide="user-cog" class="node-icon"></i>
          <div style="display: flex; flex-direction: column;">
            <span class="node-name">${ceo.name}</span>
            <span class="node-email">${ceo.email}</span>
            <span style="font-size: 0.7rem; color: var(--accent-purple); font-family: monospace;">Pass: ••••••••</span>
          </div>
          <span class="node-badge" style="margin-left: 0.5rem;">CEO / Owner</span>
          
          <div class="node-permissions-panel" onclick="event.stopPropagation()">
            <label class="permission-pill-checkbox" title="Use LinkedIn Extractor tool">
              <input type="checkbox" ${perm.linkedinExtractor ? 'checked' : ''} onchange="toggleAgentPermission('${ceo.id}', 'linkedinExtractor', this.checked)">
              Ext
            </label>
            <label class="permission-pill-checkbox" title="Use WhatsApp APIs">
              <input type="checkbox" ${perm.whatsappApi ? 'checked' : ''} onchange="toggleAgentPermission('${ceo.id}', 'whatsappApi', this.checked)">
              WhatsApp
            </label>
            <label class="permission-pill-checkbox" title="Permission to delete users">
              <input type="checkbox" ${perm.deleteUser ? 'checked' : ''} onchange="toggleAgentPermission('${ceo.id}', 'deleteUser', this.checked)">
              Delete
            </label>
            <label class="permission-pill-checkbox" title="View all leads">
              <input type="checkbox" ${perm.viewAllLeads ? 'checked' : ''} onchange="toggleAgentPermission('${ceo.id}', 'viewAllLeads', this.checked)">
              All Leads
            </label>
            <label class="permission-pill-checkbox" title="Access Paid API Mode">
              <input type="checkbox" ${perm.paidApiMode ? 'checked' : ''} onchange="toggleAgentPermission('${ceo.id}', 'paidApiMode', this.checked)">
              Paid API
            </label>
            <label class="permission-pill-checkbox" title="Permission to add new agents">
              <input type="checkbox" ${perm.addAgent ? 'checked' : ''} onchange="toggleAgentPermission('${ceo.id}', 'addAgent', this.checked)">
              Add Agent
            </label>
            <label class="permission-pill-checkbox" title="Permission to reassign leads">
              <input type="checkbox" ${perm.reassignLead ? 'checked' : ''} onchange="toggleAgentPermission('${ceo.id}', 'reassignLead', this.checked)">
              Reassign Lead
            </label>
            <label class="permission-pill-checkbox" title="Permission to create invoices">
              <input type="checkbox" ${perm.createInvoice ? 'checked' : ''} onchange="toggleAgentPermission('${ceo.id}', 'createInvoice', this.checked)">
              Invoice
            </label>
            <label class="permission-pill-checkbox" title="Permission to delete clients lead">
              <input type="checkbox" ${perm.deleteClientLead ? 'checked' : ''} onchange="toggleAgentPermission('${ceo.id}', 'deleteClientLead', this.checked)">
              Del Client
            </label>          </div>
          
          <div class="node-action-btn-row" onclick="event.stopPropagation()">
            <button class="outreach-action-btn" onclick="openEditAgentModal('${ceo.id}')" title="Edit Agent" style="color: var(--accent-purple); border-color: rgba(168, 85, 247, 0.2); background: rgba(168, 85, 247, 0.04); padding: 4px;">
              <i data-lucide="edit-3" style="width: 12px; height: 12px;"></i>
            </button>
            <button class="outreach-action-btn" onclick="forceResetAgentPassword('${ceo.id}')" title="Reset Password" style="color: #F59E0B; border-color: rgba(245, 158, 11, 0.2); background: rgba(245, 158, 11, 0.04); padding: 4px;">
              <i data-lucide="key-round" style="width: 12px; height: 12px;"></i>
            </button>
            <button class="outreach-action-btn" onclick="deleteAgent('${ceo.id}')" title="Delete User" style="color: #EF4444; border-color: rgba(239, 68, 68, 0.2); background: rgba(239, 68, 68, 0.04); padding: 4px;">
              <i data-lucide="user-minus" style="width: 12px; height: 12px;"></i>
            </button>
          </div>
        `;
        
        const ceoChildren = document.createElement('div');
        ceoChildren.className = 'hierarchy-children hidden';
        
        // Render other members under this CEO
        otherAgents.forEach(agent => {
          const agentPerm = ensurePermissions(agent);
          const agentNode = document.createElement('div');
          agentNode.className = 'hierarchy-node agent-node';
          agentNode.innerHTML = `
            <i data-lucide="user" class="node-icon"></i>
            <div style="display: flex; flex-direction: column;">
              <span class="node-name">${agent.name}</span>
              <span class="node-email">${agent.email}</span>
              <span style="font-size: 0.7rem; color: var(--accent-purple); font-family: monospace;">Pass: ••••••••</span>
            </div>
            <span class="node-badge" style="margin-left: 0.5rem;">${agent.role}</span>
            
            <div class="node-permissions-panel" onclick="event.stopPropagation()">
              <label class="permission-pill-checkbox" title="Use LinkedIn Extractor tool">
                <input type="checkbox" ${agentPerm.linkedinExtractor ? 'checked' : ''} onchange="toggleAgentPermission('${agent.id}', 'linkedinExtractor', this.checked)">
                Ext
              </label>
              <label class="permission-pill-checkbox" title="Use WhatsApp APIs">
                <input type="checkbox" ${agentPerm.whatsappApi ? 'checked' : ''} onchange="toggleAgentPermission('${agent.id}', 'whatsappApi', this.checked)">
                WhatsApp
              </label>
              <label class="permission-pill-checkbox" title="Permission to delete users">
                <input type="checkbox" ${agentPerm.deleteUser ? 'checked' : ''} onchange="toggleAgentPermission('${agent.id}', 'deleteUser', this.checked)">
                Delete
              </label>
              <label class="permission-pill-checkbox" title="View all leads">
                <input type="checkbox" ${agentPerm.viewAllLeads ? 'checked' : ''} onchange="toggleAgentPermission('${agent.id}', 'viewAllLeads', this.checked)">
                All Leads
              </label>
              <label class="permission-pill-checkbox" title="Access Paid API Mode">
                <input type="checkbox" ${agentPerm.paidApiMode ? 'checked' : ''} onchange="toggleAgentPermission('${agent.id}', 'paidApiMode', this.checked)">
                Paid API
              </label>
              <label class="permission-pill-checkbox" title="Permission to add new agents">
                <input type="checkbox" ${agentPerm.addAgent ? 'checked' : ''} onchange="toggleAgentPermission('${agent.id}', 'addAgent', this.checked)">
                Add Agent
              </label>
              <label class="permission-pill-checkbox" title="Permission to reassign leads">
                <input type="checkbox" ${agentPerm.reassignLead ? 'checked' : ''} onchange="toggleAgentPermission('${agent.id}', 'reassignLead', this.checked)">
                Reassign Lead
              </label>
              <label class="permission-pill-checkbox" title="Permission to create invoices">
                <input type="checkbox" ${agentPerm.createInvoice ? 'checked' : ''} onchange="toggleAgentPermission('${agent.id}', 'createInvoice', this.checked)">
                Invoice
              </label>
              <label class="permission-pill-checkbox" title="Edit Other Agents Assigned Leads">
                <input type="checkbox" ${agentPerm.editOtherLeads ? 'checked' : ''} onchange="toggleAgentPermission('${agent.id}', 'editOtherLeads', this.checked)">
                Edit Other Leads
              </label>
              <label class="permission-pill-checkbox" title="View Won Clients Directory">
                <input type="checkbox" ${agentPerm.viewWonClients !== false ? 'checked' : ''} onchange="toggleAgentPermission('${agent.id}', 'viewWonClients', this.checked)">
                View Won
              </label>
              <label class="permission-pill-checkbox" title="Edit Won Clients Details">
                <input type="checkbox" ${agentPerm.editWonClients ? 'checked' : ''} onchange="toggleAgentPermission('${agent.id}', 'editWonClients', this.checked)">
                Edit Won
              </label>
              <label class="permission-pill-checkbox" title="Delete Candidate from Talent Pool">
                <input type="checkbox" ${agentPerm.deleteTalentPool ? 'checked' : ''} onchange="toggleAgentPermission('${agent.id}', 'deleteTalentPool', this.checked)">
                Del Talent Pool
              </label>
              <label class="permission-pill-checkbox" title="Hide Dashboard in Side Nav" style="color: #EF4444; border-color: rgba(239, 68, 68, 0.2);">
                <input type="checkbox" ${agentPerm.hideDashboard ? 'checked' : ''} onchange="toggleAgentPermission('${agent.id}', 'hideDashboard', this.checked)">
                Hide Dash
              </label>
              <label class="permission-pill-checkbox" title="Hide Leads Directory in Side Nav" style="color: #EF4444; border-color: rgba(239, 68, 68, 0.2);">
                <input type="checkbox" ${agentPerm.hideLeads ? 'checked' : ''} onchange="toggleAgentPermission('${agent.id}', 'hideLeads', this.checked)">
                Hide Leads
              </label>
              <label class="permission-pill-checkbox" title="Hide Sales Pipeline in Side Nav" style="color: #EF4444; border-color: rgba(239, 68, 68, 0.2);">
                <input type="checkbox" ${agentPerm.hidePipeline ? 'checked' : ''} onchange="toggleAgentPermission('${agent.id}', 'hidePipeline', this.checked)">
                Hide Pipe
              </label>
              <label class="permission-pill-checkbox" title="Hide My Clients in Side Nav" style="color: #EF4444; border-color: rgba(239, 68, 68, 0.2);">
                <input type="checkbox" ${agentPerm.hideClients ? 'checked' : ''} onchange="toggleAgentPermission('${agent.id}', 'hideClients', this.checked)">
                Hide Clients
              </label>
              ${isRecruitmentCRM ? `
                <label class="permission-pill-checkbox" title="Hide Recruitment CRM in Side Nav" style="color: #EF4444; border-color: rgba(239, 68, 68, 0.2);">
                  <input type="checkbox" ${agentPerm.hideRecruitment ? 'checked' : ''} onchange="toggleAgentPermission('${agent.id}', 'hideRecruitment', this.checked)">
                  Hide Recruit
                </label>
              ` : ''}
              <label class="permission-pill-checkbox" title="Hide Billing & Invoices in Side Nav" style="color: #EF4444; border-color: rgba(239, 68, 68, 0.2);">
                <input type="checkbox" ${agentPerm.hideBilling ? 'checked' : ''} onchange="toggleAgentPermission('${agent.id}', 'hideBilling', this.checked)">
                Hide Bill
              </label>            </div>
            
            <div class="node-action-btn-row" onclick="event.stopPropagation()">
              <button class="outreach-action-btn" onclick="openEditAgentModal('${agent.id}')" title="Edit Agent" style="color: var(--accent-purple); border-color: rgba(168, 85, 247, 0.2); background: rgba(168, 85, 247, 0.04); padding: 4px;">
                <i data-lucide="edit-3" style="width: 12px; height: 12px;"></i>
              </button>
              <button class="outreach-action-btn" onclick="forceResetAgentPassword('${agent.id}')" title="Reset Password" style="color: #F59E0B; border-color: rgba(245, 158, 11, 0.2); background: rgba(245, 158, 11, 0.04); padding: 4px;">
                <i data-lucide="key-round" style="width: 12px; height: 12px;"></i>
              </button>
              <button class="outreach-action-btn" onclick="deleteAgent('${agent.id}')" title="Delete User" style="color: #EF4444; border-color: rgba(239, 68, 68, 0.2); background: rgba(239, 68, 68, 0.04); padding: 4px;">
                <i data-lucide="user-minus" style="width: 12px; height: 12px;"></i>
              </button>
            </div>
          `;
          ceoChildren.appendChild(agentNode);
        });
        
        if (otherAgents.length === 0) {
          const noAgentsNode = document.createElement('div');
          noAgentsNode.className = 'hierarchy-node agent-node';
          noAgentsNode.innerHTML = `<span style="color: var(--text-muted); font-size: 0.78rem;">No team members registered under this CEO.</span>`;
          ceoChildren.appendChild(noAgentsNode);
        }
        
        companyChildren.appendChild(ceoNode);
        companyChildren.appendChild(ceoChildren);
      });
      
      if (ceoAgents.length === 0) {
        const noCEOsNode = document.createElement('div');
        noCEOsNode.className = 'hierarchy-node admin-node';
        noCEOsNode.innerHTML = `<span style="color: var(--text-muted); font-size: 0.78rem;">No CEO/Owner registered in this company.</span>`;
        companyChildren.appendChild(noCEOsNode);
      }
      
      treeContainer.appendChild(companyNode);
      treeContainer.appendChild(companyChildren);
    });
  } 
  
  // 2. Company Member View (Tree: CEO -> Other Members)
  else {
    const companyAgents = agents.filter(a => a.tenantId === currentUser.tenantId);
    
    // Find CEO (by email matching currentUser.ceoEmail)
    const ceoEmail = currentUser.ceoEmail || '';
    const ceoAgents = companyAgents.filter(a => ceoEmail && a.email.toLowerCase() === ceoEmail.toLowerCase());
    
    const isCEO = ceoEmail && currentUser.email.toLowerCase() === ceoEmail.toLowerCase();
    
    // If no CEO registered by email, fallback to the first manager as CEO
    const ceoNodeAgent = ceoAgents.length > 0 ? ceoAgents[0] : companyAgents.find(a => a.role === 'Manager') || currentUser;
    const ceoChildrenAgents = companyAgents.filter(a => a.id !== ceoNodeAgent.id);
    
    const ownerNode = document.createElement('div');
    ownerNode.className = 'hierarchy-node admin-node';
    ownerNode.style.marginLeft = '0';
    ownerNode.onclick = () => toggleHierarchyNode(ownerNode);
    
    const ownerPerm = ensurePermissions(ceoNodeAgent);
    const isSelfCeo = ceoNodeAgent.id === currentUser.id;
    
    ownerNode.innerHTML = `
      <i data-lucide="chevron-right" class="node-arrow"></i>
      <i data-lucide="user-cog" class="node-icon"></i>
      <div style="display: flex; flex-direction: column;">
        <span class="node-name">${ceoNodeAgent.name} ${isSelfCeo ? '(You)' : ''}</span>
        <span class="node-email">${ceoNodeAgent.email}</span>
      </div>
      <span class="node-badge" style="margin-left: 0.5rem;">CEO / Owner</span>
      
      <div class="node-permissions-panel" onclick="event.stopPropagation()">
        <label class="permission-pill-checkbox">
          <input type="checkbox" checked disabled>
          Ext
        </label>
        <label class="permission-pill-checkbox">
          <input type="checkbox" checked disabled>
          WhatsApp
        </label>
        <label class="permission-pill-checkbox">
          <input type="checkbox" checked disabled>
          Delete
        </label>
        <label class="permission-pill-checkbox">
          <input type="checkbox" checked disabled>
          All Leads
        </label>
        <label class="permission-pill-checkbox">
          <input type="checkbox" checked disabled>
          Add Agent
        </label>
        <label class="permission-pill-checkbox">
          <input type="checkbox" checked disabled>
          Reassign Lead
        </label>
      </div>

      <div class="node-action-btn-row" onclick="event.stopPropagation()">
        <button class="outreach-action-btn" onclick="openEditAgentModal('${ceoNodeAgent.id}')" title="Edit Agent" style="color: var(--accent-purple); border-color: rgba(168, 85, 247, 0.2); background: rgba(168, 85, 247, 0.04); padding: 4px; ${isCEO ? '' : 'display: none;'}">
          <i data-lucide="edit-3" style="width: 12px; height: 12px;"></i>
        </button>
      </div>
    `;
    
    const ownerChildren = document.createElement('div');
    ownerChildren.className = 'hierarchy-children hidden';
    ownerChildren.style.marginLeft = '1.5rem';
    
    ceoChildrenAgents.forEach(agent => {
      const agentPerm = ensurePermissions(agent);
      const isSelfAgent = agent.id === currentUser.id;
      
      const agentNode = document.createElement('div');
      agentNode.className = 'hierarchy-node agent-node';
      agentNode.style.marginLeft = '0';
      agentNode.innerHTML = `
        <i data-lucide="user" class="node-icon"></i>
        <div style="display: flex; flex-direction: column;">
          <span class="node-name">${agent.name} ${isSelfAgent ? '(You)' : ''}</span>
          <span class="node-email">${agent.email}</span>
          <span style="font-size: 0.7rem; color: var(--accent-purple); font-family: monospace;">Pass: ••••••••</span>
        </div>
        <span class="node-badge" style="margin-left: 0.5rem;">${agent.role}</span>
        
        <div class="node-permissions-panel" onclick="event.stopPropagation()">
          <label class="permission-pill-checkbox">
            <input type="checkbox" ${agentPerm.linkedinExtractor ? 'checked' : ''} ${isCEO ? `onchange="toggleAgentPermission('${agent.id}', 'linkedinExtractor', this.checked)"` : 'disabled'}>
            Ext
          </label>
          <label class="permission-pill-checkbox">
            <input type="checkbox" ${agentPerm.whatsappApi ? 'checked' : ''} ${isCEO ? `onchange="toggleAgentPermission('${agent.id}', 'whatsappApi', this.checked)"` : 'disabled'}>
            WhatsApp
          </label>
          <label class="permission-pill-checkbox">
            <input type="checkbox" ${agentPerm.deleteUser ? 'checked' : ''} ${isCEO ? `onchange="toggleAgentPermission('${agent.id}', 'deleteUser', this.checked)"` : 'disabled'}>
            Delete
          </label>
          <label class="permission-pill-checkbox">
            <input type="checkbox" ${agentPerm.viewAllLeads ? 'checked' : ''} ${isCEO ? `onchange="toggleAgentPermission('${agent.id}', 'viewAllLeads', this.checked)"` : 'disabled'}>
            All Leads
          </label>
          <label class="permission-pill-checkbox">
            <input type="checkbox" ${agentPerm.editOtherLeads ? 'checked' : ''} ${isCEO ? `onchange="toggleAgentPermission('${agent.id}', 'editOtherLeads', this.checked)"` : 'disabled'}>
            Edit Other Leads
          </label>
          <label class="permission-pill-checkbox">
            <input type="checkbox" ${agentPerm.viewWonClients !== false ? 'checked' : ''} ${isCEO ? `onchange="toggleAgentPermission('${agent.id}', 'viewWonClients', this.checked)"` : 'disabled'}>
            View Won
          </label>
          <label class="permission-pill-checkbox">
            <input type="checkbox" ${agentPerm.editWonClients ? 'checked' : ''} ${isCEO ? `onchange="toggleAgentPermission('${agent.id}', 'editWonClients', this.checked)"` : 'disabled'}>
            Edit Won
          </label>
          <label class="permission-pill-checkbox">
            <input type="checkbox" ${agentPerm.deleteTalentPool ? 'checked' : ''} ${isCEO ? `onchange="toggleAgentPermission('${agent.id}', 'deleteTalentPool', this.checked)"` : 'disabled'}>
            Del Talent Pool
          </label>
          <label class="permission-pill-checkbox" title="Hide Dashboard in Side Nav" style="color: #EF4444; border-color: rgba(239, 68, 68, 0.2);">
            <input type="checkbox" ${agentPerm.hideDashboard ? 'checked' : ''} ${isCEO ? `onchange="toggleAgentPermission('${agent.id}', 'hideDashboard', this.checked)"` : 'disabled'}>
            Hide Dash
          </label>
          <label class="permission-pill-checkbox" title="Hide Leads Directory in Side Nav" style="color: #EF4444; border-color: rgba(239, 68, 68, 0.2);">
            <input type="checkbox" ${agentPerm.hideLeads ? 'checked' : ''} ${isCEO ? `onchange="toggleAgentPermission('${agent.id}', 'hideLeads', this.checked)"` : 'disabled'}>
            Hide Leads
          </label>
          <label class="permission-pill-checkbox" title="Hide Sales Pipeline in Side Nav" style="color: #EF4444; border-color: rgba(239, 68, 68, 0.2);">
            <input type="checkbox" ${agentPerm.hidePipeline ? 'checked' : ''} ${isCEO ? `onchange="toggleAgentPermission('${agent.id}', 'hidePipeline', this.checked)"` : 'disabled'}>
            Hide Pipe
          </label>
          <label class="permission-pill-checkbox" title="Hide My Clients in Side Nav" style="color: #EF4444; border-color: rgba(239, 68, 68, 0.2);">
            <input type="checkbox" ${agentPerm.hideClients ? 'checked' : ''} ${isCEO ? `onchange="toggleAgentPermission('${agent.id}', 'hideClients', this.checked)"` : 'disabled'}>
            Hide Clients
          </label>
          <label class="permission-pill-checkbox" title="Hide Team Members in Side Nav" style="color: #EF4444; border-color: rgba(239, 68, 68, 0.2);">
            <input type="checkbox" ${agentPerm.hideTeam ? 'checked' : ''} ${isCEO ? `onchange="toggleAgentPermission('${agent.id}', 'hideTeam', this.checked)"` : 'disabled'}>
            Hide Team
          </label>
          ${isRecruitmentCRM ? `
            <label class="permission-pill-checkbox" title="Hide Recruitment CRM in Side Nav" style="color: #EF4444; border-color: rgba(239, 68, 68, 0.2);">
              <input type="checkbox" ${agentPerm.hideRecruitment ? 'checked' : ''} ${isCEO ? `onchange="toggleAgentPermission('${agent.id}', 'hideRecruitment', this.checked)"` : 'disabled'}>
              Hide Recruit
            </label>
          ` : ''}
          <label class="permission-pill-checkbox" title="Hide Billing & Invoices in Side Nav" style="color: #EF4444; border-color: rgba(239, 68, 68, 0.2);">
            <input type="checkbox" ${agentPerm.hideBilling ? 'checked' : ''} ${isCEO ? `onchange="toggleAgentPermission('${agent.id}', 'hideBilling', this.checked)"` : 'disabled'}>
            Hide Bill
          </label>
          <label class="permission-pill-checkbox" title="Hide Sync Settings in Side Nav" style="color: #EF4444; border-color: rgba(239, 68, 68, 0.2);">
            <input type="checkbox" ${agentPerm.hideSync ? 'checked' : ''} ${isCEO ? `onchange="toggleAgentPermission('${agent.id}', 'hideSync', this.checked)"` : 'disabled'}>
            Hide Sync
          </label>        </div>
        
        <div class="node-action-btn-row" onclick="event.stopPropagation()">
          <button class="outreach-action-btn" onclick="openEditAgentModal('${agent.id}')" title="Edit Agent" style="color: var(--accent-purple); border-color: rgba(168, 85, 247, 0.2); background: rgba(168, 85, 247, 0.04); padding: 4px; ${isCEO ? '' : 'display: none;'}">
            <i data-lucide="edit-3" style="width: 12px; height: 12px;"></i>
          </button>
          <button class="outreach-action-btn" onclick="forceResetAgentPassword('${agent.id}')" title="Reset Password" style="color: #F59E0B; border-color: rgba(245, 158, 11, 0.2); background: rgba(245, 158, 11, 0.04); padding: 4px; ${isCEO || isSelfAgent ? '' : 'display: none;'}">
            <i data-lucide="key-round" style="width: 12px; height: 12px;"></i>
          </button>
          <button class="outreach-action-btn" onclick="deleteAgent('${agent.id}')" title="Delete User" style="color: #EF4444; border-color: rgba(239, 68, 68, 0.2); background: rgba(239, 68, 68, 0.04); padding: 4px; ${isCEO ? '' : 'display: none;'}">
            <i data-lucide="user-minus" style="width: 12px; height: 12px;"></i>
          </button>
        </div>
      `;
      ownerChildren.appendChild(agentNode);
    });
    
    if (ceoChildrenAgents.length === 0) {
      const noAgentsNode = document.createElement('div');
      noAgentsNode.className = 'hierarchy-node agent-node';
      noAgentsNode.style.marginLeft = '0';
      noAgentsNode.innerHTML = `<span style="color: var(--text-muted); font-size: 0.78rem;">No team members registered.</span>`;
      ownerChildren.appendChild(noAgentsNode);
    }
    
    treeContainer.appendChild(ownerNode);
    treeContainer.appendChild(ownerChildren);
  }
  lucide.createIcons();
}

// Bulk Manual Lead Assignment
function triggerBulkAgentAssign(agentName) {
  if (!agentName) return;
  
  const checkedCheckboxes = Array.from(document.querySelectorAll('.directory-row-select:checked'));
  if (checkedCheckboxes.length === 0) {
    showAppNotification('Assignment Failed', 'Please select at least one lead.', 'warning');
    document.getElementById('bulkAgentSelect').value = '';
    return;
  }
  
  const selectedIds = checkedCheckboxes.map(cb => cb.getAttribute('data-id'));
  
  selectedIds.forEach(leadId => {
    const lead = leads.find(l => l.id === leadId);
    if (lead) {
      lead.assignedAgent = agentName;
    }
  });
  
  saveLeadsToStorage();
  
  showAppNotification('Leads Assigned', `Assigned ${selectedIds.length} leads to ${agentName} successfully.`, 'success');
  
  // Clear bulk toolbar selections
  const selectAllCb = document.getElementById('selectAllDirectory');
  if (selectAllCb) selectAllCb.checked = false;
  toggleAllDirectoryLeads(false);
  document.getElementById('bulkAgentSelect').value = '';
  
  // Auto-sync database
  triggerAutoSync();
  
  renderDashboard();
  applyFilters();
}

// Sales Performance Leaderboard Calculations
function renderSalesLeaderboard() {
  const container = document.getElementById('analyticsLeaderboard');
  if (!container) return;
  
  const targetTenantId = currentUser.role === 'Super Admin' ? activeTenantId : currentUser.tenantId;
  const scopedLeads = getScopedLeads();
  
  if (targetTenantId === 'all') {
    // Group agents by company
    const companyGroups = {};
    companies.forEach(c => {
      companyGroups[c.id] = {
        companyName: c.name,
        agentsList: [],
        totalWon: 0
      };
    });
    
    // Add agents to their companies
    agents.forEach(agent => {
      const coId = agent.tenantId;
      if (companyGroups[coId]) {
        const wonCount = scopedLeads.filter(l => l.assignedAgent === agent.name && l.status === 'won' && l.tenantId === coId).length;
        companyGroups[coId].agentsList.push({ name: agent.name, count: wonCount });
        companyGroups[coId].totalWon += wonCount;
      }
    });
    
    let html = '';
    Object.keys(companyGroups).forEach((coId, cIdx) => {
      const group = companyGroups[coId];
      // Sort agents in this company
      group.agentsList.sort((a, b) => b.count - a.count);
      
      const isCollapseId = `sa-leaderboard-co-${coId}`;
      html += `
        <div style="border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 0.5rem; overflow: hidden; background: rgba(255,255,255,0.01);">
          <div onclick="document.getElementById('${isCollapseId}').classList.toggle('hidden')" style="padding: 0.75rem 1rem; display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.02); cursor: pointer; user-select: none;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <i data-lucide="building" style="width: 14px; height: 14px; color: var(--accent-blue);"></i>
              <strong style="color: var(--text-primary); font-size: 0.85rem; font-family: 'Outfit';">${escapeHTML(group.companyName)}</strong>
            </div>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span class="file-format-badge" style="background: rgba(16, 185, 129, 0.1); color: #10B981; font-weight: 700; font-size: 0.65rem;">${group.totalWon} Total Won</span>
              <i data-lucide="chevron-down" style="width: 14px; height: 14px; color: var(--text-muted);"></i>
            </div>
          </div>
          
          <div id="${isCollapseId}" class="hidden" style="padding: 0.5rem 1rem 1rem 1rem; border-top: 1px solid var(--border-color);">
            ${group.agentsList.length === 0 ? `
              <div style="text-align: center; color: var(--text-muted); font-size: 0.75rem; padding: 1rem 0;">No active agents in this workspace.</div>
            ` : `
              <table style="width: 100%; font-size: 0.78rem; text-align: left; border-collapse: collapse;">
                <thead>
                  <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted);">
                    <th style="padding: 0.35rem 0.5rem; font-weight: 600;">Rank</th>
                    <th style="padding: 0.35rem 0.5rem; font-weight: 600;">Agent Name</th>
                    <th style="padding: 0.35rem 0.5rem; font-weight: 600; text-align: right;">Sales Closures</th>
                  </tr>
                </thead>
                <tbody>
                  ${group.agentsList.map((item, index) => {
                    const rankClass = index === 0 ? 'color: #F59E0B; font-weight: 800;' : index === 1 ? 'color: #9CA3AF; font-weight: 700;' : index === 2 ? 'color: #D97706; font-weight: 700;' : '';
                    return `
                      <tr style="border-bottom: 1px solid rgba(255,255,255,0.02);">
                        <td style="padding: 0.45rem 0.5rem; ${rankClass}">#${index + 1}</td>
                        <td style="padding: 0.45rem 0.5rem; color: var(--text-primary); font-weight: 500;">${escapeHTML(item.name)}</td>
                        <td style="padding: 0.45rem 0.5rem; text-align: right; color: var(--accent-blue); font-weight: 600;">${item.count} Won</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            `}
          </div>
        </div>
      `;
    });
    container.innerHTML = html;
    lucide.createIcons();
  } else {
    const scopedAgents = agents.filter(a => a.tenantId === targetTenantId);
    const tallies = scopedAgents.map(agent => {
      const wonCount = scopedLeads.filter(l => l.assignedAgent === agent.name && l.status === 'won').length;
      return { name: agent.name, count: wonCount };
    });
    tallies.sort((a, b) => b.count - a.count);
    
    if (scopedAgents.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 2rem 0;">
          No active agents to rank.
        </div>
      `;
      return;
    }
    
    let html = '';
    tallies.forEach((item, index) => {
      const rankClass = index === 0 ? 'rank-1' : index === 1 ? 'rank-2' : index === 2 ? 'rank-3' : '';
      html += `
        <div class="leaderboard-row">
          <div class="leaderboard-rank ${rankClass}">${index + 1}</div>
          <div class="leaderboard-name">${escapeHTML(item.name)}</div>
          <div class="leaderboard-score">${item.count} Won</div>
        </div>
      `;
    });
    container.innerHTML = html;
  }
}

// Kanban HTML5 Drag & Drop handlers
function allowDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
}

function dragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

function dragStartLeadCard(e, leadId) {
  e.dataTransfer.setData('text/plain', leadId);
  e.currentTarget.classList.add('dragging');
}

function dragEndLeadCard(e) {
  e.currentTarget.classList.remove('dragging');
}

function dropLeadCard(e, targetStatus) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const leadId = e.dataTransfer.getData('text/plain');
  
  const lead = leads.find(l => l.id === leadId);
  if (lead && lead.status !== targetStatus) {
    const oldStatus = lead.status;
    lead.status = targetStatus;
    
    // Automatically flag last follow up details
    lead.lastFollowUp = getRelativeDateString(0);
    
    const activeIndustry = (companyInfo && companyInfo.industry) || (currentUser && currentUser.industry) || "Real Estate CRM Software";
    const profile = INDUSTRY_PROFILES[activeIndustry];
    const stages = (profile && profile.stages) ? profile.stages : ['new', 'contacted', 'inprogress', 'won', 'lost'];
    const isClosedStage = targetStatus.toLowerCase().includes('won') || targetStatus.toLowerCase().includes('lost') || targetStatus === stages[stages.length - 1] || targetStatus === stages[stages.length - 2];
    
    if (isClosedStage) {
      lead.nextFollowUp = ''; // No next follow-up required if closed
    } else {
      lead.nextFollowUp = getRelativeDateString(2);
    }
    
    saveLeadsToStorage();
    const isWonStatus = targetStatus === 'won' || targetStatus.toLowerCase().includes('won');
    if (isWonStatus) {
      showAppNotification('Client Lead Won', `Client lead "${lead.company || lead.name}" moved to Working with them. Please start job posting for them!`, 'success');
    } else {
      showAppNotification('Pipeline Updated', `Shifted ${lead.name} to "${targetStatus}".`, 'success');
    }
    
    if (currentUser) {
      fetch(`${API_BASE}/api/leads/${lead.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(lead)
      }).catch(err => console.error("Failed to sync drag-drop status change:", err));
    }

    triggerAutoSync();
    
    renderDashboard();
    renderKanbanBoard();
    applyFilters();
  }
}

// Fallback click helper to shift status (primarily for mobile responsive view)
function shiftLeadStatus(leadId, newStatus) {
  const lead = leads.find(l => l.id === leadId);
  if (lead) {
    const oldStatus = lead.status;
    lead.status = newStatus;
    lead.lastFollowUp = getRelativeDateString(0);
    
    const activeIndustry = (companyInfo && companyInfo.industry) || (currentUser && currentUser.industry) || "Real Estate CRM Software";
    const profile = INDUSTRY_PROFILES[activeIndustry];
    const stages = (profile && profile.stages) ? profile.stages : ['new', 'contacted', 'inprogress', 'won', 'lost'];
    const isClosedStage = newStatus.toLowerCase().includes('won') || newStatus.toLowerCase().includes('lost') || newStatus === stages[stages.length - 1] || newStatus === stages[stages.length - 2];
    
    if (isClosedStage) {
      lead.nextFollowUp = '';
    } else {
      lead.nextFollowUp = getRelativeDateString(2);
    }
    
    saveLeadsToStorage();
    showAppNotification('Pipeline Updated', `Shifted lead status to "${newStatus}"`, 'success');
    
    if (currentUser) {
      fetch(`${API_BASE}/api/leads/${lead.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(lead)
      }).catch(err => console.error("Failed to sync click status change:", err));
    }
    
    triggerAutoSync();
    
    renderDashboard();
    renderKanbanBoard();
    applyFilters();
  }
}

// Render Kanban board columns
function renderKanbanBoard() {
  const kanbanBoard = document.getElementById('kanbanBoard');
  if (!kanbanBoard) return;

  const activeIndustry = (companyInfo && companyInfo.industry) || (currentUser && currentUser.industry) || "Real Estate CRM Software";
  const profile = INDUSTRY_PROFILES[activeIndustry];
  const stages = (profile && profile.stages) ? profile.stages : ['new', 'contacted', 'inprogress', 'won', 'lost'];

  // Colors mapping for status dots
  const dotColors = {
    "Inquiry": "var(--status-new)",
    "Site Visit Scheduled": "var(--status-contacted)",
    "Negotiation": "var(--status-inprogress)",
    "Closed Won": "var(--status-won)",
    "Lost": "var(--status-lost)",

    "Counseling": "var(--status-contacted)",
    "Document Verification": "var(--status-inprogress)",
    "Fees Paid": "var(--status-won)",
    "Enrollment Closed": "var(--status-lost)",

    "Application Filed": "var(--status-new)",
    "Documents Collected": "var(--status-contacted)",
    "Credit Underwriting": "var(--status-inprogress)",
    "Approved": "var(--status-won)",
    "Disbursed": "var(--status-won)",

    "Package Shared": "var(--status-contacted)",
    "Booking Confirmed": "var(--status-inprogress)",
    "Visa Processing": "var(--status-inprogress)",
    "Trip Completed": "var(--status-won)",

    "Slot Confirmed": "var(--status-contacted)",
    "Consultation Completed": "var(--status-inprogress)",
    "Treatment Plan Active": "var(--status-inprogress)",
    "Discharged": "var(--status-won)",

    "Intro Meeting": "var(--status-new)",
    "Due Diligence": "var(--status-contacted)",
    "Term Sheet Issued": "var(--status-inprogress)",
    "Legal Review": "var(--status-inprogress)",
    "Closed Round": "var(--status-won)",

    "Unreached": "var(--status-new)",
    "Call Scheduled": "var(--status-contacted)",
    "Follow-up Needed": "var(--status-inprogress)",
    "Interested": "var(--status-won)",
    "DNC (Do Not Call)": "var(--status-lost)",

    "Assigned": "var(--status-new)",
    "Debtor Contacted": "var(--status-contacted)",
    "Settlement Offered": "var(--status-inprogress)",
    "Payment Plan Active": "var(--status-inprogress)",
    "Paid in Full": "var(--status-won)",

    "RFQ Received": "var(--status-new)",
    "Quote Dispatched": "var(--status-contacted)",
    "Order Confirmed": "var(--status-inprogress)",
    "Production Started": "var(--status-inprogress)",
    "Shipped": "var(--status-won)",

    "Walk-in": "var(--status-new)",
    "Product Demo": "var(--status-contacted)",
    "Cart Abandoned": "var(--status-lost)",
    "Purchase Completed": "var(--status-won)",
    "Feedback Submitted": "var(--status-won)",

    "new": "var(--status-new)",
    "contacted": "var(--status-contacted)",
    "inprogress": "var(--status-inprogress)",
    "won": "var(--status-won)",
    "lost": "var(--status-lost)"
  };

  let boardHtml = '';

  stages.forEach(stage => {
    const filteredLeads = getScopedLeads().filter(l => l.status === stage || (stage === stages[0] && (!l.status || l.status === 'new')));
    const dotColor = dotColors[stage] || "var(--accent-purple)";

    let cardsHtml = '';
    if (filteredLeads.length === 0) {
      cardsHtml = `
        <div style="text-align: center; color: var(--text-muted); font-size: 0.75rem; border: 1px dashed var(--border-color); border-radius: 8px; padding: 1.5rem 0;">
          No leads in stage
        </div>
      `;
    } else {
      filteredLeads.forEach(lead => {
        const agentBadge = lead.assignedAgent 
          ? `<span class="file-format-badge" style="background-color: rgba(168, 85, 247, 0.08); color: var(--accent-purple); display: inline-flex; align-items: center; gap: 0.2rem; font-size: 0.65rem;">
               <i data-lucide="user" style="width: 10px; height: 10px;"></i> ${lead.assignedAgent}
             </span>`
          : `<span class="file-format-badge" style="background-color: rgba(239, 68, 68, 0.06); color: #EF4444; font-size: 0.65rem;">Unassigned</span>`;
        
        let customFieldsHtml = '';
        const { customFields } = parseLeadSummary(lead.summary);
        if (customFields && Object.keys(customFields).length > 0) {
          customFieldsHtml = '<div style="margin-top: 0.45rem; display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.65rem; color: var(--text-muted); border-top: 1px solid rgba(255,255,255,0.03); padding-top: 0.35rem;">';
          profile.fields.forEach(f => {
            if (customFields[f.id]) {
              customFieldsHtml += `<div><strong>${f.label}:</strong> ${customFields[f.id]}</div>`;
            }
          });
          customFieldsHtml += '</div>';
        }

        cardsHtml += `
          <div class="kanban-card" draggable="true" ondragstart="dragStartLeadCard(event, '${lead.id}')" ondragend="dragEndLeadCard(event)" style="opacity: 1;">
            <div class="kanban-card-title">${escapeHTML(lead.name)}</div>
            
            ${(lead.company || lead.organization) ? `
              <div class="kanban-card-meta" style="color: var(--accent-purple); font-weight: 600; margin-bottom: 0.25rem; font-size: 0.72rem; display: flex; align-items: center; gap: 0.25rem;">
                <i data-lucide="building-2" style="width: 11px; height: 11px; color: var(--accent-purple);"></i>
                <span>${escapeHTML(lead.company || lead.organization)}</span>
              </div>
            ` : ''}

            <div class="kanban-card-meta">
              <i data-lucide="briefcase" style="width: 11px; height: 11px;"></i>
              <span>${escapeHTML(lead.designation || 'No Designation')}</span>
            </div>
            
            <div class="kanban-card-meta" style="display: flex; align-items: center; justify-content: space-between; width: 100%; margin-bottom: 0.25rem;">
              <span style="display: flex; align-items: center; gap: 0.35rem;">
                <i data-lucide="phone" style="width: 11px; height: 11px;"></i>
                <span>${lead.phone || 'No Phone'}</span>
              </span>
              ${lead.phone ? `
                <span style="display: flex; gap: 0.35rem; align-items: center;">
                  <a href="#" onclick="initiateMobileCall('${lead.id}'); return false;" style="color: var(--accent-blue);" title="Sync Call"><i data-lucide="phone-call" style="width: 12px; height: 12px;"></i></a>
                  <a href="#" onclick="sendQuickWhatsApp('${lead.id}'); return false;" style="color: #25D366; display: inline-flex; align-items: center; justify-content: center;" title="1-Click WhatsApp"><svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" style="display: block;"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.513 2.262 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.625 1.451 5.403.002 9.803-4.394 9.806-9.794.002-2.615-1.017-5.074-2.871-6.931C16.356 2.024 13.9 1.003 11.285 1.003c-5.412 0-9.818 4.402-9.822 9.802-.002 1.702.437 3.364 1.272 4.8l-.997 3.637 3.73-.978zm11.567-5.282c-.313-.156-1.854-.915-2.131-1.015-.277-.1-.478-.15-.678.15-.2.3-.777.98-.952 1.18-.176.2-.351.224-.664.068-1.127-.565-1.957-.962-2.736-2.298-.2-.35-.2-.575.05-.724.113-.062.313-.362.438-.5.125-.138.2-.238.313-.45.112-.213.056-.4-.028-.563-.084-.162-.678-1.638-.93-2.238-.243-.587-.492-.513-.678-.522-.175-.008-.375-.01-.575-.01-.2 0-.525.075-.8.375-.276.3-1.05 1.026-1.05 2.5 0 1.475 1.075 2.9 1.225 3.1.15.2 2.11 3.22 5.11 4.52 1.637.7 2.68.837 3.61.7.94-.14 1.854-.76 2.115-1.46.262-.7.262-1.3.184-1.426-.079-.12-.284-.19-.597-.346z"/></svg></a>
                </span>
              ` : ''}
            </div>
            
            <div style="margin-top: 0.5rem; display: flex; align-items: center; justify-content: space-between;">
              ${agentBadge}
              <span style="font-size: 0.65rem; color: var(--text-muted);">${lead.createdDate ? lead.createdDate.split('T')[0] : ''}</span>
            </div>
  
            ${customFieldsHtml}
  
            <div class="kanban-card-actions" style="margin-top: 0.5rem; display: flex; align-items: center; justify-content: space-between;">
              <!-- Mobile Fallback Stage Selectors -->
              <select class="form-control" onchange="shiftLeadStatus('${lead.id}', this.value)" style="padding: 2px 4px; font-size: 0.68rem; height: auto; width: auto; max-width: 90px; background: transparent; border-color: var(--border-color); color: var(--text-secondary); cursor: pointer;">
                <option value="">Move...</option>
                ${stages.map(st => {
                  let disp = st;
                  if (st === 'new') disp = 'New Lead';
                  else if (st === 'contacted') disp = 'Contacted';
                  else if (st === 'inprogress') disp = 'In Progress';
                  else if (st === 'won') disp = 'Working with them (won)';
                  else if (st === 'lost') disp = 'Rejected (lost)';
                  return `<option value="${st}">${disp}</option>`;
                }).join('')}
              </select>
              
              <div style="display: flex; gap: 0.25rem;">
                <button class="kanban-card-btn" onclick="openLeadModal('${lead.id}')" title="Edit Lead">
                  <i data-lucide="edit-3" style="width: 12px; height: 12px;"></i>
                </button>
                <button class="kanban-card-btn" onclick="deleteLead('${lead.id}')" title="Delete Lead" style="color: #EF4444; border-color: rgba(239, 68, 68, 0.2); background: rgba(239, 68, 68, 0.02);">
                  <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i>
                </button>
              </div>
            </div>
          </div>
        `;
      });
    }

    let stageDisplayName = stage;
    if (stage === 'new') stageDisplayName = 'New Lead';
    else if (stage === 'contacted') stageDisplayName = 'Contacted';
    else if (stage === 'inprogress') stageDisplayName = 'In Progress';
    else if (stage === 'won') stageDisplayName = 'Working with them (won)';
    else if (stage === 'lost') stageDisplayName = 'Rejected (lost)';

    boardHtml += `
      <div class="kanban-column" id="kanban-${stage}" ondragover="allowDrop(event)" ondragleave="dragLeave(event)" ondrop="dropLeadCard(event, '${stage}')">
        <div class="kanban-column-header">
          <span class="column-title-wrapper">
            <span class="status-dot" style="background-color: ${dotColor};"></span>
            <h3>${stageDisplayName}</h3>
          </span>
          <span class="kanban-count-badge" id="count-${stage}">${filteredLeads.length}</span>
        </div>
        <div class="kanban-cards-container" id="cards-${stage}">
          ${cardsHtml}
        </div>
      </div>
    `;
  });

  kanbanBoard.innerHTML = boardHtml;
  lucide.createIcons();
}

// 1-Click WhatsApp Quick Action Dispatcher
async function sendQuickWhatsApp(leadId) {
  const hasWhatsAppPerm = currentUser.role === 'Super Admin' || 
                          (currentUser.permissions ? currentUser.permissions.whatsappApi : true);
  if (!hasWhatsAppPerm) {
    showAppNotification('Access Denied', 'You do not have permission to send WhatsApp messages.', 'danger');
    return;
  }

  const lead = leads.find(l => l.id === leadId);
  if (!lead || !lead.phone) {
    showAppNotification('Outreach Failed', 'No telephone number specified.', 'danger');
    return;
  }
  
  const textTemplate = lead.reminderText || "Hi {name}, just a friendly follow-up check-in. Let us know a convenient time to speak.";
  const mergedText = textTemplate.replace(/{name}/g, lead.name);
  
  const metaToken = localStorage.getItem('meta_access_token');
  const isPaid = metaToken && metaToken.trim() !== '';
  
  if (isPaid) {
    showAppNotification('Sending API...', `Sending background WhatsApp to ${lead.name}`, 'info');
    try {
      const originalReminder = lead.reminderText;
      lead.reminderText = mergedText;
      await sendMetaWhatsAppAPI(lead);
      lead.reminderText = originalReminder;
      
      lead.lastOutreachTimestamp = new Date().toLocaleString('en-US', {month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute:'2-digit'});
      saveLeadsToStorage();
      showAppNotification('WhatsApp Sent', `API outreach delivered to ${lead.name}.`, 'success');
      renderLeadsList();
    } catch (err) {
      console.error(err);
      showAppNotification('API Failed', 'Falling back to Click-to-Chat compose.', 'warning');
      window.open(`https://wa.me/${lead.phone.replace(/\D/g, '')}?text=${encodeURIComponent(mergedText)}`, '_blank');
    }
  } else {
    // Free Mode Redirect
    window.open(`https://wa.me/${lead.phone.replace(/\D/g, '')}?text=${encodeURIComponent(mergedText)}`, '_blank');
    showAppNotification('WhatsApp Opened', 'Redirecting to WhatsApp Click-to-Chat.', 'success');
    
    lead.lastOutreachTimestamp = new Date().toLocaleString('en-US', {month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute:'2-digit'});
    saveLeadsToStorage();
    renderLeadsList();
  }
}

// Send Instant Welcome Message to New Lead
async function sendInstantWelcomeMessage(lead) {
  if (!lead || !lead.phone) return;
  
  const rawTemplate = localStorage.getItem('welcome_message_template') || 'Hello {name}! Welcome to our company. How can we help you today?';
  const mergedText = rawTemplate.replace(/{name}/g, lead.name);
  
  const metaToken = localStorage.getItem('meta_access_token');
  const isPaid = metaToken && metaToken.trim() !== '';
  
  if (isPaid) {
    try {
      const originalReminder = lead.reminderText;
      lead.reminderText = mergedText;
      await sendMetaWhatsAppAPI(lead);
      lead.reminderText = originalReminder;
      
      lead.lastOutreachTimestamp = new Date().toLocaleString('en-US', {month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute:'2-digit'});
      saveLeadsToStorage();
      showAppNotification('Welcome Sent', `Auto-welcome message dispatched to ${lead.name}.`, 'success');
    } catch (err) {
      console.error('Welcome API failed:', err);
    }
  } else {
    // Open click-to-chat Welcome automatically on lead save
    setTimeout(() => {
      showAppConfirm(
        "Send WhatsApp Welcome",
        `Do you want to send the WhatsApp Welcome Message to ${lead.name} now?`,
        () => {
          window.open(`https://wa.me/${lead.phone.replace(/\D/g, '')}?text=${encodeURIComponent(mergedText)}`, '_blank');
        }
      );
    }, 500);
  }
}

// Notify Agent when a new lead is captured
async function notifyAgentOnNewLead(lead) {
  const shouldNotify = localStorage.getItem('notify_on_new_lead') === 'true';
  if (!shouldNotify) return;
  
  // Find assigned agent's WhatsApp phone number dynamically
  const agent = agents.find(a => a.name.toLowerCase() === (lead.assignedAgent || '').toLowerCase());
  const agentPhone = agent ? agent.whatsapp : '';
  
  if (!agentPhone) {
    console.log('No agent assigned or registered WhatsApp number found. Skipping notification.');
    return;
  }
  
  const alertText = `🚨 CRM ALERT: A new lead has been captured!\n\nName: ${lead.name}\nDesignation: ${lead.designation || 'N/A'}\nPhone: ${lead.phone || 'N/A'}\nStatus: ${lead.status.toUpperCase()}\nAssigned Agent: ${lead.assignedAgent || 'Unassigned'}`;
  
  const metaToken = localStorage.getItem('meta_access_token');
  const isPaid = metaToken && metaToken.trim() !== '';
  
  if (isPaid) {
    const phoneId = localStorage.getItem('meta_phone_number_id');
    try {
      await fetch(`https://graph.facebook.com/v17.0/${phoneId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${metaToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: agentPhone.replace(/\D/g, ''),
          type: "text",
          text: { body: alertText }
        })
      });
      console.log('Agent notified on WhatsApp.');
    } catch (e) {
      console.error('Agent notification failed:', e);
    }
  } else {
    showAppNotification('Lead Capture Alert', `Captured new lead: ${lead.name}. Dispatching details to agent inbox.`, 'info');
  }
}

// Notify Agent on follow ups due today
async function notifyAgentOnFollowUps() {
  const shouldNotify = localStorage.getItem('notify_on_follow_up') === 'true';
  if (!shouldNotify) return;
  
  const scopedLeads = getScopedLeads();
  const dueLeads = scopedLeads.filter(l => l.nextFollowUp === todayStr && l.status !== 'won' && l.status !== 'lost');
  
  if (dueLeads.length === 0) return;
  
  const metaToken = localStorage.getItem('meta_access_token');
  const isPaid = metaToken && metaToken.trim() !== '';
  const phoneId = localStorage.getItem('meta_phone_number_id');
  
  // Group due leads by assigned agent and dispatch alert to each agent
  agents.forEach(async (agent) => {
    const agentPhone = agent.whatsapp;
    if (!agentPhone) return;
    
    const agentDueLeads = dueLeads.filter(l => (l.assignedAgent || '').toLowerCase() === agent.name.toLowerCase());
    if (agentDueLeads.length === 0) return;
    
    let alertText = `⏰ CRM ALERT: Sarah, you have ${agentDueLeads.length} follow-ups due today!\n`;
    alertText = alertText.replace('Sarah', agent.name);
    
    agentDueLeads.forEach((lead, i) => {
      alertText += `\n${i+1}. ${lead.name} (${lead.phone}) - Notes: ${parseLeadSummary(lead.summary).notes || 'None'}`;
    });
    
    if (isPaid) {
      try {
        await fetch(`https://graph.facebook.com/v17.0/${phoneId}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${metaToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: agentPhone.replace(/\D/g, ''),
            type: "text",
            text: { body: alertText }
          })
        });
        console.log(`Agent ${agent.name} notified on follow-ups.`);
      } catch (e) {
        console.error(`Follow-up notification failed for ${agent.name}:`, e);
      }
    }
  });
}

// Toggle active storage sync targets (Sheets vs Supabase)
function toggleSyncStorageTarget(target) {
  localStorage.setItem('sync_storage_target', target);
  updateSyncButtonLabel(target);
  showAppNotification('Sync Target Changed', `Active database set to ${target === 'turso' ? 'Turso Cloud DB' : 'Google Sheets'}.`, 'success');
}

function updateSyncButtonLabel(target) {
  const btnLabel = document.getElementById('syncBtnLabel');
  if (btnLabel) {
    btnLabel.innerText = target === 'turso' ? 'Sync Cloud DB' : 'Sync Sheets';
  }
}

// Perform active sync dispatch
function triggerSyncNow() {
  const target = localStorage.getItem('sync_storage_target') || 'sheets';
  if (target === 'turso') {
    syncToTurso();
  } else {
    syncToGoogleSheets();
  }
}

// Trigger Auto-Sync on saves/drags
function triggerAutoSync() {
  const target = localStorage.getItem('sync_storage_target') || 'sheets';
  if (target === 'turso') {
    if (localStorage.getItem('turso_url')) {
      syncToTurso();
    }
  } else {
    if (localStorage.getItem('google_sheets_url')) {
      syncToGoogleSheets();
    }
  }
}

// Turso libSQL Cloud Database Sync
async function syncToTurso() {
  try {
    showGlobalLoading("Synchronizing with Turso Cloud Database...");
    await initRemoteDatabase();
    showAppNotification('Sync Successful', 'Successfully synchronized local views with Turso Cloud Database.', 'success');
  } catch (err) {
    showAppNotification('Sync Error', `Turso Sync: ${err.message}`, 'danger');
  } finally {
    hideGlobalLoading();
  }
}

// Central database transaction queries helper for Turso libSQL REST pipeline API
async function executeTursoQueries(statements) {
  const url = localStorage.getItem('turso_url');
  const token = localStorage.getItem('turso_token');
  if (!url || !token) {
    throw new Error("Turso credentials not configured.");
  }
  
  let cleanUrl = url.trim();
  if (cleanUrl.startsWith('libsql://')) {
    cleanUrl = cleanUrl.replace('libsql://', 'https://');
  }
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    cleanUrl = 'https://' + cleanUrl;
  }
  if (cleanUrl.endsWith('/')) {
    cleanUrl = cleanUrl.slice(0, -1);
  }
  
  const requests = statements.map(stmt => ({
    type: "execute",
    stmt: {
      sql: stmt.sql,
      args: stmt.args || []
    }
  }));
  
  const response = await fetch(`${cleanUrl}/v2/pipeline`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ requests })
  });
  
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Turso Sync HTTP ${response.status}: ${errText}`);
  }
  
  const resData = await response.json();
  if (resData.results) {
    resData.results.forEach((r, idx) => {
      if (r.type === 'error') {
        throw new Error(`SQL statement ${idx} failed: ${r.error.message}`);
      }
    });
  }
  return resData;
}

// Parse libSQL pipeline query results into flat key-value objects
function parseTursoRows(resultObj) {
  if (!resultObj || resultObj.type !== 'ok') return [];
  const result = resultObj.response.result;
  if (!result || !result.rows || !result.cols) return [];
  
  const cols = result.cols.map(c => c.name);
  return result.rows.map(row => {
    const obj = {};
    cols.forEach((colName, idx) => {
      const valObj = row[idx];
      let val = null;
      if (valObj && valObj.type !== 'null') {
        val = valObj.value;
      }
      obj[colName] = val;
    });
    return obj;
  });
}

// Format parameter values to libSQL typed JSON structures
function formatSQLArg(val) {
  if (val === null || val === undefined || val === '') {
    return { type: "null" };
  }
  return { type: "text", value: String(val) };
}

// Mapping functions to translate database rows to standard application model objects
function mapAgentFromDb(r) {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    whatsapp: r.whatsapp,
    tenantId: r.tenant_id,
    password: r.password,
    role: r.role,
    permissions: r.permissions ? JSON.parse(r.permissions) : null,
    passwordChanged: Number(r.password_changed) === 1
  };
}

function mapLeadFromDb(r) {
  return {
    id: r.id,
    name: r.name,
    designation: r.designation,
    phone: r.phone,
    email: r.email,
    source: r.source,
    status: r.status,
    lastFollowUp: r.last_follow_up || 'N/A',
    nextFollowUp: r.next_follow_up || 'N/A',
    foundBy: r.found_by,
    summary: r.summary,
    createdDate: r.created_date,
    assignedAgent: r.assigned_agent,
    postUrl: r.post_url,
    tenantId: r.tenant_id,
    organization: r.organization
  };
}

function mapCompanyFromDb(r) {
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    plan: r.plan,
    memberLimit: Number(r.member_limit || 5),
    createdDate: r.created_date
  };
}

function mapDeleteRequestFromDb(r) {
  return {
    id: r.id,
    leadId: r.lead_id,
    requestedBy: r.requested_by,
    reason: r.reason,
    status: r.status,
    createdDate: r.created_date
  };
}

// Initialise remote database tables and sync datasets
async function initRemoteDatabase() {
  if (!currentUser) return;
  try {
    const promises = [];
    const keys = [];

    // 1. Leads
    promises.push(
      fetch(`${API_BASE}/api/leads`, { headers: getAuthHeaders() })
        .then(r => r.ok ? r.json() : [])
        .catch(err => {
          console.warn("Sync: Failed to load leads:", err);
          return JSON.parse(localStorage.getItem('leads_data')) || [];
        })
    );
    keys.push('leads');

    // 2. Delete requests
    const isManagerOrAdmin = currentUser.role === 'Manager' || currentUser.role === 'Super Admin';
    if (isManagerOrAdmin) {
      promises.push(
        fetch(`${API_BASE}/api/delete-requests`, { headers: getAuthHeaders() })
          .then(r => r.ok ? r.json() : [])
          .catch(err => {
            console.warn("Sync: Failed to load delete requests:", err);
            return [];
          })
      );
      keys.push('deleteRequests');
    }

    // 3. Agents
    promises.push(
      fetch(`${API_BASE}/api/agents`, { headers: getAuthHeaders() })
        .then(r => r.ok ? r.json() : [])
        .catch(err => {
          console.warn("Sync: Failed to load agents:", err);
          return JSON.parse(localStorage.getItem('crm_agents')) || [];
        })
    );
    keys.push('agents');

    // 4. Companies / Info
    if (currentUser.role === 'Super Admin') {
      promises.push(
        fetch(`${API_BASE}/api/companies`, { headers: getAuthHeaders() })
          .then(r => r.ok ? r.json() : [])
          .catch(err => {
            console.warn("Sync: Failed to load companies:", err);
            return JSON.parse(localStorage.getItem('crm_companies')) || [];
          })
      );
      keys.push('companies');
    } else {
      promises.push(
        fetch(`${API_BASE}/api/companies/info`, { headers: getAuthHeaders() })
          .then(r => r.ok ? r.json() : null)
          .catch(err => {
            console.warn("Sync: Failed to load company info:", err);
            return null;
          })
      );
      keys.push('companyInfo');
    }

    // 4b. Tutorials
    promises.push(
      fetch(`${API_BASE}/api/tutorials`, { headers: getAuthHeaders() })
        .then(r => r.ok ? r.json() : [])
        .catch(err => {
          console.warn("Sync: Failed to load tutorials:", err);
          return [];
        })
    );
    keys.push('tutorials');

    // 5. Invoices
    const isCEO = currentUser.ceoEmail && currentUser.email && currentUser.email.toLowerCase() === currentUser.ceoEmail.toLowerCase();
    const hasInvoicePerm = currentUser.permissions && currentUser.permissions.createInvoice === true;
    if (isCEO || currentUser.role === 'Super Admin' || hasInvoicePerm) {
      promises.push(
        fetch(`${API_BASE}/api/invoices`, { headers: getAuthHeaders() })
          .then(r => r.ok ? r.json() : [])
          .catch(err => {
            console.warn("Sync: Failed to load invoices:", err);
            return [];
          })
      );
      keys.push('invoices');
    }

    const results = await Promise.all(promises);
    
    // Assign results to variables
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const val = results[i];
      if (key === 'leads') {
        leads = val;
        saveLeadsToStorage();
      } else if (key === 'deleteRequests') {
        deleteRequests = val;
        saveDeleteRequestsToStorage();
      } else if (key === 'agents') {
        agents = val;
        saveAgentsToStorage();
        
        // Dynamic profile & permissions sync
        const freshSelf = agents.find(a => a.id === currentUser.id);
        if (freshSelf) {
          currentUser.permissions = typeof freshSelf.permissions === 'string' ? JSON.parse(freshSelf.permissions) : freshSelf.permissions;
          currentUser.role = freshSelf.role;
          currentUser.name = freshSelf.name;
          localStorage.setItem('crm_current_user', JSON.stringify(currentUser));
          applyUserRoleUIVisibility();
        }
      } else if (key === 'companies') {
        companies = val;
        saveCompaniesToStorage();
      } else if (key === 'companyInfo') {
        companyInfo = val;
      } else if (key === 'invoices') {
        invoices = val;
      } else if (key === 'tutorials') {
        platformTutorials = val;
      }
    }

    console.log("Portal successfully loaded data from backend API in parallel.");
    showAppNotification('Connected', 'Portal data synchronized with API server.', 'success');

    // Re-render UI components with freshly synced DB data
    updateIndustryDropdowns();
    populateAgentDropdowns();
    renderTeamMembers();
    renderSalesLeaderboard();
    populateFoundByFilter();
    
    // Re-render charts and Kanban pipeline
    renderDashboard();
    renderKanbanBoard();
    
    // Apply filters to recalculate filteredLeads and render main board + metrics smoothly
    applyFilters();
    
    if (currentUser.role === 'Super Admin') {
      renderSaasTenants();
      populateTenantDropdown();
      renderSaasTutorials();
      
      const inspectSelect = document.getElementById('dbInspectorTableSelect');
      if (inspectSelect && inspectSelect.value) {
        inspectDatabaseTable(inspectSelect.value);
      }
    }
    
    if (typeof renderDeleteRequests === 'function') {
      renderDeleteRequests();
    }
    
    updateCompanyBrandingHeader();

  } catch (err) {
    console.error("Failed to sync with backend API:", err);
    showAppNotification('Sync Warning', `Could not sync: ${err.message}. Using offline cache.`, 'warning');
  }
}

// Scoping filters for multi-tenant SaaS hierarchy
function getScopedLeads() {
  if (currentUser.role === 'Super Admin') {
    if (activeTenantId === 'all') {
      return leads;
    }
    return leads.filter(l => (l.tenantId || 'tenant-abc') === activeTenantId);
  }
  
  // Scoped strictly to company tenant ID
  const tenantLeads = leads.filter(l => (l.tenantId || 'tenant-abc') === currentUser.tenantId);
  
  const viewAll = currentUser.permissions ? currentUser.permissions.viewAllLeads : (currentUser.role !== 'Sales Agent');
  const isCEO = currentUser.role === 'Super Admin' || currentUser.role === 'Manager' || currentUser.role === 'Admin' || (currentUser.ceoEmail && currentUser.email && currentUser.email.toLowerCase() === currentUser.ceoEmail.toLowerCase());
  const userPerms = (currentUser && currentUser.permissions) ? (typeof currentUser.permissions === 'string' ? JSON.parse(currentUser.permissions) : currentUser.permissions) : {};
  
  let scoped = tenantLeads;
  if (!viewAll) {
    scoped = tenantLeads.filter(l => (l.assignedAgent || '').toLowerCase().includes(currentUser.name.toLowerCase().split(' ')[0]));
  }
  
  if (!isCEO && (userPerms.viewWon === false || userPerms.viewWonClients === false)) {
    scoped = scoped.filter(l => l.status !== 'won' && l.status !== 'Working with them (won)');
  }

  return scoped;
}

// Switch tenant view context (Super Admin only)
function switchTenantContext(tenantId) {
  activeTenantId = tenantId;
  localStorage.setItem('saas_active_tenant_id', tenantId);
  
  // Refresh views
  applyUserRoleUIVisibility();
  populateAgentDropdowns();
  renderDashboard();
  renderTeamMembers();
  applyFilters();
  
  showAppNotification('Context Changed', `Viewing data context for ${tenantId === 'all' ? 'All Companies' : tenantId}.`, 'success');
}

// Switch current logged in session (Impersonation / Role Switching)
function switchCurrentUserRole(roleKey) {
  const savedActualUser = localStorage.getItem('crm_actual_user');
  const actualUser = savedActualUser ? JSON.parse(savedActualUser) : null;
  
  if (!actualUser) {
    showAppNotification('Error', 'Unable to retrieve actual user session context.', 'danger');
    return;
  }

  if (roleKey === 'super-admin' || roleKey === 'org-admin') {
    // Switch back to original logged-in session
    currentUser = actualUser;
  } else if (roleKey.startsWith('agent-')) {
    const agentId = roleKey.replace('agent-', '');
    const targetAgent = agents.find(a => a.id === agentId);
    if (targetAgent) {
      currentUser = {
        id: targetAgent.id,
        name: targetAgent.name,
        email: targetAgent.email,
        role: targetAgent.role || 'Sales Agent',
        tenantId: targetAgent.tenantId,
        ceoEmail: actualUser.ceoEmail || '',
        organization: targetAgent.organization || actualUser.organization || '',
        tenantName: targetAgent.tenantName || actualUser.tenantName || '',
        permissions: typeof targetAgent.permissions === 'string' ? JSON.parse(targetAgent.permissions) : targetAgent.permissions
      };
    }
  } else if (roleKey === 'sales-agent') {
    // Fallback switch to default Sales Agent Sarah or scoped fallback
    const companySales = agents.find(a => a.tenantId === actualUser.tenantId && a.role === 'Sales Agent');
    if (companySales) {
      currentUser = {
        id: companySales.id,
        name: companySales.name,
        email: companySales.email,
        role: 'Sales Agent',
        tenantId: companySales.tenantId,
        ceoEmail: actualUser.ceoEmail || '',
        organization: companySales.organization || actualUser.organization || '',
        tenantName: companySales.tenantName || actualUser.tenantName || '',
        permissions: typeof companySales.permissions === 'string' ? JSON.parse(companySales.permissions) : companySales.permissions
      };
    } else {
      currentUser = {
        name: 'Sarah (Sales)',
        email: 'sarah@abc.com',
        role: 'Sales Agent',
        tenantId: actualUser.tenantId,
        ceoEmail: actualUser.ceoEmail || '',
        organization: actualUser.organization || '',
        tenantName: actualUser.tenantName || ''
      };
    }
  }
  
  localStorage.setItem('crm_current_user', JSON.stringify(currentUser));
  
  // Apply role UI visibility rules
  applyUserRoleUIVisibility();
  updateCompanyBrandingHeader();
  updateUserProfileDisplay();
  
  // Refresh views
  populateAgentDropdowns();
  renderDashboard();
  renderTeamMembers();
  applyFilters();
  
  // Asynchronously synchronize remote database pipeline
  initRemoteDatabase();
  
  showAppNotification('Logged In', `Switched session to ${currentUser.name} (${getUserDisplayRole(currentUser)}).`, 'success');
}

// Set up UI components accessibility
function applyUserRoleUIVisibility() {
  // Manage role switcher container and filtered options based on original authenticated user
  const switcherContainer = document.getElementById('sessionUserSwitcherContainer');
  const switcher = document.getElementById('currentUserRoleSelect');

  if (switcherContainer && switcher) {
    const savedActualUser = localStorage.getItem('crm_actual_user');
    const actualUser = savedActualUser ? JSON.parse(savedActualUser) : currentUser;

    if (!actualUser) {
      switcherContainer.style.display = 'none';
    } else {
      const isSuperAdmin = actualUser.role === 'Super Admin';
      const isCompanyOwner = actualUser.ceoEmail && actualUser.email.toLowerCase() === actualUser.ceoEmail.toLowerCase();

      // Only Super Admin and the actual Company Owner (CEO) can see the role switcher
      if (isSuperAdmin || isCompanyOwner) {
        switcherContainer.style.display = 'flex';
        
        if (isSuperAdmin) {
          let optionsHtml = `<option value="super-admin">Super Admin (Back to Self)</option>`;
          
          if (agents.length > 0) {
            // Group agents by company name
            const companiesMap = {};
            agents.forEach(agent => {
              if (agent.role === 'Super Admin') return;
              const org = agent.organization || agent.tenantName || agent.tenantId || 'Unassigned Company';
              if (!companiesMap[org]) companiesMap[org] = [];
              companiesMap[org].push(agent);
            });

            for (const orgName in companiesMap) {
              optionsHtml += `<optgroup label="${orgName}">`;
              companiesMap[orgName].forEach(agent => {
                const dispRole = agent.email && agent.ceoEmail && agent.email.toLowerCase() === agent.ceoEmail.toLowerCase() ? 'CEO' : agent.role;
                optionsHtml += `<option value="agent-${agent.id}">${agent.name} (${dispRole})</option>`;
              });
              optionsHtml += `</optgroup>`;
            }
          }
          switcher.innerHTML = optionsHtml;
          
          // Bind value
          if (currentUser && currentUser.role === 'Super Admin') {
            switcher.value = 'super-admin';
          } else if (currentUser && currentUser.id) {
            switcher.value = `agent-${currentUser.id}`;
          }
        } else {
          // Company Owner impersonation dropdown
          let optionsHtml = `<option value="org-admin">CEO / Admin: ${actualUser.name} (Back to Self)</option>`;
          
          // Filter agents of the same company (except the CEO themselves)
          const myAgents = agents.filter(a => a.tenantId === actualUser.tenantId && a.id !== actualUser.id);
          
          if (myAgents.length > 0) {
            optionsHtml += `<optgroup label="Impersonate Team Member">`;
            myAgents.forEach(agent => {
              optionsHtml += `<option value="agent-${agent.id}">${agent.name} (${agent.role})</option>`;
            });
            optionsHtml += `</optgroup>`;
          }
          switcher.innerHTML = optionsHtml;
          
          // Bind value
          if (currentUser && currentUser.id === actualUser.id) {
            switcher.value = 'org-admin';
          } else if (currentUser && currentUser.id) {
            switcher.value = `agent-${currentUser.id}`;
          }
        }
      } else {
        switcherContainer.style.display = 'none';
      }
    }
  }

  const navSettings = document.getElementById('nav-settings');
  const navTeam = document.getElementById('nav-team');
  const navSaas = document.getElementById('nav-saas');
  const syncContainer = document.getElementById('syncStorageTargetContainer');
  const bulkImportBtn = document.querySelector('[title="Bulk Import Leads via CSV"]');
  const tenantSwitcher = document.getElementById('saasTenantContextContainer');
  
  // Reset visibility
  if (navSettings) navSettings.style.display = 'block';
  if (navTeam) navTeam.style.display = 'none';
  if (navSaas) navSaas.style.display = 'none';
  if (syncContainer) syncContainer.style.display = 'none';
  if (bulkImportBtn) bulkImportBtn.style.display = 'none';
  if (tenantSwitcher) tenantSwitcher.style.display = 'none';

  // Prepopulate Owner's company name and disable it for Managers
  const orgInput = document.getElementById('agentOrganization');
  const orgContainer = document.getElementById('agentOrgContainer');
  if (orgInput && currentUser) {
    if (currentUser.role === 'Super Admin') {
      if (orgContainer) orgContainer.style.display = 'block';
      orgInput.disabled = false;
    } else {
      if (orgContainer) orgContainer.style.display = 'none';
      orgInput.value = currentUser.tenantId;
      orgInput.disabled = true;
    }
  }

  // Render pending delete requests approval widget
  renderDeleteRequests();
  
  const isSuperAdmin = currentUser ? currentUser.role === 'Super Admin' : false;
  const isCEO = currentUser ? (currentUser.ceoEmail && currentUser.email.toLowerCase() === currentUser.ceoEmail.toLowerCase()) : false;
  const hasAddAgentPermission = currentUser ? (currentUser.permissions && currentUser.permissions.addAgent === true) : false;
  const registerCard = document.getElementById('registerAgentCard');
  if (registerCard) {
    if (isSuperAdmin || isCEO || hasAddAgentPermission) {
      registerCard.style.display = 'block';
    } else {
      registerCard.style.display = 'none';
    }
  }

  const navBilling = document.getElementById('nav-billing');
  if (navBilling) navBilling.style.display = 'none';
  const hasInvoicePerm = currentUser ? (currentUser.permissions && currentUser.permissions.createInvoice === true) : false;

  if (isSuperAdmin || isCEO || hasInvoicePerm) {
    if (navBilling) navBilling.style.display = 'block';
  } else {
    if (activeTab === 'billing') {
      switchTab('dashboard');
    }
  }

  const navRecruitment = document.getElementById('nav-recruitment');
  const navMyClients = document.getElementById('nav-my-clients');
  const navSignals = document.getElementById('nav-signals');
  const navTalentDb = document.getElementById('nav-talent-db');
  const navInterviews = document.getElementById('nav-interviews');
  const headerHr = document.getElementById('header-hr');
  const divHr = document.getElementById('div-hr');

  const navLoanCalculator = document.getElementById('nav-loan-calculator');
  const navLoanPayouts = document.getElementById('nav-loan-payouts');
  const navCibilCheck = document.getElementById('nav-cibil-check');
  const headerDsa = document.getElementById('header-dsa');
  const divDsa = document.getElementById('div-dsa');

  let currentIndustry = '';
  if (currentUser && currentUser.role === 'Super Admin') {
    if (activeTenantId && activeTenantId !== 'all') {
      const activeCompany = companies.find(c => String(c.id) === String(activeTenantId));
      if (activeCompany) currentIndustry = activeCompany.industry || '';
    }
  } else {
    currentIndustry = (companyInfo && companyInfo.industry) || (currentUser && currentUser.industry) || '';
  }

  const isRecruitmentCRM = currentIndustry.toLowerCase().includes('recruitment');
  const isLoanDsaCRM = currentIndustry.toLowerCase().includes('loan dsa') || currentIndustry.toLowerCase().includes('loan');

  let isTalentDbEnabled = true;
  if (currentUser && currentUser.role === 'Super Admin') {
    if (activeTenantId && activeTenantId !== 'all') {
      const activeCompany = companies.find(c => String(c.id) === String(activeTenantId));
      if (activeCompany) {
        isTalentDbEnabled = activeCompany.talentDbEnabled !== 0;
      }
    }
  } else {
    isTalentDbEnabled = !companyInfo || companyInfo.talentDbEnabled !== 0;
  }

  // Branding badge text
  const brandingBadge = document.getElementById('tenantBrandingBadge');
  if (brandingBadge) {
    if (isRecruitmentCRM) {
      brandingBadge.textContent = "Recruitment CRM";
    } else if (isLoanDsaCRM) {
      brandingBadge.textContent = "Loan DSA CRM";
    } else {
      brandingBadge.textContent = "NeoGenCode SaaS";
    }
  }

  if (isRecruitmentCRM) {
    if (headerHr) headerHr.style.display = 'block';
    if (divHr) divHr.style.display = 'block';
    if (navRecruitment) navRecruitment.style.display = 'block';
    if (navMyClients) navMyClients.style.display = 'block';
    if (navSignals) navSignals.style.display = 'block';
    if (navInterviews) navInterviews.style.display = 'block';
    if (navTalentDb) navTalentDb.style.display = isTalentDbEnabled ? 'block' : 'none';

    if (headerDsa) headerDsa.style.display = 'none';
    if (divDsa) divDsa.style.display = 'none';
    if (navLoanCalculator) navLoanCalculator.style.display = 'none';
    if (navLoanPayouts) navLoanPayouts.style.display = 'none';
  } else if (isLoanDsaCRM) {
    if (headerHr) headerHr.style.display = 'none';
    if (divHr) divHr.style.display = 'none';
    if (navRecruitment) navRecruitment.style.display = 'none';
    if (navMyClients) navMyClients.style.display = 'none';
    if (navSignals) navSignals.style.display = 'none';
    if (navInterviews) navInterviews.style.display = 'none';
    if (navTalentDb) navTalentDb.style.display = 'none';

    if (headerDsa) headerDsa.style.display = 'block';
    if (divDsa) divDsa.style.display = 'block';
    if (navLoanCalculator) navLoanCalculator.style.display = 'block';
    if (navLoanPayouts) navLoanPayouts.style.display = 'block';
    if (navCibilCheck) navCibilCheck.style.display = 'block';

    if (activeTab === 'recruitment' || activeTab === 'my-clients' || activeTab === 'signals' || activeTab === 'talent-db' || activeTab === 'interviews') {
      switchTab('dashboard');
    }
  } else {
    if (headerHr) headerHr.style.display = 'none';
    if (divHr) divHr.style.display = 'none';
    if (navRecruitment) navRecruitment.style.display = 'none';
    if (navMyClients) navMyClients.style.display = 'none';
    if (navSignals) navSignals.style.display = 'none';
    if (navInterviews) navInterviews.style.display = 'none';
    if (navTalentDb) navTalentDb.style.display = 'none';

    if (headerDsa) headerDsa.style.display = 'none';
    if (divDsa) divDsa.style.display = 'none';
    if (navLoanCalculator) navLoanCalculator.style.display = 'none';
    if (navLoanPayouts) navLoanPayouts.style.display = 'none';
    if (navCibilCheck) navCibilCheck.style.display = 'none';

    if (activeTab === 'recruitment' || activeTab === 'my-clients' || activeTab === 'signals' || activeTab === 'talent-db' || activeTab === 'interviews' || activeTab === 'loan-calculator' || activeTab === 'loan-payouts' || activeTab === 'cibil-check') {
      switchTab('dashboard');
    }
  }

  const navRecycleBin = document.getElementById('nav-recycle-bin');
  if (navRecycleBin) {
    navRecycleBin.style.display = (isSuperAdmin || isCEO) ? 'block' : 'none';
  }

  const userPerms = (currentUser && currentUser.permissions) ? (typeof currentUser.permissions === 'string' ? JSON.parse(currentUser.permissions) : currentUser.permissions) : {};
  if (navSettings && !isSuperAdmin && !isCEO && (userPerms.hideSyncSettings === true || userPerms.hideSync === true)) {
    navSettings.style.display = 'none';
  }

  // Hide recruitment-specific checkboxes in Team Members form for non-recruitment tenants
  const recOnlyCheckboxes = [
    'permAddLeadCandidate', 'permAddJobPost', 'permHideSignals', 
    'permHideRecruitment', 'permHideInterviews', 'editPermAddLeadCandidate', 'editPermAddJobPost'
  ];

  recOnlyCheckboxes.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      const label = el.closest('label') || el;
      label.style.display = isRecruitmentCRM ? 'flex' : 'none';
    }
  });

  if (isSuperAdmin) {
    if (navSettings) navSettings.style.display = 'block';
    if (navTeam) navTeam.style.display = 'block';
    if (navSaas) navSaas.style.display = 'block';
    if (syncContainer) syncContainer.style.display = 'flex';
    if (bulkImportBtn) bulkImportBtn.style.display = 'inline-flex';
    if (tenantSwitcher) {
      tenantSwitcher.style.display = 'flex';
      populateTenantDropdown();
    }
  } else if (currentUser && (currentUser.role === 'Manager' || currentUser.role === 'Team Lead' || hasAddAgentPermission)) {
    if (navTeam) navTeam.style.display = 'block'; // Allowed to see team members tab
  } else if (currentUser && currentUser.role === 'Sales Agent') {
    // Redirect if they were inside restricted views
    if (activeTab === 'team' || activeTab === 'saas') {
      switchTab('dashboard');
    }
  }

  // Handle Create Job Button Permission
  const createJobBtn = document.querySelector('button[onclick="openJobModal()"]');
  if (createJobBtn) {
    const userPerms = (currentUser && currentUser.permissions) ? (typeof currentUser.permissions === 'string' ? JSON.parse(currentUser.permissions) : currentUser.permissions) : {};
    const isCEO = currentUser && currentUser.ceoEmail && currentUser.email.toLowerCase() === currentUser.ceoEmail.toLowerCase();
    const isSuperAdmin = currentUser && currentUser.role === 'Super Admin';
    const isAdmin = currentUser && (currentUser.role === 'Manager' || currentUser.role === 'Admin');
    const canAddJob = isSuperAdmin || isCEO || isAdmin || userPerms.addJobPost !== false;
    
    if (canAddJob) {
      createJobBtn.style.display = 'inline-flex';
    } else {
      createJobBtn.style.display = 'none';
    }
  }

  // Apply granular sidebar menu hiding permissions
  if (currentUser && currentUser.role !== 'Super Admin') {
    const userPerms = (currentUser.permissions) ? (typeof currentUser.permissions === 'string' ? JSON.parse(currentUser.permissions) : currentUser.permissions) : {};
    
    const mappings = {
      hideDashboard: { id: 'nav-dashboard', tab: 'dashboard' },
      hideLeads: { id: 'nav-leads', tab: 'leads' },
      hidePipeline: { id: 'nav-pipeline', tab: 'pipeline' },
      hideReminders: { id: 'nav-reminders', tab: 'reminders' },
      hideOutreach: { id: 'nav-outreach', tab: 'outreach' },
      hideClients: { id: 'nav-my-clients', tab: 'my-clients' },
      hideSignals: { id: 'nav-signals', tab: 'signals' },
      hideRecruitment: { id: 'nav-recruitment', tab: 'recruitment' },
      hideInterviews: { id: 'nav-interviews', tab: 'interviews' },
      hideTeam: { id: 'nav-team', tab: 'team' },
      hideBilling: { id: 'nav-billing', tab: 'billing' },
      hideSettings: { id: 'nav-settings', tab: 'settings' }
    };

    let redirected = false;
    for (const key in mappings) {
      if (userPerms[key] === true) {
        const el = document.getElementById(mappings[key].id);
        if (el) el.style.display = 'none';
        
        if (activeTab === mappings[key].tab && !redirected) {
          const fallbackTabs = ['dashboard', 'leads', 'pipeline', 'reminders', 'outreach', 'my-clients', 'signals', 'recruitment', 'interviews', 'team', 'billing'];
          const allowedFallback = fallbackTabs.find(t => {
            const restrictionKey = Object.keys(mappings).find(k => mappings[k].tab === t);
            return !restrictionKey || userPerms[restrictionKey] !== true;
          });
          if (allowedFallback) {
            switchTab(allowedFallback);
            redirected = true;
          }
        }
      }
    }

    const salesIds = ['nav-dashboard', 'nav-leads', 'nav-pipeline', 'nav-reminders', 'nav-outreach'];
    const showSalesHeader = salesIds.some(id => {
      const el = document.getElementById(id);
      return el && el.style.display !== 'none';
    });
    const headerSales = document.getElementById('header-sales');
    if (headerSales) headerSales.style.display = showSalesHeader ? 'block' : 'none';

    const sharedIds = ['nav-my-clients', 'nav-signals'];
    const showSharedHeader = sharedIds.some(id => {
      const el = document.getElementById(id);
      return el && el.style.display !== 'none';
    });
    const headerShared = document.getElementById('header-shared');
    const divShared = document.getElementById('div-shared');
    if (headerShared) headerShared.style.display = showSharedHeader ? 'block' : 'none';
    if (divShared) divShared.style.display = showSharedHeader ? 'block' : 'none';

    const hrIds = ['nav-recruitment', 'nav-interviews'];
    const showHrHeader = hrIds.some(id => {
      const el = document.getElementById(id);
      return el && el.style.display !== 'none';
    });
    const headerHr = document.getElementById('header-hr');
    const divHr = document.getElementById('div-hr');
    if (headerHr) headerHr.style.display = showHrHeader ? 'block' : 'none';
    if (divHr) divHr.style.display = showHrHeader ? 'block' : 'none';

    const adminIds = ['nav-team', 'nav-billing', 'nav-saas', 'nav-settings'];
    const showAdminHeader = adminIds.some(id => {
      const el = document.getElementById(id);
      return el && el.style.display !== 'none';
    });
    const headerAdmin = document.getElementById('header-admin');
    const divAdmin = document.getElementById('div-admin');
    if (headerAdmin) headerAdmin.style.display = showAdminHeader ? 'block' : 'none';
    if (divAdmin) divAdmin.style.display = showAdminHeader ? 'block' : 'none';
  }
}

// Populate Tenant Dropdown context selector
function populateTenantDropdown() {
  const select = document.getElementById('saasTenantContextSelect');
  if (!select) return;
  
  let html = '<option value="all">All Companies (Global)</option>';
  companies.forEach(c => {
    html += `<option value="${c.id}">${c.name}</option>`;
  });
  select.innerHTML = html;
  select.value = activeTenantId;
}

// Provision Tenant Company
async function handleTenantSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('saasTenantName').value.trim();
  const email = document.getElementById('saasTenantEmail').value.trim();
  const plan = document.getElementById('saasTenantPlan').value;
  const industry = document.getElementById('saasTenantIndustry').value;
  const maxMembers = parseInt(document.getElementById('saasTenantMaxMembers').value) || 5;
  const storageLimit = parseInt(document.getElementById('saasTenantStorageLimit').value) || 5;
  
  const talentDbEnabled = document.getElementById('saasTenantTalentDbEnabled') ? (document.getElementById('saasTenantTalentDbEnabled').checked ? 1 : 0) : 1;
  
  if (!name || !email) return;
  
  // Generate random 6-character alphanumeric temp password
  const tempPassword = 'NG-' + Math.random().toString(36).substring(2, 6).toUpperCase();
  
  try {
    showGlobalLoading("Provisioning organization workspace...");
    const response = await fetch(`${API_BASE}/api/companies`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        name,
        plan,
        memberLimit: maxMembers,
        ceoEmail: email,
        ceoPassword: tempPassword,
        industry,
        storageLimitMb: storageLimit,
        talentDbEnabled
      })
    });
    
    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || "Failed to provision tenant");
    }
    
    // Dispatch actual Welcome Email via EmailJS
    const welcomeSubject = `Welcome to NeoGenCode CRM - Your Credentials`;
    const welcomeMessage = `Hello CEO,\n\nYour company workspace "${name}" has been successfully provisioned on NeoGenCode CRM.\n\nHere are your access credentials:\n- Login URL: ${window.location.origin}${window.location.pathname}\n- Username/Email: ${email}\n- Temporary Password: ${tempPassword}\n\nPlease reset your password on your first login to secure your account.\n\nBest regards,\nNeoGenCode Super Admin Team`;
    sendEmailViaJS(email, `CEO @ ${name}`, welcomeSubject, welcomeMessage);
    
    document.getElementById('saasTenantForm').reset();
    await initRemoteDatabase();
    
    showAppAlert(
      "Tenant Provisioned Successfully",
      `Company: ${name}\nCEO Email: ${email}\nTemporary Password: ${tempPassword}\nMax Team Limit: ${maxMembers}\n\nThis temporary password has been queued for automated email delivery via EmailJS. The client will be forced to choose a new password on their first login.`
    );
  } catch (err) {
    showAppNotification('Provisioning Failed', err.message, 'danger');
  } finally {
    hideGlobalLoading();
  }
}

// Render SaaS Panel List
function renderSaasTenants() {
  const tbody = document.getElementById('saasTenantsTableBody');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  companies.forEach(c => {
    const isSuspended = c.status === 'Suspended';
    const statusColor = isSuspended ? 'background-color: rgba(239, 68, 68, 0.1); color: #EF4444;' : 'background-color: rgba(52, 211, 153, 0.1); color: #34D399;';
    
    const companyDisplayName = c.name || c.companyName || 'N/A';
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="padding: 0.85rem 1rem; font-weight: 600; color: var(--text-primary);">${escapeHTML(companyDisplayName)}</td>
      <td style="padding: 0.85rem 1rem; color: var(--text-muted); font-size: 0.72rem; font-family: monospace;">${escapeHTML(c.id || '')}</td>
      <td style="padding: 0.85rem 1rem;"><span class="file-format-badge" style="background-color: rgba(147, 51, 234, 0.08); color: var(--accent-purple);">${escapeHTML(c.plan || 'Free')}</span></td>
      <td style="padding: 0.85rem 1rem; color: var(--text-secondary); font-weight: 500;">${c.memberLimit || 5} Agents / ${c.storageLimitMb || 5} MB</td>
      <td style="padding: 0.85rem 1rem;"><span class="file-format-badge" style="${statusColor}">${escapeHTML(c.status || 'Active')}</span></td>
      <td style="padding: 0.85rem 1rem; color: var(--text-secondary);">${escapeHTML(c.createdDate || '')}</td>
      <td style="padding: 0.85rem 1rem; text-align: right;">
        <div style="display: flex; gap: 0.35rem; justify-content: flex-end;">
          <button class="outreach-action-btn" onclick="editCompanyDetails('${c.id}')" title="Edit Tenant Details" style="color: var(--accent-purple); border-color: rgba(168, 85, 247, 0.2); background: rgba(168, 85, 247, 0.03);">
            <i data-lucide="edit-3"></i>
          </button>
          <button class="outreach-action-btn" onclick="toggleCompanyStatus('${c.id}')" title="Suspend/Activate" style="color: #F59E0B; border-color: rgba(245, 158, 11, 0.2); background: rgba(245, 158, 11, 0.03);">
            <i data-lucide="power"></i>
          </button>
          <button class="outreach-action-btn" onclick="impersonateCompany('${c.id}')" title="Impersonate Admin" style="color: var(--accent-blue); border-color: rgba(14, 165, 233, 0.2); background: rgba(14, 165, 233, 0.03);">
            <i data-lucide="user-check"></i>
          </button>
          <button class="outreach-action-btn" onclick="deleteCompany('${c.id}')" title="Remove Company" style="color: #EF4444; border-color: rgba(239, 68, 68, 0.2); background: rgba(239, 68, 68, 0.03);">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
  
  // Tally KPIs
  document.getElementById('saasMetricTenants').innerText = companies.length;
  document.getElementById('saasMetricSuspended').innerText = companies.filter(c => c.status === 'Suspended').length;
  
  // Calculate MRR
  let mrr = 0;
  companies.forEach(c => {
    if (c.status === 'Active') {
      if (c.plan === 'Starter') mrr += 99;
      else if (c.plan === 'Enterprise') mrr += 499;
    }
  });
  document.getElementById('saasMetricMrr').innerText = `$${mrr.toLocaleString()}`;
  
  lucide.createIcons();
}

// Toggle Company Workspace Status
async function toggleCompanyStatus(id) {
  const company = companies.find(c => c.id === id);
  if (!company) return;
  
  const originalStatus = company.status;
  const newStatus = originalStatus === 'Active' ? 'Suspended' : 'Active';
  
  try {
    const response = await fetch(`${API_BASE}/api/companies/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        name: company.name,
        plan: company.plan,
        memberLimit: company.memberLimit,
        status: newStatus
      })
    });
    
    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || "Failed to update status");
    }
    
    showAppNotification('Status Toggled', `${company.name} is now ${newStatus}.`, 'warning');
    await initRemoteDatabase();
  } catch (err) {
    showAppNotification('Error', err.message, 'danger');
  }
}

// Delete Company Tenant
async function deleteCompany(id) {
  const company = companies.find(c => c.id === id);
  if (!company) return;
  
  showAppConfirm(
    "Caution: Permanent Purge",
    `Are you sure you want to permanently delete company "${company.name}"? This deletes all their database leads, team configurations, and subscriptions.`,
    async () => {
      try {
        showGlobalLoading("Purging company tenant database...");
        const response = await fetch(`${API_BASE}/api/companies/${id}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || "Failed to delete company");
        }
        
        showAppNotification('Tenant Deleted', 'Company database has been completely purged.', 'danger');
        await initRemoteDatabase();
      } catch (err) {
        showAppNotification('Deletion Failed', err.message, 'danger');
      } finally {
        hideGlobalLoading();
      }
    }
  );
}

// Impersonate Company Owner/Admin
function impersonateCompany(id) {
  const company = companies.find(c => c.id === id);
  if (!company) return;
  
  // Find owner
  const owner = agents.find(a => a.tenantId === id && a.role === 'Manager');
  if (!owner) {
    showAppNotification('Impersonation Failed', 'No company owner registered for this tenant.', 'danger');
    return;
  }
  
  currentUser = {
    name: owner.name,
    email: owner.email,
    role: 'Manager',
    tenantId: id
  };
  localStorage.setItem('crm_current_user', JSON.stringify(currentUser));
  
  // Set Selector to match
  document.getElementById('currentUserRoleSelect').value = 'org-admin';
  
  applyUserRoleUIVisibility();
  populateAgentDropdowns();
  renderDashboard();
  renderTeamMembers();
  applyFilters();
  
  showAppNotification('Impersonation Active', `Audit Logged: Switched to CEO view for ${company.name}.`, 'success');
}

// Request Lead Deletion (Sales Agents Workflow)
function requestLeadDeletion(leadId) {
  const lead = leads.find(l => l.id === leadId);
  if (!lead) return;
  
  const isDuplicate = deleteRequests.some(r => r.leadId === leadId);
  if (isDuplicate) {
    showAppNotification('Request Pending', 'A deletion request for this lead has already been sent.', 'warning');
    return;
  }
  
  const req = {
    id: 'req-' + Date.now(),
    leadId,
    leadName: lead.name,
    requestedBy: currentUser.name,
    tenantId: currentUser.tenantId || 'tenant-abc',
    requestDate: new Date().toISOString().split('T')[0]
  };
  
  deleteRequests.push(req);
  saveDeleteRequestsToStorage();
  
  showAppNotification('Request Sent', `Deletion request for ${lead.name} sent to CEO for approval.`, 'info');
}

// Render Pending Approvals in Dashboard for Owners
function renderDeleteRequests() {
  const container = document.getElementById('pendingDeleteRequestsContainer');
  const tbody = document.getElementById('deleteRequestsTableBody');
  if (!container || !tbody) return;
  
  // Owner only sees requests in their own company
  const scopedRequests = deleteRequests.filter(r => r.tenantId === currentUser.tenantId);
  
  if (currentUser.role === 'Manager' && scopedRequests.length > 0) {
    container.style.display = 'block';
    tbody.innerHTML = '';
    
    scopedRequests.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding: 0.75rem 1rem; font-weight: 600; color: var(--text-primary);">${r.leadName}</td>
        <td style="padding: 0.75rem 1rem; color: var(--text-secondary);">${r.requestedBy}</td>
        <td style="padding: 0.75rem 1rem; color: var(--text-muted);">${r.requestDate}</td>
        <td style="padding: 0.75rem 1rem; text-align: right;">
          <div style="display: flex; gap: 0.35rem; justify-content: flex-end;">
            <button class="outreach-action-btn" onclick="approveDeleteRequest('${r.id}')" title="Approve & Delete" style="color: #34D399; border-color: rgba(52, 211, 243, 0.2); background: rgba(52, 211, 243, 0.02);">
              <i data-lucide="check-circle"></i>
            </button>
            <button class="outreach-action-btn" onclick="rejectDeleteRequest('${r.id}')" title="Reject Deletion" style="color: #EF4444; border-color: rgba(239, 68, 68, 0.2); background: rgba(239, 68, 68, 0.02);">
              <i data-lucide="x-circle"></i>
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
    lucide.createIcons();
  } else {
    container.style.display = 'none';
  }
}

// Approve Delete Request
async function approveDeleteRequest(requestId) {
  try {
    const response = await fetch(`${API_BASE}/api/delete-requests/${requestId}/approve`, {
      method: 'POST',
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || "Failed to approve request");
    }

    showAppNotification('Request Approved', `Lead deletion request approved.`, 'danger');
    await initRemoteDatabase();
  } catch (err) {
    showAppNotification('Error', err.message, 'danger');
  }
}

// Reject Delete Request
async function rejectDeleteRequest(requestId) {
  try {
    const response = await fetch(`${API_BASE}/api/delete-requests/${requestId}/reject`, {
      method: 'POST',
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || "Failed to reject request");
    }

    showAppNotification('Request Rejected', `Lead deletion request rejected.`, 'warning');
    await initRemoteDatabase();
  } catch (err) {
    showAppNotification('Error', err.message, 'danger');
  }
}

// SaaS User Authentication Form handler
// SaaS User Authentication Form handler
async function handleUserLogin(e) {
  e.preventDefault();
  const emailInput = document.getElementById('loginEmail').value.trim().toLowerCase();
  const passwordInput = document.getElementById('loginPassword').value.trim();
  
  if (!emailInput || !passwordInput) return;
  
  try {
    showGlobalLoading("Authenticating user session...");
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailInput, password: passwordInput })
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || 'Invalid credentials');
    }

    const data = await response.json();
    currentUser = data.user;
    localStorage.setItem('crm_jwt_token', data.token);
    
    if (currentUser.passwordChanged === false) {
      // Force change password overlay
      document.getElementById('loginPageOverlay').style.display = 'flex';
      document.getElementById('passwordResetOverlay').style.display = 'flex';
      showAppNotification('Password Update Required', 'Please create a new password to activate your account.', 'warning');
    } else {
      saveUserSessionAndInitialize();
    }
  } catch (err) {
    showAppNotification('Login Failed', err.message, 'danger');
  } finally {
    hideGlobalLoading();
  }
}

// Save active user profile and start application
function saveUserSessionAndInitialize() {
  localStorage.setItem('crm_logged_in', 'true');
  localStorage.setItem('crm_current_user', JSON.stringify(currentUser));
  localStorage.setItem('crm_actual_user', JSON.stringify(currentUser));
  localStorage.setItem('crm_active_tab', 'dashboard');
  
  document.getElementById('loginPageOverlay').style.display = 'none';
  document.getElementById('passwordResetOverlay').style.display = 'none';
  document.getElementById('appContainer').style.display = 'flex';
  
  initializeApplication();
  showAppNotification('Logged In', `Welcome back, ${currentUser.name}!`, 'success');
}

// Log Out session
function handleUserLogout() {
  localStorage.clear();
  currentUser = null;
  
  // Reset all forms on the page
  document.querySelectorAll('form').forEach(form => {
    try {
      form.reset();
    } catch(e) {}
  });

  // Clear all individual inputs, textareas, and selectors to prevent data leaking between sessions
  document.querySelectorAll('input, textarea, select').forEach(input => {
    if (input.type !== 'submit' && input.type !== 'button') {
      if (input.type === 'checkbox' || input.type === 'radio') {
        input.checked = false;
      } else {
        input.value = '';
      }
    }
  });

  document.getElementById('appContainer').style.display = 'none';
  document.getElementById('passwordResetOverlay').style.display = 'none';
  document.getElementById('loginPageOverlay').style.display = 'flex';
  document.getElementById('loginForm').reset();
  
  showAppNotification('Logged Out', 'You have been logged out of the portal.', 'info');
}

// Force Update temporary password on onboarding
async function handlePasswordReset(e) {
  e.preventDefault();
  const newPassword = document.getElementById('resetNewPassword').value.trim();
  
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,}$/;
  if (!passwordRegex.test(newPassword)) {
    showAppNotification('Validation Error', 'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character.', 'warning');
    return;
  }
  
  try {
    showGlobalLoading("Updating password details...");
    const response = await fetch(`${API_BASE}/api/auth/reset-password`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ newPassword })
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || 'Password reset failed');
    }

    currentUser.passwordChanged = true;
    saveUserSessionAndInitialize();
    showAppNotification('Success', 'Password updated successfully.', 'success');
  } catch (err) {
    showAppNotification('Reset Failed', err.message, 'danger');
  } finally {
    hideGlobalLoading();
  }
}

// Force Reset Agent Passcode (Super Admin/CEO action button)
async function forceResetAgentPassword(agentId) {
  const agent = agents.find(a => a.id === agentId);
  if (!agent) return;
  
  showAppPrompt(
    "Force Password Reset",
    `Enter new password for ${agent.name} (This forces a password update on their next login):`,
    "",
    async (newPass) => {
      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,}$/;
      if (!passwordRegex.test(newPass.trim())) {
        showAppNotification('Validation Error', 'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character.', 'warning');
        return;
      }
      
      try {
        showGlobalLoading("Forcing agent password reset...");
        const response = await fetch(`${API_BASE}/api/agents/${agentId}/force-password`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ newPassword: newPass.trim() })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || "Failed to force reset password");
        }

        showAppNotification('Password Force Reset', `${agent.name}'s password reset successfully. Force reset is active.`, 'success');
        await initRemoteDatabase();
      } catch (err) {
        showAppNotification('Reset Failed', err.message, 'danger');
      } finally {
        hideGlobalLoading();
      }
    }
  );
}

// Onboarding Walkthrough Tour functions
function startOnboardingTour() {
  currentTourStep = 0;
  document.getElementById('onboardingTourOverlay').style.display = 'flex';
  renderTourStep();
}

function renderTourStep() {
  const step = tourSteps[currentTourStep];
  document.getElementById('tourStepBadge').innerText = `Step ${currentTourStep + 1} of ${tourSteps.length}`;
  document.getElementById('tourStepTitle').innerText = step.title;
  document.getElementById('tourStepText').innerText = step.text;
  
  const nextBtn = document.getElementById('tourNextBtn');
  if (currentTourStep === tourSteps.length - 1) {
    nextBtn.innerHTML = '<span>Finish Tour</span> <i data-lucide="check" style="width:12px; height:12px;"></i>';
  } else {
    nextBtn.innerHTML = '<span>Next Step</span> <i data-lucide="chevron-right" style="width:12px; height:12px;"></i>';
  }
  
  // Orient layout tabs depending on tour step
  if (currentTourStep === 1) {
    switchTab('dashboard');
  } else if (currentTourStep === 2) {
    switchTab('leads');
  } else if (currentTourStep === 3) {
    switchTab('pipeline');
  } else if (currentTourStep === 4) {
    switchTab('outreach');
  }
  
  lucide.createIcons();
  
  setTimeout(positionTourTooltip, 120);
}

function positionTourTooltip() {
  const card = document.getElementById('onboardingTourCard');
  if (!card) return;
  
  // Clear previous highlights
  document.querySelectorAll('.tour-highlight').forEach(el => {
    el.classList.remove('tour-highlight');
  });
  
  const arrow = document.getElementById('tourTooltipArrow');
  if (arrow) {
    arrow.className = 'tooltip-arrow';
    arrow.style.display = 'none';
  }
  
  if (currentTourStep === 0) {
    card.style.position = 'fixed';
    card.style.top = '50%';
    card.style.left = '50%';
    card.style.transform = 'translate(-50%, -50%)';
    return;
  }
  
  let target = null;
  const isDesktop = window.innerWidth > 868;
  
  // On desktop, target sidebar menu links
  if (isDesktop) {
    if (currentTourStep === 1) target = document.getElementById('nav-dashboard');
    else if (currentTourStep === 2) target = document.getElementById('nav-leads');
    else if (currentTourStep === 3) target = document.getElementById('nav-pipeline');
    else if (currentTourStep === 4) target = document.getElementById('nav-outreach');
  } else {
    // Mobile fallback to main page containers
    if (currentTourStep === 1) target = document.getElementById('metricsSection');
    else if (currentTourStep === 2) target = document.getElementById('directoryViewContainer');
    else if (currentTourStep === 3) target = document.getElementById('pipelineViewContainer');
    else if (currentTourStep === 4) target = document.getElementById('outreachViewContainer');
  }
  
  if (target && target.offsetHeight > 0) {
    target.classList.add('tour-highlight');
    const rect = target.getBoundingClientRect();
    
    card.style.position = 'absolute';
    card.style.transform = 'none';
    
    const targetTop = rect.top + window.scrollY;
    const targetLeft = rect.left + window.scrollX;
    
    // Ensure card height is calculated correctly (since offsetHeight might be 0 if hidden, use a reasonable fallback)
    const cardHeight = card.offsetHeight || 190;
    
    if (isDesktop) {
      // Sidebar alignment (Tooltip to the right of sidebar menu link)
      card.style.left = `${rect.right + 18}px`;
      
      // Calculate top value and restrict within viewport bounds to prevent cutoff!
      const calcTop = targetTop + (rect.height - cardHeight) / 2;
      const minTop = window.scrollY + 15;
      const maxTop = window.scrollY + window.innerHeight - cardHeight - 15;
      const finalTop = Math.max(minTop, Math.min(maxTop, calcTop));
      card.style.top = `${finalTop}px`;
      
      if (arrow) {
        arrow.style.display = 'block';
        arrow.classList.add('arrow-left');
        
        // Position arrow pointing to the middle of the targeted element
        const targetMiddleY = rect.top + rect.height / 2;
        const cardMiddleY = finalTop - window.scrollY;
        const relativeArrowTop = targetMiddleY - cardMiddleY - 6;
        arrow.style.top = `${Math.max(12, Math.min(cardHeight - 20, relativeArrowTop))}px`;
        arrow.style.left = `-7px`;
      }
    } else {
      // Mobile alignment (Tooltip below or above page container)
      if (rect.bottom + 200 < window.innerHeight) {
        card.style.top = `${targetTop + rect.height + 15}px`;
        if (arrow) {
          arrow.style.display = 'block';
          arrow.classList.add('arrow-top');
          arrow.style.top = `-7px`;
          arrow.style.left = `${(card.offsetWidth - 12) / 2}px`;
        }
      } else {
        card.style.top = `${targetTop - cardHeight - 15}px`;
        if (arrow) {
          arrow.style.display = 'block';
          arrow.classList.add('arrow-bottom');
          arrow.style.top = `${cardHeight - 5}px`;
          arrow.style.left = `${(card.offsetWidth - 12) / 2}px`;
        }
      }
      card.style.left = `${Math.max(15, Math.min(window.innerWidth - 355, targetLeft + (rect.width - card.offsetWidth) / 2))}px`;
    }
    
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else {
    card.style.position = 'fixed';
    card.style.top = '50%';
    card.style.left = '50%';
    card.style.transform = 'translate(-50%, -50%)';
  }
}

function nextOnboardingTourStep() {
  currentTourStep++;
  if (currentTourStep >= tourSteps.length) {
    skipOnboardingTour();
  } else {
    renderTourStep();
  }
}

function skipOnboardingTour() {
  localStorage.setItem('crm_onboarding_completed', 'true');
  document.getElementById('onboardingTourOverlay').style.display = 'none';
  
  // Clear any leftover highlights
  document.querySelectorAll('.tour-highlight').forEach(el => {
    el.classList.remove('tour-highlight');
  });
  
  switchTab('dashboard');
  showAppNotification('Tour Completed', 'Welcome to NeoGenCode CRM! You can now start managing leads.', 'success');
}

// Collapsible Navigation Drawer
function toggleSidebarCollapse() {
  const container = document.getElementById('appContainer');
  const sidebar = document.querySelector('.sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  
  if (window.innerWidth > 868) {
    // Desktop View: Toggle collapse width to 75px
    if (container) container.classList.toggle('sidebar-collapsed');
  } else {
    // Mobile View: Toggle slide out drawer
    if (sidebar) sidebar.classList.toggle('sidebar-open');
    if (backdrop) backdrop.classList.toggle('active');
  }
}

// Collapse/Expand Dashboard Analytics
function toggleDashboardAnalytics() {
  const isCollapsed = localStorage.getItem('dashboard_collapsed') === 'true';
  const nextState = !isCollapsed;
  localStorage.setItem('dashboard_collapsed', String(nextState));
  applyDashboardCollapseState(nextState);
}

function applyDashboardCollapseState(collapsed) {
  const metrics = document.getElementById('metricsSection');
  const charts = document.getElementById('chartsSection');
  const textLabel = document.getElementById('dashboardCollapseText');
  const icon = document.getElementById('dashboardCollapseIcon');
  
  if (!metrics || !charts) return;
  
  if (collapsed) {
    metrics.style.display = 'none';
    charts.style.display = 'none';
    if (textLabel) textLabel.innerText = 'Expand Analytics';
    if (icon) {
      icon.setAttribute('data-lucide', 'chevrons-up-down');
      icon.style.transform = 'none';
    }
  } else {
    metrics.style.display = 'grid';
    charts.style.display = 'grid';
    if (textLabel) textLabel.innerText = 'Collapse Analytics';
    if (icon) {
      icon.setAttribute('data-lucide', 'chevrons-up-down');
    }
  }
  lucide.createIcons();
}

// Display Company Branding badge
function updateCompanyBrandingHeader() {
  const badge = document.getElementById('tenantBrandingBadge');
  if (!badge) return;
  
  if (!currentUser) return;
  
  if (currentUser.role === 'Super Admin') {
    badge.innerText = 'NeoGenCode SaaS (Super Admin)';
    badge.style.background = 'rgba(168, 85, 247, 0.15)';
    badge.style.color = 'var(--accent-purple)';
  } else {
    badge.innerText = currentUser.organization || currentUser.tenantName || 'Workspace';
    badge.style.background = 'rgba(14, 165, 233, 0.15)';
    badge.style.color = 'var(--accent-blue)';
  }

  // Update CRM Vertical Tagline below logo
  const tagline = document.getElementById('crmVerticalTagline');
  if (tagline) {
    const activeIndustry = (companyInfo && companyInfo.industry) || (currentUser && currentUser.industry) || 'Real Estate CRM Software';
    let text = 'for Enterprise Business';
    if (activeIndustry === 'Recruitment CRM Software') text = 'for Recruitment Agency';
    else if (activeIndustry === 'Real Estate CRM Software') text = 'for Real Estate Agency';
    else if (activeIndustry === 'Education CRM Software') text = 'for Educational Institutes';
    else if (activeIndustry === 'Loan DSA CRM Software') text = 'for Loan DSA Agents';
    else if (activeIndustry === 'Travel CRM Software') text = 'for Travel Agency';
    else if (activeIndustry === 'Healthcare CRM Software') text = 'for Healthcare Providers';
    else if (activeIndustry === 'CRM for Startups') text = 'for Startup Teams';
    else if (activeIndustry === 'Call Center CRM') text = 'for Call Centers';
    else if (activeIndustry === 'Debt Collection Software') text = 'for Debt Collection';
    else if (activeIndustry === 'Manufacturing CRM') text = 'for Manufacturing';
    else if (activeIndustry === 'Retail CRM') text = 'for Retail Outlets';
    
    tagline.innerText = text;
  }
}

// Send Email via EmailJS API (fallback to simulation if no keys)
async function sendEmailViaJS(toEmail, toName, subject, messageBody) {
  const serviceId = localStorage.getItem('emailjs_service_id') || 'default_service';
  const templateId = localStorage.getItem('emailjs_template_id');
  const publicKey = localStorage.getItem('emailjs_public_key');
  
  if (!templateId || !publicKey) {
    console.log(`[Email Simulator] To: ${toEmail}, Subject: ${subject}\nMessage: ${messageBody}`);
    return false;
  }
  
  try {
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        service_id: serviceId,
        template_id: templateId,
        user_id: publicKey,
        template_params: {
          to_email: toEmail,
          to_name: toName,
          subject: subject,
          message: messageBody,
          reset_link: messageBody.includes('?reset_token=') ? messageBody.split('\n\n').find(s => s.includes('?reset_token=')) || '' : '',
          temp_password: messageBody.includes('Temporary Password:') ? messageBody.split('Temporary Password:')[1].split('\n')[0].trim() : ''
        }
      })
    });
    if (response.ok) {
      console.log(`Email successfully sent to ${toEmail}`);
      showAppNotification('Email Sent', `Email successfully dispatched to ${toEmail}.`, 'success');
      return true;
    } else {
      const errText = await response.text();
      console.error('EmailJS Error response:', errText);
      showAppNotification('Email Failed', `EmailJS API returned error response.`, 'danger');
      return false;
    }
  } catch (err) {
    console.error('EmailJS Network Error:', err);
    return false;
  }
}

// Edit Company details & plan limits (Super Admin)
function editCompanyDetails(id) {
  const company = companies.find(c => c.id === id);
  if (!company) return;
  
  const owner = agents.find(a => a.tenantId === id && a.role === 'Manager');

  document.getElementById('editCompId').value = company.id;
  document.getElementById('editCompName').value = company.name;
  document.getElementById('editCompCeoEmail').value = owner ? owner.email : "";
  document.getElementById('editCompPlan').value = company.plan;
  document.getElementById('editCompIndustry').value = company.industry || "Recruitment CRM Software";
  document.getElementById('editCompMaxMembers').value = company.memberLimit || 5;
  document.getElementById('editCompStorageLimit').value = company.storageLimitMb || 5;
  document.getElementById('editCompTalentDbEnabled').checked = company.talentDbEnabled !== 0;

  document.getElementById('saasEditCompanyModalOverlay').style.display = 'flex';
  lucide.createIcons();
}

function closeSaasEditCompanyModal() {
  document.getElementById('saasEditCompanyModalOverlay').style.display = 'none';
}

async function handleSaasEditCompanySubmit(e) {
  e.preventDefault();
  const id = document.getElementById('editCompId').value;
  const newName = document.getElementById('editCompName').value.trim();
  const newEmail = document.getElementById('editCompCeoEmail').value.trim();
  const newPlan = document.getElementById('editCompPlan').value;
  const newIndustry = document.getElementById('editCompIndustry').value;
  const newLimit = parseInt(document.getElementById('editCompMaxMembers').value);
  const newStorageLimit = parseInt(document.getElementById('editCompStorageLimit').value);
  const talentDbEnabled = document.getElementById('editCompTalentDbEnabled').checked ? 1 : 0;

  if (!newName || !newEmail) {
    showAppNotification('Error', 'Company name and CEO Email cannot be empty.', 'danger');
    return;
  }

  try {
    showGlobalLoading("Updating company details...");
    const response = await fetch(`${API_BASE}/api/companies/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        name: newName,
        plan: newPlan,
        memberLimit: newLimit,
        ceoEmail: newEmail,
        industry: newIndustry,
        storageLimitMb: newStorageLimit,
        talentDbEnabled
      })
    });
    
    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || "Failed to update company");
    }
    
    showAppNotification('Tenant Updated', 'Company details and owner email successfully updated.', 'success');
    closeSaasEditCompanyModal();
    await initRemoteDatabase();
  } catch (err) {
    showAppNotification('Error', err.message, 'danger');
  } finally {
    hideGlobalLoading();
  }
}

// Forgot Password Flow - Request OTP Dialogue
function handleForgotPasswordClick(e) {
  e.preventDefault();
  closeForgotFlow();
  
  const emailForm = document.getElementById('forgotEmailForm');
  if (emailForm) emailForm.reset();
  
  document.getElementById('forgotEmailOverlay').style.display = 'flex';
}

function closeForgotFlow() {
  clearInterval(otpTimerInterval);
  document.getElementById('forgotEmailOverlay').style.display = 'none';
  document.getElementById('forgotOtpOverlay').style.display = 'none';
  document.getElementById('forgotPasswordResetOverlay').style.display = 'none';
}

async function requestPasswordResetOtp(e) {
  if (e) e.preventDefault();
  
  const emailInput = document.getElementById('forgotEmailInput');
  if (!emailInput) return;
  
  const email = emailInput.value.trim();
  if (!email) return;

  try {
    showGlobalLoading("Requesting password reset OTP...");
    const response = await fetch(`${API_BASE}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || "Failed to request password reset OTP.");
    }

    window.resettingEmail = email;
    document.getElementById('forgotEmailOverlay').style.display = 'none';
    
    const sentLabel = document.getElementById('otpSentLabel');
    if (sentLabel) sentLabel.innerText = `We sent a 6-digit code to ${email}. It is valid for 5 minutes.`;
    
    const otpInput = document.getElementById('forgotOtpInput');
    if (otpInput) otpInput.value = '';
    
    document.getElementById('forgotOtpOverlay').style.display = 'flex';
    startOtpCountdown();
    showAppNotification('OTP Sent', 'A One-Time Password (OTP) has been dispatched to your email.', 'success');
  } catch (err) {
    showAppNotification('Request Failed', err.message, 'danger');
  } finally {
    hideGlobalLoading();
  }
}

let otpTimerInterval;
function startOtpCountdown() {
  clearInterval(otpTimerInterval);
  const timerEl = document.getElementById('otpTimer');
  const resendLink = document.getElementById('otpResendLink');
  if (!timerEl || !resendLink) return;
  
  let duration = 120; // 2 minutes
  timerEl.innerText = "02:00";
  resendLink.style.cursor = 'not-allowed';
  resendLink.style.color = 'var(--text-muted)';
  resendLink.style.pointerEvents = 'none';

  otpTimerInterval = setInterval(() => {
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    
    const minStr = String(minutes).padStart(2, '0');
    const secStr = String(seconds).padStart(2, '0');
    
    timerEl.innerText = `${minStr}:${secStr}`;
    
    if (--duration < 0) {
      clearInterval(otpTimerInterval);
      timerEl.innerText = "00:00";
      resendLink.style.cursor = 'pointer';
      resendLink.style.color = 'var(--accent-blue)';
      resendLink.style.pointerEvents = 'auto';
    }
  }, 1000);
}

async function resendPasswordResetOtp(e) {
  e.preventDefault();
  const resendLink = document.getElementById('otpResendLink');
  if (resendLink && resendLink.style.pointerEvents === 'none') return;
  
  // Re-submit OTP request
  document.getElementById('forgotEmailInput').value = window.resettingEmail;
  await requestPasswordResetOtp(null);
}

async function verifyPasswordResetOtp(e) {
  e.preventDefault();
  const otpInput = document.getElementById('forgotOtpInput');
  if (!otpInput) return;
  
  const otp = otpInput.value.trim();
  if (otp.length !== 6) {
    showAppNotification('Validation Error', 'OTP must be 6 digits.', 'warning');
    return;
  }

  try {
    showGlobalLoading("Verifying 6-digit OTP code...");
    const response = await fetch(`${API_BASE}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: window.resettingEmail, otp })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || "Verification failed");
    }

    const data = await response.json();
    window.resetToken = data.resetToken;
    
    clearInterval(otpTimerInterval);
    document.getElementById('forgotOtpOverlay').style.display = 'none';
    
    const resetLabel = document.getElementById('resetEmailLabel');
    if (resetLabel) resetLabel.innerText = `Resetting password for ${window.resettingEmail}`;
    
    document.getElementById('forgotNewPass').value = '';
    document.getElementById('forgotConfirmPass').value = '';
    document.getElementById('forgotSubmitBtn').disabled = true;
    
    document.getElementById('forgotPasswordResetOverlay').style.display = 'flex';
    showAppNotification('OTP Verified', 'Please enter your new secure password.', 'success');
  } catch (err) {
    showAppNotification('Verification Failed', err.message, 'danger');
  } finally {
    hideGlobalLoading();
  }
}

function validatePasswordsMatch() {
  const newPass = document.getElementById('forgotNewPass').value;
  const confirmPass = document.getElementById('forgotConfirmPass').value;
  const btn = document.getElementById('forgotSubmitBtn');
  
  if (newPass && confirmPass && newPass === confirmPass && newPass.length >= 4) {
    btn.disabled = false;
  } else {
    btn.disabled = true;
  }
}

async function executeForgotPasswordReset(e) {
  e.preventDefault();
  const newPassword = document.getElementById('forgotNewPass').value.trim();
  
  if (!newPassword || newPassword.length < 4) {
    showAppNotification('Validation Error', 'Password must be at least 4 characters.', 'warning');
    return;
  }
  
  try {
    showGlobalLoading("Resetting profile password...");
    const response = await fetch(`${API_BASE}/api/auth/reset-password-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: window.resettingEmail,
        resetToken: window.resetToken,
        newPassword
      })
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || 'Password reset failed');
    }

    closeForgotFlow();
    showAppNotification('Password Updated', 'Your password has been successfully reset. Please log in.', 'success');
  } catch (err) {
    showAppNotification('Reset Failed', err.message, 'danger');
  } finally {
    hideGlobalLoading();
  }
}

// Generate secure b64 connection payload for Chrome Extension
function getExtensionToken() {
  if (!currentUser) return '';
  const permissions = currentUser.permissions || {
    linkedinExtractor: true,
    whatsappApi: true,
    deleteUser: currentUser.role === 'Manager',
    viewAllLeads: currentUser.role !== 'Sales Agent'
  };
  const payload = {
    crmUrl: window.location.origin + window.location.pathname,
    tenantId: currentUser.tenantId,
    tenantName: currentUser.organization || 'Company A',
    agentName: currentUser.name,
    agentRole: currentUser.role,
    permissions,
    syncTarget: localStorage.getItem('sync_storage_target') || 'sheets',
    sheetsUrl: localStorage.getItem('google_sheets_url') || '',
    tursoUrl: window.location.origin, // Fallback base URL for compatibility
    tursoToken: localStorage.getItem('crm_jwt_token') || '' // Encrypted JWT session token
  };
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
}

function copyExtensionToken() {
  const tokenInput = document.getElementById('extensionConnToken');
  if (!tokenInput || !tokenInput.value) {
    showAppNotification('Copy Failed', 'No connection token available.', 'danger');
    return;
  }
  
  tokenInput.select();
  tokenInput.setSelectionRange(0, 99999);
  
  try {
    navigator.clipboard.writeText(tokenInput.value);
    showAppNotification('Copied', 'Connection Token copied to clipboard!', 'success');
  } catch (err) {
    showAppNotification('Copy Failed', 'Clipboard access denied.', 'danger');
  }
}

// Receive message imports from the Chrome Extension in real-time
window.addEventListener("message", (event) => {
  if (!event.data || event.data.source !== "neogencode-extractor") return;
  
  if (event.data.action === "IMPORT_LEAD") {
    const leadData = event.data.lead;
    importLeadFromExtension(leadData);
  }
});

async function importLeadFromExtension(leadData) {
  if (!currentUser) {
    showAppNotification('Import Failed', 'Please log in to your CRM before importing leads.', 'danger');
    return;
  }
  
  const hasExtractorPerm = currentUser.role === 'Super Admin' || 
                           (currentUser.permissions ? currentUser.permissions.linkedinExtractor : true);
  if (!hasExtractorPerm) {
    showAppNotification('Import Blocked', 'You do not have permission to use the LinkedIn Extractor tool.', 'danger');
    return;
  }
  
  // Validate name & attributes
  const name = leadData.name ? leadData.name.trim() : 'Extracted Lead';
  const designation = leadData.designation ? leadData.designation.trim() : 'N/A';
  const phone = leadData.phone ? leadData.phone.trim() : '';
  const email = leadData.email ? leadData.email.trim() : '';
  const summary = leadData.summary || `Extracted via NeoGenCode Lead Extractor from ${leadData.url || 'Web Page'}.`;
  
  const organization = currentUser.role === 'Super Admin' ? 'Company A' : currentUser.organization;
  
  showGlobalLoading("Importing lead from Chrome Extension...");
  try {
    const res = await fetch(`${API_BASE}/api/leads`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        name,
        designation,
        phone,
        email,
        source: 'Extension',
        status: 'new',
        lastFollowUp: 'N/A',
        nextFollowUp: 'N/A',
        foundBy: currentUser.name,
        summary,
        postUrl: leadData.url || '',
        assignedAgent: currentUser.name,
        organization,
        tenantId: currentUser.tenantId
      })
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Failed to import lead.');
    }

    // Refresh database from API
    await initRemoteDatabase();
    showAppNotification('Extension Import', `${name} successfully imported into CRM directory!`, 'success');
  } catch (err) {
    showAppNotification('Import Sync Error', err.message, 'danger');
  } finally {
    hideGlobalLoading();
  }
}

// Database Inspector Actions (Super Admin Only)
async function inspectDatabaseTable(tableName) {
  if (!tableName) {
    document.getElementById('dbInspectorTableHeader').innerHTML = `<tr><th style="padding: 0.75rem 1rem; text-align: left; color: var(--text-muted);">No Table Selected</th></tr>`;
    document.getElementById('dbInspectorTableBody').innerHTML = `<tr><td style="padding: 1.5rem; text-align: center; color: var(--text-muted);">Select a database table from the dropdown above to inspect real-time SQLite / Turso records.</td></tr>`;
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE}/api/admin/db-inspect/${tableName}`, {
      headers: getAuthHeaders()
    });
    
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || "Failed to inspect table");
    }
    
    const data = await response.json();
    const { columns, rows } = data;
    
    // Render Header
    const headerRow = document.getElementById('dbInspectorTableHeader');
    if (headerRow) {
      if (columns.length === 0) {
        headerRow.innerHTML = `<tr><th style="padding: 0.75rem 1rem; text-align: left; color: var(--text-muted);">No Columns</th></tr>`;
      } else {
        let headerHtml = '<tr>';
        columns.forEach(col => {
          headerHtml += `<th style="padding: 0.75rem 1rem; text-align: left; color: var(--text-secondary); border-bottom: 1px solid var(--border-color); font-weight: 600; text-transform: uppercase; font-size: 0.65rem; letter-spacing: 0.05em;">${col}</th>`;
        });
        headerHtml += `<th style="padding: 0.75rem 1rem; text-align: right; color: var(--text-secondary); border-bottom: 1px solid var(--border-color); font-weight: 600; text-transform: uppercase; font-size: 0.65rem; letter-spacing: 0.05em; width: 80px;">Actions</th>`;
        headerHtml += '</tr>';
        headerRow.innerHTML = headerHtml;
      }
    }
    
    // Render Body
    const bodyEl = document.getElementById('dbInspectorTableBody');
    if (bodyEl) {
      if (rows.length === 0) {
        bodyEl.innerHTML = `<tr><td colspan="${(columns.length || 0) + 1}" style="padding: 1.5rem; text-align: center; color: var(--text-muted);">Table is empty (0 records found).</td></tr>`;
      } else {
        let bodyHtml = '';
        rows.forEach((row, rowIndex) => {
          const rowBg = rowIndex % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent';
          bodyHtml += `<tr style="background: ${rowBg}; border-bottom: 1px solid rgba(255,255,255,0.03);">`;
          columns.forEach(col => {
            let val = row[col];
            if (val === null || val === undefined) {
              val = '<span style="color: var(--text-muted); font-style: italic;">NULL</span>';
            } else if (typeof val === 'object') {
              val = `<code style="font-size: 0.65rem; color: var(--accent-purple); max-width: 250px; display: inline-block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title='${JSON.stringify(val)}'>${JSON.stringify(val)}</code>`;
            } else {
              val = String(val).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            }
            bodyHtml += `<td style="padding: 0.65rem 1rem; color: var(--text-primary); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${String(row[col] !== null ? row[col] : '').replace(/"/g, '&quot;')}">${val}</td>`;
          });
          
          // Add delete action button
          const rowId = row.id || row.name || '';
          bodyHtml += `
            <td style="padding: 0.65rem 1rem; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.03);">
              <button class="outreach-action-btn" onclick="deleteDatabaseRow('${tableName}', '${rowId}')" title="Delete Record" style="color: #EF4444; border-color: rgba(239, 68, 68, 0.2); background: rgba(239, 68, 68, 0.03); padding: 4px 8px; border-radius: 4px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;">
                <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i>
              </button>
            </td>
          `;
          bodyHtml += '</tr>';
        });
        bodyEl.innerHTML = bodyHtml;
        lucide.createIcons();
      }
    }
  } catch (err) {
    showAppNotification('Inspection Error', err.message, 'danger');
    document.getElementById('dbInspectorTableBody').innerHTML = `<tr><td style="padding: 1.5rem; text-align: center; color: #EF4444;">Error: ${err.message}</td></tr>`;
  }
}

async function refreshCurrentInspectedTable() {
  const select = document.getElementById('dbInspectorTableSelect');
  if (select) {
    await inspectDatabaseTable(select.value);
  }
}

async function deleteDatabaseRow(tableName, id) {
  if (!id) return;
  showAppConfirm(
    "Caution: Permanent Deletion",
    `Are you sure you want to permanently delete this record "${id}" from the database table "${tableName}"? This action cannot be undone.`,
    async () => {
      try {
        showGlobalLoading("Deleting database record...");
        const response = await fetch(`${API_BASE}/api/admin/db-delete/${tableName}/${id}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || "Failed to delete row");
        }

        showAppNotification('Success', 'Record deleted successfully.', 'success');
        await initRemoteDatabase();
      } catch (err) {
        showAppNotification('Deletion Failed', err.message, 'danger');
      } finally {
        hideGlobalLoading();
      }
    }
  );
}

// Custom Premium Modal Dialog System
function showAppAlert(title, message, callback) {
  const overlay = document.getElementById('customModalDialogOverlay');
  const titleEl = document.getElementById('customModalTitle');
  const messageEl = document.getElementById('customModalMessage');
  const inputContainer = document.getElementById('customModalInputContainer');
  const cancelBtn = document.getElementById('customModalCancelBtn');
  const submitBtn = document.getElementById('customModalSubmitBtn');
  const icon = document.getElementById('customModalIcon');

  if (!overlay) return;

  // Set Content
  titleEl.querySelector('span').innerText = title;
  messageEl.innerHTML = message.replace(/\n/g, '<br>');
  inputContainer.style.display = 'none';
  cancelBtn.style.display = 'none'; // No cancel button for Alert
  
  // Set Icon
  icon.setAttribute('data-lucide', 'info');
  icon.style.color = 'var(--accent-blue)';
  lucide.createIcons();

  submitBtn.innerText = 'OK';
  submitBtn.style.background = 'var(--accent-blue)';
  submitBtn.style.borderColor = 'var(--accent-blue)';

  overlay.style.display = 'flex';
  
  submitBtn.onclick = () => {
    overlay.style.display = 'none';
    if (callback) callback();
  };
}

function showAppConfirm(title, message, onConfirm, onCancel) {
  const overlay = document.getElementById('customModalDialogOverlay');
  const titleEl = document.getElementById('customModalTitle');
  const messageEl = document.getElementById('customModalMessage');
  const inputContainer = document.getElementById('customModalInputContainer');
  const cancelBtn = document.getElementById('customModalCancelBtn');
  const submitBtn = document.getElementById('customModalSubmitBtn');
  const icon = document.getElementById('customModalIcon');

  if (!overlay) return;

  // Set Content
  titleEl.querySelector('span').innerText = title;
  messageEl.innerHTML = message.replace(/\n/g, '<br>');
  inputContainer.style.display = 'none';
  cancelBtn.style.display = 'block';
  
  // Set Icon
  if (title.toUpperCase().includes('DELETE') || title.toUpperCase().includes('CAUTION') || title.toUpperCase().includes('REMOVE')) {
    icon.setAttribute('data-lucide', 'alert-triangle');
    icon.style.color = '#EF4444';
    submitBtn.style.background = '#EF4444';
    submitBtn.style.borderColor = '#EF4444';
  } else {
    icon.setAttribute('data-lucide', 'help-circle');
    icon.style.color = 'var(--accent-purple)';
    submitBtn.style.background = 'var(--accent-purple)';
    submitBtn.style.borderColor = 'var(--accent-purple)';
  }
  lucide.createIcons();

  submitBtn.innerText = 'Yes, Proceed';
  cancelBtn.innerText = 'Cancel';

  overlay.style.display = 'flex';

  submitBtn.onclick = () => {
    overlay.style.display = 'none';
    if (onConfirm) onConfirm();
  };

  cancelBtn.onclick = () => {
    overlay.style.display = 'none';
    if (onCancel) onCancel();
  };
}

function showAppPrompt(title, message, defaultValue, onSubmit, onCancel) {
  const overlay = document.getElementById('customModalDialogOverlay');
  const titleEl = document.getElementById('customModalTitle');
  const messageEl = document.getElementById('customModalMessage');
  const inputContainer = document.getElementById('customModalInputContainer');
  const inputEl = document.getElementById('customModalInput');
  const cancelBtn = document.getElementById('customModalCancelBtn');
  const submitBtn = document.getElementById('customModalSubmitBtn');
  const icon = document.getElementById('customModalIcon');

  if (!overlay) return;

  // Set Content
  titleEl.querySelector('span').innerText = title;
  messageEl.innerHTML = message.replace(/\n/g, '<br>');
  inputContainer.style.display = 'block';
  inputEl.value = defaultValue || '';
  cancelBtn.style.display = 'block';
  
  // Set Icon
  icon.setAttribute('data-lucide', 'edit-3');
  icon.style.color = 'var(--accent-blue)';
  lucide.createIcons();

  submitBtn.innerText = 'Submit';
  submitBtn.style.background = 'var(--accent-blue)';
  submitBtn.style.borderColor = 'var(--accent-blue)';

  cancelBtn.innerText = 'Cancel';

  overlay.style.display = 'flex';

  // Auto focus input
  setTimeout(() => inputEl.focus(), 100);

  submitBtn.onclick = () => {
    const val = inputEl.value.trim();
    overlay.style.display = 'none';
    if (onSubmit) onSubmit(val);
  };

  cancelBtn.onclick = () => {
    overlay.style.display = 'none';
    if (onCancel) onCancel();
  };
}

// Global Loading Indicator System
function showGlobalLoading(message) {
  const bar = document.getElementById('globalLoadingBar');
  const overlay = document.getElementById('globalLoadingOverlay');
  const msgEl = document.getElementById('globalLoadingMessage');
  
  if (bar) bar.style.display = 'block';
  if (overlay) {
    if (message) {
      msgEl.innerText = message;
      overlay.style.display = 'flex';
    }
  }
}

function hideGlobalLoading() {
  const bar = document.getElementById('globalLoadingBar');
  const overlay = document.getElementById('globalLoadingOverlay');
  if (bar) bar.style.display = 'none';
  if (overlay) overlay.style.display = 'none';
}

// ----------------------------------------------------
// EMAIL COMPOSER & REVIEW FLOW (CONFIRMATION ENGINE)
// ----------------------------------------------------
let emailDraftQueue = [];
let isDraftPaidMode = false;

function openEmailDraftModal(leadsList, isPaidMode) {
  emailDraftQueue = leadsList;
  isDraftPaidMode = isPaidMode;
  
  const modal = document.getElementById('emailDraftModalOverlay');
  if (modal) {
    modal.classList.add('active');
    
    // Set default draft count
    document.getElementById('emailDraftLeadCount').innerText = leadsList.length;
    
    // Set default body template if empty
    const templateBody = document.getElementById('emailTemplateBody');
    if (templateBody && !templateBody.value.trim()) {
      templateBody.value = "Hi {name},\n\nJust wanted to reach out regarding your profile at {organization}. Let us know a convenient time to chat.\n\nBest regards,\n{sender_name}";
    }
    
    // Go to template step
    backToEmailTemplateStep();
  }
}

function closeEmailDraftModal() {
  const modal = document.getElementById('emailDraftModalOverlay');
  if (modal) modal.classList.remove('active');
}

function backToEmailTemplateStep() {
  document.getElementById('emailDraftStepTemplate').classList.remove('hidden');
  document.getElementById('emailDraftStepReview').classList.add('hidden');
  document.getElementById('emailDraftModalTitle').innerText = "Email Outreach Composer";
}

function generateEmailDraftsList() {
  const subjectTemplate = document.getElementById('emailTemplateSubject').value.trim() || "Follow-up Reminder";
  const bodyTemplate = document.getElementById('emailTemplateBody').value.trim() || "";
  
  const listContainer = document.getElementById('emailDraftsListContainer');
  listContainer.innerHTML = '';
  
  emailDraftQueue.forEach(lead => {
    // Populate placeholders
    const org = lead.organization || lead.company || "your organization";
    const des = lead.designation || "team member";
    const src = lead.source || "LinkedIn";
    
    let populatedSubject = subjectTemplate
      .replace(/{name}/gi, lead.name)
      .replace(/{organization}/gi, org)
      .replace(/{designation}/gi, des)
      .replace(/{source}/gi, src)
      .replace(/{sender_name}/gi, currentUser.name);
      
    let populatedBody = bodyTemplate
      .replace(/{name}/gi, lead.name)
      .replace(/{organization}/gi, org)
      .replace(/{designation}/gi, des)
      .replace(/{source}/gi, src)
      .replace(/{sender_name}/gi, currentUser.name);
      
    // Render draft card
    const card = document.createElement('div');
    card.className = 'email-draft-card';
    card.id = `draft-card-${lead.id}`;
    card.style = 'border: 1px solid var(--border-color); border-radius: 8px; padding: 1rem; background: var(--bg-secondary); display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 0.5rem;';
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">
        <div>
          <strong style="font-size: 0.85rem; color: var(--text-primary);">${escapeHTML(lead.name)}</strong>
          <span style="font-size: 0.75rem; color: var(--text-muted); margin-left: 0.5rem;">&lt;${escapeHTML(lead.email || 'No email')}&gt;</span>
        </div>
        <span id="draft-status-${lead.id}" class="status-badge status-new" style="font-size: 0.7rem; padding: 0.15rem 0.4rem;">Draft</span>
      </div>
      
      <div class="form-group" style="margin-bottom: 0.5rem;">
        <label style="font-size: 0.7rem; margin-bottom: 0.2rem; color: var(--text-secondary);">Subject</label>
        <input type="text" id="draft-subject-${lead.id}" class="form-control" style="font-size: 0.75rem; padding: 0.4rem;" value="${escapeHTML(populatedSubject)}">
      </div>
      
      <div class="form-group" style="margin-bottom: 0.5rem;">
        <label style="font-size: 0.7rem; margin-bottom: 0.2rem; color: var(--text-secondary);">Body Message</label>
        <textarea id="draft-body-${lead.id}" class="form-control" rows="4" style="font-size: 0.75rem; line-height: 1.3; padding: 0.4rem; resize: vertical;">${escapeHTML(populatedBody)}</textarea>
      </div>
      
      <div style="display: flex; justify-content: flex-end; gap: 0.5rem;">
        <button type="button" class="btn-primary" id="btn-send-draft-${lead.id}" onclick="sendSingleDraft('${lead.id}')" style="font-size: 0.7rem; padding: 0.4rem 0.8rem; border-radius: 6px; display: inline-flex; align-items: center; gap: 0.25rem;">
          <i data-lucide="send" style="width: 12px; height: 12px;"></i>
          Send This
        </button>
      </div>
    `;
    listContainer.appendChild(card);
  });
  
  if (window.lucide) {
    lucide.createIcons();
  }
  
  document.getElementById('emailDraftStepTemplate').classList.add('hidden');
  document.getElementById('emailDraftStepReview').classList.remove('hidden');
  document.getElementById('emailDraftModalTitle').innerText = "Review & Customize Email Drafts";
  document.getElementById('emailReviewCountLabel').innerText = `${emailDraftQueue.length} lead(s)`;
  document.getElementById('btnSendAllCount').innerText = emailDraftQueue.length;
}

async function sendSingleDraft(leadId) {
  const lead = emailDraftQueue.find(l => l.id === leadId);
  if (!lead) return;
  
  const statusBadge = document.getElementById(`draft-status-${leadId}`);
  const btnSend = document.getElementById(`btn-send-draft-${leadId}`);
  const subjectInput = document.getElementById(`draft-subject-${leadId}`);
  const bodyTextarea = document.getElementById(`draft-body-${leadId}`);
  
  if (btnSend.disabled) return;
  
  const subject = subjectInput.value.trim();
  const body = bodyTextarea.value.trim();
  
  if (!lead.email) {
    showAppNotification('No Email', `Lead ${lead.name} has no email address.`, 'warning');
    return;
  }
  
  btnSend.disabled = true;
  btnSend.innerHTML = '<i class="spinner-border spinner-border-sm" style="margin-right: 4px;"></i>Sending...';
  statusBadge.innerText = 'Sending...';
  statusBadge.style.background = 'rgba(14, 165, 233, 0.15)';
  statusBadge.style.color = 'var(--accent-blue)';
  
  const consoleLog = document.getElementById('outreachConsoleLog');
  const writeLog = (text, type = 'info') => {
    const line = document.createElement('div');
    line.className = `outreach-log-line ${type}`;
    line.innerText = `[${new Date().toLocaleTimeString()}] ${text}`;
    if (consoleLog) {
      consoleLog.appendChild(line);
      consoleLog.scrollTop = consoleLog.scrollHeight;
    }
  };
  
  writeLog(`Dispatching custom SMTP email to ${lead.email}...`, 'info');
  
  try {
    if (isDraftPaidMode) {
      const emailRes = await fetch(`${API_BASE}/api/outreach/send-email`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          to: lead.email,
          subject: subject,
          body: body
        })
      });
      
      if (!emailRes.ok) {
        const errData = await emailRes.json();
        throw new Error(errData.error || "SMTP email delivery failed");
      }
      writeLog(`[Email API] Custom SMTP email sent to ${lead.email} successfully.`, 'success');
    } else {
      writeLog(`Opening Gmail compose window for ${lead.email}...`, 'success');
      window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(lead.email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
    }
    
    const waChecked = document.getElementById(`queue-wa-${lead.id}`) ? document.getElementById(`queue-wa-${lead.id}`).checked : (lead.autoWhatsApp !== false);
    const callChecked = document.getElementById(`queue-call-${lead.id}`) ? document.getElementById(`queue-call-${lead.id}`).checked : (lead.autoAiCall === true);
    
    if (waChecked && lead.phone) {
      if (isDraftPaidMode) {
        writeLog(`Dispatching background Meta WhatsApp to ${lead.phone}...`, 'info');
        await sendMetaWhatsAppAPI(lead);
        writeLog(`[WhatsApp API] Direct dispatch to ${lead.phone} completed.`, 'success');
      } else {
        writeLog(`Opening Click-to-Chat redirect window to ${lead.phone}...`, 'success');
        window.open(`https://wa.me/${lead.phone.replace(/\D/g, '')}?text=${encodeURIComponent(body)}`, '_blank');
      }
    }
    
    if (callChecked && lead.phone) {
      writeLog(`Initiating Free AI Voice Calling Studio for ${lead.phone}...`, 'info');
      try {
        await triggerBlandAiCall(lead);
        writeLog(`[AI Call Studio] AI Voice Calling Studio active for ${lead.name}.`, 'success');
      } catch(err) {
        writeLog(`[AI Call Error] ${err.message}`, 'danger');
      }
    }
    
    const queueStatus = document.getElementById(`queue-status-${lead.id}`);
    if (queueStatus) {
      queueStatus.innerText = 'Completed';
      queueStatus.style.background = 'rgba(16, 185, 129, 0.15)';
      queueStatus.style.color = 'var(--status-contacted)';
      
      const queueEmailCb = document.getElementById(`queue-email-${lead.id}`);
      if (queueEmailCb) queueEmailCb.checked = false;
      const queueWaCb = document.getElementById(`queue-wa-${lead.id}`);
      if (queueWaCb) queueWaCb.checked = false;
      const queueCallCb = document.getElementById(`queue-call-${lead.id}`);
      if (queueCallCb) queueCallCb.checked = false;
    }
    
    btnSend.innerHTML = 'Sent';
    btnSend.classList.remove('btn-primary');
    btnSend.classList.add('btn-secondary');
    btnSend.style.background = 'rgba(16, 185, 129, 0.1)';
    btnSend.style.color = 'var(--status-contacted)';
    statusBadge.innerText = 'Sent';
    statusBadge.style.background = 'rgba(16, 185, 129, 0.15)';
    statusBadge.style.color = 'var(--status-contacted)';
    
    lead.status = 'contacted';
    lead.lastOutreachTimestamp = new Date().toLocaleString('en-US', {month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute:'2-digit'});
    
    saveLeadsToStorage();
    renderLeadsList();
    
  } catch (err) {
    writeLog(`[Outreach Error] Failed to process ${lead.name}: ${err.message}`, 'danger');
    btnSend.disabled = false;
    btnSend.innerHTML = '<i class="spinner-border spinner-border-sm" style="margin-right: 4px;"></i>Retry';
    statusBadge.innerText = 'Error';
    statusBadge.style.background = 'rgba(239, 68, 68, 0.15)';
    statusBadge.style.color = '#EF4444';
  }
}

async function sendAllDraftsNow() {
  const btnAll = document.getElementById('btnSendAllDrafts');
  if (btnAll.disabled) return;
  
  btnAll.disabled = true;
  btnAll.innerHTML = '<i class="spinner-border spinner-border-sm" style="margin-right: 4px;"></i>Sending all...';
  
  const cards = document.querySelectorAll('.email-draft-card');
  for (let card of cards) {
    const leadId = card.id.replace('draft-card-', '');
    const btnSend = document.getElementById(`btn-send-draft-${leadId}`);
    if (btnSend && !btnSend.disabled && btnSend.innerText !== 'Sent') {
      await sendSingleDraft(leadId);
      await sleep(1000);
    }
  }
  
  btnAll.innerHTML = 'All Dispatched';
  showAppNotification('Campaign Complete', 'All customized email drafts have been processed.', 'success');
}

// ----------------------------------------------------
// BILLING & GST INVOICING
// ----------------------------------------------------
function handleLogoFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    const base64 = evt.target.result;
    document.getElementById('billingLogoUrl').value = base64;
    const preview = document.getElementById('billingLogoPreview');
    const icon = document.getElementById('billingLogoIcon');
    if (preview) {
      preview.src = base64;
      preview.style.display = 'block';
    }
    if (icon) icon.style.display = 'none';
  };
  reader.readAsDataURL(file);
}

function calculateGstSummary() {
  const amtInput = document.getElementById('invoiceAmount');
  const rateSelect = document.getElementById('invoiceGstRate');
  const isInterState = document.getElementById('invoiceIsInterState').checked;

  const subtotal = parseFloat(amtInput.value) || 0;
  const rate = parseFloat(rateSelect.value) || 0;

  const totalGst = (subtotal * rate) / 100;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  if (isInterState) {
    igst = totalGst;
    document.getElementById('invoiceSummaryCgstRow').style.display = 'none';
    document.getElementById('invoiceSummarySgstRow').style.display = 'none';
    document.getElementById('invoiceSummaryIgstRow').style.display = 'flex';
    document.getElementById('invoiceSummaryIgstLabel').innerText = `IGST (${rate}%):`;
    document.getElementById('invoiceSummaryIgst').innerText = `₹${igst.toFixed(2)}`;
  } else {
    cgst = totalGst / 2;
    sgst = totalGst / 2;
    document.getElementById('invoiceSummaryCgstRow').style.display = 'flex';
    document.getElementById('invoiceSummarySgstRow').style.display = 'flex';
    document.getElementById('invoiceSummaryIgstRow').style.display = 'none';
    document.getElementById('invoiceSummaryCgstLabel').innerText = `CGST (${(rate / 2)}%):`;
    document.getElementById('invoiceSummaryCgst').innerText = `₹${cgst.toFixed(2)}`;
    document.getElementById('invoiceSummarySgstLabel').innerText = `SGST (${(rate / 2)}%):`;
    document.getElementById('invoiceSummarySgst').innerText = `₹${sgst.toFixed(2)}`;
  }

  const total = subtotal + totalGst;

  document.getElementById('invoiceSummarySubtotal').innerText = `₹${subtotal.toFixed(2)}`;
  document.getElementById('invoiceSummaryTotal').innerText = `₹${total.toFixed(2)}`;

  return { subtotal, rate, cgst, sgst, igst, total };
}

async function fetchAndRenderInvoices() {
  try {
    const isCEO = currentUser && currentUser.ceoEmail && currentUser.email && currentUser.email.toLowerCase() === currentUser.ceoEmail.toLowerCase();
    const hasInvoicePerm = currentUser && currentUser.permissions && currentUser.permissions.createInvoice === true;
    const isSuperAdmin = currentUser && currentUser.role === 'Super Admin';
    
    if (isCEO || isSuperAdmin || hasInvoicePerm) {
      const invoiceRes = await fetch(`${API_BASE}/api/invoices`, { headers: getAuthHeaders() });
      if (invoiceRes.ok) {
        invoices = await invoiceRes.json();
      }
    }
  } catch (err) {
    console.error("Error fetching invoices list:", err);
  }
  renderBillingDashboard();
}

function renderBillingDashboard() {
  const tbody = document.getElementById('invoicesTableBody');
  if (!tbody) return;

  if (invoices.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="padding: 2rem; text-align: center; color: var(--text-muted);">No invoices generated yet. Click "Create Invoice" above to issue a new bill.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = invoices.map(inv => {
    const lastSent = inv.lastSentDate ? `Sent: ${inv.lastSentDate}` : 'Not Sent';
    const isPaid = inv.status === 'Paid';
    
    // Status manual select dropdown
    const statusSelect = `
      <select onchange="updateInvoiceStatus('${inv.id}', this.value)" class="form-control" style="font-size: 0.72rem; padding: 2px 6px; height: 28px; width: 95px; border-radius: 4px; background: rgba(15,23,42,0.4); color: var(--text-primary); cursor: pointer; border-color: ${isPaid ? '#10B981' : '#F59E0B'}; display: inline-block;">
        <option value="Pending" ${inv.status === 'Pending' ? 'selected' : ''}>Pending</option>
        <option value="Paid" ${inv.status === 'Paid' ? 'selected' : ''}>Paid</option>
      </select>
    `;

    return `
      <tr style="border-bottom: 1px solid var(--border-color);">
        <td style="padding: 1rem; color: var(--text-primary); font-weight: 600;">${inv.invoiceNumber}</td>
        <td style="padding: 1rem; color: var(--text-primary);">
          <div><strong>${inv.clientName}</strong></div>
          <div style="font-size: 0.7rem; color: var(--text-muted);">${inv.clientEmail || 'No Email'}</div>
        </td>
        <td style="padding: 1rem; color: var(--text-secondary);">${inv.invoiceDate}</td>
        <td style="padding: 1rem; text-align: right; color: var(--text-secondary);">₹${parseFloat(inv.amount).toFixed(2)}</td>
        <td style="padding: 1rem; text-align: right; color: var(--accent-purple); font-weight: 600;">₹${parseFloat(inv.totalAmount).toFixed(2)}</td>
        <td style="padding: 1rem; text-align: center;">${statusSelect}</td>
        <td style="padding: 1rem; text-align: center;">
          <div style="display: flex; flex-direction: column; gap: 0.35rem; align-items: center;">
            <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 500;">${lastSent}</div>
            <div style="display: flex; gap: 0.35rem; justify-content: center; align-items: center;">
              <button class="outreach-action-btn" onclick="printInvoice('${inv.id}')" title="Print Invoice" style="color: var(--accent-purple); border-color: rgba(168, 85, 247, 0.4); background: rgba(168, 85, 247, 0.1); width: 28px; height: 28px; border-radius: 50%; padding: 0; margin: 0; display: inline-flex; align-items: center; justify-content: center;">
                <i data-lucide="printer" style="width: 14px; height: 14px;"></i>
              </button>
              <button class="outreach-action-btn" onclick="sendInvoiceEmail('${inv.id}')" title="${inv.lastSentDate ? 'Resend Invoice Email' : 'Send Invoice Email'}" style="color: var(--accent-blue); border-color: rgba(14, 165, 233, 0.4); background: rgba(14, 165, 233, 0.1); width: 28px; height: 28px; border-radius: 50%; padding: 0; margin: 0; display: inline-flex; align-items: center; justify-content: center;">
                <i data-lucide="mail" style="width: 14px; height: 14px;"></i>
              </button>
              <button class="outreach-action-btn" onclick="remindInvoiceWhatsApp('${inv.id}')" title="WhatsApp Reminder" style="color: #10B981; border-color: rgba(16, 185, 129, 0.4); background: rgba(16, 185, 129, 0.1); width: 28px; height: 28px; border-radius: 50%; padding: 0; margin: 0; display: inline-flex; align-items: center; justify-content: center;">
                <i data-lucide="message-square" style="width: 14px; height: 14px;"></i>
              </button>
              <button class="outreach-action-btn" onclick="remindInvoiceCall('${inv.id}')" title="Call Reminder" style="color: #F59E0B; border-color: rgba(245, 158, 11, 0.4); background: rgba(245, 158, 11, 0.1); width: 28px; height: 28px; border-radius: 50%; padding: 0; margin: 0; display: inline-flex; align-items: center; justify-content: center;">
                <i data-lucide="phone" style="width: 14px; height: 14px;"></i>
              </button>
            </div>
          </div>
        </td>
      </tr>
    `;
  }).join('');
  
  if (window.lucide) lucide.createIcons();
}

async function updateInvoiceStatus(invoiceId, newStatus) {
  try {
    const res = await fetch(`${API_BASE}/api/invoices/${invoiceId}/status`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ status: newStatus })
    });

    if (!res.ok) throw new Error('Failed to update status.');

    // Update locally
    const inv = invoices.find(i => i.id === invoiceId);
    if (inv) inv.status = newStatus;

    showAppNotification('Success', 'Invoice status updated successfully.', 'success');
    renderBillingDashboard();
  } catch (err) {
    showAppNotification('Error', err.message, 'danger');
  }
}

let currentPreviewInvoiceId = null;
let currentPreviewPdfBase64 = null;

async function sendInvoiceEmail(invoiceId) {
  const inv = invoices.find(i => i.id === invoiceId);
  if (!inv) return;

  showAppNotification('Preparing PDF', 'Generating tax invoice PDF attachment...', 'info');

  try {
    // 1. Temporarily prepare print preview template layout
    printInvoice(invoiceId);
    const printOverlay = document.getElementById('printInvoiceOverlay');
    const printTarget = document.getElementById('invoicePrintTarget');
    
    // Position print overlay behind the main app layout so it renders in the DOM tree fully
    printOverlay.style.display = 'block';
    printOverlay.style.position = 'fixed';
    printOverlay.style.left = '0';
    printOverlay.style.top = '0';
    printOverlay.style.zIndex = '-99999';

    const filename = `invoice_${inv.invoiceNumber.replace(/[^a-z0-9]/gi, '_')}.pdf`;
    document.getElementById('pdfAttachmentName').innerText = filename;

    const opt = {
      margin:       0.25,
      filename:     filename,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, logging: false },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    // Generate PDF Base64 string directly from the clean print target card
    const pdfBase64 = await html2pdf().set(opt).from(printTarget).toPdf().output('datauristring');

    // Restore print overlay styles
    printOverlay.style.display = 'none';
    printOverlay.style.position = 'fixed';
    printOverlay.style.left = '0';
    printOverlay.style.zIndex = '200000';

    currentPreviewInvoiceId = invoiceId;
    currentPreviewPdfBase64 = pdfBase64;

    // 3. Pre-fill Email Preview Fields
    document.getElementById('emailPreviewTo').value = inv.clientEmail || '';
    document.getElementById('emailPreviewSubject').value = `Tax Invoice ${inv.invoiceNumber} from ${currentUser.organization || 'Our Team'}`;

    const items = inv.items ? (typeof inv.items === 'string' ? JSON.parse(inv.items) : inv.items) : [];
    const itemDesc = items[0] && items[0].description ? items[0].description : 'Consulting & Project Execution Services';

    const defaultText = `Dear ${inv.clientName},

Hope you are doing well.

Please find attached the official Tax Invoice ${inv.invoiceNumber} for your review.

Invoice Summary:
- Invoice Number: ${inv.invoiceNumber}
- Date: ${inv.invoiceDate}
- Description: ${itemDesc}
- Taxable Amount: ₹${parseFloat(inv.amount).toFixed(2)}
- GST: ${inv.gstRate}%
- Total Amount Due: ₹${parseFloat(inv.totalAmount).toFixed(2)}

Please process the clearance at your earliest convenience. If you have any questions, feel free to reach out.

Best regards,
${currentUser.name}
${currentUser.organization || ''}`;
    document.getElementById('emailPreviewBody').value = defaultText;

    // Reset default attachment UI state
    document.getElementById('emailAttachPdf').checked = true;
    document.getElementById('pdfAttachmentContainer').style.display = 'flex';

    // Show the Email Preview Modal
    document.getElementById('emailPreviewModalOverlay').style.display = 'flex';
  } catch (err) {
    showAppNotification('PDF Generation Error', err.message, 'danger');
  }
}

function closeEmailPreviewModal() {
  document.getElementById('emailPreviewModalOverlay').style.display = 'none';
  currentPreviewInvoiceId = null;
  currentPreviewPdfBase64 = null;
}

function togglePdfAttachment(isChecked) {
  const container = document.getElementById('pdfAttachmentContainer');
  if (container) {
    container.style.display = isChecked ? 'flex' : 'none';
  }
}

function previewPdfBlob(e) {
  e.preventDefault();
  if (!currentPreviewPdfBase64) return;
  
  try {
    const parts = currentPreviewPdfBase64.split(';base64,');
    const contentType = parts[0].split(':')[1] || 'application/pdf';
    const raw = window.atob(parts[1]);
    const rawLength = raw.length;
    const uInt8Array = new Uint8Array(rawLength);
    
    for (let i = 0; i < rawLength; ++i) {
      uInt8Array[i] = raw.charCodeAt(i);
    }
    
    const blob = new Blob([uInt8Array], { type: contentType });
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, '_blank');
  } catch (err) {
    console.error("Preview PDF window error:", err);
    showAppNotification('Preview Error', 'Failed to generate PDF preview in browser.', 'danger');
  }
}

// Bind button listener
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btnConfirmSendEmail');
  if (btn) {
    btn.addEventListener('click', executeSendInvoiceEmail);
  }
});

async function executeSendInvoiceEmail() {
  if (!currentPreviewInvoiceId) return;
  
  // Capture copies of global states before closeEmailPreviewModal resets them!
  const invoiceId = currentPreviewInvoiceId;
  const pdfBase64 = currentPreviewPdfBase64;
  
  const to = document.getElementById('emailPreviewTo').value.trim();
  const subject = document.getElementById('emailPreviewSubject').value.trim();
  const body = document.getElementById('emailPreviewBody').value;
  const filename = document.getElementById('pdfAttachmentName').innerText;
  const attachPdf = document.getElementById('emailAttachPdf').checked;

  if (!to) {
    showAppNotification('Validation Error', 'Recipient email is required.', 'danger');
    return;
  }

  showAppNotification('Sending Email', 'Dispatching invoice notification via SMTP...', 'info');
  closeEmailPreviewModal();

  try {
    const res = await fetch(`${API_BASE}/api/invoices/send-email`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        invoiceId: invoiceId,
        to,
        subject,
        body,
        pdfAttachment: attachPdf ? pdfBase64 : null,
        pdfFilename: filename
      })
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Failed to send invoice email.');
    }

    const data = await res.json();
    
    // Update local record sent date
    const inv = invoices.find(i => i.id === invoiceId);
    if (inv) inv.lastSentDate = data.lastSentDate;

    showAppNotification('Email Sent', 'Invoice notification sent successfully via SMTP.', 'success');
    renderBillingDashboard();
  } catch (err) {
    showAppNotification('Delivery Error', err.message, 'danger');
  }
}

function remindInvoiceWhatsApp(invoiceId) {
  const inv = invoices.find(i => i.id === invoiceId);
  if (!inv) return;

  const text = `Hi ${inv.clientName}, hope you are doing well. This is a gentle reminder that tax invoice ${inv.invoiceNumber} for ₹${inv.totalAmount} is currently pending. Please clear it at your earliest convenience. Thank you!`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

function remindInvoiceCall(invoiceId) {
  const inv = invoices.find(i => i.id === invoiceId);
  if (!inv) return;

  showAppNotification('Call Reminder', `A call request has been registered to follow-up with ${inv.clientName} regarding invoice ${inv.invoiceNumber}.`, 'success');
}

function populatePreviousClientsDropdown() {
  const select = document.getElementById('previousClientSelect');
  if (!select) return;

  const seen = new Set();
  const clients = [];
  invoices.forEach(inv => {
    if (inv.clientName && !seen.has(inv.clientName)) {
      seen.add(inv.clientName);
      clients.push(inv);
    }
  });

  let html = '<option value="">-- Select client to auto-fill --</option>';
  clients.forEach(c => {
    html += `<option value="${c.id}">${c.clientName} (${c.clientGst || 'No GSTIN'})</option>`;
  });
  select.innerHTML = html;
}

function populateFromPreviousClient(invoiceId) {
  if (!invoiceId) return;
  const inv = invoices.find(i => i.id === invoiceId);
  if (!inv) return;

  document.getElementById('invoiceClientName').value = inv.clientName || '';
  document.getElementById('invoiceClientEmail').value = inv.clientEmail || '';
  document.getElementById('invoiceClientAddress').value = inv.clientAddress || '';
  document.getElementById('invoiceClientGst').value = inv.clientGst || '';
}

function populateInvoiceClientsSelect() {
  const select = document.getElementById('invoiceClientSelect');
  if (!select) return;
  const targetTenantId = currentUser.role === 'Super Admin' ? activeTenantId : currentUser.tenantId;
  const clientLeads = leads.filter(l => l.status === 'won' && (targetTenantId === 'all' || l.tenantId === targetTenantId));
  
  let html = '<option value="">-- Select Client from Directory --</option>';
  clientLeads.forEach(c => {
    html += `<option value="${c.id}">${escapeHTML(c.name)} (${escapeHTML(c.company || 'Direct Client')})</option>`;
  });
  select.innerHTML = html;
}

function handleInvoiceClientSelectChange(clientId) {
  if (!clientId) {
    document.getElementById('invoiceClientName').value = '';
    document.getElementById('invoiceClientEmail').value = '';
    document.getElementById('invoiceClientAddress').value = '';
    return;
  }
  const client = leads.find(l => l.id === clientId);
  if (client) {
    document.getElementById('invoiceClientName').value = client.name || '';
    document.getElementById('invoiceClientEmail').value = client.email || '';
    document.getElementById('invoiceClientAddress').value = client.company || '';
  }
}

function openInvoiceModal() {
  document.getElementById('invoiceForm').reset();
  document.getElementById('invoiceDate').value = new Date().toISOString().split('T')[0];
  populatePreviousClientsDropdown();
  populateInvoiceClientsSelect();
  calculateGstSummary();
  document.getElementById('invoiceModalOverlay').style.display = 'flex';
}

function closeInvoiceModal() {
  document.getElementById('invoiceModalOverlay').style.display = 'none';
}

function openCompanyBillingModal() {
  if (companyInfo) {
    document.getElementById('billingAddress').value = companyInfo.companyAddress || '';
    document.getElementById('billingGst').value = companyInfo.gstNumber || '';
    document.getElementById('billingCin').value = companyInfo.cinNumber || '';
    document.getElementById('billingMsme').value = companyInfo.msmeNumber || '';
    document.getElementById('billingSac').value = companyInfo.sacNumber || '';
    document.getElementById('billingDeletePin').value = companyInfo.deleteLeadPin || '';
    document.getElementById('billingLogoUrl').value = companyInfo.logoUrl || '';
    if (document.getElementById('billingIndustry')) {
      document.getElementById('billingIndustry').value = companyInfo.industry || 'Real Estate CRM Software';
    }

    const preview = document.getElementById('billingLogoPreview');
    const icon = document.getElementById('billingLogoIcon');
    if (companyInfo.logoUrl) {
      if (preview) {
        preview.src = companyInfo.logoUrl;
        preview.style.display = 'block';
      }
      if (icon) icon.style.display = 'none';
    } else {
      if (preview) preview.style.display = 'none';
      if (icon) icon.style.display = 'block';
    }
  }

  const isCEO = (currentUser && currentUser.ceoEmail && currentUser.email.toLowerCase() === currentUser.ceoEmail.toLowerCase()) ||
                (companyInfo && companyInfo.ceoEmail && currentUser && currentUser.email.toLowerCase() === companyInfo.ceoEmail.toLowerCase());
  const isSuperAdmin = currentUser && currentUser.role === 'Super Admin';
  const pinContainer = document.getElementById('billingDeletePinContainer');
  if (pinContainer) {
    if (isCEO || isSuperAdmin) {
      pinContainer.style.display = 'block';
    } else {
      pinContainer.style.display = 'none';
    }
  }

  document.getElementById('companyBillingModalOverlay').style.display = 'flex';
}

function closeCompanyBillingModal() {
  document.getElementById('companyBillingModalOverlay').style.display = 'none';
}

async function handleCompanyBillingSubmit(e) {
  e.preventDefault();
  const companyAddress = document.getElementById('billingAddress').value.trim();
  const gstNumber = document.getElementById('billingGst').value.trim();
  const cinNumber = document.getElementById('billingCin').value.trim();
  const msmeNumber = document.getElementById('billingMsme').value.trim();
  const sacNumber = document.getElementById('billingSac').value.trim();
  const deleteLeadPin = document.getElementById('billingDeletePin').value.trim();
  const logoUrl = document.getElementById('billingLogoUrl').value;
  const industry = document.getElementById('billingIndustry') ? document.getElementById('billingIndustry').value : 'Real Estate CRM Software';

  try {
    const res = await fetch(`${API_BASE}/api/companies/my-company/settings`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        companyAddress,
        gstNumber,
        cinNumber,
        msmeNumber,
        sacNumber,
        deleteLeadPin,
        logoUrl,
        industry
      })
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Failed to update company settings.');
    }

    const compInfoRes = await fetch(`${API_BASE}/api/companies/info`, { headers: getAuthHeaders() });
    if (compInfoRes.ok) {
      companyInfo = await compInfoRes.json();
    }

    showAppNotification('Success', 'Company billing settings updated successfully.', 'success');
    closeCompanyBillingModal();
    
    // Refresh the application fully to apply the new industry configuration
    showGlobalLoading("Applying new industry stages...");
    await initRemoteDatabase();
  } catch (err) {
    showAppNotification('Error', err.message, 'danger');
  } finally {
    hideGlobalLoading();
  }
}

async function handleInvoiceCreateSubmit(e) {
  e.preventDefault();
  const invoiceNumber = document.getElementById('invoiceNumber').value.trim();
  const invoiceDate = document.getElementById('invoiceDate').value;
  const clientName = document.getElementById('invoiceClientName').value.trim();
  const clientEmail = document.getElementById('invoiceClientEmail').value.trim();
  const clientAddress = document.getElementById('invoiceClientAddress').value.trim();
  const clientGst = document.getElementById('invoiceClientGst').value.trim();
  const description = document.getElementById('invoiceDescription').value.trim() || 'Consulting & Project Execution Services';

  const { subtotal, rate, cgst, sgst, igst, total } = calculateGstSummary();

  try {
    showGlobalLoading("Generating GST-compliant invoice...");
    const res = await fetch(`${API_BASE}/api/invoices`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        invoiceNumber,
        invoiceDate,
        clientName,
        clientEmail,
        clientAddress,
        clientGst,
        amount: subtotal,
        gstRate: rate,
        cgst,
        sgst,
        igst,
        totalAmount: total,
        items: [{ description: description, amount: subtotal }]
      })
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Failed to create invoice.');
    }

    const data = await res.json();

    const invoiceRes = await fetch(`${API_BASE}/api/invoices`, { headers: getAuthHeaders() });
    if (invoiceRes.ok) {
      invoices = await invoiceRes.json();
    }

    renderBillingDashboard();
    renderClientsKanban();
    closeInvoiceModal();
    showAppNotification('Success', 'Invoice generated successfully.', 'success');

    printInvoice(data.invoiceId);
  } catch (err) {
    showAppNotification('Error', err.message, 'danger');
  } finally {
    hideGlobalLoading();
  }
}

function printInvoice(invoiceId) {
  const inv = invoices.find(i => i.id === invoiceId);
  if (!inv) return;

  const companyName = currentUser.organization || 'My Company';
  document.getElementById('printCompanyName').innerText = companyName;

  const address = (companyInfo && companyInfo.companyAddress) ? companyInfo.companyAddress : 'Registered Company Address';
  document.getElementById('printCompanyAddress').innerText = address;

  const gst = (companyInfo && companyInfo.gstNumber) ? `GSTIN: ${companyInfo.gstNumber}` : 'GSTIN: Not Configured';
  document.getElementById('printCompanyGst').innerText = gst;

  const cin = (companyInfo && companyInfo.cinNumber) ? `CIN: ${companyInfo.cinNumber}` : '';
  document.getElementById('printCompanyCin').innerText = cin;
  document.getElementById('printCompanyCin').style.display = cin ? 'block' : 'none';

  const msme = (companyInfo && companyInfo.msmeNumber) ? `MSME: ${companyInfo.msmeNumber}` : '';
  document.getElementById('printCompanyMsme').innerText = msme;
  document.getElementById('printCompanyMsme').style.display = msme ? 'block' : 'none';

  const sac = (companyInfo && companyInfo.sacNumber) ? `SAC Code: ${companyInfo.sacNumber}` : '';
  document.getElementById('printCompanySac').innerText = sac;
  document.getElementById('printCompanySac').style.display = sac ? 'block' : 'none';

  const logoImg = document.getElementById('printLogo');
  if (companyInfo && companyInfo.logoUrl) {
    logoImg.src = companyInfo.logoUrl;
    logoImg.style.display = 'block';
    document.getElementById('printCompanyName').style.display = 'none';
  } else {
    logoImg.style.display = 'none';
    document.getElementById('printCompanyName').style.display = 'block';
  }

  document.getElementById('printInvoiceNo').innerText = inv.invoiceNumber;
  document.getElementById('printInvoiceDate').innerText = inv.invoiceDate;

  document.getElementById('printClientName').innerText = inv.clientName;
  document.getElementById('printClientAddress').innerText = inv.clientAddress || 'N/A';
  document.getElementById('printClientEmail').innerText = inv.clientEmail || '';
  document.getElementById('printClientGst').innerText = inv.clientGst ? `Client GSTIN: ${inv.clientGst}` : '';

  const items = inv.items ? (typeof inv.items === 'string' ? JSON.parse(inv.items) : inv.items) : [];
  const itemDesc = items[0] && items[0].description ? items[0].description : 'Consulting & Project Execution Services';
  document.getElementById('printDescriptionHeader').innerText = itemDesc;

  document.getElementById('printLineAmount').innerText = `₹${parseFloat(inv.amount).toFixed(2)}`;
  document.getElementById('printSubtotal').innerText = `₹${parseFloat(inv.amount).toFixed(2)}`;

  if (parseFloat(inv.igst) > 0) {
    document.getElementById('printIgstRow').style.display = 'flex';
    document.getElementById('printIgstLabel').innerText = `IGST (${inv.gstRate}%):`;
    document.getElementById('printIgst').innerText = `₹${parseFloat(inv.igst).toFixed(2)}`;
    document.getElementById('printCgstRow').style.display = 'none';
    document.getElementById('printSgstRow').style.display = 'none';
  } else {
    document.getElementById('printIgstRow').style.display = 'none';
    document.getElementById('printCgstRow').style.display = 'flex';
    document.getElementById('printSgstRow').style.display = 'flex';
    document.getElementById('printCgstLabel').innerText = `CGST (${(inv.gstRate / 2)}%):`;
    document.getElementById('printCgst').innerText = `₹${parseFloat(inv.cgst).toFixed(2)}`;
    document.getElementById('printSgstLabel').innerText = `SGST (${(inv.gstRate / 2)}%):`;
    document.getElementById('printSgst').innerText = `₹${parseFloat(inv.sgst).toFixed(2)}`;
  }

  document.getElementById('printTotalAmount').innerText = `₹${parseFloat(inv.totalAmount).toFixed(2)}`;

  document.getElementById('printInvoiceOverlay').style.display = 'block';
}

function closePrintInvoice() {
  document.getElementById('printInvoiceOverlay').style.display = 'none';
}


// ----------------------------------------------------
// RECRUITMENT CRM MODULE LOGIC
// ----------------------------------------------------
let recruitmentJobs = [];
let recruitmentCandidates = [];
let selectedJobId = null;

async function fetchCandidatesForSelectedJob(jobId) {
  try {
    const targetJobId = jobId || selectedJobId;
    let url = `${API_BASE}/api/candidates?excludeResume=true`;
    if (targetJobId && targetJobId !== 'all') {
      url += `&jobId=${encodeURIComponent(targetJobId)}`;
    }
    const res = await fetch(url, { headers: getAuthHeaders() });
    if (res.ok) {
      recruitmentCandidates = await res.json();
    }
  } catch (err) {
    console.error("Failed to fetch candidates for selected job:", err);
  }
}

async function fetchAllRecruitmentCandidates(forceJobsFetch = false) {
  if (selectedJobId && selectedJobId !== 'all') {
    return fetchCandidatesForSelectedJob(selectedJobId);
  }
  try {
    if (forceJobsFetch || recruitmentJobs.length === 0) {
      const jobsRes = await fetch(`${API_BASE}/api/jobs`, { headers: getAuthHeaders() });
      if (jobsRes.ok) {
        recruitmentJobs = await jobsRes.json();
      }
    }
    const res = await fetch(`${API_BASE}/api/candidates?excludeResume=true`, { headers: getAuthHeaders() });
    if (res.ok) {
      recruitmentCandidates = await res.json();
    }
  } catch (err) {
    console.error("Failed to fetch recruitment candidates:", err);
  }
}


async function ensureRecruitmentDataLoaded() {
  if (recruitmentJobs.length === 0 || recruitmentCandidates.length === 0) {
    try {
      showGlobalLoading("Loading Client records & Job requirements...");
      const jobsRes = await fetch(`${API_BASE}/api/jobs`, { headers: getAuthHeaders() });
      if (jobsRes.ok) {
        recruitmentJobs = await jobsRes.json();
      }
      await fetchAllRecruitmentCandidates();
    } catch (err) {
      console.error("Failed to preload recruitment data:", err);
    } finally {
      hideGlobalLoading();
    }
  }
}

let jobsOffset = 0;
let jobsLimit = 5;
let hasMoreJobsNetwork = true;
let isLoadingMoreJobs = false;

async function fetchAndRenderRecruitment(isInitial = true) {
  try {
    showGlobalLoading("Syncing Recruitment records...");

    if (isInitial) {
      jobsOffset = 0;
      hasMoreJobsNetwork = true;
      recruitmentJobs = [];
    }
    
    // 1. Fetch ONLY 5 jobs over network!
    const jobsRes = await fetch(`${API_BASE}/api/jobs?limit=${jobsLimit}&offset=${jobsOffset}`, { headers: getAuthHeaders() });
    if (jobsRes.ok) {
      const newBatch = await jobsRes.json();
      if (newBatch.length < jobsLimit) {
        hasMoreJobsNetwork = false;
      }
      recruitmentJobs = isInitial ? newBatch : [...recruitmentJobs, ...newBatch];
      jobsOffset = recruitmentJobs.length;
    }

    // 2. Set default active job if none selected or if it is set to legacy database value
    if (selectedJobId === 'database' || (!selectedJobId && recruitmentJobs.length > 0)) {
      selectedJobId = recruitmentJobs.length > 0 ? recruitmentJobs[0].id : null;
    }

    // 3. Fetch candidates scoped ONLY to the selected job (95%+ payload savings!)
    if (selectedJobId) {
      await fetchCandidatesForSelectedJob(selectedJobId);
    }

    // 4. Populate filter dropdown selectors
    populateRecruitmentFilters();

    // 5. Populate agent/recruiter dropdown lists in Job & Candidate modals
    populateRecruiterDropdowns();

    // 6. Update KPIs
    updateRecruitmentKPIs();

    // 7. Render Jobs list
    renderRecruitmentJobs();

    // 8. Render Candidate Pipeline
    renderCandidatePipeline();

    // 9. Load Careers Portal Applications Queue
    fetchAndRenderApplications();
  } catch (err) {
    showAppNotification('Error', 'Failed to fetch recruitment data: ' + err.message, 'danger');
  } finally {
    hideGlobalLoading();
  }
}

async function loadNextBatchOfJobsFromNetwork() {
  if (!hasMoreJobsNetwork || isLoadingMoreJobs) return;
  isLoadingMoreJobs = true;
  try {
    const container = document.getElementById('recruitmentJobsList');
    if (container) {
      const loader = document.createElement('div');
      loader.id = 'jobsLoadingSpinner';
      loader.style.cssText = 'text-align: center; padding: 0.5rem; color: var(--text-muted); font-size: 0.75rem;';
      loader.innerText = 'Loading next 5 jobs...';
      container.appendChild(loader);
    }

    const jobsRes = await fetch(`${API_BASE}/api/jobs?limit=${jobsLimit}&offset=${jobsOffset}`, { headers: getAuthHeaders() });
    if (jobsRes.ok) {
      const newBatch = await jobsRes.json();
      if (newBatch.length < jobsLimit) {
        hasMoreJobsNetwork = false;
      }
      if (newBatch.length > 0) {
        recruitmentJobs = [...recruitmentJobs, ...newBatch];
        jobsOffset = recruitmentJobs.length;
        renderRecruitmentJobs();
      }
    }
  } catch (e) {
    console.error("Failed to load next batch of jobs:", e);
  } finally {
    isLoadingMoreJobs = false;
    const spinner = document.getElementById('jobsLoadingSpinner');
    if (spinner) spinner.remove();
  }
}

function getFilteredCandidates() {
  const clientSelect = document.getElementById('filterRecruitmentClient');
  const userSelect = document.getElementById('filterRecruitmentUser');
  const searchInput = document.getElementById('filterRecruitmentSearch');
  
  const filterClient = clientSelect ? clientSelect.value : 'all';
  const filterUser = userSelect ? userSelect.value : 'all';
  const searchQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';
  
  let list = recruitmentCandidates;
  
  // 1. Filter by Client (associated jobs matching company name)
  if (filterClient !== 'all') {
    const targetComp = filterClient.toLowerCase().trim();
    const clientJobs = recruitmentJobs.filter(job => {
      const clientDisp = getJobClientDisplayName(job).toLowerCase().trim();
      return clientDisp === targetComp;
    });
    const clientJobIds = clientJobs.map(j => String(j.id));
    list = list.filter(c => clientJobIds.includes(String(c.jobId)));
  } else {
    // Exclude general candidate database entries from "All" view unless selectedJobId is database
    if (selectedJobId !== 'database') {
      list = list.filter(c => String(c.jobId) !== 'database');
    }
  }
  
  // 2. Filter by clicked/selected job in the left list (if one is active and we aren't showing "all")
  if (selectedJobId && selectedJobId !== 'all' && selectedJobId !== 'database') {
    list = list.filter(c => String(c.jobId) === String(selectedJobId));
  } else if (selectedJobId === 'database') {
    list = list.filter(c => String(c.jobId) === 'database');
  }
  
  // 3. Filter by Recruiter User
  if (filterUser !== 'all') {
    list = list.filter(c => c.assignedRecruiter && c.assignedRecruiter.toLowerCase() === filterUser.toLowerCase());
  }
  
  // 4. Search Query filter (Real-time Search)
  if (searchQuery) {
    list = list.filter(c => {
      const nameMatch = c.name && c.name.toLowerCase().includes(searchQuery);
      const emailMatch = c.email && c.email.toLowerCase().includes(searchQuery);
      const phoneMatch = c.phone && c.phone.toLowerCase().includes(searchQuery);
      
      let skillsMatch = false;
      if (c.details) {
        try {
          const parsed = typeof c.details === 'string' ? JSON.parse(c.details) : c.details;
          if (parsed.skills && parsed.skills.toLowerCase().includes(searchQuery)) {
            skillsMatch = true;
          }
        } catch(e) {}
      }
      return nameMatch || emailMatch || phoneMatch || skillsMatch;
    });
  }
  
  return list;
}

function getJobClientDisplayName(job) {
  if (!job) return 'Internal Client';

  // 1. Direct company field on job
  if (job.company && job.company.trim() && job.company.trim().toLowerCase() !== 'neogencode main') {
    return job.company.trim();
  }
  if (job.client_name && job.client_name.trim() && job.client_name.trim().toLowerCase() !== 'neogencode main') {
    return job.client_name.trim();
  }

  // 2. Associated lead in leads array (e.g. from Won Clients Directory)
  if (job.clientId) {
    const matchedLead = leads.find(l => String(l.id) === String(job.clientId) || (l.company && l.company.toLowerCase() === String(job.clientId).toLowerCase()));
    if (matchedLead) {
      const comp = (matchedLead.company || matchedLead.name || '').trim();
      if (comp && comp.toLowerCase() !== 'neogencode main') {
        return comp;
      }
    }
    if (!String(job.clientId).startsWith('lead-') && !String(job.clientId).startsWith('job-')) {
      return String(job.clientId).trim();
    }
  }

  // 3. Fallback to job's company field if present
  if (job.company && job.company.trim()) {
    return job.company.trim();
  }

  // 4. Default for unassigned jobs
  return 'Internal Client';
}

function populateRecruitmentFilters() {
  const clientSelect = document.getElementById('filterRecruitmentClient');
  const userSelect = document.getElementById('filterRecruitmentUser');
  if (!clientSelect || !userSelect) return;

  const prevClient = clientSelect.value || 'all';
  const prevUser = userSelect.value || 'all';

  // 1. Populate Clients (Deduplicated list of client companies from Won Clients Directory + Jobs)
  clientSelect.innerHTML = '<option value="all">-- All Clients --</option>';
  const seenCompanies = new Set();

  // A. Won Clients Directory (leads with status 'won' or 'Working with them (won)')
  const wonClients = leads.filter(l => l.status === 'won' || l.status === 'Working with them (won)');
  wonClients.forEach(l => {
    const compName = (l.company || l.name || '').trim();
    if (compName) seenCompanies.add(compName);
  });

  // B. All other leads
  leads.forEach(l => {
    const compName = (l.company || l.name || '').trim();
    if (compName) seenCompanies.add(compName);
  });

  // C. Jobs Directory
  recruitmentJobs.forEach(j => {
    const compName = getJobClientDisplayName(j);
    if (compName) seenCompanies.add(compName);
  });

  const sortedCompanies = Array.from(seenCompanies).sort((a, b) => a.localeCompare(b));
  sortedCompanies.forEach(compName => {
    clientSelect.innerHTML += `<option value="${escapeHTML(compName)}">${escapeHTML(compName)}</option>`;
  });

  // 2. Populate Recruiters
  userSelect.innerHTML = '<option value="all">-- All Users / Recruiters --</option>';
  let recruiters = [];
  if (agents) {
    agents.forEach(agent => {
      if (agent.name) recruiters.push(agent.name);
    });
  }
  recruitmentCandidates.forEach(cand => {
    if (cand.assignedRecruiter && !recruiters.includes(cand.assignedRecruiter)) {
      recruiters.push(cand.assignedRecruiter);
    }
  });

  recruiters = [...new Set(recruiters.filter(Boolean))];
  recruiters.forEach(name => {
    userSelect.innerHTML += `<option value="${name}">${escapeHTML(name)}</option>`;
  });

  if ([...clientSelect.options].some(o => o.value === prevClient)) {
    clientSelect.value = prevClient;
  }
  if ([...userSelect.options].some(o => o.value === prevUser)) {
    userSelect.value = prevUser;
  }
}

function handleRecruitmentFiltersChange() {
  updateRecruitmentKPIs();
  renderRecruitmentJobs();
  renderCandidatePipeline();
}

function populateRecruiterDropdowns() {
  const jobRecruiter = document.getElementById('jobRecruiter');
  const candRecruiter = document.getElementById('candRecruiter');
  
  const optionsHtml = agents.map(agent => `<option value="${escapeHTML(agent.name)}">${escapeHTML(agent.name)} (${escapeHTML(agent.role)})</option>`).join('');
  
  if (jobRecruiter) {
    jobRecruiter.innerHTML = `<option value="">Unassigned HR</option>${optionsHtml}`;
  }
  if (candRecruiter) {
    candRecruiter.innerHTML = `<option value="">Unassigned HR</option>${optionsHtml}`;
  }
}

function updateRecruitmentKPIs() {
  const activeJobs = recruitmentJobs.filter(j => j.status === 'open').length;
  const filteredCands = getFilteredCandidates();
  const totalCands = filteredCands.length;
  const screeningOrInterviewCount = filteredCands.filter(c => c.status === 'screening' || c.status === 'interviewing').length;
  const hiredOrOfferedCount = filteredCands.filter(c => c.status === 'hired' || c.status === 'offered').length;
  
  document.getElementById('recruitment-kpi-jobs').innerText = activeJobs;
  document.getElementById('recruitment-kpi-candidates').innerText = totalCands;
  document.getElementById('recruitment-kpi-screening').innerText = screeningOrInterviewCount;
  document.getElementById('recruitment-kpi-hired').innerText = hiredOrOfferedCount;

  // Render candidate conversion funnel progress bars
  const funnelBars = document.getElementById('recruitmentFunnelBars');
  if (funnelBars) {
    const stages = ['applied', 'screening', 'interviewing', 'offered', 'hired', 'rejected'];
    const stageLabels = {
      'applied': 'Applied',
      'screening': 'Screening',
      'interviewing': 'Interviewing',
      'offered': 'Offered',
      'hired': 'Hired',
      'rejected': 'Rejected'
    };
    const colors = {
      'applied': '#38BDF8',
      'screening': '#FBBF24',
      'interviewing': '#A855F7',
      'offered': '#C084FC',
      'hired': '#34D399',
      'rejected': '#F87171'
    };
    
    let html = '';
    stages.forEach(st => {
      const count = filteredCands.filter(c => c.status === st).length;
      const percentage = totalCands > 0 ? Math.round((count / totalCands) * 100) : 0;
      html += `
        <div class="progress-bar-wrapper" style="width: 100%;">
          <div style="display: flex; justify-content: space-between; font-size: 0.78rem; margin-bottom: 0.25rem;">
            <span style="font-weight: 500; color: var(--text-secondary);">${stageLabels[st]}</span>
            <span style="font-weight: 600; color: var(--text-primary);">${count} <span style="color: var(--text-muted); font-weight: 400; font-size: 0.72rem;">(${percentage}%)</span></span>
          </div>
          <div style="background: rgba(255,255,255,0.05); height: 6px; border-radius: 3px; overflow: hidden; width: 100%;">
            <div style="background: ${colors[st]}; width: ${percentage}%; height: 100%; border-radius: 3px; transition: width 0.8s ease;"></div>
          </div>
        </div>
      `;
    });
    funnelBars.innerHTML = html;
  }
}

let jobSearchQuery = '';
let visibleJobsLimit = 5;

let teamSearchQuery = '';

function handleTeamSearchInput(val) {
  teamSearchQuery = (val || '').toLowerCase().trim();
  renderTeamMembers();
}

let searchDebounceTimer = null;

function handleJobSearchInput(val) {
  jobSearchQuery = (val || '').toLowerCase().trim();
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(async () => {
    if (jobSearchQuery) {
      try {
        const res = await fetch(`${API_BASE}/api/jobs?search=${encodeURIComponent(jobSearchQuery)}&limit=20&offset=0`, { headers: getAuthHeaders() });
        if (res.ok) {
          recruitmentJobs = await res.json();
          renderRecruitmentJobs();
        }
      } catch (e) {
        renderRecruitmentJobs();
      }
    } else {
      fetchAndRenderRecruitment(true);
    }
  }, 300);
}

function renderRecruitmentJobs() {
  const container = document.getElementById('recruitmentJobsList');
  if (!container) return;
  
  container.innerHTML = '';
  
  const userPerms = (currentUser && currentUser.permissions) ? (typeof currentUser.permissions === 'string' ? JSON.parse(currentUser.permissions) : currentUser.permissions) : {};
  const isCEO = currentUser && currentUser.ceoEmail && currentUser.email.toLowerCase() === currentUser.ceoEmail.toLowerCase();
  const isSuperAdmin = currentUser && currentUser.role === 'Super Admin';
  const isAdmin = currentUser && (currentUser.role === 'Manager' || currentUser.role === 'Admin');
  const canAddJob = isSuperAdmin || isCEO || isAdmin || userPerms.addJobPost !== false;
  
  const clientSelect = document.getElementById('filterRecruitmentClient');
  const filterClient = clientSelect ? clientSelect.value : 'all';

  let displayJobs = recruitmentJobs;
  if (filterClient !== 'all') {
    const targetComp = filterClient.toLowerCase().trim();
    displayJobs = recruitmentJobs.filter(job => {
      const clientDisp = getJobClientDisplayName(job).toLowerCase().trim();
      return clientDisp === targetComp;
    });
  }

  // Filter by Job Search query
  if (jobSearchQuery) {
    displayJobs = displayJobs.filter(job => {
      const titleMatch = (job.title || '').toLowerCase().includes(jobSearchQuery);
      const deptMatch = (job.department || '').toLowerCase().includes(jobSearchQuery);
      const compMatch = getJobClientDisplayName(job).toLowerCase().includes(jobSearchQuery);
      const locMatch = (job.location || '').toLowerCase().includes(jobSearchQuery);
      return titleMatch || deptMatch || compMatch || locMatch;
    });
  }

  // Attach lazy scroll listener once to fetch next 5 jobs over network
  if (!container.dataset.hasScrollListener) {
    container.dataset.hasScrollListener = 'true';
    container.addEventListener('scroll', () => {
      if (container.scrollTop + container.clientHeight >= container.scrollHeight - 50) {
        if (hasMoreJobsNetwork && !isLoadingMoreJobs && !jobSearchQuery) {
          loadNextBatchOfJobsFromNetwork();
        }
      }
    });
  }

  // 2. Render actual jobs
  if (displayJobs.length > 0) {
    displayJobs.forEach(job => {
      const isSelected = selectedJobId === job.id;
      
      const card = document.createElement('div');
      card.className = `job-card ${isSelected ? 'active' : ''}`;
      card.onclick = async () => {
        selectedJobId = job.id;
        showGlobalLoading("Loading job candidates...");
        await fetchCandidatesForSelectedJob(job.id);
        updateRecruitmentKPIs();
        renderRecruitmentJobs();
        renderCandidatePipeline();
        hideGlobalLoading();
      };
      
      let actionsHtml = `
        <div style="display: flex; gap: 0.35rem; justify-content: flex-end; margin-top: 0.75rem; border-top: 1px solid rgba(255,255,255,0.03); padding-top: 0.5rem;" onclick="event.stopPropagation();">
          <button class="kanban-card-btn" style="color: var(--accent-blue); border-color: rgba(14, 165, 233, 0.25); background: rgba(14, 165, 233, 0.05); font-size: 0.7rem; padding: 2px 8px; display: inline-flex; align-items: center; gap: 2px;" title="Copy Direct Job Link for LinkedIn/Social Media" onclick="copySpecificJobDirectLink('${job.id}')">
            <i data-lucide="share-2" style="width: 11px; height: 11px;"></i> Direct Link
          </button>
          ${canAddJob ? `
            <button class="kanban-card-btn" title="Edit Job" onclick="openJobModal('${job.id}')">
              <i data-lucide="edit-2" style="width: 12px; height: 12px;"></i>
            </button>
            <button class="kanban-card-btn" style="color: #F87171;" title="Delete Job" onclick="deleteJob('${job.id}')">
              <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i>
            </button>
          ` : ''}
        </div>
      `;

      const clientName = getJobClientDisplayName(job);

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem;">
          <div class="job-card-title">${escapeHTML(job.title)}</div>
          <span style="font-size: 0.65rem; font-family: monospace; color: var(--accent-blue); background: rgba(14, 165, 233, 0.08); padding: 1px 5px; border-radius: 4px; border: 1px solid rgba(14, 165, 233, 0.2); flex-shrink: 0;" title="Job ID">
            ID: ${escapeHTML(job.id)}
          </span>
        </div>
        <div style="font-size: 0.72rem; color: var(--accent-blue); margin-bottom: 0.25rem; font-weight: 600; display: flex; align-items: center; gap: 0.25rem;">
          <i data-lucide="handshake" style="width: 12px; height: 12px;"></i>
          <span>Client: ${escapeHTML(clientName)}</span>
        </div>
        <div class="job-card-dept">
          <i data-lucide="building-2" style="width: 12px; height: 12px;"></i>
          <span>${escapeHTML(job.department || 'General')}</span>
        </div>
        <div class="job-card-meta">
          <span>HR: ${escapeHTML(job.assignedRecruiter || 'Unassigned')}</span>
          <span class="status-badge ${job.status === 'open' ? 'won' : 'lost'}" style="font-size: 0.65rem; padding: 2px 6px;">${job.status.toUpperCase()}</span>
        </div>
        ${actionsHtml}
      `;
      container.appendChild(card);
    });
  }
  lucide.createIcons();
}

function openJobModal(jobId = '') {
  console.log('openJobModal called with jobId:', jobId);
  try {
    const jobForm = document.getElementById('jobForm');
    if (!jobForm) {
      console.error("jobForm element not found!");
      return;
    }
    jobForm.reset();
    
    const jobIdElem = document.getElementById('jobId');
    if (jobIdElem) jobIdElem.value = '';
    
    const jobModalTitle = document.getElementById('jobModalTitle');
    if (jobModalTitle) {
      jobModalTitle.innerHTML = `<i data-lucide="briefcase" style="color: var(--accent-purple); width: 22px; height: 22px;"></i> Create New Job`;
    }
    
    populateJobClientsDropdown();
    
    if (jobId) {
      const job = recruitmentJobs.find(j => j.id === jobId);
      if (job) {
        if (jobIdElem) jobIdElem.value = job.id;
        const jobTitle = document.getElementById('jobTitle');
        if (jobTitle) jobTitle.value = job.title;
        const jobDept = document.getElementById('jobDept');
        if (jobDept) jobDept.value = job.department || '';
        const jobLocation = document.getElementById('jobLocation');
        if (jobLocation) jobLocation.value = job.location || '';
        const jobDescription = document.getElementById('jobDescription');
        if (jobDescription) jobDescription.value = job.description || '';
        const jobRecruiter = document.getElementById('jobRecruiter');
        if (jobRecruiter) jobRecruiter.value = job.assignedRecruiter || '';
        const jobStatus = document.getElementById('jobStatus');
        if (jobStatus) jobStatus.value = job.status || 'open';
        const jobClient = document.getElementById('jobClient');
        if (jobClient) jobClient.value = job.clientId || '';
        
        if (jobModalTitle) {
          jobModalTitle.innerHTML = `<i data-lucide="briefcase" style="color: var(--accent-purple); width: 22px; height: 22px;"></i> Edit Job Details`;
        }
      }
    }
    
    const jobModalOverlay = document.getElementById('jobModalOverlay');
    if (jobModalOverlay) {
      jobModalOverlay.classList.add('active');
    } else {
      console.error("jobModalOverlay element not found!");
    }
    
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons();
    }
  } catch (error) {
    console.error("Error in openJobModal:", error);
  }
}

function closeJobModal() {
  const overlay = document.getElementById('jobModalOverlay');
  if (overlay) {
    overlay.classList.remove('active');
  }
}

async function handleJobSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('jobId').value;
  const title = document.getElementById('jobTitle').value.trim();
  const department = document.getElementById('jobDept').value.trim();
  const description = document.getElementById('jobDescription').value.trim();
  const assigned_recruiter = document.getElementById('jobRecruiter').value;
  const status = document.getElementById('jobStatus').value;
  const jobClientElem = document.getElementById('jobClient');
  const clientId = jobClientElem ? jobClientElem.value : '';
  let company = '';
  if (clientId) {
    const matchedLead = leads.find(l => String(l.id) === String(clientId));
    if (matchedLead) company = (matchedLead.company || matchedLead.name || '').trim();
  }
  if (!company && jobClientElem && jobClientElem.selectedIndex > 0) {
    company = jobClientElem.options[jobClientElem.selectedIndex].text.trim();
  }
  const location = document.getElementById('jobLocation')?.value.trim() || '';
  
  if (!title) return;
  
  const payload = { title, department, description, assignedRecruiter: assigned_recruiter, status, clientId, company, location };
  const url = id ? `${API_BASE}/api/jobs/${id}` : `${API_BASE}/api/jobs`;
  const method = id ? 'PUT' : 'POST';
  
  try {
    showGlobalLoading("Saving Job record...");
    const res = await fetch(url, {
      method,
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to save job');
    }
    
    showAppNotification('Success', 'Job opening saved successfully.', 'success');
    closeJobModal();
    await fetchAndRenderRecruitment();
  } catch (err) {
    showAppNotification('Error', err.message, 'danger');
  } finally {
    hideGlobalLoading();
  }
}

function deleteJob(jobId) {
  showAppConfirm(
    "Confirm Job Deletion",
    "Are you sure you want to delete this job and all associated candidates? This action cannot be undone.",
    async () => {
      try {
        showGlobalLoading("Deleting Job opening...");
        const res = await fetch(`${API_BASE}/api/jobs/${jobId}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to delete job');
        }
        
        showAppNotification('Deleted', 'Job opening removed.', 'warning');
        if (selectedJobId === jobId) selectedJobId = null;
        await fetchAndRenderRecruitment();
      } catch (err) {
        showAppNotification('Error', err.message, 'danger');
      } finally {
        hideGlobalLoading();
      }
    }
  );
}

function toggleCandidateCardDetails(elementId, btn) {
  const container = document.getElementById(elementId);
  if (!container) return;
  if (container.style.maxHeight === 'none' || container.style.maxHeight === '1000px') {
    container.style.maxHeight = '70px';
    btn.innerText = '... See More';
  } else {
    container.style.maxHeight = '1000px';
    btn.innerText = '▲ Show Less';
  }
}

function renderCandidatePipeline() {
  const board = document.getElementById('candidatesKanbanBoard');
  const addBtn = document.getElementById('btnAddCandidateBtn');
  const titleHeader = document.getElementById('selectedJobTitleHeader');
  
  if (!board) return;
  
  if (!selectedJobId) {
    board.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--text-muted); font-size: 0.85rem; border: 1px dashed var(--border-color); border-radius: 12px;">
        Select a job from the left panel to display candidate recruitment pipeline.
      </div>
    `;
    if (addBtn) addBtn.style.display = 'none';
    if (titleHeader) titleHeader.innerText = 'Candidate Pipeline';
    return;
  }
  
  const selectedJob = recruitmentJobs.find(j => j.id === selectedJobId);
  if (titleHeader) {
    if (selectedJobId === 'all') {
      titleHeader.innerText = 'Pipeline: All Job Posts';
    } else if (selectedJobId === 'database') {
      titleHeader.innerText = 'Pipeline: General Candidate Database';
    } else if (selectedJob) {
      titleHeader.innerText = `Pipeline: ${selectedJob.title}`;
    }
  }
  if (addBtn) {
    if (selectedJobId === 'all') {
      addBtn.style.display = 'none';
    } else {
      addBtn.style.display = 'inline-flex';
    }
  }
  
  const columns = ['applied', 'shared_profile', 'interviewing', 'offered', 'hired', 'rejected'];
  const columnLabels = {
    'applied': 'Applied',
    'shared_profile': 'Shared profile',
    'screening': 'Shared profile',
    'interviewing': 'Interviewing',
    'offered': 'Offered',
    'hired': 'Hired',
    'rejected': 'Rejected'
  };
  
  const columnColors = {
    'applied': '#38BDF8',
    'shared_profile': '#C084FC',
    'screening': '#C084FC',
    'interviewing': '#FBBF24',
    'offered': '#A855F7',
    'hired': '#34D399',
    'rejected': '#F87171'
  };

  board.innerHTML = '';
  
  const jobCandidates = getFilteredCandidates();
  
  columns.forEach(col => {
    const colCandidates = jobCandidates.filter(c => c.status === col);
    
    let cardsHtml = '';
    colCandidates.forEach(cand => {
      const candidateJob = recruitmentJobs.find(j => String(j.id) === String(cand.jobId)) || selectedJob;
      const atsScore = calculateAtsScore(candidateJob, cand);
      const atsColor = atsScore >= 80 ? '#34D399' : (atsScore >= 68 ? '#FBBF24' : '#F87171');
      const atsBg = atsScore >= 80 ? 'rgba(52, 211, 153, 0.12)' : (atsScore >= 68 ? 'rgba(251, 191, 36, 0.12)' : 'rgba(248, 113, 113, 0.12)');

      // Decode questions & answers from summary payload JSON safely
      let infoHtml = '';
      if (cand.details) {
        try {
          const parsed = typeof cand.details === 'string' ? JSON.parse(cand.details) : cand.details;
          if (parsed.expected_ctc || parsed.notice_period || parsed.skills) {
            const uniqueCandId = `cand-details-${String(cand.id).replace(/[^a-zA-Z0-9]/g, '')}`;
            const skillsText = parsed.skills ? escapeHTML(parsed.skills) : '';
            const isLong = skillsText.length > 90 || (parsed.expected_ctc && parsed.notice_period && skillsText.length > 50);

            infoHtml = `
              <div style="margin-top: 0.35rem; font-size: 0.65rem; color: var(--text-secondary); border-top: 1px dashed rgba(255,255,255,0.05); padding-top: 0.35rem; display: flex; flex-direction: column; gap: 0.15rem;">
                ${parsed.expected_ctc ? `<div><strong>Exp. CTC:</strong> ${escapeHTML(parsed.expected_ctc)}</div>` : ''}
                ${parsed.notice_period ? `<div><strong>Notice:</strong> ${escapeHTML(parsed.notice_period)}</div>` : ''}
                ${parsed.skills ? `
                  <div id="${uniqueCandId}" style="max-height: ${isLong ? '70px' : 'none'}; overflow: hidden; position: relative; transition: max-height 0.3s ease;">
                    <strong>Skills:</strong> ${skillsText}
                  </div>
                  ${isLong ? `
                    <button type="button" onclick="event.stopPropagation(); toggleCandidateCardDetails('${uniqueCandId}', this)" style="background: none; border: none; color: var(--accent-blue); font-size: 0.62rem; padding: 2px 0; cursor: pointer; text-align: left; font-weight: 600; margin-top: 2px;">
                      ... See More
                    </button>
                  ` : ''}
                ` : ''}
              </div>
            `;
          }
        } catch(e) {}
      }
      
      cardsHtml += `
        <div class="candidate-card" draggable="true" ondragstart="dragStartCandidateCard(event, '${cand.id}')" ondragend="dragEndCandidateCard(event)" onclick="openCandidateModal('${cand.id}')" style="cursor: pointer;" title="Click to view/edit candidate profile">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
            <div class="candidate-card-name" style="text-decoration: underline; text-underline-offset: 2px;">${escapeHTML(cand.name)}</div>
            <span style="font-size: 0.65rem; font-weight: 700; color: ${atsColor}; background: ${atsBg}; padding: 1px 6px; border-radius: 4px; border: 1px solid ${atsColor}40; display: inline-flex; align-items: center; gap: 2px;" title="ATS Resume Match Score based on Job Description">
              <i data-lucide="sparkles" style="width: 10px; height: 10px;"></i> ${atsScore}% ATS
            </span>
          </div>
          <div class="candidate-card-meta">
            <i data-lucide="mail" style="width: 10px; height: 10px;"></i>
            <span>${escapeHTML(cand.email || 'No Email')}</span>
          </div>
          <div class="candidate-card-meta">
            <i data-lucide="phone" style="width: 10px; height: 10px;"></i>
            <span>${escapeHTML(cand.phone || 'No Phone')}</span>
          </div>
          <div class="candidate-card-meta" style="margin-top: 0.2rem; font-size: 0.65rem; color: var(--accent-blue); display: flex; align-items: center; gap: 0.25rem;">
            <i data-lucide="calendar" style="width: 10px; height: 10px;"></i>
            <span>Applied: ${formatLeadTimestamp(cand.createdDate)}</span>
          </div>
          
          ${infoHtml}
          
          <div class="candidate-card-actions">
            <span style="font-size: 0.65rem; color: var(--text-muted);">HR: ${escapeHTML(cand.assignedRecruiter || 'Unassigned')}</span>
            <div style="display: flex; gap: 0.35rem;">
              <button class="kanban-card-btn" title="Edit Candidate" onclick="event.stopPropagation(); openCandidateModal('${cand.id}')">
                <i data-lucide="edit-3" style="width: 10px; height: 10px;"></i>
              </button>
              <button class="kanban-card-btn" style="color: #F87171;" title="Delete Candidate" onclick="event.stopPropagation(); deleteCandidate('${cand.id}')">
                <i data-lucide="trash-2" style="width: 10px; height: 10px;"></i>
              </button>
            </div>
          </div>
        </div>
      `;
    });
    
    const colEl = document.createElement('div');
    colEl.className = 'recruitment-kanban-column';
    colEl.id = `recruitment-col-${col}`;
    colEl.setAttribute('ondragover', 'allowDrop(event)');
    colEl.setAttribute('ondragleave', 'dragLeave(event)');
    colEl.setAttribute('ondrop', `dropCandidateCard(event, '${col}')`);
    
    colEl.innerHTML = `
      <div class="recruitment-kanban-column-header">
        <span style="display: flex; align-items: center; gap: 0.35rem;">
          <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: ${columnColors[col]};"></span>
          <span>${columnLabels[col]}</span>
        </span>
        <span class="kanban-count-badge" style="background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px; font-size: 0.75rem;">${colCandidates.length}</span>
      </div>
      <div style="flex-grow: 1; display: flex; flex-direction: column; gap: 0.75rem;">
        ${cardsHtml || '<div style="text-align: center; padding: 1.5rem; color: var(--text-muted); font-size: 0.7rem; border: 1px dashed rgba(255,255,255,0.03); border-radius: 6px;">Empty</div>'}
      </div>
    `;
    board.appendChild(colEl);
  });
  lucide.createIcons();
}

function dragStartCandidateCard(e, candidateId) {
  e.dataTransfer.setData('text/plain', candidateId);
  e.currentTarget.classList.add('dragging');
}

function dragEndCandidateCard(e) {
  e.currentTarget.classList.remove('dragging');
}

async function dropCandidateCard(e, targetStatus) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const candId = e.dataTransfer.getData('text/plain');
  
  const cand = recruitmentCandidates.find(c => c.id === candId);
  if (cand && cand.status !== targetStatus) {
    const originalStatus = cand.status;
    
    // 1. Optimistic UI update instantly
    cand.status = targetStatus;
    updateRecruitmentKPIs();
    renderCandidatePipeline();
    
    showAppNotification('Saving...', `Moving ${cand.name} to ${targetStatus}...`, 'info');
    
    try {
      const res = await fetch(`${API_BASE}/api/candidates/${candId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          jobId: cand.jobId,
          name: cand.name,
          email: cand.email,
          phone: cand.phone,
          status: targetStatus,
          details: cand.details,
          assignedRecruiter: cand.assignedRecruiter
        })
      });
      if (!res.ok) {
        throw new Error('Database write rejected');
      }
      showAppNotification('Stage Updated', `Moved ${cand.name} to ${targetStatus}`, 'success');
      
      // Auto open Schedule Interview & Block Calendars modal if moved to interviewing stage!
      if (targetStatus === 'interviewing') {
        setTimeout(() => {
          sendInterviewInvite('', cand.id);
        }, 300);
      }

      // Sync candidates cache in background without blocking screen
      await fetchAllRecruitmentCandidates();
      updateRecruitmentKPIs();
      renderCandidatePipeline();
    } catch(err) {
      // Revert optimistic changes
      cand.status = originalStatus;
      updateRecruitmentKPIs();
      renderCandidatePipeline();
      showAppNotification('Sync Failed', `Could not persist change: ${err.message}`, 'danger');
    }
  }
}

// Populate candidate client selection dropdown
function populateCandidateClientDropdown() {
  const clientSelect = document.getElementById('candClientSelect');
  if (!clientSelect) return;

  const prevVal = clientSelect.value;
  let html = '<option value="">-- All Clients --</option>';

  const clientMap = new Map();

  // 1. Add clients from leads
  if (typeof leads !== 'undefined' && Array.isArray(leads)) {
    leads.forEach(l => {
      const compName = (l.company || l.name || '').trim();
      if (compName) {
        const key = compName.toLowerCase();
        if (!clientMap.has(key)) {
          clientMap.set(key, { id: l.id || compName, displayName: compName });
        }
      }
    });
  }

  // 2. Add clients from recruitmentJobs
  if (typeof recruitmentJobs !== 'undefined' && Array.isArray(recruitmentJobs)) {
    recruitmentJobs.forEach(j => {
      const compName = getJobClientDisplayName(j);
      if (compName && compName.toLowerCase() !== 'internal client') {
        const key = compName.toLowerCase();
        if (!clientMap.has(key)) {
          clientMap.set(key, { id: j.clientId || compName, displayName: compName });
        }
      }
    });
  }

  const sortedClients = Array.from(clientMap.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
  
  sortedClients.forEach(c => {
    html += `<option value="${escapeHTML(c.id)}">${escapeHTML(c.displayName)}</option>`;
  });

  clientSelect.innerHTML = html;
  if (prevVal && [...clientSelect.options].some(o => o.value === prevVal)) {
    clientSelect.value = prevVal;
  }
}

// Handle change on candidate modal client select to dynamically filter jobs
function onCandClientSelectChange(selectedJobIdToPreserve = null) {
  const clientSelect = document.getElementById('candClientSelect');
  const jobSelect = document.getElementById('candJobSelect');
  if (!jobSelect) return;

  const selectedClientVal = clientSelect ? clientSelect.value : '';
  const selectedClientOptText = (clientSelect && clientSelect.selectedIndex >= 0) ? clientSelect.options[clientSelect.selectedIndex].text.trim() : '';

  let filteredJobs = recruitmentJobs;

  if (selectedClientVal && selectedClientVal !== 'all') {
    const matchedLead = typeof leads !== 'undefined' ? leads.find(l => String(l.id) === String(selectedClientVal)) : null;
    const leadCompName = matchedLead ? (matchedLead.company || matchedLead.name || '').trim().toLowerCase() : '';
    const targetCompName = selectedClientOptText.toLowerCase();

    filteredJobs = recruitmentJobs.filter(j => {
      // Direct ID match
      if (j.clientId && String(j.clientId) === String(selectedClientVal)) return true;
      if (j.client_id && String(j.client_id) === String(selectedClientVal)) return true;

      // Company name match
      const jobClientName = getJobClientDisplayName(j).toLowerCase();
      if (jobClientName && jobClientName !== 'internal client') {
        if (jobClientName === targetCompName || (leadCompName && jobClientName === leadCompName)) return true;
      }

      if (j.company && j.company.trim().toLowerCase() === targetCompName) return true;
      if (j.client_name && j.client_name.trim().toLowerCase() === targetCompName) return true;

      return false;
    });
  }

  let jobHtml = '<option value="">-- Save in Talent Pool Only --</option>';
  if (filteredJobs.length > 0) {
    filteredJobs.forEach(job => {
      const clientSuffix = (!selectedClientVal || selectedClientVal === 'all') ? ` [${getJobClientDisplayName(job)}]` : '';
      jobHtml += `<option value="${escapeHTML(job.id)}">${escapeHTML(job.title)} (${escapeHTML(job.department || 'General')})${escapeHTML(clientSuffix)}</option>`;
    });
  } else if (selectedClientVal && selectedClientVal !== 'all') {
    jobHtml += `<option value="" disabled>No active job posts for this client</option>`;
  }

  jobSelect.innerHTML = jobHtml;

  if (selectedJobIdToPreserve) {
    if ([...jobSelect.options].some(o => String(o.value) === String(selectedJobIdToPreserve))) {
      jobSelect.value = selectedJobIdToPreserve;
    }
  }
}

async function openCandidateModal(candId = '') {
  document.getElementById('candidateForm').reset();
  document.getElementById('candidateId').value = '';
  if (document.getElementById('candInterviewDate')) {
    document.getElementById('candInterviewDate').value = '';
  }
  document.getElementById('candidateModalTitle').innerHTML = `<i data-lucide="user-plus" style="color: var(--accent-blue); width: 22px; height: 22px;"></i> Add Candidate`;
  
  populateCandidateClientDropdown();

  const activePlan = (companyInfo && companyInfo.plan) || (currentUser && currentUser.plan) || 'Free';
  const isPaid = activePlan.toLowerCase() !== 'free';
  const candResume = document.getElementById('candResume');
  const candResumeStatus = document.getElementById('candResumeUploadStatus');
  
  if (candResume && candResumeStatus) {
    candResume.value = '';
    candResumeStatus.innerHTML = '';
    if (isPaid) {
      candResume.disabled = false;
    } else {
      candResume.disabled = true;
      candResumeStatus.innerHTML = '<span style="color: #F87171;">Resume upload is disabled on the Free tier. Upgrade plan to enable.</span>';
    }

    candResume.onchange = () => {
      // Cleared status line as requested
      if (!candResume.files || !candResume.files[0]) {
        candResumeStatus.innerHTML = '';
      }
    };
  }
  
  if (candId) {
    try {
      showGlobalLoading("Loading candidate profile...");
      const res = await fetch(`${API_BASE}/api/candidates/${candId}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to retrieve candidate profile");
      const cand = await res.json();
      
      document.getElementById('candidateId').value = cand.id;
      document.getElementById('candName').value = cand.name;
      document.getElementById('candEmail').value = cand.email || '';
      document.getElementById('candPhone').value = cand.phone || '';
      document.getElementById('candRecruiter').value = cand.assignedRecruiter || '';
      document.getElementById('candStatus').value = cand.status || 'applied';

      // Auto-select candidate's client and job
      let targetJobId = cand.jobId || '';
      let targetClientVal = '';
      if (targetJobId) {
        const candJob = recruitmentJobs.find(j => String(j.id) === String(targetJobId));
        if (candJob) {
          const clientSelect = document.getElementById('candClientSelect');
          const jobClientName = getJobClientDisplayName(candJob);
          if (clientSelect) {
            const matchingOpt = Array.from(clientSelect.options).find(opt => {
              if (!opt.value) return false;
              if (candJob.clientId && String(opt.value) === String(candJob.clientId)) return true;
              if (candJob.client_id && String(opt.value) === String(candJob.client_id)) return true;
              return opt.text.trim().toLowerCase() === jobClientName.toLowerCase();
            });
            if (matchingOpt) {
              targetClientVal = matchingOpt.value;
            }
          }
        }
      }

      const clientSelect = document.getElementById('candClientSelect');
      if (clientSelect) clientSelect.value = targetClientVal;
      onCandClientSelectChange(targetJobId);
      
      if (cand.details) {
        try {
          const parsed = typeof cand.details === 'string' ? JSON.parse(cand.details) : cand.details;
          document.getElementById('candCurrentCtc').value = parsed.current_ctc || '';
          document.getElementById('candExpectedCtc').value = parsed.expected_ctc || '';
          document.getElementById('candNoticePeriod').value = parsed.notice_period || '';
          document.getElementById('candSkills').value = parsed.skills || '';
          document.getElementById('candNotes').value = parsed.notes || '';
          if (document.getElementById('candInterviewDate')) {
            document.getElementById('candInterviewDate').value = parsed.interview_date || '';
          }
          
          if (parsed.resume_name && parsed.resume_base64 && candResumeStatus) {
            const isUrl = parsed.resume_base64.startsWith('http://') || parsed.resume_base64.startsWith('https://');
            const isDataUri = parsed.resume_base64.startsWith('data:');
            if (isUrl || isDataUri) {
              candResumeStatus.innerHTML = `
                <span style="color: #34D399;">Current resume: </span>
                <a href="${parsed.resume_base64}" download="${parsed.resume_name}" target="_blank" style="color: var(--accent-blue); text-decoration: underline; font-weight: 500; cursor: pointer;">${escapeHTML(parsed.resume_name)}</a>
              `;
            } else {
              candResumeStatus.innerHTML = `
                <span style="color: #F87171; font-weight: 500;">Existing resume stored as plain filename (${escapeHTML(parsed.resume_name)}). Please click Choose File to re-upload PDF.</span>
              `;
            }
          }
        } catch(e) {}
      }
      document.getElementById('candidateModalTitle').innerHTML = `<i data-lucide="user-cog" style="color: var(--accent-blue); width: 22px; height: 22px;"></i> Edit Candidate Details`;
    } catch(err) {
      showAppNotification('Error', err.message, 'danger');
    } finally {
      hideGlobalLoading();
    }
  } else {
    let targetJobId = '';
    let targetClientVal = '';
    if (selectedJobId && selectedJobId !== 'all' && selectedJobId !== 'database') {
      targetJobId = selectedJobId;
      const candJob = recruitmentJobs.find(j => String(j.id) === String(targetJobId));
      if (candJob) {
        const clientSelect = document.getElementById('candClientSelect');
        const jobClientName = getJobClientDisplayName(candJob);
        if (clientSelect) {
          const matchingOpt = Array.from(clientSelect.options).find(opt => {
            if (!opt.value) return false;
            if (candJob.clientId && String(opt.value) === String(candJob.clientId)) return true;
            if (candJob.client_id && String(opt.value) === String(candJob.client_id)) return true;
            return opt.text.trim().toLowerCase() === jobClientName.toLowerCase();
          });
          if (matchingOpt) {
            targetClientVal = matchingOpt.value;
          }
        }
      }
    }
    const clientSelect = document.getElementById('candClientSelect');
    if (clientSelect) clientSelect.value = targetClientVal;
    onCandClientSelectChange(targetJobId);
  }
  const candidateModalOverlay = document.getElementById('candidateModalOverlay');
  if (candidateModalOverlay) {
    candidateModalOverlay.classList.add('active');
  }
  lucide.createIcons();
}

function closeCandidateModal() {
  const candidateModalOverlay = document.getElementById('candidateModalOverlay');
  if (candidateModalOverlay) {
    candidateModalOverlay.classList.remove('active');
  }
}

async function handleCandidateSubmit(e) {
  e.preventDefault();
  
  const submitBtn = e.target ? e.target.querySelector('button[type="submit"]') : null;
  let originalBtnHtml = '';
  if (submitBtn) {
    originalBtnHtml = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i data-lucide="loader-2" style="width: 14px; height: 14px; animation: spin 1s linear infinite; margin-right: 4px; vertical-align: middle;"></i> Saving Profile...`;
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }

  showGlobalLoading("Saving candidate profile & uploading document...");

  try {
    const id = document.getElementById('candidateId').value;
    const name = document.getElementById('candName').value.trim();
    const email = document.getElementById('candEmail').value.trim();
    const phone = document.getElementById('candPhone').value.trim();
    const assigned_recruiter = document.getElementById('candRecruiter').value;
    const status = document.getElementById('candStatus').value;
    
    const current_ctc = document.getElementById('candCurrentCtc').value.trim();
    const expected_ctc = document.getElementById('candExpectedCtc').value.trim();
    const notice_period = document.getElementById('candNoticePeriod').value.trim();
    const skills = document.getElementById('candSkills').value.trim();
    const experience = document.getElementById('candExperience') ? document.getElementById('candExperience').value.trim() : '';
    const location = document.getElementById('candLocation') ? document.getElementById('candLocation').value.trim() : '';
    const saveToTalentDb = document.getElementById('candSaveToTalentDb') ? document.getElementById('candSaveToTalentDb').checked : true;
    const notes = document.getElementById('candNotes') ? document.getElementById('candNotes').value.trim() : '';
    const interview_date = document.getElementById('candInterviewDate') ? document.getElementById('candInterviewDate').value : '';
    
    if (!name) {
      showAppNotification('Validation Error', 'Candidate name is required.', 'warning');
      return;
    }
    
    if (phone) {
      const cleanP = phone.replace(/[^0-9+]/g, '');
      if (cleanP.length < 10 || cleanP.length > 15) {
        showAppNotification('Validation Error', 'Phone number must be between 10 and 15 digits.', 'warning');
        return;
      }
    }
    
    let resumeBase64 = null;
    let resumeName = null;
    
    let existingCandidate = null;
    let existingDetails = null;
    if (id) {
      existingCandidate = recruitmentCandidates.find(c => c.id === id);
      if (existingCandidate && existingCandidate.details) {
        try {
          existingDetails = typeof existingCandidate.details === 'string' ? JSON.parse(existingCandidate.details) : existingCandidate.details;
        } catch(e) {}
      }
    }

    const resumeFile = document.getElementById('candResume') ? document.getElementById('candResume').files[0] : null;
    if (resumeFile) {
      try {
        const storageRes = await fetch(`${API_BASE}/api/tenant/storage-status`, { headers: getAuthHeaders() });
        if (storageRes.ok) {
          const storageData = await storageRes.json();
          let existingSize = 0;
          if (existingDetails && existingDetails.resume_base64) {
            existingSize = existingDetails.resume_base64.length;
          }
          if (storageData.usedBytes - existingSize + resumeFile.size > storageData.limitBytes) {
            showAppNotification('Storage Full', 'Your storage quota is exhausted. Please contact NeoGenCode Super Admin center at info@neogencode.com to upgrade.', 'danger');
            return;
          }
        }
      } catch(err) {
        console.warn("Storage check failed:", err);
      }

      try {
        resumeBase64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = (e) => reject(e);
          reader.readAsDataURL(resumeFile);
        });
        resumeName = resumeFile.name;
      } catch(err) {
        showAppNotification('Error', 'Failed to read resume file.', 'warning');
        return;
      }
    } else if (existingDetails && existingDetails.resume_base64) {
      const isUrl = existingDetails.resume_base64.startsWith('http://') || existingDetails.resume_base64.startsWith('https://');
      const isDataUri = existingDetails.resume_base64.startsWith('data:');
      if (isUrl || isDataUri) {
        resumeBase64 = existingDetails.resume_base64;
        resumeName = existingDetails.resume_name;
      }
    }
    
    const summaryObj = { 
      current_ctc, 
      expected_ctc, 
      notice_period, 
      skills, 
      experience,
      location,
      saveToTalentDb,
      notes,
      interview_date,
      resume_base64: resumeBase64,
      resume_name: resumeName
    };
    const payload = {
      jobId: document.getElementById('candJobSelect') ? document.getElementById('candJobSelect').value : '',
      name,
      email,
      phone,
      assignedRecruiter: assigned_recruiter,
      status,
      details: JSON.stringify(summaryObj)
    };
    
    const url = id ? `${API_BASE}/api/candidates/${id}` : `${API_BASE}/api/candidates`;
    const method = id ? 'PUT' : 'POST';
    
    const res = await fetch(url, {
      method,
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to save candidate');
    }
    
    const resData = await res.json();
    if (resData && resData.storageTelemetry) {
      const provider = resData.storageTelemetry.storageProvider || 'Storage';
      const reason = resData.storageTelemetry.storageReason || '';
      console.log(`Resume Upload Telemetry [${provider}]: ${reason}`);
    }

    showAppNotification('Success', 'Candidate details saved successfully.', 'success');
    closeCandidateModal();
    if (activeTab === 'my-clients') {
      await fetchAllRecruitmentCandidates();
      renderClientsKanban();
    } else {
      await fetchAndRenderRecruitment();
    }
  } catch (err) {
    showAppNotification('Error', err.message, 'danger');
  } finally {
    hideGlobalLoading();
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHtml;
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    }
  }
}

function deleteCandidate(candId) {
  showAppConfirm(
    "Confirm Deletion",
    "Are you sure you want to delete this candidate? This action cannot be undone.",
    async () => {
      try {
        showGlobalLoading("Removing candidate record...");
        const res = await fetch(`${API_BASE}/api/candidates/${candId}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to delete candidate');
        }
        
        showAppNotification('Deleted', 'Candidate record removed.', 'warning');
        if (activeTab === 'my-clients') {
          await fetchAllRecruitmentCandidates();
          renderClientsKanban();
        } else {
          await fetchAndRenderRecruitment();
        }
      } catch (err) {
        showAppNotification('Error', err.message, 'danger');
      } finally {
        hideGlobalLoading();
      }
    }
  );
}

// ----------------------------------------------------
// CLIENT ENGAGEMENT CENTER & PIPELINE
// ----------------------------------------------------
const CLIENT_STAGES = ['permanent', 'requirement', 'agreement', 'sourcing', 'invoice', 'completed'];
const CLIENT_STAGE_LABELS = {
  'permanent': 'Permanent Clients',
  'requirement': 'Requirement Received',
  'agreement': 'Agreement Signed',
  'sourcing': 'Sourcing Candidates',
  'invoice': 'Invoice Raised',
  'completed': 'Completed'
};

let selectedClientLeadId = null;
let activeExpandedJobRequirementId = null;

function selectClientLead(clientId) {
  selectedClientLeadId = clientId;
  activeExpandedJobRequirementId = null;
  renderClientsKanban();
}

function toggleRequirementExpand(jobId) {
  if (activeExpandedJobRequirementId === jobId) {
    activeExpandedJobRequirementId = null;
  } else {
    activeExpandedJobRequirementId = jobId;
  }
  renderClientsKanban();
}

async function updateClientStageDetails(clientId, updates) {
  const client = leads.find(l => l.id === clientId);
  if (!client) return;
  
  let currentStageObj = {
    completed: {
      requirement: false,
      agreement: false,
      sourcing: false,
      sharing: false,
      followup: false,
      interview: false,
      selection: false,
      invoice_raised: false,
      invoice_clearance: false,
      completed: false
    },
    sharingDetails: { candidateIds: [] },
    interviewDetails: { candidateIds: [], interviewDates: {}, meetLinks: {} },
    selectionDetails: { candidateIds: [], joiningDates: {}, packages: {} }
  };
  
  try {
    if (client.clientStage) {
      const parsed = JSON.parse(client.clientStage);
      if (parsed) {
        if (parsed.completed) currentStageObj.completed = { ...currentStageObj.completed, ...parsed.completed };
        if (parsed.sharingDetails) currentStageObj.sharingDetails = { ...currentStageObj.sharingDetails, ...parsed.sharingDetails };
        if (parsed.interviewDetails) currentStageObj.interviewDetails = { ...currentStageObj.interviewDetails, ...parsed.interviewDetails };
        if (parsed.selectionDetails) currentStageObj.selectionDetails = { ...currentStageObj.selectionDetails, ...parsed.selectionDetails };
      }
    }
  } catch(e) {
    // Migration fallback
    const legacyStage = client.clientStage || 'requirement';
    const oldStagesList = ['requirement', 'agreement', 'sourcing', 'invoice', 'completed'];
    const mapping = {
      'requirement': 'requirement',
      'agreement': 'agreement',
      'sourcing': 'sourcing',
      'invoice': 'invoice_raised',
      'completed': 'completed'
    };
    const curIdx = oldStagesList.indexOf(legacyStage);
    oldStagesList.forEach((st, idx) => {
      if (idx <= curIdx && mapping[st]) {
        currentStageObj.completed[mapping[st]] = true;
      }
    });
  }
  
  if (updates.completed) {
    currentStageObj.completed = { ...currentStageObj.completed, ...updates.completed };
  }
  if (updates.sharingDetails) {
    currentStageObj.sharingDetails = { ...currentStageObj.sharingDetails, ...updates.sharingDetails };
  }
  if (updates.interviewDetails) {
    currentStageObj.interviewDetails = { ...currentStageObj.interviewDetails, ...updates.interviewDetails };
  }
  if (updates.selectionDetails) {
    currentStageObj.selectionDetails = { ...currentStageObj.selectionDetails, ...updates.selectionDetails };
  }
  
  const serializedStage = JSON.stringify(currentStageObj);
  
  try {
    showGlobalLoading("Updating client details...");
    const payload = {
      ...client,
      clientStage: serializedStage
    };
    
    const res = await fetch(`${API_BASE}/api/leads/${clientId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to update details");
    }
    
    client.clientStage = serializedStage;
    renderClientsKanban();
  } catch(err) {
    showAppNotification('Error', err.message, 'danger');
  } finally {
    hideGlobalLoading();
  }
}

async function toggleClientStageCompleted(clientId, stageKey, completedVal) {
  const completed = {};
  completed[stageKey] = completedVal;
  await updateClientStageDetails(clientId, { completed });
  showAppNotification('Success', `Checklist updated successfully.`, 'success');
}

async function toggleSharedCandidate(clientId, candidateId, isChecked) {
  const client = leads.find(l => l.id === clientId);
  if (!client) return;
  
  let sharingDetails = { candidateIds: [] };
  try {
    if (client.clientStage) {
      const parsed = JSON.parse(client.clientStage);
      if (parsed && parsed.sharingDetails) sharingDetails = parsed.sharingDetails;
    }
  } catch(e) {}
  
  if (!sharingDetails.candidateIds) sharingDetails.candidateIds = [];
  
  if (isChecked) {
    if (!sharingDetails.candidateIds.includes(candidateId)) {
      sharingDetails.candidateIds.push(candidateId);
    }
  } else {
    sharingDetails.candidateIds = sharingDetails.candidateIds.filter(id => id !== candidateId);
  }
  
  await updateClientStageDetails(clientId, { sharingDetails });
}

async function toggleInterviewCandidate(clientId, candidateId, isChecked) {
  const client = leads.find(l => l.id === clientId);
  if (!client) return;
  
  let interviewDetails = { candidateIds: [], interviewDates: {}, meetLinks: {} };
  try {
    if (client.clientStage) {
      const parsed = JSON.parse(client.clientStage);
      if (parsed && parsed.interviewDetails) interviewDetails = parsed.interviewDetails;
    }
  } catch(e) {}
  
  if (!interviewDetails.candidateIds) interviewDetails.candidateIds = [];
  
  if (isChecked) {
    if (!interviewDetails.candidateIds.includes(candidateId)) {
      interviewDetails.candidateIds.push(candidateId);
    }
  } else {
    interviewDetails.candidateIds = interviewDetails.candidateIds.filter(id => id !== candidateId);
  }
  
  await updateClientStageDetails(clientId, { interviewDetails });
}

async function updateInterviewDateAndMeetLink(clientId, candidateId, dateStr, meetUrl) {
  const client = leads.find(l => String(l.id) === String(clientId));
  if (!client) return;

  let clientStageObj = {};
  try {
    if (client.clientStage) {
      clientStageObj = JSON.parse(client.clientStage);
    }
  } catch(e) {}

  if (!clientStageObj.interviewDetails) clientStageObj.interviewDetails = {};
  if (!clientStageObj.interviewDetails.interviewDates) clientStageObj.interviewDetails.interviewDates = {};
  if (!clientStageObj.interviewDetails.meetLinks) clientStageObj.interviewDetails.meetLinks = {};

  if (dateStr) clientStageObj.interviewDetails.interviewDates[candidateId] = dateStr;
  if (meetUrl) clientStageObj.interviewDetails.meetLinks[candidateId] = meetUrl;

  client.clientStage = JSON.stringify(clientStageObj);

  try {
    await fetch(`${API_BASE}/api/leads/${client.id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(client)
    });
  } catch(e) {
    console.error("Failed to persist interview date and meet link:", e);
  }
}

async function updateInterviewCandidateMeetLink(clientId, candidateId, meetLink) {
  const client = leads.find(l => l.id === clientId);
  if (!client) return;
  
  let interviewDetails = { meetLinks: {} };
  try {
    if (client.clientStage) {
      const parsed = JSON.parse(client.clientStage);
      if (parsed && parsed.interviewDetails) interviewDetails = parsed.interviewDetails;
    }
  } catch(e) {}
  
  if (!interviewDetails.meetLinks) interviewDetails.meetLinks = {};
  interviewDetails.meetLinks[candidateId] = meetLink;
  
  await updateClientStageDetails(clientId, { interviewDetails });
}

async function toggleSelectedCandidate(clientId, candidateId, isChecked) {
  const client = leads.find(l => l.id === clientId);
  if (!client) return;
  
  let selectionDetails = { candidateIds: [], joiningDates: {}, packages: {} };
  try {
    if (client.clientStage) {
      const parsed = JSON.parse(client.clientStage);
      if (parsed && parsed.selectionDetails) selectionDetails = parsed.selectionDetails;
    }
  } catch(e) {}
  
  if (!selectionDetails.candidateIds) selectionDetails.candidateIds = [];
  
  if (isChecked) {
    if (!selectionDetails.candidateIds.includes(candidateId)) {
      selectionDetails.candidateIds.push(candidateId);
    }
  } else {
    selectionDetails.candidateIds = selectionDetails.candidateIds.filter(id => id !== candidateId);
  }
  
  await updateClientStageDetails(clientId, { selectionDetails });
}

async function updateSelectedCandidateJoiningDate(clientId, candidateId, date) {
  const client = leads.find(l => l.id === clientId);
  if (!client) return;
  
  let selectionDetails = { joiningDates: {} };
  try {
    if (client.clientStage) {
      const parsed = JSON.parse(client.clientStage);
      if (parsed && parsed.selectionDetails) selectionDetails = parsed.selectionDetails;
    }
  } catch(e) {}
  
  if (!selectionDetails.joiningDates) selectionDetails.joiningDates = {};
  selectionDetails.joiningDates[candidateId] = date;
  
  await updateClientStageDetails(clientId, { selectionDetails });
}

async function updateSelectedCandidatePackage(clientId, candidateId, pkg) {
  const client = leads.find(l => l.id === clientId);
  if (!client) return;
  
  let selectionDetails = { packages: {} };
  try {
    if (client.clientStage) {
      const parsed = JSON.parse(client.clientStage);
      if (parsed && parsed.selectionDetails) selectionDetails = parsed.selectionDetails;
    }
  } catch(e) {}
  
  if (!selectionDetails.packages) selectionDetails.packages = {};
  selectionDetails.packages[candidateId] = pkg;
  
  await updateClientStageDetails(clientId, { selectionDetails });
}

async function connectGoogleMeetAPI(clientId, candId) {
  const client = leads.find(l => l.id === clientId);
  const cand = recruitmentCandidates.find(c => c.id === candId);
  if (!cand) return;

  let clientStageObj = {};
  try { clientStageObj = JSON.parse(client.clientStage); } catch(e) {}
  const interviewDetails = clientStageObj.interviewDetails || {};
  const storedDateVal = (interviewDetails.interviewDates || {})[candId] || '';

  let dVal = '';
  let tVal = '10:00';
  if (storedDateVal && storedDateVal.includes(' at ')) {
    const parts = storedDateVal.split(' at ');
    dVal = parts[0];
    tVal = parts[1];
  } else {
    dVal = storedDateVal;
  }

  // If date is not scheduled yet, ask the recruiter to schedule it first
  if (!dVal) {
    sendInterviewInvite(clientId, candId);
    showAppNotification("Schedule First", "Please select a date and time for the interview first.", "warning");
    return;
  }

  // Open Google Calendar in new tab pre-filled with interview details
  const userEmail = currentUser ? currentUser.email : 'recruiter@example.com';
  const title = `Interview: ${cand.name} x ${client.company || 'Our Client'}`;
  const details = `Google Meet Interview scheduled via NeoGenCode CRM for ${cand.name}.`;
  
  openGoogleCalendarInNewTab(
    title,
    dVal,
    tVal,
    '',
    cand.email || 'candidate@example.com',
    [userEmail],
    details
  );
}

async function sendInterviewInvite(clientId = '', candId = '') {
  let cand = recruitmentCandidates.find(c => c.id === candId || c.id === clientId);
  if (!cand && candId) cand = recruitmentCandidates.find(c => c.id === candId);
  if (!cand && clientId) cand = recruitmentCandidates.find(c => c.id === clientId);
  if (!cand) return;

  candId = cand.id;

  // Find job associated with candidate
  let job = recruitmentJobs.find(j => String(j.id) === String(cand.jobId));

  // Find client associated with job or lead
  let client = leads.find(l => l.id === clientId || (job && String(l.id) === String(job.clientId)));
  if (!client && leads.length > 0) {
    client = leads.find(l => l.status === 'won' || l.status === 'Working with them (won)') || leads[0];
  }
  if (!client) {
    client = { id: 'client-default', company: 'Company Client' };
  }
  clientId = client.id;
  
  let clientStageObj = {};
  try { clientStageObj = JSON.parse(client.clientStage); } catch(e) {}
  const interviewDetails = clientStageObj.interviewDetails || {};
  let currentMeetUrl = (interviewDetails.meetLinks || {})[candId] || '';
  const storedDateVal = (interviewDetails.interviewDates || {})[candId] || '';
  
  // Split stored date and time if existing
  let defaultDate = '';
  let defaultTime = '10:00';
  if (storedDateVal && storedDateVal.includes(' at ')) {
    const parts = storedDateVal.split(' at ');
    defaultDate = parts[0];
    defaultTime = parts[1];
  } else {
    defaultDate = storedDateVal;
  }
  
  // Collect default email list (current user email + team members)
  let emailsList = [currentUser.email];
  if (agents && agents.length > 0) {
    agents.forEach(agent => {
      if (agent.email && agent.email !== currentUser.email) {
        emailsList.push(agent.email);
      }
    });
  }
  
  emailsList = [...new Set(emailsList)];
  
  const overlayId = 'interviewScheduleModalOverlay';
  let modalOverlay = document.getElementById(overlayId);
  if (!modalOverlay) {
    modalOverlay = document.createElement('div');
    modalOverlay.id = overlayId;
    modalOverlay.className = 'modal-overlay';
    modalOverlay.style.zIndex = '99999';
    modalOverlay.style.display = 'none';
    modalOverlay.style.alignItems = 'center';
    modalOverlay.style.justifyContent = 'center';
    modalOverlay.style.position = 'fixed';
    modalOverlay.style.top = '0';
    modalOverlay.style.left = '0';
    modalOverlay.style.width = '100%';
    modalOverlay.style.height = '100%';
    modalOverlay.style.background = 'rgba(0,0,0,0.6)';
    document.body.appendChild(modalOverlay);
  }
  
  const renderEmailsCheckboxList = () => {
    let html = '';
    emailsList.forEach((email, idx) => {
      const isYou = email === currentUser.email;
      const deleteBtn = !isYou ? '<button type="button" onclick="window.removeInterviewInviteEmail(' + idx + ')" style="background: none; border: none; color: #EF4444; cursor: pointer; padding: 2px; display: inline-flex; align-items: center;"><i data-lucide="trash-2" style="width: 12px; height: 12px;"></i></button>' : '';
      
      html += '<div style="display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.02); padding: 0.4rem 0.6rem; border-radius: 6px; border: 1px solid var(--border-color); font-size: 0.76rem; color: var(--text-primary); margin-bottom: 0.25rem;">' +
        '<div style="display: flex; align-items: center; gap: 0.4rem;">' +
          '<input type="checkbox" id="inv-email-' + idx + '" checked style="cursor: pointer;">' +
          '<label for="inv-email-' + idx + '" style="cursor: pointer; margin: 0;">' + escapeHTML(email) + (isYou ? ' <span style="color: var(--accent-blue); font-size: 0.65rem;">(You)</span>' : '') + '</label>' +
        '</div>' +
        deleteBtn +
      '</div>';
    });
    return html;
  };
  
  window.removeInterviewInviteEmail = (idx) => {
    emailsList.splice(idx, 1);
    updateModalContent();
  };
  
  window.addInterviewInviteEmail = () => {
    const newEmail = document.getElementById('newInterviewerEmail').value.trim();
    if (!newEmail) return;
    if (!newEmail.includes('@')) {
      showAppNotification("Invalid Email", "Please enter a valid email address.", "warning");
      return;
    }
    if (emailsList.includes(newEmail)) {
      showAppNotification("Duplicate", "Email is already in the list.", "warning");
      return;
    }
    emailsList.push(newEmail);
    updateModalContent();
  };

  window.updateModalDraftText = () => {
    const dVal = document.getElementById('interviewModalDate') ? document.getElementById('interviewModalDate').value || 'Not scheduled yet' : defaultDate;
    const tVal = document.getElementById('interviewModalTime') ? document.getElementById('interviewModalTime').value || '10:00' : defaultTime;
    const meetVal = document.getElementById('interviewModalMeetLink') ? document.getElementById('interviewModalMeetLink').value.trim() : currentMeetUrl;
    const txtArea = document.getElementById('interviewEmailBodyText');
    if (txtArea) {
      txtArea.value = `Hi ${cand.name},\n\nYou have been scheduled for an interview with ${client.company || 'our client'} on ${dVal} at ${tVal}.\n\nGoogle Meet Link: ${meetVal || 'Will be shared shortly'}\n\nBest regards,\nHR Team`;
    }
  };

  window.openGoogleCalendarTabOnly = () => {
    const dVal = document.getElementById('interviewModalDate').value;
    const tVal = document.getElementById('interviewModalTime').value;
    const meetVal = document.getElementById('interviewModalMeetLink') ? document.getElementById('interviewModalMeetLink').value.trim() : '';

    if (!dVal) {
      showAppNotification("Validation Error", "Please select an interview date.", "warning");
      return;
    }

    const selectedEmails = [];
    emailsList.forEach((email, idx) => {
      const chk = document.getElementById(`inv-email-${idx}`);
      if (chk && chk.checked) {
        selectedEmails.push(email);
      }
    });

    const title = `Interview: ${cand.name} x ${client.company || 'Our Client'}`;
    const desc = document.getElementById('interviewEmailBodyText') ? document.getElementById('interviewEmailBodyText').value : '';

    openGoogleCalendarInNewTab(
      title,
      dVal,
      tVal,
      meetVal,
      cand.email || 'candidate@example.com',
      selectedEmails,
      desc
    );

    const notice = document.getElementById('gcalOpenedNotice');
    if (notice) notice.style.display = 'block';

    showAppNotification("Google Calendar Opened", "Google Calendar opened in a new tab. Copy the Google Meet link from Calendar and paste it into the field above.", "info");
  };

  window.saveInterviewAndClose = async () => {
    const dVal = document.getElementById('interviewModalDate').value;
    const tVal = document.getElementById('interviewModalTime').value;
    const meetVal = document.getElementById('interviewModalMeetLink') ? document.getElementById('interviewModalMeetLink').value.trim() : '';

    if (!dVal) {
      showAppNotification("Validation Error", "Please select an interview date.", "warning");
      return;
    }

    showGlobalLoading("Saving interview schedule & Google Meet URL...");
    await updateInterviewDateAndMeetLink(clientId, candId, `${dVal} at ${tVal}`, meetVal);
    hideGlobalLoading();

    showAppNotification("Interview Saved", `Scheduled interview saved for ${cand.name}.`, "success");
    modalOverlay.style.display = 'none';
    modalOverlay.classList.remove('active');
    renderClientsKanban();
    renderUpcomingInterviews();
    renderCandidatePipeline();
  };

  window.submitInterviewInvitation = async () => {
    const selectedEmails = [];
    emailsList.forEach((email, idx) => {
      const chk = document.getElementById(`inv-email-${idx}`);
      if (chk && chk.checked) {
        selectedEmails.push(email);
      }
    });
    
    if (selectedEmails.length === 0) {
      showAppNotification("Validation Error", "Please select at least one sender email address.", "warning");
      return;
    }

    const dVal = document.getElementById('interviewModalDate').value;
    const tVal = document.getElementById('interviewModalTime').value;
    if (!dVal) {
      showAppNotification("Validation Error", "Please select an interview date.", "warning");
      return;
    }

    const executeSubmission = async () => {
      const blockCalendars = document.getElementById('blockCalendarsCheckbox').checked;
      const finalDateTime = `${dVal} at ${tVal}`;
      const accessToken = localStorage.getItem('google_access_token');
      
      showGlobalLoading("Sending interview invitations & blocking calendars...");
      await updateInterviewDate(clientId, candId, finalDateTime);

      if (blockCalendars && accessToken) {
        let startIso = new Date().toISOString();
        let endIso = new Date(Date.now() + 60*60*1000).toISOString();
        try {
          const dateObj = new Date(`${dVal}T${tVal}:00`);
          if (!isNaN(dateObj.getTime())) {
            startIso = dateObj.toISOString();
            endIso = new Date(dateObj.getTime() + 60*60*1000).toISOString();
          }
        } catch(e) {}

        const attendees = [{ email: cand.email || 'candidate@example.com' }];
        selectedEmails.forEach(email => {
          attendees.push({ email });
        });

        const eventPayload = {
          summary: `Interview: ${cand.name} x ${client.company || 'Our Client'}`,
          description: `Google Meet Link: ${meetLink || 'Will be shared'}`,
          start: { dateTime: startIso },
          end: { dateTime: endIso },
          attendees: attendees
        };

        try {
          const calRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(eventPayload)
          });
          if (!calRes.ok) {
            console.error("Calendar block call failed:", await calRes.text());
          }
        } catch(err) {
          console.error("Failed to call Google Calendar API event create:", err);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
      hideGlobalLoading();
      
      let successMsg = `Interview invite successfully sent to ${escapeHTML(cand.name)} (${escapeHTML(cand.email || 'candidate@example.com')}).\n\nGoogle Meet: ${meetLink || 'Not connected'}`;
      if (blockCalendars) {
        successMsg += `\n\nGoogle Calendar blocked for:\n${selectedEmails.map(e => `- ${e}`).join('\n')}\n\nCreated under Google Account: ${connectedGoogleAccount}`;
      }
      
      showAppAlert("Invitation Sent", successMsg);
      modalOverlay.style.display = 'none';
      modalOverlay.classList.remove('active');
      renderClientsKanban();
    };

    if (!connectedGoogleAccount) {
      triggerGoogleAuthFlow((email) => {
        executeSubmission();
      });
    } else {
      executeSubmission();
    }
  };
  
  const updateModalContent = () => {
    const emailBodyText = `Hi ${cand.name},\n\nYou have been scheduled for an interview with ${client.company || 'our client'} on ${defaultDate || 'Not scheduled yet'} at ${defaultTime}.\n\nGoogle Meet Link: ${currentMeetUrl || 'Will be shared shortly'}\n\nBest regards,\nHR Team`;

    modalOverlay.innerHTML = `
      <div class="settings-card" style="width: 550px; max-width: 95%; max-height: 90vh; display: flex; flex-direction: column; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 12px; padding: 1.5rem; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); z-index: 100000; box-sizing: border-box;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem; margin-bottom: 1rem; flex-shrink: 0;">
          <h3 style="font-size: 1rem; font-weight: 700; color: var(--text-primary); margin: 0; display: flex; align-items: center; gap: 0.5rem; font-family: 'Outfit';">
            <i data-lucide="calendar-plus" style="color: var(--accent-purple); width: 20px; height: 20px;"></i> Schedule Interview & Block Calendars
          </h3>
          <button onclick="document.getElementById('${overlayId}').style.display='none'; document.getElementById('${overlayId}').classList.remove('active');" style="background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 4px;">
            <i data-lucide="x" style="width: 18px; height: 18px;"></i>
          </button>
        </div>
        
        <div style="flex-grow: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 1rem; padding-right: 0.3rem;">
          <!-- Target Candidate -->
          <div>
            <span style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 0.25rem;">Candidate Recipient</span>
            <div style="font-size: 0.82rem; color: var(--text-primary); font-weight: 700;">${escapeHTML(cand.name)} (${escapeHTML(cand.email || 'No email registered')})</div>
          </div>

          <!-- Date & Time of Interview -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
            <div>
              <span style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 0.25rem;">Interview Date</span>
              <input type="date" id="interviewModalDate" class="form-control" style="font-size: 0.75rem; height: 32px; background: var(--bg-primary);" value="${defaultDate}" onchange="window.updateModalDraftText()">
            </div>
            <div>
              <span style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 0.25rem;">Interview Time</span>
              <input type="time" id="interviewModalTime" class="form-control" style="font-size: 0.75rem; height: 32px; background: var(--bg-primary);" value="${defaultTime}" onchange="window.updateModalDraftText()">
            </div>
          </div>

          <!-- Google Meet Link -->
          <div>
            <span style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 0.25rem;">Google Meet URL (Paste Real Meeting Link)</span>
            <input type="url" id="interviewModalMeetLink" class="form-control" style="font-size: 0.75rem; height: 32px; background: var(--bg-primary); font-weight: 600; color: #34D399;" value="${currentMeetUrl}" placeholder="Paste Google Meet link (e.g. https://meet.google.com/abc-defg-hij)" onchange="window.updateModalDraftText()">
          </div>

          <!-- Calendar Opened Info Notice -->
          <div id="gcalOpenedNotice" style="display: none; background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.25); padding: 0.65rem 0.85rem; border-radius: 8px; font-size: 0.75rem; color: var(--accent-blue);">
            <i data-lucide="info" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 4px;"></i>
            Google Calendar opened in a new tab. Once created, copy the Google Meet link from Calendar and paste it in the box above, then click <strong>Save Interview & Close</strong>.
          </div>
          
          <!-- Sender & Interviewers (Block Calendar list) -->
          <div>
            <span style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 0.5rem;">Sender & Interviewer Email List (Calendars will be blocked)</span>
            <div style="display: flex; flex-direction: column; gap: 0.1rem; max-height: 120px; overflow-y: auto; margin-bottom: 0.5rem; padding-right: 0.2rem;">
              ${renderEmailsCheckboxList()}
            </div>
            
            <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
              <input type="email" id="newInterviewerEmail" placeholder="Add co-interviewer email" class="form-control" style="font-size: 0.75rem; height: 32px; flex-grow: 1; background: var(--bg-primary);">
              <button type="button" onclick="window.addInterviewInviteEmail()" class="btn-secondary" style="font-size: 0.72rem; height: 32px; padding: 0 0.75rem; border-radius: 6px;">
                Add
              </button>
            </div>
          </div>
          
          <!-- Calendar Booking Option -->
          <div style="display: flex; align-items: center; gap: 0.5rem; background: rgba(245, 158, 11, 0.05); padding: 0.6rem; border-radius: 6px; border: 1px solid rgba(245, 158, 11, 0.2);">
            <input type="checkbox" id="blockCalendarsCheckbox" checked style="cursor: pointer;">
            <label for="blockCalendarsCheckbox" style="font-size: 0.76rem; color: #F59E0B; margin: 0; cursor: pointer; display: flex; align-items: center; gap: 0.35rem;">
              <i data-lucide="clock" style="width: 14px; height: 14px;"></i> Block Google Calendar slots for checked interviewers
            </label>
          </div>
          
          <!-- Email body -->
          <div>
            <span style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 0.35rem;">Email Content Invitation Draft</span>
            <textarea id="interviewEmailBodyText" class="form-control" style="font-size: 0.75rem; min-height: 90px; line-height: 1.4; background: var(--bg-primary);">${escapeHTML(emailBodyText)}</textarea>
          </div>
        </div>
        
        <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; border-top: 1px solid var(--border-color); padding-top: 0.85rem; flex-shrink: 0; flex-wrap: wrap;">
          <button onclick="document.getElementById('${overlayId}').style.display='none'; document.getElementById('${overlayId}').classList.remove('active');" class="btn-secondary" style="font-size: 0.8rem; padding: 0.45rem 0.85rem;">Cancel</button>
          
          <button onclick="window.openGoogleCalendarTabOnly()" class="btn-secondary" style="font-size: 0.8rem; padding: 0.45rem 0.85rem; border-color: #4285F4; color: #4285F4; display: inline-flex; align-items: center; gap: 0.35rem;">
            <img src="https://upload.wikimedia.org/wikipedia/commons/a/a5/Google_Calendar_icon_%282020%29.svg" style="width: 14px; height: 14px;" /> Open Google Calendar
          </button>

          <button onclick="window.saveInterviewAndClose()" class="btn-primary" style="font-size: 0.8rem; padding: 0.45rem 1rem; background: var(--accent-purple); border-color: var(--accent-purple); display: inline-flex; align-items: center; gap: 0.35rem;">
            <i data-lucide="check-circle-2" style="width: 14px; height: 14px;"></i> Save Interview & Close
          </button>
        </div>
      </div>
    `;
    lucide.createIcons();
  };
  
  updateModalContent();
  modalOverlay.style.display = 'flex';
  modalOverlay.classList.add('active');
}

function openAddCandidateForClient(clientId) {
  openLeadModal();
  const leadTypeSelect = document.getElementById('leadTypeSelect');
  if (leadTypeSelect) {
    leadTypeSelect.value = 'candidate';
    handleLeadTypeChange();
  }
  const client = leads.find(l => l.id === clientId);
  if (client) {
    const clientJobs = recruitmentJobs.filter(j => String(j.clientId) === String(client.id));
    const jobSelect = document.getElementById('leadCandidateJobSelect');
    if (jobSelect && clientJobs.length > 0) {
      jobSelect.value = clientJobs[0].id;
    } else if (jobSelect) {
      jobSelect.value = 'database';
    }
  }
}

function deleteClientLeadPrompt(id) {
  const userPerms = (currentUser && currentUser.permissions) ? (typeof currentUser.permissions === 'string' ? JSON.parse(currentUser.permissions) : currentUser.permissions) : {};
  const isCEO = currentUser && currentUser.ceoEmail && currentUser.email.toLowerCase() === currentUser.ceoEmail.toLowerCase();
  const isSuperAdmin = currentUser && currentUser.role === 'Super Admin';
  const isAdmin = currentUser && (currentUser.role === 'Manager' || currentUser.role === 'Admin');
  const canDeleteClient = isSuperAdmin || isCEO || isAdmin || userPerms.deleteClientLead === true;
  
  if (!canDeleteClient) {
    showAppAlert("Access Denied", "You do not have permission to delete client leads. Only administrators or authorized managers can perform this action.");
    return;
  }
  
  showAppConfirm(
    "Confirm Deletion",
    "Are you sure you want to delete this client lead? This action cannot be undone.",
    async () => {
      try {
        showGlobalLoading("Deleting client lead...");
        const res = await fetch(`${API_BASE}/api/leads/${id}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to delete client lead");
        }
        showAppNotification('Deleted', 'Client lead successfully deleted.', 'warning');
        selectedClientLeadId = null;
        activeExpandedJobRequirementId = null;
        await initRemoteDatabase();
      } catch(err) {
        showAppNotification('Error', err.message, 'danger');
      } finally {
        hideGlobalLoading();
      }
    }
  );
}

function deleteClientInvoice(invoiceId) {
  showAppConfirm(
    "Confirm Deletion",
    "Are you sure you want to delete this invoice? This action cannot be undone.",
    async () => {
      try {
        showGlobalLoading("Deleting invoice...");
        const res = await fetch(`${API_BASE}/api/invoices/${invoiceId}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to delete invoice");
        }
        showAppNotification('Deleted', 'Invoice deleted successfully.', 'warning');
        invoices = invoices.filter(inv => inv.id !== invoiceId);
        renderClientsKanban();
      } catch(err) {
        showAppNotification('Error', err.message, 'danger');
      } finally {
        hideGlobalLoading();
      }
    }
  );
}

async function toggleClientInvoiceStatus(invoiceId, currentStatus) {
  const nextStatus = currentStatus === 'Paid' ? 'Unpaid' : 'Paid';
  try {
    showGlobalLoading("Updating invoice status...");
    const res = await fetch(`${API_BASE}/api/invoices/${invoiceId}/status`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ status: nextStatus })
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to update invoice status");
    }
    showAppNotification('Invoice Updated', `Invoice status set to ${nextStatus}.`, 'success');
    const inv = invoices.find(i => i.id === invoiceId);
    if (inv) inv.status = nextStatus;
    renderClientsKanban();
  } catch(err) {
    showAppNotification('Error', err.message, 'danger');
  } finally {
    hideGlobalLoading();
  }
}

function openInvoiceModalForClientLead(clientName, clientEmail) {
  switchTab('billing');
  setTimeout(() => {
    openInvoiceModal();
    const nameEl = document.getElementById('invClientName');
    const emailEl = document.getElementById('invClientEmail');
    if (nameEl) nameEl.value = clientName;
    if (emailEl) emailEl.value = clientEmail || '';
  }, 150);
}

function openJobModalForClientLead(clientId) {
  openJobModal();
  const select = document.getElementById('jobClient');
  if (select) {
    select.value = clientId;
  }
}

function filterClientList() {
  renderClientsKanban();
}

function renderClientsKanban() {
  const listContainer = document.getElementById('myClientsList');
  const detailPane = document.getElementById('myClientDetailPane');
  if (!listContainer || !detailPane) return;
  
  const targetTenantId = currentUser.role === 'Super Admin' ? activeTenantId : currentUser.tenantId;
  const clientLeads = leads.filter(l => l.status === 'won' && (targetTenantId === 'all' || l.tenantId === targetTenantId));
  
  const checkClientNotifications = (client) => {
    let stagesCompleted = {
      requirement: false,
      agreement: false,
      sourcing: false,
      sharing: false,
      followup: false,
      interview: false,
      selection: false,
      invoice_raised: false,
      invoice_clearance: false,
      completed: false
    };
    try {
      if (client.clientStage) {
        const parsed = JSON.parse(client.clientStage);
        if (parsed && parsed.completed) {
          stagesCompleted = { ...stagesCompleted, ...parsed.completed };
        }
      }
    } catch(e) {
      const legacyStage = client.clientStage || 'requirement';
      const oldStagesList = ['requirement', 'agreement', 'sourcing', 'invoice', 'completed'];
      const mapping = {
        'requirement': 'requirement',
        'agreement': 'agreement',
        'sourcing': 'sourcing',
        'invoice': 'invoice_raised',
        'completed': 'completed'
      };
      const curIdx = oldStagesList.indexOf(legacyStage);
      oldStagesList.forEach((st, idx) => {
        if (idx <= curIdx && mapping[st]) {
          stagesCompleted[mapping[st]] = true;
        }
      });
    }

    if (stagesCompleted.completed) {
      return [];
    }

    const reasons = [];
    if (!stagesCompleted.requirement) reasons.push("Requirement received is pending");
    if (!stagesCompleted.agreement) reasons.push("Agreement signed is pending");
    if (!stagesCompleted.sourcing) reasons.push("Sourcing candidates is pending");
    if (!stagesCompleted.sharing) reasons.push("Sharing profile with client is pending");
    if (!stagesCompleted.followup) reasons.push("Taking update of shared profiles is pending");
    if (!stagesCompleted.interview) reasons.push("Interview scheduled is pending");
    if (!stagesCompleted.selection) reasons.push("Candidate selection is pending");
    if (!stagesCompleted.invoice_raised) reasons.push("Invoice raised is pending");
    if (!stagesCompleted.invoice_clearance) reasons.push("Invoice clearance is pending");

    return reasons;
  };
  
  const clientSearchQuery = document.getElementById('clientSearchInput') ? document.getElementById('clientSearchInput').value.toLowerCase().trim() : '';
  const clientFilterType = document.getElementById('clientFilterTypeSelect') ? document.getElementById('clientFilterTypeSelect').value : 'all';
  const clientSort = document.getElementById('clientSortSelect') ? document.getElementById('clientSortSelect').value : 'alert_first';

  let filteredClients = clientLeads.filter(client => {
    if (clientSearchQuery) {
      const nameMatch = (client.name || '').toLowerCase().includes(clientSearchQuery);
      const companyMatch = (client.organization || client.company || '').toLowerCase().includes(clientSearchQuery);
      const emailMatch = (client.email || '').toLowerCase().includes(clientSearchQuery);
      const phoneMatch = (client.phone || '').toLowerCase().includes(clientSearchQuery);
      const desigMatch = (client.designation || '').toLowerCase().includes(clientSearchQuery);
      const summaryMatch = (client.summary || '').toLowerCase().includes(clientSearchQuery);
      if (!nameMatch && !companyMatch && !emailMatch && !phoneMatch && !desigMatch && !summaryMatch) return false;
    }
    if (clientFilterType === 'permanent') {
      if (client.isPermanent !== 1) return false;
    } else if (clientFilterType === 'alert') {
      const reasons = checkClientNotifications(client);
      if (reasons.length === 0) return false;
    } else if (clientFilterType === 'completed') {
      const reasons = checkClientNotifications(client);
      if (reasons.length > 0) return false;
    }
    return true;
  });

  filteredClients.sort((a, b) => {
    if (clientSort === 'alert_first') {
      const aReasons = checkClientNotifications(a);
      const bReasons = checkClientNotifications(b);
      const aHas = aReasons.length > 0 ? 1 : 0;
      const bHas = bReasons.length > 0 ? 1 : 0;
      return bHas - aHas;
    } else if (clientSort === 'name_asc') {
      return (a.name || '').localeCompare(b.name || '');
    } else if (clientSort === 'name_desc') {
      return (b.name || '').localeCompare(a.name || '');
    } else if (clientSort === 'date_desc') {
      return new Date(b.createdDate || 0) - new Date(a.createdDate || 0);
    } else if (clientSort === 'date_asc') {
      return new Date(a.createdDate || 0) - new Date(b.createdDate || 0);
    }
    return 0;
  });

  const sortedClients = filteredClients;
  
  if (!selectedClientLeadId && sortedClients.length > 0) {
    selectedClientLeadId = sortedClients[0].id;
  }
  
  // 1. Render Left Clients List
  listContainer.innerHTML = '';
  if (sortedClients.length === 0) {
    listContainer.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--text-muted); font-size: 0.82rem; border: 1px dashed var(--border-color); border-radius: 8px;">No won clients found. Mark won leads to see them here!</div>`;
  } else {
    sortedClients.forEach(client => {
      const isSelected = selectedClientLeadId === client.id;
      const reasons = checkClientNotifications(client);
      const isGlowing = reasons.length > 0;
      
      const card = document.createElement('div');
      card.className = `job-card ${isSelected ? 'active' : ''}`;
      card.onclick = () => selectClientLead(client.id);
      
      if (isGlowing) {
        card.style.boxShadow = '0 0 10px rgba(168, 85, 247, 0.4)';
        card.style.borderLeft = '3px solid var(--accent-purple)';
      } else if (client.isPermanent === 1) {
        card.style.borderLeft = '3px solid #10B981';
      } else {
        card.style.borderLeft = '3px solid var(--accent-blue)';
      }
      
      let badgeHtml = '';
      if (client.isPermanent === 1) {
        badgeHtml += `<span class="file-format-badge" style="background: rgba(16, 185, 129, 0.1); color: #10B981; font-weight: 700; font-size: 0.65rem;">Permanent</span>`;
      }
      reasons.forEach(r => {
        badgeHtml += `<span class="file-format-badge" style="background: rgba(239, 68, 68, 0.1); color: #EF4444; font-weight: 700; font-size: 0.65rem;">${r}</span>`;
      });
      
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: start; width: 100%;">
          <div>
            <h4 style="font-size: 0.88rem; font-weight: 700; color: var(--text-primary); font-family: 'Outfit'; margin: 0 0 0.25rem 0;">${escapeHTML(client.name)}</h4>
            <span style="font-size: 0.72rem; color: var(--text-secondary); display: block; margin-bottom: 0.25rem;">${escapeHTML(client.company || 'Direct Client')}</span>
          </div>
          <button onclick="event.stopPropagation(); deleteClientLeadPrompt('${client.id}')" class="outreach-action-btn" title="Delete Client" style="color: #EF4444; border-color: rgba(239, 68, 68, 0.15); background: rgba(239, 68, 68, 0.02); padding: 4px;">
            <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i>
          </button>
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.5rem; width: 100%;">
          ${badgeHtml}
        </div>
      `;
      listContainer.appendChild(card);
    });
  }
  
  // 2. Render Right Details Pane
  const selectedClient = leads.find(l => l.id === selectedClientLeadId);
  if (!selectedClient) {
    detailPane.innerHTML = `
      <div style="text-align: center; padding: 5rem 3rem; color: var(--text-muted); font-size: 0.85rem; border: 1px dashed var(--border-color); border-radius: 12px; background: rgba(255,255,255,0.01);">
        <i data-lucide="handshake" style="width: 32px; height: 32px; color: var(--text-muted); margin-bottom: 0.75rem;"></i>
        <div>Select a client from the left directory to display their requirements, candidate profiles, agreements, and billing information.</div>
      </div>
    `;
  } else {
    const reasons = checkClientNotifications(selectedClient);
    const clientJobs = recruitmentJobs.filter(j => String(j.clientId) === String(selectedClient.id));
    const clientInvoices = invoices.filter(inv => 
      (inv.clientEmail && inv.clientEmail === selectedClient.email) || 
      (inv.clientName && inv.clientName.toLowerCase() === selectedClient.name.toLowerCase())
    );
    
    // Parse stages completed JSON
    let stagesCompleted = {
      requirement: false,
      agreement: false,
      sourcing: false,
      sharing: false,
      followup: false,
      interview: false,
      selection: false,
      invoice_raised: false,
      invoice_clearance: false,
      completed: false
    };
    let sharingDetails = { candidateIds: [] };
    let interviewDetails = { candidateIds: [], interviewDates: {}, meetLinks: {} };
    let selectionDetails = { candidateIds: [], joiningDates: {}, packages: {} };
    
    try {
      if (selectedClient.clientStage) {
        const parsed = JSON.parse(selectedClient.clientStage);
        if (parsed) {
          if (parsed.completed) stagesCompleted = { ...stagesCompleted, ...parsed.completed };
          if (parsed.sharingDetails) sharingDetails = { ...sharingDetails, ...parsed.sharingDetails };
          if (parsed.interviewDetails) interviewDetails = { ...interviewDetails, ...parsed.interviewDetails };
          if (parsed.selectionDetails) selectionDetails = { ...selectionDetails, ...parsed.selectionDetails };
        }
      }
    } catch(e) {
      // Legacy fallback
      const legacyStage = selectedClient.clientStage || 'requirement';
      const oldStagesList = ['requirement', 'agreement', 'sourcing', 'invoice', 'completed'];
      const mapping = {
        'requirement': 'requirement',
        'agreement': 'agreement',
        'sourcing': 'sourcing',
        'invoice': 'invoice_raised',
        'completed': 'completed'
      };
      const curIdx = oldStagesList.indexOf(legacyStage);
      oldStagesList.forEach((st, idx) => {
        if (idx <= curIdx && mapping[st]) {
          stagesCompleted[mapping[st]] = true;
        }
      });
    }

    const stagesDef = [
      { key: 'requirement', display: 'Requirement Received' },
      { key: 'agreement', display: 'Agreement Signed' },
      { key: 'sourcing', display: 'Sourcing Candidates' },
      { key: 'sharing', display: 'Shared Candidates with Client' },
      { key: 'followup', display: 'Taking Follow-up of Shared Profiles' },
      { key: 'interview', display: 'Interview Scheduled' },
      { key: 'selection', display: 'Selected Candidates' },
      { key: 'invoice_raised', display: 'Invoice Raised' },
      { key: 'invoice_clearance', display: 'Invoice Clearance' },
      { key: 'completed', display: 'Completed' }
    ];

    let checklistHtml = `
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 0.75rem; margin-top: 0.75rem; margin-bottom: 1.25rem;">
    `;
    stagesDef.forEach(stage => {
      const isDone = stagesCompleted[stage.key] === true;
      const color = isDone ? '#10B981' : 'var(--text-muted)';
      const icon = isDone ? 'check-square' : 'square';
      
      checklistHtml += `
        <div onclick="toggleClientStageCompleted('${selectedClient.id}', '${stage.key}', ${!isDone})" 
             style="display: flex; align-items: center; gap: 0.5rem; background: rgba(255,255,255,0.01); border: 1px solid var(--border-color); border-radius: 8px; padding: 0.55rem 0.75rem; cursor: pointer; transition: all 0.2s ease-out; user-select: none;"
             onmouseover="this.style.background='rgba(255,255,255,0.03)'"
             onmouseout="this.style.background='rgba(255,255,255,0.01)'">
          <i data-lucide="${icon}" style="width: 15px; height: 15px; color: ${color}; min-width: 15px;"></i>
          <span style="font-size: 0.74rem; font-weight: 500; color: ${isDone ? 'var(--text-primary)' : 'var(--text-secondary)'};">${stage.display}</span>
        </div>
      `;
    });
    checklistHtml += `</div>`;

    // Filter candidate list for interview / selection dropdowns
    const clientCands = recruitmentCandidates.filter(c => clientJobs.some(job => String(job.id) === String(c.jobId)));

    const selectedSharingCount = (sharingDetails.candidateIds || []).length;
    const totalSharingCount = clientCands.length;
    const isSharingExpanded = clientAccordionStates.sharing !== false;
    
    let sharingPanel = '';
    if (stagesCompleted['sharing']) {
      sharingPanel = `
        <div class="settings-card" style="padding: 1.25rem; margin-bottom: 1.25rem; background: rgba(14, 165, 233, 0.01); border-color: rgba(14, 165, 233, 0.2);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
            <h4 onclick="toggleClientSection('sharing')" style="font-size: 0.82rem; font-weight: 700; color: var(--accent-blue); margin: 0; display: flex; align-items: center; gap: 0.35rem; font-family: 'Outfit'; text-transform: uppercase; letter-spacing: 0.05em; cursor: pointer; user-select: none;">
              <i data-lucide="${isSharingExpanded ? 'chevron-down' : 'chevron-right'}" style="width: 16px; height: 16px;"></i>
              <i data-lucide="share-2" style="width: 14px; height: 14px;"></i> 
              Select Shared Candidates 
              <span style="font-size: 0.72rem; color: var(--text-muted); text-transform: none; font-weight: 500; margin-left: 0.5rem;">(${selectedSharingCount} / ${totalSharingCount} Shared)</span>
            </h4>
            <div style="display: flex; gap: 0.5rem; align-items: center;">
              <button type="button" class="btn-primary" onclick="openAddCandidateForClient('${selectedClient.id}')" style="font-size: 0.72rem; padding: 0.35rem 0.65rem; border-radius: 6px; display: inline-flex; align-items: center; gap: 0.25rem;">
                <i data-lucide="plus-circle" style="width: 12px; height: 12px;"></i> Add Candidate
              </button>
            </div>
          </div>
          
          <div id="clientSharingListContainer" style="${isSharingExpanded ? 'display: block;' : 'display: none;'}">
            <p style="font-size: 0.72rem; color: var(--text-muted); margin-bottom: 0.75rem;">Check candidates to share them with this client:</p>
            <div style="max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.5rem; padding-right: 0.25rem;">
              ${clientCands.length === 0 ? `
                <div style="font-size: 0.75rem; color: var(--text-muted); text-align: center; padding: 1rem;">No candidates available for this client. Click "Add Candidate" above or assign them to this client's jobs.</div>
              ` : clientCands.map(cand => {
                const isShared = (sharingDetails.candidateIds || []).includes(cand.id);
                return `
                  <div class="client-cand-row" data-name="${escapeHTML(cand.name)}" style="display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.01); border: 1px solid var(--border-color); border-radius: 6px; padding: 0.5rem 0.75rem;">
                    <div style="display: flex; align-items: center; gap: 0.5rem; flex-grow: 1;">
                      <input type="checkbox" ${isShared ? 'checked' : ''} onchange="toggleSharedCandidate('${selectedClient.id}', '${cand.id}', this.checked)" style="cursor: pointer;">
                      <span onclick="openCandidateModal('${cand.id}')" style="font-size: 0.76rem; color: var(--text-primary); cursor: pointer; text-decoration: underline; text-underline-offset: 2px;" title="Click to view/edit candidate profile">${escapeHTML(cand.name)}</span>
                      <span style="font-size: 0.65rem; color: var(--text-muted);">(${escapeHTML(cand.status)})</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.35rem;">
                      <button type="button" onclick="openCandidateModal('${cand.id}')" class="outreach-action-btn" title="View/Edit Profile" style="color: var(--accent-blue); padding: 3px;">
                        <i data-lucide="edit-3" style="width: 11px; height: 11px;"></i>
                      </button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      `;
    }

    const selectedInterviewCount = (interviewDetails.candidateIds || []).length;
    const totalInterviewCount = clientCands.length;
    const isInterviewExpanded = clientAccordionStates.interview !== false;
    
    let interviewPanel = '';
    if (stagesCompleted['interview']) {
      interviewPanel = `
        <div class="settings-card" style="padding: 1.25rem; margin-bottom: 1.25rem; background: rgba(168, 85, 247, 0.01); border-color: rgba(168, 85, 247, 0.2);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
            <h4 onclick="toggleClientSection('interview')" style="font-size: 0.82rem; font-weight: 700; color: var(--accent-purple); margin: 0; display: flex; align-items: center; gap: 0.35rem; font-family: 'Outfit'; text-transform: uppercase; letter-spacing: 0.05em; cursor: pointer; user-select: none;">
              <i data-lucide="${isInterviewExpanded ? 'chevron-down' : 'chevron-right'}" style="width: 16px; height: 16px;"></i>
              <i data-lucide="calendar" style="width: 14px; height: 14px;"></i>
              Select Interview Candidates
              <span style="font-size: 0.72rem; color: var(--text-muted); text-transform: none; font-weight: 500; margin-left: 0.5rem;">(${selectedInterviewCount} / ${totalInterviewCount} Interviewing)</span>
            </h4>
            <div style="display: flex; gap: 0.5rem; align-items: center;">
              <button type="button" class="btn-primary" onclick="openAddCandidateForClient('${selectedClient.id}')" style="font-size: 0.72rem; padding: 0.35rem 0.65rem; border-radius: 6px; display: inline-flex; align-items: center; gap: 0.25rem;">
                <i data-lucide="plus-circle" style="width: 12px; height: 12px;"></i> Add Candidate
              </button>
            </div>
          </div>
          
          <div id="clientInterviewListContainer" style="${isInterviewExpanded ? 'display: block;' : 'display: none;'}">
            <p style="font-size: 0.72rem; color: var(--text-muted); margin-bottom: 0.75rem;">Check candidates scheduled for interview and manage invitations:</p>
            <div style="max-height: 250px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.5rem; padding-right: 0.25rem;">
              ${clientCands.length === 0 ? `
                <div style="font-size: 0.75rem; color: var(--text-muted); text-align: center; padding: 1rem;">No candidates available. Click "Add Candidate" above or assign candidates.</div>
              ` : clientCands.map(cand => {
                const isInterviewing = (interviewDetails.candidateIds || []).includes(cand.id);
                const intDate = (interviewDetails.interviewDates || {})[cand.id] || '';
                const meetLink = (interviewDetails.meetLinks || {})[cand.id] || '';
                
                return `
                  <div class="client-cand-row" data-name="${escapeHTML(cand.name)}" style="background: rgba(255,255,255,0.01); border: 1px solid var(--border-color); border-radius: 6px; padding: 0.65rem 0.75rem; display: flex; flex-direction: column; gap: 0.5rem;">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                      <div style="display: flex; align-items: center; gap: 0.5rem; flex-grow: 1;">
                        <input type="checkbox" ${isInterviewing ? 'checked' : ''} onchange="toggleInterviewCandidate('${selectedClient.id}', '${cand.id}', this.checked)" style="cursor: pointer;">
                        <span onclick="openCandidateModal('${cand.id}')" style="font-size: 0.76rem; color: var(--text-primary); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; font-weight: 700;" title="Click to view/edit candidate profile">${escapeHTML(cand.name)}</span>
                        <span style="font-size: 0.65rem; color: var(--text-muted);">(${escapeHTML(cand.status)})</span>
                      </div>
                      <div style="display: flex; align-items: center; gap: 0.35rem;">
                        <button type="button" onclick="openCandidateModal('${cand.id}')" class="outreach-action-btn" title="View/Edit Profile" style="color: var(--accent-blue); padding: 3px;">
                          <i data-lucide="edit-3" style="width: 11px; height: 11px;"></i>
                        </button>
                      </div>
                    </div>
                    ${isInterviewing ? `
                      <div style="border-top: 1px dashed var(--border-color); padding-top: 0.5rem; margin-top: 0.25rem; display: flex; flex-direction: column; gap: 0.5rem;">
                        <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.7rem; color: var(--text-secondary); flex-wrap: wrap;">
                          <span style="font-weight: 600;">Interview Date:</span>
                          <input type="date" value="${intDate}" onchange="updateInterviewDate('${selectedClient.id}', '${cand.id}', this.value)" class="form-control" style="font-size: 0.68rem; height: 26px; padding: 2px 4px; width: auto; background: var(--bg-primary);">
                        </div>
                        ${meetLink ? `
                          <div style="font-size: 0.7rem; display: flex; align-items: center; gap: 0.35rem; color: #10B981;">
                            <i data-lucide="video" style="width: 12px; height: 12px;"></i>
                            <span>Google Meet: <a href="${meetLink}" target="_blank" style="color: var(--accent-blue); text-decoration: underline;">${meetLink}</a></span>
                          </div>
                        ` : ''}
                        <div style="display: flex; gap: 0.5rem; margin-top: 0.25rem;">
                          <button type="button" onclick="connectGoogleMeetAPI('${selectedClient.id}', '${cand.id}')" class="btn-secondary" style="font-size: 0.68rem; height: 28px; padding: 0 0.5rem; border-radius: 4px; display: inline-flex; align-items: center; gap: 0.2rem; color: #4285F4; border-color: rgba(66, 133, 244, 0.2);">
                            <img src="https://upload.wikimedia.org/wikipedia/commons/a/a5/Google_Calendar_icon_%282020%29.svg" style="width: 12px; height: 12px;" /> Connect Meet
                          </button>
                          <button type="button" onclick="sendInterviewInvite('${selectedClient.id}', '${cand.id}')" class="btn-secondary" style="font-size: 0.68rem; height: 28px; padding: 0 0.5rem; border-radius: 4px; display: inline-flex; align-items: center; gap: 0.2rem;">
                            <i data-lucide="mail" style="width: 12px; height: 12px;"></i> Send Invite
                          </button>
                        </div>
                      </div>
                    ` : ''}
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      `;
    }

    const selectedSelectionCount = (selectionDetails.candidateIds || []).length;
    const totalSelectionCount = clientCands.length;
    const isSelectionExpanded = clientAccordionStates.selection !== false;
    
    let selectionPanel = '';
    if (stagesCompleted['selection']) {
      selectionPanel = `
        <div class="settings-card" style="padding: 1.25rem; margin-bottom: 1.25rem; background: rgba(16, 185, 129, 0.01); border-color: rgba(16, 185, 129, 0.2);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
            <h4 onclick="toggleClientSection('selection')" style="font-size: 0.82rem; font-weight: 700; color: #10B981; margin: 0; display: flex; align-items: center; gap: 0.35rem; font-family: 'Outfit'; text-transform: uppercase; letter-spacing: 0.05em; cursor: pointer; user-select: none;">
              <i data-lucide="${isSelectionExpanded ? 'chevron-down' : 'chevron-right'}" style="width: 16px; height: 16px;"></i>
              <i data-lucide="user-check" style="width: 14px; height: 14px;"></i>
              Select Hired/Selected Candidates
              <span style="font-size: 0.72rem; color: var(--text-muted); text-transform: none; font-weight: 500; margin-left: 0.5rem;">(${selectedSelectionCount} / ${totalSelectionCount} Hired)</span>
            </h4>
            <div style="display: flex; gap: 0.5rem; align-items: center;">
              <button type="button" class="btn-primary" onclick="openAddCandidateForClient('${selectedClient.id}')" style="font-size: 0.72rem; padding: 0.35rem 0.65rem; border-radius: 6px; display: inline-flex; align-items: center; gap: 0.25rem;">
                <i data-lucide="plus-circle" style="width: 12px; height: 12px;"></i> Add Candidate
              </button>
            </div>
          </div>
          
          <div id="clientSelectionListContainer" style="${isSelectionExpanded ? 'display: block;' : 'display: none;'}">
            <p style="font-size: 0.72rem; color: var(--text-muted); margin-bottom: 0.75rem;">Check candidates who have been selected/hired by this client:</p>
            <div style="max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.5rem; padding-right: 0.25rem;">
              ${clientCands.length === 0 ? `
                <div style="font-size: 0.75rem; color: var(--text-muted); text-align: center; padding: 1rem;">No candidates available. Click "Add Candidate" above or assign candidates.</div>
              ` : clientCands.map(cand => {
                const isSelected = (selectionDetails.candidateIds || []).includes(cand.id);
                const joinDate = (selectionDetails.joiningDates || {})[cand.id] || '';
                const pkg = (selectionDetails.packages || {})[cand.id] || '';
                
                return `
                  <div class="client-cand-row" data-name="${escapeHTML(cand.name)}" style="background: rgba(255,255,255,0.01); border: 1px solid var(--border-color); border-radius: 6px; padding: 0.65rem 0.75rem; display: flex; flex-direction: column; gap: 0.5rem;">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                      <div style="display: flex; align-items: center; gap: 0.5rem; flex-grow: 1;">
                        <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleSelectedCandidate('${selectedClient.id}', '${cand.id}', this.checked)" style="cursor: pointer;">
                        <span onclick="openCandidateModal('${cand.id}')" style="font-size: 0.76rem; color: var(--text-primary); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; font-weight: 700;" title="Click to view/edit candidate profile">${escapeHTML(cand.name)}</span>
                        <span style="font-size: 0.65rem; color: var(--text-muted);">(${escapeHTML(cand.status)})</span>
                      </div>
                      <div style="display: flex; align-items: center; gap: 0.35rem;">
                        <button type="button" onclick="openCandidateModal('${cand.id}')" class="outreach-action-btn" title="View/Edit Profile" style="color: var(--accent-blue); padding: 3px;">
                          <i data-lucide="edit-3" style="width: 11px; height: 11px;"></i>
                        </button>
                      </div>
                    </div>
                    ${isSelected ? `
                      <div style="display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; margin-top: 0.25rem; border-top: 1px dashed var(--border-color); padding-top: 0.5rem;">
                        <div style="display: flex; align-items: center; gap: 0.35rem; font-size: 0.7rem; color: var(--text-secondary);">
                          <span style="font-weight: 600;">Joining Date:</span>
                          <input type="date" value="${joinDate}" onchange="updateSelectedCandidateJoiningDate('${selectedClient.id}', '${cand.id}', this.value)" class="form-control" style="font-size: 0.68rem; height: 26px; padding: 2px 4px; width: auto; background: var(--bg-primary);">
                        </div>
                        <div style="display: flex; align-items: center; gap: 0.35rem; font-size: 0.7rem; color: var(--text-secondary);">
                          <span style="font-weight: 600;">Offer Package ($):</span>
                          <input type="text" value="${pkg}" placeholder="e.g. 15000" onchange="updateSelectedCandidatePackage('${selectedClient.id}', '${cand.id}', this.value)" class="form-control" style="font-size: 0.68rem; height: 26px; padding: 2px 4px; width: 100px; background: var(--bg-primary);">
                        </div>
                      </div>
                    ` : ''}
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      `;
    }

    let requirementsHtml = '';
    if (clientJobs.length === 0) {
      requirementsHtml = `<div style="text-align: center; padding: 1.5rem; color: var(--text-muted); font-size: 0.78rem; border: 1px dashed var(--border-color); border-radius: 6px; background: rgba(255,255,255,0.01);">No open job requirements.</div>`;
    } else {
      clientJobs.forEach(job => {
        const isExpanded = activeExpandedJobRequirementId === job.id;
        const jobCands = recruitmentCandidates.filter(c => String(c.jobId) === String(job.id));
        
        let candsListHtml = '';
        if (isExpanded) {
          if (jobCands.length === 0) {
            candsListHtml = `
              <div style="margin-top: 0.5rem; padding: 0.5rem; background: rgba(255,255,255,0.02); border-radius: 6px; border-left: 2px solid var(--border-color); font-size: 0.72rem; color: var(--text-muted);">
                No candidate profiles shared yet.
              </div>
            `;
          } else {
            candsListHtml = `
              <div style="margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.35rem; padding: 0.5rem; background: rgba(255,255,255,0.02); border-radius: 6px; border-left: 2px solid var(--accent-purple);">
                <div style="font-weight: 700; font-size: 0.68rem; color: var(--text-secondary); margin-bottom: 0.25rem; text-transform: uppercase;">Shared Candidate Profiles:</div>
                ${jobCands.map(cand => `
                  <div class="client-cand-row" data-name="${escapeHTML(cand.name)}" style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.01); padding: 0.35rem; border-radius: 4px; border: 1px solid rgba(255,255,255,0.03); font-size: 0.72rem;">
                    <div style="cursor: pointer; flex-grow: 1; display: flex; align-items: center; gap: 0.35rem;" onclick="event.stopPropagation(); openCandidateModal('${cand.id}')" title="Click to view/edit candidate profile">
                      <strong style="color: var(--text-primary); text-decoration: underline; text-underline-offset: 2px;">${escapeHTML(cand.name)}</strong>
                      <span style="font-size: 0.65rem; color: var(--text-muted);">(${escapeHTML(cand.assignedRecruiter || 'No Recruiter')})</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.4rem;">
                      <span class="file-format-badge" style="background: rgba(168, 85, 247, 0.08); color: var(--accent-purple); font-size: 0.6rem; padding: 2px 4px;">${cand.status.toUpperCase()}</span>
                      <button onclick="event.stopPropagation(); deleteCandidate('${cand.id}')" class="outreach-action-btn" title="Remove Profile" style="color: #EF4444; border-color: rgba(239, 68, 68, 0.15); background: rgba(239, 68, 68, 0.02); padding: 2px; width: 20px; height: 20px;">
                        <i data-lucide="trash-2" style="width: 10px; height: 10px;"></i>
                      </button>
                    </div>
                  </div>
                `).join('')}
              </div>
            `;
          }
        }
        
        requirementsHtml += `
          <div class="job-card" onclick="toggleRequirementExpand('${job.id}')" style="cursor: pointer; padding: 0.85rem; border: 1px solid ${isExpanded ? 'var(--accent-purple)' : 'var(--border-color)'}; background: ${isExpanded ? 'rgba(168,85,247,0.01)' : 'rgba(255,255,255,0.01)'}; position: relative; margin-bottom: 0.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <strong style="font-size: 0.8rem; color: var(--text-primary); display: block;">${escapeHTML(job.title)}</strong>
                <span style="font-size: 0.68rem; color: var(--text-muted);">${escapeHTML(job.department)} • ${escapeHTML(job.location || 'General')}</span>
              </div>
              <div style="display: flex; align-items: center; gap: 0.4rem;" onclick="event.stopPropagation()">
                <button onclick="openJobModal('${job.id}')" class="outreach-action-btn" title="Edit Job" style="color: var(--accent-blue); border-color: rgba(14, 165, 233, 0.15); background: rgba(14, 165, 233, 0.02); padding: 4px;">
                  <i data-lucide="edit-2" style="width: 11px; height: 11px;"></i>
                </button>
                <button onclick="deleteJob('${job.id}')" class="outreach-action-btn" title="Delete Job" style="color: #EF4444; border-color: rgba(239, 68, 68, 0.15); background: rgba(239, 68, 68, 0.02); padding: 4px;">
                  <i data-lucide="trash-2" style="width: 11px; height: 11px;"></i>
                </button>
              </div>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.5rem; font-size: 0.68rem; color: var(--text-secondary);">
              <span class="file-format-badge" style="background: rgba(14, 165, 233, 0.08); color: var(--accent-blue); font-size: 0.62rem;">${jobCands.length} Shared Profiles</span>
              <span style="display: flex; align-items: center; gap: 0.2rem;">
                <i data-lucide="${isExpanded ? 'chevron-up' : 'chevron-down'}" style="width: 12px; height: 12px; color: var(--text-muted);"></i>
                ${isExpanded ? 'Click to collapse' : 'Click to view candidates'}
              </span>
            </div>
            ${candsListHtml}
          </div>
        `;
      });
    }
    
    let invoicesHtml = '';
    if (clientInvoices.length === 0) {
      invoicesHtml = `<div style="text-align: center; padding: 1.5rem; color: var(--text-muted); font-size: 0.78rem; border: 1px dashed var(--border-color); border-radius: 6px; background: rgba(255,255,255,0.01);">No invoices generated.</div>`;
    } else {
      clientInvoices.forEach(inv => {
        const isPaid = inv.status === 'Paid';
        const color = isPaid ? '#34D399' : '#EF4444';
        const bg = isPaid ? 'rgba(52, 211, 153, 0.08)' : 'rgba(239, 68, 68, 0.08)';
        
        invoicesHtml += `
          <div style="padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 8px; background: rgba(255,255,255,0.01); display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <div>
              <strong style="font-size: 0.78rem; color: var(--text-primary); display: block;">${escapeHTML(inv.invoiceNumber)}</strong>
              <span style="font-size: 0.68rem; color: var(--text-muted);">Amt: $${Number(inv.amount).toLocaleString()} • Date: ${formatDateNice(inv.invoiceDate)}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 0.4rem;">
              <span onclick="toggleClientInvoiceStatus('${inv.id}', '${inv.status}')" class="file-format-badge" style="background: ${bg}; color: ${color}; font-weight: 700; font-size: 0.62rem; cursor: pointer; user-select: none;" title="Click to toggle Paid/Unpaid status">
                ${inv.status.toUpperCase()}
              </span>
              <button onclick="printInvoice('${inv.id}')" class="outreach-action-btn" title="Preview/Print Invoice" style="color: var(--accent-blue); border-color: rgba(14, 165, 233, 0.15); background: rgba(14, 165, 233, 0.02); padding: 4px;">
                <i data-lucide="eye" style="width: 11px; height: 11px;"></i>
              </button>
              <button onclick="deleteClientInvoice('${inv.id}')" class="outreach-action-btn" title="Delete Invoice" style="color: #EF4444; border-color: rgba(239, 68, 68, 0.15); background: rgba(239, 68, 68, 0.02); padding: 4px;">
                <i data-lucide="trash-2" style="width: 11px; height: 11px;"></i>
              </button>
            </div>
          </div>
        `;
      });
    }
    
    let alertBannerHtml = '';
    if (reasons.length > 0) {
      alertBannerHtml = `
        <div style="background: rgba(239, 68, 68, 0.04); border: 1px solid rgba(239, 68, 68, 0.15); border-radius: 8px; padding: 0.85rem 1rem; color: #EF4444; font-size: 0.82rem; margin-bottom: 1.25rem; font-weight: 500; display: flex; align-items: start; gap: 0.5rem; width: 100%;">
          <i data-lucide="alert-circle" style="width: 16px; height: 16px; margin-top: 1px; min-width: 16px;"></i>
          <div>
            <strong>Pending Stages Alert:</strong>
            <ul style="margin: 0.25rem 0 0 1.2rem; padding: 0; line-height: 1.3rem; text-align: left;">
              ${reasons.map(r => `<li>${escapeHTML(r)}</li>`).join('')}
            </ul>
          </div>
        </div>
      `;
    } else {
      alertBannerHtml = `
        <div style="background: rgba(52, 211, 153, 0.04); border: 1px solid rgba(52, 211, 153, 0.15); border-radius: 8px; padding: 0.85rem 1rem; color: #34D399; font-size: 0.82rem; margin-bottom: 1.25rem; font-weight: 500; display: flex; align-items: center; gap: 0.5rem; width: 100%;">
          <i data-lucide="check-circle" style="width: 16px; height: 16px; min-width: 16px;"></i>
          <span>All stages completed! Client relationship fully active and completed.</span>
        </div>
      `;
    }
    
    detailPane.innerHTML = `
      <div class="settings-card" style="padding: 1.5rem; margin-bottom: 1.25rem;">
        <div style="display: flex; justify-content: space-between; align-items: start; flex-wrap: wrap; gap: 0.75rem;">
          <div>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <h3 style="font-size: 1.15rem; font-weight: 800; color: var(--text-primary); font-family: 'Outfit'; margin: 0;">${escapeHTML(selectedClient.name)}</h3>
              ${selectedClient.isPermanent === 1 ? `<span class="file-format-badge" style="background: rgba(16, 185, 129, 0.1); color: #10B981; font-weight: 700; font-size: 0.65rem;">Permanent</span>` : ''}
            </div>
            <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0.25rem 0 0 0;">
              ${escapeHTML(selectedClient.company || 'Direct Client')} • ${escapeHTML(selectedClient.email || 'No email')} • ${escapeHTML(selectedClient.phone || 'No phone')}
            </p>
          </div>
          <div style="display: flex; gap: 0.5rem;">
            <button class="btn-secondary" style="padding: 0.4rem 0.75rem; font-size: 0.75rem; border-radius: 6px; display: inline-flex; align-items: center; gap: 0.25rem;" onclick="openLeadModal('${selectedClient.id}')">
              <i data-lucide="edit-3" style="width: 13px; height: 13px;"></i> Edit Details
            </button>
            <button class="btn-secondary" style="padding: 0.4rem 0.75rem; font-size: 0.75rem; border-radius: 6px; color: #EF4444; border-color: rgba(239, 68, 68, 0.2); background: rgba(239, 68, 68, 0.02); display: inline-flex; align-items: center; gap: 0.25rem;" onclick="deleteClientLeadPrompt('${selectedClient.id}')">
              <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i> Delete Client
            </button>
          </div>
        </div>
      </div>
      
      ${alertBannerHtml}
      
      <!-- Search candidates box -->
      <div class="settings-card" style="padding: 0.85rem 1rem; margin-bottom: 1.25rem; display: flex; align-items: center; gap: 0.5rem;">
        <i data-lucide="search" style="width: 14px; height: 14px; color: var(--text-muted);"></i>
        <input type="text" id="clientCandidateSearchInput" oninput="filterClientCandidates()" placeholder="Search candidates inside this project..." class="form-control" style="font-size: 0.75rem; height: 28px; padding: 0.25rem 0.5rem; flex: 1; background: var(--bg-primary);">
      </div>
      
      <div class="settings-card" style="padding: 1.25rem; margin-bottom: 1.25rem;">
        <h4 style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em; font-family: 'Outfit';">Client Agreement Checklist</h4>
        <p style="font-size: 0.72rem; color: var(--text-muted); margin-bottom: 0.5rem;">Mark each stage independently as they are completed. All stages must be checked to resolve alerts.</p>
        ${checklistHtml}
      </div>

      ${sharingPanel}
      ${interviewPanel}
      ${selectionPanel}
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem;">
        <div class="settings-card" style="padding: 1.25rem; display: flex; flex-direction: column;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">
            <h4 style="font-size: 0.82rem; font-weight: 700; color: var(--text-primary); margin: 0; display: flex; align-items: center; gap: 0.35rem;">
              <i data-lucide="briefcase" style="width: 14px; height: 14px; color: var(--accent-purple);"></i>
              Job Requirements
            </h4>
            <button onclick="openJobModalForClientLead('${selectedClient.id}')" class="btn-primary" style="padding: 0.3rem 0.6rem; font-size: 0.68rem; border-radius: 4px;">
              <i data-lucide="plus" style="width: 10px; height: 10px;"></i> Post Job
            </button>
          </div>
          <div style="flex-grow: 1; max-height: 400px; overflow-y: auto; padding-right: 0.2rem;">
            ${requirementsHtml}
          </div>
        </div>
        
        <div class="settings-card" style="padding: 1.25rem; display: flex; flex-direction: column;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">
            <h4 style="font-size: 0.82rem; font-weight: 700; color: var(--text-primary); margin: 0; display: flex; align-items: center; gap: 0.35rem;">
              <i data-lucide="receipt" style="width: 14px; height: 14px; color: var(--accent-blue);"></i>
              Billing & Invoices
            </h4>
            <button onclick="openInvoiceModalForClientLead('${escapeHTML(selectedClient.name)}', '${escapeHTML(selectedClient.email)}')" class="btn-primary" style="padding: 0.3rem 0.6rem; font-size: 0.68rem; border-radius: 4px;">
              <i data-lucide="plus" style="width: 10px; height: 10px;"></i> Raise Invoice
            </button>
          </div>
          <div style="flex-grow: 1; max-height: 250px; overflow-y: auto; padding-right: 0.2rem; margin-bottom: 0.75rem;">
            ${invoicesHtml}
          </div>
          
          <div style="border-top: 1px solid var(--border-color); padding-top: 0.75rem; margin-top: auto;">
            <div style="display: flex; align-items: center; gap: 0.35rem; font-size: 0.78rem; color: var(--text-secondary); margin-bottom: 0.25rem;">
              <i data-lucide="calendar" style="width: 12px; height: 12px; color: #FBBF24;"></i>
              <strong>Next Follow-up Reminder:</strong>
            </div>
            <span style="font-size: 0.75rem; color: var(--text-primary);">${selectedClient.nextFollowUp ? formatDateNice(selectedClient.nextFollowUp) : 'Not Scheduled'}</span>
          </div>
        </div>
      </div>
    `;
  }
  lucide.createIcons();
}

function dragStartClient(e, id) {}
async function dropClient(e, targetStage) {}

function populateJobClientsDropdown() {
  const select = document.getElementById('jobClient');
  if (!select) return;
  
  const prevVal = select.value;
  let html = '<option value="">-- No Associated Client --</option>';
  
  const clientMap = new Map();
  leads.forEach(l => {
    const compName = (l.company || l.name || '').trim();
    if (compName && !clientMap.has(compName.toLowerCase())) {
      clientMap.set(compName.toLowerCase(), { id: l.id, displayName: compName });
    }
  });
  recruitmentJobs.forEach(j => {
    const compName = (j.company || '').trim();
    if (compName && !clientMap.has(compName.toLowerCase())) {
      clientMap.set(compName.toLowerCase(), { id: j.id, displayName: compName });
    }
  });

  clientMap.forEach(({ id, displayName }) => {
    html += `<option value="${escapeHTML(id)}">${escapeHTML(displayName)}</option>`;
  });

  select.innerHTML = html;
  if (prevVal && [...select.options].some(o => o.value === prevVal)) {
    select.value = prevVal;
  }
}

// ----------------------------------------------------
// STORAGE QUOTA MONITORING
// ----------------------------------------------------
async function fetchStorageStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/tenant/storage-status`, { headers: getAuthHeaders() });
    if (res.ok) {
      const data = await res.json();
      updateStorageStatusUI(data);
    }
  } catch(err) {
    console.error("Storage query error:", err);
  }
}

function updateStorageStatusUI(data) {
  const planText = document.getElementById('storageLimitPlanText');
  const valueText = document.getElementById('storageLimitValueText');
  const bar = document.getElementById('storageProgressBar');
  const warning = document.getElementById('storageLimitWarningAlert');
  
  if (!planText || !valueText || !bar) return;
  
  const usedMB = (data.usedBytes / (1024 * 1024)).toFixed(2);
  const limitMB = (data.limitBytes / (1024 * 1024)).toFixed(0);
  
  planText.innerText = `Plan Quota: ${data.plan} Tier`;
  valueText.innerText = `${usedMB} MB of ${limitMB}.0 MB Used (${data.percentage}%)`;
  bar.style.width = `${data.percentage}%`;
  
  if (data.percentage >= 100) {
    bar.style.background = '#EF4444';
    if (warning) warning.style.display = 'flex';
  } else {
    bar.style.background = 'linear-gradient(90deg, var(--accent-blue) 0%, var(--accent-purple) 100%)';
    if (warning) warning.style.display = 'none';
  }
}

// ----------------------------------------------------
// GLOBAL BROADCAST MESSAGES
// ----------------------------------------------------
async function checkGlobalBroadcast() {
  if (!currentUser) return;
  try {
    const res = await fetch(`${API_BASE}/api/broadcasts/latest`, { headers: getAuthHeaders() });
    if (res.ok) {
      const broadcast = await res.json();
      const banner = document.getElementById('globalBroadcastBanner');
      const bannerText = document.getElementById('broadcastBannerText');
      
      const dismissed = localStorage.getItem(`dismissed_broadcast_${broadcast ? broadcast.id : ''}`);
      
      if (broadcast && banner && bannerText && !dismissed) {
        bannerText.innerText = broadcast.message;
        banner.style.display = 'flex';
      } else if (banner) {
        banner.style.display = 'none';
      }
    }
  } catch(err) {
    console.error("Broadcast alert error:", err);
  }
}

function closeBroadcastBanner() {
  const banner = document.getElementById('globalBroadcastBanner');
  if (banner) {
    banner.style.display = 'none';
    fetch(`${API_BASE}/api/broadcasts/latest`, { headers: getAuthHeaders() })
      .then(res => res.json())
      .then(broadcast => {
        if (broadcast) {
          localStorage.setItem(`dismissed_broadcast_${broadcast.id}`, 'true');
        }
      });
  }
}

async function submitSuperAdminBroadcast(e) {
  e.preventDefault();
  const msgEl = document.getElementById('saasBroadcastMessage');
  if (!msgEl) return;
  const message = msgEl.value.trim();
  if (!message) return;
  
  try {
    showGlobalLoading("Publishing system broadcast...");
    const res = await fetch(`${API_BASE}/api/broadcasts`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ message })
    });
    
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to dispatch broadcast');
    }
    
    showAppNotification('Success', 'Broadcast message published successfully.', 'success');
    msgEl.value = '';
    await checkGlobalBroadcast();
  } catch(err) {
    showAppNotification('Publish Failed', err.message, 'danger');
  } finally {
    hideGlobalLoading();
  }
}

async function renderSaasStorageAlerts() {
  const list = document.getElementById('saasStorageAlertsList');
  if (!list) return;
  
  try {
    const res = await fetch(`${API_BASE}/api/admin/storage-alerts`, { headers: getAuthHeaders() });
    if (res.ok) {
      const alerts = await res.json();
      if (alerts.length === 0) {
        list.innerHTML = `<div style="font-size: 0.8rem; color: var(--text-muted); text-align: center; padding: 1rem; border: 1px dashed var(--border-color); border-radius: 6px;">No storage alerts active.</div>`;
      } else {
        list.innerHTML = alerts.map(alert => `
          <div style="padding: 0.75rem 1rem; background: rgba(239,68,68,0.06); border: 1px solid rgba(239,68,68,0.2); border-radius: 6px; display: flex; align-items: center; justify-content: space-between;">
            <div>
              <strong style="color: var(--text-primary); font-size: 0.82rem;">${escapeHTML(alert.companyName)}</strong>
              <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 0.15rem;">Tenant ID: ${escapeHTML(alert.companyId)}</div>
            </div>
            <span style="font-size: 0.78rem; font-weight: 700; color: #EF4444;">${alert.usedMB} MB / ${alert.limitMB} MB</span>
          </div>
        `).join('');
      }
    }
  } catch(err) {
    console.error("Storage alerts fetch error:", err);
  }
}

// ----------------------------------------------------
// HIRING SIGNALS SCRAPER AGGREGATOR
// Strategy Checklist Collapsible & Checkbox Helpers
window.toggleStrategyChecklistCollapse = function() {
  const contentBody = document.getElementById('hiringTodosContentBody');
  const icon = document.getElementById('strategyCollapseIcon');
  if (!contentBody) return;
  
  if (contentBody.style.display === 'none') {
    contentBody.style.display = 'flex';
    if (icon) {
      icon.innerText = '▼ Collapse';
      icon.style.color = 'var(--accent-blue)';
      icon.style.background = 'rgba(56, 189, 248, 0.08)';
    }
    localStorage.setItem('hiring_strategy_collapsed', 'false');
  } else {
    contentBody.style.display = 'none';
    if (icon) {
      icon.innerText = '▲ Expand';
      icon.style.color = 'var(--text-muted)';
      icon.style.background = 'rgba(255, 255, 255, 0.06)';
    }
    localStorage.setItem('hiring_strategy_collapsed', 'true');
  }
};

window.toggleAllStrategyCheckboxes = function(checkedState) {
  const checkboxes = document.querySelectorAll('#hiringTodosListContainer input[type="checkbox"]');
  checkboxes.forEach(cb => {
    if (cb.checked !== checkedState) {
      cb.click();
    }
  });
  showAppNotification(
    checkedState ? 'All Selected' : 'All Cleared',
    checkedState ? 'Checked all strategy checklist items.' : 'Cleared all strategy checklist items.',
    'info'
  );
};

// ----------------------------------------------------
// 👁️ Agent-Reach Multi-Platform 10-Item Lazy Loading Engine
// ----------------------------------------------------
let signalsCurrentPage = 1;
let signalsHasMore = true;
let signalsIsLoading = false;
let signalsActiveQuery = '';
let signalsSelectedSources = ['Jina Reader (Web)'];
let signalsAccumulatedResults = [];

async function triggerSignalsScraping(e) {
  if (e) e.preventDefault();
  const queryEl = document.getElementById('signalsQuery');
  if (!queryEl) return;
  const query = queryEl.value.trim();
  if (!query) return;

  const checkboxes = document.querySelectorAll('input[name="signalSource"]:checked');
  signalsSelectedSources = Array.from(checkboxes).map(cb => cb.value);
  if (signalsSelectedSources.length === 0) {
    showAppNotification('No Sources Selected', 'Please check at least one source website to scrape.', 'warning');
    return;
  }

  // Reset pagination state for fresh query search
  signalsCurrentPage = 1;
  signalsHasMore = true;
  signalsIsLoading = false;
  signalsActiveQuery = query;
  signalsAccumulatedResults = [];

  const consoleEl = document.getElementById('signalsConsoleLogs');
  const logsContainer = document.getElementById('signalsScraperLogsContainer');
  const resultsCard = document.getElementById('signalsResultsCard');
  
  if (logsContainer) logsContainer.style.display = 'block';
  if (resultsCard) resultsCard.style.display = 'none';

  if (consoleEl) {
    consoleEl.innerText = `[LAZY HARVESTER] Initialized multi-platform harvester for query: "${query}"...\n`;
    consoleEl.innerText += `[CHANNELS SELECTED] ${signalsSelectedSources.join(', ')}\n`;
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }

  await loadMoreSignalsLazyBatch(true);
}

async function loadMoreSignalsLazyBatch(isInitial = false) {
  if (signalsIsLoading) return;
  if (!isInitial && !signalsHasMore) return;

  const query = signalsActiveQuery || (document.getElementById('signalsQuery') ? document.getElementById('signalsQuery').value.trim() : '');
  if (!query) return;

  signalsIsLoading = true;

  const currentPlatform = signalsSelectedSources[(signalsCurrentPage - 1) % signalsSelectedSources.length] || 'Jina Reader (Web)';

  const consoleEl = document.getElementById('signalsConsoleLogs');
  const resultsCard = document.getElementById('signalsResultsCard');
  const tbody = document.getElementById('signalsResultsBody');
  const countEl = document.getElementById('signalsResultsCount');
  const loadBtn = document.getElementById('btnLoadMoreSignals');
  const statusText = document.getElementById('signalsLazyStatusText');

  if (loadBtn) {
    loadBtn.disabled = true;
    loadBtn.innerHTML = `<i data-lucide="loader-2" class="spin-anim" style="width: 15px; height: 15px;"></i> Loading Next 10 Signals from ${escapeHTML(currentPlatform)} (Page ${signalsCurrentPage})...`;
    lucide.createIcons();
  }

  try {
    if (consoleEl) {
      consoleEl.innerText += `\n[PAGE ${signalsCurrentPage} | CHANNEL: ${currentPlatform}] Requesting 10 leads (Page: ${signalsCurrentPage}, Limit: 10)...\n`;
      consoleEl.scrollTop = consoleEl.scrollHeight;
    }

    const res = await fetch(`${API_BASE}/api/signals/scrape?query=${encodeURIComponent(query)}&platform=${encodeURIComponent(currentPlatform)}&page=${signalsCurrentPage}&limit=10`, {
      headers: getAuthHeaders()
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Failed to fetch signal page');
    }

    const data = await res.json();

    const logLines = Array.isArray(data.logs) ? data.logs : [
      `[Agent-Reach Router] Executed lazy page ${signalsCurrentPage} harvest for: "${query}"...`
    ];
    if (consoleEl) {
      for (const logLine of logLines) {
        consoleEl.innerText += `${logLine}\n`;
      }
      consoleEl.scrollTop = consoleEl.scrollHeight;
    }

    if (data.results && data.results.length > 0) {
      let addedCount = 0;
      data.results.forEach(item => {
        const isDuplicate = signalsAccumulatedResults.some(existing => 
          existing.company.toLowerCase() === item.company.toLowerCase() && 
          existing.title.toLowerCase() === item.title.toLowerCase()
        );
        if (!isDuplicate) {
          signalsAccumulatedResults.push(item);
          addedCount++;
          if (consoleEl) {
            consoleEl.innerText += `[PARSED LEAD] (${item.platforms ? item.platforms.join('') : currentPlatform}) "${item.title}" at ${item.company} (${item.location || 'Remote'})\n`;
          }
        }
      });
      signalsCurrentPage++;
      signalsHasMore = true; // Continuous multi-page fetching

      // If all items on this page were duplicate, auto-fetch next page to deliver new records
      if (addedCount === 0 && signalsCurrentPage < 50) {
        signalsIsLoading = false;
        return await loadMoreSignalsLazyBatch(isInitial);
      }
    } else {
      signalsCurrentPage++;
      signalsHasMore = true;
    }

    if (countEl) countEl.innerText = `${signalsAccumulatedResults.length} records found`;

    if (signalsAccumulatedResults.length === 0) {
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="10" style="padding: 1.5rem; text-align: center; color: var(--text-muted); border-bottom: 1px solid var(--border-color);">No active hiring signals match the keyword query. Try searching for "Developer" or "QA".</td></tr>`;
      }
    } else {
      if (resultsCard) {
        const wasHidden = resultsCard.style.display === 'none';
        resultsCard.style.display = 'block';
        if (wasHidden && isInitial) {
          setTimeout(() => {
            resultsCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 100);
        }
      }

      if (tbody) {
        tbody.innerHTML = signalsAccumulatedResults.map(res => {
          const payloadStr = encodeURIComponent(JSON.stringify(res));
          const score = res.match_score || 75;
          let badgeBg = 'rgba(239, 68, 68, 0.08)';
          let badgeColor = '#EF4444';
          if (score >= 80) {
            badgeBg = 'rgba(16, 185, 129, 0.08)';
            badgeColor = '#10B981';
          } else if (score >= 65) {
            badgeBg = 'rgba(245, 158, 11, 0.08)';
            badgeColor = '#F59E0B';
          }

          return `
            <tr>
              <td style="font-weight: 600; color: var(--text-primary);">${escapeHTML(res.title)}</td>
              <td>${escapeHTML(res.company)}</td>
              <td style="font-weight: 500; color: var(--accent-blue);">${escapeHTML(res.poc)}</td>
              <td>${escapeHTML(res.email || 'N/A')}</td>
              <td>${escapeHTML(res.phone || 'N/A')}</td>
              <td style="font-size: 0.72rem; color: var(--text-muted);">${escapeHTML(res.posted_date || 'N/A')}</td>
              <td>
                <div class="match-score-container" style="cursor: help;">
                  <span style="background: ${badgeBg}; color: ${badgeColor}; font-weight: 600; padding: 2px 6px; border-radius: 4px; font-size: 0.72rem;">
                    ${score}%
                  </span>
                  <div class="match-tooltip" style="display: none; position: absolute; bottom: 125%; left: 50%; transform: translateX(-50%); background: #0F172A; border: 1px solid var(--border-color); border-radius: 8px; padding: 0.75rem; width: 220px; z-index: 100; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5); font-size: 0.72rem; line-height: 1.4; color: var(--text-primary);">
                    <div style="font-weight: 700; color: white; margin-bottom: 0.35rem; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 0.25rem;">Consultancy Match Criteria</div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                      <span>Active Hirings:</span>
                      <strong style="color: var(--accent-blue);">${escapeHTML(res.match_criteria ? res.match_criteria.active_hirings : 'Direct Job Requisition')}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                      <span>Worked with agency:</span>
                      <strong style="color: ${(res.match_criteria && res.match_criteria.past_placement === 'Yes') ? '#10B981' : '#EF4444'};">${escapeHTML(res.match_criteria ? res.match_criteria.past_placement : 'Yes')}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                      <span>Vendor Manager:</span>
                      <strong style="color: ${(res.match_criteria && res.match_criteria.vendor_manager === 'Yes') ? '#10B981' : '#EF4444'};">${escapeHTML(res.match_criteria ? res.match_criteria.vendor_manager : 'No')}</strong>
                    </div>
                  </div>
                </div>
              </td>
              <td>
                ${res.platforms.map(p => `<span class="file-format-badge" style="background-color: rgba(14, 165, 233, 0.08); color: var(--accent-blue); font-size: 0.65rem; margin-right: 0.25rem;">${p}</span>`).join('')}
              </td>
              <td>
                <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                  <a href="${res.url}" target="_blank" class="outreach-link" style="color: var(--accent-blue); text-decoration: underline; font-weight: 500; font-size: 0.78rem; display: inline-flex; align-items: center; gap: 4px;">
                    <i data-lucide="external-link" style="width: 11px; height: 11px;"></i> Verify Source
                  </a>
                  ${res.raw_markdown ? `
                    <button type="button" onclick="openAgentReachMarkdownModal('${escapeHTML(res.title)}', '${escapeHTML(res.company)}', '${encodeURIComponent(res.raw_markdown)}')" style="font-size: 0.65rem; color: #34D399; background: rgba(52, 211, 153, 0.08); border: 1px solid rgba(52, 211, 153, 0.25); border-radius: 4px; padding: 1px 4px; cursor: pointer; display: inline-flex; align-items: center; gap: 2px;">
                      👁️ View Markdown
                    </button>
                  ` : ''}
                </div>
              </td>
              <td style="text-align: right;">
                <button class="btn-primary" style="padding: 0.3rem 0.6rem; font-size: 0.72rem; border-radius: 4px;" onclick="importSignalLead('${payloadStr}')">
                  <i data-lucide="plus-circle" style="width: 12px; height: 12px; margin-right: 1px;"></i> Import Lead
                </button>
              </td>
            </tr>
          `;
        }).join('');
      }
    }

    lucide.createIcons();

  } catch(err) {
    if (consoleEl) {
      consoleEl.innerText += `[LAZY LOAD ERROR] ${err.message}\n`;
      consoleEl.scrollTop = consoleEl.scrollHeight;
    }
  } finally {
    signalsIsLoading = false;
    if (loadBtn) {
      const nextPlatform = signalsSelectedSources[(signalsCurrentPage - 1) % signalsSelectedSources.length] || 'Jina Reader (Web)';
      if (signalsHasMore) {
        loadBtn.disabled = false;
        loadBtn.innerHTML = `<i data-lucide="arrow-down" style="width: 15px; height: 15px;"></i><span>Load 10 More Signals from ${escapeHTML(nextPlatform)} (Page ${signalsCurrentPage})</span>`;
        if (statusText) statusText.innerText = 'Scroll down or click button to load next 10 signals';
      } else {
        loadBtn.disabled = true;
        loadBtn.innerHTML = `<i data-lucide="check" style="width: 15px; height: 15px;"></i><span>All Verified Signals Loaded</span>`;
        if (statusText) statusText.innerText = 'No more items remaining for this search query';
      }
      lucide.createIcons();
    }
  }
}

// Global Scroll Listener for Lazy Loading on Scroll
window.addEventListener('scroll', () => {
  const signalsContainer = document.getElementById('signalsViewContainer');
  if (!signalsContainer || signalsContainer.style.display === 'none') return;
  if (signalsIsLoading || !signalsHasMore || signalsAccumulatedResults.length === 0) return;

  const scrollPosition = window.innerHeight + window.scrollY;
  const bodyThreshold = document.body.offsetHeight - 450;
  if (scrollPosition >= bodyThreshold) {
    loadMoreSignalsLazyBatch(false);
  }
});

function stopSignalsScraping(silent = false) {
  signalsIsLoading = false;
  if (typeof signalsScraperInterval !== 'undefined' && signalsScraperInterval) {
    clearInterval(signalsScraperInterval);
    signalsScraperInterval = null;
  }
  if (typeof signalsScraperTimeout !== 'undefined' && signalsScraperTimeout) {
    clearTimeout(signalsScraperTimeout);
    signalsScraperTimeout = null;
  }
  
  const startBtn = document.getElementById('btnStartSignalsScraper');
  const stopBtn = document.getElementById('btnStopSignalsScraper');
  const consoleEl = document.getElementById('signalsConsoleLogs');
  
  if (startBtn) startBtn.style.display = 'inline-flex';
  if (stopBtn) stopBtn.style.display = 'none';
  
  if (!silent) {
    if (consoleEl) {
      consoleEl.innerText += `\n[STOPPED] Lazy harvester paused.\n`;
      consoleEl.scrollTop = consoleEl.scrollHeight;
    }
    showAppNotification('Scraper Paused', 'Lazy harvester paused.', 'info');
  }
}

function importSignalLead(payloadStr) {
  const signal = JSON.parse(decodeURIComponent(payloadStr));
  openLeadModal();
  
  const leadTypeSelect = document.getElementById('leadTypeSelect');
  if (leadTypeSelect) {
    leadTypeSelect.value = 'client';
    handleLeadTypeChange();
  }
  
  document.getElementById('leadName').value = signal.poc;
  document.getElementById('leadDesignation').value = `TA POC at ${signal.company} for ${signal.title}`;
  document.getElementById('leadEmail').value = signal.email || '';
  document.getElementById('leadPhone').value = signal.phone || '';
  document.getElementById('leadSource').value = 'LinkedIn';
  document.getElementById('leadStatus').value = 'new';
  
  const leadSummary = document.getElementById('leadSummary');
  if (leadSummary) {
    leadSummary.value = `Scraped Hiring Signal from internet job platform.\nCompany Requirement: ${signal.title} role at ${signal.company}.\nUrgent hiring signal detected.`;
  }
  
  showAppNotification('Lead Pre-populated', 'Hiring signal details loaded into lead form.', 'info');
}

// Add event handlers to hook up to initialization
const originalInitialize = initializeApplication;
initializeApplication = function() {
  originalInitialize();
  checkGlobalBroadcast();
  
  setInterval(checkGlobalBroadcast, 60000);
  
  const originalOpenBilling = openCompanyBillingModal;
  openCompanyBillingModal = function() {
    originalOpenBilling();
    fetchStorageStatus();
  };
};

const originalRenderSaas = renderSaasTenants;
renderSaasTenants = function() {
  originalRenderSaas();
  renderSaasStorageAlerts();
  loadSuperAdminCoupons();
  loadSuperAdminReferrals();
};


function renderUpcomingInterviews() {
  const tbody = document.getElementById('interviewsTableBody');
  const emptyState = document.getElementById('interviewsEmptyState');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  const scheduledList = [];
  
  leads.forEach(client => {
    let clientStageObj = {};
    try { clientStageObj = JSON.parse(client.clientStage); } catch(e) {}
    
    const interviewDetails = clientStageObj.interviewDetails || {};
    const interviewDates = interviewDetails.interviewDates || {};
    const meetLinks = interviewDetails.meetLinks || {};
    
    Object.keys(interviewDates).forEach(candId => {
      const dateVal = interviewDates[candId];
      if (dateVal) {
        const cand = recruitmentCandidates.find(c => String(c.id) === String(candId));
        if (cand) {
          const job = recruitmentJobs.find(j => String(j.id) === String(cand.jobId));
          const jobTitle = job ? job.title : 'General Pool';
          scheduledList.push({
            client,
            candidate: cand,
            dateVal,
            meetLink: meetLinks[candId] || '',
            jobTitle
          });
        }
      }
    });
  });

  // Also include candidates in interviewing status
  recruitmentCandidates.forEach(cand => {
    if (cand.status === 'interviewing' && !scheduledList.some(s => s.candidate.id === cand.id)) {
      let candJob = recruitmentJobs.find(j => String(j.id) === String(cand.jobId));
      let candClient = leads.find(l => candJob && String(l.id) === String(candJob.clientId));
      if (!candClient && leads.length > 0) {
        candClient = leads.find(l => l.status === 'won' || l.status === 'Working with them (won)') || leads[0];
      }
      if (candClient) {
        let clientStageObj = {};
        try { clientStageObj = JSON.parse(candClient.clientStage); } catch(e) {}
        const interviewDetails = clientStageObj.interviewDetails || {};
        const interviewDates = interviewDetails.interviewDates || {};
        const meetLinks = interviewDetails.meetLinks || {};

        const dateVal = interviewDates[cand.id] || 'Scheduled';
        const meetLink = meetLinks[cand.id] || '';
        const jobTitle = candJob ? candJob.title : 'General Pool';

        scheduledList.push({
          client: candClient,
          candidate: cand,
          dateVal,
          meetLink,
          jobTitle
        });
      }
    }
  });

  scheduledList.sort((a, b) => {
    const parseDate = (dStr) => {
      if (dStr.includes(' at ')) {
        const parts = dStr.split(' at ');
        return new Date(`${parts[0]}T${parts[1]}:00`);
      }
      return new Date(dStr);
    };
    return parseDate(a.dateVal) - parseDate(b.dateVal);
  });

  if (scheduledList.length === 0) {
    tbody.innerHTML = '';
    if (emptyState) emptyState.style.display = 'flex';
    return;
  }
  
  if (emptyState) emptyState.style.display = 'none';

  scheduledList.forEach((item, index) => {
    const row = document.createElement('tr');
    
    const meetHtml = item.meetLink ? 
      `<div style="display: flex; align-items: center; gap: 0.4rem;">
        <a href="${escapeHTML(item.meetLink)}" target="_blank" class="btn-secondary" style="font-size: 0.72rem; padding: 0.25rem 0.6rem; color: #34D399; border-color: rgba(52, 211, 153, 0.3); background: rgba(52, 211, 153, 0.08); display: inline-flex; align-items: center; gap: 0.35rem; font-weight: 600; text-decoration: none;">
          <i data-lucide="video" style="width: 12px; height: 12px;"></i> Join Meet
        </a>
        <button onclick="updateMeetLink('${item.client.id}', '${item.candidate.id}')" title="Edit Meet Link" style="font-size: 0.7rem; color: var(--accent-blue); background: none; border: none; cursor: pointer; text-decoration: underline;">
          Edit
        </button>
       </div>` : 
      `<div style="display: flex; align-items: center; gap: 0.35rem;">
        <button onclick="updateMeetLink('${item.client.id}', '${item.candidate.id}')" class="btn-secondary" style="font-size: 0.72rem; padding: 0.25rem 0.6rem; color: var(--accent-blue); border-color: rgba(59, 130, 246, 0.3); background: rgba(59, 130, 246, 0.08); display: inline-flex; align-items: center; gap: 0.35rem; font-weight: 600; cursor: pointer;">
          <i data-lucide="plus" style="width: 12px; height: 12px;"></i> Add Meet URL
        </button>
       </div>`;
       
    row.innerHTML = `
      <td style="text-align: center; font-weight: 600; color: var(--text-secondary);">${index + 1}</td>
      <td>
        <div style="font-weight: 700; color: var(--text-primary); cursor: pointer; text-decoration: underline;" onclick="openCandidateModal('${item.candidate.id}')">
          ${escapeHTML(item.candidate.name)}
        </div>
        <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 500; margin-top: 0.15rem;">
          Job: ${escapeHTML(item.jobTitle)}
        </div>
      </td>
      <td>
        <div style="font-size: 0.78rem; color: var(--text-secondary);">${escapeHTML(item.candidate.email || 'No email')}</div>
        <div style="font-size: 0.74rem; color: var(--text-muted);">${escapeHTML(item.candidate.phone || 'No phone')}</div>
      </td>
      <td>
        <div style="font-weight: 600; color: var(--text-primary);">${escapeHTML(item.client.company || 'Our Client')}</div>
      </td>
      <td>
        <span class="status-badge" style="background: rgba(139, 92, 246, 0.08); border: 1px solid rgba(139, 92, 246, 0.2); color: var(--accent-purple); font-weight: 600;">
          <i data-lucide="clock" style="width: 12px; height: 12px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i>
          ${escapeHTML(item.dateVal)}
        </span>
      </td>
      <td>${meetHtml}</td>
      <td>
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn-secondary" onclick="sendInterviewInvite('${item.client.id}', '${item.candidate.id}')" style="font-size: 0.72rem; padding: 0.25rem 0.6rem; border-radius: 6px; display: inline-flex; align-items: center; gap: 0.25rem;">
            <i data-lucide="mail" style="width: 12px; height: 12px;"></i> Invite
          </button>
          <button class="btn-secondary" onclick="deleteInterview('${item.client.id}', '${item.candidate.id}')" style="font-size: 0.72rem; padding: 0.25rem 0.6rem; border-radius: 6px; border-color: rgba(239, 68, 68, 0.4); color: #EF4444; background: rgba(239, 68, 68, 0.02); display: inline-flex; align-items: center; gap: 0.25rem;">
            <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i> Delete
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(row);
  });
  
  lucide.createIcons();
}

async function deleteInterview(clientId, candId) {
  let client = leads.find(l => String(l.id) === String(clientId));
  let cand = recruitmentCandidates.find(c => String(c.id) === String(candId));

  if (!client && cand) {
    const candJob = recruitmentJobs.find(j => String(j.id) === String(cand.jobId));
    if (candJob) client = leads.find(l => String(l.id) === String(candJob.clientId));
    if (!client && leads.length > 0) client = leads[0];
  }

  showAppConfirm(
    "Delete Scheduled Interview",
    "Are you sure you want to delete this scheduled interview? This will clear the scheduled date and meeting link for this candidate.",
    async () => {
      try {
        showGlobalLoading("Deleting interview schedule...");

        if (client) {
          let clientStageObj = {};
          try { clientStageObj = JSON.parse(client.clientStage || '{}'); } catch(e) {}

          if (clientStageObj.interviewDetails) {
            if (clientStageObj.interviewDetails.interviewDates) {
              delete clientStageObj.interviewDetails.interviewDates[candId];
            }
            if (clientStageObj.interviewDetails.meetLinks) {
              delete clientStageObj.interviewDetails.meetLinks[candId];
            }
          }

          client.clientStage = JSON.stringify(clientStageObj);

          await fetch(`${API_BASE}/api/leads/${client.id}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(client)
          });
        }

        if (cand && cand.status === 'interviewing') {
          cand.status = 'shared_profile';
          await fetch(`${API_BASE}/api/candidates/${candId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({
              jobId: cand.jobId,
              name: cand.name,
              email: cand.email,
              phone: cand.phone,
              status: 'shared_profile',
              details: cand.details,
              assignedRecruiter: cand.assignedRecruiter
            })
          });
        }

        showAppNotification("Interview Deleted", "Scheduled interview has been deleted successfully.", "success");
        await fetchAllRecruitmentCandidates();
        renderUpcomingInterviews();
        renderCandidatePipeline();
        renderClientsKanban();
      } catch (err) {
        showAppNotification("Update Failed", "Could not delete interview: " + err.message, "danger");
      } finally {
        hideGlobalLoading();
      }
    }
  );
}

function updateMeetLink(clientId, candId) {
  const client = leads.find(l => String(l.id) === String(clientId));
  if (!client) return;

  let clientStageObj = {};
  try { clientStageObj = JSON.parse(client.clientStage || '{}'); } catch(e) {}
  
  const currentMeetLink = (clientStageObj.interviewDetails && clientStageObj.interviewDetails.meetLinks) 
    ? (clientStageObj.interviewDetails.meetLinks[candId] || '') 
    : '';

  showAppPrompt(
    "Google Meet Link",
    "Enter Google Meet / Zoom meeting URL for this interview:",
    currentMeetLink,
    async (newLink) => {
      if (!clientStageObj.interviewDetails) clientStageObj.interviewDetails = {};
      if (!clientStageObj.interviewDetails.meetLinks) clientStageObj.interviewDetails.meetLinks = {};
      
      clientStageObj.interviewDetails.meetLinks[candId] = newLink.trim();
      client.clientStage = JSON.stringify(clientStageObj);
      
      try {
        const response = await fetch(`${API_BASE}/api/leads/${client.id}`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify(client)
        });
        if (!response.ok) throw new Error("Server update failed");
        
        showAppNotification("Meet Link Updated", "Meeting link has been updated successfully.", "success");
        await initRemoteDatabase();
        renderUpcomingInterviews();
        if (activeTab === 'my-clients' && selectedClient && selectedClient.id === clientId) {
          renderClientDetails(selectedClient.id);
        }
      } catch (err) {
        showAppNotification("Update Failed", "Could not update meeting link: " + err.message, "danger");
      }
    }
  );
}

let clientAccordionStates = {
  sharing: true,
  interview: true,
  selection: true
};

function toggleClientSection(section) {
  if (clientAccordionStates[section] === undefined) {
    clientAccordionStates[section] = true;
  }
  clientAccordionStates[section] = !clientAccordionStates[section];
  renderClientsKanban();
}

function filterClientCandidates() {
  const query = document.getElementById('clientCandidateSearchInput') ? document.getElementById('clientCandidateSearchInput').value.toLowerCase().trim() : '';
  const rows = document.querySelectorAll('.client-cand-row');
  rows.forEach(row => {
    const name = row.getAttribute('data-name').toLowerCase();
    if (name.includes(query)) {
      row.style.display = 'flex';
    } else {
      row.style.display = 'none';
    }
  });
}

// ----------------------------------------------------
// TALENT POOL / CANDIDATE DATABASE LOGIC
// ----------------------------------------------------
// ----------------------------------------------------
// TALENT POOL / CANDIDATE DATABASE LOGIC (Paginated API Lazy-Loading & 2-Tier Search)
// ----------------------------------------------------
let selectedTalentDbCandidateId = null;
let talentDbCurrentPage = 1;
let talentDbLimit = 10;
let talentDbHasMore = true;
let talentDbLoading = false;
let talentDbCandidates = [];
let talentDbSearchTimeout = null;

async function initTalentDbView() {
  talentDbCurrentPage = 1;
  talentDbHasMore = true;
  talentDbCandidates = [];
  selectedTalentDbCandidateId = null;
  const searchInput = document.getElementById('talentDbSearchInput');
  if (searchInput) searchInput.value = '';
  await fetchTalentDbCandidates(1, false);
}

async function fetchTalentDbCandidates(page = 1, isAppend = false, searchQuery = '') {
  if (talentDbLoading) return;
  talentDbLoading = true;

  const listContainer = document.getElementById('talentDbList');
  if (listContainer && !isAppend) {
    listContainer.innerHTML = `
      <div style="text-align: center; padding: 3rem 1rem; color: var(--accent-blue);">
        <i data-lucide="loader-2" style="width: 28px; height: 28px; animation: spin 1s linear infinite; margin-bottom: 0.5rem; display: inline-block;"></i>
        <div style="font-size: 0.82rem; font-weight: 500;">Fetching candidates from API...</div>
      </div>
    `;
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  } else if (listContainer && isAppend) {
    const loaderEl = document.createElement('div');
    loaderEl.id = 'talentDbAppendLoader';
    loaderEl.style.cssText = 'text-align: center; padding: 0.75rem; color: var(--accent-blue); font-size: 0.75rem; font-weight: 500;';
    loaderEl.innerHTML = `<i data-lucide="loader-2" style="width: 16px; height: 16px; animation: spin 1s linear infinite; vertical-align: middle; margin-right: 4px;"></i> Loading 10 more candidates...`;
    listContainer.appendChild(loaderEl);
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }

  try {
    let url = `${API_BASE}/api/candidates?excludeResume=true&page=${page}&limit=${talentDbLimit}`;
    if (searchQuery) {
      url += `&search=${encodeURIComponent(searchQuery)}`;
    }
    const res = await fetch(url, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error("Failed to fetch candidates from API");
    const data = await res.json();

    if (data.length < talentDbLimit) {
      talentDbHasMore = false;
    } else {
      talentDbHasMore = true;
    }

    if (isAppend) {
      const appendLoader = document.getElementById('talentDbAppendLoader');
      if (appendLoader) appendLoader.remove();

      data.forEach(c => {
        if (!talentDbCandidates.some(existing => existing.id === c.id)) {
          talentDbCandidates.push(c);
        }
      });
    } else {
      talentDbCandidates = data;
    }

    talentDbCurrentPage = page;
    renderTalentDbListAndDetail();
  } catch (err) {
    console.error("Talent DB fetch error:", err);
    showAppNotification("API Error", "Failed to fetch candidate profiles.", "danger");
  } finally {
    talentDbLoading = false;
  }
}

function renderTalentDbListAndDetail() {
  const listContainer = document.getElementById('talentDbList');
  const detailPane = document.getElementById('talentDbDetailPane');
  if (!listContainer || !detailPane) return;

  const countEl = document.getElementById('talentDbTotalCount');
  if (countEl) countEl.innerText = talentDbCandidates.length;

  listContainer.innerHTML = '';
  if (talentDbCandidates.length === 0) {
    listContainer.innerHTML = `
      <div style="text-align: center; padding: 3rem 1.5rem; color: var(--text-muted); font-size: 0.82rem; border: 1px dashed var(--border-color); border-radius: 8px;">
        No candidate profiles found in database.
      </div>
    `;
    detailPane.innerHTML = `
      <div style="text-align: center; padding: 5rem 3rem; color: var(--text-muted); font-size: 0.85rem; border: 1px dashed var(--border-color); border-radius: 12px; background: rgba(255,255,255,0.01);">
        <i data-lucide="user" style="width: 32px; height: 32px; color: var(--text-muted); margin-bottom: 0.75rem;"></i>
        <div>Select a candidate profile from the list to display details and resume.</div>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  // Infinite scroll listener for lazy loading 10 at a time
  if (!listContainer.hasScrollListener) {
    listContainer.hasScrollListener = true;
    listContainer.addEventListener('scroll', () => {
      if (listContainer.scrollTop + listContainer.clientHeight >= listContainer.scrollHeight - 30) {
        if (!talentDbLoading && talentDbHasMore) {
          const searchQuery = document.getElementById('talentDbSearchInput')?.value.trim();
          fetchTalentDbCandidates(talentDbCurrentPage + 1, true, searchQuery);
        }
      }
    });
  }

  // Default selection
  const stillExists = talentDbCandidates.some(c => c.id === selectedTalentDbCandidateId);
  if (!stillExists && talentDbCandidates.length > 0) {
    selectedTalentDbCandidateId = talentDbCandidates[0].id;
  }

  talentDbCandidates.forEach(cand => {
    const isSelected = selectedTalentDbCandidateId === cand.id;
    const card = document.createElement('div');
    card.className = `job-card ${isSelected ? 'active' : ''}`;
    card.style.cssText = `cursor: pointer; padding: 0.85rem; position: relative; border-left: 3px solid ${isSelected ? 'var(--accent-purple)' : 'transparent'}; background: ${isSelected ? 'rgba(168,85,247,0.04)' : 'rgba(255,255,255,0.01)'};`;
    card.onclick = () => selectTalentDbCandidate(cand.id);

    let skillsBadge = '';
    if (cand.details) {
      try {
        const parsed = typeof cand.details === 'string' ? JSON.parse(cand.details) : cand.details;
        if (parsed.skills) {
          skillsBadge = `<div style="font-size: 0.65rem; color: var(--text-secondary); margin-top: 0.25rem;"><span style="font-weight:600;">Skills:</span> ${escapeHTML(parsed.skills)}</div>`;
        }
      } catch (e) {}
    }

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: start;">
        <div>
          <h4 style="font-weight: 700; color: var(--text-primary); font-size: 0.85rem; margin-bottom: 0.15rem;">${escapeHTML(cand.name)}</h4>
          <div style="font-size: 0.7rem; color: var(--text-muted);">${escapeHTML(cand.email || 'No email')} | ${escapeHTML(cand.phone || 'No phone')}</div>
          ${skillsBadge}
        </div>
        <span class="file-format-badge" style="font-size: 0.6rem; background: rgba(147, 51, 234, 0.08); color: var(--accent-purple); font-weight: 600;">${cand.status.toUpperCase()}</span>
      </div>
    `;
    listContainer.appendChild(card);
  });

  renderTalentDbDetailPane();
  lucide.createIcons();
}

function renderTalentDbDetailPane() {
  const detailPane = document.getElementById('talentDbDetailPane');
  if (!detailPane) return;

  const activeCand = talentDbCandidates.find(c => c.id === selectedTalentDbCandidateId);
  if (!activeCand) {
    detailPane.innerHTML = `
      <div style="text-align: center; padding: 5rem 3rem; color: var(--text-muted); font-size: 0.85rem; border: 1px dashed var(--border-color); border-radius: 12px; background: rgba(255,255,255,0.01);">
        <i data-lucide="user" style="width: 32px; height: 32px; color: var(--text-muted); margin-bottom: 0.75rem;"></i>
        <div>Select a candidate profile from the list to display details.</div>
      </div>
    `;
    return;
  }

  let skills = 'Not specified';
  let experience = 'Not specified';
  let resumeText = '';
  let resumeName = '';
  if (activeCand.details) {
    try {
      const parsed = typeof activeCand.details === 'string' ? JSON.parse(activeCand.details) : activeCand.details;
      skills = parsed.skills || 'Not specified';
      experience = parsed.experience || 'Not specified';
      resumeText = parsed.resume_text || '';
      resumeName = parsed.resume_name || '';
    } catch (e) {
      skills = activeCand.details;
    }
  }

  let jobsOptions = `<option value="">-- Select Active Job opening --</option>`;
  recruitmentJobs.forEach(job => {
    jobsOptions += `<option value="${job.id}">${escapeHTML(job.title)} (at ${escapeHTML(job.company || 'Internal')})</option>`;
  });

  const appliedJob = recruitmentJobs.find(j => j.id === activeCand.jobId || j.id === activeCand.job_id);
  const appliedJobTitle = appliedJob ? appliedJob.title : 'General Talent Database';
  const isInProcess = activeCand.status !== 'hired' && activeCand.status !== 'rejected';

  detailPane.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 1.5rem;">
      <div style="display: flex; justify-content: space-between; align-items: start; border-bottom: 1px solid var(--border-color); padding-bottom: 1rem;">
        <div>
          <h2 style="font-size: 1.25rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.25rem;">${escapeHTML(activeCand.name)}</h2>
          <div style="font-size: 0.8rem; color: var(--text-secondary); display: flex; gap: 0.75rem; align-items: center;">
            <span><i data-lucide="mail" style="width:12px; height:12px; display:inline; margin-right:2px; vertical-align:-2px;"></i> ${escapeHTML(activeCand.email || 'N/A')}</span>
            <span>•</span>
            <span><i data-lucide="phone" style="width:12px; height:12px; display:inline; margin-right:2px; vertical-align:-2px;"></i> ${escapeHTML(activeCand.phone || 'N/A')}</span>
          </div>
        </div>
        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.35rem;">
          <span class="file-format-badge" style="background: ${isInProcess ? 'rgba(14, 165, 233, 0.1)' : 'rgba(147, 51, 234, 0.1)'}; color: ${isInProcess ? 'var(--accent-blue)' : 'var(--accent-purple)'}; font-size: 0.75rem; padding: 4px 8px; font-weight: 600;">
            ${isInProcess ? '⚡ IN PROCESS' : activeCand.status.toUpperCase()}
          </span>
          <span style="font-size: 0.68rem; color: var(--text-muted);">Assigned HR: ${escapeHTML(activeCand.assignedRecruiter || 'Unassigned')}</span>
        </div>
      </div>

      <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center;">
        <button onclick="viewCandidateResumeModal('${activeCand.id}')" class="btn-primary" style="font-size: 0.75rem; padding: 0.35rem 0.75rem; display: flex; align-items: center; gap: 0.35rem; background: linear-gradient(135deg, var(--accent-blue) 0%, var(--accent-purple) 100%);">
          <i data-lucide="file-text" style="width: 13px; height: 13px;"></i> View Resume Document
        </button>
        <button onclick="openCandidateModal('${activeCand.id}')" class="btn-secondary" style="font-size: 0.75rem; padding: 0.35rem 0.75rem; display: flex; align-items: center; gap: 0.35rem;">
          <i data-lucide="edit-3" style="width: 13px; height: 13px;"></i> Edit Candidate Profile
        </button>
        <button onclick="openAuditLogModal('${activeCand.id}', '${escapeHTML(activeCand.name)}')" class="btn-secondary" style="font-size: 0.75rem; padding: 0.35rem 0.75rem; display: flex; align-items: center; gap: 0.35rem; color: var(--accent-purple); border-color: rgba(192,132,252,0.3);">
          <i data-lucide="history" style="width: 13px; height: 13px;"></i> Application History Log
        </button>
        <button onclick="deleteTalentDbCandidate('${activeCand.id}')" class="btn-secondary" style="font-size: 0.75rem; padding: 0.35rem 0.75rem; display: flex; align-items: center; gap: 0.35rem; color: #EF4444; border-color: rgba(239,68,68,0.3);">
          <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i> Delete Profile (Owner Approval)
        </button>
      </div>

      <div style="background: rgba(255,255,255,0.01); border: 1px solid var(--border-color); border-radius: 10px; padding: 1rem;">
        <h4 style="font-size: 0.8rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.35rem; font-family: 'Outfit';">
          <i data-lucide="clock" style="width: 14px; height: 14px; color: var(--accent-blue);"></i>
          Application & Recruitment Process History
        </h4>
        <div style="display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.75rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-primary); padding: 0.5rem 0.75rem; border-radius: 6px; border: 1px solid var(--border-color);">
            <span><strong>Applied Position:</strong> ${escapeHTML(appliedJobTitle)}</span>
            <span class="file-format-badge" style="background: rgba(14, 165, 233, 0.08); color: var(--accent-blue); font-size: 0.65rem;">${escapeHTML(activeCand.status.toUpperCase())}</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; color: var(--text-secondary); font-size: 0.72rem; padding: 0 0.25rem;">
            <span>Submitted on: ${formatLeadTimestamp(activeCand.createdDate)}</span>
            <span>Process Status: ${isInProcess ? 'Active in Pipeline' : 'Archived / Database'}</span>
          </div>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem;">
        <div>
          <h4 style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700; margin-bottom: 0.35rem;">Technical Skills</h4>
          <div style="font-size: 0.85rem; color: var(--text-primary); background: var(--bg-primary); padding: 0.75rem; border-radius: 8px; border: 1px solid var(--border-color); line-height: 1.4;">
            ${escapeHTML(skills)}
          </div>
        </div>
        <div>
          <h4 style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700; margin-bottom: 0.35rem;">Professional Experience</h4>
          <div style="font-size: 0.85rem; color: var(--text-primary); background: var(--bg-primary); padding: 0.75rem; border-radius: 8px; border: 1px solid var(--border-color); line-height: 1.4;">
            ${escapeHTML(experience)}
          </div>
        </div>
      </div>

      ${resumeText ? `
        <div>
          <h4 style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700; margin-bottom: 0.35rem;">
            Parsed Resume Content ${resumeName ? `(${escapeHTML(resumeName)})` : ''}
          </h4>
          <div style="max-height: 200px; overflow-y: auto; font-size: 0.76rem; font-family: monospace; color: var(--text-secondary); background: var(--bg-primary); padding: 0.75rem; border-radius: 8px; border: 1px solid var(--border-color); line-height: 1.4; white-space: pre-wrap;">
            ${escapeHTML(resumeText)}
          </div>
        </div>
      ` : ''}

      <div style="background: rgba(147, 51, 234, 0.02); border: 1px dashed var(--accent-purple); border-radius: 12px; padding: 1.25rem; margin-top: 1rem;">
        <h4 style="font-size: 0.85rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.35rem;">
          <i data-lucide="plus-circle" style="color: var(--accent-purple); width: 16px; height: 16px;"></i>
          Import Profile to specific Job opening
        </h4>
        <p style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.75rem; line-height: 1.3;">
          Clone this candidate profile directly into the recruitment pipeline of another active job post.
        </p>
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <select id="importCandidateTargetJob" class="form-control" style="font-size: 0.8rem; height: 36px; background: var(--bg-primary);">
            ${jobsOptions}
          </select>
          <button onclick="importTalentDbCandidate()" class="btn-primary" style="height: 36px; padding: 0 1rem; flex-shrink: 0; font-size: 0.8rem; justify-content: center;">
            <i data-lucide="copy" style="width: 14px; height: 14px;"></i> Copy to Pipeline
          </button>
        </div>
      </div>
    </div>
  `;
}

function selectTalentDbCandidate(candId) {
  selectedTalentDbCandidateId = candId;
  renderTalentDbListAndDetail();
}

function filterTalentDb() {
  if (talentDbSearchTimeout) {
    clearTimeout(talentDbSearchTimeout);
    talentDbSearchTimeout = null;
  }

  const searchQuery = document.getElementById('talentDbSearchInput')?.value.trim().toLowerCase() || '';

  if (!searchQuery) {
    talentDbLoading = false;
    fetchTalentDbCandidates(1, false, '');
    return;
  }

  // 2-Tier Search: Step 1: Filter on screen loaded candidates first
  const localFiltered = talentDbCandidates.filter(c => {
    const nameMatch = (c.name || '').toLowerCase().includes(searchQuery);
    const emailMatch = (c.email || '').toLowerCase().includes(searchQuery);
    const phoneMatch = (c.phone || '').toLowerCase().includes(searchQuery);
    let detailsMatch = false;
    if (c.details) {
      try {
        const parsed = typeof c.details === 'string' ? JSON.parse(c.details) : c.details;
        const skills = (parsed.skills || '').toLowerCase();
        const experience = (parsed.experience || '').toLowerCase();
        if (skills.includes(searchQuery) || experience.includes(searchQuery)) detailsMatch = true;
      } catch(e) {}
    }
    return nameMatch || emailMatch || phoneMatch || detailsMatch;
  });

  if (localFiltered.length > 0) {
    renderTalentDbListFiltered(localFiltered);
  } else {
    const listContainer = document.getElementById('talentDbList');
    if (listContainer) {
      listContainer.innerHTML = `
        <div style="text-align: center; padding: 2rem 1rem; color: var(--accent-blue);">
          <i data-lucide="loader-2" style="width: 22px; height: 22px; animation: spin 1s linear infinite; margin-bottom: 0.5rem; display: inline-block;"></i>
          <div style="font-size: 0.8rem;">Searching database for "${escapeHTML(searchQuery)}"...</div>
        </div>
      `;
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    }
  }

  // 2-Tier Search: Step 2: Trigger debounced API search for full database
  talentDbSearchTimeout = setTimeout(() => {
    talentDbLoading = false;
    fetchTalentDbCandidates(1, false, searchQuery);
  }, 300);
}

function renderTalentDbListFiltered(filteredList) {
  const listContainer = document.getElementById('talentDbList');
  if (!listContainer) return;
  const countEl = document.getElementById('talentDbTotalCount');
  if (countEl) countEl.innerText = filteredList.length;

  listContainer.innerHTML = '';
  filteredList.forEach(cand => {
    const isSelected = selectedTalentDbCandidateId === cand.id;
    const card = document.createElement('div');
    card.className = `job-card ${isSelected ? 'active' : ''}`;
    card.style.cssText = `cursor: pointer; padding: 0.85rem; position: relative; border-left: 3px solid ${isSelected ? 'var(--accent-purple)' : 'transparent'};`;
    card.onclick = () => selectTalentDbCandidate(cand.id);

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: start;">
        <div>
          <h4 style="font-weight: 700; color: var(--text-primary); font-size: 0.85rem; margin-bottom: 0.15rem;">${escapeHTML(cand.name)}</h4>
          <div style="font-size: 0.7rem; color: var(--text-muted);">${escapeHTML(cand.email || 'No email')} | ${escapeHTML(cand.phone || 'No phone')}</div>
        </div>
        <span class="file-format-badge" style="font-size: 0.6rem; background: rgba(147, 51, 234, 0.08); color: var(--accent-purple); font-weight: 600;">${cand.status.toUpperCase()}</span>
      </div>
    `;
    listContainer.appendChild(card);
  });
}

function renderTalentDb() {
  renderTalentDbListAndDetail();
}

function selectTalentDbCandidate(candId) {
  selectedTalentDbCandidateId = candId;
  renderTalentDbListAndDetail();
}

async function importTalentDbCandidate() {
  const targetJobId = document.getElementById('importCandidateTargetJob').value;
  if (!targetJobId) {
    showAppNotification('Job Required', 'Please select a job opening to copy the profile to.', 'warning');
    return;
  }

  const activeCand = talentDbCandidates.find(c => c.id === selectedTalentDbCandidateId) || recruitmentCandidates.find(c => c.id === selectedTalentDbCandidateId);
  if (!activeCand) return;

  try {
    showGlobalLoading("Importing candidate to job pipeline...");
    // Retrieve full candidate info (with resume base64 details)
    const getRes = await fetch(`${API_BASE}/api/candidates/${activeCand.id}`, {
      headers: getAuthHeaders()
    });
    if (!getRes.ok) throw new Error("Could not fetch candidate details.");
    const fullCand = await getRes.json();

    // POST a cloned candidate
    const postRes = await fetch(`${API_BASE}/api/candidates`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        jobId: targetJobId,
        name: fullCand.name,
        email: fullCand.email,
        phone: fullCand.phone,
        status: 'applied', // starts in applied stage
        details: fullCand.details,
        assignedRecruiter: currentUser ? currentUser.name : ''
      })
    });

    if (!postRes.ok) {
      const errData = await postRes.json();
      throw new Error(errData.error || "Failed to clone candidate profile");
    }

    showAppNotification('Candidate Imported', `${fullCand.name} successfully cloned into selected job pipeline.`, 'success');
    
    // Refresh recruitment data
    await fetchAllRecruitmentCandidates();
    renderTalentDbListAndDetail();
  } catch (err) {
    showAppNotification('Import Failed', err.message, 'danger');
  } finally {
    hideGlobalLoading();
  }
}

function openJobModalFromAddLead() {
  const clientName = document.getElementById('leadName')?.value.trim() || '';
  const clientCompany = document.getElementById('leadCompany')?.value.trim() || clientName;
  closeLeadModal();
  openJobModal();
  setTimeout(() => {
    const jobClientSelect = document.getElementById('jobClient');
    if (jobClientSelect && (clientCompany || clientName)) {
      let matchedOpt = Array.from(jobClientSelect.options).find(opt => opt.text.toLowerCase().includes((clientCompany || clientName).toLowerCase()));
      if (matchedOpt) {
        jobClientSelect.value = matchedOpt.value;
      }
    }
  }, 250);
}

function deleteTalentDbCandidate(candId) {
  const isCEO = currentUser.role === 'Super Admin' || currentUser.role === 'Manager' || (currentUser.ceoEmail && currentUser.email.toLowerCase() === currentUser.ceoEmail.toLowerCase());
  const userPerms = (currentUser && currentUser.permissions) ? (typeof currentUser.permissions === 'string' ? JSON.parse(currentUser.permissions) : currentUser.permissions) : {};
  const canDirectDelete = isCEO || userPerms.deleteTalentPool === true;

  if (canDirectDelete) {
    showAppConfirm(
      "Confirm Candidate Deletion",
      "Are you sure you want to delete this profile from the Candidate Database / Talent Pool? This action cannot be undone.",
      async () => {
        try {
          showGlobalLoading("Removing candidate from Talent Pool...");
          const res = await fetch(`${API_BASE}/api/candidates/${candId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
          });
          if (!res.ok) throw new Error("Failed to delete candidate.");
          showAppNotification("Deleted", "Candidate removed from Talent Pool.", "success");
          await fetchTalentDbCandidates(1, false);
        } catch (err) {
          showAppNotification("Error", err.message, "danger");
        } finally {
          hideGlobalLoading();
        }
      }
    );
  } else {
    showAppConfirm(
      "Owner Approval Required",
      "You do not have direct permission to delete Talent Pool candidates. Would you like to submit a Deletion Request to your Company Owner for approval?",
      async () => {
        try {
          showGlobalLoading("Submitting deletion request to Company Owner...");
          const cand = recruitmentCandidates.find(c => c.id === candId);
          const res = await fetch(`${API_BASE}/api/delete-requests`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
              targetId: candId,
              targetName: cand ? cand.name : 'Candidate Profile',
              targetType: 'Talent Pool Candidate',
              requestedBy: currentUser.name,
              reason: 'Talent Pool Candidate Removal Request'
            })
          });
          if (!res.ok) throw new Error("Failed to submit request.");
          showAppNotification("Request Submitted", "Deletion request sent to Company Owner for approval.", "info");
        } catch (err) {
          showAppNotification("Error", err.message, "danger");
        } finally {
          hideGlobalLoading();
        }
      }
    );
  }
}

async function openAuditLogModal(entityId = null, entityTitle = '') {
  const modal = document.getElementById('auditLogModalOverlay');
  const titleEl = document.getElementById('auditLogModalTitle');
  const container = document.getElementById('auditLogContentContainer');
  if (!modal || !container) return;

  if (titleEl) {
    titleEl.innerHTML = `<i data-lucide="history" style="color: var(--accent-purple); width: 22px; height: 22px;"></i> ${entityTitle ? `History: ${escapeHTML(entityTitle)}` : 'Organization Activity Log'}`;
  }

  modal.style.display = 'flex';
  container.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--text-muted); font-size: 0.8rem;">Loading activity history...</div>`;

  try {
    const url = entityId ? `${API_BASE}/api/audit-logs/${entityId}` : `${API_BASE}/api/audit-logs`;
    const res = await fetch(url, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error("Failed to fetch activity history.");
    const logs = await res.json();

    if (logs.length === 0) {
      container.innerHTML = `<div style="text-align: center; padding: 2.5rem; color: var(--text-muted); font-size: 0.8rem; border: 1px dashed var(--border-color); border-radius: 8px;">No audit or status change records logged yet.</div>`;
      lucide.createIcons();
      return;
    }

    let itemsHtml = '<div style="display: flex; flex-direction: column; gap: 0.75rem;">';
    logs.forEach(log => {
      const timeNice = formatDateNice(log.timestamp);
      itemsHtml += `
        <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 0.85rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
            <strong style="font-size: 0.8rem; color: var(--text-primary);">${escapeHTML(log.entityName || log.entityId)}</strong>
            <span style="font-size: 0.68rem; color: var(--text-muted);">${timeNice}</span>
          </div>
          <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem;">
            <span style="font-weight: 600; color: var(--accent-purple);">${escapeHTML(log.performedBy)}</span> performed <strong>${escapeHTML(log.action.replace('_', ' '))}</strong>
          </div>
          ${log.oldValue || log.newValue ? `
            <div style="font-size: 0.72rem; color: var(--text-muted); background: rgba(255,255,255,0.02); padding: 0.35rem 0.5rem; border-radius: 4px; display: inline-block;">
              From <code style="color: #F87171;">${escapeHTML(log.oldValue || 'None')}</code> to <code style="color: #34D399;">${escapeHTML(log.newValue || 'Updated')}</code>
            </div>
          ` : ''}
        </div>
      `;
    });
    itemsHtml += '</div>';
    container.innerHTML = itemsHtml;
    lucide.createIcons();
  } catch (err) {
    container.innerHTML = `<div style="color: #EF4444; font-size: 0.78rem; text-align: center; padding: 1rem;">${err.message}</div>`;
  }
}

function closeAuditLogModal() {
  const modal = document.getElementById('auditLogModalOverlay');
  if (modal) modal.style.display = 'none';
}

function viewCurrentLeadHistory() {
  const leadId = document.getElementById('leadId')?.value;
  const leadName = document.getElementById('leadName')?.value;
  if (leadId) {
    openAuditLogModal(leadId, leadName);
  }
}

async function viewCandidateResumeModal(candId) {
  const modal = document.getElementById('resumeViewerModalOverlay');
  const titleEl = document.getElementById('resumeViewerModalTitle');
  const container = document.getElementById('resumeViewerContentContainer');
  if (!modal || !container) return;

  modal.style.display = 'flex';
  container.innerHTML = `
    <div style="text-align: center; padding: 3rem; color: var(--accent-blue);">
      <i data-lucide="loader-2" style="width: 28px; height: 28px; animation: spin 1s linear infinite; margin-bottom: 0.5rem; display: inline-block;"></i>
      <div style="font-size: 0.85rem;">Fetching resume document from API...</div>
    </div>
  `;
  if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();

  try {
    const res = await fetch(`${API_BASE}/api/candidates/${candId}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error("Could not load candidate document.");
    const cand = await res.json();

    if (titleEl) {
      titleEl.innerHTML = `<i data-lucide="file-text" style="color: var(--accent-blue); width: 22px; height: 22px;"></i> Resume Document: ${escapeHTML(cand.name)}`;
    }

    let resumeBase64 = null;
    let resumeName = 'Resume Document';
    let resumeText = '';
    let skills = '';
    let experience = '';

    if (cand.details) {
      try {
        const parsed = typeof cand.details === 'string' ? JSON.parse(cand.details) : cand.details;
        resumeBase64 = parsed.resume_base64;
        resumeName = parsed.resume_name || 'Resume.pdf';
        resumeText = parsed.resume_text || '';
        skills = parsed.skills || '';
        experience = parsed.experience || '';
      } catch (e) {
        resumeText = cand.details;
      }
    }

    const isDataUri = resumeBase64 && (resumeBase64.startsWith('data:application/pdf') || resumeBase64.startsWith('data:'));
    const isCloudinaryUrl = resumeBase64 && (resumeBase64.startsWith('http://') || resumeBase64.startsWith('https://'));
    const streamUrl = `${API_BASE}/api/candidates/${candId}/resume-stream`;
    const hasResume = isDataUri || isCloudinaryUrl || (resumeBase64 && resumeBase64.length > 50);

    const iframeTarget = isDataUri ? resumeBase64 : streamUrl;
    const downloadTarget = streamUrl;

    let bodyHtml = `
      <div style="display: flex; flex-direction: column; gap: 1.25rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(14, 165, 233, 0.03); border: 1px solid rgba(14, 165, 233, 0.2); padding: 0.85rem 1.25rem; border-radius: 8px;">
          <div>
            <strong style="font-size: 0.9rem; color: var(--text-primary); display: block;">${escapeHTML(cand.name)}</strong>
            <span style="font-size: 0.75rem; color: var(--text-secondary);">${escapeHTML(cand.email || '')} • ${escapeHTML(cand.phone || '')}</span>
          </div>
          ${hasResume ? `
            <a href="${downloadTarget}" download="${escapeHTML(resumeName)}" target="_blank" rel="noopener noreferrer" class="btn-primary" style="font-size: 0.75rem; padding: 0.4rem 0.85rem; text-decoration: none; display: inline-flex; align-items: center; gap: 0.35rem;">
              <i data-lucide="download" style="width: 14px; height: 14px;"></i> Download / Open Full Document
            </a>
          ` : ''}
        </div>
    `;

    if (skills || experience) {
      bodyHtml += `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
          <div style="background: var(--bg-primary); padding: 0.75rem; border-radius: 6px; border: 1px solid var(--border-color);">
            <strong style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase;">Technical Skills</strong>
            <div style="font-size: 0.8rem; color: var(--text-primary); margin-top: 0.25rem;">${escapeHTML(skills || 'Not specified')}</div>
          </div>
          <div style="background: var(--bg-primary); padding: 0.75rem; border-radius: 6px; border: 1px solid var(--border-color);">
            <strong style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase;">Professional Experience</strong>
            <div style="font-size: 0.8rem; color: var(--text-primary); margin-top: 0.25rem;">${escapeHTML(experience || 'Not specified')}</div>
          </div>
        </div>
      `;
    }

    if (hasResume) {
      bodyHtml += `
        <div style="height: 550px; width: 100%; border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; background: #525659; position: relative;">
          <iframe src="${iframeTarget}" style="width: 100%; height: 100%; border: none;"></iframe>
        </div>
      `;
    } else if (resumeText) {
      bodyHtml += `
        <div>
          <h4 style="font-size: 0.78rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700; margin-bottom: 0.35rem;">Parsed Resume Document Text</h4>
          <div style="max-height: 400px; overflow-y: auto; font-size: 0.78rem; font-family: monospace; color: var(--text-secondary); background: var(--bg-primary); padding: 1rem; border-radius: 8px; border: 1px solid var(--border-color); line-height: 1.5; white-space: pre-wrap;">
            ${escapeHTML(resumeText)}
          </div>
        </div>
      `;
    } else {
      bodyHtml += `
        <div style="text-align: center; padding: 3rem; color: var(--text-muted); font-size: 0.82rem; border: 1px dashed var(--border-color); border-radius: 8px;">
          No resume file attached for this candidate yet.
        </div>
      `;
    }

    bodyHtml += `</div>`;
    container.innerHTML = bodyHtml;
    lucide.createIcons();
  } catch (err) {
    container.innerHTML = `<div style="color: #EF4444; font-size: 0.8rem; text-align: center; padding: 2rem;">${err.message}</div>`;
  }
}

function closeResumeViewerModal() {
  const modal = document.getElementById('resumeViewerModalOverlay');
  if (modal) modal.style.display = 'none';
}

async function openRecycleBinModal() {
  const modal = document.getElementById('recycleBinModalOverlay');
  const container = document.getElementById('recycleBinContentContainer');
  if (!modal || !container) return;

  modal.style.display = 'flex';
  container.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--text-muted); font-size: 0.8rem;">Fetching deleted items...</div>`;

  try {
    const res = await fetch(`${API_BASE}/api/recycle-bin`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error("Only Company Owner or CEO can access Recycle Bin.");
    const items = await res.json();

    if (items.length === 0) {
      container.innerHTML = `<div style="text-align: center; padding: 2.5rem; color: var(--text-muted); font-size: 0.82rem; border: 1px dashed var(--border-color); border-radius: 8px;">Recycle bin is empty. No deleted items found in the last 30 days.</div>`;
      return;
    }

    let itemsHtml = '<div style="display: flex; flex-direction: column; gap: 0.75rem;">';
    items.forEach(item => {
      const timeNice = formatDateNice(item.deletedAt);
      const isLead = item.entityType === 'lead';
      itemsHtml += `
        <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 0.85rem; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <strong style="font-size: 0.85rem; color: var(--text-primary); display: flex; align-items: center; gap: 0.35rem;">
              <span class="file-format-badge" style="background: ${isLead ? 'rgba(59, 130, 246, 0.1)' : 'rgba(147, 51, 234, 0.1)'}; color: ${isLead ? 'var(--accent-blue)' : 'var(--accent-purple)'}; font-size: 0.65rem;">${item.entityType.toUpperCase()}</span>
              ${escapeHTML(item.entityName)}
            </strong>
            <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.2rem;">
              Deleted by: <strong>${escapeHTML(item.deletedBy)}</strong> • ${timeNice}
            </div>
          </div>
          <button onclick="restoreRecycleBinItem('${item.id}')" class="btn-primary" style="font-size: 0.75rem; padding: 0.35rem 0.75rem; display: flex; align-items: center; gap: 0.35rem; background: #34D399; color: #0F172A; border: none; font-weight: 600;">
            <i data-lucide="rotate-ccw" style="width: 13px; height: 13px;"></i> Restore / Undo
          </button>
        </div>
      `;
    });
    itemsHtml += '</div>';
    container.innerHTML = itemsHtml;
    lucide.createIcons();
  } catch (err) {
    container.innerHTML = `<div style="color: #EF4444; font-size: 0.8rem; text-align: center; padding: 1.5rem;">${err.message}</div>`;
  }
}

function closeRecycleBinModal() {
  const modal = document.getElementById('recycleBinModalOverlay');
  if (modal) modal.style.display = 'none';
}

async function restoreRecycleBinItem(recId) {
  try {
    showGlobalLoading("Restoring deleted client & associated job posts...");
    const res = await fetch(`${API_BASE}/api/recycle-bin/${recId}/restore`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to restore item");
    }
    showAppNotification("Restored", "Client and associated job posts successfully restored.", "success");

    // Refresh all data & views across the entire CRM immediately!
    await initRemoteDatabase();
    await fetchAndRenderRecruitment();
    await fetchAllRecruitmentCandidates();

    if (typeof renderLeads === 'function') renderLeads();
    if (typeof renderSalesPipeline === 'function') renderSalesPipeline();
    if (typeof renderClientsKanban === 'function') renderClientsKanban();
    if (typeof populateRecruitmentFilters === 'function') populateRecruitmentFilters();
    if (typeof renderRecruitmentJobs === 'function') renderRecruitmentJobs();
    if (typeof renderCandidatePipeline === 'function') renderCandidatePipeline();
    if (typeof updateRecruitmentKPIs === 'function') updateRecruitmentKPIs();

    await openRecycleBinModal();
  } catch (err) {
    showAppNotification("Error", err.message, "danger");
  } finally {
    hideGlobalLoading();
  }
}

async function fetchAndRenderSystemHealthTerminal() {
  const dbElem = document.getElementById('sysHealthDb');
  const dbDetailElem = document.getElementById('sysHealthDbDetail');
  const storageElem = document.getElementById('sysHealthStorage');
  const storageDetailElem = document.getElementById('sysHealthStorageDetail');
  const cacheElem = document.getElementById('sysHealthCache');
  const cacheDetailElem = document.getElementById('sysHealthCacheDetail');
  const memoryElem = document.getElementById('sysHealthMemory');
  const uptimeElem = document.getElementById('sysHealthUptime');
  const logsElem = document.getElementById('sysTerminalLogs');
  const timeElem = document.getElementById('sysConsoleTime');

  if (!dbElem) return;

  try {
    const res = await fetch(`${API_BASE}/api/system/health`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error("Telemetry fetch failed");
    const data = await res.json();

    dbElem.innerText = data.database.isTurso ? "Turso LibSQL Cloud" : "Local SQLite (local.db)";
    dbDetailElem.innerText = data.database.isTurso ? "🟢 LibSQL Edge Sync Active" : "🟡 Local Development File";
    dbDetailElem.style.color = data.database.isTurso ? "#34D399" : "#FBBF24";

    storageElem.innerText = data.storage.isCloudinary ? "Cloudinary 25GB CDN" : (data.storage.isR2 ? "Cloudflare R2 10GB" : "Zlib Gzip DB Compression");
    storageDetailElem.innerText = data.storage.isCloudinary ? "🟢 Cloudinary 25 GB Free Active" : (data.storage.isR2 ? "🟢 Cloudflare R2 Active" : "⚡ 90%+ Zlib DB Fallback Active");
    storageDetailElem.style.color = data.storage.isCloudinary || data.storage.isR2 ? "#34D399" : "#38BDF8";

    cacheElem.innerText = data.cache.isRedis ? "Upstash Redis Edge" : "In-Memory Server TTL";
    cacheDetailElem.innerText = data.cache.isRedis ? "🟢 Sub-10ms Redis Edge Active" : "⚡ In-Memory Response Cache";
    cacheDetailElem.style.color = data.cache.isRedis ? "#34D399" : "#FBBF24";

    memoryElem.innerText = `Heap: ${data.memory.heapUsedMb} MB / RSS: ${data.memory.rssMb} MB`;
    const uptimeMins = Math.floor(data.uptimeSeconds / 60);
    uptimeElem.innerText = `Uptime: ${uptimeMins} mins (${data.uptimeSeconds}s)`;

    if (timeElem) timeElem.innerText = new Date().toLocaleTimeString();

    if (logsElem && Array.isArray(data.logs)) {
      logsElem.innerHTML = data.logs.map(log => {
        let color = '#94A3B8';
        if (log.level === 'SUCCESS') color = '#34D399';
        if (log.level === 'WARN') color = '#FBBF24';
        if (log.level === 'ERROR') color = '#F87171';
        return `<div style="color: ${color};">[${log.time}] [${log.level}] ${escapeHTML(log.msg)}</div>`;
      }).join('');
      logsElem.scrollTop = logsElem.scrollHeight;
    }
  } catch (err) {
    if (dbElem) dbElem.innerText = "Error Fetching Health";
    if (dbDetailElem) dbDetailElem.innerText = err.message;
  }
}

async function flushSystemCacheTerminal() {
  try {
    showGlobalLoading("Flushing Upstash Redis & System Cache...");
    const res = await fetch(`${API_BASE}/api/system/flush-cache`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Flush cache failed");

    showAppNotification("Cache Flushed", data.message, "success");
    await fetchAndRenderSystemHealthTerminal();
  } catch (err) {
    showAppNotification("Error", err.message, "danger");
  } finally {
    hideGlobalLoading();
  }
}

// ----------------------------------------------------
// SAAS CONTROL TUTORIALS MANAGEMENT
// ----------------------------------------------------
function renderSaasTutorials() {
  const tbody = document.getElementById('saasTutorialsTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';
  if (platformTutorials.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No tutorial resources published yet.</td></tr>`;
    return;
  }

  platformTutorials.forEach(tut => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="padding: 0.75rem; color: var(--text-primary); font-weight: 500;">
        <span class="file-format-badge" style="background: rgba(14, 165, 233, 0.08); color: var(--accent-blue); font-size: 0.65rem;">${escapeHTML(tut.crm_type)}</span>
      </td>
      <td style="padding: 0.75rem; color: var(--text-primary); font-size: 0.8rem; font-weight: 600;">${escapeHTML(tut.title)}</td>
      <td style="padding: 0.75rem; color: var(--text-muted); font-size: 0.7rem; font-family: monospace;">${escapeHTML(tut.video_url)}</td>
      <td style="padding: 0.75rem; text-align: right;">
        <div style="display: flex; gap: 0.35rem; justify-content: flex-end;">
          <button class="outreach-action-btn" onclick="openSaasTutorialModal('${tut.id}')" title="Edit Tutorial" style="color: var(--accent-blue); border-color: rgba(14, 165, 233, 0.2); background: rgba(14, 165, 233, 0.03);">
            <i data-lucide="edit-3" style="width: 12px; height: 12px;"></i>
          </button>
          <button class="outreach-action-btn" onclick="deleteTutorial('${tut.id}')" title="Remove Tutorial" style="color: #EF4444; border-color: rgba(239, 68, 68, 0.2); background: rgba(239, 68, 68, 0.03);">
            <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
  lucide.createIcons();
}

function openSaasTutorialModal(tutId = '') {
  document.getElementById('saasTutorialForm').reset();
  document.getElementById('editTutorialId').value = '';
  document.getElementById('saasTutorialModalTitle').innerHTML = `<i data-lucide="book-open" style="color: var(--accent-blue); width: 22px; height: 22px;"></i> Add Tutorial Resource`;

  if (tutId) {
    const tut = platformTutorials.find(t => t.id === tutId);
    if (tut) {
      document.getElementById('editTutorialId').value = tut.id;
      document.getElementById('tutorialTitle').value = tut.title;
      document.getElementById('tutorialVideoUrl').value = tut.video_url;
      document.getElementById('tutorialCrmType').value = tut.crm_type;
      document.getElementById('tutorialDescription').value = tut.description || '';
      document.getElementById('saasTutorialModalTitle').innerHTML = `<i data-lucide="edit" style="color: var(--accent-blue); width: 22px; height: 22px;"></i> Edit Tutorial Resource`;
    }
  }

  document.getElementById('saasTutorialModalOverlay').style.display = 'flex';
  lucide.createIcons();
}

function closeSaasTutorialModal() {
  document.getElementById('saasTutorialModalOverlay').style.display = 'none';
}

async function handleSaasTutorialSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('editTutorialId').value;
  const title = document.getElementById('tutorialTitle').value.trim();
  const videoUrl = document.getElementById('tutorialVideoUrl').value.trim();
  const crmType = document.getElementById('tutorialCrmType').value;
  const description = document.getElementById('tutorialDescription').value.trim();

  if (!title || !videoUrl || !crmType) {
    showAppNotification('Validation Error', 'Title, Video Link, and CRM Vertical are required.', 'warning');
    return;
  }

  const url = id ? `${API_BASE}/api/tutorials/${id}` : `${API_BASE}/api/tutorials`;
  const method = id ? 'PUT' : 'POST';

  try {
    showGlobalLoading("Saving tutorial resource...");
    const res = await fetch(url, {
      method,
      headers: getAuthHeaders(),
      body: JSON.stringify({ title, description, videoUrl, crmType })
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to save tutorial');
    }

    showAppNotification('Success', 'Tutorial resource saved successfully.', 'success');
    closeSaasTutorialModal();
    await initRemoteDatabase();
  } catch (err) {
    showAppNotification('Error', err.message, 'danger');
  } finally {
    hideGlobalLoading();
  }
}

function deleteTutorial(tutId) {
  showAppConfirm(
    "Confirm Deletion",
    "Are you sure you want to delete this tutorial? This action cannot be undone.",
    async () => {
      try {
        showGlobalLoading("Deleting tutorial...");
        const res = await fetch(`${API_BASE}/api/tutorials/${tutId}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to delete tutorial');
        }

        showAppNotification('Deleted', 'Tutorial resource removed successfully.', 'success');
        await initRemoteDatabase();
      } catch (err) {
        showAppNotification('Error', err.message, 'danger');
      } finally {
        hideGlobalLoading();
      }
    }
  );
}

// ----------------------------------------------------
// DYNAMIC TUTORIALS VIEWER (CLIENT END)
// ----------------------------------------------------
function renderTutorials() {
  const container = document.getElementById('tutorialsDynamicBody');
  if (!container) return;

  const docSections = [
    {
      id: "sec-dashboard",
      title: "📊 Executive Dashboard & Analytics",
      badge: "Core Feature",
      summary: "Understand real-time lead performance, pipeline conversion rates, and response metrics.",
      content: `
        <p>The <strong>Executive Dashboard</strong> provides a high-level overview of your organization's sales health and key performance metrics:</p>
        <ul>
          <li><strong>Total Leads:</strong> Count of all active leads registered across your workspace.</li>
          <li><strong>Response Time SLA:</strong> Tracks average agent response times for incoming inquiries.</li>
          <li><strong>Conversion Funnel:</strong> Real-time stage distribution (New Inquiries ➔ Contacted ➔ In Progress ➔ Closed Won).</li>
          <li><strong>Agent Performance:</strong> Leaderboard showing top-performing sales executives and closed deal volumes.</li>
        </ul>
      `
    },
    {
      id: "sec-leads",
      title: "📋 Leads Directory & Voice Import",
      badge: "Core Feature",
      summary: "Add leads via voice dictation, CSV bulk import, or manual form entry.",
      content: `
        <p>The <strong>Leads Directory</strong> allows you to manage, filter, and assign incoming customer leads:</p>
        <ul>
          <li><strong>Voice-to-Lead Input:</strong> Click the microphone icon in any input field to speak and automatically fill lead details.</li>
          <li><strong>Bulk CSV Import:</strong> Upload CSV files containing hundreds of leads instantly.</li>
          <li><strong>Multi-Column Filtering:</strong> Search leads by phone, email, status, source, or assigned sales agent.</li>
          <li><strong>Duplicate Prevention:</strong> Prevents duplicate lead emails or phone numbers from cluttering your CRM.</li>
        </ul>
      `
    },
    {
      id: "sec-pipeline",
      title: "🔀 Sales Pipeline & Kanban Board",
      badge: "Interactive Kanban",
      summary: "Visual drag-and-drop board for managing deal stages and follow-up schedules.",
      content: `
        <p>The <strong>Sales Pipeline</strong> uses an interactive Kanban interface to move deals across lifecycle stages:</p>
        <ul>
          <li><strong>Drag & Drop:</strong> Drag lead cards between stages (e.g. Move from 'New' to 'In Progress' or 'Won').</li>
          <li><strong>Auto-Followup Reminders:</strong> Set target follow-up dates to receive automated reminder alerts.</li>
          <li><strong>Deal Value & Custom Fields:</strong> Custom fields tailored to your industry (Property Type for Real Estate, CIBIL/Bank for DSA, ATS Score for Recruitment).</li>
        </ul>
      `
    },
    {
      id: "sec-outreach",
      title: "🤖 Auto Outreach & WhatsApp Center",
      badge: "Automation",
      summary: "Automated WhatsApp messages, email sequences, and AI follow-up reminders.",
      content: `
        <p>The <strong>Auto Outreach Center</strong> automates lead follow-ups across multiple communication channels:</p>
        <ul>
          <li><strong>WhatsApp 1-Click Launch:</strong> Sends personalized WhatsApp messages directly to clients with 1 click.</li>
          <li><strong>Bulk Email Sequences:</strong> Dispatch email campaigns directly using SMTP or Mail APIs.</li>
          <li><strong>Custom Reminder Templates:</strong> Edit reminder text templates inline before launching batch dispatches.</li>
        </ul>
      `
    },
    {
      id: "sec-recruitment",
      title: "💼 Recruitment CRM & ATS Score Engine",
      badge: "Recruitment Vertical",
      summary: "Job posting management, ATS resume score calculation, and interview scheduling.",
      content: `
        <p>The <strong>Recruitment CRM</strong> streamlines candidate sourcing and hiring workflows:</p>
        <ul>
          <li><strong>ATS Resume Score Engine:</strong> Automatically parses candidate skills and calculates match percentage against active job posts.</li>
          <li><strong>Public Career Portal:</strong> Generate shareable links for specific job posts to receive external applicant resumes directly into your CRM.</li>
          <li><strong>Interview Scheduler:</strong> Track upcoming candidate interview dates and Google Meet URLs.</li>
        </ul>
      `
    },
    {
      id: "sec-dsa",
      title: "🏦 Loan DSA Software CRM & Bank Commissions",
      badge: "Loan DSA Vertical",
      summary: "Loan EMI estimator, CIBIL credit score evaluator, and partner bank commission tracker.",
      content: `
        <p>The <strong>Loan DSA Software CRM</strong> is specialized for loan distributors and financial DSA partners:</p>
        <ul>
          <li><strong>Loan EMI & Eligibility Estimator:</strong> Calculate monthly EMIs, FOIR debt ratios, and minimum income requirements.</li>
          <li><strong>CIBIL Score Evaluator:</strong> Instant credit health gauge showing bank approval probabilities (HDFC, ICICI, SBI, Bajaj).</li>
          <li><strong>Bank Commissions Ledger:</strong> Track disbursed loan volumes, earned commission percentages, and bank payout clearance statuses.</li>
        </ul>
      `
    },
    {
      id: "sec-team",
      title: "👥 Team Roster & Role Permissions",
      badge: "Access Control",
      summary: "Manage CEO/Manager access, team member permissions, and agent passcodes.",
      content: `
        <p>The <strong>Team Roster</strong> section provides fine-grained access control for your team:</p>
        <ul>
          <li><strong>Role Hierarchy:</strong> Assign roles (Manager, Sales Executive, Admin) to restrict actions.</li>
          <li><strong>Custom Granular Checkboxes:</strong> Grant or revoke specific permissions (e.g. 'Can Delete Leads', 'Can Create Invoices', 'Can Access Recruitment').</li>
          <li><strong>Duplicate Validation:</strong> Prevents registering existing email addresses or phone numbers.</li>
        </ul>
      `
    },
    {
      id: "sec-sync",
      title: "⚙️ Sync Settings & Security PIN Lock",
      badge: "Security & Backup",
      summary: "Passcode protection, cloud database sync, and personal SMTP configurations.",
      content: `
        <p>The <strong>Sync Settings</strong> panel secures workspace preferences and data sync:</p>
        <ul>
          <li><strong>Passcode Lock PIN:</strong> Enter your 4+ digit security PIN to unlock sensitive settings.</li>
          <li><strong>Cloud Database Auto-Sync:</strong> Continuously backs up local CRM data to remote database storage.</li>
          <li><strong>SMTP Setup:</strong> Configure your custom outbound email credentials for outreach.</li>
        </ul>
      `
    }
  ];

  let html = `
    <!-- Interactive Video Walkthrough Player -->
    <div class="settings-card" style="padding: 1.5rem; margin-bottom: 1.5rem; border-color: var(--accent-blue);">
      <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.5rem; font-family: 'Outfit', sans-serif; display: flex; align-items: center; gap: 0.5rem;">
        <i data-lucide="play-circle" style="color: var(--accent-blue);"></i> Video Walkthrough & Interactive Demo
      </h3>
      <p style="font-size: 0.82rem; color: var(--text-secondary); margin-bottom: 1.25rem;">Watch our complete walkthrough video to master NeoGenCode CRM in under 5 minutes.</p>
      
      <div style="position: relative; padding-bottom: 45%; height: 0; overflow: hidden; border-radius: 12px; background: #000; border: 1px solid var(--border-color);">
        <iframe style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;" src="https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0" title="NeoGenCode CRM Tutorial Video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
      </div>
    </div>

    <!-- Documentation Dropdown Accordion Section -->
    <div class="settings-card" style="padding: 1.5rem;">
      <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.5rem; font-family: 'Outfit', sans-serif; display: flex; align-items: center; gap: 0.5rem;">
        <i data-lucide="book-open" style="color: var(--accent-purple);"></i> CRM Module Documentation & Setup Guide
      </h3>
      <p style="font-size: 0.82rem; color: var(--text-secondary); margin-bottom: 1.5rem;">Click on any section header below to expand detailed instructions and setup guidance.</p>

      <div style="display: flex; flex-direction: column; gap: 0.85rem;">
  `;

  docSections.forEach((sec, idx) => {
    html += `
      <div style="border: 1px solid var(--border-color); border-radius: 10px; overflow: hidden; background: rgba(30, 41, 59, 0.4);">
        <button type="button" onclick="toggleDocAccordion('${sec.id}')" style="width: 100%; padding: 1rem 1.25rem; background: transparent; border: none; text-align: left; cursor: pointer; display: flex; justify-content: space-between; align-items: center; gap: 1rem; color: var(--text-primary);">
          <div>
            <div style="font-size: 0.95rem; font-weight: 700; font-family: 'Outfit', sans-serif; display: flex; align-items: center; gap: 0.5rem;">
              <span>${sec.title}</span>
              <span class="file-format-badge" style="background: rgba(14, 165, 233, 0.1); color: var(--accent-blue); font-size: 0.65rem;">${sec.badge}</span>
            </div>
            <div style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 0.2rem;">${sec.summary}</div>
          </div>
          <i data-lucide="chevron-down" id="acc-icon-${sec.id}" style="width: 18px; height: 18px; color: var(--text-muted); transition: transform 0.3s ease;"></i>
        </button>
        <div id="acc-body-${sec.id}" style="display: none; padding: 0 1.25rem 1.25rem 1.25rem; border-top: 1px solid rgba(255,255,255,0.05); font-size: 0.84rem; color: var(--text-secondary); line-height: 1.6;">
          ${sec.content}
        </div>
      </div>
    `;
  });

  html += `
      </div>
    </div>
  `;

  container.innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function toggleDocAccordion(id) {
  const body = document.getElementById(`acc-body-${id}`);
  const icon = document.getElementById(`acc-icon-${id}`);
  if (body) {
    const isHidden = body.style.display === 'none';
    body.style.display = isHidden ? 'block' : 'none';
    if (icon) icon.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
  }
}

// ----------------------------------------------------
// PUBLIC CAREERS PORTAL & RECRUITER REVIEW ACTIONS
// ----------------------------------------------------
function copyCareersPortalLink() {
  const tenantId = (companyInfo && companyInfo.id) || (currentUser && currentUser.tenantId);
  if (!tenantId) {
    showAppNotification('Error', 'Company identifier not loaded yet.', 'danger');
    return;
  }
  const url = `${window.location.origin}/careers.html?companyId=${tenantId}`;
  navigator.clipboard.writeText(url).then(() => {
    showAppNotification('Link Copied', 'Public careers portal link copied to clipboard!', 'success');
  }).catch(() => {
    // fallback
    showAppAlert('Careers Portal Link', `Copy the following link:\n\n${url}`);
  });
}

function copyClientEnquiryLink() {
  const tenantId = (companyInfo && companyInfo.id) || (currentUser && currentUser.tenantId);
  if (!tenantId) {
    showAppNotification('Error', 'Company identifier not loaded yet.', 'danger');
    return;
  }
  const url = `${window.location.origin}/enquiry.html?companyId=${tenantId}`;
  navigator.clipboard.writeText(url).then(() => {
    showAppNotification('Link Copied', 'Public Client Enquiry Portal link copied to clipboard!', 'success');
  }).catch(() => {
    // fallback
    showAppAlert('Client Enquiry Portal Link', `Copy the following link:\n\n${url}`);
  });
}

function copySpecificJobDirectLink(jobId) {
  const tenantId = (companyInfo && companyInfo.id) || (currentUser && currentUser.tenantId);
  if (!tenantId) {
    showAppNotification('Error', 'Company identifier not loaded yet.', 'danger');
    return;
  }
  const url = `${window.location.origin}/careers.html?companyId=${tenantId}&jobId=${jobId}`;
  navigator.clipboard.writeText(url).then(() => {
    showAppNotification('Job Link Copied!', `Direct URL for Job ID ${jobId} copied to clipboard!\n\nYou can now post this link directly on LinkedIn, WhatsApp, or Job Boards.`, 'success');
  }).catch(() => {
    showAppAlert('Direct Job Link', `Copy the following link to post on LinkedIn/Social Media:\n\n${url}`);
  });
}

let recruitmentApplications = [];

async function fetchAndRenderApplications() {
  const tbody = document.getElementById('appliedJobSeekersTableBody');
  if (!tbody) return;

  try {
    const res = await fetch(`${API_BASE}/api/job-applications`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error("Failed to fetch applications queue.");
    recruitmentApplications = await res.json();

    tbody.innerHTML = '';
    if (recruitmentApplications.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem; font-size: 0.8rem;">No pending job applications. Close more deals or share your careers portal link to get applicants!</td></tr>`;
      return;
    }

    recruitmentApplications.forEach(app => {
      // Find matching job name
      const job = recruitmentJobs.find(j => String(j.id) === String(app.job_id));
      const jobName = job ? job.title : 'General / Direct Pool';
      const formattedDate = new Date(app.created_at).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding: 0.75rem; color: var(--text-secondary); font-size: 0.75rem;">${escapeHTML(formattedDate)}</td>
        <td style="padding: 0.75rem; color: var(--text-primary); font-size: 0.8rem; font-weight: 600;">
          <span class="file-format-badge" style="background: rgba(139, 92, 246, 0.08); color: var(--accent-purple); font-size: 0.65rem;">${escapeHTML(jobName)}</span>
          <div style="font-size: 0.7rem; color: var(--text-muted); font-family: monospace; margin-top: 2px;">ID: ${escapeHTML(app.job_id)}</div>
          ${app.reference ? `<div style="font-size: 0.7rem; color: var(--accent-blue); font-weight: 600; margin-top: 1px;">Ref: ${escapeHTML(app.reference)}</div>` : ''}
        </td>
        <td style="padding: 0.75rem;">
          <div style="font-weight: 700; color: var(--text-primary); font-size: 0.8rem;">${escapeHTML(app.name)}</div>
          <div style="font-size: 0.72rem; color: var(--text-secondary);">${escapeHTML(app.email)} | ${escapeHTML(app.phone || 'N/A')}</div>
        </td>
        <td style="padding: 0.75rem; color: var(--text-secondary); font-size: 0.78rem; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHTML(app.cover_note || '')}">
          ${escapeHTML(app.cover_note || 'N/A')}
        </td>
        <td style="padding: 0.75rem;">
          ${app.resume_name ? `
            <button class="outreach-action-btn" onclick="downloadApplicationResume('${app.id}')" title="Download Resume" style="color: var(--accent-blue); border-color: rgba(14, 165, 233, 0.2); background: rgba(14, 165, 233, 0.03); font-size: 0.72rem; padding: 2px 6px;">
              <i data-lucide="download" style="width: 11px; height: 11px; margin-right: 2px;"></i> ${escapeHTML(app.resume_name)}
            </button>
          ` : '<span style="color: var(--text-muted); font-size: 0.72rem;">No Resume</span>'}
        </td>
        <td style="padding: 0.75rem; text-align: right;">
          <div style="display: flex; gap: 0.35rem; justify-content: flex-end;">
            <button class="btn-primary" onclick="acceptJobApplication('${app.id}')" title="Accept Candidate" style="padding: 0.3rem 0.6rem; font-size: 0.72rem; background: var(--accent-green); border-color: var(--accent-green); display: flex; align-items: center; gap: 0.25rem;">
              <i data-lucide="check" style="width: 12px; height: 12px;"></i> Accept
            </button>
            <button class="btn-secondary" onclick="rejectJobApplication('${app.id}')" title="Reject Candidate" style="padding: 0.3rem 0.6rem; font-size: 0.72rem; color: #EF4444; border-color: rgba(239, 68, 68, 0.2); background: rgba(239, 68, 68, 0.03); display: flex; align-items: center; gap: 0.25rem;">
              <i data-lucide="x" style="width: 12px; height: 12px;"></i> Reject
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
    lucide.createIcons();
  } catch (err) {
    console.error("fetchAndRenderApplications error:", err);
  }
}

async function downloadApplicationResume(appId) {
  try {
    showGlobalLoading("Retrieving resume...");
    const res = await fetch(`${API_BASE}/api/job-applications/${appId}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error("Failed to load application details.");
    const app = await res.json();
    if (app.resume_base64) {
      const link = document.createElement('a');
      link.href = app.resume_base64;
      link.download = app.resume_name || 'resume.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      showAppNotification('Warning', 'No resume attached to this application.', 'warning');
    }
  } catch (err) {
    showAppNotification('Error', err.message, 'danger');
  } finally {
    hideGlobalLoading();
  }
}

// ----------------------------------------------------
// LOAN DSA SOFTWARE CRM FUNCTIONS
// ----------------------------------------------------
function updateLoanCalc() {
  const amtRange = document.getElementById('calcLoanAmtRange');
  const amtInput = document.getElementById('calcLoanAmtInput');
  const amtDisplay = document.getElementById('calcLoanAmtDisplay');

  const rateRange = document.getElementById('calcRateRange');
  const rateInput = document.getElementById('calcRateInput');
  const rateDisplay = document.getElementById('calcRateDisplay');

  const tenureRange = document.getElementById('calcTenureRange');
  const tenureInput = document.getElementById('calcTenureInput');
  const tenureDisplay = document.getElementById('calcTenureDisplay');

  if (!amtRange || !rateRange || !tenureRange) return;

  const principal = parseFloat(amtRange.value) || 2500000;
  const annualRate = parseFloat(rateRange.value) || 9.5;
  const tenureYears = parseInt(tenureRange.value) || 20;

  if (amtInput) amtInput.value = principal;
  if (rateInput) rateInput.value = annualRate;
  if (tenureInput) tenureInput.value = tenureYears;

  if (amtDisplay) amtDisplay.textContent = `₹ ${principal.toLocaleString('en-IN')}`;
  if (rateDisplay) rateDisplay.textContent = `${annualRate}%`;
  if (tenureDisplay) tenureDisplay.textContent = `${tenureYears} Years`;

  // EMI Formula: P * r * (1+r)^n / ((1+r)^n - 1)
  const monthlyRate = annualRate / 12 / 100;
  const totalMonths = tenureYears * 12;

  let emi = 0;
  if (monthlyRate > 0) {
    emi = Math.round((principal * monthlyRate * Math.pow(1 + monthlyRate, totalMonths)) / (Math.pow(1 + monthlyRate, totalMonths) - 1));
  } else {
    emi = Math.round(principal / totalMonths);
  }

  const totalPayment = emi * totalMonths;
  const totalInterest = Math.max(0, totalPayment - principal);
  const minNetIncome = Math.round(emi / 0.5); // FOIR 50%

  const emiEl = document.getElementById('calcEmiResult');
  const interestEl = document.getElementById('calcInterestResult');
  const incomeEl = document.getElementById('calcIncomeResult');
  const totalPayEl = document.getElementById('calcTotalPaymentResult');

  if (emiEl) emiEl.textContent = `₹ ${emi.toLocaleString('en-IN')}`;
  if (interestEl) interestEl.textContent = `₹ ${totalInterest.toLocaleString('en-IN')}`;
  if (incomeEl) incomeEl.textContent = `₹ ${minNetIncome.toLocaleString('en-IN')} / month`;
  if (totalPayEl) totalPayEl.textContent = `₹ ${totalPayment.toLocaleString('en-IN')}`;
}

function updateLoanCalcFromInput() {
  const amtRange = document.getElementById('calcLoanAmtRange');
  const amtInput = document.getElementById('calcLoanAmtInput');

  const rateRange = document.getElementById('calcRateRange');
  const rateInput = document.getElementById('calcRateInput');

  const tenureRange = document.getElementById('calcTenureRange');
  const tenureInput = document.getElementById('calcTenureInput');

  if (amtRange && amtInput) amtRange.value = amtInput.value;
  if (rateRange && rateInput) rateRange.value = rateInput.value;
  if (tenureRange && tenureInput) tenureRange.value = tenureInput.value;

  updateLoanCalc();
}

function renderLoanPayouts() {
  const tbody = document.getElementById('loanPayoutsTableBody');
  const volEl = document.getElementById('dsaTotalDisbursedVolume');
  const commEl = document.getElementById('dsaTotalEarnedCommission');
  const pendingEl = document.getElementById('dsaPendingClearance');
  const rcvdEl = document.getElementById('dsaReceivedClearance');

  if (!tbody) return;

  const targetTenantId = currentUser.role === 'Super Admin' ? activeTenantId : currentUser.tenantId;
  const dsaLeads = leads.filter(l => (targetTenantId === 'all' || l.tenantId === targetTenantId));

  let totalDisbursed = 0;
  let totalCommission = 0;
  let pendingCommission = 0;
  let receivedCommission = 0;

  const wonLeads = dsaLeads.filter(l => l.status === 'won');

  tbody.innerHTML = '';

  if (wonLeads.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2.5rem; font-size: 0.85rem;">No disbursed loan records found. Close won loan deals to track bank payouts!</td></tr>`;
  } else {
    wonLeads.forEach(lead => {
      let customFields = {};
      try {
        if (lead.summary) {
          const parts = lead.summary.split('--- Industry Specific Details ---');
          if (parts[1]) {
            const lines = parts[1].trim().split('\n');
            lines.forEach(line => {
              const [k, v] = line.split(':');
              if (k && v) customFields[k.trim()] = v.trim();
            });
          }
        }
      } catch(e) {}

      const loanAmt = parseFloat((customFields['loanAmt'] || '2500000').replace(/[^0-9.]/g, '')) || 2500000;
      const payoutPct = parseFloat((customFields['payoutPercent'] || '1.8').replace(/[^0-9.]/g, '')) || 1.8;
      const commissionRupees = Math.round((loanAmt * payoutPct) / 100);
      const partnerBank = customFields['loanBank'] || 'HDFC Bank';
      const loanCat = customFields['loanType'] || 'Personal Loan';

      totalDisbursed += loanAmt;
      totalCommission += commissionRupees;
      
      const isPaid = (lead.payoutStatus === 'paid');
      if (isPaid) {
        receivedCommission += commissionRupees;
      } else {
        pendingCommission += commissionRupees;
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight: 700; color: var(--text-primary);">${escapeHTML(lead.name)}</td>
        <td><span class="file-format-badge" style="background: rgba(168, 85, 247, 0.08); color: var(--accent-purple); font-size: 0.65rem;">${escapeHTML(loanCat)}</span></td>
        <td style="font-weight: 600; color: var(--accent-blue);">${escapeHTML(partnerBank)}</td>
        <td style="font-weight: 700;">₹ ${loanAmt.toLocaleString('en-IN')}</td>
        <td><span style="color: var(--status-inprogress); font-weight: 600;">${payoutPct}%</span></td>
        <td style="font-weight: 800; color: var(--status-won);">₹ ${commissionRupees.toLocaleString('en-IN')}</td>
        <td>
          <button onclick="toggleDsaPayoutStatus('${lead.id}', '${isPaid ? 'pending' : 'paid'}')" class="status-badge ${isPaid ? 'won' : 'inprogress'}" style="cursor: pointer; border: none;">
            ${isPaid ? 'Paid to Account' : 'Pending Bank Clearance'}
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  if (volEl) volEl.textContent = `₹ ${totalDisbursed.toLocaleString('en-IN')}`;
  if (commEl) commEl.textContent = `₹ ${totalCommission.toLocaleString('en-IN')}`;
  if (pendingEl) pendingEl.textContent = `₹ ${pendingCommission.toLocaleString('en-IN')}`;
  if (rcvdEl) rcvdEl.textContent = `₹ ${receivedCommission.toLocaleString('en-IN')}`;
}

async function toggleDsaPayoutStatus(leadId, newStatus) {
  try {
    const lead = leads.find(l => String(l.id) === String(leadId));
    if (lead) {
      lead.payoutStatus = newStatus;
      renderLoanPayouts();
      showAppNotification('Payout Status Updated', `Commission clearance status updated to ${newStatus.toUpperCase()}`, 'success');
      if (currentUser) {
        fetch(`${API_BASE}/api/leads/${lead.id}`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify(lead)
        }).catch(err => console.error("Failed to sync payout status change:", err));
      }
    }
  } catch(e) {}
}

function loadSampleDsaDisbursements() {
  const targetTenantId = currentUser.role === 'Super Admin' ? (activeTenantId === 'all' ? 'company-1' : activeTenantId) : currentUser.tenantId;

  const samples = [
    { name: "Deepanshu Kumar", loanType: "Home Loan", bank: "HDFC Bank", amount: 6500000, pct: 1.8, status: "paid" },
    { name: "Priya Sharma", loanType: "Personal Loan", bank: "ICICI Bank", amount: 1200000, pct: 2.2, status: "pending" },
    { name: "Vikram Malhotra", loanType: "Business Loan", bank: "State Bank of India (SBI)", amount: 8500000, pct: 1.5, status: "paid" },
    { name: "Ananya Roy", loanType: "Loan Against Property (LAP)", bank: "Bajaj Finserv", amount: 4500000, pct: 2.0, status: "pending" }
  ];

  samples.forEach((s, index) => {
    const newLead = {
      id: "dsa_sample_" + Date.now() + "_" + index,
      name: s.name,
      designation: "Salaried",
      phone: "+91 98765 4" + Math.floor(1000 + Math.random() * 9000),
      email: s.name.toLowerCase().replace(/\s+/g, '') + "@example.com",
      status: "won",
      assignedAgent: currentUser ? currentUser.name : "Sales Agent",
      lastFollowUp: getRelativeDateString(0),
      nextFollowUp: "",
      tenantId: targetTenantId,
      payoutStatus: s.status,
      summary: `Sample Loan Disbursement\n--- Industry Specific Details ---\nloanType: ${s.loanType}\nloanAmt: ${s.amount}\nloanBank: ${s.bank}\npayoutPercent: ${s.pct}\n`
    };
    leads.unshift(newLead);
  });

  saveLeadsToStorage();
  renderLoanPayouts();
  showAppNotification('Sample Disbursed Loans Added', 'Loaded 4 sample loan disbursement records into your Bank Commissions Tracker!', 'success');
}

function openDisbursementModal() {
  const modal = document.getElementById('disbursementModalOverlay');
  if (modal) {
    modal.style.display = 'flex';
    document.getElementById('disbClientName').value = '';
    document.getElementById('disbAmount').value = '';
    if (window.lucide) window.lucide.createIcons();
  }
}

function closeDisbursementModal() {
  const modal = document.getElementById('disbursementModalOverlay');
  if (modal) modal.style.display = 'none';
}

function handleDisbursementSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('disbClientName').value.trim();
  const loanType = document.getElementById('disbLoanCategory').value;
  const bank = document.getElementById('disbPartnerBank').value;
  const amount = parseFloat(document.getElementById('disbAmount').value) || 0;
  const pct = parseFloat(document.getElementById('disbPayoutPct').value) || 1.8;
  const status = document.getElementById('disbClearanceStatus').value;

  if (!name || amount <= 0) return;

  const targetTenantId = currentUser.role === 'Super Admin' ? (activeTenantId === 'all' ? 'company-1' : activeTenantId) : currentUser.tenantId;

  const newLead = {
    id: "disb_" + Date.now(),
    name: name,
    designation: "Borrower",
    phone: "+91 98000 00000",
    email: name.toLowerCase().replace(/\s+/g, '') + "@client.com",
    status: "won",
    assignedAgent: currentUser ? currentUser.name : "Sales Agent",
    lastFollowUp: getRelativeDateString(0),
    nextFollowUp: "",
    tenantId: targetTenantId,
    payoutStatus: status,
    summary: `Manual Loan Disbursement Record\n--- Industry Specific Details ---\nloanType: ${loanType}\nloanAmt: ${amount}\nloanBank: ${bank}\npayoutPercent: ${pct}\n`
  };

  leads.unshift(newLead);
  saveLeadsToStorage();

  if (currentUser) {
    fetch(`${API_BASE}/api/leads`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(newLead)
    }).catch(err => console.error("Failed to sync new disbursement:", err));
  }

  closeDisbursementModal();
  renderLoanPayouts();
  showAppNotification('Disbursement Recorded', `Added ₹ ${amount.toLocaleString('en-IN')} loan disbursement record for ${name}.`, 'success');
}

// ----------------------------------------------------
// CIBIL SCORE EVALUATOR & CREDIT ASSESSMENT FUNCTIONS
// ----------------------------------------------------
function calculateCibilHealth() {
  const income = parseFloat(document.getElementById('cibilMonthlyIncome')?.value) || 85000;
  const emi = parseFloat(document.getElementById('cibilExistingEmi')?.value) || 15000;
  const defaults = parseInt(document.getElementById('cibilDefaults')?.value) || 0;
  const utilization = parseInt(document.getElementById('cibilUtilization')?.value) || 20;

  // Base score 750
  let score = 750;

  // FOIR ratio (EMI / Income)
  const foir = Math.round((emi / (income || 1)) * 100);

  if (foir > 60) score -= 65;
  else if (foir > 40) score -= 25;
  else score += 20;

  if (defaults === 3) score -= 140;
  else if (defaults === 1) score -= 45;
  else score += 25;

  if (utilization >= 80) score -= 50;
  else if (utilization <= 30) score += 15;

  score = Math.min(880, Math.max(450, score));

  let statusText = "Excellent";
  let statusClass = "won";
  let color = "#34D399";

  if (score >= 750) {
    statusText = "Excellent";
    statusClass = "won";
    color = "#34D399";
  } else if (score >= 680) {
    statusText = "Good";
    statusClass = "inprogress";
    color = "#FBBF24";
  } else {
    statusText = "Poor / High Risk";
    statusClass = "lost";
    color = "#F87171";
  }

  const scoreEl = document.getElementById('cibilScoreDisplay');
  const badgeEl = document.getElementById('cibilStatusBadge');
  const barEl = document.getElementById('cibilGaugeBar');
  const foirEl = document.getElementById('cibilFoirResult');
  const maxLoanEl = document.getElementById('cibilMaxLoanResult');
  const probGrid = document.getElementById('cibilBankProbGrid');

  if (scoreEl) {
    scoreEl.textContent = score;
    scoreEl.style.color = color;
  }
  if (badgeEl) {
    badgeEl.textContent = statusText;
    badgeEl.className = `status-badge ${statusClass}`;
  }
  if (barEl) {
    const pct = Math.round(((score - 300) / 600) * 100);
    barEl.style.width = `${pct}%`;
  }

  const netIncomeLeft = Math.max(0, (income * 0.5) - emi);
  const maxLoanEligible = Math.round(netIncomeLeft * 60);

  if (foirEl) foirEl.textContent = `${foir}% (${foir > 50 ? 'High Debt' : 'Low Risk'})`;
  if (maxLoanEl) maxLoanEl.textContent = `₹ ${maxLoanEligible.toLocaleString('en-IN')}`;

  if (probGrid) {
    const banks = [
      { name: "HDFC Bank", reqScore: 750, pct: score >= 750 ? 95 : (score >= 680 ? 70 : 35) },
      { name: "ICICI Bank", reqScore: 720, pct: score >= 720 ? 92 : (score >= 680 ? 68 : 30) },
      { name: "SBI Bank", reqScore: 740, pct: score >= 740 ? 88 : (score >= 680 ? 60 : 25) },
      { name: "Bajaj Finserv", reqScore: 680, pct: score >= 680 ? 98 : 55 }
    ];

    probGrid.innerHTML = banks.map(b => `
      <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 8px; padding: 0.6rem; text-align: center;">
        <div style="font-size: 0.72rem; font-weight: 700; color: var(--text-primary);">${b.name}</div>
        <div style="font-size: 0.9rem; font-weight: 800; color: ${b.pct >= 80 ? '#34D399' : (b.pct >= 60 ? '#FBBF24' : '#F87171')}; margin-top: 2px;">${b.pct}% Odds</div>
      </div>
    `).join('');
  }
}

function convertCibilCheckToLead() {
  const name = document.getElementById('cibilApplicantName')?.value.trim() || 'Rahul Sharma';
  const pan = document.getElementById('cibilPanNumber')?.value.trim() || 'ABCDE1234F';
  const income = document.getElementById('cibilMonthlyIncome')?.value || '85000';
  const score = document.getElementById('cibilScoreDisplay')?.textContent || '785';

  openLeadModal(null, false);

  setTimeout(() => {
    const nameInput = document.getElementById('leadName');
    if (nameInput) nameInput.value = name;

    const customPan = document.getElementById('custom_field_cibilScore');
    if (customPan) customPan.value = `${score}+ (Evaluated PAN: ${pan.toUpperCase()})`;

    const customIncome = document.getElementById('custom_field_loanIncome');
    if (customIncome) customIncome.value = income;

    showAppNotification('Credit Data Imported', `Pre-filled lead modal with ${name}'s evaluated CIBIL Score (${score}).`, 'success');
  }, 300);
}

function acceptJobApplication(appId) {
  showAppConfirm(
    "Accept Job Seeker",
    "Accepting this applicant will automatically clone their details into your active Candidate Pipeline under the selected Job Post. Proceed?",
    async () => {
      try {
        showGlobalLoading("Accepting application and promoting to pipeline...");
        const res = await fetch(`${API_BASE}/api/job-applications/${appId}/accept`, {
          method: 'POST',
          headers: getAuthHeaders()
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to accept application.');
        }

        showAppNotification('Success', 'Applicant successfully imported into candidate recruitment pipeline!', 'success');
        
        // Refresh recruitment data
        await initRemoteDatabase();
        await fetchAndRenderRecruitment();
      } catch (err) {
        showAppNotification('Error', err.message, 'danger');
      } finally {
        hideGlobalLoading();
      }
    }
  );
}

function rejectJobApplication(appId) {
  showAppConfirm(
    "Reject Job Seeker",
    "Are you sure you want to reject this applicant? This will remove their application from the queue. This action cannot be undone.",
    async () => {
      try {
        showGlobalLoading("Rejecting application...");
        const res = await fetch(`${API_BASE}/api/job-applications/${appId}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to reject application.');
        }

        showAppNotification('Rejected', 'Application dismissed successfully.', 'success');
        
        // Refresh recruitment data
        await initRemoteDatabase();
        await fetchAndRenderRecruitment();
      } catch (err) {
        showAppNotification('Error', err.message, 'danger');
      } finally {
        hideGlobalLoading();
      }
    }
  );
}

// ----------------------------------------------------------------
// REFERRALS & REWARDS SYSTEM
// ----------------------------------------------------------------

async function renderReferralView() {
  try {
    showGlobalLoading("Loading referrals profile...");
    
    // 1. Get company plan status
    const compRes = await fetch(`${API_BASE}/api/companies/info`, { headers: getAuthHeaders() });
    if (!compRes.ok) throw new Error("Failed to load company details.");
    
    const company = await compRes.json();
    const isFree = !company.plan || company.plan.toLowerCase() === 'free';
    
    if (isFree) {
      document.getElementById('referralLockedPanel').style.display = 'flex';
      document.getElementById('referralActivePanel').style.display = 'none';
      hideGlobalLoading();
      return;
    }
    
    document.getElementById('referralLockedPanel').style.display = 'none';
    document.getElementById('referralActivePanel').style.display = 'flex';
    
    // 2. Load referral profile
    const refRes = await fetch(`${API_BASE}/api/referrals/my-profile`, { headers: getAuthHeaders() });
    if (!refRes.ok) throw new Error("Failed to load referral details.");
    
    const data = await refRes.json();
    
    // Populate points
    document.getElementById('referralPointsDisplay').innerText = data.referralPoints || 0;
    
    // Populate code generation panel
    if (data.referralCode) {
      document.getElementById('referralCodeLockedState').style.display = 'none';
      document.getElementById('referralCodeActiveState').style.display = 'flex';
      
      const refLink = window.location.origin + '/checkout?ref=' + encodeURIComponent(data.referralCode);
      document.getElementById('referralLinkInput').value = refLink;
      document.getElementById('referralCodeText').innerText = data.referralCode;
    } else {
      document.getElementById('referralCodeLockedState').style.display = 'block';
      document.getElementById('referralCodeActiveState').style.display = 'none';
    }
    
    // Populate conversions table
    const convTbody = document.getElementById('referralConversionsTableBody');
    if (convTbody) {
      if (data.conversions && data.conversions.length > 0) {
        convTbody.innerHTML = data.conversions.map(c => `
          <tr>
            <td style="padding: 0.75rem;">${c.referred_email}</td>
            <td style="padding: 0.75rem;">${c.plan_purchased}</td>
            <td style="padding: 0.75rem; text-align: right;">₹${parseFloat(c.amount_paid).toLocaleString('en-IN')}</td>
            <td style="padding: 0.75rem; text-align: center; color: var(--accent-purple); font-weight: 700;">+${c.points_awarded}</td>
            <td style="padding: 0.75rem;">${c.created_date}</td>
          </tr>
        `).join('');
      } else {
        convTbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No successful referrals recorded yet.</td></tr>`;
      }
    }
    
    // Populate redemptions table
    const redTbody = document.getElementById('referralRedemptionsTableBody');
    if (redTbody) {
      if (data.redemptions && data.redemptions.length > 0) {
        redTbody.innerHTML = data.redemptions.map(r => `
          <tr>
            <td style="padding: 0.75rem;">${r.id}</td>
            <td style="padding: 0.75rem; text-align: center; font-weight: 700;">${r.points}</td>
            <td style="padding: 0.75rem; text-align: center;">
              <span class="status-badge ${r.status.toLowerCase() === 'approved' ? 'won' : (r.status.toLowerCase() === 'rejected' ? 'lost' : 'inprogress')}">
                ${r.status}
              </span>
            </td>
            <td style="padding: 0.75rem;">${r.created_date}</td>
          </tr>
        `).join('');
      } else {
        redTbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No redemption requests made yet.</td></tr>`;
      }
    }
    
    // Refresh lucide icons
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons();
    }
  } catch (err) {
    showAppNotification('Error', err.message, 'danger');
  } finally {
    hideGlobalLoading();
  }
}

async function generateReferralCode() {
  try {
    showGlobalLoading("Generating code...");
    const res = await fetch(`${API_BASE}/api/referrals/generate`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to generate code.');
    }
    
    showAppNotification('Success', 'Unique referral code and link generated!', 'success');
    await renderReferralView();
  } catch (err) {
    showAppNotification('Error', err.message, 'danger');
  } finally {
    hideGlobalLoading();
  }
}

function copyReferralLink() {
  const input = document.getElementById('referralLinkInput');
  if (!input) return;
  
  input.select();
  input.setSelectionRange(0, 99999); // Mobile
  
  navigator.clipboard.writeText(input.value)
    .then(() => {
      showAppNotification('Copied', 'Referral link copied to clipboard!', 'success');
    })
    .catch(() => {
      showAppNotification('Error', 'Failed to copy link.', 'danger');
    });
}

function openRedeemModal() {
  const points = parseInt(document.getElementById('referralPointsDisplay').innerText) || 0;
  
  if (points <= 0) {
    showAppNotification('Action Blocked', 'You do not have any points to redeem.', 'danger');
    return;
  }
  
  document.getElementById('redeemPointsBalanceLabel').innerText = `${points} pts`;
  document.getElementById('redeemPointsAmountInput').value = points;
  document.getElementById('redeemPointsAmountInput').max = points;
  document.getElementById('redeemPointsModalOverlay').style.display = 'flex';
}

function closeRedeemModal() {
  document.getElementById('redeemPointsModalOverlay').style.display = 'none';
}

async function submitRedeemPoints(e) {
  e.preventDefault();
  const amtInput = document.getElementById('redeemPointsAmountInput');
  const points = parseInt(amtInput.value);
  
  if (isNaN(points) || points <= 0) {
    showAppNotification('Invalid Input', 'Please enter a valid amount of points.', 'danger');
    return;
  }

  try {
    showGlobalLoading("Submitting request...");
    const res = await fetch(`${API_BASE}/api/referrals/redeem`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ points })
    });
    
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to request redemption.');
    }
    
    showAppNotification('Success', `Redemption request for ${points} pts submitted successfully!`, 'success');
    closeRedeemModal();
    await renderReferralView();
  } catch (err) {
    showAppNotification('Error', err.message, 'danger');
  } finally {
    hideGlobalLoading();
  }
}


// ----------------------------------------------------------------
// SUPER ADMIN MARKETING & COUPONS HANDLERS
// ----------------------------------------------------------------

async function loadSuperAdminCoupons() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/coupons`, { headers: getAuthHeaders() });
    if (res.ok) {
      const data = await res.json();
      
      if (document.getElementById('couponCodeInput1')) {
        document.getElementById('couponCodeInput1').value = data.coupon_code_1 || '';
        document.getElementById('couponDiscountInput1').value = data.coupon_discount_1 || '0';
        document.getElementById('couponCodeInput2').value = data.coupon_code_2 || '';
        document.getElementById('couponDiscountInput2').value = data.coupon_discount_2 || '0';
        document.getElementById('couponCodeInput3').value = data.coupon_code_3 || '';
        document.getElementById('couponDiscountInput3').value = data.coupon_discount_3 || '0';
        document.getElementById('globalRefDiscountInput').value = data.global_ref_discount_pct || '20';
      }
    }
  } catch (err) {
    console.error("Load coupons error:", err);
  }
}

async function saveGlobalCoupons(e) {
  e.preventDefault();
  
  const payload = {
    coupon_code_1: document.getElementById('couponCodeInput1').value.trim(),
    coupon_discount_1: parseInt(document.getElementById('couponDiscountInput1').value) || 0,
    coupon_code_2: document.getElementById('couponCodeInput2').value.trim(),
    coupon_discount_2: parseInt(document.getElementById('couponDiscountInput2').value) || 0,
    coupon_code_3: document.getElementById('couponCodeInput3').value.trim(),
    coupon_discount_3: parseInt(document.getElementById('couponDiscountInput3').value) || 0,
    global_ref_discount_pct: parseInt(document.getElementById('globalRefDiscountInput').value) || 20
  };

  try {
    showGlobalLoading("Saving coupons configuration...");
    const res = await fetch(`${API_BASE}/api/admin/coupons`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to save coupon configuration.');
    }
    
    showAppNotification('Success', 'Global coupon settings updated successfully.', 'success');
  } catch (err) {
    showAppNotification('Error', err.message, 'danger');
  } finally {
    hideGlobalLoading();
  }
}

async function loadSuperAdminReferrals() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/referrals`, { headers: getAuthHeaders() });
    if (!res.ok) return;
    
    const data = await res.json();
    
    // Render active referrers
    const referrersTbody = document.getElementById('saasActiveReferrersTableBody');
    if (referrersTbody) {
      if (data.users && data.users.length > 0) {
        referrersTbody.innerHTML = data.users.map(u => `
          <tr>
            <td style="padding: 0.5rem; text-align: left;">
              <div style="font-weight: 600;">${u.name}</div>
              <div style="font-size: 0.7rem; color: var(--text-muted);">${u.email}</div>
            </td>
            <td style="padding: 0.5rem; text-align: left; font-family: monospace; font-weight: 700; color: var(--accent-purple);">${u.referral_code}</td>
            <td style="padding: 0.5rem; text-align: center; font-weight: 700; color: var(--accent-blue);">${u.referral_points} pts</td>
          </tr>
        `).join('');
      } else {
        referrersTbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 1rem;">No registered referrers.</td></tr>`;
      }
    }
    
    // Render redeem requests
    const requestsTbody = document.getElementById('saasRedeemRequestsTableBody');
    if (requestsTbody) {
      if (data.redeemRequests && data.redeemRequests.length > 0) {
        requestsTbody.innerHTML = data.redeemRequests.map(r => `
          <tr>
            <td style="padding: 0.5rem; text-align: left;">
              <div style="font-weight: 600;">${r.agent_name}</div>
              <div style="font-size: 0.7rem; color: var(--text-muted);">${r.agent_email}</div>
            </td>
            <td style="padding: 0.5rem; text-align: center; font-weight: 700; color: var(--accent-blue);">${r.points} pts</td>
            <td style="padding: 0.5rem; text-align: center;">
              <span class="status-badge ${r.status.toLowerCase() === 'approved' ? 'won' : (r.status.toLowerCase() === 'rejected' ? 'lost' : 'inprogress')}">
                ${r.status}
              </span>
            </td>
            <td style="padding: 0.5rem; text-align: right;">
              ${r.status === 'Pending' ? `
                <button class="btn-primary" onclick="settleRedeemRequest('${r.id}', 'Approve')" style="padding: 2px 8px; font-size: 0.7rem; height: auto; display: inline-flex; margin-right: 4px;">Approve</button>
                <button class="btn-secondary" onclick="settleRedeemRequest('${r.id}', 'Reject')" style="padding: 2px 8px; font-size: 0.7rem; height: auto; display: inline-flex; border-color: rgba(239, 68, 68, 0.4); color: #EF4444;">Reject</button>
              ` : `<span style="font-size: 0.7rem; color: var(--text-muted);">${r.status}</span>`}
            </td>
          </tr>
        `).join('');
      } else {
        requestsTbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 1rem;">No payout requests.</td></tr>`;
      }
    }
    
    // Render conversions log
    const convTbody = document.getElementById('saasReferralConversionsTableBody');
    if (convTbody) {
      if (data.conversions && data.conversions.length > 0) {
        convTbody.innerHTML = data.conversions.map(c => `
          <tr>
            <td style="padding: 0.5rem; text-align: left;">
              <div style="font-weight: 600;">${c.referrer_name}</div>
              <div style="font-size: 0.7rem; color: var(--text-muted);">${c.referrer_email}</div>
            </td>
            <td style="padding: 0.5rem; text-align: left;">${c.referred_email}</td>
            <td style="padding: 0.5rem; text-align: left;">${c.plan_purchased}</td>
            <td style="padding: 0.5rem; text-align: right; font-weight: 600;">₹${parseFloat(c.amount_paid).toLocaleString('en-IN')}</td>
            <td style="padding: 0.5rem; text-align: center; color: var(--accent-purple); font-weight: 700;">+${c.points_awarded}</td>
            <td style="padding: 0.5rem; text-align: left;">${c.created_date}</td>
          </tr>
        `).join('');
      } else {
        convTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 1rem;">No conversions recorded yet.</td></tr>`;
      }
    }

    // Refresh lucide icons
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons();
    }
  } catch (err) {
    console.error("Load admin referrals tracker error:", err);
  }
}

async function settleRedeemRequest(requestId, action) {
  const confirmMsg = `Are you sure you want to ${action.toLowerCase()} this redemption request?`;
  showAppConfirm("Confirm Point Settlement", confirmMsg, async () => {
    try {
      showGlobalLoading("Processing settlement...");
      const res = await fetch(`${API_BASE}/api/admin/redeem-requests/${requestId}/action`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action })
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to process request.');
      }
      
      showAppNotification('Success', `Point redemption request has been ${action.toLowerCase()}d successfully.`, 'success');
      await loadSuperAdminReferrals();
    } catch (err) {
      showAppNotification('Error', err.message, 'danger');
    } finally {
      hideGlobalLoading();
    }
  });
}

// ----------------------------------------------------------------
// HIRING SIGNALS TO-DOS & CHECKLISTS
// ----------------------------------------------------------------

function toggleAllSignalSources(status) {
  const checkboxes = document.querySelectorAll('input[name="signalSource"]');
  checkboxes.forEach(cb => cb.checked = status);
}

let hiringTodosList = [];
const expandedAccordionIds = new Set();

async function renderHiringTodos() {
  const container = document.getElementById('hiringTodosListContainer');
  if (!container) return;

  try {
    const res = await fetch(`${API_BASE}/api/hiring-todos`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error("Failed to load strategy list.");

    const todos = await res.json();
    hiringTodosList = todos;

    if (todos.length === 0) {
      container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 1.5rem; font-size: 0.8rem;">No strategy points created.</div>`;
      return;
    }

    container.innerHTML = todos.map(item => {
      const isCompleted = item.completed === 1;
      const textStyle = isCompleted ? 'text-decoration: line-through; opacity: 0.55;' : '';
      const priorityColor = item.priority.includes('⭐ ⭐ ⭐ ⭐ ⭐') ? 'var(--accent-blue)' : 'var(--text-secondary)';

      let steps = [];
      try {
        steps = typeof item.steps === 'string' ? JSON.parse(item.steps) : item.steps;
      } catch (e) {
        steps = [];
      }
      if (!Array.isArray(steps)) steps = [];

      const isExpanded = expandedAccordionIds.has(item.id);
      const arrowStyle = isExpanded ? 'transform: rotate(90deg);' : '';
      const contentStyle = isExpanded ? 'display: block;' : 'display: none;';
      const contentClass = isExpanded ? '' : 'hidden';

      const stepsHtml = steps.map((step, idx) => {
        return `
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; background: rgba(255,255,255,0.015); border: 1px solid rgba(255,255,255,0.05); padding: 0.35rem 0.6rem; border-radius: 4px;">
            <div style="display: flex; align-items: center; gap: 0.5rem; flex: 1; min-width: 0;">
              <input type="checkbox" ${step.completed ? 'checked' : ''} onchange="toggleStepCompleted(${item.id}, ${idx}, this.checked)" style="cursor: pointer; width: 14px; height: 14px;">
              <input type="text" value="${escapeHTML(step.text)}" onchange="editStepText(${item.id}, ${idx}, this.value)" style="background: transparent; border: none; font-size: 0.78rem; color: var(--text-primary); width: 100%; border-bottom: 1px dashed transparent; outline: none; padding: 2px 0; text-decoration: ${step.completed ? 'line-through' : 'none'}; opacity: ${step.completed ? 0.6 : 1};" onfocus="this.style.borderBottomColor='var(--accent-purple)'" onblur="this.style.borderBottomColor='transparent'">
            </div>
            <button class="btn-secondary" onclick="deleteStep(${item.id}, ${idx})" title="Delete Step" style="color: #EF4444; border: none; background: transparent; padding: 2px; height: auto;">
              <i data-lucide="x" style="width: 12px; height: 12px;"></i>
            </button>
          </div>
        `;
      }).join('');

      return `
        <div class="strategy-card" style="border: 1px solid var(--border-color); border-radius: 8px; background: rgba(255,255,255,0.015); margin-bottom: 0.5rem; transition: border-color 0.2s; flex-shrink: 0;">
          <!-- Header Row (What to Do) -->
          <div class="strategy-header" style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; cursor: pointer; user-select: none;" onclick="toggleStrategyAccordion(event, ${item.id})">
            <div style="display: flex; align-items: center; gap: 0.75rem; flex: 1; min-width: 0;">
              <!-- Chevron Arrow -->
              <i class="accordion-arrow" data-lucide="chevron-right" style="width: 16px; height: 16px; transition: transform 0.2s; color: var(--text-muted); ${arrowStyle}"></i>
              <!-- Checkbox to complete strategy -->
              <input type="checkbox" ${isCompleted ? 'checked' : ''} onclick="event.stopPropagation(); toggleStrategyCompleted(${item.id}, this.checked)" style="cursor: pointer; width: 15px; height: 15px; flex-shrink: 0; margin-top: 2px;">
              <div style="display: flex; flex-direction: column; min-width: 0;">
                <span class="strategy-title" style="font-size: 0.8rem; font-weight: 500; color: var(--text-primary); text-decoration: ${isCompleted ? 'line-through' : 'none'}; opacity: ${isCompleted ? 0.6 : 1}; word-break: break-word;">${escapeHTML(item.title)}</span>
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.25rem;">
                  <span style="font-size: 0.65rem; padding: 1px 6px; border-radius: 4px; background: rgba(168, 85, 247, 0.08); color: var(--accent-purple); border: 1px solid rgba(168, 85, 247, 0.12); font-weight: 600;">${escapeHTML(item.priority)}</span>
                  <span style="font-size: 0.65rem; color: var(--text-muted); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 180px;">Sources: ${escapeHTML(item.source_sites || 'None')}</span>
                </div>
              </div>
            </div>
            <!-- Actions -->
            <div style="display: flex; align-items: center; gap: 0.25rem; margin-left: 0.75rem;" onclick="event.stopPropagation()">
              <button class="btn-secondary" onclick="editStrategyTodo(${item.id})" title="Edit Strategy" style="padding: 3px 6px; height: auto; border: none; background: transparent; color: var(--text-muted);">
                <i data-lucide="edit-3" style="width: 13px; height: 13px;"></i>
              </button>
              <button class="btn-secondary" onclick="deleteTodoItem(${item.id})" title="Delete Strategy" style="padding: 3px 6px; height: auto; border: none; background: transparent; color: rgba(239, 68, 68, 0.65);">
                <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i>
              </button>
            </div>
          </div>
          
          <!-- Expanded Content Accordion (How to Do list) -->
          <div class="strategy-accordion-content ${contentClass}" id="strategy-accordion-${item.id}" style="border-top: 1px solid var(--border-color); padding: 0.85rem 1rem 1rem 1rem; background: rgba(0,0,0,0.12); border-bottom-left-radius: 8px; border-bottom-right-radius: 8px; ${contentStyle}">
            <h4 style="font-size: 0.68rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; margin-bottom: 0.65rem; display: flex; align-items: center; gap: 0.25rem; letter-spacing: 0.05em;">
              <i data-lucide="list-todo" style="width: 12px; height: 12px; color: var(--accent-blue);"></i>
              How to execute (Execution steps)
            </h4>
            
            <!-- Steps List (Scrollable box) -->
            <div class="steps-list" style="display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 0.75rem; max-height: 200px; overflow-y: auto; padding-right: 0.25rem;">
              ${stepsHtml || `<div style="text-align: center; color: var(--text-muted); font-size: 0.75rem; padding: 0.5rem 0;">No execution steps added yet. Add some below!</div>`}
            </div>
            
            <!-- Add New Step Form -->
            <div style="display: flex; gap: 0.4rem; margin-top: 0.65rem;">
              <input type="text" id="new-step-input-${item.id}" placeholder="Add execution step..." style="flex: 1; padding: 0.35rem 0.5rem; font-size: 0.75rem; background: var(--input-bg); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary);" onkeydown="if(event.key==='Enter') addStepToStrategy(${item.id})">
              <button class="btn-primary" onclick="addStepToStrategy(${item.id})" style="padding: 0.35rem 0.75rem; font-size: 0.72rem; display: flex; align-items: center; gap: 2px; height: auto;">
                <i data-lucide="plus" style="width: 11px; height: 11px;"></i> Add
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons();
    }
  } catch (err) {
    showAppNotification('Error', err.message, 'danger');
  }
}

// Global Accordion and sub-steps handlers
window.toggleStrategyAccordion = function(event, id) {
  if (event.target.tagName === 'INPUT' || event.target.tagName === 'BUTTON' || event.target.closest('button') || event.target.closest('input')) {
    return;
  }
  
  const content = document.getElementById(`strategy-accordion-${id}`);
  if (!content) return;
  const card = content.closest('.strategy-card');
  const arrow = card.querySelector('.accordion-arrow');
  
  if (content.style.display === 'none' || content.classList.contains('hidden')) {
    content.style.display = 'block';
    content.classList.remove('hidden');
    if (arrow) arrow.style.transform = 'rotate(90deg)';
    expandedAccordionIds.add(id);
  } else {
    content.style.display = 'none';
    content.classList.add('hidden');
    if (arrow) arrow.style.transform = 'none';
    expandedAccordionIds.delete(id);
  }
};

window.toggleStrategyCompleted = async function(id, checked) {
  try {
    const res = await fetch(`${API_BASE}/api/hiring-todos/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ completed: checked ? 1 : 0 })
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to update completion status.");
    }

    await renderHiringTodos();
  } catch (err) {
    showAppNotification('Error', err.message, 'danger');
  }
};

window.toggleStepCompleted = async function(todoId, stepIdx, completedState) {
  const item = hiringTodosList.find(t => t.id === todoId);
  if (!item) return;
  
  let steps = [];
  try {
    steps = typeof item.steps === 'string' ? JSON.parse(item.steps) : item.steps;
  } catch (e) {}
  if (!Array.isArray(steps)) steps = [];
  
  if (steps[stepIdx]) {
    steps[stepIdx].completed = completedState;
  }
  
  await updateStrategySteps(todoId, steps);
};

window.editStepText = async function(todoId, stepIdx, newText) {
  const item = hiringTodosList.find(t => t.id === todoId);
  if (!item) return;
  
  let steps = [];
  try {
    steps = typeof item.steps === 'string' ? JSON.parse(item.steps) : item.steps;
  } catch (e) {}
  if (!Array.isArray(steps)) steps = [];
  
  if (steps[stepIdx]) {
    steps[stepIdx].text = newText.trim();
  }
  
  await updateStrategySteps(todoId, steps);
};

window.deleteStep = async function(todoId, stepIdx) {
  const item = hiringTodosList.find(t => t.id === todoId);
  if (!item) return;
  
  let steps = [];
  try {
    steps = typeof item.steps === 'string' ? JSON.parse(item.steps) : item.steps;
  } catch (e) {}
  if (!Array.isArray(steps)) steps = [];
  
  steps.splice(stepIdx, 1);
  
  await updateStrategySteps(todoId, steps);
};

window.addStepToStrategy = async function(todoId) {
  const input = document.getElementById(`new-step-input-${todoId}`);
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  
  const item = hiringTodosList.find(t => t.id === todoId);
  if (!item) return;
  
  let steps = [];
  try {
    steps = typeof item.steps === 'string' ? JSON.parse(item.steps) : item.steps;
  } catch (e) {}
  if (!Array.isArray(steps)) steps = [];
  
  steps.push({ text, completed: false });
  
  await updateStrategySteps(todoId, steps);
  expandedAccordionIds.add(todoId);
  await renderHiringTodos();
};

async function updateStrategySteps(id, steps) {
  try {
    const res = await fetch(`${API_BASE}/api/hiring-todos/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ steps })
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to update strategy steps.");
    }

    await renderHiringTodos();
  } catch (err) {
    showAppNotification('Error', err.message, 'danger');
  }
}

function openAddTodoModal() {
  document.getElementById('addTodoTitle').value = '';
  document.getElementById('addTodoPriority').value = '⭐⭐⭐⭐⭐';
  document.getElementById('addTodoSources').value = '';
  document.getElementById('addTodoSteps').value = '';
  document.getElementById('addHiringTodoModalOverlay').classList.add('active');
}

function closeAddTodoModal() {
  document.getElementById('addHiringTodoModalOverlay').classList.remove('active');
}

async function submitAddHiringTodo(e) {
  e.preventDefault();
  const title = document.getElementById('addTodoTitle').value.trim();
  const priority = document.getElementById('addTodoPriority').value;
  const source_sites = document.getElementById('addTodoSources').value.trim();
  const stepsRaw = document.getElementById('addTodoSteps').value.trim();

  if (!title) return;

  // Parse newlines to steps array
  const steps = stepsRaw
    ? stepsRaw.split('\n').map(line => line.trim()).filter(line => line.length > 0).map(line => ({ text: line, completed: false }))
    : [];

  try {
    showGlobalLoading("Saving strategy...");
    const res = await fetch(`${API_BASE}/api/hiring-todos`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ title, priority, source_sites, steps })
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to save strategy.");
    }

    showAppNotification('Strategy Saved', 'Signal strategy added to checklist.', 'success');
    closeAddTodoModal();
    await renderHiringTodos();
  } catch (err) {
    showAppNotification('Error', err.message, 'danger');
  } finally {
    hideGlobalLoading();
  }
}

function editStrategyTodo(id) {
  const item = hiringTodosList.find(t => t.id === id);
  if (!item) return;
  document.getElementById('editTodoId').value = item.id;
  document.getElementById('editTodoTitle').value = item.title;
  document.getElementById('editTodoPriority').value = item.priority;
  document.getElementById('editTodoSources').value = item.source_sites || '';
  
  // Pre-populate steps text area
  let steps = [];
  try {
    steps = typeof item.steps === 'string' ? JSON.parse(item.steps) : item.steps;
  } catch(e) {}
  if (!Array.isArray(steps)) steps = [];
  document.getElementById('editTodoSteps').value = steps.map(s => s.text).join('\n');

  document.getElementById('editHiringTodoModalOverlay').classList.add('active');
}

function closeEditTodoModal() {
  document.getElementById('editHiringTodoModalOverlay').classList.remove('active');
}

async function submitEditHiringTodo(e) {
  e.preventDefault();
  const id = document.getElementById('editTodoId').value;
  const title = document.getElementById('editTodoTitle').value.trim();
  const priority = document.getElementById('editTodoPriority').value;
  const source_sites = document.getElementById('editTodoSources').value.trim();
  const stepsRaw = document.getElementById('editTodoSteps').value.trim();

  // Parse newlines to steps array
  const steps = stepsRaw
    ? stepsRaw.split('\n').map(line => line.trim()).filter(line => line.length > 0).map(line => ({ text: line, completed: false }))
    : [];

  try {
    showGlobalLoading("Saving changes...");
    const res = await fetch(`${API_BASE}/api/hiring-todos/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ title, priority, source_sites, steps })
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to update strategy.");
    }

    showAppNotification('Changes Saved', 'Strategy point updated successfully.', 'success');
    closeEditTodoModal();
    await renderHiringTodos();
  } catch (err) {
    showAppNotification('Error', err.message, 'danger');
  } finally {
    hideGlobalLoading();
  }
}

function deleteTodoItem(id) {
  showAppConfirm("Delete Strategy Point", "Are you sure you want to remove this strategy point from your checklist?", async () => {
    try {
      showGlobalLoading("Deleting strategy...");
      const res = await fetch(`${API_BASE}/api/hiring-todos/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete strategy.");
      }

      showAppNotification('Strategy Removed', 'Checked item deleted from list.', 'success');
      expandedAccordionIds.delete(id);
      await renderHiringTodos();
    } catch (err) {
      showAppNotification('Error', err.message, 'danger');
    } finally {
      hideGlobalLoading();
    }
  });
}

// Expose open, close, submit and delete handlers to global window scope
window.openAddTodoModal = openAddTodoModal;
window.closeAddTodoModal = closeAddTodoModal;
window.submitAddHiringTodo = submitAddHiringTodo;
window.editStrategyTodo = editStrategyTodo;
window.closeEditTodoModal = closeEditTodoModal;
window.submitEditHiringTodo = submitEditHiringTodo;
window.deleteStrategy = deleteTodoItem;

// CSV/Excel Exporter for scraped hiring signals
window.exportSignalsToCSV = function() {
  if (!signalsAccumulatedResults || signalsAccumulatedResults.length === 0) {
    showAppNotification('No Data Available', 'No scraped records in active session list to export.', 'warning');
    return;
  }
  
  // Headers
  const csvHeaders = ["Job Title", "Company", "POC Name", "Email", "Phone", "Posted Date", "Consultant Match Score", "Active Hirings", "Worked with Consultant", "Vendor Manager", "Platforms", "Source Link"];
  
  // Map rows
  const csvRows = signalsAccumulatedResults.map(res => {
    const scoreVal = res.match_score || 75;
    const activeHirings = res.match_criteria ? res.match_criteria.active_hirings : 'N/A';
    const workedWithAgency = res.match_criteria ? res.match_criteria.past_placement : 'N/A';
    const vendorManager = res.match_criteria ? res.match_criteria.vendor_manager : 'N/A';
    
    return [
      res.title,
      res.company,
      res.poc,
      res.email || 'N/A',
      res.phone || 'N/A',
      res.posted_date || 'N/A',
      `${scoreVal}%`,
      activeHirings,
      workedWithAgency,
      vendorManager,
      res.platforms.join(', '),
      res.url
    ];
  });
  
  // Combine & Encode
  const csvString = [
    csvHeaders.join(','), 
    ...csvRows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
  ].join('\r\n');
  
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const downloadLink = document.createElement("a");
  downloadLink.setAttribute("href", url);
  downloadLink.setAttribute("download", `hiring_signals_report_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
};

// Clear scraped results array and view cards
window.clearScrapedSignals = function() {
  signalsAccumulatedResults = [];
  const tbody = document.getElementById('signalsResultsBody');
  const countEl = document.getElementById('signalsResultsCount');
  const resultsCard = document.getElementById('signalsResultsCard');
  
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="10" style="padding: 1.5rem; text-align: center; color: var(--text-muted); border-bottom: 1px solid var(--border-color);">No active hiring signals match the keyword query. Try searching for "Developer" or "QA".</td></tr>`;
  }
  if (countEl) countEl.innerText = '0 records found';
  if (resultsCard) resultsCard.style.display = 'none';
  
  showAppNotification('Scraper Cleared', 'Active scraped lists reset successfully.', 'info');
};
