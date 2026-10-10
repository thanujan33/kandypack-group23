import React, {useEffect,useState} from 'react';
import {api} from '../../api';
import {Form,Table,options} from '../../components/UI';
export const roles=['ADMIN','FACTORY'];
export const label='Directory'; export const order=10;
export default function Page({user}){
  const [data,setData]=useState({stores:[],routes:[]}),[users,setUsers]=useState([]),[error,setError]=useState('');
  async function load(){try{
    setData(await api('/directory'));
    if(user.role==='ADMIN')setUsers(await api('/users'));
  }catch(e){setError(e.message);}}
  useEffect(()=>{load();},[]);
  const save=(url,method='POST')=>async body=>{const result=await api(url,{method,body});await load();return result;};
  return <><h1>Stores and routes</h1><p role="alert">{error}</p><Table rows={data.stores}/>
    {user.role==='ADMIN'&&<><h2>Add store</h2>
      <Form button="Add store" fields={[{name:'city',label:'City'},{name:'location',label:'Location'}]}
        onSubmit={save('/stores')}/></>}
    <h2>Delivery coverage</h2><Table rows={data.routes}/><h2>Add route</h2>
    <Form fields={[{name:'store_id',options:options(data.stores,'city')},{name:'name'},
      {name:'coverage_area',label:'Unique coverage area code or name'},{name:'max_minutes',type:'number',min:1,max:480}]}
      onSubmit={save('/routes')}/>
    <h2>Retire a route</h2><Form button="Retire route" fields={[{name:'id',options:options(data.routes)}]}
      onSubmit={b=>save('/routes/'+b.id,'PATCH')({active:false})}/>
    {user.role==='ADMIN'&&<><h2>User access</h2><Table rows={users}/>
      <Form fields={[{name:'id',options:options(users)},{name:'role',options:['ADMIN','FACTORY','STORE','CUSTOMER'].map(value=>({value,label:value}))},
        {name:'active',options:[{value:'1',label:'Active'},{value:'0',label:'Disabled'}]}]}
        onSubmit={b=>save('/users/'+b.id,'PATCH')({...b,active:b.active==='1'})}/>
      <h2>Create staff login</h2><Form fields={[{name:'name'},{name:'email',type:'email'},
        {name:'password',type:'password'},{name:'role',options:['ADMIN','FACTORY','STORE'].map(value=>({value,label:value}))}]}
        onSubmit={save('/staff-users')}/>
      <h2>Assign a store manager</h2><Form fields={[{name:'store_id',options:options(data.stores,'city')},
        {name:'manager_id',options:options(users.filter(u=>u.role==='STORE'))}]}
        onSubmit={b=>save('/stores/'+b.store_id+'/manager','PUT')(b)}/>
    </>}
  </>;
}
