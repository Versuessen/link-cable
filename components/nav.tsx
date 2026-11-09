"use client";
/*
 * Console-style spatial navigation.
 *  - Any element with [data-nav] is focusable by d-pad / arrows / left stick.
 *  - The innermost open [data-nav-scope] (modals, drawers) traps focus.
 *  - A / Enter  → click        B / Esc / Backspace → "nav:back" event
 *  - L1 / Q     → "nav:tab" -1  R1 / E → "nav:tab" +1
 *  - Select(−) / Home / M / F1 → "nav:menu"      Start(+) / "+" / O → "nav:options"
 */
import { useEffect } from "react";
import { sfx } from "./sfx";

type Dir = "up" | "down" | "left" | "right";
export const emit = (name: string, detail?: unknown) => window.dispatchEvent(new CustomEvent(name, { detail }));

export function useNavEvent(name: "nav:back" | "nav:tab" | "nav:menu" | "nav:options", fn: (detail: any) => void, deps: unknown[] = []) {
  useEffect(() => {
    const h = (e: Event) => fn((e as CustomEvent).detail);
    window.addEventListener(name, h);
    return () => window.removeEventListener(name, h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

function scope(): ParentNode {
  const scopes = document.querySelectorAll<HTMLElement>("[data-nav-scope]");
  return scopes.length ? scopes[scopes.length - 1] : document;
}
function candidates() {
  return Array.from(scope().querySelectorAll<HTMLElement>("[data-nav]")).filter((el) => {
    if ((el as HTMLButtonElement).disabled) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

export function focusEl(el: HTMLElement | null | undefined, sound = true) {
  if (!el) return;
  el.focus({ preventScroll: true });
  // carousels position themselves (see the home tile row), so don't let the browser scroll them
  if (!el.closest("[data-noscroll]")) el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  if (sound) sfx("move");
}

export function focusFirst(selector?: string) {
  const s = scope();
  const el = (selector ? s.querySelector<HTMLElement>(selector) : null) ?? candidates()[0];
  focusEl(el, false);
}

/** Move focus programmatically. `force` skips the nav:move interception (used by hold gestures). */
export function navigate(dir: Dir, force = false) { force ? doMove(dir) : move(dir); }

function move(dir: Dir) {
  // pages can intercept a direction (e.g. the home screen's ↓↓ shortcut) by calling preventDefault
  if (!window.dispatchEvent(new CustomEvent("nav:move", { detail: { dir, from: document.activeElement }, cancelable: true }))) return;
  doMove(dir);
}
function doMove(dir: Dir) {
  const all = candidates();
  const cur = document.activeElement as HTMLElement | null;
  if (!cur || !all.includes(cur)) return focusEl(all[0]);
  const a = cur.getBoundingClientRect();
  const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best: HTMLElement | null = null, bestScore = Infinity;
  for (const el of all) {
    if (el === cur) continue;
    const b = el.getBoundingClientRect();
    const bx = b.left + b.width / 2, by = b.top + b.height / 2;
    const dx = bx - ax, dy = by - ay;
    let main: number, cross: number;
    if (dir === "right") { if (b.left < a.right - 4) continue; main = b.left - a.right; cross = Math.abs(dy); }
    else if (dir === "left") { if (b.right > a.left + 4) continue; main = a.left - b.right; cross = Math.abs(dy); }
    else if (dir === "down") { if (b.top < a.bottom - 4) continue; main = b.top - a.bottom; cross = Math.abs(dx); }
    else { if (b.bottom > a.top + 4) continue; main = a.top - b.bottom; cross = Math.abs(dx); }
    // stay in the same shelf when moving sideways
    if ((dir === "left" || dir === "right") && el.closest("[data-nav-row]") !== cur.closest("[data-nav-row]") && cur.closest("[data-nav-row]")) cross += 4000;
    const score = Math.max(0, main) + cross * 2.2;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (best) focusEl(best);
}

function activate() {
  const el = document.activeElement as HTMLElement | null;
  if (el && el.matches("[data-nav]")) { sfx("select"); el.click(); }
}

export function NavProvider() {
  useEffect(() => {
    const typing = () => {
      const t = document.activeElement as HTMLElement | null;
      return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA");
    };
    const key = (e: KeyboardEvent) => {
      document.documentElement.classList.remove("has-pad");
      if (e.defaultPrevented) return;
      const map: Record<string, Dir> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
      if (typing()) {
        if (e.key === "Escape") { (document.activeElement as HTMLElement).blur(); emit("nav:back"); }
        if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); move(map[e.key]); }
        return;
      }
      if (map[e.key]) { e.preventDefault(); move(map[e.key]); }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(); }
      else if (e.key === "Escape" || e.key === "Backspace") { e.preventDefault(); sfx("back"); emit("nav:back"); }
      else if (e.key === "q" || e.key === "Q") { sfx("tab"); emit("nav:tab", -1); }
      else if (e.key === "e" || e.key === "E") { sfx("tab"); emit("nav:tab", 1); }
      else if (e.key === "m" || e.key === "M" || e.key === "F1") { e.preventDefault(); sfx("open"); emit("nav:menu"); }
      else if (e.key === "+" || e.key === "o" || e.key === "O") { emit("nav:options"); }
    };
    // hovering with the mouse moves the console focus too, so both feel like one system
    const hover = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const el = (e.target as HTMLElement).closest?.<HTMLElement>("[data-nav]");
      if (el && el !== document.activeElement && !typing() && scope().contains(el)) el.focus({ preventScroll: true });
    };
    addEventListener("keydown", key);
    addEventListener("pointerover", hover);

    // ---- gamepad polling with key-repeat ----
    let raf = 0;
    const held: Record<string, number> = {};
    const REPEAT_DELAY = 380, REPEAT_RATE = 110;
    const press = (id: string, down: boolean, fire: () => void, repeat = false) => {
      const now = performance.now();
      if (!down) { delete held[id]; return; }
      if (!(id in held)) { held[id] = now + REPEAT_DELAY; fire(); }
      else if (repeat && now >= held[id]) { held[id] = now + REPEAT_RATE; fire(); }
    };
    const poll = () => {
      for (const p of navigator.getGamepads?.() ?? []) {
        if (!p || document.hidden) continue;
        const b = (i: number) => !!p.buttons[i]?.pressed;
        const [lx = 0, ly = 0] = p.axes;
        if (p.buttons.some((x) => x.pressed) || Math.abs(lx) > 0.6 || Math.abs(ly) > 0.6) document.documentElement.classList.add("has-pad");
        if (document.querySelector("[data-nav-off]")) { // in-game: the emulator owns the pad, only Home/Guide opens our menu
          press("menu", b(16), () => { sfx("open"); emit("nav:menu"); });
          break;
        }
        press("up", b(12) || ly < -0.6, () => move("up"), true);
        press("down", b(13) || ly > 0.6, () => move("down"), true);
        press("left", b(14) || lx < -0.6, () => move("left"), true);
        press("right", b(15) || lx > 0.6, () => move("right"), true);
        press("a", b(0), activate);
        press("b", b(1), () => { sfx("back"); emit("nav:back"); });
        press("l1", b(4), () => { sfx("tab"); emit("nav:tab", -1); });
        press("r1", b(5), () => { sfx("tab"); emit("nav:tab", 1); });
        press("menu", b(8) || b(16), () => { sfx("open"); emit("nav:menu"); });
        press("plus", b(9), () => emit("nav:options"));
        break;
      }
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    const pad = () => document.documentElement.classList.add("has-pad");
    addEventListener("gamepadconnected", pad);
    return () => { removeEventListener("keydown", key); removeEventListener("pointerover", hover); removeEventListener("gamepadconnected", pad); cancelAnimationFrame(raf); };
  }, []);
  return null;
}
