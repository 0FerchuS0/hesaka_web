import { useEffect, useMemo, useState } from 'react'

import { api } from '../context/AuthContext'
import { formatCurrency } from '../utils/formatters'

const formatYmd = date =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const formatPercent = value => {
    if (value === null || value === undefined) return '--'
    const sign = value > 0 ? '+' : ''
    return `${sign}${value.toFixed(2)}%`
}

const getVariationColor = value => {
    if (value === null || value === undefined) return 'var(--text-muted)'
    return value >= 0 ? 'var(--success)' : 'var(--danger)'
}

const getVariationBg = value => {
    if (value === null || value === undefined) return 'rgba(255,255,255,0.06)'
    return value >= 0 ? 'rgba(16, 185, 129, 0.14)' : 'rgba(239, 68, 68, 0.14)'
}

const summaryCardStyle = {
    display: 'grid',
    gridTemplateColumns: '48px 1fr',
    gap: 14,
    alignItems: 'start',
    minHeight: 140,
    padding: 18,
    borderRadius: 16,
    border: '1px solid var(--border)',
    background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.015) 100%)',
}

const metricCardStyle = {
    padding: 16,
    borderRadius: 14,
    border: '1px solid var(--border)',
    background: 'rgba(255,255,255,0.02)',
}

const headerCellStyle = {
    position: 'sticky',
    top: 0,
    zIndex: 2,
    background: '#202431',
}

