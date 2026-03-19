"""HESAKA Web - Router: Caja, Bancos y Gastos"""
from datetime import date, datetime, time
from uuid import uuid4
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.database import get_session_for_tenant
from app.middleware.tenant import get_tenant_slug
from app.models.models import Banco, CategoriaGasto, ConfiguracionCaja, GastoOperativo, MovimientoBanco, MovimientoCaja
from app.schemas.schemas import (
    BancoCreate,
    BancoOut,
    CategoriaGastoCreate,
    CategoriaGastoOut,
    GastoCreate,
    GastoOut,
    MovimientoBancoOut,
    MovimientoCajaOut,
    TransferenciaInternaCreate,
    TransferenciaInternaHistorialOut,
    TransferenciaInternaOut,
)
from app.utils.auth import get_current_user

caja_router = APIRouter(prefix="/api/caja", tags=["Caja"])
banco_router = APIRouter(prefix="/api/bancos", tags=["Bancos"])
gasto_router = APIRouter(prefix="/api/gastos", tags=["Gastos"])


def _build_gasto_out(gasto: GastoOperativo) -> GastoOut:
    gasto_out = GastoOut.model_validate(gasto)
    gasto_out.categoria_nombre = gasto.categoria_rel.nombre if gasto.categoria_rel else None
    gasto_out.banco_nombre = gasto.banco_rel.nombre_banco if gasto.banco_rel else None
    return gasto_out


def _obtener_o_crear_caja(session):
    caja = session.query(ConfiguracionCaja).first()
    if not caja:
        caja = ConfiguracionCaja(id=1, saldo_actual=0.0)
        session.add(caja)
        session.flush()
    return caja


def _revertir_impacto_gasto(session, gasto: GastoOperativo):
    if gasto.movimiento_caja_id:
        movimiento = session.query(MovimientoCaja).filter(MovimientoCaja.id == gasto.movimiento_caja_id).first()
        caja = session.query(ConfiguracionCaja).first()
        if movimiento and caja:
            caja.saldo_actual += gasto.monto
            session.delete(movimiento)
        gasto.movimiento_caja_id = None

    if gasto.movimiento_banco_id:
        movimiento_banco = session.query(MovimientoBanco).filter(MovimientoBanco.id == gasto.movimiento_banco_id).first()
        banco = session.query(Banco).filter(Banco.id == gasto.banco_id).first() if gasto.banco_id else None
        if movimiento_banco and banco:
            banco.saldo_actual += gasto.monto
            session.delete(movimiento_banco)
        gasto.movimiento_banco_id = None


def _aplicar_impacto_gasto(session, gasto: GastoOperativo, categoria: CategoriaGasto):
    if gasto.metodo_pago == "EFECTIVO":
        caja = session.query(ConfiguracionCaja).first()
        if not caja:
            caja = ConfiguracionCaja(id=1, saldo_actual=0.0)
            session.add(caja)
            session.flush()

        saldo_ant = caja.saldo_actual
        caja.saldo_actual -= gasto.monto
        movimiento = MovimientoCaja(
            tipo="GASTO",
            monto=gasto.monto,
            concepto=f"Gasto: {categoria.nombre} - {gasto.concepto}",
            saldo_anterior=saldo_ant,
            saldo_nuevo=caja.saldo_actual,
            gasto_operativo_id=gasto.id,
        )
        session.add(movimiento)
        session.flush()
        gasto.movimiento_caja_id = movimiento.id
        gasto.movimiento_banco_id = None
        return

    banco = session.query(Banco).filter(Banco.id == gasto.banco_id).first() if gasto.banco_id else None
    if not banco:
        raise HTTPException(status_code=404, detail="Banco no encontrado.")

    saldo_ant = banco.saldo_actual
    banco.saldo_actual -= gasto.monto
    movimiento = MovimientoBanco(
        banco_id=banco.id,
        fecha=gasto.fecha,
        tipo="EGRESO",
        monto=gasto.monto,
        concepto=f"Gasto: {gasto.concepto}",
        saldo_anterior=saldo_ant,
        saldo_nuevo=banco.saldo_actual,
        gasto_operativo_id=gasto.id,
    )
    session.add(movimiento)
    session.flush()
    gasto.movimiento_banco_id = movimiento.id
    gasto.movimiento_caja_id = None


