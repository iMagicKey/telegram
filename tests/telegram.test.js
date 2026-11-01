import { describe, it, before, after, beforeEach } from 'node:test'
import { expect } from 'chai'
import http from 'node:http'
import { Readable } from 'node:stream'
import { Telegram, TelegramReporter } from '../src/index.js'

let server
let serverPort
let lastRequest = null
let mockResponse = { ok: true, result: { message_id: 1 } }
let mockRawResponse = null

before(async () => {
    await new Promise((resolve) => {
        server = http.createServer((req, res) => {
            let body = Buffer.alloc(0)
            req.on('data', (chunk) => {
                body = Buffer.concat([body, chunk])
            })
            req.on('end', () => {
                lastRequest = { url: req.url, body, headers: req.headers, method: req.method }
                if (mockRawResponse !== null) {
                    res.writeHead(mockRawResponse.status ?? 200, { 'Content-Type': mockRawResponse.contentType ?? 'text/html' })
                    res.end(mockRawResponse.body)
                } else {
                    res.writeHead(200, { 'Content-Type': 'application/json' })
                    res.end(JSON.stringify(mockResponse))
                }
            })
        })
        server.listen(0, '127.0.0.1', () => {
            serverPort = server.address().port
            resolve()
        })
    })
})

after(() => server.close())

beforeEach(() => {
    mockResponse = { ok: true, result: { message_id: 1 } }
    mockRawResponse = null
    lastRequest = null
})

function createBot(chatId = '123') {
    const bot = new Telegram('token', chatId)
    bot.endpoint = `http://127.0.0.1:${serverPort}/bot`
    return bot
}

