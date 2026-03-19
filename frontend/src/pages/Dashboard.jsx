import { useQuery } from '@tanstack/react-query'
import { useAuth, api } from '../context/AuthContext'
import {
    TrendingUp, ShoppingCart, Package,
    DollarSign, AlertCircle, Clock, BarChart3
} from 'lucide-react'
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer
} from 'recharts'

function fmt(value) {
    return new Intl.NumberFormat('es-PY', {
        style: 'currency',
        currency: 'PYG',
        maximumFractionDigits: 0,
    }).format(value ?? 0)
}

function fmtShortRange(desde, hasta) {
    const start = new Date(desde)
    const end = new Date(hasta)
    const dd = value => String(value).padStart(2, '0')
    return `${dd(start.getDate())}/${dd(start.getMonth() + 1)} - ${dd(end.getDate())}/${dd(end.getMonth() + 1)}/${end.getFullYear()}`
}

function StatCard({ icon: Icon, iconClass, label, value, sub }) {
    return (
        <div className="stat-card">
            <div className={`stat-icon ${iconClass}`}><Icon size={22} /></div>
            <div className="stat-info">
                <div className="stat-label">{label}</div>
                <div className="stat-value">{value}</div>
                {sub && <div className="stat-sub">{sub}</div>}
            </div>
        </div>
    )
}

