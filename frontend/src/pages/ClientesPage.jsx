import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../context/AuthContext'
import Modal from '../components/Modal'
import { Users, Plus, Search, Edit2, Phone, User, Eye } from 'lucide-react'
import { exportReportBlob } from '../utils/reportExports'

function fmt(fecha) {
    if (!fecha) return '-'
    return new Date(fecha).toLocaleDateString('es-PY')
}

function gs(monto) {
    return `Gs. ${new Intl.NumberFormat('es-PY').format(monto || 0)}`
}

function GraduacionBox({ titulo, data }) {
    const rowStyle = {
        display: 'grid',
        gridTemplateColumns: '80px repeat(4, minmax(72px, 1fr))',
        gap: 8,
        alignItems: 'center',
    }
    const cellStyle = {
        padding: '8px 10px',
        borderRadius: 8,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid var(--border-color)',
        textAlign: 'center',
        fontWeight: 600,
        minHeight: 38,
    }

    if (!data) {
        return <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No hay graduacion registrada.</div>
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>{titulo}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                    {data.codigo_presupuesto} · {fmt(data.fecha_presupuesto)}
                </div>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ ...rowStyle, color: 'var(--text-muted)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    <div></div>
                    <div style={{ textAlign: 'center' }}>Esfera</div>
                    <div style={{ textAlign: 'center' }}>Cilindro</div>
                    <div style={{ textAlign: 'center' }}>Eje</div>
                    <div style={{ textAlign: 'center' }}>Adicion</div>
                </div>
                <div style={rowStyle}>
                    <div style={{ fontWeight: 700 }}>OD</div>
                    <div style={cellStyle}>{data.od_esfera || '-'}</div>
                    <div style={cellStyle}>{data.od_cilindro || '-'}</div>
                    <div style={cellStyle}>{data.od_eje || '-'}</div>
                    <div style={cellStyle}>{data.od_adicion || '-'}</div>
                </div>
                <div style={rowStyle}>
                    <div style={{ fontWeight: 700 }}>OI</div>
                    <div style={cellStyle}>{data.oi_esfera || '-'}</div>
                    <div style={cellStyle}>{data.oi_cilindro || '-'}</div>
                    <div style={cellStyle}>{data.oi_eje || '-'}</div>
                    <div style={cellStyle}>{data.oi_adicion || '-'}</div>
                </div>
            </div>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginBottom: 4 }}>Fecha receta</div>
                    <div>{fmt(data.fecha_receta)}</div>
                </div>
                <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginBottom: 4 }}>Doctor</div>
                    <div>{data.doctor || '-'}</div>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginBottom: 4 }}>Observaciones</div>
                    <div style={{ whiteSpace: 'normal', lineHeight: 1.35, wordBreak: 'break-word' }}>{data.observaciones || '-'}</div>
                </div>
            </div>
        </div>
    )
}

