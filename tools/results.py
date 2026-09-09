#!/usr/bin/env python3
"""
results.py — Checks ESPN for final scores and marks picks W/L in betonme.db.
Wired into /scrape-now in server.js so it runs automatically on every refresh.

Handles all bet types:
  - Moneyline  (no marketKey, or marketKey == 'h2h')
  - Spread     (marketKey == 'spreads') — needs team, point (e.g. -3.5)
  - Totals     (marketKey == 'totals') — needs point (line), side ('over'/'under')
  - Props      (marketKey == 'pitcher_strikeouts' | 'player_points') — needs player, line, side

Only processes picks with result == null or result == "" (never overwrites W/L).
Reads and writes ONLY to betonme.db — savedata.json is never touched.
"""

import json
import os
import sys
import sqlite3
from datetime import datetime, timedelta, timezone
from urllib.request import urlopen
from urllib.error import URLError

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH     = os.path.join(SCRIPT_DIR, 'db', 'betonme.db')

# Fallback: check .env for DB_FILE override
_env_path = os.path.join(SCRIPT_DIR, '.env')
if os.path.exists(_env_path):
    for line in open(_env_path):
        line = line.strip()
        if line.startswith('DB_FILE='):
            val = line.split('=', 1)[1].strip().strip('"').strip("'")
            if val:
                DB_PATH = os.path.join(SCRIPT_DIR, 'db', val)

ESPN_SCOREBOARD = {
    'NBA': 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard',
    'MLB': 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard',
    'NFL': 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard',
    'NHL': 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard',
}

ESPN_BOXSCORE = {
    'NBA': 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event={}',
    'MLB': 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event={}',
}

# Prop marketKey → ESPN boxscore key name + which stat group (pitcher/batter)
# ESPN pitcher group identified by first key 'fullInnings.partInnings'
# ESPN batter group identified by first key 'hits-atBats'
PROP_STAT_MAP = {
    'pitcher_strikeouts':    {'sport': 'MLB', 'espn_stat_name': 'strikeouts',  'group': 'pitcher'},
    'pitcher_outs_recorded': {'sport': 'MLB', 'espn_stat_name': 'fullInnings.partInnings', 'group': 'pitcher'},  # IP * 3 + partial
    'pitcher_hits_allowed':  {'sport': 'MLB', 'espn_stat_name': 'hits',        'group': 'pitcher'},
    'pitcher_walks':         {'sport': 'MLB', 'espn_stat_name': 'walks',       'group': 'pitcher'},
    'pitcher_earned_runs':   {'sport': 'MLB', 'espn_stat_name': 'earnedRuns',  'group': 'pitcher'},
    'batter_home_runs':      {'sport': 'MLB', 'espn_stat_name': 'homeRuns',    'group': 'batter'},
    'batter_hits':           {'sport': 'MLB', 'espn_stat_name': 'hits',        'group': 'batter'},
    'batter_rbis':           {'sport': 'MLB', 'espn_stat_name': 'RBIs',        'group': 'batter'},
    'batter_total_bases':    {'sport': 'MLB', 'espn_stat_name': 'slugAvg',     'group': 'batter'},  # no direct TB; skip for now
    'player_points':         {'sport': 'NBA', 'espn_stat_name': 'points',      'group': None},
    'player_rebounds':       {'sport': 'NBA', 'espn_stat_name': 'rebounds',    'group': None},
    'player_assists':        {'sport': 'NBA', 'espn_stat_name': 'assists',     'group': None},
    # Raw subcategoryId fallbacks
    '15221': {'sport': 'MLB', 'espn_stat_name': 'strikeouts', 'group': 'pitcher'},
    '17413': {'sport': 'MLB', 'espn_stat_name': 'fullInnings.partInnings', 'group': 'pitcher'},
    '17319': {'sport': 'MLB', 'espn_stat_name': 'homeRuns',  'group': 'batter'},
    '17320': {'sport': 'MLB', 'espn_stat_name': 'hits',      'group': 'batter'},
}

# ─────────────────────────── DB I/O ─────────────────────────────────────────

