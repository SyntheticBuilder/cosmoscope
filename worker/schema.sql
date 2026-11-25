-- Cosmoscope Trending counter. No IP addresses or personal data are stored.
CREATE TABLE IF NOT EXISTS counts_h (hour INTEGER NOT NULL, id TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (hour, id));
CREATE TABLE IF NOT EXISTS counts_d (day TEXT NOT NULL, id TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, id));
-- today's random key (deleted daily, so old marks can't be recomputed)
CREATE TABLE IF NOT EXISTS daykeys (day TEXT PRIMARY KEY, k TEXT NOT NULL);
-- today's "already counted" marks: key = scrambled (network, place)
CREATE TABLE IF NOT EXISTS marks (day TEXT NOT NULL, key TEXT NOT NULL, PRIMARY KEY (day, key));
-- today's count per scrambled network, for the daily cap (holds no places)
CREATE TABLE IF NOT EXISTS caps (day TEXT NOT NULL, pk TEXT NOT NULL, c INTEGER NOT NULL, PRIMARY KEY (day, pk));
