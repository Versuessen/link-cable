"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { sfx } from "./sfx";

/**
 * Console-style tile row.
 *  - Stays put until the focus passes the 3rd tile, then scrolls so the focused tile keeps
 *    two tiles of buffer on each side (it sits in the middle of five).
 *  - Clamps at both ends, so the first/last tiles can still be focused at the edge.
 *  - Soft edge fades only while there's more to scroll that way; they fade out at the ends.
 * Positions are computed from the tile size (not measured mid-animation), so it never jitters.
 */
export default function Carousel({ count, index, onStep, children }: {
  count: number; index: number; onStep: (dir: -1 | 1) => void; children: React.ReactNode;
}) {
  const view = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);
  const [fade, setFade] = useState({ l: false, r: false });
  const wheel = useRef({ acc: 0, at: 0 });
  const touch = useRef<number | null>(null);

  useLayoutEffect(() => {
    const calc = () => {
      const v = view.current, p = probe.current;
      if (!v || !p || !count) return;
      const track = v.firstElementChild as HTMLElement;
      const cs = getComputedStyle(track);
      const T = p.offsetWidth, F = T * 1.36, G = parseFloat(cs.columnGap) || 0, padL = parseFloat(cs.paddingLeft) || 0, padR = parseFloat(cs.paddingRight) || 0;
      const first = Math.max(0, Math.min(index - 2, count - 5));
      const x = first * (T + G);
      // right edge of the last tile, given exactly one tile is enlarged
      const contentRight = padL + (count - 1) * (T + G) + F;
      setShift(x);
      setFade({ l: x > 1, r: contentRight - x > v.clientWidth - padR * 0.4 });
    };
    calc();
    addEventListener("resize", calc);
    return () => removeEventListener("resize", calc);
  }, [index, count]);

  const step = (d: -1 | 1) => {
    if ((d < 0 && index <= 0) || (d > 0 && index >= count - 1)) return;
    sfx("move"); onStep(d);
  };

  return (
    <div
      ref={view}
      className={`carousel ${fade.l ? "fade-l" : ""} ${fade.r ? "fade-r" : ""}`}
      data-noscroll data-nav-row
      onWheel={(e) => {
        const w = wheel.current, d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        w.acc += d;
        if (Math.abs(w.acc) > 70 && performance.now() - w.at > 140) { step(w.acc > 0 ? 1 : -1); w.acc = 0; w.at = performance.now(); }
      }}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touch.current == null) return;
        const dx = e.changedTouches[0].clientX - touch.current; touch.current = null;
        if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
      }}
    >
      <div className="track" style={{ transform: `translate3d(${-shift}px,0,0)` }}>{children}</div>
      <span ref={probe} className="tile-probe" aria-hidden />
    </div>
  );
}