function SummaryCard({ icon, accent, accentSoft, title, value, subtitle }) {
    return (
        <div style={{ ...summaryCardStyle, borderLeft: `4px solid ${accent}` }}>
            <div
                style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: accentSoft,
                    color: accent,
                    fontSize: 22,
                    fontWeight: 800,
                }}
            >
                {icon}
            </div>
            <div>
                <div className="kpi-title" style={{ marginBottom: 8 }}>{title}</div>
                <div style={{ color: 'var(--text-primary)', fontSize: '1.6rem', fontWeight: 800, lineHeight: 1.15 }}>
                    {value}
                </div>
                <div className="kpi-subtitle" style={{ marginTop: 10 }}>
                    {subtitle}
                </div>
            </div>
        </div>
    )
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
    const filaActual = filas[0] || null
    const totalVentas = filas.reduce((acc, fila) => acc + Number(fila.total_ventas || 0), 0)
    const totalComisiones = filas.reduce((acc, fila) => acc + Number(fila.total_comisiones || 0), 0)
    const utilidadNeta = filas.reduce((acc, fila) => acc + Number(fila.utilidad_neta || 0), 0)
    const promedioMargen = filas.length
        ? filas.reduce((acc, fila) => acc + Number(fila.margen_bruto_promedio || 0), 0) / filas.length
        : null
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
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
                    <div>
                        <h3 style={{ marginBottom: 6, color: 'var(--text-primary)', fontSize: '1.05rem' }}>Configuracion del reporte</h3>
                        <div className="page-subtitle">
                            Elige si quieres revisar cierre mensual completo o un corte acumulado hasta un dia especifico.
                        </div>
                    </div>
                    <div
                        style={{
                            alignSelf: 'flex-start',
                            padding: '8px 12px',
                            borderRadius: 999,
                            background: filtros.modo === 'MES' ? 'rgba(59, 130, 246, 0.14)' : 'rgba(245, 158, 11, 0.14)',
                            color: filtros.modo === 'MES' ? '#93c5fd' : '#fcd34d',
                            border: '1px solid rgba(255,255,255,0.08)',
                            fontWeight: 700,
                        }}
                    >
                        {filtros.modo === 'MES' ? 'Cierre mensual' : 'Corte al dia'}
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1.3fr) minmax(220px, 1fr) auto', gap: 16, alignItems: 'end' }}>
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
                            disabled={filtros.modo === 'MES'}
                            onChange={event => setFiltros(prev => ({ ...prev, fechaReferencia: event.target.value }))}
                            style={filtros.modo === 'MES' ? {
                                opacity: 0.65,
                                cursor: 'not-allowed',
                                background: 'rgba(255,255,255,0.04)',
                            } : undefined}
                        />
                        <div className="page-subtitle" style={{ marginTop: 8 }}>
                            {filtros.modo === 'MES'
                                ? 'En cierre mensual no se usa el dia: siempre compara cada mes completo.'
                                : 'Aqui defines hasta que dia de cada mes se acumulara el comparativo.'}
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button className="btn btn-primary" onClick={() => setFiltrosAplicados({ ...filtros })} disabled={loading}>
                            {loading ? 'Generando...' : 'Generar reporte'}
                        </button>
                    </div>
                </div>
            </div>

            {data && (
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                        gap: 16,
                        marginBottom: 20,
                    }}
                >
                    <SummaryCard
                        icon="$"
                        accent="#38bdf8"
                        accentSoft="rgba(56, 189, 248, 0.14)"
                        title="Ventas acumuladas"
                        value={formatCurrency(totalVentas)}
                        subtitle={`${filas.length} periodos comparados`}
                    />
                    <SummaryCard
                        icon="%"
                        accent="#f59e0b"
                        accentSoft="rgba(245, 158, 11, 0.14)"
                        title="Comisiones acumuladas"
                        value={formatCurrency(totalComisiones)}
                        subtitle="Total de comisiones del comparativo"
                    />
                    <SummaryCard
                        icon="+"
                        accent="#22c55e"
                        accentSoft="rgba(34, 197, 94, 0.14)"
                        title="Utilidad neta acumulada"
                        value={formatCurrency(utilidadNeta)}
                        subtitle={`Margen promedio ${formatPercent(promedioMargen)}`}
                    />
                    <SummaryCard
                        icon="*"
                        accent="#a855f7"
                        accentSoft="rgba(168, 85, 247, 0.14)"
                        title="Mejor mes"
                        value={mejorMes?.mes_anio || 'Sin datos'}
                        subtitle={mejorMes ? formatCurrency(mejorMes.total_ventas) : 'Aun sin datos comparativos'}
                    />
                </div>
            )}

            {filaActual && (
                <div className="card" style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
                        <div>
                            <h3 style={{ color: 'var(--text-primary)', fontSize: '1.05rem', marginBottom: 6 }}>Lectura del periodo actual</h3>
                            <div className="page-subtitle">
                                Resumen rapido del periodo de referencia para ubicar tendencia, ventas y comparativos sin leer toda la tabla.
                            </div>
                        </div>
                        <div
                            style={{
                                padding: '8px 12px',
                                borderRadius: 999,
                                background: 'rgba(255,255,255,0.05)',
                                color: 'var(--text-secondary)',
                                border: '1px solid var(--border)',
                                fontWeight: 700,
                                alignSelf: 'flex-start',
                            }}
                        >
                            {filaActual.periodo_texto}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                        <div style={metricCardStyle}>
                            <div className="kpi-title">Periodo de referencia</div>
                            <div style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: '1.2rem', marginTop: 8 }}>{filaActual.mes_anio}</div>
                            <div className="kpi-subtitle" style={{ marginTop: 6 }}>
                                {filtrosAplicados.modo === 'MES' ? 'Comparativo de cierre mensual' : 'Comparativo acumulado al dia'}
                            </div>
                        </div>

                        <div style={metricCardStyle}>
                            <div className="kpi-title">Ventas del periodo</div>
                            <div style={{ color: '#93c5fd', fontWeight: 800, fontSize: '1.2rem', marginTop: 8 }}>{formatCurrency(filaActual.total_ventas)}</div>
                            <div className="kpi-subtitle" style={{ marginTop: 6 }}>{filaActual.cantidad_ventas} ventas registradas</div>
                        </div>

                        <div style={metricCardStyle}>
                            <div className="kpi-title">Vs mes anterior</div>
                            <div style={{ color: getVariationColor(filaActual.variacion_vs_mes_anterior), fontWeight: 800, fontSize: '1.2rem', marginTop: 8 }}>
                                {formatPercent(filaActual.variacion_vs_mes_anterior)}
                            </div>
                            <div className="kpi-subtitle" style={{ marginTop: 6 }}>
                                Comparacion directa contra el periodo inmediato anterior
                            </div>
                        </div>

                        <div style={metricCardStyle}>
                            <div className="kpi-title">Vs mismo mes ano anterior</div>
                            <div style={{ color: getVariationColor(filaActual.variacion_vs_mismo_mes_ano_anterior), fontWeight: 800, fontSize: '1.2rem', marginTop: 8 }}>
                                {formatPercent(filaActual.variacion_vs_mismo_mes_ano_anterior)}
                            </div>
                            <div className="kpi-subtitle" style={{ marginTop: 6 }}>
                                Referencia interanual del mismo mes
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
                    <div>
                        <h3 style={{ color: 'var(--text-primary)', fontSize: '1.05rem', marginBottom: 6 }}>Detalle comparativo</h3>
                        <div className="page-subtitle">
                            Azul para ventas, rojo para costos, verde para utilidad neta y badges para margen y variaciones.
                        </div>
                    </div>
                </div>

                <div className="table-responsive" style={{ maxHeight: '62vh', overflow: 'auto' }}>
                    <table className="table">
                        <thead>
                            <tr>
                                <th style={headerCellStyle}>Mes / Ano</th>
                                <th style={headerCellStyle}>Periodo</th>
                                <th className="text-right" style={headerCellStyle}>Ventas</th>
                                <th className="text-right" style={headerCellStyle}>Costos</th>
                                <th className="text-right" style={headerCellStyle}>Util. Bruta</th>
                                <th className="text-right" style={headerCellStyle}>Comisiones</th>
                                <th className="text-right" style={headerCellStyle}>Util. Neta</th>
                                <th className="text-right" style={headerCellStyle}>Margen</th>
                                <th className="text-center" style={headerCellStyle}>Cant.</th>
                                <th className="text-right" style={headerCellStyle}>Vs mes ant.</th>
                                <th className="text-right" style={headerCellStyle}>Vs ano ant.</th>
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
                            ) : filas.length === 0 ? (
                                <tr>
                                    <td colSpan="11" className="text-center" style={{ padding: 40, color: 'var(--text-muted)' }}>
                                        No se encontraron datos comparativos para la referencia elegida.
                                    </td>
                                </tr>
                            ) : (
                                filas.map((fila, index) => (
                                    <tr
                                        key={`${fila.year}-${fila.month}`}
                                        style={{
                                            background:
                                                fila === filaActual
                                                    ? 'rgba(59, 130, 246, 0.06)'
                                                    : index % 2 === 0
                                                        ? 'rgba(255,255,255,0.01)'
                                                        : 'transparent',
                                        }}
                                    >
                                        <td>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                <strong style={{ color: 'var(--text-primary)' }}>{fila.mes_anio}</strong>
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                                                    {fila === filaActual ? 'Periodo de referencia' : 'Periodo historico'}
                                                </span>
                                            </div>
                                        </td>
                                        <td>
                                            <span
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    padding: '6px 10px',
                                                    borderRadius: 999,
                                                    fontSize: '0.8rem',
                                                    fontWeight: 700,
                                                    color: fila.periodo_texto?.toLowerCase().includes('mes') ? '#93c5fd' : '#fcd34d',
                                                    background: fila.periodo_texto?.toLowerCase().includes('mes') ? 'rgba(59, 130, 246, 0.14)' : 'rgba(245, 158, 11, 0.14)',
                                                }}
                                            >
                                                {fila.periodo_texto}
                                            </span>
                                        </td>
                                        <td className="text-right" style={{ color: '#bfdbfe', fontWeight: 800 }}>
                                            {formatCurrency(fila.total_ventas)}
                                        </td>
                                        <td className="text-right" style={{ color: '#fca5a5', fontWeight: 700 }}>
                                            {formatCurrency(fila.total_costos)}
                                        </td>
                                        <td className="text-right" style={{ color: '#c4b5fd', fontWeight: 700 }}>
                                            {formatCurrency(fila.utilidad_bruta)}
                                        </td>
                                        <td className="text-right" style={{ color: '#fdba74', fontWeight: 700 }}>
                                            {formatCurrency(fila.total_comisiones)}
                                        </td>
                                        <td className="text-right" style={{ color: '#86efac', fontWeight: 800 }}>
                                            {formatCurrency(fila.utilidad_neta)}
                                        </td>
                                        <td className="text-right">
                                            <span
                                                style={{
                                                    display: 'inline-flex',
                                                    justifyContent: 'center',
                                                    minWidth: 76,
                                                    padding: '6px 10px',
                                                    borderRadius: 999,
                                                    background: Number(fila.margen_bruto_promedio || 0) >= 50 ? 'rgba(16, 185, 129, 0.14)' : 'rgba(245, 158, 11, 0.14)',
                                                    color: Number(fila.margen_bruto_promedio || 0) >= 50 ? '#86efac' : '#fcd34d',
                                                    fontWeight: 800,
                                                }}
                                            >
                                                {formatPercent(fila.margen_bruto_promedio)}
                                            </span>
                                        </td>
                                        <td className="text-center">
                                            <span
                                                style={{
                                                    display: 'inline-flex',
                                                    justifyContent: 'center',
                                                    minWidth: 44,
                                                    padding: '5px 8px',
                                                    borderRadius: 999,
                                                    background: 'rgba(255,255,255,0.06)',
                                                    color: 'var(--text-primary)',
                                                    fontWeight: 700,
                                                }}
                                            >
                                                {fila.cantidad_ventas}
                                            </span>
                                        </td>
                                        <td className="text-right">
                                            <span
                                                style={{
                                                    display: 'inline-flex',
                                                    justifyContent: 'flex-end',
                                                    minWidth: 84,
                                                    padding: '6px 10px',
                                                    borderRadius: 999,
                                                    background: getVariationBg(fila.variacion_vs_mes_anterior),
                                                    color: getVariationColor(fila.variacion_vs_mes_anterior),
                                                    fontWeight: 800,
                                                }}
                                            >
                                                {formatPercent(fila.variacion_vs_mes_anterior)}
                                            </span>
                                        </td>
                                        <td className="text-right">
                                            <span
                                                style={{
                                                    display: 'inline-flex',
                                                    justifyContent: 'flex-end',
                                                    minWidth: 84,
                                                    padding: '6px 10px',
                                                    borderRadius: 999,
                                                    background: getVariationBg(fila.variacion_vs_mismo_mes_ano_anterior),
                                                    color: getVariationColor(fila.variacion_vs_mismo_mes_ano_anterior),
                                                    fontWeight: 800,
                                                }}
                                            >
                                                {formatPercent(fila.variacion_vs_mismo_mes_ano_anterior)}
                                            </span>
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
