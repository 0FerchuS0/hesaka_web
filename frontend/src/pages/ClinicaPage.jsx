import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
    CalendarDays,
    Eye,
    FileText,
    MapPin,
    MessageCircle,
    Pencil,
    Plus,
    RefreshCcw,
    Search,
    Stethoscope,
    Trash2,
    UserRound,
    Users,
} from 'lucide-react'
import Modal from '../components/Modal'
import RemoteSearchSelect from '../components/RemoteSearchSelect'
import { api, useAuth } from '../context/AuthContext'
import { hasActionAccess } from '../utils/roles'

const CLINICA_PALETTE = {
    accent: '#1dd3c7',
    accentSoft: 'rgba(29, 211, 199, 0.14)',
    accentBorder: 'rgba(29, 211, 199, 0.32)',
    accentAlt: '#67e8f9',
    panel: 'linear-gradient(180deg, rgba(6, 25, 31, 0.92), rgba(11, 19, 27, 0.96))',
}

const CLINICA_TABS = [
    { key: 'dashboard', label: 'Dashboard Clinico', path: '/clinica/dashboard', icon: Stethoscope },
    { key: 'agenda', label: 'Agenda', path: '/clinica/agenda', icon: CalendarDays },
    { key: 'pacientes', label: 'Pacientes', path: '/clinica/pacientes', icon: Users },
    { key: 'doctores', label: 'Doctores', path: '/clinica/doctores', icon: UserRound },
    { key: 'consulta', label: 'Nueva consulta', path: '/clinica/consulta', icon: Plus },
    { key: 'historial', label: 'Historial', path: '/clinica/historial', icon: FileText },
    { key: 'lugares', label: 'Lugares', path: '/clinica/lugares', icon: MapPin },
    { key: 'vademecum', label: 'Vademecum', path: '/clinica/vademecum', icon: FileText },
]

const WHATSAPP_TEMPLATE_KEY = 'hesaka-clinica-whatsapp-template'
const DEFAULT_WHATSAPP_TEMPLATE = 'Hola {paciente}, te escribimos de HESAKA. Tu ultima consulta fue el {ultima_consulta} y tu proximo control esta previsto para el {proxima_consulta}. Quedamos atentos para ayudarte a confirmar tu cita.'

function formatError(error, fallback = 'Ocurrio un error.') {
    const detail = error?.response?.data?.detail
    if (typeof detail === 'string' && detail.trim()) return detail
    if (Array.isArray(detail) && detail.length > 0) {
        return detail.map(item => item?.msg || item?.message || String(item)).join(' | ')
    }
    if (error?.response?.data?.message) return error.response.data.message
    if (error?.message) return error.message
    return fallback
}

function fmtDate(value) {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '-'
    return date.toLocaleDateString('es-PY')
}

function fmtDateTime(value) {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '-'
    return date.toLocaleString('es-PY')
}

