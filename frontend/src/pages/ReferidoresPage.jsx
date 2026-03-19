import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Coins, Edit2, Percent, Plus, Search, Trash2, UserRoundPlus } from 'lucide-react'

import Modal from '../components/Modal'
import { api } from '../context/AuthContext'

function ReferidorForm({ initial = {}, onSave, onCancel, loading }) {
    const [form, setForm] = useState({
        nombre: '',
        telefono: '',
        tipo_comision: 'FIJA',
        valor_comision: 0,
        es_porcentaje: 0,
        ...initial,
    })

    const setField = (key, value) => setForm(prev => ({ ...prev, [key]: value }))
    const esFija = form.tipo_comision === 'FIJA'

    return (
        <form onSubmit={event => { event.preventDefault(); onSave(form) }}>
            <div className="grid-2">
                <div className="form-group">
                    <label className="form-label">Nombre *</label>
                    <input
                        className="form-input"
                        value={form.nombre}
                        onChange={event => setField('nombre', event.target.value)}
                        required
                        placeholder="Ej: Dr. Carlos Gomez"
                    />
                </div>
                <div className="form-group">
                    <label className="form-label">Telefono</label>
                    <input
                        className="form-input"
                        value={form.telefono || ''}
                        onChange={event => setField('telefono', event.target.value)}
                        placeholder="Ej: 0981 123 456"
                    />
                </div>
            </div>

            <div className="grid-2">
                <div className="form-group">
                    <label className="form-label">Tipo de comision</label>
                    <select
                        className="form-select"
                        value={form.tipo_comision}
                        onChange={event => setField('tipo_comision', event.target.value)}
                    >
                        <option value="FIJA">FIJA</option>
                        <option value="VARIABLE">VARIABLE</option>
                    </select>
                </div>
                <div className="form-group">
                    <label className="form-label">Modo de valor</label>
                    <select
                        className="form-select"
                        value={String(form.es_porcentaje || 0)}
                        onChange={event => setField('es_porcentaje', parseInt(event.target.value, 10))}
                        disabled={!esFija}
                    >
                        <option value="0">Monto</option>
                        <option value="1">Porcentaje</option>
                    </select>
                </div>
            </div>

            <div className="form-group">
                <label className="form-label">Valor de comision</label>
                <input
                    className="form-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.valor_comision ?? 0}
                    onChange={event => setField('valor_comision', Number(event.target.value))}
                    disabled={!esFija}
                    placeholder="0"
                />
                {!esFija && (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 6 }}>
                        En comision VARIABLE, el valor se guarda como 0.
                    </p>
                )}
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

function formatearValor(referidor) {
    if (referidor.tipo_comision !== 'FIJA') return 'Variable'
    if (referidor.es_porcentaje) return `${referidor.valor_comision}%`
    return `Gs. ${new Intl.NumberFormat('es-PY').format(referidor.valor_comision || 0)}`
}

