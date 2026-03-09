import { auth, db, doc, getDoc, signOut, collection, query, where, getDocs } from './firebase-config.js';
import { navigate, setUserData, userData } from './app.js';
import { SPIRITUAL_GIFTS } from './data.js';

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
        <button class="dash-btn dash-btn-logout" id="btn-logout">Log Off</button>
      </div>
      <div id="top-gifts" class="top-gifts"></div>
    </div>
  `;

  // Load user data
  try {
    const user = auth.currentUser;
    if (!user) return;

    // Try fetching by UID first, then by email query
    let data = null;
    const uidDoc = await getDoc(doc(db, "results", user.uid));
    if (uidDoc.exists()) {
      data = uidDoc.data();
    } else {
      const q = query(collection(db, "results"), where("EMAIL", "==", user.email));
      const snap = await getDocs(q);
      if (!snap.empty) {
        data = snap.docs[0].data();
      }
    }

    if (data) {
      setUserData(data);
      const name = data.NAME || user.email;
      document.getElementById('welcome-text').textContent = `Welcome ${name.split(' ')[0]}`;

      const surveyDone = data.updated && data.updated !== "1";
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

  // Navigation
  document.getElementById('btn-surveys').addEventListener('click', () => navigate('/personality'));
  document.getElementById('btn-results').addEventListener('click', () => navigate('/results'));
  document.getElementById('btn-profile').addEventListener('click', () => navigate('/profile'));
  document.getElementById('btn-resources').addEventListener('click', () => navigate('/resources'));
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await signOut(auth);
  });
}

function showTopGifts(data) {
  const scores = [];
  for (let i = 0; i < 24; i++) {
    const zz1 = Number(data[`ZZ${i + 1}`]) || 0;
    const zz2 = Number(data[`ZZ${i + 25}`]) || 0;
    const zz3 = Number(data[`ZZ${i + 49}`]) || 0;
    scores.push({ index: i, score: Math.min(zz1 + zz2 + zz3, 9) });
  }
  scores.sort((a, b) => b.score - a.score);
  const top3 = scores.slice(0, 3);

  const giftsEl = document.getElementById('top-gifts');
  giftsEl.innerHTML = `<h3>Top 3 Spiritual Gifts</h3>` + top3.map(g => {
    const gift = SPIRITUAL_GIFTS[g.index];
    return `
      <div class="gift-card">
        <div class="gift-card-header" onclick="this.parentElement.classList.toggle('expanded')">
          <span class="gift-name">${gift.name}</span>
          <span class="gift-score">Score: ${g.score}</span>
          <span class="gift-chevron">&#9660;</span>
        </div>
        <div class="gift-card-body">
          <p>${gift.description}</p>
          <p class="gift-verse">${gift.verse}</p>
          <p class="gift-teams"><strong>Teams:</strong> ${gift.teams}</p>
        </div>
      </div>
    `;
  }).join('');
}
