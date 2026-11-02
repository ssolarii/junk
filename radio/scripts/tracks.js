/** Station-reported metadata only. This module never owns or controls media. */
const text=value=>typeof value==='string'?value.trim().slice(0,400):'';
function timestamp(value){
 let time=typeof value==='number'||(typeof value==='string'&&/^\d+(\.\d+)?$/.test(value))?Number(value):Date.parse(value);
 if(time>0&&time<1e12)time*=1000;
 return Number.isFinite(time)&&time>=946684800000&&time<4102444800000?time:null;
}
export function normalizeTracks(data,format,now=Date.now()){
 const rows=format==='soma'?data?.songs:format==='station'?data?.history:data;
 if(!Array.isArray(rows))throw new TypeError('Unsupported track feed format.');
 const found=new Map();let current=null;
 for(const row of rows.slice(0,500)){
  if(!row||typeof row!=='object'||Array.isArray(row))continue;
  const time=timestamp(row.time??row.date??row.playedat??row.played??row.started);
  let artist=text(row.artist),title=text(row.title);
  if(format==='shoutcast'||!title){
   const combined=text(row.song)||title,split=combined.indexOf(' - ');
   if(split>0){artist=artist||combined.slice(0,split).trim();title=combined.slice(split+3).trim();}else title=combined;
  }
  if(time===null||!title)continue;
  const entry=Object.freeze({time,artist,title,album:text(row.album)});
  if(row===rows[0]&&['powerhitz','soma','shoutcast'].includes(format)&&(format==='powerhitz'||time<=now))current=entry;
  found.set(JSON.stringify([time,artist,title]),entry);
 }
 const entries=[...found.values()];
 const isCurrent=t=>current&&t.time===current.time&&t.artist===current.artist&&t.title===current.title;
 return {current,recent:entries.filter(t=>t.time<=now&&!isCurrent(t)).sort((a,b)=>b.time-a.time).slice(0,50),
  upcoming:entries.filter(t=>t.time>now&&!isCurrent(t)).sort((a,b)=>a.time-b.time).slice(0,10)};
}

/** Polls while listening or viewing history, only while the page is visible. */
export class TrackHistory extends EventTarget {
 constructor(options={}){
  super();this._fetch=options.fetch||globalThis.fetch.bind(globalThis);
  this._now=options.now||Date.now;this._setTimeout=options.setTimeout||globalThis.setTimeout.bind(globalThis);
  this._clearTimeout=options.clearTimeout||globalThis.clearTimeout.bind(globalThis);
  this._cache=new Map();this._serial=0;this._open=false;this._listening=false;this._visible=true;this._disposed=false;
  this._pollMs=options.pollMs||60000;
  this._state={station:null,status:'idle',current:null,recent:[],upcoming:[],updatedAt:null,stale:false};
 }
 get snapshot(){return {...this._state,recent:[...this._state.recent],upcoming:[...this._state.upcoming]};}
 _publish(value={}){this._state={...this._state,...value};this.dispatchEvent(new Event('change'));}
 _cancel(){
  ++this._serial;this._controller?.abort();this._controller=null;
  for(const key of ['_poll','_deadline']){if(this[key]!==undefined)this._clearTimeout(this[key]);this[key]=undefined;}
 }
 _active(){return (this._open||this._listening)&&this._visible&&!this._disposed;}
 select(station,options={}){
  if(this._disposed)return;
  if(station.id===this._state.station?.id){if('listening'in options)this.setListening(options.listening);return;}
  if('listening'in options)this._listening=!!options.listening;
  this._cancel();const cache=this._cache.get(station.id);
  this._publish({station,status:station.trackFeed?(cache?'ready':'idle'):'unsupported',current:cache?.current||null,recent:cache?.recent||[],upcoming:cache?.upcoming||[],updatedAt:cache?.updatedAt||null,stale:!!cache&&this._now()-cache.updatedAt>=this._pollMs});
  if(this._active())this._resume();
 }
 open(){if(this._disposed)return;this._open=true;return this._resume();}
 close(){this._open=false;if(!this._listening)this._cancel();}
 setListening(value){if(this._disposed||this._listening===!!value)return;this._listening=!!value;if(!this._active())this._cancel();else return this._resume();}
 setVisible(visible){if(this._disposed||this._visible===visible)return;this._visible=visible;if(!visible)this._cancel();else if(this._active())return this._resume();}
 _resume(){
  if(!this._active()||!this._state.station?.trackFeed)return;
  if(this._controller)return Promise.resolve();
  const cache=this._cache.get(this._state.station.id);
  if(cache&&this._now()-cache.updatedAt<this._pollMs){this._publish({...cache,status:'ready',stale:false});this._schedule();return Promise.resolve();}
  return this.refresh();
 }
 _schedule(){
  if(this._poll!==undefined)this._clearTimeout(this._poll);
  if(this._active()&&this._state.station?.trackFeed)this._poll=this._setTimeout(()=>{this._poll=undefined;this.refresh();},this._pollMs);
 }
 async refresh(){
  const station=this._state.station;
  if(!this._active()||!station?.trackFeed)return;
  this._cancel();const serial=this._serial,controller=new AbortController();this._controller=controller;
  this._publish({status:'loading'});
  this._deadline=this._setTimeout(()=>controller.abort(),8000);
  try{
   const feed=station.trackFeed;
   const url=feed.relay?new URL('../api/tracks/'+encodeURIComponent(station.id),import.meta.url).href:feed.url;
   const response=await this._fetch(url,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
   if(!response.ok)throw new Error('Track feed unavailable.');
   const data=normalizeTracks(await response.json(),feed.format,this._now());
   if(serial!==this._serial||controller.signal.aborted)return;
   const cache={...data,updatedAt:this._now()};this._cache.set(station.id,cache);
   this._publish({...cache,status:'ready',stale:false});
  }catch{
   if(serial===this._serial)this._publish({status:'error',stale:!!this._state.updatedAt});
  }finally{
   if(serial===this._serial){if(this._deadline!==undefined)this._clearTimeout(this._deadline);this._deadline=undefined;this._controller=null;this._schedule();}
  }
 }
 dispose(){this._listening=false;this.close();this._disposed=true;this._cache.clear();}
}
