import styles from "./Skeleton.module.css";

export default function Skeleton({ height = 14, width = "100%" }: { height?: number | string; width?: number | string }) {
  return <div className={styles.skeleton} style={{ height, width }} aria-hidden="true" />;
}
