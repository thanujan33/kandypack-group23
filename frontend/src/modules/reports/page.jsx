import { useState } from 'react';
import { api } from '../../api';
import { Form, Table, Banner } from '../../components/UI';
export const roles = ['ADMIN', 'FACTORY', 'CUSTOMER']; export const label = 'Reports'; export const order = 50;
export default function Page({ user }) {
    const customer = user.role === 'CUSTOMER';
    const [report, setReport] = useState(customer ? 'history' : 'quarterly'), [rows, setRows] = useState([]);
    const reports = customer ? ['history'] : ['quarterly', 'products', 'locations', 'hours', 'trucks', 'history', ...(user.role === 'ADMIN' ? ['audit'] : [])];
    const labels = {
        quarterly: 'Quarterly sales', products: 'Most ordered items', locations: 'City and route sales',
        hours: 'Staff weekly hours', trucks: 'Monthly truck usage', history: 'Customer order history', audit: 'Audit log'
    };
    const now = new Date(), date = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });
    function csv() {
        if (!rows.length) return;
        const keys = Object.keys(rows[0]);
        const quote = value => {
            let s = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
            // Prevent spreadsheet formula execution when opening exported user data.
            if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
            return '"' + s.replaceAll('"', '""') + '"';
        };
        const output = [keys, ...rows.map(r => keys.map(k => r[k]))].map(row => row.map(quote).join(',')).join('\r\n');
        const url = URL.createObjectURL(new Blob(['\ufeff' + output], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a'); a.href = url; a.download = `kandypack-${report}.csv`; a.click(); URL.revokeObjectURL(url);
    }
    let fields = [];
    if (['quarterly', 'products', 'locations'].includes(report)) fields = [{ name: 'year', type: 'number', value: now.getFullYear(), min: 2000, max: 2100 },
    { name: 'quarter', type: 'number', value: Math.floor(now.getMonth() / 3) + 1, min: 1, max: 4 }];
    if (report === 'hours') fields = [{ name: 'week', type: 'date', value: date }];
    if (report === 'trucks') fields = [{ name: 'month', type: 'month', value: date.slice(0, 7) }];
    if (report === 'history' && !customer) fields = [{ name: 'customer_id', type: 'number', min: 1 }];
    const metric = report === 'products' ? 'units' : report === 'trucks' ? 'actual_hours' : report === 'hours' ? 'actual_hours' : 'sales_LKR';
    const chartRows = report === 'locations' ? rows.filter(r => r.level === 'CITY') : rows;
    const maximum = Math.max(1, ...chartRows.map(r => Number(r[metric]) || 0));
    return <><h1>{labels[report]}</h1><div className="flex flex-wrap gap-2 print:hidden">{reports.map(name =>
        <button key={name} onClick={() => { setReport(name); setRows([]); }}>{labels[name]}</button>)}</div>
        <Banner>Sales use the order placed date and the saved order prices. Every accepted order counts as a sale,
            as stated in the SRS. Unit volume and space volume are shown separately. Times use Asia/Colombo.</Banner>
        <Form key={report} fields={fields} button="Generate report" onSubmit={async b => {
            setRows(await api(`/reports/${report}?${new URLSearchParams(b)}`)); return { message: 'Report loaded' };
        }} /><div className="flex gap-2 my-4 print:hidden"><button onClick={csv}>Download CSV</button>
            <button onClick={() => window.print()}>Print or save PDF</button></div>
        {['quarterly', 'products', 'locations', 'hours', 'trucks'].includes(report) && <div className="card space-y-3">
            <h2>{metric.replaceAll('_', ' ')}</h2>{chartRows.map((r, i) => <div key={i}><div className="flex justify-between text-sm">
                <span>{r.product || r.name || r.plate || r.city || r.month}</span><span>{Number(r[metric] || 0).toFixed(2)}</span></div>
                <div className="bg-stone-200 rounded h-3"><div className="bg-[#2F6F5E] rounded h-3"
                    style={{ width: 100 * (Number(r[metric]) || 0) / maximum + '%' }} /></div></div>)}
        </div>}
        <Table rows={rows} />{report === 'trucks' && <p>Utilization assumes 8 available truck hours per calendar day.
            Trips crossing a month boundary contribute hours to each month; the trip count belongs to its start month.</p>}
    </>;
}
