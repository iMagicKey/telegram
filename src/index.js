import request from 'imagic-request'
import { PassThrough, Readable, pipeline } from 'node:stream'

const SEVERITY_EMOJI = { error: '\u{1F534}', warn: '\u{1F7E1}', info: '\u{1F535}' }

export class Telegram {
    constructor(token, chatId) {
        this.token = token
        this.chatId = chatId
        this.endpoint = `https://api.telegram.org/bot${this.token}`
    }

    async _request(method, options) {
        const res = await request(`${this.endpoint}/${method}`, options)

        let data
        try {
            data = JSON.parse(res.buffer.toString())
        } catch {
            throw new Error(`Failed to parse Telegram response: ${res.buffer.toString().slice(0, 100)}`)
        }
        if (!data.ok) throw new Error(data.description || 'Telegram API error')
        return data
    }

    async sendMessage({ text, parse_mode = 'HTML', chatId }) {
        return this._request('sendMessage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId || this.chatId, text, parse_mode }),
        })
    }

    async sendFile({ chatId, file, caption = '', parse_mode = 'HTML' }) {
        return this._request('sendDocument', {
            method: 'POST',
            formData: {
                chat_id: (chatId || this.chatId).toString(),
                caption,
                parse_mode,
                document: file,
            },
        })
    }

    async sendPhoto({ chatId, photo, caption = '', parse_mode = 'HTML' }) {
        return this._request('sendPhoto', {
            method: 'POST',
            formData: {
                chat_id: (chatId || this.chatId).toString(),
                caption,
                parse_mode,
                photo,
            },
        })
    }
}

export class TelegramReporter {
    /**
     * @param {Object} options
     * @param {string} options.token - Telegram bot token
     * @param {string} options.chatId - Default chat/channel ID
     * @param {boolean} [options.enabled=true] - Enable/disable reporting
     * @param {Object} [options.context] - Static context added to every report
     * @param {string} [options.context.server] - Server name
     * @param {string} [options.context.service] - Service name
     * @param {string} [options.context.env] - Environment (dev/live)
     * @param {Object} [options.logger] - Logger instance for internal errors (must have .error())
     */
    constructor({ token, chatId, enabled = true, context = {}, logger = null } = {}) {
        this.bot = token && chatId ? new Telegram(token, chatId) : null
        this.enabled = enabled
        this.context = context
        this.logger = logger
    }

    _formatContextHeader() {
        const { server, service, env } = this.context
        const parts = []
        if (server) parts.push(`[${server}]`)
        if (service) parts.push(`[${service}]`)
        if (env) parts.push(`(${env})`)
        return parts.length > 0 ? parts.join(' ') : ''
    }

    _formatArgs(data) {
        return data
            .map((item) => {
                if (typeof item === 'string') return item
                if (item instanceof Error) return `<b>${item.name}: ${item.message}</b>\n<pre>${this._escapeHtml(item.stack || '')}</pre>`
                if (typeof item === 'object' && item !== null) return `<pre>${this._escapeHtml(JSON.stringify(item, null, 2))}</pre>`
                return String(item)
            })
            .join('\n')
    }

    _escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }

    _buildMessage(severity, data) {
        const emoji = SEVERITY_EMOJI[severity] || ''
        const header = this._formatContextHeader()
        const title = `${emoji} ${severity.toUpperCase()}${header ? ` ${header}` : ''}`
        const body = this._formatArgs(data)
        return `${title}\n${body}`
    }

    _toStream(content) {
        if (content && typeof content.pipe === 'function') return content
        if (Buffer.isBuffer(content)) return Readable.from([content])
        if (typeof content === 'string') return Readable.from([Buffer.from(content, 'utf-8')])
        return Readable.from([Buffer.from(String(content), 'utf-8')])
    }

    /**
     * The stream to upload, with `name` as its file name. imagic-request reads the name from `.path`, but a caller's
     * stream must not be touched: an fs.ReadStream that has not opened yet would read whichever file `.path` then names.
     */
    _toUpload(content, name) {
        let stream
        if (typeof content?.pipe === 'function') {
            if (content.destroyed || content.readable === false) throw new Error('Attachment stream has already been consumed or destroyed')
            stream = new PassThrough()
            pipeline(content, stream, () => {})
        } else {
            stream = this._toStream(content)
        }
        if (name) stream.path = name
        return stream
    }

    _extractAttachments(data) {
        if (data.length === 0) return { args: data, attach: null }
        const last = data[data.length - 1]
        if (last && typeof last === 'object' && !(last instanceof Error) && (last.file || last.photo)) {
            return { args: data.slice(0, -1), attach: last }
        }
        return { args: data, attach: null }
    }

    _send(severity, data) {
        if (!this.enabled || !this.bot) return

        try {
            const { args, attach } = this._extractAttachments(data)
            const text = this._buildMessage(severity, args)

            const onError = (err) => {
                if (this.logger) this.logger.error('Failed to send telegram report:', err.message)
            }

            if (attach?.photo) {
                const stream = this._toUpload(attach.photo, typeof attach.photo.path === 'string' ? attach.photo.path : undefined)
                this.bot.sendPhoto({ photo: stream, caption: text.slice(0, 1024) }).catch(onError)
            } else if (attach?.file) {
                const stream = this._toUpload(attach.file, attach.fileName || (typeof attach.file.path === 'string' ? attach.file.path : 'report.txt'))
                this.bot.sendFile({ file: stream, caption: text.slice(0, 1024) }).catch(onError)
            } else {
                this.bot.sendMessage({ text }).catch(onError)
            }
        } catch (err) {
            if (this.logger) this.logger.error('Error formatting telegram report:', err.message)
        }
    }

    report(...data) {
        this._send('error', data)
    }

    error(...data) {
        this._send('error', data)
    }

    warn(...data) {
        this._send('warn', data)
    }

    info(...data) {
        this._send('info', data)
    }
}

export default Telegram
