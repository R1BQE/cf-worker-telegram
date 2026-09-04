# cf-worker-telegram

A lightweight Cloudflare Worker that acts as a bidirectional proxy between your backend and the Telegram Bot API.

## What it does

```text
Your backend  <->  Cloudflare Worker  <->  Telegram
```

The Worker proxies Telegram Bot API requests and can receive Telegram webhook updates and forward them to your backend.

## Telegram Bot API proxy

This Worker is intentionally a **universal proxy**. It does not contain or check a specific `TELEGRAM_BOT_TOKEN`.

Any Telegram bot token can be used in the normal Bot API URL:

```text
https://YOUR-WORKER/bot<TOKEN>/sendMessage
```

The Worker forwards the request unchanged to:

```text
https://api.telegram.org/bot<TOKEN>/sendMessage
```

File downloads are also supported:

```text
https://YOUR-WORKER/file/bot<TOKEN>/FILE_PATH
```

All Telegram Bot API methods supported by the upstream API can be proxied. Multipart requests and file downloads are supported.

## Environment and secrets

The Worker uses these runtime environment values:

- `BOT_UPDATE_FORWARD_URL` — backend webhook URL.
- `WEBHOOK_SECRET` — secret configured in Telegram with `setWebhook`.
- `BACKEND_SECRET` — secret sent to the backend as `X-Proxy-Secret`.

There is deliberately no `TELEGRAM_BOT_TOKEN` variable.

For local development, Wrangler can load these values from a `.env` file located next to `wrangler.toml`. The real `.env` file must never be committed to Git. A safe template is provided as `.env.example`.

For the deployed Worker, the same names are declared as required secrets in `wrangler.toml`. They can be managed in Cloudflare under Worker → Settings → Variables and Secrets, or uploaded from a dotenv file with Wrangler's `--secrets-file` option.

## Webhook

Use the Worker endpoint:

```text
https://YOUR-WORKER/webhook
```

When registering a webhook, configure Telegram's secret token and use the same value as `WEBHOOK_SECRET`:

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://YOUR-WORKER/webhook","secret_token":"YOUR_WEBHOOK_SECRET"}'
```

Telegram sends the secret in `X-Telegram-Bot-Api-Secret-Token`. The Worker rejects requests with a missing or incorrect secret before forwarding them to the backend.

The Telegram secret is removed before forwarding. If `BACKEND_SECRET` is configured, the Worker adds it as `X-Proxy-Secret`.

The legacy `/botRedirect<TOKEN>` webhook path is retained for compatibility and is protected by the same webhook secret.

## Security

Never commit `.env`, `.env.*`, `.dev.vars`, or `.dev.vars.*` files containing real secrets.

Bot tokens are intentionally not stored in the Worker configuration: they remain in the API paths used by individual bots.

## Local development

Install Wrangler and run the Worker with:

```bash
npx wrangler dev
```

Create a local `.env` from `.env.example` and put the real values there. Wrangler loads the values into the Worker `env` object during local development.

## Deployment

The Cloudflare Git integration should deploy the `secure-bidirectional` branch with:

```bash
npx wrangler deploy
```

The production Worker name is `fancy-rice-00a9`.

## License

MIT
