import { useEffect, useRef, useState } from 'react'
import { Edit, FileText, Plus, Trash2 } from 'lucide-react'

import LoadingButton from '../components/LoadingButton'
import Modal from '../components/Modal'
import RemoteSearchSelect from '../components/RemoteSearchSelect'
import { api } from '../context/AuthContext'
import { parseBackendDateTime } from '../utils/formatters'

const fmt = value => new Intl.NumberFormat('es-PY').format(value ?? 0)
const fmtDate = value => {
    const date = parseBackendDateTime(value)
    return date ? date.toLocaleString('es-PY') : '-'
}
const getErrorText = (err, fallback) => {
    const detail = err?.response?.data?.detail
    if (typeof detail === 'string' && detail.trim()) return detail
    if (Array.isArray(detail)) {
        const parts = detail.map(item => {
            if (typeof item === 'string') return item
            if (item && typeof item === 'object') {
                const loc = Array.isArray(item.loc) ? item.loc.join(' > ') : ''
                const msg = item.msg || item.message || JSON.stringify(item)
                return loc ? `${loc}: ${msg}` : msg
            }
            return ''
        }).filter(Boolean)
        if (parts.length) return parts.join(' | ')
    }
    if (detail && typeof detail === 'object') {
        if (detail.msg) return detail.msg
        return JSON.stringify(detail)
    }
    return fallback
}

const formatYmd = value =>
    `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`

function tipoBadge(tipo) {
    const tone = {
        DESCUENTO: 'badge-blue',
        NOTA_CREDITO: 'badge-red',
        AJUSTE: 'badge-yellow',
    }
    return <span className={`badge ${tone[tipo] || 'badge-gray'}`}>{tipo}</span>
}

