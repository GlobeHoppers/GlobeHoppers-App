/**
 * Lightweight line styling for the read-only exhibition map. Route geometry
 * is never changed, so sprites and the camera stay on reviewed coordinates.
 * Duplicate corridors get deterministic *screen-space* history offsets.
 */
const fallback='#00e5ff';
const line=(points,color,stackOffset,properties={})=>({
  type:'Feature',
  properties:{...properties,color,stackOffset},
  geometry:{type:'LineString',coordinates:points}
});
const lerp=(a,b,t)=>{
  const longitudeDelta=((b[0]-a[0]+540)%360)-180;
  return [a[0]+longitudeDelta*t,a[1]+(b[1]-a[1])*t];
};
function pointAt(points,fraction){
  const f=Math.max(0,Math.min(1,fraction))*(points.length-1);
  const i=Math.min(points.length-2,Math.floor(f));
  return lerp(points[i],points[i+1],f-i);
}
function subline(points,a,b){
  const len=points.length-1,start=a*len,end=b*len;
  const part=[pointAt(points,a)];
  for(let index=Math.floor(start)+1;index<end;index++)part.push(points[index]);
  part.push(pointAt(points,b));
  return part;
}
export function coloredRouteFeatures(points,visual={},properties={},stackOffset=0){
  if(!Array.isArray(points)||points.length<2)return [];
  const palette=(visual.colors||[]).filter(Boolean);
  const colors=palette.length?palette:[visual.color||fallback];
  const style=visual.style||'solid';
  if(colors.length>1&&style==='ribbon'){
    const spacing=2.2;
    return colors.map((color,index)=>line(points,color,
      stackOffset+(index-(colors.length-1)/2)*spacing,properties));
  }
  if(colors.length>1&&style==='stripe'){
    // Alternate colors without exploding the saved provider path's vertex count.
    const sections=Math.min(30,Math.max(8,Math.round(points.length/7)));
    return Array.from({length:sections},(_,i)=>
      line(subline(points,i/sections,(i+1)/sections),
        colors[i%colors.length],stackOffset,properties));
  }
  return [line(points,visual.color||colors[0]||fallback,stackOffset,properties)];
}
export function routeStackKey(from,to){
  if(!from||!to)return '';
  const key=p=>[Number(p.lon).toFixed(2),Number(p.lat).toFixed(2)].join(',');
  return [key(from),key(to)].sort().join('|');
}
export function stackOffsetForOccurrence(occurrence){
  if(!Number.isFinite(occurrence)||occurrence<=0)return 0;
  const n=Math.ceil(occurrence/2);
  return (occurrence%2?1:-1)*Math.min(10,n*2.6);
}
