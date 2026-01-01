import { useEffect, useRef } from 'react';
import './CRTFlicker.css';

interface CRTFlickerProps {
  enabled?: boolean;
  intensity?: number; // 0-10, default 3
}

/**
 * Adds random CRT flicker effects:
 * - Brightness fluctuation
 * - Occasional horizontal jitter
 * - Random scan line interference
 * - Subtle color shift
 */
export function CRTFlicker({ enabled = true, intensity = 3 }: CRTFlickerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match viewport
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Flicker state
    let lastFlicker = 0;
    let flickerOpacity = 0;
    let jitterX = 0;
    let jitterY = 0;
    let scanLineY = -100;
    let showScanLine = false;

    const intensityFactor = intensity / 10;

    const animate = (time: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Random brightness flicker (every 50-200ms)
      if (time - lastFlicker > 50 + Math.random() * 150) {
        lastFlicker = time;

        // Occasional strong flicker
        if (Math.random() < 0.03 * intensityFactor) {
          flickerOpacity = 0.1 + Math.random() * 0.15 * intensityFactor;
        } else if (Math.random() < 0.1 * intensityFactor) {
          flickerOpacity = 0.02 + Math.random() * 0.05 * intensityFactor;
        } else {
          flickerOpacity = Math.max(0, flickerOpacity - 0.02);
        }

        // Occasional horizontal jitter
        if (Math.random() < 0.02 * intensityFactor) {
          jitterX = (Math.random() - 0.5) * 4 * intensityFactor;
          jitterY = (Math.random() - 0.5) * 2 * intensityFactor;
        } else {
          jitterX *= 0.8;
          jitterY *= 0.8;
        }

        // Occasional scan line roll
        if (Math.random() < 0.01 * intensityFactor) {
          showScanLine = true;
          scanLineY = -20;
        }
      }

      // Apply transform for jitter
      if (Math.abs(jitterX) > 0.1 || Math.abs(jitterY) > 0.1) {
        canvas.style.transform = `translate(${jitterX}px, ${jitterY}px)`;
      } else {
        canvas.style.transform = '';
      }

      // Draw flicker overlay
      if (flickerOpacity > 0.005) {
        ctx.fillStyle = `rgba(255, 255, 255, ${flickerOpacity})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Draw rolling scan line interference
      if (showScanLine) {
        scanLineY += 8;
        if (scanLineY > canvas.height + 20) {
          showScanLine = false;
        } else {
          const gradient = ctx.createLinearGradient(0, scanLineY - 20, 0, scanLineY + 20);
          gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
          gradient.addColorStop(0.4, `rgba(255, 255, 255, ${0.1 * intensityFactor})`);
          gradient.addColorStop(0.5, `rgba(255, 255, 255, ${0.2 * intensityFactor})`);
          gradient.addColorStop(0.6, `rgba(255, 255, 255, ${0.1 * intensityFactor})`);
          gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
          ctx.fillStyle = gradient;
          ctx.fillRect(0, scanLineY - 20, canvas.width, 40);
        }
      }

      // Occasional color fringing / chromatic glitch
      if (Math.random() < 0.005 * intensityFactor) {
        const y = Math.random() * canvas.height;
        const height = 2 + Math.random() * 4;
        ctx.fillStyle = `rgba(255, 0, 0, ${0.1 * intensityFactor})`;
        ctx.fillRect(0, y, canvas.width, height);
        ctx.fillStyle = `rgba(0, 255, 255, ${0.1 * intensityFactor})`;
        ctx.fillRect(2, y + 1, canvas.width, height);
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationRef.current);
    };
  }, [enabled, intensity]);

  if (!enabled) return null;

  return <canvas ref={canvasRef} className="crt-flicker-canvas" />;
}
