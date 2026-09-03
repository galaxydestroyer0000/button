import styles from "./StatTile.module.css";

export default function StatTile({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <article className={styles.tile}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{caption}</small>
    </article>
  );
}
