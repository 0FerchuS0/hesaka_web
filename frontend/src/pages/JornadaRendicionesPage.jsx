import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CalendarClock, ClipboardList, Eye, FileSpreadsheet, FileText, HandCoins, Pencil, Wallet } from 'lucide-react'

import Modal from '../components/Modal'
import EditarRendicionModalLimpio from '../components/EditarRendicionModal'
import FinancialJornadaNotice from '../components/FinancialJornadaNotice'
import { api, useAuth } from '../context/AuthContext'
import { hasActionAccess } from '../utils/roles'
import {
    useActualizarDestinatarioRendicion,
    useCortesJornadaActual,
    useCrearCorteJornada,
    useCrearDestinatarioRendicion,
    useEliminarDestinatarioRendicion,
    useCrearRendicionJornada,
    useCrearRendicionJornadaHistorial,
    useDestinatariosRendicionCatalog,
    useFinancialJornadaStatus,
    useHistorialJornadas,
    useHistorialRendiciones,
    useMovimientosPosterioresUltimoCorte,
    useOpcionesFiltrosRendiciones,
    usePendienteRendicion,
    usePendienteRendicionHistorial,
    useRendicionDetalle,
    useRendicionesJornadaActual,
} from '../hooks/useFinancialJornada'
import { requestAndDownloadFile, requestAndOpenPdf } from '../utils/fileDownloads'

/** Marca ms desde t0Ref hasta la primera respuesta OK de una query (para ver cuellos de botella en la carga inicial). */
function useMarkJornadaBenchRow(show, t0Ref, key, isSuccess, dataUpdatedAt, setMs) {
    useEffect(() => {
        if (!show || !t0Ref.current) return
        if (!isSuccess || !dataUpdatedAt) return
        setMs(prev => {
            if (prev[key] != null) return prev
            return { ...prev, [key]: Math.round(performance.now() - t0Ref.current) }
        })
    }, [show, key, isSuccess, dataUpdatedAt, setMs])
}

const JORNADA_BENCH_STORAGE = 'hesaka_jornada_bench'

function readJornadaBenchFlagFromEnv() {
    if (typeof window === 'undefined') {
        return import.meta.env.DEV
    }
    if (import.meta.env.DEV) {
        return true
    }
    try {
        if (new URLSearchParams(window.location.search).get('jornadaBench') === '1') {
            return true
        }
        if (window.localStorage.getItem(JORNADA_BENCH_STORAGE) === '1') {
            return true
        }
        if (window.sessionStorage.getItem(JORNADA_BENCH_STORAGE) === '1') {
            return true
        }
    } catch {
        /* modo privado u origen file:// */
    }
    return false
}

function fmtGs(value) {
    return `Gs. ${new Intl.NumberFormat('es-PY').format(value ?? 0)}`
}

function toDateTimeLocalValue(value) {
    if (!value) return ''
    const date = new Date(value)
    const pad = number => String(number).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Fecha/hora en 24 h (evita confusion 1 vs 11 con formato 12 h del navegador). */
function fmtDateTime(value) {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
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

function toDateInputValue(value) {
    if (!value) return ''
    const date = new Date(value)
    const pad = number => String(number).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function formatApiError(error, fallback) {
    const status = error?.response?.status
    const payload = error?.response?.data
    const detail =
        (typeof payload === 'string' && payload.trim()) ||
        payload?.detail ||
        payload?.message ||
        ''
    if (status && detail) return `Error ${status}: ${detail}`
    if (status) return `Error ${status}: ${fallback}`
    if (detail) return detail
    return fallback
}

function getInicioMesActual() {
    const today = new Date()
    return new Date(today.getFullYear(), today.getMonth(), 1)
}

function getJornadaObservacion(jornada) {
    const pendiente = Number(jornada?.pendiente_rendicion || 0)
    const rendiciones = Number(jornada?.cantidad_rendiciones || 0)
    const estado = jornada?.estado || 'SIN_ESTADO'

    if (estado === 'ABIERTA' && Math.abs(pendiente) < 0.009) {
        return { text: 'Abierta y rendida al día', color: 'var(--success)' }
    }
    if (estado === 'ABIERTA' && rendiciones > 0 && Math.abs(pendiente) >= 0.009) {
        return { text: 'Abierta con saldo pendiente de rendir', color: 'var(--warning)' }
    }
    if (estado === 'ABIERTA') {
        return { text: 'Abierta sin rendición registrada', color: 'var(--warning)' }
    }
    if (estado === 'VENCIDA' && Math.abs(pendiente) < 0.009) {
        return { text: 'Vencida y totalmente rendida', color: 'var(--success)' }
    }
    if (estado === 'VENCIDA' && rendiciones > 0) {
        return { text: 'Vencida con saldo pendiente de rendir', color: 'var(--danger)' }
    }
    if (estado === 'VENCIDA') {
        return { text: 'Vencida sin rendición registrada', color: 'var(--danger)' }
    }
    return { text: estado, color: 'var(--text-muted)' }
}

const HISTORIAL_ROW_MENU_WIDTH = 220
/** Por encima del layout/sidebar; por debajo del modal (200) para no tapar modales abiertos */
const TABLE_ACTION_MENU_Z_BACKDROP = 140
const TABLE_ACTION_MENU_Z_MENU = 150
const ENABLE_JORNADA_BENCH = false

function getDropdownPortalTarget() {
    if (typeof document === 'undefined') return null
    return document.getElementById('hesaka-dropdown-root') ?? document.body
}

function scrollableAncestors(el) {
    const out = []
    let node = el?.parentElement
    while (node && node !== document.body) {
        const st = getComputedStyle(node)
        if (/(auto|scroll|overlay)/.test(st.overflowY) || /(auto|scroll|overlay)/.test(st.overflowX)) {
            out.push(node)
        }
        node = node.parentElement
    }
    return out
}

/**
 * Menú en coordenadas de viewport. Si abajo no hay altura útil (últimas filas + tabla con scroll),
 * se abre hacia arriba con maxHeight según el hueco real — evita caja diminuta “pegada” al borde del contenedor.
 */
function useHistorialRowMenuPosition(open, triggerRef) {
    const [pos, setPos] = useState(null)

    useLayoutEffect(() => {
        if (!open || !triggerRef.current) {
            setPos(null)
            return undefined
        }

        const update = () => {
            const el = triggerRef.current
            if (!el) return
            const r = el.getBoundingClientRect()
            const vw = window.innerWidth
            const vh = window.innerHeight
            const pad = 10
            let left = Math.min(r.left, vw - HISTORIAL_ROW_MENU_WIDTH - pad)
            left = Math.max(8, left)
            const gap = 6
            const maxHBelow = Math.floor(vh - r.bottom - gap - pad)
            const maxHAbove = Math.floor(r.top - gap - pad)
            const minComfortBelow = 100
            const preferBelow = maxHBelow >= minComfortBelow || maxHBelow >= maxHAbove

            let top
            let maxHeight
            if (preferBelow) {
                top = r.bottom + gap
                maxHeight = Math.min(300, Math.max(48, maxHBelow))
            } else {
                maxHeight = Math.min(300, Math.max(48, maxHAbove))
                top = Math.max(pad, r.top - maxHeight - gap)
            }
            setPos({ top, left, maxHeight })
        }

        update()
        const scrollRoots = scrollableAncestors(triggerRef.current)
        scrollRoots.forEach(node => node.addEventListener('scroll', update, true))
        window.addEventListener('resize', update)
        window.addEventListener('scroll', update, true)
        return () => {
            scrollRoots.forEach(node => node.removeEventListener('scroll', update, true))
            window.removeEventListener('resize', update)
            window.removeEventListener('scroll', update, true)
        }
    }, [open])

    return pos
}

function JornadaHistorialRowActions({ jornada, observacion, tienePendiente, onVerRendiciones, onRendir, onOpenPdf, onDownloadExcel }) {
    const [open, setOpen] = useState(false)
    const triggerRef = useRef(null)
    const menuPos = useHistorialRowMenuPosition(open, triggerRef)
    const cant = Number(jornada.cantidad_rendiciones || 0)
    const puedeVer = cant > 0
    const puedeRendirFila = tienePendiente

    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
                <button ref={triggerRef} type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(v => !v)}>
                    Acciones ▾
                </button>
                {open && menuPos
                    ? createPortal(
                        <>
                            <div
                                style={{ position: 'fixed', inset: 0, zIndex: TABLE_ACTION_MENU_Z_BACKDROP }}
                                aria-hidden="true"
                                onClick={() => setOpen(false)}
                            />
                            <div
                                role="menu"
                                style={{
                                    position: 'fixed',
                                    top: menuPos.top,
                                    left: menuPos.left,
                                    minWidth: HISTORIAL_ROW_MENU_WIDTH,
                                    maxHeight: menuPos.maxHeight,
                                    overflowY: 'auto',
                                    background: 'var(--bg-card)',
                                    border: '1px solid var(--border)',
                                    borderRadius: 8,
                                    boxShadow: '0 8px 28px rgba(0,0,0,0.55)',
                                    padding: '6px 0',
                                    zIndex: TABLE_ACTION_MENU_Z_MENU,
                                }}
                            >
                                <div
                                    style={{
                                        padding: '8px 14px 10px',
                                        fontSize: '0.75rem',
                                        color: observacion.color,
                                        fontWeight: 700,
                                        lineHeight: 1.35,
                                        borderBottom: '1px solid var(--border)',
                                    }}
                                >
                                    {observacion.text}
                                </div>
                                <button
                                    type="button"
                                    className="dropdown-item"
                                    disabled={!puedeVer}
                                    onClick={() => {
                                        if (!puedeVer) return
                                        setOpen(false)
                                        onVerRendiciones(jornada)
                                    }}
                                >
                                    <Eye size={14} style={{ marginRight: 8, flexShrink: 0 }} /> Ver rendiciones
                                </button>
                                <button
                                    type="button"
                                    className="dropdown-item"
                                    onClick={() => {
                                        setOpen(false)
                                        onOpenPdf(jornada)
                                    }}
                                >
                                    <FileText size={14} style={{ marginRight: 8, flexShrink: 0 }} /> Informe PDF
                                </button>
                                <button
                                    type="button"
                                    className="dropdown-item"
                                    onClick={() => {
                                        setOpen(false)
                                        onDownloadExcel(jornada)
                                    }}
                                >
                                    <FileSpreadsheet size={14} style={{ marginRight: 8, flexShrink: 0 }} /> Informe Excel
                                </button>
                                <button
                                    type="button"
                                    className="dropdown-item"
                                    disabled={!puedeRendirFila}
                                    onClick={() => {
                                        if (!puedeRendirFila) return
                                        setOpen(false)
                                        onRendir(jornada)
                                    }}
                                >
                                    <HandCoins size={14} style={{ marginRight: 8, flexShrink: 0 }} /> Registrar rendición
                                </button>
                            </div>
                        </>,
                        getDropdownPortalTarget(),
                    )
                    : null}
            </div>
        </div>
    )
}

function RendicionHistorialRowActions({ rendicion, puedeEditar, onVer, onEditar }) {
    const [open, setOpen] = useState(false)
    const triggerRef = useRef(null)
    const menuPos = useHistorialRowMenuPosition(open, triggerRef)
    const puedeEditarFila = Boolean(puedeEditar && rendicion.estado === 'VIGENTE')

    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
                <button ref={triggerRef} type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(v => !v)}>
                    Acciones ▾
                </button>
                {open && menuPos
                    ? createPortal(
                        <>
                            <div
                                style={{ position: 'fixed', inset: 0, zIndex: TABLE_ACTION_MENU_Z_BACKDROP }}
                                aria-hidden="true"
                                onClick={() => setOpen(false)}
                            />
                            <div
                                role="menu"
                                style={{
                                    position: 'fixed',
                                    top: menuPos.top,
                                    left: menuPos.left,
                                    minWidth: HISTORIAL_ROW_MENU_WIDTH,
                                    maxHeight: menuPos.maxHeight,
                                    overflowY: 'auto',
                                    background: 'var(--bg-card)',
                                    border: '1px solid var(--border)',
                                    borderRadius: 8,
                                    boxShadow: '0 8px 28px rgba(0,0,0,0.55)',
                                    padding: '6px 0',
                                    zIndex: TABLE_ACTION_MENU_Z_MENU,
                                }}
                            >
                                <button
                                    type="button"
                                    className="dropdown-item"
                                    onClick={() => {
                                        setOpen(false)
                                        onVer()
                                    }}
                                >
                                    <Eye size={14} style={{ marginRight: 8, flexShrink: 0 }} /> Ver detalle
                                </button>
                                <button
                                    type="button"
                                    className="dropdown-item"
                                    disabled={!puedeEditarFila}
                                    onClick={() => {
                                        if (!puedeEditarFila) return
                                        setOpen(false)
                                        onEditar()
                                    }}
                                >
                                    <Pencil size={14} style={{ marginRight: 8, flexShrink: 0 }} /> Editar rendición
                                </button>
                            </div>
                        </>,
                        getDropdownPortalTarget(),
                    )
                    : null}
            </div>
        </div>
    )
}

