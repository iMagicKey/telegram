import request from 'imagic-request'

export class Telegram {
    constructor(token, chatId) {
        this.token = token
        this.chatId = chatId
        this.endpoint = `https://api.telegram.org/bot${this.token}`
    }

    async sendMessage({ text, parse_mode = 'HTML', chatId }) {
        const targetChatId = chatId || this.chatId
        const res = await request(`${this.endpoint}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: targetChatId, text, parse_mode }), // Telegram API uses snake_case
        })

        let data
        try {
            data = JSON.parse(res.buffer.toString())
        } catch {
            throw new Error(`Failed to parse Telegram response: ${res.buffer.toString().slice(0, 100)}`)
        }
        if (!data.ok) throw new Error(data.description || 'Telegram API error')
        return data
    }

    async sendFile({ chatId, file, caption = '' }) {
        const targetChatId = chatId || this.chatId
        const res = await request(`${this.endpoint}/sendDocument`, {
            method: 'POST',
            formData: {
                chat_id: targetChatId.toString(),
                caption,
                document: file,
            },
        })

        let data
        try {
            data = JSON.parse(res.buffer.toString())
        } catch {
            throw new Error(`Failed to parse Telegram response: ${res.buffer.toString().slice(0, 100)}`)
        }
        if (!data.ok) throw new Error(data.description || 'Telegram API error')
        return data
    }

    async sendPhoto({ chatId, photo, caption = '' }) {
        const targetChatId = chatId || this.chatId
        const res = await request(`${this.endpoint}/sendPhoto`, {
            method: 'POST',
            formData: {
                chat_id: targetChatId.toString(),
                caption,
                photo,
            },
        })

        let data
        try {
            data = JSON.parse(res.buffer.toString())
        } catch {
            throw new Error(`Failed to parse Telegram response: ${res.buffer.toString().slice(0, 100)}`)
        }
        if (!data.ok) throw new Error(data.description || 'Telegram API error')
        return data
    }
}

export default Telegram
