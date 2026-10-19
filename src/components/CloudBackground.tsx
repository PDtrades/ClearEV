"use client";
import { useEffect, useState } from "react";

// Three depth layers: far clouds are small, faint and slow; near clouds are larger and faster (parallax).
// dur is seconds to cross the screen; negative delays start each cloud part-way across so the sky is never empty.
const CLOUDS = [
  { top: "4%", w: 140, dur: 95, delay: -10, o: 0.55, bob: 9 },
  { top: "22%", w: 120, dur: 105, delay: -70, o: 0.5, bob: 11 },
  { top: "46%", w: 150, dur: 100, delay: -40, o: 0.5, bob: 10 },
  { top: "76%", w: 130, dur: 110, delay: -85, o: 0.5, bob: 12 },
  { top: "10%", w: 230, dur: 70, delay: -50, o: 0.8, bob: 7 },
  { top: "38%", w: 260, dur: 64, delay: -15, o: 0.75, bob: 8 },
  { top: "62%", w: 210, dur: 76, delay: -58, o: 0.75, bob: 6 },
  { top: "16%", w: 340, dur: 48, delay: -30, o: 0.9, bob: 5 },
  { top: "56%", w: 300, dur: 52, delay: -8, o: 0.85, bob: 6 },
  { top: "86%", w: 320, dur: 46, delay: -36, o: 0.85, bob: 5 },
];

function Cloud({ w }: { w: number }) {
  return (
    <svg viewBox="0 0 200 90" width={w} aria-hidden="true">
      <path d="M50 80a24 24 0 0 1-4-47.7A32 32 0 0 1 108 24a22 22 0 0 1 30 20 20 20 0 0 1 12 36H50z" fill="#ffffff" />
    </svg>
  );
}

/**
 * Drifting clouds behind the page, in three parallax layers. Starts paused when the system asks for reduced
 * motion; the pause control overrides either way and its choice persists in localStorage. Pure CSS
 * transform animations, so they run on the compositor and cost nothing while paused.
 */
export function CloudBackground() {
  // null = no choice yet: CSS follows prefers-reduced-motion until the viewer presses the button.
  const [paused, setPaused] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("clearev:clouds");
      if (saved === "paused" || saved === "playing") setPaused(saved === "paused");
      else if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setPaused(true);
    } catch {}
  }, []);
  const toggle = () => {
    setPaused((p) => {
      const next = !(p ?? window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      try {
        localStorage.setItem("clearev:clouds", next ? "paused" : "playing");
      } catch {}
      return next;
    });
  };
  return (
    <>
      <div className="sky" data-paused={paused == null ? "auto" : String(paused)} aria-hidden="true">
        {CLOUDS.map((c, i) => (
          <div key={i} className="cloud" style={{ top: c.top, width: c.w, opacity: c.o, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }}>
            <div className="cloud-bob" style={{ animationDuration: `${c.bob}s`, animationDelay: `${-i * 1.3}s` }}>
              <Cloud w={c.w} />
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-sm cloud-toggle" onClick={toggle} aria-pressed={paused === true} style={{ position: "fixed", right: 12, bottom: 12, zIndex: 40 }}>
        {paused ? "Resume background motion" : "Pause background motion"}
      </button>
    </>
  );
}
