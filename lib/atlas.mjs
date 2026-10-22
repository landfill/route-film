import { readFile } from "node:fs/promises";
import { normalizeTrip, escapeXml } from "../shared/core.mjs";

// A portable, offline viewer. Data and the same deterministic engine are embedded;
// no external scripts, map tiles, requests, or credentials are required to open it.
export async function createAtlas(input) {
  const trip = normalizeTrip(input);
  const engine = (
    await readFile(new URL("../shared/core.mjs", import.meta.url), "utf8")
  ).replace(/^export /gm, "");
  const data = JSON.stringify(trip).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeXml(trip.title)} · ROUTE / FILM</title><style>
*{box-sizing:border-box}body{margin:0;background:#f2ecdf;color:#183d39;font-family:'Noto Sans CJK KR',system-ui,sans-serif}header,main,footer{max-width:1400px;margin:auto;padding:24px 32px}header{border-bottom:1px solid #d1d0bd;display:flex;justify-content:space-between;align-items:center}.brand{letter-spacing:.2em;font-weight:700;font-size:22px}.edition{font-size:11px;letter-spacing:.16em;color:#76856c}h1{font:42px Georgia,'Noto Serif CJK KR',serif;margin:28px 0 14px}.intro{color:#76856c;font-size:13px}.grid{display:grid;grid-template-columns:1fr 290px;gap:26px;margin-top:28px}.stage{background:#faf7ee;border:1px solid #d1d0bd;min-width:0}.tabs{display:flex;gap:8px;padding:12px;border-bottom:1px solid #d1d0bd}button{font:inherit;background:transparent;color:inherit;border:1px solid #d1d0bd;padding:10px 15px;cursor:pointer}button:hover,button[aria-pressed=true]{background:#183d39;color:#f2ecdf}button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid #bf613d;outline-offset:3px}#art svg{display:block;width:100%;height:auto}aside button{display:block;width:100%;text-align:left;margin-bottom:9px}aside small{display:block;color:#76856c;margin-top:6px}#memory{font-family:Georgia,'Noto Serif CJK KR',serif;font-size:19px;line-height:1.8}#when{font-size:12px;color:#76856c}.controls{padding:20px;border-top:1px solid #d1d0bd;display:flex;gap:16px;align-items:center}.controls input{accent-color:#bf613d;width:100%}footer{font-size:11px;color:#76856c;line-height:1.8;border-top:1px solid #d1d0bd;margin-top:30px}#clock{font-variant-numeric:tabular-nums;white-space:nowrap}#download{color:#bf613d}#note{font-size:11px;line-height:1.7;color:#76856c}@media(max-width:760px){header,main,footer{padding:20px}h1{font-size:30px}.grid{grid-template-columns:1fr}aside nav{display:grid;grid-template-columns:1fr 1fr;gap:8px}.edition{display:none}.controls{padding:12px;gap:8px}}
</style></head><body><header><span class="brand">ROUTE / FILM</span><span class="edition">A JOURNEY, BEAUTIFULLY REMEMBERED.</span></header><main><h1>${escapeXml(trip.title)}</h1><p class="intro">${escapeXml(trip.subtitle)}</p><div class="grid"><section class="stage"><div class="tabs"><button id="atlas" aria-pressed="true">ATLAS</button><button id="film" aria-pressed="false">FILM</button><button id="print" aria-pressed="false">POSTER</button></div><div id="art"></div><div class="controls"><button id="play" aria-label="재생">▶</button><input id="time" aria-label="여행 타임라인" type="range" min="0" max="60" step="0.1" value="60"><span id="clock">01:00</span></div></section><aside><nav id="places" aria-label="여행 장소"></nav><p id="when"></p><p id="memory"></p><p id="note">장소를 선택하거나 시간 막대를 움직여 여행을 따라가세요. 이 파일은 오프라인에서도 동작합니다.</p><a id="download" download="trip.json">여행 데이터 JSON</a></aside></div></main><footer>좌표 기반 직선 연결 · 실제 교통 경로가 아닙니다. 디오라마는 창작 장면입니다.<br>샘플의 시각과 메모는 창작입니다. © ROUTE / FILM · 코드로 그린 여행 아틀라스</footer><script type="module">
${engine}
const trip=${data};
let time=60,view='atlas',selected=trip.stops[0].id,playing=false,last=0,paint=0;
const el=id=>document.getElementById(id),scenes=timeline(trip,60);
el('places').innerHTML=trip.stops.map((s,i)=>'<button data-place="'+s.id+'">'+String(i+1).padStart(2,'0')+' / '+escapeXml(s.name)+'<small>'+s.datetime.replace('T',' · ')+'</small></button>').join('');
el('download').href=URL.createObjectURL(new Blob([JSON.stringify(trip,null,2)],{type:'application/json'}));
function scene(){return scenes.find(s=>time<s.end)||scenes.at(-1)}
function progress(){const s=scene();if(s.type==='overview')return 0;if(s.type==='recap')return 1;return(s.type==='travel'?s.index-1+(time-s.start)/(s.end-s.start):s.index)/(trip.stops.length-1)}
function draw(){const s=scene();if(s.stopId)selected=s.stopId;el('art').innerHTML=view==='atlas'?renderMap(trip,progress(),{width:1100,height:700,selectedId:selected}):view==='film'?renderFrame(trip,time):renderPoster(trip);el('time').value=time;el('clock').textContent=String(Math.floor(time/60)).padStart(2,'0')+':'+String(Math.floor(time%60)).padStart(2,'0');const stop=trip.stops.find(s=>s.id===selected);el('when').textContent=stop.datetime.replace('T',' · ');el('memory').textContent=stop.note;document.querySelectorAll('[data-place]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.place===selected)));for(const tab of ['atlas','film','print'])el(tab).setAttribute('aria-pressed',String(view===(tab==='print'?'poster':tab)))}
function pause(){playing=false;el('play').textContent='▶';el('play').setAttribute('aria-label','재생')}
function select(id){const s=scenes.find(s=>s.type==='place'&&s.stopId===id);if(s){pause();selected=id;time=(s.start+s.end)/2;draw()}}
el('places').onclick=e=>{const b=e.target.closest('[data-place]');if(b)select(b.dataset.place)};
el('art').onclick=e=>{const b=e.target.closest('[data-stop-id]');if(b)select(b.dataset.stopId)};
el('art').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){const b=e.target.closest('[data-stop-id]');if(b){e.preventDefault();select(b.dataset.stopId)}}};
for(const tab of ['atlas','film','print'])el(tab).onclick=()=>{pause();view=tab==='print'?'poster':tab;draw()};
el('time').oninput=e=>{pause();time=Number(e.target.value);draw()};
el('play').onclick=()=>{if(playing){pause();return}if(time>=60)time=0;if(view==='poster')view='film';playing=true;last=performance.now();el('play').textContent='Ⅱ';el('play').setAttribute('aria-label','일시정지');requestAnimationFrame(tick)};
function tick(now){if(!playing)return;time=Math.min(60,time+Math.min(.25,(now-last)/1000));last=now;if(now-paint>83){paint=now;draw()}if(time>=60){draw();pause()}else requestAnimationFrame(tick)}
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause()});draw();
</script></body></html>`;
}
