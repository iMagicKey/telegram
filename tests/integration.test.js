import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { Readable } from 'node:stream'
import { Telegram, TelegramReporter } from '../src/index.js'

// Telegram over the real imagic-request code, against local fake servers. The real API is never contacted.
const TOKEN = 'SYNTHETIC-TOKEN-7f3a:AbCdEf'
const ALL_BYTES = Buffer.from(Array.from({ length: 256 }, (_v, i) => i))
const LIMIT = { timeout: 10000 }
const OK = JSON.stringify({ ok: true, result: { message_id: 1 } })

async function startFakeApi(handler) {
    const requests = []
    const server = http.createServer((req, res) => {
        const chunks = []
        req.on('data', (chunk) => chunks.push(chunk))
        req.on('end', () => {
            const record = { method: req.method, url: req.url, headers: req.headers, rawHeaders: req.rawHeaders, body: Buffer.concat(chunks) }
            requests.push(record)
            handler(req, res, record)
        })
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    return {
        requests,
        url: `http://127.0.0.1:${server.address().port}`,
        close() {
            server.closeAllConnections()
            return new Promise((resolve) => server.close(resolve))
        },
    }
}

/** TelegramReporter returns nothing awaitable, so wait for the request to arrive, within a limit. */
async function firstRequest(fakeApi, limitMs = 5000) {
    const started = Date.now()
    while (fakeApi.requests.length === 0) {
        assert.ok(Date.now() - started < limitMs, `no request arrived within ${limitMs} ms`)
        await new Promise((resolve) => setTimeout(resolve, 10))
    }
}

function replyOk(res) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(OK)
}

/** Split multipart bytes on the declared boundary, leaving part bodies undecoded. */
function parseParts(record) {
    const boundary = /boundary=(.+)$/.exec(record.headers['content-type'])[1]
    const delimiter = Buffer.from(`\r\n--${boundary}`)
    const body = Buffer.concat([Buffer.from('\r\n'), record.body])
    const parts = {}
    let cursor = delimiter.length
    while (body.subarray(cursor, cursor + 2).toString() !== '--') {
        const next = body.indexOf(delimiter, cursor)
        assert.notEqual(next, -1, 'part must be terminated by a delimiter')
        const part = body.subarray(cursor + 2, next)
        const headerEnd = part.indexOf('\r\n\r\n')
        const disposition = part.subarray(0, headerEnd).toString('latin1')
        parts[/name="([^"]*)"/.exec(disposition)[1]] = { disposition, body: part.subarray(headerEnd + 4) }
        cursor = next + delimiter.length
    }
    return parts
}

function assertNoToken(record) {
    const seen = [record.url, JSON.stringify(record.rawHeaders), record.body.toString('latin1')].join('\n')
    assert.equal(seen.includes(TOKEN), false, `the token reached a second origin: ${seen}`)
    assert.equal(seen.includes(TOKEN.split(':')[1]), false, `part of the token reached a second origin: ${seen}`)
}

