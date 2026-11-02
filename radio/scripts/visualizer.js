import { SpectrumPipeline } from './spectrum.js';
import { themes } from './themes.js';

// One rendering path; theme choices only select immutable geometry parameters.
export const visualizerSkins = Object.freeze({
  classic: Object.freeze({geometry:'segments',gap:4,segment:5,fps:60,caps:true}),
  minimalist: Object.freeze({geometry:'bars',gap:2,segment:0,fps:60,caps:true}),
  vintage: Object.freeze({geometry:'blocks',gap:5,segment:7,fps:30,caps:true}),
  aero: Object.freeze({geometry:'glass',gap:3,segment:0,fps:60,caps:true}),
});
// Compatibility helper: actual analyser bins only, not broadcast frequencies.
export function frequencyScale(analyser){
 const rate=analyser?.context?.sampleRate,count=analyser?.frequencyBinCount,fft=analyser?.fftSize;
 if(!(rate>0&&count>1&&fft>0))return [];
 const bins=[...new Set([1,...[500,2000,8000].map(hz=>Math.round(hz*fft/rate)),count-1])].filter(bin=>bin>=1&&bin<count);
 return bins.sort((a,b)=>a-b).map(bin=>({bin,hz:bin*rate/fft,position:Math.log(bin)/Math.log(count-1)}));
}

