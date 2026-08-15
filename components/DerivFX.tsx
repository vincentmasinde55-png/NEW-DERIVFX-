"use client";

import { useEffect, useRef, useState } from "react";
import { DerivWS } from "../lib/deriv";

type Tab = "Dashboard" | "Bot Builder" | "Chart";
type Mode = "Demo" | "Real";
type Account = { account_id: string; account_type?: string; balance?: number; currency?: string };
type Market = { symbol: string; name: string };
type Trade = { id: string; time: string; type: string; symbol: string; stake: number; payout?: number; profit?: number; status: string };

type Block = { id: string; title: string; group: string; x: number; y: number };

const tabs: Tab[] = ["Dashboard", "Bot Builder", "Chart"];
const marketsFallback: Market[] = [
  ["R_10", "Volatility 10 Index"], ["R_25", "Volatility 25 Index"], ["R_50", "Volatility 50 Index"],
  ["R_75", "Volatility 75 Index"], ["R_100", "Volatility 100 Index"], ["1HZ10V", "Volatility 10 (1s) Index"],
  ["1HZ25V", "Volatility 25 (1s) Index"], ["1HZ50V", "Volatility 50 (1s) Index"], ["1HZ75V", "Volatility 75 (1s) Index"],
  ["1HZ100V", "Volatility 100 (1s) Index"],
].map(([symbol, name]) => ({ symbol, name }));

const initialBlocks: Block[] = [
  { id: "trade", title: "Trade parameters", group: "Trade", x: 24, y: 24 },
  { id: "purchase", title: "Purchase conditions", group: "Purchase", x: 24, y: 245 },
  { id: "sell", title: "Sell conditions", group: "Sell", x: 430, y: 24 },
  { id: "restart", title: "Restart trading conditions", group: "Restart", x: 430, y: 210 },
];

const money = (n: number | null | undefined, currency = "USD") => `${typeof n === "number" && Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"} ${currency}`;

function Logo() { return <div className="dfxLogo"><span>Deriv</span><b>FX</b></div>; }
function AccountIcon({ mode }: { mode: Mode }) { return mode === "Real" ? <span className="roundAccount flagRound">🇺🇸</span> : <span className="roundAccount">Ð</span>; }

