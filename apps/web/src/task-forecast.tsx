import {useEffect,useState} from 'react';
import {productionApi as api} from './production-api';
type Result={finish:string|null;reserveHours:number|null;state:string;reason?:string};
const labels:Record<string,string>={UNKNOWN:'Недостаточно данных',COMPLETED:'Завершено',NO_DEADLINE:'Срок не задан',NO_THRESHOLD:'Порог риска не задан',LATE:'НЕ УСПЕВАЕМ',RISK:'РИСК',ON_TIME:'УСПЕВАЕМ'};
export function TaskForecast({id,version,revision}:{id:string;version:number;revision:number}){
  const [result,setResult]=useState<Result|null>(null),[error,setError]=useState('');
  useEffect(()=>{let active=true;setResult(null);setError('');api<{stage:Result}>(`/operations/${id}/forecast`).then(data=>{if(active)setResult(data.stage);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[id,version,revision]);
  return <section aria-label="Прогноз этапа"><h3>Прогноз этапа</h3>{error?<p role="alert">{error}</p>:!result?<p>Расчёт…</p>:<><b>{labels[result.state]}</b>{result.reason&&<p>{result.reason}</p>}{result.finish&&result.state!=='COMPLETED'&&<p>Завершение: {new Date(result.finish).toLocaleString('ru-RU')}</p>}{result.reserveHours!==null&&<p>{result.reserveHours<0?'Отклонение':'Резерв'}: {Math.abs(result.reserveHours).toLocaleString('ru-RU',{maximumFractionDigits:1})} ч</p>}</>}<small>Расчёт по оставшемуся нормативу и связям маршрута при непрерывной работе. Смены, выходные и очередь других заказов пока не учитываются. Это прогноз отдельного этапа.</small></section>;
}
