/**
 * Discover More – Help Chat Widget
 * Connects to Firebase Cloud Function → Claude API
 */

const CHAT_FUNCTION_URL = 'https://us-central1-dm-auth-65cc4.cloudfunctions.net/dmHelpChat';

let chatOpen = false;
let chatHistory = [];

export function initChat() {
  injectChatHTML();
  bindChatEvents();
}

function injectChatHTML() {
  const wrapper = document.createElement('div');
  wrapper.id = 'dm-chat-widget';
  wrapper.innerHTML = `
    <!-- FAB Button -->
    <button class="dm-chat-fab" id="dmChatFab" aria-label="Help Chat">
      <svg class="dm-chat-icon" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12z"/><path d="M7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z"/></svg>
      <svg class="dm-chat-close" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
    </button>

    <!-- Chat Panel -->
    <div class="dm-chat-panel" id="dmChatPanel">
      <div class="dm-chat-header">
        <div class="dm-chat-header-icon">
          <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
        </div>
        <div class="dm-chat-header-text">
          <h3>DM Help</h3>
          <p>Discover More App Support</p>
        </div>
      </div>

      <div class="dm-chat-messages" id="dmChatMessages">
        <div class="dm-chat-msg bot">Hi! I'm the Discover More help assistant. I can help with logging in, taking surveys, viewing your results, sharing PDFs, and more. How can I help?</div>
      </div>

      <div class="dm-chat-typing" id="dmChatTyping">
        <span></span><span></span><span></span>
      </div>

      <div class="dm-chat-input-area">
        <input class="dm-chat-input" id="dmChatInput" type="text" placeholder="Ask a question..." autocomplete="off">
        <button class="dm-chat-send" id="dmChatSend" aria-label="Send">
          <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(wrapper);
}

function bindChatEvents() {
  const fab = document.getElementById('dmChatFab');
  const panel = document.getElementById('dmChatPanel');
  const input = document.getElementById('dmChatInput');
  const sendBtn = document.getElementById('dmChatSend');

  fab.addEventListener('click', () => {
    chatOpen = !chatOpen;
    fab.classList.toggle('open', chatOpen);
    panel.classList.toggle('open', chatOpen);
    if (chatOpen) {
      setTimeout(() => input.focus(), 100);
    }
  });

  sendBtn.addEventListener('click', () => sendMessage());

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

async function sendMessage() {
  const input = document.getElementById('dmChatInput');
  const text = input.value.trim();
  if (!text) return;

  // Add user message
  appendMessage(text, 'user');
  input.value = '';
  input.disabled = true;
  document.getElementById('dmChatSend').disabled = true;

  // Show typing indicator
  showTyping(true);

  // Add to history
  chatHistory.push({ role: 'user', content: text });

  try {
    const response = await fetch(CHAT_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: chatHistory.slice(-10) // Send last 10 messages for context
      })
    });

    if (!response.ok) throw new Error('Network error');

    const data = await response.json();
    const reply = data.reply || "Sorry, I'm having trouble right now. Please try again in a moment.";

    chatHistory.push({ role: 'assistant', content: reply });
    appendMessage(reply, 'bot');
  } catch (err) {
    console.error('Chat error:', err);
    appendMessage("Sorry, I couldn't connect right now. For immediate help, email info@discovermore.app", 'bot');
  } finally {
    showTyping(false);
    input.disabled = false;
    document.getElementById('dmChatSend').disabled = false;
    input.focus();
  }
}

function appendMessage(text, type) {
  const container = document.getElementById('dmChatMessages');
  const msg = document.createElement('div');
  msg.className = `dm-chat-msg ${type}`;
  msg.textContent = text;
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

function showTyping(show) {
  const typing = document.getElementById('dmChatTyping');
  typing.classList.toggle('visible', show);
  if (show) {
    const container = document.getElementById('dmChatMessages');
    container.scrollTop = container.scrollHeight;
  }
}
