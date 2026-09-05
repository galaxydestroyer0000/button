import { useState } from "react";
import { isValidUsername } from "../../hooks/useUsername";
import styles from "./OnboardingModal.module.css";

/** Shown once, before a first-time visitor ever sees the press button — the
 *  "lore" pass the product wanted before asking for a username. Nothing here
 *  is a wallet or a transaction; picking a username is the whole cost of
 *  entry. See SECURITY.md for what that trade-off actually means. */
export default function OnboardingModal({ onComplete }: { onComplete: (username: string) => void }) {
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);

  const trimmed = value.trim();
  const valid = isValidUsername(trimmed);

  function submit() {
    setTouched(true);
    if (!valid) return;
    onComplete(trimmed);
  }

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="About BUTTON">
      <div className={styles.modal}>
        <span className={styles.eyebrow}>BEFORE YOU PRESS</span>
        <h2 className={styles.title}>One button. One press. Forever.</h2>
        <div className={styles.lore}>
          <p>
            In 2015, Reddit put a button on the internet with a 60-second timer. Press it, and the timer resets to 60 for
            everyone. Let it hit zero, and it's over for good. Over a million people turned that into factions,
            rituals, and genuine panic in the final seconds.
          </p>
          <p>
            <strong>BUTTON</strong> brings the same idea back, with the same two rules: <strong>you get exactly one
            press, ever</strong>, and <strong>at zero, it ends for good.</strong> No restart, no admin override, no
            second chance.
          </p>
          <p>
            Your faction is decided by how much time was left when you pressed. Press immediately after a reset and
            you're <strong>PURPLE</strong>. Wait until the last few seconds and you're <strong>RED</strong>, the
            faction that risked it closest to death.
          </p>
        </div>
        <div className={styles.step}>
          <span className={styles.label}>Pick a username</span>
          <div className={styles.inputRow}>
            <input
              className={styles.input}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="e.g. closest_call_99"
              maxLength={20}
              autoFocus
            />
          </div>
          {touched && !valid ? (
            <div className={styles.error}>3–20 characters. Letters, numbers, and underscores only.</div>
          ) : (
            <div className={styles.hint}>This is what gets recorded when you press. Choose carefully. It's permanent once used.</div>
          )}
          <button type="button" className={styles.continue} onClick={submit} disabled={touched && !valid}>
            I understand, let me in
          </button>
        </div>
      </div>
    </div>
  );
}
