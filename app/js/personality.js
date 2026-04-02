import { db, doc, updateDoc } from './firebase-config.js?v=26';
import { navigate, userData, setUserData, currentSession } from './app.js?v=26';
import { DISC_QUESTIONS } from './data.js?v=26';

export function renderPersonality(container) {
  const responses = new Array(20).fill(0);
  const touched = new Array(20).fill(false);
  let currentQ = 0;

  container.innerHTML = `
    <div class="screen survey-screen">
      <div class="survey-header">
        <h2>Personality Survey</h2>
        <p class="survey-subtitle">Rate each statement from 1 (Least) to 5 (Most)</p>
        <div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>
        <div class="progress-text" id="progress-text">0 of 20</div>
      </div>
      <div class="carousel-container" id="carousel-container"></div>
      <div class="carousel-nav">
        <button class="carousel-nav-btn" id="carousel-prev">&#9664;</button>
        <span class="carousel-counter" id="carousel-counter">1 / 20</span>
        <button class="carousel-nav-btn" id="carousel-next">&#9654;</button>
      </div>
      <div id="disc-saving" class="survey-submit" style="display:none;text-align:center;font-weight:700;color:var(--green);font-size:1.05rem;">Saving...</div>
    </div>
  `;

  const carouselEl = document.getElementById('carousel-container');

  // Build all cards (hidden by default)
  DISC_QUESTIONS.forEach((q, idx) => {
    const card = document.createElement('div');
    card.className = 'carousel-card' + (idx === 0 ? ' active' : '');
    card.dataset.idx = idx;
    card.innerHTML = `
      <div class="question-card carousel-question">
        <div class="question-num">${idx + 1}</div>
        <div class="question-text">${q}</div>
        <div class="answer-buttons" data-q="${idx}">
          ${[1,2,3,4,5].map(v => `<button class="answer-btn answer-${v}" data-val="${v}">${v}</button>`).join('')}
        </div>
      </div>
    `;
    carouselEl.appendChild(card);
  });

  const prevBtn = document.getElementById('carousel-prev');
  const nextBtn = document.getElementById('carousel-next');
  const counterEl = document.getElementById('carousel-counter');

  function showCard(idx) {
    currentQ = Math.max(0, Math.min(idx, 19));
    carouselEl.querySelectorAll('.carousel-card').forEach(c => c.classList.remove('active'));
    carouselEl.querySelector(`[data-idx="${currentQ}"]`).classList.add('active');
    counterEl.textContent = `${currentQ + 1} / 20`;
    prevBtn.disabled = currentQ === 0;
    nextBtn.disabled = currentQ === 19;
  }

  prevBtn.addEventListener('click', () => showCard(currentQ - 1));
  nextBtn.addEventListener('click', () => showCard(currentQ + 1));

  // Swipe support
  let touchStartX = 0;
  carouselEl.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
  carouselEl.addEventListener('touchend', e => {
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0 && currentQ < 19) showCard(currentQ + 1);
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
    updateProgress(responses, touched);

    // Advance to next, or auto-save on last card
    setTimeout(() => {
      if (currentQ < 19) {
        showCard(currentQ + 1);
      } else {
        // On last card — fill skipped questions with 1 and save
        for (let k = 0; k < 20; k++) {
          if (!touched[k]) { responses[k] = 1; touched[k] = true; }
        }
        updateProgress(responses, touched);
        autoSaveDISC(responses);
      }
    }, 350);
  });

  async function autoSaveDISC(responses) {
    document.getElementById('disc-saving').style.display = 'block';

    const d = [], i = [], s = [], c = [];
    for (let g = 0; g < 5; g++) {
      d.push(responses[g * 4 + 0]);
      i.push(responses[g * 4 + 1]);
      s.push(responses[g * 4 + 2]);
      c.push(responses[g * 4 + 3]);
    }

    const updates = {};
    for (let j = 0; j < 5; j++) {
      updates[`D${j + 1}`] = d[j];
      updates[`I${j + 1}`] = i[j];
      updates[`S${j + 1}`] = s[j];
      updates[`C${j + 1}`] = c[j];
    }

    const totals = { D: d.reduce((a, b) => a + b, 0), I: i.reduce((a, b) => a + b, 0), S: s.reduce((a, b) => a + b, 0), C: c.reduce((a, b) => a + b, 0) };
    const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    updates.discH = sorted[0][0];
    updates.discL = sorted.length > 1 ? sorted[1][0] : "";

    try {
      const docRef = doc(db, 'results', currentSession.docId);
      await updateDoc(docRef, updates);
      if (userData) {
        Object.assign(userData, updates);
        setUserData(userData);
      }
      navigate('/sgsurvey');
    } catch (e) {
      console.error('Error saving DISC:', e);
      document.getElementById('disc-saving').style.display = 'none';
    }
  }

  // Pre-fill only if user has actually completed this survey before (updated !== "1")
  if (userData && userData.updated && userData.updated !== '1') {
    for (let g = 0; g < 5; g++) {
      const dv = Number(userData[`D${g+1}`]) || 0;
      const iv = Number(userData[`I${g+1}`]) || 0;
      const sv = Number(userData[`S${g+1}`]) || 0;
      const cv = Number(userData[`C${g+1}`]) || 0;
      if (dv > 0) { responses[g*4+0] = dv; touched[g*4+0] = true; selectAnswer(g*4+0, dv); }
      if (iv > 0) { responses[g*4+1] = iv; touched[g*4+1] = true; selectAnswer(g*4+1, iv); }
      if (sv > 0) { responses[g*4+2] = sv; touched[g*4+2] = true; selectAnswer(g*4+2, sv); }
      if (cv > 0) { responses[g*4+3] = cv; touched[g*4+3] = true; selectAnswer(g*4+3, cv); }
    }
    updateProgress(responses, touched);
    const firstUnanswered = touched.findIndex(v => !v);
    if (firstUnanswered >= 0) showCard(firstUnanswered);
  }
}

function selectAnswer(qIdx, val) {
  const group = document.querySelector(`.answer-buttons[data-q="${qIdx}"]`);
  if (!group) return;
  const btn = group.querySelector(`[data-val="${val}"]`);
  if (btn) btn.classList.add('selected');
}

function updateProgress(responses, touched) {
  const answered = touched.filter(Boolean).length;
  document.getElementById('progress-fill').style.width = `${(answered / 20) * 100}%`;
  document.getElementById('progress-text').textContent = `${answered} of 20`;
}
