import {useEffect,useState} from 'react';
import {api} from '../../api';
import {Table,Form,options,Banner} from '../../components/UI';
export const roles=['CUSTOMER','ADMIN','FACTORY','STORE'];
export const label='Orders';export const order=20;
export default function Page({user}){
  const [products,setProducts]=useState([]),[routes,setRoutes]=useState([]),[orders,setOrders]=useState([]);
  const [cart,setCart]=useState([]),[detail,setDetail]=useState(null);
  const [loading,setLoading]=useState(true),[errors,setErrors]=useState({});
  const [from,setFrom]=useState(''),[to,setTo]=useState(''),[search,setSearch]=useState('');
  async function load(){
    setLoading(true);setErrors({});
    await Promise.all([
      ['products','/products',setProducts],
      ['coverage','/directory',d=>setRoutes(d.routes)],
      ['history',`/orders?from=${from}&to=${to}`,setOrders]
    ].map(async([section,path,update])=>{
      try{update(await api(path));}
      catch(e){setErrors(old=>({...old,[section]:e.message}));}
    }));
    setLoading(false);
  }
  useEffect(()=>{load();},[]);
  const save=async(url,body,method='POST')=>{const r=await api(url,{method,body});await load();return r;};
  const [edit,setEdit]=useState(null);
  const visibleProducts=products.filter(p=>p.name.toLowerCase().includes(search.toLowerCase()));
  return <><h1>Orders and products</h1>
    <button onClick={load} disabled={loading}>{loading?'Loading…':'Refresh products and coverage'}</button>
    {errors.products&&<p role="alert">Unable to load products: {errors.products}. Please try refreshing.</p>}
    <label>Search products<input value={search} onChange={e=>setSearch(e.target.value)}/></label>
    {loading?<p role="status">Loading products…</p>:!errors.products&&(products.length===0?
      <Banner>No products are available for ordering right now. Please check again later or contact KandyPack.</Banner>:
      visibleProducts.length?<Table rows={visibleProducts}/>:<p>No products match your search. Try another name.</p>)}
    {['ADMIN','FACTORY'].includes(user.role)&&<><h2>{edit?'Edit product '+edit:'Add product'}</h2>
      <Form key={edit||'new'} fields={[{name:'name'},{name:'unit_price',type:'number',step:'0.01',min:'0.01'},
        {name:'space_rate',type:'number',step:'0.001',min:'0.001'}]} onSubmit={b=>save(
        edit?'/products/'+edit:'/products',b,edit?'PUT':'POST')}/>
      <div className="flex flex-wrap gap-2 mt-3"><button onClick={()=>setEdit(null)}>New product</button>
        {products.map(p=><button key={p.id} onClick={()=>setEdit(p.id)}>Edit {p.id}</button>)}
      </div><h2>Retire product</h2><Form fields={[{name:'id',options:options(products)}]} button="Retire"
        onSubmit={b=>save('/products/'+b.id,{...products.find(p=>p.id===Number(b.id)),active:false},'PUT')}/>
    </>}
    {user.role==='CUSTOMER'&&<><h2>Place an order</h2><Banner>Choose delivery at least 7 calendar days from today.
      Select the coverage area containing your address. All goods originate in Kandy.</Banner>
      <fieldset disabled={loading||!!errors.products||products.length===0}>
      <Form button="Add item" fields={[{name:'product_id',options:options(products)},
        {name:'quantity',type:'number',min:1,max:100000}]} onSubmit={async b=>{
        const id=Number(b.product_id),q=Number(b.quantity);
        setCart(old=>old.some(i=>i.product_id===id)?old.map(i=>i.product_id===id?{...i,quantity:i.quantity+q}:i):[...old,{product_id:id,quantity:q}]);
        return {message:'Added to order'};
      }}/></fieldset><Table rows={cart}/><button className="my-3" onClick={()=>setCart([])}>Clear items</button>
      {loading?<p role="status">Loading delivery coverage…</p>:errors.coverage?
        <p role="alert">Unable to load delivery coverage: {errors.coverage}. Please try refreshing.</p>:
        routes.length===0&&<Banner>No delivery coverage areas are available yet. Please contact KandyPack or check again later before placing an order.</Banner>}
      <fieldset disabled={loading||!!errors.coverage||!!errors.products||routes.length===0||products.length===0||cart.length===0}>
      <Form button="Confirm order" fields={[{name:'route_id',label:'Delivery coverage area',
        options:routes.map(r=>({value:r.id,label:`${r.city} | ${r.coverage_area}`}))},
        {name:'address'},{name:'delivery_date',type:'date'},{name:'instructions',optional:true}]}
        onSubmit={async b=>{const r=await save('/orders',{...b,items:cart});setCart([]);
          return {message:`Order ${r.id} placed. You can track it below.`};}}/></fieldset>
    </>}
    <h2>Order history and tracking</h2><div className="flex flex-wrap gap-3 mb-4">
      <label>From<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
      <label>To<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
      <button onClick={load} disabled={loading}>Refresh history</button></div>
    {errors.history?<p role="alert">Unable to load order history: {errors.history}. Please try refreshing.</p>:
      loading?<p role="status">Loading order history…</p>:<Table rows={orders.map(o=>({id:o.id,customer:o.customer,city:o.city,route:o.route,
      delivery_date:o.delivery_date,status:o.status,value_LKR:o.total_value}))}/>}
    {user.role==='CUSTOMER'&&orders.some(o=>o.status==='PENDING')&&<div className="my-4 p-3 bg-amber-50 border border-amber-200 rounded">
      <h3>Cancel a pending order</h3>
      <Form button="Cancel order" fields={[{name:'id',label:'Select pending order',
        options:orders.filter(o=>o.status==='PENDING').map(o=>({value:o.id,label:`Order #${o.id} · Due: ${o.delivery_date}`}))}]}
        onSubmit={async b=>save(`/orders/${b.id}/cancel`,{})}/>
    </div>}
    <h2>Inspect an order</h2><Form button="View details" fields={[{name:'id',type:'number',min:1}]}
      onSubmit={async b=>{setDetail(await api('/orders/'+b.id));return {message:'Details loaded'};}}/>
    {detail&&<><Table rows={[detail.order]}/><Table rows={detail.items}/>
      {detail.order?.status==='PENDING'&&(user.role==='CUSTOMER'||user.role==='ADMIN')&&<button
        className="mt-3 bg-red-600 text-white px-3 py-1.5 rounded"
        onClick={async()=>{await save(`/orders/${detail.order.id}/cancel`,{});setDetail(null);}}>
        Cancel order #{detail.order.id}
      </button>}
    </>}
  </>;
}
