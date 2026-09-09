#!/usr/bin/env node
/**
 * test-resolve.mjs — BetOnMe Lay Resolution Diagnostic
 * Tests every step of the resolution chain for lay/predictions parlays.
 *
 * Usage: node test-resolve.mjs
 * Run from betonme project root with server running (USE_DB=true)
 */

const SERVER = 'http://127.0.0.1:3001'
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports'

const ESPN_ENDPOINTS = {
  MLB: 'baseball/mlb',
  NBA: 'basketball/nba',
  NFL: 'football/nfl',
}

let passed = 0
let failed = 0
let warnings = 0

function ok(label, detail = '') {
  console.log(`  ✅ ${label}${detail ? ' — ' + detail : ''}`)
  passed++
}

function fail(label, detail = '') {
  console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`)
  failed++
}

function warn(label, detail = '') {
  console.log(`  ⚠️  ${label}${detail ? ' — ' + detail : ''}`)
  warnings++
}

function section(title) {
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`  ${title}`)
  console.log('─'.repeat(60))
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function serverGet(path) {
  const r = await fetch(`${SERVER}${path}`)
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json()
}

async function serverPut(path, body) {
  const r = await fetch(`${SERVER}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: r.status, body: await r.json() }
}

async function espnFetch(sport, dateStr) {
  const endpoint = ESPN_ENDPOINTS[sport]
  if (!endpoint) return []
  const url = `${ESPN_BASE}/${endpoint}/scoreboard?dates=${dateStr}`
  const r = await fetch(url)
  if (!r.ok) return []
  const data = await r.json()
  return data.events || []
}

function lastWord(name) {
  return (name || '').trim().split(' ').pop().toLowerCase()
}

function matchEvent(events, home, away) {
  const homeLower = (home || '').toLowerCase()
  const homeLast = homeLower.split(' ').pop()
  return events.find(e =>
    (e.competitions?.[0]?.competitors || []).some(c => {
      const dn = c.team.displayName.toLowerCase()
      return homeLower.includes(dn) || dn.includes(homeLower) ||
             (homeLast.length > 3 && dn.includes(homeLast))
    })
  )
}

