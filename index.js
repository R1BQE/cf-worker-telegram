const TELEGRAM_API_BASE = 'https://api.telegram.org';

const DOC_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <title>Telegram Bot API Proxy</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body>
    <h1>Telegram Bot API Proxy</h1>
    <p>Bidirectional Cloudflare Worker proxy for the Telegram Bot API.</p>
    <h2>Endpoints</h2>
    <ul>
        <li><code>/bot&lt;TOKEN&gt;/METHOD</code> — Telegram Bot API proxy.</li>
        <li><code>/file/bot&lt;TOKEN&gt;/PATH</code> — Telegram file download proxy.</li>
        <li><code>/webhook</code> — authenticated Telegram webhook forwarding.</li>
    </ul>
    <p>The secure webhook endpoint requires Telegram's <code>X-Telegram-Bot-Api-Secret-Token</code>.</p>
</body>
</html>`;

function textResponse(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=UTF-8',
      ...headers,
    },
  });
}

function corsHeaders(request) {
  const requested = request.headers.get('Access-Control-Request-Headers');
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD',
    'Access-Control-Allow-Headers': requested || 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function optionsResponse(request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request),
  });
}

function withCors(response, request) {
  const result = new Response(response.body, response);
  for (const [name, value] of Object.entries(corsHeaders(request))) {
    result.headers.set(name, value);
  }
  return result;
}

function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function handleWebhook(request, env) {
  if (request.method !== 'POST') {
    return textResponse('Method Not Allowed', 405, { Allow: 'POST' });
  }

  if (!env.BOT_UPDATE_FORWARD_URL) {
    return textResponse('Webhook backend is not configured', 503);
  }

  if (!env.WEBHOOK_SECRET) {
    return textResponse('Webhook secret is not configured', 503);
  }

  const suppliedSecret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (!constantTimeEqual(suppliedSecret || '', env.WEBHOOK_SECRET)) {
    return textResponse('Unauthorized', 401);
  }

  const headers = new Headers(request.headers);
  headers.delete('X-Telegram-Bot-Api-Secret-Token');

  if (env.BACKEND_SECRET) {
    headers.set('X-Proxy-Secret', env.BACKEND_SECRET);
  }

  try {
    const forwardRequest = new Request(env.BOT_UPDATE_FORWARD_URL, {
      method: 'POST',
      headers,
      body: request.body,
      redirect: 'follow',
    });

    const response = await fetch(forwardRequest);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    return textResponse(`Failed to forward webhook: ${error.message}`, 502);
  }
}

async function handleTelegramProxy(request, url, pathParts) {
  const first = pathParts[0];
  const isFileRequest = first === 'file';

  let token;
  if (isFileRequest) {
    const botPart = pathParts[1];
    if (!botPart || !botPart.startsWith('bot')) {
      return textResponse('Invalid request format', 400);
    }
    token = botPart.slice(3);
  } else {
    if (!first.startsWith('bot')) {
      return textResponse('Invalid request format', 400);
    }
    token = first.slice(3).split('/')[0];
  }

  // This Worker is intentionally a universal Telegram Bot API proxy.
  // Any bot token is accepted; the token is passed through to Telegram unchanged.
  if (!token) {
    return textResponse('Unauthorized', 401);
  }

  const telegramUrl = `${TELEGRAM_API_BASE}${url.pathname}${url.search}`;
  const headers = new Headers(request.headers);
  const contentType = headers.get('Content-Type');

  if (
    contentType &&
    contentType.toLowerCase().startsWith('application/json') &&
    !contentType.toLowerCase().includes('charset')
  ) {
    headers.set('Content-Type', 'application/json; charset=UTF-8');
  }

  const init = {
    method: request.method,
    headers,
    redirect: 'follow',
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
  };

  try {
    const telegramResponse = await fetch(telegramUrl, init);
    return withCors(telegramResponse, request);
  } catch (error) {
    return textResponse(`Error proxying request: ${error.message}`, 502);
  }
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);

  if (url.pathname === '/' || pathParts.length === 0) {
    return new Response(DOC_HTML, {
      headers: {
        'Content-Type': 'text/html; charset=UTF-8',
        'Cache-Control': 'no-store',
      },
    });
  }

  if (url.pathname === '/webhook') {
    return handleWebhook(request, env);
  }

  // Legacy webhook endpoint retained for compatibility.
  if (pathParts.length === 1 && pathParts[0].startsWith('botRedirect')) {
    return handleWebhook(request, env);
  }

  return handleTelegramProxy(request, url, pathParts);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return optionsResponse(request);
    }
    return handleRequest(request, env);
  },
};
