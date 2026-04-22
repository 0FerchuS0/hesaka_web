"""HESAKA Web - Router: Caja, Bancos y Gastos"""
from datetime import date, datetime, time
from uuid import uuid4
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, func, or_

from app.database import get_session_for_tenant
from app.middleware.tenant import get_tenant_slug
from app.models.models import (
    Banco,
    CategoriaGasto,
    ConfiguracionCaja,
    ConfiguracionEmpresa,
    CorteJornadaFinanciera,
    DestinatarioRendicion,
    GastoOperativo,
    JornadaFinanciera,
    MovimientoBanco,
    MovimientoCaja,
    RendicionJornadaFinanciera,
    Usuario,
)
from app.schemas.schemas import (
    BancoCreate,
    BancoOut,
    CorteJornadaOut,
    CategoriaGastoCreate,
    CategoriaGastoOut,
    DestinatarioRendicionCreate,
    DestinatarioRendicionOut,
    DestinatarioRendicionUpdate,
    GastoCreate,
    GastoOut,
    JornadaAperturaCreate,
    JornadaEstadoOut,
    JornadaPanelInicialOut,
    JornadaHistorialOut,
    MovimientosPosterioresUltimoCorteOut,
    PendienteRendicionOut,
    MovimientoBancoOut,
    MovimientoCajaOut,
    RendicionJornadaCreate,
    RendicionHistorialOut,
    RendicionHistorialListResponseOut,
    RendicionJornadaOut,
    RendicionJornadaUpdate,
    TransferenciaInternaCreate,
    TransferenciaInternaHistorialOut,
    TransferenciaInternaOut,
)
from app.utils.auth import get_current_user, require_action, require_admin
from app.utils.excel_rendicion_jornada import generar_excel_rendicion_jornada
from app.utils.excel_reporte_finanzas import generar_excel_reporte_finanzas
from app.utils.filename_utils import format_date_for_filename
from app.utils.jornada import (
    abrir_jornada_actual,
    cargar_movimientos_jornada_normalizados,
    construir_alerta_movimientos_posteriores,
    construir_cuentas_por_cobrar_dia,
    construir_detalle_ventas_jornada,
    construir_desglose_medios_rendicion,
    construir_desglose_por_medio,
    construir_resumen_corte,
    construir_filas_historial_jornadas,
    construir_resumen_jornada_desde_cache,
    construir_resumen_jornada_reporte,
    construir_resumen_rendicion,
    construir_pendiente_rendicion,
    crear_corte_jornada_actual,
    crear_rendicion_jornada_actual,
    actualizar_rendicion_jornada,
    obtener_movimientos_posteriores_ultimo_corte,
    obtener_ultima_rendicion_vigente,
    obtener_ultimo_corte_jornada,
    obtener_jornada_actual,
    hoy_jornada,
    require_jornada_abierta,
    serializar_movimiento_jornada,
    serializar_corte,
    serializar_cortes_jornada_lista,
    serializar_rendicion_historial,
    serializar_rendicion,
)
from app.utils.pdf_reporte_finanzas import generar_pdf_reporte_finanzas
from app.utils.pdf_rendicion_jornada import generar_pdf_rendicion_jornada

caja_router = APIRouter(prefix="/api/caja", tags=["Caja"])
banco_router = APIRouter(prefix="/api/bancos", tags=["Bancos"])
gasto_router = APIRouter(prefix="/api/gastos", tags=["Gastos"])


