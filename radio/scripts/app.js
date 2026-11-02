import { themes, applyTheme, getTheme } from './themes.js';
import { stations } from './stations.js';
import { Player } from './player.js';
import { mountVisualizer } from './visualizer.js';
import { createStorage } from './storage.js';
import { AutoDJ } from './auto-dj.js';
import { mountTrackHistory } from './track-view.js';
import { mountNowPlaying } from './now-playing.js';
import { RadioStatic } from './radio-static.js';
import { mountDJ } from './dj-panel.js';
import { RemoteConnection } from './remote-connection.js';
const PRODUCT_NAME = 'Radio';
const $ = id => document.getElementById(id);
const store = createStorage(stations);
let saved = store.load();
const radioStatic=new RadioStatic();radioStatic.setEnabled(saved.preferences.radioStatic);
let nowPlayingView=null,soundEpoch=0,aiDJ=null;
applyTheme(saved.preferences.theme);
for(const theme of themes){
 const option=document.createElement('label');option.className='theme-option';
 const radio=document.createElement('input');radio.type='radio';radio.name='theme';radio.value=theme.id;radio.checked=getTheme().id===theme.id;
 const swatch=document.createElement('span');swatch.className='theme-swatch';swatch.dataset.theme=theme.id;swatch.setAttribute('aria-hidden','true');
 for(let i=0;i<3;i++)swatch.append(document.createElement('span'));
 const name=document.createElement('span');name.textContent=theme.name;
 option.append(radio,swatch,name);$('theme-options').append(option);
 radio.addEventListener('change',()=>{if(!radio.checked)return;const selected=applyTheme(theme.id);store.save({preferences:{theme:selected.id}});$('theme-announcement').textContent=`${selected.name} theme selected.`;});
}
const isPublic = document.querySelector('meta[name="radio-edition"]')?.content === 'public';
const remote = isPublic ? new RemoteConnection() : null;
async function remoteTrack(id,signal){
 const response=await remote.request('/api/dj/audio/'+encodeURIComponent(id),{signal});
 if(!response.ok)throw Error('Track unavailable.');
 const size=Number(response.headers.get('content-length'));
 if(!Number.isFinite(size)||size<=0||size>100*1024*1024)throw Error('Track is too large to load.');
 const blob=await response.blob();if(blob.size!==size)throw Error('The track download was incomplete.');
 const url=URL.createObjectURL(blob);return {url,release:()=>URL.revokeObjectURL(url)};
}
const player = new Player(stations, { initialId: saved.lastStation, ...(remote?{resolveTrack:remoteTrack}:{}) });
const dj = new AutoDJ(player, () => store.load().favorites, { stations });
// Move the same controls between theme compositions without remounting the player.
const identity=document.querySelector('.identity'),upper=document.querySelector('.upper'),readout=document.querySelector('.readout'),under=document.querySelector('.under');
const song=$('now-playing'),artCredit=$('now-art-source'),tools=document.querySelector('.listening-tools');
const secondary=document.querySelector('.secondary-keys'),deck=document.querySelector('.command-deck'),transport=document.querySelector('.transport'),toast=$('toast');
function arrangeTheme(){
 const theme=getTheme().id;
 if(theme==='classic'){under.prepend(secondary);under.insertBefore(toast,$('help-open'));}
 else {if(theme==='vintage')transport.prepend(secondary);else deck.prepend(secondary);document.querySelector('.instrument-wrap').append(toast);}
 if(theme==='classic')readout.prepend(identity);else upper.prepend(identity);
 if(theme==='aero')document.querySelector('.instrument').append(song);
 else if(theme==='vintage')upper.append(song);
 else identity.append(song);
 if(theme==='aero')document.querySelector('.page').append(artCredit);else song.append(artCredit);
 if(theme==='classic'||theme==='aero')$('header-actions').prepend(tools);
 else if(theme==='vintage')upper.append(tools);
 else document.querySelector('.instrument-wrap').insertBefore(tools,$('toast'));
 if(theme==='aero')document.querySelector('.page').append(under);else document.querySelector('.transport').append(under);
}
document.addEventListener('radio:themechange',arrangeTheme);arrangeTheme();
const dialogs = [...document.querySelectorAll('dialog')];
document.addEventListener('keydown',event=>{if(event.key==='Escape'){const active=dialogs.find(dialog=>dialog.open);if(active){event.preventDefault();event.stopPropagation();active.close();}}},true);
let lastHistory = null, tapTimer, pointer = null, sequence = [...saved.preferences.sequence];
// Original engraved groove emblems; these are app identifiers, never station logos.
const emblemPaths = [
 '<path d="M10 14c0-6 10-6 10 0v13c0 5-10 5-10 0V14Zm10 0c0-6 10-6 10 0v13c0 5-10 5-10 0"/>',
 '<path d="m10 29 8-18M18 29l8-18M26 29l5-11M8 20h24"/>',
 '<path d="M7 15c8-12 18 12 26 0M7 21c8-12 18 12 26 0M7 27c8-12 18 12 26 0"/>',
 '<path d="M9 11h8v18h7V11h7M8 20h24"/>',
 '<circle cx="20" cy="20" r="12"/><circle cx="20" cy="20" r="7"/><circle cx="20" cy="20" r="2"/>',
 '<path d="m20 7 13 13-13 13L7 20 20 7Zm-9 13h18M20 11v18"/>',
 '<path d="M8 30V19h8V9h15v11h-8v10H8Zm8-11h7v1M16 25v5M23 9v5"/>'
];
function emblem(station) {
 const index=stations.findIndex(item=>item.id===station.id);
 return '<svg viewBox="0 0 40 40" aria-hidden="true">'+emblemPaths[Math.max(0,index)%emblemPaths.length]+'</svg>';
}
function renderBadge(container,station,artwork=null){
 const key=station.id+'|'+(artwork?.url||'');
 if(container.dataset.badgeKey===key)return;
 container.dataset.badgeKey=key;
 container.dataset.stationId=station.id;
 container.innerHTML=emblem(station);
 const url=artwork?.url||station.coverUrl;
 if(url){
  const image=document.createElement('img');image.alt='';image.src=url;
  image.referrerPolicy='no-referrer';image.decoding='async';image.loading='lazy';
  image.addEventListener('error',()=>{if(container.dataset.badgeKey!==key)return;if(artwork){renderBadge(container,station);container.dispatchEvent(new CustomEvent('covererror',{detail:{stationId:station.id,url}}));}else container.innerHTML=emblem(station);},{once:true});
  container.replaceChildren(image);
 }
}
const normalized = value => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
function extraGenre(station) { return !normalized(station.name).includes(normalized(station.genre)); }
function choice(id) { return $(id).querySelector('input:checked')?.value; }

