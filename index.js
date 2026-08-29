const TELEGRAM_API_BASE = 'https://api.telegram.org';
const PROXY_SECRET = 'CHANGE_ME';

const DOC_HTML = `<!DOCTYPE html>
<html>
<head>
    <title>Telegram Bot API Proxy</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body>
    <h1>Telegram Bot API Proxy</h1>
    <p>Protected Telegram Bot API proxy.</p>
    <p>Format: <code>/SECRET/botTOKEN/METHOD</code></p>
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

  // Required format:
  // /SECRET/botTOKEN/METHOD
  // /SECRET/file/botTOKEN/METHOD
  const secret = env.PROXY_SECRET || PROXY_SECRET;

  if (!secret || secret === 'CHANGE_ME') {
    return new Response('Worker secret is not configured', { status: 500 });
  }

  if (parts[0] !== secret) {
    return new Response('Unauthorized', { status: 401 });
  }

  let telegramPath;

  if (parts[1]?.startsWith('bot')) {
    // /SECRET/botTOKEN/METHOD
    telegramPath = '/' + parts.slice(1).join('/');
  } else if (parts[1] === 'file' && parts[2]?.startsWith('bot')) {
    // /SECRET/file/botTOKEN/METHOD
    telegramPath = '/file/' + parts.slice(2).join('/');
  } else {
    return new Response('Invalid request format', { status: 400 });
  }

  const telegramUrl = `${TELEGRAM_API_BASE}${telegramPath}${url.search}`;
  const headers = new Headers(request.headers);

  // Do not forward proxy-specific authorization headers to Telegram.
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
