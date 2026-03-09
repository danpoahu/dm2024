import { navigate, userData } from './app.js';
import { SPIRITUAL_GIFTS } from './data.js';

const DISC_INFO = {
  D: {
    label: 'Dominant',
    color: '#4CAF50',
    description: 'D personalities are dominant, direct, and task-oriented. They are decisive, competitive, and results-driven.',
    advice: [
      'Focus on results and bottom line',
      'Be direct and to the point',
      'Give them authority to make decisions',
      'Provide challenges and variety'
    ]
  },
  I: {
    label: 'Influential',
    color: '#FF9800',
    description: 'I personalities are influential, outgoing, and people-oriented. They are enthusiastic, optimistic, and collaborative.',
    advice: [
      'Provide a fun, social environment',
      'Give verbal recognition and praise',
      'Avoid too many details and routine',
      'Let them express their ideas openly'
    ]
  },
  S: {
    label: 'Steady',
    color: '#A67C52',
    description: 'S personalities are steady, stable, and people-oriented. They are patient, reliable, and analytical.',
    advice: [
      'Provide a stable, secure environment',
      'Give them time to adjust to changes',
      'Show sincere appreciation',
      'Be patient and supportive'
    ]
  },
  C: {
    label: 'Compliant',
    color: '#D4B896',
    description: 'C personalities are compliant, careful, and task-oriented. They are goal-oriented, detail-focused, and competent.',
    advice: [
      'Provide clear expectations and standards',
      'Give them time to analyze information',
      'Focus on quality and accuracy',
      'Respect their need for independence'
    ]
  }
};

export function renderResults(container) {
  const data = userData;
  if (!data) { navigate('/dashboard'); return; }

  const dTotal = sum(data, 'D');
  const iTotal = sum(data, 'I');
  const sTotal = sum(data, 'S');
  const cTotal = sum(data, 'C');

  // Sort scores to find top 2
  const sorted = [
    { letter: 'D', score: dTotal },
    { letter: 'I', score: iTotal },
    { letter: 'S', score: sTotal },
    { letter: 'C', score: cTotal }
  ].sort((a, b) => b.score - a.score);

  const topTwo = [sorted[0].letter, sorted[1].letter];

  // Spiritual Gifts scores
  const gifts = [];
  for (let g = 0; g < 24; g++) {
    const zz1 = Number(data[`ZZ${g + 1}`]) || 0;
    const zz2 = Number(data[`ZZ${g + 25}`]) || 0;
    const zz3 = Number(data[`ZZ${g + 49}`]) || 0;
    gifts.push({ index: g, name: SPIRITUAL_GIFTS[g].name, score: Math.min(zz1 + zz2 + zz3, 9) });
  }
  gifts.sort((a, b) => b.score - a.score);

  container.innerHTML = `
    <div class="screen results-screen">
      <button class="results-close-btn" id="results-back">&times;</button>
      <div class="results-top">
        <img src="/DiscoverMoreLogo.png" alt="Discover More" class="results-logo">
        <h2 class="results-title">Survey Results</h2>
        <div class="results-divider"></div>
      </div>

      <div class="results-section">
        <div class="disc-quadrant-grid">
          <div class="disc-axis-label disc-axis-top">Extroverted</div>
          <div class="disc-axis-label disc-axis-bottom">Introverted</div>
          <div class="disc-axis-label disc-axis-left">Task</div>
          <div class="disc-axis-label disc-axis-right">People</div>
          <div class="disc-grid">
            ${buildQuadrantBox('D', dTotal, topTwo)}
            ${buildQuadrantBox('I', iTotal, topTwo)}
            ${buildQuadrantBox('C', cTotal, topTwo)}
            ${buildQuadrantBox('S', sTotal, topTwo)}
          </div>
        </div>
        <div class="disc-type-label">
          <span class="disc-type-high" style="color:${DISC_INFO[sorted[0].letter].color}">${sorted[0].letter}</span>
          <span class="disc-type-slash">/</span>
          <span class="disc-type-low" style="color:${DISC_INFO[sorted[1].letter].color}">${sorted[1].letter}</span>
        </div>
        <p class="disc-hint">Tap any quadrant for more info</p>
      </div>

      <div class="results-divider"></div>

      <div class="results-section">
        <h3 class="gifts-title">Your Spiritual Gifts</h3>
        <div class="gifts-list-v2">
          ${gifts.map(g => `
            <div class="gift-card-v2 ${g.score >= 8 ? 'gift-top' : ''}" data-gift="${g.index}">
              <div class="gift-card-v2-header">
                <span class="gift-card-v2-name">${g.name}</span>
                <span class="gift-card-v2-score">Score: ${g.score}</span>
                <span class="gift-card-v2-chevron">&#9660;</span>
              </div>
              <div class="gift-card-v2-body">
                <p class="gift-card-v2-desc">${SPIRITUAL_GIFTS[g.index].description}</p>
                <p class="gift-card-v2-verse">${SPIRITUAL_GIFTS[g.index].verse}</p>
                <p class="gift-card-v2-teams">${SPIRITUAL_GIFTS[g.index].teams}</p>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  // Close button
  document.getElementById('results-back').addEventListener('click', () => navigate('/dashboard'));

  // Quadrant tap handlers
  document.querySelectorAll('.disc-box').forEach(box => {
    box.addEventListener('click', () => {
      const letter = box.dataset.letter;
      showDiscModal(letter);
    });
  });

  // Gift card expand/collapse
  document.querySelectorAll('.gift-card-v2').forEach(card => {
    card.querySelector('.gift-card-v2-header').addEventListener('click', () => {
      card.classList.toggle('expanded');
    });
  });

  // Animate fills after render
  requestAnimationFrame(() => {
    document.querySelectorAll('.disc-box-fill').forEach(fill => {
      const pct = fill.dataset.pct;
      fill.style.height = pct + '%';
    });
  });
}

function buildQuadrantBox(letter, score, topTwo) {
  const info = DISC_INFO[letter];
  const isTop = topTwo.includes(letter);
  const pct = Math.round((score / 25) * 100);
  return `
    <div class="disc-box ${isTop ? 'disc-box-top' : 'disc-box-bottom'}" data-letter="${letter}">
      <div class="disc-box-fill" data-pct="${pct}" style="background:${info.color};height:0%"></div>
      <div class="disc-box-content">
        <span class="disc-box-letter">${letter}</span>
        <span class="disc-box-score">${score}</span>
      </div>
    </div>
  `;
}

function showDiscModal(letter) {
  const info = DISC_INFO[letter];
  const existing = document.getElementById('disc-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'disc-modal';
  modal.className = 'disc-modal-overlay';
  modal.innerHTML = `
    <div class="disc-modal-card">
      <button class="disc-modal-close">&times;</button>
      <div class="disc-modal-letter" style="color:${info.color}">${letter}</div>
      <div class="disc-modal-label">${info.label}</div>
      <p class="disc-modal-desc">${info.description}</p>
      <div class="disc-modal-advice">
        ${info.advice.map(a => `
          <div class="disc-modal-advice-item">
            <span class="disc-modal-bullet" style="background:${info.color}"></span>
            <span>${a}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal || e.target.classList.contains('disc-modal-close')) {
      modal.remove();
    }
  });
}

function sum(data, letter) {
  let total = 0;
  for (let j = 1; j <= 5; j++) total += Number(data[`${letter}${j}`]) || 0;
  return total;
}
