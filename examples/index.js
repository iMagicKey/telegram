import Telegram from '../src/index.js'

const bot = new Telegram(process.env.TELEGRAM_BOT_TOKEN, process.env.TELEGRAM_CHNNEL_ID)

bot.sendMessage({
    text: '123',
})