export default function ReferidoresPage() {
    const queryClient = useQueryClient()
    const [modal, setModal] = useState(null)
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
        queryKey: ['referidores-optimizado', buscarDebounced, page, pageSize],
        queryFn: () => {
            const params = new URLSearchParams({
                page: String(page),
                page_size: String(pageSize),
            })
            if (buscarDebounced) {
                params.append('buscar', buscarDebounced)
            }
            return api.get(`/referidores/listado-optimizado?${params.toString()}`).then(response => response.data)
        },
        retry: false,
    })

    const referidores = data?.items || []
    const totalRegistros = data?.total || 0
    const totalPages = data?.total_pages || 1

    const crear = useMutation({
        mutationFn: payload => api.post('/referidores/', payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['referidores'] })
            queryClient.invalidateQueries({ queryKey: ['referidores-optimizado'] })
            queryClient.invalidateQueries({ queryKey: ['clientes'] })
            setModal(null)
        },
    })

    const editar = useMutation({
        mutationFn: ({ id, ...payload }) => api.put(`/referidores/${id}`, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['referidores'] })
            queryClient.invalidateQueries({ queryKey: ['referidores-optimizado'] })
            queryClient.invalidateQueries({ queryKey: ['clientes'] })
            setModal(null)
        },
    })

    const eliminar = useMutation({
        mutationFn: id => api.delete(`/referidores/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['referidores'] })
            queryClient.invalidateQueries({ queryKey: ['referidores-optimizado'] })
            queryClient.invalidateQueries({ queryKey: ['clientes'] })
        },
    })

    const handleSave = values => {
        const payload = {
            ...values,
            nombre: values.nombre?.trim(),
            telefono: values.telefono || null,
            valor_comision: Number(values.valor_comision || 0),
            es_porcentaje: Number(values.es_porcentaje || 0),
        }

        if (modal === 'nuevo') {
            crear.mutate(payload)
            return
        }
        editar.mutate({ id: modal.id, ...payload })
    }

    const handleDelete = referidor => {
        if (window.confirm(`Eliminar al referidor ${referidor.nombre}?`)) {
            eliminar.mutate(referidor.id)
        }
    }

    const errorMsg =
        crear.error?.response?.data?.detail ||
        editar.error?.response?.data?.detail ||
        eliminar.error?.response?.data?.detail

    return (
        <div className="page-body" style={{ overflowX: 'hidden' }}>
            <div className="mb-24" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, background: 'rgba(59,130,246,0.15)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <UserRoundPlus size={20} style={{ color: 'var(--primary-light)' }} />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Referidores</h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{totalRegistros} referidores registrados</p>
                    </div>
                </div>
                <button className="btn btn-primary" onClick={() => setModal('nuevo')} style={{ flexShrink: 0 }}>
                    <Plus size={16} /> Nuevo Referidor
                </button>
            </div>

            <div className="card mb-16" style={{ padding: '14px 20px', width: '100%', maxWidth: '100%' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div className="search-bar" style={{ flex: '1 1 320px', minWidth: 240 }}>
                        <Search size={16} />
                        <input
                            placeholder="Buscar por nombre, telefono o tipo..."
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
                        {error?.response?.data?.detail || 'No se pudieron cargar los referidores.'}
                    </div>
                )}
            </div>

            <div className="card" style={{ padding: 0, width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
                {isLoading ? (
                    <div className="flex-center" style={{ padding: 60 }}>
                        <div className="spinner" style={{ width: 32, height: 32 }} />
                    </div>
                ) : referidores.length === 0 ? (
                    <div className="empty-state">
                        <UserRoundPlus size={40} />
                        <p>No hay referidores para la busqueda.</p>
                    </div>
                ) : (
                    <div className="table-container" style={{ width: '100%', maxWidth: '100%', overflowX: 'auto' }}>
                        <table style={{ minWidth: 900, tableLayout: 'fixed' }}>
                            <thead>
                                <tr>
                                    <th style={{ width: 260 }}>Nombre</th>
                                    <th style={{ width: 180 }}>Telefono</th>
                                    <th style={{ width: 120 }}>Tipo</th>
                                    <th style={{ width: 200 }}>Valor</th>
                                    <th style={{ width: 90 }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {referidores.map(referidor => (
                                    <tr key={referidor.id}>
                                        <td style={{ fontWeight: 500, whiteSpace: 'normal', lineHeight: 1.25, wordBreak: 'break-word' }}>{referidor.nombre}</td>
                                        <td style={{ color: 'var(--text-secondary)', whiteSpace: 'normal', lineHeight: 1.25, wordBreak: 'break-word' }}>{referidor.telefono || '—'}</td>
                                        <td>
                                            <span className={`badge ${referidor.tipo_comision === 'FIJA' ? 'badge-blue' : 'badge-yellow'}`}>
                                                {referidor.tipo_comision}
                                            </span>
                                        </td>
                                        <td>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', whiteSpace: 'normal', lineHeight: 1.25, wordBreak: 'break-word' }}>
                                                {referidor.es_porcentaje ? <Percent size={13} /> : <Coins size={13} />}
                                                {formatearValor(referidor)}
                                            </span>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                                <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setModal(referidor)} title="Editar">
                                                    <Edit2 size={14} />
                                                </button>
                                                <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDelete(referidor)} title="Eliminar" disabled={eliminar.isPending}>
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
                    Mostrando pagina <strong>{page}</strong> de <strong>{totalPages}</strong> · <strong>{totalRegistros}</strong> referidor{totalRegistros === 1 ? '' : 'es'} encontrados
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
                    title={modal === 'nuevo' ? 'Nuevo Referidor' : `Editar: ${modal.nombre}`}
                    onClose={() => setModal(null)}
                    maxWidth="620px"
                >
                    <ReferidorForm
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
