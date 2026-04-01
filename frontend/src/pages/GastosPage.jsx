import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Edit2, Plus, Receipt, Tags, Trash2, Wallet } from 'lucide-react'

import Modal from '../components/Modal'
import { api } from '../context/AuthContext'
import usePendingNavigationGuard from '../utils/usePendingNavigationGuard'

function fmt(value) {
    return new Intl.NumberFormat('es-PY').format(value ?? 0)
}

function fmtDate(value) {
    return value ? new Date(value).toLocaleString('es-PY') : '-'
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

export default function GastosPage() {
    const queryClient = useQueryClient()
    const [modalCategoria, setModalCategoria] = useState(false)
    const [modalGasto, setModalGasto] = useState(null)
    const [categoriaEditando, setCategoriaEditando] = useState(null)
    const [categoriaFiltro, setCategoriaFiltro] = useState('')
    const [fechaDesde, setFechaDesde] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10))
    const [fechaHasta, setFechaHasta] = useState(() => new Date().toISOString().slice(0, 10))

    const [formCategoria, setFormCategoria] = useState({ nombre: '', descripcion: '', categoria_padre_id: '' })
    const [formGasto, setFormGasto] = useState({
        categoria_id: '',
        monto: '',
        concepto: '',
        comprobante: '',
        metodo_pago: 'EFECTIVO',
        banco_id: '',
        fecha: new Date().toISOString().slice(0, 16),
    })

    const resetFormGasto = () => setFormGasto({
        categoria_id: '',
        monto: '',
        concepto: '',
        comprobante: '',
        metodo_pago: 'EFECTIVO',
        banco_id: '',
        fecha: new Date().toISOString().slice(0, 16),
    })

    const { data: categorias = [] } = useQuery({
        queryKey: ['gastos-categorias'],
        queryFn: () => api.get('/gastos/categorias').then(response => response.data),
        retry: false,
    })

    const { data: bancos = [] } = useQuery({
        queryKey: ['bancos'],
        queryFn: () => api.get('/bancos/').then(response => response.data),
        retry: false,
    })

    const { data: gastos = [], isLoading } = useQuery({
        queryKey: ['gastos', categoriaFiltro, fechaDesde, fechaHasta],
        queryFn: () => {
            const params = new URLSearchParams()
            if (categoriaFiltro) {
                params.append('categoria_id', categoriaFiltro)
            }
            if (fechaDesde) {
                params.append('fecha_desde', fechaDesde)
            }
            if (fechaHasta) {
                params.append('fecha_hasta', fechaHasta)
            }
            params.append('limit', '200')
            return api.get(`/gastos/?${params.toString()}`).then(response => response.data)
        },
        retry: false,
    })

    const categoriasOrdenadas = useMemo(() => orderCategorias(categorias), [categorias])
    const totalGastos = gastos.reduce((sum, gasto) => sum + (gasto.monto || 0), 0)

    const cerrarModalCategoria = () => {
        setModalCategoria(false)
        setCategoriaEditando(null)
        setFormCategoria({ nombre: '', descripcion: '', categoria_padre_id: '' })
    }

    const crearCategoria = useMutation({
        mutationFn: payload => api.post('/gastos/categorias', payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['gastos-categorias'] })
            cerrarModalCategoria()
        },
    })

    const editarCategoria = useMutation({
        mutationFn: ({ id, ...payload }) => api.put(`/gastos/categorias/${id}`, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['gastos-categorias'] })
            cerrarModalCategoria()
        },
    })

    const eliminarCategoria = useMutation({
        mutationFn: id => api.delete(`/gastos/categorias/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['gastos-categorias'] })
            queryClient.invalidateQueries({ queryKey: ['gastos'] })
        },
    })

    const crearGasto = useMutation({
        mutationFn: payload => api.post('/gastos/', payload),
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['gastos'] }),
                queryClient.invalidateQueries({ queryKey: ['saldo-caja'] }),
                queryClient.invalidateQueries({ queryKey: ['movimientos-caja'] }),
                queryClient.invalidateQueries({ queryKey: ['bancos'] }),
            ])
            setModalGasto(null)
            resetFormGasto()
        },
    })

    const editarGasto = useMutation({
        mutationFn: ({ id, ...payload }) => api.put(`/gastos/${id}`, payload),
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['gastos'] }),
                queryClient.invalidateQueries({ queryKey: ['saldo-caja'] }),
                queryClient.invalidateQueries({ queryKey: ['movimientos-caja'] }),
                queryClient.invalidateQueries({ queryKey: ['bancos'] }),
            ])
            setModalGasto(null)
            resetFormGasto()
        },
    })

    const gastoModalBusy = crearGasto.isPending || editarGasto.isPending
    const confirmCloseGastoModal = usePendingNavigationGuard(gastoModalBusy, 'El gasto aun se esta guardando. Espera a que termine antes de cerrar.')

    const eliminarGasto = useMutation({
        mutationFn: gastoId => api.delete(`/gastos/${gastoId}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['gastos'] })
            queryClient.invalidateQueries({ queryKey: ['saldo-caja'] })
            queryClient.invalidateQueries({ queryKey: ['movimientos-caja'] })
            queryClient.invalidateQueries({ queryKey: ['bancos'] })
        },
    })

    return (
        <div className="page-body">
            <div className="flex-between mb-24">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, background: 'rgba(239,68,68,0.15)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Receipt size={20} style={{ color: '#f87171' }} />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Gastos Operativos</h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Registro, filtros y control de egresos</p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary" onClick={() => setModalCategoria(true)}>
                        <Tags size={16} /> Nueva Categoria
                    </button>
                    <button className="btn btn-primary" onClick={() => { resetFormGasto(); setModalGasto('nuevo') }}>
                        <Plus size={16} /> Registrar Gasto
                    </button>
                </div>
            </div>

            <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
                <div className="card" style={{ flex: 1, minWidth: 220, background: 'linear-gradient(135deg, rgba(239,68,68,0.14), rgba(249,115,22,0.08))', borderColor: 'rgba(239,68,68,0.3)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 52, height: 52, background: 'var(--danger)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Wallet size={24} color="white" />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Total filtrado</div>
                            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)' }}>Gs. {fmt(totalGastos)}</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="card mb-16">
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div className="form-group" style={{ marginBottom: 0, minWidth: 180 }}>
                        <label className="form-label">Desde</label>
                        <input className="form-input" type="date" value={fechaDesde} onChange={event => setFechaDesde(event.target.value)} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0, minWidth: 180 }}>
                        <label className="form-label">Hasta</label>
                        <input className="form-input" type="date" value={fechaHasta} onChange={event => setFechaHasta(event.target.value)} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0, minWidth: 240 }}>
                        <label className="form-label">Categoria</label>
                        <select className="form-select" value={categoriaFiltro} onChange={event => setCategoriaFiltro(event.target.value)}>
                            <option value="">Todas</option>
                            {categoriasOrdenadas.map(category => (
                                <option key={category.id} value={category.id}>
                                    {`${'  '.repeat(category.level)}${category.level > 0 ? '- ' : ''}${category.nombre}`}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            <div className="card" style={{ padding: 0 }}>
                {isLoading ? (
                    <div className="flex-center" style={{ padding: 60 }}>
                        <div className="spinner" style={{ width: 32, height: 32 }} />
                    </div>
                ) : gastos.length === 0 ? (
                    <div className="empty-state">
                        <Receipt size={40} />
                        <p>No hay gastos para los filtros seleccionados.</p>
                    </div>
                ) : (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Fecha</th>
                                    <th>Categoria</th>
                                    <th>Concepto</th>
                                    <th>Monto</th>
                                    <th>Metodo</th>
                                    <th>Origen</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {gastos.map(gasto => (
                                    <tr key={gasto.id}>
                                        <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{fmtDate(gasto.fecha)}</td>
                                        <td><span className="badge badge-blue">{gasto.categoria_nombre || '-'}</span></td>
                                        <td style={{ maxWidth: 320 }}>
                                            <div style={{ fontWeight: 500 }}>{gasto.concepto}</div>
                                            {gasto.comprobante && <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Comprobante: {gasto.comprobante}</div>}
                                        </td>
                                        <td style={{ color: 'var(--danger)', fontWeight: 700 }}>Gs. {fmt(gasto.monto)}</td>
                                        <td><span className="badge badge-gray">{gasto.metodo_pago || 'EFECTIVO'}</span></td>
                                        <td style={{ color: 'var(--text-secondary)' }}>{gasto.banco_nombre || 'CAJA CHICA'}</td>
                                        <td style={{ display: 'flex', gap: 6 }}>
                                            <button
                                                className="btn btn-secondary btn-sm btn-icon"
                                                onClick={() => {
                                                    setFormGasto({
                                                        categoria_id: String(gasto.categoria_id),
                                                        monto: String(gasto.monto ?? ''),
                                                        concepto: gasto.concepto || '',
                                                        comprobante: gasto.comprobante || '',
                                                        metodo_pago: gasto.metodo_pago || 'EFECTIVO',
                                                        banco_id: gasto.banco_id ? String(gasto.banco_id) : '',
                                                        fecha: gasto.fecha ? new Date(gasto.fecha).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16),
                                                    })
                                                    setModalGasto(gasto)
                                                }}
                                                title="Editar gasto"
                                            >
                                                <Edit2 size={14} />
                                            </button>
                                            <button
                                                className="btn btn-danger btn-sm btn-icon"
                                                onClick={() => eliminarGasto.mutate(gasto.id)}
                                                disabled={eliminarGasto.isPending}
                                                title="Eliminar gasto"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {modalCategoria && (
                <Modal title="Categorias de Gasto" onClose={cerrarModalCategoria} maxWidth="920px">
                    <div className="grid-2" style={{ alignItems: 'start' }}>
                        <div className="card" style={{ padding: 0, marginBottom: 0 }}>
                            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>
                                Categorias registradas
                            </div>
                            {categoriasOrdenadas.length === 0 ? (
                                <div className="empty-state" style={{ padding: '30px 20px' }}>
                                    <p>No hay categorias de gasto cargadas.</p>
                                </div>
                            ) : (
                                <div className="table-container">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>Nombre</th>
                                                <th>Descripcion</th>
                                                <th></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {categoriasOrdenadas.map(category => (
                                                <tr key={category.id}>
                                                    <td style={{ fontWeight: 600 }}>
                                                        {`${'  '.repeat(category.level)}${category.level > 0 ? '- ' : ''}${category.nombre}`}
                                                    </td>
                                                    <td style={{ color: 'var(--text-secondary)' }}>{category.descripcion || '-'}</td>
                                                    <td style={{ display: 'flex', gap: 6 }}>
                                                        <button
                                                            className="btn btn-secondary btn-sm btn-icon"
                                                            onClick={() => {
                                                                setCategoriaEditando(category)
                                                                setFormCategoria({
                                                                    nombre: category.nombre || '',
                                                                    descripcion: category.descripcion || '',
                                                                    categoria_padre_id: category.categoria_padre_id ? String(category.categoria_padre_id) : '',
                                                                })
                                                            }}
                                                            title="Editar categoria"
                                                        >
                                                            <Edit2 size={14} />
                                                        </button>
                                                        <button
                                                            className="btn btn-danger btn-sm btn-icon"
                                                            onClick={() => eliminarCategoria.mutate(category.id)}
                                                            disabled={eliminarCategoria.isPending}
                                                            title="Eliminar categoria"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        <div className="card" style={{ marginBottom: 0 }}>
                            <div style={{ fontWeight: 700, marginBottom: 14 }}>
                                {categoriaEditando ? `Editar Categoria: ${categoriaEditando.nombre}` : 'Nueva Categoria'}
                            </div>
                            <form onSubmit={event => {
                                event.preventDefault()
                                const payload = {
                                    ...formCategoria,
                                    categoria_padre_id: formCategoria.categoria_padre_id ? parseInt(formCategoria.categoria_padre_id, 10) : null,
                                }
                                if (categoriaEditando) {
                                    editarCategoria.mutate({ id: categoriaEditando.id, ...payload })
                                    return
                                }
                                crearCategoria.mutate(payload)
                            }}>
                                <div className="form-group">
                                    <label className="form-label">Nombre</label>
                                    <input className="form-input" value={formCategoria.nombre} onChange={event => setFormCategoria(prev => ({ ...prev, nombre: event.target.value }))} required />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Descripcion</label>
                                    <textarea className="form-input" rows={2} value={formCategoria.descripcion} onChange={event => setFormCategoria(prev => ({ ...prev, descripcion: event.target.value }))} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Categoria padre</label>
                                    <select className="form-select" value={formCategoria.categoria_padre_id} onChange={event => setFormCategoria(prev => ({ ...prev, categoria_padre_id: event.target.value }))}>
                                        <option value="">Sin categoria padre</option>
                                        {categoriasOrdenadas.filter(category => !categoriaEditando || category.id !== categoriaEditando.id).map(category => (
                                            <option key={category.id} value={category.id}>
                                                {`${'  '.repeat(category.level)}${category.level > 0 ? '- ' : ''}${category.nombre}`}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex gap-12" style={{ justifyContent: 'flex-end' }}>
                                    {categoriaEditando && (
                                        <button
                                            type="button"
                                            className="btn btn-secondary"
                                            onClick={() => {
                                                setCategoriaEditando(null)
                                                setFormCategoria({ nombre: '', descripcion: '', categoria_padre_id: '' })
                                            }}
                                        >
                                            Nueva
                                        </button>
                                    )}
                                    <button type="button" className="btn btn-secondary" onClick={cerrarModalCategoria}>Cerrar</button>
                                    <button type="submit" className="btn btn-primary" disabled={crearCategoria.isPending || editarCategoria.isPending}>
                                        {categoriaEditando ? 'Guardar Cambios' : 'Guardar'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </Modal>
            )}

            {modalGasto && (
                <Modal
                    title={modalGasto === 'nuevo' ? 'Registrar Gasto Operativo' : `Editar Gasto: ${modalGasto.concepto}`}
                    onClose={() => setModalGasto(null)}
                    maxWidth="620px"
                    closeDisabled={gastoModalBusy}
                    onCloseAttempt={() => window.alert('El gasto aun se esta guardando. Espera a que termine antes de cerrar.')}
                >
                    <form onSubmit={event => {
                        event.preventDefault()
                        const payload = {
                            ...formGasto,
                            categoria_id: parseInt(formGasto.categoria_id, 10),
                            monto: parseFloat(formGasto.monto),
                            banco_id: formGasto.banco_id ? parseInt(formGasto.banco_id, 10) : null,
                            fecha: formGasto.fecha ? new Date(formGasto.fecha).toISOString() : null,
                        }
                        if (modalGasto === 'nuevo') {
                            crearGasto.mutate(payload)
                            return
                        }
                        editarGasto.mutate({ id: modalGasto.id, ...payload })
                    }}>
                        <div className="grid-2">
                            <div className="form-group">
                                <label className="form-label">Categoria</label>
                                <select className="form-select" value={formGasto.categoria_id} onChange={event => setFormGasto(prev => ({ ...prev, categoria_id: event.target.value }))} required disabled={gastoModalBusy}>
                                    <option value="">Seleccionar...</option>
                                    {categoriasOrdenadas.map(category => (
                                        <option key={category.id} value={category.id}>
                                            {`${'  '.repeat(category.level)}${category.level > 0 ? '- ' : ''}${category.nombre}`}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Fecha</label>
                                <input className="form-input" type="datetime-local" value={formGasto.fecha} onChange={event => setFormGasto(prev => ({ ...prev, fecha: event.target.value }))} disabled={gastoModalBusy} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Monto (Gs.)</label>
                                <input className="form-input" type="number" min="0" step="100" value={formGasto.monto} onChange={event => setFormGasto(prev => ({ ...prev, monto: event.target.value }))} required disabled={gastoModalBusy} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Metodo de pago</label>
                                <select className="form-select" value={formGasto.metodo_pago} onChange={event => setFormGasto(prev => ({ ...prev, metodo_pago: event.target.value, banco_id: event.target.value === 'EFECTIVO' ? '' : prev.banco_id }))} disabled={gastoModalBusy}>
                                    <option value="EFECTIVO">EFECTIVO</option>
                                    <option value="TRANSFERENCIA">TRANSFERENCIA</option>
                                    <option value="TARJETA">TARJETA</option>
                                    <option value="CHEQUE">CHEQUE</option>
                                </select>
                            </div>
                        </div>
                        {formGasto.metodo_pago !== 'EFECTIVO' && (
                            <div className="form-group">
                                <label className="form-label">Banco</label>
                                <select className="form-select" value={formGasto.banco_id} onChange={event => setFormGasto(prev => ({ ...prev, banco_id: event.target.value }))} required disabled={gastoModalBusy}>
                                    <option value="">Seleccionar banco...</option>
                                    {bancos.map(banco => (
                                        <option key={banco.id} value={banco.id}>{banco.nombre_banco}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <div className="form-group">
                            <label className="form-label">Concepto</label>
                            <input className="form-input" value={formGasto.concepto} onChange={event => setFormGasto(prev => ({ ...prev, concepto: event.target.value }))} required disabled={gastoModalBusy} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Comprobante</label>
                            <input className="form-input" value={formGasto.comprobante} onChange={event => setFormGasto(prev => ({ ...prev, comprobante: event.target.value }))} placeholder="Factura, recibo o referencia" disabled={gastoModalBusy} />
                        </div>
                        {(crearGasto.isError || editarGasto.isError) && (
                            <div style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', padding: '8px 12px', borderRadius: 6, fontSize: '0.8rem', marginBottom: 12 }}>
                                {crearGasto.error?.response?.data?.detail || editarGasto.error?.response?.data?.detail || 'No se pudo guardar el gasto.'}
                            </div>
                        )}
                        <div className="card mb-16" style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.03)' }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-secondary)', fontSize: '0.86rem' }}>
                                <CalendarDays size={16} />
                                {formGasto.metodo_pago === 'EFECTIVO'
                                    ? 'El gasto se descontara de la caja.'
                                    : 'El gasto se descontara de la cuenta bancaria seleccionada.'}
                            </div>
                        </div>
                        <div className="flex gap-12" style={{ justifyContent: 'flex-end' }}>
                            <button type="button" className="btn btn-secondary" onClick={() => { if (confirmCloseGastoModal()) setModalGasto(null) }} disabled={gastoModalBusy}>Cancelar</button>
                            <button type="submit" className="btn btn-primary" disabled={gastoModalBusy}>
                                {gastoModalBusy ? (modalGasto === 'nuevo' ? 'Guardando gasto...' : 'Guardando cambios...') : (modalGasto === 'nuevo' ? 'Registrar Gasto' : 'Guardar Cambios')}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    )
}
