import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Edit2, Eye, Mail, Phone, Plus, Search } from 'lucide-react'

import Modal from '../components/Modal'
import { api } from '../context/AuthContext'
import { parseBackendDateTime } from '../utils/formatters'
import { exportReportBlob } from '../utils/reportExports'

function ProveedorForm({ initial = {}, onSave, onCancel, loading }) {
    const [form, setForm] = useState({
        nombre: '',
        telefono: '',
        email: '',
        direccion: '',
        ...initial,
    })

    const setField = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

    return (
        <form onSubmit={event => { event.preventDefault(); onSave(form) }}>
            <div className="form-group">
                <label className="form-label">Nombre *</label>
                <input
                    className="form-input"
                    value={form.nombre}
                    onChange={event => setField('nombre', event.target.value)}
                    required
                    placeholder="Ej: Laboratorio Optico S.A."
                />
            </div>
            <div className="grid-2">
                <div className="form-group">
                    <label className="form-label">Telefono</label>
                    <input
                        className="form-input"
                        value={form.telefono || ''}
                        onChange={event => setField('telefono', event.target.value)}
                        placeholder="0981 000 000"
                    />
                </div>
                <div className="form-group">
                    <label className="form-label">Email</label>
                    <input
                        className="form-input"
                        type="email"
                        value={form.email || ''}
                        onChange={event => setField('email', event.target.value)}
                        placeholder="correo@proveedor.com"
                    />
                </div>
            </div>
            <div className="form-group">
                <label className="form-label">Direccion</label>
                <input
                    className="form-input"
                    value={form.direccion || ''}
                    onChange={event => setField('direccion', event.target.value)}
                    placeholder="Direccion del proveedor"
                />
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

function fmtFecha(value) {
    const date = parseBackendDateTime(value)
    return date ? date.toLocaleDateString('es-PY') : '-'
}

function ProveedorFichaModal({ proveedorId, onClose }) {
    const [exportandoPdf, setExportandoPdf] = useState(false)
    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['proveedor-ficha', proveedorId],
        queryFn: () => api.get(`/proveedores/${proveedorId}/ficha`).then(response => response.data),
        retry: false,
    })

    if (isLoading) {
        return <div className="flex-center" style={{ padding: 50 }}><div className="spinner" style={{ width: 28, height: 28 }} /></div>
    }

    if (isError || !data) {
        return <div style={{ color: 'var(--danger)', fontSize: '0.9rem' }}>{error?.response?.data?.detail || 'No se pudo cargar la ficha del proveedor.'}</div>
    }

    const { proveedor, deuda_total, movimientos, compras_pendientes } = data

    const exportarPdf = async () => {
        try {
            setExportandoPdf(true)
            await exportReportBlob(`/proveedores/${proveedorId}/ficha/pdf`, 'application/pdf', { openInNewTab: true })
        } finally {
            setExportandoPdf(false)
        }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="card" style={{ padding: '14px 16px' }}>
                <div style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: 8 }}>{proveedor.nombre}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem', lineHeight: 1.5 }}>
                    Telefono: {proveedor.telefono || '-'}<br />
                    Email: {proveedor.email || '-'}<br />
                    Direccion: {proveedor.direccion || '-'}
                </div>
                <div style={{ marginTop: 12, color: 'var(--warning)', fontWeight: 800, fontSize: '1.1rem' }}>
                    Deuda total: Gs. {new Intl.NumberFormat('es-PY').format(deuda_total || 0)}
                </div>
            </div>

            <div className="card" style={{ padding: '14px 16px' }}>
                <h4 style={{ marginBottom: 12, fontSize: '0.96rem' }}>Compras pendientes</h4>
                <div className="table-container" style={{ maxHeight: 240, overflow: 'auto' }}>
                    <table style={{ minWidth: 860 }}>
                        <thead>
                            <tr>
                                <th>Fecha</th>
                                <th>Documento</th>
                                <th>Vencimiento</th>
                                <th className="text-right">Total</th>
                                <th className="text-right">Pagado</th>
                                <th className="text-right">Saldo</th>
                                <th>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {compras_pendientes.length === 0 ? (
                                <tr><td colSpan="7" className="text-center" style={{ padding: 20, color: 'var(--text-muted)' }}>Sin compras pendientes.</td></tr>
                            ) : compras_pendientes.map(item => (
                                <tr key={item.compra_id}>
                                    <td>{fmtFecha(item.fecha)}</td>
                                    <td style={{ whiteSpace: 'normal', lineHeight: 1.25, wordBreak: 'break-word' }}>{item.documento}</td>
                                    <td>{fmtFecha(item.fecha_vencimiento)}</td>
                                    <td className="text-right">Gs. {new Intl.NumberFormat('es-PY').format(item.total || 0)}</td>
                                    <td className="text-right" style={{ color: 'var(--success)' }}>Gs. {new Intl.NumberFormat('es-PY').format(item.pagado || 0)}</td>
                                    <td className="text-right" style={{ color: 'var(--warning)', fontWeight: 700 }}>Gs. {new Intl.NumberFormat('es-PY').format(item.saldo || 0)}</td>
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
                                <th className="text-right">Pago</th>
                                <th className="text-right">Compra</th>
                                <th className="text-right">Saldo</th>
                            </tr>
                        </thead>
                        <tbody>
                            {movimientos.length === 0 ? (
                                <tr><td colSpan="6" className="text-center" style={{ padding: 20, color: 'var(--text-muted)' }}>Sin movimientos.</td></tr>
                            ) : movimientos.map((mov, index) => (
                                <tr key={`${mov.fecha}-${mov.tipo}-${index}`}>
                                    <td>{fmtFecha(mov.fecha)}</td>
                                    <td>{mov.tipo}</td>
                                    <td style={{ whiteSpace: 'normal', lineHeight: 1.25, wordBreak: 'break-word' }}>{mov.descripcion}</td>
                                    <td className="text-right">Gs. {new Intl.NumberFormat('es-PY').format(mov.debito || 0)}</td>
                                    <td className="text-right">Gs. {new Intl.NumberFormat('es-PY').format(mov.credito || 0)}</td>
                                    <td className="text-right" style={{ fontWeight: 700 }}>Gs. {new Intl.NumberFormat('es-PY').format(mov.saldo_acumulado || 0)}</td>
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

export default function ProveedoresPage() {
    const queryClient = useQueryClient()
    const [modal, setModal] = useState(null)
    const [fichaProveedorId, setFichaProveedorId] = useState(null)
    const [buscar, setBuscar] = useState('')
    const [buscarDebounced, setBuscarDebounced] = useState('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(25)

    useEffect(() => {
        const timer = setTimeout(() => setBuscarDebounced(buscar.trim()), 350)
        return () => clearTimeout(timer)
    }, [buscar])

    useEffect(() => {
        setPage(1)
    }, [buscarDebounced, pageSize])

    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['proveedores-optimizado', buscarDebounced, page, pageSize],
        queryFn: () => {
            const params = new URLSearchParams({
                page: String(page),
                page_size: String(pageSize),
            })
            if (buscarDebounced) {
                params.append('buscar', buscarDebounced)
            }
            return api.get(`/proveedores/listado-optimizado?${params.toString()}`).then(response => response.data)
        },
        retry: false,
    })

    const proveedores = data?.items || []
    const totalRegistros = data?.total || 0
    const totalPages = data?.total_pages || 1

    const crear = useMutation({
        mutationFn: payload => api.post('/proveedores/', payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['proveedores'] })
            queryClient.invalidateQueries({ queryKey: ['proveedores-optimizado'] })
            setModal(null)
        },
    })

    const editar = useMutation({
        mutationFn: ({ id, ...payload }) => api.put(`/proveedores/${id}`, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['proveedores'] })
            queryClient.invalidateQueries({ queryKey: ['proveedores-optimizado'] })
            setModal(null)
        },
    })

    const handleSave = values => {
        if (modal === 'nuevo') {
            crear.mutate(values)
            return
        }
        editar.mutate({ id: modal.id, ...values })
    }

    return (
        <div className="page-body" style={{ overflowX: 'hidden' }}>
            <div className="mb-24" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, background: 'rgba(245,158,11,0.15)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Building2 size={20} style={{ color: 'var(--warning)' }} />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Proveedores</h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{totalRegistros} proveedores registrados</p>
                    </div>
                </div>
                <button className="btn btn-primary" onClick={() => setModal('nuevo')} style={{ flexShrink: 0 }}>
                    <Plus size={16} /> Nuevo Proveedor
                </button>
            </div>

            <div className="card mb-16" style={{ padding: '14px 20px', width: '100%', maxWidth: '100%' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div className="search-bar" style={{ flex: '1 1 320px', minWidth: 240 }}>
                        <Search size={16} />
                        <input
                            placeholder="Buscar por nombre, telefono, email o direccion..."
                            value={buscar}
                            onChange={event => setBuscar(event.target.value)}
                        />
                    </div>
                    <select
                        className="form-select"
                        style={{ flex: '0 0 120px', width: 120 }}
                        value={pageSize}
                        onChange={event => setPageSize(parseInt(event.target.value, 10))}
                    >
                        <option value={10}>10 / pag.</option>
                        <option value={25}>25 / pag.</option>
                        <option value={50}>50 / pag.</option>
                    </select>
                </div>
                {isError && (
                    <div style={{ marginTop: 10, background: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 12px', fontSize: '0.84rem' }}>
                        {error?.response?.data?.detail || 'No se pudieron cargar los proveedores.'}
                    </div>
                )}
            </div>

            <div className="card" style={{ padding: 0, width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
                {isLoading ? (
                    <div className="flex-center" style={{ padding: 60 }}>
                        <div className="spinner" style={{ width: 32, height: 32 }} />
                    </div>
                ) : proveedores.length === 0 ? (
                    <div className="empty-state">
                        <Building2 size={40} />
                        <p>No hay proveedores para la busqueda.</p>
                    </div>
                ) : (
                    <div className="table-container" style={{ width: '100%', maxWidth: '100%', overflowX: 'auto' }}>
                        <table style={{ minWidth: 980, tableLayout: 'fixed' }}>
                            <thead>
                                <tr>
                                    <th style={{ width: 260 }}>Nombre</th>
                                    <th style={{ width: 180 }}>Telefono</th>
                                    <th style={{ width: 240 }}>Email</th>
                                    <th style={{ width: 250 }}>Direccion</th>
                                    <th style={{ width: 130 }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {proveedores.map(proveedor => (
                                    <tr key={proveedor.id}>
                                        <td style={{ fontWeight: 600, whiteSpace: 'normal', lineHeight: 1.25, wordBreak: 'break-word' }}>{proveedor.nombre}</td>
                                        <td style={{ color: 'var(--text-secondary)', whiteSpace: 'normal', lineHeight: 1.25, wordBreak: 'break-word' }}>
                                            {proveedor.telefono ? (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <Phone size={13} />
                                                    {proveedor.telefono}
                                                </span>
                                            ) : '—'}
                                        </td>
                                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', whiteSpace: 'normal', lineHeight: 1.25, wordBreak: 'break-word' }}>
                                            {proveedor.email ? (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <Mail size={13} />
                                                    {proveedor.email}
                                                </span>
                                            ) : '—'}
                                        </td>
                                        <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem', whiteSpace: 'normal', lineHeight: 1.25, wordBreak: 'break-word' }}>
                                            {proveedor.direccion || '—'}
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                                <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setFichaProveedorId(proveedor.id)} title="Ver ficha">
                                                    <Eye size={14} />
                                                </button>
                                                <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setModal(proveedor)} title="Editar">
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
                    Mostrando pagina <strong>{page}</strong> de <strong>{totalPages}</strong> · <strong>{totalRegistros}</strong> proveedor{totalRegistros === 1 ? '' : 'es'} encontrados
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
                <Modal title={modal === 'nuevo' ? 'Nuevo Proveedor' : `Editar: ${modal.nombre}`} onClose={() => setModal(null)}>
                    <ProveedorForm
                        initial={modal !== 'nuevo' ? modal : {}}
                        onSave={handleSave}
                        onCancel={() => setModal(null)}
                        loading={crear.isPending || editar.isPending}
                    />
                </Modal>
            )}

            {fichaProveedorId && (
                <Modal title="Ficha de Proveedor" onClose={() => setFichaProveedorId(null)} maxWidth="1080px">
                    <ProveedorFichaModal proveedorId={fichaProveedorId} onClose={() => setFichaProveedorId(null)} />
                </Modal>
            )}
        </div>
    )
}
