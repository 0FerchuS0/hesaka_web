import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
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
import { getWhatsappTemplateByCode, useWhatsappTemplatesCatalog } from '../hooks/useWhatsappTemplates'
import { formatCurrentBusinessDate, parseBackendDateTime, todayBusinessInputValue } from '../utils/formatters'

const DEFAULT_DASHBOARD_RECORDATORIO_TEMPLATE = 'Hola {paciente}, te escribimos de {empresa}. Tu ultima consulta fue el {ultima_consulta} y tu proximo control esta previsto para el {proxima_consulta} a las {hora_turno}. Quedamos atentos para ayudarte a confirmar tu cita.'
const DEFAULT_CUMPLEANOS_TEMPLATE = 'Hola {cliente}, te escribimos de {empresa}. Queremos desearte un muy feliz cumpleaños. Que tengas un excelente dia.'
const DASHBOARD_RECORDATORIO_TEMPLATE_CODE = 'dashboard_recordatorio'
const CUMPLEANOS_TEMPLATE_CODE = 'cumpleanos_cliente'

function fmt(value) {
    return new Intl.NumberFormat('es-PY', {
        style: 'currency',
        currency: 'PYG',
        maximumFractionDigits: 0,
    }).format(value ?? 0)
}

function todayInputValue() {
    return todayBusinessInputValue()
}

function fmtShortRange(desde, hasta) {
    const start = new Date(desde)
    const end = new Date(hasta)
    const dd = value => String(value).padStart(2, '0')
    return `${dd(start.getDate())}/${dd(start.getMonth() + 1)} - ${dd(end.getDate())}/${dd(end.getMonth() + 1)}/${end.getFullYear()}`
}

function StatCard({ icon: Icon, iconClass, label, value, sub, valueClassName = '', cardClassName = '' }) {
    return (
        <div className={`stat-card ${cardClassName}`.trim()}>
            <div className={`stat-icon ${iconClass}`}><Icon size={22} /></div>
            <div className="stat-info">
                <div className="stat-label">{label}</div>
                <div className={`stat-value ${valueClassName}`.trim()}>{value}</div>
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
    const date = parseBackendDateTime(value)
    if (!date || Number.isNaN(date.getTime())) return '-'
    return date.toLocaleDateString('es-PY')
}

function fmtDateTime(value) {
    if (!value) return '-'
    const date = parseBackendDateTime(value)
    if (!date || Number.isNaN(date.getTime())) return '-'
    return date.toLocaleString('es-PY')
}

function fmtTime(value) {
    if (!value) return 'sin hora'
    const date = parseBackendDateTime(value)
    if (!date || Number.isNaN(date.getTime())) return 'sin hora'
    return date.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })
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

function buildReminderWhatsappLink(item, empresa = 'HESAKA', template = DEFAULT_DASHBOARD_RECORDATORIO_TEMPLATE) {
    const telefono = normalizarTelefonoWhatsapp(item?.paciente_telefono)
    if (!telefono) return ''
    const ultimaConsulta = item?.ultima_consulta_fecha ? fmtDate(item.ultima_consulta_fecha) : 'sin registro'
    const proximaConsulta = item?.fecha_hora ? fmtDate(item.fecha_hora) : 'sin fecha'
    const horaTurno = fmtTime(item?.fecha_hora)
    const mensaje = (template || DEFAULT_DASHBOARD_RECORDATORIO_TEMPLATE)
        .replaceAll('{paciente}', item?.paciente_nombre || '')
        .replaceAll('{ultima_consulta}', ultimaConsulta)
        .replaceAll('{proxima_consulta}', proximaConsulta)
        .replaceAll('{hora_turno}', horaTurno)
        .replaceAll('{empresa}', empresa)
    return `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`
}

function buildBirthdayWhatsappLink(cliente, empresa = 'HESAKA', template = DEFAULT_CUMPLEANOS_TEMPLATE) {
    const telefono = normalizarTelefonoWhatsapp(cliente?.telefono)
    if (!telefono) return ''
    const mensaje = (template || DEFAULT_CUMPLEANOS_TEMPLATE)
        .replaceAll('{cliente}', cliente?.nombre || '')
        .replaceAll('{empresa}', empresa)
    return `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`
}

function flattenReminderBuckets(reminderBuckets) {
    return [
        ...(reminderBuckets?.hoy || []),
        ...(reminderBuckets?.tres_dias || []),
    ]
}

function getReminderBadgeLabel(categoria) {
    if (categoria === 'hoy') return 'Hoy'
    if (categoria === '3_dias') return 'En 3 dias'
    return 'Pendiente'
}

