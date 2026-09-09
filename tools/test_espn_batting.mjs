// Run: node test_espn_batting.mjs
// Requires Node 18+

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb'

const TEST_GAMES = [
  { date: '2026-03-28', gameId: '401814718', home: 'Los Angeles Dodgers',  away: 'Arizona Diamondbacks' },
  { date: '2026-03-27', gameId: '401814703', home: 'Houston Astros',        away: 'Los Angeles Angels' },
]

async function runTest({ date, gameId, home, away }) {
  console.log(`\n${'='.repeat(64)}`)
  console.log(`GAME : ${away} @ ${home} (${date})  ID: ${gameId}`)
  console.log('='.repeat(64))

  const res = await fetch(`${ESPN_BASE}/summary?event=${gameId}`)
  const data = await res.json()
  const playerGroups = data.boxscore?.players || []

  console.log(`\nplayerGroups.length: ${playerGroups.length}`)

  // 1. Raw teamGroup keys & homeAway paths
  console.log('\n── teamGroup top-level keys + homeAway candidates ──')
  playerGroups.forEach((tg, i) => {
    console.log(`  group[${i}] keys: ${Object.keys(tg).join(', ')}`)
    console.log(`    .homeAway        = ${JSON.stringify(tg.homeAway)}`)
    console.log(`    .team?.homeAway  = ${JSON.stringify(tg.team?.homeAway)}`)
    console.log(`    .team?.name      = ${JSON.stringify(tg.team?.name)}`)
    console.log(`    statistics count = ${tg.statistics?.length}`)
  })

  // 2. All stat group type/name fields
  console.log('\n── All stat group identifiers ──')
  playerGroups.forEach((tg, i) => {
    ;(tg.statistics || []).forEach((sg, j) => {
      console.log(`  [group${i}][stat${j}] type:"${sg.type}" name:"${sg.name}" abbr:"${sg.abbreviation}" athletes:${sg.athletes?.length}`)
    })
  })

  // 3. Simulate exact extraction logic
  console.log('\n── Simulating batterMap extraction ──')
  const batterMap = { home: [], away: [] }
  playerGroups.forEach(teamGroup => {
    const side = teamGroup.team?.homeAway || teamGroup.homeAway
    console.log(`  resolved side: "${side}"`)
    if (!batterMap[side]) {
      console.log(`  X side "${side}" not in batterMap — SKIPPED`)
      return
    }
    ;(teamGroup.statistics || []).forEach(sg => {
      const sgType = (sg.type || sg.name || sg.abbreviation || '').toLowerCase()
      const matched = sgType.includes('batting') || sgType.includes('hitting')
      console.log(`    stat group type:"${sg.type}" matched:${matched}`)
      if (!matched) return
      const labels = sg.labels || []
      console.log(`    labels: ${JSON.stringify(labels)}`)
      console.log(`    athletes: ${sg.athletes?.length}`)
      ;(sg.athletes || []).forEach(a => {
        const ath = a.athlete || {}
        const stats = {}
        labels.forEach((lbl, i) => { stats[lbl] = a.stats?.[i] })
        batterMap[side].push({
          name: ath.displayName,
          batOrder: a.batOrder != null ? parseInt(a.batOrder, 10) : null,
          position: ath.position?.abbreviation || null,
          stats,
        })
      })
    })
    batterMap[side].sort((a, b) => (a.batOrder ?? 99) - (b.batOrder ?? 99))
  })

  // 4. Final result
  console.log('\n── FINAL batterMap ──')
  console.log(`  home: ${batterMap.home.length} batters`)
  batterMap.home.slice(0, 3).forEach(b => console.log(`    ${b.batOrder}. ${b.name} (${b.position}) ${JSON.stringify(b.stats)}`))
  console.log(`  away: ${batterMap.away.length} batters`)
  batterMap.away.slice(0, 3).forEach(b => console.log(`    ${b.batOrder}. ${b.name} (${b.position}) ${JSON.stringify(b.stats)}`))

  if (!batterMap.home.length && !batterMap.away.length) {
    console.log('\nEMPTY — dumping raw playerGroups[0]:')
    console.log(JSON.stringify(playerGroups[0], null, 2).slice(0, 2000))
  } else {
    console.log('\nSUCCESS')
  }
}

for (const g of TEST_GAMES) await runTest(g)
console.log('\n── ALL DONE ──')
