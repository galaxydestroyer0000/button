import Skeleton from "../common/Skeleton";

export default function FeedSkeleton() {
  return (
    <div style={{ display: "grid", gap: 10, padding: "16px 0" }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} height={40} />
      ))}
    </div>
  );
}
