import { db, doc, setDoc, Timestamp } from './firebase-config.js';
import { renderDashboard } from './dashboard.js';
import { renderPersonality } from './personality.js';
import { renderSGSurvey } from './sgsurvey.js';
import { renderResults } from './results.js';
import { renderProfile } from './profile.js';
import { renderResources } from './resources.js';

const appEl = document.getElementById('app');

// Session state (replaces Firebase Auth)
export let currentSession = null; // { docId, email, name }
export let userData = null;

export function setUserData(data) { userData = data; }
export function setCurrentSession(session) { currentSession = session; }

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

// Show welcome popup, then dashboard
showWelcomePopup();

function showWelcomePopup() {
  appEl.innerHTML = `
    <div class="screen login-screen" style="position:relative;">
      <img src="/DiscoverMoreLogo.png" alt="Discover More" class="login-logo">
      <div class="login-card">
        <h2>Welcome</h2>
        <p style="font-size:.9rem;color:#666;margin-bottom:16px;">Please enter your information to get started.</p>
        <input type="text" id="welcome-first" placeholder="First Name" autocomplete="given-name">
        <input type="text" id="welcome-last" placeholder="Last Name" autocomplete="family-name">
        <input type="email" id="welcome-email" placeholder="Email Address" autocomplete="email">
        <div id="welcome-error" class="error-msg"></div>
        <button id="welcome-btn" class="btn btn-primary">Let's Go</button>
      </div>
      <span style="position:fixed;bottom:8px;right:12px;font-size:.65rem;color:rgba(0,0,0,.25);font-weight:700;">v23</span>
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

// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/app/sw.js').catch(() => {});
}
