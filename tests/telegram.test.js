import { describe, it, before, after, beforeEach } from 'node:test'
import { expect } from 'chai'
import http from 'node:http'
import { Readable } from 'node:stream'
import Telegram from '../src/index.js'

// Mock HTTP server that mimics Telegram Bot API responses
let server
let serverPort
let lastRequest = null
let mockResponse = { ok: true, result: { message_id: 1 } }
// When set, the server will return raw content instead of JSON-encoded mockResponse
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

        it('builds endpoint containing the token', () => {
            const bot = new Telegram('abc123', '789')
            expect(bot.endpoint).to.include('abc123')
            expect(bot.endpoint).to.include('api.telegram.org')
        })

        it('builds endpoint with correct format', () => {
            const bot = new Telegram('TOKEN', '123')
            expect(bot.endpoint).to.equal('https://api.telegram.org/botTOKEN')
        })
    })

    describe('sendMessage', () => {
        it('returns parsed response on success', async () => {
            const bot = new Telegram('token', '123')
            bot.endpoint = `http://127.0.0.1:${serverPort}/bot`
            mockResponse = { ok: true, result: { message_id: 42 } }

            const result = await bot.sendMessage({ text: 'hello' })
            expect(result.ok).to.be.true
            expect(result.result.message_id).to.equal(42)
        })

        it('throws when ok is false', async () => {
            const bot = new Telegram('token', '123')
            bot.endpoint = `http://127.0.0.1:${serverPort}/bot`
            mockResponse = { ok: false, error_code: 400, description: 'Bad Request: chat not found' }

            try {
                await bot.sendMessage({ text: 'hello' })
                expect.fail('Should have thrown')
            } catch (err) {
                expect(err.message).to.equal('Bad Request: chat not found')
            }
        })

        it('throws with fallback message when description is missing', async () => {
            const bot = new Telegram('token', '123')
            bot.endpoint = `http://127.0.0.1:${serverPort}/bot`
            mockResponse = { ok: false, error_code: 500 }

            try {
                await bot.sendMessage({ text: 'hello' })
                expect.fail('Should have thrown')
            } catch (err) {
                expect(err.message).to.equal('Telegram API error')
            }
        })

        it('sends POST request with JSON body containing chat_id, text, parse_mode', async () => {
            const bot = new Telegram('token', '999')
            bot.endpoint = `http://127.0.0.1:${serverPort}/bot`

            await bot.sendMessage({ text: 'Test message' })

            const parsed = JSON.parse(lastRequest.body.toString())
            expect(parsed.chat_id).to.equal('999')
            expect(parsed.text).to.equal('Test message')
            expect(parsed.parse_mode).to.equal('HTML')
            expect(lastRequest.method).to.equal('POST')
        })

        it('uses HTML as default parse_mode', async () => {
            const bot = new Telegram('token', '123')
            bot.endpoint = `http://127.0.0.1:${serverPort}/bot`

            await bot.sendMessage({ text: 'hello' })

            const parsed = JSON.parse(lastRequest.body.toString())
            expect(parsed.parse_mode).to.equal('HTML')
        })

        it('uses custom chatId when provided as parameter', async () => {
            const bot = new Telegram('token', 'default-chat')
            bot.endpoint = `http://127.0.0.1:${serverPort}/bot`

            await bot.sendMessage({ text: 'hello', chatId: 'override-chat' })

            const parsed = JSON.parse(lastRequest.body.toString())
            expect(parsed.chat_id).to.equal('override-chat')
        })

        it('falls back to constructor chatId when chatId param not given', async () => {
            const bot = new Telegram('token', 'constructor-chat')
            bot.endpoint = `http://127.0.0.1:${serverPort}/bot`

            await bot.sendMessage({ text: 'hello' })

            const parsed = JSON.parse(lastRequest.body.toString())
            expect(parsed.chat_id).to.equal('constructor-chat')
        })

        it('sends request to the sendMessage endpoint', async () => {
            const bot = new Telegram('token', '123')
            bot.endpoint = `http://127.0.0.1:${serverPort}/bot`

            await bot.sendMessage({ text: 'hello' })

            expect(lastRequest.url).to.equal('/bot/sendMessage')
        })

        it('throws descriptive Error (not SyntaxError) when response is not valid JSON', async () => {
            const bot = new Telegram('token', '123')
            bot.endpoint = `http://127.0.0.1:${serverPort}/bot`
            mockRawResponse = { status: 200, contentType: 'text/html', body: '<html>error</html>' }

            try {
                await bot.sendMessage({ text: 'hello' })
                expect.fail('Should have thrown')
            } catch (err) {
                expect(err).to.be.instanceOf(Error)
                expect(err.constructor.name).to.not.equal('SyntaxError')
                expect(err.message).to.include('Failed to parse Telegram response')
            }
        })
    })

    describe('sendFile', () => {
        it('returns parsed response on success', async () => {
            const bot = new Telegram('token', '123')
            bot.endpoint = `http://127.0.0.1:${serverPort}/bot`
            mockResponse = { ok: true, result: { message_id: 10 } }

            const stream = Readable.from(['file content'])
            const result = await bot.sendFile({ file: stream })
            expect(result.ok).to.be.true
            expect(result.result.message_id).to.equal(10)
        })

        it('throws when ok is false', async () => {
            const bot = new Telegram('token', '123')
            bot.endpoint = `http://127.0.0.1:${serverPort}/bot`
            mockResponse = { ok: false, error_code: 400, description: 'Bad Request: wrong file type' }

            const stream = Readable.from(['data'])
            try {
                await bot.sendFile({ file: stream })
                expect.fail('Should have thrown')
            } catch (err) {
                expect(err.message).to.equal('Bad Request: wrong file type')
            }
        })

        it('sends POST request to sendDocument endpoint', async () => {
            const bot = new Telegram('token', '123')
            bot.endpoint = `http://127.0.0.1:${serverPort}/bot`

            const stream = Readable.from(['hello'])
            await bot.sendFile({ file: stream })

            expect(lastRequest.url).to.equal('/bot/sendDocument')
            expect(lastRequest.method).to.equal('POST')
        })

        it('uses constructor chatId when chatId param not given', async () => {
            const bot = new Telegram('token', '777')
            bot.endpoint = `http://127.0.0.1:${serverPort}/bot`

            const stream = Readable.from(['hello'])
            await bot.sendFile({ file: stream })

            expect(lastRequest.body.toString()).to.include('777')
        })

        it('uses custom chatId when provided', async () => {
            const bot = new Telegram('token', 'default')
            bot.endpoint = `http://127.0.0.1:${serverPort}/bot`

            const stream = Readable.from(['hello'])
            await bot.sendFile({ chatId: 'override-999', file: stream })

            expect(lastRequest.body.toString()).to.include('override-999')
        })

        it('includes caption in the request body', async () => {
            const bot = new Telegram('token', '123')
            bot.endpoint = `http://127.0.0.1:${serverPort}/bot`

            const stream = Readable.from(['content'])
            await bot.sendFile({ file: stream, caption: 'my caption' })

            expect(lastRequest.body.toString()).to.include('my caption')
        })
    })

    describe('sendPhoto', () => {
        it('returns parsed response on success', async () => {
            const bot = new Telegram('token', '123')
            bot.endpoint = `http://127.0.0.1:${serverPort}/bot`
            mockResponse = { ok: true, result: { message_id: 20 } }

            const stream = Readable.from(['photo data'])
            const result = await bot.sendPhoto({ photo: stream })
            expect(result.ok).to.be.true
            expect(result.result.message_id).to.equal(20)
        })

        it('throws when ok is false', async () => {
            const bot = new Telegram('token', '123')
            bot.endpoint = `http://127.0.0.1:${serverPort}/bot`
            mockResponse = { ok: false, error_code: 400, description: 'Bad Request: photo_invalid' }

            const stream = Readable.from(['data'])
            try {
                await bot.sendPhoto({ photo: stream })
                expect.fail('Should have thrown')
            } catch (err) {
                expect(err.message).to.equal('Bad Request: photo_invalid')
            }
        })

        it('sends POST request to sendPhoto endpoint', async () => {
            const bot = new Telegram('token', '123')
            bot.endpoint = `http://127.0.0.1:${serverPort}/bot`

            const stream = Readable.from(['img'])
            await bot.sendPhoto({ photo: stream })

            expect(lastRequest.url).to.equal('/bot/sendPhoto')
            expect(lastRequest.method).to.equal('POST')
        })

        it('uses constructor chatId as fallback', async () => {
            const bot = new Telegram('token', '888')
            bot.endpoint = `http://127.0.0.1:${serverPort}/bot`

            const stream = Readable.from(['img'])
            await bot.sendPhoto({ photo: stream })

            expect(lastRequest.body.toString()).to.include('888')
        })

        it('uses custom chatId when provided', async () => {
            const bot = new Telegram('token', 'default')
            bot.endpoint = `http://127.0.0.1:${serverPort}/bot`

            const stream = Readable.from(['img'])
            await bot.sendPhoto({ chatId: 'custom-chat', photo: stream })

            expect(lastRequest.body.toString()).to.include('custom-chat')
        })

        it('includes caption in the request body', async () => {
            const bot = new Telegram('token', '123')
            bot.endpoint = `http://127.0.0.1:${serverPort}/bot`

            const stream = Readable.from(['img'])
            await bot.sendPhoto({ photo: stream, caption: 'nice photo' })

            expect(lastRequest.body.toString()).to.include('nice photo')
        })
    })
})
