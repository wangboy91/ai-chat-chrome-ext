const memoryKey = "pageMemory";
const sessionsKey = "chatSessions";
const activeSessionKey = "activeSessionId";

let currentPage = null;
let currentTabInfo = null;
let activePort = null;
let activeRequestTimer = null;
let activeHardTimeout = null;
let pendingRefreshTimer = null;
let sessions = [];
let activeSessionId = "";
let attachments = [];
let language = "en";
let visionEnabled = false;
let pageReadState = "idle";
let pageReadError = "";

const ui = {
  zh: {
    waiting: "\u7b49\u5f85\u8bfb\u53d6\u5f53\u524d\u9875\u9762",
    reading: "\u6b63\u5728\u8bfb\u53d6\u5f53\u524d\u9875\u9762...",
    unreadable: "\u5f53\u524d\u9875\u9762\u65e0\u6cd5\u8bfb\u53d6\uff0c\u8bf7\u5207\u6362\u5230\u666e\u901a\u7f51\u9875\u540e\u91cd\u8bd5\u3002",
    readFailed: "\u65e0\u6cd5\u8bfb\u53d6\u9875\u9762\u5185\u5bb9\u3002",
    chars: "\u5b57\u7b26",
    history: "\u8fd1\u671f\u5bf9\u8bdd",
    deleteChat: "\u5220\u9664\u5f53\u524d\u5bf9\u8bdd",
    settings: "\u8bbe\u7f6e\u548c\u6a21\u578b",
    memory: "\u8bb0\u5fc6",
    pages: "\u9875",
    addPage: "\u6dfb\u52a0\u5f53\u524d\u9875",
    addTabs: "\u6dfb\u52a0\u6807\u7b7e\u9875",
    clear: "\u6e05\u7a7a",
    ask: "\u8f93\u5165\u95ee\u9898",
    noPage: "\u8fd8\u6ca1\u6709\u53ef\u7528\u7684\u7f51\u9875\u5185\u5bb9\u3002",
    imagePrompt: "\u5206\u6790\u9644\u4ef6\u56fe\u7247\u3002",
    thinking: "\u601d\u8003\u4e2d...",
    noStream: "\u8bf7\u6c42\u5df2\u7ed3\u675f\uff0c\u4f46\u6ca1\u6709\u8fd4\u56de\u6d41\u5f0f\u6587\u672c\u3002",
    fallback: "\u6d41\u5f0f\u8f93\u51fa\u6682\u65e0\u54cd\u5e94\uff0c\u6b63\u5728\u5207\u6362\u666e\u901a\u8bf7\u6c42...",
    timeout: "\u8bf7\u6c42\u8d85\u65f6\uff0c\u8bf7\u68c0\u67e5\u6a21\u578b\u5730\u5740\u3001API Key \u6216\u63a5\u53e3\u662f\u5426\u652f\u6301\u6d41\u5f0f\u8f93\u51fa\u3002",
    closed: "\u6d41\u5f0f\u8fde\u63a5\u5728\u8fd4\u56de\u6587\u672c\u524d\u5df2\u5173\u95ed\u3002",
    waitingChunk: "\u4ecd\u5728\u7b49\u5f85\u7b2c\u4e00\u6bb5\u6d41\u5f0f\u5185\u5bb9...",
    openSettingsTip: "\u8bf7\u70b9\u51fb\u63d2\u4ef6\u56fe\u6807\u8fdb\u5165\u6a21\u578b\u914d\u7f6e\u3002",
    newChat: "\u65b0\u5bf9\u8bdd",
    imageChat: "\u56fe\u7247\u5bf9\u8bdd",
    attachment: "\u5f20\u56fe\u7247\u9644\u4ef6",
    readingTabs: "\u6b63\u5728\u8bfb\u53d6\u6807\u7b7e\u9875",
    uploadTitle: "\u4e0a\u4f20\u56fe\u7247",
    send: "\u53d1\u9001",
    newTitle: "\u65b0\u5efa\u5bf9\u8bdd",
    historyTitle: "\u67e5\u770b\u5386\u53f2\u5bf9\u8bdd",
    refreshTitle: "\u91cd\u65b0\u8bfb\u53d6\u9875\u9762",
    currentTab: "\u5f53\u524d\u6807\u7b7e\u9875"
  },
  en: {
    waiting: "Waiting for current page",
    reading: "Reading current page...",
    unreadable: "This page cannot be read. Switch to a normal web page and try again.",
    readFailed: "Could not read page content.",
    chars: "chars",
    history: "Recent chats",
    deleteChat: "Delete current chat",
    settings: "Settings and models",
    memory: "Memory",
    pages: "pages",
    addPage: "Add page",
    addTabs: "Add tabs",
    clear: "Clear",
    ask: "Ask this page",
    noPage: "No readable page content is available yet.",
    imagePrompt: "Analyze the attached image.",
    thinking: "Thinking...",
    noStream: "The request completed, but no stream text was returned.",
    fallback: "No stream chunk yet. Falling back to a normal request...",
    timeout: "AI request timed out. Please check the model endpoint, API key, or streaming support.",
    closed: "The streaming connection closed before any text was returned.",
    waitingChunk: "Still waiting for the first stream chunk...",
    openSettingsTip: "Open the extension icon to edit model settings.",
    newChat: "New chat",
    imageChat: "Image chat",
    attachment: "image attachment(s)",
    readingTabs: "Reading tabs",
    uploadTitle: "Upload image",
    send: "Send",
    newTitle: "New chat",
    historyTitle: "Chat history",
    refreshTitle: "Refresh page content",
    currentTab: "Current tab"
  }
};

