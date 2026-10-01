"use strict";

// ============================================================
// Muxbee frontend
// ============================================================

const STORAGE_KEY = "muxbee_chats_v1";
const ACTIVE_CHAT_KEY = "muxbee_active_chat_v1";
const MODE_KEY = "muxbee_mode_v1";

const MAX_STORED_CHATS = 30;

const modes = {
  general: {
    name: "General",
    icon: "✦",
    description: "Everyday questions and conversations"
  },

  translation: {
    name: "Translation",
    icon: "文",
    description: "English, Hausa & Nigerian Pidgin"
  },

  business: {
    name: "Business",
    icon: "₦",
    description: "Ideas, branding and business help"
  },

  phone: {
    name: "Phone Help",
    icon: "⌁",
    description: "Troubleshoot your phone"
  },

  writing: {
    name: "Writing",
    icon: "✎",
    description: "Write, rewrite and improve"
  },

  student: {
    name: "Student",
    icon: "◇",
    description: "WAEC, NECO, JAMB & school help"
  },

  islamic: {
    name: "Islamic",
    icon: "☾",
    description: "Respectful Islamic questions"
  }
};

const suggestions = [
  {
    icon: "⚡",
    text: "Help me understand JavaScript",
    subtext: "Learn by building"
  },

  {
    icon: "₦",
    text: "Give me a practical business idea",
    subtext: "For a Nigerian market"
  },

  {
    icon: "◌",
    text: "My phone is running very slowly",
    subtext: "Let's troubleshoot it"
  },

  {
    icon: "文",
    text: "Translate this into Nigerian Pidgin",
    subtext: "Natural, not word-for-word"
  }
];

// ============================================================
// DOM
// ============================================================

const elements = {
  sidebar: document.getElementById("sidebar"),
  sidebarOverlay: document.getElementById("sidebarOverlay"),

  brandButton: document.getElementById("brandButton"),
  newChatButton: document.getElementById("newChatButton"),
  mobileMenuButton: document.getElementById("mobileMenuButton"),

  historyList: document.getElementById("historyList"),
  emptyHistory: document.getElementById("emptyHistory"),

  chatArea: document.getElementById("chatArea"),
  welcomeScreen: document.getElementById("welcomeScreen"),
  messages: document.getElementById("messages"),
  suggestionGrid: document.getElementById("suggestionGrid"),

  composerForm: document.getElementById("composerForm"),
  messageInput: document.getElementById("messageInput"),
  sendButton: document.getElementById("sendButton"),
  stopButton: document.getElementById("stopButton"),
  characterCount: document.getElementById("characterCount"),

  modeButton: document.getElementById("modeButton"),
  modeMenu: document.getElementById("modeMenu"),
  modeIcon: document.getElementById("modeIcon"),
  modeName: document.getElementById("modeName"),

  composerModeButton: document.getElementById("composerModeButton"),
  composerModeIcon: document.getElementById("composerModeIcon"),
  composerModeName: document.getElementById("composerModeName")
};

// ============================================================
// State
// ============================================================

let chats = loadChats();

let activeChatId =
  localStorage.getItem(ACTIVE_CHAT_KEY) || null;

let currentMode =
  localStorage.getItem(MODE_KEY) || "general";

if (!modes[currentMode]) {
  currentMode = "general";
}

let isGenerating = false;
let abortController = null;

// ============================================================
// Initialization
// ============================================================

initialize();

function initialize() {
  renderSuggestions();
  renderModeMenu();
  updateModeUI();

  if (
    !activeChatId ||
    !chats.some((chat) => chat.id === activeChatId)
  ) {
    activeChatId = null;
  }

  if (activeChatId) {
    const chat = getActiveChat();

    if (chat && chat.messages.length) {
      renderChat(chat);
    } else {
      showWelcome();
    }
  } else {
    showWelcome();
  }

  renderHistory();
  autoResizeTextarea();
  updateCharacterCount();

  setupEventListeners();
}

// ============================================================
// Event listeners
// ============================================================

