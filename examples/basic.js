// examples/basic.js
// Replace BOT_TOKEN and CHAT_ID with your actual values, or set them as environment variables
import Telegram from '../src/index.js'

const bot = new Telegram(process.env.BOT_TOKEN || 'YOUR_TOKEN', process.env.CHAT_ID || 'YOUR_CHAT_ID')

bot.sendMessage({ text: '<b>Hello</b> from imagic-telegram!' })
    .then((result) => {
        console.log('Message sent:', result.result.message_id)
    })
    .catch((err) => {
        console.error('Error:', err.message)
    })
