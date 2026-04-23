"""HESAKA Web - Router: Compras a Proveedores"""
from datetime import datetime
from math import ceil
from uuid import uuid4
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_
from sqlalchemy.orm import selectinload

from app.database import get_session_for_tenant
from app.middleware.tenant import get_tenant_slug
from app.models.models import (
    Banco,
    Compra,
    CompraDetalle,
    CompraVenta,
    ConfiguracionCaja,
    ConfiguracionEmpresa,
    Cliente,
    MovimientoBanco,
    MovimientoCaja,
    PagoCompra,
    Presupuesto,
    PresupuestoItem,
    Producto,
    Proveedor,
    Venta,
)
from app.schemas.schemas import (
    CompraCreate,
    CompraListItemOut,
    CompraListResponseOut,
    CompraOut,
    CuentaPorPagarDocumentoOut,
    CuentaPorPagarProveedorResumenOut,
    HistorialPagoProveedorDetalleOut,
    HistorialPagoProveedorOut,
    PagoCompraCreate,
    PagoCompraOut,
    PagoProveedorCreate,
    PagoProveedorMetodoOut,
    PagoProveedorOut,
    PagoProveedorAplicacionOut,
    VentaPendienteCompraItemOut,
    VentaPendienteCompraOut,
)
from app.utils.auth import get_current_user
from app.utils.excel_historial_pagos_proveedor import generar_excel_historial_pagos_proveedor
from app.utils.filename_utils import sanitize_filename_component
from app.utils.jornada import normalizar_fecha_negocio, require_jornada_abierta
from app.utils.pdf_compra import generar_pdf_compra
from app.utils.pdf_pago_proveedor import generar_pdf_pago_proveedor

router = APIRouter(prefix="/api/compras", tags=["Compras"])


def _query_compra_detallada(session, compra_id: int) -> Optional[Compra]:
    return (
        session.query(Compra)
        .options(
            selectinload(Compra.proveedor_rel),
            selectinload(Compra.items).selectinload(CompraDetalle.producto_rel),
            selectinload(Compra.pagos).selectinload(PagoCompra.banco_rel),
            selectinload(Compra.ventas_asociadas)
            .selectinload(CompraVenta.venta_rel)
            .selectinload(Venta.cliente_rel),
            selectinload(Compra.ventas_asociadas)
            .selectinload(CompraVenta.venta_rel)
            .selectinload(Venta.presupuesto_rel)
            .selectinload(Presupuesto.items)
            .selectinload(PresupuestoItem.producto_rel),
        )
        .filter(Compra.id == compra_id)
        .first()
    )


def _serializar_compra(compra: Compra) -> CompraOut:
    compra_out = CompraOut.model_validate(compra)
    compra_out.proveedor_nombre = compra.proveedor_rel.nombre if compra.proveedor_rel else None
    compra_out.ventas_ids = [rel.venta_id for rel in compra.ventas_asociadas]
    compra_out.ventas_codigos = [rel.venta_rel.codigo for rel in compra.ventas_asociadas if rel.venta_rel]
    compra_out.tipo_documento_original = compra.tipo_documento_original
    compra_out.nro_documento_original = compra.nro_documento_original
    clientes = []
    for rel in compra.ventas_asociadas:
        if rel.venta_rel and rel.venta_rel.cliente_rel:
            clientes.append(rel.venta_rel.cliente_rel.nombre)
    compra_out.clientes_nombres = sorted(set(clientes))
    compra_out.whatsapp_retiro = _construir_contexto_whatsapp_retiro(compra)
    return compra_out


def _serializar_compra_listado(compra: Compra) -> CompraListItemOut:
    clientes, ventas_codigos = _obtener_clientes_y_ventas(compra)
    return CompraListItemOut(
        id=compra.id,
        fecha=compra.fecha,
        proveedor_id=compra.proveedor_id,
        proveedor_nombre=compra.proveedor_rel.nombre if compra.proveedor_rel else None,
        tipo_documento=compra.tipo_documento,
        nro_factura=compra.nro_factura,
        tipo_documento_original=compra.tipo_documento_original,
        nro_documento_original=compra.nro_documento_original,
        total=float(compra.total or 0),
        saldo=float(compra.saldo or 0),
        estado=compra.estado,
        estado_entrega=compra.estado_entrega,
        condicion_pago=compra.condicion_pago,
        tipo_compra=compra.tipo_compra or "ORIGINAL",
        clientes_nombres=clientes,
        ventas_codigos=ventas_codigos,
    )


def _serializar_pago_compra(pago: PagoCompra) -> PagoCompraOut:
    pago_out = PagoCompraOut.model_validate(pago)
    pago_out.banco_nombre = pago.banco_rel.nombre_banco if pago.banco_rel else None
    return pago_out


def _obtener_clientes_y_ventas(compra: Compra) -> tuple[list[str], list[str]]:
    ventas_codigos = []
    clientes = []
    for rel in compra.ventas_asociadas:
        if rel.venta_rel:
            ventas_codigos.append(rel.venta_rel.codigo)
            if rel.venta_rel.cliente_rel:
                clientes.append(rel.venta_rel.cliente_rel.nombre)
    if not ventas_codigos and compra.venta_rel:
        ventas_codigos.append(compra.venta_rel.codigo)
        if compra.venta_rel.cliente_rel:
            clientes.append(compra.venta_rel.cliente_rel.nombre)
    if not clientes and compra.cliente_rel:
        clientes.append(compra.cliente_rel.nombre)
    if compra.items:
        for item in compra.items:
            presupuesto_item = getattr(item, "presupuesto_item_rel", None)
            presupuesto = presupuesto_item.presupuesto_rel if presupuesto_item and presupuesto_item.presupuesto_rel else None
            if presupuesto:
                if presupuesto.cliente_rel:
                    clientes.append(presupuesto.cliente_rel.nombre)
                venta_rel = presupuesto.venta_rel
                if venta_rel:
                    if isinstance(venta_rel, list):
                        for venta in venta_rel:
                            if venta and venta.codigo:
                                ventas_codigos.append(venta.codigo)
                    elif getattr(venta_rel, "codigo", None):
                        ventas_codigos.append(venta_rel.codigo)
    return sorted(set(clientes)), ventas_codigos


def _estado_vencimiento_compra(session, compra: Compra) -> str:
    if (compra.condicion_pago or "CONTADO") != "CREDITO":
        return "CONTADO"
    if not compra.fecha_vencimiento:
        return "SIN_VENCIMIENTO"
    if compra.fecha_vencimiento < normalizar_fecha_negocio(session):
        return "VENCIDO"
    return "AL_DIA"


def _prioridad_cxp(session, compra: Compra) -> tuple[int, datetime, datetime]:
    estado_vencimiento = _estado_vencimiento_compra(session, compra)
    prioridad = {
        "VENCIDO": 0,
        "AL_DIA": 1,
        "CONTADO": 2,
        "SIN_VENCIMIENTO": 3,
    }.get(estado_vencimiento, 4)
    fecha_vencimiento = compra.fecha_vencimiento or datetime.max
    fecha_compra = compra.fecha or datetime.max
    return prioridad, fecha_vencimiento, fecha_compra


def _serializar_documento_cxp(session, compra: Compra) -> CuentaPorPagarDocumentoOut:
    clientes, ventas_codigos = _obtener_clientes_y_ventas(compra)
    return CuentaPorPagarDocumentoOut(
        compra_id=compra.id,
        fecha=compra.fecha,
        proveedor_id=compra.proveedor_id,
        proveedor_nombre=compra.proveedor_rel.nombre if compra.proveedor_rel else "Sin proveedor",
        condicion_pago=compra.condicion_pago,
        tipo_documento=compra.tipo_documento,
        nro_factura=compra.nro_factura,
        tipo_documento_original=compra.tipo_documento_original,
        nro_documento_original=compra.nro_documento_original,
        total=float(compra.total or 0),
        saldo=float(compra.saldo or 0),
        estado=compra.estado,
        fecha_vencimiento=compra.fecha_vencimiento,
        estado_vencimiento=_estado_vencimiento_compra(session, compra),
        tipo_compra=compra.tipo_compra or "ORIGINAL",
        estado_entrega=compra.estado_entrega or "RECIBIDO",
        clientes_nombres=clientes,
        ventas_codigos=ventas_codigos,
    )


