import {
  auth, db, doc, getDoc, updateDoc, collection, query, where, getDocs,
  reauthenticateWithCredential, EmailAuthProvider, deleteUser
} from './firebase-config.js';
import { navigate, userData, setUserData } from './app.js';

export function renderProfile(container) {
  const data = userData || {};

  container.innerHTML = `
    <div class="screen profile-screen">
      <div class="screen-header">
        <button class="btn btn-link back-btn" id="profile-back">&larr; Dashboard</button>
        <h2>Profile</h2>
      </div>
      <div class="form-card">
        <label>Name</label>
        <input type="text" id="profile-name" value="${data.NAME || ''}" placeholder="First Last">
        <label>Phone</label>
        <input type="tel" id="profile-phone" value="${data.Phone1 || ''}" placeholder="Phone number">
        <label>Email</label>
        <input type="email" id="profile-email" value="${data.EMAIL || auth.currentUser?.email || ''}" disabled>
        <div id="profile-msg" class="success-msg"></div>
        <div id="profile-error" class="error-msg"></div>
        <button class="btn btn-primary" id="profile-save">Update Profile</button>
      </div>
      <div class="form-card privacy-card">
        <h3>Privacy & Settings</h3>
        <a href="https://info.discovermore.app/privacy.html" target="_blank" class="privacy-link">Privacy Policy</a>
        <a href="https://info.discovermore.app/terms.html" target="_blank" class="privacy-link">Terms of Use</a>
        <a href="mailto:info@discovermore.app" class="privacy-link">Contact Support</a>
        <hr class="divider">
        <button class="btn btn-danger" id="delete-account-btn">Delete Account</button>
      </div>
      <div id="delete-modal" class="modal" style="display:none">
        <div class="modal-content">
          <h3>Delete Account</h3>
          <p class="warning-text">This action is permanent and cannot be undone. All your data will be deleted.</p>
          <input type="password" id="delete-password" placeholder="Enter your password to confirm">
          <div id="delete-error" class="error-msg"></div>
          <div class="modal-buttons">
            <button class="btn btn-secondary" id="delete-cancel">Cancel</button>
            <button class="btn btn-danger" id="delete-confirm">Delete Forever</button>
          </div>
        </div>
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
      const docRef = await getDocRef();
      await updateDoc(docRef, { NAME: name, Phone1: phone });
      if (userData) { userData.NAME = name; userData.Phone1 = phone; setUserData(userData); }
      msgEl.textContent = 'Profile updated!';
      setTimeout(() => { msgEl.textContent = ''; }, 3000);
    } catch (e) {
      errEl.textContent = 'Error updating profile.';
    }
  });

  // Delete account
  document.getElementById('delete-account-btn').addEventListener('click', () => {
    document.getElementById('delete-modal').style.display = 'flex';
  });
  document.getElementById('delete-cancel').addEventListener('click', () => {
    document.getElementById('delete-modal').style.display = 'none';
  });
  document.getElementById('delete-confirm').addEventListener('click', async () => {
    const password = document.getElementById('delete-password').value;
    const errEl = document.getElementById('delete-error');
    errEl.textContent = '';

    if (!password) { errEl.textContent = 'Please enter your password.'; return; }

    try {
      const user = auth.currentUser;
      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);
      await deleteUser(user);
    } catch (e) {
      errEl.textContent = 'Incorrect password or error deleting account.';
    }
  });
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
