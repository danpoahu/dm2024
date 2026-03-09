import { navigate } from './app.js';
import { WAYS_TO_SERVE } from './data.js';

export function renderResources(container) {
  container.innerHTML = `
    <div class="screen resources-screen">
      <div class="screen-header">
        <button class="btn btn-link back-btn" id="resources-back">&larr; Dashboard</button>
        <h2>Resources</h2>
      </div>

      <div class="resource-links">
        <a href="https://discovermore.app/pdf/Discovery1.pdf" target="_blank" class="resource-card">
          <span class="resource-icon">&#128196;</span>
          <span>Discovery 1</span>
        </a>
        <a href="https://discovermore.app/pdf/Discovery2.pdf" target="_blank" class="resource-card">
          <span class="resource-icon">&#128196;</span>
          <span>Discovery 2</span>
        </a>
        <a href="https://discovermore.app/pdf/Discovery3.pdf" target="_blank" class="resource-card">
          <span class="resource-icon">&#128196;</span>
          <span>Discovery 3</span>
        </a>
        <a href="https://www.myanchor.church/" target="_blank" class="resource-card">
          <span class="resource-icon">&#9962;</span>
          <span>Anchor Church Website</span>
        </a>
      </div>

      <div class="ways-to-serve">
        <h3>Ways to Serve</h3>
        <div class="serve-list">
          ${WAYS_TO_SERVE.map(w => `
            <div class="serve-card" onclick="this.classList.toggle('expanded')">
              <div class="serve-header">
                <span>${w.name}</span>
                <span class="serve-chevron">&#9660;</span>
              </div>
              <div class="serve-body">
                <p>${w.description}</p>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  document.getElementById('resources-back').addEventListener('click', () => navigate('/dashboard'));
}
