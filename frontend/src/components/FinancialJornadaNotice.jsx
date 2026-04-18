import { AlertCircle, CalendarClock } from 'lucide-react'
import { useState } from 'react'

import Modal from './Modal'
import { useAuth } from '../context/AuthContext'
import { hasActionAccess } from '../utils/roles'
import { useAbrirJornada, useFinancialJornadaStatus } from '../hooks/useFinancialJornada'

function fmtGs(value) {
    return `Gs. ${new Intl.NumberFormat('es-PY').format(value ?? 0)}`
}

function JornadaOpenForm({ onDone }) {
    const [observacion, setObservacion] = useState('')
    const abrirJornada = useAbrirJornada()

    const handleSubmit = event => {
        event.preventDefault()
        abrirJornada.mutate(
            { observacion: observacion.trim() || null },
            { onSuccess: () => onDone?.() },
        )
    }

    return (
        <form onSubmit={handleSubmit}>
            <div className="form-group">
                <label className="form-label">Observación de apertura</label>
                <textarea
                    className="form-input"
                    rows={4}
                    value={observacion}
                    onChange={event => setObservacion(event.target.value)}
                    placeholder="Opcional. Ej: apertura normal del turno mañana."
                    style={{ resize: 'vertical' }}
                />
            </div>

            {abrirJornada.isError && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#f87171' }}>
                    {abrirJornada.error?.response?.data?.detail || 'No se pudo abrir la jornada.'}
                </div>
            )}

            <div className="flex gap-12" style={{ justifyContent: 'flex-end' }}>
                <button type="submit" className="btn btn-primary" disabled={abrirJornada.isPending}>
                    {abrirJornada.isPending ? 'Abriendo jornada...' : 'Abrir jornada'}
                </button>
            </div>
        </form>
    )
}

export default function FinancialJornadaNotice({
    compact = false,
    title = 'La jornada financiera de hoy no está abierta.',
    message = 'Para registrar cobros, gastos, pagos, transferencias o ajustes primero debes abrir la jornada.',
}) {
    const { user } = useAuth()
    const [openModal, setOpenModal] = useState(false)
    const { data, isLoading } = useFinancialJornadaStatus()
    const puedeAbrir = hasActionAccess(user, 'finanzas.jornada_abrir', 'finanzas')

    if (isLoading || data?.abierta) return null

    return (
        <>
            <div
                className="card"
                style={{
                    marginBottom: compact ? 12 : 16,
                    padding: compact ? '12px 14px' : '14px 18px',
                    borderColor: 'rgba(245, 158, 11, 0.3)',
                    background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(249, 115, 22, 0.08))',
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(245,158,11,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <AlertCircle size={18} style={{ color: '#f59e0b' }} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, marginBottom: 4 }}>{title}</div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', lineHeight: 1.45 }}>{message}</div>
                            {data?.resumen && (
                                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10, color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                                    <span>Ingresos hoy: {fmtGs(data.resumen.ingresos)}</span>
                                    <span>Egresos hoy: {fmtGs(data.resumen.egresos)}</span>
                                    <span>Movimientos: {data.resumen.movimientos_total}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {puedeAbrir && (
                        <button type="button" className="btn btn-primary" onClick={() => setOpenModal(true)}>
                            <CalendarClock size={16} /> Abrir jornada
                        </button>
                    )}
                </div>
            </div>

            {openModal && (
                <Modal title="Abrir jornada financiera" onClose={() => setOpenModal(false)} maxWidth="560px">
                    <JornadaOpenForm onDone={() => setOpenModal(false)} />
                </Modal>
            )}
        </>
    )
}
