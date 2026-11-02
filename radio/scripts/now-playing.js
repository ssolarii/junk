/** Current song presentation and optional cover lookup, independent of media ownership. */
export function mountNowPlaying({player,history,renderBadge,artworkEnabled=true}){
 const box=document.getElementById('now-playing'),label=document.getElementById('now-label'),title=document.getElementById('now-title'),artist=document.getElementById('now-artist'),credit=document.getElementById('now-art-source');
 const cover=document.getElementById('station-badge'),cache=new Map();
 let signature='',controller=null,delay=null,deadline=null,version=0,artwork=null,artStation=null;
 function remember(key,value){cache.delete(key);cache.set(key,value);if(cache.size>100)cache.delete(cache.keys().next().value);}
 function cancel(){version++;controller?.abort();controller=null;clearTimeout(delay);clearTimeout(deadline);delay=deadline=null;}
 function artworkFor(id){return artStation===id?artwork:null;}
 function useArt(value,id){artwork=value;artStation=id;const p=player.snapshot;renderBadge(cover,p.station,artworkFor(p.station.id));credit.hidden=!value?.source;if(value?.source)credit.href=value.source;if(p.sourceKind==='track')box.hidden=!value?.source;}
 async function lookup(track,id,key){
  const requestVersion=version,requestController=new AbortController();controller=requestController;deadline=setTimeout(()=>requestController.abort(),22000);
  try{
   const url=new URL('../api/artwork',import.meta.url);url.searchParams.set('artist',track.artist);url.searchParams.set('title',track.title);
   const response=await fetch(url,{signal:requestController.signal,credentials:'omit',referrerPolicy:'no-referrer'});if(!response.ok)throw Error();
   const data=await response.json();if(requestVersion!==version)return;
   const value=data.artwork;
   // The local lookup supplies only verified HTTPS archive thumbnails and release links.
   const valid=value&&/^https:\/\/(?:coverartarchive\.org|archive\.org|(?:ia|dn)\d+\.(?:us|eu|ca)\.archive\.org)\//.test(value.url)&&/^https:\/\/musicbrainz\.org\/release\/[a-f0-9-]+$/.test(value.source);
   const result=valid?value:null;remember(key,result);
   useArt(result,id);
  }catch{if(requestVersion===version)useArt(null,id);}
  finally{if(requestVersion===version){clearTimeout(deadline);deadline=null;controller=null;}}
 }
 async function lookupCustom(track,id,key){
  const embeddedKey='embedded:'+id,requestVersion=version,requestController=new AbortController();controller=requestController;deadline=setTimeout(()=>requestController.abort(),22000);
  try{
   const url=new URL('../api/dj/cover/'+encodeURIComponent(id),import.meta.url);
   const response=await fetch(url,{signal:requestController.signal,credentials:'omit',referrerPolicy:'no-referrer'});
   if(requestVersion!==version)return;
   if(response.ok&&/^image\/(png|jpeg|webp)(?:;|$)/i.test(response.headers.get('content-type')||'')){
    const value={url:url.href,source:null};remember(embeddedKey,value);useArt(value,id);return;
   }
   remember(embeddedKey,null);
  }catch{if(requestVersion!==version)return;}
  finally{if(requestVersion===version){clearTimeout(deadline);deadline=null;controller=null;}}
  if(requestVersion!==version||!track.artist)return;
  if(cache.has(key))useArt(cache.get(key),id);else lookup(track,id,key);
 }
 function render(){
  const s=history.snapshot,p=player.snapshot,custom=p.sourceKind==='track'&&p.track,track=custom|| (s.station?.id===p.station.id?s.current:null);
  const nextKey=track?JSON.stringify([custom?'custom':'radio',p.station.id,track.artist,track.title]):'';
  box.hidden=custom?!artworkFor(p.station.id)?.source:!track;
  if(!track){if(signature){cancel();signature='';useArt(null,p.station.id);}return;}
  if(custom){label.textContent='';title.textContent='';artist.textContent='';}
  else{const live=p.state==='Playing'&&!s.stale&&Date.now()-track.time<3600000;
   label.textContent=live?'Now playing':p.state==='Connecting'||p.state==='Reconnecting'||p.state==='Buffering'?'On this station':'Last reported';
   title.textContent=track.title;artist.textContent=track.artist||'Artist not provided';}
  if(nextKey!==signature){
   cancel();signature=nextKey;useArt(null,p.station.id);
   if(!artworkEnabled)return;
   const key=JSON.stringify([track.artist,track.title]);
   const embeddedKey='embedded:'+p.station.id;
   if(custom&&!document.hidden){const id=p.station.id;if(cache.has(embeddedKey)&&cache.get(embeddedKey))useArt(cache.get(embeddedKey),id);else if(cache.has(embeddedKey)){if(cache.has(key))useArt(cache.get(key),id);else if(track.artist)lookup(track,id,key);}else lookupCustom(track,id,key);}
   else if(cache.has(key))useArt(cache.get(key),p.station.id);
   else if(track.artist&&!document.hidden){const id=p.station.id;delay=setTimeout(()=>{delay=null;lookup(track,id,key);},450);}
  }
 }
 history.addEventListener('change',render);player.addEventListener('change',render);
 cover.addEventListener('covererror',event=>{if(artwork?.url===event.detail.url&&artStation===event.detail.stationId){const p=player.snapshot,track=p.sourceKind==='track'?p.track:history.snapshot.current,id=artStation,embedded=artwork.url.includes('/api/dj/cover/');if(embedded)remember('embedded:'+id,null);else if(track)remember(JSON.stringify([track.artist,track.title]),null);useArt(null,id);if(embedded&&track?.artist){const key=JSON.stringify([track.artist,track.title]);if(cache.has(key))useArt(cache.get(key),id);else lookup(track,id,key);}}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){cancel();signature='';}else render();});
 window.addEventListener('pagehide',cancel);render();
 return {render,artworkFor,dispose:cancel};
}
