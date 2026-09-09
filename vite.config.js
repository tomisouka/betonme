import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

const cert = path.resolve(process.env.VITE_TLS_CERT || 'localhost.crt')
const key  = path.resolve(process.env.VITE_TLS_KEY  || 'localhost.key')
const hasHttps = fs.existsSync(cert) && fs.existsSync(key)
// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    ...(hasHttps ? {
      https: {
        cert: fs.readFileSync(cert),
        key:  fs.readFileSync(key),
      }
    } : {}),
  },
})
