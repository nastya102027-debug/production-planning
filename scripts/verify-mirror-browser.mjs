import assert from 'node:assert/strict';
import {join} from 'node:path';
export async function verifyMirror({page,prisma,request,cookie,check,root}) {
  const names=['Пила','Лазер','Фрезер ЧПУ','Гибка','Сварка','Шлифовка ручная','Малярка','Слесарка','ОТК'];
  for(const name of names)await prisma.workCenter.create({data:{name}});
  const created=await request('/orders',cookie,{productionOrderNumber:'TEST-MIRROR',organization:'LATUNING',drawingApprovalDate:'2026-09-08',productionLeadDays:20,items:[{name:'Зеркало',quantity:1,unitPrice:1000}]});
  assert.equal(created.status,201);const item=created.data.items[0];
  await page.setViewportSize({width:1800,height:1100});await page.reload();
  await page.getByRole('button',{name:'Запуски',exact:true}).click();
  await page.getByLabel('Поиск заказов для планирования',{exact:true}).fill('TEST-MIRROR');
  await page.getByText('Зеркало',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Создать',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Конструктор маршрута',exact:true});
  await dialog.getByLabel('Название маршрута',{exact:true}).fill('Зеркало — параллельные ветки');
  const ids=[];
  for(const [i,name] of names.entries()){
    if(i===1){
      const transfer=await page.evaluateHandle(()=>new DataTransfer());
      await dialog.getByRole('button',{name,exact:true}).dispatchEvent('dragstart',{dataTransfer:transfer});
      const canvas=dialog.locator('.graph-canvas'),box=await canvas.boundingBox();
      await canvas.dispatchEvent('dragover',{dataTransfer:transfer});
      await canvas.dispatchEvent('drop',{dataTransfer:transfer,clientX:box.x+260,clientY:box.y+80});
      await transfer.dispose();
    }else await dialog.getByRole('button',{name,exact:true}).click();
    if(i===0){
      await page.waitForTimeout(250);
      const block=await dialog.locator('.graph-stage').boundingBox(),window=await dialog.boundingBox();
      assert.ok(block.width<=191&&block.height<=139);assert.ok(window.width<=1481&&window.height<=901);
      check(true,'First block stays compact inside the enlarged editor');
      await page.screenshot({path:join(root,'.local','route-compact-first.png'),fullPage:false});
    }
    ids.push(await dialog.locator('.react-flow__node').last().getAttribute('data-id'));
    await dialog.getByLabel('Наименование',{exact:true}).fill(`Операция ${name}`);
    await dialog.getByLabel('Материал 1',{exact:true}).fill(`Материал ${i+1}`);
    await dialog.getByLabel('Количество',{exact:true}).fill(String(i+1));
    await dialog.getByLabel('Единица измерения',{exact:true}).fill('шт.');
    await dialog.getByLabel('Комментарий',{exact:true}).fill(`Комментарий ${name}`);
    const parts=i===0?[['рама','латунь'],['лист','латунь 2 мм'],['основание','МДФ 16 мм']]:[[`деталь ${i+1}`,`материал детали ${i+1}`]];
    for(const [name,material] of parts){
      await dialog.getByRole('button',{name:'Добавить составную деталь',exact:true}).click();
      const part=dialog.locator('.graph-inspector fieldset').last();
      await part.getByLabel('Наименование детали',{exact:true}).fill(name);
      await part.getByLabel('Материал детали',{exact:true}).fill(material);
      await part.getByLabel('Количество деталей',{exact:true}).fill('1');
    }
  }
  check(await dialog.locator('.react-flow__node').count()===9,'Palette supports both click and drag-and-drop');
  await dialog.getByRole('button',{name:'Показать весь маршрут',exact:true}).click();
  await page.waitForTimeout(250);
  const links=[[1,3],[0,4],[3,4],[4,5],[5,6],[6,7],[2,7],[7,8]];
  const sourceHandle=await dialog.locator(`.react-flow__node[data-id="${ids[1]}"] .source`).boundingBox();
  const targetHandle=await dialog.locator(`.react-flow__node[data-id="${ids[3]}"] .target`).boundingBox();
  await page.mouse.move(sourceHandle.x+sourceHandle.width/2,sourceHandle.y+sourceHandle.height/2);await page.mouse.down();await page.mouse.move(targetHandle.x+targetHandle.width/2,targetHandle.y+targetHandle.height/2,{steps:15});await page.mouse.up();
  await page.waitForTimeout(150);
  check(await dialog.locator('.react-flow__edge').count()===1,'Graph connects two blocks by dragging their handles');
  for(const [source,target] of links.slice(1)){
    if(source===3&&target===4){
      const output=await dialog.locator(`.react-flow__node[data-id="${ids[source]}"] .source`).boundingBox();
      const card=await dialog.locator(`.react-flow__node[data-id="${ids[target]}"]`).boundingBox();
      await page.mouse.move(output.x+output.width/2,output.y+output.height/2);await page.mouse.down();await page.mouse.move(card.x+card.width/2,card.y+card.height/2,{steps:15});await page.mouse.up();
      await page.waitForTimeout(150);
      check(await dialog.locator('.react-flow__edge').count()===3,'Bending connects to welding by dropping on card body and preserves saw input');
      continue;
    }
    await dialog.locator(`.react-flow__node[data-id="${ids[source]}"]`).click();
    await dialog.getByLabel('Следующий блок',{exact:true}).selectOption(ids[target]);
    await dialog.getByRole('button',{name:'Добавить связь',exact:true}).click();
  }
  // A reversed link must not turn the DAG into a cycle.
  await dialog.locator(`.react-flow__node[data-id="${ids[3]}"]`).click();
  assert.equal(await dialog.getByLabel('Наименование',{exact:true}).inputValue(),'Операция Лазер');
  assert.equal(await dialog.getByLabel('Материал 1',{exact:true}).inputValue(),'Материал 2');
  check(true,'Connecting a card copies its name and material');
  await dialog.locator(`.react-flow__node[data-id="${ids[7]}"]`).click();
  assert.equal(await dialog.getByLabel('Наименование',{exact:true}).inputValue(),'');
  assert.deepEqual((await dialog.locator('.graph-material-fields input').evaluateAll(inputs=>inputs.map(input=>input.value))).sort(),['Материал 1','Материал 2','Материал 3']);
  check(true,'Joining branches clears the name and combines incoming materials');
  await dialog.locator(`.react-flow__node[data-id="${ids[8]}"]`).click();
  await dialog.getByLabel('Следующий блок',{exact:true}).selectOption(ids[0]);
  await dialog.getByRole('button',{name:'Добавить связь',exact:true}).click();
  await dialog.getByText('Эта связь создаёт цикл',{exact:true}).waitFor();
  check(await dialog.locator('.react-flow__edge').count()===8,'Mirror graph prevents cycles without adding an edge');
  await dialog.getByRole('button',{name:'Удалить связь',exact:true}).click();
  check(await dialog.locator('.react-flow__edge').count()===7,'Graph deletes a selected connection');
  await dialog.locator(`.react-flow__node[data-id="${ids[7]}"]`).click();await dialog.getByLabel('Следующий блок',{exact:true}).selectOption(ids[8]);await dialog.getByRole('button',{name:'Добавить связь',exact:true}).click();
  await dialog.getByRole('button',{name:'ОТК',exact:true}).click();await dialog.locator('.graph-card-delete').last().click();
  check(await dialog.locator('.react-flow__node').count()===9,'Removing an extra block preserves the mirror graph');
  // Explicit manual changes remain editable after automatic connection defaults.
  for(const [i,name] of names.entries()){
    await dialog.locator(`.react-flow__node[data-id="${ids[i]}"]`).click();
    await dialog.getByLabel('Наименование',{exact:true}).fill(`Операция ${name}`);
    while(await dialog.locator('.graph-material-field').count()>1)await dialog.getByRole('button',{name:'Удалить материал 2',exact:true}).click();
    await dialog.getByLabel('Материал 1',{exact:true}).fill(`Материал ${i+1}`);
  }
  await dialog.getByRole('button',{name:'Выровнять схему',exact:true}).click();
  await page.waitForTimeout(300);
  await page.screenshot({path:join(root,'.local','mirror-route-graph.png'),fullPage:true});
  await dialog.getByRole('button',{name:'Сохранить маршрут',exact:true}).click();await dialog.waitFor({state:'hidden'});
  const saved=(await request(`/order-items/${item.id}/routes`,cookie)).data[0];
  assert.equal(saved.steps.length,9);
  const byName=new Map(saved.steps.map(s=>[s.workCenter.name,s]));
  assert.deepEqual(saved.steps.filter(s=>s.predecessors.length===0).map(s=>s.workCenter.name).sort(),['Пила','Лазер','Фрезер ЧПУ'].sort());
  for(const [source,target] of links)assert.ok(byName.get(names[target]).predecessors.some(e=>e.predecessorId===byName.get(names[source]).id));
  check(true,'Mirror saves three parallel roots and the exact welding and assembly joins');
  for(const [i,name] of names.entries()){const step=byName.get(name);assert.equal(step.material,`Материал ${i+1}`);assert.equal(step.quantity,i+1);assert.equal(step.components.length,i===0?3:1);assert.equal(step.unit,'шт.');}
  assert.deepEqual(byName.get('Пила').components.map(p=>p.material),['латунь','латунь 2 мм','МДФ 16 мм']);
  check(true,'All nine stages preserve quantities units materials and multiple components');
  const boxes=saved.steps.map(s=>({x:s.canvasX,y:s.canvasY}));
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++)assert.ok(Math.abs(boxes[i].x-boxes[j].x)>=190||Math.abs(boxes[i].y-boxes[j].y)>=138);
  check(true,'Automatic graph layout produces non-overlapping blocks');
  await page.reload();await page.getByRole('button',{name:'Запуски',exact:true}).click();await page.getByLabel('Поиск заказов для планирования',{exact:true}).fill('TEST-MIRROR');await page.getByText('Зеркало',{exact:true}).waitFor();
  await page.locator('.item-check input').check();await page.getByLabel('Маршрут',{exact:true}).selectOption(saved.id);await page.getByRole('button',{name:'Изменить',exact:true}).click();
  for(const [i,name] of names.entries()){
    await dialog.locator(`.react-flow__node[data-id="${byName.get(name).id}"]`).click();
    assert.equal(await dialog.getByLabel('Материал 1',{exact:true}).inputValue(),`Материал ${i+1}`);
    assert.equal(await dialog.getByLabel('Количество',{exact:true}).inputValue(),String(i+1));
    assert.equal(await dialog.getByLabel('Наименование',{exact:true}).inputValue(),`Операция ${name}`);
    assert.equal(await dialog.getByLabel('Комментарий',{exact:true}).inputValue(),`Комментарий ${name}`);
    assert.equal(await dialog.locator('.graph-inspector fieldset').count(),i===0?3:1);
  }
  check(true,'Reopened mirror graph displays saved details in every block');
  await dialog.getByRole('button',{name:'Сохранить маршрут',exact:true}).click();await dialog.waitFor({state:'hidden'});
  const versions=(await request(`/order-items/${item.id}/routes`,cookie)).data;
  assert.equal(versions.length,2);assert.equal(versions[0].version,2);assert.equal(versions[1].id,saved.id);
  check(true,'Graph edits retain previous route versions');
}
