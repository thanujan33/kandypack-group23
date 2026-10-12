import React, { useEffect, useState } from 'react';
import { api } from '../../api';
import { Form, Table, options, StatCard } from '../../components/UI';

export const roles = ['ADMIN', 'FACTORY'];
export const label = 'Directory';
export const order = 10;

export default function Page({ user }) {
  const [data, setData] = useState({ stores: [], routes: [] }),
    [users, setUsers] = useState([]),
    [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setData(await api('/directory'));
      if (user.role === 'ADMIN') setUsers(await api('/users'));
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

  const save = (url, method = 'POST') => async body => {
    const result = await api(url, { method, body });
    await load();
    return result;
  };

  const staffCount = users.filter(u => u.role !== 'CUSTOMER').length;
  const custCount = users.filter(u => u.role === 'CUSTOMER').length;

  return (
    <div className="space-y-6">
      {/* Header Context */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200/80 gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {user.role === 'ADMIN' ? 'Stores, Coverage & User Administration' : 'Depots & Delivery Coverage Directory'}
          </h1>
          <p className="text-xs text-muted mt-0.5">
            {user.role === 'ADMIN'
              ? 'Maintain regional depot stores, local coverage delivery routes, and role-based staff credentials.'
              : 'Review regional depot stores and manage local delivery coverage routes and turnaround times.'}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 self-start sm:self-auto text-xs"
        >
          <span className="material-symbols-outlined text-[16px]">refresh</span>
          <span>{loading ? 'Refreshing…' : 'Refresh Directory'}</span>
        </button>
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
          {error}
        </div>
      )}

      {/* KPI Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard
          title="Regional Stores"
          value={data.stores.length}
          subtitle={data.stores.length ? `${data.stores.length} depots active` : 'No depots'}
          icon="store"
          color="blue"
        />
        <StatCard
          title="Delivery Routes"
          value={data.routes.length}
          subtitle={data.routes.length ? `${data.routes.length} active coverage zones` : 'No active routes'}
          icon="alt_route"
          color="teal"
        />
        {user.role === 'ADMIN' && (
          <StatCard
            title="Registered Users"
            value={users.length}
            subtitle={users.length ? `${staffCount} staff · ${custCount} clients` : 'No users registered'}
            icon="manage_accounts"
            color="amber"
          />
        )}
      </div>

      {/* Stores Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 mt-0">
            <span className="material-symbols-outlined text-blue-700 text-[20px]">warehouse</span>
            <span>Regional Depot Stores</span>
          </h2>
        </div>
        <Table
          rows={data.stores.map(s => ({
            store_id: `#${s.id}`,
            city: s.city,
            location: s.location
          }))}
        />

        {user.role === 'ADMIN' && (
          <details className="card group">
            <summary className="text-xs font-semibold text-blue-700 cursor-pointer list-none flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px] transition-transform group-open:rotate-90">chevron_right</span>
              <span>Add New Regional Depot Store</span>
            </summary>
            <div className="mt-3 pt-3 border-t border-slate-100">
              <Form
                button="Create Store"
                fields={[
                  { name: 'city', label: 'City (e.g. Negombo)' },
                  { name: 'location', label: 'Depot Physical Address / Landmark' }
                ]}
                onSubmit={save('/stores')}
              />
            </div>
          </details>
        )}
      </section>

      {/* Delivery Coverage Routes */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900">
          <span className="material-symbols-outlined text-blue-700 text-[20px]">map</span>
          <span>Local Delivery Coverage Routes</span>
        </h2>
        <Table
          rows={data.routes.map(r => ({
            route_id: `#${r.id}`,
            route_name: r.name,
            depot_city: r.city,
            coverage_area: r.coverage_area,
            max_turnaround: `${r.max_minutes} min`,
            status: r.active ? 'Active' : 'Retired'
          }))}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card space-y-3">
            <h3 className="text-sm font-bold text-slate-800 mt-0">Create New Route</h3>
            <Form
              fields={[
                { name: 'store_id', label: 'Parent Regional Store', options: options(data.stores, 'city') },
                { name: 'name', label: 'Route Identifier (e.g. Route A - Coastal)' },
                { name: 'coverage_area', label: 'Unique Coverage Area Code' },
                { name: 'max_minutes', label: 'Max Turnaround Time (Minutes)', type: 'number', min: 1, max: 480 }
              ]}
              button="Register Route"
              onSubmit={save('/routes')}
            />
          </div>

          <div className="card space-y-3">
            <h3 className="text-sm font-bold text-slate-800 mt-0">Retire Coverage Route</h3>
            <Form
              button="Retire Route"
              fields={[
                {
                  name: 'id',
                  label: 'Select Active Route',
                  options: data.routes.map(r => ({
                    value: r.id,
                    label: `${r.city} · ${r.name} (${r.coverage_area})`
                  }))
                }
              ]}
              onSubmit={b => save(`/routes/${b.id}`, 'PATCH')({ active: false })}
            />
          </div>
        </div>
      </section>

      {/* User Management & Access Control (Admin Only) */}
      {user.role === 'ADMIN' && (
        <section className="space-y-4 pt-4 border-t border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">
            <span className="material-symbols-outlined text-blue-700 text-[20px]">admin_panel_settings</span>
            <span>User Access & Role Privileges</span>
          </h2>
          <Table
            rows={users.map(u => ({
              user_id: `#${u.id}`,
              name: u.name,
              email: u.email,
              role: u.role,
              status: u.active ? 'Active' : 'Disabled'
            }))}
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="card space-y-3">
              <h3 className="text-sm font-bold text-slate-800 mt-0">Update User Role / Status</h3>
              <Form
                fields={[
                  {
                    name: 'id',
                    label: 'User Account',
                    options: users.map(u => ({
                      value: u.id,
                      label: `#${u.id} · ${u.name} (${u.role}) · ${u.email}`
                    }))
                  },
                  {
                    name: 'role',
                    label: 'Assigned Role',
                    options: ['ADMIN', 'FACTORY', 'STORE', 'CUSTOMER'].map(value => ({ value, label: value }))
                  },
                  {
                    name: 'active',
                    label: 'Account Status',
                    options: [
                      { value: '1', label: 'Active' },
                      { value: '0', label: 'Disabled' }
                    ]
                  }
                ]}
                button="Update Access"
                onSubmit={b => save(`/users/${b.id}`, 'PATCH')({ ...b, active: b.active === '1' })}
              />
            </div>

            <div className="card space-y-3">
              <h3 className="text-sm font-bold text-slate-800 mt-0">Create Staff Login</h3>
              <Form
                fields={[
                  { name: 'name', label: 'Staff Member Name' },
                  { name: 'email', label: 'Staff Email', type: 'email' },
                  { name: 'password', label: 'Password (min 12 chars)', type: 'password' },
                  {
                    name: 'role',
                    label: 'Assigned Role',
                    options: ['ADMIN', 'FACTORY', 'STORE'].map(value => ({ value, label: value }))
                  }
                ]}
                button="Provision Staff Account"
                onSubmit={save('/staff-users')}
              />
            </div>

            <div className="card space-y-3">
              <h3 className="text-sm font-bold text-slate-800 mt-0">Assign Store Manager</h3>
              <Form
                fields={[
                  { name: 'store_id', label: 'Regional Store', options: options(data.stores, 'city') },
                  {
                    name: 'manager_id',
                    label: 'Store Manager User',
                    options: users
                      .filter(u => u.role === 'STORE')
                      .map(u => ({
                        value: u.id,
                        label: `${u.name} (${u.email})`
                      }))
                  }
                ]}
                button="Assign Manager"
                onSubmit={b => save(`/stores/${b.store_id}/manager`, 'PUT')(b)}
              />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
