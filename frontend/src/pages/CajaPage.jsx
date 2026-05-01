import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../context/AuthContext'
import Modal from '../components/Modal'
import FinancialJornadaNotice from '../components/FinancialJornadaNotice'
import { ArrowDownCircle, ArrowUpCircle, CreditCard, DollarSign, Eye, Pencil, Plus, Trash2 } from 'lucide-react'
import { invalidateJornadaLiveData, useFinancialJornadaStatus } from '../hooks/useFinancialJornada'
import { parseBackendDateTime } from '../utils/formatters'

const fmt = v => new Intl.NumberFormat('es-PY').format(v ?? 0)
const fmtDate = d => {
    const date = parseBackendDateTime(d)
    return date ? date.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'
}

function tipoBadge(tipo) {
    if (['INGRESO', 'VENTA'].includes(tipo)) return <span className="badge badge-green">{tipo}</span>
    if (['GASTO', 'EGRESO'].includes(tipo)) return <span className="badge badge-red">{tipo}</span>
    return <span className="badge badge-blue">{tipo}</span>
}

function TransferenciaInternaModal({ onClose }) {
    const qc = useQueryClient()
    const [form, setForm] = useState({
        origen_tipo: 'CAJA',
        destino_tipo: 'BANCO',
        banco_origen_id: '',
        banco_destino_id: '',
        monto: '',
        concepto: '',
    })

    const { data: bancos = [] } = useQuery({
        queryKey: ['bancos'],
        queryFn: () => api.get('/bancos/').then(r => r.data),
        retry: false,
    })

    const registrarTransferencia = useMutation({
        mutationFn: payload => api.post('/bancos/transferencias-internas', payload),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['bancos'] })
            qc.invalidateQueries({ queryKey: ['saldo-caja'] })
            qc.invalidateQueries({ queryKey: ['movimientos-caja'] })
            qc.invalidateQueries({ queryKey: ['reportes-finanzas'] })
            invalidateJornadaLiveData(qc)
            onClose()
        },
    })

    const submit = event => {
        event.preventDefault()
        registrarTransferencia.mutate({
            origen_tipo: form.origen_tipo,
            destino_tipo: form.destino_tipo,
            banco_origen_id: form.origen_tipo === 'BANCO' ? parseInt(form.banco_origen_id, 10) : null,
            banco_destino_id: form.destino_tipo === 'BANCO' ? parseInt(form.banco_destino_id, 10) : null,
            monto: parseFloat(form.monto) || 0,
            concepto: form.concepto || null,
        })
    }

    return (
        <form onSubmit={submit}>
            <div className="grid-2 mb-16">
                <div className="form-group">
                    <label className="form-label">Origen</label>
                    <select
                        className="form-select"
                        value={form.origen_tipo}
                        onChange={event => setForm(prev => ({
                            ...prev,
                            origen_tipo: event.target.value,
                            banco_origen_id: '',
                            destino_tipo: prev.destino_tipo === event.target.value ? (event.target.value === 'CAJA' ? 'BANCO' : 'CAJA') : prev.destino_tipo,
                        }))}
                    >
                        <option value="CAJA">CAJA</option>
                        <option value="BANCO">BANCO</option>
                    </select>
                </div>
                <div className="form-group">
                    <label className="form-label">Destino</label>
                    <select
                        className="form-select"
                        value={form.destino_tipo}
                        onChange={event => setForm(prev => ({
                            ...prev,
                            destino_tipo: event.target.value,
                            banco_destino_id: '',
                        }))}
                    >
                        <option value="BANCO">BANCO</option>
                        <option value="CAJA">CAJA</option>
                    </select>
                </div>
            </div>

            <div className="grid-2 mb-16">
                <div className="form-group">
                    <label className="form-label">Cuenta origen</label>
                    {form.origen_tipo === 'BANCO' ? (
                        <select className="form-select" value={form.banco_origen_id} onChange={event => setForm(prev => ({ ...prev, banco_origen_id: event.target.value }))} required>
                            <option value="">Seleccionar banco origen</option>
                            {bancos.map(banco => <option key={banco.id} value={banco.id}>{banco.nombre_banco}</option>)}
                        </select>
                    ) : (
                        <div className="form-input" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>Caja principal</div>
                    )}
                </div>
                <div className="form-group">
                    <label className="form-label">Cuenta destino</label>
                    {form.destino_tipo === 'BANCO' ? (
                        <select className="form-select" value={form.banco_destino_id} onChange={event => setForm(prev => ({ ...prev, banco_destino_id: event.target.value }))} required>
                            <option value="">Seleccionar banco destino</option>
                            {bancos
                                .filter(banco => form.origen_tipo !== 'BANCO' || String(banco.id) !== String(form.banco_origen_id))
                                .map(banco => <option key={banco.id} value={banco.id}>{banco.nombre_banco}</option>)}
                        </select>
                    ) : (
                        <div className="form-input" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>Caja principal</div>
                    )}
                </div>
            </div>

            <div className="grid-2 mb-16">
                <div className="form-group">
                    <label className="form-label">Monto</label>
                    <input className="form-input" type="number" min="0" step="100" value={form.monto} onChange={event => setForm(prev => ({ ...prev, monto: event.target.value }))} required />
                </div>
                <div className="form-group">
                    <label className="form-label">Concepto</label>
                    <input className="form-input" value={form.concepto} onChange={event => setForm(prev => ({ ...prev, concepto: event.target.value.toUpperCase() }))} placeholder="Opcional" />
                </div>
            </div>

            <div className="card mb-16" style={{ padding: '12px 14px' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', textTransform: 'uppercase', marginBottom: 6 }}>Resumen</div>
                <div style={{ fontWeight: 700 }}>
                    {form.origen_tipo} {form.origen_tipo === 'BANCO' && form.banco_origen_id ? `(${bancos.find(item => item.id === parseInt(form.banco_origen_id, 10))?.nombre_banco || ''})` : ''}
                    {' '}→{' '}
                    {form.destino_tipo} {form.destino_tipo === 'BANCO' && form.banco_destino_id ? `(${bancos.find(item => item.id === parseInt(form.banco_destino_id, 10))?.nombre_banco || ''})` : ''}
                </div>
                <div style={{ color: 'var(--primary-light)', fontWeight: 800, marginTop: 6 }}>Gs. {fmt(form.monto)}</div>
            </div>

            {registrarTransferencia.isError && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#f87171' }}>
                    {registrarTransferencia.error?.response?.data?.detail || 'No se pudo registrar la transferencia interna.'}
                </div>
            )}

            <div className="flex gap-12" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={registrarTransferencia.isPending}>
                    Registrar transferencia
                </button>
            </div>
        </form>
    )
}

