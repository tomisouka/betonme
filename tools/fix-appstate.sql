-- fix-appstate.sql
-- Patches app_state to reflect the SF Giants W on 2026-04-02
-- Run with: sqlite3 db/betonme.db < fix-appstate.sql

UPDATE app_state SET
  coins          = 264.87,
  last_coin_date = '2026-04-02',
  streak         = '["L","W","W","L","W","W","W","L","L","L","W","W","W","W","W","W"]',
  streak_dates   = '["2026-03-04","2026-03-05","2026-03-07","2026-03-08","2026-03-09","2026-03-10","2026-03-11","2026-03-12","2026-03-26","2026-03-27","2026-03-28","2026-03-29","2026-03-30","2026-03-31","2026-04-01","2026-04-02"]'
WHERE id = 1;

-- Confirm the Apr 2 lock pick is also marked W
UPDATE picks SET result = 'W'
WHERE type = 'lock' AND date = '2026-04-02' AND (result IS NULL OR result != 'W');

-- Verify
SELECT 'coins=' || coins, 'last_coin_date=' || last_coin_date,
       'streak_length=' || json_array_length(streak)
FROM app_state WHERE id = 1;

SELECT 'apr2_pick=' || result FROM picks WHERE type='lock' AND date='2026-04-02';
