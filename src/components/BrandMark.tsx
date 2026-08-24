export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 bg-clip-text font-bold text-transparent ${className}`}
    >
      Rep Coach
    </span>
  );
}
