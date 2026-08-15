"use client";

import { useEffect, useRef, useState } from "react";
import { DerivWS } from "../lib/deriv";

type Tab = "Dashboard" | "Bot Builder" | "Chart";
type Mode = "Demo" | "Real";
type Account = { account_id: string; account_type?: string; balance?: number; currency?: string };
type Market = { symbol: string; name: string };

type Block = { id: string; title: string; x: number; y: number };

const tabs: Tab[] = ["Dashboard", "Bot Builder", "Chart"];
const fallbackMarkets: Market[] = [
  ["R_10", "Volatility 10 Index"],
  ["R_25", "Volatility 25 Index"],
  ["R_50", "Volatility 50 Index"],
  ["R_75", "Volatility 75 Index"],
  ["R_100", "Volatility 100 Index"],
  ["1HZ10V", "Volatility 10 (1s) Index"],
  ["1HZ25V", "Volatility 25 (1s) Index"],
  ["1HZ50V", "Volatility 50 (1s) Index"],
  ["1HZ75V", "Volatility 75 (1s) Index"],
  ["1HZ100V", "Volatility 100 (1s) Index"],
].map(([symbol, name]) => ({ symbol, name }));

const defaultBlocks: Block[] = [
  { id: "trade", title: "1. Trade parameters", x: 28, y: 28 },
  { id: "purchase", title: "2. Purchase conditions", x: 28, y: 370 },
  { id: "sell", title: "3. Sell conditions", x: 510, y: 28 },
  { id: "restart", title: "4. Restart trading conditions", x: 510, y: 230 },
];

const money = (value: number | null | undefined, currency = "USD") =>
  `${typeof value === "number" && Number.isFinite(value) ? value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"} ${currency}`;

function Logo() {
  return <div className="dbotLogo"><strong>Deriv</strong><b>FX</b></div>;
}

function Icon({ name }: { name: "home" | "blocks" | "chart" }) {
  if (name === "home") return <span className="navIcon">⌂</span>;
  if (name === "blocks") return <span className="navIcon">♧</span>;
  return <span className="navIcon">⌁</span>;
}

function AccountIcon({ mode }: { mode: Mode }) {
  return mode === "Real" ? <span className="accountRound flag">🇺🇸</span> : <span className="accountRound">Ð</span>;
}

