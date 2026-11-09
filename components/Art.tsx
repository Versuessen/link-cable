"use client";
import { useState } from "react";
import { cartStyle, SYSTEMS, type RomView } from "../lib/games";

/**
 * Game artwork. Priority: custom cover → latest save screenshot → generated tile.
 * Screenshots are native emulator frames (e.g. 240×160), so they're scaled with crisp
 * nearest-neighbour pixels — that's the game's own resolution, not a filter.
 */
export default function Art({ rom, prefer = "cover", src: forced, className = "", label = true }: {
  rom: RomView; prefer?: "cover" | "shot"; src?: string | null; className?: string; label?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const src = forced !== undefined ? forced : prefer === "cover" ? rom.coverUrl ?? rom.shotUrl : rom.shotUrl ?? rom.coverUrl;
  const isShot = !!src && (src === rom.shotUrl || forced !== undefined) && src !== rom.coverUrl;
  if (src && !broken) {
    return <img className={`art ${isShot ? "shot" : ""} ${className}`} src={src} alt="" draggable={false} onError={() => setBroken(true)} />;
  }
  return <Generated rom={rom} className={className} label={label} />;
}

export function Generated({ rom, className = "", label = true }: { rom: RomView; className?: string; label?: boolean }) {
  const { color } = cartStyle(rom.title);
  const short = rom.title.replace(/^pok[eé]mon\s*[-–:]\s*/i, "").replace(/\s*version$/i, "");
  return (
    <div className={`art gen ${className}`} style={{ ["--c" as any]: color }}>
      <span className="gen-orb" /><span className="gen-orb b" />
      {label && (
        <span className="gen-text">
          <small>{SYSTEMS[rom.system].label}</small>
          <strong>{short}</strong>
        </span>
      )}
    </div>
  );
}

export const tint = (rom?: RomView | null) => (rom ? cartStyle(rom.title).color : "#5ac8fa");