function AjusteFormModal({ mode = 'create', ajuste = null, onClose, onSaved }) {
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)
    const [ventas, setVentas] = useState([])
    const [ventasLoading, setVentasLoading] = useState(false)
    const [ventaBusqueda, setVentaBusqueda] = useState('')
    const [ventaSeleccionada, setVentaSeleccionada] = useState(null)
    const [form, setForm] = useState({
        venta_id: ajuste?.venta_id ? String(ajuste.venta_id) : '',
        tipo: ajuste?.tipo || 'AJUSTE',
        monto: ajuste?.monto ? String(ajuste.monto) : '',
        motivo: ajuste?.motivo || '',
    })

    useEffect(() => {
        if (mode === 'edit' && ajuste) {
            setVentaSeleccionada({
                value: ajuste.venta_id,
                label: `${ajuste.venta_codigo || '-'} - ${ajuste.cliente_nombre || '-'}`,
            })
        }
    }, [ajuste, mode])

    useEffect(() => {
        if (mode === 'edit') return
        let active = true
        const cargarVentas = async () => {
            const term = ventaBusqueda.trim()
            try {
                if (active) setVentasLoading(true)
                const params = new URLSearchParams({ page: '1', page_size: '20' })
                if (term) params.append('search', term)
                const response = await api.get(`/ventas/listado-optimizado?${params.toString()}`)
                if (active) setVentas(response.data.items || [])
            } catch (err) {
                console.error('Error cargando ventas para ajuste:', err)
                if (active) setVentas([])
            } finally {
                if (active) setVentasLoading(false)
            }
        }

        if (!ventaBusqueda.trim()) {
            cargarVentas()
            return () => { active = false }
        }

        const timer = setTimeout(cargarVentas, 250)
        return () => {
            active = false
            clearTimeout(timer)
        }
    }, [mode, ventaBusqueda])

    const submit = async event => {
        event.preventDefault()
        try {
            setSaving(true)
            setError('')
            const payload = {
                venta_id: parseInt(form.venta_id, 10),
                tipo: form.tipo,
                monto: parseFloat(form.monto),
                motivo: form.motivo,
            }
            if (!payload.venta_id || Number.isNaN(payload.venta_id)) {
                setError('Debe seleccionar una venta.')
                setSaving(false)
                return
            }
            if (!payload.monto || Number.isNaN(payload.monto) || payload.monto <= 0) {
                setError('Debe ingresar un monto valido.')
                setSaving(false)
                return
            }

            if (mode === 'create') {
                await api.post('/ventas/ajustes', payload)
            } else {
                await api.put(`/ventas/ajustes/${ajuste.id}`, {
                    tipo: payload.tipo,
                    monto: payload.monto,
                    motivo: payload.motivo,
                })
            }
            onSaved()
        } catch (err) {
            setError(getErrorText(err, `No se pudo ${mode === 'create' ? 'registrar' : 'actualizar'} el ajuste.`))
        } finally {
            setSaving(false)
        }
    }

    return (
        <form onSubmit={submit}>
            <div className="grid-2">
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label">Venta</label>
                    {mode === 'create' ? (
                        <RemoteSearchSelect
                            value={ventaSeleccionada}
                            onChange={option => {
                                setVentaSeleccionada(option || null)
                                setForm(prev => ({ ...prev, venta_id: option ? String(option.value) : '' }))
                            }}
                            onSearch={setVentaBusqueda}
                            options={ventas.map(item => ({
                                value: item.id,
                                label: `${item.codigo} - ${item.cliente_nombre}`,
                            }))}
                            loading={ventasLoading}
                            placeholder="Buscar venta por codigo o cliente..."
                            emptyMessage="No se encontraron ventas"
                            promptMessage="Seleccione una venta reciente o escriba para buscar"
                            minChars={0}
                        />
                    ) : (
                        <div className="form-input" style={{ display: 'flex', alignItems: 'center' }}>
                            {ventaSeleccionada?.label || `${ajuste?.venta_codigo || '-'} - ${ajuste?.cliente_nombre || '-'}`}
                        </div>
                    )}
                </div>

                <div className="form-group">
                    <label className="form-label">Tipo</label>
                    <select className="form-select" value={form.tipo} onChange={event => setForm(prev => ({ ...prev, tipo: event.target.value }))}>
                        <option value="DESCUENTO">DESCUENTO</option>
                        <option value="NOTA_CREDITO">NOTA_CREDITO</option>
                        <option value="AJUSTE">AJUSTE</option>
                    </select>
                </div>

                <div className="form-group">
                    <label className="form-label">Monto</label>
                    <input
                        className="form-input"
                        type="number"
                        step="any"
                        min="0"
                        value={form.monto}
                        onChange={event => setForm(prev => ({ ...prev, monto: event.target.value }))}
                        required
                    />
                </div>
            </div>

            <div className="form-group">
                <label className="form-label">Motivo</label>
                <textarea
                    className="form-input"
                    rows={3}
                    value={form.motivo}
                    onChange={event => setForm(prev => ({ ...prev, motivo: event.target.value }))}
                    placeholder="Motivo del ajuste o nota de credito..."
                    style={{ resize: 'vertical' }}
                    required
                />
            </div>

            {error && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, color: '#f87171', fontSize: '0.84rem' }}>
                    {error}
                </div>
            )}

            <div className="flex gap-12" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? 'Guardando...' : mode === 'create' ? 'Registrar ajuste' : 'Guardar cambios'}
                </button>
            </div>
        </form>
    )
}

function AjusteActions({ item, onEdit, onDelete }) {
    const [open, setOpen] = useState(false)
    const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 })
    const buttonRef = useRef(null)

    const handleAction = callback => {
        setOpen(false)
        window.setTimeout(() => {
            callback()
        }, 0)
    }

    const toggleMenu = () => {
        if (open) {
            setOpen(false)
            return
        }
        const rect = buttonRef.current?.getBoundingClientRect()
        if (!rect) return
        const menuWidth = 220
        const menuHeight = 96
        let left = rect.right - menuWidth
        let top = rect.bottom + 6
        if (left < 8) left = 8
        if (left + menuWidth > window.innerWidth - 8) left = window.innerWidth - menuWidth - 8
        if (top + menuHeight > window.innerHeight - 8) top = rect.top - menuHeight - 6
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
                    <div style={{ position: 'fixed', top: menuPosition.top, left: menuPosition.left, minWidth: 220, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 14px 34px rgba(0,0,0,0.45)', padding: '6px 0', zIndex: 100 }}>
                        <button className="dropdown-item" onClick={() => handleAction(() => onEdit(item))}>
                            <Edit size={14} style={{ marginRight: 8 }} /> Editar ajuste
                        </button>
                        <button className="dropdown-item" style={{ color: 'var(--danger)' }} onClick={() => handleAction(() => onDelete(item))}>
                            <Trash2 size={14} style={{ marginRight: 8 }} /> Eliminar ajuste
                        </button>
                    </div>
                </>
            )}
        </div>
    )
}

