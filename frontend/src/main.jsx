import React,{useState,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {api} from './api';
import {Form} from './components/UI';
import './style.css';
const modules=Object.values(import.meta.glob('./modules/*/Page.jsx',{eager:true}))
  .sort((a,b)=>a.order-b.order);
function App(){
  const [user,setUser]=useState(null),[tab,setTab]=useState(''),[register,setRegister]=useState(false);
  const load=()=>api('/me').then(setUser).catch(()=>setUser(null));
  useEffect(()=>{
    if(sessionStorage.getItem('token')) load();
    const signout=()=>setUser(null);
    window.addEventListener('signed-out',signout);
    return()=>window.removeEventListener('signed-out',signout);
  },[]);
  const allowed=modules.filter(m=>m.roles.includes(user?.role));
  const chosen=allowed.find(m=>m.label===tab)||allowed[0];
  const Page=chosen?.default;
  return <><header className="bg-[#12203A] text-white px-6 py-5 flex flex-wrap justify-between gap-3">
    <div><b className="text-xl">KandyPack</b><p className="text-xs text-amber-300">RAIL AND ROAD DISTRIBUTION · GROUP 23</p></div>
    {user&&<div>{user.name} · {user.role} <button className="ml-3" onClick={async()=>{
      try{await api('/logout',{method:'POST'});}finally{sessionStorage.removeItem('token');setUser(null);}
    }}>Sign out</button></div>}
  </header><main className="max-w-7xl mx-auto p-5 md:p-8 space-y-5">
    {!user?<div className="max-w-xl mx-auto space-y-5"><h1>{register?'Create account':'Welcome back'}</h1>
      <Form key={String(register)} button={register?'Register':'Sign in'}
        fields={[...(register?[{name:'name'},{name:'phone'},{name:'nic',optional:true},{name:'address'}]:[]),
          {name:'email',type:'email'},{name:'password',type:'password'}]}
        onSubmit={async body=>{
          const data=await api(register?'/auth/register':'/auth/login',{method:'POST',body});
          if(!register){sessionStorage.setItem('token',data.token);await load();}
          return data;
        }}/><button onClick={()=>setRegister(!register)}>{register?'Back to sign in':'Create customer account'}</button>
      <p className="text-sm">Passwords need at least 12 characters. All business times are Sri Lanka time.</p>
    </div>:<><nav className="flex flex-wrap gap-2 print:hidden">{allowed.map(m=><button key={m.label}
      className={chosen===m?'bg-amber-500 text-slate-900':''} onClick={()=>setTab(m.label)}>{m.label}</button>)}</nav>
      {Page?<Page key={chosen.label} user={user}/>:<p>Feature modules will appear after their branches are merged.</p>}
    </>}
  </main></>;
}
createRoot(document.getElementById('root')).render(<App/>);
