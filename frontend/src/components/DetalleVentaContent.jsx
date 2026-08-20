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
        CREDITO: 'badge-yellow',
        EN_LABORATORIO: 'badge-yellow',
        RECIBIDO: 'badge-blue',
        ENTREGADO: 'badge-green',
        PENDIENTE_ENVIO: 'badge-red',
        ANULADO: 'badge-gray',
        ANULADA: 'badge-gray',
    }
    return <span className={`badge ${map[estado] || 'badge-gray'}`}>{estado}</span>
}

function GraduacionMiniBox({ venta }) {
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
        border: '1px solid var(--border)',
        textAlign: 'center',
        fontWeight: 600,
        minHeight: 38,
        fontSize: '0.84rem',
    }

    const hasGrad = venta.graduacion_od_esfera || venta.graduacion_oi_esfera || venta.doctor_receta

    if (!hasGrad) return null

    return (
        <div className="card" style={{ marginBottom: 0 }}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>Receta / Graduacion</div>
            <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'grid', gap: 8 }}>
                    <div style={{ ...rowStyle, color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        <div></div>
                        <div style={{ textAlign: 'center' }}>Esfera</div>
                        <div style={{ textAlign: 'center' }}>Cilindro</div>
                        <div style={{ textAlign: 'center' }}>Eje</div>
                        <div style={{ textAlign: 'center' }}>Adicion</div>
                    </div>
                    <div style={rowStyle}>
                        <div style={{ fontWeight: 700, fontSize: '0.84rem' }}>OD</div>
                        <div style={cellStyle}>{venta.graduacion_od_esfera || '-'}</div>
                        <div style={cellStyle}>{venta.graduacion_od_cilindro || '-'}</div>
                        <div style={cellStyle}>{venta.graduacion_od_eje || '-'}</div>
                        <div style={cellStyle}>{venta.graduacion_od_adicion || '-'}</div>
                    </div>
                    <div style={rowStyle}>
                        <div style={{ fontWeight: 700, fontSize: '0.84rem' }}>OI</div>
                        <div style={cellStyle}>{venta.graduacion_oi_esfera || '-'}</div>
                        <div style={cellStyle}>{venta.graduacion_oi_cilindro || '-'}</div>
                        <div style={cellStyle}>{venta.graduacion_oi_eje || '-'}</div>
                        <div style={cellStyle}>{venta.graduacion_oi_adicion || '-'}</div>
                    </div>
                </div>
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', fontSize: '0.84rem', marginTop: 4 }}>
                    {venta.fecha_receta && (
                        <div>
                            <span style={{ color: 'var(--text-muted)' }}>Fecha receta: </span>
                            <strong>{fmtDate(venta.fecha_receta)}</strong>
                        </div>
                    )}
                    {venta.doctor_receta && (
                        <div>
                            <span style={{ color: 'var(--text-muted)' }}>Doctor/a: </span>
                            <strong>{venta.doctor_receta}</strong>
                        </div>
                    )}
                    {venta.fecha_proximo_control && (
                        <div>
                            <span style={{ color: 'var(--text-muted)' }}>Proximo control: </span>
                            <strong>{fmtDate(venta.fecha_proximo_control)}</strong>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default function DetalleVentaContent({ ventaId, onClose }) {
    const { data: venta, isLoading } = useQuery({
        queryKey: ['venta-detalle', ventaId],
        queryFn: () => api.get(`/ventas/${ventaId}`).then(response => response.data),
        retry: false,
    })

    if (isLoading || !venta) return <div className="flex-center" style={{ padding: 50 }}><div className="spinner" style={{ width: 26, height: 26 }} /></div>

    return (
        <div style={{ display: 'grid', gap: 18 }}>
            <div className="grid-2">
                <div className="card" style={{ marginBottom: 0 }}>
                    <div style={{ fontWeight: 700, marginBottom: 10 }}>Resumen</div>
                    <div style={{ display: 'grid', gap: 6, fontSize: '0.86rem' }}>
                        <div>Cliente: <strong>{venta.cliente_nombre || 'Sin cliente'}</strong></div>
                        <div>Codigo: <strong>{venta.codigo}</strong></div>
                        {venta.numero_factura && <div>Factura: <strong style={{ color: 'var(--success)' }}>{venta.numero_factura}</strong></div>}
                        {venta.facturado_a_nombre && venta.facturado_a_nombre !== venta.cliente_nombre && (
                            <div>Facturado a: <strong>{venta.facturado_a_nombre}{venta.facturado_a_documento ? ` (${venta.facturado_a_tipo_documento || 'CI'} ${venta.facturado_a_documento})` : ''}</strong></div>
                        )}
                        {venta.vendedor_nombre && <div>Vendedor: <strong>{venta.vendedor_nombre}</strong></div>}
                        {venta.canal_venta_nombre && <div>Canal de venta: <strong>{venta.canal_venta_nombre}</strong></div>}
                        <div>Condicion: {estadoBadge(venta.es_credito ? 'CREDITO' : 'CONTADO')}</div>
                        <div>Estado: {estadoBadge(venta.estado)}</div>
                        {venta.estado_entrega && <div>Entrega: {estadoBadge(venta.estado_entrega)}</div>}
                    </div>
                </div>
                <div className="card" style={{ marginBottom: 0 }}>
                    <div style={{ fontWeight: 700, marginBottom: 10 }}>Totales</div>
                    <div style={{ display: 'grid', gap: 8 }}>
                        <div style={{ fontSize: '1rem', fontWeight: 700 }}>Total: Gs. {fmt(venta.total)}</div>
                        <div style={{ color: venta.saldo > 0 ? 'var(--warning)' : 'var(--success)', fontWeight: 700 }}>Saldo: Gs. {fmt(venta.saldo)}</div>
                        {venta.saldo === 0 && (
                            <div style={{ color: 'var(--success)', fontSize: '0.78rem' }}>Comprobante final disponible (pago completo).</div>
                        )}
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Fecha: {fmtDateTime(venta.fecha)}</div>

                        {venta.monto_gravado_10 !== undefined && (
                            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4, display: 'grid', gap: 4, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Gravado 10%:</span>
                                    <span>Gs. {fmt(venta.monto_gravado_10)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>IVA 10%:</span>
                                    <span>Gs. {fmt(venta.iva_10)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Gravado 5%:</span>
                                    <span>Gs. {fmt(venta.monto_gravado_5)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>IVA 5%:</span>
                                    <span>Gs. {fmt(venta.iva_5)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Exento:</span>
                                    <span>Gs. {fmt(venta.monto_exento)}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <GraduacionMiniBox venta={venta} />

            <div className="card" style={{ padding: 0, marginBottom: 0 }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>Items Vendidos</div>
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Descripcion</th>
                                <th>Cant.</th>
                                <th>Precio Unit.</th>
                                <th>IVA</th>
                                <th>Desc.</th>
                                <th>Subtotal</th>
                            </tr>
                        </thead>
                        <tbody>
                            {venta.items.map(item => (
                                <tr key={item.id}>
                                    <td>{item.producto_nombre || item.descripcion_personalizada || 'Producto'}</td>
                                    <td>{item.cantidad}</td>
                                    <td>Gs. {fmt(item.precio_unitario)}</td>
                                    <td>{item.iva}%</td>
                                    <td>Gs. {fmt(item.descuento)}</td>
                                    <td style={{ fontWeight: 700 }}>Gs. {fmt(item.subtotal)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="card" style={{ padding: 0, marginBottom: 0 }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>Historial de Cobros</div>
                {venta.pagos.length === 0 ? <div style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: '0.84rem' }}>No hay cobros registrados.</div> : (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Fecha</th>
                                    <th>Metodo</th>
                                    <th>Banco</th>
                                    <th>Comprobante</th>
                                    <th>Monto</th>
                                </tr>
                            </thead>
                            <tbody>
                                {venta.pagos.map(pago => (
                                    <tr key={pago.id}>
                                        <td>{fmtDateTime(pago.fecha)}</td>
                                        <td>{pago.metodo_pago}</td>
                                        <td>{pago.banco_nombre || '-'}</td>
                                        <td>{pago.nro_comprobante || '-'}</td>
                                        <td style={{ fontWeight: 700, color: 'var(--success)' }}>Gs. {fmt(pago.monto)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {venta.observaciones && (
                <div className="card" style={{ marginBottom: 0 }}>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>Observaciones</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', whiteSpace: 'normal', lineHeight: 1.35 }}>{venta.observaciones}</div>
                </div>
            )}
            <div className="flex gap-12" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn btn-secondary" onClick={onClose}>Cerrar</button></div>
        </div>
    )
}
