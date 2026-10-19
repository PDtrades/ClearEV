"use client";
import { useEffect, useState } from "react";

const CLOUDS = [
  { top: "6%", w: 260, dur: 190, delay: -40, o: 0.9 },
  { top: "18%", w: 180, dur: 230, delay: -120, o: 0.75 },
  { top: "34%", w: 320, dur: 260, delay: -200, o: 0.8 },
  { top: "52%", w: 200, dur: 210, delay: -60, o: 0.7 },
  { top: "70%", w: 280, dur: 280, delay: -150, o: 0.75 },
  { top: "84%", w: 160, dur: 240, delay: -20, o: 0.65 },
];

function Cloud({ w }: { w: number }) {
  return (
    <svg viewBox="0 0 200 90" width={w} aria-hidden="true">
      <path d="M50 80a24 24 0 0 1-4-47.7A32 32 0 0 1 108 24a22 22 0 0 1 30 20 20 20 0 0 1 12 36H50z" fill="#ffffff" />
    </svg>
  );
}

/**
 * Slowly drifting clouds behind the page. Respects prefers-reduced-motion and offers a pause control
 * whose state persists in localStorage. Pure CSS animation, so it costs nothing while paused.
 */
export function CloudBackground() {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("clearev:clouds");
      if (saved === "paused") setPaused(true);
      else if (saved === null && window.matchMedia("(prefers-reduced-motion: reduce)").matches) setPaused(true);
    } catch {}
  }, []);
  const toggle = () => {
    setPaused((p) => {
      try {
        localStorage.setItem("clearev:clouds", p ? "playing" : "paused");
      } catch {}
      return !p;
    });
  };
  return (
    <>
      <div className="sky" data-paused={paused} aria-hidden="true">
        {CLOUDS.map((c, i) => (
          <div key={i} className="cloud" style={{ top: c.top, width: c.w, opacity: c.o, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }}>
            <Cloud w={c.w} />
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-sm cloud-toggle" onClick={toggle} aria-pressed={paused} style={{ position: "fixed", right: 12, bottom: 12, zIndex: 40 }}>
        {paused ? "Resume background motion" : "Pause background motion"}
      </button>
    </>
  );
}
