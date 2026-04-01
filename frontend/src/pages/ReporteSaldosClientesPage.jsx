import { useEffect, useState } from 'react'

import LoadingButton from '../components/LoadingButton'
import Modal from '../components/Modal'
import RemoteSearchSelect from '../components/RemoteSearchSelect'
import { api } from '../context/AuthContext'
import { exportReportBlob } from '../utils/reportExports'
import { CreditCard, Eye, FileText } from 'lucide-react'

function fmt(value) {
    return new Intl.NumberFormat('es-PY').format(value ?? 0)
}

function fmtDate(value) {
    return value ? new Date(value).toLocaleDateString('es-PY') : '-'
}

function ClienteActions({ item, filtros, onVerDetalle, onPdf, onCobrar }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onVerDetalle(item)}>
                <Eye size={14} style={{ marginRight: 6 }} />
                Ver detalle
            </button>
            {item.saldo_pendiente > 0 && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => onCobrar(item)}>
                    <CreditCard size={14} style={{ marginRight: 6 }} />
                    Cobrar
                </button>
            )}
            <button type="button" className="btn btn-primary btn-sm" onClick={() => onPdf(item, filtros)}>
                <FileText size={14} style={{ marginRight: 6 }} />
                PDF
            </button>
        </div>
    )
}

