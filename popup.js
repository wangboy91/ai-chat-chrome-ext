const legacyFields = ["protocol", "apiKey", "model", "baseUrl", "maxContextChars"];
const sendShortcutKey = "sendShortcut";
let profiles = [];
let activeModelId = "";
let editingModelId = "";
let language = "en";
let sendShortcut = "enter";

const i18n = {
  zh: {
    title: "\u0041\u0049 \u9875\u9762\u52a9\u624b",
    subtitle: "\u6253\u5f00\u4fa7\u8fb9\u680f\u6216\u914d\u7f6e\u6a21\u578b\u3002",
    open: "\u6253\u5f00\u4fa7\u8fb9\u680f",
    config: "\u6a21\u578b\u914d\u7f6e",
    closeConfig: "\u6536\u8d77\u914d\u7f6e",
    models: "\u6a21\u578b\u5217\u8868",
    new: "\u65b0\u589e",
    name: "\u540d\u79f0",
    protocol: "\u534f\u8bae",
    model: "\u6a21\u578b",
    context: "\u4e0a\u4e0b\u6587\u957f\u5ea6",
    vision: "\u542f\u7528\u56fe\u7247\u5206\u6790",
    save: "\u4fdd\u5b58\u6a21\u578b",
    activate: "\u542f\u7528\u6b64\u6a21\u578b",
    delete: "\u5220\u9664",
    active: "\u5f53\u524d\u542f\u7528",
    draft: "\u65b0\u6a21\u578b",
    saved: "\u6a21\u578b\u5df2\u4fdd\u5b58",
    activated: "\u6a21\u578b\u5df2\u542f\u7528",
    deleted: "\u6a21\u578b\u5df2\u5220\u9664",
    keepOne: "\u81f3\u5c11\u4fdd\u7559\u4e00\u4e2a\u6a21\u578b",
    opened: "\u4fa7\u8fb9\u680f\u5df2\u6253\u5f00",
    openFailed: "\u65e0\u6cd5\u6253\u5f00\u4fa7\u8fb9\u680f",
    sendShortcut: "\u53d1\u9001\u5feb\u6377\u952e",
    enterSend: "\u56de\u8f66\u53d1\u9001",
    ctrlEnterSend: "Ctrl+Enter \u53d1\u9001"
  },
  en: {
    title: "AI Page Chat",
    subtitle: "Open the side panel or configure models.",
    open: "Open side panel",
    config: "Model settings",
    closeConfig: "Hide settings",
    models: "Models",
    new: "New",
    name: "Name",
    protocol: "Protocol",
    model: "Model",
    context: "Context chars",
    vision: "Enable image analysis",
    save: "Save model",
    activate: "Use this model",
    delete: "Delete",
    active: "Active",
    draft: "New model",
    saved: "Model saved",
    activated: "Model activated",
    deleted: "Model deleted",
    keepOne: "Keep at least one model",
    opened: "Side panel opened",
    openFailed: "Could not open side panel",
    sendShortcut: "Send shortcut",
    enterSend: "Enter to send",
    ctrlEnterSend: "Ctrl+Enter to send"
  }
};

document.addEventListener("DOMContentLoaded", async () => {
  const stored = await chrome.storage.local.get(["uiLanguage", sendShortcutKey]);
  language = stored.uiLanguage || "en";
  sendShortcut = stored[sendShortcutKey] || "enter";
  document.getElementById("language").value = language;
  document.getElementById("sendShortcut").value = sendShortcut;
  applyLanguage();
  await loadProfiles();

  document.getElementById("language").addEventListener("change", changeLanguage);
  document.getElementById("sendShortcut").addEventListener("change", changeSendShortcut);
  document.getElementById("openSidePanel").addEventListener("click", openSidePanel);
  document.getElementById("toggleConfig").addEventListener("click", toggleConfig);
  document.getElementById("newModel").addEventListener("click", createDraftModel);
  document.getElementById("saveModel").addEventListener("click", saveModel);
  document.getElementById("activateModel").addEventListener("click", activateEditingModel);
  document.getElementById("deleteModel").addEventListener("click", deleteModel);
});

function t(key) {
  return i18n[language][key] || i18n.en[key] || key;
}

async function changeLanguage(event) {
  language = event.target.value;
  await chrome.storage.local.set({ uiLanguage: language });
  applyLanguage();
  renderModelList();
}

function applyLanguage() {
  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  document.getElementById("popupTitle").textContent = t("title");
  document.getElementById("popupSubtitle").textContent = t("subtitle");
  document.getElementById("openSidePanel").textContent = t("open");
  document.getElementById("toggleConfig").textContent =
    document.getElementById("configPanel").hidden ? t("config") : t("closeConfig");
  document.getElementById("modelsTitle").textContent = t("models");
  document.getElementById("newModel").textContent = t("new");
  document.getElementById("nameLabel").textContent = t("name");
  document.getElementById("protocolLabel").textContent = t("protocol");
  document.getElementById("modelLabel").textContent = t("model");
  document.getElementById("contextLabel").textContent = t("context");
  document.getElementById("visionLabel").textContent = t("vision");
  document.getElementById("sendShortcutLabel").textContent = t("sendShortcut");
  const shortcutSelect = document.getElementById("sendShortcut");
  if (shortcutSelect?.options[0]) shortcutSelect.options[0].text = t("enterSend");
  if (shortcutSelect?.options[1]) shortcutSelect.options[1].text = t("ctrlEnterSend");
  document.getElementById("saveModel").textContent = t("save");
  document.getElementById("activateModel").textContent = t("activate");
  document.getElementById("deleteModel").textContent = t("delete");
}