document.addEventListener("DOMContentLoaded", async () => {
  const storedUi = await chrome.storage.local.get("uiLanguage");
  language = storedUi.uiLanguage || "en";
  applyLanguage();
  await loadSessions();
  await updateVisionControls();
  await updateMemoryStatus();
  renderActiveSession();
  registerTabListeners();
  scheduleRefresh(80);

  const prompt = document.getElementById("prompt");
  prompt.addEventListener("keydown", handlePromptKeydown);
  prompt.addEventListener("input", autoResizePrompt);
  document.getElementById("refreshPage").addEventListener("click", refreshPageContent);
  document.getElementById("newSession").addEventListener("click", newSession);
  document.getElementById("toggleHistory").addEventListener("click", toggleHistory);
  document.getElementById("deleteSession").addEventListener("click", deleteCurrentSession);
  document.getElementById("openSettings").addEventListener("click", openSettings);
  document.getElementById("rememberCurrent").addEventListener("click", rememberCurrentPage);
  document.getElementById("rememberAllTabs").addEventListener("click", rememberAllTabs);
  document.getElementById("clearMemory").addEventListener("click", clearMemory);
  document.getElementById("uploadImage").addEventListener("click", () => document.getElementById("imageInput").click());
  document.getElementById("imageInput").addEventListener("change", handleImageUpload);
  document.getElementById("askForm").addEventListener("submit", askQuestion);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes.uiLanguage) {
    language = changes.uiLanguage.newValue || "en";
    applyLanguage();
    updateMemoryStatus();
    renderActiveSession();
  }
  if (changes.modelProfiles || changes.activeModelId) {
    updateVisionControls();
  }
});

function t(key) {
  return ui[language][key] || ui.en[key] || key;
}

function applyLanguage() {
  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  document.getElementById("historyTitle").textContent = t("history");
  document.getElementById("deleteSession").textContent = t("deleteChat");
  document.getElementById("openSettings").textContent = t("settings");
  document.getElementById("rememberCurrent").textContent = t("addPage");
  document.getElementById("rememberAllTabs").textContent = t("addTabs");
  document.getElementById("clearMemory").textContent = t("clear");
  document.getElementById("prompt").placeholder = t("ask");
  document.getElementById("uploadImage").title = t("uploadTitle");
  document.getElementById("askButton").textContent = t("send");
  document.getElementById("askButton").title = t("send");
  document.getElementById("newSession").title = t("newTitle");
  document.getElementById("toggleHistory").title = t("historyTitle");
  document.getElementById("refreshPage").title = t("refreshTitle");
  document.getElementById("pageChipLabel").textContent = t("currentTab");
  renderPageInfo();
  renderPageChip();
  renderActiveTitleOnly();
}

