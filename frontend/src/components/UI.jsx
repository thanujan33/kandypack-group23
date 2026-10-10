import React, {useState} from 'react';
import PasswordInput from './PasswordInput';
export function Table({rows}) {
  if(!rows?.length) return <p className="p-4 text-stone-500">No records yet.</p>;
  const keys=Object.keys(rows[0]);
  return <div className="overflow-auto"><table><thead><tr>
    {keys.map(k=><th key={k}>{k.replaceAll('_',' ')}</th>)}
  </tr></thead><tbody>{rows.map((row,i)=><tr key={i}>
    {keys.map(k=><td key={k} className={row[k]==='MISSING'?'text-red-800 font-bold':
      row[k]==='DELIVERED'?'text-teal-800 font-bold':''}>
      {typeof row[k]==='object'?JSON.stringify(row[k]):String(row[k]??'—')}</td>)}
  </tr>)}</tbody></table></div>;
}
export function Form({fields,onSubmit,button='Save'}) {
  const [feedback,setFeedback]=useState({text:'',isError:false}),[busy,setBusy]=useState(false);
  return <form className="card space-y-3" onSubmit={async e=>{
    e.preventDefault(); const form=e.currentTarget;
    const b=Object.fromEntries(new FormData(form));
    setBusy(true);setFeedback({text:'',isError:false});
    try {const result=await onSubmit(b); setFeedback({text:result?.message||'Saved',isError:false});}
    catch(err){setFeedback({text:err.message||'An unexpected error occurred',isError:true});} finally {setBusy(false);}
  }}>
    <div className="grid gap-3 md:grid-cols-2">{fields.map(f=>f.type==='password'?
      <PasswordInput key={f.name} name={f.name} label={f.label || f.name.replaceAll('_',' ')}
        defaultValue={f.value} required={!f.optional} min={f.min} max={f.max}
        step={f.step} placeholder={f.placeholder}/>:<label key={f.name}>
      {f.label || f.name.replaceAll('_',' ')}
      {f.options?<select name={f.name} required defaultValue="">
        <option value="" disabled>Choose…</option>
        {f.options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
      </select>:<input name={f.name} type={f.type||'text'} defaultValue={f.value}
        required={!f.optional} min={f.min} max={f.max} step={f.step} placeholder={f.placeholder}/>}
    </label>)}</div>
    <button disabled={busy}>{busy?'Saving…':button}</button>
    {feedback.text&&<p role={feedback.isError?'alert':'status'} className={feedback.isError?
      'text-sm p-2.5 rounded bg-red-50 text-red-700 border border-red-200 font-medium':
      'text-sm p-2 rounded bg-teal-50 text-teal-800 border border-teal-200'}>{feedback.text}</p>}
  </form>;
}
export const options=(rows,label='name')=>rows.map(x=>({value:x.id,label:`${x.id} | ${x[label]}`}));
export function Banner({children}){return <p className="bg-amber-100 rounded-lg p-4 my-4">{children}</p>;}
