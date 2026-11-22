/**
 * Presentation-only trip identity shared by timeline, routes, cards and actors.
 * Reads the same Hopper/trail definitions as the main v9 viewer.
 */
import hopperData from '../data/hoppers.json' with {type:'json'};
import {resolveTrailVisual, segmentedCircleBackground, segmentedBorderGradient} from '../utils/hopperUtils.js';

const DEFAULT='#00e5ff';
const usable=color=>/^#[0-9a-f]{6}$/i.test(String(color||''));
export const safeColor=color=>usable(color)?color:DEFAULT;

export function visualForTrip(trip={}){
  const trail=resolveTrailVisual(trip,hopperData);
  const colors=(trail.colors||[]).filter(usable);
  const primary=safeColor(trail.baseColor||trail.visual?.color);
  const displayColors=(trail.circleColors||colors).filter(usable);
  const borderColors=(trail.visual?.squadMemberColors||displayColors).filter(usable);
  return {
    color:primary,colors:colors.length?colors:[primary],
    style:colors.length>1&&['ribbon','stripe'].includes(trail.style)?trail.style:'solid',
    traveler:trail.visual?.name||'Travel',
    colorName:paletteNameForColor(primary),
    markerBackground:segmentedCircleBackground(displayColors.length?displayColors:[primary],primary,true),
    borderGradient:segmentedBorderGradient(borderColors.length?borderColors:[primary],primary)
  };
}

export function paletteNameForColor(color){
  const matched=hopperData.palette.find(p=>p.color.toLowerCase()===String(color).toLowerCase());
  return matched?.name||'blue';
}

/** Hue shift is used only for vessel/train modes without multiple PNG color variants. */
export function spriteHueRotation(color){
  if(!usable(color))return 0;
  const n=parseInt(color.slice(1),16),r=((n>>16)&255)/255,g=((n>>8)&255)/255,b=(n&255)/255;
  const hi=Math.max(r,g,b),lo=Math.min(r,g,b),d=hi-lo;
  let h=0;
  if(d){if(hi===r)h=((g-b)/d)%6;else if(hi===g)h=(b-r)/d+2;else h=(r-g)/d+4;h*=60;}
  return Math.round((((h+360)%360)-215+540)%360-180);
}
