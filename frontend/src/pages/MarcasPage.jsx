import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Edit2, Plus, Tag, Trash2 } from 'lucide-react'

import Modal from '../components/Modal'
import { api } from '../context/AuthContext'

function MarcaForm({ initial = {}, onSave, onCancel, loading }) {
    const [nombre, setNombre] = useState(initial.nombre || '')

    return (
        <form onSubmit={event => {
            event.preventDefault()
            onSave({ nombre })
        }}>
            <div className="form-group">
                <label className="form-label">Nombre *</label>
                <input
                    className="form-input"
                    value={nombre}
                    onChange={event => setNombre(event.target.value)}
                    required
                    placeholder="Ej: ESSILOR"
                />
            </div>

            <div className="flex gap-12" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={onCancel}>
                    Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                    {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Guardar'}
                </button>
            </div>
        </form>
    )
}

export default function MarcasPage() {
    const queryClient = useQueryClient()
    const [modal, setModal] = useState(null)

    const { data: marcas = [], isLoading } = useQuery({
        queryKey: ['marcas'],
        queryFn: () => api.get('/marcas/').then(response => response.data),
        retry: false,
    })

    const crear = useMutation({
        mutationFn: payload => api.post('/marcas/', payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['marcas'] })
            queryClient.invalidateQueries({ queryKey: ['productos'] })
            setModal(null)
        },
    })

    const editar = useMutation({
        mutationFn: ({ id, ...payload }) => api.put(`/marcas/${id}`, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['marcas'] })
            queryClient.invalidateQueries({ queryKey: ['productos'] })
            setModal(null)
        },
    })

    const eliminar = useMutation({
        mutationFn: id => api.delete(`/marcas/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['marcas'] })
            queryClient.invalidateQueries({ queryKey: ['productos'] })
        },
    })

    const handleSave = formData => {
        if (modal === 'nuevo') {
            crear.mutate(formData)
            return
        }
        editar.mutate({ id: modal.id, ...formData })
    }

    const handleDelete = marca => {
        if (window.confirm(`Eliminar la marca ${marca.nombre}?`)) {
            eliminar.mutate(marca.id)
        }
    }

    const errorMsg =
        crear.error?.response?.data?.detail ||
        editar.error?.response?.data?.detail ||
        eliminar.error?.response?.data?.detail

    return (
        <div className="page-body">
            <div className="flex-between mb-24">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, background: 'rgba(245,158,11,0.15)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Tag size={20} style={{ color: '#f59e0b' }} />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Marcas</h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{marcas.length} marcas registradas</p>
                    </div>
                </div>
                <button className="btn btn-primary" onClick={() => setModal('nuevo')}>
                    <Plus size={16} /> Nueva Marca
                </button>
            </div>

            <div className="card" style={{ padding: 0 }}>
                {isLoading ? (
                    <div className="flex-center" style={{ padding: 60 }}>
                        <div className="spinner" style={{ width: 32, height: 32 }} />
                    </div>
                ) : marcas.length === 0 ? (
                    <div className="empty-state">
                        <Tag size={40} />
                        <p>No hay marcas registradas.</p>
                    </div>
                ) : (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Nombre</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {marcas.map(marca => (
                                    <tr key={marca.id}>
                                        <td style={{ fontWeight: 500 }}>{marca.nombre}</td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                                <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setModal(marca)} title="Editar">
                                                    <Edit2 size={14} />
                                                </button>
                                                <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDelete(marca)} title="Eliminar" disabled={eliminar.isPending}>
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
                    title={modal === 'nuevo' ? 'Nueva Marca' : `Editar: ${modal.nombre}`}
                    onClose={() => setModal(null)}
                    maxWidth="560px"
                >
                    <MarcaForm
                        initial={modal !== 'nuevo' ? modal : {}}
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