document.querySelector('.wordmark').textContent = PRODUCT_NAME;
document.title = PRODUCT_NAME;
function notify(text) { $('toast').textContent = text; }
const needsStatic=state=>['Connecting','Buffering','Reconnecting','Unavailable'].includes(state);
function primeStatic(){const epoch=++soundEpoch;return radioStatic.arm().then(ready=>{if(ready&&epoch===soundEpoch&&needsStatic(player.snapshot.state))radioStatic.start();});}
function manual(action) { if(aiDJ&&!aiDJ.manual()){notify('Full Control is on. Ask the DJ or switch to Assisted Control.');return;}primeStatic();dj.manual(); action(); }
function skip() { if(aiDJ?.skipPlaylist(1))return;manual(()=>store.load().preferences.shuffle ? player.shuffle() : player.next()); }
function previous() { if(aiDJ?.skipPlaylist(-1))return;manual(()=>player.previous()); }
function toggleShuffle() {
 const enabled=!store.load().preferences.shuffle;
 store.save({preferences:{shuffle:enabled}});
 $('shuffle').setAttribute('aria-pressed',String(enabled));
 notify(enabled?'Shuffle on':'Shuffle off');
}
function toggle() { if (['Playing','Connecting','Buffering','Reconnecting'].includes(player.snapshot.state)) { dj.stop(); player.pause(); } else {primeStatic();player.play();} }
function open(dialog) { if (!dialog.open) { dj.setBusy(true); dialog.showModal(); (dialog === $('stations-dialog') ? $('directory-title') : dialog.querySelector('h2')).focus(); } }
for (const dialog of dialogs) {
 dialog.querySelector('h2').tabIndex = -1;
 dialog.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
 dialog.addEventListener('close', () => dj.setBusy(false));
 dialog.addEventListener('click', e => { if(e.target === dialog) {const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();} });
}
function render() {
 const s = player.snapshot, station = s.station;
 $('station-name').textContent = station.name;
 $('station-genre').textContent = station.genre;
 $('station-genre').hidden = !extraGenre(station);
 renderBadge($('station-badge'),station,nowPlayingView?.artworkFor(station.id));
 document.querySelector('.instrument').dataset.state=s.state.toLowerCase();
 const rail=$('tuning-rail');
 if(!rail.querySelector('.tuning-needle')){
  rail.replaceChildren(...stations.map(item=>{const mark=document.createElement('span');mark.className='detent';mark.title=item.name;mark.setAttribute('aria-hidden','true');return mark;}));
  const needle=document.createElement('span');needle.className='tuning-needle';needle.setAttribute('aria-hidden','true');rail.append(needle);
 }
 updateNeedle();
 $('tuning-rail').setAttribute('aria-label',`Station ${stations.indexOf(station)+1} of ${stations.length}: ${station.name}`);
 const stateText = s.state === 'Idle' ? 'Ready to play' : s.state;
 $('status').textContent = s.state === 'Idle' ? 'Ready. Press Play to listen.' : s.state === 'Paused' ? 'Paused' : s.message || stateText;
 const playing = s.state === 'Playing', pending = ['Connecting','Buffering','Reconnecting'].includes(s.state);
 const label = pending ? 'Cancel' : playing ? 'Pause' : 'Play';
 $('play').setAttribute('aria-label',label); $('play').querySelector('span').textContent = label;
 $('play').querySelector('svg').innerHTML = playing ? '<path d="M8 5v14M16 5v14"/>' : pending ? '<path d="M6 6h12v12H6Z"/>' : '<path d="m8 4 12 8-12 8Z"/>';
 const favorite = store.load().favorites.includes(station.id);
 $('shuffle').setAttribute('aria-pressed',String(store.load().preferences.shuffle));
 $('favorite').setAttribute('aria-pressed',String(favorite)); $('favorite').setAttribute('aria-label',favorite ? 'Remove from favorites':'Add to favorites');
 $('favorite').querySelector('span').textContent = favorite ? 'Remove favorite':'Add to favorites';
 const fallback = playing && (!s.analysis || $('visualizer').dataset.failed === 'true' || ($('visualizer').dataset.state === 'playing' && $('visualizer').dataset.mode === 'signal'));
 $('display-label').textContent = fallback ? 'Signal display' : 'Audio spectrum';
 document.querySelector('.readout').classList.toggle('no-analysis', fallback);
 if (fallback) $('status').textContent = s.message.includes('Radio Garden') ? 'Playing from Radio Garden. Audio display unavailable.' : 'Playing. Audio display unavailable.';
 $('error-actions').hidden = s.state !== 'Unavailable';
 $('favorite').disabled=s.sourceKind==='track';
 if(playing && s.sourceKind!=='track' && lastHistory !== station.id) {store.record(station.id);lastHistory=station.id;}
 if(s.sourceKind!=='track')store.save({lastStation:station.id});
 if($('stations-dialog').open) renderDirectory();
}
function updateNeedle(){
 const rail=$('tuning-rail'),needle=rail.querySelector('.tuning-needle');if(!needle)return;
 const style=getComputedStyle(rail),left=parseFloat(style.paddingLeft)||0,right=parseFloat(style.paddingRight)||0;
 needle.style.left=`${left}px`;needle.style.transform=`translateX(${Math.max(0,rail.clientWidth-left-right-4)*stations.findIndex(s=>s.id===player.snapshot.station.id)/Math.max(1,stations.length-1)}px)`;
}
new ResizeObserver(updateNeedle).observe($('tuning-rail'));
function row(station) {
 const li = document.createElement('li'); li.className='station-row';
 const current = station.id === player.snapshot.station.id;
 li.classList.toggle('current',current);
 const select = document.createElement('button'); select.className='station-select'; select.setAttribute('aria-label',`Play ${station.name}`);
 const badge = document.createElement('span'); badge.className='badge mini'; badge.setAttribute('aria-hidden','true'); renderBadge(badge,station);
 const copy = document.createElement('span');copy.className='station-copy';
 const name=document.createElement('strong');name.textContent=station.name;
 const genre=document.createElement('span');genre.textContent=extraGenre(station)?station.genre:'';
 if(current){const selected=document.createElement('em'); selected.textContent=player.snapshot.state==='Playing'?'Playing':'Selected';genre.append(selected);}
 copy.append(name,genre);select.append(badge,copy);
 select.addEventListener('click',()=>{manual(()=>player.select(station.id));$('stations-dialog').close();});
 const favorite=document.createElement('button');favorite.className='row-fav';const active=store.load().favorites.includes(station.id);
 favorite.setAttribute('aria-pressed',String(active));favorite.setAttribute('aria-label',`${active?'Remove':'Add'} ${station.name} ${active?'from':'to'} favorites`);
 favorite.innerHTML=$('favorite').querySelector('svg').outerHTML;
 if(active)favorite.querySelector('svg').style.fill='var(--brass)';
 favorite.addEventListener('click',()=>{store.favorite(station.id);renderDirectory();render();notify(active?'Removed from favorites':'Added to favorites');});
 li.append(select,favorite);return li;
}
function renderDirectory() {
 const focusLabel = $('station-list').contains(document.activeElement) ? document.activeElement.getAttribute('aria-label') : null;
 const target=$('station-list'),data=store.load(),q=$('search').value.trim().toLocaleLowerCase();target.replaceChildren();
 const powerFirst=list=>[...list.filter(s=>s.trackFeed?.format==='powerhitz'),...list.filter(s=>s.trackFeed?.format!=='powerhitz')];
 const section=(title,list,empty)=>{const h=document.createElement('h3');h.className='section-title';h.textContent=title;target.append(h);if(!list.length){const p=document.createElement('p');p.className='empty-copy';p.textContent=empty;target.append(p);}else{const ul=document.createElement('ul');ul.style.cssText='list-style:none;padding:0;margin:0';list.forEach(s=>ul.append(row(s)));target.append(ul);}};
 if(q){const results=powerFirst(stations.filter(s=>[s.name,s.genre,...(s.tags||[])].some(t=>t.toLocaleLowerCase().includes(q))));section('Search results',results,'No stations match. Try another name or genre.');$('results-status').textContent=`${results.length} stations found`;}
 else{section('Favorites',powerFirst(data.favorites.map(id=>stations.find(s=>s.id===id)).filter(Boolean)),'No favorites yet. Use a station’s heart to add it.');section('All stations',powerFirst(stations),'');section('Recently played',data.history.map(id=>stations.find(s=>s.id===id)).filter(Boolean),'The stations you play will appear here.');}
 if (focusLabel) {
  const buttons=[...target.querySelectorAll('button')];
  const same=buttons.find(button=>button.getAttribute('aria-label')===focusLabel);
  const toggled=buttons.find(button=>button.classList.contains('row-fav')&&button.getAttribute('aria-label').split(' ').slice(1,-2).join(' ')===focusLabel.split(' ').slice(1,-2).join(' '));
  (same||toggled||$('directory-title')).focus();
 }
}
$('open-stations').onclick=()=>{renderDirectory();open($('stations-dialog'));};
$('choose').onclick=$('open-stations').onclick;
$('search').addEventListener('input',renderDirectory);
$('play').onclick=toggle; $('retry').onclick=()=>manual(()=>player.snapshot.sourceKind==='track'?player.selectTrack(player.snapshot.track):player.select(player.snapshot.station.id));
$('previous').onclick=previous;$('next').onclick=skip;$('shuffle').onclick=toggleShuffle;
 $('switch-it-up').onclick=async()=>{if(!aiDJ)return;document.querySelector('.ai-open')?.click();try{await aiDJ.load();if(!aiDJ.enabled){dj.stop();aiDJ.setEnabled(true);}await aiDJ.switchItUp();}catch(error){notify(error.message);}};