async function loadSessions() {
  const stored = await chrome.storage.local.get([sessionsKey, activeSessionKey]);
  sessions = Array.isArray(stored[sessionsKey]) ? stored[sessionsKey] : [];
  if (!sessions.length) sessions = [createSession()];
  activeSessionId = stored[activeSessionKey] || sessions[0].id;
  await saveSessions();
}

function createSession(title = t("newChat")) {
  return {
    id: crypto.randomUUID(),
    title,
    sourceUrl: currentPage?.url || currentTabInfo?.url || "",
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

async function saveSessions() {
  sessions = sessions.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 30);
  await chrome.storage.local.set({ [sessionsKey]: sessions, [activeSessionKey]: activeSessionId });
  renderSessionList();
}

function getActiveSession() {
  return sessions.find((item) => item.id === activeSessionId) || sessions[0];
}

async function newSession() {
  const session = createSession(getPreferredSessionTitle());
  sessions.unshift(session);
  activeSessionId = session.id;
  await saveSessions();
  renderActiveSession();
  hideHistory();
}

async function deleteCurrentSession() {
  if (sessions.length <= 1) {
    sessions[0] = createSession();
    activeSessionId = sessions[0].id;
  } else {
    sessions = sessions.filter((item) => item.id !== activeSessionId);
    activeSessionId = sessions[0].id;
  }
  await saveSessions();
  renderActiveSession();
  hideHistory();
}

function toggleHistory() {
  const menu = document.getElementById("historyMenu");
  menu.hidden = !menu.hidden;
}

function hideHistory() {
  document.getElementById("historyMenu").hidden = true;
}

function renderSessionList() {
  const list = document.getElementById("sessionList");
  if (!list) return;
  list.replaceChildren();
  for (const session of sessions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `session-item${session.id === activeSessionId ? " active" : ""}`;
    button.textContent = getDisplaySessionTitle(session);
    button.addEventListener("click", async () => {
      activeSessionId = session.id;
      await saveSessions();
      renderActiveSession();
      hideHistory();
    });
    list.append(button);
  }
}

function renderActiveSession() {
  const session = getActiveSession();
  document.getElementById("sessionTitle").textContent = getDisplaySessionTitle(session);
  const messages = document.getElementById("messages");
  messages.replaceChildren();
  for (const message of session.messages) {
    appendMessage(message.role, message.content, { markdown: message.role === "assistant" });
  }
  renderSessionList();
}

function renderActiveTitleOnly() {
  const title = document.getElementById("sessionTitle");
  if (!title || !sessions.length) return;
  title.textContent = getDisplaySessionTitle(getActiveSession());
}

function getDisplaySessionTitle(session) {
  if (!session?.title || isUntitledSession(session.title)) return t("newChat");
  return session.title;
}

function isUntitledSession(title) {
  return !title || title === "New chat" || title === "\u65b0\u5bf9\u8bdd";
}

function handlePromptKeydown(event) {
  if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
  event.preventDefault();
  document.getElementById("askForm").requestSubmit();
}

function autoResizePrompt(event) {
  const node = event.target;
  node.style.height = "auto";
  node.style.height = `${Math.min(node.scrollHeight, 132)}px`;
}

async function refreshPageContent() {
  setPageState("reading");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTabInfo = makeTabInfo(tab);
    renderPageChip();
    if (tab?.status && tab.status !== "complete") {
      scheduleRefresh(500);
    }
    currentPage = await readPageFromTab(tab);
    currentTabInfo = makeTabInfo(tab, currentPage);
    syncActiveSessionTitle();
    setPageState("ready");
  } catch (error) {
    currentPage = null;
    pageReadError = error.message || t("readFailed");
    if (currentTabInfo?.status && currentTabInfo.status !== "complete") scheduleRefresh(700);
    setPageState("error", pageReadError);
  }
}

