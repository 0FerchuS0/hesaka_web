import { useEffect, useMemo, useState } from 'react'

import Modal from './Modal'
import { useDestinatariosRendicionCatalog, useEditarRendicionJornada } from '../hooks/useFinancialJornada'

function fmtGs(value) {
    return `Gs. ${new Intl.NumberFormat('es-PY').format(value ?? 0)}`
}

function fmtDateTime(value) {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '-'
    return new Intl.DateTimeFormat('es-PY', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).format(date)
}

function toDateTimeLocalValue(value) {
    if (!value) return ''
    const date = new Date(value)
    const pad = number => String(number).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function toApiLocalDateTime(value) {
    if (!value) return null
    return value.length === 16 ? `${value}:00` : value
}

function resolverDestinatarioId(rendicion, catalogo) {
    if (rendicion?.destinatario_id) return String(rendicion.destinatario_id)
    const nombre = (rendicion?.rendido_a || '').trim().toLowerCase()
    if (!nombre || !catalogo?.length) return ''
    const match = catalogo.find(d => (d.nombre || '').trim().toLowerCase() === nombre)
    return match ? String(match.id) : ''
}

export default function EditarRendicionModal({ rendicion, onClose }) {
    const editarRendicion = useEditarRendicionJornada()
    const { data: destinatarios = [], isLoading: loadingDest } = useDestinatariosRendicionCatalog()

    const [fechaHora, setFechaHora] = useState(toDateTimeLocalValue(rendicion?.fecha_hora_rendicion))
    const [destinatarioId, setDestinatarioId] = useState('')
    const [montoRendido, setMontoRendido] = useState(String(rendicion?.monto_rendido ?? 0))
    const [observacion, setObservacion] = useState(rendicion?.observacion || '')
    const [motivoAjuste, setMotivoAjuste] = useState('')

    useEffect(() => {
        setFechaHora(toDateTimeLocalValue(rendicion?.fecha_hora_rendicion))
        setDestinatarioId(resolverDestinatarioId(rendicion, destinatarios))
        setMontoRendido(String(rendicion?.monto_rendido ?? 0))
        setObservacion(rendicion?.observacion || '')
        setMotivoAjuste('')
    }, [rendicion, destinatarios])

    const opcionesDestinatario = useMemo(() => {
        const idActual = rendicion?.destinatario_id
        return (destinatarios || []).filter(d => d.activo || d.id === idActual)
    }, [destinatarios, rendicion?.destinatario_id])

    const handleSubmit = event => {
        event.preventDefault()
        const idNum = Number(destinatarioId)
        if (!idNum) return
        editarRendicion.mutate(
            {
                rendicionId: rendicion.id,
                payload: {
                    fecha_hora_rendicion: toApiLocalDateTime(fechaHora),
                    destinatario_id: idNum,
                    monto_rendido: Number(montoRendido || 0),
                    observacion: observacion.trim() || null,
                    motivo_ajuste: motivoAjuste.trim(),
                },
            },
            {
                onSuccess: () => onClose?.(),
            },
        )
    }

    return (
        <Modal title={'Editar rendici\u00f3n'} onClose={onClose} maxWidth="700px">
            <form onSubmit={handleSubmit}>
                <div className="card mb-16" style={{ padding: '14px 16px', marginBottom: 16 }}>
                    <div style={{ display: 'grid', gap: 8, fontSize: '0.86rem' }}>
                        <div>Fecha actual: <strong>{fmtDateTime(rendicion?.fecha_hora_rendicion)}</strong></div>
                        <div>Monto sugerido del sistema: <strong style={{ color: 'var(--primary-light)' }}>{fmtGs(rendicion?.monto_sugerido || 0)}</strong></div>
                        {rendicion?.editada ? (
                            <div style={{ color: 'var(--warning)' }}>
                                {'Esta rendici\u00f3n ya fue ajustada por'} {rendicion?.usuario_ultima_edicion_nombre || '-'} {'el'} {fmtDateTime(rendicion?.fecha_hora_ultima_edicion)}.
                            </div>
                        ) : null}
                    </div>
                </div>

                <div className="form-group">
                    <label className="form-label">{'Fecha y hora de rendici\u00f3n *'}</label>
                    <input className="form-input" type="datetime-local" value={fechaHora} onChange={event => setFechaHora(event.target.value)} required />
                </div>

                <div className="form-group">
                    <label className="form-label">Rendido a (destinatario) *</label>
                    <select
                        className="form-input"
                        value={destinatarioId}
                        onChange={event => setDestinatarioId(event.target.value)}
                        required
                        disabled={loadingDest}
                    >
                        <option value="">{loadingDest ? 'Cargando...' : 'Seleccionar...'}</option>
                        {opcionesDestinatario.map(d => (
                            <option key={d.id} value={String(d.id)}>
                                {d.nombre}
                                {!d.activo ? ' (inactivo)' : ''}
                            </option>
                        ))}
                    </select>
                    {!rendicion?.destinatario_id && rendicion?.rendido_a ? (
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 6 }}>
                            Registro anterior sin catálogo: se sugirió coincidencia por nombre «{rendicion.rendido_a}». Confirme el destinatario correcto.
                        </div>
                    ) : null}
                </div>

                <div className="form-group">
                    <label className="form-label">Monto rendido *</label>
                    <input className="form-input" type="number" step="100" value={montoRendido} onChange={event => setMontoRendido(event.target.value)} required />
                </div>

                <div className="form-group">
                    <label className="form-label">{'Observaci\u00f3n'}</label>
                    <textarea
                        className="form-input"
                        rows={4}
                        value={observacion}
                        onChange={event => setObservacion(event.target.value)}
                        placeholder={'Aclaraci\u00f3n visible en la rendici\u00f3n'}
                        style={{ resize: 'vertical' }}
                    />
                </div>

                <div className="form-group">
                    <label className="form-label">Motivo del ajuste *</label>
                    <textarea
                        className="form-input"
                        rows={3}
                        value={motivoAjuste}
                        onChange={event => setMotivoAjuste(event.target.value)}
                        placeholder={'Explica por qu\u00e9 se corrige la fecha, el monto o el destinatario.'}
                        required
                        style={{ resize: 'vertical' }}
                    />
                </div>

                {editarRendicion.isError && (
                    <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#f87171' }}>
                        {editarRendicion.error?.response?.data?.detail || 'No se pudo actualizar la rendición.'}
                    </div>
                )}

                <div className="flex gap-12" style={{ justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-secondary" onClick={onClose} disabled={editarRendicion.isPending}>Cancelar</button>
                    <button type="submit" className="btn btn-primary" disabled={editarRendicion.isPending || !destinatarioId}>
                        {editarRendicion.isPending ? 'Guardando ajuste...' : 'Guardar cambios'}
                    </button>
                </div>
            </form>
        </Modal>
    )
}
