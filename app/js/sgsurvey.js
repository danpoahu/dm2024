import { auth, db, doc, getDoc, updateDoc, collection, query, where, getDocs } from './firebase-config.js';
import { navigate, userData, setUserData } from './app.js';
import { SG_QUESTIONS } from './data.js';

export function renderSGSurvey(container) {
  const responses = new Array(72).fill(0);

  container.innerHTML = `
    <div class="screen survey-screen">
      <div class="survey-header">
        <h2>Spiritual Gifts Survey</h2>
        <p class="survey-subtitle">Rate each statement: 1 (Not at all), 2 (Sometimes), 3 (Mostly true)</p>
        <div class="progress-bar"><div class="progress-fill" id="sg-progress-fill"></div></div>
        <div class="progress-text" id="sg-progress-text">0 of 72</div>
      </div>
      <div class="survey-questions" id="sg-questions"></div>
      <button class="btn btn-primary survey-submit" id="sg-submit" disabled>Submit & View Results</button>
    </div>
  `;

  const questionsEl = document.getElementById('sg-questions');

  SG_QUESTIONS.forEach((q, idx) => {
    const qEl = document.createElement('div');
    qEl.className = 'question-card';
    qEl.innerHTML = `
      <div class="question-num">${idx + 1}</div>
      <div class="question-text">${q}</div>
      <div class="answer-buttons sg-answers" data-q="${idx}">
        ${[1,2,3].map(v => `<button class="answer-btn sg-answer-${v}" data-val="${v}">${v}</button>`).join('')}
      </div>
    `;
    questionsEl.appendChild(qEl);
  });

  questionsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.answer-btn');
    if (!btn) return;
    const group = btn.parentElement;
    const qIdx = parseInt(group.dataset.q);
    const val = parseInt(btn.dataset.val);

    group.querySelectorAll('.answer-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    responses[qIdx] = val;

    updateSGProgress(responses);
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
