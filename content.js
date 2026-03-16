// content.js — Guardian Shield Content Script
// Monitors input fields for sensitive data and warns users on untrusted sites

(function () {
  'use strict';

  const hostname = location.hostname.replace(/^www\./, '');
  let alertShown = false;
  let extensionEnabled = true;
  let siteTrusted = false;

  // Sensitive data patterns (client-side detection)
  const PATTERNS = {
    cpf: {
      regex: /\b\d{3}[\.\-]?\d{3}[\.\-]?\d{3}[\.\-]?\d{2}\b/,
      label: 'CPF',
      icon: '🪪'
    },
    rg: {
      regex: /\b\d{1,2}[\.\-]?\d{3}[\.\-]?\d{3}[\.\-]?[\dxX]\b/,
      label: 'RG',
      icon: '📄'
    },
    email: {
      regex: /\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/,
      label: 'E-mail',
      icon: '📧'
    },
    phone: {
      regex: /(\(?\d{2}\)?\s?)(\d{4,5}[\-\s]?\d{4})/,
      label: 'Telefone',
      icon: '📱'
    },
    creditCard: {
      regex: /\b(?:\d[\s\-]?){15,16}\b/,
      label: 'Cartão de Crédito',
      icon: '💳'
    }
  };

  // Password fields
  const SENSITIVE_INPUT_TYPES = ['password', 'tel', 'email'];
  const SENSITIVE_INPUT_NAMES = /cpf|rg|document|senha|password|email|phone|telefone|celular|cartao|card|credit|birth|nasc/i;

  // Initialize: record visit and check trust
  chrome.runtime.sendMessage({ type: 'RECORD_VISIT', hostname }, () => {});
  chrome.runtime.sendMessage({ type: 'CHECK_SITE_TRUST', hostname }, (response) => {
    if (!response) return;
    extensionEnabled = response.enabled;
    siteTrusted = response.trusted;
    if (extensionEnabled && !siteTrusted) {
      attachInputListeners();
    }
  });

  function attachInputListeners() {
    document.addEventListener('input', onInputChange, true);
    document.addEventListener('change', onInputChange, true);
    // Also watch for dynamically added inputs
    const observer = new MutationObserver(() => {
      // Re-scan for new forms — listeners are on document so already covered
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function onInputChange(e) {
    if (alertShown || !extensionEnabled || siteTrusted) return;
    const input = e.target;
    if (!input || !input.tagName || !['INPUT', 'TEXTAREA'].includes(input.tagName)) return;

    const value = input.value || '';
    const inputType = (input.type || '').toLowerCase();
    const inputName = (input.name || input.id || input.placeholder || '').toLowerCase();

    let detectedTypes = [];

    // Check by input type/name (password fields, etc.)
    if (inputType === 'password') {
      detectedTypes.push({ label: 'Senha', icon: '🔑' });
    }

    if (SENSITIVE_INPUT_TYPES.includes(inputType) && value.length > 3) {
      // Check patterns in value
      for (const [key, pattern] of Object.entries(PATTERNS)) {
        if (pattern.regex.test(value)) {
          if (!detectedTypes.find(d => d.label === pattern.label)) {
            detectedTypes.push({ label: pattern.label, icon: pattern.icon });
          }
        }
      }
    }

    // Check input name/id for suspicious field names
    if (SENSITIVE_INPUT_NAMES.test(inputName) && value.length > 3) {
      for (const [key, pattern] of Object.entries(PATTERNS)) {
        if (SENSITIVE_INPUT_NAMES.test(key) || pattern.regex.test(value)) {
          if (!detectedTypes.find(d => d.label === pattern.label)) {
            detectedTypes.push({ label: pattern.label, icon: pattern.icon });
          }
        }
      }
    }

    // Check raw value against all patterns
    if (value.length >= 8) {
      for (const [key, pattern] of Object.entries(PATTERNS)) {
        if (pattern.regex.test(value)) {
          if (!detectedTypes.find(d => d.label === pattern.label)) {
            detectedTypes.push({ label: pattern.label, icon: pattern.icon });
          }
        }
      }
    }

    if (detectedTypes.length > 0) {
      showWarning(detectedTypes);
    }
  }

  function showWarning(detectedTypes) {
    if (alertShown) return;
    alertShown = true;

    chrome.runtime.sendMessage({ type: 'ALERT_SHOWN' });

    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'guardian-shield-overlay';
    overlay.innerHTML = `
      <div id="gs-backdrop"></div>
      <div id="gs-modal">
        <div id="gs-header">
          <div id="gs-logo">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M16 2L4 7v9c0 7.18 5.13 13.9 12 15.93C23.87 29.9 29 23.18 29 16V7L16 2z" fill="url(#shieldGrad)"/>
              <path d="M13 16l2.5 2.5L20 12" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
              <defs>
                <linearGradient id="shieldGrad" x1="4" y1="2" x2="29" y2="32" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stop-color="#38bdf8"/>
                  <stop offset="100%" stop-color="#0ea5e9"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div id="gs-title-block">
            <span id="gs-title">Guardian Shield</span>
            <span id="gs-subtitle">Alerta de Segurança</span>
          </div>
        </div>

        <div id="gs-body">
          <p id="gs-warning-text">
            Você está inserindo dados sensíveis em um site que você <strong>não acessa com frequência</strong>. 
            Verifique se este site é confiável antes de continuar.
          </p>

          <div id="gs-site-info">
            <span id="gs-site-badge">🌐 ${hostname}</span>
          </div>

          <div id="gs-detected">
            <span id="gs-detected-label">Dados detectados:</span>
            <div id="gs-tags">
              ${detectedTypes.map(d => `<span class="gs-tag">${d.icon} ${d.label}</span>`).join('')}
            </div>
          </div>

          <div id="gs-tips">
            <p>✅ Verifique se o endereço começa com <strong>https://</strong></p>
            <p>✅ Confirme que o site é o oficial antes de inserir dados</p>
            <p>✅ Nunca insira CPF/RG em sites desconhecidos</p>
          </div>
        </div>

        <div id="gs-actions">
          <button id="gs-trust-btn">✅ Confiar neste site</button>
          <button id="gs-close-btn">Entendi, continuar assim mesmo</button>
        </div>

        <div id="gs-footer">
          Protegido por Guardian Shield · <a id="gs-disable-link" href="#">Desativar agora</a>
        </div>
      </div>
    `;

    // Inject styles
    const style = document.createElement('style');
    style.textContent = `
      #guardian-shield-overlay * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', system-ui, sans-serif; }
      #gs-backdrop {
        position: fixed; inset: 0; background: rgba(0,0,0,0.65);
        z-index: 2147483646; backdrop-filter: blur(4px);
        animation: gsBackdropIn 0.3s ease;
      }
      #gs-modal {
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
        z-index: 2147483647; width: 420px; max-width: calc(100vw - 32px);
        background: #0f1318; border: 1px solid rgba(56,189,248,0.3);
        border-radius: 20px; overflow: hidden;
        box-shadow: 0 0 0 1px rgba(56,189,248,0.1), 0 32px 64px rgba(0,0,0,0.8), 0 0 80px rgba(14,165,233,0.15);
        animation: gsModalIn 0.35s cubic-bezier(0.34,1.56,0.64,1);
      }
      @keyframes gsBackdropIn { from { opacity: 0 } to { opacity: 1 } }
      @keyframes gsModalIn { from { opacity: 0; transform: translate(-50%, -48%) scale(0.92) } to { opacity: 1; transform: translate(-50%, -50%) scale(1) } }

      #gs-header {
        display: flex; align-items: center; gap: 14px;
        padding: 22px 24px 18px;
        background: linear-gradient(135deg, rgba(56,189,248,0.12), rgba(14,165,233,0.08));
        border-bottom: 1px solid rgba(255,255,255,0.06);
      }
      #gs-logo svg { flex-shrink: 0; filter: drop-shadow(0 0 12px rgba(56,189,248,0.5)); }
      #gs-title-block { display: flex; flex-direction: column; gap: 2px; }
      #gs-title { color: #fff; font-size: 16px; font-weight: 700; letter-spacing: -0.3px; }
      #gs-subtitle { color: #38bdf8; font-size: 11px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; }

      #gs-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; }

      #gs-warning-text { color: #c9c9d3; font-size: 14px; line-height: 1.6; }
      #gs-warning-text strong { color: #38bdf8; }

      #gs-site-info { }
      #gs-site-badge {
        display: inline-flex; align-items: center; gap: 6px;
        background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
        color: #aaa; font-size: 12px; padding: 5px 12px; border-radius: 20px;
      }

      #gs-detected { display: flex; flex-direction: column; gap: 8px; }
      #gs-detected-label { color: #777; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; }
      #gs-tags { display: flex; flex-wrap: wrap; gap: 6px; }
      .gs-tag {
        background: rgba(56,189,248,0.12); border: 1px solid rgba(56,189,248,0.3);
        color: #7dd3fc; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 20px;
      }

      #gs-tips {
        background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07);
        border-radius: 10px; padding: 12px 14px; display: flex; flex-direction: column; gap: 6px;
      }
      #gs-tips p { color: #888; font-size: 12px; line-height: 1.5; }
      #gs-tips strong { color: #aaa; }

      #gs-actions {
        padding: 4px 24px 20px; display: flex; flex-direction: column; gap: 8px;
      }
      #gs-trust-btn {
        width: 100%; padding: 12px; border-radius: 10px; border: none; cursor: pointer;
        background: linear-gradient(135deg, #0ea5e9, #38bdf8);
        color: white; font-size: 14px; font-weight: 700; letter-spacing: 0.2px;
        transition: all 0.2s; box-shadow: 0 4px 20px rgba(56,189,248,0.4);
      }
      #gs-trust-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 24px rgba(56,189,248,0.5); }
      #gs-close-btn {
        width: 100%; padding: 11px; border-radius: 10px; cursor: pointer;
        background: transparent; border: 1px solid rgba(255,255,255,0.1);
        color: #666; font-size: 13px; transition: all 0.2s;
      }
      #gs-close-btn:hover { background: rgba(255,255,255,0.05); color: #999; border-color: rgba(255,255,255,0.18); }

      #gs-footer {
        padding: 12px 24px; background: rgba(0,0,0,0.3);
        border-top: 1px solid rgba(255,255,255,0.05);
        color: #444; font-size: 11px; text-align: center;
      }
      #gs-disable-link { color: #555; text-decoration: underline; cursor: pointer; }
      #gs-disable-link:hover { color: #777; }
    `;

    document.head.appendChild(style);
    document.body.appendChild(overlay);

    // Event listeners
    document.getElementById('gs-close-btn').addEventListener('click', () => {
      overlay.remove();
      style.remove();
    });

    document.getElementById('gs-backdrop').addEventListener('click', () => {
      overlay.remove();
      style.remove();
    });

    document.getElementById('gs-trust-btn').addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'TRUST_SITE', hostname }, () => {
        siteTrusted = true;
        overlay.remove();
        style.remove();
        showToast('✅ Site marcado como confiável!');
      });
    });

    document.getElementById('gs-disable-link').addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.sendMessage({ type: 'TOGGLE_EXTENSION', enabled: false }, () => {
        extensionEnabled = false;
        overlay.remove();
        style.remove();
        showToast('🔴 Guardian Shield desativado');
      });
    });
  }

  function showToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed; bottom: 24px; right: 24px; z-index: 2147483647;
      background: #0f0f13; border: 1px solid rgba(255,255,255,0.12);
      color: #e0e0e0; font-family: 'Segoe UI', system-ui, sans-serif;
      font-size: 13px; padding: 12px 18px; border-radius: 10px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      animation: gsToastIn 0.3s ease; transition: opacity 0.3s;
    `;
    toast.textContent = message;
    const style = document.createElement('style');
    style.textContent = `@keyframes gsToastIn { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: translateY(0) } }`;
    document.head.appendChild(style);
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => { toast.remove(); style.remove(); }, 300); }, 3000);
  }
})();