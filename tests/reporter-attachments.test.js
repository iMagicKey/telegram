import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assertSurvives, moduleUrl, parseForm, startFakeApi } from './support/harness.js'

const INTENDED = 'INTENDED-CONTENT'

describe('TelegramReporter attachments from a caller stream', () => {
    let cwd
    let api

    before(async () => {
        // Every child runs here, so relative paths resolve to these files and nothing touches the repository.
        cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'imagic-telegram-attach-'))
        fs.writeFileSync(path.join(cwd, 'intended.log'), INTENDED)
        fs.writeFileSync(path.join(cwd, 'chart.png'), INTENDED)
        fs.writeFileSync(path.join(cwd, 'report.txt'), 'UNRELATED-FILE-IN-CWD')
        fs.writeFileSync(path.join(cwd, 'other.env'), 'SYNTHETIC_SECRET=1')
        api = await startFakeApi((_req, res) => res.end('{"ok":true}'))
    })

    after(async () => {
        await api.close()
        fs.rmSync(cwd, { recursive: true, force: true })
    })

    /** Report in a child process, then print the caller stream's `.path`. */
    async function report(makeSource, attachment) {
        api.requests.length = 0
        const stdout = await assertSurvives(
            `
            import fs from 'node:fs'
            import { Readable } from 'node:stream'
            import { TelegramReporter } from ${JSON.stringify(moduleUrl)}
            const reporter = new TelegramReporter({ token: '1:SYNTHETIC', chatId: 1, logger: { error: (...args) => console.log('LOGGED', ...args) } })
            reporter.bot.endpoint = ${JSON.stringify(`${api.url}/bot1:SYNTHETIC`)}
            const source = ${makeSource}
            const before = source.path
            reporter.error('message', ${attachment})
            await new Promise((resolve) => setTimeout(resolve, 300))
            console.log('PATH', JSON.stringify({ before, after: source.path, same: before === source.path }))
            `,
            { cwd }
        )
        return stdout
    }

    const pathReport = (stdout) => JSON.parse(/PATH (.*)/.exec(stdout)[1])
    const uploaded = async (field) => (await parseForm(api.requests[0])).get(field)

    it('uploads the intended file, not ./report.txt, when no fileName is given', async () => {
        const stdout = await report(`fs.createReadStream('intended.log')`, '{ file: source }')
        const document = await uploaded('document')
        assert.equal(await document.text(), INTENDED)
        assert.equal(document.name, 'intended.log')
        assert.deepEqual(pathReport(stdout), { before: 'intended.log', after: 'intended.log', same: true })
    })

    it('fileName changes only the uploaded name, not which file is read', async () => {
        const stdout = await report(`fs.createReadStream('intended.log')`, `{ file: source, fileName: 'other.env' }`)
        const document = await uploaded('document')
        assert.equal(await document.text(), INTENDED)
        assert.equal(document.name, 'other.env')
        assert.deepEqual(pathReport(stdout), { before: 'intended.log', after: 'intended.log', same: true })
    })

    it('a fileName naming a missing file still uploads the intended file', async () => {
        const stdout = await report(`fs.createReadStream('intended.log')`, `{ file: source, fileName: 'does-not-exist.bin' }`)
        assert.equal(await (await uploaded('document')).text(), INTENDED)
        assert.doesNotMatch(stdout, /LOGGED/)
    })

    it('the photo branch uploads the intended file and leaves the stream alone', async () => {
        const stdout = await report(`fs.createReadStream('chart.png')`, '{ photo: source }')
        const photo = await uploaded('photo')
        assert.equal(await photo.text(), INTENDED)
        assert.equal(photo.name, 'chart.png')
        assert.deepEqual(pathReport(stdout), { before: 'chart.png', after: 'chart.png', same: true })
    })

    it('a stream with no path keeps the documented default name', async () => {
        const stdout = await report(`Readable.from([Buffer.from('from memory')])`, '{ file: source }')
        const document = await uploaded('document')
        assert.equal(await document.text(), 'from memory')
        assert.equal(document.name, 'report.txt')
        assert.equal(pathReport(stdout).after, undefined)
    })

    it('a stream that fails is logged, not fatal, and nothing else is uploaded', async () => {
        const stdout = await report(`fs.createReadStream('missing.log')`, '{ file: source }')
        assert.match(stdout, /LOGGED Failed to send telegram report: .*ENOENT/)
        for (const record of api.requests) assert.equal(record.body.includes('UNRELATED-FILE-IN-CWD'), false)
    })

    it('a stream that has already been used is logged rather than uploaded empty', async () => {
        const stdout = await report(`(() => { const used = Readable.from([]); used.destroy(); return used })()`, '{ file: source }')
        assert.match(stdout, /LOGGED /)
        assert.equal(api.requests.length, 0)
    })

    it('leaves the repository working directory out of it (control)', () => {
        assert.equal(fs.existsSync(path.join(process.cwd(), 'report.txt')), false)
    })
})
