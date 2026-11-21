import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildTimelineMarkers, buildTimelineYearSegments, buildTimelineMonthTicks,
  buildTimelineYearSpan, buildTripCardRows
} from '../src/timeline/timelineModel.js';

const rows=[
  {id:'a',title:'First',year:2024,month:1,date:'January 2024',firstIndex:0,toLocationId:'MIA',color:'#ff00aa',legCount:2},
  {id:'b',title:'Second',year:2024,month:2,date:'February 2024',firstIndex:2,toLocationId:'LHR',color:'#00ff00',legCount:2},
  {id:'c',title:'Return',year:2025,month:1,date:'January 2025',firstIndex:4,toLocationId:'MIA',color:'#ff00aa',legCount:1}
];

test('markers retain trip identity and leg-count-weighted timeline positions',()=>{
  const marks=buildTimelineMarkers(rows,5);
  assert.deepEqual(marks.map(m=>[m.id,m.firstIndex,m.progress]),[
    ['a',0,0],['b',2,.4],['c',4,.8]
  ]);
  assert.equal(marks[0].color,'#ff00aa');
});

test('years, months and year-span remain consistent with legacy timeline coordinates',()=>{
  const years=buildTimelineYearSegments(rows,5);
  assert.deepEqual(years,[
    {year:'2024',start:0,end:1},
    {year:'2025',start:1,end:1}
  ]);
  const months=buildTimelineMonthTicks(rows,5);
  assert.deepEqual(months.map(x=>[x.year,x.month,x.label,x.progress]),[
    [2024,1,'Jan',0],[2024,2,'Feb',.5],[2025,1,'Jan',1]
  ]);
  assert.ok(buildTimelineYearSpan(rows)>1);
});

test('cards retain ordering, visit counts and four-row window',()=>{
  const cards=buildTripCardRows(rows,2);
  assert.equal(cards.length,2);
  assert.deepEqual(cards.map(x=>x.id),['b','c']);
  assert.equal(cards[0].totalTrips,3);
  assert.equal(cards[1].visitCount,2);
  assert.equal(cards[1].tripOfYear,1);
});

test('timeline drawer is a separate render-only boundary and source App no longer duplicates it',()=>{
  const root=path.resolve(import.meta.dirname,'../src');
  const app=fs.readFileSync(path.join(root,'App.jsx'),'utf8');
  const drawer=fs.readFileSync(path.join(root,'timeline/TripTimelineDrawer.jsx'),'utf8');
  assert.ok(app.includes("from './timeline/TripTimelineDrawer.jsx'"));
  assert.ok(app.includes("from './timeline/timelineModel.js'"));
  assert.ok(drawer.includes('export default function TripTimelineDrawer('));
  assert.ok(drawer.includes('function TimelineRowBorder('));
  assert.ok(!app.includes('function TripTimelineDrawer('));
  assert.ok(!app.includes('function buildTimelineMarkers('));
});
