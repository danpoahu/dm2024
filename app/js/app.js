import { auth, onAuthStateChanged } from './firebase-config.js';
import { renderLogin } from './auth.js';
import { renderDashboard } from './dashboard.js';
import { renderPersonality } from './personality.js';
import { renderSGSurvey } from './sgsurvey.js';
import { renderResults } from './results.js';
import { renderProfile } from './profile.js';
import { renderResources } from './resources.js';

const appEl = document.getElementById('app');

// Global user state
export let currentUser = null;
export let userData = null;

export function setUserData(data) { userData = data; }

// Router
const routes = {
  '/login': renderLogin,
  '/dashboard': renderDashboard,
  '/personality': renderPersonality,
  '/sgsurvey': renderSGSurvey,
  '/results': renderResults,
  '/profile': renderProfile,
  '/resources': renderResources
};

export function navigate(path) {
  window.location.hash = path;
}

function handleRoute() {
  const hash = window.location.hash.slice(1) || '/login';
  const render = routes[hash];
  if (render) {
    appEl.innerHTML = '';
    render(appEl);
  } else {
    navigate('/login');
  }
}

window.addEventListener('hashchange', handleRoute);

// Auth state listener
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) {
    const hash = window.location.hash.slice(1);
    if (!hash || hash === '/login') {
      navigate('/dashboard');
    } else {
      handleRoute();
    }
  } else {
    userData = null;
    navigate('/login');
  }
});

// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/app/sw.js').catch(() => {});
}

// Initial route
handleRoute();
