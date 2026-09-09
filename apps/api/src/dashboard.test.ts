import {expect,it} from 'vitest';
import {dashboardTotals} from './dashboard.js';
const order={id:'1',productionOrderNumber:'1',status:'IN_PRODUCTION',dueDate:new Date('2026-09-09'),procurement:{status:'WAITING'},items:[{quantity:10,completedQuantity:2,unitPrice:10.1,launchItems:[{quantity:6}]}]};
it('splits partial completion and launch without counting the order value twice',()=>{const g=dashboardTotals([order],new Date('2026-09-10'));expect(g.completed.amount).toBe(20.2);expect(g.production.amount).toBe(40.4);expect(g.procurement.amount).toBe(40.4);expect(g.overdue.amount).toBe(80.8);});
it('does not mark today overdue and counts zero-price orders',()=>{const g=dashboardTotals([{...order,items:[{...order.items[0],unitPrice:0}]}],new Date('2026-09-09T23:59:59Z'));expect(g.overdue.count).toBe(0);expect(g.production.count).toBe(1);});
it('keeps drafts separate from ready items',()=>{const g=dashboardTotals([{...order,status:'DRAFT',procurement:null,items:[{...order.items[0],completedQuantity:0,launchItems:[]}]}]);expect(g.unplanned.amount).toBe(101);expect(g.ready.count).toBe(0);});
