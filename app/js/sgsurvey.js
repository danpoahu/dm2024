import { auth, db, doc, getDoc, updateDoc, collection, query, where, getDocs } from './firebase-config.js';
import { navigate, userData, setUserData } from './app.js';
import { SG_QUESTIONS } from './data.js';

export function renderSGSurvey(container) {
  const responses = new Array(72).fill(0);
  let currentQ = 0;

  container.innerHTML = `
    <div class="screen survey-screen">
      <div class="survey-header">
        <h2>Spiritual Gifts Survey</h2>
        <p class="survey-subtitle">Rate each statement: 1 (Not at all), 2 (Sometimes), 3 (Mostly true)</p>
        <div class="progress-bar"><div class="progress-fill" id="sg-progress-fill"></div></div>
        <div class="progress-text" id="sg-progress-text">0 of 72</div>
      </div>
      <div class="carousel-container" id="sg-carousel"></div>
      <div class="carousel-nav">
        <button class="carousel-nav-btn" id="sg-prev">&#9664;</button>
        <span class="carousel-counter" id="sg-counter">1 / 72</span>
        <button class="carousel-nav-btn" id="sg-next">&#9654;</button>
      </div>
      <button class="btn btn-primary survey-submit" id="sg-submit" disabled>Submit & View Results</button>
    </div>
  `;

  const carouselEl = document.getElementById('sg-carousel');

  SG_QUESTIONS.forEach((q, idx) => {
    const card = document.createElement('div');
    card.className = 'carousel-card' + (idx === 0 ? ' active' : '');
    card.dataset.idx = idx;
    card.innerHTML = `
      <div class="question-card carousel-question">
        <div class="question-num">${idx + 1}</div>
        <div class="question-text">${q}</div>
        <div class="answer-buttons sg-answers" data-q="${idx}">
          ${[1,2,3].map(v => `<button class="answer-btn sg-answer-${v}" data-val="${v}">${v}</button>`).join('')}
        </div>
      </div>
    `;
    carouselEl.appendChild(card);
  });

  const prevBtn = document.getElementById('sg-prev');
  const nextBtn = document.getElementById('sg-next');
  const counterEl = document.getElementById('sg-counter');

  function showCard(idx) {
    currentQ = Math.max(0, Math.min(idx, 71));
    carouselEl.querySelectorAll('.carousel-card').forEach(c => c.classList.remove('active'));
    carouselEl.querySelector(`[data-idx="${currentQ}"]`).classList.add('active');
    counterEl.textContent = `${currentQ + 1} / 72`;
    prevBtn.disabled = currentQ === 0;
    nextBtn.disabled = currentQ === 71;
  }

  prevBtn.addEventListener('click', () => showCard(currentQ - 1));
  nextBtn.addEventListener('click', () => showCard(currentQ + 1));

  // Swipe support
  let touchStartX = 0;
  carouselEl.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
  carouselEl.addEventListener('touchend', e => {
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0 && currentQ < 71) showCard(currentQ + 1);
      else if (diff < 0 && currentQ > 0) showCard(currentQ - 1);
    }
  }, { passive: true });

  // Handle answer selection
  carouselEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.answer-btn');
    if (!btn) return;
    const group = btn.parentElement;
    const qIdx = parseInt(group.dataset.q);
    const val = parseInt(btn.dataset.val);

    group.querySelectorAll('.answer-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    responses[qIdx] = val;

    updateSGProgress(responses);

    // Auto-advance after short delay
    setTimeout(() => {
      if (currentQ < 71) showCard(currentQ + 1);
    }, 350);
  });

  document.getElementById('sg-submit').addEventListener('click', async () => {
    const btn = document.getElementById('sg-submit');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    const updates = {};
    for (let j = 0; j < 72; j++) {
      updates[`ZZ${j + 1}`] = responses[j];
    }

    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const year = now.getFullYear();
    updates.updated = `${month}/${day}/${year}`;

    try {
      const docRef = await getDocRef();
      await updateDoc(docRef, updates);
      if (userData) {
        Object.assign(userData, updates);
        setUserData(userData);
      }
      navigate('/results');
    } catch (e) {
      console.error('Error saving SG:', e);
      btn.disabled = false;
      btn.textContent = 'Submit & View Results';
    }
  });

  // Pre-fill if user has existing data
  if (userData) {
    for (let j = 0; j < 72; j++) {
      const v = Number(userData[`ZZ${j + 1}`]) || 0;
      if (v > 0) {
        responses[j] = v;
        selectSGAnswer(j, v);
      }
    }
    updateSGProgress(responses);
    // Jump to first unanswered
    const firstUnanswered = responses.findIndex(v => v === 0);
    if (firstUnanswered >= 0) showCard(firstUnanswered);
  }
}

function selectSGAnswer(qIdx, val) {
  const group = document.querySelector(`.sg-answers[data-q="${qIdx}"]`);
  if (!group) return;
  const btn = group.querySelector(`[data-val="${val}"]`);
  if (btn) btn.classList.add('selected');
}

function updateSGProgress(responses) {
  const answered = responses.filter(v => v > 0).length;
  document.getElementById('sg-progress-fill').style.width = `${(answered / 72) * 100}%`;
  document.getElementById('sg-progress-text').textContent = `${answered} of 72`;
  document.getElementById('sg-submit').disabled = answered < 72;
}

async function getDocRef() {
  const user = auth.currentUser;
  const uidDoc = await getDoc(doc(db, "results", user.uid));
  if (uidDoc.exists()) return doc(db, "results", user.uid);
  const q = query(collection(db, "results"), where("EMAIL", "==", user.email));
  const snap = await getDocs(q);
  if (!snap.empty) return snap.docs[0].ref;
  return doc(db, "results", user.uid);
}