def get_db():
    if not os.path.exists(DB_PATH):
        raise FileNotFoundError(f'DB not found: {DB_PATH} — run node db/migrate.js first')
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def load_savedata():
    """Load predictions and propPick from DB in the same shape results.py expects."""
    conn = get_db()
    c = conn.cursor()

    # Load parlays (predictions only — that's what results.py grades)
    c.execute("SELECT id, date, type, result FROM parlays WHERE type IN ('prediction','lay','allin')")
    parlays = c.fetchall()

    c.execute("SELECT * FROM parlay_legs")
    all_legs = c.fetchall()
    legs_by_parlay = {}
    for leg in all_legs:
        pid = leg['parlay_id']
        if pid not in legs_by_parlay:
            legs_by_parlay[pid] = []
        legs_by_parlay[pid].append({
            'gameId': leg['game_id'], 'sport': leg['sport'],
            'home': leg['home'], 'away': leg['away'],
            'team': leg['team'], 'odds': leg['odds'],
            'market': leg['market'], 'point': leg['point'],
            'isLock': bool(leg['is_lock']), 'isDog': bool(leg['is_dog']),
            'result': leg['result'],
        })

    predictions = {}
    for p in parlays:
        entry = {'legs': legs_by_parlay.get(p['id'], []), 'result': p['result']}
        if p['type'] == 'prediction':
            predictions[p['date']] = entry

    # Load propPick from props table
    c.execute("SELECT * FROM props WHERE result IS NULL OR result = ''")
    prop_rows = c.fetchall()
    prop_pick = {}
    for row in prop_rows:
        date = row['date']
        if date not in prop_pick:
            prop_pick[date] = {}
        key = f"{row['team']}||{row['market_key']}"
        prop_pick[date][key] = {
            'gameId': row['game_id'], 'sport': row['sport'],
            'team': row['team'], 'player': row['player'],
            'marketKey': row['market_key'], 'label': row['label'],
            'line': row['line'], 'side': row['side'],
            'odds': row['odds'], 'result': row['result'],
        }

    conn.close()
    return {'predictions': predictions, 'propPick': prop_pick}

def save_savedata(data):
    """Write graded results back to DB — never touches savedata.json."""
    conn = get_db()
    c = conn.cursor()

    # Update parlay leg results
    predictions = data.get('predictions', {})
    for date, parlay in predictions.items():
        # Find the parlay row id
        c.execute("SELECT id FROM parlays WHERE date=? AND type='prediction'", (date,))
        row = c.fetchone()
        if not row:
            continue
        parlay_id = row['id']
        # Update overall parlay result if set
        if parlay.get('result') is not None:
            c.execute("UPDATE parlays SET result=? WHERE id=?", (parlay['result'], parlay_id))
        # Update individual leg results
        for leg in parlay.get('legs', []):
            if leg.get('result') is not None and leg.get('gameId'):
                c.execute(
                    "UPDATE parlay_legs SET result=? WHERE parlay_id=? AND game_id=?",
                    (leg['result'], parlay_id, leg['gameId'])
                )

    # Update prop results
    prop_pick = data.get('propPick', {})
    for date, picks in prop_pick.items():
        for key, pick in picks.items():
            if pick.get('result') is not None:
                team = pick.get('team')
                mk = pick.get('marketKey')
                c.execute(
                    "UPDATE props SET result=? WHERE date=? AND team=? AND market_key=?",
                    (pick['result'], date, team, mk)
                )

    conn.commit()
    conn.close()
    print(f'[results] DB updated — savedata.json not touched')

def fetch_json(url):
    try:
        with urlopen(url, timeout=10) as r:
            return json.loads(r.read())
    except (URLError, Exception) as e:
        print(f'  [results] Fetch error {url[:60]}: {e}')
        return None

# ─────────────────────── Scoreboard parsing ─────────────────────────────────

def fetch_scoreboard(sport):
    url = ESPN_SCOREBOARD.get(sport.upper())
    if not url:
        return []
    data = fetch_json(url)
    return data.get('events', []) if data else []

