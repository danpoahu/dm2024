import { navigate } from './app.js?v=27';
import { WAYS_TO_SERVE } from './data.js?v=27';

export function renderResources(container) {
  container.innerHTML = `
    <div class="screen res-screen">
      <button class="results-close-btn" id="resources-back">&times;</button>
      <div class="res-top">
        <img src="/DiscoverMoreLogo.png" alt="Discover More" class="res-logo">
        <h2 class="res-title">Resources</h2>
      </div>

      <div class="dash-buttons">
        <a href="https://discovermore.app/pdf/Discovery1.pdf" target="_blank" class="dash-btn">Discovery 1 PDF</a>
        <a href="https://discovermore.app/pdf/Discovery2.pdf" target="_blank" class="dash-btn">Discovery 2 PDF</a>
        <a href="https://discovermore.app/pdf/Discovery3.pdf" target="_blank" class="dash-btn">Discovery 3 PDF</a>
        <button class="dash-btn" id="ways-to-serve-btn">Ways to Serve</button>
        <a href="https://www.myanchor.church/" target="_blank" class="dash-btn">Anchor Church Website</a>
      </div>

      <div class="res-divider"></div>
      <p class="res-footer">Browse resources, download the course PDF, or learn more about serving with Anchor Church.</p>
    </div>
  `;

  document.getElementById('resources-back').addEventListener('click', () => navigate('/dashboard'));
  document.getElementById('ways-to-serve-btn').addEventListener('click', showWaysToServe);
}

function showWaysToServe() {
  const PER_PAGE = 5;
  const pageCount = Math.ceil(WAYS_TO_SERVE.length / PER_PAGE);
  let currentPage = 0;
  let expandedIdx = -1;

  const overlay = document.createElement('div');
  overlay.className = 'wts-overlay';
  overlay.innerHTML = `
    <div class="wts-card">
      <button class="wts-close">&times;</button>
      <img src="/DiscoverMoreLogo.png" alt="Discover More" class="wts-logo">
      <h2 class="wts-title">Ways to Serve</h2>
      <div class="wts-divider"></div>
      <div class="wts-items" id="wts-items"></div>
      <div class="wts-pagination">
        <button class="wts-page-btn" id="wts-prev">&#9664;</button>
        <div class="wts-dots" id="wts-dots"></div>
        <button class="wts-page-btn" id="wts-next">&#9654;</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const itemsEl = document.getElementById('wts-items');
  const dotsEl = document.getElementById('wts-dots');
  const prevBtn = document.getElementById('wts-prev');
  const nextBtn = document.getElementById('wts-next');

  function renderPage() {
    const start = currentPage * PER_PAGE;
    const pageItems = WAYS_TO_SERVE.slice(start, start + PER_PAGE);
    expandedIdx = -1;

    itemsEl.innerHTML = pageItems.map((w, i) => {
      const globalIdx = start + i;
      // Parse description for "Requirements:" keyword
      let desc = w.description;
      const reqIdx = desc.indexOf('Requirements:');
      if (reqIdx !== -1) {
        desc = desc.substring(0, reqIdx) +
          '<strong class="wts-req">Requirements:</strong>' +
          desc.substring(reqIdx + 'Requirements:'.length);
      }
      return `
        <div class="wts-item" data-idx="${globalIdx}">
          <div class="wts-item-header">
            <span class="wts-item-name">${w.name}</span>
            <span class="wts-item-chevron">&#8250;</span>
          </div>
          <div class="wts-item-body">
            <div class="wts-item-scroll">
              <p>${desc}</p>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Dots
    dotsEl.innerHTML = Array.from({ length: pageCount }, (_, i) =>
      `<span class="wts-dot ${i === currentPage ? 'active' : ''}"></span>`
    ).join('');

    // Button states
    prevBtn.disabled = currentPage === 0;
    nextBtn.disabled = currentPage === pageCount - 1;

    // Expand/collapse handlers
    itemsEl.querySelectorAll('.wts-item').forEach(item => {
      item.querySelector('.wts-item-header').addEventListener('click', () => {
        const idx = parseInt(item.dataset.idx);
        if (expandedIdx === idx) {
          item.classList.remove('expanded');
          expandedIdx = -1;
        } else {
          itemsEl.querySelectorAll('.wts-item.expanded').forEach(el => el.classList.remove('expanded'));
          item.classList.add('expanded');
          expandedIdx = idx;
        }
      });
    });
  }

  prevBtn.addEventListener('click', () => { if (currentPage > 0) { currentPage--; renderPage(); } });
  nextBtn.addEventListener('click', () => { if (currentPage < pageCount - 1) { currentPage++; renderPage(); } });

  overlay.querySelector('.wts-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  renderPage();
}
