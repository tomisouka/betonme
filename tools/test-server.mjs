/**
 * BetOnMe Server Diagnostic
 * Run: node test-server.mjs
 * 
 * Tests whether the new PUT endpoints exist or if the old server is still running.
 */

const BASE = 'http://127.0.0.1:3001'

async function t(label, method, path, body) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    const status = res.status
    let json
    try { json = await res.json() } catch { json = null }
    const ok = status >= 200 && status < 300
    console.log(`${ok ? '✅' : '❌'} [${status}] ${method} ${path}  ${ok ? '' : '← ' + (json?.error || 'no body')}`)
    return ok
  } catch (e) {
    console.log(`💀 NETWORK ERROR ${method} ${path}: ${e.message}`)
    return false
  }
}

console.log('\n=== BetOnMe Server Diagnostic ===\n')

// 1. Is the server even up?
await t('ping',                   'GET',    '/ping')

// 2. Can we read data?
await t('GET /data',              'GET',    '/data')

// 3. NEW endpoints — these will 404 if old server is running
await t('PUT /picks/ou/test',     'PUT',    '/picks/ou/2099-01-01',        { name: 'Over', point: 8.5, odds: -110, result: null })
await t('PUT /picks/fav/test',    'PUT',    '/picks/fav/2099-01-01',       { team: 'Yankees', odds: +150, sport: 'MLB', result: null })
await t('PUT /picks/dog/test',    'PUT',    '/picks/dog/2099-01-01',       { team: 'Rays', odds: +180, sport: 'MLB', result: null })
await t('PUT /picks/hate/test',   'PUT',    '/picks/hate/2099-01-01',      { team: 'Red Sox', odds: -120, sport: 'MLB', result: null })
await t('PUT /parlays/lay/test',  'PUT',    '/parlays/lay/2099-01-01',     { legs: [], result: null })
await t('PUT /parlays/pred/test', 'PUT',    '/parlays/prediction/2099-01-01', { legs: [], result: null })
await t('PUT /parlays/allin/test','PUT',    '/parlays/allin/2099-01-01',   { legs: [], result: null })
await t('PUT /props/test',        'PUT',    '/props/2099-01-01',           {})
await t('PUT /prefs',             'PUT',    '/prefs',                      { favTeam_MLB: 'TEST' })
await t('PUT /appstate',          'PUT',    '/appstate',                   { coins: 0, streak: [], streakDates: [], loginDates: [] })
await t('PUT /f5/test',           'PUT',    '/f5/2099-01-01',              { MLB: { sport: 'MLB', result: null, noGuess: false } })

// Clean up test rows
await t('DELETE /picks/ou/test',  'DELETE', '/picks/ou/2099-01-01')
await t('DELETE /picks/fav/test', 'DELETE', '/picks/fav/2099-01-01')
await t('DELETE /picks/dog/test', 'DELETE', '/picks/dog/2099-01-01')
await t('DELETE /picks/hate/test','DELETE', '/picks/hate/2099-01-01')

// 4. Check export reads from DB
await t('GET /export',            'GET',    '/export')

console.log('\n=== Done ===')
console.log('\nIf you see ❌ 404 on PUT endpoints → the OLD server.js is still running.')
console.log('Fix: kill the old process and restart with the new server.js\n')
console.log('How to find & kill it:')
console.log('  lsof -i :3001          ← shows what process is on port 3001')
console.log('  kill <PID>             ← kill it')
console.log('  node server.js         ← start the new one\n')
