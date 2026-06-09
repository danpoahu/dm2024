import { db, doc, setDoc, Timestamp, collection, query, where, getDocs } from './firebase-config.js?v=36';
import { renderDashboard } from './dashboard.js?v=36';
import { renderPersonality } from './personality.js?v=36';
import { renderSGSurvey } from './sgsurvey.js?v=36';
import { renderResults } from './results.js?v=36';
import { renderProfile } from './profile.js?v=36';
import { renderResources } from './resources.js?v=36';

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

// Route on URL params: ?savelink=TOKEN -> save-link page; ?resume=TOKEN -> restore session; else welcome.
const _resumeParams = new URLSearchParams(window.location.search);
const _resumeToken = _resumeParams.get('resume');
const _saveLinkToken = _resumeParams.get('savelink');
if (_saveLinkToken) {
  showSaveLinkPage(_saveLinkToken);
} else if (_resumeToken) {
  handleResumeToken(_resumeToken);
} else {
  showWelcomePopup();
}

function showSaveLinkPage(token) {
  const fullUrl = `https://discovermore.app/app/?resume=${token}`;
  const hasShare = typeof navigator !== 'undefined' && !!navigator.share;
  appEl.innerHTML = `
    <div class="screen" style="padding:1.5rem;background:#F5F1E8;min-height:100vh;display:flex;align-items:center;justify-content:center;">
      <div style="background:#fff;border-radius:14px;padding:2rem 1.5rem;max-width:480px;width:100%;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,0.06);">
        <img src="/DiscoverMoreLogo.png" alt="Discover More" style="width:200px;display:block;margin:0 auto 1rem;">
        <div style="height:3px;background:#FF9800;width:60px;margin:0 auto 1.25rem;border-radius:2px;"></div>
        <h2 style="margin:0 0 0.75rem;color:#2E7D32;font-size:1.4rem;">Save your link</h2>
        <p style="margin:0 0 1rem;color:#1A1A1A;font-size:0.95rem;line-height:1.55;">
          Tap <strong>Copy Link</strong> to copy your personal Discover More link to your clipboard. You can then paste it into Notes, Messages, or anywhere you'll find it later.
        </p>
        <div style="background:#F5F1E8;padding:0.75rem;border-radius:6px;margin:1rem 0;font-size:0.82rem;color:#1B4B5A;word-break:break-all;font-family:'SF Mono',Menlo,Consolas,monospace;line-height:1.5;text-align:left;">
          ${fullUrl}
        </div>
        <button id="copy-btn" class="btn btn-primary" style="width:100%;margin-bottom:0.5rem;">Copy Link</button>
        ${hasShare ? `<button id="share-btn" class="btn btn-secondary" style="width:100%;margin-bottom:0.5rem;">Share / Save to Other Apps</button>` : ''}
        <p id="copy-status" style="margin:0.75rem 0 0.5rem;color:#2E7D32;font-size:0.9rem;font-weight:600;min-height:1.3em;"></p>
        <p style="margin:0.75rem 0 1rem;color:#757575;font-size:0.8rem;line-height:1.5;">
          On a computer? You can also press <strong>Cmd+D</strong> (Mac) or <strong>Ctrl+D</strong> (Windows) to bookmark this page in your browser.
        </p>
        <a href="/app/?resume=${token}" style="display:inline-block;color:#5a6478;font-size:0.85rem;text-decoration:underline;padding:0.5rem;">Continue to Discover More</a>
      </div>
    </div>
  `;

  document.getElementById('copy-btn').addEventListener('click', async () => {
    const status = document.getElementById('copy-status');
    try {
      await navigator.clipboard.writeText(fullUrl);
      status.textContent = '✓ Link copied to clipboard';
      status.style.color = '#2E7D32';
    } catch (e) {
      status.textContent = 'Tap and hold the link above to copy it manually.';
      status.style.color = '#A67C52';
    }
  });

  if (hasShare) {
    document.getElementById('share-btn').addEventListener('click', async () => {
      try {
        await navigator.share({ title: 'Discover More', text: 'My Discover More link', url: fullUrl });
      } catch (e) {
        if (e && e.name !== 'AbortError') console.error('Share failed:', e);
      }
    });
  }
}

// ============================================================
// Inactivity + exit detection — fires immediate resume email
// ============================================================
const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const SEND_NOW_URL = 'https://us-central1-dm-auth-65cc4.cloudfunctions.net/dmSendResumeEmailNow';
let _inactivityTimer = null;

function _shouldFireResumeEmail() {
  if (!currentSession || !currentSession.docId) return false;
  if (userData && userData.updated && userData.updated !== '1') return false;
  return true;
}

function _resetInactivityTimer() {
  if (_inactivityTimer) clearTimeout(_inactivityTimer);
  _inactivityTimer = setTimeout(() => {
    if (!_shouldFireResumeEmail()) return;
    fetch(SEND_NOW_URL + '?docId=' + encodeURIComponent(currentSession.docId), { method: 'POST' })
      .catch(e => console.error('Inactivity email failed:', e));
  }, INACTIVITY_TIMEOUT_MS);
}

['mousemove', 'keydown', 'click', 'scroll', 'touchstart', 'visibilitychange'].forEach(evt => {
  document.addEventListener(evt, _resetInactivityTimer, { passive: true });
});

window.addEventListener('beforeunload', () => {
  if (!_shouldFireResumeEmail()) return;
  navigator.sendBeacon(SEND_NOW_URL + '?docId=' + encodeURIComponent(currentSession.docId));
});

