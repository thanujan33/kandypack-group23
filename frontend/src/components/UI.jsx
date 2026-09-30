import React, {useState} from 'react';
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
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  return <form className="card space-y-3" onSubmit={async e=>{
    e.preventDefault(); const form=e.currentTarget;
    const b=Object.fromEntries(new FormData(form));
    setBusy(true);setMessage('');
    try {const result=await onSubmit(b); setMessage(result?.message||'Saved');}
    catch(err){setMessage(err.message);} finally {setBusy(false);}
  }}>
    <div className="grid gap-3 md:grid-cols-2">{fields.map(f=><label key={f.name}>
      {f.label || f.name.replaceAll('_',' ')}
      {f.options?<select name={f.name} required defaultValue="">
        <option value="" disabled>Choose…</option>
        {f.options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
      </select>:<input name={f.name} type={f.type||'text'} defaultValue={f.value}
        required={!f.optional} min={f.min} max={f.max} step={f.step} placeholder={f.placeholder}/>}
    </label>)}</div>
    <button disabled={busy}>{busy?'Saving…':button}</button>
    <p role="status" className="text-sm text-teal-900">{message}</p>
  </form>;
}
export const options=(rows,label='name')=>rows.map(x=>({value:x.id,label:`${x.id} | ${x[label]}`}));
export function Banner({children}){return <p className="bg-amber-100 rounded-lg p-4 my-4">{children}</p>;}
