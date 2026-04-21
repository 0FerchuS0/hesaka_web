import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, ImagePlus, Save } from 'lucide-react'

import { api, useAuth } from '../context/AuthContext'

function sanitizeError(error, fallback) {
    return error?.response?.data?.detail || fallback
}

function formatOffsetGmt(offsetRaw = 'GMT+00:00') {
    const cleaned = String(offsetRaw).toUpperCase().replace('UTC', 'GMT').replace(/\s+/g, '')
    const match = cleaned.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/)
    if (!match) return 'GMT+00:00'
    const [, sign, hhRaw, mmRaw] = match
    const hh = String(Number(hhRaw || '0')).padStart(2, '0')
    const mm = String(Number(mmRaw || '0')).padStart(2, '0')
    return `GMT${sign}${hh}:${mm}`
}

function offsetToMinutes(offsetLabel = 'GMT+00:00') {
    const match = String(offsetLabel).match(/^GMT([+-])(\d{2}):(\d{2})$/)
    if (!match) return 0
    const sign = match[1] === '-' ? -1 : 1
    return sign * (Number(match[2]) * 60 + Number(match[3]))
}

function nombreZonaEnEspanol(timeZone) {
    try {
        const parts = new Intl.DateTimeFormat('es-ES', {
            timeZone,
            timeZoneName: 'long',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).formatToParts(new Date())
        const name = parts.find(part => part.type === 'timeZoneName')?.value
        return name || timeZone
    } catch {
        return timeZone
    }
}

export default function ConfiguracionGeneralPage() {
    const queryClient = useQueryClient()
    const { user } = useAuth()
    const logoInputRef = useRef(null)
    const [logoRequestVersion, setLogoRequestVersion] = useState(() => Date.now())
    const [form, setForm] = useState({
        nombre: '',
        ruc: '',
        direccion: '',
        telefono: '',
        email: '',
        logo_path: '',
        business_timezone: 'America/Asuncion',
    })
    const [nowTick, setNowTick] = useState(() => Date.now())

    const role = String(user?.rol || '').toUpperCase()
    const canEdit = role === 'ADMIN'

    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['configuracion-general'],
        queryFn: () => api.get('/configuracion-general/').then(response => response.data),
        retry: false,
    })
    const { data: timezoneList = [] } = useQuery({
        queryKey: ['configuracion-general-timezones'],
        queryFn: () => api.get('/configuracion-general/timezones').then(response => response.data || []),
        retry: false,
    })
    const timezoneOptions = useMemo(() => {
        const fromBrowser = typeof Intl?.supportedValuesOf === 'function'
            ? Intl.supportedValuesOf('timeZone')
            : []
        const fromBackend = Array.isArray(timezoneList)
            ? timezoneList
                .map(item => (typeof item === 'string' ? item : item?.id))
                .filter(Boolean)
            : []
        const all = Array.from(new Set([...fromBrowser, ...fromBackend, 'America/Asuncion']))

        const options = all.map(tz => {
            let gmt = 'GMT+00:00'
            try {
                const parts = new Intl.DateTimeFormat('en', {
                    timeZone: tz,
                    timeZoneName: 'longOffset',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                }).formatToParts(new Date())
                gmt = formatOffsetGmt(parts.find(part => part.type === 'timeZoneName')?.value || 'GMT+00:00')
            } catch {
                gmt = 'GMT+00:00'
            }
            const ciudad = String(tz).split('/').pop()?.replace(/_/g, ' ') || tz
            const nombreEs = nombreZonaEnEspanol(tz)
            return {
                id: tz,
                gmt,
                offsetMinutes: offsetToMinutes(gmt),
                label: `(${gmt}) ${nombreEs} - ${ciudad}`,
            }
        })

        options.sort((a, b) => (a.offsetMinutes - b.offsetMinutes) || a.id.localeCompare(b.id))
        return options
    }, [timezoneList])
    const horaNegocioPreview = useMemo(() => {
        try {
            return new Intl.DateTimeFormat('es-PY', {
                timeZone: form.business_timezone || 'America/Asuncion',
                weekday: 'long',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
            }).format(nowTick)
        } catch {
            return 'Zona horaria invalida'
        }
    }, [form.business_timezone, nowTick])

    useEffect(() => {
        if (!data) return
        setForm({
            nombre: data.nombre || '',
            ruc: data.ruc || '',
            direccion: data.direccion || '',
            telefono: data.telefono || '',
            email: data.email || '',
            logo_path: data.logo_path || '',
            business_timezone: data.business_timezone || 'America/Asuncion',
        })
    }, [data])
    useEffect(() => {
        const timer = window.setInterval(() => setNowTick(Date.now()), 1000)
        return () => window.clearInterval(timer)
    }, [])

    const backendBaseUrl = useMemo(() => {
        const base = api.defaults.baseURL || ''
        if (typeof base === 'string' && /^https?:\/\//i.test(base)) {
            return base.replace(/\/api\/?$/, '')
        }
        return window.location.origin
    }, [])

    const logoPreviewUrl = useMemo(() => {
        if (!form.logo_path) return ''
        const apiBase = api.defaults.baseURL || ''
        const baseUrl = /^https?:\/\//i.test(form.logo_path)
            ? form.logo_path
            : (typeof apiBase === 'string' && /^https?:\/\//i.test(apiBase) ? `${backendBaseUrl}${form.logo_path}` : form.logo_path)
        const separator = baseUrl.includes('?') ? '&' : '?'
        return `${baseUrl}${separator}v=${logoRequestVersion}`
    }, [backendBaseUrl, form.logo_path, logoRequestVersion])

    const guardar = useMutation({
        mutationFn: payload => api.put('/configuracion-general/', payload).then(response => response.data),
        onSuccess: async response => {
            queryClient.setQueryData(['configuracion-general'], response)
            await queryClient.invalidateQueries({ queryKey: ['configuracion-general'] })
            await queryClient.invalidateQueries({ queryKey: ['configuracion-general-estado'] })
        },
    })

    const subirLogo = useMutation({
        mutationFn: async file => {
            const formData = new FormData()
            formData.append('logo', file)
            const response = await api.post('/configuracion-general/logo', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            })
            return response.data
        },
        onSuccess: async response => {
            queryClient.setQueryData(['configuracion-general'], response)
            await queryClient.invalidateQueries({ queryKey: ['configuracion-general'] })
            await queryClient.invalidateQueries({ queryKey: ['configuracion-general-publica'] })
            setLogoRequestVersion(Date.now())
            setForm(prev => ({ ...prev, logo_path: response.logo_path || '' }))
        },
    })

    const setField = (key, value) => setForm(prev => ({ ...prev, [key]: value }))
    const nombrePreview = form.nombre.trim() || 'Canal principal pendiente'

    const handleSubmit = event => {
        event.preventDefault()
        if (!canEdit || guardar.isPending) return
        guardar.mutate({
            nombre: form.nombre.trim(),
            ruc: form.ruc.trim() || null,
            direccion: form.direccion.trim() || null,
            telefono: form.telefono.trim() || null,
            email: form.email.trim() || null,
            logo_path: form.logo_path.trim() || null,
            business_timezone: form.business_timezone.trim() || 'America/Asuncion',
        })
    }

    const handleLogoSelected = event => {
        const file = event.target.files?.[0]
        if (!file || subirLogo.isPending || !canEdit) return
        subirLogo.mutate(file)
        event.target.value = ''
    }

    return (
        <div className="page-body" style={{ overflowX: 'hidden' }}>
            <div className="mb-24" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 44, height: 44, background: 'rgba(59,130,246,0.14)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Building2 size={22} style={{ color: 'var(--primary-light)' }} />
                </div>
                <div>
                    <h2 style={{ fontSize: '1.35rem', fontWeight: 700 }}>Configuracion General</h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                        El nombre de la optica es el primer dato obligatorio y define el canal principal por defecto del sistema.
                    </p>
                </div>
            </div>

            {!canEdit && (
                <div className="card mb-16" style={{ border: '1px solid rgba(251,191,36,0.28)', background: 'rgba(251,191,36,0.08)' }}>
                    <div style={{ color: '#fde68a', fontSize: '0.9rem', lineHeight: 1.5 }}>
                        Solo un administrador puede completar o editar esta configuracion.
                    </div>
                </div>
            )}

            {isError && (
                <div className="card mb-16" style={{ border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.08)' }}>
                    <div style={{ color: '#fca5a5', fontSize: '0.9rem' }}>
                        {sanitizeError(error, 'No se pudo cargar la configuracion general.')}
                    </div>
                </div>
            )}

            <div className="grid-2" style={{ alignItems: 'start' }}>
                <div className="card">
                    <div style={{ marginBottom: 18 }}>
                        <h3 style={{ fontSize: '1.05rem', marginBottom: 6 }}>Datos institucionales</h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                            Estos datos se usan como base del sistema y de los documentos institucionales.
                        </p>
                    </div>

                    {isLoading ? (
                        <div className="flex-center" style={{ minHeight: 220 }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>
                    ) : (
                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label className="form-label">Nombre de la optica / empresa *</label>
                                <input className="form-input" value={form.nombre} onChange={event => setField('nombre', event.target.value)} required disabled={!canEdit || guardar.isPending} placeholder="Ej: Centro Optico Santa Fe" />
                            </div>
                            <div className="grid-2">
                                <div className="form-group">
                                    <label className="form-label">RUC</label>
                                    <input className="form-input" value={form.ruc} onChange={event => setField('ruc', event.target.value)} disabled={!canEdit || guardar.isPending} placeholder="Ej: 80012345-6" />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Telefono</label>
                                    <input className="form-input" value={form.telefono} onChange={event => setField('telefono', event.target.value)} disabled={!canEdit || guardar.isPending} placeholder="Ej: 0981 123 456" />
                                </div>
                            </div>
                            <div className="grid-2">
                                <div className="form-group">
                                    <label className="form-label">Email</label>
                                    <input className="form-input" type="email" value={form.email} onChange={event => setField('email', event.target.value)} disabled={!canEdit || guardar.isPending} placeholder="Ej: info@optica.com" />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Logo institucional</label>
                                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                                        <input ref={logoInputRef} type="file" accept=".png,.jpg,.jpeg,.webp,.svg" onChange={handleLogoSelected} style={{ display: 'none' }} />
                                        <button type="button" className="btn btn-secondary" onClick={() => logoInputRef.current?.click()} disabled={!canEdit || subirLogo.isPending}>
                                            <ImagePlus size={16} />
                                            {subirLogo.isPending ? 'Subiendo logo...' : 'Subir logo'}
                                        </button>
                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                            PNG, JPG, WEBP o SVG. Máximo 5 MB.
                                        </span>
                                    </div>
                                    {form.logo_path && (
                                        <div style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: '0.78rem', wordBreak: 'break-all' }}>
                                            Guardado en: {form.logo_path}
                                        </div>
                                    )}
                                    {subirLogo.isError && (
                                        <div style={{ marginTop: 8, color: '#fca5a5', fontSize: '0.8rem' }}>
                                            {sanitizeError(subirLogo.error, 'No se pudo subir el logo.')}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Zona horaria de negocio *</label>
                                <select
                                    className="form-input"
                                    value={form.business_timezone}
                                    onChange={event => setField('business_timezone', event.target.value)}
                                    disabled={!canEdit || guardar.isPending}
                                >
                                    {!timezoneOptions.some(tz => tz.id === form.business_timezone) ? (
                                        <option value={form.business_timezone}>{form.business_timezone}</option>
                                    ) : null}
                                    {timezoneOptions.map(tz => (
                                        <option key={tz.id} value={tz.id}>
                                            {tz.label}
                                        </option>
                                    ))}
                                </select>
                                <div style={{ marginTop: 6, color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                                    Define cuándo cambia el día operativo (cierre de jornada a las 00:00 de esta zona). El listado muestra todas las zonas con su corrección UTC respecto a Greenwich.
                                </div>
                                <div
                                    style={{
                                        marginTop: 8,
                                        border: '1px solid var(--border-color)',
                                        borderRadius: 10,
                                        padding: '8px 10px',
                                        background: 'rgba(255,255,255,0.02)',
                                        fontSize: '0.82rem',
                                    }}
                                >
                                    <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>
                                        Vista previa de hora con la zona seleccionada:
                                    </div>
                                    <div style={{ fontWeight: 700, color: 'var(--primary-light)' }}>
                                        {horaNegocioPreview}
                                    </div>
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Direccion</label>
                                <textarea className="form-input" rows={3} value={form.direccion} onChange={event => setField('direccion', event.target.value)} disabled={!canEdit || guardar.isPending} placeholder="Direccion comercial o fiscal" style={{ resize: 'vertical' }} />
                            </div>

                            {guardar.isError && (
                                <div style={{ marginBottom: 12, background: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 12px', fontSize: '0.84rem' }}>
                                    {sanitizeError(guardar.error, 'No se pudo guardar la configuracion general.')}
                                </div>
                            )}

                            {guardar.isSuccess && (
                                <div style={{ marginBottom: 12, background: 'rgba(34,197,94,0.10)', color: '#86efac', border: '1px solid rgba(34,197,94,0.22)', borderRadius: 10, padding: '10px 12px', fontSize: '0.84rem' }}>
                                    Configuracion general guardada correctamente.
                                </div>
                            )}

                            <div className="flex gap-12" style={{ justifyContent: 'flex-end' }}>
                                <button type="submit" className="btn btn-primary" disabled={!canEdit || guardar.isPending || !form.nombre.trim()}>
                                    {guardar.isPending ? <span className="spinner" style={{ width: 16, height: 16 }} /> : <><Save size={16} /> Guardar configuracion</>}
                                </button>
                            </div>
                        </form>
                    )}
                </div>

                <div style={{ display: 'grid', gap: 16 }}>
                    <div className="card" style={{ border: '1px solid rgba(59,130,246,0.2)', background: 'linear-gradient(180deg, rgba(59,130,246,0.08), rgba(15,23,42,0.0))' }}>
                        <h3 style={{ fontSize: '1rem', marginBottom: 8 }}>Canal principal por defecto</h3>
                        <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--primary-light)', marginBottom: 8 }}>{nombrePreview}</div>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem', lineHeight: 1.5 }}>
                            Toda venta o presupuesto sin canal manual usara este canal base. Si cambias el nombre de la optica, este canal principal tambien se sincronizara.
                        </p>
                    </div>

                    <div className="card">
                        <h3 style={{ fontSize: '1rem', marginBottom: 12 }}>Preview del logo</h3>
                        {logoPreviewUrl ? (
                            <div style={{ border: '1px dashed var(--border-color)', borderRadius: 14, padding: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 160, background: 'rgba(255,255,255,0.02)' }}>
                                <img src={logoPreviewUrl} alt="Logo institucional" style={{ maxWidth: '100%', maxHeight: 120, objectFit: 'contain' }} />
                            </div>
                        ) : (
                            <div style={{ border: '1px dashed var(--border-color)', borderRadius: 14, padding: 18, minHeight: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', textAlign: 'center' }}>
                                El logo se guarda por tenant en el servidor y estará disponible desde cualquier PC.
                            </div>
                        )}
                    </div>

                    <div className="card">
                        <h3 style={{ fontSize: '1rem', marginBottom: 8 }}>Primer paso del sistema</h3>
                        <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-muted)', lineHeight: 1.7 }}>
                            <li>Completa primero el nombre de la optica.</li>
                            <li>Ese nombre crea o actualiza el canal principal.</li>
                            <li>Luego ya puedes trabajar con vendedores, canales adicionales, presupuestos y ventas.</li>
                        </ul>
                    </div>

                    {data && (
                        <div className="card">
                            <h3 style={{ fontSize: '1rem', marginBottom: 8 }}>Estado actual</h3>
                            <div style={{ display: 'grid', gap: 10 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Configuracion completa</span>
                                    <span className={`badge ${data.configuracion_completa ? 'badge-green' : 'badge-yellow'}`}>{data.configuracion_completa ? 'SI' : 'PENDIENTE'}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Canal principal</span>
                                    <strong>{data.canal_principal_nombre || 'Pendiente'}</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Zona horaria</span>
                                    <strong>{data.business_timezone || 'America/Asuncion'}</strong>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
