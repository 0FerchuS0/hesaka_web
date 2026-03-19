import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../context/AuthContext'
import Modal from '../components/Modal'
import { FolderTree, Plus, Edit2, Trash2, Folder, FileText } from 'lucide-react'

function CategoriaForm({ initial = {}, categorias = [], onSave, onCancel, loading }) {
    const [f, setF] = useState({
        nombre: '',
        descripcion: '',
        ...initial,
        categoria_padre_id: initial.categoria_padre_id ?? '',
    })

    const set = (k, v) => setF(prev => ({ ...prev, [k]: v }))
    const prefijoPreview = (f.nombre || '').trim().toUpperCase().slice(0, 4)

    return (
        <form onSubmit={e => {
            e.preventDefault()
            onSave({
                nombre: f.nombre,
                prefijo: prefijoPreview,
                descripcion: f.descripcion || null,
                categoria_padre_id: f.categoria_padre_id ? parseInt(f.categoria_padre_id, 10) : null,
            })
        }}>
            <div className="form-group">
                <label className="form-label">Nombre *</label>
                <input className="form-input" value={f.nombre} onChange={e => set('nombre', e.target.value)} required placeholder="Ej: ARMAZONES" />
            </div>
            <div className="form-group">
                <label className="form-label">Prefijo</label>
                <input className="form-input" value={prefijoPreview} disabled placeholder="Se genera automáticamente" />
            </div>
            <div className="form-group">
                <label className="form-label">Categoría padre</label>
                <select className="form-select" value={f.categoria_padre_id} onChange={e => set('categoria_padre_id', e.target.value)}>
                    <option value="">Sin categoría padre</option>
                    {categorias
                        .filter(cat => !initial.id || cat.id !== initial.id)
                        .map(cat => (
                            <option key={cat.id} value={cat.id}>{cat.nombre}</option>
                        ))}
                </select>
            </div>
            <div className="form-group">
                <label className="form-label">Descripción</label>
                <textarea className="form-input" rows={3} value={f.descripcion || ''} onChange={e => set('descripcion', e.target.value)} placeholder="Descripción opcional..." style={{ resize: 'vertical' }} />
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

function buildTree(categorias) {
    const byParent = new Map()
    categorias.forEach(cat => {
        const key = cat.categoria_padre_id ?? 'root'
        if (!byParent.has(key)) byParent.set(key, [])
        byParent.get(key).push(cat)
    })
    byParent.forEach(list => list.sort((a, b) => a.nombre.localeCompare(b.nombre)))

    const walk = (parentId = 'root', level = 0) => {
        const nodes = byParent.get(parentId) || []
        return nodes.flatMap(cat => [
            { ...cat, level, hasChildren: (byParent.get(cat.id) || []).length > 0 },
            ...walk(cat.id, level + 1),
        ])
    }

    return walk()
}

export default function CategoriasPage() {
    const qc = useQueryClient()
    const [modal, setModal] = useState(null)

    const { data: categorias = [], isLoading } = useQuery({
        queryKey: ['categorias'],
        queryFn: () => api.get('/categorias/').then(r => r.data),
        retry: false,
    })

    const crear = useMutation({
        mutationFn: data => api.post('/categorias/', data),
        onSuccess: () => {
            qc.invalidateQueries(['categorias'])
            qc.invalidateQueries(['productos'])
            setModal(null)
        }
    })

    const editar = useMutation({
        mutationFn: ({ id, ...data }) => api.put(`/categorias/${id}`, data),
        onSuccess: () => {
            qc.invalidateQueries(['categorias'])
            qc.invalidateQueries(['productos'])
            setModal(null)
        }
    })

    const eliminar = useMutation({
        mutationFn: id => api.delete(`/categorias/${id}`),
        onSuccess: () => {
            qc.invalidateQueries(['categorias'])
            qc.invalidateQueries(['productos'])
        }
    })

    const handleSave = (data) => {
        if (modal === 'nuevo') crear.mutate(data)
        else editar.mutate({ id: modal.id, ...data })
    }

    const handleDelete = (cat) => {
        if (window.confirm(`Eliminar la categoría ${cat.nombre}?`)) {
            eliminar.mutate(cat.id)
        }
    }

    const tree = buildTree(categorias)
    const errorMsg =
        crear.error?.response?.data?.detail ||
        editar.error?.response?.data?.detail ||
        eliminar.error?.response?.data?.detail

    return (
        <div className="page-body">
            <div className="flex-between mb-24">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, background: 'rgba(16,185,129,0.15)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <FolderTree size={20} style={{ color: 'var(--success)' }} />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Categorías</h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{categorias.length} categorías registradas</p>
                    </div>
                </div>
                <button className="btn btn-primary" onClick={() => setModal('nuevo')}>
                    <Plus size={16} /> Nueva Categoría
                </button>
            </div>

            <div className="card" style={{ padding: 0 }}>
                {isLoading ? (
                    <div className="flex-center" style={{ padding: 60 }}>
                        <div className="spinner" style={{ width: 32, height: 32 }} />
                    </div>
                ) : tree.length === 0 ? (
                    <div className="empty-state">
                        <FolderTree size={40} />
                        <p>No hay categorías registradas.</p>
                    </div>
                ) : (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Categoría</th>
                                    <th>Prefijo</th>
                                    <th>Descripción</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {tree.map(cat => (
                                    <tr key={cat.id}>
                                        <td style={{ fontWeight: 500 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: `${cat.level * 28}px` }}>
                                                {cat.level === 0 ? <Folder size={16} /> : <FileText size={14} />}
                                                <span>{cat.nombre}</span>
                                            </div>
                                        </td>
                                        <td style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{cat.prefijo}</td>
                                        <td style={{ color: 'var(--text-secondary)' }}>{cat.descripcion || '—'}</td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                                <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setModal(cat)} title="Editar">
                                                    <Edit2 size={14} />
                                                </button>
                                                <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDelete(cat)} title="Eliminar" disabled={eliminar.isPending}>
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

            {modal && (
                <Modal
                    title={modal === 'nuevo' ? 'Nueva Categoría' : `Editar: ${modal.nombre}`}
                    onClose={() => setModal(null)}
                    maxWidth="620px"
                >
                    <CategoriaForm
                        initial={modal !== 'nuevo' ? modal : {}}
                        categorias={categorias}
                        onSave={handleSave}
                        onCancel={() => setModal(null)}
                        loading={crear.isPending || editar.isPending}
                    />
                    {errorMsg && (
                        <p style={{ color: 'var(--danger)', fontSize: '0.82rem', marginTop: 8 }}>
                            {errorMsg}
                        </p>
                    )}
                </Modal>
            )}
        </div>
    )
}