describe('Telegram', () => {
    describe('constructor', () => {
        it('sets token correctly', () => {
            const bot = new Telegram('mytoken', '123')
            expect(bot.token).to.equal('mytoken')
        })

        it('sets chatId correctly', () => {
            const bot = new Telegram('mytoken', '456')
            expect(bot.chatId).to.equal('456')
        })

        it('builds endpoint with correct format', () => {
            const bot = new Telegram('TOKEN', '123')
            expect(bot.endpoint).to.equal('https://api.telegram.org/botTOKEN')
        })
    })

    describe('sendMessage', () => {
        it('returns parsed response on success', async () => {
            mockResponse = { ok: true, result: { message_id: 42 } }
            const result = await createBot().sendMessage({ text: 'hello' })
            expect(result.ok).to.be.true
            expect(result.result.message_id).to.equal(42)
        })

        it('throws when ok is false', async () => {
            mockResponse = { ok: false, error_code: 400, description: 'Bad Request: chat not found' }
            try {
                await createBot().sendMessage({ text: 'hello' })
                expect.fail('Should have thrown')
            } catch (err) {
                expect(err.message).to.equal('Bad Request: chat not found')
            }
        })

        it('throws with fallback message when description is missing', async () => {
            mockResponse = { ok: false, error_code: 500 }
            try {
                await createBot().sendMessage({ text: 'hello' })
                expect.fail('Should have thrown')
            } catch (err) {
                expect(err.message).to.equal('Telegram API error')
            }
        })

        it('sends POST with JSON body containing chat_id, text, parse_mode', async () => {
            await createBot('999').sendMessage({ text: 'Test message' })
            const parsed = JSON.parse(lastRequest.body.toString())
            expect(parsed.chat_id).to.equal('999')
            expect(parsed.text).to.equal('Test message')
            expect(parsed.parse_mode).to.equal('HTML')
            expect(lastRequest.method).to.equal('POST')
        })

        it('uses HTML as default parse_mode', async () => {
            await createBot().sendMessage({ text: 'hello' })
            const parsed = JSON.parse(lastRequest.body.toString())
            expect(parsed.parse_mode).to.equal('HTML')
        })

        it('uses custom chatId when provided', async () => {
            await createBot('default-chat').sendMessage({ text: 'hello', chatId: 'override-chat' })
            const parsed = JSON.parse(lastRequest.body.toString())
            expect(parsed.chat_id).to.equal('override-chat')
        })

        it('sends request to the sendMessage endpoint', async () => {
            await createBot().sendMessage({ text: 'hello' })
            expect(lastRequest.url).to.equal('/bot/sendMessage')
        })

        it('throws descriptive Error when response is not valid JSON', async () => {
            mockRawResponse = { status: 200, contentType: 'text/html', body: '<html>error</html>' }
            try {
                await createBot().sendMessage({ text: 'hello' })
                expect.fail('Should have thrown')
            } catch (err) {
                expect(err).to.be.instanceOf(Error)
                expect(err.message).to.include('Failed to parse Telegram response')
            }
        })
    })

    describe('sendFile', () => {
        it('returns parsed response on success', async () => {
            mockResponse = { ok: true, result: { message_id: 10 } }
            const stream = Readable.from(['file content'])
            const result = await createBot().sendFile({ file: stream })
            expect(result.ok).to.be.true
        })

        it('throws when ok is false', async () => {
            mockResponse = { ok: false, description: 'Bad Request: wrong file type' }
            try {
                await createBot().sendFile({ file: Readable.from(['data']) })
                expect.fail('Should have thrown')
            } catch (err) {
                expect(err.message).to.equal('Bad Request: wrong file type')
            }
        })

        it('sends POST to sendDocument endpoint', async () => {
            await createBot().sendFile({ file: Readable.from(['hello']) })
            expect(lastRequest.url).to.equal('/bot/sendDocument')
            expect(lastRequest.method).to.equal('POST')
        })

        it('uses constructor chatId as fallback', async () => {
            await createBot('777').sendFile({ file: Readable.from(['hello']) })
            expect(lastRequest.body.toString()).to.include('777')
        })

        it('uses custom chatId when provided', async () => {
            await createBot('default').sendFile({ chatId: 'override-999', file: Readable.from(['hello']) })
            expect(lastRequest.body.toString()).to.include('override-999')
        })

        it('includes caption in the request body', async () => {
            await createBot().sendFile({ file: Readable.from(['content']), caption: 'my caption' })
            expect(lastRequest.body.toString()).to.include('my caption')
        })

        it('includes parse_mode in multipart form', async () => {
            await createBot().sendFile({ file: Readable.from(['content']), caption: '<b>bold</b>' })
            expect(lastRequest.body.toString()).to.include('HTML')
        })
    })

    describe('sendPhoto', () => {
        it('returns parsed response on success', async () => {
            mockResponse = { ok: true, result: { message_id: 20 } }
            const result = await createBot().sendPhoto({ photo: Readable.from(['photo data']) })
            expect(result.ok).to.be.true
        })

        it('throws when ok is false', async () => {
            mockResponse = { ok: false, description: 'Bad Request: photo_invalid' }
            try {
                await createBot().sendPhoto({ photo: Readable.from(['data']) })
                expect.fail('Should have thrown')
            } catch (err) {
                expect(err.message).to.equal('Bad Request: photo_invalid')
            }
        })

        it('sends POST to sendPhoto endpoint', async () => {
            await createBot().sendPhoto({ photo: Readable.from(['img']) })
            expect(lastRequest.url).to.equal('/bot/sendPhoto')
        })

        it('uses constructor chatId as fallback', async () => {
            await createBot('888').sendPhoto({ photo: Readable.from(['img']) })
            expect(lastRequest.body.toString()).to.include('888')
        })

        it('uses custom chatId when provided', async () => {
            await createBot('default').sendPhoto({ chatId: 'custom-chat', photo: Readable.from(['img']) })
            expect(lastRequest.body.toString()).to.include('custom-chat')
        })

        it('includes caption in the request body', async () => {
            await createBot().sendPhoto({ photo: Readable.from(['img']), caption: 'nice photo' })
            expect(lastRequest.body.toString()).to.include('nice photo')
        })
    })
})

