-- Cosmoscope Trending counter. No IP addresses or personal data are stored.
CREATE TABLE IF NOT EXISTS counts_h (hour INTEGER NOT NULL, id TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (hour, id));
CREATE TABLE IF NOT EXISTS counts_d (day TEXT NOT NULL, id TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, id));
-- today's "already counted" marks: key = scrambled (day, visitor, place); pk = scrambled (day, visitor) for the daily cap
CREATE TABLE IF NOT EXISTS seen (day TEXT NOT NULL, key TEXT NOT NULL, pk TEXT NOT NULL, PRIMARY KEY (day, key));
CREATE INDEX IF NOT EXISTS seen_pk ON seen (day, pk);