$('favorite').onclick=()=>{const old=store.load().favorites.includes(player.snapshot.station.id);store.favorite(player.snapshot.station.id);render();notify(old?'Removed from favorites':'Added to favorites');};
$('help-open').onclick=()=>{renderSequence();open($('help-dialog'));};
$('radio-static').checked=radioStatic.enabled;
$('radio-static').addEventListener('change',()=>{radioStatic.setEnabled($('radio-static').checked);store.save({preferences:{radioStatic:radioStatic.enabled}});if(radioStatic.enabled)primeStatic();else soundEpoch++;});
function settings() {return {mode:choice('dj-mode'),minutes:Number(choice('dj-minutes')),pool:choice('dj-pool'),sequence:[...sequence]};}
function renderSequence(){
 const focusLabel=$('sequence').contains(document.activeElement)?document.activeElement.getAttribute('aria-label'):null;
 $('custom-editor').hidden=choice('dj-mode')!=='custom';$('sequence').replaceChildren();
 sequence.forEach((id,index)=>{const entry=document.createElement('div');entry.className='sequence-row';const name=document.createElement('span');name.textContent=stations.find(s=>s.id===id)?.name||id;entry.append(name);for(const [label,offset] of [['Up',-1],['Down',1],['Remove',0]]){const button=document.createElement('button');button.className='action';button.textContent=label;button.setAttribute('aria-label',`${label} ${name.textContent}`);button.disabled=offset!==0&&(index+offset<0||index+offset>=sequence.length);button.onclick=()=>{if(!offset)sequence.splice(index,1);else [sequence[index],sequence[index+offset]]=[sequence[index+offset],sequence[index]];renderSequence();};entry.append(button);}$('sequence').append(entry);});
 $('sequence-add').replaceChildren();stations.filter(s=>!sequence.includes(s.id)).forEach(s=>{const o=document.createElement('option');o.value=s.id;o.textContent=s.name;$('sequence-add').append(o);});$('add-sequence').disabled=sequence.length>=stations.length;
 if(focusLabel){const buttons=[...$('sequence').querySelectorAll('button:not(:disabled)')];(buttons.find(b=>b.getAttribute('aria-label')===focusLabel)||buttons[0]||$('sequence-add')).focus();}
}
for(const key of ['mode','minutes','pool'])$('dj-'+key).querySelector(`input[value="${saved.preferences[key]}"]`).checked=true;
$('dj-mode').onchange=renderSequence;
$('add-sequence').onclick=()=>{if($('sequence-add').value)sequence.push($('sequence-add').value);renderSequence();};
$('auto-switch').onclick=()=>{if(aiDJ?.enabled){notify('Turn off AI DJ before starting Auto DJ.');return;}if(dj.running)dj.stop();else {const config=settings();store.save({preferences:config});if(dj.start(config))primeStatic();}};
$('dj-start').onclick=()=>{if(aiDJ?.enabled){notify('Turn off AI DJ before starting Auto DJ.');return;}const config=settings();store.save({preferences:config});if(dj.start(config))primeStatic();};
$('dj-stop').onclick=()=>dj.stop();
dj.addEventListener('change',e=>{$('auto-state').textContent=dj.running?'On':'Off';$('auto-switch').setAttribute('aria-checked',String(dj.running));$('dj-message').textContent=e.detail.message||'';if(e.detail.message&&!$('help-dialog').open&&!['Auto DJ is off.','Auto DJ is on.'].includes(e.detail.message))notify(e.detail.message);});
player.addEventListener('change',render);mountVisualizer($('visualizer'),player);render();
const trackHistory=mountTrackHistory({player,dialog:$('tracks-dialog'),button:$('tracks-open'),open,renderBadge});
nowPlayingView=mountNowPlaying({player,history:trackHistory,renderBadge,artworkEnabled:!isPublic});
aiDJ=mountDJ({player,stations,history:trackHistory,remote,request:remote?remote.request.bind(remote):undefined,onEnable:enabled=>{if(enabled)dj.stop();}});
player.addEventListener('change',()=>{
 const s=player.snapshot;
 if(needsStatic(s.state))radioStatic.start();
 if(['Playing','Paused','Idle'].includes(s.state)){soundEpoch++;radioStatic.stop();}
});
window.addEventListener('pagehide',()=>{soundEpoch++;radioStatic.stop();});
$('visualizer').addEventListener('displaychange',render);
// Display gestures are supplementary; a delayed tap never also fires after a double tap.
$('display').onclick=()=>{if(tapTimer){clearTimeout(tapTimer);tapTimer=null;toggleShuffle();}else tapTimer=setTimeout(()=>{tapTimer=null;toggle();},275);};
$('display').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();clearTimeout(tapTimer);tapTimer=null;toggle();}});
$('listening').addEventListener('pointerdown',e=>{if(e.target.closest('button,input,select')||!e.isPrimary)return;pointer={x:e.clientX,y:e.clientY,id:e.pointerId};dj.setBusy(true);});
function finishPointer(e){if(!pointer)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;pointer=null;dj.setBusy(false);if(e.type!=='pointercancel'&&Math.abs(dx)>=50&&Math.abs(dx)>Math.abs(dy)*1.5){if(dx<0)skip();else previous();}}
window.addEventListener('pointerup',finishPointer);window.addEventListener('pointercancel',finishPointer);
document.addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey||e.shiftKey||e.target.closest('input,textarea,select,[contenteditable=true]'))return;if(document.querySelector('dialog[open]'))return;if(e.key===' '&&e.target.closest('button'))return;const actions={' ':toggle,ArrowLeft:previous,ArrowRight:skip,s:toggleShuffle,f:()=>$('favorite').click(),'/':()=>{renderDirectory();open($('stations-dialog'));$('search').focus();}};const action=actions[e.key.toLowerCase?.()]||actions[e.key];if(action){e.preventDefault();action();}});