async function readPageFromTab(tab) {
  if (!tab?.id || !/^https?:/.test(tab.url || "")) throw new Error(t("unreadable"));
  let response;
  try {
    response = await chrome.tabs.sendMessage(tab.id, { action: "getPageContent" });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    response = await chrome.tabs.sendMessage(tab.id, { action: "getPageContent" });
  }
  if (!response?.ok) throw new Error(t("readFailed"));
  return { ...response.page, tabId: tab.id, capturedAt: Date.now() };
}

async function askQuestion(event) {
  event.preventDefault();
  const promptNode = document.getElementById("prompt");
  const prompt = promptNode.value.trim();
  if (!prompt && !attachments.length) return;
  if (!currentPage) await refreshPageContent();
  if (!currentPage) {
    appendMessage("assistant", t("noPage"), { markdown: true });
    return;
  }

  const config = await getActiveModelConfig();
  const stored = await chrome.storage.local.get(memoryKey);
  const memory = Array.isArray(stored[memoryKey]) ? stored[memoryKey] : [];
  const context = buildContext(currentPage, memory);
  const outgoingAttachments = attachments;
  attachments = [];
  renderAttachments();
  promptNode.value = "";
  promptNode.style.height = "";

  const userText = prompt || t("imagePrompt");
  const displayText = outgoingAttachments.length
    ? `${userText}\n\n[${outgoingAttachments.length} ${t("attachment")}]`
    : userText;
  appendMessage("user", displayText);
  persistMessage("user", userText, outgoingAttachments);
  setBusy(true);

  const assistantNode = appendMessage("assistant pending", t("thinking"), { markdown: true });
  streamAnswer({ ...config, prompt: userText, context, images: outgoingAttachments }, assistantNode);
}

async function getActiveModelConfig() {
  const stored = await chrome.storage.local.get(["modelProfiles", "activeModelId", "protocol", "apiKey", "model", "baseUrl", "maxContextChars"]);
  const profiles = Array.isArray(stored.modelProfiles) ? stored.modelProfiles : [];
  const active = profiles.find((item) => item.id === stored.activeModelId) || profiles[0];
  if (active) return active;
  return {
    id: "legacy",
    name: "Legacy model",
    protocol: stored.protocol || "openai",
    model: stored.model || "gpt-4o-mini",
    apiKey: stored.apiKey || "",
    baseUrl: stored.baseUrl || "",
    maxContextChars: stored.maxContextChars || "18000",
    vision: false
  };
}

async function updateVisionControls() {
  const config = await getActiveModelConfig();
  visionEnabled = Boolean(config.vision);
  document.getElementById("uploadImage").hidden = !visionEnabled;
  if (!visionEnabled) {
    attachments = [];
    renderAttachments();
  }
}

function buildContext(page, memory) {
  const pages = upsertPage(memory, page);
  return pages.map((item, index) => buildPageContext(item, index + 1)).join("\n\n---\n\n");
}

function buildPageContext(page, index) {
  const parts = [
    `Page ${index}`,
    `Title: ${page.title || ""}`,
    `URL: ${page.url || ""}`,
    page.description ? `Description: ${page.description}` : "",
    page.selection ? `Selected text:\n${page.selection}` : "",
    `Visible page text:\n${page.content || ""}`
  ];
  return parts.filter(Boolean).join("\n\n");
}

async function rememberCurrentPage() {
  if (!currentPage) await refreshPageContent();
  if (!currentPage) return;
  const memory = await readMemory();
  await writeMemory(upsertPage(memory, currentPage));
}

async function rememberAllTabs() {
  const status = document.getElementById("memoryStatus");
  status.textContent = `${t("readingTabs")}...`;
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const readableTabs = tabs.filter((tab) => /^https?:/.test(tab.url || ""));
  const pages = [];
  for (const tab of readableTabs) {
    try {
      pages.push(await readPageFromTab(tab));
      status.textContent = `${t("readingTabs")}... ${pages.length}/${readableTabs.length}`;
    } catch {
      // Keep reading the rest.
    }
  }
  const memory = await readMemory();
  await writeMemory(pages.reduce((items, page) => upsertPage(items, page), memory));
}

