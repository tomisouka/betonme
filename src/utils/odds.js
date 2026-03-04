// ─── SPORTS / SEASON ─────────────────────────────────────────────────────────

export function getSportsInSeason() {
  const month = new Date().getMonth() + 1
  const sports = []
  if (month >= 4 && month <= 10) sports.push({ key: 'baseball_mlb', label: 'MLB' })
  if (month >= 9 || month <= 2)  sports.push({ key: 'americanfootball_nfl', label: 'NFL' })
  if (month >= 10 || month <= 6) sports.push({ key: 'basketball_nba', label: 'NBA' })
  return sports.length ? sports : [{ key: 'baseball_mlb', label: 'MLB' }]
}

// ─── DATE HELPERS ─────────────────────────────────────────────────────────────

export function getTodayKey() {
  return new Date().toISOString().split('T')[0]
}

export function isSaturday() {
  return new Date().getDay() === 6
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