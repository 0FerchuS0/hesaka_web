import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../context/AuthContext'
import Modal from '../components/Modal'
import RemoteSearchSelect from '../components/RemoteSearchSelect'
import { Landmark, ReceiptText, Trash2, Wallet } from 'lucide-react'

const fmt = value => new Intl.NumberFormat('es-PY').format(value ?? 0)
const fmtDate = value => value ? new Date(value).toLocaleDateString('es-PY') : '—'

function estadoBadge(estado) {
    const map = {
        PAGADO: 'badge-green',
        PENDIENTE: 'badge-yellow',
    }
    return <span className={`badge ${map[estado] || 'badge-gray'}`}>{estado}</span>
}

function PagoComisionModal({ comision, onClose, onSaved }) {
    const [form, setForm] = useState({
        metodo_pago: 'EFECTIVO',
        banco_id: '',
        numero_referencia: '',
    })
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)

    const { data: bancos = [] } = useMemo(() => ({ data: [] }), [])
    const [bancosData, setBancosData] = useState([])

    useEffect(() => {
        let active = true
        api.get('/bancos/').then(res => {
            if (active) setBancosData(res.data || [])
        }).catch(() => {
            if (active) setBancosData([])
        })
        return () => { active = false }
    }, [])

    const requiereBanco = ['TRANSFERENCIA', 'CHEQUE'].includes(form.metodo_pago)

    const submit = async event => {
        event.preventDefault()
        try {
            setSaving(true)
            setError('')
            await api.post(`/comisiones/${comision.id}/pagar`, {
                metodo_pago: form.metodo_pago,
                banco_id: requiereBanco ? parseInt(form.banco_id, 10) : null,
                numero_referencia: requiereBanco ? form.numero_referencia : null,
            })
            onSaved()
        } catch (err) {
            setError(err?.response?.data?.detail || 'No se pudo registrar el pago de la comision.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <form onSubmit={submit}>
            <div className="card" style={{ marginBottom: 16, padding: '14px 16px' }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{comision.referidor_nombre || 'Referidor'}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.45 }}>
                    Fecha: {fmtDate(comision.fecha)}<br />
                    Cliente: {comision.cliente_nombre || '—'}<br />
                    Venta: {comision.venta_codigo || '—'}
                </div>
                <div style={{ marginTop: 10, fontSize: '1.2rem', fontWeight: 800, color: 'var(--primary-light)' }}>
                    Gs. {fmt(comision.monto)}
                </div>
            </div>

            <div className="grid-2">
                <div className="form-group">
                    <label className="form-label">Metodo de pago</label>
                    <select
                        className="form-select"
                        value={form.metodo_pago}
                        onChange={event => setForm(prev => ({ ...prev, metodo_pago: event.target.value, banco_id: '', numero_referencia: '' }))}
                    >
                        <option value="EFECTIVO">EFECTIVO</option>
                        <option value="TRANSFERENCIA">TRANSFERENCIA</option>
                        <option value="CHEQUE">CHEQUE</option>
                    </select>
                </div>
                {requiereBanco && (
                    <div className="form-group">
                        <label className="form-label">Banco</label>
                        <select
                            className="form-select"
                            value={form.banco_id}
                            onChange={event => setForm(prev => ({ ...prev, banco_id: event.target.value }))}
                            required
                        >
                            <option value="">Seleccionar banco</option>
                            {bancosData.map(item => (
                                <option key={item.id} value={item.id}>{item.nombre_banco}</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {requiereBanco && (
                <div className="form-group">
                    <label className="form-label">Numero de referencia</label>
                    <input
                        className="form-input"
                        value={form.numero_referencia}
                        onChange={event => setForm(prev => ({ ...prev, numero_referencia: event.target.value.toUpperCase() }))}
                        required
                        placeholder="Transferencia o cheque"
                    />
                </div>
            )}

            {error && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#f87171' }}>
                    {error}
                </div>
            )}

            <div className="flex gap-12" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>Confirmar pago</button>
            </div>
        </form>
    )
}

function ComisionRowActions({ item, onPagar, onPendiente }) {
    const [open, setOpen] = useState(false)
    const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 })
    const buttonRef = useRef(null)

    const handleAction = callback => {
        setOpen(false)
        callback()
    }

    const toggleMenu = () => {
        if (open) {
            setOpen(false)
            return
        }
        const rect = buttonRef.current?.getBoundingClientRect()
        if (!rect) return
        const menuWidth = 210
        const menuHeight = item.estado === 'PAGADO' ? 64 : 64
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight
        let left = rect.right - menuWidth
        let top = rect.bottom + 6
        if (left < 8) left = 8
        if (left + menuWidth > viewportWidth - 8) left = viewportWidth - menuWidth - 8
        if (top + menuHeight > viewportHeight - 8) top = rect.top - menuHeight - 6
        if (top < 8) top = 8
        setMenuPosition({ top, left })
        setOpen(true)
    }

    return (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button ref={buttonRef} type="button" className="btn btn-secondary btn-sm" onClick={toggleMenu}>
                Acciones v
            </button>
            {open && (
                <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={() => setOpen(false)} />
                    <div style={{ position: 'fixed', top: menuPosition.top, left: menuPosition.left, minWidth: 210, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 14px 34px rgba(0,0,0,0.45)', padding: '6px 0', zIndex: 100 }}>
                        {item.estado === 'PENDIENTE' ? (
                            <button className="dropdown-item" onClick={() => handleAction(() => onPagar(item))}>
                                <Wallet size={14} style={{ marginRight: 8 }} /> Pagar comision
                            </button>
                        ) : (
                            <button className="dropdown-item" style={{ color: 'var(--warning)' }} onClick={() => handleAction(() => onPendiente(item))}>
                                <Trash2 size={14} style={{ marginRight: 8 }} /> Volver a pendiente
                            </button>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}

export default function ReporteComisionesPage() {
    const hoy = useMemo(() => new Date(), [])
    const primerDia = useMemo(() => new Date(hoy.getFullYear(), hoy.getMonth(), 1), [hoy])
    const formatYMD = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

    const [fechaDesde, setFechaDesde] = useState(formatYMD(primerDia))
    const [fechaHasta, setFechaHasta] = useState(formatYMD(hoy))
    const [estado, setEstado] = useState('')
    const [referidorSeleccionado, setReferidorSeleccionado] = useState(null)
    const [referidorBusqueda, setReferidorBusqueda] = useState('')
    const [referidores, setReferidores] = useState([])
    const [referidoresLoading, setReferidoresLoading] = useState(false)
    const [filtrosAplicados, setFiltrosAplicados] = useState({
        fechaDesde: formatYMD(primerDia),
        fechaHasta: formatYMD(hoy),
        estado: '',
        referidorId: '',
    })
    const [data, setData] = useState([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [comisionPago, setComisionPago] = useState(null)

    useEffect(() => {
        const timer = setTimeout(async () => {
            try {
                setReferidoresLoading(true)
                const params = new URLSearchParams({ page: '1', page_size: '20' })
                if (referidorBusqueda.trim()) params.set('buscar', referidorBusqueda.trim())
                const response = await api.get(`/referidores/listado-optimizado?${params.toString()}`)
                setReferidores(response.data.items || [])
            } catch {
                setReferidores([])
            } finally {
                setReferidoresLoading(false)
            }
        }, 250)
        return () => clearTimeout(timer)
    }, [referidorBusqueda])

    const cargarComisiones = async filtros => {
        try {
            setLoading(true)
            setError('')
            const params = new URLSearchParams()
            if (filtros.fechaDesde) params.set('fecha_desde', filtros.fechaDesde)
            if (filtros.fechaHasta) params.set('fecha_hasta', filtros.fechaHasta)
            if (filtros.referidorId) params.set('referidor_id', filtros.referidorId)
            if (filtros.estado) params.set('estado', filtros.estado)
            const response = await api.get(`/comisiones/?${params.toString()}`)
            setData(response.data || [])
        } catch (err) {
            setError(err?.response?.data?.detail || 'No se pudieron cargar las comisiones.')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        cargarComisiones(filtrosAplicados)
    }, [filtrosAplicados])

    const aplicarFiltros = () => {
        setFiltrosAplicados({
            fechaDesde,
            fechaHasta,
            estado,
            referidorId: referidorSeleccionado?.value ? String(referidorSeleccionado.value) : '',
        })
    }

    const limpiarFiltros = () => {
        const nuevos = {
            fechaDesde: formatYMD(primerDia),
            fechaHasta: formatYMD(hoy),
            estado: '',
            referidorId: '',
        }
        setFechaDesde(nuevos.fechaDesde)
        setFechaHasta(nuevos.fechaHasta)
        setEstado('')
        setReferidorSeleccionado(null)
        setReferidorBusqueda('')
        setFiltrosAplicados(nuevos)
    }

    const totalMonto = data.reduce((sum, item) => sum + (item.monto || 0), 0)
    const totalPendiente = data.filter(item => item.estado === 'PENDIENTE').reduce((sum, item) => sum + (item.monto || 0), 0)
    const totalPagado = data.filter(item => item.estado === 'PAGADO').reduce((sum, item) => sum + (item.monto || 0), 0)

    const recargar = () => {
        cargarComisiones(filtrosAplicados)
        setComisionPago(null)
    }

    const volverPendiente = async item => {
        if (!confirm(`¿Volver la comision #${item.id} a PENDIENTE?`)) return
        try {
            await api.post(`/comisiones/${item.id}/pendiente`)
            recargar()
        } catch (err) {
            alert(err?.response?.data?.detail || 'No se pudo revertir la comision.')
        }
    }

    return (
        <div className="page-body">
            <div className="flex-between mb-24" style={{ gap: 12, flexWrap: 'wrap' }}>
                <div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Comisiones</h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Comisiones de referidores con filtros, pago y reversión.</p>
                </div>
            </div>

            <div className="stats-grid" style={{ marginBottom: 20 }}>
                <div className="stat-card">
                    <div className="stat-content">
                        <div className="stat-label">Total comisiones</div>
                        <div className="stat-value">Gs. {fmt(totalMonto)}</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-content">
                        <div className="stat-label">Pendientes</div>
                        <div className="stat-value" style={{ color: 'var(--warning)' }}>Gs. {fmt(totalPendiente)}</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-content">
                        <div className="stat-label">Pagadas</div>
                        <div className="stat-value" style={{ color: 'var(--success)' }}>Gs. {fmt(totalPagado)}</div>
                    </div>
                </div>
            </div>

            <div className="card" style={{ marginBottom: 18 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Desde</label>
                        <input className="form-input" type="date" value={fechaDesde} onChange={event => setFechaDesde(event.target.value)} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Hasta</label>
                        <input className="form-input" type="date" value={fechaHasta} onChange={event => setFechaHasta(event.target.value)} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Referidor</label>
                        <RemoteSearchSelect
                            value={referidorSeleccionado}
                            onChange={option => setReferidorSeleccionado(option || null)}
                            onSearch={setReferidorBusqueda}
                            options={referidores.map(item => ({ value: item.id, label: item.nombre }))}
                            loading={referidoresLoading}
                            placeholder="Buscar referidor..."
                            emptyMessage="No se encontraron referidores"
                            promptMessage="Escriba para buscar referidor"
                        />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Estado</label>
                        <select className="form-select" value={estado} onChange={event => setEstado(event.target.value)}>
                            <option value="">Todos</option>
                            <option value="PENDIENTE">PENDIENTE</option>
                            <option value="PAGADO">PAGADO</option>
                        </select>
                    </div>
                </div>
                <div className="filters-actions" style={{ display: 'flex', gap: 10, marginTop: 15, flexWrap: 'wrap' }}>
                    <button className="btn btn-primary" onClick={aplicarFiltros}>
                        Aplicar filtros
                    </button>
                    <button className="btn btn-secondary" onClick={limpiarFiltros}>
                        Limpiar
                    </button>
                </div>
            </div>

            <div className="card" style={{ padding: 0 }}>
                {loading ? (
                    <div className="flex-center" style={{ padding: 60 }}><div className="spinner" style={{ width: 30, height: 30 }} /></div>
                ) : error ? (
                    <div className="empty-state" style={{ padding: '40px 20px' }}>
                        <ReceiptText size={34} />
                        <p>{error}</p>
                    </div>
                ) : data.length === 0 ? (
                    <div className="empty-state" style={{ padding: '40px 20px' }}>
                        <ReceiptText size={34} />
                        <p>No hay comisiones para los filtros seleccionados.</p>
                    </div>
                ) : (
                    <div className="table-container">
                        <table style={{ minWidth: 1080 }}>
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Fecha</th>
                                    <th>Referidor</th>
                                    <th>Cliente</th>
                                    <th>Venta</th>
                                    <th>Descripcion</th>
                                    <th>Monto</th>
                                    <th>Estado</th>
                                    <th style={{ width: 130 }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.map(item => (
                                    <tr key={item.id}>
                                        <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>{item.id}</td>
                                        <td style={{ whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{fmtDate(item.fecha)}</td>
                                        <td style={{ fontWeight: 700, lineHeight: 1.35 }}>{item.referidor_nombre || '—'}</td>
                                        <td style={{ lineHeight: 1.35 }}>{item.cliente_nombre || '—'}</td>
                                        <td style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{item.venta_codigo || '—'}</td>
                                        <td style={{ color: 'var(--text-secondary)', lineHeight: 1.35 }}>{item.descripcion || '—'}</td>
                                        <td style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>Gs. {fmt(item.monto)}</td>
                                        <td>{estadoBadge(item.estado)}</td>
                                        <td><ComisionRowActions item={item} onPagar={setComisionPago} onPendiente={volverPendiente} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {comisionPago && (
                <Modal title={`Pagar comision #${comisionPago.id}`} onClose={() => setComisionPago(null)} maxWidth="640px">
                    <PagoComisionModal comision={comisionPago} onClose={() => setComisionPago(null)} onSaved={recargar} />
                </Modal>
            )}
        </div>
    )
}