def parse_scoreboard(events):
    """
    Returns list of game dicts with scores, winner, margin, and total.
    """
    games = []
    for ev in events:
        comps = ev.get('competitions', [{}])[0]
        status = comps.get('status', {})
        completed = status.get('type', {}).get('completed', False)
        teams = comps.get('competitors', [])
        home = next((t for t in teams if t['homeAway'] == 'home'), None)
        away = next((t for t in teams if t['homeAway'] == 'away'), None)
        if not home or not away:
            continue

        home_score = int(home.get('score', 0) or 0)
        away_score = int(away.get('score', 0) or 0)
        home_name  = home['team']['displayName']
        away_name  = away['team']['displayName']

        winner = None
        if completed:
            if home_score > away_score:
                winner = home_name
            elif away_score > home_score:
                winner = away_name

        games.append({
            'id':            ev['id'],
            'home':          home_name,
            'away':          away_name,
            'homeScore':     home_score,
            'awayScore':     away_score,
            'completed':     completed,
            'winner':        winner,
            'homeWinMargin': home_score - away_score,  # positive = home won
            'totalScore':    home_score + away_score,
        })
    return games

# ─────────────────────── Team fuzzy match ───────────────────────────────────

def team_matches(pick_team, espn_name):
    """True if pick_team loosely matches espn_name."""
    pt = (pick_team or '').lower().strip()
    en = (espn_name or '').lower().strip()
    if not pt or not en:
        return False
    if pt == en or pt in en or en in pt:
        return True
    if en.split()[-1] == pt.split()[-1]:
        return True
    return False

def fetch_game_by_event_id(sport, event_id):
    """
    Fetch a single completed game directly from ESPN summary endpoint.
    Works even after the game rolls off the scoreboard.
    Returns a parsed game dict (same shape as parse_scoreboard output), or None.
    """
    url_tmpl = ESPN_BOXSCORE.get(sport.upper())
    if not url_tmpl or not event_id:
        return None
    data = fetch_json(url_tmpl.format(event_id))
    if not data:
        return None

    # Pull score/completion from the header competitions block
    header = data.get('header', {})
    comps  = (header.get('competitions') or [{}])[0]
    status = comps.get('status', {})
    completed = status.get('type', {}).get('completed', False)
    teams  = comps.get('competitors', [])

    home = next((t for t in teams if t.get('homeAway') == 'home'), None)
    away = next((t for t in teams if t.get('homeAway') == 'away'), None)
    if not home or not away:
        return None

    home_score = int(home.get('score', 0) or 0)
    away_score = int(away.get('score', 0) or 0)
    home_name  = home.get('team', {}).get('displayName', '')
    away_name  = away.get('team', {}).get('displayName', '')

    winner = None
    if completed:
        if home_score > away_score:
            winner = home_name
        elif away_score > home_score:
            winner = away_name

    return {
        'id':            str(event_id),
        'home':          home_name,
        'away':          away_name,
        'homeScore':     home_score,
        'awayScore':     away_score,
        'completed':     completed,
        'winner':        winner,
        'homeWinMargin': home_score - away_score,
        'totalScore':    home_score + away_score,
        '_summary':      data,   # keep raw for prop boxscore reuse
    }


def find_game(leg, games, sport=None, event_id_cache=None):
    """
    Match a leg to an ESPN game by home/away team names.
    Falls back to:
      1. team name match against any game on the scoreboard
      2. direct event ID lookup (handles completed/rolled-off games)
    """
    home_pick = leg.get('home', '')
    away_pick = leg.get('away', '')

    # Primary: match by home + away
    if home_pick and away_pick:
        for g in games:
            if team_matches(home_pick, g['home']) and team_matches(away_pick, g['away']):
                return g
            if team_matches(home_pick, g['away']) and team_matches(away_pick, g['home']):
                return g

    # Fallback 1: match by team name alone (when home/away not stored)
    team_pick = leg.get('team', '')
    if team_pick:
        for g in games:
            if team_matches(team_pick, g['home']) or team_matches(team_pick, g['away']):
                return g

    # Fallback 2: direct event ID lookup (game rolled off scoreboard)
    game_id = leg.get('gameId') or leg.get('espnId')
    if game_id and sport:
        cache_key = f'game_{sport}_{game_id}'
        if event_id_cache is not None and cache_key in event_id_cache:
            return event_id_cache[cache_key]
        print(f'    [find_game] Scoreboard miss — fetching by event ID {game_id}...')
        game = fetch_game_by_event_id(sport, game_id)
        if game and event_id_cache is not None:
            event_id_cache[cache_key] = game
        return game

    return None

