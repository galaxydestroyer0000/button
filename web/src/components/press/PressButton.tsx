import styles from "./PressButton.module.css";

export default function PressButton({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  return (
    <div className={styles.stage}>
      <div className={styles.dial} aria-hidden="true" />
      <div className={styles.plinth}>
        <button type="button" className={styles.button} disabled={disabled} onClick={onPress} aria-label={`${label} — press the button once, forever`}>
          <span className={styles.glare} />
          <span className={styles.copy}>{label}</span>
        </button>
      </div>
    </div>
  );
}
