// HESAKA Web — Página: Presupuestos
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../context/AuthContext'
import Modal from '../components/Modal'
import { FileText, Plus, Search, ShoppingBag, X, AlertCircle, ClipboardList } from 'lucide-react'

const fmt = v => new Intl.NumberFormat('es-PY').format(v ?? 0)
const fmtDate = d => d ? new Date(d).toLocaleDateString('es-PY') : '—'
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
        setBuscarProd(prod.nombre)
        setShowList(false)
        onUpdate(idx, { ...item, busq: prod.nombre, producto_id: prod.id, precio_unitario: prod.precio_venta, costo_unitario: prod.costo || 0, subtotal: prod.precio_venta * item.cantidad - item.descuento })
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
                        onChange={e => { setBuscarProd(e.target.value); setShowList(true); if (!e.target.value) onUpdate(idx, { ...item, busq: '', producto_id: '', precio_unitario: 0, costo_unitario: 0, subtotal: 0 }) }}
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
function ConvertirVentaModal({ presupuesto, onClose }) {
    const qc = useQueryClient()
    const [metodo, setMetodo] = useState('EFECTIVO')
    const [bancoId, setBancoId] = useState('')
    const [monto, setMonto] = useState('')
    const [nota, setNota] = useState('')
    const [pagoInicial, setPagoInicial] = useState(false)

    const { data: bancos = [] } = useQuery({ queryKey: ['bancos'], queryFn: () => api.get('/bancos/').then(r => r.data) })

    const convertir = useMutation({
        mutationFn: pagos => api.post(`/presupuestos/${presupuesto.id}/convertir-venta`, pagos),
        onSuccess: () => { qc.invalidateQueries(['presupuestos']); qc.invalidateQueries(['ventas']); onClose() }
    })

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
                            <input className="form-input" type="number" value={monto} onChange={e => setMonto(e.target.value)} placeholder="0" max={presupuesto.total} min={0} step="any" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Método</label>
                            <select className="form-select" value={metodo} onChange={e => setMetodo(e.target.value)}>
                                <option value="EFECTIVO">💵 Efectivo</option>
                                <option value="TARJETA">💳 Tarjeta</option>
                                <option value="TRANSFERENCIA">🏦 Transferencia</option>
                            </select>
                        </div>
                    </div>
                    {['TARJETA', 'TRANSFERENCIA'].includes(metodo) && (
                        <div className="form-group mb-16">
                            <label className="form-label">Banco *</label>
                            <select className="form-select" value={bancoId} onChange={e => setBancoId(e.target.value)} required>
                                <option value="">Seleccionar banco...</option>
                                {bancos.map(b => <option key={b.id} value={b.id}>{b.nombre_banco}</option>)}
                            </select>
                            {metodo === 'TARJETA' && <p style={{ fontSize: '0.72rem', color: 'var(--warning)', marginTop: 4 }}>⚠️ Se generará gasto automático por comisión bancaria.</p>}
                        </div>
                    )}
                    <div className="form-group mb-16">
                        <label className="form-label">Nota</label>
                        <input className="form-input" value={nota} onChange={e => setNota(e.target.value)} placeholder="Opcional..." />
                    </div>
                </>
            )}
            {convertir.isError && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#f87171', display: 'flex', gap: 8 }}>
                    <AlertCircle size={16} /> {convertir.error?.response?.data?.detail || 'Error al convertir.'}
                </div>
            )}
            <div className="flex gap-12" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={convertir.isPending}>
                    {convertir.isPending ? <span className="spinner" style={{ width: 16, height: 16 }} /> : <><ShoppingBag size={15} /> Confirmar Venta</>}
                </button>
            </div>
        </form>
    )
}