# ─────────────────────── Result resolvers ───────────────────────────────────

def resolve_moneyline(leg, game):
    """Pick a team to win outright."""
    if not game['completed'] or game['winner'] is None:
        return None
    picked = leg.get('team', '')
    if not picked:
        return None
    return 'W' if team_matches(picked, game['winner']) else 'L'


def resolve_spread(leg, game):
    """
    Spread bet: does the picked team cover their spread?

    Leg fields:
      team  — team they backed
      point — spread from that team's perspective (e.g. -3.5 = must win by 4+)

    If point is missing we can't grade it — return None.
    Push (margin exactly cancels spread) → None.
    """
    if not game['completed']:
        return None

    picked_team = leg.get('team', '')
    point = leg.get('point')

    if not picked_team or point is None:
        return None

    try:
        point = float(point)
    except (TypeError, ValueError):
        return None

    is_home = team_matches(picked_team, game['home'])
    is_away = team_matches(picked_team, game['away'])

    if not is_home and not is_away:
        print(f'    [spread] Could not match {picked_team!r} → falling back to ML')
        return resolve_moneyline(leg, game)

    home_margin = game['homeWinMargin']  # positive = home won

    # Cover check: picked_team_margin + point > 0
    if is_home:
        cover_margin = home_margin + point
    else:
        cover_margin = (-home_margin) + point

    if cover_margin == 0:
        return None  # push

    return 'W' if cover_margin > 0 else 'L'


def resolve_total(leg, game):
    """
    Over/Under on combined score.

    Leg fields:
      side  — 'over' or 'under'
      point — the total line (e.g. 220.5)
      line  — fallback if point not present
    """
    if not game['completed']:
        return None

    side  = (leg.get('side') or '').lower()
    point = leg.get('point') if leg.get('point') is not None else leg.get('line')

    if not side or point is None:
        return None

    try:
        line = float(point)
    except (TypeError, ValueError):
        return None

    total = game['totalScore']
    if total == line:
        return None  # push

    if side == 'over':
        return 'W' if total > line else 'L'
    elif side == 'under':
        return 'W' if total < line else 'L'
    return None


def fetch_box_score(sport, espn_event_id):
    url_tmpl = ESPN_BOXSCORE.get(sport.upper())
    if not url_tmpl:
        return None
    return fetch_json(url_tmpl.format(espn_event_id))


def _name_matches(pick_name, display_name, short_name=''):
    """Fuzzy player name match — last name or full name."""
    pn = (pick_name or '').lower().strip()
    dn = (display_name or '').lower().strip()
    sn = (short_name or '').lower().strip()
    if not pn:
        return False
    if pn == dn or pn == sn:
        return True
    pn_last = pn.split()[-1]
    dn_last = dn.split()[-1] if dn else ''
    if pn_last and pn_last == dn_last:
        return True
    if pn in dn or dn in pn:
        return True
    return False