function resolveWinner(comp, leg) {
  if (leg.market === 'spreads' && leg.point != null) {
    const competitors = comp.competitors || []
    const lt = (leg.team || '').toLowerCase()
    const ll = lt.split(' ').pop()
    const pickedComp = competitors.find(c => {
      const dn = c.team.displayName.toLowerCase()
      const sn = c.team.shortDisplayName?.toLowerCase() || ''
      return dn.includes(lt) || lt.includes(dn) ||
             (ll.length > 3 && (dn.includes(ll) || sn.includes(ll)))
    })
    if (!pickedComp) return { won: null, reason: `Could not find team "${leg.team}" in competitors: ${competitors.map(c => c.team.displayName).join(', ')}` }
    const oppComp = competitors.find(c => c.id !== pickedComp.id)
    const pickedScore = parseFloat(pickedComp.score)
    const oppScore = parseFloat(oppComp?.score ?? 0)
    if (isNaN(pickedScore)) return { won: null, reason: `Score is NaN for ${leg.team}` }
    const won = (pickedScore - oppScore + leg.point) > 0
    return { won, reason: `${leg.team} ${pickedScore} vs ${oppScore} with spread ${leg.point} → ${won ? 'COVER' : 'NO COVER'}` }
  } else {
    const winner = comp.competitors?.find(c => c.winner)
    if (!winner) return { won: null, reason: 'No winner found in ESPN data (game not complete?)' }
    const winnerName = winner.team.displayName.toLowerCase()
    const legTeam = (leg.team || '').toLowerCase()
    const legLast = legTeam.split(' ').pop()
    const won = winnerName.includes(legTeam) || legTeam.includes(winnerName) ||
                (legLast.length > 3 && winnerName.includes(legLast))
    return { won, reason: `ESPN winner: "${winner.team.displayName}" vs picked: "${leg.team}" → ${won ? 'MATCH' : 'NO MATCH'}` }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗')
  console.log('║     BetOnMe — Lay Resolution Diagnostic                 ║')
  console.log('╚══════════════════════════════════════════════════════════╝')

  // ── STEP 1: Server reachable ──────────────────────────────────────────────
  section('STEP 1: Server health')
  try {
    const ping = await serverGet('/ping')
    ok('Server reachable', `USE_DB mode, dataDir: ${ping.dataDir}`)
  } catch (e) {
    fail('Server not reachable', e.message)
    console.log('\n  Cannot continue — start server with USE_DB=true first.')
    process.exit(1)
  }

  // ── STEP 2: Load all data ─────────────────────────────────────────────────
  section('STEP 2: Load data from server')
  let allData
  try {
    allData = await serverGet('/data')
    ok('GET /data succeeded')
  } catch (e) {
    fail('GET /data failed', e.message)
    process.exit(1)
  }

  // ── STEP 3: Inspect lay history ───────────────────────────────────────────
  section('STEP 3: Lay history state')
  const lay = allData.lay || {}
  const layDates = Object.keys(lay)
  
  if (!layDates.length) {
    warn('No lay history found — nothing to resolve')
  } else {
    ok(`Found ${layDates.length} lay entries`, layDates.join(', '))
  }

  // Find unresolved entries
  const unresolved = layDates.filter(date => {
    const entry = lay[date]
    if (!entry?.legs) return false
    const legsWithTeam = entry.legs.filter(l => l.team)
    return legsWithTeam.some(l => l.result === null)
  })

  const resolved = layDates.filter(date => {
    const entry = lay[date]
    if (!entry?.legs) return false
    const legsWithTeam = entry.legs.filter(l => l.team)
    return legsWithTeam.every(l => l.result !== null)
  })

  console.log(`\n  Lay entries with unresolved legs: ${unresolved.length}`)
  unresolved.forEach(date => {
    const entry = lay[date]
    const legs = entry.legs.filter(l => l.team)
    const pending = legs.filter(l => l.result === null)
    console.log(`    📅 ${date}: ${pending.length}/${legs.length} legs pending`)
    pending.forEach(l => console.log(`       — ${l.team} (${l.sport}) home="${l.home}" away="${l.away}" market=${l.market} point=${l.point}`))
  })

  console.log(`\n  Lay entries fully resolved: ${resolved.length}`)
  resolved.forEach(date => {
    const entry = lay[date]
    console.log(`    📅 ${date}: result=${entry.result || '???'} overallResult=${entry.overallResult || '???'}`)
    if (!entry.result && entry.overallResult) {
      fail(`${date} has overallResult but no result field — PUT will not save to DB`)
    } else if (entry.result) {
      ok(`${date} has result field set correctly`)
    }
  })

  // ── STEP 4: ESPN resolution test per unresolved leg ───────────────────────
  section('STEP 4: ESPN resolution test for each unresolved leg')

  if (!unresolved.length) {
    warn('No unresolved legs to test')
  }

  for (const date of unresolved) {
    const entry = lay[date]
    const legs = entry.legs.filter(l => l.team && l.result === null)
    console.log(`\n  📅 Date: ${date}`)

    for (const leg of legs) {
      const dateStr = date.replace(/-/g, '')
      console.log(`\n    Leg: ${leg.team} | sport=${leg.sport} | market=${leg.market} | point=${leg.point}`)
      console.log(`         home="${leg.home}" away="${leg.away}"`)

      // Test ESPN fetch
      let events
      try {
        events = await espnFetch(leg.sport, dateStr)
        if (!events.length) {
          fail(`ESPN returned 0 events for ${leg.sport} on ${date}`)
          continue
        }
        ok(`ESPN returned ${events.length} events for ${leg.sport} ${date}`)
      } catch (e) {
        fail(`ESPN fetch failed`, e.message)
        continue
      }

      // Test event matching
      const event = matchEvent(events, leg.home, leg.away)
      if (!event) {
        fail(`Could not match game in ESPN events`)
        console.log(`    ESPN teams available:`)
        events.forEach(e => {
          const comps = e.competitions?.[0]?.competitors || []
          console.log(`      ${comps.map(c => c.team.displayName).join(' vs ')}`)
        })
        continue
      }
      ok(`Matched ESPN event: ${event.name || event.shortName}`)

      // Test completion status
      const comp = event.competitions?.[0]
      const completed = comp?.status?.type?.completed
      const state = comp?.status?.type?.state
      const statusName = comp?.status?.type?.name
      console.log(`    ESPN status: state=${state} completed=${completed} name=${statusName}`)

      if (!completed) {
        warn(`Game not completed yet (state=${state}) — resolution will skip`)
        continue
      }
      ok(`Game is completed`)

      // Test winner resolution
      const { won, reason } = resolveWinner(comp, leg)
      console.log(`    Resolution: ${reason}`)
      if (won === null) {
        fail(`Could not determine winner`)
      } else {
        ok(`Result: ${won ? 'WIN ✅' : 'LOSS ❌'}`)
      }
    }
  }

  // ── STEP 5: Test PUT /parlays/lay/:date with resolved legs ────────────────
  section('STEP 5: Test PUT /parlays/lay/:date saves correctly')

  const TEST_DATE = '2099-01-01'
  const testParlay = {
    legs: [
      { gameId: 'dk_test1', home: 'Test Home', away: 'Test Away', sport: 'MLB', team: 'Test Home', odds: -150, market: 'h2h', point: null, isLock: true, isDog: false, result: 'W' },
      { gameId: 'dk_test2', home: 'Test2 Home', away: 'Test2 Away', sport: 'NBA', team: 'Test2 Away', odds: 140, market: 'h2h', point: null, isLock: false, isDog: true, result: 'L' },
    ],
    result: 'L',
    overallResult: 'L',
    hitCount: 1,
    totalCount: 2,
    lockedAt: Date.now(),
  }

  try {
    const { status, body } = await serverPut(`/parlays/lay/${TEST_DATE}`, testParlay)
    if (status === 200 && body.ok) {
      ok(`PUT /parlays/lay/${TEST_DATE} succeeded`)
    } else {
      fail(`PUT returned ${status}`, JSON.stringify(body))
    }
  } catch (e) {
    fail(`PUT /parlays/lay/${TEST_DATE} threw`, e.message)
  }

  // Verify it round-trips correctly
  try {
    const readBack = await serverGet('/data')
    const savedLay = readBack.lay?.[TEST_DATE]
    if (!savedLay) {
      fail('Test lay entry not found after PUT')
    } else {
      ok('Test lay entry found after PUT')
      if (savedLay.result === 'L') {
        ok('result field saved correctly')
      } else {
        fail(`result field wrong: expected "L" got "${savedLay.result}"`)
      }
      const leg0 = savedLay.legs?.[0]
      if (leg0?.result === 'W') {
        ok('Leg result saved correctly')
      } else {
        fail(`Leg 0 result wrong: expected "W" got "${leg0?.result}"`)
      }
    }
  } catch (e) {
    fail('Read-back after PUT failed', e.message)
  }

  // Clean up test entry
  try {
    await fetch(`${SERVER}/parlays/lay/${TEST_DATE}`, { method: 'DELETE' }).catch(() => {})
  } catch {}

  // ── STEP 6: Check readFromDb leg result field ─────────────────────────────
  section('STEP 6: Verify readFromDb returns leg results')

  try {
    const data = await serverGet('/data')
    const allLay = data.lay || {}
    let legResultIssues = 0
    for (const [date, entry] of Object.entries(allLay)) {
      for (const leg of (entry.legs || [])) {
        if (leg.result === undefined) {
          fail(`${date}: leg ${leg.team} has result=undefined (should be null or W/L)`)
          legResultIssues++
        }
      }
    }
    if (!legResultIssues) ok('All leg result fields are properly null or W/L (not undefined)')
  } catch (e) {
    fail('Could not verify leg results', e.message)
  }

  // ── STEP 7: Simulate full resolveLay for today ────────────────────────────
  section('STEP 7: Full resolveLay simulation')

  const today = new Date().toISOString().slice(0, 10)
  const todayEntry = lay[today]

  if (!todayEntry?.legs?.length) {
    warn(`No lay entry for today (${today})`)
  } else {
    console.log(`\n  Today's lay (${today}): ${todayEntry.legs.length} legs`)
    const legsWithTeam = todayEntry.legs.filter(l => l.team)
    const pending = legsWithTeam.filter(l => l.result === null)
    const resolved2 = legsWithTeam.filter(l => l.result !== null)

    console.log(`  Resolved: ${resolved2.length} | Pending: ${pending.length}`)

    if (pending.length === 0) {
      ok('All legs resolved')
      if (!todayEntry.result) {
        fail('All legs resolved but result field is missing — this is the bug')
        console.log('  Fix: run resolveLay with the patched ParlaysTab that sets result field')
      } else {
        ok(`result = "${todayEntry.result}"`)
      }
    } else {
      console.log('\n  Pending legs:')
      pending.forEach(l => {
        console.log(`    — ${l.team} | ${l.sport} | home="${l.home}"`)
      })

      // Try to resolve them now
      console.log('\n  Attempting ESPN resolution now...')
      const dateStr = today.replace(/-/g, '')
      
      for (const leg of pending) {
        const events = await espnFetch(leg.sport, dateStr)
        const event = matchEvent(events, leg.home, leg.away)
        const comp = event?.competitions?.[0]
        
        if (!event) {
          fail(`${leg.team}: no ESPN match found`)
          continue
        }
        if (!comp?.status?.type?.completed) {
          warn(`${leg.team}: game not completed yet`)
          continue
        }
        
        const { won, reason } = resolveWinner(comp, leg)
        if (won === null) {
          fail(`${leg.team}: ${reason}`)
        } else {
          ok(`${leg.team}: ${reason}`)
          console.log(`    → Would set result = "${won ? 'W' : 'L'}"`)
        }
      }
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60))
  console.log('  SUMMARY')
  console.log('═'.repeat(60))
  console.log(`  ✅ Passed:   ${passed}`)
  console.log(`  ❌ Failed:   ${failed}`)
  console.log(`  ⚠️  Warnings: ${warnings}`)
  console.log('═'.repeat(60) + '\n')

  if (failed === 0) {
    console.log('  🎉 All checks passed — resolution chain looks healthy\n')
  } else {
    console.log('  🔧 Failures found — check output above for root cause\n')
  }
}

main().catch(e => {
  console.error('\n[FATAL]', e)
  process.exit(1)
})
