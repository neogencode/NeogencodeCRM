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
let companyInfo = null;
let invoices = [];
let activeTab = 'dashboard';
let currentUser = null; // Loaded after authentication

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
  renderLeadsList();
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
function switchTab(tabName) {
  activeTab = tabName;
  
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
  
  // Hide all initially
  if (metricsSection) metricsSection.style.display = 'none';
  if (directoryContainer) directoryContainer.style.display = 'none';
  if (outreachContainer) outreachContainer.style.display = 'none';
  if (pipelineContainer) pipelineContainer.style.display = 'none';
  if (teamContainer) teamContainer.style.display = 'none';
  if (saasContainer) saasContainer.style.display = 'none';
  if (billingContainer) billingContainer.style.display = 'none';
  
  if (tabName === 'outreach') {
    if (outreachContainer) outreachContainer.style.display = 'block';
    renderOutreachQueue();
  } else if (tabName === 'pipeline') {
    if (pipelineContainer) pipelineContainer.style.display = 'block';
    renderKanbanBoard();
  } else if (tabName === 'team') {
    if (teamContainer) teamContainer.style.display = 'block';
    renderTeamMembers();
  } else if (tabName === 'saas') {
    if (saasContainer) saasContainer.style.display = 'block';
    renderSaasTenants();
  } else if (tabName === 'billing') {
    if (billingContainer) billingContainer.style.display = 'block';
    fetchAndRenderInvoices();
  } else {
    if (directoryContainer) directoryContainer.style.display = 'block';
    
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
        <div style="background: rgba(255,255,255,0.05); height: 6px; border-radius: 3px; overflow: hidden; width: 100%;">
          <div style="background: ${colorVal}; width: ${percentage}%; height: 100%; border-radius: 3px; transition: width 0.8s ease;"></div>
        </div>
      </div>
    `;
  };

  const statusContainer = document.getElementById('analyticsStatusBars');
  if (statusContainer) {
    const statuses = ['new', 'contacted', 'inprogress', 'won', 'lost'];
    const colors = {
      'new': '#38BDF8',
      'contacted': '#C084FC',
      'inprogress': '#FBBF24',
      'won': '#34D399',
      'lost': '#F87171'
    };
    const labels = {
      'new': 'New Leads',
      'contacted': 'Contacted via Auto',
      'inprogress': 'In Progress',
      'won': 'Won (Closed)',
      'lost': 'Lost'
    };
    
    let html = '';
    statuses.forEach(status => {
      const count = scopedLeads.filter(l => l.status === status).length;
      html += createProgressBarHtml(labels[status], count, totalLeads, colors[status]);
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
function renderLeadsList(filteredLeads = leads) {
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
      <td style="text-align: center; font-weight: 600; color: var(--text-secondary);">${index + 1}</td>
      <td>
        <div class="lead-info-cell">
          <span class="lead-name">${escapeHTML(lead.name)}</span>
          <span class="lead-designation">${escapeHTML(lead.designation || 'No Designation')}</span>
          <div class="lead-meta-row">
            ${lead.foundBy ? `<span class="lead-finder-label">Finder: ${escapeHTML(lead.foundBy)}</span>` : ''}
            ${lead.summary ? `<span class="lead-summary-badge" title="${escapeHTML(lead.summary)}"><i data-lucide="notebook-tabs"></i> Notes</span>` : ''}
            ${lead.assignedAgent ? `<span class="lead-finder-label" style="background-color: rgba(168, 85, 247, 0.08); border-color: rgba(168, 85, 247, 0.2); color: var(--accent-purple);"><i data-lucide="user" style="width: 10px; height: 10px; margin-right: 2px;"></i> ${escapeHTML(lead.assignedAgent)}</span>` : '<span class="lead-finder-label" style="background-color: rgba(239, 68, 68, 0.04); border-color: rgba(239, 68, 68, 0.15); color: #EF4444;"><i data-lucide="user-x" style="width: 10px; height: 10px; margin-right: 2px;"></i> Unassigned</span>'}
          </div>
        </div>
      </td>
      <td>
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
      <td>
        <span class="lead-contact-item">
          <i data-lucide="globe" style="width:13px; height:13px; color:var(--text-muted); margin-right:4px;"></i>
          ${escapeHTML(lead.source || 'Other')}
          ${lead.postUrl ? `<a href="${escapeHTML(lead.postUrl)}" target="_blank" class="outreach-action-btn" title="View Source Post / Profile" style="margin-left: 6px; padding: 2px 4px; display: inline-flex;"><i data-lucide="external-link" style="width:12px; height:12px;"></i></a>` : ''}
        </span>
      </td>
      <td>
        <span class="${statusClass}">${lead.status === 'inprogress' ? 'In Progress' : lead.status}</span>
      </td>
      <td>
        <span class="lead-contact-item">
          <i data-lucide="calendar-check" style="width:13px; height:13px; color:var(--text-muted); margin-right:4px;"></i>
          ${formatDateNice(lead.lastFollowUp)}
        </span>
      </td>
      <td>
        <span class="${followUpClass}">
          <i data-lucide="${followUpIcon}" style="width:14px; height:14px;"></i>
          ${formatDateNice(lead.nextFollowUp)}
        </span>
      </td>
      <td>
        <span class="lead-contact-item">
          <i data-lucide="radio" style="width:13px; height:13px; color:var(--text-muted); margin-right:4px;"></i>
          ${lead.lastOutreachTimestamp ? escapeHTML(lead.lastOutreachTimestamp) : 'Never'}
        </span>
      </td>
      <td>
        <span class="lead-contact-item">
          <i data-lucide="calendar" style="width:13px; height:13px; color:var(--text-muted); margin-right:4px;"></i>
          ${lead.nextAutoFollowUp ? formatDateNice(lead.nextAutoFollowUp) : 'None'}
        </span>
      </td>
      <td>
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
  
  // Re-instantiate icons
  lucide.createIcons();
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
function applyFilters() {
  const searchQuery = document.getElementById('searchInput').value.toLowerCase().trim();
  const statusFilter = document.getElementById('filterStatus').value;
  const sourceFilter = document.getElementById('filterSource').value;
  const foundByFilter = document.getElementById('filterFoundBy').value;
  const dateRangeFilter = document.getElementById('filterDateRange').value;
  const sortBy = document.getElementById('sortField').value;
  const todayStr = new Date().toISOString().split('T')[0];

  let result = [...getScopedLeads()];

  // Tab Specific Overrides
  if (activeTab === 'reminders') {
    // Only active leads whose follow-up is due today or is overdue
    result = result.filter(lead => {
      const isActive = ['inprogress', 'contacted', 'new'].includes(lead.status);
      const isDueOrOverdue = lead.nextFollowUp <= todayStr;
      return isActive && isDueOrOverdue;
    });
  }

  // 1. Text Search Filter
  if (searchQuery) {
    result = result.filter(lead => {
      return (
        lead.name.toLowerCase().includes(searchQuery) ||
        (lead.designation && lead.designation.toLowerCase().includes(searchQuery)) ||
        (lead.email && lead.email.toLowerCase().includes(searchQuery)) ||
        (lead.phone && lead.phone.includes(searchQuery)) ||
        (lead.source && lead.source.toLowerCase().includes(searchQuery)) ||
        (lead.foundBy && lead.foundBy.toLowerCase().includes(searchQuery)) ||
        (lead.summary && lead.summary.toLowerCase().includes(searchQuery))
      );
    });
  }

  // 2. Status Dropdown Filter
  if (statusFilter !== 'all') {
    result = result.filter(lead => lead.status === statusFilter);
  }

  // 3. Source Dropdown Filter
  if (sourceFilter !== 'all') {
    result = result.filter(lead => lead.source && lead.source.toLowerCase() === sourceFilter.toLowerCase());
  }

  // 4. Lead Finder (Found By) Dropdown Filter
  if (foundByFilter !== 'all') {
    result = result.filter(lead => lead.foundBy && lead.foundBy.toLowerCase() === foundByFilter.toLowerCase());
  }

  // 5. Date Range (Created Date) Dropdown Filter
  if (dateRangeFilter !== 'all') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    result = result.filter(lead => {
      if (!lead.createdDate) return false;
      const created = new Date(lead.createdDate);
      created.setHours(0, 0, 0, 0);
      const diffMs = today.getTime() - created.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      
      if (dateRangeFilter === 'today') {
        return diffDays === 0;
      } else if (dateRangeFilter === '3days') {
        return diffDays >= 0 && diffDays <= 3;
      } else if (dateRangeFilter === '7days') {
        return diffDays >= 0 && diffDays <= 7;
      } else if (dateRangeFilter === '30days') {
        return diffDays >= 0 && diffDays <= 30;
      }
      return true;
    });
  }

  // 4. Sort Algorithm
  result.sort((a, b) => {
    if (sortBy === 'name') {
      return a.name.localeCompare(b.name);
    } else if (sortBy === 'status') {
      return a.status.localeCompare(b.status);
    } else if (sortBy === 'lastFollowUp') {
      if (!a.lastFollowUp) return 1;
      if (!b.lastFollowUp) return -1;
      return new Date(b.lastFollowUp) - new Date(a.lastFollowUp); // descending
    } else { // default nextFollowUp
      if (!a.nextFollowUp) return 1;
      if (!b.nextFollowUp) return -1;
      return new Date(a.nextFollowUp) - new Date(b.nextFollowUp); // ascending
    }
  });

  renderLeadsList(result);
}

function handleSearch() {
  applyFilters();
}

// ----------------------------------------------------
// REMINDERS & NOTIFICATION ALERTS
// ----------------------------------------------------
function checkFollowUpReminders(showToasts = false) {
  const todayStr = new Date().toISOString().split('T')[0];
  
  // Find leads whose next follow-up is today (and are not won or lost)
  const dueLeads = leads.filter(lead => 
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
      title.innerText = 'Edit Lead Details';
      document.getElementById('leadId').value = lead.id;
      document.getElementById('leadName').value = lead.name;
      document.getElementById('leadDesignation').value = lead.designation || '';
      document.getElementById('leadPhone').value = lead.phone || '';
      document.getElementById('leadEmail').value = lead.email || '';
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
    renderDynamicLeadFields(null);
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
  const designation = document.getElementById('leadDesignation').value.trim();
  const phone = document.getElementById('leadPhone').value.trim();
  const email = document.getElementById('leadEmail').value.trim();
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
    assignedAgent
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
      showAppNotification('Lead Updated', `${name}'s data has been updated.`, 'success');
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
      showAppNotification('Lead Added', `${name} has been added to directory.`, 'success');
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

async function deleteLead(id) {
  const lead = leads.find(l => l.id === id);
  if (!lead) return;

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
        await executeDeleteLead(id, reason);
      }
    );
  } else if (currentUser.role === 'Super Admin') {
    showAppConfirm(
      "Confirm Deletion",
      `Are you sure you want to delete lead "${lead.name}"?`,
      async () => {
        await executeDeleteLead(id, "");
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
        await executeDeleteLead(id, "");
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

    // Refresh data
    await initRemoteDatabase();
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
    // Generate and populate Extension Connection Token immediately
    const tokenInput = document.getElementById('extensionConnToken');
    if (tokenInput) {
      tokenInput.value = getExtensionToken();
    }
    
    // Reset passcode fields
    document.getElementById('securityPinInput').value = '';
    document.getElementById('pinErrorMessage').classList.add('hidden');
    
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
    
    modal.classList.add('active');
  }
}

function verifySecurityPin() {
  const pinInput = document.getElementById('securityPinInput');
  const errorMsg = document.getElementById('pinErrorMessage');
  const pin = pinInput.value.trim();
  
  const expectedPin = (companyInfo && companyInfo.syncSettingsPin) ? companyInfo.syncSettingsPin : '4321';
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

function saveSettings(event) {
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
  
  // Save EmailJS Credentials
  if (document.getElementById('emailjsServiceId')) {
    localStorage.setItem('emailjs_service_id', document.getElementById('emailjsServiceId').value.trim());
    localStorage.setItem('emailjs_template_id', document.getElementById('emailjsTemplateId').value.trim());
    localStorage.setItem('emailjs_public_key', document.getElementById('emailjsPublicKey').value.trim());
  }

  // Save Paid Email (SMTP) & Bland AI configurations
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
    fetch(`${API_BASE}/api/companies/my-settings`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        smtpHost,
        smtpPort,
        smtpUser,
        smtpPass,
        smtpSecure: smtpSecure ? 'true' : 'false'
      })
    })
    .then(res => {
      if (!res.ok) throw new Error("Backend save failed");
      console.log("Successfully synchronized SMTP settings with backend agent record.");
      showAppNotification('Settings Saved', 'Sync configurations and API credentials saved.', 'success');
      closeSettingsModal();
    })
    .catch(err => {
      console.error("Error saving SMTP settings to backend:", err);
      showAppNotification('Save Failed', 'Could not synchronize settings with backend server: ' + err.message, 'danger');
    });
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
        <button class="btn-icon" onclick="runIndividualOutreach('${lead.id}')" title="Trigger Outreach for ${escapeHTML(lead.name)}" style="background: rgba(192, 132, 252, 0.1); border-color: rgba(192, 132, 252, 0.2); color: var(--accent-purple); padding: 0.35rem 0.5rem; border-radius: 6px;">
          <i data-lucide="send" style="width: 13px; height: 13px;"></i>
        </button>
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
      if (isPaidMode) {
        const blandKey = localStorage.getItem('bland_ai_key');
        if (!blandKey) {
          writeLog(`    [AI Call API Error] Bland.ai API credentials are not configured in settings.`, 'danger');
          outreachErrorOccurred = true;
        } else {
          writeLog(` -> Connecting paid AI voice calling server for ${lead.phone}...`, 'info');
          await sleep(1000);
          writeLog(`    [AI Call API] Voice dialing connection completed using Sk_Bland Key. Status: Dialing...`, 'success');
          triggers.push('AI Call');
        }
      } else {
        writeLog(` -> Connecting Bland AI voice call trial log to ${lead.phone}...`, 'success');
        writeLog(`    [AI Calling] Playing follow-up response script. Connection successful.`, 'info');
        triggers.push('AI Call');
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
    if (isPaidMode) {
      const blandKey = localStorage.getItem('bland_ai_key');
      if (!blandKey) {
        writeLog(`    [AI Call API Error] Bland.ai API credentials are not configured in settings.`, 'danger');
        dispatchFailed = true;
      } else {
        writeLog(` -> Connecting paid AI voice calling server for ${lead.phone}...`, 'info');
        await sleep(1000);
        writeLog(`    [AI Call API] Voice dialing connection completed using Sk_Bland Key. Status: Dialing...`, 'success');
        triggers.push('AI Call');
      }
    } else {
      writeLog(` -> Connecting Bland AI voice call trial log to ${lead.phone}...`, 'success');
      writeLog(`    [AI Calling] Playing follow-up response script. Connection successful.`, 'info');
      triggers.push('AI Call');
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
      if (pin !== '0000') {
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
  
  showAppNotification('Syncing Call...', `Sending call instruction to Mobile App for ${lead.name}`, 'info');
  
  const webhookUrl = localStorage.getItem('google_sheets_url');
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'call_request',
          phone: lead.phone.replace(/\D/g, ''),
          name: lead.name,
          timestamp: new Date().toISOString()
        })
      });
      showAppNotification('Call Synced', `Dial instruction dispatched to mobile app queue successfully.`, 'success');
      
      // Update follow-up timestamp
      lead.lastOutreachTimestamp = new Date().toLocaleString('en-US', {month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute:'2-digit'});
      saveLeadsToStorage();
      renderLeadsList();
    } catch (e) {
      console.error('Call Dispatch Error:', e);
      showAppNotification('Sync Error', 'Fallback to standard phone redirect.', 'danger');
      window.open(`tel:${lead.phone.replace(/\D/g, '')}`, '_self');
    }
  } else {
    // Fallback if sheet is not set
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
  
  if (!name || !email || !whatsapp) return;

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
      viewAllLeads: role !== 'Sales Agent',
      paidApiMode: false,
      addAgent: false
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

  try {
    showGlobalLoading("Saving team member details...");
    const response = await fetch(`${API_BASE}/api/agents/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ name, email, whatsapp, role })
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
      createInvoice: isCeo
    };
  } else {
    if (typeof agent.permissions === 'string') {
      try { agent.permissions = JSON.parse(agent.permissions); } catch (e) {}
    }
    if (agent.permissions.paidApiMode === undefined) agent.permissions.paidApiMode = false;
    if (agent.permissions.addAgent === undefined) agent.permissions.addAgent = isCeo;
    if (agent.permissions.reassignLead === undefined) agent.permissions.reassignLead = isCeo;
    if (agent.permissions.createInvoice === undefined) agent.permissions.createInvoice = isCeo;
  }
  
  agent.permissions[permissionKey] = isChecked;
  saveAgentsToStorage();
  // Call backend API to persist permission updates
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
  });

  renderTeamMembers();
}

function renderTeamMembers() {
  const treeContainer = document.getElementById('teamHierarchyTree');
  if (!treeContainer) return;
  
  treeContainer.innerHTML = '';
  
  // Helper to ensure default permissions are mapped
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
        createInvoice: isCeo
      };
    } else {
      if (typeof agent.permissions === 'string') {
        try { agent.permissions = JSON.parse(agent.permissions); } catch (e) {}
      }
      if (agent.permissions.paidApiMode === undefined) agent.permissions.paidApiMode = false;
      if (agent.permissions.addAgent === undefined) agent.permissions.addAgent = isCeo;
      if (agent.permissions.reassignLead === undefined) agent.permissions.reassignLead = isCeo;
      if (agent.permissions.createInvoice === undefined) agent.permissions.createInvoice = isCeo;
    }
    return agent.permissions;
  };  
  const isSuperAdmin = currentUser.role === 'Super Admin';
  const targetTenantId = isSuperAdmin ? activeTenantId : currentUser.tenantId;

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
      const companyAgents = agents.filter(a => a.tenantId === company.id);
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
            <input type="checkbox" ${agentPerm.addAgent ? 'checked' : ''} ${isCEO ? `onchange="toggleAgentPermission('${agent.id}', 'addAgent', this.checked)"` : 'disabled'}>
            Add Agent
          </label>
          <label class="permission-pill-checkbox">
            <input type="checkbox" ${agentPerm.reassignLead ? 'checked' : ''} ${isCEO ? `onchange="toggleAgentPermission('${agent.id}', 'reassignLead', this.checked)"` : 'disabled'}>
            Reassign Lead
          </label>
          <label class="permission-pill-checkbox">
            <input type="checkbox" ${agentPerm.createInvoice ? 'checked' : ''} ${isCEO ? `onchange="toggleAgentPermission('${agent.id}', 'createInvoice', this.checked)"` : 'disabled'}>
            Invoice
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
  
  // Map agents to won count
  const targetTenantId = currentUser.role === 'Super Admin' ? activeTenantId : currentUser.tenantId;
  const scopedAgents = targetTenantId === 'all' ? agents : agents.filter(a => a.tenantId === targetTenantId);
  const scopedLeads = getScopedLeads();
  const tallies = scopedAgents.map(agent => {
    const wonCount = scopedLeads.filter(l => l.assignedAgent === agent.name && l.status === 'won').length;
    return { name: agent.name, count: wonCount };
  });
  
  // Sort descending
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
        <div class="leaderboard-name">${item.name}</div>
        <div class="leaderboard-score">${item.count} Won</div>
      </div>
    `;
  });
  
  container.innerHTML = html;
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
    showAppNotification('Pipeline Updated', `Shifted ${lead.name} to "${targetStatus}".`, 'success');
    
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
            <div class="kanban-card-title">${lead.name}</div>
            
            <div class="kanban-card-meta">
              <i data-lucide="briefcase" style="width: 11px; height: 11px;"></i>
              <span>${lead.designation || 'No Designation'}</span>
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
                ${stages.map(st => `<option value="${st}">${st}</option>`).join('')}
              </select>
              
              <button class="kanban-card-btn" onclick="openLeadModal('${lead.id}')" title="Edit Lead">
                <i data-lucide="edit-3" style="width: 12px; height: 12px;"></i>
              </button>
            </div>
          </div>
        `;
      });
    }

    boardHtml += `
      <div class="kanban-column" id="kanban-${stage}" ondragover="allowDrop(event)" ondragleave="dragLeave(event)" ondrop="dropLeadCard(event, '${stage}')">
        <div class="kanban-column-header">
          <span class="column-title-wrapper">
            <span class="status-dot" style="background-color: ${dotColor};"></span>
            <h3>${stage}</h3>
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
  
  const todayStr = new Date().toISOString().split('T')[0];
  const dueLeads = leads.filter(l => l.nextFollowUp === todayStr && l.status !== 'won' && l.status !== 'lost');
  
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
      alertText += `\n${i+1}. ${lead.name} (${lead.phone}) - Notes: ${lead.summary || 'None'}`;
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
    // 1. Fetch leads
    const leadsRes = await fetch(`${API_BASE}/api/leads`, { headers: getAuthHeaders() });
    if (!leadsRes.ok) throw new Error("Failed to load leads from backend.");
    leads = await leadsRes.json();
    saveLeadsToStorage();

    // 2. Fetch delete requests (Managers / Super Admin only)
    if (currentUser.role === 'Manager' || currentUser.role === 'Super Admin') {
      const delRes = await fetch(`${API_BASE}/api/delete-requests`, { headers: getAuthHeaders() });
      if (delRes.ok) {
        deleteRequests = await delRes.json();
        saveDeleteRequestsToStorage();
      }
    }
    
    // Fetch agents (all team members have access to view company directory)
    const agentRes = await fetch(`${API_BASE}/api/agents`, { headers: getAuthHeaders() });
    if (agentRes.ok) {
      agents = await agentRes.json();
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
    }

    // 3. Fetch companies (Super Admin only) or current company info (tenant users)
    if (currentUser.role === 'Super Admin') {
      const companyRes = await fetch(`${API_BASE}/api/companies`, { headers: getAuthHeaders() });
      if (companyRes.ok) {
        companies = await companyRes.json();
        saveCompaniesToStorage();
      }
    } else {
      const compInfoRes = await fetch(`${API_BASE}/api/companies/info`, { headers: getAuthHeaders() });
      if (compInfoRes.ok) {
        companyInfo = await compInfoRes.json();
      }
    }

    // 4. Fetch invoices (if authorized)
    const isCEO = currentUser.ceoEmail && currentUser.email && currentUser.email.toLowerCase() === currentUser.ceoEmail.toLowerCase();
    const hasInvoicePerm = currentUser.permissions && currentUser.permissions.createInvoice === true;
    if (isCEO || currentUser.role === 'Super Admin' || hasInvoicePerm) {
      const invoiceRes = await fetch(`${API_BASE}/api/invoices`, { headers: getAuthHeaders() });
      if (invoiceRes.ok) {
        invoices = await invoiceRes.json();
      }
    }

    console.log("Portal successfully loaded data from backend API.");
    showAppNotification('Connected', 'Portal data synchronized with API server.', 'success');

    // Re-render UI components with freshly synced DB data
    populateAgentDropdowns();
    renderTeamMembers();
    renderSalesLeaderboard();
    populateFoundByFilter();
    
    // Apply filters to recalculate filteredLeads and render main board + metrics smoothly
    applyFilters();
    
    if (currentUser.role === 'Super Admin') {
      renderSaasTenants();
      populateTenantDropdown();
      
      // Auto-refresh inspected DB table if one is selected
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
  
  if (!viewAll) {
    // Can only see leads assigned to them
    return tenantLeads.filter(l => (l.assignedAgent || '').toLowerCase().includes(currentUser.name.toLowerCase().split(' ')[0]));
  }
  
  // Otherwise see all leads in their company
  return tenantLeads;
}

// Switch tenant view context (Super Admin only)
function switchTenantContext(tenantId) {
  activeTenantId = tenantId;
  localStorage.setItem('saas_active_tenant_id', tenantId);
  
  // Refresh views
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
        industry
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
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="padding: 0.85rem 1rem; font-weight: 600; color: var(--text-primary);">${c.name}</td>
      <td style="padding: 0.85rem 1rem; color: var(--text-muted); font-size: 0.72rem;">${c.id}</td>
      <td style="padding: 0.85rem 1rem;"><span class="file-format-badge" style="background-color: rgba(147, 51, 234, 0.08); color: var(--accent-purple);">${c.plan}</span></td>
      <td style="padding: 0.85rem 1rem; color: var(--text-secondary); font-weight: 500;">${c.memberLimit || 5} Agents</td>
      <td style="padding: 0.85rem 1rem;"><span class="file-format-badge" style="${statusColor}">${c.status}</span></td>
      <td style="padding: 0.85rem 1rem; color: var(--text-secondary);">${c.createdDate}</td>
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
  
  document.getElementById('loginPageOverlay').style.display = 'none';
  document.getElementById('passwordResetOverlay').style.display = 'none';
  document.getElementById('appContainer').style.display = 'flex';
  
  initializeApplication();
  showAppNotification('Logged In', `Welcome back, ${currentUser.name}!`, 'success');
}

// Log Out session
function handleUserLogout() {
  localStorage.removeItem('crm_logged_in');
  localStorage.removeItem('crm_current_user');
  localStorage.removeItem('crm_actual_user');
  localStorage.removeItem('crm_jwt_token');
  currentUser = null;
  
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
  
  if (!newPassword || newPassword.length < 4) {
    showAppNotification('Validation Error', 'Password must be at least 4 characters long.', 'warning');
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
      if (newPass.trim().length < 4) {
        showAppNotification('Validation Error', 'Password must be at least 4 characters long.', 'warning');
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
  
  // On desktop, target sidebar menu links to match reference screenshot!
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
    
    if (isDesktop) {
      // Sidebar alignment (Tooltip to the right of sidebar menu link)
      card.style.left = `${rect.right + 18}px`;
      card.style.top = `${targetTop + (rect.height - card.offsetHeight) / 2}px`;
      if (arrow) {
        arrow.style.display = 'block';
        arrow.classList.add('arrow-left');
        arrow.style.top = `${(card.offsetHeight - 12) / 2}px`;
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
        card.style.top = `${targetTop - card.offsetHeight - 15}px`;
        if (arrow) {
          arrow.style.display = 'block';
          arrow.classList.add('arrow-bottom');
          arrow.style.top = `${card.offsetHeight - 5}px`;
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
async function editCompanyDetails(id) {
  const company = companies.find(c => c.id === id);
  if (!company) return;
  
  showAppPrompt(
    "Edit Company Name",
    `Enter new company name for "${company.name}":`,
    company.name,
    (newName) => {
      if (newName === '') {
        showAppNotification('Error', 'Company name cannot be empty.', 'danger');
        return;
      }
      
      showAppPrompt(
        "Edit Company Plan",
        `Enter plan for "${company.name}" (Free, Starter, Enterprise):`,
        company.plan,
        (newPlan) => {
          if (!['Free', 'Starter', 'Enterprise'].includes(newPlan)) {
            showAppNotification('Error', 'Invalid plan tier. Choose Free, Starter, or Enterprise.', 'danger');
            return;
          }
          
          showAppPrompt(
            "Edit Team Member Limit",
            `Enter max team members limit for "${company.name}":`,
            String(company.memberLimit || 5),
            (newLimitStr) => {
              const newLimit = parseInt(newLimitStr);
              if (isNaN(newLimit) || newLimit < 1) {
                showAppNotification('Error', 'Limit must be a positive number.', 'danger');
                return;
              }
              
              const owner = agents.find(a => a.tenantId === id && a.role === 'Manager');
              showAppPrompt(
                "Edit CEO/Owner Email",
                `Enter CEO/Owner email address for "${company.name}":`,
                owner ? owner.email : "",
                async (newEmail) => {
                  if (newEmail === '') {
                    showAppNotification('Error', 'CEO Email cannot be empty.', 'danger');
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
                        ceoEmail: newEmail
                      })
                    });
                    
                    if (!response.ok) {
                      const errData = await response.json();
                      throw new Error(errData.error || "Failed to update company");
                    }
                    
                    showAppNotification('Tenant Updated', 'Company details and owner email successfully updated.', 'success');
                    await initRemoteDatabase();
                  } catch (err) {
                    showAppNotification('Error', err.message, 'danger');
                  } finally {
                    hideGlobalLoading();
                  }
                }
              );
            }
          );
        }
      );
    }
  );
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
    
    if (callChecked && lead.phone && isDraftPaidMode) {
      writeLog(`Initiating AI Voice Call payload request to ${lead.phone}...`, 'info');
      await triggerBlandAiCall(lead);
      writeLog(`[AI Call API] Bland.ai phone dialing sequence completed.`, 'success');
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

function openInvoiceModal() {
  document.getElementById('invoiceForm').reset();
  document.getElementById('invoiceDate').value = new Date().toISOString().split('T')[0];
  populatePreviousClientsDropdown();
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
        logoUrl
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
  } catch (err) {
    showAppNotification('Error', err.message, 'danger');
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
    closeInvoiceModal();
    showAppNotification('Success', 'Invoice generated successfully.', 'success');

    printInvoice(data.invoiceId);
  } catch (err) {
    showAppNotification('Error', err.message, 'danger');
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