def _serializar_estado_jornada(session, *, movimientos_cache: list | None = None) -> JornadaEstadoOut:
    jornada = obtener_jornada_actual(session)
    if movimientos_cache is not None:
        all_movs = list(movimientos_cache)
    else:
        all_movs = cargar_movimientos_jornada_normalizados(session, jornada) if jornada else []
    ultimo_corte = obtener_ultimo_corte_jornada(session, jornada.id) if jornada else None
    ultima_rendicion = obtener_ultima_rendicion_vigente(session, jornada.id) if jornada else None

    resumen = construir_resumen_jornada_desde_cache(all_movs) if jornada else {
        "ingresos": 0.0,
        "egresos": 0.0,
        "neto": 0.0,
        "movimientos_caja": 0,
        "movimientos_banco": 0,
        "movimientos_total": 0,
    }

    ultimo_corte_out = None
    if ultimo_corte and jornada:
        sub_uc = [m for m in all_movs if m.instante_corte <= ultimo_corte.fecha_hora_corte]
        desglose_uc = construir_desglose_por_medio(sub_uc)
        tot_uc = construir_resumen_jornada_desde_cache(sub_uc)
        ultimo_corte_out = {
            "id": ultimo_corte.id,
            "jornada_id": ultimo_corte.jornada_id,
            "fecha": jornada.fecha,
            "fecha_hora_corte": ultimo_corte.fecha_hora_corte,
            "usuario_id": ultimo_corte.usuario_id,
            "usuario_nombre": ultimo_corte.usuario_nombre,
            "ingresos": float(tot_uc["ingresos"]),
            "egresos": float(tot_uc["egresos"]),
            "neto": float(tot_uc["neto"]),
            "movimientos_caja": int(tot_uc["movimientos_caja"]),
            "movimientos_banco": int(tot_uc["movimientos_banco"]),
            "movimientos_total": int(tot_uc["movimientos_total"]),
            "saldo_actual_caja": float(ultimo_corte.saldo_actual_caja or 0.0),
            "saldo_actual_bancos": float(ultimo_corte.saldo_actual_bancos or 0.0),
            "saldo_final_total": float(ultimo_corte.saldo_final_total or 0.0),
            "desglose_medios": desglose_uc,
            "es_ultimo": True,
        }

    desglose_ultima = (
        construir_desglose_medios_rendicion(session, ultima_rendicion, all_movs)
        if ultima_rendicion and jornada
        else None
    )
    ultima_rendicion_out = (
        serializar_rendicion(session, ultima_rendicion, desglose_medios=desglose_ultima)
        if ultima_rendicion
        else None
    )

    return JornadaEstadoOut(
        jornada_id=jornada.id if jornada else None,
        fecha=hoy_jornada(session),
        estado=jornada.estado if jornada else "SIN_ABRIR",
        abierta=bool(jornada and jornada.estado == "ABIERTA"),
        fecha_hora_apertura=jornada.fecha_hora_apertura if jornada else None,
        usuario_apertura_id=jornada.usuario_apertura_id if jornada else None,
        usuario_apertura_nombre=jornada.usuario_apertura_nombre if jornada else None,
        observacion_apertura=jornada.observacion_apertura if jornada else None,
        resumen=resumen,
        ultimo_corte=ultimo_corte_out,
        ultima_rendicion=ultima_rendicion_out,
        pendiente_rendicion=construir_pendiente_rendicion(
            session,
            jornada,
            movimientos_dia_cache=all_movs if jornada else None,
        ),
        cuentas_por_cobrar_dia=construir_cuentas_por_cobrar_dia(session, jornada),
        movimientos_detalle=[serializar_movimiento_jornada(mov) for mov in all_movs],
        ventas_detalle=construir_detalle_ventas_jornada(session, jornada, all_movs),
        alerta_movimientos_posteriores=construir_alerta_movimientos_posteriores(session),
    )


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
    require_jornada_abierta(session)
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
    jornada = require_jornada_abierta(session)
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
            jornada_id=jornada.id,
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
        jornada_id=jornada.id,
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


def _build_corte_filename(corte: CorteJornadaFinanciera, extension: str) -> str:
    fecha = format_date_for_filename(corte.fecha_hora_corte) or "sin_fecha"
    hora = corte.fecha_hora_corte.strftime("%H-%M") if corte.fecha_hora_corte else "sin_hora"
    return f"corte_jornada_{fecha}_{hora}.{extension}"