export function mountVisualizer(canvas,player){
 let ctx;
 const fail=()=>{if(canvas.dataset){canvas.dataset.failed='true';canvas.dataset.mode='signal';}canvas.dispatchEvent?.(new CustomEvent('displaychange',{detail:{mode:'signal'}}));};
 try{canvas.setAttribute('aria-hidden','true');ctx=canvas.getContext('2d');}catch{queueMicrotask(fail);return()=>{};}
 if(!ctx){queueMicrotask(fail);return()=>{};}
 const doc=canvas.ownerDocument||globalThis.document,motion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
 let snapshot=player.snapshot,analyser=null,pipeline=null,bins=null,failedAnalyser=null,stationId=snapshot.station?.id;
 let frame=null,timer=null,stopped=false,visible=true,lastTime=0,lastPaint=-Infinity,width=1,height=1,pad=18,base=1,inner=1,ratio=1;
 let skin=visualizerSkins.classic,colors=null,barGradient=null,live=false,staticDirty=true,hasFrame=false,quiet=false;
 let staticCanvas=null,staticCtx=null,axis=null,note=null,resizeObserver=null,intersectionObserver=null;
 if(doc?.createElement&&canvas.parentElement){
  staticCanvas=doc.createElement('canvas');staticCanvas.className='visualizer-static';staticCanvas.setAttribute('aria-hidden','true');canvas.before(staticCanvas);staticCtx=staticCanvas.getContext('2d');
  axis=doc.createElement('div');axis.className='frequency-axis';axis.setAttribute('aria-hidden','true');for(let i=0;i<3;i++)axis.append(doc.createElement('span'));canvas.after(axis);
  note=doc.createElement('span');note.className='visualizer-note';note.hidden=true;canvas.after(note);
 }
 const cancel=()=>{if(frame!==null)globalThis.cancelAnimationFrame?.(frame);if(timer!==null)globalThis.clearTimeout(timer);frame=timer=null;};
 function mode(value){if(canvas.dataset.mode!==value){canvas.dataset.mode=value;canvas.dispatchEvent?.(new CustomEvent('displaychange',{detail:{mode:value}}));}}
 function cacheTheme(){
  const style=globalThis.getComputedStyle?.(canvas),id=canvas.closest?.('[data-theme]')?.dataset.theme||doc?.documentElement?.dataset.theme;
  const selected=themes.find(item=>item.id===id);skin=visualizerSkins[selected?.visualizerSkin]||visualizerSkins.classic;
  const color=name=>style?.getPropertyValue('--visualizer-'+name).trim()||'CanvasText';
  colors={bar:color('bar'),end:color('bar-end'),cap:color('cap'),grid:color('grid'),error:color('error'),label:color('label'),capOutline:color('cap-outline')};
  barGradient=null;if(ctx.createLinearGradient){barGradient=ctx.createLinearGradient(0,0,0,height);barGradient.addColorStop(0,colors.bar);barGradient.addColorStop(1,colors.end);}
  staticDirty=true;
 }
 function resize(){
  const r=canvas.getBoundingClientRect();width=Math.max(1,r.width);height=Math.max(1,r.height);pad=width<400?12:18;inner=width-pad*2;base=height-30;ratio=Math.min(globalThis.devicePixelRatio||1,2);
  canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);
  if(staticCanvas){staticCanvas.width=canvas.width;staticCanvas.height=canvas.height;staticCanvas.style.cssText=`position:absolute;left:${canvas.offsetLeft}px;top:${canvas.offsetTop}px;width:${width}px;height:${height}px;pointer-events:none`;staticCtx?.setTransform(ratio,0,0,ratio,0,0);}
  if(axis)axis.style.cssText=`left:${canvas.offsetLeft+pad}px;top:${canvas.offsetTop+height-24}px;width:${inner}px`;
  if(note)note.style.cssText=`left:${canvas.offsetLeft+pad}px;top:${canvas.offsetTop+12}px`;
  if(pipeline&&pipeline.levels.length!==(width<440?22:32)){
   const previous=pipeline;
   pipeline=new SpectrumPipeline({sampleRate:analyser.context.sampleRate,fftSize:analyser.fftSize,bandCount:width<440?22:32});
   if(hasFrame){
    // Resize the held measured frame in logarithmic band space; no new audio read.
    for(let i=0;i<pipeline.levels.length;i++){
     const position=Math.max(0,Math.min(previous.levels.length-1,(i+.5)*previous.levels.length/pipeline.levels.length-.5));
     const low=Math.floor(position),high=Math.min(previous.levels.length-1,low+1),fraction=position-low;
     pipeline.levels[i]=previous.levels[low]+(previous.levels[high]-previous.levels[low])*fraction;
     pipeline.peaks[i]=previous.peaks[low]+(previous.peaks[high]-previous.peaks[low])*fraction;
    }
   }
  }
  cacheTheme();staticDirty=true;refresh();
 }
 function bindAnalysis(){
  const next=snapshot.analyser;
  if(next&&next!==analyser&&next!==failedAnalyser&&next.context?.sampleRate){
   analyser=next;analyser.fftSize=2048;analyser.smoothingTimeConstant=.4;
   bins=new Float32Array(analyser.frequencyBinCount);
   pipeline=new SpectrumPipeline({sampleRate:analyser.context.sampleRate,fftSize:2048,bandCount:width<440?22:32});
   hasFrame=false;quiet=false;staticDirty=true;
  }
 }
 function staticLayer(){
  if(!staticDirty)return;staticDirty=false;
  staticCtx?.clearRect(0,0,width,height);
  if(axis){axis.hidden=!live;const marks=[100,1000,10000];let previous=-Infinity;
   for(let i=0;i<3;i++){const item=axis.children[i],pos=pipeline?.getPosition(marks[i])??0,x=pos*inner;
    item.hidden=!live||x-previous<70||marks[i]>(pipeline?.bands.at(-1)?.highHz||0);if(item.hidden)continue;
    item.textContent=marks[i]===100?'100 Hz':marks[i]===1000?'1 kHz':'10 kHz';item.style.left=`${pos*100}%`;previous=x;
   }
  }
  if(!staticCtx)return;
  staticCtx.strokeStyle=colors.grid;staticCtx.lineWidth=1;staticCtx.beginPath();staticCtx.moveTo(pad,Math.round(base)+.5);staticCtx.lineTo(width-pad,Math.round(base)+.5);
  if(live&&pipeline){for(let i=0;i<3;i++){const hz=i===0?100:i===1?1000:10000,x=pad+pipeline.getPosition(hz)*inner;staticCtx.moveTo(Math.round(x)+.5,base+3);staticCtx.lineTo(Math.round(x)+.5,base+8);}}
  staticCtx.stroke();
 }
 function rest(error=false){
  const count=width<440?22:32,step=inner/count;
  ctx.fillStyle=error?colors.error:colors.grid;
  for(let i=0;i<count;i++)ctx.fillRect(Math.round(pad+i*step),Math.round(base-5),Math.max(1,Math.floor(step-skin.gap)),3);
 }
 function schedule(){
  if(stopped||doc?.hidden||!visible)return;
  const state=snapshot.state,moving=state==='Playing'||state==='Connecting'||state==='Buffering'||state==='Reconnecting';
  if(!moving)return;
  if(motion?.matches||quiet){timer=globalThis.setTimeout(slowTick, motion?.matches?334:250);return;}
  if(globalThis.requestAnimationFrame)frame=globalThis.requestAnimationFrame(tick);
 }
 function slowTick(){timer=null;draw(globalThis.performance?.now?.()||Date.now());}
 function draw(now=0){
  frame=null;timer=null;if(stopped||doc?.hidden||!visible)return;
  const state=snapshot.state,playing=state==='Playing',paused=state==='Paused';
  const contextRunning=analyser?.context?.state==='running';
  const analysis=!!(snapshot.analysis&&pipeline&&analyser!==failedAnalyser&&contextRunning);
  const nextLive=playing&&analysis;
  if(live!==nextLive){live=nextLive;staticDirty=true;}
  const dt=lastTime?Math.max(0,Math.min(1000,now-lastTime)):16;lastTime=now;
  try{
   if(live){
    try{analyser.getFloatFrequencyData(bins);pipeline.update(bins,dt);hasFrame=true;quiet=pipeline.quiet;
     if(canvas.dataset.failed==='true'){canvas.dataset.failed='false';canvas.dispatchEvent?.(new CustomEvent('displaychange',{detail:{mode:'spectrum'}}));}
    }catch{failedAnalyser=analyser;live=false;quiet=false;staticDirty=true;fail();}
   }
   staticLayer();
   mode(live?'spectrum':'signal');
   if(note){const text=playing&&!live?'Signal display':quiet?'Quiet signal':'';if(note.textContent!==text)note.textContent=text;note.hidden=!text;}
   ctx.clearRect(0,0,width,height);
   if((live||paused&&hasFrame)&&pipeline&&!quiet){
    ctx.globalAlpha=paused?.5:1;
    const count=pipeline.levels.length,step=inner/count,bw=Math.max(1,Math.floor(step-skin.gap)),available=Math.max(1,base-12);
    for(let i=0;i<count;i++){
     const x=Math.round(pad+i*step),h=Math.round(pipeline.levels[i]*available),y=Math.round(base-h);
     ctx.fillStyle=skin.geometry==='glass'&&barGradient?barGradient:colors.bar;
     if(skin.segment){for(let cy=base-skin.segment;cy>=y;cy-=skin.segment+2)ctx.fillRect(x,Math.round(cy),bw,skin.segment);}else if(h>0)ctx.fillRect(x,y,bw,h);
     if(skin.geometry==='glass'&&h>0){ctx.fillStyle=colors.cap;ctx.fillRect(x,y,1,h);}
     if(skin.caps&&!motion?.matches&&pipeline.peaks[i]>0){ctx.fillStyle=colors.cap;const capY=Math.round(base-pipeline.peaks[i]*available)-2;ctx.fillRect(x,capY,bw,2);if(skin.geometry==='glass'){ctx.strokeStyle=colors.capOutline;ctx.lineWidth=1;ctx.strokeRect?.(x-.5,capY-.5,bw+1,3);}}
    }
    ctx.globalAlpha=1;
   }else if(state==='Idle'||paused||quiet||state==='Unavailable'){
    rest(state==='Unavailable');ctx.fillStyle=state==='Unavailable'?colors.error:colors.label;
    if(paused){ctx.fillRect(width/2-7,18,4,16);ctx.fillRect(width/2+3,18,4,16);}
    else if(state==='Unavailable'){ctx.beginPath();ctx.moveTo(width/2-6,height/2-6);ctx.lineTo(width/2+6,height/2+6);ctx.moveTo(width/2+6,height/2-6);ctx.lineTo(width/2-6,height/2+6);ctx.strokeStyle=colors.error;ctx.stroke();}
    else if(state==='Idle'){ctx.beginPath();ctx.arc(width/2,28,5,0,Math.PI*2);ctx.strokeStyle=colors.grid;ctx.stroke();}
   }else if(playing){
    // Equal steady marks are a playback-state symbol, never a spectrum.
    ctx.fillStyle=colors.bar;for(let i=-1;i<=1;i++)ctx.fillRect(Math.round(width/2+i*34-9),Math.round(height/2-4),18,8);
   }else{
    ctx.fillStyle=colors.grid;ctx.fillRect(pad,Math.round(height/2),Math.round(inner),1);
    const position=motion?.matches?0:(now%2400)/2400;ctx.fillStyle=colors.bar;ctx.fillRect(Math.round(pad+position*(inner-22)),Math.round(height/2-4),22,8);
   }
  }catch{fail();cancel();return;}
  schedule();
 }
 function tick(time){frame=null;if(doc?.hidden||!visible||stopped)return;if(time-lastPaint<1000/skin.fps-1){frame=globalThis.requestAnimationFrame(tick);return;}lastPaint=time;draw(time);}
 function refresh(){cancel();lastTime=0;draw(globalThis.performance?.now?.()||0);}
 function changed(event){
  snapshot=event.detail;canvas.dataset.state=snapshot.state.toLowerCase();if(snapshot.station?.id!==stationId){stationId=snapshot.station?.id;pipeline?.reset();hasFrame=false;quiet=false;ctx.clearRect(0,0,width,height);}
  bindAnalysis();staticDirty=true;refresh();
 }
 const themed=()=>{cacheTheme();refresh();};
 player.addEventListener('change',changed);doc?.addEventListener('visibilitychange',refresh);doc?.addEventListener('radio:themechange',themed);motion?.addEventListener('change',refresh);globalThis.addEventListener?.('resize',resize);
 if(globalThis.ResizeObserver){resizeObserver=new ResizeObserver(resize);resizeObserver.observe(canvas);resizeObserver.observe(canvas.parentElement);const identity=doc?.querySelector?.('.identity');if(identity)resizeObserver.observe(identity);}
 if(globalThis.IntersectionObserver){intersectionObserver=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting!==false;refresh();});intersectionObserver.observe(canvas);}
 canvas.dataset.state=snapshot.state.toLowerCase();resize();bindAnalysis();refresh();
 return()=>{stopped=true;cancel();resizeObserver?.disconnect();intersectionObserver?.disconnect();player.removeEventListener('change',changed);doc?.removeEventListener('visibilitychange',refresh);doc?.removeEventListener('radio:themechange',themed);motion?.removeEventListener('change',refresh);globalThis.removeEventListener?.('resize',resize);staticCanvas?.remove();axis?.remove();note?.remove();};
}
