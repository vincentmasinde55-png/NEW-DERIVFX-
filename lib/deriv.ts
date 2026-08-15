export type DerivMessage={msg_type?:string;error?:{message:string};[key:string]:unknown};
type Listener={cb:(m:DerivMessage)=>void;persistent:boolean};
export class DerivWS{
  private ws:WebSocket|null=null;
  private id=0;
  private listeners=new Map<number,Listener>();
  async connect(wsUrl:string){
    this.ws=new WebSocket(wsUrl);
    await new Promise<void>((resolve,reject)=>{const t=setTimeout(()=>reject(new Error("WebSocket connection timeout")),10000);this.ws!.onopen=()=>{clearTimeout(t);resolve()};this.ws!.onerror=()=>{clearTimeout(t);reject(new Error("WebSocket connection failed"))}});
    this.ws.onmessage=e=>{const m=JSON.parse(e.data) as DerivMessage;const id=Number((m as any).req_id||0);const listener=this.listeners.get(id);if(listener){listener.cb(m);if(!listener.persistent)this.listeners.delete(id)}};
    this.ws.onclose=()=>{this.listeners.clear()};
  }
  send(payload:Record<string,unknown>,cb?:(m:DerivMessage)=>void,persistent=false){if(!this.ws||this.ws.readyState!==WebSocket.OPEN)throw new Error("WebSocket not connected");const req_id=++this.id;if(cb)this.listeners.set(req_id,{cb,persistent});this.ws.send(JSON.stringify({...payload,req_id}));return req_id}
  balance(cb:(m:DerivMessage)=>void){return this.send({balance:1,subscribe:1},cb,true)}
  portfolio(cb:(m:DerivMessage)=>void){return this.send({portfolio:1,subscribe:1},cb,true)}
  ticks(symbol:string,cb:(m:DerivMessage)=>void){return this.send({ticks:symbol,subscribe:1},cb,true)}
  proposal(payload:Record<string,unknown>,cb:(m:DerivMessage)=>void){return this.send({proposal:1,...payload},cb)}
  buy(proposalId:string,price:number,cb:(m:DerivMessage)=>void){return this.send({buy:proposalId,price},cb)}
  close(){this.listeners.clear();this.ws?.close();this.ws=null}
}