def _generar_numero_generico_pago(session, proveedor_id: int) -> str:
    hoy = normalizar_fecha_negocio(session).strftime("%Y%m%d")
    prefijo = f"SG-{proveedor_id}-{hoy}-"
    existentes = (
        session.query(Compra.nro_factura)
        .filter(Compra.nro_factura.like(f"{prefijo}%"))
        .all()
    )
    ultimo = 0
    for (numero,) in existentes:
        if not numero:
            continue
        sufijo = numero.replace(prefijo, "", 1)
        if sufijo.isdigit():
            ultimo = max(ultimo, int(sufijo))
    return f"{prefijo}{ultimo + 1:03d}"


def _normalizar_tipo_compra(tipo_compra: Optional[str]) -> str:
    tipo = (tipo_compra or "ORIGINAL").strip().upper()
    if tipo not in {"ORIGINAL", "GARANTIA", "REEMPLAZO", "STOCK/SERVICIO"}:
        raise HTTPException(status_code=422, detail="tipo_compra invalido")
    return tipo


def _normalizar_estado_entrega(estado_entrega: Optional[str]) -> str:
    estado = (estado_entrega or "RECIBIDO").strip().upper()
    if estado not in {"RECIBIDO", "EN_LABORATORIO", "ENTREGADO", "PENDIENTE_ENVIO"}:
        raise HTTPException(status_code=422, detail="estado_entrega invalido")
    return estado


def _normalizar_metodo_pago(metodo_pago: Optional[str]) -> str:
    metodo = (metodo_pago or "EFECTIVO").strip().upper()
    if metodo not in {"EFECTIVO", "TRANSFERENCIA", "TARJETA", "CHEQUE"}:
        raise HTTPException(status_code=422, detail="metodo_pago invalido")
    return metodo


def _recalcular_estado_compra(session, compra: Compra):
    saldo = float(compra.saldo or 0)
    if saldo <= 0:
        compra.saldo = 0.0
        compra.estado = "PAGADO"
    elif compra.fecha_vencimiento and compra.fecha_vencimiento < normalizar_fecha_negocio(session):
        compra.estado = "VENCIDO"
    else:
        compra.estado = "PENDIENTE"


def _recalcular_costo_producto(session, producto_id: int):
    # El costo maestro del producto se mantiene estable y no debe ser pisado
    # por compras promocionales o transitorias.
    return


def _calcular_estado_entrega_venta(session, venta: Venta) -> Optional[str]:
    if not venta or not venta.presupuesto_rel:
        return venta.estado_entrega if venta else None

    items_bajo_pedido = [
        item for item in venta.presupuesto_rel.items
        if item.producto_rel and getattr(item.producto_rel, "bajo_pedido", False)
    ]
    if not items_bajo_pedido:
        return venta.estado_entrega

    pendientes = []
    for item in items_bajo_pedido:
        cantidad_comprada = session.query(func.sum(CompraDetalle.cantidad)).filter(
            CompraDetalle.presupuesto_item_id == item.id
        ).scalar() or 0
        if cantidad_comprada < item.cantidad:
            pendientes.append(item.id)

    if pendientes:
        return "EN_LABORATORIO"

    compras = (
        session.query(Compra)
        .join(CompraVenta, CompraVenta.compra_id == Compra.id)
        .filter(CompraVenta.venta_id == venta.id)
        .all()
    )
    if not compras:
        return venta.estado_entrega

    estados = {compra.estado_entrega for compra in compras if compra.estado_entrega}
    if estados == {"ENTREGADO"}:
        return "ENTREGADO"
    if "PENDIENTE_ENVIO" in estados:
        return "PENDIENTE_ENVIO"
    if "EN_LABORATORIO" in estados:
        return "EN_LABORATORIO"
    return "RECIBIDO"


def _construir_items_pendientes_venta(session, venta: Venta, proveedor_id: Optional[int]) -> List[VentaPendienteCompraItemOut]:
    if not venta.presupuesto_rel or not venta.presupuesto_rel.items:
        return []

    items_pendientes = []
    for item in venta.presupuesto_rel.items:
        producto = item.producto_rel
        if not producto or not getattr(producto, "bajo_pedido", False):
            continue
        if proveedor_id and producto.proveedor_id and producto.proveedor_id != proveedor_id:
            continue

        cantidad_comprada = session.query(func.sum(CompraDetalle.cantidad)).filter(
            CompraDetalle.presupuesto_item_id == item.id
        ).scalar() or 0
        cantidad_pendiente = item.cantidad - int(cantidad_comprada)
        if cantidad_pendiente <= 0:
            continue

        items_pendientes.append(VentaPendienteCompraItemOut(
            presupuesto_item_id=item.id,
            producto_id=item.producto_id,
            producto_nombre=producto.nombre,
            proveedor_id=producto.proveedor_id,
            proveedor_nombre=producto.proveedor_rel.nombre if producto.proveedor_rel else None,
            cantidad_total=item.cantidad,
            cantidad_comprada=int(cantidad_comprada),
            cantidad_pendiente=cantidad_pendiente,
            costo_sugerido=float(producto.costo or 0.0),
            bajo_pedido=bool(producto.bajo_pedido),
        ))
    return items_pendientes


def _revertir_pago_compra(session, pago: PagoCompra):
    movimientos_banco = session.query(MovimientoBanco).filter(MovimientoBanco.pago_compra_id == pago.id).all()
    for movimiento in movimientos_banco:
        banco = session.query(Banco).filter(Banco.id == movimiento.banco_id).first()
        if banco:
            if movimiento.tipo == "EGRESO":
                banco.saldo_actual += movimiento.monto
            else:
                banco.saldo_actual -= movimiento.monto
        session.delete(movimiento)


def _registrar_movimiento_pago_compra(session, compra: Compra, pago: PagoCompra, monto: float, metodo_pago: str, banco: Optional[Banco], fecha_pago: datetime):
    jornada = require_jornada_abierta(session)
    concepto = f"Pago proveedor {compra.proveedor_rel.nombre if compra.proveedor_rel else 'SIN PROVEEDOR'}"
    if compra.nro_factura:
        concepto += f" - {compra.nro_factura}"
    elif compra.nro_documento_original:
        concepto += f" - {compra.nro_documento_original}"

    if metodo_pago == "EFECTIVO":
        caja = session.query(ConfiguracionCaja).first()
        if not caja:
            caja = ConfiguracionCaja(id=1, saldo_actual=0.0)
            session.add(caja)
            session.flush()

        saldo_anterior = caja.saldo_actual or 0.0
        caja.saldo_actual = saldo_anterior - monto
        session.add(MovimientoCaja(
            fecha=fecha_pago,
            tipo="EGRESO",
            monto=monto,
            concepto=concepto,
            saldo_anterior=saldo_anterior,
            saldo_nuevo=caja.saldo_actual,
            pago_compra_id=pago.id,
            jornada_id=jornada.id,
        ))
        return

    if not banco:
        raise HTTPException(status_code=422, detail="Debes seleccionar un banco para este metodo de pago.")

    saldo_anterior = banco.saldo_actual or 0.0
    banco.saldo_actual = saldo_anterior - monto
    session.add(MovimientoBanco(
        banco_id=banco.id,
        fecha=fecha_pago,
        tipo="EGRESO",
        monto=monto,
        concepto=concepto,
        saldo_anterior=saldo_anterior,
        saldo_nuevo=banco.saldo_actual,
        pago_compra_id=pago.id,
        jornada_id=jornada.id,
    ))


