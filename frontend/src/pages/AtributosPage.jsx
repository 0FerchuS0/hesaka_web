import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderTree, Layers3, Plus, Trash2 } from 'lucide-react'

import { api } from '../context/AuthContext'

function orderCategorias(categories, parentId = null, level = 0) {
    const current = categories
        .filter(category => (category.categoria_padre_id ?? null) === parentId)
        .sort((a, b) => a.nombre.localeCompare(b.nombre))

    return current.flatMap(category => [
        { ...category, level },
        ...orderCategorias(categories, category.id, level + 1),
    ])
}

export default function AtributosPage() {
    const queryClient = useQueryClient()
    const [categoriaId, setCategoriaId] = useState('')
    const [nuevoAtributo, setNuevoAtributo] = useState('')
    const [atributoExistenteId, setAtributoExistenteId] = useState('')

    const { data: categorias = [] } = useQuery({
        queryKey: ['categorias'],
        queryFn: () => api.get('/categorias/').then(response => response.data),
        retry: false,
    })

    const { data: atributos = [] } = useQuery({
        queryKey: ['atributos'],
        queryFn: () => api.get('/atributos/').then(response => response.data),
        retry: false,
    })

    const { data: categoriaDetalle, isLoading: loadingDetalle } = useQuery({
        queryKey: ['categoria-atributos-admin', categoriaId],
        queryFn: () => api.get(`/categorias/${categoriaId}/atributos`).then(response => response.data),
        enabled: Boolean(categoriaId),
        retry: false,
    })

    const categoriasOrdenadas = useMemo(() => orderCategorias(categorias), [categorias])
    const atributosAsignadosIds = useMemo(() => {
        if (!categoriaDetalle) {
            return new Set()
        }
        return new Set([
            ...categoriaDetalle.atributos_heredados.map(attr => attr.id),
            ...categoriaDetalle.atributos_propios.map(attr => attr.id),
        ])
    }, [categoriaDetalle])

    const atributosDisponibles = useMemo(
        () => atributos.filter(attr => !atributosAsignadosIds.has(attr.id)),
        [atributos, atributosAsignadosIds],
    )

    const refreshCategoria = () => {
        queryClient.invalidateQueries({ queryKey: ['atributos'] })
        queryClient.invalidateQueries({ queryKey: ['categoria-atributos'] })
        queryClient.invalidateQueries({ queryKey: ['categoria-atributos-admin'] })
    }

    const crearYAsignar = useMutation({
        mutationFn: payload => api.post(`/categorias/${categoriaId}/atributos`, payload),
        onSuccess: () => {
            setNuevoAtributo('')
            refreshCategoria()
        },
    })

    const vincularExistente = useMutation({
        mutationFn: atributoId => api.post(`/categorias/${categoriaId}/atributos/${atributoId}`),
        onSuccess: () => {
            setAtributoExistenteId('')
            refreshCategoria()
        },
    })

    const quitar = useMutation({
        mutationFn: atributoId => api.delete(`/categorias/${categoriaId}/atributos/${atributoId}`),
        onSuccess: refreshCategoria,
    })

    const handleCrear = event => {
        event.preventDefault()
        if (!categoriaId || !nuevoAtributo.trim()) {
            return
        }
        crearYAsignar.mutate({ nombre: nuevoAtributo })
    }

    const handleAsignarExistente = event => {
        event.preventDefault()
        if (!categoriaId || !atributoExistenteId) {
            return
        }
        vincularExistente.mutate(atributoExistenteId)
    }

    return (
        <div className="page-body">
            <div className="flex-between mb-24">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, background: 'rgba(124,58,237,0.15)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Layers3 size={20} style={{ color: '#a78bfa' }} />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Atributos</h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            Administra los atributos que usa el modal de productos
                        </p>
                    </div>
                </div>
            </div>

            <div className="card mb-16">
                <div className="grid-2">
                    <div className="form-group">
                        <label className="form-label">Categoria o Subcategoria</label>
                        <select className="form-select" value={categoriaId} onChange={event => setCategoriaId(event.target.value)}>
                            <option value="">Seleccionar...</option>
                            {categoriasOrdenadas.map(category => (
                                <option key={category.id} value={category.id}>
                                    {`${'  '.repeat(category.level)}${category.level > 0 ? '- ' : ''}${category.nombre}`}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Vista actual</label>
                        <div className="form-input" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <FolderTree size={16} />
                            {categoriaDetalle ? categoriaDetalle.categoria_nombre : 'Selecciona una categoria para comenzar'}
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid-2">
                <div className="card">
                    <div style={{ fontWeight: 700, marginBottom: 14 }}>Crear y asignar atributo</div>
                    <form onSubmit={handleCrear}>
                        <div className="form-group">
                            <label className="form-label">Nuevo atributo</label>
                            <input
                                className="form-input"
                                value={nuevoAtributo}
                                onChange={event => setNuevoAtributo(event.target.value)}
                                placeholder="Ej: BLUECUT, 1.56, POLARIZADO"
                                disabled={!categoriaId}
                            />
                        </div>
                        <button className="btn btn-primary" type="submit" disabled={!categoriaId || crearYAsignar.isPending}>
                            <Plus size={16} /> Agregar atributo
                        </button>
                    </form>
                </div>

                <div className="card">
                    <div style={{ fontWeight: 700, marginBottom: 14 }}>Asignar atributo existente</div>
                    <form onSubmit={handleAsignarExistente}>
                        <div className="form-group">
                            <label className="form-label">Atributo disponible</label>
                            <select
                                className="form-select"
                                value={atributoExistenteId}
                                onChange={event => setAtributoExistenteId(event.target.value)}
                                disabled={!categoriaId}
                            >
                                <option value="">Seleccionar...</option>
                                {atributosDisponibles.map(attr => (
                                    <option key={attr.id} value={attr.id}>
                                        {attr.nombre}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <button className="btn btn-secondary" type="submit" disabled={!categoriaId || !atributoExistenteId || vincularExistente.isPending}>
                            <Plus size={16} /> Vincular existente
                        </button>
                    </form>
                </div>
            </div>

            <div className="grid-2" style={{ marginTop: 16 }}>
                <div className="card">
                    <div style={{ fontWeight: 700, marginBottom: 14 }}>Atributos heredados</div>
                    {!categoriaId ? (
                        <div className="empty-state" style={{ padding: '36px 20px' }}>
                            <p>Selecciona una categoria.</p>
                        </div>
                    ) : loadingDetalle ? (
                        <div className="flex-center" style={{ padding: 30 }}>
                            <div className="spinner" style={{ width: 28, height: 28 }} />
                        </div>
                    ) : categoriaDetalle.atributos_heredados.length === 0 ? (
                        <div className="empty-state" style={{ padding: '36px 20px' }}>
                            <p>No hay atributos heredados.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                            {categoriaDetalle.atributos_heredados.map(attr => (
                                <span key={attr.id} className="badge badge-gray">{attr.nombre}</span>
                            ))}
                        </div>
                    )}
                </div>

                <div className="card">
                    <div style={{ fontWeight: 700, marginBottom: 14 }}>Atributos propios</div>
                    {!categoriaId ? (
                        <div className="empty-state" style={{ padding: '36px 20px' }}>
                            <p>Selecciona una categoria.</p>
                        </div>
                    ) : loadingDetalle ? (
                        <div className="flex-center" style={{ padding: 30 }}>
                            <div className="spinner" style={{ width: 28, height: 28 }} />
                        </div>
                    ) : categoriaDetalle.atributos_propios.length === 0 ? (
                        <div className="empty-state" style={{ padding: '36px 20px' }}>
                            <p>No hay atributos propios asignados.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gap: 10 }}>
                            {categoriaDetalle.atributos_propios.map(attr => (
                                <div key={attr.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 12, background: 'rgba(255,255,255,0.02)' }}>
                                    <span style={{ fontWeight: 500 }}>{attr.nombre}</span>
                                    <button
                                        className="btn btn-danger btn-sm btn-icon"
                                        onClick={() => quitar.mutate(attr.id)}
                                        disabled={quitar.isPending}
                                        title="Quitar atributo"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
