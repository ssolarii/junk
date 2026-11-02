import { DJQueue } from './dj-queue.js';
import { DJVoice } from './dj-voice.js';
import { createSpeechOutput } from './dj-boost.js';

export class DJController extends EventTarget {
 constructor({player,stations,history,request=globalThis.fetch.bind(globalThis)}){
  super();Object.assign(this,{player,stations,history,request});this.queue=new DJQueue();this.voice=new DJVoice(player);
  this.settings={mode:'assisted',fullStyle:'play',talkativeness:'balanced',duckLevel:.2};this.library=[];this.onlineResults=[];this.enabled=false;this.pending=[];this.messages=[];this.generation=0;this.speechGeneration=0;this.lastStation=player.snapshot.station.id;
  this.queue.addEventListener('change',()=>this.emit());
  this.voice.addEventListener('change',()=>this.emit());
  player.addEventListener('change',()=>{if(player.snapshot.sourceKind!=='track')this.lastStation=player.snapshot.station.id;});
  player.addEventListener('ended',()=>this.advance());
  player.addEventListener('trackerror',()=>{if(this.playlist){this.messages.push({role:'assistant',text:'A playlist track could not be played. Skipping to the next one.'});this.emit();}this.advance();});
 }
 emit(){this.dispatchEvent(new Event('change'));}
 get locked(){return this.enabled&&this.settings.mode==='full';}
 async api(path,body,signal){const options=body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)};if(signal)options.signal=signal;const r=await this.request('/api/dj/'+path,options);const value=await r.json();if(!r.ok)throw Error(value.error||'The DJ service is unavailable.');return value;}
 async load(){const data=await this.api('state');this.settings={...this.settings,...data.settings};this.library=data.library||[];this.memory=data.memory||'';this.providers=data.providers;this.catalog=data.catalog;this.emit();return data;}
 async save(settings){await this.api('settings',settings);await this.load();this.cancel();this.emit();}
 cancel(){++this.generation;this.abort?.abort();this.pending=[];this.busy=false;this.stopSpeech();}
 stopSpeech(){++this.speechGeneration;this.speechAbort?.abort();if(this.speechAudio){this.speechAudio.pause();this.speechAudio.src='';this.speechAudio=null;}this.speechOutput?.close();this.speechOutput=null;this.speechFinish?.();this.speechFinish=null;if(this.speechURL){URL.revokeObjectURL(this.speechURL);this.speechURL=null;}this.voice.stop();if(this.priorDucking!==undefined){this.player.setDucking(this.priorDucking);this.priorDucking=undefined;}this.speechState='idle';this.emit();}
 setEnabled(value){this.cancel();this.enabled=!!value;if(!this.enabled)this.playlist=null;clearInterval(this.timer);if(this.enabled)this.timer=setInterval(()=>{if(!document.hidden&&!document.querySelector('dialog[open]')&&!this.busy&&this.settings.talkativeness!=='quiet')this.chat('Briefly check in or suggest music if useful. Do not interrupt a local track.','automatic');},this.settings.talkativeness==='chatty'?180000:600000);this.emit();}
 manual(){if(this.locked)return false;this.cancel();this.playlist=null;return true;}
 context(){return {stations:this.stations.map(({id,name,genre})=>({id,name,genre})),queue:this.queue.snapshot.slice(0,30),current:this.player.snapshot.station,currentTrack:this.history?.snapshot?.current,mode:this.settings.mode,fullStyle:this.settings.fullStyle};}
 async chat(message,origin='user'){
  if(!this.enabled)throw Error('Turn on AI DJ to chat.');if(!message.trim())return;
  this.cancel();this.lastError='';const serial=this.generation;this.abort=new AbortController();this.busy=true;this.messages.push({role:'user',text:message});this.emit();
  try{
   const data=await this.api('chat',{message,context:{...this.context(),conversation:this.messages.slice(-6).map(m=>({...m,text:m.text.slice(0,1500)}))}},this.abort.signal);
   if(serial!==this.generation)return;
   this.lastError='';this.messages.push({role:'assistant',text:data.text||'No response received.'});
   const actions=(data.actions||[]).filter(a=>['station','track','queue','playlist','remember','forget','online_search'].includes(a.type));
   if(origin==='automatic'&&(this.settings.mode!=='full'||this.settings.fullStyle==='suggest'||this.player.snapshot.sourceKind==='track'))this.pending=actions;
   else if(this.settings.mode==='full'&&this.settings.fullStyle==='suggest')this.pending=actions;
   else for(const a of actions){if(serial!==this.generation)return;await this.execute(a);}
   if(serial!==this.generation)return;
   this.speak(data.text||'');
  }catch(e){if(serial===this.generation){this.lastError=e.message;this.messages.push({role:'assistant',text:e.message});}}
  finally{if(serial===this.generation){this.busy=false;this.emit();}}
 }
 async switchItUp(){if(!this.enabled)this.setEnabled(true);return this.chat('Switch it up. Pick a different station or a contrasting track from my available library. Use only the stations and tracks I provided. Follow my current control mode and approval settings. Do not claim to have played something unless the application confirms it.','user');}
 async execute(action){
  if(action.type==='playlist'){const items=(action.ids||[]).map(id=>this.library.find(t=>t.id===id));if(!items.length||items.some(t=>!t))throw Error('The playlist contains unavailable tracks. Ask the DJ to search again.');this.playlist={name:action.name,items,index:0};this.player.selectTrack(items[0]);this.emit();}
  if(action.type==='online_search'){await this.searchOnline(action.query);this.onlineApproval=true;}
  if(action.type==='station'){const station=this.stations.find(s=>s.id===action.id);if(station){this.playlist=null;this.player.select(station.id);}}
  if(action.type==='track'){const track=this.library.find(t=>t.id===action.id);if(track){this.playlist=null;this.player.selectTrack(track);}}
  if(action.type==='queue'){const track=this.library.find(t=>t.id===action.id),station=this.stations.find(t=>t.id===action.id);if(track)this.queue.add({...track,kind:'track'});else if(station)this.queue.add({...station,title:station.name,kind:'station'});}
  if(action.type==='forget'&&typeof action.text==='string'){this.memory=this.memory.split('\n').filter(line=>line!==action.text&&line!=='- '+action.text).join('\n');await this.api('memory',{text:this.memory});}
  if(action.type==='remember'&&typeof action.text==='string'){this.memory=(this.memory+'\n- '+action.text.slice(0,1000)).slice(-24000);await this.api('memory',{text:this.memory});}
 }
 async searchOnline(query){const data=await this.api('online-search',{query});this.onlineResults=data.results||[];this.emit();return this.onlineResults;}
 async playOnline(result){const serial=this.generation;const data=await this.api('online-download',{url:result.url});if(serial!==this.generation)return;await this.load();if(serial!==this.generation)return;this.playlist=null;this.player.selectTrack(data.track);this.messages.push({role:'assistant',text:'Playing '+data.track.title});this.emit();}
 async approve(){const serial=this.generation,actions=[...this.pending];this.pending=[];for(const a of actions){if(serial!==this.generation)return;await this.execute(a);}this.emit();}
 skipPlaylist(direction){if(!this.enabled||!this.playlist)return false;const next=this.playlist.index+direction;if(next<0)return true;if(next>=this.playlist.items.length){this.playlist=null;this.player.select(this.lastStation);this.emit();return true;}this.playlist.index=next;this.player.selectTrack(this.playlist.items[next]);this.emit();return true;}
 async advance(){if(!this.enabled)return;if(this.playlist){this.skipPlaylist(1);return;}const next=this.queue.shift();if(next){if(this.locked&&this.settings.fullStyle==='suggest'){this.player.select(this.lastStation);this.pending=[{type:next.kind==='station'?'station':'track',id:next.id}];this.emit();return;}await this.execute({type:next.kind==='station'?'station':'track',id:next.id});}else if(!this.enabled){return;}else if(this.settings.mode==='assisted'){this.player.select(this.lastStation);}else{this.player.select(this.lastStation);await this.chat('The queue has ended. Choose or suggest the next available music.','automatic');}}
 async speak(text){
  this.stopSpeech();if(!text.trim()||this.voice.snapshot.state==='listening')return;const serial=this.speechGeneration;
  const order=this.settings.speechProvider==='system'?['system']:[...new Set([this.settings.speechProvider,...(this.settings.speechFallback||['elevenlabs','cartesia','system'])])];
  for(const provider of order){
   if(serial!==this.speechGeneration)return;
   if(provider==='system'){this.speechState='idle';return this.voice.speak(text,{ducking:this.settings.duckLevel,volume:this.settings.voiceLevel??1,voiceURI:this.settings.systemVoice||undefined});}
   try{
    this.speechState='preparing';this.emit();const abort=new AbortController();this.speechAbort=abort;
    const response=await this.request('/api/dj/tts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,provider,voice:this.settings[provider+'Voice'],model:this.settings[provider+'Model']}),signal:abort.signal});
    if(!response.ok)throw Error('Voice provider unavailable.');const blob=await response.blob();if(serial!==this.speechGeneration)return;
    this.speechURL=URL.createObjectURL(blob);const output=await createSpeechOutput(this.speechURL,this.settings.voiceLevel??1);if(serial!==this.speechGeneration){output.close();return;}this.speechOutput=output;const audio=output.audio;this.speechAudio=audio;if(!output.boosted){this.messages.push({role:'assistant',text:'Voice boost is unavailable in this browser; using normal voice volume.'});this.emit();}this.priorDucking=this.player.snapshot.ducking??1;this.player.setDucking(this.settings.duckLevel??.2);
    this.speechState='speaking';this.emit();await new Promise((resolve,reject)=>{this.speechFinish=resolve;audio.onended=resolve;audio.onerror=reject;audio.play().catch(reject);});
    if(serial===this.speechGeneration)this.stopSpeech();return;
   }catch{if(serial!==this.speechGeneration)return;this.speechOutput?.close();this.speechOutput=null;if(this.speechURL){URL.revokeObjectURL(this.speechURL);this.speechURL=null;}this.speechAudio=null;this.speechFinish=null;if(this.priorDucking!==undefined){this.player.setDucking(this.priorDucking);this.priorDucking=undefined;}this.messages.push({role:'assistant',text:`${provider} voice unavailable; trying the next voice.`});this.emit();}
  }
 }
 dispose(){this.setEnabled(false);this.voice.dispose?.();}
}
