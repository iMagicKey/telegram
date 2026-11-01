import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import util from 'node:util'
import { Telegram, TelegramReporter } from '../src/index.js'
import { startFakeApi } from './support/harness.js'

const TOKEN = '123456:SYNTHETICTOKENabcdefghijklmnopqrstuv'
const LIMIT = { timeout: 10000 }
const FRAGMENTS = ['SYNTHETICTOKEN', 'abcdefghijklmnopqrstuv', '123456:SYN', '123456%3A']

function assertNoToken(text, label) {
    for (const fragment of FRAGMENTS) assert.equal(String(text).includes(fragment), false, `${label} contains ${fragment}: ${text}`)
}

function assertCleanError(err) {
    assertNoToken(err.message, 'message')
    assertNoToken(err.stack, 'stack')
    assertNoToken(util.inspect(err, { depth: 10, showHidden: true }), 'inspect')
    assertNoToken(JSON.stringify(err), 'JSON')
    if (err.buffer) assertNoToken(err.buffer.toString('latin1'), 'err.buffer')
}

describe('the bot token stays out of errors derived from a response', () => {
    let api
    let respond

    before(async () => {
        api = await startFakeApi((req, res) => respond(req, res))
    })

    after(() => api.close())

    const botAt = () => {
        const bot = new Telegram(TOKEN, 42)
        bot.endpoint = `${api.url}/bot${TOKEN}`
        return bot
    }

    const failure = async () => {
        let caught
        await botAt()
            .sendMessage({ text: 'hi' })
            .catch((err) => {
                caught = err
            })
        assert.ok(caught instanceof Error, 'expected a rejection')
        return caught
    }

    it('parse failure: a proxy echoing the request path', LIMIT, async () => {
        respond = (req, res) => res.end(`Not Found: ${req.url}`)
        const err = await failure()
        assert.match(err.message, /^Failed to parse Telegram response: Not Found: \/bot\[REDACTED\]\/sendMessage/)
        assertCleanError(err)
    })

    it('parse failure: a token cut in half by the 100 character limit', LIMIT, async () => {
        respond = (req, res) => res.end(`${'x'.repeat(80)}${req.url}`)
        assertCleanError(await failure())
    })

    it('parse failure: a percent-encoded echo', LIMIT, async () => {
        respond = (req, res) => res.end(`Not Found: ${encodeURIComponent(req.url)}`)
        assertCleanError(await failure())
    })

    it('description: an echoed request path', LIMIT, async () => {
        respond = (req, res) => res.end(JSON.stringify({ ok: false, description: `bad path ${req.url}` }))
        const err = await failure()
        assert.equal(err.message, 'bad path /bot[REDACTED]/sendMessage')
        assertCleanError(err)
    })

    it('description: a percent-encoded echo', LIMIT, async () => {
        respond = (req, res) => res.end(JSON.stringify({ ok: false, description: encodeURIComponent(req.url) }))
        assertCleanError(await failure())
    })

    it('network failure: partial body held on err.buffer', LIMIT, async () => {
        respond = (req, res) => {
            res.writeHead(200)
            res.write(`partial ${req.url}`, () => setImmediate(() => res.socket.destroy()))
        }
        const err = await failure()
        assert.ok(Buffer.isBuffer(err.buffer), 'imagic-request documents err.buffer')
        assertCleanError(err)
    })

    it('reaches TelegramReporter loggers redacted', LIMIT, async () => {
        respond = (req, res) => res.end(`Not Found: ${req.url}`)
        const logged = []
        const reporter = new TelegramReporter({ token: TOKEN, chatId: 1, logger: { error: (...args) => logged.push(args.join(' ')) } })
        reporter.bot.endpoint = `${api.url}/bot${TOKEN}`
        reporter.error('something')
        const started = Date.now()
        while (logged.length === 0) {
            assert.ok(Date.now() - started < 5000, 'nothing was logged')
            await new Promise((resolve) => setTimeout(resolve, 10))
        }
        assert.match(logged[0], /\[REDACTED\]/)
        assertNoToken(logged.join('\n'), 'logger output')
    })

    describe('other error text is unchanged', () => {
        it('an ordinary description', LIMIT, async () => {
            respond = (_req, res) => res.end('{"ok":false,"description":"Bad Request: chat not found"}')
            assert.equal((await failure()).message, 'Bad Request: chat not found')
        })

        it('a missing description', LIMIT, async () => {
            respond = (_req, res) => res.end('{"ok":false}')
            assert.equal((await failure()).message, 'Telegram API error')
        })

        it('an ordinary parse failure', LIMIT, async () => {
            respond = (_req, res) => res.end('<html>nope</html>')
            assert.equal((await failure()).message, 'Failed to parse Telegram response: <html>nope</html>')
        })

        it('a bot with no token', LIMIT, async () => {
            respond = (_req, res) => res.end('{"ok":false,"description":"Unauthorized"}')
            const bot = new Telegram(undefined, 42)
            bot.endpoint = api.url
            await assert.rejects(bot.sendMessage({ text: 'hi' }), /^Error: Unauthorized$/)
        })

        it('a successful response is returned as it arrived', LIMIT, async () => {
            respond = (_req, res) => res.end('{"ok":true,"result":{"message_id":7}}')
            assert.equal((await botAt().sendMessage({ text: 'hi' })).result.message_id, 7)
        })
    })
})
