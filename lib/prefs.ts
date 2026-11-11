"use client";
import { useEffect, useState } from "react";

export type Prefs = { theme: "light" | "dark" | "system"; sounds: boolean; clock24: boolean; reduceMotion: boolean; labs: boolean; ptrFlair: boolean; ptrMinimal: boolean; devLevel: number | null; devBadge: { id: string; step: number } | null; devAll: boolean };
const DEFAULTS: Prefs = { theme: "system", sounds: true, clock24: true, reduceMotion: false, labs: false, ptrFlair: false, ptrMinimal: false, devLevel: null, devBadge: null, devAll: false };
const KEY = "pc_prefs";

export function readPrefs(): Prefs {
  if (typeof localStorage === "undefined") return DEFAULTS;
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return DEFAULTS; }
}

export function applyPrefs(p = readPrefs()) {
  const dark = p.theme === "dark" || (p.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.classList.toggle("reduce-motion", p.reduceMotion);
}

export function usePrefs() {
  const [prefs, set] = useState<Prefs>(DEFAULTS);
  useEffect(() => {
    set(readPrefs());
    const h = () => set(readPrefs());
    addEventListener("pc-prefs", h);
    return () => removeEventListener("pc-prefs", h);
  }, []);
  const update = (p: Partial<Prefs>) => {
    const next = { ...readPrefs(), ...p };
    localStorage.setItem(KEY, JSON.stringify(next));
    applyPrefs(next);
    dispatchEvent(new Event("pc-prefs"));
  };
  return [prefs, update] as const;
}

/** Runs before paint (inlined in <head>) so there's no light/dark flash. */
export const THEME_BOOT = `try{var p=JSON.parse(localStorage.getItem("${KEY}")||"{}"),t=p.theme||"system";document.documentElement.dataset.theme=(t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches))?"dark":"light";if(p.reduceMotion)document.documentElement.classList.add("reduce-motion")}catch(e){}`;
