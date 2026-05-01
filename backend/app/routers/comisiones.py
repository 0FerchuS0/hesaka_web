from datetime import date, datetime, time
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import selectinload

from app.database import get_session_for_tenant
from app.middleware.tenant import get_tenant_slug
from app.models.models import Banco, Comision, ConfiguracionCaja, MovimientoBanco, MovimientoCaja, Venta
from app.schemas.schemas import ComisionOut, ComisionPagoCreate
from app.utils.auth import get_current_user, require_roles
from app.utils.jornada import ahora_negocio, require_jornada_abierta

router = APIRouter(prefix="/api/comisiones", tags=["Comisiones"])


def _query_comision_detallada(session, comision_id: int):
    return (
        session.query(Comision)
        .options(
            selectinload(Comision.referidor_rel),
            selectinload(Comision.venta_rel).selectinload(Venta.cliente_rel),
        )
        .filter(Comision.id == comision_id)
        .first()
    )


def _serializar_comision(comision: Comision) -> ComisionOut:
    venta = comision.venta_rel
    cliente = venta.cliente_rel if venta else None
    return ComisionOut(
        id=comision.id,
        fecha=comision.fecha,
        referidor_id=comision.referidor_id,
        referidor_nombre=comision.referidor_rel.nombre if comision.referidor_rel else None,
        venta_id=comision.venta_id,
        venta_codigo=venta.codigo if venta else None,
        cliente_nombre=cliente.nombre if cliente else None,
        descripcion=comision.descripcion,
        monto=float(comision.monto or 0),
        estado=comision.estado or "PENDIENTE",
        movimiento_banco_id=comision.movimiento_banco_id,
        movimiento_caja_id=comision.movimiento_caja_id,
    )


def _obtener_o_crear_caja(session):
    caja = session.query(ConfiguracionCaja).first()
    if not caja:
        caja = ConfiguracionCaja(id=1, saldo_actual=0.0)
        session.add(caja)
        session.flush()
    return caja


def _revertir_movimientos_comision(session, comision: Comision):
    require_jornada_abierta(session)
    movimiento_banco_id = comision.movimiento_banco_id
    movimiento_caja_id = comision.movimiento_caja_id

    # Primero desvinculamos la comision para evitar conflictos de FK al borrar movimientos.
    comision.movimiento_banco_id = None
    comision.movimiento_caja_id = None
    session.flush()

    if movimiento_banco_id:
        movimiento_banco = session.query(MovimientoBanco).filter(MovimientoBanco.id == movimiento_banco_id).first()
        if movimiento_banco:
            banco = session.query(Banco).filter(Banco.id == movimiento_banco.banco_id).first()
            if banco:
                if movimiento_banco.tipo == "EGRESO":
                    banco.saldo_actual += movimiento_banco.monto
                else:
                    banco.saldo_actual -= movimiento_banco.monto
            session.delete(movimiento_banco)

    if movimiento_caja_id:
        movimiento_caja = session.query(MovimientoCaja).filter(MovimientoCaja.id == movimiento_caja_id).first()
        if movimiento_caja:
            caja = _obtener_o_crear_caja(session)
            if movimiento_caja.tipo == "EGRESO":
                caja.saldo_actual += movimiento_caja.monto
            else:
                caja.saldo_actual -= movimiento_caja.monto
            session.delete(movimiento_caja)


