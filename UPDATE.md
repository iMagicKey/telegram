# UPDATE — imagic-telegram

> Audit performed: 2026-04-07. Version at time of audit: 1.1.1

---

## Critical bugs (fix immediately)

- [ ] **TG-03: `sendFile` and `sendPhoto` with a Buffer do not send a file part.** imagic-request now delivers Buffers byte-identical, but documents them as plain fields, so they arrive with no `filename`. From the Bot API documentation, an upload needs a file part, so a Buffer is likely to be rejected or read as a file id (not checked against the real API). Fix: `Buffer.isBuffer(file) ? Readable.from([file]) : file` in both methods, then remove `todo` from the test in `tests/integration.test.js`.

---

## package.json

- [ ] Raise the `imagic-request` minimum from `^1.0.1` once a release with the redirect and multipart fixes exists.

---

## API improvements (minor bump)

- [ ] **`editMessage(chatId, messageId, text)`**
- [ ] **`deleteMessage(chatId, messageId)`**
- [ ] **`getUpdates(offset)`** — polling for receiving incoming messages
- [ ] **`setWebhook(url)`** / **`deleteWebhook()`**
- [ ] **`answerCallbackQuery(callbackQueryId, text)`**
- [ ] **Inline keyboard** — `reply_markup` parameter in `sendMessage`

---

## Backlog

- [ ] Basic incoming message handling mechanism (router: on('message', handler))
- [ ] Retry on network errors (Telegram API sometimes returns 429 Too Many Requests)
- [ ] TypeScript type exports
- [ ] Rate limiting — Telegram limits to 30 messages/sec per bot
