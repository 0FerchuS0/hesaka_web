import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, MessageCircle, Search, Gift, Phone } from 'lucide-react'
import { api } from '../context/AuthContext'
import Modal from '../components/Modal'

const TEMPLATE_KEY = 'hesaka-cumpleanos-whatsapp-template'
const DEFAULT_TEMPLATE = 'Hola {cliente}, te escribimos de {empresa}. Queremos desearte un muy feliz cumpleaños. Que tengas un excelente dia.'

function todayInputValue() {
    return new Date().toISOString().slice(0, 10)
}

function fmt(fecha) {
    if (!fecha) return '-'
    return new Date(`${String(fecha).slice(0, 10)}T00:00:00`).toLocaleDateString('es-PY')
}

function normalizarTelefonoWhatsapp(value) {
    let digits = String(value || '').replace(/\D/g, '')
    if (!digits) return ''
    if (digits.startsWith('00')) digits = digits.slice(2)
    if (digits.startsWith('59509')) digits = `595${digits.slice(4)}`
    if (digits.startsWith('5950')) digits = `595${digits.slice(4)}`
    if (digits.startsWith('09') && digits.length === 10) return `595${digits.slice(1)}`
    if (digits.startsWith('0') && digits.length >= 7 && digits.length <= 11) return `595${digits.slice(1)}`
    if (digits.startsWith('9') && digits.length >= 8 && digits.length <= 10) return `595${digits}`
    if (digits.startsWith('5959') && digits.length === 12) return digits
    return digits.startsWith('595') && digits.length >= 10 ? digits : ''
}

function getTemplate() {
    if (typeof window === 'undefined') return DEFAULT_TEMPLATE
    return localStorage.getItem(TEMPLATE_KEY) || DEFAULT_TEMPLATE
}

function applyTemplate(template, replacements) {
    return Object.entries(replacements).reduce(
        (result, [placeholder, value]) => result.replaceAll(placeholder, value ?? ''),
        template || '',
    )
}

function buildMessage(cliente, template, empresa) {
    return applyTemplate(template || DEFAULT_TEMPLATE, {
        '{cliente}': cliente?.nombre || '',
        '{empresa}': empresa || 'HESAKA',
    })
}

function buildTemplateFromMessage(message, cliente, empresa) {
    let template = message || ''
    const replacements = [
        [cliente?.nombre || '', '{cliente}'],
        [empresa || '', '{empresa}'],
    ]
    replacements.forEach(([value, placeholder]) => {
        if (!value) return
        template = template.replaceAll(value, placeholder)
    })
    return template
}

function CumpleanosWhatsappModal({ cliente, onClose }) {
    const { data: configPublica } = useQuery({
        queryKey: ['configuracion-general-publica'],
        queryFn: () => api.get('/configuracion-general/publica').then(response => response.data),
        retry: false,
    })
    const empresaNombre = (configPublica?.nombre || '').trim() || 'HESAKA'
    const [telefono, setTelefono] = useState(cliente?.telefono || '')
    const [message, setMessage] = useState(() => buildMessage(cliente, getTemplate(), empresaNombre))
    const telefonoNormalizado = normalizarTelefonoWhatsapp(telefono)
    const whatsappLink = telefonoNormalizado
        ? `https://wa.me/${telefonoNormalizado}?text=${encodeURIComponent(buildMessage(cliente, message, empresaNombre))}`
        : ''

    const guardarPlantilla = () => {
        localStorage.setItem(TEMPLATE_KEY, buildTemplateFromMessage(message, cliente, empresaNombre))
        window.alert('Plantilla de cumpleaños guardada.')
    }

    return (
        <Modal title="Mensaje de cumpleaños" onClose={onClose} maxWidth="720px">
            <div style={{ display: 'grid', gap: 14 }}>
                <div className="card" style={{ padding: 14, background: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ fontWeight: 800 }}>{cliente?.nombre}</div>
                    <div style={{ marginTop: 6, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        Nacimiento: {fmt(cliente?.fecha_nacimiento)} {cliente?.edad ? `- cumple ${cliente.edad}` : ''}
                    </div>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Telefono WhatsApp</label>
                    <input
                        className="form-input"
                        value={telefono}
                        onChange={event => setTelefono(event.target.value)}
                        placeholder="Ej.: 0981 123 456"
                    />
                    <div style={{ marginTop: 8, color: telefonoNormalizado ? 'var(--text-muted)' : '#f87171', fontSize: '0.82rem' }}>
                        {telefonoNormalizado ? `Se abrira como +${telefonoNormalizado}.` : 'Carga un numero valido. Ej.: 0981 123 456 o +595981123456.'}
                    </div>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Mensaje</label>
                    <textarea
                        className="form-input"
                        rows={6}
                        value={message}
                        onChange={event => setMessage(event.target.value)}
                        style={{ resize: 'vertical', minHeight: 150 }}
                    />
                    <div style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: '0.78rem' }}>Variables: {'{cliente}'}, {'{empresa}'}</div>
                </div>
                <div className="flex gap-12" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                    <div className="flex gap-12" style={{ flexWrap: 'wrap' }}>
                        <button type="button" className="btn btn-secondary" onClick={() => setMessage(buildMessage(cliente, DEFAULT_TEMPLATE, empresaNombre))}>
                            Restaurar sugerido
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={guardarPlantilla}>
                            Guardar plantilla
                        </button>
                    </div>
                    <div className="flex gap-12" style={{ flexWrap: 'wrap' }}>
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Cerrar</button>
                        <button
                            type="button"
                            className="btn btn-primary"
                            disabled={!whatsappLink}
                            onClick={() => window.open(whatsappLink, '_blank', 'noopener,noreferrer')}
                        >
                            <MessageCircle size={15} /> Abrir WhatsApp
                        </button>
                    </div>
                </div>
            </div>
        </Modal>
    )
}

