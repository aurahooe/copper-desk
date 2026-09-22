"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "../lib/supabase";

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

  async function loadPublic() {
    const { data: hours } = await supabase.from("hours").select("*").order("slot", { ascending: false }).limit(1);
    setHour(hours?.[0] || null);
    const { data: publicNotes } = await supabase
      .from("notes")
      .select("id,title,body,created_at,is_public,user_id,profiles(handle,display_name)")
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .limit(40);
    setNotes(publicNotes || []);
    const { data: log } = await supabase.from("hourly_log").select("*").order("created_at", { ascending: false }).limit(8);
    setLogs(log || []);
  }

  async function loadMine(userId) {
    if (!userId) return setMine([]);
    const { data } = await supabase.from("notes").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    setMine(data || []);
  }

  async function rotateHour() {
    try { await supabase.rpc("rotate_hourly_pulse"); } catch (_) {}
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
    const h = setInterval(() => { rotateHour().then(loadPublic); }, 60 * 60 * 1000);
    const poll = setInterval(loadPublic, 45 * 1000);
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
    const diff = d - now;
    const m = Math.floor(diff / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, [now]);

  async function auth(e) {
    e.preventDefault();
    setErr(""); setMsg("");
    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setErr(error.message);
      else setMsg("Check your inbox if confirmation is on. Otherwise you are in.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setErr(error.message);
    }
  }

  async function signOut() { await supabase.auth.signOut(); }

  async function publish(e) {
    e.preventDefault();
    setErr(""); setMsg("");
    if (!session) { setErr("Sign in first."); return; }
    const { error } = await supabase.from("notes").insert({
      user_id: session.user.id,
      title: title.trim() || "Untitled",
      body: body.trim(),
      is_public: isPublic
    });
    if (error) { setErr(error.message); return; }
    setTitle(""); setBody("");
    setMsg(isPublic ? "On the wall." : "Saved privately.");
    loadPublic();
    loadMine(session.user.id);
  }

  async function togglePublic(note) {
    await supabase.from("notes").update({ is_public: !note.is_public }).eq("id", note.id);
    loadPublic(); loadMine(session?.user?.id);
  }

  async function remove(note) {
    await supabase.from("notes").delete().eq("id", note.id);
    loadPublic(); loadMine(session?.user?.id);
  }

  return (
    <div className="wrap">
      <header className="mast">
        <h1 className="brand"><span>Est. this hour</span>Copper Desk</h1>
        <div className="mast-meta">Living press<br />Next rotation {nextHour}<br />{now.toUTCString().slice(0, 22)}</div>
      </header>
      <nav className="top">
        <a href="#wall">The wall</a>
        <a href="#desk">The desk</a>
        <a href="#log">Hourly log</a>
      </nav>
      <div className="ticker">
        <div className="ticker-track">
          {[0,1].map((i) => (
            <span key={i}>Public notes stay public · Private notes stay yours · The hour turns itself · Write something worth leaving out · </span>
          ))}
        </div>
      </div>
      <section className="hero">
        <div>
          <div className="kicker">This hour</div>
          <h2 className="headline">{hour?.headline || "The press is warming up."}</h2>
          <p className="lede">{hour?.editorial || "When the hour turns, a new line lands here. Public writing from the room is pulled onto the mast."}</p>
        </div>
        <aside className="hour-card">
          <div className="kicker">Featured from the wall</div>
          <h3>{notes.find((n) => n.id === hour?.featured_note_id)?.title || notes[0]?.title || "Waiting on the first public note"}</h3>
          <p>{(notes.find((n) => n.id === hour?.featured_note_id)?.body || notes[0]?.body || "Mark a piece public and it can take the hour.")?.slice(0, 240)}</p>
        </aside>
      </section>
      <section className="grid" id="wall">
        <div>
          <div className="kicker">Public wall</div>
          <div className="wall">
            {notes.length === 0 && (<article className="note"><h4>Empty on purpose</h4><p>Nothing public yet. Sign in, write, and leave the copper switch on.</p></article>)}
            {notes.map((n, i) => (
              <article className="note" key={n.id} style={{ animationDelay: `${i * 40}ms` }}>
                <h4>{n.title}</h4>
                <p>{n.body}</p>
                <div className="meta"><span>{n.profiles?.display_name || n.profiles?.handle || "unsigned"}</span><span>{fmt(n.created_at)}</span></div>
              </article>
            ))}
          </div>
        </div>
        <aside className="panel" id="desk">
          {!session ? (
            <form onSubmit={auth}>
              <h3>{mode === "signup" ? "Take a desk" : "Return to the desk"}</h3>
              <p>Email and password. Your private drafts never hit the wall.</p>
              <label>Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
              <label>Password</label>
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required minLength={6} />
              <div className="row" style={{ marginTop: 16 }}>
                <button type="submit">{mode === "signup" ? "Create account" : "Sign in"}</button>
                <button type="button" className="ghost" onClick={() => setMode(mode === "signup" ? "signin" : "signup")}>{mode === "signup" ? "Have a desk?" : "New here?"}</button>
              </div>
              <p className="err">{err}</p><p className="ok">{msg}</p>
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
                <label htmlFor="pub" style={{ margin: 0 }}>Mark public</label>
              </div>
              <div className="row">
                <button type="submit">Save</button>
                <button type="button" className="ghost" onClick={signOut}>Sign out</button>
              </div>
              <p className="err">{err}</p><p className="ok">{msg}</p>
              <ul className="log">
                {mine.map((n) => (
                  <li key={n.id}>
                    <strong>{n.title}</strong> · {n.is_public ? "public" : "private"}
                    <div className="row">
                      <button type="button" className="ghost" onClick={() => togglePublic(n)}>{n.is_public ? "Make private" : "Make public"}</button>
                      <button type="button" className="ghost" onClick={() => remove(n)}>Delete</button>
                    </div>
                  </li>
                ))}
              </ul>
            </form>
          )}
          <div id="log">
            <div className="kicker" style={{ marginTop: 22 }}>Hourly log</div>
            <ul className="log">
              {logs.map((l) => (
                <li key={l.id}><time>{fmt(l.created_at)}</time>{l.title}<div>{l.body}</div></li>
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
  );
}
