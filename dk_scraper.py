#!/usr/bin/env python3
"""
dk_scraper.py — DraftKings sportsbook scraper for BetOnMe
Reverse-engineered from browser network traffic. No auth needed.
Writes dk_odds.json to the betonme directory.

Usage:
  python3 dk_scraper.py              # fetch once and save
  python3 dk_scraper.py --test       # print JSON to stdout, don't save
  python3 dk_scraper.py --watch      # fetch every 4 hours

pip install requests  (only dependency)
"""

import requests, json, time, sys, os
from datetime import datetime

OUTPUT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dk_odds.json')
WATCH_INTERVAL_HOURS = 0.5  # 30 minutes

# Exact headers from browser capture
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Content-Type': 'application/json charset=utf-8',
    'Origin': 'https://sportsbook.draftkings.com',
    'Referer': 'https://sportsbook.draftkings.com/',
    'Sec-Ch-Ua': '"Not:A-Brand";v="99", "Brave";v="145", "Chromium";v="145"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Linux"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
    'X-Client-Feature': 'leagueSubcategory',
    'X-Client-Name': 'web',
    'X-Client-Page': 'league',
    'X-Client-Version': '2612.4.1.6',
    'X-Client-Widget-Name': 'cms',
    'X-Client-Widget-Version': '2.7.0',
}

# League IDs from response data
LEAGUES = {
    'MLB': {'leagueId': '84240', 'subcategoryId': '4519'},
    'NBA': {'leagueId': '42648', 'subcategoryId': '4511'},
    'NFL': {'leagueId': '88808', 'subcategoryId': '1000'},
}

# Props subcategory IDs — found via browser DevTools on DK props page
PROP_SUBCATEGORIES = {
    'MLB': {
        '15221': 'Pitcher Strikeouts O/U',   # e.g. Robbie Ray 6.5 o+121 / u-155
        '17413': 'Pitcher Outs O/U',          # e.g. Robbie Ray 15.5 o+112 / u-148
        # Add more subcategoryIds from DevTools:
        # 'XXXXX': 'Batter Hits O/U',
        # 'XXXXX': 'Batter Total Bases O/U',
        # 'XXXXX': 'Batter Home Runs',
        # 'XXXXX': 'Batter RBIs O/U',
        # 'XXXXX': 'Batter Stolen Bases',
    },
    'NBA': {},
    'NFL': {},
}

BASE = 'https://sportsbook-nash.draftkings.com'

def build_url(league_id, subcategory_id):
    """Build the markets endpoint URL exactly as the browser sends it."""
    # Partial encoding matches what browser sends — do NOT use quote() here
    events_query = (
        f"$filter=leagueId%20eq%20%27{league_id}%27%20AND%20"
        f"clientMetadata%2FSubcategories%2Fany(s%3A%20s%2FId%20eq%20%27{subcategory_id}%27)"
    )
    markets_query = (
        f"$filter=clientMetadata%2FsubCategoryId%20eq%20%27{subcategory_id}%27%20AND%20"
        f"tags%2Fall(t%3A%20t%20ne%20%27SportcastBetBuilder%27)"
    )
    url = (
        f"{BASE}/sites/US-SB/api/sportscontent/controldata/league/leagueSubcategory/v1/markets"
        f"?isBatchable=false"
        f"&templateVars={league_id}%2C{subcategory_id}"
        f"&eventsQuery={events_query}"
        f"&marketsQuery={markets_query}"
        f"&include=Events&entity=events"
    )
    return url

def fetch_league(sport, league_id, subcategory_id):
    url = build_url(league_id, subcategory_id)
    print(f'  Fetching {sport}...')
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        r.raise_for_status()
        return r.json()
    except requests.exceptions.HTTPError as e:
        print(f'  [ERROR] HTTP {r.status_code}: {e}')
        return None
    except Exception as e:
        print(f'  [ERROR] {e}')
        return None

def parse_odds(american_str):
    """Parse DK american odds string like '+149' or '\\u2212281' (minus sign) to int."""
    if not american_str:
        return None
    # DK uses unicode minus (\u2212) instead of hyphen-minus
    s = american_str.replace('\u2212', '-').replace('+', '')
    try:
        val = int(s)
        return val if american_str.replace('\u2212', '-').startswith('-') else abs(val)
    except:
        return None

