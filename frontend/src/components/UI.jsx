import React, { useState } from 'react';
import PasswordInput from './PasswordInput';

const STATUS_CONFIG = {
  PENDING: { label: 'Pending', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-300', dot: 'bg-amber-500' },
  ALLOCATED: { label: 'Allocated', bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-300', dot: 'bg-blue-600' },
  ON_TRAIN: { label: 'On Train', bg: 'bg-indigo-50', text: 'text-indigo-800', border: 'border-indigo-300', dot: 'bg-indigo-600', pulse: true },
  IN_TRANSIT: { label: 'In Transit', bg: 'bg-indigo-50', text: 'text-indigo-800', border: 'border-indigo-300', dot: 'bg-indigo-600', pulse: true },
  AT_STORE: { label: 'At Store', bg: 'bg-teal-50', text: 'text-teal-800', border: 'border-teal-300', dot: 'bg-teal-600' },
  SCHEDULED: { label: 'Scheduled', bg: 'bg-sky-50', text: 'text-sky-800', border: 'border-sky-300', dot: 'bg-sky-600' },
  PLANNED: { label: 'Planned', bg: 'bg-sky-50', text: 'text-sky-800', border: 'border-sky-300', dot: 'bg-sky-600' },
  OUT_FOR_DELIVERY: { label: 'Out for Delivery', bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-300', dot: 'bg-orange-500', pulse: true },
  OUT: { label: 'Out on Route', bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-300', dot: 'bg-orange-500', pulse: true },
  DELIVERED: { label: 'Delivered', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-300', dot: 'bg-emerald-600' },
  COMPLETED: { label: 'Completed', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-300', dot: 'bg-emerald-600' },
  CANCELLED: { label: 'Cancelled', bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-300', dot: 'bg-rose-600' },
  FAILED: { label: 'Failed', bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-300', dot: 'bg-rose-600' },
  MISSING: { label: 'Missing', bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-300', dot: 'bg-rose-600' }
};

export function StatusBadge({ status }) {
  if (!status) return <span>—</span>;
  const key = String(status).toUpperCase();
  const cfg = STATUS_CONFIG[key] || {
    label: String(status),
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-300',
    dot: 'bg-slate-400'
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.text} ${cfg.border} shadow-2xs`}>
      <span className="relative flex h-2 w-2">
        {cfg.pulse && <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${cfg.dot}`} />}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${cfg.dot}`} />
      </span>
      <span>{cfg.label}</span>
    </span>
  );
}

export function StatCard({ title, value, subtitle, icon, color = 'blue' }) {
  const iconColors = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    teal: 'bg-teal-50 text-teal-700 border-teal-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-200'
  };

  return (
    <div className="card flex items-start justify-between gap-3">
      <div className="space-y-1">
        <p className="text-xs uppercase font-semibold tracking-wider text-muted">{title}</p>
        <p className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums">{value}</p>
        {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
      </div>
      {icon && (
        <div className={`p-2 rounded-lg border ${iconColors[color] || iconColors.blue}`}>
          <span className="material-symbols-outlined text-[22px]">{icon}</span>
        </div>
      )}
    </div>
  );
}

const LIFECYCLE_STEPS = [
  { key: 'PENDING', label: '1. Placed', icon: 'receipt_long' },
  { key: 'ALLOCATED', label: '2. Rail Allocated', icon: 'departure_board' },
  { key: 'ON_TRAIN', label: '3. Rail Transit', icon: 'train' },
  { key: 'AT_STORE', label: '4. Regional Store', icon: 'warehouse' },
  { key: 'SCHEDULED', label: '5. Road Scheduled', icon: 'event' },
  { key: 'OUT_FOR_DELIVERY', label: '6. Out for Delivery', icon: 'local_shipping' },
  { key: 'DELIVERED', label: '7. Delivered', icon: 'verified' }
];

export function Stepper({ currentStatus }) {
  const status = String(currentStatus || '').toUpperCase();
  const isCancelled = status === 'CANCELLED';
  const currentIndex = LIFECYCLE_STEPS.findIndex(s => s.key === status);

  return (
    <div className="card my-4 overflow-hidden border-slate-200/90 bg-gradient-to-b from-white to-slate-50/50">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-blue-700 text-[20px]">timeline</span>
          <span className="text-sm font-bold uppercase tracking-wider text-slate-800">Order Delivery Lifecycle</span>
        </div>
        <StatusBadge status={currentStatus} />
      </div>

      {isCancelled ? (
        <div className="my-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-3">
          <span className="material-symbols-outlined text-[28px] text-rose-600">cancel</span>
          <div>
            <h4 className="font-semibold text-sm">Order Cancelled</h4>
            <p className="text-xs text-rose-700 mt-0.5">This consignment was cancelled and removed from active fulfillment pipelines.</p>
          </div>
        </div>
      ) : status === 'MISSING' ? (
        <div className="my-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-3">
          <span className="material-symbols-outlined text-[28px] text-rose-600">report_problem</span>
          <div>
            <h4 className="font-semibold text-sm">Consignment Discrepancy (Missing)</h4>
            <p className="text-xs text-rose-700 mt-0.5">This shipment encountered a transit discrepancy and is being reconciled by store operations.</p>
          </div>
        </div>
      ) : (
        <div className="pt-5 pb-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {LIFECYCLE_STEPS.map((step, idx) => {
              const isPast = currentIndex !== -1 && idx < currentIndex;
              const isCurrent = currentIndex !== -1 && idx === currentIndex;

              return (
                <div key={step.key} className="flex flex-col items-center text-center">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold mb-2 transition-all shadow-xs ${
                      isPast
                        ? 'bg-emerald-700 text-white'
                        : isCurrent
                        ? 'bg-blue-600 text-white ring-4 ring-blue-100 font-bold'
                        : 'bg-slate-100 text-muted border border-slate-200'
                    }`}
                  >
                    {isPast ? (
                      <span className="material-symbols-outlined text-[18px]">check</span>
                    ) : (
                      <span className="material-symbols-outlined text-[18px]">{step.icon}</span>
                    )}
                  </div>
                  <span className={`text-xs font-medium leading-tight ${
                    isCurrent ? 'text-blue-900 font-bold' : isPast ? 'text-slate-800' : 'text-muted'
                  }`}>
                    {step.label}
                  </span>
                  <span className="text-[10px] text-muted uppercase mt-0.5">
                    {isCurrent ? 'Active Now' : isPast ? 'Completed' : 'Upcoming'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function Table({ rows, pageSize = 10 }) {
  const [page, setPage] = useState(0);

  if (!rows?.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center bg-slate-50/50">
        <span className="material-symbols-outlined text-[32px] text-muted">inbox</span>
        <p className="mt-1 text-sm text-muted font-medium">No records found.</p>
      </div>
    );
  }

  const keys = Object.keys(rows[0]);
  const totalPages = Math.ceil(rows.length / pageSize);
  const currentRows = rows.length > pageSize ? rows.slice(page * pageSize, (page + 1) * pageSize) : rows;

  const isStatusColumn = key => ['status', 'train_status', 'outcome'].includes(key.toLowerCase());
  const isCurrencyColumn = key => /price|value|cost|lkr/i.test(key);
  const isCodeColumn = key => /id|reference|plate|nic|code/i.test(key);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
        <table className="w-full text-left">
          <thead>
            <tr>
              {keys.map(k => (
                <th key={k}>{k.replaceAll('_', ' ')}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {currentRows.map((row, i) => (
              <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                {keys.map(k => {
                  const val = row[k];
                  const strVal = String(val ?? '');

                  if (isStatusColumn(k) || (typeof val === 'string' && STATUS_CONFIG[val.toUpperCase()])) {
                    return (
                      <td key={k}>
                        <StatusBadge status={val} />
                      </td>
                    );
                  }

                  if (typeof val === 'boolean') {
                    return (
                      <td key={k}>
                        <span className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${val ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-muted'}`}>
                          {val ? 'Yes' : 'No'}
                        </span>
                      </td>
                    );
                  }

                  if (isCurrencyColumn(k) && Number.isFinite(Number(val))) {
                    return (
                      <td key={k} className="tabular-nums font-medium text-slate-900">
                        LKR {Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    );
                  }

                  if (isCodeColumn(k)) {
                    return (
                      <td key={k} className="tabular-nums font-mono text-xs text-slate-700">
                        {strVal || '—'}
                      </td>
                    );
                  }

                  return (
                    <td key={k}>
                      {typeof val === 'object' && val !== null ? JSON.stringify(val) : strVal || '—'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > pageSize && (
        <div className="flex items-center justify-between px-2 text-xs text-slate-600">
          <span>
            Showing <b className="text-slate-800">{page * pageSize + 1}</b>–<b className="text-slate-800">{Math.min((page + 1) * pageSize, rows.length)}</b> of <b className="text-slate-800">{rows.length}</b> records
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="px-2.5 py-1 text-xs bg-white text-slate-700 border border-slate-300 hover:bg-slate-50"
              disabled={page === 0}
              onClick={() => setPage(p => Math.max(0, p - 1))}
            >
              Previous
            </button>
            <span className="px-2">Page {page + 1} of {totalPages}</span>
            <button
              type="button"
              className="px-2.5 py-1 text-xs bg-white text-slate-700 border border-slate-300 hover:bg-slate-50"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Form({ fields, onSubmit, button = 'Save', inputClassName = '' }) {
  const [feedback, setFeedback] = useState({ text: '', isError: false });
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="card space-y-4"
      onSubmit={async e => {
        e.preventDefault();
        const form = e.currentTarget;
        const b = Object.fromEntries(new FormData(form));

        // Auto-normalize HTML datetime-local (e.g. "2026-10-15T08:30" -> "2026-10-15 08:30:00")
        for (const [key, val] of Object.entries(b)) {
          if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(val.trim())) {
            const trimmed = val.trim();
            b[key] = trimmed.replace('T', ' ') + (trimmed.length === 16 ? ':00' : '');
          }
        }

        setBusy(true);
        setFeedback({ text: '', isError: false });
        try {
          const result = await onSubmit(b);
          setFeedback({ text: result?.message || 'Saved successfully', isError: false });
        } catch (err) {
          setFeedback({ text: err.message || 'An unexpected error occurred', isError: true });
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid gap-3 md:grid-cols-2">
        {fields.map(f => (
          <div key={f.name} className={f.colSpan ? `md:col-span-${f.colSpan}` : ''}>
            <label htmlFor={f.name}>
              {f.label || f.name.replaceAll('_', ' ')}
              {f.optional && <span className="ml-1 text-[10px] text-muted font-normal lowercase">(optional)</span>}
            </label>
            {f.type === 'password' ? (
              <PasswordInput
                id={f.name}
                name={f.name}
                label={null}
                className={inputClassName}
                defaultValue={f.value}
                required={!f.optional}
                min={f.min}
                max={f.max}
                step={f.step}
                placeholder={f.placeholder}
              />
            ) : f.options ? (
              <select id={f.name} name={f.name} required={!f.optional} defaultValue={f.value || ''}>
                <option value="" disabled>Choose…</option>
                {f.options.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={f.name}
                className={inputClassName}
                name={f.name}
                type={f.type || 'text'}
                defaultValue={f.value}
                required={!f.optional}
                min={f.min}
                max={f.max}
                step={f.step}
                placeholder={f.placeholder}
              />
            )}
          </div>
        ))}
      </div>

      <div className="pt-2 flex items-center justify-between gap-3">
        <button type="submit" disabled={busy}>
          {busy ? (
            <span className="flex items-center gap-2">
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Processing…
            </span>
          ) : (
            button
          )}
        </button>
      </div>

      {feedback.text && (
        <div
          role={feedback.isError ? 'alert' : 'status'}
          className={`flex items-start gap-2.5 p-3 rounded-lg text-xs font-medium border ${
            feedback.isError
              ? 'bg-rose-50 text-rose-800 border-rose-200'
              : 'bg-emerald-50 text-emerald-800 border-emerald-200'
          }`}
        >
          <span className="material-symbols-outlined text-[18px] flex-shrink-0">
            {feedback.isError ? 'error' : 'check_circle'}
          </span>
          <span className="mt-0.5">{feedback.text}</span>
        </div>
      )}
    </form>
  );
}

export const options = (rows, label = 'name') =>
  (rows || []).map(x => ({ value: x.id, label: `${x.id} | ${x[label] ?? x.name ?? x.id}` }));

export function Banner({ children, type = 'info' }) {
  const styles = {
    info: 'bg-blue-50/80 text-blue-900 border-blue-200',
    warning: 'bg-amber-50 text-amber-900 border-amber-200',
    success: 'bg-emerald-50 text-emerald-900 border-emerald-200'
  };
  const icons = {
    info: 'info',
    warning: 'warning',
    success: 'check_circle'
  };

  return (
    <div className={`p-4 rounded-xl border flex items-start gap-3 my-4 shadow-2xs ${styles[type] || styles.info}`}>
      <span className="material-symbols-outlined text-[20px] flex-shrink-0 text-slate-700">
        {icons[type] || 'info'}
      </span>
      <div className="text-xs leading-relaxed">{children}</div>
    </div>
  );
}
