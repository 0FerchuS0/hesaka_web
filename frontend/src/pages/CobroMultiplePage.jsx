import { useState, useEffect } from 'react'
import { api } from '../context/AuthContext'
import { formatCurrency, formatDate, todayBusinessInputValue } from '../utils/formatters'
import { CheckCircle, AlertCircle, Save, Loader2, ArrowRight } from 'lucide-react'
import Modal from '../components/Modal'

const todayInputValue = () => todayBusinessInputValue()

export default function CobroMultiplePage() {
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [ventas, setVentas] = useState([])
    const [bancos, setBancos] = useState([])
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')
    const [isModalOpen, setIsModalOpen] = useState(false)

    const [form, setForm] = useState({
        metodo_pago: 'EFECTIVO',
        banco_id: '',
        nota: '',
        fecha: todayInputValue()
    })

    // id -> { selected: boolean, monto: number }
    const [seleccion, setSeleccion] = useState({})

    useEffect(() => {
        cargarDatos()
    }, [])

    const cargarDatos = async () => {
        setLoading(true)
        try {
            const [resVentas, resBancos] = await Promise.all([
                api.get('/ventas/pendientes-cobro'),
                api.get('/bancos/')
            ])
            setVentas(resVentas.data)
            setBancos(resBancos.data)

            // Inicializar selección
            const initialSeleccion = {}
            resVentas.data.forEach(v => {
                initialSeleccion[v.id] = { selected: false, monto: v.saldo }
            })
            setSeleccion(initialSeleccion)
        } catch (err) {
            console.error(err)
            setError('Error al cargar datos')
        } finally {
            setLoading(false)
        }
    }

    const toggleSeleccion = (id) => {
        setSeleccion(prev => ({
            ...prev,
            [id]: { ...prev[id], selected: !prev[id].selected }
        }))
    }

    const handleMontoChange = (id, value) => {
        setSeleccion(prev => ({
            ...prev,
            [id]: { ...prev[id], monto: parseFloat(value) || 0 }
        }))
    }

    const totalSeleccionado = Object.keys(seleccion)
        .filter(id => seleccion[id].selected)
        .reduce((sum, id) => sum + seleccion[id].monto, 0)

    const handleSubmit = async (e) => {
        e.preventDefault()
        const items = Object.keys(seleccion)
            .filter(id => seleccion[id].selected)
            .map(id => ({
                venta_id: parseInt(id),
                monto: seleccion[id].monto
            }))

        if (items.length === 0) {
            setError('Debe seleccionar al menos una venta')
            return
        }

        if (form.metodo_pago !== 'EFECTIVO' && !form.banco_id) {
            setError('Debe seleccionar un banco')
            return
        }

        setSubmitting(true)
        setError('')
        setSuccess('')

        try {
            await api.post('/ventas/cobro-multiple', {
                items,
                metodo_pago: form.metodo_pago,
                banco_id: form.banco_id ? parseInt(form.banco_id) : null,
                nota: form.nota,
                fecha: form.fecha
            })
            setSuccess('Cobro múltiple registrado con éxito')
            setIsModalOpen(false)
            cargarDatos()
            setForm({ ...form, nota: '', banco_id: '' })
        } catch (err) {
            console.error(err)
            setError(err.response?.data?.detail || 'Error al procesar el cobro')
        } finally {
            setSubmitting(false)
        }
    }

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <Loader2 className="animate-spin text-primary" size={48} />
            </div>
        )
    }

    return (
        <div className="page-body">
            <div className="flex-between mb-24">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, background: 'rgba(59,130,246,0.15)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <CheckCircle size={20} style={{ color: 'var(--primary)' }} />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Cobro Múltiple</h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Seleccione ventas para cobrar en lote.</p>
                    </div>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={() => setIsModalOpen(true)}
                    disabled={totalSeleccionado === 0}
                >
                    Continuar al Pago
                    <ArrowRight size={16} />
                </button>
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-4 rounded-lg flex items-center gap-3">
                    <AlertCircle size={20} />
                    {error}
                </div>
            )}

            {success && (
                <div className="bg-green-500/10 border border-green-500/50 text-green-500 p-4 rounded-lg flex items-center gap-3 mb-6">
                    <CheckCircle size={20} />
                    {success}
                </div>
            )}

            <div className="glass-card p-4 overflow-hidden shadow-md">
                <h2 className="text-xl font-semibold text-white mb-4">Ventas Pendientes</h2>
                <div className="overflow-x-auto max-h-[600px] custom-scrollbar">
                    <table className="w-full text-left">
                        <thead className="sticky top-0 bg-bg-card z-10">
                            <tr className="border-b border-border text-text-secondary text-sm">
                                <th className="p-4 w-12 text-center">Sel.</th>
                                <th className="p-4">Código / Fecha</th>
                                <th className="p-4">Cliente</th>
                                <th className="p-4 text-right">Saldo</th>
                                <th className="p-4 text-right w-40">A Cobrar</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {ventas.map(v => (
                                <tr
                                    key={v.id}
                                    className={`hover:bg-primary/5 transition-colors ${seleccion[v.id]?.selected ? 'bg-primary/10 border-l-4 border-l-primary' : 'border-l-4 border-l-transparent'}`}
                                >
                                    <td className="p-4 text-center">
                                        <div className="flex items-center justify-center">
                                            <input
                                                type="checkbox"
                                                className="w-5 h-5 rounded border-gray-600 text-primary focus:ring-primary focus:ring-opacity-25 bg-gray-800 cursor-pointer"
                                                checked={seleccion[v.id]?.selected || false}
                                                onChange={() => toggleSeleccion(v.id)}
                                            />
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <div className="font-semibold text-white tracking-wide">{v.codigo}</div>
                                        <div className="text-xs text-text-muted mt-1">{formatDate(v.fecha)}</div>
                                    </td>
                                    <td className="p-4">
                                        <div className="text-text-secondary font-medium">{v.cliente_nombre || 'N/A'}</div>
                                    </td>
                                    <td className="p-4 text-right whitespace-nowrap text-white font-medium">
                                        {formatCurrency(v.saldo)}
                                    </td>
                                    <td className="p-4 text-right">
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">Gs.</span>
                                            <input
                                                type="number"
                                                step="0.01"
                                                disabled={!seleccion[v.id]?.selected}
                                                className={`form-input text-right w-full pl-10 font-medium ${!seleccion[v.id]?.selected ? 'opacity-50 cursor-not-allowed' : 'ring-1 ring-primary/30'}`}
                                                value={seleccion[v.id]?.monto || 0}
                                                onChange={(e) => handleMontoChange(v.id, e.target.value)}
                                            />
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {ventas.length === 0 && (
                        <div className="text-center py-12 text-text-secondary flex flex-col items-center gap-3">
                            <CheckCircle size={48} className="text-green-500/50" />
                            <p className="text-lg">No hay ventas pendientes de cobro.</p>
                            <p className="text-sm text-text-muted">Todas las ventas están pagadas o no hay registros.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal de Pago */}
            {isModalOpen && (
                <Modal title="Detalles del Cobro Múltiple" onClose={() => setIsModalOpen(false)} maxWidth="500px">
                    <form onSubmit={handleSubmit} className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="bg-primary/10 border border-primary/20 p-4 rounded-xl flex items-center justify-between">
                            <span className="text-text-secondary font-medium">Total Seleccionado</span>
                            <span className="text-3xl font-bold text-primary">{formatCurrency(totalSeleccionado)}</span>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-1.5">Método de Pago</label>
                            <select
                                className="form-select w-full bg-bg-darker border-border/50 focus:border-primary/50 text-white rounded-lg px-4 py-2.5"
                                value={form.metodo_pago}
                                onChange={(e) => setForm({ ...form, metodo_pago: e.target.value })}
                            >
                                <option value="EFECTIVO">💵 EFECTIVO</option>
                                <option value="TARJETA">💳 TARJETA</option>
                                <option value="TRANSFERENCIA">🏦 TRANSFERENCIA</option>
                            </select>
                        </div>

                        {form.metodo_pago !== 'EFECTIVO' && (
                            <div className="animate-in fade-in zoom-in-95 duration-200">
                                <label className="block text-sm font-medium text-text-secondary mb-1.5">Banco de Destino</label>
                                <select
                                    className="form-select w-full bg-bg-darker border-border/50 focus:border-primary/50 text-white rounded-lg px-4 py-2.5"
                                    value={form.banco_id}
                                    onChange={(e) => setForm({ ...form, banco_id: e.target.value })}
                                    required
                                >
                                    <option value="">Seleccione banco...</option>
                                    {bancos.map(b => (
                                        <option key={b.id} value={b.id}>{b.nombre_banco} (Saldo: {formatCurrency(b.saldo_actual)})</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-1.5">Fecha de Cobro</label>
                            <input
                                type="date"
                                className="form-input w-full bg-bg-darker border-border/50 focus:border-primary/50 text-white rounded-lg px-4 py-2.5"
                                value={form.fecha}
                                onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-1.5">Nota / Observación (Opcional)</label>
                            <textarea
                                className="form-input w-full h-24 bg-bg-darker border-border/50 focus:border-primary/50 text-white rounded-lg px-4 py-3 resize-none"
                                placeholder="Añadir una nota a este cobro masivo..."
                                value={form.nota}
                                onChange={(e) => setForm({ ...form, nota: e.target.value })}
                            />
                        </div>

                        <div className="flex gap-12" style={{ justifyContent: 'flex-end', marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setIsModalOpen(false)}
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={submitting}
                                className="btn btn-primary"
                            >
                                {submitting ? <span className="spinner" style={{ width: 16, height: 16 }} /> : <><Save size={15} /> Confirmar y Registrar</>}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    )
}
