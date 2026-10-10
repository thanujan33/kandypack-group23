import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api';
import { Form, Banner } from './components/UI';
import './style.css';

const modules = Object.values(import.meta.glob('./modules/*/Page.jsx', { eager: true }))
  .sort((a, b) => a.order - b.order);

const MODULE_ICONS = {
  Directory: 'domain',
  Orders: 'inventory_2',
  Rail: 'train',
  Road: 'local_shipping',
  Reports: 'analytics'
};

function App() {
  const [user, setUser] = useState(null),
    [tab, setTab] = useState(''),
    [register, setRegister] = useState(false);

  const load = () =>
    api('/me')
      .then(setUser)
      .catch(() => setUser(null));

  useEffect(() => {
    if (sessionStorage.getItem('token')) load();
    const signout = () => setUser(null);
    window.addEventListener('signed-out', signout);
    return () => window.removeEventListener('signed-out', signout);
  }, []);

  const allowed = modules.filter(m => m.roles.includes(user?.role));
  const chosen = allowed.find(m => m.label === tab) || allowed[0];
  const Page = chosen?.default;

  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col">
      {/* Top Application Bar */}
      <header className="sticky top-0 z-40 bg-[#0A1629] text-white border-b border-slate-800 shadow-sm px-4 md:px-8 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-xs">
            <span className="material-symbols-outlined text-[20px]">view_in_ar</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold tracking-tight text-white leading-none">KandyPack</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-900/80 text-blue-300 border border-blue-700/60">
                Logistics OS
              </span>
            </div>
            <p className="text-[11px] text-slate-300 mt-0.5">Bi-Modal Freight & Distribution · Group 23</p>
          </div>
        </div>

        {user ? (
          <div className="flex items-center gap-3">
            {/* Live Status Beacon */}
            <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-[11px] text-slate-300 font-medium">Rail & Road Live</span>
            </div>

            {/* User Profile Pill */}
            <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
              <div className="text-right hidden md:block">
                <p className="text-xs font-semibold text-white leading-tight">{user.name}</p>
                <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">{user.role}</span>
              </div>
              <button
                type="button"
                className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow-none transition-colors"
                onClick={async () => {
                  try {
                    await api('/logout', { method: 'POST' });
                  } finally {
                    sessionStorage.removeItem('token');
                    setUser(null);
                  }
                }}
              >
                Sign out
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <span className="material-symbols-outlined text-[16px] text-amber-400">schedule</span>
            <span>All times Asia/Colombo</span>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 space-y-6">
        {!user ? (
          <div className="max-w-md mx-auto pt-6 pb-12 space-y-5">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md mb-3">
                <span className="material-symbols-outlined text-[26px]">local_shipping</span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900">{register ? 'Create Customer Account' : 'Sign in to KandyPack'}</h1>
              <p className="text-xs text-muted">Access rail timetables, dispatch manifests, and shipment tracking.</p>
            </div>

            <Form
              key={String(register)}
              button={register ? 'Create account' : 'Sign in'}
              fields={[
                ...(register
                  ? [
                      { name: 'name', label: 'Full name' },
                      { name: 'phone', label: 'Contact phone' },
                      { name: 'nic', label: 'NIC number', optional: true },
                      { name: 'address', label: 'Delivery address' }
                    ]
                  : []),
                { name: 'email', label: 'Email address', type: 'email' },
                { name: 'password', label: 'Password', type: 'password' }
              ]}
              onSubmit={async body => {
                const data = await api(register ? '/auth/register' : '/auth/login', { method: 'POST', body });
                if (!register) {
                  sessionStorage.setItem('token', data.token);
                  await load();
                }
                return data;
              }}
            />

            <div className="text-center pt-2">
              <button
                type="button"
                className="bg-transparent text-blue-700 hover:text-blue-900 hover:bg-blue-50/50 shadow-none px-3 py-1.5 text-xs font-semibold"
                onClick={() => setRegister(!register)}
              >
                {register ? '← Back to sign in' : 'New customer? Create an account'}
              </button>
            </div>

            <Banner type="info">
              Passwords require at least 12 characters. Staff and store accounts are managed by system administrators.
            </Banner>
          </div>
        ) : (
          <>
            {/* Top Navigation Segmented Pills */}
            <nav className="flex items-center gap-1.5 p-1 bg-slate-200/70 rounded-xl border border-slate-300/60 overflow-x-auto print:hidden shadow-2xs">
              {allowed.map(m => {
                const active = (chosen?.label || allowed[0]?.label) === m.label;
                const icon = MODULE_ICONS[m.label] || 'folder';
                return (
                  <button
                    key={m.label}
                    type="button"
                    onClick={() => setTab(m.label)}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap shadow-none ${
                      active
                        ? 'bg-white text-blue-800 hover:bg-blue-50 shadow-xs ring-1 ring-slate-200/80 font-bold'
                        : 'bg-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-300/40'
                    }`}
                  >
                    <span className={`material-symbols-outlined text-[17px] ${active ? 'text-blue-600' : 'text-muted'}`}>
                      {icon}
                    </span>
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </nav>

            {/* Module Render */}
            {Page ? (
              <Page key={chosen.label} user={user} />
            ) : (
              <p className="text-sm text-muted">Feature modules will appear after their branches are merged.</p>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-4 px-6 text-center text-xs text-muted print:hidden">
        <p>KandyPack Logistics Platform · Semester 3 Database Systems · Group 23</p>
      </footer>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
