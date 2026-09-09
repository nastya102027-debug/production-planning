import {expect,it} from 'vitest';
import {incomingDetails} from './route-inheritance';
const cards=[{id:'a',data:{title:'Рама',material:'Латунь'}},{id:'b',data:{title:'Основание',material:'МДФ\nЛатунь'}}];
it('copies name and material from one incoming card',()=>{expect(incomingDetails(cards,[{source:'a',target:'c'}],'c')).toEqual({title:'Рама',material:'Латунь'});});
it('merges materials without duplicates and clears name at a join',()=>{expect(incomingDetails(cards,[{source:'a',target:'c'},{source:'b',target:'c'}],'c')).toEqual({title:'',material:'Латунь\nМДФ'});});
