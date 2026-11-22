import React,{useEffect,useMemo,useRef,useState} from 'react';

/** Pure chronological projection. The single playback clock still owns seeking. */
export function cinematicTimelineModel(entries,totalMs){
  const max=Math.max(1,totalMs);
  const markers=entries.map((entry,index)=>({
    id:entry.id,index,progress:entry.startMs/max,
    title:entry.title,date:entry.date,color:entry.visual?.color||'#00e5ff',
    markerBackground:entry.visual?.markerBackground||entry.visual?.color||'#00e5ff',
    startMs:entry.startMs
  }));
  const years=[];
  for(const marker of markers){
    const year=String(marker.date).match(/\d{4}/)?.[0];
    if(!year||years.some(x=>x.year===year))continue;
    years.push({year,start:marker.progress});
  }
  return {markers,years:years.map((row,index)=>({
    ...row,end:years[index+1]?.start??1
  }))};
}
const pct=n=>(Math.max(0,Math.min(1,n))*100)+'%';

export function CinematicTimeline({entries,totalMs,elapsedMs,activeIndex,playing,ready,onSeek}){
  const [zoom,setZoom]=useState(1);
  const viewport=useRef(null);
  const {markers,years}=useMemo(()=>cinematicTimelineModel(entries,totalMs),[entries,totalMs]);
  const progress=totalMs>0?elapsedMs/totalMs:0;
  useEffect(()=>{
    if(!playing||zoom<=1||!viewport.current)return;
    const v=viewport.current;
    const x=progress*v.clientWidth*zoom;
    const target=x-v.clientWidth*.46;
    if(Math.abs(v.scrollLeft-target)>8)v.scrollLeft=Math.max(0,target);
  },[elapsedMs,zoom,playing,progress]);
  const setZoomAround=(value)=>{
    const next=Math.max(1,Math.min(16,value)),v=viewport.current;
    if(v){const x=progress*v.clientWidth*next;
      requestAnimationFrame(()=>{if(viewport.current)viewport.current.scrollLeft=
        Math.max(0,x-viewport.current.clientWidth*.46);});
    }
    setZoom(next);
  };
  return <div className="cg-timeline" aria-label="Chronological travel timeline">
    <div className="cg-timeline-topline">
      <span className="cg-timeline-heading">TRAVEL TIMELINE
        <small>{entries.length} trips</small>
      </span>
      <div className="cg-timeline-zoom" aria-label="Timeline zoom">
        <button type="button" disabled={zoom<=1} onClick={()=>setZoomAround(zoom/1.5)} aria-label="Zoom timeline out">−</button>
        <button type="button" disabled={zoom<=1} onClick={()=>setZoomAround(1)}>Fit</button>
        <button type="button" disabled={zoom>=16} onClick={()=>setZoomAround(zoom*1.5)} aria-label="Zoom timeline in">+</button>
      </div>
    </div>
    <div ref={viewport} className="cg-timeline-viewport">
      <div className="cg-timeline-content" style={{width:(zoom*100)+'%'}}>
        <div className="cg-timeline-years" aria-hidden="true">
          {years.map(y=><div key={y.year}
            style={{left:pct(y.start),width:pct(Math.max(.001,y.end-y.start))}}>
            <span>{y.year}</span>
          </div>)}
        </div>
        <div className="cg-timeline-rail">
          <div className="cg-timeline-rail-track"/>
          <div className="cg-timeline-played" style={{width:pct(progress)}}/>
          <input className="cg-timeline-range" type="range"
            min="0" max={totalMs} step="25" value={Math.min(totalMs,elapsedMs)}
            disabled={!ready} aria-label="Seek chronological travel timeline"
            onChange={e=>onSeek(Number(e.target.value))}/>
          <div className="cg-timeline-pin-row">
            {markers.map(marker=><button type="button" key={marker.id}
              className={'cg-timeline-pin'+(marker.index===activeIndex?' is-active':'')}
              style={{left:pct(marker.progress),
                '--pin-color':marker.color,
                '--pin-background':marker.markerBackground}}
              disabled={!ready}
              aria-label={marker.title+' · '+marker.date}
              aria-current={marker.index===activeIndex?'step':undefined}
              title={marker.title+' · '+marker.date}
              onClick={()=>onSeek(marker.startMs)}>
              <i/><span>{marker.title} · {marker.date}</span>
            </button>)}
          </div>
          <div className="cg-timeline-now" style={{left:pct(progress)}} aria-hidden="true"/>
        </div>
      </div>
    </div>
  </div>;
}

const modes={plane:'✈',drive:'◆',boat:'⛴',train:'▰'};
export function CinematicTripQueue({entries,activeIndex,ready,onSeek}){
  const shown=entries.slice(activeIndex,activeIndex+3);
  if(!shown.length)return null;
  const current=shown[0];
  return <aside className="cg-trip-queue" aria-label="Current and upcoming trips">
    <div className="cg-trip-queue-kicker">CURRENT TRIPS
      <span>{activeIndex+1} / {entries.length}</span>
    </div>
    {shown.map((entry,index)=>{
      const color=entry.visual?.color||'#00e5ff';
      const active=index===0;
      const modesForTrip=[...new Set(entry.stops.slice(1).map(s=>s.modeFromPrevious||'plane'))];
      return <button type="button" key={entry.id} disabled={!ready}
        onClick={()=>onSeek(entry.startMs)}
        className={'cg-trip-queue-card'+(active?' is-current':' is-upcoming')}
        style={{'--trip-color':color,
          '--trip-border':entry.visual?.borderGradient||color}}
        aria-current={active?'step':undefined}
        title={active?'Current trip':('Jump to '+entry.title)}>
        <span className="cg-trip-queue-date">
          {active?'NOW PLAYING':'UP NEXT'} · {entry.date}
        </span>
        <strong>{entry.title}</strong>
        {active&&<>
          <span className="cg-trip-queue-route">{entry.stops[0]?.name} → {entry.stops.at(-1)?.name}</span>
          <span className="cg-trip-queue-meta">{modesForTrip.map(m=>modes[m]||'•').join(' ')}
            {' · '}{entry.stops.length-1} legs · {entry.visual?.traveler||'Travel'}</span>
        </>}
        {!active&&<span className="cg-trip-queue-meta">{entry.visual?.traveler||'Travel'}</span>}
      </button>;
    })}
  </aside>;
}