function EstadoCard({ label, value, color = 'var(--text-primary)' }) {
    return (
        <div className="card" style={{ marginBottom: 0 }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
            <div style={{ fontSize: '1.12rem', fontWeight: 800, color }}>{value}</div>
        </div>
    )
}

function DesgloseMedios({ items = [], title = 'Desglose por medio', emptyText = 'Todavía no hay movimientos para desglosar.' }) {
    if (!items.length) {
        return (
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.45 }}>
                {emptyText}
            </div>
        )
    }

    return (
        <div>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>{title}</div>
            <div className="table-wrapper" style={{ overflow: 'auto' }}>
                <table className="table">
                    <thead>
                        <tr>
                            <th>Medio</th>
                            <th>Ingresos</th>
                            <th>Egresos</th>
                            <th>Neto</th>
                            <th>Mov.</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map(item => (
                            <tr key={item.medio}>
                                <td>{item.medio}</td>
                                <td style={{ color: 'var(--success)', fontWeight: 700 }}>{fmtGs(item.ingresos)}</td>
                                <td style={{ color: 'var(--danger)', fontWeight: 700 }}>{fmtGs(item.egresos)}</td>
                                <td style={{ color: (item.neto || 0) < 0 ? 'var(--danger)' : 'var(--primary-light)', fontWeight: 700 }}>
                                    {fmtGs(item.neto)}
                                </td>
                                <td>{item.cantidad_movimientos}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

function ExportActions({ kind, id }) {
    const [busy, setBusy] = useState('')

    const openPdf = async () => {
        try {
            setBusy('pdf')
            await requestAndOpenPdf(
                () => api.get(`/caja/jornada/${kind}/${id}/pdf`, { responseType: 'blob' }),
                `${kind}_${id}.pdf`,
            )
        } finally {
            setBusy('')
        }
    }

    const downloadExcel = async () => {
        try {
            setBusy('excel')
            await requestAndDownloadFile(
                () => api.get(`/caja/jornada/${kind}/${id}/excel`, { responseType: 'blob' }),
                `${kind}_${id}.xlsx`,
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            )
        } finally {
            setBusy('')
        }
    }

    return (
        <div className="flex gap-8" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={openPdf} disabled={busy !== ''}>
                <FileText size={14} /> {busy === 'pdf' ? 'Generando PDF...' : 'PDF'}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={downloadExcel} disabled={busy !== ''}>
                <FileSpreadsheet size={14} /> {busy === 'excel' ? 'Generando Excel...' : 'Excel'}
            </button>
        </div>
    )
}

function MovimientosPosterioresModal({ onClose }) {
    const { data, isLoading, isError, error } = useMovimientosPosterioresUltimoCorte()

    return (
        <Modal title="Movimientos posteriores al último corte" onClose={onClose} maxWidth="980px">
            {isLoading && (
                <div className="flex-center" style={{ padding: 40 }}>
                    <div className="spinner" style={{ width: 28, height: 28 }} />
                </div>
            )}

            {isError && (
                <div className="empty-state" style={{ padding: '36px 16px' }}>
                    <AlertTriangle size={36} />
                    <p>{error?.response?.data?.detail || 'No se pudieron cargar los movimientos posteriores al último corte.'}</p>
                </div>
            )}

            {!isLoading && !isError && data && (
                <div style={{ display: 'grid', gap: 16 }}>
                    <div className="card" style={{ marginBottom: 0, padding: '14px 16px' }}>
                        <div style={{ display: 'grid', gap: 6, fontSize: '0.86rem' }}>
                            <div>Último corte anterior: <strong>{fmtDateTime(data.fecha_ultimo_corte)}</strong></div>
                            <div>Emitido por: <strong>{data.usuario_ultimo_corte_nombre || '—'}</strong></div>
                            <div>Movimientos detectados: <strong>{data.cantidad_movimientos}</strong></div>
                            <div>Ingresos posteriores: <strong style={{ color: 'var(--success)' }}>{fmtGs(data.ingresos)}</strong></div>
                            <div>Egresos posteriores: <strong style={{ color: 'var(--danger)' }}>{fmtGs(data.egresos)}</strong></div>
                        </div>
                    </div>

                    <div className="table-wrapper" style={{ maxHeight: '60vh', overflow: 'auto' }}>
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Fecha</th>
                                    <th>Origen</th>
                                    <th>Categoría</th>
                                    <th>Concepto</th>
                                    <th>Referencia</th>
                                    <th>Monto</th>
                                    <th>Acceso</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.movimientos.map((movimiento, index) => (
                                    <tr key={`${movimiento.referencia}-${index}`}>
                                        <td>{fmtDateTime(movimiento.fecha)}</td>
                                        <td>{movimiento.origen}</td>
                                        <td>{movimiento.categoria}</td>
                                        <td style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{movimiento.concepto || '—'}</td>
                                        <td>{movimiento.referencia}</td>
                                        <td style={{ color: movimiento.tipo?.includes('INGRESO') || movimiento.tipo?.includes('(+)') ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
                                            {fmtGs(movimiento.monto)}
                                        </td>
                                        <td>
                                            {movimiento.ruta_origen ? (
                                                <a href={movimiento.ruta_origen} className="btn btn-secondary btn-sm">
                                                    <Eye size={14} /> Abrir
                                                </a>
                                            ) : null}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </Modal>
    )
}

function RendirModalInner({ pendiente, crearRendicion, onClose, titulo = 'Registrar rendición' }) {
    const montoInicial = String(pendiente?.monto_sugerido ?? 0)
    const { data: destinatariosRaw = [], isLoading: loadingDest } = useDestinatariosRendicionCatalog()
    const destinatariosActivos = useMemo(
        () => (destinatariosRaw || []).filter(d => d.activo),
        [destinatariosRaw],
    )
    const [destinatarioId, setDestinatarioId] = useState('')
    const [montoRendido, setMontoRendido] = useState(montoInicial)
    const [observacion, setObservacion] = useState('')

    // Sincroniza el monto cuando el pendiente llega de forma async
    const montoSugerido = Number(pendiente?.monto_sugerido || 0)
    const montoActual = Number(montoRendido || 0)
    const requiereObservacion = Math.abs(montoActual - montoSugerido) > 0.009

    const handleSubmit = event => {
        event.preventDefault()
        const idNum = Number(destinatarioId)
        if (!idNum) return
        crearRendicion.mutate(
            {
                destinatario_id: idNum,
                monto_rendido: montoActual,
                observacion: observacion.trim() || null,
            },
            {
                onSuccess: () => onClose?.(),
            },
        )
    }

    return (
        <Modal title={titulo} onClose={onClose} maxWidth="620px">
            <form onSubmit={handleSubmit}>
                <div className="card mb-16" style={{ padding: '14px 16px', marginBottom: 16 }}>
                    <div style={{ display: 'grid', gap: 8, fontSize: '0.86rem' }}>
                        <div>Monto sugerido por el sistema: <strong style={{ color: 'var(--primary-light)' }}>{fmtGs(montoSugerido)}</strong></div>
                        <div>Movimientos pendientes: <strong>{pendiente?.cantidad_movimientos || 0}</strong></div>
                        <div>Ingresos pendientes: <strong style={{ color: 'var(--success)' }}>{fmtGs(pendiente?.ingresos || 0)}</strong></div>
                        <div>Egresos pendientes: <strong style={{ color: 'var(--danger)' }}>{fmtGs(pendiente?.egresos || 0)}</strong></div>
                    </div>
                    <div style={{ marginTop: 14 }}>
                        <DesgloseMedios
                            items={pendiente?.desglose_medios || []}
                            title="Monto sugerido por medio"
                            emptyText="Todavía no hay movimientos pendientes para desglosar."
                        />
                    </div>
                </div>

                <div className="form-group">
                    <label className="form-label">Rendido a *</label>
                    <select
                        className="form-input"
                        value={destinatarioId}
                        onChange={event => setDestinatarioId(event.target.value)}
                        required
                        disabled={loadingDest}
                    >
                        <option value="">{loadingDest ? 'Cargando destinatarios...' : 'Seleccionar destinatario...'}</option>
                        {destinatariosActivos.map(d => (
                            <option key={d.id} value={String(d.id)}>{d.nombre}</option>
                        ))}
                    </select>
                    {!loadingDest && destinatariosActivos.length === 0 ? (
                        <div style={{ fontSize: '0.78rem', color: 'var(--warning)', marginTop: 8 }}>
                            No hay destinatarios activos. Un administrador debe cargarlos en «Catálogos / Destinatarios rendición».
                        </div>
                    ) : null}
                </div>

                <div className="form-group">
                    <label className="form-label">Monto rendido *</label>
                    <input className="form-input" type="number" step="100" value={montoRendido} onChange={event => setMontoRendido(event.target.value)} required />
                </div>

                <div className="form-group">
                    <label className="form-label">Observación{requiereObservacion ? ' *' : ''}</label>
                    <textarea
                        className="form-input"
                        rows={4}
                        value={observacion}
                        onChange={event => setObservacion(event.target.value)}
                        required={requiereObservacion}
                        placeholder={requiereObservacion ? 'Debes explicar por qué el monto rendido difiere del sugerido.' : 'Opcional'}
                        style={{ resize: 'vertical' }}
                    />
                </div>

                {crearRendicion.isError && (
                    <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#f87171' }}>
                        {crearRendicion.error?.response?.data?.detail || 'No se pudo registrar la rendición.'}
                    </div>
                )}

                <div className="flex gap-12" style={{ justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-secondary" onClick={onClose} disabled={crearRendicion.isPending}>Cancelar</button>
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={crearRendicion.isPending || !destinatarioId || destinatariosActivos.length === 0}
                    >
                        {crearRendicion.isPending ? 'Registrando rendición...' : 'Rendir'}
                    </button>
                </div>
            </form>
        </Modal>
    )
}

function RendirModal({ pendiente, onClose }) {
    const crearRendicion = useCrearRendicionJornada()
    return <RendirModalInner pendiente={pendiente} crearRendicion={crearRendicion} onClose={onClose} />
}

function RendirModalHistorial({ jornadaId, jornadaFecha, onClose }) {
    const crearRendicion = useCrearRendicionJornadaHistorial(jornadaId)
    const { data: pendiente, isLoading } = usePendienteRendicionHistorial(jornadaId)

    if (isLoading || !pendiente) {
        return (
            <Modal title={`Rendir jornada ${jornadaFecha}`} onClose={onClose} maxWidth="620px">
                <div className="flex-center" style={{ padding: 40 }}>
                    <div className="spinner" style={{ width: 28, height: 28 }} />
                </div>
            </Modal>
        )
    }

    return (
        <RendirModalInner
            pendiente={pendiente}
            crearRendicion={crearRendicion}
            onClose={onClose}
            titulo={`Rendir jornada ${jornadaFecha}`}
        />
    )
}

function VerRendicionModal({ rendicionId, onClose, puedeEditar, onEditar }) {
    const { data: rendicion, isLoading, isError, error } = useRendicionDetalle(rendicionId)

    if (!rendicionId) return null

    if (isLoading) {
        return (
            <Modal title="Detalle de rendicion" onClose={onClose} maxWidth="780px">
                <div className="flex-center" style={{ padding: 40 }}>
                    <div className="spinner" style={{ width: 28, height: 28 }} />
                </div>
            </Modal>
        )
    }

    if (isError || !rendicion) {
        return (
            <Modal title="Detalle de rendicion" onClose={onClose} maxWidth="780px">
                <div style={{ color: '#f87171', fontSize: '0.9rem', lineHeight: 1.5 }}>
                    {error?.response?.data?.detail || 'No se pudo cargar el detalle de la rendicion.'}
                </div>
            </Modal>
        )
    }

    const diferencia = Number(rendicion.diferencia || 0)
    const fueEditada = Boolean(rendicion.editada)

    return (
        <Modal title="Detalle de rendicion" onClose={onClose} maxWidth="780px">
            <div style={{ display: 'grid', gap: 16 }}>
                <div className="card" style={{ marginBottom: 0, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                        <div style={{ display: 'grid', gap: 8, fontSize: '0.86rem' }}>
                            <div>Fecha y hora: <strong>{fmtDateTime(rendicion.fecha_hora_rendicion)}</strong></div>
                            {rendicion.jornada_fecha ? <div>Jornada: <strong>{rendicion.jornada_fecha}</strong></div> : null}
                            <div>Rendido a: <strong>{rendicion.rendido_a || '—'}</strong></div>
                            <div>Usuario: <strong>{rendicion.usuario_nombre || '—'}</strong></div>
                            <div>Estado: <strong>{rendicion.estado || '—'}</strong></div>
                        </div>
                        <div style={{ minWidth: 220 }}>
                            <ExportActions kind="rendiciones" id={rendicion.id} />
                        </div>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                    <EstadoCard label="Monto Sugerido" value={fmtGs(rendicion.monto_sugerido)} color="var(--primary-light)" />
                    <EstadoCard label="Monto Rendido" value={fmtGs(rendicion.monto_rendido)} color="var(--info)" />
                    <EstadoCard label="Diferencia" value={fmtGs(rendicion.diferencia)} color={Math.abs(diferencia) > 0.009 ? 'var(--danger)' : 'var(--success)'} />
                </div>

                <div className="card" style={{ marginBottom: 0 }}>
                    <div style={{ fontWeight: 700, marginBottom: 12 }}>Detalle operativo</div>
                    <div style={{ display: 'grid', gap: 10, fontSize: '0.85rem' }}>
                        <div>Movimientos incluidos: <strong>{rendicion.movimientos_total || 0}</strong></div>
                        <div>Observacion: <strong>{rendicion.observacion || 'Sin observacion'}</strong></div>
                        {fueEditada ? (
                            <>
                                <div style={{ color: 'var(--warning)' }}>Esta rendicion fue ajustada posteriormente.</div>
                                <div>Motivo del ajuste: <strong>{rendicion.motivo_ajuste || 'Sin motivo registrado'}</strong></div>
                                <div>Ultima edicion: <strong>{fmtDateTime(rendicion.fecha_hora_ultima_edicion)}</strong></div>
                                <div>Editada por: <strong>{rendicion.usuario_ultima_edicion_nombre || '—'}</strong></div>
                            </>
                        ) : (
                            <div>Sin ajustes posteriores registrados.</div>
                        )}
                    </div>
                </div>

                <div className="card" style={{ marginBottom: 0 }}>
                    <DesgloseMedios
                        items={rendicion.desglose_medios || []}
                        title="Rendido por medio"
                        emptyText="Esta rendicion no tiene un desglose por medio disponible."
                    />
                </div>

                <div className="flex gap-12" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    {puedeEditar && rendicion.estado === 'VIGENTE' ? (
                        <button type="button" className="btn btn-secondary" onClick={() => onEditar?.(rendicion)}>
                            <Pencil size={16} /> Editar rendicion
                        </button>
                    ) : null}
                    <button type="button" className="btn btn-primary" onClick={onClose}>
                        Cerrar
                    </button>
                </div>
            </div>
        </Modal>
    )
}

function RendicionesJornadaModal({ jornada, rendiciones = [], isLoading = false, onClose, onVerRendicion }) {
    return (
        <Modal title={`Rendiciones de la jornada ${jornada?.fecha || ''}`} onClose={onClose} maxWidth="980px">
            {isLoading ? (
                <div className="flex-center" style={{ padding: 40 }}>
                    <div className="spinner" style={{ width: 28, height: 28 }} />
                </div>
            ) : rendiciones.length === 0 ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                    No hay rendiciones registradas para esta jornada.
                </div>
            ) : (
                <div className="table-wrapper" style={{ overflow: 'auto' }}>
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Fecha/Hora</th>
                                <th>Rendido a</th>
                                <th>Usuario</th>
                                <th>Sugerido</th>
                                <th>Rendido</th>
                                <th>Diferencia</th>
                                <th>Estado</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rendiciones.map(rendicion => (
                                <tr key={`${rendicion.jornada_fecha}-${rendicion.id}`}>
                                    <td>{fmtDateTime(rendicion.fecha_hora_rendicion)}</td>
                                    <td>{rendicion.rendido_a}</td>
                                    <td>{rendicion.usuario_nombre || '—'}</td>
                                    <td>{fmtGs(rendicion.monto_sugerido)}</td>
                                    <td style={{ color: 'var(--info)', fontWeight: 700 }}>{fmtGs(rendicion.monto_rendido)}</td>
                                    <td style={{ color: Math.abs(rendicion.diferencia || 0) > 0.009 ? 'var(--danger)' : 'var(--success)', fontWeight: 700 }}>
                                        {fmtGs(rendicion.diferencia)}
                                    </td>
                                    <td>{rendicion.estado}</td>
                                    <td>
                                        <button
                                            type="button"
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => onVerRendicion(rendicion)}
                                        >
                                            <Eye size={14} /> Ver detalle
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Modal>
    )
}

function DestinatariosRendicionAdminModal({ onClose }) {
    const { data: lista = [], isLoading } = useDestinatariosRendicionCatalog()
    const crear = useCrearDestinatarioRendicion()
    const actualizar = useActualizarDestinatarioRendicion()
    const eliminar = useEliminarDestinatarioRendicion()
    const [nuevoNombre, setNuevoNombre] = useState('')
    const [editandoId, setEditandoId] = useState(null)
    const [textoEdicion, setTextoEdicion] = useState('')

    const handleCrear = event => {
        event.preventDefault()
        const n = nuevoNombre.trim()
        if (!n) return
        crear.mutate(
            { nombre: n },
            {
                onSuccess: () => {
                    setNuevoNombre('')
                },
            },
        )
    }

    const guardarNombre = row => {
        const t = textoEdicion.trim()
        if (!t) return
        actualizar.mutate(
            { id: row.id, payload: { nombre: t } },
            {
                onSuccess: () => {
                    setEditandoId(null)
                    setTextoEdicion('')
                },
            },
        )
    }

    return (
        <Modal title="Destinatarios de rendición" onClose={onClose} maxWidth="720px">
            <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.45 }}>
                Personas autorizadas a recibir efectivo rendido desde caja. Solo los destinatarios activos aparecen al registrar una rendición nueva.
                Aquí puedes hacer ABM: alta, renombrar, activar/desactivar y eliminar (si no tiene rendiciones asociadas).
            </p>
            <form onSubmit={handleCrear} className="flex gap-10" style={{ flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 20 }}>
                <div className="form-group" style={{ flex: '1 1 240px', marginBottom: 0 }}>
                    <label className="form-label">Nuevo destinatario</label>
                    <input
                        className="form-input"
                        value={nuevoNombre}
                        onChange={event => setNuevoNombre(event.target.value)}
                        placeholder="Nombre completo"
                        maxLength={150}
                    />
                </div>
                <button type="submit" className="btn btn-primary" disabled={crear.isPending || !nuevoNombre.trim()}>
                    {crear.isPending ? 'Guardando...' : 'Agregar'}
                </button>
            </form>
            {crear.isError ? (
                <div style={{ color: '#f87171', fontSize: '0.82rem', marginBottom: 12 }}>
                    {crear.error?.response?.data?.detail || 'No se pudo crear el destinatario.'}
                </div>
            ) : null}
            {isLoading ? (
                <div className="flex-center" style={{ padding: 32 }}>
                    <div className="spinner" style={{ width: 28, height: 28 }} />
                </div>
            ) : (
                <div className="table-wrapper" style={{ overflow: 'auto', maxHeight: '50vh' }}>
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Nombre</th>
                                <th>Estado</th>
                                <th style={{ width: 200 }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {lista.map(row => (
                                <tr key={row.id}>
                                    <td>
                                        {editandoId === row.id ? (
                                            <input
                                                className="form-input"
                                                value={textoEdicion}
                                                onChange={event => setTextoEdicion(event.target.value)}
                                                style={{ marginBottom: 0 }}
                                            />
                                        ) : (
                                            row.nombre
                                        )}
                                    </td>
                                    <td>
                                        <span style={{ color: row.activo ? 'var(--success)' : 'var(--text-muted)', fontWeight: 600 }}>
                                            {row.activo ? 'Activo' : 'Inactivo'}
                                        </span>
                                    </td>
                                    <td>
                                        <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
                                            {editandoId === row.id ? (
                                                <>
                                                    <button
                                                        type="button"
                                                        className="btn btn-primary btn-sm"
                                                        disabled={actualizar.isPending}
                                                        onClick={() => guardarNombre(row)}
                                                    >
                                                        Guardar
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn btn-secondary btn-sm"
                                                        onClick={() => {
                                                            setEditandoId(null)
                                                            setTextoEdicion('')
                                                        }}
                                                    >
                                                        Cancelar
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <button
                                                        type="button"
                                                        className="btn btn-secondary btn-sm"
                                                        onClick={() => {
                                                            setEditandoId(row.id)
                                                            setTextoEdicion(row.nombre)
                                                        }}
                                                    >
                                                        Renombrar
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn btn-secondary btn-sm"
                                                        disabled={actualizar.isPending || eliminar.isPending}
                                                        onClick={() => actualizar.mutate({ id: row.id, payload: { activo: !row.activo } })}
                                                    >
                                                        {row.activo ? 'Desactivar' : 'Reactivar'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn btn-secondary btn-sm"
                                                        disabled={eliminar.isPending}
                                                        onClick={() => {
                                                            if (!window.confirm(`¿Eliminar destinatario "${row.nombre}"?`)) return
                                                            eliminar.mutate(row.id)
                                                        }}
                                                    >
                                                        Eliminar
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {lista.length === 0 ? (
                        <div style={{ padding: 16, fontSize: '0.84rem', color: 'var(--text-muted)' }}>Todavía no hay destinatarios cargados.</div>
                    ) : null}
                </div>
            )}
            {actualizar.isError ? (
                <div style={{ color: '#f87171', fontSize: '0.82rem', marginTop: 12 }}>
                    {actualizar.error?.response?.data?.detail || 'No se pudo actualizar.'}
                </div>
            ) : null}
            {eliminar.isError ? (
                <div style={{ color: '#f87171', fontSize: '0.82rem', marginTop: 12 }}>
                    {eliminar.error?.response?.data?.detail || 'No se pudo eliminar.'}
                </div>
            ) : null}
            <div className="flex gap-12" style={{ justifyContent: 'flex-end', marginTop: 20 }}>
                <button type="button" className="btn btn-primary" onClick={onClose}>Cerrar</button>
            </div>
        </Modal>
    )
}

export default function JornadaRendicionesPage() {
    const { user } = useAuth()
    const [showPosterioresModal, setShowPosterioresModal] = useState(false)
    const [showRendirModal, setShowRendirModal] = useState(false)
    const [rendicionDetalleId, setRendicionDetalleId] = useState(null)
    const [rendicionEdicion, setRendicionEdicion] = useState(null)
    const [busquedaRendiciones, setBusquedaRendiciones] = useState('')
    const [filtroEstadoRendicion, setFiltroEstadoRendicion] = useState('')
    const [filtroJornadaRendicion, setFiltroJornadaRendicion] = useState('')
    const [filtroRendidoARendicion, setFiltroRendidoARendicion] = useState('')
    const [filtroUsuarioRendicion, setFiltroUsuarioRendicion] = useState('')
    const [fechaDesdeRendicion, setFechaDesdeRendicion] = useState(toDateInputValue(getInicioMesActual()))
    const [fechaHastaRendicion, setFechaHastaRendicion] = useState(toDateInputValue(new Date()))
    const [paginaRendiciones, setPaginaRendiciones] = useState(1)
    const [pageSizeRendiciones, setPageSizeRendiciones] = useState(25)
    const [historialTab, setHistorialTab] = useState('jornadas')
    const [jornadaHistorialSeleccionada, setJornadaHistorialSeleccionada] = useState(null)
    const [jornadaVerRendiciones, setJornadaVerRendiciones] = useState(null)

    const jornadaLoadT0 = useRef(null)
    const [jornadaLoadMs, setJornadaLoadMs] = useState({})
    const [showJornadaLoadBench, setShowJornadaLoadBench] = useState(
        ENABLE_JORNADA_BENCH ? readJornadaBenchFlagFromEnv : false,
    )
    useLayoutEffect(() => {
        if (!ENABLE_JORNADA_BENCH) return
        jornadaLoadT0.current = performance.now()
        if (typeof window === 'undefined') return
        if (new URLSearchParams(window.location.search).get('jornadaBench') === '1') {
            try {
                window.sessionStorage.setItem(JORNADA_BENCH_STORAGE, '1')
                window.localStorage.setItem(JORNADA_BENCH_STORAGE, '1')
            } catch {
                /* ignore */
            }
            setShowJornadaLoadBench(true)
        }
    }, [])

    const estadoActualQuery = useFinancialJornadaStatus()
    const cortesQuery = useCortesJornadaActual()
    const rendicionesQuery = useRendicionesJornadaActual()
    const pendienteQuery = usePendienteRendicion()
    const historialJornadasQuery = useHistorialJornadas(20, { enabled: historialTab === 'jornadas' })

    useMarkJornadaBenchRow(
        showJornadaLoadBench,
        jornadaLoadT0,
        'GET /caja/jornada/estado-actual',
        estadoActualQuery.isSuccess,
        estadoActualQuery.dataUpdatedAt,
        setJornadaLoadMs,
    )
    useMarkJornadaBenchRow(
        showJornadaLoadBench,
        jornadaLoadT0,
        'GET /caja/jornada/cortes',
        cortesQuery.isSuccess,
        cortesQuery.dataUpdatedAt,
        setJornadaLoadMs,
    )
    useMarkJornadaBenchRow(
        showJornadaLoadBench,
        jornadaLoadT0,
        'GET /caja/jornada/rendiciones',
        rendicionesQuery.isSuccess,
        rendicionesQuery.dataUpdatedAt,
        setJornadaLoadMs,
    )
    useMarkJornadaBenchRow(
        showJornadaLoadBench,
        jornadaLoadT0,
        'GET /caja/jornada/pendiente-rendir',
        pendienteQuery.isSuccess,
        pendienteQuery.dataUpdatedAt,
        setJornadaLoadMs,
    )
    useMarkJornadaBenchRow(
        showJornadaLoadBench,
        jornadaLoadT0,
        'GET /caja/jornada/historial/jornadas?limit=20',
        historialJornadasQuery.isSuccess,
        historialJornadasQuery.dataUpdatedAt,
        setJornadaLoadMs,
    )

    const { data, isLoading, isError, error } = estadoActualQuery
    const { data: cortes = [], isLoading: isLoadingCortes } = cortesQuery
    const { data: rendiciones = [], isLoading: isLoadingRendiciones } = rendicionesQuery
    const { data: pendiente } = pendienteQuery
    const {
        data: historialJornadas = [],
        isLoading: isLoadingHistorialJornadas,
        isError: isErrorHistorialJornadas,
        error: errorHistorialJornadas,
    } = historialJornadasQuery
    const busquedaRendicionesDiferida = useDeferredValue(busquedaRendiciones)
    const historialRendicionesParams = useMemo(() => ({
        page: paginaRendiciones,
        page_size: pageSizeRendiciones,
        search: busquedaRendicionesDiferida,
        estado: filtroEstadoRendicion,
        jornada_fecha: filtroJornadaRendicion,
        destinatario_id: filtroRendidoARendicion ? Number(filtroRendidoARendicion) : undefined,
        usuario_id: filtroUsuarioRendicion ? Number(filtroUsuarioRendicion) : undefined,
        fecha_desde: fechaDesdeRendicion,
        fecha_hasta: fechaHastaRendicion,
    }), [
        paginaRendiciones,
        pageSizeRendiciones,
        busquedaRendicionesDiferida,
        filtroEstadoRendicion,
        filtroJornadaRendicion,
        filtroRendidoARendicion,
        filtroUsuarioRendicion,
        fechaDesdeRendicion,
        fechaHastaRendicion,
    ])
    const {
        data: historialRendicionesData,
        isLoading: isLoadingHistorialRendiciones,
        isError: isErrorHistorialRendiciones,
        error: errorHistorialRendiciones,
    } = useHistorialRendiciones(historialRendicionesParams, { enabled: historialTab === 'rendiciones' })
    const { data: filtrosOpciones } = useOpcionesFiltrosRendiciones({ enabled: historialTab === 'rendiciones' })
    const opcionesDestinatarios = filtrosOpciones?.destinatarios || []
    const opcionesUsuarioFiltro = filtrosOpciones?.usuarios || []
    const historialRendiciones = historialRendicionesData?.items || []
    const totalHistorialRendiciones = historialRendicionesData?.total || 0
    const totalPagesHistorialRendiciones = historialRendicionesData?.total_pages || 1
    const {
        data: rendicionesJornadaData,
        isLoading: isLoadingRendicionesJornadaModal,
    } = useHistorialRendiciones(
        {
            page: 1,
            page_size: 100,
            jornada_fecha: jornadaVerRendiciones?.fecha,
        },
        { enabled: !!jornadaVerRendiciones?.fecha },
    )
    const crearCorte = useCrearCorteJornada()
    const puedeCortar = hasActionAccess(user, 'finanzas.jornada_corte', 'finanzas')
    const puedeRendir = hasActionAccess(user, 'finanzas.jornada_rendir', 'finanzas')
    const puedeEditarRendicion = hasActionAccess(user, 'finanzas.jornada_rendicion_editar', 'finanzas')

    const jornadaBenchRows = useMemo(() => {
        if (!showJornadaLoadBench) return []
        return Object.entries(jornadaLoadMs).sort((a, b) => (a[1] ?? 0) - (b[1] ?? 0))
    }, [showJornadaLoadBench, jornadaLoadMs])
    const jornadaBenchMaxMs = useMemo(() => {
        const vals = Object.values(jornadaLoadMs).filter(v => typeof v === 'number')
        return vals.length ? Math.max(...vals) : null
    }, [jornadaLoadMs])

    const resumen = data?.resumen || {
        ingresos: 0,
        egresos: 0,
        neto: 0,
        movimientos_total: 0,
        movimientos_caja: 0,
        movimientos_banco: 0,
    }

    const opcionesEstadoRendicion = useMemo(
        () => Array.from(new Set(['VIGENTE', ...historialRendiciones.map(item => item.estado).filter(Boolean)])).sort(),
        [historialRendiciones],
    )
    const totalRendido = useMemo(
        () => rendiciones.filter(item => item.estado === 'VIGENTE').reduce((acc, item) => acc + (item.monto_rendido || 0), 0),
        [rendiciones],
    )
    const ultimoCorte = useMemo(() => cortes.find(item => item.es_ultimo) || data?.ultimo_corte || null, [cortes, data])
    const ultimaRendicion = useMemo(() => rendiciones.find(item => item.es_ultima_vigente) || data?.ultima_rendicion || null, [rendiciones, data])
    const cuentasPorCobrar = data?.cuentas_por_cobrar_dia || {
        total_pendiente: 0,
        cantidad_ventas: 0,
        total_ventas: 0,
        total_cobrado: 0,
    }
    const historialRendicionesFiltradas = historialRendiciones
    const rendicionesDeJornadaSeleccionada = rendicionesJornadaData?.items || []

    const handleCrearCorte = () => {
        crearCorte.mutate()
    }

    const abrirInformeJornadaPdf = jornada =>
        requestAndOpenPdf(
            () => api.get(`/caja/jornada/historial/jornadas/${jornada.jornada_id}/pdf`, { responseType: 'blob' }),
            `informe_jornada_${jornada.fecha}.pdf`,
        )

    const descargarInformeJornadaExcel = jornada =>
        requestAndDownloadFile(
            () => api.get(`/caja/jornada/historial/jornadas/${jornada.jornada_id}/excel`, { responseType: 'blob' }),
            `informe_jornada_${jornada.fecha}.xlsx`,
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )

    const limpiarFiltrosRendiciones = () => {
        setBusquedaRendiciones('')
        setFiltroEstadoRendicion('')
        setFiltroJornadaRendicion('')
        setFiltroRendidoARendicion('')
        setFiltroUsuarioRendicion('')
        setFechaDesdeRendicion(toDateInputValue(getInicioMesActual()))
        setFechaHastaRendicion(toDateInputValue(new Date()))
        setPaginaRendiciones(1)
    }

    if (isLoading) {
        return (
            <div className="page-body">
                <div className="flex-center" style={{ padding: 60 }}>
                    <div className="spinner" style={{ width: 32, height: 32 }} />
                </div>
            </div>
        )
    }

    if (isError) {
        return (
            <div className="page-body">
                <div className="card">
                    <div className="empty-state" style={{ padding: '60px 20px' }}>
                        <CalendarClock size={40} />
                        <p>{formatApiError(error, 'No se pudo cargar la jornada financiera.')}</p>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="page-body">
            <div className="flex-between mb-24" style={{ alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 44, height: 44, background: 'rgba(168,85,247,0.15)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <CalendarClock size={22} style={{ color: '#c084fc' }} />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Jornada y rendiciones</h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                            Apertura diaria, cortes informativos y rendiciones parciales del día.
                        </p>
                    </div>
                </div>

                <div className="flex gap-10" style={{ flexWrap: 'wrap' }}>
                    {data?.abierta && puedeCortar && (
                        <button type="button" className="btn btn-secondary" onClick={handleCrearCorte} disabled={crearCorte.isPending}>
                            <ClipboardList size={16} /> {crearCorte.isPending ? 'Registrando corte...' : 'Sacar informe de corte'}
                        </button>
                    )}
                    {data?.abierta && puedeRendir && (
                        <button type="button" className="btn btn-primary" onClick={() => setShowRendirModal(true)}>
                            <HandCoins size={16} /> Rendir
                        </button>
                    )}
                </div>
            </div>

            {!data?.abierta && (
                <FinancialJornadaNotice
                    title="Hoy todavía no hay una jornada financiera abierta."
                    message="Desde aquí puedes abrir la jornada del día. Mientras siga cerrada, los cobros, gastos, pagos, transferencias y ajustes quedarán bloqueados."
                />
            )}

            {data?.alerta_movimientos_posteriores && (
                <div
                    className="card"
                    style={{
                        marginBottom: 16,
                        borderColor: 'rgba(245, 158, 11, 0.3)',
                        background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(249, 115, 22, 0.08))',
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', gap: 12 }}>
                            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(245,158,11,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <AlertTriangle size={18} style={{ color: '#f59e0b' }} />
                            </div>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 700, marginBottom: 4 }}>Se detectaron movimientos después del último corte del día anterior.</div>
                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', lineHeight: 1.45 }}>
                                    Último corte: <strong>{fmtDateTime(data.alerta_movimientos_posteriores.fecha_ultimo_corte)}</strong>
                                    {' · '}
                                    movimientos posteriores: <strong>{data.alerta_movimientos_posteriores.cantidad_movimientos}</strong>
                                </div>
                                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10, color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                                    <span>Ingresos: {fmtGs(data.alerta_movimientos_posteriores.ingresos)}</span>
                                    <span>Egresos: {fmtGs(data.alerta_movimientos_posteriores.egresos)}</span>
                                </div>
                            </div>
                        </div>

                        <button type="button" className="btn btn-secondary" onClick={() => setShowPosterioresModal(true)}>
                            <Eye size={16} /> Ver movimientos
                        </button>
                    </div>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 16 }}>
                <EstadoCard label="Estado" value={data?.estado || 'SIN_ABRIR'} color={data?.abierta ? 'var(--success)' : 'var(--warning)'} />
                <EstadoCard label="Neto del día" value={fmtGs(resumen.neto)} color={resumen.neto >= 0 ? 'var(--primary-light)' : 'var(--danger)'} />
                <EstadoCard label="Total rendido" value={fmtGs(totalRendido)} color="var(--info)" />
                <EstadoCard label="Pendiente de rendir" value={fmtGs(pendiente?.monto_sugerido || 0)} color="var(--warning)" />
                <EstadoCard label="A cobrar hoy" value={fmtGs(cuentasPorCobrar.total_pendiente || 0)} color={(cuentasPorCobrar.total_pendiente || 0) > 0 ? '#f59e0b' : 'var(--success)'} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16 }}>
                <div style={{ display: 'grid', gap: 16 }}>
                    <div className="card" style={{ marginBottom: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                            <Wallet size={18} style={{ color: 'var(--primary-light)' }} />
                            <div style={{ fontWeight: 700 }}>Jornada de hoy</div>
                        </div>
                        <div style={{ display: 'grid', gap: 10, fontSize: '0.86rem' }}>
                            <div>Fecha: <strong>{data?.fecha || '—'}</strong></div>
                            <div>Hora de apertura: <strong>{fmtDateTime(data?.fecha_hora_apertura)}</strong></div>
                            <div>Abierta por: <strong>{data?.usuario_apertura_nombre || '—'}</strong></div>
                            <div>Observación: <strong>{data?.observacion_apertura || 'Sin observación'}</strong></div>
                            <div>Ingresos hoy: <strong style={{ color: 'var(--success)' }}>{fmtGs(resumen.ingresos)}</strong></div>
                            <div>Egresos hoy: <strong style={{ color: 'var(--danger)' }}>{fmtGs(resumen.egresos)}</strong></div>
                            <div>Último corte: <strong>{ultimoCorte ? fmtDateTime(ultimoCorte.fecha_hora_corte) : null}</strong></div>
                            <div>Última rendición: <strong>{ultimaRendicion ? fmtDateTime(ultimaRendicion.fecha_hora_rendicion) : null}</strong></div>
                        </div>
                    </div>

                    <div className="card" style={{ marginBottom: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                            <HandCoins size={18} style={{ color: '#f59e0b' }} />
                            <div style={{ fontWeight: 700 }}>Pendiente de rendir</div>
                        </div>
                        <div style={{ display: 'grid', gap: 8, fontSize: '0.86rem' }}>
                            <div>Monto sugerido: <strong style={{ color: 'var(--primary-light)' }}>{fmtGs(pendiente?.monto_sugerido || 0)}</strong></div>
                            <div>Movimientos pendientes: <strong>{pendiente?.cantidad_movimientos || 0}</strong></div>
                            <div>Ingresos pendientes: <strong style={{ color: 'var(--success)' }}>{fmtGs(pendiente?.ingresos || 0)}</strong></div>
                            <div>Egresos pendientes: <strong style={{ color: 'var(--danger)' }}>{fmtGs(pendiente?.egresos || 0)}</strong></div>
                            <div>Desde: <strong>{pendiente?.fecha_desde ? fmtDateTime(pendiente.fecha_desde) : null}</strong></div>
                        </div>
                        <div style={{ marginTop: 14 }}>
                            <DesgloseMedios
                                items={pendiente?.desglose_medios || []}
                                title="Pendiente por medio"
                                emptyText="Todavía no hay pendiente para desglosar por medio."
                            />
                        </div>
                    </div>

                    <div className="card" style={{ marginBottom: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                            <Wallet size={18} style={{ color: '#f59e0b' }} />
                            <div style={{ fontWeight: 700 }}>Cuentas a cobrar del dÃ­a</div>
                        </div>
                        <div style={{ display: 'grid', gap: 8, fontSize: '0.86rem' }}>
                            <div>Saldo pendiente: <strong style={{ color: '#f59e0b' }}>{fmtGs(cuentasPorCobrar.total_pendiente || 0)}</strong></div>
                            <div>Ventas con saldo: <strong>{cuentasPorCobrar.cantidad_ventas || 0}</strong></div>
                            <div>Total vendido con saldo: <strong style={{ color: 'var(--primary-light)' }}>{fmtGs(cuentasPorCobrar.total_ventas || 0)}</strong></div>
                            <div>Ya cobrado sobre esas ventas: <strong style={{ color: 'var(--success)' }}>{fmtGs(cuentasPorCobrar.total_cobrado || 0)}</strong></div>
                        </div>
                        <div style={{ marginTop: 12, color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.5 }}>
                            Este bloque muestra lo que faltÃ³ cobrar de las ventas creadas en la jornada de hoy. No entra en el pendiente de rendir hasta que efectivamente se cobre.
                        </div>
                    </div>
                </div>

                <div style={{ display: 'grid', gap: 16 }}>
                    <div className="card" style={{ marginBottom: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                            <ClipboardList size={18} style={{ color: '#60a5fa' }} />
                            <div style={{ fontWeight: 700 }}>Cortes de hoy</div>
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', lineHeight: 1.45, marginBottom: 12 }}>
                            Horas en formato 24 h. Cada PDF/Excel del corte incluye movimientos de caja y banco con fecha y hora hasta el instante indicado; las operaciones cargadas después no entran en ese informe (podes generar un corte nuevo al final del dia).
                        </div>
                        {isLoadingCortes ? (
                            <div className="flex-center" style={{ padding: 20 }}>
                                <div className="spinner" style={{ width: 24, height: 24 }} />
                            </div>
                        ) : cortes.length === 0 ? (
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', lineHeight: 1.5 }}>
                                Todavía no se registró ningún corte en esta jornada.
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gap: 10 }}>
                                {cortes.map(corte => (
                                    <div key={corte.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', background: corte.es_ultimo ? 'rgba(59,130,246,0.08)' : 'rgba(255,255,255,0.02)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 10 }}>
                                            <div>
                                                <div style={{ fontWeight: 700 }}>
                                                    Corte {fmtDateTime(corte.fecha_hora_corte)} {corte.es_ultimo ? <span className="badge badge-blue" style={{ marginLeft: 8 }}>Más reciente</span> : null}
                                                </div>
                                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: 4 }}>
                                                    Emitido por {corte.usuario_nombre || '—'} · Movimientos: {corte.movimientos_total}
                                                </div>
                                            </div>
                                            <ExportActions kind="cortes" id={corte.id} />
                                        </div>
                                        <DesgloseMedios
                                            items={corte.desglose_medios || []}
                                            title="Corte por medio"
                                            emptyText="Este corte todavía no tiene un desglose por medio."
                                        />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="card" style={{ marginBottom: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                            <HandCoins size={18} style={{ color: '#f59e0b' }} />
                            <div style={{ fontWeight: 700 }}>Rendiciones de hoy</div>
                        </div>
                        {isLoadingRendiciones ? (
                            <div className="flex-center" style={{ padding: 20 }}>
                                <div className="spinner" style={{ width: 24, height: 24 }} />
                            </div>
                        ) : rendiciones.length === 0 ? (
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', lineHeight: 1.5 }}>
                                Todavía no se registró ninguna rendición en esta jornada.
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gap: 10 }}>
                                {rendiciones.map(rendicion => (
                                    <div key={rendicion.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', background: rendicion.es_ultima_vigente ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.02)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 10 }}>
                                            <div>
                                                <div style={{ fontWeight: 700 }}>
                                                    Rendición {fmtDateTime(rendicion.fecha_hora_rendicion)} {rendicion.es_ultima_vigente ? <span className="badge badge-blue" style={{ marginLeft: 8 }}>Más reciente</span> : null}
                                                </div>
                                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: 4 }}>
                                                    Rendido a {rendicion.rendido_a} · Usuario {rendicion.usuario_nombre || '—'}
                                                </div>
                                            </div>
                                            <div className="flex gap-8" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRendicionDetalleId(rendicion.id)}>
                                                    <Eye size={14} /> Ver
                                                </button>
                                                {puedeEditarRendicion && rendicion.estado === 'VIGENTE' ? (
                                                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRendicionEdicion(rendicion)}>
                                                        <Pencil size={14} /> Editar
                                                    </button>
                                                ) : null}
                                                <ExportActions kind="rendiciones" id={rendicion.id} />
                                            </div>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, fontSize: '0.8rem' }}>
                                            <div>Sugerido: <strong>{fmtGs(rendicion.monto_sugerido)}</strong></div>
                                            <div>Rendido: <strong style={{ color: 'var(--info)' }}>{fmtGs(rendicion.monto_rendido)}</strong></div>
                                            <div>Diferencia: <strong style={{ color: Math.abs(rendicion.diferencia || 0) > 0.009 ? 'var(--danger)' : 'var(--success)' }}>{fmtGs(rendicion.diferencia)}</strong></div>
                                        </div>
                                        <div style={{ marginTop: 12 }}>
                                            <DesgloseMedios
                                                items={rendicion.desglose_medios || []}
                                                title="Rendido por medio"
                                                emptyText="Esta rendición no tiene movimientos para desglosar."
                                            />
                                        </div>
                                        {rendicion.observacion ? (
                                            <div style={{ marginTop: 10, color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.45 }}>
                                                Observación: {rendicion.observacion}
                                            </div>
                                        ) : null}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="card" style={{ marginTop: 16, marginBottom: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                    <div style={{ fontWeight: 700 }}>Historial reciente</div>
                    <div className="flex gap-8" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                        <button
                            type="button"
                            className={`btn btn-sm ${historialTab === 'jornadas' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setHistorialTab('jornadas')}
                        >
                            Jornadas
                        </button>
                        <button
                            type="button"
                            className={`btn btn-sm ${historialTab === 'rendiciones' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setHistorialTab('rendiciones')}
                        >
                            Rendiciones
                        </button>
                    </div>
                </div>

                {historialTab === 'rendiciones' && (
                    <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            <div style={{ flex: '2 1 280px' }}>
                                <input
                                    className="form-input"
                                    value={busquedaRendiciones}
                                    onChange={event => {
                                        setBusquedaRendiciones(event.target.value)
                                        setPaginaRendiciones(1)
                                    }}
                                    placeholder="Buscar por rendido a, usuario, estado u observacion"
                                />
                            </div>
                            <div style={{ flex: '1 1 170px' }}>
                                <select
                                    className="form-input"
                                    value={filtroEstadoRendicion}
                                    onChange={event => {
                                        setFiltroEstadoRendicion(event.target.value)
                                        setPaginaRendiciones(1)
                                    }}
                                >
                                    <option value="">Todos los estados</option>
                                    {opcionesEstadoRendicion.map(estado => (
                                        <option key={estado} value={estado}>{estado}</option>
                                    ))}
                                </select>
                            </div>
                            <div style={{ flex: '1 1 170px' }}>
                                <input
                                    className="form-input"
                                    type="date"
                                    value={filtroJornadaRendicion}
                                    onChange={event => {
                                        setFiltroJornadaRendicion(event.target.value)
                                        setPaginaRendiciones(1)
                                    }}
                                />
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            <div style={{ flex: '1 1 220px' }}>
                                <select
                                    className="form-input"
                                    value={filtroRendidoARendicion}
                                    onChange={event => {
                                        setFiltroRendidoARendicion(event.target.value)
                                        setPaginaRendiciones(1)
                                    }}
                                >
                                    <option value="">Todos los destinatarios</option>
                                    {opcionesDestinatarios.map(d => (
                                        <option key={d.id} value={String(d.id)}>
                                            {d.nombre}
                                            {d.activo ? '' : ' (inactivo)'}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div style={{ flex: '1 1 220px' }}>
                                <select
                                    className="form-input"
                                    value={filtroUsuarioRendicion}
                                    onChange={event => {
                                        setFiltroUsuarioRendicion(event.target.value)
                                        setPaginaRendiciones(1)
                                    }}
                                >
                                    <option value="">Todos los usuarios</option>
                                    {opcionesUsuarioFiltro.map(u => (
                                        <option key={u.id} value={String(u.id)}>{u.nombre}</option>
                                    ))}
                                </select>
                            </div>
                            <div style={{ flex: '1 1 180px' }}>
                                <input
                                    className="form-input"
                                    type="date"
                                    value={fechaDesdeRendicion}
                                    onChange={event => {
                                        setFechaDesdeRendicion(event.target.value)
                                        setPaginaRendiciones(1)
                                    }}
                                />
                            </div>
                            <div style={{ flex: '1 1 180px' }}>
                                <input
                                    className="form-input"
                                    type="date"
                                    value={fechaHastaRendicion}
                                    onChange={event => {
                                        setFechaHastaRendicion(event.target.value)
                                        setPaginaRendiciones(1)
                                    }}
                                />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                <button type="button" className="btn btn-secondary" onClick={limpiarFiltrosRendiciones}>
                                    Limpiar filtros
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {historialTab === 'jornadas' ? (
                    isLoadingHistorialJornadas ? (
                        <div className="flex-center" style={{ padding: 20 }}>
                            <div className="spinner" style={{ width: 24, height: 24 }} />
                        </div>
                    ) : isErrorHistorialJornadas ? (
                        <div style={{ color: '#f87171', fontSize: '0.84rem', lineHeight: 1.5 }}>
                            {errorHistorialJornadas?.response?.data?.detail || 'No se pudo cargar el historial de jornadas.'}
                        </div>
                    ) : historialJornadas.length === 0 ? (
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
                            Todavía no hay jornadas registradas.
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gap: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                <div>Total de rendiciones: <strong>{totalHistorialRendiciones}</strong></div>
                                <div className="flex gap-8" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                                    <span>Página {paginaRendiciones} de {totalPagesHistorialRendiciones}</span>
                                    <select
                                        className="form-input"
                                        value={pageSizeRendiciones}
                                        onChange={event => {
                                            setPageSizeRendiciones(Number(event.target.value))
                                            setPaginaRendiciones(1)
                                        }}
                                        style={{ width: 96 }}
                                    >
                                        {[25, 50, 100].map(size => (
                                            <option key={size} value={size}>{size}/pag</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="table-wrapper" style={{ overflow: 'auto' }}>
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th style={{ whiteSpace: 'nowrap' }}>Fecha</th>
                                        <th style={{ whiteSpace: 'nowrap' }}>Estado</th>
                                        <th style={{ minWidth: 140, maxWidth: 260 }}>Observación</th>
                                        <th style={{ whiteSpace: 'nowrap' }}>Apertura</th>
                                        <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>Ingresos</th>
                                        <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>Egresos</th>
                                        <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>Total rendido</th>
                                        <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>Pendiente</th>
                                        <th style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>Mov. pend.</th>
                                        {puedeRendir ? <th style={{ width: 120, textAlign: 'center' }}>Acciones</th> : null}
                                    </tr>
                                </thead>
                                <tbody>
                                    {historialJornadas.map(jornada => {
                                        const observacion = getJornadaObservacion(jornada)
                                        const tienePendiente = Math.abs(jornada.pendiente_rendicion || 0) > 0.009
                                        return (
                                            <tr key={jornada.jornada_id}>
                                                <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle' }}>{jornada.fecha}</td>
                                                <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle' }}>{jornada.estado}</td>
                                                <td
                                                    style={{
                                                        color: observacion.color,
                                                        fontWeight: 700,
                                                        whiteSpace: 'normal',
                                                        lineHeight: 1.35,
                                                        verticalAlign: 'middle',
                                                        maxWidth: 280,
                                                    }}
                                                >
                                                    {observacion.text}
                                                </td>
                                                <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem', verticalAlign: 'middle' }}>
                                                    {fmtDateTime(jornada.fecha_hora_apertura)}
                                                </td>
                                                <td style={{ color: 'var(--success)', fontWeight: 700, textAlign: 'right', verticalAlign: 'middle' }}>{fmtGs(jornada.ingresos)}</td>
                                                <td style={{ color: 'var(--danger)', fontWeight: 700, textAlign: 'right', verticalAlign: 'middle' }}>{fmtGs(jornada.egresos)}</td>
                                                <td style={{ color: 'var(--info)', fontWeight: 700, textAlign: 'right', verticalAlign: 'middle' }}>{fmtGs(jornada.total_rendido)}</td>
                                                <td style={{ color: (jornada.pendiente_rendicion || 0) < 0 ? 'var(--danger)' : 'var(--warning)', fontWeight: 700, textAlign: 'right', verticalAlign: 'middle' }}>
                                                    {fmtGs(jornada.pendiente_rendicion)}
                                                </td>
                                                <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>{jornada.cantidad_movimientos_pendientes || 0}</td>
                                                {puedeRendir ? (
                                                    <td style={{ verticalAlign: 'middle' }}>
                                                        <JornadaHistorialRowActions
                                                            jornada={jornada}
                                                            observacion={observacion}
                                                            tienePendiente={tienePendiente}
                                                            onVerRendiciones={setJornadaVerRendiciones}
                                                            onRendir={setJornadaHistorialSeleccionada}
                                                            onOpenPdf={abrirInformeJornadaPdf}
                                                            onDownloadExcel={descargarInformeJornadaExcel}
                                                        />
                                                    </td>
                                                ) : null}
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                        </div>
                    )
                ) : (
                    isLoadingHistorialRendiciones ? (
                        <div className="flex-center" style={{ padding: 20 }}>
                            <div className="spinner" style={{ width: 24, height: 24 }} />
                        </div>
                    ) : isErrorHistorialRendiciones ? (
                        <div style={{ color: '#f87171', fontSize: '0.84rem', lineHeight: 1.5 }}>
                            {errorHistorialRendiciones?.response?.data?.detail || 'No se pudo cargar el historial de rendiciones.'}
                        </div>
                    ) : historialRendicionesFiltradas.length === 0 ? (
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
                            Todavía no hay rendiciones registradas.
                        </div>
                    ) : (
                        <div>
                        <div className="table-wrapper" style={{ overflow: 'auto' }}>
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th style={{ whiteSpace: 'nowrap' }}>Fecha/Hora</th>
                                        <th style={{ whiteSpace: 'nowrap' }}>Jornada</th>
                                        <th>Rendido a</th>
                                        <th style={{ textAlign: 'right' }}>Sugerido</th>
                                        <th style={{ textAlign: 'right' }}>Rendido</th>
                                        <th style={{ textAlign: 'right' }}>Diferencia</th>
                                        <th style={{ whiteSpace: 'nowrap' }}>Estado</th>
                                        <th style={{ minWidth: 160, maxWidth: 300 }}>Observación</th>
                                        <th style={{ width: 120, textAlign: 'center' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {historialRendicionesFiltradas.map(rendicion => (
                                        <tr key={`${rendicion.jornada_fecha}-${rendicion.id}`}>
                                            <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem', verticalAlign: 'middle' }}>{fmtDateTime(rendicion.fecha_hora_rendicion)}</td>
                                            <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle' }}>{rendicion.jornada_fecha}</td>
                                            <td style={{ verticalAlign: 'middle' }}>{rendicion.rendido_a}</td>
                                            <td style={{ textAlign: 'right', verticalAlign: 'middle' }}>{fmtGs(rendicion.monto_sugerido)}</td>
                                            <td style={{ color: 'var(--info)', fontWeight: 700, textAlign: 'right', verticalAlign: 'middle' }}>{fmtGs(rendicion.monto_rendido)}</td>
                                            <td style={{ color: Math.abs(rendicion.diferencia || 0) > 0.009 ? 'var(--danger)' : 'var(--success)', fontWeight: 700, textAlign: 'right', verticalAlign: 'middle' }}>
                                                {fmtGs(rendicion.diferencia)}
                                            </td>
                                            <td style={{ verticalAlign: 'middle' }}>{rendicion.estado}</td>
                                            <td style={{ verticalAlign: 'middle' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, lineHeight: 1.35, maxWidth: 320 }}>
                                                    {rendicion.editada ? (
                                                        <>
                                                            <span
                                                                style={{
                                                                    alignSelf: 'flex-start',
                                                                    fontSize: '0.68rem',
                                                                    fontWeight: 800,
                                                                    letterSpacing: '0.04em',
                                                                    textTransform: 'uppercase',
                                                                    color: 'var(--warning)',
                                                                    background: 'rgba(245, 158, 11, 0.12)',
                                                                    border: '1px solid rgba(245, 158, 11, 0.35)',
                                                                    borderRadius: 6,
                                                                    padding: '2px 8px',
                                                                }}
                                                            >
                                                                Editada
                                                            </span>
                                                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
                                                                {rendicion.motivo_ajuste || rendicion.observacion || 'Sin detalle adicional'}
                                                            </span>
                                                        </>
                                                    ) : (
                                                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
                                                            {rendicion.observacion || '—'}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td style={{ verticalAlign: 'middle' }}>
                                                <RendicionHistorialRowActions
                                                    rendicion={rendicion}
                                                    puedeEditar={puedeEditarRendicion}
                                                    onVer={() => setRendicionDetalleId(rendicion.id)}
                                                    onEditar={() => setRendicionEdicion(rendicion)}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            </div>
                            <div className="flex gap-8" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    disabled={paginaRendiciones <= 1}
                                    onClick={() => setPaginaRendiciones(prev => Math.max(1, prev - 1))}
                                >
                                    Anterior
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    disabled={paginaRendiciones >= totalPagesHistorialRendiciones}
                                    onClick={() => setPaginaRendiciones(prev => Math.min(totalPagesHistorialRendiciones, prev + 1))}
                                >
                                    Siguiente
                                </button>
                            </div>
                        </div>
                    )
                )}
            </div>

            {showPosterioresModal && (
                <MovimientosPosterioresModal onClose={() => setShowPosterioresModal(false)} />
            )}
            {showRendirModal && (
                <RendirModal pendiente={pendiente} onClose={() => setShowRendirModal(false)} />
            )}
            {rendicionDetalleId && (
                <VerRendicionModal
                    rendicionId={rendicionDetalleId}
                    puedeEditar={puedeEditarRendicion}
                    onEditar={rendicion => {
                        setRendicionEdicion(rendicion)
                        setRendicionDetalleId(null)
                    }}
                    onClose={() => setRendicionDetalleId(null)}
                />
            )}
            {rendicionEdicion && (
                <EditarRendicionModalLimpio rendicion={rendicionEdicion} onClose={() => setRendicionEdicion(null)} />
            )}
            {jornadaVerRendiciones && (
                <RendicionesJornadaModal
                    jornada={jornadaVerRendiciones}
                    rendiciones={rendicionesDeJornadaSeleccionada}
                    isLoading={isLoadingRendicionesJornadaModal}
                    onClose={() => setJornadaVerRendiciones(null)}
                    onVerRendicion={rendicion => {
                        setRendicionDetalleId(rendicion.id)
                        setJornadaVerRendiciones(null)
                    }}
                />
            )}
            {jornadaHistorialSeleccionada && (
                <RendirModalHistorial
                    jornadaId={jornadaHistorialSeleccionada.jornada_id}
                    jornadaFecha={jornadaHistorialSeleccionada.fecha}
                    onClose={() => setJornadaHistorialSeleccionada(null)}
                />
            )}
            {ENABLE_JORNADA_BENCH && !showJornadaLoadBench ? (
                <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{
                        position: 'fixed',
                        bottom: 12,
                        right: 12,
                        zIndex: 2147483646,
                        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
                    }}
                    title="Mostrar diagnóstico de tiempos de carga (queda guardado en este navegador)"
                    onClick={() => {
                        try {
                            window.localStorage.setItem(JORNADA_BENCH_STORAGE, '1')
                            window.sessionStorage.setItem(JORNADA_BENCH_STORAGE, '1')
                        } catch {
                            /* ignore */
                        }
                        jornadaLoadT0.current = performance.now()
                        setJornadaLoadMs({})
                        setShowJornadaLoadBench(true)
                    }}
                >
                    Tiempos carga
                </button>
            ) : null}

            {ENABLE_JORNADA_BENCH && showJornadaLoadBench ? (
                <div
                    style={{
                        position: 'fixed',
                        bottom: 12,
                        right: 12,
                        zIndex: 2147483646,
                        width: 'min(440px, calc(100vw - 24px))',
                        maxHeight: 'min(70vh, 520px)',
                        overflow: 'auto',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        borderRadius: 12,
                        boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
                        padding: '12px 14px',
                        fontSize: '0.78rem',
                        lineHeight: 1.4,
                    }}
                >
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>Diagnóstico: primera carga (Jornada)</div>
                    <div style={{ color: 'var(--text-secondary)', marginBottom: 10 }}>
                        T0 = montaje de esta pantalla. Cada fila: milisegundos hasta la <strong>primera</strong> respuesta OK de ese GET
                        (los cinco salen en paralelo). Si React Query tenía caché, puede figurar un número muy bajo.
                        La pantalla completa espera sobre todo a <code style={{ fontSize: '0.72rem' }}>estado-actual</code>.
                        Si abriste el panel después de cargar, pulsá <strong>F5</strong> para medir bien esta entrada al menú.
                    </div>
                    {jornadaBenchMaxMs != null ? (
                        <div style={{ marginBottom: 8, fontWeight: 700, color: 'var(--warning)' }}>
                            Más lenta (entre las medidas): {jornadaBenchMaxMs} ms
                            {jornadaLoadMs['GET /caja/jornada/estado-actual'] != null ? (
                                <>
                                    {' · '}
                                    Bloquea el spinner inicial: {jornadaLoadMs['GET /caja/jornada/estado-actual']} ms
                                </>
                            ) : null}
                        </div>
                    ) : null}
                    <div className="table-wrapper" style={{ overflow: 'auto', maxHeight: 220, marginBottom: 10 }}>
                        <table className="table" style={{ fontSize: '0.74rem' }}>
                            <thead>
                                <tr>
                                    <th>Paso (GET)</th>
                                    <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>ms desde T0</th>
                                </tr>
                            </thead>
                            <tbody>
                                {jornadaBenchRows.length === 0 ? (
                                    <tr>
                                        <td colSpan={2} style={{ color: 'var(--text-muted)' }}>Esperando respuestas…</td>
                                    </tr>
                                ) : (
                                    jornadaBenchRows.map(([label, ms]) => (
                                        <tr key={label}>
                                            <td style={{ wordBreak: 'break-word' }}>{label}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 800 }}>{ms}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                                const payload = {
                                    t0: 'montaje JornadaRendicionesPage',
                                    primera_respuesta_ok_ms: jornadaLoadMs,
                                    mas_lenta_ms: jornadaBenchMaxMs,
                                    bloquea_spinner_inicial_ms: jornadaLoadMs['GET /caja/jornada/estado-actual'] ?? null,
                                    nota: 'GET en paralelo; ms = hasta primera respuesta OK por endpoint (incluye caché).',
                                }
                                void navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
                            }}
                        >
                            Copiar JSON
                        </button>
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                                try {
                                    window.sessionStorage.removeItem(JORNADA_BENCH_STORAGE)
                                    window.localStorage.removeItem(JORNADA_BENCH_STORAGE)
                                } catch {
                                    /* ignore */
                                }
                                setShowJornadaLoadBench(false)
                            }}
                        >
                            Ocultar panel
                        </button>
                    </div>
                    <div style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                        Activo con: botón «Tiempos carga», URL <code>?jornadaBench=1</code>, o modo desarrollo.
                        El flag queda en <code>localStorage</code> hasta que uses «Ocultar panel».
                    </div>
                </div>
            ) : null}
        </div>
    )
}