def extract_player_stat(box_data, player_name, stat_abbr, group=None):
    """
    Walk ESPN summary boxscore → find player → return numeric stat value.
    stat_abbr: ESPN key name (e.g. 'strikeouts', 'hits', 'earnedRuns')
    group: 'pitcher' | 'batter' | None
    """
    if not box_data:
        return None

    def is_pitcher_group(keys):
        return keys and keys[0] == 'fullInnings.partInnings'

    def is_batter_group(keys):
        return keys and keys[0] == 'hits-atBats'

    boxscore = box_data.get('boxscore', {})
    for section in boxscore.get('players', []):
        for stat_group in section.get('statistics', []):
            keys = stat_group.get('keys') or []
            if group == 'pitcher' and not is_pitcher_group(keys):
                continue
            if group == 'batter' and not is_batter_group(keys):
                continue
            if stat_abbr not in keys:
                continue
            stat_idx = keys.index(stat_abbr)
            for entry in stat_group.get('athletes', []):
                athlete = entry.get('athlete', {})
                if not _name_matches(player_name,
                                     athlete.get('displayName', ''),
                                     athlete.get('shortName', '')):
                    continue
                stats = entry.get('stats', [])
                if stat_idx >= len(stats):
                    return None
                raw = stats[stat_idx]
                # IP stored as '4.1' where .1 = 1 out → convert to total outs
                if stat_abbr == 'fullInnings.partInnings':
                    try:
                        parts = str(raw).split('.')
                        return float(int(parts[0]) * 3 + (int(parts[1]) if len(parts) > 1 else 0))
                    except (ValueError, TypeError, IndexError):
                        return None
                try:
                    return float(raw)
                except (ValueError, TypeError):
                    return None
    return None


def resolve_prop(leg, games, box_cache, event_id_cache=None):
    """
    Player prop resolution via ESPN box score.
    Falls back to direct event ID lookup if game not on scoreboard.
    """
    market_key = leg.get('marketKey', '')
    prop_cfg   = PROP_STAT_MAP.get(market_key)
    if not prop_cfg:
        return None

    player = leg.get('player', '')
    line   = leg.get('line')
    side   = (leg.get('side') or '').lower()

    if not player or line is None or not side:
        return None

    try:
        line = float(line)
    except (TypeError, ValueError):
        return None

    sport = leg.get('sport', prop_cfg['sport']).upper()
    game  = find_game(leg, games, sport=sport, event_id_cache=event_id_cache)
    if not game or not game['completed']:
        return None

    cache_key = f'{sport}_{game["id"]}'

    if cache_key not in box_cache:
        if game.get('_summary'):
            box_cache[cache_key] = game['_summary']
        else:
            print(f'    [prop] Fetching box score for {game["home"]} vs {game["away"]}...')
            box_cache[cache_key] = fetch_box_score(sport, game['id'])

    stat_val = extract_player_stat(box_cache[cache_key], player, prop_cfg['espn_stat_name'], group=prop_cfg.get('group'))

    if stat_val is None:
        print(f'    [prop] Stat {prop_cfg["espn_stat_name"]!r} not found for {player!r}')
        return None

    print(f'    [prop] {player} {prop_cfg["espn_stat_name"]} = {stat_val} (line {line} {side})')

    if stat_val == line:
        return None  # push
    if side == 'over':
        return 'W' if stat_val > line else 'L'
    elif side == 'under':
        return 'W' if stat_val < line else 'L'
    return None

# ─────────────────────── Main dispatch ──────────────────────────────────────

def resolve_leg(leg, games, box_cache, event_id_cache=None):
    """
    Route to the correct resolver based on marketKey.
    Returns 'W', 'L', or None (incomplete / push / unresolvable).
    """
    market_key = (leg.get('marketKey') or '').lower()

    if market_key in ('spreads', 'spread', 'runline', 'puckline', 'run_line', 'puck_line'):
        game = find_game(leg, games, sport=(leg.get("sport") or "NBA").upper(), event_id_cache=event_id_cache)
        if not game:
            return None
        result = resolve_spread(leg, game)
        if result:
            print(f'    [spread] {leg.get("team")} ({float(leg.get("point", 0)):+g}) → {result} '
                  f'({game["home"]} {game["homeScore"]} - {game["awayScore"]} {game["away"]})')
        return result

    elif market_key in ('totals', 'total', 'ou', 'over_under'):
        game = find_game(leg, games, sport=(leg.get("sport") or "NBA").upper(), event_id_cache=event_id_cache)
        if not game:
            return None
        result = resolve_total(leg, game)
        if result:
            line = leg.get('point') or leg.get('line', '?')
            print(f'    [total]  {(leg.get("side") or "").upper()} {line} → {result} '
                  f'(actual {game["totalScore"]})')
        return result

    elif market_key in PROP_STAT_MAP:
        return resolve_prop(leg, games, box_cache, event_id_cache=event_id_cache)

    else:
        # Default: moneyline (marketKey == 'h2h' or empty)
        game = find_game(leg, games, sport=(leg.get("sport") or "NBA").upper(), event_id_cache=event_id_cache)
        if not game:
            return None
        result = resolve_moneyline(leg, game)
        if result:
            print(f'    [ml]     {leg.get("team")} → {result} '
                  f'({game["home"]} {game["homeScore"]} - {game["awayScore"]} {game["away"]})')
        return result

