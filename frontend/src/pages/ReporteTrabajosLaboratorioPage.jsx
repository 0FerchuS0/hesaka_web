import { useEffect, useState } from 'react'
import { FileText, FlaskConical } from 'lucide-react'

import LoadingButton from '../components/LoadingButton'
import { api } from '../context/AuthContext'
import { exportReportBlob } from '../utils/reportExports'

function fmt(value) {
    return new Intl.NumberFormat('es-PY').format(value ?? 0)
}

function fmtDate(value) {
    return value ? new Date(value).toLocaleDateString('es-PY') : '-'
}

export default function ReporteTrabajosLaboratorioPage() {
    const hoy = new Date()
    const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
    const formatYMD = value => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`

    const [loading, setLoading] = useState(false)
    const [exportingPdf, setExportingPdf] = useState(false)
    const [error, setError] = useState('')
    const [data, setData] = useState({ trabajos: [], total_trabajos: 0, total_saldo_pendiente: 0 })
    const [filtros, setFiltros] = useState({
        fechaDesde: formatYMD(primerDia),
        fechaHasta: formatYMD(hoy),
        buscar: '',
    })
    const [filtrosAplicados, setFiltrosAplicados] = useState({
        fechaDesde: formatYMD(primerDia),
        fechaHasta: formatYMD(hoy),
        buscar: '',
    })

    useEffect(() => {
        cargarReporte(filtrosAplicados)
    }, [filtrosAplicados])

    const cargarReporte = async filtrosActuales => {
        try {
            setLoading(true)
            setError('')
            const params = new URLSearchParams()
            if (filtrosActuales.fechaDesde) params.append('fecha_desde', filtrosActuales.fechaDesde)
            if (filtrosActuales.fechaHasta) params.append('fecha_hasta', filtrosActuales.fechaHasta)
            if (filtrosActuales.buscar?.trim()) params.append('buscar', filtrosActuales.buscar.trim())
            const response = await api.get(`/reportes/trabajos-laboratorio?${params.toString()}`)
            setData(response.data)
        } catch (err) {
            setError(err?.response?.data?.detail || 'No se pudo cargar el reporte de trabajos en laboratorio.')
        } finally {
            setLoading(false)
        }
    }

    const aplicarFiltros = () => setFiltrosAplicados({ ...filtros })

    const exportarPdf = async () => {
        try {
            setExportingPdf(true)
            const params = new URLSearchParams()
            if (filtrosAplicados.fechaDesde) params.append('fecha_desde', filtrosAplicados.fechaDesde)
            if (filtrosAplicados.fechaHasta) params.append('fecha_hasta', filtrosAplicados.fechaHasta)
            if (filtrosAplicados.buscar?.trim()) params.append('buscar', filtrosAplicados.buscar.trim())
            await exportReportBlob(`/reportes/trabajos-laboratorio/pdf?${params.toString()}`, 'application/pdf', { openInNewTab: true })
        } finally {
            setExportingPdf(false)
        }
    }

    return (
        <div className="page-body">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Trabajos en Laboratorio</h1>
                    <p className="page-subtitle">Controla ventas que siguen en laboratorio, con detalle del trabajo y saldo pendiente.</p>
                </div>
                <LoadingButton type="button" className="btn btn-secondary" onClick={exportarPdf} loading={exportingPdf} loadingText="Exportando PDF...">
                    <FileText size={16} />
                    PDF
                </LoadingButton>
            </div>

            <div className="card" style={{ marginBottom: 18 }}>
                <div className="filters-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, alignItems: 'end' }}>
                    <div className="form-group">
                        <label className="form-label">Desde</label>
                        <input className="form-input" type="date" value={filtros.fechaDesde} onChange={event => setFiltros(prev => ({ ...prev, fechaDesde: event.target.value }))} />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Hasta</label>
                        <input className="form-input" type="date" value={filtros.fechaHasta} onChange={event => setFiltros(prev => ({ ...prev, fechaHasta: event.target.value }))} />
                    </div>
                    <div className="form-group" style={{ gridColumn: 'span 2' }}>
                        <label className="form-label">Buscar</label>
                        <input className="form-input" value={filtros.buscar} onChange={event => setFiltros(prev => ({ ...prev, buscar: event.target.value }))} placeholder="Codigo o cliente..." />
                    </div>
                    <div className="form-group">
                        <LoadingButton type="button" className="btn btn-primary" onClick={aplicarFiltros} style={{ width: '100%' }} loading={loading} loadingText="Aplicando filtros...">
                            Aplicar filtros
                        </LoadingButton>
                    </div>
                </div>
            </div>

            <div className="kpi-grid" style={{ marginBottom: 18 }}>
                <div className="stat-card">
                    <div className="stat-label">Trabajos</div>
                    <div className="stat-value">{data.total_trabajos || 0}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Saldo pendiente</div>
                    <div className="stat-value" style={{ color: 'var(--warning)' }}>Gs. {fmt(data.total_saldo_pendiente)}</div>
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
                        <p>Cargando trabajos en laboratorio...</p>
                    </div>
                ) : data.trabajos.length === 0 ? (
                    <div className="empty-state" style={{ padding: '56px 20px' }}>
                        <FlaskConical size={40} />
                        <p>No hay trabajos en laboratorio para este periodo.</p>
                    </div>
                ) : (
                    <div className="table-container">
                        <table className="data-table" style={{ minWidth: 920 }}>
                            <thead>
                                <tr>
                                    <th style={{ width: 120 }}>Fecha</th>
                                    <th style={{ width: 130 }}>Codigo</th>
                                    <th style={{ width: 220 }}>Cliente</th>
                                    <th style={{ width: 380 }}>Detalle / Graduacion</th>
                                    <th style={{ width: 150 }} className="text-right">Saldo</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.trabajos.map(item => (
                                    <tr key={item.venta_id}>
                                        <td>{fmtDate(item.fecha)}</td>
                                        <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{item.codigo}</td>
                                        <td style={{ whiteSpace: 'normal', lineHeight: 1.25, wordBreak: 'break-word' }}>{item.cliente_nombre || '-'}</td>
                                        <td style={{ whiteSpace: 'normal', lineHeight: 1.3, wordBreak: 'break-word' }}>{item.detalle_trabajo || 'Sin detalles'}</td>
                                        <td className="text-right" style={{ color: item.saldo_pendiente > 0 ? 'var(--warning)' : 'var(--success)', fontWeight: 800 }}>
                                            Gs. {fmt(item.saldo_pendiente)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}
