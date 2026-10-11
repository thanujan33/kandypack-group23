import { useEffect, useState } from 'react';
import { api } from '../../api';
import { Form, Table, options, Banner, StatCard } from '../../components/UI';

export const roles = ['ADMIN', 'FACTORY', 'STORE'];
export const label = 'Rail';
export const order = 30;

export default function Page({ user }) {
  const [trains, setTrains] = useState([]),
    [manifest, setManifest] = useState([]),
    [stores, setStores] = useState([]);
  const [orders, setOrders] = useState([]),
    [error, setError] = useState(''),
    [edit, setEdit] = useState('');
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [t, m, d, o] = await Promise.all([
        api('/trains'),
        api('/rail/manifest'),
        api('/directory'),
        api('/orders')
      ]);
      setTrains(t);
      setManifest(m);
      setStores(d.stores);
      setOrders(o);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const send = (url, method = 'POST') => async body => {
    const r = await api(url, { method, body });
    await load();
    return r;
  };

  const selectedTrain = edit ? trains.find(t => t.id === Number(edit)) : null;

  return (
    <div className="space-y-6">
      {/* Header Context */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200/80 gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Rail Freight & Capacity Planner</h1>
          <p className="text-xs text-muted mt-0.5">
            Intermodal Line-Haul: Kandy Central Yard to regional destination depots across Sri Lanka.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 self-start sm:self-auto text-xs"
        >
          <span className="material-symbols-outlined text-[16px]">refresh</span>
          <span>{loading ? 'Refreshing…' : 'Refresh Timetable'}</span>
        </button>
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
          {error}
        </div>
      )}

      {/* Rail KPI Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard title="Active Trains" value={trains.length} subtitle="Scheduled & running" icon="train" color="blue" />
        <StatCard
          title="Scheduled Due"
          value={trains.filter(t => t.status === 'SCHEDULED').length}
          subtitle="Ready for allocation"
          icon="event_upcoming"
          color="amber"
        />
        <StatCard
          title="On Mainline"
          value={trains.filter(t => t.status === 'IN_TRANSIT').length}
          subtitle="Transiting Kadugannawa"
          icon="alt_route"
          color="teal"
        />
        <StatCard
          title="Manifest Items"
          value={manifest.length}
          subtitle="Bin-packed cargo lots"
          icon="inventory_2"
          color="emerald"
        />
      </div>

      <Banner type="info">
        Goods must arrive at the destination store before 08:00 on the requested delivery date. Missing items block road scheduling until received.
      </Banner>

      {/* Train Timetable & Capacity Table */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">
          <span className="material-symbols-outlined text-blue-700 text-[20px]">calendar_view_week</span>
          <span>Train Trips & Timetable Capacity</span>
        </h2>
        <Table
          rows={trains.map(t => ({
            id: t.id,
            reference: t.reference,
            destination: t.city,
            departure: t.departure_at,
            arrival: t.arrival_at,
            status: t.status,
            capacity: Number(t.capacity).toFixed(2),
            available: Number(t.available_capacity).toFixed(2)
          }))}
        />
      </section>

      {/* Train Administration & Allocation */}
      {['ADMIN', 'FACTORY'].includes(user.role) && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Add / Edit Train */}
          <div className="card space-y-3">
            <h2 className="text-base font-bold text-slate-900 mt-0">
              <span className="material-symbols-outlined text-blue-700 text-[18px]">add_circle</span>
              <span>{edit ? `Edit Train #${edit}` : 'Schedule New Train Trip'}</span>
            </h2>

            <Form
              key={edit || 'new'}
              fields={[
                { name: 'reference', label: 'Train Reference Code', value: selectedTrain?.reference },
                { name: 'store_id', label: 'Destination Regional Depot', options: options(stores, 'city'), value: selectedTrain?.store_id },
                {
                  name: 'departure_at',
                  label: 'Departure Time (Kandy Yard)',
                  type: 'datetime-local',
                  value: selectedTrain?.departure_at ? selectedTrain.departure_at.slice(0, 16).replace(' ', 'T') : undefined
                },
                {
                  name: 'arrival_at',
                  label: 'Arrival Time (Destination)',
                  type: 'datetime-local',
                  value: selectedTrain?.arrival_at ? selectedTrain.arrival_at.slice(0, 16).replace(' ', 'T') : undefined
                },
                { name: 'capacity', label: 'Cargo Capacity (cu units)', type: 'number', min: '0.001', step: '0.001', value: selectedTrain?.capacity }
              ]}
              button={edit ? 'Save Timetable Changes' : 'Schedule Train'}
              onSubmit={send(edit ? `/trains/${edit}` : '/trains', edit ? 'PUT' : 'POST')}
            />

            <div className="pt-2">
              <span className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1">Editable Trips:</span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className={`text-xs px-2.5 py-1 ${!edit ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}
                  onClick={() => setEdit('')}
                >
                  + New
                </button>
                {trains
                  .filter(t => t.status === 'SCHEDULED' && t.available_capacity === t.capacity)
                  .map(t => (
                    <button
                      key={t.id}
                      type="button"
                      className={`text-xs px-2.5 py-1 border ${
                        edit === String(t.id) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-300'
                      }`}
                      onClick={() => setEdit(String(t.id))}
                    >
                      Trip #{t.id} ({t.reference})
                    </button>
                  ))}
              </div>
            </div>
          </div>

          {/* Allocation & Dispatch Actions */}
          <div className="space-y-6">
            {/* Bin-Packing Allocation Form */}
            <div className="card space-y-3">
              <h2 className="text-base font-bold text-slate-900 mt-0">
                <span className="material-symbols-outlined text-blue-700 text-[18px]">rule</span>
                <span>Allocate Pending Order to Train</span>
              </h2>
              <p className="text-xs text-muted">
                Executes greedy bin-packing cursor loop in MySQL (<code className="font-mono text-[11px] bg-slate-100 px-1 py-0.5 rounded">sp_allocate_order</code>), splitting overflow across subsequent trains if needed.
              </p>
              <Form
                fields={[
                  {
                    name: 'order_id',
                    label: 'Pending Consignment Order',
                    options: orders
                      .filter(o => o.status === 'PENDING')
                      .map(o => ({ value: o.id, label: `Order #${o.id} | ${o.city} | ${o.total_space} cu space` }))
                  },
                  {
                    name: 'train_trip_id',
                    label: 'Available Scheduled Train',
                    options: options(trains.filter(t => t.status === 'SCHEDULED'), 'reference')
                  }
                ]}
                button="Allocate & Bin-Pack"
                onSubmit={send('/rail/allocate')}
              />
            </div>

            {/* Train Dispatch Form */}
            <div className="card space-y-3">
              <h2 className="text-base font-bold text-slate-900 mt-0">
                <span className="material-symbols-outlined text-blue-700 text-[18px]">speed</span>
                <span>Dispatch Scheduled Train</span>
              </h2>
              <Form
                fields={[
                  {
                    name: 'id',
                    label: 'Due Train for Mainline Departure',
                    options: options(trains.filter(t => t.status === 'SCHEDULED'), 'reference')
                  }
                ]}
                button="Dispatch to Mainline"
                onSubmit={b => send(`/trains/${b.id}/dispatch`)({})}
              />
            </div>
          </div>
        </section>
      )}

      {/* Manifest Registry & Regional Receipt */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900">
          <span className="material-symbols-outlined text-blue-700 text-[20px]">fact_check</span>
          <span>Manifest Allocations & Store Receiving</span>
        </h2>

        <Table rows={manifest} />

        {['ADMIN', 'STORE'].includes(user.role) && (
          <div className="card space-y-3 bg-gradient-to-b from-white to-slate-50/40">
            <h2 className="text-base font-bold text-slate-900 mt-0">
              <span className="material-symbols-outlined text-blue-700 text-[18px]">check_box</span>
              <span>Confirm Depot Receipt or Reconcile Shortages</span>
            </h2>
            <Form
              fields={[
                {
                  name: 'allocation_id',
                  label: 'Allocation Lot to Confirm',
                  options: manifest
                    .filter(a => a.train_status !== 'SCHEDULED')
                    .map(a => ({
                      value: a.id,
                      label: `#${a.id} | ${a.product} | ordered: ${a.quantity} | received: ${a.received_qty}`
                    }))
                },
                {
                  name: 'received_qty',
                  label: 'Cumulative Received Quantity for this Allocation',
                  type: 'number',
                  min: 0
                }
              ]}
              button="Confirm Depot Receipt"
              onSubmit={send('/rail/receive')}
            />
          </div>
        )}
      </section>
    </div>
  );
}