# ─────────────────────── Orchestration ──────────────────────────────────────

def process_predictions(predictions, scoreboard_cache, box_cache, event_id_cache=None):
    updated = 0
    today   = datetime.now(timezone.utc).date()
    cutoff  = today - timedelta(days=3)

    for date_str, day_data in predictions.items():
        try:
            pick_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            continue
        if pick_date < cutoff or pick_date > today:
            continue

        legs = day_data.get('legs', [])
        for leg in legs:
            if leg.get('result') not in (None, '', 'null'):
                continue  # already graded

            sport = (leg.get('sport') or 'NBA').upper()
            if sport not in scoreboard_cache:
                print(f'  [results] Fetching {sport} scoreboard...')
                scoreboard_cache[sport] = parse_scoreboard(fetch_scoreboard(sport))

            result = resolve_leg(leg, scoreboard_cache[sport], box_cache, event_id_cache=event_id_cache)

            if result:
                leg['result'] = result
                updated += 1

    return updated


def process_prop_picks(prop_picks, scoreboard_cache, box_cache, event_id_cache=None):
    """
    Grade propPick entries in savedata.
    Structure: { 'YYYY-MM-DD': { 'Player||marketKey': { player, line, side, marketKey, sport, home, away, result } } }
    """
    updated = 0
    today   = datetime.now(timezone.utc).date()
    cutoff  = today - timedelta(days=3)

    for date_str, day_picks in prop_picks.items():
        try:
            pick_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            continue
        if pick_date < cutoff or pick_date > today:
            continue

        for pick_key, pick in day_picks.items():
            if not pick or pick.get('result') not in (None, '', 'null'):
                continue  # already graded or empty

            market_key = pick.get('marketKey', '')
            prop_cfg   = PROP_STAT_MAP.get(market_key)
            if not prop_cfg:
                print(f'  [prop_picks] Unknown marketKey {market_key!r} — skipping')
                continue

            sport = pick.get('sport', prop_cfg['sport']).upper()
            if sport not in scoreboard_cache:
                print(f'  [results] Fetching {sport} scoreboard...')
                scoreboard_cache[sport] = parse_scoreboard(fetch_scoreboard(sport))

            result = resolve_prop(pick, scoreboard_cache[sport], box_cache, event_id_cache=event_id_cache)

            if result:
                pick['result'] = result
                updated += 1
                print(f'  [prop_picks] {pick.get("player")} {market_key} → {result}')

    return updated


def run():
    print('[results] Checking for unresolved picks...')
    data = load_savedata()
    predictions = data.get('predictions', {})
    prop_picks  = data.get('propPick', {})

    scoreboard_cache = {}
    box_cache        = {}
    event_id_cache   = {}

    updated = 0

    if predictions:
        updated += process_predictions(predictions, scoreboard_cache, box_cache, event_id_cache=event_id_cache)
    else:
        print('[results] No predictions found.')

    if prop_picks:
        updated += process_prop_picks(prop_picks, scoreboard_cache, box_cache, event_id_cache=event_id_cache)
    else:
        print('[results] No prop picks found.')

    if updated:
        data['predictions'] = predictions
        data['propPick']    = prop_picks
        save_savedata(data)
        print(f'[results] Updated {updated} pick(s) in DB')
    else:
        print('[results] No new results to update.')

    return updated


if __name__ == '__main__':
    count = run()
    sys.exit(0)
