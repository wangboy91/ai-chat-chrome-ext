const DEFAULTS = {
  protocol: "openai",
  model: "gpt-4o-mini",
  baseUrl: "",
  apiKey: "",
  maxContextChars: 18000,
  requestTimeoutMs: 120000
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "ai-page-chat") {
    return;
  }

  port.onMessage.addListener((message) => {
    if (message.action === "askAI") {
      handleAskAI(port, message.data);
    }
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "openSidePanel") {
    const windowId = request.windowId || sender.tab?.windowId;
    chrome.sidePanel
      .open({ windowId })
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (request.action === "askAI") {
    callAI(request.data, false)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (request.action === "askAIOnce") {
    callAI(request.data, false)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});

async function handleAskAI(port, data) {
  try {
    await callAI(data, true, (chunk) => {
      port.postMessage({ type: "chunk", chunk });
    });
    port.postMessage({ type: "done" });
  } catch (error) {
    port.postMessage({ type: "error", error: error.message || "Request failed" });
  }
}

async function callAI(data, stream, onChunk) {
  const config = { ...DEFAULTS, ...data };
  validateConfig(config);

  const protocol = config.protocol === "anthropic" ? "anthropic" : "openai";
  const url = getEndpoint(protocol, config.baseUrl);
  const headers = {
    "Content-Type": "application/json",
    Accept: stream ? "text/event-stream" : "application/json"
  };
  const body = buildRequestBody(protocol, config, stream);

  if (protocol === "openai") {
    headers.Authorization = `Bearer ${config.apiKey}`;
  } else {
    headers["x-api-key"] = config.apiKey;
    headers["anthropic-version"] = "2023-06-01";
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Number(config.requestTimeoutMs) || DEFAULTS.requestTimeoutMs);
  let response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`AI request timed out after ${Math.round((Number(config.requestTimeoutMs) || DEFAULTS.requestTimeoutMs) / 1000)} seconds.`);
    }
    throw error;
  }

  try {
    if (!response.ok) {
      const message = await readErrorMessage(response);
      throw new Error(message || `AI request failed: ${response.status} (${url})`);
    }

    if (!stream) {
      const text = await readNonStreamText(protocol, response);
      return text;
    }

    await readStream(protocol, response, onChunk);
    return "";
  } finally {
    clearTimeout(timeoutId);
  }
}

function validateConfig(config) {
  if (!config.apiKey) {
    throw new Error("Please set an API key first.");
  }
  if (!config.model) {
    throw new Error("Please set a model name first.");
  }
  if (!config.prompt) {
    throw new Error("Please enter a question.");
  }
  if (Array.isArray(config.images) && config.images.length && !config.vision) {
    throw new Error("The active model is not marked as Vision-capable. Enable Vision in model settings first.");
  }
}

function getEndpoint(protocol, baseUrl) {
  const cleanBase = (baseUrl || "").trim().replace(/\/+$/, "");
  if (cleanBase) {
    if (isFullEndpoint(protocol, cleanBase)) {
      return cleanBase;
    }

    const versionedBase = cleanBase.endsWith("/v1") ? cleanBase : `${cleanBase}/v1`;
    return protocol === "openai"
      ? `${versionedBase}/chat/completions`
      : `${versionedBase}/messages`;
  }

  return protocol === "openai"
    ? "https://api.openai.com/v1/chat/completions"
    : "https://api.anthropic.com/v1/messages";
}

function isFullEndpoint(protocol, url) {
  if (protocol === "openai") {
    return /\/chat\/completions$/.test(url);
  }

  return /\/messages$/.test(url);
}

function buildRequestBody(protocol, config, stream) {
  const context = trimContext(config.context || "", Number(config.maxContextChars) || DEFAULTS.maxContextChars);
  const images = Array.isArray(config.images) ? config.images.slice(0, 4) : [];
  const systemPrompt =
    "You are a helpful browser side-panel assistant. Answer using the provided page context. " +
    "Use clear Markdown formatting when it improves readability. " +
    "If the answer is not in the page, say what is missing and avoid inventing facts.";
  const userContent = `Page context:\n${context}\n\nQuestion:\n${config.prompt}`;

  if (protocol === "anthropic") {
    const content = [{ type: "text", text: userContent }];
    for (const image of images) {
      const parsed = parseDataUrl(image.dataUrl);
      if (parsed) {
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: parsed.mimeType,
            data: parsed.base64
          }
        });
      }
    }

    return {
      model: config.model,
      max_tokens: Number(config.maxTokens) || 2048,
      system: systemPrompt,
      stream,
      messages: [{ role: "user", content }]
    };
  }

  const content = images.length
    ? [
        { type: "text", text: userContent },
        ...images.map((image) => ({
          type: "image_url",
          image_url: { url: image.dataUrl }
        }))
      ]
    : userContent;

  return {
    model: config.model,
    stream,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content }
    ]
  };
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return null;
  }
  return {
    mimeType: match[1],
    base64: match[2]
  };
}