def normalize(data, sport):
    """Convert DK response into the-odds-api compatible shape for drop-in replacement."""
    events = {e['id']: e for e in data.get('events', [])}
    markets = {}
    for m in data.get('markets', []):
        eid = m['eventId']
        markets.setdefault(eid, []).append(m)
    selections = {}
    for s in data.get('selections', []):
        mid = s['marketId']
        selections.setdefault(mid, []).append(s)

    if sport == 'NBA':
        print(f'  [DEBUG] {len(events)} events, {len(data.get("markets",[]))} markets, {len(data.get("selections",[]))} selections')
        if data.get('markets'):
            m0 = data["markets"][0]
            print(f'  [DEBUG] First market name: {m0.get("name")} id: {m0.get("id")} eventId: {m0.get("eventId")}')
        if data.get('selections'):
            print(f'  [DEBUG] First sel marketId: {data["selections"][0].get("marketId")}')
        # Check if eventIds match between events and markets
        event_ids = set(events.keys())
        market_event_ids = set(m['eventId'] for m in data.get('markets', []))
        print(f'  [DEBUG] Event IDs sample: {list(event_ids)[:2]}')
        print(f'  [DEBUG] Market eventId sample: {list(market_event_ids)[:2]}')
        print(f'  [DEBUG] Overlap: {len(event_ids & market_event_ids)}')
        # Check one event's markets and selections directly
        eid0 = list(event_ids)[0]
        ev_markets = markets.get(eid0, [])
        print(f'  [DEBUG] Markets for event {eid0}: {[(m["name"], m["id"]) for m in ev_markets]}')
        for m in ev_markets:
            sels = selections.get(m['id'], [])
            print(f'  [DEBUG]   market "{m["name"]}" -> {len(sels)} selections, first odds: {sels[0]["displayOdds"]["american"] if sels else "NONE"}')

    games = []
    for eid, event in events.items():
        if event.get('status') == 'COMPLETED':
            continue

        home = next((p for p in event['participants'] if p['venueRole'] == 'Home'), None)
        away = next((p for p in event['participants'] if p['venueRole'] == 'Away'), None)
        if not home or not away:
            continue

        # Build bookmaker markets in the-odds-api format
        outcomes_by_type = {'h2h': [], 'spreads': [], 'totals': []}
        for m in markets.get(eid, []):
            mname = m.get('name', '')
            mid = m['id']
            sels = selections.get(mid, [])

            if mname == 'Moneyline':
                for s in sels:
                    odds = parse_odds(s['displayOdds']['american'])
                    if odds is not None:
                        outcomes_by_type['h2h'].append({
                            'name': s['label'],
                            'price': odds,
                        })
            elif mname in ('Run Line', 'Spread', 'Puck Line', 'Point Spread'):
                for s in sels:
                    odds = parse_odds(s['displayOdds']['american'])
                    if odds is not None:
                        outcomes_by_type['spreads'].append({
                            'name': s['label'],
                            'price': odds,
                            'point': s.get('points'),
                        })
            elif mname == 'Total':
                for s in sels:
                    odds = parse_odds(s['displayOdds']['american'])
                    if odds is not None:
                        outcomes_by_type['totals'].append({
                            'name': s['label'],
                            'price': odds,
                            'point': s.get('points'),
                        })

        bm_markets = []
        for key, outcomes in outcomes_by_type.items():
            if outcomes:
                bm_markets.append({'key': key, 'outcomes': outcomes})

        if sport == 'NBA' and not bm_markets:
            print(f'  [DEBUG] No bm_markets for {home["name"]} vs {away["name"]}')
            print(f'  [DEBUG] outcomes_by_type: { {k: len(v) for k,v in outcomes_by_type.items()} }')
            print(f'  [DEBUG] markets for this event: {[m.get("name") for m in markets.get(eid, [])]}')

        game = {
            'id': f'dk_{eid}',  # prefix to distinguish from odds-api IDs
            'sport_key': sport.lower(),
            'sport_title': sport,
            'commence_time': event.get('startEventDate', ''),
            'home_team': home['name'],
            'away_team': away['name'],
            'status': event.get('status', ''),
            'bookmakers': [{
                'key': 'draftkings',
                'title': 'DraftKings',
                'last_update': datetime.utcnow().isoformat() + 'Z',
                'markets': bm_markets,
            }] if bm_markets else [],
            # Extra DK data
            '_dk': {
                'eventId': eid,
                'homePitcher': home.get('metadata', {}).get('startingPitcherPlayerName'),
                'awayPitcher': away.get('metadata', {}).get('startingPitcherPlayerName'),
                'homeColor': home.get('metadata', {}).get('teamColor'),
                'awayColor': away.get('metadata', {}).get('teamColor'),
                'liveState': event.get('liveGameState'),
                'score': event.get('eventScore'),
            }
        }
        games.append(game)

    return games

