import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Edit2, Package, PackagePlus, Plus, Trash2, X } from 'lucide-react'

import Modal from '../components/Modal'
import { api } from '../context/AuthContext'

function fmtGs(value) {
    return new Intl.NumberFormat('es-PY').format(Number(value || 0))
}

function orderCategoriasPaquete(categories, parentId = null, level = 0) {
    return categories
        .filter(category => (category.categoria_padre_id ?? null) === parentId)
        .flatMap(category => [
            { ...category, nivel: level },
            ...orderCategoriasPaquete(categories, category.id, level + 1),
        ])
}

// Buscador chico de producto por nombre — devuelve el producto elegido via onSelect
function ProductoBuscador({ value, onSelect, onRemove }) {
    const [buscar, setBuscar] = useState('')
    const [showList, setShowList] = useState(false)
    const [categoriaId, setCategoriaId] = useState('')
    const [proveedorId, setProveedorId] = useState('')

    const { data: categorias = [] } = useQuery({
        queryKey: ['categorias'],
        queryFn: () => api.get('/categorias/').then(r => r.data),
    })
    const { data: proveedores = [] } = useQuery({
        queryKey: ['proveedores'],
        queryFn: () => api.get('/proveedores/').then(r => r.data),
    })
    const categoriasOrdenadas = orderCategoriasPaquete(categorias)

    const { data: opciones = [] } = useQuery({
        queryKey: ['paquete-producto-buscador', buscar, categoriaId, proveedorId],
        queryFn: () => {
            const params = new URLSearchParams({ page: '1', page_size: '20', solo_activos: 'true' })
            if (buscar.trim()) params.append('buscar', buscar.trim())
            if (categoriaId) params.append('categoria_id', categoriaId)
            if (proveedorId) params.append('proveedor_id', proveedorId)
            return api.get(`/productos/listado-optimizado?${params.toString()}`).then(r => r.data.items || [])
        },
        enabled: showList,
        retry: false,
    })

    return (
        <div style={{ position: 'relative', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
                {value ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 10px' }}>
                        <span style={{ flex: 1, fontSize: '0.86rem' }}>{value.nombre}</span>
                        <span style={{ fontSize: '0.78rem', color: 'var(--success)', fontWeight: 600 }}>Gs. {fmtGs(value.precio_venta)}</span>
                    </div>
                ) : (
                    <>
                        <input
                            className="form-input"
                            placeholder="Buscar producto..."
                            value={buscar}
                            onFocus={() => setShowList(true)}
                            onChange={e => { setBuscar(e.target.value); setShowList(true) }}
                        />
                        {showList && (
                            <div
                                style={{ position: 'absolute', zIndex: 999, top: '100%', left: 0, right: 0, background: '#1a1d27', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, maxHeight: 300, overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.7)' }}
                                onMouseDown={e => { if (e.target.tagName !== 'SELECT') e.preventDefault() }}
                            >
                                <div style={{ display: 'flex', gap: 4, padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                    <select className="form-select" style={{ flex: 1, padding: '4px 6px', fontSize: '0.74rem' }} value={categoriaId} onChange={e => setCategoriaId(e.target.value)}>
                                        <option value="">Todas las categorías</option>
                                        {categoriasOrdenadas.map(cat => (
                                            <option key={cat.id} value={cat.id}>{'—'.repeat(cat.nivel)} {cat.nombre}</option>
                                        ))}
                                    </select>
                                    <select className="form-select" style={{ flex: 1, padding: '4px 6px', fontSize: '0.74rem' }} value={proveedorId} onChange={e => setProveedorId(e.target.value)}>
                                        <option value="">Todos los proveedores</option>
                                        {proveedores.map(prov => (
                                            <option key={prov.id} value={prov.id}>{prov.nombre}</option>
                                        ))}
                                    </select>
                                </div>
                                {opciones.length === 0 ? (
                                    <div style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Sin resultados</div>
                                ) : opciones.map(prod => (
                                    <div
                                        key={prod.id}
                                        onClick={() => { onSelect(prod); setBuscar(''); setShowList(false) }}
                                        style={{ padding: '9px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.12)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <span style={{ fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prod.nombre}</span>
                                        <span style={{ fontSize: '0.76rem', color: 'var(--success)', fontWeight: 600, flexShrink: 0 }}>Gs. {fmtGs(prod.precio_venta)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
            <button type="button" className="btn btn-danger btn-sm btn-icon" onClick={onRemove} title="Quitar producto" style={{ flexShrink: 0 }}>
                <X size={13} />
            </button>
        </div>
    )
}

function PaqueteVentaForm({ initial = {}, onSave, onCancel, loading }) {
    const [nombre, setNombre] = useState(initial.nombre || '')
    const [activo, setActivo] = useState(initial.activo ?? true)
    const [items, setItems] = useState(initial.items && initial.items.length > 0 ? initial.items : [null])

    const setItemAt = (idx, producto) => setItems(prev => prev.map((it, i) => (i === idx ? producto : it)))
    const removeItemAt = idx => setItems(prev => prev.filter((_, i) => i !== idx))
    const addItem = () => setItems(prev => [...prev, null])

    const itemsValidos = items.filter(Boolean)

    const handleSubmit = event => {
        event.preventDefault()
        if (!nombre.trim() || itemsValidos.length === 0) return
        onSave({
            nombre: nombre.trim(),
            activo,
            producto_ids: itemsValidos.map(it => it.id),
        })
    }

    return (
        <form onSubmit={handleSubmit}>
            <div className="form-group">
                <label className="form-label">Nombre del paquete *</label>
                <input className="form-input" value={nombre} onChange={e => setNombre(e.target.value)} required placeholder="Ej: Monofocal Foto Blue AR Metal" />
            </div>

            <div className="form-group">
                <label className="form-label">Productos del paquete *</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {items.map((item, idx) => (
                        <ProductoBuscador
                            key={idx}
                            value={item}
                            onSelect={prod => setItemAt(idx, prod)}
                            onRemove={() => removeItemAt(idx)}
                        />
                    ))}
                </div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={addItem} style={{ marginTop: 10 }}>
                    <Plus size={14} /> Agregar producto
                </button>
                {itemsValidos.length === 0 && (
                    <div style={{ color: '#fbbf24', fontSize: '0.78rem', marginTop: 6 }}>
                        El paquete necesita al menos un producto (cristal, armazón, consulta, etc.).
                    </div>
                )}
            </div>

            <div className="form-group">
                <label className="form-label">Estado</label>
                <select className="form-select" value={String(activo)} onChange={e => setActivo(e.target.value === 'true')}>
                    <option value="true">Activo</option>
                    <option value="false">Inactivo</option>
                </select>
            </div>

            <div className="flex gap-12" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={loading || !nombre.trim() || itemsValidos.length === 0}>
                    {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Guardar'}
                </button>
            </div>
        </form>
    )
}

export default function PaquetesVentaPage() {
    const queryClient = useQueryClient()
    const [modal, setModal] = useState(null)

    const { data: paquetes = [], isLoading, isError, error } = useQuery({
        queryKey: ['paquetes-venta-admin'],
        queryFn: () => api.get('/presupuestos/paquetes-venta').then(r => r.data),
    })

    const invalidar = () => {
        queryClient.invalidateQueries({ queryKey: ['paquetes-venta-admin'] })
        queryClient.invalidateQueries({ queryKey: ['paquetes-venta-select'] })
    }

    const crear = useMutation({
        mutationFn: payload => api.post('/presupuestos/paquetes-venta', payload),
        onSuccess: () => { invalidar(); setModal(null) },
    })

    const editar = useMutation({
        mutationFn: ({ id, ...payload }) => api.put(`/presupuestos/paquetes-venta/${id}`, payload),
        onSuccess: () => { invalidar(); setModal(null) },
    })

    const eliminar = useMutation({
        mutationFn: id => api.delete(`/presupuestos/paquetes-venta/${id}`),
        onSuccess: invalidar,
    })

    const handleSave = payload => {
        if (modal === 'nuevo') {
            crear.mutate(payload)
            return
        }
        editar.mutate({ id: modal.id, ...payload })
    }

    const handleDelete = paquete => {
        if (window.confirm(`Eliminar el paquete "${paquete.nombre}"?`)) {
            eliminar.mutate(paquete.id)
        }
    }

    const mutationError = crear.error || editar.error

    return (
        <div className="page-body">
            <div className="mb-24" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 44, height: 44, background: 'rgba(96,165,250,0.15)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <PackagePlus size={22} style={{ color: '#60a5fa' }} />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Paquetes de venta</h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                            Combinaciones de productos (cristal, armazón, consulta, etc.) para armar presupuestos en un solo paso.
                        </p>
                    </div>
                </div>
                <button className="btn btn-primary" onClick={() => setModal('nuevo')}>
                    <Plus size={16} /> Nuevo Paquete
                </button>
            </div>

            {isError && (
                <div className="card mb-16" style={{ border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.1)', color: '#fca5a5', fontSize: '0.84rem' }}>
                    {error?.response?.data?.detail || 'No se pudieron cargar los paquetes de venta.'}
                </div>
            )}

            <div className="card" style={{ padding: 0 }}>
                {isLoading ? (
                    <div className="flex-center" style={{ padding: 60 }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>
                ) : paquetes.length === 0 ? (
                    <div className="empty-state"><Package size={40} /><p>Todavía no creaste ningún paquete de venta.</p></div>
                ) : (
                    <div className="table-container" style={{ overflowX: 'auto' }}>
                        <table style={{ minWidth: 900 }}>
                            <thead>
                                <tr>
                                    <th>Nombre</th>
                                    <th>Productos</th>
                                    <th style={{ width: 100 }}>Estado</th>
                                    <th style={{ width: 90 }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paquetes.map(paquete => (
                                    <tr key={paquete.id}>
                                        <td style={{ fontWeight: 600 }}>{paquete.nombre}</td>
                                        <td style={{ color: 'var(--text-secondary)' }}>
                                            {paquete.items.map(item => item.nombre).join(' + ')}
                                        </td>
                                        <td><span className={`badge ${paquete.activo ? 'badge-green' : 'badge-gray'}`}>{paquete.activo ? 'ACTIVO' : 'INACTIVO'}</span></td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                                <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setModal(paquete)} title="Editar">
                                                    <Edit2 size={14} />
                                                </button>
                                                <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDelete(paquete)} title="Eliminar" disabled={eliminar.isPending}>
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
                <Modal title={modal === 'nuevo' ? 'Nuevo Paquete de Venta' : `Editar: ${modal.nombre}`} onClose={() => setModal(null)} maxWidth="560px">
                    <PaqueteVentaForm initial={modal !== 'nuevo' ? modal : {}} onSave={handleSave} onCancel={() => setModal(null)} loading={crear.isPending || editar.isPending} />
                    {mutationError && (
                        <div style={{ color: '#f87171', fontSize: '0.82rem', marginTop: 12 }}>
                            {mutationError?.response?.data?.detail || 'No se pudo guardar el paquete de venta.'}
                        </div>
                    )}
                </Modal>
            )}
        </div>
    )
}
