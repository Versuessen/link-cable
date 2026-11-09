"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { RomView } from "../lib/games";
import { ago, api, mb, playtime } from "../lib/client";
import { usePrefs } from "../lib/prefs";
import { FAMILIES, FRAMES, MAX_LEVEL, STEP_NAMES, evaluate, frameState, type Stats } from "../lib/flair";
import Icon from "./Icon";
import { Avatar } from "./Icon";
import { Modal, Toggle, useMe, type Push } from "./Shell";
import { EquippedBadge, FlairAvatar } from "./Flair";
import { FramedAvatar } from "./Frame";
import { BadgeArt } from "./BadgeArt";
import AvatarPicker from "./AvatarPicker";
import { focusFirst } from "./nav";
import { sfx } from "./sfx";
import type { TimelineItem } from "./Views";

const COLORS = ["#ff9f1a", "#3a8dff", "#16b26a", "#e5484d", "#9b5cf6", "#00b4c8", "#f05aa6", "#7c8a99"];
const BUILD = "0.9.0-ptr";

/** Settings: Profile · Security · Appearance · Sound · System · Storage · (Labs) · About */
export default function Settings({ roms, timeline, section = "profile", onBack, onChanged, toast }: {
  roms: RomView[]; timeline: TimelineItem[]; section?: string; onBack: () => void; onChanged: () => void; toast: Push;
}) {
  const [prefs, update] = usePrefs();
  const [sec, setSec] = useState(section);
  useEffect(() => setSec(section), [section]);
  const me = useMe();
  const [picker, setPicker] = useState(false);
  const [aboutTaps, setAboutTaps] = useState(0);
  useEffect(() => { setTimeout(() => focusFirst(`.snav[data-sec="${section}"]`), 60); }, [section]);

  const SECTIONS = [
    { id: "profile", icon: "user", label: "Profile" },
    { id: "security", icon: "shield", label: "Security" },
    { id: "appearance", icon: "sun", label: "Appearance" },
    { id: "sound", icon: "sound", label: "Sound" },
    { id: "system", icon: "clock", label: "System" },
    { id: "storage", icon: "disk", label: "Storage" },
    ...(prefs.labs ? [{ id: "labs", icon: "flask", label: "Labs (PTR)" }] : []),
    { id: "about", icon: "info", label: "About" },
  ];
  const refreshMe = () => dispatchEvent(new Event("pc-me"));

  return (
    <section className="view settings">
      <div className="pagehead">
        <button className="backbtn" onClick={onBack} aria-label="Back"><Icon name="back" size={26} /></button>
        <h1>Settings</h1>
      </div>
      <div className="settings-grid">
        <nav className="settings-nav">
          {SECTIONS.map((s) => (
            <button key={s.id} data-nav data-sec={s.id} className={`snav ${sec === s.id ? "on" : ""}`} onFocus={() => setSec(s.id)} onClick={() => setSec(s.id)}>
              <Icon name={s.icon} size={24} />{s.label}
            </button>
          ))}
        </nav>
        <div className="settings-body" key={sec}>
          {sec === "profile" && <ProfileSection me={me} roms={roms} onPicture={() => setPicker(true)} refresh={refreshMe} toast={toast} />}
          {sec === "security" && <SecuritySection me={me} toast={toast} />}
          {sec === "appearance" && (<>
            <h2>Appearance</h2>
            <div className="row tall">
              <span><b>Theme</b><small>Basic white, basic black, or follow your device</small></span>
              <span className="seg">
                {(["light", "dark", "system"] as const).map((t) => (
                  <button key={t} data-nav className={prefs.theme === t ? "on" : ""} onClick={() => { update({ theme: t }); sfx("tab"); }}>
                    <Icon name={t === "light" ? "sun" : t === "dark" ? "moon" : "pad"} size={18} />{t === "light" ? "Light" : t === "dark" ? "Dark" : "Auto"}
                  </button>
                ))}
              </span>
            </div>
            <div className="row tall"><span><b>Reduce motion</b><small>Turns off tile, panel and background animations</small></span><Toggle label="Reduce motion" on={prefs.reduceMotion} onChange={(v) => update({ reduceMotion: v })} /></div>
          </>)}
          {sec === "sound" && (<>
            <h2>Sound</h2>
            <div className="row tall"><span><b>Interface sounds</b><small>Clicks when moving and selecting</small></span><Toggle label="Interface sounds" on={prefs.sounds} onChange={(v) => update({ sounds: v })} /></div>
          </>)}
          {sec === "system" && (<>
            <h2>System</h2>
            <div className="row tall"><span><b>24-hour clock</b><small>Always show the time in 24-hour format</small></span><Toggle label="24-hour clock" on={prefs.clock24} onChange={(v) => update({ clock24: v })} /></div>
            <div className="row tall"><span><b>Cloud saves</b><small>Autosave every 45 s, when leaving a tab, and from the in-game menu</small></span><span className="dim">Always on</span></div>
          </>)}
          {sec === "storage" && <StorageSection roms={roms} onChanged={onChanged} toast={toast} />}
          {sec === "labs" && <LabsSection me={me} roms={roms} timeline={timeline} refresh={refreshMe} />}
          {sec === "about" && (<>
            <h2>About</h2>
            <div className="row tall"><span><b>Link Cable</b><small>Your own cartridge library, playable anywhere · EmulatorJS · mGBA (GBA), Gambatte (GB/GBC), melonDS (DS)</small></span></div>
            {/* tap the build number 5× to reveal Labs (PTR) — like Android's developer options */}
            <button data-nav className="row tall rowbtn" onClick={() => {
              if (prefs.labs) { toast({ title: "Labs is already on", icon: "flask" }, 1600); return; }
              const n = aboutTaps + 1; setAboutTaps(n); sfx("tab");
              if (n >= 5) { update({ labs: true }); sfx("saved"); toast({ title: "Labs unlocked", text: "Settings › Labs (PTR) — experimental features", icon: "flask" }); }
              else if (n >= 2) toast({ title: `${5 - n} more…`, icon: "flask" }, 900);
            }}>
              <span><b>Build</b><small>{BUILD}</small></span><span className="dim">{prefs.labs ? "Labs on" : ""}</span>
            </button>
            <div className="row tall"><span><b>This device</b></span><span className="dim">{typeof navigator !== "undefined" ? navigator.platform : ""}</span></div>
          </>)}
        </div>
      </div>
      {picker && <AvatarPicker me={me} onClose={() => setPicker(false)} />}
    </section>
  );
}