@router.get("/", response_model=List[ComisionOut])
def listar_comisiones(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
    fecha_desde: Optional[date] = Query(None),
    fecha_hasta: Optional[date] = Query(None),
    referidor_id: Optional[int] = Query(None),
    estado: Optional[str] = Query(None),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        query = (
            session.query(Comision)
            .options(
                selectinload(Comision.referidor_rel),
                selectinload(Comision.venta_rel).selectinload(Venta.cliente_rel),
            )
        )

        if fecha_desde:
            query = query.filter(Comision.fecha >= datetime.combine(fecha_desde, time.min))
        if fecha_hasta:
            query = query.filter(Comision.fecha <= datetime.combine(fecha_hasta, time.max))
        if referidor_id:
            query = query.filter(Comision.referidor_id == referidor_id)
        if estado:
            query = query.filter(Comision.estado == estado.upper())

        comisiones = query.order_by(Comision.fecha.desc(), Comision.id.desc()).all()
        return [_serializar_comision(comision) for comision in comisiones]
    finally:
        session.close()


@router.get("/{comision_id}", response_model=ComisionOut)
def obtener_comision(
    comision_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        comision = _query_comision_detallada(session, comision_id)
        if not comision:
            raise HTTPException(status_code=404, detail="Comision no encontrada.")
        return _serializar_comision(comision)
    finally:
        session.close()


@router.post("/{comision_id}/pagar", response_model=ComisionOut)
def pagar_comision(
    comision_id: int,
    data: ComisionPagoCreate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_roles("ADMIN", "CAJERO")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        comision = _query_comision_detallada(session, comision_id)
        if not comision:
            raise HTTPException(status_code=404, detail="Comision no encontrada.")
        if (comision.estado or "PENDIENTE") == "PAGADO":
            raise HTTPException(status_code=422, detail="La comision ya esta pagada.")

        jornada = require_jornada_abierta(session)
        if data.fecha_pago:
            fecha_mov = datetime.combine(data.fecha_pago, datetime.now().time()).replace(microsecond=0)
        else:
            fecha_mov = ahora_negocio(session)

        metodo_pago = data.metodo_pago
        banco = None
        if metodo_pago in {"TRANSFERENCIA", "CHEQUE"}:
            if not data.banco_id:
                raise HTTPException(status_code=422, detail="Debe seleccionar un banco.")
            if not data.numero_referencia:
                raise HTTPException(status_code=422, detail="Debe ingresar el numero de transferencia/cheque.")
            banco = session.query(Banco).filter(Banco.id == data.banco_id).first()
            if not banco:
                raise HTTPException(status_code=404, detail="Banco no encontrado.")

        comision.estado = "PAGADO"
        if comision.venta_rel:
            comision.venta_rel.comision_pagada = True

        referidor = comision.referidor_rel.nombre if comision.referidor_rel else "REFERIDOR"
        venta_codigo = comision.venta_rel.codigo if comision.venta_rel else "S/N"

        if metodo_pago == "EFECTIVO":
            caja = _obtener_o_crear_caja(session)
            saldo_anterior = caja.saldo_actual or 0.0
            caja.saldo_actual = saldo_anterior - float(comision.monto or 0)
            movimiento = MovimientoCaja(
                fecha=fecha_mov,
                tipo="EGRESO",
                monto=float(comision.monto or 0),
                concepto=f"PAGO COMISION - {referidor} (Venta: {venta_codigo})",
                saldo_anterior=saldo_anterior,
                saldo_nuevo=caja.saldo_actual,
                jornada_id=jornada.id,
            )
            session.add(movimiento)
            session.flush()
            comision.movimiento_caja_id = movimiento.id
        else:
            saldo_anterior = banco.saldo_actual or 0.0
            banco.saldo_actual = saldo_anterior - float(comision.monto or 0)
            movimiento = MovimientoBanco(
                banco_id=banco.id,
                fecha=fecha_mov,
                tipo="EGRESO",
                monto=float(comision.monto or 0),
                concepto=f"PAGO COMISION - {referidor} - {metodo_pago} {data.numero_referencia or ''}".strip(),
                saldo_anterior=saldo_anterior,
                saldo_nuevo=banco.saldo_actual,
                jornada_id=jornada.id,
            )
            session.add(movimiento)
            session.flush()
            comision.movimiento_banco_id = movimiento.id

        session.commit()
        session.refresh(comision)
        return _serializar_comision(comision)
    except HTTPException:
        session.rollback()
        raise
    finally:
        session.close()


@router.post("/{comision_id}/pendiente", response_model=ComisionOut)
def volver_comision_pendiente(
    comision_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_roles("ADMIN", "CAJERO")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        comision = _query_comision_detallada(session, comision_id)
        if not comision:
            raise HTTPException(status_code=404, detail="Comision no encontrada.")

        comision.estado = "PENDIENTE"
        if comision.venta_rel:
            comision.venta_rel.comision_pagada = False

        _revertir_movimientos_comision(session, comision)

        session.commit()
        session.refresh(comision)
        return _serializar_comision(comision)
    except HTTPException:
        session.rollback()
        raise
    finally:
        session.close()
