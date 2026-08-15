"use client";
import {useEffect,useMemo,useRef,useState} from "react";

type Account={account_id:string;account_type?:string;balance?:number;currency?:string};
type Profit={transaction_id?:number;contract_id?:number;buy_price?:number;payout?:number;sell_price?:number;purchase_time?:number;underlying_symbol?:string;contract_type?:string};
type Statement={transaction_id?:number;action_type?:string;amount?:number;balance_after?:number;transaction_time?:number};

const money=(n:number|undefined|null)=>typeof n==="number"?n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}):"0.00";
const time=(n?:number)=>n?new Date(n*1000).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—";

export default function DbotTransactionPanel(){
 const [open,setOpen]=useState(false),[tab,setTab]=useState<"Summary"|"Transactions"|"Journal">("Summary"),[loading,setLoading]=useState(false);
 const [profits,setProfits]=useState<Profit[]>([]),[journal,setJournal]=useState<Statement[]>([]),[live,setLive]=useState<Profit[]>([]),[balance,setBalance]=useState<number|null>(null),[currency,setCurrency]=useState("USD");
 const socket=useRef<WebSocket|null>(null);
 const connect=async()=>{
  setLoading(true);
  try{
   const ar=await fetch("/api/deriv/accounts",{cache:"no-store"}); const aj=await ar.json();
   const accounts=(aj.data||aj.accounts||[]) as Account[];
   const account=accounts.find(a=>String(a.account_type||"").toLowerCase()==="real")||accounts.find(a=>String(a.account_type||"").toLowerCase()==="demo");
   if(!account?.account_id) return;
   setBalance(typeof account.balance==="number"?account.balance:null); setCurrency(account.currency||"USD");
   const or=await fetch("/api/deriv/otp",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({accountId:account.account_id}),cache:"no-store"});
   const oj=await or.json(); if(!or.ok||!oj.data?.url) return;
   const ws=new WebSocket(oj.data.url); socket.current=ws;
   await new Promise<void>((resolve,reject)=>{const t=setTimeout(()=>reject(new Error("timeout")),10000);ws.onopen=()=>{clearTimeout(t);resolve()};ws.onerror=()=>{clearTimeout(t);reject(new Error("connection failed"))}});
   const send=(payload:Record<string,unknown>)=>ws.send(JSON.stringify(payload));
   send({profit_table:1,limit:50,sort:"DESC",description:1,req_id:11});
   send({statement:1,limit:50,req_id:12});
   send({balance:1,subscribe:1,req_id:13});
   send({transaction:1,subscribe:1,req_id:14});
   ws.onmessage=e=>{try{const m=JSON.parse(e.data);
    if(m.msg_type==="profit_table"){setProfits((m.profit_table?.transactions||[]) as Profit[])}
    if(m.msg_type==="statement"){setJournal((m.statement?.transactions||[]) as Statement[])}
    if(m.msg_type==="balance"&&typeof m.balance?.balance==="number")setBalance(m.balance.balance);
    if(m.msg_type==="transaction"&&m.transaction){const t=m.transaction;setJournal(j=>[{transaction_id:t.transaction_id,action_type:t.action,amount:t.amount,balance_after:t.balance_after,transaction_time:t.transaction_time},...j].slice(0,50));}
   }catch{}}
  }catch(e){console.error(e)}finally{setLoading(false)}
 };
 useEffect(()=>{if(open)connect();return()=>{socket.current?.close();socket.current=null}},[open]);
 const rows=useMemo(()=>[...live,...profits].slice(0,50),[live,profits]);
 const totalStake=useMemo(()=>rows.reduce((s,t)=>s+(Number(t.buy_price)||0),0),[rows]);
 const totalPayout=useMemo(()=>rows.reduce((s,t)=>s+(Number(t.payout)||0),0),[rows]);
 const wins=rows.filter(t=>(Number(t.payout)||0)>(Number(t.buy_price)||0)).length;
 const losses=rows.filter(t=>(Number(t.payout)||0)<(Number(t.buy_price)||0)).length;
 const pnl=totalPayout-totalStake;
 return <>
  {open&&<div className="dbotTxBackdrop" onClick={()=>setOpen(false)}/>} 
  {open&&<section className="dbotTxSheet" aria-label="Open transactions">
   <div className="dbotTxGrab" onClick={()=>setOpen(false)}>⌄</div>
   <div className="dbotTxTabs">{(["Summary","Transactions","Journal"] as const).map(t=><button key={t} className={tab===t?"active":""} onClick={()=>setTab(t)}>{t}</button>)}</div>
   {loading&&<div className="dbotTxLoading">Loading account activity…</div>}
   {!loading&&tab==="Summary"&&<div className="dbotTxSummary"><div><b>Total stake</b><span>{money(totalStake)} {currency}</span></div><div><b>Total payout</b><span>{money(totalPayout)} {currency}</span></div><div><b>No. of runs</b><span>{rows.length}</span></div><div><b>Contracts lost</b><span>{losses}</span></div><div><b>Contracts won</b><span>{wins}</span></div><div><b>Total profit/loss</b><span className={pnl<0?"loss":"win"}>{pnl>=0?"+":""}{money(pnl)} {currency}</span></div></div>}
   {!loading&&tab==="Transactions"&&<div className="dbotTxList"><div className="dbotTxHeader"><b>Type</b><b>Entry/Exit spot</b><b>Buy price and P/L</b></div>{rows.length?rows.map((t,i)=><div className="dbotTxRow" key={`${t.transaction_id||t.contract_id||i}-${i}`}><div><span className="txTypeIcon">⌘</span><small>{t.contract_type||"Contract"}</small></div><div><span>● {t.underlying_symbol||"—"}</span><span>○ {t.sell_price??"—"}</span></div><div><span>{money(t.buy_price)} {currency}</span><span className={(Number(t.payout)||0)-(Number(t.buy_price)||0)<0?"loss":"win"}>{(Number(t.payout)||0)-(Number(t.buy_price)||0)>=0?"+":""}{money((Number(t.payout)||0)-(Number(t.buy_price)||0))} {currency}</span></div></div>):<div className="dbotTxEmpty">No transactions yet.</div>}</div>}
   {!loading&&tab==="Journal"&&<div className="dbotJournal">{journal.length?journal.map((j,i)=><div className="journalRow" key={`${j.transaction_id||i}-${i}`}><span>{time(j.transaction_time)}</span><b>{j.action_type||"transaction"}</b><span>{j.amount!=null?`${j.amount>=0?"+":""}${money(j.amount)} ${currency}`:"—"}</span><span>Balance {j.balance_after!=null?money(j.balance_after):"—"}</span></div>):<div className="dbotTxEmpty">No journal entries yet.</div>}</div>}
  </section>}
  <button className={`dbotTxTrigger ${open?"opened":""}`} onClick={()=>setOpen(v=>!v)}><span>{open?"⌃":"⌃"}</span> Open transactions {rows.length}</button>
 </>;
}
