import { useQuery } from '@tanstack/react-query'

import { api } from '../context/AuthContext'
import { parseBackendDateTime } from '../utils/formatters'

const fmt = value => new Intl.NumberFormat('es-PY').format(value ?? 0)
const fmtDate = value => {
    const date = parseBackendDateTime(value)
    return date ? date.toLocaleDateString('es-PY') : '-'
}
const fmtDateTime = value => {
    const date = parseBackendDateTime(value)
    return date ? date.toLocaleString('es-PY') : '-'
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

export default function DetalleCompraContent({ compraId, onClose }) {
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