function setupEventListeners() {
  if (elements.composerForm) {
    elements.composerForm.addEventListener("submit", (event) => {
      event.preventDefault();
      sendMessage();
    });
  }

  if (elements.messageInput) {
    elements.messageInput.addEventListener("input", () => {
      updateCharacterCount();
      autoResizeTextarea();
    });

    elements.messageInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    });
  }

  if (elements.stopButton) {
    elements.stopButton.addEventListener("click", stopGeneration);
  }

  if (elements.newChatButton) {
    elements.newChatButton.addEventListener(
      "click",
      startNewChat
    );
  }

  if (elements.brandButton) {
    elements.brandButton.addEventListener(
      "click",
      startNewChat
    );
  }

  if (elements.mobileMenuButton) {
    elements.mobileMenuButton.addEventListener(
      "click",
      toggleSidebar
    );
  }

  if (elements.sidebarOverlay) {
    elements.sidebarOverlay.addEventListener(
      "click",
      closeSidebar
    );
  }

  if (elements.modeButton) {
    elements.modeButton.addEventListener(
      "click",
      toggleModeMenu
    );
  }

  if (elements.composerModeButton) {
    elements.composerModeButton.addEventListener(
      "click",
      toggleModeMenu
    );
  }

  document.addEventListener("click", (event) => {
    const clickedModeButton =
      elements.modeButton?.contains(event.target);

    const clickedComposerModeButton =
      elements.composerModeButton?.contains(event.target);

    const clickedModeMenu =
      elements.modeMenu?.contains(event.target);

    if (
      !clickedModeButton &&
      !clickedComposerModeButton &&
      !clickedModeMenu
    ) {
      closeModeMenu();
    }
  });
}

// ============================================================
// Storage
// ============================================================

function loadChats() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) {
      return [];
    }

    const parsed = JSON.parse(saved);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed;
  } catch (error) {
    console.warn("Could not load chats:", error);
    return [];
  }
}

function saveChats() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        chats.slice(0, MAX_STORED_CHATS)
      )
    );
  } catch (error) {
    console.warn("Could not save chats:", error);
  }
}

function saveActiveChatId() {
  if (activeChatId) {
    localStorage.setItem(
      ACTIVE_CHAT_KEY,
      activeChatId
    );
  } else {
    localStorage.removeItem(ACTIVE_CHAT_KEY);
  }
}

function saveMode() {
  localStorage.setItem(
    MODE_KEY,
    currentMode
  );
}

// ============================================================
// Chat management
// ============================================================

function createChat() {
  const chat = {
    id: crypto.randomUUID(),

    title: "New chat",

    mode: currentMode,

    createdAt: Date.now(),

    updatedAt: Date.now(),

    messages: []
  };

  chats.unshift(chat);

  activeChatId = chat.id;

  saveChats();
  saveActiveChatId();

  renderHistory();

  return chat;
}

function getActiveChat() {
  return chats.find(
    (chat) => chat.id === activeChatId
  );
}

function ensureActiveChat() {
  return getActiveChat() || createChat();
}

function startNewChat() {
  if (isGenerating) {
    stopGeneration();
  }

  activeChatId = null;

  saveActiveChatId();

  elements.messages.innerHTML = "";

  showWelcome();

  renderHistory();

  closeSidebar();

  elements.messageInput.value = "";

  updateCharacterCount();

  autoResizeTextarea();

  elements.messageInput.focus();
}

function updateChatTitle(chat, firstMessage) {
  if (!chat || chat.title !== "New chat") {
    return;
  }

  const clean = firstMessage
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) {
    return;
  }

  chat.title =
    clean.length > 42
      ? `${clean.slice(0, 42)}…`
      : clean;
}

function touchChat(chat) {
  chat.updatedAt = Date.now();

  chats.sort(
    (a, b) => b.updatedAt - a.updatedAt
  );

  saveChats();

  renderHistory();
}

// ============================================================
// History
// ============================================================

function renderHistory() {
  if (!elements.historyList) {
    return;
  }

  elements.historyList.innerHTML = "";

  const visibleChats = chats
    .filter(
      (chat) => Array.isArray(chat.messages)
    )
    .sort(
      (a, b) => b.updatedAt - a.updatedAt
    );

  if (elements.emptyHistory) {
    elements.emptyHistory.hidden =
      visibleChats.length > 0;
  }

  for (const chat of visibleChats) {
    const button =
      document.createElement("button");

    button.type = "button";

    button.className =
      `history-item ${
        chat.id === activeChatId
          ? "active"
          : ""
      }`;

    button.innerHTML = `
      <span class="history-icon">◌</span>
      <span class="history-title"></span>
    `;

    button.querySelector(
      ".history-title"
    ).textContent =
      chat.title || "New chat";

    button.addEventListener(
      "click",
      () => openChat(chat.id)
    );

    elements.historyList.appendChild(button);
  }
}

