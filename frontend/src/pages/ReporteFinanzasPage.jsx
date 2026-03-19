import { useEffect, useMemo, useState } from 'react'

import { api } from '../context/AuthContext'
import { exportReportBlob } from '../utils/reportExports'

function fmt(value) {
    return new Intl.NumberFormat('es-PY').format(value ?? 0)
}

function fmtDate(value) {
    return value ? new Date(value).toLocaleString('es-PY') : '-'
}

export default function ReporteFinanzasPage() {
    const [loading, setLoading] = useState(false)
    const [exporting, setExporting] = useState(false)
    const [error, setError] = useState('')
    const [vista, setVista] = useState('todos')
    const [data, setData] = useState(null)
    const [filtros, setFiltros] = useState({
        fechaDesde: '',
        fechaHasta: '',
        desdeInicio: false,
        origen: '',
        bancoId: '',
    })

    const [bancos, setBancos] = useState([])
    const [bancosLoading, setBancosLoading] = useState(false)

    useEffect(() => {
        const hoy = new Date()
        const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
        const formatYMD = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

        const iniciales = {
            fechaDesde: formatYMD(primerDia),
            fechaHasta: formatYMD(hoy),
            desdeInicio: false,
            origen: '',
            bancoId: '',
        }
        setFiltros(iniciales)
        cargarReporte(iniciales)
    }, [])

    const cargarBancos = async () => {
        try {
            if (bancosLoading || bancos.length > 0) {
                return
            }
            setBancosLoading(true)
            const response = await api.get('/bancos/')
            setBancos(response.data)
        } catch (err) {
            console.error('Error cargando bancos:', err)
        } finally {
            setBancosLoading(false)
        }
    }

    const cargarReporte = async filtrosActivos => {
        try {
            setLoading(true)
            setError('')
            const params = new URLSearchParams()
            if (filtrosActivos.desdeInicio) {
                params.append('desde_inicio', 'true')
            } else {
                if (filtrosActivos.fechaDesde) {
                    params.append('fecha_desde', filtrosActivos.fechaDesde)
                }
                if (filtrosActivos.fechaHasta) {
                    params.append('fecha_hasta', filtrosActivos.fechaHasta)
                }
            }
            if (filtrosActivos.origen) {
                params.append('origen', filtrosActivos.origen)
            }
            if (filtrosActivos.bancoId && filtrosActivos.origen !== 'CAJA') {
                params.append('banco_id', filtrosActivos.bancoId)
            }
            const response = await api.get(`/reportes/finanzas?${params.toString()}`)
            setData(response.data)
        } catch (err) {
            console.error('Error cargando reporte financiero:', err)
            setError('No se pudo cargar el reporte financiero.')
        } finally {
            setLoading(false)
        }
    }

    const movimientos = useMemo(() => {
        if (!data) {
            return []
        }
        if (vista === 'ingresos') {
            return data.ingresos
        }
        if (vista === 'egresos') {
            return data.egresos
        }
        return data.todos
    }, [data, vista])

    const exportarPDF = async () => {
        try {
            setExporting(true)
            const params = new URLSearchParams()
            if (filtros.desdeInicio) {
                params.append('desde_inicio', 'true')
            } else {
                if (filtros.fechaDesde) {
                    params.append('fecha_desde', filtros.fechaDesde)
                }
                if (filtros.fechaHasta) {
                    params.append('fecha_hasta', filtros.fechaHasta)
                }
            }
            if (filtros.origen) {
                params.append('origen', filtros.origen)
            }
            if (filtros.bancoId && filtros.origen !== 'CAJA') {
                params.append('banco_id', filtros.bancoId)
            }
            await exportReportBlob(
                `/reportes/finanzas/pdf?${params.toString()}`,
                'application/pdf',
                { openInNewTab: true }
            )
        } catch (err) {
            console.error('Error exportando PDF financiero:', err)
        } finally {
            setExporting(false)
        }
    }

    const exportarExcel = async () => {
        try {
            setExporting(true)
            const params = new URLSearchParams()
            if (filtros.desdeInicio) {
                params.append('desde_inicio', 'true')
            } else {
                if (filtros.fechaDesde) {
                    params.append('fecha_desde', filtros.fechaDesde)
                }
                if (filtros.fechaHasta) {
                    params.append('fecha_hasta', filtros.fechaHasta)
                }
            }
            if (filtros.origen) {
                params.append('origen', filtros.origen)
            }
            if (filtros.bancoId && filtros.origen !== 'CAJA') {
                params.append('banco_id', filtros.bancoId)
            }
            await exportReportBlob(
                `/reportes/finanzas/excel?${params.toString()}`,
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
        } catch (err) {
            console.error('Error exportando Excel financiero:', err)
        } finally {
            setExporting(false)
        }
    }

    return (
        <div className="page-container">
            <header className="page-header" style={{ marginBottom: '20px' }}>
                <div>
                    <h1 className="page-title">Balance Financiero Unificado</h1>
                    <p className="page-subtitle">Caja y bancos consolidados en una sola vista</p>
                </div>
            </header>

            <div className="card filters-panel" style={{ marginBottom: '20px' }}>
                <h3 style={{ marginBottom: '15px', color: 'var(--text-primary)', fontSize: '1.1rem' }}>Filtros</h3>
                <div className="filters-grid">
                    <div className="form-group">
                        <label>Desde Fecha</label>
                        <input
                            type="date"
                            className="form-input"
                            value={filtros.fechaDesde}
                            onChange={event => setFiltros(prev => ({ ...prev, fechaDesde: event.target.value }))}
                            disabled={filtros.desdeInicio}
                        />
                    </div>
                    <div className="form-group">
                        <label>Hasta Fecha</label>
                        <input
                            type="date"
                            className="form-input"
                            value={filtros.fechaHasta}
                            onChange={event => setFiltros(prev => ({ ...prev, fechaHasta: event.target.value }))}
                            disabled={filtros.desdeInicio}
                        />
                    </div>
                    <div className="form-group">
                        <label>Vista</label>
                        <select className="form-select" value={vista} onChange={event => setVista(event.target.value)}>
                            <option value="todos">Todo unificado</option>
                            <option value="ingresos">Solo ingresos</option>
                            <option value="egresos">Solo egresos</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Origen</label>
                        <select
                            className="form-select"
                            value={filtros.origen}
                            onChange={event => setFiltros(prev => ({
                                ...prev,
                                origen: event.target.value,
                                bancoId: event.target.value === 'CAJA' ? '' : prev.bancoId,
                            }))}
                        >
                            <option value="">Todos</option>
                            <option value="CAJA">Caja</option>
                            <option value="BANCO">Banco</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Banco</label>
                        <select
                            className="form-select"
                            value={filtros.bancoId}
                            onChange={event => setFiltros(prev => ({ ...prev, bancoId: event.target.value }))}
                            onFocus={() => cargarBancos()}
                            disabled={filtros.origen === 'CAJA'}
                        >
                            <option value="">{bancosLoading ? 'Cargando bancos...' : 'Todos los bancos'}</option>
                            {bancos.map(banco => (
                                <option key={banco.id} value={banco.id}>
                                    {banco.nombre_banco}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={filtros.desdeInicio}
                                onChange={event => setFiltros(prev => ({ ...prev, desdeInicio: event.target.checked }))}
                                style={{ accentColor: 'var(--primary)' }}
                            />
                            Desde el inicio
                        </label>
                    </div>
                </div>
                <div className="filters-actions" style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                    <button className="btn btn-primary" onClick={() => cargarReporte(filtros)}>
                        Aplicar Filtros
                    </button>
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
                        <div className="kpi-card" style={{ borderLeft: '4px solid #27ae60' }}>
                            <div className="kpi-title">Total Ingresos</div>
                            <div className="kpi-value" style={{ color: '#27ae60' }}>Gs. {fmt(data.total_ingresos)}</div>
                        </div>
                        <div className="kpi-card" style={{ borderLeft: '4px solid #e74c3c' }}>
                            <div className="kpi-title">Total Egresos</div>
                            <div className="kpi-value" style={{ color: '#e74c3c' }}>Gs. {fmt(data.total_egresos)}</div>
                        </div>
                        <div className="kpi-card" style={{ borderLeft: '4px solid #3498db' }}>
                            <div className="kpi-title">Resultado Neto</div>
                            <div className="kpi-value" style={{ color: '#3498db' }}>Gs. {fmt(data.resultado_neto)}</div>
                            <div className="kpi-subtitle">Margen: {data.margen.toFixed(2)}%</div>
                        </div>
                    </div>

                    <div className="kpi-grid" style={{ marginTop: '-4px' }}>
                        <div className="kpi-card" style={{ borderLeft: '4px solid #2563eb' }}>
                            <div className="kpi-title">Ingresos por Caja</div>
                            <div className="kpi-value" style={{ color: '#2563eb' }}>Gs. {fmt(data.ingresos_caja)}</div>
                            <div className="kpi-subtitle">Egresos Caja: Gs. {fmt(data.egresos_caja)}</div>
                        </div>
                        <div className="kpi-card" style={{ borderLeft: '4px solid #0f766e' }}>
                            <div className="kpi-title">Ingresos por Banco</div>
                            <div className="kpi-value" style={{ color: '#0f766e' }}>Gs. {fmt(data.ingresos_banco)}</div>
                            <div className="kpi-subtitle">Egresos Banco: Gs. {fmt(data.egresos_banco)}</div>
                        </div>
                    </div>

                    <div className="card" style={{ marginBottom: '20px', padding: '14px 18px' }}>
                        <div style={{ display: 'grid', gap: 6 }}>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Lectura del Balance</div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                                Este informe consolida cobros de ventas, gastos operativos, pagos de compras y ajustes reales registrados en caja y bancos.
                            </div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                                {filtros.desdeInicio
                                    ? 'Estas viendo el acumulado desde el inicio de uso del sistema.'
                                    : 'Las transferencias internas no deben interpretarse como ganancia o gasto operativo final.'}
                            </div>
                        </div>
                    </div>
                </>
            )}

            <div className="card">
                <div className="table-responsive">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Fecha</th>
                                <th>Origen</th>
                                <th>Categoria</th>
                                <th>Tipo</th>
                                <th>Concepto</th>
                                <th>Referencia</th>
                                <th className="text-right">Monto</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="7" className="text-center" style={{ padding: '40px' }}>
                                        <div className="spinner" style={{ margin: '0 auto' }}></div>
                                        <div style={{ marginTop: '10px', color: 'var(--text-muted)' }}>Cargando balance...</div>
                                    </td>
                                </tr>
                            ) : error ? (
                                <tr>
                                    <td colSpan="7" className="text-center text-danger" style={{ padding: '20px' }}>
                                        {error}
                                    </td>
                                </tr>
                            ) : !data || movimientos.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="text-center" style={{ padding: '40px', color: 'var(--text-muted)' }}>
                                        No se encontraron movimientos para este periodo
                                    </td>
                                </tr>
                            ) : (
                                movimientos.map((movimiento, index) => {
                                    const esEgreso = movimiento.tipo.includes('EGRESO') || movimiento.tipo.includes('(-)')
                                    return (
                                        <tr key={`${movimiento.referencia}-${index}`}>
                                            <td>{fmtDate(movimiento.fecha)}</td>
                                            <td>
                                                <div style={{ display: 'grid', gap: 4 }}>
                                                    <span className={`badge ${movimiento.origen === 'CAJA' ? 'badge-blue' : 'badge-gray'}`}>
                                                        {movimiento.origen}
                                                    </span>
                                                    {movimiento.banco_nombre && (
                                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                            {movimiento.banco_nombre}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td>
                                                <span className="badge badge-gray">{movimiento.categoria}</span>
                                            </td>
                                            <td style={{ color: esEgreso ? '#e74c3c' : '#27ae60', fontWeight: 700 }}>{movimiento.tipo}</td>
                                            <td>{movimiento.concepto}</td>
                                            <td>{movimiento.referencia}</td>
                                            <td className="text-right" style={{ color: esEgreso ? '#e74c3c' : '#27ae60', fontWeight: 700 }}>
                                                {esEgreso ? '-' : '+'} Gs. {fmt(movimiento.monto)}
                                            </td>
                                        </tr>
                                    )
                                })
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
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 15px;
                }
                .kpi-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
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
            `}</style>
        </div>
    )
}
