# imagic-telegram

> Send Telegram messages, files, and photos via the Bot API.

## Install

```bash
npm install imagic-telegram
```

## Quick Start

```js
import { Telegram } from 'imagic-telegram'

const bot = new Telegram('your-bot-token', 'your-chat-id')

await bot.sendMessage({ text: 'Hello from Node.js!' })
```

## API

### `new Telegram(token, chatId)`

Creates a bot client bound to a default chat.

```ts
new Telegram(
    token: string,    // Telegram bot token from @BotFather
    chatId: string | number  // default target chat ID for all methods
)
```

All send methods accept an optional `chatId` parameter to override the default for a single call.

---

### `sendMessage(options): Promise<TelegramResponse>`

Sends a text message via `/sendMessage`.

```ts
sendMessage(options: {
    text: string
    parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2'
    chatId?: string | number
}): Promise<TelegramResponse>
```

| Option | Type | Default | Description |
|---|---|---|---|
| `text` | `string` | required | Message text |
| `parse_mode` | `string` | `'HTML'` | Telegram parse mode for formatting |
| `chatId` | `string \| number` | instance default | Override recipient for this call |

**Returns:** `TelegramResponse`

**Throws:** `Error` with the Telegram API error description if `ok: false`.

**HTML formatting example:**
```js
await bot.sendMessage({
    text: '<b>Bold</b> and <i>italic</i> and <code>code</code>',
    parse_mode: 'HTML',
})
```

---

### `sendFile(options): Promise<TelegramResponse>`

Sends a file as a document via `/sendDocument`.

```ts
sendFile(options: {
    file: ReadableStream | Buffer
    caption?: string
    chatId?: string | number
}): Promise<TelegramResponse>
```

| Option | Type | Default | Description |
|---|---|---|---|
| `file` | `ReadableStream \| Buffer` | required | File content — use `fs.createReadStream(path)` for files on disk |
| `caption` | `string` | `''` | Optional document caption |
| `chatId` | `string \| number` | instance default | Override recipient for this call |

**Throws:** `Error` on Telegram API error.

```js
import { createReadStream } from 'node:fs'

await bot.sendFile({
    file: createReadStream('./report.pdf'),
    caption: 'Monthly report',
})
```

---

### `sendPhoto(options): Promise<TelegramResponse>`

Sends an image via `/sendPhoto`.

```ts
sendPhoto(options: {
    photo: ReadableStream | Buffer
    caption?: string
    chatId?: string | number
}): Promise<TelegramResponse>
```

| Option | Type | Default | Description |
|---|---|---|---|
| `photo` | `ReadableStream \| Buffer` | required | Image content |
| `caption` | `string` | `''` | Optional image caption |
| `chatId` | `string \| number` | instance default | Override recipient for this call |

**Throws:** `Error` on Telegram API error.

```js
import { createReadStream } from 'node:fs'

await bot.sendPhoto({
    photo: createReadStream('./screenshot.png'),
    caption: 'App screenshot',
})
```

---

### `TelegramResponse`

The resolved value of all send methods:

```ts
type TelegramResponse = {
    ok: true
    result: {
        message_id: number
        // ...other Telegram message fields
    }
}
```

## Error Handling

All methods throw a native `Error` when the Telegram API returns `ok: false`. The error message is the description string from the Telegram response body.

```js
try {
    await bot.sendMessage({ text: 'Hello' })
} catch (error) {
    // error.message === Telegram API error description
    console.error('Telegram error:', error.message)
}
```

Common causes:
- Invalid or expired bot token
- Chat ID does not exist or bot is not a member
- Message text is empty or too long (max 4096 characters)
- File exceeds Telegram size limits (documents: 50 MB, photos: 10 MB)

## Examples

See [`examples/`](./examples/) for runnable scripts.

## License

MIT
