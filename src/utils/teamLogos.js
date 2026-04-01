// ── Team Logo Helper ──────────────────────────────────────────────────────────
// ESPN CDN logos. We match on the last word of the team name (e.g. "Astros").

const MLB_TEAM_IDS = {
  Angels: 3, Astros: 18, Athletics: 11, BlueJays: 14, Braves: 15,
  Brewers: 23, Cardinals: 24, Cubs: 16, Diamondbacks: 29, Dodgers: 19,
  Giants: 26, Guardians: 5, Mariners: 12, Marlins: 28, Mets: 21,
  Nationals: 20, Orioles: 1, Padres: 25, Phillies: 22, Pirates: 23,
  Rangers: 13, Rays: 30, RedSox: 2, Reds: 17, Rockies: 27, Royals: 7,
  Tigers: 6, Twins: 9, WhiteSox: 4, Yankees: 10, Jays: 14,
}

const NBA_TEAM_IDS = {
  Hawks: 1, Celtics: 2, Nets: 17, Hornets: 30, Bulls: 4, Cavaliers: 5,
  Mavericks: 6, Nuggets: 7, Pistons: 8, Warriors: 9, Rockets: 10,
  Pacers: 11, Clippers: 12, Lakers: 13, Grizzlies: 29, Heat: 14,
  Bucks: 15, Timberwolves: 16, Pelicans: 3, Knicks: 18, Thunder: 25,
  Magic: 19, Sixers: 20, Suns: 21, TrailBlazers: 22, Blazers: 22,
  Kings: 23, Spurs: 24, Raptors: 28, Jazz: 26, Wizards: 27,
}

const NFL_TEAM_IDS = {
  Cardinals: 22, Falcons: 1, Ravens: 33, Bills: 2, Panthers: 29,
  Bears: 3, Bengals: 4, Browns: 5, Cowboys: 6, Broncos: 7,
  Lions: 8, Packers: 9, Texans: 34, Colts: 11, Jaguars: 30,
  Chiefs: 12, Raiders: 13, Chargers: 24, Rams: 14, Dolphins: 15,
  Vikings: 16, Patriots: 17, Saints: 18, Giants: 19, Jets: 20,
  Eagles: 21, Steelers: 23, '49ers': 25, Seahawks: 26, Buccaneers: 27,
  Titans: 10, Commanders: 28,
}

/**
 * Returns the ESPN logo URL for a team.
 * @param {string} teamName - e.g. "Houston Astros", "SEA Mariners", "Astros"
 * @param {string} sport    - "MLB", "NBA", "NFL" (optional, auto-detected if omitted)
 * @param {number} size     - pixel size (default 40)
 */
export function getTeamLogoUrl(teamName, sport, size = 40) {
  if (!teamName) return null
  const word = teamName.trim().split(' ').pop()

  let id = null
  let league = null

  if (sport === 'MLB' || !sport) {
    id = MLB_TEAM_IDS[word]
    if (id) league = 'mlb'
  }
  if (!id && (sport === 'NBA' || !sport)) {
    id = NBA_TEAM_IDS[word]
    if (id) league = 'nba'
  }
  if (!id && (sport === 'NFL' || !sport)) {
    id = NFL_TEAM_IDS[word]
    if (id) league = 'nfl'
  }

  if (!id || !league) return null
  return `https://a.espncdn.com/i/teamlogos/${league}/500/${id}.png`
}

/**
 * Inline logo <img> element as a React-compatible style object.
 * Use as: <img src={getTeamLogoUrl(name, sport)} style={LOGO_STYLE} alt="" />
 */
export const LOGO_STYLE = {
  width: '28px',
  height: '28px',
  objectFit: 'contain',
  borderRadius: '50%',
  background: 'rgba(255,255,255,0.04)',
  flexShrink: 0,
}
