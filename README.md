# cf-worker-telegram

A lightweight Cloudflare Worker that acts as a bidirectional proxy between your backend and the Telegram Bot API.

## What it does

```text
Your backend  <->  Cloudflare Worker  <->  Telegram
```

The Worker proxies Telegram Bot API requests and can receive Telegram webhook updates and forward them to your backend.

## Configuration

Set these as Cloudflare Worker environment variables / Secrets:

- `BOT_UPDATE_FORWARD_URL` — HTTPS URL of your backend webhook handler.
- `WEBHOOK_SECRET` — the same secret configured in Telegram with `setWebhook`.
- `BACKEND_SECRET` — optional secret sent to your backend as `X-Proxy-Secret`.
- `TELEGRAM_BOT_TOKEN` — optional. When set, the Worker only accepts requests containing this exact bot token.

For a single bot, setting `TELEGRAM_BOT_TOKEN` is recommended.

## Telegram Bot API

The proxy preserves the original API path:

```text
https://YOUR-WORKER/bot<TOKEN>/sendMessage
```

and forwards it to:

```text
https://api.telegram.org/bot<TOKEN>/sendMessage
```

All Telegram Bot API methods supported by the upstream API can be proxied. Multipart requests and file downloads are supported.

## Webhook

Use the Worker endpoint:

```text
https://YOUR-WORKER/webhook
```

When registering the webhook, configure Telegram's secret token and use the same value as `WEBHOOK_SECRET`:

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://YOUR-WORKER/webhook","secret_token":"YOUR_WEBHOOK_SECRET"}'
```

Telegram sends the secret in `X-Telegram-Bot-Api-Secret-Token`. The Worker rejects requests with a missing or incorrect secret before forwarding them to your backend.

If `BACKEND_SECRET` is configured, the Worker adds it as `X-Proxy-Secret` when forwarding the webhook. The Telegram secret itself is removed before the request reaches your backend.

The original `/botRedirect<TOKEN>` webhook path is retained for compatibility, but it is now protected by the same webhook secret and optional bot-token restriction.

## Security notes

Do not expose bot tokens in source code. Store `TELEGRAM_BOT_TOKEN`, `WEBHOOK_SECRET`, and `BACKEND_SECRET` as Cloudflare Secrets.

For compatibility with existing Telegram libraries, the Bot API proxy still accepts `/bot<TOKEN>/...`. When `TELEGRAM_BOT_TOKEN` is configured, only your configured bot token is accepted.

## Local development

Use Wrangler and provide the secrets through your local `.dev.vars` file or environment configuration. Never commit secrets to Git.

## License

MIT