def _anular_pago_compra(session, pago: PagoCompra):
    if pago.estado == "ANULADO":
        return

    require_jornada_abierta(session)
    _revertir_pago_compra(session, pago)
    compra = pago.compra_rel
    if compra:
        compra.saldo = min(float(compra.total or 0), float(compra.saldo or 0) + float(pago.monto or 0))
        _recalcular_estado_compra(session, compra)
    pago.estado = "ANULADO"

    movimientos_caja = session.query(MovimientoCaja).filter(MovimientoCaja.pago_compra_id == pago.id).all()
    caja = session.query(ConfiguracionCaja).first()
    for movimiento in movimientos_caja:
        if caja:
            if movimiento.tipo == "EGRESO":
                caja.saldo_actual += movimiento.monto
            else:
                caja.saldo_actual -= movimiento.monto
        session.delete(movimiento)


def _obtener_pagos_grupo(session, grupo_id: str) -> List[PagoCompra]:
    query = (
        session.query(PagoCompra)
        .options(
            selectinload(PagoCompra.compra_rel).selectinload(Compra.proveedor_rel),
            selectinload(PagoCompra.banco_rel),
            selectinload(PagoCompra.compra_rel).selectinload(Compra.cliente_rel),
            selectinload(PagoCompra.compra_rel).selectinload(Compra.venta_rel).selectinload(Venta.cliente_rel),
            selectinload(PagoCompra.compra_rel)
            .selectinload(Compra.items)
            .selectinload(CompraDetalle.presupuesto_item_rel)
            .selectinload(PresupuestoItem.presupuesto_rel)
            .selectinload(Presupuesto.cliente_rel),
            selectinload(PagoCompra.compra_rel)
            .selectinload(Compra.items)
            .selectinload(CompraDetalle.presupuesto_item_rel)
            .selectinload(PresupuestoItem.presupuesto_rel)
            .selectinload(Presupuesto.venta_rel),
            selectinload(PagoCompra.compra_rel)
            .selectinload(Compra.ventas_asociadas)
            .selectinload(CompraVenta.venta_rel)
            .selectinload(Venta.cliente_rel),
        )
        .filter(PagoCompra.estado == "ACTIVO")
    )
    if grupo_id.startswith("IND-"):
        pago_id = int(grupo_id.replace("IND-", "", 1))
        return query.filter(PagoCompra.id == pago_id).order_by(PagoCompra.id.asc()).all()
    return query.filter(PagoCompra.lote_pago_id == grupo_id).order_by(PagoCompra.id.asc()).all()


def _aplicar_pago_proveedor(session, proveedor_id: int, data: PagoProveedorCreate, lote_pago_id_forzado: Optional[str] = None) -> PagoProveedorOut:
    proveedor = session.query(Compra).options(selectinload(Compra.proveedor_rel)).filter(Compra.proveedor_id == proveedor_id).first()
    if not proveedor or not proveedor.proveedor_rel:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado.")

    compras_candidatas = (
        session.query(Compra)
        .options(selectinload(Compra.proveedor_rel))
        .filter(Compra.proveedor_id == proveedor_id)
        .order_by(Compra.fecha.asc())
        .all()
    )

    if data.compra_ids:
        ids_permitidos = set(data.compra_ids)
        compras_abiertas = [
            compra for compra in compras_candidatas
            if compra.id in ids_permitidos and float(compra.saldo or 0) > 0
        ]
        if not compras_abiertas:
            raise HTTPException(status_code=422, detail="Los documentos de este pago ya no tienen saldo abierto para reaplicar.")
    else:
        compras_abiertas = [compra for compra in compras_candidatas if float(compra.saldo or 0) > 0]
        if not compras_abiertas:
            raise HTTPException(status_code=422, detail="El proveedor no tiene documentos abiertos para aplicar pagos.")

    if data.factura_global:
        if not data.compra_ids:
            raise HTTPException(status_code=422, detail="Debes seleccionar las OS a las que corresponde esta factura.")
        compras_no_os = [
            compra for compra in compras_abiertas
            if (compra.tipo_documento_original or compra.tipo_documento) != "ORDEN_SERVICIO"
        ]
        if compras_no_os:
            raise HTTPException(status_code=422, detail="La factura global solo puede asignarse a documentos cuyo origen sea OS.")

    if not data.metodos_pago:
        raise HTTPException(status_code=422, detail="Debes agregar al menos un medio de pago.")

    total_a_pagar = sum(float(metodo.monto or 0) for metodo in data.metodos_pago)
    if total_a_pagar <= 0:
        raise HTTPException(status_code=422, detail="El total de los medios de pago debe ser mayor a cero.")

    total_abierto = sum(float(compra.saldo or 0) for compra in compras_abiertas)
    if total_a_pagar > total_abierto:
        raise HTTPException(status_code=422, detail="El monto total a pagar no puede superar la deuda abierta del proveedor.")

    compras_ordenadas = sorted(compras_abiertas, key=lambda compra: _prioridad_cxp(session, compra))
    fecha_pago = normalizar_fecha_negocio(session, data.fecha)
    lote_pago_id = lote_pago_id_forzado or (str(uuid4()) if len(data.metodos_pago) > 1 else None)
    aplicaciones = []

    if data.compra_ids:
        factura_a_asignar = None
        tipo_documento_a_asignar = None
        if data.factura_global:
            factura_a_asignar = data.factura_global.strip().upper()
            if not factura_a_asignar:
                raise HTTPException(status_code=422, detail="La factura global no puede estar vacia.")
            tipo_documento_a_asignar = "FACTURA"
        elif data.usar_factura_generica:
            factura_a_asignar = _generar_numero_generico_pago(session, proveedor_id)
            tipo_documento_a_asignar = "SIN_FACTURA"

        if factura_a_asignar:
            for compra in compras_ordenadas:
                if not compra.tipo_documento_original:
                    compra.tipo_documento_original = compra.tipo_documento
                if not compra.nro_documento_original:
                    compra.nro_documento_original = compra.nro_factura
                compra.tipo_documento = tipo_documento_a_asignar
                compra.nro_factura = factura_a_asignar

    for metodo in data.metodos_pago:
        monto_restante = float(metodo.monto or 0)
        if monto_restante <= 0:
            raise HTTPException(status_code=422, detail="Cada medio de pago debe tener un monto mayor a cero.")

        metodo_pago = _normalizar_metodo_pago(metodo.metodo_pago)
        banco = None
        if metodo_pago != "EFECTIVO":
            if not metodo.banco_id:
                raise HTTPException(status_code=422, detail="Debes seleccionar un banco para los pagos no en efectivo.")
            banco = session.query(Banco).filter(Banco.id == metodo.banco_id).first()
            if not banco:
                raise HTTPException(status_code=404, detail="Banco no encontrado.")

        for compra in compras_ordenadas:
            saldo_compra = float(compra.saldo or 0)
            if monto_restante <= 0:
                break
            if saldo_compra <= 0:
                continue

            monto_aplicado = min(saldo_compra, monto_restante)
            pago = PagoCompra(
                compra_id=compra.id,
                fecha=fecha_pago,
                monto=monto_aplicado,
                metodo_pago=metodo_pago,
                banco_id=metodo.banco_id if metodo_pago != "EFECTIVO" else None,
                nro_comprobante=metodo.nro_comprobante,
                nro_factura_asignada=compra.nro_factura,
                lote_pago_id=lote_pago_id,
                estado="ACTIVO",
            )
            session.add(pago)
            session.flush()

            _registrar_movimiento_pago_compra(session, compra, pago, monto_aplicado, metodo_pago, banco, fecha_pago)

            compra.saldo = max(0.0, saldo_compra - monto_aplicado)
            _recalcular_estado_compra(session, compra)

            documento = compra.nro_factura or compra.nro_documento_original or f"COMPRA #{compra.id}"
            aplicaciones.append(PagoProveedorAplicacionOut(
                compra_id=compra.id,
                documento=documento,
                monto_aplicado=monto_aplicado,
                saldo_restante=float(compra.saldo or 0),
            ))
            monto_restante -= monto_aplicado

    return PagoProveedorOut(
        proveedor_id=proveedor_id,
        proveedor_nombre=proveedor.proveedor_rel.nombre,
        total_aplicado=total_a_pagar,
        lote_pago_id=lote_pago_id,
        aplicaciones=aplicaciones,
    )


