type QueueOperation={id:string;priority:string;queueOrder:number;dueDate:Date|null;plannedFinish:Date|null};

const priorityRank:Record<string,number>={CRITICAL:0,HIGH:1,NORMAL:2,LOW:3};
const dueAt=(task:QueueOperation)=>task.plannedFinish??task.dueDate;

// Очередь производства: нельзя пропустить уже просроченное, затем идут
// ближайшие три дня с учётом приоритета Планера, после — остальные по сроку.
export function sortOperationsByPriority<T extends QueueOperation>(tasks:T[],now=new Date()){
  const today=new Date(now);today.setUTCHours(0,0,0,0);
  const urgentUntil=new Date(today);urgentUntil.setUTCDate(urgentUntil.getUTCDate()+3);
  const band=(task:T)=>{const due=dueAt(task);if(!due)return 3;if(due<today)return 0;if(due<urgentUntil)return 1;return 2;};
  const dueValue=(task:T)=>dueAt(task)?.getTime()??Number.POSITIVE_INFINITY;
  return [...tasks].sort((left,right)=>{const leftBand=band(left),rightBand=band(right);if(leftBand!==rightBand)return leftBand-rightBand;const byDeadline=dueValue(left)-dueValue(right);if(leftBand!==1&&byDeadline)return byDeadline;const byPriority=priorityRank[left.priority]-priorityRank[right.priority];return byPriority||(leftBand===1?byDeadline:0)||left.queueOrder-right.queueOrder||left.id.localeCompare(right.id);});
}
