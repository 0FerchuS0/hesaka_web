import { useEffect, useMemo, useState } from 'react'
import LoadingButton from '../components/LoadingButton'
import RemoteSearchSelect from '../components/RemoteSearchSelect'
import { api } from '../context/AuthContext'
import { exportReportBlob } from '../utils/reportExports'
import { formatCurrency } from '../utils/formatters'

const formatYmd = date =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const fmtNum = value => new Intl.NumberFormat('es-PY').format(Number(value || 0))
const fmtPercent = value => `${Number(value || 0).toFixed(2)}%`

export default function ReporteVentasProductosPage() {
    const hoy = useMemo(() => new Date(), [])
    const primerDia = useMemo(() => new Date(hoy.getFullYear(), hoy.getMonth(), 1), [hoy])

    const [loading, setLoading] = useState(false)
    const [exportingPdf, setExportingPdf] = useState(false)
    const [exportingExcel, setExportingExcel] = useState(false)
    const [error, setError] = useState('')
    const [data, setData] = useState(null)
    const [clientes, setClientes] = useState([])
    const [clienteBusqueda, setClienteBusqueda] = useState('')
    const [clientesLoading, setClientesLoading] = useState(false)
    const [clienteSeleccionado, setClienteSeleccionado] = useState(null)
    const [categorias, setCategorias] = useState([])
    const [categoriasLoading, setCategoriasLoading] = useState(false)
    const [categoriaBusqueda, setCategoriaBusqueda] = useState('')
    const [categoriaSeleccionada, setCategoriaSeleccionada] = useState(null)
    const [productos, setProductos] = useState([])
    const [productosLoading, setProductosLoading] = useState(false)
    const [productoBusqueda, setProductoBusqueda] = useState('')
    const [productoSeleccionado, setProductoSeleccionado] = useState(null)
    const [productosSeleccionados, setProductosSeleccionados] = useState([])
    const [filtros, setFiltros] = useState({
        fechaDesde: formatYmd(primerDia),
        fechaHasta: formatYmd(hoy),
        clienteId: '',
        categoriaId: '',
        productoIds: [],
    })
    const [filtrosAplicados, setFiltrosAplicados] = useState({
        fechaDesde: formatYmd(primerDia),
        fechaHasta: formatYmd(hoy),
        clienteId: '',
        categoriaId: '',
        productoIds: [],
    })

    useEffect(() => {
        cargarReporte(filtrosAplicados)
    }, [filtrosAplicados])

    useEffect(() => {
        const timer = setTimeout(() => {
            cargarClientes(clienteBusqueda)
        }, 250)
        return () => clearTimeout(timer)
    }, [clienteBusqueda])

    useEffect(() => {
        const cargarCategorias = async () => {
            try {
                setCategoriasLoading(true)
                const respCategorias = await api.get('/categorias/')
                setCategorias(Array.isArray(respCategorias.data) ? respCategorias.data : [])
            } catch {
                setCategorias([])
            } finally {
                setCategoriasLoading(false)
            }
        }
        cargarCategorias()
    }, [])

    useEffect(() => {
        const timer = setTimeout(() => {
            cargarProductos(productoBusqueda, filtros.categoriaId)
        }, 250)
        return () => clearTimeout(timer)
    }, [productoBusqueda, filtros.categoriaId])

    const cargarClientes = async buscar => {
        try {
            setClientesLoading(true)
            const params = new URLSearchParams({ page: '1', page_size: '20' })
            if ((buscar || '').trim()) params.append('buscar', buscar.trim())
            const response = await api.get(`/clientes/listado-optimizado?${params.toString()}`)
            setClientes(response.data.items || [])
        } catch {
            setClientes([])
        } finally {
            setClientesLoading(false)
        }
    }

    const cargarProductos = async (buscar = '', categoriaId = '') => {
        try {
            setProductosLoading(true)
            const params = new URLSearchParams({ page: '1', page_size: '100' })
            if ((buscar || '').trim()) params.append('buscar', buscar.trim())
            if (categoriaId) params.append('categoria_id', categoriaId)
            const response = await api.get(`/productos/listado-optimizado?${params.toString()}`)
            setProductos(response.data?.items || [])
        } catch {
            setProductos([])
        } finally {
            setProductosLoading(false)
        }
    }

    const buildQueryParams = filtrosActuales => {
        const params = new URLSearchParams()
        if (filtrosActuales.fechaDesde) params.append('fecha_desde', filtrosActuales.fechaDesde)
        if (filtrosActuales.fechaHasta) params.append('fecha_hasta', filtrosActuales.fechaHasta)
        if (filtrosActuales.clienteId) params.append('cliente_id', filtrosActuales.clienteId)
        if (filtrosActuales.categoriaId) params.append('categoria_id', filtrosActuales.categoriaId)
        if (Array.isArray(filtrosActuales.productoIds) && filtrosActuales.productoIds.length > 0) {
            filtrosActuales.productoIds.forEach(productoId => params.append('producto_ids', productoId))
        }
        return params
    }

    const cargarReporte = async filtrosActuales => {
        try {
            setLoading(true)
            setError('')
            const params = buildQueryParams(filtrosActuales)
            const response = await api.get(`/reportes/ventas-por-producto?${params.toString()}`)
            setData(response.data || null)
        } catch (err) {
            setError(err?.response?.data?.detail || 'No se pudo cargar el reporte por productos.')
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

    const exportar = async tipo => {
        try {
            if (tipo === 'pdf') setExportingPdf(true)
            else setExportingExcel(true)

            const params = buildQueryParams(filtrosAplicados)
            await exportReportBlob(
                `/reportes/ventas-por-producto/${tipo}?${params.toString()}`,
                tipo === 'pdf'
                    ? 'application/pdf'
                    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                tipo === 'pdf' ? { openInNewTab: true } : undefined,
            )
        } catch {
            window.alert(`No se pudo exportar el reporte en ${tipo.toUpperCase()}.`)
        } finally {
            if (tipo === 'pdf') setExportingPdf(false)
            else setExportingExcel(false)
        }
    }
    const limpiarFiltros = () => {
        const reset = {
            fechaDesde: formatYmd(primerDia),
            fechaHasta: formatYmd(hoy),
            clienteId: '',
            categoriaId: '',
            productoIds: [],
        }
        setFiltros(reset)
        setFiltrosAplicados(reset)
        setClienteSeleccionado(null)
        setCategoriaSeleccionada(null)
        setProductoSeleccionado(null)
        setProductosSeleccionados([])
        setClienteBusqueda('')
        setCategoriaBusqueda('')
        setProductoBusqueda('')
    }

    const productosRows = Array.isArray(data?.productos) ? data.productos : []
    const categoriasFiltradas = useMemo(() => {
        const term = (categoriaBusqueda || '').trim().toLowerCase()
        if (!term) return categorias
        return categorias.filter(cat => String(cat?.nombre || '').toLowerCase().includes(term))
    }, [categoriaBusqueda, categorias])

    return (
        <div className="page-container">
            <header className="page-header" style={{ marginBottom: 18 }}>
                <div>
                    <h1 className="page-title">Reporte de Ventas por Productos</h1>
                    <p className="page-subtitle">Analiza ingresos, costos y utilidad por producto con filtros comerciales.</p>
                </div>
            </header>

            <div className="card filters-panel" style={{ marginBottom: 16 }}>
                <h3 style={{ marginBottom: 15, color: 'var(--text-primary)', fontSize: '1.05rem' }}>Filtros</h3>
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        gap: 10,
                        alignItems: 'end',
                    }}
                >
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
                            placeholder="Todos"
                            emptyMessage="No se encontraron clientes"
                            promptMessage="Escriba para buscar cliente"
                        />
                    </div>
                    <div className="form-group">
                        <label>Categoria</label>
                        <RemoteSearchSelect
                            value={categoriaSeleccionada}
                            onChange={option => {
                                const categoriaId = option ? String(option.value) : ''
                                setCategoriaSeleccionada(option || null)
                                setFiltros(prev => ({ ...prev, categoriaId, productoIds: [] }))
                                setProductoSeleccionado(null)
                                setProductosSeleccionados([])
                                setProductoBusqueda('')
                            }}
                            onSearch={setCategoriaBusqueda}
                            options={categoriasFiltradas.map(cat => ({
                                value: cat.id,
                                label: cat.nombre,
                            }))}
                            loading={categoriasLoading}
                            placeholder="Todas"
                            emptyMessage="No se encontraron categorías"
                            promptMessage="Escriba para buscar categoría"
                            minChars={0}
                        />
                    </div>
                    <div className="form-group">
                        <label>Productos (múltiples)</label>
                        <RemoteSearchSelect
                            value={productoSeleccionado}
                            onChange={option => {
                                if (!option) {
                                    setProductoSeleccionado(null)
                                    return
                                }
                                const value = String(option.value)
                                setProductoSeleccionado(null)
                                setProductoBusqueda('')
                                setFiltros(prev => {
                                    if (prev.productoIds.includes(value)) return prev
                                    return { ...prev, productoIds: [...prev.productoIds, value] }
                                })
                                setProductosSeleccionados(prev => {
                                    if (prev.some(item => String(item.value) === value)) return prev
                                    return [...prev, option]
                                })
                            }}
                            onSearch={setProductoBusqueda}
                            options={productos.map(prod => ({
                                value: prod.id,
                                label: prod.nombre,
                            }))}
                            loading={productosLoading}
                            placeholder="Todos"
                            emptyMessage="No se encontraron productos"
                            promptMessage="Escriba para buscar producto"
                            minChars={0}
                        />
                        {productosSeleccionados.length > 0 ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                                {productosSeleccionados.map(item => (
                                    <button
                                        key={item.value}
                                        type="button"
                                        className="btn btn-secondary"
                                        style={{ padding: '4px 8px', fontSize: '0.78rem' }}
                                        onClick={() => {
                                            const value = String(item.value)
                                            setProductosSeleccionados(prev => prev.filter(row => String(row.value) !== value))
                                            setFiltros(prev => ({ ...prev, productoIds: prev.productoIds.filter(id => String(id) !== value) }))
                                        }}
                                    >
                                        {item.label} ×
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </div>
                </div>
                <div className="filters-actions" style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                    <LoadingButton className="btn btn-primary" onClick={aplicarFiltros} loading={loading} loadingText="Filtrando...">
                        Filtrar resultados
                    </LoadingButton>
                    <button className="btn btn-secondary" onClick={limpiarFiltros}>Limpiar</button>
                    <div style={{ flex: 1 }} />
                    <LoadingButton
                        className="btn"
                        style={{ backgroundColor: '#27ae60', color: 'white' }}
                        onClick={() => exportar('excel')}
                        loading={exportingExcel}
                        loadingText="Exportando Excel..."
                        disabled={exportingPdf}
                    >
                        Excel
                    </LoadingButton>
                    <LoadingButton
                        className="btn"
                        style={{ backgroundColor: '#e74c3c', color: 'white' }}
                        onClick={() => exportar('pdf')}
                        loading={exportingPdf}
                        loadingText="Exportando PDF..."
                        disabled={exportingExcel}
                    >
                        PDF
                    </LoadingButton>
                </div>
            </div>

            {error ? (
                <div className="card">
                    <div className="alert alert-error">{error}</div>
                </div>
            ) : null}

            {data && (
                <div className="card">
                    <div className="table-container">
                        <table className="reporte-productos-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Producto</th>
                                    <th>Cantidad Vendida</th>
                                    <th>Ingresos Totales</th>
                                    <th>Costos Totales</th>
                                    <th>Utilidad Bruta</th>
                                    <th>Margen Bruto</th>
                                    <th>Precio Promedio</th>
                                </tr>
                            </thead>
                            <tbody>
                                {productosRows.map((item, idx) => (
                                    <tr key={`${item.producto_id || 'x'}-${idx}`}>
                                        <td style={{ color: 'var(--primary-light)', fontWeight: 700 }}>{idx + 1}</td>
                                        <td>{item.producto_nombre}</td>
                                        <td style={{ color: 'var(--primary-light)', fontWeight: 700 }}>{fmtNum(item.cantidad_vendida)}</td>
                                        <td style={{ color: '#22c55e', fontWeight: 700 }}>{formatCurrency(item.ingresos_totales || 0)}</td>
                                        <td style={{ color: '#ef4444', fontWeight: 700 }}>{formatCurrency(item.costos_totales || 0)}</td>
                                        <td style={{ color: '#fbbf24', fontWeight: 700 }}>{formatCurrency(item.utilidad_bruta || 0)}</td>
                                        <td style={{ color: '#d946ef', fontWeight: 700 }}>{fmtPercent(item.margen_bruto)}</td>
                                        <td style={{ color: '#14b8a6', fontWeight: 700 }}>{formatCurrency(item.precio_promedio || 0)}</td>
                                    </tr>
                                ))}
                                {productosRows.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                                            No hay datos para los filtros seleccionados.
                                        </td>
                                    </tr>
                                ) : null}
                            </tbody>
                        </table>
                    </div>
                    <div style={{ marginTop: 18, borderTop: '1px solid var(--border-color)', paddingTop: 14 }}>
                        <div style={{ fontWeight: 800, color: 'var(--primary-light)', marginBottom: 10, letterSpacing: 0.4 }}>
                            RESUMEN DEL PERIODO
                        </div>
                        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', color: 'var(--text-secondary)' }}>
                            <strong style={{ color: '#22c55e' }}>Total Ingresos: {formatCurrency(data.total_ingresos || 0)}</strong>
                            <strong style={{ color: '#ef4444' }}>Total Costos: {formatCurrency(data.total_costos || 0)}</strong>
                            <strong style={{ color: '#fbbf24' }}>Utilidad Bruta: {formatCurrency(data.utilidad_bruta_total || 0)}</strong>
                            <strong style={{ color: '#d946ef' }}>Margen Bruto Prom: {fmtPercent(data.margen_bruto_promedio)}</strong>
                            <strong>Productos Vendidos: {fmtNum(data.total_productos || 0)}</strong>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .reporte-productos-table th {
                    white-space: nowrap;
                    position: sticky;
                    top: 0;
                    z-index: 1;
                }
                .reporte-productos-table td:first-child,
                .reporte-productos-table th:first-child {
                    width: 50px;
                    text-align: center;
                }
            `}</style>
        </div>
    )
}