function getReminderBadgeClass(categoria) {
    return categoria === 'hoy' ? 'badge-red' : 'badge-yellow'
}

function getDailyReminderStorageKey(user) {
    const userKey = user?.id || user?.email || user?.nombre || 'anon'
    return `hesaka-recordatorios-vistos-${userKey}-${todayInputValue()}`
}

function ReminderCards({ items, onMarkRemembered, actionPendingId = null, empresaNombre = 'HESAKA', reminderTemplate = DEFAULT_DASHBOARD_RECORDATORIO_TEMPLATE }) {
    return (
        <div style={{ display: 'grid', gap: 12 }}>
            {items.map(item => {
                const whatsappLink = buildReminderWhatsappLink(item, empresaNombre, reminderTemplate)
                const isPending = actionPendingId === item.id
                return (
                    <div key={`${item.id}-${item.recordatorio_categoria || 'sin-categoria'}`} className="card" style={{ padding: 14, background: 'rgba(255,255,255,0.02)' }}>
                        <div className="flex-between" style={{ gap: 12, alignItems: 'flex-start' }}>
                            <div style={{ display: 'grid', gap: 6 }}>
                                <div style={{ fontWeight: 700 }}>{item.paciente_nombre}</div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.86rem' }}>Ultima consulta: {item.ultima_consulta_fecha ? fmtDate(item.ultima_consulta_fecha) : 'Sin registro'}</div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.86rem' }}>Proxima consulta: {fmtDateTime(item.fecha_hora)}</div>
                            </div>
                            <span className={`badge ${getReminderBadgeClass(item.recordatorio_categoria)}`}>
                                {getReminderBadgeLabel(item.recordatorio_categoria)}
                            </span>
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

function BirthdayCards({ items, empresaNombre = 'HESAKA', template = DEFAULT_CUMPLEANOS_TEMPLATE }) {
    return (
        <div style={{ display: 'grid', gap: 12 }}>
            {items.map(cliente => {
                const whatsappLink = buildBirthdayWhatsappLink(cliente, empresaNombre, template)
                return (
                    <div key={cliente.id} className="card" style={{ padding: 14, background: 'rgba(255,255,255,0.02)' }}>
                        <div className="flex-between" style={{ gap: 12, alignItems: 'flex-start' }}>
                            <div style={{ display: 'grid', gap: 6 }}>
                                <div style={{ fontWeight: 700 }}>{cliente.nombre}</div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.86rem' }}>
                                    {cliente.edad ? `Cumple ${cliente.edad} anos` : 'Cumpleanos registrado'}
                                </div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.86rem' }}>
                                    {cliente.telefono || 'Sin telefono cargado'}
                                </div>
                            </div>
                            <span className="badge badge-yellow">Hoy</span>
                        </div>
                        <div className="flex gap-12" style={{ marginTop: 12, flexWrap: 'wrap' }}>
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
    const [showBirthdayModal, setShowBirthdayModal] = useState(false)
    const [loadSecondarySections, setLoadSecondarySections] = useState(false)

    useEffect(() => {
        const timerId = window.setTimeout(() => {
            setLoadSecondarySections(true)
        }, 150)
        return () => window.clearTimeout(timerId)
    }, [])

    const { data: dashboard } = useQuery({
        queryKey: ['dashboard-resumen'],
        queryFn: () => api.get('/reportes/dashboard/resumen').then(response => response.data),
        retry: false,
    })
    const reminderSummaryQuery = useQuery({
        queryKey: ['clinica', 'agenda-recordatorios-resumen'],
        queryFn: async () => (await api.get('/clinica/agenda/recordatorios/resumen')).data,
        enabled: loadSecondarySections,
        staleTime: 60 * 1000,
    })
    const birthdaySummaryQuery = useQuery({
        queryKey: ['clientes', 'cumpleanos-resumen', todayInputValue()],
        queryFn: async () => (await api.get('/clientes/cumpleanos/resumen')).data,
        enabled: loadSecondarySections,
        staleTime: 5 * 60 * 1000,
        retry: false,
    })
    const reminderDetailQuery = useQuery({
        queryKey: ['clinica', 'agenda-recordatorios'],
        queryFn: async () => (await api.get('/clinica/agenda/recordatorios')).data,
        enabled: loadSecondarySections && showReminderModal,
        staleTime: 60 * 1000,
    })
    const birthdayDetailQuery = useQuery({
        queryKey: ['clientes', 'cumpleanos', todayInputValue()],
        queryFn: async () => (await api.get('/clientes/cumpleanos')).data,
        enabled: loadSecondarySections && showBirthdayModal,
        staleTime: 5 * 60 * 1000,
        retry: false,
    })
    const notificationsDetailEnabled = loadSecondarySections && (showReminderModal || showBirthdayModal)
    const { data: configPublica } = useQuery({
        queryKey: ['configuracion-general-publica'],
        queryFn: () => api.get('/configuracion-general/publica').then(response => response.data),
        enabled: notificationsDetailEnabled,
        staleTime: 5 * 60 * 1000,
        retry: false,
    })
    const { data: whatsappTemplates = [] } = useWhatsappTemplatesCatalog({ enabled: notificationsDetailEnabled })

    const markReminderMutation = useMutation({
        mutationFn: async item => {
            await api.post(`/clinica/agenda/${item.id}/recordatorios/${item.recordatorio_categoria}/recordado`)
        },
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['clinica', 'agenda-recordatorios'] }),
                queryClient.invalidateQueries({ queryKey: ['clinica', 'agenda-recordatorios-resumen'] }),
                queryClient.invalidateQueries({ queryKey: ['clinica', 'agenda'] }),
                queryClient.invalidateQueries({ queryKey: ['clinica', 'dashboard'] }),
            ])
        },
    })

    const reminderSummary = reminderSummaryQuery.data || { total: 0, hoy_count: 0, tres_dias_count: 0, hoy_preview: [], tres_dias_preview: [] }
    const birthdaySummary = birthdaySummaryQuery.data || { total: 0, preview: [] }
    const reminderItems = flattenReminderBuckets(reminderDetailQuery.data)
    const birthdayItems = birthdayDetailQuery.data || []
    const empresaNombre = (configPublica?.nombre || '').trim() || 'HESAKA'
    const reminderTemplate = getWhatsappTemplateByCode(
        whatsappTemplates,
        DASHBOARD_RECORDATORIO_TEMPLATE_CODE,
        DEFAULT_DASHBOARD_RECORDATORIO_TEMPLATE,
    )
    const cumpleanosTemplate = getWhatsappTemplateByCode(
        whatsappTemplates,
        CUMPLEANOS_TEMPLATE_CODE,
        DEFAULT_CUMPLEANOS_TEMPLATE,
    )

    useEffect(() => {
        if (!reminderSummary.total) return
        const storageKey = getDailyReminderStorageKey(user)
        if (localStorage.getItem(storageKey) === '1') return
        setShowReminderModal(true)
        localStorage.setItem(storageKey, '1')
    }, [reminderSummary.total, user])

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
                            {formatCurrentBusinessDate('es-PY', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                </div>
            </div>

            <div className="stats-grid">
                <StatCard
                    icon={DollarSign}
                    iconClass="green"
                    label="Saldo en Caja"
                    value={fmt(dashboard?.saldo_caja ?? 0)}
                    valueClassName="stat-value--currency"
                    cardClassName="stat-card--stacked"
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
                    valueClassName="stat-value--module"
                    cardClassName="stat-card--stacked"
                />
            </div>

            <div className="dashboard-notifications-grid">
                    <div className="card dashboard-notification-card dashboard-notification-card--reminder">
                        <div className="card-title flex-between">
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <AlertCircle size={18} style={{ color: '#38bdf8' }} />
                                Recordatorios de consulta
                            </span>
                            <span className={`badge ${reminderSummary.total ? 'badge-red' : 'badge-gray'}`}>{reminderSummary.total}</span>
                        </div>
                        <div style={{ color: 'var(--text-muted)', marginBottom: 14 }}>
                            {reminderSummary.total
                                ? `${reminderSummary.hoy_count} para hoy y ${reminderSummary.tres_dias_count} para dentro de 3 dias.`
                                : 'No hay recordatorios pendientes en este momento.'}
                        </div>
                        <div style={{ display: 'grid', gap: 10 }}>
                            {[
                                { key: 'hoy', title: 'Hoy', items: reminderSummary.hoy_preview || [], badgeClass: 'badge-red', count: reminderSummary.hoy_count },
                                { key: '3_dias', title: 'En 3 dias', items: reminderSummary.tres_dias_preview || [], badgeClass: 'badge-yellow', count: reminderSummary.tres_dias_count },
                            ].map(bucket => (
                                <div key={bucket.key} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.04)' }}>
                                    <div className="flex-between" style={{ gap: 8, marginBottom: 8 }}>
                                        <strong>{bucket.title}</strong>
                                        <span className={`badge ${bucket.badgeClass}`}>{bucket.count}</span>
                                    </div>
                                    {bucket.items.length ? (
                                        <div style={{ display: 'grid', gap: 8 }}>
                                            {bucket.items.map(item => (
                                                <div key={`${bucket.key}-${item.id}`} style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(15,23,42,0.24)' }}>
                                                    <div style={{ fontWeight: 700 }}>{item.paciente_nombre}</div>
                                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>{fmtDateTime(item.fecha_hora)}</div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Sin pendientes en esta franja.</div>
                                    )}
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-12" style={{ marginTop: 14, flexWrap: 'wrap' }}>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowReminderModal(true)} disabled={!reminderSummary.total}>
                                Abrir bandeja
                            </button>
                        </div>
                    </div>

                    <div className="card dashboard-notification-card dashboard-notification-card--birthday">
                        <div className="card-title flex-between">
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Gift size={18} style={{ color: '#fbbf24' }} />
                                Cumpleanos de hoy
                            </span>
                            <span className={`badge ${birthdaySummary.total ? 'badge-yellow' : 'badge-gray'}`}>{birthdaySummary.total}</span>
                        </div>
                        <div style={{ color: 'var(--text-muted)', marginBottom: 14 }}>
                            {birthdaySummary.total
                                ? `Hay ${birthdaySummary.total} cliente(s) o paciente(s) para saludar hoy.`
                                : 'No hay cumpleanos registrados para hoy.'}
                        </div>
                        <div style={{ display: 'grid', gap: 8 }}>
                            {(birthdaySummary.preview || []).length ? birthdaySummary.preview.map(cliente => (
                                <div key={cliente.id} style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                    <div style={{ fontWeight: 700 }}>{cliente.nombre}</div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                                        {cliente.edad ? `Cumple ${cliente.edad} anos` : 'Cumpleanos registrado'}
                                        {cliente.telefono ? ` - ${cliente.telefono}` : ''}
                                    </div>
                                </div>
                            )) : (
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Nada pendiente para hoy.</div>
                            )}
                        </div>
                        <div className="flex gap-12" style={{ marginTop: 14, flexWrap: 'wrap' }}>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowBirthdayModal(true)} disabled={!birthdaySummary.total}>
                                Abrir saludos
                            </button>
                            <Link to="/clientes/cumpleanos" className="btn btn-secondary btn-sm">
                                Ver modulo
                            </Link>
                        </div>
                    </div>
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
                                        <td>{parseBackendDateTime(compra.fecha)?.toLocaleDateString('es-PY') || '-'}</td>
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
                .dashboard-notifications-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
                    gap: 18px;
                    margin-bottom: 20px;
                }
                .dashboard-notification-card {
                    min-width: 0;
                }
                .dashboard-notification-card--reminder {
                    border: 1px solid rgba(56,189,248,0.25);
                    background: rgba(56,189,248,0.08);
                }
                .dashboard-notification-card--birthday {
                    border: 1px solid rgba(251,191,36,0.28);
                    background: rgba(251,191,36,0.08);
                }
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
            {showReminderModal ? (
                <Modal title="Recordatorios clinicos pendientes" onClose={() => setShowReminderModal(false)} maxWidth="920px">
                    {reminderDetailQuery.isLoading ? (
                        <div className="empty-state" style={{ padding: '32px 20px' }}>
                            <div className="spinner" style={{ width: 28, height: 28, marginBottom: 12 }} />
                            <p>Cargando recordatorios...</p>
                        </div>
                    ) : (
                        <ReminderCards
                            items={reminderItems}
                            onMarkRemembered={item => markReminderMutation.mutate(item)}
                            actionPendingId={markReminderMutation.variables?.id}
                            empresaNombre={empresaNombre}
                            reminderTemplate={reminderTemplate}
                        />
                    )}
                </Modal>
            ) : null}
            {showBirthdayModal ? (
                <Modal title="Saludos de cumpleanos pendientes" onClose={() => setShowBirthdayModal(false)} maxWidth="920px">
                    {birthdayDetailQuery.isLoading ? (
                        <div className="empty-state" style={{ padding: '32px 20px' }}>
                            <div className="spinner" style={{ width: 28, height: 28, marginBottom: 12 }} />
                            <p>Cargando cumpleanos...</p>
                        </div>
                    ) : (
                        <BirthdayCards
                            items={birthdayItems}
                            empresaNombre={empresaNombre}
                            template={cumpleanosTemplate}
                        />
                    )}
                </Modal>
            ) : null}
        </div>
    )
}