// ---------------------------------------------------------------- Profile
function ProfileSection({ me, roms, onPicture, refresh, toast }: { me: ReturnType<typeof useMe>; roms: RomView[]; onPicture: () => void; refresh: () => void; toast: Push }) {
  const [name, setName] = useState("");
  useEffect(() => { if (me) setName(me.name); }, [me?.name]); // eslint-disable-line
  const played = roms.reduce((a, r) => a + (r.playSeconds ?? 0), 0);
  const saveName = async () => {
    if (!name.trim() || name.trim() === me?.name) return;
    try { await api("/api/account", { method: "PATCH", body: JSON.stringify({ name }) }); refresh(); sfx("saved"); toast({ title: "Name updated" }, 1800); }
    catch (e: any) { sfx("error"); toast({ title: "Couldn't rename", text: e.message, error: true }); }
  };
  return (<>
    <h2>Profile</h2>
    <div className="profile-card">
      <button data-nav className="avatar-btn big" onClick={onPicture} aria-label="Change profile picture">
        <FlairAvatar name={me?.name} color={me?.color} src={me?.avatar} size={112} flair={me?.profile?.flair} />
        <span className="avatar-edit"><Icon name="pencil" size={18} /></span>
      </button>
      <div className="profile-meta">
        <strong>{me?.name} <EquippedBadge flair={me?.profile?.flair} size={34} /></strong>
        <span>{me?.owner ? "Owner" : "Member"}{me?.createdAt ? ` · since ${new Date(me.createdAt).toLocaleDateString("en", { month: "long", year: "numeric" })}` : ""}</span>
        <span className="profile-stats"><b>{roms.length}</b> games <i /> <b>{playtime(played)}</b> hours played</span>
      </div>
    </div>
    <div className="row tall">
      <span><b>Profile picture</b><small>Any Nintendo character or Pokémon</small></span>
      <button data-nav className="btn" onClick={onPicture}><Icon name="image" size={20} />Change</button>
    </div>
    <div className="row tall">
      <span><b>Display name</b><small>Shown on the “Who's playing?” screen</small></span>
      <span className="pwrow">
        <input data-nav className="lock-input" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveName()} />
        <button data-nav className="btn primary" disabled={!name.trim() || name.trim() === me?.name} onClick={saveName}>Save</button>
      </span>
    </div>
    <div className="row tall">
      <span><b>Colour</b><small>Behind your picture and initial</small></span>
      <span className="swatches">
        {COLORS.map((c) => <button key={c} data-nav aria-label={`Colour ${c}`} className={`swatch ${me?.color === c ? "on" : ""}`} style={{ background: c }}
          onClick={async () => { await api("/api/account", { method: "PATCH", body: JSON.stringify({ color: c }) }); refresh(); sfx("tab"); }} />)}
      </span>
    </div>
  </>);
}

