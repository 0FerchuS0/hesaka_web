import { useEffect, useMemo, useState } from 'react'
import { Activity, Download, FileJson, RotateCcw, Trash2 } from 'lucide-react'

import {
    clearPerformanceEntries,
    exportPerformanceReportCsv,
    exportPerformanceReportJson,
    getPerformanceEntries,
    summarizePerformanceEntries,
} from '../utils/performanceMonitor'

function fmtMs(value) {
    return `${new Intl.NumberFormat('es-PY').format(value || 0)} ms`
}

function fmtDateTime(value) {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString('es-PY')
}

export default function PerformanceReportPage() {
    const [version, setVersion] = useState(0)

    useEffect(() => {
        const refresh = () => setVersion(current => current + 1)
        window.addEventListener('hesaka:performance-report-updated', refresh)
        window.addEventListener('storage', refresh)
        return () => {
            window.removeEventListener('hesaka:performance-report-updated', refresh)
            window.removeEventListener('storage', refresh)
        }
    }, [])

    const entries = useMemo(() => getPerformanceEntries(), [version])
    const summary = useMemo(() => summarizePerformanceEntries(entries), [entries])

    const totalMuestras = entries.length
    const errores = entries.filter(entry => entry.outcome === 'error').length
    const promedioGeneral = totalMuestras
        ? Math.round(entries.reduce((sum, entry) => sum + Number(entry.durationMs || 0), 0) / totalMuestras)
        : 0

    return (
        <div className="page-body">
            <div className="mb-24" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, background: 'rgba(59,130,246,0.14)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Activity size={20} style={{ color: 'var(--primary-light)' }} />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Rendimiento Percibido</h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                            Cronometra los flujos mas usados y guarda el historial en este navegador.
                        </p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setVersion(current => current + 1)}>
                        <RotateCcw size={15} /> Actualizar
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={exportPerformanceReportCsv} disabled={!entries.length}>
                        <Download size={15} /> CSV
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={exportPerformanceReportJson} disabled={!entries.length}>
                        <FileJson size={15} /> JSON
                    </button>
                    <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => {
                            if (window.confirm('¿Borrar todo el historial de rendimiento guardado en este equipo?')) {
                                clearPerformanceEntries()
                                setVersion(current => current + 1)
                            }
                        }}
                        disabled={!entries.length}
                    >
                        <Trash2 size={15} /> Limpiar
                    </button>
                </div>
            </div>

            <div className="stats-grid mb-24" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <div className="stat-card">
                    <div className="stat-info">
                        <div className="stat-label">Muestras guardadas</div>
                        <div className="stat-value">{totalMuestras}</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-info">
                        <div className="stat-label">Promedio general</div>
                        <div className="stat-value">{fmtMs(promedioGeneral)}</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-info">
                        <div className="stat-label">Errores registrados</div>
                        <div className="stat-value">{errores}</div>
                    </div>
                </div>
            </div>

            <div className="card mb-16" style={{ padding: '16px 18px' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: 12 }}>Resumen por flujo</h3>
                {summary.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                        Aun no hay mediciones guardadas. Usa el sistema normalmente y aqui se iran acumulando.
                    </div>
                ) : (
                    <div className="table-container">
                        <table style={{ minWidth: 820 }}>
                            <thead>
                                <tr>
                                    <th>Flujo</th>
                                    <th>Muestras</th>
                                    <th>Promedio</th>
                                    <th>Min</th>
                                    <th>Max</th>
                                    <th>Errores</th>
                                </tr>
                            </thead>
                            <tbody>
                                {summary.map(item => (
                                    <tr key={item.flowKey}>
                                        <td style={{ fontWeight: 600 }}>{item.label}</td>
                                        <td>{item.count}</td>
                                        <td>{fmtMs(item.avgDurationMs)}</td>
                                        <td>{fmtMs(item.minDurationMs)}</td>
                                        <td>{fmtMs(item.maxDurationMs)}</td>
                                        <td>{item.errorCount}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="card" style={{ padding: '16px 18px' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: 12 }}>Detalle reciente</h3>
                {entries.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                        Cuando uses `login`, `nuevo cliente`, `nueva consulta`, `convertir a cliente`, `nuevo presupuesto`,
                        `convertir a venta`, `nueva compra` o `pagar compras`, veras el detalle aqui.
                    </div>
                ) : (
                    <div className="table-container">
                        <table style={{ minWidth: 1180 }}>
                            <thead>
                                <tr>
                                    <th>Inicio</th>
                                    <th>Flujo</th>
                                    <th>Resultado</th>
                                    <th>Duracion</th>
                                    <th>Usuario</th>
                                    <th>Pasos</th>
                                    <th>Contexto</th>
                                </tr>
                            </thead>
                            <tbody>
                                {entries.map(entry => (
                                    <tr key={entry.id}>
                                        <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(entry.startedAtIso)}</td>
                                        <td style={{ fontWeight: 600 }}>{entry.label}</td>
                                        <td>
                                            <span className={`badge ${entry.outcome === 'success' ? 'badge-green' : 'badge-red'}`}>
                                                {entry.outcome === 'success' ? 'OK' : 'ERROR'}
                                            </span>
                                        </td>
                                        <td>{fmtMs(entry.durationMs)}</td>
                                        <td>{entry.user?.nombre || '-'}</td>
                                        <td style={{ minWidth: 320 }}>
                                            <div style={{ display: 'grid', gap: 6 }}>
                                                {(entry.steps || []).map(step => (
                                                    <div key={`${entry.id}-${step.key}-${step.elapsedMs}`} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                        <strong style={{ color: 'var(--text-primary)' }}>{step.label}</strong>:
                                                        {' '}
                                                        {fmtMs(step.elapsedMs)}
                                                        {' '}
                                                        <span style={{ color: 'var(--text-muted)' }}>
                                                            (+{fmtMs(step.deltaMs)})
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </td>
                                        <td style={{ minWidth: 280, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                            {JSON.stringify(entry.metadata || {}, null, 2)}
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
