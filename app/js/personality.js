import { auth, db, doc, getDoc, updateDoc, collection, query, where, getDocs } from './firebase-config.js';
import { navigate, userData, setUserData } from './app.js';
import { DISC_QUESTIONS } from './data.js';

export function renderPersonality(container) {
  const responses = new Array(20).fill(0);

  container.innerHTML = `
    <div class="screen survey-screen">
      <div class="survey-header">
        <h2>Personality Survey</h2>
        <p class="survey-subtitle">Rate each statement from 1 (Least) to 5 (Most)</p>
        <div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>
        <div class="progress-text" id="progress-text">0 of 20</div>
      </div>
      <div class="survey-questions" id="survey-questions"></div>
      <button class="btn btn-primary survey-submit" id="disc-next" disabled>Continue to Spiritual Gifts</button>
    </div>
  `;

  const questionsEl = document.getElementById('survey-questions');

  DISC_QUESTIONS.forEach((q, idx) => {
    const qEl = document.createElement('div');
    qEl.className = 'question-card';
    qEl.innerHTML = `
      <div class="question-num">${idx + 1}</div>
      <div class="question-text">${q}</div>
      <div class="answer-buttons" data-q="${idx}">
        ${[1,2,3,4,5].map(v => `<button class="answer-btn answer-${v}" data-val="${v}">${v}</button>`).join('')}
      </div>
    `;
    questionsEl.appendChild(qEl);
  });

  // Handle answer selection
  questionsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.answer-btn');
    if (!btn) return;
    const group = btn.parentElement;
    const qIdx = parseInt(group.dataset.q);
    const val = parseInt(btn.dataset.val);

    group.querySelectorAll('.answer-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    responses[qIdx] = val;

    updateProgress(responses);
  });

  document.getElementById('disc-next').addEventListener('click', async () => {
    const btn = document.getElementById('disc-next');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    // Calculate DISC scores: pattern is D,I,S,C repeating in groups of 4
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

    // Calculate high/low DISC
    const totals = { D: d.reduce((a, b) => a + b, 0), I: i.reduce((a, b) => a + b, 0), S: s.reduce((a, b) => a + b, 0), C: c.reduce((a, b) => a + b, 0) };
    const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    updates.discH = sorted[0][0];
    updates.discL = sorted.length > 1 ? sorted[1][0] : "";

    try {
      const docRef = await getDocRef();
      await updateDoc(docRef, updates);
      if (userData) {
        Object.assign(userData, updates);
        setUserData(userData);
      }
      navigate('/sgsurvey');
    } catch (e) {
      console.error('Error saving DISC:', e);
      btn.disabled = false;
      btn.textContent = 'Continue to Spiritual Gifts';
    }
  });

  // Pre-fill if user already has data
  if (userData) {
    for (let g = 0; g < 5; g++) {
      const dv = Number(userData[`D${g+1}`]) || 0;
      const iv = Number(userData[`I${g+1}`]) || 0;
      const sv = Number(userData[`S${g+1}`]) || 0;
      const cv = Number(userData[`C${g+1}`]) || 0;
      if (dv > 0) { responses[g*4+0] = dv; selectAnswer(g*4+0, dv); }
      if (iv > 0) { responses[g*4+1] = iv; selectAnswer(g*4+1, iv); }
      if (sv > 0) { responses[g*4+2] = sv; selectAnswer(g*4+2, sv); }
      if (cv > 0) { responses[g*4+3] = cv; selectAnswer(g*4+3, cv); }
    }
    updateProgress(responses);
  }
}

function selectAnswer(qIdx, val) {
  const group = document.querySelector(`.answer-buttons[data-q="${qIdx}"]`);
  if (!group) return;
  const btn = group.querySelector(`[data-val="${val}"]`);
  if (btn) btn.classList.add('selected');
}

function updateProgress(responses) {
  const answered = responses.filter(v => v > 0).length;
  document.getElementById('progress-fill').style.width = `${(answered / 20) * 100}%`;
  document.getElementById('progress-text').textContent = `${answered} of 20`;
  document.getElementById('disc-next').disabled = answered < 20;
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
