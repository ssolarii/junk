/** Explicit microphone sessions. Nothing opens until start() is called by Talk. */
export class DJInput {
 constructor(controller,onStatus=()=>{}){this.controller=controller;this.onStatus=onStatus;this.active=false;this.generation=0;this.turns=new Map();}
 async start(){
  if(this.active)return;this.finish?.(false);this.active=true;const generation=++this.generation;this.turns.clear();this.controller.cancel();this.controller.voice.beginListening({ducking:this.controller.settings?.duckLevel});this.onStatus('Starting microphone…');
  try{
   const {token}=await this.controller.api('stt-token');if(!this.active||generation!==this.generation)return;
   const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,deviceId:this.controller.settings.inputDevice?{exact:this.controller.settings.inputDevice}:undefined}});
   if(!this.active||generation!==this.generation){stream.getTracks().forEach(t=>t.stop());return;}
   this.stream=stream;const context=new AudioContext({sampleRate:16000});this.context=context;await context.resume();if(generation!==this.generation){context.close().catch(()=>{});return;}const rate=context.sampleRate;
   if(generation!==this.generation)return;this.socket=new WebSocket('wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&token='+encodeURIComponent(token));this.socket.binaryType='arraybuffer';
   this.socket.onmessage=e=>{if(generation!==this.generation)return;let data;try{data=JSON.parse(e.data);}catch{return;}if(data.type==='Turn'&&data.transcript){this.turns.set(data.turn_order,data.transcript);this.onStatus('Listening: '+data.transcript);}if(data.type==='Termination')this.finish?.();if(data.type==='Error'){this.onStatus('Transcription failed. Try Talk again or type your message.');this.stop(false);}};
   this.socket.onclose=()=>{if(generation!==this.generation)return;if(this.finish)this.finish();else if(this.active){this.onStatus('Transcription session ended. Press Talk to reconnect.');this.stop(false);}};
   this.socket.onerror=()=>{if(generation!==this.generation)return;this.onStatus('Transcription connection failed. You can type instead.');this.stop(false);};
   this.socket.onopen=()=>{
    if(!this.active||generation!==this.generation)return;this.onStatus('Listening. Press Talk again when finished.');
    this.source=this.context.createMediaStreamSource(this.stream);this.processor=this.context.createScriptProcessor(4096,1,1);
    this.silent=this.context.createGain();this.silent.gain.value=0;this.source.connect(this.processor);this.processor.connect(this.silent);this.silent.connect(this.context.destination);
    this.processor.onaudioprocess=e=>{if(!this.active||this.socket.readyState!==1)return;const input=e.inputBuffer.getChannelData(0),ratio=rate/16000,pcm=new Int16Array(Math.floor(input.length/ratio));for(let i=0;i<pcm.length;i++)pcm[i]=Math.max(-1,Math.min(1,input[Math.floor(i*ratio)]))*32767;this.socket.send(pcm.buffer);};
   };
  }catch(e){if(generation!==this.generation)return;const reason=e?.name==='NotAllowedError'||e?.name==='SecurityError'?'Microphone permission was denied. Allow microphone access in your browser, then try Talk again.':e?.name==='NotFoundError'||e?.name==='OverconstrainedError'?'That microphone is unavailable. Choose another input device in Settings or type a message.':e?.name==='NotReadableError'?'The microphone is busy in another app. Close the other app or type a message.':e?.name==='NetworkError'?'Could not reach AssemblyAI. Check your connection, then try Talk again.':e?.message||'Microphone unavailable. You can type instead.';this.onStatus(reason);this.stop(false);}
 }
 stop(send=true){
  if(this.finish){this.finish(false);return;}
  this.active=false;const generation=this.generation;if(this.processor)this.processor.onaudioprocess=null;
  for(const n of [this.source,this.processor,this.silent])try{n?.disconnect();}catch{}
  this.stream?.getTracks().forEach(t=>t.stop());this.context?.close().catch(()=>{});
  this.stream=null;this.context=null;this.controller.voice.endListening();
  let timer;this.finish=(submit=send)=>{clearTimeout(timer);if(generation!==this.generation)return;++this.generation;this.finish=null;this.socket?.close();this.socket=null;const text=[...this.turns.values()].join(' ');this.turns.clear();if(submit&&text){this.onStatus('Sending your message…');this.controller.chat(text);}else if(submit)this.onStatus('No speech captured. Try again or type a message.');};
  if(this.socket?.readyState===1){this.socket.send(JSON.stringify({type:'Terminate'}));if(send){this.onStatus('Finishing transcription…');timer=setTimeout(()=>this.finish?.(),1000);return;}}
  this.finish(send);
 }
}
