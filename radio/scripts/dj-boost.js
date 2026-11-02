/** Generated audio can use Web Audio gain above the HTML audio volume limit. */
export async function createSpeechOutput(url, level, options={}) {
 const AudioCtor=options.AudioCtor||globalThis.Audio, ContextCtor=options.ContextCtor||globalThis.AudioContext||globalThis.webkitAudioContext;
 const volume=Number.isFinite(level)?Math.max(0,Math.min(3,level)):1;
 let audio=new AudioCtor(url),context;
 if(volume<=1){audio.volume=volume;return {audio,boosted:true,close(){}};}
 try{
  if(!ContextCtor)throw Error('Web Audio unavailable');
  context=new ContextCtor();const source=context.createMediaElementSource(audio),gain=context.createGain();gain.gain.value=volume;source.connect(gain);gain.connect(context.destination);let timer;try{await Promise.race([context.resume(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Web Audio did not start')),1500);})]);}finally{clearTimeout(timer);}
  if(context.state && context.state!=='running')throw Error('Web Audio suspended');
  audio.volume=1;return {audio,boosted:true,close(){try{source.disconnect?.();gain.disconnect?.();}catch{}try{Promise.resolve(context.close()).catch(()=>{});}catch{}}};
 }catch{
  try{Promise.resolve(context?.close()).catch(()=>{});}catch{}
  audio=new AudioCtor(url);audio.volume=1;return {audio,boosted:false,close(){}};
 }
}
