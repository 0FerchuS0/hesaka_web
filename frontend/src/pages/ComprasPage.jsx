import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CheckSquare, Eye, FileText, PackagePlus, Pencil, Plus, Search, ShoppingCart, Trash2, Wallet, X } from 'lucide-react'

import Modal from '../components/Modal'
import { api, useAuth } from '../context/AuthContext'
import { exportReportBlob } from '../utils/reportExports'
import { hasActionAccess } from '../utils/roles'

const fmt = value => new Intl.NumberFormat('es-PY').format(value ?? 0)
const fmtDate = value => value ? new Date(value).toLocaleDateString('es-PY') : '-'
const fmtDateTime = value => value ? new Date(value).toLocaleString('es-PY') : '-'

function estadoBadge(estado) {
    const map = {
        PAGADO: 'badge-green',
        PENDIENTE: 'badge-yellow',
        VENCIDO: 'badge-red',
        ANULADO: 'badge-gray',
        CONTADO: 'badge-blue',
        CREDITO: 'badge-yellow',
        RECIBIDO: 'badge-blue',
        EN_LABORATORIO: 'badge-yellow',
        ENTREGADO: 'badge-green',
        PENDIENTE_ENVIO: 'badge-gray',
    }
    return <span className={`badge ${map[estado] || 'badge-gray'}`}>{estado}</span>
}

function createEmptyItem() {
    return {
        descripcion: '',
        cantidad: 1,
        costo_unitario: '',
        iva: 10,
        descuento: 0,
        subtotal: 0,
        producto_id: null,
        presupuesto_item_id: null,
        autoImportado: false,
        origen: '',
    }
}

function recalcItem(item) {
    const cantidad = parseInt(item.cantidad, 10) || 1
    const costo = parseFloat(item.costo_unitario) || 0
    const descuento = parseFloat(item.descuento) || 0
    return { ...item, cantidad, subtotal: Math.max(0, costo * cantidad - descuento) }
}

function buildImportedItems(ventas) {
    const seen = new Set()
    const items = []
    ventas.forEach(venta => {
        venta.items_pendientes.forEach(item => {
            if (seen.has(item.presupuesto_item_id)) return
            seen.add(item.presupuesto_item_id)
            items.push(recalcItem({
                descripcion: item.producto_nombre,
                cantidad: item.cantidad_pendiente,
                costo_unitario: item.costo_sugerido || 0,
                iva: 10,
                descuento: 0,
                subtotal: 0,
                producto_id: item.producto_id,
                presupuesto_item_id: item.presupuesto_item_id,
                autoImportado: true,
                origen: venta.venta_codigo,
            }))
        })
    })
    return items
}

function buildItemsFromCompra(compra) {
    if (!compra?.items?.length) return [createEmptyItem()]
    const origen = compra.ventas_codigos?.join(', ') || ''
    return compra.items.map(item => recalcItem({
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        costo_unitario: item.costo_unitario,
        iva: item.iva ?? 10,
        descuento: item.descuento ?? 0,
        subtotal: item.subtotal ?? 0,
        producto_id: item.producto_id ?? null,
        presupuesto_item_id: item.presupuesto_item_id ?? null,
        autoImportado: Boolean(item.presupuesto_item_id),
        origen,
    }))
}

function buildVentasResumen(compra) {
    return (compra?.ventas_ids || []).map((ventaId, index) => ({
        venta_id: ventaId,
        venta_codigo: compra.ventas_codigos?.[index] || `VENTA #${ventaId}`,
        cliente_nombre: compra.clientes_nombres?.join(', ') || '',
    }))
}

function ActionButton({ title, danger = false, onClick, children }) {
    return (
        <button
            type="button"
            className={`btn ${danger ? 'btn-danger' : 'btn-secondary'} btn-sm btn-icon`}
            title={title}
            onClick={onClick}
        >
            {children}
        </button>
    )
}

