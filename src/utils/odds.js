const SERVER = import.meta.env.VITE_SERVER_HOST || 'http://127.0.0.1:3001'

// ─── SPORTS / SEASON ─────────────────────────────────────────────────────────

export function getSportsInSeason() {
  const month = new Date().getMonth() + 1
  const day = new Date().getDate()
  const sports = []
  // MLB: late March through October
  if ((month === 3 && day >= 20) || (month >= 4 && month <= 10)) sports.push({ key: 'baseball_mlb', label: 'MLB' })
  // NFL: September through February — skip if MLB still active to save credits
  const mlbActive = (month >= 4 && month <= 9) || (month === 3 && day >= 20)
  if ((month >= 9 || month <= 2) && !mlbActive) sports.push({ key: 'americanfootball_nfl', label: 'NFL' })
  // NBA: October through June — only add if under 2 sports already
  if ((month >= 10 || month <= 6) && sports.length < 2) sports.push({ key: 'basketball_nba', label: 'NBA' })
  return sports.length ? sports : [{ key: 'baseball_mlb', label: 'MLB' }]
}

// ─── ESPN GAMES FETCH (free, unlimited) ──────────────────────────────────────

const ESPN_SPORT_MAP = {
  baseball_mlb:        { endpoint: 'baseball/mlb',        label: 'MLB' },
  basketball_nba:      { endpoint: 'basketball/nba',       label: 'NBA' },
  americanfootball_nfl:{ endpoint: 'football/nfl',         label: 'NFL' },
}

// Normalize ESPN event → allGames-compatible shape
// Preserves: id, home_team, away_team, commence_time, sportLabel
// bookmakers is left empty — odds still come from the-odds-api for LockTab
function normalizeEspnEvent(event, sportLabel) {
  const comp = event.competitions?.[0]
  if (!comp) return null
  const home = comp.competitors?.find(c => c.homeAway === 'home')
  const away = comp.competitors?.find(c => c.homeAway === 'away')
  if (!home || !away) return null
  const getPitcher = c => {
    const p = c.probables?.[0]
    return p?.athlete?.displayName || p?.athlete?.shortName || null
  }
  return {
    id:            event.id,
    espnId:        event.id,
    home_team:     home.team.displayName,
    away_team:     away.team.displayName,
    homeLogo:      home.team.logo || home.team.logoDark || null,
    awayLogo:      away.team.logo || away.team.logoDark || null,
    homeAbbrev:    home.team.abbreviation || null,
    awayAbbrev:    away.team.abbreviation || null,
    commence_time: event.date,
    sportLabel,
    sportKey:      Object.keys(ESPN_SPORT_MAP).find(k => ESPN_SPORT_MAP[k].label === sportLabel) || '',
    bookmakers:    [],
    espnStatus:    event.competitions?.[0]?.status,
    espnScores:    { home: home.score, away: away.score },
    pitchers:      sportLabel === 'MLB' ? { home: getPitcher(home), away: getPitcher(away) } : null,
  }
}

export async function fetchGamesFromEspn() {
  const sports = getSportsInSeason()
  const allGames = []
  await Promise.all(sports.map(async sport => {
    const mapping = ESPN_SPORT_MAP[sport.key]
    if (!mapping) return
    try {
      const today = new Date()
      // Use local date to avoid UTC offset pushing us into tomorrow
      const localDate = (d) => `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`
      const from = localDate(today)
      const future = new Date(today.getTime() + 7 * 86400000)
      const to = localDate(future)
      const url = `https://site.api.espn.com/apis/site/v2/sports/${mapping.endpoint}/scoreboard?dates=${from}-${to}&limit=50`
      const res = await fetch(url)
      const data = await res.json()
      ;(data.events || []).forEach(event => {
        const game = normalizeEspnEvent(event, mapping.label)
        if (game) allGames.push(game)
      })
    } catch (e) {
      console.error(`[ESPN] ${sport.label} fetch failed`, e)
    }
  }))

  // Merge DK odds from local server — free, unlimited, no credits
  try {
    const dkRes = await fetch(`${SERVER}/dk-odds`)
    if (dkRes.ok) {
      const dkData = await dkRes.json()
      const dkGames = Object.values(dkData.sports || {}).flatMap(s => s.games || [])
      // Match DK games to ESPN games by team name, merge bookmakers
      allGames.forEach(espnGame => {
        const match = dkGames.find(dk => {
          const dkHome = dk.home_team.toLowerCase()
          const dkAway = dk.away_team.toLowerCase()
          const espnHome = espnGame.home_team.toLowerCase()
          const espnAway = espnGame.away_team.toLowerCase()
          return (espnHome.includes(dkHome.split(' ').pop()) || dkHome.includes(espnHome.split(' ').pop())) &&
                 (espnAway.includes(dkAway.split(' ').pop()) || dkAway.includes(espnAway.split(' ').pop()))
        })
        if (match) {
          espnGame.bookmakers = match.bookmakers || []
          // Also pull in pitcher and color data
          if (match._dk) {
            espnGame._dk = match._dk
          }
        }
      })
      console.log(`[DK] Merged odds for ${dkGames.length} games`)
    }
  } catch (e) {
    console.log('[DK] No local odds available (run dk_scraper.py to enable)')
  }

  return allGames
}


// ─── DATE HELPERS ─────────────────────────────────────────────────────────────

