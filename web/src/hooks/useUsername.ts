import { useCallback, useState } from "react";

const STORAGE_KEY = "button-username";
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

export function isValidUsername(value: string): boolean {
  return USERNAME_PATTERN.test(value.trim());
}

/** The player's identity in the database-backed game — a convenience the
 *  browser remembers for *this* visitor, not the source of truth for "has
 *  this username pressed" (that's enforced server-side by api/press.ts's
 *  unique index, regardless of what any browser's storage says). */
export function useUsername(): { username: string | null; setUsername: (name: string) => void; clear: () => void } {
  const [username, setUsernameState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const setUsername = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!isValidUsername(trimmed)) return;
    try {
      localStorage.setItem(STORAGE_KEY, trimmed);
    } catch {
      // Storage unavailable (private mode, quota) — still usable this session.
    }
    setUsernameState(trimmed);
  }, []);

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setUsernameState(null);
  }, []);

  return { username, setUsername, clear };
}