function openChat(chatId) {
  if (isGenerating) {
    stopGeneration();
  }

  const chat = chats.find(
    (item) => item.id === chatId
  );

  if (!chat) {
    return;
  }

  activeChatId = chatId;

  saveActiveChatId();

  currentMode =
    modes[chat.mode]
      ? chat.mode
      : "general";

  saveMode();

  updateModeUI();

  renderChat(chat);
  renderHistory();

  closeSidebar();
}

function renderChat(chat) {
  elements.messages.innerHTML = "";

  if (!chat.messages.length) {
    showWelcome();
    return;
  }

  elements.welcomeScreen.style.display =
    "none";

  elements.messages.classList.add(
    "visible"
  );

  for (const message of chat.messages) {
    appendMessageToDOM(
      message.role,
      message.content,
      false
    );
  }

  requestAnimationFrame(
    scrollToBottom
  );
}

function showWelcome() {
  elements.welcomeScreen.style.display =
    "flex";

  elements.messages.classList.remove(
    "visible"
  );

  elements.messages.innerHTML = "";
}

function showChatInterface() {
  elements.welcomeScreen.style.display =
    "none";

  elements.messages.classList.add(
    "visible"
  );
}

// ============================================================
// Suggestions
// ============================================================

function renderSuggestions() {
  if (!elements.suggestionGrid) {
    return;
  }

  elements.suggestionGrid.innerHTML = "";

  for (const suggestion of suggestions) {
    const button =
      document.createElement("button");

    button.type = "button";

    button.className = "suggestion";

    button.innerHTML = `
      <span class="suggestion-icon"></span>
      <span class="suggestion-text"></span>
      <span class="suggestion-subtext"></span>
    `;

    button.querySelector(
      ".suggestion-icon"
    ).textContent =
      suggestion.icon;

    button.querySelector(
      ".suggestion-text"
    ).textContent =
      suggestion.text;

    button.querySelector(
      ".suggestion-subtext"
    ).textContent =
      suggestion.subtext;

    button.addEventListener(
      "click",
      () => {
        elements.messageInput.value =
          suggestion.text;

        updateCharacterCount();
        autoResizeTextarea();

        elements.messageInput.focus();
      }
    );

    elements.suggestionGrid.appendChild(
      button
    );
  }
}

// ============================================================
// Modes
// ============================================================

function renderModeMenu() {
  if (!elements.modeMenu) {
    return;
  }

  elements.modeMenu.innerHTML = "";

  for (const [key, mode] of Object.entries(
    modes
  )) {
    const button =
      document.createElement("button");

    button.type = "button";

    button.className = "mode-option";

    button.dataset.mode = key;

    button.innerHTML = `
      <span class="mode-option-icon"></span>

      <span class="mode-option-text">
        <strong></strong>
        <span></span>
      </span>
    `;

    button.querySelector(
      ".mode-option-icon"
    ).textContent =
      mode.icon;

    button.querySelector(
      "strong"
    ).textContent =
      mode.name;

    button.querySelector(
      ".mode-option-text span"
    ).textContent =
      mode.description;

    button.addEventListener(
      "click",
      () => {
        setMode(key);
        closeModeMenu();
      }
    );

    elements.modeMenu.appendChild(
      button
    );
  }
}

function setMode(mode) {
  if (!modes[mode]) {
    return;
  }

  currentMode = mode;

  saveMode();

  updateModeUI();

  const chat = getActiveChat();

  if (chat) {
    chat.mode = mode;
    touchChat(chat);
  }
}

function updateModeUI() {
  const mode = modes[currentMode];

  if (!mode) {
    return;
  }

  elements.modeIcon.textContent =
    mode.icon;

  elements.modeName.textContent =
    mode.name;

  elements.composerModeIcon.textContent =
    mode.icon;

  elements.composerModeName.textContent =
    mode.name;

  for (
    const option of
    elements.modeMenu.querySelectorAll(
      ".mode-option"
    )
  ) {
    option.classList.toggle(
      "active",
      option.dataset.mode === currentMode
    );
  }
}

function toggleModeMenu() {
  const open =
    elements.modeMenu.classList.toggle(
      "open"
    );

  elements.modeMenu.setAttribute(
    "aria-hidden",
    String(!open)
  );

  elements.modeButton.setAttribute(
    "aria-expanded",
    String(open)
  );
}

function closeModeMenu() {
  elements.modeMenu.classList.remove(
    "open"
  );

  elements.modeMenu.setAttribute(
    "aria-hidden",
    "true"
  );

  elements.modeButton.setAttribute(
    "aria-expanded",
    "false"
  );
}

