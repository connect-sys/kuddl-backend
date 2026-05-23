-- Camp scheduling + pricing extensions:
--   schedule_start_time / schedule_end_time : daily run-time window of the camp.
--   booking_closes_at                       : ISO timestamp or HH:MM string after which
--                                             customers can no longer book this camp.
--   pricing_slots                           : JSON array of slot variants. Each entry:
--     {
--       "id": "...",
--       "label": "Morning batch",
--       "age_min": 4, "age_max": 8,
--       "duration_minutes": 90,
--       "start_time": "09:00", "end_time": "10:30",
--       "days_of_week": [1,2,3,4,5],
--       "price": 1499
--     }
-- The legacy `schedule_time` and `price` columns continue to work for camps that
-- only have a single price/time. New camps may set pricing_slots and leave price = 0.

ALTER TABLE camps ADD COLUMN schedule_start_time TEXT;
ALTER TABLE camps ADD COLUMN schedule_end_time   TEXT;
ALTER TABLE camps ADD COLUMN booking_closes_at   TEXT;
ALTER TABLE camps ADD COLUMN pricing_slots       TEXT;
