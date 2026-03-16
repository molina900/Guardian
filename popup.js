// popup.js — Guardian Shield Popup Logic

const TRUST_THRESHOLD = 3;

document.addEventListener('DOMContentLoaded', () => {
  loadState();
  setupTabs();
  setupToggle();
});

function loadState() {
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (result) => {
    if (!result) return;
    const { enabled, siteData = {}, alertsCount = 0 } = result;

    // Update toggle
    const toggle = document.getElementById('main-toggle');
    toggle.checked = enabled;
    updateStatusUI(enabled);

    // Stats
    const sites = Object.keys(siteData);
    document.getElementById('stat-sites').textContent = sites.filter(s => (siteData[s].visits || 0) >= TRUST_THRESHOLD).length;
    document.getElementById('stat-alerts').textContent = alertsCount;

    // Render lists
    renderLists(siteData);
  });
}

function setupToggle() {
  const toggle = document.getElementById('main-toggle');
  toggle.addEventListener('change', () => {
    const enabled = toggle.checked;
    chrome.runtime.sendMessage({ type: 'TOGGLE_EXTENSION', enabled }, () => {
      updateStatusUI(enabled);
    });
  });
}

function updateStatusUI(enabled) {
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  const label = document.getElementById('toggle-label');
  const overlay = document.getElementById('disabled-overlay');

  if (enabled) {
    dot.classList.remove('off');
    text.innerHTML = 'Monitorando <span>todos os sites</span> ativos';
    label.textContent = 'ATIVO';
    overlay.classList.remove('show');
  } else {
    dot.classList.add('off');
    text.innerHTML = '<span>Proteção desativada</span> — reative para monitorar';
    label.textContent = 'INATIVO';
    overlay.classList.add('show');
  }
}

function setupTabs() {
  const btns = document.querySelectorAll('.tab-btn');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });
}

function renderLists(siteData) {
  const entries = Object.entries(siteData).sort((a, b) => (b[1].visits || 0) - (a[1].visits || 0));

  const frequent = entries.filter(([, d]) => (d.visits || 0) >= TRUST_THRESHOLD && !d.manuallyTrusted);
  const trusted = entries.filter(([, d]) => d.manuallyTrusted || (d.visits || 0) >= TRUST_THRESHOLD);
  const all = entries;

  renderList('list-frequent', frequent);
  renderList('list-trusted', trusted);
  renderList('list-all', all);
}

function renderList(containerId, entries) {
  const container = document.getElementById(containerId);
  if (!entries.length) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🌐</span>
        Nenhum site aqui ainda.<br/>Continue navegando para ver seus dados.
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  entries.forEach(([hostname, data]) => {
    const isTrusted = data.manuallyTrusted || (data.visits || 0) >= TRUST_THRESHOLD;
    const item = document.createElement('div');
    item.className = 'site-item';

    const faviconUrl = `https://www.google.com/s2/favicons?sz=32&domain=${hostname}`;
    const visits = data.visits || 0;
    const daysAgo = data.lastSeen ? Math.floor((Date.now() - data.lastSeen) / 86400000) : 0;
    const timeText = daysAgo === 0 ? 'hoje' : daysAgo === 1 ? 'ontem' : `há ${daysAgo} dias`;

    item.innerHTML = `
      <div class="site-favicon">
        <img src="${faviconUrl}" alt="${hostname}" onerror="this.parentElement.textContent='🌐'" />
      </div>
      <div class="site-info">
        <div class="site-name">${hostname}</div>
        <div class="site-meta">${visits} visita${visits !== 1 ? 's' : ''} · ${timeText}</div>
      </div>
      <span class="site-badge ${isTrusted ? 'trusted' : 'learning'}">
        ${data.manuallyTrusted ? 'confiável' : isTrusted ? 'frequente' : `${visits}/${TRUST_THRESHOLD}`}
      </span>
      <button class="site-remove" data-hostname="${hostname}" title="Remover site">×</button>
    `;

    container.appendChild(item);
  });

  // Remove buttons
  container.querySelectorAll('.site-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const hostname = btn.dataset.hostname;
      chrome.runtime.sendMessage({ type: 'REMOVE_SITE', hostname }, () => {
        loadState();
      });
    });
  });
}