export default function DerivFX() {
  const [tab, setTab] = useState<Tab>("Dashboard");
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [mode, setMode] = useState<Mode>("Demo");
  const [balance, setBalance] = useState<number | null>(null);
  const [currency, setCurrency] = useState("USD");
  const [accountOpen, setAccountOpen] = useState(false);
  const [txOpen, setTxOpen] = useState(false);
  const [txTab, setTxTab] = useState<"Summary" | "Transactions" | "Journal">("Summary");
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState("Bot is not running");
  const [symbol, setSymbol] = useState("R_50");
  const [markets, setMarkets] = useState<Market[]>(marketsFallback);
  const [price, setPrice] = useState<number | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [stake, setStake] = useState(1);
  const [duration, setDuration] = useState(1);
  const [contract, setContract] = useState<"CALL" | "PUT">("CALL");
  const [trades, setTrades] = useState<Trade[]>([]);
  const [journal, setJournal] = useState<string[]>([]);
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const ws = useRef<DerivWS | null>(null);
  const marketWs = useRef<WebSocket | null>(null);
  const runTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const workspace = useRef<HTMLDivElement | null>(null);

  const login = () => { window.location.href = "/api/auth/login"; };
  const signup = () => { window.location.href = "/api/auth/login?mode=signup"; };

  const loadAccounts = async () => {
    const r = await fetch("/api/deriv/accounts", { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error || "Unable to load Deriv accounts");
    const list = (j.data || j.accounts || []) as Account[];
    setAccounts(list);
    return list;
  };

  const connectAccount = async (next: Mode, supplied?: Account[]) => {
    try {
      ws.current?.close();
      const list = supplied || await loadAccounts();
      const account = list.find(a => String(a.account_type || "").toLowerCase() === next.toLowerCase());
      if (!account?.account_id) throw new Error(`No ${next.toLowerCase()} account available`);
      const r = await fetch("/api/deriv/otp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId: account.account_id }), cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j.data?.url) throw new Error(j?.errors?.[0]?.message || "Unable to connect account");
      const d = new DerivWS();
      await d.connect(j.data.url);
      ws.current = d;
      setMode(next); setCurrency(account.currency || "USD"); setBalance(typeof account.balance === "number" ? account.balance : null);
      d.balance(m => { const n = Number((m as { balance?: { balance?: number } }).balance?.balance); if (Number.isFinite(n)) setBalance(n); });
      setJournal(v => [`Connected to ${next} account`, ...v].slice(0, 50));
      return true;
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Unable to connect account");
      return false;
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/auth/session", { cache: "no-store" });
        const s = await r.json();
        setAuthenticated(!!s.authenticated);
        if (s.authenticated) {
          const list = await loadAccounts();
          const preferred: Mode = list.some(a => String(a.account_type || "").toLowerCase() === "real") ? "Real" : "Demo";
          await connectAccount(preferred, list);
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
    return () => { ws.current?.close(); marketWs.current?.close(); if (runTimer.current) clearInterval(runTimer.current); };
  }, []);

  useEffect(() => {
    const m = new WebSocket("wss://api.derivws.com/trading/v1/options/ws/public");
    marketWs.current = m;
    m.onopen = () => m.send(JSON.stringify({ active_symbols: "brief", req_id: 1 }));
    m.onmessage = e => {
      try {
        const x = JSON.parse(e.data) as { msg_type?: string; active_symbols?: Array<Record<string, string>>; history?: { prices?: unknown[] }; tick?: { quote?: number } };
        if (x.msg_type === "active_symbols") {
          const list = (x.active_symbols || []).map(a => ({ symbol: a.underlying_symbol || a.symbol, name: a.underlying_symbol_name || a.display_name || a.symbol })).filter(a => /volatility/i.test(a.name) || /^R_\d+$/.test(a.symbol) || /^1HZ\d+V$/.test(a.symbol));
          if (list.length) setMarkets(list.filter((a, i, all) => all.findIndex(b => b.symbol === a.symbol) === i));
        }
        if (x.msg_type === "history") { const p = (x.history?.prices || []).map(Number).filter(Number.isFinite); setHistory(p.slice(-120)); if (p.length) setPrice(p[p.length - 1]); }
        if (x.msg_type === "tick" && typeof x.tick?.quote === "number") { setPrice(x.tick.quote); setHistory(v => [...v.slice(-119), x.tick!.quote as number]); }
      } catch { /* ignore malformed public market messages */ }
    };
    return () => m.close();
  }, []);

  useEffect(() => {
    const m = marketWs.current;
    if (!m || m.readyState !== WebSocket.OPEN) return;
    m.send(JSON.stringify({ ticks_history: symbol, count: 120, end: "latest", style: "ticks", req_id: 2 }));
    m.send(JSON.stringify({ forget_all: "ticks" }));
    m.send(JSON.stringify({ ticks: symbol, subscribe: 1, req_id: 3 }));
  }, [symbol, markets]);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current; const area = workspace.current; if (!d || !area) return;
      const r = area.getBoundingClientRect();
      setBlocks(v => v.map(b => b.id === d.id ? { ...b, x: Math.max(5, e.clientX - r.left - d.dx), y: Math.max(5, e.clientY - r.top - d.dy) } : b));
    };
    const up = () => { drag.current = null; };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, []);

  const beginDrag = (e: React.PointerEvent, id: string) => {
    const b = blocks.find(x => x.id === id); const a = workspace.current; if (!b || !a) return;
    const r = a.getBoundingClientRect(); drag.current = { id, dx: e.clientX - r.left - b.x, dy: e.clientY - r.top - b.y };
  };

  const addBlock = (group: string, title: string) => {
    setBlocks(v => [...v, { id: `${group}-${Date.now()}`, title, group, x: 80 + (v.length % 3) * 170, y: 100 + Math.floor(v.length / 3) * 120 }]);
    setPaletteOpen(false);
  };

  const buyOnce = () => {
    if (!ws.current) { setNotice("Deriv account is not connected"); return; }
    const created = `local-${Date.now()}`;
    setTrades(v => [{ id: created, time: new Date().toLocaleTimeString(), type: contract === "CALL" ? "Rise" : "Fall", symbol, stake, status: "Proposal" }, ...v].slice(0, 100));
    ws.current.proposal({ amount: stake, basis: "stake", contract_type: contract, currency, duration, duration_unit: "t", underlying_symbol: symbol }, message => {
      const p = message as { error?: { message?: string }; proposal?: { id?: string; ask_price?: number | string; payout?: number | string } };
      if (p.error) { setNotice(p.error.message || "Proposal failed"); setJournal(v => [`Proposal failed: ${p.error?.message || "unknown error"}`, ...v].slice(0, 50)); return; }
      const pid = p.proposal?.id; const ask = Number(p.proposal?.ask_price); const payout = Number(p.proposal?.payout);
      if (!pid || !Number.isFinite(ask)) { setNotice("Invalid proposal returned"); return; }
      setTrades(v => v.map(t => t.id === created ? { ...t, status: "Buying", payout: Number.isFinite(payout) ? payout : undefined } : t));
      ws.current?.buy(pid, ask, bought => {
        const b = bought as { error?: { message?: string }; buy?: { contract_id?: number } };
        if (b.error) { setNotice(b.error.message || "Buy failed"); setTrades(v => v.map(t => t.id === created ? { ...t, status: "Failed" } : t)); return; }
        const id = String(b.buy?.contract_id || created);
        setNotice(`Contract ${id} purchased`); setTrades(v => v.map(t => t.id === created ? { ...t, id, status: "Open" } : t));
        setJournal(v => [`Contract ${id} purchased on ${symbol}`, ...v].slice(0, 50));
      });
    });
  };

  const toggleRun = () => {
    if (!authenticated) return login();
    if (!ws.current) { setNotice("Connect a Deriv account first"); return; }
    if (running) {
      if (runTimer.current) clearInterval(runTimer.current); runTimer.current = null; setRunning(false); setNotice("Bot is not running");
      return;
    }
    setRunning(true); setNotice("Bot is running"); buyOnce();
    runTimer.current = setInterval(buyOnce, Math.max(5000, duration * 3000));
  };

  const switchMode = async (next: Mode) => { if (next !== mode && authenticated) await connectAccount(next); setAccountOpen(false); };
  const logout = async () => { if (runTimer.current) clearInterval(runTimer.current); ws.current?.close(); await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/"; };

  const openTransactions = () => setTxOpen(v => !v);
  const totalStake = trades.reduce((a, t) => a + t.stake, 0);
  const wins = trades.filter(t => (t.profit || 0) > 0).length;
  const losses = trades.filter(t => (t.profit || 0) < 0).length;
  const profit = trades.reduce((a, t) => a + (t.profit || 0), 0);

  if (loading) return <div className="dfxLoader"><Logo/><div className="dfxSpinner"/><span>Loading DerivFX</span></div>;

  return <main className="dfxApp">
    <header className="dfxHeader">
      <button className="hamburger" aria-label="Menu">☰</button><Logo/>
      <div className="headerRight">
        {authenticated ? <button className="balanceButton" onClick={() => setAccountOpen(v => !v)}><AccountIcon mode={mode}/><span><em>{mode} account</em><strong>{money(balance, currency)}</strong></span><b>{accountOpen ? "⌃" : "⌄"}</b></button> : <div className="authBtns"><button onClick={login}>Log in</button><button onClick={signup}>Sign up</button></div>}
        {accountOpen && authenticated && <div className="accountMenu">
          <div className="accountMenuTabs"><button className={mode === "Real" ? "active" : ""} onClick={() => switchMode("Real")}>Real</button><button className={mode === "Demo" ? "active" : ""} onClick={() => switchMode("Demo")}>Demo</button></div>
          <div className="accountMenuBody"><h3>Deriv accounts <span>⌃</span></h3>
            {(["Real", "Demo"] as Mode[]).map(m => { const a = accounts.find(x => String(x.account_type || "").toLowerCase() === m.toLowerCase()); return <button className={`accountLine ${m === mode ? "chosen" : ""}`} key={m} onClick={() => switchMode(m)}><AccountIcon mode={m}/><span><b>{m === "Real" ? (a?.currency || "USD") : "Demo"}</b><small>{a?.account_id || "Not connected"}</small></span><strong>{money(a?.balance ?? (m === mode ? balance : 0), a?.currency || currency)}</strong></button>; })}
            <div className="traderHub">Looking for CFD accounts? Go to Trader&apos;s Hub</div><button className="logout" onClick={logout}>Logout <span>→</span></button>
          </div>
        </div>}
      </div>
    </header>

    <nav className="dfxTabs">{tabs.map(t => <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}><span>{t === "Dashboard" ? "⌂" : t === "Bot Builder" ? "♧" : "⌁"}</span>{t}</button>)}</nav>

    {tab === "Dashboard" && <section className="dashboard">
      <h1>Load or build your bot</h1><p>Import a bot, build one from scratch, or start with a quick strategy.</p>
      <div className="dashboardCards"><button onClick={() => setTab("Bot Builder")}><span>▣</span><b>Local</b></button><button onClick={() => setTab("Bot Builder")}><span>◆</span><b>Google Drive</b></button><button onClick={() => setTab("Bot Builder")}><span>♧</span><b>Bot Builder</b></button><button onClick={() => setTab("Bot Builder")}><span>◆</span><b>Quick strategy</b></button></div>
    </section>}

    {tab === "Bot Builder" && <section className="builder">
      <div className="builderToolbar"><button onClick={() => setPaletteOpen(v => !v)}>Blocks Menu⌄</button><button className="quick">Quick strategy</button></div>
      {paletteOpen && <div className="palette"><b>Blocks</b><button onClick={() => addBlock("Trade", "Trade parameters")}>Trade parameters</button><button onClick={() => addBlock("Purchase", "Purchase conditions")}>Purchase conditions</button><button onClick={() => addBlock("Sell", "Sell conditions")}>Sell conditions</button><button onClick={() => addBlock("Logic", "If / then")}>If / then</button><button onClick={() => addBlock("Variable", "Stake amount")}>Stake amount</button></div>}
      <div className="workspace" ref={workspace}>{blocks.map(b => <div key={b.id} className={`dbotBlock block-${b.group.toLowerCase()}`} style={{ left: b.x, top: b.y }} onPointerDown={e => beginDrag(e, b.id)}><div className="blockTitle">▣ {b.title}</div><div className="blockBody"><label>Market <select value={symbol} onChange={e => setSymbol(e.target.value)}><option value={symbol}>{markets.find(m => m.symbol === symbol)?.name || symbol}</option>{markets.filter(m => m.symbol !== symbol).map(m => <option key={m.symbol} value={m.symbol}>{m.name}</option>)}</select></label>{b.group === "Trade" && <><label>Contract <select value={contract} onChange={e => setContract(e.target.value as "CALL" | "PUT")}><option value="CALL">Rise</option><option value="PUT">Fall</option></select></label><label>Stake <input type="number" min="0.35" step="0.01" value={stake} onChange={e => setStake(Math.max(0.35, Number(e.target.value)))} /></label><label>Duration <input type="number" min="1" step="1" value={duration} onChange={e => setDuration(Math.max(1, Number(e.target.value)))}/></label></>}</div></div>)}</div>
    </section>}

    {tab === "Chart" && <section className="chartPage"><div className="chartControls"><select value={symbol} onChange={e => setSymbol(e.target.value)}>{markets.map(m => <option key={m.symbol} value={m.symbol}>{m.name}</option>)}</select><strong>{price ?? "—"}</strong><span>{symbol}</span></div><div className="chart"><svg viewBox="0 0 1000 420" preserveAspectRatio="none"><path d={history.length > 1 ? history.map((v, i) => { const min = Math.min(...history), max = Math.max(...history), x = i / (history.length - 1) * 1000, y = 390 - ((v - min) / Math.max(0.000001, max - min)) * 350; return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`; }).join(" ") : "M0,210 L1000,210"} /></svg></div><div className="marketGrid">{markets.map(m => <button key={m.symbol} className={m.symbol === symbol ? "selected" : ""} onClick={() => setSymbol(m.symbol)}>{m.name}<small>{m.symbol}</small></button>)}</div></section>}

    <div className="bottomBar"><button className={`runButton ${running ? "stopState" : ""}`} onClick={toggleRun}>{running ? "■ Stop" : "▶ Run"}</button><div className="botStatus">{notice}</div><button className={`transactionsButton ${txOpen ? "open" : ""}`} onClick={openTransactions}>Open Transactions {txOpen ? "⌃" : "⌄"}</button></div>

    {txOpen && <><div className="txBackdrop" onClick={() => setTxOpen(false)}/><section className="txSheet"><button className="txGrab" onClick={() => setTxOpen(false)}>⌃</button><div className="txTabs"><button className={txTab === "Summary" ? "active" : ""} onClick={() => setTxTab("Summary")}>Summary</button><button className={txTab === "Transactions" ? "active" : ""} onClick={() => setTxTab("Transactions")}>Transactions</button><button className={txTab === "Journal" ? "active" : ""} onClick={() => setTxTab("Journal")}>Journal</button></div>
      {txTab === "Summary" && <><div className="summaryGrid"><div><b>Total stake</b><span>{money(totalStake, currency)}</span></div><div><b>Total payout</b><span>{money(totalStake + profit, currency)}</span></div><div><b>No. of runs</b><span>{trades.length}</span></div><div><b>Contracts lost</b><span>{losses}</span></div><div><b>Contracts won</b><span>{wins}</span></div><div><b>Total profit/loss</b><span className={profit >= 0 ? "win" : "loss"}>{money(profit, currency)}</span></div></div></>}
      {txTab === "Transactions" && <div className="txContent"><div className="txActions"><button>Download</button><button>View Detail</button></div><div className="txHeader"><b>Type</b><b>Entry/Exit spot</b><b>Buy price and P/L</b></div>{trades.length ? trades.map(t => <div className="txRow" key={t.id}><span>▦ {t.type}<small>{t.symbol}</small></span><span>{t.time}<small>{t.status}</small></span><span>{money(t.stake, currency)}<small className={t.profit && t.profit >= 0 ? "win" : "loss"}>{t.profit ? money(t.profit, currency) : "—"}</small></span></div>) : <div className="empty">No transactions yet.</div>}</div>}
      {txTab === "Journal" && <div className="journal">{journal.length ? journal.map((x, i) => <div key={`${x}-${i}`}><small>{new Date().toLocaleTimeString()}</small><span>{x}</span></div>) : <div className="empty">No journal entries yet.</div>}</div>}
    </section></>}
  </main>;
}
