import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import http from 'node:http'

export const moduleUrl = new URL('../../src/index.js', import.meta.url).href

/** A local stand-in for the Bot API. The real API is never contacted. */
export async function startFakeApi(handler) {
    const requests = []
    const server = http.createServer((req, res) => {
        const chunks = []
        req.on('data', (chunk) => chunks.push(chunk))
        req.on('end', () => {
            requests.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks) })
            handler(req, res)
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

/** Run an ES module script in a real child process, killed if it outlives `timeout`. */
export function runChild(script, { cwd, timeout = 20000 } = {}) {
    return new Promise((resolve) => {
        execFile(process.execPath, ['--input-type=module', '-e', script], { cwd, timeout }, (err, stdout, stderr) => {
            resolve({ code: err ? err.code : 0, stdout, stderr })
        })
    })
}

/** Run a script and require that the process survived it. */
export async function assertSurvives(script, options) {
    const result = await runChild(`${script}\nconsole.log('survived')`, options)
    assert.equal(result.code, 0, `the process must not die. stderr: ${result.stderr}`)
    assert.match(result.stdout, /survived/)
    return result.stdout
}

export function parseForm(record) {
    return new Response(record.body, { headers: { 'content-type': record.headers['content-type'] } }).formData()
}
