import { navigate, userData } from './app.js?v=34';
import { SPIRITUAL_GIFTS } from './data.js?v=34';

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

  // Sort scores — break ties randomly
  const sorted = [
    { letter: 'D', score: dTotal, r: Math.random() },
    { letter: 'I', score: iTotal, r: Math.random() },
    { letter: 'S', score: sTotal, r: Math.random() },
    { letter: 'C', score: cTotal, r: Math.random() }
  ].sort((a, b) => b.score - a.score || b.r - a.r);

  // Assign colors by rank: 1st=green, 2nd=orange, 3rd/4th=brown
  const RANK_COLORS = ['#4CAF50', '#FF9800', '#A67C52', '#A67C52'];
  const rankColorMap = {};
  sorted.forEach((s, i) => { rankColorMap[s.letter] = RANK_COLORS[i]; });

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
            ${buildQuadrantBox('D', dTotal, topTwo, rankColorMap)}
            ${buildQuadrantBox('I', iTotal, topTwo, rankColorMap)}
            ${buildQuadrantBox('C', cTotal, topTwo, rankColorMap)}
            ${buildQuadrantBox('S', sTotal, topTwo, rankColorMap)}
          </div>
        </div>
        <div class="disc-type-label">
          <span class="disc-type-high" style="color:${rankColorMap[sorted[0].letter]}">${sorted[0].letter}</span>
          <span class="disc-type-slash">/</span>
          <span class="disc-type-low" style="color:${rankColorMap[sorted[1].letter]}">${sorted[1].letter}</span>
        </div>
        <p class="disc-hint">Tap any quadrant for more info</p>
      </div>

      <div class="results-divider"></div>

      <button class="results-pdf-btn" id="results-pdf">📄 Download PDF Results</button>

      <div class="results-divider"></div>

      <div class="results-section">
        <h3 class="gifts-title">Your Top Spiritual Gifts</h3>
        <div class="gifts-list-v2">
          ${gifts.filter(g => g.score >= 8).map(g => `
            <div class="gift-card-v2 gift-top" data-gift="${g.index}">
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
      showDiscModal(letter, rankColorMap);
    });
  });

  // Gift card expand/collapse
  document.querySelectorAll('.gift-card-v2').forEach(card => {
    card.querySelector('.gift-card-v2-header').addEventListener('click', () => {
      card.classList.toggle('expanded');
    });
  });

  // PDF download
  document.getElementById('results-pdf').addEventListener('click', async () => {
    const btn = document.getElementById('results-pdf');
    btn.disabled = true;
    btn.textContent = 'Generating PDF...';
    try {
      await generatePDF();
    } catch(e) {
      console.error('PDF generation error:', e);
      alert('Error generating PDF. Please try again.');
    }
    btn.disabled = false;
    btn.textContent = '📄 Download PDF Results';
  });

  // Animate fills after render
  requestAnimationFrame(() => {
    document.querySelectorAll('.disc-box-fill').forEach(fill => {
      const pct = fill.dataset.pct;
      fill.style.height = pct + '%';
    });
  });
}

function buildQuadrantBox(letter, score, topTwo, rankColorMap) {
  const isTop = topTwo.includes(letter);
  const color = rankColorMap[letter];
  const pct = Math.round((score / 25) * 100);
  return `
    <div class="disc-box ${isTop ? 'disc-box-top' : 'disc-box-bottom'}" data-letter="${letter}">
      <div class="disc-box-fill" data-pct="${pct}" style="background:${color};height:0%"></div>
      <div class="disc-box-content">
        <span class="disc-box-letter">${letter}</span>
        <span class="disc-box-score">${score}</span>
      </div>
    </div>
  `;
}

function showDiscModal(letter, rankColorMap) {
  const info = DISC_INFO[letter];
  const color = rankColorMap[letter];
  const existing = document.getElementById('disc-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'disc-modal';
  modal.className = 'disc-modal-overlay';
  modal.innerHTML = `
    <div class="disc-modal-card">
      <button class="disc-modal-close">&times;</button>
      <div class="disc-modal-letter" style="color:${color}">${letter}</div>
      <div class="disc-modal-label">${info.label}</div>
      <p class="disc-modal-desc">${info.description}</p>
      <div class="disc-modal-advice">
        ${info.advice.map(a => `
          <div class="disc-modal-advice-item">
            <span class="disc-modal-bullet" style="background:${color}"></span>
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

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = url;
  });
}

async function generatePDF() {
  if (!window.jspdf) {
    alert('PDF library not loaded. Please check your internet connection and reload.');
    return;
  }

  const data = userData;
  if (!data) return;

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const W = 792, H = 612;

  // Cream background
  pdf.setFillColor(245, 241, 232);
  pdf.rect(0, 0, W, H, 'F');

  // Logo
  try {
    const logoData = await loadImage('/DiscoverMoreLogo.png');
    pdf.addImage(logoData, 'PNG', W / 2 - 110, 15, 220, 48);
  } catch (e) {
    pdf.setFontSize(22);
    pdf.setTextColor(76, 175, 80);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Discover More', W / 2, 45, { align: 'center' });
  }

  // Title
  pdf.setFontSize(16);
  pdf.setTextColor(76, 175, 80);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Survey Results', W / 2, 78, { align: 'center' });

  // Name and date
  const name = data.NAME || '';
  const dateStr = data.updated || '';
  pdf.setFontSize(10);
  pdf.setTextColor(100, 100, 100);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`${name}     ${dateStr}`, W / 2, 94, { align: 'center' });

  // Orange divider
  pdf.setFillColor(255, 152, 0);
  pdf.rect(40, 102, W - 80, 2.5, 'F');

  // === DISC Section (left) ===
  const dTotal = sum(data, 'D');
  const iTotal = sum(data, 'I');
  const sTotal = sum(data, 'S');
  const cTotal = sum(data, 'C');

  const discSorted = [
    { letter: 'D', score: dTotal },
    { letter: 'I', score: iTotal },
    { letter: 'S', score: sTotal },
    { letter: 'C', score: cTotal }
  ].sort((a, b) => b.score - a.score);

  const topTwo = [discSorted[0].letter, discSorted[1].letter];

  // Rank-based colors for PDF: 1st=green, 2nd=orange, 3rd/4th=brown
  const PDF_RANK_COLORS = [[76, 175, 80], [255, 152, 0], [166, 124, 82], [166, 124, 82]];
  const DISC_COLORS = {};
  discSorted.forEach((s, i) => { DISC_COLORS[s.letter] = PDF_RANK_COLORS[i]; });

  pdf.setFontSize(13);
  pdf.setTextColor(27, 75, 90);
  pdf.setFont('helvetica', 'bold');
  pdf.text('DISC Personality', 180, 128, { align: 'center' });

  // 2x2 grid
  const boxSz = 72;
  const boxGap = 5;
  const gridStartX = 180 - boxSz - boxGap / 2;
  const gridStartY = 142;

  const boxLayout = [
    { letter: 'D', score: dTotal, x: gridStartX, y: gridStartY },
    { letter: 'I', score: iTotal, x: gridStartX + boxSz + boxGap, y: gridStartY },
    { letter: 'C', score: cTotal, x: gridStartX, y: gridStartY + boxSz + boxGap },
    { letter: 'S', score: sTotal, x: gridStartX + boxSz + boxGap, y: gridStartY + boxSz + boxGap }
  ];

  boxLayout.forEach(box => {
    const col = DISC_COLORS[box.letter];
    const isTop = topTwo.includes(box.letter);
    const fillPct = Math.round((box.score / 25) * 100);
    const fillH = (fillPct / 100) * boxSz;

    // Gray background
    pdf.setFillColor(220, 220, 220);
    pdf.roundedRect(box.x, box.y, boxSz, boxSz, 6, 6, 'F');

    // Color fill from bottom
    if (fillH > 0) {
      pdf.setFillColor(col[0], col[1], col[2]);
      const fillY = box.y + boxSz - fillH;
      pdf.rect(box.x + 1, fillY, boxSz - 2, fillH - 1, 'F');
    }

    // Border
    if (isTop) {
      pdf.setDrawColor(27, 75, 90);
      pdf.setLineWidth(2.5);
    } else {
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.5);
    }
    pdf.roundedRect(box.x, box.y, boxSz, boxSz, 6, 6, 'S');

    // Letter
    pdf.setFontSize(26);
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.text(box.letter, box.x + boxSz / 2, box.y + boxSz / 2 + 4, { align: 'center' });

    // Score
    pdf.setFontSize(10);
    pdf.setTextColor(50, 50, 50);
    pdf.setFont('helvetica', 'normal');
    pdf.text(String(box.score), box.x + boxSz / 2, box.y + boxSz / 2 + 18, { align: 'center' });
  });

  // Type label (colored letters)
  const typeY = gridStartY + 2 * boxSz + boxGap + 25;
  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  const topLetter = discSorted[0].letter;
  const secLetter = discSorted[1].letter;
  const tc1 = DISC_COLORS[topLetter];
  const tc2 = DISC_COLORS[secLetter];
  const letterW = pdf.getTextWidth(topLetter);
  const slashW = pdf.getTextWidth(' / ');
  const secW = pdf.getTextWidth(secLetter);
  const totalTypeW = letterW + slashW + secW;
  const typeStartX = 180 - totalTypeW / 2;

  pdf.setTextColor(tc1[0], tc1[1], tc1[2]);
  pdf.text(topLetter, typeStartX, typeY);
  pdf.setTextColor(50, 50, 50);
  pdf.text(' / ', typeStartX + letterW, typeY);
  pdf.setTextColor(tc2[0], tc2[1], tc2[2]);
  pdf.text(secLetter, typeStartX + letterW + slashW, typeY);

  // Description
  pdf.setFontSize(8.5);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(60, 60, 60);
  const discDesc = DISC_INFO[topLetter].description;
  const descLines = pdf.splitTextToSize(discDesc, 280);
  pdf.text(descLines.slice(0, 4), 40, typeY + 20);

  // Advice bullets
  const advice = DISC_INFO[topLetter].advice;
  let advY = typeY + 20 + Math.min(descLines.length, 4) * 12 + 10;
  pdf.setFontSize(8);
  advice.forEach(a => {
    pdf.setFillColor(tc1[0], tc1[1], tc1[2]);
    pdf.circle(48, advY - 3, 2.5, 'F');
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(60, 60, 60);
    pdf.text(a, 56, advY);
    advY += 13;
  });

  // === Top 3 Spiritual Gifts (right side) ===
  const gifts = [];
  for (let g = 0; g < 24; g++) {
    const zz1 = Number(data[`ZZ${g + 1}`]) || 0;
    const zz2 = Number(data[`ZZ${g + 25}`]) || 0;
    const zz3 = Number(data[`ZZ${g + 49}`]) || 0;
    gifts.push({ index: g, name: SPIRITUAL_GIFTS[g].name, score: Math.min(zz1 + zz2 + zz3, 9) });
  }
  gifts.sort((a, b) => b.score - a.score);
  const top3 = gifts.slice(0, 3);

  const rightX = 370;
  const cardW = 382;

  pdf.setFontSize(13);
  pdf.setTextColor(27, 75, 90);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Top 3 Spiritual Gifts', rightX + cardW / 2, 128, { align: 'center' });

  let cardY = 142;
  top3.forEach((gift) => {
    const info = SPIRITUAL_GIFTS[gift.index];
    const cardH = 88;

    // Card background
    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(rightX, cardY, cardW, cardH, 6, 6, 'F');
    pdf.setDrawColor(255, 152, 0);
    pdf.setLineWidth(1.5);
    pdf.roundedRect(rightX, cardY, cardW, cardH, 6, 6, 'S');

    // Name
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(255, 152, 0);
    pdf.text(info.name, rightX + 10, cardY + 16);

    // Score
    pdf.setFontSize(10);
    pdf.setTextColor(76, 175, 80);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Score: ' + gift.score, rightX + cardW - 10, cardY + 16, { align: 'right' });

    // Description (max 3 lines)
    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(60, 60, 60);
    const dLines = pdf.splitTextToSize(info.description, cardW - 20);
    pdf.text(dLines.slice(0, 3), rightX + 10, cardY + 30);

    // Verse
    const verseY = cardY + 30 + Math.min(dLines.length, 3) * 10 + 4;
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'italic');
    pdf.setTextColor(120, 120, 120);
    const vLines = pdf.splitTextToSize(info.verse, cardW - 20);
    pdf.text(vLines.slice(0, 1), rightX + 10, verseY);

    // Teams
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(76, 175, 80);
    const tLines = pdf.splitTextToSize('Teams: ' + info.teams, cardW - 20);
    pdf.text(tLines.slice(0, 2), rightX + 10, verseY + 12);

    cardY += cardH + 8;
  });

  // === Bottom: Remaining Gifts ===
  const bottomDividerY = Math.max(cardY + 10, 440);
  pdf.setFillColor(255, 152, 0);
  pdf.rect(40, bottomDividerY, W - 80, 2, 'F');

  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(27, 75, 90);
  pdf.text('Remaining Spiritual Gifts', 40, bottomDividerY + 18);

  const remaining = gifts.slice(3);
  const cols = 3;
  const colW = (W - 80) / cols;
  const remStartY = bottomDividerY + 34;

  remaining.forEach((g, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 40 + col * colW;
    const y = remStartY + row * 14;

    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(60, 60, 60);
    const nameText = g.name;
    pdf.text(nameText, x, y);

    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(76, 175, 80);
    const nameW = pdf.getTextWidth(nameText);
    pdf.text(' (' + g.score + ')', x + nameW, y);
  });

  // Footer
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'italic');
  pdf.setTextColor(150, 150, 150);
  pdf.text('Generated by Discover More - Anchor Church', W / 2, H - 15, { align: 'center' });

  // Save
  pdf.save('DiscoverMore-Results.pdf');
}
