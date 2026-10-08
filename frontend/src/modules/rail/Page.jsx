import {useEffect,useState} from 'react';
import {api} from '../../api';
import {Form,Table,options,Banner} from '../../components/UI';
export const roles=['ADMIN','FACTORY','STORE'];export const label='Rail';export const order=30;
export default function Page({user}){
  const [trains,setTrains]=useState([]),[manifest,setManifest]=useState([]),[stores,setStores]=useState([]);
  const [orders,setOrders]=useState([]),[error,setError]=useState(''),[edit,setEdit]=useState('');
  async function load(){try{
    const [t,m,d,o]=await Promise.all([api('/trains'),api('/rail/manifest'),api('/directory'),api('/orders')]);
    setTrains(t);setManifest(m);setStores(d.stores);setOrders(o);
  }catch(e){setError(e.message);}}
  useEffect(()=>{load();},[]);
  const send=(url,method='POST')=>async body=>{const r=await api(url,{method,body});await load();return r;};
  return <><h1>Rail capacity and receiving</h1><p role="alert">{error}</p><button onClick={load}>Refresh</button>
    <Banner>All times are Sri Lanka time. Goods must arrive before 08:00 on the requested delivery date.
      Missing goods block road scheduling until every item is received.</Banner>
    <Table rows={trains}/>
    {['ADMIN','FACTORY'].includes(user.role)&&<>
      <h2>{edit?'Edit train '+edit:'Add train'}</h2><Form key={edit||'new'} fields={[
        {name:'reference'},{name:'store_id',options:options(stores,'city')},
        {name:'departure_at',type:'datetime-local'},{name:'arrival_at',type:'datetime-local'},
        {name:'capacity',type:'number',min:'0.001',step:'0.001'}]}
        onSubmit={send(edit?'/trains/'+edit:'/trains',edit?'PUT':'POST')}/>
      <div className="flex flex-wrap gap-2 mt-3"><button onClick={()=>setEdit('')}>New train</button>
        {trains.filter(t=>t.status==='SCHEDULED'&&t.available_capacity===t.capacity).map(t=>
          <button key={t.id} onClick={()=>setEdit(t.id)}>Edit {t.id}</button>)}</div>
      <h2>Allocate a pending order</h2><Form fields={[
        {name:'order_id',options:orders.filter(o=>o.status==='PENDING').map(o=>({value:o.id,label:`${o.id} | ${o.city} | ${o.total_space} space`}))},
        {name:'train_trip_id',options:options(trains.filter(t=>t.status==='SCHEDULED'),'reference')}]}
        button="Allocate and split overflow" onSubmit={send('/rail/allocate')}/>
      <h2>Dispatch a due train</h2><Form fields={[{name:'id',options:options(trains.filter(t=>t.status==='SCHEDULED'),'reference')}]}
        onSubmit={b=>send('/trains/'+b.id+'/dispatch')({})}/>
    </>}
    <h2>Manifest and receipt details</h2><Table rows={manifest}/>
    {['ADMIN','STORE'].includes(user.role)&&<><h2>Confirm receipt or resolve missing goods</h2>
      <Form fields={[{name:'allocation_id',options:manifest.filter(a=>a.train_status!=='SCHEDULED').map(a=>({value:a.id,
        label:`${a.id} | ${a.product} | ordered ${a.quantity} | received ${a.received_qty}`}))},
        {name:'received_qty',label:'Total received so far for this allocation',type:'number',min:0}]}
        onSubmit={send('/rail/receive')}/></>}
  </>;
}
