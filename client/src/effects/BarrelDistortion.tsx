import { ReactNode } from 'react';
import './barrel-distortion.css';

interface BarrelDistortionProps {
  children: ReactNode;
  strength?: number; // 1-10, default 3
  enabled?: boolean;
}

/**
 * Applies a barrel/pincushion distortion effect to simulate
 * convex CRT glass. Uses CSS transforms for performance.
 */
export default function BarrelDistortion({
  children,
  strength = 3,
  enabled = true,
}: BarrelDistortionProps) {
  if (!enabled) {
    return <>{children}</>;
  }

  // Calculate perspective and scale based on strength
  // Lower perspective = more pronounced curve effect
  const perspective = 2000 - (strength * 150);
  const scale = 1 + (strength * 0.008);

  return (
    <div className="barrel-outer">
      <div
        className="barrel-perspective"
        style={{
          perspective: `${perspective}px`,
        }}
      >
        <div
          className="barrel-content"
          style={{
            transform: `rotateX(0deg) scale(${scale})`,
          }}
        >
          {children}
        </div>
      </div>
      {/* Edge darkening overlay for depth */}
      <div className="barrel-edge-shadow" />
    </div>
  );
}