export default function ReporteAjustesVentasPage() {
    const hoy = useState(() => new Date())[0]
    const primerDia = useState(() => new Date(hoy.getFullYear(), hoy.getMonth(), 1))[0]
    const defaultDesde = formatYmd(primerDia)
    const defaultHasta = formatYmd(hoy)

    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [data, setData] = useState({ items: [], total: 0, page: 1, total_pages: 1 })
    const [modalNuevo, setModalNuevo] = useState(false)
    const [editarAjuste, setEditarAjuste] = useState(null)
    const [clientes, setClientes] = useState([])
    const [clientesLoading, setClientesLoading] = useState(false)
    const [clienteBusqueda, setClienteBusqueda] = useState('')
    const [clienteSeleccionado, setClienteSeleccionado] = useState(null)
    const [filtros, setFiltros] = useState({
        fechaDesde: defaultDesde,
        fechaHasta: defaultHasta,
        tipo: '',
        clienteId: '',
    })
    const [filtrosAplicados, setFiltrosAplicados] = useState({
        fechaDesde: defaultDesde,
        fechaHasta: defaultHasta,
        tipo: '',
        clienteId: '',
    })

    useEffect(() => {
        cargarAjustes(filtrosAplicados)
    }, [filtrosAplicados])

    useEffect(() => {
        const handleAjusteCreado = () => {
            const hoyActual = formatYmd(new Date())
            setFiltros(prev => ({
                ...prev,
                fechaHasta: prev.fechaHasta === defaultHasta ? hoyActual : prev.fechaHasta,
            }))
            setFiltrosAplicados(prev => ({
                ...prev,
                fechaHasta: prev.fechaHasta === defaultHasta ? hoyActual : prev.fechaHasta,
            }))
        }
        window.addEventListener('hesaka:ajuste-venta-creado', handleAjusteCreado)
        return () => window.removeEventListener('hesaka:ajuste-venta-creado', handleAjusteCreado)
    }, [defaultHasta])

    useEffect(() => {
        const timer = setTimeout(async () => {
            const term = clienteBusqueda.trim()
            if (!term) {
                setClientes([])
                setClientesLoading(false)
                return
            }
            try {
                setClientesLoading(true)
                const params = new URLSearchParams({ page: '1', page_size: '20', buscar: term })
                const response = await api.get(`/clientes/listado-optimizado?${params.toString()}`)
                setClientes(response.data.items || [])
            } catch (err) {
                console.error('Error cargando clientes para ajustes:', err)
                setClientes([])
            } finally {
                setClientesLoading(false)
            }
        }, 250)
        return () => clearTimeout(timer)
    }, [clienteBusqueda])

    const cargarAjustes = async filtrosActuales => {
        try {
            setLoading(true)
            setError('')
            const params = new URLSearchParams({ page: '1', page_size: '50' })
            if (filtrosActuales.fechaDesde) params.append('fecha_desde', `${filtrosActuales.fechaDesde}T00:00:00`)
            if (filtrosActuales.fechaHasta) params.append('fecha_hasta', `${filtrosActuales.fechaHasta}T23:59:59`)
            if (filtrosActuales.tipo) params.append('tipo', filtrosActuales.tipo)
            if (filtrosActuales.clienteId) params.append('cliente_id', filtrosActuales.clienteId)
            const response = await api.get(`/ventas/ajustes?${params.toString()}`)
            const payload = response.data || {}
            setData({
                items: Array.isArray(payload.items) ? payload.items : [],
                total: Number(payload.total ?? 0),
                page: Number(payload.page ?? 1),
                total_pages: Number(payload.total_pages ?? 1),
            })
        } catch (err) {
            console.error('Error cargando ajustes:', err)
            setError(getErrorText(err, 'No se pudo cargar el historial de ajustes.'))
            setData({ items: [], total: 0, page: 1, total_pages: 1 })
        } finally {
            setLoading(false)
        }
    }

    const aplicarFiltros = () => {
        setFiltrosAplicados({
            fechaDesde: filtros.fechaDesde,
            fechaHasta: filtros.fechaHasta,
            tipo: filtros.tipo,
            clienteId: clienteSeleccionado?.value ? String(clienteSeleccionado.value) : '',
        })
    }

    const limpiarFiltros = () => {
        setClienteSeleccionado(null)
        setClienteBusqueda('')
        setFiltros({ fechaDesde: defaultDesde, fechaHasta: defaultHasta, tipo: '', clienteId: '' })
        setFiltrosAplicados({ fechaDesde: defaultDesde, fechaHasta: defaultHasta, tipo: '', clienteId: '' })
    }

    const recargar = () => cargarAjustes(filtrosAplicados)

    const eliminarAjuste = async item => {
        if (!confirm(`Eliminar el ajuste #${item.id}?\n\nEsto revertira el ajuste en la venta.`)) return
        try {
            await api.delete(`/ventas/ajustes/${item.id}`)
            recargar()
        } catch (err) {
            alert(getErrorText(err, 'No se pudo eliminar el ajuste.'))
        }
    }

    const totalMonto = (Array.isArray(data.items) ? data.items : []).reduce((sum, item) => sum + Number(item.monto ?? 0), 0)

    try {
        return (
            <div className="page-body">
                <div className="flex-between mb-24" style={{ gap: 12, flexWrap: 'wrap' }}>
                    <div>
                        <h1 className="page-title">Ajustes de Venta</h1>
                        <p className="page-subtitle">Gestiona descuentos, notas de credito y ajustes aplicados a ventas.</p>
                    </div>
                    <button type="button" className="btn btn-primary" onClick={() => setModalNuevo(true)}>
                        <Plus size={16} />
                        Nuevo ajuste
                    </button>
                </div>

                <div className="card" style={{ marginBottom: 18 }}>
                    <div className="filters-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, alignItems: 'end' }}>
                        <div className="form-group">
                            <label className="form-label">Desde</label>
                            <input className="form-input" type="date" value={filtros.fechaDesde} onChange={event => setFiltros(prev => ({ ...prev, fechaDesde: event.target.value }))} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Hasta</label>
                            <input className="form-input" type="date" value={filtros.fechaHasta} onChange={event => setFiltros(prev => ({ ...prev, fechaHasta: event.target.value }))} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Cliente</label>
                            <RemoteSearchSelect
                                value={clienteSeleccionado}
                                onChange={option => {
                                    setClienteSeleccionado(option || null)
                                    setFiltros(prev => ({ ...prev, clienteId: option ? String(option.value) : '' }))
                                }}
                                onSearch={setClienteBusqueda}
                                options={clientes.map(item => ({ value: item.id, label: item.nombre }))}
                                loading={clientesLoading}
                                placeholder="Buscar cliente..."
                                emptyMessage="No se encontraron clientes"
                                promptMessage="Escriba para buscar cliente"
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Tipo</label>
                            <select className="form-select" value={filtros.tipo} onChange={event => setFiltros(prev => ({ ...prev, tipo: event.target.value }))}>
                                <option value="">Todos</option>
                                <option value="DESCUENTO">DESCUENTO</option>
                                <option value="NOTA_CREDITO">NOTA_CREDITO</option>
                                <option value="AJUSTE">AJUSTE</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex gap-12" style={{ justifyContent: 'flex-end', marginTop: 14, flexWrap: 'wrap' }}>
                        <button type="button" className="btn btn-secondary" onClick={limpiarFiltros}>Limpiar</button>
                        <LoadingButton type="button" className="btn btn-primary" onClick={aplicarFiltros} loading={loading} loadingText="Aplicando filtros...">Aplicar filtros</LoadingButton>
                    </div>
                </div>

                <div className="kpi-grid" style={{ marginBottom: 18 }}>
                    <div className="stat-card">
                        <div className="stat-label">Ajustes</div>
                        <div className="stat-value">{Number(data.total ?? 0)}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Monto total ajustado</div>
                        <div className="stat-value" style={{ color: 'var(--warning)' }}>Gs. {fmt(totalMonto)}</div>
                    </div>
                </div>

                <div className="card">
                    {error && (
                        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '12px 14px', marginBottom: 14, color: '#f87171', fontSize: '0.85rem' }}>
                            {error}
                        </div>
                    )}

                    {loading ? (
                        <div className="empty-state" style={{ padding: '54px 20px' }}>
                            <div className="spinner" style={{ marginBottom: 12 }} />
                            <p>Cargando ajustes...</p>
                        </div>
                    ) : data.items.length === 0 ? (
                        <div className="empty-state" style={{ padding: '56px 20px' }}>
                            <FileText size={40} />
                            <p>No hay ajustes para los filtros aplicados.</p>
                        </div>
                    ) : (
                        <div className="table-container">
                            <table className="data-table" style={{ minWidth: 1080 }}>
                                <thead>
                                    <tr>
                                        <th style={{ width: 90 }}>ID</th>
                                        <th style={{ width: 170 }}>Fecha</th>
                                        <th style={{ width: 120 }}>Venta</th>
                                        <th style={{ width: 220 }}>Cliente</th>
                                        <th style={{ width: 150 }}>Tipo</th>
                                        <th style={{ width: 140 }} className="text-right">Monto</th>
                                        <th style={{ width: 320 }}>Motivo</th>
                                        <th style={{ width: 160 }}>Usuario</th>
                                        <th style={{ width: 160 }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.items.map(item => (
                                        <tr key={item.id}>
                                            <td>{item.id}</td>
                                            <td>{fmtDate(item.fecha)}</td>
                                            <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{item.venta_codigo}</td>
                                            <td style={{ whiteSpace: 'normal', lineHeight: 1.25, wordBreak: 'break-word' }}>{item.cliente_nombre}</td>
                                            <td>{tipoBadge(item.tipo)}</td>
                                            <td className="text-right" style={{ fontWeight: 800, color: 'var(--success)' }}>Gs. {fmt(item.monto)}</td>
                                            <td style={{ whiteSpace: 'normal', lineHeight: 1.25, wordBreak: 'break-word' }}>{item.motivo}</td>
                                            <td>{item.usuario || 'Sistema'}</td>
                                            <td><AjusteActions item={item} onEdit={setEditarAjuste} onDelete={eliminarAjuste} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {modalNuevo && (
                    <Modal title="Nuevo ajuste de venta" onClose={() => setModalNuevo(false)} maxWidth="760px">
                        <AjusteFormModal
                            mode="create"
                            onClose={() => setModalNuevo(false)}
                            onSaved={() => {
                                setModalNuevo(false)
                                recargar()
                            }}
                        />
                    </Modal>
                )}

                {editarAjuste && (
                    <Modal title={`Editar ajuste #${editarAjuste.id}`} onClose={() => setEditarAjuste(null)} maxWidth="760px">
                        <AjusteFormModal
                            mode="edit"
                            ajuste={editarAjuste}
                            onClose={() => setEditarAjuste(null)}
                            onSaved={() => {
                                setEditarAjuste(null)
                                recargar()
                            }}
                        />
                    </Modal>
                )}
            </div>
        )
    } catch (renderError) {
        console.error('Error renderizando Ajustes de Venta:', renderError)
        return (
            <div className="page-body">
                <div className="card">
                    <div className="empty-state" style={{ padding: '56px 20px' }}>
                        <FileText size={40} />
                        <p>No se pudo renderizar Ajustes de Venta.</p>
                    </div>
                </div>
            </div>
        )
    }
}
