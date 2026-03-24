// HESAKA Web — Página: Ventas (Refactored con lógica financiera completa)
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, useAuth } from '../context/AuthContext'
import Modal from '../components/Modal'
import { TrendingUp, Plus, Search, CreditCard, DollarSign, AlertCircle, X, Ban, Settings, CheckCircle, Clock, Trash2, Box, Printer, Download, Eye } from 'lucide-react'
import { hasActionAccess } from '../utils/roles'
import usePendingNavigationGuard from '../utils/usePendingNavigationGuard'

const fmt = v => new Intl.NumberFormat('es-PY').format(v ?? 0)
const fmtDate = d => d ? new Date(d).toLocaleDateString('es-PY') : '—'
const fmtDateTime = d => d ? new Date(d).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' }) : '—'
const gs = v => `Gs. ${new Intl.NumberFormat('es-PY').format(v ?? 0)}`
const getErrorText = (err, fallback) => {
    const detail = err?.response?.data?.detail
    if (typeof detail === 'string' && detail.trim()) return detail
    if (Array.isArray(detail)) {
        const parts = detail.map(item => {
            if (typeof item === 'string') return item
            if (item && typeof item === 'object') {
                const loc = Array.isArray(item.loc) ? item.loc.join(' > ') : ''
                const msg = item.msg || item.message || JSON.stringify(item)
                return loc ? `${loc}: ${msg}` : msg
            }
            return ''
        }).filter(Boolean)
        if (parts.length) return parts.join(' | ')
    }
    if (detail && typeof detail === 'object') {
        if (detail.msg) return detail.msg
        return JSON.stringify(detail)
    }
    return fallback
}

function GraduacionBox({ titulo, data }) {
    const rowStyle = {
        display: 'grid',
        gridTemplateColumns: '80px repeat(4, minmax(72px, 1fr))',
        gap: 8,
        alignItems: 'center',
    }
    const cellStyle = {
        padding: '8px 10px',
        borderRadius: 8,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid var(--border-color)',
        textAlign: 'center',
        fontWeight: 600,
        minHeight: 38,
    }

    if (!data) {
        return <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No hay graduacion registrada.</div>
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>{titulo}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                    {data.codigo_presupuesto} · {fmtDate(data.fecha_presupuesto)}
                </div>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ ...rowStyle, color: 'var(--text-muted)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    <div></div>
                    <div style={{ textAlign: 'center' }}>Esfera</div>
                    <div style={{ textAlign: 'center' }}>Cilindro</div>
                    <div style={{ textAlign: 'center' }}>Eje</div>
                    <div style={{ textAlign: 'center' }}>Adicion</div>
                </div>
                <div style={rowStyle}>
                    <div style={{ fontWeight: 700 }}>OD</div>
                    <div style={cellStyle}>{data.od_esfera || '-'}</div>
                    <div style={cellStyle}>{data.od_cilindro || '-'}</div>
                    <div style={cellStyle}>{data.od_eje || '-'}</div>
                    <div style={cellStyle}>{data.od_adicion || '-'}</div>
                </div>
                <div style={rowStyle}>
                    <div style={{ fontWeight: 700 }}>OI</div>
                    <div style={cellStyle}>{data.oi_esfera || '-'}</div>
                    <div style={cellStyle}>{data.oi_cilindro || '-'}</div>
                    <div style={cellStyle}>{data.oi_eje || '-'}</div>
                    <div style={cellStyle}>{data.oi_adicion || '-'}</div>
                </div>
            </div>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginBottom: 4 }}>Fecha receta</div>
                    <div>{fmtDate(data.fecha_receta)}</div>
                </div>
                <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginBottom: 4 }}>Doctor</div>
                    <div>{data.doctor || '-'}</div>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginBottom: 4 }}>Observaciones</div>
                    <div style={{ whiteSpace: 'normal', lineHeight: 1.35, wordBreak: 'break-word' }}>{data.observaciones || '-'}</div>
                </div>
            </div>
        </div>
    )
}

function AjusteVentaModal({ venta, onClose, onSaved, onBusyChange }) {
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [form, setForm] = useState({
        tipo: 'AJUSTE',
        monto: venta?.saldo ? String(venta.saldo) : '',
        motivo: '',
    })
    const confirmNavigation = usePendingNavigationGuard(saving, 'El ajuste de venta aun se esta registrando. ¿Seguro que desea salir de esta vista?')

    useEffect(() => {
        onBusyChange?.(saving)
        return () => onBusyChange?.(false)
    }, [onBusyChange, saving])

    const submit = async (event) => {
        event.preventDefault()
        try {
            setSaving(true)
            setError('')
            const monto = parseFloat(form.monto)
            if (!monto || Number.isNaN(monto) || monto <= 0) {
                setError('Debe ingresar un monto valido.')
                setSaving(false)
                return
            }
            await api.post('/ventas/ajustes', {
                venta_id: venta.id,
                tipo: form.tipo,
                monto,
                motivo: form.motivo,
            })
            window.dispatchEvent(new CustomEvent('hesaka:ajuste-venta-creado'))
            await onSaved()
        } catch (err) {
            setError(getErrorText(err, 'No se pudo registrar el ajuste.'))
        } finally {
            setSaving(false)
        }
    }

    return (
        <form onSubmit={submit}>
            <div className="card" style={{ marginBottom: 16, padding: '14px 16px' }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{venta.codigo}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.45 }}>
                    Cliente: {venta.cliente_nombre || 'â€”'}<br />
                    Fecha: {fmtDate(venta.fecha)}<br />
                    Total: {gs(venta.total)}<br />
                    Saldo actual: {gs(venta.saldo)}
                </div>
            </div>

            <div className="grid-2">
                <div className="form-group">
                    <label className="form-label">Tipo</label>
                    <select className="form-select" value={form.tipo} onChange={e => setForm(prev => ({ ...prev, tipo: e.target.value }))}>
                        <option value="DESCUENTO">DESCUENTO</option>
                        <option value="NOTA_CREDITO">NOTA_CREDITO</option>
                        <option value="AJUSTE">AJUSTE</option>
                    </select>
                </div>
                <div className="form-group">
                    <label className="form-label">Monto</label>
                    <input
                        className="form-input"
                        type="number"
                        step="any"
                        min="0"
                        value={form.monto}
                        onChange={e => setForm(prev => ({ ...prev, monto: e.target.value }))}
                        required
                    />
                </div>
            </div>

            <div className="form-group">
                <label className="form-label">Motivo</label>
                <textarea
                    className="form-input"
                    rows={3}
                    value={form.motivo}
                    onChange={e => setForm(prev => ({ ...prev, motivo: e.target.value }))}
                    placeholder="Motivo del ajuste..."
                    style={{ resize: 'vertical' }}
                    required
                />
            </div>

            {error && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, color: '#f87171', fontSize: '0.84rem' }}>
                    {error}
                </div>
            )}

            <div className="flex gap-12" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => { if (confirmNavigation()) onClose() }} disabled={saving}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? 'Guardando...' : 'Registrar ajuste'}
                </button>
            </div>
        </form>
    )
}