function ClienteForm({ initial = {}, onSave, onCancel, loading }) {
    const [f, setF] = useState({
        nombre: '', ci: '', telefono: '', email: '',
        direccion: '', notas: '', referidor_id: null, ...initial
    })
    const set = (k, v) => setF(p => ({ ...p, [k]: v }))

    const { data: referidores = [] } = useQuery({
        queryKey: ['referidores'],
        queryFn: () => api.get('/referidores/').then(r => r.data),
        retry: false,
    })

    return (
        <form onSubmit={e => { e.preventDefault(); onSave(f) }}>
            <div className="grid-2">
                <div className="form-group">
                    <label className="form-label">Nombre completo *</label>
                    <input className="form-input" value={f.nombre} onChange={e => set('nombre', e.target.value)} required placeholder="Ej: Juan Perez" />
                </div>
                <div className="form-group">
                    <label className="form-label">CI / RUC</label>
                    <input className="form-input" value={f.ci || ''} onChange={e => set('ci', e.target.value)} placeholder="Ej: 4.567.890" />
                </div>
                <div className="form-group">
                    <label className="form-label">Telefono</label>
                    <input className="form-input" value={f.telefono || ''} onChange={e => set('telefono', e.target.value)} placeholder="Ej: 0981 123 456" />
                </div>
                <div className="form-group">
                    <label className="form-label">Email</label>
                    <input className="form-input" type="email" value={f.email || ''} onChange={e => set('email', e.target.value)} placeholder="correo@ejemplo.com" />
                </div>
            </div>
            <div className="form-group">
                <label className="form-label">Direccion</label>
                <input className="form-input" value={f.direccion || ''} onChange={e => set('direccion', e.target.value)} placeholder="Av. Brasil 1234..." />
            </div>
            <div className="form-group">
                <label className="form-label">Referidor</label>
                <select className="form-select" value={f.referidor_id || ''} onChange={e => set('referidor_id', e.target.value || null)}>
                    <option value="">Sin referidor</option>
                    {referidores.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                </select>
            </div>
            <div className="form-group">
                <label className="form-label">Notas internas</label>
                <textarea className="form-input" rows={2} value={f.notas || ''} onChange={e => set('notas', e.target.value)} placeholder="Observaciones..." style={{ resize: 'vertical' }} />
            </div>
            <div className="flex gap-12" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                    {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Guardar'}
                </button>
            </div>
        </form>
    )
}

function ClienteFichaModal({ clienteId, onClose }) {
    const [exportandoPdf, setExportandoPdf] = useState(false)
    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['cliente-ficha', clienteId],
        queryFn: () => api.get(`/clientes/${clienteId}/ficha`).then(r => r.data),
        retry: false,
    })

    if (isLoading) {
        return <div className="flex-center" style={{ padding: 50 }}><div className="spinner" style={{ width: 28, height: 28 }} /></div>
    }

    if (isError || !data) {
        return <div style={{ color: 'var(--danger)', fontSize: '0.9rem' }}>{error?.response?.data?.detail || 'No se pudo cargar la ficha del cliente.'}</div>
    }

    const { cliente, deuda_total, movimientos, ventas_pendientes, ultima_graduacion, historial_armazones = [] } = data

    const exportarPdf = async () => {
        try {
            setExportandoPdf(true)
            await exportReportBlob(`/clientes/${clienteId}/ficha/pdf`, 'application/pdf', { openInNewTab: true })
        } finally {
            setExportandoPdf(false)
        }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="card" style={{ padding: '14px 16px' }}>
                <div style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: 8 }}>{cliente.nombre}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem', lineHeight: 1.5 }}>
                    CI/RUC: {cliente.ci || '-'}<br />
                    Telefono: {cliente.telefono || '-'}<br />
                    Email: {cliente.email || '-'}<br />
                    Direccion: {cliente.direccion || '-'}<br />
                    Referidor: {cliente.referidor_nombre || '-'}
                </div>
                <div style={{ marginTop: 12, color: 'var(--warning)', fontWeight: 800, fontSize: '1.1rem' }}>
                    Deuda total: {gs(deuda_total)}
                </div>
            </div>

            <div className="card" style={{ padding: '14px 16px' }}>
                <h4 style={{ marginBottom: 12, fontSize: '0.96rem' }}>Ultima graduacion</h4>
                <GraduacionBox titulo="Receta mas reciente" data={ultima_graduacion} />
            </div>

            <div className="card" style={{ padding: '14px 16px' }}>
                <h4 style={{ marginBottom: 12, fontSize: '0.96rem' }}>Deudas pendientes</h4>
                <div className="table-container" style={{ maxHeight: 240, overflow: 'auto' }}>
                    <table style={{ minWidth: 720 }}>
                        <thead>
                            <tr>
                                <th>Fecha</th>
                                <th>Venta</th>
                                <th className="text-right">Total</th>
                                <th className="text-right">Pagado</th>
                                <th className="text-right">Saldo</th>
                                <th>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ventas_pendientes.length === 0 ? (
                                <tr><td colSpan="6" className="text-center" style={{ padding: 20, color: 'var(--text-muted)' }}>Sin deudas pendientes.</td></tr>
                            ) : ventas_pendientes.map(item => (
                                <tr key={item.venta_id}>
                                    <td>{fmt(item.fecha)}</td>
                                    <td>{item.codigo}</td>
                                    <td className="text-right">{gs(item.total)}</td>
                                    <td className="text-right" style={{ color: 'var(--success)' }}>{gs(item.pagado)}</td>
                                    <td className="text-right" style={{ color: 'var(--warning)', fontWeight: 700 }}>{gs(item.saldo)}</td>
                                    <td>{item.estado}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="card" style={{ padding: '14px 16px' }}>
                <h4 style={{ marginBottom: 12, fontSize: '0.96rem' }}>Estado de cuenta</h4>
                <div className="table-container" style={{ maxHeight: 320, overflow: 'auto' }}>
                    <table style={{ minWidth: 860 }}>
                        <thead>
                            <tr>
                                <th>Fecha</th>
                                <th>Tipo</th>
                                <th>Descripcion</th>
                                <th className="text-right">Debito</th>
                                <th className="text-right">Credito</th>
                                <th className="text-right">Saldo</th>
                            </tr>
                        </thead>
                        <tbody>
                            {movimientos.length === 0 ? (
                                <tr><td colSpan="6" className="text-center" style={{ padding: 20, color: 'var(--text-muted)' }}>Sin movimientos.</td></tr>
                            ) : movimientos.map((mov, index) => (
                                <tr key={`${mov.fecha}-${mov.tipo}-${index}`}>
                                    <td>{fmt(mov.fecha)}</td>
                                    <td>{mov.tipo}</td>
                                    <td style={{ whiteSpace: 'normal', lineHeight: 1.25, wordBreak: 'break-word' }}>{mov.descripcion}</td>
                                    <td className="text-right">{gs(mov.debito)}</td>
                                    <td className="text-right">{gs(mov.credito)}</td>
                                    <td className="text-right" style={{ fontWeight: 700 }}>{gs(mov.saldo_acumulado)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="card" style={{ padding: '14px 16px' }}>
                <h4 style={{ marginBottom: 12, fontSize: '0.96rem' }}>Historial de armazones</h4>
                <div className="table-container" style={{ maxHeight: 320, overflow: 'auto' }}>
                    <table style={{ minWidth: 980 }}>
                        <thead>
                            <tr>
                                <th>Fecha</th>
                                <th>Armazon</th>
                                <th>Cod.</th>
                                <th>Medidas</th>
                                <th className="text-right">Precio</th>
                                <th>Venta</th>
                                <th>Receta asociada</th>
                            </tr>
                        </thead>
                        <tbody>
                            {historial_armazones.length === 0 ? (
                                <tr><td colSpan="7" className="text-center" style={{ padding: 20, color: 'var(--text-muted)' }}>Sin historial de armazones.</td></tr>
                            ) : historial_armazones.map((item, index) => (
                                <tr key={`${item.fecha}-${item.codigo_armazon || item.codigo_producto}-${index}`}>
                                    <td>{fmt(item.fecha)}</td>
                                    <td style={{ whiteSpace: 'normal', lineHeight: 1.25, wordBreak: 'break-word' }}>{item.producto}</td>
                                    <td>{item.codigo_armazon || item.codigo_producto || '-'}</td>
                                    <td>{item.medidas || '-'}</td>
                                    <td className="text-right">{gs(item.precio_venta)}</td>
                                    <td>{item.venta_codigo || '-'}</td>
                                    <td style={{ whiteSpace: 'normal', lineHeight: 1.25, wordBreak: 'break-word' }}>
                                        {item.graduacion
                                            ? `${fmt(item.graduacion.fecha_receta)} · ${item.graduacion.doctor || '-'}`
                                            : '-'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="flex gap-12" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-primary" onClick={exportarPdf} disabled={exportandoPdf}>
                    {exportandoPdf ? 'Generando PDF...' : 'PDF'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={onClose}>Cerrar</button>
            </div>
        </div>
    )
}

export default function ClientesPage() {
    const qc = useQueryClient()
    const [buscar, setBuscar] = useState('')
    const [buscarDebounced, setBuscarDebounced] = useState('')
    const [referidorFiltro, setReferidorFiltro] = useState('')
    const [modal, setModal] = useState(null)
    const [fichaClienteId, setFichaClienteId] = useState(null)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(25)
    const [exportando, setExportando] = useState(false)

    const { data: referidores = [] } = useQuery({
        queryKey: ['referidores'],
        queryFn: () => api.get('/referidores/').then(r => r.data),
        retry: false,
    })

    useEffect(() => {
        const timer = setTimeout(() => setBuscarDebounced(buscar.trim()), 350)
        return () => clearTimeout(timer)
    }, [buscar])

    useEffect(() => {
        setPage(1)
    }, [buscarDebounced, referidorFiltro, pageSize])

    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['clientes-optimizado', buscarDebounced, referidorFiltro, page, pageSize],
        queryFn: () => {
            const params = new URLSearchParams()
            params.append('page', String(page))
            params.append('page_size', String(pageSize))
            if (buscarDebounced) params.append('buscar', buscarDebounced)
            if (referidorFiltro) params.append('referidor_id', referidorFiltro)
            return api.get(`/clientes/listado-optimizado?${params.toString()}`).then(r => r.data)
        },
        retry: false,
    })

    const clientes = data?.items || []
    const totalRegistros = data?.total || 0
    const totalPages = data?.total_pages || 1

    const crear = useMutation({
        mutationFn: d => api.post('/clientes/', d),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['clientes'] })
            qc.invalidateQueries({ queryKey: ['clientes-optimizado'] })
            setModal(null)
        }
    })

    const editar = useMutation({
        mutationFn: ({ id, ...d }) => api.put(`/clientes/${id}`, d),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['clientes'] })
            qc.invalidateQueries({ queryKey: ['clientes-optimizado'] })
            setModal(null)
        }
    })

    const handleSave = (f) => {
        if (modal === 'nuevo') crear.mutate(f)
        else editar.mutate({ id: modal.id, ...f })
    }

    const construirParams = () => {
        const params = new URLSearchParams()
        if (buscarDebounced) params.append('buscar', buscarDebounced)
        if (referidorFiltro) params.append('referidor_id', referidorFiltro)
        return params
    }

    const exportarPDF = async () => {
        try {
            setExportando(true)
            const params = construirParams()
            await exportReportBlob(`/clientes/reporte/pdf?${params.toString()}`, 'application/pdf', { openInNewTab: true })
        } finally {
            setExportando(false)
        }
    }

    const exportarExcel = async () => {
        try {
            setExportando(true)
            const params = construirParams()
            await exportReportBlob(
                `/clientes/reporte/excel?${params.toString()}`,
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
        } finally {
            setExportando(false)
        }
    }

    return (
        <div className="page-body" style={{ overflowX: 'hidden' }}>
            <div className="mb-24" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, background: 'rgba(26,86,219,0.15)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Users size={20} style={{ color: 'var(--primary-light)' }} />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Clientes</h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{totalRegistros} clientes registrados</p>
                    </div>
                </div>
                <button className="btn btn-primary" onClick={() => setModal('nuevo')} style={{ flexShrink: 0 }}>
                    <Plus size={16} /> Nuevo Cliente
                </button>
            </div>

            <div className="card mb-16" style={{ padding: '14px 20px', display: 'grid', gap: 10, width: '100%', maxWidth: '100%' }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div className="search-bar" style={{ flex: '1 1 320px', minWidth: 240 }}>
                        <Search size={16} />
                        <input
                            placeholder="Buscar por nombre, CI o telefono..."
                            value={buscar}
                            onChange={e => setBuscar(e.target.value)}
                        />
                    </div>
                    <select
                        className="form-select"
                        style={{ flex: '0 0 200px', width: 200 }}
                        value={referidorFiltro}
                        onChange={e => setReferidorFiltro(e.target.value)}
                    >
                        <option value="">Todos los referidores</option>
                        {referidores.map(r => (
                            <option key={r.id} value={r.id}>{r.nombre}</option>
                        ))}
                    </select>
                    <select
                        className="form-select"
                        style={{ flex: '0 0 120px', width: 120 }}
                        value={pageSize}
                        onChange={e => setPageSize(parseInt(e.target.value, 10))}
                    >
                        <option value={10}>10 / pag.</option>
                        <option value={25}>25 / pag.</option>
                        <option value={50}>50 / pag.</option>
                    </select>
                    <button
                        className="btn"
                        style={{ backgroundColor: '#27ae60', color: 'white', flexShrink: 0 }}
                        onClick={exportarExcel}
                        disabled={exportando}
                    >
                        {exportando ? 'Exportando...' : 'Excel'}
                    </button>
                    <button
                        className="btn"
                        style={{ backgroundColor: '#e74c3c', color: 'white', flexShrink: 0 }}
                        onClick={exportarPDF}
                        disabled={exportando}
                    >
                        {exportando ? 'Exportando...' : 'PDF'}
                    </button>
                </div>
                {isError && (
                    <div style={{ background: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 12px', fontSize: '0.84rem' }}>
                        {error?.response?.data?.detail || 'No se pudieron cargar los clientes.'}
                    </div>
                )}
            </div>

            <div className="card" style={{ padding: 0, width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
                {isLoading ? (
                    <div className="flex-center" style={{ padding: 60 }}>
                        <div className="spinner" style={{ width: 32, height: 32 }} />
                    </div>
                ) : clientes.length === 0 ? (
                    <div className="empty-state">
                        <Users size={40} />
                        <p>No hay clientes{buscarDebounced ? ` para "${buscarDebounced}"` : ''}.</p>
                    </div>
                ) : (
                    <div className="table-container" style={{ width: '100%', maxWidth: '100%', overflowX: 'auto' }}>
                        <table style={{ minWidth: 980, tableLayout: 'fixed' }}>
                            <thead>
                                <tr>
                                    <th style={{ width: 240 }}>Nombre</th>
                                    <th style={{ width: 130 }}>CI / RUC</th>
                                    <th style={{ width: 160 }}>Telefono</th>
                                    <th style={{ width: 220 }}>Email</th>
                                    <th style={{ width: 180 }}>Referidor</th>
                                    <th style={{ width: 110 }}>Registro</th>
                                    <th style={{ width: 130 }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {clientes.map(c => (
                                    <tr key={c.id}>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                                                <div style={{
                                                    width: 32, height: 32, borderRadius: '50%',
                                                    background: 'linear-gradient(135deg, var(--primary), #7c3aed)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: '0.75rem', fontWeight: 700, color: 'white', flexShrink: 0
                                                }}>
                                                    {c.nombre.split(' ').map(n => n[0]).slice(0, 2).join('')}
                                                </div>
                                                <span style={{ fontWeight: 500, whiteSpace: 'normal', lineHeight: 1.25, wordBreak: 'break-word' }}>{c.nombre}</span>
                                            </div>
                                        </td>
                                        <td style={{ color: 'var(--text-secondary)', whiteSpace: 'normal', lineHeight: 1.25, wordBreak: 'break-word' }}>{c.ci || '-'}</td>
                                        <td>
                                            {c.telefono ? (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', whiteSpace: 'normal', lineHeight: 1.25, wordBreak: 'break-word' }}>
                                                    <Phone size={13} />{c.telefono}
                                                </span>
                                            ) : '-'}
                                        </td>
                                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', whiteSpace: 'normal', lineHeight: 1.25, wordBreak: 'break-word' }}>{c.email || '-'}</td>
                                        <td>
                                            {c.referidor_nombre
                                                ? <span className="badge badge-blue" style={{ whiteSpace: 'normal', lineHeight: 1.25, wordBreak: 'break-word' }}><User size={10} style={{ marginRight: 4, flexShrink: 0 }} />{c.referidor_nombre}</span>
                                                : <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>-</span>}
                                        </td>
                                        <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{fmt(c.fecha_registro)}</td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                                <button
                                                    className="btn btn-secondary btn-sm btn-icon"
                                                    onClick={() => setFichaClienteId(c.id)}
                                                    title="Ver ficha"
                                                >
                                                    <Eye size={14} />
                                                </button>
                                                <button
                                                    className="btn btn-secondary btn-sm btn-icon"
                                                    onClick={() => setModal(c)}
                                                    title="Editar"
                                                >
                                                    <Edit2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="card" style={{ marginTop: 16, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                    Mostrando pagina <strong>{page}</strong> de <strong>{totalPages}</strong> · <strong>{totalRegistros}</strong> cliente{totalRegistros === 1 ? '' : 's'} encontrados
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => setPage(prev => Math.max(1, prev - 1))} disabled={page <= 1}>
                        Anterior
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setPage(prev => Math.min(totalPages, prev + 1))} disabled={page >= totalPages}>
                        Siguiente
                    </button>
                </div>
            </div>

            {modal && (
                <Modal
                    title={modal === 'nuevo' ? 'Nuevo Cliente' : `Editar: ${modal.nombre}`}
                    onClose={() => setModal(null)}
                    maxWidth="620px"
                >
                    <ClienteForm
                        initial={modal !== 'nuevo' ? modal : {}}
                        onSave={handleSave}
                        onCancel={() => setModal(null)}
                        loading={crear.isPending || editar.isPending}
                    />
                    {(crear.isError || editar.isError) && (
                        <p style={{ color: 'var(--danger)', fontSize: '0.82rem', marginTop: 8 }}>
                            {crear.error?.response?.data?.detail || editar.error?.response?.data?.detail || 'Error al guardar.'}
                        </p>
                    )}
                </Modal>
            )}

            {fichaClienteId && (
                <Modal title="Ficha de Cliente" onClose={() => setFichaClienteId(null)} maxWidth="1080px">
                    <ClienteFichaModal clienteId={fichaClienteId} onClose={() => setFichaClienteId(null)} />
                </Modal>
            )}
        </div>
    )
}