// ============================================================
// Sending messages
// ============================================================

async function sendMessage() {
  if (isGenerating) {
    return;
  }

  const text =
    elements.messageInput.value.trim();

  if (!text) {
    return;
  }

  if (text.length > 12000) {
    showTemporaryError(
      "Your message is too long."
    );
    return;
  }

  const chat = ensureActiveChat();

  updateChatTitle(chat, text);

  chat.mode = currentMode;

  chat.messages.push({
    role: "user",
    content: text
  });

  touchChat(chat);

  elements.messageInput.value = "";

  updateCharacterCount();
  autoResizeTextarea();

  showChatInterface();

  appendMessageToDOM(
    "user",
    text,
    true
  );

  const aiMessageElement =
    appendMessageToDOM(
      "model",
      "",
      true
    );

  const aiContentElement =
    aiMessageElement.querySelector(
      ".markdown-content"
    );

  showTyping(aiContentElement);

  setGenerating(true);

  abortController =
    new AbortController();

  try {
    const response =
      await fetch("/api/chat", {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          mode: currentMode,

          messages:
            chat.messages.map(
              (message) => ({
                role:
                  message.role,
                content:
                  message.content
              })
            )
        }),

        signal:
          abortController.signal
      });

    let data;

    try {
      data =
        await response.json();
    } catch {
      throw new Error(
        "Muxbee received an invalid response from the server."
      );
    }

    if (!response.ok) {
      throw new Error(
        data?.error ||
        "Muxbee could not respond."
      );
    }

    hideTyping(
      aiContentElement
    );

    const fullResponse =
      data?.text?.trim() || "";

    if (!fullResponse) {
      throw new Error(
        "Gemini returned an empty response."
      );
    }

    aiContentElement.innerHTML =
      renderMarkdown(
        fullResponse
      );

    aiContentElement.dataset.raw =
      fullResponse;

    chat.messages.push({
      role: "model",
      content: fullResponse
    });

    touchChat(chat);

    addMessageActions(
      aiMessageElement,
      fullResponse
    );

    scrollToBottom();

  } catch (error) {
    if (
      error?.name ===
      "AbortError"
    ) {
      removeTyping(
        aiContentElement
      );
    } else {
      console.error(
        "Chat error:",
        error
      );

      aiContentElement.innerHTML =
        `<p class="error-response">${escapeHTML(
          error.message ||
          "Something went wrong."
        )}</p>`;

      addMessageActions(
        aiMessageElement,
        error.message || ""
      );
    }

  } finally {
    setGenerating(false);

    abortController = null;

    removeTyping(
      aiContentElement
    );

    renderHistory();
  }
}

// ============================================================
// Stop generation
// ============================================================

function stopGeneration() {
  if (
    !isGenerating ||
    !abortController
  ) {
    return;
  }

  abortController.abort();

  setGenerating(false);
}

function setGenerating(value) {
  isGenerating = value;

  elements.sendButton.disabled =
    value;

  elements.stopButton.hidden =
    !value;

  elements.messageInput.disabled =
    value;
}

// ============================================================
// Message DOM
// ============================================================

function appendMessageToDOM(
  role,
  content,
  animate = true
) {
  const message =
    document.createElement("article");

  message.className =
    `message ${
      role === "user"
        ? "user"
        : "ai"
    }`;

  if (!animate) {
    message.style.animation =
      "none";
  }

  const label =
    role === "user"
      ? "You"
      : "Muxbee";

  const bubbleContent =
    role === "user"
      ? escapeHTML(content).replace(
          /\n/g,
          "<br>"
        )
      : renderMarkdown(content);

  message.innerHTML = `
    <div class="message-inner">

      <div class="message-label">
        ${
          role === "model"
            ? `<span class="message-avatar">M</span>`
            : ""
        }

        <span>${label}</span>
      </div>

      <div class="message-bubble">
        ${
          role === "model"
            ? `<div class="markdown-content">${bubbleContent}</div>`
            : bubbleContent
        }
      </div>

      ${
        role === "model"
          ? `<div class="message-actions"></div>`
          : ""
      }

    </div>
  `;

  elements.messages.appendChild(
    message
  );

  if (
    role === "model" &&
    content
  ) {
    addMessageActions(
      message,
      content
    );
  }

  requestAnimationFrame(
    scrollToBottom
  );

  return message;
}

// ============================================================
// Message actions
// ============================================================

