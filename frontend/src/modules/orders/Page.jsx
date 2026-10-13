import { useEffect, useState } from 'react';
import { api } from '../../api';
import { Table, Form, options, Banner, StatusBadge, Stepper, StatCard } from '../../components/UI';

export const roles = ['CUSTOMER', 'ADMIN', 'FACTORY', 'STORE'];
export const label = 'Orders';
export const order = 20;

const orderStatuses = [
  { value: 'ALL', label: 'All' },
  { value: 'AT_STORE', label: 'At Store' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'OUT_FOR_DELIVERY', label: 'Out for Delivery' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'ALLOCATED', label: 'Allocated' },
  { value: 'ON_TRAIN', label: 'On Train' },
  { value: 'PARTIAL_AT_STORE', label: 'Partly Received' },
  { value: 'MISSING', label: 'Missing Items' },
  { value: 'CANCELLED', label: 'Cancelled' }
];

function StoreOrderLookup({ orders, onLookup }) {
  const [id, setId] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState({ text: '', isError: false });
  const selectedId = orders.some(o => String(o.id) === id) ? id : '';

  return (
    <form className="space-y-3" onSubmit={async e => {
      e.preventDefault();
      const orderId = Number(id);
      if (!Number.isSafeInteger(orderId) || orderId < 1) {
        setFeedback({ text: 'Enter a positive whole-number order ID.', isError: true });
        return;
      }
      setBusy(true);
      setFeedback({ text: '', isError: false });
      try {
        await onLookup(orderId);
        setFeedback({ text: `Order #${orderId} loaded.`, isError: false });
      } catch (error) {
        setFeedback({ text: error.message || 'Unable to load this order.', isError: true });
      } finally {
        setBusy(false);
      }
    }}>
      <p className="text-xs text-muted">
        Choose an order or type its ID. Searching by ID also works outside the date and status filters.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label htmlFor="store-order-choice">Choose an order</label>
          <select id="store-order-choice" value={selectedId} disabled={busy}
            onChange={e => setId(e.target.value)}>
            <option value="">Choose an order...</option>
            {orders.map(o => (
              <option key={o.id} value={o.id}>
                #{o.id} · {o.customer || o.city} · {orderStatuses.find(s => s.value === o.status)?.label || o.status} · Due: {o.delivery_date}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="store-order-id">Order ID</label>
          <input id="store-order-id" name="order_id" type="number" min="1" step="1"
            placeholder="For example, 30" required value={id} disabled={busy}
            onChange={e => setId(e.target.value)} />
        </div>
      </div>
      <button type="submit" disabled={busy}>{busy ? 'Loading order...' : 'View order'}</button>
      {feedback.text && (
        <p role={feedback.isError ? 'alert' : 'status'}
          className={`rounded-lg border p-3 text-xs font-medium ${feedback.isError
            ? 'border-rose-200 bg-rose-50 text-rose-800'
            : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
          {feedback.text}
        </p>
      )}
    </form>
  );
}

export default function Page({ user }) {
  const isStore = user.role === 'STORE';
  const [products, setProducts] = useState([]),
    [routes, setRoutes] = useState([]),
    [orders, setOrders] = useState([]);
  const [cart, setCart] = useState([]),
    [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true),
    [errors, setErrors] = useState({});
  const [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [search, setSearch] = useState('');
  const [edit, setEdit] = useState(null);
  const [statusFilter, setStatusFilter] = useState(isStore ? 'AT_STORE' : 'ALL');
  const [appliedDates, setAppliedDates] = useState({ from: '', to: '' });

  async function load(dateFrom = from, dateTo = to) {
    if (isStore && dateFrom && dateTo && dateFrom > dateTo) {
      setErrors({ history: 'The From date must be on or before the To date.' });
      return;
    }
    setLoading(true);
    setErrors({});
    const requests = [
      ['history', `/orders?from=${dateFrom}&to=${dateTo}`, data => {
        // Apply both date bounds to the store's order list, including the final day.
        setOrders(isStore ? data.filter(o => {
          const placed = o.placed_at?.slice(0, 10);
          return (!dateFrom || placed >= dateFrom) && (!dateTo || placed <= dateTo);
        }) : data);
        setAppliedDates({ from: dateFrom, to: dateTo });
      }]
    ];
    if (!isStore) requests.unshift(
      ['products', '/products', setProducts],
      ['coverage', '/directory', d => setRoutes(d.routes)]
    );
    await Promise.all(requests.map(async ([section, path, update]) => {
      try {
        update(await api(path));
      } catch (e) {
        setErrors(old => ({ ...old, [section]: e.message }));
      }
    }));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const save = async (url, body, method = 'POST') => {
    const r = await api(url, { method, body });
    await load();
    return r;
  };

  const minDeliveryDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });
  })();

  const visibleProducts = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const pendingCount = orders.filter(o => o.status === 'PENDING').length;
  const transitCount = orders.filter(o =>
    ['ALLOCATED', 'ON_TRAIN', 'AT_STORE', 'SCHEDULED', 'OUT_FOR_DELIVERY'].includes(o.status)
  ).length;
  const deliveredCount = orders.filter(o => o.status === 'DELIVERED').length;
  const atStoreCount = orders.filter(o => o.status === 'AT_STORE').length;
  const outForDeliveryCount = orders.filter(o => o.status === 'OUT_FOR_DELIVERY').length;
  const visibleOrders = isStore && statusFilter !== 'ALL'
    ? orders.filter(o => o.status === statusFilter)
    : orders;
  const selectedStatus = orderStatuses.find(s => s.value === statusFilter)?.label || statusFilter;

  const detailTotal = detail?.items?.reduce(
    (sum, item) => sum + Number(item.line_total ?? (Number(item.quantity) * Number(item.unit_price))),
    0
  ) || Number(detail?.order?.total_value) || 0;

  return (
    <div className="space-y-6">
      {/* Context Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200/80 gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {user.role === 'CUSTOMER'
              ? 'Your Orders & Consignments'
              : user.role === 'STORE'
              ? 'Store Orders'
              : 'Shipments & Order Management'}
          </h1>
          {!isStore && <p className="text-xs text-muted mt-0.5">
            {user.role === 'CUSTOMER'
              ? 'Browse catalog products, place advance delivery orders, and track your active consignments.'
              : user.role === 'FACTORY'
              ? 'Manage catalog product specifications, plan advance dispatch volumes, and track consignment lifecycles.'
              : 'Manage product catalogs, oversee intermodal network dispatches, and audit consignment lifecycles.'}
          </p>}
        </div>
        <button
          type="button"
          onClick={() => load()}
          disabled={loading}
          className="flex items-center gap-1.5 self-start sm:self-auto text-xs"
        >
          <span className="material-symbols-outlined text-[16px]">refresh</span>
          <span>{loading ? 'Refreshing…' : isStore ? 'Refresh' : 'Refresh Data'}</span>
        </button>
      </div>

      {/* KPI Metric Overview Strip */}
      {isStore ? (
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard title="Total Orders" value={loading || errors.history ? '—' : orders.length}
              subtitle="All orders for your store" icon="inventory_2" color="blue" />
            <StatCard title="At Store" value={loading || errors.history ? '—' : atStoreCount}
              subtitle="Ready to schedule for delivery" icon="warehouse" color="amber" />
            <StatCard title="Out for Delivery" value={loading || errors.history ? '—' : outForDeliveryCount}
              subtitle="Currently on a delivery truck" icon="local_shipping" color="teal" />
            <StatCard title="Delivered" value={loading || errors.history ? '—' : deliveredCount}
              subtitle="Successfully delivered to customers" icon="task_alt" color="emerald" />
          </div>
          <p className="text-xs text-muted">
            {appliedDates.from && appliedDates.to
              ? `Counts cover orders placed from ${appliedDates.from} through ${appliedDates.to}.`
              : appliedDates.from
              ? `Counts cover orders placed on or after ${appliedDates.from}.`
              : appliedDates.to
              ? `Counts cover orders placed on or before ${appliedDates.to}.`
              : 'Counts cover all dates.'} The status filter below only changes the order list.
          </p>
        </div>
      ) : (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          title={user.role === 'CUSTOMER' ? 'Your Orders' : user.role === 'STORE' ? 'Depot Consignments' : 'Total Consignments'}
          value={orders.length}
          subtitle={orders.length ? `${orders.length} recorded` : 'No orders recorded'}
          icon="inventory_2"
          color="blue"
        />
        <StatCard
          title="Pending Allocation"
          value={pendingCount}
          subtitle={pendingCount ? `${pendingCount} awaiting dispatch` : 'None pending'}
          icon="hourglass_top"
          color="amber"
        />
        <StatCard
          title={user.role === 'CUSTOMER' ? 'In Transit' : 'In-Transit Pipe'}
          value={transitCount}
          subtitle={transitCount ? `${transitCount} in delivery network` : 'None in transit'}
          icon="local_shipping"
          color="teal"
        />
        <StatCard
          title={user.role === 'CUSTOMER' ? 'Delivered' : 'Delivered Final'}
          value={deliveredCount}
          subtitle={deliveredCount ? `${deliveredCount} completed` : 'None delivered yet'}
          icon="task_alt"
          color="emerald"
        />
      </div>
      )}

      {/* Product Catalog Section */}
      {!isStore && (
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-slate-900">
            <span className="material-symbols-outlined text-blue-700 text-[20px]">category</span>
            <span>Product Catalog & Space Specifications</span>
          </h2>
          <div className="w-full sm:w-72">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search products by name…"
              className="text-xs"
            />
          </div>
        </div>

        {errors.products && <p role="alert" className="text-xs text-rose-600 font-medium">Unable to load products: {errors.products}</p>}

        {loading ? (
          <p className="text-xs text-muted">Loading products…</p>
        ) : !errors.products && (
          products.length === 0 ? (
            <Banner type="warning">No products are currently available in the catalog.</Banner>
          ) : visibleProducts.length ? (
            <Table
              rows={visibleProducts.map(p => {
                const row = {
                  id: p.id,
                  name: p.name,
                  unit_price: p.unit_price,
                  space_rate: p.space_rate
                };
                if (user.role !== 'CUSTOMER') row.active = p.active;
                return row;
              })}
            />
          ) : (
            <p className="text-xs text-muted">No products match &ldquo;{search}&rdquo;.</p>
          )
        )}

        {/* Staff Catalog Operations */}
        {['ADMIN', 'FACTORY'].includes(user.role) && (() => {
          const selectedProduct = edit ? products.find(p => p.id === Number(edit)) : null;
          return (
            <details className="mt-3 group">
              <summary className="text-xs font-semibold text-blue-700 cursor-pointer hover:underline list-none flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px] transition-transform group-open:rotate-90">chevron_right</span>
                <span>Catalog Maintenance (Add, Edit, Retire)</span>
              </summary>
              <div className="p-4 mt-2 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
                <h3>{edit ? `Edit Product #${edit}` : 'Add New Product'}</h3>
                <Form
                  key={edit || 'new'}
                  fields={[
                    { name: 'name', label: 'Product name', value: selectedProduct?.name },
                    { name: 'unit_price', label: 'Unit price (LKR)', type: 'number', step: '0.01', min: '0.01', value: selectedProduct?.unit_price },
                    { name: 'space_rate', label: 'Space rate (cu/unit)', type: 'number', step: '0.001', min: '0.001', value: selectedProduct?.space_rate }
                  ]}
                  button={edit ? 'Save Product Changes' : 'Create Product'}
                  onSubmit={b => save(edit ? `/products/${edit}` : '/products', b, edit ? 'PUT' : 'POST')}
                />
                <div className="flex flex-wrap gap-2 pt-2">
                  <button type="button" className="text-xs bg-slate-200 text-slate-700 hover:bg-slate-300" onClick={() => setEdit(null)}>
                    + New Product
                  </button>
                  {products.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                        edit === p.id ? 'bg-blue-600 text-white border-blue-600 font-semibold' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                      onClick={() => setEdit(p.id)}
                    >
                      Edit #{p.id} ({p.name})
                    </button>
                  ))}
                </div>

                <h3>Retire Product</h3>
                <Form
                  fields={[
                    {
                      name: 'id',
                      label: 'Select product to retire',
                      options: products
                        .filter(p => p.active !== false)
                        .map(p => ({
                          value: p.id,
                          label: `#${p.id} · ${p.name} (LKR ${p.unit_price})`
                        }))
                    }
                  ]}
                  button="Retire Product"
                  onSubmit={b => save(`/products/${b.id}`, { ...products.find(p => p.id === Number(b.id)), active: false }, 'PUT')}
                />
              </div>
            </details>
          );
        })()}
      </section>
      )}

      {/* Customer Ordering Workflow */}
      {user.role === 'CUSTOMER' && (
        <section className="card space-y-4 bg-gradient-to-b from-white to-slate-50/40">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-lg font-bold text-slate-900 mt-0">
              <span className="material-symbols-outlined text-blue-700 text-[20px]">shopping_cart</span>
              <span>Place Advance Consignment Order</span>
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Consignments originate at the Kandy Central Factory. Mandatory minimum lead time is 7 calendar days.
            </p>
          </div>

          <Banner type="info">
            All orders require delivery dates scheduled at least 7 calendar days from today. Choose your local delivery coverage zone carefully.
          </Banner>

          <fieldset disabled={loading || !!errors.products || products.length === 0} className="space-y-3">
            <h3>Step 1: Add Products to Cart</h3>
            <Form
              button="Add to Cart"
              fields={[
                { name: 'product_id', label: 'Product', options: options(products) },
                { name: 'quantity', label: 'Quantity', type: 'number', min: 1, max: 100000 }
              ]}
              onSubmit={async b => {
                const id = Number(b.product_id),
                  q = Number(b.quantity);
                setCart(old =>
                  old.some(i => i.product_id === id)
                    ? old.map(i => (i.product_id === id ? { ...i, quantity: i.quantity + q } : i))
                    : [...old, { product_id: id, quantity: q }]
                );
                return { message: 'Item added to order' };
              }}
            />
          </fieldset>

          {cart.length > 0 && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <h3>Order Items ({cart.length})</h3>
                <button
                  type="button"
                  className="text-xs bg-slate-100 text-rose-700 hover:bg-rose-50 border border-slate-200"
                  onClick={() => setCart([])}
                >
                  Clear Cart
                </button>
              </div>
              <Table
                rows={cart.map(i => {
                  const prod = products.find(p => p.id === i.product_id);
                  return {
                    product_id: i.product_id,
                    product: prod?.name || `#${i.product_id}`,
                    quantity: i.quantity,
                    unit_price: prod?.unit_price || 0,
                    estimated_lkr: (prod?.unit_price || 0) * i.quantity
                  };
                })}
              />

              <div className="pt-3">
                <h3>Step 2: Destination & Delivery Date</h3>
                <fieldset disabled={loading || !!errors.coverage || routes.length === 0}>
                  <Form
                    button="Confirm & Place Order"
                    fields={[
                      {
                        name: 'route_id',
                        label: 'Delivery area (Select the area containing your address)',
                        options: routes.map(r => ({ value: r.id, label: `${r.city} | ${r.coverage_area}` }))
                      },
                      { name: 'address', label: 'Delivery address' },
                      {
                        name: 'delivery_date',
                        label: 'Requested delivery date (≥ 7 days ahead)',
                        type: 'date',
                        min: minDeliveryDate
                      },
                      { name: 'instructions', label: 'Special delivery instructions', optional: true }
                    ]}
                    onSubmit={async b => {
                      const r = await save('/orders', { ...b, items: cart });
                      setCart([]);
                      return { message: `Order #${r.id} successfully placed! You can track its fulfillment status below.` };
                    }}
                  />
                </fieldset>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Order History & Registry */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900">
            <span className="material-symbols-outlined text-blue-700 text-[20px]">manage_search</span>
            <span>{isStore ? 'Order list' : 'Consignment History & Tracking Registry'}</span>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {isStore && (
              <div className="flex items-center gap-1.5 text-xs">
                <label htmlFor="store-order-status" className="mb-0 normal-case tracking-normal">Status:</label>
                <select id="store-order-status" value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)} className="w-auto py-1 text-xs mt-0">
                  {orderStatuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <label htmlFor="order-date-from" className="mb-0 normal-case tracking-normal">From:</label>
              <input id="order-date-from" type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-auto py-1 text-xs" />
              <label htmlFor="order-date-to" className="mb-0 normal-case tracking-normal">To:</label>
              <input id="order-date-to" type="date" value={to} onChange={e => setTo(e.target.value)} className="w-auto py-1 text-xs" />
            </div>
            <button type="button" onClick={() => load()} disabled={loading} className="text-xs py-1.5 px-3">
              Filter
            </button>
            {isStore && (
              <button type="button" disabled={loading} className="text-xs py-1.5 px-3 bg-slate-200 text-slate-800 hover:bg-slate-300"
                onClick={() => { setFrom(''); setTo(''); load('', ''); }}>
                Clear dates
              </button>
            )}
          </div>
        </div>

        {isStore && <p className="text-xs text-muted">Dates filter when orders were placed. Choose a status to update the list immediately.</p>}
        {errors.history && <p role="alert" className="text-xs text-rose-600 font-medium">Unable to load orders: {errors.history}</p>}

        {loading ? (
          <p className="text-xs text-muted">{isStore ? 'Loading orders…' : 'Loading order registry…'}</p>
        ) : isStore && errors.history ? null : isStore && visibleOrders.length === 0 ? (
          <Banner>
            {statusFilter === 'ALL' ? 'No orders match these filters.' : `No orders with status "${selectedStatus}" match these filters.`} Try another status or clear the dates.
          </Banner>
        ) : (
          <Table
            key={isStore ? `${statusFilter}:${orders.map(o => o.id).join(',')}` : 'history'}
            rows={visibleOrders.map(o => {
              const row = { id: o.id };
              if (user.role !== 'CUSTOMER') row.customer = o.customer || user.name;
              return {
                ...row,
                city: o.city,
                route: o.route,
                delivery_address: o.address,
                placed_at: o.placed_at?.slice(0, 10),
                delivery_date: o.delivery_date,
                status: o.status,
                value_LKR: o.total_value
};
            })}
            pageSize={10}
          />
        )}
      </section>

      {/* Customer Quick Cancellation Box */}
      {user.role === 'CUSTOMER' && orders.some(o => o.status === 'PENDING') && (
        <section className="p-4 rounded-xl bg-amber-50/70 border border-amber-200/80 space-y-2">
          <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
            <span className="material-symbols-outlined text-[18px]">cancel</span>
            <span>Cancel a Pending Order</span>
          </div>
          <p className="text-xs text-amber-800">
            Orders can only be cancelled while strictly in PENDING status before train departure allocation.
          </p>
          <Form
            button="Cancel Selected Order"
            fields={[
              {
                name: 'id',
                label: 'Choose pending order',
                options: orders
                  .filter(o => o.status === 'PENDING')
                  .map(o => ({ value: o.id, label: `Order #${o.id} · Due: ${o.delivery_date} · LKR ${o.total_value}` }))
              }
            ]}
            onSubmit={async b => save(`/orders/${b.id}/cancel`, {})}
          />
        </section>
      )}

      {/* Interactive Order Inspection Drawer */}
      <section className="card space-y-4">
        <h2 className="text-lg font-bold text-slate-900 mt-0">
          <span className="material-symbols-outlined text-blue-700 text-[20px]">find_in_page</span>
          <span>{isStore ? 'Find an order' : 'Inspect Order Lifecycle & Consignment Manifest'}</span>
        </h2>

        {isStore ? (
          <StoreOrderLookup orders={orders} onLookup={async id => {
            setDetail(null);
            setDetail(await api('/orders/' + id));
          }} />
        ) : (
        <Form
          button="Inspect Consignment"
          fields={[
            {
              name: 'id',
              label: 'Select an order',
              options: orders.map(o => ({
                value: o.id,
                label: `#${o.id} · ${o.customer ? o.customer + ' · ' : ''}${o.city} · ${o.status} · Due: ${o.delivery_date}`
              }))
            }
          ]}
          onSubmit={async b => {
            const data = await api('/orders/' + b.id);
            setDetail(data);
            return { message: `Order #${b.id} manifest loaded` };
          }}
        />
        )}

        {detail && (
          <div className="space-y-4 pt-2">
            {/* 7-Stage Visual Lifecycle Stepper */}
            <Stepper currentStatus={detail.order?.status} />

            {/* Consignment Overview Strip */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-muted font-medium uppercase tracking-wider block">{isStore ? 'Order ID' : 'ID'}</span>
                <span className="font-bold text-slate-900 font-mono text-sm mt-0.5 block">#KP-{detail.order.id}</span>
              </div>
              <div>
                <span className="text-muted font-medium uppercase tracking-wider block">{isStore ? 'Delivery date' : 'Target Delivery'}</span>
                <span className="font-semibold text-slate-900 mt-0.5 block">{detail.order.delivery_date}</span>
              </div>
              <div>
                <span className="text-muted font-medium uppercase tracking-wider block">{isStore ? 'Delivery area' : 'Destination route'}</span>
                <span className="font-semibold text-slate-900 mt-0.5 block">{detail.order.city} · {detail.order.route}</span>
              </div>
              <div className="col-span-2 sm:col-span-4 pt-3 border-t border-slate-200">
                <span className="text-muted font-medium uppercase tracking-wider block">
                   Delivery Address
                </span>

                <div className="flex items-start gap-2 mt-1">
                  <span className="material-symbols-outlined text-blue-600 text-[18px]">
                     location_on
                  </span>

                  <span className="font-semibold text-slate-900 text-sm">
                    {detail.order.address}
                  </span>
                </div>
              </div>
              <div>
                <span className="text-muted font-medium uppercase tracking-wider block">{isStore ? 'Order total' : 'Order Total'}</span>
                <span className="font-bold text-slate-900 tabular-nums text-sm mt-0.5 block">
                  LKR {detailTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

            </div>

            {/* Order Items Table */}
            <div>
              <h3 className="text-sm font-bold text-slate-800 mb-2">{isStore ? 'Items in this order' : 'Ordered items'}</h3>
              <Table
                rows={detail.items.map(item => ({
                  product: item.name,
                  quantity: item.quantity,
                  unit_price: item.unit_price,
                  line_total: item.line_total ?? (Number(item.quantity) * Number(item.unit_price))
                }))}
              />
            </div>

            {/* Cancellation Option inside Inspection */}
            {detail.order?.status === 'PENDING' && (user.role === 'CUSTOMER' || user.role === 'ADMIN') && (
              <div className="pt-2">
                <button
                  type="button"
                  className="bg-rose-600 hover:bg-rose-700 text-white px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                  onClick={async () => {
                    await save(`/orders/${detail.order.id}/cancel`, {});
                    setDetail(null);
                  }}
                >
                  <span className="material-symbols-outlined text-[16px]">cancel</span>
                  <span>Cancel Order #{detail.order.id}</span>
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
