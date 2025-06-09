/* eslint-disable camelcase */
import request from 'imagic-request'

export default class Telegram {
    constructor(token, chatId) {
        this.token = token
        this.chatId = chatId
        this.endpoint = `https://api.telegram.org/bot${this.token}`
    }

    async sendMessage({ text, parse_mode = 'HTML' }) {
        const res = await request(`${this.endpoint}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: this.chatId, text, parse_mode }),
        })

        return JSON.parse(res.buffer.toString())
    }

    // async sendFile({ chat_id, file, filename = 'file.txt', caption = '' }) {
    //     const form = new FormData()
    //     form.append('chat_id', chat_id)
    //     form.append('caption', caption)
    //     form.append('document', file, filename)

    //     const res = await request(`${this.endpoint}/sendDocument`, {
    //         method: 'POST',
    //         body: form,
    //     })

    //     const data = await res.json()
    //     return data
    // }
}
