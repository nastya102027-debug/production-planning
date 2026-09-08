import { describe,it,expect } from 'vitest';
import { parseGraph } from './route-graph.js';
const node=(id:string)=>({id,title:id,workCenterId:'11111111-1111-4111-8111-111111111111',material:'Латунь',quantity:2,unit:'шт.',canvasX:120,canvasY:40,components:[{name:'Рама',material:'Латунь',quantity:1,unit:'шт.'}]});
describe('Graph routes',()=>{
  it('sorts arbitrary node order while preserving fork/join and details',()=>{
    const result=parseGraph({name:'Зеркало',nodes:['finish','a','b','start'].map(node),edges:[{source:'start',target:'a'},{source:'start',target:'b'},{source:'a',target:'finish'},{source:'b',target:'finish'}]});
    expect(result.steps.map(n=>n.title)).toEqual(['start','a','b','finish']);expect(result.steps[3].predecessorIndexes).toEqual([1,2]);expect(result.steps[2].components[0].name).toBe('Рама');expect(result.steps[2].canvasX).toBe(120);
  });
  it('rejects cycles, unknown nodes, duplicate edges and duplicate IDs',()=>{
    for(const edges of [[{source:'a',target:'b'},{source:'b',target:'a'}],[{source:'x',target:'b'}],[{source:'a',target:'b'},{source:'a',target:'b'}]])expect(()=>parseGraph({name:'x',nodes:[node('a'),node('b')],edges})).toThrow();
    expect(()=>parseGraph({name:'x',nodes:[node('a'),node('a')],edges:[]})).toThrow();
  });
  it('rejects invalid component quantities',()=>{expect(()=>parseGraph({name:'x',nodes:[{...node('a'),components:[{name:'Рама',material:'',quantity:-1,unit:'шт.'}]}],edges:[]})).toThrow();});
});
