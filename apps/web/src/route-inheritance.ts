type Card={id:string;data:{title:string;material?:string|null}};
export function incomingDetails(cards:Card[],edges:{source:string;target:string}[],target:string){
  const sources=edges.filter(e=>e.target===target).map(e=>cards.find(n=>n.id===e.source)).filter((n):n is Card=>Boolean(n));
  return {title:sources.length===1?sources[0].data.title:'',material:[...new Set(sources.flatMap(n=>(n.data.material??'').split('\n').map(value=>value.trim()).filter(Boolean)))].join('\n')};
}