function ComparisonCard({ color, title, value, range }) {
    return (
        <div className="card dashboard-compare-card" style={{ borderLeft: `4px solid ${color}` }}>
            <div style={{ display: 'grid', gap: 14 }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.92rem', fontWeight: 600 }}>{title}</div>
                <div style={{ fontSize: '2rem', fontWeight: 800, color }}>{fmt(value)}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{range}</div>
            </div>
        </div>
    )
}

export default function Dashboard() {
    const { user } = useAuth()

    const { data: dashboard } = useQuery({
        queryKey: ['dashboard-resumen'],
        queryFn: () => api.get('/reportes/dashboard/resumen').then(response => response.data),
        retry: false,
    })

    const estadoBadge = estado => {
        const map = {
            PAGADO: 'badge-green',
            PENDIENTE: 'badge-yellow',
            ANULADO: 'badge-red',
            ENTREGADO: 'badge-blue',
        }
        return <span className={`badge ${map[estado] || 'badge-gray'}`}>{estado}</span>
    }

    return (
        <div className="page-body">
            <div className="flex-between mb-24">
                <div>
                    <h2 style={{ fontSize: '1.4rem', fontWeight: 700 }}>
                        Buenos dias, {user?.nombre?.split(' ')[0]} 👋
                    </h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: 4 }}>
                        {new Date().toLocaleDateString('es-PY', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                </div>
            </div>

            <div className="stats-grid">
                <StatCard
                    icon={DollarSign}
                    iconClass="green"
                    label="Saldo en Caja"
                    value={fmt(dashboard?.saldo_caja ?? 0)}
                />
                <StatCard
                    icon={TrendingUp}
                    iconClass="blue"
                    label="Ventas Pendientes"
                    value={dashboard?.ventas_pendientes_count ?? '—'}
                    sub="con saldo a cobrar"
                />
                <StatCard
                    icon={ShoppingCart}
                    iconClass="orange"
                    label="Compras Pendientes"
                    value={dashboard?.compras_pendientes_count ?? '—'}
                    sub="por pagar a proveedores"
                />
                <StatCard
                    icon={Package}
                    iconClass="purple"
                    label="Modulo Activo"
                    value="Administrativo"
                    sub="+ Clinico disponible"
                />
            </div>

            <div className="grid-2" style={{ gap: 20 }}>
                <div className="card" style={{ gridColumn: 'span 1' }}>
                    <div className="card-title flex-between">
                        <span>Ventas Ultimos 7 Meses</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tendencia real</span>
                    </div>
                    <ResponsiveContainer width="100%" height={180}>
                        <AreaChart data={dashboard?.serie_ventas || []} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="gradVentas" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#1a56db" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#1a56db" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                            <XAxis dataKey="mes" tick={{ fill: '#5a647a', fontSize: 12 }} axisLine={false} tickLine={false} />
                            <YAxis hide />
                            <Tooltip
                                contentStyle={{ background: '#1a1d27', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, color: '#f0f4ff' }}
                                formatter={value => [fmt(value), 'Ventas']}
                            />
                            <Area type="monotone" dataKey="ventas" stroke="#3b82f6" strokeWidth={2} fill="url(#gradVentas)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                <div className="card">
                    <div className="card-title flex-between">
                        <span>Ultimas Ventas</span>
                        <a href="/ventas" style={{ fontSize: '0.78rem', color: 'var(--primary-light)' }}>Ver todas →</a>
                    </div>
                    {!dashboard?.ventas_recientes || dashboard.ventas_recientes.length === 0 ? (
                        <div className="empty-state">
                            <Clock size={36} />
                            <p>No hay ventas recientes</p>
                        </div>
                    ) : (
                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Codigo</th>
                                        <th>Cliente</th>
                                        <th>Total</th>
                                        <th>Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {dashboard.ventas_recientes.map(venta => (
                                        <tr key={venta.id}>
                                            <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{venta.codigo}</td>
                                            <td>{venta.cliente_nombre || '—'}</td>
                                            <td style={{ fontWeight: 600 }}>{fmt(venta.total)}</td>
                                            <td>{estadoBadge(venta.estado)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {dashboard?.comparativa_ventas && (
                <div className="card mt-16">
                    <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <BarChart3 size={18} style={{ color: 'var(--primary-light)' }} />
                        <span>Comparativa de Ventas</span>
                    </div>
                    <div className="dashboard-compare-grid">
                        <ComparisonCard
                            color="#2ecc71"
                            title={dashboard.comparativa_ventas.actual.etiqueta}
                            value={dashboard.comparativa_ventas.actual.total_ventas}
                            range={fmtShortRange(dashboard.comparativa_ventas.actual.fecha_desde, dashboard.comparativa_ventas.actual.fecha_hasta)}
                        />
                        <ComparisonCard
                            color="#3498db"
                            title={dashboard.comparativa_ventas.mes_anterior.etiqueta}
                            value={dashboard.comparativa_ventas.mes_anterior.total_ventas}
                            range={fmtShortRange(dashboard.comparativa_ventas.mes_anterior.fecha_desde, dashboard.comparativa_ventas.mes_anterior.fecha_hasta)}
                        />
                        <ComparisonCard
                            color="#f39c12"
                            title={dashboard.comparativa_ventas.ano_anterior.etiqueta}
                            value={dashboard.comparativa_ventas.ano_anterior.total_ventas}
                            range={fmtShortRange(dashboard.comparativa_ventas.ano_anterior.fecha_desde, dashboard.comparativa_ventas.ano_anterior.fecha_hasta)}
                        />
                    </div>
                </div>
            )}

            <div className="card mt-16">
                <div className="card-title flex-between">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <AlertCircle size={18} style={{ color: 'var(--warning)' }} />
                        Compras Pendientes de Pago
                    </span>
                    <a href="/compras" style={{ fontSize: '0.78rem', color: 'var(--primary-light)' }}>Ver todas →</a>
                </div>
                {!dashboard?.compras_pendientes || dashboard.compras_pendientes.length === 0 ? (
                    <div className="empty-state">
                        <p>✅ No hay compras pendientes</p>
                    </div>
                ) : (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Fecha</th>
                                    <th>Proveedor</th>
                                    <th>Tipo</th>
                                    <th>Total</th>
                                    <th>Saldo</th>
                                    <th>Estado Entrega</th>
                                </tr>
                            </thead>
                            <tbody>
                                {dashboard.compras_pendientes.map(compra => (
                                    <tr key={compra.id}>
                                        <td>{new Date(compra.fecha).toLocaleDateString('es-PY')}</td>
                                        <td>{compra.proveedor_nombre || '—'}</td>
                                        <td><span className="badge badge-blue">{compra.tipo_documento}</span></td>
                                        <td>{fmt(compra.total)}</td>
                                        <td style={{ color: 'var(--warning)', fontWeight: 600 }}>{fmt(compra.saldo)}</td>
                                        <td>{estadoBadge(compra.estado_entrega)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <style>{`
                .dashboard-compare-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
                    gap: 16px;
                }
                .dashboard-compare-card {
                    min-width: 0;
                    background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01));
                }
            `}</style>
        </div>
    )
}
