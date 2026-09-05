-- The database-backed game state, replacing ButtonExperiment.sol's role for
-- regular users after the wallet-friction pivot. Same rules, different ledger:
-- a real Postgres row is the source of truth instead of a smart contract, but
-- "started once, one press per username forever, dies permanently at zero" all
-- still hold, enforced here instead of onchain. See SECURITY.md for the honest
-- account of what this can and can't guarantee compared to the original design.

CREATE TABLE IF NOT EXISTS game_state (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  started BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ,
  deadline TIMESTAMPTZ,
  total_presses INTEGER NOT NULL DEFAULT 0,
  closest_call_seconds INTEGER,
  closest_call_username TEXT,
  last_presser_username TEXT,
  last_press_faction SMALLINT,
  last_press_remaining_seconds INTEGER,
  reset_count INTEGER NOT NULL DEFAULT 0,
  CHECK (id = 1)
);

INSERT INTO game_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS presses (
  press_number SERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  username_lower TEXT NOT NULL,
  pressed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  faction SMALLINT NOT NULL,
  remaining_seconds INTEGER NOT NULL
);

-- Case-insensitive: "Bob" and "bob" are the same username for the "one press
-- ever" guarantee, same spirit as a wallet address not caring about case.
CREATE UNIQUE INDEX IF NOT EXISTS presses_username_lower_idx ON presses (username_lower);
CREATE INDEX IF NOT EXISTS presses_pressed_at_idx ON presses (pressed_at DESC);