def _aplicar_items_compra(session, compra: Compra, items_data) -> dict[int, float]:
    costos_reales = {}
    for item_data in items_data:
        item = CompraDetalle(
            compra_id=compra.id,
            descripcion=item_data.descripcion,
            cantidad=item_data.cantidad,
            costo_unitario=item_data.costo_unitario,
            iva=item_data.iva,
            descuento=item_data.descuento,
            subtotal=item_data.subtotal,
            producto_id=item_data.producto_id,
            presupuesto_item_id=item_data.presupuesto_item_id,
        )
        session.add(item)

        if item_data.producto_id:
            producto = session.query(Producto).filter(Producto.id == item_data.producto_id).first()
            if producto:
                producto.stock_actual = (producto.stock_actual or 0) + item_data.cantidad
                costo_real = (item_data.subtotal / item_data.cantidad) if item_data.cantidad > 0 else item_data.costo_unitario
                costos_reales[item_data.producto_id] = costo_real
    return costos_reales


def _actualizar_ventas_y_costos(session, ventas: List[Venta], costos_reales: dict[int, float]):
    for venta in ventas:
        nuevo_estado = _calcular_estado_entrega_venta(session, venta)
        if nuevo_estado:
            venta.estado_entrega = nuevo_estado


def _construir_contexto_whatsapp_retiro(compra: Compra) -> Optional[dict]:
    for rel in compra.ventas_asociadas:
        venta = rel.venta_rel
        cliente = venta.cliente_rel if venta else None
        if not venta or not cliente:
            continue
        return {
            "venta_id": venta.id,
            "venta_codigo": venta.codigo,
            "cliente_id": cliente.id,
            "cliente_nombre": cliente.nombre,
            "cliente_telefono": cliente.telefono,
            "estado_entrega_venta": venta.estado_entrega,
        }
    return None


@router.get("/ventas-pendientes", response_model=List[VentaPendienteCompraOut])
def listar_ventas_pendientes_para_compra(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
    proveedor_id: Optional[int] = Query(None),
    tipo_compra: Optional[str] = Query("ORIGINAL"),
    buscar: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=300),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        tipo_compra = _normalizar_tipo_compra(tipo_compra)
        query = (
            session.query(Venta)
            .options(
                selectinload(Venta.cliente_rel),
                selectinload(Venta.presupuesto_rel)
                .selectinload(Presupuesto.items)
                .selectinload(PresupuestoItem.producto_rel)
                .selectinload(Producto.proveedor_rel),
            )
            .filter(Venta.estado.notin_(["ANULADO", "ANULADA"]))
            .filter(Venta.estado_entrega == "EN_LABORATORIO")
            .order_by(Venta.fecha.desc())
        )

        ventas = query.limit(limit).all()
        resultado = []
        for venta in ventas:
            cliente_nombre = venta.cliente_rel.nombre if venta.cliente_rel else "Sin cliente"
            if buscar:
                texto = f"{venta.codigo} {cliente_nombre}".upper()
                if buscar.strip().upper() not in texto:
                    continue

            items_pendientes = _construir_items_pendientes_venta(session, venta, proveedor_id)
            if tipo_compra == "STOCK/SERVICIO" or not items_pendientes:
                continue

            resultado.append(VentaPendienteCompraOut(
                venta_id=venta.id,
                venta_codigo=venta.codigo,
                cliente_id=venta.cliente_id,
                cliente_nombre=cliente_nombre,
                fecha=venta.fecha,
                estado_entrega=venta.estado_entrega,
                requiere_compra=bool(venta.requiere_compra),
                items_pendientes=items_pendientes,
            ))
        return resultado
    finally:
        session.close()


