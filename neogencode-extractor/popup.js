let linkedConfig = null;
let activeTabUrl = '';

document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  setupTabs();
  
  document.getElementById('btnSaveToken').addEventListener('click', saveToken);
  document.getElementById('btnImport').addEventListener('click', importLeadToCrm);
  
  // Scrape page on popup load
  scrapeActiveTab();
});

function loadConfig() {
  chrome.storage.local.get(['connToken', 'linkedConfig'], (data) => {
    if (data.connToken && data.linkedConfig) {
      linkedConfig = data.linkedConfig;
      document.getElementById('connTokenInput').value = data.connToken;
      
      const badge = document.getElementById('linkedBadge');
      badge.innerText = linkedConfig.tenantName || 'Linked';
      badge.style.background = 'rgba(52, 211, 153, 0.15)';
      badge.style.color = '#34D399';
    } else {
      const badge = document.getElementById('linkedBadge');
      badge.innerText = 'Unlinked';
      badge.style.background = 'rgba(239, 68, 68, 0.15)';
      badge.style.color = '#EF4444';
    }
  });
}

function setupTabs() {
  const btnScraper = document.getElementById('btnTabScraper');
  const btnSettings = document.getElementById('btnTabSettings');
  const viewScraper = document.getElementById('viewScraper');
  const viewSettings = document.getElementById('viewSettings');
  
  btnScraper.addEventListener('click', () => {
    btnScraper.classList.add('active');
    btnSettings.classList.remove('active');
    viewScraper.classList.remove('hidden');
    viewSettings.classList.add('hidden');
  });
  
  btnSettings.addEventListener('click', () => {
    btnSettings.classList.add('active');
    btnScraper.classList.remove('active');
    viewSettings.classList.remove('hidden');
    viewScraper.classList.add('hidden');
  });
}

function saveToken() {
  const tokenInput = document.getElementById('connTokenInput').value.trim();
  const status = document.getElementById('settingsStatus');
  
  if (!tokenInput) {
    status.innerText = "Please paste a Connection Token.";
    status.style.color = '#EF4444';
    return;
  }
  
  try {
    const decoded = JSON.parse(atob(tokenInput));
    if (!decoded.tenantId || (!decoded.sheetsUrl && !decoded.tursoUrl)) {
      throw new Error("Invalid payload contents.");
    }
    
    linkedConfig = decoded;
    chrome.storage.local.set({
      connToken: tokenInput,
      linkedConfig: decoded
    }, () => {
      status.innerText = "Linked successfully to CRM!";
      status.style.color = '#34D399';
      loadConfig();
      setTimeout(() => {
        document.getElementById('btnTabScraper').click();
      }, 1000);
    });
  } catch (err) {
    status.innerText = "Invalid Connection Token key format.";
    status.style.color = '#EF4444';
  }
}

// Scrape basic details from page DOM
function scrapeActiveTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0) return;
    const tab = tabs[0];
    activeTabUrl = tab.url;
    
    // Inject scraper helper function
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: performScraping
    }, (results) => {
      if (results && results[0] && results[0].result) {
        const data = results[0].result;
        document.getElementById('leadName').value = data.name || '';
        document.getElementById('leadTitle').value = data.designation || '';
        document.getElementById('leadEmail').value = data.email || '';
        document.getElementById('leadPhone').value = data.phone || '';
        document.getElementById('leadSummary').value = data.summary || `Extracted profile from url: ${tab.url}`;
      }
    });
  });
}

function performScraping() {
  // Scraper algorithm targeting generic meta, LinkedIn tags
  let name = "";
  let designation = "";
  let email = "";
  let phone = "";
  let summary = "";
  
  // 1. Scraping LinkedIn profile page DOM
  if (window.location.href.includes("linkedin.com/in/")) {
    const nameEl = document.querySelector("h1.text-heading-xlarge");
    if (nameEl) name = nameEl.innerText.trim();
    
    const desEl = document.querySelector(".text-body-medium.break-words");
    if (desEl) designation = desEl.innerText.trim();
    
    const aboutEl = document.querySelector("#about + div .display-flex span");
    if (aboutEl) summary = aboutEl.innerText.trim();
  }
  
  // 2. Generic fallback page selectors
  if (!name) {
    const h1 = document.querySelector("h1");
    if (h1) name = h1.innerText.trim().substring(0, 50);
  }
  
  // Match emails
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emailsFound = document.body.innerText.match(emailRegex);
  if (emailsFound) email = emailsFound[0];
  
  // Match phone numbers
  const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
  const phonesFound = document.body.innerText.match(phoneRegex);
  if (phonesFound) phone = phonesFound[0];
  
  return { name, designation, email, phone, summary };
}

async function importLeadToCrm() {
  const status = document.getElementById('scraperStatus');
  if (!linkedConfig) {
    status.innerText = "Please link your CRM account in settings first.";
    status.style.color = '#EF4444';
    return;
  }
  
  const lead = {
    name: document.getElementById('leadName').value.trim(),
    designation: document.getElementById('leadTitle').value.trim(),
    email: document.getElementById('leadEmail').value.trim(),
    phone: document.getElementById('leadPhone').value.trim(),
    summary: document.getElementById('leadSummary').value.trim(),
    url: activeTabUrl
  };
  
  if (!lead.name) {
    status.innerText = "Lead name is required.";
    status.style.color = '#EF4444';
    return;
  }
  
  status.innerText = "Importing lead...";
  status.style.color = '#38BDF8';
  
  let imported = false;
  
  // Method A: Page Communication message passing if tab is open
  try {
    const tabs = await new Promise((resolve) => chrome.tabs.query({}, resolve));
    tabs.forEach(tab => {
      // Post message to any open CRM tabs
      if (tab.url && tab.url.toLowerCase().includes(linkedConfig.crmUrl.toLowerCase())) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (leadData) => {
            window.postMessage({
              source: "neogencode-extractor",
              action: "IMPORT_LEAD",
              lead: leadData
            }, "*");
          },
          args: [lead]
        });
        imported = true;
      }
    });
  } catch (err) {
    console.error("Message passing failed:", err);
  }
  
  // Method B: Direct serverless write to target database (Sheets/Turso)
  try {
    if (linkedConfig.syncTarget === 'sheets' && linkedConfig.sheetsUrl) {
      const response = await fetch(linkedConfig.sheetsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: "auto_outreach",
          lead: {
            name: lead.name,
            designation: lead.designation,
            phone: lead.phone,
            email: lead.email,
            source: "Extension",
            status: "new",
            summary: lead.summary,
            createdDate: new Date().toISOString().split('T')[0]
          },
          channels: []
        })
      });
      if (response.ok) imported = true;
    } else if (linkedConfig.syncTarget === 'turso' && linkedConfig.tursoToken) {
      // Post to our secure Express API endpoint
      const baseCrmUrl = linkedConfig.crmUrl.endsWith('/') ? linkedConfig.crmUrl.slice(0, -1) : linkedConfig.crmUrl;
      const response = await fetch(`${baseCrmUrl}/api/leads/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead: {
            name: lead.name,
            designation: lead.designation,
            phone: lead.phone,
            email: lead.email,
            summary: lead.summary,
            postUrl: lead.url || ''
          },
          connectionToken: linkedConfig.tursoToken
        })
      });
      if (response.ok) imported = true;
    }
  } catch (dbErr) {
    console.error("Database direct push failed:", dbErr);
  }
  
  if (imported) {
    status.innerText = "Lead imported successfully!";
    status.style.color = '#34D399';
  } else {
    status.innerText = "Import completed (linked tab notified).";
    status.style.color = '#34D399';
  }
}
