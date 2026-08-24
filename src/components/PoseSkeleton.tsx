// Decorative animated pose-skeleton graphic used on the landing hero —
// pulsing joints over gradient bone lines, in a squat stance.

const JOINTS: [number, number][] = [
  [100, 55], // neck
  [80, 60], // left shoulder
  [120, 60], // right shoulder
  [65, 90], // left elbow
  [135, 90], // right elbow
  [55, 120], // left wrist
  [145, 120], // right wrist
  [100, 120], // hip center
  [85, 130], // left hip
  [115, 130], // right hip
  [75, 175], // left knee
  [125, 175], // right knee
  [70, 220], // left ankle
  [130, 220], // right ankle
];

const BONES: [[number, number], [number, number]][] = [
  [[100, 46], [100, 55]], // head -> neck
  [[100, 55], [80, 60]],
  [[100, 55], [120, 60]],
  [[80, 60], [65, 90]],
  [[65, 90], [55, 120]],
  [[120, 60], [135, 90]],
  [[135, 90], [145, 120]],
  [[100, 55], [100, 120]], // spine
  [[100, 120], [85, 130]],
  [[100, 120], [115, 130]],
  [[85, 130], [75, 175]],
  [[75, 175], [70, 220]],
  [[115, 130], [125, 175]],
  [[125, 175], [130, 220]],
];

export function PoseSkeleton({ className = "h-56 w-auto" }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 240" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="boneGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#e879f9" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="32" r="14" fill="none" stroke="url(#boneGradient)" strokeWidth="3" />
      {BONES.map(([from, to], i) => (
        <line
          key={i}
          x1={from[0]}
          y1={from[1]}
          x2={to[0]}
          y2={to[1]}
          stroke="url(#boneGradient)"
          strokeWidth="3"
          strokeLinecap="round"
        />
      ))}
      {JOINTS.map(([cx, cy], i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r="5"
          className="fill-fuchsia-300 animate-pulse"
          style={{ animationDelay: `${(i % 5) * 150}ms` }}
        />
      ))}
    </svg>
  );
}