@router.get("/cuentas-por-pagar/resumen", response_model=List[CuentaPorPagarProveedorResumenOut])
def obtener_resumen_cuentas_por_pagar(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        compras = (
            session.query(Compra)
            .options(selectinload(Compra.proveedor_rel))
            .filter(Compra.saldo > 0)
            .order_by(Compra.fecha.asc())
            .all()
        )

        resumen_map = {}
        for compra in compras:
            proveedor_id = compra.proveedor_id
            if not proveedor_id:
                continue

            resumen = resumen_map.setdefault(proveedor_id, {
                "proveedor_id": proveedor_id,
                "proveedor_nombre": compra.proveedor_rel.nombre if compra.proveedor_rel else "Sin proveedor",
                "cantidad_documentos": 0,
                "vencidas": 0,
                "sin_vencimiento": 0,
                "total_deuda": 0.0,
                "total_vencido": 0.0,
                "total_sin_vencimiento": 0.0,
                "total_os": 0.0,
            })

            saldo = float(compra.saldo or 0)
            resumen["cantidad_documentos"] += 1
            resumen["total_deuda"] += saldo

            estado_vencimiento = _estado_vencimiento_compra(session, compra)
            if estado_vencimiento == "VENCIDO":
                resumen["vencidas"] += 1
                resumen["total_vencido"] += saldo
            elif estado_vencimiento == "SIN_VENCIMIENTO":
                resumen["sin_vencimiento"] += 1
                resumen["total_sin_vencimiento"] += saldo

            if (compra.tipo_documento_original or compra.tipo_documento) == "ORDEN_SERVICIO":
                resumen["total_os"] += saldo

        return [CuentaPorPagarProveedorResumenOut(**item) for item in resumen_map.values()]
    finally:
        session.close()


@router.get("/cuentas-por-pagar/contados-pendientes", response_model=List[CuentaPorPagarDocumentoOut])
def obtener_contados_pendientes(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        compras = (
            session.query(Compra)
            .options(
                selectinload(Compra.proveedor_rel),
                selectinload(Compra.ventas_asociadas)
                .selectinload(CompraVenta.venta_rel)
                .selectinload(Venta.cliente_rel),
            )
            .filter(Compra.saldo > 0)
            .filter(Compra.condicion_pago == "CONTADO")
            .order_by(Compra.fecha.desc())
            .all()
        )
        return [_serializar_documento_cxp(session, compra) for compra in compras]
    finally:
        session.close()


@router.get("/cuentas-por-pagar/proveedor/{proveedor_id}", response_model=List[CuentaPorPagarDocumentoOut])
def obtener_detalle_cuentas_por_pagar_proveedor(
    proveedor_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
    condicion: Optional[str] = Query(None),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        query = (
            session.query(Compra)
            .options(
                selectinload(Compra.proveedor_rel),
                selectinload(Compra.ventas_asociadas)
                .selectinload(CompraVenta.venta_rel)
                .selectinload(Venta.cliente_rel),
            )
            .filter(Compra.proveedor_id == proveedor_id)
            .filter(Compra.saldo > 0)
        )

        condicion_normalizada = (condicion or "").strip().upper()
        if condicion_normalizada in {"CREDITO", "CONTADO"}:
            query = query.filter(Compra.condicion_pago == condicion_normalizada)

        compras = query.order_by(
            Compra.fecha_vencimiento.is_(None),
            Compra.fecha_vencimiento.asc(),
            Compra.fecha.asc(),
        ).all()
        return [_serializar_documento_cxp(session, compra) for compra in compras]
    finally:
        session.close()


@router.post("/cuentas-por-pagar/proveedor/{proveedor_id}/pago-global", response_model=PagoProveedorOut)
def registrar_pago_global_proveedor(
    proveedor_id: int,
    data: PagoProveedorCreate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        resultado = _aplicar_pago_proveedor(session, proveedor_id, data)
        session.commit()
        return resultado
    except HTTPException:
        session.rollback()
        raise
    finally:
        session.close()


@router.get("/cuentas-por-pagar/pagos-historial", response_model=List[HistorialPagoProveedorOut])
def listar_historial_pagos_proveedores(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
    proveedor_id: Optional[int] = Query(None),
    buscar_os: Optional[str] = Query(None),
    buscar_factura: Optional[str] = Query(None),
    buscar_cliente: Optional[str] = Query(None),
    fecha_desde: Optional[datetime] = Query(None),
    fecha_hasta: Optional[datetime] = Query(None),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        return _obtener_historial_pagos_proveedores(
            session,
            proveedor_id=proveedor_id,
            buscar_os=buscar_os,
            buscar_factura=buscar_factura,
            buscar_cliente=buscar_cliente,
            fecha_desde=fecha_desde,
            fecha_hasta=fecha_hasta,
        )
    finally:
        session.close()


@router.get("/cuentas-por-pagar/pagos-historial/excel")
def descargar_historial_pagos_proveedores_excel(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
    proveedor_id: Optional[int] = Query(None),
    buscar_os: Optional[str] = Query(None),
    buscar_factura: Optional[str] = Query(None),
    buscar_cliente: Optional[str] = Query(None),
    fecha_desde: Optional[datetime] = Query(None),
    fecha_hasta: Optional[datetime] = Query(None),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        historial = _obtener_historial_pagos_proveedores(
            session,
            proveedor_id=proveedor_id,
            buscar_os=buscar_os,
            buscar_factura=buscar_factura,
            buscar_cliente=buscar_cliente,
            fecha_desde=fecha_desde,
            fecha_hasta=fecha_hasta,
        )
        config = session.query(ConfiguracionEmpresa).first()
        excel_buffer = generar_excel_historial_pagos_proveedor(historial, config, fecha_desde, fecha_hasta)
        return StreamingResponse(
            excel_buffer,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": 'attachment; filename="historial_pagos_proveedores.xlsx"'},
        )
    finally:
        session.close()


@router.get("/cuentas-por-pagar/pagos-historial/{grupo_id}/pdf")
def descargar_pago_proveedor_pdf(
    grupo_id: str,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        if grupo_id.startswith("IND-"):
            pago_id = int(grupo_id.replace("IND-", "", 1))
            pagos = (
                session.query(PagoCompra)
                .options(
                    selectinload(PagoCompra.compra_rel).selectinload(Compra.proveedor_rel),
                    selectinload(PagoCompra.compra_rel).selectinload(Compra.cliente_rel),
                    selectinload(PagoCompra.compra_rel).selectinload(Compra.venta_rel).selectinload(Venta.cliente_rel),
                    selectinload(PagoCompra.compra_rel)
                    .selectinload(Compra.items)
                    .selectinload(CompraDetalle.presupuesto_item_rel)
                    .selectinload(PresupuestoItem.presupuesto_rel)
                    .selectinload(Presupuesto.cliente_rel),
                    selectinload(PagoCompra.compra_rel)
                    .selectinload(Compra.ventas_asociadas)
                    .selectinload(CompraVenta.venta_rel)
                    .selectinload(Venta.cliente_rel),
                )
                .filter(PagoCompra.id == pago_id, PagoCompra.estado == "ACTIVO")
                .all()
            )
        else:
            pagos = (
                session.query(PagoCompra)
                .options(
                    selectinload(PagoCompra.compra_rel).selectinload(Compra.proveedor_rel),
                    selectinload(PagoCompra.compra_rel).selectinload(Compra.cliente_rel),
                    selectinload(PagoCompra.compra_rel).selectinload(Compra.venta_rel).selectinload(Venta.cliente_rel),
                    selectinload(PagoCompra.compra_rel)
                    .selectinload(Compra.items)
                    .selectinload(CompraDetalle.presupuesto_item_rel)
                    .selectinload(PresupuestoItem.presupuesto_rel)
                    .selectinload(Presupuesto.cliente_rel),
                    selectinload(PagoCompra.compra_rel)
                    .selectinload(Compra.ventas_asociadas)
                    .selectinload(CompraVenta.venta_rel)
                    .selectinload(Venta.cliente_rel),
                )
                .filter(PagoCompra.lote_pago_id == grupo_id, PagoCompra.estado == "ACTIVO")
                .all()
            )

        if not pagos:
            raise HTTPException(status_code=404, detail="Pago no encontrado.")

        grupos = _construir_grupos_historial_pago(session, pagos)
        grupo = grupos.get(grupo_id)
        if not grupo:
            raise HTTPException(status_code=404, detail="No se pudo construir el comprobante del pago.")

        config = session.query(ConfiguracionEmpresa).first()
        pdf_buffer = generar_pdf_pago_proveedor(grupo, config)
        proveedor_slug = sanitize_filename_component(grupo.get("proveedor_nombre"), "proveedor")
        documento_slug = sanitize_filename_component("_".join(sorted(grupo.get("documentos") or []))[:80], "pago")
        filename = f"{proveedor_slug}_{documento_slug}_pago.pdf"
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="{filename}"'}
        )
    finally:
        session.close()


@router.get("/cuentas-por-pagar/pagos-historial/{grupo_id}", response_model=HistorialPagoProveedorDetalleOut)
def obtener_detalle_pago_proveedor(
    grupo_id: str,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        pagos = _obtener_pagos_grupo(session, grupo_id)
        if not pagos:
            raise HTTPException(status_code=404, detail="Pago no encontrado.")

        grupos = _construir_grupos_historial_pago(session, pagos)
        grupo = grupos.get(grupo_id)
        if not grupo:
            raise HTTPException(status_code=404, detail="No se pudo construir el detalle del pago.")

        compra_ids = sorted({pago.compra_id for pago in pagos})
        compras = [pago.compra_rel for pago in pagos if pago.compra_rel]
        puede_usar_factura_global = bool(compras) and all(
            (compra.tipo_documento_original or compra.tipo_documento) == "ORDEN_SERVICIO"
            for compra in compras
        )
        factura_global = next(iter(grupo["facturas"])) if len(grupo["facturas"]) == 1 else None

        return HistorialPagoProveedorDetalleOut(
            grupo_id=grupo["grupo_id"],
            lote_pago_id=grupo["lote_pago_id"],
            fecha=grupo["fecha"],
            proveedor_id=grupo["proveedor_id"],
            proveedor_nombre=grupo["proveedor_nombre"],
            total=grupo["total"],
            compra_ids=compra_ids,
            documentos=sorted(grupo["documentos"]),
            os_origen=sorted(grupo["os_origen"]),
            facturas=sorted(grupo["facturas"]),
            clientes=sorted(grupo["clientes"]),
            puede_usar_factura_global=puede_usar_factura_global,
            factura_global=factura_global,
            metodos_pago=[
                PagoProveedorMetodoOut(
                    metodo_pago=pago.metodo_pago or "EFECTIVO",
                    monto=float(pago.monto or 0),
                    banco_id=pago.banco_id,
                    banco_nombre=pago.banco_rel.nombre_banco if pago.banco_rel else None,
                    nro_comprobante=pago.nro_comprobante,
                )
                for pago in pagos
            ],
        )
    finally:
        session.close()


@router.put("/cuentas-por-pagar/pagos-historial/{grupo_id}", response_model=PagoProveedorOut)
def editar_pago_proveedor(
    grupo_id: str,
    data: PagoProveedorCreate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        pagos = _obtener_pagos_grupo(session, grupo_id)
        if not pagos:
            raise HTTPException(status_code=404, detail="Pago no encontrado.")

        proveedor_id = pagos[0].compra_rel.proveedor_id if pagos[0].compra_rel else None
        if not proveedor_id:
            raise HTTPException(status_code=422, detail="No se pudo determinar el proveedor de este pago.")

        compra_ids_originales = sorted({pago.compra_id for pago in pagos})
        data.compra_ids = compra_ids_originales

        for pago in pagos:
            _anular_pago_compra(session, pago)

        resultado = _aplicar_pago_proveedor(session, proveedor_id, data, lote_pago_id_forzado=None if grupo_id.startswith("IND-") and len(data.metodos_pago) == 1 else (pagos[0].lote_pago_id or str(uuid4())))
        session.commit()
        return resultado
    except HTTPException:
        session.rollback()
        raise
    finally:
        session.close()


def _construir_grupos_historial_pago(session, pagos: List[PagoCompra]):
    grupos = {}
    for pago in pagos:
        grupo_id = pago.lote_pago_id or f"IND-{pago.id}"
        compra = pago.compra_rel
        proveedor_nombre = compra.proveedor_rel.nombre if compra and compra.proveedor_rel else "Sin proveedor"
        documento = None
        os_origen = None
        factura_actual = None
        clientes, _ventas = _obtener_clientes_y_ventas(compra) if compra else ([], [])
        if compra:
            tipo_doc_origen = (compra.tipo_documento_original or "").upper()
            tipo_doc_actual = (compra.tipo_documento or "").upper()
            documento = compra.nro_factura or compra.nro_documento_original or f"COMPRA #{compra.id}"
            if compra.nro_documento_original and (tipo_doc_origen == "ORDEN_SERVICIO" or (not tipo_doc_origen and tipo_doc_actual in {"FACTURA", "SIN_FACTURA"})):
                os_origen = compra.nro_documento_original
            if compra.nro_factura and tipo_doc_actual in {"FACTURA", "SIN_FACTURA"}:
                factura_actual = compra.nro_factura

        grupo = grupos.setdefault(grupo_id, {
            "grupo_id": grupo_id,
            "lote_pago_id": pago.lote_pago_id,
            "fecha": pago.fecha,
            "proveedor_id": compra.proveedor_id if compra else None,
            "proveedor_nombre": proveedor_nombre,
            "total": 0.0,
            "cantidad_documentos": 0,
            "documentos": set(),
            "os_origen": set(),
            "facturas": set(),
            "clientes": set(),
            "metodos": set(),
            "comprobantes": set(),
            "estado": "ACTIVO",
            "detalles": [],
        })
        grupo["total"] += float(pago.monto or 0)
        if documento:
            grupo["documentos"].add(documento)
        if os_origen:
            grupo["os_origen"].add(os_origen)
        if factura_actual:
            grupo["facturas"].add(factura_actual)
        for cliente in clientes:
            grupo["clientes"].add(cliente)
        grupo["metodos"].add(pago.metodo_pago or "EFECTIVO")
        if pago.nro_comprobante:
            grupo["comprobantes"].add(pago.nro_comprobante)
        grupo["cantidad_documentos"] = len(grupo["documentos"])
        grupo["detalles"].append({
            "documento": documento,
            "os_origen": os_origen,
            "factura": factura_actual,
            "cliente": ", ".join(clientes) if clientes else "-",
            "metodo": pago.metodo_pago or "EFECTIVO",
            "comprobante": pago.nro_comprobante or "-",
            "monto": float(pago.monto or 0),
        })
    return grupos


def _obtener_historial_pagos_proveedores(
    session,
    proveedor_id: Optional[int] = None,
    buscar_os: Optional[str] = None,
    buscar_factura: Optional[str] = None,
    buscar_cliente: Optional[str] = None,
    fecha_desde: Optional[datetime] = None,
    fecha_hasta: Optional[datetime] = None,
) -> List[HistorialPagoProveedorOut]:
    if fecha_desde and fecha_desde.hour == 0 and fecha_desde.minute == 0 and fecha_desde.second == 0:
        fecha_desde = fecha_desde.replace(hour=0, minute=0, second=0, microsecond=0)
    if fecha_hasta and fecha_hasta.hour == 0 and fecha_hasta.minute == 0 and fecha_hasta.second == 0:
        fecha_hasta = fecha_hasta.replace(hour=23, minute=59, second=59, microsecond=999999)

    pagos = (
        session.query(PagoCompra)
        .options(
            selectinload(PagoCompra.compra_rel).selectinload(Compra.proveedor_rel),
            selectinload(PagoCompra.banco_rel),
            selectinload(PagoCompra.compra_rel).selectinload(Compra.cliente_rel),
            selectinload(PagoCompra.compra_rel).selectinload(Compra.venta_rel).selectinload(Venta.cliente_rel),
            selectinload(PagoCompra.compra_rel)
            .selectinload(Compra.items)
            .selectinload(CompraDetalle.presupuesto_item_rel)
            .selectinload(PresupuestoItem.presupuesto_rel)
            .selectinload(Presupuesto.cliente_rel),
            selectinload(PagoCompra.compra_rel)
            .selectinload(Compra.items)
            .selectinload(CompraDetalle.presupuesto_item_rel)
            .selectinload(PresupuestoItem.presupuesto_rel)
            .selectinload(Presupuesto.venta_rel),
            selectinload(PagoCompra.compra_rel)
            .selectinload(Compra.ventas_asociadas)
            .selectinload(CompraVenta.venta_rel)
            .selectinload(Venta.cliente_rel),
        )
        .filter(PagoCompra.estado == "ACTIVO")
        .order_by(PagoCompra.fecha.desc(), PagoCompra.id.desc())
        .all()
    )

    buscar_os_norm = buscar_os.strip().upper() if buscar_os else None
    buscar_factura_norm = buscar_factura.strip().upper() if buscar_factura else None
    buscar_cliente_norm = buscar_cliente.strip().upper() if buscar_cliente else None

    pagos_filtrados = []
    for pago in pagos:
        compra = pago.compra_rel
        if proveedor_id and (not compra or compra.proveedor_id != proveedor_id):
            continue
        if fecha_desde and pago.fecha and pago.fecha < fecha_desde:
            continue
        if fecha_hasta and pago.fecha and pago.fecha > fecha_hasta:
            continue

        clientes, _ventas = _obtener_clientes_y_ventas(compra) if compra else ([], [])
        tipo_doc_origen = (compra.tipo_documento_original or "").upper() if compra else ""
        tipo_doc_actual = (compra.tipo_documento or "").upper() if compra else ""
        os_origen = compra.nro_documento_original if compra and compra.nro_documento_original and (tipo_doc_origen == "ORDEN_SERVICIO" or (not tipo_doc_origen and tipo_doc_actual in {"FACTURA", "SIN_FACTURA"})) else ""
        factura_actual = compra.nro_factura if compra and compra.nro_factura and tipo_doc_actual in {"FACTURA", "SIN_FACTURA"} else ""

        if buscar_os_norm and buscar_os_norm not in os_origen.upper():
            continue
        if buscar_factura_norm and buscar_factura_norm not in factura_actual.upper():
            continue
        if buscar_cliente_norm and buscar_cliente_norm not in " ".join(clientes).upper():
            continue
        pagos_filtrados.append(pago)

    grupos = _construir_grupos_historial_pago(session, pagos_filtrados)
    historial = []
    for grupo in grupos.values():
        historial.append(HistorialPagoProveedorOut(
            grupo_id=grupo["grupo_id"],
            lote_pago_id=grupo["lote_pago_id"],
            fecha=grupo["fecha"],
            proveedor_id=grupo["proveedor_id"],
            proveedor_nombre=grupo["proveedor_nombre"],
            total=grupo["total"],
            cantidad_documentos=grupo["cantidad_documentos"],
            documentos=sorted(grupo["documentos"]),
            os_origen=sorted(grupo["os_origen"]),
            facturas=sorted(grupo["facturas"]),
            clientes=sorted(grupo["clientes"]),
            metodos=sorted(grupo["metodos"]),
            comprobantes=sorted(grupo["comprobantes"]),
            estado=grupo["estado"],
        ))
    historial.sort(key=lambda item: item.fecha, reverse=True)
    return historial


@router.post("/cuentas-por-pagar/pagos-historial/{grupo_id}/revertir")
def revertir_pago_proveedor(
    grupo_id: str,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        if grupo_id.startswith("IND-"):
            pago_id = int(grupo_id.replace("IND-", "", 1))
            pagos = (
                session.query(PagoCompra)
                .options(selectinload(PagoCompra.compra_rel))
                .filter(PagoCompra.id == pago_id, PagoCompra.estado == "ACTIVO")
                .all()
            )
        else:
            pagos = (
                session.query(PagoCompra)
                .options(selectinload(PagoCompra.compra_rel))
                .filter(PagoCompra.lote_pago_id == grupo_id, PagoCompra.estado == "ACTIVO")
                .all()
            )

        if not pagos:
            raise HTTPException(status_code=404, detail="No se encontraron pagos activos para revertir.")

        for pago in pagos:
            _anular_pago_compra(session, pago)

        session.commit()
        return {"ok": True, "revertidos": len(pagos)}
    except HTTPException:
        session.rollback()
        raise
    finally:
        session.close()


@router.get("/", response_model=List[CompraOut])
def listar_compras(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
    estado: Optional[str] = Query(None),
    proveedor_id: Optional[int] = Query(None),
    skip: int = 0,
    limit: int = 50,
):
    session = get_session_for_tenant(tenant_slug)
    try:
        query = (
            session.query(Compra)
            .options(
                selectinload(Compra.proveedor_rel),
                selectinload(Compra.items).selectinload(CompraDetalle.producto_rel),
                selectinload(Compra.pagos),
                selectinload(Compra.ventas_asociadas)
                .selectinload(CompraVenta.venta_rel)
                .selectinload(Venta.cliente_rel),
            )
        )
        if estado:
            query = query.filter(Compra.estado == estado)
        if proveedor_id:
            query = query.filter(Compra.proveedor_id == proveedor_id)

        compras = query.order_by(Compra.fecha.desc()).offset(skip).limit(limit).all()
        return [_serializar_compra(compra) for compra in compras]
    finally:
        session.close()


@router.get("/listado-optimizado", response_model=CompraListResponseOut)
def listar_compras_optimizado(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
    estado: Optional[str] = Query(None),
    proveedor_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        query = (
            session.query(Compra)
            .options(
                selectinload(Compra.proveedor_rel),
                selectinload(Compra.items).selectinload(CompraDetalle.presupuesto_item_rel),
                selectinload(Compra.items)
                .selectinload(CompraDetalle.presupuesto_item_rel)
                .selectinload(PresupuestoItem.presupuesto_rel)
                .selectinload(Presupuesto.cliente_rel),
                selectinload(Compra.items)
                .selectinload(CompraDetalle.presupuesto_item_rel)
                .selectinload(PresupuestoItem.presupuesto_rel)
                .selectinload(Presupuesto.venta_rel),
                selectinload(Compra.ventas_asociadas)
                .selectinload(CompraVenta.venta_rel)
                .selectinload(Venta.cliente_rel),
                selectinload(Compra.venta_rel).selectinload(Venta.cliente_rel),
                selectinload(Compra.cliente_rel),
            )
        )

        if estado:
            query = query.filter(Compra.estado == estado)
        if proveedor_id:
            query = query.filter(Compra.proveedor_id == proveedor_id)
        if search and search.strip():
            term = f"%{search.strip()}%"
            query = query.filter(
                or_(
                    Compra.nro_factura.ilike(term),
                    Compra.nro_documento_original.ilike(term),
                    Compra.proveedor_rel.has(Proveedor.nombre.ilike(term)),
                    Compra.ventas_asociadas.any(
                        CompraVenta.venta_rel.has(Venta.codigo.ilike(term))
                    ),
                    Compra.ventas_asociadas.any(
                        CompraVenta.venta_rel.has(
                            Venta.cliente_rel.has(Cliente.nombre.ilike(term))
                        )
                    ),
                    Compra.venta_rel.has(Venta.codigo.ilike(term)),
                    Compra.venta_rel.has(Venta.cliente_rel.has(Cliente.nombre.ilike(term))),
                    Compra.cliente_rel.has(Cliente.nombre.ilike(term)),
                )
            )

        total = query.count()
        total_pages = ceil(total / page_size) if total else 1
        offset = (page - 1) * page_size
        compras = (
            query
            .order_by(Compra.fecha.desc(), Compra.id.desc())
            .offset(offset)
            .limit(page_size)
            .all()
        )

        return CompraListResponseOut(
            items=[_serializar_compra_listado(compra) for compra in compras],
            page=page,
            page_size=page_size,
            total=total,
            total_pages=total_pages,
        )
    finally:
        session.close()


@router.get("/{compra_id}", response_model=CompraOut)
def obtener_compra(
    compra_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        compra = _query_compra_detallada(session, compra_id)
        if not compra:
            raise HTTPException(status_code=404, detail="Compra no encontrada.")
        return _serializar_compra(compra)
    finally:
        session.close()


@router.post("/", response_model=CompraOut)
def crear_compra(
    data: CompraCreate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        estado_entrega = _normalizar_estado_entrega(data.estado_entrega)
        tipo_compra = _normalizar_tipo_compra(data.tipo_compra)
        if data.ventas_ids and not data.proveedor_id:
            raise HTTPException(status_code=422, detail="Debes seleccionar un proveedor para compras asociadas a ventas.")

        compra = Compra(
            proveedor_id=data.proveedor_id,
            tipo_documento=data.tipo_documento,
            nro_factura=data.nro_factura,
            tipo_documento_original=data.tipo_documento,
            nro_documento_original=data.nro_factura,
            total=data.total,
            saldo=data.total,
            observaciones=data.observaciones,
            estado_entrega=estado_entrega,
            tipo_compra=tipo_compra,
            condicion_pago=data.condicion_pago,
            fecha_vencimiento=data.fecha_vencimiento if data.condicion_pago == "CREDITO" else None,
        )
        session.add(compra)
        session.flush()

        costos_reales = _aplicar_items_compra(session, compra, data.items)
        ventas_asociadas = []
        if data.ventas_ids:
            ventas_asociadas = session.query(Venta).filter(Venta.id.in_(data.ventas_ids)).all()
            if len(ventas_asociadas) != len(set(data.ventas_ids)):
                raise HTTPException(status_code=404, detail="Una de las ventas asociadas no fue encontrada.")
            for venta in ventas_asociadas:
                session.add(CompraVenta(compra_id=compra.id, venta_id=venta.id))

        session.flush()
        _actualizar_ventas_y_costos(session, ventas_asociadas, costos_reales)
        _recalcular_estado_compra(session, compra)

        session.commit()
        compra = _query_compra_detallada(session, compra.id)
        return _serializar_compra(compra)
    except HTTPException:
        session.rollback()
        raise
    finally:
        session.close()


@router.put("/{compra_id}", response_model=CompraOut)
def editar_compra(
    compra_id: int,
    data: CompraCreate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        compra = _query_compra_detallada(session, compra_id)
        if not compra:
            raise HTTPException(status_code=404, detail="Compra no encontrada.")

        estado_entrega = _normalizar_estado_entrega(data.estado_entrega)
        tipo_compra = _normalizar_tipo_compra(data.tipo_compra)
        if data.ventas_ids and not data.proveedor_id:
            raise HTTPException(status_code=422, detail="Debes seleccionar un proveedor para compras asociadas a ventas.")

        pagos_total = sum(float(pago.monto or 0) for pago in compra.pagos if pago.estado != "ANULADO")
        if float(data.total or 0) < pagos_total:
            raise HTTPException(status_code=422, detail="El total no puede ser menor al monto ya pagado.")

        ventas_previas = [rel.venta_rel for rel in compra.ventas_asociadas if rel.venta_rel]
        productos_afectados = {item.producto_id for item in compra.items if item.producto_id}

        for item in list(compra.items):
            if item.producto_id:
                producto = session.query(Producto).filter(Producto.id == item.producto_id).first()
                if producto:
                    producto.stock_actual = (producto.stock_actual or 0) - item.cantidad
            session.delete(item)

        for relacion in list(compra.ventas_asociadas):
            session.delete(relacion)

        session.flush()

        compra.proveedor_id = data.proveedor_id
        compra.tipo_documento = data.tipo_documento
        compra.nro_factura = data.nro_factura
        compra.tipo_documento_original = data.tipo_documento
        compra.nro_documento_original = data.nro_factura
        compra.total = data.total
        compra.observaciones = data.observaciones
        compra.estado_entrega = estado_entrega
        compra.tipo_compra = tipo_compra
        compra.condicion_pago = data.condicion_pago
        compra.fecha_vencimiento = data.fecha_vencimiento if data.condicion_pago == "CREDITO" else None

        costos_reales = _aplicar_items_compra(session, compra, data.items)
        productos_afectados.update(item_data.producto_id for item_data in data.items if item_data.producto_id)

        ventas_nuevas = []
        if data.ventas_ids:
            ventas_nuevas = session.query(Venta).filter(Venta.id.in_(data.ventas_ids)).all()
            if len(ventas_nuevas) != len(set(data.ventas_ids)):
                raise HTTPException(status_code=404, detail="Una de las ventas asociadas no fue encontrada.")
            for venta in ventas_nuevas:
                session.add(CompraVenta(compra_id=compra.id, venta_id=venta.id))

        session.flush()

        for producto_id in productos_afectados:
            if producto_id not in costos_reales:
                _recalcular_costo_producto(session, producto_id)

        ventas_a_actualizar = {venta.id: venta for venta in ventas_previas if venta}
        ventas_a_actualizar.update({venta.id: venta for venta in ventas_nuevas if venta})
        _actualizar_ventas_y_costos(session, list(ventas_a_actualizar.values()), costos_reales)

        compra.saldo = max(0.0, float(compra.total or 0) - pagos_total)
        _recalcular_estado_compra(session, compra)

        session.commit()
        compra = _query_compra_detallada(session, compra.id)
        return _serializar_compra(compra)
    except HTTPException:
        session.rollback()
        raise
    finally:
        session.close()


@router.delete("/{compra_id}")
def eliminar_compra(
    compra_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        compra = _query_compra_detallada(session, compra_id)
        if not compra:
            raise HTTPException(status_code=404, detail="Compra no encontrada.")

        ventas_afectadas = [rel.venta_rel for rel in compra.ventas_asociadas if rel.venta_rel]
        productos_afectados = {item.producto_id for item in compra.items if item.producto_id}

        for pago in list(compra.pagos):
            _revertir_pago_compra(session, pago)
            session.delete(pago)

        for item in list(compra.items):
            if item.producto_id:
                producto = session.query(Producto).filter(Producto.id == item.producto_id).first()
                if producto:
                    producto.stock_actual = (producto.stock_actual or 0) - item.cantidad

        session.delete(compra)
        session.flush()

        for producto_id in productos_afectados:
            _recalcular_costo_producto(session, producto_id)

        for venta in ventas_afectadas:
            nuevo_estado = _calcular_estado_entrega_venta(session, venta)
            if nuevo_estado:
                venta.estado_entrega = nuevo_estado

        session.commit()
        return {"ok": True, "mensaje": "Compra eliminada y movimientos revertidos."}
    except HTTPException:
        session.rollback()
        raise
    finally:
        session.close()


@router.get("/{compra_id}/pagos", response_model=List[PagoCompraOut])
def listar_pagos_compra(
    compra_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        compra = _query_compra_detallada(session, compra_id)
        if not compra:
            raise HTTPException(status_code=404, detail="Compra no encontrada.")
        pagos = sorted(compra.pagos, key=lambda pago: pago.fecha, reverse=True)
        return [_serializar_pago_compra(pago) for pago in pagos if pago.estado != "ANULADO"]
    finally:
        session.close()


@router.post("/{compra_id}/pagos", response_model=PagoCompraOut)
def registrar_pago_compra(
    compra_id: int,
    data: PagoCompraCreate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        compra = _query_compra_detallada(session, compra_id)
        if not compra:
            raise HTTPException(status_code=404, detail="Compra no encontrada.")

        monto = float(data.monto or 0)
        if monto <= 0:
            raise HTTPException(status_code=422, detail="El monto del pago debe ser mayor a cero.")
        if monto > float(compra.saldo or 0):
            raise HTTPException(status_code=422, detail="El monto del pago no puede superar el saldo pendiente.")

        metodo_pago = _normalizar_metodo_pago(data.metodo_pago)
        banco = None
        if metodo_pago != "EFECTIVO":
            if not data.banco_id:
                raise HTTPException(status_code=422, detail="Debes seleccionar un banco para este metodo de pago.")
            banco = session.query(Banco).filter(Banco.id == data.banco_id).first()
            if not banco:
                raise HTTPException(status_code=404, detail="Banco no encontrado.")

        fecha_pago = normalizar_fecha_negocio(session, data.fecha)
        jornada = require_jornada_abierta(session)
        pago = PagoCompra(
            compra_id=compra_id,
            fecha=fecha_pago,
            monto=monto,
            metodo_pago=metodo_pago,
            banco_id=data.banco_id if metodo_pago != "EFECTIVO" else None,
            nro_comprobante=data.nro_comprobante,
            nro_factura_asignada=compra.nro_factura,
            estado="ACTIVO",
        )
        session.add(pago)
        session.flush()

        concepto = f"Pago compra #{compra.id}"
        if compra.proveedor_rel:
            concepto += f" - {compra.proveedor_rel.nombre}"

        if metodo_pago == "EFECTIVO":
            caja = session.query(ConfiguracionCaja).first()
            if not caja:
                caja = ConfiguracionCaja(id=1, saldo_actual=0.0)
                session.add(caja)
                session.flush()

            saldo_anterior = caja.saldo_actual or 0.0
            caja.saldo_actual = saldo_anterior - monto
            session.add(MovimientoCaja(
                fecha=fecha_pago,
                tipo="EGRESO",
                monto=monto,
                concepto=concepto,
                saldo_anterior=saldo_anterior,
                saldo_nuevo=caja.saldo_actual,
                pago_compra_id=pago.id,
                jornada_id=jornada.id,
            ))
        else:
            saldo_anterior = banco.saldo_actual or 0.0
            banco.saldo_actual = saldo_anterior - monto
            session.add(MovimientoBanco(
                banco_id=banco.id,
                fecha=fecha_pago,
                tipo="EGRESO",
                monto=monto,
                concepto=concepto,
                saldo_anterior=saldo_anterior,
                saldo_nuevo=banco.saldo_actual,
                pago_compra_id=pago.id,
                jornada_id=jornada.id,
            ))

        compra.saldo = max(0.0, float(compra.saldo or 0) - monto)
        _recalcular_estado_compra(session, compra)

        session.commit()
        session.refresh(pago)
        return _serializar_pago_compra(pago)
    except HTTPException:
        session.rollback()
        raise
    finally:
        session.close()


@router.delete("/{compra_id}/pagos/{pago_id}")
def eliminar_pago_compra(
    compra_id: int,
    pago_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        pago = (
            session.query(PagoCompra)
            .options(selectinload(PagoCompra.compra_rel))
            .filter(PagoCompra.id == pago_id, PagoCompra.compra_id == compra_id)
            .first()
        )
        if not pago:
            raise HTTPException(status_code=404, detail="Pago no encontrado.")

        compra = pago.compra_rel
        if not compra:
            raise HTTPException(status_code=404, detail="Compra no encontrada.")

        _revertir_pago_compra(session, pago)
        compra.saldo = min(float(compra.total or 0), float(compra.saldo or 0) + float(pago.monto or 0))
        _recalcular_estado_compra(session, compra)

        session.delete(pago)
        session.commit()
        return {"ok": True, "saldo_restante": compra.saldo}
    except HTTPException:
        session.rollback()
        raise
    finally:
        session.close()


@router.patch("/{compra_id}/estado-entrega")
def cambiar_estado_entrega(
    compra_id: int,
    estado_entrega: str,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        compra = _query_compra_detallada(session, compra_id)
        if not compra:
            raise HTTPException(status_code=404, detail="Compra no encontrada.")

        compra.estado_entrega = _normalizar_estado_entrega(estado_entrega)
        ventas = [rel.venta_rel for rel in compra.ventas_asociadas if rel.venta_rel]
        _actualizar_ventas_y_costos(session, ventas, {})
        session.commit()
        return {
            "ok": True,
            "estado_entrega": compra.estado_entrega,
            "whatsapp_retiro": _construir_contexto_whatsapp_retiro(compra),
        }
    finally:
        session.close()


@router.get("/{compra_id}/pdf")
def descargar_compra_pdf(
    compra_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        compra = _query_compra_detallada(session, compra_id)
        if not compra:
            raise HTTPException(status_code=404, detail="Compra no encontrada.")

        config = session.query(ConfiguracionEmpresa).first()
        pdf_buffer = generar_pdf_compra(compra, config)
        proveedor_slug = sanitize_filename_component(compra.proveedor_rel.nombre if compra.proveedor_rel else None, "proveedor")
        documento_slug = sanitize_filename_component(compra.nro_factura or compra.nro_documento_original or f"compra_{compra.id}", "compra")
        filename = f"{proveedor_slug}_{documento_slug}_compra.pdf"
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="{filename}"'}
        )
    finally:
        session.close()
