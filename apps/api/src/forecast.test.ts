import {test} from 'vitest';
import assert from 'node:assert/strict';
import {forecast} from './forecast.js';
const now=new Date('2026-09-09T08:00:00Z');
const stage=(id:string,hours:number|null,predecessors:string[]=[])=>({id,title:id,status:'QUEUED',normHours:hours,riskHours:2,workHours:0,start:null,due:new Date('2026-09-09T18:00:00Z'),predecessors});
test('Parallel branches join at the latest finish, not the sum',()=>{
 const result=forecast([stage('join',2,['a','b']),stage('a',3),stage('b',6)],now);
 assert.equal(result.join.finish,'2026-09-09T16:00:00.000Z');assert.equal(result.join.state,'RISK');assert.equal(result.a.state,'ON_TIME');
});
test('Missing norms and paused predecessors prevent a fabricated forecast',()=>{
 assert.equal(forecast([stage('a',null),stage('b',2,['a'])],now).b.finish,null);
 assert.equal(forecast([{...stage('a',2),status:'PAUSED'},stage('b',2,['a'])],now).b.state,'UNKNOWN');
});
test('Elapsed work, future starts, deadline and risk threshold are respected',()=>{
 const result=forecast([{...stage('a',6),workHours:2,start:new Date('2026-09-09T16:00:00Z')}, {...stage('b',1),riskHours:null}],now);
 assert.equal(result.a.finish,'2026-09-09T20:00:00.000Z');assert.equal(result.a.reserveHours,-2);assert.equal(result.a.state,'LATE');assert.equal(result.b.state,'NO_THRESHOLD');
});
test('Completed predecessors need no norm, exhausted norms and cycles stay unknown',()=>{
 assert.equal(forecast([{...stage('a',null),status:'COMPLETED'},stage('b',1,['a'])],now).b.finish,'2026-09-09T09:00:00.000Z');
 assert.equal(forecast([{...stage('a',1),workHours:2}],now).a.state,'UNKNOWN');
 assert.equal(forecast([stage('a',1,['b']),stage('b',1,['a'])],now).a.state,'UNKNOWN');
});