export default function CumpleanosClientesPage() {
    const [fecha, setFecha] = useState(todayInputValue())
    const [buscar, setBuscar] = useState('')
    const [whatsappCliente, setWhatsappCliente] = useState(null)
    const fechaConsulta = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : todayInputValue()

    const { data: apiData, isLoading, isError, error } = useQuery({
        queryKey: ['clientes-cumpleanos', fechaConsulta],
        queryFn: () => api.get(`/clientes/cumpleanos?fecha=${fechaConsulta}`).then(response => response.data),
        retry: false,
    })
    const data = Array.isArray(apiData) ? apiData : []
    const dataShapeError = apiData != null && !Array.isArray(apiData)

    const filtrados = useMemo(() => {
        const term = buscar.trim().toLowerCase()
        if (!term) return data
        return data.filter(cliente => (
            String(cliente.nombre || '').toLowerCase().includes(term)
            || String(cliente.telefono || '').toLowerCase().includes(term)
            || String(cliente.ci || '').toLowerCase().includes(term)
        ))
    }, [data, buscar])

    return (
        <div className="page-body" style={{ overflowX: 'hidden' }}>
            <div className="mb-24" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, background: 'rgba(251,191,36,0.16)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Gift size={20} style={{ color: '#fbbf24' }} />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Cumpleaños de clientes</h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{data.length} cumpleaños para {fmt(fechaConsulta)}</p>
                    </div>
                </div>
            </div>

            <div className="card mb-16" style={{ padding: '14px 20px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <div className="form-group" style={{ marginBottom: 0, width: 190 }}>
                    <label className="form-label">Fecha</label>
                    <div style={{ position: 'relative' }}>
                        <CalendarDays size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                        <input className="form-input" type="date" value={fecha} onChange={event => setFecha(event.target.value)} style={{ paddingLeft: 38 }} />
                    </div>
                </div>
                <div className="search-bar" style={{ flex: '1 1 320px', minWidth: 240, marginTop: 24 }}>
                    <Search size={16} />
                    <input placeholder="Buscar cliente, CI o telefono..." value={buscar} onChange={event => setBuscar(event.target.value)} />
                </div>
                <button className="btn btn-secondary" style={{ marginTop: 24 }} onClick={() => setFecha(todayInputValue())}>
                    Hoy
                </button>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {isLoading ? (
                    <div className="flex-center" style={{ padding: 60 }}>
                        <div className="spinner" style={{ width: 32, height: 32 }} />
                    </div>
                ) : isError ? (
                    <div className="alert alert-error">{error?.response?.data?.detail || 'No se pudieron cargar los cumpleaños.'}</div>
                ) : dataShapeError ? (
                    <div className="alert alert-error">
                        La respuesta de cumpleaños no tiene el formato esperado. Verifica backend/deploy del endpoint <code>/api/clientes/cumpleanos</code>.
                    </div>
                ) : filtrados.length === 0 ? (
                    <div className="empty-state" style={{ padding: '70px 20px' }}>
                        <Gift size={42} />
                        <p>No hay clientes de cumpleaños para esta fecha.</p>
                    </div>
                ) : (
                    <div className="table-container" style={{ overflowX: 'auto' }}>
                        <table style={{ minWidth: 860 }}>
                            <thead>
                                <tr>
                                    <th>Cliente</th>
                                    <th>Telefono</th>
                                    <th>CI / RUC</th>
                                    <th>Edad</th>
                                    <th>Referidor</th>
                                    <th style={{ width: 160 }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtrados.map(cliente => (
                                    <tr key={cliente.id}>
                                        <td style={{ fontWeight: 700 }}>{cliente.nombre}</td>
                                        <td>
                                            {cliente.telefono ? (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                                                    <Phone size={13} /> {cliente.telefono}
                                                </span>
                                            ) : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                                        </td>
                                        <td>{cliente.ci || '-'}</td>
                                        <td>{cliente.edad ? `${cliente.edad} años` : '-'}</td>
                                        <td>{cliente.referidor_nombre || '-'}</td>
                                        <td>
                                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setWhatsappCliente(cliente)}>
                                                <MessageCircle size={14} /> WhatsApp
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {whatsappCliente ? (
                <CumpleanosWhatsappModal cliente={whatsappCliente} onClose={() => setWhatsappCliente(null)} />
            ) : null}
        </div>
    )
}
