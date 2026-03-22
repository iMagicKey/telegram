# UPDATE — imagic-telegram

> Аудит проведён: 2026-03-22. Версия на момент аудита: 1.0.0

---

## Критические баги (исправить немедленно)

- [ ] **`sendMessage` не проверяет `ok: false`** — ответ Telegram API всегда содержит `{ ok: true|false, result|description }`. Сейчас код не проверяет `ok`, поэтому при ошибке API (неверный токен, недоступный чат) метод возвращает сырой объект ошибки вместо броска. Нужно:
  ```js
  const data = JSON.parse(res.buffer.toString())
  if (!data.ok) throw new Error(`Telegram API error: ${data.description}`)
  return data.result
  ```

- [ ] **Мёртвый закомментированный код `sendFile`** — использует браузерный `FormData`, который не работает в Node.js ESM. Код должен быть либо полностью реализован через `imagic-request` multipart, либо удалён. Мёртвый код в комментариях засоряет читаемость.

---

## package.json

- [ ] Добавить `"exports"`:
  ```json
  "exports": { ".": "./src/index.js", "./package.json": "./package.json" }
  ```
- [ ] Добавить `"files": ["src", "README.md", "LICENSE"]`
- [ ] Добавить `"sideEffects": false`
- [ ] Добавить `devDependencies` — сейчас их нет:
  ```json
  "@eslint/js": "^10.0.1",
  "chai": "^5.x",
  "eslint": "^10.1.0",
  "eslint-config-prettier": "^10.1.8",
  "eslint-plugin-import": "^2.32.0",
  "eslint-plugin-n": "^17.24.0",
  "eslint-plugin-prettier": "^5.5.5",
  "eslint-plugin-promise": "^7.2.1",
  "globals": "^16.x",
  "prettier": "^3.8.1"
  ```
- [ ] Обновить `"scripts.test"`: `"node --test ./tests/**/*.test.js"`

---

## ESLint

- [ ] Создать `eslint.config.js` по стандарту (заменить текущий `.eslintrc`-файл если есть)
- [ ] Создать `.prettierrc.json`
- [ ] Убрать `/* eslint-disable camelcase */` — добавить точечный `// eslint-disable-next-line camelcase` только там где нужно, с комментарием почему (Telegram API использует snake_case)

---

## Тесты

Тестов нет. Написать `tests/telegram.test.js` (мокировать `imagic-request`):

- [ ] `sendMessage` формирует корректный JSON payload с `chat_id`, `text`, `parse_mode`
- [ ] `sendMessage` отправляет POST на правильный URL (`https://api.telegram.org/bot{TOKEN}/sendMessage`)
- [ ] `sendMessage` возвращает `data.result` при успехе (`ok: true`)
- [ ] `sendMessage` бросает ошибку при `ok: false` с описанием из `data.description`
- [ ] Constructor корректно формирует base URL из токена
- [ ] `sendMessage` с кастомным `chatId` (после реализации) использует переданный chat_id, а не из конструктора

---

## Улучшения API (minor bump)

- [ ] **`chatId` как параметр метода** — сейчас `chatId` только в конструкторе. Нужно принимать его в каждом методе с fallback на constructor-значение:
  ```js
  sendMessage(text, chatId = this.chatId, options = {})
  ```
- [ ] **`sendDocument(filePath, chatId)`** — реализовать через `imagic-request` multipart (после фикса multipartform.js в `imagic-request`)
- [ ] **`sendPhoto(filePath|url, chatId)`** — поддержка как локального файла, так и URL
- [ ] **`editMessage(chatId, messageId, text)`**
- [ ] **`deleteMessage(chatId, messageId)`**
- [ ] **`getUpdates(offset)`** — polling для получения входящих сообщений
- [ ] **`setWebhook(url)`** / **`deleteWebhook()`**
- [ ] **`answerCallbackQuery(callbackQueryId, text)`**
- [ ] **Inline keyboard** — параметр `reply_markup` в `sendMessage`

---

## Задачи (backlog)

- [ ] Базовый механизм обработки входящих сообщений (router: on('message', handler))
- [ ] Retry при сетевых ошибках (Telegram API иногда возвращает 429 Too Many Requests)
- [ ] Экспорт типов для TypeScript
- [ ] Rate limiting — Telegram ограничивает до 30 сообщений/сек на бота