function formatDateInputValue(value) {
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function parseDateInputValue(value) {
    if (!value) return null
    const [year, month, day] = String(value).split('-').map(Number)
    if (!year || !month || !day) return null
    return new Date(year, month - 1, day, 12, 0, 0, 0)
}

function addMonthsToDateInput(baseValue, months) {
    const baseDate = parseDateInputValue(baseValue) || new Date()
    const next = new Date(baseDate)
    next.setMonth(next.getMonth() + months)
    return formatDateInputValue(next)
}

function normalizarTelefonoWhatsapp(value) {
    let digits = String(value || '').replace(/\D/g, '')
    if (!digits) return ''

    if (digits.startsWith('00')) {
        digits = digits.slice(2)
    }

    if (digits.startsWith('59509')) {
        digits = `595${digits.slice(4)}`
    }

    if (digits.startsWith('5950')) {
        digits = `595${digits.slice(4)}`
    }

    if (digits.startsWith('09') && digits.length === 10) {
        return `595${digits.slice(1)}`
    }

    if (digits.startsWith('9') && digits.length === 9) {
        return `595${digits}`
    }

    if (digits.startsWith('5959') && digits.length === 12) {
        return digits
    }

    return digits.startsWith('595') ? digits : ''
}

function getWhatsappTemplate() {
    if (typeof window === 'undefined') return DEFAULT_WHATSAPP_TEMPLATE
    return localStorage.getItem(WHATSAPP_TEMPLATE_KEY) || DEFAULT_WHATSAPP_TEMPLATE
}

function buildWhatsappMessage(item, template = DEFAULT_WHATSAPP_TEMPLATE) {
    const ultimaConsulta = item?.ultima_consulta_fecha ? fmtDate(item.ultima_consulta_fecha) : 'sin registro'
    const proximaConsulta = item?.fecha_hora ? fmtDate(item.fecha_hora) : 'sin fecha'
    return (template || DEFAULT_WHATSAPP_TEMPLATE)
        .replaceAll('{paciente}', item?.paciente_nombre || '')
        .replaceAll('{ultima_consulta}', ultimaConsulta)
        .replaceAll('{proxima_consulta}', proximaConsulta)
        .replaceAll('{empresa}', 'HESAKA')
}

function buildReminderWhatsappLink(item, message = '') {
    const telefono = normalizarTelefonoWhatsapp(item?.paciente_telefono)
    if (!telefono) return ''
    const finalMessage = message || buildWhatsappMessage(item, getWhatsappTemplate())
    return `https://wa.me/${telefono}?text=${encodeURIComponent(finalMessage)}`
}

function buildTemplateFromMessage(message, item) {
    let template = message || ''
    const replacements = [
        [item?.paciente_nombre || '', '{paciente}'],
        [item?.ultima_consulta_fecha ? fmtDate(item.ultima_consulta_fecha) : 'sin registro', '{ultima_consulta}'],
        [item?.fecha_hora ? fmtDate(item.fecha_hora) : 'sin fecha', '{proxima_consulta}'],
        ['HESAKA', '{empresa}'],
    ]
    replacements.forEach(([value, placeholder]) => {
        if (!value) return
        template = template.replaceAll(value, placeholder)
    })
    return template
}

function getDailyReminderStorageKey(user) {
    const userKey = user?.id || user?.email || user?.nombre || 'anon'
    const dayKey = formatDateInputValue(new Date())
    return `hesaka-recordatorios-vistos-${userKey}-${dayKey}`
}

function flattenReminderBuckets(reminderBuckets) {
    return [
        ...(reminderBuckets?.hoy || []),
        ...(reminderBuckets?.ocho_dias || []),
        ...(reminderBuckets?.quince_dias || []),
    ]
}

function ReminderCards({ items, onMarkRemembered, onOpenWhatsappEditor = null, actionPendingId = null, emptyMessage = 'Sin recordatorios pendientes.' }) {
    if (!items?.length) {
        return <div style={{ color: 'var(--text-muted)' }}>{emptyMessage}</div>
    }

    return (
        <div style={{ display: 'grid', gap: 12 }}>
            {items.map(item => {
                const whatsappLink = buildReminderWhatsappLink(item)
                const isPending = actionPendingId === item.id
                return (
                    <div key={`${item.id}-${item.recordatorio_categoria || 'sin-categoria'}`} className="card" style={{ padding: 14, background: 'rgba(255,255,255,0.02)' }}>
                        <div className="flex-between" style={{ gap: 12, alignItems: 'flex-start' }}>
                            <div>
                                <div style={{ fontWeight: 700 }}>{item.paciente_nombre}</div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.86rem', marginTop: 4 }}>
                                    Ultima consulta: {item.ultima_consulta_fecha ? fmtDate(item.ultima_consulta_fecha) : 'Sin registro'}
                                </div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.86rem', marginTop: 4 }}>
                                    Proxima consulta: {fmtDateTime(item.fecha_hora)}
                                </div>
                                {item.doctor_nombre ? (
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.86rem', marginTop: 4 }}>
                                        Doctor: {item.doctor_nombre}
                                    </div>
                                ) : null}
                            </div>
                            <span className={`badge ${item.recordatorio_categoria === 'hoy' ? 'badge-red' : item.recordatorio_categoria === '8_dias' ? 'badge-yellow' : 'badge-blue'}`}>
                                {item.recordatorio_categoria === 'hoy' ? 'Hoy' : item.recordatorio_categoria === '8_dias' ? '8 dias' : '15 dias'}
                            </span>
                        </div>
                        <div className="flex gap-12" style={{ marginTop: 12, flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => onMarkRemembered(item)}
                                disabled={isPending}
                            >
                                {isPending ? 'Guardando...' : 'Recordado'}
                            </button>
                            <button
                                type="button"
                                className={`btn btn-secondary btn-sm ${!whatsappLink ? 'disabled' : ''}`}
                                onClick={() => {
                                    if (!whatsappLink) {
                                        window.alert('Este paciente no tiene telefono cargado para abrir WhatsApp.')
                                        return
                                    }
                                    if (onOpenWhatsappEditor) {
                                        onOpenWhatsappEditor(item)
                                        return
                                    }
                                    window.open(whatsappLink, '_blank', 'noopener,noreferrer')
                                }}
                                style={!whatsappLink ? { pointerEvents: 'auto', opacity: 0.6 } : undefined}
                            >
                                <MessageCircle size={14} /> WhatsApp
                            </button>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

function calcAge(fechaNacimiento) {
    if (!fechaNacimiento) return ''
    const birth = new Date(`${fechaNacimiento}T00:00:00`)
    if (Number.isNaN(birth.getTime())) return ''
    const today = new Date()
    let age = today.getFullYear() - birth.getFullYear()
    const beforeBirthday = today.getMonth() < birth.getMonth()
        || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
    if (beforeBirthday) age -= 1
    return age >= 0 ? String(age) : ''
}

function fmtNumber(value) {
    return new Intl.NumberFormat('es-PY').format(Number(value || 0))
}

function buildAnamnesisSummary(anamnesis) {
    if (!anamnesis) return ''
    const symptoms = [
        ['cefalea', 'Cefalea'],
        ['ardor', 'Ardor'],
        ['ojo_seco', 'Ojo seco'],
        ['lagrimeo', 'Lagrimeo'],
        ['fotofobia', 'Fotofobia'],
        ['vision_doble', 'Vision doble'],
        ['destellos', 'Destellos'],
        ['manchas', 'Manchas'],
        ['dificultad_cerca', 'Dificultad de cerca'],
    ].filter(([key]) => anamnesis[key]).map(([, label]) => label)

    const parts = []
    if (anamnesis.motivo_principal) parts.push(`MOTIVO: ${anamnesis.motivo_principal}`)
    if (anamnesis.tiempo_molestias) parts.push(`TIEMPO: ${anamnesis.tiempo_molestias}`)
    if (symptoms.length) parts.push(`SINTOMAS: ${symptoms.join(', ')}`)
    if (anamnesis.antecedentes_familiares) parts.push(`ANTECEDENTES: ${anamnesis.antecedentes_familiares}`)
    if (anamnesis.medicamentos) parts.push(`MEDICAMENTOS: ${anamnesis.medicamentos}`)
    return parts.join(' | ')
}

const DIAGNOSTICOS_FRECUENTES = [
    'Miopia',
    'Hipermetropia',
    'Astigmatismo',
    'Presbicia',
    'Cansancio ocular / Astenopia',
    'Sindrome visual informatico',
    'Ambliopia',
    'Estrabismo',
]

const MOTIVOS_OFTALMOLOGIA_RAPIDOS = [
    'Vision borrosa de lejos',
    'Vision borrosa de cerca',
    'Cansancio visual',
    'Cefalea asociada al uso de pantallas',
    'Control de graduacion',
]

const PLANES_OFTALMOLOGIA_RAPIDOS = [
    'Indico correccion optica permanente.',
    'Indico descanso visual y lubricacion ocular.',
    'Indico control clinico segun evolucion.',
    'Indico uso de lentes con filtro de luz azul.',
]

const ESTUDIOS_OFTALMOLOGIA_RAPIDOS = [
    'Tonometria',
    'Retinografia',
    'Campo visual',
    'OCT',
]

const RESUMENES_CONTACTOLOGIA_RAPIDOS = [
    'Buena adaptacion al lente de prueba.',
    'Requiere ajuste de parametros y nuevo control.',
    'Tolera bien el uso diario sugerido.',
    'Se explica higiene, conservacion y signos de alarma.',
]

const PLANES_CONTACTOLOGIA_RAPIDOS = [
    'Indico prueba de lente y control cercano.',
    'Indico uso progresivo hasta completar adaptacion.',
    'Indico suspension del uso ante dolor o enrojecimiento.',
]

const DIAGNOSTICOS_RECETA_RAPIDOS = [
    'Conjuntivitis alergica',
    'Ojo seco',
    'Blefaritis',
    'Infeccion ocular',
]

const POSOLOGIAS_RAPIDAS = [
    '1 gota cada 8 horas',
    '1 gota cada 12 horas',
    '1 gota cada 6 horas',
    '1 gota segun necesidad',
]

const DURACIONES_RAPIDAS = [
    '5 dias',
    '7 dias',
    '10 dias',
    '14 dias',
]

const ESTADOS_TURNO = [
    { value: 'PENDIENTE', label: 'Pendiente' },
    { value: 'CONFIRMADO', label: 'Confirmado' },
    { value: 'EN_CURSO', label: 'En curso' },
    { value: 'ATENDIDO', label: 'Atendido' },
    { value: 'CANCELADO', label: 'Cancelado' },
]

function splitCommaValues(text) {
    return String(text || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
}

function appendTemplateText(currentValue, snippet) {
    const current = String(currentValue || '').trim()
    const text = String(snippet || '').trim()
    if (!text) return currentValue || ''
    if (!current) return text
    if (current.toLowerCase().includes(text.toLowerCase())) return current
    const needsBreak = /[.!?]$/.test(current)
    return `${current}${needsBreak ? '\n' : '\n'}${text}`
}

function QuickTemplateButtons({ label = 'Textos rapidos', options, onApply, disabled = false }) {
    if (!options?.length) return null
    return (
        <div className="card" style={{ padding: 12, marginTop: 10, background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ fontWeight: 700, fontSize: '0.86rem', marginBottom: 10 }}>{label}</div>
            <div className="flex gap-12" style={{ flexWrap: 'wrap' }}>
                {options.map(option => (
                    <button
                        key={option}
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => onApply(option)}
                        disabled={disabled}
                    >
                        {option}
                    </button>
                ))}
            </div>
        </div>
    )
}

function escapeRegex(text) {
    return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function parseRecommendationState(initialData) {
    const material = String(initialData?.material_lente || '').toUpperCase()
    const tratamientos = String(initialData?.tratamientos || '').toUpperCase()
    const uso = String(initialData?.tipo_lente || '').toUpperCase()
    const extractDetail = label => {
        const match = material.match(new RegExp(`${escapeRegex(label)}\\s*\\((.*?)\\)`, 'i'))
        return match?.[1] || ''
    }

    return {
        materialOrganico: material.includes('ORGANICO'),
        materialPolicarbonato: material.includes('POLICARBONATO'),
        tipoMonofocal: material.includes('MONOFOCAL'),
        tipoBifocal: material.includes('BIFOCAL'),
        detalleBifocal: extractDetail('BIFOCAL'),
        tipoMultifocal: material.includes('MULTIFOCAL/PROGRESIVO'),
        detalleMultifocal: extractDetail('MULTIFOCAL/PROGRESIVO'),
        tratamientoFiltroAzul: tratamientos.includes('FILTRO DE LUZ AZUL'),
        tratamientoAntirreflejos: tratamientos.includes('ANTI REFLEJOS'),
        tratamientoAntiUvx: tratamientos.includes('FILTRO ANTI UVX'),
        tratamientoFotocromatico: tratamientos.includes('FOTOCROMATICO'),
        tratamientoTransitions: tratamientos.includes('TRANSITIONS'),
        uso: uso || '',
    }
}

function buildRecommendationPayload(recommendation) {
    const materiales = []
    if (recommendation.materialOrganico) materiales.push('ORGANICO')
    if (recommendation.materialPolicarbonato) materiales.push('POLICARBONATO')
    if (recommendation.tipoMonofocal) materiales.push('MONOFOCAL')
    if (recommendation.tipoBifocal) {
        materiales.push(
            recommendation.detalleBifocal?.trim()
                ? `BIFOCAL (${recommendation.detalleBifocal.trim()})`
                : 'BIFOCAL'
        )
    }
    if (recommendation.tipoMultifocal) {
        materiales.push(
            recommendation.detalleMultifocal?.trim()
                ? `MULTIFOCAL/PROGRESIVO (${recommendation.detalleMultifocal.trim()})`
                : 'MULTIFOCAL/PROGRESIVO'
        )
    }

    const tratamientos = []
    if (recommendation.tratamientoFiltroAzul) tratamientos.push('FILTRO DE LUZ AZUL')
    if (recommendation.tratamientoAntirreflejos) tratamientos.push('ANTI REFLEJOS')
    if (recommendation.tratamientoAntiUvx) tratamientos.push('FILTRO ANTI UVX')
    if (recommendation.tratamientoFotocromatico) tratamientos.push('FOTOCROMATICO')
    if (recommendation.tratamientoTransitions) tratamientos.push('TRANSITIONS')

    return {
        tipo_lente: recommendation.uso || '',
        material_lente: materiales.join(', '),
        tratamientos: tratamientos.join(', '),
    }
}

function queryString(params) {
    const searchParams = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
        if (value === null || value === undefined || value === '') return
        searchParams.set(key, value)
    })
    return searchParams.toString()
}

function StatCard({ label, value, detail, accent }) {
    return (
        <div className="card" style={{ padding: 16, borderLeft: `3px solid ${accent}`, minWidth: 0 }}>
            <div style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.76rem', letterSpacing: '0.06em', lineHeight: 1.2 }}>{label}</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: 8, color: accent, lineHeight: 1.1 }}>{value}</div>
            {detail && <div style={{ marginTop: 6, color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.3 }}>{detail}</div>}
        </div>
    )
}

function TurnoAgendaActions({
    item,
    onEditar,
    onConfirmar,
    onAtender,
    onCancelar,
    onReprogramar,
    onWhatsapp,
    onEliminar,
    disabled,
}) {
    const [open, setOpen] = useState(false)
    const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 })
    const buttonRef = useRef(null)

    const whatsappLink = buildReminderWhatsappLink(item)

    const handleAction = callback => {
        setOpen(false)
        callback()
    }

    const toggleMenu = () => {
        if (open) {
            setOpen(false)
            return
        }

        const rect = buttonRef.current?.getBoundingClientRect()
        if (!rect) return

        const menuWidth = 220
        const menuHeight = 280
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight

        let left = rect.right - menuWidth
        let top = rect.bottom + 6

        if (left < 8) left = 8
        if (left + menuWidth > viewportWidth - 8) left = viewportWidth - menuWidth - 8
        if (top + menuHeight > viewportHeight - 8) top = rect.top - menuHeight - 6
        if (top < 8) top = 8

        setMenuPosition({ top, left })
        setOpen(true)
    }

    return (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button ref={buttonRef} type="button" className="btn btn-secondary btn-sm" onClick={toggleMenu} disabled={disabled}>
                Acciones
            </button>
            {open && (
                <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={() => setOpen(false)} />
                    <div
                        style={{
                            position: 'fixed',
                            top: menuPosition.top,
                            left: menuPosition.left,
                            minWidth: 220,
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border)',
                            borderRadius: 10,
                            boxShadow: '0 14px 34px rgba(0,0,0,0.45)',
                            padding: '6px 0',
                            zIndex: 100,
                        }}
                    >
                        <button className="dropdown-item" onClick={() => handleAction(onEditar)}>
                            <Pencil size={14} style={{ marginRight: 8 }} /> Editar
                        </button>
                        {item.estado !== 'CONFIRMADO' ? (
                            <button className="dropdown-item" onClick={() => handleAction(onConfirmar)}>
                                Confirmar
                            </button>
                        ) : null}
                        {item.estado !== 'ATENDIDO' ? (
                            <button className="dropdown-item" onClick={() => handleAction(onAtender)}>
                                Atender
                            </button>
                        ) : null}
                        {item.estado !== 'CANCELADO' ? (
                            <button className="dropdown-item" onClick={() => handleAction(onCancelar)}>
                                Cancelar
                            </button>
                        ) : null}
                        <button className="dropdown-item" onClick={() => handleAction(onReprogramar)}>
                            Reprogramar
                        </button>
                        <button className="dropdown-item" onClick={() => handleAction(() => {
                            if (!whatsappLink) {
                                window.alert('Este paciente no tiene telefono cargado para abrir WhatsApp.')
                                return
                            }
                            onWhatsapp()
                        })}>
                            <MessageCircle size={14} style={{ marginRight: 8 }} /> WhatsApp
                        </button>
                        <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
                        <button className="dropdown-item" style={{ color: 'var(--danger)' }} onClick={() => handleAction(onEliminar)}>
                            <Trash2 size={14} style={{ marginRight: 8 }} /> Eliminar
                        </button>
                    </div>
                </>
            )}
        </div>
    )
}

function WhatsappMessageModal({ item, onClose }) {
    const [message, setMessage] = useState(() => buildWhatsappMessage(item, getWhatsappTemplate()))

    const whatsappLink = buildReminderWhatsappLink(item, message)

    const restoreSuggested = () => {
        setMessage(buildWhatsappMessage(item, DEFAULT_WHATSAPP_TEMPLATE))
    }

    const saveAsTemplate = () => {
        const template = buildTemplateFromMessage(message, item)
        localStorage.setItem(WHATSAPP_TEMPLATE_KEY, template)
        window.alert('Plantilla de WhatsApp guardada correctamente.')
    }

    return (
        <Modal title="Mensaje de WhatsApp" onClose={onClose} maxWidth="760px">
            <div style={{ display: 'grid', gap: 14 }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.92rem' }}>
                    Puedes editar el texto antes de abrir WhatsApp. Variables automáticas disponibles en la plantilla:
                    {' '}
                    <code>{'{paciente}'}</code>, <code>{'{ultima_consulta}'}</code>, <code>{'{proxima_consulta}'}</code>, <code>{'{empresa}'}</code>.
                </div>
                <div className="card" style={{ padding: 14, background: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ fontWeight: 700 }}>{item?.paciente_nombre || 'Sin paciente'}</div>
                    <div style={{ marginTop: 6, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        Ultima consulta: {item?.ultima_consulta_fecha ? fmtDate(item.ultima_consulta_fecha) : 'Sin registro'}
                    </div>
                    <div style={{ marginTop: 4, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        Proxima consulta: {fmtDateTime(item?.fecha_hora)}
                    </div>
                </div>
                <div className="form-group">
                    <label className="form-label">Mensaje</label>
                    <textarea
                        className="form-input"
                        rows={7}
                        value={message}
                        onChange={event => setMessage(event.target.value)}
                        placeholder="Escribe el mensaje que quieres enviar por WhatsApp..."
                        style={{ resize: 'vertical', minHeight: 160 }}
                    />
                </div>
                <div className="flex gap-12" style={{ flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-secondary" onClick={restoreSuggested}>
                        Restaurar sugerido
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={saveAsTemplate}>
                        Guardar como plantilla
                    </button>
                </div>
                <div className="modal-actions">
                    <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => {
                            if (!whatsappLink) {
                                window.alert('Este paciente no tiene telefono cargado para abrir WhatsApp.')
                                return
                            }
                            window.open(whatsappLink, '_blank', 'noopener,noreferrer')
                        }}
                    >
                        <MessageCircle size={16} /> Abrir WhatsApp
                    </button>
                </div>
            </div>
        </Modal>
    )
}

function EmptyCard({ title, message, action }) {
    return (
        <div className="card">
            <div className="empty-state" style={{ padding: '64px 20px' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>{title}</div>
                <div style={{ color: 'var(--text-muted)', maxWidth: 520 }}>{message}</div>
                {action && <div style={{ marginTop: 18 }}>{action}</div>}
            </div>
        </div>
    )
}

function SectionHeader({ title, subtitle, actions }) {
    return (
        <div className="flex-between" style={{ gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
            <div>
                <h2 style={{ fontSize: '1.1rem', marginBottom: 6 }}>{title}</h2>
                {subtitle && <p style={{ color: 'var(--text-muted)' }}>{subtitle}</p>}
            </div>
            {actions && <div className="flex gap-12" style={{ flexWrap: 'wrap' }}>{actions}</div>}
        </div>
    )
}

function ClinicaShell({ currentKey, onNavigate, children }) {
    return (
        <div className="page-body" style={{ minWidth: 0 }}>
            <div
                className="card"
                style={{
                    padding: 28,
                    background: CLINICA_PALETTE.panel,
                    border: `1px solid ${CLINICA_PALETTE.accentBorder}`,
                    boxShadow: '0 20px 50px rgba(0,0,0,0.18)',
                }}
            >
                <div style={{ width: 56, height: 56, borderRadius: 18, display: 'grid', placeItems: 'center', background: CLINICA_PALETTE.accentSoft, border: `1px solid ${CLINICA_PALETTE.accentBorder}`, color: CLINICA_PALETTE.accent, marginBottom: 16 }}>
                    <Stethoscope size={28} />
                </div>
                <h1 style={{ fontSize: '2rem', marginBottom: 10 }}>Modulo Clinico</h1>
                <p style={{ color: 'var(--text-muted)', maxWidth: 760, marginBottom: 20 }}>
                    Dashboard propio para la operacion clinica, con una paleta mas sanitaria y un flujo separado del administrativo.
                </p>
                <div className="flex gap-12" style={{ flexWrap: 'wrap' }}>
                    {CLINICA_TABS.map(tab => {
                        const Icon = tab.icon
                        const active = tab.key === currentKey
                        return (
                            <button
                                key={tab.key}
                                type="button"
                                className={active ? 'btn btn-primary' : 'btn btn-secondary'}
                                onClick={() => onNavigate(tab.path)}
                                style={active ? { background: CLINICA_PALETTE.accentSoft, color: '#b6fff9', border: `1px solid ${CLINICA_PALETTE.accentBorder}` } : {}}
                            >
                                <Icon size={16} />
                                {tab.label}
                            </button>
                        )
                    })}
                </div>
            </div>
            {children}
        </div>
    )
}

function DashboardClinicoSection() {
    const { user } = useAuth()
    const queryClient = useQueryClient()
    const dashboardQuery = useQuery({
        queryKey: ['clinica', 'dashboard'],
        queryFn: async () => (await api.get('/clinica/dashboard/resumen')).data,
        staleTime: 60 * 1000,
    })
    const reminderQuery = useQuery({
        queryKey: ['clinica', 'agenda-recordatorios'],
        queryFn: async () => (await api.get('/clinica/agenda/recordatorios')).data,
        staleTime: 60 * 1000,
    })
    const upcomingControlsQuery = useQuery({
        queryKey: ['clinica', 'proximos-controles'],
        queryFn: async () => (await api.get('/clinica/agenda/proximos-controles?limit=6')).data,
        staleTime: 60 * 1000,
    })
    const [showReminderModal, setShowReminderModal] = useState(false)
    const [whatsappItem, setWhatsappItem] = useState(null)

    const markReminderMutation = useMutation({
        mutationFn: async item => {
            await api.post(`/clinica/agenda/${item.id}/recordatorios/${item.recordatorio_categoria}/recordado`)
        },
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['clinica', 'agenda-recordatorios'] }),
                queryClient.invalidateQueries({ queryKey: ['clinica', 'agenda'] }),
                queryClient.invalidateQueries({ queryKey: ['clinica', 'dashboard'] }),
            ])
        },
    })

    const reminderItems = flattenReminderBuckets(reminderQuery.data)

    useEffect(() => {
        if (!reminderItems.length) return
        const storageKey = getDailyReminderStorageKey(user)
        if (localStorage.getItem(storageKey) === '1') return
        setShowReminderModal(true)
        localStorage.setItem(storageKey, '1')
    }, [reminderItems.length, user])

    if (dashboardQuery.isLoading) {
        return <EmptyCard title="Cargando dashboard clinico" message="Estamos reuniendo la actividad de pacientes, consultas y alertas." />
    }

    if (dashboardQuery.isError) {
        return (
            <EmptyCard
                title="No se pudo cargar el dashboard clinico"
                message={formatError(dashboardQuery.error, 'No pudimos recuperar el resumen clinico.')}
                action={<button className="btn btn-primary" onClick={() => dashboardQuery.refetch()}><RefreshCcw size={16} /> Reintentar</button>}
            />
        )
    }

    const data = dashboardQuery.data

    return (
        <>
            <div
                className="dashboard-stats"
                style={{
                    marginTop: 22,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                    gap: 12,
                    alignItems: 'stretch',
                }}
            >
                <StatCard label="Pacientes" value={fmtNumber(data.total_pacientes)} detail={`${fmtNumber(data.pacientes_nuevos_mes)} nuevos en el mes`} accent={CLINICA_PALETTE.accent} />
                <StatCard label="Consultas hoy" value={fmtNumber(data.consultas_hoy)} detail={`${fmtNumber(data.consultas_semana)} en la semana`} accent={CLINICA_PALETTE.accentAlt} />
                <StatCard label="Doctores activos" value={fmtNumber(data.doctores_activos)} detail={`${fmtNumber(data.lugares_activos)} lugares activos`} accent="#f59e0b" />
                <StatCard label="Recetas del mes" value={fmtNumber(data.recetas_mes)} detail={`${fmtNumber(data.consultas_oftalmologia_mes)} oftalmologia / ${fmtNumber(data.consultas_contactologia_mes)} contactologia`} accent="#38bdf8" />
            </div>
            <div className="grid-2" style={{ marginTop: 22, alignItems: 'start' }}>
                <div className="card">
                    <SectionHeader title="Ultimas consultas" subtitle="Actividad reciente en el modulo clinico." />
                    <div style={{ display: 'grid', gap: 12 }}>
                        {data.recientes?.filter(Boolean)?.length ? data.recientes.filter(Boolean).map(item => (
                            <div key={`${item?.tipo}-${item?.id}`} className="card" style={{ padding: 16, background: 'rgba(255,255,255,0.02)' }}>
                                <div className="flex-between" style={{ gap: 12, alignItems: 'flex-start' }}>
                                    <div>
                                        <div style={{ fontWeight: 700 }}>{item?.paciente_nombre || 'Sin paciente'}</div>
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.86rem', marginTop: 4 }}>{item?.tipo || '-'} - {fmtDateTime(item?.fecha)}</div>
                                    </div>
                                    <span className={`badge ${item?.tipo === 'OFTALMOLOGIA' ? 'badge-blue' : 'badge-green'}`}>{item?.tipo || '-'}</span>
                                </div>
                                <div style={{ marginTop: 10, color: 'var(--text-muted)', fontSize: '0.92rem' }}>
                                    {item?.doctor_nombre || 'Sin doctor'} {item?.lugar_nombre ? `| ${item.lugar_nombre}` : ''}
                                </div>
                                {item?.resumen && <div style={{ marginTop: 8 }}>{item.resumen}</div>}
                            </div>
                        )) : <div style={{ color: 'var(--text-muted)' }}>Todavia no hay consultas registradas.</div>}
                    </div>
                </div>
                <div className="card">
                    <SectionHeader title="Alertas clinicas" subtitle="Mensajes utiles para el trabajo diario." />
                    <div style={{ display: 'grid', gap: 12 }}>
                        <div style={{ border: '1px solid rgba(29,211,199,0.25)', borderRadius: 14, padding: 16, background: 'rgba(29,211,199,0.06)' }}>
                            <div className="flex-between" style={{ gap: 12, alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontWeight: 700, color: CLINICA_PALETTE.accent }}>Proximos controles</div>
                                    <div style={{ marginTop: 6, color: 'var(--text-muted)' }}>
                                        Seguimientos clinicos proximos ya generados en la agenda.
                                    </div>
                                </div>
                            </div>
                            <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
                                {upcomingControlsQuery.isLoading ? (
                                    <div style={{ color: 'var(--text-muted)' }}>Cargando proximos controles...</div>
                                ) : upcomingControlsQuery.data?.length ? upcomingControlsQuery.data.map(item => (
                                    <div key={item.id} className="card" style={{ padding: 14, background: 'rgba(255,255,255,0.02)' }}>
                                        <div className="flex-between" style={{ gap: 12, alignItems: 'flex-start' }}>
                                            <div>
                                                <div style={{ fontWeight: 700 }}>{item.paciente_nombre}</div>
                                                <div style={{ marginTop: 4, color: 'var(--text-muted)', fontSize: '0.86rem' }}>
                                                    {fmtDateTime(item.fecha_hora)} {typeof item.dias_restantes === 'number' ? `- faltan ${item.dias_restantes} dia(s)` : ''}
                                                </div>
                                                <div style={{ marginTop: 4, color: 'var(--text-muted)', fontSize: '0.86rem' }}>
                                                    {item.doctor_nombre || 'Sin doctor'} {item.lugar_nombre ? `| ${item.lugar_nombre}` : ''}
                                                </div>
                                            </div>
                                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setWhatsappItem(item)}>
                                                <MessageCircle size={14} /> WhatsApp
                                            </button>
                                        </div>
                                    </div>
                                )) : (
                                    <div style={{ color: 'var(--text-muted)' }}>No hay proximos controles pendientes en agenda.</div>
                                )}
                            </div>
                        </div>
                        {reminderItems.length ? (
                            <div style={{ border: '1px solid rgba(56,189,248,0.35)', borderRadius: 14, padding: 16, background: 'rgba(56,189,248,0.08)' }}>
                                <div className="flex-between" style={{ gap: 12, alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontWeight: 700, color: '#38bdf8' }}>Recordatorios clinicos pendientes</div>
                                        <div style={{ marginTop: 6, color: 'var(--text-muted)' }}>
                                            Tienes {reminderItems.length} recordatorio(s) pendientes entre hoy, 8 dias y 15 dias.
                                        </div>
                                    </div>
                                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowReminderModal(true)}>
                                        Ver recordatorios
                                    </button>
                                </div>
                            </div>
                        ) : null}
                        {data.alertas?.length ? data.alertas.map((alerta, idx) => (
                            <div key={`${alerta.tipo}-${idx}`} style={{ border: `1px solid ${alerta.color}55`, borderRadius: 14, padding: 16, background: `${alerta.color}12` }}>
                                <div style={{ fontWeight: 700, color: alerta.color }}>{alerta.titulo}</div>
                                <div style={{ marginTop: 6, color: 'var(--text-muted)' }}>{alerta.mensaje}</div>
                            </div>
                        )) : <div style={{ color: 'var(--text-muted)' }}>Sin alertas por ahora.</div>}
                    </div>
                </div>
            </div>
            {showReminderModal && reminderItems.length ? (
                <Modal title="Recordatorios clinicos pendientes" onClose={() => setShowReminderModal(false)} maxWidth="920px">
                    <ReminderCards
                        items={reminderItems}
                        onMarkRemembered={item => markReminderMutation.mutate(item)}
                        onOpenWhatsappEditor={item => setWhatsappItem(item)}
                        actionPendingId={markReminderMutation.variables?.id}
                    />
                </Modal>
            ) : null}
            {whatsappItem ? <WhatsappMessageModal item={whatsappItem} onClose={() => setWhatsappItem(null)} /> : null}
        </>
    )
}

function TurnoClinicoForm({
    initialData,
    pacienteOptions,
    doctorOptions,
    lugarOptions,
    onSearchPaciente,
    pacienteLoading,
    onSave,
    onCancel,
    saving,
}) {
    const [form, setForm] = useState(() => ({
        paciente: initialData?.paciente_id
            ? {
                id: initialData.paciente_id,
                nombre_completo: initialData.paciente_nombre,
                ci_pasaporte: initialData.paciente_ci,
            }
            : null,
        paciente_nombre_libre: initialData?.paciente_nombre_libre || (!initialData?.paciente_id ? initialData?.paciente_nombre || '' : ''),
        doctor_id: initialData?.doctor_id || '',
        lugar_atencion_id: initialData?.lugar_atencion_id || '',
        fecha_hora: initialData?.fecha_hora ? String(initialData.fecha_hora).slice(0, 16) : new Date().toISOString().slice(0, 16),
        estado: initialData?.estado || 'PENDIENTE',
        motivo: initialData?.motivo || '',
        notas: initialData?.notas || '',
    }))

    useEffect(() => {
        setForm({
            paciente: initialData?.paciente_id
                ? {
                    id: initialData.paciente_id,
                    nombre_completo: initialData.paciente_nombre,
                    ci_pasaporte: initialData.paciente_ci,
                }
                : null,
            paciente_nombre_libre: initialData?.paciente_nombre_libre || (!initialData?.paciente_id ? initialData?.paciente_nombre || '' : ''),
            doctor_id: initialData?.doctor_id || '',
            lugar_atencion_id: initialData?.lugar_atencion_id || '',
            fecha_hora: initialData?.fecha_hora ? String(initialData.fecha_hora).slice(0, 16) : new Date().toISOString().slice(0, 16),
            estado: initialData?.estado || 'PENDIENTE',
            motivo: initialData?.motivo || '',
            notas: initialData?.notas || '',
        })
    }, [initialData])

    const submit = event => {
        event.preventDefault()
        if (!form.paciente?.id && !form.paciente_nombre_libre.trim()) {
            window.alert('Debes seleccionar un paciente o cargar un nombre temporal.')
            return
        }
        onSave({
            paciente_id: form.paciente?.id || null,
            paciente_nombre_libre: form.paciente?.id ? null : (form.paciente_nombre_libre.trim() || null),
            doctor_id: form.doctor_id === '' ? null : Number(form.doctor_id),
            lugar_atencion_id: form.lugar_atencion_id === '' ? null : Number(form.lugar_atencion_id),
            fecha_hora: new Date(form.fecha_hora).toISOString(),
            estado: form.estado,
            motivo: form.motivo.trim() || null,
            notas: form.notas.trim() || null,
        })
    }

    return (
        <form onSubmit={submit}>
            <div className="grid-2">
                <div className="form-group">
                    <label className="form-label">Paciente</label>
                    <RemoteSearchSelect
                        value={form.paciente}
                        onChange={option => setForm(prev => ({ ...prev, paciente: option, paciente_nombre_libre: option ? '' : prev.paciente_nombre_libre }))}
                        onSearch={onSearchPaciente}
                        options={pacienteOptions}
                        loading={pacienteLoading}
                        placeholder="Buscar paciente..."
                        promptMessage="Escriba para buscar paciente"
                        emptyMessage="Sin pacientes"
                        minChars={0}
                        floating={false}
                        getOptionLabel={option => option?.nombre_completo || ''}
                        getOptionValue={option => option?.id}
                    />
                    <div style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                        Si todavia no existe, puedes dejar este campo vacio y usar un nombre temporal.
                    </div>
                </div>
                <div className="form-group">
                    <label className="form-label">Fecha y hora</label>
                    <input className="form-input" type="datetime-local" value={form.fecha_hora} onChange={event => setForm(prev => ({ ...prev, fecha_hora: event.target.value }))} />
                </div>
                <div className="form-group">
                    <label className="form-label">Nombre temporal del turno</label>
                    <input
                        className="form-input"
                        value={form.paciente_nombre_libre}
                        onChange={event => setForm(prev => ({ ...prev, paciente_nombre_libre: event.target.value, paciente: null }))}
                        placeholder="Ej.: Juan Perez"
                        disabled={Boolean(form.paciente?.id)}
                    />
                </div>
                <div className="form-group">
                    <label className="form-label">Doctor</label>
                    <select className="form-select" value={form.doctor_id} onChange={event => setForm(prev => ({ ...prev, doctor_id: event.target.value }))}>
                        <option value="">Sin doctor</option>
                        {doctorOptions.map(item => <option key={item.id} value={item.id}>{item.nombre_completo}</option>)}
                    </select>
                </div>
                <div className="form-group">
                    <label className="form-label">Lugar de atencion</label>
                    <select className="form-select" value={form.lugar_atencion_id} onChange={event => setForm(prev => ({ ...prev, lugar_atencion_id: event.target.value }))}>
                        <option value="">Sin lugar</option>
                        {lugarOptions.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}
                    </select>
                </div>
                <div className="form-group">
                    <label className="form-label">Estado</label>
                    <select className="form-select" value={form.estado} onChange={event => setForm(prev => ({ ...prev, estado: event.target.value }))}>
                        {ESTADOS_TURNO.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                </div>
                <div className="form-group">
                    <label className="form-label">Motivo breve</label>
                    <input className="form-input" value={form.motivo} onChange={event => setForm(prev => ({ ...prev, motivo: event.target.value }))} />
                </div>
            </div>
            <div className="form-group">
                <label className="form-label">Notas</label>
                <textarea className="form-input" value={form.notas} onChange={event => setForm(prev => ({ ...prev, notas: event.target.value }))} style={{ minHeight: 96, resize: 'none' }} />
            </div>
            <div className="flex gap-12" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
                <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar turno'}</button>
            </div>
        </form>
    )
}

function AgendaClinicaSection() {
    const { user } = useAuth()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const today = useMemo(() => new Date(), [])
    const plusDays = useMemo(() => {
        const next = new Date(today)
        next.setDate(next.getDate() + 7)
        return next.toISOString().slice(0, 10)
    }, [today])
    const [buscar, setBuscar] = useState('')
    const [estado, setEstado] = useState('')
    const [recordatorioFiltro, setRecordatorioFiltro] = useState('')
    const [fechaDesde, setFechaDesde] = useState(today.toISOString().slice(0, 10))
    const [fechaHasta, setFechaHasta] = useState(plusDays)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(25)
    const [modalTurno, setModalTurno] = useState(null)
    const [pacienteSearch, setPacienteSearch] = useState('')
    const [whatsappItem, setWhatsappItem] = useState(null)

    const agendaQuery = useQuery({
        queryKey: ['clinica', 'agenda', { buscar, estado, recordatorioFiltro, fechaDesde, fechaHasta, page, pageSize }],
        queryFn: async () => (
            await api.get(`/clinica/agenda?${queryString({
                buscar,
                estado,
                recordatorio: recordatorioFiltro || null,
                fecha_desde: fechaDesde,
                fecha_hasta: fechaHasta,
                page,
                page_size: pageSize,
            })}`)
        ).data,
    })

    const reminderQuery = useQuery({
        queryKey: ['clinica', 'agenda-recordatorios'],
        queryFn: async () => (await api.get('/clinica/agenda/recordatorios')).data,
        staleTime: 60 * 1000,
    })

    const pacientesQuery = useQuery({
        queryKey: ['clinica', 'agenda-pacientes', pacienteSearch],
        queryFn: async () => (await api.get(`/clinica/pacientes?${queryString({ buscar: pacienteSearch, page: 1, page_size: 12 })}`)).data,
        enabled: Boolean(modalTurno),
        staleTime: 60 * 1000,
    })

    const doctoresQuery = useQuery({
        queryKey: ['clinica', 'doctores-simple'],
        queryFn: async () => (await api.get('/clinica/doctores/simple')).data,
        enabled: hasActionAccess(user, 'clinica.doctores', 'clinica'),
        staleTime: 5 * 60 * 1000,
    })

    const lugaresQuery = useQuery({
        queryKey: ['clinica', 'lugares-simple'],
        queryFn: async () => (await api.get('/clinica/lugares/simple')).data,
        enabled: hasActionAccess(user, 'clinica.lugares', 'clinica'),
        staleTime: 5 * 60 * 1000,
    })

    const saveTurnoMutation = useMutation({
        mutationFn: async payload => {
            if (modalTurno?.mode === 'edit') return (await api.put(`/clinica/agenda/${modalTurno.data.id}`, payload)).data
            return (await api.post('/clinica/agenda', payload)).data
        },
        onSuccess: async () => {
            setModalTurno(null)
            setPacienteSearch('')
            await queryClient.invalidateQueries({ queryKey: ['clinica', 'agenda'] })
            await queryClient.invalidateQueries({ queryKey: ['clinica', 'agenda-recordatorios'] })
            await queryClient.invalidateQueries({ queryKey: ['clinica', 'dashboard'] })
        },
    })

    const deleteTurnoMutation = useMutation({
        mutationFn: async turnoId => { await api.delete(`/clinica/agenda/${turnoId}`) },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['clinica', 'agenda'] })
            await queryClient.invalidateQueries({ queryKey: ['clinica', 'agenda-recordatorios'] })
            await queryClient.invalidateQueries({ queryKey: ['clinica', 'dashboard'] })
        },
    })

    const cambiarEstadoMutation = useMutation({
        mutationFn: async ({ item, nextEstado }) => (
            await api.put(`/clinica/agenda/${item.id}`, {
                paciente_id: item.paciente_id,
                paciente_nombre_libre: item.paciente_nombre_libre,
                doctor_id: item.doctor_id,
                lugar_atencion_id: item.lugar_atencion_id,
                fecha_hora: item.fecha_hora,
                estado: nextEstado,
                motivo: item.motivo,
                notas: item.notas,
            })
        ).data,
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['clinica', 'agenda'] })
            await queryClient.invalidateQueries({ queryKey: ['clinica', 'agenda-recordatorios'] })
            await queryClient.invalidateQueries({ queryKey: ['clinica', 'dashboard'] })
        },
    })

    const atenderTurno = async item => {
        try {
            const actualizado = await cambiarEstadoMutation.mutateAsync({ item, nextEstado: 'ATENDIDO' })
            if (actualizado?.paciente_id) {
                navigate('/clinica/consulta', {
                    state: {
                        selectedPatient: {
                            id: actualizado.paciente_id,
                            nombre_completo: actualizado.paciente_nombre,
                            ci_pasaporte: actualizado.paciente_ci || null,
                        },
                        autoOpenConsulta: true,
                        agendaTurnoId: actualizado?.id || item.id,
                    },
                })
                return
            }
            navigate('/clinica/pacientes', {
                state: {
                    openNewFromAgenda: {
                        agendaTurnoId: actualizado?.id || item.id,
                        nombre_completo: actualizado?.paciente_nombre || item.paciente_nombre || '',
                        turno: actualizado || { ...item, estado: 'ATENDIDO' },
                    },
                },
            })
        } catch (error) {
            window.alert(formatError(error, 'No se pudo marcar el turno como atendido.'))
        }
    }

    const items = agendaQuery.data?.items || []
    const reminderBuckets = reminderQuery.data || { hoy: [], ocho_dias: [], quince_dias: [] }
    const aplicarFiltroRapido = tipo => {
        const base = new Date()
        const from = new Date(base)
        const to = new Date(base)
        if (tipo === 'manana') {
            from.setDate(from.getDate() + 1)
            to.setDate(to.getDate() + 1)
        } else if (tipo === 'semana') {
            to.setDate(to.getDate() + 7)
        }
        setFechaDesde(from.toISOString().slice(0, 10))
        setFechaHasta(to.toISOString().slice(0, 10))
        setRecordatorioFiltro('')
        setPage(1)
    }

    const aplicarFiltroRecordatorio = tipo => {
        setRecordatorioFiltro(tipo)
        setFechaDesde('')
        setFechaHasta('')
        setPage(1)
    }

    return (
        <>
            <div className="card" style={{ marginTop: 22 }}>
                <SectionHeader
                    title="Agenda Clinica"
                    subtitle="Base operativa de turnos por paciente, doctor, lugar, fecha y estado."
                    actions={hasActionAccess(user, 'clinica.consultas_crear', 'clinica') ? <button className="btn btn-primary" onClick={() => setModalTurno({ mode: 'create', data: null })}><Plus size={16} /> Nuevo turno</button> : null}
                />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
                    {[
                        { key: '15', title: 'Recordar en 15 dias', items: reminderBuckets.quince_dias || [], color: '#a78bfa' },
                        { key: '8', title: 'Recordar en 8 dias', items: reminderBuckets.ocho_dias || [], color: '#f59e0b' },
                        { key: 'hoy', title: 'Recordar hoy', items: reminderBuckets.hoy || [], color: '#38bdf8' },
                    ].map(bucket => (
                        <div key={bucket.key} className="card" style={{ padding: 14, background: `${bucket.color}12`, border: `1px solid ${bucket.color}44` }}>
                            <div className="flex-between" style={{ gap: 12, alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontWeight: 700, color: bucket.color }}>{bucket.title}</div>
                                    <div style={{ marginTop: 6, fontSize: '1.2rem', fontWeight: 800 }}>{bucket.items.length}</div>
                                </div>
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => aplicarFiltroRecordatorio(bucket.key)}
                                >
                                    Ver lista
                                </button>
                            </div>
                            <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
                                {reminderQuery.isLoading ? (
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.86rem' }}>Cargando...</div>
                                ) : bucket.items.length ? bucket.items.slice(0, 3).map(item => (
                                    <div key={item.id} style={{ color: 'var(--text-muted)', fontSize: '0.86rem' }}>
                                        {item.paciente_nombre} - {fmtDate(item.fecha_hora)}
                                    </div>
                                )) : (
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.86rem' }}>Sin recordatorios en esta ventana.</div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="filters-bar" style={{ marginBottom: 18, alignItems: 'end' }}>
                    <div className="form-group" style={{ flex: 1, minWidth: 240 }}>
                        <label className="form-label">Buscar</label>
                        <input className="form-input" value={buscar} onChange={event => { setBuscar(event.target.value); setPage(1) }} placeholder="Paciente, CI, telefono o motivo..." />
                    </div>
                    <div className="form-group" style={{ width: 160 }}>
                        <label className="form-label">Estado</label>
                        <select className="form-select" value={estado} onChange={event => { setEstado(event.target.value); setPage(1) }}>
                            <option value="">Todos</option>
                            {ESTADOS_TURNO.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                        </select>
                    </div>
                    <div className="form-group" style={{ width: 170 }}>
                        <label className="form-label">Desde</label>
                        <input className="form-input" type="date" value={fechaDesde} onChange={event => { setFechaDesde(event.target.value); setPage(1) }} />
                    </div>
                    <div className="form-group" style={{ width: 170 }}>
                        <label className="form-label">Hasta</label>
                        <input className="form-input" type="date" value={fechaHasta} onChange={event => { setFechaHasta(event.target.value); setPage(1) }} />
                    </div>
                    <select className="form-select" style={{ width: 130 }} value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1) }}>
                        <option value={10}>10 / pag.</option>
                        <option value={25}>25 / pag.</option>
                        <option value={50}>50 / pag.</option>
                    </select>
                </div>
                <div className="flex gap-12" style={{ marginBottom: 18, flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => aplicarFiltroRapido('hoy')}>Hoy</button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => aplicarFiltroRapido('manana')}>Manana</button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => aplicarFiltroRapido('semana')}>Prox. 7 dias</button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => aplicarFiltroRecordatorio('15')}>Recordatorios 15 dias</button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => aplicarFiltroRecordatorio('8')}>Recordatorios 8 dias</button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => aplicarFiltroRecordatorio('hoy')}>Recordatorios hoy</button>
                    {recordatorioFiltro ? (
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                                setRecordatorioFiltro('')
                                setFechaDesde(today.toISOString().slice(0, 10))
                                setFechaHasta(plusDays)
                                setPage(1)
                            }}
                        >
                            Limpiar recordatorio
                        </button>
                    ) : null}
                </div>
                {recordatorioFiltro ? (
                    <div className="alert alert-info" style={{ marginBottom: 18 }}>
                        Mostrando bandeja interna de recordatorios para {recordatorioFiltro === '15' ? '15 dias' : recordatorioFiltro === '8' ? '8 dias' : 'hoy'}.
                    </div>
                ) : null}

                {agendaQuery.isLoading ? (
                    <div className="empty-state" style={{ padding: '60px 20px' }}>Cargando agenda clinica...</div>
                ) : agendaQuery.isError ? (
                    <div className="alert alert-error">{formatError(agendaQuery.error, 'No se pudo cargar la agenda clinica.')}</div>
                ) : (
                    <>
                        <div className="table-container">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Fecha y hora</th>
                                        <th>Paciente</th>
                                        <th>Doctor</th>
                                        <th>Lugar</th>
                                        <th>Motivo</th>
                                        <th>Estado</th>
                                        <th style={{ width: 150 }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.length ? items.map(item => (
                                        <tr key={item.id}>
                                            <td>{fmtDateTime(item.fecha_hora)}</td>
                                            <td style={{ fontWeight: 700 }}>{item.paciente_nombre}</td>
                                            <td>{item.doctor_nombre || '-'}</td>
                                            <td>{item.lugar_nombre || '-'}</td>
                                            <td>
                                                <div>{item.motivo || '-'}</div>
                                                {item.es_control ? (
                                                    <div style={{ marginTop: 6, color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                                                        Seguimiento {typeof item.dias_restantes === 'number' ? `- faltan ${item.dias_restantes} dia(s)` : ''}
                                                    </div>
                                                ) : null}
                                            </td>
                                            <td><span className={`badge ${item.estado === 'ATENDIDO' ? 'badge-green' : item.estado === 'CANCELADO' ? 'badge-gray' : 'badge-blue'}`}>{item.estado}</span></td>
                                            <td>
                                                <TurnoAgendaActions
                                                    item={item}
                                                    disabled={cambiarEstadoMutation.isPending || deleteTurnoMutation.isPending}
                                                    onEditar={() => setModalTurno({ mode: 'edit', data: item })}
                                                    onConfirmar={() => cambiarEstadoMutation.mutate({ item, nextEstado: 'CONFIRMADO' })}
                                                    onAtender={() => atenderTurno(item)}
                                                    onCancelar={() => cambiarEstadoMutation.mutate({ item, nextEstado: 'CANCELADO' })}
                                                    onReprogramar={() => setModalTurno({ mode: 'edit', data: item })}
                                                    onWhatsapp={() => setWhatsappItem(item)}
                                                    onEliminar={() => {
                                                        if (!window.confirm('Se eliminara este turno. Desea continuar?')) return
                                                        deleteTurnoMutation.mutate(item.id)
                                                    }}
                                                />
                                            </td>
                                        </tr>
                                    )) : <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No hay turnos para los filtros seleccionados.</td></tr>}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex-between" style={{ marginTop: 16, gap: 16, flexWrap: 'wrap' }}>
                            <div style={{ color: 'var(--text-muted)' }}>Mostrando pagina {agendaQuery.data.page} de {agendaQuery.data.total_pages} - {agendaQuery.data.total} turnos</div>
                            <div className="flex gap-12">
                                <button className="btn btn-secondary" onClick={() => setPage(prev => Math.max(1, prev - 1))} disabled={page <= 1}>Anterior</button>
                                <button className="btn btn-secondary" onClick={() => setPage(prev => Math.min(agendaQuery.data.total_pages, prev + 1))} disabled={page >= agendaQuery.data.total_pages}>Siguiente</button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {modalTurno && (
                <Modal title={modalTurno.mode === 'edit' ? 'Editar turno clinico' : 'Nuevo turno clinico'} onClose={() => setModalTurno(null)} maxWidth="860px">
                    <TurnoClinicoForm
                        initialData={modalTurno.data}
                        pacienteOptions={pacientesQuery.data?.items || []}
                        doctorOptions={doctoresQuery.data || []}
                        lugarOptions={lugaresQuery.data || []}
                        onSearchPaciente={setPacienteSearch}
                        pacienteLoading={pacientesQuery.isFetching}
                        onSave={payload => saveTurnoMutation.mutate(payload)}
                        onCancel={() => setModalTurno(null)}
                        saving={saveTurnoMutation.isPending}
                    />
                </Modal>
            )}
            {whatsappItem ? <WhatsappMessageModal item={whatsappItem} onClose={() => setWhatsappItem(null)} /> : null}
        </>
    )
}

function PacienteForm({ initialData, referidorOptions, onSearchReferidor, referidorLoading, onSave, onCancel, saving }) {
    const [form, setForm] = useState(() => ({
        nombre_completo: initialData?.nombre_completo || '',
        ci_pasaporte: initialData?.ci_pasaporte || '',
        fecha_nacimiento: initialData?.fecha_nacimiento ? String(initialData.fecha_nacimiento).slice(0, 10) : '',
        edad_manual: initialData?.fecha_nacimiento ? '' : (initialData?.edad_manual ?? ''),
        telefono: initialData?.telefono || '',
        direccion: initialData?.direccion || '',
        referidor: initialData?.referidor_id ? { id: initialData.referidor_id, nombre: initialData.referidor_nombre || 'Referidor' } : null,
        notas: initialData?.notas || '',
    }))
    const [error, setError] = useState('')

    useEffect(() => {
        if (form.fecha_nacimiento) {
            setForm(prev => ({ ...prev, edad_manual: '' }))
        }
    }, [form.fecha_nacimiento])

    const edadCalculada = calcAge(form.fecha_nacimiento)

    const submit = event => {
        event.preventDefault()
        if (!form.nombre_completo.trim()) {
            setError('Debe ingresar el nombre del paciente.')
            return
        }
        setError('')
        onSave({
            nombre_completo: form.nombre_completo.trim(),
            ci_pasaporte: form.ci_pasaporte.trim() || null,
            fecha_nacimiento: form.fecha_nacimiento || null,
            edad_manual: form.fecha_nacimiento ? null : (form.edad_manual === '' ? null : Number(form.edad_manual)),
            telefono: form.telefono.trim() || null,
            direccion: form.direccion.trim() || null,
            referidor_id: form.referidor?.id || null,
            notas: form.notas.trim() || null,
        })
    }

    return (
        <form onSubmit={submit}>
            <div className="form-group">
                <label className="form-label">Nombre completo</label>
                <input className="form-input" value={form.nombre_completo} onChange={event => setForm(prev => ({ ...prev, nombre_completo: event.target.value }))} required />
            </div>
            <div className="grid-2">
                <div className="form-group">
                    <label className="form-label">CI / Pasaporte</label>
                    <input className="form-input" value={form.ci_pasaporte} onChange={event => setForm(prev => ({ ...prev, ci_pasaporte: event.target.value }))} />
                </div>
                <div className="form-group">
                    <label className="form-label">Fecha de nacimiento</label>
                    <input className="form-input" type="date" value={form.fecha_nacimiento} onChange={event => setForm(prev => ({ ...prev, fecha_nacimiento: event.target.value }))} />
                </div>
                <div className="form-group">
                    <label className="form-label">{form.fecha_nacimiento ? 'Edad calculada' : 'Edad manual'}</label>
                    <input className="form-input" type="number" min="0" value={form.fecha_nacimiento ? edadCalculada : form.edad_manual} onChange={event => setForm(prev => ({ ...prev, edad_manual: event.target.value }))} readOnly={Boolean(form.fecha_nacimiento)} />
                </div>
                <div className="form-group">
                    <label className="form-label">Telefono</label>
                    <input className="form-input" value={form.telefono} onChange={event => setForm(prev => ({ ...prev, telefono: event.target.value }))} />
                </div>
            </div>
            <div className="form-group">
                <label className="form-label">Direccion</label>
                <input className="form-input" value={form.direccion} onChange={event => setForm(prev => ({ ...prev, direccion: event.target.value }))} />
            </div>
            <div className="form-group">
                <label className="form-label">Referidor</label>
                <RemoteSearchSelect
                    value={form.referidor}
                    onChange={option => setForm(prev => ({ ...prev, referidor: option }))}
                    onSearch={onSearchReferidor}
                    options={referidorOptions}
                    loading={referidorLoading}
                    placeholder="Buscar referidor..."
                    promptMessage="Seleccione o escriba para buscar referidor"
                    emptyMessage="Sin referidores"
                    minChars={0}
                    getOptionLabel={option => option?.nombre || ''}
                    getOptionValue={option => option?.id}
                />
            </div>
            <div className="form-group">
                <label className="form-label">Notas</label>
                <textarea className="form-input" value={form.notas} onChange={event => setForm(prev => ({ ...prev, notas: event.target.value }))} style={{ minHeight: 110, resize: 'none', width: '100%' }} />
            </div>
            {error && <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>}
            <div className="flex gap-12" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
                <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar paciente'}</button>
            </div>
        </form>
    )
}

function ConsultaClinicaForm({ type, initialData, pacienteId, doctores, lugares, onSave, onCancel, saving, savingText = 'Guardando...', readOnly = false, saved = false }) {
    const buildFormState = useMemo(() => {
        const fechaBase = initialData?.fecha ? String(initialData.fecha).slice(0, 16) : new Date().toISOString().slice(0, 16)
        const fechaBaseControl = fechaBase ? fechaBase.slice(0, 10) : formatDateInputValue(new Date())
        return ({
        fecha: fechaBase,
        doctor_id: initialData?.doctor_id || '',
        lugar_atencion_id: initialData?.lugar_atencion_id || '',
        motivo: initialData?.motivo || '',
        diagnostico: initialData?.diagnostico || '',
        plan_tratamiento: initialData?.plan_tratamiento || '',
        tipo_lente: initialData?.tipo_lente || '',
        material_lente: initialData?.material_lente || '',
        tratamientos: initialData?.tratamientos || '',
        av_sc_lejos_od: initialData?.av_sc_lejos_od || '',
        av_sc_lejos_oi: initialData?.av_sc_lejos_oi || '',
        av_cc_lejos_od: initialData?.av_cc_lejos_od || '',
        av_cc_lejos_oi: initialData?.av_cc_lejos_oi || '',
        ref_od_esfera: initialData?.ref_od_esfera || '',
        ref_od_cilindro: initialData?.ref_od_cilindro || '',
        ref_od_eje: initialData?.ref_od_eje || '',
        ref_od_adicion: initialData?.ref_od_adicion || '',
        ref_oi_esfera: initialData?.ref_oi_esfera || '',
        ref_oi_cilindro: initialData?.ref_oi_cilindro || '',
        ref_oi_eje: initialData?.ref_oi_eje || '',
        ref_oi_adicion: initialData?.ref_oi_adicion || '',
        examen_refraccion: initialData?.examen_refraccion ?? true,
        examen_biomicroscopia: Boolean(initialData?.examen_biomicroscopia),
        examen_oftalmoscopia: Boolean(initialData?.examen_oftalmoscopia),
        examen_tonometria: Boolean(initialData?.examen_tonometria),
        examen_campo_visual: Boolean(initialData?.examen_campo_visual),
        examen_oct: Boolean(initialData?.examen_oct),
        examen_retinografia: Boolean(initialData?.examen_retinografia),
        examen_paquimetria: Boolean(initialData?.examen_paquimetria),
        examen_topografia: Boolean(initialData?.examen_topografia),
        examen_gonioscopia: Boolean(initialData?.examen_gonioscopia),
        examen_angiofluoresceinografia: Boolean(initialData?.examen_angiofluoresceinografia),
        examen_cicloplegia: Boolean(initialData?.examen_cicloplegia),
        biomicroscopia_parpados: initialData?.biomicroscopia_parpados || '',
        biomicroscopia_conjuntiva: initialData?.biomicroscopia_conjuntiva || '',
        biomicroscopia_cornea: initialData?.biomicroscopia_cornea || '',
        biomicroscopia_camara_anterior: initialData?.biomicroscopia_camara_anterior || '',
        biomicroscopia_iris: initialData?.biomicroscopia_iris || '',
        biomicroscopia_cristalino: initialData?.biomicroscopia_cristalino || '',
        tonometria_od: initialData?.tonometria_od || '',
        tonometria_oi: initialData?.tonometria_oi || '',
        tonometria_metodo: initialData?.tonometria_metodo || '',
        campo_visual_tipo: initialData?.campo_visual_tipo || '',
        campo_visual_od: initialData?.campo_visual_od || '',
        campo_visual_oi: initialData?.campo_visual_oi || '',
        oct_tipo: initialData?.oct_tipo || '',
        oct_hallazgos: initialData?.oct_hallazgos || '',
        retinografia_hallazgos: initialData?.retinografia_hallazgos || '',
        paquimetria_od: initialData?.paquimetria_od || '',
        paquimetria_oi: initialData?.paquimetria_oi || '',
        topografia_tipo: initialData?.topografia_tipo || '',
        topografia_hallazgos: initialData?.topografia_hallazgos || '',
        gonioscopia_od: initialData?.gonioscopia_od || '',
        gonioscopia_oi: initialData?.gonioscopia_oi || '',
        gonioscopia_hallazgos: initialData?.gonioscopia_hallazgos || '',
        angiofluoresceinografia_hallazgos: initialData?.angiofluoresceinografia_hallazgos || '',
        cicloplegia_medicamento: initialData?.cicloplegia_medicamento || '',
        cicloplegia_dosis: initialData?.cicloplegia_dosis || '',
        cicloplegia_od_esfera: initialData?.cicloplegia_od_esfera || '',
        cicloplegia_od_cilindro: initialData?.cicloplegia_od_cilindro || '',
        cicloplegia_od_eje: initialData?.cicloplegia_od_eje || '',
        cicloplegia_oi_esfera: initialData?.cicloplegia_oi_esfera || '',
        cicloplegia_oi_cilindro: initialData?.cicloplegia_oi_cilindro || '',
        cicloplegia_oi_eje: initialData?.cicloplegia_oi_eje || '',
        estudios_solicitados: initialData?.estudios_solicitados || '',
        observaciones: initialData?.observaciones || '',
        diseno: initialData?.diseno || '',
        resumen_resultados: initialData?.resumen_resultados || '',
        marca_recomendada: initialData?.marca_recomendada || '',
        fecha_control: initialData?.fecha_control
            ? String(initialData.fecha_control).slice(0, 10)
            : (initialData?.id ? '' : addMonthsToDateInput(fechaBaseControl, 12)),
    })
    }, [initialData])
    const [form, setForm] = useState(buildFormState)
    const [recommendation, setRecommendation] = useState(() => parseRecommendationState(initialData))
    const [patologiaSearch, setPatologiaSearch] = useState('')
    const [patologiaSeleccionada, setPatologiaSeleccionada] = useState(null)

    useEffect(() => {
        setForm(buildFormState)
    }, [buildFormState])

    useEffect(() => {
        setRecommendation(parseRecommendationState(initialData))
    }, [initialData])

    const patologiasQuery = useQuery({
        queryKey: ['clinica', 'patologias-simple', patologiaSearch],
        queryFn: async () => (await api.get(`/clinica/vademecum/patologias/simple?${queryString({ buscar: patologiaSearch, page_size: 12 })}`)).data,
        enabled: type === 'OFTALMOLOGIA',
    })

    const patologiaDetalleQuery = useQuery({
        queryKey: ['clinica', 'patologia-detalle', patologiaSeleccionada?.id],
        queryFn: async () => (await api.get(`/clinica/vademecum/patologias/${patologiaSeleccionada.id}`)).data,
        enabled: type === 'OFTALMOLOGIA' && Boolean(patologiaSeleccionada?.id),
    })

    const importarPatologia = () => {
        if (!patologiaSeleccionada) return
        const source = patologiaDetalleQuery.data || patologiaSeleccionada
        setForm(prev => ({
            ...prev,
            diagnostico: prev.diagnostico?.trim()
                ? prev.diagnostico
                : (source.nombre || ''),
            motivo: prev.motivo?.trim()
                ? prev.motivo
                : (source.sintomas || prev.motivo),
            plan_tratamiento: prev.plan_tratamiento?.trim()
                ? prev.plan_tratamiento
                : (source.tratamiento_no_farmacologico || prev.plan_tratamiento),
        }))
    }

    const toggleDiagnosticoFrecuente = label => {
        setForm(prev => {
            const current = splitCommaValues(prev.diagnostico)
            const exists = current.some(item => item.toUpperCase() === label.toUpperCase())
            const next = exists
                ? current.filter(item => item.toUpperCase() !== label.toUpperCase())
                : [...current, label]
            return {
                ...prev,
                diagnostico: next.join(', '),
            }
        })
    }

    const submit = event => {
        event.preventDefault()
        if (readOnly) return
        const recommendationPayload = buildRecommendationPayload(recommendation)
        const consultaPayload = {
            paciente_id: pacienteId,
            doctor_id: form.doctor_id === '' ? null : Number(form.doctor_id),
            lugar_atencion_id: form.lugar_atencion_id === '' ? null : Number(form.lugar_atencion_id),
            fecha: form.fecha ? new Date(form.fecha).toISOString() : null,
            motivo: type === 'OFTALMOLOGIA' ? (form.motivo || null) : undefined,
            diagnostico: form.diagnostico || null,
            plan_tratamiento: form.plan_tratamiento || null,
            tipo_lente: type === 'OFTALMOLOGIA' ? (recommendationPayload.tipo_lente || null) : (form.tipo_lente || null),
            material_lente: type === 'OFTALMOLOGIA' ? (recommendationPayload.material_lente || null) : undefined,
            tratamientos: type === 'OFTALMOLOGIA' ? (recommendationPayload.tratamientos || null) : undefined,
            fecha_control: form.fecha_control || null,
            av_sc_lejos_od: type === 'OFTALMOLOGIA' ? (form.av_sc_lejos_od || null) : undefined,
            av_sc_lejos_oi: type === 'OFTALMOLOGIA' ? (form.av_sc_lejos_oi || null) : undefined,
            av_cc_lejos_od: type === 'OFTALMOLOGIA' ? (form.av_cc_lejos_od || null) : undefined,
            av_cc_lejos_oi: type === 'OFTALMOLOGIA' ? (form.av_cc_lejos_oi || null) : undefined,
            ref_od_esfera: type === 'OFTALMOLOGIA' ? (form.ref_od_esfera || null) : undefined,
            ref_od_cilindro: type === 'OFTALMOLOGIA' ? (form.ref_od_cilindro || null) : undefined,
            ref_od_eje: type === 'OFTALMOLOGIA' ? (form.ref_od_eje || null) : undefined,
            ref_od_adicion: type === 'OFTALMOLOGIA' ? (form.ref_od_adicion || null) : undefined,
            ref_oi_esfera: type === 'OFTALMOLOGIA' ? (form.ref_oi_esfera || null) : undefined,
            ref_oi_cilindro: type === 'OFTALMOLOGIA' ? (form.ref_oi_cilindro || null) : undefined,
            ref_oi_eje: type === 'OFTALMOLOGIA' ? (form.ref_oi_eje || null) : undefined,
            ref_oi_adicion: type === 'OFTALMOLOGIA' ? (form.ref_oi_adicion || null) : undefined,
            examen_refraccion: type === 'OFTALMOLOGIA' ? Boolean(form.examen_refraccion) : undefined,
            examen_biomicroscopia: type === 'OFTALMOLOGIA' ? Boolean(form.examen_biomicroscopia) : undefined,
            examen_oftalmoscopia: type === 'OFTALMOLOGIA' ? Boolean(form.examen_oftalmoscopia) : undefined,
            examen_tonometria: type === 'OFTALMOLOGIA' ? Boolean(form.examen_tonometria) : undefined,
            examen_campo_visual: type === 'OFTALMOLOGIA' ? Boolean(form.examen_campo_visual) : undefined,
            examen_oct: type === 'OFTALMOLOGIA' ? Boolean(form.examen_oct) : undefined,
            examen_retinografia: type === 'OFTALMOLOGIA' ? Boolean(form.examen_retinografia) : undefined,
            examen_paquimetria: type === 'OFTALMOLOGIA' ? Boolean(form.examen_paquimetria) : undefined,
            examen_topografia: type === 'OFTALMOLOGIA' ? Boolean(form.examen_topografia) : undefined,
            examen_gonioscopia: type === 'OFTALMOLOGIA' ? Boolean(form.examen_gonioscopia) : undefined,
            examen_angiofluoresceinografia: type === 'OFTALMOLOGIA' ? Boolean(form.examen_angiofluoresceinografia) : undefined,
            examen_cicloplegia: type === 'OFTALMOLOGIA' ? Boolean(form.examen_cicloplegia) : undefined,
            biomicroscopia_parpados: type === 'OFTALMOLOGIA' ? (form.biomicroscopia_parpados || null) : undefined,
            biomicroscopia_conjuntiva: type === 'OFTALMOLOGIA' ? (form.biomicroscopia_conjuntiva || null) : undefined,
            biomicroscopia_cornea: type === 'OFTALMOLOGIA' ? (form.biomicroscopia_cornea || null) : undefined,
            biomicroscopia_camara_anterior: type === 'OFTALMOLOGIA' ? (form.biomicroscopia_camara_anterior || null) : undefined,
            biomicroscopia_iris: type === 'OFTALMOLOGIA' ? (form.biomicroscopia_iris || null) : undefined,
            biomicroscopia_cristalino: type === 'OFTALMOLOGIA' ? (form.biomicroscopia_cristalino || null) : undefined,
            tonometria_od: type === 'OFTALMOLOGIA' ? (form.tonometria_od || null) : undefined,
            tonometria_oi: type === 'OFTALMOLOGIA' ? (form.tonometria_oi || null) : undefined,
            tonometria_metodo: type === 'OFTALMOLOGIA' ? (form.tonometria_metodo || null) : undefined,
            campo_visual_tipo: type === 'OFTALMOLOGIA' ? (form.campo_visual_tipo || null) : undefined,
            campo_visual_od: type === 'OFTALMOLOGIA' ? (form.campo_visual_od || null) : undefined,
            campo_visual_oi: type === 'OFTALMOLOGIA' ? (form.campo_visual_oi || null) : undefined,
            oct_tipo: type === 'OFTALMOLOGIA' ? (form.oct_tipo || null) : undefined,
            oct_hallazgos: type === 'OFTALMOLOGIA' ? (form.oct_hallazgos || null) : undefined,
            retinografia_hallazgos: type === 'OFTALMOLOGIA' ? (form.retinografia_hallazgos || null) : undefined,
            paquimetria_od: type === 'OFTALMOLOGIA' ? (form.paquimetria_od || null) : undefined,
            paquimetria_oi: type === 'OFTALMOLOGIA' ? (form.paquimetria_oi || null) : undefined,
            topografia_tipo: type === 'OFTALMOLOGIA' ? (form.topografia_tipo || null) : undefined,
            topografia_hallazgos: type === 'OFTALMOLOGIA' ? (form.topografia_hallazgos || null) : undefined,
            gonioscopia_od: type === 'OFTALMOLOGIA' ? (form.gonioscopia_od || null) : undefined,
            gonioscopia_oi: type === 'OFTALMOLOGIA' ? (form.gonioscopia_oi || null) : undefined,
            gonioscopia_hallazgos: type === 'OFTALMOLOGIA' ? (form.gonioscopia_hallazgos || null) : undefined,
            angiofluoresceinografia_hallazgos: type === 'OFTALMOLOGIA' ? (form.angiofluoresceinografia_hallazgos || null) : undefined,
            cicloplegia_medicamento: type === 'OFTALMOLOGIA' ? (form.cicloplegia_medicamento || null) : undefined,
            cicloplegia_dosis: type === 'OFTALMOLOGIA' ? (form.cicloplegia_dosis || null) : undefined,
            cicloplegia_od_esfera: type === 'OFTALMOLOGIA' ? (form.cicloplegia_od_esfera || null) : undefined,
            cicloplegia_od_cilindro: type === 'OFTALMOLOGIA' ? (form.cicloplegia_od_cilindro || null) : undefined,
            cicloplegia_od_eje: type === 'OFTALMOLOGIA' ? (form.cicloplegia_od_eje || null) : undefined,
            cicloplegia_oi_esfera: type === 'OFTALMOLOGIA' ? (form.cicloplegia_oi_esfera || null) : undefined,
            cicloplegia_oi_cilindro: type === 'OFTALMOLOGIA' ? (form.cicloplegia_oi_cilindro || null) : undefined,
            cicloplegia_oi_eje: type === 'OFTALMOLOGIA' ? (form.cicloplegia_oi_eje || null) : undefined,
            estudios_solicitados: type === 'OFTALMOLOGIA' ? (form.estudios_solicitados || null) : undefined,
            observaciones: form.observaciones || null,
            diseno: type === 'CONTACTOLOGIA' ? (form.diseno || null) : undefined,
            resumen_resultados: type === 'CONTACTOLOGIA' ? (form.resumen_resultados || null) : undefined,
            marca_recomendada: type === 'CONTACTOLOGIA' ? (form.marca_recomendada || null) : undefined,
        }
        const doctorNombre = doctores?.find(item => Number(item.id) === Number(form.doctor_id))?.nombre_completo || ''
        const tratamientosSugeridos = patologiaDetalleQuery.data?.tratamientos || []
        const recetaSugerida = type === 'OFTALMOLOGIA' && tratamientosSugeridos.length
            ? {
                doctor_nombre: doctorNombre || null,
                diagnostico: (form.diagnostico || patologiaDetalleQuery.data?.nombre || '').trim() || null,
                observaciones: form.plan_tratamiento || null,
                detalles: tratamientosSugeridos.map((item, index) => ({
                    key: `sugerido-${item.id || index}-${item.medicamento_id}`,
                    medicamento: item.medicamento_id ? { id: item.medicamento_id, nombre_comercial: item.medicamento_nombre } : null,
                    posologia_personalizada: item.posologia_recomendada || '',
                    duracion_tratamiento: '',
                })),
              }
            : null
        onSave({ consulta: consultaPayload, recetaSugerida })
    }

    return (
        <form onSubmit={submit}>
            <div className="grid-2">
                <div className="form-group">
                    <label className="form-label">Fecha y hora</label>
                    <input className="form-input" type="datetime-local" value={form.fecha} onChange={event => setForm(prev => ({ ...prev, fecha: event.target.value }))} disabled={readOnly} />
                </div>
                <div className="form-group">
                    <label className="form-label">Doctor</label>
                    <select className="form-select" value={form.doctor_id} onChange={event => setForm(prev => ({ ...prev, doctor_id: event.target.value }))} disabled={readOnly}>
                        <option value="">Sin doctor</option>
                        {doctores.map(item => <option key={item.id} value={item.id}>{item.nombre_completo}</option>)}
                    </select>
                </div>
                <div className="form-group">
                    <label className="form-label">Lugar de atencion</label>
                    <select className="form-select" value={form.lugar_atencion_id} onChange={event => setForm(prev => ({ ...prev, lugar_atencion_id: event.target.value }))} disabled={readOnly}>
                        <option value="">Sin lugar</option>
                        {lugares.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}
                    </select>
                </div>
                <div className="form-group">
                    <label className="form-label">Proximo control</label>
                    <input className="form-input" type="date" value={form.fecha_control} onChange={event => setForm(prev => ({ ...prev, fecha_control: event.target.value }))} disabled={readOnly} />
                    <div className="flex gap-8" style={{ flexWrap: 'wrap', marginTop: 8 }}>
                        {[
                            { label: '1 mes', months: 1 },
                            { label: '3 meses', months: 3 },
                            { label: '6 meses', months: 6 },
                            { label: '1 ano', months: 12 },
                        ].map(option => (
                            <button
                                key={option.months}
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => setForm(prev => ({ ...prev, fecha_control: addMonthsToDateInput((prev.fecha || '').slice(0, 10), option.months) }))}
                                disabled={readOnly}
                            >
                                +{option.label}
                            </button>
                        ))}
                    </div>
                    <div style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: '0.86rem' }}>
                        Sugerencia por defecto: 1 ano. Puedes usar los accesos rapidos o editar la fecha manualmente.
                    </div>
                </div>
            </div>

            {type === 'OFTALMOLOGIA' ? (
                <>
                    <div className="form-group">
                        <label className="form-label">Motivo</label>
                        <input className="form-input" value={form.motivo} onChange={event => setForm(prev => ({ ...prev, motivo: event.target.value }))} disabled={readOnly} />
                        <QuickTemplateButtons
                            label="Motivos rapidos"
                            options={MOTIVOS_OFTALMOLOGIA_RAPIDOS}
                            onApply={snippet => setForm(prev => ({ ...prev, motivo: appendTemplateText(prev.motivo, snippet) }))}
                            disabled={readOnly}
                        />
                    </div>
                    <div className="card" style={{ padding: 16, marginBottom: 16, background: 'rgba(255,255,255,0.02)' }}>
                        <div style={{ fontWeight: 700, marginBottom: 12 }}>Importar patologia</div>
                        <div className="grid-2" style={{ alignItems: 'end' }}>
                            <div className="form-group">
                                <label className="form-label">Patologia</label>
                                <RemoteSearchSelect
                                    value={patologiaSeleccionada}
                                    onChange={setPatologiaSeleccionada}
                                    onSearch={setPatologiaSearch}
                                    options={patologiasQuery.data || []}
                                    loading={patologiasQuery.isFetching}
                                    placeholder="Buscar patologia..."
                                    promptMessage="Escriba para buscar patologia"
                                    emptyMessage="Sin patologias"
                                    minChars={0}
                                    getOptionLabel={option => option?.nombre || ''}
                                    getOptionValue={option => option?.id}
                                    floating={false}
                                />
                            </div>
                            <div className="flex gap-12" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                <button type="button" className="btn btn-secondary" onClick={importarPatologia} disabled={readOnly || !patologiaSeleccionada}>
                                    Importar al formulario
                                </button>
                            </div>
                        </div>
                        {patologiaSeleccionada && (
                            <div style={{ marginTop: 12, color: 'var(--text-muted)', display: 'grid', gap: 6 }}>
                                {(patologiaDetalleQuery.data?.descripcion || patologiaSeleccionada.descripcion) && <div><strong style={{ color: 'var(--text-primary)' }}>Descripcion:</strong> {patologiaDetalleQuery.data?.descripcion || patologiaSeleccionada.descripcion}</div>}
                                {(patologiaDetalleQuery.data?.sintomas || patologiaSeleccionada.sintomas) && <div><strong style={{ color: 'var(--text-primary)' }}>Sintomas:</strong> {patologiaDetalleQuery.data?.sintomas || patologiaSeleccionada.sintomas}</div>}
                                {(patologiaDetalleQuery.data?.tratamiento_no_farmacologico || patologiaSeleccionada.tratamiento_no_farmacologico) && <div><strong style={{ color: 'var(--text-primary)' }}>Tratamiento no farmacologico:</strong> {patologiaDetalleQuery.data?.tratamiento_no_farmacologico || patologiaSeleccionada.tratamiento_no_farmacologico}</div>}
                                {patologiaDetalleQuery.data?.tratamientos?.length ? (
                                    <div>
                                        <strong style={{ color: 'var(--text-primary)' }}>Medicamentos sugeridos:</strong>{' '}
                                        {patologiaDetalleQuery.data.tratamientos.map(item => item.medicamento_nombre).join(', ')}
                                    </div>
                                ) : null}
                            </div>
                        )}
                    </div>
                    <div className="card" style={{ padding: 16 }}>
                        <div style={{ fontWeight: 700, marginBottom: 12 }}>Correccion refractiva</div>
                        <div className="flex gap-12" style={{ flexWrap: 'wrap', marginBottom: 14 }}>
                            {[
                                ['examen_refraccion', 'Refraccion'],
                                ['examen_biomicroscopia', 'Biomicroscopia'],
                                ['examen_oftalmoscopia', 'Oftalmoscopia'],
                                ['examen_tonometria', 'Tonometria'],
                                ['examen_campo_visual', 'Campo visual'],
                                ['examen_oct', 'OCT'],
                                ['examen_retinografia', 'Retinografia'],
                                ['examen_paquimetria', 'Paquimetria'],
                                ['examen_topografia', 'Topografia'],
                                ['examen_gonioscopia', 'Gonioscopia'],
                                ['examen_angiofluoresceinografia', 'Angiofluoresceinografia'],
                                ['examen_cicloplegia', 'Cicloplegia'],
                            ].map(([key, label]) => (
                                <label key={key} className="checkbox-label" style={{ minWidth: 170 }}>
                                    <input
                                        type="checkbox"
                                        checked={Boolean(form[key])}
                                        onChange={event => setForm(prev => ({ ...prev, [key]: event.target.checked }))}
                                        disabled={readOnly}
                                    />
                                    {label}
                                </label>
                            ))}
                        </div>
                        <div className="card" style={{ padding: 16, background: 'rgba(255,255,255,0.02)', marginBottom: 16 }}>
                            <div style={{ fontWeight: 700, marginBottom: 12 }}>Agudeza visual</div>
                            <div style={{ display: 'grid', gap: 14 }}>
                                <div
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: '72px repeat(2, minmax(160px, 1fr))',
                                        gap: 12,
                                        alignItems: 'end',
                                    }}
                                >
                                    <div style={{ fontWeight: 800, fontSize: '1rem', paddingBottom: 10 }}>OD</div>
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <label className="form-label">AV SC lejos</label>
                                        <input className="form-input" value={form.av_sc_lejos_od} onChange={event => setForm(prev => ({ ...prev, av_sc_lejos_od: event.target.value }))} disabled={readOnly} />
                                    </div>
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <label className="form-label">AV CC lejos</label>
                                        <input className="form-input" value={form.av_cc_lejos_od} onChange={event => setForm(prev => ({ ...prev, av_cc_lejos_od: event.target.value }))} disabled={readOnly} />
                                    </div>
                                </div>
                                <div
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: '72px repeat(2, minmax(160px, 1fr))',
                                        gap: 12,
                                        alignItems: 'end',
                                    }}
                                >
                                    <div style={{ fontWeight: 800, fontSize: '1rem', paddingBottom: 10 }}>OI</div>
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <label className="form-label">AV SC lejos</label>
                                        <input className="form-input" value={form.av_sc_lejos_oi} onChange={event => setForm(prev => ({ ...prev, av_sc_lejos_oi: event.target.value }))} disabled={readOnly} />
                                    </div>
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <label className="form-label">AV CC lejos</label>
                                        <input className="form-input" value={form.av_cc_lejos_oi} onChange={event => setForm(prev => ({ ...prev, av_cc_lejos_oi: event.target.value }))} disabled={readOnly} />
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="card" style={{ padding: 16, background: 'rgba(255,255,255,0.02)' }}>
                            <div style={{ display: 'grid', gap: 16 }}>
                                <div
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: '72px repeat(4, minmax(120px, 1fr))',
                                        gap: 12,
                                        alignItems: 'end',
                                    }}
                                >
                                    <div style={{ fontWeight: 800, fontSize: '1rem', paddingBottom: 10 }}>OD</div>
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <label className="form-label">Esfera</label>
                                        <input className="form-input" value={form.ref_od_esfera} onChange={event => setForm(prev => ({ ...prev, ref_od_esfera: event.target.value }))} disabled={readOnly} />
                                    </div>
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <label className="form-label">Cilindro</label>
                                        <input className="form-input" value={form.ref_od_cilindro} onChange={event => setForm(prev => ({ ...prev, ref_od_cilindro: event.target.value }))} disabled={readOnly} />
                                    </div>
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <label className="form-label">Eje</label>
                                        <input className="form-input" value={form.ref_od_eje} onChange={event => setForm(prev => ({ ...prev, ref_od_eje: event.target.value }))} disabled={readOnly} />
                                    </div>
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <label className="form-label">Adicion</label>
                                        <input className="form-input" value={form.ref_od_adicion} onChange={event => setForm(prev => ({ ...prev, ref_od_adicion: event.target.value }))} disabled={readOnly} />
                                    </div>
                                </div>

                                <div
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: '72px repeat(4, minmax(120px, 1fr))',
                                        gap: 12,
                                        alignItems: 'end',
                                    }}
                                >
                                    <div style={{ fontWeight: 800, fontSize: '1rem', paddingBottom: 10 }}>OI</div>
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <label className="form-label">Esfera</label>
                                        <input className="form-input" value={form.ref_oi_esfera} onChange={event => setForm(prev => ({ ...prev, ref_oi_esfera: event.target.value }))} disabled={readOnly} />
                                    </div>
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <label className="form-label">Cilindro</label>
                                        <input className="form-input" value={form.ref_oi_cilindro} onChange={event => setForm(prev => ({ ...prev, ref_oi_cilindro: event.target.value }))} disabled={readOnly} />
                                    </div>
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <label className="form-label">Eje</label>
                                        <input className="form-input" value={form.ref_oi_eje} onChange={event => setForm(prev => ({ ...prev, ref_oi_eje: event.target.value }))} disabled={readOnly} />
                                    </div>
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <label className="form-label">Adicion</label>
                                        <input className="form-input" value={form.ref_oi_adicion} onChange={event => setForm(prev => ({ ...prev, ref_oi_adicion: event.target.value }))} disabled={readOnly} />
                                    </div>
                                </div>
                            </div>
                        </div>
                        {form.examen_biomicroscopia && (
                            <div className="card" style={{ padding: 16, marginTop: 16, background: 'rgba(255,255,255,0.02)' }}>
                                <div style={{ fontWeight: 700, marginBottom: 12 }}>Biomicroscopia</div>
                                <div className="grid-2">
                                    <div className="form-group"><label className="form-label">Parpados</label><input className="form-input" value={form.biomicroscopia_parpados} onChange={event => setForm(prev => ({ ...prev, biomicroscopia_parpados: event.target.value }))} disabled={readOnly} /></div>
                                    <div className="form-group"><label className="form-label">Conjuntiva</label><input className="form-input" value={form.biomicroscopia_conjuntiva} onChange={event => setForm(prev => ({ ...prev, biomicroscopia_conjuntiva: event.target.value }))} disabled={readOnly} /></div>
                                    <div className="form-group"><label className="form-label">Cornea</label><input className="form-input" value={form.biomicroscopia_cornea} onChange={event => setForm(prev => ({ ...prev, biomicroscopia_cornea: event.target.value }))} disabled={readOnly} /></div>
                                    <div className="form-group"><label className="form-label">Camara anterior</label><input className="form-input" value={form.biomicroscopia_camara_anterior} onChange={event => setForm(prev => ({ ...prev, biomicroscopia_camara_anterior: event.target.value }))} disabled={readOnly} /></div>
                                    <div className="form-group"><label className="form-label">Iris</label><input className="form-input" value={form.biomicroscopia_iris} onChange={event => setForm(prev => ({ ...prev, biomicroscopia_iris: event.target.value }))} disabled={readOnly} /></div>
                                    <div className="form-group"><label className="form-label">Cristalino</label><input className="form-input" value={form.biomicroscopia_cristalino} onChange={event => setForm(prev => ({ ...prev, biomicroscopia_cristalino: event.target.value }))} disabled={readOnly} /></div>
                                </div>
                            </div>
                        )}
                        {form.examen_tonometria && (
                            <div className="card" style={{ padding: 16, marginTop: 16, background: 'rgba(255,255,255,0.02)' }}>
                                <div style={{ fontWeight: 700, marginBottom: 12 }}>Tonometria</div>
                                <div className="grid-3">
                                    <div className="form-group"><label className="form-label">OD</label><input className="form-input" value={form.tonometria_od} onChange={event => setForm(prev => ({ ...prev, tonometria_od: event.target.value }))} disabled={readOnly} /></div>
                                    <div className="form-group"><label className="form-label">OI</label><input className="form-input" value={form.tonometria_oi} onChange={event => setForm(prev => ({ ...prev, tonometria_oi: event.target.value }))} disabled={readOnly} /></div>
                                    <div className="form-group"><label className="form-label">Metodo</label><input className="form-input" value={form.tonometria_metodo} onChange={event => setForm(prev => ({ ...prev, tonometria_metodo: event.target.value }))} disabled={readOnly} /></div>
                                </div>
                            </div>
                        )}
                        {form.examen_campo_visual && (
                            <div className="card" style={{ padding: 16, marginTop: 16, background: 'rgba(255,255,255,0.02)' }}>
                                <div style={{ fontWeight: 700, marginBottom: 12 }}>Campo visual</div>
                                <div className="grid-3">
                                    <div className="form-group"><label className="form-label">Tipo</label><input className="form-input" value={form.campo_visual_tipo} onChange={event => setForm(prev => ({ ...prev, campo_visual_tipo: event.target.value }))} disabled={readOnly} /></div>
                                    <div className="form-group"><label className="form-label">OD</label><input className="form-input" value={form.campo_visual_od} onChange={event => setForm(prev => ({ ...prev, campo_visual_od: event.target.value }))} disabled={readOnly} /></div>
                                    <div className="form-group"><label className="form-label">OI</label><input className="form-input" value={form.campo_visual_oi} onChange={event => setForm(prev => ({ ...prev, campo_visual_oi: event.target.value }))} disabled={readOnly} /></div>
                                </div>
                            </div>
                        )}
                        {(form.examen_oct || form.examen_retinografia || form.examen_paquimetria || form.examen_topografia || form.examen_gonioscopia || form.examen_angiofluoresceinografia || form.examen_cicloplegia) && (
                            <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
                                {form.examen_oct && (
                                    <div className="card" style={{ padding: 16, background: 'rgba(255,255,255,0.02)' }}>
                                        <div style={{ fontWeight: 700, marginBottom: 12 }}>OCT</div>
                                        <div className="grid-2">
                                            <div className="form-group"><label className="form-label">Tipo</label><input className="form-input" value={form.oct_tipo} onChange={event => setForm(prev => ({ ...prev, oct_tipo: event.target.value }))} disabled={readOnly} /></div>
                                            <div className="form-group" style={{ gridColumn: '1 / -1' }}><label className="form-label">Hallazgos</label><textarea className="form-input" value={form.oct_hallazgos} onChange={event => setForm(prev => ({ ...prev, oct_hallazgos: event.target.value }))} disabled={readOnly} style={{ minHeight: 84, resize: 'none' }} /></div>
                                        </div>
                                    </div>
                                )}
                                {form.examen_retinografia && (
                                    <div className="card" style={{ padding: 16, background: 'rgba(255,255,255,0.02)' }}>
                                        <div style={{ fontWeight: 700, marginBottom: 12 }}>Retinografia</div>
                                        <textarea className="form-input" value={form.retinografia_hallazgos} onChange={event => setForm(prev => ({ ...prev, retinografia_hallazgos: event.target.value }))} disabled={readOnly} style={{ minHeight: 84, resize: 'none' }} />
                                    </div>
                                )}
                                {form.examen_paquimetria && (
                                    <div className="card" style={{ padding: 16, background: 'rgba(255,255,255,0.02)' }}>
                                        <div style={{ fontWeight: 700, marginBottom: 12 }}>Paquimetria</div>
                                        <div className="grid-2">
                                            <div className="form-group"><label className="form-label">OD</label><input className="form-input" value={form.paquimetria_od} onChange={event => setForm(prev => ({ ...prev, paquimetria_od: event.target.value }))} disabled={readOnly} /></div>
                                            <div className="form-group"><label className="form-label">OI</label><input className="form-input" value={form.paquimetria_oi} onChange={event => setForm(prev => ({ ...prev, paquimetria_oi: event.target.value }))} disabled={readOnly} /></div>
                                        </div>
                                    </div>
                                )}
                                {form.examen_topografia && (
                                    <div className="card" style={{ padding: 16, background: 'rgba(255,255,255,0.02)' }}>
                                        <div style={{ fontWeight: 700, marginBottom: 12 }}>Topografia</div>
                                        <div className="grid-2">
                                            <div className="form-group"><label className="form-label">Tipo</label><input className="form-input" value={form.topografia_tipo} onChange={event => setForm(prev => ({ ...prev, topografia_tipo: event.target.value }))} disabled={readOnly} /></div>
                                            <div className="form-group" style={{ gridColumn: '1 / -1' }}><label className="form-label">Hallazgos</label><textarea className="form-input" value={form.topografia_hallazgos} onChange={event => setForm(prev => ({ ...prev, topografia_hallazgos: event.target.value }))} disabled={readOnly} style={{ minHeight: 84, resize: 'none' }} /></div>
                                        </div>
                                    </div>
                                )}
                                {form.examen_gonioscopia && (
                                    <div className="card" style={{ padding: 16, background: 'rgba(255,255,255,0.02)' }}>
                                        <div style={{ fontWeight: 700, marginBottom: 12 }}>Gonioscopia</div>
                                        <div className="grid-3">
                                            <div className="form-group"><label className="form-label">OD</label><input className="form-input" value={form.gonioscopia_od} onChange={event => setForm(prev => ({ ...prev, gonioscopia_od: event.target.value }))} disabled={readOnly} /></div>
                                            <div className="form-group"><label className="form-label">OI</label><input className="form-input" value={form.gonioscopia_oi} onChange={event => setForm(prev => ({ ...prev, gonioscopia_oi: event.target.value }))} disabled={readOnly} /></div>
                                            <div className="form-group"><label className="form-label">Hallazgos</label><input className="form-input" value={form.gonioscopia_hallazgos} onChange={event => setForm(prev => ({ ...prev, gonioscopia_hallazgos: event.target.value }))} disabled={readOnly} /></div>
                                        </div>
                                    </div>
                                )}
                                {form.examen_angiofluoresceinografia && (
                                    <div className="card" style={{ padding: 16, background: 'rgba(255,255,255,0.02)' }}>
                                        <div style={{ fontWeight: 700, marginBottom: 12 }}>Angiofluoresceinografia</div>
                                        <textarea className="form-input" value={form.angiofluoresceinografia_hallazgos} onChange={event => setForm(prev => ({ ...prev, angiofluoresceinografia_hallazgos: event.target.value }))} disabled={readOnly} style={{ minHeight: 84, resize: 'none' }} />
                                    </div>
                                )}
                                {form.examen_cicloplegia && (
                                    <div className="card" style={{ padding: 16, background: 'rgba(255,255,255,0.02)' }}>
                                        <div style={{ fontWeight: 700, marginBottom: 12 }}>Cicloplegia</div>
                                        <div className="grid-2">
                                            <div className="form-group"><label className="form-label">Medicamento</label><input className="form-input" value={form.cicloplegia_medicamento} onChange={event => setForm(prev => ({ ...prev, cicloplegia_medicamento: event.target.value }))} disabled={readOnly} /></div>
                                            <div className="form-group"><label className="form-label">Dosis</label><input className="form-input" value={form.cicloplegia_dosis} onChange={event => setForm(prev => ({ ...prev, cicloplegia_dosis: event.target.value }))} disabled={readOnly} /></div>
                                        </div>
                                        <div style={{ display: 'grid', gap: 12 }}>
                                            <div style={{ display: 'grid', gridTemplateColumns: '72px repeat(3, minmax(120px, 1fr))', gap: 12, alignItems: 'end' }}>
                                                <div style={{ fontWeight: 800, paddingBottom: 10 }}>OD</div>
                                                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Esfera</label><input className="form-input" value={form.cicloplegia_od_esfera} onChange={event => setForm(prev => ({ ...prev, cicloplegia_od_esfera: event.target.value }))} disabled={readOnly} /></div>
                                                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Cilindro</label><input className="form-input" value={form.cicloplegia_od_cilindro} onChange={event => setForm(prev => ({ ...prev, cicloplegia_od_cilindro: event.target.value }))} disabled={readOnly} /></div>
                                                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Eje</label><input className="form-input" value={form.cicloplegia_od_eje} onChange={event => setForm(prev => ({ ...prev, cicloplegia_od_eje: event.target.value }))} disabled={readOnly} /></div>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '72px repeat(3, minmax(120px, 1fr))', gap: 12, alignItems: 'end' }}>
                                                <div style={{ fontWeight: 800, paddingBottom: 10 }}>OI</div>
                                                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Esfera</label><input className="form-input" value={form.cicloplegia_oi_esfera} onChange={event => setForm(prev => ({ ...prev, cicloplegia_oi_esfera: event.target.value }))} disabled={readOnly} /></div>
                                                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Cilindro</label><input className="form-input" value={form.cicloplegia_oi_cilindro} onChange={event => setForm(prev => ({ ...prev, cicloplegia_oi_cilindro: event.target.value }))} disabled={readOnly} /></div>
                                                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Eje</label><input className="form-input" value={form.cicloplegia_oi_eje} onChange={event => setForm(prev => ({ ...prev, cicloplegia_oi_eje: event.target.value }))} disabled={readOnly} /></div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="form-group" style={{ marginTop: 16 }}>
                            <label className="form-label">Estudios solicitados / indicaciones complementarias</label>
                            <textarea className="form-input" value={form.estudios_solicitados} onChange={event => setForm(prev => ({ ...prev, estudios_solicitados: event.target.value }))} disabled={readOnly} style={{ minHeight: 88, resize: 'none' }} />
                            <QuickTemplateButtons
                                label="Estudios rapidos"
                                options={ESTUDIOS_OFTALMOLOGIA_RAPIDOS}
                                onApply={snippet => setForm(prev => ({ ...prev, estudios_solicitados: appendTemplateText(prev.estudios_solicitados, snippet) }))}
                                disabled={readOnly}
                            />
                        </div>
                    </div>
                </>
            ) : (
                <>
                    <div className="grid-2">
                        <div className="form-group">
                            <label className="form-label">Diseno</label>
                            <input className="form-input" value={form.diseno} onChange={event => setForm(prev => ({ ...prev, diseno: event.target.value }))} disabled={readOnly} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Marca recomendada</label>
                            <input className="form-input" value={form.marca_recomendada} onChange={event => setForm(prev => ({ ...prev, marca_recomendada: event.target.value }))} disabled={readOnly} />
                        </div>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Resumen resultados</label>
                        <textarea className="form-input" value={form.resumen_resultados} onChange={event => setForm(prev => ({ ...prev, resumen_resultados: event.target.value }))} disabled={readOnly} style={{ minHeight: 88, resize: 'none' }} />
                        <QuickTemplateButtons
                            label="Resumenes rapidos"
                            options={RESUMENES_CONTACTOLOGIA_RAPIDOS}
                            onApply={snippet => setForm(prev => ({ ...prev, resumen_resultados: appendTemplateText(prev.resumen_resultados, snippet) }))}
                            disabled={readOnly}
                        />
                    </div>
                </>
            )}

            <div className="form-group">
                <label className="form-label">Diagnostico</label>
                <textarea className="form-input" value={form.diagnostico} onChange={event => setForm(prev => ({ ...prev, diagnostico: event.target.value }))} disabled={readOnly} style={{ minHeight: 84, resize: 'none' }} />
            </div>
            {type === 'OFTALMOLOGIA' && (
                <div className="card" style={{ padding: 16, marginBottom: 16, background: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ fontWeight: 700, marginBottom: 12 }}>Diagnosticos frecuentes</div>
                    <div className="flex gap-12" style={{ flexWrap: 'wrap' }}>
                        {DIAGNOSTICOS_FRECUENTES.map(item => {
                            const selected = splitCommaValues(form.diagnostico).some(value => value.toUpperCase() === item.toUpperCase())
                            return (
                                <button
                                    key={item}
                                    type="button"
                                    className={selected ? 'btn btn-primary' : 'btn btn-secondary'}
                                    onClick={() => toggleDiagnosticoFrecuente(item)}
                                    disabled={readOnly}
                                >
                                    {item}
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}
            <div className="form-group">
                <label className="form-label">Plan de tratamiento</label>
                <textarea className="form-input" value={form.plan_tratamiento} onChange={event => setForm(prev => ({ ...prev, plan_tratamiento: event.target.value }))} disabled={readOnly} style={{ minHeight: 84, resize: 'none' }} />
                <QuickTemplateButtons
                    label="Planes rapidos"
                    options={type === 'OFTALMOLOGIA' ? PLANES_OFTALMOLOGIA_RAPIDOS : PLANES_CONTACTOLOGIA_RAPIDOS}
                    onApply={snippet => setForm(prev => ({ ...prev, plan_tratamiento: appendTemplateText(prev.plan_tratamiento, snippet) }))}
                    disabled={readOnly}
                />
            </div>
            <div className="form-group">
                <label className="form-label">Observaciones</label>
                <textarea className="form-input" value={form.observaciones} onChange={event => setForm(prev => ({ ...prev, observaciones: event.target.value }))} disabled={readOnly} style={{ minHeight: 92, resize: 'none' }} />
            </div>
            {type === 'OFTALMOLOGIA' && (
                <div className="card" style={{ padding: 16, marginTop: 8, background: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ fontWeight: 700, marginBottom: 12 }}>Recomendacion optica</div>
                    <div className="grid-3" style={{ alignItems: 'start' }}>
                        <div className="card" style={{ padding: 16, background: 'rgba(255,255,255,0.02)' }}>
                            <div style={{ fontWeight: 700, marginBottom: 12 }}>Material / diseno</div>
                            <div style={{ display: 'grid', gap: 10 }}>
                                <label className="checkbox-label"><input type="checkbox" checked={recommendation.materialOrganico} onChange={event => setRecommendation(prev => ({ ...prev, materialOrganico: event.target.checked }))} disabled={readOnly} />Organico</label>
                                <label className="checkbox-label"><input type="checkbox" checked={recommendation.materialPolicarbonato} onChange={event => setRecommendation(prev => ({ ...prev, materialPolicarbonato: event.target.checked }))} disabled={readOnly} />Policarbonato</label>
                                <label className="checkbox-label"><input type="checkbox" checked={recommendation.tipoMonofocal} onChange={event => setRecommendation(prev => ({ ...prev, tipoMonofocal: event.target.checked }))} disabled={readOnly} />Monofocal</label>
                                <label className="checkbox-label"><input type="checkbox" checked={recommendation.tipoBifocal} onChange={event => setRecommendation(prev => ({ ...prev, tipoBifocal: event.target.checked }))} disabled={readOnly} />Bifocal</label>
                                {recommendation.tipoBifocal && (
                                    <input className="form-input" value={recommendation.detalleBifocal} onChange={event => setRecommendation(prev => ({ ...prev, detalleBifocal: event.target.value }))} placeholder="Detalles bifocal" disabled={readOnly} />
                                )}
                                <label className="checkbox-label"><input type="checkbox" checked={recommendation.tipoMultifocal} onChange={event => setRecommendation(prev => ({ ...prev, tipoMultifocal: event.target.checked }))} disabled={readOnly} />Multifocal / progresivo</label>
                                {recommendation.tipoMultifocal && (
                                    <input className="form-input" value={recommendation.detalleMultifocal} onChange={event => setRecommendation(prev => ({ ...prev, detalleMultifocal: event.target.value }))} placeholder="Detalles multifocal" disabled={readOnly} />
                                )}
                            </div>
                        </div>
                        <div className="card" style={{ padding: 16, background: 'rgba(255,255,255,0.02)' }}>
                            <div style={{ fontWeight: 700, marginBottom: 12 }}>Protecciones / tratamientos</div>
                            <div style={{ display: 'grid', gap: 10 }}>
                                <label className="checkbox-label"><input type="checkbox" checked={recommendation.tratamientoFiltroAzul} onChange={event => setRecommendation(prev => ({ ...prev, tratamientoFiltroAzul: event.target.checked }))} disabled={readOnly} />Filtro de luz azul</label>
                                <label className="checkbox-label"><input type="checkbox" checked={recommendation.tratamientoAntirreflejos} onChange={event => setRecommendation(prev => ({ ...prev, tratamientoAntirreflejos: event.target.checked }))} disabled={readOnly} />Anti reflejos</label>
                                <label className="checkbox-label"><input type="checkbox" checked={recommendation.tratamientoAntiUvx} onChange={event => setRecommendation(prev => ({ ...prev, tratamientoAntiUvx: event.target.checked }))} disabled={readOnly} />Filtro anti UVX</label>
                                <label className="checkbox-label"><input type="checkbox" checked={recommendation.tratamientoFotocromatico} onChange={event => setRecommendation(prev => ({ ...prev, tratamientoFotocromatico: event.target.checked }))} disabled={readOnly} />Fotocromatico</label>
                                <label className="checkbox-label"><input type="checkbox" checked={recommendation.tratamientoTransitions} onChange={event => setRecommendation(prev => ({ ...prev, tratamientoTransitions: event.target.checked }))} disabled={readOnly} />Transitions</label>
                            </div>
                        </div>
                        <div className="card" style={{ padding: 16, background: 'rgba(255,255,255,0.02)' }}>
                            <div style={{ fontWeight: 700, marginBottom: 12 }}>Tipo de uso</div>
                            <div style={{ display: 'grid', gap: 10 }}>
                                {['USO PERMANENTE', 'SOLO VISION LEJANA', 'SOLO LECTURA', 'CANSANCIO VISUAL'].map(option => (
                                    <label key={option} className="checkbox-label">
                                        <input
                                            type="radio"
                                            name={`uso-lente-${pacienteId}-${type}`}
                                            checked={recommendation.uso === option}
                                            onChange={() => setRecommendation(prev => ({ ...prev, uso: option }))}
                                            disabled={readOnly}
                                        />
                                        {option}
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            <div className="flex gap-12" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
                <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>{readOnly ? 'Cerrar' : 'Cancelar'}</button>
                {!readOnly && (
                    <button type="submit" className="btn btn-primary" disabled={saving || saved}>
                        {saved ? 'Consulta guardada' : saving ? savingText : 'Guardar consulta'}
                    </button>
                )}
            </div>
        </form>
    )
}

function AnamnesisClinicaForm({ value, onChange }) {
    const sintomas = [
        ['cefalea', 'Cefalea'],
        ['ardor', 'Ardor / Picazon'],
        ['ojo_seco', 'Ojo seco / Arenilla'],
        ['lagrimeo', 'Lagrimeo excesivo'],
        ['fotofobia', 'Molestia a la luz'],
        ['vision_doble', 'Vision doble'],
        ['destellos', 'Destellos / Luces'],
        ['manchas', 'Manchas / Moscas'],
        ['dificultad_cerca', 'Dificultad de cerca'],
    ]

    const salud = [
        ['diabetes', 'Diabetes'],
        ['hipertension', 'Hipertension'],
        ['alergias', 'Alergias'],
        ['migranas', 'Migranas'],
        ['cirugias_previas', 'Cirugias previas'],
        ['trauma_ocular', 'Trauma ocular'],
    ]

    return (
        <div style={{ display: 'grid', gap: 18 }}>
            <div className="card" style={{ padding: 16 }}>
                <div style={{ fontWeight: 800, marginBottom: 14 }}>1. Motivo y expectativas</div>
                <div className="grid-2">
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                        <label className="form-label">Motivo principal</label>
                        <textarea className="form-input" value={value.motivo_principal} onChange={event => onChange(prev => ({ ...prev, motivo_principal: event.target.value }))} style={{ minHeight: 88, resize: 'none', width: '100%' }} />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Tiempo de molestias</label>
                        <select className="form-select" value={value.tiempo_molestias} onChange={event => onChange(prev => ({ ...prev, tiempo_molestias: event.target.value }))}>
                            <option value="">Seleccione...</option>
                            <option value="Menos de 1 semana">Menos de 1 semana</option>
                            <option value="1-4 semanas">1-4 semanas</option>
                            <option value="1-6 meses">1-6 meses</option>
                            <option value="6-12 meses">6-12 meses</option>
                            <option value="+1 año">+1 año</option>
                            <option value="+5 años">+5 años</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Expectativa</label>
                        <input className="form-input" value={value.expectativa} onChange={event => onChange(prev => ({ ...prev, expectativa: event.target.value }))} />
                    </div>
                </div>
                <div className="card" style={{ marginTop: 14, padding: 14, background: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Asistente de colirios / lagrimas</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.92rem' }}>
                        Queda como siguiente paso de esta fase. Ya dejamos la anamnesis estructurada para alimentar ese asistente con sintomas y antecedentes.
                    </div>
                </div>
            </div>

            <div className="card" style={{ padding: 16 }}>
                <div style={{ fontWeight: 800, marginBottom: 14 }}>2. Uso visual y estilo de vida</div>
                <div className="grid-2">
                    <div className="form-group">
                        <label className="form-label">Horas de pantalla</label>
                        <select className="form-select" value={value.horas_pantalla} onChange={event => onChange(prev => ({ ...prev, horas_pantalla: event.target.value }))}>
                            <option value="">Seleccione...</option>
                            <option value="0-2 horas">0-2 horas</option>
                            <option value="2-4 horas">2-4 horas</option>
                            <option value="4-8 horas">4-8 horas</option>
                            <option value="+8 horas">+8 horas</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Conduce</label>
                        <select className="form-select" value={value.conduce} onChange={event => onChange(prev => ({ ...prev, conduce: event.target.value }))}>
                            <option value="">Seleccione...</option>
                            <option value="No">No</option>
                            <option value="Si (Dia)">Si (Dia)</option>
                            <option value="Si (Dia y Noche)">Si (Dia y Noche)</option>
                            <option value="Profesional (Chofer)">Profesional (Chofer)</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Actividad laboral</label>
                        <input className="form-input" value={value.actividad_laboral} onChange={event => onChange(prev => ({ ...prev, actividad_laboral: event.target.value }))} />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Hobbies</label>
                        <input className="form-input" value={value.hobbies} onChange={event => onChange(prev => ({ ...prev, hobbies: event.target.value }))} />
                    </div>
                </div>
            </div>

            <div className="card" style={{ padding: 16 }}>
                <div style={{ fontWeight: 800, marginBottom: 14 }}>3. Sintomatologia actual</div>
                <div className="grid-2">
                    {sintomas.map(([key, label]) => (
                        <label key={key} className="flex gap-12" style={{ alignItems: 'center', color: 'var(--text-primary)' }}>
                            <input type="checkbox" checked={Boolean(value[key])} onChange={event => onChange(prev => ({ ...prev, [key]: event.target.checked }))} />
                            <span>{label}</span>
                        </label>
                    ))}
                </div>
            </div>

            <div className="card" style={{ padding: 16 }}>
                <div style={{ fontWeight: 800, marginBottom: 14 }}>4. Salud general y ocular</div>
                <div className="grid-2">
                    {salud.map(([key, label]) => (
                        <label key={key} className="flex gap-12" style={{ alignItems: 'center', color: 'var(--text-primary)' }}>
                            <input type="checkbox" checked={Boolean(value[key])} onChange={event => onChange(prev => ({ ...prev, [key]: event.target.checked }))} />
                            <span>{label}</span>
                        </label>
                    ))}
                </div>
                <div className="grid-2" style={{ marginTop: 14 }}>
                    <div className="form-group">
                        <label className="form-label">Medicamentos</label>
                        <input className="form-input" value={value.medicamentos} onChange={event => onChange(prev => ({ ...prev, medicamentos: event.target.value }))} />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Antecedentes familiares</label>
                        <input className="form-input" value={value.antecedentes_familiares} onChange={event => onChange(prev => ({ ...prev, antecedentes_familiares: event.target.value }))} />
                    </div>
                </div>
            </div>

            <div className="card" style={{ padding: 16 }}>
                <div style={{ fontWeight: 800, marginBottom: 14 }}>5. Correccion actual</div>
                <div className="grid-2">
                    <label className="flex gap-12" style={{ alignItems: 'center', color: 'var(--text-primary)' }}>
                        <input type="checkbox" checked={Boolean(value.usa_anteojos)} onChange={event => onChange(prev => ({ ...prev, usa_anteojos: event.target.checked }))} />
                        <span>Usa anteojos</span>
                    </label>
                    <div className="form-group">
                        <label className="form-label">Proposito anteojos</label>
                        <select
                            className="form-select"
                            value={value.proposito_anteojos}
                            onChange={event => onChange(prev => ({
                                ...prev,
                                proposito_anteojos: event.target.value,
                                usa_anteojos: Boolean(event.target.value),
                            }))}
                        >
                            <option value="">Seleccione...</option>
                            <option value="Lejos">Lejos</option>
                            <option value="Cerca">Cerca</option>
                            <option value="Multifocal/Bifocal">Multifocal/Bifocal</option>
                            <option value="Descanso">Descanso</option>
                        </select>
                    </div>
                    <label className="flex gap-12" style={{ alignItems: 'center', color: 'var(--text-primary)' }}>
                        <input type="checkbox" checked={Boolean(value.usa_lentes_contacto)} onChange={event => onChange(prev => ({ ...prev, usa_lentes_contacto: event.target.checked }))} />
                        <span>Usa lentes de contacto</span>
                    </label>
                    <div className="form-group">
                        <label className="form-label">Tipo de LC</label>
                        <select
                            className="form-select"
                            value={value.tipo_lentes_contacto}
                            onChange={event => onChange(prev => ({
                                ...prev,
                                tipo_lentes_contacto: event.target.value,
                                usa_lentes_contacto: Boolean(event.target.value),
                            }))}
                        >
                            <option value="">Seleccione...</option>
                            <option value="Blandos Esfericos">Blandos Esfericos</option>
                            <option value="Blandos Toricos">Blandos Toricos</option>
                            <option value="Rigidos (RGP)">Rigidos (RGP)</option>
                            <option value="Cosmeticos">Cosmeticos</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Horas de uso LC</label>
                        <input className="form-input" value={value.horas_uso_lc} onChange={event => onChange(prev => ({ ...prev, horas_uso_lc: event.target.value }))} disabled={!value.usa_lentes_contacto} />
                    </div>
                    <label className="flex gap-12" style={{ alignItems: 'center', color: 'var(--text-primary)' }}>
                        <input type="checkbox" checked={Boolean(value.molestias_lc)} onChange={event => onChange(prev => ({ ...prev, molestias_lc: event.target.checked }))} disabled={!value.usa_lentes_contacto} />
                        <span>Molestias con LC</span>
                    </label>
                </div>
            </div>
        </div>
    )
}

function ConsultaIntegralModal({
    open,
    patient,
    type,
    onTypeChange,
    doctores,
    lugares,
    onSave,
    onClose,
    saving,
    error,
    successData,
    onOpenLentesPdf,
    onOpenIndicacionesPdf,
    onOpenRecetaMedicamentos,
    initialAnamnesis,
    anamnesisLoading,
}) {
    const [activeTab, setActiveTab] = useState('anamnesis')
    const [showConsultaSavedNotice, setShowConsultaSavedNotice] = useState(false)
    const documentsRef = useRef(null)
    const [anamnesisDraft, setAnamnesisDraft] = useState({
        motivo_principal: '',
        tiempo_molestias: '',
        expectativa: '',
        horas_pantalla: '',
        conduce: '',
        actividad_laboral: '',
        hobbies: '',
        cefalea: false,
        ardor: false,
        ojo_seco: false,
        lagrimeo: false,
        fotofobia: false,
        vision_doble: false,
        destellos: false,
        manchas: false,
        dificultad_cerca: false,
        diabetes: false,
        diabetes_controlada: true,
        hipertension: false,
        alergias: false,
        migranas: false,
        cirugias_previas: false,
        trauma_ocular: false,
        medicamentos: '',
        antecedentes_familiares: '',
        usa_anteojos: false,
        proposito_anteojos: '',
        usa_lentes_contacto: false,
        tipo_lentes_contacto: '',
        horas_uso_lc: '',
        molestias_lc: false,
    })

    useEffect(() => {
        if (open) setActiveTab('anamnesis')
    }, [open, patient?.id])

    useEffect(() => {
        if (!open) return
        setAnamnesisDraft({
            motivo_principal: initialAnamnesis?.motivo_principal || '',
            tiempo_molestias: initialAnamnesis?.tiempo_molestias || '',
            expectativa: initialAnamnesis?.expectativa || '',
            horas_pantalla: initialAnamnesis?.horas_pantalla || '',
            conduce: initialAnamnesis?.conduce || '',
            actividad_laboral: initialAnamnesis?.actividad_laboral || '',
            hobbies: initialAnamnesis?.hobbies || '',
            cefalea: Boolean(initialAnamnesis?.cefalea),
            ardor: Boolean(initialAnamnesis?.ardor),
            ojo_seco: Boolean(initialAnamnesis?.ojo_seco),
            lagrimeo: Boolean(initialAnamnesis?.lagrimeo),
            fotofobia: Boolean(initialAnamnesis?.fotofobia),
            vision_doble: Boolean(initialAnamnesis?.vision_doble),
            destellos: Boolean(initialAnamnesis?.destellos),
            manchas: Boolean(initialAnamnesis?.manchas),
            dificultad_cerca: Boolean(initialAnamnesis?.dificultad_cerca),
            diabetes: Boolean(initialAnamnesis?.diabetes),
            diabetes_controlada: initialAnamnesis?.diabetes_controlada ?? true,
            hipertension: Boolean(initialAnamnesis?.hipertension),
            alergias: Boolean(initialAnamnesis?.alergias),
            migranas: Boolean(initialAnamnesis?.migranas),
            cirugias_previas: Boolean(initialAnamnesis?.cirugias_previas),
            trauma_ocular: Boolean(initialAnamnesis?.trauma_ocular),
            medicamentos: initialAnamnesis?.medicamentos || '',
            antecedentes_familiares: initialAnamnesis?.antecedentes_familiares || '',
            usa_anteojos: Boolean(initialAnamnesis?.usa_anteojos),
            proposito_anteojos: initialAnamnesis?.proposito_anteojos || '',
            usa_lentes_contacto: Boolean(initialAnamnesis?.usa_lentes_contacto),
            tipo_lentes_contacto: initialAnamnesis?.tipo_lentes_contacto || '',
            horas_uso_lc: initialAnamnesis?.horas_uso_lc || '',
            molestias_lc: Boolean(initialAnamnesis?.molestias_lc),
        })
    }, [open, initialAnamnesis])

    useEffect(() => {
        if (!successData?.id) return undefined
        setShowConsultaSavedNotice(true)
        setActiveTab('consulta')
        const revealDocuments = window.setTimeout(() => {
            documentsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }, 180)
        const timeout = window.setTimeout(() => setShowConsultaSavedNotice(false), 3200)
        return () => {
            window.clearTimeout(timeout)
            window.clearTimeout(revealDocuments)
        }
    }, [successData?.id])

    const handleCloseRequest = () => {
        if (!successData?.id) {
            const shouldClose = window.confirm('La consulta aun no fue guardada. Si cierras ahora, perderas los datos cargados. Deseas salir igual?')
            if (!shouldClose) return
        }
        onClose()
    }

    if (!open || !patient) return null

    return (
        <Modal
            title={`Consulta Clinica Integral - ${patient.nombre_completo || 'Paciente'}`}
            onClose={handleCloseRequest}
            maxWidth="1120px"
            closeOnBackdrop={false}
        >
            <div style={{ display: 'grid', gap: 18 }}>
                <div
                    className="card"
                    style={{
                        padding: 16,
                        background: CLINICA_PALETTE.accentSoft,
                        border: `1px solid ${CLINICA_PALETTE.accentBorder}`,
                        position: 'sticky',
                        top: 0,
                        zIndex: 5,
                        backdropFilter: 'blur(8px)',
                    }}
                >
                    <div style={{ display: 'grid', gap: 14 }}>
                        <div className="flex gap-12" style={{ flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                className={activeTab === 'anamnesis' ? 'btn btn-primary' : 'btn btn-secondary'}
                                onClick={() => setActiveTab('anamnesis')}
                                style={{ borderRadius: 12 }}
                            >
                                Anamnesis detallada
                            </button>
                            <button
                                type="button"
                                className={activeTab === 'consulta' && type === 'OFTALMOLOGIA' ? 'btn btn-primary' : 'btn btn-secondary'}
                                onClick={() => {
                                    onTypeChange('OFTALMOLOGIA')
                                    setActiveTab('consulta')
                                }}
                                style={{ borderRadius: 12 }}
                            >
                                Oftalmologia
                            </button>
                            <button
                                type="button"
                                className={activeTab === 'consulta' && type === 'CONTACTOLOGIA' ? 'btn btn-primary' : 'btn btn-secondary'}
                                onClick={() => {
                                    onTypeChange('CONTACTOLOGIA')
                                    setActiveTab('consulta')
                                }}
                                style={{ borderRadius: 12 }}
                            >
                                Contactologia
                            </button>
                            <div
                                style={{
                                    marginLeft: 'auto',
                                    display: 'flex',
                                    gap: 8,
                                    flexWrap: 'wrap',
                                }}
                            >
                                {[
                                    { key: 'anamnesis', label: 'Paso 1: Anamnesis', active: activeTab === 'anamnesis' },
                                    { key: 'consulta', label: 'Paso 2: Consulta', active: activeTab === 'consulta' },
                                    { key: 'documentos', label: 'Paso 3: Documentos', active: Boolean(successData?.id) },
                                ].map(step => (
                                    <span
                                        key={step.key}
                                        style={{
                                            padding: '8px 10px',
                                            borderRadius: 999,
                                            fontSize: '0.78rem',
                                            fontWeight: 700,
                                            background: step.active ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.06)',
                                            border: `1px solid ${step.active ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)'}`,
                                            color: step.active ? '#e6fffc' : 'var(--text-muted)',
                                        }}
                                    >
                                        {step.label}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'minmax(220px, 1.4fr) repeat(4, minmax(120px, 1fr))',
                                gap: 12,
                                alignItems: 'start',
                            }}
                        >
                            <div>
                                <div style={{ fontSize: '1.08rem', fontWeight: 800, marginBottom: 4 }}>
                                    {patient.nombre_completo || 'Paciente'}
                                </div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                                    {patient.es_cliente ? 'Cliente vinculado' : 'Paciente aun no vinculado'}
                                </div>
                            </div>
                            <div>
                                <div className="form-label" style={{ marginBottom: 4 }}>CI / Pasaporte</div>
                                <div style={{ color: 'var(--text-primary)' }}>{patient.ci_pasaporte || '-'}</div>
                            </div>
                            <div>
                                <div className="form-label" style={{ marginBottom: 4 }}>Edad</div>
                                <div style={{ color: 'var(--text-primary)' }}>{patient.edad_calculada ?? patient.edad_manual ?? '-'}</div>
                            </div>
                            <div>
                                <div className="form-label" style={{ marginBottom: 4 }}>Telefono</div>
                                <div style={{ color: 'var(--text-primary)' }}>{patient.telefono || '-'}</div>
                            </div>
                            <div>
                                <div className="form-label" style={{ marginBottom: 4 }}>Referidor</div>
                                <div style={{ color: 'var(--text-primary)' }}>{patient.referidor_nombre || 'Sin referidor'}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="card" style={{ padding: 18 }}>
                    {activeTab === 'anamnesis' ? (
                        <>
                            <div style={{ marginBottom: 16 }}>
                                <div style={{ fontSize: '1rem', fontWeight: 800 }}>Anamnesis detallada</div>
                                <div style={{ color: 'var(--text-muted)', marginTop: 6 }}>
                                    Primera fase de paridad con Python: motivo, estilo de vida, sintomas, salud general y correccion actual.
                                </div>
                            </div>
                            {anamnesisLoading ? (
                                <div className="empty-state" style={{ padding: '48px 18px' }}>Cargando ultima anamnesis...</div>
                            ) : (
                                <>
                                    <AnamnesisClinicaForm value={anamnesisDraft} onChange={setAnamnesisDraft} />
                                    <div className="flex gap-12" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
                                        <button type="button" className="btn btn-secondary" onClick={handleCloseRequest}>Cancelar</button>
                                        <button type="button" className="btn btn-primary" onClick={() => setActiveTab('consulta')}>Continuar a consulta</button>
                                    </div>
                                </>
                            )}
                        </>
                    ) : (
                        <>
                            <div style={{ marginBottom: 16 }}>
                                <div style={{ fontSize: '1rem', fontWeight: 800 }}>
                                    {type === 'OFTALMOLOGIA' ? 'Consulta Oftalmologica' : 'Consulta de Contactologia'}
                                </div>
                                <div style={{ color: 'var(--text-muted)', marginTop: 6 }}>
                                    Flujo modal inspirado en Python: alta separada, anamnesis previa y consulta en la misma ventana.
                                </div>
                            </div>

                            {error && (
                                <div className="alert alert-error" style={{ marginBottom: 16 }}>
                                    {error}
                                </div>
                            )}

                            {showConsultaSavedNotice && (
                                <div
                                    style={{
                                        marginBottom: 16,
                                        padding: '10px 14px',
                                        borderRadius: 12,
                                        background: 'rgba(34,197,94,0.12)',
                                        border: '1px solid rgba(34,197,94,0.24)',
                                        color: '#86efac',
                                        fontWeight: 700,
                                    }}
                                >
                                    Consulta guardada correctamente.
                                </div>
                            )}

                            <ConsultaClinicaForm
                                key={`${type}-${patient.id}`}
                                type={type}
                                initialData={null}
                                pacienteId={patient.id}
                                doctores={doctores}
                                lugares={lugares}
                                onSave={payload => onSave({ ...payload, anamnesis: anamnesisDraft })}
                                onCancel={handleCloseRequest}
                                saving={saving}
                                saved={Boolean(successData?.id)}
                            />
                            <div
                                className="card"
                                style={{
                                    marginTop: 16,
                                    padding: 16,
                                    display: 'grid',
                                    gap: 10,
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                }}
                            >
                                <div style={{ fontWeight: 700 }}>Receta de medicamentos</div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                    La acción queda visible durante toda la carga de la consulta. Se habilita cuando la consulta ya fue guardada.
                                </div>
                                <div className="flex gap-12" style={{ flexWrap: 'wrap' }}>
                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        onClick={onOpenRecetaMedicamentos}
                                        disabled={!successData}
                                        title={successData ? '' : 'Primero debes guardar la consulta'}
                                    >
                                        <Plus size={16} /> Receta de medicamentos
                                    </button>
                                </div>
                            </div>
                            {successData && (
                                <div
                                    ref={documentsRef}
                                    className="card"
                                    style={{
                                        marginTop: 16,
                                        padding: 16,
                                        display: 'grid',
                                        gap: 14,
                                        background: 'rgba(34,197,94,0.08)',
                                        border: '1px solid rgba(34,197,94,0.18)',
                                    }}
                                >
                                    <div style={{ display: 'grid', gap: 6 }}>
                                        <div style={{ fontWeight: 700, color: 'var(--success)' }}>
                                            Paso siguiente: documentos de esta consulta
                                        </div>
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                            La consulta ya quedó guardada. Desde aquí puedes emitir la receta óptica o las indicaciones.
                                        </div>
                                    </div>
                                    <div className="flex gap-12" style={{ flexWrap: 'wrap' }}>
                                        {type === 'OFTALMOLOGIA' && (
                                            <button type="button" className="btn btn-secondary" onClick={onOpenLentesPdf}>
                                                <FileText size={16} /> Receta de lentes PDF
                                            </button>
                                        )}
                                        <button type="button" className="btn btn-secondary" onClick={onOpenIndicacionesPdf}>
                                            <FileText size={16} /> Indicaciones PDF
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </Modal>
    )
}

function RecetaMedicamentoForm({
    initialData,
    pacienteId,
    consultaId = null,
    consultaTipo = null,
    doctorOptions = [],
    onSearchMedicamento,
    medicamentoOptions,
    medicamentoLoading,
    onCreateMedicamento,
    onSave,
    onCancel,
    saving,
    readOnly = false,
    savedReceta = null,
    recentMedicamento = null,
    onOpenCompraPdf,
    onOpenIndicacionesPdf,
}) {
    const recipeAlreadySaved = Boolean(savedReceta?.id)
    const [form, setForm] = useState(() => ({
        fecha_emision: initialData?.fecha_emision ? String(initialData.fecha_emision).slice(0, 16) : new Date().toISOString().slice(0, 16),
        doctor_nombre: initialData?.doctor_nombre || '',
        diagnostico: initialData?.diagnostico || '',
        observaciones: initialData?.observaciones || '',
        detalles: (initialData?.detalles || []).map((detalle, index) => ({
            key: `${detalle?.medicamento_id || detalle?.medicamento || 'detalle'}-${index}`,
            medicamento: detalle?.medicamento_id ? { id: detalle.medicamento_id, nombre_comercial: detalle.medicamento || 'Medicamento' } : null,
            posologia_personalizada: detalle?.posologia_personalizada || '',
            duracion_tratamiento: detalle?.duracion_tratamiento || '',
        })),
    }))
    const [error, setError] = useState('')
    const [showSavedNotice, setShowSavedNotice] = useState(false)

    useEffect(() => {
        setForm({
            fecha_emision: initialData?.fecha_emision ? String(initialData.fecha_emision).slice(0, 16) : new Date().toISOString().slice(0, 16),
            doctor_nombre: initialData?.doctor_nombre || '',
            diagnostico: initialData?.diagnostico || '',
            observaciones: initialData?.observaciones || '',
            detalles: (initialData?.detalles || []).map((detalle, index) => ({
                key: detalle?.key || `${detalle?.medicamento_id || detalle?.medicamento || 'detalle'}-${index}`,
                medicamento: detalle?.medicamento?.id
                    ? detalle.medicamento
                    : (detalle?.medicamento_id ? { id: detalle.medicamento_id, nombre_comercial: detalle.medicamento || 'Medicamento' } : null),
                posologia_personalizada: detalle?.posologia_personalizada || '',
                duracion_tratamiento: detalle?.duracion_tratamiento || '',
            })),
        })
    }, [initialData])

    useEffect(() => {
        if (!savedReceta?.id) return undefined
        setShowSavedNotice(true)
        const timeout = window.setTimeout(() => setShowSavedNotice(false), 3200)
        return () => window.clearTimeout(timeout)
    }, [savedReceta?.id])

    useEffect(() => {
        if (!recentMedicamento?.id) return
        setForm(prev => {
            const alreadyExists = prev.detalles.some(detalle => Number(detalle.medicamento?.id) === Number(recentMedicamento.id))
            if (alreadyExists) {
                return prev
            }
            const emptyIndex = prev.detalles.findIndex(detalle => !detalle.medicamento?.id)
            if (emptyIndex >= 0) {
                return {
                    ...prev,
                    detalles: prev.detalles.map((detalle, index) => index === emptyIndex ? { ...detalle, medicamento: recentMedicamento } : detalle),
                }
            }
            return {
                ...prev,
                detalles: [
                    ...prev.detalles,
                    {
                        key: `nuevo-medicamento-${recentMedicamento.id}-${Date.now()}`,
                        medicamento: recentMedicamento,
                        posologia_personalizada: '',
                        duracion_tratamiento: '',
                    },
                ],
            }
        })
    }, [recentMedicamento])

    const addDetalle = () => {
        setForm(prev => ({
            ...prev,
            detalles: [
                ...prev.detalles,
                {
                    key: `nuevo-${Date.now()}-${prev.detalles.length}`,
                    medicamento: null,
                    posologia_personalizada: '',
                    duracion_tratamiento: '',
                },
            ],
        }))
    }

    const updateDetalle = (key, patch) => {
        setForm(prev => ({
            ...prev,
            detalles: prev.detalles.map(detalle => detalle.key === key ? { ...detalle, ...patch } : detalle),
        }))
    }

    const removeDetalle = key => {
        setForm(prev => ({
            ...prev,
            detalles: prev.detalles.filter(detalle => detalle.key !== key),
        }))
    }

    const submit = event => {
        event.preventDefault()
        if (readOnly) return
        if (!form.detalles.length) {
            setError('Debe agregar al menos un medicamento.')
            return
        }
        if (form.detalles.some(detalle => !detalle.medicamento?.id)) {
            setError('Todos los detalles deben tener un medicamento seleccionado.')
            return
        }
        setError('')
        onSave({
            paciente_id: pacienteId,
            consulta_id: consultaId,
            consulta_tipo: consultaTipo,
            fecha_emision: form.fecha_emision ? new Date(form.fecha_emision).toISOString() : null,
            doctor_nombre: form.doctor_nombre.trim() || null,
            diagnostico: form.diagnostico.trim() || null,
            observaciones: form.observaciones.trim() || null,
            detalles: form.detalles.map(detalle => ({
                medicamento_id: detalle.medicamento.id,
                posologia_personalizada: detalle.posologia_personalizada.trim() || null,
                duracion_tratamiento: detalle.duracion_tratamiento.trim() || null,
            })),
        })
    }

    return (
        <form onSubmit={submit}>
            <div className="grid-2">
                <div className="form-group">
                    <label className="form-label">Fecha y hora</label>
                    <input className="form-input" type="datetime-local" value={form.fecha_emision} onChange={event => setForm(prev => ({ ...prev, fecha_emision: event.target.value }))} disabled={readOnly} />
                </div>
                <div className="form-group">
                    <label className="form-label">Doctor</label>
                    {readOnly ? (
                        <input className="form-input" value={form.doctor_nombre} disabled />
                    ) : (
                        <RemoteSearchSelect
                            value={doctorOptions.find(option => option?.nombre_completo === form.doctor_nombre) || null}
                            onChange={option => setForm(prev => ({ ...prev, doctor_nombre: option?.nombre_completo || '' }))}
                            onSearch={() => {}}
                            options={doctorOptions}
                            loading={false}
                            placeholder="Seleccionar doctor..."
                            promptMessage="Seleccione un doctor"
                            emptyMessage="Sin doctores"
                            minChars={0}
                            floating={false}
                            getOptionLabel={option => option?.nombre_completo || ''}
                            getOptionValue={option => option?.id}
                        />
                    )}
                </div>
            </div>
            <div className="grid-2">
                <div className="form-group">
                    <label className="form-label">Diagnostico</label>
                    <textarea className="form-input" value={form.diagnostico} onChange={event => setForm(prev => ({ ...prev, diagnostico: event.target.value }))} style={{ minHeight: 96, resize: 'none', width: '100%' }} disabled={readOnly} />
                    <QuickTemplateButtons
                        label="Diagnosticos rapidos"
                        options={DIAGNOSTICOS_RECETA_RAPIDOS}
                        onApply={snippet => setForm(prev => ({ ...prev, diagnostico: appendTemplateText(prev.diagnostico, snippet) }))}
                        disabled={readOnly}
                    />
                </div>
                <div className="form-group">
                    <label className="form-label">Observaciones</label>
                    <textarea className="form-input" value={form.observaciones} onChange={event => setForm(prev => ({ ...prev, observaciones: event.target.value }))} style={{ minHeight: 96, resize: 'none', width: '100%' }} disabled={readOnly} />
                    <QuickTemplateButtons
                        label="Indicaciones rapidas"
                        options={PLANES_CONTACTOLOGIA_RAPIDOS}
                        onApply={snippet => setForm(prev => ({ ...prev, observaciones: appendTemplateText(prev.observaciones, snippet) }))}
                        disabled={readOnly}
                    />
                </div>
            </div>

            <div className="card" style={{ padding: 16, marginTop: 10 }}>
                <div className="flex-between" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                    <div style={{ fontWeight: 700 }}>Medicamentos</div>
                    {!readOnly && (
                        <div className="flex gap-12" style={{ flexWrap: 'wrap' }}>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={addDetalle}><Plus size={14} /> Agregar medicamento</button>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={onCreateMedicamento}><Plus size={14} /> Nuevo medicamento</button>
                        </div>
                    )}
                </div>

                <div style={{ display: 'grid', gap: 12 }}>
                    {form.detalles.length ? form.detalles.map(detalle => (
                        <div key={detalle.key} className="card" style={{ padding: 14, background: 'rgba(255,255,255,0.02)' }}>
                            <div className="form-group">
                                <label className="form-label">Medicamento</label>
                                <RemoteSearchSelect
                                    value={detalle.medicamento}
                                    onChange={option => updateDetalle(detalle.key, { medicamento: option })}
                                    onSearch={onSearchMedicamento}
                                    options={medicamentoOptions}
                                    loading={medicamentoLoading}
                                    placeholder="Buscar medicamento..."
                                    promptMessage="Escriba para buscar medicamento"
                                    emptyMessage="Sin medicamentos"
                                    minChars={0}
                                    floating={false}
                                    getOptionLabel={option => option?.nombre_comercial || ''}
                                    getOptionValue={option => option?.id}
                                />
                            </div>
                            <div className="grid-2">
                                <div className="form-group">
                                    <label className="form-label">Posologia</label>
                                    <textarea className="form-input" value={detalle.posologia_personalizada} onChange={event => updateDetalle(detalle.key, { posologia_personalizada: event.target.value })} style={{ minHeight: 86, resize: 'none', width: '100%' }} disabled={readOnly} />
                                    <QuickTemplateButtons
                                        label="Posologias rapidas"
                                        options={POSOLOGIAS_RAPIDAS}
                                        onApply={snippet => updateDetalle(detalle.key, { posologia_personalizada: appendTemplateText(detalle.posologia_personalizada, snippet) })}
                                        disabled={readOnly}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Duracion</label>
                                    <input className="form-input" value={detalle.duracion_tratamiento} onChange={event => updateDetalle(detalle.key, { duracion_tratamiento: event.target.value })} disabled={readOnly} />
                                    <QuickTemplateButtons
                                        label="Duraciones rapidas"
                                        options={DURACIONES_RAPIDAS}
                                        onApply={snippet => updateDetalle(detalle.key, { duracion_tratamiento: snippet })}
                                        disabled={readOnly}
                                    />
                                </div>
                            </div>
                            {!readOnly && (
                                <div className="flex" style={{ justifyContent: 'flex-end' }}>
                                    <button type="button" className="btn btn-danger btn-sm" onClick={() => removeDetalle(detalle.key)}><Trash2 size={14} /> Quitar</button>
                                </div>
                            )}
                        </div>
                    )) : <div style={{ color: 'var(--text-muted)' }}>Todavia no hay medicamentos agregados.</div>}
                </div>
            </div>

            {showSavedNotice && (
                <div
                    style={{
                        marginTop: 16,
                        padding: '10px 14px',
                        borderRadius: 12,
                        background: 'rgba(34,197,94,0.12)',
                        border: '1px solid rgba(34,197,94,0.24)',
                        color: '#86efac',
                        fontWeight: 700,
                    }}
                >
                    Receta guardada correctamente.
                </div>
            )}
            {savedReceta?.id && (
                <div
                    className="card"
                    style={{
                        marginTop: 16,
                        padding: 16,
                        display: 'grid',
                        gap: 14,
                        background: 'rgba(34,197,94,0.08)',
                        border: '1px solid rgba(34,197,94,0.18)',
                    }}
                >
                    <div style={{ fontWeight: 700, color: 'var(--success)' }}>Documentos listos para generar</div>
                    <div className="flex gap-12" style={{ flexWrap: 'wrap' }}>
                        <button type="button" className="btn btn-secondary" onClick={onOpenCompraPdf}>
                            <FileText size={16} /> Receta de medicamentos PDF
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={onOpenIndicacionesPdf}>
                            <FileText size={16} /> Indicaciones de uso PDF
                        </button>
                    </div>
                </div>
            )}
            {error && <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>}
            <div className="flex gap-12" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
                <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancelar</button>
                {!readOnly && (
                    <button type="submit" className="btn btn-primary" disabled={saving || recipeAlreadySaved}>
                        {recipeAlreadySaved ? 'Receta guardada' : saving ? 'Guardando...' : 'Guardar receta'}
                    </button>
                )}
            </div>
        </form>
    )
}

function HistorialClinicoModal({ open, pacienteId, onClose, onEditPaciente, onRefreshPacientes }) {
    const { user } = useAuth()
    const queryClient = useQueryClient()
    const [tab, setTab] = useState('oftalmologia')
    const [selectedId, setSelectedId] = useState(null)
    const [consultaModal, setConsultaModal] = useState(null)
    const [recetaModal, setRecetaModal] = useState(null)
    const [modalMedicamento, setModalMedicamento] = useState(null)
    const [recentCreatedMedicamento, setRecentCreatedMedicamento] = useState(null)
    const [medicamentoSearch, setMedicamentoSearch] = useState('')
    const [consultaSavePhase, setConsultaSavePhase] = useState('idle')

    const historialQuery = useQuery({
        queryKey: ['clinica', 'paciente-historial', pacienteId],
        queryFn: async () => (await api.get(`/clinica/pacientes/${pacienteId}/historial`)).data,
        enabled: open && Boolean(pacienteId),
    })

    const doctoresQuery = useQuery({
        queryKey: ['clinica', 'doctores-simple'],
        queryFn: async () => (await api.get('/clinica/doctores/simple')).data,
        enabled: open && hasActionAccess(user, 'clinica.doctores', 'clinica'),
        staleTime: 5 * 60 * 1000,
    })

    const lugaresQuery = useQuery({
        queryKey: ['clinica', 'lugares-simple'],
        queryFn: async () => (await api.get('/clinica/lugares/simple')).data,
        enabled: open && hasActionAccess(user, 'clinica.lugares', 'clinica'),
        staleTime: 5 * 60 * 1000,
    })

    const medicamentosQuery = useQuery({
        queryKey: ['clinica', 'medicamentos-simple', medicamentoSearch],
        queryFn: async () => (await api.get(`/clinica/vademecum/medicamentos/simple?${queryString({ buscar: medicamentoSearch, page_size: 12 })}`)).data,
        enabled: open && medicamentoSearch.trim().length >= 1,
    })

    const currentList = Array.isArray(historialQuery.data?.[tab])
        ? historialQuery.data[tab].filter(item => item && typeof item === 'object')
        : []
    const selectedItem = currentList.find(item => item?.id === selectedId) || currentList[0] || null

    useEffect(() => {
        setSelectedId(currentList[0]?.id || null)
    }, [tab, historialQuery.data])

    const detalleQuery = useQuery({
        queryKey: ['clinica', 'consulta-detalle', tab, selectedId],
        queryFn: async () => (await api.get(`/clinica/consultas/${tab}/${selectedId}`)).data,
        enabled: open && Boolean(selectedId) && tab !== 'recetas_medicamentos',
    })

    const invalidateAll = () => {
        void Promise.all([
            queryClient.invalidateQueries({ queryKey: ['clinica', 'pacientes'] }),
            queryClient.invalidateQueries({ queryKey: ['clinica', 'paciente-historial', pacienteId] }),
            queryClient.invalidateQueries({ queryKey: ['clinica', 'dashboard'] }),
            queryClient.invalidateQueries({ queryKey: ['clinica', 'consulta-detalle'] }),
            queryClient.invalidateQueries({ queryKey: ['clinica', 'historial-general-detalle'] }),
        ])
        onRefreshPacientes?.()
    }

    const saveConsultaMutation = useMutation({
        mutationFn: async payload => {
            const tipo = consultaModal?.type || 'OFTALMOLOGIA'
            const endpoint = tipo === 'OFTALMOLOGIA' ? '/clinica/consultas/oftalmologia' : '/clinica/consultas/contactologia'
            if (consultaModal?.mode === 'edit') return (await api.put(`${endpoint}/${consultaModal.id}`, payload)).data
            return (await api.post(endpoint, payload)).data
        },
        onMutate: () => {
            setConsultaSavePhase('saving')
        },
        onSuccess: async () => {
            setConsultaSavePhase('refreshing')
            invalidateAll()
            setConsultaModal(null)
            setConsultaSavePhase('idle')
        },
        onError: () => {
            setConsultaSavePhase('idle')
        },
    })

    const deleteConsultaMutation = useMutation({
        mutationFn: async ({ type, id }) => {
            const endpoint = type === 'OFTALMOLOGIA' ? `/clinica/consultas/oftalmologia/${id}` : `/clinica/consultas/contactologia/${id}`
            await api.delete(endpoint)
        },
        onSuccess: invalidateAll,
    })

    const saveRecetaMutation = useMutation({
        mutationFn: async payload => {
            if (recetaModal?.mode === 'edit') return (await api.put(`/clinica/recetas-medicamentos/${recetaModal.id}`, payload)).data
            return (await api.post('/clinica/recetas-medicamentos', payload)).data
        },
        onSuccess: () => {
            setRecetaModal(null)
            setMedicamentoSearch('')
            invalidateAll()
        },
    })

    const saveMedicamentoMutation = useMutation({
        mutationFn: async payload => (await api.post('/clinica/vademecum/medicamentos', payload)).data,
        onSuccess: async result => {
            setRecentCreatedMedicamento(result)
            setModalMedicamento(null)
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['clinica', 'medicamentos-simple'] }),
                queryClient.invalidateQueries({ queryKey: ['clinica', 'vademecum-medicamentos'] }),
            ])
        },
    })

    const deleteRecetaMutation = useMutation({
        mutationFn: async id => {
            await api.delete(`/clinica/recetas-medicamentos/${id}`)
        },
        onSuccess: invalidateAll,
    })

    if (!open) return null

    const paciente = historialQuery.data?.paciente
    const oftCount = Array.isArray(historialQuery.data?.oftalmologia) ? historialQuery.data.oftalmologia.filter(Boolean).length : 0
    const contCount = Array.isArray(historialQuery.data?.contactologia) ? historialQuery.data.contactologia.filter(Boolean).length : 0
    const recetasCount = Array.isArray(historialQuery.data?.recetas_medicamentos) ? historialQuery.data.recetas_medicamentos.filter(Boolean).length : 0
    const ultimaOftalmologia = historialQuery.data?.oftalmologia?.[0] || null
    const ultimaContactologia = historialQuery.data?.contactologia?.[0] || null
    const ultimaRecetaMedicamento = historialQuery.data?.recetas_medicamentos?.[0] || null
    const canCreate = hasActionAccess(user, 'clinica.consultas_crear', 'clinica')
    const canEdit = hasActionAccess(user, 'clinica.consultas_editar', 'clinica')
    const canView = hasActionAccess(user, 'clinica.consultas_ver', 'clinica')
    const canExport = hasActionAccess(user, 'clinica.consultas_exportar', 'clinica')
    const canConvert = hasActionAccess(user, 'clinica.convertir_cliente', 'clinica')

    const openConsultaModal = async mode => {
        if (!selectedId || tab === 'recetas_medicamentos') return
        try {
            const response = await api.get(`/clinica/consultas/${tab}/${selectedId}`)
            setConsultaModal({ mode, type: tab === 'oftalmologia' ? 'OFTALMOLOGIA' : 'CONTACTOLOGIA', id: selectedId, initialData: response.data })
        } catch (error) {
            window.alert(formatError(error, 'No se pudo cargar la consulta.'))
        }
    }

    const openPdfConsulta = async () => {
        if (!selectedId || tab === 'recetas_medicamentos') return
        try {
            const response = await api.get(`/clinica/consultas/${tab}/${selectedId}/pdf`, { responseType: 'blob' })
            const blob = new Blob([response.data], { type: 'application/pdf' })
            const url = window.URL.createObjectURL(blob)
            window.open(url, '_blank', 'noopener,noreferrer')
            setTimeout(() => window.URL.revokeObjectURL(url), 1500)
        } catch (error) {
            window.alert(formatError(error, 'No se pudo generar el PDF.'))
        }
    }

    const openRecetaModal = async mode => {
        if (!selectedId || tab !== 'recetas_medicamentos') return
        try {
            setRecentCreatedMedicamento(null)
            const response = await api.get(`/clinica/recetas-medicamentos/${selectedId}`)
            setRecetaModal({ mode, id: selectedId, initialData: response.data })
        } catch (error) {
            window.alert(formatError(error, 'No se pudo cargar la receta.'))
        }
    }

    const openPdfReceta = async () => {
        if (!selectedId || tab !== 'recetas_medicamentos') return
        try {
            const response = await api.get(`/clinica/recetas-medicamentos/${selectedId}/pdf`, { responseType: 'blob' })
            const blob = new Blob([response.data], { type: 'application/pdf' })
            const url = window.URL.createObjectURL(blob)
            window.open(url, '_blank', 'noopener,noreferrer')
            setTimeout(() => window.URL.revokeObjectURL(url), 1500)
        } catch (error) {
            window.alert(formatError(error, 'No se pudo generar el PDF de la receta.'))
        }
    }

    return (
        <>
            <Modal title={`Historial clinico - ${paciente?.nombre_completo || 'Paciente'}`} onClose={onClose} maxWidth="1200px">
                {historialQuery.isLoading ? (
                    <div className="empty-state" style={{ padding: '56px 20px' }}>Cargando historial clinico...</div>
                ) : historialQuery.isError ? (
                    <div className="alert alert-error" style={{ marginTop: 16 }}>{formatError(historialQuery.error, 'No se pudo cargar el historial clinico.')}</div>
                ) : (
                    <div style={{ display: 'grid', gap: 18 }}>
                        <div
                            className="card"
                            style={{
                                padding: 18,
                                background: CLINICA_PALETTE.panel,
                                border: `1px solid ${CLINICA_PALETTE.accentBorder}`,
                            }}
                        >
                            <div className="flex-between" style={{ gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                <div style={{ display: 'grid', gap: 12, minWidth: 0, flex: 1 }}>
                                    <div>
                                        <div style={{ fontSize: '1.08rem', fontWeight: 800 }}>
                                            {paciente?.nombre_completo || 'Paciente'}
                                        </div>
                                        <div style={{ color: 'var(--text-muted)', marginTop: 6 }}>
                                            Centro clinico del paciente: consultas, recetas y documentos en un solo lugar.
                                        </div>
                                    </div>
                                    <div
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
                                            gap: 12,
                                        }}
                                    >
                                        <div>
                                            <div className="form-label" style={{ marginBottom: 4 }}>CI / Pasaporte</div>
                                            <div>{paciente?.ci_pasaporte || '-'}</div>
                                        </div>
                                        <div>
                                            <div className="form-label" style={{ marginBottom: 4 }}>Edad</div>
                                            <div>{paciente?.edad_calculada ?? paciente?.edad_manual ?? '-'}</div>
                                        </div>
                                        <div>
                                            <div className="form-label" style={{ marginBottom: 4 }}>Telefono</div>
                                            <div>{paciente?.telefono || '-'}</div>
                                        </div>
                                        <div>
                                            <div className="form-label" style={{ marginBottom: 4 }}>Referidor</div>
                                            <div>{paciente?.referidor_nombre || 'Sin referidor'}</div>
                                        </div>
                                        <div>
                                            <div className="form-label" style={{ marginBottom: 4 }}>Cliente</div>
                                            <div>{paciente?.es_cliente ? 'Vinculado' : 'Pendiente'}</div>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-12" style={{ flexWrap: 'wrap' }}>
                                    {hasActionAccess(user, 'clinica.pacientes_editar', 'clinica') && <button type="button" className="btn btn-secondary" onClick={() => onEditPaciente?.(paciente)}><Pencil size={16} /> Editar paciente</button>}
                                    {tab !== 'recetas_medicamentos' && canCreate && <button type="button" className="btn btn-primary" onClick={() => setConsultaModal({ mode: 'create', type: tab === 'contactologia' ? 'CONTACTOLOGIA' : 'OFTALMOLOGIA', initialData: null })}><Plus size={16} /> Nueva consulta</button>}
                                    {tab === 'recetas_medicamentos' && canCreate && <button type="button" className="btn btn-primary" onClick={() => setRecetaModal({ mode: 'create', id: null, initialData: null })}><Plus size={16} /> Nueva receta</button>}
                                    {canConvert && !paciente?.es_cliente && (
                                        <button type="button" className="btn btn-secondary" onClick={async () => {
                                            if (!paciente?.id) return
                                            try {
                                                await api.post(`/clinica/pacientes/${paciente.id}/convertir-cliente`)
                                                await invalidateAll()
                                            } catch (error) {
                                                window.alert(formatError(error, 'No se pudo convertir el paciente a cliente.'))
                                            }
                                        }}>
                                            <Users size={16} />
                                            Convertir a cliente
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div
                            className="dashboard-stats"
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                                gap: 12,
                                alignItems: 'stretch',
                            }}
                        >
                            <StatCard label="Oftalmologia" value={oftCount} detail="Consultas registradas" accent={CLINICA_PALETTE.accent} />
                            <StatCard label="Contactologia" value={contCount} detail="Consultas registradas" accent={CLINICA_PALETTE.accentAlt} />
                            <StatCard label="Recetas" value={recetasCount} detail="Medicamentos emitidos" accent="#f59e0b" />
                        </div>

                        <div className="card" style={{ padding: 16 }}>
                            <SectionHeader
                                title="Resumen longitudinal"
                                subtitle="Vista rapida del ultimo movimiento clinico del paciente."
                            />
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                                    gap: 12,
                                }}
                            >
                                <div className="card" style={{ padding: 14, background: 'rgba(255,255,255,0.02)' }}>
                                    <div style={{ fontWeight: 700, marginBottom: 8 }}>Ultima oftalmologia</div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.86rem' }}>{fmtDateTime(ultimaOftalmologia?.fecha)}</div>
                                    <div style={{ marginTop: 8 }}><strong>Diagnostico:</strong> {ultimaOftalmologia?.diagnostico || '-'}</div>
                                    <div style={{ marginTop: 6 }}><strong>Plan:</strong> {ultimaOftalmologia?.plan_tratamiento || '-'}</div>
                                    <div style={{ marginTop: 6 }}><strong>Proximo control:</strong> {fmtDate(ultimaOftalmologia?.fecha_control)}</div>
                                </div>
                                <div className="card" style={{ padding: 14, background: 'rgba(255,255,255,0.02)' }}>
                                    <div style={{ fontWeight: 700, marginBottom: 8 }}>Ultima contactologia</div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.86rem' }}>{fmtDateTime(ultimaContactologia?.fecha)}</div>
                                    <div style={{ marginTop: 8 }}><strong>Resumen:</strong> {ultimaContactologia?.resumen || ultimaContactologia?.diagnostico || '-'}</div>
                                    <div style={{ marginTop: 6 }}><strong>Proximo control:</strong> {fmtDate(ultimaContactologia?.fecha_control)}</div>
                                </div>
                                <div className="card" style={{ padding: 14, background: 'rgba(255,255,255,0.02)' }}>
                                    <div style={{ fontWeight: 700, marginBottom: 8 }}>Ultima receta</div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.86rem' }}>{fmtDateTime(ultimaRecetaMedicamento?.fecha_emision)}</div>
                                    <div style={{ marginTop: 8 }}><strong>Diagnostico:</strong> {ultimaRecetaMedicamento?.diagnostico || '-'}</div>
                                    <div style={{ marginTop: 6 }}><strong>Medicamentos:</strong> {ultimaRecetaMedicamento?.detalles?.length || 0}</div>
                                </div>
                            </div>
                        </div>

                        <div className="card" style={{ padding: 14 }}>
                            <div style={{ fontWeight: 700, marginBottom: 10 }}>Seccion del historial</div>
                            <div className="flex gap-12" style={{ flexWrap: 'wrap' }}>
                                {[
                                    ['oftalmologia', `Oftalmologia (${oftCount})`],
                                    ['contactologia', `Contactologia (${contCount})`],
                                    ['recetas_medicamentos', `Recetas (${recetasCount})`],
                                ].map(([key, label]) => (
                                    <button type="button" key={key} className={tab === key ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setTab(key)}>{label}</button>
                                ))}
                            </div>
                        </div>

                        <div className="card" style={{ padding: 16 }}>
                            <div style={{ fontWeight: 700, marginBottom: 6 }}>
                                {tab === 'recetas_medicamentos' ? 'Acciones sobre la receta seleccionada' : 'Acciones sobre la consulta seleccionada'}
                            </div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 14 }}>
                                Primero selecciona un registro en la tabla. Luego usa estas acciones para revisar, editar, exportar o eliminar.
                            </div>
                            <div className="flex gap-12" style={{ flexWrap: 'wrap' }}>
                                {tab !== 'recetas_medicamentos' && canView && <button type="button" className="btn btn-secondary" onClick={() => openConsultaModal('view')} disabled={!selectedId}><Eye size={16} /> Ver consulta</button>}
                                {tab === 'recetas_medicamentos' && canView && <button type="button" className="btn btn-secondary" onClick={() => openRecetaModal('view')} disabled={!selectedId}><Eye size={16} /> Ver receta</button>}
                                {tab !== 'recetas_medicamentos' && canEdit && <button type="button" className="btn btn-warning" onClick={() => openConsultaModal('edit')} disabled={!selectedId}><Pencil size={16} /> Editar consulta</button>}
                                {tab === 'recetas_medicamentos' && canEdit && <button type="button" className="btn btn-warning" onClick={() => openRecetaModal('edit')} disabled={!selectedId}><Pencil size={16} /> Editar receta</button>}
                                {tab !== 'recetas_medicamentos' && canExport && <button type="button" className="btn btn-secondary" onClick={openPdfConsulta} disabled={!selectedId}><FileText size={16} /> PDF consulta</button>}
                                {tab === 'recetas_medicamentos' && canExport && <button type="button" className="btn btn-secondary" onClick={openPdfReceta} disabled={!selectedId}><FileText size={16} /> PDF receta</button>}
                                {tab !== 'recetas_medicamentos' && canEdit && (
                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        disabled={!selectedId}
                                        onClick={() => setRecetaModal({
                                            mode: 'create',
                                            patientId: pacienteId,
                                            consultaId: selectedId,
                                            consultaTipo: tab === 'oftalmologia' ? 'OFTALMOLOGIA' : 'CONTACTOLOGIA',
                                            initialData: {
                                                fecha_emision: new Date().toISOString(),
                                                doctor_nombre: selectedItem?.doctor_nombre || detalleQuery.data?.doctor_nombre || '',
                                                diagnostico: detalleQuery.data?.diagnostico || selectedItem?.diagnostico || '',
                                                observaciones: detalleQuery.data?.plan_tratamiento || selectedItem?.plan_tratamiento || '',
                                                detalles: [],
                                            },
                                        })}
                                    >
                                        <Plus size={16} /> Generar receta de medicamentos
                                    </button>
                                )}
                                {tab !== 'recetas_medicamentos' && canEdit && <button type="button" className="btn btn-danger" onClick={() => {
                                    if (!selectedId) return
                                    if (!window.confirm('Se eliminara esta consulta. Desea continuar?')) return
                                    deleteConsultaMutation.mutate({ type: tab === 'oftalmologia' ? 'OFTALMOLOGIA' : 'CONTACTOLOGIA', id: selectedId })
                                }} disabled={!selectedId || deleteConsultaMutation.isPending}><Trash2 size={16} /> Eliminar</button>}
                                {tab === 'recetas_medicamentos' && canEdit && <button type="button" className="btn btn-danger" onClick={() => {
                                    if (!selectedId) return
                                    if (!window.confirm('Se eliminara esta receta. Desea continuar?')) return
                                    deleteRecetaMutation.mutate(selectedId)
                                }} disabled={!selectedId || deleteRecetaMutation.isPending}><Trash2 size={16} /> Eliminar</button>}
                            </div>
                        </div>

                        <div className="grid-2" style={{ alignItems: 'start' }}>
                            <div className="card" style={{ overflow: 'hidden', minWidth: 0 }}>
                                <div className="table-container">
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th style={{ width: 54 }}>#</th>
                                                <th>Fecha</th>
                                                <th>{tab === 'recetas_medicamentos' ? 'Doctor' : 'Motivo / Resumen'}</th>
                                                <th>Diagnostico</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {currentList.length ? currentList.map((item, index) => (
                                                <tr key={item?.id || `row-${index}`} onClick={() => item?.id && setSelectedId(item.id)} style={{ cursor: 'pointer', background: selectedId === item?.id ? CLINICA_PALETTE.accentSoft : 'transparent' }}>
                                                    <td>{index + 1}</td>
                                                    <td>{fmtDate(tab === 'recetas_medicamentos' ? item?.fecha_emision : item?.fecha)}</td>
                                                    <td>{tab === 'recetas_medicamentos' ? (item?.doctor_nombre || 'Sin doctor') : (item?.motivo || item?.resumen || item?.plan_tratamiento || '-')}</td>
                                                    <td>{item?.diagnostico || '-'}</td>
                                                </tr>
                                            )) : <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Sin registros en esta seccion.</td></tr>}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="card" style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 700, marginBottom: 6 }}>
                                    {tab === 'recetas_medicamentos' ? 'Detalle de la receta' : 'Detalle de la consulta'}
                                </div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 14 }}>
                                    Aqui ves el contenido completo del registro seleccionado sin salir del historial del paciente.
                                </div>
                                {!selectedItem ? (
                                    <div style={{ color: 'var(--text-muted)' }}>Seleccione un registro para ver el detalle.</div>
                                ) : tab === 'recetas_medicamentos' ? (
                                    <div style={{ display: 'grid', gap: 12 }}>
                                        <div><strong>Fecha:</strong> {fmtDateTime(selectedItem?.fecha_emision)}</div>
                                        <div><strong>Doctor:</strong> {selectedItem?.doctor_nombre || '-'}</div>
                                        <div><strong>Diagnostico:</strong> {selectedItem?.diagnostico || '-'}</div>
                                        <div><strong>Observaciones:</strong> {selectedItem?.observaciones || '-'}</div>
                                        <div>
                                            <strong>Medicamentos</strong>
                                            <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                                                {selectedItem?.detalles?.length ? selectedItem.detalles.filter(Boolean).map((detalle, idx) => (
                                                    <div key={`${selectedItem?.id || 'detalle'}-${idx}`} className="card" style={{ padding: 12, background: 'rgba(255,255,255,0.02)' }}>
                                                        <div style={{ fontWeight: 700 }}>{detalle?.medicamento || '-'}</div>
                                                        <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>Posologia: {detalle?.posologia_personalizada || '-'}</div>
                                                        <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>Duracion: {detalle?.duracion_tratamiento || '-'}</div>
                                                    </div>
                                                )) : <div style={{ color: 'var(--text-muted)' }}>Sin medicamentos cargados.</div>}
                                            </div>
                                        </div>
                                    </div>
                                ) : detalleQuery.isLoading ? (
                                    <div style={{ color: 'var(--text-muted)' }}>Cargando detalle de la consulta...</div>
                                ) : detalleQuery.isError ? (
                                    <div className="alert alert-error">{formatError(detalleQuery.error, 'No se pudo cargar el detalle de la consulta.')}</div>
                                ) : (
                                    (() => {
                                        const detalle = detalleQuery.data || {}
                                        return (
                                    <div style={{ display: 'grid', gap: 12 }}>
                                        <div><strong>Fecha:</strong> {fmtDateTime(detalle.fecha)}</div>
                                        <div><strong>Doctor:</strong> {detalle.doctor_nombre || '-'}</div>
                                        <div><strong>Lugar:</strong> {detalle.lugar_nombre || '-'}</div>
                                        {tab === 'oftalmologia' && <div><strong>Motivo:</strong> {detalle.motivo || '-'}</div>}
                                        <div><strong>Diagnostico:</strong> {detalle.diagnostico || '-'}</div>
                                        <div><strong>Plan:</strong> {detalle.plan_tratamiento || '-'}</div>
                                        <div><strong>Tipo lente:</strong> {detalle.tipo_lente || '-'}</div>
                                        {tab === 'oftalmologia' ? (
                                            <>
                                                <div><strong>Material lente:</strong> {detalle.material_lente || '-'}</div>
                                                <div><strong>Tratamientos:</strong> {detalle.tratamientos || '-'}</div>
                                                <div className="card" style={{ padding: 14, background: 'rgba(255,255,255,0.02)' }}>
                                                    <div style={{ fontWeight: 700, marginBottom: 10 }}>Correccion refractiva</div>
                                                    <div className="grid-2">
                                                        <div><strong>AV CC lejos OD:</strong> {detalle.av_cc_lejos_od || '-'}</div>
                                                        <div><strong>AV CC lejos OI:</strong> {detalle.av_cc_lejos_oi || '-'}</div>
                                                    </div>
                                                    <div className="grid-2" style={{ marginTop: 12 }}>
                                                        <div className="card" style={{ padding: 12, background: 'rgba(255,255,255,0.02)' }}>
                                                            <div style={{ fontWeight: 700, marginBottom: 8 }}>OD</div>
                                                            <div><strong>Esfera:</strong> {detalle.ref_od_esfera || '-'}</div>
                                                            <div><strong>Cilindro:</strong> {detalle.ref_od_cilindro || '-'}</div>
                                                            <div><strong>Eje:</strong> {detalle.ref_od_eje || '-'}</div>
                                                            <div><strong>Adicion:</strong> {detalle.ref_od_adicion || '-'}</div>
                                                        </div>
                                                        <div className="card" style={{ padding: 12, background: 'rgba(255,255,255,0.02)' }}>
                                                            <div style={{ fontWeight: 700, marginBottom: 8 }}>OI</div>
                                                            <div><strong>Esfera:</strong> {detalle.ref_oi_esfera || '-'}</div>
                                                            <div><strong>Cilindro:</strong> {detalle.ref_oi_cilindro || '-'}</div>
                                                            <div><strong>Eje:</strong> {detalle.ref_oi_eje || '-'}</div>
                                                            <div><strong>Adicion:</strong> {detalle.ref_oi_adicion || '-'}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div><strong>Diseno:</strong> {detalle.diseno || '-'}</div>
                                                <div><strong>Marca recomendada:</strong> {detalle.marca_recomendada || '-'}</div>
                                                <div><strong>Fecha control:</strong> {fmtDate(detalle.fecha_control)}</div>
                                                <div><strong>Resumen resultados:</strong> {detalle.resumen_resultados || '-'}</div>
                                            </>
                                        )}
                                        <div><strong>Observaciones:</strong> {detalle.observaciones || '-'}</div>
                                        <div className="card" style={{ padding: 14, background: 'rgba(255,255,255,0.02)' }}>
                                            <div style={{ fontWeight: 700, marginBottom: 10 }}>Documentos de esta consulta</div>
                                            <div className="flex gap-12" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
                                                {detalle.tiene_receta_lentes_pdf && (
                                                    <button
                                                        type="button"
                                                        className="btn btn-secondary"
                                                        onClick={() => openPdfBlob(`/clinica/consultas/oftalmologia/${detalle.id}/pdf`).catch(error => window.alert(formatError(error, 'No se pudo generar la receta optica.')))}
                                                    >
                                                        <FileText size={16} /> Receta de lentes PDF
                                                    </button>
                                                )}
                                                {detalle.tiene_indicaciones_pdf && (
                                                    <button
                                                        type="button"
                                                        className="btn btn-secondary"
                                                        onClick={() => openPdfBlob(`/clinica/consultas/${tab === 'oftalmologia' ? 'oftalmologia' : 'contactologia'}/${detalle.id}/indicaciones-pdf`).catch(error => window.alert(formatError(error, 'No se pudo generar el PDF de indicaciones.')))}
                                                    >
                                                        <FileText size={16} /> Indicaciones PDF
                                                    </button>
                                                )}
                                            </div>
                                            <div style={{ fontWeight: 700, marginBottom: 8 }}>Recetas de medicamentos vinculadas</div>
                                            {detalle.recetas_medicamentos_relacionadas?.length ? (
                                                <div style={{ display: 'grid', gap: 8 }}>
                                                    {detalle.recetas_medicamentos_relacionadas.map(receta => (
                                                        <div key={receta.id} className="card" style={{ padding: 12, background: 'rgba(255,255,255,0.02)' }}>
                                                            <div className="flex-between" style={{ gap: 12, alignItems: 'flex-start' }}>
                                                                <div>
                                                                    <div style={{ fontWeight: 700 }}>{fmtDateTime(receta.fecha_emision)}</div>
                                                                    <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>{receta.doctor_nombre || 'Sin doctor'}</div>
                                                                    <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>{receta.diagnostico || receta.observaciones || 'Sin diagnostico'}</div>
                                                                </div>
                                                                <div className="flex gap-8" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                                                    <button type="button" className="btn btn-secondary" onClick={() => { setTab('recetas_medicamentos'); setSelectedId(receta.id) }}>
                                                                        <Eye size={16} /> Ver receta
                                                                    </button>
                                                                    <button type="button" className="btn btn-secondary" onClick={() => openPdfBlob(`/clinica/recetas-medicamentos/${receta.id}/compra-pdf`).catch(error => window.alert(formatError(error, 'No se pudo generar el PDF de receta.')))}>
                                                                        <FileText size={16} /> PDF receta
                                                                    </button>
                                                                    <button type="button" className="btn btn-secondary" onClick={() => openPdfBlob(`/clinica/recetas-medicamentos/${receta.id}/indicaciones-pdf`).catch(error => window.alert(formatError(error, 'No se pudo generar el PDF de indicaciones.')))}>
                                                                        <FileText size={16} /> PDF indicaciones
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div style={{ color: 'var(--text-muted)' }}>Sin receta de medicamentos vinculada todavia.</div>
                                            )}
                                        </div>
                                    </div>
                                        )
                                    })()
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </Modal>

            {consultaModal && (
                <Modal
                    title={consultaModal.mode === 'create' ? `Nueva consulta ${consultaModal.type === 'OFTALMOLOGIA' ? 'oftalmologica' : 'de contactologia'}` : consultaModal.mode === 'edit' ? 'Editar consulta' : 'Consulta clinica'}
                    onClose={() => setConsultaModal(null)}
                    maxWidth="920px"
                    closeDisabled={consultaSavePhase !== 'idle'}
                    onCloseAttempt={() => window.alert('La consulta aun se esta actualizando. Espera a que el historial refleje los cambios antes de cerrar.')}
                >
                    <ConsultaClinicaForm
                        type={consultaModal.type}
                        initialData={consultaModal.initialData}
                        pacienteId={pacienteId}
                        doctores={doctoresQuery.data || []}
                        lugares={lugaresQuery.data || []}
                        onSave={payload => saveConsultaMutation.mutate(payload.consulta)}
                        onCancel={() => setConsultaModal(null)}
                        saving={saveConsultaMutation.isPending || consultaSavePhase === 'refreshing'}
                        savingText={consultaSavePhase === 'refreshing' ? 'Actualizando vista...' : 'Guardando...'}
                        readOnly={consultaModal.mode === 'view'}
                    />
                </Modal>
            )}

            {recetaModal && (
                <Modal title={recetaModal.mode === 'create' ? 'Nueva receta de medicamentos' : recetaModal.mode === 'edit' ? 'Editar receta de medicamentos' : 'Receta de medicamentos'} onClose={() => setRecetaModal(null)} maxWidth="980px">
                    <RecetaMedicamentoForm
                        initialData={recetaModal.initialData}
                        pacienteId={pacienteId}
                        onSearchMedicamento={setMedicamentoSearch}
                        medicamentoOptions={medicamentosQuery.data || []}
                        medicamentoLoading={medicamentosQuery.isFetching}
                        onSave={payload => saveRecetaMutation.mutate(payload)}
                        onCancel={() => {
                            setRecentCreatedMedicamento(null)
                            setRecetaModal(null)
                        }}
                        saving={saveRecetaMutation.isPending}
                        readOnly={recetaModal.mode === 'view'}
                    />
                </Modal>
            )}
        </>
    )
}

function PacientesSection() {
    const { user } = useAuth()
    const location = useLocation()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const [searchInput, setSearchInput] = useState('')
    const [buscar, setBuscar] = useState('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(25)
    const [modalPaciente, setModalPaciente] = useState(null)
    const [historialPacienteId, setHistorialPacienteId] = useState(null)
    const [referidorSearch, setReferidorSearch] = useState('')
    const [openActionId, setOpenActionId] = useState(null)
    const [actionMenuPos, setActionMenuPos] = useState({ top: 0, left: 0 })

    useEffect(() => {
        const timeout = window.setTimeout(() => {
            setBuscar(searchInput.trim())
            setPage(1)
        }, 300)
        return () => window.clearTimeout(timeout)
    }, [searchInput])

    useEffect(() => {
        const agendaDraft = location.state?.openNewFromAgenda
        if (!agendaDraft) return
        setModalPaciente({
            open: true,
            mode: 'create',
            data: {
                nombre_completo: agendaDraft.nombre_completo || '',
            },
            sourceAgendaTurno: agendaDraft.turno || null,
        })
        navigate(location.pathname, { replace: true, state: {} })
    }, [location.pathname, location.state, navigate])

    const pacientesQuery = useQuery({
        queryKey: ['clinica', 'pacientes', { buscar, page, pageSize }],
        queryFn: async () => (await api.get(`/clinica/pacientes?${queryString({ buscar, page, page_size: pageSize })}`)).data,
    })

    const referidoresQuery = useQuery({
        queryKey: ['clinica', 'referidores', referidorSearch],
        queryFn: async () => (await api.get(`/referidores/listado-optimizado?${queryString({ buscar: referidorSearch, page: 1, page_size: 12 })}`)).data,
        enabled: Boolean(modalPaciente?.open),
    })

    const savePacienteMutation = useMutation({
        mutationFn: async payload => {
            if (modalPaciente?.mode === 'edit') return (await api.put(`/clinica/pacientes/${modalPaciente.data.id}`, payload)).data
            return (await api.post('/clinica/pacientes', payload)).data
        },
        onSuccess: async result => {
            if (modalPaciente?.sourceAgendaTurno?.id && result?.id) {
                await api.put(`/clinica/agenda/${modalPaciente.sourceAgendaTurno.id}`, {
                    paciente_id: result.id,
                    paciente_nombre_libre: null,
                    doctor_id: modalPaciente.sourceAgendaTurno.doctor_id || null,
                    lugar_atencion_id: modalPaciente.sourceAgendaTurno.lugar_atencion_id || null,
                    fecha_hora: modalPaciente.sourceAgendaTurno.fecha_hora,
                    estado: 'ATENDIDO',
                    motivo: modalPaciente.sourceAgendaTurno.motivo || null,
                    notas: modalPaciente.sourceAgendaTurno.notas || null,
                }).catch(() => null)
            }
            const sourceAgendaTurno = modalPaciente?.sourceAgendaTurno || null
            setModalPaciente(null)
            setReferidorSearch('')
            await queryClient.invalidateQueries({ queryKey: ['clinica', 'pacientes'] })
            await queryClient.invalidateQueries({ queryKey: ['clinica', 'dashboard'] })
            await queryClient.invalidateQueries({ queryKey: ['clinica', 'agenda'] })
            await queryClient.invalidateQueries({ queryKey: ['clinica', 'agenda-recordatorios'] })
            if (sourceAgendaTurno && result?.id) {
                navigate('/clinica/consulta', {
                    state: {
                        selectedPatient: result,
                        autoOpenConsulta: true,
                        agendaTurnoId: sourceAgendaTurno.id,
                    },
                })
            }
        },
    })

    const convertirMutation = useMutation({
        mutationFn: async pacienteId => (await api.post(`/clinica/pacientes/${pacienteId}/convertir-cliente`)).data,
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['clinica', 'pacientes'] })
            await queryClient.invalidateQueries({ queryKey: ['clinica', 'paciente-historial'] })
        },
    })

    useEffect(() => {
        if (!openActionId) return undefined
        const close = () => setOpenActionId(null)
        window.addEventListener('click', close)
        window.addEventListener('resize', close)
        return () => {
            window.removeEventListener('click', close)
            window.removeEventListener('resize', close)
        }
    }, [openActionId])

    const openActionsMenu = (event, pacienteId) => {
        event.stopPropagation()
        const rect = event.currentTarget.getBoundingClientRect()
        const menuWidth = 220
        const menuHeight = 180
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight
        const left = Math.min(rect.right - menuWidth, viewportWidth - menuWidth - 12)
        const openUp = rect.bottom + menuHeight > viewportHeight - 12
        const top = openUp ? rect.top - menuHeight - 6 : rect.bottom + 6
        setActionMenuPos({ left: Math.max(12, left), top: Math.max(12, top) })
        setOpenActionId(prev => (prev === pacienteId ? null : pacienteId))
    }

    const handlePatientAction = action => {
        setOpenActionId(null)
        action()
    }

    return (
        <>
            <div className="card" style={{ marginTop: 22 }}>
                <SectionHeader
                    title="Pacientes"
                    subtitle="Listado clinico paginado con busqueda remota, conversion a cliente e historial clinico."
                    actions={hasActionAccess(user, 'clinica.pacientes_crear', 'clinica') ? <button className="btn btn-primary" onClick={() => setModalPaciente({ open: true, mode: 'create', data: null })}><Plus size={16} /> Nuevo paciente</button> : null}
                />

                <div className="filters-bar" style={{ marginBottom: 18 }}>
                    <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
                        <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                        <input
                            className="form-input"
                            style={{ paddingLeft: 42 }}
                            value={searchInput}
                            onChange={event => setSearchInput(event.target.value)}
                            placeholder="Buscar por nombre, CI o telefono..."
                        />
                    </div>
                    <select className="form-select" style={{ width: 130 }} value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1) }}>
                        <option value={10}>10 / pag.</option>
                        <option value={25}>25 / pag.</option>
                        <option value={50}>50 / pag.</option>
                    </select>
                </div>

                {pacientesQuery.isLoading ? (
                    <div className="empty-state" style={{ padding: '64px 20px' }}>Cargando pacientes...</div>
                ) : pacientesQuery.isError ? (
                    <div className="alert alert-error">{formatError(pacientesQuery.error, 'No se pudo cargar la lista de pacientes.')}</div>
                ) : (
                    <>
                        <div className="table-container">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Paciente</th>
                                        <th>CI / Pasaporte</th>
                                        <th>Edad</th>
                                        <th>Telefono</th>
                                        <th>Referidor</th>
                                        <th>Cliente</th>
                                        <th>Consultas</th>
                                        <th>Ultima consulta</th>
                                        <th style={{ width: 250 }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pacientesQuery.data.items?.length ? pacientesQuery.data.items.map(item => (
                                        <tr key={item.id}>
                                            <td style={{ fontWeight: 700 }}>{item.nombre_completo}</td>
                                            <td>{item.ci_pasaporte || '-'}</td>
                                            <td>{item.edad_calculada ?? item.edad_manual ?? '-'}</td>
                                            <td>{item.telefono || '-'}</td>
                                            <td>{item.referidor_nombre || '-'}</td>
                                            <td><span className={`badge ${item.es_cliente ? 'badge-green' : 'badge-gray'}`}>{item.es_cliente ? 'Cliente' : 'Pendiente'}</span></td>
                                            <td>{item.consultas_oftalmologicas + item.consultas_contactologia}</td>
                                            <td>{fmtDateTime(item.ultima_consulta)}</td>
                                            <td style={{ textAlign: 'right' }}>
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary btn-sm"
                                                    onClick={event => openActionsMenu(event, item.id)}
                                                >
                                                    Acciones v
                                                </button>
                                                {openActionId === item.id && (
                                                    <div
                                                        onClick={event => event.stopPropagation()}
                                                        style={{
                                                            position: 'fixed',
                                                            top: actionMenuPos.top,
                                                            left: actionMenuPos.left,
                                                            width: 220,
                                                            background: '#1f2430',
                                                            border: '1px solid rgba(255,255,255,0.12)',
                                                            borderRadius: 12,
                                                            boxShadow: '0 18px 50px rgba(0,0,0,0.45)',
                                                            padding: 8,
                                                            zIndex: 99999,
                                                            display: 'grid',
                                                            gap: 4,
                                                        }}
                                                    >
                                                        {hasActionAccess(user, 'clinica.historial', 'clinica') && (
                                                            <button type="button" className="dropdown-item" style={{ background: 'transparent', color: 'var(--text-primary)' }} onClick={() => handlePatientAction(() => setHistorialPacienteId(item.id))}>
                                                                <Eye size={14} style={{ marginRight: 8 }} /> Historial clinico
                                                            </button>
                                                        )}
                                                        {hasActionAccess(user, 'clinica.consultas_crear', 'clinica') && (
                                                            <button
                                                                type="button"
                                                                className="dropdown-item"
                                                                style={{ background: 'transparent', color: 'var(--text-primary)' }}
                                                                onClick={() => handlePatientAction(() => navigate('/clinica/consulta', { state: { selectedPatient: item } }))}
                                                            >
                                                                <Plus size={14} style={{ marginRight: 8 }} /> Nueva consulta
                                                            </button>
                                                        )}
                                                        {hasActionAccess(user, 'clinica.pacientes_editar', 'clinica') && (
                                                            <button type="button" className="dropdown-item" style={{ background: 'transparent', color: 'var(--text-primary)' }} onClick={() => handlePatientAction(() => setModalPaciente({ open: true, mode: 'edit', data: item }))}>
                                                                <Pencil size={14} style={{ marginRight: 8 }} /> Editar paciente
                                                            </button>
                                                        )}
                                                        {hasActionAccess(user, 'clinica.convertir_cliente', 'clinica') && (
                                                            item.es_cliente ? (
                                                                <div
                                                                    className="dropdown-item"
                                                                    style={{
                                                                        background: 'rgba(34,197,94,0.10)',
                                                                        color: '#86efac',
                                                                        opacity: 0.95,
                                                                        cursor: 'default',
                                                                    }}
                                                                >
                                                                    <Users size={14} style={{ marginRight: 8 }} /> Ya vinculado a cliente
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    className="dropdown-item"
                                                                    style={{ background: 'transparent', color: 'var(--text-primary)' }}
                                                                    onClick={() => handlePatientAction(() => convertirMutation.mutate(item.id))}
                                                                    disabled={convertirMutation.isPending}
                                                                >
                                                                    <Users size={14} style={{ marginRight: 8 }} /> Convertir a cliente
                                                                </button>
                                                            )
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    )) : <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No hay pacientes para mostrar.</td></tr>}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex-between" style={{ marginTop: 16, gap: 16, flexWrap: 'wrap' }}>
                            <div style={{ color: 'var(--text-muted)' }}>Mostrando pagina {pacientesQuery.data.page} de {pacientesQuery.data.total_pages} - {pacientesQuery.data.total} pacientes</div>
                            <div className="flex gap-12">
                                <button className="btn btn-secondary" onClick={() => setPage(prev => Math.max(1, prev - 1))} disabled={page <= 1}>Anterior</button>
                                <button className="btn btn-secondary" onClick={() => setPage(prev => Math.min(pacientesQuery.data.total_pages, prev + 1))} disabled={page >= pacientesQuery.data.total_pages}>Siguiente</button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {modalPaciente?.open && (
                <Modal title={modalPaciente.mode === 'edit' ? 'Editar paciente' : 'Nuevo paciente'} onClose={() => setModalPaciente(null)} maxWidth="860px">
                    <PacienteForm
                        initialData={modalPaciente.data}
                        referidorOptions={referidoresQuery.data?.items || []}
                        onSearchReferidor={setReferidorSearch}
                        referidorLoading={referidoresQuery.isFetching}
                        onSave={payload => savePacienteMutation.mutate(payload)}
                        onCancel={() => setModalPaciente(null)}
                        saving={savePacienteMutation.isPending}
                    />
                </Modal>
            )}

            <HistorialClinicoModal
                open={Boolean(historialPacienteId)}
                pacienteId={historialPacienteId}
                onClose={() => setHistorialPacienteId(null)}
                onEditPaciente={paciente => setModalPaciente({ open: true, mode: 'edit', data: paciente })}
                onRefreshPacientes={() => queryClient.invalidateQueries({ queryKey: ['clinica', 'pacientes'] })}
            />
        </>
    )
}

function DoctorForm({ initialData, onSave, onCancel, saving }) {
    const [form, setForm] = useState(() => ({
        nombre_completo: initialData?.nombre_completo || '',
        especialidad: initialData?.especialidad || '',
        registro_profesional: initialData?.registro_profesional || '',
        telefono: initialData?.telefono || '',
        email: initialData?.email || '',
        activo: initialData?.activo ?? true,
    }))

    return (
        <form onSubmit={event => { event.preventDefault(); onSave(form) }}>
            <div className="grid-2">
                <div className="form-group">
                    <label className="form-label">Nombre completo *</label>
                    <input className="form-input" value={form.nombre_completo} onChange={event => setForm(prev => ({ ...prev, nombre_completo: event.target.value }))} required />
                </div>
                <div className="form-group">
                    <label className="form-label">Especialidad</label>
                    <input className="form-input" value={form.especialidad} onChange={event => setForm(prev => ({ ...prev, especialidad: event.target.value }))} />
                </div>
                <div className="form-group">
                    <label className="form-label">Registro profesional</label>
                    <input className="form-input" value={form.registro_profesional} onChange={event => setForm(prev => ({ ...prev, registro_profesional: event.target.value }))} />
                </div>
                <div className="form-group">
                    <label className="form-label">Telefono</label>
                    <input className="form-input" value={form.telefono} onChange={event => setForm(prev => ({ ...prev, telefono: event.target.value }))} />
                </div>
                <div className="form-group">
                    <label className="form-label">Email</label>
                    <input className="form-input" type="email" value={form.email} onChange={event => setForm(prev => ({ ...prev, email: event.target.value }))} />
                </div>
                <div className="form-group">
                    <label className="form-label">Estado</label>
                    <select className="form-select" value={form.activo ? '1' : '0'} onChange={event => setForm(prev => ({ ...prev, activo: event.target.value === '1' }))}>
                        <option value="1">Activo</option>
                        <option value="0">Inactivo</option>
                    </select>
                </div>
            </div>
            <div className="flex gap-12" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
                <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar doctor'}</button>
            </div>
        </form>
    )
}

function LugarForm({ initialData, onSave, onCancel, saving }) {
    const [form, setForm] = useState(() => ({
        nombre: initialData?.nombre || '',
        direccion: initialData?.direccion || '',
        telefono: initialData?.telefono || '',
        contacto_responsable: initialData?.contacto_responsable || '',
        email: initialData?.email || '',
        notas: initialData?.notas || '',
        activo: initialData?.activo ?? true,
    }))

    return (
        <form onSubmit={event => { event.preventDefault(); onSave(form) }}>
            <div className="grid-2">
                <div className="form-group">
                    <label className="form-label">Nombre del lugar *</label>
                    <input className="form-input" value={form.nombre} onChange={event => setForm(prev => ({ ...prev, nombre: event.target.value }))} required />
                </div>
                <div className="form-group">
                    <label className="form-label">Telefono</label>
                    <input className="form-input" value={form.telefono} onChange={event => setForm(prev => ({ ...prev, telefono: event.target.value }))} />
                </div>
                <div className="form-group">
                    <label className="form-label">Direccion</label>
                    <input className="form-input" value={form.direccion} onChange={event => setForm(prev => ({ ...prev, direccion: event.target.value }))} />
                </div>
                <div className="form-group">
                    <label className="form-label">Contacto responsable</label>
                    <input className="form-input" value={form.contacto_responsable} onChange={event => setForm(prev => ({ ...prev, contacto_responsable: event.target.value }))} />
                </div>
                <div className="form-group">
                    <label className="form-label">Email</label>
                    <input className="form-input" type="email" value={form.email} onChange={event => setForm(prev => ({ ...prev, email: event.target.value }))} />
                </div>
                <div className="form-group">
                    <label className="form-label">Estado</label>
                    <select className="form-select" value={form.activo ? '1' : '0'} onChange={event => setForm(prev => ({ ...prev, activo: event.target.value === '1' }))}>
                        <option value="1">Activo</option>
                        <option value="0">Inactivo</option>
                    </select>
                </div>
            </div>
            <div className="form-group">
                <label className="form-label">Notas</label>
                <textarea className="form-input" value={form.notas} onChange={event => setForm(prev => ({ ...prev, notas: event.target.value }))} style={{ minHeight: 110, resize: 'none', width: '100%' }} />
            </div>
            <div className="flex gap-12" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
                <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar lugar'}</button>
            </div>
        </form>
    )
}

function DoctoresSection() {
    const { user } = useAuth()
    const queryClient = useQueryClient()
    const [searchInput, setSearchInput] = useState('')
    const [buscar, setBuscar] = useState('')
    const [soloActivos, setSoloActivos] = useState(true)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(25)
    const [modalDoctor, setModalDoctor] = useState(null)
    const [openActionId, setOpenActionId] = useState(null)
    const [actionMenuPos, setActionMenuPos] = useState({ top: 0, left: 0 })

    useEffect(() => {
        const timeout = window.setTimeout(() => {
            setBuscar(searchInput.trim())
            setPage(1)
        }, 300)
        return () => window.clearTimeout(timeout)
    }, [searchInput])

    useEffect(() => {
        setPage(1)
    }, [soloActivos, pageSize])

    useEffect(() => {
        if (!openActionId) return undefined
        const close = () => setOpenActionId(null)
        window.addEventListener('click', close)
        window.addEventListener('resize', close)
        return () => {
            window.removeEventListener('click', close)
            window.removeEventListener('resize', close)
        }
    }, [openActionId])

    const doctoresQuery = useQuery({
        queryKey: ['clinica', 'doctores', { buscar, soloActivos, page, pageSize }],
        queryFn: async () => (await api.get(`/clinica/doctores?${queryString({ buscar, solo_activos: soloActivos ? 'true' : '', page, page_size: pageSize })}`)).data,
    })

    const saveDoctorMutation = useMutation({
        mutationFn: async payload => {
            if (modalDoctor?.mode === 'edit') return (await api.put(`/clinica/doctores/${modalDoctor.data.id}`, payload)).data
            return (await api.post('/clinica/doctores', payload)).data
        },
        onSuccess: async () => {
            setModalDoctor(null)
            await queryClient.invalidateQueries({ queryKey: ['clinica', 'doctores'] })
            await queryClient.invalidateQueries({ queryKey: ['clinica', 'doctores-simple'] })
            await queryClient.invalidateQueries({ queryKey: ['clinica', 'dashboard'] })
        },
    })

    const deleteDoctorMutation = useMutation({
        mutationFn: async doctorId => {
            await api.delete(`/clinica/doctores/${doctorId}`)
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['clinica', 'doctores'] })
            await queryClient.invalidateQueries({ queryKey: ['clinica', 'doctores-simple'] })
            await queryClient.invalidateQueries({ queryKey: ['clinica', 'dashboard'] })
        },
    })

    const openActionsMenu = (event, doctorId) => {
        event.stopPropagation()
        const rect = event.currentTarget.getBoundingClientRect()
        const menuWidth = 220
        const menuHeight = 130
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight
        const left = Math.min(rect.right - menuWidth, viewportWidth - menuWidth - 12)
        const openUp = rect.bottom + menuHeight > viewportHeight - 12
        const top = openUp ? rect.top - menuHeight - 6 : rect.bottom + 6
        setActionMenuPos({ left: Math.max(12, left), top: Math.max(12, top) })
        setOpenActionId(prev => (prev === doctorId ? null : doctorId))
    }

    const handleDoctorAction = action => {
        setOpenActionId(null)
        action()
    }

    const items = doctoresQuery.data?.items || []

    return (
        <>
            <div className="card" style={{ marginTop: 22 }}>
                <SectionHeader
                    title="Doctores"
                    subtitle="Listado clinico paginado con alta, edicion y control de estado por profesional."
                    actions={hasActionAccess(user, 'clinica.doctores_editar', 'clinica') ? <button className="btn btn-primary" onClick={() => setModalDoctor({ mode: 'create', data: null })}><Plus size={16} /> Nuevo doctor</button> : null}
                />

                <div className="filters-bar" style={{ marginBottom: 18 }}>
                    <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
                        <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                        <input className="form-input" style={{ paddingLeft: 42 }} value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="Buscar por nombre, especialidad, registro o telefono..." />
                    </div>
                    <label className="checkbox-label" style={{ minWidth: 150 }}>
                        <input type="checkbox" checked={soloActivos} onChange={event => setSoloActivos(event.target.checked)} />
                        Solo activos
                    </label>
                    <select className="form-select" style={{ width: 130 }} value={pageSize} onChange={event => setPageSize(Number(event.target.value))}>
                        <option value={10}>10 / pag.</option>
                        <option value={25}>25 / pag.</option>
                        <option value={50}>50 / pag.</option>
                    </select>
                </div>

                {doctoresQuery.isLoading ? (
                    <div className="flex-center" style={{ padding: 60 }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>
                ) : doctoresQuery.isError ? (
                    <div className="alert alert-error">{formatError(doctoresQuery.error, 'No se pudieron cargar los doctores.')}</div>
                ) : (
                    <>
                        <div className="table-container" style={{ width: '100%', maxWidth: '100%', overflowX: 'auto' }}>
                            <table style={{ minWidth: 1080, tableLayout: 'fixed' }}>
                                <thead>
                                    <tr>
                                        <th style={{ width: 220 }}>Nombre</th>
                                        <th style={{ width: 180 }}>Especialidad</th>
                                        <th style={{ width: 150 }}>Registro</th>
                                        <th style={{ width: 150 }}>Telefono</th>
                                        <th style={{ width: 210 }}>Email</th>
                                        <th style={{ width: 90 }}>Oft.</th>
                                        <th style={{ width: 90 }}>Cont.</th>
                                        <th style={{ width: 100 }}>Estado</th>
                                        <th style={{ width: 120, textAlign: 'right' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.length ? items.map(item => (
                                        <tr key={item.id}>
                                            <td style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{item.nombre_completo}</td>
                                            <td style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{item.especialidad || '-'}</td>
                                            <td>{item.registro_profesional || '-'}</td>
                                            <td>{item.telefono || '-'}</td>
                                            <td style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{item.email || '-'}</td>
                                            <td>{item.consultas_oftalmologicas}</td>
                                            <td>{item.consultas_contactologia}</td>
                                            <td><span className={`badge ${item.activo ? 'badge-success' : 'badge-muted'}`}>{item.activo ? 'ACTIVO' : 'INACTIVO'}</span></td>
                                            <td style={{ textAlign: 'right' }}>
                                                <button type="button" className="btn btn-secondary btn-sm" onClick={event => openActionsMenu(event, item.id)}>Acciones v</button>
                                                {openActionId === item.id && (
                                                    <div
                                                        onClick={event => event.stopPropagation()}
                                                        style={{
                                                            position: 'fixed',
                                                            top: actionMenuPos.top,
                                                            left: actionMenuPos.left,
                                                            width: 220,
                                                            background: '#1f2430',
                                                            border: '1px solid rgba(255,255,255,0.12)',
                                                            borderRadius: 12,
                                                            boxShadow: '0 18px 50px rgba(0,0,0,0.45)',
                                                            padding: 8,
                                                            zIndex: 99999,
                                                            display: 'grid',
                                                            gap: 4,
                                                        }}
                                                    >
                                                        {hasActionAccess(user, 'clinica.doctores_editar', 'clinica') && (
                                                            <button type="button" className="dropdown-item" style={{ background: 'transparent', color: 'var(--text-primary)' }} onClick={() => handleDoctorAction(() => setModalDoctor({ mode: 'edit', data: item }))}>
                                                                <Pencil size={14} style={{ marginRight: 8 }} /> Editar doctor
                                                            </button>
                                                        )}
                                                        {hasActionAccess(user, 'clinica.doctores_editar', 'clinica') && (
                                                            <button
                                                                type="button"
                                                                className="dropdown-item"
                                                                style={{ background: 'transparent', color: item.activo ? 'var(--warning)' : '#86efac' }}
                                                                onClick={() => handleDoctorAction(() => saveDoctorMutation.mutate({ ...item, activo: !item.activo }))}
                                                            >
                                                                <RefreshCcw size={14} style={{ marginRight: 8 }} /> {item.activo ? 'Desactivar' : 'Activar'}
                                                            </button>
                                                        )}
                                                        {hasActionAccess(user, 'clinica.doctores_editar', 'clinica') && (
                                                            <>
                                                                <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '6px 0' }} />
                                                                <button
                                                                    type="button"
                                                                    className="dropdown-item"
                                                                    style={{ background: 'transparent', color: 'var(--danger)' }}
                                                                    onClick={() => handleDoctorAction(() => {
                                                                        if (!window.confirm(`Se eliminara el doctor ${item.nombre_completo}. Desea continuar?`)) return
                                                                        deleteDoctorMutation.mutate(item.id)
                                                                    })}
                                                                    disabled={deleteDoctorMutation.isPending}
                                                                >
                                                                    <Trash2 size={14} style={{ marginRight: 8 }} /> Eliminar doctor
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    )) : <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No hay doctores para mostrar.</td></tr>}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex-between" style={{ marginTop: 16, gap: 16, flexWrap: 'wrap' }}>
                            <div style={{ color: 'var(--text-muted)' }}>Mostrando pagina {doctoresQuery.data.page} de {doctoresQuery.data.total_pages} - {doctoresQuery.data.total} doctores</div>
                            <div className="flex gap-12">
                                <button className="btn btn-secondary" onClick={() => setPage(prev => Math.max(1, prev - 1))} disabled={page <= 1}>Anterior</button>
                                <button className="btn btn-secondary" onClick={() => setPage(prev => Math.min(doctoresQuery.data.total_pages, prev + 1))} disabled={page >= doctoresQuery.data.total_pages}>Siguiente</button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {modalDoctor && (
                <Modal title={modalDoctor.mode === 'edit' ? 'Editar doctor' : 'Nuevo doctor'} onClose={() => setModalDoctor(null)} maxWidth="860px">
                    <DoctorForm
                        initialData={modalDoctor.data}
                        onSave={payload => saveDoctorMutation.mutate(payload)}
                        onCancel={() => setModalDoctor(null)}
                        saving={saveDoctorMutation.isPending}
                    />
                </Modal>
            )}
        </>
    )
}

function LugaresSection() {
    const { user } = useAuth()
    const queryClient = useQueryClient()
    const [searchInput, setSearchInput] = useState('')
    const [buscar, setBuscar] = useState('')
    const [soloActivos, setSoloActivos] = useState(true)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(25)
    const [modalLugar, setModalLugar] = useState(null)
    const [openActionId, setOpenActionId] = useState(null)
    const [actionMenuPos, setActionMenuPos] = useState({ top: 0, left: 0 })

    useEffect(() => {
        const timeout = window.setTimeout(() => {
            setBuscar(searchInput.trim())
            setPage(1)
        }, 300)
        return () => window.clearTimeout(timeout)
    }, [searchInput])

    useEffect(() => {
        setPage(1)
    }, [soloActivos, pageSize])

    useEffect(() => {
        if (!openActionId) return undefined
        const close = () => setOpenActionId(null)
        window.addEventListener('click', close)
        window.addEventListener('resize', close)
        return () => {
            window.removeEventListener('click', close)
            window.removeEventListener('resize', close)
        }
    }, [openActionId])

    const lugaresQuery = useQuery({
        queryKey: ['clinica', 'lugares', { buscar, soloActivos, page, pageSize }],
        queryFn: async () => (await api.get(`/clinica/lugares?${queryString({ buscar, solo_activos: soloActivos ? 'true' : '', page, page_size: pageSize })}`)).data,
    })

    const saveLugarMutation = useMutation({
        mutationFn: async payload => {
            if (modalLugar?.mode === 'edit') return (await api.put(`/clinica/lugares/${modalLugar.data.id}`, payload)).data
            return (await api.post('/clinica/lugares', payload)).data
        },
        onSuccess: async () => {
            setModalLugar(null)
            await queryClient.invalidateQueries({ queryKey: ['clinica', 'lugares'] })
            await queryClient.invalidateQueries({ queryKey: ['clinica', 'lugares-simple'] })
            await queryClient.invalidateQueries({ queryKey: ['clinica', 'dashboard'] })
        },
    })

    const deleteLugarMutation = useMutation({
        mutationFn: async lugarId => {
            await api.delete(`/clinica/lugares/${lugarId}`)
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['clinica', 'lugares'] })
            await queryClient.invalidateQueries({ queryKey: ['clinica', 'lugares-simple'] })
            await queryClient.invalidateQueries({ queryKey: ['clinica', 'dashboard'] })
        },
    })

    const openActionsMenu = (event, lugarId) => {
        event.stopPropagation()
        const rect = event.currentTarget.getBoundingClientRect()
        const menuWidth = 220
        const menuHeight = 130
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight
        const left = Math.min(rect.right - menuWidth, viewportWidth - menuWidth - 12)
        const openUp = rect.bottom + menuHeight > viewportHeight - 12
        const top = openUp ? rect.top - menuHeight - 6 : rect.bottom + 6
        setActionMenuPos({ left: Math.max(12, left), top: Math.max(12, top) })
        setOpenActionId(prev => (prev === lugarId ? null : lugarId))
    }

    const handleLugarAction = action => {
        setOpenActionId(null)
        action()
    }

    const items = lugaresQuery.data?.items || []

    return (
        <>
            <div className="card" style={{ marginTop: 22 }}>
                <SectionHeader
                    title="Lugares de atencion"
                    subtitle="Listado clinico paginado para administrar consultorios, sucursales o puntos de atencion."
                    actions={hasActionAccess(user, 'clinica.lugares', 'clinica') ? <button className="btn btn-primary" onClick={() => setModalLugar({ mode: 'create', data: null })}><Plus size={16} /> Nuevo lugar</button> : null}
                />

                <div className="filters-bar" style={{ marginBottom: 18 }}>
                    <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
                        <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                        <input className="form-input" style={{ paddingLeft: 42 }} value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="Buscar por nombre, direccion, contacto o telefono..." />
                    </div>
                    <label className="checkbox-label" style={{ minWidth: 150 }}>
                        <input type="checkbox" checked={soloActivos} onChange={event => setSoloActivos(event.target.checked)} />
                        Solo activos
                    </label>
                    <select className="form-select" style={{ width: 130 }} value={pageSize} onChange={event => setPageSize(Number(event.target.value))}>
                        <option value={10}>10 / pag.</option>
                        <option value={25}>25 / pag.</option>
                        <option value={50}>50 / pag.</option>
                    </select>
                </div>

                {lugaresQuery.isLoading ? (
                    <div className="flex-center" style={{ padding: 60 }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>
                ) : lugaresQuery.isError ? (
                    <div className="alert alert-error">{formatError(lugaresQuery.error, 'No se pudieron cargar los lugares de atencion.')}</div>
                ) : (
                    <>
                        <div className="table-container" style={{ width: '100%', maxWidth: '100%', overflowX: 'auto' }}>
                            <table style={{ minWidth: 1120, tableLayout: 'fixed' }}>
                                <thead>
                                    <tr>
                                        <th style={{ width: 220 }}>Lugar</th>
                                        <th style={{ width: 220 }}>Direccion</th>
                                        <th style={{ width: 150 }}>Telefono</th>
                                        <th style={{ width: 180 }}>Responsable</th>
                                        <th style={{ width: 200 }}>Email</th>
                                        <th style={{ width: 90 }}>Oft.</th>
                                        <th style={{ width: 90 }}>Cont.</th>
                                        <th style={{ width: 100 }}>Estado</th>
                                        <th style={{ width: 120, textAlign: 'right' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.length ? items.map(item => (
                                        <tr key={item.id}>
                                            <td style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{item.nombre}</td>
                                            <td style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{item.direccion || '-'}</td>
                                            <td>{item.telefono || '-'}</td>
                                            <td style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{item.contacto_responsable || '-'}</td>
                                            <td style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{item.email || '-'}</td>
                                            <td>{item.consultas_oftalmologicas}</td>
                                            <td>{item.consultas_contactologia}</td>
                                            <td><span className={`badge ${item.activo ? 'badge-success' : 'badge-muted'}`}>{item.activo ? 'ACTIVO' : 'INACTIVO'}</span></td>
                                            <td style={{ textAlign: 'right' }}>
                                                <button type="button" className="btn btn-secondary btn-sm" onClick={event => openActionsMenu(event, item.id)}>Acciones v</button>
                                                {openActionId === item.id && (
                                                    <div
                                                        onClick={event => event.stopPropagation()}
                                                        style={{
                                                            position: 'fixed',
                                                            top: actionMenuPos.top,
                                                            left: actionMenuPos.left,
                                                            width: 220,
                                                            background: '#1f2430',
                                                            border: '1px solid rgba(255,255,255,0.12)',
                                                            borderRadius: 12,
                                                            boxShadow: '0 18px 50px rgba(0,0,0,0.45)',
                                                            padding: 8,
                                                            zIndex: 99999,
                                                            display: 'grid',
                                                            gap: 4,
                                                        }}
                                                    >
                                                        <button type="button" className="dropdown-item" style={{ background: 'transparent', color: 'var(--text-primary)' }} onClick={() => handleLugarAction(() => setModalLugar({ mode: 'edit', data: item }))}>
                                                            <Pencil size={14} style={{ marginRight: 8 }} /> Editar lugar
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="dropdown-item"
                                                            style={{ background: 'transparent', color: item.activo ? 'var(--warning)' : '#86efac' }}
                                                            onClick={() => handleLugarAction(() => saveLugarMutation.mutate({ ...item, activo: !item.activo }))}
                                                        >
                                                            <RefreshCcw size={14} style={{ marginRight: 8 }} /> {item.activo ? 'Desactivar' : 'Activar'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="dropdown-item"
                                                            style={{ background: 'transparent', color: 'var(--danger)' }}
                                                            onClick={() => handleLugarAction(() => {
                                                                if (!window.confirm('Se eliminara este lugar. Desea continuar?')) return
                                                                deleteLugarMutation.mutate(item.id)
                                                            })}
                                                        >
                                                            <Trash2 size={14} style={{ marginRight: 8 }} /> Eliminar lugar
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    )) : <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No hay lugares para mostrar.</td></tr>}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex-between" style={{ marginTop: 16, gap: 16, flexWrap: 'wrap' }}>
                            <div style={{ color: 'var(--text-muted)' }}>Mostrando pagina {lugaresQuery.data.page} de {lugaresQuery.data.total_pages} - {lugaresQuery.data.total} lugares</div>
                            <div className="flex gap-12">
                                <button className="btn btn-secondary" onClick={() => setPage(prev => Math.max(1, prev - 1))} disabled={page <= 1}>Anterior</button>
                                <button className="btn btn-secondary" onClick={() => setPage(prev => Math.min(lugaresQuery.data.total_pages, prev + 1))} disabled={page >= lugaresQuery.data.total_pages}>Siguiente</button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {modalLugar && (
                <Modal title={modalLugar.mode === 'edit' ? 'Editar lugar' : 'Nuevo lugar'} onClose={() => setModalLugar(null)} maxWidth="860px">
                    <LugarForm
                        initialData={modalLugar.data}
                        onSave={payload => saveLugarMutation.mutate(payload)}
                        onCancel={() => setModalLugar(null)}
                        saving={saveLugarMutation.isPending}
                    />
                </Modal>
            )}
        </>
    )
}

function NuevaConsultaSection() {
    const { user } = useAuth()
    const location = useLocation()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const [tipo, setTipo] = useState('OFTALMOLOGIA')
    const [patientSearch, setPatientSearch] = useState('')
    const [selectedPatient, setSelectedPatient] = useState(null)
    const [consultaModalOpen, setConsultaModalOpen] = useState(false)
    const [selectorPacienteOpen, setSelectorPacienteOpen] = useState(false)
    const [lastCreated, setLastCreated] = useState(null)
    const [recetaModal, setRecetaModal] = useState(null)
    const [lastRecetaCreated, setLastRecetaCreated] = useState(null)
    const [modalMedicamento, setModalMedicamento] = useState(null)
    const [recentCreatedMedicamento, setRecentCreatedMedicamento] = useState(null)
    const [medicamentoSearch, setMedicamentoSearch] = useState('')
    const [postSaveActions, setPostSaveActions] = useState(null)
    const [consultaSaveError, setConsultaSaveError] = useState('')
    const [agendaTurnoId, setAgendaTurnoId] = useState(null)

    useEffect(() => {
        const routePatient = location.state?.selectedPatient
        if (routePatient?.id) {
            setSelectedPatient(prev => (prev?.id === routePatient.id ? prev : routePatient))
            setAgendaTurnoId(location.state?.agendaTurnoId || null)
            setLastCreated(null)
            setLastRecetaCreated(null)
            setConsultaSaveError('')
            setPostSaveActions(null)
            if (location.state?.autoOpenConsulta) {
                setRecentCreatedMedicamento(null)
                setConsultaModalOpen(true)
            }
            navigate(location.pathname, { replace: true, state: {} })
        }
    }, [location.pathname, location.state, navigate])

    const pacientesQuery = useQuery({
        queryKey: ['clinica', 'pacientes-select', patientSearch],
        queryFn: async () => (await api.get(`/clinica/pacientes?${queryString({ buscar: patientSearch, page: 1, page_size: 12 })}`)).data,
        enabled: true,
        staleTime: 60 * 1000,
    })

    const doctoresQuery = useQuery({
        queryKey: ['clinica', 'doctores-simple'],
        queryFn: async () => (await api.get('/clinica/doctores/simple')).data,
        enabled: hasActionAccess(user, 'clinica.doctores', 'clinica'),
        staleTime: 5 * 60 * 1000,
    })

    const lugaresQuery = useQuery({
        queryKey: ['clinica', 'lugares-simple'],
        queryFn: async () => (await api.get('/clinica/lugares/simple')).data,
        enabled: hasActionAccess(user, 'clinica.lugares', 'clinica'),
        staleTime: 5 * 60 * 1000,
    })

    const anamnesisQuery = useQuery({
        queryKey: ['clinica', 'anamnesis-ultima', selectedPatient?.id],
        queryFn: async () => (await api.get(`/clinica/pacientes/${selectedPatient.id}/anamnesis`)).data,
        enabled: consultaModalOpen && Boolean(selectedPatient?.id),
    })

    const medicamentosQuery = useQuery({
        queryKey: ['clinica', 'medicamentos-simple', medicamentoSearch],
        queryFn: async () => (await api.get(`/clinica/vademecum/medicamentos/simple?${queryString({ buscar: medicamentoSearch, page_size: 12 })}`)).data,
        enabled: Boolean(recetaModal) && medicamentoSearch.trim().length >= 1,
        staleTime: 60 * 1000,
    })

    const saveConsultaMutation = useMutation({
        mutationFn: async ({ consulta, anamnesis, recetaSugerida }) => {
            if (selectedPatient?.id && anamnesis) {
                await api.post(`/clinica/pacientes/${selectedPatient.id}/anamnesis`, {
                    paciente_id: selectedPatient.id,
                    ...anamnesis,
                })
            }
            const resumen = buildAnamnesisSummary(anamnesis)
            const endpoint = tipo === 'OFTALMOLOGIA' ? '/clinica/consultas/oftalmologia' : '/clinica/consultas/contactologia'
            const consultaFinal = {
                ...consulta,
                agenda_turno_id: agendaTurnoId || null,
                motivo: tipo === 'OFTALMOLOGIA'
                    ? ((consulta.motivo || '').trim() || resumen || null)
                    : consulta.motivo,
            }
            const created = (await api.post(endpoint, consultaFinal)).data
            return { created, recetaSugerida }
        },
        onSuccess: result => {
            const data = result?.created
            setConsultaSaveError('')
            setLastCreated(data)
            void Promise.all([
                queryClient.invalidateQueries({ queryKey: ['clinica', 'dashboard'] }),
                queryClient.invalidateQueries({ queryKey: ['clinica', 'pacientes'] }),
                queryClient.invalidateQueries({ queryKey: ['clinica', 'paciente-historial', selectedPatient?.id] }),
                queryClient.invalidateQueries({ queryKey: ['clinica', 'anamnesis-ultima', selectedPatient?.id] }),
                queryClient.invalidateQueries({ queryKey: ['clinica', 'agenda'] }),
                queryClient.invalidateQueries({ queryKey: ['clinica', 'agenda-recordatorios'] }),
            ])
            if (data?.id && selectedPatient?.id) {
                setPostSaveActions({
                    consultaId: data.id,
                    type: tipo,
                    patientId: selectedPatient.id,
                    recetaInicial: {
                        fecha_emision: new Date().toISOString(),
                        doctor_nombre: result?.recetaSugerida?.doctor_nombre || data?.doctor_nombre || '',
                        diagnostico: result?.recetaSugerida?.diagnostico || data?.diagnostico || '',
                        observaciones: result?.recetaSugerida?.observaciones || data?.plan_tratamiento || '',
                        detalles: result?.recetaSugerida?.detalles || [],
                    },
                })
            }
        },
        onError: error => {
            setConsultaSaveError(formatError(error, 'No se pudo guardar la consulta.'))
        },
    })

    const openPdfBlob = async endpoint => {
        const response = await api.get(endpoint, { responseType: 'blob' })
        const blob = new Blob([response.data], { type: 'application/pdf' })
        const url = window.URL.createObjectURL(blob)
        window.open(url, '_blank', 'noopener,noreferrer')
        setTimeout(() => window.URL.revokeObjectURL(url), 1500)
    }

    const saveRecetaMutation = useMutation({
        mutationFn: async payload => (await api.post('/clinica/recetas-medicamentos', payload)).data,
        onSuccess: result => {
            setLastRecetaCreated(result)
            setRecetaModal(prev => prev ? {
                ...prev,
                mode: 'edit',
                id: result.id,
                initialData: result,
            } : prev)
            setMedicamentoSearch('')
            void Promise.all([
                queryClient.invalidateQueries({ queryKey: ['clinica', 'dashboard'] }),
                queryClient.invalidateQueries({ queryKey: ['clinica', 'paciente-historial', selectedPatient?.id] }),
            ])
        },
    })

    const handleCloseSuggestedReceta = () => {
        const recetaYaGuardada = Boolean(lastRecetaCreated?.id || recetaModal?.initialData?.id)
        if (!recetaYaGuardada) {
            const shouldClose = window.confirm('La receta aun no fue guardada. Si cierras ahora, perderas los datos cargados. Deseas salir igual?')
            if (!shouldClose) return
        }
        setRecentCreatedMedicamento(null)
        setRecetaModal(null)
    }

    const saveMedicamentoMutation = useMutation({
        mutationFn: async payload => (await api.post('/clinica/vademecum/medicamentos', payload)).data,
        onSuccess: async result => {
            setRecentCreatedMedicamento(result)
            setModalMedicamento(null)
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['clinica', 'medicamentos-simple'] }),
                queryClient.invalidateQueries({ queryKey: ['clinica', 'vademecum-medicamentos'] }),
            ])
        },
    })

    return (
        <>
            <div className="card" style={{ marginTop: 22 }}>
                <SectionHeader
                    title="Nueva consulta"
                    subtitle="Primero selecciona paciente y tipo; luego abrimos una ventana clinica aparte, mas cercana al flujo original de Python."
                />

                <div className="grid-2" style={{ alignItems: 'start', gap: 18 }}>
                    <div className="card" style={{ padding: 18, minWidth: 0 }}>
                        <div className="form-group" style={{ marginBottom: 18 }}>
                            <label className="form-label">Tipo de consulta</label>
                            <div className="flex gap-12" style={{ flexWrap: 'wrap' }}>
                                <button
                                    type="button"
                                    className={tipo === 'OFTALMOLOGIA' ? 'btn btn-primary' : 'btn btn-secondary'}
                                    onClick={() => setTipo('OFTALMOLOGIA')}
                                >
                                    Oftalmologia
                                </button>
                                <button
                                    type="button"
                                    className={tipo === 'CONTACTOLOGIA' ? 'btn btn-primary' : 'btn btn-secondary'}
                                    onClick={() => setTipo('CONTACTOLOGIA')}
                                >
                                    Contactologia
                                </button>
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Paciente</label>
                            <button
                                type="button"
                                className="form-input"
                                onClick={() => setSelectorPacienteOpen(true)}
                                style={{
                                    width: '100%',
                                    minHeight: 46,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    textAlign: 'left',
                                    gap: 12,
                                }}
                            >
                                <span style={{ color: selectedPatient ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                                    {selectedPatient
                                        ? `${selectedPatient.nombre_completo}${selectedPatient.ci_pasaporte ? ` - ${selectedPatient.ci_pasaporte}` : ''}`
                                        : 'Seleccionar paciente...'}
                                </span>
                                <Users size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                            </button>
                            <div style={{ marginTop: 10 }}>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setSelectorPacienteOpen(true)}
                                >
                                    <Search size={16} />
                                    Seleccionar paciente
                                </button>
                            </div>
                        </div>

                        {selectedPatient ? (
                            <div className="card" style={{ padding: 16, marginTop: 18, background: 'rgba(255,255,255,0.02)' }}>
                                <div style={{ fontWeight: 800 }}>{selectedPatient.nombre_completo}</div>
                                <div style={{ color: 'var(--text-muted)', marginTop: 6, display: 'grid', gap: 4 }}>
                                    <span>CI: {selectedPatient.ci_pasaporte || '-'}</span>
                                    <span>Edad: {selectedPatient.edad_calculada ?? selectedPatient.edad_manual ?? '-'}</span>
                                    <span>Telefono: {selectedPatient.telefono || '-'}</span>
                                    <span>Referidor: {selectedPatient.referidor_nombre || 'Sin referidor'}</span>
                                    <span>{selectedPatient.es_cliente ? 'Cliente vinculado' : 'Aun no es cliente'}</span>
                                </div>
                            </div>
                        ) : (
                            <div style={{ marginTop: 18, color: 'var(--text-muted)' }}>
                                Seleccione un paciente para comenzar la consulta.
                            </div>
                        )}

                        <div className="flex gap-12" style={{ marginTop: 18, flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                className="btn btn-primary"
                                disabled={saveConsultaMutation.isPending}
                                onClick={() => {
                                    if (!selectedPatient) {
                                        setSelectorPacienteOpen(true)
                                        return
                                    }
                                    if (!location.state?.agendaTurnoId) {
                                        setAgendaTurnoId(null)
                                    }
                                    setRecentCreatedMedicamento(null)
                                    setLastCreated(null)
                                    setLastRecetaCreated(null)
                                    setConsultaSaveError('')
                                    setPostSaveActions(null)
                                    setConsultaModalOpen(true)
                                }}
                            >
                                <Plus size={16} />
                                Abrir nueva consulta
                            </button>
                        </div>

                        {consultaSaveError && (
                            <div className="alert alert-error" style={{ marginTop: 16 }}>
                                {consultaSaveError}
                            </div>
                        )}

                    </div>

                    <div className="card" style={{ padding: 18, minWidth: 0 }}>
                        <div style={{ fontSize: '1rem', fontWeight: 800, marginBottom: 10 }}>Referencia del flujo Python</div>
                        <div style={{ color: 'var(--text-muted)', display: 'grid', gap: 10 }}>
                            <div>1. Seleccionar paciente.</div>
                            <div>2. Abrir una ventana aparte para la consulta.</div>
                            <div>3. Completar la consulta sin mezclarla con la grilla principal.</div>
                            <div>4. Guardar y volver al modulo con el historial ya actualizado.</div>
                        </div>
                        <div className="card" style={{ marginTop: 18, padding: 16, background: 'rgba(255,255,255,0.02)' }}>
                            <div style={{ fontWeight: 700, marginBottom: 8 }}>Campos ya migrados</div>
                            <div style={{ color: 'var(--text-muted)', display: 'grid', gap: 6 }}>
                                <span>Fecha y hora</span>
                                <span>Doctor y lugar</span>
                                <span>Motivo, diagnostico y plan</span>
                                <span>Correccion refractiva / resumen de contactologia</span>
                                <span>Observaciones y PDF</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <ConsultaIntegralModal
                open={consultaModalOpen}
                patient={selectedPatient}
                type={tipo}
                onTypeChange={setTipo}
                doctores={doctoresQuery.data || []}
                lugares={lugaresQuery.data || []}
                onSave={payload => saveConsultaMutation.mutate(payload)}
                onClose={() => setConsultaModalOpen(false)}
                saving={saveConsultaMutation.isPending}
                error={consultaSaveError}
                successData={lastCreated}
                onOpenLentesPdf={() => openPdfBlob(`/clinica/consultas/oftalmologia/${lastCreated?.id}/pdf`).catch(error => window.alert(formatError(error, 'No se pudo generar la receta optica.')))}
                onOpenIndicacionesPdf={() => openPdfBlob(`/clinica/consultas/${tipo === 'OFTALMOLOGIA' ? 'oftalmologia' : 'contactologia'}/${lastCreated?.id}/indicaciones-pdf`).catch(error => window.alert(formatError(error, 'No se pudo generar el PDF de indicaciones.')))}
                onOpenRecetaMedicamentos={() => {
                    setLastRecetaCreated(null)
                    setRecetaModal({
                        mode: 'create',
                        patientId: selectedPatient?.id,
                        consultaId: lastCreated?.id || null,
                        consultaTipo: tipo,
                        initialData: postSaveActions?.recetaInicial || {
                            fecha_emision: new Date().toISOString(),
                            doctor_nombre: lastCreated?.doctor_nombre || '',
                            diagnostico: lastCreated?.diagnostico || '',
                            observaciones: lastCreated?.plan_tratamiento || '',
                            detalles: [],
                        },
                    })
                }}
                initialAnamnesis={anamnesisQuery.data || null}
                anamnesisLoading={anamnesisQuery.isLoading}
            />

            {recetaModal && (
                <Modal
                    title="Receta sugerida desde la consulta"
                    onClose={handleCloseSuggestedReceta}
                    maxWidth="980px"
                    closeOnBackdrop={false}
                >
                    <RecetaMedicamentoForm
                        initialData={recetaModal.initialData}
                        pacienteId={recetaModal.patientId}
                        consultaId={recetaModal.consultaId}
                        consultaTipo={recetaModal.consultaTipo}
                        doctorOptions={doctoresQuery.data || []}
                        onSearchMedicamento={setMedicamentoSearch}
                        medicamentoOptions={medicamentosQuery.data || []}
                        medicamentoLoading={medicamentosQuery.isFetching}
                        onCreateMedicamento={() => setModalMedicamento({ mode: 'create', data: null })}
                        onSave={payload => saveRecetaMutation.mutate(payload)}
                        onCancel={handleCloseSuggestedReceta}
                        saving={saveRecetaMutation.isPending}
                        savedReceta={lastRecetaCreated || recetaModal.initialData}
                        recentMedicamento={recentCreatedMedicamento}
                        onOpenCompraPdf={() => openPdfBlob(`/clinica/recetas-medicamentos/${(lastRecetaCreated?.id || recetaModal.initialData?.id)}/compra-pdf`).catch(error => window.alert(formatError(error, 'No se pudo generar el PDF de compra.')))}
                        onOpenIndicacionesPdf={() => openPdfBlob(`/clinica/recetas-medicamentos/${(lastRecetaCreated?.id || recetaModal.initialData?.id)}/indicaciones-pdf`).catch(error => window.alert(formatError(error, 'No se pudo generar el PDF de indicaciones.')))}
                    />
                </Modal>
            )}

            {modalMedicamento && (
                <Modal
                    title="Nuevo medicamento"
                    onClose={() => setModalMedicamento(null)}
                    maxWidth="760px"
                >
                    <VademecumMedicamentoForm
                        initialData={modalMedicamento.data}
                        onSave={payload => saveMedicamentoMutation.mutate(payload)}
                        onCancel={() => setModalMedicamento(null)}
                        saving={saveMedicamentoMutation.isPending}
                    />
                </Modal>
            )}


            {selectorPacienteOpen && (
                <Modal
                    title="Seleccionar paciente"
                    onClose={() => setSelectorPacienteOpen(false)}
                    maxWidth="860px"
                >
                    <div className="form-group">
                        <label className="form-label">Buscar paciente</label>
                        <div style={{ position: 'relative' }}>
                            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input
                                className="form-input"
                                style={{ paddingLeft: 36 }}
                                value={patientSearch}
                                onChange={event => setPatientSearch(event.target.value)}
                                placeholder="Buscar por nombre, CI o telefono..."
                            />
                        </div>
                    </div>
                    <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: 14 }}>
                        <div className="table-container" style={{ maxHeight: 420 }}>
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Paciente</th>
                                        <th>CI</th>
                                        <th>Telefono</th>
                                        <th>Accion</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(pacientesQuery.data?.items || []).length ? (pacientesQuery.data.items || []).map(item => (
                                        <tr key={item.id}>
                                            <td>{item.nombre_completo || '-'}</td>
                                            <td>{item.ci_pasaporte || '-'}</td>
                                            <td>{item.telefono || '-'}</td>
                                            <td>
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary"
                                                    onClick={() => {
                                                        setSelectedPatient(item)
                                                        setAgendaTurnoId(null)
                                                        setLastCreated(null)
                                                        setSelectorPacienteOpen(false)
                                                    }}
                                                >
                                                    Seleccionar
                                                </button>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                                                {pacientesQuery.isFetching ? 'Buscando pacientes...' : 'Sin pacientes para esta busqueda.'}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div className="flex gap-12" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
                        <button type="button" className="btn btn-secondary" onClick={() => setSelectorPacienteOpen(false)}>
                            Cerrar
                        </button>
                    </div>
                </Modal>
            )}
        </>
    )
}

function HistorialClinicoGeneralSection() {
    const { user } = useAuth()
    const queryClient = useQueryClient()
    const today = useMemo(() => new Date(), [])
    const monthStart = useMemo(() => {
        const base = new Date(today.getFullYear(), today.getMonth(), 1)
        return base.toISOString().slice(0, 10)
    }, [today])
    const todayValue = useMemo(() => today.toISOString().slice(0, 10), [today])

    const [fechaDesde, setFechaDesde] = useState(monthStart)
    const [fechaHasta, setFechaHasta] = useState(todayValue)
    const [buscarInput, setBuscarInput] = useState('')
    const [selectedPacienteFilter, setSelectedPacienteFilter] = useState(null)
    const [doctorId, setDoctorId] = useState('')
    const [tipoFiltro, setTipoFiltro] = useState('TODOS')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(25)
    const [appliedFilters, setAppliedFilters] = useState({
        fecha_desde: monthStart,
        fecha_hasta: todayValue,
        buscar: '',
        paciente_id: '',
        doctor_id: '',
        tipo: 'TODOS',
    })
    const [pacienteSearch, setPacienteSearch] = useState('')
    const [selectedEntry, setSelectedEntry] = useState(null)
    const [consultaModal, setConsultaModal] = useState(null)
    const [recetaModal, setRecetaModal] = useState(null)
    const [modalMedicamento, setModalMedicamento] = useState(null)
    const [recentCreatedMedicamento, setRecentCreatedMedicamento] = useState(null)
    const [medicamentoSearch, setMedicamentoSearch] = useState('')
    const [actionError, setActionError] = useState('')
    const [documentosMenuOpen, setDocumentosMenuOpen] = useState(false)
    const [consultaSavePhase, setConsultaSavePhase] = useState('idle')

    const pacientesFilterQuery = useQuery({
        queryKey: ['clinica', 'historial-general-pacientes-filter', pacienteSearch],
        queryFn: async () => (await api.get(`/clinica/pacientes?${queryString({ buscar: pacienteSearch, page: 1, page_size: 12 })}`)).data,
        enabled: hasActionAccess(user, 'clinica.pacientes', 'clinica'),
    })

    const doctoresQuery = useQuery({
        queryKey: ['clinica', 'doctores-simple'],
        queryFn: async () => (await api.get('/clinica/doctores/simple')).data,
        enabled: hasActionAccess(user, 'clinica.doctores', 'clinica'),
        staleTime: 5 * 60 * 1000,
    })

    const lugaresQuery = useQuery({
        queryKey: ['clinica', 'lugares-simple'],
        queryFn: async () => (await api.get('/clinica/lugares/simple')).data,
        enabled: hasActionAccess(user, 'clinica.lugares', 'clinica'),
        staleTime: 5 * 60 * 1000,
    })

    const medicamentosQuery = useQuery({
        queryKey: ['clinica', 'medicamentos-simple', medicamentoSearch],
        queryFn: async () => (await api.get(`/clinica/vademecum/medicamentos/simple?${queryString({ buscar: medicamentoSearch, page_size: 12 })}`)).data,
        enabled: medicamentoSearch.trim().length >= 1,
    })

    const historialQuery = useQuery({
        queryKey: ['clinica', 'historial-general', appliedFilters, page, pageSize],
        queryFn: async () => (
            await api.get(`/clinica/historial-general?${queryString({
                ...appliedFilters,
                page,
                page_size: pageSize,
            })}`)
        ).data,
    })

    const detalleQuery = useQuery({
        queryKey: ['clinica', 'historial-general-detalle', selectedEntry?.tipo, selectedEntry?.id],
        queryFn: async () => {
            if (!selectedEntry?.id) return null
            if (selectedEntry.tipo === 'RECETA_MEDICAMENTOS') {
                return (await api.get(`/clinica/recetas-medicamentos/${selectedEntry.id}`)).data
            }
            const tipoRuta = selectedEntry.tipo === 'OFTALMOLOGIA' ? 'oftalmologia' : 'contactologia'
            return (await api.get(`/clinica/consultas/${tipoRuta}/${selectedEntry.id}`)).data
        },
        enabled: Boolean(selectedEntry?.id),
    })

    useEffect(() => {
        const items = historialQuery.data?.items || []
        if (!items.length) {
            setSelectedEntry(null)
            return
        }
        const stillExists = selectedEntry && items.some(item => item.id === selectedEntry.id && item.tipo === selectedEntry.tipo)
        if (!stillExists) {
            setSelectedEntry(items[0])
        }
    }, [historialQuery.data?.items])

    useEffect(() => {
        setPage(1)
    }, [pageSize])

    useEffect(() => {
        if (!documentosMenuOpen) return undefined
        const close = () => setDocumentosMenuOpen(false)
        window.addEventListener('click', close)
        window.addEventListener('resize', close)
        return () => {
            window.removeEventListener('click', close)
            window.removeEventListener('resize', close)
        }
    }, [documentosMenuOpen])

    const canView = hasActionAccess(user, 'clinica.consultas_ver', 'clinica')
    const canEdit = hasActionAccess(user, 'clinica.consultas_editar', 'clinica')
    const canExport = hasActionAccess(user, 'clinica.consultas_exportar', 'clinica')

    const applyFilters = () => {
        setPage(1)
        setAppliedFilters({
            fecha_desde: fechaDesde,
            fecha_hasta: fechaHasta,
            buscar: buscarInput.trim(),
            paciente_id: selectedPacienteFilter?.id || '',
            doctor_id: doctorId || '',
            tipo: tipoFiltro,
        })
    }

    const invalidateAll = () => {
        void Promise.all([
            queryClient.invalidateQueries({ queryKey: ['clinica', 'historial-general'] }),
            queryClient.invalidateQueries({ queryKey: ['clinica', 'dashboard'] }),
            queryClient.invalidateQueries({ queryKey: ['clinica', 'pacientes'] }),
            queryClient.invalidateQueries({ queryKey: ['clinica', 'paciente-historial'] }),
            queryClient.invalidateQueries({ queryKey: ['clinica', 'historial-general-detalle'] }),
            queryClient.invalidateQueries({ queryKey: ['clinica', 'consulta-detalle'] }),
        ])
    }

    const saveConsultaMutation = useMutation({
        mutationFn: async payload => {
            if (!consultaModal?.id) throw new Error('Consulta no seleccionada.')
            const endpoint = consultaModal.type === 'OFTALMOLOGIA'
                ? `/clinica/consultas/oftalmologia/${consultaModal.id}`
                : `/clinica/consultas/contactologia/${consultaModal.id}`
            return (await api.put(endpoint, payload)).data
        },
        onMutate: () => {
            setConsultaSavePhase('saving')
        },
        onSuccess: async () => {
            setConsultaSavePhase('refreshing')
            invalidateAll()
            setConsultaModal(null)
            setConsultaSavePhase('idle')
        },
        onError: () => {
            setConsultaSavePhase('idle')
        },
    })

    const deleteConsultaMutation = useMutation({
        mutationFn: async entry => {
            const endpoint = entry.tipo === 'OFTALMOLOGIA'
                ? `/clinica/consultas/oftalmologia/${entry.id}`
                : `/clinica/consultas/contactologia/${entry.id}`
            await api.delete(endpoint)
        },
        onSuccess: async () => {
            await invalidateAll()
        },
    })

    const saveRecetaMutation = useMutation({
        mutationFn: async payload => {
            if (!recetaModal?.id) throw new Error('Receta no seleccionada.')
            return (await api.put(`/clinica/recetas-medicamentos/${recetaModal.id}`, payload)).data
        },
        onSuccess: () => {
            setRecetaModal(null)
            setMedicamentoSearch('')
            invalidateAll()
        },
    })

    const saveMedicamentoMutation = useMutation({
        mutationFn: async payload => (await api.post('/clinica/vademecum/medicamentos', payload)).data,
        onSuccess: async result => {
            setRecentCreatedMedicamento(result)
            setModalMedicamento(null)
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['clinica', 'medicamentos-simple'] }),
                queryClient.invalidateQueries({ queryKey: ['clinica', 'vademecum-medicamentos'] }),
            ])
        },
    })

    const deleteRecetaMutation = useMutation({
        mutationFn: async recetaId => {
            await api.delete(`/clinica/recetas-medicamentos/${recetaId}`)
        },
        onSuccess: async () => {
            await invalidateAll()
        },
    })

    const openConsultaModal = async mode => {
        if (!selectedEntry?.id || selectedEntry.tipo === 'RECETA_MEDICAMENTOS') return
        try {
            setActionError('')
            const tipoRuta = selectedEntry.tipo === 'OFTALMOLOGIA' ? 'oftalmologia' : 'contactologia'
            const response = await api.get(`/clinica/consultas/${tipoRuta}/${selectedEntry.id}`)
            setConsultaModal({
                mode,
                id: selectedEntry.id,
                type: selectedEntry.tipo,
                patientId: selectedEntry.paciente_id,
                initialData: response.data,
            })
        } catch (error) {
            setActionError(formatError(error, 'No se pudo cargar la consulta.'))
        }
    }

    const openRecetaModal = async mode => {
        if (!selectedEntry?.id || selectedEntry.tipo !== 'RECETA_MEDICAMENTOS') return
        try {
            setActionError('')
            setRecentCreatedMedicamento(null)
            const response = await api.get(`/clinica/recetas-medicamentos/${selectedEntry.id}`)
            setRecetaModal({
                mode,
                id: selectedEntry.id,
                patientId: selectedEntry.paciente_id,
                initialData: response.data,
            })
        } catch (error) {
            setActionError(formatError(error, 'No se pudo cargar la receta.'))
        }
    }

    const openPdf = async () => {
        if (!selectedEntry?.id) return
        try {
            setActionError('')
            const endpoint = selectedEntry.tipo === 'RECETA_MEDICAMENTOS'
                ? `/clinica/recetas-medicamentos/${selectedEntry.id}/pdf`
                : `/clinica/consultas/${selectedEntry.tipo === 'OFTALMOLOGIA' ? 'oftalmologia' : 'contactologia'}/${selectedEntry.id}/pdf`
            const response = await api.get(endpoint, { responseType: 'blob' })
            const blob = new Blob([response.data], { type: 'application/pdf' })
            const url = window.URL.createObjectURL(blob)
            window.open(url, '_blank', 'noopener,noreferrer')
            setTimeout(() => window.URL.revokeObjectURL(url), 1500)
        } catch (error) {
            setActionError(formatError(error, 'No se pudo generar el PDF.'))
        }
    }

    const latestLinkedReceta = Array.isArray(detalleQuery.data?.recetas_medicamentos_relacionadas)
        ? detalleQuery.data.recetas_medicamentos_relacionadas[0] || null
        : null
    const hasRecetaMedicamentos = Boolean(latestLinkedReceta?.id)
    const hasRecetaLentes = Boolean(
        selectedEntry?.tipo === 'OFTALMOLOGIA' && (
            detalleQuery.data?.av_cc_lejos_od ||
            detalleQuery.data?.av_cc_lejos_oi ||
            detalleQuery.data?.ref_od_esfera ||
            detalleQuery.data?.ref_od_cilindro ||
            detalleQuery.data?.ref_od_eje ||
            detalleQuery.data?.ref_od_adicion ||
            detalleQuery.data?.ref_oi_esfera ||
            detalleQuery.data?.ref_oi_cilindro ||
            detalleQuery.data?.ref_oi_eje ||
            detalleQuery.data?.ref_oi_adicion
        )
    )

    const handleUnavailableDocument = message => {
        setActionError(message)
        setDocumentosMenuOpen(false)
    }

    const openConsultaIndicacionesPdf = async () => {
        if (!selectedEntry?.id || selectedEntry.tipo === 'RECETA_MEDICAMENTOS') return
        try {
            setActionError('')
            const tipoRuta = selectedEntry.tipo === 'OFTALMOLOGIA' ? 'oftalmologia' : 'contactologia'
            const response = await api.get(`/clinica/consultas/${tipoRuta}/${selectedEntry.id}/indicaciones-pdf`, { responseType: 'blob' })
            const blob = new Blob([response.data], { type: 'application/pdf' })
            const url = window.URL.createObjectURL(blob)
            window.open(url, '_blank', 'noopener,noreferrer')
            setTimeout(() => window.URL.revokeObjectURL(url), 1500)
            setDocumentosMenuOpen(false)
        } catch (error) {
            setActionError(formatError(error, 'No se pudo generar el PDF de indicaciones.'))
        }
    }

    const openLinkedRecetaCompraPdf = async () => {
        if (!latestLinkedReceta?.id) {
            handleUnavailableDocument('No hay receta de medicamentos vinculada a esta consulta.')
            return
        }
        try {
            setActionError('')
            const response = await api.get(`/clinica/recetas-medicamentos/${latestLinkedReceta.id}/compra-pdf`, { responseType: 'blob' })
            const blob = new Blob([response.data], { type: 'application/pdf' })
            const url = window.URL.createObjectURL(blob)
            window.open(url, '_blank', 'noopener,noreferrer')
            setTimeout(() => window.URL.revokeObjectURL(url), 1500)
            setDocumentosMenuOpen(false)
        } catch (error) {
            setActionError(formatError(error, 'No se pudo generar el PDF de la receta de medicamentos.'))
        }
    }

    const openLinkedRecetaIndicacionesPdf = async () => {
        if (!latestLinkedReceta?.id) {
            handleUnavailableDocument('No hay receta de medicamentos vinculada a esta consulta.')
            return
        }
        try {
            setActionError('')
            const response = await api.get(`/clinica/recetas-medicamentos/${latestLinkedReceta.id}/indicaciones-pdf`, { responseType: 'blob' })
            const blob = new Blob([response.data], { type: 'application/pdf' })
            const url = window.URL.createObjectURL(blob)
            window.open(url, '_blank', 'noopener,noreferrer')
            setTimeout(() => window.URL.revokeObjectURL(url), 1500)
            setDocumentosMenuOpen(false)
        } catch (error) {
            setActionError(formatError(error, 'No se pudo generar el PDF de indicaciones de medicamentos.'))
        }
    }

    const items = historialQuery.data?.items || []

    return (
        <>
            <div className="card" style={{ marginTop: 22, overflow: 'visible' }}>
                <div
                    style={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 4,
                        background: 'var(--bg-card)',
                        paddingBottom: 14,
                        marginBottom: 18,
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                    }}
                >
                    <SectionHeader
                        title="Historial clinico general"
                        subtitle="Consultas y recetas del modulo clinico con filtros por paciente, doctor, tipo y fechas."
                        actions={<button type="button" className="btn btn-primary" onClick={applyFilters}><Search size={16} /> Aplicar filtros</button>}
                    />

                    <div
                        className="dashboard-stats"
                        style={{
                            marginBottom: 18,
                            display: 'grid',
                            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                            gap: 12,
                            alignItems: 'stretch',
                        }}
                    >
                        <StatCard label="Total" value={fmtNumber(historialQuery.data?.total || 0)} detail="registros filtrados" accent={CLINICA_PALETTE.accent} />
                        <StatCard label="Oftalmologia" value={fmtNumber(historialQuery.data?.total_oftalmologia || 0)} detail="consultas" accent={CLINICA_PALETTE.accentAlt} />
                        <StatCard label="Contactologia" value={fmtNumber(historialQuery.data?.total_contactologia || 0)} detail="consultas" accent="#60a5fa" />
                        <StatCard label="Recetas" value={fmtNumber(historialQuery.data?.total_recetas || 0)} detail="medicamentos" accent="#f59e0b" />
                    </div>

                    <div className="filters-bar" style={{ marginBottom: 18 }}>
                        <input className="form-input" type="date" value={fechaDesde} onChange={event => setFechaDesde(event.target.value)} style={{ width: 170 }} />
                        <input className="form-input" type="date" value={fechaHasta} onChange={event => setFechaHasta(event.target.value)} style={{ width: 170 }} />
                        <div style={{ minWidth: 260, flex: 1 }}>
                            <div className="form-label" style={{ marginBottom: 8 }}>Paciente especifico</div>
                            <RemoteSearchSelect
                                value={selectedPacienteFilter}
                                onChange={setSelectedPacienteFilter}
                                onSearch={setPacienteSearch}
                                options={pacientesFilterQuery.data?.items || []}
                                loading={pacientesFilterQuery.isFetching}
                                placeholder="Filtrar por un paciente puntual..."
                                promptMessage="Escriba para buscar un paciente especifico"
                                emptyMessage="Sin pacientes"
                                minChars={0}
                                floating={false}
                                getOptionLabel={option => option?.nombre_completo ? `${option.nombre_completo}${option.ci_pasaporte ? ` - ${option.ci_pasaporte}` : ''}` : ''}
                                getOptionValue={option => option?.id}
                            />
                        </div>
                        <select className="form-select" style={{ width: 220 }} value={doctorId} onChange={event => setDoctorId(event.target.value)}>
                            <option value="">Todos los doctores</option>
                            {(doctoresQuery.data || []).map(doctor => (
                                <option key={doctor.id} value={doctor.id}>{doctor.nombre_completo}</option>
                            ))}
                        </select>
                        <select className="form-select" style={{ width: 180 }} value={tipoFiltro} onChange={event => setTipoFiltro(event.target.value)}>
                            <option value="TODOS">Todos los tipos</option>
                            <option value="OFTALMOLOGIA">Oftalmologia</option>
                            <option value="CONTACTOLOGIA">Contactologia</option>
                            <option value="RECETA_MEDICAMENTOS">Recetas</option>
                        </select>
                        <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
                            <div className="form-label" style={{ marginBottom: 8 }}>Buscar en historial</div>
                            <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                            <input className="form-input" style={{ paddingLeft: 42 }} value={buscarInput} onChange={event => setBuscarInput(event.target.value)} placeholder="Texto libre en paciente, doctor, diagnostico, motivo o notas..." />
                        </div>
                        <select className="form-select" style={{ width: 130 }} value={pageSize} onChange={event => setPageSize(Number(event.target.value))}>
                            <option value={10}>10 / pag.</option>
                            <option value={25}>25 / pag.</option>
                            <option value={50}>50 / pag.</option>
                        </select>
                    </div>

                    <div className="flex gap-12" style={{ flexWrap: 'wrap' }}>
                    {selectedEntry?.tipo !== 'RECETA_MEDICAMENTOS' && canView && <button type="button" className="btn btn-secondary" onClick={() => openConsultaModal('view')} disabled={!selectedEntry}><Eye size={16} /> Ver consulta</button>}
                    {selectedEntry?.tipo === 'RECETA_MEDICAMENTOS' && canView && <button type="button" className="btn btn-secondary" onClick={() => openRecetaModal('view')} disabled={!selectedEntry}><Eye size={16} /> Ver receta</button>}
                    {selectedEntry?.tipo !== 'RECETA_MEDICAMENTOS' && canEdit && <button type="button" className="btn btn-warning" onClick={() => openConsultaModal('edit')} disabled={!selectedEntry}><Pencil size={16} /> Editar</button>}
                    {selectedEntry?.tipo === 'RECETA_MEDICAMENTOS' && canEdit && <button type="button" className="btn btn-warning" onClick={() => openRecetaModal('edit')} disabled={!selectedEntry}><Pencil size={16} /> Editar</button>}
                    {canExport && (
                        <div style={{ position: 'relative' }}>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={event => {
                                    event.stopPropagation()
                                    setDocumentosMenuOpen(prev => !prev)
                                }}
                                disabled={!selectedEntry}
                            >
                                <FileText size={16} /> Documentos v
                            </button>
                            {documentosMenuOpen && selectedEntry && (
                                <div
                                    style={{
                                        position: 'absolute',
                                        top: 'calc(100% + 8px)',
                                        left: 0,
                                        minWidth: 280,
                                        zIndex: 9999,
                                        background: '#202633',
                                        border: '1px solid rgba(255,255,255,0.08)',
                                        borderRadius: 12,
                                        boxShadow: '0 20px 45px rgba(0,0,0,0.35)',
                                        padding: 8,
                                        display: 'grid',
                                        gap: 6,
                                    }}
                                    onClick={event => event.stopPropagation()}
                                >
                                    {selectedEntry.tipo === 'RECETA_MEDICAMENTOS' ? (
                                        <>
                                            <button type="button" className="dropdown-item" style={{ background: '#242b3a', color: 'var(--text-primary)', borderRadius: 10 }} onClick={openPdf}>
                                                <FileText size={14} style={{ marginRight: 8 }} /> PDF de receta de medicamentos
                                            </button>
                                            <button type="button" className="dropdown-item" style={{ background: '#242b3a', color: 'var(--text-primary)', borderRadius: 10 }} onClick={async () => {
                                                try {
                                                    setActionError('')
                                                    const response = await api.get(`/clinica/recetas-medicamentos/${selectedEntry.id}/indicaciones-pdf`, { responseType: 'blob' })
                                                    const blob = new Blob([response.data], { type: 'application/pdf' })
                                                    const url = window.URL.createObjectURL(blob)
                                                    window.open(url, '_blank', 'noopener,noreferrer')
                                                    setTimeout(() => window.URL.revokeObjectURL(url), 1500)
                                                    setDocumentosMenuOpen(false)
                                                } catch (error) {
                                                    setActionError(formatError(error, 'No se pudo generar el PDF de indicaciones de medicamentos.'))
                                                }
                                            }}>
                                                <FileText size={14} style={{ marginRight: 8 }} /> Indicaciones de medicamentos
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button type="button" className="dropdown-item" style={{ background: '#242b3a', color: 'var(--text-primary)', borderRadius: 10 }} onClick={openPdf}>
                                                <FileText size={14} style={{ marginRight: 8 }} /> PDF de consulta
                                            </button>
                                            <button
                                                type="button"
                                                className="dropdown-item"
                                                style={{ background: hasRecetaLentes ? '#242b3a' : '#2b303d', color: hasRecetaLentes ? 'var(--text-primary)' : 'var(--text-muted)', borderRadius: 10 }}
                                                onClick={() => {
                                                    if (!hasRecetaLentes) {
                                                        handleUnavailableDocument('No hay datos de refraccion cargados para generar receta de lentes.')
                                                        return
                                                    }
                                                    openPdf()
                                                }}
                                            >
                                                <FileText size={14} style={{ marginRight: 8 }} /> Receta de lentes PDF
                                            </button>
                                            <button
                                                type="button"
                                                className="dropdown-item"
                                                style={{ background: hasRecetaMedicamentos ? '#242b3a' : '#2b303d', color: hasRecetaMedicamentos ? 'var(--text-primary)' : 'var(--text-muted)', borderRadius: 10 }}
                                                onClick={openLinkedRecetaCompraPdf}
                                            >
                                                <FileText size={14} style={{ marginRight: 8 }} /> Receta de medicamentos PDF
                                            </button>
                                            <button
                                                type="button"
                                                className="dropdown-item"
                                                style={{ background: hasRecetaMedicamentos ? '#242b3a' : '#2b303d', color: hasRecetaMedicamentos ? 'var(--text-primary)' : 'var(--text-muted)', borderRadius: 10 }}
                                                onClick={openLinkedRecetaIndicacionesPdf}
                                            >
                                                <FileText size={14} style={{ marginRight: 8 }} /> Indicaciones de medicamentos
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                    {selectedEntry?.tipo !== 'RECETA_MEDICAMENTOS' && canEdit && (
                        <button
                            type="button"
                            className="btn btn-danger"
                            disabled={!selectedEntry || deleteConsultaMutation.isPending}
                            onClick={() => {
                                if (!selectedEntry) return
                                if (!window.confirm('Se eliminara esta consulta. Desea continuar?')) return
                                deleteConsultaMutation.mutate(selectedEntry)
                            }}
                        >
                            <Trash2 size={16} /> Eliminar
                        </button>
                    )}
                    {selectedEntry?.tipo === 'RECETA_MEDICAMENTOS' && canEdit && (
                        <button
                            type="button"
                            className="btn btn-danger"
                            disabled={!selectedEntry || deleteRecetaMutation.isPending}
                            onClick={() => {
                                if (!selectedEntry) return
                                if (!window.confirm('Se eliminara esta receta. Desea continuar?')) return
                                deleteRecetaMutation.mutate(selectedEntry.id)
                            }}
                        >
                            <Trash2 size={16} /> Eliminar
                        </button>
                    )}
                    </div>
                </div>

                {actionError ? (
                    <div className="alert alert-error" style={{ marginBottom: 18 }}>
                        {actionError}
                    </div>
                ) : null}

                {historialQuery.isLoading ? (
                    <div className="flex-center" style={{ padding: 60 }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>
                ) : historialQuery.isError ? (
                    <div className="alert alert-error">{formatError(historialQuery.error, 'No se pudo cargar el historial clinico general.')}</div>
                ) : (
                    <>
                        <div className="grid-2" style={{ alignItems: 'start' }}>
                            <div className="card" style={{ overflow: 'hidden', minWidth: 0 }}>
                                <div
                                    className="table-container"
                                    style={{
                                        width: '100%',
                                        maxWidth: '100%',
                                        overflowX: 'auto',
                                        maxHeight: 'calc(100vh - 250px)',
                                        minHeight: 560,
                                        overflowY: 'auto'
                                    }}
                                >
                                    <table style={{ minWidth: 980, tableLayout: 'fixed' }}>
                                        <thead>
                                            <tr>
                                                <th style={{ width: 150 }}>Fecha</th>
                                                <th style={{ width: 150 }}>Tipo</th>
                                                <th style={{ width: 220 }}>Paciente</th>
                                                <th style={{ width: 180 }}>Doctor</th>
                                                <th style={{ width: 180 }}>Lugar</th>
                                                <th style={{ width: 280 }}>Diagnostico / resumen</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {items.length ? items.map(item => (
                                                <tr
                                                    key={`${item.tipo}-${item.id}`}
                                                    onClick={() => setSelectedEntry(item)}
                                                    style={{ cursor: 'pointer', background: selectedEntry?.id === item.id && selectedEntry?.tipo === item.tipo ? CLINICA_PALETTE.accentSoft : 'transparent' }}
                                                >
                                                    <td>{fmtDateTime(item.fecha)}</td>
                                                    <td>
                                                        <span className={`badge ${item.tipo === 'OFTALMOLOGIA' ? 'badge-blue' : item.tipo === 'CONTACTOLOGIA' ? 'badge-success' : 'badge-warning'}`}>
                                                            {item.tipo === 'RECETA_MEDICAMENTOS' ? 'RECETA' : item.tipo}
                                                        </span>
                                                    </td>
                                                    <td style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
                                                        <div style={{ fontWeight: 700 }}>{item.paciente_nombre}</div>
                                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>{item.paciente_ci || '-'}</div>
                                                    </td>
                                                    <td style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{item.doctor_nombre || '-'}</td>
                                                    <td style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{item.lugar_nombre || '-'}</td>
                                                    <td style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{item.diagnostico || item.resumen || item.motivo || item.observaciones || '-'}</td>
                                                </tr>
                                            )) : <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No hay registros para los filtros seleccionados.</td></tr>}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="card" style={{ minWidth: 0 }}>
                                {!selectedEntry ? (
                                    <div style={{ color: 'var(--text-muted)' }}>Seleccione un registro para ver su detalle.</div>
                                ) : detalleQuery.isLoading ? (
                                    <div style={{ color: 'var(--text-muted)' }}>Cargando detalle...</div>
                                ) : detalleQuery.isError ? (
                                    <div className="alert alert-error">{formatError(detalleQuery.error, 'No se pudo cargar el detalle del registro clinico.')}</div>
                                ) : selectedEntry.tipo === 'RECETA_MEDICAMENTOS' ? (
                                    <div style={{ display: 'grid', gap: 12 }}>
                                        <div><strong>Paciente:</strong> {selectedEntry.paciente_nombre}</div>
                                        <div><strong>Fecha:</strong> {fmtDateTime(detalleQuery.data?.fecha_emision || selectedEntry.fecha)}</div>
                                        <div><strong>Doctor:</strong> {detalleQuery.data?.doctor_nombre || selectedEntry.doctor_nombre || '-'}</div>
                                        <div><strong>Diagnostico:</strong> {detalleQuery.data?.diagnostico || selectedEntry.diagnostico || '-'}</div>
                                        <div><strong>Observaciones:</strong> {detalleQuery.data?.observaciones || selectedEntry.observaciones || '-'}</div>
                                        <div>
                                            <strong>Medicamentos</strong>
                                            <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                                                {detalleQuery.data?.detalles?.length ? detalleQuery.data.detalles.map((detalle, index) => (
                                                    <div key={`${detalle?.medicamento || 'med'}-${index}`} className="card" style={{ padding: 12, background: 'rgba(255,255,255,0.02)' }}>
                                                        <div style={{ fontWeight: 700 }}>{detalle?.medicamento || '-'}</div>
                                                        <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>Posologia: {detalle?.posologia_personalizada || '-'}</div>
                                                        <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>Duracion: {detalle?.duracion_tratamiento || '-'}</div>
                                                    </div>
                                                )) : <div style={{ color: 'var(--text-muted)' }}>Sin medicamentos cargados.</div>}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    (() => {
                                        const detalle = detalleQuery.data || {}
                                        return (
                                            <div style={{ display: 'grid', gap: 12 }}>
                                                <div><strong>Paciente:</strong> {selectedEntry.paciente_nombre}</div>
                                                <div><strong>Fecha:</strong> {fmtDateTime(detalle.fecha || selectedEntry.fecha)}</div>
                                                <div><strong>Doctor:</strong> {detalle.doctor_nombre || selectedEntry.doctor_nombre || '-'}</div>
                                                <div><strong>Lugar:</strong> {detalle.lugar_nombre || selectedEntry.lugar_nombre || '-'}</div>
                                                {selectedEntry.tipo === 'OFTALMOLOGIA' && <div><strong>Motivo:</strong> {detalle.motivo || selectedEntry.motivo || '-'}</div>}
                                                <div><strong>Diagnostico:</strong> {detalle.diagnostico || selectedEntry.diagnostico || '-'}</div>
                                                <div><strong>Plan:</strong> {detalle.plan_tratamiento || selectedEntry.resumen || '-'}</div>
                                                {selectedEntry.tipo === 'OFTALMOLOGIA' ? (
                                                    <>
                                                        <div><strong>Tipo lente:</strong> {detalle.tipo_lente || '-'}</div>
                                                        <div><strong>Material lente:</strong> {detalle.material_lente || '-'}</div>
                                                        <div><strong>Tratamientos:</strong> {detalle.tratamientos || '-'}</div>
                                                        <div className="card" style={{ padding: 12, background: 'rgba(255,255,255,0.02)' }}>
                                                            <div style={{ fontWeight: 700, marginBottom: 10 }}>Correccion refractiva</div>
                                                            <div style={{ display: 'grid', gridTemplateColumns: '72px repeat(6, minmax(72px, 1fr))', gap: 8, fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: 8 }}>
                                                                <div />
                                                                <div>AV SC</div>
                                                                <div>AV CC</div>
                                                                <div>Esfera</div>
                                                                <div>Cilindro</div>
                                                                <div>Eje</div>
                                                                <div>Adicion</div>
                                                            </div>
                                                            <div style={{ display: 'grid', gap: 10 }}>
                                                                <div style={{ display: 'grid', gridTemplateColumns: '72px repeat(6, minmax(72px, 1fr))', gap: 8 }}>
                                                                    <div style={{ fontWeight: 800 }}>OD</div>
                                                                    <div>{detalle.av_sc_lejos_od || '-'}</div>
                                                                    <div>{detalle.av_cc_lejos_od || '-'}</div>
                                                                    <div>{detalle.ref_od_esfera || '-'}</div>
                                                                    <div>{detalle.ref_od_cilindro || '-'}</div>
                                                                    <div>{detalle.ref_od_eje || '-'}</div>
                                                                    <div>{detalle.ref_od_adicion || '-'}</div>
                                                                </div>
                                                                <div style={{ display: 'grid', gridTemplateColumns: '72px repeat(6, minmax(72px, 1fr))', gap: 8 }}>
                                                                    <div style={{ fontWeight: 800 }}>OI</div>
                                                                    <div>{detalle.av_sc_lejos_oi || '-'}</div>
                                                                    <div>{detalle.av_cc_lejos_oi || '-'}</div>
                                                                    <div>{detalle.ref_oi_esfera || '-'}</div>
                                                                    <div>{detalle.ref_oi_cilindro || '-'}</div>
                                                                    <div>{detalle.ref_oi_eje || '-'}</div>
                                                                    <div>{detalle.ref_oi_adicion || '-'}</div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <div><strong>Diseno:</strong> {detalle.diseno || '-'}</div>
                                                        <div><strong>Marca recomendada:</strong> {detalle.marca_recomendada || '-'}</div>
                                                        <div><strong>Fecha control:</strong> {fmtDate(detalle.fecha_control)}</div>
                                                        <div><strong>Resumen resultados:</strong> {detalle.resumen_resultados || selectedEntry.resumen || '-'}</div>
                                                    </>
                                                )}
                                                <div><strong>Observaciones:</strong> {detalle.observaciones || '-'}</div>
                                            </div>
                                        )
                                    })()
                                )}
                            </div>
                        </div>

                        <div className="flex-between" style={{ marginTop: 16, gap: 16, flexWrap: 'wrap' }}>
                            <div style={{ color: 'var(--text-muted)' }}>
                                Mostrando pagina {historialQuery.data.page} de {historialQuery.data.total_pages} - {historialQuery.data.total} registros
                            </div>
                            <div className="flex gap-12">
                                <button className="btn btn-secondary" onClick={() => setPage(prev => Math.max(1, prev - 1))} disabled={page <= 1}>Anterior</button>
                                <button className="btn btn-secondary" onClick={() => setPage(prev => Math.min(historialQuery.data.total_pages, prev + 1))} disabled={page >= historialQuery.data.total_pages}>Siguiente</button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {consultaModal && (
                <Modal
                    title={consultaModal.mode === 'edit' ? 'Editar consulta' : 'Consulta clinica'}
                    onClose={() => setConsultaModal(null)}
                    maxWidth="920px"
                    closeDisabled={consultaSavePhase !== 'idle'}
                    onCloseAttempt={() => window.alert('La consulta aun se esta procesando. Espera a que termine antes de cerrar.')}
                >
                    <ConsultaClinicaForm
                        type={consultaModal.type}
                        initialData={consultaModal.initialData}
                        pacienteId={consultaModal.patientId}
                        doctores={doctoresQuery.data || []}
                        lugares={lugaresQuery.data || []}
                        onSave={payload => saveConsultaMutation.mutate(payload.consulta)}
                        onCancel={() => setConsultaModal(null)}
                        saving={saveConsultaMutation.isPending || consultaSavePhase === 'refreshing'}
                        savingText={consultaSavePhase === 'refreshing' ? 'Actualizando vista...' : 'Guardando...'}
                        readOnly={consultaModal.mode === 'view'}
                    />
                </Modal>
            )}

            {recetaModal && (
                <Modal title={recetaModal.mode === 'edit' ? 'Editar receta de medicamentos' : 'Receta de medicamentos'} onClose={() => setRecetaModal(null)} maxWidth="980px">
                    <RecetaMedicamentoForm
                        initialData={recetaModal.initialData}
                        pacienteId={recetaModal.patientId}
                        consultaId={recetaModal.consultaId}
                        consultaTipo={recetaModal.consultaTipo}
                        doctorOptions={doctoresQuery.data || []}
                        onSearchMedicamento={setMedicamentoSearch}
                        medicamentoOptions={medicamentosQuery.data || []}
                        medicamentoLoading={medicamentosQuery.isFetching}
                        onCreateMedicamento={() => setModalMedicamento({ mode: 'create', data: null })}
                        onSave={payload => saveRecetaMutation.mutate(payload)}
                        onCancel={() => {
                            setRecentCreatedMedicamento(null)
                            setRecetaModal(null)
                        }}
                        saving={saveRecetaMutation.isPending}
                        readOnly={recetaModal.mode === 'view'}
                        recentMedicamento={recentCreatedMedicamento}
                    />
                </Modal>
            )}

            {modalMedicamento && (
                <Modal
                    title="Nuevo medicamento"
                    onClose={() => setModalMedicamento(null)}
                    maxWidth="760px"
                >
                    <VademecumMedicamentoForm
                        initialData={modalMedicamento.data}
                        onSave={payload => saveMedicamentoMutation.mutate(payload)}
                        onCancel={() => setModalMedicamento(null)}
                        saving={saveMedicamentoMutation.isPending}
                    />
                </Modal>
            )}
        </>
    )
}

function VademecumMedicamentoForm({ initialData, onSave, onCancel, saving }) {
    const [form, setForm] = useState(() => ({
        nombre_comercial: initialData?.nombre_comercial || '',
        droga: initialData?.droga || '',
        presentacion: initialData?.presentacion || '',
        laboratorio: initialData?.laboratorio || '',
        indicaciones: initialData?.indicaciones || '',
        contraindicaciones: initialData?.contraindicaciones || '',
        posologia_habitual: initialData?.posologia_habitual || '',
        notas: initialData?.notas || '',
    }))

    useEffect(() => {
        setForm({
            nombre_comercial: initialData?.nombre_comercial || '',
            droga: initialData?.droga || '',
            presentacion: initialData?.presentacion || '',
            laboratorio: initialData?.laboratorio || '',
            indicaciones: initialData?.indicaciones || '',
            contraindicaciones: initialData?.contraindicaciones || '',
            posologia_habitual: initialData?.posologia_habitual || '',
            notas: initialData?.notas || '',
        })
    }, [initialData])

    return (
        <form onSubmit={event => { event.preventDefault(); onSave(form) }}>
            <div className="grid-2">
                <div className="form-group">
                    <label className="form-label">Nombre comercial *</label>
                    <input className="form-input" value={form.nombre_comercial} onChange={event => setForm(prev => ({ ...prev, nombre_comercial: event.target.value }))} required />
                </div>
                <div className="form-group">
                    <label className="form-label">Droga</label>
                    <input className="form-input" value={form.droga} onChange={event => setForm(prev => ({ ...prev, droga: event.target.value }))} />
                </div>
                <div className="form-group">
                    <label className="form-label">Presentacion</label>
                    <input className="form-input" value={form.presentacion} onChange={event => setForm(prev => ({ ...prev, presentacion: event.target.value }))} />
                </div>
                <div className="form-group">
                    <label className="form-label">Laboratorio</label>
                    <input className="form-input" value={form.laboratorio} onChange={event => setForm(prev => ({ ...prev, laboratorio: event.target.value }))} />
                </div>
            </div>
            <div className="form-group">
                <label className="form-label">Indicaciones</label>
                <textarea className="form-input" rows={3} style={{ resize: 'none' }} value={form.indicaciones} onChange={event => setForm(prev => ({ ...prev, indicaciones: event.target.value }))} />
            </div>
            <div className="form-group">
                <label className="form-label">Contraindicaciones</label>
                <textarea className="form-input" rows={3} style={{ resize: 'none' }} value={form.contraindicaciones} onChange={event => setForm(prev => ({ ...prev, contraindicaciones: event.target.value }))} />
            </div>
            <div className="form-group">
                <label className="form-label">Posologia habitual</label>
                <textarea className="form-input" rows={3} style={{ resize: 'none' }} value={form.posologia_habitual} onChange={event => setForm(prev => ({ ...prev, posologia_habitual: event.target.value }))} />
            </div>
            <div className="form-group">
                <label className="form-label">Notas</label>
                <textarea className="form-input" rows={3} style={{ resize: 'none' }} value={form.notas} onChange={event => setForm(prev => ({ ...prev, notas: event.target.value }))} />
            </div>
            <div className="flex gap-12" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
                <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar medicamento'}</button>
            </div>
        </form>
    )
}

function VademecumPatologiaForm({ initialData, onSave, onCancel, saving }) {
    const [medicamentoSearch, setMedicamentoSearch] = useState('')
    const buildFormState = useMemo(() => initial => ({
        nombre: initial?.nombre || '',
        descripcion: initial?.descripcion || '',
        sintomas: initial?.sintomas || '',
        tratamiento_no_farmacologico: initial?.tratamiento_no_farmacologico || '',
        tratamientos: Array.isArray(initial?.tratamientos) && initial.tratamientos.length
            ? initial.tratamientos.map((item, index) => ({
                key: `${item.id || index}-${item.medicamento_id}`,
                medicamento: item.medicamento_id ? { id: item.medicamento_id, nombre_comercial: item.medicamento_nombre } : null,
                posologia_recomendada: item.posologia_recomendada || '',
            }))
            : [],
    }), [initialData])
    const [form, setForm] = useState(() => buildFormState(initialData))

    useEffect(() => {
        setForm(buildFormState(initialData))
    }, [buildFormState, initialData])

    const medicamentosQuery = useQuery({
        queryKey: ['clinica', 'vademecum-form-medicamentos', medicamentoSearch],
        queryFn: async () => (await api.get(`/clinica/vademecum/medicamentos/simple?${queryString({ buscar: medicamentoSearch, page_size: 12 })}`)).data,
        enabled: medicamentoSearch.trim().length >= 1,
        staleTime: 60 * 1000,
    })

    const addTratamiento = () => {
        setForm(prev => ({
            ...prev,
            tratamientos: [...prev.tratamientos, { key: crypto.randomUUID(), medicamento: null, posologia_recomendada: '' }],
        }))
    }

    const updateTratamiento = (key, patch) => {
        setForm(prev => ({
            ...prev,
            tratamientos: prev.tratamientos.map(item => item.key === key ? { ...item, ...patch } : item),
        }))
    }

    const removeTratamiento = key => {
        setForm(prev => ({
            ...prev,
            tratamientos: prev.tratamientos.filter(item => item.key !== key),
        }))
    }

    const submit = event => {
        event.preventDefault()
        onSave({
            nombre: form.nombre,
            descripcion: form.descripcion,
            sintomas: form.sintomas,
            tratamiento_no_farmacologico: form.tratamiento_no_farmacologico,
            tratamientos: form.tratamientos
                .filter(item => item.medicamento?.id)
                .map(item => ({
                    medicamento_id: item.medicamento.id,
                    posologia_recomendada: item.posologia_recomendada,
                })),
        })
    }

    return (
        <form onSubmit={submit}>
            <div className="form-group">
                <label className="form-label">Nombre de la patologia *</label>
                <input className="form-input" value={form.nombre} onChange={event => setForm(prev => ({ ...prev, nombre: event.target.value }))} required />
            </div>
            <div className="form-group">
                <label className="form-label">Descripcion</label>
                <textarea className="form-input" rows={3} style={{ resize: 'none' }} value={form.descripcion} onChange={event => setForm(prev => ({ ...prev, descripcion: event.target.value }))} />
            </div>
            <div className="form-group">
                <label className="form-label">Sintomas</label>
                <textarea className="form-input" rows={3} style={{ resize: 'none' }} value={form.sintomas} onChange={event => setForm(prev => ({ ...prev, sintomas: event.target.value }))} />
            </div>
            <div className="form-group">
                <label className="form-label">Tratamiento no farmacologico</label>
                <textarea className="form-input" rows={3} style={{ resize: 'none' }} value={form.tratamiento_no_farmacologico} onChange={event => setForm(prev => ({ ...prev, tratamiento_no_farmacologico: event.target.value }))} />
            </div>

            <div className="card" style={{ padding: 16, marginTop: 14 }}>
                <div className="flex-between" style={{ gap: 12, marginBottom: 12 }}>
                    <div>
                        <div style={{ fontWeight: 700 }}>Medicamentos sugeridos</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Puedes asociar medicamentos y posologia recomendada.</div>
                    </div>
                    <button type="button" className="btn btn-secondary" onClick={addTratamiento}><Plus size={16} /> Agregar</button>
                </div>
                <div className="flex-column gap-12">
                    {form.tratamientos.length ? form.tratamientos.map(item => (
                        <div key={item.key} className="grid-2" style={{ gap: 12, alignItems: 'end' }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Medicamento</label>
                                <RemoteSearchSelect
                                    value={item.medicamento}
                                    onChange={option => updateTratamiento(item.key, { medicamento: option })}
                                    onSearch={setMedicamentoSearch}
                                    options={medicamentosQuery.data || []}
                                    loading={medicamentosQuery.isFetching}
                                    placeholder="Buscar medicamento..."
                                    promptMessage="Escriba para buscar medicamento"
                                    emptyMessage="Sin medicamentos"
                                    minChars={0}
                                    floating={false}
                                    getOptionLabel={option => option?.nombre_comercial || ''}
                                    getOptionValue={option => option?.id}
                                />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Posologia recomendada</label>
                                <div className="flex gap-12" style={{ alignItems: 'center' }}>
                                    <input className="form-input" value={item.posologia_recomendada} onChange={event => updateTratamiento(item.key, { posologia_recomendada: event.target.value })} />
                                    <button type="button" className="btn btn-danger" onClick={() => removeTratamiento(item.key)}><Trash2 size={16} /> Quitar</button>
                                </div>
                            </div>
                        </div>
                    )) : <div style={{ color: 'var(--text-muted)' }}>Sin medicamentos sugeridos todavia.</div>}
                </div>
            </div>

            <div className="flex gap-12" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
                <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar patologia'}</button>
            </div>
        </form>
    )
}

function VademecumSection() {
    const { user } = useAuth()
    const queryClient = useQueryClient()
    const [tab, setTab] = useState('medicamentos')
    const [searchInput, setSearchInput] = useState('')
    const [buscar, setBuscar] = useState('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(25)
    const [openActionId, setOpenActionId] = useState(null)
    const [actionMenuPos, setActionMenuPos] = useState({ top: 0, left: 0 })
    const [modalMedicamento, setModalMedicamento] = useState(null)
    const [modalPatologia, setModalPatologia] = useState(null)

    useEffect(() => {
        const timeout = window.setTimeout(() => {
            setBuscar(searchInput.trim())
            setPage(1)
        }, 300)
        return () => window.clearTimeout(timeout)
    }, [searchInput])

    useEffect(() => {
        setPage(1)
    }, [tab, pageSize])

    useEffect(() => {
        if (!openActionId) return undefined
        const close = () => setOpenActionId(null)
        window.addEventListener('click', close)
        window.addEventListener('resize', close)
        return () => {
            window.removeEventListener('click', close)
            window.removeEventListener('resize', close)
        }
    }, [openActionId])

    const canEdit = hasActionAccess(user, 'clinica.consultas_editar', 'clinica')

    const medicamentosQuery = useQuery({
        queryKey: ['clinica', 'vademecum-medicamentos', { buscar, page, pageSize }],
        queryFn: async () => (await api.get(`/clinica/vademecum/medicamentos?${queryString({ buscar, page, page_size: pageSize })}`)).data,
        enabled: tab === 'medicamentos',
    })

    const patologiasQuery = useQuery({
        queryKey: ['clinica', 'vademecum-patologias', { buscar, page, pageSize }],
        queryFn: async () => (await api.get(`/clinica/vademecum/patologias?${queryString({ buscar, page, page_size: pageSize })}`)).data,
        enabled: tab === 'patologias',
    })

    const saveMedicamentoMutation = useMutation({
        mutationFn: async payload => {
            if (modalMedicamento?.mode === 'edit') return (await api.put(`/clinica/vademecum/medicamentos/${modalMedicamento.data.id}`, payload)).data
            return (await api.post('/clinica/vademecum/medicamentos', payload)).data
        },
        onSuccess: async () => {
            setModalMedicamento(null)
            await queryClient.invalidateQueries({ queryKey: ['clinica', 'vademecum-medicamentos'] })
            await queryClient.invalidateQueries({ queryKey: ['clinica', 'medicamentos-simple'] })
        },
    })

    const savePatologiaMutation = useMutation({
        mutationFn: async payload => {
            if (modalPatologia?.mode === 'edit') return (await api.put(`/clinica/vademecum/patologias/${modalPatologia.data.id}`, payload)).data
            return (await api.post('/clinica/vademecum/patologias', payload)).data
        },
        onSuccess: async () => {
            setModalPatologia(null)
            await queryClient.invalidateQueries({ queryKey: ['clinica', 'vademecum-patologias'] })
            await queryClient.invalidateQueries({ queryKey: ['clinica', 'patologias-simple'] })
        },
    })

    const deleteMedicamentoMutation = useMutation({
        mutationFn: async id => { await api.delete(`/clinica/vademecum/medicamentos/${id}`) },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['clinica', 'vademecum-medicamentos'] })
            await queryClient.invalidateQueries({ queryKey: ['clinica', 'medicamentos-simple'] })
        },
    })

    const deletePatologiaMutation = useMutation({
        mutationFn: async id => { await api.delete(`/clinica/vademecum/patologias/${id}`) },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['clinica', 'vademecum-patologias'] })
            await queryClient.invalidateQueries({ queryKey: ['clinica', 'patologias-simple'] })
        },
    })

    const openPatologiaEditor = async id => {
        const response = await api.get(`/clinica/vademecum/patologias/${id}`)
        setModalPatologia({ mode: 'edit', data: response.data })
    }

    const openActionsMenu = (event, id) => {
        event.stopPropagation()
        const rect = event.currentTarget.getBoundingClientRect()
        const menuWidth = 220
        const menuHeight = 120
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight
        const left = Math.min(rect.right - menuWidth, viewportWidth - menuWidth - 12)
        const openUp = rect.bottom + menuHeight > viewportHeight - 12
        const top = openUp ? rect.top - menuHeight - 6 : rect.bottom + 6
        setActionMenuPos({ left: Math.max(12, left), top: Math.max(12, top) })
        setOpenActionId(prev => (prev === id ? null : id))
    }

    const handleAction = action => {
        setOpenActionId(null)
        action()
    }

    const data = tab === 'medicamentos' ? medicamentosQuery.data : patologiasQuery.data
    const items = data?.items || []
    const isLoading = tab === 'medicamentos' ? medicamentosQuery.isLoading : patologiasQuery.isLoading
    const isError = tab === 'medicamentos' ? medicamentosQuery.isError : patologiasQuery.isError
    const error = tab === 'medicamentos' ? medicamentosQuery.error : patologiasQuery.error

    return (
        <>
            <div className="card" style={{ marginTop: 22 }}>
                <SectionHeader
                    title="Vademecum"
                    subtitle="Base clinica de medicamentos y patologias para apoyar recetas, patologias y consultas."
                    actions={canEdit ? (
                        tab === 'medicamentos'
                            ? <button className="btn btn-primary" onClick={() => setModalMedicamento({ mode: 'create', data: null })}><Plus size={16} /> Nuevo medicamento</button>
                            : <button className="btn btn-primary" onClick={() => setModalPatologia({ mode: 'create', data: null })}><Plus size={16} /> Nueva patologia</button>
                    ) : null}
                />

                <div className="flex gap-12" style={{ flexWrap: 'wrap', marginBottom: 18 }}>
                    <button type="button" className={tab === 'medicamentos' ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setTab('medicamentos')}>Medicamentos</button>
                    <button type="button" className={tab === 'patologias' ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setTab('patologias')}>Patologias</button>
                </div>

                <div className="filters-bar" style={{ marginBottom: 18 }}>
                    <div style={{ position: 'relative', flex: 1, minWidth: 280 }}>
                        <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                        <input
                            className="form-input"
                            style={{ paddingLeft: 42 }}
                            value={searchInput}
                            onChange={event => setSearchInput(event.target.value)}
                            placeholder={tab === 'medicamentos' ? 'Buscar por nombre, droga, presentacion o laboratorio...' : 'Buscar por nombre, sintomas o descripcion...'}
                        />
                    </div>
                    <select className="form-select" style={{ width: 130 }} value={pageSize} onChange={event => setPageSize(Number(event.target.value))}>
                        <option value={10}>10 / pag.</option>
                        <option value={25}>25 / pag.</option>
                        <option value={50}>50 / pag.</option>
                    </select>
                </div>

                {isLoading ? (
                    <div className="flex-center" style={{ padding: 60 }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>
                ) : isError ? (
                    <div className="alert alert-error">{formatError(error, 'No se pudo cargar el vademecum.')}</div>
                ) : (
                    <>
                        <div className="table-container" style={{ width: '100%', maxWidth: '100%', overflowX: 'auto' }}>
                            {tab === 'medicamentos' ? (
                                <table style={{ minWidth: 1100, tableLayout: 'fixed' }}>
                                    <thead>
                                        <tr>
                                            <th style={{ width: 220 }}>Medicamento</th>
                                            <th style={{ width: 180 }}>Droga</th>
                                            <th style={{ width: 150 }}>Presentacion</th>
                                            <th style={{ width: 150 }}>Laboratorio</th>
                                            <th style={{ width: 120 }}>Tratamientos</th>
                                            <th style={{ width: 110 }}>Recetas</th>
                                            <th style={{ width: 120, textAlign: 'right' }}>Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.length ? items.map(item => (
                                            <tr key={`med-${item.id}`}>
                                                <td style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{item.nombre_comercial}</td>
                                                <td style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{item.droga || '-'}</td>
                                                <td>{item.presentacion || '-'}</td>
                                                <td style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{item.laboratorio || '-'}</td>
                                                <td>{item.tratamientos_count}</td>
                                                <td>{item.recetas_count}</td>
                                                <td style={{ textAlign: 'right', position: 'relative' }}>
                                                    {canEdit && (
                                                        <button type="button" className="btn btn-secondary" onClick={event => openActionsMenu(event, `med-${item.id}`)}>Acciones v</button>
                                                    )}
                                                    {openActionId === `med-${item.id}` && (
                                                        <div style={{ position: 'fixed', top: actionMenuPos.top, left: actionMenuPos.left, width: 220, background: '#1b2130', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, boxShadow: '0 20px 40px rgba(0,0,0,0.35)', padding: 8, zIndex: 3000, display: 'grid', gap: 6 }}>
                                                            <button type="button" className="dropdown-item" style={{ background: '#242b3a', color: 'var(--text-primary)', borderRadius: 10 }} onClick={() => handleAction(() => setModalMedicamento({ mode: 'edit', data: item }))}><Pencil size={14} style={{ marginRight: 8 }} /> Editar medicamento</button>
                                                            <button type="button" className="dropdown-item" style={{ background: '#2a2226', color: 'var(--danger)', borderRadius: 10 }} onClick={() => handleAction(() => {
                                                                if (!window.confirm(`Se eliminara el medicamento ${item.nombre_comercial}. Desea continuar?`)) return
                                                                deleteMedicamentoMutation.mutate(item.id)
                                                            })}><Trash2 size={14} style={{ marginRight: 8 }} /> Eliminar medicamento</button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        )) : <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No hay medicamentos para mostrar.</td></tr>}
                                    </tbody>
                                </table>
                            ) : (
                                <table style={{ minWidth: 1120, tableLayout: 'fixed' }}>
                                    <thead>
                                        <tr>
                                            <th style={{ width: 220 }}>Patologia</th>
                                            <th style={{ width: 260 }}>Sintomas</th>
                                            <th style={{ width: 220 }}>Tratamiento no farmacologico</th>
                                            <th style={{ width: 280 }}>Medicamentos sugeridos</th>
                                            <th style={{ width: 120, textAlign: 'right' }}>Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.length ? items.map(item => (
                                            <tr key={`pat-${item.id}`}>
                                                <td style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{item.nombre}</td>
                                                <td style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{item.sintomas || '-'}</td>
                                                <td style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{item.tratamiento_no_farmacologico || '-'}</td>
                                                <td style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
                                                    {item.tratamientos?.length ? item.tratamientos.map(tratamiento => tratamiento.medicamento_nombre).join(', ') : '-'}
                                                </td>
                                                <td style={{ textAlign: 'right', position: 'relative' }}>
                                                    {canEdit && (
                                                        <button type="button" className="btn btn-secondary" onClick={event => openActionsMenu(event, `pat-${item.id}`)}>Acciones v</button>
                                                    )}
                                                    {openActionId === `pat-${item.id}` && (
                                                        <div style={{ position: 'fixed', top: actionMenuPos.top, left: actionMenuPos.left, width: 220, background: '#1b2130', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, boxShadow: '0 20px 40px rgba(0,0,0,0.35)', padding: 8, zIndex: 3000, display: 'grid', gap: 6 }}>
                                                            <button type="button" className="dropdown-item" style={{ background: '#242b3a', color: 'var(--text-primary)', borderRadius: 10 }} onClick={() => handleAction(() => { openPatologiaEditor(item.id).catch(error => window.alert(formatError(error, 'No se pudo cargar la patologia completa.'))) })}><Pencil size={14} style={{ marginRight: 8 }} /> Editar patologia</button>
                                                            <button type="button" className="dropdown-item" style={{ background: '#2a2226', color: 'var(--danger)', borderRadius: 10 }} onClick={() => handleAction(() => {
                                                                if (!window.confirm(`Se eliminara la patologia ${item.nombre}. Desea continuar?`)) return
                                                                deletePatologiaMutation.mutate(item.id)
                                                            })}><Trash2 size={14} style={{ marginRight: 8 }} /> Eliminar patologia</button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        )) : <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No hay patologias para mostrar.</td></tr>}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        <div className="flex-between" style={{ marginTop: 16, gap: 16, flexWrap: 'wrap' }}>
                            <div style={{ color: 'var(--text-muted)' }}>Mostrando pagina {data?.page || 1} de {data?.total_pages || 1} - {data?.total || 0} registros</div>
                            <div className="flex gap-12">
                                <button className="btn btn-secondary" onClick={() => setPage(prev => Math.max(1, prev - 1))} disabled={page <= 1}>Anterior</button>
                                <button className="btn btn-secondary" onClick={() => setPage(prev => Math.min(data?.total_pages || 1, prev + 1))} disabled={page >= (data?.total_pages || 1)}>Siguiente</button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {modalMedicamento && (
                <Modal title={modalMedicamento.mode === 'edit' ? 'Editar medicamento' : 'Nuevo medicamento'} onClose={() => setModalMedicamento(null)} maxWidth="860px">
                    <VademecumMedicamentoForm
                        initialData={modalMedicamento.data}
                        onSave={payload => saveMedicamentoMutation.mutate(payload)}
                        onCancel={() => setModalMedicamento(null)}
                        saving={saveMedicamentoMutation.isPending}
                    />
                </Modal>
            )}

            {modalPatologia && (
                <Modal title={modalPatologia.mode === 'edit' ? 'Editar patologia' : 'Nueva patologia'} onClose={() => setModalPatologia(null)} maxWidth="960px">
                    <VademecumPatologiaForm
                        initialData={modalPatologia.data}
                        onSave={payload => savePatologiaMutation.mutate(payload)}
                        onCancel={() => setModalPatologia(null)}
                        saving={savePatologiaMutation.isPending}
                    />
                </Modal>
            )}
        </>
    )
}

function PlaceholderClinicaSection({ title, message }) {
    return <EmptyCard title={title} message={message} />
}

export default function ClinicaPage() {
    const location = useLocation()
    const navigate = useNavigate()
    const { user } = useAuth()

    const sectionKey = useMemo(() => {
        const found = CLINICA_TABS.find(tab => location.pathname === tab.path)
        return found?.key || 'dashboard'
    }, [location.pathname])

    return (
        <ClinicaShell currentKey={sectionKey} onNavigate={navigate}>
            {sectionKey === 'dashboard' && <DashboardClinicoSection />}
            {sectionKey === 'agenda' && <AgendaClinicaSection />}
            {sectionKey === 'pacientes' && <PacientesSection />}
            {sectionKey === 'doctores' && <DoctoresSection />}
            {sectionKey === 'consulta' && <NuevaConsultaSection />}
            {sectionKey === 'historial' && <HistorialClinicoGeneralSection />}
            {sectionKey === 'lugares' && <LugaresSection />}
            {sectionKey === 'vademecum' && <VademecumSection />}
            {!user && <EmptyCard title="Sin sesion clinica" message="Vuelva a iniciar sesion para continuar en el modulo clinico." />}
        </ClinicaShell>
    )
}
