/**
 * PropsTab Test Runner
 * Usage: node test-props.mjs
 * Requires: server running at http://127.0.0.1:3001
 */

const SERVER = 'http://127.0.0.1:3001'
const today = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
})()

let passed = 0
let failed = 0
let warned = 0

function pass(id, msg)  { console.log(`  ✅ ${id}: ${msg}`); passed++ }
function fail(id, msg)  { console.log(`  ❌ ${id}: ${msg}`); failed++ }
function warn(id, msg)  { console.log(`  ⚠️  ${id}: ${msg}`); warned++ }
function group(name)    { console.log(`\n── ${name} ──────────────────────────`) }

async function get(path) {
  const res = await fetch(`${SERVER}${path}`)
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${path}`)
  return res.json()
}

function lastWord(s) { return (s || '').trim().split(' ').pop().toLowerCase() }

function matchesGame(prop, homeL, awayL) {
  const ph = (prop.home || '').toLowerCase()
  const pa = (prop.away || '').toLowerCase()
  return (
    lastWord(ph) === lastWord(homeL) || lastWord(pa) === lastWord(awayL) ||
    homeL.includes(lastWord(ph)) || awayL.includes(lastWord(pa))
  ) && prop.isMainLine && String(prop.subcategoryId) === '15221'
}

// ─────────────────────────────────────────────────────────────────────────────

async function runAll() {
  console.log(`\n🎲 PropsTab Test Runner`)
  console.log(`   Server : ${SERVER}`)
  console.log(`   Today  : ${today}`)
  console.log(`   Time   : ${new Date().toLocaleTimeString()}`)

  // ── GROUP 1: Server reachability ─────────────────────────────────────────
  group('GROUP 1: Server Reachability')

  let allData, lockPick, dogPick, propData

  try {
    allData = await get('/data')
    pass('SRV-001', `Server is up — /data responded`)
  } catch (e) {
    fail('SRV-001', `Server is DOWN — ${e.message}`)
    console.log('\n  Cannot continue without server. Start it with: node server.js\n')
    process.exit(1)
  }

  // ── GROUP 2: Today's picks exist ─────────────────────────────────────────
  group('GROUP 2: Today\'s Picks Loaded from Server')

  lockPick = allData.app?.picks?.[today] ?? null
  dogPick  = allData.dog?.picks?.[today]  ?? null

  if (lockPick) {
    pass('INIT-001', `todayLock exists — team: "${lockPick.team}", gameId: ${lockPick.gameId}, sport: ${lockPick.sport}`)
  } else {
    warn('INIT-001', `No lock pick for today (${today}) — make a lock pick first to test props`)
  }

  if (dogPick) {
    pass('INIT-002', `todayDog exists  — team: "${dogPick.team}", gameId: ${dogPick.gameId}`)
  } else {
    warn('INIT-002', `No dog pick for today (${today}) — make a dog pick first to test dog props`)
  }

  if (lockPick && dogPick) {
    if (lockPick.gameId === dogPick.gameId) {
      warn('INIT-003', `Lock and Dog are the SAME game (gameId: ${lockPick.gameId}) — dog props section will be hidden by design`)
    } else {
      pass('INIT-003', `Lock and Dog are DIFFERENT games — dog props section should show`)
      console.log(`           Lock: ${lockPick.away} @ ${lockPick.home}  (${lockPick.gameId})`)
      console.log(`           Dog : ${dogPick.away}  @ ${dogPick.home}   (${dogPick.gameId})`)
    }
  }

  // ── GROUP 3: DK Props data ────────────────────────────────────────────────
  group('GROUP 3: DraftKings Props Data')

  if (!lockPick) {
    warn('PROPS-001', 'Skipping props tests — no lock pick found')
  } else {
    try {
      propData = await get(`/dk-props?sport=${lockPick.sport}`)
      pass('PROPS-001', `/dk-props?sport=${lockPick.sport} responded`)
    } catch (e) {
      fail('PROPS-001', `dk-props endpoint failed — ${e.message}`)
      propData = null
    }

    if (propData) {
      const sportData = propData[lockPick.sport]
      const allProps = sportData?.props || []
      const strikeoutProps = allProps.filter(p => p.isMainLine && String(p.subcategoryId) === '15221')

      if (strikeoutProps.length > 0) {
        pass('PROPS-002', `${strikeoutProps.length} strikeout props found across all games`)
      } else {
        fail('PROPS-002', `No strikeout props (subcategoryId=15221) found — run dk_scraper.py`)
      }

      // ── GROUP 4: Lock game matching ─────────────────────────────────────
      group('GROUP 4: Lock Game Pitcher Matching')

      const lockHomeL = (lockPick.home || '').toLowerCase()
      const lockAwayL = (lockPick.away || '').toLowerCase()
      const lockProps = strikeoutProps.filter(p => matchesGame(p, lockHomeL, lockAwayL))

      if (lockProps.length === 0) {
        fail('LOCK-001', `No props matched lock game (${lockPick.away} @ ${lockPick.home})`)
        console.log(`           Available games in DK data:`)
        const games = [...new Set(strikeoutProps.map(p => `${p.away} @ ${p.home}`))]
        games.forEach(g => console.log(`             • ${g}`))
        console.log(`           lastWord(lockHome)="${lastWord(lockHomeL)}" lastWord(lockAway)="${lastWord(lockAwayL)}"`)
      } else {
        const uniquePlayers = [...new Set(lockProps.map(p => p.player))]
        pass('LOCK-001', `${lockProps.length} lock props matched, ${uniquePlayers.length} unique pitchers`)
        uniquePlayers.forEach(p => {
          const prop = lockProps.find(lp => lp.player === p)
          console.log(`             • ${p} — line ${prop.line} (⬆ ${prop.overOdds > 0 ? '+':''}${prop.overOdds} / ⬇ ${prop.underOdds > 0 ? '+':''}${prop.underOdds})`)
        })
        if (uniquePlayers.length < 2) {
          warn('LOCK-002', `Only ${uniquePlayers.length} pitcher(s) found for lock game — expected 2`)
        } else {
          pass('LOCK-002', `Both pitchers found for lock game ✓`)
        }
      }

      // ── GROUP 5: Dog game matching ──────────────────────────────────────
      group('GROUP 5: Dog Game Pitcher Matching')

      if (!dogPick) {
        warn('DOG-001', 'Skipping dog matching — no dog pick')
      } else if (dogPick.gameId === lockPick.gameId) {
        warn('DOG-001', 'Dog is same game as lock — dog section hidden by design, skipping')
      } else {
        const dogHomeL = (dogPick.home || '').toLowerCase()
        const dogAwayL = (dogPick.away || '').toLowerCase()
        const dogProps = strikeoutProps.filter(p => matchesGame(p, dogHomeL, dogAwayL))

        if (dogProps.length === 0) {
          fail('DOG-001', `No props matched dog game (${dogPick.away} @ ${dogPick.home})`)
          console.log(`           Available games in DK data:`)
          const games = [...new Set(strikeoutProps.map(p => `${p.away} @ ${p.home}`))]
          games.forEach(g => console.log(`             • ${g}`))
          console.log(`           lastWord(dogHome)="${lastWord(dogHomeL)}" lastWord(dogAway)="${lastWord(dogAwayL)}"`)
        } else {
          const uniquePlayers = [...new Set(dogProps.map(p => p.player))]
          pass('DOG-001', `${dogProps.length} dog props matched, ${uniquePlayers.length} unique pitchers`)
          uniquePlayers.forEach(p => {
            const prop = dogProps.find(dp => dp.player === p)
            console.log(`             • ${p} — line ${prop.line} (⬆ ${prop.overOdds > 0 ? '+':''}${prop.overOdds} / ⬇ ${prop.underOdds > 0 ? '+':''}${prop.underOdds})`)
          })
          if (uniquePlayers.length < 2) {
            warn('DOG-002', `Only ${uniquePlayers.length} pitcher(s) found for dog game — expected 2`)
          } else {
            pass('DOG-002', `Both pitchers found for dog game ✓`)
          }

          const totalPickers = [...new Set([...lockProps, ...dogProps].map(p => p.player))].length
          if (totalPickers === 4) {
            pass('DOG-003', `Total 4 unique pitchers across lock + dog games ✓`)
          } else {
            warn('DOG-003', `Expected 4 total pitchers, found ${totalPickers} (lock + dog combined)`)
          }
        }
      }
    }
  }

  // ── GROUP 6: Already-picked filtering ────────────────────────────────────
  group('GROUP 6: Already-Picked Filtering')

  const propPicks = allData.propPicks?.[today] || {}
  const pickedKeys = Object.keys(propPicks)

  if (pickedKeys.length === 0) {
    warn('FILTER-001', `No prop picks made today — pick a pitcher to test filtering`)
  } else {
    pass('FILTER-001', `${pickedKeys.length} prop pick(s) made today:`)
    pickedKeys.forEach(k => {
      const pick = propPicks[k]
      console.log(`             • ${pick.player} — ${pick.side} ${pick.line} (${pick.result === null ? '⏳ pending' : pick.result})`)
    })

    if (propData && lockPick) {
      const sportData = propData[lockPick.sport]
      const allProps = sportData?.props || []
      const strikeoutProps = allProps.filter(p => p.isMainLine && String(p.subcategoryId) === '15221')
      const lockHomeL = (lockPick.home || '').toLowerCase()
      const lockAwayL = (lockPick.away || '').toLowerCase()
      const lockProps = strikeoutProps.filter(p => matchesGame(p, lockHomeL, lockAwayL))

      const alreadyPickedKeys = new Set(pickedKeys)
      const remaining = lockProps.filter(p => !alreadyPickedKeys.has(`${p.player}||pitcher_strikeouts`))

      pass('FILTER-002', `After filtering: ${remaining.length} lock pitcher(s) still available to pick`)
      if (remaining.length === 0) {
        pass('FILTER-003', `All lock game props picked — "All lock game props picked ✓" should show`)
      }
    }
  }

  // ── SUMMARY ───────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(50)}`)
  console.log(`  Results: ✅ ${passed} passed  ❌ ${failed} failed  ⚠️  ${warned} warnings`)
  if (failed === 0 && warned === 0) {
    console.log(`  🎉 All good — props fetch logic looks solid\n`)
  } else if (failed === 0) {
    console.log(`  ✅ No failures — warnings just mean no data yet for that case\n`)
  } else {
    console.log(`  ❌ Fix the failures above before expecting props to work\n`)
  }
}

runAll().catch(e => {
  console.error('\n💥 Test runner crashed:', e.message)
  process.exit(1)
})