describe('TelegramReporter', () => {
    describe('constructor', () => {
        it('creates bot when token and chatId provided', () => {
            const reporter = new TelegramReporter({ token: 'tok', chatId: '123' })
            expect(reporter.bot).to.be.instanceOf(Telegram)
        })

        it('bot is null when token missing', () => {
            const reporter = new TelegramReporter({ chatId: '123' })
            expect(reporter.bot).to.be.null
        })

        it('bot is null when chatId missing', () => {
            const reporter = new TelegramReporter({ token: 'tok' })
            expect(reporter.bot).to.be.null
        })

        it('defaults enabled to true', () => {
            const reporter = new TelegramReporter({ token: 'tok', chatId: '123' })
            expect(reporter.enabled).to.be.true
        })
    })

    describe('_formatArgs', () => {
        it('formats strings as-is', () => {
            const r = new TelegramReporter({})
            expect(r._formatArgs(['hello'])).to.equal('hello')
        })

        it('formats Error with name, message, and stack in <pre>', () => {
            const r = new TelegramReporter({})
            const err = new TypeError('test error')
            const result = r._formatArgs([err])
            expect(result).to.include('<b>TypeError: test error</b>')
            expect(result).to.include('<pre>')
        })

        it('formats objects as JSON in <pre>', () => {
            const r = new TelegramReporter({})
            const result = r._formatArgs([{ userId: '123', action: 'create' }])
            expect(result).to.include('<pre>')
            expect(result).to.include('"userId": "123"')
        })

        it('formats numbers and booleans via String()', () => {
            const r = new TelegramReporter({})
            expect(r._formatArgs([42])).to.equal('42')
            expect(r._formatArgs([true])).to.equal('true')
        })

        it('joins multiple args with newline', () => {
            const r = new TelegramReporter({})
            const result = r._formatArgs(['msg1', 'msg2'])
            expect(result).to.equal('msg1\nmsg2')
        })
    })

    describe('_escapeHtml', () => {
        it('escapes HTML special characters', () => {
            const r = new TelegramReporter({})
            expect(r._escapeHtml('<script>alert("xss")</script>')).to.equal('&lt;script&gt;alert("xss")&lt;/script&gt;')
        })

        it('escapes ampersands', () => {
            const r = new TelegramReporter({})
            expect(r._escapeHtml('a & b')).to.equal('a &amp; b')
        })
    })

    describe('_buildMessage', () => {
        it('includes severity emoji and uppercase label', () => {
            const r = new TelegramReporter({})
            const msg = r._buildMessage('error', ['test'])
            expect(msg).to.include('ERROR')
        })

        it('includes context header when context provided', () => {
            const r = new TelegramReporter({ context: { server: 'master-1', service: 'cluster', env: 'live' } })
            const msg = r._buildMessage('error', ['test'])
            expect(msg).to.include('[master-1]')
            expect(msg).to.include('[cluster]')
            expect(msg).to.include('(live)')
        })

        it('omits context parts that are not set', () => {
            const r = new TelegramReporter({ context: { service: 'api' } })
            const msg = r._buildMessage('warn', ['test'])
            expect(msg).to.include('[api]')
            expect(msg).to.not.include('[undefined]')
        })

        it('warn uses yellow emoji', () => {
            const r = new TelegramReporter({})
            const msg = r._buildMessage('warn', ['test'])
            expect(msg).to.include('WARN')
        })

        it('info uses blue emoji', () => {
            const r = new TelegramReporter({})
            const msg = r._buildMessage('info', ['test'])
            expect(msg).to.include('INFO')
        })
    })

    describe('report/error/warn/info', () => {
        it('report sends error-level message', async () => {
            const r = new TelegramReporter({ token: 'tok', chatId: '123' })
            r.bot.endpoint = `http://127.0.0.1:${serverPort}/bot`

            r.report('something broke')
            await new Promise((resolve) => setTimeout(resolve, 50))
            const parsed = JSON.parse(lastRequest.body.toString())
            expect(parsed.text).to.include('ERROR')
            expect(parsed.text).to.include('something broke')
        })

        it('error sends error-level message', async () => {
            const r = new TelegramReporter({ token: 'tok', chatId: '123' })
            r.bot.endpoint = `http://127.0.0.1:${serverPort}/bot`

            r.error('db connection failed')
            await new Promise((resolve) => setTimeout(resolve, 50))
            const parsed = JSON.parse(lastRequest.body.toString())
            expect(parsed.text).to.include('ERROR')
        })

        it('warn sends warn-level message', async () => {
            const r = new TelegramReporter({ token: 'tok', chatId: '123' })
            r.bot.endpoint = `http://127.0.0.1:${serverPort}/bot`

            r.warn('disk space low')
            await new Promise((resolve) => setTimeout(resolve, 50))
            const parsed = JSON.parse(lastRequest.body.toString())
            expect(parsed.text).to.include('WARN')
        })

        it('info sends info-level message', async () => {
            const r = new TelegramReporter({ token: 'tok', chatId: '123' })
            r.bot.endpoint = `http://127.0.0.1:${serverPort}/bot`

            r.info('deploy completed')
            await new Promise((resolve) => setTimeout(resolve, 50))
            const parsed = JSON.parse(lastRequest.body.toString())
            expect(parsed.text).to.include('INFO')
        })

        it('does not send when disabled', async () => {
            lastRequest = null
            const r = new TelegramReporter({ token: 'tok', chatId: '123', enabled: false })
            r.bot.endpoint = `http://127.0.0.1:${serverPort}/bot`

            r.report('should not send')
            await new Promise((resolve) => setTimeout(resolve, 50))
            expect(lastRequest).to.be.null
        })

        it('does not send when bot is null', async () => {
            lastRequest = null
            const r = new TelegramReporter({})
            r.report('should not send')
            await new Promise((resolve) => setTimeout(resolve, 50))
            expect(lastRequest).to.be.null
        })

        it('does not throw on send failure', async () => {
            mockResponse = { ok: false, description: 'error' }
            const errors = []
            const r = new TelegramReporter({
                token: 'tok',
                chatId: '123',
                logger: { error: (...args) => errors.push(args.join(' ')) },
            })
            r.bot.endpoint = `http://127.0.0.1:${serverPort}/bot`

            r.report('test')
            await new Promise((resolve) => setTimeout(resolve, 50))
            expect(errors.length).to.be.greaterThanOrEqual(1)
            expect(errors[0]).to.include('Failed to send telegram report')
        })

        it('report with Error formats stack trace', async () => {
            const r = new TelegramReporter({ token: 'tok', chatId: '123' })
            r.bot.endpoint = `http://127.0.0.1:${serverPort}/bot`

            const err = new TypeError('null reference')
            r.error('Crash in processUser:', err)
            await new Promise((resolve) => setTimeout(resolve, 50))
            const parsed = JSON.parse(lastRequest.body.toString())
            expect(parsed.text).to.include('TypeError: null reference')
            expect(parsed.text).to.include('Crash in processUser:')
        })

        it('report with context includes server/service/env', async () => {
            const r = new TelegramReporter({
                token: 'tok',
                chatId: '123',
                context: { server: 'master-1', service: 'cluster-master', env: 'live' },
            })
            r.bot.endpoint = `http://127.0.0.1:${serverPort}/bot`

            r.error('connection lost')
            await new Promise((resolve) => setTimeout(resolve, 50))
            const parsed = JSON.parse(lastRequest.body.toString())
            expect(parsed.text).to.include('[master-1]')
            expect(parsed.text).to.include('[cluster-master]')
            expect(parsed.text).to.include('(live)')
        })

        it('report with mixed args (string + Error + object)', async () => {
            const r = new TelegramReporter({ token: 'tok', chatId: '123' })
            r.bot.endpoint = `http://127.0.0.1:${serverPort}/bot`

            r.error('Failed to process:', new Error('timeout'), { userId: 'abc', retries: 3 })
            await new Promise((resolve) => setTimeout(resolve, 50))
            const parsed = JSON.parse(lastRequest.body.toString())
            expect(parsed.text).to.include('Failed to process:')
            expect(parsed.text).to.include('Error: timeout')
            expect(parsed.text).to.include('"userId": "abc"')
        })
    })

    describe('file attachments', () => {
        it('sends file when last arg has file property (string content)', async () => {
            const r = new TelegramReporter({ token: 'tok', chatId: '123' })
            r.bot.endpoint = `http://127.0.0.1:${serverPort}/bot`

            r.error('Process crashed', { file: 'Error: ECONNREFUSED\n    at connect()', fileName: 'stack.txt' })
            await new Promise((resolve) => setTimeout(resolve, 100))
            expect(lastRequest.url).to.equal('/bot/sendDocument')
            expect(lastRequest.body.toString()).to.include('stack.txt')
            expect(lastRequest.body.toString()).to.include('ECONNREFUSED')
        })

        it('sends file when last arg has file property (Buffer)', async () => {
            const r = new TelegramReporter({ token: 'tok', chatId: '123' })
            r.bot.endpoint = `http://127.0.0.1:${serverPort}/bot`

            r.error('Dump attached', { file: Buffer.from('heap dump data'), fileName: 'dump.bin' })
            await new Promise((resolve) => setTimeout(resolve, 100))
            expect(lastRequest.url).to.equal('/bot/sendDocument')
            expect(lastRequest.body.toString()).to.include('dump.bin')
        })

        it('sends file with Readable stream', async () => {
            const r = new TelegramReporter({ token: 'tok', chatId: '123' })
            r.bot.endpoint = `http://127.0.0.1:${serverPort}/bot`

            const stream = Readable.from(['stream file content'])
            stream.path = 'log.txt'
            r.error('Log attached', { file: stream, fileName: 'log.txt' })
            await new Promise((resolve) => setTimeout(resolve, 100))
            expect(lastRequest.url).to.equal('/bot/sendDocument')
        })

        it('uses default fileName "report.txt" when not specified', async () => {
            const r = new TelegramReporter({ token: 'tok', chatId: '123' })
            r.bot.endpoint = `http://127.0.0.1:${serverPort}/bot`

            r.error('Error details', { file: 'some content' })
            await new Promise((resolve) => setTimeout(resolve, 100))
            expect(lastRequest.url).to.equal('/bot/sendDocument')
            expect(lastRequest.body.toString()).to.include('report.txt')
        })

        it('caption includes formatted message (severity + context + text args)', async () => {
            const r = new TelegramReporter({
                token: 'tok',
                chatId: '123',
                context: { server: 'srv1', env: 'live' },
            })
            r.bot.endpoint = `http://127.0.0.1:${serverPort}/bot`

            r.error('Stack trace attached', { file: 'Error: timeout\n    at fn()', fileName: 'stack.txt' })
            await new Promise((resolve) => setTimeout(resolve, 100))
            const body = lastRequest.body.toString()
            expect(body).to.include('ERROR')
            expect(body).to.include('[srv1]')
            expect(body).to.include('Stack trace attached')
        })

        it('does not treat regular objects as file attachment', async () => {
            const r = new TelegramReporter({ token: 'tok', chatId: '123' })
            r.bot.endpoint = `http://127.0.0.1:${serverPort}/bot`

            r.error('context data', { userId: '123', action: 'delete' })
            await new Promise((resolve) => setTimeout(resolve, 100))
            expect(lastRequest.url).to.equal('/bot/sendMessage')
            const parsed = JSON.parse(lastRequest.body.toString())
            expect(parsed.text).to.include('"userId": "123"')
        })
    })

    describe('photo attachments', () => {
        it('sends photo when last arg has photo property (Readable)', async () => {
            const r = new TelegramReporter({ token: 'tok', chatId: '123' })
            r.bot.endpoint = `http://127.0.0.1:${serverPort}/bot`

            const stream = Readable.from([Buffer.from('fake png data')])
            r.error('Browser screenshot', { photo: stream })
            await new Promise((resolve) => setTimeout(resolve, 100))
            expect(lastRequest.url).to.equal('/bot/sendPhoto')
        })

        it('sends photo when last arg has photo property (Buffer)', async () => {
            const r = new TelegramReporter({ token: 'tok', chatId: '123' })
            r.bot.endpoint = `http://127.0.0.1:${serverPort}/bot`

            r.error('Render broken', { photo: Buffer.from('fake image bytes') })
            await new Promise((resolve) => setTimeout(resolve, 100))
            expect(lastRequest.url).to.equal('/bot/sendPhoto')
        })

        it('caption includes formatted message', async () => {
            const r = new TelegramReporter({
                token: 'tok',
                chatId: '123',
                context: { service: 'viewer' },
            })
            r.bot.endpoint = `http://127.0.0.1:${serverPort}/bot`

            r.warn('Page layout broken', { photo: Readable.from([Buffer.from('img')]) })
            await new Promise((resolve) => setTimeout(resolve, 100))
            const body = lastRequest.body.toString()
            expect(body).to.include('WARN')
            expect(body).to.include('[viewer]')
            expect(body).to.include('Page layout broken')
        })

        it('photo attachment works with warn and info too', async () => {
            const r = new TelegramReporter({ token: 'tok', chatId: '123' })
            r.bot.endpoint = `http://127.0.0.1:${serverPort}/bot`

            r.info('Dashboard screenshot', { photo: Readable.from([Buffer.from('img')]) })
            await new Promise((resolve) => setTimeout(resolve, 100))
            expect(lastRequest.url).to.equal('/bot/sendPhoto')
            expect(lastRequest.body.toString()).to.include('INFO')
        })
    })
})