function addMessageActions(
  messageElement,
  content
) {
  const actions =
    messageElement.querySelector(
      ".message-actions"
    );

  if (!actions) {
    return;
  }

  actions.innerHTML = `
    <button
      type="button"
      class="message-action copy-response"
      title="Copy response"
      aria-label="Copy response"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <rect
          x="9"
          y="9"
          width="11"
          height="11"
          rx="2"
        ></rect>

        <path
          d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"
        ></path>
      </svg>
    </button>
  `;

  const button =
    actions.querySelector(
      ".copy-response"
    );

  button.addEventListener(
    "click",
    async () => {
      const success =
        await copyText(content);

      if (!success) {
        return;
      }

      button.innerHTML = `
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            d="m5 12 4 4L19 6"
          ></path>
        </svg>
      `;

      button.title = "Copied";

      setTimeout(() => {
        button.innerHTML = `
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <rect
              x="9"
              y="9"
              width="11"
              height="11"
              rx="2"
            ></rect>

            <path
              d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"
            ></path>
          </svg>
        `;

        button.title =
          "Copy response";
      }, 1400);
    }
  );
}

// ============================================================
// Typing indicator
// ============================================================

function showTyping(
  contentElement
) {
  contentElement.dataset.raw =
    "";

  contentElement.innerHTML = `
    <div class="typing-indicator">
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
    </div>
  `;
}

function hideTyping(
  contentElement
) {
  contentElement.innerHTML = "";
}

function removeTyping(
  contentElement
) {
  const indicator =
    contentElement.querySelector(
      ".typing-indicator"
    );

  if (indicator) {
    indicator.remove();
  }
}

// ============================================================
// Markdown renderer
// ============================================================

