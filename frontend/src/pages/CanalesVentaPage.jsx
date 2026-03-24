import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Edit2, FolderTree, Plus, Search, Trash2 } from 'lucide-react'

import Modal from '../components/Modal'
import { api } from '../context/AuthContext'

function CanalForm({ initial = {}, onSave, onCancel, loading }) {
    const [form, setForm] = useState({
        nombre: '',
        descripcion: '',
        activo: true,
        ...initial,
    })

    const setField = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

    return (
        <form onSubmit={event => { event.preventDefault(); onSave(form) }}>
            <div className="form-group">
                <label className="form-label">Nombre *</label>
                <input className="form-input" value={form.nombre} onChange={event => setField('nombre', event.target.value)} required placeholder="Ej: Proyecto Karina" />
            </div>
            <div className="grid-2">
                <div className="form-group">
                    <label className="form-label">Descripcion</label>
                    <input className="form-input" value={form.descripcion || ''} onChange={event => setField('descripcion', event.target.value)} placeholder="Ej: Ventas del proyecto externo" />
                </div>
                <div className="form-group">
                    <label className="form-label">Estado</label>
                    <select className="form-select" value={String(form.activo)} onChange={event => setField('activo', event.target.value === 'true')}>
                        <option value="true">Activo</option>
                        <option value="false">Inactivo</option>
                    </select>
                </div>
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

export default function CanalesVentaPage() {
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
        queryKey: ['canales-venta-optimizado', buscarDebounced, page, pageSize, soloActivos],
        queryFn: () => {
            const params = new URLSearchParams({
                page: String(page),
                page_size: String(pageSize),
                solo_activos: String(soloActivos),
            })
            if (buscarDebounced) params.append('buscar', buscarDebounced)
            return api.get(`/canales-venta/listado-optimizado?${params.toString()}`).then(response => response.data)
        },
        retry: false,
    })

    const canales = data?.items || []
    const totalRegistros = data?.total || 0
    const totalPages = data?.total_pages || 1

    const crear = useMutation({
        mutationFn: payload => api.post('/canales-venta/', payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['canales-venta-optimizado'] })
            queryClient.invalidateQueries({ queryKey: ['canales-venta'] })
            setModal(null)
        },
    })

    const editar = useMutation({
        mutationFn: ({ id, ...payload }) => api.put(`/canales-venta/${id}`, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['canales-venta-optimizado'] })
            queryClient.invalidateQueries({ queryKey: ['canales-venta'] })
            setModal(null)
        },
    })

    const eliminar = useMutation({
        mutationFn: id => api.delete(`/canales-venta/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['canales-venta-optimizado'] })
            queryClient.invalidateQueries({ queryKey: ['canales-venta'] })
        },
    })

    const handleSave = values => {
        const payload = {
            ...values,
            nombre: values.nombre?.trim(),
            descripcion: values.descripcion || null,
            activo: !!values.activo,
        }
        if (modal === 'nuevo') {
            crear.mutate(payload)
            return
        }
        editar.mutate({ id: modal.id, ...payload })
    }

    const handleDelete = canal => {
        if (window.confirm(`Eliminar el canal ${canal.nombre}?`)) {
            eliminar.mutate(canal.id)
        }
    }

    return (
        <div className="page-body" style={{ overflowX: 'hidden' }}>
            <div className="mb-24" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, background: 'rgba(251,191,36,0.15)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <FolderTree size={20} style={{ color: '#fbbf24' }} />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Canales de venta</h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{totalRegistros} canales registrados</p>
                    </div>
                </div>
                <button className="btn btn-primary" onClick={() => setModal('nuevo')} style={{ flexShrink: 0 }}>
                    <Plus size={16} /> Nuevo Canal
                </button>
            </div>

            <div className="card mb-16" style={{ padding: '14px 20px', width: '100%', maxWidth: '100%' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div className="search-bar" style={{ flex: '1 1 320px', minWidth: 240 }}>
                        <Search size={16} />
                        <input placeholder="Buscar por nombre o descripcion..." value={buscar} onChange={event => setBuscar(event.target.value)} />
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
                        {error?.response?.data?.detail || 'No se pudieron cargar los canales.'}
                    </div>
                )}
            </div>

            <div className="card" style={{ padding: 0, width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
                {isLoading ? (
                    <div className="flex-center" style={{ padding: 60 }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>
                ) : canales.length === 0 ? (
                    <div className="empty-state"><FolderTree size={40} /><p>No hay canales para la busqueda.</p></div>
                ) : (
                    <div className="table-container" style={{ width: '100%', maxWidth: '100%', overflowX: 'auto' }}>
                        <table style={{ minWidth: 760, tableLayout: 'fixed' }}>
                            <thead>
                                <tr>
                                    <th style={{ width: 240 }}>Nombre</th>
                                    <th>Descripcion</th>
                                    <th style={{ width: 120 }}>Estado</th>
                                    <th style={{ width: 90 }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {canales.map(canal => (
                                    <tr key={canal.id}>
                                        <td style={{ fontWeight: 500, whiteSpace: 'normal', lineHeight: 1.25, wordBreak: 'break-word' }}>{canal.nombre}</td>
                                        <td style={{ color: 'var(--text-secondary)', whiteSpace: 'normal', lineHeight: 1.25, wordBreak: 'break-word' }}>{canal.descripcion || '—'}</td>
                                        <td><span className={`badge ${canal.activo ? 'badge-green' : 'badge-gray'}`}>{canal.activo ? 'ACTIVO' : 'INACTIVO'}</span></td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                                <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setModal(canal)} title="Editar">
                                                    <Edit2 size={14} />
                                                </button>
                                                <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDelete(canal)} title="Eliminar" disabled={eliminar.isPending}>
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
                    Mostrando pagina <strong>{page}</strong> de <strong>{totalPages}</strong> · <strong>{totalRegistros}</strong> canal{totalRegistros === 1 ? '' : 'es'} encontrados
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => setPage(prev => Math.max(1, prev - 1))} disabled={page <= 1}>Anterior</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setPage(prev => Math.min(totalPages, prev + 1))} disabled={page >= totalPages}>Siguiente</button>
                </div>
            </div>

            {modal && (
                <Modal title={modal === 'nuevo' ? 'Nuevo Canal de Venta' : `Editar: ${modal.nombre}`} onClose={() => setModal(null)} maxWidth="620px">
                    <CanalForm initial={modal !== 'nuevo' ? modal : {}} onSave={handleSave} onCancel={() => setModal(null)} loading={crear.isPending || editar.isPending} />
                </Modal>
            )}
        </div>
    )
}
