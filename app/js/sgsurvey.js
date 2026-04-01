import { db, doc, updateDoc } from './firebase-config.js';
import { navigate, userData, setUserData, currentSession } from './app.js';
import { SG_QUESTIONS } from './data.js';

export function renderSGSurvey(container) {
  const responses = new Array(72).fill(0);
  const touched = new Array(72).fill(false);
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
      <div id="sg-saving" class="survey-submit" style="display:none;text-align:center;font-weight:700;color:var(--green);font-size:1.05rem;">Saving...</div>
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

    touched[qIdx] = true;
    updateSGProgress(responses, touched);

    // Advance to next, or auto-save if all done
    setTimeout(() => {
      if (touched.every(Boolean)) {
        autoSaveSG(responses);
      } else if (currentQ < 71) {
        showCard(currentQ + 1);
      }
    }, 350);
  });

  async function autoSaveSG(responses) {
    document.getElementById('sg-saving').style.display = 'block';

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
      const docRef = doc(db, 'results', currentSession.docId);
      await updateDoc(docRef, updates);
      if (userData) {
        Object.assign(userData, updates);
        setUserData(userData);
      }
      navigate('/results');
    } catch (e) {
      console.error('Error saving SG:', e);
      document.getElementById('sg-saving').style.display = 'none';
    }
  }

  // Pre-fill only if user has actually completed surveys before
  if (userData && userData.updated && userData.updated !== '1') {
    for (let j = 0; j < 72; j++) {
      const v = Number(userData[`ZZ${j + 1}`]) || 0;
      if (v > 0) {
        responses[j] = v;
        touched[j] = true;
        selectSGAnswer(j, v);
      }
    }
    updateSGProgress(responses, touched);
    const firstUnanswered = touched.findIndex(v => !v);
    if (firstUnanswered >= 0) showCard(firstUnanswered);
  }
}

function selectSGAnswer(qIdx, val) {
  const group = document.querySelector(`.sg-answers[data-q="${qIdx}"]`);
  if (!group) return;
  const btn = group.querySelector(`[data-val="${val}"]`);
  if (btn) btn.classList.add('selected');
}

function updateSGProgress(responses, touched) {
  const answered = touched.filter(Boolean).length;
  document.getElementById('sg-progress-fill').style.width = `${(answered / 72) * 100}%`;
  document.getElementById('sg-progress-text').textContent = `${answered} of 72`;
}