function BancoFormModal({ banco, onClose }) {
    const qc = useQueryClient()
    const editando = Boolean(banco?.id)
    const [form, setForm] = useState({
        nombre_banco: banco?.nombre_banco || '',
        numero_cuenta: banco?.numero_cuenta || '',
        titular: banco?.titular || '',
        tipo_cuenta: banco?.tipo_cuenta || '',
        saldo_actual: banco?.saldo_actual ?? 0,
        porcentaje_comision: banco?.porcentaje_comision ?? 3.3,
    })

    const guardarBanco = useMutation({
        mutationFn: payload => (
            editando
                ? api.put(`/bancos/${banco.id}`, payload)
                : api.post('/bancos/', payload)
        ),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['bancos'] })
            onClose()
        },
    })

    const submit = event => {
        event.preventDefault()
        guardarBanco.mutate({
            ...form,
            saldo_actual: parseFloat(form.saldo_actual) || 0,
            porcentaje_comision: parseFloat(form.porcentaje_comision) || 0,
        })
    }

    return (
        <form onSubmit={submit}>
            {[
                ['nombre_banco', 'Nombre del Banco *', 'Ej: Banco Continental'],
                ['numero_cuenta', 'Nro. de Cuenta *', '001-001-000001'],
                ['titular', 'Titular *', 'Nombre del titular'],
            ].map(([key, label, placeholder]) => (
                <div key={key} className="form-group">
                    <label className="form-label">{label}</label>
                    <input
                        className="form-input"
                        value={form[key]}
                        onChange={event => setForm(prev => ({ ...prev, [key]: event.target.value }))}
                        required
                        placeholder={placeholder}
                    />
                </div>
            ))}

            <div className="grid-2">
                <div className="form-group">
                    <label className="form-label">Tipo de Cuenta</label>
                    <select
                        className="form-select"
                        value={form.tipo_cuenta}
                        onChange={event => setForm(prev => ({ ...prev, tipo_cuenta: event.target.value }))}
                    >
                        <option value="">—</option>
                        {['CAJA_DE_AHORRO', 'CUENTA_CORRIENTE', 'TARJETA_CREDITO', 'POS'].map(tipo => (
                            <option key={tipo} value={tipo}>{tipo.replaceAll('_', ' ')}</option>
                        ))}
                    </select>
                </div>
                <div className="form-group">
                    <label className="form-label">Comision (%)</label>
                    <input
                        className="form-input"
                        type="number"
                        step="0.1"
                        value={form.porcentaje_comision}
                        onChange={event => setForm(prev => ({ ...prev, porcentaje_comision: event.target.value }))}
                    />
                </div>
            </div>

            <div className="form-group">
                <label className="form-label">Saldo Inicial (Gs.)</label>
                <input
                    className="form-input"
                    type="number"
                    step="100"
                    value={form.saldo_actual}
                    onChange={event => setForm(prev => ({ ...prev, saldo_actual: event.target.value }))}
                />
            </div>

            {guardarBanco.isError && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#f87171' }}>
                    {guardarBanco.error?.response?.data?.detail || 'No se pudo guardar la cuenta bancaria.'}
                </div>
            )}

            <div className="flex gap-12" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={guardarBanco.isPending}>
                    {editando ? 'Guardar cambios' : 'Guardar Banco'}
                </button>
            </div>
        </form>
    )
}

