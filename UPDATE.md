# UPDATE — imagic-telegram

> Audit performed: 2026-04-07. Version at time of audit: 1.1.1

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