function RemoteProveedorSelect({ value, proveedorNombre = '', onChange }) {
    const [buscar, setBuscar] = useState(proveedorNombre)
    const [showList, setShowList] = useState(false)

    useEffect(() => {
        setBuscar(proveedorNombre || '')
    }, [proveedorNombre])

    const { data: proveedores = [] } = useQuery({
        queryKey: ['proveedores-select', buscar],
        queryFn: () => {
            const params = new URLSearchParams({ page: '1', page_size: '20' })
            if (buscar.trim()) params.append('buscar', buscar.trim())
            return api.get(`/proveedores/listado-optimizado?${params.toString()}`).then(response => response.data.items || [])
        },
        enabled: showList,
        retry: false,
    })

    return (
        <div style={{ position: 'relative' }}>
            <input
                className="form-input"
                value={buscar}
                placeholder="Buscar proveedor..."
                onFocus={() => setShowList(true)}
                onChange={event => {
                    const nextValue = event.target.value
                    setBuscar(nextValue)
                    setShowList(true)
                    if (!nextValue.trim()) onChange('', '')
                }}
            />
            {showList && (
                <div
                    style={{ position: 'absolute', zIndex: 90, top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, maxHeight: 260, overflowY: 'auto', boxShadow: '0 12px 30px rgba(0,0,0,0.45)' }}
                    onMouseDown={event => event.preventDefault()}
                >
                    {proveedores.length === 0 ? (
                        <div style={{ padding: '12px 14px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>Sin resultados</div>
                    ) : proveedores.map(item => (
                        <div
                            key={item.id}
                            onClick={() => {
                                setBuscar(item.nombre)
                                setShowList(false)
                                onChange(String(item.id), item.nombre)
                            }}
                            style={{ padding: '11px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                            onMouseEnter={event => { event.currentTarget.style.background = 'rgba(59,130,246,0.12)' }}
                            onMouseLeave={event => { event.currentTarget.style.background = 'transparent' }}
                        >
                            <div style={{ fontSize: '0.84rem', fontWeight: 600 }}>{item.nombre}</div>
                            {(item.telefono || item.email) && (
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                    {[item.telefono, item.email].filter(Boolean).join(' · ')}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

function VentaSelectorModal({ proveedorId, tipoCompra, selectedVentas, onConfirm, onClose }) {
    const [buscar, setBuscar] = useState('')
    const [selectedIds, setSelectedIds] = useState(() => new Set(selectedVentas.map(venta => venta.venta_id)))

    const { data: ventas = [], isLoading } = useQuery({
        queryKey: ['compras-ventas-pendientes', proveedorId, tipoCompra, buscar],
        queryFn: () => {
            const params = new URLSearchParams()
            params.append('tipo_compra', tipoCompra)
            if (proveedorId) params.append('proveedor_id', proveedorId)
            if (buscar.trim()) params.append('buscar', buscar.trim())
            return api.get(`/compras/ventas-pendientes?${params.toString()}`).then(response => response.data)
        },
        enabled: Boolean(proveedorId) && tipoCompra !== 'STOCK/SERVICIO',
        retry: false,
    })

    const toggleVenta = ventaId => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(ventaId)) next.delete(ventaId)
            else next.add(ventaId)
            return next
        })
    }

    const ventasSeleccionadas = ventas.filter(venta => selectedIds.has(venta.venta_id))

    return (
        <Modal title="Seleccionar Ventas" onClose={onClose} maxWidth="920px">
            {!proveedorId ? (
                <div className="empty-state" style={{ padding: '36px 20px' }}>
                    <AlertCircle size={34} />
                    <p>Selecciona primero un proveedor para importar items automaticamente.</p>
                </div>
            ) : (
                <>
                    <div className="card mb-16" style={{ padding: '14px 16px' }}>
                        <div className="search-bar">
                            <Search size={16} />
                            <input placeholder="Buscar por codigo de venta o cliente..." value={buscar} onChange={event => setBuscar(event.target.value)} />
                        </div>
                    </div>
                    <div className="card" style={{ padding: 0, marginBottom: 16 }}>
                        {isLoading ? (
                            <div className="flex-center" style={{ padding: 60 }}><div className="spinner" style={{ width: 30, height: 30 }} /></div>
                        ) : ventas.length === 0 ? (
                            <div className="empty-state" style={{ padding: '36px 20px' }}>
                                <PackagePlus size={34} />
                                <p>No hay ventas con items pendientes para importar.</p>
                            </div>
                        ) : (
                            <div className="table-container">
                                <table>
                                    <thead>
                                        <tr><th></th><th>Venta</th><th>Cliente</th><th>Fecha</th><th>Estado</th><th>Items</th></tr>
                                    </thead>
                                    <tbody>
                                        {ventas.map(venta => (
                                            <tr key={venta.venta_id}>
                                                <td><input type="checkbox" checked={selectedIds.has(venta.venta_id)} onChange={() => toggleVenta(venta.venta_id)} style={{ accentColor: 'var(--primary-light)' }} /></td>
                                                <td style={{ fontWeight: 600 }}>{venta.venta_codigo}</td>
                                                <td>{venta.cliente_nombre}</td>
                                                <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{fmtDate(venta.fecha)}</td>
                                                <td>{estadoBadge(venta.estado_entrega || 'EN_LABORATORIO')}</td>
                                                <td>{venta.items_pendientes.length}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                    <div className="flex gap-12" style={{ justifyContent: 'flex-end' }}>
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
                        <button type="button" className="btn btn-primary" onClick={() => onConfirm(ventasSeleccionadas)} disabled={ventasSeleccionadas.length === 0}>
                            <CheckSquare size={15} /> Importar Seleccion
                        </button>
                    </div>
                </>
            )}
        </Modal>
    )
}

function CompraFormModal({ compraId = null, onClose }) {
    const queryClient = useQueryClient()
    const editando = Boolean(compraId)
    const [proveedor, setProveedor] = useState('')
    const [tipoDocumento, setTipoDocumento] = useState('FACTURA')
    const [nroFactura, setNroFactura] = useState('')
    const [condicionPago, setCondicionPago] = useState('CONTADO')
    const [fechaVencimiento, setFechaVencimiento] = useState('')
    const [tipoCompra, setTipoCompra] = useState('ORIGINAL')
    const [estadoEntrega, setEstadoEntrega] = useState('RECIBIDO')
    const [observaciones, setObservaciones] = useState('')
    const [ventasSeleccionadas, setVentasSeleccionadas] = useState([])
    const [items, setItems] = useState([createEmptyItem()])
    const [showVentasModal, setShowVentasModal] = useState(false)
    const [proveedorNombre, setProveedorNombre] = useState('')

    const { data: compraDetalle, isLoading: loadingCompra } = useQuery({
        queryKey: ['compra-detalle', compraId],
        queryFn: () => api.get(`/compras/${compraId}`).then(response => response.data),
        enabled: editando,
        retry: false,
    })

    useEffect(() => {
        if (!compraDetalle) return
        setProveedor(compraDetalle.proveedor_id ? String(compraDetalle.proveedor_id) : '')
        setProveedorNombre(compraDetalle.proveedor_nombre || '')
        setTipoDocumento(compraDetalle.tipo_documento || 'FACTURA')
        setNroFactura(compraDetalle.nro_factura || '')
        setCondicionPago(compraDetalle.condicion_pago || 'CONTADO')
        setFechaVencimiento(compraDetalle.fecha_vencimiento ? new Date(compraDetalle.fecha_vencimiento).toISOString().slice(0, 10) : '')
        setTipoCompra(compraDetalle.tipo_compra || 'ORIGINAL')
        setEstadoEntrega(compraDetalle.estado_entrega || 'RECIBIDO')
        setObservaciones(compraDetalle.observaciones || '')
        setVentasSeleccionadas(buildVentasResumen(compraDetalle))
        setItems(buildItemsFromCompra(compraDetalle))
    }, [compraDetalle])

    useEffect(() => {
        if (tipoCompra === 'STOCK/SERVICIO') {
            setVentasSeleccionadas([])
            setItems(prev => {
                const manuales = prev.filter(item => !item.autoImportado)
                return manuales.length ? manuales : [createEmptyItem()]
            })
        }
    }, [tipoCompra])

    const total = useMemo(() => items.reduce((sum, item) => sum + (item.subtotal || 0), 0), [items])

    const mutation = useMutation({
        mutationFn: payload => editando ? api.put(`/compras/${compraId}`, payload) : api.post('/compras/', payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['compras'] })
            queryClient.invalidateQueries({ queryKey: ['compras-optimizado'] })
            if (editando) queryClient.invalidateQueries({ queryKey: ['compra-detalle', compraId] })
            onClose()
        },
    })

    const updateItem = (index, key, value) => {
        setItems(prev => {
            const next = [...prev]
            next[index] = recalcItem({ ...next[index], [key]: value })
            return next
        })
    }

    const handleVentasConfirm = ventas => {
        const manuales = items.filter(item => !item.autoImportado)
        const importados = buildImportedItems(ventas)
        setVentasSeleccionadas(ventas)
        setItems(importados.length ? [...manuales, ...importados] : (manuales.length ? manuales : [createEmptyItem()]))
        setShowVentasModal(false)
    }

    const handleSubmit = event => {
        event.preventDefault()
        const itemsValidos = items
            .filter(item => item.descripcion && (parseInt(item.cantidad, 10) || 0) > 0)
            .map(item => ({
                descripcion: item.descripcion,
                cantidad: parseInt(item.cantidad, 10) || 1,
                costo_unitario: parseFloat(item.costo_unitario) || 0,
                iva: parseInt(item.iva, 10) || 10,
                descuento: parseFloat(item.descuento) || 0,
                subtotal: item.subtotal || 0,
                producto_id: item.producto_id || null,
                presupuesto_item_id: item.presupuesto_item_id || null,
            }))

        mutation.mutate({
            proveedor_id: proveedor ? parseInt(proveedor, 10) : null,
            tipo_documento: tipoDocumento,
            nro_factura: nroFactura || null,
            total,
            condicion_pago: condicionPago,
            fecha_vencimiento: condicionPago === 'CREDITO' && fechaVencimiento ? `${fechaVencimiento}T00:00:00` : null,
            observaciones: observaciones || null,
            estado_entrega: estadoEntrega,
            tipo_compra: tipoCompra,
            ventas_ids: ventasSeleccionadas.map(venta => venta.venta_id),
            items: itemsValidos,
        })
    }

    if (editando && loadingCompra) {
        return <div className="flex-center" style={{ padding: 50 }}><div className="spinner" style={{ width: 26, height: 26 }} /></div>
    }

    const clientesTexto = [...new Set(ventasSeleccionadas.map(venta => venta.cliente_nombre).filter(Boolean))].join(', ')

    return (
        <>
            <form onSubmit={handleSubmit}>
                <div className="grid-2 mb-16">
                    <div className="form-group"><label className="form-label">Proveedor</label><RemoteProveedorSelect value={proveedor} proveedorNombre={proveedorNombre} onChange={(nextId, nextNombre) => { setProveedor(nextId); setProveedorNombre(nextNombre) }} /></div>
                    <div className="form-group"><label className="form-label">Tipo de Compra</label><select className="form-select" value={tipoCompra} onChange={event => setTipoCompra(event.target.value)}><option value="ORIGINAL">ORIGINAL</option><option value="GARANTIA">GARANTIA</option><option value="REEMPLAZO">REEMPLAZO</option><option value="STOCK/SERVICIO">STOCK/SERVICIO</option></select></div>
                    <div className="form-group"><label className="form-label">Tipo de Documento</label><select className="form-select" value={tipoDocumento} onChange={event => setTipoDocumento(event.target.value)}><option value="FACTURA">FACTURA</option><option value="ORDEN_SERVICIO">ORDEN_SERVICIO</option></select></div>
                    <div className="form-group"><label className="form-label">{tipoDocumento === 'FACTURA' ? 'Nro. Factura' : 'Nro. Orden de Servicio'}</label><input className="form-input" value={nroFactura} onChange={event => setNroFactura(event.target.value)} /></div>
                    <div className="form-group"><label className="form-label">Condicion de Pago</label><select className="form-select" value={condicionPago} onChange={event => setCondicionPago(event.target.value)}><option value="CONTADO">CONTADO</option><option value="CREDITO">CREDITO</option></select></div>
                    <div className="form-group"><label className="form-label">Estado de Entrega</label><select className="form-select" value={estadoEntrega} onChange={event => setEstadoEntrega(event.target.value)}><option value="RECIBIDO">RECIBIDO</option><option value="EN_LABORATORIO">EN_LABORATORIO</option><option value="ENTREGADO">ENTREGADO</option><option value="PENDIENTE_ENVIO">PENDIENTE_ENVIO</option></select></div>
                </div>
                {condicionPago === 'CREDITO' && <div className="form-group mb-16"><label className="form-label">Fecha de Vencimiento</label><input type="date" className="form-input" value={fechaVencimiento} onChange={event => setFechaVencimiento(event.target.value)} /></div>}
                <div className="card mb-16" style={{ padding: '14px 16px' }}>
                    <div className="flex-between" style={{ alignItems: 'flex-start', gap: 16 }}>
                        <div>
                            <div style={{ fontWeight: 700 }}>Ventas Asociadas</div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{ventasSeleccionadas.length ? ventasSeleccionadas.map(venta => venta.venta_codigo).join(', ') : 'Ninguna venta seleccionada.'}</div>
                            {clientesTexto && <div style={{ marginTop: 6, color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Clientes: {clientesTexto}</div>}
                        </div>
                        <button type="button" className="btn btn-secondary" onClick={() => setShowVentasModal(true)} disabled={tipoCompra === 'STOCK/SERVICIO'}><PackagePlus size={15} /> Seleccionar Ventas</button>
                    </div>
                </div>
                <div style={{ marginBottom: 16 }}>
                    <div className="flex-between mb-16">
                        <p style={{ fontSize: '0.9rem', fontWeight: 700 }}>Detalle de la Compra</p>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setItems(prev => [...prev, createEmptyItem()])}><Plus size={13} /> Agregar Manual</button>
                    </div>
                    <div className="table-container">
                        <table>
                            <thead><tr><th>Descripcion</th><th>Cant.</th><th>Costo Unit.</th><th>Desc.</th><th>Subtotal</th><th>Origen</th><th></th></tr></thead>
                            <tbody>
                                {items.map((item, index) => (
                                    <tr key={`${item.presupuesto_item_id || 'manual'}-${index}`}>
                                        <td><input className="form-input" style={{ padding: '6px 8px' }} value={item.descripcion} onChange={event => updateItem(index, 'descripcion', event.target.value)} /></td>
                                        <td><input type="number" min="1" className="form-input" style={{ width: 84, padding: '6px 8px' }} value={item.cantidad} onChange={event => updateItem(index, 'cantidad', event.target.value)} /></td>
                                        <td><input type="number" min="0" className="form-input" style={{ width: 130, padding: '6px 8px' }} value={item.costo_unitario} onChange={event => updateItem(index, 'costo_unitario', event.target.value)} /></td>
                                        <td><input type="number" min="0" className="form-input" style={{ width: 100, padding: '6px 8px' }} value={item.descuento} onChange={event => updateItem(index, 'descuento', event.target.value)} /></td>
                                        <td style={{ fontWeight: 700, color: 'var(--primary-light)' }}>Gs. {fmt(item.subtotal)}</td>
                                        <td style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{item.origen || (item.autoImportado ? 'IMPORTADO' : 'MANUAL')}</td>
                                        <td>{items.length > 1 && <ActionButton title="Quitar item" danger onClick={() => setItems(prev => prev.filter((_, currentIndex) => currentIndex !== index))}><X size={13} /></ActionButton>}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div className="form-group"><label className="form-label">Observaciones</label><textarea className="form-input" rows={2} value={observaciones} onChange={event => setObservaciones(event.target.value)} style={{ resize: 'vertical' }} /></div>
                <div style={{ background: 'rgba(26,86,219,0.08)', border: '1px solid rgba(26,86,219,0.2)', borderRadius: 10, padding: '14px 20px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>TOTAL</span><span style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--primary-light)' }}>Gs. {fmt(total)}</span></div>
                {mutation.isError && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#f87171', display: 'flex', gap: 8 }}><AlertCircle size={16} /> {mutation.error?.response?.data?.detail || 'Error al guardar la compra.'}</div>}
                <div className="flex gap-12" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={mutation.isPending}>{mutation.isPending ? <span className="spinner" style={{ width: 16, height: 16 }} /> : <><ShoppingCart size={15} /> {editando ? 'Guardar Cambios' : 'Guardar Compra'}</>}</button></div>
            </form>
            {showVentasModal && <VentaSelectorModal proveedorId={proveedor} tipoCompra={tipoCompra} selectedVentas={ventasSeleccionadas} onConfirm={handleVentasConfirm} onClose={() => setShowVentasModal(false)} />}
        </>
    )
}

function PagoCompraModal({ compra, onClose }) {
    const queryClient = useQueryClient()
    const [monto, setMonto] = useState(compra.saldo || 0)
    const [metodoPago, setMetodoPago] = useState('EFECTIVO')
    const [bancoId, setBancoId] = useState('')
    const [nroComprobante, setNroComprobante] = useState('')

    const { data: pagos = [], isLoading: pagosLoading } = useQuery({
        queryKey: ['compra-pagos', compra.id],
        queryFn: () => api.get(`/compras/${compra.id}/pagos`).then(response => response.data),
        retry: false,
    })
    const { data: bancos = [] } = useQuery({
        queryKey: ['bancos'],
        queryFn: () => api.get('/bancos/').then(response => response.data),
        retry: false,
    })

    const registrarPago = useMutation({
        mutationFn: payload => api.post(`/compras/${compra.id}/pagos`, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['compras'] })
            queryClient.invalidateQueries({ queryKey: ['compras-optimizado'] })
            queryClient.invalidateQueries({ queryKey: ['compra-pagos', compra.id] })
            queryClient.invalidateQueries({ queryKey: ['saldo-caja'] })
            queryClient.invalidateQueries({ queryKey: ['movimientos-caja'] })
            queryClient.invalidateQueries({ queryKey: ['bancos'] })
            onClose()
        },
    })
    const eliminarPago = useMutation({
        mutationFn: pagoId => api.delete(`/compras/${compra.id}/pagos/${pagoId}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['compras'] })
            queryClient.invalidateQueries({ queryKey: ['compras-optimizado'] })
            queryClient.invalidateQueries({ queryKey: ['compra-pagos', compra.id] })
            queryClient.invalidateQueries({ queryKey: ['saldo-caja'] })
            queryClient.invalidateQueries({ queryKey: ['movimientos-caja'] })
            queryClient.invalidateQueries({ queryKey: ['bancos'] })
        },
    })

    const handleSubmit = event => {
        event.preventDefault()
        registrarPago.mutate({
            monto: parseFloat(monto) || 0,
            metodo_pago: metodoPago,
            banco_id: metodoPago === 'EFECTIVO' ? null : (bancoId ? parseInt(bancoId, 10) : null),
            nro_comprobante: nroComprobante || null,
        })
    }

    return (
        <form onSubmit={handleSubmit}>
            <div className="card mb-16" style={{ padding: '14px 16px' }}>
                <div style={{ display: 'grid', gap: 6 }}>
                    <div style={{ fontWeight: 700 }}>{compra.proveedor_nombre || 'Sin proveedor'}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{compra.tipo_documento} {compra.nro_factura || 'SIN NUMERO'}</div>
                    {((((compra.tipo_documento_original || '').toUpperCase() === 'ORDEN_SERVICIO') || ((compra.tipo_documento || '').toUpperCase() === 'ORDEN_SERVICIO') || (compra.nro_documento_original && compra.nro_documento_original !== compra.nro_factura))) && (
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                            OS origen: <strong>{compra.nro_documento_original || compra.nro_factura || 'SIN NUMERO'}</strong>
                        </div>
                    )}
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>Total: Gs. {fmt(compra.total)} | Saldo pendiente: Gs. {fmt(compra.saldo)}</div>
                </div>
            </div>

            <div style={{ marginBottom: 18 }}>
                <h4 style={{ fontSize: '0.9rem', marginBottom: 10, color: 'var(--text-secondary)' }}>Historial de Pagos</h4>
                {pagosLoading ? (
                    <div className="flex-center" style={{ padding: 24 }}><div className="spinner" style={{ width: 22, height: 22 }} /></div>
                ) : pagos.length === 0 ? (
                    <div className="card" style={{ padding: '14px 16px', color: 'var(--text-muted)', fontSize: '0.84rem' }}>No hay pagos registrados.</div>
                ) : (
                    <div className="table-container">
                        <table>
                            <thead><tr><th>Fecha</th><th>Metodo</th><th>Banco</th><th>Comprobante</th><th>Monto</th><th></th></tr></thead>
                            <tbody>
                                {pagos.map(pago => (
                                    <tr key={pago.id}>
                                        <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{fmtDateTime(pago.fecha)}</td>
                                        <td style={{ fontSize: '0.82rem', fontWeight: 600 }}>{pago.metodo_pago}</td>
                                        <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{pago.banco_nombre || '-'}</td>
                                        <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{pago.nro_comprobante || '-'}</td>
                                        <td style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--success)' }}>Gs. {fmt(pago.monto)}</td>
                                        <td><button type="button" className="btn btn-danger btn-sm" onClick={() => { if (confirm('¿Eliminar este pago? Se revertirá en caja o banco.')) eliminarPago.mutate(pago.id) }} disabled={eliminarPago.isPending}>Eliminar</button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="grid-2 mb-16">
                <div className="form-group"><label className="form-label">Monto a Pagar</label><input type="number" min="0" max={compra.saldo || 0} step="0.01" className="form-input" value={monto} onChange={event => setMonto(event.target.value)} /></div>
                <div className="form-group"><label className="form-label">Metodo de Pago</label><select className="form-select" value={metodoPago} onChange={event => setMetodoPago(event.target.value)}><option value="EFECTIVO">EFECTIVO</option><option value="TRANSFERENCIA">TRANSFERENCIA</option><option value="TARJETA">TARJETA</option><option value="CHEQUE">CHEQUE</option></select></div>
                <div className="form-group"><label className="form-label">Banco</label><select className="form-select" value={bancoId} onChange={event => setBancoId(event.target.value)} disabled={metodoPago === 'EFECTIVO'}><option value="">Seleccionar banco</option>{bancos.map(banco => <option key={banco.id} value={banco.id}>{banco.nombre_banco}</option>)}</select></div>
                <div className="form-group"><label className="form-label">Nro. Comprobante</label><input className="form-input" value={nroComprobante} onChange={event => setNroComprobante(event.target.value)} placeholder="Opcional" /></div>
            </div>

            {(registrarPago.isError || eliminarPago.isError) && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#f87171', display: 'flex', gap: 8 }}><AlertCircle size={16} /> {registrarPago.error?.response?.data?.detail || eliminarPago.error?.response?.data?.detail || 'Error al procesar el pago.'}</div>}
            <div className="flex gap-12" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={registrarPago.isPending}>{registrarPago.isPending ? <span className="spinner" style={{ width: 16, height: 16 }} /> : <><Wallet size={15} /> Registrar Pago</>}</button></div>
        </form>
    )
}

function DetalleCompraModal({ compraId, onClose }) {
    const { data: compra, isLoading } = useQuery({
        queryKey: ['compra-detalle', compraId],
        queryFn: () => api.get(`/compras/${compraId}`).then(response => response.data),
        retry: false,
    })
    const { data: pagos = [] } = useQuery({
        queryKey: ['compra-pagos', compraId],
        queryFn: () => api.get(`/compras/${compraId}/pagos`).then(response => response.data),
        retry: false,
    })

    if (isLoading || !compra) return <div className="flex-center" style={{ padding: 50 }}><div className="spinner" style={{ width: 26, height: 26 }} /></div>

    return (
        <div style={{ display: 'grid', gap: 18 }}>
            <div className="grid-2">
                <div className="card" style={{ marginBottom: 0 }}>
                    <div style={{ fontWeight: 700, marginBottom: 10 }}>Resumen</div>
                    <div style={{ display: 'grid', gap: 6, fontSize: '0.86rem' }}>
                        <div>Proveedor: <strong>{compra.proveedor_nombre || 'Sin proveedor'}</strong></div>
                        <div>Documento: <strong>{compra.tipo_documento} {compra.nro_factura || 'S/N'}</strong></div>
                        {((((compra.tipo_documento_original || '').toUpperCase() === 'ORDEN_SERVICIO') || ((compra.tipo_documento || '').toUpperCase() === 'ORDEN_SERVICIO') || (compra.nro_documento_original && compra.nro_documento_original !== compra.nro_factura))) && (
                            <div>OS origen: <strong>{compra.nro_documento_original || compra.nro_factura || 'S/N'}</strong></div>
                        )}
                        <div>Tipo compra: <strong>{compra.tipo_compra}</strong></div>
                        <div>Condicion: {estadoBadge(compra.condicion_pago)}</div>
                        <div>Estado: {estadoBadge(compra.estado)}</div>
                        <div>Entrega: {estadoBadge(compra.estado_entrega)}</div>
                    </div>
                </div>
                <div className="card" style={{ marginBottom: 0 }}>
                    <div style={{ fontWeight: 700, marginBottom: 10 }}>Totales</div>
                    <div style={{ display: 'grid', gap: 8 }}>
                        <div style={{ fontSize: '1rem', fontWeight: 700 }}>Total: Gs. {fmt(compra.total)}</div>
                        <div style={{ color: compra.saldo > 0 ? 'var(--warning)' : 'var(--success)', fontWeight: 700 }}>Saldo: Gs. {fmt(compra.saldo)}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Fecha: {fmtDateTime(compra.fecha)}</div>
                        {compra.fecha_vencimiento && <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Vence: {fmtDate(compra.fecha_vencimiento)}</div>}
                    </div>
                </div>
            </div>

            <div className="card" style={{ marginBottom: 0 }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>Ventas y Clientes Asociados</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>Ventas: {compra.ventas_codigos?.length ? compra.ventas_codigos.join(', ') : '-'}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', marginTop: 4 }}>Clientes: {compra.clientes_nombres?.length ? compra.clientes_nombres.join(', ') : '-'}</div>
            </div>

            <div className="card" style={{ padding: 0, marginBottom: 0 }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>Items</div>
                <div className="table-container">
                    <table>
                        <thead><tr><th>Descripcion</th><th>Cant.</th><th>Costo Unit.</th><th>Desc.</th><th>Subtotal</th></tr></thead>
                        <tbody>{compra.items.map(item => <tr key={item.id}><td>{item.descripcion}</td><td>{item.cantidad}</td><td>Gs. {fmt(item.costo_unitario)}</td><td>Gs. {fmt(item.descuento)}</td><td style={{ fontWeight: 700 }}>Gs. {fmt(item.subtotal)}</td></tr>)}</tbody>
                    </table>
                </div>
            </div>

            <div className="card" style={{ padding: 0, marginBottom: 0 }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>Pagos</div>
                {pagos.length === 0 ? <div style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: '0.84rem' }}>No hay pagos registrados.</div> : (
                    <div className="table-container">
                        <table>
                            <thead><tr><th>Fecha</th><th>Metodo</th><th>Banco</th><th>Comprobante</th><th>Monto</th></tr></thead>
                            <tbody>{pagos.map(pago => <tr key={pago.id}><td>{fmtDateTime(pago.fecha)}</td><td>{pago.metodo_pago}</td><td>{pago.banco_nombre || '-'}</td><td>{pago.nro_comprobante || '-'}</td><td style={{ fontWeight: 700, color: 'var(--success)' }}>Gs. {fmt(pago.monto)}</td></tr>)}</tbody>
                        </table>
                    </div>
                )}
            </div>

            {compra.observaciones && <div className="card" style={{ marginBottom: 0 }}><div style={{ fontWeight: 700, marginBottom: 8 }}>Observaciones</div><div style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>{compra.observaciones}</div></div>}
            <div className="flex gap-12" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn btn-secondary" onClick={onClose}>Cerrar</button></div>
        </div>
    )
}

function EstadoEntregaModal({ compra, onClose }) {
    const queryClient = useQueryClient()
    const [estadoEntrega, setEstadoEntrega] = useState(compra.estado_entrega || 'RECIBIDO')
    const actualizar = useMutation({
        mutationFn: payload => api.patch(`/compras/${compra.id}/estado-entrega?estado_entrega=${encodeURIComponent(payload)}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['compras'] })
            queryClient.invalidateQueries({ queryKey: ['compras-optimizado'] })
            queryClient.invalidateQueries({ queryKey: ['compra-detalle', compra.id] })
            onClose()
        },
    })

    return (
        <form onSubmit={event => { event.preventDefault(); actualizar.mutate(estadoEntrega) }}>
            <div className="form-group"><label className="form-label">Estado de Entrega</label><select className="form-select" value={estadoEntrega} onChange={event => setEstadoEntrega(event.target.value)}><option value="RECIBIDO">RECIBIDO</option><option value="EN_LABORATORIO">EN_LABORATORIO</option><option value="ENTREGADO">ENTREGADO</option><option value="PENDIENTE_ENVIO">PENDIENTE_ENVIO</option></select></div>
            <div className="flex gap-12" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={actualizar.isPending}>{actualizar.isPending ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Guardar Estado'}</button></div>
        </form>
    )
}

function CompraRowActions({ compra, onVer, onEditar, onPagar, onEntrega, onPDF, onEliminar, user, pdfOpeningId, deletingId }) {
    const [open, setOpen] = useState(false)
    const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })
    const buttonRef = useRef(null)
    const puedeEditar = hasActionAccess(user, 'compras.editar', 'compras')
    const puedePagar = hasActionAccess(user, 'compras.pagar', 'compras')
    const puedeEntrega = hasActionAccess(user, 'compras.entrega', 'compras')
    const puedeExportar = hasActionAccess(user, 'compras.exportar', 'compras')
    const puedeAnular = hasActionAccess(user, 'compras.anular', 'compras')

    const toggleMenu = () => {
        if (!open && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect()
            const menuWidth = 210
            const viewportWidth = window.innerWidth
            const left = Math.max(12, Math.min(rect.right - menuWidth, viewportWidth - menuWidth - 12))
            setMenuPos({ top: rect.bottom + 6, left })
        }
        setOpen(prev => !prev)
    }

    const handleAction = callback => {
        setOpen(false)
        callback()
    }
    const pdfBusy = pdfOpeningId === compra.id
    const deletingBusy = deletingId === compra.id

    return (
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'flex-end', gap: 8, minWidth: 170 }}>
            <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onVer(compra)}
                title="Ver detalle"
            >
                <Eye size={14} /> Ver
            </button>
              <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={toggleMenu}
                  ref={buttonRef}
                  disabled={pdfBusy || deletingBusy}
              >
                 Acciones v
              </button>

            {open && (
                <>
                    <div
                        style={{ position: 'fixed', inset: 0, zIndex: 90 }}
                        onClick={() => setOpen(false)}
                    />
                      <div
                          style={{
                              position: 'fixed',
                              top: menuPos.top,
                              left: menuPos.left,
                              minWidth: 210,
                              background: 'var(--bg-card)',
                              border: '1px solid var(--border)',
                            borderRadius: 10,
                            boxShadow: '0 14px 34px rgba(0,0,0,0.45)',
                            padding: '6px 0',
                            zIndex: 100,
                        }}
                    >
                        {puedeEditar && (
                            <button className="dropdown-item" onClick={() => handleAction(() => onEditar(compra))}>
                                <Pencil size={14} style={{ marginRight: 8 }} /> Editar compra
                            </button>
                        )}
                        {puedeEntrega && (
                            <button className="dropdown-item" onClick={() => handleAction(() => onEntrega(compra))}>
                                <CheckSquare size={14} style={{ marginRight: 8 }} /> Cambiar entrega
                            </button>
                        )}
                        {puedePagar && compra.saldo > 0 && (
                            <button className="dropdown-item" onClick={() => handleAction(() => onPagar(compra))}>
                                <Wallet size={14} style={{ marginRight: 8 }} /> Gestionar pagos
                            </button>
                        )}
                        {puedeExportar && (
                            <button className="dropdown-item" onClick={() => handleAction(() => onPDF(compra))} disabled={pdfBusy}>
                                <FileText size={14} style={{ marginRight: 8 }} /> {pdfBusy ? 'Abriendo PDF...' : 'Abrir PDF'}
                            </button>
                        )}
                        {puedeAnular && (
                            <>
                                <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
                                <button
                                    className="dropdown-item"
                                    style={{ color: 'var(--danger)' }}
                                    onClick={() => handleAction(() => onEliminar(compra))}
                                    disabled={deletingBusy}
                                >
                                    <Trash2 size={14} style={{ marginRight: 8 }} /> {deletingBusy ? 'Eliminando...' : 'Eliminar compra'}
                                </button>
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}

export default function ComprasPage() {
    const queryClient = useQueryClient()
    const { user } = useAuth()
    const [buscar, setBuscar] = useState('')
    const [buscarDebounced, setBuscarDebounced] = useState('')
    const [estadoFiltro, setEstadoFiltro] = useState('')
    const [showCreate, setShowCreate] = useState(false)
    const [compraFormId, setCompraFormId] = useState(null)
    const [compraPago, setCompraPago] = useState(null)
    const [compraDetalle, setCompraDetalle] = useState(null)
    const [compraEntrega, setCompraEntrega] = useState(null)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(25)
    const [pdfOpeningId, setPdfOpeningId] = useState(null)
    const [deletingId, setDeletingId] = useState(null)

    useEffect(() => {
        const timer = setTimeout(() => setBuscarDebounced(buscar.trim()), 350)
        return () => clearTimeout(timer)
    }, [buscar])

    useEffect(() => {
        setPage(1)
    }, [buscarDebounced, estadoFiltro, pageSize])

    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['compras-optimizado', buscarDebounced, estadoFiltro, page, pageSize],
        queryFn: () => {
            const params = new URLSearchParams()
            params.append('page', String(page))
            params.append('page_size', String(pageSize))
            if (estadoFiltro) params.append('estado', estadoFiltro)
            if (buscarDebounced) params.append('search', buscarDebounced)
            return api.get(`/compras/listado-optimizado?${params.toString()}`).then(response => response.data)
        },
        retry: false,
    })

    const compras = data?.items || []
    const totalRegistros = data?.total || 0
    const totalPages = data?.total_pages || 1

    const eliminarCompra = useMutation({
        mutationFn: compraId => api.delete(`/compras/${compraId}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['compras'] })
            queryClient.invalidateQueries({ queryKey: ['compras-optimizado'] })
            queryClient.invalidateQueries({ queryKey: ['saldo-caja'] })
            queryClient.invalidateQueries({ queryKey: ['movimientos-caja'] })
            queryClient.invalidateQueries({ queryKey: ['bancos'] })
        },
        onSettled: () => {
            setDeletingId(null)
        },
    })

    const filtradas = compras

    const filtroLabel = estadoFiltro || 'TODOS'

    const abrirPDF = async compra => {
        if (pdfOpeningId === compra.id) return
        setPdfOpeningId(compra.id)
        try {
            await exportReportBlob(`/compras/${compra.id}/pdf`, 'application/pdf', { openInNewTab: true })
        } finally {
            setPdfOpeningId(null)
        }
    }

    return (
        <div className="page-body" style={{ overflowX: 'hidden' }}>
            <div
                className="mb-24"
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, background: 'rgba(245,158,11,0.15)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ShoppingCart size={20} style={{ color: 'var(--warning)' }} />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Compras</h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            {filtradas.length} compras visibles · filtro {filtroLabel}
                        </p>
                    </div>
                </div>
                {hasActionAccess(user, 'compras.crear', 'compras') && (
                    <button className="btn btn-primary" onClick={() => setShowCreate(true)} style={{ flexShrink: 0 }}>
                        <Plus size={16} /> Nueva Compra
                    </button>
                )}
            </div>

            <div className="card mb-16" style={{ padding: '14px 20px', display: 'grid', gap: 10, width: '100%', maxWidth: '100%' }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div className="search-bar" style={{ flex: '1 1 320px', minWidth: 240 }}>
                        <Search size={16} />
                        <input placeholder="Buscar por proveedor, factura, OS, venta o cliente..." value={buscar} onChange={event => setBuscar(event.target.value)} />
                    </div>
                    <select className="form-select" style={{ flex: '0 0 180px', width: 180 }} value={estadoFiltro} onChange={event => setEstadoFiltro(event.target.value)}>
                        <option value="">Todos</option>
                        <option value="PENDIENTE">PENDIENTE</option>
                        <option value="PAGADO">PAGADO</option>
                        <option value="VENCIDO">VENCIDO</option>
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
                </div>
                <div style={{ marginTop: 10, color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    {estadoFiltro
                        ? `Mostrando solo compras en estado ${estadoFiltro}.`
                        : 'Mostrando historial completo de compras.'}
                </div>
                {isError && (
                    <div style={{ marginTop: 12, background: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 12px', fontSize: '0.84rem' }}>
                        {error?.response?.data?.detail || 'No se pudieron cargar las compras.'}
                    </div>
                )}
            </div>

            <div className="card" style={{ padding: 0, width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
                {isLoading ? (
                    <div className="flex-center" style={{ padding: 60 }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>
                ) : filtradas.length === 0 ? (
                    <div className="empty-state"><ShoppingCart size={40} /><p>{estadoFiltro === 'PENDIENTE' ? 'No hay compras pendientes.' : 'No hay compras.'}</p></div>
                ) : (
                    <div className="table-container" style={{ width: '100%', maxWidth: '100%', overflowX: 'auto' }}>
                        <table style={{ minWidth: 1180, tableLayout: 'fixed' }}>
                            <thead>
                                <tr>
                                    <th style={{ width: 90 }}>Fecha</th>
                                    <th style={{ width: 220 }}>Proveedor</th>
                                    <th style={{ width: 130 }}>Nro. OS</th>
                                    <th style={{ width: 240 }}>Clientes</th>
                                    <th style={{ width: 220 }}>Documento actual</th>
                                    <th style={{ width: 110 }}>Total</th>
                                    <th style={{ width: 110 }}>Saldo</th>
                                    <th style={{ width: 110 }}>Condicion</th>
                                    <th style={{ width: 110 }}>Estado</th>
                                    <th style={{ width: 110 }}>Entrega</th>
                                    <th style={{ width: 190 }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtradas.map(compra => (
                                    <tr key={compra.id}>
                                        <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{fmtDate(compra.fecha)}</td>
                                        <td style={{ fontWeight: 500, whiteSpace: 'normal', lineHeight: 1.25, wordBreak: 'break-word' }}>{compra.proveedor_nombre || '-'}</td>
                                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontFamily: 'monospace', whiteSpace: 'normal', lineHeight: 1.25, wordBreak: 'break-word' }}>
                                            {(
                                                ((compra.tipo_documento_original || '').toUpperCase() === 'ORDEN_SERVICIO') ||
                                                ((compra.tipo_documento || '').toUpperCase() === 'ORDEN_SERVICIO') ||
                                                (compra.nro_documento_original && compra.nro_documento_original !== compra.nro_factura)
                                            )
                                                ? (compra.nro_documento_original || compra.nro_factura || '-')
                                                : '-'}
                                        </td>
                                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', whiteSpace: 'normal', lineHeight: 1.25, wordBreak: 'break-word' }}>
                                            {compra.clientes_nombres?.length ? compra.clientes_nombres.join(', ') : '-'}
                                        </td>
                                        <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'normal', lineHeight: 1.25, wordBreak: 'break-word' }}>
                                            {compra.tipo_documento} {compra.nro_factura || '-'}
                                        </td>
                                        <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Gs. {fmt(compra.total)}</td>
                                        <td style={{ color: compra.saldo > 0 ? 'var(--warning)' : 'var(--success)', fontWeight: compra.saldo > 0 ? 700 : 500, whiteSpace: 'nowrap' }}>{compra.saldo > 0 ? `Gs. ${fmt(compra.saldo)}` : 'OK'}</td>
                                        <td>{estadoBadge(compra.condicion_pago)}</td>
                                        <td>{estadoBadge(compra.estado)}</td>
                                        <td>{estadoBadge(compra.estado_entrega)}</td>
                                        <td style={{ whiteSpace: 'nowrap' }}>
                                            <CompraRowActions
                                                compra={compra}
                                                onVer={() => setCompraDetalle(compra)}
                                                onEditar={() => setCompraFormId(compra.id)}
                                                onPagar={() => setCompraPago(compra)}
                                                onEntrega={() => setCompraEntrega(compra)}
                                                onPDF={abrirPDF}
                                                onEliminar={item => {
                                                    if (confirm(`¿Eliminar la compra ${item.id}?\n- Revierte stock\n- Revierte pagos\n- No se puede deshacer`)) {
                                                        setDeletingId(item.id)
                                                        eliminarCompra.mutate(item.id)
                                                    }
                                                }}
                                                user={user}
                                                pdfOpeningId={pdfOpeningId}
                                                deletingId={deletingId}
                                            />
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
                    Mostrando pagina <strong>{page}</strong> de <strong>{totalPages}</strong> · <strong>{totalRegistros}</strong> compra{totalRegistros === 1 ? '' : 's'} encontradas
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

            {showCreate && <Modal title="Nueva Compra" onClose={() => setShowCreate(false)} maxWidth="1100px"><CompraFormModal onClose={() => setShowCreate(false)} /></Modal>}
            {compraFormId && <Modal title={`Editar Compra #${compraFormId}`} onClose={() => setCompraFormId(null)} maxWidth="1100px"><CompraFormModal compraId={compraFormId} onClose={() => setCompraFormId(null)} /></Modal>}
            {compraPago && <Modal title={`Gestion de Pagos: ${compraPago.proveedor_nombre || 'Compra'}`} onClose={() => setCompraPago(null)} maxWidth="720px"><PagoCompraModal compra={compraPago} onClose={() => setCompraPago(null)} /></Modal>}
            {compraDetalle && <Modal title={`Detalle Compra #${compraDetalle.id}`} onClose={() => setCompraDetalle(null)} maxWidth="980px"><DetalleCompraModal compraId={compraDetalle.id} onClose={() => setCompraDetalle(null)} /></Modal>}
            {compraEntrega && <Modal title={`Estado de Entrega: Compra #${compraEntrega.id}`} onClose={() => setCompraEntrega(null)} maxWidth="520px"><EstadoEntregaModal compra={compraEntrega} onClose={() => setCompraEntrega(null)} /></Modal>}
        </div>
    )
}
