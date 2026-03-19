import { useState, useEffect } from 'react'
import { api } from '../context/AuthContext'
import { formatCurrency, formatDate } from '../utils/formatters'
import { Trash2, AlertCircle, Loader2, Info, Download } from 'lucide-react'

export default function HistorialCobrosMultiplesPage() {
    const [loading, setLoading] = useState(true)
    const [historial, setHistorial] = useState([])
    const [error, setError] = useState('')

    useEffect(() => {
        cargarHistorial()
    }, [])

    const cargarHistorial = async () => {
        setLoading(true)
        try {
            const res = await api.get('/ventas/historial-cobros-multiples')
            setHistorial(res.data)
        } catch (err) {
            console.error(err)
            setError('Error al cargar el historial de cobros')
        } finally {
            setLoading(false)
        }
    }

    const anularCobro = async (grupo_id) => {
        if (!window.confirm('¿Está seguro de anular este cobro múltiple? Esto restaurará el saldo pendiente de todas las ventas asociadas.')) {
            return
        }

        try {
            await api.delete(`/ventas/grupos-pago/${grupo_id}`)
            cargarHistorial()
        } catch (err) {
            console.error(err)
            alert('Error al anular el cobro: ' + (err.response?.data?.detail || err.message))
        }
    }

    const descargarRecibo = async (grupo_id, tipo = 'resumido') => {
        try {
            const token = localStorage.getItem('hesaka_token')
            const response = await fetch(`${api.defaults.baseURL}/ventas/grupos-pago/${grupo_id}/pdf?tipo=${tipo}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })
            if (!response.ok) throw new Error('Error al generar el recibo')

            const blob = await response.blob()
            const url = window.URL.createObjectURL(blob)
            window.open(url, '_blank')
        } catch (err) {
            console.error(err)
            alert('Error al descargar el recibo: ' + err.message)
        }
    }

    // Componente interno para el dropdown simple
    const ActionDropdown = ({ item }) => {
        const [open, setOpen] = useState(false);
        return (
            <div className="relative inline-block text-left" onMouseLeave={() => setOpen(false)}>
                <button
                    onClick={() => setOpen(!open)}
                    className="btn btn-primary btn-sm btn-icon"
                    title="Opciones de Descarga"
                    style={{ padding: '0.4rem', borderRadius: '8px' }}
                >
                    <Download size={16} />
                </button>
                {open && (
                    <div className="origin-top-right absolute right-0 mt-2 w-48 rounded-xl shadow-lg bg-bg-card border border-border p-2 z-50 flex flex-col gap-2">
                        <button
                            onClick={() => { setOpen(false); descargarRecibo(item.grupo_id, 'resumido'); }}
                            className="btn btn-secondary w-full justify-start text-sm"
                        >
                            <Download size={14} className="mr-2" />
                            Resumido
                        </button>
                        <button
                            onClick={() => { setOpen(false); descargarRecibo(item.grupo_id, 'detallado'); }}
                            className="btn btn-primary w-full justify-start text-sm"
                        >
                            <Download size={14} className="mr-2" />
                            Detallado
                        </button>
                    </div>
                )}
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <Loader2 className="animate-spin text-primary" size={48} />
            </div>
        )
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <header>
                <h1 className="text-3xl font-bold text-white">Historial de Cobros Múltiples</h1>
                <p className="text-text-secondary">Registro de operaciones de cobro masivo realizadas en el sistema.</p>
            </header>

            {error && (
                <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-4 rounded-lg flex items-center gap-3">
                    <AlertCircle size={20} />
                    {error}
                </div>
            )}

            <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-border bg-bg-card/50">
                                <th className="p-4">Fecha</th>
                                <th className="p-4">Método</th>
                                <th className="p-4">Clientes</th>
                                <th className="p-4 text-center">Cant. Ventas</th>
                                <th className="p-4 text-right">Monto Total</th>
                                <th className="p-4 text-center w-20">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {historial.map(item => (
                                <tr key={item.grupo_id} className="hover:bg-white/5 transition-colors">
                                    <td className="p-4">
                                        <div className="text-white font-medium">{formatDate(item.fecha)}</div>
                                        <div className="text-xs text-text-secondary">{new Date(item.fecha).toLocaleTimeString()}</div>
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${item.metodo === 'EFECTIVO' ? 'bg-green-500/10 text-green-500' : 'bg-blue-500/10 text-blue-500'
                                            }`}>
                                            {item.metodo}
                                        </span>
                                        {item.nota && (
                                            <div className="text-xs text-text-secondary mt-1 flex items-center gap-1 group relative">
                                                <Info size={12} />
                                                <span className="truncate max-w-[150px]">{item.nota}</span>
                                            </div>
                                        )}
                                    </td>
                                    <td className="p-4">
                                        <div className="text-sm text-white">{item.clientes_str}</div>
                                    </td>
                                    <td className="p-4 text-center text-text-secondary">
                                        {item.cant_pagos}
                                    </td>
                                    <td className="p-4 text-right font-bold text-primary">
                                        {formatCurrency(item.total)}
                                    </td>
                                    <td className="p-4 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            <ActionDropdown item={item} />
                                            <button
                                                onClick={() => anularCobro(item.grupo_id)}
                                                className="btn btn-danger btn-sm btn-icon"
                                                title="Anular Cobro Múltiple"
                                                style={{ padding: '0.4rem', borderRadius: '8px' }}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {historial.length === 0 && (
                        <div className="text-center p-12 text-text-secondary">
                            No se han encontrado registros de cobros múltiples.
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
