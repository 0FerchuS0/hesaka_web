import { useEffect, useState } from 'react'

import { api } from '../context/AuthContext'
import { exportReportBlob } from '../utils/reportExports'
import RemoteSearchSelect from '../components/RemoteSearchSelect'

function fmt(value) {
    return new Intl.NumberFormat('es-PY').format(value ?? 0)
}

function fmtDate(value) {
    return value ? new Date(value).toLocaleDateString('es-PY') : '-'
}

export default function ReporteComprasPage() {
    const [loading, setLoading] = useState(false)
    const [exporting, setExporting] = useState(false)
    const [error, setError] = useState('')
    const [data, setData] = useState(null)
    const [proveedores, setProveedores] = useState([])
    const [proveedoresLoading, setProveedoresLoading] = useState(false)
    const [proveedorBusqueda, setProveedorBusqueda] = useState('')
    const [proveedorSeleccionado, setProveedorSeleccionado] = useState(null)
    const [filtros, setFiltros] = useState({
        fechaDesde: '',
        fechaHasta: '',
        proveedorId: '',
        estado: '',
        tipoDocumento: '',
        condicionPago: '',
    })

    useEffect(() => {
        const hoy = new Date()
        const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
        const formatYMD = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        const iniciales = {
            fechaDesde: formatYMD(primerDia),
            fechaHasta: formatYMD(hoy),
            proveedorId: '',
            estado: '',
            tipoDocumento: '',
            condicionPago: '',
        }
        setFiltros(iniciales)
        cargarReporte(iniciales)
    }, [])

    useEffect(() => {
        if (!proveedorBusqueda.trim()) {
            setProveedores([])
            setProveedoresLoading(false)
            return
        }
        const timer = setTimeout(() => {
            cargarProveedores(proveedorBusqueda)
        }, 250)
        return () => clearTimeout(timer)
    }, [proveedorBusqueda])

    const cargarProveedores = async (buscar = '') => {
        try {
            setProveedoresLoading(true)
            const params = new URLSearchParams({ page: '1', page_size: '20' })
            if (buscar.trim()) params.append('buscar', buscar.trim())
            const response = await api.get(`/proveedores/listado-optimizado?${params.toString()}`)
            setProveedores(response.data.items || [])
        } catch (err) {
            console.error('Error cargando proveedores:', err)
        } finally {
            setProveedoresLoading(false)
        }
    }

    const construirParams = filtrosActivos => {
        const params = new URLSearchParams()
        if (filtrosActivos.fechaDesde) params.append('fecha_desde', filtrosActivos.fechaDesde)
        if (filtrosActivos.fechaHasta) params.append('fecha_hasta', filtrosActivos.fechaHasta)
        if (filtrosActivos.proveedorId) params.append('proveedor_id', filtrosActivos.proveedorId)
        if (filtrosActivos.estado) params.append('estado', filtrosActivos.estado)
        if (filtrosActivos.tipoDocumento) params.append('tipo_documento', filtrosActivos.tipoDocumento)
        if (filtrosActivos.condicionPago) params.append('condicion_pago', filtrosActivos.condicionPago)
        return params
    }

    const cargarReporte = async filtrosActivos => {
        try {
            setLoading(true)
            setError('')
            const params = construirParams(filtrosActivos)
            const response = await api.get(`/reportes/compras?${params.toString()}`)
            setData(response.data)
        } catch (err) {
            console.error('Error cargando reporte de compras:', err)
            setError('No se pudo cargar el reporte de compras.')
        } finally {
            setLoading(false)
        }
    }

    const exportarPDF = async () => {
        try {
            setExporting(true)
            const params = construirParams(filtros)
            await exportReportBlob(`/reportes/compras/pdf?${params.toString()}`, 'application/pdf', { openInNewTab: true })
        } catch (err) {
            console.error('Error exportando PDF de compras:', err)
        } finally {
            setExporting(false)
        }
    }

    const exportarExcel = async () => {
        try {
            setExporting(true)
            const params = construirParams(filtros)
            await exportReportBlob(`/reportes/compras/excel?${params.toString()}`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        } catch (err) {
            console.error('Error exportando Excel de compras:', err)
        } finally {
            setExporting(false)
        }
    }

    return (
        <div className="page-container">
            <header className="page-header" style={{ marginBottom: '20px' }}>
                <div>
                    <h1 className="page-title">Reporte de Compras y Proveedores</h1>
                    <p className="page-subtitle">Analiza compras, pagos y saldos pendientes por proveedor</p>
                </div>
            </header>

            <div className="card filters-panel" style={{ marginBottom: '20px' }}>
                <h3 style={{ marginBottom: '15px', color: 'var(--text-primary)', fontSize: '1.1rem' }}>Filtros</h3>
                <div className="filters-grid">
                    <div className="form-group">
                        <label>Desde Fecha</label>
                        <input type="date" className="form-input" value={filtros.fechaDesde} onChange={event => setFiltros(prev => ({ ...prev, fechaDesde: event.target.value }))} />
                    </div>
                    <div className="form-group">
                        <label>Hasta Fecha</label>
                        <input type="date" className="form-input" value={filtros.fechaHasta} onChange={event => setFiltros(prev => ({ ...prev, fechaHasta: event.target.value }))} />
                    </div>
                    <div className="form-group">
                        <label>Proveedor</label>
                        <RemoteSearchSelect
                            value={proveedorSeleccionado}
                            onChange={option => {
                                setProveedorSeleccionado(option || null)
                                setFiltros(prev => ({ ...prev, proveedorId: option ? option.value : '' }))
                            }}
                            onSearch={setProveedorBusqueda}
                            options={proveedores.map(proveedor => ({
                                value: proveedor.id,
                                label: proveedor.nombre,
                            }))}
                            loading={proveedoresLoading}
                            placeholder="Escriba para buscar proveedor..."
                            emptyMessage="No se encontraron proveedores"
                            promptMessage="Escriba para buscar proveedor"
                        />
                    </div>
                    <div className="form-group">
                        <label>Estado</label>
                        <select className="form-select" value={filtros.estado} onChange={event => setFiltros(prev => ({ ...prev, estado: event.target.value }))}>
                            <option value="">Todos</option>
                            <option value="PENDIENTE">PENDIENTE</option>
                            <option value="PAGADO">PAGADO</option>
                            <option value="VENCIDO">VENCIDO</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Documento</label>
                        <select className="form-select" value={filtros.tipoDocumento} onChange={event => setFiltros(prev => ({ ...prev, tipoDocumento: event.target.value }))}>
                            <option value="">Todos</option>
                            <option value="FACTURA">FACTURA</option>
                            <option value="ORDEN_SERVICIO">ORDEN_SERVICIO</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Condición</label>
                        <select className="form-select" value={filtros.condicionPago} onChange={event => setFiltros(prev => ({ ...prev, condicionPago: event.target.value }))}>
                            <option value="">Todas</option>
                            <option value="CONTADO">CONTADO</option>
                            <option value="CREDITO">CREDITO</option>
                        </select>
                    </div>
                </div>
                <div className="filters-actions" style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                    <button className="btn btn-primary" onClick={() => cargarReporte(filtros)}>Aplicar Filtros</button>
                    <div style={{ flex: 1 }} />
                    <button className="btn" style={{ backgroundColor: '#27ae60', color: 'white' }} onClick={exportarExcel} disabled={exporting}>
                        {exporting ? 'Exportando...' : 'Excel'}
                    </button>
                    <button className="btn" style={{ backgroundColor: '#e74c3c', color: 'white' }} onClick={exportarPDF} disabled={exporting}>
                        {exporting ? 'Exportando...' : 'PDF'}
                    </button>
                </div>
            </div>

            {data && (
                <>
                    <div className="kpi-grid">
                        <div className="kpi-card" style={{ borderLeft: '4px solid #2563eb' }}>
                            <div className="kpi-title">Total Comprado</div>
                            <div className="kpi-value" style={{ color: '#2563eb' }}>Gs. {fmt(data.total_comprado)}</div>
                            <div className="kpi-subtitle">{data.cantidad_compras} compras</div>
                        </div>
                        <div className="kpi-card" style={{ borderLeft: '4px solid #16a34a' }}>
                            <div className="kpi-title">Total Pagado</div>
                            <div className="kpi-value" style={{ color: '#16a34a' }}>Gs. {fmt(data.total_pagado)}</div>
                        </div>
                        <div className="kpi-card" style={{ borderLeft: '4px solid #ea580c' }}>
                            <div className="kpi-title">Saldo Pendiente</div>
                            <div className="kpi-value" style={{ color: '#ea580c' }}>Gs. {fmt(data.total_pendiente)}</div>
                        </div>
                        <div className="kpi-card" style={{ borderLeft: '4px solid #7c3aed' }}>
                            <div className="kpi-title">Compras Crédito</div>
                            <div className="kpi-value" style={{ color: '#7c3aed' }}>Gs. {fmt(data.total_credito)}</div>
                        </div>
                        <div className="kpi-card" style={{ borderLeft: '4px solid #0f766e' }}>
                            <div className="kpi-title">Compras Contado</div>
                            <div className="kpi-value" style={{ color: '#0f766e' }}>Gs. {fmt(data.total_contado)}</div>
                        </div>
                        <div className="kpi-card" style={{ borderLeft: '4px solid #b45309' }}>
                            <div className="kpi-title">Compras con OS</div>
                            <div className="kpi-value" style={{ color: '#b45309' }}>Gs. {fmt(data.total_os)}</div>
                        </div>
                    </div>

                    <div className="card" style={{ marginBottom: '20px' }}>
                        <h3 style={{ marginBottom: '15px', color: 'var(--text-primary)', fontSize: '1rem' }}>Resumen por proveedor</h3>
                        <div className="table-responsive compras-report-scroll">
                            <table className="table compras-report-table compras-report-table--summary">
                                <thead>
                                    <tr>
                                        <th>Proveedor</th>
                                        <th className="text-center">Compras</th>
                                        <th className="text-right">Total</th>
                                        <th className="text-right">Pagado</th>
                                        <th className="text-right">Pendiente</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.por_proveedor.length === 0 ? (
                                        <tr><td colSpan="5" className="text-center" style={{ padding: '24px', color: 'var(--text-muted)' }}>No hay resumen por proveedor para este período</td></tr>
                                    ) : (
                                        data.por_proveedor.map(item => (
                                            <tr key={`${item.proveedor_id || 'sin'}-${item.proveedor_nombre}`}>
                                                <td>{item.proveedor_nombre}</td>
                                                <td className="text-center">{item.cantidad_compras}</td>
                                                <td className="text-right fw-bold">Gs. {fmt(item.total_comprado)}</td>
                                                <td className="text-right" style={{ color: '#16a34a' }}>Gs. {fmt(item.total_pagado)}</td>
                                                <td className="text-right" style={{ color: '#ea580c', fontWeight: 700 }}>Gs. {fmt(item.saldo_pendiente)}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            <div className="card">
                <div className="table-responsive compras-report-scroll">
                    <table className="table compras-report-table compras-report-table--detail">
                        <thead>
                            <tr>
                                <th className="col-fecha">Fecha</th>
                                <th className="col-proveedor">Proveedor</th>
                                <th className="col-ventas">Ventas</th>
                                <th className="col-clientes">Clientes</th>
                                <th className="col-os">OS</th>
                                <th className="col-documento">Documento</th>
                                <th className="col-condicion">Condición</th>
                                <th className="col-tipo">Tipo</th>
                                <th className="col-estado">Estado</th>
                                <th className="col-entrega">Entrega</th>
                                <th className="text-right col-monto">Total</th>
                                <th className="text-right col-monto">Pagado</th>
                                <th className="text-right col-monto">Saldo</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="13" className="text-center" style={{ padding: '40px' }}>
                                        <div className="spinner" style={{ margin: '0 auto' }}></div>
                                        <div style={{ marginTop: '10px', color: 'var(--text-muted)' }}>Cargando reporte...</div>
                                    </td>
                                </tr>
                            ) : error ? (
                                <tr><td colSpan="13" className="text-center text-danger" style={{ padding: '20px' }}>{error}</td></tr>
                            ) : !data || data.compras.length === 0 ? (
                                <tr><td colSpan="13" className="text-center" style={{ padding: '40px', color: 'var(--text-muted)' }}>No se encontraron compras para este período</td></tr>
                            ) : (
                                data.compras.map(compra => (
                                    <tr key={compra.compra_id}>
                                        <td className="col-fecha">{fmtDate(compra.fecha)}</td>
                                        <td className="col-proveedor">{compra.proveedor_nombre}</td>
                                        <td className="col-ventas" title={compra.ventas_codigos || '-'}>{compra.ventas_codigos || '-'}</td>
                                        <td className="col-clientes" title={compra.clientes || '-'}>{compra.clientes || '-'}</td>
                                        <td className="col-os" title={compra.nro_os || '-'}>{compra.nro_os || '-'}</td>
                                        <td className="col-documento" title={`${compra.tipo_documento} ${compra.nro_factura || ''}`.trim()}>{`${compra.tipo_documento} ${compra.nro_factura || ''}`.trim()}</td>
                                        <td className="col-condicion">{compra.condicion_pago}</td>
                                        <td className="col-tipo">{compra.tipo_compra}</td>
                                        <td className="col-estado">{compra.estado}</td>
                                        <td className="col-entrega">{compra.estado_entrega}</td>
                                        <td className="text-right col-monto amount-total">Gs. {fmt(compra.total)}</td>
                                        <td className="text-right col-monto amount-paid">Gs. {fmt(compra.total_pagado)}</td>
                                        <td className="text-right col-monto amount-balance">Gs. {fmt(compra.saldo)}</td>
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
                    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
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
                .compras-report-scroll {
                    overflow-x: auto;
                    overflow-y: hidden;
                    padding-bottom: 4px;
                }
                .compras-report-table {
                    width: 100%;
                    table-layout: auto;
                }
                .compras-report-table--summary {
                    min-width: 720px;
                }
                .compras-report-table--detail {
                    min-width: 1480px;
                }
                .compras-report-table--detail th,
                .compras-report-table--detail td {
                    color: var(--text-primary);
                    vertical-align: middle;
                }
                .compras-report-table--detail th {
                    white-space: nowrap;
                }
                .compras-report-table--detail td.col-fecha,
                .compras-report-table--detail td.col-condicion,
                .compras-report-table--detail td.col-tipo,
                .compras-report-table--detail td.col-estado,
                .compras-report-table--detail td.col-entrega {
                    white-space: nowrap;
                }
                .compras-report-table--detail td.col-proveedor,
                .compras-report-table--detail td.col-ventas,
                .compras-report-table--detail td.col-clientes,
                .compras-report-table--detail td.col-os,
                .compras-report-table--detail td.col-documento {
                    white-space: normal;
                    line-height: 1.25;
                    word-break: break-word;
                }
                .compras-report-table--detail .col-fecha { min-width: 90px; }
                .compras-report-table--detail .col-proveedor { min-width: 210px; }
                .compras-report-table--detail .col-ventas { min-width: 110px; }
                .compras-report-table--detail .col-clientes { min-width: 210px; }
                .compras-report-table--detail .col-os { min-width: 160px; }
                .compras-report-table--detail .col-documento { min-width: 220px; }
                .compras-report-table--detail .col-condicion { min-width: 95px; }
                .compras-report-table--detail .col-tipo { min-width: 110px; }
                .compras-report-table--detail .col-estado { min-width: 95px; }
                .compras-report-table--detail .col-entrega { min-width: 105px; }
                .compras-report-table--detail .col-monto {
                    min-width: 120px;
                    white-space: nowrap;
                    font-weight: 700;
                }
                .compras-report-table--detail .amount-total {
                    color: var(--text-primary);
                }
                .compras-report-table--detail .amount-paid {
                    color: #16a34a;
                }
                .compras-report-table--detail .amount-balance {
                    color: #ea580c;
                }
                .compras-report-table--summary td:nth-child(1) {
                    min-width: 240px;
                }
                .compras-report-table--summary td,
                .compras-report-table--summary th {
                    color: var(--text-primary);
                }
                .compras-report-table--summary td:nth-child(1) {
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
            `}</style>
        </div>
    )
}