function renderMarkdown(markdown) {
  if (!markdown) {
    return "";
  }

  const blocks = [];

  let working =
    String(markdown);

  // Code blocks
  working =
    working.replace(
      /```([\w+-]*)\n?([\s\S]*?)```/g,
      (_, language, code) => {
        const id =
          blocks.length;

        blocks.push({
          type: "code",
          language:
            language || "code",
          content:
            code.trim()
        });

        return `\n@@CODE_${id}@@\n`;
      }
    );

  const lines =
    working.split(/\r?\n/);

  const output = [];

  let paragraph = [];

  let listType = null;

  function flushParagraph() {
    if (!paragraph.length) {
      return;
    }

    const text =
      paragraph
        .join("\n")
        .trim();

    if (text) {
      output.push(
        `<p>${formatInline(text).replace(
          /\n/g,
          "<br>"
        )}</p>`
      );
    }

    paragraph = [];
  }

  function closeList() {
    if (!listType) {
      return;
    }

    output.push(
      `</${listType}>`
    );

    listType = null;
  }

  for (const rawLine of lines) {
    const line =
      rawLine.trimEnd();

    const trimmed =
      line.trim();

    if (!trimmed) {
      flushParagraph();
      continue;
    }

    // Code placeholder
    const codeMatch =
      trimmed.match(
        /^@@CODE_(\d+)@@$/
      );

    if (codeMatch) {
      flushParagraph();
      closeList();

      const block =
        blocks[
          Number(codeMatch[1])
        ];

      if (block) {
        output.push(`
          <div class="code-block">
            <div class="code-header">
              <span>${escapeHTML(
                block.language
              )}</span>

              <button
                type="button"
                class="code-copy"
                data-code="${escapeHTML(
                  block.content
                )}"
              >
                Copy
              </button>
            </div>

            <pre><code>${escapeHTML(
              block.content
            )}</code></pre>
          </div>
        `);
      }

      continue;
    }

    // Headings
    const headingMatch =
      trimmed.match(
        /^(#{1,3})\s+(.+)$/
      );

    if (headingMatch) {
      flushParagraph();
      closeList();

      const level =
        headingMatch[1].length;

      output.push(
        `<h${level}>${formatInline(
          headingMatch[2]
        )}</h${level}>`
      );

      continue;
    }

    // Unordered list
    const unordered =
      trimmed.match(
        /^[-*]\s+(.+)$/
      );

    if (unordered) {
      flushParagraph();

      if (listType !== "ul") {
        closeList();

        output.push("<ul>");
        listType = "ul";
      }

      output.push(
        `<li>${formatInline(
          unordered[1]
        )}</li>`
      );

      continue;
    }

    // Ordered list
    const ordered =
      trimmed.match(
        /^\d+\.\s+(.+)$/
      );

    if (ordered) {
      flushParagraph();

      if (listType !== "ol") {
        closeList();

        output.push("<ol>");
        listType = "ol";
      }

      output.push(
        `<li>${formatInline(
          ordered[1]
        )}</li>`
      );

      continue;
    }

    // Normal paragraph
    closeList();

    paragraph.push(trimmed);
  }

  flushParagraph();
  closeList();

  let html =
    output.join("\n");

  // Restore code blocks
  html =
    html.replace(
      /@@CODE_(\d+)@@/g,
      (_, id) => {
        const block =
          blocks[
            Number(id)
          ];

        if (!block) {
          return "";
        }

        return `
          <div class="code-block">
            <div class="code-header">
              <span>${escapeHTML(
                block.language
              )}</span>

              <button
                type="button"
                class="code-copy"
                data-code="${escapeHTML(
                  block.content
                )}"
              >
                Copy
              </button>
            </div>

            <pre><code>${escapeHTML(
              block.content
            )}</code></pre>
          </div>
        `;
      }
    );

  requestAnimationFrame(
    setupCodeCopyButtons
  );

  return html;
}

function formatInline(text) {
  let value =
    escapeHTML(text);

  // Inline code
  value =
    value.replace(
      /`([^`]+)`/g,
      "<code>$1</code>"
    );

  // Bold
  value =
    value.replace(
      /\*\*(.+?)\*\*/g,
      "<strong>$1</strong>"
    );

  // Italic
  value =
    value.replace(
      /(^|[^\*])\*([^*]+)\*(?!\*)/g,
      "$1<em>$2</em>"
    );

  // Markdown links
  value =
    value.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );

  return value;
}

function setupCodeCopyButtons() {
  const buttons =
    elements.messages.querySelectorAll(
      ".code-copy"
    );

  buttons.forEach((button) => {
    if (button.dataset.bound) {
      return;
    }

    button.dataset.bound =
      "true";

    button.addEventListener(
      "click",
      async () => {
        const code =
          button.dataset.code || "";

        const success =
          await copyText(
            code
          );

        if (success) {
          button.textContent =
            "Copied";

          setTimeout(() => {
            button.textContent =
              "Copy";
          }, 1200);
        }
      }
    );
  });
}

// ============================================================
// Utilities
// ============================================================

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(
      text
    );

    return true;
  } catch {
    try {
      const textarea =
        document.createElement(
          "textarea"
        );

      textarea.value = text;

      textarea.style.position =
        "fixed";

      textarea.style.opacity =
        "0";

      document.body.appendChild(
        textarea
      );

      textarea.select();

      const success =
        document.execCommand(
          "copy"
        );

      textarea.remove();

      return success;
    } catch {
      return false;
    }
  }
}

function scrollToBottom() {
  const area =
    elements.chatArea;

  if (!area) {
    return;
  }

  area.scrollTo({
    top: area.scrollHeight,
    behavior: "smooth"
  });
}

function updateCharacterCount() {
  if (!elements.characterCount) {
    return;
  }

  const length =
    elements.messageInput.value
      .length;

  elements.characterCount.textContent =
    `${length.toLocaleString()} / 12,000`;
}

function autoResizeTextarea() {
  const textarea =
    elements.messageInput;

  if (!textarea) {
    return;
  }

  textarea.style.height =
    "auto";

  textarea.style.height =
    `${Math.min(
      textarea.scrollHeight,
      180
    )}px`;
}

function showTemporaryError(
  message
) {
  const existing =
    document.querySelector(
      ".temporary-error"
    );

  if (existing) {
    existing.remove();
  }

  const error =
    document.createElement(
      "div"
    );

  error.className =
    "temporary-error";

  error.textContent =
    message;

  document.body.appendChild(
    error
  );

  setTimeout(() => {
    error.remove();
  }, 2500);
}

// ============================================================
// Mobile sidebar
// ============================================================

function toggleSidebar() {
  elements.sidebar.classList.toggle(
    "open"
  );

  elements.sidebarOverlay.classList.toggle(
    "visible"
  );
}

function closeSidebar() {
  elements.sidebar.classList.remove(
    "open"
  );

  elements.sidebarOverlay.classList.remove(
    "visible"
  );
}

// ============================================================
// Keyboard / page behavior
// ============================================================

window.addEventListener(
  "resize",
  () => {
    autoResizeTextarea();
  }
);

document.addEventListener(
  "keydown",
  (event) => {
    if (
      event.key === "Escape"
    ) {
      closeModeMenu();
      closeSidebar();
    }
  }
);