describe('Telegram over imagic-request', () => {
    let api
    let other
    let bot

    before(async () => {
        other = await startFakeApi((_req, res) => replyOk(res))
        api = await startFakeApi((req, res) => {
            const match = /[?&]redirect=(\d+)/.exec(req.url)
            if (match) {
                res.writeHead(Number(match[1]), { Location: `${other.url}/moved` })
                res.end()
                return
            }
            replyOk(res)
        })
        bot = new Telegram(TOKEN, 42)
        bot.endpoint = `${api.url}/bot${TOKEN}`
    })

    after(async () => {
        await Promise.all([api.close(), other.close()])
    })

    const reset = () => {
        api.requests.length = 0
        other.requests.length = 0
    }

    function redirectingBot(status) {
        const instance = new Telegram(TOKEN, 42)
        // Telegram appends "/<method>", so the marker reaches the fake server as part of the path.
        instance._request = function send(method, options) {
            return Telegram.prototype._request.call({ endpoint: `${api.url}/bot${TOKEN}` }, `${method}?redirect=${status}`, options)
        }
        return instance
    }

    it('sendMessage posts JSON to the token URL and returns the API result', LIMIT, async () => {
        reset()
        const result = await bot.sendMessage({ text: 'héllo <b>world</b>' })
        assert.equal(result.ok, true)
        const [record] = api.requests
        assert.equal(record.method, 'POST')
        assert.equal(record.url, `/bot${TOKEN}/sendMessage`)
        assert.equal(record.headers['content-type'], 'application/json')
        assert.deepEqual(JSON.parse(record.body.toString()), { chat_id: 42, text: 'héllo <b>world</b>', parse_mode: 'HTML' })
    })

    it('sendFile with a Buffer delivers it byte-identical', LIMIT, async () => {
        reset()
        const file = Buffer.concat([ALL_BYTES, Buffer.from('\r\n--'), ALL_BYTES])
        await bot.sendFile({ file, caption: 'report' })
        const [record] = api.requests
        assert.equal(record.url, `/bot${TOKEN}/sendDocument`)
        const parts = parseParts(record)
        assert.deepEqual(parts.document.body, file)
        assert.equal(parts.chat_id.body.toString(), '42')
        assert.equal(parts.caption.body.toString(), 'report')
        assert.equal(parts.parse_mode.body.toString(), 'HTML')
    })

    it('sendPhoto with a Buffer delivers it byte-identical', LIMIT, async () => {
        reset()
        await bot.sendPhoto({ photo: ALL_BYTES })
        assert.deepEqual(parseParts(api.requests[0]).photo.body, ALL_BYTES)
    })

    // TG-03 remains: imagic-request documents Buffers as plain fields, so these arrive without a filename.
    // From the Bot API documentation, an upload needs a file part; this could not be checked against the real API.
    it('sendFile with a Buffer sends a file part', { ...LIMIT, todo: 'TG-03: wrap Buffers in a stream in sendFile and sendPhoto' }, async () => {
        reset()
        await bot.sendFile({ file: ALL_BYTES })
        assert.match(parseParts(api.requests[0]).document.disposition, /filename="/)
    })

    it('sendFile with a stream sends a byte-identical file part', LIMIT, async () => {
        reset()
        await bot.sendFile({ file: Readable.from([ALL_BYTES]) })
        const { document } = parseParts(api.requests[0])
        assert.match(document.disposition, /filename="/)
        assert.deepEqual(document.body, ALL_BYTES)
    })

    it('TelegramReporter delivers a Buffer attachment as a byte-identical file part', LIMIT, async () => {
        reset()
        const errors = []
        const reporter = new TelegramReporter({ token: TOKEN, chatId: 42, logger: { error: (...args) => errors.push(args) } })
        reporter.bot.endpoint = `${api.url}/bot${TOKEN}`
        reporter.error('dump attached', { file: ALL_BYTES, fileName: 'dump.bin' })
        await firstRequest(api)
        const { document } = parseParts(api.requests[0])
        assert.match(document.disposition, /filename="dump\.bin"/)
        assert.deepEqual(document.body, ALL_BYTES)
        assert.deepEqual(errors, [])
    })

    it('a file name carrying quotes and line breaks cannot add multipart headers', LIMIT, async () => {
        reset()
        const reporter = new TelegramReporter({ token: TOKEN, chatId: 42 })
        reporter.bot.endpoint = `${api.url}/bot${TOKEN}`
        reporter.error('dump attached', { file: ALL_BYTES, fileName: 'a"; name="chat_id"\r\nX-Injected: yes\r\n\r\nb.bin' })
        await firstRequest(api)
        const parts = parseParts(api.requests[0])
        assert.equal(parts.document.disposition.includes('X-Injected: yes\r\n'), false)
        assert.equal(parts.chat_id.body.toString(), '42')
        assert.deepEqual(parts.document.body, ALL_BYTES)
    })

    for (const status of [301, 302, 303, 307, 308]) {
        it(`a ${status} from the token URL leaks nothing sensitive to a second origin`, LIMIT, async () => {
            reset()
            const result = await redirectingBot(status).sendMessage({ text: 'hello' })
            assert.equal(result.ok, true, 'the second origin answered')
            assert.equal(api.requests[0].url.startsWith(`/bot${TOKEN}/sendMessage`), true, 'control: first origin sees the token')
            assert.equal(other.requests.length, 1)
            assert.equal(other.requests[0].url, '/moved')
            assertNoToken(other.requests[0])
        })
    }

    it('a 307 on an upload fails clearly instead of leaving the second origin an empty request', LIMIT, async () => {
        reset()
        await assert.rejects(redirectingBot(307).sendFile({ file: Readable.from([ALL_BYTES]) }), (err) => {
            assert.match(err.message, /Cannot follow 307 redirect/)
            assert.equal(err.message.includes(TOKEN), false)
            return true
        })
        assert.equal(other.requests.length, 0)
    })

    it('a 302 on an upload leaks nothing to the second origin', LIMIT, async () => {
        reset()
        await redirectingBot(302).sendFile({ file: ALL_BYTES, caption: 'secret-caption' })
        assert.equal(other.requests[0].method, 'GET')
        assert.equal(other.requests[0].body.length, 0)
        assertNoToken(other.requests[0])
        assert.equal(other.requests[0].headers['content-type'], undefined)
    })
})
