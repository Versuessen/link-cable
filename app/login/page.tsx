"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Icon, { Avatar } from "../../components/Icon";
import { EquippedBadge, FlairAvatar, type FlairSnapshot } from "../../components/Flair";
import { Clock, HintButton, H } from "../../components/Shell";
import { usePrefs } from "../../lib/prefs";
import { focusFirst, useNavEvent } from "../../components/nav";
import { sfx } from "../../components/sfx";

type U = { id: string; name: string; color: string; owner?: boolean; avatar?: string; flair?: FlairSnapshot | null };
type Mode = { kind: "pick" } | { kind: "password"; user: U } | { kind: "create"; first: boolean };

/** "Who's playing?" — pick your account, enter your password, or create one. */
function Lock() {
  const [users, setUsers] = useState<U[] | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: "pick" });
  const [date, setDate] = useState("");
  const [leaving, setLeaving] = useState(false);
  const next = useSearchParams().get("next") || "/";
  const [prefs] = usePrefs();
  // every picture (and the + circle) gets the same stage, so framed and unframed line up
  const stage = prefs.ptrFlair ? Math.round(120 * (prefs.ptrMinimal ? 36 : 58) / 30) : 132;

  useEffect(() => {
    setDate(new Date().toLocaleDateString("en", { weekday: "long", day: "numeric", month: "long" }));
    fetch("/api/users").then((r) => r.json()).then((d) => {
      setUsers(d.users);
      if (d.setup) setMode({ kind: "create", first: true });
      else if (d.users.length === 1) setMode({ kind: "password", user: d.users[0] });
      setTimeout(() => focusFirst(".lock [data-autofocus], .lock [data-nav]"), 60);
    }).catch(() => setUsers([]));
  }, []);
  useNavEvent("nav:back", () => { if (mode.kind !== "pick" && !(mode.kind === "create" && mode.first)) { setMode({ kind: "pick" }); setTimeout(() => focusFirst(".lock [data-nav]"), 40); } }, [mode]);

  const done = () => { sfx("open"); setLeaving(true); setTimeout(() => location.assign(next.startsWith("/") ? next : "/"), 420); };

  return (
    <main className={`lock ${leaving ? "unlocking" : ""}`}>
      <div className="wash" aria-hidden><i /><i /></div>
      <div className="lock-time"><Clock big /><span>{date}</span></div>
      <div className="lock-brand"><Icon name="cart" size={22} />Link Cable</div>

      {mode.kind === "pick" && users && (
        <div className="lock-card wide">
          <h2>Who&apos;s playing?</h2>
          <div className="userrow" style={{ ["--stage" as any]: `${stage}px` }}>
            {users.map((u) => (
              <button key={u.id} data-nav className="userbtn" onClick={() => { setMode({ kind: "password", user: u }); }}>
                <span className="user-stage"><FlairAvatar name={u.name} color={u.color} src={u.avatar} size={120} flair={u.flair} /></span>
                <span className="user-name">{u.name}<EquippedBadge flair={u.flair} size={26} /></span>
              </button>
            ))}
            <button data-nav className="userbtn add" onClick={() => setMode({ kind: "create", first: false })}>
              <span className="user-stage"><span className="add-circle"><Icon name="plus" size={44} stroke={2.4} /></span></span>
              <span>Add user</span>
            </button>
          </div>
        </div>
      )}
      {mode.kind === "password" && <PasswordForm user={mode.user} onBack={users && users.length > 1 ? () => setMode({ kind: "pick" }) : () => setMode({ kind: "pick" })} onDone={done} />}
      {mode.kind === "create" && <CreateForm first={mode.first} onBack={() => setMode({ kind: "pick" })} onDone={done} />}

      <footer className="bottombar">
        <span className="hint"><Icon name="cart" size={22} /></span>
        <div className="hints">
          {mode.kind !== "pick" && !(mode.kind === "create" && mode.first) && <HintButton h={H.back} />}
          {mode.kind === "pick" && <HintButton h={{ ...H.select, label: "OK" }} />}
        </div>
      </footer>
    </main>
  );
}

function PasswordForm({ user, onBack, onDone }: { user: U; onBack: () => void; onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "wrong">("idle");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { setTimeout(() => ref.current?.focus(), 30); }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pw || state === "busy") return;
    setState("busy");
    const r = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: user.id, password: pw }) });
    if (r.ok) onDone();
    else { sfx("error"); setState("wrong"); setPw(""); ref.current?.focus(); }
  }
  return (
    <form className={`lock-card ${state === "wrong" ? "shake" : ""}`} onSubmit={submit}>
      <button type="button" className="lock-user" onClick={onBack} aria-label="Choose another user"><FlairAvatar name={user.name} color={user.color} src={user.avatar} size={128} flair={user.flair} /></button>
      <strong>{user.name}</strong>
      <label className="lock-field">
        <Icon name="lock" size={22} />
        <input ref={ref} data-nav type="password" value={pw} onChange={(e) => { setPw(e.target.value); if (state === "wrong") setState("idle"); }}
          placeholder="Password" autoComplete="current-password" maxLength={64} aria-label="Password" />
        <button className="lock-go" disabled={state === "busy" || !pw} aria-label="Unlock"><Icon name="back" size={22} className="flip" stroke={2.6} /></button>
      </label>
      <span className="lock-msg">{state === "wrong" ? "That password isn't right." : " "}</span>
    </form>
  );
}

function CreateForm({ first, onBack, onDone }: { first: boolean; onBack: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: "", password: "", confirm: "", invite: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.password !== f.confirm) { setErr("The passwords don't match."); sfx("error"); return; }
    setBusy(true); setErr("");
    const r = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) onDone(); else { setErr(d.error || "Couldn't create the account."); sfx("error"); }
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <form className="lock-card form" onSubmit={submit}>
      <Avatar name={f.name || "?"} color="#3a8dff" size={96} />
      <h2>{first ? "Welcome! Create your account" : "Add a user"}</h2>
      <p className="lock-sub">{first ? "You'll be the owner. Friends can join later with an invite code." : "Each user gets their own private library and cloud saves."}</p>
      <input data-nav data-autofocus className="lock-input" value={f.name} onChange={set("name")} placeholder="Name" maxLength={24} autoComplete="username" />
      <input data-nav className="lock-input" type="password" value={f.password} onChange={set("password")} placeholder="Password (6+ characters)" autoComplete="new-password" />
      <input data-nav className="lock-input" type="password" value={f.confirm} onChange={set("confirm")} placeholder="Confirm password" autoComplete="new-password" />
      {!first && <input data-nav className="lock-input" value={f.invite} onChange={set("invite")} placeholder="Invite code" autoComplete="off" />}
      <span className="lock-msg">{err || " "}</span>
      <div className="lock-actions">
        {!first && <button type="button" data-nav className="btn" onClick={onBack}>Cancel</button>}
        <button data-nav className="btn primary" disabled={busy || !f.name || !f.password}>{busy ? "Creating…" : "Create account"}</button>
      </div>
    </form>
  );
}

export default function Page() { return <Suspense><Lock /></Suspense>; }