async function clearMemory() {
  await chrome.storage.local.set({ [memoryKey]: [] });
  await updateMemoryStatus();
}

async function readMemory() {
  const stored = await chrome.storage.local.get(memoryKey);
  return Array.isArray(stored[memoryKey]) ? stored[memoryKey] : [];
}

async function writeMemory(memory) {
  await chrome.storage.local.set({ [memoryKey]: memory.slice(-12).map(compactMemoryPage) });
  await updateMemoryStatus();
}

function upsertPage(memory, page) {
  const others = memory.filter((item) => item.url !== (page.url || ""));
  return [...others, page];
}

function compactMemoryPage(page) {
  return {
    title: page.title || "",
    url: page.url || "",
    description: page.description || "",
    selection: page.selection || "",
    content: (page.content || "").slice(0, 50000),
    capturedAt: page.capturedAt || Date.now()
  };
}

async function updateMemoryStatus() {
  const memory = await readMemory();
  const totalChars = memory.reduce((sum, page) => sum + (page.content || "").length, 0);
  document.getElementById("memoryStatus").textContent =
    `${t("memory")}: ${memory.length} ${t("pages")} - ${totalChars.toLocaleString()} ${t("chars")}`;
}

async function handleImageUpload(event) {
  if (!visionEnabled) return;
  const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith("image/"));
  const items = await Promise.all(files.slice(0, 4).map(fileToImageAttachment));
  attachments.push(...items);
  attachments = attachments.slice(0, 4);
  event.target.value = "";
  renderAttachments();
}

function fileToImageAttachment(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, dataUrl: reader.result, mimeType: file.type });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function renderAttachments() {
  const tray = document.getElementById("attachmentTray");
  tray.replaceChildren();
  tray.hidden = !attachments.length;
  attachments.forEach((item, index) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "attachment-chip";
    chip.textContent = `${item.name || "Image"} x`;
    chip.addEventListener("click", () => {
      attachments.splice(index, 1);
      renderAttachments();
    });
    tray.append(chip);
  });
}

function streamAnswer(data, node) {
  if (activePort) activePort.disconnect();
  let hasChunk = false;
  let markdown = "";
  activePort = chrome.runtime.connect({ name: "ai-page-chat" });
  activePort.onMessage.addListener((message) => {
    if (message.type === "chunk") {
      if (!hasChunk) {
        node.classList.remove("pending");
        hasChunk = true;
      }
      markdown += message.chunk;
      renderMessage(node, markdown, true);
      scrollMessagesToBottom();
      return;
    }
    if (message.type === "error") {
      renderMessage(node, message.error, true);
      node.classList.remove("pending");
      finishStream();
      return;
    }
    if (message.type === "done") {
      if (!markdown.trim()) renderMessage(node, t("noStream"), true);
      node.classList.remove("pending");
      persistMessage("assistant", markdown || node.textContent);
      finishStream();
    }
  });
  activePort.onDisconnect.addListener(() => {
    if (document.getElementById("askButton").disabled) {
      renderMessage(node, hasChunk ? markdown : t("closed"), true);
      node.classList.remove("pending");
      finishStream();
    }
  });
  activePort.postMessage({ action: "askAI", data });
  activeRequestTimer = window.setTimeout(() => {
    if (!hasChunk && node.isConnected && activePort) {
      renderMessage(node, t("fallback"), true);
      const portToClose = activePort;
      activePort = null;
      portToClose.disconnect();
      callNonStreamingFallback(data, node);
    }
  }, 20000);
  activeHardTimeout = window.setTimeout(() => {
    if (document.getElementById("askButton").disabled && node.isConnected) {
      renderMessage(node, hasChunk ? markdown : t("timeout"), true);
      node.classList.remove("pending");
      finishStream();
    }
  }, 125000);
}

