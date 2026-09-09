#!/usr/bin/env python3
"""
resolve_conflicts.py — BetOnMe Syncthing conflict resolver

Run this on either machine whenever Syncthing creates conflict files.
It finds all savedata.sync-conflict-*.json and server.sync-conflict-*.log
files, resolves them intelligently, and cleans up.

Usage:
    python3 resolve_conflicts.py           # dry run — shows what would happen
    python3 resolve_conflicts.py --apply   # actually resolves and cleans up
"""

import json
import os
import sys
import glob
import shutil
import time
from datetime import datetime

# ── Config ────────────────────────────────────────────────────────────────────

SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
DATA_DIR     = os.path.join(os.path.expanduser('~'), '.local', 'share', 'betonme')
# Fall back to script dir if savedata.json lives there (dev setup)
if os.path.exists(os.path.join(SCRIPT_DIR, 'savedata.json')):
    DATA_DIR = SCRIPT_DIR

BACKUPS_DIR  = os.path.join(DATA_DIR, 'savedata-backups')
DRY_RUN      = '--apply' not in sys.argv

# Keys where we merge by date (newest wins on overlap, rescue missing dates from older)
HISTORY_KEYS = {'predictions', 'lay', 'f5', 'propPick', 'ouPick',
                'favPick', 'hatePick', 'superdog', 'allIn', 'app', 'dog'}

# ── Helpers ───────────────────────────────────────────────────────────────────

def load_json(path):
    try:
        with open(path, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f'  ERROR loading {os.path.basename(path)}: {e}')
        return None

def saved_at(data, path):
    """Return _savedAt ms timestamp, falling back to file mtime."""
    if data and '_savedAt' in data:
        return data['_savedAt']
    return int(os.path.getmtime(path) * 1000)

def fmt_ts(ms):
    return datetime.fromtimestamp(ms / 1000).strftime('%Y-%m-%d %H:%M:%S')

def merge_history(winner_val, loser_val):
    """Keep all dates from winner; add dates from loser that winner is missing."""
    if not isinstance(winner_val, dict) or not isinstance(loser_val, dict):
        return winner_val
    merged = dict(loser_val)
    merged.update(winner_val)
    return merged

# ── JSON resolver (savedata, savedata.backup) ─────────────────────────────────

def resolve_json_pair(main_path, conflict_paths):
    candidates = []
    main_data = load_json(main_path)
    if main_data is not None:
        candidates.append((main_path, main_data, saved_at(main_data, main_path)))
    for cp in conflict_paths:
        cd = load_json(cp)
        if cd is not None:
            candidates.append((cp, cd, saved_at(cd, cp)))
    if not candidates:
        print('  No readable files found — skipping.')
        return

    candidates.sort(key=lambda x: x[2], reverse=True)
    winner_path, winner_data, winner_ts = candidates[0]
    losers = candidates[1:]

    print(f'  Winner  → {os.path.basename(winner_path)}  ({fmt_ts(winner_ts)})')
    for lp, ld, lt in losers:
        print(f'  Loser   → {os.path.basename(lp)}  ({fmt_ts(lt)})')

    merged = dict(winner_data)
    rescued = []
    for _, loser_data, _ in losers:
        for key, loser_val in loser_data.items():
            if key.startswith('_'):
                continue
            if key not in merged:
                merged[key] = loser_val
                rescued.append(f'{key} (entire key missing from winner)')
            elif key in HISTORY_KEYS:
                before = set(merged[key].keys()) if isinstance(merged[key], dict) else set()
                merged[key] = merge_history(merged[key], loser_val)
                after = set(merged[key].keys()) if isinstance(merged[key], dict) else set()
                new_dates = after - before
                if new_dates:
                    rescued.append(f'{key}: rescued dates {sorted(new_dates)}')

    if rescued:
        print(f'  Rescued from loser(s):')
        for r in rescued:
            print(f'    + {r}')
    else:
        print(f'  Nothing to rescue — winner had everything.')

    if DRY_RUN:
        print(f'  [DRY RUN] Would write merged data to {os.path.basename(main_path)}')
        print(f'  [DRY RUN] Would delete {len(losers)} conflict file(s)')
        return

    os.makedirs(BACKUPS_DIR, exist_ok=True)
    stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    for p, _, _ in candidates:
        bname = f'{os.path.splitext(os.path.basename(p))[0]}.pre-resolve-{stamp}.json'
        shutil.copy2(p, os.path.join(BACKUPS_DIR, bname))
        print(f'  Backed up → savedata-backups/{bname}')

    merged['_savedAt'] = int(time.time() * 1000)
    with open(main_path, 'w') as f:
        json.dump(merged, f, indent=2)
    print(f'  ✓ Wrote merged data to {os.path.basename(main_path)}')

    for lp, _, _ in losers:
        os.remove(lp)
        print(f'  ✓ Deleted {os.path.basename(lp)}')

