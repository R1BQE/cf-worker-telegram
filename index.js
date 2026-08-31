const TELEGRAM_API_BASE = 'https://api.telegram.org';
const PROXY_SECRET = 'CHANGE_ME';
const BOT_UPDATE_FORWARD_URL = 'https://svadba.blind-ham.ru/webhook';

const DOC_HTML = `<!DOCTYPE html>
<html>
<head>
    <title>Telegram Bot API Proxy</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body>
    <h1>Telegram Bot API Proxy</h1>
    <p>Protected Telegram Bot API proxy with webhook forwarding.</p>
    <p>API format: <code>/SECRET/botTOKEN/METHOD</code></p>
    <p>Webhook format: <code>/SECRET/webhook</code></p>
</body>
</html>`;

function corsHeaders(request) {
  const requested = request.headers.get('Access-Control-Request-Headers');
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD',
    'Access-Control-Allow-Headers': requested || 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function withCors(response, request) {
  const headers = new Headers(response.headers);
  const cors = corsHeaders(request);
  for (const [key, value] of Object.entries(cors)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function forwardWebhook(request, env) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const backendSecret = env.BACKEND_SECRET;
  if (!backendSecret) {
    return new Response('Backend secret is not configured', { status: 500 });
  }

  const headers = new Headers();
  headers.set('Content-Type', request.headers.get('Content-Type') || 'application/json');
  headers.set('X-Proxy-Secret', backendSecret);

  try {
    const backendResponse = await fetch(BOT_UPDATE_FORWARD_URL, {
      method: 'POST',
      headers,
      body: request.body,
    });

    return new Response(backendResponse.body, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: backendResponse.headers,
    });
  } catch (error) {
    return new Response(`Error forwarding webhook: ${error.message}`, { status: 502 });
  }
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  if (parts.length === 0) {
    return new Response(DOC_HTML, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=UTF-8',
        'Cache-Control': 'no-store',
      },
    });
  }

  const secret = env.PROXY_SECRET || PROXY_SECRET;

  if (!secret || secret === 'CHANGE_ME') {
    return new Response('Worker secret is not configured', { status: 500 });
  }

  if (parts[0] !== secret) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Telegram webhook updates:
  // /SECRET/webhook -> https://svadba.blind-ham.ru/webhook
  if (parts.length === 2 && parts[1] === 'webhook') {
    return forwardWebhook(request, env);
  }

  // Telegram Bot API proxy:
  // /SECRET/botTOKEN/METHOD
  // /SECRET/file/botTOKEN/METHOD
  let telegramPath;

  if (parts[1]?.startsWith('bot')) {
    telegramPath = '/' + parts.slice(1).join('/');
  } else if (parts[1] === 'file' && parts[2]?.startsWith('bot')) {
    telegramPath = '/file/' + parts.slice(2).join('/');
  } else {
    return new Response('Invalid request format', { status: 400 });
  }

  const telegramUrl = `${TELEGRAM_API_BASE}${telegramPath}${url.search}`;
  const headers = new Headers(request.headers);

  headers.delete('Authorization');
  headers.delete('Cookie');
  headers.delete('Host');

  const init = {
    method: request.method,
    headers,
    redirect: 'follow',
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
  };

  try {
    const telegramResponse = await fetch(telegramUrl, init);
    return withCors(telegramResponse, request);
  } catch (error) {
    return withCors(
      new Response(`Error proxying request: ${error.message}`, { status: 502 }),
      request,
    );
  }
}

export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  },
};
