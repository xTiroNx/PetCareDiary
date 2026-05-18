type SkeletonBlockProps = {
  rows?: number;
  className?: string;
};

export function SkeletonBlock({ rows = 3, className = "" }: SkeletonBlockProps) {
  return (
    <div className={`panel grid gap-3 ${className}`} aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          className="skeleton-line"
          key={index}
          style={{
            width: index === rows - 1 ? "62%" : index % 2 ? "82%" : "100%"
          }}
        />
      ))}
    </div>
  );
}