function PagoVentaModal({ ventaId, onClose, onSaved }) {
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [venta, setVenta] = useState(null)
    const [bancos, setBancos] = useState([])
    const [form, setForm] = useState({
        monto: '',
        metodo_pago: 'EFECTIVO',
        banco_id: '',
        nota: '',
        fecha: new Date().toISOString().slice(0, 16),
    })

    useEffect(() => {
        let active = true
        const cargar = async () => {
            try {
                setLoading(true)
                const [ventaResp, bancosResp] = await Promise.all([
                    api.get(`/ventas/${ventaId}`),
                    api.get('/bancos/'),
                ])
                if (!active) return
                setVenta(ventaResp.data)
                setBancos(bancosResp.data || [])
                setForm(prev => ({
                    ...prev,
                    monto: String(ventaResp.data?.saldo || ''),
                }))
            } catch (err) {
                if (!active) return
                setError(err?.response?.data?.detail || 'No se pudo cargar la venta para cobrar.')
            } finally {
                if (active) setLoading(false)
            }
        }
        cargar()
        return () => { active = false }
    }, [ventaId])

    const requiereBanco = ['TARJETA', 'TRANSFERENCIA'].includes(form.metodo_pago)

    const submit = async event => {
        event.preventDefault()
        try {
            setError('')
            await api.post(`/ventas/${ventaId}/pagos`, {
                monto: parseFloat(form.monto),
                metodo_pago: form.metodo_pago,
                banco_id: requiereBanco ? parseInt(form.banco_id, 10) : null,
                nota: form.nota || null,
                fecha: new Date(form.fecha).toISOString(),
            })
            onSaved()
        } catch (err) {
            setError(err?.response?.data?.detail || 'No se pudo registrar el cobro.')
        }
    }

    if (loading) {
        return (
            <div className="empty-state" style={{ padding: '36px 20px' }}>
                <div className="spinner" style={{ marginBottom: 12 }} />
                <div style={{ color: 'var(--text-muted)' }}>Cargando venta...</div>
            </div>
        )
    }

    if (!venta) {
        return (
            <div style={{ color: '#f87171', fontSize: '0.9rem' }}>
                {error || 'No se pudo cargar la venta.'}
            </div>
        )
    }

    return (
        <form onSubmit={submit}>
            <div className="card" style={{ marginBottom: 16, padding: '14px 16px' }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{venta.codigo}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.45 }}>
                    Cliente: {venta.cliente_nombre || '—'}<br />
                    Fecha: {fmtDate(venta.fecha)}
                </div>
                <div style={{ marginTop: 10, fontSize: '1.1rem', fontWeight: 800, color: 'var(--warning)' }}>
                    Saldo pendiente: Gs. {fmt(venta.saldo)}
                </div>
            </div>

            <div className="grid-2">
                <div className="form-group">
                    <label className="form-label">Monto</label>
                    <input
                        className="form-input"
                        type="number"
                        step="any"
                        min="0"
                        max={venta.saldo || undefined}
                        value={form.monto}
                        onChange={event => setForm(prev => ({ ...prev, monto: event.target.value }))}
                        required
                    />
                </div>
                <div className="form-group">
                    <label className="form-label">Metodo de pago</label>
                    <select
                        className="form-select"
                        value={form.metodo_pago}
                        onChange={event => setForm(prev => ({ ...prev, metodo_pago: event.target.value, banco_id: '' }))}
                    >
                        <option value="EFECTIVO">EFECTIVO</option>
                        <option value="TARJETA">TARJETA</option>
                        <option value="TRANSFERENCIA">TRANSFERENCIA</option>
                    </select>
                </div>
            </div>

            {requiereBanco && (
                <div className="form-group">
                    <label className="form-label">Banco destino</label>
                    <select
                        className="form-select"
                        value={form.banco_id}
                        onChange={event => setForm(prev => ({ ...prev, banco_id: event.target.value }))}
                        required
                    >
                        <option value="">Seleccionar banco</option>
                        {bancos.map(item => (
                            <option key={item.id} value={item.id}>
                                {item.nombre_banco} - {item.numero_cuenta}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            <div className="grid-2">
                <div className="form-group">
                    <label className="form-label">Fecha del cobro</label>
                    <input
                        className="form-input"
                        type="datetime-local"
                        value={form.fecha}
                        onChange={event => setForm(prev => ({ ...prev, fecha: event.target.value }))}
                        required
                    />
                </div>
                <div className="form-group">
                    <label className="form-label">Nota</label>
                    <input
                        className="form-input"
                        value={form.nota}
                        onChange={event => setForm(prev => ({ ...prev, nota: event.target.value }))}
                        placeholder="Observacion opcional"
                    />
                </div>
            </div>

            {error && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#f87171' }}>
                    {error}
                </div>
            )}

            <div className="flex gap-12" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Registrar cobro</button>
            </div>
        </form>
    )
}

export default function ReporteSaldosClientesPage() {
    const hoy = new Date()
    const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
    const formatYMD = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

    const [loading, setLoading] = useState(false)
    const [detalleLoading, setDetalleLoading] = useState(false)
    const [error, setError] = useState('')
    const [data, setData] = useState(null)
    const [detalle, setDetalle] = useState(null)
    const [ventaCobroId, setVentaCobroId] = useState(null)

    const [clientes, setClientes] = useState([])
    const [clientesLoading, setClientesLoading] = useState(false)
    const [clienteBusqueda, setClienteBusqueda] = useState('')
    const [clienteSeleccionado, setClienteSeleccionado] = useState(null)

    const [filtros, setFiltros] = useState({
        fechaDesde: formatYMD(primerDia),
        fechaHasta: formatYMD(hoy),
        clienteId: '',
    })
    const [filtrosAplicados, setFiltrosAplicados] = useState({
        fechaDesde: formatYMD(primerDia),
        fechaHasta: formatYMD(hoy),
        clienteId: '',
    })

    useEffect(() => {
        cargarReporte(filtrosAplicados)
    }, [filtrosAplicados])

    useEffect(() => {
        if (!clienteBusqueda.trim()) {
            setClientes([])
            setClientesLoading(false)
            return
        }
        const timer = setTimeout(() => {
            cargarClientes(clienteBusqueda)
        }, 250)
        return () => clearTimeout(timer)
    }, [clienteBusqueda])

    const cargarClientes = async buscar => {
        try {
            setClientesLoading(true)
            const params = new URLSearchParams({ page: '1', page_size: '20' })
            if (buscar.trim()) params.set('buscar', buscar.trim())
            const response = await api.get(`/clientes/listado-optimizado?${params.toString()}`)
            setClientes(response.data.items || [])
        } catch (err) {
            console.error('Error cargando clientes:', err)
            setClientes([])
        } finally {
            setClientesLoading(false)
        }
    }

    const construirParams = filtrosActivos => {
        const params = new URLSearchParams()
        if (filtrosActivos.fechaDesde) params.append('fecha_desde', filtrosActivos.fechaDesde)
        if (filtrosActivos.fechaHasta) params.append('fecha_hasta', filtrosActivos.fechaHasta)
        if (filtrosActivos.clienteId) params.append('cliente_id', filtrosActivos.clienteId)
        return params
    }

    const cargarReporte = async filtrosActivos => {
        try {
            setLoading(true)
            setError('')
            const params = construirParams(filtrosActivos)
            const response = await api.get(`/reportes/saldos?${params.toString()}`)
            setData(response.data)
        } catch (err) {
            console.error('Error cargando saldos de clientes:', err)
            setError(err?.response?.data?.detail || 'No se pudo cargar el reporte de saldos de clientes.')
        } finally {
            setLoading(false)
        }
    }

    const aplicarFiltros = () => {
        setFiltrosAplicados({ ...filtros })
    }

    const limpiarFiltros = () => {
        const iniciales = {
            fechaDesde: formatYMD(primerDia),
            fechaHasta: formatYMD(hoy),
            clienteId: '',
        }
        setClienteSeleccionado(null)
        setClienteBusqueda('')
        setFiltros(iniciales)
        setFiltrosAplicados(iniciales)
    }

    const verDetalle = async item => {
        try {
            setDetalleLoading(true)
            const params = construirParams({ ...filtrosAplicados, clienteId: String(item.cliente_id) })
            const response = await api.get(`/reportes/saldos/${item.cliente_id}?${params.toString()}`)
            setDetalle(response.data)
        } catch (err) {
            alert(err?.response?.data?.detail || 'No se pudo cargar el detalle del cliente.')
        } finally {
            setDetalleLoading(false)
        }
    }

    const exportarPdfCliente = async item => {
        try {
            const params = construirParams({ ...filtrosAplicados, clienteId: String(item.cliente_id) })
            await exportReportBlob(`/reportes/saldos/${item.cliente_id}/pdf?${params.toString()}`, 'application/pdf', { openInNewTab: true })
        } catch (err) {
            console.error('Error exportando estado de cuenta:', err)
            alert(err?.response?.data?.detail || 'No se pudo generar el estado de cuenta en PDF.')
        }
    }

    const abrirCobroCliente = async item => {
        try {
            setDetalleLoading(true)
            const params = construirParams({ ...filtrosAplicados, clienteId: String(item.cliente_id) })
            const response = await api.get(`/reportes/saldos/${item.cliente_id}?${params.toString()}`)
            const detalleCliente = response.data
            setDetalle(detalleCliente)
            if ((detalleCliente.ventas_pendientes || []).length === 1) {
                setVentaCobroId(detalleCliente.ventas_pendientes[0].venta_id)
            }
        } catch (err) {
            alert(err?.response?.data?.detail || 'No se pudo preparar el cobro del cliente.')
        } finally {
            setDetalleLoading(false)
        }
    }

    const recargarTodo = async clienteIdActual => {
        await cargarReporte(filtrosAplicados)
        if (clienteIdActual) {
            try {
                const params = construirParams({ ...filtrosAplicados, clienteId: String(clienteIdActual) })
                const response = await api.get(`/reportes/saldos/${clienteIdActual}?${params.toString()}`)
                setDetalle(response.data)
            } catch (err) {
                console.error('Error recargando detalle:', err)
            }
        }
    }

    return (
        <div className="page-container">
            <header className="page-header" style={{ marginBottom: '20px' }}>
                <div>
                    <h1 className="page-title">Saldos de Clientes</h1>
                    <p className="page-subtitle">Controla cuentas por cobrar, detalle de creditos y estado de cuenta por cliente.</p>
                </div>
            </header>

            <div className="card filters-panel" style={{ marginBottom: '20px' }}>
                <h3 style={{ marginBottom: '15px', color: 'var(--text-primary)', fontSize: '1.05rem' }}>Filtros</h3>
                <div
                    style={{
                        marginBottom: 14,
                        padding: '10px 14px',
                        borderRadius: 12,
                        border: '1px solid rgba(59,130,246,0.22)',
                        background: 'rgba(37,99,235,0.08)',
                        color: 'var(--text-muted)',
                        fontSize: '0.85rem',
                        lineHeight: 1.5,
                    }}
                >
                    El rango de fechas filtra las ventas incluidas en la deuda mostrada y en el detalle del cliente.
                </div>
                <div className="filters-grid">
                    <div className="form-group">
                        <label>Desde</label>
                        <input
                            type="date"
                            className="form-input"
                            value={filtros.fechaDesde}
                            onChange={event => setFiltros(prev => ({ ...prev, fechaDesde: event.target.value }))}
                        />
                    </div>
                    <div className="form-group">
                        <label>Hasta</label>
                        <input
                            type="date"
                            className="form-input"
                            value={filtros.fechaHasta}
                            onChange={event => setFiltros(prev => ({ ...prev, fechaHasta: event.target.value }))}
                        />
                    </div>
                    <div className="form-group" style={{ minWidth: 0 }}>
                        <label>Cliente</label>
                        <RemoteSearchSelect
                            value={clienteSeleccionado}
                            onChange={option => {
                                setClienteSeleccionado(option || null)
                                setFiltros(prev => ({ ...prev, clienteId: option ? String(option.value) : '' }))
                            }}
                            onSearch={setClienteBusqueda}
                            options={clientes.map(cliente => ({
                                value: cliente.id,
                                label: `${cliente.nombre}${cliente.ci ? ` - ${cliente.ci}` : ''}`,
                            }))}
                            loading={clientesLoading}
                            placeholder="Escriba para buscar cliente..."
                            emptyMessage="No se encontraron clientes"
                            promptMessage="Escriba para buscar cliente"
                        />
                    </div>
                </div>
                <div className="filters-actions" style={{ display: 'flex', gap: '10px', marginTop: '15px', flexWrap: 'wrap' }}>
                    <LoadingButton className="btn btn-primary" onClick={aplicarFiltros} loading={loading} loadingText="Aplicando filtros...">Aplicar filtros</LoadingButton>
                    <button className="btn btn-secondary" onClick={limpiarFiltros}>Limpiar</button>
                </div>
            </div>

            {data && (
                <div className="kpi-grid" style={{ marginBottom: '20px' }}>
                    <div className="kpi-card" style={{ borderLeft: '4px solid #2563eb' }}>
                        <div className="kpi-title">Total deuda</div>
                        <div className="kpi-value" style={{ color: '#2563eb' }}>Gs. {fmt(data.total_deuda)}</div>
                    </div>
                    <div className="kpi-card" style={{ borderLeft: '4px solid #7c3aed' }}>
                        <div className="kpi-title">Clientes con saldo</div>
                        <div className="kpi-value" style={{ color: '#7c3aed' }}>{data.cantidad_clientes}</div>
                    </div>
                    <div className="kpi-card" style={{ borderLeft: '4px solid #ea580c' }}>
                        <div className="kpi-title">Creditos pendientes</div>
                        <div className="kpi-value" style={{ color: '#ea580c' }}>{data.cantidad_creditos}</div>
                    </div>
                </div>
            )}

            <div className="card">
                <div className="table-responsive compras-report-scroll">
                    <table className="table compras-report-table compras-report-table--detail">
                        <thead>
                            <tr>
                                <th className="col-clientes">Cliente</th>
                                <th className="col-documento">CI/RUC</th>
                                <th className="col-documento">Telefono</th>
                                <th className="text-center col-condicion">Creditos</th>
                                <th className="text-right col-monto">Total credito</th>
                                <th className="text-right col-monto">Pagado</th>
                                <th className="text-right col-monto">Saldo</th>
                                <th style={{ minWidth: 180 }} className="text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="8" className="text-center" style={{ padding: '40px' }}>
                                        <div className="spinner" style={{ margin: '0 auto' }} />
                                        <div style={{ marginTop: '10px', color: 'var(--text-muted)' }}>Cargando saldos...</div>
                                    </td>
                                </tr>
                            ) : error ? (
                                <tr><td colSpan="8" className="text-center text-danger" style={{ padding: '20px' }}>{error}</td></tr>
                            ) : !data || data.clientes.length === 0 ? (
                                <tr><td colSpan="8" className="text-center" style={{ padding: '40px', color: 'var(--text-muted)' }}>No se encontraron saldos pendientes para este periodo.</td></tr>
                            ) : (
                                data.clientes.map(item => (
                                    <tr key={item.cliente_id}>
                                        <td className="col-clientes">{item.cliente_nombre}</td>
                                        <td className="col-documento">{item.cliente_ci || '-'}</td>
                                        <td className="col-documento">{item.cliente_telefono || '-'}</td>
                                        <td className="text-center col-condicion">{item.cantidad_creditos}</td>
                                        <td className="text-right col-monto amount-total">Gs. {fmt(item.total_credito)}</td>
                                        <td className="text-right col-monto amount-paid">Gs. {fmt(item.total_pagado)}</td>
                                        <td className="text-right col-monto amount-balance">Gs. {fmt(item.saldo_pendiente)}</td>
                                        <td>
                                            <ClienteActions
                                                item={item}
                                                filtros={filtrosAplicados}
                                                onVerDetalle={verDetalle}
                                                onPdf={exportarPdfCliente}
                                                onCobrar={abrirCobroCliente}
                                            />
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {detalle && (
                <Modal title={`Estado de Cuenta - ${detalle.cliente_nombre}`} onClose={() => setDetalle(null)} maxWidth="1100px">
                    <div className="kpi-grid" style={{ marginBottom: '18px' }}>
                        <div className="kpi-card" style={{ borderLeft: '4px solid #2563eb' }}>
                            <div className="kpi-title">Cliente</div>
                            <div className="kpi-value" style={{ fontSize: '1.1rem' }}>{detalle.cliente_nombre}</div>
                            <div className="kpi-subtitle">{detalle.cliente_ci || 'Sin CI/RUC'}{detalle.cliente_telefono ? ` | ${detalle.cliente_telefono}` : ''}</div>
                        </div>
                        <div className="kpi-card" style={{ borderLeft: '4px solid #ea580c' }}>
                            <div className="kpi-title">Saldo pendiente</div>
                            <div className="kpi-value" style={{ color: '#ea580c' }}>Gs. {fmt(detalle.total_deuda)}</div>
                        </div>
                    </div>

                    {detalleLoading ? (
                        <div className="empty-state" style={{ padding: '40px 20px' }}>
                            <div className="spinner" style={{ marginBottom: 12 }} />
                            <div style={{ color: 'var(--text-muted)' }}>Cargando detalle...</div>
                        </div>
                    ) : (
                        <>
                            <div className="card" style={{ marginBottom: '18px', padding: '16px' }}>
                                <h3 style={{ marginBottom: '14px', fontSize: '1rem' }}>Creditos pendientes</h3>
                                <div className="table-responsive compras-report-scroll">
                                    <table className="table compras-report-table compras-report-table--detail">
                                        <thead>
                                            <tr>
                                                <th>Fecha</th>
                                                <th>Codigo</th>
                                                <th className="text-right">Total</th>
                                                <th className="text-right">Pagado</th>
                                                <th className="text-right">Saldo</th>
                                                <th>Estado</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {detalle.ventas_pendientes.length === 0 ? (
                                                <tr><td colSpan="6" className="text-center" style={{ padding: '24px', color: 'var(--text-muted)' }}>Sin creditos pendientes en el periodo.</td></tr>
                                            ) : (
                                                detalle.ventas_pendientes.map(item => (
                                                    <tr key={item.venta_id}>
                                                        <td>{fmtDate(item.fecha)}</td>
                                                        <td>{item.codigo}</td>
                                                        <td className="text-right amount-total">Gs. {fmt(item.total)}</td>
                                                        <td className="text-right amount-paid">Gs. {fmt(item.pagado)}</td>
                                                        <td className="text-right amount-balance">Gs. {fmt(item.saldo)}</td>
                                                        <td>
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                                                                <span>{item.estado}</span>
                                                                {item.saldo > 0 && (
                                                                    <button
                                                                        type="button"
                                                                        className="btn btn-secondary btn-sm"
                                                                        onClick={() => setVentaCobroId(item.venta_id)}
                                                                    >
                                                                        <CreditCard size={14} style={{ marginRight: 6 }} />
                                                                        Cobrar
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="card" style={{ padding: '16px' }}>
                                <h3 style={{ marginBottom: '14px', fontSize: '1rem' }}>Movimientos</h3>
                                <div className="table-responsive compras-report-scroll">
                                    <table className="table compras-report-table compras-report-table--detail">
                                        <thead>
                                            <tr>
                                                <th>Fecha</th>
                                                <th>Tipo</th>
                                                <th className="col-documento">Descripcion</th>
                                                <th className="text-right col-monto">Debito</th>
                                                <th className="text-right col-monto">Credito</th>
                                                <th className="text-right col-monto">Saldo</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {detalle.movimientos.length === 0 ? (
                                                <tr><td colSpan="6" className="text-center" style={{ padding: '24px', color: 'var(--text-muted)' }}>Sin movimientos en el periodo.</td></tr>
                                            ) : (
                                                detalle.movimientos.map((mov, index) => (
                                                    <tr key={`${mov.fecha}-${mov.tipo}-${index}`}>
                                                        <td>{fmtDate(mov.fecha)}</td>
                                                        <td>{mov.tipo}</td>
                                                        <td className="col-documento">{mov.descripcion}</td>
                                                        <td className="text-right amount-total">{mov.debito ? `Gs. ${fmt(mov.debito)}` : '-'}</td>
                                                        <td className="text-right amount-paid">{mov.credito ? `Gs. ${fmt(mov.credito)}` : '-'}</td>
                                                        <td className="text-right amount-balance">Gs. {fmt(mov.saldo_acumulado)}</td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}
                </Modal>
            )}

            {ventaCobroId && (
                <Modal title="Registrar cobro" onClose={() => setVentaCobroId(null)} maxWidth="640px">
                    <PagoVentaModal
                        ventaId={ventaCobroId}
                        onClose={() => setVentaCobroId(null)}
                        onSaved={async () => {
                            const clienteActual = detalle?.cliente_id
                            setVentaCobroId(null)
                            await recargarTodo(clienteActual)
                        }}
                    />
                </Modal>
            )}

            <style>{`
                .filters-panel {
                    border: 1px solid var(--border-color);
                }
                .filters-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 15px;
                }
                .kpi-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
                    gap: 15px;
                }
                .kpi-card {
                    background-color: var(--card-bg);
                    border-radius: 8px;
                    padding: 16px;
                }
                .kpi-title {
                    color: var(--text-muted);
                    font-size: 0.8rem;
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                    margin-bottom: 8px;
                }
                .kpi-value {
                    color: var(--text-primary);
                    font-size: 2rem;
                    font-weight: 700;
                }
                .kpi-subtitle {
                    margin-top: 6px;
                    color: var(--text-muted);
                    font-size: 0.82rem;
                    line-height: 1.4;
                }
                .saldos-report-table {
                    min-width: 980px;
                }
                @media (max-width: 900px) {
                    .filters-grid {
                        grid-template-columns: 1fr;
                    }
                }
            `}</style>
        </div>
    )
}
