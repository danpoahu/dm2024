import { db, doc, setDoc, Timestamp } from './firebase-config.js?v=31';
import { renderDashboard } from './dashboard.js?v=31';
import { renderPersonality } from './personality.js?v=31';
import { renderSGSurvey } from './sgsurvey.js?v=31';
import { renderResults } from './results.js?v=31';
import { renderProfile } from './profile.js?v=31';
import { renderResources } from './resources.js?v=31';

const appEl = document.getElementById('app');

// Session state (replaces Firebase Auth)
export let currentSession = null; // { docId, email, name }
export let userData = null;
export let pendingDISC = null; // unsaved DISC updates (carried to SG save)

export function setUserData(data) { userData = data; }
export function setCurrentSession(session) { currentSession = session; }
export function setPendingDISC(data) { pendingDISC = data; }

// Router
const routes = {
  '/dashboard': renderDashboard,
  '/personality': renderPersonality,
  '/sgsurvey': renderSGSurvey,
  '/results': renderResults,
  '/profile': renderProfile,
  '/resources': renderResources
};

export function navigate(path) {
  window.location.hash = path;
}

function handleRoute() {
  const hash = window.location.hash.slice(1) || '/dashboard';
  const render = routes[hash];
  if (render) {
    appEl.innerHTML = '';
    render(appEl);
  } else {
    navigate('/dashboard');
  }
}

window.addEventListener('hashchange', handleRoute);

// If the URL has ?resume=TOKEN we came from a resume email — restore session instead of showing welcome.
const _resumeParams = new URLSearchParams(window.location.search);
const _resumeToken = _resumeParams.get('resume');
if (_resumeToken) {
  handleResumeToken(_resumeToken);
} else {
  showWelcomePopup();
}

async function handleResumeToken(token) {
  appEl.innerHTML = `
    <div class="screen" style="display:flex;align-items:center;justify-content:center;text-align:center;padding:2rem;background:#F5F1E8;min-height:100vh;">
      <div>
        <img src="/DiscoverMoreLogo.png" alt="Discover More" style="width:140px;margin-bottom:1.5rem;">
        <p style="color:#2E7D32;font-size:1.05rem;font-weight:600;margin:0;">Loading your saved progress...</p>
      </div>
    </div>
  `;
  try {
    const response = await fetch('https://us-central1-dm-auth-65cc4.cloudfunctions.net/dmGetResumeSession?token=' + encodeURIComponent(token));
    if (!response.ok) throw new Error('Token invalid or expired');
    const session = await response.json();
    if (!session.docId) throw new Error('Bad session response');

    currentSession = { docId: session.docId, email: session.email, name: session.name };
    userData = session.userData;

    // Strip ?resume from URL so a refresh doesn't re-call the function.
    const cleanUrl = window.location.pathname + (window.location.hash || '');
    window.history.replaceState({}, '', cleanUrl);

    navigate('/dashboard');
    handleRoute();
  } catch (e) {
    console.error('Resume failed:', e);
    appEl.innerHTML = `
      <div class="screen" style="display:flex;align-items:center;justify-content:center;text-align:center;padding:2rem;background:#F5F1E8;min-height:100vh;">
        <div style="background:#fff;padding:2.25rem 1.75rem;border-radius:12px;max-width:420px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <img src="/DiscoverMoreLogo.png" alt="Discover More" style="width:120px;margin-bottom:1.25rem;">
          <h2 style="color:#d32f2f;margin:0 0 1rem;font-size:1.4rem;">Link expired</h2>
          <p style="color:#1A1A1A;margin:0 0 1.5rem;line-height:1.55;font-size:.95rem;">We couldn't restore your session. The resume link may have expired or already been used.</p>
          <button class="btn btn-primary" onclick="window.location.href='/app/'">Start fresh</button>
        </div>
      </div>
    `;
  }
}

