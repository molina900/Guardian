/* global chrome */
// background.js — Guardian Shield Service Worker

var TRUST_THRESHOLD = 3;
var SENSITIVE_PATTERNS = {
  cpf: /\b\d{3}[\.\-]?\d{3}[\.\-]?\d{3}[\.\-]?\d{2}\b/,
  rg: /\b\d{1,2}[\.\-]?\d{3}[\.\-]?\d{3}[\.\-]?[\dxX]\b/,
  email: /\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/,
  phone: /(\(?\d{2}\)?\s?)(\d{4,5}[\-\s]?\d{4})/,
  creditCard: /\b(?:\d[ \-]?){13,16}\b/,
  password: /password|senha|pwd|pass/i
};

// Initialize default storage
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['siteData', 'enabled', 'alertsCount'], (result) => {
    if (!result.siteData) chrome.storage.local.set({ siteData: {} });
    if (result.enabled === undefined) chrome.storage.local.set({ enabled: true });
    if (result.alertsCount === undefined) chrome.storage.local.set({ alertsCount: 0 });
  });
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CHECK_SITE_TRUST') {
    handleSiteTrustCheck(message, sender, sendResponse);
    return true; // keep channel open for async
  }

  if (message.type === 'RECORD_VISIT') {
    recordVisit(message.hostname);
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'GET_STATUS') {
    chrome.storage.local.get(['enabled', 'siteData', 'alertsCount'], (result) => {
      sendResponse(result);
    });
    return true;
  }

  if (message.type === 'TOGGLE_EXTENSION') {
    chrome.storage.local.set({ enabled: message.enabled }, () => {
      sendResponse({ enabled: message.enabled });
    });
    return true;
  }

  if (message.type === 'ALERT_SHOWN') {
    chrome.storage.local.get(['alertsCount'], (result) => {
      const count = (result.alertsCount || 0) + 1;
      chrome.storage.local.set({ alertsCount: count });
    });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'TRUST_SITE') {
    trustSiteManually(message.hostname, sendResponse);
    return true;
  }

  if (message.type === 'REMOVE_SITE') {
    removeSite(message.hostname, sendResponse);
    return true;
  }
});

async function handleSiteTrustCheck(message, sender, sendResponse) {
  const result = await chrome.storage.local.get(['siteData', 'enabled']);
  if (!result.enabled) {
    sendResponse({ trusted: true, enabled: false });
    return;
  }

  const siteData = result.siteData || {};
  const site = siteData[message.hostname];
  const visitCount = site ? site.visits : 0;
  const trusted = visitCount >= TRUST_THRESHOLD || (site && site.manuallyTrusted);

  sendResponse({
    trusted,
    visitCount,
    enabled: result.enabled,
    threshold: TRUST_THRESHOLD
  });
}

function recordVisit(hostname) {
  chrome.storage.local.get(['siteData'], (result) => {
    const siteData = result.siteData || {};
    if (!siteData[hostname]) {
      siteData[hostname] = { visits: 0, firstSeen: Date.now(), lastSeen: Date.now(), manuallyTrusted: false };
    }
    siteData[hostname].visits += 1;
    siteData[hostname].lastSeen = Date.now();
    chrome.storage.local.set({ siteData });
  });
}

function trustSiteManually(hostname, sendResponse) {
  chrome.storage.local.get(['siteData'], (result) => {
    const siteData = result.siteData || {};
    if (!siteData[hostname]) {
      siteData[hostname] = { visits: 0, firstSeen: Date.now(), lastSeen: Date.now(), manuallyTrusted: false };
    }
    siteData[hostname].manuallyTrusted = true;
    chrome.storage.local.set({ siteData }, () => sendResponse({ ok: true }));
  });
}

function removeSite(hostname, sendResponse) {
  chrome.storage.local.get(['siteData'], (result) => {
    const siteData = result.siteData || {};
    delete siteData[hostname];
    chrome.storage.local.set({ siteData }, () => sendResponse({ ok: true }));
  });
}