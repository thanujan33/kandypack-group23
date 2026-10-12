import { useState, useEffect } from 'react';
import { api } from '../../api';
import { Form, Table, Banner } from '../../components/UI';

export const roles = ['ADMIN', 'FACTORY', 'CUSTOMER'];
export const label = 'Reports';
export const order = 50;

const REPORT_ICONS = {
  quarterly: 'trending_up',
  products: 'inventory_2',
  locations: 'pin_drop',
  hours: 'more_time',
  trucks: 'local_shipping',
  history: 'history',
  audit: 'security'
};

export default function Page({ user }) {
  const customer = user.role === 'CUSTOMER';
  const [report, setReport] = useState(customer ? 'history' : 'quarterly'),
    [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const reports = customer
    ? ['history']
    : ['quarterly', 'products', 'locations', 'hours', 'trucks', 'history', ...(user.role === 'ADMIN' ? ['audit'] : [])];

  useEffect(() => {
    if (customer) {
      setLoading(true);
      api('/reports/history')
        .then(setRows)
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [customer]);

  const labels = {
    quarterly: 'Quarterly Sales Revenue',
    products: 'Most Ordered Products',
    locations: 'City & Route Sales',
    hours: 'Staff Weekly Hours & Rosters',
    trucks: 'Monthly Truck Utilization',
    history: 'Customer Order History',
    audit: 'Database Security Audit Trail'
  };

  const now = new Date(),
    date = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });

  function getFormattedRows() {
    if (!rows.length) return [];
    if (report === 'history') {
      return rows.map(r => {
        const itemsText = Array.isArray(r.items)
          ? r.items.map(i => `${i.product} (×${i.quantity})`).join(', ')
          : typeof r.items === 'string' && r.items ? r.items : '—';

        return {
          order_id: r.id,
          placed_at: r.placed_at ? r.placed_at.slice(0, 10) : '—',
          delivery_date: r.delivery_date,
          status: r.status,
          destination: `${r.city} (${r.route})`,
          items: itemsText,
          total_units: r.total_quantity,
          total_value_LKR: r.total_value
        };
      });
    }
    if (report === 'locations') {
      return rows.map(r => ({
        level: r.level,
        city: r.city,
        route: r.level === 'ROUTE' ? (r.route || `#${r.route_id}`) : '— (All Routes)',
        units_sold: r.units,
        sales_LKR: r.sales_LKR
      }));
    }
    if (report === 'products') {
      return rows.map(r => ({
        product_code: `#${r.product_id}`,
        product_name: r.product,
        order_count: r.order_count,
        units_sold: r.units,
        revenue_LKR: r.sales_LKR
      }));
    }
    if (report === 'quarterly') {
      return rows.map(r => ({
        calendar_month: r.month,
        orders_placed: r.orders,
        units_delivered: r.units,
        volume_cu: Number(r.space_units || 0).toFixed(2),
        revenue_LKR: r.sales_LKR
      }));
    }
    if (report === 'hours') {
      return rows.map(r => ({
        employee_id: `#${r.id}`,
        name: r.name,
        role: r.role,
        depot_city: r.city,
        completed_hours: Number(r.actual_hours || 0).toFixed(1),
        reserved_hours: Number(r.reserved_hours || 0).toFixed(1),
        weekly_limit: Number(r.weekly_limit || 0).toFixed(1),
        overtime_hours: Number(r.excess_hours || 0).toFixed(1)
      }));
    }
    if (report === 'trucks') {
      return rows.map(r => ({
        truck_id: `#${r.id}`,
        plate: r.plate,
        depot_city: r.city,
        completed_trips: r.completed_trips,
        logged_hours: Number(r.actual_hours || 0).toFixed(1),
        capacity_hours: `${r.assumed_available_hours} hrs`,
        utilization_rate: `${Number(r.utilization_percent || 0).toFixed(1)}%`
      }));
    }
    if (report === 'audit') {
      return rows.map(r => ({
        audit_id: `#${r.id}`,
        actor: r.actor_id != null ? `#${r.actor_id}` : 'System Trigger',
        timestamp: r.changed_at ? r.changed_at.replace('T', ' ').slice(0, 19) : '—',
        entity: r.entity,
        action: r.action,
        details:
          r.action === 'INSERT'
            ? typeof r.new_values === 'string'
              ? r.new_values
              : JSON.stringify(r.new_values || {})
            : r.action === 'DELETE'
            ? typeof r.old_values === 'string'
              ? r.old_values
              : JSON.stringify(r.old_values || {})
            : typeof r.new_values === 'string'
            ? r.new_values
            : JSON.stringify(r.new_values || {})
      }));
    }
    return rows;
  }

  function csv() {
    const formatted = getFormattedRows();
    if (!formatted.length) return;
    const keys = Object.keys(formatted[0]);
    const quote = value => {
      let s = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
      if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
      return '"' + s.replaceAll('"', '""') + '"';
    };
    const output = [keys, ...formatted.map(r => keys.map(k => r[k]))].map(row => row.map(quote).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\ufeff' + output], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `kandypack-${report}-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  let fields = [];
  if (['quarterly', 'products', 'locations'].includes(report))
    fields = [
      { name: 'year', label: 'Fiscal Year', type: 'number', value: now.getFullYear(), min: 2000, max: 2100 },
      { name: 'quarter', label: 'Calendar Quarter (1–4)', type: 'number', value: Math.floor(now.getMonth() / 3) + 1, min: 1, max: 4 }
    ];
  if (report === 'hours') fields = [{ name: 'week', label: 'Week Containing Date', type: 'date', value: date }];
  if (report === 'trucks') fields = [{ name: 'month', label: 'Billing Month (YYYY-MM)', type: 'month', value: date.slice(0, 7) }];
  if (report === 'history' && !customer) fields = [{ name: 'customer_id', label: 'Customer Account ID', type: 'number', min: 1 }];

  const metric =
    report === 'products'
      ? 'units'
      : report === 'trucks'
      ? 'actual_hours'
      : report === 'hours'
      ? 'actual_hours'
      : 'sales_LKR';

  const chartRows = report === 'locations' ? rows.filter(r => r.level === 'CITY') : rows;
  const maximum = Math.max(1, ...chartRows.map(r => Number(r[metric]) || 0));

  return (
    <div className="space-y-6">
      {/* Header Context */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200/80 gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {customer ? 'Order History & Delivery Statements' : 'Analytics, Reporting & Audit Logs'}
          </h1>
          <p className="text-xs text-muted mt-0.5">
            {customer
              ? 'Historical archive of your past consignments, manifest items, and delivery records.'
              : 'Database views, quarterly sales aggregation, fleet utilization, and immutable audit logs.'}
          </p>
        </div>
        {rows.length > 0 && (
          <div className="flex items-center gap-2 print:hidden self-start sm:self-auto">
            <button
              type="button"
              onClick={csv}
              className="bg-white text-slate-700 hover:bg-slate-50 border border-slate-300 text-xs flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px] text-emerald-600">ios_share</span>
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="bg-white text-slate-700 hover:bg-slate-50 border border-slate-300 text-xs flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px] text-blue-600">print</span>
              <span>Print / PDF</span>
            </button>
          </div>
        )}
      </div>

      {/* Report Selector Pills (Staff Multi-Report Switcher) */}
      {reports.length > 1 && (
        <div className="flex flex-wrap gap-1.5 p-1.5 rounded-xl bg-slate-100 border border-slate-200/80 print:hidden shadow-2xs">
          {reports.map(name => {
            const active = report === name;
            const icon = REPORT_ICONS[name] || 'analytics';
            return (
              <button
                key={name}
                type="button"
                onClick={() => {
                  setReport(name);
                  setRows([]);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-none ${
                  active
                    ? 'bg-blue-600 text-white shadow-xs font-bold'
                    : 'bg-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">{icon}</span>
                <span>{labels[name]}</span>
              </button>
            );
          })}
        </div>
      )}

      {!customer && (
        <Banner type="info">
          Financial sales metrics utilize the order placed date and locked order snapshot prices. Unit count and cargo volume are reported separately. All timestamps correspond to Sri Lanka time (Asia/Colombo).
        </Banner>
      )}

      {/* Query Parameters Form / Customer History Bar */}
      {customer ? (
        <div className="card flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3.5 print:hidden">
          <div className="flex items-center gap-2.5 text-xs text-slate-600">
            <span className="material-symbols-outlined text-[20px] text-blue-600">history</span>
            <span>Historical consignments archive for <strong className="text-slate-900 font-semibold">{user.name}</strong></span>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              try {
                const data = await api('/reports/history');
                setRows(data);
              } finally {
                setLoading(false);
              }
            }}
            className="text-xs flex items-center gap-1.5 py-1.5 px-3 self-start sm:self-auto"
          >
            <span className="material-symbols-outlined text-[16px]">refresh</span>
            <span>{loading ? 'Refreshing…' : 'Refresh Archive'}</span>
          </button>
        </div>
      ) : (
        <div className="card space-y-3 print:hidden">
          <h2 className="text-base font-bold text-slate-900 mt-0">
            <span className="material-symbols-outlined text-blue-700 text-[18px]">tune</span>
            <span>Generate {labels[report]}</span>
          </h2>
          <Form
            key={report}
            fields={fields}
            button="Run Analytics Query"
            onSubmit={async b => {
              const data = await api(`/reports/${report}?${new URLSearchParams(b)}`);
              setRows(data);
              return { message: `Loaded ${data.length} records for ${labels[report]}` };
            }}
          />
        </div>
      )}

      {/* Visual Analytics Bar Chart */}
      {['quarterly', 'products', 'locations', 'hours', 'trucks'].includes(report) && rows.length > 0 && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900 mt-0 uppercase tracking-wider">
              {metric.replaceAll('_', ' ')} Breakdown
            </h2>
            <span className="text-xs text-muted">Peak Value: {maximum.toLocaleString()}</span>
          </div>

          <div className="space-y-3 pt-1">
            {chartRows.slice(0, 10).map((r, i) => {
              const labelText = r.product || r.name || r.plate || r.city || r.month || `Item #${i + 1}`;
              const val = Number(r[metric] || 0);
              const pct = (val / maximum) * 100;

              return (
                <div key={i} className="space-y-1">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-slate-800">{labelText}</span>
                    <span className="tabular-nums font-mono text-slate-900 font-semibold">
                      {val.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-blue-600 to-indigo-600 h-full rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(2, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Data Table View */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">
            <span className="material-symbols-outlined text-blue-700 text-[20px]">table_chart</span>
            <span>Tabular Results ({rows.length})</span>
          </h2>
        </div>
        <Table rows={getFormattedRows()} pageSize={15} />

        {report === 'trucks' && (
          <p className="text-xs text-muted pt-1">
            Truck utilization assumes 8 available operating hours per calendar day. Trips crossing month boundaries contribute split hours accordingly.
          </p>
        )}
      </section>
    </div>
  );
}