function showWelcomePopup() {
  appEl.innerHTML = `
    <div class="screen login-screen" style="position:relative;">
      <img src="/DiscoverMoreLogo.png" alt="Discover More" class="login-logo">
      <div class="login-card">
        <h2>Welcome</h2>
        <p style="font-size:.9rem;color:#666;margin-bottom:16px;">Please enter your information to get started.</p>
        <div style="background:#fff8e1;border:1px solid #f0d27a;border-radius:6px;padding:10px 12px;margin-bottom:16px;font-size:.85rem;color:#5a4400;line-height:1.45;text-align:left;">
          <strong>Please complete your surveys in this session.</strong> If you leave before finishing, your progress will be lost.
        </div>
        <input type="text" id="welcome-first" placeholder="First Name" autocomplete="given-name">
        <input type="text" id="welcome-last" placeholder="Last Name" autocomplete="family-name">
        <input type="email" id="welcome-email" placeholder="Email Address" autocomplete="email">
        <div id="welcome-error" class="error-msg"></div>
        <button id="welcome-btn" class="btn btn-primary">Let's Go</button>
      </div>
      <span style="position:fixed;bottom:8px;right:12px;font-size:.65rem;color:rgba(0,0,0,.25);font-weight:700;">v31</span>
    </div>
  `;

  // Enter key support
  ['welcome-first', 'welcome-last', 'welcome-email'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('welcome-btn').click();
    });
  });

  document.getElementById('welcome-btn').addEventListener('click', async () => {
    const first = document.getElementById('welcome-first').value.trim();
    const last = document.getElementById('welcome-last').value.trim();
    const email = document.getElementById('welcome-email').value.trim();
    const errorEl = document.getElementById('welcome-error');
    errorEl.textContent = '';

    // Validate first name
    if (!first || first.length < 2) {
      errorEl.textContent = 'Please enter your first name.';
      document.getElementById('welcome-first').focus();
      return;
    }
    if (!/^[a-zA-Z\u00C0-\u024F\s'-]+$/.test(first)) {
      errorEl.textContent = 'First name contains invalid characters.';
      document.getElementById('welcome-first').focus();
      return;
    }

    // Validate last name
    if (!last || last.length < 2) {
      errorEl.textContent = 'Please enter your last name.';
      document.getElementById('welcome-last').focus();
      return;
    }
    if (!/^[a-zA-Z\u00C0-\u024F\s'-]+$/.test(last)) {
      errorEl.textContent = 'Last name contains invalid characters.';
      document.getElementById('welcome-last').focus();
      return;
    }

    // Validate email
    if (!email) {
      errorEl.textContent = 'Please enter your email address.';
      document.getElementById('welcome-email').focus();
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRegex.test(email)) {
      errorEl.textContent = 'Please enter a valid email address.';
      document.getElementById('welcome-email').focus();
      return;
    }

    const btn = document.getElementById('welcome-btn');
    btn.disabled = true;
    btn.textContent = 'Setting up...';

    try {
      const fullName = first + ' ' + last;
      const randomId = crypto.randomUUID();
      const docId = email.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + randomId.slice(0, 8);

      const data = {
        EMAIL: email.trim().toLowerCase(),
        NAME: fullName,
        Phone1: '',
        uid: docId,
        created: Timestamp.now(),
        updated: '1',
        env: 'Web',
        discH: '', discL: '',
        Notes: '', Team: '',
        Follow: 'false', Letter: 'false', NoServe: 'false',
        Serving: 'false', Swag: 'false', W1: 'false', W2: 'false',
        _sFixFlag: randomId
      };
      for (let j = 1; j <= 5; j++) {
        data['D' + j] = 1; data['I' + j] = 1;
        data['S' + j] = 1; data['C' + j] = 1;
      }
      for (let j = 1; j <= 72; j++) { data['ZZ' + j] = 1; }

      await setDoc(doc(db, 'results', docId), data);

      currentSession = { docId: docId, email: email.toLowerCase(), name: fullName };
      userData = data;
      navigate('/dashboard');
      handleRoute();
    } catch (e) {
      console.error('Error creating session:', e);
      errorEl.textContent = 'Something went wrong. Please try again.';
      btn.disabled = false;
      btn.textContent = "Let's Go";
    }
  });
}

// Service worker removed — was causing aggressive caching issues