const downloadPDF = async (url) => {
    try {
        // Obtenemos el blob con el header Auth correspondiente
        const response = await api.get(url, { responseType: 'blob' })
        // Creamos una URL temporal indicando el MimeType PDF para que el navegador lo renderice
        const file = new Blob([response.data], { type: 'application/pdf' })
        const fileURL = URL.createObjectURL(file)

        // Abrimos en pestaña nueva nativamente
        window.open(fileURL, '_blank')

        // Limpiamos memoria tras un tiempo seguro
        setTimeout(() => URL.revokeObjectURL(fileURL), 30000)
    } catch (error) {
        console.error("Error al abrir PDF:", error)
        alert("No se pudo cargar el PDF.")
    }
}

const downloadPDFPost = async (url, data) => {
    try {
        const response = await api.post(url, data, { responseType: 'blob' })
        const file = new Blob([response.data], { type: 'application/pdf' })
        const fileURL = URL.createObjectURL(file)
        window.open(fileURL, '_blank')
        setTimeout(() => URL.revokeObjectURL(fileURL), 30000)
    } catch (error) {
        console.error("Error al abrir PDF:", error)
        alert(error?.response?.data?.detail || "No se pudo cargar el PDF.")
    }
}

const METODOS_PAGO = [
    { value: 'EFECTIVO', label: '💵 Efectivo' },
    { value: 'TARJETA', label: '💳 Tarjeta' },
    { value: 'TRANSFERENCIA', label: '🏦 Transferencia' },
    { value: 'CHEQUE', label: '📄 Cheque' },
]

const estadoBadge = (estado) => {
    const m = {
        PAGADO: 'badge-green', PENDIENTE: 'badge-yellow', ANULADA: 'badge-red', CREDITO: 'badge-blue',
        EN_LABORATORIO: 'badge-yellow', RECIBIDO: 'badge-blue', ENTREGADO: 'badge-green',
        PENDIENTE_ENVIO: 'badge-red', ANULADO: 'badge-gray'
    }
    return <span className={`badge ${m[estado] || 'badge-gray'}`}>{estado}</span>
}

