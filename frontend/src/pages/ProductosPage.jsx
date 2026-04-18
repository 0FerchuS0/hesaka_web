import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Edit2, Package, Plus, Search, Tag, ToggleLeft, ToggleRight } from 'lucide-react'

import Modal from '../components/Modal'
import { api } from '../context/AuthContext'

function fmt(value) {
    return new Intl.NumberFormat('es-PY').format(value ?? 0)
}

function normalizeSpaces(value) {
    return value.replace(/\s+/g, ' ').trim()
}

function stripKnownAttributes(name, attributes) {
    let baseName = name || ''
    attributes.forEach(attr => {
        const escaped = attr.nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        baseName = baseName.replace(new RegExp(`\\s*${escaped}\\s*`, 'gi'), ' ')
    })
    return normalizeSpaces(baseName)
}

function composeProductName(currentName, selectedIds, attributes) {
    const baseName = stripKnownAttributes(currentName, attributes)
    const selectedNames = attributes
        .filter(attr => selectedIds.includes(attr.id))
        .map(attr => attr.nombre)

    return normalizeSpaces(selectedNames.length > 0 ? `${baseName} ${selectedNames.join(' ')}` : baseName)
}

function orderCategorias(categories, parentId = null, level = 0) {
    const current = categories
        .filter(category => (category.categoria_padre_id ?? null) === parentId)
        .sort((a, b) => a.nombre.localeCompare(b.nombre))

    return current.flatMap(category => [
        { ...category, level },
        ...orderCategorias(categories, category.id, level + 1),
    ])
}

