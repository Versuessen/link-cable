"use client";
import { FramedAvatar } from "./Frame";
import { BadgeArt } from "./BadgeArt";
import { Avatar } from "./Icon";
import { FAMILIES, STEP_NAMES, resolveFrame, type FlairSnapshot } from "../lib/flair";
import { usePrefs } from "../lib/prefs";

export type { FlairSnapshot };

/** Avatar with its PTR frame — plain avatar unless Labs › Profile flair is on in this browser. */
/** Labs preview: while set, *your own* picture is drawn as if you were this level (nothing is saved or published). */
export const previewFlair = (flair: FlairSnapshot | null | undefined, prefs: { labs: boolean; devLevel: number | null; devBadge?: { id: string; step: number } | null }): FlairSnapshot | null | undefined =>
  prefs.labs && prefs.devLevel != null ? { level: prefs.devLevel, frame: flair?.frame === "none" ? "none" : "auto", badge: prefs.devBadge ?? flair?.badge } : flair;

export function FlairAvatar({ name, color, src, size = 48, flair: published, compact = false, showLevel = true, self = false }: {
  name?: string; color?: string; src?: string | null; size?: number; flair?: FlairSnapshot | null; compact?: boolean; showLevel?: boolean; /** this is the signed-in user */ self?: boolean;
}) {
  const [prefs] = usePrefs();
  const flair = self ? previewFlair(published, prefs) : published;
  const f = prefs.ptrFlair ? resolveFrame(flair) : null;
  if (!f) return <Avatar name={name} color={color} src={src} size={size} />;
  return <FramedAvatar tier={f.tier} stage={f.stage} max={f.max} level={flair?.level} name={name} color={color} src={src} size={size} compact={compact} showLevel={showLevel} minimal={prefs.ptrMinimal} />;
}

/** The one equipped badge, shown next to a name. */
export function EquippedBadge({ flair, size = 26, self = false }: { flair?: FlairSnapshot | null; size?: number; self?: boolean }) {
  const [prefs] = usePrefs();
  const b = (self ? previewFlair(flair, prefs) : flair)?.badge;
  if (!prefs.ptrFlair || !b) return null;
  const fam = FAMILIES.find((f) => f.id === b.id);
  if (!fam || !b.step) return null;
  return <span className="equipped-badge" title={`${fam.name} · ${fam.id === "host" ? "" : STEP_NAMES[b.step - 1]}`}><BadgeArt art={fam.art} step={b.step} size={size} /></span>;
}
