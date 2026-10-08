import {useEffect,useState} from 'react';
import {api} from '../../api';
import {Form,Table,options,Banner} from '../../components/UI';

export const roles=['ADMIN','STORE'];
export const label='Road';
export const order=40;

export default function Page({user}){
  const [directory,setDirectory]=useState({stores:[],routes:[]}),
        [store,setStore]=useState(user.store_id||1);

  const [resources,setResources]=useState({trucks:[],employees:[]}),
        [orders,setOrders]=useState([]);

  const [trips,setTrips]=useState([]),
        [error,setError]=useState(''),
        [route,setRoute]=useState('');

  const [chosen,setChosen]=useState([]),
        [returnTrip,setReturnTrip]=useState(''),
        [tripOrders,setTripOrders]=useState([]);

  const [delivered,setDelivered]=useState([]),
        [week,setWeek]=useState('');

  async function load(){
    try{
      const [d,r,o,t]=await Promise.all([
        api('/directory'),
        api(`/road/resources?store_id=${store}&week=${week}`),
        api('/orders'),
        api('/road/trips')
      ]);

      setDirectory(d);
      setResources(r);
      setOrders(o);
      setTrips(t);
    }catch(e){
      setError(e.message);
    }
  }

  useEffect(()=>{
    load();
  },[store]);

  const send=url=>async body=>{
    const r=await api(url,{
      method:'POST',
      body
    });

    await load();
    return r;
  };

  const localRoutes=directory.routes.filter(
    r=>r.store_id===Number(store)
  );

  const localOrders=orders.filter(
    o=>o.status==='AT_STORE' &&
       o.route_id===Number(route)
  );

  return <>
    <h1>Road deliveries and rosters</h1>

    <p role="alert">{error}</p>

    <div className="flex flex-wrap gap-3">
      <label>
        Store
        <select
          value={store}
          disabled={user.role==='STORE'}
          onChange={e=>{
            setStore(e.target.value);
            setRoute('');
            setChosen([]);
          }}
        >
          {directory.stores.map(s=>
            <option value={s.id} key={s.id}>
              {s.city}
            </option>
          )}
        </select>
      </label>

      <label>
        Roster week containing
        <input
          type="date"
          value={week}
          onChange={e=>setWeek(e.target.value)}
        />
      </label>

      <button onClick={load}>
        Refresh
      </button>
    </div>

    <Banner>
      Reserve planned hours before dispatch. A break of 30 minutes
      resets consecutive routes. Drivers: 40 hours per Monday to
      Sunday week. Assistants: 60 hours. Resource lists show current
      status; the database checks your exact proposed interval when
      you save.
    </Banner>

    <h2>Trucks</h2>
    <Table rows={resources.trucks}/>

    <h2>Staff and committed hours</h2>
    <Table rows={resources.employees}/>

    <details>
      <summary>Add or maintain fleet and staff</summary>

      <h2>Add truck</h2>

      <Form
        fields={[
          {name:'plate'},
          {name:'type'},
          {
            name:'capacity',
            type:'number',
            min:'0.001',
            step:'0.001'
          }
        ]}
        onSubmit={b=>
          send('/road/trucks')({
            ...b,
            store_id:store
          })
        }
      />

      <h2>Add employee</h2>

      <Form
        fields={[
          {name:'name'},
          {name:'nic'},
          {name:'phone'},
          {
            name:'email',
            type:'email',
            optional:true
          },
          {
            name:'role',
            options:['DRIVER','ASSISTANT'].map(
              value=>({
                value,
                label:value
              })
            )
          }
        ]}
        onSubmit={b=>
          send('/road/employees')({
            ...b,
            store_id:store
          })
        }
      />

      <h2>Resource active status</h2>

      <Form
        fields={[
          {
            name:'kind',
            options:['trucks','employees'].map(
              value=>({
                value,
                label:value
              })
            )
          },
          {
            name:'id',
            type:'number',
            min:1
          },
          {
            name:'active',
            options:[
              {
                value:'1',
                label:'Active'
              },
              {
                value:'0',
                label:'Unavailable'
              }
            ]
          }
        ]}
        onSubmit={async b=>{
          const r=await api(
            `/road/${b.kind}/${b.id}/active`,
            {
              method:'PATCH',
              body:{
                active:b.active==='1'
              }
            }
          );

          await load();
          return r;
        }}
      />
    </details>

    <h2>Plan a delivery</h2>

    <label>
      Local route
      <select
        value={route}
        onChange={e=>{
          setRoute(e.target.value);
          setChosen([]);
        }}
      >
        <option value="">
          Choose route
        </option>

        {localRoutes.map(r=>
          <option key={r.id} value={r.id}>
            {r.name} | {r.max_minutes} min maximum
          </option>
        )}
      </select>
    </label>

    <div className="card my-3">
      {localOrders.length
        ?localOrders.map(o=>
          <label key={o.id} className="py-2">
            <input
              type="checkbox"
              checked={chosen.includes(o.id)}
              onChange={e=>
                setChosen(old=>
                  e.target.checked
                    ?[...old,o.id]
                    :old.filter(x=>x!==o.id)
                )
              }
            />

            Order {o.id}
            {' | '}
            due {o.delivery_date}
            {' | '}
            {o.total_space} space
            {' | '}
            {o.address}
          </label>
        )
        :<p>
          No fully received orders for this route.
        </p>
      }
    </div>

    <Form
      button="Reserve delivery"
      fields={[
        {
          name:'truck_id',
          options:options(
            resources.trucks.filter(x=>x.active),
            'plate'
          )
        },
        {
          name:'driver_id',
          options:options(
            resources.employees.filter(
              e=>e.role==='DRIVER' && e.active
            )
          )
        },
        {
          name:'assistant_id',
          options:options(
            resources.employees.filter(
              e=>e.role==='ASSISTANT' && e.active
            )
          )
        },
        {
          name:'planned_start',
          type:'datetime-local'
        },
        {
          name:'planned_end',
          type:'datetime-local'
        }
      ]}
      onSubmit={async b=>{
        const r=await send('/road/schedule')({
          ...b,
          route_id:route,
          order_ids:chosen
        });

        setChosen([]);
        return r;
      }}
    />

    <h2>Delivery trips</h2>

    <Table
      rows={
        trips.filter(
          t=>t.store_id===Number(store)
        )
      }
    />

    <Form
      fields={[
        {
          name:'id',
          options:options(
            trips.filter(
              t=>
                t.status==='PLANNED' &&
                t.store_id===Number(store)
            ),
            'route'
          )
        },
        {
          name:'action',
          options:[
            {
              value:'dispatch',
              label:'Dispatch now'
            },
            {
              value:'cancel',
              label:'Cancel planned trip'
            }
          ]
        }
      ]}
      onSubmit={b=>
        send(
          `/road/trips/${b.id}/${b.action}`
        )({})
      }
    />

    <h2>Log a return</h2>

    <label>
      Active trip

      <select
        value={returnTrip}
        onChange={async e=>{
          setReturnTrip(e.target.value);
          setDelivered([]);

          try{
            setTripOrders(
              await api(
                `/road/trips/${e.target.value}/orders`
              )
            );
          }catch(err){
            setError(err.message);
          }
        }}
      >
        <option value="">
          Choose trip
        </option>

        {
          trips
            .filter(
              t=>
                t.status==='OUT' &&
                t.store_id===Number(store)
            )
            .map(t=>
              <option key={t.id} value={t.id}>
                {t.id}
                {' | '}
                {t.route}
                {' | '}
                started {t.actual_start}
              </option>
            )
        }
      </select>
    </label>

    <div className="card my-3">
      <p>
        Select only successfully delivered orders.
        Unchecked orders return to At Store.
      </p>

      {tripOrders.map(x=>
        <label
          className="py-2"
          key={x.order_id}
        >
          <input
            type="checkbox"
            checked={
              delivered.includes(x.order_id)
            }
            onChange={e=>
              setDelivered(old=>
                e.target.checked
                  ?[...old,x.order_id]
                  :old.filter(
                    id=>id!==x.order_id
                  )
              )
            }
          />

          Order {x.order_id} delivered
        </label>
      )}
    </div>

    <Form
      button="Record actual return"
      fields={[
        {
          name:'actual_end',
          type:'datetime-local'
        }
      ]}
      onSubmit={async b=>{
        const r=await send(
          `/road/trips/${returnTrip}/return`
        )({
          ...b,
          delivered_ids:delivered
        });

        setReturnTrip('');
        setTripOrders([]);
        setDelivered([]);

        return r;
      }}
    />
  </>;
}