-- MPIN support for customer (parents) and partner (providers) login.
-- After a user finishes profile setup they can opt-in to a 4-6 digit MPIN
-- and use it to log in instead of an SMS OTP each time.
--
-- mpin_hash             : bcrypt hash of the MPIN (never store the raw digits)
-- mpin_updated_at       : last time the MPIN was created or changed
-- mpin_failed_attempts  : consecutive wrong-MPIN counter (UI can lock after N)
-- mpin_locked_until     : when the MPIN is temporarily locked after too many bad tries

ALTER TABLE parents   ADD COLUMN mpin_hash TEXT;
ALTER TABLE parents   ADD COLUMN mpin_updated_at TEXT;
ALTER TABLE parents   ADD COLUMN mpin_failed_attempts INTEGER DEFAULT 0;
ALTER TABLE parents   ADD COLUMN mpin_locked_until TEXT;

ALTER TABLE providers ADD COLUMN mpin_hash TEXT;
ALTER TABLE providers ADD COLUMN mpin_updated_at TEXT;
ALTER TABLE providers ADD COLUMN mpin_failed_attempts INTEGER DEFAULT 0;
ALTER TABLE providers ADD COLUMN mpin_locked_until TEXT;
