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
  const markArrived = async id => {
    const result = await api(`/trains/${id}/arrive`, {
      method: 'POST'
    });

    await load();
    return result;
  };
  const selectedTrain = edit ? trains.find(t => t.id === Number(edit)) : null;

  if (user.role === 'STORE') {
    return <StoreRail
      trains={trains}
      manifest={manifest}
      orders={orders}
      loading={loading}
      error={error}
      onRefresh={load}
      onReceive={send('/rail/receive')}
      onArrive={markArrived}
    />;
  }

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
        <StatCard
          title="Active Trains"
          value={trains.length}
          subtitle={trains.length ? `${trains.length} on timetable` : 'None scheduled'}
          icon="train"
          color="blue"
        />
        <StatCard
          title="Scheduled Due"
          value={trains.filter(t => t.status === 'SCHEDULED').length}
          subtitle={
            trains.filter(t => t.status === 'SCHEDULED').length
              ? `${trains.filter(t => t.status === 'SCHEDULED').length} awaiting departure`
              : 'None pending departure'
          }
          icon="event_upcoming"
          color="amber"
        />
        <StatCard
          title="On Mainline"
          value={trains.filter(t => t.status === 'IN_TRANSIT').length}
          subtitle={
            trains.filter(t => t.status === 'IN_TRANSIT').length
              ? `${trains.filter(t => t.status === 'IN_TRANSIT').length} in transit to depots`
              : 'No trains on mainline'
          }
          icon="alt_route"
          color="teal"
        />
        <StatCard
          title="Manifest Items"
          value={manifest.length}
          subtitle={manifest.length ? `${manifest.length} cargo lots` : 'No cargo allocated'}
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
            departure: t.departure_at ? t.departure_at.replace('T', ' ').slice(0, 16) : '—',
            arrival: t.arrival_at ? t.arrival_at.replace('T', ' ').slice(0, 16) : '—',
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
                      className={`text-xs px-2.5 py-1 border ${edit === String(t.id) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-300'
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
                    options: trains
                      .filter(t => t.status === 'SCHEDULED')
                      .map(t => ({
                        value: t.id,
                        label: `${t.reference} · To: ${t.city} · Dept: ${t.departure_at ? t.departure_at.slice(0, 16).replace('T', ' ') : '—'} · Avail: ${Number(t.available_capacity).toFixed(2)} cu`
                      }))
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
                    options: trains
                      .filter(t => t.status === 'SCHEDULED')
                      .map(t => ({
                        value: t.id,
                        label: `${t.reference} · To: ${t.city} · Dept: ${t.departure_at ? t.departure_at.slice(0, 16).replace('T', ' ') : '—'}`
                      }))
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

        <Table
          rows={manifest.map(m => ({
            lot_id: `#${m.id}`,
            train: m.reference,
            train_status: m.train_status,
            order_id: `#${m.order_id}`,
            customer: m.customer,
            product: m.product,
            quantity: m.quantity,
            received_qty: m.received_qty != null ? m.received_qty : 0,
            status:
              m.train_status === 'SCHEDULED'
                ? 'SCHEDULED'
                : Number(m.received_qty) >= Number(m.quantity)
                  ? 'COMPLETED'
                  : Number(m.received_qty) > 0
                    ? 'ALLOCATED'
                    : m.train_status,
            arrival: m.arrival_at ? m.arrival_at.replace('T', ' ').slice(0, 16) : '—'
          }))}
        />

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
                      label: `Lot #${a.id} · ${a.product} (Order #${a.order_id}) · Train ${a.reference} · Ordered: ${a.quantity} · Received: ${a.received_qty || 0}`
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