def scrape():
    print(f'\n[dk_scraper] {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
    result = {
        'fetchedAt': datetime.utcnow().isoformat() + 'Z',
        'source': 'DraftKings (sportsbook-nash internal API)',
        'sports': {}
    }

    # MLB is always in season Mar-Oct; add others as needed
    month = datetime.now().month
    want = ['MLB']
    if month >= 10 or month <= 6:
        want.append('NBA')
    if month >= 9 or month <= 2:
        want.append('NFL')

    for sport in want:
        cfg = LEAGUES[sport]
        data = fetch_league(sport, cfg['leagueId'], cfg['subcategoryId'])
        if not data:
            continue
        games = normalize(data, sport)
        props = fetch_props(sport, cfg['leagueId'])
        result['sports'][sport] = {
            'games': games, 'count': len(games),
            'props': props, 'propsCount': len(props),
        }
        print(f'  [{sport}] {len(games)} games · {len(props)} prop selections')

    return result


def parse_props(data, sport):
    markets_by_id = {m['id']: m for m in data.get('markets', [])}
    events_by_id  = {e['id']: e for e in data.get('events', [])}

    # Group selections by marketId for O/U pairing
    sels_by_market = {}
    for sel in data.get('selections', []):
        mid = sel.get('marketId', '')
        sels_by_market.setdefault(mid, []).append(sel)

    props = []
    for market_id, sels in sels_by_market.items():
        market = markets_by_id.get(market_id)
        if not market:
            continue
        event = events_by_id.get(market.get('eventId', ''))
        home = away = ''
        if event:
            for p in event.get('participants', []):
                if p['venueRole'] == 'Home': home = p['name']
                if p['venueRole'] == 'Away': away = p['name']

        # Detect format: O/U pairs vs milestone singles
        outcome_types = {s.get('outcomeType') for s in sels}
        is_ou = 'Over' in outcome_types and 'Under' in outcome_types

        if is_ou:
            # Group by line (points) — each line has an Over and Under
            by_line = {}
            for sel in sels:
                line = sel.get('points')
                by_line.setdefault(line, {})[sel.get('outcomeType', '')] = sel

            for line, sides in by_line.items():
                over_sel = sides.get('Over', {})
                under_sel = sides.get('Under', {})
                participants = over_sel.get('participants') or under_sel.get('participants') or []
                if not participants:
                    continue
                player = participants[0]
                tags = over_sel.get('tags', [])
                is_main = 'MainPointLine' in tags

                def parse_odds_str(s):
                    american_str = s.get('displayOdds', {}).get('american', '')
                    try:
                        cleaned = american_str.replace('−', '-').replace('+', '')
                        val = int(cleaned)
                        return val if american_str.replace('−', '-').startswith('-') else abs(val)
                    except:
                        return None

                last_stat = player.get('statistic', {})
                props.append({
                    'player': player.get('name', ''),
                    'marketName': market.get('name', ''),
                    'marketType': market.get('marketType', {}).get('name', ''),
                    'subcategoryId': market.get('subcategoryId', ''),
                    'eventId': market.get('eventId', ''),
                    'home': home, 'away': away, 'sport': sport,
                    'line': line,
                    'label': f'O/U {line}',
                    'overOdds': parse_odds_str(over_sel),
                    'underOdds': parse_odds_str(under_sel),
                    'isMainLine': is_main,
                    'format': 'ou',
                    'lastSeasonStat': last_stat.get('value'),
                    'lastSeasonLabel': last_stat.get('prefix', ''),
                })
        else:
            # Milestone format (single selections, no under)
            for sel in sels:
                participants = sel.get('participants', [])
                if not participants:
                    continue
                player = participants[0]
                american_str = sel.get('displayOdds', {}).get('american', '')
                odds = None
                try:
                    cleaned = american_str.replace('−', '-').replace('+', '')
                    odds = int(cleaned)
                    if not american_str.replace('−', '-').startswith('-'):
                        odds = abs(odds)
                except: pass
                tags = sel.get('tags', [])
                is_main = 'MostBalancedOdds' in tags or 'MostBalancedGlobalProbability' in tags
                last_stat = player.get('statistic', {})
                props.append({
                    'player': player.get('name', ''),
                    'marketName': market.get('name', ''),
                    'marketType': market.get('marketType', {}).get('name', ''),
                    'subcategoryId': market.get('subcategoryId', ''),
                    'eventId': market.get('eventId', ''),
                    'home': home, 'away': away, 'sport': sport,
                    'line': sel.get('milestoneValue'),
                    'label': sel.get('label', ''),
                    'overOdds': odds,
                    'underOdds': None,
                    'isMainLine': is_main,
                    'format': 'milestone',
                    'lastSeasonStat': last_stat.get('value'),
                    'lastSeasonLabel': last_stat.get('prefix', ''),
                })
    return props


def fetch_props(sport, league_id):
    subcats = PROP_SUBCATEGORIES.get(sport, {})
    all_props = []
    for subcat_id, subcat_name in subcats.items():
        print(f'  Fetching {sport} props: {subcat_name}...')
        data = fetch_league(sport, league_id, subcat_id)
        if data:
            props = parse_props(data, sport)
            main = [p for p in props if p['isMainLine']]
            print(f'    {len(props)} selections ({len(main)} main lines)')
            all_props.extend(props)
        time.sleep(0.3)
    return all_props


SERVER = 'http://127.0.0.1:3001'

def log_odds_history(data):
    today = datetime.now().strftime('%Y-%m-%d')
    logged = 0
    for sport, sd in data.get('sports', {}).items():
        for game in sd.get('games', []):
            bm = (game.get('bookmakers') or [{}])[0]
            mkts = {m['key']: m for m in bm.get('markets', [])}
            ml = mkts.get('h2h', {}).get('outcomes', [])
            sp = mkts.get('spreads', {}).get('outcomes', [])
            to = mkts.get('totals', {}).get('outcomes', [])
            home = game['home_team']
            away = game['away_team']
            game_date = game.get('commence_time', '')[:10]  # YYYY-MM-DD
            game_key = f"{away.split()[-1]}@{home.split()[-1]}_{game_date}"
            snapshot = {
                'home': home, 'away': away, 'sport': sport,
                'commence_time': game.get('commence_time', ''),
                'ml': {
                    'home': next((o['price'] for o in ml if o.get('name') == home), None),
                    'away': next((o['price'] for o in ml if o.get('name') == away), None),
                },
                'spread': {
                    'point': next((o.get('point') for o in sp if o.get('name') == home), None),
                    'homeOdds': next((o['price'] for o in sp if o.get('name') == home), None),
                    'awayOdds': next((o['price'] for o in sp if o.get('name') == away), None),
                },
                'total': {
                    'point': next((o.get('point') for o in to if o.get('name') == 'Over'), None),
                    'overOdds': next((o['price'] for o in to if o.get('name') == 'Over'), None),
                    'underOdds': next((o['price'] for o in to if o.get('name') == 'Under'), None),
                },
            }
            try:
                r = requests.post(
                    f'{SERVER}/odds-history',
                    json={'dateKey': today, 'gameKey': game_key, 'snapshot': snapshot},
                    timeout=5
                )
                if r.ok and r.json().get('changed'):
                    logged += 1
            except:
                pass
    if logged:
        print(f'[dk_scraper] Logged {logged} odds movements to server')

if __name__ == '__main__':
    test_mode = '--test' in sys.argv
    watch_mode = '--watch' in sys.argv

    if watch_mode:
        print(f'[dk_scraper] Watch mode — every {WATCH_INTERVAL_HOURS}h')
        while True:
            try:
                data = scrape()
                if not test_mode:
                    with open(OUTPUT_PATH, 'w') as f:
                        json.dump(data, f, indent=2)
                    print(f'[dk_scraper] Saved to {OUTPUT_PATH}')
                    log_odds_history(data)
                else:
                    print(json.dumps(data, indent=2))
            except Exception as e:
                print(f'[ERROR] {e}')
            print(f'Sleeping 30min...')
            time.sleep(WATCH_INTERVAL_HOURS * 3600)
    else:
        data = scrape()
        if test_mode:
            print(json.dumps(data, indent=2))
        else:
            with open(OUTPUT_PATH, 'w') as f:
                json.dump(data, f, indent=2)
            print(f'[dk_scraper] Saved → {OUTPUT_PATH}')
            for sport, d in data['sports'].items():
                print(f'  {sport}: {d["count"]} games')
            log_odds_history(data)