_resetInactivityTimer();

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
        <div style="background:rgba(76,175,80,0.10);border:2px solid rgba(76,175,80,0.45);border-radius:14px;padding:12px 14px;margin-bottom:18px;text-align:left;">
          <p style="margin:0 0 4px;font-weight:800;color:#2E7D32;font-size:.95rem;">Been here before?</p>
          <p style="margin:0;color:#1A1A1A;font-size:.85rem;line-height:1.45;">Check your email for your personal link back to your results.</p>
        </div>
        <input type="text" id="welcome-first" placeholder="First Name" autocomplete="given-name">
        <input type="text" id="welcome-last" placeholder="Last Name" autocomplete="family-name">
        <input type="email" id="welcome-email" placeholder="Email Address" autocomplete="email">
        <div id="welcome-match" style="display:none;"></div>
        <div id="welcome-error" class="error-msg"></div>
        <button id="welcome-btn" class="btn btn-primary">Let's Go</button>
      </div>
      <span style="position:fixed;bottom:8px;right:12px;font-size:.65rem;color:rgba(0,0,0,.25);font-weight:700;">v36-STAGE</span>
    </div>
  `;

  // ----- Returning-user lookup -----
  // When an email is entered, search existing results for that address and, if
  // found, offer the matching name(s) so the person resumes their saved profile
  // instead of creating a duplicate record.
  let _matchDocs = [];
  let _dismissedEmail = null; // an email the user explicitly said "not me" to

  const _emailValid = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
  const _escape = (s) => String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function resumeIntoProfile(match) {
    const d = match.data;
    currentSession = { docId: match.docId, email: (d.EMAIL || '').toLowerCase(), name: d.NAME || '' };
    userData = d;
    navigate('/dashboard');
    handleRoute();
  }

  // Returns true if a "Welcome back" panel was shown for this email.
  async function checkExistingEmail(rawEmail) {
    const email = (rawEmail || '').trim();
    const panel = document.getElementById('welcome-match');
    if (!panel) return false;
    if (!_emailValid(email)) { panel.style.display = 'none'; panel.innerHTML = ''; return false; }

    // Query both lowercased and as-typed to catch web (lowercased) and any
    // app-created records that may have stored mixed case.
    const wanted = [email.toLowerCase()];
    if (email !== email.toLowerCase()) wanted.push(email);

    let found = [];
    try {
      for (const e of wanted) {
        const snap = await getDocs(query(collection(db, 'results'), where('EMAIL', '==', e)));
        snap.forEach(d => found.push({ docId: d.id, data: d.data() }));
      }
    } catch (err) {
      console.error('Email lookup failed:', err);
      panel.style.display = 'none'; panel.innerHTML = '';
      return false; // never block a new user on a lookup error
    }

    // De-dupe by docId; keep only records with a usable name.
    const seen = new Set();
    _matchDocs = found.filter(m => {
      if (seen.has(m.docId)) return false;
      seen.add(m.docId);
      return m.data && (m.data.NAME || '').trim().length > 0;
    });

    if (_matchDocs.length === 0) { panel.style.display = 'none'; panel.innerHTML = ''; return false; }

    const buttons = _matchDocs.map((m, i) =>
      `<button type="button" class="welcome-match-pick" data-idx="${i}" style="display:block;width:100%;margin:6px 0;padding:11px 14px;border:none;border-radius:12px;background:#4CAF50;color:#fff;font-size:1.05rem;font-weight:700;cursor:pointer;">${_escape(m.data.NAME)}</button>`
    ).join('');

    panel.innerHTML = `
      <div style="background:rgba(76,175,80,0.12);border:2px solid rgba(76,175,80,0.5);border-radius:14px;padding:14px;margin:4px 0 16px;text-align:left;">
        <p style="margin:0 0 8px;font-weight:800;color:#2E7D32;font-size:1rem;">Welcome back! Is this you?</p>
        ${buttons}
        <button type="button" id="welcome-not-me" style="display:block;width:100%;margin-top:8px;background:none;border:none;color:#A67C52;font-size:.85rem;font-weight:600;text-decoration:underline;cursor:pointer;padding:6px;">No, that's not me &mdash; continue below</button>
      </div>
    `;
    panel.style.display = 'block';

    panel.querySelectorAll('.welcome-match-pick').forEach(b => {
      b.addEventListener('click', () => {
        const m = _matchDocs[Number(b.dataset.idx)];
        if (m) resumeIntoProfile(m);
      });
    });
    document.getElementById('welcome-not-me').addEventListener('click', () => {
      _dismissedEmail = email.toLowerCase();
      panel.style.display = 'none';
      panel.innerHTML = '';
      document.getElementById('welcome-first').focus();
    });

    return true;
  }

  // Run the lookup when the email field loses focus.
  document.getElementById('welcome-email').addEventListener('blur', () => {
    const email = document.getElementById('welcome-email').value.trim();
    if (email && email.toLowerCase() !== _dismissedEmail) checkExistingEmail(email);
  });
  // Hide a stale match panel while the email is being edited.
  document.getElementById('welcome-email').addEventListener('input', () => {
    const panel = document.getElementById('welcome-match');
    if (panel) panel.style.display = 'none';
  });

  // Enter key support
  ['welcome-first', 'welcome-last'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('welcome-btn').click();
    });
  });
  document.getElementById('welcome-email').addEventListener('keydown', async e => {
    if (e.key !== 'Enter') return;
    const email = document.getElementById('welcome-email').value.trim();
    if (email && email.toLowerCase() !== _dismissedEmail) {
      const shown = await checkExistingEmail(email);
      if (shown) return;
    }
    document.getElementById('welcome-btn').click();
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

    // Safety net: if this email already has a profile (and they haven't said
    // "not me"), show the resume panel instead of creating a duplicate.
    if (email.toLowerCase() !== _dismissedEmail) {
      const shown = await checkExistingEmail(email);
      if (shown) return;
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