async function callNonStreamingFallback(data, node) {
  try {
    const response = await chrome.runtime.sendMessage({ action: "askAIOnce", data });
    if (!response?.ok) {
      throw new Error(response?.error || t("noStream"));
    }
    const text = response.result || t("noStream");
    renderMessage(node, text, true);
    node.classList.remove("pending");
    persistMessage("assistant", text);
  } catch (error) {
    renderMessage(node, error.message || t("timeout"), true);
    node.classList.remove("pending");
  } finally {
    finishStream();
  }
}

function finishStream() {
  setBusy(false);
  clearActiveRequestTimer();
  clearActiveHardTimeout();
  if (activePort) {
    activePort.disconnect();
    activePort = null;
  }
}

function appendMessage(role, text, options = {}) {
  const messages = document.getElementById("messages");
  const item = document.createElement("article");
  item.className = `message ${role}`;
  renderMessage(item, text, Boolean(options.markdown));
  messages.append(item);
  scrollMessagesToBottom();
  return item;
}

async function persistMessage(role, content, images = []) {
  const session = getActiveSession();
  session.messages.push({
    role,
    content,
    images: images.map((item) => ({ name: item.name, mimeType: item.mimeType })),
    createdAt: Date.now()
  });
  if (role === "user" && isUntitledSession(session.title)) {
    session.title = getPreferredSessionTitle() || content.slice(0, 32) || t("imageChat");
    session.sourceUrl = currentPage?.url || currentTabInfo?.url || session.sourceUrl || "";
    document.getElementById("sessionTitle").textContent = session.title;
  }
  session.updatedAt = Date.now();
  await saveSessions();
}

function renderMessage(node, text, markdown) {
  node.replaceChildren();
  if (!markdown) {
    node.textContent = text;
    return;
  }
  node.append(renderMarkdown(text || ""));
}

function renderMarkdown(markdown) {
  const fragment = document.createDocumentFragment();
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const fence = line.match(/^```(\w+)?\s*$/);
    if (fence) {
      const codeLines = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) codeLines.push(lines[index++]);
      index += 1;
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = codeLines.join("\n");
      pre.append(code);
      fragment.append(pre);
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const element = document.createElement(`h${Math.min(heading[1].length + 1, 6)}`);
      appendInlineMarkdown(element, heading[2]);
      fragment.append(element);
      index += 1;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const list = document.createElement(ordered ? "ol" : "ul");
      while (index < lines.length) {
        const match = lines[index].match(ordered ? /^\s*\d+\.\s+(.+)$/ : /^\s*[-*]\s+(.+)$/);
        if (!match) break;
        const item = document.createElement("li");
        appendInlineMarkdown(item, match[1]);
        list.append(item);
        index += 1;
      }
      fragment.append(list);
      continue;
    }
    const paragraphLines = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^```/.test(lines[index]) &&
      !/^(#{1,4})\s+/.test(lines[index]) &&
      !/^\s*[-*]\s+/.test(lines[index]) &&
      !/^\s*\d+\.\s+/.test(lines[index])
    ) {
      paragraphLines.push(lines[index++]);
    }
    const paragraph = document.createElement("p");
    appendInlineMarkdown(paragraph, paragraphLines.join("\n"));
    fragment.append(paragraph);
  }
  return fragment;
}

function appendInlineMarkdown(parent, text) {
  const pattern = /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\n)/g;
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) parent.append(document.createTextNode(text.slice(lastIndex, match.index)));
    if (match[0] === "\n") parent.append(document.createElement("br"));
    else if (match[2]) {
      const strong = document.createElement("strong");
      strong.textContent = match[2];
      parent.append(strong);
    } else if (match[3]) {
      const code = document.createElement("code");
      code.textContent = match[3];
      parent.append(code);
    } else if (match[4] && match[5]) {
      const link = document.createElement("a");
      link.textContent = match[4];
      link.href = match[5];
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      parent.append(link);
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) parent.append(document.createTextNode(text.slice(lastIndex)));
}

async function openSettings() {
  try {
    await chrome.action.openPopup();
    hideHistory();
  } catch (error) {
    appendMessage("assistant", `${t("openSettingsTip")} ${error.message || ""}`, { markdown: true });
    hideHistory();
  }
}