def _build_rendicion_filename(rendicion: RendicionJornadaFinanciera, extension: str) -> str:
    fecha = format_date_for_filename(rendicion.fecha_hora_rendicion) or "sin_fecha"
    hora = rendicion.fecha_hora_rendicion.strftime("%H-%M") if rendicion.fecha_hora_rendicion else "sin_hora"
    return f"rendicion_jornada_{fecha}_{hora}.{extension}"


def _build_jornada_filename(jornada: JornadaFinanciera, extension: str) -> str:
    fecha = format_date_for_filename(jornada.fecha) or "sin_fecha"
    return f"informe_jornada_{fecha}.{extension}"


@caja_router.get("/saldo")
def saldo_caja(tenant_slug: str = Depends(get_tenant_slug), current_user=Depends(get_current_user)):
    session = get_session_for_tenant(tenant_slug)
    try:
        caja = session.query(ConfiguracionCaja).first()
        return {"saldo_actual": caja.saldo_actual if caja else 0.0}
    finally:
        session.close()


@caja_router.get("/jornada/estado-actual", response_model=JornadaEstadoOut)
def obtener_estado_jornada_actual(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        return _serializar_estado_jornada(session)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}") from exc
    finally:
        session.close()


@caja_router.get("/jornada/panel-inicial", response_model=JornadaPanelInicialOut)
def obtener_panel_inicial_jornada(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    """Estado del día + cortes con una sola carga de movimientos (evita triplicar trabajo vs GETs en paralelo)."""
    session = get_session_for_tenant(tenant_slug)
    try:
        jornada = obtener_jornada_actual(session)
        if not jornada:
            estado = _serializar_estado_jornada(session, movimientos_cache=None)
            return JornadaPanelInicialOut(estado=estado, cortes=[])
        all_movs = cargar_movimientos_jornada_normalizados(session, jornada)
        estado = _serializar_estado_jornada(session, movimientos_cache=all_movs)
        cortes = (
            session.query(CorteJornadaFinanciera)
            .filter(CorteJornadaFinanciera.jornada_id == jornada.id)
            .order_by(CorteJornadaFinanciera.fecha_hora_corte.desc(), CorteJornadaFinanciera.id.desc())
            .limit(40)
            .all()
        )
        cortes_out = serializar_cortes_jornada_lista(session, jornada, cortes, movimientos_cache=all_movs)
        return JornadaPanelInicialOut(estado=estado, cortes=cortes_out)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}") from exc
    finally:
        session.close()


