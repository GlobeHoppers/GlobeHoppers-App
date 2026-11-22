/**
 * Compact, faithful STATIC display geometries for Cinematic GlobeHoppers.
 *
 * This deliberately does NOT run buildSurfacePresentationGeometry again:
 * v9's cinematic presentation pass was collapsing precise reviewed driving
 * routes (e.g. the Overseas Highway) into large off-road chords. A bounded
 * Douglas–Peucker simplification preserves the provider's actual bends.
 */
const dlon=(a,b)=>((b-a+540)%360)-180;
const radians=x=>x*Math.PI/180;
function pointSegmentMiles(point,a,b){
  const cos=Math.max(.08,Math.abs(Math.cos(radians((a[1]+b[1])*.5))));
  const bx=dlon(a[0],b[0])*69.17*cos,by=(b[1]-a[1])*69.05;
  const px=dlon(a[0],point[0])*69.17*cos,py=(point[1]-a[1])*69.05;
  const denom=bx*bx+by*by;
  const t=denom>1e-12?Math.max(0,Math.min(1,(px*bx+py*by)/denom)):0;
  return Math.hypot(px-t*bx,py-t*by);
}
function rdp(points,tolerance){
  const marked=new Uint8Array(points.length);
  marked[0]=1;marked[points.length-1]=1;
  const stack=[[0,points.length-1]];
  while(stack.length){
    const [a,b]=stack.pop();
    let max=tolerance,index=-1;
    for(let i=a+1;i<b;i++){
      const d=pointSegmentMiles(points[i],points[a],points[b]);
      if(d>max){max=d;index=i;}
    }
    if(index>=0){marked[index]=1;stack.push([a,index],[index,b]);}
  }
  return points.filter((_,i)=>marked[i]);
}
export function simplifyReviewedSurfaceRoute(raw,mode){
  const clean=[];
  for(const item of raw||[]){
    if(!Array.isArray(item)||item.length<2)continue;
    const lon=Number(item[0]),lat=Number(item[1]);
    if(!Number.isFinite(lon)||!Number.isFinite(lat)||lat<-90||lat>90)continue;
    if(clean.length&&Math.abs(dlon(clean.at(-1)[0],lon))<1e-8&&
       Math.abs(clean.at(-1)[1]-lat)<1e-8)continue;
    clean.push([lon,lat]);
  }
  if(clean.length<=3)return clean;
  const limit=mode==='boat'?180:mode==='train'?360:680;
  let tolerance=mode==='boat'?.04:mode==='train'?.025:.015;
  let result=rdp(clean,tolerance);
  // Consistently bound downloads regardless of the source provider density.
  for(let i=0;result.length>limit&&i<20;i++){
    tolerance*=1.42;
    result=rdp(clean,tolerance);
  }
  // Keep original coordinates rather than moving the line away from roads.
  result[0]=clean[0];
  result[result.length-1]=clean.at(-1);
  return result;
}