export default function DerivFX() {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [tab, setTab] = useState<Tab>("Dashboard");
  const [mode, setMode] = useState<Mode>("Demo");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [currency, setCurrency] = useState("USD");
  const [accountOpen, setAccountOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [running, setRunning] = useState(false);
  const [symbol, setSymbol] = useState("R_50");
  const [markets, setMarkets] = useState<Market[]>(fallbackMarkets);
  const [price, setPrice] = useState<number | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [toolboxOpen, setToolboxOpen] = useState(false);
  const [blocks, setBlocks] = useState<Block[]>(defaultBlocks);
  const [stake, setStake] = useState(1);
  const [duration, setDuration] = useState(1);
  const [contract, setContract] = useState<"CALL" | "PUT">("CALL");
  const [transactionsOpen, setTransactionsOpen] = useState(false);

  const accountWs = useRef<DerivWS | null>(null);
  const marketWs = useRef<WebSocket | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const workspace = useRef<HTMLDivElement | null>(null);

  const login = () => { window.location.href = "/api/auth/login"; };
  const signup = () => { window.location.href = "/api/auth/login?mode=signup"; };

  const loadAccounts = async () => {
    const response = await fetch("/api/deriv/accounts", { cache: "no-store" });
    const json = await response.json();
    if (!response.ok) throw new Error(json?.error || "Unable to load Deriv accounts");
    const list = (json.data || json.accounts || []) as Account[];
    setAccounts(list);
    return list;
  };

  const connectAccount = async (nextMode: Mode, list?: Account[]) => {
    try {
      accountWs.current?.close();
      const all = list || await loadAccounts();
      const account = all.find((item) => String(item.account_type || "").toLowerCase() === nextMode.toLowerCase());
      if (!account?.account_id) throw new Error(`No ${nextMode.toLowerCase()} account available`);

      const response = await fetch("/api/deriv/otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId: account.account_id }),
        cache: "no-store",
      });
      const json = await response.json();
      if (!response.ok || !json.data?.url) throw new Error(json?.errors?.[0]?.message || "Unable to connect account");

      const ws = new DerivWS();
      accountWs.current = ws;
      await ws.connect(json.data.url);
      setMode(nextMode);
      setCurrency(account.currency || "USD");
      setBalance(typeof account.balance === "number" ? account.balance : null);
      ws.balance((message) => {
        const value = Number((message as { balance?: { balance?: number } }).balance?.balance);
        if (Number.isFinite(value)) setBalance(value);
      });
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to connect account");
      return false;
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const session = await response.json();
        setAuthenticated(!!session.authenticated);
        if (session.authenticated) {
          const list = await loadAccounts();
          const preferred: Mode = list.some((item) => String(item.account_type || "").toLowerCase() === "real") ? "Real" : "Demo";
          await connectAccount(preferred, list);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      accountWs.current?.close();
      marketWs.current?.close();
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  useEffect(() => {
    const ws = new WebSocket("wss://api.derivws.com/trading/v1/options/ws/public");
    marketWs.current = ws;
    ws.onopen = () => ws.send(JSON.stringify({ active_symbols: "brief", req_id: 1 }));
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as {
          msg_type?: string;
          active_symbols?: Array<Record<string, string>>;
          history?: { prices?: unknown[] };
          tick?: { quote?: number };
        };
        if (message.msg_type === "active_symbols") {
          const list = (message.active_symbols || [])
            .map((item) => ({ symbol: item.underlying_symbol || item.symbol, name: item.underlying_symbol_name || item.display_name || item.symbol }))
            .filter((item) => /volatility/i.test(item.name) || /^R_\d+$/.test(item.symbol) || /^1HZ\d+V$/.test(item.symbol));
          if (list.length) setMarkets(list.filter((item, index, all) => all.findIndex((x) => x.symbol === item.symbol) === index));
        }
        if (message.msg_type === "history") {
          const prices = (message.history?.prices || []).map(Number).filter(Number.isFinite);
          setHistory(prices.slice(-180));
          if (prices.length) setPrice(prices[prices.length - 1]);
        }
        if (message.msg_type === "tick" && typeof message.tick?.quote === "number") {
          setPrice(message.tick.quote);
          setHistory((old) => [...old.slice(-179), message.tick!.quote as number]);
        }
      } catch { /* ignore malformed market messages */ }
    };
    return () => ws.close();
  }, []);

  useEffect(() => {
    const ws = marketWs.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ ticks_history: symbol, count: 180, end: "latest", style: "ticks", req_id: 2 }));
    ws.send(JSON.stringify({ ticks: symbol, subscribe: 1, req_id: 3 }));
  }, [symbol, markets]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const active = drag.current;
      const area = workspace.current;
      if (!active || !area) return;
      const rect = area.getBoundingClientRect();
      setBlocks((old) => old.map((block) => block.id === active.id
        ? { ...block, x: Math.max(5, event.clientX - rect.left - active.dx), y: Math.max(5, event.clientY - rect.top - active.dy) }
        : block));
    };
    const up = () => { drag.current = null; };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, []);

  const startDrag = (event: React.PointerEvent, id: string) => {
    const block = blocks.find((item) => item.id === id);
    const area = workspace.current;
    if (!block || !area) return;
    const rect = area.getBoundingClientRect();
    drag.current = { id, dx: event.clientX - rect.left - block.x, dy: event.clientY - rect.top - block.y };
  };

  const logout = async () => {
    accountWs.current?.close();
    if (timer.current) clearInterval(timer.current);
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  };

  const switchAccount = async (nextMode: Mode) => {
    if (nextMode !== mode && authenticated) await connectAccount(nextMode);
    setAccountOpen(false);
  };

  const execute = () => {
    if (!authenticated) return login();
    const ws = accountWs.current;
    if (!ws) return setNotice("Deriv account is not connected.");

    if (running) {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
      setRunning(false);
      setNotice("Bot is not running");
      return;
    }

    const buyOnce = () => {
      ws.proposal({
        amount: stake,
        basis: "stake",
        contract_type: contract,
        currency,
        duration,
        duration_unit: "t",
        underlying_symbol: symbol,
      }, (message) => {
        const result = message as { error?: { message?: string }; proposal?: { id?: string; ask_price?: number | string } };
        if (result.error) return setNotice(result.error.message || "Proposal failed");
        const id = result.proposal?.id;
        const price = Number(result.proposal?.ask_price);
        if (!id || !Number.isFinite(price)) return setNotice("No valid proposal returned");
        ws.buy(id, price, (buyMessage) => {
          const bought = buyMessage as { error?: { message?: string }; buy?: { contract_id?: number } };
          setNotice(bought.error?.message || (bought.buy?.contract_id ? `Contract ${bought.buy.contract_id} purchased` : "Contract purchased"));
        });
      });
    };

    setRunning(true);
    setNotice("Bot is running");
    buyOnce();
    timer.current = setInterval(buyOnce, Math.max(3000, duration * 2000));
  };

  if (loading) {
    return <div className="loaderScreen"><Logo/><div className="loaderSpinner"/><p>Loading…</p></div>;
  }

  const currentAccount = accounts.find((item) => String(item.account_type || "").toLowerCase() === mode.toLowerCase());

  return (
    <main className="dbotApp">
      <header className="dbotHeader">
        <button className="menuButton" aria-label="Menu">☰</button>
        <Logo/>
        <div className="headerAccount">
          {authenticated ? (
            <button className="accountSummary" onClick={() => setAccountOpen((open) => !open)}>
              <AccountIcon mode={mode}/>
              <span><em>{mode} account</em><strong>{money(balance, currency)}</strong></span>
              <b>{accountOpen ? "⌃" : "⌄"}</b>
            </button>
          ) : (
            <div className="authButtons"><button onClick={login}>Log in</button><button onClick={signup}>Sign up</button></div>
          )}

          {accountOpen && authenticated && (
            <div className="accountPanel">
              <div className="accountTabs">
                <button className={mode === "Real" ? "selected" : ""} onClick={() => switchAccount("Real")}>Real</button>
                <button className={mode === "Demo" ? "selected" : ""} onClick={() => switchAccount("Demo")}>Demo</button>
              </div>
              <div className="accountPanelBody">
                <h3>Deriv accounts <span>⌃</span></h3>
                {(["Real", "Demo"] as Mode[]).map((item) => {
                  const account = accounts.find((entry) => String(entry.account_type || "").toLowerCase() === item.toLowerCase());
                  return (
                    <button className={`accountRow ${item === mode ? "selected" : ""}`} key={item} onClick={() => switchAccount(item)}>
                      <AccountIcon mode={item}/>
                      <span><b>{item === "Real" ? (account?.currency || "USD") : "Demo"}</b><small>{account?.account_id || "Not connected"}</small></span>
                      <strong>{money(account?.balance ?? (item === mode ? balance : 0), account?.currency || currency)}</strong>
                    </button>
                  );
                })}
                <div className="traderHub">Looking for CFD accounts? Go to Trader's Hub</div>
                <button className="logoutButton" onClick={logout}>Logout <span>→</span></button>
              </div>
            </div>
          )}
        </div>
      </header>

      <nav className="dbotTabs" aria-label="Primary navigation">
        {tabs.map((item) => (
          <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
            <Icon name={item === "Dashboard" ? "home" : item === "Bot Builder" ? "blocks" : "chart"}/>
            <span>{item}</span>
          </button>
        ))}
      </nav>

      {tab === "Dashboard" && (
        <section className="dashboardPage">
          <div className="dashboardAccount">
            <div className="dashboardAccountIdentity"><AccountIcon mode={mode}/><span><em>{mode} account</em><strong>{money(balance, currency)}</strong></span></div>
            <button className="depositButton">Deposit</button>
          </div>
          <div className="dashboardContent">
            <h1>Load or build your bot</h1>
            <p>Import a bot from your computer or Google Drive, build it from scratch, or start with a quick strategy.</p>
            <div className="dashboardChoices">
              <button><span>▯</span><b>Local</b></button>
              <button><span>◆</span><b>Google Drive</b></button>
              <button onClick={() => setTab("Bot Builder")}><span>♧</span><b>Bot Builder</b></button>
              <button onClick={() => setTab("Bot Builder")}><span>◈</span><b>Quick strategy</b></button>
            </div>
            {!authenticated && <div className="connectPrompt"><p>Connect your Deriv account to start building and running bots.</p><button onClick={login}>Log in</button><button onClick={signup}>Sign up</button></div>}
          </div>
        </section>
      )}

      {tab === "Bot Builder" && (
        <section className="builderPage">
          <div className="builderTop"><button className="quickStrategy" onClick={() => setToolboxOpen((open) => !open)}>Quick strategy</button>{toolboxOpen && <div className="builderMenu"><button onClick={() => setToolboxOpen(false)}>Trade parameters</button><button onClick={() => setToolboxOpen(false)}>Purchase conditions</button><button onClick={() => setToolboxOpen(false)}>Sell conditions</button><button onClick={() => setToolboxOpen(false)}>Logic</button></div>}</div>
          <div className="builderWorkspace">
            <aside className="builderRail"><button>↻</button><button>▱</button><button>▣</button><button>↶</button><button>↷</button><button>＋</button><button>－</button></aside>
            <div className="blockCanvas" ref={workspace}>
              {blocks.map((block) => (
                <article className="dbotBlock" key={block.id} style={{ left: block.x, top: block.y }} onPointerDown={(event) => startDrag(event, block.id)}>
                  <header>{block.title}</header>
                  <div className="dbotBlockBody">
                    {block.id === "trade" && <><label>Market <select value={symbol} onChange={(event) => setSymbol(event.target.value)}>{markets.map((item) => <option key={item.symbol} value={item.symbol}>{item.name}</option>)}</select></label><label>Trade type <select value={contract} onChange={(event) => setContract(event.target.value as "CALL" | "PUT")}><option value="CALL">Rise / Call</option><option value="PUT">Fall / Put</option></select></label><label>Stake <input type="number" min="0.35" step="0.01" value={stake} onChange={(event) => setStake(Number(event.target.value))}/></label><label>Duration <input type="number" min="1" value={duration} onChange={(event) => setDuration(Number(event.target.value))}/> ticks</label><div className="blockSocket">Run once at start:</div></>}
                    {block.id === "purchase" && <><label>Purchase <select><option>Rise</option><option>Fall</option></select></label><div className="blockSocket">Drop condition here</div></>}
                    {block.id === "sell" && <><span>if</span><div className="blockSlot">Sell is available</div><span>then</span></>}
                    {block.id === "restart" && <div className="blockSlot">Trade again</div>}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {tab === "Chart" && (
        <section className="chartPage">
          <div className="chartHeader"><div><small>Live chart</small><h2>{markets.find((item) => item.symbol === symbol)?.name || symbol}</h2></div><select value={symbol} onChange={(event) => setSymbol(event.target.value)}>{markets.map((item) => <option key={item.symbol} value={item.symbol}>{item.name}</option>)}</select></div>
          <div className="chartQuote"><strong>{price == null ? "—" : price.toFixed(4)}</strong><span>● LIVE</span></div>
          <div className="chartCanvasView">{history.length > 1 && <svg viewBox="0 0 1000 420" preserveAspectRatio="none"><path d={history.map((value, index) => { const min = Math.min(...history); const max = Math.max(...history); const x = 12 + (index / (history.length - 1)) * 976; const y = 390 - ((value - min) / (max - min || 1)) * 360; return `${index ? "L" : "M"}${x},${y}`; }).join(" ")} fill="none" stroke="#f44350" strokeWidth="3"/></svg>}</div>
          <div className="chartFooter"><span>{markets.length} Volatility Indices</span><span>{symbol}</span></div>
        </section>
      )}

      <button className="transactionsHandle" onClick={() => setTransactionsOpen((open) => !open)} aria-label="Open transactions">⌃</button>
      {transactionsOpen && <section className="transactionsPanel"><div className="transactionTabs"><button className="active">Summary</button><button>Transactions</button><button>Journal</button></div><div className="transactionBody"><h3>Bot activity</h3><p>{notice || "No transactions yet."}</p></div></section>}

      <footer className="dbotBottomBar">
        <button className={`runButton ${running ? "running" : ""}`} onClick={execute}>{running ? "■ Stop" : "▶ Run"}</button>
        <div className="runStatus"><strong>{notice || (running ? "Bot is running" : "Bot is not running")}</strong><div className="progressTrack"><span className={running ? "progress" : ""}/></div></div>
      </footer>
    </main>
  );
}
