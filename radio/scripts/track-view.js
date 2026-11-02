import { TrackHistory } from './tracks.js';

/** Adds a read-only native dialog. Opening, refreshing and closing never control audio. */
export function mountTrackHistory({player,dialog,button,open,renderBadge}){
 const client=new TrackHistory({pollMs:30000}),$=id=>dialog.querySelector('#'+id);
 const dateFormat=new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
 const clockFormat=new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'});
 const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;
 $('tracks-time-note').textContent=`Times shown in ${zone}. Station reports may differ from buffered audio.`;
 function list(target,tracks){
  target.replaceChildren(...tracks.map((track,index)=>{
   const li=document.createElement('li'),time=document.createElement('time'),copy=document.createElement('div');
   time.dateTime=new Date(track.time).toISOString();time.textContent=dateFormat.format(track.time);time.title=new Date(track.time).toLocaleString();
   const title=document.createElement('strong');title.textContent=track.title;
   const artist=document.createElement('span');artist.textContent=track.artist||'Artist not provided';
   copy.append(title,artist);
   if(track.album){const album=document.createElement('span');album.className='track-album';album.textContent=track.album;copy.append(album);}
   li.append(time,copy);return li;
  }));
 }
 function render(){
  const s=client.snapshot,station=s.station;if(!station)return;
  $('tracks-station').textContent=station.name;$('tracks-genre').textContent=station.genre;
  renderBadge($('tracks-cover'),station);
  const source=station.trackFeed?.source||station.website;
  $('tracks-source').hidden=!source;if(source)$('tracks-source').href=source;
  $('tracks-source').textContent=station.trackFeed?'Station track list':'Station website';
  $('tracks-refresh').hidden=!station.trackFeed;$('tracks-refresh').disabled=s.status==='loading';
  $('tracks-time-note').hidden=!station.trackFeed;
  const updated=s.updatedAt?clockFormat.format(s.updatedAt):'';
  $('tracks-status').textContent=s.status==='unsupported'?'No supported track list is available for this station.':
   s.status==='loading'?(s.current||s.recent.length?'Updating track list…':'Loading track list…'):
   s.status==='error'?(s.stale?`Couldn’t update. Showing the list saved at ${updated}.`:'The track list is unavailable right now. Try again or visit the station’s list.'):
   s.status==='ready'?(s.current||s.recent.length||s.upcoming.length?`Updated ${updated}.`:'The station hasn’t reported any recent tracks.'):'Open this panel to load tracks.';
  $('tracks-current-section').hidden=!s.current;
  $('tracks-current-title').textContent=s.stale?'Last reported':'Now playing';
  list($('tracks-current'),s.current?[s.current]:[]);
  $('tracks-recent-section').hidden=!s.recent.length;$('tracks-upcoming-section').hidden=!s.upcoming.length;
  list($('tracks-recent'),s.recent);list($('tracks-upcoming'),s.upcoming);
 }
 client.addEventListener('change',render);
 const select=()=>{const s=player.snapshot;client.select(s.station,{listening:['Playing','Connecting','Buffering','Reconnecting'].includes(s.state)});};
 player.addEventListener('change',select);select();
 client.setVisible(!document.hidden);
 document.addEventListener('visibilitychange',()=>client.setVisible(!document.hidden));
 button.addEventListener('click',()=>{open(dialog);dialog.querySelector('.track-body').scrollTop=0;client.open();});
 $('tracks-refresh').addEventListener('click',()=>client.refresh());
 dialog.addEventListener('close',()=>client.close());
 window.addEventListener('pagehide',()=>{client.setListening(false);client.close();});
 window.addEventListener('pageshow',()=>{select();if(dialog.open)client.open();});
 return client;
}
