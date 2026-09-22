"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "../lib/supabase";
import { hourCatalog, slotKey } from "../lib/hour";

const supabase = createBrowserClient();

function fmt(d) {
  try {
    return new Date(d).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "";
  }
}

function author(row) {
  return row.profiles?.display_name || row.profiles?.handle || "unsigned";
}

export default function Page() {
  const [session, setSession] = useState(null);
  const [hour, setHour] = useState(null);
  const [notes, setNotes] = useState([]);
  const [mine, setMine] = useState([]);
  const [logs, setLogs] = useState([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [mode, setMode] = useState("signin");
  const [now, setNow] = useState(new Date());
  const [busy, setBusy] = useState(false);

  const pulse = useMemo(() => hourCatalog(now), [now.getUTCHours(), now.getUTCDate()]);

  async function loadPublic() {
    const { data: hours } = await supabase.from("hours").select("*").order("slot", { ascending: false }).limit(1);
    setHour(hours?.[0] || null);

    const piecesQ = supabase
      .from("pieces")
      .select("id,title,body,created_at,is_public,user_id,profiles(handle,display_name)")
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .limit(40);
    const notesQ = supabase
      .from("notes")
      .select("id,title,body,created_at,is_public,user_id,profiles(handle,display_name)")
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .limit(40);

    const [p, n] = await Promise.all([piecesQ, notesQ]);
    const merged = [...(p.data || []), ...(n.data || [])].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );
    const seen = new Set();
    setNotes(merged.filter((row) => (seen.has(row.id) ? false : seen.add(row.id))));

    const { data: log } = await supabase.from("feature_log").select("*").order("shipped_at", { ascending: false }).limit(8);
    if (log?.length) setLogs(log);
    else {
      const { data: alt } = await supabase.from("hourly_log").select("*").order("created_at", { ascending: false }).limit(8);
      setLogs(alt || []);
    }
  }

  async function loadMine(userId) {
    if (!userId) return setMine([]);
    const [p, n] = await Promise.all([
      supabase.from("pieces").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabase.from("notes").select("*").eq("user_id", userId).order("created_at", { ascending: false })
    ]);
    const rows = [...(p.data || []).map((r) => ({ ...r, _t: "pieces" })), ...(n.data || []).map((r) => ({ ...r, _t: "notes" }))];
    rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    setMine(rows);
  }

  async function rotateHour() {
    try {
      await supabase.rpc("rotate_hourly_pulse");
    } catch (_) {}
    try {
      await supabase.from("hours").upsert(
        {
          slot: slotKey(new Date()),
          headline: pulse.headline,
          editorial: pulse.editorial
        },
        { onConflict: "slot" }
      );
    } catch (_) {}
    try {
      await supabase.from("feature_log").insert({
        title: pulse.headline,
        body: pulse.note
      });
    } catch (_) {}
  }

  useEffect(() => {
    loadPublic();
    rotateHour();
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session || null);
      loadMine(data.session?.user?.id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      loadMine(s?.user?.id);
    });
    const t = setInterval(() => setNow(new Date()), 1000);
    const h = setInterval(() => {
      rotateHour().then(loadPublic);
    }, 60 * 60 * 1000);
    const poll = setInterval(loadPublic, 40 * 1000);
    return () => {
      sub.subscription.unsubscribe();
      clearInterval(t);
      clearInterval(h);
      clearInterval(poll);
    };
  }, []);

  const nextHour = useMemo(() => {
    const d = new Date(now);
    d.setMinutes(60, 0, 0);
    const diff = Math.max(0, d - now);
    const m = Math.floor(diff / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, [now]);

  async function auth(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: email.split("@")[0] } }
        });
        if (error) setErr(error.message);
        else setMsg("Account made. If the inbox asks, confirm — otherwise you are already at the desk.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setErr(error.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function publish(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    if (!session) {
      setErr("Sign in first.");
      return;
    }
    setBusy(true);
    const payload = {
      user_id: session.user.id,
      title: title.trim() || "Untitled",
      body: body.trim(),
      is_public: isPublic
    };
    let { error } = await supabase.from("pieces").insert(payload);
    if (error) {
      const second = await supabase.from("notes").insert(payload);
      error = second.error;
    }
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setTitle("");
    setBody("");
    setMsg(isPublic ? "On the wall. Anyone can read it." : "In the drawer. Only you.");
    loadPublic();
    loadMine(session.user.id);
  }

  async function togglePublic(note) {
    await supabase.from(note._t || "pieces").update({ is_public: !note.is_public }).eq("id", note.id);
    loadPublic();
    loadMine(session?.user?.id);
  }

  async function remove(note) {
    await supabase.from(note._t || "pieces").delete().eq("id", note.id);
    loadPublic();
    loadMine(session?.user?.id);
  }

  const featured =
    notes.find((n) => n.id === hour?.featured_note_id) || notes[0] || null;

  return (
    <div className="page">
      <div className="grain" aria-hidden="true" />
      <div className="wrap">
        <header className="mast">
          <h1 className="brand">
            <span>Est. this hour</span>
            Copper Desk
          </h1>
          <div className="clock">
            <div className="ring" style={{ "--p": `${((60 - now.getMinutes()) / 60) * 100}%` }} />
            <div className="clock-copy">
              <b>{nextHour}</b>
              <small>until the hour turns</small>
              <em>{now.toUTCString().slice(17, 22)} UTC</em>
            </div>
          </div>
        </header>

        <nav className="top">
          <a href="#wall">The wall</a>
          <a href="#desk">The desk</a>
          <a href="#log">Hourly log</a>
        </nav>

        <div className="ticker">
          <div className="ticker-track">
            {[0, 1].map((i) => (
              <span key={i}>
                Public pieces stay on the wall · Private drafts stay in the drawer · Feature of the hour: {pulse.title} · Write something worth leaving out ·{" "}
              </span>
            ))}
          </div>
        </div>

        <section className="hero">
          <div>
            <div className="kicker">This hour · {pulse.title}</div>
            <h2 className="headline ink-in">{hour?.headline || pulse.headline}</h2>
            <p className="lede">{hour?.editorial || pulse.editorial}</p>
            <p className="feature-note">{pulse.note}</p>
          </div>
          <aside className="hour-card">
            <div className="kicker">From the wall</div>
            <h3>{featured?.title || "Waiting on the first public piece"}</h3>
            <p>
              {(
                featured?.body ||
                "Mark a piece public and it takes a seat on the mast. Private writing never leaves your drawer."
              ).slice(0, 280)}
            </p>
            {featured && (
              <div className="meta">
                <span>{author(featured)}</span>
                <span>{fmt(featured.created_at)}</span>
              </div>
            )}
          </aside>
        </section>

        <section className="grid" id="wall">
          <div>
            <div className="kicker">Public wall</div>
            <div className="wall">
              {notes.length === 0 && (
                <article className="note">
                  <h4>Empty on purpose</h4>
                  <p>Nothing public yet. Sign in, write, and leave the copper switch on.</p>
                </article>
              )}
              {notes.map((n, i) => (
                <article className="note" key={n.id} style={{ animationDelay: `${i * 45}ms` }}>
                  <h4>{n.title}</h4>
                  <p>{n.body}</p>
                  <div className="meta">
                    <span>{author(n)}</span>
                    <span>{fmt(n.created_at)}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <aside className="panel" id="desk">
            {!session ? (
              <form onSubmit={auth}>
                <h3>{mode === "signup" ? "Take a desk" : "Return to the desk"}</h3>
                <p>Email and password. Sessions persist. Private drafts never hit the wall.</p>
                <label>Email</label>
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required autoComplete="email" />
                <label>Password</label>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  required
                  minLength={6}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                />
                <div className="row" style={{ marginTop: 16 }}>
                  <button type="submit" disabled={busy}>
                    {busy ? "Working…" : mode === "signup" ? "Create account" : "Sign in"}
                  </button>
                  <button type="button" className="ghost" onClick={() => setMode(mode === "signup" ? "signin" : "signup")}>
                    {mode === "signup" ? "Have a desk?" : "New here?"}
                  </button>
                </div>
                <p className="err">{err}</p>
                <p className="ok">{msg}</p>
              </form>
            ) : (
              <form onSubmit={publish}>
                <h3>Your desk</h3>
                <p>{session.user.email}</p>
                <label>Title</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
                <label>Piece</label>
                <textarea value={body} onChange={(e) => setBody(e.target.value)} required maxLength={8000} />
                <div className="row">
                  <input id="pub" type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
                  <label htmlFor="pub" style={{ margin: 0 }}>
                    Mark public
                  </label>
                </div>
                <div className="row">
                  <button type="submit" disabled={busy}>
                    {busy ? "Saving…" : "Save"}
                  </button>
                  <button type="button" className="ghost" onClick={signOut}>
                    Sign out
                  </button>
                </div>
                <p className="err">{err}</p>
                <p className="ok">{msg}</p>
                <ul className="log">
                  {mine.map((n) => (
                    <li key={n.id}>
                      <strong>{n.title}</strong> · {n.is_public ? "public" : "private"}
                      <div className="row">
                        <button type="button" className="ghost" onClick={() => togglePublic(n)}>
                          {n.is_public ? "Make private" : "Make public"}
                        </button>
                        <button type="button" className="ghost" onClick={() => remove(n)}>
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </form>
            )}
            <div id="log">
              <div className="kicker" style={{ marginTop: 22 }}>
                Hourly log
              </div>
              <ul className="log">
                {logs.map((l) => (
                  <li key={l.id}>
                    <time>{fmt(l.shipped_at || l.created_at)}</time>
                    {l.title}
                    <div>{l.body}</div>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </section>

        <footer>
          <span>Copper Desk · the hour keeps its own books</span>
          <span>Public stays public</span>
        </footer>
      </div>
    </div>
  );
}
