"""HESAKA Web — Router: Ventas & Presupuestos
Lógica financiera completa replicando el sistema de escritorio original.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from typing import List, Optional
from datetime import datetime
from math import ceil
from sqlalchemy import or_
from app.database import get_session_for_tenant
from app.models.models import (
    Venta, Presupuesto, PresupuestoItem, Pago,
    Cliente, ConfiguracionCaja, MovimientoCaja, MovimientoBanco,
    Banco, Comision, Referidor, Producto, CompraDetalle, AjusteVenta,
    Vendedor, CanalVenta, ConfiguracionEmpresa
)
from app.utils.auth import get_current_user, require_action
from app.utils.configuracion_general import obtener_canal_principal
from app.middleware.tenant import get_tenant_slug
from app.schemas.schemas import (
    VentaOut, VentaCreate, PresupuestoOut, PresupuestoCreate,
    PagoCreate, PagoOut, PagoMultipleCreate, PagoMultipleItem, GrupoPagoOut,
    VentaListItemOut, VentaListResponseOut,
    PresupuestoListItemOut, PresupuestoListResponseOut,
    VentasPdfMultipleRequest, AjusteVentaCreate, AjusteVentaUpdate,
    AjusteVentaOut, AjusteVentaListResponseOut, PresupuestoAsignacionComercialIn
)
from fastapi.responses import StreamingResponse
from app.utils.pdf_recibos_venta import (
    generar_recibo_pago_individual,
    generar_recibo_venta_consolidado,
    generar_recibos_ventas_concatenado,
)
from app.utils.pdf_presupuestos import generar_pdf_presupuesto

router = APIRouter(prefix="/api/ventas", tags=["Ventas"])
pre_router = APIRouter(prefix="/api/presupuestos", tags=["Presupuestos"])


def _obtener_canal_venta_default(session):
    return obtener_canal_principal(session)


def _get_siguiente_codigo(session, modelo, prefijo: str) -> str:
    """Genera el siguiente código correlativo (PRE0001, VEN0001, etc.)."""
    from sqlalchemy import func
    count = session.query(func.count(modelo.id)).scalar() or 0
    return f"{prefijo}{str(count + 1).zfill(4)}"


# ─── Helpers financieros ───────────────────────────────────────────────────────

def _registrar_en_caja(session, monto: float, concepto: str, pago_venta_id: Optional[int] = None, grupo_pago_id: Optional[str] = None):
    """Registra un ingreso de efectivo en caja, actualizando el saldo."""
    caja = session.query(ConfiguracionCaja).first()
    if not caja:
        caja = ConfiguracionCaja(id=1, saldo_actual=0.0)
        session.add(caja)
        session.flush()
    saldo_ant = caja.saldo_actual
    caja.saldo_actual += monto
    mov = MovimientoCaja(
        tipo="INGRESO",
        monto=monto,
        concepto=concepto,
        saldo_anterior=saldo_ant,
        saldo_nuevo=caja.saldo_actual,
        pago_venta_id=pago_venta_id,
    )
    session.add(mov)
    return mov


def _registrar_en_banco(session, banco_id: int, monto: float, concepto: str,
                        tipo: str = "INGRESO", pago_venta_id: Optional[int] = None, grupo_pago_id: Optional[str] = None):
    """Registra un movimiento bancario (ingreso o egreso), actualizando el saldo del banco."""
    banco = session.query(Banco).filter(Banco.id == banco_id).first()
    if not banco:
        raise HTTPException(status_code=404, detail=f"Banco ID {banco_id} no encontrado.")
    saldo_ant = banco.saldo_actual
    if tipo == "INGRESO":
        banco.saldo_actual += monto
    else:
        banco.saldo_actual -= monto
    mov = MovimientoBanco(
        banco_id=banco_id,
        tipo=tipo,
        monto=monto,
        concepto=concepto,
        saldo_anterior=saldo_ant,
        saldo_nuevo=banco.saldo_actual,
        pago_venta_id=pago_venta_id,
        grupo_pago_id=grupo_pago_id,
    )
    session.add(mov)
    session.flush()
    return mov


def _registrar_comision_tarjeta(session, banco_id: int, monto_pago: float,
                                 codigo_venta: str, pago_id: int):
    """Crea un GastoOperativo automático por comisión de tarjeta y lo descuenta del banco."""
    from app.models.models import GastoOperativo, CategoriaGasto, ConfiguracionEmpresa
    config = session.query(ConfiguracionEmpresa).first()
    if not config or not config.porcentaje_comision_tarjeta:
        return
    pct = config.porcentaje_comision_tarjeta
    monto_comision = round(monto_pago * pct / 100, 2)
    if monto_comision <= 0:
        return

    cat = session.query(CategoriaGasto).filter(
        CategoriaGasto.nombre.ilike("%comision%bancaria%")
    ).first()
    if not cat:
        return  # Si no existe la categoría, se omite

    # 1. Gasto operativo
    gasto = GastoOperativo(
        fecha=datetime.now(),
        categoria_id=cat.id,
        monto=monto_comision,
        concepto=f"Comisión tarjeta {pct}% - Venta {codigo_venta}",
        metodo_pago="TARJETA",
        banco_id=banco_id,
    )
    session.add(gasto)
    session.flush()

    # 2. Egreso en banco vinculado al pago
    mov = _registrar_en_banco(
        session, banco_id, monto_comision,
        concepto=f"Comisión tarjeta {pct}% - Venta {codigo_venta}",
        tipo="EGRESO",
        pago_venta_id=pago_id,
    )
    gasto.movimiento_banco_id = mov.id


def _procesar_pago(session, pago: Pago, venta_codigo: str):
    """Aplica los efectos financieros de un pago (caja / banco / comisión tarjeta)."""
    if pago.metodo_pago == "EFECTIVO":
        concepto = f"Pago venta {venta_codigo}"
        if pago.nota:
            concepto += f" ({pago.nota})"
        _registrar_en_caja(session, pago.monto, concepto, pago_venta_id=pago.id)

    elif pago.metodo_pago in ("TRANSFERENCIA", "TARJETA"):
        if not pago.banco_id:
            raise HTTPException(status_code=422, detail="banco_id requerido para transferencia/tarjeta.")
        concepto = f"Cobro venta {venta_codigo} - {pago.metodo_pago}"
        if pago.nota:
            concepto += f" ({pago.nota})"
        _registrar_en_banco(session, pago.banco_id, pago.monto, concepto, pago_venta_id=pago.id)

        if pago.metodo_pago == "TARJETA":
            _registrar_comision_tarjeta(session, pago.banco_id, pago.monto, venta_codigo, pago.id)


def _revertir_pago(session, pago: Pago, venta_codigo: str):
    """Deshace todos los movimientos financieros asociados a un pago."""
    from app.models.models import GastoOperativo

    # Revertir movimientos banco vinculados a este pago
    movs_banco = session.query(MovimientoBanco).filter(
        MovimientoBanco.pago_venta_id == pago.id
    ).all()
    for mov in movs_banco:
        banco = session.query(Banco).filter(Banco.id == mov.banco_id).first()
        if banco:
            if mov.tipo == "INGRESO":
                banco.saldo_actual -= mov.monto
            else:
                banco.saldo_actual += mov.monto
        # Eliminar gasto automático de comisión vinculado
        gasto = session.query(GastoOperativo).filter(
            GastoOperativo.movimiento_banco_id == mov.id
        ).first()
        if gasto:
            session.delete(gasto)
        session.delete(mov)

    # Revertir movimientos caja vinculados a este pago
    movs_caja = session.query(MovimientoCaja).filter(
        MovimientoCaja.pago_venta_id == pago.id
    ).all()
    caja = session.query(ConfiguracionCaja).first()
    for mov in movs_caja:
        if caja:
            if mov.tipo == "INGRESO":
                caja.saldo_actual -= mov.monto
            else:
                caja.saldo_actual += mov.monto
        session.delete(mov)


def _actualizar_estado_venta_por_saldo(venta: Venta):
    if (venta.saldo or 0) <= 0 and (venta.total or 0) > 0:
        venta.estado = "PAGADO"
        venta.saldo = 0.0
    elif (venta.total or 0) <= 0:
        venta.estado = "PAGADO"
        venta.saldo = 0.0
    else:
        venta.estado = "PENDIENTE"


def _serializar_ajuste(ajuste: AjusteVenta) -> AjusteVentaOut:
    venta = ajuste.venta_rel
    cliente = venta.cliente_rel if venta else None
    return AjusteVentaOut(
        id=ajuste.id,
        venta_id=ajuste.venta_id,
        venta_codigo=venta.codigo if venta else "N/A",
        fecha=ajuste.fecha,
        cliente_id=venta.cliente_id if venta else None,
        cliente_nombre=cliente.nombre if cliente else "Cliente Desconocido",
        tipo=ajuste.tipo or "AJUSTE",
        monto=float(ajuste.monto or 0.0),
        motivo=ajuste.motivo or "",
        usuario=ajuste.usuario or "Sistema",
    )


# ─── Presupuestos ──────────────────────────────────────────────────────────────

def _build_presupuesto_out(p):
    """Construye PresupuestoOut con todos los campos calculados: cliente_nombre, referidor_nombre, producto_nombre por ítem."""
    items = []
    for item in getattr(p, "items", []) or []:
        producto_rel = getattr(item, "producto_rel", None)
        descripcion_personalizada = getattr(item, "descripcion_personalizada", None)
        producto_nombre = None
        if producto_rel and getattr(producto_rel, "nombre", None):
            producto_nombre = producto_rel.nombre
        elif descripcion_personalizada:
            producto_nombre = descripcion_personalizada

        items.append({
            "id": getattr(item, "id", 0) or 0,
            "producto_id": getattr(item, "producto_id", 0) or 0,
            "producto_nombre": producto_nombre,
            "cantidad": getattr(item, "cantidad", 0) or 0,
            "precio_unitario": float(getattr(item, "precio_unitario", 0.0) or 0.0),
            "costo_unitario": float(getattr(item, "costo_unitario", 0.0) or 0.0),
            "descuento": float(getattr(item, "descuento", 0.0) or 0.0),
            "subtotal": float(getattr(item, "subtotal", 0.0) or 0.0),
            "descripcion_personalizada": descripcion_personalizada,
            "codigo_armazon": getattr(item, "codigo_armazon", None),
            "medidas_armazon": getattr(item, "medidas_armazon", None),
        })

    return PresupuestoOut(
        id=getattr(p, "id", 0) or 0,
        codigo=getattr(p, "codigo", "") or "",
        fecha=getattr(p, "fecha", datetime.now()) or datetime.now(),
        estado=getattr(p, "estado", "BORRADOR") or "BORRADOR",
        cliente_id=getattr(p, "cliente_id", 0) or 0,
        cliente_nombre=p.cliente_rel.nombre if getattr(p, "cliente_rel", None) else None,
        total=float(getattr(p, "total", 0.0) or 0.0),
        graduacion_od_esfera=getattr(p, "graduacion_od_esfera", None),
        graduacion_od_cilindro=getattr(p, "graduacion_od_cilindro", None),
        graduacion_od_eje=getattr(p, "graduacion_od_eje", None),
        graduacion_od_adicion=getattr(p, "graduacion_od_adicion", None),
        graduacion_oi_esfera=getattr(p, "graduacion_oi_esfera", None),
        graduacion_oi_cilindro=getattr(p, "graduacion_oi_cilindro", None),
        graduacion_oi_eje=getattr(p, "graduacion_oi_eje", None),
        graduacion_oi_adicion=getattr(p, "graduacion_oi_adicion", None),
        doctor_receta=getattr(p, "doctor_receta", None),
        observaciones=getattr(p, "observaciones", None),
        referidor_id=getattr(p, "referidor_id", None),
        referidor_nombre=p.referidor_rel.nombre if getattr(p, "referidor_rel", None) else None,
        vendedor_id=getattr(p, "vendedor_id", None),
        vendedor_nombre=p.vendedor_rel.nombre if getattr(p, "vendedor_rel", None) else None,
        canal_venta_id=getattr(p, "canal_venta_id", None),
        canal_venta_nombre=p.canal_venta_rel.nombre if getattr(p, "canal_venta_rel", None) else None,
        comision_monto=float(getattr(p, "comision_monto", 0.0) or 0.0),
        items=items,
    )


@pre_router.get("/", response_model=List[PresupuestoOut])
def listar_presupuestos(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
    cliente_id: Optional[int] = Query(None),
    estado: Optional[str] = Query(None),
    vendedor_id: Optional[int] = Query(None),
    canal_venta_id: Optional[int] = Query(None),
    skip: int = 0, limit: int = 50
):
    session = get_session_for_tenant(tenant_slug)
    try:
        q = session.query(Presupuesto)
        if cliente_id:
            q = q.filter(Presupuesto.cliente_id == cliente_id)
        if estado:
            q = q.filter(Presupuesto.estado == estado)
        if vendedor_id:
            q = q.filter(Presupuesto.vendedor_id == vendedor_id)
        if canal_venta_id:
            q = q.filter(Presupuesto.canal_venta_id == canal_venta_id)
        pres = q.order_by(Presupuesto.fecha.desc()).offset(skip).limit(limit).all()
        return [_build_presupuesto_out(p) for p in pres]
    finally:
        session.close()


@pre_router.get("/listado-optimizado", response_model=PresupuestoListResponseOut)
def listar_presupuestos_optimizado(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
    estado: Optional[str] = Query(None),
    vendedor_id: Optional[int] = Query(None),
    canal_venta_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        query = (
            session.query(
                Presupuesto.id,
                Presupuesto.codigo,
                Presupuesto.fecha,
                Presupuesto.estado,
                Presupuesto.cliente_id,
                Cliente.nombre.label("cliente_nombre"),
                Presupuesto.total,
                Presupuesto.graduacion_od_esfera,
                Presupuesto.graduacion_od_cilindro,
                Presupuesto.graduacion_od_eje,
                Presupuesto.graduacion_oi_esfera,
                Presupuesto.graduacion_oi_cilindro,
                Presupuesto.graduacion_oi_eje,
                Presupuesto.vendedor_id,
                Vendedor.nombre.label("vendedor_nombre"),
                Presupuesto.canal_venta_id,
                CanalVenta.nombre.label("canal_venta_nombre"),
                Presupuesto.referidor_id,
                Referidor.nombre.label("referidor_nombre"),
                Presupuesto.comision_monto,
            )
            .outerjoin(Cliente, Presupuesto.cliente_id == Cliente.id)
            .outerjoin(Vendedor, Presupuesto.vendedor_id == Vendedor.id)
            .outerjoin(CanalVenta, Presupuesto.canal_venta_id == CanalVenta.id)
            .outerjoin(Referidor, Presupuesto.referidor_id == Referidor.id)
        )

        if estado:
            query = query.filter(Presupuesto.estado == estado)
        if vendedor_id:
            query = query.filter(Presupuesto.vendedor_id == vendedor_id)
        if canal_venta_id:
            query = query.filter(Presupuesto.canal_venta_id == canal_venta_id)
        if search and search.strip():
            term = f"%{search.strip()}%"
            query = query.filter(
                or_(
                    Presupuesto.codigo.ilike(term),
                    Cliente.nombre.ilike(term),
                    Vendedor.nombre.ilike(term),
                    CanalVenta.nombre.ilike(term),
                )
            )

        total = query.order_by(None).count()
        total_pages = ceil(total / page_size) if total else 1
        offset = (page - 1) * page_size
        rows = (
            query
            .order_by(Presupuesto.fecha.desc(), Presupuesto.id.desc())
            .offset(offset)
            .limit(page_size)
            .all()
        )

        items = [
            PresupuestoListItemOut(
                id=row.id,
                codigo=row.codigo,
                fecha=row.fecha,
                estado=row.estado,
                cliente_id=row.cliente_id,
                cliente_nombre=row.cliente_nombre,
                total=float(row.total or 0.0),
                graduacion_od_esfera=row.graduacion_od_esfera,
                graduacion_od_cilindro=row.graduacion_od_cilindro,
                graduacion_od_eje=row.graduacion_od_eje,
                graduacion_oi_esfera=row.graduacion_oi_esfera,
                graduacion_oi_cilindro=row.graduacion_oi_cilindro,
                graduacion_oi_eje=row.graduacion_oi_eje,
                vendedor_id=row.vendedor_id,
                vendedor_nombre=row.vendedor_nombre,
                canal_venta_id=row.canal_venta_id,
                canal_venta_nombre=row.canal_venta_nombre,
                referidor_id=row.referidor_id,
                referidor_nombre=row.referidor_nombre,
                comision_monto=float(row.comision_monto or 0.0),
            )
            for row in rows
        ]

        return PresupuestoListResponseOut(
            items=items,
            page=page,
            page_size=page_size,
            total=total,
            total_pages=total_pages,
        )
    finally:
        session.close()


@pre_router.post("/{pre_id}/convertir-venta", response_model=VentaOut)
def convertir_presupuesto_a_venta(
    pre_id: int,
    pagos: List[PagoCreate] = Body(default=[]),
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user)
):
    """
    Convierte un Presupuesto en Venta con todos los efectos automáticos:
    - Estado de entrega: EN_LABORATORIO
    - Crea comisión automática si el presupuesto tiene referidor
    - Procesa los pagos iniciales con efectos en caja/banco
    """
    session = get_session_for_tenant(tenant_slug)
    try:
        pre = session.query(Presupuesto).filter(Presupuesto.id == pre_id).first()
        if not pre:
            raise HTTPException(status_code=404, detail="Presupuesto no encontrado.")
        if pre.estado == "VENDIDO":
            raise HTTPException(status_code=400, detail="Este presupuesto ya fue convertido en venta.")
        if pre.estado in ("CANCELADO", "VENCIDO"):
            raise HTTPException(status_code=400, detail=f"No se puede convertir un presupuesto en estado {pre.estado}.")

        codigo = _get_siguiente_codigo(session, Venta, "VEN")
        pagado_inicial = sum(p.monto for p in pagos)
        saldo_inicial = max(0.0, pre.total - pagado_inicial)

        canal_default = _obtener_canal_venta_default(session)
        canal_venta_id = pre.canal_venta_id or (canal_default.id if canal_default else None)

        venta = Venta(
            codigo=codigo,
            cliente_id=pre.cliente_id,
            presupuesto_id=pre.id,
            total=pre.total,
            saldo=saldo_inicial,
            estado="PAGADO" if saldo_inicial == 0 else "PENDIENTE",
            estado_entrega="EN_LABORATORIO",
            referidor_id=pre.referidor_id,
            vendedor_id=pre.vendedor_id,
            canal_venta_id=canal_venta_id,
            comision_monto=pre.comision_monto or 0.0,
            requiere_compra=True,
            es_credito=saldo_inicial > 0,
        )
        session.add(venta)
        session.flush()

        pre.estado = "VENDIDO"

        if pre.referidor_id and pre.comision_monto and pre.comision_monto > 0:
            comision = Comision(
                referidor_id=pre.referidor_id,
                monto=pre.comision_monto,
                estado="PENDIENTE",
                descripcion=f"Comisión por venta {codigo}",
                venta_id=venta.id,
            )
            session.add(comision)

        for pago_d in pagos:
            pago = Pago(venta_id=venta.id, **pago_d.model_dump())
            session.add(pago)
            session.flush()
            _procesar_pago(session, pago, codigo)

        session.commit()
        session.refresh(venta)
        vo = VentaOut.model_validate(venta)
        vo.cliente_nombre = venta.cliente_rel.nombre if venta.cliente_rel else None
        vo.vendedor_nombre = venta.vendedor_rel.nombre if venta.vendedor_rel else None
        vo.canal_venta_nombre = venta.canal_venta_rel.nombre if venta.canal_venta_rel else None
        return vo
    except HTTPException:
        session.rollback()
        raise
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=f"Error al convertir presupuesto: {str(e)}")
    finally:
        session.close()


@pre_router.get("/{pre_id}", response_model=PresupuestoOut)
def obtener_presupuesto(pre_id: int, tenant_slug: str = Depends(get_tenant_slug), current_user=Depends(get_current_user)):
    session = get_session_for_tenant(tenant_slug)
    try:
        p = session.query(Presupuesto).filter(Presupuesto.id == pre_id).first()
        if not p:
            raise HTTPException(status_code=404, detail="Presupuesto no encontrado.")
        return _build_presupuesto_out(p)
    finally:
        session.close()



@pre_router.post("/", response_model=PresupuestoOut)
def crear_presupuesto(data: PresupuestoCreate, tenant_slug: str = Depends(get_tenant_slug), current_user=Depends(get_current_user)):
    session = get_session_for_tenant(tenant_slug)
    try:
        codigo = _get_siguiente_codigo(session, Presupuesto, "PRE")
        items_data = data.items
        pres_data = data.model_dump(exclude={"items"})
        if not pres_data.get("canal_venta_id"):
            canal_default = _obtener_canal_venta_default(session)
            if canal_default:
                pres_data["canal_venta_id"] = canal_default.id
        presupuesto = Presupuesto(codigo=codigo, **pres_data)
        session.add(presupuesto)
        session.flush()

        total = 0.0
        for item_d in items_data:
            # Snapshot del costo actual del producto al momento de crear el presupuesto
            prod = session.query(Producto).filter(Producto.id == item_d.producto_id).first()
            costo = prod.costo if prod and prod.costo else 0.0

            item_dict = item_d.model_dump()
            item_dict["costo_unitario"] = item_dict.get("costo_unitario") if item_dict.get("costo_unitario") is not None else costo

            item = PresupuestoItem(presupuesto_id=presupuesto.id, **item_dict)
            session.add(item)
            total += item.subtotal

        presupuesto.total = total
        session.commit()
        session.refresh(presupuesto)
        return _build_presupuesto_out(presupuesto)
    finally:
        session.close()


@pre_router.patch("/{pre_id}/estado")
def cambiar_estado_presupuesto(
    pre_id: int,
    estado: str,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user)
):
    session = get_session_for_tenant(tenant_slug)
    try:
        p = session.query(Presupuesto).filter(Presupuesto.id == pre_id).first()
        if not p:
            raise HTTPException(status_code=404, detail="Presupuesto no encontrado.")
        p.estado = estado
        session.commit()
        return {"ok": True, "estado": estado}
    finally:
        session.close()


@pre_router.delete("/{pre_id}")
def eliminar_presupuesto(pre_id: int, tenant_slug: str = Depends(get_tenant_slug), current_user=Depends(get_current_user)):
    session = get_session_for_tenant(tenant_slug)
    try:
        p = session.query(Presupuesto).filter(Presupuesto.id == pre_id).first()
        if not p:
            raise HTTPException(status_code=404, detail="Presupuesto no encontrado.")
        if p.estado == "VENDIDO":
            raise HTTPException(status_code=400, detail="No se puede eliminar un presupuesto ya convertido en venta.")
        session.delete(p)
        session.commit()
        return {"ok": True}
    finally:
        session.close()



@pre_router.put("/{pre_id}", response_model=PresupuestoOut)
def editar_presupuesto(pre_id: int, data: PresupuestoCreate, tenant_slug: str = Depends(get_tenant_slug), current_user=Depends(get_current_user)):
    session = get_session_for_tenant(tenant_slug)
    try:
        p = session.query(Presupuesto).filter(Presupuesto.id == pre_id).first()
        if not p:
            raise HTTPException(status_code=404, detail="Presupuesto no encontrado.")
        if p.estado == "VENDIDO":
            raise HTTPException(status_code=400, detail="No se puede editar un presupuesto ya convertido en venta.")

        # Actualizar campos del presupuesto
        items_data = data.items
        pres_dict = data.model_dump(exclude={"items"})
        for k, v in pres_dict.items():
            setattr(p, k, v)

        # Reemplazar ítems

        total = 0.0
        existentes = {item.id: item for item in p.items}
        enviados_ids = set()
        for item_d in items_data:
            prod = session.query(Producto).filter(Producto.id == item_d.producto_id).first()
            costo = prod.costo if prod and prod.costo else 0.0
            item_dict = item_d.model_dump()
            item_dict["costo_unitario"] = item_dict.get("costo_unitario") if item_dict.get("costo_unitario") is not None else costo
            item_id = item_dict.pop("id", None)
            if item_id and item_id in existentes:
                item = existentes[item_id]
                enviados_ids.add(item_id)
                for key, value in item_dict.items():
                    setattr(item, key, value)
            else:
                item = PresupuestoItem(presupuesto_id=p.id, **item_dict)
                session.add(item)
            total += item.subtotal

        for old_item in list(p.items):
            if old_item.id in enviados_ids:
                continue
            linked_detail = session.query(CompraDetalle).filter(
                CompraDetalle.presupuesto_item_id == old_item.id
            ).first()
            if linked_detail:
                nombre_item = old_item.producto_rel.nombre if old_item.producto_rel else (old_item.descripcion_personalizada or f"Item #{old_item.id}")
                raise HTTPException(
                    status_code=400,
                    detail=f"No se puede quitar el item '{nombre_item}' porque ya esta asociado a una compra registrada.",
                )
            session.delete(old_item)

        p.total = total
        session.commit()
        session.refresh(p)
        return _build_presupuesto_out(p)
    except HTTPException:
        session.rollback()
        raise
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=f"Error al editar presupuesto: {str(e)}")
    finally:
        session.close()


# ─── Ventas ────────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[VentaOut])
def listar_ventas(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
    estado: Optional[str] = Query(None),
    cliente_id: Optional[int] = Query(None),
    estado_entrega: Optional[str] = Query(None),
    vendedor_id: Optional[int] = Query(None),
    canal_venta_id: Optional[int] = Query(None),
    skip: int = 0, limit: int = 50
):
    session = get_session_for_tenant(tenant_slug)
    try:
        q = session.query(Venta)
        if estado:
            q = q.filter(Venta.estado == estado)
        if cliente_id:
            q = q.filter(Venta.cliente_id == cliente_id)
        if estado_entrega:
            q = q.filter(Venta.estado_entrega == estado_entrega)
        if vendedor_id:
            q = q.filter(Venta.vendedor_id == vendedor_id)
        if canal_venta_id:
            q = q.filter(Venta.canal_venta_id == canal_venta_id)
        ventas = q.order_by(Venta.fecha.desc()).offset(skip).limit(limit).all()
        result = []
        for v in ventas:
            vo = VentaOut.model_validate(v)
            if v.cliente_rel:
                vo.cliente_nombre = str(v.cliente_rel.nombre)
            else:
                vo.cliente_nombre = "N/A"
            vo.vendedor_nombre = v.vendedor_rel.nombre if getattr(v, "vendedor_rel", None) else None
            vo.canal_venta_nombre = v.canal_venta_rel.nombre if getattr(v, "canal_venta_rel", None) else None
            result.append(vo)
        return result
    finally:
        session.close()


@router.get("/pendientes-cobro", response_model=List[VentaOut])
def get_ventas_pendientes_cobro(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user)
):
    """Obtiene todas las ventas con saldo pendiente (> 0)."""
    session = get_session_for_tenant(tenant_slug)
    try:
        ventas = session.query(Venta).filter(Venta.saldo > 0).order_by(Venta.fecha.desc()).all()
        print(f"DEBUG: Found {len(ventas)} pending sales for tenant {tenant_slug}")
        result = []
        for v in ventas:
            vo = VentaOut.model_validate(v)
            if v.cliente_rel:
                vo.cliente_nombre = str(v.cliente_rel.nombre)
            else:
                vo.cliente_nombre = "N/A"
            vo.vendedor_nombre = v.vendedor_rel.nombre if getattr(v, "vendedor_rel", None) else None
            vo.canal_venta_nombre = v.canal_venta_rel.nombre if getattr(v, "canal_venta_rel", None) else None
            result.append(vo)
        return result
    except Exception as e:
        print(f"ERROR in get_ventas_pendientes_cobro: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()


@router.get("/historial-cobros-multiples", response_model=List[GrupoPagoOut])
def listar_historial_cobros_multiples(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user)
):
    """Lista los grupos de pagos realizados masivamente."""
    session = get_session_for_tenant(tenant_slug)
    try:
        pagos = session.query(Pago).filter(Pago.grupo_pago_id.isnot(None)).order_by(Pago.fecha.desc()).all()
        
        grupos_map = {}
        for p in pagos:
            gid = p.grupo_pago_id
            if gid not in grupos_map:
                grupos_map[gid] = {
                    "grupo_id": gid,
                    "fecha": p.fecha,
                    "total": 0.0,
                    "cant_pagos": 0,
                    "metodo": p.metodo_pago,
                    "nota": p.nota or "",
                    "clientes": set()
                }
            
            # Explicitly update to avoid mixed type inference issues
            data = grupos_map[gid]
            data["total"] = float(data["total"]) + float(p.monto)
            data["cant_pagos"] = int(data["cant_pagos"]) + 1
            if p.venta_rel and p.venta_rel.cliente_rel:
                c_set = data["clientes"]
                if isinstance(c_set, set):
                    # Ensure we add a string and handle potential None
                    nombre = p.venta_rel.cliente_rel.nombre
                    if nombre:
                        c_set.add(str(nombre))
        
        resultado = []
        for gid in grupos_map:
            d = grupos_map[gid]
            c_list = list(d["clientes"])
            c_str = ", ".join(c_list[:3])
            if len(c_list) > 3:
                c_str = c_str + "..."
            
            resultado.append(GrupoPagoOut(
                grupo_id=str(d["grupo_id"]),
                fecha=d["fecha"],
                total=float(d["total"]),
                cant_pagos=int(d["cant_pagos"]),
                metodo=str(d["metodo"]),
                nota=str(d["nota"]),
                clientes_str=c_str
            ))
        
        resultado.sort(key=lambda x: x.fecha, reverse=True)
        return resultado
    finally:
        session.close()


@router.get("/grupos-pago/{grupo_id}/pdf")
def descargar_recibo_grupo(
    grupo_id: str,
    tipo: str = "resumido",
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user)
):
    """Genera y descarga el PDF consolidado para un cobro múltiple (grupo)."""
    from fastapi.responses import StreamingResponse
    from app.utils.pdf_recibos_venta import generar_recibo_cobro_multiple, generar_recibo_cobro_multiple_detallado
    from app.models.models import ConfiguracionEmpresa
    
    session = get_session_for_tenant(tenant_slug)
    try:
        pagos = session.query(Pago).filter(Pago.grupo_pago_id == grupo_id).all()
        if not pagos:
            raise HTTPException(status_code=404, detail="Grupo de pagos no encontrado.")
            
        config = session.query(ConfiguracionEmpresa).first()
        
        # Calculate totals
        total_pagado = sum(p.monto for p in pagos)
        metodo = pagos[0].metodo_pago if pagos else "N/A"
        nota = pagos[0].nota if pagos else ""
        
        if tipo == "detallado":
            pdf_buffer = generar_recibo_cobro_multiple_detallado(pagos, config, total_pagado, metodo, nota)
        else:
            pdf_buffer = generar_recibo_cobro_multiple(pagos, config, total_pagado, metodo, nota)
        
        headers = {
            'Content-Disposition': f'attachment; filename="cobro_multiple_{grupo_id}_{tipo}.pdf"'
        }
        return StreamingResponse(iter([pdf_buffer.getvalue()]), media_type="application/pdf", headers=headers)
    finally:
        session.close()

@router.delete("/grupos-pago/{grupo_id}")
def revertir_grupo_pago(
    grupo_id: str,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user)
):
    """Anula/Revierte un grupo de pagos completo."""
    session = get_session_for_tenant(tenant_slug)
    try:
        pagos = session.query(Pago).filter(Pago.grupo_pago_id == grupo_id).all()
        if not pagos:
            raise HTTPException(status_code=404, detail="Grupo de pagos no encontrado.")

        # 1. Revertir individualmente si hubo movimientos ligados a pago.id (Caja)
        for p in pagos:
            venta = p.venta_rel
            _revertir_pago(session, p, venta.codigo)
            venta.saldo += p.monto
            venta.estado = "PENDIENTE"
            session.delete(p)
        
        # 2. Revertir movimientos bancarios agrupados
        movs_banco = session.query(MovimientoBanco).filter(MovimientoBanco.grupo_pago_id == grupo_id).all()
        from app.models.models import GastoOperativo
        for mov in movs_banco:
            banco = session.query(Banco).filter(Banco.id == mov.banco_id).first()
            if banco:
                if mov.tipo == "INGRESO":
                    banco.saldo_actual -= mov.monto
                else:
                    banco.saldo_actual += mov.monto
            
            # Buscar gasto operativo asociado al movimiento grupal
            gasto = session.query(GastoOperativo).filter(GastoOperativo.movimiento_banco_id == mov.id).first()
            if gasto:
                session.delete(gasto)
            session.delete(mov)

        session.commit()
        return {"ok": True, "mensaje": f"Se han revertido {len(pagos)} pagos."}
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()


@pre_router.patch("/{pre_id}/asignacion-comercial", response_model=PresupuestoOut)
def actualizar_asignacion_comercial_presupuesto(
    pre_id: int,
    data: PresupuestoAsignacionComercialIn,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user)
):
    session = get_session_for_tenant(tenant_slug)
    try:
        p = session.query(Presupuesto).filter(Presupuesto.id == pre_id).first()
        if not p:
            raise HTTPException(status_code=404, detail="Presupuesto no encontrado.")

        if data.vendedor_id:
            vendedor = session.query(Vendedor).filter(Vendedor.id == data.vendedor_id).first()
            if not vendedor:
                raise HTTPException(status_code=404, detail="Vendedor no encontrado.")

        if data.canal_venta_id:
            canal = session.query(CanalVenta).filter(CanalVenta.id == data.canal_venta_id).first()
            if not canal:
                raise HTTPException(status_code=404, detail="Canal de venta no encontrado.")

        canal_venta_id = data.canal_venta_id
        if not canal_venta_id:
            canal_default = _obtener_canal_venta_default(session)
            canal_venta_id = canal_default.id if canal_default else None

        p.vendedor_id = data.vendedor_id
        p.canal_venta_id = canal_venta_id

        venta = session.query(Venta).filter(Venta.presupuesto_id == p.id).first()
        if venta:
            venta.vendedor_id = data.vendedor_id
            venta.canal_venta_id = canal_venta_id

        session.commit()
        session.refresh(p)
        return _build_presupuesto_out(p)
    finally:
        session.close()


@router.get("/listado-optimizado", response_model=VentaListResponseOut)
def listar_ventas_optimizado(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
    estado: Optional[str] = Query(None),
    estado_entrega: Optional[str] = Query(None),
    vendedor_id: Optional[int] = Query(None),
    canal_venta_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    con_saldo: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        query = (
            session.query(Venta)
            .outerjoin(Cliente, Venta.cliente_id == Cliente.id)
            .outerjoin(Vendedor, Venta.vendedor_id == Vendedor.id)
            .outerjoin(CanalVenta, Venta.canal_venta_id == CanalVenta.id)
        )
        if estado:
            query = query.filter(Venta.estado == estado)
        else:
            query = query.filter(Venta.estado != "ANULADA")
        if estado_entrega:
            query = query.filter(Venta.estado_entrega == estado_entrega)
        if vendedor_id:
            query = query.filter(Venta.vendedor_id == vendedor_id)
        if canal_venta_id:
            query = query.filter(Venta.canal_venta_id == canal_venta_id)
        if con_saldo:
            query = query.filter(Venta.saldo > 0)
        if search and search.strip():
            term = f"%{search.strip()}%"
            query = query.filter(
                or_(
                    Venta.codigo.ilike(term),
                    Cliente.nombre.ilike(term),
                    Vendedor.nombre.ilike(term),
                    CanalVenta.nombre.ilike(term),
                )
            )

        total = query.count()
        total_pages = ceil(total / page_size) if total else 1
        offset = (page - 1) * page_size
        ventas = (
            query
            .order_by(Venta.fecha.desc(), Venta.id.desc())
            .offset(offset)
            .limit(page_size)
            .all()
        )

        items = [
            VentaListItemOut(
                id=venta.id,
                codigo=venta.codigo,
                fecha=venta.fecha,
                cliente_id=venta.cliente_id,
                cliente_nombre=venta.cliente_rel.nombre if venta.cliente_rel else "N/A",
                vendedor_nombre=venta.vendedor_rel.nombre if getattr(venta, "vendedor_rel", None) else None,
                canal_venta_nombre=venta.canal_venta_rel.nombre if getattr(venta, "canal_venta_rel", None) else None,
                total=venta.total or 0.0,
                saldo=venta.saldo or 0.0,
                estado=venta.estado,
                estado_entrega=venta.estado_entrega,
            )
            for venta in ventas
        ]
        return VentaListResponseOut(
            items=items,
            page=page,
            page_size=page_size,
            total=total,
            total_pages=total_pages,
        )
    finally:
        session.close()




@router.get("/{venta_id:int}", response_model=VentaOut)
def obtener_venta(venta_id: int, tenant_slug: str = Depends(get_tenant_slug), current_user=Depends(get_current_user)):
    session = get_session_for_tenant(tenant_slug)
    try:
        v = session.query(Venta).filter(Venta.id == venta_id).first()
        if not v:
            raise HTTPException(status_code=404, detail="Venta no encontrada.")
        vo = VentaOut.model_validate(v)
        if v.cliente_rel:
            vo.cliente_nombre = str(v.cliente_rel.nombre)
        else:
            vo.cliente_nombre = "N/A"
        vo.vendedor_nombre = v.vendedor_rel.nombre if getattr(v, "vendedor_rel", None) else None
        vo.canal_venta_nombre = v.canal_venta_rel.nombre if getattr(v, "canal_venta_rel", None) else None
        return vo
    finally:
        session.close()


@router.post("/", response_model=VentaOut)
def crear_venta(data: VentaCreate, tenant_slug: str = Depends(get_tenant_slug), current_user=Depends(get_current_user)):
    """
    Crea una Venta a partir de un Presupuesto.
    Efectos automáticos:
    - Marca el Presupuesto como VENDIDO.
    - Estado de entrega inicial: EN_LABORATORIO.
    - Si hay referidor con comisión, genera registro en tabla Comision.
    - Si hay pagos iniciales, aplica los movimientos de caja/banco/tarjeta.
    """
    session = get_session_for_tenant(tenant_slug)
    try:
        codigo = _get_siguiente_codigo(session, Venta, "VEN")
        pagos_data = data.pagos
        venta_data = data.model_dump(exclude={"pagos"})

        venta = Venta(
            codigo=codigo,
            estado_entrega="EN_LABORATORIO",  # Estado inicial siempre
            **venta_data
        )
        pagado_inicial = sum(p.monto for p in pagos_data)
        venta.saldo = max(0.0, venta.total - pagado_inicial)
        venta.estado = "PAGADO" if venta.saldo == 0 else "PENDIENTE"
        session.add(venta)
        session.flush()

        # 1. Marcar presupuesto como VENDIDO
        if venta.presupuesto_id:
            pre = session.query(Presupuesto).filter(Presupuesto.id == venta.presupuesto_id).first()
            if pre:
                pre.estado = "VENDIDO"

        # 2. Crear comisión automática para el referidor
        if venta.referidor_id and venta.comision_monto and venta.comision_monto > 0:
            comision = Comision(
                referidor_id=venta.referidor_id,
                monto=venta.comision_monto,
                estado="PENDIENTE",
                descripcion=f"Comisión por venta {codigo}",
                venta_id=venta.id,
            )
            session.add(comision)

        # 3. Procesar pagos iniciales con efectos financieros
        for pago_d in pagos_data:
            pago = Pago(venta_id=venta.id, **pago_d.model_dump())
            session.add(pago)
            session.flush()  # Necesario para tener pago.id
            _procesar_pago(session, pago, codigo)

        session.commit()
        session.refresh(venta)
        vo = VentaOut.model_validate(venta)
        vo.cliente_nombre = venta.cliente_rel.nombre if venta.cliente_rel else None
        vo.vendedor_nombre = venta.vendedor_rel.nombre if venta.vendedor_rel else None
        vo.canal_venta_nombre = venta.canal_venta_rel.nombre if venta.canal_venta_rel else None
        return vo
    except HTTPException:
        session.rollback()
        raise
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=f"Error al crear venta: {str(e)}")
    finally:
        session.close()


@router.post("/{venta_id:int}/pagos", response_model=PagoOut)
def registrar_pago(
    venta_id: int,
    pago_data: PagoCreate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("ventas.cobrar", "ventas"))
):
    """
    Registra un cobro sobre una venta existente.
    Efectos automáticos según método de pago:
    - EFECTIVO: ingreso en MovimientoCaja + actualiza saldo de caja.
    - TRANSFERENCIA: ingreso en MovimientoBanco + actualiza saldo del banco.
    - TARJETA: ingreso en banco + GastoOperativo por comisión + egreso en banco.
    """
    session = get_session_for_tenant(tenant_slug)
    try:
        venta = session.query(Venta).filter(Venta.id == venta_id).first()
        if not venta:
            raise HTTPException(status_code=404, detail="Venta no encontrada.")
        if venta.estado == "ANULADA":
            raise HTTPException(status_code=400, detail="No se puede cobrar una venta anulada.")
        if pago_data.monto > venta.saldo + 1:
            raise HTTPException(status_code=422, detail=f"El monto ({pago_data.monto}) supera el saldo pendiente ({venta.saldo}).")

        pago_dict = pago_data.model_dump(exclude_unset=True)
        if pago_dict.get("fecha") is None:
            pago_dict.pop("fecha", None)

        pago = Pago(venta_id=venta_id, **pago_dict)
        session.add(pago)
        session.flush()

        _procesar_pago(session, pago, venta.codigo)

        venta.saldo = max(0.0, venta.saldo - pago_data.monto)
        venta.estado = "PAGADO" if venta.saldo == 0 else "PENDIENTE"

        session.commit()
        session.refresh(pago)
        return PagoOut.model_validate(pago)
    except HTTPException:
        session.rollback()
        raise
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=f"Error al registrar pago: {str(e)}")
    finally:
        session.close()


@router.delete("/{venta_id:int}/pagos/{pago_id:int}")
def eliminar_pago(
    venta_id: int,
    pago_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("ventas.revertir", "ventas"))
):
    """Elimina un pago y revierte todos sus movimientos financieros."""
    session = get_session_for_tenant(tenant_slug)
    try:
        pago = session.query(Pago).filter(Pago.id == pago_id, Pago.venta_id == venta_id).first()
        if not pago:
            raise HTTPException(status_code=404, detail="Pago no encontrado.")
        venta = pago.venta_rel

        _revertir_pago(session, pago, venta.codigo)

        venta.saldo += pago.monto
        venta.saldo = min(venta.saldo, venta.total)
        venta.estado = "PENDIENTE" if venta.saldo > 0 else "PAGADO"

        session.delete(pago)
        session.commit()
        return {"ok": True, "saldo_restante": venta.saldo}
    except HTTPException:
        session.rollback()
        raise
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=f"Error al eliminar pago: {str(e)}")
    finally:
        session.close()


@router.post("/{venta_id:int}/anular")
def anular_venta(
    venta_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("ventas.anular", "ventas"))
):
    """
    Anula una venta:
    1. Revierte TODOS los pagos y sus movimientos financieros.
    2. Elimina las comisiones de referidores.
    3. DEVUELVE el stock de los productos vendidos.
    4. Regresa el presupuesto a estado BORRADOR.
    5. Marca la venta como ANULADA.
    """
    session = get_session_for_tenant(tenant_slug)
    try:
        venta = session.query(Venta).filter(Venta.id == venta_id).first()
        if not venta:
            raise HTTPException(status_code=404, detail="Venta no encontrada.")
        if venta.estado == "ANULADA":
            raise HTTPException(status_code=400, detail="La venta ya está anulada.")

        # 1. Revertir todos los pagos
        pagos = session.query(Pago).filter(Pago.venta_id == venta_id).all()
        for pago in pagos:
            _revertir_pago(session, pago, venta.codigo)
            session.delete(pago)

        # 2. Eliminar comisiones
        comisiones = session.query(Comision).filter(Comision.venta_id == venta_id).all()
        for com in comisiones:
            session.delete(com)

        # 3. Devolver stock de productos (según solicitud del usuario)
        if venta.presupuesto_id:
            items = session.query(PresupuestoItem).filter(
                PresupuestoItem.presupuesto_id == venta.presupuesto_id
            ).all()
            for item in items:
                if item.producto_id:
                    prod = session.query(Producto).filter(Producto.id == item.producto_id).first()
                    if prod and prod.stock_actual is not None:
                        prod.stock_actual += item.cantidad

        # 4. Revertir estado del presupuesto
        if venta.presupuesto_id:
            pre = session.query(Presupuesto).filter(Presupuesto.id == venta.presupuesto_id).first()
            if pre:
                pre.estado = "BORRADOR"

        # 5. Marcar como anulada
        venta.estado = "ANULADA"
        venta.saldo = 0
        venta.estado_entrega = "ANULADO"

        session.commit()
        return {"ok": True, "mensaje": "Venta anulada. Stock restaurado y pagos revertidos."}
    except HTTPException:
        session.rollback()
        raise
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=f"Error al anular venta: {str(e)}")
    finally:
        session.close()


@router.patch("/{venta_id}/estado_entrega")
def actualizar_estado_entrega(
    venta_id: int,
    estado_entrega: str = Body(..., embed=True),
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("ventas.entrega", "ventas"))
):
    """Actualiza el estado de entrega de una venta."""
    estados_validos = {"EN_LABORATORIO", "RECIBIDO", "ENTREGADO", "PENDIENTE_ENVIO"}
    if estado_entrega not in estados_validos:
        raise HTTPException(status_code=422, detail=f"Estado inválido. Válidos: {estados_validos}")
    session = get_session_for_tenant(tenant_slug)
    try:
        venta = session.query(Venta).filter(Venta.id == venta_id).first()
        if not venta:
            raise HTTPException(status_code=404, detail="Venta no encontrada.")
        venta.estado_entrega = estado_entrega
        session.commit()
        return {"ok": True, "estado_entrega": estado_entrega}
    finally:
        session.close()


@router.get("/{venta_id:int}/pagos/{pago_id:int}/pdf")
def descargar_recibo_pago(
    venta_id: int, 
    pago_id: int, 
    tenant_slug: str = Depends(get_tenant_slug), 
    current_user=Depends(require_action("ventas.exportar", "ventas"))
):
    """Genera un PDF para un pago individual de una venta."""
    session = get_session_for_tenant(tenant_slug)
    try:
        pago = session.query(Pago).filter(Pago.id == pago_id, Pago.venta_id == venta_id).first()
        if not pago:
            raise HTTPException(status_code=404, detail="Pago no encontrado.")
        venta = pago.venta_rel
        cliente = venta.cliente_rel if venta else None
        config = session.query(ConfiguracionEmpresa).first()
        
        pdf_buffer = generar_recibo_pago_individual(pago, venta, cliente, config)
        filename = f"{cliente.nombre if cliente else 'Cliente'}_recibo_pago_{pago.id}.pdf"
        return StreamingResponse(
            pdf_buffer, 
            media_type="application/pdf", 
            headers={"Content-Disposition": f'inline; filename="{filename}"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando PDF: {str(e)}")
    finally:
        session.close()


@router.get("/{venta_id:int}/pdf")
def descargar_recibo_venta_consolidado(
    venta_id: int, 
    tenant_slug: str = Depends(get_tenant_slug), 
    current_user=Depends(require_action("ventas.exportar", "ventas"))
):
    """Genera un PDF consolidado de toda la venta con sus productos y pagos."""
    session = get_session_for_tenant(tenant_slug)
    try:
        venta = session.query(Venta).filter(Venta.id == venta_id).first()
        if not venta:
            raise HTTPException(status_code=404, detail="Venta no encontrada.")
        cliente = venta.cliente_rel
        config = session.query(ConfiguracionEmpresa).first()
        
        pdf_buffer = generar_recibo_venta_consolidado(venta, cliente, list(venta.pagos), config)
        filename = f"{cliente.nombre if cliente else 'Cliente'}_recibo_venta_{venta.codigo}.pdf"
        return StreamingResponse(
            pdf_buffer, 
            media_type="application/pdf", 
            headers={"Content-Disposition": f'inline; filename="{filename}"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando PDF: {str(e)}")
    finally:
        session.close()


@router.post("/pdf-multiple")
def descargar_recibos_ventas_multiples(
    data: VentasPdfMultipleRequest,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("ventas.exportar", "ventas"))
):
    """Genera un solo PDF con múltiples ventas seleccionadas."""
    session = get_session_for_tenant(tenant_slug)
    try:
        venta_ids = []
        for venta_id in data.venta_ids:
            if venta_id not in venta_ids:
                venta_ids.append(venta_id)

        if not venta_ids:
            raise HTTPException(status_code=422, detail="Debe seleccionar al menos una venta.")

        ventas = (
            session.query(Venta)
            .filter(Venta.id.in_(venta_ids))
            .order_by(Venta.fecha.asc(), Venta.id.asc())
            .all()
        )
        if not ventas:
            raise HTTPException(status_code=404, detail="No se encontraron ventas para generar el PDF.")

        ventas_data = []
        for venta in ventas:
            ventas_data.append({
                "venta": venta,
                "cliente": venta.cliente_rel,
                "pagos": list(venta.pagos),
            })

        config = session.query(ConfiguracionEmpresa).first()
        pdf_buffer = generar_recibos_ventas_concatenado(ventas_data, config=config)
        nombre_archivo = f"ventas_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="{nombre_archivo}"'}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando PDF múltiple: {str(e)}")
    finally:
        session.close()


@pre_router.get("/{pre_id}/pdf")
def descargar_pdf_presupuesto(
    pre_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("presupuestos.exportar", "ventas"))
):
    """Genera un PDF de presupuesto usando la configuracion general del tenant."""
    session = get_session_for_tenant(tenant_slug)
    try:
        presupuesto = session.query(Presupuesto).filter(Presupuesto.id == pre_id).first()
        if not presupuesto:
            raise HTTPException(status_code=404, detail="Presupuesto no encontrado.")
        config = session.query(ConfiguracionEmpresa).first()
        pdf_buffer = generar_pdf_presupuesto(presupuesto, config)
        filename = f"{presupuesto.codigo}_presupuesto.pdf"
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename=\"{filename}\"'}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando PDF del presupuesto: {str(e)}")
    finally:
        session.close()


@router.post("/cobro-multiple")
def registrar_cobro_multiple(
    data: PagoMultipleCreate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("ventas.cobrar", "ventas"))
):
    """
    Registra cobros para múltiples ventas en una sola transacción.
    Si es transferencia/tarjeta, agrupa el movimiento bancario.
    """
    import uuid
    from app.schemas.schemas import PagoOut
    session = get_session_for_tenant(tenant_slug)
    try:
        grupo_id = str(uuid.uuid4())
        fecha_pago = data.fecha if data.fecha else datetime.now()
        pagos_orm = []
        total_acumulado = 0.0

        for item in data.items:
            venta = session.query(Venta).filter(Venta.id == item.venta_id).first()
            if not venta:
                raise HTTPException(status_code=404, detail=f"Venta ID {item.venta_id} no encontrada.")
            
            if item.monto > venta.saldo + 100: # Margen de error pequeño
                raise HTTPException(status_code=400, detail=f"El monto {item.monto} excede el saldo de {venta.codigo}")

            pago = Pago(
                venta_id=venta.id,
                monto=item.monto,
                metodo_pago=data.metodo_pago,
                banco_id=data.banco_id,
                nota=data.nota,
                fecha=fecha_pago,
                grupo_pago_id=grupo_id
            )
            session.add(pago)
            session.flush()

            venta.saldo = max(0.0, venta.saldo - item.monto)
            venta.estado = "PAGADO" if venta.saldo == 0 else "PENDIENTE"
            
            pagos_orm.append(pago)
            total_acumulado += item.monto

            # Si es EFECTIVO, registramos movimiento individual en caja (como hacía el legacy)
            if data.metodo_pago == "EFECTIVO":
                _registrar_en_caja(session, item.monto, f"Cobro Múltiple - Venta {venta.codigo}", pago.id)

        # Si es BANCO, registramos UN SOLO movimiento agrupado
        if data.metodo_pago in ("TRANSFERENCIA", "TARJETA"):
            if not data.banco_id:
                raise HTTPException(status_code=422, detail="banco_id requerido.")
            
            concepto = f"Cobro Múltiple ({len(data.items)} ventas)"
            if data.nota:
                concepto += f" - {data.nota}"
            
            _registrar_en_banco(
                session, data.banco_id, total_acumulado, concepto, 
                tipo="INGRESO", pago_venta_id=None, grupo_pago_id=grupo_id
            )

            if data.metodo_pago == "TARJETA":
                # La comisión de tarjeta en cobro múltiple es un tema complejo.
                # En el legacy se aplicaba por el total del grupo? 
                # Reaplicamos lógica: por el total del grupo.
                _registrar_comision_tarjeta_grupal(session, data.banco_id, total_acumulado, grupo_id)

        session.commit()
        return {"ok": True, "grupo_pago_id": grupo_id, "cantidad_pagos": len(pagos_orm)}
    except HTTPException:
        session.rollback()
        raise
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()


@router.get("/ajustes", response_model=AjusteVentaListResponseOut)
def listar_ajustes_venta(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
    fecha_desde: Optional[datetime] = Query(None),
    fecha_hasta: Optional[datetime] = Query(None),
    cliente_id: Optional[int] = Query(None),
    tipo: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        query = session.query(AjusteVenta).join(Venta).outerjoin(Cliente, Venta.cliente_id == Cliente.id)
        if fecha_desde:
            query = query.filter(AjusteVenta.fecha >= fecha_desde)
        if fecha_hasta:
            query = query.filter(AjusteVenta.fecha <= fecha_hasta)
        if cliente_id:
            query = query.filter(Venta.cliente_id == cliente_id)
        if tipo:
            query = query.filter(AjusteVenta.tipo == tipo.upper())

        total = query.count()
        total_pages = ceil(total / page_size) if total else 1
        items = (
            query.order_by(AjusteVenta.fecha.desc(), AjusteVenta.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        return AjusteVentaListResponseOut(
            items=[_serializar_ajuste(item) for item in items],
            page=page,
            page_size=page_size,
            total=total,
            total_pages=total_pages,
        )
    finally:
        session.close()


@router.post("/ajustes", response_model=AjusteVentaOut)
def crear_ajuste_venta(
    data: AjusteVentaCreate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("ventas.ajustar", "ventas")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        venta = session.query(Venta).filter(Venta.id == data.venta_id).first()
        if not venta:
            raise HTTPException(status_code=404, detail="Venta no encontrada.")
        if venta.estado in {"ANULADA", "ANULADO"}:
            raise HTTPException(status_code=422, detail="No se puede ajustar una venta anulada.")
        if data.monto <= 0:
            raise HTTPException(status_code=422, detail="El monto debe ser mayor a cero.")
        if data.monto > (venta.total or 0) + 100:
            raise HTTPException(status_code=422, detail="El monto del ajuste excede el total de la venta.")

        usuario_nombre = getattr(current_user, "nombre_completo", None) or getattr(current_user, "nombre", None) or getattr(current_user, "email", None) or "Sistema"
        ajuste = AjusteVenta(
            venta_id=venta.id,
            monto=float(data.monto),
            motivo=data.motivo,
            tipo=data.tipo,
            usuario=usuario_nombre,
        )
        session.add(ajuste)

        venta.total = max(0.0, float((venta.total or 0.0) - data.monto))
        venta.saldo = max(0.0, float((venta.saldo or 0.0) - data.monto))
        _actualizar_estado_venta_por_saldo(venta)

        session.commit()
        session.refresh(ajuste)
        return _serializar_ajuste(ajuste)
    except HTTPException:
        session.rollback()
        raise
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=f"Error al registrar ajuste: {str(e)}")
    finally:
        session.close()


@router.get("/ajustes/{ajuste_id:int}", response_model=AjusteVentaOut)
def obtener_ajuste_venta(
    ajuste_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        ajuste = session.query(AjusteVenta).filter(AjusteVenta.id == ajuste_id).first()
        if not ajuste:
            raise HTTPException(status_code=404, detail="Ajuste no encontrado.")
        return _serializar_ajuste(ajuste)
    finally:
        session.close()


@router.put("/ajustes/{ajuste_id:int}", response_model=AjusteVentaOut)
def editar_ajuste_venta(
    ajuste_id: int,
    data: AjusteVentaUpdate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("ventas.ajustar", "ventas")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        ajuste = session.query(AjusteVenta).filter(AjusteVenta.id == ajuste_id).first()
        if not ajuste:
            raise HTTPException(status_code=404, detail="Ajuste no encontrado.")
        venta = ajuste.venta_rel
        if not venta:
            raise HTTPException(status_code=404, detail="La venta asociada no existe.")
        if data.monto <= 0:
            raise HTTPException(status_code=422, detail="El monto debe ser mayor a cero.")

        venta.total = float((venta.total or 0.0) + (ajuste.monto or 0.0))
        venta.saldo = float((venta.saldo or 0.0) + (ajuste.monto or 0.0))
        if data.monto > (venta.total or 0) + 100:
            raise HTTPException(status_code=422, detail="El monto del ajuste excede el total de la venta.")

        venta.total = max(0.0, float((venta.total or 0.0) - data.monto))
        venta.saldo = max(0.0, float((venta.saldo or 0.0) - data.monto))
        _actualizar_estado_venta_por_saldo(venta)

        ajuste.monto = float(data.monto)
        ajuste.motivo = data.motivo
        ajuste.tipo = data.tipo

        session.commit()
        session.refresh(ajuste)
        return _serializar_ajuste(ajuste)
    except HTTPException:
        session.rollback()
        raise
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=f"Error al actualizar ajuste: {str(e)}")
    finally:
        session.close()


@router.delete("/ajustes/{ajuste_id:int}")
def eliminar_ajuste_venta(
    ajuste_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("ventas.ajustar", "ventas")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        ajuste = session.query(AjusteVenta).filter(AjusteVenta.id == ajuste_id).first()
        if not ajuste:
            raise HTTPException(status_code=404, detail="Ajuste no encontrado.")
        venta = ajuste.venta_rel
        if not venta:
            raise HTTPException(status_code=404, detail="La venta asociada no existe.")

        venta.total = float((venta.total or 0.0) + (ajuste.monto or 0.0))
        venta.saldo = float((venta.saldo or 0.0) + (ajuste.monto or 0.0))
        _actualizar_estado_venta_por_saldo(venta)

        session.delete(ajuste)
        session.commit()
        return {"ok": True, "mensaje": "Ajuste eliminado exitosamente."}
    except HTTPException:
        session.rollback()
        raise
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=f"Error al eliminar ajuste: {str(e)}")
    finally:
        session.close()


def _registrar_comision_tarjeta_grupal(session, banco_id: int, monto_total: float, grupo_id: str):
    """Versión grupal de la comisión de tarjeta."""
    from app.models.models import GastoOperativo, CategoriaGasto, ConfiguracionEmpresa
    config = session.query(ConfiguracionEmpresa).first()
    pct: float = config.porcentaje_comision_tarjeta or 0.0
    if pct <= 0:
        return
    
    monto_comision = round(float(monto_total * pct / 100.0), 2)
    if monto_comision <= 0:
        return

    cat = session.query(CategoriaGasto).filter(CategoriaGasto.nombre.ilike("%comision%bancaria%")).first()
    if not cat: return

    gasto = GastoOperativo(
        fecha=datetime.now(),
        categoria_id=cat.id,
        monto=monto_comision,
        concepto=f"Comisión tarjeta {pct}% - Cobro Grupal",
        metodo_pago="TARJETA",
        banco_id=banco_id,
    )
    session.add(gasto)
    session.flush()

    mov = _registrar_en_banco(
        session, banco_id, monto_comision,
        concepto=f"Comisión tarjeta {pct}% - Cobro Grupal",
        tipo="EGRESO",
        pago_venta_id=None,
        grupo_pago_id=grupo_id
    )
    gasto.movimiento_banco_id = mov.id