export function getDoubleheaderGameIds(games) {
  const groups = {}
  for (const g of games) {
    if (!g?.commence_time) continue
    const dateKey = new Date(g.commence_time).toDateString()
    const key = `${g.sportKey}|${g.home_team}|${g.away_team}|${dateKey}`
    ;(groups[key] ||= []).push(g.id)
  }
  const result = new Set()
  for (const ids of Object.values(groups)) {
    if (ids.length > 1) ids.forEach(id => result.add(id))
  }
  return result
}

export function getTodayKey() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function isSaturday() {
  return new Date().getDay() === 6
}

// Returns a human-readable date label: "Today · Mar 27 · 12:21 PM", etc.
export function getGameDateLabel(commenceTime) {
  if (!commenceTime) return ''
  const gameDate = new Date(commenceTime)
  const now = new Date()
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrowMidnight = new Date(todayMidnight.getTime() + 86400000)
  const gameMidnight = new Date(gameDate.getFullYear(), gameDate.getMonth(), gameDate.getDate())
  const timeStr = gameDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const dateStr = gameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (gameMidnight.getTime() === todayMidnight.getTime()) return `📅 Today · ${dateStr} · ${timeStr}`
  if (gameMidnight.getTime() === tomorrowMidnight.getTime()) return `🌅 Tomorrow · ${dateStr} · ${timeStr}`
  return '📅 ' + gameDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ` · ${timeStr}`
}

// ─── ODDS MATH ────────────────────────────────────────────────────────────────

// Detect decimal odds (e.g. 1.91) and convert to American (-110)
export function ensureAmerican(odds) {
  if (odds >= 1.01 && odds <= 20 && !Number.isInteger(odds)) {
    if (odds >= 2.0) return Math.round((odds - 1) * 100)
    else return Math.round(-100 / (odds - 1))
  }
  return odds
}

export function formatOdds(price) {
  price = ensureAmerican(price)
  return price > 0 ? `+${price}` : `${price}`
}

export function calcProfit(odds, stake = 1) {
  odds = ensureAmerican(odds)
  let profit
  if (odds > 0) profit = stake * (odds / 100)
  else profit = stake * (100 / Math.abs(odds))
  return +profit.toFixed(2)
}

export function calcPayout(odds, stake = 1) {
  return +(calcProfit(odds, stake) + stake).toFixed(2)
}

// Combine multiple American odds legs into a single American parlay odds number
export function combineParlayOdds(legOdds) {
  if (!legOdds.length) return null
  const decimal = legOdds.reduce((acc, o) => {
    o = ensureAmerican(o)
    const d = o > 0 ? (o / 100) + 1 : (100 / Math.abs(o)) + 1
    return acc * d
  }, 1)
  const american = decimal >= 2
    ? Math.round((decimal - 1) * 100)
    : Math.round(-100 / (decimal - 1))
  return american
}
// Fetch probable starting pitchers from ESPN MLB scoreboard
// Returns a map of { "Away Team Name": pitcherName, "Home Team Name": pitcherName }
// matched against a games list. Call once per session and cache in component state.
export async function fetchMlbProbablePitchers() {
  try {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '')
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=${today}`)
    const data = await res.json()
    const pitcherMap = {} // key: "teamName" -> pitcherName
    for (const event of (data.events || [])) {
      const comp = event.competitions?.[0]
      if (!comp) continue
      for (const competitor of (comp.competitors || [])) {
        const teamName = competitor.team?.displayName || competitor.team?.shortDisplayName || ''
        // probable pitcher lives in probables array
        const probable = competitor.probables?.[0]
        const name = probable?.athlete?.displayName || probable?.athlete?.shortName || null
        pitcherMap[teamName] = name || null
        // Also index by abbreviation for fuzzy matching
        const abbr = competitor.team?.abbreviation || ''
        if (abbr) pitcherMap[abbr] = name || null
      }
    }
    return pitcherMap
  } catch (e) {
    console.error('[ESPN pitchers] fetch failed', e)
    return {}
  }
}

// Fetch ESPN scoreboard for a specific sport and date string (YYYYMMDD)
// Used by DogTab to resolve past pick results
export async function fetchEspnDate(sportKey, dateStr) {
  // Accept both sportKey ('baseball_mlb') and sportLabel ('MLB')
  const LABEL_TO_KEY = { MLB: 'baseball_mlb', NBA: 'basketball_nba', NFL: 'americanfootball_nfl' }
  const resolvedKey = LABEL_TO_KEY[sportKey] || sportKey
  const mapping = ESPN_SPORT_MAP[resolvedKey]
  if (!mapping) return []
  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/${mapping.endpoint}/scoreboard?dates=${dateStr}`
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    return data.events || []
  } catch (e) {
    console.error(`[ESPN] fetchEspnDate failed for ${sportKey} ${dateStr}`, e)
    return []
  }
}

// Given a team name from the odds API and the ESPN pitcher map, return pitcher name or null
export function getProbablePitcher(teamName, pitcherMap) {
  if (!teamName || !pitcherMap) return null
  // Exact match first
  if (pitcherMap[teamName] !== undefined) return pitcherMap[teamName]
  const lower = teamName.toLowerCase()
  const lastWord = lower.split(' ').pop()  // e.g. "rockies", "marlins"
  // Last-word match against keys (most reliable for "Colorado Rockies" -> "Rockies")
  for (const [key, val] of Object.entries(pitcherMap)) {
    const kl = key.toLowerCase()
    const kLast = kl.split(' ').pop()
    if (lastWord && lastWord === kLast) return val
  }
  // Abbreviation match — only if key is 2-3 chars (pure abbrev, not a partial name)
  for (const [key, val] of Object.entries(pitcherMap)) {
    const kl = key.toLowerCase()
    if (kl.length <= 3 && lower.includes(kl)) return val
  }
  return null
}