function NuevoPresupuestoModal({ onClose, presupuesto }) {
    const qc = useQueryClient()
    const esEdicion = !!presupuesto
    const [cliente, setCliente] = useState(presupuesto ? String(presupuesto.cliente_id) : '')
    const [buscarCli, setBuscarCli] = useState(presupuesto ? (presupuesto.cliente_nombre || '') : '')
    const [showCliList, setShowCliList] = useState(false)
    const [clienteObj, setClienteObj] = useState(presupuesto ? { nombre: presupuesto.cliente_nombre, referidor_nombre: presupuesto.referidor_nombre || null } : null)
    const blankItem = () => ({ producto_id: '', busq: '', cantidad: 1, precio_unitario: 0, costo_unitario: 0, descuento: 0, subtotal: 0 })
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
    const [comision, setComision] = useState(presupuesto?.comision_monto || 0)
    const [comisionAlerta, setComisionAlerta] = useState(false)
    const [fecha, setFecha] = useState(
        presupuesto?.fecha ? presupuesto.fecha.split('T')[0] : new Date().toISOString().split('T')[0]
    )

    const { data: clientes = [] } = useQuery({ queryKey: ['clientes', buscarCli], queryFn: () => api.get(`/clientes/?buscar=${buscarCli}&limit=20`).then(r => r.data), retry: false, enabled: buscarCli.length >= 1 })
    const { data: referidores = [] } = useQuery({ queryKey: ['referidores'], queryFn: () => api.get('/referidores/').then(r => r.data), retry: false })
    // Cargar último presupuesto del cliente para sugerir graduación
    const { data: ultimosPresupuestos = [] } = useQuery({
        queryKey: ['presupuestos-cliente', cliente],
        queryFn: () => api.get(`/presupuestos/?cliente_id=${cliente}&limit=5`).then(r => r.data),
        enabled: !!cliente, retry: false
    })

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

    const seleccionarCliente = (c) => {
        setClienteObj(c)
        setCliente(String(c.id))
        setBuscarCli(`${c.nombre}${c.ci ? ` (${c.ci})` : ''}`)
        setShowCliList(false)
    }

    const importarGraduacion = () => {
        const conGrad = ultimosPresupuestos.find(p =>
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
        setShowGrad(true)
    }

    const crear = useMutation({
        mutationFn: d => esEdicion
            ? api.put(`/presupuestos/${presupuesto.id}`, d)
            : api.post('/presupuestos/', d),
        onSuccess: () => { qc.invalidateQueries(['presupuestos']); onClose() }
    })

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
                                onClick={e => { e.stopPropagation(); importarGraduacion() }}
                                style={{ fontSize: '0.7rem', color: 'var(--info)', background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}
                                title="Importar graduación del último presupuesto del cliente"
                            >
                                📝 Importar historial
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
                <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
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
    const [estadoFiltro, setEstadoFiltro] = useState('')
    const [convertirPre, setConvertirPre] = useState(null)

    const { data: presupuestos = [], isLoading } = useQuery({
        queryKey: ['presupuestos', estadoFiltro],
        queryFn: () => {
            const params = new URLSearchParams({ limit: '100' })
            if (estadoFiltro) params.append('estado', estadoFiltro)
            return api.get(`/presupuestos/?${params.toString()}`).then(r => r.data)
        },
        retry: false,
    })

    const filtrados = buscar
        ? presupuestos.filter(p => p.cliente_nombre?.toLowerCase().includes(buscar.toLowerCase()) || p.codigo?.includes(buscar))
        : presupuestos

    const cambiarEstado = useMutation({
        mutationFn: ({ id, estado }) => api.patch(`/presupuestos/${id}/estado?estado=${estado}`),
        onSuccess: () => qc.invalidateQueries(['presupuestos'])
    })

    const eliminar = useMutation({
        mutationFn: (id) => api.delete(`/presupuestos/${id}`),
        onSuccess: () => qc.invalidateQueries(['presupuestos'])
    })

    const handleEliminar = (p) => {
        if (window.confirm(`¿Eliminar el presupuesto ${p.codigo}? Esta acción no se puede deshacer.`)) {
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
                                <tr><th>Código</th><th>Fecha</th><th>Cliente</th><th>OD</th><th>OI</th><th>Total</th><th>Estado</th><th>Acciones</th></tr>
                            </thead>
                            <tbody>
                                {filtrados.map(p => (
                                    <tr key={p.id}>
                                        <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{p.codigo}</td>
                                        <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{fmtDate(p.fecha)}</td>
                                        <td style={{ fontWeight: 500 }}>{p.cliente_nombre || '—'}</td>
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
                                                    <button className="btn btn-primary btn-sm" style={{ fontSize: '0.72rem' }} onClick={() => setConvertirPre(p)}>
                                                        <ShoppingBag size={12} /> Vender
                                                    </button>
                                                    <button className="btn btn-secondary btn-sm" style={{ fontSize: '0.72rem' }} onClick={() => setEditarPre(p)}>
                                                        ✏️ Editar
                                                    </button>
                                                    <button className="btn btn-secondary btn-sm" style={{ fontSize: '0.72rem', color: 'var(--warning)' }} onClick={() => cambiarEstado.mutate({ id: p.id, estado: 'CANCELADO' })}>
                                                        Cancelar
                                                    </button>
                                                </>
                                            )}
                                            {p.estado !== 'VENDIDO' && (
                                                <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleEliminar(p)} title="Eliminar">
                                                    <X size={12} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {modal && (
                <Modal title="Nuevo Presupuesto" onClose={() => setModal(false)} maxWidth="860px">
                    <NuevoPresupuestoModal onClose={() => setModal(false)} />
                </Modal>
            )}
            {editarPre && (
                <Modal title={`Editar ${editarPre.codigo}`} onClose={() => setEditarPre(null)} maxWidth="860px">
                    <NuevoPresupuestoModal
                        presupuesto={editarPre}
                        onClose={() => setEditarPre(null)}
                    />
                </Modal>
            )}
            {convertirPre && (
                <Modal title={`Convertir ${convertirPre.codigo} en Venta`} onClose={() => setConvertirPre(null)} maxWidth="500px">
                    <ConvertirVentaModal presupuesto={convertirPre} onClose={() => setConvertirPre(null)} />
                </Modal>
            )}
        </div>
    )
}