function scrollMessagesToBottom() {
  const messages = document.getElementById("messages");
  messages.scrollTop = messages.scrollHeight;
}

function setBusy(isBusy) {
  document.getElementById("askButton").disabled = isBusy;
}

function clearActiveRequestTimer() {
  if (activeRequestTimer) {
    window.clearTimeout(activeRequestTimer);
    activeRequestTimer = null;
  }
}

function clearActiveHardTimeout() {
  if (activeHardTimeout) {
    window.clearTimeout(activeHardTimeout);
    activeHardTimeout = null;
  }
}

function registerTabListeners() {
  chrome.tabs.onActivated.addListener(() => {
    scheduleRefresh(120);
  });
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || tab.id !== tabId) return;
    if (changeInfo.status === "loading" || changeInfo.title || changeInfo.url) {
      currentTabInfo = makeTabInfo({ ...tab, ...changeInfo });
      currentPage = null;
      setPageState("reading");
      renderPageChip();
    }
    if (changeInfo.status === "complete" || changeInfo.title || changeInfo.url) {
      scheduleRefresh(180);
    }
  });
}

function scheduleRefresh(delay = 0) {
  if (pendingRefreshTimer) {
    window.clearTimeout(pendingRefreshTimer);
  }
  pendingRefreshTimer = window.setTimeout(() => {
    pendingRefreshTimer = null;
    refreshPageContent();
  }, delay);
}

function makeTabInfo(tab, page = null) {
  if (!tab) return null;
  const url = page?.url || tab.url || "";
  let host = "";
  try {
    host = url ? new URL(url).host : "";
  } catch {
    host = "";
  }
  return {
    id: tab.id || 0,
    title: page?.title || tab.title || "",
    url,
    host,
    status: tab.status || "complete"
  };
}

function setPageState(state, errorMessage = "") {
  pageReadState = state;
  pageReadError = errorMessage;
  renderPageInfo();
  renderPageChip();
}

function renderPageInfo() {
  const pageInfo = document.getElementById("pageInfo");
  if (!pageInfo) return;
  if (pageReadState === "reading") {
    pageInfo.textContent = t("reading");
    return;
  }
  if (pageReadState === "error") {
    pageInfo.textContent = pageReadError || t("readFailed");
    return;
  }
  if (currentPage) {
    const title = currentPage.title || currentTabInfo?.title || "Current page";
    const length = (currentPage.content || "").length;
    pageInfo.textContent = `${title} - ${length.toLocaleString()} ${t("chars")}`;
    return;
  }
  pageInfo.textContent = t("waiting");
}

function renderPageChip() {
  const chip = document.getElementById("pageChip");
  const titleNode = document.getElementById("pageChipTitle");
  const metaNode = document.getElementById("pageChipMeta");
  if (!chip || !titleNode || !metaNode) return;
  const info = currentPage || currentTabInfo;
  if (!info?.title && !info?.url) {
    chip.hidden = true;
    return;
  }
  chip.hidden = false;
  titleNode.textContent = info.title || info.url || "-";
  const host = info.host || safeHost(info.url);
  metaNode.textContent = host || info.url || "";
}

function safeHost(url) {
  try {
    return url ? new URL(url).host : "";
  } catch {
    return "";
  }
}

function getPreferredSessionTitle() {
  return currentPage?.title || currentTabInfo?.title || t("newChat");
}

function syncActiveSessionTitle() {
  const session = getActiveSession();
  if (!session) return;
  const preferredTitle = getPreferredSessionTitle();
  const preferredUrl = currentPage?.url || currentTabInfo?.url || "";
  if (!preferredTitle) return;
  const shouldUpdate =
    !session.messages.length ||
    isUntitledSession(session.title) ||
    !session.sourceUrl ||
    session.sourceUrl === preferredUrl;
  if (!shouldUpdate) return;
  session.title = preferredTitle;
  session.sourceUrl = preferredUrl;
  session.updatedAt = Date.now();
  saveSessions();
  renderActiveTitleOnly();
}