// ---------------------------------------------------------------- Security
function SecuritySection({ me, toast }: { me: ReturnType<typeof useMe>; toast: Push }) {
  const [pw, setPw] = useState({ cur: "", a: "", b: "" });
  const [members, setMembers] = useState<any[] | null>(null);
  const [confirm, setConfirm] = useState<null | { kind: "remove"; user: any } | { kind: "delete" }>(null);
  const [delPw, setDelPw] = useState("");
  useEffect(() => { if (me?.owner) api<{ members: any[] }>("/api/members").then((d) => setMembers(d.members)).catch(() => setMembers([])); }, [me?.owner]);
  const changePw = async () => {
    try {
      await api("/api/account", { method: "PATCH", body: JSON.stringify({ currentPassword: pw.cur, password: pw.a }) });
      setPw({ cur: "", a: "", b: "" }); sfx("saved"); toast({ title: "Password changed", text: "Other devices were signed out", icon: "shield" });
    } catch (e: any) { sfx("error"); toast({ title: "Couldn't change password", text: e.message, error: true }); }
  };
  return (<>
    <h2>Security</h2>
    <div className="row tall col">
      <span><b>Change password</b><small>At least 6 characters. Other devices get signed out.</small></span>
      <span className="pwrow">
        <input data-nav className="lock-input" type="password" placeholder="Current password" value={pw.cur} onChange={(e) => setPw({ ...pw, cur: e.target.value })} autoComplete="current-password" />
        <input data-nav className="lock-input" type="password" placeholder="New password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} autoComplete="new-password" />
        <input data-nav className="lock-input" type="password" placeholder="Confirm new" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} autoComplete="new-password" />
        <button data-nav className="btn primary" disabled={!pw.cur || pw.a.length < 6 || pw.a !== pw.b} onClick={changePw}>Update</button>
      </span>
    </div>
    <div className="row tall">
      <span><b>Sign out other devices</b><small>Phones, laptops or browsers you're still signed in on. This one stays signed in.</small></span>
      <button data-nav className="btn" onClick={async () => { await api("/api/account", { method: "POST", body: JSON.stringify({ action: "signout-others" }) }); sfx("saved"); toast({ title: "Signed out everywhere else", icon: "shield" }); }}>Sign out others</button>
    </div>
    {me?.owner && (<>
      <h3 className="subhead">People on this PC</h3>
      {members === null ? <div className="row skeleton" style={{ height: 76 }} /> : members.map((m) => (
        <div key={m.id} className="row">
          <span className="acct"><Avatar name={m.name} color={m.color} src={m.avatar} size={44} /><span><b>{m.name}{m.id === me.id ? " (you)" : ""}</b><small>{m.owner ? "Owner" : "Member"} · joined {ago(m.createdAt)} · {playtime(m.playSeconds)} h</small></span></span>
          {m.id !== me.id && <button data-nav className="btn danger" onClick={() => setConfirm({ kind: "remove", user: m })}>Remove</button>}
        </div>
      ))}
      <p className="hint-text">Friends join with your <code>INVITE_CODE</code> (set in Vercel). Remove the variable to close sign-ups.</p>
    </>)}
    {me && !me.owner && (
      <div className="row tall">
        <span><b>Delete my account</b><small>Removes your games, cloud saves and profile from this PC. Can't be undone.</small></span>
        <button data-nav className="btn danger" onClick={() => setConfirm({ kind: "delete" })}>Delete account</button>
      </div>
    )}
    {confirm?.kind === "remove" && (
      <Modal title={`Remove ${confirm.user.name}?`} onClose={() => setConfirm(null)} actions={[
        { label: "Remove", danger: true, onClick: async () => { await api(`/api/members?id=${confirm.user.id}`, { method: "DELETE" }); setMembers((m) => m?.filter((x) => x.id !== confirm.user.id) ?? null); setConfirm(null); sfx("back"); } },
        { label: "Cancel", primary: true, onClick: () => setConfirm(null) },
      ]}><p>Their account, games and cloud saves will be deleted.</p></Modal>
    )}
    {confirm?.kind === "delete" && (
      <Modal title="Delete your account?" onClose={() => setConfirm(null)} actions={[
        { label: "Delete forever", danger: true, onClick: async () => {
          try { await api("/api/account", { method: "DELETE", body: JSON.stringify({ password: delPw }) }); location.replace("/login"); }
          catch (e: any) { sfx("error"); toast({ title: "Couldn't delete", text: e.message, error: true }); }
        } },
        { label: "Cancel", primary: true, onClick: () => setConfirm(null) },
      ]}>
        <p>Everything you stored here is removed. Enter your password to confirm.</p>
        <label className="field"><input data-nav type="password" value={delPw} onChange={(e) => setDelPw(e.target.value)} placeholder="Password" /></label>
      </Modal>
    )}
  </>);
}

