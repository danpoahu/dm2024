import { db, doc, updateDoc } from './firebase-config.js?v=31';
import { navigate, userData, setUserData, currentSession } from './app.js?v=31';

export function renderProfile(container) {
  const data = userData || {};

  container.innerHTML = `
    <div class="screen profile-screen">
      <button class="results-close-btn" id="profile-back">&times;</button>
      <div class="res-top">
        <img src="/DiscoverMoreLogo.png" alt="Discover More" class="res-logo">
        <h2 class="results-title">Profile</h2>
        <div class="results-divider"></div>
      </div>

      <div class="form-card">
        <label>Name</label>
        <input type="text" id="profile-name" value="${data.NAME || ''}" placeholder="First Last">
        <label>Phone</label>
        <input type="tel" id="profile-phone" value="${data.Phone1 || ''}" placeholder="Phone number">
        <label>Email</label>
        <input type="email" id="profile-email" value="${data.EMAIL || (currentSession ? currentSession.email : '')}" disabled>
        <div id="profile-msg" class="success-msg"></div>
        <div id="profile-error" class="error-msg"></div>
        <button class="btn btn-primary" id="profile-save">Update Profile</button>
      </div>

      <div class="form-card privacy-card">
        <h3>Privacy & Settings</h3>
        <a href="https://danpoahu.github.io/DPConsulting/privacy.html" target="_blank" class="privacy-link">Privacy Policy</a>
        <a href="/terms.html" target="_blank" class="privacy-link">Terms of Use</a>
        <a href="https://danpoahu.github.io/DPConsulting/support.html" target="_blank" class="privacy-link">Contact Support</a>
      </div>
    </div>
  `;

  document.getElementById('profile-back').addEventListener('click', () => navigate('/dashboard'));

  document.getElementById('profile-save').addEventListener('click', async () => {
    const name = document.getElementById('profile-name').value.trim();
    const phone = document.getElementById('profile-phone').value.trim();
    const msgEl = document.getElementById('profile-msg');
    const errEl = document.getElementById('profile-error');
    msgEl.textContent = '';
    errEl.textContent = '';

    if (!name || !name.includes(' ')) { errEl.textContent = 'Please enter first and last name.'; return; }

    try {
      const docRef = doc(db, 'results', currentSession.docId);
      await updateDoc(docRef, { NAME: name, Phone1: phone });
      if (userData) { userData.NAME = name; userData.Phone1 = phone; setUserData(userData); }
      msgEl.textContent = 'Profile updated!';
      setTimeout(() => { msgEl.textContent = ''; }, 3000);
    } catch (e) {
      errEl.textContent = 'Error updating profile.';
    }
  });
}