async function changeSendShortcut(event) {
  sendShortcut = event.target.value === "ctrlEnter" ? "ctrlEnter" : "enter";
  await chrome.storage.local.set({ [sendShortcutKey]: sendShortcut });
  applyLanguage();
}

function toggleConfig() {
  const panel = document.getElementById("configPanel");
  panel.hidden = !panel.hidden;
  applyLanguage();
}

async function loadProfiles() {
  const stored = await chrome.storage.local.get(["modelProfiles", "activeModelId", ...legacyFields]);
  profiles = Array.isArray(stored.modelProfiles) ? stored.modelProfiles : [];

  if (!profiles.length) {
    profiles = [{
      id: crypto.randomUUID(),
      name: "Default model",
      protocol: stored.protocol || "openai",
      model: stored.model || "gpt-4o-mini",
      apiKey: stored.apiKey || "",
      baseUrl: stored.baseUrl || "",
      maxContextChars: stored.maxContextChars || "18000",
      vision: false
    }];
    activeModelId = profiles[0].id;
    await chrome.storage.local.set({ modelProfiles: profiles, activeModelId });
  } else {
    activeModelId = stored.activeModelId || profiles[0].id;
  }

  editingModelId = activeModelId;
  renderModelList();
  fillEditor(getEditingProfile());
}

function renderModelList() {
  const list = document.getElementById("modelList");
  list.replaceChildren();

  for (const profile of profiles) {
    const row = document.createElement("div");
    row.className = `model-list-item${profile.id === activeModelId ? " active" : ""}`;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "model-edit-button";
    button.innerHTML = `<span>${escapeHtml(profile.name || profile.model)}</span><small>${escapeHtml(profile.protocol)} / ${escapeHtml(profile.model)}</small>`;
    button.addEventListener("click", () => {
      editingModelId = profile.id;
      fillEditor(profile);
      renderModelList();
    });

    const active = document.createElement("button");
    active.type = "button";
    active.className = "model-active-button";
    active.textContent = profile.id === activeModelId ? t("active") : t("activate");
    active.disabled = profile.id === activeModelId;
    active.addEventListener("click", async () => {
      editingModelId = profile.id;
      fillEditor(profile);
      await activateEditingModel();
    });

    row.append(button, active);
    list.append(row);
  }
}

function createDraftModel() {
  const profile = {
    id: crypto.randomUUID(),
    name: t("draft"),
    protocol: "openai",
    model: "gpt-4o-mini",
    apiKey: "",
    baseUrl: "",
    maxContextChars: "18000",
    vision: false
  };
  profiles.push(profile);
  editingModelId = profile.id;
  renderModelList();
  fillEditor(profile);
}

async function saveModel() {
  const profile = readEditor();
  const index = profiles.findIndex((item) => item.id === profile.id);
  if (index >= 0) profiles[index] = profile;
  else profiles.push(profile);
  editingModelId = profile.id;
  await chrome.storage.local.set({ modelProfiles: profiles, activeModelId });
  renderModelList();
  showStatus(t("saved"));
}

async function activateEditingModel() {
  await saveModel();
  activeModelId = editingModelId;
  await chrome.storage.local.set({ modelProfiles: profiles, activeModelId });
  renderModelList();
  showStatus(t("activated"));
}

async function deleteModel() {
  if (profiles.length <= 1) {
    showStatus(t("keepOne"));
    return;
  }
  profiles = profiles.filter((item) => item.id !== editingModelId);
  if (activeModelId === editingModelId) activeModelId = profiles[0].id;
  editingModelId = activeModelId;
  await chrome.storage.local.set({ modelProfiles: profiles, activeModelId });
  renderModelList();
  fillEditor(getEditingProfile());
  showStatus(t("deleted"));
}

function getEditingProfile() {
  return profiles.find((item) => item.id === editingModelId) || profiles[0];
}

function fillEditor(profile) {
  document.getElementById("profileName").value = profile.name || "";
  document.getElementById("protocol").value = profile.protocol || "openai";
  document.getElementById("model").value = profile.model || "";
  document.getElementById("apiKey").value = profile.apiKey || "";
  document.getElementById("baseUrl").value = profile.baseUrl || "";
  document.getElementById("maxContextChars").value = profile.maxContextChars || "18000";
  document.getElementById("vision").checked = Boolean(profile.vision);
}

function readEditor() {
  return {
    id: editingModelId || crypto.randomUUID(),
    name: document.getElementById("profileName").value.trim() || "Untitled model",
    protocol: document.getElementById("protocol").value,
    model: document.getElementById("model").value.trim(),
    apiKey: document.getElementById("apiKey").value.trim(),
    baseUrl: document.getElementById("baseUrl").value.trim(),
    maxContextChars: document.getElementById("maxContextChars").value.trim() || "18000",
    vision: document.getElementById("vision").checked
  };
}

async function openSidePanel() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    await chrome.sidePanel.open({ windowId: tab.windowId });
    showStatus(t("opened"));
  } catch (error) {
    showStatus(error.message || t("openFailed"));
  }
}

function showStatus(message) {
  const status = document.getElementById("status");
  status.textContent = message;
  window.setTimeout(() => {
    if (status.textContent === message) status.textContent = "";
  }, 2500);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}
