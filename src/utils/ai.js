// Centralized AI provider configuration
// Supports: Groq, OpenRouter

const PROVIDERS = {
  groq: {
    name: 'Groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    defaultModel: 'llama-3.3-70b-versatile',
    visionModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
    keyPrefix: 'gsk_',
    keyUrl: 'https://console.groq.com/keys',
    fallbackModels: ['llama-3.1-8b-instant', 'llama-3.2-3b-preview'],
  },
  openrouter: {
    name: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'google/gemma-3-27b-it:free',
    visionModel: 'nvidia/nemotron-nano-12b-v2-vl:free',
    keyPrefix: 'sk-or-',
    keyUrl: 'https://openrouter.ai/keys',
    fallbackModels: [
      'meta-llama/llama-3.3-70b-instruct:free',
      'nvidia/nemotron-3-super-120b-a12b:free',
      'google/gemma-3-12b-it:free',
      'meta-llama/llama-3.2-3b-instruct:free',
    ],
    visionFallbacks: [
      'google/gemma-3-27b-it:free',
    ],
  },
};

export function getProvider() {
  return localStorage.getItem('solorev-ai-provider') || 'groq';
}

export function setProvider(id) {
  localStorage.setItem('solorev-ai-provider', id);
}

export function getApiKey() {
  return (localStorage.getItem('solorev-api-key') || '').trim();
}

export function getProviderConfig() {
  return PROVIDERS[getProvider()] || PROVIDERS.groq;
}

export function getProviders() {
  return PROVIDERS;
}

// Build headers for the current provider
function buildHeaders(apiKey) {
  const provider = getProvider();
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = window.location.origin;
    headers['X-Title'] = 'Erudite';
  }
  return headers;
}

// Build request body
function buildBody({ model, messages, maxTokens, temperature }) {
  const body = { model, messages, max_tokens: maxTokens, temperature };
  // Tell OpenRouter to try other providers if one is blocked by privacy settings
  if (getProvider() === 'openrouter') {
    body.route = 'fallback';
  }
  return body;
}

// Make an AI chat completion request using the selected provider
// Tries each model up to 2 times, then moves to fallbacks
export async function aiChat({ messages, maxTokens = 1000, temperature = 0.7, useVision = false }) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('No API key set. Please add one in Settings.');

  const config = getProviderConfig();
  const headers = buildHeaders(apiKey);
  const primaryModel = useVision ? config.visionModel : config.defaultModel;
  const fallbacks = useVision
    ? (config.visionFallbacks || [])
    : (config.fallbackModels || []);
  const models = [primaryModel, ...fallbacks];

  let lastErr;
  // Try each model twice (providers can have transient failures)
  const attempts = models.flatMap(m => [m, m]);

  for (let i = 0; i < attempts.length; i++) {
    const model = attempts[i];
    const body = buildBody({ model, messages, maxTokens, temperature });

    let response;
    try {
      response = await fetch(config.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    } catch (netErr) {
      lastErr = 'Network error: ' + netErr.message;
      continue;
    }

    if (response.ok) {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (content && content.trim()) return content;
      // Empty/null content — treat as retriable so we try the next model
      lastErr = 'Model returned empty response';
      continue;
    }

    const errBody = await response.json().catch(() => null);
    const detail = errBody?.error?.message || '';

    if (response.status === 401) {
      throw new Error(`Invalid API key. Get a new one at ${config.keyUrl}`);
    }
    // Treat all other errors as retriable — try next attempt
    lastErr = `${model}: ${detail || `Error ${response.status}`}`;
    const retryAfter = parseFloat(response.headers.get('retry-after'));
    const waitMs = response.status === 429
      ? ((retryAfter > 0 && retryAfter < 60) ? retryAfter * 1000 : 3000)
      : 2000;
    await new Promise(r => setTimeout(r, waitMs));
    continue;
  }
  throw new Error(`All AI models failed. Last error: ${lastErr || 'unknown'}. Try again in a minute.`);
}

// Test if current API key + provider works, returns { ok, msg }
export async function testKey(key) {
  if (!key) return { ok: false, msg: 'No key entered.' };

  const config = getProviderConfig();
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${key}`,
  };
  if (getProvider() === 'openrouter') {
    headers['HTTP-Referer'] = window.location.origin;
    headers['X-Title'] = 'Erudite';
  }

  // Use simple single-model request for test
  const body = {
    model: config.defaultModel,
    messages: [{ role: 'user', content: 'Say ok' }],
    max_tokens: 3,
  };
  if (getProvider() === 'openrouter') {
    body.route = 'fallback';
  }

  try {
    const res = await fetch(config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (res.ok) {
      return { ok: true, msg: `✓ Key is valid and working with ${config.name}!` };
    }

    const resBody = await res.json().catch(() => null);
    const detail = resBody?.error?.message || `HTTP ${res.status}`;

    if (res.status === 401) {
      return { ok: false, msg: `Invalid API key (${detail}). Get a new key at ${config.keyUrl}` };
    }
    // 429 = key is valid but rate limited — that's fine
    if (res.status === 429) {
      return { ok: true, msg: `✓ Key is valid! (Currently rate-limited — wait a moment before using AI features.)` };
    }
    return { ok: false, msg: `Error (${res.status}): ${detail}` };
  } catch (err) {
    return { ok: false, msg: `Network error: ${err.message}` };
  }
}
