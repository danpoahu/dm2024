import { navigate, userData } from './app.js';
import { SPIRITUAL_GIFTS } from './data.js';

export function renderResults(container) {
  const data = userData;
  if (!data) { navigate('/dashboard'); return; }

  // DISC totals
  const dTotal = sum(data, 'D');
  const iTotal = sum(data, 'I');
  const sTotal = sum(data, 'S');
  const cTotal = sum(data, 'C');
  const discMax = Math.max(dTotal, iTotal, sTotal, cTotal, 1);

  // Spiritual Gifts scores
  const gifts = [];
  for (let g = 0; g < 24; g++) {
    const zz1 = Number(data[`ZZ${g + 1}`]) || 0;
    const zz2 = Number(data[`ZZ${g + 25}`]) || 0;
    const zz3 = Number(data[`ZZ${g + 49}`]) || 0;
    gifts.push({ index: g, name: SPIRITUAL_GIFTS[g].name, score: Math.min(zz1 + zz2 + zz3, 9) });
  }
  gifts.sort((a, b) => b.score - a.score);

  // DISC quadrant position
  const taskPeople = (iTotal + sTotal) - (dTotal + cTotal);
  const extroIntro = (dTotal + iTotal) - (sTotal + cTotal);

  container.innerHTML = `
    <div class="screen results-screen">
      <div class="results-header">
        <h2>Your Results</h2>
        <button class="btn btn-link back-btn" id="results-back">&larr; Dashboard</button>
      </div>

      <div class="results-section">
        <h3>DISC Personality Profile</h3>
        <div class="disc-bars">
          <div class="disc-bar-row">
            <span class="disc-label" style="color:#FF9800">D</span>
            <div class="disc-bar-track"><div class="disc-bar-fill disc-d" style="width:${(dTotal/25)*100}%">${dTotal}</div></div>
          </div>
          <div class="disc-bar-row">
            <span class="disc-label" style="color:#4CAF50">I</span>
            <div class="disc-bar-track"><div class="disc-bar-fill disc-i" style="width:${(iTotal/25)*100}%">${iTotal}</div></div>
          </div>
          <div class="disc-bar-row">
            <span class="disc-label" style="color:#A67C52">S</span>
            <div class="disc-bar-track"><div class="disc-bar-fill disc-s" style="width:${(sTotal/25)*100}%">${sTotal}</div></div>
          </div>
          <div class="disc-bar-row">
            <span class="disc-label" style="color:#D4B896">C</span>
            <div class="disc-bar-track"><div class="disc-bar-fill disc-c" style="width:${(cTotal/25)*100}%">${cTotal}</div></div>
          </div>
        </div>

        <div class="disc-quadrant">
          <canvas id="disc-chart" width="280" height="280"></canvas>
        </div>
        <div class="disc-type">Your type: <strong>${data.discH || ''}${data.discL || ''}</strong></div>
      </div>

      <div class="results-section">
        <h3>Spiritual Gifts</h3>
        <div class="gifts-list">
          ${gifts.map((g, idx) => `
            <div class="gift-row ${g.score >= 8 ? 'gift-highlight' : ''}" onclick="this.querySelector('.gift-detail')?.classList.toggle('show')">
              <div class="gift-row-header">
                <span class="gift-rank">${idx + 1}.</span>
                <span class="gift-name">${g.name}</span>
                <span class="gift-score-badge ${g.score >= 8 ? 'high-score' : ''}">${g.score}</span>
              </div>
              <div class="gift-detail">
                <p>${SPIRITUAL_GIFTS[g.index].description}</p>
                <p class="gift-verse">${SPIRITUAL_GIFTS[g.index].verse}</p>
                <p class="gift-teams"><strong>Teams:</strong> ${SPIRITUAL_GIFTS[g.index].teams}</p>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  document.getElementById('results-back').addEventListener('click', () => navigate('/dashboard'));

  // Draw quadrant chart
  drawQuadrant(dTotal, iTotal, sTotal, cTotal);
}

function sum(data, letter) {
  let total = 0;
  for (let j = 1; j <= 5; j++) total += Number(data[`${letter}${j}`]) || 0;
  return total;
}

function drawQuadrant(d, i, s, c) {
  const canvas = document.getElementById('disc-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const cx = w / 2, cy = h / 2;

  // Background
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);

  // Quadrant colors (matching native app: orange, green, brown, tan)
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#FF9800'; ctx.fillRect(0, 0, cx, cy);       // D - top-left
  ctx.fillStyle = '#4CAF50'; ctx.fillRect(cx, 0, cx, cy);      // I - top-right
  ctx.fillStyle = '#A67C52'; ctx.fillRect(0, cy, cx, h - cy);  // S - bottom-left
  ctx.fillStyle = '#D4B896'; ctx.fillRect(cx, cy, cx, h - cy); // C - bottom-right
  ctx.globalAlpha = 1;

  // Grid lines
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke();

  // Labels
  ctx.fillStyle = '#333';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('D', 30, 25);
  ctx.fillText('I', w - 30, 25);
  ctx.fillText('S', 30, h - 12);
  ctx.fillText('C', w - 30, h - 12);

  // Axis labels
  ctx.font = '10px sans-serif';
  ctx.fillStyle = '#888';
  ctx.fillText('Task', cx, 12);
  ctx.fillText('People', cx, h - 4);
  ctx.save();
  ctx.translate(10, cy); ctx.rotate(-Math.PI / 2);
  ctx.fillText('Extroverted', 0, 0); ctx.restore();
  ctx.save();
  ctx.translate(w - 4, cy); ctx.rotate(Math.PI / 2);
  ctx.fillText('Introverted', 0, 0); ctx.restore();

  // Plot point
  const maxScore = 25;
  const taskPeople = ((i + s) - (d + c)) / (maxScore * 2);
  const extroIntro = ((d + i) - (s + c)) / (maxScore * 2);
  const px = cx + taskPeople * (w * 0.4);
  const py = cy - extroIntro * (h * 0.4);

  // Dot
  ctx.beginPath();
  ctx.arc(px, py, 10, 0, Math.PI * 2);
  ctx.fillStyle = '#2E7D32';
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Letter in dot
  const sorted = [['D', d], ['I', i], ['S', s], ['C', c]].sort((a, b) => b[1] - a[1]);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(sorted[0][0], px, py);
}
