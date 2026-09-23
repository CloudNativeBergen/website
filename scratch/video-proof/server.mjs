// Throwaway static server + result sink for the #1171 proof. Not merged.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
const ROOT = path.resolve(import.meta.dirname, '../..')
const OUT = path.join(import.meta.dirname, 'out')
const PORT = Number(process.env.PORT ?? 4817)
const types = { '.mp4': 'video/mp4', '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' }
http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    if (req.method === 'POST' && url.pathname === '/log') {
      const name = path.basename(url.searchParams.get('name') ?? 'live')
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        fs.appendFileSync(path.join(OUT, name + '.live.log'), body + '\n')
        res.writeHead(200).end('ok')
      })
      return
    }
    if (req.method === 'POST' && url.pathname === '/save') {
      const name = path.basename(url.searchParams.get('name') ?? 'blob')
      const chunks = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => {
        fs.writeFileSync(path.join(OUT, name), Buffer.concat(chunks))
        console.log('saved', name, Buffer.concat(chunks).length)
        res.writeHead(200, { 'access-control-allow-origin': '*' }).end('ok')
      })
      return
    }
    if (url.pathname === '/') {
      res.writeHead(302, { location: '/scratch/video-proof/index.html' + url.search }).end()
      return
    }
    const p = url.pathname
    const file = path.join(ROOT, path.normalize(p))
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end('nf')
      return
    }
    const size = fs.statSync(file).size
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '')
    if (m) {
      const start = m[1] ? Number(m[1]) : 0
      const end = m[2] ? Number(m[2]) : size - 1
      res.writeHead(206, { 'content-type': types[path.extname(file)] ?? 'video/mp4', 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 })
      fs.createReadStream(file, { start, end }).pipe(res)
      return
    }
    res.writeHead(200, { 'accept-ranges': 'bytes', 'content-length': size, 'content-type': types[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' })
    fs.createReadStream(file).pipe(res)
  })
  .listen(PORT, '127.0.0.1', () => console.log('listening', PORT))
