import {
  auth, db, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, doc, setDoc, Timestamp
} from './firebase-config.js?v=33';

export function renderLogin(container) {
  container.innerHTML = `
    <div class="screen login-screen">
      <img src="/DiscoverMoreLogo.png" alt="Discover More" class="login-logo">
      <div class="login-card" id="login-card">
        <div id="login-form">
          <h2>Welcome</h2>
          <input type="email" id="login-email" placeholder="Email" autocomplete="email">
          <input type="password" id="login-password" placeholder="Password" autocomplete="current-password">
          <div id="login-error" class="error-msg"></div>
          <button id="login-btn" class="btn btn-primary">Login</button>
          <button id="show-signup-btn" class="btn btn-secondary">Create New Account</button>
          <button id="forgot-btn" class="btn btn-link">Forgot Password?</button>
        </div>
        <div id="signup-form" style="display:none">
          <h2>Create Account</h2>
          <input type="text" id="signup-name" placeholder="Full Name (First Last)" autocomplete="name">
          <input type="email" id="signup-email" placeholder="Email" autocomplete="email">
          <input type="tel" id="signup-phone" placeholder="Phone (optional)" autocomplete="tel">
          <input type="password" id="signup-password" placeholder="Password (min 6 characters)" autocomplete="new-password">
          <div id="signup-error" class="error-msg"></div>
          <button id="signup-btn" class="btn btn-primary">Create Account</button>
          <button id="show-login-btn" class="btn btn-link">Back to Login</button>
        </div>
        <div id="forgot-form" style="display:none">
          <h2>Reset Password</h2>
          <p class="form-hint">Enter your email and we'll send a reset link.</p>
          <input type="email" id="forgot-email" placeholder="Email" autocomplete="email">
          <div id="forgot-error" class="error-msg"></div>
          <div id="forgot-success" class="success-msg"></div>
          <button id="forgot-send-btn" class="btn btn-primary">Send Reset Email</button>
          <button id="forgot-back-btn" class="btn btn-link">Back to Login</button>
        </div>
      </div>
    </div>
  `;

  // Toggle forms
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const forgotForm = document.getElementById('forgot-form');

  document.getElementById('show-signup-btn').addEventListener('click', () => {
    loginForm.style.display = 'none';
    signupForm.style.display = 'block';
  });

  document.getElementById('show-login-btn').addEventListener('click', () => {
    signupForm.style.display = 'none';
    loginForm.style.display = 'block';
  });

  document.getElementById('forgot-btn').addEventListener('click', () => {
    loginForm.style.display = 'none';
    forgotForm.style.display = 'block';
    document.getElementById('forgot-email').value = document.getElementById('login-email').value;
  });

  document.getElementById('forgot-back-btn').addEventListener('click', () => {
    forgotForm.style.display = 'none';
    loginForm.style.display = 'block';
  });

  // Login
  document.getElementById('login-btn').addEventListener('click', async () => {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = '';

    if (!email || !password) { errorEl.textContent = 'Please enter email and password.'; return; }

    const btn = document.getElementById('login-btn');
    btn.disabled = true;
    btn.textContent = 'Signing in...';
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e) {
      errorEl.textContent = friendlyError(e.code);
      btn.disabled = false;
      btn.textContent = 'Login';
    }
  });

  // Enter key support
  ['login-email', 'login-password'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('login-btn').click();
    });
  });

  // Signup
  document.getElementById('signup-btn').addEventListener('click', async () => {
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const phone = document.getElementById('signup-phone').value.trim();
    const password = document.getElementById('signup-password').value;
    const errorEl = document.getElementById('signup-error');
    errorEl.textContent = '';

    if (!name || !name.includes(' ')) { errorEl.textContent = 'Please enter your first and last name.'; return; }
    if (!email) { errorEl.textContent = 'Please enter your email.'; return; }
    if (password.length < 6) { errorEl.textContent = 'Password must be at least 6 characters.'; return; }

    const btn = document.getElementById('signup-btn');
    btn.disabled = true;
    btn.textContent = 'Creating account...';
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const data = {
        EMAIL: email.trim(),
        NAME: name,
        Phone1: phone,
        uid: cred.user.uid,
        created: Timestamp.now(),
        updated: "1",
        env: "Web",
        discH: "", discL: "",
        Notes: "", Team: "",
        Follow: "false", Letter: "false", NoServe: "false",
        Serving: "false", Swag: "false", W1: "false", W2: "false",
        _sFixFlag: crypto.randomUUID()
      };
      for (let j = 1; j <= 5; j++) {
        data[`D${j}`] = 1; data[`I${j}`] = 1;
        data[`S${j}`] = 1; data[`C${j}`] = 1;
      }
      for (let j = 1; j <= 72; j++) { data[`ZZ${j}`] = 1; }
      await setDoc(doc(db, "results", cred.user.uid), data);
    } catch (e) {
      errorEl.textContent = friendlyError(e.code);
      btn.disabled = false;
      btn.textContent = 'Create Account';
    }
  });

  // Forgot password
  document.getElementById('forgot-send-btn').addEventListener('click', async () => {
    const email = document.getElementById('forgot-email').value.trim();
    const errorEl = document.getElementById('forgot-error');
    const successEl = document.getElementById('forgot-success');
    errorEl.textContent = '';
    successEl.textContent = '';

    if (!email) { errorEl.textContent = 'Please enter your email.'; return; }
    try {
      await sendPasswordResetEmail(auth, email);
      successEl.textContent = 'Reset email sent! Check your inbox.';
    } catch (e) {
      errorEl.textContent = friendlyError(e.code);
    }
  });
}

function friendlyError(code) {
  const map = {
    'auth/user-not-found': 'No account found with that email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/invalid-email': 'Invalid email address.',
    'auth/email-already-in-use': 'An account with that email already exists.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/invalid-credential': 'Invalid email or password.'
  };
  return map[code] || 'An error occurred. Please try again.';
}