function trimContext(text, maxChars) {
  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, maxChars)}\n\n[Context truncated to ${maxChars} characters.]`;
}

async function readErrorMessage(response) {
  const text = await response.text();
  if (!text) {
    return "";
  }

  try {
    const json = JSON.parse(text);
    return json.error?.message || json.message || text;
  } catch {
    return text.slice(0, 500);
  }
}

async function readNonStreamText(protocol, response) {
  const raw = await response.text();
  if (!raw) {
    return "";
  }

  try {
    const json = JSON.parse(raw);
    return extractText(protocol, json) || extractStreamText(protocol, json) || raw;
  } catch {
    return raw;
  }
}

function extractText(protocol, json) {
  if (protocol === "anthropic") {
    return (json.content || [])
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("");
  }

  return json.choices?.[0]?.message?.content || "";
}

async function readStream(protocol, response, onChunk) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let emitted = false;

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      const chunk = parseStreamFrame(protocol, line);
      if (chunk) {
        emitted = true;
        onChunk(chunk);
      }
      newlineIndex = buffer.indexOf("\n");
    }
  }

  buffer += decoder.decode();
  const tail = parseStreamFrame(protocol, buffer);
  if (tail) {
    emitted = true;
    onChunk(tail);
  }

  if (!emitted && buffer.trim()) {
    const text = parsePossibleJsonText(protocol, buffer);
    if (text) {
      onChunk(text);
    }
  }
}

function parseStreamFrame(protocol, raw) {
  const trimmed = (raw || "").trim();
  if (!trimmed) {
    return "";
  }

  const dataLines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim());

  const jsonLines = dataLines.length ? dataLines : trimmed.split("\n").map((line) => line.trim());
  let output = "";
  for (const line of jsonLines) {
    if (!line || line === "[DONE]") {
      continue;
    }

    try {
      const json = JSON.parse(line);
      output += extractStreamText(protocol, json);
    } catch {
      // Ignore incomplete stream fragments; the next read usually completes them.
    }
  }

  return output;
}

function parsePossibleJsonText(protocol, raw) {
  try {
    const json = JSON.parse(raw);
    return extractText(protocol, json) || extractStreamText(protocol, json);
  } catch {
    return "";
  }
}

function extractStreamText(protocol, json) {
  const choiceDelta = json.choices?.[0]?.delta;
  const choiceText = json.choices?.[0]?.text;
  const anthropicDelta = json.delta;

  return [
    json.output_text,
    json.output?.text,
    json.output?.choices?.[0]?.message?.content,
    json.output?.choices?.[0]?.delta?.content,
    json.output?.choices?.[0]?.delta?.reasoning_content,
    json.message?.content,
    json.data?.content,
    json.data?.text,
    json.text,
    choiceDelta?.content,
    choiceDelta?.reasoning_content,
    choiceDelta?.reasoning,
    json.choices?.[0]?.message?.content,
    choiceText,
    anthropicDelta?.text,
    anthropicDelta?.partial_json,
    json.content_block?.text,
    extractContentArrayText(json),
    extractAnthropicContent(protocol, json)
  ]
    .filter((value) => typeof value === "string")
    .join("");
}

function extractContentArrayText(json) {
  if (!Array.isArray(json.content)) {
    return "";
  }

  return json.content
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }
      if (item?.type === "text") {
        return item.text || "";
      }
      return "";
    })
    .join("");
}

function extractAnthropicContent(protocol, json) {
  if (protocol !== "anthropic") {
    return "";
  }

  if (json.type === "content_block_delta" && json.delta?.type === "text_delta") {
    return json.delta.text || "";
  }

  return "";
}