function BancoMovimientosModal({ banco, onClose }) {
    const [tipoFiltro, setTipoFiltro] = useState('')
    const [buscar, setBuscar] = useState('')

    const { data: movimientos = [], isLoading, isError, error } = useQuery({
        queryKey: ['movimientos-banco', banco.id],
        queryFn: () => api.get(`/bancos/${banco.id}/movimientos?limit=300`).then(r => r.data),
        retry: false,
    })

    const movimientosFiltrados = useMemo(() => {
        const buscarNorm = buscar.trim().toUpperCase()
        return movimientos.filter(item => {
            if (tipoFiltro && item.tipo !== tipoFiltro) return false
            if (!buscarNorm) return true
            return (item.concepto || '').toUpperCase().includes(buscarNorm)
        })
    }, [buscar, movimientos, tipoFiltro])

    const ingresos = movimientosFiltrados.filter(item => item.tipo === 'INGRESO').reduce((sum, item) => sum + (item.monto || 0), 0)
    const egresos = movimientosFiltrados.filter(item => item.tipo === 'EGRESO').reduce((sum, item) => sum + Math.abs(item.monto || 0), 0)

    return (
        <div style={{ display: 'grid', gap: 16 }}>
            <div className="card" style={{ marginBottom: 0, padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
                    <div>
                        <div style={{ fontSize: '1rem', fontWeight: 700 }}>{banco.nombre_banco}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 4 }}>
                            {banco.numero_cuenta} · {banco.titular}
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', textTransform: 'uppercase' }}>Saldo actual</div>
                        <div style={{ fontSize: '1.15rem', fontWeight: 800, color: banco.saldo_actual >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                            Gs. {fmt(banco.saldo_actual)}
                        </div>
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                <div className="card" style={{ marginBottom: 0, padding: '12px 14px' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginBottom: 6, textTransform: 'uppercase' }}>Movimientos</div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800 }}>{movimientosFiltrados.length}</div>
                </div>
                <div className="card" style={{ marginBottom: 0, padding: '12px 14px' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginBottom: 6, textTransform: 'uppercase' }}>Ingresos filtrados</div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--success)' }}>Gs. {fmt(ingresos)}</div>
                </div>
                <div className="card" style={{ marginBottom: 0, padding: '12px 14px' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginBottom: 6, textTransform: 'uppercase' }}>Egresos filtrados</div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--danger)' }}>Gs. {fmt(egresos)}</div>
                </div>
            </div>

            <div className="card" style={{ marginBottom: 0, padding: '14px 16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 12 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Tipo</label>
                        <select className="form-select" value={tipoFiltro} onChange={event => setTipoFiltro(event.target.value)}>
                            <option value="">Todos</option>
                            <option value="INGRESO">INGRESO</option>
                            <option value="EGRESO">EGRESO</option>
                        </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Buscar por concepto</label>
                        <input className="form-input" value={buscar} onChange={event => setBuscar(event.target.value)} placeholder="Ej: pago compra, venta, gasto..." />
                    </div>
                </div>
            </div>

            <div className="card" style={{ padding: 0, marginBottom: 0 }}>
                {isLoading ? (
                    <div className="flex-center" style={{ padding: 60 }}><div className="spinner" style={{ width: 30, height: 30 }} /></div>
                ) : isError ? (
                    <div className="empty-state" style={{ padding: '40px 20px' }}>
                        <CreditCard size={34} />
                        <p>{error?.response?.data?.detail || 'No se pudieron cargar los movimientos bancarios.'}</p>
                    </div>
                ) : movimientosFiltrados.length === 0 ? (
                    <div className="empty-state" style={{ padding: '40px 20px' }}>
                        <CreditCard size={34} />
                        <p>No hay movimientos para mostrar con esos filtros.</p>
                    </div>
                ) : (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Fecha y hora</th>
                                    <th>Tipo</th>
                                    <th>Concepto</th>
                                    <th>Monto</th>
                                    <th>Saldo anterior</th>
                                    <th>Saldo nuevo</th>
                                </tr>
                            </thead>
                            <tbody>
                                {movimientosFiltrados.map(item => (
                                    <tr key={item.id}>
                                        <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{fmtDate(item.fecha)}</td>
                                        <td>{tipoBadge(item.tipo)}</td>
                                        <td style={{ color: 'var(--text-secondary)' }}>{item.concepto || '—'}</td>
                                        <td style={{ fontWeight: 700, color: item.tipo === 'INGRESO' ? 'var(--success)' : 'var(--danger)' }}>
                                            {item.tipo === 'INGRESO' ? '+' : '-'}Gs. {fmt(Math.abs(item.monto))}
                                        </td>
                                        <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.8rem' }}>Gs. {fmt(item.saldo_anterior)}</td>
                                        <td style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.85rem' }}>Gs. {fmt(item.saldo_nuevo)}</td>
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

function TransferenciasInternasPanel() {
    const hoy = useMemo(() => new Date(), [])
    const inicioMes = useMemo(() => new Date(hoy.getFullYear(), hoy.getMonth(), 1), [hoy])
    const formatDateInput = value => {
        const year = value.getFullYear()
        const month = String(value.getMonth() + 1).padStart(2, '0')
        const day = String(value.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
    }

    const [fechaDesde, setFechaDesde] = useState(formatDateInput(inicioMes))
    const [fechaHasta, setFechaHasta] = useState(formatDateInput(hoy))
    const [origenTipo, setOrigenTipo] = useState('')
    const [destinoTipo, setDestinoTipo] = useState('')
    const [buscar, setBuscar] = useState('')
    const [filtrosAplicados, setFiltrosAplicados] = useState({
        fechaDesde: formatDateInput(inicioMes),
        fechaHasta: formatDateInput(hoy),
        origenTipo: '',
        destinoTipo: '',
        buscar: '',
    })

    const query = useQuery({
        queryKey: [
            'transferencias-internas',
            filtrosAplicados.fechaDesde,
            filtrosAplicados.fechaHasta,
            filtrosAplicados.origenTipo,
            filtrosAplicados.destinoTipo,
            filtrosAplicados.buscar,
        ],
        queryFn: async () => {
            const params = new URLSearchParams()
            if (filtrosAplicados.fechaDesde) params.set('fecha_desde', filtrosAplicados.fechaDesde)
            if (filtrosAplicados.fechaHasta) params.set('fecha_hasta', filtrosAplicados.fechaHasta)
            if (filtrosAplicados.origenTipo) params.set('origen_tipo', filtrosAplicados.origenTipo)
            if (filtrosAplicados.destinoTipo) params.set('destino_tipo', filtrosAplicados.destinoTipo)
            if (filtrosAplicados.buscar.trim()) params.set('buscar', filtrosAplicados.buscar.trim())
            const queryString = params.toString()
            const response = await api.get(`/bancos/transferencias-internas/historial${queryString ? `?${queryString}` : ''}`)
            return response.data
        },
        retry: false,
    })

    const transferencias = query.data || []
    const totalTransferido = transferencias.reduce((sum, item) => sum + (item.monto || 0), 0)
    const conciliadas = transferencias.filter(item => item.conciliada).length
    const pendientes = transferencias.length - conciliadas

    const aplicarFiltros = () => {
        setFiltrosAplicados({
            fechaDesde,
            fechaHasta,
            origenTipo,
            destinoTipo,
            buscar,
        })
    }

    return (
        <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
                <div className="card" style={{ marginBottom: 0, padding: '14px 16px' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginBottom: 6, textTransform: 'uppercase' }}>Transferencias</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 800 }}>{transferencias.length}</div>
                </div>
                <div className="card" style={{ marginBottom: 0, padding: '14px 16px' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginBottom: 6, textTransform: 'uppercase' }}>Total movido</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--primary-light)' }}>Gs. {fmt(totalTransferido)}</div>
                </div>
                <div className="card" style={{ marginBottom: 0, padding: '14px 16px' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginBottom: 6, textTransform: 'uppercase' }}>Conciliadas</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--success)' }}>{conciliadas}</div>
                </div>
                <div className="card" style={{ marginBottom: 0, padding: '14px 16px' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginBottom: 6, textTransform: 'uppercase' }}>Para revisar</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: pendientes > 0 ? 'var(--warning)' : 'var(--text-primary)' }}>{pendientes}</div>
                </div>
            </div>

            <div className="card" style={{ marginBottom: 18, padding: '16px 18px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Desde</label>
                        <input className="form-input" type="date" value={fechaDesde} onChange={event => setFechaDesde(event.target.value)} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Hasta</label>
                        <input className="form-input" type="date" value={fechaHasta} onChange={event => setFechaHasta(event.target.value)} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Origen</label>
                        <select className="form-select" value={origenTipo} onChange={event => setOrigenTipo(event.target.value)}>
                            <option value="">Todos</option>
                            <option value="CAJA">CAJA</option>
                            <option value="BANCO">BANCO</option>
                        </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Destino</label>
                        <select className="form-select" value={destinoTipo} onChange={event => setDestinoTipo(event.target.value)}>
                            <option value="">Todos</option>
                            <option value="CAJA">CAJA</option>
                            <option value="BANCO">BANCO</option>
                        </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0, minWidth: 0, gridColumn: 'span 2' }}>
                        <label className="form-label">Buscar</label>
                        <input className="form-input" value={buscar} onChange={event => setBuscar(event.target.value)} placeholder="Transferencia, concepto, origen o destino..." />
                    </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 14 }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                        Periodo actual: {fechaDesde || '—'} a {fechaHasta || '—'}
                    </div>
                    <button type="button" className="btn btn-primary" onClick={aplicarFiltros}>
                        Aplicar filtros
                    </button>
                </div>
            </div>

            <div className="card" style={{ padding: 0, marginBottom: 0 }}>
                {query.isLoading ? (
                    <div className="flex-center" style={{ padding: 60 }}><div className="spinner" style={{ width: 30, height: 30 }} /></div>
                ) : query.isError ? (
                    <div className="empty-state" style={{ padding: '40px 20px' }}>
                        <ArrowDownCircle size={34} />
                        <p>{query.error?.response?.data?.detail || 'No se pudo cargar el historial de transferencias internas.'}</p>
                    </div>
                ) : transferencias.length === 0 ? (
                    <div className="empty-state" style={{ padding: '40px 20px' }}>
                        <ArrowDownCircle size={34} />
                        <p>No hay transferencias internas para los filtros seleccionados.</p>
                    </div>
                ) : (
                    <div className="table-container">
                        <table style={{ minWidth: 980 }}>
                            <thead>
                                <tr>
                                    <th>Fecha</th>
                                    <th>Transferencia</th>
                                    <th>Origen</th>
                                    <th>Destino</th>
                                    <th>Concepto</th>
                                    <th>Monto</th>
                                    <th>Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {transferencias.map(item => (
                                    <tr key={item.transferencia_id}>
                                        <td style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{fmtDate(item.fecha)}</td>
                                        <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{item.transferencia_id}</td>
                                        <td>
                                            <div style={{ fontWeight: 700 }}>{item.origen_label}</div>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{item.origen_tipo}</div>
                                        </td>
                                        <td>
                                            <div style={{ fontWeight: 700 }}>{item.destino_label}</div>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{item.destino_tipo}</div>
                                        </td>
                                        <td style={{ color: 'var(--text-secondary)', lineHeight: 1.35, minWidth: 220 }}>{item.concepto || '—'}</td>
                                        <td style={{ fontWeight: 800, color: 'var(--primary-light)', whiteSpace: 'nowrap' }}>Gs. {fmt(item.monto)}</td>
                                        <td>
                                            {item.conciliada ? (
                                                <span className="badge badge-green">CONCILIADA</span>
                                            ) : (
                                                <span className="badge badge-yellow">REVISAR</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </>
    )
}

function BancoRowActions({ banco, onVerMovimientos, onEditar, onEliminar }) {
    const [open, setOpen] = useState(false)
    const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 })
    const buttonRef = useRef(null)

    const handleAction = callback => {
        setOpen(false)
        window.setTimeout(() => {
            callback()
        }, 0)
    }

    const toggleMenu = () => {
        if (open) {
            setOpen(false)
            return
        }

        const rect = buttonRef.current?.getBoundingClientRect()
        if (!rect) return

        const menuWidth = 210
        const menuHeight = 138
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
            <button ref={buttonRef} type="button" className="btn btn-secondary btn-sm" onClick={toggleMenu}>
                Acciones v
            </button>
            {open && (
                <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={() => setOpen(false)} />
                    <div
                        style={{
                            position: 'fixed',
                            top: menuPosition.top,
                            left: menuPosition.left,
                            minWidth: 210,
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border)',
                            borderRadius: 10,
                            boxShadow: '0 14px 34px rgba(0,0,0,0.45)',
                            padding: '6px 0',
                            zIndex: 100,
                        }}
                    >
                        <button className="dropdown-item" onClick={() => handleAction(() => onVerMovimientos(banco))}>
                            <Eye size={14} style={{ marginRight: 8 }} /> Ver movimientos
                        </button>
                        <button className="dropdown-item" onClick={() => handleAction(() => onEditar(banco))}>
                            <Pencil size={14} style={{ marginRight: 8 }} /> Editar cuenta
                        </button>
                        <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
                        <button className="dropdown-item" style={{ color: 'var(--danger)' }} onClick={() => handleAction(() => onEliminar(banco))}>
                            <Trash2 size={14} style={{ marginRight: 8 }} /> Eliminar cuenta
                        </button>
                    </div>
                </>
            )}
        </div>
    )
}

export default function CajaPage() {
    const qc = useQueryClient()
    const [tab, setTab] = useState('caja')
    const [modalAjuste, setModalAjuste] = useState(false)
    const [modalBanco, setModalBanco] = useState(false)
    const [modalTransferencia, setModalTransferencia] = useState(false)
    const [bancoActivo, setBancoActivo] = useState(null)
    const [bancoForm, setBancoForm] = useState(null)
    const [monto, setMonto] = useState('')
    const [concepto, setConcepto] = useState('')
    const { data: jornadaEstado } = useFinancialJornadaStatus()
    const jornadaAbierta = Boolean(jornadaEstado?.abierta)

    const { data: saldoCaja } = useQuery({ queryKey: ['saldo-caja'], queryFn: () => api.get('/caja/saldo').then(r => r.data), retry: false })
    const { data: movCaja = [] } = useQuery({ queryKey: ['movimientos-caja'], queryFn: () => api.get('/caja/movimientos?limit=50').then(r => r.data), retry: false })
    const { data: bancos = [] } = useQuery({ queryKey: ['bancos'], queryFn: () => api.get('/bancos/').then(r => r.data), retry: false })

    const ajustar = useMutation({
        mutationFn: () => api.post(`/caja/ajuste?monto=${parseFloat(monto)}&concepto=${encodeURIComponent(concepto)}`),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['saldo-caja'] })
            qc.invalidateQueries({ queryKey: ['movimientos-caja'] })
            invalidateJornadaLiveData(qc)
            setModalAjuste(false)
            setMonto('')
            setConcepto('')
        },
    })

    const eliminarBanco = useMutation({
        mutationFn: bancoId => api.delete(`/bancos/${bancoId}`),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['bancos'] })
        },
    })

    const totalBancos = bancos.reduce((s, b) => s + (b.saldo_actual || 0), 0)

    const tabBtn = (key, label, icon) => (
        <button
            onClick={() => setTab(key)}
            style={{
                padding: '10px 20px',
                borderRadius: 8,
                fontWeight: 600,
                fontSize: '0.875rem',
                background: tab === key ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                color: tab === key ? 'white' : 'var(--text-secondary)',
                border: `1px solid ${tab === key ? 'transparent' : 'var(--border)'}`,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                transition: 'all 0.15s',
            }}
        >
            {icon}{label}
        </button>
    )

    return (
        <div className="page-body">
            <FinancialJornadaNotice compact />
            <div className="flex-between mb-24">
                <div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Centro Financiero</h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Caja y bancos en una sola vista, con pestañas internas para cada area</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary" onClick={() => setModalTransferencia(true)} disabled={!jornadaAbierta}>
                        <ArrowUpCircle size={16} /> Transferencia interna
                    </button>
                    {tabBtn('caja', 'Caja', <DollarSign size={16} />)}
                    {tabBtn('bancos', 'Bancos', <CreditCard size={16} />)}
                    {tabBtn('transferencias', 'Transferencias', <ArrowDownCircle size={16} />)}
                </div>
            </div>

            {tab === 'caja' && (
                <>
                    <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
                        <div className="card" style={{ flex: 1, minWidth: 200, background: 'linear-gradient(135deg, rgba(26,86,219,0.15), rgba(124,58,237,0.1))', borderColor: 'rgba(26,86,219,0.3)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 52, height: 52, background: 'var(--primary)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(26,86,219,0.4)' }}>
                                    <DollarSign size={24} color="white" />
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Saldo en Caja</div>
                                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)' }}>Gs. {fmt(saldoCaja?.saldo_actual)}</div>
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                            <button className="btn btn-primary" onClick={() => { setMonto(''); setConcepto(''); setModalAjuste(true) }} disabled={!jornadaAbierta}>
                                <Plus size={16} /> Ajuste de Caja
                            </button>
                        </div>
                    </div>

                    <div className="card" style={{ padding: 0 }}>
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: '0.9rem' }}>
                            Ultimos 50 movimientos
                        </div>
                        {movCaja.length === 0 ? (
                            <div className="empty-state"><DollarSign size={36} /><p>No hay movimientos de caja.</p></div>
                        ) : (
                            <div className="table-container">
                                <table>
                                    <thead><tr><th>Fecha y hora</th><th>Tipo</th><th>Concepto</th><th>Monto</th><th>Saldo anterior</th><th>Saldo nuevo</th></tr></thead>
                                    <tbody>
                                        {movCaja.map(m => (
                                            <tr key={m.id}>
                                                <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{fmtDate(m.fecha)}</td>
                                                <td>{tipoBadge(m.tipo)}</td>
                                                <td style={{ color: 'var(--text-secondary)' }}>{m.concepto || '—'}</td>
                                                <td style={{ fontWeight: 600, color: ['INGRESO', 'VENTA'].includes(m.tipo) ? 'var(--success)' : 'var(--danger)' }}>
                                                    {['INGRESO', 'VENTA'].includes(m.tipo) ? '+' : '-'}Gs. {fmt(Math.abs(m.monto))}
                                                </td>
                                                <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.8rem' }}>Gs. {fmt(m.saldo_anterior)}</td>
                                                <td style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.85rem' }}>Gs. {fmt(m.saldo_nuevo)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}

            {tab === 'bancos' && (
                <>
                    <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
                        <div className="card" style={{ flex: 1, minWidth: 200, background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(6,182,212,0.08))', borderColor: 'rgba(16,185,129,0.3)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 52, height: 52, background: 'var(--success)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <CreditCard size={24} color="white" />
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Total en Bancos</div>
                                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)' }}>Gs. {fmt(totalBancos)}</div>
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                            <button className="btn btn-primary" onClick={() => { setBancoForm(null); setModalBanco(true) }}>
                                <Plus size={16} /> Agregar Banco
                            </button>
                        </div>
                    </div>

                    <div className="card" style={{ padding: 0 }}>
                        {bancos.length === 0 ? (
                            <div className="empty-state"><CreditCard size={36} /><p>No hay cuentas bancarias registradas.</p></div>
                        ) : (
                            <div className="table-container">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Banco</th>
                                            <th>Cuenta</th>
                                            <th>Titular</th>
                                            <th>Tipo</th>
                                            <th>Comision</th>
                                            <th>Saldo</th>
                                            <th style={{ width: 120 }}>Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {bancos.map(banco => (
                                            <tr key={banco.id}>
                                                <td style={{ fontWeight: 600 }}>{banco.nombre_banco}</td>
                                                <td style={{ fontFamily: 'monospace', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{banco.numero_cuenta}</td>
                                                <td style={{ color: 'var(--text-secondary)' }}>{banco.titular}</td>
                                                <td>{banco.tipo_cuenta ? <span className="badge badge-blue">{banco.tipo_cuenta}</span> : '—'}</td>
                                                <td style={{ color: 'var(--text-muted)' }}>{banco.porcentaje_comision}%</td>
                                                <td style={{ fontWeight: 700, color: banco.saldo_actual >= 0 ? 'var(--success)' : 'var(--danger)', fontSize: '1rem' }}>Gs. {fmt(banco.saldo_actual)}</td>
                                                <td>
                                                    <BancoRowActions
                                                        banco={banco}
                                                        onVerMovimientos={selected => setBancoActivo(selected)}
                                                        onEditar={selected => { setBancoForm(selected); setModalBanco(true) }}
                                                        onEliminar={selected => {
                                                            if (confirm(`¿Eliminar la cuenta bancaria ${selected.nombre_banco}?`)) {
                                                                eliminarBanco.mutate(selected.id)
                                                            }
                                                        }}
                                                    />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}

            {tab === 'transferencias' && <TransferenciasInternasPanel />}

            {modalAjuste && (
                <Modal title="Ajuste Manual de Caja" onClose={() => setModalAjuste(false)}>
                    <form onSubmit={event => { event.preventDefault(); ajustar.mutate() }}>
                        <div className="form-group">
                            <label className="form-label">Monto (Gs.) — negativo para egreso</label>
                            <input className="form-input" type="number" step="100" value={monto} onChange={event => setMonto(event.target.value)} required placeholder="Ej: 50000 o -30000" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Concepto *</label>
                            <input className="form-input" value={concepto} onChange={event => setConcepto(event.target.value)} required placeholder="Motivo del ajuste" />
                        </div>
                        <div className="flex gap-12" style={{ justifyContent: 'flex-end' }}>
                            <button type="button" className="btn btn-secondary" onClick={() => setModalAjuste(false)}>Cancelar</button>
                            <button type="submit" className="btn btn-primary" disabled={ajustar.isPending || !jornadaAbierta}>Aplicar Ajuste</button>
                        </div>
                    </form>
                </Modal>
            )}

            {modalBanco && (
                <Modal title={bancoForm?.id ? `Editar Cuenta Bancaria: ${bancoForm.nombre_banco}` : 'Agregar Cuenta Bancaria'} onClose={() => setModalBanco(false)}>
                    <BancoFormModal banco={bancoForm} onClose={() => setModalBanco(false)} />
                </Modal>
            )}

            {modalTransferencia && (
                <Modal title="Transferencia Interna" onClose={() => setModalTransferencia(false)} maxWidth="760px">
                    <TransferenciaInternaModal onClose={() => setModalTransferencia(false)} />
                </Modal>
            )}

            {bancoActivo && (
                <Modal title={`Movimientos Bancarios: ${bancoActivo.nombre_banco}`} onClose={() => setBancoActivo(null)} maxWidth="1100px">
                    <BancoMovimientosModal banco={bancoActivo} onClose={() => setBancoActivo(null)} />
                </Modal>
            )}
        </div>
    )
}

