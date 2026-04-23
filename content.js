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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getPageContent") {
    sendResponse({ ok: true, page: getPageContent() });
  }
});