// ─── Modal de Gestión de Pagos (Historial y Nuevo) ─────────────────────────
function GestionPagosModal({ ventaId, onClose, onBusyChange }) {
    const qc = useQueryClient()
    const [monto, setMonto] = useState('')
    const [metodo, setMetodo] = useState('EFECTIVO')
    const [bancoId, setBancoId] = useState('')
    const [nota, setNota] = useState('')
    const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 16))
    const [pdfOpeningPagoId, setPdfOpeningPagoId] = useState(null)
    const [deletingPagoId, setDeletingPagoId] = useState(null)

    const { data: venta, isLoading } = useQuery({
        queryKey: ['venta', ventaId],
        queryFn: () => api.get(`/ventas/${ventaId}`).then(r => r.data)
    })

    const { data: bancos = [] } = useQuery({ queryKey: ['bancos'], queryFn: () => api.get('/bancos/').then(r => r.data) })

    const cobrar = useMutation({
        mutationFn: d => api.post(`/ventas/${ventaId}/pagos`, d),
        onSuccess: async () => {
            await Promise.all([
                qc.invalidateQueries(['venta', ventaId]),
                qc.invalidateQueries(['ventas']),
                qc.invalidateQueries(['ventas-optimizado']),
                qc.invalidateQueries(['saldo-caja'])
            ])
            setMonto(''); setNota('')
        }
    })

    const eliminar = useMutation({
        mutationFn: pagoId => api.delete(`/ventas/${ventaId}/pagos/${pagoId}`),
        onMutate: pagoId => {
            setDeletingPagoId(pagoId)
        },
        onSuccess: async () => {
            await Promise.all([
                qc.invalidateQueries(['venta', ventaId]),
                qc.invalidateQueries(['ventas']),
                qc.invalidateQueries(['ventas-optimizado']),
                qc.invalidateQueries(['saldo-caja'])
            ])
        },
        onSettled: () => {
            setDeletingPagoId(null)
        }
    })
    const confirmNavigation = usePendingNavigationGuard(Boolean(cobrar.isPending || deletingPagoId || pdfOpeningPagoId), 'La gestion de pagos aun se esta procesando. ¿Seguro que desea salir de esta vista?')

    useEffect(() => {
        const busy = Boolean(cobrar.isPending || deletingPagoId || pdfOpeningPagoId)
        onBusyChange?.(busy)
        return () => onBusyChange?.(false)
    }, [cobrar.isPending, deletingPagoId, onBusyChange, pdfOpeningPagoId])

    if (isLoading || !venta) return <div className="flex-center p-20"><div className="spinner"></div></div>

    const handleSubmit = e => {
        e.preventDefault()
        if (cobrar.isPending) return
        cobrar.mutate({
            monto: parseFloat(monto),
            metodo_pago: metodo,
            banco_id: bancoId ? parseInt(bancoId) : null,
            nota: nota || null,
            fecha: new Date(fecha).toISOString()
        })
    }

    const abrirReciboPago = async (pagoId) => {
        if (pdfOpeningPagoId === pagoId) return
        setPdfOpeningPagoId(pagoId)
        try {
            await downloadPDF(`/ventas/${ventaId}/pagos/${pagoId}/pdf`)
        } finally {
            setPdfOpeningPagoId(null)
        }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Info Resumen */}
            <div style={{ background: 'rgba(26,86,219,0.06)', border: '1px solid rgba(26,86,219,0.15)', borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between' }}>
                <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Total Venta</div>
                    <div style={{ fontWeight: 600 }}>Gs. {fmt(venta.total)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Saldo Pendiente</div>
                    <div style={{ fontWeight: 700, color: venta.saldo > 0 ? 'var(--warning)' : 'var(--success)', fontSize: '1.1rem' }}>
                        Gs. {fmt(venta.saldo)}
                    </div>
                </div>
            </div>

            {/* Historial de Pagos */}
            <div>
                <h4 style={{ fontSize: '0.9rem', marginBottom: 10, color: 'var(--text-secondary)' }}>Historial de Cobros</h4>
                {venta.pagos?.length === 0 ? (
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No hay cobros registrados.</p>
                ) : (
                    <table style={{ background: 'var(--surface-50)', borderRadius: 8, overflow: 'hidden' }}>
                        <thead>
                            <tr style={{ background: 'var(--surface-hover)' }}>
                                <th style={{ py: 6, fontSize: '0.75rem' }}>Fecha</th>
                                <th style={{ py: 6, fontSize: '0.75rem' }}>Método</th>
                                <th style={{ py: 6, fontSize: '0.75rem' }}>Monto</th>
                                <th style={{ py: 6, fontSize: '0.75rem', width: 70 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {venta.pagos?.map(p => (
                                <tr key={p.id}>
                                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{fmtDateTime(p.fecha)}</td>
                                    <td style={{ fontSize: '0.8rem', fontWeight: 500 }}>{p.metodo_pago}</td>
                                    <td style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--success)' }}>Gs. {fmt(p.monto)}</td>
                                    <td>
                                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                            <button className="btn-icon" style={{ color: 'var(--primary)' }} title="Imprimir Recibo"
                                                onClick={() => abrirReciboPago(p.id)}
                                                disabled={pdfOpeningPagoId === p.id || cobrar.isPending}>
                                                <Printer size={14} />
                                            </button>
                                            <button className="btn-icon" style={{ color: 'var(--danger)' }} title="Eliminar/Revertir pago"
                                                onClick={() => { if (confirm('¿Eliminar cobro? Se revertirá en caja/bancos.')) eliminar.mutate(p.id) }}
                                                disabled={deletingPagoId === p.id || cobrar.isPending}>
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Formulario Nuevo Pago */}
            {venta.saldo > 0 && venta.estado !== 'ANULADA' && (
                <form onSubmit={handleSubmit} style={{ background: 'var(--surface-50)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
                    <h4 style={{ fontSize: '0.9rem', marginBottom: 12 }}>Registrar Cobro</h4>
                    <div className="grid-2 mb-12">
                        <div className="form-group">
                            <label className="form-label">Monto (Gs.)</label>
                            <input className="form-input" type="number" value={monto} onChange={e => setMonto(e.target.value)} required placeholder="0" max={venta.saldo} min={0} step="any" disabled={cobrar.isPending} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Método</label>
                            <select className="form-select" value={metodo} onChange={e => setMetodo(e.target.value)} disabled={cobrar.isPending}>
                                {METODOS_PAGO.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                        </div>
                    </div>
                    {['TARJETA', 'TRANSFERENCIA'].includes(metodo) && (
                        <div className="form-group mb-12">
                            <label className="form-label">Banco Destino *</label>
                            <select className="form-select" value={bancoId} onChange={e => setBancoId(e.target.value)} required disabled={cobrar.isPending}>
                                <option value="">Seleccionar banco...</option>
                                {bancos.map(b => <option key={b.id} value={b.id}>{b.nombre_banco} — {b.numero_cuenta}</option>)}
                            </select>
                            {metodo === 'TARJETA' && (
                                <p style={{ fontSize: '0.72rem', color: 'var(--warning)', marginTop: 4 }}>⚠️ Descuento automático por comisión bancaria activado.</p>
                            )}
                        </div>
                    )}
                    <div className="grid-2 mb-16">
                        <div className="form-group">
                            <label className="form-label">Fecha del Pago</label>
                            <input className="form-input" type="datetime-local" value={fecha} onChange={e => setFecha(e.target.value)} required disabled={cobrar.isPending} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Nota (opcional)</label>
                            <input className="form-input" value={nota} onChange={e => setNota(e.target.value)} placeholder="Ej: Pago parcial..." disabled={cobrar.isPending} />
                        </div>
                    </div>
                    {cobrar.isError && (
                        <div style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', padding: '8px 12px', borderRadius: 6, fontSize: '0.8rem', marginBottom: 12 }}>
                            {cobrar.error?.response?.data?.detail || 'Error al registrar.'}
                        </div>
                    )}
                    <div className="flex gap-8" style={{ justifyContent: 'flex-end' }}>
                        <button type="submit" className="btn btn-primary" disabled={cobrar.isPending}>
                            {cobrar.isPending ? 'Aplicando cobro...' : 'Aplicar Cobro'}
                        </button>
                    </div>
                </form>
            )}

            {venta.saldo === 0 && venta.estado !== 'ANULADA' && (
                <div style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--success)', padding: 16, borderRadius: 8, textAlign: 'center', fontWeight: 600 }}>
                    ✅ Venta cobrada en su totalidad
                </div>
            )}
        </div>
    )
}

function ClienteFichaModal({ clienteId, onClose }) {
    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['cliente-ficha', clienteId],
        queryFn: () => api.get(`/clientes/${clienteId}/ficha`).then(r => r.data),
        retry: false,
        enabled: !!clienteId,
    })

    if (isLoading) {
        return <div className="flex-center" style={{ padding: 50 }}><div className="spinner" style={{ width: 28, height: 28 }} /></div>
    }

    if (isError || !data) {
        return <div style={{ color: 'var(--danger)', fontSize: '0.9rem' }}>{error?.response?.data?.detail || 'No se pudo cargar la ficha del cliente.'}</div>
    }

    const { cliente, deuda_total, movimientos, ventas_pendientes, ultima_graduacion, historial_armazones = [] } = data

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="card" style={{ padding: '14px 16px' }}>
                <div style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: 8 }}>{cliente.nombre}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem', lineHeight: 1.5 }}>
                    CI/RUC: {cliente.ci || '-'}<br />
                    Telefono: {cliente.telefono || '-'}<br />
                    Email: {cliente.email || '-'}<br />
                    Direccion: {cliente.direccion || '-'}<br />
                    Referidor: {cliente.referidor_nombre || '-'}
                </div>
                <div style={{ marginTop: 12, color: 'var(--warning)', fontWeight: 800, fontSize: '1.05rem' }}>
                    Deuda total: {gs(deuda_total)}
                </div>
            </div>

            <div className="card" style={{ padding: '14px 16px' }}>
                <h4 style={{ marginBottom: 12, fontSize: '0.96rem' }}>Ultima graduacion</h4>
                <GraduacionBox titulo="Receta mas reciente" data={ultima_graduacion} />
            </div>

            <div className="card" style={{ padding: '14px 16px' }}>
                <h4 style={{ marginBottom: 12, fontSize: '0.96rem' }}>Deudas pendientes</h4>
                <div className="table-container" style={{ maxHeight: 220, overflow: 'auto' }}>
                    <table style={{ minWidth: 640 }}>
                        <thead>
                            <tr>
                                <th>Fecha</th>
                                <th>Venta</th>
                                <th className="text-right">Total</th>
                                <th className="text-right">Saldo</th>
                                <th>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ventas_pendientes.length === 0 ? (
                                <tr><td colSpan="5" className="text-center" style={{ padding: 20, color: 'var(--text-muted)' }}>Sin deudas pendientes.</td></tr>
                            ) : ventas_pendientes.map(item => (
                                <tr key={item.venta_id}>
                                    <td>{fmtDate(item.fecha)}</td>
                                    <td>{item.codigo}</td>
                                    <td className="text-right">{gs(item.total)}</td>
                                    <td className="text-right" style={{ color: 'var(--warning)', fontWeight: 700 }}>{gs(item.saldo)}</td>
                                    <td>{item.estado}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="card" style={{ padding: '14px 16px' }}>
                <h4 style={{ marginBottom: 12, fontSize: '0.96rem' }}>Estado de cuenta</h4>
                <div className="table-container" style={{ maxHeight: 300, overflow: 'auto' }}>
                    <table style={{ minWidth: 820 }}>
                        <thead>
                            <tr>
                                <th>Fecha</th>
                                <th>Tipo</th>
                                <th>Descripcion</th>
                                <th className="text-right">Debito</th>
                                <th className="text-right">Credito</th>
                                <th className="text-right">Saldo</th>
                            </tr>
                        </thead>
                        <tbody>
                            {movimientos.length === 0 ? (
                                <tr><td colSpan="6" className="text-center" style={{ padding: 20, color: 'var(--text-muted)' }}>Sin movimientos.</td></tr>
                            ) : movimientos.map((mov, index) => (
                                <tr key={`${mov.fecha}-${mov.tipo}-${index}`}>
                                    <td>{fmtDate(mov.fecha)}</td>
                                    <td>{mov.tipo}</td>
                                    <td style={{ whiteSpace: 'normal', lineHeight: 1.25, wordBreak: 'break-word' }}>{mov.descripcion}</td>
                                    <td className="text-right">{gs(mov.debito)}</td>
                                    <td className="text-right">{gs(mov.credito)}</td>
                                    <td className="text-right" style={{ fontWeight: 700 }}>{gs(mov.saldo_acumulado)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="card" style={{ padding: '14px 16px' }}>
                <h4 style={{ marginBottom: 12, fontSize: '0.96rem' }}>Historial de armazones</h4>
                <div className="table-container" style={{ maxHeight: 320, overflow: 'auto' }}>
                    <table style={{ minWidth: 980 }}>
                        <thead>
                            <tr>
                                <th>Fecha</th>
                                <th>Armazon</th>
                                <th>Cod.</th>
                                <th>Medidas</th>
                                <th className="text-right">Precio</th>
                                <th>Venta</th>
                                <th>Receta asociada</th>
                            </tr>
                        </thead>
                        <tbody>
                            {historial_armazones.length === 0 ? (
                                <tr><td colSpan="7" className="text-center" style={{ padding: 20, color: 'var(--text-muted)' }}>Sin historial de armazones.</td></tr>
                            ) : historial_armazones.map((item, index) => (
                                <tr key={`${item.fecha}-${item.codigo_armazon || item.codigo_producto}-${index}`}>
                                    <td>{fmtDate(item.fecha)}</td>
                                    <td style={{ whiteSpace: 'normal', lineHeight: 1.25, wordBreak: 'break-word' }}>{item.producto}</td>
                                    <td>{item.codigo_armazon || item.codigo_producto || '-'}</td>
                                    <td>{item.medidas || '-'}</td>
                                    <td className="text-right">{gs(item.precio_venta)}</td>
                                    <td>{item.venta_codigo || '-'}</td>
                                    <td style={{ whiteSpace: 'normal', lineHeight: 1.25, wordBreak: 'break-word' }}>
                                        {item.graduacion
                                            ? `${fmtDate(item.graduacion.fecha_receta)} · ${item.graduacion.doctor || '-'}`
                                            : '-'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="flex gap-12" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={onClose}>Cerrar</button>
            </div>
        </div>
    )
}

// ─── Componente Menú de Acciones ───────────────────────────────────────────────
function VentasRowActions({ venta, onPagar, onVerFicha, onAjustar, onAnular, qc, anularMutation, user, anularBusyId }) {
    const [open, setOpen] = useState(false)
    const [exporting, setExporting] = useState(false)
    const [menuPosition, setMenuPosition] = useState(null)
    const triggerRef = useRef(null)
    const puedeCobrar = hasActionAccess(user, 'ventas.cobrar', 'ventas')
    const puedeAjustar = hasActionAccess(user, 'ventas.ajustar', 'ventas')
    const puedeEntrega = hasActionAccess(user, 'ventas.entrega', 'ventas')
    const puedeAnular = hasActionAccess(user, 'ventas.anular', 'ventas')
    const puedeExportar = hasActionAccess(user, 'ventas.exportar', 'ventas')
    const anularBusy = anularBusyId === venta.id
    const toggleEntrega = useMutation({
        mutationFn: estado => api.patch(`/ventas/${venta.id}/estado_entrega`, { estado_entrega: estado }),
        onSuccess: async () => {
            await Promise.all([
                qc.invalidateQueries(['ventas']),
                qc.invalidateQueries(['ventas-optimizado'])
            ])
        }
    })
    const actionBusy = exporting || toggleEntrega.isPending || anularBusy

    const handleAction = (cb) => { setOpen(false); cb() }
    const handleExport = async () => {
        if (exporting) return
        setOpen(false)
        setExporting(true)
        try {
            await downloadPDF(`/ventas/${venta.id}/pdf`)
        } finally {
            setExporting(false)
        }
    }
    useEffect(() => {
        if (!open || !triggerRef.current) return

        const updatePosition = () => {
            if (!triggerRef.current) return
            const rect = triggerRef.current.getBoundingClientRect()
            setMenuPosition({
                top: Math.max(12, rect.top - 6),
                left: Math.max(12, rect.right),
            })
        }

        updatePosition()
        window.addEventListener('resize', updatePosition)
        window.addEventListener('scroll', updatePosition, true)

        return () => {
            window.removeEventListener('resize', updatePosition)
            window.removeEventListener('scroll', updatePosition, true)
        }
    }, [open])

    return (
        <div style={{ position: 'relative' }}>
            <div ref={triggerRef} style={{ display: 'flex', gap: 6 }}>
                <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => { if (!actionBusy) setOpen(!open) }}
                    disabled={actionBusy}
                >
                    {actionBusy ? 'Procesando...' : 'Acciones ▾'}
                </button>
            </div>

            {open && menuPosition && (
                <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={() => setOpen(false)} />
                    <div style={{ position: 'fixed', top: menuPosition.top, left: menuPosition.left, transform: 'translate(-100%, -100%)', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.5)', padding: '4px 0', minWidth: 210, zIndex: 100 }}>
                        <button className="dropdown-item" onClick={() => handleAction(() => onVerFicha(venta))} disabled={actionBusy}>
                            <Eye size={14} style={{ marginRight: 8 }} /> Ficha cliente
                        </button>
                        {puedeCobrar && (
                            <button className="dropdown-item" onClick={() => handleAction(() => onPagar(venta))} disabled={actionBusy}>
                                <CreditCard size={14} style={{ marginRight: 8 }} /> Gestión de Pagos
                            </button>
                        )}
                        {puedeExportar && (
                            <button className="dropdown-item" onClick={() => handleAction(handleExport)} disabled={actionBusy}>
                                <Printer size={14} style={{ marginRight: 8 }} /> {exporting ? 'Abriendo PDF...' : 'Imprimir Detalles Venta'}
                            </button>
                        )}
                        {puedeAjustar && venta.estado !== 'ANULADA' && (
                            <button className="dropdown-item" onClick={() => handleAction(() => onAjustar(venta))} disabled={actionBusy}>
                                <Settings size={14} style={{ marginRight: 8 }} /> Ajustar venta
                            </button>
                        )}
                        {(puedeEntrega || puedeAnular) && <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />}

                        {puedeEntrega && venta.estado !== 'ANULADA' && venta.estado_entrega !== 'ENTREGADO' && (
                            <button className="dropdown-item" style={{ color: 'var(--success)' }} onClick={() => handleAction(() => toggleEntrega.mutate('ENTREGADO'))} disabled={actionBusy}>
                                <CheckCircle size={14} style={{ marginRight: 8 }} /> {toggleEntrega.isPending ? 'Guardando...' : 'Marcar Entregado'}
                            </button>
                        )}
                        {puedeEntrega && venta.estado !== 'ANULADA' && venta.estado_entrega === 'ENTREGADO' && (
                            <button className="dropdown-item" onClick={() => handleAction(() => toggleEntrega.mutate('EN_LABORATORIO'))} disabled={actionBusy}>
                                <Clock size={14} style={{ marginRight: 8 }} /> {toggleEntrega.isPending ? 'Guardando...' : 'Deshacer Entrega'}
                            </button>
                        )}

                        {puedeAnular && (
                            <button className="dropdown-item" style={{ color: 'var(--danger)' }} disabled={actionBusy} onClick={() => handleAction(() => {
                                if (confirm(`¿ANULAR VENTA ${venta.codigo}?\n- Revierte todos los cobros.\n- Devuelve el stock.\n- No se puede deshacer.`)) {
                                    onAnular(venta.id)
                                }
                            })}>
                                <Ban size={14} style={{ marginRight: 8 }} /> {anularBusy ? 'Anulando...' : 'Anular Venta'}
                            </button>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}

// ─── Tabla principal de ventas ─────────────────────────────────────────────────
export default function VentasPage() {
    const qc = useQueryClient()
    const { user } = useAuth()
    const [buscar, setBuscar] = useState('')
    const [buscarDebounced, setBuscarDebounced] = useState('')
    const [estadoFiltro, setEstadoFiltro] = useState('')
    const [entregaFiltro, setEntregaFiltro] = useState('')
    const [vendedorFiltro, setVendedorFiltro] = useState('')
    const [canalFiltro, setCanalFiltro] = useState('')
    const [soloPendientes, setSoloPendientes] = useState(false)
    const [ventaPagos, setVentaPagos] = useState(null)
    const [ventaAjuste, setVentaAjuste] = useState(null)
    const [clienteFichaId, setClienteFichaId] = useState(null)
    const [ventaPagosModalBusy, setVentaPagosModalBusy] = useState(false)
    const [ventaAjusteModalBusy, setVentaAjusteModalBusy] = useState(false)
    const [seleccionadas, setSeleccionadas] = useState([])
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(25)
    const [pdfConjuntoBusy, setPdfConjuntoBusy] = useState(false)
    const [anularBusyId, setAnularBusyId] = useState(null)
    const confirmPageNavigation = usePendingNavigationGuard(Boolean(pdfConjuntoBusy || anularBusyId), 'Hay una accion de venta aun en proceso. ¿Seguro que desea salir de esta vista?')

    useEffect(() => {
        const timer = setTimeout(() => setBuscarDebounced(buscar.trim()), 350)
        return () => clearTimeout(timer)
    }, [buscar])

    useEffect(() => {
        setPage(1)
    }, [buscarDebounced, estadoFiltro, entregaFiltro, vendedorFiltro, canalFiltro, soloPendientes, pageSize])

    useEffect(() => {
        setSeleccionadas([])
    }, [page, buscarDebounced, estadoFiltro, entregaFiltro, vendedorFiltro, canalFiltro, soloPendientes, pageSize])

    const { data: vendedoresFiltro = [] } = useQuery({
        queryKey: ['ventas-vendedores-filtro'],
        queryFn: () => api.get('/vendedores/?solo_activos=true&limit=200').then(r => r.data),
        retry: false,
    })

    const { data: canalesFiltro = [] } = useQuery({
        queryKey: ['ventas-canales-filtro'],
        queryFn: () => api.get('/canales-venta/?solo_activos=true&limit=200').then(r => r.data),
        retry: false,
    })

    const { data, isLoading } = useQuery({
        queryKey: ['ventas-optimizado', buscarDebounced, estadoFiltro, entregaFiltro, vendedorFiltro, canalFiltro, soloPendientes, page, pageSize],
        queryFn: () => {
            const params = new URLSearchParams()
            params.append('page', String(page))
            params.append('page_size', String(pageSize))
            if (estadoFiltro) params.append('estado', estadoFiltro)
            if (entregaFiltro) params.append('estado_entrega', entregaFiltro)
            if (vendedorFiltro) params.append('vendedor_id', vendedorFiltro)
            if (canalFiltro) params.append('canal_venta_id', canalFiltro)
            if (buscarDebounced) params.append('search', buscarDebounced)
            if (soloPendientes) params.append('con_saldo', 'true')
            return api.get(`/ventas/listado-optimizado?${params}`).then(r => r.data)
        },
        retry: false,
    })

    const ventas = data?.items || []
    const totalRegistros = data?.total || 0
    const totalPages = data?.total_pages || 1

    const anular = useMutation({
        mutationFn: id => api.post(`/ventas/${id}/anular`),
        onSuccess: async () => {
            await Promise.all([
                qc.invalidateQueries(['ventas']),
                qc.invalidateQueries(['ventas-optimizado']),
                qc.invalidateQueries(['saldo-caja'])
            ])
        }
        ,
        onSettled: () => setAnularBusyId(null)
    })

    const filtradas = ventas

    const idsFiltradas = useMemo(() => filtradas.map(v => v.id), [filtradas])
    const seleccionadasVisibles = useMemo(
        () => seleccionadas.filter(id => idsFiltradas.includes(id)),
        [seleccionadas, idsFiltradas]
    )
    const todasVisiblesSeleccionadas = filtradas.length > 0 && seleccionadasVisibles.length === filtradas.length

    const toggleSeleccion = (ventaId) => {
        setSeleccionadas(prev => prev.includes(ventaId)
            ? prev.filter(id => id !== ventaId)
            : [...prev, ventaId]
        )
    }

    const toggleSeleccionTodas = () => {
        if (todasVisiblesSeleccionadas) {
            setSeleccionadas(prev => prev.filter(id => !idsFiltradas.includes(id)))
            return
        }
        setSeleccionadas(prev => Array.from(new Set([...prev, ...idsFiltradas])))
    }

    const abrirPdfMultiple = async () => {
        if (pdfConjuntoBusy) return
        if (seleccionadasVisibles.length === 0) {
            alert('Selecciona al menos una venta.')
            return
        }
        setPdfConjuntoBusy(true)
        try {
            await downloadPDFPost('/ventas/pdf-multiple', { venta_ids: seleccionadasVisibles })
        } finally {
            setPdfConjuntoBusy(false)
        }
    }

    const totalVentas = filtradas.reduce((s, v) => s + v.total, 0)
    const totalCobrado = filtradas.reduce((s, v) => s + (v.total - v.saldo), 0)
    const totalPendiente = filtradas.reduce((s, v) => s + v.saldo, 0)

    return (
        <div className="page-body">
            <div className="flex-between mb-24">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, background: 'rgba(16,185,129,0.15)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <TrendingUp size={20} style={{ color: 'var(--success)' }} />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Gestión de Ventas</h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Control de facturación, cobros y entregas</p>
                    </div>
                </div>
            </div>

            {/* Stats rápidas */}
            <div className="stats-grid mb-24" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div className="stat-card">
                    <div className="stat-icon green"><DollarSign size={22} /></div>
                    <div className="stat-info"><div className="stat-label">Total en Viñeta</div><div className="stat-value" style={{ fontSize: '1.1rem' }}>Gs. {fmt(totalVentas)}</div></div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon blue"><CreditCard size={22} /></div>
                    <div className="stat-info"><div className="stat-label">Cobrado</div><div className="stat-value" style={{ fontSize: '1.1rem' }}>Gs. {fmt(totalCobrado)}</div></div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon orange"><AlertCircle size={22} /></div>
                    <div className="stat-info"><div className="stat-label">Pendiente Cobro</div><div className="stat-value" style={{ fontSize: '1.1rem', color: totalPendiente > 0 ? 'var(--warning)' : 'var(--success)' }}>Gs. {fmt(totalPendiente)}</div></div>
                </div>
            </div>

            {/* Filtros */}
            <div className="card mb-16" style={{ padding: '14px 20px', display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
                <div className="search-bar" style={{ minWidth: 260 }}>
                    <Search size={16} />
                    <input placeholder="Buscar Cód o Cliente..." value={buscar} onChange={e => setBuscar(e.target.value)} />
                </div>
                <select className="form-select" style={{ width: 160 }} value={estadoFiltro} onChange={e => setEstadoFiltro(e.target.value)}>
                    <option value="">Todos los Estados</option>
                    <option value="PENDIENTE">PENDIENTE COBRO</option>
                    <option value="PAGADO">PAGADO</option>
                    <option value="ANULADA">ANULADO</option>
                </select>
                <select className="form-select" style={{ width: 170 }} value={entregaFiltro} onChange={e => setEntregaFiltro(e.target.value)}>
                    <option value="">Filtro Laboratorio</option>
                    <option value="EN_LABORATORIO">EN LABORATORIO</option>
                    <option value="ENTREGADO">ENTREGADO</option>
                </select>
                <select className="form-select" style={{ width: 180 }} value={vendedorFiltro} onChange={e => setVendedorFiltro(e.target.value)}>
                    <option value="">Todos los vendedores</option>
                    {vendedoresFiltro.map(vendedor => <option key={vendedor.id} value={vendedor.id}>{vendedor.nombre}</option>)}
                </select>
                <select className="form-select" style={{ width: 180 }} value={canalFiltro} onChange={e => setCanalFiltro(e.target.value)}>
                    <option value="">Todos los canales</option>
                    {canalesFiltro.map(canal => <option key={canal.id} value={canal.id}>{canal.nombre}</option>)}
                </select>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={soloPendientes} onChange={e => setSoloPendientes(e.target.checked)} style={{ accentColor: 'var(--primary)', width: 16, height: 16 }} />
                    <span style={{ fontWeight: 500, color: 'var(--text)' }}>Solo con Saldo</span>
                </label>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <select
                        className="form-select"
                        style={{ width: 110 }}
                        value={pageSize}
                        onChange={e => setPageSize(parseInt(e.target.value, 10))}
                    >
                        <option value={10}>10 / pag.</option>
                        <option value={25}>25 / pag.</option>
                        <option value={50}>50 / pag.</option>
                    </select>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {seleccionadasVisibles.length} seleccionada{seleccionadasVisibles.length === 1 ? '' : 's'}
                    </span>
                    {hasActionAccess(user, 'ventas.exportar', 'ventas') && (
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={abrirPdfMultiple}
                            disabled={seleccionadasVisibles.length === 0 || pdfConjuntoBusy}
                            title="Abrir un solo PDF con las ventas seleccionadas"
                        >
                            <Download size={14} style={{ marginRight: 6 }} />
                            {pdfConjuntoBusy ? 'Abriendo PDF...' : 'PDF conjunto'}
                        </button>
                    )}
                </div>
            </div>

            <div className="card" style={{ padding: 0 }}>
                {isLoading ? (
                    <div className="flex-center" style={{ padding: 60 }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>
                ) : filtradas.length === 0 ? (
                    <div className="empty-state"><Box size={40} /><p>No hay ventas listadas.</p></div>
                ) : (
                    <div className="table-container" style={{ width: '100%', maxWidth: '100%', overflowX: 'auto' }}>
                        <table style={{ minWidth: 1260, tableLayout: 'fixed' }}>
                            <thead>
                                <tr>
                                    <th style={{ width: 42 }}>
                                        <input
                                            type="checkbox"
                                            checked={todasVisiblesSeleccionadas}
                                            onChange={toggleSeleccionTodas}
                                            title="Seleccionar ventas visibles"
                                            style={{ accentColor: 'var(--primary)', width: 16, height: 16 }}
                                        />
                                    </th>
                                    <th>Cód.</th><th>Fecha</th><th>Cliente</th>
                                    <th>Vendedor</th><th>Canal</th><th>Total</th><th>Saldo</th>
                                    <th>Finanzas</th><th>Lab.</th><th style={{ width: 180 }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtradas.map(v => (
                                    <tr key={v.id} style={{ opacity: v.estado === 'ANULADA' ? 0.5 : 1 }}>
                                        <td>
                                            <input
                                                type="checkbox"
                                                checked={seleccionadas.includes(v.id)}
                                                onChange={() => toggleSeleccion(v.id)}
                                                title={`Seleccionar venta ${v.codigo}`}
                                                style={{ accentColor: 'var(--primary)', width: 16, height: 16 }}
                                            />
                                        </td>
                                        <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'normal', lineHeight: 1.25, wordBreak: 'break-word' }}>{v.codigo}</td>
                                        <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{fmtDate(v.fecha)}</td>
                                        <td style={{ fontWeight: 500 }}>{v.cliente_nombre || '—'}</td>
                                        <td style={{ color: 'var(--text-secondary)', whiteSpace: 'normal', lineHeight: 1.25, wordBreak: 'break-word' }}>{v.vendedor_nombre || '—'}</td>
                                        <td style={{ color: 'var(--text-secondary)', whiteSpace: 'normal', lineHeight: 1.25, wordBreak: 'break-word' }}>{v.canal_venta_nombre || 'Canal principal'}</td>
                                        <td style={{ fontWeight: 600 }}>Gs. {fmt(v.total)}</td>
                                        <td style={{ color: v.saldo > 0 ? 'var(--warning)' : 'var(--success)', fontWeight: v.saldo > 0 ? 700 : 400 }}>
                                            {v.saldo > 0 ? `Gs. ${fmt(v.saldo)}` : '✓'}
                                        </td>
                                        <td>{estadoBadge(v.estado)}</td>
                                        <td>{estadoBadge(v.estado_entrega)}</td>
                                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                            <VentasRowActions
                                                venta={v}
                                                onPagar={setVentaPagos}
                                                onAjustar={setVentaAjuste}
                                                onVerFicha={(venta) => setClienteFichaId(venta.cliente_id)}
                                                onAnular={(ventaId) => {
                                                    setAnularBusyId(ventaId)
                                                    anular.mutate(ventaId)
                                                }}
                                                qc={qc}
                                                anularMutation={anular}
                                                user={user}
                                                anularBusyId={anularBusyId}
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
                    Mostrando pagina <strong>{page}</strong> de <strong>{totalPages}</strong> · <strong>{totalRegistros}</strong> venta{totalRegistros === 1 ? '' : 's'} encontradas
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

            {ventaPagos && (
                <Modal
                    title={`Gestión de Pagos: ${ventaPagos.codigo}`}
                    onClose={() => setVentaPagos(null)}
                    maxWidth="550px"
                    closeDisabled={ventaPagosModalBusy}
                    onCloseAttempt={() => window.alert('La gestion de pagos aun se esta procesando. Espera a que termine antes de cerrar.')}
                >
                    <GestionPagosModal ventaId={ventaPagos.id} onClose={() => setVentaPagos(null)} onBusyChange={setVentaPagosModalBusy} />
                </Modal>
            )}
            {ventaAjuste && (
                <Modal title={`Ajustar Venta: ${ventaAjuste.codigo}`} onClose={() => setVentaAjuste(null)} maxWidth="640px" closeDisabled={ventaAjusteModalBusy} onCloseAttempt={() => window.alert('El ajuste de venta aun se esta registrando. Espera a que termine antes de cerrar.')}>
                    <AjusteVentaModal
                        venta={ventaAjuste}
                        onClose={() => setVentaAjuste(null)}
                        onBusyChange={setVentaAjusteModalBusy}
                        onSaved={async () => {
                            await Promise.all([
                                qc.invalidateQueries(['ventas']),
                                qc.invalidateQueries(['ventas-optimizado'])
                            ])
                            setVentaAjuste(null)
                        }}
                    />
                </Modal>
            )}
            {clienteFichaId && (
                <Modal title="Ficha de Cliente" onClose={() => setClienteFichaId(null)} maxWidth="980px">
                    <ClienteFichaModal clienteId={clienteFichaId} onClose={() => setClienteFichaId(null)} />
                </Modal>
            )}
        </div>
    )
}