def _normalizar_concepto_transferencia(concepto: Optional[str]) -> Optional[str]:
    if not concepto:
        return None
    marker = " - "
    return concepto.split(marker, 1)[1] if marker in concepto else concepto


@caja_router.get("/saldo")
def saldo_caja(tenant_slug: str = Depends(get_tenant_slug), current_user=Depends(get_current_user)):
    session = get_session_for_tenant(tenant_slug)
    try:
        caja = session.query(ConfiguracionCaja).first()
        return {"saldo_actual": caja.saldo_actual if caja else 0.0}
    finally:
        session.close()


@caja_router.get("/movimientos", response_model=List[MovimientoCajaOut])
def movimientos_caja(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
    skip: int = 0,
    limit: int = 100,
):
    session = get_session_for_tenant(tenant_slug)
    try:
        return session.query(MovimientoCaja).order_by(MovimientoCaja.fecha.desc()).offset(skip).limit(limit).all()
    finally:
        session.close()


@caja_router.post("/ajuste")
def ajustar_caja(
    monto: float,
    concepto: str,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        caja = session.query(ConfiguracionCaja).first()
        if not caja:
            caja = ConfiguracionCaja(id=1, saldo_actual=0.0)
            session.add(caja)
            session.flush()

        saldo_ant = caja.saldo_actual
        caja.saldo_actual += monto
        movimiento = MovimientoCaja(
            tipo="AJUSTE",
            monto=monto,
            concepto=concepto,
            saldo_anterior=saldo_ant,
            saldo_nuevo=caja.saldo_actual,
        )
        session.add(movimiento)
        session.commit()
        return {"ok": True, "saldo_nuevo": caja.saldo_actual}
    finally:
        session.close()


@banco_router.get("/", response_model=List[BancoOut])
def listar_bancos(tenant_slug: str = Depends(get_tenant_slug), current_user=Depends(get_current_user)):
    session = get_session_for_tenant(tenant_slug)
    try:
        return session.query(Banco).order_by(Banco.nombre_banco).all()
    finally:
        session.close()


@banco_router.post("/", response_model=BancoOut)
def crear_banco(data: BancoCreate, tenant_slug: str = Depends(get_tenant_slug), current_user=Depends(get_current_user)):
    session = get_session_for_tenant(tenant_slug)
    try:
        banco = Banco(**data.model_dump())
        session.add(banco)
        session.commit()
        session.refresh(banco)
        return banco
    finally:
        session.close()


@banco_router.put("/{banco_id}", response_model=BancoOut)
def editar_banco(
    banco_id: int,
    data: BancoCreate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        banco = session.query(Banco).filter(Banco.id == banco_id).first()
        if not banco:
            raise HTTPException(status_code=404, detail="Banco no encontrado.")

        for key, value in data.model_dump().items():
            setattr(banco, key, value)

        session.commit()
        session.refresh(banco)
        return banco
    finally:
        session.close()


@banco_router.delete("/{banco_id}")
def eliminar_banco(
    banco_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        banco = session.query(Banco).filter(Banco.id == banco_id).first()
        if not banco:
            raise HTTPException(status_code=404, detail="Banco no encontrado.")

        tiene_movimientos = session.query(MovimientoBanco).filter(MovimientoBanco.banco_id == banco_id).first()
        if tiene_movimientos:
            raise HTTPException(status_code=409, detail="No se puede eliminar una cuenta bancaria que ya tiene movimientos asociados.")

        session.delete(banco)
        session.commit()
        return {"ok": True, "mensaje": "Cuenta bancaria eliminada exitosamente."}
    finally:
        session.close()


@banco_router.get("/{banco_id}/movimientos", response_model=List[MovimientoBancoOut])
def movimientos_banco(
    banco_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
    skip: int = 0,
    limit: int = 100,
):
    session = get_session_for_tenant(tenant_slug)
    try:
        banco = session.query(Banco).filter(Banco.id == banco_id).first()
        if not banco:
            raise HTTPException(status_code=404, detail="Banco no encontrado.")
        return (
            session.query(MovimientoBanco)
            .filter(MovimientoBanco.banco_id == banco_id)
            .order_by(MovimientoBanco.fecha.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )
    finally:
        session.close()


@banco_router.post("/transferencias-internas", response_model=TransferenciaInternaOut)
def registrar_transferencia_interna(
    data: TransferenciaInternaCreate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        if data.origen_tipo == data.destino_tipo == "CAJA":
            raise HTTPException(status_code=422, detail="Una transferencia de caja a caja no tiene efecto.")
        if data.origen_tipo == data.destino_tipo == "BANCO" and data.banco_origen_id == data.banco_destino_id:
            raise HTTPException(status_code=422, detail="Debes elegir cuentas bancarias distintas para transferir entre bancos.")

        monto = float(data.monto or 0)
        if monto <= 0:
            raise HTTPException(status_code=422, detail="El monto de la transferencia debe ser mayor a cero.")

        concepto = data.concepto or "TRANSFERENCIA INTERNA"
        transferencia_id = f"TRF-{uuid4().hex[:10].upper()}"

        caja = _obtener_o_crear_caja(session)
        banco_origen = session.query(Banco).filter(Banco.id == data.banco_origen_id).first() if data.banco_origen_id else None
        banco_destino = session.query(Banco).filter(Banco.id == data.banco_destino_id).first() if data.banco_destino_id else None

        if data.origen_tipo == "BANCO" and not banco_origen:
            raise HTTPException(status_code=404, detail="Banco origen no encontrado.")
        if data.destino_tipo == "BANCO" and not banco_destino:
            raise HTTPException(status_code=404, detail="Banco destino no encontrado.")

        if data.origen_tipo == "CAJA":
            if (caja.saldo_actual or 0) < monto:
                raise HTTPException(status_code=422, detail="La caja no tiene saldo suficiente para esta transferencia.")
        elif (banco_origen.saldo_actual or 0) < monto:
            raise HTTPException(status_code=422, detail="La cuenta bancaria origen no tiene saldo suficiente para esta transferencia.")

        movimiento_banco_referencia = None

        if data.origen_tipo == "CAJA":
            saldo_anterior_caja = caja.saldo_actual or 0.0
            caja.saldo_actual = saldo_anterior_caja - monto
            movimiento_caja = MovimientoCaja(
                fecha=datetime.now(),
                tipo="EGRESO",
                monto=monto,
                concepto=f"Transferencia interna a {(banco_destino.nombre_banco if banco_destino else 'BANCO')} - {concepto}",
                saldo_anterior=saldo_anterior_caja,
                saldo_nuevo=caja.saldo_actual,
            )
            session.add(movimiento_caja)
            session.flush()
        else:
            saldo_anterior_origen = banco_origen.saldo_actual or 0.0
            banco_origen.saldo_actual = saldo_anterior_origen - monto
            movimiento_banco_origen = MovimientoBanco(
                banco_id=banco_origen.id,
                fecha=datetime.now(),
                tipo="EGRESO",
                monto=monto,
                concepto=f"Transferencia interna a {('CAJA' if data.destino_tipo == 'CAJA' else banco_destino.nombre_banco)} - {concepto}",
                saldo_anterior=saldo_anterior_origen,
                saldo_nuevo=banco_origen.saldo_actual,
                grupo_pago_id=transferencia_id,
            )
            session.add(movimiento_banco_origen)
            session.flush()
            movimiento_banco_referencia = movimiento_banco_origen

        if data.destino_tipo == "CAJA":
            saldo_anterior_caja = caja.saldo_actual or 0.0
            caja.saldo_actual = saldo_anterior_caja + monto
            movimiento_caja_destino = MovimientoCaja(
                fecha=datetime.now(),
                tipo="INGRESO",
                monto=monto,
                concepto=f"Transferencia interna desde {(banco_origen.nombre_banco if banco_origen else 'CAJA')} - {concepto}",
                saldo_anterior=saldo_anterior_caja,
                saldo_nuevo=caja.saldo_actual,
                deposito_banco_id=movimiento_banco_referencia.id if movimiento_banco_referencia else None,
            )
            session.add(movimiento_caja_destino)
        else:
            saldo_anterior_destino = banco_destino.saldo_actual or 0.0
            banco_destino.saldo_actual = saldo_anterior_destino + monto
            movimiento_banco_destino = MovimientoBanco(
                banco_id=banco_destino.id,
                fecha=datetime.now(),
                tipo="INGRESO",
                monto=monto,
                concepto=f"Transferencia interna desde {('CAJA' if data.origen_tipo == 'CAJA' else banco_origen.nombre_banco)} - {concepto}",
                saldo_anterior=saldo_anterior_destino,
                saldo_nuevo=banco_destino.saldo_actual,
                grupo_pago_id=transferencia_id,
            )
            session.add(movimiento_banco_destino)
            session.flush()
            if data.origen_tipo == "CAJA":
                movimiento_caja.deposito_banco_id = movimiento_banco_destino.id

        session.commit()
        return TransferenciaInternaOut(
            transferencia_id=transferencia_id,
            origen_tipo=data.origen_tipo,
            destino_tipo=data.destino_tipo,
            monto=monto,
            concepto=concepto,
        )
    except HTTPException:
        session.rollback()
        raise
    finally:
        session.close()


@banco_router.get("/transferencias-internas/historial", response_model=List[TransferenciaInternaHistorialOut])
def historial_transferencias_internas(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
    fecha_desde: Optional[date] = Query(None),
    fecha_hasta: Optional[date] = Query(None),
    origen_tipo: Optional[str] = Query(None),
    destino_tipo: Optional[str] = Query(None),
    buscar: Optional[str] = Query(None),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        query_bancos = session.query(MovimientoBanco).filter(MovimientoBanco.grupo_pago_id.like("TRF-%"))
        if fecha_desde:
            query_bancos = query_bancos.filter(MovimientoBanco.fecha >= datetime.combine(fecha_desde, time.min))
        if fecha_hasta:
            query_bancos = query_bancos.filter(MovimientoBanco.fecha <= datetime.combine(fecha_hasta, time.max))

        movimientos_banco = query_bancos.order_by(MovimientoBanco.fecha.desc(), MovimientoBanco.id.desc()).all()
        if not movimientos_banco:
            return []

        ids_banco = [mov.id for mov in movimientos_banco]
        movimientos_caja_rel = (
            session.query(MovimientoCaja)
            .filter(MovimientoCaja.deposito_banco_id.in_(ids_banco))
            .all()
        )
        caja_por_deposito = {mov.deposito_banco_id: mov for mov in movimientos_caja_rel if mov.deposito_banco_id}

        grupos: dict[str, list[MovimientoBanco]] = {}
        for mov in movimientos_banco:
            grupos.setdefault(mov.grupo_pago_id, []).append(mov)

        buscar_norm = (buscar or "").strip().upper()
        historial: List[TransferenciaInternaHistorialOut] = []

        for transferencia_id, movimientos in grupos.items():
            ingreso_banco = next((mov for mov in movimientos if mov.tipo == "INGRESO"), None)
            egreso_banco = next((mov for mov in movimientos if mov.tipo == "EGRESO"), None)

            caja_desde = caja_por_deposito.get(ingreso_banco.id) if ingreso_banco else None
            caja_hacia = caja_por_deposito.get(egreso_banco.id) if egreso_banco else None

            if egreso_banco and ingreso_banco:
                origen_tipo_res = "BANCO"
                destino_tipo_res = "BANCO"
                origen_label = egreso_banco.banco_rel.nombre_banco if egreso_banco.banco_rel else "BANCO"
                destino_label = ingreso_banco.banco_rel.nombre_banco if ingreso_banco.banco_rel else "BANCO"
                banco_origen_id = egreso_banco.banco_id
                banco_destino_id = ingreso_banco.banco_id
                fecha = max(egreso_banco.fecha, ingreso_banco.fecha)
                monto = abs(egreso_banco.monto or 0)
                concepto_res = _normalizar_concepto_transferencia(egreso_banco.concepto or ingreso_banco.concepto)
                conciliada = True
                movimientos_detectados = 2
            elif ingreso_banco and caja_desde:
                origen_tipo_res = "CAJA"
                destino_tipo_res = "BANCO"
                origen_label = "CAJA"
                destino_label = ingreso_banco.banco_rel.nombre_banco if ingreso_banco.banco_rel else "BANCO"
                banco_origen_id = None
                banco_destino_id = ingreso_banco.banco_id
                fecha = max(ingreso_banco.fecha, caja_desde.fecha)
                monto = abs(ingreso_banco.monto or 0)
                concepto_res = _normalizar_concepto_transferencia(ingreso_banco.concepto)
                conciliada = True
                movimientos_detectados = 2
            elif egreso_banco and caja_hacia:
                origen_tipo_res = "BANCO"
                destino_tipo_res = "CAJA"
                origen_label = egreso_banco.banco_rel.nombre_banco if egreso_banco.banco_rel else "BANCO"
                destino_label = "CAJA"
                banco_origen_id = egreso_banco.banco_id
                banco_destino_id = None
                fecha = max(egreso_banco.fecha, caja_hacia.fecha)
                monto = abs(egreso_banco.monto or 0)
                concepto_res = _normalizar_concepto_transferencia(egreso_banco.concepto)
                conciliada = True
                movimientos_detectados = 2
            else:
                movimiento_base = ingreso_banco or egreso_banco
                if not movimiento_base:
                    continue
                origen_tipo_res = "BANCO" if egreso_banco else "CAJA"
                destino_tipo_res = "BANCO" if ingreso_banco else "CAJA"
                origen_label = egreso_banco.banco_rel.nombre_banco if egreso_banco and egreso_banco.banco_rel else origen_tipo_res
                destino_label = ingreso_banco.banco_rel.nombre_banco if ingreso_banco and ingreso_banco.banco_rel else destino_tipo_res
                banco_origen_id = egreso_banco.banco_id if egreso_banco else None
                banco_destino_id = ingreso_banco.banco_id if ingreso_banco else None
                fecha = movimiento_base.fecha
                monto = abs(movimiento_base.monto or 0)
                concepto_res = _normalizar_concepto_transferencia(movimiento_base.concepto)
                conciliada = False
                movimientos_detectados = len(movimientos)

            if origen_tipo and origen_tipo_res != origen_tipo.upper():
                continue
            if destino_tipo and destino_tipo_res != destino_tipo.upper():
                continue

            if buscar_norm:
                banco_origen_nombre = origen_label.upper()
                banco_destino_nombre = destino_label.upper()
                concepto_norm = (concepto_res or "").upper()
                transferencia_norm = transferencia_id.upper()
                if buscar_norm not in banco_origen_nombre and buscar_norm not in banco_destino_nombre and buscar_norm not in concepto_norm and buscar_norm not in transferencia_norm:
                    continue

            historial.append(TransferenciaInternaHistorialOut(
                transferencia_id=transferencia_id,
                fecha=fecha,
                origen_tipo=origen_tipo_res,
                destino_tipo=destino_tipo_res,
                origen_label=origen_label,
                destino_label=destino_label,
                banco_origen_id=banco_origen_id,
                banco_destino_id=banco_destino_id,
                monto=monto,
                concepto=concepto_res,
                conciliada=conciliada,
                movimientos_detectados=movimientos_detectados,
            ))

        historial.sort(key=lambda item: (item.fecha, item.transferencia_id), reverse=True)
        return historial
    finally:
        session.close()


@gasto_router.get("/categorias", response_model=List[CategoriaGastoOut])
def listar_categorias_gasto(tenant_slug: str = Depends(get_tenant_slug), current_user=Depends(get_current_user)):
    session = get_session_for_tenant(tenant_slug)
    try:
        return session.query(CategoriaGasto).order_by(CategoriaGasto.nombre).all()
    finally:
        session.close()


@gasto_router.post("/categorias", response_model=CategoriaGastoOut)
def crear_categoria_gasto(
    data: CategoriaGastoCreate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        if data.categoria_padre_id is not None:
            categoria_padre = session.query(CategoriaGasto).filter(CategoriaGasto.id == data.categoria_padre_id).first()
            if not categoria_padre:
                raise HTTPException(status_code=404, detail="Categoria padre no encontrada.")

        categoria = CategoriaGasto(**data.model_dump())
        session.add(categoria)
        session.commit()
        session.refresh(categoria)
        return categoria
    except HTTPException:
        session.rollback()
        raise
    finally:
        session.close()


@gasto_router.put("/categorias/{categoria_id}", response_model=CategoriaGastoOut)
def editar_categoria_gasto(
    categoria_id: int,
    data: CategoriaGastoCreate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        categoria = session.query(CategoriaGasto).filter(CategoriaGasto.id == categoria_id).first()
        if not categoria:
            raise HTTPException(status_code=404, detail="Categoria de gasto no encontrada.")

        if data.categoria_padre_id is not None:
            if data.categoria_padre_id == categoria_id:
                raise HTTPException(status_code=422, detail="Una categoria no puede ser subcategoria de si misma.")

            categoria_padre = session.query(CategoriaGasto).filter(CategoriaGasto.id == data.categoria_padre_id).first()
            if not categoria_padre:
                raise HTTPException(status_code=404, detail="Categoria padre no encontrada.")

            padre_temp = categoria_padre
            while padre_temp:
                if padre_temp.id == categoria_id:
                    raise HTTPException(status_code=422, detail="La relacion padre/hijo generaria una referencia circular.")
                padre_temp = padre_temp.categoria_padre

        payload = data.model_dump()
        for key, value in payload.items():
            setattr(categoria, key, value)

        session.commit()
        session.refresh(categoria)
        return categoria
    except HTTPException:
        session.rollback()
        raise
    finally:
        session.close()


@gasto_router.delete("/categorias/{categoria_id}")
def eliminar_categoria_gasto(
    categoria_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        categoria = session.query(CategoriaGasto).filter(CategoriaGasto.id == categoria_id).first()
        if not categoria:
            raise HTTPException(status_code=404, detail="Categoria de gasto no encontrada.")

        tiene_subcategorias = session.query(CategoriaGasto).filter(CategoriaGasto.categoria_padre_id == categoria_id).first()
        if tiene_subcategorias:
            raise HTTPException(status_code=409, detail="No se puede eliminar una categoria que tiene subcategorias.")

        tiene_gastos = session.query(GastoOperativo).filter(GastoOperativo.categoria_id == categoria_id).first()
        if tiene_gastos:
            raise HTTPException(status_code=409, detail="No se puede eliminar la categoria porque tiene gastos asociados.")

        session.delete(categoria)
        session.commit()
        return {"ok": True, "mensaje": "Categoria de gasto eliminada exitosamente."}
    except HTTPException:
        session.rollback()
        raise
    finally:
        session.close()


@gasto_router.get("/", response_model=List[GastoOut])
def listar_gastos(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
    skip: int = 0,
    limit: int = 100,
    categoria_id: Optional[int] = Query(None),
    fecha_desde: Optional[date] = Query(None),
    fecha_hasta: Optional[date] = Query(None),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        query = session.query(GastoOperativo)
        if categoria_id:
            query = query.filter(GastoOperativo.categoria_id == categoria_id)
        if fecha_desde:
            query = query.filter(GastoOperativo.fecha >= datetime.combine(fecha_desde, time.min))
        if fecha_hasta:
            query = query.filter(GastoOperativo.fecha <= datetime.combine(fecha_hasta, time.max))

        gastos = query.order_by(GastoOperativo.fecha.desc()).offset(skip).limit(limit).all()
        return [_build_gasto_out(gasto) for gasto in gastos]
    finally:
        session.close()


@gasto_router.post("/", response_model=GastoOut)
def registrar_gasto(
    data: GastoCreate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        categoria = session.query(CategoriaGasto).filter(CategoriaGasto.id == data.categoria_id).first()
        if not categoria:
            raise HTTPException(status_code=404, detail="Categoria de gasto no encontrada.")

        banco = None
        if data.metodo_pago != "EFECTIVO":
            if not data.banco_id:
                raise HTTPException(status_code=422, detail="Debe seleccionar un banco para ese metodo de pago.")
            banco = session.query(Banco).filter(Banco.id == data.banco_id).first()
            if not banco:
                raise HTTPException(status_code=404, detail="Banco no encontrado.")

        payload = data.model_dump()
        payload["fecha"] = payload["fecha"] or datetime.now()
        gasto = GastoOperativo(**payload)
        session.add(gasto)
        session.flush()
        _aplicar_impacto_gasto(session, gasto, categoria)

        session.commit()
        session.refresh(gasto)
        return _build_gasto_out(gasto)
    except HTTPException:
        session.rollback()
        raise
    finally:
        session.close()


@gasto_router.put("/{gasto_id}", response_model=GastoOut)
def editar_gasto(
    gasto_id: int,
    data: GastoCreate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        gasto = session.query(GastoOperativo).filter(GastoOperativo.id == gasto_id).first()
        if not gasto:
            raise HTTPException(status_code=404, detail="Gasto no encontrado.")

        categoria = session.query(CategoriaGasto).filter(CategoriaGasto.id == data.categoria_id).first()
        if not categoria:
            raise HTTPException(status_code=404, detail="Categoria de gasto no encontrada.")

        if data.metodo_pago != "EFECTIVO":
            if not data.banco_id:
                raise HTTPException(status_code=422, detail="Debe seleccionar un banco para ese metodo de pago.")
            banco = session.query(Banco).filter(Banco.id == data.banco_id).first()
            if not banco:
                raise HTTPException(status_code=404, detail="Banco no encontrado.")

        _revertir_impacto_gasto(session, gasto)

        payload = data.model_dump()
        payload["fecha"] = payload["fecha"] or gasto.fecha or datetime.now()
        for key, value in payload.items():
            setattr(gasto, key, value)

        _aplicar_impacto_gasto(session, gasto, categoria)

        session.commit()
        session.refresh(gasto)
        return _build_gasto_out(gasto)
    except HTTPException:
        session.rollback()
        raise
    finally:
        session.close()


@gasto_router.delete("/{gasto_id}")
def eliminar_gasto(
    gasto_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        gasto = session.query(GastoOperativo).filter(GastoOperativo.id == gasto_id).first()
        if not gasto:
            raise HTTPException(status_code=404, detail="Gasto no encontrado.")

        _revertir_impacto_gasto(session, gasto)

        session.delete(gasto)
        session.commit()
        return {"ok": True, "mensaje": "Gasto eliminado exitosamente."}
    except HTTPException:
        session.rollback()
        raise
    finally:
        session.close()