// These labels and filters are only used by the store-manager view.
const trainChoices = [
  { value: 'ALL', label: 'All trains' },
  { value: 'ACTIVE', label: 'Scheduled and in transit' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'IN_TRANSIT', label: 'In transit' },
  { value: 'ARRIVED', label: 'Arrived' }
];
const orderChoices = [
  { value: 'ALL', label: 'All order statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'ALLOCATED', label: 'Assigned to a train' },
  { value: 'ON_TRAIN', label: 'On train' },
  { value: 'PARTIAL_AT_STORE', label: 'Partly at store' },
  { value: 'MISSING', label: 'Missing goods' },
  { value: 'AT_STORE', label: 'At store' },
  { value: 'SCHEDULED', label: 'Scheduled for road delivery' },
  { value: 'OUT_FOR_DELIVERY', label: 'Out for delivery' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'CANCELLED', label: 'Cancelled' }
];
const storeOrderGroups = [
  {
    value: 'ATTENTION', label: 'Needs attention',
    statuses: ['MISSING', 'PARTIAL_AT_STORE', 'AT_STORE'],
    description: 'Missing goods first, then partly received orders and orders at your store awaiting delivery planning.'
  },
  {
    value: 'INCOMING', label: 'Incoming orders',
    statuses: ['PENDING', 'ALLOCATED', 'ON_TRAIN'],
    description: 'Goods assigned to trains or on their way to your store. Select these goods below to record receipt after arrival.'
  },
  {
    value: 'DELIVERY', label: 'Delivery in progress',
    statuses: ['SCHEDULED', 'OUT_FOR_DELIVERY'],
    description: 'Orders scheduled for road delivery or already out for delivery.'
  },
  {
    value: 'DELIVERED', label: 'Delivered orders', statuses: ['DELIVERED'],
    description: 'Orders already delivered to customers.'
  },
  {
    value: 'ALL', label: 'All orders', statuses: [],
    description: 'All goods recorded on trains, including past orders.'
  }
];

function matchesTrain(status, filter) {
  return filter === 'ALL' || (filter === 'ACTIVE'
    ? status === 'SCHEDULED' || status === 'IN_TRANSIT'
    : status === filter);
}

function needsReceipt(row) {
  return Number(row.received_qty || 0) < Number(row.quantity);
}

function receiptLabel(row) {
  if (!needsReceipt(row)) return 'Fully received';
  if (Number(row.receipt_checked)) return 'Missing goods';
  if (Number(row.received_qty || 0) > 0) return 'Partly received';
  return 'Not received';
}

function displayDate(value) {
  return value ? value.replace('T', ' ').slice(0, 16) : '—';
}

function RailFilter({ id, label, value, onChange, choices }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={event => onChange(event.target.value)}>
        {choices.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
      </select>
    </div>
  );
}

function StoreRail({ trains, manifest, orders, loading, error, onRefresh, onReceive, onArrive }) {
  const [trainFilter, setTrainFilter] = useState('ACTIVE');
  const [orderFilter, setOrderFilter] = useState('ATTENTION');
  const inTransitTrains = trains.filter(
    train => train.status === 'IN_TRANSIT'
  );

  const orderStatuses = new Map(orders.map(order => [Number(order.id), order.status]));
  // Sum the actual assigned goods, not the train's total or available capacity.
  // Keep the full assigned load even after receipt so history remains meaningful.
  const goodsSpace = new Map();
  for (const row of manifest) {
    const trainId = Number(row.train_trip_id);
    goodsSpace.set(trainId, (goodsSpace.get(trainId) || 0) + Number(row.space_used));
  }
  const visibleTrains = trains.filter(train => matchesTrain(train.status, trainFilter));
  const selectedGroup = storeOrderGroups.find(group => group.value === orderFilter);
  // Filter by the whole order's status, keeping all its product rows together.
  const visibleGoods = manifest.filter(row => orderFilter === 'ALL' ||
    selectedGroup.statuses.includes(orderStatuses.get(Number(row.order_id))));
  if (orderFilter === 'ATTENTION') {
    visibleGoods.sort((a, b) =>
      selectedGroup.statuses.indexOf(orderStatuses.get(Number(a.order_id))) -
      selectedGroup.statuses.indexOf(orderStatuses.get(Number(b.order_id))) ||
      Number(b.order_id) - Number(a.order_id));
  }
  // Preserve the existing receiving rules; the backend validates arrival time
  // and cumulative quantities. Table filters never change receipt eligibility.
  const receivable = manifest.filter(
    row => row.train_status === 'ARRIVED'
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200/80 gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Store Trains</h1>
        <button type="button" onClick={onRefresh} disabled={loading}
          className="flex items-center gap-1.5 self-start sm:self-auto text-xs">
          <span className="material-symbols-outlined text-[16px]">refresh</span>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && <div role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">{error}</div>}
      {loading && <p role="status" className="text-sm text-muted">Loading train and goods details…</p>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard title="Total Train Trips" value={trains.length}
          subtitle="All trips to your store, including past trips" icon="train" color="blue" />
        <StatCard title="Scheduled Trains" value={trains.filter(train => train.status === 'SCHEDULED').length}
          subtitle="Trips not yet marked as departed" icon="event_upcoming" color="amber" />
        <StatCard title="In Transit" value={trains.filter(train => train.status === 'IN_TRANSIT').length}
          subtitle="Departed trips with receipts still to check" icon="alt_route" color="teal" />
        <StatCard title="Goods to Receive" value={manifest.filter(needsReceipt).length}
          subtitle="Product rows not yet fully received" icon="inventory_2" color="emerald" />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">Train Trips</h2>
        <div className="max-w-sm">
          <RailFilter id="store-train-filter" label="Train status" value={trainFilter}
            onChange={setTrainFilter} choices={trainChoices} />
        </div>
        <p className="text-xs text-muted">
          Goods space is the total space occupied by goods assigned to your store on each trip, in capacity units.
        </p>
        {visibleTrains.length ? (
          <Table key={`trains-${trainFilter}-${visibleTrains.map(train => train.id).join(',')}`}
            rows={visibleTrains.map(train => ({
              train_reference: train.reference,
              scheduled_departure: displayDate(train.departure_at),
              scheduled_arrival: displayDate(train.arrival_at),
              actual_arrival: displayDate(train.actual_arrival_at),
              train_status: train.status,
              goods_space: (goodsSpace.get(Number(train.id)) || 0).toFixed(3)
            }))} />
        ) : !loading && <p className="card text-sm text-muted">No train trips match this filter.</p>}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">Goods and Receiving</h2>
        <div className="max-w-sm">
          <RailFilter id="store-order-filter" label="Orders to show" value={orderFilter}
            onChange={setOrderFilter} choices={storeOrderGroups} />
        </div>
        <p className="text-xs text-muted">{selectedGroup.description}</p>
        {visibleGoods.length ? (
          <Table key={`goods-${orderFilter}-${visibleGoods.map(row => row.id).join(',')}`}
            rows={visibleGoods.map(row => ({
              train_reference: row.reference,
              train_status: row.train_status,
              order_id: `#${row.order_id}`,
              order_status: orderChoices.find(choice => choice.value === orderStatuses.get(Number(row.order_id)))?.label || 'Unknown',
              customer: row.customer,
              product: row.product,
              expected_quantity: row.quantity,
              received_so_far: row.received_qty || 0,
              still_to_receive: Math.max(0, Number(row.quantity) - Number(row.received_qty || 0)),
              receipt: receiptLabel(row),
              scheduled_arrival: displayDate(row.arrival_at)
            }))} />
        ) : !loading && (
          <p className="card text-sm text-muted">
            No goods match this order group. Choose “Incoming orders” to check expected goods, or “All orders” to see past records.
          </p>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="text-base font-bold text-slate-900 mt-0">
          Confirm Train Arrival
        </h2>

        <p className="text-xs text-muted">
          Confirm a train only when it has physically reached this store.
          The actual arrival time will be recorded automatically.
        </p>

        {inTransitTrains.length ? (
          <div className="space-y-2">
            {inTransitTrains.map(train => (
              <div
                key={train.id}
                className="flex items-center justify-between gap-4 border border-slate-200 rounded-lg p-3"
              >
                <div>
                  <p className="font-semibold text-slate-900">
                    {train.reference}
                  </p>

                  <p className="text-xs text-muted">
                    Scheduled arrival: {displayDate(train.arrival_at)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onArrive(train.id)}
                >
                  Mark Train Arrived
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">
            No trains are currently in transit to this store.
          </p>
        )}
      </section>

      <section className="card space-y-3 bg-gradient-to-b from-white to-slate-50/40">
        <h2 className="text-base font-bold text-slate-900 mt-0">Record Received Goods</h2>
        <p className="text-xs text-muted">
          Select the product and train, then enter the total received so far. If you recorded 8 and later receive 2 more, enter 10.
          You can save received quantities only after the train has been confirmed as arrived at this store.
        </p>
        {receivable.length ? (
          <Form fields={[
            {
              name: 'allocation_id',
              label: 'Goods to update',
              options: receivable.map(row => ({
                value: row.id,
                label: `Order #${row.order_id} · ${row.product} · Train ${row.reference} · Expected: ${row.quantity} · Received: ${row.received_qty || 0}`
              }))
            },
            {
              name: 'received_qty',
              label: 'Total received so far',
              type: 'number',
              min: 0,
              step: 1
            }
          ]} button="Save Received Quantity" onSubmit={onReceive} />
        ) : !loading && <p className="text-sm text-muted">There are no goods on dispatched trains to update yet.</p>}
      </section>
    </div>
  );
}
