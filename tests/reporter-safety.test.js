import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { assertSurvives, moduleUrl } from './support/harness.js'

describe('TelegramReporter cannot take down its host', () => {
    let down

    before(async () => {
        const sockets = new Set()
        const server = net.createServer((socket) => {
            sockets.add(socket)
            socket.on('error', () => {})
            socket.destroy()
        })
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
        down = {
            url: `http://127.0.0.1:${server.address().port}`,
            close: () => new Promise((resolve) => server.close(resolve)),
        }
    })

    after(() => down.close())

    /** No unhandledRejection or uncaughtException handlers here, so either one kills the child with a non-zero code. */
    const scenario = (body) =>
        assertSurvives(`
            import { TelegramReporter } from ${JSON.stringify(moduleUrl)}
            const make = (logger) => {
                const reporter = new TelegramReporter({ token: '1:SYNTHETIC', chatId: 1, logger })
                reporter.bot.endpoint = ${JSON.stringify(`${down.url}/bot1:SYNTHETIC`)}
                return reporter
            }
            const circular = {}
            circular.self = circular
            const pause = () => new Promise((resolve) => setTimeout(resolve, 200))
            ${body}
            await pause()
        `)

    describe('when sending fails', () => {
        const loggers = {
            'a logger that throws': `{ error() { throw new Error('logger failed') } }`,
            'a logger with no error method': '{}',
            'a logger whose error is not a function': `{ error: 'nope' }`,
            'an async logger that rejects': `{ async error() { throw new Error('logger failed later') } }`,
            'a logger whose error getter throws': `{ get error() { throw new Error('getter failed') } }`,
            'a logger that throws null': `{ error() { throw null } }`,
        }

        for (const [name, logger] of Object.entries(loggers)) {
            it(`survives ${name}`, async () => {
                await scenario(`make(${logger}).error('something')`)
            })
        }

        it('survives having no logger', async () => {
            await scenario(`make(null).error('something')`)
        })
    })

    describe('when formatting fails', () => {
        const failing = {
            'a circular object': 'circular',
            'an object whose toJSON throws': `{ toJSON() { throw new Error('toJSON failed') } }`,
            'an object whose toJSON throws null': `{ toJSON() { throw null } }`,
            'a bigint inside an object': '{ big: 10n }',
        }

        for (const [name, value] of Object.entries(failing)) {
            for (const [loggerName, logger] of Object.entries({ 'a throwing logger': `{ error() { throw new Error('logger failed') } }`, 'no logger': 'undefined' })) {
                it(`${name} with ${loggerName} does not throw into the caller`, async () => {
                    const stdout = await scenario(`
                        try {
                            make(${logger}).error(${value})
                            console.log('no throw')
                        } catch (err) {
                            console.log('THROWN', err?.message)
                        }
                    `)
                    assert.match(stdout, /no throw/)
                })
            }
        }

        it('a formatting failure with a broken context does not throw either', async () => {
            const stdout = await scenario(`
                const reporter = new TelegramReporter({ token: '1:S', chatId: 1, context: null, logger: { error() { throw new Error('logger failed') } } })
                reporter.warn('something')
                console.log('no throw')
            `)
            assert.match(stdout, /no throw/)
        })
    })

    describe('a working logger still hears about failures (control)', () => {
        it('when sending fails', async () => {
            const stdout = await scenario(`make({ error: (...args) => console.log('LOGGED', ...args) }).error('something')`)
            assert.match(stdout, /LOGGED Failed to send telegram report:/)
        })

        it('when formatting fails', async () => {
            const stdout = await scenario(`make({ error: (...args) => console.log('LOGGED', ...args) }).error(circular)`)
            assert.match(stdout, /LOGGED Error formatting telegram report:/)
        })
    })
})
