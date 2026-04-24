function normalizeText(value) {
  return (value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function collectMetaDescription() {
  const meta =
    document.querySelector('meta[name="description"]') ||
    document.querySelector('meta[property="og:description"]');
  return meta ? normalizeText(meta.getAttribute("content")) : "";
}

function getPageContent() {
  const title = normalizeText(document.title);
  const url = location.href;
  const description = collectMetaDescription();
  const selection = normalizeText(window.getSelection ? window.getSelection().toString() : "");
  const content = normalizeText(document.body ? document.body.innerText : "");

  return {
    title,
    url,
    description,
    selection,
    content
  };
}

function isVisible(node) {
  if (!node || !(node instanceof Element)) return false;
  const style = window.getComputedStyle(node);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = node.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function scoreInput(node) {
  if (!isVisible(node)) return -1;
  if (node.closest("[aria-hidden='true'], [hidden], [inert]")) return -1;
  if (node.matches("[disabled], [readonly], [aria-disabled='true']")) return -1;
  const rect = node.getBoundingClientRect();
  let score = 0;
  if (node.matches("textarea")) score += 50;
  if (node.matches("[contenteditable='true']")) score += 40;
  if (node.matches("[role='textbox']")) score += 20;
  score += Math.min(rect.width, 900) / 20;
  score += Math.min(rect.height, 300) / 20;
  if (rect.bottom > window.innerHeight * 0.45) score += 25;
  if (rect.top > 0) score += 10;
  return score;
}

function getHostSelectors() {
  const host = location.hostname;
  if (/chatgpt\.com$|chat\.openai\.com$/.test(host)) {
    return ["#prompt-textarea", "textarea", "[contenteditable='true']"];
  }
  if (/kimi\.com$/.test(host)) {
    return ["textarea", "[contenteditable='true']", "[role='textbox']"];
  }
  if (/qianwen\.com$/.test(host)) {
    return ["textarea", "[contenteditable='true']", "[role='textbox']"];
  }
  if (/doubao\.com$/.test(host)) {
    return ["textarea", "[contenteditable='true']", "[role='textbox']"];
  }
  if (/gemini\.google\.com$/.test(host)) {
    return ["rich-textarea textarea", "textarea", "[contenteditable='true']", "[role='textbox']"];
  }
  return [];
}

function findChatInput() {
  const selectors = [
    ...getHostSelectors(),
    "textarea",
    "[contenteditable='true']",
    "[role='textbox']"
  ];
  const seen = new Set();
  const candidates = [];

  for (const selector of selectors) {
    for (const node of document.querySelectorAll(selector)) {
      if (seen.has(node)) continue;
      seen.add(node);
      candidates.push(node);
    }
  }

  candidates.sort((a, b) => scoreInput(b) - scoreInput(a));
  return candidates.find((node) => scoreInput(node) >= 0) || null;
}

function setNativeValue(node, value) {
  if (node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement) {
    const prototype = node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(node, value);
    else node.value = value;
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  if (node.isContentEditable) {
    node.textContent = value;
    node.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }));
    return true;
  }

  return false;
}

function focusEnd(node) {
  node.focus();
  if (node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement) {
    const length = node.value.length;
    node.setSelectionRange(length, length);
    return;
  }

  if (node.isContentEditable) {
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

function fillChatInput(text) {
  const target = findChatInput();
  if (!target) {
    return { ok: false, error: "Chat input not ready yet." };
  }

  if (!setNativeValue(target, text)) {
    return { ok: false, error: "Found a chat input, but could not fill it." };
  }

  focusEnd(target);
  return { ok: true };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getPageContent") {
    sendResponse({ ok: true, page: getPageContent() });
    return;
  }

  if (request.action === "fillChatInput") {
    sendResponse(fillChatInput(request.text || ""));
  }
});