# ── Log resolver (server.log) ─────────────────────────────────────────────────

def resolve_log(main_path, conflict_paths):
    """Append conflict log content into main log chronologically, then delete."""
    # Sort conflicts oldest → newest so the merged log stays chronological
    dated = sorted((os.path.getmtime(cp), cp) for cp in conflict_paths)

    if DRY_RUN:
        for _, cp in dated:
            print(f'  [DRY RUN] Would merge + delete {os.path.basename(cp)}')
        return

    with open(main_path, 'a') as main_log:
        for _, cp in dated:
            main_log.write(f'\n# ── Merged from conflict: {os.path.basename(cp)} ──\n')
            try:
                with open(cp, 'r') as cf:
                    main_log.write(cf.read())
            except Exception as e:
                main_log.write(f'# ERROR reading conflict file: {e}\n')
            os.remove(cp)
            print(f'  ✓ Merged + deleted {os.path.basename(cp)}')

# ── Ephemeral file handler ────────────────────────────────────────────────────

def delete_conflicts(conflict_paths):
    if DRY_RUN:
        for cp in conflict_paths:
            print(f'  [DRY RUN] Would delete {os.path.basename(cp)}')
    else:
        for cp in conflict_paths:
            os.remove(cp)
            print(f'  ✓ Deleted {os.path.basename(cp)}')

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print('BetOnMe conflict resolver')
    print(f'Data dir : {DATA_DIR}')
    print(f'Mode     : {"DRY RUN (pass --apply to fix)" if DRY_RUN else "APPLY"}')
    print('─' * 60)

    all_conflicts = (
        glob.glob(os.path.join(DATA_DIR, '*.sync-conflict-*.json')) +
        glob.glob(os.path.join(DATA_DIR, '*.sync-conflict-*.log')) +
        glob.glob(os.path.join(DATA_DIR, 'savedata-backups', '*.sync-conflict-*.json'))
    )

    # Group by (subdir, base, ext) — skip our own pre-resolve backups
    groups = {}
    for cp in all_conflicts:
        if '.pre-resolve-' in os.path.basename(cp):
            continue  # these are our own backups, not Syncthing conflicts
        subdir = os.path.dirname(cp)
        basename = os.path.basename(cp)
        base = basename.split('.sync-conflict-')[0]
        ext  = os.path.splitext(basename)[1]
        groups.setdefault((subdir, base, ext), []).append(cp)

    if not groups:
        print('\nNo conflict files found — nothing to do!')
        return

    for (subdir, base, ext), conflict_files in sorted(groups.items()):
        main_file = os.path.join(subdir, f'{base}{ext}')
        in_backups = os.path.basename(subdir) == 'savedata-backups'
        label = f'savedata-backups/{base}{ext}' if in_backups else f'{base}{ext}'
        print(f'\n{"=" * 60}')
        print(f'Resolving: {label}  ({len(conflict_files)} conflict(s))')

        if ext == '.log':
            print('  Log file — appending conflict entries into main log.')
            resolve_log(main_file, conflict_files)

        elif in_backups:
            # Daily backup files — just keep newest, delete conflicts (backups are redundant by design)
            dated = sorted(conflict_files, key=os.path.getmtime)
            print('  Daily backup — keeping newest, deleting older conflicts.')
            delete_conflicts(dated)

        elif base in ('dk_odds', 'odds_history'):
            print('  Ephemeral scraper file — keeping main, deleting conflicts.')
            delete_conflicts(conflict_files)

        elif base in ('savedata', 'savedata.backup'):
            resolve_json_pair(main_file, conflict_files)

        else:
            print('  Unknown file type — skipping (resolve manually).')
            for cp in conflict_files:
                print(f'    {os.path.basename(cp)}')

    # ── Clean up stale pre-resolve backups ───────────────────────────────────
    stale = glob.glob(os.path.join(BACKUPS_DIR, '*.pre-resolve-*.json'))
    if stale:
        print(f'\n{"=" * 60}')
        print(f'Cleaning up {len(stale)} stale pre-resolve backup(s):')
        for f in sorted(stale):
            if DRY_RUN:
                print(f'  [DRY RUN] Would delete savedata-backups/{os.path.basename(f)}')
            else:
                os.remove(f)
                print(f'  ✓ Deleted savedata-backups/{os.path.basename(f)}')

    print(f'\n{"=" * 60}')
    if DRY_RUN:
        print('Dry run complete. Run with --apply to make changes.')
    else:
        print('Done. Restart the BetOnMe server on this machine.')
        print('Syncthing will sync the resolved files to the other machine automatically.')

if __name__ == '__main__':
    main()
