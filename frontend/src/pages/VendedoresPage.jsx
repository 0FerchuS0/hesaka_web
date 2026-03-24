import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Edit2, Plus, Search, Trash2, Users } from 'lucide-react'

import Modal from '../components/Modal'
import { api } from '../context/AuthContext'

function VendedorForm({ initial = {}, onSave, onCancel, loading }) {
    const [form, setForm] = useState({
        nombre: '',
        telefono: '',
        email: '',
        notas: '',
        activo: true,
        ...initial,
    })

    const setField = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

    return (
        <form onSubmit={event => { event.preventDefault(); onSave(form) }}>
            <div className="grid-2">
                <div className="form-group">
                    <label className="form-label">Nombre *</label>
                    <input className="form-input" value={form.nombre} onChange={event => setField('nombre', event.target.value)} required placeholder="Ej: Karina Britos" />
                </div>
                <div className="form-group">
                    <label className="form-label">Telefono</label>
                    <input className="form-input" value={form.telefono || ''} onChange={event => setField('telefono', event.target.value)} placeholder="Ej: 0981 123 456" />
                </div>
            </div>
            <div className="grid-2">
                <div className="form-group">
                    <label className="form-label">Email</label>
                    <input className="form-input" value={form.email || ''} onChange={event => setField('email', event.target.value)} placeholder="Ej: karina@hesaka.com" />
                </div>
                <div className="form-group">
                    <label className="form-label">Estado</label>
                    <select className="form-select" value={String(form.activo)} onChange={event => setField('activo', event.target.value === 'true')}>
                        <option value="true">Activo</option>
                        <option value="false">Inactivo</option>
                    </select>
                </div>
            </div>
            <div className="form-group">
                <label className="form-label">Notas</label>
                <textarea className="form-input" rows={3} value={form.notas || ''} onChange={event => setField('notas', event.target.value)} placeholder="Observaciones internas..." style={{ resize: 'vertical' }} />
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

export default function VendedoresPage() {
    const queryClient = useQueryClient()
    const [modal, setModal] = useState(null)
    const [buscar, setBuscar] = useState('')
    const [buscarDebounced, setBuscarDebounced] = useState('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(25)
    const [soloActivos, setSoloActivos] = useState(true)

    useEffect(() => {
        const timer = setTimeout(() => setBuscarDebounced(buscar.trim()), 350)
        return () => clearTimeout(timer)
    }, [buscar])

    useEffect(() => {
        setPage(1)
    }, [buscarDebounced, pageSize, soloActivos])

    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['vendedores-optimizado', buscarDebounced, page, pageSize, soloActivos],
        queryFn: () => {
            const params = new URLSearchParams({
                page: String(page),
                page_size: String(pageSize),
                solo_activos: String(soloActivos),
            })
            if (buscarDebounced) params.append('buscar', buscarDebounced)
            return api.get(`/vendedores/listado-optimizado?${params.toString()}`).then(response => response.data)
        },
        retry: false,
    })

    const vendedores = data?.items || []
    const totalRegistros = data?.total || 0
    const totalPages = data?.total_pages || 1

    const crear = useMutation({
        mutationFn: payload => api.post('/vendedores/', payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['vendedores-optimizado'] })
            queryClient.invalidateQueries({ queryKey: ['vendedores'] })
            setModal(null)
        },
    })

    const editar = useMutation({
        mutationFn: ({ id, ...payload }) => api.put(`/vendedores/${id}`, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['vendedores-optimizado'] })
            queryClient.invalidateQueries({ queryKey: ['vendedores'] })
            setModal(null)
        },
    })

    const eliminar = useMutation({
        mutationFn: id => api.delete(`/vendedores/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['vendedores-optimizado'] })
            queryClient.invalidateQueries({ queryKey: ['vendedores'] })
        },
    })

    const handleSave = values => {
        const payload = {
            ...values,
            nombre: values.nombre?.trim(),
            telefono: values.telefono || null,
            email: values.email || null,
            notas: values.notas || null,
            activo: !!values.activo,
        }
        if (modal === 'nuevo') {
            crear.mutate(payload)
            return
        }
        editar.mutate({ id: modal.id, ...payload })
    }

    const handleDelete = vendedor => {
        if (window.confirm(`Eliminar al vendedor ${vendedor.nombre}?`)) {
            eliminar.mutate(vendedor.id)
        }
    }

    return (
        <div className="page-body" style={{ overflowX: 'hidden' }}>
            <div className="mb-24" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, background: 'rgba(59,130,246,0.15)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Users size={20} style={{ color: 'var(--primary-light)' }} />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Vendedores</h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{totalRegistros} vendedores registrados</p>
                    </div>
                </div>
                <button className="btn btn-primary" onClick={() => setModal('nuevo')} style={{ flexShrink: 0 }}>
                    <Plus size={16} /> Nuevo Vendedor
                </button>
            </div>

            <div className="card mb-16" style={{ padding: '14px 20px', width: '100%', maxWidth: '100%' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div className="search-bar" style={{ flex: '1 1 320px', minWidth: 240 }}>
                        <Search size={16} />
                        <input placeholder="Buscar por nombre, telefono o email..." value={buscar} onChange={event => setBuscar(event.target.value)} />
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.84rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={soloActivos} onChange={event => setSoloActivos(event.target.checked)} style={{ accentColor: 'var(--primary)' }} />
                        Solo activos
                    </label>
                    <select className="form-select" style={{ flex: '0 0 120px', width: 120 }} value={pageSize} onChange={event => setPageSize(parseInt(event.target.value, 10))}>
                        <option value={10}>10 / pag.</option>
                        <option value={25}>25 / pag.</option>
                        <option value={50}>50 / pag.</option>
                    </select>
                </div>
                {isError && (
                    <div style={{ marginTop: 10, background: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 12px', fontSize: '0.84rem' }}>
                        {error?.response?.data?.detail || 'No se pudieron cargar los vendedores.'}
                    </div>
                )}
            </div>

            <div className="card" style={{ padding: 0, width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
                {isLoading ? (
                    <div className="flex-center" style={{ padding: 60 }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>
                ) : vendedores.length === 0 ? (
                    <div className="empty-state"><Users size={40} /><p>No hay vendedores para la busqueda.</p></div>
                ) : (
                    <div className="table-container" style={{ width: '100%', maxWidth: '100%', overflowX: 'auto' }}>
                        <table style={{ minWidth: 900, tableLayout: 'fixed' }}>
                            <thead>
                                <tr>
                                    <th style={{ width: 240 }}>Nombre</th>
                                    <th style={{ width: 170 }}>Telefono</th>
                                    <th style={{ width: 220 }}>Email</th>
                                    <th style={{ width: 120 }}>Estado</th>
                                    <th>Notas</th>
                                    <th style={{ width: 90 }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {vendedores.map(vendedor => (
                                    <tr key={vendedor.id}>
                                        <td style={{ fontWeight: 500, whiteSpace: 'normal', lineHeight: 1.25, wordBreak: 'break-word' }}>{vendedor.nombre}</td>
                                        <td style={{ color: 'var(--text-secondary)' }}>{vendedor.telefono || '—'}</td>
                                        <td style={{ color: 'var(--text-secondary)', whiteSpace: 'normal', lineHeight: 1.25, wordBreak: 'break-word' }}>{vendedor.email || '—'}</td>
                                        <td><span className={`badge ${vendedor.activo ? 'badge-green' : 'badge-gray'}`}>{vendedor.activo ? 'ACTIVO' : 'INACTIVO'}</span></td>
                                        <td style={{ color: 'var(--text-secondary)', whiteSpace: 'normal', lineHeight: 1.25, wordBreak: 'break-word' }}>{vendedor.notas || '—'}</td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                                <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setModal(vendedor)} title="Editar">
                                                    <Edit2 size={14} />
                                                </button>
                                                <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDelete(vendedor)} title="Eliminar" disabled={eliminar.isPending}>
                                                    <Trash2 size={14} />
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
                    Mostrando pagina <strong>{page}</strong> de <strong>{totalPages}</strong> · <strong>{totalRegistros}</strong> vendedor{totalRegistros === 1 ? '' : 'es'} encontrados
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => setPage(prev => Math.max(1, prev - 1))} disabled={page <= 1}>Anterior</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setPage(prev => Math.min(totalPages, prev + 1))} disabled={page >= totalPages}>Siguiente</button>
                </div>
            </div>

            {modal && (
                <Modal title={modal === 'nuevo' ? 'Nuevo Vendedor' : `Editar: ${modal.nombre}`} onClose={() => setModal(null)} maxWidth="620px">
                    <VendedorForm initial={modal !== 'nuevo' ? modal : {}} onSave={handleSave} onCancel={() => setModal(null)} loading={crear.isPending || editar.isPending} />
                </Modal>
            )}
        </div>
    )
}