// ---------------------------------------------------------------- Storage
function StorageSection({ roms, onChanged, toast }: { roms: RomView[]; onChanged: () => void; toast: Push }) {
  const [run, setRun] = useState<string | null>(null);
  const missing = roms.filter((r) => !r.coverVer);
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);
  const me = useMe();
  useEffect(() => { api<{ used: number; limit: number }>("/api/storage").then(setUsage).catch(() => {}); }, [roms.length]);
  async function fixCors() {
    try { await api("/api/storage", { method: "POST" }); sfx("saved"); toast({ title: "Upload permissions set", text: "The bucket now accepts uploads from this site" }, 3000); }
    catch (e: any) { toast({ title: "Couldn't set permissions", text: e?.message ?? "Set the CORS rule in your storage dashboard instead" }, 5000); }
  }
  async function fetchCovers() {
    let found = 0;
    const t = toast({ title: "Finding cover art…", text: `0 / ${missing.length}`, progress: 0, icon: "image" }, 0);
    for (const [i, r] of missing.entries()) {
      setRun(r.title);
      const res = await api<{ ok?: boolean }>(`/api/roms/${r.id}`, { method: "POST", body: JSON.stringify({ action: "cover-auto" }) }).catch(() => ({ ok: false }));
      if (res.ok) found++;
      t.update({ text: `${i + 1} / ${missing.length} · ${r.title}`, progress: (i + 1) / missing.length });
    }
    setRun(null);
    t.update({ title: `Found ${found} of ${missing.length} covers`, text: found < missing.length ? "Pick the rest from each game's page" : undefined, progress: undefined, icon: "cloudok" });
    t.close(4000); sfx("saved"); onChanged();
  }
  return (<>
    <h2>Storage</h2>
    {usage && (
      <div className="row tall"><span><b>Bucket</b><small>All accounts together · uploads stop at the limit so the free tier is never exceeded</small>
        <span className="xp-bar" style={{ marginTop: 8, display: "block", width: 280 }}><i style={{ width: `${Math.min(100, (usage.used / usage.limit) * 100)}%` }} /></span></span>
        <span>{mb(usage.used)} / {mb(usage.limit)}</span></div>
    )}
    <div className="row tall"><span><b>Games</b><small>Stored in your private space in the bucket</small></span><span>{roms.length} · {mb(roms.reduce((a, r) => a + r.size, 0))}</span></div>
    <div className="row tall"><span><b>Total play time</b></span><span>{playtime(roms.reduce((a, r) => a + (r.playSeconds ?? 0), 0))} hrs</span></div>
    <div className="row tall"><span><b>Cover art</b><small>{missing.length ? `${missing.length} game${missing.length > 1 ? "s" : ""} without a cover` : "Every game has a cover"} · libretro-thumbnails box art</small></span>
      <button data-nav className="btn" disabled={!missing.length || !!run} onClick={fetchCovers}><Icon name="wand" size={20} />{run ? "Searching…" : "Find missing covers"}</button></div>
    <div className="row tall"><span><b>Downloaded ROM cache</b><small>ROMs cached on this device so they only download once</small></span>
      <button data-nav className="btn" onClick={async () => { await caches.delete("linkcable-roms"); sfx("back"); toast({ title: "Cache cleared" }, 1500); }}>Clear cache</button></div>
    {me?.owner && <div className="row tall"><span><b>Upload permissions</b><small>Writes the bucket's CORS rule for this site's address. Run once after setting up storage.</small></span>
      <button data-nav className="btn" onClick={fixCors}>Set up</button></div>}
  </>);
}

