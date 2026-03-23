import { useEffect, useMemo, useState } from 'react'

import { api } from '../context/AuthContext'
import { formatCurrency } from '../utils/formatters'

const meses = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const formatYmd = date =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const formatPercent = value => {
    if (value === null || value === undefined) return '—'
    const sign = value > 0 ? '+' : ''
    return `${sign}${value.toFixed(2)}%`
}

export default function ReporteComparativoMensualPage() {
    const hoy = useMemo(() => new Date(), [])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [data, setData] = useState(null)
    const [filtros, setFiltros] = useState({
        modo: 'MES',
        fechaReferencia: formatYmd(hoy),
    })
    const [filtrosAplicados, setFiltrosAplicados] = useState({
        modo: 'MES',
        fechaReferencia: formatYmd(hoy),
    })

    useEffect(() => {
        cargarReporte(filtrosAplicados)
    }, [filtrosAplicados])

    const cargarReporte = async filtrosActivos => {
        try {
            setLoading(true)
            setError('')
            const params = new URLSearchParams()
            params.append('modo', filtrosActivos.modo)
            if (filtrosActivos.fechaReferencia) {
                params.append('fecha_referencia', filtrosActivos.fechaReferencia)
            }
            const response = await api.get(`/reportes/ventas/comparativo-mensual?${params.toString()}`)
            setData(response.data || null)
        } catch (err) {
            console.error('Error cargando comparativo mensual:', err)
            setError(err?.response?.data?.detail || 'No se pudo cargar el reporte comparativo mensual.')
            setData(null)
        } finally {
            setLoading(false)
        }
    }

    const filas = Array.isArray(data?.filas) ? data.filas : []
    const filasOrdenadas = [...filas]
    const filaActual = filas[0] || null
    const totalVentas = filas.reduce((acc, fila) => acc + Number(fila.total_ventas || 0), 0)
    const totalComisiones = filas.reduce((acc, fila) => acc + Number(fila.total_comisiones || 0), 0)
    const utilidadNeta = filas.reduce((acc, fila) => acc + Number(fila.utilidad_neta || 0), 0)
    const mejorMes = filas.reduce((best, fila) => (!best || fila.total_ventas > best.total_ventas ? fila : best), null)

    return (
        <div className="page-container">
            <header className="page-header" style={{ marginBottom: 20 }}>
                <div>
                    <h1 className="page-title">Reporte Comparativo Mensual (Interanual)</h1>
                    <p className="page-subtitle">
                        Replica del comparativo Python: 13 meses, con cierre mensual completo o corte acumulado por dia.
                    </p>
                </div>
            </header>

            <div className="card filters-panel" style={{ marginBottom: 20 }}>
                <h3 style={{ marginBottom: 15, color: 'var(--text-primary)', fontSize: '1.05rem' }}>Configuracion del reporte</h3>

                <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr auto', gap: 16, alignItems: 'end' }}>
                    <div className="form-group">
                        <label>Tipo de comparativo</label>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                className={`btn ${filtros.modo === 'MES' ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => setFiltros(prev => ({ ...prev, modo: 'MES' }))}
                            >
                                Mes completo (cierre)
                            </button>
                            <button
                                type="button"
                                className={`btn ${filtros.modo === 'DIA' ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => setFiltros(prev => ({ ...prev, modo: 'DIA' }))}
                            >
                                Corte al dia
                            </button>
                        </div>
                        <div className="page-subtitle" style={{ marginTop: 8 }}>
                            {filtros.modo === 'MES'
                                ? 'Cada fila compara el total completo de cada mes.'
                                : 'Cada fila compara el acumulado desde el dia 1 hasta el mismo dia seleccionado.'}
                        </div>
                    </div>

                    <div className="form-group">
                        <label>{filtros.modo === 'MES' ? 'Mes de referencia' : 'Fecha de corte'}</label>
                        <input
                            type="date"
                            className="form-input"
                            value={filtros.fechaReferencia}
                            onChange={event => setFiltros(prev => ({ ...prev, fechaReferencia: event.target.value }))}
                        />
                    </div>

                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button className="btn btn-primary" onClick={() => setFiltrosAplicados({ ...filtros })} disabled={loading}>
                            {loading ? 'Generando...' : 'Generar reporte'}
                        </button>
                    </div>
                </div>
            </div>

            {data && (
                <div className="kpi-grid" style={{ marginBottom: 20 }}>
                    <div className="kpi-card" style={{ borderLeft: '4px solid #3498db' }}>
                        <div className="kpi-title">Ventas acumuladas</div>
                        <div className="kpi-value db-blue">{formatCurrency(totalVentas)}</div>
                        <div className="kpi-subtitle">13 periodos comparados</div>
                    </div>
                    <div className="kpi-card" style={{ borderLeft: '4px solid #9b59b6' }}>
                        <div className="kpi-title">Comisiones acumuladas</div>
                        <div className="kpi-value db-purple">{formatCurrency(totalComisiones)}</div>
                    </div>
                    <div className="kpi-card" style={{ borderLeft: '4px solid #2ecc71' }}>
                        <div className="kpi-title">Utilidad neta acumulada</div>
                        <div className="kpi-value db-green">{formatCurrency(utilidadNeta)}</div>
                    </div>
                    <div className="kpi-card" style={{ borderLeft: '4px solid #f39c12' }}>
                        <div className="kpi-title">Mejor mes</div>
                        <div className="kpi-value db-orange" style={{ fontSize: '1.35rem' }}>{mejorMes?.mes_anio || '—'}</div>
                        <div className="kpi-subtitle">{mejorMes ? formatCurrency(mejorMes.total_ventas) : 'Sin datos'}</div>
                    </div>
                </div>
            )}

            {filaActual && (
                <div className="card" style={{ marginBottom: 20 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16 }}>
                        <div>
                            <div className="kpi-title">Periodo de referencia</div>
                            <div style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{filaActual.mes_anio}</div>
                            <div className="kpi-subtitle">{filaActual.periodo_texto}</div>
                        </div>
                        <div>
                            <div className="kpi-title">Ventas del periodo</div>
                            <div style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{formatCurrency(filaActual.total_ventas)}</div>
                        </div>
                        <div>
                            <div className="kpi-title">Vs mes anterior</div>
                            <div style={{ color: filaActual.variacion_vs_mes_anterior >= 0 ? '#2ecc71' : '#e74c3c', fontWeight: 700 }}>
                                {formatPercent(filaActual.variacion_vs_mes_anterior)}
                            </div>
                        </div>
                        <div>
                            <div className="kpi-title">Vs mismo mes año anterior</div>
                            <div style={{ color: filaActual.variacion_vs_mismo_mes_ano_anterior >= 0 ? '#2ecc71' : '#e74c3c', fontWeight: 700 }}>
                                {formatPercent(filaActual.variacion_vs_mismo_mes_ano_anterior)}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="card">
                <div className="table-responsive">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Mes / Año</th>
                                <th>Periodo</th>
                                <th className="text-right">Ventas</th>
                                <th className="text-right">Costos</th>
                                <th className="text-right">Util. Bruta</th>
                                <th className="text-right">Comisiones</th>
                                <th className="text-right">Util. Neta</th>
                                <th className="text-right">Margen</th>
                                <th className="text-center">Cant.</th>
                                <th className="text-right">Vs mes ant.</th>
                                <th className="text-right">Vs año ant.</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="11" className="text-center" style={{ padding: 40 }}>
                                        <div className="spinner" style={{ margin: '0 auto' }} />
                                        <div style={{ marginTop: 10, color: 'var(--text-muted)' }}>Calculando comparativo mensual...</div>
                                    </td>
                                </tr>
                            ) : error ? (
                                <tr>
                                    <td colSpan="11" className="text-center text-danger" style={{ padding: 20 }}>{error}</td>
                                </tr>
                            ) : filasOrdenadas.length === 0 ? (
                                <tr>
                                    <td colSpan="11" className="text-center" style={{ padding: 40, color: 'var(--text-muted)' }}>
                                        No se encontraron datos comparativos para la referencia elegida.
                                    </td>
                                </tr>
                            ) : (
                                filasOrdenadas.map(fila => (
                                    <tr key={`${fila.year}-${fila.month}`}>
                                        <td><strong>{fila.mes_anio}</strong></td>
                                        <td>{fila.periodo_texto}</td>
                                        <td className="text-right">{formatCurrency(fila.total_ventas)}</td>
                                        <td className="text-right">{formatCurrency(fila.total_costos)}</td>
                                        <td className="text-right">{formatCurrency(fila.utilidad_bruta)}</td>
                                        <td className="text-right">{formatCurrency(fila.total_comisiones)}</td>
                                        <td className="text-right">{formatCurrency(fila.utilidad_neta)}</td>
                                        <td className="text-right">{formatPercent(fila.margen_bruto_promedio)}</td>
                                        <td className="text-center">{fila.cantidad_ventas}</td>
                                        <td className="text-right" style={{ color: fila.variacion_vs_mes_anterior >= 0 ? '#2ecc71' : '#e74c3c' }}>
                                            {formatPercent(fila.variacion_vs_mes_anterior)}
                                        </td>
                                        <td className="text-right" style={{ color: fila.variacion_vs_mismo_mes_ano_anterior >= 0 ? '#2ecc71' : '#e74c3c' }}>
                                            {formatPercent(fila.variacion_vs_mismo_mes_ano_anterior)}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
