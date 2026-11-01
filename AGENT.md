# AGENT — imagic-telegram

## Purpose

Send Telegram messages, documents, and photos via the Telegram Bot API using a bot token and chat ID.

## Package

- npm: `imagic-telegram`
- import (local): `import { Telegram } from '../src/index.js'`
- import (installed): `import { Telegram } from 'imagic-telegram'`
- runtime dep: `imagic-request`

## Exports

### `new Telegram(token, chatId): Telegram` *(named + default export)*

- `token` {string} **required** — Telegram bot token from @BotFather (format: `123456:ABC-DEF...`)
- `chatId` {string | number} **required** — default target chat ID for all methods
- returns: `Telegram` instance
- throws: nothing at construction time

---

### `.sendMessage(options): Promise<TelegramResponse>`

- `options.text` {string} **required** — message text (max 4096 chars)
- `options.parse_mode` {`'HTML'` | `'Markdown'` | `'MarkdownV2'`} [`'HTML'`] — text formatting mode
- `options.chatId` {string | number} [constructor default] — override chat for this call
- returns: `Promise<TelegramResponse>`
- throws: `Error` — message is `response.description` from Telegram when `ok: false`

---

### `.sendFile(options): Promise<TelegramResponse>`

- `options.file` {ReadableStream | Buffer} **required** — file content; use `fs.createReadStream(path)` for disk files
- `options.caption` {string} [`''`] — document caption
- `options.chatId` {string | number} [constructor default] — override chat for this call
- returns: `Promise<TelegramResponse>`
- throws: `Error` — when Telegram API returns `ok: false`

Sends via `/sendDocument` endpoint.

---

### `.sendPhoto(options): Promise<TelegramResponse>`

- `options.photo` {ReadableStream | Buffer} **required** — image content
- `options.caption` {string} [`''`] — photo caption
- `options.chatId` {string | number} [constructor default] — override chat for this call
- returns: `Promise<TelegramResponse>`
- throws: `Error` — when Telegram API returns `ok: false`

Sends via `/sendPhoto` endpoint.

---

### `TelegramResponse`

```ts
{
    ok: true,
    result: {
        message_id: number,
        // ...full Telegram Message object
    }
}
```

## Usage Patterns

### Send a plain text message

```js
import { Telegram } from 'imagic-telegram'

const bot = new Telegram(process.env.BOT_TOKEN, process.env.CHAT_ID)

await bot.sendMessage({ text: 'Deployment complete.' })
```

### Send HTML-formatted message

```js
await bot.sendMessage({
    text: '<b>Alert:</b> CPU usage at <code>95%</code>',
    parse_mode: 'HTML',
})
```

### Send to a different chat (override)

```js
await bot.sendMessage({
    text: 'Private notification',
    chatId: '-100987654321',
})
```

### Send a file from disk

```js
import { createReadStream } from 'node:fs'

await bot.sendFile({
    file: createReadStream('./logs/error.log'),
    caption: 'Error log from today',
})
```

### Send a photo from a Buffer

```js
import { readFileSync } from 'node:fs'

const imageBuffer = readFileSync('./chart.png')
await bot.sendPhoto({ photo: imageBuffer, caption: 'Daily chart' })
```

### Error handling

```js
try {
    await bot.sendMessage({ text: 'Hello' })
} catch (error) {
    console.error('Telegram API error:', error.message)
}
```

## Constraints / Gotchas

- **Constructor does not validate the token.** Errors surface only when a send method is called.
- **`chatId` must be set.** If neither the constructor nor the method call provides a chat ID, the API call will fail.
- **`parse_mode` defaults to `'HTML'`.** If you send user-provided text, escape `<`, `>`, and `&` to avoid formatting errors. For plain text use `parse_mode: 'Markdown'` with no markdown chars, or avoid `parse_mode` by passing an empty-string override (but the default always sends `'HTML'`).
- **File size limits (Telegram):** documents up to 50 MB, photos up to 10 MB.
- **Message text limit:** 4096 characters. Longer text must be split before sending.
- **`sendFile` and `sendPhoto` accept streams or Buffers** — not file paths. Wrap paths with `fs.createReadStream`.
- **Network errors from `imagic-request` propagate as-is** — they are not wrapped. Distinguish transport errors (no `.description`) from API errors (have `.description`).
- **`ok: false` responses throw.** The resolved promise always has `ok: true`; any other outcome rejects.

---

## Knowledge Base

**KB tags for this library:** `imagic-telegram, imagic-request`

Before COMPLEX tasks — invoke `knowledge-reader` with tags above + task-specific tags.
After completing a task — if a reusable pattern, error, or decision emerged, invoke `knowledge-writer` with `source: imagic-telegram`.

See `CLAUDE.md` §Knowledge Base Protocol for the full workflow.