@caja_router.post("/jornada/abrir", response_model=JornadaEstadoOut)
def abrir_jornada_financiera_actual(
    data: JornadaAperturaCreate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("finanzas.jornada_abrir", "finanzas")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        abrir_jornada_actual(session, current_user, data.observacion)
        session.commit()
        return _serializar_estado_jornada(session)
    except HTTPException:
        session.rollback()
        raise
    finally:
        session.close()


@caja_router.get("/jornada/cortes", response_model=List[CorteJornadaOut])
def listar_cortes_jornada_actual(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        jornada = obtener_jornada_actual(session)
        if not jornada:
            return []
        cortes = (
            session.query(CorteJornadaFinanciera)
            .filter(CorteJornadaFinanciera.jornada_id == jornada.id)
            .order_by(CorteJornadaFinanciera.fecha_hora_corte.desc(), CorteJornadaFinanciera.id.desc())
            .limit(40)
            .all()
        )
        return serializar_cortes_jornada_lista(session, jornada, cortes)
    finally:
        session.close()


@caja_router.post("/jornada/cortes", response_model=CorteJornadaOut)
def registrar_corte_jornada_actual(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("finanzas.jornada_corte", "finanzas")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        jornada = require_jornada_abierta(session)
        corte = crear_corte_jornada_actual(session, jornada, current_user)
        session.commit()
        return serializar_corte(session, corte)
    except HTTPException:
        session.rollback()
        raise
    finally:
        session.close()


@caja_router.get("/jornada/cortes/{corte_id}/pdf")
def descargar_corte_jornada_pdf(
    corte_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        corte = session.query(CorteJornadaFinanciera).filter(CorteJornadaFinanciera.id == corte_id).first()
        if not corte:
            raise HTTPException(status_code=404, detail="Corte no encontrado.")

        resumen = construir_resumen_corte(session, corte)
        config = session.query(ConfiguracionEmpresa).first()
        pdf_buffer = generar_pdf_reporte_finanzas(resumen, config, corte.fecha_hora_corte.date(), corte.fecha_hora_corte.date())
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="{_build_corte_filename(corte, "pdf")}"'},
        )
    finally:
        session.close()


@caja_router.get("/jornada/cortes/{corte_id}/excel")
def descargar_corte_jornada_excel(
    corte_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        corte = session.query(CorteJornadaFinanciera).filter(CorteJornadaFinanciera.id == corte_id).first()
        if not corte:
            raise HTTPException(status_code=404, detail="Corte no encontrado.")

        resumen = construir_resumen_corte(session, corte)
        config = session.query(ConfiguracionEmpresa).first()
        excel_buffer = generar_excel_reporte_finanzas(resumen, config, corte.fecha_hora_corte.date(), corte.fecha_hora_corte.date())
        return StreamingResponse(
            excel_buffer,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'inline; filename="{_build_corte_filename(corte, "xlsx")}"'},
        )
    finally:
        session.close()


@caja_router.get("/jornada/pendiente-rendir", response_model=PendienteRendicionOut)
def obtener_pendiente_rendicion_actual(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        jornada = obtener_jornada_actual(session)
        cache = cargar_movimientos_jornada_normalizados(session, jornada) if jornada else None
        return construir_pendiente_rendicion(session, jornada, movimientos_dia_cache=cache)
    finally:
        session.close()


@caja_router.get("/jornada/rendiciones", response_model=List[RendicionJornadaOut])
def listar_rendiciones_jornada_actual(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        jornada = obtener_jornada_actual(session)
        if not jornada:
            return []
        rendiciones = (
            session.query(RendicionJornadaFinanciera)
            .filter(RendicionJornadaFinanciera.jornada_id == jornada.id)
            .order_by(RendicionJornadaFinanciera.fecha_hora_rendicion.desc(), RendicionJornadaFinanciera.id.desc())
            .all()
        )
        return [serializar_rendicion(session, rendicion) for rendicion in rendiciones]
    finally:
        session.close()


@caja_router.post("/jornada/rendiciones", response_model=RendicionJornadaOut)
def registrar_rendicion_jornada_actual(
    data: RendicionJornadaCreate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("finanzas.jornada_rendir", "finanzas")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        jornada = require_jornada_abierta(session)
        rendicion = crear_rendicion_jornada_actual(
            session,
            jornada,
            current_user,
            destinatario_id=data.destinatario_id,
            monto_rendido=data.monto_rendido,
            observacion=data.observacion,
        )
        session.commit()
        return serializar_rendicion(session, rendicion)
    except HTTPException:
        session.rollback()
        raise
    finally:
        session.close()


@caja_router.patch("/jornada/rendiciones/{rendicion_id}", response_model=RendicionJornadaOut)
def editar_rendicion_jornada(
    rendicion_id: int,
    data: RendicionJornadaUpdate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("finanzas.jornada_rendicion_editar", "finanzas")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        rendicion = session.query(RendicionJornadaFinanciera).filter(RendicionJornadaFinanciera.id == rendicion_id).first()
        if not rendicion:
            raise HTTPException(status_code=404, detail="Rendicion no encontrada.")

        rendicion_actualizada = actualizar_rendicion_jornada(
            session,
            rendicion,
            current_user,
            fecha_hora_rendicion=data.fecha_hora_rendicion,
            destinatario_id=data.destinatario_id,
            monto_rendido=data.monto_rendido,
            observacion=data.observacion,
            motivo_ajuste=data.motivo_ajuste,
        )
        session.commit()
        return serializar_rendicion(session, rendicion_actualizada)
    except HTTPException:
        session.rollback()
        raise
    finally:
        session.close()


@caja_router.get("/jornada/rendiciones/{rendicion_id}", response_model=RendicionJornadaOut)
def obtener_detalle_rendicion_jornada(
    rendicion_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        rendicion = session.query(RendicionJornadaFinanciera).filter(RendicionJornadaFinanciera.id == rendicion_id).first()
        if not rendicion:
            raise HTTPException(status_code=404, detail="Rendicion no encontrada.")
        return serializar_rendicion(session, rendicion)
    finally:
        session.close()


@caja_router.get("/jornada/rendiciones/{rendicion_id}/pdf")
def descargar_rendicion_jornada_pdf(
    rendicion_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        rendicion = session.query(RendicionJornadaFinanciera).filter(RendicionJornadaFinanciera.id == rendicion_id).first()
        if not rendicion:
            raise HTTPException(status_code=404, detail="Rendicion no encontrada.")

        resumen = construir_resumen_rendicion(session, rendicion)
        config = session.query(ConfiguracionEmpresa).first()
        pdf_buffer = generar_pdf_rendicion_jornada(rendicion, resumen, config)
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="{_build_rendicion_filename(rendicion, "pdf")}"'},
        )
    finally:
        session.close()


@caja_router.get("/jornada/rendiciones/{rendicion_id}/excel")
def descargar_rendicion_jornada_excel(
    rendicion_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        rendicion = session.query(RendicionJornadaFinanciera).filter(RendicionJornadaFinanciera.id == rendicion_id).first()
        if not rendicion:
            raise HTTPException(status_code=404, detail="Rendicion no encontrada.")

        resumen = construir_resumen_rendicion(session, rendicion)
        config = session.query(ConfiguracionEmpresa).first()
        excel_buffer = generar_excel_rendicion_jornada(rendicion, resumen, config)
        return StreamingResponse(
            excel_buffer,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'inline; filename="{_build_rendicion_filename(rendicion, "xlsx")}"'},
        )
    finally:
        session.close()


@caja_router.get("/jornada/historial/jornadas", response_model=List[JornadaHistorialOut])
def listar_historial_jornadas(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
    limit: int = Query(15, ge=1, le=60),
    fecha: Optional[date] = Query(None),
    fecha_desde: Optional[date] = Query(None),
    fecha_hasta: Optional[date] = Query(None),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        query = session.query(JornadaFinanciera)
        if fecha:
            query = query.filter(JornadaFinanciera.fecha == fecha)
        else:
            if fecha_desde:
                query = query.filter(JornadaFinanciera.fecha >= fecha_desde)
            if fecha_hasta:
                query = query.filter(JornadaFinanciera.fecha <= fecha_hasta)
        jornadas = query.order_by(JornadaFinanciera.fecha.desc(), JornadaFinanciera.id.desc()).limit(limit).all()
        return construir_filas_historial_jornadas(session, jornadas)
    finally:
        session.close()


@caja_router.get("/jornada/historial/jornadas/{jornada_id}/pdf")
def descargar_jornada_historica_pdf(
    jornada_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        jornada = session.query(JornadaFinanciera).filter(JornadaFinanciera.id == jornada_id).first()
        if not jornada:
            raise HTTPException(status_code=404, detail="Jornada no encontrada.")
        resumen = construir_resumen_jornada_reporte(session, jornada)
        config = session.query(ConfiguracionEmpresa).first()
        pdf_buffer = generar_pdf_reporte_finanzas(resumen, config, jornada.fecha, jornada.fecha)
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="{_build_jornada_filename(jornada, "pdf")}"'},
        )
    finally:
        session.close()


@caja_router.get("/jornada/historial/jornadas/{jornada_id}/excel")
def descargar_jornada_historica_excel(
    jornada_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        jornada = session.query(JornadaFinanciera).filter(JornadaFinanciera.id == jornada_id).first()
        if not jornada:
            raise HTTPException(status_code=404, detail="Jornada no encontrada.")
        resumen = construir_resumen_jornada_reporte(session, jornada)
        config = session.query(ConfiguracionEmpresa).first()
        excel_buffer = generar_excel_reporte_finanzas(resumen, config, jornada.fecha, jornada.fecha)
        return StreamingResponse(
            excel_buffer,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'inline; filename="{_build_jornada_filename(jornada, "xlsx")}"'},
        )
    finally:
        session.close()


@caja_router.get("/jornada/historial/filtros-opciones")
def obtener_filtros_opciones_rendiciones(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    """Catalogo de destinatarios y usuarios activos para filtros del historial de rendiciones."""
    session = get_session_for_tenant(tenant_slug)
    try:
        destinatarios = (
            session.query(DestinatarioRendicion)
            .order_by(DestinatarioRendicion.activo.desc(), DestinatarioRendicion.nombre.asc())
            .all()
        )
        usuarios = (
            session.query(Usuario)
            .filter(Usuario.activo.is_(True))
            .order_by(Usuario.nombre_completo.asc(), Usuario.email.asc(), Usuario.id.asc())
            .all()
        )
        return {
            "destinatarios": [{"id": d.id, "nombre": d.nombre, "activo": d.activo} for d in destinatarios],
            "usuarios": [
                {"id": u.id, "nombre": (u.nombre_completo or u.email or "").strip() or f"Usuario #{u.id}"}
                for u in usuarios
            ],
        }
    finally:
        session.close()


@caja_router.get("/jornada/destinatarios-rendicion", response_model=List[DestinatarioRendicionOut])
def listar_destinatarios_rendicion(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        return (
            session.query(DestinatarioRendicion)
            .order_by(DestinatarioRendicion.activo.desc(), DestinatarioRendicion.nombre.asc())
            .all()
        )
    finally:
        session.close()


@caja_router.post("/jornada/destinatarios-rendicion", response_model=DestinatarioRendicionOut)
def crear_destinatario_rendicion(
    data: DestinatarioRendicionCreate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_admin),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        existe = (
            session.query(DestinatarioRendicion)
            .filter(func.lower(func.trim(DestinatarioRendicion.nombre)) == data.nombre.strip().lower())
            .first()
        )
        if existe:
            raise HTTPException(status_code=400, detail="Ya existe un destinatario con ese nombre.")
        row = DestinatarioRendicion(nombre=data.nombre.strip(), activo=True)
        session.add(row)
        session.commit()
        session.refresh(row)
        return row
    except HTTPException:
        session.rollback()
        raise
    finally:
        session.close()


@caja_router.patch("/jornada/destinatarios-rendicion/{destinatario_id}", response_model=DestinatarioRendicionOut)
def actualizar_destinatario_rendicion(
    destinatario_id: int,
    data: DestinatarioRendicionUpdate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_admin),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        row = session.query(DestinatarioRendicion).filter(DestinatarioRendicion.id == destinatario_id).first()
        if not row:
            raise HTTPException(status_code=404, detail="Destinatario no encontrado.")
        if data.nombre is not None:
            nombre = data.nombre.strip()
            duplicado = (
                session.query(DestinatarioRendicion)
                .filter(
                    and_(
                        DestinatarioRendicion.id != destinatario_id,
                        func.lower(func.trim(DestinatarioRendicion.nombre)) == nombre.lower(),
                    ),
                )
                .first()
            )
            if duplicado:
                raise HTTPException(status_code=400, detail="Ya existe otro destinatario con ese nombre.")
            row.nombre = nombre
        if data.activo is not None:
            row.activo = data.activo
        session.commit()
        session.refresh(row)
        return row
    except HTTPException:
        session.rollback()
        raise
    finally:
        session.close()


@caja_router.delete("/jornada/destinatarios-rendicion/{destinatario_id}")
def eliminar_destinatario_rendicion(
    destinatario_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_admin),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        row = session.query(DestinatarioRendicion).filter(DestinatarioRendicion.id == destinatario_id).first()
        if not row:
            raise HTTPException(status_code=404, detail="Destinatario no encontrado.")

        usos = (
            session.query(func.count(RendicionJornadaFinanciera.id))
            .filter(RendicionJornadaFinanciera.destinatario_rendicion_id == destinatario_id)
            .scalar()
            or 0
        )
        if usos > 0:
            raise HTTPException(
                status_code=409,
                detail="No se puede eliminar porque ya tiene rendiciones asociadas. Puedes desactivarlo.",
            )

        session.delete(row)
        session.commit()
        return {"ok": True, "message": "Destinatario eliminado correctamente."}
    except HTTPException:
        session.rollback()
        raise
    finally:
        session.close()


@caja_router.get("/jornada/historial/rendiciones", response_model=RendicionHistorialListResponseOut)
def listar_historial_rendiciones(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    search: Optional[str] = Query(None),
    estado: Optional[str] = Query(None),
    jornada_fecha: Optional[date] = Query(None),
    destinatario_id: Optional[int] = Query(None),
    usuario_id: Optional[int] = Query(None),
    fecha_desde: Optional[date] = Query(None),
    fecha_hasta: Optional[date] = Query(None),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        query = (
            session.query(RendicionJornadaFinanciera, JornadaFinanciera.fecha.label("jornada_fecha"))
            .join(JornadaFinanciera, JornadaFinanciera.id == RendicionJornadaFinanciera.jornada_id)
        )

        if estado:
            query = query.filter(RendicionJornadaFinanciera.estado == estado.strip())
        if jornada_fecha:
            query = query.filter(JornadaFinanciera.fecha == jornada_fecha)
        if destinatario_id:
            dest_row = session.query(DestinatarioRendicion).filter(DestinatarioRendicion.id == destinatario_id).first()
            if dest_row:
                nombre_cmp = (dest_row.nombre or "").strip().lower()
                query = query.filter(
                    or_(
                        RendicionJornadaFinanciera.destinatario_rendicion_id == destinatario_id,
                        and_(
                            RendicionJornadaFinanciera.destinatario_rendicion_id.is_(None),
                            func.lower(func.trim(RendicionJornadaFinanciera.rendido_a)) == nombre_cmp,
                        ),
                    )
                )
        if usuario_id:
            query = query.filter(RendicionJornadaFinanciera.usuario_id == usuario_id)
        if fecha_desde:
            query = query.filter(RendicionJornadaFinanciera.fecha_hora_rendicion >= datetime.combine(fecha_desde, time.min))
        if fecha_hasta:
            query = query.filter(RendicionJornadaFinanciera.fecha_hora_rendicion <= datetime.combine(fecha_hasta, time.max))
        if search:
            term = f"%{search.strip()}%"
            query = query.filter(
                or_(
                    RendicionJornadaFinanciera.rendido_a.ilike(term),
                    RendicionJornadaFinanciera.usuario_nombre.ilike(term),
                    RendicionJornadaFinanciera.estado.ilike(term),
                    RendicionJornadaFinanciera.observacion.ilike(term),
                    RendicionJornadaFinanciera.motivo_ajuste.ilike(term),
                )
            )

        total = query.with_entities(func.count(RendicionJornadaFinanciera.id)).scalar() or 0
        total_pages = max(1, (total + page_size - 1) // page_size)
        offset = (page - 1) * page_size
        rows = (
            query.order_by(RendicionJornadaFinanciera.fecha_hora_rendicion.desc(), RendicionJornadaFinanciera.id.desc())
            .offset(offset)
            .limit(page_size)
            .all()
        )

        items = []
        for rendicion, jornada_fecha_value in rows:
            items.append({
                "id": rendicion.id,
                "jornada_id": rendicion.jornada_id,
                "jornada_fecha": jornada_fecha_value,
                "fecha_hora_rendicion": rendicion.fecha_hora_rendicion,
                "usuario_id": rendicion.usuario_id,
                "usuario_nombre": rendicion.usuario_nombre,
                "destinatario_id": rendicion.destinatario_rendicion_id,
                "rendido_a": rendicion.rendido_a,
                "monto_sugerido": float(rendicion.monto_sugerido or 0.0),
                "monto_rendido": float(rendicion.monto_rendido or 0.0),
                "diferencia": float((rendicion.monto_rendido or 0.0) - (rendicion.monto_sugerido or 0.0)),
                "observacion": rendicion.observacion,
                "estado": rendicion.estado,
                "editada": bool(rendicion.fecha_hora_ultima_edicion),
                "fecha_hora_ultima_edicion": rendicion.fecha_hora_ultima_edicion,
                "usuario_ultima_edicion_nombre": rendicion.usuario_ultima_edicion_nombre,
                "motivo_ajuste": rendicion.motivo_ajuste,
            })

        return {
            "items": items,
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": total_pages,
        }
    finally:
        session.close()


@caja_router.get("/jornada/alerta-post-corte-anterior", response_model=MovimientosPosterioresUltimoCorteOut)
def obtener_alerta_post_corte_anterior(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        resultado = obtener_movimientos_posteriores_ultimo_corte(session)
        if not resultado:
            raise HTTPException(status_code=404, detail="No hay movimientos posteriores al ultimo corte.")
        return resultado
    finally:
        session.close()


# ── Rutas con {jornada_id} parametrico: DEBEN ir DESPUÉS de todas las rutas fijas de /jornada ──

@caja_router.post("/jornada/{jornada_id}/rendiciones", response_model=RendicionJornadaOut)
def registrar_rendicion_jornada_historica(
    jornada_id: int,
    data: RendicionJornadaCreate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("finanzas.jornada_rendir", "finanzas")),
):
    """Registra una rendición para una jornada específica por ID (permite rendir jornadas vencidas del historial)."""
    session = get_session_for_tenant(tenant_slug)
    try:
        jornada = session.query(JornadaFinanciera).filter(JornadaFinanciera.id == jornada_id).first()
        if not jornada:
            raise HTTPException(status_code=404, detail="Jornada no encontrada.")
        rendicion = crear_rendicion_jornada_actual(
            session,
            jornada,
            current_user,
            destinatario_id=data.destinatario_id,
            monto_rendido=data.monto_rendido,
            observacion=data.observacion,
        )
        session.commit()
        return serializar_rendicion(session, rendicion)
    except HTTPException:
        session.rollback()
        raise
    finally:
        session.close()


@caja_router.get("/jornada/{jornada_id}/pendiente-rendir", response_model=PendienteRendicionOut)
def obtener_pendiente_rendicion_jornada_historica(
    jornada_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    """Devuelve el monto pendiente de rendir para una jornada específica del historial."""
    session = get_session_for_tenant(tenant_slug)
    try:
        jornada = session.query(JornadaFinanciera).filter(JornadaFinanciera.id == jornada_id).first()
        if not jornada:
            raise HTTPException(status_code=404, detail="Jornada no encontrada.")
        cache = cargar_movimientos_jornada_normalizados(session, jornada)
        return construir_pendiente_rendicion(session, jornada, movimientos_dia_cache=cache)
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
    current_user=Depends(require_action("finanzas.transferencias", "finanzas")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        jornada = require_jornada_abierta(session)
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
            jornada_id=jornada.id,
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
    current_user=Depends(require_action("finanzas.transferencias", "finanzas")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        jornada = require_jornada_abierta(session)
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
                jornada_id=jornada.id,
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
                jornada_id=jornada.id,
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
                jornada_id=jornada.id,
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
                jornada_id=jornada.id,
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
