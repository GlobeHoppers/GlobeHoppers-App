/**
 * Vite resolves sprite URLs at build time. Keep the original colored
 * aircraft/car assets; boats and trains currently only have blue PNGs.
 */
const planes=import.meta.glob('../Icons/Airplanes/*.png',{eager:true,query:'?url',import:'default'});
const cars=import.meta.glob('../Icons/Cars/*.png',{eager:true,query:'?url',import:'default'});
const boats=import.meta.glob('../Icons/Boats/*.png',{eager:true,query:'?url',import:'default'});
const trains=import.meta.glob('../Icons/Trains/*.png',{eager:true,query:'?url',import:'default'});
const sortedAssets={plane:planes,drive:cars,boat:boats,train:trains};
const prefix={plane:'Airplane',drive:'Car',boat:'Boat',train:'Train'};
export function vehicleSpriteFor(mode,colorName){
  const type=sortedAssets[mode]?mode:'plane';
  const assets=sortedAssets[type],name=prefix[type];
  const title=String(colorName||'blue').replace(/^./,v=>v.toUpperCase());
  const suffix='/'+name+' - '+title+'.png';
  const preferred=Object.entries(assets).find(([path])=>path.endsWith(suffix));
  const blue=Object.entries(assets).find(([path])=>path.endsWith('/'+name+' - Blue.png'));
  return {url:preferred?.[1]||blue?.[1]||'',tintRequired:!preferred};
}
