import { useEffect, useMemo, useState } from 'react'
import { api } from '../context/AuthContext'
import { formatCurrency, formatDate } from '../utils/formatters'
import { exportReportBlob } from '../utils/reportExports'
import RemoteSearchSelect from '../components/RemoteSearchSelect'

const formatYmd = date =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export default function ReporteVentasPage() {
    const hoy = useMemo(() => new Date(), [])
    const primerDia = useMemo(() => new Date(hoy.getFullYear(), hoy.getMonth(), 1), [hoy])

    const [loading, setLoading] = useState(false)
    const [exporting, setExporting] = useState(false)
    const [data, setData] = useState(null)
    const [error, setError] = useState('')
    const [clientes, setClientes] = useState([])
    const [clientesLoading, setClientesLoading] = useState(false)
    const [clienteBusqueda, setClienteBusqueda] = useState('')
    const [clienteSeleccionado, setClienteSeleccionado] = useState(null)
    const [filtros, setFiltros] = useState({
        fechaDesde: formatYmd(primerDia),
        fechaHasta: formatYmd(hoy),
        clienteId: '',
        estadoPago: '',
    })
    const [filtrosAplicados, setFiltrosAplicados] = useState({
        fechaDesde: formatYmd(primerDia),
        fechaHasta: formatYmd(hoy),
        clienteId: '',
        estadoPago: '',
    })

    const ventas = Array.isArray(data?.ventas) ? data.ventas : []
    const totalVentas = Number(data?.total_ventas ?? 0)
    const totalCostos = Number(data?.total_costos ?? 0)
    const utilidadBrutaTotal = Number(data?.utilidad_bruta_total ?? 0)
    const totalComisiones = Number(data?.total_comisiones ?? 0)
    const utilidadNeta = Number(data?.utilidad_neta ?? 0)
    const margenPromedio = Number(data?.margen_promedio ?? 0)
    const cantidadVentas = Number(data?.cantidad_ventas ?? ventas.length)

    useEffect(() => {
        cargarReporte(filtrosAplicados)
    }, [filtrosAplicados])

    useEffect(() => {
        const timer = setTimeout(() => {
            cargarClientes(clienteBusqueda)
        }, 250)
        return () => clearTimeout(timer)
    }, [clienteBusqueda])

    const cargarClientes = async buscar => {
        try {
            setClientesLoading(true)
            const params = new URLSearchParams({ page: '1', page_size: '20' })
            if ((buscar || '').trim()) params.append('buscar', buscar.trim())
            const response = await api.get(`/clientes/listado-optimizado?${params.toString()}`)
            setClientes(response.data.items || [])
        } catch (err) {
            console.error('Error cargando clientes:', err)
            setClientes([])
        } finally {
            setClientesLoading(false)
        }
    }

    const cargarReporte = async filtrosActuales => {
        try {
            setLoading(true)
            setError('')
            const params = new URLSearchParams()
            if (filtrosActuales.fechaDesde) params.append('fecha_desde', filtrosActuales.fechaDesde)
            if (filtrosActuales.fechaHasta) params.append('fecha_hasta', filtrosActuales.fechaHasta)
            if (filtrosActuales.clienteId) params.append('cliente_id', filtrosActuales.clienteId)
            if (filtrosActuales.estadoPago) params.append('estado_pago', filtrosActuales.estadoPago)
            const response = await api.get(`/reportes/ventas?${params.toString()}`)
            setData(response.data || null)
        } catch (err) {
            console.error('Error al cargar reporte:', err)
            setError(err?.response?.data?.detail || 'No se pudo cargar el reporte de ventas.')
            setData(null)
        } finally {
            setLoading(false)
        }
    }

    const handleFilterChange = event => {
        const { name, value } = event.target
        setFiltros(prev => ({ ...prev, [name]: value }))
    }

    const aplicarFiltros = () => setFiltrosAplicados({ ...filtros })

    const limpiarFiltros = () => {
        const reset = {
            fechaDesde: formatYmd(primerDia),
            fechaHasta: formatYmd(hoy),
            clienteId: '',
            estadoPago: '',
        }
        setFiltros(reset)
        setFiltrosAplicados(reset)
        setClienteSeleccionado(null)
        setClienteBusqueda('')
    }

    const exportar = async tipo => {
        try {
            setExporting(true)
            const params = new URLSearchParams()
            if (filtrosAplicados.fechaDesde) params.append('fecha_desde', filtrosAplicados.fechaDesde)
            if (filtrosAplicados.fechaHasta) params.append('fecha_hasta', filtrosAplicados.fechaHasta)
            if (filtrosAplicados.clienteId) params.append('cliente_id', filtrosAplicados.clienteId)
            if (filtrosAplicados.estadoPago) params.append('estado_pago', filtrosAplicados.estadoPago)
            await exportReportBlob(
                `/reportes/ventas/${tipo}?${params.toString()}`,
                tipo === 'pdf'
                    ? 'application/pdf'
                    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                tipo === 'pdf' ? { openInNewTab: true } : undefined
            )
        } catch (err) {
            console.error(`Error al exportar ${tipo.toUpperCase()}:`, err)
        } finally {
            setExporting(false)
        }
    }

    return (
        <div className="page-container">
            <header className="page-header" style={{ marginBottom: 20 }}>
                <div>
                    <h1 className="page-title">Reporte de Ventas y Rentabilidad</h1>
                    <p className="page-subtitle">Analiza ventas, costos, utilidad y comisiones del periodo.</p>
                </div>
            </header>

            <div className="card filters-panel" style={{ marginBottom: 20 }}>
                <h3 style={{ marginBottom: 15, color: 'var(--text-primary)', fontSize: '1.05rem' }}>Filtros</h3>

                <div className="filters-grid">
                    <div className="form-group">
                        <label>Desde</label>
                        <input type="date" name="fechaDesde" value={filtros.fechaDesde} onChange={handleFilterChange} className="form-input" />
                    </div>
                    <div className="form-group">
                        <label>Hasta</label>
                        <input type="date" name="fechaHasta" value={filtros.fechaHasta} onChange={handleFilterChange} className="form-input" />
                    </div>
                    <div className="form-group">
                        <label>Cliente</label>
                        <RemoteSearchSelect
                            value={clienteSeleccionado}
                            onChange={option => {
                                setClienteSeleccionado(option || null)
                                setFiltros(prev => ({ ...prev, clienteId: option ? option.value : '' }))
                            }}
                            onSearch={setClienteBusqueda}
                            options={clientes.map(cliente => ({
                                value: cliente.id,
                                label: `${cliente.nombre}${cliente.ci ? ` (${cliente.ci})` : ''}`,
                            }))}
                            loading={clientesLoading}
                            placeholder="Buscar cliente..."
                            emptyMessage="No se encontraron clientes"
                            promptMessage="Escriba para buscar cliente"
                        />
                    </div>
                    <div className="form-group">
                        <label>Estado del pago</label>
                        <select name="estadoPago" value={filtros.estadoPago} onChange={handleFilterChange} className="form-select">
                            <option value="">Todos</option>
                            <option value="PENDIENTE">Pendiente</option>
                            <option value="PAGADO">Pagado</option>
                            <option value="EN MORA">En mora</option>
                        </select>
                    </div>
                </div>

                <div className="filters-actions" style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                    <button className="btn btn-primary" onClick={aplicarFiltros}>Aplicar filtros</button>
                    <button className="btn btn-secondary" onClick={limpiarFiltros}>Limpiar</button>
                    <div style={{ flex: 1 }} />
                    <button className="btn" style={{ backgroundColor: '#27ae60', color: 'white' }} onClick={() => exportar('excel')} disabled={exporting}>
                        {exporting ? 'Cargando...' : 'Excel'}
                    </button>
                    <button className="btn" style={{ backgroundColor: '#e74c3c', color: 'white' }} onClick={() => exportar('pdf')} disabled={exporting}>
                        {exporting ? 'Cargando...' : 'PDF'}
                    </button>
                </div>
            </div>

            {data && (
                <div className="kpi-grid">
                    <div className="kpi-card" style={{ borderLeft: '4px solid #3498db' }}>
                        <div className="kpi-title">Ingreso total</div>
                        <div className="kpi-value db-blue">{formatCurrency(totalVentas)}</div>
                        <div className="kpi-subtitle">{cantidadVentas} operaciones</div>
                    </div>
                    <div className="kpi-card" style={{ borderLeft: '4px solid #e74c3c' }}>
                        <div className="kpi-title">Costo mercaderia</div>
                        <div className="kpi-value db-red">{formatCurrency(totalCostos)}</div>
                    </div>
                    <div className="kpi-card" style={{ borderLeft: '4px solid #f39c12' }}>
                        <div className="kpi-title">Utilidad bruta</div>
                        <div className="kpi-value db-orange">{formatCurrency(utilidadBrutaTotal)}</div>
                        <div className="kpi-subtitle">Margen prom: {margenPromedio.toFixed(2)}%</div>
                    </div>
                    <div className="kpi-card" style={{ borderLeft: '4px solid #9b59b6' }}>
                        <div className="kpi-title">Gastos por comisiones</div>
                        <div className="kpi-value db-purple">{formatCurrency(totalComisiones)}</div>
                    </div>
                    <div className="kpi-card highlight-kpi" style={{ borderLeft: '4px solid #2ecc71', backgroundColor: 'rgba(46, 204, 113, 0.1)' }}>
                        <div className="kpi-title" style={{ color: '#2ecc71' }}>Utilidad neta</div>
                        <div className="kpi-value db-green">{formatCurrency(utilidadNeta)}</div>
                    </div>
                </div>
            )}

            <div className="card">
                <div className="table-responsive">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Fecha</th>
                                <th>Nro. factura</th>
                                <th>Cliente</th>
                                <th className="text-right">Total venta</th>
                                <th className="text-right">Costo</th>
                                <th className="text-right">U. bruta</th>
                                <th className="text-center">Margen</th>
                                <th className="text-center">Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="8" className="text-center" style={{ padding: 40 }}>
                                        <div className="spinner" style={{ margin: '0 auto' }} />
                                        <div style={{ marginTop: 10, color: 'var(--text-muted)' }}>Cargando analiticas...</div>
                                    </td>
                                </tr>
                            ) : error ? (
                                <tr>
                                    <td colSpan="8" className="text-center text-danger" style={{ padding: 20 }}>{error}</td>
                                </tr>
                            ) : ventas.length === 0 ? (
                                <tr>
                                    <td colSpan="8" className="text-center" style={{ padding: 40, color: 'var(--text-muted)' }}>
                                        No se encontraron ventas para este periodo.
                                    </td>
                                </tr>
                            ) : (
                                ventas.map(venta => (
                                    <tr key={venta.venta_id}>
                                        <td>{formatDate(venta.fecha)}</td>
                                        <td><strong>{venta.codigo}</strong></td>
                                        <td>{venta.cliente_nombre}</td>
                                        <td className="text-right fw-bold text-success">{formatCurrency(Number(venta.total_venta ?? 0))}</td>
                                        <td className="text-right text-danger">{formatCurrency(Number(venta.costo_total ?? 0))}</td>
                                        <td className="text-right fw-bold" style={{ color: '#f39c12' }}>{formatCurrency(Number(venta.utilidad_bruta ?? 0))}</td>
                                        <td className="text-center">
                                            <span className="badge" style={{ backgroundColor: 'rgba(155, 89, 182, 0.2)', color: '#9b59b6' }}>
                                                {Number(venta.margen_bruto ?? 0).toFixed(1)}%
                                            </span>
                                        </td>
                                        <td className="text-center">
                                            <span className={`badge ${venta.estado === 'PAGADO' ? 'badge-success' : 'badge-danger'}`}>
                                                {venta.estado}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <style>{`
                .filters-panel {
                    border: 1px solid var(--border-color);
                }
                .filters-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
                    gap: 15px;
                }
                .kpi-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 15px;
                    margin-bottom: 20px;
                }
                .kpi-card {
                    background-color: var(--card-bg);
                    border-radius: 8px;
                    padding: 15px;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                }
                .kpi-title {
                    font-size: 0.85rem;
                    color: var(--text-muted);
                    font-weight: 600;
                    text-transform: uppercase;
                    margin-bottom: 5px;
                }
                .kpi-value {
                    font-size: 1.5rem;
                    font-weight: bold;
                    margin-bottom: 5px;
                }
                .kpi-subtitle {
                    font-size: 0.8rem;
                    color: var(--text-muted);
                }
                .db-blue { color: #3498db; }
                .db-red { color: #e74c3c; }
                .db-orange { color: #f39c12; }
                .db-purple { color: #9b59b6; }
                .db-green { color: #2ecc71; }
                .highlight-kpi {
                    transform: scale(1.02);
                }
            `}</style>
        </div>
    )
}
