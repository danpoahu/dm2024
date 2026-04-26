import { db, doc, getDoc } from './firebase-config.js?v=33';
import { navigate, setUserData, userData, currentSession, setCurrentSession } from './app.js?v=33';
import { SPIRITUAL_GIFTS } from './data.js?v=33';

const SEND_NOW_URL = 'https://us-central1-dm-auth-65cc4.cloudfunctions.net/dmSendResumeEmailNow';

function showLogoffModal() {
  const existing = document.getElementById('logoff-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'logoff-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,30,15,0.55);z-index:9000;display:flex;align-items:center;justify-content:center;padding:1rem;';
  overlay.innerHTML = `
    <div style="background:#F5F1E8;border-radius:14px;padding:2rem 1.75rem;max-width:420px;width:100%;box-shadow:0 8px 24px rgba(0,0,0,0.25);text-align:center;">
      <img src="/DiscoverMoreLogo.png" alt="Discover More" style="width:160px;height:auto;display:block;margin:0 auto 1rem;">
      <div style="height:3px;background:#FF9800;width:60px;margin:0 auto 1.25rem;border-radius:2px;"></div>
      <h2 style="margin:0 0 0.75rem;color:#2E7D32;font-size:1.4rem;font-weight:700;">Need to step away?</h2>
      <p style="margin:0 0 1rem;color:#1A1A1A;font-size:0.95rem;line-height:1.55;">
        We'll email you a link so you can come back and finish your survey within the next 30 days.
      </p>
      <p style="margin:0 0 1.5rem;color:#757575;font-size:0.85rem;line-height:1.5;font-style:italic;">
        Save the email &mdash; your link stays the same in any reminders we send.
      </p>
      <button class="btn btn-primary" id="logoff-confirm" style="width:100%;margin-bottom:0.5rem;">Send Email &amp; Log Out</button>
      <button id="logoff-cancel" style="background:none;border:none;color:#757575;font-size:0.85rem;padding:0.5rem;cursor:pointer;width:100%;">Cancel</button>
    </div>
  `;

  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);

  document.getElementById('logoff-cancel').addEventListener('click', () => overlay.remove());

  document.getElementById('logoff-confirm').addEventListener('click', async () => {
    const btn = document.getElementById('logoff-confirm');
    btn.disabled = true;
    btn.textContent = 'Sending...';

    try {
      const docId = currentSession && currentSession.docId;
      if (docId) {
        await fetch(SEND_NOW_URL + '?docId=' + encodeURIComponent(docId), { method: 'POST' });
      }
    } catch (e) {
      console.error('Logoff email send failed:', e);
    }

    setCurrentSession(null);
    setUserData(null);
    window.location.replace('/app/');
  });
}

export async function renderDashboard(container) {
  container.innerHTML = `
    <div class="screen dashboard-screen">
      <div class="dash-header">
        <img src="/DiscoverMoreLogo.png" alt="Discover More" class="dash-logo">
        <div class="dash-divider"></div>
        <div id="welcome-text" class="welcome-text">Welcome</div>
        <div class="dash-divider-sm"></div>
      </div>
      <div class="dash-buttons" id="dash-buttons">
        <button class="dash-btn" id="btn-surveys">Take Surveys</button>
        <button class="dash-btn" id="btn-results" disabled>Survey Results</button>
        <button class="dash-btn" id="btn-profile">Profile</button>
        <button class="dash-btn" id="btn-resources">Resources</button>
      </div>
      <div id="top-gifts" class="top-gifts"></div>
      <div style="margin-top:24px;text-align:center;">
        <button id="btn-logoff" style="background:none;border:none;color:#757575;font-size:0.85rem;padding:8px 16px;cursor:pointer;text-decoration:underline;font-family:inherit;">
          Log Off (we'll email you a link to come back)
        </button>
      </div>
    </div>
  `;

  // Navigation — always attach these first
  document.getElementById('btn-surveys').addEventListener('click', () => navigate('/personality'));
  document.getElementById('btn-results').addEventListener('click', () => navigate('/results'));
  document.getElementById('btn-profile').addEventListener('click', () => navigate('/profile'));
  document.getElementById('btn-resources').addEventListener('click', () => navigate('/resources'));
  document.getElementById('btn-logoff').addEventListener('click', showLogoffModal);

  // Load user data
  try {
    if (!currentSession) return;

    let data = userData;
    if (!data) {
      const userDoc = await getDoc(doc(db, 'results', currentSession.docId));
      if (userDoc.exists()) {
        data = userDoc.data();
        setUserData(data);
      }
    }

    if (data) {
      const name = data.NAME || currentSession.email;
      document.getElementById('welcome-text').textContent = 'Welcome ' + name.split(' ')[0];

      const surveyDone = data.updated && data.updated !== '1';
      const resultsBtn = document.getElementById('btn-results');
      const surveysBtn = document.getElementById('btn-surveys');

      if (surveyDone) {
        resultsBtn.disabled = false;
        showTopGifts(data);
      } else {
        surveysBtn.classList.add('pulse');
      }
    }
  } catch (e) {
    console.error('Error loading user data:', e);
  }
}

function showTopGifts(data) {
  const scores = [];
  for (let i = 0; i < 24; i++) {
    const zz1 = Number(data['ZZ' + (i + 1)]) || 0;
    const zz2 = Number(data['ZZ' + (i + 25)]) || 0;
    const zz3 = Number(data['ZZ' + (i + 49)]) || 0;
    scores.push({ index: i, score: Math.min(zz1 + zz2 + zz3, 9) });
  }
  scores.sort((a, b) => b.score - a.score);
  const top3 = scores.slice(0, 3);

  const giftsEl = document.getElementById('top-gifts');
  giftsEl.innerHTML = `<h3>Top 3 Spiritual Gifts</h3>
    <div class="gifts-list-v2">` + top3.map(g => {
    const gift = SPIRITUAL_GIFTS[g.index];
    return `
      <div class="gift-card-v2 gift-top">
        <div class="gift-card-v2-header" onclick="this.parentElement.classList.toggle('expanded')">
          <span class="gift-card-v2-name">${gift.name}</span>
          <span class="gift-card-v2-score">Score: ${g.score}</span>
          <span class="gift-card-v2-chevron">&#9660;</span>
        </div>
        <div class="gift-card-v2-body">
          <p class="gift-card-v2-desc">${gift.description}</p>
          <p class="gift-card-v2-verse">${gift.verse}</p>
          <p class="gift-card-v2-teams">${gift.teams}</p>
        </div>
      </div>
    `;
  }).join('') + `</div>`;
}
