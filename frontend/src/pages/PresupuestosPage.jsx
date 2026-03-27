// HESAKA Web — Página: Presupuestos
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../context/AuthContext'
import Modal from '../components/Modal'
import { FileText, Plus, Search, ShoppingBag, X, AlertCircle, ClipboardList } from 'lucide-react'
import usePendingNavigationGuard from '../utils/usePendingNavigationGuard'

const fmt = v => new Intl.NumberFormat('es-PY').format(v ?? 0)
const fmtDate = d => d ? new Date(d).toLocaleDateString('es-PY') : '—'
const abrirPresupuestoPdf = async presupuestoId => {
    const response = await api.get(`/presupuestos/${presupuestoId}/pdf`, { responseType: 'blob' })
    const file = new Blob([response.data], { type: 'application/pdf' })
    const fileURL = URL.createObjectURL(file)
    window.open(fileURL, '_blank')
    setTimeout(() => URL.revokeObjectURL(fileURL), 30000)
}
const estadoBadge = e => {
    const m = { PENDIENTE: 'badge-yellow', VENDIDO: 'badge-green', VENCIDO: 'badge-red', CANCELADO: 'badge-gray' }
    return <span className={`badge ${m[e] || 'badge-gray'}`}>{e}</span>
}

// Sub-formulario de ítem — con buscador de producto y precio visible
function ItemRow({ item, idx, onUpdate, onRemove }) {
    const [buscarProd, setBuscarProd] = useState(item.busq || '')
    const [showList, setShowList] = useState(false)
    const upd = (k, v) => onUpdate(idx, { ...item, [k]: v })
    const p = { nombre: item.busq || buscarProd || '' }
    const { data: filtrados = [] } = useQuery({
        queryKey: ['productos-select', buscarProd],
        queryFn: () => {
            const params = new URLSearchParams({ page: '1', page_size: '30', solo_activos: 'true' })
            if (buscarProd.trim()) params.append('buscar', buscarProd.trim())
            return api.get(`/productos/listado-optimizado?${params.toString()}`).then(r => r.data.items || [])
        },
        retry: false,
        enabled: showList,
    })

    const seleccionarProducto = (prod) => {
        let costoUnitario = Number(prod.costo || 0)
        if (prod.costo_variable) {
            const entered = window.prompt(`Ingrese el costo para ${prod.nombre}:`, String(costoUnitario || 0))
            if (entered === null) {
                costoUnitario = 0
            } else {
                const parsed = parseFloat(String(entered).replace(',', '.'))
                costoUnitario = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
            }
        }
        setBuscarProd(prod.nombre)
        setShowList(false)
        onUpdate(idx, {
            ...item,
            busq: prod.nombre,
            producto_id: prod.id,
            precio_unitario: prod.precio_venta,
            costo_unitario: costoUnitario,
            costo_variable: Boolean(prod.costo_variable),
            subtotal: prod.precio_venta * item.cantidad - item.descuento,
        })
    }

    return (
        <tr>
            <td style={{ minWidth: 220, position: 'relative' }}>
                <div style={{ position: 'relative' }}>
                    <input
                        className="form-input"
                        style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                        placeholder="Buscar producto..."
                        value={buscarProd}
                        onFocus={() => setShowList(true)}
                        onChange={e => { setBuscarProd(e.target.value); setShowList(true); if (!e.target.value) onUpdate(idx, { ...item, busq: '', producto_id: '', precio_unitario: 0, costo_unitario: 0, costo_variable: false, subtotal: 0 }) }}
                    />
                    {showList && (
                        <div style={{ position: 'absolute', zIndex: 999, top: '100%', left: 0, minWidth: 380, background: '#1a1d27', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, maxHeight: 300, overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.7)' }}
                            onMouseDown={e => e.preventDefault()}
                        >
                            {filtrados.length === 0 ? (
                                <div style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>Sin resultados</div>
                            ) : filtrados.map(prod => (
                                <div
                                    key={prod.id}
                                    onClick={() => seleccionarProducto(prod)}
                                    style={{ padding: '11px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.1s' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.12)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                    <span style={{ fontSize: '0.84rem', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{prod.nombre}</span>
                                    <span style={{ fontSize: '0.78rem', color: 'var(--success)', fontWeight: 700, flexShrink: 0, background: 'rgba(16,185,129,0.1)', borderRadius: 6, padding: '2px 8px' }}>Gs. {new Intl.NumberFormat('es-PY').format(prod.precio_venta)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <input
                    className="form-input"
                    style={{ marginTop: 4, padding: '4px 8px', fontSize: '0.78rem' }}
                    placeholder="Descripción personalizada"
                    value={item.descripcion_personalizada || ''}
                    onChange={e => upd('descripcion_personalizada', e.target.value)}
                    onFocus={() => setShowList(false)}
                />
                {item.producto_id ? (
                    <input
                        type="number"
                        className="form-input"
                        style={{ marginTop: 4, padding: '4px 8px', fontSize: '0.76rem' }}
                        placeholder={item.costo_variable ? 'Costo variable del item' : 'Costo del item'}
                        value={item.costo_unitario ?? 0}
                        min={0}
                        step="any"
                        onChange={e => upd('costo_unitario', Math.max(0, parseFloat(e.target.value) || 0))}
                        onFocus={() => setShowList(false)}
                    />
                ) : null}
                {(p && p.nombre.toLowerCase().includes('armaz')) && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                        <input className="form-input" style={{ width: '50%', padding: '4px', fontSize: '0.7rem' }} placeholder="Cód. armazón" value={item.codigo_armazon || ''} onChange={e => upd('codigo_armazon', e.target.value)} />
                        <input className="form-input" style={{ width: '50%', padding: '4px', fontSize: '0.7rem' }} placeholder="Medidas" value={item.medidas_armazon || ''} onChange={e => upd('medidas_armazon', e.target.value)} />
                    </div>
                )}
            </td>
            <td><input type="number" className="form-input" style={{ width: 70, padding: '6px 8px' }} value={item.cantidad} min={1}
                onChange={e => { const q = parseInt(e.target.value) || 1; onUpdate(idx, { ...item, cantidad: q, subtotal: item.precio_unitario * q - item.descuento }) }} /></td>
            <td><input type="number" className="form-input" style={{ width: 110, padding: '6px 8px' }} value={item.precio_unitario}
                onChange={e => { const pr = parseFloat(e.target.value) || 0; onUpdate(idx, { ...item, precio_unitario: pr, subtotal: pr * item.cantidad - item.descuento }) }} /></td>
            <td><input type="number" className="form-input" style={{ width: 90, padding: '6px 8px' }} value={item.descuento}
                onChange={e => { const d = parseFloat(e.target.value) || 0; onUpdate(idx, { ...item, descuento: d, subtotal: item.precio_unitario * item.cantidad - d }) }} /></td>
            <td style={{ fontWeight: 600, color: 'var(--primary-light)', whiteSpace: 'nowrap' }}>Gs. {fmt(item.subtotal)}</td>
            <td><button type="button" className="btn btn-danger btn-sm btn-icon" onClick={() => onRemove(idx)}><X size={13} /></button></td>
        </tr>
    )
}

// Modal para convertir presupuesto en venta
function ConvertirVentaModal({ presupuesto, onClose, onBusyChange }) {
    const qc = useQueryClient()
    const [metodo, setMetodo] = useState('EFECTIVO')
    const [bancoId, setBancoId] = useState('')
    const [monto, setMonto] = useState('')
    const [nota, setNota] = useState('')
    const [pagoInicial, setPagoInicial] = useState(false)

    const { data: bancos = [] } = useQuery({ queryKey: ['bancos'], queryFn: () => api.get('/bancos/').then(r => r.data) })

    const removerPresupuestoDeCache = presupuestoId => {
        const queries = qc.getQueriesData({ queryKey: ['presupuestos'] })
        for (const [queryKey, current] of queries) {
            const currentItems = Array.isArray(current)
                ? current
                : (Array.isArray(current?.items) ? current.items : null)
            if (!currentItems) continue
            const nextItems = currentItems.filter(item => item.id !== presupuestoId)
            qc.setQueryData(queryKey, Array.isArray(current) ? nextItems : { ...current, items: nextItems })
        }
    }

    const insertarVentaEnCache = ventaNueva => {
        if (!ventaNueva?.id) return
        const queries = qc.getQueriesData({ queryKey: ['ventas-optimizado'] })
        for (const [queryKey, current] of queries) {
            const currentItems = Array.isArray(current?.items) ? current.items : null
            if (!currentItems) continue
            const [, buscar = '', estado = '', entrega = '', vendedorId = '', canalId = '', soloPendientes = false, page = 1] = Array.isArray(queryKey) ? queryKey : []
            const coincideBusqueda = !buscar || `${ventaNueva.codigo || ''} ${ventaNueva.cliente_nombre || ''}`.toLowerCase().includes(String(buscar).toLowerCase())
            const coincideEstado = !estado || ventaNueva.estado === estado
            const coincideEntrega = !entrega || ventaNueva.estado_entrega === entrega
            const coincideVendedor = !vendedorId || String(ventaNueva.vendedor_id || '') === String(vendedorId)
            const coincideCanal = !canalId || String(ventaNueva.canal_venta_id || '') === String(canalId)
            const saldoVenta = Number(ventaNueva.saldo_pendiente ?? ventaNueva.saldo ?? 0)
            const coincidePendiente = !soloPendientes || saldoVenta > 0
            const coincidePrimeraPagina = Number(page) === 1
            if (!coincideBusqueda || !coincideEstado || !coincideEntrega || !coincideVendedor || !coincideCanal || !coincidePendiente || !coincidePrimeraPagina) continue
            const existe = currentItems.some(item => item.id === ventaNueva.id)
            if (existe) continue
            const nextItems = [ventaNueva, ...currentItems]
            qc.setQueryData(queryKey, {
                ...current,
                items: nextItems,
                total: typeof current?.total === 'number' ? current.total + 1 : current?.total,
            })
        }
    }

    const convertir = useMutation({
        mutationFn: pagos => api.post(`/presupuestos/${presupuesto.id}/convertir-venta`, pagos),
        onSuccess: response => {
            const ventaNueva = response?.data
            removerPresupuestoDeCache(presupuesto.id)
            insertarVentaEnCache(ventaNueva)
            onClose(ventaNueva)
            Promise.all([
                qc.invalidateQueries({ queryKey: ['presupuestos'] }),
                qc.invalidateQueries({ queryKey: ['ventas-optimizado'] }),
                qc.invalidateQueries({ queryKey: ['ventas'] }),
            ]).catch(() => {})
        }
    })
    const confirmNavigation = usePendingNavigationGuard(convertir.isPending, 'La conversion a venta aun se esta procesando. ¿Seguro que desea salir de esta vista?')

    useEffect(() => {
        onBusyChange?.(convertir.isPending)
        return () => onBusyChange?.(false)
    }, [convertir.isPending, onBusyChange])

    const handleSubmit = e => {
        e.preventDefault()
        const pagos = []
        if (pagoInicial && parseFloat(monto) > 0) {
            pagos.push({
                monto: parseFloat(monto),
                metodo_pago: metodo,
                banco_id: bancoId ? parseInt(bancoId) : null,
                nota: nota || null
            })
        }
        convertir.mutate(pagos)
    }

    return (
        <form onSubmit={handleSubmit}>
            <div style={{ background: 'rgba(26,86,219,0.06)', border: '1px solid rgba(26,86,219,0.15)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Cliente:</span>
                    <span style={{ fontWeight: 600 }}>{presupuesto.cliente_nombre}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Total a vender:</span>
                    <span style={{ fontWeight: 700, color: 'var(--primary-light)', fontSize: '1.05rem' }}>Gs. {new Intl.NumberFormat('es-PY').format(presupuesto.total)}</span>
                </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, cursor: 'pointer' }}>
                <input type="checkbox" checked={pagoInicial} onChange={e => setPagoInicial(e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--primary-light)' }} />
                <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Registrar cobro inicial</span>
            </label>
            {pagoInicial && (
                <>
                    <div className="grid-2 mb-16">
                        <div className="form-group">
                            <label className="form-label">Monto cobrado (Gs.)</label>
                            <input className="form-input" type="number" value={monto} onChange={e => setMonto(e.target.value)} placeholder="0" max={presupuesto.total} min={0} step="any" disabled={convertir.isPending} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Método</label>
                            <select className="form-select" value={metodo} onChange={e => setMetodo(e.target.value)} disabled={convertir.isPending}>
                                <option value="EFECTIVO">💵 Efectivo</option>
                                <option value="TARJETA">💳 Tarjeta</option>
                                <option value="TRANSFERENCIA">🏦 Transferencia</option>
                            </select>
                        </div>
                    </div>
                    {['TARJETA', 'TRANSFERENCIA'].includes(metodo) && (
                        <div className="form-group mb-16">
                            <label className="form-label">Banco *</label>
                            <select className="form-select" value={bancoId} onChange={e => setBancoId(e.target.value)} required disabled={convertir.isPending}>
                                <option value="">Seleccionar banco...</option>
                                {bancos.map(b => <option key={b.id} value={b.id}>{b.nombre_banco}</option>)}
                            </select>
                            {metodo === 'TARJETA' && <p style={{ fontSize: '0.72rem', color: 'var(--warning)', marginTop: 4 }}>⚠️ Se generará gasto automático por comisión bancaria.</p>}
                        </div>
                    )}
                    <div className="form-group mb-16">
                        <label className="form-label">Nota</label>
                        <input className="form-input" value={nota} onChange={e => setNota(e.target.value)} placeholder="Opcional..." disabled={convertir.isPending} />
                    </div>
                </>
            )}
            {convertir.isError && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#f87171', display: 'flex', gap: 8 }}>
                    <AlertCircle size={16} /> {convertir.error?.response?.data?.detail || 'Error al convertir.'}
                </div>
            )}
            <div className="flex gap-12" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => { if (confirmNavigation()) onClose() }} disabled={convertir.isPending}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={convertir.isPending}>
                    {convertir.isPending ? 'Confirmando venta...' : <><ShoppingBag size={15} /> Confirmar Venta</>}
                </button>
            </div>
        </form>
    )
}

function AsignacionComercialModal({ presupuesto, onClose, onBusyChange }) {
    const qc = useQueryClient()
    const [vendedor, setVendedor] = useState(presupuesto?.vendedor_id ? String(presupuesto.vendedor_id) : '')
    const [canalVenta, setCanalVenta] = useState(presupuesto?.canal_venta_id ? String(presupuesto.canal_venta_id) : '')
    const [error, setError] = useState('')

    const { data: vendedores = [] } = useQuery({ queryKey: ['presupuesto-asignacion-vendedores'], queryFn: () => api.get('/vendedores/?solo_activos=true&limit=100').then(r => r.data), retry: false })
    const { data: canalesVenta = [] } = useQuery({ queryKey: ['presupuesto-asignacion-canales'], queryFn: () => api.get('/canales-venta/?solo_activos=true&limit=100').then(r => r.data), retry: false })

    const guardar = useMutation({
        mutationFn: payload => api.patch(`/presupuestos/${presupuesto.id}/asignacion-comercial`, payload),
        onSuccess: () => {
            qc.invalidateQueries(['presupuestos'])
            qc.invalidateQueries(['ventas'])
            onClose()
        },
        onError: err => {
            setError(err?.response?.data?.detail || 'No se pudo actualizar la asignacion comercial.')
        }
    })

    useEffect(() => {
        onBusyChange?.(guardar.isPending)
        return () => onBusyChange?.(false)
    }, [guardar.isPending, onBusyChange])

    const submit = event => {
        event.preventDefault()
        setError('')
        guardar.mutate({
            vendedor_id: vendedor ? parseInt(vendedor, 10) : null,
            canal_venta_id: canalVenta ? parseInt(canalVenta, 10) : null,
        })
    }

    return (
        <form onSubmit={submit}>
            <div style={{ background: 'rgba(26,86,219,0.06)', border: '1px solid rgba(26,86,219,0.15)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Presupuesto:</span>
                    <span style={{ fontWeight: 700 }}>{presupuesto.codigo}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Cliente:</span>
                    <span style={{ fontWeight: 600 }}>{presupuesto.cliente_nombre || '—'}</span>
                </div>
            </div>

            <div className="grid-2 mb-16">
                <div className="form-group">
                    <label className="form-label">Vendedor</label>
                    <select className="form-select" value={vendedor} onChange={e => setVendedor(e.target.value)}>
                        <option value="">Sin vendedor asignado</option>
                        {vendedores.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}
                    </select>
                </div>
                <div className="form-group">
                    <label className="form-label">Canal de venta</label>
                    <select className="form-select" value={canalVenta} onChange={e => setCanalVenta(e.target.value)}>
                        <option value="">Canal principal</option>
                        {canalesVenta.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}
                    </select>
                </div>
            </div>

            {error && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#f87171' }}>
                    {error}
                </div>
            )}

            <div className="flex gap-12" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={onClose} disabled={guardar.isPending}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={guardar.isPending}>
                    {guardar.isPending ? 'Guardando...' : 'Guardar asignacion'}
                </button>
            </div>
        </form>
    )
}

const presupuestoCoincideConFiltro = (presupuesto, estadoFiltro, vendedorFiltro, canalFiltro) => {
    if (estadoFiltro && presupuesto.estado !== estadoFiltro) return false
    if (vendedorFiltro && String(presupuesto.vendedor_id || '') !== String(vendedorFiltro)) return false
    if (canalFiltro && String(presupuesto.canal_venta_id || '') !== String(canalFiltro)) return false
    return true
}

function NuevoPresupuestoModal({ onClose, presupuesto, onBusyChange }) {
    const qc = useQueryClient()
    const esEdicion = !!presupuesto
    const [cliente, setCliente] = useState(presupuesto ? String(presupuesto.cliente_id) : '')
    const [buscarCli, setBuscarCli] = useState(presupuesto ? (presupuesto.cliente_nombre || '') : '')
    const [showCliList, setShowCliList] = useState(false)
    const [clienteObj, setClienteObj] = useState(presupuesto ? {
        nombre: presupuesto.cliente_nombre,
        referidor_id: presupuesto.referidor_id || null,
        referidor_nombre: presupuesto.referidor_nombre || null,
    } : null)
    const blankItem = () => ({ producto_id: '', busq: '', cantidad: 1, precio_unitario: 0, costo_unitario: 0, costo_variable: false, descuento: 0, subtotal: 0 })
    const preItems = presupuesto?.items?.map(i => ({ ...i, busq: i.producto_nombre || '' })) || []
    const [items, setItems] = useState(esEdicion ? (preItems.length ? preItems : [blankItem()]) : [blankItem(), blankItem(), blankItem()])
    const [grad, setGrad] = useState(esEdicion ? {
        od_esfera: presupuesto.graduacion_od_esfera || '', od_cilindro: presupuesto.graduacion_od_cilindro || '',
        od_eje: presupuesto.graduacion_od_eje || '', od_adicion: presupuesto.graduacion_od_adicion || '',
        oi_esfera: presupuesto.graduacion_oi_esfera || '', oi_cilindro: presupuesto.graduacion_oi_cilindro || '',
        oi_eje: presupuesto.graduacion_oi_eje || '', oi_adicion: presupuesto.graduacion_oi_adicion || ''
    } : { od_esfera: '', od_cilindro: '', od_eje: '', od_adicion: '', oi_esfera: '', oi_cilindro: '', oi_eje: '', oi_adicion: '' })
    const tieneGrad = esEdicion && (presupuesto.graduacion_od_esfera || presupuesto.graduacion_oi_esfera)
    const [showGrad, setShowGrad] = useState(!!tieneGrad)
    const [doctor, setDoctor] = useState(presupuesto?.doctor_receta || '')
    const [obs, setObs] = useState(presupuesto?.observaciones || '')
    const [referidor, setReferidor] = useState(presupuesto?.referidor_id ? String(presupuesto.referidor_id) : '')
    const [vendedor, setVendedor] = useState(presupuesto?.vendedor_id ? String(presupuesto.vendedor_id) : '')
    const [canalVenta, setCanalVenta] = useState(presupuesto?.canal_venta_id ? String(presupuesto.canal_venta_id) : '')
    const [comision, setComision] = useState(presupuesto?.comision_monto || 0)
    const [comisionAlerta, setComisionAlerta] = useState(false)
    const [importandoGraduacion, setImportandoGraduacion] = useState(false)
    const [fecha, setFecha] = useState(
        presupuesto?.fecha ? presupuesto.fecha.split('T')[0] : new Date().toISOString().split('T')[0]
    )

    const { data: clientes = [] } = useQuery({ queryKey: ['clientes', buscarCli], queryFn: () => api.get(`/clientes/?buscar=${buscarCli}&limit=20`).then(r => r.data), retry: false, enabled: buscarCli.length >= 1 })
    const { data: referidores = [] } = useQuery({ queryKey: ['referidores'], queryFn: () => api.get('/referidores/').then(r => r.data), retry: false })
    const { data: vendedores = [] } = useQuery({ queryKey: ['vendedores-select'], queryFn: () => api.get('/vendedores/?solo_activos=true&limit=100').then(r => r.data), retry: false })
    const { data: canalesVenta = [] } = useQuery({ queryKey: ['canales-venta-select'], queryFn: () => api.get('/canales-venta/?solo_activos=true&limit=100').then(r => r.data), retry: false })
    const { data: estadoConfig } = useQuery({ queryKey: ['configuracion-general-estado'], queryFn: () => api.get('/configuracion-general/estado').then(r => r.data), retry: false })
    // Cargar último presupuesto del cliente para sugerir graduación
    const { data: clienteFicha, isFetching: clienteFichaLoading } = useQuery({
        queryKey: ['cliente-ficha-presupuesto', cliente],
        queryFn: () => api.get(`/clientes/${cliente}/ficha`).then(r => r.data),
        enabled: !!cliente, retry: false
    })
    const ultimosPresupuestos = clienteFicha?.ultima_graduacion ? [{
        graduacion_od_esfera: clienteFicha.ultima_graduacion.od_esfera || '',
        graduacion_od_cilindro: clienteFicha.ultima_graduacion.od_cilindro || '',
        graduacion_od_eje: clienteFicha.ultima_graduacion.od_eje || '',
        graduacion_od_adicion: clienteFicha.ultima_graduacion.od_adicion || '',
        graduacion_oi_esfera: clienteFicha.ultima_graduacion.oi_esfera || '',
        graduacion_oi_cilindro: clienteFicha.ultima_graduacion.oi_cilindro || '',
        graduacion_oi_eje: clienteFicha.ultima_graduacion.oi_eje || '',
        graduacion_oi_adicion: clienteFicha.ultima_graduacion.oi_adicion || '',
        doctor_receta: clienteFicha.ultima_graduacion.doctor || '',
        observaciones: clienteFicha.ultima_graduacion.observaciones || '',
    }] : []

    // Cuando se selecciona un cliente: auto-asignar referidor
    useEffect(() => {
        if (!clienteObj) { setReferidor(''); setComision(0); return }
        if (clienteObj.referidor_id) {
            setReferidor(String(clienteObj.referidor_id))
        } else {
            setReferidor('')
            setComision(0)
        }
    }, [clienteObj])

    useEffect(() => {
        if (canalVenta || presupuesto) return
        const nombreCanalPrincipal = estadoConfig?.canal_principal_nombre
        const canalDefault = canalesVenta.find(item => item.nombre === nombreCanalPrincipal) || canalesVenta[0]
        if (canalDefault) setCanalVenta(String(canalDefault.id))
    }, [canalesVenta, canalVenta, presupuesto, estadoConfig])

    const seleccionarCliente = (c) => {
        setClienteObj(c)
        setCliente(String(c.id))
        setBuscarCli(`${c.nombre}${c.ci ? ` (${c.ci})` : ''}`)
        setShowCliList(false)
    }

    const importarGraduacion = async () => {
        if (!cliente || importandoGraduacion) return
        setImportandoGraduacion(true)
        try {
            const ficha = clienteFicha || await api.get(`/clientes/${cliente}/ficha`).then(r => r.data)
            const conGrad = ficha?.ultima_graduacion || ultimosPresupuestos.find(p =>
                p.graduacion_od_esfera || p.graduacion_oi_esfera
            )
        if (!conGrad) { alert('No se encontró historial de graduación para este cliente.'); return }
        setGrad({
            od_esfera: conGrad.graduacion_od_esfera || '',
            od_cilindro: conGrad.graduacion_od_cilindro || '',
            od_eje: conGrad.graduacion_od_eje || '',
            od_adicion: conGrad.graduacion_od_adicion || '',
            oi_esfera: conGrad.graduacion_oi_esfera || '',
            oi_cilindro: conGrad.graduacion_oi_cilindro || '',
            oi_eje: conGrad.graduacion_oi_eje || '',
            oi_adicion: conGrad.graduacion_oi_adicion || '',
        })
        if (conGrad.doctor_receta) setDoctor(conGrad.doctor_receta)
        if (conGrad.observaciones) setObs(conGrad.observaciones)
        setShowGrad(true)
        } finally {
            setImportandoGraduacion(false)
        }
    }

    const importarGraduacionDesdeFicha = async () => {
        if (!cliente || importandoGraduacion) return
        setImportandoGraduacion(true)
        try {
            const ficha = clienteFicha || await api.get(`/clientes/${cliente}/ficha`).then(r => r.data)
            const gradFicha = ficha?.ultima_graduacion
            if (!gradFicha) {
                alert('No se encontró historial de graduación para este cliente.')
                return
            }
            setGrad({
                od_esfera: gradFicha.od_esfera || '',
                od_cilindro: gradFicha.od_cilindro || '',
                od_eje: gradFicha.od_eje || '',
                od_adicion: gradFicha.od_adicion || '',
                oi_esfera: gradFicha.oi_esfera || '',
                oi_cilindro: gradFicha.oi_cilindro || '',
                oi_eje: gradFicha.oi_eje || '',
                oi_adicion: gradFicha.oi_adicion || '',
            })
            if (gradFicha.doctor) setDoctor(gradFicha.doctor)
            if (gradFicha.observaciones) setObs(gradFicha.observaciones)
            setShowGrad(true)
        } finally {
            setImportandoGraduacion(false)
        }
    }

    const actualizarCachePresupuestos = (presupuestoActualizado) => {
        const queries = qc.getQueriesData({ queryKey: ['presupuestos'] })
        for (const [queryKey, current] of queries) {
            const currentItems = Array.isArray(current)
                ? current
                : (Array.isArray(current?.items) ? current.items : null)
            if (!currentItems) continue
            const [, estadoActual = '', vendedorActual = '', canalActual = ''] = Array.isArray(queryKey) ? queryKey : []
            const coincide = presupuestoCoincideConFiltro(presupuestoActualizado, estadoActual, vendedorActual, canalActual)
            const existente = currentItems.some(item => item.id === presupuestoActualizado.id)

            if (esEdicion) {
                if (existente && !coincide) {
                    const nextItems = currentItems.filter(item => item.id !== presupuestoActualizado.id)
                    qc.setQueryData(queryKey, Array.isArray(current) ? nextItems : { ...current, items: nextItems })
                    continue
                }
                if (coincide) {
                    const actualizado = existente
                        ? currentItems.map(item => item.id === presupuestoActualizado.id ? presupuestoActualizado : item)
                        : [presupuestoActualizado, ...currentItems]
                    const limited = actualizado.slice(0, 100)
                    qc.setQueryData(queryKey, Array.isArray(current) ? limited : { ...current, items: limited })
                }
                continue
            }

            if (coincide && !existente) {
                const nextItems = [presupuestoActualizado, ...currentItems].slice(0, 100)
                qc.setQueryData(queryKey, Array.isArray(current) ? nextItems : { ...current, items: nextItems })
            }
        }
    }

    const crear = useMutation({
        mutationFn: d => esEdicion
            ? api.put(`/presupuestos/${presupuesto.id}`, d)
            : api.post('/presupuestos/', d),
        onSuccess: async (response) => {
            const presupuestoActualizado = response?.data
            if (presupuestoActualizado) actualizarCachePresupuestos(presupuestoActualizado)
            await qc.invalidateQueries({ queryKey: ['presupuestos'] })
            onClose()
        }
    })
    const confirmNavigation = usePendingNavigationGuard(
        crear.isPending,
        esEdicion
            ? 'Los cambios del presupuesto aun se estan guardando. ¿Seguro que desea salir de esta vista?'
            : 'El presupuesto aun se esta guardando. ¿Seguro que desea salir de esta vista?'
    )

    useEffect(() => {
        onBusyChange?.(crear.isPending)
        return () => onBusyChange?.(false)
    }, [crear.isPending, onBusyChange])

    const total = items.reduce((s, i) => s + (i.subtotal || 0), 0)
    const addItem = () => setItems(p => [...p, blankItem()])
    const updItem = (idx, v) => { const a = [...items]; a[idx] = v; setItems(a) }
    const remItem = idx => setItems(p => p.filter((_, i) => i !== idx))

    const handleSubmit = e => {
        e.preventDefault()
        if (!cliente) return
        // Alerta si hay referidor pero sin comisión
        if (referidor && (!comision || parseFloat(comision) === 0)) {
            if (!window.confirm('El referidor seleccionado no tiene comisión asignada. ¿Desea guardar el presupuesto igual?')) return
        }
        crear.mutate({
            cliente_id: parseInt(cliente),
            fecha: fecha || new Date().toISOString(),
            graduacion_od_esfera: grad.od_esfera || null, graduacion_od_cilindro: grad.od_cilindro || null,
            graduacion_od_eje: grad.od_eje || null, graduacion_od_adicion: grad.od_adicion || null,
            graduacion_oi_esfera: grad.oi_esfera || null, graduacion_oi_cilindro: grad.oi_cilindro || null,
            graduacion_oi_eje: grad.oi_eje || null, graduacion_oi_adicion: grad.oi_adicion || null,
            doctor_receta: doctor || null, observaciones: obs || null,
            referidor_id: referidor ? parseInt(referidor) : null,
            vendedor_id: vendedor ? parseInt(vendedor) : null,
            canal_venta_id: canalVenta ? parseInt(canalVenta) : null,
            comision_monto: parseFloat(comision) || 0,
            items: items.filter(i => i.producto_id).map(i => ({
                id: i.id || null,
                producto_id: parseInt(i.producto_id), cantidad: i.cantidad,
                precio_unitario: i.precio_unitario, costo_unitario: i.costo_unitario || 0,
                descuento: i.descuento || 0, subtotal: i.subtotal,
                descripcion_personalizada: i.descripcion_personalizada || null,
                codigo_armazon: i.codigo_armazon || null,
                medidas_armazon: i.medidas_armazon || null,
            }))
        })
    }

    const gInput = (k, label) => (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</label>
            <input className="form-input" style={{ padding: '5px 8px', textAlign: 'center', fontSize: '0.82rem' }}
                value={grad[k]} onChange={e => setGrad(p => ({ ...p, [k]: e.target.value }))} placeholder="—" />
        </div>
    )

    return (
        <form onSubmit={handleSubmit}>
            {/* Cliente — autocomplete en tiempo real */}
            <div style={{ marginBottom: 20, position: 'relative' }}>
                <label className="form-label">Cliente *</label>
                <div style={{ position: 'relative' }}>
                    <input
                        className="form-input"
                        placeholder="Buscar cliente por nombre o CI..."
                        value={buscarCli}
                        onFocus={() => setShowCliList(true)}
                        onChange={e => {
                            setBuscarCli(e.target.value)
                            setShowCliList(true)
                            if (!e.target.value) { setCliente(''); setClienteObj(null) }
                        }}
                        required={!cliente}
                    />
                    {showCliList && buscarCli.length >= 1 && (
                        <div
                            style={{ position: 'absolute', zIndex: 999, top: '100%', left: 0, right: 0, background: '#1a1d27', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, maxHeight: 240, overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.7)' }}
                            onMouseDown={e => e.preventDefault()}
                        >
                            {clientes.length === 0 ? (
                                <div style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>Sin resultados</div>
                            ) : clientes.map(c => (
                                <div
                                    key={c.id}
                                    onClick={() => seleccionarCliente(c)}
                                    style={{ padding: '11px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.1s' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.12)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                    <span style={{ fontSize: '0.88rem', fontWeight: 500 }}>{c.nombre}</span>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                                        {c.ci && <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>CI: {c.ci}</span>}
                                        {c.telefono && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{c.telefono}</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                {clienteObj && (
                    <div style={{ marginTop: 8, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 8, padding: '10px 14px', display: 'flex', flexWrap: 'wrap', gap: '6px 24px' }}>
                        {clienteObj.ci && <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}><span style={{ color: 'var(--text-muted)' }}>CI:</span> {clienteObj.ci}</span>}
                        {clienteObj.telefono && <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}><span style={{ color: 'var(--text-muted)' }}>Tel:</span> {clienteObj.telefono}</span>}
                        {clienteObj.email && <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}><span style={{ color: 'var(--text-muted)' }}>Email:</span> {clienteObj.email}</span>}
                        {clienteObj.direccion && <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}><span style={{ color: 'var(--text-muted)' }}>Dir:</span> {clienteObj.direccion}</span>}
                        {clienteObj.referidor_nombre && <span style={{ fontSize: '0.78rem', color: 'var(--info)' }}>ℹ️ Referidor: <strong>{clienteObj.referidor_nombre}</strong></span>}
                    </div>
                )}
                {buscarCli && !cliente && (
                    <p style={{ fontSize: '0.72rem', color: 'var(--warning)', marginTop: 4 }}>⚠️ Seleccioná un cliente de la lista.</p>
                )}
            </div>

            {/* Graduación — colapsable con importación de historial */}
            <div className="card" style={{ padding: 0, marginBottom: 16, background: 'rgba(255,255,255,0.025)', overflow: 'hidden' }}>
                <button
                    type="button"
                    onClick={() => setShowGrad(v => !v)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', background: 'none', color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 600 }}
                >
                    <span>🔬 Graduación Óptica <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.75rem' }}>(opcional)</span></span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {cliente && (
                            <span
                                onClick={e => { e.stopPropagation(); importarGraduacionDesdeFicha() }}
                                style={{ fontSize: '0.7rem', color: 'var(--info)', background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}
                                title="Importar la última graduación disponible del cliente"
                            >
                                {importandoGraduacion || clienteFichaLoading ? 'Cargando historial...' : '📝 Importar historial'}
                            </span>
                        )}
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'inline-block', transform: showGrad ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                    </div>
                </button>
                {showGrad && (
                    <div style={{ padding: '0 16px 14px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr 1fr', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}></div>
                            {['Esfera', 'Cilindro', 'Eje', 'Adición'].map(h => (
                                <div key={h} style={{ textAlign: 'center', fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</div>
                            ))}
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>OD</div>
                            {gInput('od_esfera', '')} {gInput('od_cilindro', '')} {gInput('od_eje', '')} {gInput('od_adicion', '')}
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>OI</div>
                            {gInput('oi_esfera', '')} {gInput('oi_cilindro', '')} {gInput('oi_eje', '')} {gInput('oi_adicion', '')}
                        </div>
                        <div style={{ maxWidth: 260 }}>
                            <label className="form-label">Doctor / Receta</label>
                            <input className="form-input" value={doctor} onChange={e => setDoctor(e.target.value)} placeholder="Nombre del doctor" />
                        </div>
                    </div>
                )}
            </div>

            {/* Referidor */}
            <div className="grid-2 mb-16">
                <div className="form-group">
                    <label className="form-label">Referidor</label>
                    <select
                        className="form-select"
                        value={referidor}
                        onChange={e => { setReferidor(e.target.value); if (!e.target.value) setComision(0) }}
                        style={{ background: '#1a1d27', color: 'var(--text-primary)' }}
                    >
                        <option value="" style={{ background: '#1a1d27' }}>Sin referidor</option>
                        {referidores.map(r => <option key={r.id} value={r.id} style={{ background: '#1a1d27' }}>{r.nombre}</option>)}
                    </select>
                </div>
                <div className="form-group">
                    <label className="form-label">Comisión (Gs.)</label>
                    <input
                        className="form-input"
                        type="number"
                        value={comision}
                        onChange={e => setComision(e.target.value)}
                        placeholder="0"
                        disabled={!referidor}
                        style={{ opacity: !referidor ? 0.4 : 1 }}
                    />
                    {referidor && (!comision || parseFloat(comision) === 0) && (
                        <p style={{ fontSize: '0.72rem', color: 'var(--warning)', marginTop: 4 }}>⚠️ Referidor sin comisión asignada.</p>
                    )}
                </div>
            </div>

            <div className="grid-2 mb-16">
                <div className="form-group">
                    <label className="form-label">Vendedor</label>
                    <select
                        className="form-select"
                        value={vendedor}
                        onChange={e => setVendedor(e.target.value)}
                        style={{ background: '#1a1d27', color: 'var(--text-primary)' }}
                    >
                        <option value="" style={{ background: '#1a1d27' }}>Sin vendedor asignado</option>
                        {vendedores.map(v => <option key={v.id} value={v.id} style={{ background: '#1a1d27' }}>{v.nombre}</option>)}
                    </select>
                </div>
                <div className="form-group">
                    <label className="form-label">Canal de venta</label>
                    <select
                        className="form-select"
                        value={canalVenta}
                        onChange={e => setCanalVenta(e.target.value)}
                        style={{ background: '#1a1d27', color: 'var(--text-primary)' }}
                    >
                        <option value="" style={{ background: '#1a1d27' }}>{estadoConfig?.canal_principal_nombre || 'Canal principal'}</option>
                        {canalesVenta.map(c => <option key={c.id} value={c.id} style={{ background: '#1a1d27' }}>{c.nombre}</option>)}
                    </select>
                </div>
            </div>

            {/* Items */}
            <div style={{ marginBottom: 16 }}>
                <div className="flex-between mb-16">
                    <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>Ítems del Presupuesto</p>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={addItem}><Plus size={14} /> Agregar ítem</button>
                </div>
                <div className="table-container">
                    <table>
                        <thead>
                            <tr><th>Producto / Descripción</th><th>Cant.</th><th>Precio unit.</th><th>Descuento</th><th>Subtotal</th><th></th></tr>
                        </thead>
                        <tbody>
                            {items.map((item, idx) => (
                                <ItemRow key={idx} item={item} idx={idx} onUpdate={updItem} onRemove={remItem} />
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Fecha + Observaciones */}
            <div className="grid-2 mb-16">
                <div className="form-group">
                    <label className="form-label">Fecha de Emisión</label>
                    <input
                        className="form-input"
                        type="date"
                        value={fecha}
                        onChange={e => setFecha(e.target.value)}
                    />
                </div>
                <div className="form-group">
                    <label className="form-label">Observaciones</label>
                    <textarea className="form-input" rows={2} value={obs} onChange={e => setObs(e.target.value)} placeholder="Observaciones del presupuesto..." style={{ resize: 'vertical' }} />
                </div>
            </div>

            {/* Total */}
            <div style={{ background: 'rgba(26,86,219,0.08)', border: '1px solid rgba(26,86,219,0.2)', borderRadius: 10, padding: '14px 20px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>TOTAL</span>
                <span style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--primary-light)' }}>Gs. {fmt(total)}</span>
            </div>

            {crear.isError && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#f87171', display: 'flex', gap: 8 }}>
                    <AlertCircle size={16} /> {crear.error?.response?.data?.detail || 'Error al guardar.'}
                </div>
            )}

            <div className="flex gap-12" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => { if (confirmNavigation()) onClose() }} disabled={crear.isPending}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={crear.isPending}>
                    {crear.isPending ? <span className="spinner" style={{ width: 16, height: 16 }} /> : <>{esEdicion ? '💾 Guardar Cambios' : <><FileText size={15} /> Guardar Presupuesto</>}</>}
                </button>
            </div>
        </form>
    )
}

export default function PresupuestosPage() {
    const qc = useQueryClient()
    const [buscar, setBuscar] = useState('')
    const [modal, setModal] = useState(false)
    const [editarPre, setEditarPre] = useState(null)     // presupuesto a editar
    const [asignacionPre, setAsignacionPre] = useState(null)
    const [estadoFiltro, setEstadoFiltro] = useState('')
    const [vendedorFiltro, setVendedorFiltro] = useState('')
    const [canalFiltro, setCanalFiltro] = useState('')
    const [convertirPre, setConvertirPre] = useState(null)
    const [pdfOpeningId, setPdfOpeningId] = useState(null)
    const [convertingId, setConvertingId] = useState(null)
    const [editingId, setEditingId] = useState(null)
    const [cancelingId, setCancelingId] = useState(null)
    const [deletingId, setDeletingId] = useState(null)
    const [presupuestoModalBusy, setPresupuestoModalBusy] = useState(false)
    const [convertirModalBusy, setConvertirModalBusy] = useState(false)
    const [asignacionModalBusy, setAsignacionModalBusy] = useState(false)
    const hasPendingNavigation = Boolean(pdfOpeningId || cancelingId || deletingId)
    const confirmNavigation = usePendingNavigationGuard(hasPendingNavigation, 'Hay una accion de presupuesto aun en proceso. ¿Seguro que desea salir de esta vista?')

    const { data: vendedoresFiltro = [] } = useQuery({ queryKey: ['presupuestos-vendedores-filtro'], queryFn: () => api.get('/vendedores/?solo_activos=true&limit=200').then(r => r.data), retry: false })
    const { data: canalesFiltro = [] } = useQuery({ queryKey: ['presupuestos-canales-filtro'], queryFn: () => api.get('/canales-venta/?solo_activos=true&limit=200').then(r => r.data), retry: false })

    const { data: presupuestosData, isLoading } = useQuery({
        queryKey: ['presupuestos', estadoFiltro, vendedorFiltro, canalFiltro, buscar],
        queryFn: () => {
            const params = new URLSearchParams({ page: '1', page_size: '100' })
            if (estadoFiltro) params.append('estado', estadoFiltro)
            if (vendedorFiltro) params.append('vendedor_id', vendedorFiltro)
            if (canalFiltro) params.append('canal_venta_id', canalFiltro)
            if (buscar.trim()) params.append('search', buscar.trim())
            return api.get(`/presupuestos/listado-optimizado?${params.toString()}`).then(r => r.data)
        },
        retry: false,
    })

    const presupuestos = Array.isArray(presupuestosData?.items) ? presupuestosData.items : []
    const filtrados = presupuestos

    const cambiarEstado = useMutation({
        mutationFn: ({ id, estado }) => api.patch(`/presupuestos/${id}/estado?estado=${estado}`),
        onSuccess: () => qc.invalidateQueries(['presupuestos']),
        onSettled: () => setCancelingId(null)
    })

    const eliminar = useMutation({
        mutationFn: (id) => api.delete(`/presupuestos/${id}`),
        onSuccess: () => qc.invalidateQueries(['presupuestos']),
        onSettled: () => setDeletingId(null)
    })

    const handleAbrirPdf = async (presupuestoId) => {
        if (pdfOpeningId === presupuestoId) return
        setPdfOpeningId(presupuestoId)
        try {
            await abrirPresupuestoPdf(presupuestoId)
        } catch (error) {
            window.alert(error?.response?.data?.detail || 'No se pudo cargar el PDF del presupuesto.')
        } finally {
            setTimeout(() => {
                setPdfOpeningId(current => (current === presupuestoId ? null : current))
            }, 1500)
        }
    }

    const handleEditar = async (presupuestoId) => {
        if (editingId === presupuestoId) return
        setEditingId(presupuestoId)
        try {
            const response = await api.get(`/presupuestos/${presupuestoId}`)
            setEditarPre(response.data)
        } catch (error) {
            window.alert(error?.response?.data?.detail || 'No se pudo cargar el presupuesto para editar.')
        } finally {
            setEditingId(null)
        }
    }

    const handleEliminar = (p) => {
        if (deletingId === p.id) return
        if (window.confirm(`¿Eliminar el presupuesto ${p.codigo}? Esta acción no se puede deshacer.`)) {
            setDeletingId(p.id)
            eliminar.mutate(p.id)
        }
    }

    return (
        <div className="page-body">
            <div className="flex-between mb-24">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, background: 'rgba(6,182,212,0.15)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <FileText size={20} style={{ color: 'var(--info)' }} />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Presupuestos</h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{filtrados.length} presupuestos</p>
                    </div>
                </div>
                <button className="btn btn-primary" onClick={() => setModal(true)}><Plus size={16} /> Nuevo Presupuesto</button>
            </div>

            {/* Filtros */}
            <div className="card mb-16" style={{ padding: '14px 20px' }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <div className="search-bar" style={{ flex: 1, minWidth: 200 }}>
                        <Search size={16} />
                        <input placeholder="Buscar por cliente o código..." value={buscar} onChange={e => setBuscar(e.target.value)} />
                    </div>
                    <select className="form-select" style={{ width: 160 }} value={estadoFiltro} onChange={e => setEstadoFiltro(e.target.value)}>
                        <option value="">Todos los estados</option>
                        {['PENDIENTE', 'VENDIDO', 'VENCIDO', 'CANCELADO'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <select className="form-select" style={{ width: 180 }} value={vendedorFiltro} onChange={e => setVendedorFiltro(e.target.value)}>
                        <option value="">Todos los vendedores</option>
                        {vendedoresFiltro.map(vendedor => <option key={vendedor.id} value={vendedor.id}>{vendedor.nombre}</option>)}
                    </select>
                    <select className="form-select" style={{ width: 180 }} value={canalFiltro} onChange={e => setCanalFiltro(e.target.value)}>
                        <option value="">Todos los canales</option>
                        {canalesFiltro.map(canal => <option key={canal.id} value={canal.id}>{canal.nombre}</option>)}
                    </select>
                </div>
            </div>

            <div className="card" style={{ padding: 0 }}>
                {isLoading ? (
                    <div className="flex-center" style={{ padding: 60 }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>
                ) : filtrados.length === 0 ? (
                    <div className="empty-state"><FileText size={40} /><p>No hay presupuestos.</p></div>
                ) : (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr><th>Código</th><th>Fecha</th><th>Cliente</th><th>Vendedor</th><th>Canal</th><th>OD</th><th>OI</th><th>Total</th><th>Estado</th><th>Acciones</th></tr>
                            </thead>
                            <tbody>
                                {filtrados.map(p => {
                                    const rowBusy = pdfOpeningId === p.id || cancelingId === p.id || deletingId === p.id || editingId === p.id || convertingId === p.id
                                    return (
                                    <tr key={p.id}>
                                        <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{p.codigo}</td>
                                        <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{fmtDate(p.fecha)}</td>
                                        <td style={{ fontWeight: 500 }}>{p.cliente_nombre || '—'}</td>
                                        <td style={{ color: 'var(--text-secondary)', whiteSpace: 'normal', lineHeight: 1.25, wordBreak: 'break-word' }}>{p.vendedor_nombre || '—'}</td>
                                        <td style={{ color: 'var(--text-secondary)', whiteSpace: 'normal', lineHeight: 1.25, wordBreak: 'break-word' }}>{p.canal_venta_nombre || 'Canal principal'}</td>
                                        <td style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                            {[p.graduacion_od_esfera, p.graduacion_od_cilindro, p.graduacion_od_eje].filter(Boolean).join(' / ') || '—'}
                                        </td>
                                        <td style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                            {[p.graduacion_oi_esfera, p.graduacion_oi_cilindro, p.graduacion_oi_eje].filter(Boolean).join(' / ') || '—'}
                                        </td>
                                        <td style={{ fontWeight: 600 }}>Gs. {fmt(p.total)}</td>
                                        <td>{estadoBadge(p.estado)}</td>
                                        <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                            {['PENDIENTE', 'BORRADOR'].includes(p.estado) && (
                                                <>
                                                    <button className="btn btn-secondary btn-sm" style={{ fontSize: '0.72rem' }} onClick={() => handleAbrirPdf(p.id)} disabled={rowBusy}>
                                                        <FileText size={12} /> {pdfOpeningId === p.id ? 'Abriendo PDF...' : 'PDF'}
                                                    </button>
                                                    <button className="btn btn-primary btn-sm" style={{ fontSize: '0.72rem' }} onClick={() => setConvertirPre(p)} disabled={rowBusy}>
                                                        <ShoppingBag size={12} /> Vender
                                                    </button>
                                                    <button className="btn btn-secondary btn-sm" style={{ fontSize: '0.72rem' }} onClick={() => handleEditar(p.id)} disabled={rowBusy}>
                                                        {editingId === p.id ? 'Cargando...' : '✏️ Editar'}
                                                    </button>
                                                    <button className="btn btn-secondary btn-sm" style={{ fontSize: '0.72rem', color: 'var(--warning)' }} onClick={() => { setCancelingId(p.id); cambiarEstado.mutate({ id: p.id, estado: 'CANCELADO' }) }} disabled={rowBusy}>
                                                        Cancelar
                                                    </button>
                                                </>
                                            )}
                                            {p.estado !== 'VENDIDO' && (
                                                <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleEliminar(p)} title="Eliminar" disabled={rowBusy}>
                                                    <X size={12} />
                                                </button>
                                            )}
                                            {p.estado === 'VENDIDO' && (
                                                <button className="btn btn-secondary btn-sm" style={{ fontSize: '0.72rem' }} onClick={() => handleAbrirPdf(p.id)} disabled={rowBusy}>
                                                    <FileText size={12} /> {pdfOpeningId === p.id ? 'Abriendo PDF...' : 'PDF'}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {modal && (
                <Modal
                    title="Nuevo Presupuesto"
                    onClose={() => setModal(false)}
                    maxWidth="860px"
                    closeDisabled={presupuestoModalBusy}
                    onCloseAttempt={() => window.alert('El presupuesto aun se esta guardando. Espera a que termine antes de cerrar.')}
                >
                    <NuevoPresupuestoModal onClose={() => setModal(false)} onBusyChange={setPresupuestoModalBusy} />
                </Modal>
            )}
            {editarPre && (
                <Modal
                    title={`Editar ${editarPre.codigo}`}
                    onClose={() => { setEditingId(null); setEditarPre(null) }}
                    maxWidth="860px"
                    closeDisabled={presupuestoModalBusy}
                    onCloseAttempt={() => window.alert('Los cambios del presupuesto aun se estan guardando. Espera a que termine antes de cerrar.')}
                >
                    <NuevoPresupuestoModal
                        presupuesto={editarPre}
                        onClose={() => { setEditingId(null); setEditarPre(null) }}
                        onBusyChange={setPresupuestoModalBusy}
                    />
                </Modal>
            )}
            {convertirPre && (
                <Modal
                    title={`Convertir ${convertirPre.codigo} en Venta`}
                    onClose={() => { setConvertingId(null); setConvertirPre(null) }}
                    maxWidth="500px"
                    closeDisabled={convertirModalBusy}
                    onCloseAttempt={() => window.alert('La conversion a venta aun se esta procesando. Espera a que termine antes de cerrar.')}
                >
                    <ConvertirVentaModal presupuesto={convertirPre} onClose={() => { setConvertingId(null); setConvertirPre(null) }} onBusyChange={setConvertirModalBusy} />
                </Modal>
            )}
            {asignacionPre && (
                <Modal
                    title={`Asignacion comercial ${asignacionPre.codigo}`}
                    onClose={() => setAsignacionPre(null)}
                    maxWidth="560px"
                    closeDisabled={asignacionModalBusy}
                    onCloseAttempt={() => window.alert('La asignacion comercial aun se esta guardando. Espera a que termine antes de cerrar.')}
                >
                    <AsignacionComercialModal presupuesto={asignacionPre} onClose={() => setAsignacionPre(null)} onBusyChange={setAsignacionModalBusy} />
                </Modal>
            )}
        </div>
    )
}