function ProductoForm({ initial = {}, onSave, onCancel, loading }) {
    const isEditing = Boolean(initial.id)
    const [formError, setFormError] = useState('')
    const [formData, setFormData] = useState({
        codigo: initial.codigo || '',
        nombre: initial.nombre || '',
        codigo_fabricante: initial.codigo_fabricante || '',
        marca_id: initial.marca_id ? String(initial.marca_id) : '',
        categoria_id: initial.categoria_id ? String(initial.categoria_id) : '',
        proveedor_id: initial.proveedor_id ? String(initial.proveedor_id) : '',
        precio_venta: initial.precio_venta ?? '',
        costo: initial.costo_variable ? 0 : (initial.costo ?? ''),
        costo_variable: Boolean(initial.costo_variable),
        stock_actual: initial.stock_actual ?? 0,
        impuesto: initial.impuesto ?? 10,
        descripcion: initial.descripcion || '',
        activo: initial.activo ?? true,
        bajo_pedido: Boolean(initial.bajo_pedido),
        atributos_ids: initial.atributos?.map(attr => attr.id) || [],
    })

    const setField = (key, value) => {
        setFormError('')
        setFormData(prev => ({ ...prev, [key]: value }))
    }

    const { data: categorias = [] } = useQuery({
        queryKey: ['categorias'],
        queryFn: () => api.get('/categorias/').then(response => response.data),
        retry: false,
    })

    const { data: proveedores = [] } = useQuery({
        queryKey: ['proveedores'],
        queryFn: () => api.get('/proveedores/').then(response => response.data),
        retry: false,
    })

    const { data: marcas = [] } = useQuery({
        queryKey: ['marcas'],
        queryFn: () => api.get('/marcas/').then(response => response.data),
        retry: false,
    })

    const { data: categoriaDetalle, isFetching: loadingAtributos } = useQuery({
        queryKey: ['categoria-atributos', formData.categoria_id],
        queryFn: () => api.get(`/categorias/${formData.categoria_id}/atributos`).then(response => response.data),
        enabled: Boolean(formData.categoria_id),
        retry: false,
    })

    const categoriasOrdenadas = useMemo(() => orderCategorias(categorias), [categorias])
    const atributosDisponibles = useMemo(() => {
        if (!categoriaDetalle) {
            return []
        }
        return [...categoriaDetalle.atributos_heredados, ...categoriaDetalle.atributos_propios]
    }, [categoriaDetalle])

    useEffect(() => {
        if (!categoriaDetalle || isEditing) {
            return
        }
        setFormData(prev => ({ ...prev, codigo: categoriaDetalle.codigo_sugerido || '' }))
    }, [categoriaDetalle, isEditing])

    useEffect(() => {
        if (!formData.costo_variable) {
            return
        }
        setFormData(prev => ({ ...prev, costo: 0 }))
    }, [formData.costo_variable])

    useEffect(() => {
        if (!categoriaDetalle) {
            return
        }

        setFormData(prev => {
            const validIds = new Set(atributosDisponibles.map(attr => attr.id))
            const filteredIds = prev.atributos_ids.filter(id => validIds.has(id))
            if (filteredIds.length === prev.atributos_ids.length) {
                return prev
            }
            return {
                ...prev,
                atributos_ids: filteredIds,
                nombre: composeProductName(prev.nombre, filteredIds, atributosDisponibles),
            }
        })
    }, [categoriaDetalle, atributosDisponibles])

    const toggleAtributo = atributoId => {
        setFormData(prev => {
            const alreadySelected = prev.atributos_ids.includes(atributoId)
            const nextIds = alreadySelected
                ? prev.atributos_ids.filter(id => id !== atributoId)
                : [...prev.atributos_ids, atributoId]

            return {
                ...prev,
                atributos_ids: nextIds,
                nombre: composeProductName(prev.nombre, nextIds, atributosDisponibles),
            }
        })
    }

    const handleCategoriaChange = event => {
        const nextCategoriaId = event.target.value
        setFormData(prev => ({
            ...prev,
            categoria_id: nextCategoriaId,
            atributos_ids: [],
        }))
    }

    const handleNombreChange = event => {
        setField('nombre', event.target.value)
    }

    const handleSubmit = event => {
        event.preventDefault()
        if (!formData.categoria_id) {
            setFormError('Debes seleccionar una categoria.')
            return
        }

        onSave({
            ...formData,
            marca_id: formData.marca_id ? parseInt(formData.marca_id, 10) : null,
            categoria_id: parseInt(formData.categoria_id, 10),
            proveedor_id: formData.proveedor_id ? parseInt(formData.proveedor_id, 10) : null,
            precio_venta: parseFloat(formData.precio_venta),
            costo: formData.costo_variable ? 0 : (formData.costo === '' ? null : parseFloat(formData.costo)),
            stock_actual: parseInt(formData.stock_actual, 10) || 0,
            impuesto: parseInt(formData.impuesto, 10) || 0,
        })
    }

    return (
        <form onSubmit={handleSubmit}>
            <div className="grid-2">
                <div className="form-group">
                    <label className="form-label">Codigo</label>
                    <input
                        className="form-input"
                        value={formData.codigo}
                        readOnly
                        placeholder="Se genera automaticamente"
                    />
                </div>
                <div className="form-group">
                    <label className="form-label">Cod. Fabricante</label>
                    <input
                        className="form-input"
                        value={formData.codigo_fabricante}
                        onChange={event => setField('codigo_fabricante', event.target.value)}
                        placeholder="Codigo de barras / fabricante"
                    />
                </div>
            </div>

            <div className="form-group">
                <label className="form-label">Nombre</label>
                <input
                    className="form-input"
                    value={formData.nombre}
                    onChange={handleNombreChange}
                    required
                    placeholder="Nombre base del producto"
                />
                {atributosDisponibles.length > 0 && (
                    <div style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        El nombre se completa automaticamente con los atributos seleccionados.
                    </div>
                )}
            </div>

            <div className="grid-2">
                <div className="form-group">
                    <label className="form-label">Categoria</label>
                    <select className="form-select" value={formData.categoria_id} onChange={handleCategoriaChange} required>
                        <option value="">Seleccionar...</option>
                        {categoriasOrdenadas.map(category => (
                            <option key={category.id} value={category.id}>
                                {`${'  '.repeat(category.level)}${category.level > 0 ? '- ' : ''}${category.nombre}`}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="form-group">
                    <label className="form-label">Proveedor</label>
                    <select
                        className="form-select"
                        value={formData.proveedor_id}
                        onChange={event => setField('proveedor_id', event.target.value)}
                    >
                        <option value="">Sin proveedor</option>
                        {proveedores.map(provider => (
                            <option key={provider.id} value={provider.id}>
                                {provider.nombre}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="form-group">
                    <label className="form-label">Marca</label>
                    <select
                        className="form-select"
                        value={formData.marca_id}
                        onChange={event => setField('marca_id', event.target.value)}
                    >
                        <option value="">Sin marca</option>
                        {marcas.map(marca => (
                            <option key={marca.id} value={marca.id}>
                                {marca.nombre}
                            </option>
                        ))}
                    </select>
                    <div style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        La marca se selecciona desde el catalogo de Marcas.
                    </div>
                </div>

                <div className="form-group">
                    <label className="form-label">Precio de Venta (Gs.)</label>
                    <input
                        className="form-input"
                        type="number"
                        value={formData.precio_venta}
                        onChange={event => setField('precio_venta', event.target.value)}
                        required
                        min="0"
                        step="100"
                    />
                </div>

                <div className="form-group">
                    <label className="form-label">Costo (Gs.)</label>
                    <input
                        className="form-input"
                        type="number"
                        value={formData.costo}
                        onChange={event => setField('costo', event.target.value)}
                        disabled={formData.costo_variable}
                        min="0"
                        step="100"
                        placeholder={formData.costo_variable ? 'Variable' : '0'}
                    />
                </div>

                <div className="form-group">
                    <label className="form-label">Stock actual</label>
                    <input
                        className="form-input"
                        type="number"
                        value={formData.stock_actual}
                        onChange={event => setField('stock_actual', event.target.value)}
                        min="0"
                    />
                </div>

                <div className="form-group">
                    <label className="form-label">IVA (%)</label>
                    <select
                        className="form-select"
                        value={formData.impuesto}
                        onChange={event => setField('impuesto', event.target.value)}
                    >
                        <option value={10}>10%</option>
                        <option value={5}>5%</option>
                        <option value={0}>Exenta (0%)</option>
                    </select>
                </div>
            </div>

            <div style={{ display: 'flex', gap: 20, marginBottom: 16, flexWrap: 'wrap' }}>
                {[
                    { key: 'costo_variable', label: 'Costo variable' },
                    { key: 'bajo_pedido', label: 'Bajo pedido' },
                    { key: 'activo', label: 'Activo' },
                ].map(({ key, label }) => (
                    <label
                        key={key}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.875rem' }}
                    >
                        <input
                            type="checkbox"
                            checked={Boolean(formData[key])}
                            onChange={event => setField(key, event.target.checked)}
                            style={{ width: 16, height: 16, accentColor: 'var(--primary-light)' }}
                        />
                        {label}
                    </label>
                ))}
            </div>

            <div className="form-group">
                <label className="form-label">Descripcion</label>
                <textarea
                    className="form-input"
                    rows={2}
                    value={formData.descripcion}
                    onChange={event => setField('descripcion', event.target.value)}
                    placeholder="Descripcion del producto..."
                    style={{ resize: 'vertical' }}
                />
            </div>

            <div className="card mb-16" style={{ padding: '14px 16px' }}>
                <div style={{ fontWeight: 600, marginBottom: 10 }}>Atributos</div>
                {!formData.categoria_id ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        Selecciona una categoria para ver los atributos disponibles.
                    </div>
                ) : loadingAtributos ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Cargando atributos...</div>
                ) : atributosDisponibles.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        Esta categoria no tiene atributos configurados todavia.
                    </div>
                ) : (
                    <div style={{ display: 'grid', gap: 14 }}>
                        {categoriaDetalle.atributos_heredados.length > 0 && (
                            <div>
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                                    Atributos heredados de la categoria padre
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                                    {categoriaDetalle.atributos_heredados.map(attr => (
                                        <label
                                            key={attr.id}
                                            style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)' }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={formData.atributos_ids.includes(attr.id)}
                                                onChange={() => toggleAtributo(attr.id)}
                                                style={{ accentColor: 'var(--primary-light)' }}
                                            />
                                            {attr.nombre}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}

                        {categoriaDetalle.atributos_propios.length > 0 && (
                            <div>
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                                    Atributos propios de esta categoria
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                                    {categoriaDetalle.atributos_propios.map(attr => (
                                        <label
                                            key={attr.id}
                                            style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)' }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={formData.atributos_ids.includes(attr.id)}
                                                onChange={() => toggleAtributo(attr.id)}
                                                style={{ accentColor: 'var(--primary-light)' }}
                                            />
                                            {attr.nombre}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {formError && (
                <div style={{ color: 'var(--danger)', marginBottom: 12, fontSize: '0.9rem' }}>
                    {formError}
                </div>
            )}

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

export default function ProductosPage() {
    const queryClient = useQueryClient()
    const [buscar, setBuscar] = useState('')
    const [buscarDebounced, setBuscarDebounced] = useState('')
    const [categoriaFiltro, setCategoriaFiltro] = useState('')
    const [marcaFiltro, setMarcaFiltro] = useState('')
    const [modal, setModal] = useState(null)
    const [soloActivos, setSoloActivos] = useState(true)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(25)

    useEffect(() => {
        const timer = setTimeout(() => setBuscarDebounced(buscar.trim()), 350)
        return () => clearTimeout(timer)
    }, [buscar])

    useEffect(() => {
        setPage(1)
    }, [buscarDebounced, categoriaFiltro, marcaFiltro, soloActivos, pageSize])

    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['productos-optimizado', buscarDebounced, categoriaFiltro, marcaFiltro, soloActivos, page, pageSize],
        queryFn: () => {
            const params = new URLSearchParams({
                page: String(page),
                page_size: String(pageSize),
                solo_activos: soloActivos,
            })
            if (buscarDebounced) {
                params.append('buscar', buscarDebounced)
            }
            if (categoriaFiltro) {
                params.append('categoria_id', categoriaFiltro)
            }
            if (marcaFiltro) {
                params.append('marca_id', marcaFiltro)
            }
            return api.get(`/productos/listado-optimizado?${params.toString()}`).then(response => response.data)
        },
        retry: false,
    })

    const productos = data?.items || []
    const totalRegistros = data?.total || 0
    const totalPages = data?.total_pages || 1

    const { data: categorias = [] } = useQuery({
        queryKey: ['categorias'],
        queryFn: () => api.get('/categorias/').then(response => response.data),
        retry: false,
    })

    const { data: marcas = [] } = useQuery({
        queryKey: ['marcas'],
        queryFn: () => api.get('/marcas/').then(response => response.data),
        retry: false,
    })

    const editingProductId = modal && modal !== 'nuevo' ? modal.id : null
    const {
        data: editingProductDetail,
        isFetching: isFetchingEditingProduct,
    } = useQuery({
        queryKey: ['producto-detalle', editingProductId],
        queryFn: () => api.get(`/productos/${editingProductId}`).then(response => response.data),
        enabled: Boolean(editingProductId),
        retry: false,
        staleTime: 30000,
    })

    const categoriasOrdenadas = useMemo(() => orderCategorias(categorias), [categorias])

    const crear = useMutation({
        mutationFn: payload => api.post('/productos/', payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['productos'] })
            queryClient.invalidateQueries({ queryKey: ['productos-optimizado'] })
            queryClient.invalidateQueries({ queryKey: ['producto-detalle'] })
            setModal(null)
        },
    })

    const editar = useMutation({
        mutationFn: ({ id, ...payload }) => api.put(`/productos/${id}`, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['productos'] })
            queryClient.invalidateQueries({ queryKey: ['productos-optimizado'] })
            queryClient.invalidateQueries({ queryKey: ['producto-detalle'] })
            setModal(null)
        },
    })

    const desactivar = useMutation({
        mutationFn: id => api.delete(`/productos/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['productos'] })
            queryClient.invalidateQueries({ queryKey: ['productos-optimizado'] })
        },
    })

    const handleSave = form => {
        if (modal === 'nuevo') {
            crear.mutate(form)
            return
        }
        editar.mutate({ id: modal.id, ...form })
    }

    const margenColor = producto => {
        if (!producto.costo || producto.costo === 0) {
            return 'var(--text-muted)'
        }
        const margen = ((producto.precio_venta - producto.costo) / producto.precio_venta) * 100
        if (margen > 40) {
            return 'var(--success)'
        }
        if (margen > 20) {
            return 'var(--warning)'
        }
        return 'var(--danger)'
    }

    const margen = producto => {
        if (!producto.costo || producto.costo === 0) {
            return '-'
        }
        return `${(((producto.precio_venta - producto.costo) / producto.precio_venta) * 100).toFixed(0)}%`
    }

    return (
        <div className="page-body" style={{ overflowX: 'hidden' }}>
            <div className="mb-24" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, background: 'rgba(124,58,237,0.15)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Package size={20} style={{ color: '#a78bfa' }} />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Productos</h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{totalRegistros} productos encontrados</p>
                    </div>
                </div>
                <button className="btn btn-primary" onClick={() => setModal('nuevo')} style={{ flexShrink: 0 }}>
                    <Plus size={16} /> Nuevo Producto
                </button>
            </div>

            <div className="card mb-16" style={{ padding: '14px 20px', width: '100%', maxWidth: '100%' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div className="search-bar" style={{ flex: '1 1 280px', minWidth: 220 }}>
                        <Search size={16} />
                        <input placeholder="Buscar por nombre, codigo o marca..." value={buscar} onChange={event => setBuscar(event.target.value)} />
                    </div>
                    <select className="form-select" style={{ flex: '0 0 220px', width: 220 }} value={categoriaFiltro} onChange={event => setCategoriaFiltro(event.target.value)}>
                        <option value="">Todas las categorias</option>
                        {categoriasOrdenadas.map(category => (
                            <option key={category.id} value={category.id}>
                                {`${'  '.repeat(category.level)}${category.level > 0 ? '- ' : ''}${category.nombre}`}
                            </option>
                        ))}
                    </select>
                    <select className="form-select" style={{ flex: '0 0 200px', width: 200 }} value={marcaFiltro} onChange={event => setMarcaFiltro(event.target.value)}>
                        <option value="">Todas las marcas</option>
                        {marcas.map(marca => (
                            <option key={marca.id} value={marca.id}>
                                {marca.nombre}
                            </option>
                        ))}
                    </select>
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
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.875rem', whiteSpace: 'nowrap' }}>
                        <input type="checkbox" checked={soloActivos} onChange={event => setSoloActivos(event.target.checked)} style={{ accentColor: 'var(--primary-light)' }} />
                        Solo activos
                    </label>
                </div>
                {isError && (
                    <div style={{ marginTop: 10, background: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 12px', fontSize: '0.84rem' }}>
                        {error?.response?.data?.detail || 'No se pudieron cargar los productos con el listado optimizado.'}
                    </div>
                )}
            </div>

            <div className="card" style={{ padding: 0, width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
                {isLoading ? (
                    <div className="flex-center" style={{ padding: 60 }}>
                        <div className="spinner" style={{ width: 32, height: 32 }} />
                    </div>
                ) : productos.length === 0 ? (
                    <div className="empty-state">
                        <Package size={40} />
                        <p>No hay productos para la busqueda.</p>
                    </div>
                ) : (
                    <div className="table-container" style={{ width: '100%', maxWidth: '100%', overflowX: 'auto' }}>
                        <table style={{ minWidth: 1180, tableLayout: 'fixed' }}>
                            <thead>
                                <tr>
                                    <th style={{ width: 120 }}>Codigo</th>
                                    <th style={{ width: 320 }}>Nombre</th>
                                    <th style={{ width: 160 }}>Marca</th>
                                    <th style={{ width: 180 }}>Categoria</th>
                                    <th style={{ width: 120 }}>Precio</th>
                                    <th style={{ width: 120 }}>Costo</th>
                                    <th style={{ width: 90 }}>Margen</th>
                                    <th style={{ width: 80 }}>Stock</th>
                                    <th style={{ width: 70 }}>IVA</th>
                                    <th style={{ width: 120 }}>Estado</th>
                                    <th style={{ width: 110 }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {productos.map(producto => (
                                    <tr key={producto.id}>
                                        <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'normal', lineHeight: 1.25, wordBreak: 'break-word' }}>{producto.codigo}</td>
                                        <td style={{ fontWeight: 500 }}>
                                            <div>{producto.nombre}</div>
                                            {producto.codigo_fabricante && (
                                                <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>{producto.codigo_fabricante}</div>
                                            )}
                                            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                                                {producto.costo_variable && <span className="badge badge-gray">Costo variable</span>}
                                                {producto.bajo_pedido && <span className="badge badge-blue">Bajo pedido</span>}
                                            </div>
                                        </td>
                                        <td style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
                                            <div style={{ whiteSpace: 'normal', lineHeight: 1.25, wordBreak: 'break-word' }}>{producto.marca || '-'}</div>
                                        </td>
                                        <td>
                                            <span className="badge badge-blue" style={{ fontSize: '0.7rem', whiteSpace: 'normal', lineHeight: 1.25, wordBreak: 'break-word' }}>
                                                <Tag size={10} style={{ marginRight: 4 }} />
                                                {producto.categoria_nombre || '-'}
                                            </span>
                                        </td>
                                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Gs. {fmt(producto.precio_venta)}</td>
                                        <td style={{ color: 'var(--text-secondary)' }}>
                                            {producto.costo ? `Gs. ${fmt(producto.costo)}` : '-'}
                                        </td>
                                        <td style={{ fontWeight: 600, color: margenColor(producto) }}>{margen(producto)}</td>
                                        <td>
                                            <span style={{ color: producto.stock_actual <= 0 ? 'var(--danger)' : producto.stock_actual < 5 ? 'var(--warning)' : 'var(--success)', fontWeight: 600 }}>
                                                {producto.stock_actual}
                                            </span>
                                        </td>
                                        <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{producto.impuesto}%</td>
                                        <td>
                                            <span className={`badge ${producto.activo ? 'badge-green' : 'badge-gray'}`}>
                                                {producto.activo ? 'Activo' : 'Inactivo'}
                                            </span>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setModal(producto)} title="Editar">
                                                    <Edit2 size={13} />
                                                </button>
                                                <button
                                                    className="btn btn-danger btn-sm btn-icon"
                                                    onClick={() => desactivar.mutate(producto.id)}
                                                    title={producto.activo ? 'Desactivar' : 'Ya inactivo'}
                                                    disabled={!producto.activo}
                                                >
                                                    {producto.activo ? <ToggleLeft size={13} /> : <ToggleRight size={13} />}
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
                    Mostrando pagina <strong>{page}</strong> de <strong>{totalPages}</strong> · <strong>{totalRegistros}</strong> producto{totalRegistros === 1 ? '' : 's'} encontrados
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
                <Modal title={modal === 'nuevo' ? 'Nuevo Producto' : `Editar: ${modal.nombre}`} onClose={() => setModal(null)} maxWidth="760px">
                    {modal !== 'nuevo' && isFetchingEditingProduct && !editingProductDetail ? (
                        <div className="flex-center" style={{ padding: 40 }}>
                            <div className="spinner" style={{ width: 28, height: 28 }} />
                        </div>
                    ) : (
                        <ProductoForm
                            key={modal === 'nuevo' ? 'nuevo' : `edit-${editingProductId}`}
                            initial={modal !== 'nuevo' ? (editingProductDetail || modal) : {}}
                            onSave={handleSave}
                            onCancel={() => setModal(null)}
                            loading={crear.isPending || editar.isPending}
                        />
                    )}
                </Modal>
            )}
        </div>
    )
}
