import { ReactNode } from 'react';
import '../styles/crt.css';
import BarrelDistortion from './BarrelDistortion';
import { CRTFlicker } from './CRTFlicker';

interface CRTScreenProps {
  children: ReactNode;
  enabled?: boolean;
  barrelStrength?: number; // 0-10, default 4
  displayMode?: 'bordered' | 'fullscreen';
  flickerIntensity?: number; // 0-10, default 3
  scanlineOpacity?: number; // 0-10, default 5
}

export default function CRTScreen({
  children,
  enabled = true,
  barrelStrength = 4,
  displayMode = 'bordered',
  flickerIntensity = 3,
  scanlineOpacity = 5
}: CRTScreenProps) {
  if (!enabled) {
    return <div className="screen-container">{children}</div>;
  }

  const containerClass = `crt-container ${displayMode === 'fullscreen' ? 'fullscreen' : ''}`;

  return (
    <div className={containerClass}>
      {/* Outer bezel */}
      <div className="crt-bezel">
        {/* Screen with curvature - barrel distortion applied */}
        <div className="crt-screen">
          <BarrelDistortion strength={barrelStrength} enabled={barrelStrength > 0}>
            {/* Scanlines overlay */}
            {scanlineOpacity > 0 && (
              <div
                className="crt-scanlines"
                style={{ opacity: scanlineOpacity / 10 }}
              />
            )}

            {/* Content */}
            <div className="crt-content">
              {children}
            </div>

            {/* Screen glare/reflection */}
            <div className="crt-glare" />

            {/* Vignette */}
            <div className="crt-vignette" />

            {/* Random flicker effect */}
            {flickerIntensity > 0 && (
              <CRTFlicker enabled={enabled} intensity={flickerIntensity} />
            )}
          </BarrelDistortion>
        </div>
      </div>
    </div>
  );
}