// ---------------------------------------------------------------- Labs (PTR)
function LabsSection({ me, roms, timeline, refresh }: { me: ReturnType<typeof useMe>; roms: RomView[]; timeline: TimelineItem[]; refresh: () => void }) {
  const [prefs, update] = usePrefs();
  const [users, setUsers] = useState(1);
  const [previewSt, setPreviewSt] = useState<{ tier: (typeof FRAMES)[number]; stage: number; max: boolean } | null>(null);
  const setPreview = (v: null | { tier: (typeof FRAMES)[number]; stage: number; max: boolean }) => setPreviewSt(v);
  useEffect(() => { fetch("/api/users").then((r) => r.json()).then((d) => setUsers(d.users?.length ?? 1)).catch(() => {}); }, []);
  const prof = me?.profile ?? {};
  const stats: Stats = useMemo(() => ({
    games: roms, saves: Math.max(prof.saves ?? 0, timeline.length), nightSaves: prof.nightSaves ?? 0, earlySaves: prof.earlySaves ?? 0,
    devices: Math.max(prof.devices?.length ?? 0, new Set(timeline.map((t) => t.device)).size),
    accountDays: me?.createdAt ? Math.floor((Date.now() - me.createdAt) / 86400000) : 0, users, owner: !!me?.owner,
  }), [roms, timeline, prof.saves, prof.nightSaves, prof.earlySaves, prof.devices, me?.createdAt, me?.owner, users]);
  const ev = useMemo(() => evaluate(stats), [stats]);
  const snap = prof.flair;
  const frameChoice = snap?.frame ?? "auto";
  const st = frameState(ev.level);
  const equipped = snap?.badge ?? null;

  // keep the published snapshot (what others see) in sync with your real progress
  const publish = async (patch: { frame?: string; badge?: { id: string; step: number } | null }) => {
    const flair = { level: ev.level, frame: patch.frame ?? frameChoice, badge: patch.badge !== undefined ? patch.badge : equipped };
    await api("/api/account", { method: "PATCH", body: JSON.stringify({ flair }) }); refresh();
  };
  useEffect(() => {
    if (!me || !prefs.ptrFlair) return;
    const eqStep = equipped ? ev.earned.find((e) => e.family.id === equipped.id)?.step ?? 0 : 0;
    if (snap?.level !== ev.level || (equipped && eqStep !== equipped.step)) publish({ badge: equipped && eqStep ? { id: equipped.id, step: eqStep } : null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev.level, prefs.ptrFlair, me?.id]);

  // what the big preview shows: hovered gallery item, else your current frame
  type Show = { tier: (typeof FRAMES)[number]; stage: number; max: boolean } | null;
  const own: Show = frameChoice === "none" ? null : (() => {
    const pick = FRAMES.findIndex((f) => f.id === frameChoice);
    return pick >= 0 && pick < st.index ? { tier: FRAMES[pick], stage: 4, max: false } : { tier: st.tier, stage: st.stage, max: st.max };
  })();
  const preview = previewSt;
  const show: Show = preview ?? own;
  const nextTier = FRAMES[st.index + 1];

  return (<>
    <h2>Labs <span className="pill accent">PTR</span></h2>
    <p className="lead small">Experimental. Only visible in browsers where it's switched on.</p>
    <div className="row tall"><span><b>Profile frames &amp; badges</b><small>Level up from play time and achievements; frames change material as you climb. Equip one badge.</small></span>
      <Toggle label="Profile flair" on={prefs.ptrFlair} onChange={(v) => update({ ptrFlair: v })} /></div>

    {prefs.ptrFlair && (<>
      <div className="row tall"><span><b>Minimal frames</b><small>A thin ring with only the rotating shine: no gems, laurels or level plate.</small></span>
        <Toggle label="Minimal frames" on={prefs.ptrMinimal} onChange={(v) => update({ ptrMinimal: v })} /></div>
      {/* ---- rank card ---- */}
      <div className={`rank-card m-${(show ?? own)?.tier.material ?? "plastic"}`}>
        <div className="rank-stage">
          <FramedAvatar tier={show?.tier ?? null} stage={show?.stage} max={show?.max} level={preview ? (preview.max ? MAX_LEVEL : preview.tier.level) : ev.level} name={me?.name} color={me?.color} src={me?.avatar} size={120} minimal={prefs.ptrMinimal} />
        </div>
        <div className="rank-info">
          <span className="rank-eyebrow">{preview ? "Preview" : "Your frame"}</span>
          <strong className="rank-name">{show ? <>{show.tier.name}{(show.max || show.stage > 0) && <span className="rank-pill">{show.max ? "♛ Crowned" : ["", "●", "●●", "●●●", "★"][show.stage]}</span>}</> : "No frame"}<EquippedBadge flair={snap} size={36} /></strong>
          <span className="rank-blurb">{show?.tier.blurb}</span>
          <div className="xp">
            <div className="xp-top"><b>Level {ev.level}</b><span>{ev.level >= MAX_LEVEL ? "Max level" : `${ev.into.toLocaleString()} / ${ev.need.toLocaleString()} XP`}</span></div>
            <div className="xp-bar"><i style={{ width: `${Math.round(ev.progress * 100)}%` }} /></div>
            <small>{ev.playXp.toLocaleString()} XP from play time · {ev.achXp.toLocaleString()} XP from achievements
              {st.max ? "" : st.stage < 4 ? ` · next stud at Lv ${st.nextStageAt}` : nextTier ? ` · ${nextTier.name} at Lv ${nextTier.level}` : ""}</small>
          </div>
          {/* stage track for the current tier: plain · ● · ●● · ●●● · ★ */}
          {st.index > 0 && <div className="stage-track">
            {[0, 1, 2, 3, 4].map((k) => (
              <span key={k} className={`stage-pip ${k <= st.stage ? "on" : ""} ${k === st.stage ? "cur" : ""}`}>{k === 0 ? "○" : k === 4 ? "★" : "●".repeat(k)}</span>
            ))}
            <span className="stage-label">{st.tier.name} {st.tier.level}–{(nextTier?.level ?? MAX_LEVEL + 1) - 1}</span>
          </div>}
        </div>
      </div>

      {/* ---- frame gallery ---- */}
      <h3 className="subhead">Frames <span className="dim">· each tier: plain → ● → ●● → ●●● → ★, then the next material</span></h3>
      <div className="frame-gallery">
        {FRAMES.map((f, i) => {
          const earned = i <= st.index, on = frameChoice === f.id || (frameChoice === "auto" && i === st.index);
          const pv = { tier: f, stage: i < st.index ? 4 : i === st.index ? st.stage : 4, max: false };
          return (
            <button key={f.id} data-nav className={`frame-opt ${on ? "on" : ""} ${earned ? "" : "locked"}`}
              onMouseEnter={() => setPreview(pv)} onMouseLeave={() => setPreview(null)} onFocus={() => setPreview(pv)} onBlur={() => setPreview(null)}
              onClick={() => earned && publish({ frame: f.id }).then(() => sfx("saved"))}>
              <FramedAvatar tier={f} stage={pv.stage} name={me?.name} color={me?.color} src={me?.avatar} size={50} showLevel={false} minimal={prefs.ptrMinimal} />
              <b>{f.name}</b>
              <small>{earned ? (on ? "Equipped" : "Unlocked") : `Lv ${f.level}`}</small>
            </button>
          );
        })}
        <button data-nav className="frame-opt locked crowned" onMouseEnter={() => setPreview({ tier: FRAMES[FRAMES.length - 1], stage: 4, max: true })} onMouseLeave={() => setPreview(null)}
          onFocus={() => setPreview({ tier: FRAMES[FRAMES.length - 1], stage: 4, max: true })} onBlur={() => setPreview(null)}>
          <FramedAvatar tier={FRAMES[FRAMES.length - 1]} stage={4} max name={me?.name} color={me?.color} src={me?.avatar} size={50} showLevel={false} minimal={prefs.ptrMinimal} />
          <b>Crowned</b><small>Lv {MAX_LEVEL}</small>
        </button>
        <button data-nav className={`frame-opt ${frameChoice === "auto" ? "on" : ""}`} onClick={() => publish({ frame: "auto" }).then(() => sfx("tab"))}>
          <span className="frame-auto"><Icon name="wand" size={26} /></span><b>Auto</b><small>Always your best</small>
        </button>
        <button data-nav className={`frame-opt ${frameChoice === "none" ? "on" : ""}`} onClick={() => publish({ frame: "none" }).then(() => sfx("tab"))}>
          <span className="frame-auto"><Icon name="close" size={24} /></span><b>None</b><small>Plain picture</small>
        </button>
      </div>

      {/* ---- badge cabinet ---- */}
      <h3 className="subhead">Badges <span className="dim">· equip one, it shows next to your name</span></h3>
      <div className="cabinet">
        {ev.earned.map(({ family: f, step, value, next }) => {
          const on = equipped?.id === f.id;
          const prog = next ? Math.min(1, value / next) : 1;
          return (
            <button key={f.id} data-nav className={`cab ${on ? "on" : ""} ${step ? "" : "locked"}`} onClick={() => {
              if (!step) { sfx("error"); return; }
              publish({ badge: on ? null : { id: f.id, step } }).then(() => sfx(on ? "back" : "saved"));
            }}>
              <BadgeArt art={f.art} step={step} size={78} shine={on} />
              <span className="cab-text">
                <b>{f.name}</b>
                <small>{step ? `${f.id === "host" ? "Earned" : STEP_NAMES[step - 1]}${next ? ` · next: ${f.desc(next)}` : f.id === "host" ? "" : " · maxed"}` : f.desc(f.steps[0])}</small>
                {f.id !== "host" && <span className="cab-bar"><i style={{ width: `${prog * 100}%` }} /></span>}
                {f.id !== "host" && <small className="cab-count">{value}{next ? ` / ${next}` : ""} {f.unit}</small>}
              </span>
              {on && <span className="cab-eq">Equipped</span>}
            </button>
          );
        })}
      </div>
      <p className="hint-text">Ideas for later: seasonal frames, prestige after Lv 100, per-game mastery badges, frame unlock animation.</p>
    </>)}
    <div className="row tall"><span><b>Turn off Labs</b><small>Hides this section again (your progress and picks are kept)</small></span>
      <button data-nav className="btn" onClick={() => update({ labs: false, ptrFlair: false })}>Hide Labs</button></div>
  </>);
}
