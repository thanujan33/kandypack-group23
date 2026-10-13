import { useEffect, useState } from 'react';
import { api } from '../../api';
import { Form, Table, options, Banner, StatCard } from '../../components/UI';

export const roles = ['ADMIN', 'STORE'];
export const label = 'Road';
export const order = 40;

export default function Page({ user }) {
  const isStore = user.role === 'STORE';
  const [tripFilter, setTripFilter] = useState('ACTIVE');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(new Date());
  const [directory, setDirectory] = useState({ stores: [], routes: [] }),
    [store, setStore] = useState(user.store_id || 1);
  const [resources, setResources] = useState({ trucks: [], employees: [] }),
    [orders, setOrders] = useState([]);
  const [trips, setTrips] = useState([]),
    [error, setError] = useState(''),
    [route, setRoute] = useState('');
  const [chosen, setChosen] = useState([]),
    [returnTrip, setReturnTrip] = useState(''),
    [tripOrders, setTripOrders] = useState([]);
  const [delivered, setDelivered] = useState([]),
    [week, setWeek] = useState(today);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user?.role === 'STORE' && user?.store_id) {
      setStore(user.store_id);
    }
  }, [user]);

  async function load() {
    setLoading(true);
    try {
      const [d, r, o, t] = await Promise.all([
        api('/directory'),
        api(`/road/resources?store_id=${store}&week=${week}`),
        api('/orders'),
        api('/road/trips')
      ]);
      setDirectory(d);
      setResources(r);
      setOrders(o);
      setTrips(t);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [store, week]);

  const send = url => async body => {
    const r = await api(url, { method: 'POST', body });
    await load();
    return r;
  };

  const localRoutes = directory.routes.filter(r => r.store_id === Number(store));
  const localOrders = orders.filter(o => o.status === 'AT_STORE' && o.route_id === Number(route));
  const activeTrucks = resources.trucks.filter(t => t.active);
  const trucksOnTrip = resources.trucks.filter(t => t.live_status === 'ON_TRIP').length;
  const activeDrivers = resources.employees.filter(e => e.role === 'DRIVER' && e.active);
  const activeAssistants = resources.employees.filter(e => e.role === 'ASSISTANT' && e.active);
  const currentTrips = trips.filter(t => t.store_id === Number(store));
  const plannedTripsCount = currentTrips.filter(t => t.status === 'PLANNED').length;
  const outTripsCount = currentTrips.filter(t => t.status === 'OUT').length;
  const completedTripsCount = currentTrips.filter(t => t.status === 'COMPLETED').length;
  const currentStore = directory.stores.find(s => s.id === Number(store));
  const visibleTrips = isStore ? currentTrips.filter(trip => matchesTripStatus(trip.status, tripFilter)) : currentTrips;

  return (
    <div className="space-y-6">
      {/* Header Context Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200/80 gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{isStore ? 'Road Deliveries' : 'Road Deliveries & Fleet Rostering'}</h1>
          {!isStore && <p className="text-xs text-muted mt-0.5">
            Regional Hub Final-Mile: Plan truck dispatches, enforce driver rest hours, and record delivery outcomes.
          </p>}
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 self-start sm:self-auto text-xs"
        >
          <span className="material-symbols-outlined text-[16px]">refresh</span>
          <span>{loading ? 'Refreshing…' : isStore ? 'Refresh' : 'Refresh Fleet'}</span>
        </button>
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
          {error}
        </div>
      )}

      {/* Depot & Roster Selection Bar */}
      <div className="card flex flex-wrap items-center gap-4 bg-slate-50/70 border-slate-200/80">
        {user.role === 'STORE' ? (
          <div className="w-full sm:w-64">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">Your Store</span>
            <div className="flex items-center gap-2 mt-1 px-3 py-2 bg-white rounded-lg border border-slate-200 shadow-2xs">
              <span className="material-symbols-outlined text-[18px] text-blue-600">store</span>
              <span className="text-xs font-bold text-slate-900">
                {currentStore?.city || 'Your'} Store
              </span>
            </div>
          </div>
        ) : (
          <div className="w-full sm:w-60">
            <label htmlFor="store-select">Operating Depot Store</label>
            <select
              id="store-select"
              value={store}
              onChange={e => {
                setStore(e.target.value);
                setRoute('');
                setChosen([]);
              }}
            >
              {directory.stores.map(s => (
                <option value={s.id} key={s.id}>
                  {s.city} Regional Depot
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="w-full sm:w-60">
          <label htmlFor="week-input">{isStore ? 'Staff hours: week containing' : 'Roster Week Date'}</label>
          <input
            id="week-input"
            type="date"
            value={week}
            onChange={e => setWeek(e.target.value)}
          />
        </div>
      </div>

      {/* Road Fleet KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          title="Active Trucks"
          value={`${activeTrucks.length} / ${resources.trucks.length}`}
          subtitle={trucksOnTrip ? `${trucksOnTrip} currently on route` : `${activeTrucks.length} available at depot`}
          icon="local_shipping"
          color="blue"
        />
        <StatCard
          title="Active Drivers"
          value={`${activeDrivers.length} / ${resources.employees.filter(e => e.role === 'DRIVER').length}`}
          subtitle={activeDrivers.length ? `${activeDrivers.length} available · 40h cap` : 'No active drivers'}
          icon="badge"
          color="teal"
        />
        <StatCard
          title="Active Assistants"
          value={`${activeAssistants.length} / ${resources.employees.filter(e => e.role === 'ASSISTANT').length}`}
          subtitle={activeAssistants.length ? `${activeAssistants.length} available · 60h cap` : 'No active assistants'}
          icon="person_add"
          color="amber"
        />
        <StatCard
          title="Delivery Trips"
          value={currentTrips.length}
          subtitle={
            outTripsCount || plannedTripsCount
              ? `${outTripsCount} on route · ${plannedTripsCount} planned`
              : `${completedTripsCount} completed trips`
          }
          icon="alt_route"
          color="emerald"
        />
      </div>

      {!isStore && <Banner type="info">
        Reserve planned hours before dispatch. A mandatory break of 30 minutes resets consecutive routes. Drivers: 40 hours max per Monday to Sunday week. Assistants: 60 hours max. The database strictly validates limits upon saving.
      </Banner>}

      {/* Fleet & Staff Resource Tables */}
      <div className={isStore ? 'space-y-6' : 'grid grid-cols-1 lg:grid-cols-2 gap-6'}>
        <div className="space-y-3">
          <h2 className="text-base font-bold text-slate-900 mt-0">
            <span className="material-symbols-outlined text-blue-700 text-[18px]">rv_hookup</span>
            <span>{isStore ? 'Trucks' : 'Depot Truck Fleet'}</span>
          </h2>
          <Table
            rows={resources.trucks.map(t => ({
              ...(!isStore ? { id: t.id } : {}),
              plate: t.plate,
              type: t.type,
              capacity_cu: Number(t.capacity).toFixed(2),
              fleet_status: t.live_status === 'ON_TRIP' ? 'OUT' : (t.active ? 'Available' : isStore ? 'Not available' : 'Unavailable'),
              ...(!isStore ? { active: t.active } : {})
            }))}
          />
        </div>

        <div className="space-y-3">
          <h2 className="text-base font-bold text-slate-900 mt-0">
            <span className="material-symbols-outlined text-blue-700 text-[18px]">groups</span>
            <span>{isStore ? 'Staff and Weekly Hours' : 'Rostered Staff & Committed Hours'}</span>
          </h2>
          <Table
            rows={resources.employees.map(e => ({
              ...(!isStore ? { id: e.id } : {}),
              name: e.name,
              role: isStore ? (e.role === 'DRIVER' ? 'Driver' : 'Assistant') : e.role,
              [isStore ? 'hours_used_or_booked' : 'committed_hours']: Number(e.committed_hours || 0).toFixed(1),
              remaining_hours: Number(e.remaining_hours != null ? e.remaining_hours : (e.role === 'DRIVER' ? 40 : 60)).toFixed(1),
              weekly_limit: e.role === 'DRIVER' ? '40.0' : '60.0',
              ...(isStore ? { availability: e.active ? 'Available' : 'Not available' } : { active: e.active })
            }))}
          />
        </div>
      </div>

      {/* Fleet Maintenance Accordion */}
      <details className="card group">
        <summary className="text-sm font-semibold text-blue-700 cursor-pointer list-none flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">build</span>
            <span>{isStore ? 'Manage Trucks and Staff' : 'Manage Depot Fleet, Personnel & Availability'}</span>
          </div>
          <span className="material-symbols-outlined text-[18px] transition-transform group-open:rotate-180">expand_more</span>
        </summary>

        <div className="pt-4 border-t border-slate-100 mt-4 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">Register New Truck</h3>
              <Form
                fields={[
                  { name: 'plate', label: 'License Plate (e.g. WP-LA-8821)' },
                  { name: 'type', label: 'Vehicle Type / Model' },
                  { name: 'capacity', label: 'Volume Capacity (cu units)', type: 'number', min: '0.001', step: '0.001' }
                ]}
                onSubmit={b => send('/road/trucks')({ ...b, store_id: store })}
              />
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">Register Staff Member</h3>
              <Form
                fields={[
                  { name: 'name', label: 'Full Employee Name' },
                  { name: 'nic', label: 'NIC Number' },
                  { name: 'phone', label: 'Phone Number' },
                  { name: 'email', label: 'Email Address', type: 'email', optional: true },
                  {
                    name: 'role',
                    label: 'Operational Role',
                    options: ['DRIVER', 'ASSISTANT'].map(value => ({ value, label: value }))
                  }
                ]}
                onSubmit={b => send('/road/employees')({ ...b, store_id: store })}
              />
            </div>
          </div>

          {/* Upgraded Resource Availability Toggles (No Raw ID Inputs) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2 border-t border-slate-100">
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">Update Truck Availability</h3>
              <Form
                fields={[
                  {
                    name: 'id',
                    label: 'Select Truck',
                    options: resources.trucks.map(t => ({
                      value: t.id,
                      label: isStore ? `${t.plate} (${t.type})` : `${t.plate} (${t.type}) · Currently ${t.active ? 'Active' : 'Unavailable'}`
                    }))
                  },
                  {
                    name: 'active',
                    label: isStore ? 'Availability' : 'Target Availability',
                    options: [
                      { value: '1', label: isStore ? 'Available' : 'Active (Available for trips)' },
                      { value: '0', label: isStore ? 'Not available' : 'Unavailable (Maintenance / Off-duty)' }
                    ]
                  }
                ]}
                button="Update Truck Status"
                onSubmit={async b => {
                  const r = await api(`/road/trucks/${b.id}/active`, {
                    method: 'PATCH',
                    body: { active: b.active === '1' }
                  });
                  await load();
                  return r;
                }}
              />
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">Update Staff Availability</h3>
              <Form
                fields={[
                  {
                    name: 'id',
                    label: 'Select Employee',
                    options: resources.employees.map(e => ({
                      value: e.id,
                      label: isStore ? `${e.name} (${e.role === 'DRIVER' ? 'Driver' : 'Assistant'})` : `${e.name} (${e.role}) · Currently ${e.active ? 'Active' : 'Unavailable'}`
                    }))
                  },
                  {
                    name: 'active',
                    label: isStore ? 'Availability' : 'Target Availability',
                    options: [
                      { value: '1', label: isStore ? 'Available' : 'Active (Available for rosters)' },
                      { value: '0', label: isStore ? 'Not available' : 'Unavailable (On leave / Off-duty)' }
                    ]
                  }
                ]}
                button="Update Staff Status"
                onSubmit={async b => {
                  const r = await api(`/road/employees/${b.id}/active`, {
                    method: 'PATCH',
                    body: { active: b.active === '1' }
                  });
                  await load();
                  return r;
                }}
              />
            </div>
          </div>
        </div>
      </details>

      {/* Plan Delivery Trip Section */}
      <section className="card space-y-4 bg-gradient-to-b from-white to-slate-50/40">
        <div className="border-b border-slate-100 pb-3">
          <h2 className="text-lg font-bold text-slate-900 mt-0">
            <span className="material-symbols-outlined text-blue-700 text-[20px]">route</span>
            <span>{isStore ? 'Plan a Delivery Trip' : 'Plan & Reserve Final-Mile Road Delivery'}</span>
          </h2>
          <p className="text-xs text-muted mt-0.5">
            {isStore
              ? 'Choose fully received orders ready at this store. Orders may be scheduled before, on, or after their target delivery date.'
  : 'Choose orders for the selected route and delivery date.'}
          </p>
        </div>

        <div className="max-w-md">
          <label htmlFor="route-select">Select Local Route</label>
          <select
            id="route-select"
            value={route}
            onChange={e => {
              setRoute(e.target.value);
              setChosen([]);
            }}
          >
            <option value="">Choose route…</option>
            {localRoutes.map(r => (
              <option key={r.id} value={r.id}>
                {r.name} | {r.max_minutes} min maximum turnaround
              </option>
            ))}
          </select>
        </div>

        {/* Orders Ready at Store Checklist */}
        <div className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-600 block">
            Orders Ready at Store for this Route ({localOrders.length})
          </span>
          {localOrders.length ? (
            <div className="space-y-1.5 max-h-56 overflow-y-auto p-3 rounded-xl border border-slate-200 bg-white shadow-2xs">
              {localOrders.map(o => (
                <label key={o.id} className="flex items-center text-xs py-1 hover:bg-slate-50 rounded px-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={chosen.includes(o.id)}
                    onChange={e =>
                      setChosen(old => (e.target.checked ? [...old, o.id] : old.filter(x => x !== o.id)))
                    }
                  />
                  <span className="font-semibold text-slate-900">Order #{o.id}</span>
                  <span className="mx-1 text-muted">·</span>
                  <span className="text-slate-600">Due: {o.delivery_date}</span>
                  <span className="mx-1 text-muted">·</span>
                  <span className="text-blue-700 font-medium">{o.total_space} cu space</span>
                  <span className="mx-1 text-muted">·</span>
                  <span className="text-muted truncate">{o.address}</span>
                </label>
              ))}
            </div>
          ) : (
            <div className="p-4 rounded-xl border border-dashed border-slate-300 text-center text-xs text-muted bg-slate-50/50">
              No fully received orders available for dispatch on this route right now.
            </div>
          )}
        </div>

        {/* Reservation Form */}
        <fieldset disabled={!route || chosen.length === 0} className="pt-2">
          <Form
            button="Reserve Delivery Trip"
            fields={[
              {
                name: 'truck_id',
                label: 'Delivery Truck',
                options: isStore ? resources.trucks.filter(x => x.active).map(x => ({ value: x.id, label: x.plate })) : options(resources.trucks.filter(x => x.active), 'plate')
              },
              {
                name: 'driver_id',
                label: 'Driver (Licensed)',
                options: isStore ? activeDrivers.map(e => ({ value: e.id, label: e.name })) : options(resources.employees.filter(e => e.role === 'DRIVER' && e.active))
              },
              {
                name: 'assistant_id',
                label: 'Driver Assistant',
                options: isStore ? activeAssistants.map(e => ({ value: e.id, label: e.name })) : options(resources.employees.filter(e => e.role === 'ASSISTANT' && e.active))
              },
              { name: 'planned_start', label: 'Planned Start Time', type: 'datetime-local' },
              { name: 'planned_end', label: 'Planned End Time', type: 'datetime-local' }
            ]}
            onSubmit={async b => {
              if (isStore) {
                checkSelectedOrders(orders, chosen, route, b.planned_start);
                checkTripDuration(b.planned_start, b.planned_end, localRoutes.find(r => r.id === Number(route))?.max_minutes);
              }
              const r = await send('/road/schedule')({
                ...b,
                route_id: route,
                order_ids: chosen
              });
              setChosen([]);
              return r;
            }}
          />
        </fieldset>
      </section>

      {/* Trips Registry & Dispatch Management */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900">
          <span className="material-symbols-outlined text-blue-700 text-[20px]">departure_board</span>
          <span>{isStore ? 'Delivery Trips' : 'Delivery Trips Registry'}</span>
        </h2>

        {isStore && (
          <div className="max-w-sm">
            <label htmlFor="delivery-trip-filter">Trips to show</label>
            <select id="delivery-trip-filter" value={tripFilter} onChange={e => setTripFilter(e.target.value)}>
              <option value="ACTIVE">Open trips</option>
              <option value="PLANNED">Planned</option>
              <option value="OUT">Out for delivery</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="ALL">All trips</option>
            </select>
            <p className="text-xs text-muted mt-1">Open trips includes planned trips and trips out for delivery.</p>
          </div>
        )}
        <Table
          key={isStore ? `${tripFilter}-${visibleTrips.map(t => t.id).join(',')}` : 'all-trips'}
          rows={visibleTrips.map(t => ({
            ...(!isStore ? { trip_id: `#${t.id}` } : {}),
            route: t.route,
            truck_plate: t.plate,
            driver: t.driver,
            assistant: t.assistant,
            planned_start: t.planned_start ? t.planned_start.replace('T', ' ').slice(0, 16) : '—',
            planned_end: t.planned_end ? t.planned_end.replace('T', ' ').slice(0, 16) : '—',
            status: t.status,
            actual_minutes: t.actual_minutes != null ? `${t.actual_minutes} min` : '—',
            alert: t.warning === 'ROUTE_OVERRUN' ? 'Overrun Warning' : 'Normal'
          }))}
        />

        {/* Dispatch or Cancel Trip */}
        {currentTrips.some(t => t.status === 'PLANNED') && (
          <div className="card space-y-3">
            <h2 className="text-base font-bold text-slate-900 mt-0">
              <span className="material-symbols-outlined text-blue-700 text-[18px]">play_circle</span>
              <span>Dispatch or Cancel Planned Trip</span>
            </h2>
            <Form
              fields={[
                {
                  name: 'id',
                  label: 'Planned Trip',
                  options: currentTrips
                    .filter(t => t.status === 'PLANNED')
                    .map(t => ({
                      value: t.id,
                      label: `${isStore ? '' : `Trip #${t.id} · `}${t.route} (${t.plate || 'Truck'}) · Planned: ${t.planned_start ? t.planned_start.replace('T', ' ').slice(0, 16) : '—'}`
                    }))
                },
                {
                  name: 'action',
                  label: 'Action',
                  options: [
                    { value: 'dispatch', label: 'Dispatch Now (Mark Out on Route)' },
                    { value: 'cancel', label: 'Cancel Planned Reservation' }
                  ]
                }
              ]}
              button="Execute Trip Action"
              onSubmit={b => send(`/road/trips/${b.id}/${b.action}`)({})}
            />
          </div>
        )}
      </section>

      {/* Log Return & Record Delivered Outcomes */}
      <section className="card space-y-4 bg-gradient-to-b from-white to-slate-50/40">
        <div className="border-b border-slate-100 pb-3">
          <h2 className="text-lg font-bold text-slate-900 mt-0">
            <span className="material-symbols-outlined text-blue-700 text-[20px]">assignment_turned_in</span>
            <span>Log Actual Trip Return & Delivery Outcomes</span>
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Confirm deliveries for orders fulfilled. Unchecked orders return to AT_STORE status for rescheduling.
          </p>
        </div>

        <div className="max-w-md">
          <label htmlFor="return-trip-select">Select Active Returning Trip</label>
          <select
            id="return-trip-select"
            value={returnTrip}
            onChange={async e => {
              const val = e.target.value;
              setReturnTrip(val);
              setDelivered([]);
              if (!val) {
                setTripOrders([]);
                return;
              }
              try {
                setTripOrders(await api(`/road/trips/${val}/orders`));
              } catch (err) {
                setError(err.message);
              }
            }}
          >
            <option value="">Choose trip currently out…</option>
            {currentTrips
              .filter(t => t.status === 'OUT')
              .map(t => (
                <option key={t.id} value={t.id}>
                  {!isStore && `Trip #${t.id} | `}{t.route} ({t.plate}) | Departed: {t.actual_start ? t.actual_start.replace('T', ' ').slice(0, 16) : '—'}
                </option>
              ))}
          </select>
        </div>

        {tripOrders.length > 0 && (
          <div className="space-y-3 pt-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-600 block">
              Orders Dispatched on Trip ({tripOrders.length})
            </span>
            <div className="space-y-1.5 p-3 rounded-xl border border-slate-200 bg-white">
              {tripOrders.map(x => {
                const ord = orders.find(o => o.id === x.order_id);
                return (
                  <label key={x.order_id} className="flex items-center text-xs py-1 hover:bg-slate-50 rounded px-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={delivered.includes(x.order_id)}
                      onChange={e =>
                        setDelivered(old =>
                          e.target.checked ? [...old, x.order_id] : old.filter(id => id !== x.order_id)
                        )
                      }
                    />
                    <span className="font-semibold text-slate-900">Order #{x.order_id} Delivered</span>
                    {ord && (
                      <>
                        <span className="mx-1 text-muted">·</span>
                        <span className="text-slate-600 font-medium">Due: {ord.delivery_date}</span>
                        <span className="mx-1 text-muted">·</span>
                        <span className="text-slate-500 truncate">{ord.address || ord.customer}</span>
                      </>
                    )}
                    <span className="mx-1 text-muted">·</span>
                    <span className="text-muted text-[11px]">Uncheck to mark as FAILED (reverts to store)</span>
                  </label>
                );
              })}
            </div>

            <Form
              button="Record Actual Return"
              fields={[
                {
                  name: 'actual_end',
                  label: 'Actual Vehicle Return Timestamp',
                  type: 'datetime-local'
                }
              ]}
              onSubmit={async b => {
                const r = await send(`/road/trips/${returnTrip}/return`)({
                  ...b,
                  delivered_ids: delivered
                });
                setReturnTrip('');
                setTripOrders([]);
                setDelivered([]);
                return r;
              }}
            />
          </div>
        )}
      </section>
    </div>
  );
}

// Store-only display filter. IDs remain in state and API requests.
function matchesTripStatus(status, filter) {
  return filter === 'ALL' || (filter === 'ACTIVE'
    ? status === 'PLANNED' || status === 'OUT'
    : status === filter);
}

// Explain the existing database rules before submitting the store's form.
// The database still validates the request again using the latest data.
function checkSelectedOrders(orders, chosen, route) {
  if (!chosen.length) {
    throw new Error('Select at least one order.');
  }

  if (new Set(chosen.map(Number)).size !== chosen.length) {
    throw new Error('Select each order only once.');
  }

  const selected = chosen.map(id =>
    orders.find(
      order => Number(order.id) === Number(id)
    )
  );

  if (
    selected.some(
      order =>
        !order ||
        order.status !== 'AT_STORE' ||
        Number(order.route_id) !== Number(route)
    )
  ) {
    throw new Error(
      'Choose fully received orders for this route. Refresh the page if an order has changed.'
    );
  }
}


function checkTripDuration(start, end, maximumMinutes) {
  // The project's trip dates use Sri Lanka time, including on browsers abroad.
  const startTime = new Date(String(start).replace(' ', 'T') + '+05:30').getTime();
  const endTime = new Date(String(end).replace(' ', 'T') + '+05:30').getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
    throw new Error('Choose an end time after the start time.');
  }
  const minutes = (endTime - startTime) / 60000;
  if (Number.isFinite(Number(maximumMinutes)) && minutes > Number(maximumMinutes)) {
    throw new Error(`This trip lasts ${Math.round(minutes)} minutes. The selected route allows up to ${maximumMinutes} minutes. Choose an earlier end time.`);
  }
}
