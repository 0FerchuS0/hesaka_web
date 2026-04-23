import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth, api } from '../context/AuthContext'
import {
    TrendingUp, ShoppingCart, Package,
    DollarSign, AlertCircle, Clock, BarChart3, MessageCircle, Gift
} from 'lucide-react'
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer
} from 'recharts'
import Modal from '../components/Modal'

function fmt(value) {
    return new Intl.NumberFormat('es-PY', {
        style: 'currency',
        currency: 'PYG',
        maximumFractionDigits: 0,
    }).format(value ?? 0)
}

function todayInputValue() {
    const now = new Date()
    const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    return localDate.toISOString().slice(0, 10)
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

function fmtDate(value) {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '-'
    return date.toLocaleDateString('es-PY')
}

function fmtDateTime(value) {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '-'
    return date.toLocaleString('es-PY')
}

function normalizarTelefonoWhatsapp(value) {
    let digits = String(value || '').replace(/\D/g, '')
    if (!digits) return ''

    if (digits.startsWith('00')) {
        digits = digits.slice(2)
    }

    if (digits.startsWith('59509')) {
        digits = `595${digits.slice(4)}`
    }

    if (digits.startsWith('5950')) {
        digits = `595${digits.slice(4)}`
    }

    if (digits.startsWith('09') && digits.length === 10) {
        return `595${digits.slice(1)}`
    }

    if (digits.startsWith('0') && digits.length >= 7 && digits.length <= 11) {
        return `595${digits.slice(1)}`
    }

    if (digits.startsWith('9') && digits.length >= 8 && digits.length <= 10) {
        return `595${digits}`
    }

    if (digits.startsWith('5959') && digits.length === 12) {
        return digits
    }

    return digits.startsWith('595') && digits.length >= 10 ? digits : ''
}

function buildReminderWhatsappLink(item) {
    const telefono = normalizarTelefonoWhatsapp(item?.paciente_telefono)
    if (!telefono) return ''
    const ultimaConsulta = item?.ultima_consulta_fecha ? fmtDate(item.ultima_consulta_fecha) : 'sin registro'
    const proximaConsulta = item?.fecha_hora ? fmtDate(item.fecha_hora) : 'sin fecha'
    const mensaje = [
        `Hola ${item?.paciente_nombre || ''}, te escribimos de HESAKA.`,
        `Tu ultima consulta fue el ${ultimaConsulta} y tu proximo control esta previsto para el ${proximaConsulta}.`,
        'Quedamos atentos para ayudarte a confirmar tu cita.',
    ].join(' ')
    return `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`
}

function buildBirthdayWhatsappLink(cliente, empresa = 'HESAKA') {
    const telefono = normalizarTelefonoWhatsapp(cliente?.telefono)
    if (!telefono) return ''
    const mensaje = [
        `Hola ${cliente?.nombre || ''}, te escribimos de ${empresa}.`,
        'Queremos desearte un muy feliz cumpleaños.',
        'Que tengas un excelente dia.',
    ].join(' ')
    return `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`
}

function flattenReminderBuckets(reminderBuckets) {
    return [
        ...(reminderBuckets?.hoy || []),
        ...(reminderBuckets?.ocho_dias || []),
        ...(reminderBuckets?.quince_dias || []),
    ]
}

function getDailyReminderStorageKey(user) {
    const userKey = user?.id || user?.email || user?.nombre || 'anon'
    return `hesaka-recordatorios-vistos-${userKey}-${todayInputValue()}`
}

function ReminderCards({ items, onMarkRemembered, actionPendingId = null }) {
    return (
        <div style={{ display: 'grid', gap: 12 }}>
            {items.map(item => {
                const whatsappLink = buildReminderWhatsappLink(item)
                const isPending = actionPendingId === item.id
                return (
                    <div key={`${item.id}-${item.recordatorio_categoria || 'sin-categoria'}`} className="card" style={{ padding: 14, background: 'rgba(255,255,255,0.02)' }}>
                        <div style={{ display: 'grid', gap: 6 }}>
                            <div style={{ fontWeight: 700 }}>{item.paciente_nombre}</div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.86rem' }}>Ultima consulta: {item.ultima_consulta_fecha ? fmtDate(item.ultima_consulta_fecha) : 'Sin registro'}</div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.86rem' }}>Proxima consulta: {fmtDateTime(item.fecha_hora)}</div>
                        </div>
                        <div className="flex gap-12" style={{ marginTop: 12, flexWrap: 'wrap' }}>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onMarkRemembered(item)} disabled={isPending}>
                                {isPending ? 'Guardando...' : 'Recordado'}
                            </button>
                            <a
                                href={whatsappLink || undefined}
                                target="_blank"
                                rel="noreferrer"
                                className={`btn btn-secondary btn-sm ${!whatsappLink ? 'disabled' : ''}`}
                                onClick={event => {
                                    if (!whatsappLink) {
                                        event.preventDefault()
                                        window.alert('Este paciente no tiene telefono cargado para abrir WhatsApp.')
                                    }
                                }}
                                style={!whatsappLink ? { pointerEvents: 'auto', opacity: 0.6 } : undefined}
                            >
                                <MessageCircle size={14} /> WhatsApp
                            </a>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

export default function Dashboard() {
    const { user } = useAuth()
    const queryClient = useQueryClient()
    const [showReminderModal, setShowReminderModal] = useState(false)

    const { data: dashboard } = useQuery({
        queryKey: ['dashboard-resumen'],
        queryFn: () => api.get('/reportes/dashboard/resumen').then(response => response.data),
        retry: false,
    })
    const reminderQuery = useQuery({
        queryKey: ['clinica', 'agenda-recordatorios'],
        queryFn: async () => (await api.get('/clinica/agenda/recordatorios')).data,
        staleTime: 60 * 1000,
    })
    const birthdayQuery = useQuery({
        queryKey: ['clientes', 'cumpleanos', todayInputValue()],
        queryFn: async () => (await api.get('/clientes/cumpleanos')).data,
        staleTime: 5 * 60 * 1000,
        retry: false,
    })
    const { data: configPublica } = useQuery({
        queryKey: ['configuracion-general-publica'],
        queryFn: () => api.get('/configuracion-general/publica').then(response => response.data),
        staleTime: 5 * 60 * 1000,
        retry: false,
    })

    const markReminderMutation = useMutation({
        mutationFn: async item => {
            await api.post(`/clinica/agenda/${item.id}/recordatorios/${item.recordatorio_categoria}/recordado`)
        },
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['clinica', 'agenda-recordatorios'] }),
                queryClient.invalidateQueries({ queryKey: ['clinica', 'agenda'] }),
                queryClient.invalidateQueries({ queryKey: ['clinica', 'dashboard'] }),
            ])
        },
    })

    const reminderItems = flattenReminderBuckets(reminderQuery.data)
    const birthdayItems = birthdayQuery.data || []
    const empresaNombre = (configPublica?.nombre || '').trim() || 'HESAKA'

    useEffect(() => {
        if (!reminderItems.length) return
        const storageKey = getDailyReminderStorageKey(user)
        if (localStorage.getItem(storageKey) === '1') return
        setShowReminderModal(true)
        localStorage.setItem(storageKey, '1')
    }, [reminderItems.length, user])

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

            {reminderItems.length ? (
                <div className="card" style={{ marginBottom: 20, border: '1px solid rgba(56,189,248,0.25)', background: 'rgba(56,189,248,0.08)' }}>
                    <div className="card-title flex-between">
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <AlertCircle size={18} style={{ color: '#38bdf8' }} />
                            Recordatorios clinicos pendientes
                        </span>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowReminderModal(true)}>
                            Ver recordatorios
                        </button>
                    </div>
                    <div style={{ color: 'var(--text-muted)' }}>
                        Hay {reminderItems.length} recordatorio(s) pendientes para controles clinicos.
                    </div>
                </div>
            ) : null}

            {birthdayItems.length ? (
                <div className="card" style={{ marginBottom: 20, border: '1px solid rgba(251,191,36,0.28)', background: 'rgba(251,191,36,0.08)' }}>
                    <div className="card-title flex-between">
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Gift size={18} style={{ color: '#fbbf24' }} />
                            Cumpleaños de hoy
                        </span>
                        <a href="/clientes/cumpleanos" className="btn btn-secondary btn-sm">
                            Ver modulo
                        </a>
                    </div>
                    <div style={{ color: 'var(--text-muted)', marginBottom: 12 }}>
                        Hay {birthdayItems.length} cliente(s) de cumpleaños hoy.
                    </div>
                    <div style={{ display: 'grid', gap: 10 }}>
                        {birthdayItems.slice(0, 4).map(cliente => {
                            const whatsappLink = buildBirthdayWhatsappLink(cliente, empresaNombre)
                            return (
                                <div key={cliente.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '10px 12px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, background: 'rgba(255,255,255,0.03)' }}>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontWeight: 800 }}>{cliente.nombre}</div>
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                                            {cliente.edad ? `Cumple ${cliente.edad} años` : 'Cumpleaños registrado'} {cliente.telefono ? `- ${cliente.telefono}` : ''}
                                        </div>
                                    </div>
                                    <a
                                        href={whatsappLink || undefined}
                                        target="_blank"
                                        rel="noreferrer"
                                        className={`btn btn-secondary btn-sm ${!whatsappLink ? 'disabled' : ''}`}
                                        onClick={event => {
                                            if (!whatsappLink) {
                                                event.preventDefault()
                                                window.alert('Este cliente no tiene telefono valido para WhatsApp.')
                                            }
                                        }}
                                        style={!whatsappLink ? { pointerEvents: 'auto', opacity: 0.6 } : undefined}
                                    >
                                        <MessageCircle size={14} /> WhatsApp
                                    </a>
                                </div>
                            )
                        })}
                    </div>
                    {birthdayItems.length > 4 ? (
                        <div style={{ marginTop: 10, color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                            Y {birthdayItems.length - 4} más en el módulo de cumpleaños.
                        </div>
                    ) : null}
                </div>
            ) : null}

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
            {showReminderModal && reminderItems.length ? (
                <Modal title="Recordatorios clinicos pendientes" onClose={() => setShowReminderModal(false)} maxWidth="920px">
                    <ReminderCards
                        items={reminderItems}
                        onMarkRemembered={item => markReminderMutation.mutate(item)}
                        actionPendingId={markReminderMutation.variables?.id}
                    />
                </Modal>
            ) : null}
        </div>
    )
}
