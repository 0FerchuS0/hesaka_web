import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Building2, CreditCard, Eye, Landmark, Pencil, ReceiptText, Trash2, Wallet } from 'lucide-react'

import Modal from '../components/Modal'
import RemoteSearchSelect from '../components/RemoteSearchSelect'
import { api, useAuth } from '../context/AuthContext'
import { invalidateJornadaLiveData } from '../hooks/useFinancialJornada'
import { exportReportBlob } from '../utils/reportExports'
import { hasActionAccess } from '../utils/roles'

const fmt = value => new Intl.NumberFormat('es-PY').format(value ?? 0)
const fmtDate = value => value ? new Date(value).toLocaleDateString('es-PY') : '-'
const toDateTimeLocalValue = value => {
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    const pad = n => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function estadoBadge(estado) {
    const map = {
        PENDIENTE: 'badge-yellow',
        PAGADO: 'badge-green',
        VENCIDO: 'badge-red',
        AL_DIA: 'badge-blue',
        SIN_VENCIMIENTO: 'badge-gray',
        CONTADO: 'badge-blue',
    }
    return <span className={`badge ${map[estado] || 'badge-gray'}`}>{estado}</span>
}

function KPICard({ title, value, tone = 'var(--primary-light)', hint = '' }) {
    return (
        <div className="card" style={{ marginBottom: 0, padding: '12px 14px' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</div>
            <div style={{ fontSize: '1.18rem', fontWeight: 800, color: tone, lineHeight: 1.15 }}>{value}</div>
            {hint && <div style={{ marginTop: 6, color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{hint}</div>}
        </div>
    )
}

function DetalleProveedorModal({ proveedor, onClose }) {
    const { data: documentos = [], isLoading, isError } = useQuery({
        queryKey: ['cxp-detalle-proveedor', proveedor.proveedor_id],
        queryFn: () => api.get(`/compras/cuentas-por-pagar/proveedor/${proveedor.proveedor_id}`).then(response => response.data),
        retry: false,
    })

    return (
        <div style={{ display: 'grid', gap: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                <KPICard title="Deuda total" value={`Gs. ${fmt(proveedor.total_deuda)}`} tone="var(--danger)" />
                <KPICard title="Vencido" value={`Gs. ${fmt(proveedor.total_vencido)}`} tone="var(--warning)" hint={`${proveedor.vencidas} documentos`} />
                <KPICard title="Sin vencimiento" value={`Gs. ${fmt(proveedor.total_sin_vencimiento)}`} tone="var(--primary-light)" hint={`${proveedor.sin_vencimiento} documentos`} />
            </div>

            <div className="card" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
                    <div>
                        <div style={{ fontSize: '1rem', fontWeight: 700 }}>{proveedor.proveedor_nombre}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                            Documentos abiertos: {proveedor.cantidad_documentos}
                        </div>
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                        Aqui luego conectaremos el pago global del proveedor.
                    </div>
                </div>
            </div>

            <div className="card" style={{ padding: 0, marginBottom: 0 }}>
                {isLoading ? (
                    <div className="flex-center" style={{ padding: 60 }}>
                        <div className="spinner" style={{ width: 30, height: 30 }} />
                    </div>
                ) : isError ? (
                    <div className="empty-state" style={{ padding: '40px 20px' }}>
                        <AlertCircle size={34} />
                        <p>No se pudo cargar el detalle del proveedor.</p>
                    </div>
                ) : documentos.length === 0 ? (
                    <div className="empty-state" style={{ padding: '40px 20px' }}>
                        <ReceiptText size={34} />
                        <p>No hay documentos abiertos para este proveedor.</p>
                    </div>
                ) : (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Fecha</th>
                                    <th>Origen</th>
                                    <th>Factura actual</th>
                                    <th>Ventas</th>
                                    <th>Saldo</th>
                                    <th>Vence</th>
                                    <th>Estado</th>
                                    <th>Entrega</th>
                                </tr>
                            </thead>
                            <tbody>
                                {documentos.map(doc => (
                                    <tr key={doc.compra_id}>
                                        <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{fmtDate(doc.fecha)}</td>
                                        <td style={{ fontSize: '0.82rem' }}>
                                            <div style={{ fontWeight: 700 }}>{doc.tipo_documento_original || doc.tipo_documento}</div>
                                            <div style={{ color: 'var(--text-muted)' }}>{doc.nro_documento_original || 'S/N'}</div>
                                        </td>
                                        <td style={{ fontSize: '0.82rem' }}>
                                            <div style={{ fontWeight: 700 }}>{doc.tipo_documento}</div>
                                            <div style={{ color: 'var(--text-muted)' }}>{doc.nro_factura || 'S/N'}</div>
                                        </td>
                                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                                            {doc.ventas_codigos?.length ? doc.ventas_codigos.join(', ') : '-'}
                                        </td>
                                        <td style={{ fontWeight: 700, color: 'var(--warning)' }}>Gs. {fmt(doc.saldo)}</td>
                                        <td style={{ fontSize: '0.82rem' }}>{doc.fecha_vencimiento ? fmtDate(doc.fecha_vencimiento) : 'Sin vencimiento'}</td>
                                        <td>{estadoBadge(doc.estado_vencimiento)}</td>
                                        <td>{estadoBadge(doc.estado_entrega)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="flex gap-12" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={onClose}>Cerrar</button>
            </div>
        </div>
    )
}

function SeleccionarOSModal({ documentos, seleccionadas, onConfirm, onClose }) {
    const [selectedIds, setSelectedIds] = useState(seleccionadas)

    const toggle = compraId => {
        setSelectedIds(prev => prev.includes(compraId) ? prev.filter(id => id !== compraId) : [...prev, compraId])
    }

    const totalSeleccionado = documentos
        .filter(item => selectedIds.includes(item.compra_id))
        .reduce((sum, item) => sum + (item.saldo || 0), 0)

    return (
        <div style={{ display: 'grid', gap: 16 }}>
            <div className="card" style={{ marginBottom: 0 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Seleccion de OS</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                    Marca las OS que entran en este pago. El sistema calculara el total seleccionado y luego aplicara el descuento correspondiente segun el monto que cargues.
                </div>
                <div style={{ marginTop: 10, color: 'var(--warning)', fontWeight: 800 }}>
                    Total OS seleccionadas: Gs. {fmt(totalSeleccionado)}
                </div>
            </div>

            <div className="card" style={{ padding: 0, marginBottom: 0 }}>
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th></th>
                                <th>Fecha</th>
                                <th>OS origen</th>
                                <th>Saldo</th>
                                <th>Ventas</th>
                            </tr>
                        </thead>
                        <tbody>
                            {documentos.map(item => (
                                <tr key={item.compra_id}>
                                    <td>
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.includes(item.compra_id)}
                                            onChange={() => toggle(item.compra_id)}
                                            style={{ accentColor: 'var(--primary-light)' }}
                                        />
                                    </td>
                                    <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{fmtDate(item.fecha)}</td>
                                    <td style={{ fontWeight: 700 }}>{item.nro_documento_original || item.nro_factura || `OS #${item.compra_id}`}</td>
                                    <td style={{ fontWeight: 800, color: 'var(--warning)' }}>Gs. {fmt(item.saldo)}</td>
                                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{item.ventas_codigos?.length ? item.ventas_codigos.join(', ') : '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="flex gap-12" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
                <button type="button" className="btn btn-primary" onClick={() => onConfirm(selectedIds)}>
                    Confirmar seleccion
                </button>
            </div>
        </div>
    )
}

function PagoProveedorModal({ proveedor, onClose }) {
    const queryClient = useQueryClient()
    const [fecha, setFecha] = useState(() => toDateTimeLocalValue(new Date()))
    const [metodoPago, setMetodoPago] = useState('EFECTIVO')
    const [monto, setMonto] = useState('')
    const [bancoId, setBancoId] = useState('')
    const [nroComprobante, setNroComprobante] = useState('')
    const [metodos, setMetodos] = useState([])
    const [osSeleccionadas, setOsSeleccionadas] = useState([])
    const [facturaGlobal, setFacturaGlobal] = useState('')
    const [showSelectorOS, setShowSelectorOS] = useState(false)
    const [errorAgregarMedio, setErrorAgregarMedio] = useState('')
    const [errorConfirmacion, setErrorConfirmacion] = useState('')

    const { data: bancos = [] } = useQuery({
        queryKey: ['bancos'],
        queryFn: () => api.get('/bancos/').then(response => response.data),
        retry: false,
    })

    const { data: documentosProveedor = [] } = useQuery({
        queryKey: ['cxp-detalle-proveedor', proveedor.proveedor_id, 'pago'],
        queryFn: () => api.get(`/compras/cuentas-por-pagar/proveedor/${proveedor.proveedor_id}`).then(response => response.data),
        retry: false,
    })

    const osPendientes = documentosProveedor.filter(item => (item.tipo_documento_original || item.tipo_documento) === 'ORDEN_SERVICIO')

    const totalAgregado = metodos.reduce((sum, item) => sum + (Number(item.monto) || 0), 0)
    const totalOSSeleccionadas = osPendientes
        .filter(item => osSeleccionadas.includes(item.compra_id))
        .reduce((sum, item) => sum + (item.saldo || 0), 0)
    const restanteOS = Math.max(0, totalOSSeleccionadas - totalAgregado)
    const pagoOSCompleto = osSeleccionadas.length > 0 && totalOSSeleccionadas > 0 && restanteOS === 0 && totalAgregado <= totalOSSeleccionadas

    const registrarPago = useMutation({
        mutationFn: payload => api.post(`/compras/cuentas-por-pagar/proveedor/${proveedor.proveedor_id}/pago-global`, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['cxp-resumen'] })
            queryClient.invalidateQueries({ queryKey: ['cxp-contados-pendientes'] })
            queryClient.invalidateQueries({ queryKey: ['cxp-detalle-proveedor', proveedor.proveedor_id] })
            queryClient.invalidateQueries({ queryKey: ['compras'] })
            queryClient.invalidateQueries({ queryKey: ['bancos'] })
            queryClient.invalidateQueries({ queryKey: ['saldo-caja'] })
            queryClient.invalidateQueries({ queryKey: ['movimientos-caja'] })
            invalidateJornadaLiveData(queryClient)
            onClose()
        },
    })

    const agregarMetodo = () => {
        const montoNum = parseFloat(monto) || 0
        if (montoNum <= 0) {
            setErrorAgregarMedio('Debes cargar un monto mayor a cero para agregar el medio de pago.')
            return
        }

        if (metodoPago !== 'EFECTIVO' && !bancoId) {
            setErrorAgregarMedio('Debes seleccionar la cuenta bancaria antes de agregar este medio de pago.')
            return
        }

        setErrorAgregarMedio('')
        setErrorConfirmacion('')
        setMetodos(prev => ([
            ...prev,
            {
                metodo_pago: metodoPago,
                monto: montoNum,
                banco_id: metodoPago === 'EFECTIVO' ? null : (bancoId ? parseInt(bancoId, 10) : null),
                banco_nombre: metodoPago === 'EFECTIVO' ? '-' : (bancos.find(item => item.id === parseInt(bancoId, 10))?.nombre_banco || '-'),
                nro_comprobante: nroComprobante || null,
            },
        ]))
        setMonto('')
        setBancoId('')
        setNroComprobante('')
    }

    const confirmarPago = event => {
        event.preventDefault()
        let usarFacturaGenerica = false
        if (metodos.length === 0) {
            setErrorConfirmacion('Debes agregar al menos un medio de pago antes de confirmar.')
            return
        }

        if (osSeleccionadas.length > 0 && !facturaGlobal.trim()) {
            const continuarSinFactura = confirm('No cargaste una factura para las OS seleccionadas. Ãƒâ€šÃ‚Â¿Quieres registrar el pago igual y que el sistema genere una numeraciÃƒÆ’Ã‚Â³n interna genÃƒÆ’Ã‚Â©rica?')
            if (!continuarSinFactura) {
                setErrorConfirmacion('Debes cargar una factura global o confirmar que deseas continuar con numeraciÃƒÆ’Ã‚Â³n interna.')
                return
            }
            usarFacturaGenerica = true
        }

        if (osSeleccionadas.length > 0 && totalAgregado > totalOSSeleccionadas) {
            setErrorConfirmacion('El monto agregado no puede superar el total de las OS seleccionadas.')
            return
        }

        if (osSeleccionadas.length === 0 && totalAgregado > (proveedor.total_deuda || 0)) {
            setErrorConfirmacion('El monto agregado no puede superar la deuda abierta del proveedor.')
            return
        }

        setErrorConfirmacion('')
        registrarPago.mutate({
            fecha: fecha || null,
            metodos_pago: metodos.map(item => ({
                metodo_pago: item.metodo_pago,
                monto: item.monto,
                banco_id: item.banco_id,
                nro_comprobante: item.nro_comprobante,
            })),
            compra_ids: osSeleccionadas,
            factura_global: facturaGlobal || null,
            usar_factura_generica: usarFacturaGenerica,
        })
    }

    return (
        <>
        <form onSubmit={confirmarPago}>
            <div className="card mb-16" style={{ padding: '14px 16px' }}>
                <div style={{ display: 'grid', gap: 6 }}>
                    <div style={{ fontWeight: 700 }}>{proveedor.proveedor_nombre}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                        El pago se aplicara automaticamente sobre documentos abiertos de este proveedor.
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
                        Prioridad: vencidas primero, luego con vencimiento mas antiguo, luego sin vencimiento.
                    </div>
                    <div style={{ color: 'var(--warning)', fontWeight: 700, fontSize: '0.9rem' }}>
                        Deuda abierta: Gs. {fmt(proveedor.total_deuda)}
                    </div>
                </div>
            </div>

            {osPendientes.length > 0 && (
                <div className="card mb-16" style={{ padding: 0 }}>
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>
                        OS pendientes para este proveedor
                    </div>
                    <div style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                        Si este pago corresponde a OS que ahora se facturan, selecciona las OS involucradas y carga la factura global.
                    </div>
                    <div style={{ padding: '0 16px 16px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 14 }}>
                            <KPICard title="OS seleccionadas" value={String(osSeleccionadas.length)} tone="var(--text-primary)" />
                            <KPICard title="Total seleccionado" value={`Gs. ${fmt(totalOSSeleccionadas)}`} tone="var(--warning)" />
                            <KPICard title="Faltante" value={`Gs. ${fmt(restanteOS)}`} tone={pagoOSCompleto ? 'var(--success)' : 'var(--primary-light)'} hint={pagoOSCompleto ? 'Pago completado' : 'Puedes pagar parcial o total'} />
                        </div>
                        <div className="flex gap-12" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                                {osSeleccionadas.length
                                    ? `${osSeleccionadas.length} OS marcadas para este pago.`
                                    : 'Todavia no seleccionaste OS para este pago.'}
                            </div>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowSelectorOS(true)}>
                                Seleccionar OS
                            </button>
                        </div>
                        {osSeleccionadas.length > 0 && (
                            <div style={{ background: pagoOSCompleto ? 'rgba(16,185,129,0.1)' : 'rgba(59,130,246,0.08)', border: `1px solid ${pagoOSCompleto ? 'rgba(16,185,129,0.25)' : 'rgba(59,130,246,0.2)'}`, borderRadius: 10, padding: '10px 12px', marginBottom: 12, color: pagoOSCompleto ? '#6ee7b7' : 'var(--text-secondary)', fontSize: '0.82rem' }}>
                                {pagoOSCompleto
                                    ? 'Pago completado para las OS seleccionadas.'
                                    : `Con el monto cargado se descontara Gs. ${fmt(totalAgregado)} y quedaran Gs. ${fmt(restanteOS)} pendientes sobre estas OS.`}
                            </div>
                        )}
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Factura global para las OS seleccionadas</label>
                            <input
                                className="form-input"
                                value={facturaGlobal}
                                onChange={event => setFacturaGlobal(event.target.value.toUpperCase())}
                                placeholder="Ej: 001-001-0001234"
                                disabled={osSeleccionadas.length === 0}
                            />
                            {osSeleccionadas.length > 0 && (
                                <div style={{ marginTop: 6, color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                                    Si no cargas factura, al confirmar el sistema te ofrecera generar una numeracion interna generica para identificar este pago.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="grid-2 mb-16">
                <div className="form-group">
                    <label className="form-label">Fecha del pago</label>
                    <input type="datetime-local" className="form-input" value={fecha} onChange={event => setFecha(event.target.value)} />
                </div>
                <div className="form-group">
                    <label className="form-label">Monto total agregado</label>
                    <div className="form-input" style={{ display: 'flex', alignItems: 'center', fontWeight: 800, color: 'var(--success)' }}>
                        Gs. {fmt(totalAgregado)}
                    </div>
                </div>
            </div>

            <div className="card mb-16" style={{ padding: '14px 16px' }}>
                <div className="grid-2 mb-16">
                    <div className="form-group">
                        <label className="form-label">Metodo</label>
                        <select className="form-select" value={metodoPago} onChange={event => setMetodoPago(event.target.value)}>
                            <option value="EFECTIVO">EFECTIVO</option>
                            <option value="TRANSFERENCIA">TRANSFERENCIA</option>
                            <option value="TARJETA">TARJETA</option>
                            <option value="CHEQUE">CHEQUE</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Monto</label>
                        <input type="number" min="0" step="0.01" className="form-input" value={monto} onChange={event => setMonto(event.target.value)} />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Banco</label>
                        <select className="form-select" value={bancoId} onChange={event => setBancoId(event.target.value)} disabled={metodoPago === 'EFECTIVO'}>
                            <option value="">Seleccionar banco</option>
                            {bancos.map(banco => <option key={banco.id} value={banco.id}>{banco.nombre_banco}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Comprobante</label>
                        <input className="form-input" value={nroComprobante} onChange={event => setNroComprobante(event.target.value)} placeholder="Opcional" />
                    </div>
                </div>
                <div className="flex gap-12" style={{ justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-secondary" onClick={agregarMetodo}>
                        Agregar medio
                    </button>
                </div>
                {errorAgregarMedio && (
                    <div style={{ marginTop: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: '0.82rem', color: '#f87171', display: 'flex', gap: 8 }}>
                        <AlertCircle size={16} />
                        {errorAgregarMedio}
                    </div>
                )}
            </div>

            <div className="card mb-16" style={{ padding: 0 }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>
                    Medios de pago cargados
                </div>
                {metodos.length === 0 ? (
                    <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                        Aun no agregaste medios de pago.
                    </div>
                ) : (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Metodo</th>
                                    <th>Banco</th>
                                    <th>Comprobante</th>
                                    <th>Monto</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {metodos.map((item, index) => (
                                    <tr key={`${item.metodo_pago}-${index}`}>
                                        <td style={{ fontWeight: 700 }}>{item.metodo_pago}</td>
                                        <td style={{ color: 'var(--text-secondary)' }}>{item.banco_nombre || '-'}</td>
                                        <td style={{ color: 'var(--text-secondary)' }}>{item.nro_comprobante || '-'}</td>
                                        <td style={{ fontWeight: 800, color: 'var(--success)' }}>Gs. {fmt(item.monto)}</td>
                                        <td>
                                            <button
                                                type="button"
                                                className="btn btn-danger btn-sm btn-icon"
                                                onClick={() => setMetodos(prev => prev.filter((_, currentIndex) => currentIndex !== index))}
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

            {(errorConfirmacion || registrarPago.isError) && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#f87171', display: 'flex', gap: 8 }}>
                    <AlertCircle size={16} />
                    {errorConfirmacion || registrarPago.error?.response?.data?.detail || 'No se pudo registrar el pago global.'}
                </div>
            )}

            <div className="flex gap-12" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
                <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={registrarPago.isPending}
                >
                    {registrarPago.isPending ? <span className="spinner" style={{ width: 16, height: 16 }} /> : <><Wallet size={15} /> Confirmar pago</>}
                </button>
            </div>
        </form>
        {showSelectorOS && (
            <Modal
                title={`Seleccionar OS: ${proveedor.proveedor_nombre}`}
                onClose={() => setShowSelectorOS(false)}
                maxWidth="980px"
            >
                <SeleccionarOSModal
                    documentos={osPendientes}
                    seleccionadas={osSeleccionadas}
                    onClose={() => setShowSelectorOS(false)}
                    onConfirm={selected => {
                        setOsSeleccionadas(selected)
                        setShowSelectorOS(false)
                    }}
                />
            </Modal>
        )}
        </>
    )
}

function EditarPagoHistorialModal({ grupoId, onClose }) {
    const queryClient = useQueryClient()
    const [fecha, setFecha] = useState(() => toDateTimeLocalValue(new Date()))
    const [metodoPago, setMetodoPago] = useState('EFECTIVO')
    const [monto, setMonto] = useState('')
    const [bancoId, setBancoId] = useState('')
    const [nroComprobante, setNroComprobante] = useState('')
    const [metodos, setMetodos] = useState([])
    const [facturaGlobal, setFacturaGlobal] = useState('')
    const [errorAgregarMedio, setErrorAgregarMedio] = useState('')
    const [errorConfirmacion, setErrorConfirmacion] = useState('')
    const [seeded, setSeeded] = useState(false)

    const { data: bancos = [] } = useQuery({
        queryKey: ['bancos'],
        queryFn: () => api.get('/bancos/').then(response => response.data),
        retry: false,
    })

    const { data: detalle, isLoading, isError } = useQuery({
        queryKey: ['cxp-historial-detalle', grupoId],
        queryFn: () => api.get(`/compras/cuentas-por-pagar/pagos-historial/${encodeURIComponent(grupoId)}`).then(response => response.data),
        retry: false,
    })

    useEffect(() => {
        if (!detalle || seeded) return
        setFecha(detalle.fecha ? toDateTimeLocalValue(detalle.fecha) : toDateTimeLocalValue(new Date()))
        setFacturaGlobal(detalle.factura_global || '')
        setMetodos((detalle.metodos_pago || []).map(item => ({
            metodo_pago: item.metodo_pago,
            monto: Number(item.monto) || 0,
            banco_id: item.banco_id,
            banco_nombre: item.banco_nombre || '-',
            nro_comprobante: item.nro_comprobante || null,
        })))
        setSeeded(true)
    }, [detalle, seeded])

    const totalAgregado = metodos.reduce((sum, item) => sum + (Number(item.monto) || 0), 0)
    const totalOriginal = Number(detalle?.total || 0)

    const guardarEdicion = useMutation({
        mutationFn: payload => api.put(`/compras/cuentas-por-pagar/pagos-historial/${encodeURIComponent(grupoId)}`, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['cxp-resumen'] })
            queryClient.invalidateQueries({ queryKey: ['cxp-contados-pendientes'] })
            queryClient.invalidateQueries({ queryKey: ['cxp-historial-pagos'] })
            queryClient.invalidateQueries({ queryKey: ['compras'] })
            queryClient.invalidateQueries({ queryKey: ['bancos'] })
            queryClient.invalidateQueries({ queryKey: ['saldo-caja'] })
            queryClient.invalidateQueries({ queryKey: ['movimientos-caja'] })
            invalidateJornadaLiveData(queryClient)
            onClose()
        },
    })

    const agregarMetodo = () => {
        const montoNum = parseFloat(monto) || 0
        if (montoNum <= 0) {
            setErrorAgregarMedio('Debes cargar un monto mayor a cero para agregar el medio de pago.')
            return
        }
        if (metodoPago !== 'EFECTIVO' && !bancoId) {
            setErrorAgregarMedio('Debes seleccionar la cuenta bancaria antes de agregar este medio de pago.')
            return
        }
        setErrorAgregarMedio('')
        setErrorConfirmacion('')
        setMetodos(prev => ([
            ...prev,
            {
                metodo_pago: metodoPago,
                monto: montoNum,
                banco_id: metodoPago === 'EFECTIVO' ? null : (bancoId ? parseInt(bancoId, 10) : null),
                banco_nombre: metodoPago === 'EFECTIVO' ? '-' : (bancos.find(item => item.id === parseInt(bancoId, 10))?.nombre_banco || '-'),
                nro_comprobante: nroComprobante || null,
            },
        ]))
        setMonto('')
        setBancoId('')
        setNroComprobante('')
    }

    const eliminarMetodo = index => {
        setMetodos(prev => prev.filter((_, idx) => idx !== index))
    }

    const confirmar = event => {
        event.preventDefault()
        let usarFacturaGenerica = false
        if (!detalle) return
        if (metodos.length === 0) {
            setErrorConfirmacion('Debes agregar al menos un medio de pago.')
            return
        }
        if (detalle.puede_usar_factura_global && !facturaGlobal.trim()) {
            const continuarSinFactura = confirm('No cargaste una factura para este pago. Ãƒâ€šÃ‚Â¿Quieres continuar con numeraciÃƒÆ’Ã‚Â³n interna genÃƒÆ’Ã‚Â©rica?')
            if (!continuarSinFactura) {
                setErrorConfirmacion('Debes cargar una factura o confirmar la numeraciÃƒÆ’Ã‚Â³n interna.')
                return
            }
            usarFacturaGenerica = true
        }
        setErrorConfirmacion('')
        guardarEdicion.mutate({
            fecha: fecha || null,
            metodos_pago: metodos.map(item => ({
                metodo_pago: item.metodo_pago,
                monto: item.monto,
                banco_id: item.banco_id,
                nro_comprobante: item.nro_comprobante,
            })),
            compra_ids: detalle.compra_ids || [],
            factura_global: detalle.puede_usar_factura_global ? (facturaGlobal || null) : null,
            usar_factura_generica: usarFacturaGenerica,
        })
    }

    if (isLoading) {
        return <div className="flex-center" style={{ padding: 60 }}><div className="spinner" style={{ width: 30, height: 30 }} /></div>
    }

    if (isError || !detalle) {
        return (
            <div className="empty-state" style={{ padding: '40px 20px' }}>
                <AlertCircle size={34} />
                <p>No se pudo cargar el detalle del pago.</p>
            </div>
        )
    }

    return (
        <form onSubmit={confirmar}>
            <div className="card mb-16" style={{ padding: '14px 16px' }}>
                <div style={{ display: 'grid', gap: 6 }}>
                    <div style={{ fontWeight: 700 }}>{detalle.proveedor_nombre}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                        Se reeditara este pago sobre las mismas compras asociadas.
                    </div>
                    <div style={{ color: 'var(--warning)', fontWeight: 700, fontSize: '0.9rem' }}>
                        Total original: Gs. {fmt(totalOriginal)}
                    </div>
                </div>
            </div>

            <div className="card mb-16" style={{ padding: '14px 16px' }}>
                <div style={{ display: 'grid', gap: 8, fontSize: '0.82rem' }}>
                    <div><strong>Documentos:</strong> {detalle.documentos?.length ? detalle.documentos.join(', ') : '-'}</div>
                    <div><strong>OS:</strong> {detalle.os_origen?.length ? detalle.os_origen.join(', ') : '-'}</div>
                    <div><strong>Clientes:</strong> {detalle.clientes?.length ? detalle.clientes.join(', ') : '-'}</div>
                </div>
            </div>

            {detalle.puede_usar_factura_global && (
                <div className="form-group mb-16">
                    <label className="form-label">Factura global</label>
                    <input
                        className="form-input"
                        value={facturaGlobal}
                        onChange={event => setFacturaGlobal(event.target.value.toUpperCase())}
                        placeholder="Ej: 001-001-0001234"
                    />
                </div>
            )}

            <div className="grid-2 mb-16">
                <div className="form-group">
                    <label className="form-label">Fecha del pago</label>
                    <input type="datetime-local" className="form-input" value={fecha} onChange={event => setFecha(event.target.value)} />
                </div>
                <div className="form-group">
                    <label className="form-label">Monto total cargado</label>
                    <div className="form-input" style={{ display: 'flex', alignItems: 'center', fontWeight: 800, color: totalAgregado === totalOriginal ? 'var(--success)' : 'var(--warning)' }}>
                        Gs. {fmt(totalAgregado)}
                    </div>
                </div>
            </div>

            <div className="grid-4 mb-16">
                <div className="form-group">
                    <label className="form-label">Metodo</label>
                    <select className="form-select" value={metodoPago} onChange={event => setMetodoPago(event.target.value)}>
                        <option value="EFECTIVO">EFECTIVO</option>
                        <option value="TRANSFERENCIA">TRANSFERENCIA</option>
                        <option value="TARJETA">TARJETA</option>
                        <option value="CHEQUE">CHEQUE</option>
                    </select>
                </div>
                <div className="form-group">
                    <label className="form-label">Monto</label>
                    <input type="number" min="0" step="0.01" className="form-input" value={monto} onChange={event => setMonto(event.target.value)} />
                </div>
                <div className="form-group">
                    <label className="form-label">Banco</label>
                    <select className="form-select" value={bancoId} onChange={event => setBancoId(event.target.value)} disabled={metodoPago === 'EFECTIVO'}>
                        <option value="">Seleccionar banco</option>
                        {bancos.map(item => <option key={item.id} value={item.id}>{item.nombre_banco}</option>)}
                    </select>
                </div>
                <div className="form-group">
                    <label className="form-label">Comprobante</label>
                    <input className="form-input" value={nroComprobante} onChange={event => setNroComprobante(event.target.value)} />
                </div>
            </div>

            <div className="flex gap-12 mb-16" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={agregarMetodo}>
                    Agregar medio
                </button>
            </div>

            {errorAgregarMedio && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#f87171', display: 'flex', gap: 8 }}>
                    <AlertCircle size={16} />
                    {errorAgregarMedio}
                </div>
            )}

            <div className="card mb-16" style={{ padding: 0 }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>Medios actuales</div>
                {metodos.length === 0 ? (
                    <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>No hay medios cargados.</div>
                ) : (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Metodo</th>
                                    <th>Banco</th>
                                    <th>Comprobante</th>
                                    <th>Monto</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {metodos.map((item, index) => (
                                    <tr key={`${item.metodo_pago}-${index}`}>
                                        <td>{item.metodo_pago}</td>
                                        <td>{item.banco_nombre || '-'}</td>
                                        <td>{item.nro_comprobante || '-'}</td>
                                        <td style={{ fontWeight: 700 }}>Gs. {fmt(item.monto)}</td>
                                        <td>
                                            <button type="button" className="btn btn-danger btn-sm" onClick={() => eliminarMetodo(index)}>
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

            {(errorConfirmacion || guardarEdicion.isError) && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#f87171', display: 'flex', gap: 8 }}>
                    <AlertCircle size={16} />
                    {errorConfirmacion || guardarEdicion.error?.response?.data?.detail || 'No se pudo editar el pago.'}
                </div>
            )}

            <div className="flex gap-12" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={guardarEdicion.isPending}>
                    {guardarEdicion.isPending ? <span className="spinner" style={{ width: 16, height: 16 }} /> : <><Pencil size={15} /> Guardar cambios</>}
                </button>
            </div>
        </form>
    )
}

function HistorialPagoActions({ item, onEditar, onPDF, onRevertir, isRevirtiendo, user, pdfOpeningGroupId, revertingGroupId }) {
    const [open, setOpen] = useState(false)
    const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 })
    const buttonRef = useRef(null)
    const puedeEditar = hasActionAccess(user, 'cuentas_por_pagar.editar', 'cuentas_por_pagar')
    const puedeExportar = hasActionAccess(user, 'cuentas_por_pagar.exportar', 'cuentas_por_pagar')
    const puedeRevertir = hasActionAccess(user, 'cuentas_por_pagar.revertir', 'cuentas_por_pagar')
    const pdfBusy = pdfOpeningGroupId === item.grupo_id
    const revertingBusy = revertingGroupId === item.grupo_id || isRevirtiendo

    const handleAction = callback => {
        setOpen(false)
        callback()
    }

    const toggleMenu = () => {
        if (open) {
            setOpen(false)
            return
        }

        const rect = buttonRef.current?.getBoundingClientRect()
        if (!rect) return

        const menuWidth = 190
        const menuHeight = 140
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight

        let left = rect.right - menuWidth
        let top = rect.bottom + 6

        if (left < 8) left = 8
        if (left + menuWidth > viewportWidth - 8) left = viewportWidth - menuWidth - 8
        if (top + menuHeight > viewportHeight - 8) top = rect.top - menuHeight - 6
        if (top < 8) top = 8

        setMenuPosition({ top, left })
        setOpen(true)
    }

    return (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
                ref={buttonRef}
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={toggleMenu}
                disabled={pdfBusy || revertingBusy}
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
                            top: menuPosition.top,
                            left: menuPosition.left,
                            minWidth: 190,
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border)',
                            borderRadius: 10,
                            boxShadow: '0 14px 34px rgba(0,0,0,0.45)',
                            padding: '6px 0',
                            zIndex: 100,
                        }}
                    >
                        {puedeEditar && (
                            <button className="dropdown-item" onClick={() => handleAction(() => onEditar(item))}>
                                <Pencil size={14} style={{ marginRight: 8 }} /> Editar pago
                            </button>
                        )}
                        {puedeExportar && (
                            <button className="dropdown-item" onClick={() => handleAction(() => onPDF(item))} disabled={pdfBusy}>
                                <ReceiptText size={14} style={{ marginRight: 8 }} /> {pdfBusy ? 'Abriendo PDF...' : 'Abrir PDF'}
                            </button>
                        )}
                        {puedeRevertir && (
                            <>
                                <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
                                <button
                                    className="dropdown-item"
                                    style={{ color: 'var(--danger)' }}
                                    disabled={revertingBusy}
                                    onClick={() => handleAction(() => onRevertir(item))}
                                >
                                    <Trash2 size={14} style={{ marginRight: 8 }} /> {revertingBusy ? 'Revirtiendo...' : 'Revertir pago'}
                                </button>
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}

export default function CuentasPorPagarPage() {
    const queryClient = useQueryClient()
    const { user } = useAuth()
    const [tab, setTab] = useState('creditos')
    const [detalleProveedor, setDetalleProveedor] = useState(null)
    const [pagoProveedor, setPagoProveedor] = useState(null)
    const [editarPagoGrupo, setEditarPagoGrupo] = useState(null)
    const [historialProveedorId, setHistorialProveedorId] = useState('')
    const [historialOS, setHistorialOS] = useState('')
    const [historialFactura, setHistorialFactura] = useState('')
    const [historialCliente, setHistorialCliente] = useState('')
    const [historialFechaDesde, setHistorialFechaDesde] = useState('')
    const [historialFechaHasta, setHistorialFechaHasta] = useState('')
    const [historialProveedores, setHistorialProveedores] = useState([])
    const [historialProveedoresLoading, setHistorialProveedoresLoading] = useState(false)
    const [historialProveedorBusqueda, setHistorialProveedorBusqueda] = useState('')
    const [historialProveedorSeleccionado, setHistorialProveedorSeleccionado] = useState(null)
    const [historialExcelBusy, setHistorialExcelBusy] = useState(false)
    const [historialPdfGroupId, setHistorialPdfGroupId] = useState(null)
    const [historialRevertingGroupId, setHistorialRevertingGroupId] = useState(null)

    const { data: resumen = [], isLoading: loadingResumen, isError: errorResumen, error: resumenError } = useQuery({
        queryKey: ['cxp-resumen'],
        queryFn: () => api.get('/compras/cuentas-por-pagar/resumen').then(response => response.data),
        retry: false,
    })

    const { data: contados = [], isLoading: loadingContados, isError: errorContados, error: contadosError } = useQuery({
        queryKey: ['cxp-contados-pendientes'],
        queryFn: () => api.get('/compras/cuentas-por-pagar/contados-pendientes').then(response => response.data),
        retry: false,
    })
    const { data: historialPagos = [], isLoading: loadingHistorial } = useQuery({
        queryKey: ['cxp-historial-pagos', historialProveedorId, historialOS, historialFactura, historialCliente, historialFechaDesde, historialFechaHasta],
        queryFn: () => api.get('/compras/cuentas-por-pagar/pagos-historial', {
            params: {
                proveedor_id: historialProveedorId || undefined,
                buscar_os: historialOS || undefined,
                buscar_factura: historialFactura || undefined,
                buscar_cliente: historialCliente || undefined,
                fecha_desde: historialFechaDesde || undefined,
                fecha_hasta: historialFechaHasta || undefined,
            },
        }).then(response => response.data),
        retry: false,
    })

    useEffect(() => {
        if (!historialProveedorBusqueda.trim()) {
            setHistorialProveedores([])
            setHistorialProveedoresLoading(false)
            return
        }
        const timer = setTimeout(async () => {
            try {
                setHistorialProveedoresLoading(true)
                const params = new URLSearchParams({ page: '1', page_size: '20', buscar: historialProveedorBusqueda.trim() })
                const response = await api.get(`/proveedores/listado-optimizado?${params.toString()}`)
                setHistorialProveedores(response.data.items || [])
            } catch (err) {
                console.error('Error cargando proveedores para historial:', err)
            } finally {
                setHistorialProveedoresLoading(false)
            }
        }, 250)
        return () => clearTimeout(timer)
    }, [historialProveedorBusqueda])

    const revertirPago = useMutation({
        mutationFn: grupoId => api.post(`/compras/cuentas-por-pagar/pagos-historial/${encodeURIComponent(grupoId)}/revertir`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['cxp-resumen'] })
            queryClient.invalidateQueries({ queryKey: ['cxp-contados-pendientes'] })
            queryClient.invalidateQueries({ queryKey: ['cxp-historial-pagos'] })
            queryClient.invalidateQueries({ queryKey: ['compras'] })
            queryClient.invalidateQueries({ queryKey: ['bancos'] })
            queryClient.invalidateQueries({ queryKey: ['saldo-caja'] })
            queryClient.invalidateQueries({ queryKey: ['movimientos-caja'] })
            invalidateJornadaLiveData(queryClient)
        },
        onSettled: () => {
            setHistorialRevertingGroupId(null)
        },
    })

    const exportarHistorialExcel = async () => {
        if (historialExcelBusy) return
        setHistorialExcelBusy(true)
        try {
            await exportReportBlob(`/compras/cuentas-por-pagar/pagos-historial/excel?${new URLSearchParams({
                ...(historialFechaDesde ? { fecha_desde: historialFechaDesde } : {}),
                ...(historialFechaHasta ? { fecha_hasta: historialFechaHasta } : {}),
                ...(historialProveedorId ? { proveedor_id: historialProveedorId } : {}),
                ...(historialOS ? { buscar_os: historialOS } : {}),
                ...(historialFactura ? { buscar_factura: historialFactura } : {}),
                ...(historialCliente ? { buscar_cliente: historialCliente } : {}),
            }).toString()}`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        } finally {
            setHistorialExcelBusy(false)
        }
    }

    const abrirHistorialPagoPDF = async selected => {
        if (historialPdfGroupId === selected.grupo_id) return
        setHistorialPdfGroupId(selected.grupo_id)
        try {
            await exportReportBlob(`/compras/cuentas-por-pagar/pagos-historial/${encodeURIComponent(selected.grupo_id)}/pdf`, 'application/pdf', { openInNewTab: true })
        } finally {
            setHistorialPdfGroupId(null)
        }
    }

    const stats = useMemo(() => {
        const totalDeuda = resumen.reduce((sum, item) => sum + (item.total_deuda || 0), 0)
        const totalVencido = resumen.reduce((sum, item) => sum + (item.total_vencido || 0), 0)
        const totalSinVencimiento = resumen.reduce((sum, item) => sum + (item.total_sin_vencimiento || 0), 0)
        const contadosPendientes = contados.reduce((sum, item) => sum + (item.saldo || 0), 0)
        return {
            totalDeuda,
            totalVencido,
            totalSinVencimiento,
            proveedoresConDeuda: resumen.length,
            contadosPendientes,
        }
    }, [contados, resumen])

    return (
        <div className="page-body">
            <div className="flex-between mb-24">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, background: 'rgba(26,86,219,0.15)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Landmark size={20} style={{ color: 'var(--primary-light)' }} />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Cuentas por Pagar</h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            El foco principal esta en la tabla y el detalle por proveedor.
                        </p>
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
                <KPICard title="Deuda proveedores" value={`Gs. ${fmt(stats.totalDeuda)}`} tone="var(--danger)" />
                <KPICard title="Vencido" value={`Gs. ${fmt(stats.totalVencido)}`} tone="var(--warning)" />
                <KPICard title="Sin vto." value={`Gs. ${fmt(stats.totalSinVencimiento)}`} tone="var(--primary-light)" />
                <KPICard title="Contados" value={`Gs. ${fmt(stats.contadosPendientes)}`} tone="var(--success)" />
                <KPICard title="Proveedores" value={String(stats.proveedoresConDeuda)} tone="var(--text-primary)" />
            </div>

            {(errorResumen || errorContados) && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '12px 14px', marginBottom: 16, color: '#fca5a5', fontSize: '0.82rem', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <AlertCircle size={16} style={{ marginTop: 2 }} />
                    <div>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>No se pudieron cargar correctamente los datos de Cuentas por Pagar.</div>
                        <div>{resumenError?.response?.data?.detail || contadosError?.response?.data?.detail || 'Si acabas de implementar este modulo, reinicia el backend web y vuelve a recargar la pagina.'}</div>
                    </div>
                </div>
            )}

            <div className="card mb-16" style={{ padding: '10px 12px' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        className={`btn btn-sm ${tab === 'creditos' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setTab('creditos')}
                    >
                        <CreditCard size={14} /> Creditos por proveedor
                    </button>
                    <button
                        type="button"
                        className={`btn btn-sm ${tab === 'contados' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setTab('contados')}
                    >
                        <Building2 size={14} /> Contados pendientes
                    </button>
                    <button
                        type="button"
                        className={`btn btn-sm ${tab === 'historial' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setTab('historial')}
                    >
                        <ReceiptText size={14} /> Historial de pagos
                    </button>
                </div>
            </div>

            {tab === 'creditos' ? (
                <div className="card" style={{ padding: 0 }}>
                    {loadingResumen ? (
                        <div className="flex-center" style={{ padding: 60 }}>
                            <div className="spinner" style={{ width: 32, height: 32 }} />
                        </div>
                    ) : resumen.length === 0 ? (
                        <div className="empty-state">
                            <Landmark size={40} />
                            <p>No hay proveedores con documentos abiertos para mostrar.</p>
                        </div>
                    ) : (
                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Proveedor</th>
                                        <th>Docs abiertos</th>
                                        <th>Vencidas</th>
                                        <th>Sin vencimiento</th>
                                        <th>Total OS</th>
                                        <th>Total deuda</th>
                                        <th style={{ width: 190 }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {resumen.map(item => (
                                        <tr key={item.proveedor_id}>
                                            <td style={{ fontWeight: 700 }}>{item.proveedor_nombre}</td>
                                            <td>{item.cantidad_documentos}</td>
                                            <td style={{ color: item.vencidas > 0 ? 'var(--warning)' : 'var(--text-secondary)', fontWeight: item.vencidas > 0 ? 700 : 500 }}>
                                                {item.vencidas}
                                            </td>
                                            <td>{item.sin_vencimiento}</td>
                                            <td style={{ color: 'var(--text-secondary)' }}>Gs. {fmt(item.total_os)}</td>
                                            <td style={{ fontWeight: 800, color: 'var(--danger)' }}>Gs. {fmt(item.total_deuda)}</td>
                                            <td>
                                                <div style={{ display: 'flex', gap: 8 }}>
                                                    <button
                                                        type="button"
                                                        className="btn btn-secondary btn-sm"
                                                        onClick={() => setDetalleProveedor(item)}
                                                    >
                                                        <Eye size={14} /> Ver
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn btn-primary btn-sm"
                                                        onClick={() => setPagoProveedor(item)}
                                                        style={{ display: hasActionAccess(user, 'cuentas_por_pagar.pagar', 'cuentas_por_pagar') ? undefined : 'none' }}
                                                    >
                                                        <Wallet size={14} /> Pagar
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
            ) : tab === 'contados' ? (
                <div className="card" style={{ padding: 0 }}>
                    {loadingContados ? (
                        <div className="flex-center" style={{ padding: 60 }}>
                            <div className="spinner" style={{ width: 32, height: 32 }} />
                        </div>
                    ) : contados.length === 0 ? (
                        <div className="empty-state">
                            <ReceiptText size={40} />
                            <p>No hay compras al contado con saldo pendiente.</p>
                        </div>
                    ) : (
                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Fecha</th>
                                        <th>Proveedor</th>
                                        <th>Origen</th>
                                        <th>Documento actual</th>
                                        <th>Saldo</th>
                                        <th>Estado</th>
                                        <th>Entrega</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {contados.map(item => (
                                        <tr key={item.compra_id}>
                                            <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{fmtDate(item.fecha)}</td>
                                            <td style={{ fontWeight: 700 }}>{item.proveedor_nombre}</td>
                                            <td style={{ fontSize: '0.82rem' }}>
                                                <div style={{ fontWeight: 700 }}>{item.tipo_documento_original || item.tipo_documento}</div>
                                                <div style={{ color: 'var(--text-muted)' }}>{item.nro_documento_original || 'S/N'}</div>
                                            </td>
                                            <td style={{ fontSize: '0.82rem' }}>
                                                <div style={{ fontWeight: 700 }}>{item.tipo_documento}</div>
                                                <div style={{ color: 'var(--text-muted)' }}>{item.nro_factura || 'S/N'}</div>
                                            </td>
                                            <td style={{ fontWeight: 800, color: 'var(--warning)' }}>Gs. {fmt(item.saldo)}</td>
                                            <td>{estadoBadge(item.estado)}</td>
                                            <td>{estadoBadge(item.estado_entrega)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            ) : (
                <div className="card" style={{ padding: 0 }}>
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, alignItems: 'end' }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Desde</label>
                                <input className="form-input" type="date" value={historialFechaDesde} onChange={event => setHistorialFechaDesde(event.target.value)} />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Hasta</label>
                                <input className="form-input" type="date" value={historialFechaHasta} onChange={event => setHistorialFechaHasta(event.target.value)} />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Proveedor</label>
                                <RemoteSearchSelect
                                    value={historialProveedorSeleccionado}
                                    onChange={option => {
                                        setHistorialProveedorSeleccionado(option || null)
                                        setHistorialProveedorId(option ? String(option.value) : '')
                                    }}
                                    onSearch={setHistorialProveedorBusqueda}
                                    options={historialProveedores.map(item => ({
                                        value: item.id,
                                        label: item.nombre,
                                    }))}
                                    loading={historialProveedoresLoading}
                                    placeholder="Escriba para buscar proveedor..."
                                    emptyMessage="No se encontraron proveedores"
                                    promptMessage={historialProveedorSeleccionado ? 'Proveedor seleccionado' : 'Escriba para buscar proveedor'}
                                />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">OS</label>
                                <input className="form-input" value={historialOS} onChange={event => setHistorialOS(event.target.value.toUpperCase())} placeholder="Buscar OS" />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Factura</label>
                                <input className="form-input" value={historialFactura} onChange={event => setHistorialFactura(event.target.value.toUpperCase())} placeholder="Buscar factura" />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Cliente asociado</label>
                                <input className="form-input" value={historialCliente} onChange={event => setHistorialCliente(event.target.value.toUpperCase())} placeholder="Buscar cliente" />
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => {
                                    setHistorialFechaDesde('')
                                    setHistorialFechaHasta('')
                                    setHistorialProveedorId('')
                                    setHistorialProveedorSeleccionado(null)
                                    setHistorialProveedorBusqueda('')
                                    setHistorialOS('')
                                    setHistorialFactura('')
                                    setHistorialCliente('')
                                }}
                            >
                                Limpiar
                            </button>
                            {hasActionAccess(user, 'cuentas_por_pagar.exportar', 'cuentas_por_pagar') && (
                                <button
                                    type="button"
                                    className="btn"
                                    style={{ backgroundColor: '#27ae60', color: 'white' }}
                                    onClick={exportarHistorialExcel}
                                    disabled={historialExcelBusy}
                                >
                                    {historialExcelBusy ? 'Exportando...' : 'Excel'}
                                </button>
                            )}
                        </div>
                    </div>
                    {loadingHistorial ? (
                        <div className="flex-center" style={{ padding: 60 }}>
                            <div className="spinner" style={{ width: 32, height: 32 }} />
                        </div>
                    ) : historialPagos.length === 0 ? (
                        <div className="empty-state">
                            <ReceiptText size={40} />
                            <p>No hay pagos a proveedores para mostrar.</p>
                        </div>
                    ) : (
                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Fecha</th>
                                        <th>Proveedor</th>
                                        <th>OS</th>
                                        <th>Factura</th>
                                        <th>Clientes</th>
                                        <th>Metodos</th>
                                        <th>Comprobantes</th>
                                        <th>Total</th>
                                        <th style={{ width: 120 }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {historialPagos.map(item => (
                                        <tr key={item.grupo_id}>
                                            <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{fmtDate(item.fecha)}</td>
                                            <td style={{ fontWeight: 700 }}>{item.proveedor_nombre || '-'}</td>
                                            <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{item.os_origen?.length ? item.os_origen.join(', ') : '-'}</td>
                                            <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{item.facturas?.length ? item.facturas.join(', ') : '-'}</td>
                                            <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{item.clientes?.length ? item.clientes.join(', ') : '-'}</td>
                                            <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{item.metodos?.length ? item.metodos.join(', ') : '-'}</td>
                                            <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{item.comprobantes?.length ? item.comprobantes.join(', ') : '-'}</td>
                                            <td style={{ fontWeight: 800, color: 'var(--success)' }}>Gs. {fmt(item.total)}</td>
                                            <td>
                                                <HistorialPagoActions
                                                    item={item}
                                                    isRevirtiendo={revertirPago.isPending}
                                                    onEditar={selected => setEditarPagoGrupo(selected)}
                                                    onPDF={abrirHistorialPagoPDF}
                                                    onRevertir={selected => {
                                                        if (confirm('Ã‚Â¿Revertir este pago? Esto restaurarÃƒÂ¡ los saldos y devolverÃƒÂ¡ fondos a caja o banco.')) {
                                                            setHistorialRevertingGroupId(selected.grupo_id)
                                                            revertirPago.mutate(selected.grupo_id)
                                                        }
                                                    }}
                                                    user={user}
                                                    pdfOpeningGroupId={historialPdfGroupId}
                                                    revertingGroupId={historialRevertingGroupId}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {detalleProveedor && (
                <Modal
                    title={`Detalle proveedor: ${detalleProveedor.proveedor_nombre}`}
                    onClose={() => setDetalleProveedor(null)}
                    maxWidth="1180px"
                >
                    <DetalleProveedorModal proveedor={detalleProveedor} onClose={() => setDetalleProveedor(null)} />
                </Modal>
            )}
            {pagoProveedor && (
                <Modal
                    title={`Pagar proveedor: ${pagoProveedor.proveedor_nombre}`}
                    onClose={() => setPagoProveedor(null)}
                    maxWidth="860px"
                >
                    <PagoProveedorModal proveedor={pagoProveedor} onClose={() => setPagoProveedor(null)} />
                </Modal>
            )}
            {editarPagoGrupo && (
                <Modal
                    title={`Editar pago: ${editarPagoGrupo.proveedor_nombre || 'Proveedor'}`}
                    onClose={() => setEditarPagoGrupo(null)}
                    maxWidth="860px"
                >
                    <EditarPagoHistorialModal grupoId={editarPagoGrupo.grupo_id} onClose={() => setEditarPagoGrupo(null)} />
                </Modal>
            )}
        </div>
    )
}

