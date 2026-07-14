/**
 * Decorative SVG patterns for the landing page.
 * Static, no animation by default. Use `className` + tailwind to position/animate.
 */
import { CSSProperties } from "react";

interface DecorProps {
  className?: string;
  style?: CSSProperties;
  color?: string; // CSS color (use hsl(var(--primary)) etc.)
  size?: number;
}

export function AsteriskMark({ className, style, color = "currentColor", size = 80 }: DecorProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      style={style}
      aria-hidden
    >
      <g fill={color}>
        {[0, 45, 90, 135].map((deg) => (
          <rect
            key={deg}
            x="46"
            y="6"
            width="8"
            height="88"
            rx="4"
            transform={`rotate(${deg} 50 50)`}
          />
        ))}
        <circle cx="50" cy="50" r="6" />
      </g>
    </svg>
  );
}

export function BoltMark({ className, style, color = "currentColor", size = 80 }: DecorProps) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} style={style} aria-hidden>
      <path
        d="M36 4 L10 36 H26 L22 60 L54 26 H38 Z"
        fill={color}
      />
    </svg>
  );
}

export function RingsMark({ className, style, color = "currentColor", size = 120 }: DecorProps) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={className} style={style} aria-hidden>
      <g fill="none" stroke={color} strokeWidth="1.2">
        {[10, 25, 40, 55].map((r) => (
          <circle key={r} cx="60" cy="60" r={r} />
        ))}
      </g>
    </svg>
  );
}

export function DotGrid({ className, style, color = "currentColor", size = 200 }: DecorProps) {
  const dots = [];
  for (let x = 0; x < 10; x++) {
    for (let y = 0; y < 10; y++) {
      dots.push(<circle key={`${x}-${y}`} cx={x * 20 + 10} cy={y * 20 + 10} r="1.2" fill={color} />);
    }
  }
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} className={className} style={style} aria-hidden>
      {dots}
    </svg>
  );
}
